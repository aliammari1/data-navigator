import { describe, expect, it } from "vitest";
import {
  buildRecipePrompt,
  SYSTEM_PROMPT,
} from "@/features/data-transform/ai/recipe-from-nl";

const baseInput = {
  instruction: "  keep only rows where amount > 100  ",
  tableName: "transactions",
  sourceRowCount: 12345,
  columns: [
    { name: "amount", type: "number" as const },
    { name: "region", type: "string" as const },
  ],
};

describe("buildRecipePrompt", () => {
  it("returns the exact static system prompt describing the step vocabulary", () => {
    // buildRecipePrompt has no LLM call to wire-test here — the system prompt
    // is a fully static, input-independent string, so an exact match is
    // strictly stronger than substring checks: those could only ever catch
    // removal of one specific phrase and would miss the rest of the step
    // vocabulary or rules being rewritten while accidentally keeping one
    // matching keyword.
    const { system } = buildRecipePrompt(baseInput);
    expect(system).toBe(SYSTEM_PROMPT);
  });

  it("builds the exact prompt from the table, columns, row count, and instruction", () => {
    // The user prompt IS built from runtime input, but that input is fully
    // deterministic here (a hand-written fixture), so a single exact-string
    // match — built by reading the real builder and this fixture — is
    // strictly stronger than the cluster of toContain() checks it replaces
    // (table name, locale-formatted row count, per-column listing, trimmed
    // instruction, and the closing instruction line). Those individual
    // substring checks could each pass even if e.g. a column were dropped,
    // the row count lost its separator, or the trailing ask were reworded,
    // as long as some other matching keyword survived.
    const { prompt } = buildRecipePrompt(baseInput);
    expect(prompt).toBe(
      [
        'Table: "transactions" (12,345 rows)',
        "Columns:",
        "  - amount (number)",
        "  - region (string)",
        "",
        "Instruction: keep only rows where amount > 100",
        "",
        "Return the ordered transform steps that fulfil the instruction.",
      ].join("\n"),
    );
  });

  it("falls back to the exact schema-unavailable prompt when there are no columns", () => {
    // Same reasoning as above, for the empty-columns branch specifically:
    // the fallback text is a fixed literal, and the whole prompt is
    // deterministic for this fixture, so assert the full string rather than
    // just toContain("(schema unavailable)").
    const { prompt } = buildRecipePrompt({ ...baseInput, columns: [] });
    expect(prompt).toBe(
      [
        'Table: "transactions" (12,345 rows)',
        "Columns:",
        "  (schema unavailable)",
        "",
        "Instruction: keep only rows where amount > 100",
        "",
        "Return the ordered transform steps that fulfil the instruction.",
      ].join("\n"),
    );
  });
});
