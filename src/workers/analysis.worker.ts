/// <reference lib="webworker" />

/**
 * analysis.worker — the shared statistics / clustering / attribution kernel.
 *
 * Runs OFF the renderer main thread via Comlink. Every kernel is deterministic
 * (seeded PRNG, default seed 42) and pure-JS (no wasm, no network) so it is
 * fully offline-safe on the medium-end / no-WebGPU target.
 *
 * Comlink proxy name (renderer): `analysis` (see analysis-client.ts).
 *
 * Methods:
 *  - kMeans(data, opts)                seeded typed-array k-means (+ withinss)
 *  - dbscan(data, eps, minPts)         density-clustering DBSCAN (+ labels/noise)
 *  - attribution(X, y)                 SVD-pseudo-inverse standardized regression
 *  - correlationMatrix(data, columns)  Pearson r matrix
 *  - welchTTest(a, b)                  real Welch two-sample t (p-value + df + CI)
 *  - anova1(values, factor)            one-way ANOVA (F + p-value)
 *  - detectAnomalies(values, opts)     IQR / z-score / MAD outliers
 *  - gesdAnomalies(values, opts)       Generalized ESD (S-H-ESD style) anomalies
 *  - ewma(values, alpha)               exponentially weighted moving average
 *  - stlDecompose(values, period)      simple seasonal-trend-residual split
 *  - pelt(values, opts)                PELT change-point detection (L2 cost)
 *  - holtWinters(values, opts)         additive Holt-Winters forecast
 */

import * as Comlink from "comlink";
import { DBSCAN } from "density-clustering";
import { Matrix, SVD } from "ml-matrix";
import { DEFAULT_SEED, mulberry32 } from "@/platform/viz/seeded-rng";
import {
  mean,
  medianAbsoluteDeviation,
  median,
  sampleVariance,
  studentTPValue,
  studentTQuantile,
} from "@/platform/viz/stats-core";

const EPSILON = 1e-12;

// ─── K-Means (seeded, typed arrays, returns withinss) ───────────────────────

export interface KMeansOptions {
  k: number;
  maxIterations?: number;
  seed?: number;
}

export interface KMeansResult {
  labels: number[];
  centroids: number[][];
  withinss: number[];
  totalWithinss: number;
  iterations: number;
}

export async function kMeans(data: number[][], options: KMeansOptions): Promise<KMeansResult> {
  const n = data.length;
  const d = data[0]?.length ?? 0;
  const k = Math.max(1, Math.min(options.k, n));
  const maxIterations = options.maxIterations ?? 50;
  const seed = options.seed ?? DEFAULT_SEED;

  if (n === 0 || d === 0) {
    return { labels: [], centroids: [], withinss: [], totalWithinss: 0, iterations: 0 };
  }

  const X = new Float64Array(n * d);
  for (let i = 0; i < n; i++) {
    const row = data[i]!;
    for (let j = 0; j < d; j++) X[i * d + j] = row[j] ?? 0;
  }

  const rand = mulberry32(seed);
  const centroids = new Float64Array(k * d);
  const labels = new Int32Array(n);
  const dist = new Float64Array(n);

  const sqDist = (rowOff: number, centOff: number): number => {
    let s = 0;
    for (let j = 0; j < d; j++) {
      const diff = X[rowOff + j]! - centroids[centOff + j]!;
      s += diff * diff;
    }
    return s;
  };

  // k-means++ init (seeded).
  const first = Math.floor(rand() * n);
  for (let j = 0; j < d; j++) centroids[j] = X[first * d + j]!;
  for (let c = 1; c < k; c++) {
    let total = 0;
    for (let i = 0; i < n; i++) {
      let best = Infinity;
      for (let cc = 0; cc < c; cc++) {
        const dd = sqDist(i * d, cc * d);
        if (dd < best) best = dd;
      }
      dist[i] = best;
      total += best;
    }
    let target = rand() * total;
    let chosen = n - 1;
    for (let i = 0; i < n; i++) {
      target -= dist[i]!;
      if (target <= 0) {
        chosen = i;
        break;
      }
    }
    for (let j = 0; j < d; j++) centroids[c * d + j] = X[chosen * d + j]!;
  }

  // Lloyd's iterations.
  const sums = new Float64Array(k * d);
  const counts = new Int32Array(k);
  let iterations = 0;
  for (let iter = 0; iter < maxIterations; iter++) {
    iterations = iter + 1;
    let changed = 0;
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const dd = sqDist(i * d, c * d);
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
    if (changed === 0 && iter > 0) break;
    sums.fill(0);
    counts.fill(0);
    for (let i = 0; i < n; i++) {
      const c = labels[i]!;
      counts[c]++;
      for (let j = 0; j < d; j++) sums[c * d + j] += X[i * d + j]!;
    }
    for (let c = 0; c < k; c++) {
      const cnt = counts[c]!;
      if (cnt === 0) continue;
      for (let j = 0; j < d; j++) centroids[c * d + j] = sums[c * d + j]! / cnt;
    }
  }

  const withinss = new Array<number>(k).fill(0);
  for (let i = 0; i < n; i++) withinss[labels[i]!]! += sqDist(i * d, labels[i]! * d);
  const totalWithinss = withinss.reduce((s, v) => s + v, 0);

  const centroidsOut: number[][] = [];
  for (let c = 0; c < k; c++) {
    const row: number[] = [];
    for (let j = 0; j < d; j++) row.push(centroids[c * d + j]!);
    centroidsOut.push(row);
  }

  return {
    labels: Array.from(labels),
    centroids: centroidsOut,
    withinss,
    totalWithinss,
    iterations,
  };
}

