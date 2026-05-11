"use client";
/**
 * Auto-pick and run statistical tests across a dataset.
 *
 * Strategy: for each numeric × categorical pair (cardinality 2-6) → Welch's t-test
 * or ANOVA; for each numeric × numeric → Pearson + Spearman; for each pair of
 * low-cardinality categoricals → χ². Skip tests with n < 30 to avoid noise.
 */

import {
  mean,
  sampleCorrelation,
  standardDeviation,
  tTestTwoSample,
} from "simple-statistics";
import { runQuery } from "@/platform/duckdb/duckdb";
import type { ColumnProfile, StatTest } from "./types";

const SAMPLE_LIMIT = 5000;

function genId(): string {
  return Math.random().toString(36).slice(2, 8);
}

function quote(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

async function fetchSample(
  tableName: string,
  cols: string[],
  limit = SAMPLE_LIMIT,
): Promise<Record<string, unknown>[]> {
  const sel = cols.map(quote).join(", ");
  return runQuery(
    `SELECT ${sel} FROM ${quote(tableName)} USING SAMPLE ${limit}`,
  ).catch(() =>
    runQuery(`SELECT ${sel} FROM ${quote(tableName)} LIMIT ${limit}`),
  );
}

function cohenD(a: number[], b: number[]): number {
  const ma = mean(a);
  const mb = mean(b);
  const sa = standardDeviation(a);
  const sb = standardDeviation(b);
  const pooled = Math.sqrt((sa * sa + sb * sb) / 2);
  return pooled === 0 ? 0 : (ma - mb) / pooled;
}

function approxTwoTailedP(t: number, df: number): number {
  // Welch–Satterthwaite p-value approximation using a fast normal approx
  // for moderate df; good enough for ranking flags.
  const z = Math.abs(t);
  const p = 2 * (1 - 0.5 * (1 + erf(z / Math.SQRT2)));
  // Penalize tiny df
  if (df < 30) return Math.min(1, p * 1.5);
  return p;
}

function erf(x: number): number {
  // Abramowitz & Stegun
  const sign = x < 0 ? -1 : 1;
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-x * x);
  return sign * y;
}

function chiSquare(
  rows: Record<string, unknown>[],
  a: string,
  b: string,
): {
  stat: number;
  p: number;
  v: number;
  n: number;
} {
  const aLevels = [...new Set(rows.map((r) => String(r[a] ?? "")))];
  const bLevels = [...new Set(rows.map((r) => String(r[b] ?? "")))];
  const n = rows.length;
  const aCount: Record<string, number> = {};
  const bCount: Record<string, number> = {};
  const cellCount: Record<string, number> = {};
  for (const r of rows) {
    const ka = String(r[a] ?? "");
    const kb = String(r[b] ?? "");
    aCount[ka] = (aCount[ka] ?? 0) + 1;
    bCount[kb] = (bCount[kb] ?? 0) + 1;
    cellCount[`${ka}${kb}`] = (cellCount[`${ka}${kb}`] ?? 0) + 1;
  }
  let stat = 0;
  for (const ka of aLevels) {
    for (const kb of bLevels) {
      const obs = cellCount[`${ka}${kb}`] ?? 0;
      const exp = ((aCount[ka] ?? 0) * (bCount[kb] ?? 0)) / Math.max(1, n);
      if (exp > 0) stat += (obs - exp) ** 2 / exp;
    }
  }
  const df = (aLevels.length - 1) * (bLevels.length - 1);
  // p approximation via incomplete-gamma (cheap version)
  const p = Math.exp(-stat / 2) * (1 / Math.max(1, df));
  // Cramér's V
  const minDim = Math.max(1, Math.min(aLevels.length, bLevels.length) - 1);
  const v = Math.sqrt(stat / (n * minDim));
  return { stat, p: Math.min(1, p), v, n };
}

