import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TransformStep } from "@/features/data-transform/engine/sql";

// ── Mock the storage boundary so nothing opens IndexedDB / Dexie ─────────────
const putTransformRecipe = vi.fn();
const listTransformRecipes = vi.fn();
const deleteTransformRecipe = vi.fn();
let idCounter = 0;
const newId = vi.fn(() => `generated-${++idCounter}`);

vi.mock("@/platform/storage", () => ({
  putTransformRecipe: (...args: unknown[]) => putTransformRecipe(...args),
  listTransformRecipes: (...args: unknown[]) => listTransformRecipes(...args),
  deleteTransformRecipe: (...args: unknown[]) => deleteTransformRecipe(...args),
  newId: () => newId(),
}));

import {
  loadRecipes,
  removeRecipe,
  saveRecipe,
} from "@/features/data-transform/state/recipes";

function step(overrides: Partial<TransformStep> = {}): TransformStep {
  return {
    id: "s1",
    type: "filter",
    label: "Filter",
    enabled: true,
    config: { condition: "x > 0" },
    ...overrides,
  };
}

beforeEach(() => {
  putTransformRecipe.mockReset();
  listTransformRecipes.mockReset();
  deleteTransformRecipe.mockReset();
  newId.mockClear();
  idCounter = 0;
});

describe("saveRecipe", () => {
  it("generates a new id when none is provided and returns it", async () => {
    putTransformRecipe.mockResolvedValue(undefined);

    const id = await saveRecipe({ name: "My recipe", steps: [step()] });

    expect(id).toBe("generated-1");
    expect(putTransformRecipe).toHaveBeenCalledTimes(1);
    expect(putTransformRecipe.mock.calls[0][0].id).toBe("generated-1");
  });

  it("reuses the provided id (update path) without generating a new one", async () => {
    putTransformRecipe.mockResolvedValue(undefined);

    const id = await saveRecipe({
      id: "fixed-id",
      name: "R",
      datasetId: "ds-1",
      steps: [step()],
    });

    expect(id).toBe("fixed-id");
    expect(newId).not.toHaveBeenCalled();
    expect(putTransformRecipe).toHaveBeenCalledWith({
      id: "fixed-id",
      name: "R",
      datasetId: "ds-1",
      steps: expect.any(Array),
    });
  });

  it("persists only clone-safe config-only step fields with a copied config", async () => {
    putTransformRecipe.mockResolvedValue(undefined);
    const original = step({ id: "abc", config: { condition: "y < 5" } });

    await saveRecipe({ name: "R", steps: [original] });

    const persisted = putTransformRecipe.mock.calls[0][0].steps[0];
    expect(persisted).toEqual({
      id: "abc",
      type: "filter",
      label: "Filter",
      enabled: true,
      config: { condition: "y < 5" },
    });
    // config must be a distinct copy, not the same reference.
    expect(persisted.config).not.toBe(original.config);
  });
});

describe("loadRecipes", () => {
  it("maps stored rows into SavedRecipe shape and revives steps", async () => {
    listTransformRecipes.mockResolvedValue([
      {
        id: "r1",
        name: "First",
        datasetId: "ds-1",
        updatedAt: 1000,
        steps: [
          { id: "s1", type: "filter", label: "F", enabled: true, config: { condition: "1=1" } },
        ],
      },
    ]);

    const recipes = await loadRecipes("ds-1");

    expect(listTransformRecipes).toHaveBeenCalledWith("ds-1");
    expect(recipes).toHaveLength(1);
    expect(recipes[0]).toEqual({
      id: "r1",
      name: "First",
      datasetId: "ds-1",
      updatedAt: 1000,
      steps: [
        { id: "s1", type: "filter", label: "F", enabled: true, config: { condition: "1=1" } },
      ],
    });
  });

  it("drops persisted steps with an unknown or missing type", async () => {
    listTransformRecipes.mockResolvedValue([
      {
        id: "r1",
        name: "R",
        updatedAt: 1,
        steps: [
          { type: "bogus", label: "x" },
          null,
          "not-an-object",
          { id: "ok", type: "sort", config: { column: "a" } },
        ],
      },
    ]);

    const [recipe] = await loadRecipes();

    expect(recipe.steps).toHaveLength(1);
    expect(recipe.steps[0].type).toBe("sort");
  });

  it("backfills a generated id and type-derived label for sparse steps", async () => {
    listTransformRecipes.mockResolvedValue([
      {
        id: "r1",
        name: "R",
        updatedAt: 1,
        steps: [{ type: "deduplicate" }],
      },
    ]);

    const [recipe] = await loadRecipes();

    expect(recipe.steps[0].id).toBe("generated-1");
    expect(recipe.steps[0].label).toBe("deduplicate");
    expect(recipe.steps[0].enabled).toBe(true);
    expect(recipe.steps[0].config).toEqual({});
  });

  it("treats enabled:false as disabled but any other value as enabled", async () => {
    listTransformRecipes.mockResolvedValue([
      {
        id: "r1",
        name: "R",
        updatedAt: 1,
        steps: [
          { id: "a", type: "filter", enabled: false, config: {} },
          { id: "b", type: "filter", config: {} },
        ],
      },
    ]);

    const [recipe] = await loadRecipes();

    expect(recipe.steps[0].enabled).toBe(false);
    expect(recipe.steps[1].enabled).toBe(true);
  });

  it("returns an empty array when there are no stored recipes", async () => {
    listTransformRecipes.mockResolvedValue([]);
    expect(await loadRecipes()).toEqual([]);
  });
});

describe("removeRecipe", () => {
  it("delegates deletion to the storage accessor", async () => {
    deleteTransformRecipe.mockResolvedValue(undefined);
    await removeRecipe("r1");
    expect(deleteTransformRecipe).toHaveBeenCalledWith("r1");
  });
});
