"use client";

/**
 * Moudir AI — Tier 2 deterministic compute stage (ZERO LLM calls).
 *
 * Takes the model's PLAN+SPEC (see agents/analyze.ts) and turns it into real
 * artifacts entirely in code: every SQL spec runs through read-only DuckDB in the
 * parallel IO lane, charts are built from real rows, and anomaly checks are plain
 * TypeScript math over the realized rows. The numbers are FACTS, not model output —
 * this is where the speed and the trust come from.
 */

import { runReadOnlyQuery } from "@/platform/duckdb/duckdb";
import { genId } from "../helpers";
import { sanitizeJsonValue } from "../json";
import type { ChartSpec, Encoding } from "../types";
import { assertReadOnlySql, coerceChartType, runChartArtifact } from "./agents/base";
import type { AnalysisPlan } from "./agents/analyze";
import type { InferenceScheduler } from "./scheduler";
import type { Artifact, SwarmContext } from "./types";

type Row = Record<string, unknown>;

// ─── D2: read-only SQL memo ─────────────────────────────────────────────────
// Identical SQL on the same dataset (id + row count) is run once and reused. The
// row count in the key means a new import (which changes the count) misses cleanly,
// so stale rows are never served. Bounded LRU; data is read-only so this is safe.
const SQL_MEMO_MAX = 100;
const sqlMemo = new Map<string, Row[]>();

function memoKey(ctx: SwarmContext, sql: string): string {
  return `${ctx.datasetId}::${ctx.rowCount}::${sql.replace(/\s+/g, " ").trim().toLowerCase()}`;
}

async function memoizedQuery(ctx: SwarmContext, sql: string): Promise<Row[]> {
  const key = memoKey(ctx, sql);
  const cached = sqlMemo.get(key);
  if (cached) return cached;
  const rows = (await runReadOnlyQuery(sql)) as Row[];
  sqlMemo.set(key, rows);
  while (sqlMemo.size > SQL_MEMO_MAX) {
    const oldest = sqlMemo.keys().next().value;
    if (oldest === undefined) break;
    sqlMemo.delete(oldest);
  }
  return rows;
}

/** First column whose values are all numeric (used for anomaly math). */
function firstNumericKey(rows: Row[]): string | null {
  if (!rows.length) return null;
  for (const key of Object.keys(rows[0])) {
    const present = rows.some((r) => Number.isFinite(Number(r[key])));
    const allNumeric = rows.every((r) => r[key] == null || Number.isFinite(Number(r[key])));
    if (present && allNumeric) return key;
  }
  return null;
}

export interface AnomalyFinding {
  title: string;
  body: string;
  severity: "low" | "medium" | "high";
}

/** Pure anomaly detector over realized rows. Returns a finding or null. */
export function detectAnomaly(
  rows: Row[],
  kind: AnalysisPlan["anomalyChecks"][number]["kind"],
): AnomalyFinding | null {
  const key = firstNumericKey(rows);
  if (!key) return null;
  const vals = rows.map((r) => Number(r[key])).filter((n) => Number.isFinite(n));
  if (vals.length < 3) return null;

  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
  const min = Math.min(...vals);
  const max = Math.max(...vals);

  if (kind === "dip" && min < mean - sd) {
    return {
      title: "Dip detected",
      body: `${key} dips to ${min} (mean ${mean.toFixed(1)}).`,
      severity: "high",
    };
  }
  if (kind === "spike" && max > mean + sd) {
    return {
      title: "Spike detected",
      body: `${key} spikes to ${max} (mean ${mean.toFixed(1)}).`,
      severity: "high",
    };
  }
  if (kind === "outlier" && (max > mean + 2 * sd || min < mean - 2 * sd)) {
    return {
      title: "Outlier",
      body: `${key} has an outlier (range ${min}–${max}, mean ${mean.toFixed(1)}).`,
      severity: "medium",
    };
  }
  if (kind === "trend") {
    const up = vals[vals.length - 1] > vals[0];
    return {
      title: "Trend",
      body: `${key} trends ${up ? "up" : "down"} (${vals[0]} → ${vals[vals.length - 1]}).`,
      severity: "low",
    };
  }
  return null;
}

/** Run all SQL + charts + anomaly checks deterministically. No model calls. */
export async function compute(
  scheduler: InferenceScheduler,
  ctx: SwarmContext,
  plan: AnalysisPlan,
): Promise<Artifact[]> {
  const known = new Set(ctx.columns.map((c) => c.name));

  // 1. SQL specs (read-only, overlapping in the IO lane). Capture rows per id.
  const tableResults = await scheduler.ioMap(plan.sqlSpecs, async (spec) => {
    try {
      const sql = assertReadOnlySql(spec.sql);
      const rows = await scheduler.io(() => memoizedQuery(ctx, sql));
      if (rows.length === 0) return { id: spec.id, artifact: null as Artifact | null };
      const artifact: Artifact = {
        kind: "table",
        id: genId(),
        taskId: spec.id,
        title: spec.purpose,
        rows: sanitizeJsonValue(rows) as Row[],
        sql,
      };
      return { id: spec.id, artifact };
    } catch {
      return { id: spec.id, artifact: null as Artifact | null };
    }
  });

  const rowsById = new Map<string, Row[]>();
  for (const { id, artifact } of tableResults) {
    if (artifact && artifact.kind === "table") rowsById.set(id, artifact.rows);
  }

  // 2. Charts (only over sql specs that returned rows + real columns).
  const charts = await scheduler.ioMap(plan.chartSpecs, async (c) => {
    if (!rowsById.has(c.usesSqlId)) return null;
    if (!known.has(c.x) || !known.has(c.y)) return null;
    const encodings: Encoding[] = [
      { id: genId(), channel: "x", field: c.x },
      { id: genId(), channel: "y", field: c.y },
      ...(c.series && known.has(c.series)
        ? [{ id: genId(), channel: "color" as const, field: c.series }]
        : []),
    ];
    const spec: ChartSpec = {
      id: genId(),
      type: coerceChartType(c.type),
      title: `${c.y} by ${c.x}`,
      limit: 200,
      filters: [],
      encodings,
    };
    try {
      return await runChartArtifact(scheduler, ctx, c.usesSqlId, spec);
    } catch {
      return null;
    }
  });

  // 3. Anomalies (pure math over realized rows; no LLM).
  const anomalies: Artifact[] = [];
  for (const check of plan.anomalyChecks) {
    const rows = rowsById.get(check.usesSqlId);
    if (!rows) continue;
    const found = detectAnomaly(rows, check.kind);
    if (found) {
      anomalies.push({
        kind: "insight",
        id: genId(),
        taskId: check.usesSqlId,
        title: found.title,
        body: found.body,
        severity: found.severity,
      });
    }
  }

  const tables = tableResults.map((t) => t.artifact);
  return [...tables, ...charts, ...anomalies].filter(
    (a): a is Artifact => a !== null && a !== undefined,
  );
}
