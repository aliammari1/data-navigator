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

// ─── Constants ────────────────────────────────────────────────────────────────

const READ_CONN_COUNT = 3;
const MAX_METRICS = 200;
const DEFAULT_PREVIEW_LIMIT = 100;
const MAX_PREVIEW_LIMIT = 500;
const DEFAULT_CSV_SAMPLE_SIZE = 20_480;
const MAX_CSV_SAMPLE_SIZE = 1_000_000;

// ─── Schemas ──────────────────────────────────────────────────────────────────

const DatasetIdSchema = z.string().regex(/^ds_[A-Za-z0-9_-]{8,32}$/, "Invalid dataset id");

const RegisterCSVPathDatasetSchema = z.object({
  filePath: z.string().min(1),
  displayName: z.string().min(1).max(255).optional(),
  hasHeader: z.boolean().optional(),
  delimiter: z.string().min(1).max(4).optional(),
  sampleSize: z.number().int().positive().max(MAX_CSV_SAMPLE_SIZE).optional(),
  previewLimit: z.number().int().positive().max(MAX_PREVIEW_LIMIT).optional(),
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

export interface RegisteredDatasetWithPreview extends RegisteredDataset {
  previewRows: Record<string, unknown>[];
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

function pushMetric(metric: QueryMetrics): void {
  queryMetrics.unshift(metric);

  if (queryMetrics.length > MAX_METRICS) {
    queryMetrics.pop();
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

function makeDatasetId(): string {
  return `ds_${nanoid(12)}`;
}

function datasetViewName(datasetId: string): string {
  return DatasetIdSchema.parse(datasetId);
}

function buildCsvOptions(options: {
  hasHeader?: boolean;
  delimiter?: string;
  sampleSize?: number;
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
function assertReadOnlySql(sql: string): string {
  const trimmed = sql.trim();
  const upper = trimmed.toUpperCase();

  const allowed =
    upper.startsWith("SELECT") ||
    upper.startsWith("WITH") ||
    upper.startsWith("SHOW") ||
    upper.startsWith("DESCRIBE") ||
    upper.startsWith("SUMMARIZE") ||
    upper.startsWith("EXPLAIN");

  if (!allowed) {
    throw new Error("Only read-only DuckDB queries are allowed from renderer.");
  }

  const blocked =
    /\b(CREATE|DROP|ALTER|INSERT|UPDATE|DELETE|COPY|EXPORT|IMPORT|ATTACH|DETACH|INSTALL|LOAD|CALL|PRAGMA)\b/i;

  if (blocked.test(trimmed)) {
    throw new Error("Unsafe SQL statement blocked.");
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

      const threads = String(Math.max(1, os.availableParallelism?.() ?? 4));

      instance = await DuckDBInstance.create(dbPath, {
        threads,
      });

      writeConn = await instance.connect();

      readConns = [];
      for (let i = 0; i < READ_CONN_COUNT; i += 1) {
        readConns.push(await instance.connect());
      }

      activeDbPath = dbPath;
      activeDatasetsDir = datasetsDir;

      const pragmas = [`PRAGMA threads = ${threads}`, "PRAGMA enable_progress_bar = false"];

      for (const pragma of pragmas) {
        await writeConn.run(pragma);

        for (const readConn of readConns) {
          await readConn.run(pragma);
        }
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

// ─── Lifecycle ────────────────────────────────────────────────────────────────

export async function close(): Promise<void> {
  writeQueue.clear();
  readQueue.clear();

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
