import { safeNum } from "@/features/telecom/lib/format";
import type { ColumnRoles } from "./columns";
import { quoteIdent } from "./columns";

/**
 * SQL builders for Analytics Theater scenes.
 *
 * Every scene pushes its aggregation down to DuckDB so the renderer only ever
 * receives a few hundred aggregated rows, never the full table — the theater
 * stays light even on multi-million-row datasets.
 *
 * Each builder returns `null` when the dataset lacks the columns the scene
 * needs, letting the scene render an explicit empty state instead of fake data.
 */

export interface SceneSql {
  sql: string;
  /** Human-readable note about which columns drive the scene. */
  note: string;
}

const MAX_CATEGORIES = 12;

function dateExpr(col: string): string {
  // Works for native DATE/TIMESTAMP and ISO/`YYYY-MM-DD` strings alike.
  return `TRY_CAST(${quoteIdent(col)} AS DATE)`;
}

/** Calendar heatmap: daily aggregated measure across the dataset's date range. */
export function buildCalendarSql(view: string, roles: ColumnRoles): SceneSql | null {
  if (!roles.date) return null;
  const d = dateExpr(roles.date.name);
  const measure = roles.measure ? `SUM(${quoteIdent(roles.measure.name)})` : "COUNT(*)";
  return {
    sql: `SELECT ${d} AS d, ${measure} AS v
FROM ${quoteIdent(view)}
WHERE ${d} IS NOT NULL
GROUP BY 1
ORDER BY 1`,
    note: roles.measure
      ? `Daily SUM(${roles.measure.name}) by ${roles.date.name}`
      : `Daily row count by ${roles.date.name}`,
  };
}

/**
 * Channel race: per-day measure for the top categories, suitable for an
 * animated cumulative ranking. One row per (date, category).
 */
export function buildRaceSql(view: string, roles: ColumnRoles): SceneSql | null {
  if (!roles.date || !roles.category) return null;
  const d = dateExpr(roles.date.name);
  const cat = quoteIdent(roles.category.name);
  const measure = roles.measure ? `SUM(${quoteIdent(roles.measure.name)})` : "COUNT(*)";
  // Restrict to the overall top-N categories so the bar race stays readable.
  return {
    sql: `WITH ranked AS (
  SELECT ${cat} AS cat, ${measure} AS total
  FROM ${quoteIdent(view)}
  WHERE ${cat} IS NOT NULL
  GROUP BY 1
  ORDER BY total DESC
  LIMIT ${MAX_CATEGORIES}
)
SELECT ${d} AS d, ${cat} AS cat, ${measure} AS v
FROM ${quoteIdent(view)}
WHERE ${d} IS NOT NULL AND ${cat} IN (SELECT cat FROM ranked)
GROUP BY 1, 2
ORDER BY 1, 2`,
    note: `${roles.measure ? `SUM(${roles.measure.name})` : "count"} per day for top ${MAX_CATEGORIES} ${roles.category.name}`,
  };
}

/** Sankey flow: category → category2 measure totals. */
export function buildSankeySql(view: string, roles: ColumnRoles): SceneSql | null {
  if (!roles.category || !roles.category2) return null;
  const a = quoteIdent(roles.category.name);
  const b = quoteIdent(roles.category2.name);
  const measure = roles.measure ? `SUM(${quoteIdent(roles.measure.name)})` : "COUNT(*)";
  return {
    sql: `SELECT ${a} AS src, ${b} AS tgt, ${measure} AS v
FROM ${quoteIdent(view)}
WHERE ${a} IS NOT NULL AND ${b} IS NOT NULL
GROUP BY 1, 2
HAVING ${measure} > 0
ORDER BY v DESC
LIMIT 200`,
    note: `${roles.category.name} → ${roles.category2.name} (${roles.measure ? `SUM(${roles.measure.name})` : "count"})`,
  };
}

