// ─── LLM Insight Schema (Zod) ─────────────────────────────────────────────────
//
// Structured contract for LLM-narrated insights. The schema is intentionally
// small and bounded so that even tiny local models (transformers.js / WASM) can
// satisfy it, and so `parseStructured` can repair-and-validate noisy output.
//
// The screen ALWAYS renders deterministic rule-based insights first; LLM output
// is validated against this schema and merged in asynchronously when (and only
// when) a provider is available. A schema/parse failure degrades silently back
// to the rule-based set — narration never blocks or breaks the analysis.

import { z } from "zod";

export const INSIGHT_CATEGORIES = [
  "anomaly",
  "trend",
  "correlation",
  "quality",
  "pattern",
  "forecast",
] as const;

export const INSIGHT_SEVERITIES = ["critical", "warning", "info", "success"] as const;

export const INSIGHT_IMPACTS = ["high", "medium", "low"] as const;

export const LlmInsightSchema = z.object({
  category: z.enum(INSIGHT_CATEGORIES),
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(600),
  severity: z.enum(INSIGHT_SEVERITIES),
  impact: z.enum(INSIGHT_IMPACTS),
  confidence: z.number().min(0).max(1),
});

export const LlmInsightResponseSchema = z.object({
  insights: z.array(LlmInsightSchema).max(8),
});

export type LlmInsight = z.infer<typeof LlmInsightSchema>;
export type LlmInsightResponse = z.infer<typeof LlmInsightResponseSchema>;

/** A compact, model-friendly hint of the expected JSON shape. */
export const INSIGHT_SCHEMA_HINT = `{
  "insights": [
    {
      "category": "anomaly|trend|correlation|quality|pattern|forecast",
      "title": "string (<= 120 chars)",
      "description": "string (<= 600 chars, cite the provided numbers)",
      "severity": "critical|warning|info|success",
      "impact": "high|medium|low",
      "confidence": 0.0
    }
  ]
}`;
