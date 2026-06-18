/// <reference lib="webworker" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

/**
 * Voice STT Worker
 *
 * Offline / edge speech-to-text worker powered by @huggingface/transformers.
 *
 * Features:
 * - Whisper Tiny / Base / Small model selection.
 * - Runtime selection: auto / WebGPU / WASM.
 * - WebGPU-first with WASM fallback.
 * - Browser cache support.
 * - Optional packaged local model path support.
 * - Language hint mapping.
 * - Progress events for model download/loading.
 * - Safe audio validation and transcription latency reporting.
 */

import {
  type AutomaticSpeechRecognitionPipeline,
  env,
  pipeline,
} from "@huggingface/transformers";
import {
  getDefaultPrecisionForRuntime,
  getModelDisplaySummary,
  getRuntimeOrder,
  getSttModel,
  mapLanguageHintToWhisperLanguage,
  normalizeSttEngine,
  normalizeVoiceRuntime,
  type SttEngine,
  VOICE_REGISTRY_DEFAULTS,
  type VoiceLanguageHint,
  type VoiceModelPrecision,
  type VoiceRuntime,
} from "./voice-model-registry";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ConcreteRuntime = Exclude<VoiceRuntime, "auto">;

type SttTask = "transcribe" | "translate";

type ProgressPayload = {
  status: string;
  name?: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
  model?: string;
};

type LoadedPipeline = {
  key: string;
  engine: SttEngine;
  modelId: string;
  runtime: ConcreteRuntime;
  precision?: VoiceModelPrecision;
  pipe: AutomaticSpeechRecognitionPipeline;
  loadedAt: number;
};

type VoiceSttRequest =
  | {
      type: "LOAD_MODEL";
      engine?: SttEngine | string;
      runtime?: VoiceRuntime | string;
      language?: VoiceLanguageHint | string;
      forceReload?: boolean;

      /**
       * For packaged offline apps:
       * env.allowLocalModels = true
       * env.localModelPath = localModelPath
       */
      localModelPath?: string;

      /**
       * Defaults to true. Keep true for first download + browser cache.
       * Set false only for fully packaged local models.
       */
      allowRemoteModels?: boolean;
    }
  | {
      type: "TRANSCRIBE";
      audio?: Float32Array | ArrayBuffer | number[];
      sampleRate?: number;
      language?: VoiceLanguageHint | string;
      engine?: SttEngine | string;
      runtime?: VoiceRuntime | string;
      task?: SttTask;
      returnTimestamps?: boolean;
      forceReload?: boolean;
      localModelPath?: string;
      allowRemoteModels?: boolean;
    }
  | {
      type: "UNLOAD_MODEL";
      engine?: SttEngine | string;
      runtime?: VoiceRuntime | string;
    }
  | {
      type: "GET_STATUS";
    };

type VoiceSttResponse =
  | {
      type: "STATUS";
      status: string;
      detail?: string;
      model?: string;
      engine?: SttEngine;
      runtime?: ConcreteRuntime;
      progress?: ProgressPayload;
    }
  | {
      type: "MODEL_LOADED";
      model: string;
      engine: SttEngine;
      runtime: ConcreteRuntime;
      precision?: VoiceModelPrecision;
      summary: string;
      loadedAt: number;
    }
  | {
      type: "MODEL_UNLOADED";
      engine?: SttEngine;
      runtime?: ConcreteRuntime;
      cleared: number;
    }
  | {
      type: "TRANSCRIPTION";
      text: string;
      engine: SttEngine;
      model: string;
      runtime: ConcreteRuntime;
      precision?: VoiceModelPrecision;
      sampleRate: number;
      audioDurationMs: number;
      latencyMs: number;
      language?: string;
    }
  | {
      type: "ERROR";
      error: string;
      status?: string;
      engine?: SttEngine;
      runtime?: ConcreteRuntime;
    };

const workerSelf = self as unknown as DedicatedWorkerGlobalScope;

const DEFAULT_SAMPLE_RATE = 16_000;
const MIN_AUDIO_DURATION_MS = 120;
const SILENCE_PEAK_THRESHOLD = 0.0005;
const SILENCE_RMS_THRESHOLD = 0.0001;

const loadedPipelines = new Map<string, LoadedPipeline>();
const loadingPipelines = new Map<string, Promise<LoadedPipeline>>();

let lastLoadedKey: string | null = null;

/* ------------------------------------------------------------------ */
/*  Messaging                                                          */
/* ------------------------------------------------------------------ */

function post(message: VoiceSttResponse): void {
  workerSelf.postMessage(message);
}

