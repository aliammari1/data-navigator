"use client";

/**
 * DuckDB Electron IPC Client — replaces the WASM worker with direct IPC
 * to the DuckDB Node API service running in the Electron main process.
 *
 * Public API signatures are preserved for backward compatibility.
 */

import { duckdbBridge } from "@/platform/electron/electron-fs";

// ─── Timeout helpers ──────────────────────────────────────────────────────────

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

// ─── IPC wrapper ──────────────────────────────────────────────────────────────

let ready = false;
let failed = false;
let initPromise: Promise<void> | null = null;

async function ipc<T>(
  operation: () => Promise<T>,
  timeoutMs = 30000,
  timeoutMessage = "DuckDB operation timed out",
): Promise<T> {
  if (failed) {
    throw new Error("DuckDB is unavailable. Reload the page to retry.");
  }
  return withTimeout(operation(), timeoutMs, timeoutMessage);
}

function markFailed(error: Error): void {
  failed = true;
  ready = false;
  initPromise = null;
}

// ─── Public API types ─────────────────────────────────────────────────────────

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
  opfsPersistenceActive: boolean;
  dbPath: string | null;
}

export interface QueryMetrics {
  sql: string;
  durationMs: number;
  timestamp: number;
  rowCount: number;
  explainPlan?: string;
}

// ─── Query Performance Metrics ────────────────────────────────────────────────

const MAX_METRICS = 200;
const queryMetrics: QueryMetrics[] = [];

function truncateSql(sql: string, maxLen = 200): string {
  return sql.length > maxLen ? `${sql.slice(0, maxLen)}...` : sql;
}

function pushMetric(metric: QueryMetrics): void {
  queryMetrics.unshift(metric);
  if (queryMetrics.length > MAX_METRICS) {
    queryMetrics.pop();
  }
}

// ─── LRU Query Cache ──────────────────────────────────────────────────────────

interface CacheEntry {
  result: Record<string, unknown>[];
  timestamp: number;
  sql: string;
}

class LRUCache<K, V> {
  private maxSize: number;
  private cache: Map<K, V>;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  clear(): void {
    this.cache.clear();
  }
}

const MAX_CACHE_SIZE = 100;
const METADATA_TTL = 30000;
const DATA_TTL = 10000;
let tableVersion = 0;
const queryCache = new LRUCache<string, CacheEntry>(MAX_CACHE_SIZE);

function isMetadataQuery(sql: string): boolean {
  const upper = sql.trim().toUpperCase();
  return (
    upper.startsWith("SHOW") ||
    upper.startsWith("DESCRIBE") ||
    upper.startsWith("PRAGMA")
  );
}

function isDdlQuery(sql: string): boolean {
  const upper = sql.trim().toUpperCase();
  return (
    upper.startsWith("CREATE") ||
    upper.startsWith("DROP") ||
    upper.startsWith("ALTER") ||
    upper.startsWith("INSERT") ||
    upper.startsWith("UPDATE") ||
    upper.startsWith("DELETE")
  );
}

const isDev = process.env.NODE_ENV === "development";

// ─── SharedDuckDB interface ───────────────────────────────────────────────────

export interface SharedDuckDB {
  readonly available: boolean;
  readonly ready: boolean;
  readonly failed: boolean;

  init(): Promise<void>;
  runQuery(
    sql: string,
    options?: { cache?: boolean; priority?: string },
  ): Promise<Record<string, unknown>[]>;
  runBatch(sqls: string[]): Promise<Record<string, unknown>[][]>;
  warmCache(sql: string): Promise<Record<string, unknown>[]>;
  getQueryMetrics(): QueryMetrics[];
  clearQueryMetrics(): void;

  prepare(sql: string): Promise<string>;
  execute(
    stmtId: string,
    params: unknown[],
  ): Promise<Record<string, unknown>[]>;
  disposePrepared(stmtId: string): Promise<void>;

