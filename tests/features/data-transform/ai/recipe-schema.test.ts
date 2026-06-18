import { describe, expect, it } from "vitest";
import {
  type AiRecipe,
  coerceRecipe,
  STEP_TYPES,
  TransformRecipeSchema,
} from "@/features/data-transform/ai/recipe-schema";

describe("TransformRecipeSchema", () => {
  it("accepts a minimal valid recipe", () => {
    const parsed = TransformRecipeSchema.parse({
      steps: [{ type: "filter", label: "f", condition: "a > 1" }],
    });
    expect(parsed.steps).toHaveLength(1);
  });

  it("rejects an unknown step type", () => {
    expect(() =>
      TransformRecipeSchema.parse({ steps: [{ type: "explode", label: "x" }] }),
    ).toThrow();
  });

  it("rejects more than 12 steps", () => {
    const steps = Array.from({ length: 13 }, () => ({
      type: "deduplicate" as const,
      label: "d",
    }));
    expect(() => TransformRecipeSchema.parse({ steps })).toThrow();
  });

  it("rejects a non-enum sort direction", () => {
    expect(() =>
      TransformRecipeSchema.parse({
        steps: [{ type: "sort", label: "s", column: "a", direction: "UP" }],
      }),
    ).toThrow();
  });

  it("exposes the full step-type vocabulary", () => {
    expect(STEP_TYPES).toContain("pivot");
    expect(STEP_TYPES).toContain("join");
    expect(STEP_TYPES).toHaveLength(10);
  });
});

describe("coerceRecipe", () => {
  it("returns an empty step list for an empty recipe", () => {
    expect(coerceRecipe({ steps: [] })).toEqual([]);
  });

  it("assigns enabled, stably-prefixed ids and preserves order", () => {
    const recipe: AiRecipe = {
      steps: [
        { type: "filter", label: "a", condition: "x > 1" },
        { type: "deduplicate", label: "b" },
      ],
    };
    const out = coerceRecipe(recipe);
    expect(out).toHaveLength(2);
    expect(out.every((s) => s.enabled)).toBe(true);
    expect(out[0].id).toMatch(/^ai_\d+_0$/);
    expect(out[1].id).toMatch(/^ai_\d+_1$/);
    expect(out.map((s) => s.type)).toEqual(["filter", "deduplicate"]);
  });

  it("trims labels and falls back to a type-derived label when blank", () => {
    const out = coerceRecipe({
      steps: [
        { type: "filter", label: "  trim me  ", condition: "1=1" },
        { type: "sort", label: "   " },
      ],
    });
    expect(out[0].label).toBe("trim me");
    expect(out[1].label).toBe("sort step");
  });

  it("maps a filter step config with a default condition", () => {
    const out = coerceRecipe({ steps: [{ type: "filter", label: "f" }] });
    expect(out[0].config).toEqual({ condition: "1=1" });
  });

  it("maps select columns with a wildcard default", () => {
    const out = coerceRecipe({ steps: [{ type: "select", label: "s" }] });
    expect(out[0].config).toEqual({ columns: "*" });
  });

  it("maps derive expression + alias with defaults", () => {
    const out = coerceRecipe({ steps: [{ type: "derive", label: "d" }] });
    expect(out[0].config).toEqual({ expression: "1", alias: "derived" });
  });

  it("maps rename to a new_col alias default", () => {
    const out = coerceRecipe({ steps: [{ type: "rename", label: "r" }] });
    expect(out[0].config).toEqual({ expression: "1", alias: "new_col" });
  });

  it("maps aggregate groupBy + agg with COUNT default", () => {
    const out = coerceRecipe({ steps: [{ type: "aggregate", label: "a" }] });
    expect(out[0].config).toEqual({ groupBy: "", agg: "COUNT(*) AS count" });
  });

  it("maps sort column + direction with ASC default", () => {
    const out = coerceRecipe({
      steps: [{ type: "sort", label: "s", column: "name", direction: "DESC" }],
    });
    expect(out[0].config).toEqual({ column: "name", direction: "DESC" });
  });

  it("maps a numeric limit and defaults a missing count to 1000", () => {
    const withCount = coerceRecipe({
      steps: [{ type: "limit", label: "l", count: 50 }],
    });
    expect(withCount[0].config).toEqual({ count: 50 });

    const noCount = coerceRecipe({ steps: [{ type: "limit", label: "l" }] });
    expect(noCount[0].config).toEqual({ count: 1000 });
  });

  it("maps deduplicate to an empty config", () => {
    const out = coerceRecipe({ steps: [{ type: "deduplicate", label: "d" }] });
    expect(out[0].config).toEqual({});
  });

  it("maps join to an empty, user-completable config", () => {
    const out = coerceRecipe({ steps: [{ type: "join", label: "j" }] });
    expect(out[0].config).toEqual({
      table: "",
      leftKey: "",
      rightKey: "",
      joinType: "left",
    });
  });

  it("maps pivot onColumn from the flat 'column' field and agg from 'agg'", () => {
    const out = coerceRecipe({
      steps: [
        {
          type: "pivot",
          label: "p",
          column: "month",
          agg: "SUM(amt)",
          groupBy: "region",
        },
      ],
    });
    expect(out[0].config).toEqual({
      onColumn: "month",
      usingAgg: "SUM(amt)",
      groupBy: "region",
    });
  });

  it("defaults pivot usingAgg to COUNT(*) when agg is absent", () => {
    const out = coerceRecipe({
      steps: [{ type: "pivot", label: "p", column: "month" }],
    });
    expect(out[0].config).toEqual({
      onColumn: "month",
      usingAgg: "COUNT(*)",
      groupBy: "",
    });
  });
});
