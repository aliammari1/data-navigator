/// <reference lib="webworker" />
/* eslint-disable no-restricted-globals */

/**
 * F25 — SharedWorker: One DuckDB Instance for All Tabs
 *
 * A single DuckDB WASM instance is shared across all currently open tabs.
 * The database is opened against an OPFS-backed file so data survives
 * tab closes and page reloads (as long as the origin's OPFS quota is intact).
 *
 * Guarantees:
 * - Tab A loads a file → Tab B can query it immediately (SharedWorker alive).
 * - Data survives page reload (OPFS primary persistence).
 * - Data survives closing all tabs and reopening (OPFS).
 * - All DuckDB operations are serialized through one connection.
 *
 * Non-guarantees:
 * - Data does not survive clearing site data / DevTools "Clear storage".
 * - OPFS availability varies: Chromium 86+, Firefox 111+, Safari 15.2+.
 *   On unsupported browsers the worker falls back to in-memory mode
 *   and logs a warning — queries still work, but data is not persisted.
 *
 * Build note:
 * Next.js does not automatically bundle SharedWorker entry files.
 * Compile separately:
 *
 *   bun build src/workers/duckdb-shared.worker.ts \
 *     --outfile public/workers/duckdb-shared.worker.js \
 *     --target browser --bundle
 */

// ─── OPFS database path ───────────────────────────────────────────────────────

import { DUCKDB_OPFS_PATH } from "@/lib/storage-constants";

/**
 * Primary OPFS database file — sourced from the central storage-constants module
 * so this path stays consistent across worker and client code.
 */
const OPFS_DB_PATH = DUCKDB_OPFS_PATH;

// ─── Singleton state ──────────────────────────────────────────────────────────

let db: import("@duckdb/duckdb-wasm").AsyncDuckDB | null = null;
let conn: import("@duckdb/duckdb-wasm").AsyncDuckDBConnection | null = null;
let duckdbWorker: Worker | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Whether the database was successfully opened against OPFS.
 * False if the browser does not support OPFS or if the open failed —
 * in that case the database operates in-memory.
 */
let opfsPersistenceActive = false;

/**
 * Serializes all DuckDB operations through the single shared connection.
 * Prevents concurrent queries/loads from multiple tabs from racing.
 */
let operationQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const run = operationQueue.then(operation, operation);
  operationQueue = run.catch(() => undefined);
  return run;
}

// ─── SQL helpers ──────────────────────────────────────────────────────────────

function quoteSqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function createVirtualFileName(ext: "csv" | "json"): string {
  const random =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `upload_${random}.${ext}`;
}

function validateDelimiter(delimiter: string): void {
  if (!delimiter) throw new Error("CSV delimiter cannot be empty");
  if (delimiter.length > 4)
    throw new Error("CSV delimiter is unexpectedly long");
  if (delimiter.includes("\0"))
    throw new Error("CSV delimiter cannot contain null bytes");
}

function serializeError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error)
    return { message: error.message, stack: error.stack };
  return { message: String(error) };
}

async function dropRegisteredFile(fileName: string): Promise<void> {
  if (!db) return;
  const maybeDb = db as unknown as {
    dropFile?: (name: string) => Promise<void>;
  };
  try {
    await maybeDb.dropFile?.(fileName);
  } catch {
    // Non-fatal — virtual file is temporary.
  }
}

// ─── OPFS availability check ──────────────────────────────────────────────────

function opfsAvailable(): boolean {
  try {
    return (
      typeof globalThis !== "undefined" &&
      "navigator" in globalThis &&
      "storage" in
        (globalThis as unknown as { navigator: Navigator }).navigator &&
      typeof (globalThis as unknown as { navigator: Navigator }).navigator
        .storage.getDirectory === "function"
    );
  } catch {
    return false;
  }
}

// ─── DuckDB singleton init ────────────────────────────────────────────────────

