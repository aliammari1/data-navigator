"use client";

/**
 * Typed wrapper for Electron IPC filesystem + DuckDB dataset operations.
 *
 * Injected by electron/preload.ts as:
 * - window.electronFS
 * - window.electronDuckDB
 *
 * Dataset-only DuckDB model:
 * - No raw SQL from renderer.
 * - No table restore from renderer.
 * - No CSV/JSON buffer upload path.
 * - Renderer registers local file paths selected through Electron dialogs.
 */

// ─── Filesystem Bridge Types ──────────────────────────────────────────────────

export interface ElectronOpenDialogOptions {
  title?: string;
  filters?: Array<{
    name: string;
    extensions: string[];
  }>;
  properties?: Array<
    | "openFile"
    | "openDirectory"
    | "multiSelections"
    | "showHiddenFiles"
    | "createDirectory"
    | "promptToCreate"
    | "noResolveAliases"
    | "treatPackageAsDirectory"
    | "dontAddToRecent"
  >;
}

export interface ElectronSaveDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: Array<{
    name: string;
    extensions: string[];
  }>;
}

export interface ElectronFSBridge {
  getDataDir(): Promise<string>;

  readFile(filePath: string): Promise<ArrayBuffer>;

  writeFile(filePath: string, data: ArrayBuffer): Promise<void>;

  deleteFile(filePath: string): Promise<boolean>;

  listFiles(dir?: string): Promise<string[]>;

  listFilesRecursive(dir: string): Promise<string[]>;

  fileExists(filePath: string): Promise<boolean>;

  openDialog(options: ElectronOpenDialogOptions): Promise<{
    canceled: boolean;
    filePaths: string[];
  }>;

  saveDialog(options: ElectronSaveDialogOptions): Promise<{
    canceled: boolean;
    filePath?: string;
  }>;

  /** Resolve a dropped File to its on-disk path (Electron webUtils). */
  getPathForFile(file: File): string;
}

// ─── DuckDB Dataset Bridge Types ──────────────────────────────────────────────

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

export interface ElectronDuckDBBridge {
  init(): Promise<{ success: boolean }>;

  registerCSVPathDataset(input: RegisterCSVPathDatasetInput): Promise<RegisteredDatasetWithPreview>;

  registerParquetPathDataset(
    input: RegisterParquetPathDatasetInput,
  ): Promise<RegisteredDatasetWithPreview>;

  listDatasets(): Promise<RegisteredDataset[]>;

  previewDataset(input: PreviewDatasetInput): Promise<Record<string, unknown>[]>;

  summarizeDataset(input: DatasetOnlyInput): Promise<Record<string, unknown>[]>;

  exportDataset(input: ExportDatasetInput): Promise<void>;

  deleteDataset(input: DatasetOnlyInput): Promise<void>;

  getStatus(): Promise<DuckDBStatus>;

  getQueryMetrics(): Promise<QueryMetric[]>;

  clearQueryMetrics(): Promise<void>;

  runReadOnlyQuery(sql: string): Promise<Record<string, unknown>[]>;
}

// ─── Window Type ──────────────────────────────────────────────────────────────

type ElectronWindow = Window & {
  electronFS?: ElectronFSBridge;
  electronDuckDB?: ElectronDuckDBBridge;
};

// ─── Internal Bridge Accessors ────────────────────────────────────────────────

function fsBridge(): ElectronFSBridge {
  if (typeof window === "undefined") {
    throw new Error("window is not available.");
  }

  const bridge = (window as ElectronWindow).electronFS;

  if (!bridge) {
    throw new Error("electronFS not available — ensure the app is running inside Electron.");
  }

  return bridge;
}

export function duckdbBridge(): ElectronDuckDBBridge {
  if (typeof window === "undefined") {
    throw new Error("window is not available.");
  }

  const bridge = (window as ElectronWindow).electronDuckDB;

  if (!bridge) {
    throw new Error("electronDuckDB not available — ensure the app is running inside Electron.");
  }

  return bridge;
}

// ─── Runtime Detection ────────────────────────────────────────────────────────

export function isElectron(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean((window as ElectronWindow).electronFS) &&
    Boolean((window as ElectronWindow).electronDuckDB)
  );
}

