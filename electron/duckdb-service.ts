/**
 * DuckDB Node API Service — Electron main process edition.
 *
 * Mental model:
 * - DuckDB runs only in the Electron main process.
 * - Datasets are registered in DuckDB's `app_datasets` catalog table.
 * - CSV files are converted once into managed Parquet cache files.
 * - Parquet cache files are queried through DuckDB views.
 * - The renderer should call dataset-level APIs, not raw table persistence APIs.
 *
 * Public API:
 * - init()
 * - registerCSVPathDataset()
 * - registerParquetPathDataset()
 * - listDatasets()
 * - previewDataset()
 * - summarizeDataset()
 * - exportDataset()
 * - deleteDataset()
 * - getStatus()
 * - getQueryMetrics()
 * - clearQueryMetrics()
 * - close()
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { type DuckDBConnection, DuckDBInstance } from "@duckdb/node-api";
import { app } from "electron";
import { nanoid } from "nanoid";
import PQueue from "p-queue";
import { z } from "zod";
import { type DuckDBColumnTypeLike, encodeColumnsToArrowIPC } from "./duckdb-arrow";
import { recordQueryAnalytics } from "./settings-storage";

// ─── Constants ────────────────────────────────────────────────────────────────

const READ_CONN_COUNT = 3;
const MAX_METRICS = 200;
const DEFAULT_PREVIEW_LIMIT = 100;
const MAX_PREVIEW_LIMIT = 500;
const DEFAULT_CSV_SAMPLE_SIZE = 20_480;
const MAX_CSV_SAMPLE_SIZE = 1_000_000;

// ─── Schemas ──────────────────────────────────────────────────────────────────

const DatasetIdSchema = z.string().regex(/^ds_[A-Za-z0-9_-]{8,32}$/, "Invalid dataset id");

const CsvEncodingSchema = z.enum(["utf-8", "utf-16", "latin-1"]);

const RegisterCSVPathDatasetSchema = z.object({
  filePath: z.string().min(1),
  displayName: z.string().min(1).max(255).optional(),
  hasHeader: z.boolean().optional(),
  delimiter: z.string().min(1).max(4).optional(),
  sampleSize: z.number().int().positive().max(MAX_CSV_SAMPLE_SIZE).optional(),
  previewLimit: z.number().int().positive().max(MAX_PREVIEW_LIMIT).optional(),
  /** Detected/overridden text encoding (the data-import cluster detects it). */
  encoding: CsvEncodingSchema.optional(),
  /** Capture coerced/skipped rows into reject_scans/reject_errors temp tables. */
  storeRejects: z.boolean().optional(),
});

const RegisterParquetPathDatasetSchema = z.object({
  filePath: z.string().min(1),
  displayName: z.string().min(1).max(255).optional(),
  previewLimit: z.number().int().positive().max(MAX_PREVIEW_LIMIT).optional(),
});

const PreviewDatasetSchema = z.object({
  datasetId: DatasetIdSchema,
  limit: z.number().int().positive().max(MAX_PREVIEW_LIMIT).optional(),
  offset: z.number().int().min(0).optional(),
});

const DatasetOnlySchema = z.object({
  datasetId: DatasetIdSchema,
});

const ExportDatasetSchema = z.object({
  datasetId: DatasetIdSchema,
  targetPath: z.string().min(1),
});

// Column identifiers come from the dataset schema. Validate them defensively so
// a malformed column name cannot break out of quoteIdentifier.
const ColumnNameSchema = z.string().min(1).max(255);
const CancelTokenSchema = z.string().min(1).max(128).optional();

const ProfileDatasetSchema = z.object({
  datasetId: DatasetIdSchema,
  cancelToken: CancelTokenSchema,
});

const ProfileColumnDetailSchema = z.object({
  datasetId: DatasetIdSchema,
  column: ColumnNameSchema,
  topK: z.number().int().positive().max(100).optional(),
  binCount: z.number().int().positive().max(200).optional(),
  cancelToken: CancelTokenSchema,
});

const CountRowsSchema = z.object({
  datasetId: DatasetIdSchema,
  where: z.string().max(10_000).optional(),
  force: z.boolean().optional(),
  cancelToken: CancelTokenSchema,
});

const KeysetSortKeySchema = z.object({
  column: ColumnNameSchema,
  direction: z.enum(["ASC", "DESC"]).default("ASC"),
});

const KeysetCursorSchema = z.object({
  sortValues: z.array(z.unknown()),
  rowid: z.number(),
});

const KeysetPageSchema = z.object({
  datasetId: DatasetIdSchema,
  sortKeys: z.array(KeysetSortKeySchema).min(1).max(8),
  limit: z.number().int().positive().max(100_000),
  where: z.string().max(10_000).optional(),
  cursor: KeysetCursorSchema.optional(),
  columns: z.array(ColumnNameSchema).max(512).optional(),
  cancelToken: CancelTokenSchema,
});

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface RegisteredDataset {
  id: string;
  displayName: string;
  viewName: string;
  sourcePath: string;
  cachePath: string;
  sourceFormat: "csv" | "parquet";
  rowCount: number;
  columns: Array<{
    name: string;
    type: string;
    nullable: boolean;
  }>;
  createdAt: string;
  updatedAt: string;
}

interface RejectError {
  line: number | null;
  columnName: string | null;
  errorType: string | null;
  errorMessage: string | null;
}

interface RejectSummary {
  /** Total faulty rows captured by `store_rejects = true`. 0 when not enabled. */
  rejectedRowCount: number;
  /** First N reject_errors rows for surfacing in a data-quality panel. */
  sample: RejectError[];
}

export interface RegisteredDatasetWithPreview extends RegisteredDataset {
  previewRows: Record<string, unknown>[];
  /** Present only when CSV import ran with `storeRejects = true`. */
  rejects?: RejectSummary;
}

export interface QueryMetrics {
  sql: string;
  durationMs: number;
  timestamp: number;
  rowCount: number;
}

export interface DuckDBStatus {
  active: boolean;
  dbPath: string | null;
  datasetsDir: string | null;
  readConnections: number;
  pendingReads: number;
  pendingWrites: number;
}

// ─── Singleton State ──────────────────────────────────────────────────────────

let instance: DuckDBInstance | null = null;
let writeConn: DuckDBConnection | null = null;
let readConns: DuckDBConnection[] = [];
let initPromise: Promise<void> | null = null;
let activeDbPath: string | null = null;
let activeDatasetsDir: string | null = null;

// Round-robin index for distributing reads across read connections.
let readConnIndex = 0;

