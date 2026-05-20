"use client";
/**
 * Univariate anomaly detection over numeric columns. Cheap, deterministic, runs
 * fully in JS off a sampled DuckDB result.
 */

import {
  mean as ssMean,
  median as ssMedian,
  standardDeviation as ssStd,
} from "simple-statistics";
import { runQuery } from "@/platform/duckdb/duckdb";
import type { AnomalyHit, ColumnProfile } from "./types";

const SAMPLE = 5000;

function genId(): string {
  return Math.random().toString(36).slice(2, 8);
}

function quote(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export async function detectAnomalies(
  tableName: string,
  profiles: ColumnProfile[],
): Promise<AnomalyHit[]> {
  const hits: AnomalyHit[] = [];
  const numeric = profiles
    .filter((p) => p.semantic === "numeric" && p.stddev && p.stddev > 0)
    .slice(0, 6);

  for (const p of numeric) {
    const rows = await runQuery(
      `SELECT TRY_CAST(${quote(p.name)} AS DOUBLE) AS v FROM ${quote(tableName)} WHERE ${quote(p.name)} IS NOT NULL USING SAMPLE ${SAMPLE}`,
    );
    const values = rows
      .map((r) => Number(r.v))
      .filter((v) => Number.isFinite(v));
    if (values.length < 30) continue;

    const mu = ssMean(values);
    const sigma = ssStd(values);
    const med = ssMedian(values);
    const mad = ssMedian(values.map((v) => Math.abs(v - med))) || 1e-9;

    // z-score
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      const z = sigma === 0 ? 0 : (v - mu) / sigma;
      if (Math.abs(z) >= 3) {
        hits.push({
          id: genId(),
          rowId: i,
          column: p.name,
          value: v,
          zScore: z,
          reason: "z-score",
        });
      }
    }
    // Hampel (modified z) — robust to outliers themselves
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      const m = (0.6745 * (v - med)) / mad;
      if (
        Math.abs(m) >= 3.5 &&
        !hits.some((h) => h.column === p.name && h.rowId === i)
      ) {
        hits.push({
          id: genId(),
          rowId: i,
          column: p.name,
          value: v,
          zScore: m,
          reason: "hampel",
        });
      }
    }
  }

  // Cap and rank
  return hits
    .sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore))
    .slice(0, 200);
}
