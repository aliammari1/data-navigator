/**
 * Offline Natural Language → SQL engine.
 * Powered by fuse.js for fuzzy column matching + pattern-based templates.
 * LLM fallback for low-confidence results when the on-device engine is ready.
 */

import Fuse from "fuse.js";
import type { ColMeta } from "@/core/stores/data-store";
import { generateText, isLLMReady } from "@/platform/ai/llm-engine";

interface NLQContext {
  tableName: string;
  columns: ColMeta[];
}

export interface NLQResult {
  sql: string;
  explanation: string;
  confidence: "high" | "medium" | "low";
  chartSuggestion?: "bar" | "line" | "pie" | "scatter" | "table" | "number";
}

// ─── Fuzzy column matcher ─────────────────────────────────────────────────────

function fuzzyFindColumn(
  cols: ColMeta[],
  hint: string,
  typeFilter?: ColMeta["type"],
): ColMeta | undefined {
  const candidates = typeFilter
    ? cols.filter((c) => c.type === typeFilter)
    : cols;
  if (!candidates.length) return undefined;

  // Exact match first
  const exact = candidates.find(
    (c) => c.name.toLowerCase() === hint.toLowerCase(),
  );
  if (exact) return exact;

  // Substring match
  const substr = candidates.find((c) =>
    c.name.toLowerCase().includes(hint.toLowerCase()),
  );
  if (substr) return substr;

  // Fuzzy match with Fuse.js
  const fuse = new Fuse(candidates, {
    keys: ["name"],
    threshold: 0.4,
    includeScore: true,
  });
  const results = fuse.search(hint);
  return results[0]?.item;
}

// ─── Column helpers ───────────────────────────────────────────────────────────

function numCols(cols: ColMeta[]): ColMeta[] {
  return cols.filter((c) => c.type === "number");
}
function strCols(cols: ColMeta[]): ColMeta[] {
  return cols.filter((c) => c.type === "string");
}
function dateCols(cols: ColMeta[]): ColMeta[] {
  return cols.filter((c) => c.type === "date");
}

function bestMetric(cols: ColMeta[], hint?: string): string {
  if (hint) {
    const m =
      fuzzyFindColumn(cols, hint, "number") ?? fuzzyFindColumn(cols, hint);
    if (m && m.type === "number") return `"${m.name}"`;
  }
  const priorities = [
    "revenue",
    "sales",
    "amount",
    "value",
    "total",
    "price",
    "profit",
    "count",
    "qty",
    "quantity",
  ];
  for (const p of priorities) {
    const m = numCols(cols).find((c) => c.name.toLowerCase().includes(p));
    if (m) return `"${m.name}"`;
  }
  const first = numCols(cols)[0];
  return first ? `"${first.name}"` : "COUNT(*)";
}

function bestDimension(cols: ColMeta[], hint?: string): string | null {
  if (hint) {
    const d =
      fuzzyFindColumn(cols, hint, "string") ?? fuzzyFindColumn(cols, hint);
    if (d) return `"${d.name}"`;
  }
  const priorities = [
    "category",
    "region",
    "country",
    "city",
    "department",
    "product",
    "type",
    "status",
    "group",
    "name",
    "segment",
  ];
  for (const p of priorities) {
    const d = strCols(cols).find((c) => c.name.toLowerCase().includes(p));
    if (d) return `"${d.name}"`;
  }
  const first = strCols(cols)[0];
  return first ? `"${first.name}"` : null;
}

