"use client";
/**
 * SQLAgent — generates a DuckDB SQL query for each WidgetSpec.
 * LLM-powered when available; heuristic fallback when not.
 */

import { runReadOnlyQuery } from "@/platform/duckdb/duckdb";
import { aiChat, aiReadySync } from "./ai-bridge";
import type { ChartType, DataSchema, WidgetSpec } from "./types";

// ─── SQL Helpers ──────────────────────────────────────────────────────────────

function qc(col: string) {
  return `"${col.replaceAll('"', '""')}"`;
}

function isNumericColumn(colName: string, schema: DataSchema): boolean {
  const col = schema.columns.find((c) => c.name === colName);
  if (!col) return false;
  return (
    col.semantic === "numeric" ||
    /^(INTEGER|BIGINT|SMALLINT|TINYINT|DECIMAL|NUMERIC|REAL|FLOAT|DOUBLE|INT|INT8|INT4|INT2|INT1)/i.test(
      col.duckType,
    )
  );
}

function safeAgg(
  metric: string,
  func: "SUM" | "AVG" | "MIN" | "MAX" | "COUNT",
  schema?: DataSchema,
) {
  if (!metric) return `${func}(*)`;
  if (schema && isNumericColumn(metric, schema)) {
    return `${func}(${qc(metric)})`;
  }
  return `${func}(TRY_CAST(${qc(metric)} AS DOUBLE))`;
}

/** Append LIMIT if not already present. */
export function addLimit(sql: string, limit = 100): string {
  const trimmed = sql.trim();
  const withoutSemi = trimmed.endsWith(";") ? trimmed.slice(0, -1) : trimmed;
  if (/\bLIMIT\s+\d+\s*$/i.test(withoutSemi)) {
    return sql;
  }
  if (trimmed.endsWith(";")) {
    return `${withoutSemi} LIMIT ${limit};`;
  }
  return `${trimmed} LIMIT ${limit}`;
}

/** Replace SELECT * with explicit column list (for chart queries). */
export function explicitColumns(sql: string, schema: DataSchema): string {
  if (!/SELECT\s+\*/i.test(sql)) return sql;
  const colList = schema.columns.map((c) => qc(c.name)).join(", ");
  return sql.replace(/SELECT\s+\*/i, `SELECT ${colList}`);
}

// ─── Heuristic SQL Templates ──────────────────────────────────────────────────

