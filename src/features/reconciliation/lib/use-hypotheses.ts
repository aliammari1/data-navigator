"use client";

/**
 * Real, structured, offline AI variance hypotheses.
 *
 * The legacy wizard faked "AI investigation" with `setTimeout(1400)` + a static
 * `HYPOTHESIS_MAP` dictionary lookup. This replaces it with the platform AI
 * provider registry (`useAI` from `@/platform/ai/provider`). The llamacpp
 * adapter (Electron main, GBNF-grammar-constrained JSON) is the default; the
 * transformers.js worker is the browser fallback — both fully offline.
 *
 * Output is structured *by construction*: `generateStructured(req, zodSchema)`
 * derives a JSON-schema grammar from the Zod schema, so there is no regex /
 * parseJSON repair loop and no free-form text to sanitize. We only generate
 * hypotheses for the top-N most material rows (capped + sequential) so a
 * 100k-row diff never triggers 100k inference calls.
 */

import { useCallback, useState } from "react";
import { z } from "zod";
import { useAI } from "@/platform/ai/provider";
import type { DiffConfig } from "./recon-sql";
import { fetchMaterialRows } from "./use-reconciliation";
import {
  type RowAnnotation,
  useAnnotationsStore,
} from "../stores/annotations-store";

/** Reason codes the model must choose from (mirrors the reviewer dropdown). */
export const REASON_CODES = [
  "Human Error",
  "System Issue",
  "Expected Variance",
  "Pricing Change",
  "Campaign Effect",
  "Timing / Cutoff",
  "Unknown",
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];

/**
 * Schema the model is constrained to. `generateStructured` converts this to a
 * grammar so the result is valid JSON of exactly this shape — no post-parsing.
 */
export const HypothesisSchema = z.object({
  reasonCode: z.enum(REASON_CODES),
  confidence: z.number().min(0).max(1),
  hypothesis: z.string().max(600),
});

export type Hypothesis = z.infer<typeof HypothesisSchema>;

const SYSTEM_PROMPT =
  "You are a financial data reconciliation analyst. Given an expected-vs-actual " +
  "variance for a single key, choose the single most likely reason code and " +
  "write one concise paragraph explaining the most plausible cause. Be specific " +
  "and quantitative. Never invent data not present in the prompt.";

function buildPrompt(
  row: { key: string; measures: { label: string; expected: number | null; actual: number | null; variance: number; variancePct: number | null }[]; status: string },
): string {
  const lines = row.measures.map((m) => {
    const pct = m.variancePct === null ? "n/a" : `${m.variancePct.toFixed(1)}%`;
    return `- ${m.label}: expected ${m.expected ?? "∅"}, actual ${m.actual ?? "∅"} (Δ ${m.variance >= 0 ? "+" : ""}${m.variance}, ${pct})`;
  });
  return [
    `Key: ${row.key}`,
    `Diff status: ${row.status}`,
    "Measures:",
    ...lines,
    "",
    "Return the most likely reasonCode, a confidence 0–1, and a one-paragraph hypothesis.",
  ].join("\n");
}

export interface HypothesisProgress {
  running: boolean;
  done: number;
  total: number;
  error: string | null;
}

const IDLE: HypothesisProgress = {
  running: false,
  done: 0,
  total: 0,
  error: null,
};

/**
 * Hook that generates structured hypotheses for the top-N material rows and
 * writes them straight into the keyed annotations store (so only affected rows
 * re-render). Returns a `run(maxRows)` trigger plus live progress.
 */
export function useHypotheses(cfg: DiffConfig | null) {
  const ai = useAI();
  const setAnnotation = useAnnotationsStore((s) => s.setAnnotation);
  const [progress, setProgress] = useState<HypothesisProgress>(IDLE);

  const run = useCallback(
    async (maxRows = 12): Promise<void> => {
      if (!cfg) return;
      setProgress({ running: true, done: 0, total: 0, error: null });
      try {
        const rows = await fetchMaterialRows(cfg, maxRows);
        setProgress({ running: true, done: 0, total: rows.length, error: null });
        // Sequential: keeps a single small local model warm and bounded; the row
        // count is already capped to top-N material rows.
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          try {
            const result = await ai.generateStructured(
              {
                system: SYSTEM_PROMPT,
                prompt: buildPrompt(row),
                maxTokens: 256,
                temperature: 0.2,
              },
              HypothesisSchema,
            );
            const patch: Partial<RowAnnotation> = {
              reasonCode: result.reasonCode,
              confidence: result.confidence,
              hypothesis: result.hypothesis,
            };
            setAnnotation(row.key, patch);
          } catch {
            // One bad row must not abort the batch; leave its annotation empty.
          }
          setProgress((p) => ({ ...p, done: i + 1 }));
        }
        setProgress((p) => ({ ...p, running: false }));
      } catch (err) {
        setProgress({
          running: false,
          done: 0,
          total: 0,
          error: err instanceof Error ? err.message : "Hypothesis generation failed.",
        });
      }
    },
    [ai, cfg, setAnnotation],
  );

  return { run, progress, aiProgress: ai.progress, availability: ai.availability };
}