async function ensureInit(): Promise<void> {
  if (db && conn) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const duckdb = await import("@duckdb/duckdb-wasm");
      const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());

      const workerUrl = URL.createObjectURL(
        new Blob([`importScripts(${JSON.stringify(bundle.mainWorker)});`], {
          type: "text/javascript",
        }),
      );

      try {
        duckdbWorker = new Worker(workerUrl);
        db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), duckdbWorker);
        await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      } finally {
        URL.revokeObjectURL(workerUrl);
      }

      // ── OPFS primary persistence ───────────────────────────────────────────
      // Open the database against an OPFS-backed file so all tables survive
      // page reloads and tab closes. Falls back to in-memory if OPFS is absent.
      if (opfsAvailable()) {
        try {
          await db.open({
            path: OPFS_DB_PATH,
            accessMode: duckdb.DuckDBAccessMode.READ_WRITE,
            opfs: { fileHandling: "auto" },
          });
          opfsPersistenceActive = true;
          console.info("[duckdb-worker] OPFS persistence active:", OPFS_DB_PATH);
        } catch (opfsErr) {
          // OPFS open failed (e.g. quota, permission, unsupported browser).
          // Fall through to in-memory mode — queries still work.
          console.warn(
            "[duckdb-worker] OPFS open failed, falling back to in-memory mode:",
            opfsErr,
          );
          opfsPersistenceActive = false;
        }
      } else {
        console.warn(
          "[duckdb-worker] OPFS not available in this browser — operating in in-memory mode.",
        );
        opfsPersistenceActive = false;
      }

      conn = await db.connect();
    } catch (error) {
      db = null;
      conn = null;
      duckdbWorker = null;
      initPromise = null;
      opfsPersistenceActive = false;
      throw error;
    }
  })();

  return initPromise;
}

// ─── Internal operations ──────────────────────────────────────────────────────

async function runQueryInternal(
  sql: string,
): Promise<Record<string, unknown>[]> {
  await ensureInit();
  if (!conn) throw new Error("DuckDB connection not initialized");

  const result = await conn.query(sql);
  const fields = result.schema.fields;
  const columnNames = fields.map((field) => field.name);
  const rows: Record<string, unknown>[] = [];

  for (const batch of result.batches) {
    const columns = columnNames.map((_, index) => batch.getChildAt(index));
    for (let rowIndex = 0; rowIndex < batch.numRows; rowIndex++) {
      const row: Record<string, unknown> = {};
      for (let colIdx = 0; colIdx < columnNames.length; colIdx++) {
        row[columnNames[colIdx]] = columns[colIdx]?.get(rowIndex) ?? null;
      }
      rows.push(row);
    }
  }

  return rows;
}

async function loadCSVInternal(
  tableName: string,
  buffer: Uint8Array,
  delimiter: string,
  append = false,
): Promise<void> {
  await ensureInit();
  if (!db || !conn) throw new Error("DuckDB not initialized");

  validateDelimiter(delimiter);

  const fileName = createVirtualFileName("csv");
  await db.registerFileBuffer(fileName, buffer);

  try {
    const readExpr = `
      read_csv_auto(
        ${quoteSqlString(fileName)},
        header = true,
        delim = ${quoteSqlString(delimiter)},
        quote = '"',
        escape = '"',
        strict_mode = false,
        null_padding = true,
        sample_size = 2000,
        parallel = true,
        ignore_errors = true
      )
    `;
    const quotedName = quoteIdentifier(tableName);
    if (append) {
      await conn.query(`INSERT INTO ${quotedName} SELECT * FROM ${readExpr}`);
    } else {
      await conn.query(
        `CREATE OR REPLACE TABLE ${quotedName} AS SELECT * FROM ${readExpr}`,
      );
    }
  } finally {
    await dropRegisteredFile(fileName);
  }
}

/**
 * Load a CSV from a File object using DuckDB's BROWSER_FILEREADER protocol.
 *
 * File is structured-cloneable (extends Blob) so it survives postMessage from
 * the main thread to this SharedWorker. DuckDB's internal worker then reads
 * the file in chunks via Blob.slice().arrayBuffer() — no full copy in WASM heap.
 *
 * This is the preferred path for user-uploaded files: it preserves the original
 * streaming behaviour and avoids materialising the entire file as an ArrayBuffer
 * in the calling context before sending it here.
 *
 * Protocol notes (verified from duckdb-browser.cjs source):
 *   AsyncDuckDB.registerFileHandle(name, file, BROWSER_FILEREADER, true)
 *   → postTask(["REGISTER_FILE_HANDLE", [name, file, proto, directIO]], [])
 *   → DuckDB internal worker stores the File handle
 *   → read_csv_auto calls file.slice(offset, end).arrayBuffer() in chunks
 *
 * Empty transfer list [] means the File is structured-cloned (not transferred),
 * which is correct — File is not Transferable.
 */
