/**
 * Deep-analytics ML worker (Comlink, off main thread).
 *
 * Owns the two compute kernels that previously ran on the React render thread
 * (or were faked):
 *
 * - `kMeans`     — seeded, typed-array k-means++ + Lloyd's algorithm. Fixed
 *                  buffers, no per-iteration closures/spreads, deterministic
 *                  for a given seed, returns withinss for elbow analysis.
 * - `attribution`— standardised multiple-linear-regression coefficients via
 *                  the SVD pseudo-inverse (ml-matrix). |β| → true attribution.
 *
 * Kept feature-local so the screen can wire a single worker without touching
 * shared worker infrastructure.
 */

import * as Comlink from "comlink";
import { Matrix, SVD } from "ml-matrix";

// ─── Seeded RNG (mulberry32) ────────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── K-Means ────────────────────────────────────────────────────────────────────

export interface KMeansOptions {
  k: number;
  maxIterations?: number;
  seed?: number;
}

export interface KMeansResult {
  /** Cluster index per input row. */
  labels: number[];
  /** k centroids, each a d-length vector. */
  centroids: number[][];
  /** Per-cluster within-cluster sum of squares. */
  withinss: number[];
  /** Total within-cluster sum of squares (elbow metric). */
  totalWithinss: number;
  /** Iterations until convergence. */
  iterations: number;
}

/**
 * Seeded, typed-array k-means. `data` is a row-major number[][] of finite
 * values; non-finite rows must be filtered by the caller.
 */
export async function kMeans(data: number[][], options: KMeansOptions): Promise<KMeansResult> {
  const n = data.length;
  const d = data[0]?.length ?? 0;
  const k = Math.max(1, Math.min(options.k, n));
  const maxIterations = options.maxIterations ?? 50;
  const seed = options.seed ?? 42;

  if (n === 0 || d === 0) {
    return {
      labels: [],
      centroids: [],
      withinss: [],
      totalWithinss: 0,
      iterations: 0,
    };
  }

  // Flatten to a single Float64Array for cache-friendly access.
  const X = new Float64Array(n * d);
  for (let i = 0; i < n; i++) {
    const row = data[i]!;
    for (let j = 0; j < d; j++) {
      X[i * d + j] = row[j] ?? 0;
    }
  }

  const rand = mulberry32(seed);
  const centroids = new Float64Array(k * d);
  const labels = new Int32Array(n);
  const dist = new Float64Array(n);

  const sqDistToCentroid = (rowOffset: number, centOffset: number): number => {
    let s = 0;
    for (let j = 0; j < d; j++) {
      const diff = X[rowOffset + j]! - centroids[centOffset + j]!;
      s += diff * diff;
    }
    return s;
  };

  // ── k-means++ initialisation (seeded) ──
  const first = Math.floor(rand() * n);
  for (let j = 0; j < d; j++) centroids[j] = X[first * d + j]!;

  for (let c = 1; c < k; c++) {
    let total = 0;
    for (let i = 0; i < n; i++) {
      let best = Infinity;
      for (let cc = 0; cc < c; cc++) {
        const dd = sqDistToCentroid(i * d, cc * d);
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

  // ── Lloyd's iterations ──
  const sums = new Float64Array(k * d);
  const counts = new Int32Array(k);
  let iterations = 0;

  for (let iter = 0; iter < maxIterations; iter++) {
    iterations = iter + 1;
    let changed = 0;

    // Assignment step.
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const dd = sqDistToCentroid(i * d, c * d);
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

    // Update step.
    sums.fill(0);
    counts.fill(0);
    for (let i = 0; i < n; i++) {
      const c = labels[i]!;
      counts[c]++;
      for (let j = 0; j < d; j++) sums[c * d + j] += X[i * d + j]!;
    }
    for (let c = 0; c < k; c++) {
      const cnt = counts[c]!;
      if (cnt === 0) continue; // keep prior centroid for empty clusters
      for (let j = 0; j < d; j++) centroids[c * d + j] = sums[c * d + j]! / cnt;
    }
  }

  // ── withinss ──
  const withinss = new Array<number>(k).fill(0);
  for (let i = 0; i < n; i++) {
    const c = labels[i]!;
    withinss[c]! += sqDistToCentroid(i * d, c * d);
  }
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

// ─── Attribution via standardised linear regression ─────────────────────────────

export interface AttributionResult {
  /** Standardised |coefficient| share per feature, summing to 100. */
  shares: number[];
  /** Raw standardised coefficients (signed). */
  coefficients: number[];
  /** Coefficient of determination of the fit. */
  rSquared: number;
}

function standardizeColumns(X: number[][]): {
  z: number[][];
  means: number[];
  stds: number[];
} {
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
    for (let i = 0; i < n; i++) {
      const diff = X[i]![j]! - means[j]!;
      s += diff * diff;
    }
    stds[j] = Math.sqrt(s / Math.max(1, n - 1)) || 1;
  }

  const z = X.map((row) => row.map((v, j) => (v - means[j]!) / stds[j]!));
  return { z, means, stds };
}

function standardize1d(y: number[]): number[] {
  const n = y.length;
  const mean = y.reduce((s, v) => s + v, 0) / n;
  const std = Math.sqrt(y.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, n - 1)) || 1;
  return y.map((v) => (v - mean) / std);
}

/**
 * Multiple linear regression on z-scored features/target via the SVD
 * pseudo-inverse: β = V Σ⁺ Uᵀ y. Robust to collinear columns. The absolute
 * standardised coefficients become true revenue-attribution shares.
 */
export async function attribution(X: number[][], y: number[]): Promise<AttributionResult> {
  const n = X.length;
  const d = X[0]?.length ?? 0;

  if (n < 2 || d < 1 || y.length !== n) {
    return { shares: new Array(d).fill(0), coefficients: new Array(d).fill(0), rSquared: 0 };
  }

  const { z } = standardizeColumns(X);
  const yz = standardize1d(y);

  const Xm = new Matrix(z);
  const svd = new SVD(Xm, { autoTranspose: true });

  // Manual SVD pseudo-inverse solve: β = V Σ⁺ Uᵀ y. Version-robust and stable
  // for collinear feature columns (singular values below tolerance dropped).
  const u = svd.leftSingularVectors; // n x r
  const v = svd.rightSingularVectors; // d x r
  const s = svd.diagonal; // length r
  const tolerance = (s.length > 0 ? Math.max(...s) : 0) * Math.max(n, d) * Number.EPSILON;

  const yCol = Matrix.columnVector(yz);
  const uty = u.transpose().mmul(yCol).to1DArray(); // length r
  const scaled = uty.map((val, i) => (s[i]! > tolerance ? val / s[i]! : 0)); // length r
  const coefficients = v.mmul(Matrix.columnVector(scaled)).to1DArray();

  const absCoefs = coefficients.map((c) => Math.abs(c));
  const total = absCoefs.reduce((s, c) => s + c, 0) || 1;
  const shares = absCoefs.map((c) => (100 * c) / total);

  // R² of the standardised fit.
  const yMean = yz.reduce((s, v) => s + v, 0) / n;
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

Comlink.expose({ kMeans, attribution });
