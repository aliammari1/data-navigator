"use client";

/**
 * Real on-device data pipeline for the forecast feature.
 *
 * Replaces the synthetic `generateHistoricalData()` / `Math.random()` builders
 * that previously fed the screen. We bucket/aggregate the active dataset in
 * DuckDB SQL (`fetchDailyTrend` → `DATE_TRUNC('day', …) GROUP BY 1 ORDER BY 1`)
 * and `fetchHourly`, then map the Arrow-backed rows to the engine's
 * `SeriesPoint[]` contract. Everything runs fully offline against the local
 * DuckDB catalog.
 *
 * The active table name is resolved from the data store's active dataset, and
 * the telecom column mapping from the telecom store, mirroring how the telecom
 * report screens already source real data.
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useDataStore } from "@/core/stores/data-store";
import {
  fetchDailyTrend,
  fetchHourly,
  fetchKPI,
  fetchRawCanalSummaries,
  type RawCanalRow,
} from "@/features/telecom/lib/queries";
import { useTelecomStore } from "@/features/telecom/store";
import type {
  ColumnMapping,
  DailyTrendRow,
  HourlyRow,
  KPISummary,
} from "@/features/telecom/types";
import type { SeriesPoint } from "../core/forecast-engine";

export interface ForecastData {
  /** Real per-day rows from DuckDB (chronological). */
  daily: DailyTrendRow[];
  /** Real per-hour rows from DuckDB (0–23). */
  hourly: HourlyRow[];
  /** Real per-channel (canal) summaries from DuckDB. */
  channels: RawCanalRow[];
  /** Real dataset-wide KPI summary, or null when unavailable. */
  kpi: KPISummary | null;
  /** Daily transaction-volume series for the engine. */
  volumeSeries: SeriesPoint[];
  /** Daily success-rate series (percent) for the engine. */
  successSeries: SeriesPoint[];
  /** Daily revenue/amount series for the engine. */
  revenueSeries: SeriesPoint[];
}

const EMPTY: ForecastData = {
  daily: [],
  hourly: [],
  channels: [],
  kpi: null,
  volumeSeries: [],
  successSeries: [],
  revenueSeries: [],
};

/** Resolve the active DuckDB view/table name for the current dataset. */
export function useActiveForecastTable(): string | null {
  return useDataStore((s) => {
    const dataset = s.datasets.find((d) => d.id === s.activeDatasetId);
    return dataset?.viewName ?? dataset?.tableName ?? null;
  });
}

function toVolumeSeries(rows: DailyTrendRow[]): SeriesPoint[] {
  return rows.map((r) => ({ date: r.day, value: r.total }));
}

function toSuccessSeries(rows: DailyTrendRow[]): SeriesPoint[] {
  return rows.map((r) => ({
    date: r.day,
    value: r.total > 0 ? (r.success / r.total) * 100 : 0,
  }));
}

function toRevenueSeries(rows: DailyTrendRow[]): SeriesPoint[] {
  return rows.map((r) => ({ date: r.day, value: r.amount }));
}

/**
 * Load and shape the active dataset for forecasting.
 *
 * Returns `isReady=false` when no dataset is active or the series are too short
 * to forecast, so callers can show an explicit empty state instead of inventing
 * data.
 */
export function useForecastData() {
  const tableName = useActiveForecastTable();
  const mapping = useTelecomStore((s) => s.columnMapping);

  const query = useQuery({
    queryKey: ["forecast", "series", tableName, JSON.stringify(mapping)],
    enabled: Boolean(tableName),
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<ForecastData> => {
      if (!tableName) return EMPTY;
      const m = mapping as ColumnMapping;
      const [daily, hourly, kpi] = await Promise.all([
        fetchDailyTrend(tableName, m),
        fetchHourly(tableName, m),
        fetchKPI(tableName, m),
      ]);
      const channels = await fetchRawCanalSummaries(
        tableName,
        m,
        kpi?.totalTransactions ?? 0,
      );
      return {
        daily,
        hourly,
        channels,
        kpi,
        volumeSeries: toVolumeSeries(daily),
        successSeries: toSuccessSeries(daily),
        revenueSeries: toRevenueSeries(daily),
      };
    },
  });

  const data = query.data ?? EMPTY;

  // A forecast needs at least a couple of real observations to be meaningful.
  const hasData = data.daily.length >= 2;

  return useMemo(
    () => ({
      ...data,
      tableName,
      hasData,
      isLoading: query.isLoading && Boolean(tableName),
      isError: query.isError,
      error: query.error,
      noDataset: !tableName,
    }),
    [
      data,
      tableName,
      hasData,
      query.isLoading,
      query.isError,
      query.error,
    ],
  );
}
