/**
 * node-llama-cpp Service — Electron MAIN process edition (EMBEDDING lane).
 *
 * Mental model (mirrors llama-service.ts, the generative lane):
 * - node-llama-cpp runs ONLY in the Electron main process. Importing it in the
 *   renderer crashes the app, so it lives here behind IPC (`llama:embed*`) and
 *   the renderer talks to it through the thin `window.electronLlama` adapter.
 * - GGUF weights are NOT bundled in the asar. They are downloaded once while
 *   online into `<userData>/models/llm/<model>.gguf` — the SAME directory and
 *   the SAME download/progress/sha256/IPC infrastructure llama-service.ts's
 *   generative models use (see model-download-service.ts's MODEL_DOWNLOADS).
 * - This module loads its OWN `LlamaModel` (the embedding model) and its own
 *   `LlamaEmbeddingContext`, kept separate from llama-service.ts's generative
 *   model/context state — they are two different models loaded from the same
 *   shared native `Llama` core (see `getSharedLlama()` in llama-service.ts).
 *   There is only ever ONE native backend instance in the process.
 *
 * Public API:
 * - ensureEmbedModel()
 * - embedBatch()
 * - isEmbedAvailable()
 * - disposeEmbed()
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { app } from "electron";
import type { LlamaEmbeddingContext, LlamaModel } from "node-llama-cpp";
import { getSharedLlama } from "./llama-service";
import { MODEL_DOWNLOADS } from "./model-download-service";

// ─── Constants ──────────────────────────────────────────────────────────────
// Derived from model-download-service.ts's MODEL_DOWNLOADS — the single source
// of truth for which GGUF models this app ships (mirrors llama-service.ts's
// DEFAULT_LLM_MODEL derivation for the generative lane).

const DEFAULT_EMBED_MODEL_ENTRY = MODEL_DOWNLOADS.find(
  (m) => m.key === "qwen3-embedding-0.6b-q8_0",
);
if (!DEFAULT_EMBED_MODEL_ENTRY) {
  throw new Error(
    "embed-service.ts: MODEL_DOWNLOADS is missing the 'qwen3-embedding-0.6b-q8_0' entry",
  );
}
export const DEFAULT_EMBED_MODEL = DEFAULT_EMBED_MODEL_ENTRY.file;

// ─── Module state ───────────────────────────────────────────────────────────
// Separate from llama-service.ts's `model`/`sharedContext` — this is a distinct
// LlamaModel (the embedding model) loaded from the same shared Llama core.

let embedModel: LlamaModel | null = null;
let embedContext: LlamaEmbeddingContext | null = null;
let loadedEmbedModelPath: string | null = null;

// ─── Helpers ────────────────────────────────────────────────────────────────
// Same layout as llama-service.ts's modelDir()/modelPath() — embeddings and
// generative GGUFs share the same directory.

function modelDir(): string {
  return path.join(app.getPath("userData"), "models", "llm");
}

function modelPath(file: string): string {
  return path.join(modelDir(), file);
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Load (or switch to) the embedding GGUF model from `<userData>/models/llm`.
 * Idempotent for an already-loaded model; disposes the previous model + context
 * when switching.
 */
export async function ensureEmbedModel(file: string = DEFAULT_EMBED_MODEL): Promise<void> {
  const target = modelPath(file);

  if (!existsSync(target)) {
    throw new Error(
      `Missing GGUF embedding model: ${target}. Download it while online into ${modelDir()}.`,
    );
  }

  if (embedModel && embedContext && loadedEmbedModelPath === target) {
    return;
  }

  if (embedModel) {
    await disposeEmbed();
  }

  const llama = await getSharedLlama();
  embedModel = await llama.loadModel({ modelPath: target });
  embedContext = await embedModel.createEmbeddingContext();
  loadedEmbedModelPath = target;
}

/** Embed a batch of texts, returning one vector per input (same order). */
export async function embedBatch(texts: string[]): Promise<Float32Array[]> {
  if (texts.length === 0) return [];

  await ensureEmbedModel();
  // biome-ignore lint/style/noNonNullAssertion: ensureEmbedModel() above guarantees `embedContext`.
  const context = embedContext!;

  const embeddings = await Promise.all(texts.map((text) => context.getEmbeddingFor(text)));
  return embeddings.map((embedding) => Float32Array.from(embedding.vector));
}

/**
 * True when node-llama-cpp can be initialized AND the embedding model is
 * present + loads. Never throws — callers gate the provider registry on this.
 */
export async function isEmbedAvailable(file: string = DEFAULT_EMBED_MODEL): Promise<boolean> {
  try {
    if (!existsSync(modelPath(file))) return false;
    await ensureEmbedModel(file);
    return true;
  } catch {
    return false;
  }
}

/** Dispose the loaded embedding context + model (app shutdown / model switch reset). */
export async function disposeEmbed(): Promise<void> {
  try {
    if (embedContext) {
      await embedContext.dispose();
    }
  } catch (error) {
    console.warn("[embed] embedding context dispose error:", error);
  } finally {
    embedContext = null;
  }

  try {
    if (embedModel) {
      await embedModel.dispose();
    }
  } catch (error) {
    console.warn("[embed] model dispose error:", error);
  } finally {
    embedModel = null;
    loadedEmbedModelPath = null;
  }
}
