/// <reference lib="webworker" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

/**
 * Voice TTS Worker
 *
 * Local / edge text-to-speech worker.
 *
 * Primary engine:
 * - kokoro-js using onnx-community/Kokoro-82M-ONNX
 *
 * Secondary engine slot:
 * - Piper local assets / adapter-ready path
 *
 * Features:
 * - Kokoro model loading with dtype/runtime selection.
 * - Sentence chunking for long assistant responses.
 * - Speak summary / full text modes.
 * - WAV encoding for easy browser playback.
 * - Raw PCM output for advanced audio pipelines.
 * - Playback-friendly metadata.
 * - Cancellation via STOP / job id.
 * - Progress/status events.
 */

import {
  chunkText,
  type KokoroTtsInstance,
  loadKokoroModel,
  normalizeText,
  splitIntoSentences,
} from "@/platform/ai/kokoro-tts";
import {
  getDefaultPrecisionForRuntime,
  getRuntimeOrder,
  getTtsModel,
  KOKORO_VOICES,
  normalizeTtsEngine,
  normalizeVoiceRuntime,
  type SpeakMode,
  type TtsEngine,
  VOICE_REGISTRY_DEFAULTS,
  type VoiceModelPrecision,
  type VoiceRuntime,
} from "./voice-model-registry";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ConcreteRuntime = Exclude<VoiceRuntime, "auto">;

type TtsJobStatus =
  | "idle"
  | "loading-model"
  | "ready"
  | "synthesizing"
  | "encoding"
  | "cancelled"
  | "failed";

type TtsOutputFormat = "pcm" | "wav" | "both";

type LoadedTtsModel = {
  key: string;
  engine: TtsEngine;
  modelId: string;
  runtime: ConcreteRuntime;
  precision?: VoiceModelPrecision;
  instance: KokoroTtsInstance | null;
  loadedAt: number;
};

type TtsAudioSegment = {
  text: string;
  audio: Float32Array;
  sampleRate: number;
  durationMs: number;
};

type TtsSynthesisResult = {
  text: string;
  audio: Float32Array;
  sampleRate: number;
  durationMs: number;
  segments: TtsAudioSegment[];
};

type VoiceTtsRequest =
  | {
      type: "LOAD_MODEL";
      engine?: TtsEngine | string;
      runtime?: VoiceRuntime | string;
      voice?: string;
      forceReload?: boolean;
      localModelPath?: string;
      dtype?: VoiceModelPrecision;
    }
  | {
      type: "SPEAK";
      text: string;
      engine?: TtsEngine | string;
      runtime?: VoiceRuntime | string;
      voice?: string;
      speed?: number;
      speakMode?: SpeakMode;
      outputFormat?: TtsOutputFormat;
      jobId?: string;
      forceReload?: boolean;
      localModelPath?: string;
      dtype?: VoiceModelPrecision;

      /**
       * For long answers, synthesize sentence chunks and concatenate audio.
       */
      chunkSentences?: boolean;

      /**
       * Used when speakMode = "summary".
       */
      summaryMaxChars?: number;
    }
  | {
      type: "STOP";
      jobId?: string;
    }
  | {
      type: "UNLOAD_MODEL";
      engine?: TtsEngine | string;
      runtime?: VoiceRuntime | string;
    }
  | {
      type: "GET_STATUS";
    }
  | {
      type: "LIST_VOICES";
      engine?: TtsEngine | string;
    };

type VoiceTtsResponse =
  | {
      type: "STATUS";
      status: TtsJobStatus;
      detail?: string;
      jobId?: string;
      engine?: TtsEngine;
      runtime?: ConcreteRuntime;
      model?: string;
      progress?: number;
    }
  | {
      type: "MODEL_LOADED";
      engine: TtsEngine;
      model: string;
      runtime: ConcreteRuntime;
      precision?: VoiceModelPrecision;
      loadedAt: number;
    }
  | {
      type: "MODEL_UNLOADED";
      engine?: TtsEngine;
      runtime?: ConcreteRuntime;
      cleared: number;
    }
  | {
      type: "VOICES";
      engine: TtsEngine;
      voices: Array<{
        id: string;
        label: string;
        language?: string;
        style?: string;
        recommended?: boolean;
      }>;
    }
  | {
      type: "SPEECH_SKIPPED";
      reason: string;
      jobId?: string;
    }
  | {
      type: "SPEECH_AUDIO";
      jobId: string;
      engine: TtsEngine;
      model: string;
      runtime: ConcreteRuntime;
      voice: string;
      text: string;
      sampleRate: number;
      durationMs: number;
      latencyMs: number;
      audio?: Float32Array;
      wav?: Uint8Array;
      segments: Array<{
        text: string;
        durationMs: number;
      }>;
    }
  | {
      type: "STOPPED";
      jobId?: string;
    }
  | {
      type: "ERROR";
      error: string;
      status?: TtsJobStatus;
      jobId?: string;
      engine?: TtsEngine;
      runtime?: ConcreteRuntime;
    };