async function loadCSVFileInternal(
  tableName: string,
  file: File,
  delimiter: string,
  append = false,
): Promise<void> {
  await ensureInit();
  if (!db || !conn) throw new Error("DuckDB not initialized");

  validateDelimiter(delimiter);

  // Use the original filename as the virtual handle name so DuckDB's
  // type-inference heuristics see the real extension (.csv / .tsv).
  const suffix = `_${Date.now()}`;
  const fileName = `${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}${suffix}`;

  const duckdb = await import("@duckdb/duckdb-wasm");
  await db.registerFileHandle(
    fileName,
    file,
    duckdb.DuckDBDataProtocol.BROWSER_FILEREADER,
    true, // directIO
  );

  try {
    const readExpr = `
      read_csv_auto(
        ${quoteSqlString(fileName)},
        header = true,
        delim = ${quoteSqlString(delimiter)},
        quote = '"',
        escape = '"',
        strict_mode = false,
        null_padding = true,
        sample_size = 2000,
        parallel = true,
        ignore_errors = true
      )
    `;
    const quotedName = quoteIdentifier(tableName);
    if (append) {
      await conn.query(`INSERT INTO ${quotedName} SELECT * FROM ${readExpr}`);
    } else {
      await conn.query(
        `CREATE OR REPLACE TABLE ${quotedName} AS SELECT * FROM ${readExpr}`,
      );
    }
  } finally {
    await dropRegisteredFile(fileName);
  }
}

async function loadJSONInternal(
  tableName: string,
  buffer: Uint8Array,
): Promise<void> {
  await ensureInit();
  if (!db || !conn) throw new Error("DuckDB not initialized");

  const fileName = createVirtualFileName("json");
  await db.registerFileBuffer(fileName, buffer);

  try {
    await conn.query(
      `CREATE OR REPLACE TABLE ${quoteIdentifier(tableName)} AS
       SELECT * FROM read_json_auto(${quoteSqlString(fileName)})`,
    );
  } finally {
    await dropRegisteredFile(fileName);
  }
}

async function listTablesInternal(): Promise<string[]> {
  const rows = await runQueryInternal("SHOW TABLES");
  return rows
    .map((row) => Object.values(row)[0])
    .filter((value): value is string => typeof value === "string");
}

async function getTableInfoInternal(tableName: string): Promise<{
  columns: Array<{ name: string; type: string; nullable: boolean }>;
  rowCount: number;
}> {
  await ensureInit();
  if (!conn) throw new Error("DuckDB connection not initialized");

  const colResult = await conn.query(`DESCRIBE ${quoteIdentifier(tableName)}`);
  const colSchema = colResult.schema.fields;
  const nCols = colSchema.length;
  const colNames = colSchema.map((f) => f.name);
  const columns: Array<{ name: string; type: string; nullable: boolean }> = [];

  for (const batch of colResult.batches) {
    const batchCols = Array.from({ length: nCols }, (_, j) =>
      batch.getChildAt(j),
    );
    for (let i = 0; i < batch.numRows; i++) {
      const row: Record<string, unknown> = {};
      for (let j = 0; j < nCols; j++) {
        row[colNames[j]] = batchCols[j]?.get(i) ?? null;
      }
      columns.push({
        name: String(row.column_name ?? ""),
        type: String(row.column_type ?? ""),
        nullable: String(row.null ?? "").toUpperCase() === "YES",
      });
    }
  }

  const countResult = await conn.query(
    `SELECT COUNT(*) as cnt FROM ${quoteIdentifier(tableName)}`,
  );
  let rowCount = 0;
  for (const batch of countResult.batches) {
    const col = batch.getChildAt(0);
    if (col && batch.numRows > 0) rowCount = Number(col.get(0)) || 0;
  }

  return { columns, rowCount };
}

