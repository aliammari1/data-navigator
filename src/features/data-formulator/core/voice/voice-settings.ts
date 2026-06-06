"use client";

/**
 * Voice Settings
 *
 * Single persistent settings layer for the full voice-agent stack.
 *
 * Used by:
 * - voice-button.tsx
 * - voice-vad-service.ts
 * - voice-stt-worker.ts
 * - voice-tts-worker.ts
 * - voice-settings-panel.tsx
 * - voice-debug-panel.tsx
 *
 * Storage:
 * - Drizzle app_setting row: namespace="voice", key="settings"
 * - localStorage["moudir_voice_settings"] as the synchronous browser cache
 */

import {
  getEnabledSttEngines,
  getEnabledTtsEngines,
  KOKORO_VOICES,
  normalizeLanguageHint,
  normalizeSttEngine,
  normalizeTtsEngine,
  normalizeVoiceRuntime,
  type SpeakMode,
  type SttEngine,
  type TtsEngine,
  VOICE_REGISTRY_DEFAULTS,
  type VoiceLanguageHint,
  type VoiceRuntime,
} from "./voice-model-registry";

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

export type VoiceMode = "hold-to-talk" | "push-to-talk" | "auto-vad";

export type VoiceInteractionMode = VoiceMode;

export type VoiceOutputMode = "text-only" | "speak-summary" | "speak-full";

export type VoiceTranscriptBehavior = "review" | "auto-submit" | "silent-submit";

export type VoiceDebugLevel = "off" | "errors" | "normal" | "verbose";

export type VoiceSettingsEventType = "loaded" | "saved" | "updated" | "reset" | "migrated";

export interface VoiceSettings {
  /**
   * Schema version for safe migrations.
   */
  version: number;

  /**
   * Voice input mode.
   */
  mode: VoiceMode;

  /**
   * VAD engine sensitivity.
   * 0 = least sensitive, 1 = most sensitive.
   */
  vadSensitivity: number;

  /**
   * Enable VAD speech segmentation.
   * Should normally stay true when using @ricky0123/vad-web.
   */
  vadEnabled: boolean;

  /**
   * Allow speech during TTS playback to interrupt the assistant.
   */
  bargeInEnabled: boolean;

  /**
   * Max time for one voice command.
   */
  maxRecordingMs: number;

  /**
   * Minimum valid speech duration.
   */
  minSpeechMs: number;

  /**
   * Silence duration before auto-ending speech.
   */
  silenceTimeoutMs: number;

  /**
   * Optional microphone device id from enumerateDevices().
   */
  inputDeviceId: string | null;

  /**
   * Language hint passed to VAD/STT/router.
   */
  languageHint: VoiceLanguageHint;

  /**
   * Speech-to-text engine.
   */
  sttEngine: SttEngine;

  /**
   * STT runtime preference.
   */
  sttRuntime: VoiceRuntime;

  /**
   * Load STT model at startup.
   */
  preloadSttModel: boolean;

  /**
   * Let STT worker download/cache models from HF/browser cache.
   * Set false only for packaged fully-offline local model paths.
   */
  allowRemoteSttModels: boolean;

  /**
   * Optional local model root for packaged offline builds.
   */
  localSttModelPath: string | null;

  /**
   * Show transcript editor before routing.
   */
  showTranscript: boolean;

  /**
   * Auto-route transcript after STT.
   */
  autoSubmit: boolean;

  /**
   * Save local transcript history for debugging and UX.
   */
  saveTranscriptHistory: boolean;

  /**
   * Show intent/tool-call preview after routing.
   */
  showToolPreview: boolean;

  /**
   * Require confirmation before mutating tool calls.
   */
  requireToolConfirmation: boolean;

  /**
   * Text-to-speech engine.
   */
  ttsEngine: TtsEngine;

  /**
   * TTS runtime preference.
   */
  ttsRuntime: VoiceRuntime;

  /**
   * TTS speaking behavior.
   */
  speakMode: SpeakMode;

  /**
   * Automatically play TTS once audio is generated.
   */
  autoPlayTts: boolean;

  /**
   * TTS voice id.
   */
  ttsVoice: string;

  /**
   * TTS speed multiplier.
   */
  ttsSpeed: number;

