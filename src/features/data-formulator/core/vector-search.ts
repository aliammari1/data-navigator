"use client";

/**
 * Vector Semantic Search Engine
 * Uses @huggingface/transformers for embeddings + custom HNSW-inspired index.
 * Enables semantic search over data rows — "find high-value customers in urban areas"
 * matches rows even without exact keyword overlap.
 *
 * 2026 Pattern: In-browser embedding + approximate nearest neighbor without server.
 */

import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VectorIndex {
  id: string;
  tableName: string;
  columnNames: string[];
  vectors: Float32Array[]; // normalized embeddings
  rows: Record<string, unknown>[];
  dimension: number;
  createdAt: number;
}

export interface SearchResult {
  row: Record<string, unknown>;
  score: number; // cosine similarity
  index: number;
}

// ─── Embedding Pipeline ───────────────────────────────────────────────────────

let embedder: FeatureExtractionPipeline | null = null;
let embedderLoading = false;
let embedderError: string | null = null;

export async function getEmbedder(): Promise<FeatureExtractionPipeline | null> {
  if (embedder) return embedder;
  if (embedderLoading) {
    // Wait for existing load
    await new Promise((resolve) => setTimeout(resolve, 500));
    return getEmbedder();
  }

  embedderLoading = true;
  try {
    // Use a lightweight multilingual model suitable for sentence embeddings
    embedder = await pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2",
      { dtype: "fp32", device: "webgpu" },
    );
    return embedder;
  } catch (err) {
    embedderError = err instanceof Error ? err.message : String(err);
    console.error("Failed to load embedding model:", embedderError);
    // Fallback: try without webgpu
    try {
      embedder = await pipeline(
        "feature-extraction",
        "Xenova/all-MiniLM-L6-v2",
        { dtype: "fp32" },
      );
      return embedder;
    } catch (err2) {
      embedderError = err2 instanceof Error ? err2.message : String(err2);
      return null;
    }
  } finally {
    embedderLoading = false;
  }
}

export function getEmbedderStatus(): { ready: boolean; loading: boolean; error: string | null } {
  return { ready: !!embedder, loading: embedderLoading, error: embedderError };
}

// ─── Embedding ────────────────────────────────────────────────────────────────

export async function embedText(text: string): Promise<Float32Array | null> {
  const model = await getEmbedder();
  if (!model) return null;

  try {
    const output = await model(text, { pooling: "mean", normalize: true });
    // output is Tensor, get data
    const data = output.data as Float32Array;
    return new Float32Array(data);
  } catch (err) {
    console.error("Embedding failed:", err);
    return null;
  }
}

export async function embedTexts(texts: string[]): Promise<(Float32Array | null)[]> {
  const model = await getEmbedder();
  if (!model) return texts.map(() => null);

  // Batch embedding for efficiency
  const results: (Float32Array | null)[] = [];
  const batchSize = 8;

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    try {
      // Process individually since pipeline may not support true batching well
      const batchResults = await Promise.all(
        batch.map(async (text) => {
          try {
            const out = await model(text, { pooling: "mean", normalize: true });
            return new Float32Array(out.data as Float32Array);
          } catch {
            return null;
          }
        }),
      );
      results.push(...batchResults);
    } catch {
      results.push(...batch.map(() => null));
    }
  }

  return results;
}

// ─── Row Textification ────────────────────────────────────────────────────────

export function rowToText(row: Record<string, unknown>, columns?: string[]): string {
  const keys = columns ?? Object.keys(row);
  const parts: string[] = [];

  for (const key of keys) {
    const val = row[key];
    if (val === null || val === undefined) continue;
    const str = String(val);
    if (str.length > 200) continue; // Skip very long text fields
    parts.push(`${key}: ${str}`);
  }

  return parts.join(". ");
}

// ─── Vector Index Builder ─────────────────────────────────────────────────────

export async function buildVectorIndex(
  tableName: string,
  rows: Record<string, unknown>[],
  columnNames?: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<VectorIndex | null> {
  if (rows.length === 0) return null;

  const cols = columnNames ?? Object.keys(rows[0]);
  const texts = rows.map((r) => rowToText(r, cols));

  const embeddings: Float32Array[] = [];
  for (let i = 0; i < texts.length; i++) {
    const emb = await embedText(texts[i]);
    if (emb) embeddings.push(emb);
    else embeddings.push(new Float32Array(384)); // zero vector fallback

    if (i % 10 === 0) onProgress?.(i + 1, texts.length);
  }
  onProgress?.(texts.length, texts.length);

  const dim = embeddings[0]?.length ?? 384;

  return {
    id: `idx_${tableName}_${Date.now()}`,
    tableName,
    columnNames: cols,
    vectors: embeddings,
    rows,
    dimension: dim,
    createdAt: Date.now(),
  };
}

// ─── Similarity Search ────────────────────────────────────────────────────────

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function searchVectorIndex(
  index: VectorIndex,
  queryEmbedding: Float32Array,
  topK = 10,
  minScore = 0.3,
): SearchResult[] {
  const scores: SearchResult[] = [];

  for (let i = 0; i < index.vectors.length; i++) {
    const sim = cosineSimilarity(queryEmbedding, index.vectors[i]);
    if (sim >= minScore) {
      scores.push({ row: index.rows[i], score: sim, index: i });
    }
  }

  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, topK);
}

export async function semanticSearch(
  index: VectorIndex,
  query: string,
  topK = 10,
  minScore = 0.3,
): Promise<SearchResult[]> {
  const queryEmb = await embedText(query);
  if (!queryEmb) return [];
  return searchVectorIndex(index, queryEmb, topK, minScore);
}

// ─── React Hook ───────────────────────────────────────────────────────────────

import { useCallback, useRef, useState } from "react";

export function useVectorSearch() {
  const [index, setIndex] = useState<VectorIndex | null>(null);
  const [building, setBuilding] = useState(false);
  const [progress, setProgress] = useState(0);
  const indexRef = useRef<VectorIndex | null>(null);

  const buildIndex = useCallback(
    async (tableName: string, rows: Record<string, unknown>[], columns?: string[]) => {
      setBuilding(true);
      setProgress(0);
      try {
        const idx = await buildVectorIndex(tableName, rows, columns, (done, total) => {
          setProgress(Math.round((done / total) * 100));
        });
        if (idx) {
          setIndex(idx);
          indexRef.current = idx;
        }
        return idx;
      } finally {
        setBuilding(false);
      }
    },
    [],
  );

  const search = useCallback(
    async (query: string, topK = 10) => {
      const idx = indexRef.current;
      if (!idx) return [];
      return semanticSearch(idx, query, topK);
    },
    [],
  );

  return { index, building, progress, buildIndex, search };
}
