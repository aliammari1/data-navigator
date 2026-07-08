import { existsSync } from "node:fs";
import path from "node:path";

export type SherpaSttEngine = "sherpa-whisper-small";
export type SherpaTtsEngine = "off" | "sherpa-kokoro" | "sherpa-supertonic";
export type SherpaVoiceRuntime = "auto" | "webgpu" | "wasm";

export type SherpaTranscribeInput = {
  audio: ArrayBuffer | Float32Array | number[];
  sampleRate?: number;
  engine?: SherpaSttEngine | string;
  language?: string;
  localModelPath?: string | null;
};

export type SherpaTranscribeResult = {
  text: string;
  engine: SherpaSttEngine;
  model: string;
  runtime: "cpu";
  sampleRate: number;
  audioDurationMs: number;
  latencyMs: number;
  language?: string;
};

export type SherpaSpeakInput = {
  text: string;
  engine?: SherpaTtsEngine | string;
  voice?: string;
  speed?: number;
  /** Language hint (e.g. "en" | "fr" | "ar"); used by multilingual engines like Supertonic. */
  lang?: string;
  localModelPath?: string | null;
};

export type SherpaSpeakResult = {
  jobId: string;
  engine: SherpaTtsEngine;
  model: string;
  runtime: "cpu";
  voice: string;
  text: string;
  sampleRate: number;
  durationMs: number;
  latencyMs: number;
  wav: ArrayBuffer;
};

type SherpaModule = {
  OfflineRecognizer: {
    createAsync(config: Record<string, unknown>): Promise<OfflineRecognizer>;
  };
  OfflineTts: {
    createAsync(config: Record<string, unknown>): Promise<OfflineTts>;
  };
  GenerationConfig: new (config: Record<string, unknown>) => unknown;
  writeWave(filename: string, wave: { samples: Float32Array; sampleRate: number }): void;
};

type OfflineRecognizer = {
  createStream(): {
    acceptWaveform(input: { samples: Float32Array; sampleRate: number }): void;
  };
  decodeAsync(stream: unknown): Promise<{ text?: string; lang?: string }>;
  getResult(stream: unknown): { text?: string; lang?: string };
};

type OfflineTts = {
  generateAsync(input: {
    text: string;
    sid?: number;
    speed?: number;
    generationConfig?: unknown;
  }): Promise<{ samples: Float32Array; sampleRate: number }>;
};

const DEFAULT_SAMPLE_RATE = 16_000;
const DEFAULT_STT_ENGINE: SherpaSttEngine = "sherpa-whisper-small";
const DEFAULT_TTS_ENGINE: Exclude<SherpaTtsEngine, "off"> = "sherpa-kokoro";
const SUPERTONIC_DEFAULT_NUM_STEPS = 8;

const DEFAULT_STT_MODEL_DIR = path.join(
  process.cwd(),
  "public",
  "models",
  "sherpa",
  "stt",
  "sherpa-onnx-whisper-small",
);
const DEFAULT_KOKORO_MODEL_DIR = path.join(
  process.cwd(),
  "public",
  "models",
  "sherpa",
  "tts",
  "kokoro-en-v0_19",
);
const DEFAULT_SUPERTONIC_MODEL_DIR = path.join(
  process.cwd(),
  "public",
  "models",
  "sherpa",
  "tts",
  "supertonic-3",
);

const KOKORO_SPEAKER_IDS: Record<string, number> = {
  af_sky: 6,
  af_heart: 0,
  am_adam: 1,
  am_michael: 2,
};

let sherpaModulePromise: Promise<SherpaModule> | null = null;
const recognizers = new Map<string, Promise<OfflineRecognizer>>();
const ttsModels = new Map<string, Promise<OfflineTts>>();

function getSherpa(): Promise<SherpaModule> {
  sherpaModulePromise ??= import("sherpa-onnx-node").then(
    (module) => module.default ?? module,
  ) as Promise<SherpaModule>;

  return sherpaModulePromise;
}

function normalizeSttEngine(value: unknown): SherpaSttEngine {
  if (value === "sherpa-whisper-small") return value;
  return DEFAULT_STT_ENGINE;
}

function normalizeTtsEngine(value: unknown): SherpaTtsEngine {
  if (value === "off") return "off";
  if (value === "sherpa-kokoro" || value === "sherpa-supertonic") return value;
  return DEFAULT_TTS_ENGINE;
}

/** Maps this app's language hints (auto/ar/fr/en) to a Supertonic 2-letter language code. */
function mapLanguageHintToSupertonicLang(hint?: string): string {
  const normalized = hint?.toLowerCase().trim();

  if (!normalized || normalized === "auto") return "en";
  if (normalized.startsWith("ar")) return "ar";
  if (normalized.startsWith("fr")) return "fr";
  if (normalized.startsWith("en")) return "en";

  return "en";
}

