/**
 * Structured AI regional insights via the platform provider registry.
 *
 * Every figure handed to the model is a real DuckDB aggregate (region rollups,
 * channel matrix, dominant channels) — nothing is fabricated. The model only
 * narrates and prioritises; it never invents numbers. Output is grammar-valid
 * JSON **by construction** through `useAI().generateStructured(req, schema)`
 * (GBNF from the Zod schema), so there is no regex/parseJSON repair loop and no
 * direct web-llm dependency. The llamacpp adapter runs offline on CPU in the
 * Electron main process.
 */

import { z } from "zod";
import { fmtN, fmtPct } from "@/features/telecom/lib/format";
import type { GeoRegion, UseGeoDataResult } from "../hooks/use-geo-data";

export const GeoInsightSchema = z.object({
  headline: z
    .string()
    .min(4)
    .max(160)
    .describe("One-sentence summary of the regional transaction landscape"),
  topRegions: z
    .array(
      z.object({
        region: z.string().describe("Region name exactly as supplied"),
        note: z
          .string()
          .min(4)
          .max(220)
          .describe("Why this region stands out (volume, revenue, or success)"),
      }),
    )
    .max(4)
    .describe("Up to four regions worth highlighting"),
  riskRegions: z
    .array(
      z.object({
        region: z.string().describe("Region name exactly as supplied"),
        reason: z
          .string()
          .min(4)
          .max(220)
          .describe("Why this region is a concern (low success, anomalous mix)"),
      }),
    )
    .max(4)
    .describe("Up to four regions that need attention"),
  channelObservation: z
    .string()
    .min(4)
    .max(400)
    .describe("A single observation about channel distribution across regions"),
  recommendation: z.string().min(4).max(400).describe("One concrete, actionable recommendation"),
});

export type GeoInsight = z.infer<typeof GeoInsightSchema>;

/**
 * Static system instructions for the regional-performance analyst persona.
 * Exported so tests can assert exact identity instead of a substring keyword
 * check — a substring check could only ever catch removal of one word and
 * would miss any other degradation of the analyst instructions.
 */
export const GEO_INSIGHT_SYSTEM_PROMPT =
  "You are a telecom regional-performance analyst. Interpret the supplied, " +
  "already-computed regional aggregates and channel mix. Use ONLY the numbers " +
  "given — never invent figures or regions. Reference regions by their exact " +
  "supplied names. Respond ONLY with the requested JSON object.";

/**
 * Static closing instruction appended to every prompt, independent of the
 * supplied context. Exported for the same reason as {@link GEO_INSIGHT_SYSTEM_PROMPT}.
 */
export const GEO_INSIGHT_SUMMARY_INSTRUCTION =
  "Summarise the regional landscape: a headline, the standout regions, the " +
  "regions that need attention, one channel-distribution observation, and one " +
  "concrete recommendation.";

interface GeoInsightContext {
  datasetName: string | null;
  regions: GeoRegion[];
  totalTransactions: number;
  avgSuccessRate: number;
  dominantChannels: UseGeoDataResult["dominantChannels"];
  /** Names of regions flagged as statistical success-rate anomalies. */
  anomalousRegions: string[];
}

/**
 * Build a grounded prompt from the live geo aggregates. Only the busiest regions
 * are summarised to keep the context compact and the latency low on CPU.
 */
export function buildGeoInsightPrompt(ctx: GeoInsightContext): {
  system: string;
  prompt: string;
} {
  const regionLines =
    ctx.regions.length > 0
      ? ctx.regions
          .slice(0, 12)
          .map(
            (r) =>
              `${r.name}: ${fmtN(r.transactions)} tx, revenue ${fmtN(
                r.revenue,
              )}, success ${fmtPct(r.successRate)} (rank #${r.rank})`,
          )
          .join("\n")
      : "(no region metrics available)";

  const dominantLines =
    ctx.dominantChannels.length > 0
      ? ctx.dominantChannels
          .slice(0, 8)
          .map((d) => `${d.region}: ${d.channel} (${d.pct.toFixed(0)}%)`)
          .join("\n")
      : "(no channel mix available)";

  const anomalyLine =
    ctx.anomalousRegions.length > 0
      ? `Statistically anomalous success rates detected in: ${ctx.anomalousRegions.join(", ")}.`
      : "No statistically anomalous success rates detected.";

  return {
    system: GEO_INSIGHT_SYSTEM_PROMPT,
    prompt:
      `Dataset: ${ctx.datasetName ?? "active dataset"}\n` +
      `Totals: ${fmtN(ctx.totalTransactions)} transactions, ` +
      `weighted success ${fmtPct(ctx.avgSuccessRate)}.\n\n` +
      `Per-region metrics (busiest first):\n${regionLines}\n\n` +
      `Dominant channel per region:\n${dominantLines}\n\n` +
      `${anomalyLine}\n\n` +
      GEO_INSIGHT_SUMMARY_INSTRUCTION,
  };
}