// DuckDB write operations should be serialized.
// Reads may run concurrently across read connections.
const writeQueue = new PQueue({ concurrency: 1 });
const readQueue = new PQueue({ concurrency: READ_CONN_COUNT });

// ─── Metrics ──────────────────────────────────────────────────────────────────

const queryMetrics: QueryMetrics[] = [];

function truncateSql(sql: string, maxLen = 240): string {
  return sql.length > maxLen ? `${sql.slice(0, maxLen)}...` : sql;
}

function pushMetric(metric: QueryMetrics, datasetId = "duckdb"): void {
  queryMetrics.unshift(metric);

  if (queryMetrics.length > MAX_METRICS) {
    queryMetrics.pop();
  }

  try {
    recordQueryAnalytics({
      datasetId,
      sqlQuery: metric.sql,
      rowCount: metric.rowCount,
      executionTimeMs: metric.durationMs,
      isCached: false,
    });
  } catch {
    // Non-blocking query analytics
  }
}

async function measureRows(
  conn: DuckDBConnection,
  sql: string,
): Promise<Record<string, unknown>[]> {
  const start = performance.now();
  const result = await conn.run(sql);
  const rows = await result.getRowObjectsJS();
  const durationMs = Math.round(performance.now() - start);

  pushMetric({
    sql: truncateSql(sql),
    durationMs,
    timestamp: Date.now(),
    rowCount: rows.length,
  });

  return rows;
}

async function measureRun(conn: DuckDBConnection, sql: string): Promise<void> {
  const start = performance.now();
  await conn.run(sql);
  const durationMs = Math.round(performance.now() - start);

  pushMetric({
    sql: truncateSql(sql),
    durationMs,
    timestamp: Date.now(),
    rowCount: 0,
  });
}

// ─── Queue Helpers ────────────────────────────────────────────────────────────

function enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
  return writeQueue.add(operation) as Promise<T>;
}

function enqueueRead<T>(operation: () => Promise<T>): Promise<T> {
  return readQueue.add(operation) as Promise<T>;
}

// ─── Path Helpers ─────────────────────────────────────────────────────────────

function getDuckDBRootDir(): string {
  return path.join(app.getPath("userData"), "data-navigator");
}

function getDuckDBPath(): string {
  return path.join(getDuckDBRootDir(), "data-navigator.duckdb");
}

function getDatasetsDirPath(): string {
  return path.join(getDuckDBRootDir(), "datasets");
}

async function ensureDirectory(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function assertReadableFile(filePath: string): Promise<string> {
  const resolved = path.resolve(filePath);
  const stat = await fs.stat(resolved);

  if (!stat.isFile()) {
    throw new Error(`Path is not a file: ${resolved}`);
  }

  return resolved;
}

async function assertManagedCachePath(cachePath: string): Promise<string> {
  const datasetsDir = path.resolve(getDatasetsDirPath());
  const resolved = path.resolve(cachePath);

  const relative = path.relative(datasetsDir, resolved);
  const isInsideDatasetsDir =
    relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);

  if (!isInsideDatasetsDir) {
    throw new Error(`Refusing to access unmanaged cache path: ${resolved}`);
  }

  return resolved;
}

async function ensureParentDirectory(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(path.resolve(filePath)), { recursive: true });
}

// ─── SQL Helpers ──────────────────────────────────────────────────────────────

function quoteSqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

/**
 * Format a list of directory paths as a DuckDB SQL list literal, e.g.
 * `['C:\\a', 'C:\\b']`. Each path is single-quote escaped via quoteSqlString.
 */
function quoteSqlPathList(paths: readonly string[]): string {
  return `[${paths.map((p) => quoteSqlString(p)).join(", ")}]`;
}

/**
 * Engine-enforced read-only sandbox for a READ connection.
 *
 * Restricts filesystem access to ONLY the managed datasets + spill directories
 * so a malicious/compromised renderer SQL string cannot use functions like
 * `read_parquet('C:/Users/.../secret')` to exfiltrate arbitrary files — even if
 * it gets past the textual `assertReadOnlySql` guard.
 *
 * DuckDB 1.x facts (tested against @duckdb/node-api 1.5.x):
 * - `enable_external_access` is GLOBAL scope and startup-only; setting it via
 *   `SET` after the database is open throws "Cannot enable external access while
 *   database is running". It must be passed to DuckDBInstance.create().
 * - `allowed_directories` is GLOBAL scope but CAN be set via SET at runtime.
 * - `lock_configuration` is also GLOBAL scope. Setting it true on any one
 *   connection locks the entire database instance, so all subsequent connections
 *   (READ_CONN_COUNT = 3) would fail every SET. It is therefore omitted here;
 *   the textual assertReadOnlySql guard (which blocks any SET statement from the
 *   renderer) is the anti-reset layer.
 */
