"use client";

/**
 * DuckDB Electron IPC Client.
 *
 * Dataset-only renderer client for the Electron main-process DuckDB service.
 *
 * Mental model:
 * - Renderer does not run raw SQL.
 * - Renderer does not manage DuckDB tables.
 * - Renderer does not upload large CSV buffers through IPC.
 * - Renderer talks to dataset-level IPC methods only.
 * - DuckDB main process owns registration, Parquet cache, views, metrics, and cleanup.
 */

import { duckdbBridge } from "@/platform/electron/electron-fs";

// ─── Public API types ─────────────────────────────────────────────────────────

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

// ─── Bridge type ──────────────────────────────────────────────────────────────

/**
 * This type must match the preload-exposed `electronDuckDB` API.
 *
 * Important:
 * - `clearQueryMetrics` returns Promise<void>.
 * - It does NOT return `{ success: boolean }`.
 * - The IPC helper returns exactly whatever the bridge method returns.
 */
interface DuckDBBridgeApi {
  init(): Promise<{ success: boolean }>;

  registerCSVPathDataset(
    input: RegisterCSVPathDatasetInput,
  ): Promise<RegisteredDatasetWithPreview>;

  registerParquetPathDataset(
    input: RegisterParquetPathDatasetInput,
  ): Promise<RegisteredDatasetWithPreview>;

  listDatasets(): Promise<RegisteredDataset[]>;

  previewDataset(
    input: PreviewDatasetInput,
  ): Promise<Record<string, unknown>[]>;

  summarizeDataset(input: DatasetOnlyInput): Promise<Record<string, unknown>[]>;

  exportDataset(input: ExportDatasetInput): Promise<void>;

  deleteDataset(input: DatasetOnlyInput): Promise<void>;

  getStatus(): Promise<DuckDBStatus>;

  getQueryMetrics(): Promise<QueryMetric[]>;

  clearQueryMetrics(): Promise<void>;

  runReadOnlyQuery(sql: string): Promise<Record<string, unknown>[]>;
}

// ─── Timeout helper ───────────────────────────────────────────────────────────

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

// ─── Runtime state ────────────────────────────────────────────────────────────

let ready = false;
let failed = false;
let initPromise: Promise<void> | null = null;

function markFailed(): void {
  failed = true;
  ready = false;
  initPromise = null;
}

function hasDuckDBBridge(): boolean {
  return (
    typeof window !== "undefined" &&
    "electronDuckDB" in window &&
    typeof duckdbBridge === "function"
  );
}

function getBridge(): DuckDBBridgeApi {
  if (!hasDuckDBBridge()) {
    throw new Error(
      "DuckDB bridge is unavailable. Are you running in Electron?",
    );
  }

  return duckdbBridge() as unknown as DuckDBBridgeApi;
}

/**
 * Generic IPC wrapper.
 *
 * The return type is inferred from the exact bridge method passed in.
 * Example:
 * - bridge.listDatasets() -> Promise<RegisteredDataset[]>
 * - bridge.clearQueryMetrics() -> Promise<void>
 */
async function ipc<T>(
  operation: (bridge: DuckDBBridgeApi) => Promise<T>,
  timeoutMs = 30_000,
  timeoutMessage = "DuckDB operation timed out",
): Promise<T> {
  if (failed) {
    throw new Error("DuckDB is unavailable. Reload the page to retry.");
  }

  const bridge = getBridge();

  return withTimeout(operation(bridge), timeoutMs, timeoutMessage);
}

async function ensureReady(): Promise<void> {
  if (ready) return;

  await sharedDuckDB.init();
}

// ─── SharedDuckDB interface ───────────────────────────────────────────────────

export interface SharedDuckDB {
  readonly available: boolean;
  readonly ready: boolean;
  readonly failed: boolean;

  init(): Promise<void>;
  reset(): void;

  registerCSVPathDataset(
    input: RegisterCSVPathDatasetInput,
  ): Promise<RegisteredDatasetWithPreview>;

  registerParquetPathDataset(
    input: RegisterParquetPathDatasetInput,
  ): Promise<RegisteredDatasetWithPreview>;

  listDatasets(): Promise<RegisteredDataset[]>;

  previewDataset(
    input: PreviewDatasetInput,
  ): Promise<Record<string, unknown>[]>;

  summarizeDataset(input: DatasetOnlyInput): Promise<Record<string, unknown>[]>;