  /**
   * Preload TTS model at startup.
   */
  preloadTtsModel: boolean;

  /**
   * Optional local model root for packaged offline TTS.
   */
  localTtsModelPath: string | null;

  /**
   * Show voice journey / AG-UI event timeline.
   */
  showJourney: boolean;

  /**
   * Show voice debug panel.
   */
  debugEnabled: boolean;

  /**
   * Debug verbosity.
   */
  debugLevel: VoiceDebugLevel;

  /**
   * Emit noisy per-frame VAD events.
   */
  emitVadFrameEvents: boolean;

  /**
   * Timestamp of last settings update.
   */
  updatedAt: number;
}

export interface VoiceSettingsSnapshot {
  settings: VoiceSettings;
  source: "defaults" | "storage" | "migration" | "memory";
  loadedAt: number;
}

export interface VoiceSettingsChangeEvent {
  type: VoiceSettingsEventType;
  settings: VoiceSettings;
  previousSettings?: VoiceSettings;
}

export interface VoiceSettingsPreset {
  id: string;
  label: string;
  description: string;
  settings: Partial<VoiceSettings>;
}

/**
 * Backward-compatible aliases for older code.
 */
export type SttEngineLegacy =
  | "whisper-tiny"
  | "whisper-base"
  | "whisper-small"
  | "whisper-multilingual"
  | "whisper-tunisian"
  | "moonshine";

export type VoiceLanguageHintLegacy = VoiceLanguageHint | "tounsi" | "ar-SA" | "fr-FR" | "en-US";

/* Re-export central registry types for convenience. */
export type { SpeakMode, SttEngine, TtsEngine, VoiceLanguageHint, VoiceRuntime };

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

export const VOICE_SETTINGS_STORAGE_KEY = "moudir_voice_settings";

export const VOICE_SETTINGS_NAMESPACE = "voice";

export const VOICE_SETTINGS_DB_KEY = "settings";

export const VOICE_SETTINGS_EVENT_NAME = "moudir_voice_settings_changed";

export const VOICE_SETTINGS_VERSION = 3;

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  version: VOICE_SETTINGS_VERSION,

  mode: "hold-to-talk",

  vadSensitivity: 0.55,
  vadEnabled: true,
  bargeInEnabled: true,
  maxRecordingMs: 12_000,
  minSpeechMs: 350,
  silenceTimeoutMs: 900,
  inputDeviceId: null,

  languageHint: VOICE_REGISTRY_DEFAULTS.languageHint,

  sttEngine: VOICE_REGISTRY_DEFAULTS.sttEngine,
  sttRuntime: VOICE_REGISTRY_DEFAULTS.runtime,
  preloadSttModel: true,
  allowRemoteSttModels: true,
  localSttModelPath: null,

  showTranscript: true,
  autoSubmit: false,
  saveTranscriptHistory: true,
  showToolPreview: true,
  requireToolConfirmation: true,

  ttsEngine: VOICE_REGISTRY_DEFAULTS.ttsEngine,
  ttsRuntime: VOICE_REGISTRY_DEFAULTS.runtime,
  speakMode: VOICE_REGISTRY_DEFAULTS.speakMode,
  autoPlayTts: true,
  ttsVoice: VOICE_REGISTRY_DEFAULTS.ttsVoice,
  ttsSpeed: VOICE_REGISTRY_DEFAULTS.ttsSpeed,
  preloadTtsModel: false,
  localTtsModelPath: null,

  showJourney: true,
  debugEnabled: false,
  debugLevel: "errors",
  emitVadFrameEvents: false,

  updatedAt: Date.now(),
};

/**
 * Presets exposed by the UI.
 */
