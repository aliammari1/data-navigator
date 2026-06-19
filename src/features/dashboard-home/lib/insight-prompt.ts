/**
 * Grounded prompt + grammar schema for the generic dataset insight panel.
 *
 * The insight is generated through the platform provider registry
 * (`useAI().generateStructured`), which constrains the model to this Zod schema
 * via a GBNF grammar — the JSON is valid **by construction**, so there is no
 * regex / parseJSON repair loop and no direct web-llm dependency.
 *
 * Every number handed to the model comes from the DuckDB `SUMMARIZE` scan that
 * backs {@link GenericOverview}; the model only narrates over real values and is
 * explicitly told not to invent statistics.
 */

import { z } from "zod";
import type { GenericOverview } from "@/features/dashboard-home/lib/generic-overview";

export const DatasetInsightSchema = z.object({
  headline: z
    .string()
    .min(4)
    .max(120)
    .describe("One-sentence summary of what this dataset appears to contain"),
  observations: z
    .array(
      z
        .string()
        .min(4)
        .max(220)
        .describe("A concrete observation grounded in the supplied profile"),
    )
    .min(1)
    .max(4)
    .describe("Key facts a reader should notice (shape, completeness, spread)"),
  dataQualityFlags: z
    .array(
      z
        .string()
        .min(4)
        .max(180)
        .describe("A potential data-quality concern, or none if the data is clean"),
    )
    .max(4)
    .describe("Null-heavy columns, id-like columns, constant columns, etc."),
  suggestedNextSteps: z
    .array(
      z.string().min(4).max(180).describe("An actionable next analysis the user could run in-app"),
    )
    .min(1)
    .max(3)
    .describe("What to explore next (e.g. profile a column, run a forecast)"),
});

export type DatasetInsight = z.infer<typeof DatasetInsightSchema>;

const NUM = (value: number): string =>
  Number.isFinite(value) ? value.toLocaleString("en-US") : "n/a";

/**
 * Build a fully-grounded prompt from the real overview profile. Only the most
 * informative columns are included to keep the context tight for small local
 * models; all figures are exact values from DuckDB.
 */
export function buildDatasetInsightPrompt(
  overview: GenericOverview,
  datasetName: string,
): { system: string; prompt: string } {
  const completeness = (100 - overview.avgNullPercentage).toFixed(1);

  // Surface the columns most likely to matter: highest-cardinality categoricals,
  // null-heavy columns, and numeric columns with a real range.
  const columnLines = overview.columns
    .slice()
    .sort((a, b) => b.nullPercentage - a.nullPercentage || b.approxUnique - a.approxUnique)
    .slice(0, 16)
    .map((c) => {
      const parts = [
        `${c.name} (${c.type}, ${c.role})`,
        `~${NUM(c.approxUnique)} distinct`,
        `${c.nullPercentage.toFixed(1)}% null`,
      ];
      if (c.role === "numeric" && c.avg !== null) {
        parts.push(`avg ${NUM(c.avg)}`);
        if (c.min !== null && c.max !== null) parts.push(`range ${c.min}…${c.max}`);
      } else if (c.min !== null && c.max !== null && c.min !== c.max) {
        parts.push(`from ${c.min} to ${c.max}`);
      }
      return `- ${parts.join(", ")}`;
    })
    .join("\n");

  const topCat = overview.topCategorical
    ? `Top values of "${overview.topCategorical.column}": ${overview.topCategorical.values
        .slice(0, 6)
        .map((v) => `${v.label} (${NUM(v.count)})`)
        .join(", ")}.`
    : "";

  return {
    system:
      "You are a senior data analyst writing a concise, factual overview of a " +
      "freshly-imported dataset. Use ONLY the profile statistics provided — do " +
      "NOT invent column names, counts, percentages, or trends. If something is " +
      "not in the profile, do not claim it. Keep every item short and specific. " +
      "Respond ONLY with the requested JSON object.",
    prompt:
      `Dataset: "${datasetName}"\n` +
      `Shape: ${NUM(overview.rowCount)} rows × ${overview.columnCount} columns ` +
      `(${overview.numericColumnCount} numeric, ${overview.temporalColumnCount} temporal, ` +
      `${overview.categoricalColumnCount} categorical).\n` +
      `Overall completeness: ${completeness}% (${NUM(overview.totalNullCells)} null cells).\n\n` +
      `Columns (most-notable first):\n${columnLines}\n\n${topCat}\n\n` +
      "Write: a one-line headline, 1-4 grounded observations, any data-quality " +
      "flags (null-heavy / id-like / constant columns), and 1-3 suggested next " +
      "analyses the user could run.",
  };
}
