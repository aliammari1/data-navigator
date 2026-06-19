/**
 * Transform pipeline SQL compiler.
 *
 * The renderer can only run read-only SQL: the Electron DuckDB service rejects
 * any statement that is not SELECT/WITH/SHOW/DESCRIBE/SUMMARIZE/EXPLAIN and
 * additionally blocks the CREATE/DROP/COPY/... keywords
 * (electron/duckdb-service.ts:assertReadOnlySql). The legacy screen pushed
 * `CREATE OR REPLACE TABLE step_x AS (...)` through that door, which now throws
 * "Unsafe SQL statement blocked." at runtime.
 *
 * The fix is to compile the whole pipeline into a SINGLE nested CTE
 * (`WITH s_1 AS (...), s_2 AS (...) SELECT * FROM s_n`). It:
 *   - passes the read-only guard (starts with WITH / SELECT),
 *   - materializes nothing (no orphaned `step_*` tables to leak),
 *   - lets DuckDB's optimizer fuse projection + predicate + limit across steps,
 *   - runs in ONE IPC round-trip instead of 2N.
 */

export type StepType =
  | "filter"
  | "select"
  | "rename"
  | "derive"
  | "aggregate"
  | "sort"
  | "deduplicate"
  | "limit"
  | "join"
  | "pivot";

