/**
 * Typed, deterministic prompt builders for the AI briefing feature.
 *
 * All prompts are derived from the real `BriefingContext` (DuckDB-aggregated),
 * never from hard-coded sample data. Keeping these pure and centralised makes
 * the generation calls in the tab components small and consistent.
 */

import type { BriefingContext, NumericColumnStat } from "./briefing-context";

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return Math.abs(n) >= 1000 ? Math.round(n).toLocaleString() : Number(n.toFixed(2)).toString();
}

function describeNumeric(cols: NumericColumnStat[]): string {
  if (cols.length === 0) return "No numeric columns are present.";
  return cols
    .map(
      (c) =>
        `${c.name}: mean ${fmt(c.mean)} (σ ${fmt(c.std)}, range ${fmt(c.min)}–${fmt(c.max)}` +
        (c.nullPct >= 1 ? `, ${c.nullPct.toFixed(0)}% null` : "") +
        ")",
    )
    .join("; ");
}

function describeCategory(ctx: BriefingContext): string {
  if (!ctx.topCategory) return "";
  const top = ctx.topCategory.values.map((v) => `${v.label} (${v.pct.toFixed(0)}%)`).join(", ");
  return ` Top "${ctx.topCategory.dimension}" values: ${top}.`;
}

/** Shared factual context string used by every prompt. */
export function buildContextSummary(ctx: BriefingContext): string {
  return (
    `Dataset "${ctx.datasetName}" with ${ctx.rowCount.toLocaleString()} rows. ` +
    `${describeNumeric(ctx.numericCols)}.${describeCategory(ctx)}`
  );
}

// ─── Daily briefing ───────────────────────────────────────────────────────────

export function buildDailyBriefingPrompt(ctx: BriefingContext): {
  system: string;
  prompt: string;
} {
  return {
    system:
      "You are a professional data analyst presenting a daily briefing in a clear, news-anchor style. " +
      "Write exactly 3 short paragraphs separated by a blank line: (1) overall scale and what the data covers, " +
      "(2) the most notable numeric patterns, (3) concerns or things to watch. Plain prose only, no headings, no bullet lists.",
    prompt: buildContextSummary(ctx),
  };
}

// ─── Executive summary ────────────────────────────────────────────────────────

export function buildExecutiveSummaryPrompt(ctx: BriefingContext): {
  system: string;
  prompt: string;
} {
  return {
    system:
      "You are a senior business analyst writing for executive management. Be concise, data-driven, and action-oriented. " +
      "Write exactly 3 paragraphs: Overview, Key drivers, Recommendations. No headings, no markdown fences.",
    prompt: buildContextSummary(ctx),
  };
}

// ─── Action plan ──────────────────────────────────────────────────────────────

export function buildActionPlanPrompt(ctx: BriefingContext): {
  system: string;
  prompt: string;
} {
  return {
    system:
      "You are an operations expert. Analyse the dataset summary and produce a prioritised action plan. " +
      'Return a JSON object: {"items": [{ "priority": 1-5, "category": "critical"|"high"|"medium"|"low", ' +
      '"action": string, "rationale": string, "estimatedImpact": string }]}. ' +
      "Provide 5 items ordered by priority (1 = most urgent). Ground every action in the data provided.",
    prompt: buildContextSummary(ctx),
  };
}

// ─── Anomaly explanation ──────────────────────────────────────────────────────

export function buildAnomalyExplanationPrompt(args: {
  datasetName: string;
  column: string;
  count: number;
  maxZ: number;
  min: number;
  max: number;
  examples: number[];
}): { system: string; prompt: string } {
  return {
    system:
      "You are a senior data analyst. Given a numeric anomaly, return a JSON object " +
      '{"explanation": string, "hypotheses": [string, string, string]}. ' +
      "The explanation is 1-2 sentences on what the anomaly means for the business. " +
      "Provide exactly 3 concrete, distinct root-cause hypotheses.",
    prompt:
      `Dataset "${args.datasetName}". Column "${args.column}": ${args.count} anomalous values, ` +
      `z-score up to ${args.maxZ}, observed range ${fmt(args.min)}–${fmt(args.max)}, ` +
      `example outliers: ${args.examples.map(fmt).join(", ")}.`,
  };
}

// ─── Anomaly investigation report ─────────────────────────────────────────────

export function buildAnomalyReportPrompt(args: { datasetName: string; summary: string }): {
  system: string;
  prompt: string;
} {
  return {
    system:
      "You are a senior data analyst writing a formal investigation report. Structure it with these sections " +
      "(use plain paragraph headers): Executive Summary, Findings, Risk Assessment, Recommended Actions. " +
      "Be thorough and professional. No markdown fences.",
    prompt: `Dataset "${args.datasetName}". Detected anomalies:\n${args.summary}`,
  };
}

// ─── Data story (single constrained call) ─────────────────────────────────────

export function buildDataStoryPrompt(ctx: BriefingContext): {
  system: string;
  prompt: string;
} {
  return {
    system:
      "You are a data storyteller. Given a dataset summary, return a JSON object with three rich narrative " +
      'paragraphs: {"setup": string, "conflict": string, "resolution": string}. ' +
      '"setup" introduces the data and context; "conflict" highlights the problems, anomalies, or weak spots; ' +
      '"resolution" is forward-looking and recommends next steps. Each paragraph is one cohesive paragraph, no headings.',
    prompt: buildContextSummary(ctx),
  };
}
