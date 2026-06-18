/**
 * Reconciliation discrepancy hypotheses.
 *
 * The wizard's step 4 used to fake "AI hypotheses" with a `setTimeout` and a
 * hard-coded lookup table. This module wires the real offline provider registry
 * (`@/platform/ai/provider`, `generateStructured` → grammar-valid JSON by
 * construction) and keeps a deterministic, data-derived fallback for when no
 * model is loaded (CPU-only machine, weights not cached) so the feature still
 * works fully offline.
 */

import { z } from "zod";

export interface DiscrepancyInput {
  channel: string;
  expectedVol: number;
  actualVol: number;
  volVariancePct: number;
  expectedRev: number;
  actualRev: number;
  revVariancePct: number;
  isMaterial: boolean;
}

export const HypothesisSchema = z.object({
  hypotheses: z.array(
    z.object({
      channel: z.string(),
      hypothesis: z.string(),
    }),
  ),
});

export type HypothesisResult = z.infer<typeof HypothesisSchema>;

const SYSTEM_PROMPT =
  "You are a payments reconciliation analyst. For each channel discrepancy you " +
  "receive, give one concise, plausible operational hypothesis (1-2 sentences) " +
  "explaining the variance between expected and actual volume/revenue. Be " +
  "specific and avoid generic filler. Respond only with the requested JSON.";

/** Build the structured prompt fed to the provider. */
export function buildHypothesisPrompt(discrepancies: DiscrepancyInput[]): string {
  const lines = discrepancies.map(
    (d) =>
      `- ${d.channel}: volume ${d.volVariancePct >= 0 ? "+" : ""}${d.volVariancePct.toFixed(
        1,
      )}% (expected ${Math.round(d.expectedVol)}, actual ${Math.round(d.actualVol)}), ` +
      `revenue ${d.revVariancePct >= 0 ? "+" : ""}${d.revVariancePct.toFixed(1)}%` +
      `${d.isMaterial ? " [MATERIAL]" : ""}`,
  );
  return (
    "Produce a hypothesis for each of the following channel discrepancies:\n" +
    lines.join("\n")
  );
}

/**
 * Deterministic, data-derived fallback used when the AI provider is unavailable.
 * Unlike the old hard-coded `HYPOTHESIS_MAP`, every sentence is generated from
 * the real variance numbers, so it adapts to whatever dataset is loaded.
 */
export function deterministicHypothesis(d: DiscrepancyInput): string {
  const dir = d.volVariancePct >= 0 ? "above" : "below";
  const mag = Math.abs(d.volVariancePct);
  if (!d.isMaterial) {
    return `${d.channel} volume is within normal variance (${
      d.volVariancePct >= 0 ? "+" : ""
    }${d.volVariancePct.toFixed(1)}%). No investigation required.`;
  }
  const revNote =
    Math.abs(d.revVariancePct) > 5
      ? ` Revenue is ${d.revVariancePct >= 0 ? "up" : "down"} ${Math.abs(
          d.revVariancePct,
        ).toFixed(1)}%, so check pricing/mix as well as volume.`
      : " Revenue tracked expectations, so this is likely a volume-only effect.";
  return (
    `${d.channel} volume is ${mag.toFixed(1)}% ${dir} expected. Likely causes: ` +
    `${
      d.volVariancePct >= 0
        ? "a campaign or backlog of queued transactions inflated throughput"
        : "an outage, migration to another channel, or an over-optimistic target reduced throughput"
    }.${revNote}`
  );
}

export const SYSTEM = SYSTEM_PROMPT;
