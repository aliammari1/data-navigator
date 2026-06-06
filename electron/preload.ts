import { setupRenderer } from "@better-auth/electron/preload";
import { contextBridge, ipcRenderer } from "electron";
import type { authClient } from "./auth-client";

setupRenderer();

export type DataFileFilter = {
  name: string;
  extensions: string[];
};

export type OpenDialogOptions = {
  title?: string;
  filters?: DataFileFilter[];
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
};

export type SaveDialogOptions = {
  title?: string;
  defaultPath?: string;
  filters?: DataFileFilter[];
};

export type RegisteredDatasetColumn = {
  name: string;
  type: string;
  nullable: boolean;
};

export type RegisteredDataset = {
  id: string;
  displayName: string;
  viewName: string;
  sourcePath: string;
  cachePath: string;
  sourceFormat: "csv" | "parquet";
  rowCount: number;
  columns: RegisteredDatasetColumn[];
  createdAt: string;
  updatedAt: string;
};

export type RegisteredDatasetWithPreview = RegisteredDataset & {
  previewRows: Record<string, unknown>[];
};

export type RegisterCSVPathDatasetInput = {
  filePath: string;
  displayName?: string;
  hasHeader?: boolean;
  delimiter?: string;
  sampleSize?: number;
  previewLimit?: number;
};

export type RegisterParquetPathDatasetInput = {
  filePath: string;
  displayName?: string;
  previewLimit?: number;
};

export type PreviewDatasetInput = {
  datasetId: string;
  limit?: number;
  offset?: number;
};

export type DatasetOnlyInput = {
  datasetId: string;
};

export type ExportDatasetInput = {
  datasetId: string;
  targetPath: string;
};

export type QueryMetric = {
  sql: string;
  durationMs: number;
  timestamp: number;
  rowCount: number;
};

export type DuckDBStatus = {
  active: boolean;
  dbPath: string | null;
  datasetsDir: string | null;
  readConnections: number;
  pendingReads: number;
  pendingWrites: number;
};

const electronFS = {
  getDataDir: (): Promise<string> => ipcRenderer.invoke("fs:getDataDir"),

  readFile: (filePath: string): Promise<ArrayBuffer> => ipcRenderer.invoke("fs:readFile", filePath),

  writeFile: (filePath: string, data: ArrayBuffer): Promise<void> =>
    ipcRenderer.invoke("fs:writeFile", filePath, data),

  deleteFile: (filePath: string): Promise<boolean> => ipcRenderer.invoke("fs:deleteFile", filePath),

  listFiles: (dir?: string): Promise<string[]> => ipcRenderer.invoke("fs:listFiles", dir),

  listFilesRecursive: (dir: string): Promise<string[]> =>
    ipcRenderer.invoke("fs:listFilesRecursive", dir),

  fileExists: (filePath: string): Promise<boolean> => ipcRenderer.invoke("fs:fileExists", filePath),

  openDialog: (options: OpenDialogOptions): Promise<{ canceled: boolean; filePaths: string[] }> =>
    ipcRenderer.invoke("fs:openDialog", options),

  saveDialog: (options: SaveDialogOptions): Promise<{ canceled: boolean; filePath?: string }> =>
    ipcRenderer.invoke("fs:saveDialog", options),
} as const;

const electronDuckDB = {
  init: (): Promise<{ success: boolean }> => ipcRenderer.invoke("duckdb:init"),

  registerCSVPathDataset: (
    input: RegisterCSVPathDatasetInput,
  ): Promise<RegisteredDatasetWithPreview> =>
    ipcRenderer.invoke("duckdb:registerCSVPathDataset", input),

  registerParquetPathDataset: (
    input: RegisterParquetPathDatasetInput,
  ): Promise<RegisteredDatasetWithPreview> =>
    ipcRenderer.invoke("duckdb:registerParquetPathDataset", input),

  listDatasets: (): Promise<RegisteredDataset[]> => ipcRenderer.invoke("duckdb:listDatasets"),

  previewDataset: (input: PreviewDatasetInput): Promise<Record<string, unknown>[]> =>
    ipcRenderer.invoke("duckdb:previewDataset", input),

  summarizeDataset: (input: DatasetOnlyInput): Promise<Record<string, unknown>[]> =>
    ipcRenderer.invoke("duckdb:summarizeDataset", input),

  exportDataset: (input: ExportDatasetInput): Promise<void> =>
    ipcRenderer.invoke("duckdb:exportDataset", input),

  deleteDataset: (input: DatasetOnlyInput): Promise<void> =>
    ipcRenderer.invoke("duckdb:deleteDataset", input),

  getStatus: (): Promise<DuckDBStatus> => ipcRenderer.invoke("duckdb:getStatus"),

  getQueryMetrics: (): Promise<QueryMetric[]> => ipcRenderer.invoke("duckdb:getQueryMetrics"),

  clearQueryMetrics: (): Promise<void> => ipcRenderer.invoke("duckdb:clearQueryMetrics"),
  runReadOnlyQuery: (sql: string): Promise<Record<string, unknown>[]> =>
    ipcRenderer.invoke("duckdb:runReadOnlyQuery", sql),
} as const;

const electronVoice = {
  getMicrophoneAccessStatus: (): Promise<
    "not-determined" | "granted" | "denied" | "restricted" | "unknown"
  > => ipcRenderer.invoke("voice:getMicrophoneAccessStatus"),
  preloadStt: (input: {
    engine?: string;
    localModelPath?: string | null;
  }): Promise<{ engine: string; model: string; runtime: "cpu" }> =>
    ipcRenderer.invoke("voice:preloadStt", input),
  transcribe: (input: {
    audio: ArrayBuffer | Float32Array | number[];
    sampleRate?: number;
    engine?: string;
    language?: string;
    localModelPath?: string | null;
  }): Promise<{
    text: string;
    engine: string;
    model: string;
    runtime: "cpu";
    sampleRate: number;
    audioDurationMs: number;
    latencyMs: number;
    language?: string;
  }> => ipcRenderer.invoke("voice:transcribe", input),
  preloadTts: (input: {
    engine?: string;
    localModelPath?: string | null;
  }): Promise<{ engine: string; model: string; runtime: "cpu" }> =>
    ipcRenderer.invoke("voice:preloadTts", input),
  speak: (input: {
    text: string;
    engine?: string;
    voice?: string;
    speed?: number;
    localModelPath?: string | null;
  }): Promise<{
    jobId: string;
    engine: string;
    model: string;
    runtime: "cpu";
    voice: string;
    text: string;
    sampleRate: number;
    durationMs: number;
    latencyMs: number;
    wav: ArrayBuffer;
  }> => ipcRenderer.invoke("voice:speak", input),
  clearModels: (): Promise<{ stt: number; tts: number }> => ipcRenderer.invoke("voice:clearModels"),
} as const;

contextBridge.exposeInMainWorld("electronFS", electronFS);
contextBridge.exposeInMainWorld("electronDuckDB", electronDuckDB);
contextBridge.exposeInMainWorld("electronVoice", electronVoice);

declare global {
  type AuthBridges = typeof authClient.$Infer.Bridges;

  interface Window extends AuthBridges {}

  interface Window {
    electronFS: typeof electronFS;
    electronDuckDB: typeof electronDuckDB;
    electronVoice: typeof electronVoice;
  }
}