export const VOICE_SETTINGS_PRESETS: VoiceSettingsPreset[] = [
  {
    id: "safe-review",
    label: "Safe review",
    description: "Best default: hold to talk, review transcript, preview tool call.",
    settings: {
      mode: "hold-to-talk",
      autoSubmit: false,
      showTranscript: true,
      showToolPreview: true,
      requireToolConfirmation: true,
      speakMode: "summary",
      autoPlayTts: true,
      debugEnabled: false,
    },
  },
  {
    id: "fast-command",
    label: "Fast command",
    description: "Push-to-talk with auto-submit for quick commands.",
    settings: {
      mode: "push-to-talk",
      autoSubmit: true,
      showTranscript: false,
      showToolPreview: true,
      requireToolConfirmation: true,
      silenceTimeoutMs: 700,
      minSpeechMs: 300,
      speakMode: "summary",
    },
  },
  {
    id: "hands-free",
    label: "Hands-free",
    description: "Auto-VAD mode with transcript review and TTS summary.",
    settings: {
      mode: "auto-vad",
      autoSubmit: false,
      showTranscript: true,
      silenceTimeoutMs: 900,
      minSpeechMs: 350,
      speakMode: "summary",
      autoPlayTts: true,
    },
  },
  {
    id: "debug",
    label: "Debug",
    description: "Verbose diagnostics for testing the voice pipeline.",
    settings: {
      mode: "hold-to-talk",
      autoSubmit: false,
      showTranscript: true,
      showToolPreview: true,
      debugEnabled: true,
      debugLevel: "verbose",
      emitVadFrameEvents: true,
      saveTranscriptHistory: true,
    },
  },
  {
    id: "text-only",
    label: "Text only",
    description: "Voice input enabled, TTS disabled.",
    settings: {
      ttsEngine: "off",
      speakMode: "off",
      autoPlayTts: false,
    },
  },
];

/* ------------------------------------------------------------------ */
/*  Environment helpers                                                */
/* ------------------------------------------------------------------ */

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function canUseSettingsApi(): boolean {
  return typeof window !== "undefined" && typeof fetch !== "undefined";
}

function now(): number {
  return Date.now();
}

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function getVoiceSettingsApiPath(): string {
  return `/api/settings/${encodeURIComponent(VOICE_SETTINGS_NAMESPACE)}/${encodeURIComponent(
    VOICE_SETTINGS_DB_KEY,
  )}`;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}

function normalizeNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();

  return trimmed ? trimmed : null;
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeVoiceMode(value: unknown): VoiceMode {
  if (value === "hold-to-talk" || value === "push-to-talk" || value === "auto-vad") {
    return value;
  }

  /**
   * Legacy naming from earlier iterations.
   */
  if (value === "push") return "push-to-talk";
  if (value === "hold") return "hold-to-talk";
  if (value === "continuous") return "auto-vad";

  return DEFAULT_VOICE_SETTINGS.mode;
}

function normalizeDebugLevel(value: unknown): VoiceDebugLevel {
  if (value === "off" || value === "errors" || value === "normal" || value === "verbose") {
    return value;
  }

  return DEFAULT_VOICE_SETTINGS.debugLevel;
}

function normalizeSpeakMode(value: unknown): SpeakMode {
  if (value === "off" || value === "summary" || value === "full") {
    return value;
  }

  /**
   * Legacy / UI aliases.
   */
  if (value === "text-only") return "off";
  if (value === "speak-summary") return "summary";
  if (value === "speak-full") return "full";

  return DEFAULT_VOICE_SETTINGS.speakMode;
}

function normalizeTtsVoice(value: unknown): string {
  const normalized = normalizeNullableString(value);

  if (!normalized) {
    return DEFAULT_VOICE_SETTINGS.ttsVoice;
  }

  const knownVoice = KOKORO_VOICES.some((voice) => voice.id === normalized);

  return knownVoice ? normalized : normalized;
}

function normalizeLegacyLanguageHint(value: unknown): VoiceLanguageHint {
  if (value === "tounsi" || value === "ar-TN") return "ar-TN";
  if (value === "ar-SA") return "ar";
  if (value === "fr-FR") return "fr";
  if (value === "en-US") return "en";

  return normalizeLanguageHint(value);
}

/**
 * Some earlier code used old keys:
 * - sttEngine: "whisper-multilingual"
 * - sttEngine: "whisper-tunisian"
 * - minRecordingMs
 * - languageHint: "tounsi"
 */
