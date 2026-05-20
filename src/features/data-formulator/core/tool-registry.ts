"use client";

/**
 * Tool Registry
 * Bounded DuckDB analysis tools that the AI can call.
 * Deterministic code validates, executes, and renders — but never invents insights.
 */

import { runQuery } from "@/platform/duckdb/duckdb";

export interface ToolContext {
  tableName: string;
  columns: Array<{ name: string; type: string }>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
  returns: string;
}

export interface ToolResult {
  tool: string;
  success: boolean;
  data?: unknown;
  sql?: string;
  error?: string;
  rowCount?: number;
  durationMs?: number;
}

// ─── Registered Tools ───────────────────────────────────────────────────────────

const TOOLS: ToolDefinition[] = [
  {
    name: "query",
    description: "Run a safe read-only SQL query against the current table. Only SELECT statements allowed.",
    parameters: {
      sql: { type: "string", description: "Valid DuckDB SELECT statement", required: true },
      limit: { type: "number", description: "Max rows to return (default 1000)", required: false },
    },
    returns: "Array of row objects",
  },
  {
    name: "aggregate",
    description: "Compute aggregations (sum, count, avg, min, max, median) for a column.",
    parameters: {
      column: { type: "string", description: "Column name to aggregate", required: true },
      agg: { type: "string", description: "Aggregation function", required: true },
      groupBy: { type: "string", description: "Optional group-by column", required: false },
      filters: { type: "string", description: "Optional WHERE clause (safe only)", required: false },
    },
    returns: "Aggregated value or grouped results",
  },
  {
    name: "comparePeriods",
    description: "Compare a metric between two time periods.",
    parameters: {
      metric: { type: "string", description: "Metric column or expression", required: true },
      periodColumn: { type: "string", description: "Date/datetime column", required: true },
      currentStart: { type: "string", description: "Current period start (ISO or SQL)", required: true },
      currentEnd: { type: "string", description: "Current period end", required: true },
      baselineStart: { type: "string", description: "Baseline period start", required: true },
      baselineEnd: { type: "string", description: "Baseline period end", required: true },
    },
    returns: "Current value, baseline value, delta, deltaPercent",
  },
  {
    name: "segmentBreakdown",
    description: "Break down a metric by a dimension to find contributors to change.",
    parameters: {
      metric: { type: "string", description: "Metric column or expression", required: true },
      dimension: { type: "string", description: "Dimension column to group by", required: true },
      filters: { type: "string", description: "Optional WHERE clause", required: false },
      limit: { type: "number", description: "Max segments", required: false },
    },
    returns: "Array of { segment, value, percent } sorted by value desc",
  },
  {
    name: "anomalyScan",
    description: "Find rows with outliers, nulls, or unusual values in a column.",
    parameters: {
      column: { type: "string", description: "Column to scan", required: true },
      method: { type: "string", description: "iqr, zscore, or nulls", required: true },
      limit: { type: "number", description: "Max anomalies", required: false },
    },
    returns: "Array of anomalous rows",
  },
  {
    name: "topN",
    description: "Get top N rows by a metric.",
    parameters: {
      metric: { type: "string", description: "Column or expression to rank by", required: true },
      n: { type: "number", description: "Number of rows", required: true },
      groupBy: { type: "string", description: "Optional group-by", required: false },
    },
    returns: "Top N rows",
  },
  {
    name: "histogram",
    description: "Compute a histogram for a numeric column.",
    parameters: {
      column: { type: "string", description: "Numeric column", required: true },
      bins: { type: "number", description: "Number of bins (default 30)", required: false },
    },
    returns: "Array of { bin, count, min, max }",
  },
  {
    name: "describeTable",
    description: "Get column statistics for the current table.",
    parameters: {},
    returns: "Summary statistics per column",
  },
];

export function getToolDefinitions(): ToolDefinition[] {
  return TOOLS;
}

export function getToolDefinition(name: string): ToolDefinition | undefined {
  return TOOLS.find((t) => t.name === name);
}

// ─── SQL Safety Guard ───────────────────────────────────────────────────────────

function isSafeSql(sql: string): boolean {
  const normalized = sql.toLowerCase().trim();
  // Must start with SELECT
  if (!normalized.startsWith("select")) return false;
  // Block dangerous keywords
  const forbidden = /\b(drop|delete|truncate|insert|update|alter|create|attach|detach|copy|execute|pragma|vacuum)\b/;
  if (forbidden.test(normalized)) return false;
  return true;
}

