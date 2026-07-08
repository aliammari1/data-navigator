"use client";

/**
 * Renderer-safe client for the analytics snapshot history bridge — the SQLite
 * (main-process, `analytics.db`) backend for the telecom "Persister" button
 * and Analytics History list. Talks to `window.electronAnalyticsSnapshots`
 * (exposed by electron/preload.ts, backed by electron/settings-store.ts).
 *
 * Same null-safe shape as settings-client.ts: every function no-ops / returns
 * a safe empty default when the bridge is unavailable (SSR, `next build`,
 * unit tests, or a plain browser tab outside Electron) so callers never guard
 * themselves.
 */

export type AnalyticsSnapshotHistoryMeta = {
  id: number;
  tableName: string;
  label: string;
  fileName: string | null;
  savedAt: number;
  sizeBytes: number;
  totalTransactions: number;
  successRate: number;
};

export type AnalyticsSnapshotHistoryRow = AnalyticsSnapshotHistoryMeta & { payload: unknown };

export interface SaveAnalyticsSnapshotInput {
  tableName: string;
  label: string;
  fileName?: string | null;
  payload: unknown;
  totalTransactions?: number;
  successRate?: number;
  /** Preserve an original save time (used only by the legacy-Dexie migration). */
  savedAt?: number;
}

/** The shape exposed on `window.electronAnalyticsSnapshots` by the preload bridge. */
interface ElectronAnalyticsSnapshotsBridge {
  save(input: SaveAnalyticsSnapshotInput): Promise<AnalyticsSnapshotHistoryMeta>;
  list(
    tableName?: string,
    limit?: number,
    offset?: number,
  ): Promise<AnalyticsSnapshotHistoryMeta[]>;
  get(id: number): Promise<AnalyticsSnapshotHistoryRow | undefined>;
  delete(id: number): Promise<void>;
}

type AnalyticsSnapshotsWindow = Window & {
  electronAnalyticsSnapshots?: ElectronAnalyticsSnapshotsBridge;
};

function bridge(): ElectronAnalyticsSnapshotsBridge | null {
  if (typeof window === "undefined") return null;
  return (window as AnalyticsSnapshotsWindow).electronAnalyticsSnapshots ?? null;
}

/** True when the analytics-snapshots IPC bridge is reachable (renderer running in Electron). */
export function canUseAnalyticsSnapshotsApi(): boolean {
  return bridge() !== null;
}

/** Save a new snapshot. Returns `null` when the bridge is unavailable. */
export async function saveAnalyticsSnapshotRemote(
  input: SaveAnalyticsSnapshotInput,
): Promise<AnalyticsSnapshotHistoryMeta | null> {
  const api = bridge();
  if (!api) return null;
  return api.save(input);
}

/**
 * Newest-first snapshot metadata. Scoped to `tableName` when given, otherwise
 * across every table. Returns `[]` when the bridge is unavailable.
 */
export async function listAnalyticsSnapshotsRemote(
  tableName?: string,
  limit?: number,
  offset?: number,
): Promise<AnalyticsSnapshotHistoryMeta[]> {
  const api = bridge();
  if (!api) return [];
  return api.list(tableName, limit, offset);
}

/** One full snapshot (including payload). Returns `undefined` when absent or unavailable. */
export async function getAnalyticsSnapshotRemote(
  id: number,
): Promise<AnalyticsSnapshotHistoryRow | undefined> {
  const api = bridge();
  if (!api) return undefined;
  return api.get(id);
}

/** Delete one snapshot. No-op when the bridge is unavailable. */
export async function deleteAnalyticsSnapshotRemote(id: number): Promise<void> {
  const api = bridge();
  if (!api) return;
  await api.delete(id);
}
