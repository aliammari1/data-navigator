"use client";

/**
 * Optional AI narration for theater scenes.
 *
 * Narration is generated through the offline provider registry
 * (`useAI().generateStructured`) and validated by a Zod schema, so output is
 * valid JSON by construction (GBNF grammar in the Electron llama.cpp lane). It
 * is grounded ONLY in real aggregated facts pulled from DuckDB — never invented.
 * Failure (no model, abort, parse error) degrades silently to the scene's
 * default subtitle.
 */

import { z } from "zod";
import type { ZodType } from "zod";
import type { SceneKind } from "../model/scene";
import { sceneDefinition } from "../model/scene";

export const SCENE_NARRATION_SCHEMA = z.object({
  scenes: z.array(
    z.object({
      kind: z.enum(["calendar", "race", "sankey", "gantt", "wordcloud", "sunburst"]),
      narration: z.string().min(1).max(400),
    }),
  ),
});

export type SceneNarration = z.infer<typeof SCENE_NARRATION_SCHEMA>;

/** Compact, model-friendly facts about the dataset and what each scene shows. */
export interface NarrationFacts {
  datasetName: string;
  rowCount: number;
  dateColumn: string | null;
  measureColumn: string | null;
  categoryColumn: string | null;
  textColumn: string | null;
  sceneKinds: SceneKind[];
}

export interface NarrateDeps {
  generateStructured: <T>(
    req: {
      system?: string;
      prompt: string;
      maxTokens?: number;
      temperature?: number;
      signal?: AbortSignal;
    },
    schema: ZodType<T>,
  ) => Promise<T>;
  signal?: AbortSignal;
}

/**
 * Generate one-sentence narration per scene, grounded in the dataset facts.
 * Returns a `kind → narration` map; callers merge it into the authored theater.
 */
export async function narrateScenes(
  facts: NarrationFacts,
  deps: NarrateDeps,
): Promise<Record<string, string>> {
  const sceneList = facts.sceneKinds
    .map((k) => `- ${k}: ${sceneDefinition(k).subtitle}`)
    .join("\n");

  const prompt =
    `Dataset "${facts.datasetName}" has ${facts.rowCount.toLocaleString()} rows.\n` +
    `Key columns — date: ${facts.dateColumn ?? "none"}, measure: ${facts.measureColumn ?? "row counts"}, ` +
    `category: ${facts.categoryColumn ?? "none"}, text: ${facts.textColumn ?? "none"}.\n\n` +
    `This is a scrollytelling "analytics theater". For each scene below, write ONE concise, ` +
    `presentation-style narration sentence (max ~30 words) that tells the audience what to look for. ` +
    `Ground every statement in the columns above; do not invent specific figures.\n\nScenes:\n${sceneList}`;

  const result = await deps.generateStructured(
    {
      system:
        "You are a precise data-storytelling narrator. Use only the provided dataset facts; never fabricate numbers.",
      prompt,
      maxTokens: 768,
      temperature: 0.3,
      signal: deps.signal,
    },
    SCENE_NARRATION_SCHEMA,
  );

  const map: Record<string, string> = {};
  for (const s of result.scenes) map[s.kind] = s.narration;
  return map;
}
