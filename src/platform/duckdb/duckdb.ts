"use client";

/**
 * DuckDB public renderer API.
 *
 * Dataset mental model:
 * - CSV / Parquet files are registered as datasets.
 * - DuckDB main process converts CSV to managed Parquet cache.
 * - DuckDB exposes each dataset through a stable view.
 * - Renderer code should use dataset IDs, not raw table names or SQL.
 */

import { sharedDuckDB } from "./shared-duckdb";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DatasetSourceFormat = "csv" | "parquet";

export interface RegisteredDatasetColumn {
  name: string;
  type: string;
  nullable: boolean;
}

export interface RegisteredDataset {
  id: string;
  displayName: string;
  viewName: string;
  sourcePath: string;
  cachePath: string;
  sourceFormat: DatasetSourceFormat;
  rowCount: number;
  columns: RegisteredDatasetColumn[];
  createdAt: string;
  updatedAt: string;
}

export interface RejectError {
  line: number | null;
  columnName: string | null;
  errorType: string | null;
  errorMessage: string | null;
}

export interface RejectSummary {
  rejectedRowCount: number;
  sample: RejectError[];
}

export interface RegisteredDatasetWithPreview extends RegisteredDataset {
  previewRows: Record<string, unknown>[];
  rejects?: RejectSummary;
}

export type CsvEncoding = "utf-8" | "utf-16" | "latin-1";

export interface RegisterCSVPathDatasetInput {
  filePath: string;
  displayName?: string;
  hasHeader?: boolean;
  delimiter?: string;
  sampleSize?: number;
  previewLimit?: number;
  encoding?: CsvEncoding;
  storeRejects?: boolean;
}

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

export interface ProfileDatasetInput {
  datasetId: string;
  cancelToken?: string;
}

export interface ProfileColumnDetailInput {
  datasetId: string;
  column: string;
  topK?: number;
  binCount?: number;
  cancelToken?: string;
}

export interface CountRowsInput {
  datasetId: string;
  where?: string;
  force?: boolean;
  cancelToken?: string;
}

export interface KeysetSortKey {
  column: string;
  direction?: "ASC" | "DESC";
}

export interface KeysetCursor {
  sortValues: unknown[];
  rowid: number;
}

export interface KeysetPageInput {
  datasetId: string;
  sortKeys: KeysetSortKey[];
  limit: number;
  where?: string;
  cursor?: KeysetCursor;
  columns?: string[];
  cancelToken?: string;
}

export interface KeysetPageResult {
  arrow: Uint8Array;
  nextCursor: KeysetCursor | null;
  rowCount: number;
}

export interface RegisterParquetPathDatasetInput {
  filePath: string;
  displayName?: string;
  previewLimit?: number;
}

export interface PreviewDatasetInput {
  datasetId: string;
  limit?: number;
  offset?: number;
}

export interface DatasetOnlyInput {
  datasetId: string;
}

export interface ExportDatasetInput {
  datasetId: string;
  targetPath: string;
}

