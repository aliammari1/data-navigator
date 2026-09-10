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

import { duckdbClient } from "./duckdb-client";

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

export interface RegisterParquetPathDatasetInput {
  filePath: string;
  displayName?: string;
  previewLimit?: number;
}

export interface DatasetOnlyInput {
  datasetId: string;
}

export interface ExportDatasetInput {
  datasetId: string;
  targetPath: string;
}

// ─── Dataset Registration ─────────────────────────────────────────────────────

export async function registerCSVPathDataset(
  input: RegisterCSVPathDatasetInput,
): Promise<RegisteredDatasetWithPreview> {
  return duckdbClient.registerCSVPathDataset(input);
}

export async function registerParquetPathDataset(
  input: RegisterParquetPathDatasetInput,
): Promise<RegisteredDatasetWithPreview> {
  return duckdbClient.registerParquetPathDataset(input);
}

// ─── Dataset Reads ────────────────────────────────────────────────────────────

export async function listRegisteredDatasets(): Promise<RegisteredDataset[]> {
  return duckdbClient.listDatasets();
}

// ─── Dataset Export / Delete ──────────────────────────────────────────────────

export async function exportRegisteredDataset(input: ExportDatasetInput): Promise<void> {
  await duckdbClient.exportDataset(input);
}

export async function deleteRegisteredDataset(input: DatasetOnlyInput): Promise<void> {
  await duckdbClient.deleteDataset(input);
}

export async function runReadOnlyQuery(sql: string): Promise<Record<string, unknown>[]> {
  return duckdbClient.runReadOnlyQuery(sql);
}

// ─── Arrow IPC transport (large windows / exports / worker hand-off) ──────────

// ─── Cached COUNT(*) ──────────────────────────────────────────────────────────

// ─── Keyset / seek pagination ─────────────────────────────────────────────────

// ─── Cancellation ─────────────────────────────────────────────────────────────

// ─── Re-exports: Arrow decode + SQL builders ──────────────────────────────────

export { quoteIdent } from "./pushdown";
