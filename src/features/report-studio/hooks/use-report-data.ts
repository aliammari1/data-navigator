"use client";

/**
 * Report data source — TanStack Query over DuckDB aggregates with a seeded demo
 * fallback. Replaces the hardcoded `SAMPLE_DATA` on the hot path.
 *
 * Flow:
 *  1. Resolve the active dataset from the data-store (narrow selectors).
 *  2. Aggregate it in DuckDB (`aggregateReportData` — one row per channel + 24
 *     hourly buckets + a totals row; all SQL pushdown, tiny result).
 *  3. Enrich with SEEDED analysis-worker insights (GESD anomalies + a real
 *     previous-period Welch t-test).
 *  4. When no dataset / DuckDB is reachable, fall back to the deterministic
 *     `SAMPLE_DATA` so the screen still renders offline.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDataStore } from "@/core/stores/data-store";
import type { Dataset } from "@/core/stores/data-store";
import type { RegisteredDataset } from "@/platform/duckdb/duckdb";
import { aggregateReportData, detectColumnRoles } from "../data/queries";
import { enrichWithInsights } from "../lib/insights";
import { buildSampleData } from "../lib/sample-data";
import type { ReportData } from "../lib/types";

/** Map the app `Dataset` (ColType-typed) onto the duckdb `RegisteredDataset`
 *  shape that `queries.ts` heuristics expect (raw SQL type strings). */
function toRegistered(ds: Dataset): RegisteredDataset {
  const SQL_TYPE: Record<string, string> = {
    number: "DOUBLE",
    string: "VARCHAR",
    date: "TIMESTAMP",
    boolean: "BOOLEAN",
    unknown: "VARCHAR",
  };
  return {
    id: ds.id,
    displayName: ds.name,
    viewName: ds.viewName || ds.tableName || ds.id,
    sourcePath: ds.sourcePath ?? "",
    cachePath: ds.cachePath ?? "",
    sourceFormat: ds.format === "parquet" ? "parquet" : "csv",
    rowCount: ds.rowCount,
    columns: ds.columns.map((c) => ({
      name: c.name,
      type: SQL_TYPE[c.type] ?? "VARCHAR",
      nullable: c.nullCount > 0,
    })),
    createdAt: ds.createdAt,
    updatedAt: ds.updatedAt,
  };
}

export interface UseReportDataResult {
  data: ReportData;
  isLoading: boolean;
  isError: boolean;
  /** True when the result is the seeded demo fallback (no real dataset). */
  isDemo: boolean;
  datasetName: string | null;
  refetch: () => void;
}

export function useReportData(date: string): UseReportDataResult {
  const datasets = useDataStore((s) => s.datasets);
  const activeDatasetId = useDataStore((s) => s.activeDatasetId);

  const activeDataset = useMemo(
    () => datasets.find((d) => d.id === activeDatasetId) ?? datasets[0] ?? null,
    [datasets, activeDatasetId],
  );

  const registered = useMemo(
    () => (activeDataset ? toRegistered(activeDataset) : null),
    [activeDataset],
  );

  const query = useQuery({
    queryKey: ["report-studio", "aggregate", registered?.id ?? "demo", date],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ data: ReportData; isDemo: boolean }> => {
      if (!registered) {
        return { data: buildSampleData(date), isDemo: true };
      }
      // Scope today's aggregate to the calendar day when a timestamp exists, so
      // it lines up with the day-scoped previous-period comparison.
      const scopeToDay = Boolean(detectColumnRoles(registered).timestamp);
      const aggregated = await aggregateReportData(registered, date, { scopeToDay });
      // If the chosen day has no rows, fall back to the whole-view aggregate so
      // the screen still shows real numbers instead of an empty report.
      const base =
        scopeToDay && aggregated.totalTransactions === 0
          ? await aggregateReportData(registered, date)
          : aggregated;
      const enriched = await enrichWithInsights(base, registered);
      return { data: enriched, isDemo: false };
    },
  });

  const fallback = useMemo(() => buildSampleData(date), [date]);

  return {
    data: query.data?.data ?? fallback,
    isLoading: query.isLoading,
    isError: query.isError,
    isDemo: query.data?.isDemo ?? true,
    datasetName: activeDataset?.name ?? null,
    refetch: query.refetch,
  };
}
