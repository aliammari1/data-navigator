"use client";
/**
 * Offline AI helpers for Data Formulator.
 *
 * Thin wrappers around the local LLM. No rule-based fallbacks.
 * If Ollama is offline, features fail visibly.
 */

import Fuse from "fuse.js";
import { chat, isLoaded, parseJSON } from "@/features/agent-canvas/core/llm";
import type { ChartType } from "@/features/agent-canvas/core/types";
import type {
  AggregateFn,
  ChartSpec,
  ColumnInfo,
  DerivedField,
  Encoding,
} from "./types";

// ─── Shared utilities ─────────────────────────────────────────────────────────

const ALLOWED_CHART_TYPES: readonly ChartType[] = [
  "bar",
  "horizontal-bar",
  "stacked-bar",
  "line",
  "area",
  "multi-line",
  "pie",
  "donut",
  "scatter",
  "bubble",
  "heatmap",
  "treemap",
  "radar",
  "gauge",
  "funnel",
];

function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function schemaSummary(columns: ColumnInfo[]): string {
  return columns
    .map((c) => `- ${c.name} (${c.type}${c.derived ? ", derived" : ""})`)
    .join("\n");
}

function findCol(columns: ColumnInfo[], name: string): ColumnInfo | undefined {
  if (!name) return undefined;
  const lower = name.toLowerCase().trim();
  // Exact / case-insensitive / substring fast path
  const exact = columns.find(
    (c) =>
      c.name === name ||
      c.name.toLowerCase() === lower ||
      c.name.toLowerCase().includes(lower),
  );
  if (exact) return exact;
  // Underscore-aware: "channel name" → "channel_name"
  const snake = lower.replace(/\s+/g, "_");
  const snakeMatch = columns.find((c) => c.name.toLowerCase().includes(snake));
  if (snakeMatch) return snakeMatch;
  // Fuzzy fallback via Fuse.js
  const fuse = new Fuse(columns, {
    keys: ["name"],
    threshold: 0.4,
    ignoreLocation: true,
    isCaseSensitive: false,
  });
  const hits = fuse.search(lower);
  return hits[0]?.item;
}

// ─── Derived field generation ─────────────────────────────────────────────────

export interface DeriveFieldRequest {
  prompt: string;
  columns: ColumnInfo[];
  tableName: string;
}

export interface DeriveFieldResult {
  field: DerivedField;
  source: "ai" | "rule";
}

