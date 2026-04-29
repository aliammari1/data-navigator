/**
 * Browser-side text embeddings via @huggingface/transformers.
 * Lazy-loads a small model (all-MiniLM-L6-v2) for semantic column matching,
 * NLQ understanding, and smart insight generation — all running locally.
 */

import type { ColMeta } from "@/lib/stores/data-store";

// Lazy-loaded pipeline reference
let embedPipeline: EmbedFn | null = null;
let loadingPromise: Promise<EmbedFn> | null = null;

type EmbedFn = (
  texts: string[],
  options?: { pooling: string; normalize: boolean },
) => Promise<{ tolist: () => number[][] }>;

/**
 * Lazy-load the feature-extraction pipeline once.
 * Returns a function: (texts) => embeddings[]
 */
async function getEmbedder(): Promise<EmbedFn> {
  if (embedPipeline) return embedPipeline;

  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const { pipeline, env } = await import("@huggingface/transformers");
    // Use WebGPU if available, fallback to WASM
    env.allowLocalModels = false;

    const extractor = await pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2",
      { dtype: "q8" },
    );

    const fn = async (texts: string[]) => {
      const result = await extractor(texts, {
        pooling: "mean",
        normalize: true,
      });
      return result;
    };

    embedPipeline = fn as unknown as EmbedFn;
    return embedPipeline;
  })();

  return loadingPromise;
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
    const embedder = await getEmbedder();

    // Build descriptive text for each column
    const colTexts = columns.map((c) => {
      const parts = [c.name.replace(/_/g, " ")];
      if (c.type === "number") parts.push("numeric metric value");
      if (c.type === "string") parts.push("category label text");
      if (c.type === "date") parts.push("date time period");
      return parts.join(" ");
    });

    const allTexts = [query, ...colTexts];
    const embeddings = await embedder(allTexts);
    const vectors = embeddings.tolist();

    const queryVec = vectors[0];
    const results: SemanticMatch[] = columns.map((col, i) => ({
      column: col,
      score: cosineSimilarity(queryVec, vectors[i + 1]),
    }));

    return results.sort((a, b) => b.score - a.score).slice(0, topK);
  } catch {
    // Fallback: basic substring matching if model fails to load
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
    const embedder = await getEmbedder();
    const texts = columns.map((c) => c.name.replace(/_/g, " "));
    const embeddings = await embedder(texts);
    const vectors = embeddings.tolist();

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
 * Check if the embeddings model is loaded and ready.
 */
export function isEmbeddingsReady(): boolean {
  return embedPipeline !== null;
}

/**
 * Preload the model without blocking.
 */
export function preloadEmbeddings(): void {
  getEmbedder().catch(() => {
    // silently fail — model will retry on next use
  });
}
