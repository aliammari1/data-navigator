/**
 * Text embeddings for semantic column matching, NLQ understanding, and smart
 * insight generation.
 *
 * The actual model (all-MiniLM-L6-v2, GGUF Q8_0) runs via node-llama-cpp in
 * the Electron MAIN process (`electron/embedding-service.ts`) — NOT in the
 * renderer. This module is a thin, stable API over the IPC bridge
 * (`src/platform/ai/inference-client.ts`); `@huggingface/transformers` is
 * never imported here.
 */

import type { ColMeta } from "@/core/stores/data-store";
import { embedTexts, preloadEmbedder } from "./inference-client";

let embedderReady = false;

/** Embed texts via the worker and unpack to plain number[][] for downstream math. */
async function embed(texts: string[]): Promise<number[][]> {
  const vectors = await embedTexts(texts);
  embedderReady = true;
  return vectors.map((v) => Array.from(v));
}

// ─── Cosine similarity ─────────────────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ─── Public API ────────────────────────────────────────────────────────────────

export interface SemanticMatch {
  column: ColMeta;
  score: number;
}

/**
 * Find the columns most semantically related to a natural language query.
 * Uses text embeddings to match meaning, not just keywords.
 */
export async function semanticColumnMatch(
  query: string,
  columns: ColMeta[],
  topK = 3,
): Promise<SemanticMatch[]> {
  try {
    // Build descriptive text for each column.
    const colTexts = columns.map((c) => {
      const parts = [c.name.replace(/_/g, " ")];
      if (c.type === "number") parts.push("numeric metric value");
      if (c.type === "string") parts.push("category label text");
      if (c.type === "date") parts.push("date time period");
      return parts.join(" ");
    });

    const vectors = await embed([query, ...colTexts]);

    const queryVec = vectors[0];
    const results: SemanticMatch[] = columns.map((col, i) => ({
      column: col,
      score: cosineSimilarity(queryVec, vectors[i + 1]),
    }));

    return results.sort((a, b) => b.score - a.score).slice(0, topK);
  } catch {
    // Fallback: basic substring matching if the model fails to load.
    return columns
      .map((col) => ({
        column: col,
        score: query.toLowerCase().includes(col.name.toLowerCase()) ? 0.8 : 0.1,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}

/**
 * Generate semantic similarity scores between all numeric columns.
 * Useful for finding semantically related metrics even if names differ.
 */
export async function semanticColumnRelations(
  columns: ColMeta[],
): Promise<{ col1: string; col2: string; similarity: number }[]> {
  try {
    const texts = columns.map((c) => c.name.replace(/_/g, " "));
    const vectors = await embed(texts);

    const relations: { col1: string; col2: string; similarity: number }[] = [];
    for (let i = 0; i < columns.length; i++) {
      for (let j = i + 1; j < columns.length; j++) {
        const sim = cosineSimilarity(vectors[i], vectors[j]);
        if (sim > 0.5) {
          relations.push({
            col1: columns[i].name,
            col2: columns[j].name,
            similarity: sim,
          });
        }
      }
    }

    return relations.sort((a, b) => b.similarity - a.similarity);
  } catch {
    return [];
  }
}

/**
 * Low-level batch embedding helper for callers that want raw vectors
 * (e.g. a vector index). Returns one Float32Array per input text.
 */
export async function embedRaw(texts: string[]): Promise<Float32Array[]> {
  const vectors = await embedTexts(texts);
  embedderReady = true;
  return vectors;
}

/** Check if the embeddings model has been loaded at least once. */
export function isEmbeddingsReady(): boolean {
  return embedderReady;
}

/** Preload the model without blocking. */
export function preloadEmbeddings(): void {
  preloadEmbedder()
    .then(() => {
      embedderReady = true;
    })
    .catch(() => {
      // silently fail — model will retry on next use
    });
}
