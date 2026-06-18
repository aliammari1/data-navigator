"use client";

// ─── Seeded analysis kernels (platform worker, inline fallback) ───────────────
//
// The analysis pipeline needs three seeded statistical kernels: k-means, the
// Generalized ESD anomaly test, and Holt-Winters forecasting. The repo ships
// these (seeded, default 42) in the shared platform analysis worker, reached via
// `getAnalysisProxy()`. We forward to that worker so the heavy math runs there.
//
// When no module-worker support exists (`getAnalysisProxy()` returns null, e.g.
// SSR / an exotic runtime), we provide tiny inline fallbacks so the pipeline
// stays functional. These are intentionally minimal — the platform worker is the
// real, validated path on every browser/Electron target.

import { getAnalysisProxy, mulberry32 } from "@/platform/viz";
import type { AnalysisKernels } from "../model/pipeline";

const SEED = 42;

// ─── Inline fallbacks (only used when the platform worker is unavailable) ─────

function inlineKMeans(
  data: number[][],
  options: { k: number; seed?: number },
): { labels: number[]; centroids: number[][]; totalWithinss: number } {
  const n = data.length;
  const d = data[0]?.length ?? 0;
  const k = Math.max(1, Math.min(options.k, n));
  if (n === 0 || d === 0) return { labels: [], centroids: [], totalWithinss: 0 };

  const rand = mulberry32(options.seed ?? SEED);
  const centroids: number[][] = [];
  for (let c = 0; c < k; c++) centroids.push([...data[Math.floor(rand() * n)]]);

  const labels = new Array<number>(n).fill(0);
  const sqDist = (a: number[], b: number[]) => {
    let s = 0;
    for (let j = 0; j < d; j++) s += (a[j] - b[j]) ** 2;
    return s;
  };

  for (let iter = 0; iter < 50; iter++) {
    let changed = 0;
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const dd = sqDist(data[i], centroids[c]);
        if (dd < bestD) {
          bestD = dd;
          best = c;
        }
      }
      if (labels[i] !== best) {
        labels[i] = best;
        changed++;
      }
    }
    const sums = Array.from({ length: k }, () => new Array<number>(d).fill(0));
    const counts = new Array<number>(k).fill(0);
    for (let i = 0; i < n; i++) {
      counts[labels[i]]++;
      for (let j = 0; j < d; j++) sums[labels[i]][j] += data[i][j];
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] === 0) continue;
      for (let j = 0; j < d; j++) centroids[c][j] = sums[c][j] / counts[c];
    }
    if (changed === 0 && iter > 0) break;
  }

  let totalWithinss = 0;
  for (let i = 0; i < n; i++) totalWithinss += sqDist(data[i], centroids[labels[i]]);
  return { labels, centroids, totalWithinss };
}

function inlineGesd(
  values: number[],
  options: { maxAnomalies?: number; alpha?: number },
): { indices: number[]; scores: number[] } {
  // A z-score fallback (no Student-t criticals); only used off the worker path.
  const n = values.length;
  if (n < 4) return { indices: [], scores: [] };
  const m = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1);
  const std = Math.sqrt(variance);
  if (std === 0) return { indices: [], scores: [] };
  const max = options.maxAnomalies ?? Math.max(1, Math.floor(n * 0.05));
  const scored = values
    .map((v, i) => ({ i, z: Math.abs((v - m) / std) }))
    .filter((s) => s.z > 3)
    .sort((a, b) => b.z - a.z)
    .slice(0, max);
  return { indices: scored.map((s) => s.i), scores: scored.map((s) => Math.round(s.z * 1000) / 1000) };
}

function inlineHoltWinters(
  values: number[],
  options: { period?: number; horizon?: number },
): { fitted: number[]; forecast: number[] } {
  const n = values.length;
  const horizon = options.horizon ?? 6;
  if (n === 0) return { fitted: [], forecast: [] };
  // Holt linear (double exponential smoothing) inline fallback.
  const alpha = 0.3;
  const beta = 0.1;
  let level = values[0];
  let trend = n > 1 ? values[1] - values[0] : 0;
  const fitted = new Array<number>(n);
  fitted[0] = level;
  for (let i = 1; i < n; i++) {
    const prev = level;
    level = alpha * values[i] + (1 - alpha) * (level + trend);
    trend = beta * (level - prev) + (1 - beta) * trend;
    fitted[i] = level + trend;
  }
  const forecast = Array.from({ length: horizon }, (_, h) => level + (h + 1) * trend);
  return { fitted, forecast };
}

/**
 * Build the seeded analysis kernels. Prefers the shared platform analysis worker
 * (`getAnalysisProxy()`); falls back to inline implementations only when no
 * worker exists. The returned object is the contract the pipeline expects.
 */
export function createAnalysisKernels(): AnalysisKernels {
  const proxy = getAnalysisProxy();
  if (proxy) {
    return {
      async kMeans(data, options) {
        const r = await proxy.kMeans(data, { k: options.k, seed: options.seed ?? SEED });
        return { labels: r.labels, centroids: r.centroids, totalWithinss: r.totalWithinss };
      },
      async gesdAnomalies(values, options) {
        const r = await proxy.gesdAnomalies(values, options);
        return { indices: r.indices, scores: r.scores };
      },
      async holtWinters(values, options) {
        const r = await proxy.holtWinters(values, options);
        return { fitted: r.fitted, forecast: r.forecast };
      },
    };
  }
  return {
    async kMeans(data, options) {
      return inlineKMeans(data, options);
    },
    async gesdAnomalies(values, options) {
      return inlineGesd(values, options);
    },
    async holtWinters(values, options) {
      return inlineHoltWinters(values, options);
    },
  };
}
