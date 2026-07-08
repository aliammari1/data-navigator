import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AUTH_DB_KEY_ENV,
  type SafeStorageLike,
  ENCRYPT_AUTH_DB_ENV,
  ensureAuthDbKeyEnv,
  getWrappedKeyPath,
  isEncryptionEnabledByFlag,
  loadOrCreateWrappedDek,
} from "../../electron/secure-store";

/**
 * Tests for the per-install Data Encryption Key (DEK) lifecycle that backs the
 * at-rest encrypted auth database. The security-critical invariants are:
 *  - the raw DEK is NEVER written in plaintext (only the safeStorage ciphertext);
 *  - we REFUSE to expose a key when OS-backed encryption is unavailable, so the
 *    caller falls back to plaintext instead of persisting a weak key;
 *  - the feature flag can hard-disable exposure;
 *  - an undecryptable wrapped key is NOT silently overwritten.
 */

/**
 * Reversible fake of Electron's safeStorage. "Encryption" is a tagged prefix so
 * we can assert ciphertext is never the raw key, while staying deterministic.
 */
function makeFakeSafeStorage(available = true): SafeStorageLike {
  const PREFIX = "ENC::";
  return {
    isEncryptionAvailable: () => available,
    encryptString: (plain: string) => Buffer.from(`${PREFIX}${plain}`, "utf8"),
    decryptString: (buf: Buffer) => {
      const text = buf.toString("utf8");
      if (!text.startsWith(PREFIX)) throw new Error("undecryptable payload");
      return text.slice(PREFIX.length);
    },
  };
}

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "dn-secure-store-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("isEncryptionEnabledByFlag", () => {
  it("defaults to enabled when unset", () => {
    expect(isEncryptionEnabledByFlag({})).toBe(true);
  });
  it("is disabled for 0/false/off (case-insensitive)", () => {
    for (const v of ["0", "false", "off", "OFF", "False"]) {
      expect(isEncryptionEnabledByFlag({ [ENCRYPT_AUTH_DB_ENV]: v })).toBe(false);
    }
  });
  it("is enabled for any other value", () => {
    expect(isEncryptionEnabledByFlag({ [ENCRYPT_AUTH_DB_ENV]: "1" })).toBe(true);
  });
});

describe("loadOrCreateWrappedDek", () => {
  it("returns null and writes nothing when encryption is unavailable", () => {
    const dek = loadOrCreateWrappedDek(dir, makeFakeSafeStorage(false));
    expect(dek).toBeNull();
    expect(() => readFileSync(getWrappedKeyPath(dir))).toThrow();
  });

  it("generates a 256-bit hex DEK on first run", () => {
    const dek = loadOrCreateWrappedDek(dir, makeFakeSafeStorage());
    expect(dek).toMatch(/^[0-9a-f]{64}$/);
  });

  it("persists the wrapped form, never the bare DEK (real safeStorage encrypts)", () => {
    // The fake "wraps" by prefixing, so we assert the payload is the wrapped
    // form (tagged + not byte-equal to the raw key) rather than re-testing the
    // OS cipher itself. With real Electron safeStorage the on-disk bytes are
    // genuine DPAPI ciphertext that does not contain the key at all.
    const dek = loadOrCreateWrappedDek(dir, makeFakeSafeStorage());
    const onDisk = readFileSync(getWrappedKeyPath(dir), "utf8");
    expect(onDisk).not.toBe(dek);
    expect(onDisk.startsWith("ENC::")).toBe(true);
    expect(onDisk).toBe(`ENC::${dek}`);
  });

  it("is stable across calls (same key returned)", () => {
    const safe = makeFakeSafeStorage();
    const first = loadOrCreateWrappedDek(dir, safe);
    const second = loadOrCreateWrappedDek(dir, safe);
    expect(second).toBe(first);
  });

  it("refuses to overwrite an undecryptable wrapped key", () => {
    const keyPath = getWrappedKeyPath(dir);
    writeFileSync(keyPath, Buffer.from("garbage-not-our-prefix", "utf8"), { mode: 0o600 });
    const dek = loadOrCreateWrappedDek(dir, makeFakeSafeStorage());
    expect(dek).toBeNull();
    // The original bytes must be untouched (we never clobber an existing key).
    expect(readFileSync(keyPath, "utf8")).toBe("garbage-not-our-prefix");
  });
});

describe("ensureAuthDbKeyEnv", () => {
  it("sets the env var to a hex DEK when available", () => {
    const env: Partial<NodeJS.ProcessEnv> = {};
    const dek = ensureAuthDbKeyEnv(dir, makeFakeSafeStorage(), env);
    expect(dek).toMatch(/^[0-9a-f]{64}$/);
    expect(env[AUTH_DB_KEY_ENV]).toBe(dek);
  });

  it("leaves the env var unset when encryption is unavailable", () => {
    const env: Partial<NodeJS.ProcessEnv> = {};
    const dek = ensureAuthDbKeyEnv(dir, makeFakeSafeStorage(false), env);
    expect(dek).toBeNull();
    expect(env[AUTH_DB_KEY_ENV]).toBeUndefined();
  });

  it("does not expose a key when the flag disables encryption", () => {
    const env: Partial<NodeJS.ProcessEnv> = { [ENCRYPT_AUTH_DB_ENV]: "0" };
    const dek = ensureAuthDbKeyEnv(dir, makeFakeSafeStorage(), env);
    expect(dek).toBeNull();
    expect(env[AUTH_DB_KEY_ENV]).toBeUndefined();
  });

  it("respects an operator-provided key already in the env", () => {
    const preset = "a".repeat(64);
    const env: Partial<NodeJS.ProcessEnv> = { [AUTH_DB_KEY_ENV]: preset };
    const dek = ensureAuthDbKeyEnv(dir, makeFakeSafeStorage(), env);
    expect(dek).toBe(preset);
    // No wrapped key file should be created when an explicit key is supplied.
    expect(() => readFileSync(getWrappedKeyPath(dir))).toThrow();
  });
});
