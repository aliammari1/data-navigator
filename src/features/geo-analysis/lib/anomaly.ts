"use client";

/**
 * Region success-rate anomaly detection via the seeded platform analysis worker.
 *
 * The screen previously flagged "risk" regions with an ad-hoc `> 15%` share
 * heuristic. This replaces that with the platform's seeded, off-main-thread
 * `getAnalysisProxy()` kernels: GESD (Generalized ESD / S-H-ESD) for robust
 * multi-outlier detection across the per-region success-rate series, falling
 * back to a robust MAD z-score for short/quiet series. All deterministic
 * (seed 42); identical math to the inline fallback when no worker is available.
 */

import { getAnalysisProxy } from "@/platform/viz";

async function inlineKernels() {
  const mod = await import("@/workers/analysis.worker");
  return {
    detectAnomalies: mod.detectAnomalies,
    gesdAnomalies: mod.gesdAnomalies,
  };
}

export interface RegionAnomaly {
  region: string;
  successRate: number;
  /** GESD/MAD score for the flagged region. */
  score: number;
  method: "gesd" | "mad";
}

/**
 * Detect regions whose success rate is a statistical outlier across the active
 * dataset's regions. Only the *low* tail is treated as a risk (a region that is
 * unusually successful is not a concern), so positive-direction outliers above
 * the median are dropped.
 *
 * `series` and `names` must be index-aligned and in a stable order.
 */
export async function detectRegionAnomalies(
  names: string[],
  series: number[],
): Promise<RegionAnomaly[]> {
  if (series.length < 4) return [];

  const proxy = getAnalysisProxy();
  const kernels = proxy ?? (await inlineKernels());

  let result = await kernels.gesdAnomalies(series, { alpha: 0.05 });
  let method: RegionAnomaly["method"] = "gesd";
  if (result.indices.length === 0) {
    result = await kernels.detectAnomalies(series, { method: "mad", threshold: 3.5 });
    method = "mad";
  }

  // Only the under-performing tail is a risk. Compare against the median.
  const sorted = [...series].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;

  const anomalies: RegionAnomaly[] = [];
  result.indices.forEach((index, i) => {
    const successRate = series[index] ?? 0;
    if (successRate >= median) return; // ignore high-side outliers
    anomalies.push({
      region: names[index] ?? "Inconnu",
      successRate,
      score: result.scores[i] ?? 0,
      method,
    });
  });
  return anomalies.sort((a, b) => a.successRate - b.successRate);
}
