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
  saveDialog: (options) => electron.ipcRenderer.invoke("fs:saveDialog", options),
  // Electron 41 removed File.path; webUtils.getPathForFile is the supported way
  // to resolve a dropped File to a trusted on-disk path for DuckDB. Synchronous,
  // no IPC. Enables real drag-and-drop import (blueprint §3).
  getPathForFile: (file) => electron.webUtils.getPathForFile(file)
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
  runReadOnlyQuery: (sql) => electron.ipcRenderer.invoke("duckdb:runReadOnlyQuery", sql),
  // Arrow IPC transport: large windows / exports / worker hand-off. Returns
  // stream-format bytes (decode renderer/worker-side with @uwdata/flechette).
  runReadOnlyQueryArrow: (sql, cancelToken) => electron.ipcRenderer.invoke("duckdb:runReadOnlyQueryArrow", sql, cancelToken),
  // Single-scan profiling pushdown (replaces per-column query fan-out).
  profileDataset: (input) => electron.ipcRenderer.invoke("duckdb:profileDataset", input),
  profileColumnDetail: (input) => electron.ipcRenderer.invoke("duckdb:profileColumnDetail", input),
  // Cached, filter-aware COUNT(*).
  countRows: (input) => electron.ipcRenderer.invoke("duckdb:countRows", input),
  // Keyset/seek pagination (Arrow page + next cursor).
  fetchKeysetPage: (input) => electron.ipcRenderer.invoke("duckdb:fetchKeysetPage", input),
  // Cancellation: cancel queued + in-flight scans grouped by token.
  cancelQueries: (token) => electron.ipcRenderer.invoke("duckdb:cancelQueries", token),
  resetCancelToken: (token) => electron.ipcRenderer.invoke("duckdb:resetCancelToken", token)
};
var electronVoice = {
  getMicrophoneAccessStatus: () => electron.ipcRenderer.invoke("voice:getMicrophoneAccessStatus"),
  preloadStt: (input) => electron.ipcRenderer.invoke("voice:preloadStt", input),
  transcribe: (input) => electron.ipcRenderer.invoke("voice:transcribe", input),
  preloadTts: (input) => electron.ipcRenderer.invoke("voice:preloadTts", input),
  speak: (input) => electron.ipcRenderer.invoke("voice:speak", input),
  clearModels: () => electron.ipcRenderer.invoke("voice:clearModels")
};
var electronLlama = {
  ensureModel: (input) => electron.ipcRenderer.invoke("llama:ensureModel", input),
  generate: (input) => electron.ipcRenderer.invoke("llama:generate", input),
  generateStructured: (input) => electron.ipcRenderer.invoke("llama:generateStructured", input),
  abort: (requestId) => electron.ipcRenderer.invoke("llama:abort", requestId),
  listModels: () => electron.ipcRenderer.invoke("llama:listModels"),
  isAvailable: (input) => electron.ipcRenderer.invoke("llama:isAvailable", input),
  /**
   * Subscribe to streaming tokens for a given requestId. Returns an unsubscribe
   * function. Pass the same `requestId` to `generate`/`generateStructured`.
   */
  onToken: (requestId, callback) => {
    const handler = (_event, payload) => {
      if ((payload == null ? void 0 : payload.id) === requestId) callback(payload.chunk);
    };
    electron.ipcRenderer.on("llama:token", handler);
    return () => electron.ipcRenderer.removeListener("llama:token", handler);
  }
};
var electronModels = {
  /** Presence + on-disk size for every known GGUF model. */
  listPresence: () => electron.ipcRenderer.invoke("models:listPresence"),
  isPresent: (key) => electron.ipcRenderer.invoke("models:isPresent", key),
  /**
   * Download a GGUF model (by allowlisted key) to userData while online. Pass a
   * `requestId` and subscribe via `onProgress(requestId, …)` for live progress.
   */
  download: (input) => electron.ipcRenderer.invoke("models:download", input),
  abort: (requestId) => electron.ipcRenderer.invoke("models:abort", requestId),
  delete: (key) => electron.ipcRenderer.invoke("models:delete", key),
  /**
   * Subscribe to streaming download progress for a given requestId. Returns an
   * unsubscribe function. Pass the same `requestId` to `download`.
   */
  onProgress: (requestId, callback) => {
    const handler = (_event, payload) => {
      if ((payload == null ? void 0 : payload.id) === requestId) callback(payload.progress);
    };
    electron.ipcRenderer.on("models:progress", handler);
    return () => electron.ipcRenderer.removeListener("models:progress", handler);
  }
};
var electronCollab = {
  start: (input) => electron.ipcRenderer.invoke("collabHub:start", input),
  stop: () => electron.ipcRenderer.invoke("collabHub:stop"),
  status: () => electron.ipcRenderer.invoke("collabHub:status"),
  discover: () => electron.ipcRenderer.invoke("collabHub:discover"),
  getDiscovered: () => electron.ipcRenderer.invoke("collabHub:getDiscovered"),
  /**
   * Subscribe to live mDNS discovery up/down events. Returns an unsubscribe
   * function.
   */
  onDiscovered: (callback) => {
    const handler = (_event, payload) => callback(payload);
    electron.ipcRenderer.on("collab:discovered", handler);
    return () => electron.ipcRenderer.removeListener("collab:discovered", handler);
  }
};
electron.contextBridge.exposeInMainWorld("electronFS", electronFS);
electron.contextBridge.exposeInMainWorld("electronDuckDB", electronDuckDB);
electron.contextBridge.exposeInMainWorld("electronVoice", electronVoice);
electron.contextBridge.exposeInMainWorld("electronLlama", electronLlama);
electron.contextBridge.exposeInMainWorld("electronModels", electronModels);
electron.contextBridge.exposeInMainWorld("electronCollab", electronCollab);