async function applyReadConnectionSandbox(
  conn: DuckDBConnection,
  allowedDirs: readonly string[],
): Promise<void> {
  const resolvedDirs = allowedDirs
    .filter((dir): dir is string => typeof dir === "string" && dir.length > 0)
    .map((dir) => path.resolve(dir));

  if (resolvedDirs.length === 0) return;

  // Narrow filesystem access to the managed cache + spill dirs only.
  const setting = `SET allowed_directories = ${quoteSqlPathList(resolvedDirs)}`;
  try {
    await conn.run(setting);
  } catch (error) {
    // Degrade gracefully to the textual assertReadOnlySql guard.
    console.warn(
      `[duckdb] read-connection sandbox skipped (SET allowed_directories): ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function makeDatasetId(): string {
  return `ds_${nanoid(12)}`;
}

function datasetViewName(datasetId: string): string {
  return DatasetIdSchema.parse(datasetId);
}

type CsvEncoding = "utf-8" | "utf-16" | "latin-1";

function buildCsvOptions(options: {
  hasHeader?: boolean;
  delimiter?: string;
  sampleSize?: number;
  encoding?: CsvEncoding;
  storeRejects?: boolean;
}): string {
  const parts = [
    "auto_detect = true",
    `header = ${options.hasHeader ?? true}`,
    "strict_mode = false",
    "null_padding = true",
    `sample_size = ${options.sampleSize ?? DEFAULT_CSV_SAMPLE_SIZE}`,
    "max_line_size = 10000000",
  ];

  if (options.delimiter) {
    parts.push(`delim = ${quoteSqlString(options.delimiter)}`);
  }

  // encoding: DuckDB ≥1.2 supports 'utf-8' (default), 'utf-16', 'latin-1'.
  if (options.encoding) {
    parts.push(`encoding = ${quoteSqlString(options.encoding)}`);
  }

  // store_rejects: capture coerced/skipped rows into the session-scoped
  // reject_scans / reject_errors temp tables (queried right after the read).
  if (options.storeRejects) {
    parts.push("store_rejects = true");
  }

  return parts.join(", ");
}

function normalizeColumns(rows: Record<string, unknown>[]): RegisteredDataset["columns"] {
  return rows.map((row) => ({
    name: String(row.column_name ?? row.name),
    type: String(row.column_type ?? row.type),
    nullable: row.null !== "NO" && row.null !== false,
  }));
}

function parseColumns(value: unknown): RegisteredDataset["columns"] {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map((column) => ({
      name: String(column.name),
      type: String(column.type),
      nullable: Boolean(column.nullable),
    }));
  } catch {
    return [];
  }
}

// ─── Connection Helpers ───────────────────────────────────────────────────────

function getReadConnection(): DuckDBConnection {
  if (readConns.length === 0) {
    if (!writeConn) {
      throw new Error("DuckDB connection not initialized");
    }

    return writeConn;
  }

  const conn = readConns[readConnIndex % readConns.length];
  readConnIndex += 1;

  return conn;
}

function getWriteConnection(): DuckDBConnection {
  if (!writeConn) {
    throw new Error("DuckDB connection not initialized");
  }

  return writeConn;
}

// ─── Catalog & View Setup ─────────────────────────────────────────────────────

async function ensureDatasetCatalog(): Promise<void> {
  const conn = getWriteConnection();

  await measureRun(
    conn,
    `
      CREATE TABLE IF NOT EXISTS app_datasets (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        view_name TEXT NOT NULL UNIQUE,
        source_path TEXT NOT NULL,
        cache_path TEXT NOT NULL,
        source_format TEXT NOT NULL,
        row_count BIGINT NOT NULL DEFAULT 0,
        schema_json TEXT NOT NULL DEFAULT '[]',
        csv_options_json TEXT,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      )
    `,
  );
}

async function restoreDatasetViews(): Promise<void> {
  const conn = getWriteConnection();

  const datasets = await measureRows(
    conn,
    `
      SELECT id, view_name, cache_path
      FROM app_datasets
      ORDER BY created_at ASC
    `,
  );

  for (const dataset of datasets) {
    const id = String(dataset.id);
    const viewName = String(dataset.view_name);
    const cachePath = String(dataset.cache_path);

    try {
      await assertManagedCachePath(cachePath);
      await fs.access(cachePath);

      await measureRun(
        conn,
        `
          CREATE OR REPLACE VIEW ${quoteIdentifier(viewName)} AS
          SELECT *
          FROM read_parquet(${quoteSqlString(cachePath)})
        `,
      );
    } catch {
      await measureRun(
        conn,
        `
          UPDATE app_datasets
          SET updated_at = now()
          WHERE id = ${quoteSqlString(id)}
        `,
      );
    }
  }
}

async function getDatasetById(
  conn: DuckDBConnection,
  datasetId: string,
): Promise<RegisteredDataset | null> {
  const id = DatasetIdSchema.parse(datasetId);

  const rows = await measureRows(
    conn,
    `
      SELECT
        id,
        display_name,
        view_name,
        source_path,
        cache_path,
        source_format,
        row_count,
        schema_json,
        created_at,
        updated_at
      FROM app_datasets
      WHERE id = ${quoteSqlString(id)}
      LIMIT 1
    `,
  );

  const row = rows[0];

  if (!row) {
    return null;
  }

  return {
    id: String(row.id),
    displayName: String(row.display_name),
    viewName: String(row.view_name),
    sourcePath: String(row.source_path),
    cachePath: String(row.cache_path),
    sourceFormat: String(row.source_format) as "csv" | "parquet",
    rowCount: Number(row.row_count ?? 0),
    columns: parseColumns(row.schema_json),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
/**
 * Strip markdown fences, leading SQL comments, and trailing semicolons before
 * evaluating safety. The on-device 1.5B model frequently wraps a valid SELECT in
 * ```sql fences or prefixes it with a `-- comment`; without this the security
 * guard rejected legitimate read-only queries. Stripping comments cannot weaken
 * the boundary — the actual statement is still validated below.
 */
function stripSqlWrapping(sql: string): string {
  let s = sql.trim();
  const fence = s.match(/^```(?:sql)?\s*([\s\S]*?)\s*```$/i);
  if (fence?.[1]) s = fence[1].trim();
  s = s.replace(/^(\s*(?:--[^\n]*\n|\/\*[\s\S]*?\*\/)\s*)+/i, "").trim();
  s = s.replace(/;+\s*$/, "").trim();
  return s;
}

function assertReadOnlySql(sql: string): string {
  const trimmed = stripSqlWrapping(sql);
  const upper = trimmed.toUpperCase();

  const allowed =
    upper.startsWith("SELECT") ||
    upper.startsWith("WITH") ||
    upper.startsWith("SHOW") ||
    upper.startsWith("DESCRIBE") ||
    upper.startsWith("DESC ") ||
    upper.startsWith("SUMMARIZE") ||
    upper.startsWith("EXPLAIN") ||
    // DuckDB read-only shorthands the 1.5B model sometimes emits.
    upper.startsWith("FROM") ||
    upper.startsWith("TABLE") ||
    upper.startsWith("VALUES") ||
    upper.startsWith("PIVOT") ||
    upper.startsWith("UNPIVOT");

  if (!allowed) {
    const preview = trimmed.slice(0, 200).replace(/\s+/g, " ");
    throw new Error(
      `Only read-only DuckDB queries are allowed from renderer. Got: ${preview || "<empty>"}`,
    );
  }

  const blocked =
    /\b(CREATE|DROP|ALTER|INSERT|UPDATE|DELETE|COPY|EXPORT|IMPORT|ATTACH|DETACH|INSTALL|LOAD|CALL|PRAGMA)\b/i;

  if (blocked.test(trimmed)) {
    throw new Error("Unsafe SQL statement blocked.");
  }

  // Block file / IO / env table-functions that read arbitrary paths or env even
  // inside a SELECT (e.g. `SELECT * FROM read_csv('/etc/passwd')`). Legit
  // renderer queries reference registered VIEW identifiers, never these.
  const blockedFunctions =
    /\b(read_csv(_auto)?|read_parquet|parquet_scan|parquet_metadata|parquet_schema|parquet_file_metadata|parquet_kv_metadata|read_json(_auto|_objects)?|read_ndjson(_auto)?|read_text|read_blob|sniff_csv|glob|getenv)\s*\(/i;
  if (blockedFunctions.test(trimmed)) {
    throw new Error("Unsafe SQL function blocked (file/IO/env access).");
  }

  // Block the DuckDB replacement-scan file-read vector: a string literal used
  // directly as a table source (`FROM 'x.parquet'` / `JOIN '...'`) resolves to a
  // file read. Renderer queries always use identifiers, never string tables.
  const fromStringLiteral = /\b(FROM|JOIN)\s+'/i;
  if (fromStringLiteral.test(trimmed)) {
    throw new Error("Unsafe SQL: string-literal table source blocked.");
  }

  // Block SET config assignment in a chained statement (e.g. re-enabling
  // external access). Targeted so a column named "set" is not a false positive.
  const setConfig = /\bSET\s+(SESSION\s+|GLOBAL\s+|LOCAL\s+)?[A-Za-z_][\w]*\s*=/i;
  if (setConfig.test(trimmed)) {
    throw new Error("Unsafe SQL: SET configuration blocked.");
  }

  return trimmed;
}
async function describeView(
  conn: DuckDBConnection,
  viewName: string,
): Promise<RegisteredDataset["columns"]> {
  const rows = await measureRows(conn, `DESCRIBE ${quoteIdentifier(viewName)}`);

  return normalizeColumns(rows);
}

async function countViewRows(conn: DuckDBConnection, viewName: string): Promise<number> {
  const rows = await measureRows(
    conn,
    `
      SELECT count(*) AS row_count
      FROM ${quoteIdentifier(viewName)}
    `,
  );

  return Number(rows[0]?.row_count ?? 0);
}

const REJECT_SAMPLE_LIMIT = 50;

/**
 * Read the `reject_errors` temp table populated by a `store_rejects = true` CSV
 * read on the SAME connection. Returns a count + a small sample for a
 * data-quality panel. Tolerant of the table not existing (no rejects / older
 * engine) — returns an empty summary.
 */
async function collectRejectSummary(conn: DuckDBConnection): Promise<RejectSummary> {
  try {
    const countRows = await measureRows(conn, "SELECT count(*) AS bad_rows FROM reject_errors");
    const rejectedRowCount = Number(countRows[0]?.bad_rows ?? 0);

    if (rejectedRowCount === 0) {
      return { rejectedRowCount: 0, sample: [] };
    }

    const sampleRows = await measureRows(
      conn,
      `
        SELECT line, column_name, error_type, error_message
        FROM reject_errors
        ORDER BY line
        LIMIT ${REJECT_SAMPLE_LIMIT}
      `,
    );

    const sample: RejectError[] = sampleRows.map((row) => ({
      line: row.line === null || row.line === undefined ? null : Number(row.line),
      columnName:
        row.column_name === null || row.column_name === undefined ? null : String(row.column_name),
      errorType:
        row.error_type === null || row.error_type === undefined ? null : String(row.error_type),
      errorMessage:
        row.error_message === null || row.error_message === undefined
          ? null
          : String(row.error_message),
    }));

    return { rejectedRowCount, sample };
  } catch {
    // reject_errors not present (no rejects, or store_rejects was off).
    return { rejectedRowCount: 0, sample: [] };
  }
}

// ─── DuckDB Init ──────────────────────────────────────────────────────────────

async function ensureInit(): Promise<void> {
  if (instance && writeConn) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const rootDir = getDuckDBRootDir();
      const datasetsDir = getDatasetsDirPath();
      const dbPath = getDuckDBPath();

      await ensureDirectory(rootDir);
      await ensureDirectory(datasetsDir);

      // Spill scratch directory: lets big scans/sorts spill to disk instead of
      // OOM-ing the 8 GB target. Lives under the managed root, auto-cleaned.
      const tmpSpillDir = path.join(rootDir, "tmp");
      await ensureDirectory(tmpSpillDir);

      // Cap cores so the renderer/compositor stay responsive on a medium-end PC
      // (4-core / 8 GB), and clamp into [2, 6].
      const cores = os.availableParallelism?.() ?? 4;
      const threads = String(Math.max(2, Math.min(cores - 1, 6)));

      instance = await DuckDBInstance.create(dbPath, {
        threads,
        // enable_external_access is a startup-only GLOBAL setting in DuckDB 1.x;
        // it cannot be changed via SET after the database is open. Default is
        // already true, but we set it explicitly so the intent is clear.
        enable_external_access: "true",
      });

      writeConn = await instance.connect();

      readConns = [];
      for (let i = 0; i < READ_CONN_COUNT; i += 1) {
        readConns.push(await instance.connect());
      }

      activeDbPath = dbPath;
      activeDatasetsDir = datasetsDir;

      const pragmas = [
        `PRAGMA threads = ${threads}`,
        "PRAGMA enable_progress_bar = false",
        // Cap RAM so a big scan can't OOM 8 GB; spill to disk past the limit.
        "PRAGMA memory_limit = '4GB'",
        `PRAGMA temp_directory = ${quoteSqlString(tmpSpillDir)}`,
        "PRAGMA max_temp_directory_size = '20GB'",
        // Cache Parquet footers across queries.
        "PRAGMA enable_object_cache",
      ];

      for (const pragma of pragmas) {
        await writeConn.run(pragma);

        for (const readConn of readConns) {
          await readConn.run(pragma);
        }
      }

      // Engine-enforced filesystem sandbox for READ connections only. The write
      // connection stays unrestricted so dataset registration (COPY TO parquet,
      // read_parquet of freshly imported files, view creation) keeps working.
      // Read connections may only touch the managed cache (dataset parquet
      // views) and the spill directory (temp_directory for big scans/sorts).
      const readSandboxDirs = [datasetsDir, tmpSpillDir];
      for (const readConn of readConns) {
        await applyReadConnectionSandbox(readConn, readSandboxDirs);
      }

      await ensureDatasetCatalog();
      await restoreDatasetViews();
    } catch (error) {
      instance = null;
      writeConn = null;
      readConns = [];
      readConnIndex = 0;
      activeDbPath = null;
      activeDatasetsDir = null;
      initPromise = null;

      throw error;
    }
  })();

  return initPromise;
}

// ─── Public API: Init ─────────────────────────────────────────────────────────

export async function init(): Promise<void> {
  await ensureInit();
}

// ─── Public API: Register Datasets ────────────────────────────────────────────

export async function registerCSVPathDataset(
  rawInput: unknown,
): Promise<RegisteredDatasetWithPreview> {
  const input = RegisterCSVPathDatasetSchema.parse(rawInput);

  return enqueueWrite(async () => {
    await ensureInit();

    const conn = getWriteConnection();

    const sourcePath = await assertReadableFile(input.filePath);
    const datasetsDir = getDatasetsDirPath();

    await ensureDirectory(datasetsDir);

    const id = makeDatasetId();
    const viewName = datasetViewName(id);
    const displayName = input.displayName ?? path.basename(sourcePath);
    const cachePath = path.join(datasetsDir, `${id}.parquet`);

    const csvOptions = buildCsvOptions({
      hasHeader: input.hasHeader,
      delimiter: input.delimiter,
      sampleSize: input.sampleSize,
      encoding: input.encoding,
      storeRejects: input.storeRejects,
    });

    await measureRun(
      conn,
      `
        COPY (
          SELECT *
          FROM read_csv(${quoteSqlString(sourcePath)}, ${csvOptions})
        )
        TO ${quoteSqlString(cachePath)}
        (
          FORMAT parquet,
          COMPRESSION zstd,
          COMPRESSION_LEVEL 1
        )
      `,
    );

    // reject_scans / reject_errors are session/connection temp tables populated
    // by the store_rejects read above. Capture them on THIS connection now,
    // before any other scan reuses it (§1.5).
    const rejects = input.storeRejects ? await collectRejectSummary(conn) : undefined;

    await measureRun(
      conn,
      `
        CREATE OR REPLACE VIEW ${quoteIdentifier(viewName)} AS
        SELECT *
        FROM read_parquet(${quoteSqlString(cachePath)})
      `,
    );

    const columns = await describeView(conn, viewName);
    const rowCount = await countViewRows(conn, viewName);
    const now = new Date().toISOString();

    await measureRun(
      conn,
      `
        INSERT INTO app_datasets (
          id,
          display_name,
          view_name,
          source_path,
          cache_path,
          source_format,
          row_count,
          schema_json,
          csv_options_json,
          updated_at
        )
        VALUES (
          ${quoteSqlString(id)},
          ${quoteSqlString(displayName)},
          ${quoteSqlString(viewName)},
          ${quoteSqlString(sourcePath)},
          ${quoteSqlString(cachePath)},
          'csv',
          ${rowCount},
          ${quoteSqlString(JSON.stringify(columns))},
          ${quoteSqlString(
            JSON.stringify({
              auto_detect: true,
              header: input.hasHeader ?? true,
              delimiter: input.delimiter ?? null,
              sample_size: input.sampleSize ?? DEFAULT_CSV_SAMPLE_SIZE,
            }),
          )},
          now()
        )
      `,
    );

    const previewLimit = input.previewLimit ?? DEFAULT_PREVIEW_LIMIT;

    const previewRows = await measureRows(
      conn,
      `
        SELECT *
        FROM ${quoteIdentifier(viewName)}
        LIMIT ${previewLimit}
      `,
    );

    return {
      id,
      displayName,
      viewName,
      sourcePath,
      cachePath,
      sourceFormat: "csv",
      rowCount,
      columns,
      createdAt: now,
      updatedAt: now,
      previewRows,
      ...(rejects ? { rejects } : {}),
    };
  });
}

export async function registerParquetPathDataset(
  rawInput: unknown,
): Promise<RegisteredDatasetWithPreview> {
  const input = RegisterParquetPathDatasetSchema.parse(rawInput);

  return enqueueWrite(async () => {
    await ensureInit();

    const conn = getWriteConnection();

    const sourcePath = await assertReadableFile(input.filePath);
    const datasetsDir = getDatasetsDirPath();

    await ensureDirectory(datasetsDir);

    const id = makeDatasetId();
    const viewName = datasetViewName(id);
    const displayName = input.displayName ?? path.basename(sourcePath);
    const cachePath = path.join(datasetsDir, `${id}.parquet`);

    await fs.copyFile(sourcePath, cachePath);

    await measureRun(
      conn,
      `
        CREATE OR REPLACE VIEW ${quoteIdentifier(viewName)} AS
        SELECT *
        FROM read_parquet(${quoteSqlString(cachePath)})
      `,
    );

    const columns = await describeView(conn, viewName);
    const rowCount = await countViewRows(conn, viewName);
    const now = new Date().toISOString();

    await measureRun(
      conn,
      `
        INSERT INTO app_datasets (
          id,
          display_name,
          view_name,
          source_path,
          cache_path,
          source_format,
          row_count,
          schema_json,
          csv_options_json,
          updated_at
        )
        VALUES (
          ${quoteSqlString(id)},
          ${quoteSqlString(displayName)},
          ${quoteSqlString(viewName)},
          ${quoteSqlString(sourcePath)},
          ${quoteSqlString(cachePath)},
          'parquet',
          ${rowCount},
          ${quoteSqlString(JSON.stringify(columns))},
          NULL,
          now()
        )
      `,
    );

    const previewLimit = input.previewLimit ?? DEFAULT_PREVIEW_LIMIT;

    const previewRows = await measureRows(
      conn,
      `
        SELECT *
        FROM ${quoteIdentifier(viewName)}
        LIMIT ${previewLimit}
      `,
    );

    return {
      id,
      displayName,
      viewName,
      sourcePath,
      cachePath,
      sourceFormat: "parquet",
      rowCount,
      columns,
      createdAt: now,
      updatedAt: now,
      previewRows,
    };
  });
}

// ─── Public API: Read Datasets ────────────────────────────────────────────────

export async function listDatasets(): Promise<RegisteredDataset[]> {
  return enqueueRead(async () => {
    await ensureInit();

    const conn = getReadConnection();

    const rows = await measureRows(
      conn,
      `
        SELECT
          id,
          display_name,
          view_name,
          source_path,
          cache_path,
          source_format,
          row_count,
          schema_json,
          created_at,
          updated_at
        FROM app_datasets
        ORDER BY created_at DESC
      `,
    );

    return rows.map((row) => ({
      id: String(row.id),
      displayName: String(row.display_name),
      viewName: String(row.view_name),
      sourcePath: String(row.source_path),
      cachePath: String(row.cache_path),
      sourceFormat: String(row.source_format) as "csv" | "parquet",
      rowCount: Number(row.row_count ?? 0),
      columns: parseColumns(row.schema_json),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    }));
  });
}

export async function previewDataset(rawInput: unknown): Promise<Record<string, unknown>[]> {
  const input = PreviewDatasetSchema.parse(rawInput);

  return enqueueRead(async () => {
    await ensureInit();

    const conn = getReadConnection();
    const viewName = datasetViewName(input.datasetId);
    const limit = input.limit ?? DEFAULT_PREVIEW_LIMIT;
    const offset = input.offset ?? 0;

    return measureRows(
      conn,
      `
        SELECT *
        FROM ${quoteIdentifier(viewName)}
        LIMIT ${limit}
        OFFSET ${offset}
      `,
    );
  });
}

export async function summarizeDataset(rawInput: unknown): Promise<Record<string, unknown>[]> {
  const input = DatasetOnlySchema.parse(rawInput);

  return enqueueRead(async () => {
    await ensureInit();

    const conn = getReadConnection();
    const viewName = datasetViewName(input.datasetId);

    return measureRows(
      conn,
      `
        SUMMARIZE
        SELECT *
        FROM ${quoteIdentifier(viewName)}
      `,
    );
  });
}

// ─── Public API: Export / Delete ──────────────────────────────────────────────

export async function exportDataset(rawInput: unknown): Promise<void> {
  const input = ExportDatasetSchema.parse(rawInput);

  return enqueueRead(async () => {
    await ensureInit();

    const conn = getReadConnection();
    const dataset = await getDatasetById(conn, input.datasetId);

    if (!dataset) {
      throw new Error("Dataset not found.");
    }

    const sourceCachePath = await assertManagedCachePath(dataset.cachePath);

    await fs.access(sourceCachePath);
    await ensureParentDirectory(input.targetPath);
    await fs.copyFile(sourceCachePath, path.resolve(input.targetPath));
  });
}

export async function deleteDataset(rawInput: unknown): Promise<void> {
  const input = DatasetOnlySchema.parse(rawInput);

  return enqueueWrite(async () => {
    await ensureInit();

    const conn = getWriteConnection();
    const dataset = await getDatasetById(conn, input.datasetId);

    if (!dataset) {
      return;
    }

    const cachePath = await assertManagedCachePath(dataset.cachePath);

    invalidateCountCache(dataset.viewName);

    await measureRun(
      conn,
      `
        DROP VIEW IF EXISTS ${quoteIdentifier(dataset.viewName)}
      `,
    );

    await measureRun(
      conn,
      `
        DELETE FROM app_datasets
        WHERE id = ${quoteSqlString(input.datasetId)}
      `,
    );

    try {
      await fs.unlink(cachePath);
    } catch {
      // Cache file is already gone; non-fatal.
    }
  });
}

// ─── Public API: Status & Metrics ─────────────────────────────────────────────

export function getStatus(): DuckDBStatus {
  return {
    active: Boolean(instance && writeConn),
    dbPath: activeDbPath,
    datasetsDir: activeDatasetsDir,
    readConnections: readConns.length,
    pendingReads: readQueue.size + readQueue.pending,
    pendingWrites: writeQueue.size + writeQueue.pending,
  };
}

export function getQueryMetrics(): QueryMetrics[] {
  return queryMetrics.slice();
}

export function clearQueryMetrics(): void {
  queryMetrics.length = 0;
}

export async function runReadOnlyQuery(sql: string): Promise<Record<string, unknown>[]> {
  return enqueueRead(async () => {
    await ensureInit();

    const conn = getReadConnection();
    const safeSql = assertReadOnlySql(sql);

    return measureRows(conn, safeSql);
  });
}

// ─── Cancellation tokens ──────────────────────────────────────────────────────
//
// A cancel token is a renderer-supplied string id that groups one or more
// queued/running read queries (e.g. all scans for the active dataset). Calling
// cancelQueries(token):
//  - marks the token cancelled so still-queued queries short-circuit before they
//    acquire a connection, and
//  - interrupt()s every connection currently running a query under that token.
// This is the missing piece in the brief/architecture §2: switching datasets now
// actually cancels queued main-process scans instead of leaving them running.

const cancelledTokens = new Set<string>();
/** token -> set of connections currently executing a query under that token. */
const activeTokenConns = new Map<string, Set<DuckDBConnection>>();

class QueryCancelledError extends Error {
  readonly token: string;
  constructor(token: string) {
    super(`DuckDB query cancelled (token: ${token}).`);
    this.name = "QueryCancelledError";
    this.token = token;
  }
}

function bindTokenConn(token: string, conn: DuckDBConnection): void {
  let set = activeTokenConns.get(token);
  if (!set) {
    set = new Set();
    activeTokenConns.set(token, set);
  }
  set.add(conn);
}

function unbindTokenConn(token: string, conn: DuckDBConnection): void {
  const set = activeTokenConns.get(token);
  if (!set) return;
  set.delete(conn);
  if (set.size === 0) {
    activeTokenConns.delete(token);
  }
}

/**
 * Cancel all queued and in-flight read queries associated with `token`.
 * Idempotent. Safe to call for an unknown token.
 */
export function cancelQueries(token: string): void {
  if (!token) return;
  cancelledTokens.add(token);

  const conns = activeTokenConns.get(token);
  if (conns) {
    for (const conn of conns) {
      try {
        conn.interrupt();
      } catch {
        // Connection already idle/closed; nothing to interrupt.
      }
    }
  }
}

/**
 * Clear a cancellation token so its id can be reused (e.g. after the renderer
 * starts a fresh batch for the same dataset). Does not affect running queries.
 */
export function resetCancelToken(token: string): void {
  cancelledTokens.delete(token);
}

function assertNotCancelled(token: string | undefined): void {
  if (token && cancelledTokens.has(token)) {
    throw new QueryCancelledError(token);
  }
}

/**
 * Run a read body on a read connection, honoring a cancel token. Queued work
 * short-circuits if the token was cancelled before it started; running work is
 * interruptible via cancelQueries(token).
 */
async function runCancellableRead<T>(
  token: string | undefined,
  body: (conn: DuckDBConnection) => Promise<T>,
): Promise<T> {
  return enqueueRead(async () => {
    await ensureInit();
    assertNotCancelled(token);

    const conn = getReadConnection();
    if (token) bindTokenConn(token, conn);

    try {
      return await body(conn);
    } finally {
      if (token) unbindTokenConn(token, conn);
    }
  });
}

// ─── Arrow IPC transport (large windows / exports / worker hand-off) ──────────
//
// Build the Arrow IPC stream buffer in MAIN from DuckDB's native columnar output
// and return it as a transferable Uint8Array. Decode renderer/worker-side with
// @uwdata/flechette (see src/platform/duckdb/arrow-ipc.ts). Use this only for
// large results; keep getRowObjectsJS (JSON) for tiny aggregate/preview rows.

async function measureArrow(conn: DuckDBConnection, sql: string): Promise<Uint8Array> {
  const start = performance.now();
  const reader = await conn.runAndReadAll(sql);
  const cols = reader.getColumnsObjectJS();
  const types = reader.columnTypes() as unknown as DuckDBColumnTypeLike[];
  const bytes = encodeColumnsToArrowIPC(cols, types);
  const durationMs = Math.round(performance.now() - start);

  // Row count = length of the first column's value array (0 columns → 0 rows).
  const firstCol = Object.values(cols)[0];
  const rowCount = Array.isArray(firstCol) ? firstCol.length : 0;

  pushMetric({
    sql: truncateSql(sql),
    durationMs,
    timestamp: Date.now(),
    rowCount,
  });

  return bytes;
}

/**
 * Run a read-only query and return Arrow IPC STREAM bytes (offline; no
 * extension). `cancelToken` ties the scan to a cancellable group.
 */
export async function runReadOnlyQueryArrow(
  sql: string,
  cancelToken?: string,
): Promise<Uint8Array> {
  const safeSql = assertReadOnlySql(sql);
  return runCancellableRead(cancelToken, (conn) => measureArrow(conn, safeSql));
}

// ─── Profiling pushdown (single-scan; replaces per-column fan-out) ────────────

export interface SummarizeRow {
  column_name: string;
  column_type: string;
  min: unknown;
  max: unknown;
  approx_unique: number | null;
  avg: number | null;
  std: number | null;
  q25: number | null;
  q50: number | null;
  q75: number | null;
  count: number;
  null_percentage: number | null;
}

export interface ColumnDetail {
  column: string;
  distinctApprox: number;
  topValues: Array<{ value: unknown; count: number | null }>;
  histogram: Array<{ bin: string; count: number }>;
}

/**
 * Whole-dataset profile in ONE scan via SUMMARIZE (projected). Approximate
 * quantiles/`approx_unique` by design (cheap). Replaces N×2-4 per-column queries.
 */
export async function profileDataset(rawInput: unknown): Promise<SummarizeRow[]> {
  const input = ProfileDatasetSchema.parse(rawInput);
  const viewName = datasetViewName(input.datasetId);

  return runCancellableRead(input.cancelToken, async (conn) => {
    const rows = await measureRows(
      conn,
      `
        SELECT
          column_name, column_type, min, max, approx_unique,
          avg, std, q25, q50, q75, count, null_percentage
        FROM (SUMMARIZE SELECT * FROM ${quoteIdentifier(viewName)})
      `,
    );

    return rows.map((row) => ({
      column_name: String(row.column_name ?? ""),
      column_type: String(row.column_type ?? ""),
      min: row.min ?? null,
      max: row.max ?? null,
      approx_unique: numOrNull(row.approx_unique),
      avg: numOrNull(row.avg),
      std: numOrNull(row.std),
      q25: numOrNull(row.q25),
      q50: numOrNull(row.q50),
      q75: numOrNull(row.q75),
      count: Number(row.count ?? 0),
      null_percentage: numOrNull(row.null_percentage),
    }));
  });
}

/**
 * Per-selected-column detail in a couple of scans: approx_count_distinct +
 * approx_top_k + an equi-width histogram via the table macro (the only form that
 * accepts bin_count). Lazy — call only for the column the user clicked.
 */
export async function profileColumnDetail(rawInput: unknown): Promise<ColumnDetail> {
  const input = ProfileColumnDetailSchema.parse(rawInput);
  const viewName = datasetViewName(input.datasetId);
  const col = quoteIdentifier(input.column);
  const binCount = input.binCount ?? 20;

  return runCancellableRead(input.cancelToken, async (conn) => {
    const distinctRows = await measureRows(
      conn,
      `SELECT approx_count_distinct(${col}) AS distinct_approx FROM ${quoteIdentifier(viewName)}`,
    );
    const distinctApprox = Number(distinctRows[0]?.distinct_approx ?? 0);

    // approx_top_k returns a LIST of the K most frequent values.
    const topRows = await measureRows(
      conn,
      `SELECT approx_top_k(${col}, ${input.topK ?? 10}) AS top_values FROM ${quoteIdentifier(viewName)}`,
    );
    const topValues = normalizeTopValues(topRows[0]?.top_values);

    // Equi-width histogram via the DuckDB ≥1.1 table macro.
    let histogram: ColumnDetail["histogram"] = [];
    try {
      const histRows = await measureRows(
        conn,
        `FROM histogram(${quoteIdentifier(viewName)}, ${col}, bin_count := ${binCount})`,
      );
      histogram = histRows.map((row) => ({
        bin: String(row.bin ?? row.x ?? ""),
        count: Number(row.count ?? row.y ?? 0),
      }));
    } catch {
      histogram = [];
    }

    return {
      column: input.column,
      distinctApprox,
      topValues,
      histogram,
    };
  });
}

// ─── Cached COUNT(*) (invariant across page/sort) ─────────────────────────────

interface CountCacheEntry {
  total: number;
  cachedAt: number;
}
const countCache = new Map<string, CountCacheEntry>();

function countKey(viewName: string, where?: string): string {
  return `${viewName}::${(where ?? "").trim()}`;
}

/** Invalidate cached counts for a view (call on dataset re-register/delete). */
function invalidateCountCache(viewName: string): void {
  for (const key of countCache.keys()) {
    if (key.startsWith(`${viewName}::`)) {
      countCache.delete(key);
    }
  }
}

/**
 * COUNT(*) for (view, where), cached. For the empty filter on a freshly
 * registered dataset the renderer should prefer the catalog `rowCount`; this is
 * the cache for filtered counts and re-fetches.
 */
export async function countRows(rawInput: unknown): Promise<number> {
  const input = CountRowsSchema.parse(rawInput);
  const viewName = datasetViewName(input.datasetId);
  const where = input.where?.trim();
  const key = countKey(viewName, where);

  if (!input.force) {
    const cached = countCache.get(key);
    if (cached) return cached.total;
  }

  return runCancellableRead(input.cancelToken, async (conn) => {
    const filter = where ? ` WHERE ${where}` : "";
    const rows = await measureRows(
      conn,
      `SELECT count(*) AS total FROM ${quoteIdentifier(viewName)}${filter}`,
    );
    const total = Number(rows[0]?.total ?? 0);
    countCache.set(key, { total, cachedAt: Date.now() });
    return total;
  });
}

// ─── Keyset / seek pagination (replaces deep OFFSET) ──────────────────────────

export interface KeysetPageResult {
  /** Arrow IPC stream bytes for the page rows (transferable). */
  arrow: Uint8Array;
  /** Cursor for the NEXT page; null when this page is the last. */
  nextCursor: { sortValues: unknown[]; rowid: number } | null;
  /** Number of rows in this page. */
  rowCount: number;
}

/**
 * Forward keyset/seek page returned as Arrow IPC. O(window) regardless of depth.
 * `rowid` is always projected and used as the stable strict tiebreaker; the
 * returned `nextCursor` feeds straight back in as `cursor` for the next page.
 */
export async function fetchKeysetPage(rawInput: unknown): Promise<KeysetPageResult> {
  const input = KeysetPageSchema.parse(rawInput);

  return runCancellableRead(input.cancelToken, async (conn) => {
    // Parquet-backed views do NOT expose a `rowid` pseudo-column, so we scan the
    // managed Parquet cache directly with `file_row_number = true` and alias it
    // to `rowid` — a stable, monotonic per-file tiebreaker that is consistent
    // across page queries (verified against the engine).
    const dataset = await getDatasetById(conn, input.datasetId);
    if (!dataset) {
      throw new Error("Dataset not found.");
    }
    const cachePath = await assertManagedCachePath(dataset.cachePath);

    const { sql, params } = buildKeysetPage(cachePath, input);

    type RunValues = Parameters<DuckDBConnection["runAndReadAll"]>[1];

    const start = performance.now();
    const reader =
      params.length > 0
        ? await conn.runAndReadAll(sql, params as RunValues)
        : await conn.runAndReadAll(sql);
    const cols = reader.getColumnsObjectJS();
    const types = reader.columnTypes() as unknown as DuckDBColumnTypeLike[];
    const durationMs = Math.round(performance.now() - start);

    const rowidCol = (cols.rowid as unknown[] | undefined) ?? [];
    const rowCount = rowidCol.length;

    pushMetric({
      sql: truncateSql(sql),
      durationMs,
      timestamp: Date.now(),
      rowCount,
    });

    const arrow = encodeColumnsToArrowIPC(cols, types);

    let nextCursor: KeysetPageResult["nextCursor"] = null;
    if (rowCount === input.limit) {
      const lastIdx = rowCount - 1;
      const sortValues = input.sortKeys.map((k) => {
        const colVals = cols[k.column] as unknown[] | undefined;
        return colVals ? toCursorValue(colVals[lastIdx]) : null;
      });
      nextCursor = {
        sortValues,
        rowid: Number(rowidCol[lastIdx]),
      };
    }

    return { arrow, nextCursor, rowCount };
  });
}

// ─── Keyset SQL builder (main-side; parameterized) ────────────────────────────

interface KeysetInput {
  sortKeys: Array<{ column: string; direction: "ASC" | "DESC" }>;
  limit: number;
  where?: string;
  cursor?: { sortValues: unknown[]; rowid: number };
  columns?: string[];
}

function buildKeysetPage(
  cachePath: string,
  input: KeysetInput,
): { sql: string; params: unknown[] } {
  const limit = Math.max(1, Math.trunc(input.limit));

  // Inner relation: the managed Parquet cache with a stable `rowid` tiebreaker
  // sourced from Parquet's per-file physical row number. Aliasing it inside a
  // subquery lets WHERE/ORDER reference `rowid` uniformly.
  const inner = `(
        SELECT *, file_row_number AS rowid
        FROM read_parquet(${quoteSqlString(cachePath)}, file_row_number = true)
      ) AS _kp`;

  // The inner relation already exposes `rowid` (aliased from file_row_number),
  // so `* EXCLUDE (file_row_number)` yields the data columns + rowid exactly
  // once. For the explicit-columns case, append rowid since `*` is not used.
  const projection = input.columns?.length
    ? `${input.columns.map(quoteIdentifier).join(", ")}, rowid`
    : "* EXCLUDE (file_row_number)";

  const orderParts = input.sortKeys.map((k) => `${quoteIdentifier(k.column)} ${k.direction}`);
  orderParts.push("rowid ASC");

  const filters: string[] = [];
  if (input.where?.trim()) {
    filters.push(`(${input.where})`);
  }

  const params: unknown[] = [];

  if (input.cursor) {
    const { sortValues, rowid } = input.cursor;
    const keyCount = input.sortKeys.length;
    const orClauses: string[] = [];

    for (let k = 0; k < keyCount; k += 1) {
      const ands: string[] = [];
      for (let i = 0; i < k; i += 1) {
        params.push(sortValues[i]);
        ands.push(`${quoteIdentifier(input.sortKeys[i].column)} = $${params.length}`);
      }
      params.push(sortValues[k]);
      const strict = input.sortKeys[k].direction === "ASC" ? ">" : "<";
      ands.push(`${quoteIdentifier(input.sortKeys[k].column)} ${strict} $${params.length}`);
      orClauses.push(`(${ands.join(" AND ")})`);
    }

    const tieAnds: string[] = [];
    for (let i = 0; i < keyCount; i += 1) {
      params.push(sortValues[i]);
      tieAnds.push(`${quoteIdentifier(input.sortKeys[i].column)} = $${params.length}`);
    }
    params.push(rowid);
    tieAnds.push(`rowid > $${params.length}`);
    orClauses.push(`(${tieAnds.join(" AND ")})`);

    filters.push(`(${orClauses.join(" OR ")})`);
  }

  const whereSql = filters.length > 0 ? `\n      WHERE ${filters.join(" AND ")}` : "";

  const sql = `
      SELECT ${projection}
      FROM ${inner}${whereSql}
      ORDER BY ${orderParts.join(", ")}
      LIMIT ${limit}
  `.trim();

  return { sql, params };
}

// ─── Small value helpers ──────────────────────────────────────────────────────

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

/** BigInt cursor values must survive JSON IPC — downcast safe, stringify big. */
function toCursorValue(value: unknown): unknown {
  if (typeof value === "bigint") {
    return value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER)
      ? Number(value)
      : value.toString();
  }
  if (value instanceof Date) return value.toISOString();
  return value ?? null;
}

function normalizeTopValues(raw: unknown): Array<{ value: unknown; count: number | null }> {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const rec = entry as Record<string, unknown>;
      return {
        value: rec.value ?? rec.key ?? rec[Object.keys(rec)[0]] ?? null,
        count: numOrNull(rec.count ?? rec.n),
      };
    }
    return { value: entry ?? null, count: null };
  });
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

export async function close(): Promise<void> {
  writeQueue.clear();
  readQueue.clear();

  cancelledTokens.clear();
  activeTokenConns.clear();
  countCache.clear();

  readConns = [];
  writeConn = null;
  instance = null;
  initPromise = null;
  readConnIndex = 0;
  activeDbPath = null;
  activeDatasetsDir = null;
}

app.on("quit", () => {
  close().catch((error) => {
    console.error("[duckdb-service] cleanup error:", error);
  });
});
