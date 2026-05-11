/// <reference lib="webworker" />
/* eslint-disable no-restricted-globals */

/**
 * DuckDB Worker — Electron / local-filesystem edition.
 *
 * Runs DuckDB WASM in-memory. Persistence is handled at the caller level:
 * the renderer exports Parquet bytes from this worker and writes them to the
 * local filesystem via Electron IPC. On startup the caller reads the file and
 * passes the bytes back here to restore tables.
 *
 * All DuckDB operations are serialized through a single connection to prevent
 * concurrent-query races when multiple components issue queries in parallel.
 */

// ─── Singleton state ──────────────────────────────────────────────────────────

let db: import("@duckdb/duckdb-wasm").AsyncDuckDB | null = null;
let conn: import("@duckdb/duckdb-wasm").AsyncDuckDBConnection | null = null;
let duckdbWorker: Worker | null = null;
let initPromise: Promise<void> | null = null;

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

      // In-memory mode — no OPFS. Persistence is managed by the caller via
      // exportTableToParquet / loadTableFromParquet using local filesystem IPC.
      await db.open({ path: ":memory:" });

      conn = await db.connect();
    } catch (error) {
      db = null;
      conn = null;
      duckdbWorker = null;
      initPromise = null;
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
  hasHeader = true,
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
        header = ${hasHeader ? "true" : "false"},
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

async function loadCSVFileInternal(
  tableName: string,
  file: File,
  delimiter: string,
  append = false,
  hasHeader = true,
): Promise<void> {
  await ensureInit();
  if (!db || !conn) throw new Error("DuckDB not initialized");

  validateDelimiter(delimiter);

  const suffix = `_${Date.now()}`;
  const fileName = `${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}${suffix}`;

  const duckdb = await import("@duckdb/duckdb-wasm");
  await db.registerFileHandle(
    fileName,
    file,
    duckdb.DuckDBDataProtocol.BROWSER_FILEREADER,
    true,
  );

  try {
    const readExpr = `
      read_csv_auto(
        ${quoteSqlString(fileName)},
        header = ${hasHeader ? "true" : "false"},
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

async function loadJSONFileInternal(
  tableName: string,
  file: File,
): Promise<void> {
  await ensureInit();
  if (!db || !conn) throw new Error("DuckDB not initialized");

  const suffix = `_${Date.now()}`;
  const fileName = `${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}${suffix}`;

  const duckdb = await import("@duckdb/duckdb-wasm");
  await db.registerFileHandle(
    fileName,
    file,
    duckdb.DuckDBDataProtocol.BROWSER_FILEREADER,
    true,
  );

  try {
    await conn.query(
      `CREATE OR REPLACE TABLE ${quoteIdentifier(tableName)} AS
       SELECT * FROM read_json_auto(
         ${quoteSqlString(fileName)},
         ignore_errors = true
       )`,
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
 * Export a table to Parquet and return the raw bytes.
 * The caller (renderer) is responsible for writing them to the local filesystem
 * via Electron IPC.
 */
async function exportTableToParquetInternal(
  tableName: string,
): Promise<ArrayBuffer> {
  await ensureInit();
  if (!db || !conn) throw new Error("DuckDB not initialized");

  const check = await conn.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_name = ${quoteSqlString(tableName)} LIMIT 1`,
  );
  if (check.numRows === 0)
    throw new Error(`Table "${tableName}" does not exist`);

  const fileName = `${tableName}_${Date.now()}.parquet`;
  await conn.query(
    `COPY ${quoteIdentifier(tableName)} TO ${quoteSqlString(fileName)} (FORMAT PARQUET, COMPRESSION ZSTD)`,
  );

  try {
    const bytes = await db.copyFileToBuffer(fileName);
    // Detach the underlying ArrayBuffer for zero-copy transfer via postMessage.
    return bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
  } finally {
    await dropRegisteredFile(fileName);
  }
}

/**
 * Load a table from Parquet bytes supplied by the caller.
 * The caller reads the bytes from the local filesystem via Electron IPC and
 * passes them here.
 */
async function loadTableFromParquetInternal(
  tableName: string,
  buffer: ArrayBuffer,
): Promise<boolean> {
  await ensureInit();
  if (!db || !conn) throw new Error("DuckDB not initialized");

  try {
    const fileName = `${tableName}_restore_${Date.now()}.parquet`;
    await db.registerFileBuffer(fileName, new Uint8Array(buffer));
    try {
      await conn.query(
        `CREATE OR REPLACE TABLE ${quoteIdentifier(tableName)} AS
         SELECT * FROM read_parquet(${quoteSqlString(fileName)})`,
      );
      return true;
    } finally {
      await dropRegisteredFile(fileName);
    }
  } catch {
    return false;
  }
}

async function clearTableInternal(tableName: string): Promise<void> {
  await ensureInit();
  if (!conn) throw new Error("DuckDB connection not initialized");
  await conn.query(`DROP TABLE IF EXISTS ${quoteIdentifier(tableName)}`);
}

async function getStatusInternal(): Promise<{
  opfsPersistenceActive: boolean;
  dbPath: string | null;
}> {
  // OPFS is not used — persistence is via local filesystem (Electron IPC).
  return { opfsPersistenceActive: false, dbPath: null };
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
      hasHeader?: boolean;
    }
  | {
      id: number;
      type: "loadCSVFile";
      tableName: string;
      file: File;
      delimiter: string;
      append?: boolean;
      hasHeader?: boolean;
    }
  | { id: number; type: "loadJSON"; tableName: string; buffer: ArrayBuffer }
  | { id: number; type: "loadJSONFile"; tableName: string; file: File }
  | { id: number; type: "listTables" }
  | { id: number; type: "getTableInfo"; tableName: string }
  | {
      id: number;
      type: "getColumnStats";
      tableName: string;
      columnName: string;
    }
  | { id: number; type: "exportTableToParquet"; tableName: string }
  | {
      id: number;
      type: "loadTableFromParquet";
      tableName: string;
      buffer: ArrayBuffer;
    }
  | { id: number; type: "clearTable"; tableName: string }
  | { id: number; type: "getStatus" };

type OutgoingMsg =
  | { id: number; result: unknown }
  | { id: number; error: { message: string; stack?: string } };

function postResult(
  port: MessagePort | DedicatedWorkerGlobalScope,
  id: number,
  result: unknown,
  transfer?: Transferable[],
): void {
  (port as MessagePort).postMessage(
    { id, result } satisfies OutgoingMsg,
    transfer ?? [],
  );
}

function postError(
  port: MessagePort | DedicatedWorkerGlobalScope,
  id: number,
  error: unknown,
): void {
  (port as MessagePort).postMessage(
    { id, error: serializeError(error) } satisfies OutgoingMsg,
  );
}

async function dispatch(
  msg: IncomingMsg,
  port: MessagePort | DedicatedWorkerGlobalScope,
): Promise<void> {
  try {
    switch (msg.type) {
      case "init":
        await enqueue(() => ensureInit());
        postResult(port, msg.id, null);
        break;

      case "runQuery": {
        const result = await enqueue(() => runQueryInternal(msg.sql));
        postResult(port, msg.id, result);
        break;
      }

      case "loadCSV":
        await enqueue(() =>
          loadCSVInternal(
            msg.tableName,
            new Uint8Array(msg.buffer),
            msg.delimiter,
            msg.append ?? false,
            msg.hasHeader ?? true,
          ),
        );
        postResult(port, msg.id, null);
        break;

      case "loadCSVFile":
        await enqueue(() =>
          loadCSVFileInternal(
            msg.tableName,
            msg.file,
            msg.delimiter,
            msg.append ?? false,
            msg.hasHeader ?? true,
          ),
        );
        postResult(port, msg.id, null);
        break;

      case "loadJSON":
        await enqueue(() =>
          loadJSONInternal(msg.tableName, new Uint8Array(msg.buffer)),
        );
        postResult(port, msg.id, null);
        break;

      case "loadJSONFile":
        await enqueue(() => loadJSONFileInternal(msg.tableName, msg.file));
        postResult(port, msg.id, null);
        break;

      case "listTables": {
        const result = await enqueue(() => listTablesInternal());
        postResult(port, msg.id, result);
        break;
      }

      case "getTableInfo": {
        const result = await enqueue(() => getTableInfoInternal(msg.tableName));
        postResult(port, msg.id, result);
        break;
      }

      case "getColumnStats": {
        const result = await enqueue(() =>
          getColumnStatsInternal(msg.tableName, msg.columnName),
        );
        postResult(port, msg.id, result);
        break;
      }

      case "exportTableToParquet": {
        const buf = await enqueue(() =>
          exportTableToParquetInternal(msg.tableName),
        );
        // Transfer the ArrayBuffer zero-copy back to the caller.
        postResult(port, msg.id, buf, [buf]);
        break;
      }

      case "loadTableFromParquet": {
        const result = await enqueue(() =>
          loadTableFromParquetInternal(msg.tableName, msg.buffer),
        );
        postResult(port, msg.id, result);
        break;
      }

      case "clearTable":
        await enqueue(() => clearTableInternal(msg.tableName));
        postResult(port, msg.id, null);
        break;

      case "getStatus": {
        const result = await getStatusInternal();
        postResult(port, msg.id, result);
        break;
      }

      default: {
        const _exhaustive: never = msg;
        throw new Error(
          `Unsupported message type: ${String((_exhaustive as IncomingMsg).type)}`,
        );
      }
    }
  } catch (error) {
    postError(port, msg.id, error);
  }
}

// ─── SharedWorker entry point ─────────────────────────────────────────────────

type DuckDBWorkerScope =
  | (SharedWorkerGlobalScope & typeof globalThis)
  | (DedicatedWorkerGlobalScope & typeof globalThis);

const workerScope = globalThis as DuckDBWorkerScope;

if ("onconnect" in workerScope) {
  const sharedScope = workerScope as SharedWorkerGlobalScope;

  sharedScope.onconnect = (event: MessageEvent) => {
    const port = (event as MessageEvent & { ports: MessagePort[] }).ports[0];
    port.onmessage = (e: MessageEvent<IncomingMsg>) => dispatch(e.data, port);
    port.start();
  };
} else {
  const dedicatedScope = workerScope as DedicatedWorkerGlobalScope;

  dedicatedScope.onmessage = (event: MessageEvent<IncomingMsg>) =>
    dispatch(event.data, dedicatedScope);
}

export {};