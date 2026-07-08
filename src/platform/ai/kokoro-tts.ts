/**
 * Shared Kokoro TTS core.
 *
 * The model-load (dynamic `kokoro-js` import + `KokoroTTS.from_pretrained`) and
 * the sentence-chunking logic were copy-pasted between the two Kokoro workers:
 *
 *  - `features/data-formulator/core/voice/voice-tts-worker.ts`
 *  - `features/ai-briefing/core/narrator.worker.ts`
 *
 * This module is the single source of truth for both. It is deliberately free of
 * any worker message protocol, voice registry, or React coupling, so each worker
 * keeps its own protocol and only the model-load + chunking primitives are shared.
 */

/** A loaded Kokoro instance — the subset of the API both workers rely on. */
export interface KokoroTtsInstance {
  generate: (text: string, options?: Record<string, unknown>) => Promise<unknown>;
  list_voices?: () => unknown;
}

interface KokoroModule {
  KokoroTTS: {
    from_pretrained: (
      modelId: string,
      options?: Record<string, unknown>,
    ) => Promise<KokoroTtsInstance>;
  };
}

/** Dynamically import `kokoro-js`. Isolated so it is mocked/stubbed in one place. */
export async function importKokoroModule(): Promise<KokoroModule> {
  return (await import("kokoro-js")) as unknown as KokoroModule;
}

export interface LoadKokoroModelOptions {
  modelId: string;
  /** Quantization/precision, e.g. `"q8"`. Passed straight to `from_pretrained`. */
  dtype?: string;
  /** Runtime device, e.g. `"wasm"` | `"webgpu"`. */
  device?: string;
  /** Local on-disk model path for offline use, when available. */
  localModelPath?: string;
  /** Load-progress callback (0..100-ish, engine-defined). */
  onProgress?: (progress: { progress?: number; status?: string }) => void;
}

/**
 * Load a Kokoro TTS instance via `KokoroTTS.from_pretrained`.
 *
 * Only forwards options that are actually provided so callers that omit
 * `localModelPath`/`progress_callback` get byte-for-byte the same call they made
 * before this was shared.
 */
export async function loadKokoroModel(options: LoadKokoroModelOptions): Promise<KokoroTtsInstance> {
  const mod = await importKokoroModule();
  return mod.KokoroTTS.from_pretrained(options.modelId, {
    ...(options.dtype !== undefined ? { dtype: options.dtype } : {}),
    ...(options.device !== undefined ? { device: options.device } : {}),
    ...(options.localModelPath ? { localModelPath: options.localModelPath } : {}),
    ...(options.onProgress ? { progress_callback: options.onProgress } : {}),
  });
}

/* ------------------------------------------------------------------ */
/*  Text preparation / chunking                                       */
/* ------------------------------------------------------------------ */

/** Default max characters per synthesized chunk for snappy first audio. */
export const DEFAULT_MAX_CHARS_PER_CHUNK = 220;

/**
 * Normalize prose for speech: NFKC fold, trim, strip zero-width characters, and
 * collapse runs of whitespace to single spaces.
 */
export function normalizeText(text: string): string {
  return text
    .normalize("NFKC")
    .trim()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Split normalized prose into sentence-ish parts. Splits after sentence-final
 * punctuation (incl. the Arabic question mark `؟`). Returns `[]` for empty input.
 */
export function splitIntoSentences(text: string): string[] {
  const normalized = normalizeText(text);

  if (!normalized) return [];

  const parts = normalized
    .split(/(?<=[.!?؟])\s+/u)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length > 0) {
    return parts;
  }

  return [normalized];
}

/**
 * Pack sentences into chunks bounded by `maxChars`, force-splitting any single
 * sentence that is itself longer than the bound on a word boundary.
 */
export function chunkText(text: string, maxChars = DEFAULT_MAX_CHARS_PER_CHUNK): string[] {
  const sentences = splitIntoSentences(text);
  const chunks: string[] = [];

  let current = "";

  for (const sentence of sentences) {
    if (!current) {
      current = sentence;
      continue;
    }

    if (`${current} ${sentence}`.length <= maxChars) {
      current = `${current} ${sentence}`;
      continue;
    }

    chunks.push(current);
    current = sentence;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.flatMap((chunk) => {
    if (chunk.length <= maxChars) return [chunk];

    const pieces: string[] = [];
    let remaining = chunk;

    while (remaining.length > maxChars) {
      const splitIndex = Math.max(
        remaining.lastIndexOf(" ", maxChars),
        Math.floor(maxChars * 0.75),
      );

      pieces.push(remaining.slice(0, splitIndex).trim());
      remaining = remaining.slice(splitIndex).trim();
    }

    if (remaining) pieces.push(remaining);

    return pieces;
  });
}