const RULE_PATTERNS: Array<{
  test: RegExp;
  build: (
    m: RegExpMatchArray,
    cols: ColumnInfo[],
    prompt: string,
  ) => DerivedField | null;
}> = [
  {
    test: /(?:ratio|rate)\s+(?:of\s+)?([\w\s]+?)\s+(?:to|over|per|by)\s+([\w\s]+)/i,
    build: (m, cols, prompt) => {
      const a = findCol(cols, m[1].trim());
      const b = findCol(cols, m[2].trim());
      if (!a || !b) return null;
      const name = `${a.name}_per_${b.name}`;
      return {
        id: genId(),
        name,
        sql: `CASE WHEN TRY_CAST("${b.name}" AS DOUBLE) <> 0 THEN TRY_CAST("${a.name}" AS DOUBLE) / TRY_CAST("${b.name}" AS DOUBLE) ELSE NULL END`,
        prompt,
        parents: [a.name, b.name],
        createdAt: Date.now(),
      };
    },
  },
  {
    test: /(?:difference|diff|delta|minus|subtract)\s+(?:of\s+|between\s+)?([\w\s]+?)\s+(?:and|from|minus)\s+([\w\s]+)/i,
    build: (m, cols, prompt) => {
      const a = findCol(cols, m[1].trim());
      const b = findCol(cols, m[2].trim());
      if (!a || !b) return null;
      const name = `${a.name}_minus_${b.name}`;
      return {
        id: genId(),
        name,
        sql: `TRY_CAST("${a.name}" AS DOUBLE) - TRY_CAST("${b.name}" AS DOUBLE)`,
        prompt,
        parents: [a.name, b.name],
        createdAt: Date.now(),
      };
    },
  },
  {
    test: /(?:sum|total|add)\s+(?:of\s+)?([\w\s]+?)\s+(?:and|plus|with)\s+([\w\s]+)/i,
    build: (m, cols, prompt) => {
      const a = findCol(cols, m[1].trim());
      const b = findCol(cols, m[2].trim());
      if (!a || !b) return null;
      return {
        id: genId(),
        name: `${a.name}_plus_${b.name}`,
        sql: `COALESCE(TRY_CAST("${a.name}" AS DOUBLE), 0) + COALESCE(TRY_CAST("${b.name}" AS DOUBLE), 0)`,
        prompt,
        parents: [a.name, b.name],
        createdAt: Date.now(),
      };
    },
  },
  {
    test: /(?:extract\s+)?(year|month|day|hour|minute|week|quarter|dayofweek)\s+(?:of|from)\s+([\w\s]+)/i,
    build: (m, cols, prompt) => {
      const part = m[1].toLowerCase();
      const col = findCol(cols, m[2].trim());
      if (!col) return null;
      return {
        id: genId(),
        name: `${col.name}_${part}`,
        sql: `EXTRACT(${part.toUpperCase()} FROM TRY_CAST("${col.name}" AS TIMESTAMP))`,
        prompt,
        parents: [col.name],
        createdAt: Date.now(),
      };
    },
  },
  {
    test: /(?:length|len|chars?)\s+(?:of\s+)?([\w\s]+)/i,
    build: (m, cols, prompt) => {
      const col = findCol(cols, m[1].trim());
      if (!col) return null;
      return {
        id: genId(),
        name: `${col.name}_length`,
        sql: `LENGTH(CAST("${col.name}" AS VARCHAR))`,
        prompt,
        parents: [col.name],
        createdAt: Date.now(),
      };
    },
  },
  {
    test: /(?:upper|uppercase)\s+(?:of\s+)?([\w\s]+)/i,
    build: (m, cols, prompt) => {
      const col = findCol(cols, m[1].trim());
      if (!col) return null;
      return {
        id: genId(),
        name: `${col.name}_upper`,
        sql: `UPPER(CAST("${col.name}" AS VARCHAR))`,
        prompt,
        parents: [col.name],
        createdAt: Date.now(),
      };
    },
  },
  {
    test: /(?:bucket|bin|categorize)\s+([\w\s]+?)\s+(?:into|by)\s+(\d+)/i,
    build: (m, cols, prompt) => {
      const col = findCol(cols, m[1].trim());
      const buckets = parseInt(m[2], 10);
      if (!col || !buckets) return null;
      return {
        id: genId(),
        name: `${col.name}_bucket`,
        sql: `NTILE(${buckets}) OVER (ORDER BY TRY_CAST("${col.name}" AS DOUBLE))`,
        prompt,
        parents: [col.name],
        createdAt: Date.now(),
      };
    },
  },
  {
    test: /(?:flag|is)\s+([\w\s]+?)\s+(?:>|greater\s+than|above)\s+(\d+(?:\.\d+)?)/i,
    build: (m, cols, prompt) => {
      const col = findCol(cols, m[1].trim());
      if (!col) return null;
      const threshold = m[2];
      return {
        id: genId(),
        name: `${col.name}_above_${threshold.replace(".", "_")}`,
        sql: `CASE WHEN TRY_CAST("${col.name}" AS DOUBLE) > ${threshold} THEN 1 ELSE 0 END`,
        prompt,
        parents: [col.name],
        createdAt: Date.now(),
      };
    },
  },
  // X squared
  {
    test: /(?:square(?:d)?|squared?\s+of)\s+([\w\s]+)/i,
    build: (m, cols, prompt) => {
      const col = findCol(cols, m[1].trim());
      if (!col) return null;
      return {
        id: genId(),
        name: `${col.name}_squared`,
        sql: `POWER(TRY_CAST("${col.name}" AS DOUBLE), 2)`,
        prompt,
        parents: [col.name],
        createdAt: Date.now(),
      };
    },
  },
  // sqrt X
  {
    test: /(?:sqrt|square\s+root|root\s+of)\s+(?:of\s+)?([\w\s]+)/i,
    build: (m, cols, prompt) => {
      const col = findCol(cols, m[1].trim());
      if (!col) return null;
      return {
        id: genId(),
        name: `${col.name}_sqrt`,
        sql: `SQRT(TRY_CAST("${col.name}" AS DOUBLE))`,
        prompt,
        parents: [col.name],
        createdAt: Date.now(),
      };
    },
  },
  // log X
  {
    test: /(?:log(?:arithm)?|ln)\s+(?:of\s+)?([\w\s]+)/i,
    build: (m, cols, prompt) => {
      const col = findCol(cols, m[1].trim());
      if (!col) return null;
      return {
        id: genId(),
        name: `${col.name}_log`,
        sql: `LN(NULLIF(TRY_CAST("${col.name}" AS DOUBLE), 0))`,
        prompt,
        parents: [col.name],
        createdAt: Date.now(),
      };
    },
  },
  // |X|
  {
    test: /(?:abs(?:olute)?(?:\s+value)?)\s+(?:of\s+)?([\w\s]+)/i,
    build: (m, cols, prompt) => {
      const col = findCol(cols, m[1].trim());
      if (!col) return null;
      return {
        id: genId(),
        name: `${col.name}_abs`,
        sql: `ABS(TRY_CAST("${col.name}" AS DOUBLE))`,
        prompt,
        parents: [col.name],
        createdAt: Date.now(),
      };
    },
  },
  // clip X above N
  {
    test: /clip(?:ped)?\s+([\w\s]+?)\s+(?:above|>|over)\s+(\d+(?:\.\d+)?)/i,
    build: (m, cols, prompt) => {
      const col = findCol(cols, m[1].trim());
      if (!col) return null;
      const cap = m[2];
      return {
        id: genId(),
        name: `${col.name}_clipped`,
        sql: `LEAST(TRY_CAST("${col.name}" AS DOUBLE), ${cap})`,
        prompt,
        parents: [col.name],
        createdAt: Date.now(),
      };
    },
  },
  // date diff X - Y
  {
    test: /(?:date\s+diff|days?\s+between|date\s+difference)\s+([\w\s]+?)\s+(?:and|to|minus|-)\s+([\w\s]+)/i,
    build: (m, cols, prompt) => {
      const a = findCol(cols, m[1].trim());
      const b = findCol(cols, m[2].trim());
      if (!a || !b) return null;
      return {
        id: genId(),
        name: `days_${a.name}_to_${b.name}`,
        sql: `DATE_DIFF('day', TRY_CAST("${a.name}" AS TIMESTAMP), TRY_CAST("${b.name}" AS TIMESTAMP))`,
        prompt,
        parents: [a.name, b.name],
        createdAt: Date.now(),
      };
    },
  },
  // days since X
  {
    test: /days?\s+since\s+([\w\s]+)/i,
    build: (m, cols, prompt) => {
      const col = findCol(cols, m[1].trim());
      if (!col) return null;
      return {
        id: genId(),
        name: `days_since_${col.name}`,
        sql: `DATE_DIFF('day', TRY_CAST("${col.name}" AS TIMESTAMP), CURRENT_TIMESTAMP)`,
        prompt,
        parents: [col.name],
        createdAt: Date.now(),
      };
    },
  },
  // is weekend
  {
    test: /(?:is\s+)?weekend\s+(?:of|from|for)?\s*([\w\s]+)/i,
    build: (m, cols, prompt) => {
      const col = findCol(cols, m[1].trim());
      if (!col) return null;
      return {
        id: genId(),
        name: `${col.name}_is_weekend`,
        sql: `CASE WHEN EXTRACT(DOW FROM TRY_CAST("${col.name}" AS TIMESTAMP)) IN (0, 6) THEN 1 ELSE 0 END`,
        prompt,
        parents: [col.name],
        createdAt: Date.now(),
      };
    },
  },
  // hour of day from X
  {
    test: /(?:hour\s+of\s+day|hour-of-day|hours?)\s+(?:from|of)\s+([\w\s]+)/i,
    build: (m, cols, prompt) => {
      const col = findCol(cols, m[1].trim());
      if (!col) return null;
      return {
        id: genId(),
        name: `${col.name}_hour_of_day`,
        sql: `EXTRACT(HOUR FROM TRY_CAST("${col.name}" AS TIMESTAMP))`,
        prompt,
        parents: [col.name],
        createdAt: Date.now(),
      };
    },
  },
  // weekday name of X
  {
    test: /weekday\s+(?:name\s+)?(?:of|from)\s+([\w\s]+)/i,
    build: (m, cols, prompt) => {
      const col = findCol(cols, m[1].trim());
      if (!col) return null;
      return {
        id: genId(),
        name: `${col.name}_weekday`,
        sql: `DAYNAME(TRY_CAST("${col.name}" AS TIMESTAMP))`,
        prompt,
        parents: [col.name],
        createdAt: Date.now(),
      };
    },
  },
  // (X-min)/(max-min) — minmax-normalized
  {
    test: /(?:normali[sz]e|minmax|min[\s-]?max)\s+(?:of\s+)?([\w\s]+)/i,
    build: (m, cols, prompt) => {
      const col = findCol(cols, m[1].trim());
      if (!col) return null;
      return {
        id: genId(),
        name: `${col.name}_norm`,
        sql: `(TRY_CAST("${col.name}" AS DOUBLE) - MIN(TRY_CAST("${col.name}" AS DOUBLE)) OVER ()) / NULLIF(MAX(TRY_CAST("${col.name}" AS DOUBLE)) OVER () - MIN(TRY_CAST("${col.name}" AS DOUBLE)) OVER (), 0)`,
        prompt,
        parents: [col.name],
        createdAt: Date.now(),
      };
    },
  },
  // z-score of X
  {
    test: /(?:z[\s-]?score|standardi[sz]e|standard\s+score)\s+(?:of\s+)?([\w\s]+)/i,
    build: (m, cols, prompt) => {
      const col = findCol(cols, m[1].trim());
      if (!col) return null;
      return {
        id: genId(),
        name: `${col.name}_zscore`,
        sql: `(TRY_CAST("${col.name}" AS DOUBLE) - AVG(TRY_CAST("${col.name}" AS DOUBLE)) OVER ()) / NULLIF(STDDEV_POP(TRY_CAST("${col.name}" AS DOUBLE)) OVER (), 0)`,
        prompt,
        parents: [col.name],
        createdAt: Date.now(),
      };
    },
  },
  // rank of X
  {
    test: /rank\s+(?:of|by)\s+([\w\s]+)/i,
    build: (m, cols, prompt) => {
      const col = findCol(cols, m[1].trim());
      if (!col) return null;
      return {
        id: genId(),
        name: `${col.name}_rank`,
        sql: `RANK() OVER (ORDER BY TRY_CAST("${col.name}" AS DOUBLE) DESC)`,
        prompt,
        parents: [col.name],
        createdAt: Date.now(),
      };
    },
  },
  // cumulative sum of X
  {
    test: /(?:cumulative|cumsum|running\s+(?:sum|total))\s+(?:of\s+)?([\w\s]+)/i,
    build: (m, cols, prompt) => {
      const col = findCol(cols, m[1].trim());
      if (!col) return null;
      return {
        id: genId(),
        name: `${col.name}_cumsum`,
        sql: `SUM(TRY_CAST("${col.name}" AS DOUBLE)) OVER (ORDER BY ROWID)`,
        prompt,
        parents: [col.name],
        createdAt: Date.now(),
      };
    },
  },
];

