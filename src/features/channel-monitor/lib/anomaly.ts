"use client";

/**
 * Baseline / anomaly detection driven by the seeded platform analysis worker.
 *
 * The previous monitor had NO baseline detection — only static thresholds. The
 * tech radar calls anomaly detection (EWMA / MAD / GESD) an in-house gap that
 * should run offline in a worker. Rather than hand-roll the math, we call the
 * platform's seeded `getAnalysisProxy()` kernels (`gesdAnomalies`, `ewma`,
 * `detectAnomalies`) — all deterministic (seed 42), all off the main thread.
 */

import { getAnalysisProxy } from "@/platform/viz";

/**
 * Lazy inline-kernel fallback. We import the worker module only when no worker
 * is available, so the main route chunk never eagerly runs `Comlink.expose`.
 * Identical math to the worker path — only the off-main-thread offload is lost.
 */
async function inlineKernels() {
  const mod = await import("@/workers/analysis.worker");
  return {
    detectAnomalies: mod.detectAnomalies,
    ewma: mod.ewma,
    gesdAnomalies: mod.gesdAnomalies,
  };
}

export interface ChannelAnomaly {
  channel: string;
  displayName: string;
  /** Index of the anomalous sample within the supplied series. */
  index: number;
  value: number;
  score: number;
  /** EWMA baseline at the anomalous point (expected value). */
  baseline: number;
  method: "gesd" | "mad";
}

/**
 * Detect anomalies in a per-channel numeric series (e.g. recent success-rate
 * samples). Uses GESD (Generalized ESD / S-H-ESD style) for robust multi-outlier
 * detection, with the EWMA series as the expected baseline. Falls back to the
 * inline kernels when the worker is unavailable (identical math, no offload).
 */
export async function detectChannelAnomalies(
  channel: string,
  displayName: string,
  series: number[],
): Promise<ChannelAnomaly[]> {
  if (series.length < 4) return [];

  const proxy = getAnalysisProxy();
  const kernels = proxy ?? (await inlineKernels());

  const gesd = await kernels.gesdAnomalies(series, { alpha: 0.05 });
  const baseline = await kernels.ewma(series, 0.3);

  let result = gesd;
  let method: ChannelAnomaly["method"] = "gesd";
  // Fall back to robust MAD z-score when GESD finds nothing (short/quiet series).
  if (result.indices.length === 0) {
    result = await kernels.detectAnomalies(series, { method: "mad", threshold: 3.5 });
    method = "mad";
  }

  return result.indices.map((index, i) => ({
    channel,
    displayName,
    index,
    value: series[index] ?? 0,
    score: result.scores[i] ?? 0,
    baseline: baseline[index] ?? series[index] ?? 0,
    method,
  }));
}
