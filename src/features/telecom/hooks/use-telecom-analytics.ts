"use client";

import { useCallback, useRef, useState } from "react";
import { type ForecastPoint, forecastNextHours } from "@/lib/forecast-onnx";
import { scheduleTask } from "@/lib/idle-scheduler";
import { acquireWakeLock, releaseWakeLock } from "@/lib/wake-lock";
import { runQuery } from "@/lib/duckdb";
import { broadcast } from "@/features/telecom/lib/channel";
import { DEFAULT_STATUS_MAPPINGS } from "@/features/telecom/constants";
import type * as Types from "@/features/telecom/types";
import {
  fetchKPI as _fetchKPI,
  fetchRawCanalSummaries,
  fetchHourly as _fetchHourly,
  fetchStatusBreakdown as _fetchStatusBreakdown,
  fetchDistinctStatuses as _fetchDistinctStatuses,
  fetchErrors as _fetchErrors,
  fetchOperators as _fetchOperators,
  fetchRegions as _fetchRegions,
} from "@/features/telecom/lib/queries";
import { enrichCanalSummaries } from "@/features/telecom/lib/canal-config";
import { fmtN, fmtPct } from "@/features/telecom/lib/format";

// ── SEMANTIC_OPTIONS (duplicated here so the hook has no JSX dependency) ────
const SEMANTIC_OPTIONS: Array<{
  value: Types.StatusSemantic;
  label: string;
  badgeClass: string;
  color: string;
}> = [
  {
    value: "success",
    label: "Réussie",
    badgeClass:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
    color: "#10b981",
  },
  {
    value: "declined",
    label: "Échec",
    badgeClass:
      "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30",
    color: "#ef4444",
  },
  {
    value: "instance",
    label: "Instance",
    badgeClass:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
    color: "#f59e0b",
  },
  {
    value: "refund",
    label: "Annulation",
    badgeClass:
      "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30",
    color: "#8b5cf6",
  },
  {
    value: "submitted",
    label: "Confirmé",
    badgeClass:
      "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30",
    color: "#3b82f6",
  },
  {
    value: "other",
    label: "Other",
    badgeClass: "bg-muted/30 text-muted-foreground border-border",
    color: "#94a3b8",
  },
];