function migrateRawSettings(raw: Record<string, unknown>): Partial<VoiceSettings> {
  const migrated: Record<string, unknown> = { ...raw };

  if ("minRecordingMs" in migrated && !("minSpeechMs" in migrated)) {
    migrated.minSpeechMs = migrated.minRecordingMs;
  }

  if ("silenceHangoverMs" in migrated && !("silenceTimeoutMs" in migrated)) {
    migrated.silenceTimeoutMs = migrated.silenceHangoverMs;
  }

  if ("voiceMode" in migrated && !("mode" in migrated)) {
    migrated.mode = migrated.voiceMode;
  }

  if ("ttsEnabled" in migrated && !("speakMode" in migrated)) {
    migrated.speakMode = migrated.ttsEnabled ? "summary" : "off";
  }

  if ("outputMode" in migrated && !("speakMode" in migrated)) {
    migrated.speakMode = migrated.outputMode;
  }

  return migrated as Partial<VoiceSettings>;
}

/* ------------------------------------------------------------------ */
/*  Validation                                                         */
/* ------------------------------------------------------------------ */

export function normalizeVoiceSettings(
  input: Partial<VoiceSettings> | Record<string, unknown> | null | undefined,
): VoiceSettings {
  const raw = migrateRawSettings(input ? { ...input } : {});

  const next: VoiceSettings = {
    ...DEFAULT_VOICE_SETTINGS,

    version: VOICE_SETTINGS_VERSION,

    mode: normalizeVoiceMode(raw.mode),

    vadSensitivity: clampNumber(raw.vadSensitivity, 0, 1, DEFAULT_VOICE_SETTINGS.vadSensitivity),
    vadEnabled: normalizeBoolean(raw.vadEnabled, DEFAULT_VOICE_SETTINGS.vadEnabled),
    bargeInEnabled: normalizeBoolean(raw.bargeInEnabled, DEFAULT_VOICE_SETTINGS.bargeInEnabled),
    maxRecordingMs: clampNumber(
      raw.maxRecordingMs,
      3_000,
      120_000,
      DEFAULT_VOICE_SETTINGS.maxRecordingMs,
    ),
    minSpeechMs: clampNumber(raw.minSpeechMs, 150, 3_000, DEFAULT_VOICE_SETTINGS.minSpeechMs),
    silenceTimeoutMs: clampNumber(
      raw.silenceTimeoutMs,
      250,
      10_000,
      DEFAULT_VOICE_SETTINGS.silenceTimeoutMs,
    ),
    inputDeviceId: normalizeNullableString(raw.inputDeviceId),

    languageHint: normalizeLegacyLanguageHint(raw.languageHint),

    sttEngine: normalizeSttEngine(raw.sttEngine),
    sttRuntime: normalizeVoiceRuntime(raw.sttRuntime),
    preloadSttModel: normalizeBoolean(raw.preloadSttModel, DEFAULT_VOICE_SETTINGS.preloadSttModel),
    allowRemoteSttModels: normalizeBoolean(
      raw.allowRemoteSttModels,
      DEFAULT_VOICE_SETTINGS.allowRemoteSttModels,
    ),
    localSttModelPath: normalizeNullableString(raw.localSttModelPath),

    showTranscript: normalizeBoolean(raw.showTranscript, DEFAULT_VOICE_SETTINGS.showTranscript),
    autoSubmit: normalizeBoolean(raw.autoSubmit, DEFAULT_VOICE_SETTINGS.autoSubmit),
    saveTranscriptHistory: normalizeBoolean(
      raw.saveTranscriptHistory,
      DEFAULT_VOICE_SETTINGS.saveTranscriptHistory,
    ),
    showToolPreview: normalizeBoolean(raw.showToolPreview, DEFAULT_VOICE_SETTINGS.showToolPreview),
    requireToolConfirmation: normalizeBoolean(
      raw.requireToolConfirmation,
      DEFAULT_VOICE_SETTINGS.requireToolConfirmation,
    ),

    ttsEngine: normalizeTtsEngine(raw.ttsEngine),
    ttsRuntime: normalizeVoiceRuntime(raw.ttsRuntime),
    speakMode: normalizeSpeakMode(raw.speakMode),
    autoPlayTts: normalizeBoolean(raw.autoPlayTts, DEFAULT_VOICE_SETTINGS.autoPlayTts),
    ttsVoice: normalizeTtsVoice(raw.ttsVoice),
    ttsSpeed: clampNumber(raw.ttsSpeed, 0.5, 2, DEFAULT_VOICE_SETTINGS.ttsSpeed),
    preloadTtsModel: normalizeBoolean(raw.preloadTtsModel, DEFAULT_VOICE_SETTINGS.preloadTtsModel),
    localTtsModelPath: normalizeNullableString(raw.localTtsModelPath),

    showJourney: normalizeBoolean(raw.showJourney, DEFAULT_VOICE_SETTINGS.showJourney),
    debugEnabled: normalizeBoolean(raw.debugEnabled, DEFAULT_VOICE_SETTINGS.debugEnabled),
    debugLevel: normalizeDebugLevel(raw.debugLevel),
    emitVadFrameEvents: normalizeBoolean(
      raw.emitVadFrameEvents,
      DEFAULT_VOICE_SETTINGS.emitVadFrameEvents,
    ),

    updatedAt:
      typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt) ? raw.updatedAt : now(),
  };

  /**
   * If autoSubmit is enabled, transcript review should usually be hidden.
   */
  if (next.autoSubmit) {
    next.showTranscript = false;
  }

  /**
   * If TTS engine is off, speak mode must be off.
   */
  if (next.ttsEngine === "off") {
    next.speakMode = "off";
    next.autoPlayTts = false;
  }

  /**
   * Prevent impossible timing: minimum speech cannot exceed max recording.
   */
  if (next.minSpeechMs >= next.maxRecordingMs) {
    next.minSpeechMs = Math.min(1_000, Math.floor(next.maxRecordingMs / 3));
  }

  return next;
}

