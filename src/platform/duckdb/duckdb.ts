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

type DatasetSourceFormat = "csv" | "parquet";

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

interface ColumnDetail {
  column: string;
  distinctApprox: number;
  topValues: Array<{ value: unknown; count: number | null }>;
  histogram: Array<{ bin: string; count: number }>;
}

export interface ProfileDatasetInput {
  datasetId: string;
  cancelToken?: string;
}

interface ProfileColumnDetailInput {
  datasetId: string;
  column: string;
  topK?: number;
  binCount?: number;
  cancelToken?: string;
}

interface CountRowsInput {
  datasetId: string;
  where?: string;
  force?: boolean;
  cancelToken?: string;
}

interface KeysetSortKey {
  column: string;
  direction?: "ASC" | "DESC";
}

interface KeysetCursor {
  sortValues: unknown[];
  rowid: number;
}

interface KeysetPageInput {
  datasetId: string;
  sortKeys: KeysetSortKey[];
  limit: number;
  where?: string;
  cursor?: KeysetCursor;
  columns?: string[];
  cancelToken?: string;
}

interface KeysetPageResult {
  arrow: Uint8Array;
  nextCursor: KeysetCursor | null;
  rowCount: number;
}

export interface RegisterParquetPathDatasetInput {
  filePath: string;
  displayName?: string;
  previewLimit?: number;
}

interface PreviewDatasetInput {
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

interface QueryMetric {
  sql: string;
  durationMs: number;
  timestamp: number;
  rowCount: number;
}

interface DuckDBStatus {
  active: boolean;
  dbPath: string | null;
  datasetsDir: string | null;
  readConnections: number;
  pendingReads: number;
  pendingWrites: number;
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

// ─── Single-scan profiling pushdown ───────────────────────────────────────────

/** Whole-dataset profile in one SUMMARIZE scan (approximate, cheap). */
export async function profileDataset(input: ProfileDatasetInput): Promise<SummarizeRow[]> {
  return sharedDuckDB.profileDataset(input);
}

// ─── Cached COUNT(*) ──────────────────────────────────────────────────────────

// ─── Keyset / seek pagination ─────────────────────────────────────────────────

// ─── Cancellation ─────────────────────────────────────────────────────────────

// ─── Re-exports: Arrow decode + SQL builders ──────────────────────────────────

export { quoteIdent } from "./pushdown";
