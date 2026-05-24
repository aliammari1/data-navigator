'use strict';

var electron = require('electron');

// electron/preload.ts
var electronFS = {
  getDataDir: () => electron.ipcRenderer.invoke("fs:getDataDir"),
  readFile: (filePath) => electron.ipcRenderer.invoke("fs:readFile", filePath),
  writeFile: (filePath, data) => electron.ipcRenderer.invoke("fs:writeFile", filePath, data),
  deleteFile: (filePath) => electron.ipcRenderer.invoke("fs:deleteFile", filePath),
  listFiles: (dir) => electron.ipcRenderer.invoke("fs:listFiles", dir),
  listFilesRecursive: (dir) => electron.ipcRenderer.invoke("fs:listFilesRecursive", dir),
  fileExists: (filePath) => electron.ipcRenderer.invoke("fs:fileExists", filePath),
  openDialog: (options) => electron.ipcRenderer.invoke("fs:openDialog", options),
  saveDialog: (options) => electron.ipcRenderer.invoke("fs:saveDialog", options)
};
var electronDuckDB = {
  init: () => electron.ipcRenderer.invoke("duckdb:init"),
  runQuery: (sql) => electron.ipcRenderer.invoke("duckdb:runQuery", sql),
  runBatch: (sqls) => electron.ipcRenderer.invoke("duckdb:runBatch", sqls),
  prepare: (sql) => electron.ipcRenderer.invoke("duckdb:prepare", sql),
  execute: (stmtId, params) => electron.ipcRenderer.invoke("duckdb:execute", stmtId, params),
  disposePrepared: (stmtId) => electron.ipcRenderer.invoke("duckdb:disposePrepared", stmtId),
  listTables: () => electron.ipcRenderer.invoke("duckdb:listTables"),
  getTableInfo: (tableName) => electron.ipcRenderer.invoke("duckdb:getTableInfo", tableName),
  getColumnStats: (tableName, columnName) => electron.ipcRenderer.invoke("duckdb:getColumnStats", tableName, columnName),
  loadCSVPath: (tableName, filePath, append, hasHeader) => electron.ipcRenderer.invoke(
    "duckdb:loadCSVPath",
    tableName,
    filePath,
    append,
    hasHeader
  ),
  loadCSVBuffer: (tableName, buffer, append, hasHeader) => electron.ipcRenderer.invoke(
    "duckdb:loadCSVBuffer",
    tableName,
    buffer,
    append,
    hasHeader
  ),
  exportTableToParquet: (tableName, filePath) => electron.ipcRenderer.invoke("duckdb:exportTableToParquet", tableName, filePath),
  loadTableFromParquet: (tableName, filePath) => electron.ipcRenderer.invoke("duckdb:loadTableFromParquet", tableName, filePath),
  clearTable: (tableName) => electron.ipcRenderer.invoke("duckdb:clearTable", tableName),
  getStatus: () => electron.ipcRenderer.invoke("duckdb:getStatus"),
  getQueryMetrics: () => electron.ipcRenderer.invoke("duckdb:getQueryMetrics"),
  clearQueryMetrics: () => electron.ipcRenderer.invoke("duckdb:clearQueryMetrics")
};
electron.contextBridge.exposeInMainWorld("electronFS", electronFS);
electron.contextBridge.exposeInMainWorld("electronDuckDB", electronDuckDB);
