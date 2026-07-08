/**
 * Main-thread client for the Lane B inference worker
 * (`src/workers/inference.worker.ts`).
 *
 * Lazily spins up ONE module worker and wraps it with Comlink, so all browser-
 * side transformers.js work (embeddings + the text-generation fallback) runs off
 * the renderer main thread. Feature/platform code calls these helpers instead of
 * importing `@huggingface/transformers` directly.
 *
 * The worker is created on first use and reused; `disposeInferenceWorker()`
 * tears it down (e.g. on logout / model-cache clear).
 */

import * as Comlink from "comlink";
import type { InferenceWorkerApi } from "@/workers/inference.worker";

let worker: Worker | null = null;
let proxy: Comlink.Remote<InferenceWorkerApi> | null = null;

/** The Comlink proxy for the inference worker (created on first call). */
export function getInferenceWorker(): Comlink.Remote<InferenceWorkerApi> {
  if (proxy) return proxy;
  if (typeof window === "undefined" || typeof Worker === "undefined") {
    throw new Error("Inference worker is only available in a browser/renderer context.");
  }
  worker = new Worker(new URL("@/workers/inference.worker.ts", import.meta.url), {
    type: "module",
  });
  proxy = Comlink.wrap<InferenceWorkerApi>(worker);
  return proxy;
}

/**
 * Embed a batch of texts in a single forward pass. Returns 384-dim, mean-pooled,
 * L2-normalised vectors (Float32Array per input text).
 */
export async function embedTexts(texts: string[], model?: string): Promise<Float32Array[]> {
  if (texts.length === 0) return [];
  return getInferenceWorker().embedBatch(texts, model);
}

/** Embed a single text → one 384-dim vector. */
export async function embedText(text: string, model?: string): Promise<Float32Array> {
  return getInferenceWorker().embed(text, model);
}

/** Warm the embeddings model without blocking on a query. */
export async function preloadEmbedder(model?: string): Promise<void> {
  await getInferenceWorker().loadEmbedder(model);
}

export interface BrowserGenerateInput {
  system?: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
}

/**
 * Browser LLM fallback (Lane B). Streams tokens to `onToken` if provided and
 * resolves with the full text. Used when the Electron node-llama-cpp lane is
 * unavailable.
 */
export async function browserGenerate(
  input: BrowserGenerateInput,
  onToken?: (token: string) => void,
): Promise<{ text: string }> {
  const api = getInferenceWorker();
  return api.generate(input, onToken ? Comlink.proxy(onToken) : undefined);
}

/** Warm the generative fallback model. */
export async function preloadBrowserGenerator(
  model?: string,
  onProgress?: (info: { status: string; progress: number }) => void,
): Promise<void> {
  const api = getInferenceWorker();
  await api.loadGenerator(model, onProgress ? Comlink.proxy(onProgress) : undefined);
}

/** Tear down the worker and free model memory. */
export async function disposeInferenceWorker(): Promise<void> {
  if (proxy) {
    try {
      await proxy.dispose();
    } catch {
      // ignore — we're tearing down anyway
    }
  }
  worker?.terminate();
  worker = null;
  proxy = null;
}
