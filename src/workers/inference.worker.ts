/// <reference lib="webworker" />

/**
 * Lane B inference worker — @huggingface/transformers (ONNX, WASM-SIMD, optional
 * WebGPU) running OFF the renderer main thread, exposed over Comlink.
 *
 * Responsibilities:
 *  - feature-extraction embeddings (all-MiniLM-L6-v2, int8/q8 on CPU) — the
 *    ALWAYS-available embeddings lane.
 *  - text-generation fallback — used when the Electron node-llama-cpp lane is
 *    unavailable (web build / no GGUF), with token streaming via a Comlink proxy.
 *
 * OFFLINE INVARIANTS (the #1 offline ship-blocker this fixes):
 *  - `configureTransformersEnv({ allowRemoteModels: false })` runs BEFORE the
 *    first `pipeline()` so onnxruntime-web loads its `.wasm` from the
 *    self-hosted `/models/onnx-runtime/` path, NEVER the jsDelivr CDN.
 *  - device order is `wasm`/`q8` FIRST (the guaranteed floor on the no-WebGPU
 *    target); WebGPU is an opportunistic upgrade behind a real adapter probe.
 *
 * This worker is the single home for browser-side transformers.js usage — the
 * former main-thread path in `platform/ai/embeddings.ts` now routes here.
 */

import {
  env,
  type FeatureExtractionPipeline,
  type ProgressInfo,
  pipeline,
  type TextGenerationPipeline,
  TextStreamer,
} from "@huggingface/transformers";
import * as Comlink from "comlink";
import { configureTransformersEnv } from "@/platform/ai/transformers-env";

// ── Offline env (BEFORE the first pipeline) ──────────────────────────────────
configureTransformersEnv({ allowRemoteModels: false });
// Pin CPU thread count to leave one core for the renderer; multi-threaded ORT
// also needs cross-origin isolation, so fall back to 1 thread when unavailable.
const isolated =
  typeof self !== "undefined" &&
  (self as unknown as { crossOriginIsolated?: boolean }).crossOriginIsolated === true;
const hwThreads = Math.max(1, (self.navigator?.hardwareConcurrency ?? 4) - 1);
const wasmBackend = env.backends?.onnx?.wasm;
if (wasmBackend) {
  wasmBackend.numThreads = isolated ? Math.min(4, hwThreads) : 1;
}

export type InferenceDevice = "webgpu" | "wasm";

/** Probe once whether a usable WebGPU adapter exists (opportunistic upgrade). */
let webgpuProbe: Promise<boolean> | null = null;
function hasWebGPU(): Promise<boolean> {
  webgpuProbe ??= (async () => {
    try {
      const gpu = (
        self.navigator as Navigator & {
          gpu?: { requestAdapter(): Promise<unknown> };
        }
      ).gpu;
      return Boolean(await gpu?.requestAdapter());
    } catch {
      return false;
    }
  })();
  return webgpuProbe;
}

// ── Embeddings ───────────────────────────────────────────────────────────────

const DEFAULT_EMBED_MODEL = "Xenova/all-MiniLM-L6-v2";

let embedder: FeatureExtractionPipeline | null = null;
let embedderModel = "";
let embedderLoading: Promise<FeatureExtractionPipeline> | null = null;

async function ensureEmbedder(
  model = DEFAULT_EMBED_MODEL,
  device: InferenceDevice = "wasm",
): Promise<FeatureExtractionPipeline> {
  if (embedder && embedderModel === model) return embedder;
  if (embedderLoading) return embedderLoading;

  embedderLoading = (async () => {
    configureTransformersEnv({ allowRemoteModels: false });
    const pipe = (await pipeline("feature-extraction", model, {
      device,
      // int8 on CPU (≈23 MB), fp32 on GPU for accuracy.
      dtype: device === "wasm" ? "q8" : "fp32",
    })) as FeatureExtractionPipeline;
    embedder = pipe;
    embedderModel = model;
    embedderLoading = null;
    return pipe;
  })();

  try {
    return await embedderLoading;
  } catch (err) {
    embedderLoading = null;
    throw err;
  }
}

// ── Text generation (browser LLM fallback) ───────────────────────────────────

const DEFAULT_GEN_MODEL = "onnx-community/Qwen2.5-0.5B-Instruct";

let generator: TextGenerationPipeline | null = null;
let generatorModel = "";
let generatorLoading: Promise<TextGenerationPipeline> | null = null;

