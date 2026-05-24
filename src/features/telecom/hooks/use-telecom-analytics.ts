"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { enrichCanalSummaries } from "@/features/telecom/lib/canal-config";
import { broadcast } from "@/features/telecom/lib/channel";
import { fmtN, fmtPct } from "@/features/telecom/lib/format";
import {
  fetchDistinctStatuses as _fetchDistinctStatuses,
  fetchHourly as _fetchHourly,
  fetchKPI as _fetchKPI,
  fetchOperators as _fetchOperators,
  fetchRegions as _fetchRegions,
  fetchStatusBreakdown as _fetchStatusBreakdown,
  ensureTelecomEnrichedView,
  fetchRawCanalSummaries,
} from "@/features/telecom/lib/queries";
import {
  SEMANTIC_STATUS_OPTIONS,
  STATUS_AUTO_SEMANTIC_BY_CODE,
} from "@/features/telecom/lib/status-definitions";
import type * as Types from "@/features/telecom/types";
import {
  type ForecastPoint,
  forecastNextHours,
} from "@/platform/browser/forecast-onnx";
import { runQuery } from "@/platform/duckdb/duckdb";

export interface UseTelecomAnalyticsParams {
  /**
   * Returns the current TABLE_NAME.  Accepting a getter keeps the hook
   * decoupled from the module-level mutable while always seeing the latest value.
   */
  getTableName: () => string;
  /** Column mapping — used by every query wrapper */
  mapping: Types.ColumnMapping;
  /** Column status mapping used as part of the TanStack Query cache key. */
  statusMapping: Types.StatusMapping[];
  /** Whether a file has been loaded into DuckDB */
  loaded: boolean;
  /** Ref that is true until the first analytics run completes */
  firstLoad: React.RefObject<boolean>;
  /** Ref so the notification/broadcast can read the file name without stale closure */
  fileNameRef: React.RefObject<string>;
  /** Called when new status codes are auto-discovered so page.tsx can update its state */
  onStatusMappingAdditions: (additions: Types.StatusMapping[]) => void;
}

export interface UseTelecomAnalyticsReturn {
  kpi: Types.KPISummary | null;
  setKpi: (v: Types.KPISummary) => void;
  canals: Types.CanalSummary[];
  setCanals: (v: Types.CanalSummary[]) => void;
  hourly: Types.HourlyRow[];
  setHourly: (v: Types.HourlyRow[]) => void;
  statusData: Types.StatusRow[];
  setStatusData: (v: Types.StatusRow[]) => void;
  operators: Types.OperatorRow[];
  setOperators: (v: Types.OperatorRow[]) => void;
  regions: Types.RegionRow[];
  setRegions: (v: Types.RegionRow[]) => void;
  forecast: ForecastPoint[];
  rawStatuses: Types.RawStatusRow[];
  setRawStatuses: (v: Types.RawStatusRow[]) => void;
  refresh: () => Promise<void>;
  runAnalytics: (
    m: Types.ColumnMapping,
    sm: Types.StatusMapping[],
  ) => Promise<void>;
}

interface TelecomAnalyticsPayload {
  kpi: Types.KPISummary | null;
  canals: Types.CanalSummary[];
  hourly: Types.HourlyRow[];
  statusData: Types.StatusRow[];
  operators: Types.OperatorRow[];
  regions: Types.RegionRow[];
  forecast: ForecastPoint[];
  rawStatuses: Types.RawStatusRow[];
}

const EMPTY_ANALYTICS: TelecomAnalyticsPayload = {
  kpi: null,
  canals: [],
  hourly: [],
  statusData: [],
  operators: [],
  regions: [],
  forecast: [],
  rawStatuses: [],
};

function stableHash(value: unknown) {
  return JSON.stringify(value);
}

/**
 * useTelecomAnalytics
 *
 * Owns all analytics result state (kpi, canals, hourly, …) and the
 * `runAnalytics` callback that drives them.
 *
 * The `getTableName` parameter is a function rather than a plain string so
 * the callback always reads the latest module-level TABLE_NAME value without
 * being recreated when it changes.
 */
