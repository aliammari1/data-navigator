"use client";

/**
 * Tab 2 — Forecast Intelligence.
 *
 * Feeds the reusable ForecastPanel (Holt-Winters + AI narrative) with REAL
 * volume and revenue series pulled from DuckDB via `useForecastData`.
 */

import { useForecastData } from "../data/use-forecast-data";
import { ForecastPanel } from "../components/forecast-panel";
import {
  LoadingState,
  NoDatasetState,
  NotEnoughDataState,
} from "./shared";

export default function IntelligenceTab() {
  const data = useForecastData();

  if (data.noDataset) return <NoDatasetState what="forecast intelligence" />;
  if (data.isLoading) return <LoadingState />;
  if (data.volumeSeries.length < 2)
    return <NotEnoughDataState what="Forecast intelligence" />;

  return (
    <div className="space-y-8">
      <ForecastPanel
        series={data.volumeSeries}
        metricLabel="Transaction volume"
        unit="tx"
        seasonLength={7}
      />
      <ForecastPanel
        series={data.revenueSeries}
        metricLabel="Daily revenue"
        unit="TND"
        seasonLength={7}
      />
    </div>
  );
}