// ─── Tool Execution ─────────────────────────────────────────────────────────────

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const start = performance.now();
  const tool = getToolDefinition(name);
  if (!tool) {
    return { tool: name, success: false, error: `Unknown tool: ${name}` };
  }

  try {
    switch (name) {
      case "query": {
        const sql = String(args.sql ?? "");
        if (!isSafeSql(sql)) {
          return { tool: name, success: false, error: "Unsafe SQL rejected: only SELECT allowed" };
        }
        const limit = Math.min(Number(args.limit ?? 1000), 5000);
        const limitedSql = sql.replace(/;?\s*$/, ` LIMIT ${limit}`);
        const data = await runQuery(limitedSql);
        return {
          tool: name,
          success: true,
          data,
          sql: limitedSql,
          rowCount: data.length,
          durationMs: Math.round(performance.now() - start),
        };
      }

      case "aggregate": {
        const col = quoteIdentifier(String(args.column ?? ""));
        const agg = String(args.agg ?? "count").toUpperCase();
        const groupBy = args.groupBy ? quoteIdentifier(String(args.groupBy)) : null;
        const filters = String(args.filters ?? "");
        const safeAgg = ["SUM", "COUNT", "AVG", "MIN", "MAX", "MEDIAN"].includes(agg) ? agg : "COUNT";
        const whereClause = filters && isSafeSql(`SELECT 1 WHERE ${filters}`) ? `WHERE ${filters}` : "";
        const sql = groupBy
          ? `SELECT ${groupBy} AS segment, ${safeAgg}(${col}) AS value FROM "${ctx.tableName}" ${whereClause} GROUP BY ${groupBy} ORDER BY value DESC`
          : `SELECT ${safeAgg}(${col}) AS value FROM "${ctx.tableName}" ${whereClause}`;
        const data = await runQuery(sql);
        return {
          tool: name,
          success: true,
          data,
          sql,
          rowCount: data.length,
          durationMs: Math.round(performance.now() - start),
        };
      }

      case "comparePeriods": {
        const metric = String(args.metric ?? "");
        const periodCol = quoteIdentifier(String(args.periodColumn ?? ""));
        const cStart = String(args.currentStart ?? "");
        const cEnd = String(args.currentEnd ?? "");
        const bStart = String(args.baselineStart ?? "");
        const bEnd = String(args.baselineEnd ?? "");
        const sql = `
          WITH current AS (
            SELECT ${metric} AS v FROM "${ctx.tableName}"
            WHERE ${periodCol} BETWEEN '${cStart}' AND '${cEnd}'
          ),
          baseline AS (
            SELECT ${metric} AS v FROM "${ctx.tableName}"
            WHERE ${periodCol} BETWEEN '${bStart}' AND '${bEnd}'
          )
          SELECT
            (SELECT COALESCE(SUM(v), 0) FROM current) AS current_value,
            (SELECT COALESCE(SUM(v), 0) FROM baseline) AS baseline_value,
            (SELECT COALESCE(SUM(v), 0) FROM current) - (SELECT COALESCE(SUM(v), 0) FROM baseline) AS delta,
            CASE WHEN (SELECT COALESCE(SUM(v), 0) FROM baseline) = 0 THEN NULL
              ELSE ROUND(((SELECT COALESCE(SUM(v), 0) FROM current) - (SELECT COALESCE(SUM(v), 0) FROM baseline)) * 100.0 / (SELECT COALESCE(SUM(v), 0) FROM baseline), 2)
            END AS delta_percent
        `;
        const data = await runQuery(sql);
        return {
          tool: name,
          success: true,
          data,
          sql,
          rowCount: data.length,
          durationMs: Math.round(performance.now() - start),
        };
      }

      case "segmentBreakdown": {
        const metric = String(args.metric ?? "");
        const dim = quoteIdentifier(String(args.dimension ?? ""));
        const filters = String(args.filters ?? "");
        const limit = Math.min(Number(args.limit ?? 20), 100);
        const whereClause = filters && isSafeSql(`SELECT 1 WHERE ${filters}`) ? `WHERE ${filters}` : "";
        const sql = `
          WITH total AS (
            SELECT SUM(${metric}) AS total FROM "${ctx.tableName}" ${whereClause}
          )
          SELECT
            ${dim} AS segment,
            SUM(${metric}) AS value,
            ROUND(SUM(${metric}) * 100.0 / NULLIF((SELECT total FROM total), 0), 2) AS percent
          FROM "${ctx.tableName}"
          ${whereClause}
          GROUP BY ${dim}
          ORDER BY value DESC
          LIMIT ${limit}
        `;
        const data = await runQuery(sql);
        return {
          tool: name,
          success: true,
          data,
          sql,
          rowCount: data.length,
          durationMs: Math.round(performance.now() - start),
        };
      }

      case "anomalyScan": {
        const col = quoteIdentifier(String(args.column ?? ""));
        const method = String(args.method ?? "iqr");
        const limit = Math.min(Number(args.limit ?? 50), 500);
        let sql = "";
        if (method === "nulls") {
          sql = `SELECT * FROM "${ctx.tableName}" WHERE ${col} IS NULL LIMIT ${limit}`;
        } else if (method === "zscore") {
          sql = `
            WITH stats AS (
              SELECT AVG(TRY_CAST(${col} AS DOUBLE)) AS mu, STDDEV(TRY_CAST(${col} AS DOUBLE)) AS sigma FROM "${ctx.tableName}"
            )
            SELECT * FROM "${ctx.tableName}"
            WHERE ABS(TRY_CAST(${col} AS DOUBLE) - (SELECT mu FROM stats)) > 3 * (SELECT sigma FROM stats)
            LIMIT ${limit}
          `;
        } else {
          // IQR
          sql = `
            WITH stats AS (
              SELECT QUANTILE_CONT(TRY_CAST(${col} AS DOUBLE), 0.25) AS q1, QUANTILE_CONT(TRY_CAST(${col} AS DOUBLE), 0.75) AS q3
              FROM "${ctx.tableName}"
            )
            SELECT * FROM "${ctx.tableName}"
            WHERE TRY_CAST(${col} AS DOUBLE) < (SELECT q1 FROM stats) - 1.5 * ((SELECT q3 FROM stats) - (SELECT q1 FROM stats))
               OR TRY_CAST(${col} AS DOUBLE) > (SELECT q3 FROM stats) + 1.5 * ((SELECT q3 FROM stats) - (SELECT q1 FROM stats))
            LIMIT ${limit}
          `;
        }
        const data = await runQuery(sql);
        return {
          tool: name,
          success: true,
          data,
          sql,
          rowCount: data.length,
          durationMs: Math.round(performance.now() - start),
        };
      }

      case "topN": {
        const metric = String(args.metric ?? "");
        const n = Math.min(Number(args.n ?? 10), 500);
        const groupBy = args.groupBy ? quoteIdentifier(String(args.groupBy)) : null;
        const sql = groupBy
          ? `SELECT ${groupBy} AS segment, ${metric} AS value FROM "${ctx.tableName}" GROUP BY ${groupBy} ORDER BY value DESC LIMIT ${n}`
          : `SELECT * FROM "${ctx.tableName}" ORDER BY ${metric} DESC LIMIT ${n}`;
        const data = await runQuery(sql);
        return {
          tool: name,
          success: true,
          data,
          sql,
          rowCount: data.length,
          durationMs: Math.round(performance.now() - start),
        };
      }

      case "histogram": {
        const col = quoteIdentifier(String(args.column ?? ""));
        const bins = Math.min(Math.max(Number(args.bins ?? 30), 5), 100);
        const sql = `
          SELECT
            WIDTH_BUCKET(TRY_CAST(${col} AS DOUBLE),
              (SELECT MIN(TRY_CAST(${col} AS DOUBLE)) FROM "${ctx.tableName}"),
              (SELECT MAX(TRY_CAST(${col} AS DOUBLE)) FROM "${ctx.tableName}"),
              ${bins}
            ) AS bin,
            COUNT(*) AS count,
            MIN(TRY_CAST(${col} AS DOUBLE)) AS min,
            MAX(TRY_CAST(${col} AS DOUBLE)) AS max
          FROM "${ctx.tableName}"
          GROUP BY bin
          ORDER BY bin
        `;
        const data = await runQuery(sql);
        return {
          tool: name,
          success: true,
          data,
          sql,
          rowCount: data.length,
          durationMs: Math.round(performance.now() - start),
        };
      }

      case "describeTable": {
        const sql = `SUMMARIZE "${ctx.tableName}"`;
        const data = await runQuery(sql);
        return {
          tool: name,
          success: true,
          data,
          sql,
          rowCount: data.length,
          durationMs: Math.round(performance.now() - start),
        };
      }

      default:
        return { tool: name, success: false, error: `Tool ${name} not implemented` };
    }
  } catch (err) {
    return {
      tool: name,
      success: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Math.round(performance.now() - start),
    };
  }
}

function quoteIdentifier(name: string): string {
  // Simple safety: reject identifiers with semicolons or backticks
  if (/[;`]/.test(name)) return `"invalid"`;
  return `"${name}"`;
}
