/**
 * F3 — IndexedDB Analytics Cache
 * Caches DuckDB analytics results keyed by file fingerprint.
 * On revisit with same file → instant results (<100ms), fresh data in background.
 * Uses Compression Streams (F21) to shrink entries ~80%.
 */

import {
  TELECOM_ANALYTICS_DB,
  TELECOM_ANALYTICS_DB_VERSION,
  TELECOM_ANALYTICS_STORE,
  TELECOM_SOURCE_META_STORE,
  TELECOM_SOURCE_STORE,
} from "@/features/telecom/lib/names";
import { compress, decompress } from "@/platform/storage/compression";

const DB_NAME = TELECOM_ANALYTICS_DB;
const STORE_NAME = TELECOM_ANALYTICS_STORE;
const SOURCE_STORE_NAME = TELECOM_SOURCE_STORE;
const SOURCE_META_STORE_NAME = TELECOM_SOURCE_META_STORE;
const DB_VERSION = TELECOM_ANALYTICS_DB_VERSION;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_SOURCE_FILES = 5;
const LATEST_SOURCE_META_KEY = "telecom-latest-source-file-meta-v1";

export interface CachedAnalytics {
  key: string;
  savedAt: number;
  fileName: string;
  kpi: unknown;
  canals: unknown[];
  hourly: unknown[];
  statusData: unknown[];
  operators: unknown[];
  regions: unknown[];
  rawStatuses: unknown[];
}

interface CachedTelecomSourceFile {
  key: string;
  savedAt: number;
  fileName: string;
  size: number;
  lastModified: number;
  type: string;
  file: File | Blob;
}

export interface CachedTelecomSourceFileMeta {
  key: string;
  savedAt: number;
  fileName: string;
  size: number;
  lastModified: number;
  type: string;
}

export interface CachedAnalyticsMeta {
  key: string;
  savedAt: number;
  fileName: string;
  totalTransactions: number;
  successRate: number;
}

