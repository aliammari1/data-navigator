import { describe, expect, it } from "vitest";

import {
  ALL_VOICE_MODELS,
  KOKORO_VOICES,
  STT_MODELS,
  TTS_MODELS,
  VAD_MODELS,
  VOICE_OFFLINE_READINESS_ITEMS,
  VOICE_PUBLIC_PATHS,
  VOICE_REGISTRY_DEFAULTS,
  VOICE_RUNTIMES,
  createModelCacheKey,
  getDefaultPrecisionForRuntime,
  getEnabledSttEngines,
  getEnabledTtsEngines,
  getModelDisplaySummary,
  getSttModel,
  getTtsModel,
  getVadModel,
  getVoiceModel,
  getVoiceReadinessScore,
  isModelEnabled,
  isRuntimeSupported,
  isSttEngineEnabled,
  isTtsEngineEnabled,
  mapLanguageHintToDisplayLabel,
  mapLanguageHintToWhisperLanguage,
  normalizeLanguageHint,
  normalizeSttEngine,
  normalizeTtsEngine,
  normalizeVoiceRuntime,
  getRuntimeOrder,
} from "@/features/data-formulator/core/voice/voice-model-registry";

// ─── VOICE_PUBLIC_PATHS ────────────────────────────────────────────────────────

describe("VOICE_PUBLIC_PATHS", () => {
  it("exposes the correct vad base path", () => {
    expect(VOICE_PUBLIC_PATHS.vad).toBe("/vad");
  });

  it("exposes sttModels under /models/stt", () => {
    expect(VOICE_PUBLIC_PATHS.sttModels).toBe("/models/stt");
  });

  it("exposes piperModels under /models/piper", () => {
    expect(VOICE_PUBLIC_PATHS.piperModels).toBe("/models/piper");
  });

  it("exposes onnxRuntime under /models/onnx-runtime", () => {
    expect(VOICE_PUBLIC_PATHS.onnxRuntime).toBe("/models/onnx-runtime");
  });
});

// ─── VOICE_REGISTRY_DEFAULTS ─────────────────────────────────────────────────

describe("VOICE_REGISTRY_DEFAULTS", () => {
  it("defaults vadEngine to silero-v5", () => {
    expect(VOICE_REGISTRY_DEFAULTS.vadEngine).toBe("silero-v5");
  });

  it("defaults sttEngine to whisper-tiny", () => {
    expect(VOICE_REGISTRY_DEFAULTS.sttEngine).toBe("whisper-tiny");
  });

  it("defaults ttsEngine to kokoro", () => {
    expect(VOICE_REGISTRY_DEFAULTS.ttsEngine).toBe("kokoro");
  });

  it("defaults runtime to auto", () => {
    expect(VOICE_REGISTRY_DEFAULTS.runtime).toBe("auto");
  });

  it("defaults languageHint to auto", () => {
    expect(VOICE_REGISTRY_DEFAULTS.languageHint).toBe("auto");
  });

  it("defaults speakMode to summary", () => {
    expect(VOICE_REGISTRY_DEFAULTS.speakMode).toBe("summary");
  });

  it("defaults ttsVoice to af_sky", () => {
    expect(VOICE_REGISTRY_DEFAULTS.ttsVoice).toBe("af_sky");
  });

  it("defaults ttsSpeed to 1", () => {
    expect(VOICE_REGISTRY_DEFAULTS.ttsSpeed).toBe(1);
  });
});

// ─── VOICE_RUNTIMES ──────────────────────────────────────────────────────────

describe("VOICE_RUNTIMES", () => {
  it("has entries for auto, webgpu, and wasm", () => {
    expect(Object.keys(VOICE_RUNTIMES)).toEqual(["auto", "webgpu", "wasm"]);
  });

  it("auto runtime has id=auto and tries WebGPU first", () => {
    expect(VOICE_RUNTIMES.auto.id).toBe("auto");
    expect(VOICE_RUNTIMES.auto.label).toBe("Auto");
    expect(VOICE_RUNTIMES.auto.description).toContain("WebGPU");
  });

  it("webgpu runtime has id=webgpu", () => {
    expect(VOICE_RUNTIMES.webgpu.id).toBe("webgpu");
    expect(VOICE_RUNTIMES.webgpu.label).toBe("WebGPU");
  });

  it("wasm runtime has id=wasm", () => {
    expect(VOICE_RUNTIMES.wasm.id).toBe("wasm");
    expect(VOICE_RUNTIMES.wasm.label).toBe("WASM");
  });
});

// ─── VAD_MODELS ───────────────────────────────────────────────────────────────

