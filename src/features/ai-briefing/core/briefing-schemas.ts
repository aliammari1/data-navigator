/**
 * Zod schemas for structured AI-briefing output.
 *
 * Every structured generation in this feature routes through
 * `useAI().generateStructured(req, schema)`, which runs the provider's
 * prompt+repair+validate path (browser) or a native constrained-decoding path
 * (when a provider supports it). This replaces the old
 * `raw.match(/\[[\s\S]*\]/) + JSON.parse` flow that "silently failed" and forced
 * a full re-generation on malformed output.
 */

import { z } from "zod";

// ─── Action plan ──────────────────────────────────────────────────────────────

export const ActionPlanItemSchema = z.object({
  priority: z.coerce.number().int().min(1).max(5),
  category: z.enum(["critical", "high", "medium", "low"]),
  action: z.string().min(4).max(240),
  rationale: z.string().min(4).max(600),
  estimatedImpact: z.string().min(2).max(240),
});

export const ActionPlanSchema = z.object({
  items: z.array(ActionPlanItemSchema).min(1).max(8),
});

export type ActionPlanItemOutput = z.infer<typeof ActionPlanItemSchema>;
export type ActionPlanOutput = z.infer<typeof ActionPlanSchema>;

// ─── Anomaly explanation ──────────────────────────────────────────────────────

export const AnomalyExplanationSchema = z.object({
  explanation: z.string().min(8).max(800),
  hypotheses: z.array(z.string().min(4).max(400)).min(1).max(4),
});

export type AnomalyExplanationOutput = z.infer<typeof AnomalyExplanationSchema>;

// ─── Data story (single constrained call replaces 3-way Promise.all) ──────────

export const DataStorySchema = z.object({
  setup: z.string().min(20).max(1600),
  conflict: z.string().min(20).max(1600),
  resolution: z.string().min(20).max(1600),
});

export type DataStoryOutput = z.infer<typeof DataStorySchema>;
