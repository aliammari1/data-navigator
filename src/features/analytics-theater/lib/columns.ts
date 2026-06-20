import type { ColMeta, ColType, Dataset } from "@/core/stores/data-store";

/**
 * Column-role detection for Analytics Theater scenes.
 *
 * The theater binds generic, user-supplied datasets to chart scenes. Rather
 * than assume a fixed telecom schema, we introspect the active dataset's column
 * metadata (already populated by the DuckDB catalog) and pick the best column
 * for each role: a date axis, a numeric measure, a low-cardinality category and
 * a free-text column for word frequencies.
 */

export interface ColumnRoles {
  /** Best DATE/TIMESTAMP column for time-series scenes (calendar, race, gantt). */
  date: ColMeta | null;
  /** Primary numeric measure to aggregate (volume, amount, ...). */
  measure: ColMeta | null;
  /** Low-cardinality categorical column (channel, status, region, ...). */
  category: ColMeta | null;
  /** Secondary categorical column for hierarchies (sunburst, sankey). */
  category2: ColMeta | null;
  /** Free-text column suitable for word-frequency analysis. */
  text: ColMeta | null;
  /** All numeric columns, useful for fallbacks. */
  numeric: ColMeta[];
  /** All string columns, useful for fallbacks. */
  strings: ColMeta[];
}

function isType(col: ColMeta, ...types: ColType[]): boolean {
  return types.includes(col.type);
}

const DATE_NAME_HINT = /(date|day|time|timestamp|created|updated|period|month)/i;
const MEASURE_NAME_HINT =
  /(amount|amt|volume|vol|total|count|qty|quantity|value|revenue|montant|sum|price|cost)/i;
const CATEGORY_NAME_HINT =
  /(channel|category|categorie|type|status|statut|state|region|group|operator|merchant|name|code|country|pays)/i;
const TEXT_NAME_HINT =
  /(remark|remarque|comment|commentaire|note|message|description|reason|motif|label|libelle)/i;

/**
 * Pick a sensible default column for each scene role from a dataset's columns.
 *
 * Heuristics combine declared column type with name hints and cardinality so
 * the chosen columns make sense across arbitrary datasets without configuration.
 */
export function detectColumnRoles(dataset: Dataset | undefined): ColumnRoles {
  const empty: ColumnRoles = {
    date: null,
    measure: null,
    category: null,
    category2: null,
    text: null,
    numeric: [],
    strings: [],
  };
  if (!dataset || dataset.columns.length === 0) return empty;

  const cols = dataset.columns;
  const rowCount = Math.max(1, dataset.rowCount);

  const numeric = cols.filter((c) => isType(c, "number"));
  const strings = cols.filter((c) => isType(c, "string"));
  const dates = cols.filter((c) => isType(c, "date"));

  // ── Date ────────────────────────────────────────────────────────────────
  const date =
    dates.find((c) => DATE_NAME_HINT.test(c.name)) ??
    dates[0] ??
    // Some date columns arrive typed as string; fall back to name hint.
    strings.find((c) => DATE_NAME_HINT.test(c.name)) ??
    null;

  // ── Measure (numeric) ──────────────────────────────────────────────────
  // Prefer a named measure; otherwise the numeric column with the largest
  // distinct spread (least likely to be an id/flag), excluding obvious ids.
  const measureCandidates = numeric.filter((c) => !/^id$|_id$|index|idx/i.test(c.name));
  const measure =
    measureCandidates.find((c) => MEASURE_NAME_HINT.test(c.name)) ??
    measureCandidates[0] ??
    numeric[0] ??
    null;

  // ── Category (low cardinality string) ───────────────────────────────────
  const lowCardStrings = strings
    .filter((c) => c !== date)
    .map((c) => ({
      col: c,
      // distinctCount may be 0 when not yet profiled; treat 0 as unknown.
      ratio: c.distinctCount > 0 ? c.distinctCount / rowCount : 0.5,
    }))
    .filter(({ col, ratio }) => ratio < 0.5 || CATEGORY_NAME_HINT.test(col.name))
    .sort((a, b) => a.ratio - b.ratio);

  const category =
    strings.find((c) => c !== date && CATEGORY_NAME_HINT.test(c.name)) ??
    lowCardStrings[0]?.col ??
    strings.find((c) => c !== date) ??
    null;

  const category2 =
    lowCardStrings.map((x) => x.col).find((c) => c !== category) ??
    strings.find((c) => c !== date && c !== category) ??
    null;

  // ── Text (free text for word cloud) ─────────────────────────────────────
  const text =
    strings.find((c) => TEXT_NAME_HINT.test(c.name)) ??
    // Highest-cardinality string column = most likely free text.
    strings
      .filter((c) => c !== date)
      .slice()
      .sort((a, b) => b.distinctCount - a.distinctCount)[0] ??
    null;

  return { date, measure, category, category2, text, numeric, strings };
}

/** Quote a SQL identifier (column or view name) safely. */
export function quoteIdent(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}
