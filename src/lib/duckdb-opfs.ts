/**
 * DuckDB OPFS facade — delegates persistence operations to the SharedWorker.
 *
 * Previously this file opened its own DuckDB instance for OPFS access.
 * All operations now go through the SharedWorker, which is the sole DuckDB
 * runtime. No @duckdb/duckdb-wasm import exists in this file.
 *
 * Public function signatures are preserved for backward compatibility.
 */

"use client";

import { sharedDuckDB } from "./shared-duckdb";

/**
 * Check if a persisted Parquet file exists for the given table in OPFS.
 * Uses the OPFS file API directly — no DuckDB needed for the check.
 */
export async function opfsDBExists(
  tableName = "data-navigator-telecom",
): Promise<boolean> {
  if (typeof navigator === "undefined" || !("storage" in navigator))
    return false;
  try {
    const root = await navigator.storage.getDirectory();
    await root.getFileHandle(`${tableName}.parquet`, { create: false });
    return true;
  } catch {
    return false;
  }
}

/**
 * @deprecated openOPFSDatabase() is no longer available — the SharedWorker
 * manages the DuckDB instance and its OPFS persistence internally.
 * Use loadTableFromOPFS() to restore a previously exported table.
 */
export async function openOPFSDatabase(): Promise<never> {
  throw new Error(
    "openOPFSDatabase() is not available in the SharedWorker runtime. " +
      "Use loadTableFromOPFS(tableName) to restore a persisted table.",
  );
}

/**
 * Export a DuckDB table to a Parquet file in OPFS via the SharedWorker.
 * The connection parameter is accepted for backward compatibility but ignored —
 * the SharedWorker uses its own internal connection.
 */
export async function exportTableToOPFS(
  tableName: string,
  _connection?: unknown,
): Promise<void> {
  return sharedDuckDB.exportTableToParquet(tableName);
}

/**
 * Load a previously exported Parquet file from OPFS into DuckDB via the SharedWorker.
 * Returns true if successful.
 * The connection parameter is accepted for backward compatibility but ignored.
 */
export async function loadTableFromOPFS(
  tableName: string,
  _connection?: unknown,
): Promise<boolean> {
  return sharedDuckDB.loadTableFromParquet(tableName);
}

/**
 * Delete the OPFS Parquet file and drop the DuckDB table via the SharedWorker.
 */
export async function clearOPFSDatabase(tableName: string): Promise<void> {
  return sharedDuckDB.clearTable(tableName);
}