export function useTelecomAnalytics({
  getTableName,
  loaded,
  mapping,
  statusMapping,
  firstLoad,
  fileNameRef,
  onStatusMappingAdditions,
}: UseTelecomAnalyticsParams): UseTelecomAnalyticsReturn {
  const queryClient = useQueryClient();
  const tableName = getTableName();
  const analyticsQueryKey = [
    "telecom",
    "analytics",
    tableName,
    stableHash(mapping),
    stableHash(statusMapping),
  ] as const;

  const computeAnalytics = useCallback(
    async (
      table: string,
      m: Types.ColumnMapping,
      sm: Types.StatusMapping[],
    ): Promise<TelecomAnalyticsPayload> => {
      try {
        const check = await runQuery(
          `SELECT 1 FROM information_schema.tables WHERE table_name = '${table}' LIMIT 1`,
        );
        if (check.length === 0) return EMPTY_ANALYTICS;
      } catch {
        return EMPTY_ANALYTICS;
      }

      try {
        await ensureTelecomEnrichedView(table, m, sm);

        const [kpiResult, hourlyResult, statusResult] = await Promise.all([
          _fetchKPI(table, m, sm),
          _fetchHourly(table, m, sm),
          _fetchStatusBreakdown(table, m, sm),
        ]);

        const total = kpiResult?.totalTransactions ?? 0;
        const [rawCanalsResult, operatorsResult, regionsResult] =
          await Promise.all([
            fetchRawCanalSummaries(table, m, total, sm),
            _fetchOperators(table, m, sm),
            _fetchRegions(table, m, sm),
          ]);
        const canalsResult = enrichCanalSummaries(rawCanalsResult);

        const forecastResult = await forecastNextHours(hourlyResult, 4);
        let rawStatuses: Types.RawStatusRow[] =
          queryClient.getQueryData<TelecomAnalyticsPayload>(analyticsQueryKey)
            ?.rawStatuses ?? [];

        if (firstLoad.current) {
          firstLoad.current = false;
          rawStatuses = await _fetchDistinctStatuses(table, m);
          const known = new Set(sm.map((p) => p.rawCode));
          const additions: Types.StatusMapping[] = rawStatuses
            .filter((r) => !known.has(r.rawCode))
            .map((r) => {
              const sem = STATUS_AUTO_SEMANTIC_BY_CODE[r.rawCode] ?? "other";
              const opt =
                SEMANTIC_STATUS_OPTIONS.find((o) => o.value === sem) ??
                SEMANTIC_STATUS_OPTIONS[SEMANTIC_STATUS_OPTIONS.length - 1];
              return {
                rawCode: r.rawCode,
                label: opt.label,
                semantic: sem,
                color: opt.color,
                badgeClass: opt.badgeClass,
              };
            });
          if (additions.length > 0) onStatusMappingAdditions(additions);
        }

        const payload: TelecomAnalyticsPayload = {
          kpi: kpiResult,
          hourly: hourlyResult,
          statusData: statusResult,
          canals: canalsResult,
          operators: operatorsResult,
          regions: regionsResult,
          forecast: forecastResult,
          rawStatuses,
        };

        if (
          document.hidden &&
          Notification.permission === "granted" &&
          kpiResult
        ) {
          new Notification(`Rapport prêt — ${fileNameRef.current}`, {
            body: `${fmtN(kpiResult.totalTransactions)} tx · ${fmtPct(kpiResult.successRate)} réussite`,
            icon: "/icon-192.png",
            tag: "telecom-ready",
          });
        }

        // F10 — broadcast analytics ready to other tabs
        broadcast({
          type: "ANALYTICS_READY",
          fileName: fileNameRef.current,
          successRate: kpiResult?.successRate ?? 0,
          totalTx: kpiResult?.totalTransactions ?? 0,
        });

        return payload;
      } catch (e) {
        console.error("[useTelecomAnalytics] runAnalytics error:", e);
        return EMPTY_ANALYTICS;
      }
    },
    [
      analyticsQueryKey,
      fileNameRef,
      firstLoad,
      onStatusMappingAdditions,
      queryClient,
    ],
  );

  const query = useQuery({
    queryKey: analyticsQueryKey,
    queryFn: () => computeAnalytics(tableName, mapping, statusMapping),
    enabled: loaded && Boolean(tableName),
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    placeholderData: (previous) => previous,
  });

  const data = query.data ?? EMPTY_ANALYTICS;

  const patchAnalytics = useCallback(
    (patch: Partial<TelecomAnalyticsPayload>) => {
      queryClient.setQueryData<TelecomAnalyticsPayload>(
        analyticsQueryKey,
        (prev) => ({
          ...(prev ?? EMPTY_ANALYTICS),
          ...patch,
        }),
      );
    },
    [analyticsQueryKey, queryClient],
  );

  const refresh = useCallback(async () => {
    await query.refetch();
  }, [query]);

  const runAnalytics = useCallback(
    async (m: Types.ColumnMapping, sm: Types.StatusMapping[]) => {
      await queryClient.fetchQuery({
        queryKey: [
          "telecom",
          "analytics",
          getTableName(),
          stableHash(m),
          stableHash(sm),
        ],
        queryFn: () => computeAnalytics(getTableName(), m, sm),
        staleTime: Infinity,
      });
    },
    [computeAnalytics, getTableName, queryClient],
  );

  return {
    kpi: data.kpi,
    setKpi: (kpi) => patchAnalytics({ kpi }),
    canals: data.canals,
    setCanals: (canals) => patchAnalytics({ canals }),
    hourly: data.hourly,
    setHourly: (hourly) => patchAnalytics({ hourly }),
    statusData: data.statusData,
    setStatusData: (statusData) => patchAnalytics({ statusData }),
    operators: data.operators,
    setOperators: (operators) => patchAnalytics({ operators }),
    regions: data.regions,
    setRegions: (regions) => patchAnalytics({ regions }),
    forecast: data.forecast,
    rawStatuses: data.rawStatuses,
    setRawStatuses: (rawStatuses) => patchAnalytics({ rawStatuses }),
    refresh,
    runAnalytics,
  };
}
