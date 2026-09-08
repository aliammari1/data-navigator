/**
 * node-llama-cpp Embedding Service — Electron MAIN process edition.
 *
 * Mirrors llama-service.ts's shape for the embeddings lane: a node-llama-cpp
 * GGUF model running ONLY in the Electron main process (importing
 * node-llama-cpp in the renderer crashes the app). Powers semantic column
 * matching / NLQ understanding via `window.electronEmbed.*` — the renderer no
 * longer runs @huggingface/transformers in a Web Worker for this.
 *
 * Design notes (see the embedding-migration research doc for full rationale):
 * - Reuses the shared `Llama` backend from llama-service.ts. Only one native
 *   backend ever exists per process. A second getLlama instance plus a second
 *   model crashes the app on send after load.
 * - Owns ONE `LlamaModel` + ONE shared `LlamaEmbeddingContext` (256-token
 *   context — all-MiniLM-L6-v2's fine-tuned max_seq_length; the GGUF's raw
 *   positional capacity is 512, but 256 is the trained/safe ceiling).
 * - Requests run through llama-service.ts's single generation queue. Chat
 *   prompts and embeddings never overlap on the native runtime. A tiny embed
 *   batch briefly delays chat, but overlapping native inference kills main.
 * - `getEmbeddingFor()` does NOT L2-normalize its output and THROWS on
 *   overlong input instead of truncating — both are handled explicitly below
 *   (l2Normalize / tokenizeCapped) so the "384-dim, mean-pooled,
 *   L2-normalized" contract the rest of the app already assumes stays true.
 *
 * Public API: ensureEmbedModel(), embedOne(), embedBatch(), dispose().
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { app } from "electron";
import type { LlamaEmbeddingContext, LlamaModel, Token } from "node-llama-cpp";
import { enqueueLlamaTask, getSharedLlama } from "./llama-service";
import { MODEL_DOWNLOADS } from "./model-download-service";

// ─── Types ──────────────────────────────────────────────────────────────────

export type EmbedOneResult = {
  vector: number[];
  dims: number;
  model: string;
  elapsedMs: number;
};

export type EmbedBatchResult = {
  vectors: number[][];
  dims: number;
  model: string;
  elapsedMs: number;
};

// ─── Constants ──────────────────────────────────────────────────────────────

const EMBED_MODEL_ENTRY = MODEL_DOWNLOADS.find((m) => m.lane === "embed");
if (!EMBED_MODEL_ENTRY) {
  throw new Error('model-download-service: no MODEL_DOWNLOADS entry has lane "embed".');
}

export const DEFAULT_EMBED_MODEL = EMBED_MODEL_ENTRY.file;

/** all-MiniLM-L6-v2's dimensionality — every downstream cosine-similarity
 * comparison assumes this; a differently-configured model must be refused. */
const EXPECTED_DIMS = 384;

/**
 * all-MiniLM-L6-v2's trained max_seq_length (the safe ceiling), not the GGUF's
 * raw 512-token positional capacity read via readGgufFileInfo.
 */
const EMBED_CONTEXT_SIZE = 256;

// ─── Module state ───────────────────────────────────────────────────────────

let model: LlamaModel | null = null;
let loadedModelPath: string | null = null;
let embeddingContext: LlamaEmbeddingContext | null = null;

/**
 * Single global native queue. Delegates to llama-service.ts so chat prompts
 * and embeddings never run concurrently on the native runtime.
 */
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  return enqueueLlamaTask(task);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function modelDir(): string {
  return path.join(app.getPath("userData"), "models", "embed");
}

function modelPath(file: string): string {
  return path.join(modelDir(), file);
}

async function disposeEmbeddingContext(): Promise<void> {
  if (embeddingContext) {
    try {
      await embeddingContext.dispose();
    } catch {
      // best-effort
    }
    embeddingContext = null;
  }
}

/** One long-lived embedding context, reused across every call (see module doc). */
async function getEmbeddingContext(): Promise<LlamaEmbeddingContext> {
  if (embeddingContext) return embeddingContext;
  // biome-ignore lint/style/noNonNullAssertion: callers invoke ensureEmbedModel() first, which guarantees `model`.
  embeddingContext = await model!.createEmbeddingContext({ contextSize: EMBED_CONTEXT_SIZE });
  return embeddingContext;
}

function abortError(): Error {
  const error = new Error("Embedding aborted");
  error.name = "AbortError";
  return error;
}

/**
 * L2-normalize a raw embedding vector. node-llama-cpp's `getEmbeddingFor()`
 * does NOT normalize its output (llama.cpp's `--embd-normalize` is a CLI-
 * example-only post-process, not baked into the addon call) — every consumer
 * already normalizes at compare time so this doesn't change cosine-similarity
 * results, but it keeps the documented "L2-normalized" contract literally true
 * for any future raw-dot-product consumer (e.g. an ANN index).
 */
