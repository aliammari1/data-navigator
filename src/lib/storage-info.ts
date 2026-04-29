/**
 * F15 — navigator.storage.persist() + estimate()
 * Upgrades OPFS from "best-effort" to "guaranteed persistent".
 * Returns quota usage for the Config tab storage badge.
 */

export interface StorageInfo {
  usedMB: number;
  quotaMB: number;
  pct: number;
  isPersistent: boolean;
  supported: boolean;
}

export async function getStorageInfo(): Promise<StorageInfo> {
  if (typeof navigator === "undefined" || !("storage" in navigator)) {
    return { usedMB: 0, quotaMB: 0, pct: 0, isPersistent: false, supported: false };
  }
  try {
    const [est, isPersistent] = await Promise.all([
      navigator.storage.estimate(),
      navigator.storage.persisted(),
    ]);
    const usedMB = (est.usage ?? 0) / 1024 / 1024;
    const quotaMB = (est.quota ?? 1) / 1024 / 1024;
    return {
      usedMB,
      quotaMB,
      pct: quotaMB > 0 ? (usedMB / quotaMB) * 100 : 0,
      isPersistent,
      supported: true,
    };
  } catch {
    return { usedMB: 0, quotaMB: 0, pct: 0, isPersistent: false, supported: false };
  }
}

/**
 * Request persistent storage. Shows a browser prompt once.
 * Returns true if granted.
 */
export async function requestPersistence(): Promise<boolean> {
  if (typeof navigator === "undefined" || !("storage" in navigator)) return false;
  try {
    if (await navigator.storage.persisted()) return true;
    return navigator.storage.persist();
  } catch {
    return false;
  }
}
