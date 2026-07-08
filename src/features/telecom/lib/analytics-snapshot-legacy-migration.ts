/**
 * One-time lift of the legacy renderer-only Dexie `analyticsSnapshots` table
 * (the pre-SQLite-migration "Persister" store, src/platform/storage/app-db.ts)
 * into the durable SQLite `analytics_snapshot_history` table. Idempotent
 * (guarded by a marker under the "settings" namespace) and best-effort: like
 * `migrateLegacyAppSettings` in electron/settings-store.ts, a mid-run failure
 * marks the migration done anyway rather than retrying forever — the source
 * Dexie table is only cleared once every row has been restored successfully,
 * so a partial failure just means some history is still sitting in Dexie
 * (never destroyed, never duplicated on a retry that won't happen because the
 * marker is set).
 */
import { appDb } from "@/platform/storage/app-db";
import { restoreLegacyDexieSnapshot } from "@/features/telecom/lib/analytics-sqlite-snapshot";
import { getAppSettingRemote, putAppSettingRemote } from "@/platform/settings/settings-client";
import type * as Types from "@/features/telecom/types";

const MARKER_NAMESPACE = "settings";
const MARKER_KEY = "telecom_dexie_analytics_snapshot_migration_v1";

export async function migrateLegacyDexieAnalyticsSnapshots(): Promise<{ migrated: number }> {
  const { value } = await getAppSettingRemote<{ done: boolean }>(MARKER_NAMESPACE, MARKER_KEY);
  if (value?.done) return { migrated: 0 };

  let migrated = 0;
  try {
    const rows = await appDb.analyticsSnapshots.toArray();
    for (const row of rows) {
      await restoreLegacyDexieSnapshot({
        tableName: row.tableName,
        label: row.label,
        fileName: row.fileName,
        kpi: row.kpi as Types.KPISummary,
        canals: row.canals as Types.CanalSummary[],
        hourly: row.hourly as Types.HourlyRow[],
        statusData: row.statusData as Types.StatusRow[],
        operators: row.operators as Types.OperatorRow[],
        regions: row.regions as Types.RegionRow[],
        rawStatuses: row.rawStatuses as Types.RawStatusRow[],
        totalTransactions: row.totalTransactions,
        successRate: row.successRate,
        savedAt: row.savedAt,
      });
      migrated += 1;
    }
    if (rows.length > 0) {
      await appDb.analyticsSnapshots.clear();
    }
  } catch {
    // Best-effort — see module doc. Whatever was restored before the failure stays restored.
  }

  await putAppSettingRemote(MARKER_NAMESPACE, MARKER_KEY, { done: true, migrated, at: Date.now() });
  return { migrated };
}
