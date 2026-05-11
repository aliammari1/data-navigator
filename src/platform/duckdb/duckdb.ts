"use client";

/**
 * DuckDB public API — delegates queries to the worker client and handles
 * local-filesystem persistence via Electron IPC.
 *
 * All public function signatures are preserved for backward compatibility.
 */

import {
  deleteLocalFile,
  getDataDir,
  isElectron,
  localFileExists,
  readLocalFile,
  writeLocalFile,
} from "@/platform/electron/electron-fs";
import { sharedDuckDB } from "./shared-duckdb";

export type { ColumnStats, TableInfo, WorkerStatus } from "./shared-duckdb";

// ─── Local parquet path helper ────────────────────────────────────────────────

async function parquetPath(tableName: string): Promise<string> {
  const dir = await getDataDir();
  return `${dir}/${tableName}.parquet`;
}

// ─── Core query / table operations ───────────────────────────────────────────

export async function runQuery(
  sql: string,
): Promise<Record<string, unknown>[]> {
  return sharedDuckDB.runQuery(sql);
}

export async function listTables(): Promise<string[]> {
  return sharedDuckDB.listTables();
}

export async function getTableInfo(tableName: string): Promise<{
  columns: Array<{ name: string; type: string; nullable: boolean }>;
  rowCount: number;
}> {
  return sharedDuckDB.getTableInfo(tableName);
}

export async function getColumnStats(
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
  return sharedDuckDB.getColumnStats(tableName, columnName);
}

// ─── CSV / JSON loaders ───────────────────────────────────────────────────────

export async function loadDelimitedCSVFromFile(
  tableName: string,
  file: File,
  delimiter = ",",
  append = false,
  hasHeader = true,
): Promise<void> {
  return sharedDuckDB.loadCSVFile(tableName, file, delimiter, append, hasHeader);
}

export async function loadDelimitedCSVToDuckDB(
  tableName: string,
  csvContent: string,
  delimiter = ",",
  append = false,
  hasHeader = true,
): Promise<void> {
  const buffer = new TextEncoder().encode(csvContent).buffer as ArrayBuffer;
  return sharedDuckDB.loadCSV(tableName, buffer, delimiter, append, hasHeader);
}

export async function loadCSVToDuckDB(
  tableName: string,
  csvContent: string,
): Promise<void> {
  return loadDelimitedCSVToDuckDB(tableName, csvContent, ",");
}

export async function loadJSONToDuckDB(
  tableName: string,
  data: Record<string, unknown>[],
): Promise<void> {
  return sharedDuckDB.loadJSON(tableName, data);
}

export async function loadJSONFileToDuckDB(
  tableName: string,
  file: File,
): Promise<void> {
  return sharedDuckDB.loadJSONFile(tableName, file);
}

// ─── Local filesystem persistence ────────────────────────────────────────────

/**
 * Export a table to Parquet and write it to the local filesystem.
 * Requires Electron (uses IPC to write the file).
 */
export async function exportTableToParquet(tableName: string): Promise<void> {
  if (!isElectron()) {
    throw new Error(
      "exportTableToParquet requires Electron — local filesystem not available in browser.",
    );
  }
  const buf = await sharedDuckDB.exportTableToParquet(tableName);
  await writeLocalFile(await parquetPath(tableName), buf);
}

/**
 * Load a table from its local Parquet file.
 * Returns true if the file existed and the table was restored.
 */
export async function loadTableFromParquet(
  tableName: string,
): Promise<boolean> {
  if (!isElectron()) return false;
  const filePath = await parquetPath(tableName);
  const exists = await localFileExists(filePath);
  if (!exists) return false;
  const buf = await readLocalFile(filePath);
  return sharedDuckDB.loadTableFromParquet(tableName, buf);
}

/**
 * Drop a table from DuckDB and delete its local Parquet file.
 */
export async function clearTable(tableName: string): Promise<void> {
  await sharedDuckDB.clearTable(tableName);
  if (isElectron()) {
    await deleteLocalFile(await parquetPath(tableName));
  }
}

/**
 * Returns the runtime status of the DuckDB worker.
 */
export async function getWorkerStatus() {
  return sharedDuckDB.getStatus();
}
