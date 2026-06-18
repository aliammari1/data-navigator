import { describe, expect, it } from "vitest";
import { buildRecipePrompt } from "@/features/data-transform/ai/recipe-from-nl";

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
  it("returns a fixed system prompt describing the step vocabulary", () => {
    const { system } = buildRecipePrompt(baseInput);
    expect(system).toContain("data-wrangling assistant");
    expect(system).toContain("filter, select, rename, derive, aggregate");
    expect(system).toContain("never invent columns");
  });

  it("embeds the table name and a locale-formatted row count", () => {
    const { prompt } = buildRecipePrompt(baseInput);
    expect(prompt).toContain('Table: "transactions"');
    expect(prompt).toContain("12,345 rows");
  });

  it("lists each column with its type", () => {
    const { prompt } = buildRecipePrompt(baseInput);
    expect(prompt).toContain("- amount (number)");
    expect(prompt).toContain("- region (string)");
  });

  it("trims the instruction before embedding it", () => {
    const { prompt } = buildRecipePrompt(baseInput);
    expect(prompt).toContain("Instruction: keep only rows where amount > 100");
    expect(prompt).not.toContain("  keep only rows");
  });

  it("falls back to a schema-unavailable note when there are no columns", () => {
    const { prompt } = buildRecipePrompt({ ...baseInput, columns: [] });
    expect(prompt).toContain("(schema unavailable)");
  });

  it("always asks the model to return ordered steps", () => {
    const { prompt } = buildRecipePrompt(baseInput);
    expect(prompt).toContain("Return the ordered transform steps");
  });
});