/**
 * Gantt / activity heat: measure per (category, hour-of-day). Requires a
 * timestamp-bearing date column; degrades gracefully if no hour is present.
 */
export function buildGanttSql(view: string, roles: ColumnRoles): SceneSql | null {
  if (!roles.date || !roles.category) return null;
  const cat = quoteIdent(roles.category.name);
  const ts = `TRY_CAST(${quoteIdent(roles.date.name)} AS TIMESTAMP)`;
  const measure = roles.measure ? `SUM(${quoteIdent(roles.measure.name)})` : "COUNT(*)";
  return {
    sql: `WITH top_cat AS (
  SELECT ${cat} AS cat, ${measure} AS total
  FROM ${quoteIdent(view)}
  WHERE ${cat} IS NOT NULL
  GROUP BY 1 ORDER BY total DESC LIMIT 10
)
SELECT ${cat} AS cat, EXTRACT(HOUR FROM ${ts}) AS hour, ${measure} AS v
FROM ${quoteIdent(view)}
WHERE ${cat} IN (SELECT cat FROM top_cat) AND ${ts} IS NOT NULL
GROUP BY 1, 2
ORDER BY 1, 2`,
    note: `Hourly ${roles.measure ? `SUM(${roles.measure.name})` : "count"} by ${roles.category.name}`,
  };
}

/**
 * Word frequencies: tokenize a free-text column with DuckDB's
 * regexp_split_to_table and count tokens, stop-words filtered, top 80.
 */
export function buildWordCloudSql(view: string, roles: ColumnRoles): SceneSql | null {
  if (!roles.text) return null;
  const col = quoteIdent(roles.text.name);
  return {
    sql: `WITH tokens AS (
  SELECT lower(trim(regexp_replace(t, '[^a-zA-Z0-9À-ÿ]', '', 'g'))) AS word
  FROM ${quoteIdent(view)},
  UNNEST(regexp_split_to_array(CAST(${col} AS VARCHAR), '\\s+')) AS u(t)
  WHERE ${col} IS NOT NULL
)
SELECT word, COUNT(*) AS count
FROM tokens
WHERE length(word) >= 3
  AND word NOT IN ('the','and','for','with','that','this','from','was','are','has','have','not','les','des','une','pour','avec','dans','sur','par','est','que','qui')
GROUP BY 1
ORDER BY count DESC
LIMIT 80`,
    note: `Token frequencies of ${roles.text.name}`,
  };
}

/** Sunburst: two-level hierarchy category → category2 with measure totals. */
export function buildSunburstSql(view: string, roles: ColumnRoles): SceneSql | null {
  if (!roles.category) return null;
  const a = quoteIdent(roles.category.name);
  const measure = roles.measure ? `SUM(${quoteIdent(roles.measure.name)})` : "COUNT(*)";
  if (roles.category2) {
    const b = quoteIdent(roles.category2.name);
    return {
      sql: `SELECT ${a} AS l1, ${b} AS l2, ${measure} AS v
FROM ${quoteIdent(view)}
WHERE ${a} IS NOT NULL
GROUP BY 1, 2
HAVING ${measure} > 0
ORDER BY v DESC
LIMIT 200`,
      note: `${roles.category.name} → ${roles.category2.name}`,
    };
  }
  return {
    sql: `SELECT ${a} AS l1, NULL AS l2, ${measure} AS v
FROM ${quoteIdent(view)}
WHERE ${a} IS NOT NULL
GROUP BY 1
HAVING ${measure} > 0
ORDER BY v DESC
LIMIT 60`,
    note: `${roles.category.name}`,
  };
}

// ─── Result coercion helpers ──────────────────────────────────────────────────

/** Coerce a DuckDB cell to a trimmed string. */
export function asStr(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

/** Coerce a DuckDB cell to a finite number (unwraps typed arrays / BigInt). */
export function asNum(v: unknown): number {
  return safeNum(v);
}