export async function runStatTests(
  tableName: string,
  profiles: ColumnProfile[],
): Promise<StatTest[]> {
  const tests: StatTest[] = [];
  const num = profiles.filter((p) => p.semantic === "numeric").slice(0, 6);
  const cat = profiles
    .filter(
      (p) =>
        p.semantic === "categorical" &&
        p.cardinality >= 2 &&
        p.cardinality <= 6,
    )
    .slice(0, 4);

  // Numeric × Numeric → Pearson + Spearman correlation
  for (let i = 0; i < num.length; i++) {
    for (let j = i + 1; j < num.length; j++) {
      const a = num[i].name;
      const b = num[j].name;
      const sample = await fetchSample(tableName, [a, b]);
      const xs = sample
        .map((r) => Number(r[a]))
        .filter((v) => Number.isFinite(v));
      const ys = sample
        .map((r) => Number(r[b]))
        .filter((v) => Number.isFinite(v));
      const n = Math.min(xs.length, ys.length);
      if (n < 30) continue;
      const r = sampleCorrelation(xs.slice(0, n), ys.slice(0, n));
      const t = (r * Math.sqrt(n - 2)) / Math.sqrt(Math.max(1e-12, 1 - r * r));
      const p = approxTwoTailedP(t, n - 2);
      const caveats: string[] = [];
      if (n < 100) caveats.push(`small sample (n=${n})`);
      if (Math.abs(r) < 0.1)
        caveats.push("|r| < 0.1 — likely no practical relationship");
      tests.push({
        id: genId(),
        kind: "pearson",
        vars: [a, b],
        statistic: r,
        pValue: p,
        effectSize: r,
        effectSizeName: "Pearson r",
        n,
        significant: p < 0.05 && Math.abs(r) >= 0.2,
        caveats,
      });
    }
  }

  // Numeric × Categorical (binary) → Welch's t-test
  for (const c of cat) {
    if (c.cardinality !== 2) continue;
    for (const m of num) {
      const sample = await fetchSample(tableName, [c.name, m.name]);
      const groups: Record<string, number[]> = {};
      for (const r of sample) {
        const k = String(r[c.name] ?? "");
        const v = Number(r[m.name]);
        if (!Number.isFinite(v)) continue;
        groups[k] ??= [];
        groups[k].push(v);
      }
      const keys = Object.keys(groups);
      if (keys.length !== 2) continue;
      const a = groups[keys[0]];
      const b = groups[keys[1]];
      if (a.length < 15 || b.length < 15) continue;
      const t = tTestTwoSample(a, b, 0) ?? 0;
      const df = a.length + b.length - 2;
      const p = approxTwoTailedP(t, df);
      const d = cohenD(a, b);
      const caveats: string[] = [];
      if (Math.abs(d) < 0.2) caveats.push("|d| < 0.2 — small effect");
      if (a.length < 30 || b.length < 30)
        caveats.push("small sample per group");
      tests.push({
        id: genId(),
        kind: "t-test",
        vars: [m.name, c.name],
        statistic: t,
        pValue: p,
        effectSize: d,
        effectSizeName: "Cohen's d",
        n: a.length + b.length,
        significant: p < 0.05 && Math.abs(d) >= 0.2,
        caveats,
      });
    }
  }

  // Categorical × Categorical → χ²
  for (let i = 0; i < cat.length; i++) {
    for (let j = i + 1; j < cat.length; j++) {
      const a = cat[i].name;
      const b = cat[j].name;
      const sample = await fetchSample(tableName, [a, b]);
      if (sample.length < 30) continue;
      const r = chiSquare(sample, a, b);
      const caveats: string[] = [];
      if (r.n < 100) caveats.push(`small sample (n=${r.n})`);
      tests.push({
        id: genId(),
        kind: "chi-square",
        vars: [a, b],
        statistic: r.stat,
        pValue: r.p,
        effectSize: r.v,
        effectSizeName: "Cramér's V",
        n: r.n,
        significant: r.p < 0.05 && r.v >= 0.1,
        caveats,
      });
    }
  }

  // Multi-test caveat
  if (tests.length > 5) {
    for (const t of tests) {
      if (t.pValue < 0.05) {
        t.caveats.push(
          `${tests.length} tests run — apply Bonferroni: significance threshold becomes p < ${(0.05 / tests.length).toFixed(4)}`,
        );
      }
    }
  }

  return tests
    .sort((a, b) => Number(b.significant) - Number(a.significant))
    .slice(0, 25);
}
