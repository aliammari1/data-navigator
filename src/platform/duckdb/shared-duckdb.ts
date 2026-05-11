"use client";

/**
 * DuckDB Worker Client — Electron / local-filesystem edition.
 *
 * Connects to the DuckDB worker (regular Worker, not SharedWorker) and
 * serialises all message calls through a pending-request map.
 *
 * Persistence is NOT managed here. Callers that need to persist a table should:
 *   1. Call exportTableToParquet(tableName) → get raw Parquet bytes.
 *   2. Write bytes to the local filesystem via Electron IPC (electron-fs.ts).
 *   3. On next launch, read the bytes and call loadTableFromParquet(tableName, buffer).
 */

// ─── Request / Response Protocol ─────────────────────────────────────────────

type WorkerRequest =
  | { id: number; type: "init" }
  | { id: number; type: "runQuery"; sql: string }
  | {
      id: number;
      type: "loadCSV";
      tableName: string;
      buffer: ArrayBuffer;
      delimiter: string;
      append: boolean;
      hasHeader: boolean;
    }
  | {
      id: number;
      type: "loadCSVFile";
      tableName: string;
      file: File;
      delimiter: string;
      append: boolean;
      hasHeader: boolean;
    }
  | { id: number; type: "loadJSON"; tableName: string; buffer: ArrayBuffer }
  | { id: number; type: "loadJSONFile"; tableName: string; file: File }
  | { id: number; type: "listTables" }
  | { id: number; type: "getTableInfo"; tableName: string }
  | {
      id: number;
      type: "getColumnStats";
      tableName: string;
      columnName: string;
    }
  | { id: number; type: "exportTableToParquet"; tableName: string }
  | {
      id: number;
      type: "loadTableFromParquet";
      tableName: string;
      buffer: ArrayBuffer;
    }
  | { id: number; type: "clearTable"; tableName: string }
  | { id: number; type: "getStatus" };

type WorkerError = string | { message: string; stack?: string };

type WorkerResponse =
  | { id: number; result: unknown }
  | { id: number; error: WorkerError };

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

const WORKER_URL = "/workers/duckdb-shared.worker.js";
const WORKER_NAME = "datanavigator-duckdb";

let worker: Worker | null = null;
let ready = false;
let failed = false;
let requestId = 0;
let initPromise: Promise<void> | null = null;

const pending = new Map<number, PendingRequest>();

function normalizeWorkerError(error: WorkerError): Error {
  if (typeof error === "string") return new Error(error);
  const e = new Error(error.message);
  if (error.stack) e.stack = error.stack;
  return e;
}

function rejectAllPending(error: Error): void {
  for (const [, request] of pending) request.reject(error);
  pending.clear();
}

function markFailed(error: Error): void {
  failed = true;
  ready = false;
  initPromise = null;
  worker = null;
  rejectAllPending(error);
}

function getWorker(): Worker {
  if (failed)
    throw new Error("DuckDB worker is unavailable. Reload the page to retry.");
  if (worker) return worker;

  if (typeof window === "undefined" || !("Worker" in window)) {
    throw new Error(
      "Worker is not available. DataNavigator requires Web Worker for the local DuckDB runtime.",
    );
  }

  try {
    worker = new Worker(WORKER_URL, { type: "module", name: WORKER_NAME });

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if ("error" in message) {
        request.reject(normalizeWorkerError(message.error));
        return;
      }
      request.resolve(message.result);
    };

    worker.onmessageerror = () =>
      markFailed(new Error("DuckDB worker sent an unreadable message."));

    worker.onerror = (event) =>
      markFailed(
        new Error(event.message || "DuckDB worker failed to load or crashed."),
      );

    return worker;
  } catch (error) {
    const normalized =
      error instanceof Error
        ? error
        : new Error("Failed to create DuckDB worker.");
    markFailed(normalized);
    throw normalized;
  }
}

type WorkerRequestWithoutId = WorkerRequest extends infer R
  ? R extends unknown
    ? Omit<R, "id">
    : never
  : never;