function normalizeModelDir(value: string | null | undefined, fallback: string): string {
  return path.resolve(value?.trim() || fallback);
}

function requireFile(filePath: string): string {
  if (!existsSync(filePath)) {
    throw new Error(`Missing Sherpa model file: ${filePath}`);
  }

  return filePath;
}

function normalizeAudioInput(input: ArrayBuffer | Float32Array | number[]): Float32Array {
  if (input instanceof Float32Array) {
    return sanitizeAudio(input);
  }

  if (input instanceof ArrayBuffer) {
    return sanitizeAudio(new Float32Array(input));
  }

  if (Array.isArray(input)) {
    return sanitizeAudio(Float32Array.from(input));
  }

  throw new Error("Unsupported audio payload for Sherpa STT.");
}

function sanitizeAudio(samples: Float32Array): Float32Array {
  const out = new Float32Array(samples.length);

  for (let i = 0; i < samples.length; i += 1) {
    const sample = Number.isFinite(samples[i]) ? samples[i] : 0;
    out[i] = Math.max(-1, Math.min(1, sample));
  }

  return out;
}

function normalizeSampleRate(sampleRate?: number): number {
  if (!sampleRate || !Number.isFinite(sampleRate) || sampleRate <= 0) {
    return DEFAULT_SAMPLE_RATE;
  }

  return Math.round(sampleRate);
}

function getWhisperModelConfig(modelDir: string): Record<string, unknown> {
  return {
    featConfig: {
      sampleRate: DEFAULT_SAMPLE_RATE,
      featureDim: 80,
    },
    modelConfig: {
      whisper: {
        encoder: requireFile(path.join(modelDir, "small-encoder.int8.onnx")),
        decoder: requireFile(path.join(modelDir, "small-decoder.int8.onnx")),
      },
      tokens: requireFile(path.join(modelDir, "small-tokens.txt")),
      numThreads: 2,
      provider: "cpu",
      debug: 0,
    },
  };
}

function getKokoroModelConfig(modelDir: string): Record<string, unknown> {
  return {
    model: {
      kokoro: {
        model: requireFile(path.join(modelDir, "model.onnx")),
        voices: requireFile(path.join(modelDir, "voices.bin")),
        tokens: requireFile(path.join(modelDir, "tokens.txt")),
        dataDir: requireFile(path.join(modelDir, "espeak-ng-data")),
      },
      debug: false,
      numThreads: 2,
      provider: "cpu",
    },
    maxNumSentences: 1,
  };
}

function getSupertonicModelConfig(modelDir: string): Record<string, unknown> {
  return {
    model: {
      supertonic: {
        durationPredictor: requireFile(path.join(modelDir, "duration_predictor.int8.onnx")),
        textEncoder: requireFile(path.join(modelDir, "text_encoder.int8.onnx")),
        vectorEstimator: requireFile(path.join(modelDir, "vector_estimator.int8.onnx")),
        vocoder: requireFile(path.join(modelDir, "vocoder.int8.onnx")),
        ttsJson: requireFile(path.join(modelDir, "tts.json")),
        unicodeIndexer: requireFile(path.join(modelDir, "unicode_indexer.bin")),
        voiceStyle: requireFile(path.join(modelDir, "voice.bin")),
      },
      debug: false,
      numThreads: 2,
      provider: "cpu",
    },
    maxNumSentences: 1,
  };
}

async function getRecognizer(modelDir: string): Promise<OfflineRecognizer> {
  const key = path.resolve(modelDir);
  let recognizer = recognizers.get(key);

  if (!recognizer) {
    recognizer = getSherpa().then((sherpa) =>
      sherpa.OfflineRecognizer.createAsync(getWhisperModelConfig(key)),
    );
    recognizers.set(key, recognizer);
  }

  return recognizer;
}

async function getTts(
  engine: Exclude<SherpaTtsEngine, "off">,
  modelDir: string,
): Promise<OfflineTts> {
  const key = `${engine}:${path.resolve(modelDir)}`;
  let tts = ttsModels.get(key);

  if (!tts) {
    tts = getSherpa().then((sherpa) =>
      sherpa.OfflineTts.createAsync(
        engine === "sherpa-supertonic"
          ? getSupertonicModelConfig(path.resolve(modelDir))
          : getKokoroModelConfig(path.resolve(modelDir)),
      ),
    );
    ttsModels.set(key, tts);
  }

  return tts;
}

function getSpeakerId(voice?: string): number {
  if (!voice) return KOKORO_SPEAKER_IDS.af_sky;
  return KOKORO_SPEAKER_IDS[voice] ?? KOKORO_SPEAKER_IDS.af_sky;
}

