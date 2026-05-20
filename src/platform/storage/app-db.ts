/**
 * AppDatabase — Dexie-based IndexedDB storage
 *
 * Enterprise-grade local persistence using Dexie.js.
 * Replaces raw IndexedDB calls and OPFS-based DuckDB table persistence.
 *
 * Stores:
 *   analyticsSnapshots — manually pinned analytics (KPIs, canals, etc.)
 *   tableParquet       — DuckDB table exported as Parquet bytes
 *   sessionState       — lightweight session metadata
 */

import Dexie, { type Table } from "dexie";

// ─── Schema types ────────────────────────────────────────────────────────────

export interface AnalyticsSnapshot {
  key: string;
  savedAt: number;
  label: string;
  fileName: string;
  tableName: string;
  kpi: unknown;
  canals: unknown[];
  hourly: unknown[];
  statusData: unknown[];
  operators: unknown[];
  regions: unknown[];
  rawStatuses: unknown[];
  totalTransactions: number;
  successRate: number;
}

export interface TableParquet {
  key: string; // tableName
  savedAt: number;
  tableName: string;
  bytes: ArrayBuffer; // raw Parquet bytes
  rowCount: number;
  fileSizeBytes: number;
}

export interface SessionState {
  key: string; // singleton "current"
  updatedAt: number;
  activeTableName: string;
  fileName: string;
  reportDate: string;
  fileKey: string;
}

// ─── Database class ──────────────────────────────────────────────────────────

class AppDatabase extends Dexie {
  analyticsSnapshots!: Table<AnalyticsSnapshot, string>;
  tableParquet!: Table<TableParquet, string>;
  sessionState!: Table<SessionState, string>;

  constructor() {
    super("data-navigator-app-v1");

    this.version(1).stores({
      analyticsSnapshots: "key, savedAt, fileName, tableName",
      tableParquet: "key, savedAt, tableName",
      sessionState: "key, updatedAt",
    });
  }
}

export const appDb = new AppDatabase();

// ─── Analytics snapshot helpers ───────────────────────────────────────────────

export async function saveAnalyticsSnapshot(
  snapshot: Omit<AnalyticsSnapshot, "key" | "savedAt">,
): Promise<string> {
  const key = `snapshot:${snapshot.tableName}:${Date.now()}`;
  await appDb.analyticsSnapshots.put({ ...snapshot, key, savedAt: Date.now() });
  return key;
}

export async function listAnalyticsSnapshots(): Promise<AnalyticsSnapshot[]> {
  return appDb.analyticsSnapshots.orderBy("savedAt").reverse().toArray();
}

export async function deleteAnalyticsSnapshot(key: string): Promise<void> {
  await appDb.analyticsSnapshots.delete(key);
}

export async function getLatestSnapshot(
  tableName: string,
): Promise<AnalyticsSnapshot | undefined> {
  return appDb.analyticsSnapshots
    .where("tableName")
    .equals(tableName)
    .reverse()
    .first();
}

// ─── Parquet persistence (replaces OPFS) ─────────────────────────────────────

export async function saveTableParquet(
  tableName: string,
  bytes: ArrayBuffer,
  rowCount = 0,
): Promise<void> {
  await appDb.tableParquet.put({
    key: tableName,
    savedAt: Date.now(),
    tableName,
    bytes,
    rowCount,
    fileSizeBytes: bytes.byteLength,
  });
}

export async function loadTableParquet(
  tableName: string,
): Promise<ArrayBuffer | null> {
  const entry = await appDb.tableParquet.get(tableName);
  return entry?.bytes ?? null;
}

export async function hasTableParquet(tableName: string): Promise<boolean> {
  const count = await appDb.tableParquet.where("key").equals(tableName).count();
  return count > 0;
}

export async function deleteTableParquet(tableName: string): Promise<void> {
  await appDb.tableParquet.delete(tableName);
}

// ─── Session state ────────────────────────────────────────────────────────────

const SESSION_KEY = "current";

export async function saveSessionState(
  state: Omit<SessionState, "key" | "updatedAt">,
): Promise<void> {
  await appDb.sessionState.put({
    ...state,
    key: SESSION_KEY,
    updatedAt: Date.now(),
  });
}

export async function loadSessionState(): Promise<SessionState | null> {
  return (await appDb.sessionState.get(SESSION_KEY)) ?? null;
}