export function getTelecomFileKey(file: File): string {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(SOURCE_STORE_NAME)) {
        db.createObjectStore(SOURCE_STORE_NAME, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(SOURCE_META_STORE_NAME)) {
        db.createObjectStore(SOURCE_META_STORE_NAME, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getCachedAnalytics(file: File): Promise<CachedAnalytics | null> {
  return getCachedAnalyticsForKey(getTelecomFileKey(file));
}

export async function getCachedAnalyticsForKey(key: string): Promise<CachedAnalytics | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = async () => {
        const raw = req.result as
          | { key: string; compressed: ArrayBuffer; savedAt: number }
          | undefined;
        if (!raw) {
          resolve(null);
          return;
        }
        if (Date.now() - raw.savedAt > MAX_AGE_MS) {
          deleteCachedAnalyticsForKey(key).catch(() => {});
          resolve(null);
          return;
        }
        try {
          const data = (await decompress(raw.compressed)) as CachedAnalytics;
          resolve(data);
        } catch {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function getCachedAnalyticsEntries(): Promise<CachedAnalyticsMeta[]> {
  if (typeof indexedDB === "undefined") return [];
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = async () => {
        const rawEntries = req.result as Array<{
          key: string;
          compressed: ArrayBuffer;
          savedAt: number;
        }>;
        const entries = await Promise.all(
          rawEntries.map(async (raw) => {
            try {
              const data = (await decompress(raw.compressed)) as CachedAnalytics;
              const kpi = data.kpi as {
                totalTransactions?: number;
                successRate?: number;
              };
              return {
                key: raw.key,
                savedAt: raw.savedAt,
                fileName: data.fileName,
                totalTransactions: Number(kpi.totalTransactions ?? 0),
                successRate: Number(kpi.successRate ?? 0),
              } satisfies CachedAnalyticsMeta;
            } catch {
              return null;
            }
          }),
        );
        resolve(
          entries
            .filter((entry): entry is CachedAnalyticsMeta => Boolean(entry))
            .sort((a, b) => b.savedAt - a.savedAt),
        );
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function setCachedAnalytics(
  file: File,
  data: Omit<CachedAnalytics, "key" | "savedAt">,
): Promise<void> {
  return setCachedAnalyticsForKey(getTelecomFileKey(file), data);
}

export async function setCachedAnalyticsForKey(
  key: string,
  data: Omit<CachedAnalytics, "key" | "savedAt">,
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openIDB();
    const payload: CachedAnalytics = { ...data, key, savedAt: Date.now() };
    const compressed = await compress(payload);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const req = tx.objectStore(STORE_NAME).put({ key, compressed, savedAt: Date.now() });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Cache write failures are non-fatal
  }
}

export async function deleteCachedAnalytics(file: File): Promise<void> {
  return deleteCachedAnalyticsForKey(getTelecomFileKey(file));
}

export async function deleteCachedAnalyticsForKey(key: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const req = tx.objectStore(STORE_NAME).delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {}
}

export async function cacheTelecomSourceFile(file: File): Promise<string | null> {
  if (typeof indexedDB === "undefined") return null;
  const key = getTelecomFileKey(file);
  const meta: CachedTelecomSourceFileMeta = {
    key,
    savedAt: Date.now(),
    fileName: file.name,
    size: file.size,
    lastModified: file.lastModified,
    type: file.type,
  };
  try {
    const db = await openIDB();
    const entry: CachedTelecomSourceFile = {
      ...meta,
      file,
    };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SOURCE_STORE_NAME, "readwrite");
      const req = tx.objectStore(SOURCE_STORE_NAME).put(entry);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    await putTelecomSourceFileMeta(meta);
    try {
      localStorage.setItem(LATEST_SOURCE_META_KEY, JSON.stringify(meta));
    } catch {}
    pruneTelecomSourceFiles().catch(() => {});
    return key;
  } catch {
    return null;
  }
}

export async function getCachedTelecomSourceFiles(): Promise<CachedTelecomSourceFileMeta[]> {
  if (typeof indexedDB === "undefined") return [];
  try {
    const fromLocal = readLatestSourceMeta();
    if (fromLocal) return [fromLocal];

    const db = await openIDB();
    if (db.objectStoreNames.contains(SOURCE_META_STORE_NAME)) {
      const metaEntries = await new Promise<CachedTelecomSourceFileMeta[]>((resolve) => {
        const tx = db.transaction(SOURCE_META_STORE_NAME, "readonly");
        const req = tx.objectStore(SOURCE_META_STORE_NAME).getAll();
        req.onsuccess = () => {
          resolve(
            (req.result as CachedTelecomSourceFileMeta[]).sort((a, b) => b.savedAt - a.savedAt),
          );
        };
        req.onerror = () => resolve([]);
      });
      if (metaEntries.length > 0) return metaEntries;
    }

    return [];
  } catch {
    return [];
  }
}

function readLatestSourceMeta(): CachedTelecomSourceFileMeta | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(LATEST_SOURCE_META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedTelecomSourceFileMeta;
    if (!parsed?.key || !parsed.fileName) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function putTelecomSourceFileMeta(meta: CachedTelecomSourceFileMeta): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openIDB();
    if (!db.objectStoreNames.contains(SOURCE_META_STORE_NAME)) return;
    await new Promise<void>((resolve) => {
      const tx = db.transaction(SOURCE_META_STORE_NAME, "readwrite");
      tx.objectStore(SOURCE_META_STORE_NAME).put(meta);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {}
}

export async function getCachedTelecomSourceFile(key: string): Promise<File | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(SOURCE_STORE_NAME, "readonly");
      const req = tx.objectStore(SOURCE_STORE_NAME).get(key);
      req.onsuccess = () => {
        const entry = req.result as CachedTelecomSourceFile | undefined;
        if (!entry?.file) {
          resolve(null);
          return;
        }
        if (entry.file instanceof File) {
          resolve(entry.file);
          return;
        }
        resolve(
          new File([entry.file], entry.fileName, {
            lastModified: entry.lastModified,
            type: entry.type,
          }),
        );
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function pruneTelecomSourceFiles(maxFiles = MAX_SOURCE_FILES): Promise<void> {
  const entries = await getCachedTelecomSourceFiles();
  const stale = entries.slice(maxFiles);
  if (stale.length === 0 || typeof indexedDB === "undefined") return;
  try {
    const db = await openIDB();
    await new Promise<void>((resolve) => {
      const storeNames = db.objectStoreNames.contains(SOURCE_META_STORE_NAME)
        ? [SOURCE_STORE_NAME, SOURCE_META_STORE_NAME]
        : [SOURCE_STORE_NAME];
      const tx = db.transaction(storeNames, "readwrite");
      const store = tx.objectStore(SOURCE_STORE_NAME);
      const metaStore = db.objectStoreNames.contains(SOURCE_META_STORE_NAME)
        ? tx.objectStore(SOURCE_META_STORE_NAME)
        : null;
      for (const entry of stale) {
        store.delete(entry.key);
        metaStore?.delete(entry.key);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {}
}

export async function purgeStaleCache(): Promise<number> {
  if (typeof indexedDB === "undefined") return 0;
  try {
    const db = await openIDB();
    const cutoff = Date.now() - MAX_AGE_MS;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.openCursor();
      let purged = 0;
      req.onsuccess = () => {
        const cursor = req.result as IDBCursorWithValue | null;
        if (!cursor) {
          resolve(purged);
          return;
        }
        const entry = cursor.value as { savedAt: number };
        if (entry.savedAt < cutoff) {
          cursor.delete();
          purged++;
        }
        cursor.continue();
      };
      req.onerror = () => resolve(purged);
    });
  } catch {
    return 0;
  }
}
