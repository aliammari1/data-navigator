"use client";

/**
 * AI executive narrative for a report, via the provider registry.
 *
 * Uses `useAI().generateStructured(request, zodSchema)` — the provider builds a
 * GBNF grammar from the schema so the JSON is valid BY CONSTRUCTION. There is no
 * regex extraction, no `parseJSON` repair loop, and no direct web-llm default
 * (the registry picks the offline llamacpp adapter in Electron).
 *
 * The prompt is fed ONLY real, already-aggregated numbers (DuckDB totals +
 * seeded anomaly/comparison insights) so the model narrates facts, not fiction.
 */

import { useCallback } from "react";
import { z } from "zod";
import { useAI } from "@/platform/ai/provider";
import type { ReportData, ReportNarrative } from "../lib/types";

const NarrativeSchema = z.object({
  executiveSummary: z
    .string()
    .describe("Two-to-three sentence executive summary of the day's transaction performance."),
  keyFindings: z
    .array(z.string())
    .min(2)
    .max(5)
    .describe("Concise, factual bullet findings grounded in the provided numbers."),
  recommendations: z
    .array(z.string())
    .min(2)
    .max(5)
    .describe("Actionable operational recommendations."),
});

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

/** Build a compact, fact-only prompt from the aggregated report data. */
function buildPrompt(data: ReportData): string {
  const lines: string[] = [];
  lines.push(`Date: ${data.date}`);
  lines.push(`Total transactions: ${Math.round(data.totalTransactions)}`);
  lines.push(`Overall success rate: ${fmtPct(data.successRate)}`);
  lines.push(`Failed transactions: ${Math.round(data.failedTransactions)}`);
  lines.push(`Total revenue: ${data.totalRevenue.toFixed(2)}`);
  lines.push("");
  lines.push("Top channels (name | volume | success% | revenue):");
  for (const ch of data.topChannels.slice(0, 8)) {
    lines.push(
      `- ${ch.name} | ${Math.round(ch.volume)} | ${fmtPct(ch.successRate)} | ${ch.revenue.toFixed(2)}`,
    );
  }
  if (data.comparison) {
    const c = data.comparison;
    lines.push("");
    lines.push(
      `Previous period (${c.prev.date}): ${Math.round(c.prev.totalTransactions)} transactions, ` +
        `${fmtPct(c.prev.successRate)} success rate.`,
    );
    if (c.volumeTrend) {
      lines.push(
        `Volume trend Welch t-test p-value=${c.volumeTrend.pValue.toFixed(4)} ` +
          `(${c.volumeTrend.significant ? "statistically significant" : "not significant"}).`,
      );
    }
  }
  if (data.anomalies?.length) {
    lines.push("");
    lines.push(`Anomalous hours (GESD): ${data.anomalies.map((a) => `${a.hour}:00`).join(", ")}`);
  }
  return lines.join("\n");
}

export function useReportNarrative() {
  const ai = useAI();

  const generate = useCallback(
    async (data: ReportData): Promise<ReportNarrative> => {
      return ai.generateStructured(
        {
          system:
            "You are a senior transaction-operations analyst. Write a precise, factual " +
            "report narrative using ONLY the figures provided. Do not invent numbers.",
          prompt: buildPrompt(data),
        },
        NarrativeSchema,
      );
    },
    [ai],
  );

  return { generate, status: ai.progress.status };
}
