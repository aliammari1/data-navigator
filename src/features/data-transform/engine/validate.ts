/**
 * Offline SQL validation via node-sql-parser (PostgreSQL single-dialect build).
 *
 * This is the LOCAL, network-free lint surface the plan calls for (§3.1): today
 * invalid SQL is only caught by a DuckDB round-trip. We parse generated and
 * user-typed SQL into an AST *before* execution so the Configure / SQL tabs can
 * surface inline errors offline.
 *
 * Import notes (from impl-briefs/lineage-sql.md §3):
 *  - Use the SINGLE-dialect build `node-sql-parser/build/postgresql` (~150 KB)
 *    rather than the root (~750 KB all-dialects).
 *  - PostgreSQL is the closest match to DuckDB syntax. DuckDB-specific syntax
 *    (PIVOT, QUALIFY, list/struct types) may not parse → treat every result as
 *    BEST-EFFORT: a parse failure is surfaced as a soft warning, never a hard
 *    block (DuckDB itself remains the source of truth at run time).
 *
 * Pure JS, no wasm/assets/network. Intended to run inside the transform worker
 * (see ../workers/transform.worker.ts), never on the main thread.
 */

import { Parser } from "node-sql-parser/build/postgresql";

const parser = new Parser();
const PARSE_OPTS = { database: "postgresql" } as const;

export interface SqlValidation {
  ok: boolean;
  /** Single-line error message when `ok` is false. */
  error?: string;
  /** True when the fragment uses DuckDB-only syntax the PG parser can't read. */
  bestEffort?: boolean;
}

/** Heuristic: fragments the PostgreSQL grammar cannot represent but DuckDB can. */
const DUCKDB_ONLY = /\b(PIVOT|UNPIVOT|QUALIFY|SUMMARIZE)\b|::\s*STRUCT|\[\s*\d/i;

/**
 * Validate a complete SQL statement (e.g. the compiled pipeline CTE). Wraps
 * `parser.astify` in try/catch — a throw means a syntax error we can surface
 * offline; DuckDB-only constructs are flagged `bestEffort` and treated as OK.
 */
export function validateSql(sql: string): SqlValidation {
  const trimmed = sql.trim();
  if (!trimmed) return { ok: true };
  if (DUCKDB_ONLY.test(trimmed)) return { ok: true, bestEffort: true };
  try {
    parser.astify(trimmed, PARSE_OPTS);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: oneLine(err) };
  }
}

/**
 * Validate a free-form WHERE / SELECT-list / expression FRAGMENT by wrapping it
 * in a minimal SELECT so the parser has a complete statement to chew on. Used to
 * pre-flight per-step config (filter condition, derive expression, aggregation)
 * before the step is enabled.
 */
export function validateFragment(
  fragment: string,
  kind: "where" | "projection" | "groupby",
): SqlValidation {
  const f = fragment.trim();
  if (!f) return { ok: true };
  if (DUCKDB_ONLY.test(f)) return { ok: true, bestEffort: true };
  const probe =
    kind === "where"
      ? `SELECT * FROM t WHERE ${f}`
      : kind === "groupby"
        ? `SELECT ${f} FROM t GROUP BY ${f}`
        : `SELECT ${f} FROM t`;
  try {
    parser.astify(probe, PARSE_OPTS);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: oneLine(err) };
  }
}

function oneLine(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.replace(/\s+/g, " ").slice(0, 200);
}
