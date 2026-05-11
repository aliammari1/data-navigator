/**
 * Storage information — Electron edition.
 *
 * In Electron the local data directory (Electron userData) is used for
 * persistence. The browser navigator.storage API is not meaningful here, so
 * this module returns a static "local filesystem" status.
 */

export interface StorageInfo {
  usedMB: number;
  quotaMB: number;
  pct: number;
  isPersistent: boolean;
  supported: boolean;
}

export async function getStorageInfo(): Promise<StorageInfo> {
  // Electron: data is on the local filesystem — always persistent, no quota.
  return {
    usedMB: 0,
    quotaMB: 0,
    pct: 0,
    isPersistent: true,
    supported: true,
  };
}

/**
 * No-op in Electron — persistence is guaranteed by the local filesystem.
 */
export async function requestPersistence(): Promise<boolean> {
  return true;
}
