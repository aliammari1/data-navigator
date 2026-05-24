"use client";
/**
 * K-means segmentation with auto-k via elbow heuristic. Pure JS so we don't
 * need to roundtrip through ml.worker for small samples.
 */

import { runQuery } from "@/platform/duckdb/duckdb";
import type { ClusterResult, ColumnProfile } from "./types";

const SAMPLE = 2000;
const MAX_K = 6;
const MAX_ITER = 50;

function quote(name: string): string {
  return `"${name.replace('"', '""')}"`;
}

function dist2(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return s;
}

function kmeans(
  points: number[][],
  k: number,
): { labels: number[]; centroids: number[][]; sse: number } {
  if (!points.length) return { labels: [], centroids: [], sse: 0 };
  // k-means++ seeding
  const centroids: number[][] = [points[0].slice()];
  while (centroids.length < k) {
    const dists = points.map((p) =>
      Math.min(...centroids.map((c) => dist2(p, c))),
    );
    const total = dists.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    let pick = 0;
    for (let i = 0; i < dists.length; i++) {
      r -= dists[i];
      if (r <= 0) {
        pick = i;
        break;
      }
    }
    centroids.push(points[pick].slice());
  }
  const labels = new Array<number>(points.length).fill(0);
  for (let it = 0; it < MAX_ITER; it++) {
    let changed = false;
    for (let i = 0; i < points.length; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const d = dist2(points[i], centroids[c]);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (labels[i] !== best) {
        labels[i] = best;
        changed = true;
      }
    }
    const sums = centroids.map(() =>
      new Array<number>(centroids[0].length).fill(0),
    );
    const counts = centroids.map(() => 0);
    for (let i = 0; i < points.length; i++) {
      const c = labels[i];
      counts[c]++;
      for (let f = 0; f < points[i].length; f++) sums[c][f] += points[i][f];
    }
    for (let c = 0; c < centroids.length; c++) {
      if (counts[c] === 0) continue;
      for (let f = 0; f < centroids[c].length; f++)
        centroids[c][f] = sums[c][f] / counts[c];
    }
    if (!changed) break;
  }
  let sse = 0;
  for (let i = 0; i < points.length; i++)
    sse += dist2(points[i], centroids[labels[i]]);
  return { labels, centroids, sse };
}

export async function segment(
  tableName: string,
  profiles: ColumnProfile[],
): Promise<ClusterResult | null> {
  const num = profiles
    .filter((p) => p.semantic === "numeric" && p.stddev && p.stddev > 0)
    .slice(0, 6);
  if (num.length < 2) return null;

  const sel = num
    .map(
      (c) =>
        `(TRY_CAST(${quote(c.name)} AS DOUBLE) - AVG(TRY_CAST(${quote(c.name)} AS DOUBLE)) OVER ()) / NULLIF(STDDEV_POP(TRY_CAST(${quote(c.name)} AS DOUBLE)) OVER (), 0) AS ${quote(c.name)}`,
    )
    .join(", ");
  const rows = await runQuery(
    `SELECT ${sel} FROM ${quote(tableName)} USING SAMPLE ${SAMPLE}`,
  );
  const features = num.map((c) => c.name);
  const points: number[][] = [];
  for (const r of rows) {
    const p: number[] = [];
    let ok = true;
    for (const f of features) {
      const v = Number(r[f]);
      if (!Number.isFinite(v)) {
        ok = false;
        break;
      }
      p.push(v);
    }
    if (ok) points.push(p);
  }
  if (points.length < 50) return null;

  // Elbow over k=2..MAX_K
  let bestK = 2;
  let prevSSE = Infinity;
  let bestResult: {
    labels: number[];
    centroids: number[][];
    sse: number;
  } | null = null;
  let prevDelta = Infinity;
  for (let k = 2; k <= MAX_K; k++) {
    const result = kmeans(points, k);
    const delta = prevSSE - result.sse;
    if (k === 2 || delta > prevDelta * 0.4) {
      bestK = k;
      bestResult = result;
    }
    prevDelta = delta;
    prevSSE = result.sse;
  }
  if (!bestResult) return null;

  const sizePerCluster = new Array(bestK).fill(0);
  for (const lab of bestResult.labels) sizePerCluster[lab]++;

  return {
    k: bestK,
    labels: bestResult.labels,
    centroids: bestResult.centroids,
    features,
    sizePerCluster,
    sse: bestResult.sse,
  };
}
