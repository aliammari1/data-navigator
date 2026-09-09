import { describe, expect, it } from "vitest";
import {
  AUTH_DB_KEY_ENV,
  type AuthDbPlanInput,
  decideAuthDbPlan,
  ENCRYPT_AUTH_DB_FLAG,
  ENCRYPTED_TEMP_SUFFIX,
  getEncryptedTempPath,
  getPlaintextBackupPath,
  isAuthDbEncryptionRequested,
  looksLikePlaintextSqlite,
  normalizeDekHex,
  PLAINTEXT_BACKUP_SUFFIX,
  resolveDekFromEnv,
  SQLITE_PLAINTEXT_MAGIC,
} from "../../src/platform/auth/auth-db-encryption";

/**
 * Pure unit tests for the at-rest auth-DB encryption DECISION logic. The
 * security-critical invariants are:
 *  - encryption is DEFAULT OFF (opt-in only via DN_ENCRYPT_AUTH_DB);
 *  - with the flag OFF the plan is ALWAYS plaintext (prior behavior untouched);
 *  - with the flag ON but no key, we still fall back to plaintext rather than
 *    locking the DB out;
 *  - a destructive migration is only ever planned for a confidently-plaintext,
 *    pre-existing DB.
 */

const VALID_KEY = "a".repeat(64);

describe("isAuthDbEncryptionRequested (DEFAULT OFF)", () => {
  it("is OFF when unset", () => {
    expect(isAuthDbEncryptionRequested({})).toBe(false);
  });

  it("is OFF for empty / disabling values", () => {
    for (const v of ["", "0", "false", "off", "no", "anything-else", " "]) {
      expect(isAuthDbEncryptionRequested({ [ENCRYPT_AUTH_DB_FLAG]: v })).toBe(false);
    }
  });

  it("is ON only for explicit enabling values (case-insensitive, trimmed)", () => {
    for (const v of ["1", "true", "on", "yes", " TRUE ", "On", "YES"]) {
      expect(isAuthDbEncryptionRequested({ [ENCRYPT_AUTH_DB_FLAG]: v })).toBe(true);
    }
  });
});

describe("normalizeDekHex / resolveDekFromEnv", () => {
  it("accepts a 64-char hex key (lowercased)", () => {
    expect(normalizeDekHex("A".repeat(64))).toBe("a".repeat(64));
    expect(normalizeDekHex(`  ${VALID_KEY}  `)).toBe(VALID_KEY);
  });

  it("rejects wrong length / non-hex / undefined", () => {
    expect(normalizeDekHex(undefined)).toBeNull();
    expect(normalizeDekHex("")).toBeNull();
    expect(normalizeDekHex("a".repeat(63))).toBeNull();
    expect(normalizeDekHex("a".repeat(65))).toBeNull();
    expect(normalizeDekHex(`z${"a".repeat(63)}`)).toBeNull();
  });

  it("resolves from the env var", () => {
    expect(resolveDekFromEnv({ [AUTH_DB_KEY_ENV]: VALID_KEY })).toBe(VALID_KEY);
    expect(resolveDekFromEnv({})).toBeNull();
  });
});

describe("decideAuthDbPlan", () => {
  const base: AuthDbPlanInput = {
    databaseExists: false,
    isAlreadyEncrypted: false,
    key: VALID_KEY,
    encryptionRequested: true,
  };

  it("flag OFF → plaintext (prior behavior), regardless of key/db", () => {
    const plan = decideAuthDbPlan({
      ...base,
      encryptionRequested: false,
      databaseExists: true,
      key: VALID_KEY,
    });
    expect(plan).toEqual({ mode: "plaintext", reason: "flag-off" });
  });

  it("flag ON + no key → plaintext (refuse to lock out the DB)", () => {
    const plan = decideAuthDbPlan({ ...base, key: null });
    expect(plan).toEqual({ mode: "plaintext", reason: "no-key" });
  });

  it("flag ON + key + no existing DB → encrypted, no migration", () => {
    const plan = decideAuthDbPlan({ ...base, databaseExists: false });
    expect(plan).toEqual({ mode: "encrypted", key: VALID_KEY, needsMigration: false });
  });

  it("flag ON + key + already-encrypted DB → encrypted, no migration", () => {
    const plan = decideAuthDbPlan({
      ...base,
      databaseExists: true,
      isAlreadyEncrypted: true,
    });
    expect(plan).toEqual({ mode: "encrypted", key: VALID_KEY, needsMigration: false });
  });

  it("flag ON + key + existing PLAINTEXT DB → encrypted WITH migration", () => {
    const plan = decideAuthDbPlan({
      ...base,
      databaseExists: true,
      isAlreadyEncrypted: false,
    });
    expect(plan).toEqual({ mode: "encrypted", key: VALID_KEY, needsMigration: true });
  });
});

describe("backup / temp path derivation", () => {
  it("appends the documented suffixes", () => {
    const dbPath = "/data/data-navigator-auth.sqlite";
    expect(getPlaintextBackupPath(dbPath)).toBe(`${dbPath}${PLAINTEXT_BACKUP_SUFFIX}`);
    expect(getEncryptedTempPath(dbPath)).toBe(`${dbPath}${ENCRYPTED_TEMP_SUFFIX}`);
    expect(PLAINTEXT_BACKUP_SUFFIX).toBe(".plaintext.bak");
    expect(ENCRYPTED_TEMP_SUFFIX).toBe(".enc.tmp");
  });
});

describe("looksLikePlaintextSqlite (migration safety probe)", () => {
  // Real 16-byte SQLite header: the printable magic + a NUL terminator.
  const realHeader = Buffer.concat([
    Buffer.from(SQLITE_PLAINTEXT_MAGIC, "ascii"),
    Buffer.from([0x00]),
  ]);

  it("recognizes the unencrypted SQLite magic header", () => {
    expect(looksLikePlaintextSqlite(realHeader)).toBe(true);
  });

  it("rejects the printable magic WITHOUT the trailing NUL (wrong 16th byte)", () => {
    const noNul = Buffer.concat([
      Buffer.from(SQLITE_PLAINTEXT_MAGIC, "ascii"),
      Buffer.from([0x20]), // space instead of NUL
    ]);
    expect(looksLikePlaintextSqlite(noNul)).toBe(false);
  });

  it("treats encrypted/garbled headers as NOT plaintext (bias to no migration)", () => {
    // SQLCipher encrypts the header, so it won't match the magic string.
    const encrypted = Buffer.from("8f2a91bc00deadbeef8f2a91bc00deadbeef", "hex");
    expect(looksLikePlaintextSqlite(encrypted)).toBe(false);
  });

  it("treats short / empty reads as NOT plaintext", () => {
    expect(looksLikePlaintextSqlite(Buffer.alloc(0))).toBe(false);
    expect(looksLikePlaintextSqlite(Buffer.from("SQLite", "ascii"))).toBe(false);
    // The printable prefix alone (15 bytes, no NUL) is too short.
    expect(looksLikePlaintextSqlite(Buffer.from(SQLITE_PLAINTEXT_MAGIC, "ascii"))).toBe(false);
  });

  it("works with a Uint8Array as well as a Buffer", () => {
    expect(looksLikePlaintextSqlite(new Uint8Array(realHeader))).toBe(true);
  });
});
