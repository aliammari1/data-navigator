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
  options?: { cache?: boolean; priority?: string },
): Promise<Record<string, unknown>[]> {
  return sharedDuckDB.runQuery(sql, options);
}

export async function runBatch(
  sqls: string[],
): Promise<Record<string, unknown>[][]> {
  return sharedDuckDB.runBatch(sqls);
}

export async function warmCache(
  sql: string,
): Promise<Record<string, unknown>[]> {
  return sharedDuckDB.warmCache(sql);
}

export function getQueryMetrics() {
  return sharedDuckDB.getQueryMetrics();
}

export function clearQueryMetrics() {
  return sharedDuckDB.clearQueryMetrics();
}

export async function prepareStatement(sql: string): Promise<string> {
  return sharedDuckDB.prepare(sql);
}

export async function executeStatement(
  stmtId: string,
  params: unknown[],
): Promise<Record<string, unknown>[]> {
  return sharedDuckDB.execute(stmtId, params);
}

export async function disposeStatement(stmtId: string): Promise<void> {
  return sharedDuckDB.disposePrepared(stmtId);
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
  append = false,
  hasHeader = true,
): Promise<void> {
  return sharedDuckDB.loadCSVFile(
    tableName,
    file,
    append,
    hasHeader,
  );
}

export async function loadDelimitedCSVToDuckDB(
  tableName: string,
  csvContent: string,
  append = false,
  hasHeader = true,
): Promise<void> {
  const buffer = new TextEncoder().encode(csvContent).buffer as ArrayBuffer;
  return sharedDuckDB.loadCSV(tableName, buffer, append, hasHeader);
}

export async function loadCSVToDuckDB(
  tableName: string,
  csvContent: string,
): Promise<void> {
  return loadDelimitedCSVToDuckDB(tableName, csvContent);
}

export async function loadJSONToDuckDB(
  tableName: string,
  data: Record<string, unknown>[],
): Promise<void> {
  return sharedDuckDB.loadJSON(tableName, data);
}

// ─── Path-based CSV / JSON loaders (preferred for Electron) ───────────────────

export async function loadCSVPathToDuckDB(
  tableName: string,
  filePath: string,
  append = false,
  hasHeader = true,
): Promise<void> {
  const { duckdbBridge } = await import("@/platform/electron/electron-fs");
  return duckdbBridge().loadCSVPath(
    tableName,
    filePath,
    append,
    hasHeader,
  );
}

export async function loadJSONPathToDuckDB(
  tableName: string,
  filePath: string,
): Promise<void> {
  const { duckdbBridge } = await import("@/platform/electron/electron-fs");
  return duckdbBridge().loadJSONPath(tableName, filePath);
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
  const filePath = await parquetPath(tableName);
  const { duckdbBridge } = await import("@/platform/electron/electron-fs");
  await duckdbBridge().exportTableToParquet(tableName, filePath);
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
  const { duckdbBridge } = await import("@/platform/electron/electron-fs");
  await duckdbBridge().loadTableFromParquet(tableName, filePath);
  return true;
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
