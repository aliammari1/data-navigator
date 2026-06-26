import {
  getAppSettingRemote,
  putAppSettingRemote,
} from "@/platform/settings/settings-client";
import type { ForecastPoint } from "@/platform/browser/forecast-onnx";
import type * as Types from "@/features/telecom/types";

const NS = "analytics_snapshot";

export interface SQLiteAnalyticsSnapshot {
  tableName: string;
  fileName: string;
  kpi: Types.KPISummary;
  canals: Types.CanalSummary[];
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
