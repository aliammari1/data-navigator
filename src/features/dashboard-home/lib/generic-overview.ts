"use client";

/**
 * Generic dataset overview data layer.
 *
 * Provides a real, DuckDB-backed KPI overview for ANY registered dataset
 * (telecom or not). All numbers come from `SUMMARIZE` + a handful of grouped
 * aggregates run natively in the Electron main process — no mock data, no
 * client-side row materialization.
 *
 * The home screen routes telecom datasets to the rich telecom overview and
 * everything else here, so an offline user with an arbitrary CSV/Parquet
 * dataset still gets a meaningful landing page.
 */

import { qc } from "@/features/telecom/lib/sql";
import { runReadOnlyQuery, summarizeRegisteredDataset } from "@/platform/duckdb/duckdb";

// ─── Types ────────────────────────────────────────────────────────────────────

export type GenericColumnRole = "numeric" | "temporal" | "categorical" | "other";

export interface GenericColumnSummary {
  name: string;
  /** Raw DuckDB column type, e.g. "BIGINT", "VARCHAR", "TIMESTAMP". */
  type: string;
  role: GenericColumnRole;
  /** Approximate number of distinct values (HyperLogLog from SUMMARIZE). */
  approxUnique: number;
  /** Percentage of NULL values, 0..100. */
  nullPercentage: number;
  min: string | null;
  max: string | null;
  /** Mean for numeric columns. */
  avg: number | null;
  /** Standard deviation for numeric columns. */
  std: number | null;
}

export interface CategoryCount {
  label: string;
  count: number;
}

export interface NumericBucket {
  /** Inclusive lower bound of the bucket. */
  start: number;
  /** Exclusive upper bound of the bucket. */
  end: number;
  count: number;
}

export interface GenericOverview {
  rowCount: number;
  columnCount: number;
  numericColumnCount: number;
  temporalColumnCount: number;
  categoricalColumnCount: number;
  /** Average null percentage across all columns, 0..100. */
  avgNullPercentage: number;
  /** Total number of cells (rows × columns) that are NULL. */
  totalNullCells: number;
  columns: GenericColumnSummary[];
  /** Top-N value distribution for the most informative categorical column. */
  topCategorical: {
    column: string;
    values: CategoryCount[];
  } | null;
  /** Histogram for the first usable numeric column. */
  numericHistogram: {
    column: string;
    buckets: NumericBucket[];
  } | null;
}

// ─── Internals ─────────────────────────────────────────────────────────────────

const NUMERIC_TYPE_RE =
  /^(TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|DECIMAL|NUMERIC|REAL|FLOAT|DOUBLE)/i;
const TEMPORAL_TYPE_RE = /^(DATE|TIME|TIMESTAMP)/i;
const STRING_TYPE_RE = /^(VARCHAR|CHAR|TEXT|STRING|BLOB|UUID)/i;

function classifyType(duckType: string): GenericColumnRole {
  const t = duckType.trim().toUpperCase();
  if (NUMERIC_TYPE_RE.test(t)) return "numeric";
  if (TEMPORAL_TYPE_RE.test(t)) return "temporal";
  if (STRING_TYPE_RE.test(t)) return "categorical";
  return "other";
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "bigint" ? Number(value) : Number(value);
  return Number.isFinite(n) ? n : null;
}

function toStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

/**
 * A categorical column is "informative" for a bar chart when it has more than
 * one distinct value but not so many that every row is unique (an id column).
 * Score favours moderate cardinality; ids and constants are pushed to the back.
 */
