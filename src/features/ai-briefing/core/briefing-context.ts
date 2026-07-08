/**
 * Real-data briefing context.
 *
 * Replaces the old hard-coded `SAMPLE_DATA` constant. The briefing context is
 * assembled from the user's active dataset by pushing all aggregation down into
 * DuckDB — raw rows are never materialised in JS, so this stays cheap even on
 * 100k+ row datasets. It degrades gracefully when there are zero numeric columns
 * (it still summarises categorical structure).
 */

import type { ColMeta, Dataset } from "@/core/stores/data-store";
import { runReadOnlyQuery } from "@/platform/duckdb/duckdb";
import { buildHistogramTableSQL, buildReservoirSampleSQL } from "@/platform/duckdb/pushdown";
import { DEFAULT_SEED } from "@/platform/viz/seeded-rng";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NumericColumnStat {
  name: string;
  mean: number;
  std: number;
  min: number;
  max: number;
  q1: number;
  q3: number;
  nullPct: number;
}

export interface CategoryBreakdown {
  dimension: string;
  values: { label: string; count: number; pct: number }[];
}

export interface BriefingContext {
  datasetId: string;
  datasetName: string;
  tableName: string;
  rowCount: number;
  numericCols: NumericColumnStat[];
  topCategory: CategoryBreakdown | null;
  generatedAt: string;
}

// ─── Identifier / value safety ────────────────────────────────────────────────