  exportDataset(input: ExportDatasetInput): Promise<void>;

  deleteDataset(input: DatasetOnlyInput): Promise<void>;

  getStatus(): Promise<DuckDBStatus>;

  getQueryMetrics(): Promise<QueryMetric[]>;

  clearQueryMetrics(): Promise<void>;

  runReadOnlyQuery(sql: string): Promise<Record<string, unknown>[]>;
}

// ─── SharedDuckDB implementation ──────────────────────────────────────────────

export const sharedDuckDB: SharedDuckDB = {
  get available() {
    return hasDuckDBBridge() && !failed;
  },

  get ready() {
    return ready;
  },

  get failed() {
    return failed;
  },

  async init(): Promise<void> {
    if (ready) return;
    if (initPromise) return initPromise;

    initPromise = ipc(
      (bridge) => bridge.init(),
      60_000,
      "DuckDB init timed out",
    )
      .then(() => {
        ready = true;
      })
      .catch((error) => {
        markFailed();
        throw error;
      })
      .finally(() => {
        initPromise = null;
      });

    return initPromise;
  },

  reset(): void {
    ready = false;
    failed = false;
    initPromise = null;
  },

  async registerCSVPathDataset(
    input: RegisterCSVPathDatasetInput,
  ): Promise<RegisteredDatasetWithPreview> {
    await ensureReady();

    return ipc(
      (bridge) => bridge.registerCSVPathDataset(input),
      120_000,
      "CSV dataset registration timed out after 120s",
    );
  },

  async registerParquetPathDataset(
    input: RegisterParquetPathDatasetInput,
  ): Promise<RegisteredDatasetWithPreview> {
    await ensureReady();

    return ipc(
      (bridge) => bridge.registerParquetPathDataset(input),
      120_000,
      "Parquet dataset registration timed out after 120s",
    );
  },

  async listDatasets(): Promise<RegisteredDataset[]> {
    await ensureReady();

    return ipc(
      (bridge) => bridge.listDatasets(),
      30_000,
      "List datasets timed out",
    );
  },

  async previewDataset(
    input: PreviewDatasetInput,
  ): Promise<Record<string, unknown>[]> {
    await ensureReady();

    return ipc(
      (bridge) => bridge.previewDataset(input),
      30_000,
      "Preview dataset timed out",
    );
  },

  async summarizeDataset(
    input: DatasetOnlyInput,
  ): Promise<Record<string, unknown>[]> {
    await ensureReady();

    return ipc(
      (bridge) => bridge.summarizeDataset(input),
      60_000,
      "Summarize dataset timed out",
    );
  },

  async exportDataset(input: ExportDatasetInput): Promise<void> {
    await ensureReady();

    await ipc(
      (bridge) => bridge.exportDataset(input),
      60_000,
      "Export dataset timed out",
    );
  },

  async deleteDataset(input: DatasetOnlyInput): Promise<void> {
    await ensureReady();

    await ipc(
      (bridge) => bridge.deleteDataset(input),
      30_000,
      "Delete dataset timed out",
    );
  },

  async getStatus(): Promise<DuckDBStatus> {
    await ensureReady();

    return ipc(
      (bridge) => bridge.getStatus(),
      30_000,
      "Get DuckDB status timed out",
    );
  },

  async getQueryMetrics(): Promise<QueryMetric[]> {
    await ensureReady();

    return ipc(
      (bridge) => bridge.getQueryMetrics(),
      30_000,
      "Get query metrics timed out",
    );
  },

  async clearQueryMetrics(): Promise<void> {
    await ensureReady();

    await ipc(
      (bridge) => bridge.clearQueryMetrics(),
      30_000,
      "Clear query metrics timed out",
    );
  },

  async runReadOnlyQuery(sql: string): Promise<Record<string, unknown>[]> {
    await ensureReady();

    return ipc(
      (bridge) => bridge.runReadOnlyQuery(sql),
      60_000,
      "Read-only query timed out",
    );
  },
};

// ─── Dev helpers ──────────────────────────────────────────────────────────────

const isDev = process.env.NODE_ENV === "development";

if (isDev && typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__duckdbMetrics = {
    get: () => sharedDuckDB.getQueryMetrics(),
    clear: () => sharedDuckDB.clearQueryMetrics(),
    status: () => sharedDuckDB.getStatus(),
  };
}
