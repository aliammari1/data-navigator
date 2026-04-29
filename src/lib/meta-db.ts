/**
 * F28 — wa-sqlite Meta Database
 * SQLite in WASM backed by IndexedDB — persistent query history & bookmarks.
 * DuckDB is OLAP; wa-sqlite is for small, frequent metadata writes.
 */

"use client";

import { META_DB_FILE, META_DB_VFS } from "./storage-constants";

export interface QueryHistoryEntry {
  id: number;
  sql: string;
  ran_at: number;
  duration_ms: number | null;
  row_count: number | null;
}

export interface Bookmark {
  id: number;
  label: string;
  sql: string;
  created_at: number;
}

type SQLiteAPI = {
  open_v2(filename: string, flags?: number, zVfs?: string): Promise<number>;
  close(db: number): Promise<number>;
  exec(db: number, sql: string): Promise<number>;
  vfs_register(vfs: object, makeDefault?: boolean): number;
  statements(
    db: number,
    sql: string,
  ): AsyncIterable<{
    step(): Promise<boolean>;
    columns(): string[];
    row(): unknown[];
    finalize(): Promise<void>;
  }>;
};

let _db: number | null = null;
let _api: SQLiteAPI | null = null;
let _initPromise: Promise<void> | null = null;

async function initMetaDB(): Promise<void> {
  if (_db !== null) return;

  try {
    // Dynamic import — only loads when first needed
    const SQLiteESMFactory = (
      await import("wa-sqlite/dist/wa-sqlite-async.mjs" as string)
    ).default as (opts?: object) => Promise<object>;
    const SQLiteModule = (await import("wa-sqlite")) as unknown as {
      Factory: (m: object) => SQLiteAPI;
    };

    // locateFile overrides the path wa-sqlite uses to fetch its .wasm file.
    // Without this, it tries to load from import.meta.url which Turbopack
    // can't resolve to the node_modules binary at runtime.
    const module = await SQLiteESMFactory({
      locateFile: (name: string) => `/wasm/${name}`,
    });
    _api = SQLiteModule.Factory(module);

    // Register IDBBatchAtomicVFS — IndexedDB-backed, persistent, works in any
    // secure context without OPFS/SAB requirements.
    let vfsName: string | undefined;
    try {
      const { IDBBatchAtomicVFS } = (await import(
        "wa-sqlite/src/examples/IDBBatchAtomicVFS.js" as string
      )) as { IDBBatchAtomicVFS: new (name: string) => object };
      const idbVfs = new IDBBatchAtomicVFS(META_DB_VFS);
      _api.vfs_register(idbVfs, false);
      vfsName = META_DB_VFS;
    } catch {
      // Fall back to in-memory VFS — data won't persist across reloads
      console.warn("[meta-db] IDBBatchAtomicVFS unavailable, using in-memory VFS");
    }

    _db = await _api.open_v2(META_DB_FILE, undefined, vfsName);

    await _api.exec(
      _db,
      `CREATE TABLE IF NOT EXISTS query_history (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        sql       TEXT    NOT NULL,
        ran_at    INTEGER NOT NULL,
        duration_ms INTEGER,
        row_count   INTEGER
      );
      CREATE TABLE IF NOT EXISTS bookmarks (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        label      TEXT    NOT NULL,
        sql        TEXT    NOT NULL,
        created_at INTEGER NOT NULL
      );`,
    );
  } catch (err) {
    console.warn("[meta-db] wa-sqlite init failed:", err);
    _db = null;
    _api = null;
  }
}

function getInit(): Promise<void> {
  if (!_initPromise) _initPromise = initMetaDB();
  return _initPromise;
}

export async function addQueryHistory(
  sql: string,
  durationMs: number | null,
  rowCount: number | null,
): Promise<void> {
  await getInit();
  if (_db === null || _api === null) return;
  try {
    await _api.exec(
      _db,
      `INSERT INTO query_history (sql, ran_at, duration_ms, row_count)
       VALUES ('${sql.replace(/'/g, "''")}', ${Date.now()}, ${durationMs ?? "NULL"}, ${rowCount ?? "NULL"})`,
    );
    // Keep only last 200 entries
    await _api.exec(
      _db,
      `DELETE FROM query_history WHERE id NOT IN (
         SELECT id FROM query_history ORDER BY ran_at DESC LIMIT 200
       )`,
    );
  } catch {}
}

export async function getQueryHistory(): Promise<QueryHistoryEntry[]> {
  await getInit();
  if (_db === null || _api === null) return [];
  try {
    const rows: QueryHistoryEntry[] = [];
    for await (const stmt of _api.statements(
      _db,
      "SELECT id, sql, ran_at, duration_ms, row_count FROM query_history ORDER BY ran_at DESC LIMIT 50",
    )) {
      while (await stmt.step()) {
        const [id, sql, ran_at, duration_ms, row_count] = stmt.row();
        rows.push({
          id: id as number,
          sql: sql as string,
          ran_at: ran_at as number,
          duration_ms: duration_ms as number | null,
          row_count: row_count as number | null,
        });
      }
      await stmt.finalize();
    }
    return rows;
  } catch {
    return [];
  }
}

export async function addBookmark(label: string, sql: string): Promise<void> {
  await getInit();
  if (_db === null || _api === null) return;
  try {
    await _api.exec(
      _db,
      `INSERT INTO bookmarks (label, sql, created_at)
       VALUES ('${label.replace(/'/g, "''")}', '${sql.replace(/'/g, "''")}', ${Date.now()})`,
    );
  } catch {}
}

export async function getBookmarks(): Promise<Bookmark[]> {
  await getInit();
  if (_db === null || _api === null) return [];
  try {
    const rows: Bookmark[] = [];
    for await (const stmt of _api.statements(
      _db,
      "SELECT id, label, sql, created_at FROM bookmarks ORDER BY created_at DESC LIMIT 30",
    )) {
      while (await stmt.step()) {
        const [id, label, sql, created_at] = stmt.row();
        rows.push({
          id: id as number,
          label: label as string,
          sql: sql as string,
          created_at: created_at as number,
        });
      }
      await stmt.finalize();
    }
    return rows;
  } catch {
    return [];
  }
}

export async function deleteBookmark(id: number): Promise<void> {
  await getInit();
  if (_db === null || _api === null) return;
  try {
    await _api.exec(_db, `DELETE FROM bookmarks WHERE id = ${id}`);
  } catch {}
}