export function validateVoiceSettings(settings: VoiceSettings): {
  valid: boolean;
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];

  const enabledStt = getEnabledSttEngines();

  if (!enabledStt.includes(settings.sttEngine)) {
    warnings.push(`STT engine "${settings.sttEngine}" is registered but not marked enabled.`);
  }

  const enabledTts = getEnabledTtsEngines();

  if (!enabledTts.includes(settings.ttsEngine)) {
    warnings.push(`TTS engine "${settings.ttsEngine}" is registered but not marked enabled.`);
  }

  if (settings.mode === "auto-vad" && !settings.vadEnabled) {
    errors.push("Auto-VAD mode requires vadEnabled=true.");
  }

  if (settings.speakMode !== "off" && settings.ttsEngine === "off") {
    errors.push("speakMode requires a TTS engine other than off.");
  }

  if (settings.autoSubmit && settings.showTranscript) {
    warnings.push("autoSubmit=true usually ignores showTranscript=true.");
  }

  if (settings.debugLevel === "verbose" && !settings.debugEnabled) {
    warnings.push("debugLevel=verbose has no effect while debugEnabled=false.");
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

/* ------------------------------------------------------------------ */
/*  Storage                                                            */
/* ------------------------------------------------------------------ */

export function getDefaultVoiceSettings(): VoiceSettings {
  return {
    ...DEFAULT_VOICE_SETTINGS,
    updatedAt: now(),
  };
}

let remoteHydrationStarted = false;

function writeCachedVoiceSettings(settings: VoiceSettings): void {
  if (!isBrowser()) return;

  window.localStorage.setItem(VOICE_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

function readCachedVoiceSettings(): Record<string, unknown> | null {
  if (!isBrowser()) return null;

  return safeJsonParse<Record<string, unknown> | null>(
    window.localStorage.getItem(VOICE_SETTINGS_STORAGE_KEY),
    null,
  );
}

function persistVoiceSettingsToDatabase(settings: VoiceSettings): void {
  if (!canUseSettingsApi()) return;

  void fetch(getVoiceSettingsApiPath(), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ value: settings }),
  }).catch((error) => {
    console.warn("[voice-settings] failed to persist settings to database", error);
  });
}

function deleteVoiceSettingsFromDatabase(): void {
  if (!canUseSettingsApi()) return;

  void fetch(getVoiceSettingsApiPath(), {
    method: "DELETE",
  }).catch((error) => {
    console.warn("[voice-settings] failed to delete settings from database", error);
  });
}