export interface TransformStep {
  id: string;
  type: StepType;
  label: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

/**
 * Quote a SQL identifier (table / column / alias), escaping EVERY embedded
 * double-quote. The legacy code used `.replace('"', '""')`, which only escapes
 * the FIRST quote — a correctness/safety gap for names like `a"b"c`.
 */
export function quoteIdent(name: string): string {
  return `"${String(name).replaceAll('"', '""')}"`;
}

/**
 * Quote a SQL string literal, escaping every embedded single-quote.
 */
export function quoteString(value: string): string {
  return `'${String(value).replaceAll("'", "''")}'`;
}

/** Build `s_<id>` CTE names from the volatile step id. */
function cteName(id: string): string {
  // Step ids are app-generated (`s1`, `s<timestamp>`), but normalize defensively
  // so the CTE alias is always a safe bare identifier.
  return `s_${String(id).replace(/[^A-Za-z0-9_]/g, "_")}`;
}

/**
 * Compile a single step into a `SELECT ... FROM <source>` fragment.
 *
 * `source` is an already-quoted-or-bare relation reference (a CTE name or a
 * quoted base table). Free-form config fragments (conditions, expressions,
 * aggregations) are SQL the user typed and are passed through verbatim — they
 * are validated by DuckDB itself when the pipeline runs.
 */
export function stepToSQL(step: TransformStep, source: string): string {
  const c = step.config;
  switch (step.type) {
    case "filter":
      return `SELECT * FROM ${source} WHERE ${str(c.condition, "1=1")}`;
    case "select":
      return `SELECT ${str(c.columns, "*")} FROM ${source}`;
    case "rename":
    case "derive": {
      const alias = quoteIdent(str(c.alias, step.type === "rename" ? "new_col" : "derived"));
      return `SELECT *, ${str(c.expression, "1")} AS ${alias} FROM ${source}`;
    }
    case "aggregate": {
      const groupBy = str(c.groupBy, "").trim();
      const agg = str(c.agg, "COUNT(*) AS count");
      return groupBy
        ? `SELECT ${groupBy}, ${agg} FROM ${source} GROUP BY ${groupBy}`
        : `SELECT ${agg} FROM ${source}`;
    }
    case "sort": {
      const column = str(c.column, "").trim();
      if (!column) return `SELECT * FROM ${source}`;
      const dir = str(c.direction, "ASC").toUpperCase() === "DESC" ? "DESC" : "ASC";
      return `SELECT * FROM ${source} ORDER BY ${quoteIdent(column)} ${dir}`;
    }
    case "deduplicate":
      return `SELECT DISTINCT * FROM ${source}`;
    case "limit": {
      const n = Number(c.count);
      const count = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 1000;
      return `SELECT * FROM ${source} LIMIT ${count}`;
    }
    case "join": {
      // Inner/left/right/full join against another catalog table on key columns.
      const otherTable = str(c.table, "").trim();
      const leftKey = str(c.leftKey, "").trim();
      const rightKey = str(c.rightKey ?? c.leftKey, "").trim();
      if (!otherTable || !leftKey || !rightKey) {
        return `SELECT * FROM ${source}`;
      }
      const joinType =
        ({ inner: "INNER", left: "LEFT", right: "RIGHT", full: "FULL" } as const)[
          str(c.joinType, "left").toLowerCase()
        ] ?? "LEFT";
      return (
        `SELECT t1.*, t2.* FROM ${source} t1 ` +
        `${joinType} JOIN ${quoteIdent(otherTable)} t2 ` +
        `ON t1.${quoteIdent(leftKey)} = t2.${quoteIdent(rightKey)}`
      );
    }
    case "pivot": {
      // DuckDB-native PIVOT: rotate `onColumn` values into columns, aggregated.
      const onColumn = str(c.onColumn, "").trim();
      const usingAgg = str(c.usingAgg, "COUNT(*)").trim();
      const groupBy = str(c.groupBy, "").trim();
      if (!onColumn) return `SELECT * FROM ${source}`;
      const groupClause = groupBy ? ` GROUP BY ${groupBy}` : "";
      return (
        `SELECT * FROM (PIVOT ${source} ON ${quoteIdent(onColumn)} ` +
        `USING ${usingAgg}${groupClause})`
      );
    }
    default:
      return `SELECT * FROM ${source}`;
  }
}

function str(value: unknown, fallback: string): string {
  if (value === undefined || value === null) return fallback;
  const s = String(value);
  return s.length > 0 ? s : fallback;
}

export interface CompiledPipeline {
  /** Final SELECT (single nested CTE) used for preview / count / export. */
  sql: string;
  /** Per-enabled-step CTE names, in execution order. */
  stepCtes: { id: string; name: string }[];
  /** Whether any enabled step exists (else `sql` is a plain SELECT on source). */
  hasSteps: boolean;
}

/**
 * Compile the enabled steps into one nested-CTE SELECT over `sourceTable`.
 */
export function buildCTE(steps: TransformStep[], sourceTable: string): CompiledPipeline {
  const enabled = steps.filter((s) => s.enabled);
  const sourceRef = quoteIdent(sourceTable);
  if (enabled.length === 0) {
    return { sql: `SELECT * FROM ${sourceRef}`, stepCtes: [], hasSteps: false };
  }

  const ctes: string[] = [];
  const stepCtes: { id: string; name: string }[] = [];
  let current = sourceRef;
  for (const step of enabled) {
    const name = cteName(step.id);
    ctes.push(`${name} AS (\n  ${stepToSQL(step, current)}\n)`);
    stepCtes.push({ id: step.id, name });
    current = name;
  }

  return {
    sql: `WITH ${ctes.join(",\n")}\nSELECT * FROM ${current}`,
    stepCtes,
    hasSteps: true,
  };
}

/**
 * One UNION-ALL query that returns the row count of every step CTE plus the
 * source, so all per-step counts come back in a single IPC round-trip.
 *
 * Each `id` is emitted as a string literal; `name` references the CTE defined
 * by the shared WITH prefix.
 */
export function buildCountQuery(
  steps: TransformStep[],
  sourceTable: string,
  compiled: CompiledPipeline,
): string {
  const enabled = steps.filter((s) => s.enabled);
  if (enabled.length === 0) {
    return `SELECT '__source__' AS step_id, COUNT(*) AS n FROM ${quoteIdent(sourceTable)}`;
  }

  // Reuse the same WITH prefix, then UNION ALL counts off each CTE.
  const ctes: string[] = [];
  let current = quoteIdent(sourceTable);
  for (const step of enabled) {
    const name = cteName(step.id);
    ctes.push(`${name} AS (${stepToSQL(step, current)})`);
    current = name;
  }

  const selects = [
    `SELECT '__source__' AS step_id, COUNT(*) AS n FROM ${quoteIdent(sourceTable)}`,
    ...compiled.stepCtes.map(
      (c) => `SELECT ${quoteString(c.id)} AS step_id, COUNT(*) AS n FROM ${c.name}`,
    ),
  ];

  return `WITH ${ctes.join(",\n")}\n${selects.join("\nUNION ALL\n")}`;
}

/**
 * Human-readable, copy-pasteable SQL for the SQL tab.
 */
export function buildReadableSQL(
  steps: TransformStep[],
  sourceTable: string,
  sourceRowCount: number,
): string {
  const compiled = buildCTE(steps, sourceTable);
  const header =
    `-- Transform Pipeline\n` +
    `-- Source: ${sourceTable} (${sourceRowCount.toLocaleString()} rows)\n` +
    `-- Compiled to a single read-only nested CTE (no intermediate tables).\n\n`;
  return `${header + compiled.sql};\n`;
}
