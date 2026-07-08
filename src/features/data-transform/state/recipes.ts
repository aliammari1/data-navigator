/**
 * Durable transform-recipe persistence (Dexie, offline IndexedDB).
 *
 * Replaces the ephemeral `useState` recipe (§3.4): steps/run history died on
 * reload. We persist the recipe (id, name, datasetId, steps[]) through the
 * platform app-db accessors `putTransformRecipe`/`listTransformRecipes`/
 * `deleteTransformRecipe` — feature code must NOT open its own Dexie database
 * (FOUNDATION-API: "replace every localStorage-as-DB use" via @/platform/storage).
 *
 * Steps are stored as plain clone-safe objects (the accessor runs
 * `toCloneSafeArray`), so they round-trip cleanly back into `TransformStep[]`.
 */

import {
  deleteTransformRecipe,
  listTransformRecipes,
  newId,
  putTransformRecipe,
  type TransformRecipe,
} from "@/platform/storage";
import type { StepType, TransformStep } from "../engine/sql";

const STEP_TYPES: ReadonlySet<string> = new Set<StepType>([
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
]);

export interface SavedRecipe {
  id: string;
  name: string;
  datasetId?: string;
  updatedAt: number;
  steps: TransformStep[];
}

/** Coerce a persisted unknown[] back into typed, runnable steps (defensive). */
function reviveSteps(raw: unknown[]): TransformStep[] {
  const out: TransformStep[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const s = item as Record<string, unknown>;
    if (typeof s.type !== "string" || !STEP_TYPES.has(s.type)) continue;
    out.push({
      id: typeof s.id === "string" ? s.id : newId(),
      type: s.type as StepType,
      label: typeof s.label === "string" ? s.label : s.type,
      enabled: s.enabled !== false,
      config: s.config && typeof s.config === "object" ? (s.config as Record<string, unknown>) : {},
    });
  }
  return out;
}

/** Persist (insert or update) a recipe. Returns the recipe id used. */
export async function saveRecipe(input: {
  id?: string;
  name: string;
  datasetId?: string;
  steps: TransformStep[];
}): Promise<string> {
  const id = input.id ?? newId();
  // Strip volatile runtime nothing-state; steps are already config-only.
  const cloneSafe = input.steps.map((s) => ({
    id: s.id,
    type: s.type,
    label: s.label,
    enabled: s.enabled,
    config: { ...s.config },
  }));
  await putTransformRecipe({
    id,
    name: input.name,
    datasetId: input.datasetId,
    steps: cloneSafe,
  });
  return id;
}

/** List saved recipes, newest first, optionally scoped to a dataset. */
export async function loadRecipes(datasetId?: string): Promise<SavedRecipe[]> {
  const rows: TransformRecipe[] = await listTransformRecipes(datasetId);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    datasetId: r.datasetId,
    updatedAt: r.updatedAt,
    steps: reviveSteps(r.steps),
  }));
}

export async function removeRecipe(id: string): Promise<void> {
  await deleteTransformRecipe(id);
}