export interface QueryMetric {
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

// ─── Runtime ──────────────────────────────────────────────────────────────────

export async function initDuckDB(): Promise<void> {
  await sharedDuckDB.init();
}

export async function getDuckDBStatus(): Promise<DuckDBStatus> {
  return sharedDuckDB.getStatus();
}

export async function getQueryMetrics(): Promise<QueryMetric[]> {
  return sharedDuckDB.getQueryMetrics();
}

export async function clearQueryMetrics(): Promise<void> {
  return sharedDuckDB.clearQueryMetrics();
}

// ─── Dataset Registration ─────────────────────────────────────────────────────

export async function registerCSVPathDataset(
  input: RegisterCSVPathDatasetInput,
): Promise<RegisteredDatasetWithPreview> {
  return sharedDuckDB.registerCSVPathDataset(input);
}

export async function registerParquetPathDataset(
  input: RegisterParquetPathDatasetInput,
): Promise<RegisteredDatasetWithPreview> {
  return sharedDuckDB.registerParquetPathDataset(input);
}

// ─── Dataset Reads ────────────────────────────────────────────────────────────

export async function listRegisteredDatasets(): Promise<RegisteredDataset[]> {
  return sharedDuckDB.listDatasets();
}

export async function previewRegisteredDataset(
  input: PreviewDatasetInput,
): Promise<Record<string, unknown>[]> {
  return sharedDuckDB.previewDataset(input);
}

export async function summarizeRegisteredDataset(
  input: DatasetOnlyInput,
): Promise<Record<string, unknown>[]> {
  return sharedDuckDB.summarizeDataset(input);
}

// ─── Dataset Export / Delete ──────────────────────────────────────────────────

export async function exportRegisteredDataset(input: ExportDatasetInput): Promise<void> {
  await sharedDuckDB.exportDataset(input);
}

export async function deleteRegisteredDataset(input: DatasetOnlyInput): Promise<void> {
  await sharedDuckDB.deleteDataset(input);
}

export async function runReadOnlyQuery(sql: string): Promise<Record<string, unknown>[]> {
  return sharedDuckDB.runReadOnlyQuery(sql);
}

// ─── Arrow IPC transport (large windows / exports / worker hand-off) ──────────

/**
 * Run a read-only query and return Arrow IPC stream bytes (transferable).
 * Decode with {@link decodeArrowIPC} from `./arrow-ipc` — ideally inside a
 * worker. Pass `cancelToken` to tie the scan to a cancellable group.
 */
export async function runReadOnlyQueryArrow(
  sql: string,
  cancelToken?: string,
): Promise<Uint8Array> {
  return sharedDuckDB.runReadOnlyQueryArrow(sql, cancelToken);
}

// ─── Single-scan profiling pushdown ───────────────────────────────────────────

/** Whole-dataset profile in one SUMMARIZE scan (approximate, cheap). */
export async function profileDataset(input: ProfileDatasetInput): Promise<SummarizeRow[]> {
  return sharedDuckDB.profileDataset(input);
}

/** Per-selected-column detail (distinct/top-K/histogram). Call lazily. */
export async function profileColumnDetail(input: ProfileColumnDetailInput): Promise<ColumnDetail> {
  return sharedDuckDB.profileColumnDetail(input);
}

// ─── Cached COUNT(*) ──────────────────────────────────────────────────────────

/** Filter-aware COUNT(*), cached per (view, where). */
export async function countRows(input: CountRowsInput): Promise<number> {
  return sharedDuckDB.countRows(input);
}

// ─── Keyset / seek pagination ─────────────────────────────────────────────────

/**
 * Fetch one keyset/seek page as Arrow IPC plus the cursor for the next page.
 * O(window) regardless of depth. Feed `result.nextCursor` back in as `cursor`.
 */
export async function fetchKeysetPage(input: KeysetPageInput): Promise<KeysetPageResult> {
  return sharedDuckDB.fetchKeysetPage(input);
}

// ─── Cancellation ─────────────────────────────────────────────────────────────

/** Cancel queued + in-flight scans grouped under `token`. */
export async function cancelQueries(token: string): Promise<void> {
  return sharedDuckDB.cancelQueries(token);
}

/** Reset a cancel token id so it can be reused for a fresh batch. */
export async function resetCancelToken(token: string): Promise<void> {
  return sharedDuckDB.resetCancelToken(token);
}

// ─── Re-exports: Arrow decode + SQL builders ──────────────────────────────────

export {
  type ArrowColumn,
  type ArrowIpcBytes,
  type ArrowTable,
  arrowColumnNames,
  arrowRowAt,
  arrowRowCount,
  arrowToColumns,
  arrowToRows,
  arrowTransferList,
  asUint8Array,
  type DecodeArrowOptions,
  decodeArrowIPC,
  getArrowColumn,
} from "./arrow-ipc";
export {
  buildApproxCountDistinctSQL,
  buildApproxQuantileSQL,
  buildApproxTopKSQL,
  buildCorrelationCrosstabSQL,
  buildCountSQL,
  buildHistogramAggregateSQL,
  buildHistogramTableSQL,
  buildKeysetPageSQL,
  buildOffsetPageSQL,
  buildQuantileContSQL,
  buildReservoirSampleSQL,
  buildShapeSQL,
  buildSummarizeSQL,
  type CorrelationCrosstab,
  countCacheKey,
  type KeysetPageQuery,
  quoteIdent,
  quoteLiteral,
} from "./pushdown";
