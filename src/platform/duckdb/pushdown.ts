/**
 * DuckDB SQL pushdown query builders.
 *
 * Pure, side-effect-free SQL string builders (no DuckDB import) usable from
 * either the renderer (constructing SQL passed to `runReadOnlyQuery` /
 * `runReadOnlyQueryArrow`) or the Electron main process.
 *
 * Goal (architecture §2, brief §1.3–§1.4): collapse the per-column query fan-out
 * and `OFFSET` deep-paging that dominate load time into single-scan pushdown
 * queries — `SUMMARIZE`, `histogram()`, `approx_count_distinct`,
 * `approx_quantile`, `corr()` crosstab, `quantile_cont`, `USING SAMPLE
 * reservoir(n)` — plus keyset/seek pagination and an invariant cached `COUNT(*)`.
 *
 * Every builder uses these guarantees:
 * - Identifiers are quoted with {@link quoteIdent} (doubles embedded `"`).
 * - String literals are quoted with {@link quoteLiteral} (doubles embedded `'`).
 * - No `INSTALL`/`LOAD` — all functions below are DuckDB core built-ins, so the
 *   offline constraint holds (no community `arrow`/extension fetch).
 */

// ─── Quoting (shared with the main-process service) ───────────────────────────

/** Quote a SQL identifier (table/view/column). Doubles embedded double-quotes. */
export function quoteIdent(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

/** Quote a SQL string literal. Doubles embedded single-quotes. */
export function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/** A source is either a registered view/table name or a parenthesized subquery. */
export interface SqlSource {
  /** View / table identifier, e.g. `"ds_abc123"`. Quoted internally. */
  view: string;
}

function sourceSql(source: SqlSource | string): string {
  const view = typeof source === "string" ? source : source.view;
  return quoteIdent(view);
}

/**
 * Whole-dataset profile in a single scan. `SUMMARIZE` is itself a table source
 * (DuckDB ≥0.10), so we project the columns we want. `approx_unique` and the
 * quantiles are approximate (HyperLogLog / T-Digest) — that is the point: cheap.
 *
 * Optional `where` filters the *input* relation before summarizing.
 */
export function buildSummarizeSQL(source: SqlSource | string, where?: string): string {
  const from = sourceSql(source);
  const filtered = where?.trim() ? `SELECT * FROM ${from} WHERE ${where}` : `SELECT * FROM ${from}`;

  return `
    SELECT
      column_name,
      column_type,
      min,
      max,
      approx_unique,
      avg,
      std,
      q25,
      q50,
      q75,
      count,
      null_percentage
    FROM (SUMMARIZE ${filtered})
  `.trim();
}

// ─── Per-column detail: ONE scan per *selected* column (§1.3) ──────────────────

/**
 * Approximate top-K most frequent values (Filtered Space-Saving). Returns a
 * single row with a LIST column `top_values`.
 */
export function buildApproxTopKSQL(source: SqlSource | string, column: string, k = 10): string {
  const safeK = Math.max(1, Math.trunc(k));
  return `
    SELECT approx_top_k(${quoteIdent(column)}, ${safeK}) AS top_values
    FROM ${sourceSql(source)}
  `.trim();
}

/** Approximate distinct cardinality (HyperLogLog) — cheap vs exact COUNT(DISTINCT). */
export function buildApproxCountDistinctSQL(source: SqlSource | string, column: string): string {
  return `
    SELECT approx_count_distinct(${quoteIdent(column)}) AS distinct_approx
    FROM ${sourceSql(source)}
  `.trim();
}

/**
 * Equi-width histogram via the DuckDB ≥1.1 **table macro** (the only form that
 * accepts `bin_count`). Returns rows of `(bin, count)`.
 *
 * PITFALL guarded here: `histogram(col, bin_count := N)` as an *aggregate* is
 * invalid; `bin_count` exists only on `FROM histogram(tbl, col, bin_count := N)`.
 */
export function buildHistogramTableSQL(
  source: SqlSource | string,
  column: string,
  binCount = 20,
  technique: "auto" | "equi-width" | "sample" = "auto",
): string {
  const view = typeof source === "string" ? source : source.view;
  const safeBins = Math.max(1, Math.trunc(binCount));
  return `
    FROM histogram(${quoteIdent(view)}, ${quoteIdent(column)},
      bin_count := ${safeBins}, technique := ${quoteLiteral(technique)})
  `.trim();
}

/**
 * Histogram AGGREGATE form — returns a single MAP(bucket -> count) row. Use this
 * inside a `SELECT`; use {@link buildHistogramTableSQL} when you need explicit
 * `bin_count`. Pass explicit upper `boundaries` for fixed buckets.
 */
export function buildHistogramAggregateSQL(
  source: SqlSource | string,
  column: string,
  boundaries?: number[],
): string {
  const col = quoteIdent(column);
  const arg = boundaries?.length ? `${col}, [${boundaries.map((b) => String(b)).join(", ")}]` : col;
  return `
    SELECT histogram(${arg}) AS buckets
    FROM ${sourceSql(source)}
  `.trim();
}

// ─── Quantiles & shape (§1.3) ─────────────────────────────────────────────────

/** Approximate quantile(s) (T-Digest). `q` may be a single fraction or a list. */
export function buildApproxQuantileSQL(
  source: SqlSource | string,
  column: string,
  q: number | number[] = 0.5,
): string {
  const arg = Array.isArray(q) ? `[${q.map((v) => String(v)).join(", ")}]` : String(q);
  return `
    SELECT approx_quantile(${quoteIdent(column)}, ${arg}) AS approx_quantile
    FROM ${sourceSql(source)}
  `.trim();
}

/**
 * Exact quantile(s) via `quantile_cont` (forces a sort). Only emit when
 * exactness is explicitly requested — otherwise prefer
 * {@link buildApproxQuantileSQL}.
 */
export function buildQuantileContSQL(
  source: SqlSource | string,
  column: string,
  q: number | number[] = 0.5,
): string {
  const arg = Array.isArray(q) ? `[${q.map((v) => String(v)).join(", ")}]` : String(q);
  return `
    SELECT quantile_cont(${quoteIdent(column)}, ${arg}) AS quantile
    FROM ${sourceSql(source)}
  `.trim();
}

/** Distribution shape: bias-corrected skewness + excess (Fisher) kurtosis. */
export function buildShapeSQL(source: SqlSource | string, column: string): string {
  const col = quoteIdent(column);
  return `
    SELECT skewness(${col}) AS skewness, kurtosis(${col}) AS kurtosis
    FROM ${sourceSql(source)}
  `.trim();
}

// ─── Correlation crosstab: ONE query for the upper triangle (§1.3) ────────────

/**
 * Build a single `corr()` query over the upper triangle of `columns`. Returns
 * one row whose aliases are `r__<a>__<b>` for each pair (a < b). This replaces
 * the O(cols²) per-column JS zip that misaligns after NULL filtering.
 *
 * The result also carries a `pairs` array (computed here) describing each alias
 * so the caller can rebuild the matrix without re-deriving column order.
 */
export interface CorrelationCrosstab {
  sql: string;
  pairs: Array<{ alias: string; a: string; b: string }>;
}

export function buildCorrelationCrosstabSQL(
  source: SqlSource | string,
  columns: string[],
): CorrelationCrosstab {
  const pairs: CorrelationCrosstab["pairs"] = [];
  const exprs: string[] = [];

  for (let i = 0; i < columns.length; i += 1) {
    for (let j = i + 1; j < columns.length; j += 1) {
      const a = columns[i];
      const b = columns[j];
      const alias = `r__${i}__${j}`;
      pairs.push({ alias, a, b });
      exprs.push(`corr(${quoteIdent(a)}, ${quoteIdent(b)}) AS ${quoteIdent(alias)}`);
    }
  }

  // No pairs (0 or 1 numeric column) → a valid no-op SELECT.
  const projection = exprs.length > 0 ? exprs.join(",\n      ") : "1 AS noop";

  return {
    sql: `
    SELECT
      ${projection}
    FROM ${sourceSql(source)}
  `.trim(),
    pairs,
  };
}

// ─── Unbiased sampling: reservoir, never LIMIT (§1.3) ─────────────────────────

/**
 * Reservoir sample of `n` rows (unbiased). Pass `seed` for a deterministic
 * `REPEATABLE` sample. Never use `LIMIT n` to sample for statistics — it takes
 * the first N physical rows (biased on sorted/clustered data).
 */
export function buildReservoirSampleSQL(
  source: SqlSource | string,
  n: number,
  options?: { columns?: string[]; seed?: number; where?: string },
): string {
  const safeN = Math.max(1, Math.trunc(n));
  const cols = options?.columns?.length ? options.columns.map(quoteIdent).join(", ") : "*";
  const where = options?.where?.trim() ? ` WHERE ${options.where}` : "";
  const repeatable =
    typeof options?.seed === "number" ? ` REPEATABLE (${Math.trunc(options.seed)})` : "";

  return `
    SELECT ${cols}
    FROM ${sourceSql(source)}${where}
    USING SAMPLE reservoir(${safeN} ROWS)${repeatable}
  `.trim();
}

// ─── Cached COUNT(*) — invariant across page/sort (§1.4) ──────────────────────

/**
 * `COUNT(*)` for a (view, where) pair. Invariant across page and sort, so the
 * caller should cache it keyed by `(view, normalizedWhere)` and run it in
 * parallel with the page query — not before it, and not per page.
 */
export function buildCountSQL(source: SqlSource | string, where?: string): string {
  const filter = where?.trim() ? ` WHERE ${where}` : "";
  return `SELECT count(*) AS total FROM ${sourceSql(source)}${filter}`;
}

/** Stable cache key for a cached COUNT(*). */
export function countCacheKey(view: string, where?: string): string {
  return `${view}::${(where ?? "").trim()}`;
}

// ─── Keyset / seek pagination — replace LIMIT n OFFSET (§1.4) ──────────────────

type SortDirection = "ASC" | "DESC";

interface KeysetSortKey {
  /** Column to sort by (quoted internally). */
  column: string;
  direction?: SortDirection;
}

interface KeysetCursor {
  /**
   * Last-seen values for each sort key, in the SAME order as `sortKeys`.
   * The trailing tiebreaker `rowid` value (number) is supplied separately.
   */
  sortValues: unknown[];
  /** Last-seen `rowid` tiebreaker (stable, monotonic within a scan). */
  rowid: number;
}

export interface KeysetPageInput {
  source: SqlSource | string;
  /** Ordered sort keys; a stable `rowid` tiebreaker is always appended. */
  sortKeys: KeysetSortKey[];
  /** Page size (number of rows). */
  limit: number;
  /** Optional pre-filter applied before ordering. */
  where?: string;
  /** Cursor from the previous page; omit for the first page. */
  cursor?: KeysetCursor;
  /** Projected columns; defaults to `*`. `rowid` is always added. */
  columns?: string[];
}

export interface KeysetPageQuery {
  sql: string;
  /**
   * Positional parameter values, in `$1..$n` order: the keyset predicate's
   * sortValues (one per progressively-nested clause) plus the rowid. Empty for
   * the first page.
   */
  params: unknown[];
}

/**
 * Build a forward keyset/seek page. O(window) regardless of page depth (unlike
 * `OFFSET`, which materializes `n + offset` rows and OOMs on deep pages).
 *
 * The seek predicate is the standard lexicographic row-comparison expanded into
 * an OR-of-AND form so it works across mixed ASC/DESC keys, with `rowid` as the
 * final strict tiebreaker. Parameters are positional (`$1..$n`) so values are
 * never string-interpolated.
 *
 * Example (single ASC key `ts`):
 *   WHERE ("ts" > $1) OR ("ts" = $1 AND rowid > $2)
 *   ORDER BY "ts" ASC, rowid ASC LIMIT 100
 */
export function buildKeysetPageSQL(input: KeysetPageInput): KeysetPageQuery {
  const from = sourceSql(input.source);
  const limit = Math.max(1, Math.trunc(input.limit));
  const projection = input.columns?.length
    ? `${input.columns.map(quoteIdent).join(", ")}, rowid`
    : "*, rowid";

  // ORDER BY: declared keys (with direction) then the rowid tiebreaker. The
  // tiebreaker direction follows the strict comparator used in the predicate.
  const orderParts = input.sortKeys.map((k) => `${quoteIdent(k.column)} ${k.direction ?? "ASC"}`);
  orderParts.push("rowid ASC");
  const orderBy = orderParts.join(", ");

  const filters: string[] = [];
  if (input.where?.trim()) {
    filters.push(`(${input.where})`);
  }

  const params: unknown[] = [];

  if (input.cursor) {
    const { sortValues, rowid } = input.cursor;

    // Lexicographic OR-of-AND seek across all sort keys + rowid tiebreaker.
    // Clause k: keys[0..k-1] equal AND key[k] strictly past the cursor.
    // Final clause: all keys equal AND rowid strictly greater.
    const orClauses: string[] = [];
    const keyCount = input.sortKeys.length;

    for (let k = 0; k < keyCount; k += 1) {
      const ands: string[] = [];
      for (let i = 0; i < k; i += 1) {
        params.push(sortValues[i]);
        ands.push(`${quoteIdent(input.sortKeys[i].column)} = $${params.length}`);
      }
      params.push(sortValues[k]);
      const strict = (input.sortKeys[k].direction ?? "ASC") === "ASC" ? ">" : "<";
      ands.push(`${quoteIdent(input.sortKeys[k].column)} ${strict} $${params.length}`);
      orClauses.push(`(${ands.join(" AND ")})`);
    }

    // All-equal + rowid tiebreaker clause.
    const tieAnds: string[] = [];
    for (let i = 0; i < keyCount; i += 1) {
      params.push(sortValues[i]);
      tieAnds.push(`${quoteIdent(input.sortKeys[i].column)} = $${params.length}`);
    }
    params.push(rowid);
    tieAnds.push(`rowid > $${params.length}`);
    orClauses.push(`(${tieAnds.join(" AND ")})`);

    filters.push(`(${orClauses.join(" OR ")})`);
  }

  const whereSql = filters.length > 0 ? `\n    WHERE ${filters.join(" AND ")}` : "";

  const sql = `
    SELECT ${projection}
    FROM ${from}${whereSql}
    ORDER BY ${orderBy}
    LIMIT ${limit}
  `.trim();

  return { sql, params };
}

/**
 * Rare "jump to page N" fallback — OFFSET path. Use ONLY for explicit page jumps;
 * the default pagination path is {@link buildKeysetPageSQL}.
 */
export function buildOffsetPageSQL(
  source: SqlSource | string,
  limit: number,
  offset: number,
  options?: { columns?: string[]; where?: string; orderBy?: string },
): string {
  const projection = options?.columns?.length ? options.columns.map(quoteIdent).join(", ") : "*";
  const where = options?.where?.trim() ? `\n    WHERE ${options.where}` : "";
  const orderBy = options?.orderBy?.trim() ? `\n    ORDER BY ${options.orderBy}` : "";
  return `
    SELECT ${projection}
    FROM ${sourceSql(source)}${where}${orderBy}
    LIMIT ${Math.max(0, Math.trunc(limit))}
    OFFSET ${Math.max(0, Math.trunc(offset))}
  `.trim();
}
