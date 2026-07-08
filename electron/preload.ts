import { setupRenderer } from "@better-auth/electron/preload";
import { contextBridge, type IpcRendererEvent, ipcRenderer, webUtils } from "electron";
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

export type RejectError = {
  line: number | null;
  columnName: string | null;
  errorType: string | null;
  errorMessage: string | null;
};

export type RejectSummary = {
  rejectedRowCount: number;
  sample: RejectError[];
};

export type RegisteredDatasetWithPreview = RegisteredDataset & {
  previewRows: Record<string, unknown>[];
  rejects?: RejectSummary;
};

export type CsvEncoding = "utf-8" | "utf-16" | "latin-1";

export type RegisterCSVPathDatasetInput = {
  filePath: string;
  displayName?: string;
  hasHeader?: boolean;
  delimiter?: string;
  sampleSize?: number;
  previewLimit?: number;
  encoding?: CsvEncoding;
  storeRejects?: boolean;
};

export type SummarizeRow = {
  column_name: string;
  column_type: string;
  min: unknown;
  max: unknown;
  approx_unique: number | null;
  avg: number | null;
  std: number | null;
  q25: number | null;
  q50: number | null;
  q75: number | null;
  count: number;
  null_percentage: number | null;
};

export type ColumnDetail = {
  column: string;
  distinctApprox: number;
  topValues: Array<{ value: unknown; count: number | null }>;
  histogram: Array<{ bin: string; count: number }>;
};

export type ProfileDatasetInput = {
  datasetId: string;
  cancelToken?: string;
};

export type ProfileColumnDetailInput = {
  datasetId: string;
  column: string;
  topK?: number;
  binCount?: number;
  cancelToken?: string;
};

export type CountRowsInput = {
  datasetId: string;
  where?: string;
  force?: boolean;
  cancelToken?: string;
};

export type KeysetSortKey = {
  column: string;
  direction?: "ASC" | "DESC";
};

export type KeysetCursor = {
  sortValues: unknown[];
  rowid: number;
};

export type KeysetPageInput = {
  datasetId: string;
  sortKeys: KeysetSortKey[];
  limit: number;
  where?: string;
  cursor?: KeysetCursor;
  columns?: string[];
  cancelToken?: string;
};

