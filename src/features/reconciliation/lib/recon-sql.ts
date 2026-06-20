/**
 * Reconciliation diff SQL builder.
 *
 * The reconciliation diff is fundamentally a SQL problem: a single DuckDB
 * `FULL OUTER JOIN` between two registered dataset views, with COALESCE'd keys,
 * per-measure variance columns, and a classified `diff_status`. Pushing the
 * whole diff into DuckDB replaces the legacy O(n*m) JS `.map(...).find(...)`
 * loop that ran on the renderer main thread and silently dropped ADDED/REMOVED
 * rows.
 *
 * All identifiers are quoted/escaped before interpolation. Only column/view
 * names that come from the DuckDB catalog (`listRegisteredDatasets`) are used,
 * never free user text.
 */

export type DiffStatus = "ADDED" | "REMOVED" | "CHANGED" | "UNCHANGED";

export interface KeyMapping {
  /** Column name in the expected (left) view. */
  expected: string;
  /** Column name in the actual (right) view. */
  actual: string;
}

export interface MeasureMapping {
  /** Stable, SQL-safe slug used to name the generated columns. */
  label: string;
  /** Numeric column in the expected (left) view. */
  expected: string;
  /** Numeric column in the actual (right) view. */
  actual: string;
}

export interface DiffConfig {
  /** DuckDB view name for the "expected" dataset. */
  expectedView: string;
  /** DuckDB view name for the "actual" dataset. */
  actualView: string;
  /** One or more join keys (composite keys supported). */
  keyCols: KeyMapping[];
  /** One or more numeric measures to diff. */
  measures: MeasureMapping[];
}

/** Quote a SQL identifier, escaping embedded double quotes. */
export function quoteIdent(id: string): string {
  return `"${id.replaceAll('"', '""')}"`;
}

/**
 * Turn an arbitrary header into a SQL-safe, collision-resistant slug used to
 * name the generated `exp_*` / `act_*` / `var_*` / `varpct_*` columns.
 */
export function slugifyMeasure(label: string): string {
  const base = label
    .normalize("NFKD")
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  return base.length > 0 ? base : "m";
}

/** Column name DuckDB will emit for a measure's expected value. */
export const expColName = (label: string) => `exp_${label}`;
export const actColName = (label: string) => `act_${label}`;
export const varColName = (label: string) => `var_${label}`;
export const varPctColName = (label: string) => `varpct_${label}`;
/** Column name DuckDB will emit for a coalesced join key. */
export const keyColName = (index: number) => `key_${index}`;

/**
 * Build the row-level diff SELECT. One row per distinct composite key, with
 * COALESCE'd keys, per-measure expected/actual/variance/variance%, and a
 * classified `diff_status`. `ORDER BY` is intentionally omitted here so callers
 * can wrap this in a view and page/sort cheaply.
 */
export function buildDiffSQL(cfg: DiffConfig): string {
  if (cfg.keyCols.length === 0) {
    throw new Error("buildDiffSQL: at least one key mapping is required.");
  }
  if (cfg.measures.length === 0) {
    throw new Error("buildDiffSQL: at least one measure mapping is required.");
  }

  const on = cfg.keyCols
    .map((k) => `e.${quoteIdent(k.expected)} = a.${quoteIdent(k.actual)}`)
    .join(" AND ");

  const keySelect = cfg.keyCols
    .map(
      (k, i) =>
        `CAST(COALESCE(e.${quoteIdent(k.expected)}, a.${quoteIdent(
          k.actual,
        )}) AS VARCHAR) AS ${quoteIdent(keyColName(i))}`,
    )
    .join(",\n  ");

  const measureCols = cfg.measures
    .flatMap((m) => {
      const E = `TRY_CAST(e.${quoteIdent(m.expected)} AS DOUBLE)`;
      const A = `TRY_CAST(a.${quoteIdent(m.actual)} AS DOUBLE)`;
      return [
        `${E} AS ${quoteIdent(expColName(m.label))}`,
        `${A} AS ${quoteIdent(actColName(m.label))}`,
        `COALESCE(${A}, 0) - COALESCE(${E}, 0) AS ${quoteIdent(varColName(m.label))}`,
        `CASE WHEN ${E} IS NULL OR ${E} = 0 THEN NULL ` +
          `ELSE (COALESCE(${A}, 0) - ${E}) * 100.0 / ${E} END AS ${quoteIdent(
            varPctColName(m.label),
          )}`,
      ];
    })
    .join(",\n  ");

  // A row is CHANGED when any mapped measure differs (NULL-safe).
  const changed = cfg.measures
    .map(
      (m) =>
        `TRY_CAST(e.${quoteIdent(m.expected)} AS DOUBLE) IS DISTINCT FROM ` +
        `TRY_CAST(a.${quoteIdent(m.actual)} AS DOUBLE)`,
    )
    .join(" OR ");

  const allKeysExpNull = cfg.keyCols
    .map((k) => `e.${quoteIdent(k.expected)} IS NULL`)
    .join(" AND ");
  const allKeysActNull = cfg.keyCols.map((k) => `a.${quoteIdent(k.actual)} IS NULL`).join(" AND ");

  return `SELECT
  ${keySelect},
  ${measureCols},
  CASE
    WHEN ${allKeysExpNull} THEN 'ADDED'
    WHEN ${allKeysActNull} THEN 'REMOVED'
    WHEN ${changed}        THEN 'CHANGED'
    ELSE 'UNCHANGED'
  END AS diff_status
FROM ${quoteIdent(cfg.expectedView)} e
FULL OUTER JOIN ${quoteIdent(cfg.actualView)} a ON ${on}`;
}