function postStatus({
  status,
  detail,
  model,
  engine,
  runtime,
  progress,
}: {
  status: string;
  detail?: string;
  model?: string;
  engine?: SttEngine;
  runtime?: ConcreteRuntime;
  progress?: ProgressPayload;
}): void {
  post({
    type: "STATUS",
    status,
    detail,
    model,
    engine,
    runtime,
    progress,
  });
}

function postError({
  error,
  status,
  engine,
  runtime,
}: {
  error: unknown;
  status?: string;
  engine?: SttEngine;
  runtime?: ConcreteRuntime;
}): void {
  post({
    type: "ERROR",
    error: error instanceof Error ? error.message : String(error),
    status,
    engine,
    runtime,
  });
}

function nowMs(): number {
  if (typeof performance !== "undefined") {
    return performance.now();
  }

  return Date.now();
}

/* ------------------------------------------------------------------ */
/*  Model / runtime resolution                                         */
/* ------------------------------------------------------------------ */

function resolveEngine(value: unknown): SttEngine {
  return normalizeSttEngine(value);
}

function resolveRuntime(value: unknown): VoiceRuntime {
  return normalizeVoiceRuntime(value);
}

function createPipelineKey({
  engine,
  runtime,
  precision,
  localModelPath,
}: {
  engine: SttEngine;
  runtime: ConcreteRuntime;
  precision?: VoiceModelPrecision;
  localModelPath?: string;
}): string {
  return [
    engine,
    runtime,
    precision ?? "default",
    localModelPath ? `local:${localModelPath}` : "remote-or-cache",
  ].join("|");
}

async function isWebGpuAvailable(): Promise<boolean> {
  const nav = navigator as Navigator & {
    gpu?: {
      requestAdapter(): Promise<unknown>;
    };
  };

  if (!nav.gpu) return false;

  try {
    const adapter = await nav.gpu.requestAdapter();
    return Boolean(adapter);
  } catch {
    return false;
  }
}

async function resolveRuntimeOrder(
  runtime: VoiceRuntime,
): Promise<ConcreteRuntime[]> {
  const order = getRuntimeOrder(runtime);

  if (runtime === "webgpu" && !(await isWebGpuAvailable())) {
    throw new Error(
      "WebGPU was requested but is not available in this browser.",
    );
  }

  if (runtime === "auto") {
    const webgpuAvailable = await isWebGpuAvailable();

    return order.filter((item) => {
      if (item === "webgpu") return webgpuAvailable;
      return true;
    });
  }

  return order;
}

function configureTransformersEnv({
  localModelPath,
  allowRemoteModels,
}: {
  localModelPath?: string;
  allowRemoteModels?: boolean;
}): void {
  env.useBrowserCache = true;

  const envAny = env as unknown as {
    allowLocalModels?: boolean;
    allowRemoteModels?: boolean;
    localModelPath?: string;
  };

  if (localModelPath) {
    envAny.allowLocalModels = true;
    envAny.localModelPath = localModelPath;
  } else {
    envAny.allowLocalModels = false;
  }

  /**
   * Transformers.js versions differ slightly around remote model settings.
   * Set only through the loose env object so this remains version-tolerant.
   */
  envAny.allowRemoteModels = allowRemoteModels ?? true;
}

function isDownloadProgress(progress: ProgressPayload): boolean {
  return (
    progress.status === "progress" ||
    progress.status === "progress_total" ||
    typeof progress.progress === "number"
  );
}

function createProgressHandler({
  engine,
  runtime,
  modelId,
}: {
  engine: SttEngine;
  runtime: ConcreteRuntime;
  modelId: string;
}) {
  return (progress: unknown) => {
    const payload = progress as ProgressPayload;

    postStatus({
      status: isDownloadProgress(payload)
        ? "downloading-model"
        : "loading-model",
      detail: payload.status,
      model: modelId,
      engine,
      runtime,
      progress: {
        ...payload,
        model: modelId,
      },
    });
  };
}