function deriveByRule(req: DeriveFieldRequest): DerivedField | null {
  const p = req.prompt.trim();
  for (const pat of RULE_PATTERNS) {
    const m = p.match(pat.test);
    if (!m) continue;
    const f = pat.build(m, req.columns, p);
    if (f) return f;
  }
  return null;
}

export async function deriveField(
  req: DeriveFieldRequest,
): Promise<DeriveFieldResult> {
  if (!isLoaded()) {
    throw new Error(
      "No local model loaded. Start Ollama and select a model to derive fields with AI.",
    );
  }

  const system = `You translate user requests into a single DuckDB SQL expression that defines a new column.
Return strict JSON: {"name": "snake_case_name", "sql": "<DuckDB SQL expression>", "parents": ["col1", ...]}.
Rules:
- Use TRY_CAST for numeric ops on text columns.
- Always quote column names with double quotes.
- The SQL must be a valid expression usable inside SELECT.
- Do not include the AS alias; only the expression.`;

  const user = `Table: ${req.tableName}
Columns:
${schemaSummary(req.columns)}

Request: ${req.prompt}

JSON only.`;

  const raw = await chat(system, user, { maxTokens: 200, temperature: 0 });
  const parsed = parseJSON<{ name: string; sql: string; parents: string[] }>(
    raw,
  );

  return {
    source: "ai",
    field: {
      id: genId(),
      name: parsed.name,
      sql: parsed.sql,
      prompt: req.prompt,
      parents: parsed.parents ?? [],
      createdAt: Date.now(),
    },
  };
}

