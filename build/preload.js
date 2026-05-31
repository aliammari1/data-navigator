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
  registerCSVPathDataset: (input) => electron.ipcRenderer.invoke("duckdb:registerCSVPathDataset", input),
  registerParquetPathDataset: (input) => electron.ipcRenderer.invoke("duckdb:registerParquetPathDataset", input),
  listDatasets: () => electron.ipcRenderer.invoke("duckdb:listDatasets"),
  previewDataset: (input) => electron.ipcRenderer.invoke("duckdb:previewDataset", input),
  summarizeDataset: (input) => electron.ipcRenderer.invoke("duckdb:summarizeDataset", input),
  exportDataset: (input) => electron.ipcRenderer.invoke("duckdb:exportDataset", input),
  deleteDataset: (input) => electron.ipcRenderer.invoke("duckdb:deleteDataset", input),
  getStatus: () => electron.ipcRenderer.invoke("duckdb:getStatus"),
  getQueryMetrics: () => electron.ipcRenderer.invoke("duckdb:getQueryMetrics"),
  clearQueryMetrics: () => electron.ipcRenderer.invoke("duckdb:clearQueryMetrics"),
  runReadOnlyQuery: (sql) => electron.ipcRenderer.invoke("duckdb:runReadOnlyQuery", sql)
};
var electronVoice = {
  getMicrophoneAccessStatus: () => electron.ipcRenderer.invoke("voice:getMicrophoneAccessStatus")
};
electron.contextBridge.exposeInMainWorld("electronFS", electronFS);
electron.contextBridge.exposeInMainWorld("electronDuckDB", electronDuckDB);
electron.contextBridge.exposeInMainWorld("electronVoice", electronVoice);