function getSupertonicSpeakerId(voice?: string): number {
  const parsed = voice ? Number(voice) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

function getDefaultTtsModelDir(engine: Exclude<SherpaTtsEngine, "off">): string {
  return engine === "sherpa-supertonic" ? DEFAULT_SUPERTONIC_MODEL_DIR : DEFAULT_KOKORO_MODEL_DIR;
}

function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const numChannels = 1;
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1, offset += 2) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }

  return buffer;
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}

export async function preloadStt(
  input: { engine?: SherpaSttEngine | string; localModelPath?: string | null } = {},
): Promise<{ engine: SherpaSttEngine; model: string; runtime: "cpu" }> {
  const engine = normalizeSttEngine(input.engine);
  const modelDir = normalizeModelDir(input.localModelPath, DEFAULT_STT_MODEL_DIR);
  await getRecognizer(modelDir);

  return {
    engine,
    model: modelDir,
    runtime: "cpu",
  };
}

export async function transcribe(input: SherpaTranscribeInput): Promise<SherpaTranscribeResult> {
  const start = Date.now();
  const engine = normalizeSttEngine(input.engine);
  const sampleRate = normalizeSampleRate(input.sampleRate);
  const samples = normalizeAudioInput(input.audio);
  const modelDir = normalizeModelDir(input.localModelPath, DEFAULT_STT_MODEL_DIR);
  const recognizer = await getRecognizer(modelDir);
  const stream = recognizer.createStream();

  stream.acceptWaveform({
    sampleRate,
    samples,
  });

  const result = await recognizer.decodeAsync(stream);
  const text = (result.text ?? recognizer.getResult(stream).text ?? "").trim();

  return {
    text,
    engine,
    model: modelDir,
    runtime: "cpu",
    sampleRate,
    audioDurationMs: Math.round((samples.length / sampleRate) * 1000),
    latencyMs: Date.now() - start,
    language: result.lang || input.language,
  };
}

export async function preloadTts(
  input: { engine?: SherpaTtsEngine | string; localModelPath?: string | null } = {},
): Promise<{ engine: SherpaTtsEngine; model: string; runtime: "cpu" }> {
  const engine = normalizeTtsEngine(input.engine);

  if (engine === "off") {
    return {
      engine,
      model: "text-only",
      runtime: "cpu",
    };
  }

  const modelDir = normalizeModelDir(input.localModelPath, getDefaultTtsModelDir(engine));
  await getTts(engine, modelDir);

  return {
    engine,
    model: modelDir,
    runtime: "cpu",
  };
}

export async function speak(input: SherpaSpeakInput): Promise<SherpaSpeakResult> {
  const engine = normalizeTtsEngine(input.engine);

  if (engine === "off") {
    throw new Error("TTS engine is set to text-only mode.");
  }

  const text = input.text.trim();
  if (!text) {
    throw new Error("No text was provided for Sherpa TTS.");
  }

  const start = Date.now();
  const modelDir = normalizeModelDir(input.localModelPath, getDefaultTtsModelDir(engine));
  const tts = await getTts(engine, modelDir);
  const speed =
    typeof input.speed === "number" && Number.isFinite(input.speed)
      ? Math.min(2, Math.max(0.5, input.speed))
      : 1;
  const sherpa = await getSherpa();

  const isSupertonic = engine === "sherpa-supertonic";
  const sid = isSupertonic ? getSupertonicSpeakerId(input.voice) : getSpeakerId(input.voice);

  const generationConfig = isSupertonic
    ? new sherpa.GenerationConfig({
        sid,
        speed,
        numSteps: SUPERTONIC_DEFAULT_NUM_STEPS,
        extra: { lang: mapLanguageHintToSupertonicLang(input.lang) },
      })
    : new sherpa.GenerationConfig({
        sid,
        speed,
        silenceScale: 0.2,
      });

  const audio = isSupertonic
    ? await tts.generateAsync({ text, generationConfig })
    : await tts.generateAsync({ text, sid, speed, generationConfig });

  const wav = encodeWav(sanitizeAudio(audio.samples), audio.sampleRate);

  return {
    jobId: `tts_${Date.now().toString(36)}`,
    engine,
    model: modelDir,
    runtime: "cpu",
    voice: input.voice || (isSupertonic ? String(sid) : "af_sky"),
    text,
    sampleRate: audio.sampleRate,
    durationMs: Math.round((audio.samples.length / audio.sampleRate) * 1000),
    latencyMs: Date.now() - start,
    wav,
  };
}

export function clearVoiceModels(): { stt: number; tts: number } {
  const stt = recognizers.size;
  const tts = ttsModels.size;

  recognizers.clear();
  ttsModels.clear();

  return { stt, tts };
}
