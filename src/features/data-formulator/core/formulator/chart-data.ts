/**
 * Formulator chart-data core — pure resolution logic behind the chart canvas
 * hook (components/formulator2/use-chart-data.ts). Three jobs:
 *
 *   1. resolveAutoChartType — the "auto" heuristic: temporal x → line,
 *      raw numeric x/y (no aggregation) → scatter, else bar.
 *   2. shelfToChartSpec — compile shelf state into the deterministic
 *      ChartSpec consumed by buildSQL / chart-options (chart specs are never
 *      AI-generated — DF law #1).
 *   3. aggregateRowsInMemory — the python-lane twin of buildSQL (core/sql.ts):
 *      same grouping, AggregateFn, sort and limit semantics, and the SAME
 *      output aliases (x_val / y_val / color_val / size_val) so
 *      chart-options.ts renders both lanes identically.
 *
 * Keep this file dependency-light: pure functions over core types only.
 */

import type { AggregateFn, ChartSpec, ChartType, ColumnInfo, Encoding, FilterDef } from "../types";
import type { Row } from "./model";

// ─── Shelf shape (structural, so the core never imports the store) ───────────

export interface ShelfStateLike {
  chartType: ChartType | "auto";
  encodings: Encoding[];
  /** Optional — pre-filter chart data before aggregation. */
  filters?: FilterDef[];
}

/** Row cap for chart queries — DF-style "enough to plot, never the table". */
export const CHART_ROW_LIMIT = 500;

// ─── 1. Auto chart-type heuristic ─────────────────────────────────────────────

/**
 * Resolve `chartType: "auto"` from the bound encodings + column dtypes:
 * temporal x → line; raw numeric x AND y (aggregate none) → scatter; else bar.
 */
export function resolveAutoChartType(shelf: ShelfStateLike, columns: ColumnInfo[]): ChartType {
  const typeByName = new Map(columns.map((c) => [c.name, c.type]));
  const xEnc = shelf.encodings.find((e) => e.channel === "x" && e.field);
  const yEnc = shelf.encodings.find((e) => e.channel === "y" && e.field);
  const xType = xEnc ? typeByName.get(xEnc.field) : undefined;
  const yType = yEnc ? typeByName.get(yEnc.field) : undefined;

  if (xType === "date") return "line";

  const isRaw = (e: Encoding | undefined) => !e?.aggregate || e.aggregate === "none";
  if (xType === "number" && yType === "number" && isRaw(xEnc) && isRaw(yEnc)) {
    return "scatter";
  }

  return "bar";
}

// ─── 2. Shelf → ChartSpec ─────────────────────────────────────────────────────

/** Compile the encoding shelf into the deterministic ChartSpec lane. */
export function shelfToChartSpec(shelf: ShelfStateLike, resolvedType: ChartType): ChartSpec {
  const xEnc = shelf.encodings.find((e) => e.channel === "x" && e.field);
  const yEnc = shelf.encodings.find((e) => e.channel === "y" && e.field);
  const title =
    xEnc && yEnc ? `${yEnc.field} par ${xEnc.field}` : (yEnc?.field ?? xEnc?.field ?? "Graphique");
  return {
    id: "formulator2-chart",
    type: resolvedType,
    encodings: shelf.encodings.map((e) => ({ ...e })),
    filters: shelf.filters?.map((f) => ({ ...f })) ?? [],
    limit: CHART_ROW_LIMIT,
    title,
  };
}

// ─── 3. In-memory aggregation (python-lane twin of buildSQL) ─────────────────

/** TRY_CAST(x AS DOUBLE) equivalent: Number() coercion, NaN/NULL/'' → null. */
function coerceNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function coerceNumbers(values: unknown[]): number[] {
  const out: number[] = [];
  for (const v of values) {
    const n = coerceNumber(v);
    if (n !== null) out.push(n);
  }
  return out;
}