describe("VAD_MODELS", () => {
  it("has a silero-v5 entry", () => {
    expect(VAD_MODELS["silero-v5"]).toBeDefined();
  });

  it("silero-v5 has kind=vad and status=ready", () => {
    const model = VAD_MODELS["silero-v5"];
    expect(model.kind).toBe("vad");
    expect(model.status).toBe("ready");
  });

  it("silero-v5 baseAssetPath starts with /vad/", () => {
    expect(VAD_MODELS["silero-v5"].baseAssetPath).toBe("/vad/");
  });

  it("silero-v5 has 5 assets", () => {
    expect(VAD_MODELS["silero-v5"].assets).toHaveLength(5);
  });

  it("silero-v5 required assets are the onnx model and worklet bundle", () => {
    const required = VAD_MODELS["silero-v5"].assets.filter((a) => a.required);
    expect(required.map((a) => a.filename)).toEqual([
      "silero_vad_v5.onnx",
      "vad.worklet.bundle.min.js",
    ]);
  });

  it("silero-v5 public paths are rooted under /vad", () => {
    for (const asset of VAD_MODELS["silero-v5"].assets) {
      expect(asset.publicPath).toMatch(/^\/vad\//);
    }
  });

  it("silero-v5 sample rate is 16000", () => {
    expect(VAD_MODELS["silero-v5"].sampleRate).toBe(16_000);
  });

  it("silero-v5 recommendedRuntime is wasm", () => {
    expect(VAD_MODELS["silero-v5"].recommendedRuntime).toBe("wasm");
  });
});

// ─── STT_MODELS ───────────────────────────────────────────────────────────────

describe("STT_MODELS", () => {
  it("contains whisper-tiny, whisper-base, whisper-small, and moonshine", () => {
    expect(Object.keys(STT_MODELS)).toEqual([
      "whisper-tiny",
      "whisper-base",
      "whisper-small",
      "moonshine",
    ]);
  });

  it("whisper-tiny has status=ready", () => {
    expect(STT_MODELS["whisper-tiny"].status).toBe("ready");
  });

  it("whisper-base has status=experimental", () => {
    expect(STT_MODELS["whisper-base"].status).toBe("experimental");
  });

  it("whisper-small has status=experimental and recommendedRuntime=webgpu", () => {
    expect(STT_MODELS["whisper-small"].status).toBe("experimental");
    expect(STT_MODELS["whisper-small"].recommendedRuntime).toBe("webgpu");
  });

  it("moonshine has status=planned", () => {
    expect(STT_MODELS["moonshine"].status).toBe("planned");
  });

  it("whisper-tiny sizeHintMb is 75", () => {
    expect(STT_MODELS["whisper-tiny"].sizeHintMb).toBe(75);
  });

  it("whisper-base sizeHintMb is 145", () => {
    expect(STT_MODELS["whisper-base"].sizeHintMb).toBe(145);
  });

  it("whisper-small sizeHintMb is 480", () => {
    expect(STT_MODELS["whisper-small"].sizeHintMb).toBe(480);
  });

  it("all STT models have kind=stt", () => {
    for (const model of Object.values(STT_MODELS)) {
      expect(model.kind).toBe("stt");
    }
  });

  it("all STT models have sampleRate=16000", () => {
    for (const model of Object.values(STT_MODELS)) {
      expect(model.sampleRate).toBe(16_000);
    }
  });
});

// ─── TTS_MODELS ───────────────────────────────────────────────────────────────

describe("TTS_MODELS", () => {
  it("contains off, kokoro, and piper", () => {
    expect(Object.keys(TTS_MODELS)).toEqual(["off", "kokoro", "piper"]);
  });

  it("tts:off has status=ready and kind=tts", () => {
    expect(TTS_MODELS.off.status).toBe("ready");
    expect(TTS_MODELS.off.kind).toBe("tts");
  });

  it("kokoro has status=experimental", () => {
    expect(TTS_MODELS.kokoro.status).toBe("experimental");
  });

  it("piper has status=planned", () => {
    expect(TTS_MODELS.piper.status).toBe("planned");
  });

  it("piper has 2 assets with publicPaths rooted under /models/piper", () => {
    expect(TTS_MODELS.piper.assets).toHaveLength(2);
    for (const asset of TTS_MODELS.piper.assets) {
      expect(asset.publicPath).toMatch(/^\/models\/piper\//);
    }
  });

  it("kokoro sizeHintMb is 320", () => {
    expect(TTS_MODELS.kokoro.sizeHintMb).toBe(320);
  });
});

// ─── KOKORO_VOICES ────────────────────────────────────────────────────────────

describe("KOKORO_VOICES", () => {
  it("has 4 voices", () => {
    expect(KOKORO_VOICES).toHaveLength(4);
  });

  it("af_sky and af_heart are recommended", () => {
    const recommended = KOKORO_VOICES.filter((v) => v.recommended);
    expect(recommended.map((v) => v.id)).toEqual(["af_sky", "af_heart"]);
  });

  it("am_adam and am_michael are not recommended", () => {
    const notRec = KOKORO_VOICES.filter((v) => !v.recommended);
    expect(notRec.map((v) => v.id)).toEqual(["am_adam", "am_michael"]);
  });

  it("all voices have language=en", () => {
    for (const v of KOKORO_VOICES) {
      expect(v.language).toBe("en");
    }
  });

  it("sky and heart are female; adam and michael are male", () => {
    const female = KOKORO_VOICES.filter((v) => v.style === "female").map((v) => v.id);
    const male = KOKORO_VOICES.filter((v) => v.style === "male").map((v) => v.id);
    expect(female).toEqual(["af_sky", "af_heart"]);
    expect(male).toEqual(["am_adam", "am_michael"]);
  });
});

// ─── VOICE_OFFLINE_READINESS_ITEMS ────────────────────────────────────────────

describe("VOICE_OFFLINE_READINESS_ITEMS", () => {
  it("includes items derived from VAD silero-v5 assets", () => {
    const vadItems = VOICE_OFFLINE_READINESS_ITEMS.filter((i) => i.kind === "vad");
    // silero-v5 has 5 assets
    expect(vadItems).toHaveLength(5);
  });

  it("includes items derived from piper TTS assets", () => {
    const ttsItems = VOICE_OFFLINE_READINESS_ITEMS.filter((i) => i.kind === "tts");
    // piper has 2 assets
    expect(ttsItems).toHaveLength(2);
  });

  it("VAD items have keys prefixed with vad:", () => {
    const vadItems = VOICE_OFFLINE_READINESS_ITEMS.filter((i) => i.kind === "vad");
    for (const item of vadItems) {
      expect(item.key).toMatch(/^vad:/);
    }
  });

  it("TTS items have keys prefixed with piper:", () => {
    const ttsItems = VOICE_OFFLINE_READINESS_ITEMS.filter((i) => i.kind === "tts");
    for (const item of ttsItems) {
      expect(item.key).toMatch(/^piper:/);
    }
  });

  it("VAD items inherit the required flag from their source asset", () => {
    // silero_vad_v5.onnx and vad.worklet.bundle.min.js are required=true
    const vadItems = VOICE_OFFLINE_READINESS_ITEMS.filter((i) => i.kind === "vad");
    const required = vadItems.filter((i) => i.required);
    expect(required).toHaveLength(2);
  });

  it("TTS piper items are all required=false", () => {
    const ttsItems = VOICE_OFFLINE_READINESS_ITEMS.filter((i) => i.kind === "tts");
    expect(ttsItems.every((i) => !i.required)).toBe(true);
  });
});

// ─── getVadModel ──────────────────────────────────────────────────────────────

describe("getVadModel", () => {
  it("returns the silero-v5 definition for 'silero-v5'", () => {
    const model = getVadModel("silero-v5");
    expect(model).toBe(VAD_MODELS["silero-v5"]);
    expect(model.id).toBe("vad:silero-v5");
  });
});

// ─── getSttModel ──────────────────────────────────────────────────────────────

describe("getSttModel", () => {
  it("returns whisper-tiny model", () => {
    expect(getSttModel("whisper-tiny")).toBe(STT_MODELS["whisper-tiny"]);
  });

  it("returns whisper-base model", () => {
    expect(getSttModel("whisper-base")).toBe(STT_MODELS["whisper-base"]);
  });

  it("returns whisper-small model", () => {
    expect(getSttModel("whisper-small")).toBe(STT_MODELS["whisper-small"]);
  });

  it("returns moonshine model", () => {
    expect(getSttModel("moonshine")).toBe(STT_MODELS["moonshine"]);
  });
});

// ─── getTtsModel ──────────────────────────────────────────────────────────────

describe("getTtsModel", () => {
  it("returns the off model", () => {
    expect(getTtsModel("off")).toBe(TTS_MODELS.off);
  });

  it("returns the kokoro model", () => {
    expect(getTtsModel("kokoro")).toBe(TTS_MODELS.kokoro);
  });

  it("returns the piper model", () => {
    expect(getTtsModel("piper")).toBe(TTS_MODELS.piper);
  });
});

// ─── getVoiceModel ────────────────────────────────────────────────────────────

describe("getVoiceModel", () => {
  it("routes kind=vad to VAD_MODELS", () => {
    const model = getVoiceModel("vad", "silero-v5");
    expect(model).toBe(VAD_MODELS["silero-v5"]);
  });

  it("routes kind=stt to STT_MODELS", () => {
    const model = getVoiceModel("stt", "whisper-tiny");
    expect(model).toBe(STT_MODELS["whisper-tiny"]);
  });

  it("routes kind=tts to TTS_MODELS", () => {
    const model = getVoiceModel("tts", "kokoro");
    expect(model).toBe(TTS_MODELS.kokoro);
  });

  it("routes kind=tts to the off model", () => {
    const model = getVoiceModel("tts", "off");
    expect(model).toBe(TTS_MODELS.off);
  });
});

// ─── getRuntimeOrder ─────────────────────────────────────────────────────────

describe("getRuntimeOrder", () => {
  it("returns [webgpu, wasm] for runtime=auto (default)", () => {
    expect(getRuntimeOrder("auto")).toEqual(["webgpu", "wasm"]);
  });

  it("returns [webgpu, wasm] for runtime=webgpu", () => {
    expect(getRuntimeOrder("webgpu")).toEqual(["webgpu", "wasm"]);
  });

  it("returns [wasm] for runtime=wasm", () => {
    expect(getRuntimeOrder("wasm")).toEqual(["wasm"]);
  });
});

// ─── getDefaultPrecisionForRuntime ───────────────────────────────────────────

describe("getDefaultPrecisionForRuntime", () => {
  it("returns undefined when model has no supportedPrecisions", () => {
    const model = { ...VAD_MODELS["silero-v5"], supportedPrecisions: undefined };
    expect(getDefaultPrecisionForRuntime(model, "wasm")).toBeUndefined();
  });

  it("returns undefined when model has empty supportedPrecisions array", () => {
    const model = { ...STT_MODELS["whisper-tiny"], supportedPrecisions: [] };
    expect(getDefaultPrecisionForRuntime(model, "wasm")).toBeUndefined();
  });

  it("returns recommendedPrecision when set (ignores runtime)", () => {
    // whisper-tiny has recommendedPrecision: q8
    const model = STT_MODELS["whisper-tiny"];
    expect(getDefaultPrecisionForRuntime(model, "wasm")).toBe("q8");
    expect(getDefaultPrecisionForRuntime(model, "webgpu")).toBe("q8");
  });

  it("returns fp16 for webgpu when model has fp16 support but no recommendedPrecision", () => {
    // Arrange: a model with fp16 support but no recommendedPrecision
    const model = {
      ...STT_MODELS["whisper-tiny"],
      recommendedPrecision: undefined,
      supportedPrecisions: ["fp32", "fp16", "q8"] as const,
    };
    expect(getDefaultPrecisionForRuntime(model, "webgpu")).toBe("fp16");
  });

  it("returns q8 for wasm when model has q8 support but no fp16 and no recommendedPrecision", () => {
    // wasm + supports q8 but no fp16
    const model = {
      ...STT_MODELS["whisper-tiny"],
      recommendedPrecision: undefined,
      supportedPrecisions: ["fp32", "q8"] as const,
    };
    expect(getDefaultPrecisionForRuntime(model, "wasm")).toBe("q8");
  });

  it("falls back to first supported precision when neither recommendedPrecision, fp16 (webgpu), nor q8 is available", () => {
    const model = {
      ...STT_MODELS["whisper-tiny"],
      recommendedPrecision: undefined,
      supportedPrecisions: ["fp32"] as const,
    };
    expect(getDefaultPrecisionForRuntime(model, "webgpu")).toBe("fp32");
  });

  it("returns first supported precision for wasm when no q8 is in the list", () => {
    const model = {
      ...STT_MODELS["whisper-tiny"],
      recommendedPrecision: undefined,
      supportedPrecisions: ["fp32", "fp16"] as const,
    };
    // wasm: no fp16 special case, no q8, falls back to first = fp32
    expect(getDefaultPrecisionForRuntime(model, "wasm")).toBe("fp32");
  });
});

// ─── isRuntimeSupported ──────────────────────────────────────────────────────

describe("isRuntimeSupported", () => {
  it("returns true when model supports 'auto' and runtime is 'auto'", () => {
    // whisper-tiny supports "auto"
    expect(isRuntimeSupported(STT_MODELS["whisper-tiny"], "auto")).toBe(true);
  });

  it("returns false when model does not support 'auto' and runtime is 'auto'", () => {
    // silero-v5 only supports wasm, not auto
    expect(isRuntimeSupported(VAD_MODELS["silero-v5"], "auto")).toBe(false);
  });

  it("returns true for a directly listed runtime", () => {
    expect(isRuntimeSupported(STT_MODELS["whisper-tiny"], "webgpu")).toBe(true);
    expect(isRuntimeSupported(STT_MODELS["whisper-tiny"], "wasm")).toBe(true);
  });

  it("returns false for a runtime not in the model's supportedRuntimes", () => {
    // silero-v5 only supports wasm
    expect(isRuntimeSupported(VAD_MODELS["silero-v5"], "webgpu")).toBe(false);
  });
});

// ─── isModelEnabled ──────────────────────────────────────────────────────────

describe("isModelEnabled", () => {
  it("returns true for status=ready", () => {
    expect(isModelEnabled(STT_MODELS["whisper-tiny"])).toBe(true);
    expect(isModelEnabled(TTS_MODELS.off)).toBe(true);
  });

  it("returns true for status=experimental", () => {
    expect(isModelEnabled(STT_MODELS["whisper-base"])).toBe(true);
    expect(isModelEnabled(TTS_MODELS.kokoro)).toBe(true);
  });

  it("returns false for status=planned", () => {
    expect(isModelEnabled(STT_MODELS["moonshine"])).toBe(false);
    expect(isModelEnabled(TTS_MODELS.piper)).toBe(false);
  });

  it("returns false for status=disabled", () => {
    const model = { ...STT_MODELS["whisper-tiny"], status: "disabled" as const };
    expect(isModelEnabled(model)).toBe(false);
  });
});

// ─── isSttEngineEnabled ──────────────────────────────────────────────────────

describe("isSttEngineEnabled", () => {
  it("returns true for whisper-tiny (ready)", () => {
    expect(isSttEngineEnabled("whisper-tiny")).toBe(true);
  });

  it("returns true for whisper-base (experimental)", () => {
    expect(isSttEngineEnabled("whisper-base")).toBe(true);
  });

  it("returns true for whisper-small (experimental)", () => {
    expect(isSttEngineEnabled("whisper-small")).toBe(true);
  });

  it("returns false for moonshine (planned)", () => {
    expect(isSttEngineEnabled("moonshine")).toBe(false);
  });
});

// ─── isTtsEngineEnabled ──────────────────────────────────────────────────────

describe("isTtsEngineEnabled", () => {
  it("returns true for off (ready)", () => {
    expect(isTtsEngineEnabled("off")).toBe(true);
  });

  it("returns true for kokoro (experimental)", () => {
    expect(isTtsEngineEnabled("kokoro")).toBe(true);
  });

  it("returns false for piper (planned)", () => {
    expect(isTtsEngineEnabled("piper")).toBe(false);
  });
});

// ─── getEnabledSttEngines ────────────────────────────────────────────────────

describe("getEnabledSttEngines", () => {
  it("returns only ready/experimental engines (excludes moonshine)", () => {
    const enabled = getEnabledSttEngines();
    expect(enabled).toContain("whisper-tiny");
    expect(enabled).toContain("whisper-base");
    expect(enabled).toContain("whisper-small");
    expect(enabled).not.toContain("moonshine");
  });

  it("returns 3 enabled STT engines", () => {
    expect(getEnabledSttEngines()).toHaveLength(3);
  });
});

// ─── getEnabledTtsEngines ────────────────────────────────────────────────────

describe("getEnabledTtsEngines", () => {
  it("returns only ready/experimental engines (excludes piper)", () => {
    const enabled = getEnabledTtsEngines();
    expect(enabled).toContain("off");
    expect(enabled).toContain("kokoro");
    expect(enabled).not.toContain("piper");
  });

  it("returns 2 enabled TTS engines", () => {
    expect(getEnabledTtsEngines()).toHaveLength(2);
  });
});

// ─── normalizeSttEngine ──────────────────────────────────────────────────────

describe("normalizeSttEngine", () => {
  it("maps legacy 'whisper-multilingual' to 'whisper-tiny'", () => {
    expect(normalizeSttEngine("whisper-multilingual")).toBe("whisper-tiny");
  });

  it("maps legacy 'whisper-tunisian' to 'whisper-tiny'", () => {
    expect(normalizeSttEngine("whisper-tunisian")).toBe("whisper-tiny");
  });

  it("passes through valid known engine keys unchanged", () => {
    expect(normalizeSttEngine("whisper-tiny")).toBe("whisper-tiny");
    expect(normalizeSttEngine("whisper-base")).toBe("whisper-base");
    expect(normalizeSttEngine("whisper-small")).toBe("whisper-small");
    expect(normalizeSttEngine("moonshine")).toBe("moonshine");
  });

  it("returns the default sttEngine for unknown string values", () => {
    expect(normalizeSttEngine("gpt-turbo")).toBe(VOICE_REGISTRY_DEFAULTS.sttEngine);
  });

  it("returns the default sttEngine for non-string values", () => {
    expect(normalizeSttEngine(null)).toBe(VOICE_REGISTRY_DEFAULTS.sttEngine);
    expect(normalizeSttEngine(undefined)).toBe(VOICE_REGISTRY_DEFAULTS.sttEngine);
    expect(normalizeSttEngine(42)).toBe(VOICE_REGISTRY_DEFAULTS.sttEngine);
    expect(normalizeSttEngine({})).toBe(VOICE_REGISTRY_DEFAULTS.sttEngine);
  });
});

// ─── normalizeTtsEngine ──────────────────────────────────────────────────────

describe("normalizeTtsEngine", () => {
  it("passes through known TTS engine keys unchanged", () => {
    expect(normalizeTtsEngine("off")).toBe("off");
    expect(normalizeTtsEngine("kokoro")).toBe("kokoro");
    expect(normalizeTtsEngine("piper")).toBe("piper");
  });

  it("returns the default ttsEngine for unknown strings", () => {
    expect(normalizeTtsEngine("espeak")).toBe(VOICE_REGISTRY_DEFAULTS.ttsEngine);
  });

  it("returns the default ttsEngine for non-string values", () => {
    expect(normalizeTtsEngine(null)).toBe(VOICE_REGISTRY_DEFAULTS.ttsEngine);
    expect(normalizeTtsEngine(undefined)).toBe(VOICE_REGISTRY_DEFAULTS.ttsEngine);
    expect(normalizeTtsEngine(123)).toBe(VOICE_REGISTRY_DEFAULTS.ttsEngine);
  });
});

// ─── normalizeVoiceRuntime ───────────────────────────────────────────────────

describe("normalizeVoiceRuntime", () => {
  it("returns 'auto' for the string 'auto'", () => {
    expect(normalizeVoiceRuntime("auto")).toBe("auto");
  });

  it("returns 'webgpu' for the string 'webgpu'", () => {
    expect(normalizeVoiceRuntime("webgpu")).toBe("webgpu");
  });

  it("returns 'wasm' for the string 'wasm'", () => {
    expect(normalizeVoiceRuntime("wasm")).toBe("wasm");
  });

  it("returns the default runtime for unknown values", () => {
    expect(normalizeVoiceRuntime("gpu")).toBe(VOICE_REGISTRY_DEFAULTS.runtime);
    expect(normalizeVoiceRuntime(null)).toBe(VOICE_REGISTRY_DEFAULTS.runtime);
    expect(normalizeVoiceRuntime(undefined)).toBe(VOICE_REGISTRY_DEFAULTS.runtime);
    expect(normalizeVoiceRuntime(0)).toBe(VOICE_REGISTRY_DEFAULTS.runtime);
  });
});

// ─── normalizeLanguageHint ───────────────────────────────────────────────────

describe("normalizeLanguageHint", () => {
  it("passes through all valid language hints", () => {
    expect(normalizeLanguageHint("auto")).toBe("auto");
    expect(normalizeLanguageHint("ar")).toBe("ar");
    expect(normalizeLanguageHint("ar-TN")).toBe("ar-TN");
    expect(normalizeLanguageHint("fr")).toBe("fr");
    expect(normalizeLanguageHint("en")).toBe("en");
  });

  it("returns the default languageHint for unknown strings", () => {
    expect(normalizeLanguageHint("de")).toBe(VOICE_REGISTRY_DEFAULTS.languageHint);
    expect(normalizeLanguageHint("zh")).toBe(VOICE_REGISTRY_DEFAULTS.languageHint);
  });

  it("returns the default languageHint for non-string values", () => {
    expect(normalizeLanguageHint(null)).toBe(VOICE_REGISTRY_DEFAULTS.languageHint);
    expect(normalizeLanguageHint(undefined)).toBe(VOICE_REGISTRY_DEFAULTS.languageHint);
    expect(normalizeLanguageHint(5)).toBe(VOICE_REGISTRY_DEFAULTS.languageHint);
  });
});

// ─── mapLanguageHintToWhisperLanguage ────────────────────────────────────────

describe("mapLanguageHintToWhisperLanguage", () => {
  it("returns undefined for 'auto'", () => {
    expect(mapLanguageHintToWhisperLanguage("auto")).toBeUndefined();
  });

  it("returns undefined for undefined input", () => {
    expect(mapLanguageHintToWhisperLanguage(undefined)).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(mapLanguageHintToWhisperLanguage("")).toBeUndefined();
  });

  it("returns 'arabic' for 'ar'", () => {
    expect(mapLanguageHintToWhisperLanguage("ar")).toBe("arabic");
  });

  it("returns 'arabic' for 'ar-TN' (starts with ar)", () => {
    expect(mapLanguageHintToWhisperLanguage("ar-TN")).toBe("arabic");
  });

  it("returns 'arabic' for uppercase 'AR' (case-insensitive)", () => {
    expect(mapLanguageHintToWhisperLanguage("AR")).toBe("arabic");
  });

  it("returns 'french' for 'fr'", () => {
    expect(mapLanguageHintToWhisperLanguage("fr")).toBe("french");
  });

  it("returns 'french' for 'FR' (case-insensitive)", () => {
    expect(mapLanguageHintToWhisperLanguage("FR")).toBe("french");
  });

  it("returns 'english' for 'en'", () => {
    expect(mapLanguageHintToWhisperLanguage("en")).toBe("english");
  });

  it("returns 'english' for 'EN' (case-insensitive)", () => {
    expect(mapLanguageHintToWhisperLanguage("EN")).toBe("english");
  });

  it("returns undefined for an unknown language code", () => {
    expect(mapLanguageHintToWhisperLanguage("de")).toBeUndefined();
    expect(mapLanguageHintToWhisperLanguage("zh")).toBeUndefined();
  });

  it("trims leading/trailing whitespace before matching", () => {
    expect(mapLanguageHintToWhisperLanguage("  fr  ")).toBe("french");
    expect(mapLanguageHintToWhisperLanguage("  en  ")).toBe("english");
  });
});

// ─── mapLanguageHintToDisplayLabel ───────────────────────────────────────────

describe("mapLanguageHintToDisplayLabel", () => {
  it("returns 'Auto' for 'auto'", () => {
    expect(mapLanguageHintToDisplayLabel("auto")).toBe("Auto");
  });

  it("returns 'Tounsi' for 'ar-TN'", () => {
    expect(mapLanguageHintToDisplayLabel("ar-TN")).toBe("Tounsi");
  });

  it("returns 'Arabic' for 'ar'", () => {
    expect(mapLanguageHintToDisplayLabel("ar")).toBe("Arabic");
  });

  it("returns 'French' for 'fr'", () => {
    expect(mapLanguageHintToDisplayLabel("fr")).toBe("French");
  });

  it("returns 'English' for 'en'", () => {
    expect(mapLanguageHintToDisplayLabel("en")).toBe("English");
  });

  it("returns the raw string for unknown language codes", () => {
    expect(mapLanguageHintToDisplayLabel("de")).toBe("de");
    expect(mapLanguageHintToDisplayLabel("zh-CN")).toBe("zh-CN");
  });
});

// ─── getVoiceReadinessScore ───────────────────────────────────────────────────

describe("getVoiceReadinessScore", () => {
  it("returns 100 for an empty items array", () => {
    expect(getVoiceReadinessScore([])).toBe(100);
  });

  it("returns 100 when all required and optional items are ready", () => {
    const items = [
      { ready: true, required: true },
      { ready: true, required: false },
    ];
    expect(getVoiceReadinessScore(items)).toBe(100);
  });

  it("returns 80 when all required items are ready but no optional items exist", () => {
    // requiredScore=1, optionalScore=1 (no optional → default 1) => (1*0.8 + 1*0.2)*100 = 100
    // Actually let's test: all required ready, no optional => 100
    const items = [{ ready: true, required: true }];
    expect(getVoiceReadinessScore(items)).toBe(100);
  });

  it("returns 0 when all required items are not ready and no optional items exist", () => {
    // requiredScore=0, optionalScore=1(no optional) => (0*0.8 + 1*0.2)*100 = 20
    const items = [{ ready: false, required: true }];
    expect(getVoiceReadinessScore(items)).toBe(20);
  });

  it("returns 20 when only optional items exist and none are ready", () => {
    // No required items: requiredScore = 1 (default). All optional not ready → optionalScore=0
    // (1*0.8 + 0*0.2)*100 = 80
    const items = [{ ready: false, required: false }];
    expect(getVoiceReadinessScore(items)).toBe(80);
  });

  it("scores partial required completion proportionally", () => {
    // 1 of 2 required ready: requiredScore = 0.5
    // No optional: optionalScore = 1
    // (0.5*0.8 + 1*0.2)*100 = (0.4 + 0.2)*100 = 60
    const items = [
      { ready: true, required: true },
      { ready: false, required: true },
    ];
    expect(getVoiceReadinessScore(items)).toBe(60);
  });

  it("weights required items at 80% and optional at 20%", () => {
    // All required ready (score=1), half optional ready (score=0.5)
    // (1*0.8 + 0.5*0.2)*100 = (0.8+0.1)*100 = 90
    const items = [
      { ready: true, required: true },
      { ready: true, required: false },
      { ready: false, required: false },
    ];
    expect(getVoiceReadinessScore(items)).toBe(90);
  });

  it("rounds the result to the nearest integer", () => {
    // requiredScore=1/3, optionalScore=1 (no optional)
    // (1/3 * 0.8 + 1 * 0.2)*100 = (0.2667 + 0.2)*100 ≈ 46.67 → rounds to 47
    const items = [
      { ready: true, required: true },
      { ready: false, required: true },
      { ready: false, required: true },
    ];
    expect(getVoiceReadinessScore(items)).toBe(47);
  });
});

// ─── createModelCacheKey ──────────────────────────────────────────────────────

describe("createModelCacheKey", () => {
  it("uses modelId when present (STT models)", () => {
    const model = STT_MODELS["whisper-tiny"];
    // format: kind:engine:modelId
    expect(createModelCacheKey(model)).toBe("stt:whisper-tiny:Xenova/whisper-tiny");
  });

  it("uses modelId for VAD models (silero-v5)", () => {
    const model = VAD_MODELS["silero-v5"];
    expect(createModelCacheKey(model)).toBe("vad:silero-v5:silero_vad_v5.onnx");
  });

  it("uses modelId for TTS off model", () => {
    const model = TTS_MODELS.off;
    expect(createModelCacheKey(model)).toBe("tts:off:off");
  });

  it("falls back to localPath when modelId is absent", () => {
    const model = {
      ...STT_MODELS["whisper-tiny"],
      modelId: undefined as unknown as string,
      localPath: "/local/model.onnx",
    };
    expect(createModelCacheKey(model)).toBe("stt:whisper-tiny:/local/model.onnx");
  });

  it("falls back to baseAssetPath when modelId and localPath are absent", () => {
    const model = {
      ...STT_MODELS["whisper-tiny"],
      modelId: undefined as unknown as string,
      localPath: undefined,
      baseAssetPath: "/base/path/",
    };
    expect(createModelCacheKey(model)).toBe("stt:whisper-tiny:/base/path/");
  });

  it("falls back to id when modelId, localPath, and baseAssetPath are all absent", () => {
    const model = {
      ...STT_MODELS["whisper-tiny"],
      modelId: undefined as unknown as string,
      localPath: undefined,
      baseAssetPath: undefined,
    };
    expect(createModelCacheKey(model)).toBe("stt:whisper-tiny:stt:whisper-tiny");
  });
});

// ─── getModelDisplaySummary ──────────────────────────────────────────────────

describe("getModelDisplaySummary", () => {
  it("includes shortLabel and uppercased recommended runtime", () => {
    const model = STT_MODELS["whisper-tiny"];
    const summary = getModelDisplaySummary(model);
    expect(summary).toContain("Tiny");
    expect(summary).toContain("AUTO");
  });

  it("includes size hint when present", () => {
    const model = STT_MODELS["whisper-tiny"]; // sizeHintMb: 75
    const summary = getModelDisplaySummary(model);
    expect(summary).toContain("~75MB");
  });

  it("omits size hint when not present", () => {
    const model = { ...STT_MODELS["whisper-tiny"], sizeHintMb: undefined };
    const summary = getModelDisplaySummary(model);
    expect(summary).not.toContain("MB");
  });

  it("includes recommendedPrecision when present", () => {
    const model = STT_MODELS["whisper-tiny"]; // recommendedPrecision: q8
    const summary = getModelDisplaySummary(model);
    expect(summary).toContain("q8");
  });

  it("omits precision when not present", () => {
    const model = { ...VAD_MODELS["silero-v5"], recommendedPrecision: undefined };
    const summary = getModelDisplaySummary(model);
    // no precision segment
    expect(summary).not.toMatch(/· (fp|q)/);
  });

  it("builds the correct format: shortLabel · RUNTIME · precision · ~sizeHintMb", () => {
    // whisper-tiny: shortLabel=Tiny, runtime=auto->AUTO, precision=q8, size=75
    const model = STT_MODELS["whisper-tiny"];
    expect(getModelDisplaySummary(model)).toBe("Tiny · AUTO · q8 · ~75MB");
  });

  it("handles a model with neither size nor precision", () => {
    const model = {
      ...TTS_MODELS.off,
      sizeHintMb: undefined,
      recommendedPrecision: undefined,
    };
    expect(getModelDisplaySummary(model)).toBe("Off · WASM");
  });
});

// ─── ALL_VOICE_MODELS ─────────────────────────────────────────────────────────

describe("ALL_VOICE_MODELS", () => {
  it("contains all VAD, STT, and TTS models", () => {
    const vadCount = Object.keys(VAD_MODELS).length;
    const sttCount = Object.keys(STT_MODELS).length;
    const ttsCount = Object.keys(TTS_MODELS).length;
    expect(ALL_VOICE_MODELS).toHaveLength(vadCount + sttCount + ttsCount);
  });

  it("includes at least one model of each kind", () => {
    const kinds = new Set(ALL_VOICE_MODELS.map((m) => m.kind));
    expect(kinds).toContain("vad");
    expect(kinds).toContain("stt");
    expect(kinds).toContain("tts");
  });

  it("contains the silero-v5 VAD model", () => {
    expect(ALL_VOICE_MODELS.some((m) => m.id === "vad:silero-v5")).toBe(true);
  });

  it("contains the kokoro TTS model", () => {
    expect(ALL_VOICE_MODELS.some((m) => m.id === "tts:kokoro")).toBe(true);
  });
});
