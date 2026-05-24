"use client";

/**
 * Typed wrapper for Electron IPC filesystem operations.
 * Injected by electron/preload.ts as window.electronFS.
 */

export interface ElectronOpenDialogOptions {
  title?: string;
  filters?: { name: string; extensions: string[] }[];
  properties?: Array<"openFile" | "openDirectory" | "multiSelections">;
}

export interface ElectronSaveDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: { name: string; extensions: string[] }[];
}

interface ElectronFSBridge {
  getDataDir(): Promise<string>;
  readFile(filePath: string): Promise<ArrayBuffer>;
  writeFile(filePath: string, data: ArrayBuffer): Promise<void>;
  deleteFile(filePath: string): Promise<boolean>;
  listFiles(dir?: string): Promise<string[]>;
  listFilesRecursive(dir: string): Promise<string[]>;
  fileExists(filePath: string): Promise<boolean>;
  openDialog(
    options: ElectronOpenDialogOptions,
  ): Promise<{ canceled: boolean; filePaths: string[] }>;
  saveDialog(
    options: ElectronSaveDialogOptions,
  ): Promise<{ canceled: boolean; filePath?: string }>;
}

export interface ElectronDuckDBBridge {
  init(): Promise<{ success: boolean }>;
  runQuery(sql: string): Promise<Record<string, unknown>[]>;
  runBatch(sqls: string[]): Promise<Record<string, unknown>[][]>;
  prepare(sql: string): Promise<string>;
  execute(
    stmtId: string,
    params: unknown[],
  ): Promise<Record<string, unknown>[]>;
  disposePrepared(stmtId: string): Promise<void>;
  listTables(): Promise<string[]>;
  getTableInfo(tableName: string): Promise<{
    columns: Array<{ name: string; type: string; nullable: boolean }>;
    rowCount: number;
  }>;
  getColumnStats(
    tableName: string,
    columnName: string,
  ): Promise<{
    min: unknown;
    max: unknown;
    avg: unknown;
    nullCount: number;
    distinctCount: number;
    histogram: Array<{ bucket: string; count: number }>;
  }>;
  loadCSVPath(
    tableName: string,
    filePath: string,
    append?: boolean,
    hasHeader?: boolean,
  ): Promise<void>;
  loadJSONPath(tableName: string, filePath: string): Promise<void>;
  loadCSVBuffer(
    tableName: string,
    buffer: ArrayBuffer,
    append?: boolean,
    hasHeader?: boolean,
  ): Promise<void>;
  loadJSONBuffer(tableName: string, buffer: ArrayBuffer): Promise<void>;
  exportTableToParquet(tableName: string, filePath: string): Promise<void>;
  loadTableFromParquet(tableName: string, filePath: string): Promise<void>;
  clearTable(tableName: string): Promise<void>;
  getStatus(): Promise<{
    opfsPersistenceActive: boolean;
    dbPath: string | null;
  }>;
  getQueryMetrics(): Promise<
    Array<{
      sql: string;
      durationMs: number;
      timestamp: number;
      rowCount: number;
    }>
  >;
  clearQueryMetrics(): Promise<void>;
}

function bridge(): ElectronFSBridge {
  if (typeof window === "undefined" || !("electronFS" in window)) {
    throw new Error(
      "electronFS not available — ensure the app is running inside Electron",
    );
  }
  return (window as Window & { electronFS: ElectronFSBridge }).electronFS;
}

export function isElectron(): boolean {
  return typeof window !== "undefined" && "electronFS" in window;
}

export function duckdbBridge(): ElectronDuckDBBridge {
  if (typeof window === "undefined" || !("electronDuckDB" in window)) {
    throw new Error(
      "electronDuckDB not available — ensure the app is running inside Electron",
    );
  }
  return (window as Window & { electronDuckDB: ElectronDuckDBBridge })
    .electronDuckDB;
}

export function getDataDir(): Promise<string> {
  return bridge().getDataDir();
}

export function readLocalFile(filePath: string): Promise<ArrayBuffer> {
  return bridge().readFile(filePath);
}

export function writeLocalFile(
  filePath: string,
  data: ArrayBuffer,
): Promise<void> {
  return bridge().writeFile(filePath, data);
}

export function deleteLocalFile(filePath: string): Promise<boolean> {
  return bridge().deleteFile(filePath);
}

export function listLocalFiles(dir?: string): Promise<string[]> {
  return bridge().listFiles(dir);
}

export function listLocalFilesRecursive(dir: string): Promise<string[]> {
  return bridge().listFilesRecursive(dir);
}

export function localFileExists(filePath: string): Promise<boolean> {
  return bridge().fileExists(filePath);
}

export async function openFileDialog(
  options: ElectronOpenDialogOptions,
): Promise<string[]> {
  const result = await bridge().openDialog(options);
  return result.canceled ? [] : result.filePaths;
}

export async function saveFileDialog(
  options: ElectronSaveDialogOptions,
): Promise<string | null> {
  const result = await bridge().saveDialog(options);
  return result.canceled || !result.filePath ? null : result.filePath;
}

/** Build a local file path under the app data directory. */
export async function localDataPath(filename: string): Promise<string> {
  const dir = await getDataDir();
  // Path sep is / on Unix and \ on Windows; the main process normalises this.
  return `${dir}/${filename}`;
}