export async function loadVoiceSettingsFromDatabase(): Promise<VoiceSettings | null> {
  if (!canUseSettingsApi()) return null;

  const response = await fetch(getVoiceSettingsApiPath(), {
    method: "GET",
  });

  if (response.status === 404) return null;

  if (!response.ok) {
    throw new Error(`Failed to load voice settings from database: ${response.status}`);
  }

  const payload = (await response.json()) as { value?: Record<string, unknown> | null };
  if (!payload.value) return null;

  return normalizeVoiceSettings(payload.value);
}

export async function hydrateVoiceSettingsFromDatabase(): Promise<VoiceSettings | null> {
  const remote = await loadVoiceSettingsFromDatabase();
  if (!remote) return null;

  const cachedRaw = readCachedVoiceSettings();
  const current = cachedRaw ? normalizeVoiceSettings(cachedRaw) : null;

  if (current && remote.updatedAt < current.updatedAt) {
    persistVoiceSettingsToDatabase(current);
    return current;
  }

  writeCachedVoiceSettings(remote);

  if (!current || JSON.stringify(remote) !== JSON.stringify(current)) {
    dispatchVoiceSettingsChanged({
      type: "loaded",
      settings: remote,
      previousSettings: current ?? getDefaultVoiceSettings(),
    });
  }

  return remote;
}

function ensureVoiceSettingsHydratedFromDatabase(): void {
  if (remoteHydrationStarted || !canUseSettingsApi()) return;

  remoteHydrationStarted = true;
  void hydrateVoiceSettingsFromDatabase().catch((error) => {
    console.warn("[voice-settings] failed to hydrate settings from database", error);
  });
}

export function loadVoiceSettingsSnapshot(): VoiceSettingsSnapshot {
  if (!isBrowser()) {
    return {
      settings: getDefaultVoiceSettings(),
      source: "defaults",
      loadedAt: now(),
    };
  }

  const raw = readCachedVoiceSettings();

  if (!raw) {
    ensureVoiceSettingsHydratedFromDatabase();

    return {
      settings: getDefaultVoiceSettings(),
      source: "defaults",
      loadedAt: now(),
    };
  }

  const normalized = normalizeVoiceSettings(raw);
  const migrated = raw.version !== VOICE_SETTINGS_VERSION;

  if (migrated) {
    writeCachedVoiceSettings(normalized);
  }

  persistVoiceSettingsToDatabase(normalized);
  ensureVoiceSettingsHydratedFromDatabase();

  return {
    settings: normalized,
    source: migrated ? "migration" : "storage",
    loadedAt: now(),
  };
}

export function loadVoiceSettings(): VoiceSettings {
  return loadVoiceSettingsSnapshot().settings;
}

export function saveVoiceSettings(
  settings: VoiceSettings | Partial<VoiceSettings>,
  options: {
    eventType?: VoiceSettingsEventType;
    dispatch?: boolean;
  } = {},
): VoiceSettings {
  const previousSettings = loadVoiceSettings();
  const normalized = normalizeVoiceSettings({
    ...previousSettings,
    ...settings,
    updatedAt: now(),
  });

  writeCachedVoiceSettings(normalized);
  persistVoiceSettingsToDatabase(normalized);

  if (isBrowser()) {
    if (options.dispatch ?? true) {
      dispatchVoiceSettingsChanged({
        type: options.eventType ?? "saved",
        settings: normalized,
        previousSettings,
      });
    }
  }

  return normalized;
}

export function updateVoiceSettings(patch: Partial<VoiceSettings>): VoiceSettings {
  const current = loadVoiceSettings();

  return saveVoiceSettings(
    {
      ...current,
      ...patch,
      updatedAt: now(),
    },
    {
      eventType: "updated",
      dispatch: true,
    },
  );
}

export function resetVoiceSettings(): VoiceSettings {
  const previousSettings = loadVoiceSettings();
  const next = getDefaultVoiceSettings();

  writeCachedVoiceSettings(next);
  persistVoiceSettingsToDatabase(next);

  if (isBrowser()) {
    dispatchVoiceSettingsChanged({
      type: "reset",
      settings: next,
      previousSettings,
    });
  }

  return next;
}

export function clearVoiceSettings(): void {
  if (!isBrowser()) return;

  const previousSettings = loadVoiceSettings();

  window.localStorage.removeItem(VOICE_SETTINGS_STORAGE_KEY);
  deleteVoiceSettingsFromDatabase();

  dispatchVoiceSettingsChanged({
    type: "reset",
    settings: getDefaultVoiceSettings(),
    previousSettings,
  });
}

