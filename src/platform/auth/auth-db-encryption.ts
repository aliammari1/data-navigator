/**
 * Pure decision logic for the at-rest-encrypted auth database.
 *
 * This module is intentionally free of any `electron`, `better-sqlite3`,
 * `better-sqlite3-multiple-ciphers`, or filesystem-mutation imports so it can be
 * unit-tested in a plain jsdom/Node environment (matching the convention used by
 * `electron/secure-store.ts`). It answers the questions:
 *
 *   1. Should we open the database with the encrypted driver at all?
 *   2. If so, does an existing PLAINTEXT database need a one-time migration to
 *      the encrypted format, and where should the safety backup live?
 *
 * The actual native work (opening the DB, keying it, `sqlcipher_export`, swap)
 * lives in `auth-database.ts`, which consumes the decisions produced here.
 *
 * Safety invariant mirrored from the task spec: encryption is OPT-IN, gated
 * behind `DN_ENCRYPT_AUTH_DB=1`, DEFAULT OFF. When OFF, the caller must take the
 * byte-for-byte prior plaintext path. When ON but no key is available, the
 * caller must also fall back to plaintext rather than write an unkeyed/locked DB.
 */

/** Env var that opts INTO at-rest encryption of the auth DB. DEFAULT OFF. */
export const ENCRYPT_AUTH_DB_FLAG = "DN_ENCRYPT_AUTH_DB";

/** Env var the Next server reads to obtain the hex DEK (set by secure-store). */
export const AUTH_DB_KEY_ENV = "DN_AUTH_DB_KEY";

/** Suffix appended to the DB path for the pre-migration plaintext backup. */
export const PLAINTEXT_BACKUP_SUFFIX = ".plaintext.bak";

/** Suffix for the temporary encrypted copy produced before the atomic swap. */
export const ENCRYPTED_TEMP_SUFFIX = ".enc.tmp";

/**
 * Strict OPT-IN check: encryption engages ONLY when the flag is explicitly set
 * to an enabling value. Unlike `secure-store`'s `isEncryptionEnabledByFlag`
 * (which defaults ON when a wrapped key exists), this gate is DEFAULT OFF so the
 * live app's auth DB is never touched until the user opts in.
 *
 * Enabling values (case-insensitive, trimmed): "1", "true", "on", "yes".
 * Everything else — including unset — means OFF.
 */
export function isAuthDbEncryptionRequested(
  env: Partial<NodeJS.ProcessEnv> = process.env,
): boolean {
  const raw = env[ENCRYPT_AUTH_DB_FLAG];
  if (raw === undefined) return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "on" || normalized === "yes";
}

/** Validate a hex DEK shape (256-bit / 64 hex chars). Returns the lowercased key or null. */
export function normalizeDekHex(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return /^[0-9a-f]{64}$/i.test(trimmed) ? trimmed.toLowerCase() : null;
}

/** Resolve the DEK from the environment, if present and well-formed. */
export function resolveDekFromEnv(env: Partial<NodeJS.ProcessEnv> = process.env): string | null {
  return normalizeDekHex(env[AUTH_DB_KEY_ENV]);
}

/** The concrete driver/path plan the caller should execute. */
export type AuthDbPlan =
  | {
      /** Open with the stock `better-sqlite3` plaintext driver (prior behavior). */
      readonly mode: "plaintext";
      readonly reason: "flag-off" | "no-key";
    }
  | {
      /** Open with the encrypted driver; possibly migrate first. */
      readonly mode: "encrypted";
      readonly key: string;
      /** When true, an existing plaintext DB must be migrated before opening. */
      readonly needsMigration: boolean;
    };

/** Inputs needed to decide the driver/migration plan (all pure values). */
export type AuthDbPlanInput = {
  /** Whether a plaintext DB file already exists at the target path. */
  readonly databaseExists: boolean;
  /** Whether the file at the target path is already encrypted (best-effort probe). */
  readonly isAlreadyEncrypted: boolean;
  /** The resolved DEK (hex) or null when unavailable. */
  readonly key: string | null;
  /** The encryption opt-in flag result. */
  readonly encryptionRequested: boolean;
};

/**
 * Decide which driver to use and whether a one-time plaintext→encrypted
 * migration is required. Pure: no I/O, fully unit-testable.
 *
 * Decision table:
 *  - flag OFF                         → plaintext (prior behavior, untouched)
 *  - flag ON, no key                  → plaintext (refuse to lock the DB out)
 *  - flag ON, key, no existing DB     → encrypted, fresh (no migration)
 *  - flag ON, key, encrypted DB exists→ encrypted, no migration
 *  - flag ON, key, plaintext DB exists→ encrypted, migrate first
 */
export function decideAuthDbPlan(input: AuthDbPlanInput): AuthDbPlan {
  if (!input.encryptionRequested) {
    return { mode: "plaintext", reason: "flag-off" };
  }
  if (!input.key) {
    return { mode: "plaintext", reason: "no-key" };
  }
  const needsMigration = input.databaseExists && !input.isAlreadyEncrypted;
  return { mode: "encrypted", key: input.key, needsMigration };
}

/** Where the pre-migration plaintext backup is written for a given DB path. */
export function getPlaintextBackupPath(databasePath: string): string {
  return `${databasePath}${PLAINTEXT_BACKUP_SUFFIX}`;
}

/** Where the temporary encrypted copy is written before the atomic swap. */
export function getEncryptedTempPath(databasePath: string): string {
  return `${databasePath}${ENCRYPTED_TEMP_SUFFIX}`;
}

/**
 * The printable 15-char prefix of the SQLite file magic. The full on-disk magic
 * is these 15 bytes followed by a single NUL terminator (16 bytes total):
 * "SQLite format 3\0".
 */
export const SQLITE_PLAINTEXT_MAGIC = "SQLite format 3";

/** Total length of the SQLite magic header (printable prefix + NUL byte). */
export const SQLITE_MAGIC_LENGTH = SQLITE_PLAINTEXT_MAGIC.length + 1;

/**
 * Best-effort detection of whether a SQLite file is plaintext. An unencrypted
 * SQLite database begins with the 16-byte magic header "SQLite format 3\0". An
 * encrypted (SQLCipher) database has that header encrypted, so it will NOT start
 * with the magic. We treat "starts with magic" as plaintext and anything else
 * (including a too-short/empty read) as NOT-plaintext, biasing toward NEVER
 * attempting a destructive migration on a file we cannot confidently identify as
 * plaintext.
 */
export function looksLikePlaintextSqlite(headerBytes: Uint8Array | Buffer): boolean {
  if (headerBytes.length < SQLITE_MAGIC_LENGTH) return false;
  for (let i = 0; i < SQLITE_PLAINTEXT_MAGIC.length; i++) {
    if (headerBytes[i] !== SQLITE_PLAINTEXT_MAGIC.charCodeAt(i)) return false;
  }
  // The 16th byte of a real SQLite header is a NUL terminator (0x00).
  return headerBytes[SQLITE_PLAINTEXT_MAGIC.length] === 0;
}