async function getColumnStatsInternal(
  tableName: string,
  columnName: string,
): Promise<{
  min: unknown;
  max: unknown;
  avg: unknown;
  nullCount: number;
  distinctCount: number;
  histogram: Array<{ bucket: string; count: number }>;
}> {
  await ensureInit();
  if (!conn) throw new Error("DuckDB connection not initialized");

  const statsResult = await conn.query(`
    SELECT
      MIN(${quoteIdentifier(columnName)})                              AS min_val,
      MAX(${quoteIdentifier(columnName)})                              AS max_val,
      AVG(TRY_CAST(${quoteIdentifier(columnName)} AS DOUBLE))         AS avg_val,
      COUNT(*) - COUNT(${quoteIdentifier(columnName)})                AS null_count,
      COUNT(DISTINCT ${quoteIdentifier(columnName)})                  AS distinct_count
    FROM ${quoteIdentifier(tableName)}
  `);

  const stats: Record<string, unknown> = {
    min_val: null,
    max_val: null,
    avg_val: null,
    null_count: 0,
    distinct_count: 0,
  };

  for (const batch of statsResult.batches) {
    if (batch.numRows > 0) {
      const sf = statsResult.schema.fields;
      for (let j = 0; j < sf.length; j++) {
        stats[sf[j].name] = batch.getChildAt(j)?.get(0) ?? null;
      }
    }
  }

  const histResult = await conn.query(`
    SELECT CAST(${quoteIdentifier(columnName)} AS VARCHAR) AS bucket,
           COUNT(*) AS count
    FROM ${quoteIdentifier(tableName)}
    WHERE ${quoteIdentifier(columnName)} IS NOT NULL
    GROUP BY 1 ORDER BY 2 DESC LIMIT 10
  `);

  const histogram: Array<{ bucket: string; count: number }> = [];
  for (const batch of histResult.batches) {
    for (let i = 0; i < batch.numRows; i++) {
      histogram.push({
        bucket: String(batch.getChildAt(0)?.get(i) ?? ""),
        count: Number(batch.getChildAt(1)?.get(i) ?? 0),
      });
    }
  }

  return {
    min: stats.min_val,
    max: stats.max_val,
    avg: stats.avg_val,
    nullCount: Number(stats.null_count),
    distinctCount: Number(stats.distinct_count),
    histogram,
  };
}

/**
 * Export a table to a Parquet snapshot in OPFS.
 * This is an optional snapshot/export operation — not the primary
 * persistence path (which is the OPFS-backed .duckdb file itself).
 * Useful for sharing a snapshot or for external tooling.
 */
