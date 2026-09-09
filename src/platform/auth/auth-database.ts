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
import type Database from "better-sqlite3";
import * as schema from "@/db/schema";
import {
  decideAuthDbPlan,
  getEncryptedTempPath,
  getPlaintextBackupPath,
  isAuthDbEncryptionRequested,
  looksLikePlaintextSqlite,
  resolveDekFromEnv,
} from "@/platform/auth/auth-db-encryption";
import { openSqliteHandle } from "@/platform/storage/db-bootstrap";
import { AUTH_DB_FILE } from "@/platform/storage/storage-constants";

type AuthDatabaseOptions = {
  appUserData?: string;
  cwd?: string;
};

export function getAuthDatabasePath(options: AuthDatabaseOptions = {}) {
  const appUserData = options.appUserData ?? process.env.APP_USER_DATA;
  const runtimeDataDir = appUserData
    ? path.join(appUserData, "databases")
    : path.join(options.cwd ?? process.cwd(), ".data");

  return path.join(runtimeDataDir, AUTH_DB_FILE);
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

  const migrationsFolder = path.join(options.cwd ?? process.cwd(), "drizzle");

  if (plan.mode === "plaintext") {
    const handle = openSqliteHandle({
      path: databasePath,
      schema,
      migrationsFolder,
    });
    return {
      db: handle.db,
      path: databasePath,
      sqlite: handle.sqlite,
    };
  }

  // Encrypted path (opt-in). Migrate an existing plaintext DB first; if the
  // migration cannot complete safely, fall back to plaintext so the app still
  // works (the plaintext DB and its backup are left intact).
  let migrated = true;
  if (plan.needsMigration) {
    migrated = migratePlaintextToEncrypted(databasePath, plan.key);
  }

  if (migrated) {
    const EncryptedDatabase = loadEncryptedDriver();
    const handle = openSqliteHandle({
      path: databasePath,
      schema,
      driver: EncryptedDatabase,
      prePragmas: (sqlite) => {
        sqlite.pragma(`key = "x'${plan.key}'"`);
      },
      migrationsFolder,
    });
    return {
      db: handle.db,
      path: databasePath,
      sqlite: handle.sqlite,
    };
  }

  const handle = openSqliteHandle({
    path: databasePath,
    schema,
    migrationsFolder,
  });
  return {
    db: handle.db,
    path: databasePath,
    sqlite: handle.sqlite,
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