/** Exact median: middle value, or the mean of the two middles on even counts. */
function exactMedian(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Apply an AggregateFn over a group's raw values, mirroring buildAgg in
 * core/sql.ts: COUNT counts non-NULL, DISTINCT counts distinct non-NULL,
 * numeric aggregates run over TRY_CAST-style coerced numbers (empty → null).
 */
function applyAggregate(fn: AggregateFn | undefined, values: unknown[]): number | null {
  const agg = fn ?? "none";
  if (agg === "count") return values.filter((v) => v !== null && v !== undefined).length;
  if (agg === "distinct") {
    const seen = new Set<string>();
    for (const v of values) {
      if (v !== null && v !== undefined) seen.add(`${typeof v}:${String(v)}`);
    }
    return seen.size;
  }

  const nums = coerceNumbers(values);
  if (agg === "none") return nums.length > 0 ? nums[0] : null;
  if (nums.length === 0) return null;
  switch (agg) {
    case "sum":
      return nums.reduce((a, b) => a + b, 0);
    case "avg":
      return nums.reduce((a, b) => a + b, 0) / nums.length;
    case "min":
      return nums.reduce((a, b) => Math.min(a, b));
    case "max":
      return nums.reduce((a, b) => Math.max(a, b));
    case "median":
      return exactMedian(nums);
  }
}

/**
 * Python-lane WHERE clause: filter rows in memory with the same semantics as
 * buildWhereClause in core/sql.ts (numeric comparison when the filter value is
 * numeric, else string; IN/BETWEEN/LIKE/IS NULL/NOT NULL). Keeps the two lanes
 * at parity when filter pills are active on a derived (python) table.
 */
function applyFilters(rows: Row[], filters: FilterDef[] | undefined): Row[] {
  if (!filters?.length) return rows;
  return rows.filter((row) => filters.every((f) => matchesFilter(row[f.field], f)));
}

function matchesFilter(raw: unknown, f: FilterDef): boolean {
  if (f.op === "IS NULL") return raw === null || raw === undefined || raw === "";
  if (f.op === "NOT NULL") return !(raw === null || raw === undefined || raw === "");
  if (f.op === "IN") {
    const set = new Set(f.value.split(",").map((v) => v.trim()));
    return set.has(String(raw));
  }
  if (f.op === "BETWEEN") {
    const [a, b] = f.value.split(",").map((v) => Number(v.trim()));
    const n = coerceNumber(raw);
    return n !== null && n >= a && n <= b;
  }
  if (f.op === "LIKE") {
    // SQL LIKE → regex: % any run, _ single char; anchor to the whole string.
    const escaped = f.value.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = `^${escaped.replaceAll("%", ".*").replaceAll("_", ".")}$`;
    return new RegExp(pattern, "i").test(String(raw ?? ""));
  }
  const isNum = /^-?\d+(\.\d+)?$/.test(f.value.trim());
  if (isNum) {
    const n = coerceNumber(raw);
    if (n === null) return false;
    const t = Number(f.value.trim());
    switch (f.op) {
      case "=":
        return n === t;
      case "!=":
        return n !== t;
      case ">":
        return n > t;
      case "<":
        return n < t;
      case ">=":
        return n >= t;
      case "<=":
        return n <= t;
    }
  }
  const s = String(raw ?? "");
  const t = f.value;
  switch (f.op) {
    case "=":
      return s === t;
    case "!=":
      return s !== t;
    case ">":
      return s > t;
    case "<":
      return s < t;
    case ">=":
      return s >= t;
    case "<=":
      return s <= t;
    default:
      return true;
  }
}

/** SQL GROUP BY equality: NULLs group together, values group by type+text. */
function groupKeyPart(value: unknown): string {
  if (value === null || value === undefined) return "\u0000null";
  return `${typeof value}:${String(value)}`;
}

/** ORDER BY y_val with NULLS LAST in both directions (DuckDB default). */
function compareNullableNumbers(a: number | null, b: number | null, dir: 1 | -1): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return (a - b) * dir;
}

interface RowGroup {
  x: unknown;
  color: unknown;
  yValues: unknown[];
  sizeValues: unknown[];
}

/**
 * Python-lane equivalent of running buildSQL over DuckDB: group by x (and
 * color when bound), aggregate y/size, sort per the encodings, cap at
 * `topN ?? limit`. Output columns match buildSQL's aliases exactly so
 * chart-options.ts works identically for both lanes.
 */
export function aggregateRowsInMemory(rawRows: Row[], spec: ChartSpec): Row[] {
  const rows = applyFilters(rawRows, spec.filters);
  const xEnc = spec.encodings.find((e) => e.channel === "x");
  const yEnc = spec.encodings.find((e) => e.channel === "y");
  const colorEnc = spec.encodings.find((e) => e.channel === "color");
  const sizeEnc = spec.encodings.find((e) => e.channel === "size");

  // buildSQL's `SELECT * FROM t LIMIT n` fallback when nothing plottable is bound.
  if (!xEnc && !yEnc && !colorEnc && !sizeEnc) {
    return rows.slice(0, spec.limit);
  }

  const hasAgg = spec.encodings.some((e) => e.aggregate && e.aggregate !== "none");

  let out: Row[];
  if (hasAgg) {
    const groups = new Map<string, RowGroup>();
    for (const row of rows) {
      const x = xEnc ? row[xEnc.field] : undefined;
      const color = colorEnc ? row[colorEnc.field] : undefined;
      const key = `${groupKeyPart(x)}\u0000${groupKeyPart(color)}`;
      let group = groups.get(key);
      if (!group) {
        group = { x, color, yValues: [], sizeValues: [] };
        groups.set(key, group);
      }
      if (yEnc) group.yValues.push(row[yEnc.field]);
      if (sizeEnc) group.sizeValues.push(row[sizeEnc.field]);
    }
    out = [...groups.values()].map((group) => {
      const result: Row = {};
      if (xEnc) result.x_val = group.x;
      if (yEnc) result.y_val = applyAggregate(yEnc.aggregate, group.yValues);
      if (colorEnc) result.color_val = group.color;
      if (sizeEnc) result.size_val = applyAggregate(sizeEnc.aggregate, group.sizeValues);
      return result;
    });
  } else {
    out = rows.map((row) => {
      const result: Row = {};
      if (xEnc) result.x_val = row[xEnc.field];
      if (yEnc) result.y_val = coerceNumber(row[yEnc.field]);
      if (colorEnc) result.color_val = row[colorEnc.field];
      if (sizeEnc) result.size_val = coerceNumber(row[sizeEnc.field]);
      return result;
    });
  }

  // ORDER BY parity: an explicit sort wins; otherwise aggregated y sorts DESC.
  const sortEnc = spec.encodings.find((e) => e.sort && e.sort !== "none");
  if (yEnc && (sortEnc || hasAgg)) {
    const dir: 1 | -1 = sortEnc ? (sortEnc.sort === "desc" ? -1 : 1) : -1;
    out.sort((a, b) => compareNullableNumbers(coerceNumber(a.y_val), coerceNumber(b.y_val), dir));
  }

  return out.slice(0, spec.topN ?? spec.limit);
}