async function ensureGenerator(
  model = DEFAULT_GEN_MODEL,
  onProgress?: (info: { status: string; progress: number }) => void,
): Promise<TextGenerationPipeline> {
  if (generator && generatorModel === model) return generator;
  if (generatorLoading) return generatorLoading;

  const progress_callback = onProgress
    ? (info: ProgressInfo) => {
        const pct =
          "progress" in info && typeof info.progress === "number" ? Math.round(info.progress) : 0;
        onProgress({ status: info.status, progress: pct });
      }
    : undefined;

  generatorLoading = (async () => {
    configureTransformersEnv({ allowRemoteModels: false });
    // wasm/q4 is the guaranteed floor; upgrade to webgpu/q4f16 only when probed.
    const useGpu = await hasWebGPU();
    let pipe: TextGenerationPipeline | null = null;
    for (const device of (useGpu ? ["webgpu", "wasm"] : ["wasm"]) as InferenceDevice[]) {
      try {
        pipe = (await pipeline("text-generation", model, {
          device,
          dtype: device === "webgpu" ? "q4f16" : "q4",
          progress_callback,
        })) as TextGenerationPipeline;
        break;
      } catch (err) {
        if (device === "wasm") throw err; // wasm is the floor — propagate.
      }
    }
    if (!pipe) throw new Error(`Failed to load ${model}.`);
    generator = pipe;
    generatorModel = model;
    generatorLoading = null;
    return pipe;
  })();

  try {
    return await generatorLoading;
  } catch (err) {
    generatorLoading = null;
    throw err;
  }
}

// ── Comlink surface ──────────────────────────────────────────────────────────

const api = {
  /** Warm the embeddings model (idempotent). */
  async loadEmbedder(model = DEFAULT_EMBED_MODEL): Promise<void> {
    const device: InferenceDevice = (await hasWebGPU()) ? "webgpu" : "wasm";
    await ensureEmbedder(model, device);
  },

  /**
   * Embed a batch of texts in ONE forward pass. Returns mean-pooled, L2-
   * normalised 384-dim vectors. Buffers are transferred back zero-copy.
   */
  async embedBatch(texts: string[], model = DEFAULT_EMBED_MODEL): Promise<Float32Array[]> {
    if (texts.length === 0) return [];
    const device: InferenceDevice = (await hasWebGPU()) ? "webgpu" : "wasm";
    const m = await ensureEmbedder(model, device);
    const out = await m(texts, { pooling: "mean", normalize: true });
    const dims = out.dims as number[];
    const n = dims[0];
    const d = dims[dims.length - 1];
    const flat = out.data as Float32Array;
    const vecs: Float32Array[] = [];
    for (let i = 0; i < n; i++) {
      // Copy into a fresh buffer so each vector owns a transferable ArrayBuffer.
      vecs.push(flat.slice(i * d, (i + 1) * d));
    }
    return Comlink.transfer(
      vecs,
      vecs.map((v) => v.buffer),
    );
  },

  /** Embed a single text → one vector. */
  async embed(text: string, model = DEFAULT_EMBED_MODEL): Promise<Float32Array> {
    const [vec] = await this.embedBatch([text], model);
    return Comlink.transfer(vec, [vec.buffer]);
  },

  /** Warm the generative fallback model (idempotent). */
  async loadGenerator(
    model = DEFAULT_GEN_MODEL,
    onProgress?: (info: { status: string; progress: number }) => void,
  ): Promise<void> {
    await ensureGenerator(model, onProgress);
  },

  /**
   * Browser LLM fallback. Streams tokens through the optional `onToken` proxy
   * and resolves with the full completion text.
   */
  async generate(
    input: {
      system?: string;
      prompt: string;
      maxTokens?: number;
      temperature?: number;
      model?: string;
    },
    onToken?: (token: string) => void,
  ): Promise<{ text: string }> {
    const pipe = await ensureGenerator(input.model ?? DEFAULT_GEN_MODEL);

    const messages = [
      ...(input.system ? [{ role: "system", content: input.system }] : []),
      { role: "user", content: input.prompt },
    ];

    let text = "";
    const streamer = onToken
      ? new TextStreamer(pipe.tokenizer, {
          skip_prompt: true,
          skip_special_tokens: true,
          callback_function: (token: string) => {
            text += token;
            onToken(token);
          },
        })
      : undefined;

    const result = (await pipe(messages as Parameters<typeof pipe>[0], {
      max_new_tokens: input.maxTokens ?? 256,
      do_sample: (input.temperature ?? 0) > 0,
      temperature: input.temperature ?? 0,
      return_full_text: false,
      ...(streamer ? { streamer } : {}),
    })) as Array<{ generated_text?: string | { content?: string }[] }>;

    // When streaming we already accumulated text; otherwise read the pipeline
    // output (shape varies between chat-templated and raw generation).
    if (!streamer) {
      const gen = result?.[0]?.generated_text;
      if (typeof gen === "string") text = gen;
      else if (Array.isArray(gen)) text = gen.at(-1)?.content ?? "";
    }

    return { text };
  },

  /** Best-effort memory release. */
  async dispose(): Promise<void> {
    await embedder?.dispose?.();
    await generator?.dispose?.();
    embedder = null;
    generator = null;
    embedderModel = "";
    generatorModel = "";
  },
};

export type InferenceWorkerApi = typeof api;

Comlink.expose(api);