function heuristicSQL(spec: WidgetSpec, schema: DataSchema): string {
  const tbl = `"${schema.tableName}"`;
  const dim = spec.dimensions[0];
  const dim2 = spec.dimensions[1];
  const met = spec.metrics[0];
  const mets = spec.metrics.slice(0, 4);

  switch (spec.chartType as ChartType) {
    case "kpi-grid": {
      const parts: string[] = [`COUNT(*) AS total_records`];
      for (const m of mets) {
        const label = m.toLowerCase();
        parts.push(`ROUND(${safeAgg(m, "SUM", schema)},2) AS total_${label}`);
        parts.push(`ROUND(${safeAgg(m, "AVG", schema)},2) AS avg_${label}`);
        parts.push(`ROUND(${safeAgg(m, "MIN", schema)},2) AS min_${label}`);
        parts.push(`ROUND(${safeAgg(m, "MAX", schema)},2) AS max_${label}`);
      }
      return `SELECT ${parts.join(",\n  ")} FROM ${tbl}`;
    }

    case "bar":
    case "horizontal-bar": {
      if (!dim) return `SELECT * FROM ${tbl} LIMIT 20`;
      const agg = met ? `ROUND(${safeAgg(met, "SUM", schema)},2) AS value` : `COUNT(*) AS count`;
      return `SELECT CAST(${qc(dim)} AS VARCHAR) AS category, ${agg}
FROM ${tbl}
WHERE ${qc(dim)} IS NOT NULL
GROUP BY 1 ORDER BY 2 DESC LIMIT 20`;
    }

    case "stacked-bar":
    case "stacked-horizontal-bar": {
      if (!dim || !dim2) return heuristicSQL({ ...spec, chartType: "bar" }, schema);
      const agg = met ? `ROUND(${safeAgg(met, "SUM", schema)},2) AS value` : `COUNT(*) AS value`;
      return `SELECT CAST(${qc(dim)} AS VARCHAR) AS category,
  CAST(${qc(dim2)} AS VARCHAR) AS series, ${agg}
FROM ${tbl}
WHERE ${qc(dim)} IS NOT NULL AND ${qc(dim2)} IS NOT NULL
GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 120`;
    }

    case "line":
    case "area":
    case "multi-line": {
      if (!dim) return `SELECT * FROM ${tbl} LIMIT 30`;
      const isTime = schema.timeDims.includes(dim);
      const agg = met ? `ROUND(${safeAgg(met, "SUM", schema)},2) AS value` : `COUNT(*) AS value`;
      const cast = isTime
        ? `DATE_TRUNC('day', TRY_CAST(${qc(dim)} AS TIMESTAMP)) AS period`
        : `CAST(${qc(dim)} AS VARCHAR) AS period`;
      return `SELECT ${cast}, ${agg}
FROM ${tbl}
WHERE ${qc(dim)} IS NOT NULL
GROUP BY 1 ORDER BY 1 LIMIT 60`;
    }

    case "pie":
    case "donut":
    case "treemap":
    case "funnel": {
      if (!dim) return `SELECT * FROM ${tbl} LIMIT 10`;
      const agg = met ? `ROUND(${safeAgg(met, "SUM", schema)},2) AS value` : `COUNT(*) AS value`;
      return `SELECT CAST(${qc(dim)} AS VARCHAR) AS name, ${agg}
FROM ${tbl}
WHERE ${qc(dim)} IS NOT NULL
GROUP BY 1 ORDER BY 2 DESC LIMIT 12`;
    }

    case "scatter":
    case "bubble": {
      const x =
        met ??
        schema.metrics[0] ??
        schema.columns.find((c) => c.semantic === "numeric")?.name ??
        "";
      const y = spec.metrics[1] ?? schema.metrics[1] ?? x;
      const label = dim ?? schema.dimensions[0] ?? "";
      const labelSql = label ? `, CAST(${qc(label)} AS VARCHAR) AS label` : "";
      const xExpr = x && isNumericColumn(x, schema) ? qc(x) : `TRY_CAST(${qc(x)} AS DOUBLE)`;
      const yExpr = y && isNumericColumn(y, schema) ? qc(y) : `TRY_CAST(${qc(y)} AS DOUBLE)`;
      return `SELECT ROUND(${xExpr},3) AS x,
  ROUND(${yExpr},3) AS y${labelSql}
FROM ${tbl}
WHERE ${qc(x)} IS NOT NULL AND ${qc(y)} IS NOT NULL
LIMIT 400`;
    }

    case "heatmap": {
      if (!dim || !dim2 || !met) return `SELECT * FROM ${tbl} LIMIT 20`;
      return `SELECT CAST(${qc(dim)} AS VARCHAR) AS row_val,
  CAST(${qc(dim2)} AS VARCHAR) AS col_val,
  ROUND(${safeAgg(met, "AVG", schema)},2) AS value
FROM ${tbl}
WHERE ${qc(dim)} IS NOT NULL AND ${qc(dim2)} IS NOT NULL
GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 200`;
    }

    case "radar": {
      if (!dim || mets.length < 2) return `SELECT * FROM ${tbl} LIMIT 10`;
      const aggParts = mets.map(
        (m) => `ROUND(${safeAgg(m, "AVG", schema)},2) AS ${m.toLowerCase().replace(/\W+/g, "_")}`,
      );
      return `SELECT CAST(${qc(dim)} AS VARCHAR) AS category,
  ${aggParts.join(",\n  ")}
FROM ${tbl}
WHERE ${qc(dim)} IS NOT NULL
GROUP BY 1 ORDER BY 2 DESC LIMIT 8`;
    }

    case "gauge": {
      const m = met ?? schema.metrics[0] ?? "";
      if (!m) return `SELECT 50 AS value`;
      return `SELECT ROUND(
  COALESCE(
    ${safeAgg(m, "AVG", schema)} /
    NULLIF(${safeAgg(m, "MAX", schema)}, 0) * 100,
    0
  ), 1) AS value
FROM ${tbl}`;
    }
    default: {
      const orderBy = met ? `ORDER BY ${qc(met)} DESC NULLS LAST` : "";
      return `SELECT * FROM ${tbl} ${orderBy} LIMIT 30`;
    }
  }
}