function l2Normalize(vector: readonly number[]): number[] {
  let normSq = 0;
  for (const v of vector) normSq += v * v;
  const norm = Math.sqrt(normSq);
  if (norm === 0) return Array.from(vector);
  return vector.map((v) => v / norm);
}

/**
 * Tokenize + defensively cap to the context window, leaving room for the
 * model's own BOS/EOS insertion. `getEmbeddingFor()` THROWS on overlong input
 * rather than silently truncating it (unlike the previous Transformers.js
 * pipeline's implicit tokenizer truncation) — this keeps an unusually long
 * column description / NLQ string from crashing the embed call.
 */
function tokenizeCapped(text: string): Token[] {
  // biome-ignore lint/style/noNonNullAssertion: callers invoke ensureEmbedModel() first.
  const tokens = model!.tokenize(text);
  const maxTokens = EMBED_CONTEXT_SIZE - 2;
  return tokens.length > maxTokens ? tokens.slice(0, maxTokens) : tokens;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Load (or switch to) a GGUF embedding model from `<userData>/models/embed`.
 * Idempotent for an already-loaded model; disposes the previous model +
 * context when switching. Throws loudly (and refuses to keep the model
 * loaded) if it doesn't produce {@link EXPECTED_DIMS}-dim vectors — a silent
 * dimension mismatch would corrupt every downstream cosine-similarity
 * comparison without crashing.
 */
export async function ensureEmbedModel(
  file: string = DEFAULT_EMBED_MODEL,
): Promise<{ model: string; dims: number }> {
  const llama = await getSharedLlama();
  const target = modelPath(file);

  if (!existsSync(target)) {
    throw new Error(
      `Missing GGUF embedding model: ${target}. Download it while online into ${modelDir()}.`,
    );
  }

  if (model && loadedModelPath === target) {
    return { model: target, dims: model.embeddingVectorSize };
  }

  if (model) {
    await disposeEmbeddingContext();
    await model.dispose();
    model = null;
    loadedModelPath = null;
  }

  const loaded = await llama.loadModel({ modelPath: target });

  if (loaded.embeddingVectorSize !== EXPECTED_DIMS) {
    const dims = loaded.embeddingVectorSize;
    await loaded.dispose();
    throw new Error(
      `Embedding model ${target} produces ${dims}-dim vectors, expected ${EXPECTED_DIMS}. ` +
        "Every downstream cosine-similarity comparison assumes this dimensionality — refusing to load.",
    );
  }

  model = loaded;
  loadedModelPath = target;
  return { model: target, dims: model.embeddingVectorSize };
}

/** Embed a single text. Enqueued on this lane's own queue. */
export async function embedOne(text: string, signal?: AbortSignal): Promise<EmbedOneResult> {
  return enqueue(async () => {
    const start = Date.now();
    if (signal?.aborted) throw abortError();
    await ensureEmbedModel();
    if (signal?.aborted) throw abortError();

    const context = await getEmbeddingContext();
    const tokens = tokenizeCapped(text);
    const embedding = await context.getEmbeddingFor(tokens);
    const vector = l2Normalize(embedding.vector);

    return {
      vector,
      dims: vector.length,
      model: loadedModelPath ?? "",
      elapsedMs: Date.now() - start,
    };
  });
}

/**
 * Embed a batch of texts. Enqueued ONCE for the whole batch (not per item).
 * There is no native batched/single-forward-pass API for multiple independent
 * strings, so this calls `getEmbeddingFor` once per text in a plain
 * sequential loop (the context's internal lock serializes them anyway),
 * checking `signal` between items so a large batch can be cancelled promptly.
 */
export async function embedBatch(texts: string[], signal?: AbortSignal): Promise<EmbedBatchResult> {
  return enqueue(async () => {
    const start = Date.now();
    if (texts.length === 0) {
      return { vectors: [], dims: 0, model: loadedModelPath ?? "", elapsedMs: 0 };
    }
    if (signal?.aborted) throw abortError();
    await ensureEmbedModel();
    if (signal?.aborted) throw abortError();

    const context = await getEmbeddingContext();
    const vectors: number[][] = [];
    for (const text of texts) {
      if (signal?.aborted) throw abortError();
      const tokens = tokenizeCapped(text);
      const embedding = await context.getEmbeddingFor(tokens);
      vectors.push(l2Normalize(embedding.vector));
    }

    return {
      vectors,
      dims: vectors[0]?.length ?? 0,
      model: loadedModelPath ?? "",
      elapsedMs: Date.now() - start,
    };
  });
}

/**
 * Dispose this lane's model and context only. The shared Llama backend is
 * owned by llama-service.ts and disposed there. Disposing it here would kill
 * chat inference on quit.
 */
export async function dispose(): Promise<void> {
  await disposeEmbeddingContext();
  try {
    if (model) await model.dispose();
  } catch (error) {
    console.warn("[embedding] model dispose error:", error);
  } finally {
    model = null;
    loadedModelPath = null;
  }
}
