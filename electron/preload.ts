import { contextBridge, ipcRenderer } from "electron";

const electronFS = {
  getDataDir: (): Promise<string> => ipcRenderer.invoke("fs:getDataDir"),

  readFile: (filePath: string): Promise<ArrayBuffer> =>
    ipcRenderer.invoke("fs:readFile", filePath),

  writeFile: (filePath: string, data: ArrayBuffer): Promise<void> =>
    ipcRenderer.invoke("fs:writeFile", filePath, data),

  deleteFile: (filePath: string): Promise<boolean> =>
    ipcRenderer.invoke("fs:deleteFile", filePath),

  listFiles: (dir?: string): Promise<string[]> =>
    ipcRenderer.invoke("fs:listFiles", dir),

  listFilesRecursive: (dir: string): Promise<string[]> =>
    ipcRenderer.invoke("fs:listFilesRecursive", dir),

  fileExists: (filePath: string): Promise<boolean> =>
    ipcRenderer.invoke("fs:fileExists", filePath),

  openDialog: (options: {
    title?: string;
    filters?: { name: string; extensions: string[] }[];
    properties?: string[];
  }): Promise<{ canceled: boolean; filePaths: string[] }> =>
    ipcRenderer.invoke("fs:openDialog", options),

  saveDialog: (options: {
    title?: string;
    defaultPath?: string;
    filters?: { name: string; extensions: string[] }[];
  }): Promise<{ canceled: boolean; filePath?: string }> =>
    ipcRenderer.invoke("fs:saveDialog", options),
} as const;

const electronDuckDB = {
  init: (): Promise<{ success: boolean }> => ipcRenderer.invoke("duckdb:init"),

  runQuery: (sql: string): Promise<Record<string, unknown>[]> =>
    ipcRenderer.invoke("duckdb:runQuery", sql),

  runBatch: (sqls: string[]): Promise<Record<string, unknown>[][]> =>
    ipcRenderer.invoke("duckdb:runBatch", sqls),

  prepare: (sql: string): Promise<string> =>
    ipcRenderer.invoke("duckdb:prepare", sql),

  execute: (
    stmtId: string,
    params: unknown[],
  ): Promise<Record<string, unknown>[]> =>
    ipcRenderer.invoke("duckdb:execute", stmtId, params),

  disposePrepared: (stmtId: string): Promise<void> =>
    ipcRenderer.invoke("duckdb:disposePrepared", stmtId),

  listTables: (): Promise<string[]> => ipcRenderer.invoke("duckdb:listTables"),

  getTableInfo: (
    tableName: string,
  ): Promise<{
    columns: Array<{ name: string; type: string; nullable: boolean }>;
    rowCount: number;
  }> => ipcRenderer.invoke("duckdb:getTableInfo", tableName),

  getColumnStats: (
    tableName: string,
    columnName: string,
  ): Promise<{
    min: unknown;
    max: unknown;
    avg: unknown;
    nullCount: number;
    distinctCount: number;
    histogram: Array<{ bucket: string; count: number }>;
  }> => ipcRenderer.invoke("duckdb:getColumnStats", tableName, columnName),

  loadCSVPath: (
    tableName: string,
    filePath: string,
    delimiter?: string,
    append?: boolean,
    hasHeader?: boolean,
  ): Promise<void> =>
    ipcRenderer.invoke(
      "duckdb:loadCSVPath",
      tableName,
      filePath,
      delimiter,
      append,
      hasHeader,
    ),

  loadJSONPath: (tableName: string, filePath: string): Promise<void> =>
    ipcRenderer.invoke("duckdb:loadJSONPath", tableName, filePath),

  loadCSVBuffer: (
    tableName: string,
    buffer: ArrayBuffer,
    delimiter?: string,
    append?: boolean,
    hasHeader?: boolean,
  ): Promise<void> =>
    ipcRenderer.invoke(
      "duckdb:loadCSVBuffer",
      tableName,
      buffer,
      delimiter,
      append,
      hasHeader,
    ),

  loadJSONBuffer: (tableName: string, buffer: ArrayBuffer): Promise<void> =>
    ipcRenderer.invoke("duckdb:loadJSONBuffer", tableName, buffer),

  exportTableToParquet: (tableName: string, filePath: string): Promise<void> =>
    ipcRenderer.invoke("duckdb:exportTableToParquet", tableName, filePath),

  loadTableFromParquet: (tableName: string, filePath: string): Promise<void> =>
    ipcRenderer.invoke("duckdb:loadTableFromParquet", tableName, filePath),

  clearTable: (tableName: string): Promise<void> =>
    ipcRenderer.invoke("duckdb:clearTable", tableName),

  getStatus: (): Promise<{
    opfsPersistenceActive: boolean;
    dbPath: string | null;
  }> => ipcRenderer.invoke("duckdb:getStatus"),

  getQueryMetrics: (): Promise<
    Array<{
      sql: string;
      durationMs: number;
      timestamp: number;
      rowCount: number;
    }>
  > => ipcRenderer.invoke("duckdb:getQueryMetrics"),

  clearQueryMetrics: (): Promise<void> =>
    ipcRenderer.invoke("duckdb:clearQueryMetrics"),
} as const;

contextBridge.exposeInMainWorld("electronFS", electronFS);
contextBridge.exposeInMainWorld("electronDuckDB", electronDuckDB);