// ─── DBSCAN (density-clustering) → label vector + noise indices ──────────────

export interface DbscanResult {
  /** Per-row cluster label; -1 = noise. */
  labels: number[];
  /** Cluster row-index groups (as density-clustering returns them). */
  clusters: number[][];
  /** Row indices flagged as noise/outliers. */
  noise: number[];
}

/**
 * DBSCAN over standardized features. `eps` is in raw feature units → the caller
 * should z-score columns first so `eps` is meaningful across dimensions.
 */
export async function dbscan(data: number[][], eps = 0.5, minPts = 5): Promise<DbscanResult> {
  if (data.length === 0) return { labels: [], clusters: [], noise: [] };
  const engine = new DBSCAN();
  const clusters: number[][] = engine.run(data, eps, minPts);
  const noise: number[] = engine.noise ?? [];
  const labels = new Array<number>(data.length).fill(-1);
  clusters.forEach((idxs, c) => {
    for (const i of idxs) labels[i] = c;
  });
  return { labels, clusters, noise };
}

// ─── Attribution (standardized regression via SVD pseudo-inverse) ───────────

export interface AttributionResult {
  shares: number[];
  coefficients: number[];
  rSquared: number;
}

function standardizeColumns(X: number[][]): number[][] {
  const n = X.length;
  const d = X[0]?.length ?? 0;
  const means = new Array<number>(d).fill(0);
  const stds = new Array<number>(d).fill(0);
  for (let j = 0; j < d; j++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += X[i]![j]!;
    means[j] = sum / n;
  }
  for (let j = 0; j < d; j++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += (X[i]![j]! - means[j]!) ** 2;
    stds[j] = Math.sqrt(s / Math.max(1, n - 1)) || 1;
  }
  return X.map((row) => row.map((v, j) => (v - means[j]!) / stds[j]!));
}

function standardize1d(y: number[]): number[] {
  const n = y.length;
  const m = mean(y);
  const std = Math.sqrt(sampleVariance(y)) || 1;
  void n;
  return y.map((v) => (v - m) / std);
}

export async function attribution(X: number[][], y: number[]): Promise<AttributionResult> {
  const n = X.length;
  const d = X[0]?.length ?? 0;
  if (n < 2 || d < 1 || y.length !== n) {
    return { shares: new Array(d).fill(0), coefficients: new Array(d).fill(0), rSquared: 0 };
  }

  const z = standardizeColumns(X);
  const yz = standardize1d(y);

  const Xm = new Matrix(z);
  const svd = new SVD(Xm, { autoTranspose: true });
  const u = svd.leftSingularVectors;
  const v = svd.rightSingularVectors;
  const s = svd.diagonal;
  const tol = (s.length ? Math.max(...s) : 0) * Math.max(n, d) * Number.EPSILON;
  const uty = u.transpose().mmul(Matrix.columnVector(yz)).to1DArray();
  const scaled = uty.map((val, i) => (s[i]! > tol ? val / s[i]! : 0));
  const coefficients = v.mmul(Matrix.columnVector(scaled)).to1DArray();

  const absCoefs = coefficients.map((c) => Math.abs(c));
  const totalAbs = absCoefs.reduce((acc, c) => acc + c, 0) || 1;
  const shares = absCoefs.map((c) => (100 * c) / totalAbs);

  const yMean = mean(yz);
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    let pred = 0;
    for (let j = 0; j < d; j++) pred += coefficients[j]! * z[i]![j]!;
    ssRes += (yz[i]! - pred) ** 2;
    ssTot += (yz[i]! - yMean) ** 2;
  }
  const rSquared = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;
  return { shares, coefficients, rSquared };
}

