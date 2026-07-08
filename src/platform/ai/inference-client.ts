/**
 * Main-thread client for the node-llama-cpp embedding service.
 *
 * node-llama-cpp only runs in the Electron MAIN process — the renderer talks
 * to it through the `window.electronLlama` bridge (electron/preload.ts) over
 * IPC (`llama:embed*`, wired in electron/main.ts to electron/embed-service.ts).
 * This module is a thin, stable wrapper so callers (platform/ai/embeddings.ts)
 * never touch IPC or node-llama-cpp directly.
 */

function bridge(): Window["electronLlama"] {
  if (typeof window === "undefined" || !window.electronLlama) {
    throw new Error("node-llama-cpp embeddings require the Electron desktop app.");
  }
  return window.electronLlama;
}

/**
 * Embed a batch of texts in a single IPC round-trip. Returns one vector per
 * input text (same order), sized to the configured GGUF embedding model.
 */
export async function embedTexts(texts: string[]): Promise<Float32Array[]> {
  if (texts.length === 0) return [];
  return bridge().embed(texts);
}

/** Embed a single text → one vector. */
export async function embedText(text: string): Promise<Float32Array> {
  const [vector] = await embedTexts([text]);
  return vector;
}

/** Warm the embedding model without blocking on a query. */
export async function preloadEmbedder(): Promise<void> {
  await bridge().ensureEmbedModel();
}
