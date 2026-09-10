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

// ─── Public API types ─────────────────────────────────────────────────────────

type DatasetSourceFormat = "csv" | "parquet";

interface RegisteredDatasetColumn {
  name: string;
  type: string;
  nullable: boolean;
}

interface RegisteredDataset {
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

interface RejectError {
  line: number | null;
  columnName: string | null;
  errorType: string | null;
  errorMessage: string | null;
}

interface RejectSummary {
  rejectedRowCount: number;
  sample: RejectError[];
}

interface RegisteredDatasetWithPreview extends RegisteredDataset {
  previewRows: Record<string, unknown>[];
  rejects?: RejectSummary;
}

type CsvEncoding = "utf-8" | "utf-16" | "latin-1";

interface RegisterCSVPathDatasetInput {
  filePath: string;
  displayName?: string;
  hasHeader?: boolean;
  delimiter?: string;
  sampleSize?: number;
  previewLimit?: number;
  encoding?: CsvEncoding;
  storeRejects?: boolean;
}

// ─── Pushdown / pagination / cancellation types ───────────────────────────────

interface SummarizeRow {
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
}

interface ColumnDetail {
  column: string;
  distinctApprox: number;
  topValues: Array<{ value: unknown; count: number | null }>;
  histogram: Array<{ bin: string; count: number }>;
}

interface ProfileDatasetInput {
  datasetId: string;
  cancelToken?: string;
}

interface ProfileColumnDetailInput {
  datasetId: string;
  column: string;
  topK?: number;
  binCount?: number;
  cancelToken?: string;
}

interface CountRowsInput {
  datasetId: string;
  where?: string;
  force?: boolean;
  cancelToken?: string;
}

interface KeysetSortKey {
  column: string;
  direction?: "ASC" | "DESC";
}

interface KeysetCursor {
  sortValues: unknown[];
  rowid: number;
}

interface KeysetPageInput {
  datasetId: string;
  sortKeys: KeysetSortKey[];
  limit: number;
  where?: string;
  cursor?: KeysetCursor;
  columns?: string[];
  cancelToken?: string;
}

interface KeysetPageResult {
  arrow: Uint8Array;
  nextCursor: KeysetCursor | null;
  rowCount: number;
}

interface RegisterParquetPathDatasetInput {
  filePath: string;
  displayName?: string;
  previewLimit?: number;
}

interface PreviewDatasetInput {
  datasetId: string;
  limit?: number;
  offset?: number;
}

interface DatasetOnlyInput {
  datasetId: string;
}

interface ExportDatasetInput {
  datasetId: string;
  targetPath: string;
}

interface QueryMetric {
  sql: string;
  durationMs: number;
  timestamp: number;
  rowCount: number;
}

interface DuckDBStatus {
  active: boolean;
  dbPath: string | null;
  datasetsDir: string | null;
  readConnections: number;
  pendingReads: number;
  pendingWrites: number;
}

// ─── Bridge type ──────────────────────────────────────────────────────────────

/**
 * The preload-exposed `electronDuckDB` API. Must match the main-process
 * handlers dispatched in `electron/duckdb-service.ts` — the IPC helper returns
 * exactly whatever the bridge method returns.
 *
 * Important:
 * - `clearQueryMetrics` returns Promise<void>.
 * - It does NOT return `{ success: boolean }`.
 */
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

  runReadOnlyQueryArrow(sql: string, cancelToken?: string): Promise<Uint8Array>;

  profileDataset(input: ProfileDatasetInput): Promise<SummarizeRow[]>;

  profileColumnDetail(input: ProfileColumnDetailInput): Promise<ColumnDetail>;

  countRows(input: CountRowsInput): Promise<number>;

  fetchKeysetPage(input: KeysetPageInput): Promise<KeysetPageResult>;

  cancelQueries(token: string): Promise<{ success: boolean }>;

  resetCancelToken(token: string): Promise<{ success: boolean }>;
}

// ─── Timeout helper ───────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
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

export function hasElectronDuckDB(): boolean {
  return typeof window !== "undefined" && Boolean(window.electronDuckDB);
}

export function duckdbBridge(): ElectronDuckDBBridge {
  if (typeof window === "undefined") {
    throw new Error("window is not available.");
  }

  const bridge = window.electronDuckDB;

  if (!bridge) {
    throw new Error("electronDuckDB not available — ensure the app is running inside Electron.");
  }

  return bridge;
}

function getBridge(): ElectronDuckDBBridge {
  if (!hasElectronDuckDB()) {
    throw new Error("DuckDB bridge is unavailable. Are you running in Electron?");
  }

  return duckdbBridge();
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
  operation: (bridge: ElectronDuckDBBridge) => Promise<T>,
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

  await duckdbClient.init();
}

// ─── DuckDBClient interface ─────────────────────────────────────────────────────

