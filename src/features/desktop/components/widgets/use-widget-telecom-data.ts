"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDataStore } from "@/core/stores/data-store";
import { useDesktopStore } from "@/features/desktop/store/desktop-store";
import { useTelecomAnalytics } from "@/features/telecom/hooks/use-telecom-analytics";
import { isTelecomDataset } from "@/features/telecom/lib/dataset-detection";
import { fetchDailyTrend, transactionDateExpr } from "@/features/telecom/lib/queries";
import { DEFAULT_MAPPING } from "@/features/telecom/store";
import type * as Types from "@/features/telecom/types";
import { runReadOnlyQuery } from "@/platform/duckdb/duckdb";

/**
 * Live telecom analytics for the desktop widgets layer.
 *
 * Desktop widgets render on the bare canvas, outside the
 * `TelecomReportRuntimeProvider`, so we self-wire `useTelecomAnalytics` exactly
 * like `MissionControl` does: pick the freshest telecom dataset, feed its view
 * name into the hook, and surface only the read-only result + a `ready` flag.
 *
 * Call this ONCE (in `WidgetsLayer`) and pass the result down to each widget so
 * the (relatively heavy) DuckDB analytics pipeline runs a single time for all
 * tiles instead of once per widget.
 */
// Stable empty reference — see the canalMapping comment in useWidgetTelecomData.
const EMPTY_CANAL_MAPPING: Types.CanalMapping[] = [];

export interface WidgetTelecomData {
  /** Whether a telecom dataset is loaded and its KPIs are available. */
  ready: boolean;
  /** Name of the active telecom report (for labels). Empty when none. */
  fileName: string;
  kpi: Types.KPISummary | null;
  canals: Types.CanalSummary[];
  hourly: Types.HourlyRow[];
  /** Per-day trend across the whole dataset (date filter does not apply). */
  daily: Types.DailyTrendRow[];
  widgetDate: string | null;
}