/** Quote a DuckDB identifier, escaping embedded double quotes. */
function quoteIdent(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function toFiniteNumber(value: unknown): number {
  const n = typeof value === "bigint" ? Number(value) : Number(value);
  return Number.isFinite(n) ? n : 0;
}

// ─── Context assembly ─────────────────────────────────────────────────────────

const MAX_NUMERIC_COLS = 12;
const MAX_CATEGORY_VALUES = 6;

/**
 * Build a briefing context from a registered dataset using SQL pushdown.
 *
 * `table` is the dataset's DuckDB view name; `cols` is the column metadata from
 * the data store (used for typing and null-rate context).
 */
export async function buildBriefingContext(
  dataset: Pick<Dataset, "id" | "name" | "viewName" | "tableName" | "columns" | "rowCount">,
): Promise<BriefingContext> {
  const table = dataset.viewName || dataset.tableName;
  const cols = dataset.columns;
  const quotedTable = quoteIdent(table);

  const numericCols = cols.filter((c) => c.type === "number").slice(0, MAX_NUMERIC_COLS);

  // ── Row count + per-numeric-column aggregates in ONE query (no raw rows) ──
  const aggSelects = numericCols
    .map((c) => {
      const id = quoteIdent(c.name);
      const alias = c.name.replaceAll('"', "");
      return [
        `avg(${id}) AS ${quoteIdent(`${alias}__mean`)}`,
        `stddev_samp(${id}) AS ${quoteIdent(`${alias}__std`)}`,
        `min(${id}) AS ${quoteIdent(`${alias}__min`)}`,
        `max(${id}) AS ${quoteIdent(`${alias}__max`)}`,
        `quantile_cont(${id}, 0.25) AS ${quoteIdent(`${alias}__q1`)}`,
        `quantile_cont(${id}, 0.75) AS ${quoteIdent(`${alias}__q3`)}`,
        `count(*) FILTER (WHERE ${id} IS NULL) AS ${quoteIdent(`${alias}__nulls`)}`,
      ].join(", ");
    })
    .join(", ");

  const aggSql = `SELECT count(*) AS __n${aggSelects ? `, ${aggSelects}` : ""} FROM ${quotedTable}`;
  const [aggRow] = await runReadOnlyQuery(aggSql);
  const rowCount = toFiniteNumber(aggRow?.__n ?? dataset.rowCount);

  const numericStats: NumericColumnStat[] = numericCols.map((c) => {
    const alias = c.name.replaceAll('"', "");
    const nulls = toFiniteNumber(aggRow?.[`${alias}__nulls`]);
    return {
      name: c.name,
      mean: toFiniteNumber(aggRow?.[`${alias}__mean`]),
      std: toFiniteNumber(aggRow?.[`${alias}__std`]),
      min: toFiniteNumber(aggRow?.[`${alias}__min`]),
      max: toFiniteNumber(aggRow?.[`${alias}__max`]),
      q1: toFiniteNumber(aggRow?.[`${alias}__q1`]),
      q3: toFiniteNumber(aggRow?.[`${alias}__q3`]),
      nullPct: rowCount > 0 ? (nulls / rowCount) * 100 : 0,
    };
  });

  // ── Top categorical dimension (pick the most "useful" string column) ──
  const topCategory = await buildTopCategory(quotedTable, cols, rowCount);

  return {
    datasetId: dataset.id,
    datasetName: dataset.name,
    tableName: table,
    rowCount,
    numericCols: numericStats,
    topCategory,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Choose a categorical column with a reasonable cardinality and summarise its
 * top values via SQL `GROUP BY`. Returns null when no suitable column exists.
 */
async function buildTopCategory(
  quotedTable: string,
  cols: ColMeta[],
  rowCount: number,
): Promise<CategoryBreakdown | null> {
  // Prefer string columns with low-to-moderate cardinality (good for grouping).
  const candidates = cols
    .filter((c) => c.type === "string")
    .sort((a, b) => (a.distinctCount || Infinity) - (b.distinctCount || Infinity));

  for (const col of candidates) {
    const id = quoteIdent(col.name);
    try {
      const rows = await runReadOnlyQuery(
        `SELECT ${id} AS label, count(*) AS cnt FROM ${quotedTable} ` +
          `WHERE ${id} IS NOT NULL GROUP BY ${id} ORDER BY cnt DESC LIMIT ${MAX_CATEGORY_VALUES}`,
      );
      if (rows.length >= 2) {
        return {
          dimension: col.name,
          values: rows.map((r) => {
            const count = toFiniteNumber(r.cnt);
            return {
              label: String(r.label ?? "—"),
              count,
              pct: rowCount > 0 ? (count / rowCount) * 100 : 0,
            };
          }),
        };
      }
    } catch {
      // Try the next candidate column.
    }
  }

  return null;
}

/**
 * Pull only the outlier rows for a numeric column (z-score threshold pushed into
 * SQL) so the JS layer never sees the full column. Used by the anomaly tab.
 */
export async function fetchColumnOutliers(
  tableName: string,
  columnName: string,
  mean: number,
  std: number,
  threshold = 3,
  limit = 50,
): Promise<number[]> {
  if (!Number.isFinite(std) || std <= 0) return [];
  const id = quoteIdent(columnName);
  const rows = await runReadOnlyQuery(
    `SELECT ${id} AS v FROM ${quoteIdent(tableName)} ` +
      `WHERE ${id} IS NOT NULL AND abs((${id} - ${mean}) / ${std}) > ${threshold} ` +
      `ORDER BY abs((${id} - ${mean}) / ${std}) DESC LIMIT ${Math.floor(limit)}`,
  );
  return rows.map((r) => toFiniteNumber(r.v)).filter((v) => Number.isFinite(v));
}

/**
 * Fetch a *seeded* reservoir sample of a numeric column. The sample is what we
 * feed to the seeded analysis worker (`detectAnomalies` / `gesdAnomalies`), so
 * the heavy stats run off the main thread on a bounded, deterministic input —
 * never on the full column and never with `Math.random`.
 */
export async function fetchColumnSample(
  tableName: string,
  columnName: string,
  limit = 4000,
  seed: number = DEFAULT_SEED,
): Promise<number[]> {
  const sql = buildReservoirSampleSQL(tableName, limit, {
    columns: [columnName],
    seed,
    where: `${quoteIdent(columnName)} IS NOT NULL`,
  });
  const rows = await runReadOnlyQuery(sql);
  return rows
    .map((r) => toFiniteNumber(r[columnName] ?? Object.values(r)[0]))
    .filter((v) => Number.isFinite(v));
}

export interface HistogramBin {
  label: string;
  count: number;
}

/**
 * Equi-width histogram for a numeric column, computed entirely in DuckDB via the
 * `histogram` table function (no raw rows in JS). Used to render a real
 * distribution chart in the briefing instead of a fabricated one.
 */
export async function fetchColumnHistogram(
  tableName: string,
  columnName: string,
  binCount = 24,
): Promise<HistogramBin[]> {
  try {
    const sql = buildHistogramTableSQL(tableName, columnName, binCount, "equi-width");
    // DuckDB's `histogram` table function yields { bin: string, count: number }.
    const rows = await runReadOnlyQuery(sql);
    return rows
      .map((r) => ({
        label: String(r.bin ?? ""),
        count: toFiniteNumber(r.count),
      }))
      .filter((b) => b.label !== "");
  } catch {
    return [];
  }
}
