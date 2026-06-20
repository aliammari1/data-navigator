/**
 * Daily statistics cache + data lineage.
 * Per spec NB: store per-day rollups → faster than scanning M-row table.
 *
 * Lineage: each daily snapshot tracks which file(s) contributed (name, size,
 * row count, ingest timestamp). When a new file is appended for the same day
 * we re-aggregate and append a new lineage entry.
 */

const DB_NAME = "telecom-daily-stats-db-v1";
const DB_VERSION = 1;
const STORE = "telecom_daily_stats_v1";

export interface DailyLineageEntry {
  fileName: string;
  fileKey: string;
  size: number;
  rows: number;
  ingestedAt: number;
  tableName: string;
}

export interface DailyStat {
  day: string; // YYYY-MM-DD
  total: number;
  success: number;
  declined: number;
  refund: number;
  instance: number;
  submitted: number;
  amount: number;
  successRate: number;
  uniqueCustomers: number;
  computedAt: number;
  lineage: DailyLineageEntry[];
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "day" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function upsertDailyStat(
  stat: Omit<DailyStat, "computedAt"> & { computedAt?: number },
): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const existing = await new Promise<DailyStat | undefined>((res) => {
      const r = store.get(stat.day);
      r.onsuccess = () => res(r.result as DailyStat | undefined);
      r.onerror = () => res(undefined);
    });
    const merged: DailyStat = {
      ...stat,
      computedAt: stat.computedAt ?? Date.now(),
      lineage: existing?.lineage ? mergeLineage(existing.lineage, stat.lineage) : stat.lineage,
    };
    store.put(merged);
    await new Promise<void>((res) => {
      tx.oncomplete = () => res();
      tx.onerror = () => res();
    });
    db.close();
  } catch {}
}

function mergeLineage(prev: DailyLineageEntry[], next: DailyLineageEntry[]): DailyLineageEntry[] {
  const byKey = new Map<string, DailyLineageEntry>();
  for (const e of [...prev, ...next]) byKey.set(e.fileKey, e);
  return [...byKey.values()].sort((a, b) => a.ingestedAt - b.ingestedAt);
}

export async function getDailyStat(day: string): Promise<DailyStat | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const r = await new Promise<DailyStat | undefined>((res) => {
      const req = store.get(day);
      req.onsuccess = () => res(req.result as DailyStat | undefined);
      req.onerror = () => res(undefined);
    });
    db.close();
    return r ?? null;
  } catch {
    return null;
  }
}

export async function listDailyStats(): Promise<DailyStat[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const rows = await new Promise<DailyStat[]>((res) => {
      const r = store.getAll();
      r.onsuccess = () => res((r.result as DailyStat[]) ?? []);
      r.onerror = () => res([]);
    });
    db.close();
    return rows.sort((a, b) => (a.day < b.day ? 1 : -1));
  } catch {
    return [];
  }
}

export async function removeDailyStat(day: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(day);
    await new Promise<void>((res) => {
      tx.oncomplete = () => res();
      tx.onerror = () => res();
    });
    db.close();
  } catch {}
}
