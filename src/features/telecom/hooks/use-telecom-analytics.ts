"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { enrichCanalSummaries } from "@/features/telecom/lib/canal-config";
import { ALL_CANAL_CHANNELS } from "@/features/telecom/lib/canal-hierarchy";
import { broadcast } from "@/features/telecom/lib/channel";
import { fmtN, fmtPct } from "@/features/telecom/lib/format";
import {
  fetchDistinctStatuses as _fetchDistinctStatuses,
  fetchHourly as _fetchHourly,
  fetchKPI as _fetchKPI,
  fetchOperators as _fetchOperators,
  fetchRegions as _fetchRegions,
  fetchStatusBreakdown as _fetchStatusBreakdown,
  fetchUnclassifiedCanalCombos as _fetchUnclassifiedCanalCombos,
  ensureTelecomEnrichedView,
  fetchRawCanalSummaries,
} from "@/features/telecom/lib/queries";
import {
  SEMANTIC_STATUS_OPTIONS,
  STATUS_AUTO_SEMANTIC_BY_CODE,
} from "@/features/telecom/lib/status-definitions";
import type * as Types from "@/features/telecom/types";
import { runReadOnlyQuery } from "@/platform/duckdb/duckdb";

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
  /** User-confirmed canal overrides for combos the hardcoded rules miss. */
  canalRule: Types.CanalRule[];
  /** Whether a file has been loaded into DuckDB */
  loaded: boolean;
  /** Ref that is true until the first analytics run completes */
  firstLoad: React.RefObject<boolean>;
  /** Ref so the notification/broadcast can read the file name without stale closure */
  fileNameRef: React.RefObject<string>;
  /** Called when new status codes are auto-discovered so page.tsx can update its state */
  onStatusMappingAdditions: (additions: Types.StatusMapping[]) => void;
  /** Called when transactions matching none of the 10 canal rules are found. */
  onUnclassifiedCanalCombos: (combos: Types.UnclassifiedCanalCombo[]) => void;
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
  rawStatuses: Types.RawStatusRow[];
  setRawStatuses: (v: Types.RawStatusRow[]) => void;
  isFetching: boolean;
  refresh: () => Promise<void>;
  runAnalytics: (
    m: Types.ColumnMapping,
    sm: Types.StatusMapping[],
    cm?: Types.CanalRule[],
  ) => Promise<void>;
}

interface TelecomAnalyticsPayload {
  kpi: Types.KPISummary | null;
  canals: Types.CanalSummary[];
  hourly: Types.HourlyRow[];
  statusData: Types.StatusRow[];
  operators: Types.OperatorRow[];
  regions: Types.RegionRow[];
  rawStatuses: Types.RawStatusRow[];
}

const EMPTY_ANALYTICS: TelecomAnalyticsPayload = {
  kpi: null,
  canals: [],
  hourly: [],
  statusData: [],
  operators: [],
  regions: [],
  rawStatuses: [],
};

function stableHash(value: unknown) {
  return JSON.stringify(value);
}

/**
 * Merges default system canal rules with custom user-defined rules.
 * Custom rules with the same ID as default rules will override the defaults.
 * This ensures that the hardcoded rules from report-engine.ts are always included
 * in canal classification, preventing transactions from being incorrectly flagged as
 * "unclassified" when they match a default rule.
 */
