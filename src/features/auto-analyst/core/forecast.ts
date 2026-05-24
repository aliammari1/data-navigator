"use client";
/**
 * Simple linear forecast with 80/95 confidence band, fully deterministic.
 * Designed to give every numeric × time pair a forward-looking projection.
 */

import { runQuery } from "@/platform/duckdb/duckdb";
import type { ColumnProfile, ForecastPoint, ForecastSeries } from "./types";

const HORIZON = 14;

function quote(name: string): string {
  return `"${name.replace('"', '""')}"`;
}

function linearFit(
  xs: number[],
  ys: number[],
): { slope: number; intercept: number; sigma: number } {
  const n = xs.length;
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0, sigma: 0 };
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i];
    sy += ys[i];
  }
  const meanX = sx / n;
  const meanY = sy / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const yhat = slope * xs[i] + intercept;
    sse += (ys[i] - yhat) ** 2;
  }
  const sigma = Math.sqrt(sse / Math.max(1, n - 2));
  return { slope, intercept, sigma };
}

export async function forecastSeries(
  tableName: string,
  profiles: ColumnProfile[],
): Promise<ForecastSeries[]> {
  const date = profiles.find((p) => p.semantic === "datetime");
  if (!date) return [];
  const numeric = profiles.filter((p) => p.semantic === "numeric").slice(0, 3);
  if (!numeric.length) return [];

  const out: ForecastSeries[] = [];

  for (const m of numeric) {
    const sql = `
      SELECT
        DATE_TRUNC('day', TRY_CAST(${quote(date.name)} AS TIMESTAMP)) AS d,
        SUM(TRY_CAST(${quote(m.name)} AS DOUBLE)) AS y
      FROM ${quote(tableName)}
      WHERE ${quote(date.name)} IS NOT NULL
      GROUP BY d
      ORDER BY d
    `;
    let rows: Record<string, unknown>[];
    try {
      rows = await runQuery(sql);
    } catch {
      continue;
    }
    if (rows.length < 5) continue;

    const history: Array<{ t: number; y: number }> = rows
      .map((r) => ({
        t: typeof r.d === "string" ? Date.parse(r.d) : Number(r.d),
        y: Number(r.y),
      }))
      .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.y));
    if (history.length < 5) continue;

    const t0 = history[0].t;
    const xs = history.map((p) => (p.t - t0) / 86_400_000);
    const ys = history.map((p) => p.y);
    const { slope, intercept, sigma } = linearFit(xs, ys);
    const stepDays =
      (history[history.length - 1].t - t0) /
        86_400_000 /
        Math.max(1, history.length - 1) || 1;

    const forecast: ForecastPoint[] = [];
    const startStep = xs[xs.length - 1] + stepDays;
    for (let i = 0; i < HORIZON; i++) {
      const x = startStep + i * stepDays;
      const yhat = slope * x + intercept;
      const t = t0 + x * 86_400_000;
      forecast.push({
        t,
        yhat,
        yLow80: yhat - 1.28 * sigma,
        yHigh80: yhat + 1.28 * sigma,
        yLow95: yhat - 1.96 * sigma,
        yHigh95: yhat + 1.96 * sigma,
      });
    }

    out.push({
      column: m.name,
      history,
      forecast,
      source: "linear",
    });
  }

  return out;
}
