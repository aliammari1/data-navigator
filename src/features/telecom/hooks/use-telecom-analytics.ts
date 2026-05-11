"use client";

import { useCallback, useState } from "react";
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
  fetchRawCanalSummaries,
} from "@/features/telecom/lib/queries";
import {
  DEFAULT_STATUS_MAPPINGS,
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
  /** Ref that always mirrors the current statusMapping (no dep-array churn) */
  statusMappingRef: React.RefObject<Types.StatusMapping[]>;
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
  refreshKey: number;
  setRefreshKey: React.Dispatch<React.SetStateAction<number>>;
  runAnalytics: (
    m: Types.ColumnMapping,
    sm: Types.StatusMapping[],
  ) => Promise<void>;
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
  firstLoad,
  fileNameRef,
  onStatusMappingAdditions,
}: UseTelecomAnalyticsParams): UseTelecomAnalyticsReturn {
  const [kpi, setKpi] = useState<Types.KPISummary | null>(null);
  const [canals, setCanals] = useState<Types.CanalSummary[]>([]);
  const [hourly, setHourly] = useState<Types.HourlyRow[]>([]);
  const [statusData, setStatusData] = useState<Types.StatusRow[]>([]);
  const [operators, setOperators] = useState<Types.OperatorRow[]>([]);
  const [regions, setRegions] = useState<Types.RegionRow[]>([]);
  const [forecast, setForecast] = useState<ForecastPoint[]>([]);
  const [rawStatuses, setRawStatuses] = useState<Types.RawStatusRow[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  // ── Query wrappers bound to the current TABLE_NAME via getTableName() ───────
  const fetchKPI = (m: Types.ColumnMapping, sm = DEFAULT_STATUS_MAPPINGS) =>
    _fetchKPI(getTableName(), m, sm);

  const fetchCanalSummaries = async (
    m: Types.ColumnMapping,
    totalTx: number,
    sm = DEFAULT_STATUS_MAPPINGS,
  ): Promise<Types.CanalSummary[]> => {
    const raw = await fetchRawCanalSummaries(getTableName(), m, totalTx, sm);
    return enrichCanalSummaries(raw);
  };

  const fetchHourly = (m: Types.ColumnMapping, sm = DEFAULT_STATUS_MAPPINGS) =>
    _fetchHourly(getTableName(), m, sm);

  const fetchStatusBreakdown = (
    m: Types.ColumnMapping,
    sm = DEFAULT_STATUS_MAPPINGS,
  ) => _fetchStatusBreakdown(getTableName(), m, sm);

  const fetchDistinctStatuses = (m: Types.ColumnMapping) =>
    _fetchDistinctStatuses(getTableName(), m);

  const fetchOperators = (
    m: Types.ColumnMapping,
    sm = DEFAULT_STATUS_MAPPINGS,
  ) => _fetchOperators(getTableName(), m, sm);

  const fetchRegions = (m: Types.ColumnMapping, sm = DEFAULT_STATUS_MAPPINGS) =>
    _fetchRegions(getTableName(), m, sm);

  // ── runAnalytics ─────────────────────────────────────────────────────────────
  // biome-ignore lint/correctness/useExhaustiveDependencies: query wrappers intentionally close over the stable getTableName getter; preserving current analytics refresh semantics during simplification
  const runAnalytics = useCallback(
    async (m: Types.ColumnMapping, sm: Types.StatusMapping[]) => {
      const tableName = getTableName();

      // Guard: verify the table exists before running any queries
      try {
        const check = await runQuery(
          `SELECT 1 FROM information_schema.tables WHERE table_name = '${tableName}' LIMIT 1`,
        );
        if (check.length === 0) {
          return;
        }
      } catch {
        return;
      }

      try {
        // F30 — Stream tier-1 queries: fire all in parallel, set state as each resolves
        const kpiP = (() => fetchKPI(m, sm))().then((k) => {
          setKpi(k);
          return k;
        });

        const hourlyP = (() => fetchHourly(m, sm))().then((h) => {
          setHourly(h);
          return h;
        });

        // Prevent unhandledRejection if the run is aborted before this promise
        // is awaited (i.e. the function returns early after kpiP rejects).
        hourlyP.catch(() => {});

        const _statusBreakdownP = (() => fetchStatusBreakdown(m, sm))().then(
          (sd) => {
            setStatusData(sd);
            return sd;
          },
        );

        const rawStatusP = (() => fetchDistinctStatuses(m))().then((rs) => {
          setRawStatuses(rs);
          return rs;
        });
        rawStatusP.catch(() => {});

        // Wait for KPI to resolve first so we have totalTransactions for canal %
        const k = await kpiP;
        const total = k?.totalTransactions ?? 0;

        // Canal summaries: needs total, streams immediately
        const canalP = (() => fetchCanalSummaries(m, total, sm))().then(
          (cs) => {
            setCanals(cs);
            return cs;
          },
        );

        // Tier 2 (background): secondary tabs + forecast

        (() => fetchOperators(m, sm))().then((ops) => {
          setOperators(ops);
        });

        (() => fetchRegions(m, sm))().then((regs) => {
          setRegions(regs);
        });

        // Wait for remaining tier-1 to finish for status mapping + notifications
        const [h, , rs] = await Promise.all([hourlyP, canalP, rawStatusP]);

        // F13 — train tiny model on today's 24 hourly rows → 4-hour forecast
        (() => forecastNextHours(h, 4))().then((pts) => {
          setForecast(pts);
        });

        // Auto-merge newly discovered status codes (preserve user edits)
        if (firstLoad.current) {
          firstLoad.current = false;
          const known = new Set(sm.map((p) => p.rawCode));
          const additions: Types.StatusMapping[] = rs
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
          if (additions.length > 0) {
            onStatusMappingAdditions(additions);
            setRefreshKey((prev) => prev + 1);
          }
        }

        // F9 — Web Notification when tab is hidden
        if (document.hidden && Notification.permission === "granted" && k) {
          new Notification(`Rapport prêt — ${fileNameRef.current}`, {
            body: `${fmtN(k.totalTransactions)} tx · ${fmtPct(k.successRate)} réussite`,
            icon: "/icon-192.png",
            tag: "telecom-ready",
          });
        }

        // F10 — broadcast analytics ready to other tabs
        broadcast({
          type: "ANALYTICS_READY",
          fileName: fileNameRef.current,
          successRate: k?.successRate ?? 0,
          totalTx: k?.totalTransactions ?? 0,
        });
      } catch (e) {
        console.error("[useTelecomAnalytics] runAnalytics error:", e);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getTableName, firstLoad, fileNameRef, onStatusMappingAdditions],
  );

  return {
    kpi,
    setKpi,
    canals,
    setCanals,
    hourly,
    setHourly,
    statusData,
    setStatusData,
    operators,
    setOperators,
    regions,
    setRegions,
    forecast,
    rawStatuses,
    refreshKey,
    setRefreshKey,
    runAnalytics,
  };
}