// ─── SQL validation (DuckDB EXPLAIN) ─────────────────────────────────────────

/**
 * Validate a query against DuckDB itself with `EXPLAIN` (planning only — no
 * rows scanned, fully offline). Catches hallucinated columns / bad syntax that
 * the "starts with SELECT/WITH" regex check misses, before the real query runs.
 */
async function explainOk(sql: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = sql.trim().replace(/;\s*$/, "");
  try {
    await runReadOnlyQuery(`EXPLAIN ${trimmed}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

const SQL_REPAIR_SYSTEM = `You are a DuckDB SQL expert. The previous query failed to plan.
Fix it so it executes against the given table. Rules:
- Use ONLY the columns listed; do not invent column names.
- Use DuckDB syntax, TRY_CAST for numeric conversions, IS NOT NULL guards.
- RETURN ONLY THE CORRECTED SQL QUERY — no explanation, no markdown, no code fences.`;

// ─── LLM SQL Generation ───────────────────────────────────────────────────────

const SQL_SYSTEM = `You are a DuckDB SQL expert. Generate a single SQL query for the requested visualization.
Rules:
- Use DuckDB syntax only
- Handle NULLs with COALESCE or IS NOT NULL checks
- Use TRY_CAST for numeric conversions
- Use LIMIT (20-50 rows max, except kpi-grid which returns 1 row)
- Use clean lowercase alias names (no spaces, use underscores)
- For kpi-grid: single row with multiple named aggregates
- For time-based charts: ORDER BY time ASC
- RETURN ONLY THE SQL QUERY — no explanation, no markdown, no code fences.`;

function buildSQLPrompt(spec: WidgetSpec, schema: DataSchema): string {
  const cols = schema.columns
    .map(
      (c) =>
        `${c.name} (${c.duckType}, ${c.semantic}, cardinality=${c.cardinality}, sample: [${c.sample.slice(0, 3).join(",")}])`,
    )
    .join("\n  ");

  return `Table: "${schema.tableName}"
Chart type: ${spec.chartType}
Widget title: "${spec.title}"
Intent: ${spec.sqlIntent}
Preferred GROUP BY columns: ${spec.dimensions.join(", ") || "auto-detect"}
Preferred metric columns: ${spec.metrics.join(", ") || "auto-detect"}

Available columns:
  ${cols}

Generate the SQL query:`;
}

// ─── Exported Function ────────────────────────────────────────────────────────

export async function generateSQL(
  spec: WidgetSpec,
  schema: DataSchema,
  emit: (text: string) => void,
): Promise<string> {
  let sql: string;

  if (!aiReadySync()) {
    sql = heuristicSQL(spec, schema);
    emit(`Rule-based SQL for "${spec.title}"`);
  } else {
    emit(`LLM generating SQL for "${spec.title}" (${spec.chartType})…`);

    try {
      const raw = await aiChat(SQL_SYSTEM, buildSQLPrompt(spec, schema), {
        maxTokens: 400,
        temperature: 0,
      });

      // Extract SQL — strip any markdown, whitespace, explanatory text
      sql = raw.trim();
      const fence = sql.match(/```(?:sql)?\s*([\s\S]*?)```/i);
      if (fence) sql = fence[1].trim();

      // Basic safety: must start with SELECT (or WITH)
      if (!/^\s*(SELECT|WITH)/i.test(sql)) {
        emit(`LLM SQL invalid, using heuristic fallback`);
        sql = heuristicSQL(spec, schema);
      } else {
        emit(`SQL ready (${sql.split("\n").length} lines)`);
      }
    } catch (err) {
      emit(`SQL generation failed: ${String(err)} — using heuristic`);
      sql = heuristicSQL(spec, schema);
    }
  }

  // Post-processing: ensure LIMIT and replace SELECT * for charts
  const defaultLimit = spec.chartType === "data-table" ? 100 : 50;
  sql = postProcessSQL(sql, spec, schema, defaultLimit);

  // Validate against DuckDB before the real query runs. On failure, attempt a
  // single LLM-driven repair (feeding the planner error back), then re-validate.
  // If both validations fail, fall back to the deterministic heuristic template.
  const check = await explainOk(sql);
  if (!check.ok) {
    emit(`SQL failed validation: ${check.error.slice(0, 120)}`);

    if (aiReadySync()) {
      try {
        const repaired = await aiChat(
          SQL_REPAIR_SYSTEM,
          `${buildSQLPrompt(spec, schema)}\n\nThe failing query was:\n${sql}\n\nDuckDB error:\n${check.error}\n\nCorrected SQL query:`,
          { maxTokens: 400, temperature: 0 },
        );

        let candidate = repaired.trim();
        const fence = candidate.match(/```(?:sql)?\s*([\s\S]*?)```/i);
        if (fence) candidate = fence[1].trim();

        if (/^\s*(SELECT|WITH)/i.test(candidate)) {
          candidate = postProcessSQL(candidate, spec, schema, defaultLimit);
          const recheck = await explainOk(candidate);
          if (recheck.ok) {
            emit(`Repaired SQL validated`);
            return candidate;
          }
        }
      } catch {
        // Repair attempt failed — fall through to heuristic.
      }
    }

    const fallback = postProcessSQL(heuristicSQL(spec, schema), spec, schema, defaultLimit);
    emit(`Using validated heuristic SQL for "${spec.title}"`);
    return fallback;
  }

  return sql;
}

/** Apply LIMIT + explicit-column rewrite consistently to any generated SQL. */
function postProcessSQL(
  sql: string,
  spec: WidgetSpec,
  schema: DataSchema,
  defaultLimit: number,
): string {
  let out = addLimit(sql, defaultLimit);
  if (spec.chartType !== "data-table") {
    out = explicitColumns(out, schema);
  }
  return out;
}

// ─── Insight Generation ───────────────────────────────────────────────────────

export async function generateInsight(
  spec: WidgetSpec,
  data: Record<string, unknown>[],
  emit: (text: string) => void,
): Promise<string> {
  if (!aiReadySync() || data.length === 0) return "";

  try {
    // Build compact data summary
    const topRows = data
      .slice(0, 5)
      .map((r) =>
        Object.entries(r)
          .map(([k, v]) => `${k}=${v}`)
          .join(", "),
      )
      .join("; ");

    const raw = await aiChat(
      "You are a data analyst. Give a single insightful sentence (max 30 words) about this chart data. Be specific with numbers.",
      `Chart: "${spec.title}" (${spec.chartType}). Data (top 5 rows): ${topRows}. Total rows: ${data.length}.`,
      { maxTokens: 60, temperature: 0.3 },
    );

    const insight = raw.replace(/^["']|["']$/g, "").trim();
    emit(`Insight: ${insight.slice(0, 80)}…`);
    return insight;
  } catch {
    return "";
  }
}