// ─── Chart recommendations ────────────────────────────────────────────────────

export interface ChartRecommendation {
  title: string;
  reason: string;
  spec: Omit<ChartSpec, "id">;
}

export function recommendCharts(
  _columns: ColumnInfo[],
  _cardinality?: Record<string, number>,
): ChartRecommendation[] {
  throw new Error(
    "Chart recommendations require a local Ollama model. Please start Ollama and select a model.",
  );
}

// ─── NL → ChartSpec (offline) ─────────────────────────────────────────────────

export async function nlToSpec(
  query: string,
  columns: ColumnInfo[],
  current?: ChartSpec,
): Promise<Partial<Omit<ChartSpec, "id">> | null> {
  if (!isLoaded()) {
    throw new Error(
      "No local model loaded. Start Ollama and select a model to generate chart specs.",
    );
  }

  const system = `You are a chart spec generator. Given a request, output JSON matching:
{"type": "<chart>", "encodings": [{"channel":"x|y|color|size","field":"<col>","aggregate":"none|sum|avg|count|min|max"}], "title": "<short>", "limit": <int>}.
Allowed chart types: ${ALLOWED_CHART_TYPES.join(", ")}.
Use only the columns listed.`;
  const user = `Columns:\n${schemaSummary(columns)}\n\nRequest: ${query}\n\nJSON only.`;
  const raw = await chat(system, user, { maxTokens: 350, temperature: 0 });
  const parsed = parseJSON<{
    type: ChartType;
    encodings: Array<{
      channel: string;
      field: string;
      aggregate?: string;
    }>;
    title: string;
    limit?: number;
  }>(raw);
  return {
    type: ALLOWED_CHART_TYPES.includes(parsed.type) ? parsed.type : "bar",
    title: parsed.title,
    limit: parsed.limit ?? 100,
    encodings: parsed.encodings.map((e) => ({
      id: genId(),
      channel: e.channel as Encoding["channel"],
      field: e.field,
      aggregate: (e.aggregate as AggregateFn) ?? "none",
    })),
    filters: current?.filters ?? [],
  };
}