export interface DuckDBClient {
  readonly available: boolean;
  readonly ready: boolean;
  readonly failed: boolean;

  init(): Promise<void>;
  reset(): void;

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

  runReadOnlyQueryArrow(sql: string, cancelToken?: string): Promise<Uint8Array>;

  profileDataset(input: ProfileDatasetInput): Promise<SummarizeRow[]>;

  profileColumnDetail(input: ProfileColumnDetailInput): Promise<ColumnDetail>;

  countRows(input: CountRowsInput): Promise<number>;

  fetchKeysetPage(input: KeysetPageInput): Promise<KeysetPageResult>;

  cancelQueries(token: string): Promise<void>;

  resetCancelToken(token: string): Promise<void>;
}

// ─── DuckDBClient implementation ────────────────────────────────────────────────

export const duckdbClient: DuckDBClient = {
  get available() {
    return hasElectronDuckDB() && !failed;
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

    initPromise = ipc((bridge) => bridge.init(), 60_000, "DuckDB init timed out")
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

    return ipc((bridge) => bridge.listDatasets(), 30_000, "List datasets timed out");
  },

  async previewDataset(input: PreviewDatasetInput): Promise<Record<string, unknown>[]> {
    await ensureReady();

    return ipc((bridge) => bridge.previewDataset(input), 30_000, "Preview dataset timed out");
  },

  async summarizeDataset(input: DatasetOnlyInput): Promise<Record<string, unknown>[]> {
    await ensureReady();

    return ipc((bridge) => bridge.summarizeDataset(input), 60_000, "Summarize dataset timed out");
  },

  async exportDataset(input: ExportDatasetInput): Promise<void> {
    await ensureReady();

    await ipc((bridge) => bridge.exportDataset(input), 60_000, "Export dataset timed out");
  },

  async deleteDataset(input: DatasetOnlyInput): Promise<void> {
    await ensureReady();

    await ipc((bridge) => bridge.deleteDataset(input), 30_000, "Delete dataset timed out");
  },

  async getStatus(): Promise<DuckDBStatus> {
    await ensureReady();

    return ipc((bridge) => bridge.getStatus(), 30_000, "Get DuckDB status timed out");
  },

  async getQueryMetrics(): Promise<QueryMetric[]> {
    await ensureReady();

    return ipc((bridge) => bridge.getQueryMetrics(), 30_000, "Get query metrics timed out");
  },

  async clearQueryMetrics(): Promise<void> {
    await ensureReady();

    await ipc((bridge) => bridge.clearQueryMetrics(), 30_000, "Clear query metrics timed out");
  },

  async runReadOnlyQuery(sql: string): Promise<Record<string, unknown>[]> {
    await ensureReady();

    return ipc((bridge) => bridge.runReadOnlyQuery(sql), 60_000, "Read-only query timed out");
  },

  async runReadOnlyQueryArrow(sql: string, cancelToken?: string): Promise<Uint8Array> {
    await ensureReady();

    return ipc(
      (bridge) => bridge.runReadOnlyQueryArrow(sql, cancelToken),
      60_000,
      "Arrow read-only query timed out",
    );
  },

  async profileDataset(input: ProfileDatasetInput): Promise<SummarizeRow[]> {
    await ensureReady();

    return ipc((bridge) => bridge.profileDataset(input), 60_000, "Profile dataset timed out");
  },

  async profileColumnDetail(input: ProfileColumnDetailInput): Promise<ColumnDetail> {
    await ensureReady();

    return ipc(
      (bridge) => bridge.profileColumnDetail(input),
      60_000,
      "Profile column detail timed out",
    );
  },

  async countRows(input: CountRowsInput): Promise<number> {
    await ensureReady();

    return ipc((bridge) => bridge.countRows(input), 60_000, "Count rows timed out");
  },

  async fetchKeysetPage(input: KeysetPageInput): Promise<KeysetPageResult> {
    await ensureReady();

    return ipc((bridge) => bridge.fetchKeysetPage(input), 60_000, "Keyset page query timed out");
  },

  async cancelQueries(token: string): Promise<void> {
    // Best-effort: cancellation should be quick and must not block on init.
    await ensureReady();

    await ipc((bridge) => bridge.cancelQueries(token), 10_000, "Cancel queries timed out");
  },

  async resetCancelToken(token: string): Promise<void> {
    await ensureReady();

    await ipc((bridge) => bridge.resetCancelToken(token), 10_000, "Reset cancel token timed out");
  },
};

// ─── Dev helpers ──────────────────────────────────────────────────────────────

const isDev = process.env.NODE_ENV === "development";

if (isDev && typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__duckdbMetrics = {
    get: () => duckdbClient.getQueryMetrics(),
    clear: () => duckdbClient.clearQueryMetrics(),
    status: () => duckdbClient.getStatus(),
  };
}