export interface UseTelecomAnalyticsParams {
  /**
   * Returns the current TABLE_NAME.  Accepting a getter keeps the hook
   * decoupled from the module-level mutable while always seeing the latest value.
   */
  getTableName: () => string;
  /** Column mapping — used by every query wrapper */
  mapping: Types.ColumnMapping;
  /** Ref that always mirrors the current statusMapping (no dep-array churn) */
  statusMappingRef: React.MutableRefObject<Types.StatusMapping[]>;
  /** Whether a file has been loaded into DuckDB */
  loaded: boolean;
  /** Ref that is true until the first analytics run completes */
  firstLoad: React.MutableRefObject<boolean>;
  /** Ref so the notification/broadcast can read the file name without stale closure */
  fileNameRef: React.MutableRefObject<string>;
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
  errors: Types.ErrorRow[];
  setErrors: (v: Types.ErrorRow[]) => void;
  operators: Types.OperatorRow[];
  setOperators: (v: Types.OperatorRow[]) => void;
  regions: Types.RegionRow[];
  setRegions: (v: Types.RegionRow[]) => void;
  computing: boolean;
  forecast: ForecastPoint[];
  rawStatuses: Types.RawStatusRow[];
  refreshKey: number;
  setRefreshKey: React.Dispatch<React.SetStateAction<number>>;
  runAnalytics: (m: Types.ColumnMapping, sm: Types.StatusMapping[]) => Promise<void>;
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
  statusMappingRef,
  firstLoad,
  fileNameRef,
  onStatusMappingAdditions,
}: UseTelecomAnalyticsParams): UseTelecomAnalyticsReturn {
  const [kpi, setKpi] = useState<Types.KPISummary | null>(null);
  const [canals, setCanals] = useState<Types.CanalSummary[]>([]);
  const [hourly, setHourly] = useState<Types.HourlyRow[]>([]);
  const [statusData, setStatusData] = useState<Types.StatusRow[]>([]);
  const [errors, setErrors] = useState<Types.ErrorRow[]>([]);
  const [operators, setOperators] = useState<Types.OperatorRow[]>([]);
  const [regions, setRegions] = useState<Types.RegionRow[]>([]);
  const [computing, setComputing] = useState(false);
  const [forecast, setForecast] = useState<ForecastPoint[]>([]);
  const [rawStatuses, setRawStatuses] = useState<Types.RawStatusRow[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  // F18 — AbortController ref to cancel stale analytics runs
  const abortCtrlRef = useRef<AbortController | null>(null);

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

  const fetchStatusBreakdown = (m: Types.ColumnMapping, sm = DEFAULT_STATUS_MAPPINGS) =>
    _fetchStatusBreakdown(getTableName(), m, sm);

  const fetchDistinctStatuses = (m: Types.ColumnMapping) =>
    _fetchDistinctStatuses(getTableName(), m);

  const fetchErrors = (m: Types.ColumnMapping, sm = DEFAULT_STATUS_MAPPINGS, limit = 20) =>
    _fetchErrors(getTableName(), m, sm, limit);

  const fetchOperators = (m: Types.ColumnMapping, sm = DEFAULT_STATUS_MAPPINGS) =>
    _fetchOperators(getTableName(), m, sm);

  const fetchRegions = (m: Types.ColumnMapping, sm = DEFAULT_STATUS_MAPPINGS) =>
    _fetchRegions(getTableName(), m, sm);

  // ── runAnalytics ─────────────────────────────────────────────────────────────
  const runAnalytics = useCallback(
    async (m: Types.ColumnMapping, sm: Types.StatusMapping[]) => {
      // F18: cancel any in-flight run immediately
      abortCtrlRef.current?.abort("new run");
      const ctrl = new AbortController();
      abortCtrlRef.current = ctrl;
      const { signal } = ctrl;

      setComputing(true);
      // Note: setLoadPhase lives in useTelecomFileLoad; pass through computing flag only
      setErrors([]);

      // F17: prevent screen sleep during heavy computation
      await acquireWakeLock();

      const tableName = getTableName();

      // Guard: verify the table exists before running any queries
      try {
        const check = await runQuery(
          `SELECT 1 FROM information_schema.tables WHERE table_name = '${tableName}' LIMIT 1`,
        );
        if (check.length === 0) {
          setComputing(false);
          await releaseWakeLock();
          return;
        }
      } catch {
        setComputing(false);
        await releaseWakeLock();
        return;
      }

      try {
        // F30 — Stream tier-1 queries: fire all in parallel, set state as each resolves
        const kpiP = scheduleTask(
          () => fetchKPI(m, sm),
          "user-blocking",
          signal,
        ).then((k) => {
          if (!signal.aborted) setKpi(k);
          return k;
        });

        const hourlyP = scheduleTask(
          () => fetchHourly(m, sm),
          "user-blocking",
          signal,
        ).then((h) => {
          if (!signal.aborted) setHourly(h);
          return h;
        });

        scheduleTask(
          () => fetchStatusBreakdown(m, sm),
          "user-blocking",
          signal,
        ).then((sd) => {
          if (!signal.aborted) setStatusData(sd);
          return sd;
        }).catch(() => {});

        const rawStatusP = scheduleTask(
          () => fetchDistinctStatuses(m),
          "user-blocking",
          signal,
        ).then((rs) => {
          if (!signal.aborted) setRawStatuses(rs);
          return rs;
        });

        // Wait for KPI to resolve first so we have totalTransactions for canal %
        const k = await kpiP;
        if (signal.aborted) return;
        const total = k?.totalTransactions ?? 0;

        // Canal summaries: needs total, streams immediately
        const canalP = scheduleTask(
          () => fetchCanalSummaries(m, total, sm),
          "user-blocking",
          signal,
        ).then((cs) => {
          if (!signal.aborted) setCanals(cs);
          return cs;
        });

        // Tier 2 (background): secondary tabs + forecast
        scheduleTask(() => fetchErrors(m, sm), "background", signal)
          .then((er) => {
            if (!signal.aborted) setErrors(er);
          })
          .catch(() => {});
        scheduleTask(() => fetchOperators(m, sm), "background", signal)
          .then((ops) => {
            if (!signal.aborted) setOperators(ops);
          })
          .catch(() => {});
        scheduleTask(() => fetchRegions(m, sm), "background", signal)
          .then((regs) => {
            if (!signal.aborted) setRegions(regs);
          })
          .catch(() => {});

        // Wait for remaining tier-1 to finish for status mapping + notifications
        const [h, , rs] = await Promise.all([hourlyP, canalP, rawStatusP]);
        if (signal.aborted) return;

        // F13 — train tiny model on today's 24 hourly rows → 4-hour forecast
        scheduleTask(() => forecastNextHours(h, 4), "background", signal)
          .then((pts) => {
            if (!signal.aborted) setForecast(pts);
          })
          .catch(() => {});

        // Auto-merge newly discovered status codes (preserve user edits)
        if (firstLoad.current) {
          firstLoad.current = false;
          const known = new Set(sm.map((p) => p.rawCode));
          const autoMap: Record<string, Types.StatusSemantic> = {
            PST: "success",
            SUC: "success",
            OK: "success",
            SUCCESS: "success",
            REJ: "declined",
            FAIL: "declined",
            ERR: "declined",
            FLD: "declined",
            CAN: "declined",
            PND: "instance",
            PENDING: "instance",
            RVS: "refund",
            RVS_: "refund",
            EXP: "instance",
          };
          const additions: Types.StatusMapping[] = rs
            .filter((r) => !known.has(r.rawCode))
            .map((r) => {
              const sem = autoMap[r.rawCode] ?? "other";
              const opt =
                SEMANTIC_OPTIONS.find((o) => o.value === sem) ??
                SEMANTIC_OPTIONS[SEMANTIC_OPTIONS.length - 1];
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
        if (!signal.aborted) {
          // Surface error through errors state so UI can display it
          console.error("[useTelecomAnalytics] runAnalytics error:", e);
        }
      } finally {
        if (!signal.aborted) setComputing(false);
        await releaseWakeLock();
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
    errors,
    setErrors,
    operators,
    setOperators,
    regions,
    setRegions,
    computing,
    forecast,
    rawStatuses,
    refreshKey,
    setRefreshKey,
    runAnalytics,
  };
}