const workerSelf = self as unknown as DedicatedWorkerGlobalScope;

const DEFAULT_SAMPLE_RATE = 24_000;
const DEFAULT_SUMMARY_MAX_CHARS = 420;
const DEFAULT_SENTENCE_GAP_MS = 80;

const loadedModels = new Map<string, LoadedTtsModel>();
const loadingModels = new Map<string, Promise<LoadedTtsModel>>();

let activeJobId: string | null = null;
const cancelledJobIds = new Set<string>();
let lastLoadedKey: string | null = null;

/* ------------------------------------------------------------------ */
/*  Messaging                                                          */
/* ------------------------------------------------------------------ */

function post(message: VoiceTtsResponse, transfer?: Transferable[]): void {
  workerSelf.postMessage(message, transfer ?? []);
}

function postStatus({
  status,
  detail,
  jobId,
  engine,
  runtime,
  model,
  progress,
}: {
  status: TtsJobStatus;
  detail?: string;
  jobId?: string;
  engine?: TtsEngine;
  runtime?: ConcreteRuntime;
  model?: string;
  progress?: number;
}): void {
  post({
    type: "STATUS",
    status,
    detail,
    jobId,
    engine,
    runtime,
    model,
    progress,
  });
}

function postError({
  error,
  status,
  jobId,
  engine,
  runtime,
}: {
  error: unknown;
  status?: TtsJobStatus;
  jobId?: string;
  engine?: TtsEngine;
  runtime?: ConcreteRuntime;
}): void {
  post({
    type: "ERROR",
    error: error instanceof Error ? error.message : String(error),
    status,
    jobId,
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

function createJobId(): string {
  return `tts_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

/* ------------------------------------------------------------------ */
/*  Resolution                                                         */
/* ------------------------------------------------------------------ */

function resolveEngine(value: unknown): TtsEngine {
  return normalizeTtsEngine(value);
}

function resolveRuntime(value: unknown): VoiceRuntime {
  return normalizeVoiceRuntime(value);
}

function resolveVoice(value: unknown): string {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return VOICE_REGISTRY_DEFAULTS.ttsVoice;
}

function resolveSpeed(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return VOICE_REGISTRY_DEFAULTS.ttsSpeed;
  }

  return Math.min(2, Math.max(0.5, value));
}

function resolveSpeakMode(value: unknown): SpeakMode {
  if (value === "off" || value === "summary" || value === "full") {
    return value;
  }

  return VOICE_REGISTRY_DEFAULTS.speakMode;
}

function resolveOutputFormat(value: unknown): TtsOutputFormat {
  if (value === "pcm" || value === "wav" || value === "both") {
    return value;
  }

  return "both";
}

function createModelKey({
  engine,
  runtime,
  precision,
  localModelPath,
}: {
  engine: TtsEngine;
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

/* ------------------------------------------------------------------ */
/*  Cancellation                                                       */
/* ------------------------------------------------------------------ */

function cancelJob(jobId: string | null | undefined): void {
  if (!jobId) {
    if (activeJobId) {
      cancelledJobIds.add(activeJobId);
    }

    return;
  }

  cancelledJobIds.add(jobId);
}

function assertNotCancelled(jobId: string): void {
  if (cancelledJobIds.has(jobId)) {
    throw new Error("TTS job was cancelled.");
  }
}

/* ------------------------------------------------------------------ */
/*  Loading                                                            */
/* ------------------------------------------------------------------ */

async function loadTtsModelWithFallback({
  engine,
  runtime,
  forceReload,
  localModelPath,
  dtype,
}: {
  engine: TtsEngine;
  runtime: VoiceRuntime;
  forceReload?: boolean;
  localModelPath?: string;
  dtype?: VoiceModelPrecision;
}): Promise<LoadedTtsModel> {
  if (engine === "off") {
    return {
      key: "tts:off",
      engine,
      modelId: "text-only",
      runtime: "wasm",
      instance: null,
      loadedAt: Date.now(),
    };
  }

  const runtimes = await resolveRuntimeOrder(runtime);
  let lastError: unknown = null;

  if (forceReload) {
    unloadMatchingModels({
      engine,
    });
  }

  for (const concreteRuntime of runtimes) {
    try {
      return await loadTtsModel({
        engine,
        runtime: concreteRuntime,
        localModelPath,
        dtype,
      });
    } catch (error) {
      lastError = error;

      if (concreteRuntime === "webgpu") {
        postStatus({
          status: "loading-model",
          detail: "WebGPU TTS failed. Retrying with WASM.",
          engine,
          runtime: concreteRuntime,
        });
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Could not load TTS model.");
}

async function loadTtsModel({
  engine,
  runtime,
  localModelPath,
  dtype,
}: {
  engine: TtsEngine;
  runtime: ConcreteRuntime;
  localModelPath?: string;
  dtype?: VoiceModelPrecision;
}): Promise<LoadedTtsModel> {
  /**
   * Graceful degradation: any engine without a real browser adapter (today only
   * Kokoro is implemented) falls back to Kokoro instead of throwing and killing
   * the speak pipeline. Piper is registered but has no adapter yet.
   */
  let effectiveEngine = engine;

  if (engine === "piper") {
    console.warn(
      "[voice-tts] Piper has no browser adapter yet; falling back to Kokoro.",
    );
    postStatus({
      status: "loading-model",
      detail: "Piper voice unavailable. Using Kokoro instead.",
      engine,
      runtime,
    });
    effectiveEngine = "kokoro";
  } else if (engine !== "kokoro") {
    console.warn(
      `[voice-tts] Unsupported TTS engine "${engine}"; falling back to Kokoro.`,
    );
    postStatus({
      status: "loading-model",
      detail: `Voice engine "${engine}" unavailable. Using Kokoro instead.`,
      engine,
      runtime,
    });
    effectiveEngine = "kokoro";
  }

  const model = getTtsModel(effectiveEngine);

  if (!model.modelId) {
    throw new Error(`TTS model "${effectiveEngine}" does not define a modelId.`);
  }

  const precision =
    dtype ?? getDefaultPrecisionForRuntime(model, runtime) ?? "q8";

  const key = createModelKey({
    engine: effectiveEngine,
    runtime,
    precision,
    localModelPath,
  });

  const cached = loadedModels.get(key);

  if (cached) {
    lastLoadedKey = key;
    return cached;
  }

  const existingLoad = loadingModels.get(key);

  if (existingLoad) {
    return existingLoad;
  }

  const loadPromise = (async () => {
    postStatus({
      status: "loading-model",
      detail: `Loading ${model.label} with ${runtime.toUpperCase()}.`,
      engine: effectiveEngine,
      runtime,
      model: model.modelId,
      progress: 5,
    });

    postStatus({
      status: "loading-model",
      detail: "Initializing Kokoro TTS.",
      engine: effectiveEngine,
      runtime,
      model: model.modelId,
      progress: 35,
    });

    const instance = await loadKokoroModel({
      modelId: model.modelId,
      dtype: precision,
      device: runtime,
      localModelPath,
    });

    const loaded: LoadedTtsModel = {
      key,
      engine: effectiveEngine,
      modelId: model.modelId,
      runtime,
      precision,
      instance,
      loadedAt: Date.now(),
    };

    loadedModels.set(key, loaded);
    lastLoadedKey = key;

    post({
      type: "MODEL_LOADED",
      engine: effectiveEngine,
      model: loaded.modelId,
      runtime,
      precision,
      loadedAt: loaded.loadedAt,
    });

    return loaded;
  })();

  loadingModels.set(key, loadPromise);

  try {
    return await loadPromise;
  } finally {
    loadingModels.delete(key);
  }
}

function unloadMatchingModels({
  engine,
  runtime,
}: {
  engine?: TtsEngine;
  runtime?: ConcreteRuntime;
}): number {
  let cleared = 0;

  for (const [key, loaded] of loadedModels.entries()) {
    if (engine && loaded.engine !== engine) continue;
    if (runtime && loaded.runtime !== runtime) continue;

    loadedModels.delete(key);
    cleared++;
  }

  if (lastLoadedKey && !loadedModels.has(lastLoadedKey)) {
    lastLoadedKey = null;
  }

  return cleared;
}

/* ------------------------------------------------------------------ */
/*  Text preparation                                                   */
/* ------------------------------------------------------------------ */

function summarizeForSpeech(text: string, maxChars: number): string {
  const normalized = normalizeText(text);

  if (normalized.length <= maxChars) {
    return normalized;
  }

  const sentences = splitIntoSentences(normalized);
  let result = "";

  for (const sentence of sentences) {
    if ((`${result} ${sentence}`).trim().length > maxChars) break;
    result = `${result} ${sentence}`.trim();
  }

  if (result) return result;

  return `${normalized.slice(0, Math.max(80, maxChars - 1)).trim()}…`;
}

function prepareSpeechText({
  text,
  speakMode,
  summaryMaxChars,
}: {
  text: string;
  speakMode: SpeakMode;
  summaryMaxChars?: number;
}): string {
  const normalized = normalizeText(text);

  if (!normalized) return "";

  if (speakMode === "off") return "";

  if (speakMode === "summary") {
    return summarizeForSpeech(
      normalized,
      summaryMaxChars ?? DEFAULT_SUMMARY_MAX_CHARS,
    );
  }

  return normalized;
}

/* ------------------------------------------------------------------ */
/*  Audio extraction / processing                                      */
/* ------------------------------------------------------------------ */

function toFloat32Array(value: unknown): Float32Array | null {
  if (value instanceof Float32Array) {
    return value;
  }

  if (value instanceof ArrayBuffer) {
    return new Float32Array(value);
  }

  if (Array.isArray(value)) {
    return Float32Array.from(value.map((item) => Number(item) || 0));
  }

  return null;
}

function extractGeneratedAudio(result: unknown): {
  audio: Float32Array;
  sampleRate: number;
} {
  const direct = toFloat32Array(result);

  if (direct) {
    return {
      audio: direct,
      sampleRate: DEFAULT_SAMPLE_RATE,
    };
  }

  if (!result || typeof result !== "object") {
    throw new Error("TTS engine returned an unsupported audio result.");
  }

  const record = result as Record<string, unknown>;

  const audio =
    toFloat32Array(record.audio) ??
    toFloat32Array(record.data) ??
    toFloat32Array(record.samples) ??
    toFloat32Array(record.array);

  if (!audio) {
    throw new Error("TTS result did not contain Float32 audio samples.");
  }

  const sampleRate =
    typeof record.sampling_rate === "number"
      ? record.sampling_rate
      : typeof record.sampleRate === "number"
        ? record.sampleRate
        : typeof record.sr === "number"
          ? record.sr
          : DEFAULT_SAMPLE_RATE;

  return {
    audio: sanitizeAudio(audio),
    sampleRate,
  };
}

function sanitizeAudio(samples: Float32Array): Float32Array {
  const result = new Float32Array(samples.length);

  for (let i = 0; i < samples.length; i++) {
    const value = Number.isFinite(samples[i]) ? samples[i] : 0;
    result[i] = Math.max(-1, Math.min(1, value));
  }

  return result;
}

function createSilence(sampleRate: number, durationMs: number): Float32Array {
  const length = Math.max(0, Math.round((sampleRate * durationMs) / 1000));
  return new Float32Array(length);
}

function concatAudio(chunks: Float32Array[]): Float32Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Float32Array(totalLength);

  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

function getDurationMs(samples: Float32Array, sampleRate: number): number {
  return Math.round((samples.length / sampleRate) * 1000);
}

async function synthesizeWithKokoro({
  loaded,
  text,
  voice,
  speed,
  jobId,
  chunkSentences,
}: {
  loaded: LoadedTtsModel;
  text: string;
  voice: string;
  speed: number;
  jobId: string;
  chunkSentences: boolean;
}): Promise<TtsSynthesisResult> {
  if (!loaded.instance) {
    throw new Error("Kokoro TTS instance is not loaded.");
  }

  const chunks = chunkSentences ? chunkText(text) : [text];
  const audioChunks: Float32Array[] = [];
  const segments: TtsAudioSegment[] = [];

  let outputSampleRate = DEFAULT_SAMPLE_RATE;

  for (let index = 0; index < chunks.length; index++) {
    assertNotCancelled(jobId);

    const chunk = chunks[index];

    postStatus({
      status: "synthesizing",
      detail: `Synthesizing speech chunk ${index + 1}/${chunks.length}.`,
      jobId,
      engine: loaded.engine,
      runtime: loaded.runtime,
      model: loaded.modelId,
      progress: Math.round((index / Math.max(1, chunks.length)) * 85),
    });

    const result = await loaded.instance.generate(chunk, {
      voice,
      speed,
    });

    // The synth of this chunk may have run while a STOP arrived. Drop the
    // result instead of accumulating audio the user already cancelled.
    assertNotCancelled(jobId);

    const generated = extractGeneratedAudio(result);
    outputSampleRate = generated.sampleRate;

    const audio = generated.audio;
    const durationMs = getDurationMs(audio, generated.sampleRate);

    audioChunks.push(audio);
    segments.push({
      text: chunk,
      audio,
      sampleRate: generated.sampleRate,
      durationMs,
    });

    if (index < chunks.length - 1) {
      audioChunks.push(
        createSilence(generated.sampleRate, DEFAULT_SENTENCE_GAP_MS),
      );
    }
  }

  const audio = concatAudio(audioChunks);

  return {
    text,
    audio,
    sampleRate: outputSampleRate,
    durationMs: getDurationMs(audio, outputSampleRate),
    segments,
  };
}

/* ------------------------------------------------------------------ */
/*  WAV encoding                                                       */
/* ------------------------------------------------------------------ */

function writeString(view: DataView, offset: number, value: string): void {
  for (let i = 0; i < value.length; i++) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}

function floatTo16BitPcm(sample: number): number {
  const clamped = Math.max(-1, Math.min(1, sample));
  return clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
}

function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;

  for (let i = 0; i < samples.length; i++, offset += 2) {
    view.setInt16(offset, floatTo16BitPcm(samples[i]), true);
  }

  return new Uint8Array(buffer);
}

/* ------------------------------------------------------------------ */
/*  Request handlers                                                   */
/* ------------------------------------------------------------------ */

async function handleLoadModel(
  request: Extract<VoiceTtsRequest, { type: "LOAD_MODEL" }>,
): Promise<void> {
  const engine = resolveEngine(request.engine);
  const runtime = resolveRuntime(request.runtime);

  const loaded = await loadTtsModelWithFallback({
    engine,
    runtime,
    forceReload: request.forceReload,
    localModelPath: request.localModelPath,
    dtype: request.dtype,
  });

  postStatus({
    status: "ready",
    detail: `${loaded.modelId} is ready.`,
    engine,
    runtime: loaded.runtime,
    model: loaded.modelId,
    progress: 100,
  });
}

async function handleSpeak(
  request: Extract<VoiceTtsRequest, { type: "SPEAK" }>,
): Promise<void> {
  const jobId = request.jobId || createJobId();
  activeJobId = jobId;
  cancelledJobIds.delete(jobId);

  const engine = resolveEngine(request.engine);
  const runtime = resolveRuntime(request.runtime);
  const voice = resolveVoice(request.voice);
  const speed = resolveSpeed(request.speed);
  const speakMode = resolveSpeakMode(request.speakMode);
  const outputFormat = resolveOutputFormat(request.outputFormat);
  const text = prepareSpeechText({
    text: request.text,
    speakMode,
    summaryMaxChars: request.summaryMaxChars,
  });

  if (!text) {
    post({
      type: "SPEECH_SKIPPED",
      reason:
        speakMode === "off"
          ? "TTS speak mode is off."
          : "No text was provided for speech synthesis.",
      jobId,
    });
    return;
  }

  if (engine === "off") {
    post({
      type: "SPEECH_SKIPPED",
      reason: "TTS engine is set to text-only mode.",
      jobId,
    });
    return;
  }

  const start = nowMs();

  try {
    postStatus({
      status: "synthesizing",
      detail: "Preparing local speech synthesis.",
      jobId,
      engine,
      progress: 0,
    });

    const loaded = await loadTtsModelWithFallback({
      engine,
      runtime,
      forceReload: request.forceReload,
      localModelPath: request.localModelPath,
      dtype: request.dtype,
    });

    assertNotCancelled(jobId);

    const synthesis = await synthesizeWithKokoro({
      loaded,
      text,
      voice,
      speed,
      jobId,
      chunkSentences: request.chunkSentences ?? true,
    });

    assertNotCancelled(jobId);

    postStatus({
      status: "encoding",
      detail: "Encoding speech audio.",
      jobId,
      engine,
      runtime: loaded.runtime,
      model: loaded.modelId,
      progress: 92,
    });

    const includePcm = outputFormat === "pcm" || outputFormat === "both";
    const includeWav = outputFormat === "wav" || outputFormat === "both";

    const wav = includeWav
      ? encodeWav(synthesis.audio, synthesis.sampleRate)
      : undefined;

    // Final guard: do not deliver audio for a job the user already stopped.
    assertNotCancelled(jobId);

    const latencyMs = Math.round(nowMs() - start);

    const response: Extract<VoiceTtsResponse, { type: "SPEECH_AUDIO" }> = {
      type: "SPEECH_AUDIO",
      jobId,
      engine,
      model: loaded.modelId,
      runtime: loaded.runtime,
      voice,
      text,
      sampleRate: synthesis.sampleRate,
      durationMs: synthesis.durationMs,
      latencyMs,
      audio: includePcm ? synthesis.audio : undefined,
      wav,
      segments: synthesis.segments.map((segment) => ({
        text: segment.text,
        durationMs: segment.durationMs,
      })),
    };

    const transfer: Transferable[] = [];

    if (response.audio) {
      transfer.push(response.audio.buffer);
    }

    if (response.wav) {
      transfer.push(response.wav.buffer);
    }

    post(response, transfer);

    postStatus({
      status: "ready",
      detail: "Speech audio generated.",
      jobId,
      engine,
      runtime: loaded.runtime,
      model: loaded.modelId,
      progress: 100,
    });
  } catch (error) {
    if (cancelledJobIds.has(jobId)) {
      post({
        type: "STOPPED",
        jobId,
      });

      postStatus({
        status: "cancelled",
        detail: "Speech synthesis cancelled.",
        jobId,
        engine,
      });

      return;
    }

    postError({
      error,
      status: "failed",
      jobId,
      engine,
    });
  } finally {
    if (activeJobId === jobId) {
      activeJobId = null;
    }

    cancelledJobIds.delete(jobId);
  }
}

function handleStop(request: Extract<VoiceTtsRequest, { type: "STOP" }>): void {
  cancelJob(request.jobId ?? activeJobId);

  post({
    type: "STOPPED",
    jobId: request.jobId ?? activeJobId ?? undefined,
  });
}

function handleUnloadModel(
  request: Extract<VoiceTtsRequest, { type: "UNLOAD_MODEL" }>,
): void {
  const engine = request.engine ? resolveEngine(request.engine) : undefined;
  const runtimeValue = request.runtime
    ? resolveRuntime(request.runtime)
    : undefined;

  const runtime =
    runtimeValue && runtimeValue !== "auto"
      ? (runtimeValue as ConcreteRuntime)
      : undefined;

  const cleared = unloadMatchingModels({
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
  if (activeJobId) {
    postStatus({
      status: "synthesizing",
      detail: "A speech synthesis job is running.",
      jobId: activeJobId,
    });
    return;
  }

  if (lastLoadedKey) {
    const loaded = loadedModels.get(lastLoadedKey);

    if (loaded) {
      postStatus({
        status: "ready",
        detail: `${loaded.modelId} is ready.`,
        engine: loaded.engine,
        runtime: loaded.runtime,
        model: loaded.modelId,
        progress: 100,
      });
      return;
    }
  }

  postStatus({
    status: "idle",
    detail: "No TTS model is loaded yet.",
  });
}

function handleListVoices(
  request: Extract<VoiceTtsRequest, { type: "LIST_VOICES" }>,
): void {
  const engine = resolveEngine(request.engine);

  if (engine === "kokoro") {
    post({
      type: "VOICES",
      engine,
      voices: KOKORO_VOICES.map((voice) => ({
        id: voice.id,
        label: voice.label,
        language: voice.language,
        style: voice.style,
        recommended: voice.recommended,
      })),
    });
    return;
  }

  post({
    type: "VOICES",
    engine,
    voices: [],
  });
}

/* ------------------------------------------------------------------ */
/*  Message handler                                                    */
/* ------------------------------------------------------------------ */

workerSelf.addEventListener(
  "message",
  async (event: MessageEvent<VoiceTtsRequest>) => {
    const request = event.data;

    try {
      if (!request || typeof request.type !== "string") {
        throw new Error("Invalid TTS worker request.");
      }

      switch (request.type) {
        case "LOAD_MODEL": {
          await handleLoadModel(request);
          return;
        }

        case "SPEAK": {
          await handleSpeak(request);
          return;
        }

        case "STOP": {
          handleStop(request);
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

        case "LIST_VOICES": {
          handleListVoices(request);
          return;
        }

        default: {
          const unknownRequest = request as { type?: string };
          throw new Error(
            `Unknown TTS request type: ${unknownRequest.type ?? "unknown"}`,
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
        jobId: "jobId" in request ? request.jobId : undefined,
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
  detail: "TTS worker initialized.",
  engine: VOICE_REGISTRY_DEFAULTS.ttsEngine,
});