// ─── Correlation matrix (Pearson r) ─────────────────────────────────────────

export async function correlationMatrix(
  data: number[][],
  columns: string[] = [],
): Promise<{ matrix: number[][]; columns: string[] }> {
  const nRows = data.length;
  const nCols = data[0]?.length ?? 0;
  const outCols = Array.from({ length: nCols }, (_, i) => columns[i] ?? `col_${i + 1}`);
  if (nRows < 2 || nCols === 0) {
    return {
      matrix: Array.from({ length: nCols }, (_, i) =>
        Array.from({ length: nCols }, (_, j) => (i === j ? 1 : 0)),
      ),
      columns: outCols,
    };
  }
  const means = Array.from({ length: nCols }, (_, j) => {
    let s = 0;
    for (let i = 0; i < nRows; i++) s += data[i]![j]!;
    return s / nRows;
  });
  const stds = Array.from({ length: nCols }, (_, j) => {
    let s = 0;
    for (let i = 0; i < nRows; i++) s += (data[i]![j]! - means[j]!) ** 2;
    return Math.sqrt(s / (nRows - 1));
  });
  const matrix = Array.from({ length: nCols }, (_, i) =>
    Array.from({ length: nCols }, (_, j) => {
      if (i === j) return 1;
      const denom = stds[i]! * stds[j]!;
      if (denom < EPSILON) return 0;
      let cov = 0;
      for (let r = 0; r < nRows; r++)
        cov += (data[r]![i]! - means[i]!) * (data[r]![j]! - means[j]!);
      cov /= nRows - 1;
      return Math.round((cov / denom) * 1000) / 1000;
    }),
  );
  return { matrix, columns: outCols };
}

// ─── Welch two-sample t-test (real p-value) ─────────────────────────────────

export interface TTestResult {
  statistic: number;
  df: number;
  pValue: number;
  meanA: number;
  meanB: number;
  ci: [number, number];
  significant: boolean;
}

export async function welchTTest(a: number[], b: number[], alpha = 0.05): Promise<TTestResult> {
  const na = a.length;
  const nb = b.length;
  if (na < 2 || nb < 2) {
    return {
      statistic: 0,
      df: 0,
      pValue: 1,
      meanA: mean(a),
      meanB: mean(b),
      ci: [0, 0],
      significant: false,
    };
  }
  const ma = mean(a);
  const mb = mean(b);
  const va = sampleVariance(a);
  const vb = sampleVariance(b);
  const seA = va / na;
  const seB = vb / nb;
  const se = Math.sqrt(seA + seB) || EPSILON;
  const t = (ma - mb) / se;
  const df = (seA + seB) ** 2 / ((seA * seA) / (na - 1) + (seB * seB) / (nb - 1) || EPSILON);
  const pValue = studentTPValue(t, df);
  const tcrit = studentTQuantile(1 - alpha / 2, df);
  const margin = tcrit * se;
  return {
    statistic: t,
    df,
    pValue,
    meanA: ma,
    meanB: mb,
    ci: [ma - mb - margin, ma - mb + margin],
    significant: pValue < alpha,
  };
}

// ─── One-way ANOVA (flat values + parallel factor labels) ───────────────────

export interface Anova1Result {
  statistic: number;
  pValue: number;
  dfBetween: number;
  dfWithin: number;
  significant: boolean;
}

