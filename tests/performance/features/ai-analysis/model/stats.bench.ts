import { bench, describe } from "vitest";
import {
  buildHistogram,
  detectIQRAnomalies,
  detectZScoreAnomalies,
  linearRegression,
  mean,
  pearsonCorrelation,
  stdDev,
} from "@/features/ai-analysis/model/stats";

/**
 * Performance benchmarks for the AI-analysis statistics hot path.
 *
 * `stats.ts` wraps `simple-statistics` and runs over whole numeric columns
 * during dataset profiling / anomaly detection. These functions scale with the
 * row count, so we exercise them at 10k and 100k rows to surface throughput
 * regressions (Tinybench via Vitest reports mean / p99 / ops-per-second).
 *
 * Determinism: inputs are built ONCE at module scope with a counter-based,
 * index-varying generator (no Math.random / Date.now — both unavailable here),
 * so the bench measures the function, not data synthesis.
 */

// ─── Deterministic synthetic input (built once) ───────────────────────────────

/**
 * Counter-based pseudo "noisy signal": a deterministic mix of a linear trend,
 * a couple of sinusoids (for spread), and a sparse spike pattern (so the
 * anomaly detectors actually find some outliers). Purely a function of `i`.
 */
function genValue(i: number): number {
  const trend = i * 0.013;
  const wave = Math.sin(i * 0.07) * 12 + Math.cos(i * 0.013) * 5;
  // Deterministic sparse spikes: every 997th element jumps hard.
  const spike = i % 997 === 0 ? 80 : 0;
  return 100 + trend + wave + spike;
}

/** A second, correlated-but-shifted channel for correlation / regression. */
function genValueY(i: number): number {
  const base = genValue(i) * 0.8;
  const offset = Math.sin(i * 0.021) * 7;
  return base + offset + 25;
}

const SIZE_10K = 10_000;
const SIZE_100K = 100_000;

const XS_10K = Array.from({ length: SIZE_10K }, (_, i) => i);
const XS_100K = Array.from({ length: SIZE_100K }, (_, i) => i);

const VALUES_10K = Array.from({ length: SIZE_10K }, (_, i) => genValue(i));
const VALUES_100K = Array.from({ length: SIZE_100K }, (_, i) => genValue(i));

const YS_10K = Array.from({ length: SIZE_10K }, (_, i) => genValueY(i));
const YS_100K = Array.from({ length: SIZE_100K }, (_, i) => genValueY(i));

const HIST_BINS = 50;

// ─── Central tendency / dispersion ────────────────────────────────────────────

describe("stats: mean", () => {
  bench("mean over 10k values", () => {
    mean(VALUES_10K);
  });
  bench("mean over 100k values", () => {
    mean(VALUES_100K);
  });
});

describe("stats: stdDev", () => {
  bench("stdDev over 10k values", () => {
    stdDev(VALUES_10K);
  });
  bench("stdDev over 100k values", () => {
    stdDev(VALUES_100K);
  });
});

// ─── Bivariate ────────────────────────────────────────────────────────────────

describe("stats: pearsonCorrelation", () => {
  bench("pearsonCorrelation over 10k pairs", () => {
    pearsonCorrelation(VALUES_10K, YS_10K);
  });
  bench("pearsonCorrelation over 100k pairs", () => {
    pearsonCorrelation(VALUES_100K, YS_100K);
  });
});

describe("stats: linearRegression", () => {
  bench("linearRegression over 10k pairs", () => {
    linearRegression(XS_10K, VALUES_10K);
  });
  bench("linearRegression over 100k pairs", () => {
    linearRegression(XS_100K, VALUES_100K);
  });
});

// ─── Anomaly detection ────────────────────────────────────────────────────────

describe("stats: detectZScoreAnomalies", () => {
  bench("detectZScoreAnomalies over 10k values", () => {
    detectZScoreAnomalies(VALUES_10K, 3);
  });
  bench("detectZScoreAnomalies over 100k values", () => {
    detectZScoreAnomalies(VALUES_100K, 3);
  });
});

describe("stats: detectIQRAnomalies", () => {
  bench("detectIQRAnomalies over 10k values", () => {
    detectIQRAnomalies(VALUES_10K);
  });
  bench("detectIQRAnomalies over 100k values", () => {
    detectIQRAnomalies(VALUES_100K);
  });
});

// ─── Histogram binning ────────────────────────────────────────────────────────

describe("stats: buildHistogram", () => {
  bench("buildHistogram 50 bins over 10k values", () => {
    buildHistogram(VALUES_10K, HIST_BINS);
  });
  bench("buildHistogram 50 bins over 100k values", () => {
    buildHistogram(VALUES_100K, HIST_BINS);
  });
});
