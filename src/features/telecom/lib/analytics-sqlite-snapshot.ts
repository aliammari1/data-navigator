import type { PersistableCanalSummary } from "@/features/telecom/lib/canal-config";
import type * as Types from "@/features/telecom/types";
import type { ForecastPoint } from "@/platform/browser/forecast-onnx";
import {
  type AnalyticsSnapshotHistoryMeta,
  getAnalyticsSnapshotRemote,
  listAnalyticsSnapshotsRemote,
  saveAnalyticsSnapshotRemote,
} from "@/platform/settings/analytics-snapshot-client";
import { getAppSettingRemote, putAppSettingRemote } from "@/platform/settings/settings-client";

export type { AnalyticsSnapshotHistoryMeta, PersistableCanalSummary };

const NS = "analytics_snapshot";

export interface SQLiteAnalyticsSnapshot {
  tableName: string;
  fileName: string;
  kpi: Types.KPISummary;
  // Never `Types.CanalSummary[]` here — `.icon` is a live React component
  // reference and this crosses the Electron IPC boundary (structured clone
  // rejects functions). Callers re-derive icons via reattachCanalIcons().
  canals: PersistableCanalSummary[];
  hourly: Types.HourlyRow[];
  statusData: Types.StatusRow[];
  operators: Types.OperatorRow[];
  regions: Types.RegionRow[];
  rawStatuses: Types.RawStatusRow[];
  forecast: ForecastPoint[];
  computedAt: number;
}

export async function saveAnalyticsSnapshotToSQLite(
  snapshot: SQLiteAnalyticsSnapshot,
): Promise<void> {
  await putAppSettingRemote(NS, snapshot.tableName, snapshot);
}

export async function loadAnalyticsSnapshotFromSQLite(
  tableName: string,
): Promise<SQLiteAnalyticsSnapshot | null> {
  const { value } = await getAppSettingRemote<SQLiteAnalyticsSnapshot>(NS, tableName);
  return value ?? null;
}

// ─── Analytics snapshot history — the "Persister" button + History list ──────
// Backed by the analytics_snapshot_history SQLite table (electron/settings-store.ts),
// not the KV cache above: this is genuine append-only multi-snapshot history.

interface AnalyticsSnapshotPayload {
  kpi: Types.KPISummary;
  canals: PersistableCanalSummary[];
  hourly: Types.HourlyRow[];
  statusData: Types.StatusRow[];
  operators: Types.OperatorRow[];
  regions: Types.RegionRow[];
  rawStatuses: Types.RawStatusRow[];
}

export interface PersistedAnalyticsSnapshot extends AnalyticsSnapshotPayload {
  label: string;
  fileName: string;
  tableName: string;
  totalTransactions: number;
  successRate: number;
}

/** Save a new history entry. Throws if the SQLite bridge is unavailable — the caller surfaces the error, never a silent no-op. */
export async function saveAnalyticsSnapshot(snapshot: PersistedAnalyticsSnapshot): Promise<number> {
  const meta = await saveAnalyticsSnapshotRemote({
    tableName: snapshot.tableName,
    label: snapshot.label,
    fileName: snapshot.fileName,
    totalTransactions: snapshot.totalTransactions,
    successRate: snapshot.successRate,
    payload: {
      kpi: snapshot.kpi,
      canals: snapshot.canals,
      hourly: snapshot.hourly,
      statusData: snapshot.statusData,
      operators: snapshot.operators,
      regions: snapshot.regions,
      rawStatuses: snapshot.rawStatuses,
    } satisfies AnalyticsSnapshotPayload,
  });

  if (!meta) {
    throw new Error("Analytics snapshot history is unavailable (Electron IPC bridge not present)");
  }
  return meta.id;
}

/**
 * Restore one legacy Dexie-era snapshot into the SQLite history table, keeping
 * its original save time. Used only by the one-time Dexie→SQLite migration —
 * regular saves go through `saveAnalyticsSnapshot`, which always uses "now".
 */
export async function restoreLegacyDexieSnapshot(
  snapshot: PersistedAnalyticsSnapshot & { savedAt: number },
): Promise<number> {
  const meta = await saveAnalyticsSnapshotRemote({
    tableName: snapshot.tableName,
    label: snapshot.label,
    fileName: snapshot.fileName,
    totalTransactions: snapshot.totalTransactions,
    successRate: snapshot.successRate,
    savedAt: snapshot.savedAt,
    payload: {
      kpi: snapshot.kpi,
      canals: snapshot.canals,
      hourly: snapshot.hourly,
      statusData: snapshot.statusData,
      operators: snapshot.operators,
      regions: snapshot.regions,
      rawStatuses: snapshot.rawStatuses,
    } satisfies AnalyticsSnapshotPayload,
  });

  if (!meta) {
    throw new Error("Analytics snapshot history is unavailable (Electron IPC bridge not present)");
  }
  return meta.id;
}

/** Newest-first snapshot metadata across every table, for the Analytics History list. */
export async function listAnalyticsSnapshotMeta(
  limit = 100,
): Promise<AnalyticsSnapshotHistoryMeta[]> {
  return listAnalyticsSnapshotsRemote(undefined, limit);
}

/** One full saved snapshot by id, unpacked back into the analytics shape the UI expects. */
export async function getAnalyticsSnapshot(
  id: number,
): Promise<(AnalyticsSnapshotPayload & { tableName: string; fileName: string }) | undefined> {
  const row = await getAnalyticsSnapshotRemote(id);
  if (!row) return undefined;

  const payload = (row.payload ?? {}) as Partial<AnalyticsSnapshotPayload>;
  return {
    tableName: row.tableName,
    fileName: row.fileName ?? row.label,
    kpi: payload.kpi as Types.KPISummary,
    canals: payload.canals ?? [],
    hourly: payload.hourly ?? [],
    statusData: payload.statusData ?? [],
    operators: payload.operators ?? [],
    regions: payload.regions ?? [],
    rawStatuses: payload.rawStatuses ?? [],
  };
}
