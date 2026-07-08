import crypto from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Per-install Data Encryption Key (DEK) management for the at-rest encrypted
 * auth / app_setting SQLite database.
 *
 * Design goals (mirrors the proven `ensureAuthSecretEnv` pattern in
 * `electron/security.ts`):
 *  - The raw 256-bit DEK is generated ONCE per install and never lives on disk
 *    in plaintext. It is wrapped (encrypted) by Electron `safeStorage` — DPAPI
 *    on Windows, Keychain on macOS, libsecret on Linux — and the *ciphertext* is
 *    persisted (0600) inside userData.
 *  - The wrapped key file is useless without the OS user's login secret, so an
 *    attacker with raw file access (stolen disk image, backup) cannot read it.
 *  - The DEK is surfaced to the Next.js standalone server (which owns the SQLite
 *    driver in `src/platform/auth/auth-database.ts`) via an environment variable
 *    — exactly how `BETTER_AUTH_SECRET` is surfaced — so the auth-database module
 *    never has to import `electron` (which the dependency-cruiser boundary rules
 *    forbid, and which is unavailable when `next build` evaluates that module).
 *
 * Safety invariant: we REFUSE to silently downgrade. If `safeStorage` is
 * unavailable on this platform/session, the DEK is NOT exposed and the
 * environment variable is left unset, so the auth-database layer transparently
 * stays on the plaintext driver instead of writing an unrecoverable,
 * weakly-protected key. Encryption is opt-in *and* self-verifying: it only ever
 * engages when a real, OS-wrapped key is available.
 *
 * This module is the ONLY place that touches `electron.safeStorage`. The pure
 * filesystem helpers below are free of any `electron` import so they can be
 * unit-tested in a plain Node environment, matching the convention in
 * `electron/security.ts`.
 */

/** Env var the Next server reads to obtain the hex-encoded DEK. */
export const AUTH_DB_KEY_ENV = "DN_AUTH_DB_KEY";

/**
 * Feature flag. Encryption is gated so it can be force-disabled in the field
 * without a code change if a regression ever locks a user out:
 *   DN_ENCRYPT_AUTH_DB=0  → never expose the DEK (driver stays plaintext).
 * Any other value (or unset) means "enable when a wrapped key is available".
 */
export const ENCRYPT_AUTH_DB_ENV = "DN_ENCRYPT_AUTH_DB";

/** Filename of the safeStorage-wrapped DEK inside userData (ciphertext, 0600). */
const WRAPPED_KEY_FILE_NAME = "auth-db-key.enc";

/** DEK size: 256 bits, matching SQLCipher's recommended raw-key length. */
const DEK_BYTES = 32;

/**
 * Minimal structural type of the bits of Electron's `safeStorage` we use, so
 * this module can be unit-tested with a fake and so it carries no hard
 * `electron` type dependency at the boundary.
 */
export type SafeStorageLike = {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
};

/** Resolve the on-disk path of the wrapped DEK (pure path join — no I/O). */
export function getWrappedKeyPath(userDataDir: string): string {
  return path.join(path.resolve(userDataDir), WRAPPED_KEY_FILE_NAME);
}

/** True unless the feature flag is explicitly set to a disabling value. */
export function isEncryptionEnabledByFlag(env: Partial<NodeJS.ProcessEnv> = process.env): boolean {
  const raw = env[ENCRYPT_AUTH_DB_ENV];
  if (raw === undefined) return true;
  const normalized = raw.trim().toLowerCase();
  return normalized !== "0" && normalized !== "false" && normalized !== "off";
}

/**
 * Load the per-install DEK as a hex string, generating + wrapping one on first
 * run. Returns `null` (and writes nothing) when encryption is unavailable, so
 * the caller can fall back to plaintext WITHOUT persisting an unwrapped key.
 *
 * Pure w.r.t. `electron`: the `safeStorage` instance is injected, so this is
 * unit-testable with a fake. All filesystem effects are confined to `userDataDir`.
 */
export function loadOrCreateWrappedDek(
  userDataDir: string,
  safeStorage: SafeStorageLike,
): string | null {
  // Refuse to silently downgrade: with no OS-backed encryption, we never write a
  // key at all (a plaintext key on disk would be security theatre).
  if (!safeStorage.isEncryptionAvailable()) {
    return null;
  }

  const keyPath = getWrappedKeyPath(userDataDir);

  if (existsSync(keyPath)) {
    try {
      const wrapped = readFileSync(keyPath);
      const hex = safeStorage.decryptString(wrapped).trim();
      if (/^[0-9a-f]{64}$/i.test(hex)) {
        return hex.toLowerCase();
      }
      // Corrupt/short payload: fall through and regenerate. (On a pre-existing
      // encrypted DB this would be unrecoverable, but on first-key creation it is
      // safe; the auth-database migration layer never deletes a verified DB.)
    } catch {
      // Undecryptable (e.g. OS keychain changed): do NOT overwrite — refuse to
      // hand back a key we cannot validate, so the caller stays on plaintext
      // rather than risking a mismatched key against an existing encrypted DB.
      return null;
    }
  }

  const dekHex = crypto.randomBytes(DEK_BYTES).toString("hex");
  const wrapped = safeStorage.encryptString(dekHex);

  mkdirSync(path.dirname(keyPath), { recursive: true });
  writeFileSync(keyPath, wrapped, { mode: 0o600 });

  return dekHex;
}

/**
 * Ensure `process.env[AUTH_DB_KEY_ENV]` carries the hex DEK, returning it (or
 * `null` if encryption is disabled/unavailable). Idempotent. Intended to be
 * called from `electron/main.ts` BEFORE the Next server boots, right next to
 * `ensureAuthSecretEnv`.
 *
 * The `safeStorage` argument is injected by the caller (`electron.safeStorage`)
 * so this file never imports `electron` directly, keeping it unit-testable.
 */
export function ensureAuthDbKeyEnv(
  userDataDir: string,
  safeStorage: SafeStorageLike,
  env: Partial<NodeJS.ProcessEnv> = process.env,
): string | null {
  // Respect an explicit operator-provided key (e.g. for tests / recovery).
  const existing = env[AUTH_DB_KEY_ENV];
  if (existing && /^[0-9a-f]{64}$/i.test(existing.trim())) {
    return existing.trim().toLowerCase();
  }

  if (!isEncryptionEnabledByFlag(env)) {
    return null;
  }

  const dekHex = loadOrCreateWrappedDek(userDataDir, safeStorage);
  if (dekHex) {
    env[AUTH_DB_KEY_ENV] = dekHex;
  }
  return dekHex;
}
