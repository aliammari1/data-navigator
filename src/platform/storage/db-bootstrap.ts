/**
 * Shared better-sqlite3 + Drizzle bootstrap.
 *
 * Three call-sites (`auth-database.ts`, `settings-store.ts`, `chat-store.ts`)
 * used to repeat the same four lines:
 *
 *   const sqlite = new Database(path);
 *   sqlite.pragma("journal_mode = WAL");
 *   sqlite.pragma("foreign_keys = ON");
 *   sqlite.exec(SCHEMA_SQL);   // or drizzle migrate() in step 2
 *
 * Plus, for the auth DB, the SQLCipher `key = "x'...'"` PRAGMA has to run
 * BEFORE the migration (the encrypted DB rejects any non-key SQL until keyed).
 * This helper centralises that dance and gives every call-site a uniform
 * `{ db, sqlite, path }` handle.
 *
 * Scope: pure, no `electron` import. Safe to call from main, renderer-side
 * Node contexts, and unit tests.
 */

import type Database from "better-sqlite3";
import { type BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

/** Minimal Drizzle schema shape — a record of table objects keyed by name. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Schema = Record<string, any>;

export type SqliteHandleOptions<S extends Schema> = {
  /** Absolute path to the .db file (caller is responsible for mkdir of the dir). */
  path: string;
  /** Drizzle schema (the same object you would pass to `drizzle({ schema })`). */
  schema: S;
  /**
   * Custom Database constructor. Use this for SQLCipher
   * (`better-sqlite3-multiple-ciphers`) or any driver swap. Defaults to
   * `better-sqlite3`.
   */
  driver?: typeof Database;
  /**
   * First-connection hooks — run BEFORE standard PRAGMAs and BEFORE
   * migrations. SQLCipher uses this to issue `pragma("key = ...")` which must
   * be the very first statement on an encrypted connection.
   */
  prePragmas?: (sqlite: Database.Database) => void;
  /**
   * Whether to apply the standard PRAGMAs (journal_mode = WAL,
   * foreign_keys = ON). Default `true`. Set `false` for read-only or
   * special-purpose handles (the legacy settings lift opens the source DB
   * read-only and skips them).
   */
  applyPragmas?: boolean;
  /**
   * Open the database in read-only mode (passed through to the better-sqlite3
   * constructor). Default `false`. Used by the legacy settings lift to read
   * a pre-Drizzle auth DB without risking writes.
   */
  readonly?: boolean;
  /**
   * Drizzle migrations folder (the output of `drizzle-kit generate`). When
   * provided, runs `migrate(db, { migrationsFolder })` after PRAGMAs are
   * applied. Omit to skip — callers that want to run their own DDL (e.g. a
   * raw `CREATE TABLE IF NOT EXISTS` until the migration is generated) can
   * do so on the returned `sqlite` handle.
   */
  migrationsFolder?: string;
};

export type SqliteHandle<S extends Schema> = {
  /** Drizzle ORM handle. The hot path for queries. */
  db: BetterSQLite3Database<S>;
  /** Underlying better-sqlite3 handle. Escape hatch for raw SQL / PRAGMAs. */
  sqlite: Database.Database;
  /** Resolved on-disk path. */
  path: string;
};

class NodeSqliteAdapter {
  readonly #raw: import("node:sqlite").DatabaseSync;

  constructor(databasePath: string) {
    const sqliteModule = process.getBuiltinModule?.("node:sqlite") as
      | typeof import("node:sqlite")
      | undefined;
    if (!sqliteModule?.DatabaseSync) {
      throw new Error("node:sqlite is not supported in this Node.js runtime");
    }
    this.#raw = new sqliteModule.DatabaseSync(databasePath);
  }

  pragma(str: string): void {
    try {
      this.#raw.exec(`PRAGMA ${str}`);
    } catch {
      // best-effort pragma
    }
  }

  exec(sqlStr: string): void {
    this.#raw.exec(sqlStr);
  }

  prepare(sqlStr: string) {
    const raw = this.#raw;
    function createStmt(returnArrays = false) {
      const s = raw.prepare(sqlStr);
      if (returnArrays) {
        s.setReturnArrays(true);
      }
      return {
        run: (...args: unknown[]) => s.run(...(args as Parameters<typeof s.run>)),
        get: (...args: unknown[]) => s.get(...(args as Parameters<typeof s.get>)),
        all: (...args: unknown[]) => s.all(...(args as Parameters<typeof s.all>)),
        raw: () => createStmt(true),
      };
    }
    return createStmt(false);
  }

  transaction<T extends (...args: unknown[]) => unknown>(fn: T) {
    return (...args: Parameters<T>): ReturnType<T> => {
      this.#raw.exec("BEGIN");
      try {
        const res = fn(...args) as ReturnType<T>;
        this.#raw.exec("COMMIT");
        return res;
      } catch (err) {
        this.#raw.exec("ROLLBACK");
        throw err;
      }
    };
  }

  close(): void {
    this.#raw.close();
  }
}

export function createSqliteConnection(
  databasePath: string,
  options?: Database.Options,
  customDriver?: typeof Database,
): Database.Database {
  if (customDriver) {
    return new customDriver(databasePath, options);
  }
  try {
    const Driver = require("better-sqlite3");
    return new Driver(databasePath, options);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "ERR_DLOPEN_FAILED"
    ) {
      return new NodeSqliteAdapter(databasePath) as unknown as Database.Database;
    }
    throw error;
  }
}

/**
 * Open a SQLite database, run any SQLCipher key PRAGMA, apply the standard
 * PRAGMAs, run migrations, and return the Drizzle + raw handles.
 *
 * Never throws on a missing file — the underlying driver creates the file.
 * The caller is responsible for ensuring the parent directory exists.
 */
export function openSqliteHandle<S extends Schema>(opts: SqliteHandleOptions<S>): SqliteHandle<S> {
  const sqliteOptions: Database.Options = {};
  if (opts.readonly) sqliteOptions.readonly = true;
  const sqlite = createSqliteConnection(opts.path, sqliteOptions, opts.driver);

  if (opts.prePragmas) {
    opts.prePragmas(sqlite);
  }

  if (opts.applyPragmas !== false) {
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
  }

  const db = drizzle({ client: sqlite, schema: opts.schema });

  if (opts.migrationsFolder) {
    migrate(db, { migrationsFolder: opts.migrationsFolder });
  }

  return { db, sqlite, path: opts.path };
}