export function hasElectronFS(): boolean {
  return typeof window !== "undefined" && Boolean((window as ElectronWindow).electronFS);
}

export function hasElectronDuckDB(): boolean {
  return typeof window !== "undefined" && Boolean((window as ElectronWindow).electronDuckDB);
}

// ─── Filesystem API ───────────────────────────────────────────────────────────

export function getDataDir(): Promise<string> {
  return fsBridge().getDataDir();
}

export function readLocalFile(filePath: string): Promise<ArrayBuffer> {
  return fsBridge().readFile(filePath);
}

export function writeLocalFile(filePath: string, data: ArrayBuffer): Promise<void> {
  return fsBridge().writeFile(filePath, data);
}

export function deleteLocalFile(filePath: string): Promise<boolean> {
  return fsBridge().deleteFile(filePath);
}

export function listLocalFiles(dir?: string): Promise<string[]> {
  return fsBridge().listFiles(dir);
}

export function listLocalFilesRecursive(dir: string): Promise<string[]> {
  return fsBridge().listFilesRecursive(dir);
}

export function localFileExists(filePath: string): Promise<boolean> {
  return fsBridge().fileExists(filePath);
}

export async function openFileDialog(options: ElectronOpenDialogOptions): Promise<string[]> {
  const result = await fsBridge().openDialog(options);
  return result.canceled ? [] : result.filePaths;
}

/**
 * Resolve dropped `File` objects to trusted on-disk paths via Electron
 * `webUtils.getPathForFile` (File.path was removed in Electron 41). Returns the
 * paths that resolved; entries that can't be resolved (e.g. web build) are
 * skipped. Enables drag-and-drop import.
 */
export function getDroppedFilePaths(files: File[]): string[] {
  if (!hasElectronFS()) return [];
  const bridge = fsBridge();
  const paths: string[] = [];
  for (const file of files) {
    try {
      const path = bridge.getPathForFile(file);
      if (path) paths.push(path);
    } catch {
      // ignore files that can't be resolved to a path
    }
  }
  return paths;
}

export async function saveFileDialog(options: ElectronSaveDialogOptions): Promise<string | null> {
  const result = await fsBridge().saveDialog(options);
  return result.canceled || !result.filePath ? null : result.filePath;
}

/**
 * Build a local file path under the app data directory.
 *
 * This is only a string helper. The main process still validates actual
 * filesystem access.
 */
export async function localDataPath(filename: string): Promise<string> {
  const dir = await getDataDir();
  return `${dir}/${filename}`;
}

// ─── DuckDB Dataset API Convenience Wrappers ──────────────────────────────────

export async function initDuckDB(): Promise<void> {
  await duckdbBridge().init();
}

export function registerCSVPathDataset(
  input: RegisterCSVPathDatasetInput,
): Promise<RegisteredDatasetWithPreview> {
  return duckdbBridge().registerCSVPathDataset(input);
}

export function registerParquetPathDataset(
  input: RegisterParquetPathDatasetInput,
): Promise<RegisteredDatasetWithPreview> {
  return duckdbBridge().registerParquetPathDataset(input);
}

export function listDatasets(): Promise<RegisteredDataset[]> {
  return duckdbBridge().listDatasets();
}

export function previewDataset(input: PreviewDatasetInput): Promise<Record<string, unknown>[]> {
  return duckdbBridge().previewDataset(input);
}

export function summarizeDataset(input: DatasetOnlyInput): Promise<Record<string, unknown>[]> {
  return duckdbBridge().summarizeDataset(input);
}

export function exportDataset(input: ExportDatasetInput): Promise<void> {
  return duckdbBridge().exportDataset(input);
}

export function deleteDataset(input: DatasetOnlyInput): Promise<void> {
  return duckdbBridge().deleteDataset(input);
}

export function getDuckDBStatus(): Promise<DuckDBStatus> {
  return duckdbBridge().getStatus();
}

export function getDuckDBQueryMetrics(): Promise<QueryMetric[]> {
  return duckdbBridge().getQueryMetrics();
}

export function clearDuckDBQueryMetrics(): Promise<void> {
  return duckdbBridge().clearQueryMetrics();
}
