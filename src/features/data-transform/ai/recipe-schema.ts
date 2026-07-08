/**
 * Zod schema for AI-generated transform recipes.
 *
 * `useAI().generateStructured(req, schema)` runs the active offline provider's
 * grammar-constrained decode (GBNF derived from this Zod schema via
 * schemaToGrammarJson / zod-to-json-schema), so the model emits JSON that is
 * valid BY CONSTRUCTION — no regex/parseJSON repair loop (the platform AI
 * provider owns that). We then coerce it into real `TransformStep[]`.
 *
 * The schema mirrors the step vocabulary in ../engine/sql.ts. Config is modelled
 * as a flat optional bag (every field a string/number) rather than a per-type
 * discriminated union: a flat object grammar is far more reliable for small
 * local models than nested discriminated unions, and `coerceRecipe` maps the
 * flat bag onto the typed `TransformStep.config` each step actually reads.
 */

import { z } from "zod";
import type { StepType, TransformStep } from "../engine/sql";

export const STEP_TYPES = [
  "filter",
  "select",
  "rename",
  "derive",
  "aggregate",
  "sort",
  "deduplicate",
  "limit",
  "join",
  "pivot",
] as const satisfies readonly StepType[];

export const RecipeStepSchema = z.object({
  type: z.enum(STEP_TYPES).describe("The transform operation for this step."),
  label: z.string().describe("Short human label, e.g. 'Filter amount > 100'."),
  /** filter */
  condition: z
    .string()
    .optional()
    .describe("SQL WHERE clause without the WHERE keyword (filter steps)."),
  /** select */
  columns: z.string().optional().describe("Comma-separated column list or '*' (select steps)."),
  /** derive / rename */
  expression: z.string().optional().describe("SQL expression for a derived/renamed column."),
  alias: z.string().optional().describe("Output column name for derive/rename."),
  /** aggregate */
  groupBy: z.string().optional().describe("GROUP BY column(s)."),
  agg: z.string().optional().describe("Aggregation list, e.g. 'SUM(amount) AS total'."),
  /** sort */
  column: z.string().optional().describe("Column to sort by (sort steps)."),
  direction: z.enum(["ASC", "DESC"]).optional().describe("Sort direction."),
  /** limit */
  count: z.number().optional().describe("Row limit (limit steps)."),
});

export const TransformRecipeSchema = z.object({
  steps: z
    .array(RecipeStepSchema)
    .max(12)
    .describe("Ordered list of transform steps that fulfil the instruction."),
});

export type AiRecipe = z.infer<typeof TransformRecipeSchema>;
export type AiRecipeStep = z.infer<typeof RecipeStepSchema>;

/**
 * Map a flat AI step onto the typed `TransformStep.config` each step type reads
 * in ../engine/sql.ts. Unknown/empty fields are dropped; sensible defaults are
 * applied so the resulting step is always runnable.
 */
function configFor(step: AiRecipeStep): Record<string, unknown> {
  switch (step.type) {
    case "filter":
      return { condition: step.condition ?? "1=1" };
    case "select":
      return { columns: step.columns ?? "*" };
    case "rename":
    case "derive":
      return {
        expression: step.expression ?? "1",
        alias: step.alias ?? (step.type === "rename" ? "new_col" : "derived"),
      };
    case "aggregate":
      return {
        groupBy: step.groupBy ?? "",
        agg: step.agg ?? "COUNT(*) AS count",
      };
    case "sort":
      return {
        column: step.column ?? "",
        direction: step.direction ?? "ASC",
      };
    case "limit":
      return { count: Number.isFinite(step.count) ? step.count : 1000 };
    case "deduplicate":
      return {};
    case "join":
      // The model cannot safely pick a second table; emit an empty config the
      // user completes in the Configure tab (sql.ts falls back to SELECT *).
      return { table: "", leftKey: "", rightKey: "", joinType: "left" };
    case "pivot":
      return {
        onColumn: step.column ?? "",
        usingAgg: step.agg ?? "COUNT(*)",
        groupBy: step.groupBy ?? "",
      };
    default:
      return {};
  }
}

/**
 * Coerce a grammar-valid `AiRecipe` into real `TransformStep[]` with stable ids.
 * Steps arrive enabled; the screen shows them in an accept/reject diff before
 * they are committed to the live pipeline.
 */
export function coerceRecipe(recipe: AiRecipe): TransformStep[] {
  return recipe.steps.map((step, i) => ({
    id: `ai_${Date.now()}_${i}`,
    type: step.type,
    label: step.label?.trim() || `${step.type} step`,
    enabled: true,
    config: configFor(step),
  }));
}
