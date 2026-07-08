/**
 * Offline statistical insights engine.
 * Powered by simple-statistics for robust math.
 * LLM layer is optional and dependency-injected: pass a `generateText`
 * callback (bound to `useAI().generate` by the caller) to upgrade the
 * rule-based results; omit it (e.g. no model downloaded yet) to stay fully
 * offline and rule-based. This mirrors the DI shape used by
 * `@/features/telecom/lib/ai-agent.ts` so this module stays hook-free.
 */

import * as ss from "simple-statistics";
import type { ColMeta } from "@/core/stores/data-store";

/**
 * Injected LLM text-generation callback. Callers bind this to
 * `useAI().generate` (extracting `.text` from the `AIResult`); omitting it
 * keeps `generateInsights` / `recommendCharts` fully rule-based.
 */
type LLMGenerate = (
  prompt: string,
  opts: { systemPrompt: string; maxTokens: number; temperature: number },
) => Promise<string>;

// ─── Correlation helper ───────────────────────────────────────────────────────

function pearsonCorr(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  const a = xs.slice(0, n);
  const b = ys.slice(0, n);
  // A constant (zero-variance) series has no linear relationship and makes
  // sampleCorrelation divide by a zero standard deviation → NaN. Return 0.
  if (ss.variance(a) === 0 || ss.variance(b) === 0) return 0;
  const r = ss.sampleCorrelation(a, b);
  return Number.isFinite(r) ? r : 0;
}

// ─── Linear regression / forecast ─────────────────────────────────────────────

export interface Forecast {
  historical: { x: number; y: number }[];
  predicted: { x: number; y: number }[];
  r2: number;
  slope: number;
  intercept: number;
  trend: "up" | "down" | "flat";
}

export function linearForecast(values: number[], steps = 6): Forecast {
  const n = values.length;
  if (n < 2) {
    return {
      historical: [],
      predicted: [],
      r2: 0,
      slope: 0,
      intercept: 0,
      trend: "flat",
    };
  }

  const pairs: [number, number][] = values.map((y, i) => [i, y]);
  const reg = ss.linearRegression(pairs);
  const line = ss.linearRegressionLine(reg);
  // rSquared is 0/0 = NaN when the series is constant; coerce NaN → 0.
  const rawR2 = ss.rSquared(pairs, line);
  const r2 = Number.isFinite(rawR2) ? Math.max(0, Math.min(1, rawR2)) : 0;

  const historical = values.map((y, x) => ({ x, y }));
  const predicted = Array.from({ length: steps }, (_, i) => ({
    x: n + i,
    y: line(n + i),
  }));

  const my = ss.mean(values);

  return {
    historical,
    predicted,
    r2,
    slope: reg.m,
    intercept: reg.b,
    trend: Math.abs(reg.m) < 0.001 * Math.abs(my) ? "flat" : reg.m > 0 ? "up" : "down",
  };
}

// ─── Additional stats helpers (powered by simple-statistics) ──────────────────

function computeSkewness(values: number[]): number {
  if (values.length < 3) return 0;
  return ss.sampleSkewness(values);
}

// ─── Auto-insight generator ───────────────────────────────────────────────────

export interface Insight {
  type: "trend" | "anomaly" | "correlation" | "distribution" | "quality" | "outlier";
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  value?: number | string;
  columnName?: string;
}

// ─── Rule-based insight fallback ─────────────────────────────────────────────

