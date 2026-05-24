"use client";

/**
 * Local-filesystem persistence facade — Electron edition.
 *
 * Previously backed by OPFS; all persistence now goes through Electron IPC
 * (electron-fs.ts). Public function signatures are preserved for backward
 * compatibility with callers.
 */

import {
  getDataDir,
  isElectron,
  localFileExists,
  openFileDialog,
} from "@/platform/electron/electron-fs";
import {
  clearTable,
  exportTableToParquet,
  loadTableFromParquet,
} from "./duckdb";

function parquetFileName(tableName: string): string {
  return `${tableName}.parquet`;
}

async function parquetFilePath(tableName: string): Promise<string> {
  const dir = await getDataDir();
  return `${dir}/${parquetFileName(tableName)}`;
}

/**
 * Check if a persisted Parquet file exists for the given table.
 */
export async function opfsDBExists(
  tableName = "data-navigator-telecom",
): Promise<boolean> {
  if (!isElectron()) return false;
  return localFileExists(await parquetFilePath(tableName));
}

/**
 * Export a DuckDB table to a Parquet file on the local filesystem.
 */
export async function exportTableToFS(
  tableName: string,
  _connection?: unknown,
): Promise<void> {
  return exportTableToParquet(tableName);
}

/**
 * Load a previously exported Parquet file from the local filesystem into DuckDB.
 * Returns true if the file existed and the table was restored.
 */
export async function loadTableFromFS(
  tableName: string,
  _connection?: unknown,
): Promise<boolean> {
  return loadTableFromParquet(tableName);
}

/**
 * Delete the local Parquet file and drop the DuckDB table.
 */
export async function clearFSDatabase(tableName: string): Promise<void> {
  return clearTable(tableName);
}

/**
 * Export a table to Parquet and trigger a Save dialog so the user can choose
 * where to save it on their local filesystem.
 */
export async function exportTableSnapshotFile(
  tableName: string,
): Promise<void> {
  if (!isElectron()) {
    throw new Error("exportTableSnapshotFile requires Electron.");
  }

  // Ask user where to save
  const { saveFileDialog } = await import("@/platform/electron/electron-fs");
  const savePath = await saveFileDialog({
    title: "Save table snapshot",
    defaultPath: parquetFileName(tableName),
    filters: [{ name: "Parquet", extensions: ["parquet"] }],
  });

  if (!savePath) return;

  // Export directly to the chosen path via Node API
  const { duckdbBridge } = await import("@/platform/electron/electron-fs");
  await duckdbBridge().exportTableToParquet(tableName, savePath);
}

/**
 * Open a file dialog so the user can pick a local file for DuckDB to read.
 * Returns the selected file paths (empty if canceled).
 */
export async function openLocalFileDialog(options?: {
  title?: string;
  filters?: { name: string; extensions: string[] }[];
}): Promise<string[]> {
  return openFileDialog({
    title: options?.title ?? "Open file",
    filters: options?.filters ?? [
      { name: "Data files", extensions: ["csv"] },
      { name: "All files", extensions: ["*"] },
    ],
    properties: ["openFile", "multiSelections"],
  });
}