async function createAsrPipeline({
  engine,
  runtime,
  localModelPath,
  allowRemoteModels,
}: {
  engine: SttEngine;
  runtime: ConcreteRuntime;
  localModelPath?: string;
  allowRemoteModels?: boolean;
}): Promise<LoadedPipeline> {
  const model = getSttModel(engine);

  if (!model.modelId) {
    throw new Error(`STT model "${engine}" does not define a modelId.`);
  }

  configureTransformersEnv({
    localModelPath,
    allowRemoteModels,
  });

  const precision = getDefaultPrecisionForRuntime(model, runtime);
  const key = createPipelineKey({
    engine,
    runtime,
    precision,
    localModelPath,
  });

  const cached = loadedPipelines.get(key);

  if (cached) {
    lastLoadedKey = key;
    return cached;
  }

  const existingLoad = loadingPipelines.get(key);

  if (existingLoad) {
    return existingLoad;
  }

  const loadPromise = (async () => {
    postStatus({
      status: "loading-model",
      detail: `Loading ${model.label} with ${runtime.toUpperCase()}.`,
      model: model.modelId,
      engine,
      runtime,
    });

    const pipe = await pipeline("automatic-speech-recognition", model.modelId, {
      device: runtime,
      ...(precision ? { dtype: precision } : {}),
      progress_callback: createProgressHandler({
        engine,
        runtime,
        modelId: model.modelId ?? "unknown-model",
      }),
    });

    const loaded: LoadedPipeline = {
      key,
      engine,
      modelId: model.modelId ?? "unknown-model",
      runtime,
      precision,
      pipe: pipe,
      loadedAt: Date.now(),
    };

    loadedPipelines.set(key, loaded);
    lastLoadedKey = key;

    post({
      type: "MODEL_LOADED",
      model: loaded.modelId,
      engine,
      runtime,
      precision,
      summary: getModelDisplaySummary(model),
      loadedAt: loaded.loadedAt,
    });

    return loaded;
  })();

  loadingPipelines.set(key, loadPromise);

  try {
    return await loadPromise;
  } finally {
    loadingPipelines.delete(key);
  }
}