function ruleBasedInsights(
  cols: ColMeta[],
  rowCount: number,
  numericData: Record<string, number[]>,
): Insight[] {
  const insights: Insight[] = [];

  // Quality: high null rate
  for (const col of cols) {
    if (col.nullCount > 0) {
      const nullPct = (col.nullCount / rowCount) * 100;
      if (nullPct >= 20) {
        insights.push({
          type: "quality",
          severity: nullPct >= 50 ? "critical" : "warning",
          title: `High missing-value rate in "${col.name}"`,
          description: `${nullPct.toFixed(1)}% of values are null. Consider imputation or exclusion.`,
          value: `${nullPct.toFixed(1)}%`,
          columnName: col.name,
        });
      }
    }
  }

  // Distribution: skewness
  for (const [colName, values] of Object.entries(numericData)) {
    if (values.length < 4) continue;
    const skew = computeSkewness(values);
    if (Math.abs(skew) > 1) {
      insights.push({
        type: "distribution",
        severity: "info",
        title: `Skewed distribution in "${colName}"`,
        description: `Skewness of ${skew.toFixed(2)} — ${skew > 0 ? "right" : "left"}-skewed data. Log transformation may help.`,
        value: skew,
        columnName: colName,
      });
    }
  }

  // Trend: linear regression slope
  for (const [colName, values] of Object.entries(numericData)) {
    if (values.length < 5) continue;
    const forecast = linearForecast(values, 0);
    if (forecast.trend !== "flat" && forecast.r2 > 0.5) {
      insights.push({
        type: "trend",
        severity: "info",
        title: `${forecast.trend === "up" ? "Upward" : "Downward"} trend in "${colName}"`,
        description: `R² = ${forecast.r2.toFixed(2)}, slope = ${forecast.slope.toFixed(3)}. The series shows a consistent ${forecast.trend}ward direction.`,
        value: forecast.slope,
        columnName: colName,
      });
    }
  }

  // Correlation: high pearson pairs
  const numColNames = Object.keys(numericData);
  for (let i = 0; i < numColNames.length; i++) {
    for (let j = i + 1; j < numColNames.length; j++) {
      const a = numericData[numColNames[i]] ?? [];
      const b = numericData[numColNames[j]] ?? [];
      if (a.length < 4 || b.length < 4) continue;
      const r = pearsonCorr(a, b);
      if (Math.abs(r) > 0.8) {
        insights.push({
          type: "correlation",
          severity: "info",
          title: `Strong correlation between "${numColNames[i]}" and "${numColNames[j]}"`,
          description: `Pearson r = ${r.toFixed(2)}. These columns are highly ${r > 0 ? "positively" : "negatively"} correlated.`,
          value: r,
        });
      }
    }
  }

  return insights.slice(0, 5);
}

export async function generateInsights(
  cols: ColMeta[],
  rowCount: number,
  numericData?: Record<string, number[]>,
  generateText?: LLMGenerate,
): Promise<Insight[]> {
  const _numericData = numericData ?? {};

  // Compute basic stats for each numeric column
  const statsSummary: Record<
    string,
    { mean: number; stddev: number; skewness: number; nullPct: number }
  > = {};
  for (const [colName, values] of Object.entries(_numericData)) {
    if (values.length < 2) continue;
    const nullCol = cols.find((c) => c.name === colName);
    statsSummary[colName] = {
      mean: Number(ss.mean(values).toFixed(3)),
      stddev: Number(ss.sampleStandardDeviation(values).toFixed(3)),
      skewness: values.length >= 3 ? Number(ss.sampleSkewness(values).toFixed(3)) : 0,
      nullPct:
        nullCol && rowCount > 0 ? Number(((nullCol.nullCount / rowCount) * 100).toFixed(1)) : 0,
    };
  }

  if (!generateText) {
    return ruleBasedInsights(cols, rowCount, _numericData);
  }

  try {
    const colNames = cols.map((c) => `${c.name}(${c.type})`).join(", ");
    const statsJson = JSON.stringify(statsSummary);

    const userPrompt = `Dataset: ${rowCount} rows, columns: ${colNames}. Stats: ${statsJson}`;

    const raw = await generateText(userPrompt, {
      systemPrompt:
        "You are a data analyst. Given dataset stats, return 3-5 insights as a JSON array only — no prose, no markdown fences. Schema: [{type, severity, title, description}]. Types: trend|anomaly|correlation|distribution|quality. Severities: info|warning|critical. Be concise.",
      maxTokens: 600,
      temperature: 0.3,
    });

    // Extract JSON array from the response
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON array in LLM response");

    const parsed = JSON.parse(jsonMatch[0]) as Insight[];
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("Empty or invalid array");

    return parsed;
  } catch {
    // LLM failed — return rule-based results so the UI is never empty
    return ruleBasedInsights(cols, rowCount, _numericData);
  }
}
// ─── Chart type recommender ───────────────────────────────────────────────────