/**
 * Aggregate rollup over the diff. Computes status counts plus expected/actual
 * sums and variance sums per measure in a single pass. `tolerancePct` drives the
 * flat-threshold material-row count (distribution-aware materiality is layered
 * on top in the client from the variance distribution).
 */
export function buildSummarySQL(cfg: DiffConfig, tolerancePct: number): string {
  const diff = buildDiffSQL(cfg);
  const primaryPct = quoteIdent(varPctColName(cfg.measures[0].label));

  const measureAggregates = cfg.measures
    .flatMap((m) => [
      `SUM(${quoteIdent(expColName(m.label))}) AS ${quoteIdent(`sum_exp_${m.label}`)}`,
      `SUM(${quoteIdent(actColName(m.label))}) AS ${quoteIdent(`sum_act_${m.label}`)}`,
      `SUM(${quoteIdent(varColName(m.label))}) AS ${quoteIdent(`sum_var_${m.label}`)}`,
    ])
    .join(",\n  ");

  return `WITH recon_diff AS (
${diff}
)
SELECT
  COUNT(*)                                                  AS rows_total,
  COUNT(*) FILTER (WHERE diff_status = 'CHANGED')           AS rows_changed,
  COUNT(*) FILTER (WHERE diff_status = 'ADDED')             AS rows_added,
  COUNT(*) FILTER (WHERE diff_status = 'REMOVED')           AS rows_removed,
  COUNT(*) FILTER (WHERE diff_status = 'UNCHANGED')         AS rows_unchanged,
  COUNT(*) FILTER (WHERE ABS(${primaryPct}) > ${Number(tolerancePct)}) AS rows_material,
  ${measureAggregates}
FROM recon_diff`;
}

/**
 * One page of diff rows, ordered so material/changed rows surface first and
 * largest absolute variance leads. Wrapped in a CTE so paging stays cheap and
 * the full result set is never materialized in React state.
 */
export function buildPageSQL(
  cfg: DiffConfig,
  opts: { limit: number; offset: number; onlyChanged?: boolean },
): string {
  const diff = buildDiffSQL(cfg);
  const primaryVar = quoteIdent(varColName(cfg.measures[0].label));
  const where = opts.onlyChanged ? "WHERE diff_status <> 'UNCHANGED'" : "";
  return `WITH recon_diff AS (
${diff}
)
SELECT * FROM recon_diff
${where}
ORDER BY
  CASE diff_status
    WHEN 'CHANGED' THEN 0
    WHEN 'ADDED'   THEN 1
    WHEN 'REMOVED' THEN 2
    ELSE 3
  END,
  ABS(COALESCE(${primaryVar}, 0)) DESC
LIMIT ${Math.max(0, Math.floor(opts.limit))} OFFSET ${Math.max(0, Math.floor(opts.offset))}`;
}

/**
 * Top-N most material changed rows for LLM hypothesis generation. Caps work so
 * a 100k-row diff never triggers 100k inference calls.
 */
export function buildMaterialRowsSQL(cfg: DiffConfig, limit: number): string {
  const diff = buildDiffSQL(cfg);
  const primaryVar = quoteIdent(varColName(cfg.measures[0].label));
  return `WITH recon_diff AS (
${diff}
)
SELECT * FROM recon_diff
WHERE diff_status <> 'UNCHANGED'
ORDER BY ABS(COALESCE(${primaryVar}, 0)) DESC
LIMIT ${Math.max(0, Math.floor(limit))}`;
}

/**
 * Unwrap a DuckDB scalar (which may arrive as BigInt or a typed array for
 * aggregates) into a plain finite number. Mirrors the telecom `safeNum` helper.
 */
export function toNum(v: unknown): number {
  let val: unknown = v;
  if (ArrayBuffer.isView(val) && !(val instanceof DataView)) {
    val = (val as unknown as ArrayLike<unknown>)[0];
  }
  if (val === null || val === undefined) return 0;
  const n = typeof val === "bigint" ? Number(val) : Number(val);
  return Number.isFinite(n) ? n : 0;
}

/** Unwrap a nullable DuckDB numeric scalar, preserving null (for variance%). */
export function toNullableNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = toNum(v);
  return Number.isFinite(n) ? n : null;
}
