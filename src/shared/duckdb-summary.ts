/**
 * Shared, pure coercion helpers for DuckDB `SUMMARIZE` output.
 *
 * DuckDB emits SUMMARIZE fields with version- and type-dependent shapes: numbers
 * may arrive as `bigint` (large COUNT/approx_unique), and `null_percentage` may
 * be a plain number (`12.5`) or a `%`-suffixed string (`"12.5%"`). These two
 * helpers were copy-pasted across `parsed-data` (canonical), `data-import`, and
 * `agent-canvas`; this module is the single source of truth.
 *
 * Kept dependency-free so it can run on the main thread or inside a Web Worker.
 */

/**
 * Coerce an unknown SUMMARIZE field to a finite number, or `undefined` when it is
 * nullish or not finite. `Number()` natively handles `bigint`, so large
 * COUNT/approx_unique values round-trip correctly.
 */
export function numberOrUndefined(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

/**
 * Parse a DuckDB `null_percentage` field into a 0..1 null rate.
 *
 * Accepts a number (`12.5`) or a string with a trailing `%` (`"12.5%"`),
 * tolerates surrounding whitespace, and clamps the result to 0..1. Returns 0 for
 * nullish or unparseable input.
 */
export function nullRateFromSummary(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const numeric = Number(String(value).replace("%", "").trim());
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(1, Math.max(0, numeric / 100));
}