function nlToSpecRule(
  query: string,
  columns: ColumnInfo[],
  current?: ChartSpec,
): Partial<Omit<ChartSpec, "id">> | null {
  const q = query.toLowerCase().trim();
  if (!q) return null;
  const num = columns.filter((c) => c.type === "number");
  const cat = columns.filter((c) => c.type === "string");
  const date = columns.filter((c) => c.type === "date");

  // ── Refinements on an existing spec ─────────────────────────────────────
  if (current) {
    // type changes
    if (/(make\s+it\s+)?(donut|ring)/.test(q)) return { type: "donut" };
    if (/(make\s+it\s+)?pie\b/.test(q)) return { type: "pie" };
    if (/(make\s+it\s+)?area\b/.test(q)) return { type: "area" };
    if (/(make\s+it\s+)?(line|trend\s*line)\b/.test(q)) return { type: "line" };
    if (/(make\s+it\s+)?(scatter|point)/.test(q)) return { type: "scatter" };
    if (/(make\s+it\s+)?(bar|column)/.test(q)) return { type: "bar" };
    if (/(make\s+it\s+)?(treemap)/.test(q)) return { type: "treemap" };
    if (/(make\s+it\s+)?(radar|spider)/.test(q)) return { type: "radar" };
    if (/funnel/.test(q)) return { type: "funnel" };
    if (/heatmap/.test(q)) return { type: "heatmap" };

    if (/(horizontal|sideways|flip\s+axes?|swap\s+axes?|transpose)/.test(q)) {
      return {
        type:
          current.type === "stacked-bar"
            ? "stacked-horizontal-bar"
            : "horizontal-bar",
      };
    }

    // stack / split / facet / color by
    const stackMatch = q.match(
      /(?:stack(?:ed)?|split|facet|color|colour|group)\s+(?:by|on)\s+([\w\s]+?)(?:\s+only|\s+and|$)/,
    );
    if (stackMatch) {
      const col = findCol(columns, stackMatch[1]);
      if (col) {
        const channel = /facet/.test(q) ? "facet" : "color";
        return {
          type: /stack/.test(q) ? "stacked-bar" : current.type,
          encodings: [
            ...current.encodings.filter((e) => e.channel !== channel),
            { id: genId(), channel, field: col.name, aggregate: "none" },
          ],
        };
      }
    }

    if (/add\s+trend(?:line)?|show\s+trend|with\s+trend/.test(q)) {
      return { showTrendline: true };
    }
    if (/(remove|hide)\s+trend/.test(q)) {
      return { showTrendline: false };
    }
    if (/(show|highlight|mark)\s+outliers?/.test(q)) {
      return { showOutliers: true };
    }
    if (/(hide|remove)\s+outliers?/.test(q)) {
      return { showOutliers: false };
    }

    // Top/bottom N
    const topN = q.match(/(?:top|first|biggest|largest)\s+(\d+)/);
    if (topN)
      return { topN: parseInt(topN[1], 10), limit: parseInt(topN[1], 10) };
    const botN = q.match(/(?:bottom|smallest|last|fewest)\s+(\d+)/);
    if (botN) {
      const n = parseInt(botN[1], 10);
      return {
        topN: n,
        limit: n,
        encodings: current.encodings.map((e) =>
          e.channel === "y" ? { ...e, sort: "asc" as const } : e,
        ),
      };
    }

    // Limit N
    const lim = q.match(/limit\s+(?:to\s+)?(\d+)/);
    if (lim) return { limit: parseInt(lim[1], 10) };

    // Sort
    if (/(sort|order)\s+(?:by\s+)?(asc|ascending|low\s+to\s+high)/.test(q)) {
      return {
        encodings: current.encodings.map((e) =>
          e.channel === "y" ? { ...e, sort: "asc" as const } : e,
        ),
      };
    }
    if (/(sort|order)\s+(?:by\s+)?(desc|descending|high\s+to\s+low)/.test(q)) {
      return {
        encodings: current.encodings.map((e) =>
          e.channel === "y" ? { ...e, sort: "desc" as const } : e,
        ),
      };
    }

    // Last N days/weeks/months on a date axis
    const lastN = q.match(
      /(?:only\s+)?(?:last|past|previous)\s+(\d+)\s+(day|week|month|year)s?/,
    );
    if (lastN && date[0]) {
      const n = parseInt(lastN[1], 10);
      const unit = lastN[2].toUpperCase();
      return {
        filters: [
          ...current.filters.filter((f) => f.field !== date[0].name),
          {
            id: genId(),
            field: date[0].name,
            op: ">=" as const,
            value: `(CURRENT_DATE - INTERVAL ${n} ${unit})`,
          },
        ],
      };
    }

    // Aggregate switches on Y
    const aggMatch = q.match(
      /(?:as|use|switch\s+to)\s+(sum|average|avg|mean|median|count|min|max|distinct)/,
    );
    if (aggMatch) {
      const aggMap: Record<string, AggregateFn> = {
        sum: "sum",
        average: "avg",
        avg: "avg",
        mean: "avg",
        median: "median",
        count: "count",
        min: "min",
        max: "max",
        distinct: "distinct",
      };
      const agg = aggMap[aggMatch[1]];
      return {
        encodings: current.encodings.map((e) =>
          e.channel === "y" ? { ...e, aggregate: agg } : e,
        ),
      };
    }

    // Normalise / as percentage → keep type but enforce sort + small-N
    if (/(normalize|normalise|as\s+(?:%|percent|percentage))/.test(q)) {
      return { type: "donut" };
    }
  }

  // ── New chart from scratch ──────────────────────────────────────────────

  // "top N <dim> by <metric>"
  const topMatch = q.match(
    /(?:top|first|biggest|largest)\s+(\d+)\s+([\w\s]+?)\s+by\s+([\w\s]+)/,
  );
  if (topMatch) {
    const limit = parseInt(topMatch[1], 10);
    const dim = findCol(columns, topMatch[2]) ?? cat[0];
    const metric = findCol(columns, topMatch[3]) ?? num[0];
    if (dim && metric) {
      return {
        type: "bar",
        limit,
        topN: limit,
        title: `Top ${limit} ${dim.name} by ${metric.name}`,
        encodings: [
          { id: genId(), channel: "x", field: dim.name, aggregate: "none" },
          {
            id: genId(),
            channel: "y",
            field: metric.name,
            aggregate: "sum",
            sort: "desc",
          },
        ],
        filters: [],
      };
    }
  }

  // "bottom N <dim> by <metric>"
  const botMatch = q.match(
    /(?:bottom|smallest|last|fewest)\s+(\d+)\s+([\w\s]+?)\s+by\s+([\w\s]+)/,
  );
  if (botMatch) {
    const limit = parseInt(botMatch[1], 10);
    const dim = findCol(columns, botMatch[2]) ?? cat[0];
    const metric = findCol(columns, botMatch[3]) ?? num[0];
    if (dim && metric) {
      return {
        type: "bar",
        limit,
        topN: limit,
        title: `Bottom ${limit} ${dim.name} by ${metric.name}`,
        encodings: [
          { id: genId(), channel: "x", field: dim.name, aggregate: "none" },
          {
            id: genId(),
            channel: "y",
            field: metric.name,
            aggregate: "sum",
            sort: "asc",
          },
        ],
        filters: [],
      };
    }
  }

  // "<metric> by <dim>" / "<metric> per <dim>" / "<metric> across <dim>" / "break down <metric> by <dim>"
  const byMatch = q.match(
    /(?:break(?:down)?\s+)?([\w\s]+?)\s+(?:by|per|across|grouped\s+by|broken\s+down\s+by|split\s+by|on)\s+([\w\s]+)/,
  );
  if (byMatch) {
    const metric = findCol(columns, byMatch[1]);
    const dim = findCol(columns, byMatch[2]);
    if (metric && dim && metric.name !== dim.name) {
      return {
        type: "bar",
        title: `${metric.name} by ${dim.name}`,
        limit: 50,
        encodings: [
          { id: genId(), channel: "x", field: dim.name, aggregate: "none" },
          {
            id: genId(),
            channel: "y",
            field: metric.name,
            aggregate: metric.type === "number" ? "sum" : "count",
            sort: "desc",
          },
        ],
        filters: [],
      };
    }
  }

  // Aggregate of column: "sum of X", "average X", "count of X", "median X"
  const aggMatch = q.match(
    /(?:^|\s)(sum|total|average|avg|mean|median|count|number|min(?:imum)?|max(?:imum)?|distinct\s+count)\s+(?:of\s+)?([\w\s]+)/,
  );
  if (aggMatch) {
    const m = aggMatch[1];
    const map: Record<string, AggregateFn> = {
      sum: "sum",
      total: "sum",
      average: "avg",
      avg: "avg",
      mean: "avg",
      median: "median",
      count: "count",
      number: "count",
      min: "min",
      minimum: "min",
      max: "max",
      maximum: "max",
      "distinct count": "distinct",
    };
    const agg = map[m] ?? "sum";
    const fld = findCol(columns, aggMatch[2]) ?? num[0];
    if (fld) {
      return {
        type: "bar",
        encodings: [
          {
            id: genId(),
            channel: "x",
            field: cat[0]?.name ?? fld.name,
            aggregate: "none",
          },
          { id: genId(), channel: "y", field: fld.name, aggregate: agg },
        ],
        title: `${m} ${fld.name}${cat[0] ? ` by ${cat[0].name}` : ""}`,
        limit: 30,
        filters: [],
      };
    }
  }

  // "how many X" → count
  const howMany = q.match(/how\s+many\s+([\w\s]+)/);
  if (howMany) {
    const dim = findCol(columns, howMany[1]) ?? cat[0];
    if (dim) {
      return {
        type: "bar",
        encodings: [
          { id: genId(), channel: "x", field: dim.name, aggregate: "none" },
          {
            id: genId(),
            channel: "y",
            field: dim.name,
            aggregate: "count",
            sort: "desc",
          },
        ],
        title: `Count of ${dim.name}`,
        limit: 30,
        filters: [],
      };
    }
  }

  // Distribution / histogram
  if (/distribution|histogram|spread|range\s+of/.test(q)) {
    const fld =
      num.find((c) => q.includes(c.name.toLowerCase().replace(/_/g, " "))) ??
      num.find((c) => q.includes(c.name.toLowerCase())) ??
      num[0];
    if (fld) {
      return {
        type: "bar",
        encodings: [
          {
            id: genId(),
            channel: "x",
            field: fld.name,
            aggregate: "count",
            bin: true,
          },
        ],
        title: `Distribution of ${fld.name}`,
        limit: 30,
        filters: [],
      };
    }
  }

  // Trend / over time / timeline / evolution
  if (
    /(trend|over\s+time|timeline|evolution|growth|history|across\s+time)/.test(
      q,
    )
  ) {
    const dateCol = date[0];
    const metric = num.find((c) => q.includes(c.name.toLowerCase())) ?? num[0];
    if (dateCol && metric) {
      return {
        type: "line",
        encodings: [
          { id: genId(), channel: "x", field: dateCol.name, aggregate: "none" },
          { id: genId(), channel: "y", field: metric.name, aggregate: "sum" },
        ],
        title: `${metric.name} over time`,
        showTrendline: true,
        limit: 200,
        filters: [],
      };
    }
  }

  // Heatmap / cross-tab
  if (/heatmap|cross[\s-]?tab|matrix|two[\s-]?way/.test(q)) {
    if (cat[0] && cat[1] && num[0]) {
      return {
        type: "heatmap",
        encodings: [
          { id: genId(), channel: "x", field: cat[0].name },
          { id: genId(), channel: "y", field: cat[1].name },
          {
            id: genId(),
            channel: "size",
            field: num[0].name,
            aggregate: "sum",
          },
        ],
        title: `${cat[0].name} × ${cat[1].name}`,
        limit: 400,
        filters: [],
      };
    }
  }

  // Funnel
  if (/funnel|drop[\s-]?off|stage/.test(q) && cat[0] && num[0]) {
    return {
      type: "funnel",
      encodings: [
        { id: genId(), channel: "x", field: cat[0].name },
        { id: genId(), channel: "y", field: num[0].name, aggregate: "sum" },
      ],
      title: `${cat[0].name} funnel`,
      limit: 10,
      filters: [],
    };
  }

  // Composition / share / breakdown / proportion → donut
  if (
    /(composition|share|breakdown|proportion|mix|percent\s+of|percentage\s+of|pie\s+chart)/.test(
      q,
    )
  ) {
    const dim = cat[0];
    if (dim) {
      return {
        type: "donut",
        encodings: [
          { id: genId(), channel: "x", field: dim.name, aggregate: "none" },
          {
            id: genId(),
            channel: "y",
            field: num[0]?.name ?? dim.name,
            aggregate: num[0] ? "sum" : "count",
          },
        ],
        title: `${dim.name} composition`,
        limit: 12,
        filters: [],
      };
    }
  }

  // Compare / vs / versus / against → scatter
  if (
    /(compare|versus|\bvs\b|against|relationship\s+between|correlate|correlation)/.test(
      q,
    )
  ) {
    if (num.length >= 2) {
      // try to match the two named columns
      const tokens = q.split(/[\s,]+/).filter(Boolean);
      const matched = tokens
        .map((t) => findCol(num, t))
        .filter(Boolean) as ColumnInfo[];
      const a = matched[0] ?? num[0];
      const b = matched[1] ?? num.find((c) => c.name !== a.name) ?? num[1];
      return {
        type: "scatter",
        encodings: [
          { id: genId(), channel: "x", field: a.name, aggregate: "none" },
          { id: genId(), channel: "y", field: b.name, aggregate: "none" },
          ...(cat[0]
            ? [
                {
                  id: genId(),
                  channel: "color" as const,
                  field: cat[0].name,
                  aggregate: "none" as const,
                },
              ]
            : []),
        ],
        title: `${a.name} vs ${b.name}`,
        limit: 1000,
        filters: [],
      };
    }
  }

  // Forecast / predict
  if (/(forecast|predict|projection|future)/.test(q) && date[0] && num[0]) {
    return {
      type: "line",
      encodings: [
        { id: genId(), channel: "x", field: date[0].name, aggregate: "none" },
        { id: genId(), channel: "y", field: num[0].name, aggregate: "sum" },
      ],
      title: `Forecast of ${num[0].name}`,
      showTrendline: true,
      limit: 365,
      filters: [],
    };
  }

  // Outliers in X
  if (/outliers?\s+(?:in|of)\s+([\w\s]+)/.test(q)) {
    const m = q.match(/outliers?\s+(?:in|of)\s+([\w\s]+)/);
    const fld = m ? (findCol(columns, m[1]) ?? num[0]) : num[0];
    if (fld) {
      return {
        type: "bar",
        encodings: [
          {
            id: genId(),
            channel: "x",
            field: fld.name,
            aggregate: "count",
            bin: true,
          },
        ],
        title: `Outliers in ${fld.name}`,
        limit: 30,
        showOutliers: true,
        filters: [],
      };
    }
  }

  return null;
}