async function exportTableToParquetInternal(tableName: string): Promise<void> {
  await ensureInit();
  if (!conn) throw new Error("DuckDB connection not initialized");

  const check = await conn.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_name = ${quoteSqlString(tableName)} LIMIT 1`,
  );
  if (check.numRows === 0) return;

  await conn.query(
    `COPY ${quoteIdentifier(tableName)} TO ${quoteSqlString(`${tableName}.parquet`)} (FORMAT PARQUET, COMPRESSION ZSTD)`,
  );
}

async function loadTableFromParquetInternal(
  tableName: string,
): Promise<boolean> {
  await ensureInit();
  if (!conn) throw new Error("DuckDB connection not initialized");

  try {
    // Check the Parquet file exists in OPFS before querying it.
    const nav = (globalThis as unknown as { navigator: Navigator }).navigator;
    const root = await nav.storage.getDirectory();
    await root.getFileHandle(`${tableName}.parquet`, { create: false });

    await conn.query(
      `CREATE OR REPLACE TABLE ${quoteIdentifier(tableName)} AS
       SELECT * FROM read_parquet(${quoteSqlString(`${tableName}.parquet`)})`,
    );
    return true;
  } catch {
    return false;
  }
}

async function clearTableInternal(tableName: string): Promise<void> {
  await ensureInit();
  if (!conn) throw new Error("DuckDB connection not initialized");

  await conn.query(`DROP TABLE IF EXISTS ${quoteIdentifier(tableName)}`);

  // Best-effort: remove any parquet snapshot from OPFS.
  try {
    const nav = (globalThis as unknown as { navigator: Navigator }).navigator;
    const root = await nav.storage.getDirectory();
    await root.removeEntry(`${tableName}.parquet`).catch(() => {});
  } catch {
    // OPFS not available or file already gone — non-fatal.
  }
}

async function getStatusInternal(): Promise<{
  opfsPersistenceActive: boolean;
  dbPath: string | null;
}> {
  return {
    opfsPersistenceActive,
    dbPath: opfsPersistenceActive ? OPFS_DB_PATH : null,
  };
}

// ─── Message protocol ─────────────────────────────────────────────────────────

type IncomingMsg =
  | { id: number; type: "init" }
  | { id: number; type: "runQuery"; sql: string }
  | {
      id: number;
      type: "loadCSV";
      tableName: string;
      buffer: ArrayBuffer;
      delimiter: string;
      append?: boolean;
    }
  | {
      id: number;
      type: "loadCSVFile";
      tableName: string;
      file: File;
      delimiter: string;
      append?: boolean;
    }
  | { id: number; type: "loadJSON"; tableName: string; buffer: ArrayBuffer }
  | { id: number; type: "listTables" }
  | { id: number; type: "getTableInfo"; tableName: string }
  | {
      id: number;
      type: "getColumnStats";
      tableName: string;
      columnName: string;
    }
  | { id: number; type: "exportTableToParquet"; tableName: string }
  | { id: number; type: "loadTableFromParquet"; tableName: string }
  | { id: number; type: "clearTable"; tableName: string }
  | { id: number; type: "getStatus" };

type OutgoingMsg =
  | { id: number; result: unknown }
  | { id: number; error: { message: string; stack?: string } };

function postResult(port: MessagePort, id: number, result: unknown): void {
  port.postMessage({ id, result } satisfies OutgoingMsg);
}

function postError(port: MessagePort, id: number, error: unknown): void {
  port.postMessage({ id, error: serializeError(error) } satisfies OutgoingMsg);
}

function handlePort(port: MessagePort): void {
  port.onmessage = async (event: MessageEvent<IncomingMsg>) => {
    const msg = event.data;

    try {
      let result: unknown = null;

      switch (msg.type) {
        case "init":
          await enqueue(() => ensureInit());
          break;

        case "runQuery":
          result = await enqueue(() => runQueryInternal(msg.sql));
          break;

        case "loadCSV":
          await enqueue(() =>
            loadCSVInternal(
              msg.tableName,
              new Uint8Array(msg.buffer),
              msg.delimiter,
              msg.append ?? false,
            ),
          );
          break;

        case "loadCSVFile":
          await enqueue(() =>
            loadCSVFileInternal(
              msg.tableName,
              msg.file,
              msg.delimiter,
              msg.append ?? false,
            ),
          );
          break;

        case "loadJSON":
          await enqueue(() =>
            loadJSONInternal(msg.tableName, new Uint8Array(msg.buffer)),
          );
          break;

        case "listTables":
          result = await enqueue(() => listTablesInternal());
          break;

        case "getTableInfo":
          result = await enqueue(() => getTableInfoInternal(msg.tableName));
          break;

        case "getColumnStats":
          result = await enqueue(() =>
            getColumnStatsInternal(msg.tableName, msg.columnName),
          );
          break;

        case "exportTableToParquet":
          await enqueue(() => exportTableToParquetInternal(msg.tableName));
          break;

        case "loadTableFromParquet":
          result = await enqueue(() =>
            loadTableFromParquetInternal(msg.tableName),
          );
          break;

        case "clearTable":
          await enqueue(() => clearTableInternal(msg.tableName));
          break;

        case "getStatus":
          result = await getStatusInternal();
          break;

        default: {
          const _exhaustive: never = msg;
          throw new Error(
            `Unsupported SharedWorker message: ${String((_exhaustive as IncomingMsg).type)}`,
          );
        }
      }

      postResult(port, msg.id, result);
    } catch (error) {
      postError(port, msg.id, error);
    }
  };

  port.start();
}

// ─── SharedWorker entry point ─────────────────────────────────────────────────

const sharedWorkerScope = self as unknown as SharedWorkerGlobalScope;

sharedWorkerScope.onconnect = (event: MessageEvent) => {
  const port = event.ports[0];
  if (!port) return;
  handlePort(port);
};
