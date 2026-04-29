/**
 * F14 — Web Locks API
 * Mutex across tabs for DuckDB read/write ops.
 * Prevents cross-tab race conditions when OPFS + multi-tab is used.
 */

type LockMode = "shared" | "exclusive";

/** Minimal Web Locks API surface (TS lib lacks full typings) */
interface WebLockManager {
  acquire<T>(
    name: string,
    options: { mode: LockMode },
    callback: () => Promise<T>,
  ): Promise<T>;
  query(): Promise<{ held?: LockInfo[]; pending?: LockInfo[] }>;
}

function getLocks(): WebLockManager | null {
  if (typeof navigator === "undefined" || !("locks" in navigator)) return null;
  return navigator.locks as unknown as WebLockManager;
}

export async function withDBLock<T>(
  name: string,
  fn: () => Promise<T>,
  mode: LockMode = "exclusive",
): Promise<T> {
  const locks = getLocks();
  if (!locks) return fn();
  return locks.acquire(`telecom-db-${name}`, { mode }, async () => fn());
}

/** Diagnostic: returns held + pending locks for the telecom namespace. */
export async function queryDBLocks(): Promise<{
  held: string[];
  pending: string[];
}> {
  const locks = getLocks();
  if (!locks) return { held: [], pending: [] };
  const state = await locks.query();
  const filter = (l: LockInfo) =>
    (l.name ?? "").startsWith("telecom-db-");
  return {
    held: (state.held ?? []).filter(filter).map((l) => l.name ?? ""),
    pending: (state.pending ?? []).filter(filter).map((l) => l.name ?? ""),
  };
}

interface LockInfo {
  name?: string;
  mode?: string;
  clientId?: string;
}