export function useWidgetTelecomData(): WidgetTelecomData {
  const datasets = useDataStore((s) => s.datasets);
  const activeDatasetId = useDataStore((s) => s.activeDatasetId);
  const widgetDate = useDesktopStore((s) => s.widgetDate);
  // Only run the (whole-dataset) daily query when a daily-trend widget is pinned.
  const needsDaily = useDesktopStore((s) => s.widgets.some((w) => w.type === "daily-trend"));

  const firstLoad = useRef(true);
  const fileNameRef = useRef("");
  const tableNameRef = useRef("");

  const [tableReady, setTableReady] = useState(false);
  const [statusMapping, setStatusMapping] = useState<Types.StatusMapping[]>([]);

  const telecomDatasets = useMemo(
    () =>
      datasets
        .filter(isTelecomDataset)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [datasets],
  );

  const activeTelecomDataset = useMemo(() => {
    const active = datasets.find((d) => d.id === activeDatasetId);
    if (active && isTelecomDataset(active)) return active;
    return telecomDatasets[0] ?? null;
  }, [datasets, activeDatasetId, telecomDatasets]);

  const getTableName = useCallback(() => tableNameRef.current, []);

  const analytics = useTelecomAnalytics({
    getTableName,
    mapping: DEFAULT_MAPPING,
    loaded: tableReady,
    statusMapping,
    // The widget layer has no blocking-dialog UI (unlike the full report
    // page), so it can't resolve unclassified canal combos itself — leave
    // canalMapping empty and no-op the callback. Those transactions still
    // count toward the widget's total KPI; they're just excluded from its
    // canal breakdown until resolved on the full report page.
    canalMapping: EMPTY_CANAL_MAPPING,
    firstLoad,
    fileNameRef,
    onStatusMappingAdditions: (additions) => {
      setStatusMapping((prev) => [...prev, ...additions]);
    },
    onUnclassifiedCanalCombos: () => {},
  });

  const dateQuery = useQuery({
    queryKey: ["widget-date-kpi", tableNameRef.current, widgetDate],
    queryFn: async (): Promise<{ kpi: Types.KPISummary; hourly: Types.HourlyRow[] } | null> => {
      const table = tableNameRef.current;
      if (!widgetDate || !table) return null;
      const m = DEFAULT_MAPPING;
      const dateExpr = transactionDateExpr(m.transactionDate);
      const sn = `CASE
      WHEN UPPER(CAST("${m.status}" AS VARCHAR)) IN ('00','000','0000','SUCCESS','OK','1') THEN 'SUCCESS'
      WHEN UPPER(CAST("${m.status}" AS VARCHAR)) IN ('REFUND','REMBOURS') THEN 'REFUND'
      WHEN UPPER(CAST("${m.status}" AS VARCHAR)) IN ('INSTANCE','PENDING','EN ATTENTE') THEN 'INSTANCE'
      WHEN UPPER(CAST("${m.status}" AS VARCHAR)) IN ('SUBMITTED') THEN 'SUBMITTED'
      ELSE 'DECLINED'
    END`;
      try {
        const [kpiRows, hourlyRows] = await Promise.all([
          runReadOnlyQuery(`
          WITH base AS (
            SELECT
              ${sn} AS _status,
              TRY_CAST("${m.amount}" AS DOUBLE) AS _amt,
              CAST("${m.msisdn}" AS VARCHAR) AS _id
            FROM "${table}"
            WHERE CAST(${dateExpr} AS DATE) = CAST('${widgetDate}' AS DATE)
          )
          SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE _status='SUCCESS') AS success_count,
            COUNT(*) FILTER (WHERE _status='DECLINED') AS declined_count,
            COUNT(*) FILTER (WHERE _status='REFUND') AS refund_count,
            COUNT(*) FILTER (WHERE _status='INSTANCE') AS instance_count,
            COUNT(*) FILTER (WHERE _status='SUBMITTED') AS submitted_count,
            ROUND(COUNT(*) FILTER (WHERE _status='SUCCESS')*100.0/NULLIF(COUNT(*),0),2) AS success_rate,
            ROUND(SUM(_amt) FILTER (WHERE _status='SUCCESS'),3) AS total_amount,
            APPROX_COUNT_DISTINCT(_id) AS unique_customers
          FROM base
        `),
          runReadOnlyQuery(`
          WITH base AS (
            SELECT
              ${sn} AS _status,
              TRY_CAST("${m.amount}" AS DOUBLE) AS _amt,
              TRY_CAST(SPLIT_PART(SPLIT_PART(CAST("${m.transactionDate}" AS VARCHAR),' ',2),':',1) AS INTEGER) AS _hour
            FROM "${table}"
            WHERE CAST(${dateExpr} AS DATE) = CAST('${widgetDate}' AS DATE)
          )
          SELECT
            _hour AS hour,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE _status='SUCCESS') AS success,
            COUNT(*) FILTER (WHERE _status='DECLINED') AS declined,
            COALESCE(ROUND(SUM(_amt) FILTER (WHERE _status='SUCCESS'),3),0) AS amount
          FROM base
          WHERE _hour IS NOT NULL
          GROUP BY 1
          ORDER BY 1
        `),
        ]);
        const r = kpiRows[0];
        if (!r || Number(r.total) === 0) return null;
        const kpi: Types.KPISummary = {
          totalTransactions: Number(r.total),
          successCount: Number(r.success_count),
          declinedCount: Number(r.declined_count),
          refundCount: Number(r.refund_count),
          instanceCount: Number(r.instance_count),
          submittedCount: Number(r.submitted_count),
          successRate: Number(r.success_rate),
          totalAmount: Number(r.total_amount),
          avgAmount: 0,
          avgProcessingMs: 0,
          uniqueCustomers: Number(r.unique_customers),
          peakHour: 0,
          topErrorCode: "",
        };
        const hourly: Types.HourlyRow[] = hourlyRows
          .filter((h) => h.hour !== null)
          .map((h) => ({
            hour: Number(h.hour),
            total: Number(h.total),
            success: Number(h.success),
            declined: Number(h.declined),
            amount: Number(h.amount),
          }));
        if (hourly.length > 0) {
          kpi.peakHour = hourly.reduce((max, h) => (h.total > max.total ? h : max), hourly[0]).hour;
        }
        return { kpi, hourly };
      } catch {
        return null;
      }
    },
    enabled: Boolean(widgetDate) && tableReady && Boolean(tableNameRef.current),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const dailyQuery = useQuery({
    queryKey: ["widget-daily-trend", tableNameRef.current, tableReady],
    queryFn: async (): Promise<Types.DailyTrendRow[]> => {
      const table = tableNameRef.current;
      if (!table) return [];
      return fetchDailyTrend(table, DEFAULT_MAPPING);
    },
    enabled: needsDaily && tableReady && Boolean(tableNameRef.current),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  useEffect(() => {
    if (!activeTelecomDataset) {
      setTableReady(false);
      tableNameRef.current = "";
      fileNameRef.current = "";
      return;
    }
    const viewName = activeTelecomDataset.viewName || activeTelecomDataset.tableName;
    if (!viewName) {
      setTableReady(false);
      tableNameRef.current = "";
      fileNameRef.current = activeTelecomDataset.name;
      return;
    }
    tableNameRef.current = viewName;
    fileNameRef.current = activeTelecomDataset.name;
    firstLoad.current = true;
    setTableReady(true);
  }, [activeTelecomDataset]);

  const dateData = dateQuery.data ?? null;
  const effectiveKpi = widgetDate ? (dateData?.kpi ?? null) : analytics.kpi;
  const effectiveHourly = widgetDate ? (dateData?.hourly ?? []) : analytics.hourly;
  const effectiveCanals = widgetDate ? [] : analytics.canals;

  return {
    ready: tableReady && Boolean(widgetDate ? dateData?.kpi : analytics.kpi),
    fileName: activeTelecomDataset?.name ?? "",
    kpi: effectiveKpi,
    canals: effectiveCanals,
    hourly: effectiveHourly,
    daily: dailyQuery.data ?? [],
    widgetDate,
  };
}