/** Append LIMIT if not already present. */
function addLimit(sql: string, limit = 100): string {
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

/** Replace SELECT * with explicit column list. */
function explicitColumns(sql: string, columns: ColMeta[]): string {
  if (!/SELECT\s+\*/i.test(sql)) return sql;
  const colList = columns.map((c) => `"${c.name}"`).join(", ");
  return sql.replace(/SELECT\s+\*/i, `SELECT ${colList}`);
}

/** Wrap SQL in EXPLAIN for syntax validation. */
export function explainSQL(sql: string): string {
  return `EXPLAIN ${sql}`;
}

function bestDateCol(cols: ColMeta[]): string | null {
  const priorities = [
    "date",
    "time",
    "created",
    "updated",
    "timestamp",
    "period",
    "month",
    "year",
    "day",
  ];
  for (const p of priorities) {
    const d = dateCols(cols).find((c) => c.name.toLowerCase().includes(p));
    if (d) return `"${d.name}"`;
  }
  return dateCols(cols)[0] ? `"${dateCols(cols)[0].name}"` : null;
}

// ─── Pattern registry ─────────────────────────────────────────────────────────

interface Pattern {
  regex: RegExp;
  build: (match: RegExpMatchArray, ctx: NLQContext) => NLQResult | null;
}

const PATTERNS: Pattern[] = [
  // COUNT / HOW MANY
  {
    regex: /how many|count|total (?:number of )?(?:rows|records|entries)/i,
    build: (_m, { tableName }) => ({
      sql: `SELECT COUNT(*) AS total_count FROM "${tableName}"`,
      explanation: "Counts all rows in the dataset.",
      confidence: "high",
      chartSuggestion: "number",
    }),
  },

  // TOP N by metric
  {
    regex: /top\s*(\d+)\s+(?:.*?)\s+by\s+(\w+)/i,
    build: (m, { tableName, columns }) => {
      const n = m[1] ?? "10";
      const metricHint = m[2] ?? "";
      const metric = bestMetric(columns, metricHint);
      const dim = bestDimension(columns);
      if (!dim) return null;
      return {
        sql: `SELECT ${dim}, SUM(${metric}) AS total FROM "${tableName}" GROUP BY ${dim} ORDER BY total DESC LIMIT ${n}`,
        explanation: `Top ${n} groups by ${metricHint || "primary metric"}.`,
        confidence: "high",
        chartSuggestion: "bar",
      };
    },
  },

  // AVERAGE OF metric
  {
    regex: /average|mean|avg\s+(?:of\s+)?(\w+)/i,
    build: (m, { tableName, columns }) => {
      const hint = m[1] ?? "";
      const metric = bestMetric(columns, hint);
      const dim = bestDimension(columns);
      if (dim) {
        return {
          sql: `SELECT ${dim}, ROUND(AVG(${metric}), 2) AS avg_value FROM "${tableName}" GROUP BY ${dim} ORDER BY avg_value DESC`,
          explanation: `Average ${hint || "metric"} grouped by dimension.`,
          confidence: "high",
          chartSuggestion: "bar",
        };
      }
      return {
        sql: `SELECT ROUND(AVG(${metric}), 2) AS avg_value FROM "${tableName}"`,
        explanation: `Overall average of ${hint || "primary metric"}.`,
        confidence: "high",
        chartSuggestion: "number",
      };
    },
  },

  // SUM / TOTAL metric BY dimension
  {
    regex: /(?:sum|total|aggregate)\s+(?:of\s+)?(\w+)\s+by\s+(\w+)/i,
    build: (m, { tableName, columns }) => {
      const metric = bestMetric(columns, m[1]);
      const dim = bestDimension(columns, m[2]);
      if (!dim) return null;
      return {
        sql: `SELECT ${dim}, ROUND(SUM(${metric}), 2) AS total FROM "${tableName}" GROUP BY ${dim} ORDER BY total DESC`,
        explanation: `Sum of ${m[1]} grouped by ${m[2]}.`,
        confidence: "high",
        chartSuggestion: "bar",
      };
    },
  },

  // CONDITIONAL BREAKDOWN using FILTER
  {
    regex:
      /(?:filtered|conditional)?\s*(?:distribution|breakdown)\s+(?:of\s+)?(\w+)\s+(?:where|with|having)\s+(\w+)\s*(>=|<=|>|<|=)\s*(\d+(?:\.\d+)?)/i,
    build: (m, { tableName, columns }) => {
      const dimHint = m[1] ?? "";
      const metricHint = m[2] ?? "";
      const operator = m[3] ?? "=";
      const value = m[4] ?? "0";
      const dim = bestDimension(columns, dimHint);
      const metric = bestMetric(columns, metricHint);
      if (!dim) return null;
      return {
        sql: `SELECT ${dim}, COUNT(*) FILTER (WHERE ${metric} ${operator} ${value}) AS filtered_count, COUNT(*) AS total, ROUND(COUNT(*) FILTER (WHERE ${metric} ${operator} ${value}) * 100.0 / COUNT(*), 1) AS pct FROM "${tableName}" GROUP BY ${dim} ORDER BY filtered_count DESC`,
        explanation: `Conditional breakdown of ${dimHint} where ${metricHint} ${operator} ${value}.`,
        confidence: "high",
        chartSuggestion: "bar",
      };
    },
  },

  // DISTRIBUTION / BREAKDOWN of column
  {
    regex: /distribution|breakdown|(?:group|split)\s+by\s+(\w+)/i,
    build: (m, { tableName, columns }) => {
      const hint = m[1] ?? "";
      const dim = bestDimension(columns, hint);
      if (!dim) return null;
      return {
        sql: `SELECT ${dim}, COUNT(*) AS count, ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) AS pct FROM "${tableName}" GROUP BY ${dim} ORDER BY count DESC`,
        explanation: `Distribution of ${hint || "primary dimension"} with percentage.`,
        confidence: "high",
        chartSuggestion: "pie",
      };
    },
  },

  // TREND OVER TIME
  {
    regex: /trend|over time|by (?:month|day|year|week|quarter)|time series/i,
    build: (_m, { tableName, columns }) => {
      const dateCol = bestDateCol(columns);
      const metric = bestMetric(columns);
      if (!dateCol) return null;
      return {
        sql: `SELECT DATE_TRUNC('month', ${dateCol}) AS period, ROUND(SUM(${metric}), 2) AS total FROM "${tableName}" WHERE ${dateCol} IS NOT NULL GROUP BY period ORDER BY period`,
        explanation: "Monthly trend of primary metric over time.",
        confidence: "high",
        chartSuggestion: "line",
      };
    },
  },

  // CORRELATION between two columns
  {
    regex: /correlat(?:ion|e)\s+(?:between\s+)?(\w+)\s+(?:and|with)\s+(\w+)/i,
    build: (m, { tableName, columns }) => {
      const c1 = numCols(columns).find((c) =>
        c.name.toLowerCase().includes(m[1].toLowerCase()),
      );
      const c2 = numCols(columns).find((c) =>
        c.name.toLowerCase().includes(m[2].toLowerCase()),
      );
      if (!c1 || !c2) {
        const [a, b] = numCols(columns).slice(0, 2);
        if (!a || !b) return null;
        return {
          sql: `SELECT "${a.name}", "${b.name}" FROM "${tableName}" WHERE "${a.name}" IS NOT NULL AND "${b.name}" IS NOT NULL LIMIT 1000`,
          explanation: `Scatter data for correlation between ${a.name} and ${b.name}.`,
          confidence: "medium",
          chartSuggestion: "scatter",
        };
      }
      return {
        sql: `SELECT "${c1.name}", "${c2.name}" FROM "${tableName}" WHERE "${c1.name}" IS NOT NULL AND "${c2.name}" IS NOT NULL LIMIT 2000`,
        explanation: `Scatter data to visualise correlation between ${m[1]} and ${m[2]}.`,
        confidence: "high",
        chartSuggestion: "scatter",
      };
    },
  },

  // MISSING / NULL values
  {
    regex: /missing|null|empty|blank|incomplete/i,
    build: (_m, { tableName, columns }) => {
      const checks = columns
        .map(
          (c) =>
            `COUNT(*) FILTER (WHERE "${c.name}" IS NULL) AS "${c.name}_nulls"`,
        )
        .join(", ");
      return {
        sql: `SELECT ${checks} FROM "${tableName}"`,
        explanation: "Counts missing (NULL) values per column.",
        confidence: "high",
        chartSuggestion: "bar",
      };
    },
  },

  // OUTLIERS / ANOMALIES
  {
    regex: /outlier|anomal|unusual|extreme/i,
    build: (_m, { tableName, columns }) => {
      const metric = bestMetric(columns);
      return {
        sql: `WITH stats AS (SELECT AVG(${metric}) AS mu, STDDEV(${metric}) AS sd FROM "${tableName}") SELECT * FROM "${tableName}", stats WHERE ABS(${metric} - mu) > 2 * sd ORDER BY ABS(${metric} - mu) DESC LIMIT 50`,
        explanation:
          "Rows where the primary metric deviates more than 2 standard deviations from the mean.",
        confidence: "high",
        chartSuggestion: "table",
      };
    },
  },

  // DUPLICATE rows
  {
    regex: /duplicate|duplicated|repeated/i,
    build: (_m, { tableName, columns }) => {
      const cols = columns
        .slice(0, Math.min(4, columns.length))
        .map((c) => `"${c.name}"`)
        .join(", ");
      return {
        sql: `SELECT ${cols}, COUNT(*) AS occurrences FROM "${tableName}" GROUP BY ${cols} HAVING COUNT(*) > 1 ORDER BY occurrences DESC`,
        explanation: "Groups of duplicate rows based on first columns.",
        confidence: "medium",
        chartSuggestion: "table",
      };
    },
  },

  // SHOW / SELECT all
  {
    regex:
      /^(?:show|list|display|get|fetch|select)\s+(?:all\s+)?(?:rows?|data|records?|everything)(?:\s+from)?(?:\s+where\s+(.+))?$/i,
    build: (m, { tableName }) => {
      const where = m[1] ? ` WHERE ${m[1]}` : "";
      return {
        sql: `SELECT * FROM "${tableName}"${where} LIMIT 500`,
        explanation: `Shows first 500 rows${m[1] ? ` matching: ${m[1]}` : ""}.`,
        confidence: "high",
        chartSuggestion: "table",
      };
    },
  },

  // DESCRIBE / SUMMARY of columns
  {
    regex: /describe|summary|profile|stats(?:tics)?|overview/i,
    build: (_m, { tableName, columns }) => {
      const numericCols = numCols(columns);
      if (numericCols.length === 0) {
        return {
          sql: `SELECT COUNT(*) AS rows, COUNT(DISTINCT *) AS distinct_rows FROM "${tableName}"`,
          explanation: "Basic dataset summary.",
          confidence: "medium",
          chartSuggestion: "table",
        };
      }
      const aggExprs = numericCols
        .slice(0, 6)
        .map(
          (c) =>
            `ROUND(MIN("${c.name}"),2) AS "${c.name}_min", ROUND(MAX("${c.name}"),2) AS "${c.name}_max", ROUND(AVG("${c.name}"),2) AS "${c.name}_avg"`,
        )
        .join(", ");
      return {
        sql: `SELECT COUNT(*) AS total_rows, ${aggExprs} FROM "${tableName}"`,
        explanation: "Statistical summary of numeric columns.",
        confidence: "high",
        chartSuggestion: "table",
      };
    },
  },

  // FILTER by value
  {
    regex:
      /(?:where|filter|with|having)\s+(\w+)\s*(?:=|is|equals?)\s*['"]?([^'"]+)['"]?/i,
    build: (m, { tableName, columns }) => {
      const colHint = m[1].toLowerCase();
      const col = columns.find((c) => c.name.toLowerCase().includes(colHint));
      if (!col) return null;
      const val = m[2].trim();
      const isNum = !Number.isNaN(Number(val));
      return {
        sql: `SELECT * FROM "${tableName}" WHERE "${col.name}" = ${isNum ? val : `'${val}'`} LIMIT 500`,
        explanation: `Filter rows where ${col.name} equals ${val}.`,
        confidence: "high",
        chartSuggestion: "table",
      };
    },
  },

  // MIN / MAX
  {
    regex: /(?:min(?:imum)?|max(?:imum)?)\s+(?:of\s+)?(\w+)/i,
    build: (m, { tableName, columns }) => {
      const fn = /min/i.test(m[0]) ? "MIN" : "MAX";
      const metric = bestMetric(columns, m[1]);
      const dim = bestDimension(columns);
      if (dim) {
        return {
          sql: `SELECT ${dim}, ${fn}(${metric}) AS result FROM "${tableName}" GROUP BY ${dim} ORDER BY result ${fn === "MIN" ? "ASC" : "DESC"}`,
          explanation: `${fn === "MIN" ? "Minimum" : "Maximum"} of ${m[1]} by dimension.`,
          confidence: "high",
          chartSuggestion: "bar",
        };
      }
      return {
        sql: `SELECT ${fn}(${metric}) AS result FROM "${tableName}"`,
        explanation: `${fn === "MIN" ? "Minimum" : "Maximum"} value of ${m[1]}.`,
        confidence: "high",
        chartSuggestion: "number",
      };
    },
  },
];

// ─── Main translator ──────────────────────────────────────────────────────────

export function translateNLQ(question: string, ctx: NLQContext): NLQResult {
  const q = question.trim();

  // First check if it looks like raw SQL already
  if (/^\s*(?:SELECT|WITH|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\s/i.test(q)) {
    const sql = addLimit(q, 1000);
    return {
      sql,
      explanation: "Executed as raw SQL.",
      confidence: "high",
      chartSuggestion: "table",
    };
  }

  // Try each pattern
  for (const pattern of PATTERNS) {
    const match = q.match(pattern.regex);
    if (match) {
      const result = pattern.build(match, ctx);
      if (result) {
        // Post-process: ensure LIMIT and replace SELECT * for charts
        let sql = addLimit(result.sql, 100);
        if (result.chartSuggestion && result.chartSuggestion !== "table") {
          sql = explicitColumns(sql, ctx.columns);
        }
        return { ...result, sql };
      }
    }
  }

  // Fallback: smart SELECT based on question keywords
  const metric = bestMetric(ctx.columns);
  const dim = bestDimension(ctx.columns);

  let sql: string;
  if (dim) {
    sql = `SELECT ${dim}, SUM(${metric}) AS total, COUNT(*) AS count FROM "${ctx.tableName}" GROUP BY ${dim} ORDER BY total DESC LIMIT 20`;
    sql = addLimit(sql, 100);
    return {
      sql,
      explanation:
        "Could not fully parse your question — showing a grouped summary of the data.",
      confidence: "low",
      chartSuggestion: "bar",
    };
  }

  sql = `SELECT * FROM "${ctx.tableName}" LIMIT 100`;
  sql = addLimit(sql, 100);
  return {
    sql,
    explanation: "Could not parse your question — showing first 100 rows.",
    confidence: "low",
    chartSuggestion: "table",
  };
}

// ─── Smart insight generator ──────────────────────────────────────────────────

/** Generate suggested questions based on dataset schema */
export function suggestQuestions(ctx: NLQContext): string[] {
  const { columns } = ctx;
  const suggestions: string[] = [];

  const nums = numCols(columns);
  const strs = strCols(columns);
  const dates = dateCols(columns);

  if (nums.length > 0 && strs.length > 0) {
    suggestions.push(`Show total ${nums[0].name} by ${strs[0].name}`);
    suggestions.push(`Top 10 ${strs[0].name} by ${nums[0].name}`);
    suggestions.push(`Average ${nums[0].name} by ${strs[0].name}`);
  }
  if (dates.length > 0 && nums.length > 0) {
    suggestions.push(`Trend of ${nums[0].name} over time`);
  }
  if (nums.length >= 2) {
    suggestions.push(`Correlation between ${nums[0].name} and ${nums[1].name}`);
  }
  suggestions.push("Show missing values per column");
  suggestions.push("Find duplicate rows");
  suggestions.push("Show outliers and anomalies");
  suggestions.push("Describe statistics for all columns");
  suggestions.push("How many rows are in this dataset?");

  return suggestions.slice(0, 8);
}

// ─── LLM-powered NLQ fallback ─────────────────────────────────────────────────

/**
 * Translate a natural language question to SQL.
 * 1. Tries the fast pattern-matcher first.
 * 2. If confidence is "low" AND the LLM is ready, upgrades with the LLM.
 * 3. Falls back to the original low-confidence result if the LLM fails.
 * Always ensures LIMIT 1000 is present.
 */
export async function translateNLQWithLLM(
  question: string,
  ctx: { tableName: string; columns: ColMeta[] },
): Promise<NLQResult> {
  const patternResult = translateNLQ(question, ctx);

  if (patternResult.confidence !== "low") {
    return patternResult;
  }

  if (!isLLMReady()) {
    return patternResult;
  }

  try {
    const colList = ctx.columns
      .map((c) => `${c.name} (${c.type})`)
      .join(", ");

    const userPrompt = `Table: ${ctx.tableName}\nColumns: ${colList}\nQuestion: ${question}`;

    const raw = await generateText(userPrompt, {
      systemPrompt:
        'You are a SQL expert. Generate DuckDB-compatible SQL for the given question. Return JSON only — no prose, no markdown fences. Schema: {sql, explanation, confidence, chartSuggestion}. confidence must be "high"|"medium"|"low". chartSuggestion must be one of: bar|line|pie|scatter|table|number.',
      maxTokens: 400,
      temperature: 0.2,
    });

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON object in LLM response");

    const parsed = JSON.parse(jsonMatch[0]) as NLQResult;
    if (!parsed.sql) throw new Error("Missing sql field");

    // Guarantee LIMIT 1000
    const sql = addLimit(parsed.sql, 1000);

    return {
      sql,
      explanation: parsed.explanation ?? "",
      confidence: parsed.confidence ?? "medium",
      chartSuggestion: parsed.chartSuggestion,
    };
  } catch {
    return patternResult;
  }
}