function send<T>(
  message: WorkerRequestWithoutId,
  transfer?: Transferable[],
): Promise<T> {
  const activeWorker = getWorker();
  const id = ++requestId;

  return new Promise<T>((resolve, reject) => {
    pending.set(id, {
      resolve: resolve as (value: unknown) => void,
      reject,
    });

    try {
      activeWorker.postMessage({ ...message, id }, transfer ?? []);
    } catch (error) {
      pending.delete(id);
      reject(
        error instanceof Error
          ? error
          : new Error("Failed to send message to DuckDB worker."),
      );
    }
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface TableInfo {
  columns: Array<{ name: string; type: string; nullable: boolean }>;
  rowCount: number;
}

export interface ColumnStats {
  min: unknown;
  max: unknown;
  avg: unknown;
  nullCount: number;
  distinctCount: number;
  histogram: Array<{ bucket: string; count: number }>;
}

export interface WorkerStatus {
  /** Always false — OPFS is not used in the Electron build. */
  opfsPersistenceActive: boolean;
  /** Always null — persistence is via local filesystem, managed by the caller. */
  dbPath: string | null;
}

export interface SharedDuckDB {
  readonly available: boolean;
  readonly ready: boolean;
  readonly failed: boolean;

  init(): Promise<void>;
  runQuery(sql: string): Promise<Record<string, unknown>[]>;

  loadCSV(
    tableName: string,
    buffer: ArrayBuffer,
    delimiter?: string,
    append?: boolean,
    hasHeader?: boolean,
  ): Promise<void>;

  loadCSVFile(
    tableName: string,
    file: File,
    delimiter?: string,
    append?: boolean,
    hasHeader?: boolean,
  ): Promise<void>;

  loadJSON(tableName: string, data: Record<string, unknown>[]): Promise<void>;
  loadJSONFile(tableName: string, file: File): Promise<void>;
  listTables(): Promise<string[]>;
  getTableInfo(tableName: string): Promise<TableInfo>;
  getColumnStats(tableName: string, columnName: string): Promise<ColumnStats>;

  /**
   * Export table to Parquet and return the raw bytes.
   * The caller must write the bytes to the local filesystem.
   */
  exportTableToParquet(tableName: string): Promise<ArrayBuffer>;

  /**
   * Load a table from Parquet bytes previously read from the local filesystem.
   */
  loadTableFromParquet(tableName: string, buffer: ArrayBuffer): Promise<boolean>;

  clearTable(tableName: string): Promise<void>;
  getStatus(): Promise<WorkerStatus>;
  reset(): void;
}

export const sharedDuckDB: SharedDuckDB = {
  get available() {
    return typeof window !== "undefined" && "Worker" in window && !failed;
  },
  get ready() {
    return ready;
  },
  get failed() {
    return failed;
  },

  async init() {
    if (ready) return;
    if (initPromise) return initPromise;

    initPromise = send<void>({ type: "init" })
      .then(() => {
        ready = true;
      })
      .catch((error) => {
        markFailed(error instanceof Error ? error : new Error(String(error)));
        throw error;
      })
      .finally(() => {
        initPromise = null;
      });

    return initPromise;
  },

  async runQuery(sql) {
    if (!ready) await sharedDuckDB.init();
    return send<Record<string, unknown>[]>({ type: "runQuery", sql });
  },

  async loadCSV(tableName, buffer, delimiter = "|", append = false, hasHeader = true) {
    if (!ready) await sharedDuckDB.init();
    await send<void>(
      { type: "loadCSV", tableName, buffer, delimiter, append, hasHeader },
      [buffer],
    );
  },

  async loadJSON(tableName, data) {
    if (!ready) await sharedDuckDB.init();
    const buffer = new TextEncoder().encode(JSON.stringify(data))
      .buffer as ArrayBuffer;
    await send<void>({ type: "loadJSON", tableName, buffer }, [buffer]);
  },

  async loadJSONFile(tableName, file) {
    if (!ready) await sharedDuckDB.init();
    await send<void>({ type: "loadJSONFile", tableName, file });
  },

  async listTables() {
    if (!ready) await sharedDuckDB.init();
    return send<string[]>({ type: "listTables" });
  },

  async getTableInfo(tableName) {
    if (!ready) await sharedDuckDB.init();
    return send<TableInfo>({ type: "getTableInfo", tableName });
  },

  async getColumnStats(tableName, columnName) {
    if (!ready) await sharedDuckDB.init();
    return send<ColumnStats>({ type: "getColumnStats", tableName, columnName });
  },

  async exportTableToParquet(tableName) {
    if (!ready) await sharedDuckDB.init();
    return send<ArrayBuffer>({ type: "exportTableToParquet", tableName });
  },

  async loadTableFromParquet(tableName, buffer) {
    if (!ready) await sharedDuckDB.init();
    return send<boolean>(
      { type: "loadTableFromParquet", tableName, buffer },
      [buffer],
    );
  },

  async clearTable(tableName) {
    if (!ready) await sharedDuckDB.init();
    await send<void>({ type: "clearTable", tableName });
  },

  async loadCSVFile(tableName, file, delimiter = ",", append = false, hasHeader = true) {
    if (!ready) await sharedDuckDB.init();
    await send<void>({
      type: "loadCSVFile",
      tableName,
      file,
      delimiter,
      append,
      hasHeader,
    });
  },

  async getStatus() {
    if (!ready) await sharedDuckDB.init();
    return send<WorkerStatus>({ type: "getStatus" });
  },

  reset() {
    ready = false;
    failed = false;
    initPromise = null;
    worker?.terminate();
    worker = null;
    rejectAllPending(new Error("DuckDB client was reset."));
  },
};