export async function anova1(
  values: number[],
  factor: (string | number)[],
  alpha = 0.05,
): Promise<Anova1Result> {
  const groups = new Map<string, number[]>();
  for (let i = 0; i < values.length; i++) {
    const key = String(factor[i]);
    const g = groups.get(key) ?? [];
    g.push(values[i]!);
    groups.set(key, g);
  }
  const groupArrays = [...groups.values()].filter((g) => g.length > 0);
  const k = groupArrays.length;
  const n = values.length;
  if (k < 2 || n <= k) {
    return {
      statistic: 0,
      pValue: 1,
      dfBetween: Math.max(0, k - 1),
      dfWithin: Math.max(0, n - k),
      significant: false,
    };
  }
  const grand = mean(values);
  let ssBetween = 0;
  let ssWithin = 0;
  for (const g of groupArrays) {
    const gm = mean(g);
    ssBetween += g.length * (gm - grand) ** 2;
    for (const v of g) ssWithin += (v - gm) ** 2;
  }
  const dfBetween = k - 1;
  const dfWithin = n - k;
  const msBetween = ssBetween / dfBetween;
  const msWithin = ssWithin / dfWithin || EPSILON;
  const f = msBetween / msWithin;
  // F p-value via the incomplete-beta relation: P(F>f) = I_{d2/(d2+d1 f)}(d2/2, d1/2)
  const pValue = fDistributionPValue(f, dfBetween, dfWithin);
  return { statistic: f, pValue, dfBetween, dfWithin, significant: pValue < alpha };
}

function fDistributionPValue(f: number, d1: number, d2: number): number {
  if (!Number.isFinite(f) || f <= 0) return 1;
  // Reuse the regularized incomplete beta from stats-core via the t-relation is
  // not direct; compute through the beta tail here.
  const x = d2 / (d2 + d1 * f);
  // I_x(d2/2, d1/2) — import lazily to avoid a hard dependency loop.
  return incompleteBetaTail(x, d2 / 2, d1 / 2);
}

// Local copy of the regularized incomplete beta (kept inline to avoid coupling
// the F-test to the t-test internals). Delegates to stats-core's via dynamic.
import { incompleteBeta } from "@/platform/viz/stats-core";
function incompleteBetaTail(x: number, a: number, b: number): number {
  return Math.min(1, Math.max(0, incompleteBeta(x, a, b)));
}

// ─── Anomaly detection ──────────────────────────────────────────────────────

export interface AnomalyResult {
  indices: number[];
  scores: number[];
}

export async function detectAnomalies(
  values: number[],
  options: { method?: "iqr" | "zscore" | "mad"; threshold?: number } = {},
): Promise<AnomalyResult> {
  const method = options.method ?? "iqr";
  const threshold = options.threshold ?? (method === "iqr" ? 1.5 : 3);
  const n = values.length;
  if (n < 4) return { indices: [], scores: [] };

  const indices: number[] = [];
  const scores: number[] = [];

  if (method === "iqr") {
    const sorted = [...values].sort((a, b) => a - b);
    const q1 = sorted[Math.floor((n - 1) * 0.25)]!;
    const q3 = sorted[Math.floor((n - 1) * 0.75)]!;
    const iqr = q3 - q1;
    if (Math.abs(iqr) < EPSILON) return { indices: [], scores: [] };
    const lower = q1 - threshold * iqr;
    const upper = q3 + threshold * iqr;
    for (let i = 0; i < n; i++) {
      const v = values[i]!;
      if (v < lower || v > upper) {
        indices.push(i);
        scores.push(Math.round((Math.max(lower - v, v - upper) / iqr) * 1000) / 1000);
      }
    }
  } else if (method === "mad") {
    const med = median(values);
    const mad = medianAbsoluteDeviation(values);
    if (mad < EPSILON) return { indices: [], scores: [] };
    for (let i = 0; i < n; i++) {
      const score = Math.abs(values[i]! - med) / mad;
      if (score > threshold) {
        indices.push(i);
        scores.push(Math.round(score * 1000) / 1000);
      }
    }
  } else {
    const m = mean(values);
    const std = Math.sqrt(sampleVariance(values));
    if (std < EPSILON) return { indices: [], scores: [] };
    for (let i = 0; i < n; i++) {
      const score = Math.abs((values[i]! - m) / std);
      if (score > threshold) {
        indices.push(i);
        scores.push(Math.round(score * 1000) / 1000);
      }
    }
  }
  return { indices, scores };
}

/**
 * Generalized ESD (Rosner) — the S-H-ESD style anomaly test. Iteratively removes
 * the most extreme residual and compares to the Student-t critical value λ_i.
 */
