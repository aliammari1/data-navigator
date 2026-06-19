import { bench, describe } from "vitest";
import {
  backtest,
  detectResidualAnomalies,
  forecastSeries,
  normalizeSeries,
  scoreForecast,
  seasonalIndices,
  type SeriesPoint,
} from "@/features/forecast-intelligence/core/forecast-engine";

/**
 * Performance benchmarks for the forecast engine hot path.
 *
 * `forecast-engine.ts` is pure and dependency-free. `forecastSeries` is the
 * end-to-end entry point (normalise → seasonal decomposition → Holt smoothing →
 * residuals → backtest → anomalies); the rest are the per-stage hot loops it
 * calls. All scale linearly with series length, so we exercise them over long
 * daily series (3k and 30k points ≈ years of daily KPI data).
 *
 * Determinism: the synthetic series is built ONCE at module scope with a
 * counter-based generator (no Math.random / Date.now), so the bench measures
 * the function rather than data synthesis. Dates are derived arithmetically
 * from a fixed epoch day index, never `new Date()`.
 */

// ─── Deterministic synthetic input (built once) ───────────────────────────────

const SEASON = 7; // weekly cycle on daily data
const EPOCH_DAY_MS = 86_400_000;
// Fixed epoch: 2020-01-01 expressed as a day count, so no Date.now() is used.
// 2020-01-01T00:00:00Z = 1_577_836_800_000 ms.
const EPOCH_START_MS = 1_577_836_800_000;

/** ISO date for day index `i`, derived purely arithmetically from the epoch. */
function isoForDay(i: number): string {
  return new Date(EPOCH_START_MS + i * EPOCH_DAY_MS).toISOString().slice(0, 10);
}

/**
 * Counter-based daily KPI value: linear trend + weekly seasonal swing + a
 * second slow wave for texture + deterministic sparse spikes (so the residual
 * anomaly path finds outliers). Purely a function of `i`.
 */
function genValue(i: number): number {
  const trend = i * 0.05;
  const weekly = Math.sin((i % SEASON) * ((2 * Math.PI) / SEASON)) * 18;
  const slow = Math.cos(i * 0.011) * 9;
  const spike = i % 503 === 0 ? 120 : 0;
  return 500 + trend + weekly + slow + spike;
}

/** Build a deterministic SeriesPoint[] of length `n`. */
function genSeries(n: number): SeriesPoint[] {
  return Array.from({ length: n }, (_, i) => ({
    date: isoForDay(i),
    value: genValue(i),
  }));
}

const LEN_SHORT = 3_000;
const LEN_LONG = 30_000;

const SERIES_3K = genSeries(LEN_SHORT);
const SERIES_30K = genSeries(LEN_LONG);

// Raw numeric values (several stage functions take number[] directly).
const VALUES_3K = SERIES_3K.map((p) => p.value);
const VALUES_30K = SERIES_30K.map((p) => p.value);

// Pre-built fitted array (≈ a 1-step-lagged copy) for the residual-anomaly bench
// so it measures only the anomaly scan, not a full forecast.
const FITTED_3K = VALUES_3K.map((_, i) => (i === 0 ? VALUES_3K[0]! : VALUES_3K[i - 1]!));
const FITTED_30K = VALUES_30K.map((_, i) => (i === 0 ? VALUES_30K[0]! : VALUES_30K[i - 1]!));

// Aligned actual/predicted (predicted = actual shifted) for scoreForecast.
const PRED_3K = VALUES_3K.map((v) => v * 1.02 + 1);
const PRED_30K = VALUES_30K.map((v) => v * 1.02 + 1);

// ─── End-to-end forecast ──────────────────────────────────────────────────────

describe("forecast-engine: forecastSeries (end-to-end)", () => {
  bench("forecastSeries over 3k-point series (season=7, h=7)", () => {
    forecastSeries(SERIES_3K, { seasonLength: SEASON, horizon: 7 });
  });
  bench("forecastSeries over 30k-point series (season=7, h=7)", () => {
    forecastSeries(SERIES_30K, { seasonLength: SEASON, horizon: 7 });
  });
});

// ─── Input normalisation ──────────────────────────────────────────────────────

describe("forecast-engine: normalizeSeries", () => {
  bench("normalizeSeries over 3k points", () => {
    normalizeSeries(SERIES_3K);
  });
  bench("normalizeSeries over 30k points", () => {
    normalizeSeries(SERIES_30K);
  });
});

// ─── Seasonal decomposition ───────────────────────────────────────────────────

describe("forecast-engine: seasonalIndices", () => {
  bench("seasonalIndices (m=7) over 3k values", () => {
    seasonalIndices(VALUES_3K, SEASON);
  });
  bench("seasonalIndices (m=7) over 30k values", () => {
    seasonalIndices(VALUES_30K, SEASON);
  });
});

// ─── Backtest / scoring ───────────────────────────────────────────────────────

describe("forecast-engine: backtest", () => {
  bench("backtest over 3k values", () => {
    backtest(VALUES_3K, { seasonLength: SEASON });
  });
  bench("backtest over 30k values", () => {
    backtest(VALUES_30K, { seasonLength: SEASON });
  });
});

describe("forecast-engine: scoreForecast", () => {
  bench("scoreForecast over 3k aligned pairs", () => {
    scoreForecast(VALUES_3K, PRED_3K);
  });
  bench("scoreForecast over 30k aligned pairs", () => {
    scoreForecast(VALUES_30K, PRED_30K);
  });
});

// ─── Residual anomaly detection ───────────────────────────────────────────────

describe("forecast-engine: detectResidualAnomalies", () => {
  bench("detectResidualAnomalies over 3k points", () => {
    detectResidualAnomalies(SERIES_3K, FITTED_3K, 3);
  });
  bench("detectResidualAnomalies over 30k points", () => {
    detectResidualAnomalies(SERIES_30K, FITTED_30K, 3);
  });
});