/* ------------------------------------------------------------------ */
/*  Events / subscriptions                                             */
/* ------------------------------------------------------------------ */

export function dispatchVoiceSettingsChanged(event: VoiceSettingsChangeEvent): void {
  if (!isBrowser()) return;

  globalThis.window.dispatchEvent(
    new CustomEvent<VoiceSettingsChangeEvent>(VOICE_SETTINGS_EVENT_NAME, {
      detail: event,
    }),
  );
}

export function subscribeVoiceSettings(
  listener: (event: VoiceSettingsChangeEvent) => void,
): () => void {
  if (!isBrowser()) {
    return () => {};
  }

  const handleLocalEvent = (event: Event) => {
    const customEvent = event as CustomEvent<VoiceSettingsChangeEvent>;
    listener(customEvent.detail);
  };

  const handleStorageEvent = (event: StorageEvent) => {
    if (event.key && event.key !== VOICE_SETTINGS_STORAGE_KEY) return;

    listener({
      type: "loaded",
      settings: loadVoiceSettings(),
    });
  };

  globalThis.window.addEventListener(VOICE_SETTINGS_EVENT_NAME, handleLocalEvent);
  globalThis.window.addEventListener("storage", handleStorageEvent);

  return () => {
    globalThis.window.removeEventListener(VOICE_SETTINGS_EVENT_NAME, handleLocalEvent);
    globalThis.window.removeEventListener("storage", handleStorageEvent);
  };
}

/* ------------------------------------------------------------------ */
/*  Presets                                                            */
/* ------------------------------------------------------------------ */

export function applyVoiceSettingsPreset(presetId: string): VoiceSettings {
  const preset = VOICE_SETTINGS_PRESETS.find((item) => item.id === presetId);

  if (!preset) {
    throw new Error(`Unknown voice settings preset: ${presetId}`);
  }

  return updateVoiceSettings(preset.settings);
}

export function getVoiceSettingsPreset(presetId: string): VoiceSettingsPreset | null {
  return VOICE_SETTINGS_PRESETS.find((item) => item.id === presetId) ?? null;
}

/* ------------------------------------------------------------------ */
/*  Derived helpers                                                    */
/* ------------------------------------------------------------------ */

export function getVoiceOutputMode(settings: VoiceSettings): VoiceOutputMode {
  if (settings.ttsEngine === "off" || settings.speakMode === "off") {
    return "text-only";
  }

  if (settings.speakMode === "summary") {
    return "speak-summary";
  }

  return "speak-full";
}

export function getTranscriptBehavior(settings: VoiceSettings): VoiceTranscriptBehavior {
  if (settings.autoSubmit && settings.showTranscript) {
    return "auto-submit";
  }

  if (settings.autoSubmit && !settings.showTranscript) {
    return "silent-submit";
  }

  return "review";
}

export function getVadThresholdsFromSensitivity(settings: VoiceSettings): {
  positiveSpeechThreshold: number;
  negativeSpeechThreshold: number;
} {
  /**
   * @ricky0123/vad-web uses positive/negative thresholds.
   * Higher positive threshold = stricter detection.
   *
   * Our vadSensitivity does the opposite:
   * higher sensitivity = easier speech detection.
   */
  const sensitivity = Math.min(1, Math.max(0, settings.vadSensitivity));

  const positiveSpeechThreshold = 0.75 - sensitivity * 0.35;
  const negativeSpeechThreshold = Math.max(0.15, positiveSpeechThreshold - 0.15);

  return {
    positiveSpeechThreshold: Math.round(positiveSpeechThreshold * 100) / 100,
    negativeSpeechThreshold: Math.round(negativeSpeechThreshold * 100) / 100,
  };
}

export function getVadFrameSettings(settings: VoiceSettings): {
  redemptionFrames: number;
  preSpeechPadFrames: number;
  minSpeechFrames: number;
} {
  /**
   * VAD frame duration is usually 32ms internally for Silero-style configs.
   * Keep this approximate and user-friendly.
   */
  const frameMs = 32;

  return {
    redemptionFrames: Math.max(4, Math.round(settings.silenceTimeoutMs / frameMs)),
    preSpeechPadFrames: 10,
    minSpeechFrames: Math.max(3, Math.round(settings.minSpeechMs / frameMs)),
  };
}