export type KeysetPageResult = {
  arrow: Uint8Array;
  nextCursor: KeysetCursor | null;
  rowCount: number;
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

  // Electron 41 removed File.path; webUtils.getPathForFile is the supported way
  // to resolve a dropped File to a trusted on-disk path for DuckDB. Synchronous,
  // no IPC. Enables real drag-and-drop import (blueprint §3).
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
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

  // Arrow IPC transport: large windows / exports / worker hand-off. Returns
  // stream-format bytes (decode renderer/worker-side with @uwdata/flechette).
  runReadOnlyQueryArrow: (sql: string, cancelToken?: string): Promise<Uint8Array> =>
    ipcRenderer.invoke("duckdb:runReadOnlyQueryArrow", sql, cancelToken),

  // Single-scan profiling pushdown (replaces per-column query fan-out).
  profileDataset: (input: ProfileDatasetInput): Promise<SummarizeRow[]> =>
    ipcRenderer.invoke("duckdb:profileDataset", input),

  profileColumnDetail: (input: ProfileColumnDetailInput): Promise<ColumnDetail> =>
    ipcRenderer.invoke("duckdb:profileColumnDetail", input),

  // Cached, filter-aware COUNT(*).
  countRows: (input: CountRowsInput): Promise<number> =>
    ipcRenderer.invoke("duckdb:countRows", input),

  // Keyset/seek pagination (Arrow page + next cursor).
  fetchKeysetPage: (input: KeysetPageInput): Promise<KeysetPageResult> =>
    ipcRenderer.invoke("duckdb:fetchKeysetPage", input),

  // Cancellation: cancel queued + in-flight scans grouped by token.
  cancelQueries: (token: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke("duckdb:cancelQueries", token),

  resetCancelToken: (token: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke("duckdb:resetCancelToken", token),
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
    lang?: string;
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

// ─── node-llama-cpp bridge ────────────────────────────────────────────────────

export type LlamaGenerateResult = {
  text: string;
  model: string;
  finishReason: "stop" | "length" | "abort";
  promptTokens: number;
  completionTokens: number;
  elapsedMs: number;
};

export type LlamaModelInfo = {
  id: string;
  label: string;
  family: string;
  sizeLabel: string;
  present: boolean;
  path: string;
};

const electronLlama = {
  ensureModel: (input?: { file?: string }): Promise<{ model: string }> =>
    ipcRenderer.invoke("llama:ensureModel", input),

  generate: (input: {
    requestId?: string;
    system?: string;
    prompt: string;
    systemPrefix?: string;
    maxTokens?: number;
    temperature?: number;
    topP?: number;
  }): Promise<LlamaGenerateResult> => ipcRenderer.invoke("llama:generate", input),

  generateStructured: (input: {
    requestId?: string;
    system?: string;
    prompt: string;
    systemPrefix?: string;
    jsonSchema: object;
    maxTokens?: number;
    temperature?: number;
  }): Promise<unknown> => ipcRenderer.invoke("llama:generateStructured", input),

  abort: (requestId: string): Promise<boolean> => ipcRenderer.invoke("llama:abort", requestId),

  listModels: (): Promise<LlamaModelInfo[]> => ipcRenderer.invoke("llama:listModels"),

  isAvailable: (input?: { file?: string }): Promise<boolean> =>
    ipcRenderer.invoke("llama:isAvailable", input),

  /**
   * Subscribe to streaming tokens for a given requestId. Returns an unsubscribe
   * function. Pass the same `requestId` to `generate`/`generateStructured`.
   */
  onToken: (requestId: string, callback: (chunk: string) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, payload: { id: string; chunk: string }): void => {
      if (payload?.id === requestId) callback(payload.chunk);
    };
    ipcRenderer.on("llama:token", handler);
    return () => ipcRenderer.removeListener("llama:token", handler);
  },
} as const;

// ─── Offline model download bridge ────────────────────────────────────────────
// Types imported (type-only, erased at compile time — no bundling cost) from
// the main-process module that owns them, so this bridge can never drift out
// of shape with the real service.

export type { ModelDownloadProgress, ModelPresence } from "./model-download-service";

import type { ModelDownloadProgress, ModelPresence } from "./model-download-service";

const electronModels = {
  /** Presence + on-disk size for every known GGUF model. */
  listPresence: (): Promise<ModelPresence[]> => ipcRenderer.invoke("models:listPresence"),

  isPresent: (key: string): Promise<boolean> => ipcRenderer.invoke("models:isPresent", key),

  /**
   * Download a GGUF model (by allowlisted key) to userData while online. Pass a
   * `requestId` and subscribe via `onProgress(requestId, …)` for live progress.
   */
  download: (input: { key: string; requestId?: string }): Promise<ModelPresence> =>
    ipcRenderer.invoke("models:download", input),

  abort: (requestId: string): Promise<boolean> => ipcRenderer.invoke("models:abort", requestId),

  delete: (key: string): Promise<{ deleted: boolean }> => ipcRenderer.invoke("models:delete", key),

  /**
   * Subscribe to streaming download progress for a given requestId. Returns an
   * unsubscribe function. Pass the same `requestId` to `download`.
   */
  onProgress: (
    requestId: string,
    callback: (progress: ModelDownloadProgress) => void,
  ): (() => void) => {
    const handler = (
      _event: IpcRendererEvent,
      payload: { id: string; progress: ModelDownloadProgress },
    ): void => {
      if (payload?.id === requestId) callback(payload.progress);
    };
    ipcRenderer.on("models:progress", handler);
    return () => ipcRenderer.removeListener("models:progress", handler);
  },
} as const;

// ─── LAN collaboration hub bridge ─────────────────────────────────────────────

export type CollabHubStatus = {
  running: boolean;
  port: number | null;
  pairingCode: string | null;
  guestCode: string | null;
  room: string | null;
  advertising: boolean;
  discovering: boolean;
  websocketUrls: string[];
  ips: Array<{ name: string; address: string }>;
  dbPath: string | null;
  startedAt: string | null;
};

export type DiscoveredHub = {
  name: string;
  host: string;
  port: number;
  url: string;
  addresses: string[];
  room?: string;
  pairingRequired: boolean;
};

const electronCollab = {
  start: (input?: {
    port?: number;
    pairingCode?: string;
    guestCode?: string;
    room?: string;
    advertise?: boolean;
    discover?: boolean;
  }): Promise<CollabHubStatus> => ipcRenderer.invoke("collabHub:start", input),

  stop: (): Promise<{ stopped: boolean }> => ipcRenderer.invoke("collabHub:stop"),

  status: (): Promise<CollabHubStatus> => ipcRenderer.invoke("collabHub:status"),

  discover: (): Promise<DiscoveredHub[]> => ipcRenderer.invoke("collabHub:discover"),

  getDiscovered: (): Promise<DiscoveredHub[]> => ipcRenderer.invoke("collabHub:getDiscovered"),

  /**
   * Subscribe to live mDNS discovery up/down events. Returns an unsubscribe
   * function.
   */
  onDiscovered: (
    callback: (event: { type: "up" | "down"; hub: DiscoveredHub }) => void,
  ): (() => void) => {
    const handler = (
      _event: IpcRendererEvent,
      payload: { type: "up" | "down"; hub: DiscoveredHub },
    ): void => callback(payload);
    ipcRenderer.on("collab:discovered", handler);
    return () => ipcRenderer.removeListener("collab:discovered", handler);
  },
} as const;

// ─── Settings / analytics persistence bridge ──────────────────────────────────
// IPC replacement for the retired /api/settings HTTP route: durable client state
// is read/written against the per-domain SQLite databases owned by the main
// process. Values are arbitrary JSON-serializable data.

export type AppSettingRemote = {
  value: unknown;
  updatedAt: string | null;
};

const electronSettings = {
  get: (namespace: string, key: string): Promise<AppSettingRemote> =>
    ipcRenderer.invoke("settings:get", namespace, key),

  set: (namespace: string, key: string, value: unknown): Promise<string> =>
    ipcRenderer.invoke("settings:set", namespace, key, value),

  delete: (namespace: string, key: string): Promise<void> =>
    ipcRenderer.invoke("settings:delete", namespace, key),

  export: (namespace?: string): Promise<Record<string, Record<string, unknown>>> =>
    ipcRenderer.invoke("settings:export", namespace),
} as const;

export type AnalyticsSnapshotHistoryMeta = {
  id: number;
  tableName: string;
  label: string;
  fileName: string | null;
  savedAt: number;
  sizeBytes: number;
  totalTransactions: number;
  successRate: number;
};

export type AnalyticsSnapshotHistoryRow = AnalyticsSnapshotHistoryMeta & { payload: unknown };

const electronAnalyticsSnapshots = {
  save: (input: {
    tableName: string;
    label: string;
    fileName?: string | null;
    payload: unknown;
    totalTransactions?: number;
    successRate?: number;
    savedAt?: number;
  }): Promise<AnalyticsSnapshotHistoryMeta> => ipcRenderer.invoke("analyticsSnapshots:save", input),

  list: (
    tableName?: string,
    limit?: number,
    offset?: number,
  ): Promise<AnalyticsSnapshotHistoryMeta[]> =>
    ipcRenderer.invoke("analyticsSnapshots:list", tableName, limit, offset),

  get: (id: number): Promise<AnalyticsSnapshotHistoryRow | undefined> =>
    ipcRenderer.invoke("analyticsSnapshots:get", id),

  delete: (id: number): Promise<void> => ipcRenderer.invoke("analyticsSnapshots:delete", id),
} as const;

// ─── Moudir chat history bridge (chat.db, main-process SQLite) ────────────────

export type { ChatMessageRow, ChatRole, ConversationMeta } from "./chat-store";

import type { ChatMessageRow, ChatRole, ConversationMeta } from "./chat-store";

const electronChatHistory = {
  create: (input: {
    id: string;
    title: string;
    datasetId?: string | null;
    model?: string | null;
  }): Promise<ConversationMeta> => ipcRenderer.invoke("chatHistory:create", input),

  list: (input?: { limit?: number; search?: string }): Promise<ConversationMeta[]> =>
    ipcRenderer.invoke("chatHistory:list", input),

  rename: (id: string, title: string): Promise<void> =>
    ipcRenderer.invoke("chatHistory:rename", { id, title }),

  pin: (id: string, pinned: boolean): Promise<void> =>
    ipcRenderer.invoke("chatHistory:pin", { id, pinned }),

  delete: (id: string): Promise<void> => ipcRenderer.invoke("chatHistory:delete", { id }),

  appendMessage: (input: {
    conversationId: string;
    role: ChatRole;
    content: string;
    parts?: unknown;
  }): Promise<ChatMessageRow> => ipcRenderer.invoke("chatHistory:appendMessage", input),

  messages: (conversationId: string, limit?: number): Promise<ChatMessageRow[]> =>
    ipcRenderer.invoke("chatHistory:messages", { conversationId, limit }),
} as const;

// ─── Moudir chat session bridge (live LlamaChatSession, main-process) ─────────
// Type-only imports from the owning service — erased at compile time, so the
// bridge can never drift out of shape with the real runtime.

export type { ChatToolEvent } from "./chat-session-service";

import type { ChatToolEvent } from "./chat-session-service";

const electronChatSession = {
  /** Open (or rehydrate from chat.db rows) the live session for a conversation. */
  open: (input: {
    conversationId: string;
    modelFile?: string;
    systemPrompt?: string;
    history?: Array<{ role: ChatRole; content: string }>;
  }): Promise<{ model: string; reused: boolean }> => ipcRenderer.invoke("chat:open", input),

  /**
   * One chat turn (prose + tools). Pass a `requestId` and subscribe via
   * `onToken(requestId, …)` / `onTool(requestId, …)` for live streaming.
   */
  prompt: (input: {
    conversationId: string;
    text: string;
    requestId?: string;
  }): Promise<{ text: string; toolEvents: ChatToolEvent[] }> =>
    ipcRenderer.invoke("chat:prompt", input),

  abort: (requestId: string): Promise<boolean> => ipcRenderer.invoke("chat:abort", requestId),

  /** Pre-evaluate a drafted prompt into KV (near-instant first token later). */
  preload: (input: { conversationId: string; text: string }): Promise<void> =>
    ipcRenderer.invoke("chat:preload", input),

  /** Snapshot of the model-side chat history (node-llama-cpp ChatHistoryItem[]). */
  history: (conversationId: string): Promise<unknown[]> =>
    ipcRenderer.invoke("chat:history", { conversationId }),

  /** Grammar-constrained side-call → short conversation title. */
  title: (conversationId: string): Promise<string> =>
    ipcRenderer.invoke("chat:title", { conversationId }),

  /** Grammar-constrained side-call → 2-3 suggested follow-up questions. */
  followUps: (conversationId: string): Promise<string[]> =>
    ipcRenderer.invoke("chat:followups", { conversationId }),

  dispose: (conversationId: string): Promise<boolean> =>
    ipcRenderer.invoke("chat:dispose", { conversationId }),

  /**
   * Subscribe to streaming tokens for a given requestId. Returns an
   * unsubscribe function. Pass the same `requestId` to `prompt`.
   */
  onToken: (requestId: string, callback: (chunk: string) => void): (() => void) => {
    const handler = (
      _event: IpcRendererEvent,
      payload: { requestId: string; chunk: string },
    ): void => {
      if (payload?.requestId === requestId) callback(payload.chunk);
    };
    ipcRenderer.on("chat:token", handler);
    return () => ipcRenderer.removeListener("chat:token", handler);
  },

  /**
   * Subscribe to streamed tool invocations for a given requestId. Returns an
   * unsubscribe function.
   */
  onTool: (requestId: string, callback: (event: ChatToolEvent) => void): (() => void) => {
    const handler = (
      _event: IpcRendererEvent,
      payload: { requestId: string; event: ChatToolEvent },
    ): void => {
      if (payload?.requestId === requestId) callback(payload.event);
    };
    ipcRenderer.on("chat:tool", handler);
    return () => ipcRenderer.removeListener("chat:tool", handler);
  },
} as const;

// ─── Clipboard bridge (chart image export → OS clipboard) ─────────────────────
// Renderer can't reach the native clipboard directly; hand a PNG data URL to
// the main process, which writes it as a NativeImage. Fully offline.

const electronClipboard = {
  writeImage: (dataUrl: string): Promise<void> =>
    ipcRenderer.invoke("clipboard:writeImage", { dataUrl }),
} as const;

contextBridge.exposeInMainWorld("electronFS", electronFS);
contextBridge.exposeInMainWorld("electronDuckDB", electronDuckDB);
contextBridge.exposeInMainWorld("electronVoice", electronVoice);
contextBridge.exposeInMainWorld("electronLlama", electronLlama);
contextBridge.exposeInMainWorld("electronModels", electronModels);
contextBridge.exposeInMainWorld("electronCollab", electronCollab);
contextBridge.exposeInMainWorld("electronSettings", electronSettings);
contextBridge.exposeInMainWorld("electronAnalyticsSnapshots", electronAnalyticsSnapshots);
contextBridge.exposeInMainWorld("electronChatHistory", electronChatHistory);
contextBridge.exposeInMainWorld("electronChatSession", electronChatSession);
contextBridge.exposeInMainWorld("electronClipboard", electronClipboard);

declare global {
  type AuthBridges = typeof authClient.$Infer.Bridges;

  interface Window extends AuthBridges {}

  interface Window {
    electronFS: typeof electronFS;
    electronDuckDB: typeof electronDuckDB;
    electronVoice: typeof electronVoice;
    electronLlama: typeof electronLlama;
    electronModels: typeof electronModels;
    electronCollab: typeof electronCollab;
    electronSettings: typeof electronSettings;
    electronAnalyticsSnapshots: typeof electronAnalyticsSnapshots;
    electronChatHistory: typeof electronChatHistory;
    electronChatSession: typeof electronChatSession;
    electronClipboard: typeof electronClipboard;
  }
}
