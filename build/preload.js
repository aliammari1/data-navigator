'use strict';

var electron = require('electron');

function _interopDefault (e) { return e && e.__esModule ? e : { default: e }; }

var electron__default = /*#__PURE__*/_interopDefault(electron);

var BetterAuthError = class extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "BetterAuthError";
    this.message = message;
    this.stack = "";
  }
};
function isProcessType(type) {
  return typeof process !== "undefined" && process.type === type;
}
function getChannelPrefixWithDelimiter(ns = "better-auth") {
  return ns.length > 0 ? ns + ":" : ns;
}
var { ipcRenderer } = electron__default.default;
function listenerFactory(channel, listener) {
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.off(channel, listener);
  };
}
function exposeBridges(opts) {
  if (!process.contextIsolated) throw new BetterAuthError("Context isolation must be enabled to use IPC bridges securely.");
  const prefix = getChannelPrefixWithDelimiter(opts.channelPrefix);
  const bridges = {
    getUser: async () => {
      return await ipcRenderer.invoke(`${prefix}getUser`);
    },
    requestAuth: async (options) => {
      await ipcRenderer.invoke(`${prefix}requestAuth`, options);
    },
    signOut: async () => {
      await ipcRenderer.invoke(`${prefix}signOut`);
    },
    authenticate: async (data) => {
      await ipcRenderer.invoke(`${prefix}authenticate`, data);
    },
    onAuthenticated: (callback) => {
      return listenerFactory(`${prefix}authenticated`, async (_evt, user) => {
        await callback(user);
      });
    },
    onUserUpdated: (callback) => {
      return listenerFactory(`${prefix}user-updated`, async (_evt, user) => {
        await callback(user);
      });
    },
    onAuthError: (callback) => {
      return listenerFactory(`${prefix}error`, async (_evt, context) => {
        await callback(context);
      });
    }
  };
  for (const [key, value] of Object.entries(bridges)) electron.contextBridge.exposeInMainWorld(key, value);
  return {};
}
function setupRenderer(options = {}) {
  if (!isProcessType("renderer")) throw new BetterAuthError("setupRenderer can only be called in the renderer process.");
  exposeBridges(options);
}
setupRenderer();
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
  getMicrophoneAccessStatus: () => electron.ipcRenderer.invoke("voice:getMicrophoneAccessStatus"),
  preloadStt: (input) => electron.ipcRenderer.invoke("voice:preloadStt", input),
  transcribe: (input) => electron.ipcRenderer.invoke("voice:transcribe", input),
  preloadTts: (input) => electron.ipcRenderer.invoke("voice:preloadTts", input),
  speak: (input) => electron.ipcRenderer.invoke("voice:speak", input),
  clearModels: () => electron.ipcRenderer.invoke("voice:clearModels")
};
electron.contextBridge.exposeInMainWorld("electronFS", electronFS);
electron.contextBridge.exposeInMainWorld("electronDuckDB", electronDuckDB);
electron.contextBridge.exposeInMainWorld("electronVoice", electronVoice);