function mergeCanalRules(customRules: Types.CanalRule[]): Types.CanalRule[] {
  // Create a map of custom rules by ID for quick lookup
  const customById = new Map<string, Types.CanalRule>();
  for (const rule of customRules) {
    customById.set(rule.id, rule);
  }

  // Start with all default rules
  const merged: Types.CanalRule[] = [];

  // Add custom rules that override defaults or are new
  for (const rule of customRules) {
    merged.push(rule);
  }

  // Add default rules that aren't overridden by custom rules
  for (const defaultRule of ALL_CANAL_CHANNELS) {
    if (!customById.has(defaultRule.id)) {
      merged.push(defaultRule);
    }
  }

  return merged;
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
  canalRule,
  firstLoad,
  fileNameRef,
  onStatusMappingAdditions,
  onUnclassifiedCanalCombos,
}: UseTelecomAnalyticsParams): UseTelecomAnalyticsReturn {
  const queryClient = useQueryClient();
  const tableName = getTableName();
  const analyticsQueryKey = [
    "telecom",
    "analytics",
    tableName,
    stableHash(mapping),
    stableHash(statusMapping),
    stableHash(canalRule),
  ] as const;

  const computeAnalytics = useCallback(
    async (
      table: string,
      m: Types.ColumnMapping,
      sm: Types.StatusMapping[],
      cm: Types.CanalRule[],
    ): Promise<TelecomAnalyticsPayload> => {
      // Merge custom rules with default system rules
      const mergedCanalRules = mergeCanalRules(cm);

      try {
        const check = await runReadOnlyQuery(
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
        const [rawCanalsResult, operatorsResult, regionsResult] = await Promise.all([
          fetchRawCanalSummaries(table, m, total, sm, mergedCanalRules),
          _fetchOperators(table, m, sm),
          _fetchRegions(table, m, sm),
        ]);
        const canalsResult = enrichCanalSummaries(rawCanalsResult);

        let rawStatuses: Types.RawStatusRow[] =
          queryClient.getQueryData<TelecomAnalyticsPayload>(analyticsQueryKey)?.rawStatuses ?? [];

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

          // Same "resolve unknowns before trusting the report" gate as status
          // codes above, but for rows none of the 10 hardcoded canal rules
          // match — this is what makes the canal/product/revenue-group
          // breakdown always reconcile to kpi.totalTransactions instead of
          // silently undercounting by whatever falls through unnoticed.
          const unclassifiedCombos = await _fetchUnclassifiedCanalCombos(table, m, mergedCanalRules);
          if (unclassifiedCombos.length > 0) onUnclassifiedCanalCombos(unclassifiedCombos);
        }

        const payload: TelecomAnalyticsPayload = {
          kpi: kpiResult,
          hourly: hourlyResult,
          statusData: statusResult,
          canals: canalsResult,
          operators: operatorsResult,
          regions: regionsResult,
          rawStatuses,
        };

        // Local-only desktop notification. Fully optional: degrade silently
        // when the Notification API is absent or permission is not granted
        // (offline-safe — the icon is a bundled same-origin asset, never CDN).
        if (
          typeof Notification !== "undefined" &&
          document.hidden &&
          Notification.permission === "granted" &&
          kpiResult
        ) {
          try {
            new Notification(`Rapport prêt — ${fileNameRef.current}`, {
              body: `${fmtN(kpiResult.totalTransactions)} tx · ${fmtPct(kpiResult.successRate)} réussite`,
              icon: "/icon-192.png",
              tag: "telecom-ready",
            });
          } catch {
            // Notification construction can throw on some platforms; ignore.
          }
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
      onUnclassifiedCanalCombos,
      queryClient,
    ],
  );

  const query = useQuery({
    queryKey: analyticsQueryKey,
    queryFn: () => computeAnalytics(tableName, mapping, statusMapping, canalRule),
    enabled: loaded && Boolean(tableName),
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    placeholderData: (previous) => previous,
  });

  const data = query.data ?? EMPTY_ANALYTICS;

  const patchAnalytics = useCallback(
    (patch: Partial<TelecomAnalyticsPayload>) => {
      queryClient.setQueryData<TelecomAnalyticsPayload>(analyticsQueryKey, (prev) => ({
        ...(prev ?? EMPTY_ANALYTICS),
        ...patch,
      }));
    },
    [analyticsQueryKey, queryClient],
  );

  const refresh = useCallback(async () => {
    await query.refetch();
  }, [query]);

  const runAnalytics = useCallback(
    async (m: Types.ColumnMapping, sm: Types.StatusMapping[], cm: Types.CanalRule[] = []) => {
      await queryClient.fetchQuery({
        queryKey: [
          "telecom",
          "analytics",
          getTableName(),
          stableHash(m),
          stableHash(sm),
          stableHash(cm),
        ],
        queryFn: () => computeAnalytics(getTableName(), m, sm, cm),
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
    rawStatuses: data.rawStatuses,
    setRawStatuses: (rawStatuses) => patchAnalytics({ rawStatuses }),
    isFetching: query.isFetching,
    refresh,
    runAnalytics,
  };
}
