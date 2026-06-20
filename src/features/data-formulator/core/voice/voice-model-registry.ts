/**
 * Voice Model Registry
 *
 * Single source of truth for voice-related engines, model IDs, runtime choices,
 * local asset paths, defaults, and compatibility metadata.
 *
 * This file has no React dependency and no browser side effects.
 */

export type VoiceRuntime = "auto" | "webgpu" | "wasm";

export type VoiceModelKind = "vad" | "stt" | "tts";

export type VoiceModelStatus = "ready" | "experimental" | "planned" | "disabled";

export type VoiceModelSource =
  | "local-assets"
  | "huggingface-cache"
  | "browser-cache"
  | "remote-download";

export type VoiceModelPrecision = "fp32" | "fp16" | "q8" | "q4" | "q4f16";

export type VadEngine = "silero-v5";

export type SttEngine = "whisper-tiny" | "whisper-base" | "whisper-small" | "moonshine";

export type TtsEngine = "off" | "kokoro" | "piper";

export type VoiceLanguageHint = "auto" | "ar" | "ar-TN" | "fr" | "en";

export type SpeakMode = "off" | "summary" | "full";

export interface VoiceRuntimeDefinition {
  id: VoiceRuntime;
  label: string;
  description: string;
}

export interface VoiceModelAsset {
  /**
   * File expected under /public or the configured base path.
   */
  filename: string;

  /**
   * Public URL used by the browser at runtime.
   */
  publicPath: string;

  /**
   * Whether the app should warn if this file is missing.
   */
  required: boolean;
}

export interface VoiceModelDefinition {
  id: string;
  kind: VoiceModelKind;
  engine: VadEngine | SttEngine | TtsEngine;
  label: string;
  shortLabel: string;
  description: string;
  status: VoiceModelStatus;
  source: VoiceModelSource;
  modelId: string;
  localPath?: string;
  baseAssetPath?: string;
  onnxWasmBasePath?: string;
  sampleRate?: number;
  recommendedRuntime: VoiceRuntime;
  supportedRuntimes: VoiceRuntime[];
  recommendedPrecision?: VoiceModelPrecision;
  supportedPrecisions?: VoiceModelPrecision[];
  sizeHintMb?: number;
  quality: "low" | "medium" | "high" | "best";
  speed: "slow" | "medium" | "fast" | "very-fast";
  languages: VoiceLanguageHint[];
  assets: VoiceModelAsset[];
  notes: string[];
}

export interface VoiceRegistryDefaults {
  vadEngine: VadEngine;
  sttEngine: SttEngine;
  ttsEngine: TtsEngine;
  runtime: VoiceRuntime;
  languageHint: VoiceLanguageHint;
  speakMode: SpeakMode;
  ttsVoice: string;
  ttsSpeed: number;
}

export interface VoiceOfflineReadinessItem {
  key: string;
  label: string;
  required: boolean;
  path: string;
  kind: VoiceModelKind;
}

export const VOICE_PUBLIC_PATHS = {
  vad: "/vad",
  sttModels: "/models/stt",
  ttsModels: "/models/tts",
  kokoroModels: "/models/kokoro",
  piperModels: "/models/piper",
  onnxRuntime: "/models/onnx-runtime",
} as const;

export const VOICE_REGISTRY_DEFAULTS: VoiceRegistryDefaults = {
  vadEngine: "silero-v5",
  sttEngine: "whisper-tiny",
  ttsEngine: "kokoro",
  runtime: "auto",
  languageHint: "auto",
  speakMode: "summary",
  ttsVoice: "af_sky",
  ttsSpeed: 1,
};

export const VOICE_RUNTIMES: Record<VoiceRuntime, VoiceRuntimeDefinition> = {
  auto: {
    id: "auto",
    label: "Auto",
    description: "Try WebGPU first when available, then fall back to WASM.",
  },
  webgpu: {
    id: "webgpu",
    label: "WebGPU",
    description: "Fast browser GPU inference when supported.",
  },
  wasm: {
    id: "wasm",
    label: "WASM",
    description: "CPU fallback using WebAssembly.",
  },
};