function categoricalScore(col: GenericColumnSummary, rowCount: number): number {
  if (col.role !== "categorical") return -1;
  if (col.approxUnique <= 1) return -1;
  const uniqueRatio = rowCount > 0 ? col.approxUnique / rowCount : 1;
  // Penalise near-unique (id-like) columns and very high cardinality.
  if (uniqueRatio > 0.9) return -1;
  if (col.approxUnique > 200) return 0.1;
  // Sweet spot: a handful to a few dozen categories.
  return 1 / (1 + Math.abs(col.approxUnique - 8));
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Build a generic, dataset-agnostic overview from a single SUMMARIZE round-trip
 * plus (at most) two small grouped aggregates for the auto-selected charts.
 */
export async function buildGenericOverview(
  datasetId: string,
  viewName: string,
  rowCount: number,
): Promise<GenericOverview> {
  // 1 round-trip: SUMMARIZE returns per-column stats natively.
  const summary = await summarizeRegisteredDataset({ datasetId });

  const columns: GenericColumnSummary[] = summary.map((row) => {
    const type = String(row.column_type ?? row.type ?? "");
    return {
      name: String(row.column_name ?? row.name ?? ""),
      type,
      role: classifyType(type),
      approxUnique: toNumberOrNull(row.approx_unique) ?? 0,
      nullPercentage: toNumberOrNull(row.null_percentage) ?? 0,
      min: toStringOrNull(row.min),
      max: toStringOrNull(row.max),
      avg: toNumberOrNull(row.avg),
      std: toNumberOrNull(row.std),
    };
  });

  const numericColumns = columns.filter((c) => c.role === "numeric");
  const temporalColumns = columns.filter((c) => c.role === "temporal");
  const categoricalColumns = columns.filter((c) => c.role === "categorical");

  const avgNullPercentage =
    columns.length > 0 ? columns.reduce((sum, c) => sum + c.nullPercentage, 0) / columns.length : 0;
  const totalNullCells = Math.round(
    columns.reduce((sum, c) => sum + (c.nullPercentage / 100) * rowCount, 0),
  );

  // Pick the most informative categorical column for a bar chart.
  const bestCategorical = categoricalColumns
    .map((c) => ({ col: c, score: categoricalScore(c, rowCount) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.col;

  // Pick the first numeric column with real spread for a histogram.
  const bestNumeric = numericColumns.find(
    (c) =>
      c.min !== null &&
      c.max !== null &&
      Number(c.min) !== Number(c.max) &&
      Number.isFinite(Number(c.min)) &&
      Number.isFinite(Number(c.max)),
  );

  const [topCategorical, numericHistogram] = await Promise.all([
    bestCategorical ? fetchTopCategorical(viewName, bestCategorical.name) : Promise.resolve(null),
    bestNumeric
      ? fetchNumericHistogram(
          viewName,
          bestNumeric.name,
          Number(bestNumeric.min),
          Number(bestNumeric.max),
        )
      : Promise.resolve(null),
  ]);

  return {
    rowCount,
    columnCount: columns.length,
    numericColumnCount: numericColumns.length,
    temporalColumnCount: temporalColumns.length,
    categoricalColumnCount: categoricalColumns.length,
    avgNullPercentage,
    totalNullCells,
    columns,
    topCategorical,
    numericHistogram,
  };
}

/** Top-N value distribution for a categorical column (1 round-trip). */
async function fetchTopCategorical(
  viewName: string,
  column: string,
): Promise<GenericOverview["topCategorical"]> {
  const col = qc(column);
  const rows = await runReadOnlyQuery(`
    SELECT ${col} AS label, COUNT(*) AS cnt
    FROM ${qc(viewName)}
    WHERE ${col} IS NOT NULL
    GROUP BY 1
    ORDER BY cnt DESC
    LIMIT 12
  `);

  const values: CategoryCount[] = rows.map((r) => ({
    label: String(r.label ?? "—"),
    count: toNumberOrNull(r.cnt) ?? 0,
  }));

  if (values.length === 0) return null;
  return { column, values };
}

/**
 * Equal-width histogram for a numeric column computed entirely in DuckDB
 * (1 round-trip). Bucket boundaries are derived from the SUMMARIZE min/max so
 * the renderer never scans the column itself.
 */
async function fetchNumericHistogram(
  viewName: string,
  column: string,
  min: number,
  max: number,
): Promise<GenericOverview["numericHistogram"]> {
  const BUCKETS = 16;
  const span = max - min;
  if (!Number.isFinite(span) || span <= 0) return null;
  const width = span / BUCKETS;

  const col = qc(column);
  // FLOOR((v - min) / width) bucketizes server-side; clamp the top edge into
  // the last bucket so max values are counted.
  const rows = await runReadOnlyQuery(`
    SELECT
      LEAST(
        CAST(FLOOR((CAST(${col} AS DOUBLE) - ${min}) / ${width}) AS INTEGER),
        ${BUCKETS - 1}
      ) AS bucket,
      COUNT(*) AS cnt
    FROM ${qc(viewName)}
    WHERE ${col} IS NOT NULL
    GROUP BY 1
    ORDER BY 1
  `);

  const counts = new Map<number, number>();
  for (const r of rows) {
    const b = toNumberOrNull(r.bucket);
    if (b === null) continue;
    counts.set(b, toNumberOrNull(r.cnt) ?? 0);
  }

  const buckets: NumericBucket[] = [];
  for (let i = 0; i < BUCKETS; i++) {
    buckets.push({
      start: min + i * width,
      end: min + (i + 1) * width,
      count: counts.get(i) ?? 0,
    });
  }

  if (buckets.every((b) => b.count === 0)) return null;
  return { column, buckets };
}
