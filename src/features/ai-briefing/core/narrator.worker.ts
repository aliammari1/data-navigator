/**
 * Offline neural narration worker for the AI briefing feature (Comlink).
 *
 * Replaces the OS-dependent `window.speechSynthesis` path with the bundled
 * Kokoro-82M ONNX neural TTS (`kokoro-js`). Synthesis runs here, off the render
 * thread, and the model is configured for strict offline use via
 * `configureTransformersEnv` (self-hosted ORT wasm, IndexedDB weight cache) — no
 * CDN, no network. Long text is split into sentence chunks so the first audio
 * arrives quickly and the caller can play chunk-by-chunk.
 *
 * The renderer falls back to `speechSynthesis` only when this worker / the model
 * is unavailable (see `useNarrator`).
 */

import * as Comlink from "comlink";
import { chunkText, type KokoroTtsInstance, loadKokoroModel } from "@/platform/ai/kokoro-tts";
import { configureTransformersEnv } from "@/platform/ai/transformers-env";

// Configure the offline env BEFORE any transformers/kokoro pipeline is created.
// Air-gapped by design: never attempt a CDN weight download (allowRemoteModels:
// false). This worker is a fallback only — the renderer prefers the bundled
// native sherpa-onnx voice lane (see useNarrator); if no Kokoro weights are
// cached this simply falls back to system voices.
configureTransformersEnv({ allowRemoteModels: false });

const MODEL_ID = "onnx-community/Kokoro-82M-ONNX";
const DEFAULT_VOICE = "af_heart";

/**
 * Narrator-specific view of the loaded Kokoro instance. The shared loader returns
 * a generic instance; the narrator relies on `generate()` returning an object
 * with `toBlob()` so it can hand WAV bytes back over Comlink.
 */
interface KokoroInstance extends KokoroTtsInstance {
  generate(
    text: string,
    opts?: { voice?: string; speed?: number },
  ): Promise<{ audio: Float32Array; sampling_rate: number; toBlob(): Blob }>;
}

let instance: KokoroInstance | null = null;
let loading: Promise<KokoroInstance> | null = null;

async function ensure(onProgress?: (p: number) => void): Promise<KokoroInstance> {
  if (instance) return instance;
  if (!loading) {
    loading = (async () => {
      const tts = (await loadKokoroModel({
        modelId: MODEL_ID,
        dtype: "q8",
        device: "wasm",
        onProgress: (p) => onProgress?.(Math.round(p.progress ?? 0)),
      })) as KokoroInstance;
      instance = tts;
      return tts;
    })();
  }
  return loading;
}

/** Split prose into sentence-ish chunks bounded in length for snappy first audio. */
function splitSentences(text: string, maxLen = 280): string[] {
  return chunkText(text, maxLen);
}

const api = {
  /** Warm/load the model; returns true when ready. */
  async ensureReady(onProgress?: (p: number) => void): Promise<boolean> {
    try {
      await ensure(onProgress);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Synthesize the whole text to a single WAV Blob (sentence-chunked internally
   * by Kokoro). Returns the audio bytes for the caller to play via an
   * <audio>/object URL. Transfers the ArrayBuffer back zero-copy.
   */
  async synthesize(
    text: string,
    opts?: { voice?: string; speed?: number },
  ): Promise<{ bytes: ArrayBuffer; type: string } | null> {
    const chunks = splitSentences(text);
    if (chunks.length === 0) return null;
    const tts = await ensure();
    // Kokoro handles internal phoneme batching; concatenating per-sentence
    // blobs would require WAV stitching, so synthesize the joined text once
    // (bounded by the caller — briefings are short).
    const audio = await tts.generate(chunks.join(" "), {
      voice: opts?.voice ?? DEFAULT_VOICE,
      speed: opts?.speed ?? 1,
    });
    const blob = audio.toBlob();
    const buf = await blob.arrayBuffer();
    return Comlink.transfer({ bytes: buf, type: blob.type || "audio/wav" }, [buf]);
  },
};

export type NarratorWorkerApi = typeof api;
Comlink.expose(api);