export const VAD_MODELS: Record<VadEngine, VoiceModelDefinition> = {
  "silero-v5": {
    id: "vad:silero-v5",
    modelId: "silero_vad_v5.onnx",
    kind: "vad",
    engine: "silero-v5",
    label: "Silero VAD v5",
    shortLabel: "Silero VAD",
    description: "Browser voice activity detection for speech start/end segmentation.",
    status: "ready",
    source: "local-assets",
    baseAssetPath: `${VOICE_PUBLIC_PATHS.vad}/`,
    onnxWasmBasePath: `${VOICE_PUBLIC_PATHS.vad}/`,
    sampleRate: 16_000,
    recommendedRuntime: "wasm",
    supportedRuntimes: ["wasm"],
    quality: "high",
    speed: "very-fast",
    languages: ["auto", "ar", "ar-TN", "fr", "en"],
    assets: [
      {
        filename: "silero_vad_v5.onnx",
        publicPath: `${VOICE_PUBLIC_PATHS.vad}/silero_vad_v5.onnx`,
        required: true,
      },
      {
        filename: "vad.worklet.bundle.min.js",
        publicPath: `${VOICE_PUBLIC_PATHS.vad}/vad.worklet.bundle.min.js`,
        required: true,
      },
      {
        filename: "ort-wasm-simd-threaded.wasm",
        publicPath: `${VOICE_PUBLIC_PATHS.vad}/ort-wasm-simd-threaded.wasm`,
        required: false,
      },
      {
        filename: "ort-wasm-simd.wasm",
        publicPath: `${VOICE_PUBLIC_PATHS.vad}/ort-wasm-simd.wasm`,
        required: false,
      },
      {
        filename: "ort-wasm.wasm",
        publicPath: `${VOICE_PUBLIC_PATHS.vad}/ort-wasm.wasm`,
        required: false,
      },
    ],
    notes: [
      "Used through @ricky0123/vad-web.",
      "Keep VAD assets under public/vad.",
      "The service wrapper should pass baseAssetPath and onnxWASMBasePath.",
    ],
  },
};

export const STT_MODELS: Record<SttEngine, VoiceModelDefinition> = {
  "whisper-tiny": {
    id: "stt:whisper-tiny",
    kind: "stt",
    engine: "whisper-tiny",
    label: "Whisper Tiny",
    shortLabel: "Tiny",
    description: "Fastest Whisper model. Best default for local browser STT.",
    status: "ready",
    source: "huggingface-cache",
    modelId: "Xenova/whisper-tiny",
    sampleRate: 16_000,
    recommendedRuntime: "auto",
    supportedRuntimes: ["auto", "webgpu", "wasm"],
    recommendedPrecision: "q8",
    supportedPrecisions: ["fp32", "fp16", "q8"],
    sizeHintMb: 75,
    quality: "medium",
    speed: "very-fast",
    languages: ["auto", "ar", "ar-TN", "fr", "en"],
    assets: [],
    notes: [
      "Current safest default.",
      "Use WebGPU when available, fallback to WASM.",
      "Good for short voice commands and dashboard actions.",
    ],
  },
  "whisper-base": {
    id: "stt:whisper-base",
    kind: "stt",
    engine: "whisper-base",
    label: "Whisper Base",
    shortLabel: "Base",
    description: "Better transcription quality than Tiny, but slower and heavier.",
    status: "experimental",
    source: "huggingface-cache",
    modelId: "Xenova/whisper-base",
    sampleRate: 16_000,
    recommendedRuntime: "auto",
    supportedRuntimes: ["auto", "webgpu", "wasm"],
    recommendedPrecision: "q8",
    supportedPrecisions: ["fp32", "fp16", "q8"],
    sizeHintMb: 145,
    quality: "high",
    speed: "fast",
    languages: ["auto", "ar", "ar-TN", "fr", "en"],
    assets: [],
    notes: [
      "Enable after the STT worker supports model switching.",
      "Better for French/Arabic mixed phrases than Tiny.",
    ],
  },
  "whisper-small": {
    id: "stt:whisper-small",
    kind: "stt",
    engine: "whisper-small",
    label: "Whisper Small",
    shortLabel: "Small",
    description: "Higher quality STT for difficult audio. Heavy for browser use.",
    status: "experimental",
    source: "huggingface-cache",
    modelId: "Xenova/whisper-small",
    sampleRate: 16_000,
    recommendedRuntime: "webgpu",
    supportedRuntimes: ["auto", "webgpu", "wasm"],
    recommendedPrecision: "q8",
    supportedPrecisions: ["fp32", "fp16", "q8"],
    sizeHintMb: 480,
    quality: "best",
    speed: "medium",
    languages: ["auto", "ar", "ar-TN", "fr", "en"],
    assets: [],
    notes: [
      "Prefer WebGPU.",
      "Can be too heavy for low-end machines.",
      "Use as a high-quality mode, not as the default.",
    ],
  },
  moonshine: {
    id: "stt:moonshine",
    kind: "stt",
    engine: "moonshine",
    label: "Moonshine Tiny",
    shortLabel: "Moonshine",
    description: "Experimental lightweight STT option for fast command transcription.",
    status: "planned",
    source: "huggingface-cache",
    modelId: "onnx-community/moonshine-tiny-ONNX",
    sampleRate: 16_000,
    recommendedRuntime: "auto",
    supportedRuntimes: ["auto", "webgpu", "wasm"],
    recommendedPrecision: "q8",
    supportedPrecisions: ["fp32", "q8"],
    quality: "medium",
    speed: "very-fast",
    languages: ["auto", "en"],
    assets: [],
    notes: [
      "Do not expose as enabled until the STT worker implements its input/output differences.",
      "Useful later for very fast command mode.",
    ],
  },
};