export function shouldAutoStartVad(settings: VoiceSettings): boolean {
  return settings.mode === "auto-vad";
}

export function shouldStopOnPointerUp(settings: VoiceSettings): boolean {
  return settings.mode === "hold-to-talk";
}

export function shouldToggleOnPointerDown(settings: VoiceSettings): boolean {
  return settings.mode === "push-to-talk";
}

export function shouldReviewTranscript(settings: VoiceSettings): boolean {
  return getTranscriptBehavior(settings) === "review";
}

export function shouldSpeakAssistantResponse(settings: VoiceSettings): boolean {
  return settings.ttsEngine !== "off" && settings.speakMode !== "off";
}

export function getVoiceSettingsSummary(settings: VoiceSettings): string {
  const output = getVoiceOutputMode(settings);

  return [
    settings.mode,
    settings.languageHint,
    settings.sttEngine,
    settings.sttRuntime,
    output,
    settings.debugEnabled ? `debug:${settings.debugLevel}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function createVoiceWorkerSettingsPayload(settings: VoiceSettings): {
  vad: {
    mode: VoiceMode;
    vadEnabled: boolean;
    bargeInEnabled: boolean;
    inputDeviceId: string | null;
    maxRecordingMs: number;
    silenceTimeoutMs: number;
    minSpeechMs: number;
    emitFrameEvents: boolean;
    positiveSpeechThreshold: number;
    negativeSpeechThreshold: number;
    redemptionFrames: number;
    preSpeechPadFrames: number;
    minSpeechFrames: number;
  };
  stt: {
    engine: SttEngine;
    runtime: VoiceRuntime;
    language: VoiceLanguageHint;
    allowRemoteModels: boolean;
    localModelPath: string | null;
  };
  tts: {
    engine: TtsEngine;
    runtime: VoiceRuntime;
    voice: string;
    speed: number;
    speakMode: SpeakMode;
    autoPlay: boolean;
    localModelPath: string | null;
  };
} {
  const thresholds = getVadThresholdsFromSensitivity(settings);
  const frameSettings = getVadFrameSettings(settings);

  return {
    vad: {
      mode: settings.mode,
      vadEnabled: settings.vadEnabled,
      bargeInEnabled: settings.bargeInEnabled,
      inputDeviceId: settings.inputDeviceId,
      maxRecordingMs: settings.maxRecordingMs,
      silenceTimeoutMs: settings.silenceTimeoutMs,
      minSpeechMs: settings.minSpeechMs,
      emitFrameEvents: settings.emitVadFrameEvents,
      ...thresholds,
      ...frameSettings,
    },
    stt: {
      engine: settings.sttEngine,
      runtime: settings.sttRuntime,
      language: settings.languageHint,
      allowRemoteModels: settings.allowRemoteSttModels,
      localModelPath: settings.localSttModelPath,
    },
    tts: {
      engine: settings.ttsEngine,
      runtime: settings.ttsRuntime,
      voice: settings.ttsVoice,
      speed: settings.ttsSpeed,
      speakMode: settings.speakMode,
      autoPlay: settings.autoPlayTts,
      localModelPath: settings.localTtsModelPath,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Import/export helpers                                              */
/* ------------------------------------------------------------------ */

export function exportVoiceSettings(): string {
  return JSON.stringify(loadVoiceSettings(), null, 2);
}

export async function exportVoiceSettingsFromDatabase(): Promise<string> {
  const settings = (await hydrateVoiceSettingsFromDatabase()) ?? loadVoiceSettings();
  return JSON.stringify(settings, null, 2);
}

export function importVoiceSettings(json: string): VoiceSettings {
  const parsed = safeJsonParse<Record<string, unknown> | null>(json, null);

  if (!parsed) {
    throw new Error("Invalid voice settings JSON.");
  }

  return saveVoiceSettings(normalizeVoiceSettings(parsed), {
    eventType: "updated",
    dispatch: true,
  });
}
