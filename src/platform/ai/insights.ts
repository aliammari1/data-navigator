/**
 * Offline statistical insights engine.
 * Powered by simple-statistics for robust math — zero network calls.
 */

import * as ss from "simple-statistics";
import type { ColMeta } from "@/core/stores/data-store";

// ─── Anomaly detection ────────────────────────────────────────────────────────

export interface Anomaly {
  columnName: string;
  value: number;
  rowIndex: number;
  zScore: number;
  method: "zscore" | "iqr";
  severity: "low" | "medium" | "high";
}

export function detectAnomalies(
  values: number[],
  columnName: string,
): Anomaly[] {
  if (values.length < 4) return [];

  const m = ss.mean(values);
  const std = ss.sampleStandardDeviation(values);
  const iqr = ss.interquartileRange(values);
  const q1 = ss.quantile(values, 0.25);
  const q3 = ss.quantile(values, 0.75);
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;

  const anomalies: Anomaly[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    const z = std > 0 ? Math.abs(ss.zScore(v, m, std)) : 0;
    const isIQR = v < lowerBound || v > upperBound;

    if (z > 3 || (isIQR && z > 2)) {
      anomalies.push({
        columnName,
        value: v,
        rowIndex: i,
        zScore: z,
        method: z > 3 ? "zscore" : "iqr",
        severity: z > 4 ? "high" : z > 3.5 ? "medium" : "low",
      });
    }
  }

  return anomalies.sort((a, b) => b.zScore - a.zScore).slice(0, 20);
}

// ─── Correlation matrix ────────────────────────────────────────────────────────

export function pearsonCorr(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  return ss.sampleCorrelation(xs.slice(0, n), ys.slice(0, n));
}

export function buildCorrelationMatrix(
  data: Record<string, number[]>,
  cols: string[],
): number[][] {
  return cols.map((a) =>
    cols.map((b) => {
      if (a === b) return 1;
      const xs = data[a] ?? [];
      const ys = data[b] ?? [];
      return Number(pearsonCorr(xs, ys).toFixed(3));
    }),
  );
}

// ─── Linear regression / forecast ─────────────────────────────────────────────

export interface Forecast {
  historical: { x: number; y: number }[];
  predicted: { x: number; y: number }[];
  r2: number;
  slope: number;
  intercept: number;
  trend: "up" | "down" | "flat";
}

export function linearForecast(values: number[], steps = 6): Forecast {
  const n = values.length;
  if (n < 2) {
    return {
      historical: [],
      predicted: [],
      r2: 0,
      slope: 0,
      intercept: 0,
      trend: "flat",
    };
  }

  const pairs: [number, number][] = values.map((y, i) => [i, y]);
  const reg = ss.linearRegression(pairs);
  const line = ss.linearRegressionLine(reg);
  const r2 = Math.max(0, Math.min(1, ss.rSquared(pairs, line)));

  const historical = values.map((y, x) => ({ x, y }));
  const predicted = Array.from({ length: steps }, (_, i) => ({
    x: n + i,
    y: line(n + i),
  }));

  const my = ss.mean(values);

  return {
    historical,
    predicted,
    r2,
    slope: reg.m,
    intercept: reg.b,
    trend:
      Math.abs(reg.m) < 0.001 * Math.abs(my)
        ? "flat"
        : reg.m > 0
          ? "up"
          : "down",
  };
}

// ─── K-means clustering (simple-statistics ckmeans + manual k-means) ──────────

export interface Cluster {
  centroid: number[];
  points: number[][];
  size: number;
  label: string;
}