export const TTS_MODELS: Record<TtsEngine, VoiceModelDefinition> = {
  off: {
    id: "tts:off",
    modelId: "off",
    kind: "tts",
    engine: "off",
    label: "Text only",
    shortLabel: "Off",
    description: "Voice output disabled. Assistant replies as text only.",
    status: "ready",
    source: "browser-cache",
    recommendedRuntime: "wasm",
    supportedRuntimes: ["wasm"],
    quality: "low",
    speed: "very-fast",
    languages: ["auto", "ar", "ar-TN", "fr", "en"],
    assets: [],
    notes: ["Use this when TTS is disabled or unavailable."],
  },
  kokoro: {
    id: "tts:kokoro",
    kind: "tts",
    engine: "kokoro",
    label: "Kokoro 82M",
    shortLabel: "Kokoro",
    description: "High-quality local browser TTS through kokoro-js.",
    status: "experimental",
    source: "huggingface-cache",
    modelId: "onnx-community/Kokoro-82M-ONNX",
    recommendedRuntime: "auto",
    supportedRuntimes: ["auto", "webgpu", "wasm"],
    recommendedPrecision: "q8",
    supportedPrecisions: ["fp32", "fp16", "q8", "q4", "q4f16"],
    sizeHintMb: 320,
    quality: "best",
    speed: "fast",
    languages: ["en"],
    assets: [],
    notes: [
      "Use through kokoro-js.",
      "Best quality option for English voice output.",
      "Use Piper fallback for lower-end devices or wider language coverage.",
    ],
  },
  piper: {
    id: "tts:piper",
    modelId: "piper",
    kind: "tts",
    engine: "piper",
    label: "Piper",
    shortLabel: "Piper",
    description: "Fast local TTS fallback. Good for latency and mobile.",
    status: "planned",
    source: "local-assets",
    baseAssetPath: `${VOICE_PUBLIC_PATHS.piperModels}/`,
    recommendedRuntime: "wasm",
    supportedRuntimes: ["wasm"],
    recommendedPrecision: "q8",
    supportedPrecisions: ["q8"],
    quality: "medium",
    speed: "very-fast",
    languages: ["en", "fr", "ar"],
    assets: [
      {
        filename: "voice.onnx",
        publicPath: `${VOICE_PUBLIC_PATHS.piperModels}/voice.onnx`,
        required: false,
      },
      {
        filename: "voice.onnx.json",
        publicPath: `${VOICE_PUBLIC_PATHS.piperModels}/voice.onnx.json`,
        required: false,
      },
    ],
    notes: [
      "Add a concrete Piper voice package before enabling.",
      "Useful fallback when Kokoro is too heavy.",
    ],
  },
};