export interface ChartRecommendation {
  type: "bar" | "line" | "scatter" | "pie" | "heatmap" | "histogram" | "box";
  title: string;
  reason: string;
  xCol?: string;
  yCol?: string;
  colorCol?: string;
  confidence: number; // 0-1
}

// ─── Rule-based chart-recommendation fallback ────────────────────────────────

function ruleBasedCharts(cols: ColMeta[], rowCount: number): ChartRecommendation[] {
  const recs: ChartRecommendation[] = [];
  const nums = cols.filter((c) => c.type === "number");
  const strs = cols.filter((c) => c.type === "string");
  const dates = cols.filter((c) => c.type === "date");

  if (nums.length > 0 && strs.length > 0) {
    recs.push({
      type: "bar",
      title: `${nums[0].name} by ${strs[0].name}`,
      reason: "Compare a numeric metric across a categorical dimension.",
      xCol: strs[0].name,
      yCol: nums[0].name,
      confidence: 0.85,
    });
  }

  if (dates.length > 0 && nums.length > 0) {
    recs.push({
      type: "line",
      title: `${nums[0].name} over time`,
      reason: "Visualise the trend of a numeric metric over a date column.",
      xCol: dates[0].name,
      yCol: nums[0].name,
      confidence: 0.9,
    });
  }

  if (nums.length >= 2) {
    recs.push({
      type: "scatter",
      title: `${nums[0].name} vs ${nums[1].name}`,
      reason: "Explore correlation between two numeric columns.",
      xCol: nums[0].name,
      yCol: nums[1].name,
      confidence: 0.75,
    });
  }

  if (strs.length > 0 && rowCount > 0 && rowCount < 20000) {
    recs.push({
      type: "pie",
      title: `Distribution of ${strs[0].name}`,
      reason: "Show the proportional breakdown of a categorical column.",
      xCol: strs[0].name,
      confidence: 0.7,
    });
  }

  return recs.slice(0, 3);
}

export async function recommendCharts(
  cols: ColMeta[],
  rowCount?: number,
  generateText?: LLMGenerate,
): Promise<ChartRecommendation[]> {
  if (!generateText) {
    return ruleBasedCharts(cols, rowCount ?? 0);
  }

  try {
    const colSchema = cols
      .map((c) => {
        const extras: string[] = [];
        if (c.distinctCount) extras.push(`${c.distinctCount} distinct`);
        return `${c.name}(${c.type}${extras.length ? `, ${extras.join(", ")}` : ""})`;
      })
      .join("; ");

    const userPrompt = `Columns: ${colSchema}. Row count: ${rowCount ?? "unknown"}.`;

    const raw = await generateText(userPrompt, {
      systemPrompt:
        "You are a data visualisation expert. Given column schema, recommend 2-3 chart types as a JSON array only — no prose, no markdown fences. Schema: [{type, title, reason, xCol, yCol, confidence}]. type must be one of: bar|line|scatter|pie|heatmap|histogram|box. confidence is 0-1.",
      maxTokens: 400,
      temperature: 0.3,
    });

    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON array in LLM response");

    const parsed = JSON.parse(jsonMatch[0]) as ChartRecommendation[];
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("Empty or invalid array");

    return parsed;
  } catch {
    return ruleBasedCharts(cols, rowCount ?? 0);
  }
}