export async function gesdAnomalies(
  values: number[],
  options: { maxAnomalies?: number; alpha?: number } = {},
): Promise<AnomalyResult> {
  const n = values.length;
  const alpha = options.alpha ?? 0.05;
  const maxAnomalies = Math.min(options.maxAnomalies ?? (Math.floor(n * 0.1) || 1), n - 2);
  if (n < 4 || maxAnomalies < 1) return { indices: [], scores: [] };

  const remaining = values.map((v, i) => ({ v, i }));
  const candidates: { idx: number; score: number; lambda: number }[] = [];

  for (let iter = 0; iter < maxAnomalies; iter++) {
    const vals = remaining.map((r) => r.v);
    const m = mean(vals);
    const std = Math.sqrt(sampleVariance(vals));
    if (std < EPSILON) break;
    let maxScore = -Infinity;
    let maxPos = -1;
    for (let j = 0; j < remaining.length; j++) {
      const score = Math.abs(remaining[j]!.v - m) / std;
      if (score > maxScore) {
        maxScore = score;
        maxPos = j;
      }
    }
    if (maxPos < 0) break;
    const nn = remaining.length;
    const p = 1 - alpha / (2 * nn);
    const t = studentTQuantile(p, nn - 2);
    const lambda = ((nn - 1) * t) / Math.sqrt((nn - 2 + t * t) * nn);
    candidates.push({ idx: remaining[maxPos]!.i, score: maxScore, lambda });
    remaining.splice(maxPos, 1);
  }

  // The number of anomalies is the largest iteration where score > lambda.
  let lastSignificant = -1;
  for (let i = 0; i < candidates.length; i++) {
    if (candidates[i]!.score > candidates[i]!.lambda) lastSignificant = i;
  }
  const chosen = candidates.slice(0, lastSignificant + 1);
  return {
    indices: chosen.map((c) => c.idx),
    scores: chosen.map((c) => Math.round(c.score * 1000) / 1000),
  };
}

// ─── EWMA ───────────────────────────────────────────────────────────────────

export async function ewma(values: number[], alpha = 0.3): Promise<number[]> {
  if (values.length === 0) return [];
  const a = Math.min(1, Math.max(EPSILON, alpha));
  const out = new Array<number>(values.length);
  out[0] = values[0]!;
  for (let i = 1; i < values.length; i++) out[i] = a * values[i]! + (1 - a) * out[i - 1]!;
  return out;
}

// ─── STL-lite decomposition (trend = moving avg, seasonal = period means) ────

export interface StlResult {
  trend: number[];
  seasonal: number[];
  residual: number[];
}

export async function stlDecompose(values: number[], period: number): Promise<StlResult> {
  const n = values.length;
  if (n === 0 || period < 2) {
    return { trend: [...values], seasonal: new Array(n).fill(0), residual: new Array(n).fill(0) };
  }
  // Centered moving-average trend over one period.
  const trend = new Array<number>(n).fill(0);
  const half = Math.floor(period / 2);
  for (let i = 0; i < n; i++) {
    let s = 0;
    let c = 0;
    for (let j = i - half; j <= i + half; j++) {
      if (j >= 0 && j < n) {
        s += values[j]!;
        c++;
      }
    }
    trend[i] = c ? s / c : values[i]!;
  }
  // Detrended → seasonal index per phase → residual.
  const detrended = values.map((v, i) => v - trend[i]!);
  const seasonalMeans = new Array<number>(period).fill(0);
  const seasonalCounts = new Array<number>(period).fill(0);
  for (let i = 0; i < n; i++) {
    const phase = i % period;
    seasonalMeans[phase]! += detrended[i]!;
    seasonalCounts[phase]!++;
  }
  for (let p = 0; p < period; p++) {
    seasonalMeans[p] = seasonalCounts[p] ? seasonalMeans[p]! / seasonalCounts[p]! : 0;
  }
  const seasonal = values.map((_, i) => seasonalMeans[i % period]!);
  const residual = values.map((v, i) => v - trend[i]! - seasonal[i]!);
  return { trend, seasonal, residual };
}

// ─── PELT change-point detection (L2 cost, exact) ───────────────────────────