export const KOKORO_VOICES = [
  {
    id: "af_sky",
    label: "Sky",
    language: "en",
    style: "female",
    recommended: true,
  },
  {
    id: "af_heart",
    label: "Heart",
    language: "en",
    style: "female",
    recommended: true,
  },
  {
    id: "am_adam",
    label: "Adam",
    language: "en",
    style: "male",
    recommended: false,
  },
  {
    id: "am_michael",
    label: "Michael",
    language: "en",
    style: "male",
    recommended: false,
  },
] as const;

export type KokoroVoiceId = (typeof KOKORO_VOICES)[number]["id"];

export const VOICE_OFFLINE_READINESS_ITEMS: VoiceOfflineReadinessItem[] = [
  ...VAD_MODELS["silero-v5"].assets.map((asset) => ({
    key: `vad:${asset.filename}`,
    label: `VAD asset: ${asset.filename}`,
    required: asset.required,
    path: asset.publicPath,
    kind: "vad" as const,
  })),
  ...TTS_MODELS.piper.assets.map((asset) => ({
    key: `piper:${asset.filename}`,
    label: `Piper asset: ${asset.filename}`,
    required: asset.required,
    path: asset.publicPath,
    kind: "tts" as const,
  })),
];

export function getVadModel(engine: VadEngine): VoiceModelDefinition {
  return VAD_MODELS[engine];
}

export function getSttModel(engine: SttEngine): VoiceModelDefinition {
  return STT_MODELS[engine];
}

export function getTtsModel(engine: TtsEngine): VoiceModelDefinition {
  return TTS_MODELS[engine];
}

export function getVoiceModel(kind: "vad", engine: VadEngine): VoiceModelDefinition;
export function getVoiceModel(kind: "stt", engine: SttEngine): VoiceModelDefinition;
export function getVoiceModel(kind: "tts", engine: TtsEngine): VoiceModelDefinition;
export function getVoiceModel(
  kind: VoiceModelKind,
  engine: VadEngine | SttEngine | TtsEngine,
): VoiceModelDefinition {
  if (kind === "vad") {
    return getVadModel(engine as VadEngine);
  }

  if (kind === "stt") {
    return getSttModel(engine as SttEngine);
  }

  return getTtsModel(engine as TtsEngine);
}

export function getRuntimeOrder(runtime: VoiceRuntime): Exclude<VoiceRuntime, "auto">[] {
  if (runtime === "webgpu") return ["webgpu", "wasm"];
  if (runtime === "wasm") return ["wasm"];

  return ["webgpu", "wasm"];
}

export function getDefaultPrecisionForRuntime(
  model: VoiceModelDefinition,
  runtime: Exclude<VoiceRuntime, "auto">,
): VoiceModelPrecision | undefined {
  if (!model.supportedPrecisions?.length) {
    return undefined;
  }

  if (model.recommendedPrecision) {
    return model.recommendedPrecision;
  }

  if (runtime === "webgpu" && model.supportedPrecisions.includes("fp16")) {
    return "fp16";
  }

  if (model.supportedPrecisions.includes("q8")) {
    return "q8";
  }

  return model.supportedPrecisions[0];
}

export function isRuntimeSupported(model: VoiceModelDefinition, runtime: VoiceRuntime): boolean {
  if (runtime === "auto") {
    return model.supportedRuntimes.includes("auto");
  }

  return model.supportedRuntimes.includes(runtime);
}

export function isModelEnabled(model: VoiceModelDefinition): boolean {
  return model.status === "ready" || model.status === "experimental";
}