// ── Best-effort never-throw fallback ──────────────────────────────────────
function bestEffortSpec(
  query: string,
  columns: ColumnInfo[],
): Partial<Omit<ChartSpec, "id">> {
  const num = columns.filter((c) => c.type === "number");
  const cat = columns.filter((c) => c.type === "string");
  const date = columns.filter((c) => c.type === "date");

  // Look for any column name mentioned in the query
  const mentioned = columns.find((c) =>
    query.toLowerCase().includes(c.name.toLowerCase().replace(/_/g, " ")),
  );

  // Default: most informative single-column chart we can build
  if (date[0] && num[0]) {
    return {
      type: "line",
      encodings: [
        { id: genId(), channel: "x", field: date[0].name, aggregate: "none" },
        { id: genId(), channel: "y", field: num[0].name, aggregate: "sum" },
      ],
      title: `${num[0].name} over time (best-guess)`,
      showTrendline: true,
      limit: 200,
      filters: [],
    };
  }
  if (cat[0] && num[0]) {
    return {
      type: "bar",
      encodings: [
        { id: genId(), channel: "x", field: cat[0].name, aggregate: "none" },
        {
          id: genId(),
          channel: "y",
          field: num[0].name,
          aggregate: "sum",
          sort: "desc",
        },
      ],
      title: `${num[0].name} by ${cat[0].name} (best-guess)`,
      limit: 20,
      topN: 20,
      filters: [],
    };
  }
  if (mentioned) {
    return {
      type: "bar",
      encodings: [
        {
          id: genId(),
          channel: "x",
          field: mentioned.name,
          aggregate: "none",
        },
        {
          id: genId(),
          channel: "y",
          field: mentioned.name,
          aggregate: "count",
          sort: "desc",
        },
      ],
      title: `Count of ${mentioned.name} (best-guess)`,
      limit: 30,
      filters: [],
    };
  }
  // Last-resort
  return {
    type: "bar",
    encodings: cat[0]
      ? [
          { id: genId(), channel: "x", field: cat[0].name, aggregate: "none" },
          {
            id: genId(),
            channel: "y",
            field: cat[0].name,
            aggregate: "count",
          },
        ]
      : [],
    title: "Best-effort chart",
    limit: 20,
    filters: [],
  };
}

// ─── Outlier detection (IQR) ──────────────────────────────────────────────────

export function flagOutliers(values: number[]): boolean[] {
  if (values.length < 4) return values.map(() => false);
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  return values.map((v) => v < lo || v > hi);
}

// ─── Linear trendline ─────────────────────────────────────────────────────────

export function linearTrendline(values: number[]): number[] {
  const n = values.length;
  if (n < 2) return values.slice();
  const xs = Array.from({ length: n }, (_, i) => i);
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (values[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;
  return xs.map((x) => slope * x + intercept);
}