  loadCSV(
    tableName: string,
    buffer: ArrayBuffer,
    append?: boolean,
    hasHeader?: boolean,
  ): Promise<void>;

  loadCSVFile(
    tableName: string,
    file: File,
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
  loadTableFromParquet(
    tableName: string,
    buffer: ArrayBuffer,
  ): Promise<boolean>;

  clearTable(tableName: string): Promise<void>;
  getStatus(): Promise<WorkerStatus>;
  reset(): void;
}

export const sharedDuckDB: SharedDuckDB = {
  get available() {
    return (
      typeof window !== "undefined" && "electronDuckDB" in window && !failed
    );
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

    initPromise = ipc(
      () => duckdbBridge().init(),
      60000,
      "DuckDB init timed out",
    )
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

  async runQuery(sql, options) {
    if (!ready) await sharedDuckDB.init();

    const useCache = options?.cache !== false;
    const cacheKey = `${sql}:${tableVersion}`;

    if (useCache) {
      const cached = queryCache.get(cacheKey);
      if (cached) {
        const ttl = isMetadataQuery(sql) ? METADATA_TTL : DATA_TTL;
        if (Date.now() - cached.timestamp < ttl) {
          return cached.result;
        }
      }
    }

    if (isDdlQuery(sql)) {
      tableVersion++;
      queryCache.clear();
    }

    const start = performance.now();
    const result = await ipc(
      () => duckdbBridge().runQuery(sql),
      30000,
      "Query timed out after 30s — possible table not loaded or query too complex",
    );
    const durationMs = Math.round(performance.now() - start);

    const metric: QueryMetrics = {
      sql: truncateSql(sql),
      durationMs,
      timestamp: Date.now(),
      rowCount: result.length,
    };
    pushMetric(metric);

    if (useCache) {
      queryCache.set(cacheKey, { result, timestamp: Date.now(), sql });
    }

    return result;
  },

  async runBatch(sqls) {
    if (!ready) await sharedDuckDB.init();
    return ipc(
      () => duckdbBridge().runBatch(sqls),
      30000,
      "Batch query timed out after 30s",
    );
  },

  async loadCSV(
    tableName,
    buffer,
    append = false,
    hasHeader = true,
  ) {
    if (!ready) await sharedDuckDB.init();
    await ipc(
      () =>
        duckdbBridge().loadCSVBuffer(
          tableName,
          buffer,
          append,
          hasHeader,
        ),
      60000,
      "CSV load timed out after 60s",
    );
    tableVersion++;
    queryCache.clear();
  },

  async loadJSON(tableName, data) {
    if (!ready) await sharedDuckDB.init();
    const buffer = new TextEncoder().encode(JSON.stringify(data))
      .buffer as ArrayBuffer;
    await ipc(
      () => duckdbBridge().loadJSONBuffer(tableName, buffer),
      60000,
      "JSON load timed out after 60s",
    );
    tableVersion++;
    queryCache.clear();
  },

  async loadJSONFile(tableName, file) {
    if (!ready) await sharedDuckDB.init();
    const buffer = await file.arrayBuffer();
    await ipc(
      () => duckdbBridge().loadJSONBuffer(tableName, buffer),
      60000,
      "JSON file load timed out after 60s",
    );
    tableVersion++;
    queryCache.clear();
  },

  async listTables() {
    if (!ready) await sharedDuckDB.init();
    return ipc(
      () => duckdbBridge().listTables(),
      30000,
      "List tables timed out",
    );
  },

  async getTableInfo(tableName) {
    if (!ready) await sharedDuckDB.init();
    return ipc(
      () => duckdbBridge().getTableInfo(tableName),
      30000,
      "Get table info timed out",
    );
  },

  async getColumnStats(tableName, columnName) {
    if (!ready) await sharedDuckDB.init();
    return ipc(
      () => duckdbBridge().getColumnStats(tableName, columnName),
      30000,
      "Get column stats timed out",
    );
  },

  async exportTableToParquet(tableName) {
    if (!ready) await sharedDuckDB.init();
    // NOTE: Node API writes directly to filesystem, not returning bytes.
    // For backward compatibility, we read the file back as bytes.
    const { getDataDir, readLocalFile } = await import(
      "@/platform/electron/electron-fs"
    );
    const dir = await getDataDir();
    const filePath = `${dir}/${tableName}.parquet`;
    await ipc(
      () => duckdbBridge().exportTableToParquet(tableName, filePath),
      60000,
      "Parquet export timed out after 60s",
    );
    return readLocalFile(filePath);
  },

  async loadTableFromParquet(tableName, buffer) {
    if (!ready) await sharedDuckDB.init();
    // NOTE: For backward compatibility, we write bytes to a temp file then load.
    const { getDataDir, writeLocalFile } = await import(
      "@/platform/electron/electron-fs"
    );
    const dir = await getDataDir();
    const filePath = `${dir}/${tableName}.parquet`;
    await writeLocalFile(filePath, buffer);
    await ipc(
      () => duckdbBridge().loadTableFromParquet(tableName, filePath),
      60000,
      "Parquet load timed out after 60s",
    );
    tableVersion++;
    queryCache.clear();
    return true;
  },

  async clearTable(tableName) {
    if (!ready) await sharedDuckDB.init();
    await ipc(
      () => duckdbBridge().clearTable(tableName),
      30000,
      "Clear table timed out",
    );
    tableVersion++;
    queryCache.clear();
  },

  async loadCSVFile(
    tableName,
    file,
    append = false,
    hasHeader = true,
  ) {
    if (!ready) await sharedDuckDB.init();
    const buffer = await file.arrayBuffer();
    await ipc(
      () =>
        duckdbBridge().loadCSVBuffer(
          tableName,
          buffer,
          append,
          hasHeader,
        ),
      60000,
      "CSV file load timed out after 60s",
    );
    tableVersion++;
    queryCache.clear();
  },

  async getStatus() {
    if (!ready) await sharedDuckDB.init();
    return ipc(() => duckdbBridge().getStatus(), 30000, "Get status timed out");
  },

  async prepare(sql) {
    if (!ready) await sharedDuckDB.init();
    return ipc(
      () => duckdbBridge().prepare(sql),
      30000,
      "Prepare statement timed out",
    );
  },

  async execute(stmtId, params) {
    if (!ready) await sharedDuckDB.init();
    return ipc(
      () => duckdbBridge().execute(stmtId, params),
      30000,
      "Execute statement timed out",
    );
  },

  async disposePrepared(stmtId) {
    if (!ready) await sharedDuckDB.init();
    await ipc(
      () => duckdbBridge().disposePrepared(stmtId),
      30000,
      "Dispose prepared statement timed out",
    );
  },

  async warmCache(sql) {
    if (!ready) await sharedDuckDB.init();
    const cacheKey = `${sql}:${tableVersion}`;
    const cached = queryCache.get(cacheKey);
    if (cached) {
      const ttl = isMetadataQuery(sql) ? METADATA_TTL : DATA_TTL;
      if (Date.now() - cached.timestamp < ttl) {
        return cached.result;
      }
    }
    const result = await ipc(
      () => duckdbBridge().runQuery(sql),
      30000,
      "Warm cache query timed out",
    );
    queryCache.set(cacheKey, { result, timestamp: Date.now(), sql });
    return result;
  },

  getQueryMetrics() {
    return queryMetrics.slice();
  },

  clearQueryMetrics() {
    queryMetrics.length = 0;
  },

  reset() {
    ready = false;
    failed = false;
    initPromise = null;
  },
};

// Expose metrics in dev mode for debugging
if (isDev && typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__duckdbMetrics = {
    get: () => sharedDuckDB.getQueryMetrics(),
    clear: () => sharedDuckDB.clearQueryMetrics(),
  };
}
