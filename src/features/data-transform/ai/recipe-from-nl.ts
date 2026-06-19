/**
 * NL → transform recipe prompt builder (offline, grammar-constrained).
 *
 * The headline offline feature (§3.3): turn a natural-language instruction plus
 * the source column schema into a valid `TransformStep[]`. The actual decode is
 * done by the platform AI provider via
 * `useAI().generateStructured(req, TransformRecipeSchema)` — that path applies a
 * GBNF grammar derived from the Zod schema, so the model CANNOT emit malformed
 * steps. This module only assembles the system + user prompt; the screen owns
 * the provider call and the accept/reject diff.
 */

import type { ColMeta } from "@/core/stores/data-store";

export interface RecipePromptInput {
  instruction: string;
  tableName: string;
  columns: Pick<ColMeta, "name" | "type">[];
  sourceRowCount: number;
}

const SYSTEM = [
  "You are a data-wrangling assistant that converts a natural-language request",
  "into an ordered list of transform steps over a single SQL table.",
  "",
  "Rules:",
  "- Only use column names from the provided schema; never invent columns.",
  "- Prefer the smallest set of steps that satisfies the request.",
  "- Use these step types only: filter, select, rename, derive, aggregate,",
  "  sort, deduplicate, limit, join, pivot.",
  "- 'filter' uses a SQL condition (no WHERE keyword), e.g. amount > 100.",
  "- 'derive'/'rename' need a SQL expression and an output alias.",
  "- 'aggregate' needs groupBy column(s) and an agg list like SUM(x) AS total.",
  "- 'sort' needs a column and ASC/DESC. 'limit' needs a numeric count.",
  "- Do NOT add a step that the request does not call for.",
].join("\n");

export function buildRecipePrompt(input: RecipePromptInput): {
  system: string;
  prompt: string;
} {
  const schema = input.columns.map((c) => `  - ${c.name} (${c.type})`).join("\n");
  const prompt = [
    `Table: "${input.tableName}" (${input.sourceRowCount.toLocaleString()} rows)`,
    "Columns:",
    schema || "  (schema unavailable)",
    "",
    `Instruction: ${input.instruction.trim()}`,
    "",
    "Return the ordered transform steps that fulfil the instruction.",
  ].join("\n");
  return { system: SYSTEM, prompt };
}
