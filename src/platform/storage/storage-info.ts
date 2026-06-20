/**
 * Storage quota + persistence surface (architecture §2/§4).
 *
 * Electron's renderer IS a real browser context, so `navigator.storage` works
 * and — critically — IndexedDB CAN be evicted under storage pressure unless we
 * pin it with `persist()`. The previous Electron stub returned static
 * "always persistent / no quota" values; that masked the one durable-data trap
 * the brief calls out. This module now:
 *   - requests persistence ONCE at boot (`ensurePersistentStorage`),
 *   - surfaces real `estimate()` quota in the Settings storage panel,
 * while keeping the existing `getStorageInfo()` / `requestPersistence()` /
 * `StorageInfo` API the telecom StorageInfoPanel already consumes.
 *
 * Zero network: all `navigator.storage` calls are local.
 */

export interface StorageInfo {
  usedMB: number;
  quotaMB: number;
  pct: number;
  isPersistent: boolean;
  supported: boolean;
}

function bytesToMB(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}

function storageApi(): StorageManager | null {
  if (typeof navigator === "undefined") return null;
  if (typeof navigator.storage === "undefined") return null;
  return navigator.storage;
}

/** Raw `{usage, quota}` estimate in bytes (0/0 when unsupported). */
export async function estimateStorage(): Promise<{
  usage: number;
  quota: number;
  supported: boolean;
}> {
  const storage = storageApi();
  if (!storage || typeof storage.estimate !== "function") {
    return { usage: 0, quota: 0, supported: false };
  }
  try {
    const est = await storage.estimate();
    return {
      usage: est.usage ?? 0,
      quota: est.quota ?? 0,
      supported: true,
    };
  } catch {
    return { usage: 0, quota: 0, supported: false };
  }
}

/** Whether the origin's storage is already pinned as persistent. */
export async function isStoragePersisted(): Promise<boolean> {
  const storage = storageApi();
  if (!storage || typeof storage.persisted !== "function") return false;
  try {
    return await storage.persisted();
  } catch {
    return false;
  }
}

export async function getStorageInfo(): Promise<StorageInfo> {
  const [{ usage, quota, supported }, isPersistent] = await Promise.all([
    estimateStorage(),
    isStoragePersisted(),
  ]);

  if (!supported) {
    // No Storage API (e.g. SSR / locked-down context) — report safe defaults.
    return { usedMB: 0, quotaMB: 0, pct: 0, isPersistent, supported: false };
  }

  return {
    usedMB: bytesToMB(usage),
    quotaMB: bytesToMB(quota),
    pct: quota > 0 ? Math.round((usage / quota) * 100) : 0,
    isPersistent,
    supported: true,
  };
}

/**
 * Request persistent storage so the OS will not silently evict IndexedDB
 * (history, onboarding, achievements, query-cache snapshot) under pressure.
 * Returns the resulting persisted state. Idempotent — calling it when already
 * persisted is a cheap no-op that resolves true.
 */
export async function requestPersistence(): Promise<boolean> {
  const storage = storageApi();
  if (!storage || typeof storage.persist !== "function") return false;
  try {
    if (typeof storage.persisted === "function" && (await storage.persisted())) {
      return true;
    }
    return await storage.persist();
  } catch {
    return false;
  }
}

// ─── Boot helper (call ONCE in the dashboard layout effect) ───────────────────

let persistRequested = false;

/**
 * Idempotent boot-time persistence request. Mount this in the dashboard layout
 * effect (the brief's wire-in target). Safe to import anywhere; the actual
 * request only fires once per session and only in a browser/Electron context.
 */
export async function ensurePersistentStorage(): Promise<{
  persisted: boolean;
  estimate: { usage: number; quota: number };
}> {
  if (persistRequested) {
    const [persisted, est] = await Promise.all([isStoragePersisted(), estimateStorage()]);
    return { persisted, estimate: { usage: est.usage, quota: est.quota } };
  }
  persistRequested = true;

  const persisted = await requestPersistence();
  const est = await estimateStorage();
  return { persisted, estimate: { usage: est.usage, quota: est.quota } };
}
