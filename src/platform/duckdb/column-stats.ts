/**
 * Column-stats pushdown (Rill / MotherDuck-style column explorer).
 *
 * ONE read-only scan per column: the caller passes a *base* SQL that yields the
 * table (for an original: `SELECT * FROM "view"`; for a derived leaf: the
 * `buildLineageSQL(...)` WITH-chain — DuckDB accepts a nested WITH inside a CTE
 * body, so wrapping it as `__cs_src AS ( <base> )` is safe). We then compute the
 * whole profile in a single statement built from CTEs:
 *
 *   - NUMERIC → min / max / avg / approx-distinct / null-count + a 12-bin
 *     equi-width histogram (FLOOR math over min..max, one GROUP BY). The bin
 *     index is clamped to [0, 11] so the max value lands in the last bucket, and
 *     COALESCE'd to 0 for the degenerate single-value range (min == max).
 *   - STRING / DATE / BOOLEAN / other → approx-distinct / null-count + the top-8
 *     values by frequency (CAST to VARCHAR so dates/bools stringify uniformly).
 *
 * Numeric returns exactly 12 rows (a generated bin series LEFT-joined to the
 * counts, so empty buckets still appear and the aggregates always come back even
 * over an all-null / empty relation). Categorical drives from the one-row agg
 * CTE with `LEFT JOIN … ON TRUE`, so distinct/null/total survive even when every
 * value is NULL.
 *
 * Pure `buildColumnStatsSQL` is exported for shape-testing; `fetchColumnStats`
 * runs it through `runReadOnlyQuery` and shapes the rows into a typed union.
 */

import type { ColumnInfo } from "@/features/data-formulator/core/types";
import { quoteIdent, runReadOnlyQuery } from "./duckdb";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface NumericBin {
  lo: number;
  hi: number;
  count: number;
}

export interface NumericColumnStats {
  kind: "numeric";
  min: number | null;
  max: number | null;
  avg: number | null;
  distinct: number;
  nulls: number;
  total: number;
  bins: NumericBin[];
}

export interface CategoricalColumnStats {
  kind: "categorical";
  distinct: number;
  nulls: number;
  total: number;
  top: Array<{ value: string; count: number }>;
}

export type ColumnStats = NumericColumnStats | CategoricalColumnStats;

/** A column identity the builder needs — a subset of {@link ColumnInfo}. */
export type StatColumn = Pick<ColumnInfo, "name" | "type">;

// ─── Constants ────────────────────────────────────────────────────────────────

/** Histogram bucket count for numeric columns. */
export const NUM_BINS = 12;
/** Most-frequent values returned for categorical columns. */
export const TOP_K = 8;

const SRC = "__cs_src";

// ─── SQL builder (pure) ───────────────────────────────────────────────────────

/**
 * Compile the single-scan stats query for `column` over `baseSql`. Returns the
 * SQL plus which shape to expect back, so `fetchColumnStats` knows how to read
 * the rows. Numeric when `column.type === "number"`, categorical otherwise.
 */
