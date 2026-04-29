/**
 * DuckDB facade — delegates all operations to the SharedWorker client.
 *
 * All public function signatures are preserved for backward compatibility.
 * No DuckDB WASM instance is created in this file.
 * The canonical runtime lives in src/workers/duckdb-shared.worker.ts.
 */

"use client";

import { sharedDuckDB } from "./shared-duckdb";

export type { ColumnStats, TableInfo, WorkerStatus } from "./shared-duckdb";

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

/**
 * Load a delimited CSV from a File object via the SharedWorker.
 * Uses the dedicated loadCSVFile path which forwards the original filename
 * as a type-inference hint and transfers the buffer zero-copy.
 */
export async function loadDelimitedCSVFromFile(
  tableName: string,
  file: File,
  delimiter = ",",
  append = false,
): Promise<void> {
  return sharedDuckDB.loadCSVFile(tableName, file, delimiter, append);
}

/**
 * Load a delimited CSV from a string via the SharedWorker.
 */
export async function loadDelimitedCSVToDuckDB(
  tableName: string,
  csvContent: string,
  delimiter = ",",
  append = false,
): Promise<void> {
  const buffer = new TextEncoder().encode(csvContent).buffer as ArrayBuffer;
  return sharedDuckDB.loadCSV(tableName, buffer, delimiter, append);
}

/**
 * Load a comma-separated CSV string via the SharedWorker.
 */
export async function loadCSVToDuckDB(
  tableName: string,
  csvContent: string,
): Promise<void> {
  return loadDelimitedCSVToDuckDB(tableName, csvContent, ",");
}

/**
 * Load an array of JSON objects as a DuckDB table via the SharedWorker.
 */
export async function loadJSONToDuckDB(
  tableName: string,
  data: Record<string, unknown>[],
): Promise<void> {
  return sharedDuckDB.loadJSON(tableName, data);
}

// ─── OPFS / Parquet helpers (delegated to worker) ────────────────────────────

export async function exportTableToParquet(tableName: string): Promise<void> {
  return sharedDuckDB.exportTableToParquet(tableName);
}

export async function loadTableFromParquet(
  tableName: string,
): Promise<boolean> {
  return sharedDuckDB.loadTableFromParquet(tableName);
}

export async function clearTable(tableName: string): Promise<void> {
  return sharedDuckDB.clearTable(tableName);
}

/**
 * Returns the runtime status of the SharedWorker DuckDB instance,
 * including whether OPFS persistence is active.
 */
export async function getWorkerStatus() {
  return sharedDuckDB.getStatus();
}

// ─── Legacy stubs (kept for any remaining indirect references) ────────────────

/**
 * @deprecated getDuckDB() is not available when using the SharedWorker runtime.
 * Use runQuery / loadDelimitedCSVFromFile etc. from this module instead.
 */
export async function getDuckDB(): Promise<never> {
  throw new Error(
    "getDuckDB() is not available in the SharedWorker runtime. " +
      "Use the higher-level helpers (runQuery, loadDelimitedCSVFromFile, …) instead.",
  );
}

/**
 * @deprecated getDuckDBConnection() is not available when using the SharedWorker runtime.
 */
export async function getDuckDBConnection(): Promise<never> {
  throw new Error(
    "getDuckDBConnection() is not available in the SharedWorker runtime. " +
      "Use the higher-level helpers instead.",
  );
}

// setRunQueryOverride has been removed — the SharedWorker is the sole runtime.
// Any caller that previously used setRunQueryOverride should be deleted.