export function kMeans(
  points: number[][],
  k: number,
  maxIter = 100,
): Cluster[] {
  if (points.length < k) return [];

  // For 1D data, use ckmeans for optimal clustering
  if (points[0].length === 1) {
    const flat = points.map((p) => p[0]);
    const groups = ss.ckmeans(flat, k);
    const LABELS = [
      "High Value",
      "Mid Value",
      "Low Value",
      "Cluster D",
      "Cluster E",
      "Cluster F",
    ];
    return groups
      .map((g, j) => ({
        centroid: [ss.mean(g)],
        points: g.map((v) => [v]),
        size: g.length,
        label: LABELS[j] ?? `Cluster ${j + 1}`,
      }))
      .sort((a, b) => b.centroid[0] - a.centroid[0]);
  }

  // Multi-dimensional k-means with k-means++ init
  const dist = (a: number[], b: number[]) =>
    Math.sqrt(a.reduce((s, v, i) => s + (v - (b[i] ?? 0)) ** 2, 0));

  const centroids: number[][] = [
    points[Math.floor(Math.random() * points.length)],
  ];
  while (centroids.length < k) {
    const dists = points.map((p) =>
      Math.min(...centroids.map((c) => dist(p, c))),
    );
    const total = dists.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < points.length; i++) {
      r -= dists[i];
      if (r <= 0) {
        centroids.push(points[i]);
        break;
      }
    }
    if (centroids.length < k)
      centroids.push(points[points.length - centroids.length]);
  }

  let assignments = new Array(points.length).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    const newAssign = points.map((p) => {
      let best = 0;
      let bestD = Infinity;
      for (let j = 0; j < k; j++) {
        const d = dist(p, centroids[j]);
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      }
      return best;
    });

    let changed = false;
    for (let i = 0; i < points.length; i++) {
      if (newAssign[i] !== assignments[i]) {
        changed = true;
        break;
      }
    }
    assignments = newAssign;
    if (!changed) break;

    for (let j = 0; j < k; j++) {
      const clusterPts = points.filter((_, i) => assignments[i] === j);
      if (clusterPts.length === 0) continue;
      const dims = points[0].length;
      centroids[j] = Array.from({ length: dims }, (_, d) =>
        ss.mean(clusterPts.map((p) => p[d])),
      );
    }
  }

  const LABELS = [
    "High Value",
    "Mid Value",
    "Low Value",
    "Cluster D",
    "Cluster E",
    "Cluster F",
  ];
  return Array.from({ length: k }, (_, j) => ({
    centroid: centroids[j],
    points: points.filter((_, i) => assignments[i] === j),
    size: points.filter((_, i) => assignments[i] === j).length,
    label: LABELS[j] ?? `Cluster ${j + 1}`,
  })).sort((a, b) => b.centroid[0] - a.centroid[0]);
}

// ─── Additional stats helpers (powered by simple-statistics) ──────────────────

export function computeSkewness(values: number[]): number {
  if (values.length < 3) return 0;
  return ss.sampleSkewness(values);
}

export function computeKurtosis(values: number[]): number {
  if (values.length < 4) return 0;
  return ss.sampleKurtosis(values);
}

export function computeMedian(values: number[]): number {
  return ss.median(values);
}

export function computeQuantiles(values: number[]): {
  q1: number;
  q3: number;
  iqr: number;
} {
  const q1 = ss.quantile(values, 0.25);
  const q3 = ss.quantile(values, 0.75);
  return { q1, q3, iqr: q3 - q1 };
}

// ─── Auto-insight generator ───────────────────────────────────────────────────

export interface Insight {
  type:
    | "trend"
    | "anomaly"
    | "correlation"
    | "distribution"
    | "quality"
    | "outlier";
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  value?: number | string;
  columnName?: string;
}

export function generateInsights(
  _cols: ColMeta[],
  _rowCount: number,
  _numericData?: Record<string, number[]>,
): Insight[] {
  // Disabled per Moudir AI plan: insights must come from edge AI, not deterministic rules.
  return [];
}
// ─── Chart type recommender ───────────────────────────────────────────────────

export interface ChartRecommendation {
  type: "bar" | "line" | "scatter" | "pie" | "heatmap" | "histogram" | "box";
  title: string;
  reason: string;
  xCol?: string;
  yCol?: string;
  colorCol?: string;
  confidence: number; // 0-1
}

export function recommendCharts(
  _cols: ColMeta[],
  _rowCount: number,
): ChartRecommendation[] {
  // Disabled per Moudir AI plan: no rule-based chart generation.
  return [];
}