export async function pelt(
  values: number[],
  options: { penalty?: number; minSize?: number } = {},
): Promise<number[]> {
  const n = values.length;
  if (n < 4) return [];
  const minSize = Math.max(1, options.minSize ?? 2);
  // Default penalty ~ BIC: variance * log(n).
  const penalty = options.penalty ?? (sampleVariance(values) || 1) * Math.log(n);

  // Prefix sums for O(1) segment L2 cost.
  const prefix = new Float64Array(n + 1);
  const prefixSq = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    prefix[i + 1] = prefix[i]! + values[i]!;
    prefixSq[i + 1] = prefixSq[i]! + values[i]! * values[i]!;
  }
  const segCost = (s: number, e: number): number => {
    const len = e - s;
    if (len <= 0) return 0;
    const sum = prefix[e]! - prefix[s]!;
    const sumSq = prefixSq[e]! - prefixSq[s]!;
    return sumSq - (sum * sum) / len; // SSE
  };

  const F = new Float64Array(n + 1).fill(Infinity);
  F[0] = -penalty;
  const cp = new Int32Array(n + 1).fill(0);
  let candidates: number[] = [0];

  for (let t = minSize; t <= n; t++) {
    let bestCost = Infinity;
    let bestS = 0;
    const nextCandidates: number[] = [];
    for (const s of candidates) {
      if (t - s < minSize) {
        nextCandidates.push(s);
        continue;
      }
      const cost = F[s]! + segCost(s, t) + penalty;
      if (cost < bestCost) {
        bestCost = cost;
        bestS = s;
      }
      nextCandidates.push(s);
    }
    F[t] = bestCost;
    cp[t] = bestS;
    // Pruning: keep candidates whose F[s] + segCost(s,t) <= F[t].
    candidates = nextCandidates.filter((s) => F[s]! + segCost(s, t) <= F[t]! + EPSILON);
    candidates.push(t);
  }

  // Backtrack change points.
  const points: number[] = [];
  let t = n;
  while (t > 0) {
    const s = cp[t]!;
    if (s > 0) points.push(s);
    t = s;
  }
  return points.sort((a, b) => a - b);
}

// ─── Additive Holt-Winters forecast ─────────────────────────────────────────

export interface HoltWintersResult {
  fitted: number[];
  forecast: number[];
}

export async function holtWinters(
  values: number[],
  options: {
    period?: number;
    horizon?: number;
    alpha?: number;
    beta?: number;
    gamma?: number;
  } = {},
): Promise<HoltWintersResult> {
  const n = values.length;
  const horizon = options.horizon ?? 5;
  if (n === 0) return { fitted: [], forecast: [] };

  const period = options.period ?? 1;
  const alpha = options.alpha ?? 0.3;
  const beta = options.beta ?? 0.1;
  const gamma = options.gamma ?? 0.1;

  // No seasonality → double exponential smoothing (Holt linear).
  if (period < 2 || n < 2 * period) {
    let level = values[0]!;
    let trend = n > 1 ? values[1]! - values[0]! : 0;
    const fitted = new Array<number>(n);
    fitted[0] = level;
    for (let i = 1; i < n; i++) {
      const prevLevel = level;
      level = alpha * values[i]! + (1 - alpha) * (level + trend);
      trend = beta * (level - prevLevel) + (1 - beta) * trend;
      fitted[i] = level + trend;
    }
    const forecast = Array.from({ length: horizon }, (_, h) => level + (h + 1) * trend);
    return { fitted, forecast };
  }

  // Additive seasonal Holt-Winters.
  const seasonal = new Array<number>(period).fill(0);
  let level = 0;
  for (let i = 0; i < period; i++) level += values[i]!;
  level /= period;
  let trend = 0;
  for (let i = 0; i < period; i++) trend += (values[period + i]! - values[i]!) / period;
  trend /= period;
  for (let i = 0; i < period; i++) seasonal[i] = values[i]! - level;

  const fitted = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    const s = seasonal[i % period]!;
    if (i < period) {
      fitted[i] = level + trend + s;
      continue;
    }
    const prevLevel = level;
    level = alpha * (values[i]! - s) + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
    seasonal[i % period] = gamma * (values[i]! - level) + (1 - gamma) * s;
    fitted[i] = level + trend + seasonal[i % period]!;
  }
  const forecast = Array.from(
    { length: horizon },
    (_, h) => level + (h + 1) * trend + seasonal[(n + h) % period]!,
  );
  return { fitted, forecast };
}

// ─── Comlink exposure ───────────────────────────────────────────────────────

const api = {
  kMeans,
  dbscan,
  attribution,
  correlationMatrix,
  welchTTest,
  anova1,
  detectAnomalies,
  gesdAnomalies,
  ewma,
  stlDecompose,
  pelt,
  holtWinters,
};

export type AnalysisWorkerApi = typeof api;

Comlink.expose(api);