async function loadPipelineWithFallback({
  engine,
  runtime,
  localModelPath,
  allowRemoteModels,
  forceReload,
}: {
  engine: SttEngine;
  runtime: VoiceRuntime;
  localModelPath?: string;
  allowRemoteModels?: boolean;
  forceReload?: boolean;
}): Promise<LoadedPipeline> {
  const concreteRuntimes = await resolveRuntimeOrder(runtime);

  if (forceReload) {
    unloadMatchingPipelines({
      engine,
    });
  }

  let lastError: unknown = null;

  for (const concreteRuntime of concreteRuntimes) {
    try {
      return await createAsrPipeline({
        engine,
        runtime: concreteRuntime,
        localModelPath,
        allowRemoteModels,
      });
    } catch (error) {
      lastError = error;

      if (concreteRuntime === "webgpu") {
        postStatus({
          status: "fallback-wasm",
          detail: "WebGPU failed. Retrying with WASM.",
          engine,
          runtime: concreteRuntime,
        });
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Could not load STT model.");
}

function unloadMatchingPipelines({
  engine,
  runtime,
}: {
  engine?: SttEngine;
  runtime?: ConcreteRuntime;
}): number {
  let cleared = 0;

  for (const [key, loaded] of loadedPipelines.entries()) {
    if (engine && loaded.engine !== engine) continue;
    if (runtime && loaded.runtime !== runtime) continue;

    loadedPipelines.delete(key);
    cleared++;
  }

  if (lastLoadedKey && !loadedPipelines.has(lastLoadedKey)) {
    lastLoadedKey = null;
  }

  return cleared;
}

/* ------------------------------------------------------------------ */
/*  Audio normalization / validation                                   */
/* ------------------------------------------------------------------ */

function normalizeSampleRate(sampleRate?: number): number {
  if (!sampleRate || !Number.isFinite(sampleRate) || sampleRate <= 0) {
    return DEFAULT_SAMPLE_RATE;
  }

  return Math.round(sampleRate);
}

function looksLikeFloat32Pcm(samples: Float32Array): boolean {
  const probeCount = Math.min(samples.length, 512);

  if (probeCount === 0) return true;

  let valid = 0;

  for (let i = 0; i < probeCount; i++) {
    const value = samples[i];

    if (Number.isFinite(value) && Math.abs(value) <= 1.5) {
      valid++;
    }
  }

  return valid / probeCount > 0.9;
}

function normalizeAudioInput(
  audio: Float32Array | ArrayBuffer | number[] | undefined,
): Float32Array {
  if (!audio) {
    throw new Error("No audio data provided.");
  }

  let samples: Float32Array;

  if (audio instanceof Float32Array) {
    samples = audio;
  } else if (audio instanceof ArrayBuffer) {
    if (audio.byteLength === 0) {
      throw new Error("Audio buffer is empty.");
    }

    if (audio.byteLength % 4 === 0) {
      const floatCandidate = new Float32Array(audio);

      if (looksLikeFloat32Pcm(floatCandidate)) {
        samples = floatCandidate;
      } else if (audio.byteLength % 2 === 0) {
        const int16 = new Int16Array(audio);
        samples = new Float32Array(int16.length);

        for (let i = 0; i < int16.length; i++) {
          samples[i] = int16[i] / 32768;
        }
      } else {
        throw new Error("Unsupported audio buffer format.");
      }
    } else if (audio.byteLength % 2 === 0) {
      const int16 = new Int16Array(audio);
      samples = new Float32Array(int16.length);

      for (let i = 0; i < int16.length; i++) {
        samples[i] = int16[i] / 32768;
      }
    } else {
      throw new Error("Unsupported audio buffer format.");
    }
  } else if (Array.isArray(audio)) {
    samples = Float32Array.from(audio);
  } else {
    throw new Error("Unsupported audio payload.");
  }

  const cleaned = new Float32Array(samples.length);

  for (let i = 0; i < samples.length; i++) {
    const value = Number.isFinite(samples[i]) ? samples[i] : 0;
    cleaned[i] = Math.max(-1, Math.min(1, value));
  }

  return cleaned;
}

function analyzeAudio(samples: Float32Array): {
  rms: number;
  peak: number;
  durationMs: number;
} {
  if (samples.length === 0) {
    return {
      rms: 0,
      peak: 0,
      durationMs: 0,
    };
  }

  let sumSquares = 0;
  let peak = 0;

  for (let i = 0; i < samples.length; i++) {
    const sample = Number.isFinite(samples[i]) ? samples[i] : 0;
    const abs = Math.abs(sample);

    peak = Math.max(peak, abs);
    sumSquares += sample * sample;
  }

  return {
    rms: Math.sqrt(sumSquares / samples.length),
    peak,
    durationMs: 0,
  };
}

function assertAudioUsable(samples: Float32Array, sampleRate: number): void {
  if (samples.length === 0) {
    throw new Error("Empty audio buffer.");
  }

  const durationMs = (samples.length / sampleRate) * 1000;

  if (durationMs < MIN_AUDIO_DURATION_MS) {
    throw new Error("Audio buffer is too short.");
  }

  const { rms, peak } = analyzeAudio(samples);

  if (peak < SILENCE_PEAK_THRESHOLD || rms < SILENCE_RMS_THRESHOLD) {
    throw new Error("Audio buffer appears silent.");
  }
}

/* ------------------------------------------------------------------ */
/*  Transcription                                                      */
/* ------------------------------------------------------------------ */

function isWhisperModel(modelId: string): boolean {
  return modelId.toLowerCase().includes("whisper");
}

function extractTranscriptText(result: unknown): string {
  if (typeof result === "string") {
    return result.trim();
  }

  if (Array.isArray(result)) {
    return result
      .map((item) => extractTranscriptText(item))
      .filter(Boolean)
      .join(" ")
      .trim();
  }

  if (result && typeof result === "object") {
    const record = result as Record<string, unknown>;

    if (typeof record.text === "string") {
      return record.text.trim();
    }

    if (Array.isArray(record.chunks)) {
      return record.chunks
        .map((chunk) => {
          if (chunk && typeof chunk === "object" && "text" in chunk) {
            return String((chunk as { text?: unknown }).text ?? "");
          }

          return "";
        })
        .filter(Boolean)
        .join(" ")
        .trim();
    }
  }

  return "";
}

async function transcribe({
  loaded,
  audio,
  sampleRate,
  language,
  task,
  returnTimestamps,
}: {
  loaded: LoadedPipeline;
  audio: Float32Array;
  sampleRate: number;
  language?: VoiceLanguageHint | string;
  task?: SttTask;
  returnTimestamps?: boolean;
}): Promise<{
  text: string;
  audioDurationMs: number;
  latencyMs: number;
  whisperLanguage?: string;
}> {
  assertAudioUsable(audio, sampleRate);

  const audioDurationMs = (audio.length / sampleRate) * 1000;
  const start = nowMs();

  const whisperLanguage = mapLanguageHintToWhisperLanguage(language);

  postStatus({
    status: "transcribing",
    detail: `Transcribing ${(audioDurationMs / 1000).toFixed(1)}s of audio.`,
    model: loaded.modelId,
    engine: loaded.engine,
    runtime: loaded.runtime,
  });

  const options: Record<string, unknown> = {
    sampling_rate: sampleRate,
    return_timestamps: returnTimestamps ?? false,
  };

  if (isWhisperModel(loaded.modelId)) {
    if (whisperLanguage) {
      options.language = whisperLanguage;
    }

    options.task = task ?? "transcribe";
  }

  const result = await loaded.pipe(audio, options);

  const latencyMs = Math.round(nowMs() - start);
  const text = extractTranscriptText(result);

  return {
    text,
    audioDurationMs,
    latencyMs,
    whisperLanguage,
  };
}

/* ------------------------------------------------------------------ */
/*  Request handlers                                                   */
/* ------------------------------------------------------------------ */

async function handleLoadModel(
  request: Extract<VoiceSttRequest, { type: "LOAD_MODEL" }>,
): Promise<void> {
  const engine = resolveEngine(request.engine);
  const runtime = resolveRuntime(request.runtime);

  const loaded = await loadPipelineWithFallback({
    engine,
    runtime,
    localModelPath: request.localModelPath,
    allowRemoteModels: request.allowRemoteModels,
    forceReload: request.forceReload,
  });

  postStatus({
    status: "ready",
    detail: `${loaded.modelId} is ready.`,
    model: loaded.modelId,
    engine: loaded.engine,
    runtime: loaded.runtime,
  });
}

async function handleTranscribe(
  request: Extract<VoiceSttRequest, { type: "TRANSCRIBE" }>,
): Promise<void> {
  const engine = resolveEngine(request.engine);
  const runtime = resolveRuntime(request.runtime);
  const sampleRate = normalizeSampleRate(request.sampleRate);
  const audio = normalizeAudioInput(request.audio);

  postStatus({
    status: "processing",
    detail: "Preparing captured audio.",
    engine,
  });

  const loaded = await loadPipelineWithFallback({
    engine,
    runtime,
    localModelPath: request.localModelPath,
    allowRemoteModels: request.allowRemoteModels,
    forceReload: request.forceReload,
  });

  const result = await transcribe({
    loaded,
    audio,
    sampleRate,
    language: request.language,
    task: request.task,
    returnTimestamps: request.returnTimestamps,
  });

  post({
    type: "TRANSCRIPTION",
    text: result.text,
    engine: loaded.engine,
    model: loaded.modelId,
    runtime: loaded.runtime,
    precision: loaded.precision,
    sampleRate,
    audioDurationMs: Math.round(result.audioDurationMs),
    latencyMs: result.latencyMs,
    language: result.whisperLanguage,
  });
}

function handleUnloadModel(
  request: Extract<VoiceSttRequest, { type: "UNLOAD_MODEL" }>,
): void {
  const engine = request.engine ? resolveEngine(request.engine) : undefined;
  const runtime = request.runtime
    ? resolveRuntime(request.runtime) === "auto"
      ? undefined
      : (resolveRuntime(request.runtime) as ConcreteRuntime)
    : undefined;

  const cleared = unloadMatchingPipelines({
    engine,
    runtime,
  });

  post({
    type: "MODEL_UNLOADED",
    engine,
    runtime,
    cleared,
  });
}

function handleGetStatus(): void {
  if (lastLoadedKey) {
    const loaded = loadedPipelines.get(lastLoadedKey);

    if (loaded) {
      postStatus({
        status: "ready",
        detail: `${loaded.modelId} is ready.`,
        model: loaded.modelId,
        engine: loaded.engine,
        runtime: loaded.runtime,
      });
      return;
    }
  }

  postStatus({
    status: "idle",
    detail: "No STT model is loaded yet.",
  });
}

/* ------------------------------------------------------------------ */
/*  Message handler                                                    */
/* ------------------------------------------------------------------ */

workerSelf.addEventListener(
  "message",
  async (event: MessageEvent<VoiceSttRequest>) => {
    const request = event.data;

    try {
      if (!request || typeof request.type !== "string") {
        throw new Error("Invalid STT worker request.");
      }

      switch (request.type) {
        case "LOAD_MODEL": {
          await handleLoadModel(request);
          return;
        }

        case "TRANSCRIBE": {
          await handleTranscribe(request);
          return;
        }

        case "UNLOAD_MODEL": {
          handleUnloadModel(request);
          return;
        }

        case "GET_STATUS": {
          handleGetStatus();
          return;
        }

        default: {
          const unknownRequest = request as { type?: string };
          throw new Error(
            `Unknown STT request type: ${unknownRequest.type ?? "unknown"}`,
          );
        }
      }
    } catch (error) {
      const engine =
        "engine" in request ? resolveEngine(request.engine) : undefined;

      const runtimeValue =
        "runtime" in request ? resolveRuntime(request.runtime) : undefined;

      postError({
        error,
        status: "failed",
        engine,
        runtime:
          runtimeValue && runtimeValue !== "auto"
            ? (runtimeValue as ConcreteRuntime)
            : undefined,
      });
    }
  },
);

postStatus({
  status: "idle",
  detail: "STT worker initialized.",
  engine: VOICE_REGISTRY_DEFAULTS.sttEngine,
});
