"use client";

/**
 * Real, traceable report insights — replaces every fabricated number that used
 * to live in the generators (the `* 0.94` "yesterday", the `Math.random()`
 * hourly chart fill, the hand-waved trend arrows, the AI regex repair loops).
 *
 * Two sources, both offline and deterministic:
 *  - DuckDB (`runReadOnlyQuery`, via `aggregateReportData`) for the previous
 *    period totals + hourly series.
 *  - The SEEDED analysis worker (`@/platform/viz` → `getAnalysisProxy`) for the
 *    Welch t-test (current vs previous hourly volume) and GESD anomaly flags.
 *
 * The AI narrative comes from the provider registry's `generateStructured`
 * (grammar-constrained JSON) — no parseJSON repair, no direct web-llm.
 */

import { getAnalysisProxy } from "@/platform/viz";
import type { AnalysisWorkerApi } from "@/workers/analysis.worker";
import type { RegisteredDataset } from "@/platform/duckdb/duckdb";
import type { ReportAnomaly, ReportComparison, ReportData } from "./types";
import { aggregateReportData, detectColumnRoles } from "../data/queries";

/** Subset of the analysis API this module uses (proxy or inline kernels). */
type AnalysisLike = Pick<AnalysisWorkerApi, "welchTTest" | "gesdAnomalies">;

/** Previous calendar day in `YYYY-MM-DD` form (UTC-stable, no locale drift). */
export function previousDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Resolve the analysis-worker proxy if available, else lazy-import the identical
 * pure kernels (Worker-less environments / SSR). The kernels are imported
 * dynamically ONLY on the fallback path, so the worker module (and its
 * `Comlink.expose`) is never pulled onto the renderer's hot path.
 */
async function analysis(): Promise<AnalysisLike> {
  const proxy = getAnalysisProxy();
  if (proxy) return proxy;
  const kernels = await import("@/workers/analysis.worker");
  return kernels;
}

/**
 * Flag anomalous hours in the real hourly volume series via GESD (seeded,
 * S-H-ESD style). Returns at most `maxAnomalies` hours, sorted by score.
 */
export async function detectHourlyAnomalies(
  data: ReportData,
  maxAnomalies = 4,
): Promise<ReportAnomaly[]> {
  const series = data.hourlyData;
  if (series.length < 4) return [];
  const counts = series.map((h) => h.count);
  const proxy = await analysis();
  const { indices, scores } = await proxy.gesdAnomalies(counts, { maxAnomalies });
  return indices
    .map((idx, k) => ({
      hour: series[idx]?.hour ?? idx,
      count: series[idx]?.count ?? 0,
      successRate: series[idx]?.successRate ?? 0,
      score: scores[k] ?? 0,
    }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Compute a real previous-period comparison: aggregate the previous day in
 * DuckDB and run a Welch two-sample t-test on the hourly volume series.
 * Returns `null` when there is no usable previous-period data.
 */
export async function computeComparison(
  dataset: RegisteredDataset,
  current: ReportData,
): Promise<ReportComparison | null> {
  // A meaningful previous-period comparison requires a timestamp column so the
  // two periods are actually different rows. Without one, suppress it rather
  // than report a fabricated 0% delta against an identical whole-view aggregate.
  if (!detectColumnRoles(dataset).timestamp) return null;

  const prevDate = previousDay(current.date);
  let prev: ReportData;
  try {
    prev = await aggregateReportData(dataset, prevDate, { scopeToDay: true });
  } catch {
    return null;
  }
  if (prev.totalTransactions === 0) return null;

  let volumeTrend: ReportComparison["volumeTrend"] = null;
  if (current.hourlyData.length >= 2 && prev.hourlyData.length >= 2) {
    const a = current.hourlyData.map((h) => h.count);
    const b = prev.hourlyData.map((h) => h.count);
    const proxy = await analysis();
    const t = await proxy.welchTTest(a, b);
    volumeTrend = {
      pValue: t.pValue,
      significant: t.significant,
      meanCurrent: t.meanA,
      meanPrev: t.meanB,
    };
  }

  return {
    prev: {
      date: prev.date,
      totalTransactions: prev.totalTransactions,
      successRate: prev.successRate,
      totalRevenue: prev.totalRevenue,
      failedTransactions: prev.failedTransactions,
    },
    volumeTrend,
  };
}

/**
 * Enrich a ReportData with seeded anomalies + a real previous-period comparison.
 * `dataset` is optional — without it (demo / no DuckDB) only anomalies are added.
 */
export async function enrichWithInsights(
  data: ReportData,
  dataset?: RegisteredDataset,
): Promise<ReportData> {
  const [anomalies, comparison] = await Promise.all([
    detectHourlyAnomalies(data).catch(() => [] as ReportAnomaly[]),
    dataset ? computeComparison(dataset, data).catch(() => null) : Promise.resolve(null),
  ]);
  return {
    ...data,
    anomalies,
    comparison: comparison ?? undefined,
  };
}
