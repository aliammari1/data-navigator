/**
 * Structured AI threshold suggestions via the platform provider registry.
 *
 * The previous "Smart Suggestions" path imported `@mlc-ai/web-llm` directly
 * (WebGPU-only, REJECTED by the tech radar) through `llm-engine.ts`, parsed the
 * free-text reply with a regex, and silently degraded to a hardcoded string. We
 * now go through `useAI().generateStructured(schema, …)`, which is grammar-valid
 * JSON **by construction** (GBNF from the Zod schema) — no regex/parseJSON repair
 * loop, and the llamacpp adapter runs offline on CPU in the Electron main process.
 */

import { z } from "zod";
import type { ChannelStatus } from "../store/monitor-store";

export const ThresholdSuggestionSchema = z.object({
  successRateBelow: z
    .number()
    .min(0)
    .max(100)
    .describe("Alert when channel success rate (%) falls below this value"),
  volumeAbove: z
    .number()
    .min(0)
    .describe("Alert when hourly transaction volume exceeds this value"),
  failuresAbove: z.number().min(0).describe("Alert when hourly failure count exceeds this value"),
  rationale: z.string().min(4).max(600).describe("Brief justification for the thresholds"),
});

export type ThresholdSuggestion = z.infer<typeof ThresholdSuggestionSchema>;

/**
 * The system prompt is static — it never varies with the input statuses —
 * so it's exported for exact-match assertions in tests instead of
 * substring keyword checks against a hardcoded copy.
 */
export const SUGGESTION_SYSTEM_PROMPT =
  "You are a telecom channel-monitoring analyst. Recommend alerting thresholds " +
  "that catch genuine degradations without flapping. Base them on the supplied " +
  "live channel metrics. Respond ONLY with the requested JSON object.";

/** Build a grounded prompt from the live channel snapshot (real numbers only). */
export function buildSuggestionPrompt(statuses: ChannelStatus[]): {
  system: string;
  prompt: string;
} {
  const summary =
    statuses.length > 0
      ? statuses
          .slice(0, 12)
          .map(
            (s) =>
              `${s.displayName}: success ${s.successRate.toFixed(1)}%, ` +
              `${Math.round(s.txnPerMin * 60)}/h, ${s.failureCount} failures/h`,
          )
          .join("\n")
      : "(no live channel metrics available)";

  return {
    system: SUGGESTION_SYSTEM_PROMPT,
    prompt:
      `Current per-channel metrics:\n${summary}\n\n` +
      "Suggest a single set of global alert thresholds: the success-rate floor (%), " +
      "the hourly-volume ceiling, and the hourly-failure ceiling, with a brief rationale.",
  };
}