export function isSttEngineEnabled(engine: SttEngine): boolean {
  return isModelEnabled(getSttModel(engine));
}

export function isTtsEngineEnabled(engine: TtsEngine): boolean {
  return isModelEnabled(getTtsModel(engine));
}

export function getEnabledSttEngines(): SttEngine[] {
  return (Object.keys(STT_MODELS) as SttEngine[]).filter(isSttEngineEnabled);
}

export function getEnabledTtsEngines(): TtsEngine[] {
  return (Object.keys(TTS_MODELS) as TtsEngine[]).filter(isTtsEngineEnabled);
}

export function normalizeSttEngine(value: unknown): SttEngine {
  if (value === "whisper-multilingual") {
    return "whisper-tiny";
  }

  if (value === "whisper-tunisian") {
    return "whisper-tiny";
  }

  if (typeof value === "string" && Object.hasOwn(STT_MODELS, value)) {
    return value as SttEngine;
  }

  return VOICE_REGISTRY_DEFAULTS.sttEngine;
}

export function normalizeTtsEngine(value: unknown): TtsEngine {
  if (typeof value === "string" && Object.hasOwn(TTS_MODELS, value)) {
    return value as TtsEngine;
  }

  return VOICE_REGISTRY_DEFAULTS.ttsEngine;
}

export function normalizeVoiceRuntime(value: unknown): VoiceRuntime {
  if (value === "auto" || value === "webgpu" || value === "wasm") {
    return value;
  }

  return VOICE_REGISTRY_DEFAULTS.runtime;
}

export function normalizeLanguageHint(value: unknown): VoiceLanguageHint {
  if (value === "auto" || value === "ar" || value === "ar-TN" || value === "fr" || value === "en") {
    return value;
  }

  return VOICE_REGISTRY_DEFAULTS.languageHint;
}

export function mapLanguageHintToWhisperLanguage(
  language: VoiceLanguageHint | string | undefined,
): string | undefined {
  const normalized = language?.toLowerCase().trim();

  if (!normalized || normalized === "auto") return undefined;
  if (normalized.startsWith("ar")) return "arabic";
  if (normalized.startsWith("fr")) return "french";
  if (normalized.startsWith("en")) return "english";

  return undefined;
}

export function mapLanguageHintToDisplayLabel(language: VoiceLanguageHint | string): string {
  if (language === "auto") return "Auto";
  if (language === "ar-TN") return "Tounsi";
  if (language === "ar") return "Arabic";
  if (language === "fr") return "French";
  if (language === "en") return "English";

  return language;
}

export function getVoiceReadinessScore(
  items: Array<{ ready: boolean; required: boolean }>,
): number {
  if (items.length === 0) return 100;

  const requiredItems = items.filter((item) => item.required);
  const optionalItems = items.filter((item) => !item.required);

  const requiredScore =
    requiredItems.length === 0
      ? 1
      : requiredItems.filter((item) => item.ready).length / requiredItems.length;

  const optionalScore =
    optionalItems.length === 0
      ? 1
      : optionalItems.filter((item) => item.ready).length / optionalItems.length;

  return Math.round((requiredScore * 0.8 + optionalScore * 0.2) * 100);
}

export function createModelCacheKey(model: VoiceModelDefinition): string {
  return `${model.kind}:${model.engine}:${model.modelId ?? model.localPath ?? model.baseAssetPath ?? model.id}`;
}

export function getModelDisplaySummary(model: VoiceModelDefinition): string {
  const runtime = model.recommendedRuntime.toUpperCase();
  const size = model.sizeHintMb ? ` · ~${model.sizeHintMb}MB` : "";
  const precision = model.recommendedPrecision ? ` · ${model.recommendedPrecision}` : "";

  return `${model.shortLabel} · ${runtime}${precision}${size}`;
}

export const ALL_VOICE_MODELS = [
  ...Object.values(VAD_MODELS),
  ...Object.values(STT_MODELS),
  ...Object.values(TTS_MODELS),
] as const;
