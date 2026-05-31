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

export interface RegisteredDatasetWithPreview extends RegisteredDataset {
  previewRows: Record<string, unknown>[];
}

export interface RegisterCSVPathDatasetInput {
  filePath: string;
  displayName?: string;
  hasHeader?: boolean;
  delimiter?: string;
  sampleSize?: number;
  previewLimit?: number;
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

export async function exportRegisteredDataset(
  input: ExportDatasetInput,
): Promise<void> {
  await sharedDuckDB.exportDataset(input);
}

export async function deleteRegisteredDataset(
  input: DatasetOnlyInput,
): Promise<void> {
  await sharedDuckDB.deleteDataset(input);
}

export async function runReadOnlyQuery(
  sql: string,
): Promise<Record<string, unknown>[]> {
  return sharedDuckDB.runReadOnlyQuery(sql);
}
