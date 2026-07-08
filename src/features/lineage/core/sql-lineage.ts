// ─── SQL → column lineage (node-sql-parser AST, worker-safe) ──────────────────
//
// The v2 plan calls for REAL SQL→AST column lineage via `node-sql-parser`
// (run inside the lineage worker) instead of the old `slice(0, 40)`
// name-equality matching. Both `node-sql-parser` (5.4.0) and `elkjs` ARE
// installed in this workspace (verified against node_modules), so the AST path
// is wired here.
//
// `parseProjectionLineage` walks the top-level SELECT projection list of a real
// `transformSql`/`DataTransform.sql` string and maps each output column to the
// source column(s) it reads, carrying the real transform expression
// (e.g. `SUM(amount)`), following aliases and expressions the old name-equality
// matching silently dropped.
//
// It is intentionally conservative: it returns `null` when it cannot
// confidently parse (e.g. `SELECT *`, set operations, CTEs, DuckDB-specific
// syntax the postgres dialect rejects) so the caller falls back to
// name-equality matching instead of emitting wrong lineage.
//
// node-sql-parser is imported from the SINGLE-DIALECT `build/postgresql` entry
// (~150 KB, the closest dialect to DuckDB) — NOT the ~750 KB all-dialects root.

import { Parser } from "node-sql-parser/build/postgresql";

export interface ProjectionLineage {
  /** target (output) column name */
  targetCol: string;
  /** source column names this projection reads, in order of appearance */
  sourceCols: string[];
  /** the projection expression when it is not a bare column reference */
  transform?: string;
}

const parser = new Parser();
const PARSE_OPTS = { database: "postgresql" as const };

// ─── AST node shapes (the subset we walk) ─────────────────────────────────────
// node-sql-parser's AST is loosely typed; we narrow only the fields we read.

interface ColumnRefAst {
  type: "column_ref";
  table?: string | null;
  column: string | { expr?: { value?: string }; value?: string };
}

type ExprAst = ColumnRefAst | { type: string; [key: string]: unknown } | null | undefined;

interface ProjectionAst {
  expr?: ExprAst;
  as?: string | null;
}

interface SelectAst {
  type?: string;
  columns?: ProjectionAst[] | "*";
  with?: unknown;
  // set operations expose `_next` / `set_op`
  set_op?: string | null;
  _next?: unknown;
}

/** Read a column name out of node-sql-parser's nested `column` field. */
function columnName(column: ColumnRefAst["column"]): string | null {
  if (typeof column === "string") return column;
  if (column && typeof column === "object") {
    // v5 nests as { expr: { type: "default", value: "b" } } or { value: "b" }
    const nested = column.expr?.value ?? column.value;
    if (typeof nested === "string") return nested;
  }
  return null;
}

/**
 * Recursively collect every `column_ref` name referenced anywhere inside an
 * expression sub-tree (function args, CASE branches, binary expressions, …).
 */
function collectSourceCols(expr: ExprAst, into: string[], seen: Set<string>) {
  if (!expr || typeof expr !== "object") return;
  const node = expr as { type?: string; [key: string]: unknown };

  if (node.type === "column_ref") {
    const name = columnName((node as unknown as ColumnRefAst).column);
    if (name && name !== "*" && !seen.has(name)) {
      seen.add(name);
      into.push(name);
    }
    return;
  }

  // Walk every own value that could hold nested expressions.
  for (const key of Object.keys(node)) {
    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) collectSourceCols(item as ExprAst, into, seen);
    } else if (value && typeof value === "object") {
      collectSourceCols(value as ExprAst, into, seen);
    }
  }
}

/** Render a stable transform label for a non-trivial projection expression. */
function exprTransformLabel(expr: ExprAst): string | undefined {
  if (!expr || typeof expr !== "object") return undefined;
  const node = expr as { type?: string };
  if (node.type === "column_ref") return undefined; // bare passthrough
  // Re-stringify the single projection expression back to SQL for display.
  // `exprToSQL` is typed `(ast: any, opt?) => string`, so the loose AST passes.
  try {
    const sql = parser.exprToSQL(expr, PARSE_OPTS);
    if (typeof sql === "string" && sql.trim()) return sql.trim();
  } catch {
    // exprToSQL is best-effort; fall through to the coarse type label.
  }
  return typeof node.type === "string" ? node.type : undefined;
}

/**
 * Parse the top-level SELECT projection list of a SQL statement into per-column
 * lineage via node-sql-parser. Returns `null` when the projection cannot be
 * confidently parsed so the caller can fall back to name-equality matching.
 */
export function parseProjectionLineage(rawSql: string): ProjectionLineage[] | null {
  if (!rawSql?.trim()) return null;

  let ast: SelectAst | SelectAst[];
  try {
    const parsed = parser.astify(rawSql, PARSE_OPTS);
    ast = parsed as SelectAst | SelectAst[];
  } catch {
    // DuckDB-specific syntax (QUALIFY, list/struct types, PIVOT) may not parse
    // under the postgres dialect — degrade gracefully to name-equality.
    return null;
  }

  // Take the first statement only; bail on multi-statement input.
  const stmt = Array.isArray(ast) ? ast[0] : ast;
  if (stmt?.type !== "select") return null;

  // CTEs / set operations → can't confidently attribute columns to the parent.
  if (stmt.with || stmt.set_op || stmt._next) return null;

  const columns = stmt.columns;
  if (!columns || columns === "*" || !Array.isArray(columns)) return null;

  const result: ProjectionLineage[] = [];
  for (const proj of columns) {
    if (!proj || typeof proj !== "object") continue;
    const expr = proj.expr;
    // `SELECT *` / `SELECT t.*` projection → no per-column attribution.
    if (expr && typeof expr === "object" && (expr as { type?: string }).type === "star") {
      return null;
    }
    if (
      expr &&
      typeof expr === "object" &&
      (expr as { type?: string; column?: unknown }).type === "column_ref" &&
      columnName((expr as ColumnRefAst).column) === "*"
    ) {
      return null;
    }

    const sourceCols: string[] = [];
    collectSourceCols(expr, sourceCols, new Set<string>());

    const isBareColumn =
      expr && typeof expr === "object" && (expr as { type?: string }).type === "column_ref";

    let targetCol: string | null = null;
    if (proj.as) {
      targetCol = proj.as;
    } else if (isBareColumn) {
      targetCol = columnName((expr as ColumnRefAst).column);
    } else {
      // Expression with no alias and not a bare column → no stable output name.
      continue;
    }
    if (!targetCol) continue;

    result.push({
      targetCol,
      sourceCols,
      transform: isBareColumn ? undefined : exprTransformLabel(expr),
    });
  }

  return result.length > 0 ? result : null;
}