export function buildColumnStatsSQL(
  baseSql: string,
  column: StatColumn,
): { kind: ColumnStats["kind"]; sql: string } {
  // Trailing semicolons would close the wrapping CTE body early.
  const base = baseSql.trim().replace(/;+\s*$/, "");
  const col = quoteIdent(column.name);

  if (column.type === "number") {
    const sql = `WITH ${SRC} AS (
${base}
), __cs_agg AS (
  SELECT
    min(CAST(${col} AS DOUBLE)) AS mn,
    max(CAST(${col} AS DOUBLE)) AS mx,
    avg(CAST(${col} AS DOUBLE)) AS av,
    approx_count_distinct(${col}) AS distinct_count,
    count(*) AS total,
    count(*) - count(${col}) AS nulls
  FROM ${SRC}
), __cs_binned AS (
  SELECT
    LEAST(${NUM_BINS - 1}, GREATEST(0, COALESCE(
      CAST(floor((CAST(s.${col} AS DOUBLE) - a.mn) / NULLIF(a.mx - a.mn, 0) * ${NUM_BINS}) AS INTEGER),
      0))) AS bin,
    count(*) AS cnt
  FROM ${SRC} s, __cs_agg a
  WHERE s.${col} IS NOT NULL
  GROUP BY 1
)
SELECT
  g.bin AS bin,
  COALESCE(b.cnt, 0) AS cnt,
  a.mn AS mn,
  a.mx AS mx,
  a.av AS av,
  a.distinct_count AS distinct_count,
  a.total AS total,
  a.nulls AS nulls
FROM range(0, ${NUM_BINS}) AS g(bin)
CROSS JOIN __cs_agg a
LEFT JOIN __cs_binned b ON b.bin = g.bin
ORDER BY g.bin`;
    return { kind: "numeric", sql };
  }

  const sql = `WITH ${SRC} AS (
${base}
), __cs_agg AS (
  SELECT
    approx_count_distinct(${col}) AS distinct_count,
    count(*) AS total,
    count(*) - count(${col}) AS nulls
  FROM ${SRC}
), __cs_top AS (
  SELECT CAST(${col} AS VARCHAR) AS value, count(*) AS cnt
  FROM ${SRC}
  WHERE ${col} IS NOT NULL
  GROUP BY CAST(${col} AS VARCHAR)
  ORDER BY cnt DESC, value ASC
  LIMIT ${TOP_K}
)
SELECT
  a.distinct_count AS distinct_count,
  a.total AS total,
  a.nulls AS nulls,
  t.value AS value,
  t.cnt AS cnt
FROM __cs_agg a
LEFT JOIN __cs_top t ON TRUE
ORDER BY t.cnt DESC NULLS LAST, t.value ASC NULLS LAST`;
  return { kind: "categorical", sql };
}

// ─── Coercion (DuckDB returns BIGINT for counts, DOUBLE for stats) ────────────

function toNum(value: unknown): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function toNumOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// ─── Row shaping ──────────────────────────────────────────────────────────────

function shapeNumeric(rows: Record<string, unknown>[]): NumericColumnStats {
  const first = rows[0] ?? {};
  const min = toNumOrNull(first.mn);
  const max = toNumOrNull(first.mx);
  const avg = toNumOrNull(first.av);
  const distinct = toNum(first.distinct_count);
  const total = toNum(first.total);
  const nulls = toNum(first.nulls);

  const bins: NumericBin[] = [];
  if (min !== null && max !== null) {
    if (max === min) {
      // Single-value range: one bar, everything non-null falls here.
      bins.push({ lo: min, hi: max, count: total - nulls });
    } else {
      const counts = new Array<number>(NUM_BINS).fill(0);
      for (const row of rows) {
        const bin = toNum(row.bin);
        if (bin >= 0 && bin < NUM_BINS) counts[bin] = toNum(row.cnt);
      }
      const width = (max - min) / NUM_BINS;
      for (let i = 0; i < NUM_BINS; i += 1) {
        bins.push({ lo: min + i * width, hi: min + (i + 1) * width, count: counts[i] });
      }
    }
  }

  return { kind: "numeric", min, max, avg, distinct, nulls, total, bins };
}

function shapeCategorical(rows: Record<string, unknown>[]): CategoricalColumnStats {
  const first = rows[0] ?? {};
  const distinct = toNum(first.distinct_count);
  const total = toNum(first.total);
  const nulls = toNum(first.nulls);

  const top: Array<{ value: string; count: number }> = [];
  for (const row of rows) {
    if (row.value === null || row.value === undefined) continue;
    top.push({ value: String(row.value), count: toNum(row.cnt) });
  }

  return { kind: "categorical", distinct, nulls, total, top };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch one column's profile in a single read-only scan. `baseSql` is the
 * statement that yields the table (lineage WITH-chain or `SELECT * FROM
 * "view"`). Throws the DuckDB error message on failure so the caller can show
 * it verbatim.
 */
export async function fetchColumnStats(baseSql: string, column: ColumnInfo): Promise<ColumnStats> {
  const { kind, sql } = buildColumnStatsSQL(baseSql, column);
  let rows: Record<string, unknown>[];
  try {
    rows = await runReadOnlyQuery(sql);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error));
  }
  return kind === "numeric" ? shapeNumeric(rows) : shapeCategorical(rows);
}
