/**
 * DuckDB Node API Service — Electron main process edition.
 *
 * Replaces the WASM worker (`src/workers/duckdb-shared.worker.ts`) with a
 * native DuckDB instance running in the Electron main process.
 *
 * Design:
 * - Singleton `DuckDBInstance` per database path (lazy init on first call).
 * - 1 write connection + 3 read connections, matching the WASM worker pool.
 * - Write operations are serialized via `enqueueWrite` to prevent lock contention.
 * - Read queries are distributed round-robin across read connections.
 * - File loading is path-based: DuckDB reads local files directly via
 *   `read_csv_auto()`, `read_json_auto()`, `read_parquet()`.
 * - For drag-and-drop / buffer-based loads, data is staged to a temp file first.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { app } from "electron";
import { type DuckDBConnection, DuckDBInstance } from "@duckdb/node-api";

// ─── Singleton state ──────────────────────────────────────────────────────────

let instance: DuckDBInstance | null = null;
let writeConn: DuckDBConnection | null = null;
let readConns: DuckDBConnection[] = [];
let initPromise: Promise<void> | null = null;

// Write operations are serialized to prevent lock contention
let writeQueue: Promise<unknown> = Promise.resolve();

function enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(operation, operation);
  writeQueue = run.catch(() => undefined);
  return run;
}

// Round-robin index for distributing read queries across connections
let readConnIndex = 0;
const READ_CONN_COUNT = 3; // 1 write + 3 read = 4 total

function getReadConnection(): DuckDBConnection {
  if (readConns.length === 0) {
    if (!writeConn) throw new Error("DuckDB connection not initialized");
    return writeConn;
  }
  const conn = readConns[readConnIndex % readConns.length];
  readConnIndex++;
  return conn;
}

function isReadOnlyQuery(sql: string): boolean {
  const trimmed = sql.trim().toUpperCase();
  return (
    trimmed.startsWith("SELECT") ||
    trimmed.startsWith("SHOW") ||
    trimmed.startsWith("DESCRIBE") ||
    trimmed.startsWith("EXPLAIN") ||
    trimmed.startsWith("PRAGMA")
  );
}

// ─── SQL helpers ──────────────────────────────────────────────────────────────

function quoteSqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

// ─── Temp file management ─────────────────────────────────────────────────────

let tempDir: string | null = null;

async function getTempDir(): Promise<string> {
  if (tempDir) return tempDir;
  const base = app.isPackaged
    ? path.join(app.getPath("userData"), "data-navigator", "tmp")
    : path.join(os.tmpdir(), "data-navigator-dev");
  await fs.mkdir(base, { recursive: true });
  tempDir = base;
  return base;
}

async function writeTempFile(name: string, data: ArrayBuffer): Promise<string> {
  const dir = await getTempDir();
  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, Buffer.from(data));
  return filePath;
}

async function cleanTempDir(): Promise<void> {
  if (!tempDir) return;
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch {
    // Non-fatal
  }
  tempDir = null;
}

// ─── DuckDB singleton init ────────────────────────────────────────────────────

async function ensureInit(): Promise<void> {
  if (instance && writeConn) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const dbPath = path.join(
        app.getPath("userData"),
        "data-navigator",
        "duckdb.db",
      );
      await fs.mkdir(path.dirname(dbPath), { recursive: true });

      const threads = String(Math.max(1, os.availableParallelism?.() ?? 4));
      instance = await DuckDBInstance.create(dbPath, { threads });

      // Create write connection + read connection pool
      writeConn = await instance.connect();
      readConns = [];
      for (let i = 0; i < READ_CONN_COUNT; i++) {
        readConns.push(await instance.connect());
      }

      // Apply performance pragmas to ALL connections
      const pragmas = [
        `PRAGMA threads = ${threads}`,
        `PRAGMA enable_progress_bar = false`,
        `PRAGMA memory_limit = '2GB'`,
      ];
      for (const pragma of pragmas) {
        await writeConn.run(pragma);
        for (const rc of readConns) await rc.run(pragma);
      }
    } catch (error) {
      instance = null;
      writeConn = null;
      readConns = [];
      initPromise = null;
      throw error;
    }
  })();

  return initPromise;
}

// ─── Query result conversion ──────────────────────────────────────────────────

async function convertResult(
  conn: DuckDBConnection,
  sql: string,
): Promise<Record<string, unknown>[]> {
  const result = await conn.run(sql);
  return await result.getRowObjectsJS();
}

// ─── Prepared statement cache ─────────────────────────────────────────────────

const MAX_PREPARED_STATEMENTS = 50;

// Prepared statement handle — typed loosely to avoid version-specific API mismatches
interface PreparedStatementHandle {
  statement: {
    bindVarchar(index: number, value: string): void;
    bindInteger(index: number, value: number): void;
    bindDouble(index: number, value: number): void;
    bindBoolean(index: number, value: boolean): void;
    bindNull(index: number): void;
    // run() returns DuckDBMaterializedResult which has async getRowObjectsJS()
    run(): Promise<{
      getRowObjectsJS(): Promise<Record<string, unknown>[]>;
    }>;
    destroySync(): void;
  };
}

const preparedStatements = new Map<string, PreparedStatementHandle>();

function generateStmtId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

async function prepareInternal(sql: string): Promise<string> {
  await ensureInit();
  if (!writeConn) throw new Error("DuckDB connection not initialized");

  if (preparedStatements.size >= MAX_PREPARED_STATEMENTS) {
    const firstKey = preparedStatements.keys().next().value as string;
    preparedStatements.delete(firstKey);
  }

  const stmt = await writeConn.prepare(sql);
  const stmtId = generateStmtId();
  preparedStatements.set(stmtId, { statement: stmt });
  return stmtId;
}

async function runPreparedInternal(
  stmtId: string,
  params: unknown[],
): Promise<Record<string, unknown>[]> {
  await ensureInit();
  const handle = preparedStatements.get(stmtId);
  if (!handle) throw new Error(`Prepared statement ${stmtId} not found`);

  const stmt = handle.statement;
  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    const idx = i + 1; // DuckDB uses 1-based parameter indexing
    if (param === null || param === undefined) {
      stmt.bindNull(idx);
    } else if (typeof param === "string") {
      stmt.bindVarchar(idx, param);
    } else if (typeof param === "number") {
      if (Number.isInteger(param)) {
        stmt.bindInteger(idx, param);
      } else {
        stmt.bindDouble(idx, param);
      }
    } else if (typeof param === "boolean") {
      stmt.bindBoolean(idx, param);
    } else {
      stmt.bindVarchar(idx, String(param));
    }
  }

  const result = await stmt.run();
  return await result.getRowObjectsJS();
}

async function disposePreparedInternal(stmtId: string): Promise<void> {
  const handle = preparedStatements.get(stmtId);
  if (!handle) return;
  preparedStatements.delete(stmtId);
  handle.statement.destroySync();
}

// ─── Query Performance Metrics ────────────────────────────────────────────────

export interface QueryMetrics {
  sql: string;
  durationMs: number;
  timestamp: number;
  rowCount: number;
}

const MAX_METRICS = 200;
const queryMetrics: QueryMetrics[] = [];

function truncateSql(sql: string, maxLen = 200): string {
  return sql.length > maxLen ? `${sql.slice(0, maxLen)}...` : sql;
}

function pushMetric(metric: QueryMetrics): void {
  queryMetrics.unshift(metric);
  if (queryMetrics.length > MAX_METRICS) {
    queryMetrics.pop();
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface TableInfo {
  columns: Array<{ name: string; type: string; nullable: boolean }>;
  rowCount: number;
}

export interface ColumnStats {
  min: unknown;
  max: unknown;
  avg: unknown;
  nullCount: number;
  distinctCount: number;
  histogram: Array<{ bucket: string; count: number }>;
}

export interface WorkerStatus {
  opfsPersistenceActive: boolean;
  dbPath: string | null;
}

export async function init(): Promise<void> {
  return ensureInit();
}

export async function runQuery(
  sql: string,
): Promise<Record<string, unknown>[]> {
  const start = performance.now();
  await ensureInit();
  const conn = isReadOnlyQuery(sql) ? getReadConnection() : writeConn;
  if (!conn) throw new Error("DuckDB connection not initialized");

  const rows = await convertResult(conn, sql);
  const duration = performance.now() - start;
  pushMetric({
    sql: truncateSql(sql),
    durationMs: Math.round(duration),
    timestamp: Date.now(),
    rowCount: rows.length,
  });
  return rows;
}

export async function runBatch(
  sqls: string[],
): Promise<Record<string, unknown>[][]> {
  return enqueueWrite(async () => {
    await ensureInit();
    if (!writeConn) throw new Error("DuckDB connection not initialized");

    const results: Record<string, unknown>[][] = [];
    for (const sql of sqls) {
      const rows = await convertResult(writeConn, sql);
      results.push(rows);
    }
    return results;
  });
}

export async function prepare(sql: string): Promise<string> {
  return enqueueWrite(() => prepareInternal(sql));
}

export async function execute(
  stmtId: string,
  params: unknown[],
): Promise<Record<string, unknown>[]> {
  return enqueueWrite(() => runPreparedInternal(stmtId, params));
}

export async function disposePrepared(stmtId: string): Promise<void> {
  return enqueueWrite(() => disposePreparedInternal(stmtId));
}

export async function listTables(): Promise<string[]> {
  const rows = await runQuery("SHOW TABLES");
  return rows.map((row) => String(row.name));
}

export async function getTableInfo(tableName: string): Promise<TableInfo> {
  const quoted = quoteIdentifier(tableName);
  const [columns, rowCountResult] = await Promise.all([
    runQuery(`DESCRIBE ${quoted}`),
    runQuery(`SELECT COUNT(*) AS row_count FROM ${quoted}`),
  ]);

  return {
    columns: columns.map((row) => ({
      name: String(row.column_name ?? row.name),
      type: String(row.column_type ?? row.type),
      nullable: row.null !== "NO" && row.null !== false,
    })),
    rowCount: Number(rowCountResult[0]?.row_count ?? 0),
  };
}

export async function getColumnStats(
  tableName: string,
  columnName: string,
): Promise<ColumnStats> {
  const t = quoteIdentifier(tableName);
  const c = quoteIdentifier(columnName);

  const [basic, distinct, histogram] = await Promise.all([
    runQuery(`
      SELECT
        MIN(${c}) AS min,
        MAX(${c}) AS max,
        AVG(${c}) AS avg,
        COUNT(*) - COUNT(${c}) AS null_count
      FROM ${t}
    `),
    runQuery(`
      SELECT COUNT(DISTINCT ${c}) AS distinct_count FROM ${t}
    `),
    runQuery(`
      SELECT
        ${c} AS bucket,
        COUNT(*) AS count
      FROM ${t}
      WHERE ${c} IS NOT NULL
      GROUP BY ${c}
      ORDER BY count DESC
      LIMIT 20
    `),
  ]);

  const stats = basic[0] ?? {};
  return {
    min: stats.min ?? null,
    max: stats.max ?? null,
    avg: stats.avg ?? null,
    nullCount: Number(stats.null_count ?? 0),
    distinctCount: Number(distinct[0]?.distinct_count ?? 0),
    histogram: histogram.map((row) => ({
      bucket: String(row.bucket),
      count: Number(row.count),
    })),
  };
}

// ─── Path-based file loading ──────────────────────────────────────────────────

export async function loadCSVPath(
  tableName: string,
  filePath: string,
  delimiter = ",",
  append = false,
  hasHeader = true,
): Promise<void> {
  return enqueueWrite(async () => {
    await ensureInit();
    if (!writeConn) throw new Error("DuckDB connection not initialized");

    const t = quoteIdentifier(tableName);
    const headerStr = hasHeader ? "header = true" : "header = false";
    const delimStr = `delim = ${quoteSqlString(delimiter)}`;
    const pathStr = quoteSqlString(filePath);

    if (append) {
      await writeConn.run(
        `INSERT INTO ${t} SELECT * FROM read_csv_auto(${pathStr}, ${headerStr}, ${delimStr})`,
      );
    } else {
      await writeConn.run(
        `CREATE OR REPLACE TABLE ${t} AS SELECT * FROM read_csv_auto(${pathStr}, ${headerStr}, ${delimStr})`,
      );
    }
  });
}

export async function loadJSONPath(
  tableName: string,
  filePath: string,
): Promise<void> {
  return enqueueWrite(async () => {
    await ensureInit();
    if (!writeConn) throw new Error("DuckDB connection not initialized");

    const t = quoteIdentifier(tableName);
    const pathStr = quoteSqlString(filePath);

    await writeConn.run(
      `CREATE OR REPLACE TABLE ${t} AS SELECT * FROM read_json_auto(${pathStr})`,
    );
  });
}

// ─── Buffer-based file loading (stages to temp file first) ────────────────────

export async function loadCSVBuffer(
  tableName: string,
  buffer: ArrayBuffer,
  delimiter = ",",
  append = false,
  hasHeader = true,
): Promise<void> {
  const tempPath = await writeTempFile(
    `csv_${Date.now()}_${Math.random().toString(36).slice(2)}.csv`,
    buffer,
  );
  try {
    await loadCSVPath(tableName, tempPath, delimiter, append, hasHeader);
  } finally {
    try {
      await fs.unlink(tempPath);
    } catch {
      // Non-fatal
    }
  }
}

export async function loadJSONBuffer(
  tableName: string,
  buffer: ArrayBuffer,
): Promise<void> {
  const tempPath = await writeTempFile(
    `json_${Date.now()}_${Math.random().toString(36).slice(2)}.json`,
    buffer,
  );
  try {
    await loadJSONPath(tableName, tempPath);
  } finally {
    try {
      await fs.unlink(tempPath);
    } catch {
      // Non-fatal
    }
  }
}

// ─── Parquet export / import ──────────────────────────────────────────────────

export async function exportTableToParquet(
  tableName: string,
  filePath: string,
): Promise<void> {
  return enqueueWrite(async () => {
    await ensureInit();
    if (!writeConn) throw new Error("DuckDB connection not initialized");

    const t = quoteIdentifier(tableName);
    const p = quoteSqlString(filePath);

    await writeConn.run(`COPY ${t} TO ${p} (FORMAT PARQUET)`);
  });
}

export async function loadTableFromParquet(
  tableName: string,
  filePath: string,
): Promise<void> {
  return enqueueWrite(async () => {
    await ensureInit();
    if (!writeConn) throw new Error("DuckDB connection not initialized");

    const t = quoteIdentifier(tableName);
    const p = quoteSqlString(filePath);

    await writeConn.run(
      `CREATE OR REPLACE TABLE ${t} AS SELECT * FROM read_parquet(${p})`,
    );
  });
}

export async function clearTable(tableName: string): Promise<void> {
  return enqueueWrite(async () => {
    await ensureInit();
    if (!writeConn) throw new Error("DuckDB connection not initialized");

    const t = quoteIdentifier(tableName);
    await writeConn.run(`DROP TABLE IF EXISTS ${t}`);
  });
}

// ─── Status & metrics ─────────────────────────────────────────────────────────

export function getStatus(): WorkerStatus {
  return {
    opfsPersistenceActive: false,
    dbPath: instance ? "active" : null,
  };
}

export function getQueryMetrics(): QueryMetrics[] {
  return queryMetrics.slice();
}

export function clearQueryMetrics(): void {
  queryMetrics.length = 0;
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

export async function close(): Promise<void> {
  // Dispose all prepared statements
  for (const [id, handle] of preparedStatements) {
    handle.statement.destroySync();
    preparedStatements.delete(id);
  }

  // Clear connection references (DuckDBConnection does not expose close())
  readConns = [];
  writeConn = null;
  instance = null;

  initPromise = null;
  await cleanTempDir();
}

// Register cleanup on app quit
app.on("quit", () => {
  close().catch((err) => {
    console.error("[duckdb-service] cleanup error:", err);
  });
});
