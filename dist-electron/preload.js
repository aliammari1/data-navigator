// electron/preload.ts
var import_electron = require("electron");
var electronFS = {
  getDataDir: () => import_electron.ipcRenderer.invoke("fs:getDataDir"),
  readFile: (filePath) => import_electron.ipcRenderer.invoke("fs:readFile", filePath),
  writeFile: (filePath, data) => import_electron.ipcRenderer.invoke("fs:writeFile", filePath, data),
  deleteFile: (filePath) => import_electron.ipcRenderer.invoke("fs:deleteFile", filePath),
  listFiles: (dir) => import_electron.ipcRenderer.invoke("fs:listFiles", dir),
  listFilesRecursive: (dir) => import_electron.ipcRenderer.invoke("fs:listFilesRecursive", dir),
  fileExists: (filePath) => import_electron.ipcRenderer.invoke("fs:fileExists", filePath),
  openDialog: (options) => import_electron.ipcRenderer.invoke("fs:openDialog", options),
  saveDialog: (options) => import_electron.ipcRenderer.invoke("fs:saveDialog", options)
};
var electronDuckDB = {
  init: () => import_electron.ipcRenderer.invoke("duckdb:init"),
  runQuery: (sql) => import_electron.ipcRenderer.invoke("duckdb:runQuery", sql),
  runBatch: (sqls) => import_electron.ipcRenderer.invoke("duckdb:runBatch", sqls),
  prepare: (sql) => import_electron.ipcRenderer.invoke("duckdb:prepare", sql),
  execute: (stmtId, params) => import_electron.ipcRenderer.invoke("duckdb:execute", stmtId, params),
  disposePrepared: (stmtId) => import_electron.ipcRenderer.invoke("duckdb:disposePrepared", stmtId),
  listTables: () => import_electron.ipcRenderer.invoke("duckdb:listTables"),
  getTableInfo: (tableName) => import_electron.ipcRenderer.invoke("duckdb:getTableInfo", tableName),
  getColumnStats: (tableName, columnName) => import_electron.ipcRenderer.invoke("duckdb:getColumnStats", tableName, columnName),
  loadCSVPath: (tableName, filePath, delimiter, append, hasHeader) => import_electron.ipcRenderer.invoke("duckdb:loadCSVPath", tableName, filePath, delimiter, append, hasHeader),
  loadJSONPath: (tableName, filePath) => import_electron.ipcRenderer.invoke("duckdb:loadJSONPath", tableName, filePath),
  loadCSVBuffer: (tableName, buffer, delimiter, append, hasHeader) => import_electron.ipcRenderer.invoke("duckdb:loadCSVBuffer", tableName, buffer, delimiter, append, hasHeader),
  loadJSONBuffer: (tableName, buffer) => import_electron.ipcRenderer.invoke("duckdb:loadJSONBuffer", tableName, buffer),
  exportTableToParquet: (tableName, filePath) => import_electron.ipcRenderer.invoke("duckdb:exportTableToParquet", tableName, filePath),
  loadTableFromParquet: (tableName, filePath) => import_electron.ipcRenderer.invoke("duckdb:loadTableFromParquet", tableName, filePath),
  clearTable: (tableName) => import_electron.ipcRenderer.invoke("duckdb:clearTable", tableName),
  getStatus: () => import_electron.ipcRenderer.invoke("duckdb:getStatus"),
  getQueryMetrics: () => import_electron.ipcRenderer.invoke("duckdb:getQueryMetrics"),
  clearQueryMetrics: () => import_electron.ipcRenderer.invoke("duckdb:clearQueryMetrics")
};
import_electron.contextBridge.exposeInMainWorld("electronFS", electronFS);
import_electron.contextBridge.exposeInMainWorld("electronDuckDB", electronDuckDB);
