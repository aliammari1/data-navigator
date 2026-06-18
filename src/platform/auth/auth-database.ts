import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  renameSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import {
  decideAuthDbPlan,
  getEncryptedTempPath,
  getPlaintextBackupPath,
  isAuthDbEncryptionRequested,
  looksLikePlaintextSqlite,
  resolveDekFromEnv,
} from "@/platform/auth/auth-db-encryption";
import { AUTH_DB_FILE } from "@/platform/storage/storage-constants";

type AuthDatabaseOptions = {
  appUserData?: string;
  cwd?: string;
};

const AUTH_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS user (
  id text PRIMARY KEY NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  email_verified integer DEFAULT false NOT NULL,
  image text,
  created_at integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  updated_at integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS user_email_unique ON user (email);

CREATE TABLE IF NOT EXISTS session (
  id text PRIMARY KEY NOT NULL,
  expires_at integer NOT NULL,
  token text NOT NULL,
  created_at integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  updated_at integer NOT NULL,
  ip_address text,
  user_agent text,
  user_id text NOT NULL,
  FOREIGN KEY (user_id) REFERENCES user(id) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX IF NOT EXISTS session_token_unique ON session (token);
CREATE INDEX IF NOT EXISTS session_userId_idx ON session (user_id);

CREATE TABLE IF NOT EXISTS account (
  id text PRIMARY KEY NOT NULL,
  account_id text NOT NULL,
  provider_id text NOT NULL,
  user_id text NOT NULL,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at integer,
  refresh_token_expires_at integer,
  scope text,
  password text,
  created_at integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  updated_at integer NOT NULL,
  FOREIGN KEY (user_id) REFERENCES user(id) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX IF NOT EXISTS account_userId_idx ON account (user_id);

CREATE TABLE IF NOT EXISTS verification (
  id text PRIMARY KEY NOT NULL,
  identifier text NOT NULL,
  value text NOT NULL,
  expires_at integer NOT NULL,
  created_at integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  updated_at integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
CREATE INDEX IF NOT EXISTS verification_identifier_idx ON verification (identifier);

CREATE TABLE IF NOT EXISTS app_setting (
  namespace text NOT NULL,
  key text NOT NULL,
  value text NOT NULL,
  created_at integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  updated_at integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  PRIMARY KEY (namespace, key)
);
CREATE INDEX IF NOT EXISTS app_setting_namespace_idx ON app_setting (namespace);
`;

export function getAuthDatabasePath(options: AuthDatabaseOptions = {}) {
  const runtimeDataDir = options.appUserData
    ? path.join(options.appUserData, "data")
    : path.join(options.cwd ?? process.cwd(), ".data");

  return path.join(runtimeDataDir, AUTH_DB_FILE);
}

/**
 * The original, unchanged plaintext open path. Kept as a dedicated helper so the
 * DEFAULT-OFF behavior is provably byte-for-byte identical to the pre-encryption
 * implementation: open with the stock `better-sqlite3` driver, set the same two
 * pragmas in the same order, apply the same schema.
 */
function openPlaintextSqlite(databasePath: string): Database.Database {
  const sqlite = new Database(databasePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(AUTH_SCHEMA_SQL);
  return sqlite;
}

/**
 * Lazily load the encrypted driver. Imported via `require` (not a top-level
 * import) so that merely importing this module — e.g. during `next build`'s
 * "collect page data" pass under plain Node — never dlopens the encrypted native
 * binary. It is only resolved when the encrypted path is actually taken at
 * runtime, exactly like the lazy reasoning documented for `getAuthDatabase`.
 */
function loadEncryptedDriver(): typeof Database {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("better-sqlite3-multiple-ciphers") as typeof Database;
}

/** Read the leading bytes of a file to probe its SQLite header. Best-effort. */
function readFileHeader(filePath: string, length: number): Buffer | null {
  let fd: number | null = null;
  try {
    fd = openSync(filePath, "r");
    const buffer = Buffer.alloc(length);
    const bytesRead = readSync(fd, buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } catch {
    return null;
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {
        // best-effort close
      }
    }
  }
}

/**
 * Key an encrypted handle with the raw 256-bit DEK and apply the same pragmas +
 * schema as the plaintext path. The DEK is passed as a SQLCipher raw key
 * (`x'<hex>'`) so no KDF is applied to an already-random 256-bit key.
 */
function keyAndPrepareEncrypted(sqlite: Database.Database, keyHex: string): void {
  // Must be the FIRST operation on the connection, before any other SQL.
  sqlite.pragma(`key = "x'${keyHex}'"`);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(AUTH_SCHEMA_SQL);
}

/**
 * SAFE one-time plaintext→encrypted migration. Only invoked when the flag is ON,
 * a key is available, and an existing PLAINTEXT DB was confidently detected.
 *
 * Strategy (never destroys recoverable data):
 *  1. Confirm the source really is plaintext (header probe) — bail otherwise.
 *  2. Copy the plaintext DB to a `.plaintext.bak` backup.
 *  3. Use `sqlcipher_export` into a fresh encrypted temp copy.
 *  4. VERIFY the encrypted copy opens with the key AND a sentinel query reads.
 *  5. Only then atomically swap the temp file in over the original.
 *
 * On ANY error: leave the original plaintext DB in place and KEEP the backup;
 * the caller falls back to opening plaintext so the app still works.
 *
 * @returns true if the DB at `databasePath` is now encrypted; false to fall back.
 */
function migratePlaintextToEncrypted(databasePath: string, keyHex: string): boolean {
  const header = readFileHeader(databasePath, 16);
  if (!header || !looksLikePlaintextSqlite(header)) {
    // Not confidently plaintext — refuse to run a destructive migration.
    return false;
  }

  const backupPath = getPlaintextBackupPath(databasePath);
  const tempPath = getEncryptedTempPath(databasePath);
  const EncryptedDatabase = loadEncryptedDriver();

  // Clean any stale temp from a previously-interrupted attempt.
  try {
    if (existsSync(tempPath)) rmSync(tempPath, { force: true });
  } catch {
    /* best-effort */
  }

  let source: Database.Database | null = null;
  try {
    // 1) Backup the plaintext DB before touching anything.
    copyFileSync(databasePath, backupPath);

    // 2) Export the plaintext contents into a new encrypted file.
    source = new EncryptedDatabase(databasePath);
    const escapedTemp = tempPath.replace(/'/g, "''");
    source.exec(`ATTACH DATABASE '${escapedTemp}' AS encrypted KEY "x'${keyHex}'";`);
    source.exec("SELECT sqlcipher_export('encrypted');");
    source.exec("DETACH DATABASE encrypted;");
    source.close();
    source = null;

    // 3) VERIFY the encrypted copy opens with the key and a sentinel reads.
    const verify = new EncryptedDatabase(tempPath);
    try {
      verify.pragma(`key = "x'${keyHex}'"`);
      // Sentinel: schema_version is always readable on a correctly-keyed DB and
      // throws "file is not a database" when the key is wrong.
      verify.pragma("schema_version");
      verify.prepare("SELECT count(*) AS n FROM sqlite_master").get();
    } finally {
      verify.close();
    }

    // 4) Atomic swap: encrypted temp becomes the live DB. Backup is retained.
    renameSync(tempPath, databasePath);
    return true;
  } catch {
    // Any failure → keep plaintext working, keep the backup, drop the temp.
    try {
      if (source) source.close();
    } catch {
      /* best-effort */
    }
    try {
      if (existsSync(tempPath)) rmSync(tempPath, { force: true });
    } catch {
      /* best-effort */
    }
    return false;
  }
}

export function createAuthDatabase(options: AuthDatabaseOptions = {}) {
  const databasePath = getAuthDatabasePath(options);
  mkdirSync(path.dirname(databasePath), { recursive: true });

  // DEFAULT OFF: when the opt-in flag is not set, take the exact prior plaintext
  // path WITHOUT any extra probing — the OFF branch performs the same I/O as the
  // original implementation. The pure decision logic and the header probe only
  // run once encryption has actually been requested.
  const encryptionRequested = isAuthDbEncryptionRequested();

  let databaseExists = false;
  let isAlreadyEncrypted = false;
  if (encryptionRequested) {
    databaseExists = existsSync(databasePath);
    const header = databaseExists ? readFileHeader(databasePath, 16) : null;
    isAlreadyEncrypted = databaseExists
      ? !looksLikePlaintextSqlite(header ?? Buffer.alloc(0))
      : false;
  }

  const plan = decideAuthDbPlan({
    databaseExists,
    isAlreadyEncrypted,
    key: encryptionRequested ? resolveDekFromEnv() : null,
    encryptionRequested,
  });

  let sqlite: Database.Database;

  if (plan.mode === "plaintext") {
    sqlite = openPlaintextSqlite(databasePath);
  } else {
    // Encrypted path (opt-in). Migrate an existing plaintext DB first; if the
    // migration cannot complete safely, fall back to plaintext so the app still
    // works (the plaintext DB and its backup are left intact).
    let migrated = true;
    if (plan.needsMigration) {
      migrated = migratePlaintextToEncrypted(databasePath, plan.key);
    }

    if (migrated) {
      const EncryptedDatabase = loadEncryptedDriver();
      sqlite = new EncryptedDatabase(databasePath);
      keyAndPrepareEncrypted(sqlite, plan.key);
    } else {
      sqlite = openPlaintextSqlite(databasePath);
    }
  }

  return {
    db: drizzle({ client: sqlite, schema }),
    path: databasePath,
    sqlite,
  };
}

type AuthDatabase = ReturnType<typeof createAuthDatabase>;

let cachedAuthDatabase: AuthDatabase | null = null;

/**
 * Lazily construct (once) the better-sqlite3-backed auth database.
 *
 * Why lazy: `new Database()` dlopens the better-sqlite3 native binary the moment
 * it runs. If we constructed it at module-eval time, merely *importing* anything
 * in this module graph — e.g. during `next build`'s "collect page data" pass,
 * which runs under plain Node — would dlopen a binary that a prior
 * `electron-forge make` may have recompiled for Electron's ABI, crashing the
 * build with `NODE_MODULE_VERSION` mismatch. Deferring the load to the first real
 * query keeps `next build` ABI-agnostic; the native binary is only ever opened at
 * runtime, where the ABI matches the host (Electron in the packaged app, Node in
 * `next dev`/`next start`).
 */
function getAuthDatabase(): AuthDatabase {
  if (!cachedAuthDatabase) {
    cachedAuthDatabase = createAuthDatabase({
      appUserData: process.env.APP_USER_DATA,
    });
  }
  return cachedAuthDatabase;
}

/**
 * A transparent proxy that defers opening the database until a property is first
 * accessed. Methods are bound to the real handle so `this` stays correct for both
 * drizzle and the raw better-sqlite3 instance.
 */
function createLazyHandle<T extends object>(pick: (db: AuthDatabase) => T): T {
  return new Proxy({} as T, {
    get(_target, prop) {
      const handle = pick(getAuthDatabase()) as Record<string | symbol, unknown>;
      const value = handle[prop];
      return typeof value === "function"
        ? (value as (...args: unknown[]) => unknown).bind(handle)
        : value;
    },
    has(_target, prop) {
      return prop in (pick(getAuthDatabase()) as object);
    },
  }) as T;
}

/** Drizzle ORM handle for the auth + app-settings database (lazily opened). */
export const authDb = createLazyHandle((database) => database.db);

/** Raw better-sqlite3 handle (lazily opened). */
export const authSqlite = createLazyHandle((database) => database.sqlite);

/** Resolved on-disk path of the auth database (pure path join — no native load). */
export const authDatabasePath = getAuthDatabasePath({
  appUserData: process.env.APP_USER_DATA,
});
