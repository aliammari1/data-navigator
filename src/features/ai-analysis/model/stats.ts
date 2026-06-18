// ─── Stats Utilities ──────────────────────────────────────────────────────────

import * as ss from "simple-statistics";
import type { Correlation } from "./types";
export function mean(values: number[]): number {
  if (!values.length) return 0;
  return ss.mean(values);
}

export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  return ss.sampleStandardDeviation(values);
}

export function pearsonCorrelation(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length || xs.length < 3) return 0;
  // A constant (zero-variance) series has no linear relationship and makes
  // sampleCorrelation divide by a zero standard deviation → NaN. Return 0.
  if (ss.variance(xs) === 0 || ss.variance(ys) === 0) return 0;
  const r = ss.sampleCorrelation(xs, ys);
  return Number.isFinite(r) ? r : 0;
}

export function linearRegression(
  xs: number[],
  ys: number[],
): { slope: number; intercept: number; r2: number } {
  if (xs.length < 2) return { slope: 0, intercept: 0, r2: 0 };
  // A degenerate x (zero variance) has no slope and makes ss.linearRegression
  // yield NaN. Fall back to a flat line through the mean of y.
  if (ss.variance(xs) === 0) {
    return { slope: 0, intercept: mean(ys), r2: 0 };
  }
  const pairs: [number, number][] = xs.map((x, i) => [x, ys[i]]);
  const reg = ss.linearRegression(pairs);
  const line = ss.linearRegressionLine(reg);
  // rSquared is 0/0 = NaN when y is constant; clamp and coerce NaN → 0.
  const rawR2 = ss.rSquared(pairs, line);
  const r2 = Number.isFinite(rawR2) ? Math.max(0, Math.min(1, rawR2)) : 0;
  const slope = Number.isFinite(reg.m) ? reg.m : 0;
  const intercept = Number.isFinite(reg.b) ? reg.b : mean(ys);
  return { slope, intercept, r2 };
}

export function detectZScoreAnomalies(
  values: number[],
  threshold = 3.0,
): { idx: number; score: number }[] {
  const m = ss.mean(values);
  const s = ss.sampleStandardDeviation(values);
  if (s === 0) return [];
  return values
    .map((v, i) => ({ idx: i, score: Math.abs(ss.zScore(v, m, s)) }))
    .filter((x) => x.score > threshold);
}

export function detectIQRAnomalies(
  values: number[],
): { idx: number; score: number }[] {
  const q1 = ss.quantile(values, 0.25);
  const q3 = ss.quantile(values, 0.75);
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  return values
    .map((v, i) => ({
      idx: i,
      score:
        v < lo ? (lo - v) / (iqr || 1) : v > hi ? (v - hi) / (iqr || 1) : 0,
    }))
    .filter((x) => x.score > 0);
}

export function correlationStrength(r: number): Correlation["strength"] {
  const abs = Math.abs(r);
  if (abs >= 0.8) return "very_strong";
  if (abs >= 0.6) return "strong";
  if (abs >= 0.4) return "moderate";
  if (abs >= 0.2) return "weak";
  return "none";
}
export function buildHistogram(values: number[], bins: number): number[] {
  if (!values.length) return Array(bins).fill(0) as number[];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return Array(bins).fill(0) as number[];
  const counts = Array(bins).fill(0) as number[];
  const range = max - min;
  for (const v of values) {
    const idx = Math.min(Math.floor(((v - min) / range) * bins), bins - 1);
    counts[idx]++;
  }
  return counts;
}
