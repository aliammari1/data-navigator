/**
 * Renderer-side client for the Electron MAIN-process node-llama-cpp embedding
 * lane (`electron/embedding-service.ts`), reached through the `window.electronEmbed`
 * bridge exposed by `electron/preload.ts` — the same "heavy engine lives in
 * Electron main, the renderer only talks to it over IPC" pattern already used
 * for chat/completion (`electron/llama-service.ts` +
 * `src/platform/ai/provider/adapters/llamacpp.ts`).
 *
 * `@huggingface/transformers` / Comlink / Web Workers are no longer part of the
 * embeddings path: it now runs as a GGUF model (all-MiniLM-L6-v2, Q8_0) inside
 * node-llama-cpp, in the main process, never in the renderer.
 */

function embedBridge(): Window["electronEmbed"] | null {
  if (typeof window === "undefined") return null;
  return window.electronEmbed ?? null;
}

function requireEmbedBridge(): NonNullable<Window["electronEmbed"]> {
  const bridge = embedBridge();
  if (!bridge) {
    throw new Error(
      "Embeddings require the desktop app (window.electronEmbed is unavailable in this context).",
    );
  }
  return bridge;
}

let requestSeq = 0;
function nextRequestId(prefix: string): string {
  requestSeq += 1;
  return `${prefix}-${Date.now()}-${requestSeq}`;
}

/**
 * Embed a batch of texts in one IPC round-trip. Returns 384-dim, mean-pooled,
 * L2-normalised vectors (Float32Array per input text).
 *
 * `model` is accepted for API compatibility with the previous browser-worker
 * lane but is currently inert: the Electron embedding lane serves a single
 * pinned GGUF model (see `DEFAULT_EMBED_MODEL` in electron/embedding-service.ts).
 */
export async function embedTexts(texts: string[], _model?: string): Promise<Float32Array[]> {
  if (texts.length === 0) return [];
  const result = await requireEmbedBridge().embedBatch({
    texts,
    requestId: nextRequestId("embed-batch"),
  });
  return result.vectors.map((vector) => Float32Array.from(vector));
}

/** Embed a single text → one 384-dim vector. `model` is inert (see embedTexts). */
export async function embedText(text: string, _model?: string): Promise<Float32Array> {
  const result = await requireEmbedBridge().embedOne({
    text,
    requestId: nextRequestId("embed-one"),
  });
  return Float32Array.from(result.vector);
}

/** Warm the embeddings model without blocking on a query. */
export async function preloadEmbedder(model?: string): Promise<void> {
  await requireEmbedBridge().ensureModel(model ? { file: model } : undefined);
}
