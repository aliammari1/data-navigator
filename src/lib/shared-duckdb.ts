/**
 * F25 — SharedWorker DuckDB Client
 *
 * Connects to the shared DuckDB worker:
 *
 *   UI / stores
 *     → shared-duckdb.ts
 *     → /workers/duckdb-shared.worker.js
 *     → one DuckDB WASM instance per origin across open tabs
 *
 * There is intentionally no per-tab DuckDB fallback in this build.
 */

"use client";

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
    }
  | {
      id: number;
      type: "loadCSVFile";
      tableName: string;
      file: File;
      delimiter: string;
      append: boolean;
    }
  | { id: number; type: "loadJSON"; tableName: string; buffer: ArrayBuffer }
  | { id: number; type: "listTables" }
  | { id: number; type: "getTableInfo"; tableName: string }
  | {
      id: number;
      type: "getColumnStats";
      tableName: string;
      columnName: string;
    }
  | { id: number; type: "exportTableToParquet"; tableName: string }
  | { id: number; type: "loadTableFromParquet"; tableName: string }
  | { id: number; type: "clearTable"; tableName: string }
  | { id: number; type: "getStatus" };

type WorkerError =
  | string
  | {
      message: string;
      stack?: string;
    };

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

function sharedWorkerSupported(): boolean {
  return typeof window !== "undefined" && "SharedWorker" in window;
}

function normalizeWorkerError(error: WorkerError): Error {
  if (typeof error === "string") {
    return new Error(error);
  }

  const normalized = new Error(error.message);

  if (error.stack) {
    normalized.stack = error.stack;
  }

  return normalized;
}

function rejectAllPending(error: Error): void {
  for (const [, request] of pending) {
    request.reject(error);
  }

  pending.clear();
}

function markFailed(error: Error): void {
  failed = true;
  ready = false;
  initPromise = null;
  worker = null;

  rejectAllPending(error);
}

function workerSupported(): boolean {
  return typeof window !== "undefined" && "Worker" in window;
}

function getWorker(): Worker {
  if (failed) {
    throw new Error("DuckDB worker is unavailable. Reload the page to retry.");
  }

  if (worker) return worker;

  if (!workerSupported()) {
    throw new Error(
      "Worker is not available in this browser. DataNavigator requires Web Worker for the local DuckDB runtime.",
    );
  }

  try {
    worker = new Worker(WORKER_URL, {
      type: "module",
      name: WORKER_NAME,
    });

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

    worker.onmessageerror = () => {
      markFailed(new Error("DuckDB worker sent an unreadable message."));
    };

    worker.onerror = (event) => {
      markFailed(
        new Error(event.message || "DuckDB worker failed to load or crashed."),
      );
    };

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

type WorkerRequestWithoutId = WorkerRequest extends infer Request
  ? Request extends unknown
    ? Omit<Request, "id">
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
      activeWorker.postMessage(
        {
          ...message,
          id,
        },
        transfer ?? [],
      );
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
  /** Whether the DuckDB database is backed by an OPFS file and will survive tab/page close. */
  opfsPersistenceActive: boolean;
  /** The OPFS path used, or null if operating in-memory. */
  dbPath: string | null;
}

export interface SharedDuckDB {
  /** Whether this browser exposes SharedWorker and no failure has occurred. */
  readonly available: boolean;
  /** Whether init() has completed successfully. */
  readonly ready: boolean;
  /** Whether the worker has failed during this page session. */
  readonly failed: boolean;

  init(): Promise<void>;

  runQuery(sql: string): Promise<Record<string, unknown>[]>;

  /**
   * Load a CSV from an ArrayBuffer (for programmatically generated CSV strings).
   * The buffer is transferred zero-copy to the worker.
   */
  loadCSV(
    tableName: string,
    buffer: ArrayBuffer,
    delimiter?: string,
    append?: boolean,
  ): Promise<void>;

  /**
   * Load a CSV from a File object.
   * The file is read to ArrayBuffer once, then transferred zero-copy to the worker.
   * The original filename is forwarded as a hint for DuckDB type inference.
   */
  loadCSVFile(
    tableName: string,
    file: File,
    delimiter?: string,
    append?: boolean,
  ): Promise<void>;

  loadJSON(tableName: string, data: Record<string, unknown>[]): Promise<void>;

  listTables(): Promise<string[]>;

  getTableInfo(tableName: string): Promise<TableInfo>;

  getColumnStats(tableName: string, columnName: string): Promise<ColumnStats>;

  exportTableToParquet(tableName: string): Promise<void>;

  loadTableFromParquet(tableName: string): Promise<boolean>;

  clearTable(tableName: string): Promise<void>;

  /** Returns the worker's runtime status, including OPFS persistence state. */
  getStatus(): Promise<WorkerStatus>;

  reset(): void;
}

export const sharedDuckDB: SharedDuckDB = {
  get available() {
    return sharedWorkerSupported() && !failed;
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

  async runQuery(sql: string) {
    if (!ready) await sharedDuckDB.init();
    return send<Record<string, unknown>[]>({ type: "runQuery", sql });
  },

  async loadCSV(
    tableName: string,
    buffer: ArrayBuffer,
    delimiter = "|",
    append = false,
  ) {
    if (!ready) await sharedDuckDB.init();
    await send<void>(
      { type: "loadCSV", tableName, buffer, delimiter, append },
      [buffer],
    );
  },

  async loadJSON(tableName: string, data: Record<string, unknown>[]) {
    if (!ready) await sharedDuckDB.init();
    const buffer = new TextEncoder().encode(JSON.stringify(data))
      .buffer as ArrayBuffer;
    await send<void>({ type: "loadJSON", tableName, buffer }, [buffer]);
  },

  async listTables() {
    if (!ready) await sharedDuckDB.init();
    return send<string[]>({ type: "listTables" });
  },

  async getTableInfo(tableName: string) {
    if (!ready) await sharedDuckDB.init();
    return send<TableInfo>({ type: "getTableInfo", tableName });
  },

  async getColumnStats(tableName: string, columnName: string) {
    if (!ready) await sharedDuckDB.init();
    return send<ColumnStats>({ type: "getColumnStats", tableName, columnName });
  },

  async exportTableToParquet(tableName: string) {
    if (!ready) await sharedDuckDB.init();
    await send<void>({ type: "exportTableToParquet", tableName });
  },

  async loadTableFromParquet(tableName: string) {
    if (!ready) await sharedDuckDB.init();
    return send<boolean>({ type: "loadTableFromParquet", tableName });
  },

  async clearTable(tableName: string) {
    if (!ready) await sharedDuckDB.init();
    await send<void>({ type: "clearTable", tableName });
  },

  async loadCSVFile(
    tableName: string,
    file: File,
    delimiter = ",",
    append = false,
  ) {
    if (!ready) await sharedDuckDB.init();
    // File is structured-cloneable but not Transferable — sent directly.
    // The worker registers it via BROWSER_FILEREADER so DuckDB streams it
    // in chunks rather than loading the whole buffer into memory at once.
    await send<void>({
      type: "loadCSVFile",
      tableName,
      file,
      delimiter,
      append,
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
