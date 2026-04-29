"use client";
/**
 * SQLAgent — generates a DuckDB SQL query for each WidgetSpec.
 * LLM-powered when available; heuristic fallback when not.
 */

import { chat, isLoaded, parseJSON } from "./llm";
import type { ChartType, DataSchema, WidgetSpec } from "./types";

// ─── SQL Helpers ──────────────────────────────────────────────────────────────

function qc(col: string) {
  return `"${col.replace(/"/g, '""')}"`;
}

function safeAgg(
  metric: string,
  func: "SUM" | "AVG" | "MIN" | "MAX" | "COUNT",
) {
  if (!metric) return `${func}(*)`;
  return `${func}(TRY_CAST(${qc(metric)} AS DOUBLE))`;
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
        parts.push(`ROUND(${safeAgg(m, "SUM")},2) AS total_${label}`);
        parts.push(`ROUND(${safeAgg(m, "AVG")},2) AS avg_${label}`);
        parts.push(`ROUND(${safeAgg(m, "MIN")},2) AS min_${label}`);
        parts.push(`ROUND(${safeAgg(m, "MAX")},2) AS max_${label}`);
      }
      return `SELECT ${parts.join(",\n  ")} FROM ${tbl}`;
    }

    case "bar":
    case "horizontal-bar": {
      if (!dim) return `SELECT * FROM ${tbl} LIMIT 20`;
      const agg = met
        ? `ROUND(${safeAgg(met, "SUM")},2) AS value`
        : `COUNT(*) AS count`;
      return `SELECT CAST(${qc(dim)} AS VARCHAR) AS category, ${agg}
FROM ${tbl}
WHERE ${qc(dim)} IS NOT NULL
GROUP BY 1 ORDER BY 2 DESC LIMIT 20`;
    }

    case "stacked-bar":
    case "stacked-horizontal-bar": {
      if (!dim || !dim2)
        return heuristicSQL({ ...spec, chartType: "bar" }, schema);
      const agg = met
        ? `ROUND(${safeAgg(met, "SUM")},2) AS value`
        : `COUNT(*) AS value`;
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
      const agg = met
        ? `ROUND(${safeAgg(met, "SUM")},2) AS value`
        : `COUNT(*) AS value`;
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
      const agg = met
        ? `ROUND(${safeAgg(met, "SUM")},2) AS value`
        : `COUNT(*) AS value`;
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
      return `SELECT ROUND(TRY_CAST(${qc(x)} AS DOUBLE),3) AS x,
  ROUND(TRY_CAST(${qc(y)} AS DOUBLE),3) AS y${labelSql}
FROM ${tbl}
WHERE ${qc(x)} IS NOT NULL AND ${qc(y)} IS NOT NULL
LIMIT 400`;
    }

    case "heatmap": {
      if (!dim || !dim2 || !met) return `SELECT * FROM ${tbl} LIMIT 20`;
      return `SELECT CAST(${qc(dim)} AS VARCHAR) AS row_val,
  CAST(${qc(dim2)} AS VARCHAR) AS col_val,
  ROUND(${safeAgg(met, "AVG")},2) AS value
FROM ${tbl}
WHERE ${qc(dim)} IS NOT NULL AND ${qc(dim2)} IS NOT NULL
GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 200`;
    }

    case "radar": {
      if (!dim || mets.length < 2) return `SELECT * FROM ${tbl} LIMIT 10`;
      const aggParts = mets.map(
        (m) =>
          `ROUND(${safeAgg(m, "AVG")},2) AS ${m.toLowerCase().replace(/\W+/g, "_")}`,
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
    ${safeAgg(m, "AVG")} /
    NULLIF(${safeAgg(m, "MAX")}, 0) * 100,
    0
  ), 1) AS value
FROM ${tbl}`;
    }

    case "data-table":
    default: {
      const orderBy = met ? `ORDER BY ${qc(met)} DESC NULLS LAST` : "";
      return `SELECT * FROM ${tbl} ${orderBy} LIMIT 30`;
    }
  }
}

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
  if (!isLoaded()) {
    const sql = heuristicSQL(spec, schema);
    emit(`Rule-based SQL for "${spec.title}"`);
    return sql;
  }

  emit(`LLM generating SQL for "${spec.title}" (${spec.chartType})…`);

  try {
    const raw = await chat(SQL_SYSTEM, buildSQLPrompt(spec, schema), {
      maxTokens: 400,
      temperature: 0,
    });

    // Extract SQL — strip any markdown, whitespace, explanatory text
    let sql = raw.trim();
    const fence = sql.match(/```(?:sql)?\s*([\s\S]*?)```/i);
    if (fence) sql = fence[1].trim();

    // Basic safety: must start with SELECT (or WITH)
    if (!/^\s*(SELECT|WITH)/i.test(sql)) {
      emit(`LLM SQL invalid, using heuristic fallback`);
      return heuristicSQL(spec, schema);
    }

    emit(`SQL ready (${sql.split("\n").length} lines)`);
    return sql;
  } catch (err) {
    emit(`SQL generation failed: ${String(err)} — using heuristic`);
    return heuristicSQL(spec, schema);
  }
}

// ─── Insight Generation ───────────────────────────────────────────────────────

export async function generateInsight(
  spec: WidgetSpec,
  data: Record<string, unknown>[],
  emit: (text: string) => void,
): Promise<string> {
  if (!isLoaded() || data.length === 0) return "";

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

    const raw = await chat(
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

// Re-export for use in insight-only generation
export { parseJSON };
