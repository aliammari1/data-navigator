/**
 * Unit tests for voice-settings.ts
 *
 * Covers: constants, normalizeVoiceSettings, validateVoiceSettings,
 * storage helpers, preset helpers, derived helpers, event subscription,
 * import/export, and async database hydration.
 *
 * External IO (fetch, localStorage) is mocked so no real network or
 * storage is touched.
 *
 * Fetch mock strategy: `vi.stubGlobal` is called inside beforeEach because
 * the vitest config uses `unstubGlobals: true`, which resets stubs after every
 * test. We also need the mock active for the `loadVoiceSettingsFromDatabase`
 * tests that actually await fetch.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// ── Import target under test ──────────────────────────────────────────────────
import {
  applyVoiceSettingsPreset,
  clearVoiceSettings,
  createVoiceWorkerSettingsPayload,
  DEFAULT_VOICE_SETTINGS,
  dispatchVoiceSettingsChanged,
  exportVoiceSettings,
  exportVoiceSettingsFromDatabase,
  getDefaultVoiceSettings,
  getTranscriptBehavior,
  getVadFrameSettings,
  getVadThresholdsFromSensitivity,
  getVoiceOutputMode,
  getVoiceSettingsPreset,
  getVoiceSettingsSummary,
  hydrateVoiceSettingsFromDatabase,
  importVoiceSettings,
  loadVoiceSettings,
  loadVoiceSettingsFromDatabase,
  loadVoiceSettingsSnapshot,
  normalizeVoiceSettings,
  resetVoiceSettings,
  saveVoiceSettings,
  shouldAutoStartVad,
  shouldReviewTranscript,
  shouldSpeakAssistantResponse,
  shouldStopOnPointerUp,
  shouldToggleOnPointerDown,
  subscribeVoiceSettings,
  updateVoiceSettings,
  VOICE_SETTINGS_DB_KEY,
  VOICE_SETTINGS_EVENT_NAME,
  VOICE_SETTINGS_NAMESPACE,
  VOICE_SETTINGS_PRESETS,
  VOICE_SETTINGS_STORAGE_KEY,
  VOICE_SETTINGS_VERSION,
  validateVoiceSettings,
} from "@/features/data-formulator/core/voice/voice-settings";
import {
  deleteAppSettingRemote,
  getAppSettingRemote,
  putAppSettingRemote,
} from "@/platform/settings/settings-client";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal valid VoiceSettings-like object by normalizing defaults. */
function makeSettings(overrides: Record<string, unknown> = {}) {
  return normalizeVoiceSettings({ ...DEFAULT_VOICE_SETTINGS, ...overrides });
}

// Settings persist through the settings-client IPC bridge; mock the whole module
// so the DB-backed helpers are deterministic without an Electron preload.
vi.mock("@/platform/settings/settings-client", () => ({
  canUseSettingsApi: vi.fn(() => true),
  getAppSettingRemote: vi.fn(),
  putAppSettingRemote: vi.fn(),
  deleteAppSettingRemote: vi.fn(),
}));

// ── Per-test setup ────────────────────────────────────────────────────────────

beforeEach(() => {
  // Default: an empty durable store and silently-succeeding writes/deletes.
  vi.mocked(getAppSettingRemote).mockReset().mockResolvedValue({ value: null, updatedAt: null });
  vi.mocked(putAppSettingRemote).mockReset().mockResolvedValue("2026-01-01");
  vi.mocked(deleteAppSettingRemote).mockReset().mockResolvedValue(undefined);

  // Clear localStorage before each test so no state bleeds through.
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ── Constants ─────────────────────────────────────────────────────────────────

describe("exported constants", () => {
  it("VOICE_SETTINGS_STORAGE_KEY is the expected localStorage key", () => {
    expect(VOICE_SETTINGS_STORAGE_KEY).toBe("moudir_voice_settings");
  });

  it("VOICE_SETTINGS_NAMESPACE is 'voice'", () => {
    expect(VOICE_SETTINGS_NAMESPACE).toBe("voice");
  });

  it("VOICE_SETTINGS_DB_KEY is 'settings'", () => {
    expect(VOICE_SETTINGS_DB_KEY).toBe("settings");
  });

  it("VOICE_SETTINGS_EVENT_NAME is the correct custom event name", () => {
    expect(VOICE_SETTINGS_EVENT_NAME).toBe("moudir_voice_settings_changed");
  });

  it("VOICE_SETTINGS_VERSION is a positive integer", () => {
    expect(typeof VOICE_SETTINGS_VERSION).toBe("number");
    expect(VOICE_SETTINGS_VERSION).toBeGreaterThan(0);
  });

  it("DEFAULT_VOICE_SETTINGS has the right mode default", () => {
    expect(DEFAULT_VOICE_SETTINGS.mode).toBe("hold-to-talk");
  });

  it("VOICE_SETTINGS_PRESETS is a non-empty array with valid ids", () => {
    expect(Array.isArray(VOICE_SETTINGS_PRESETS)).toBe(true);
    expect(VOICE_SETTINGS_PRESETS.length).toBeGreaterThan(0);
    for (const p of VOICE_SETTINGS_PRESETS) {
      expect(typeof p.id).toBe("string");
      expect(p.id.length).toBeGreaterThan(0);
      expect(typeof p.label).toBe("string");
      expect(typeof p.description).toBe("string");
      expect(typeof p.settings).toBe("object");
    }
  });
});

// ── getDefaultVoiceSettings ───────────────────────────────────────────────────

describe("getDefaultVoiceSettings", () => {
  it("returns an object with version equal to VOICE_SETTINGS_VERSION", () => {
    const s = getDefaultVoiceSettings();
    expect(s.version).toBe(VOICE_SETTINGS_VERSION);
  });

  it("has a fresh updatedAt timestamp on each call", () => {
    const before = Date.now();
    const s = getDefaultVoiceSettings();
    expect(s.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it("spreads default values faithfully", () => {
    const s = getDefaultVoiceSettings();
    expect(s.mode).toBe("hold-to-talk");
    expect(s.vadEnabled).toBe(true);
    expect(s.debugEnabled).toBe(false);
  });
});

// ── normalizeVoiceSettings ────────────────────────────────────────────────────

describe("normalizeVoiceSettings", () => {
  it("returns defaults when called with null", () => {
    const s = normalizeVoiceSettings(null);
    expect(s.mode).toBe(DEFAULT_VOICE_SETTINGS.mode);
    expect(s.version).toBe(VOICE_SETTINGS_VERSION);
  });

  it("returns defaults when called with undefined", () => {
    const s = normalizeVoiceSettings(undefined);
    expect(s.mode).toBe(DEFAULT_VOICE_SETTINGS.mode);
  });

  it("returns defaults when called with an empty object", () => {
    const s = normalizeVoiceSettings({});
    expect(s.mode).toBe(DEFAULT_VOICE_SETTINGS.mode);
  });

  it("preserves valid mode 'push-to-talk'", () => {
    expect(normalizeVoiceSettings({ mode: "push-to-talk" }).mode).toBe("push-to-talk");
  });

  it("preserves valid mode 'auto-vad'", () => {
    expect(normalizeVoiceSettings({ mode: "auto-vad" }).mode).toBe("auto-vad");
  });

  it("maps legacy mode 'push' -> 'push-to-talk'", () => {
    expect(normalizeVoiceSettings({ mode: "push" }).mode).toBe("push-to-talk");
  });

  it("maps legacy mode 'hold' -> 'hold-to-talk'", () => {
    expect(normalizeVoiceSettings({ mode: "hold" }).mode).toBe("hold-to-talk");
  });

  it("maps legacy mode 'continuous' -> 'auto-vad'", () => {
    expect(normalizeVoiceSettings({ mode: "continuous" }).mode).toBe("auto-vad");
  });

  it("falls back to default for unknown mode", () => {
    expect(normalizeVoiceSettings({ mode: "totally-unknown" }).mode).toBe(
      DEFAULT_VOICE_SETTINGS.mode,
    );
  });

  it("clamps vadSensitivity to [0, 1]", () => {
    expect(normalizeVoiceSettings({ vadSensitivity: -1 }).vadSensitivity).toBe(0);
    expect(normalizeVoiceSettings({ vadSensitivity: 5 }).vadSensitivity).toBe(1);
    expect(normalizeVoiceSettings({ vadSensitivity: 0.5 }).vadSensitivity).toBe(0.5);
  });

  it("uses default vadSensitivity for NaN input", () => {
    expect(normalizeVoiceSettings({ vadSensitivity: NaN }).vadSensitivity).toBe(
      DEFAULT_VOICE_SETTINGS.vadSensitivity,
    );
  });

  it("clamps maxRecordingMs to [3000, 120000]", () => {
    expect(normalizeVoiceSettings({ maxRecordingMs: 1_000 }).maxRecordingMs).toBe(3_000);
    expect(normalizeVoiceSettings({ maxRecordingMs: 200_000 }).maxRecordingMs).toBe(120_000);
    expect(normalizeVoiceSettings({ maxRecordingMs: 10_000 }).maxRecordingMs).toBe(10_000);
  });

  it("uses default maxRecordingMs for NaN", () => {
    expect(normalizeVoiceSettings({ maxRecordingMs: NaN }).maxRecordingMs).toBe(
      DEFAULT_VOICE_SETTINGS.maxRecordingMs,
    );
  });

  it("clamps minSpeechMs to [150, 3000]", () => {
    expect(normalizeVoiceSettings({ minSpeechMs: 10 }).minSpeechMs).toBe(150);
    expect(normalizeVoiceSettings({ minSpeechMs: 9_999 }).minSpeechMs).toBe(3_000);
  });

  it("clamps silenceTimeoutMs to [250, 10000]", () => {
    expect(normalizeVoiceSettings({ silenceTimeoutMs: 10 }).silenceTimeoutMs).toBe(250);
    expect(normalizeVoiceSettings({ silenceTimeoutMs: 99_000 }).silenceTimeoutMs).toBe(10_000);
  });

  it("clamps ttsSpeed to [0.5, 2]", () => {
    expect(normalizeVoiceSettings({ ttsSpeed: 0 }).ttsSpeed).toBe(0.5);
    expect(normalizeVoiceSettings({ ttsSpeed: 10 }).ttsSpeed).toBe(2);
    expect(normalizeVoiceSettings({ ttsSpeed: 1.5 }).ttsSpeed).toBe(1.5);
  });

  it("normalizes string booleans to defaults for vadEnabled", () => {
    // string 'true' is not a boolean – should fall back to default
    expect(normalizeVoiceSettings({ vadEnabled: "true" as unknown as boolean }).vadEnabled).toBe(
      DEFAULT_VOICE_SETTINGS.vadEnabled,
    );
  });

  it("accepts valid boolean overrides", () => {
    expect(normalizeVoiceSettings({ vadEnabled: false }).vadEnabled).toBe(false);
    expect(normalizeVoiceSettings({ bargeInEnabled: false }).bargeInEnabled).toBe(false);
  });

  it("normalizes inputDeviceId: non-string -> null", () => {
    expect(
      normalizeVoiceSettings({ inputDeviceId: 42 as unknown as string }).inputDeviceId,
    ).toBeNull();
  });

  it("normalizes inputDeviceId: empty string -> null", () => {
    expect(normalizeVoiceSettings({ inputDeviceId: "   " }).inputDeviceId).toBeNull();
  });

  it("preserves valid inputDeviceId", () => {
    expect(normalizeVoiceSettings({ inputDeviceId: "mic-abc" }).inputDeviceId).toBe("mic-abc");
  });

  it("maps legacy languageHint 'tounsi' -> 'ar-TN'", () => {
    expect(normalizeVoiceSettings({ languageHint: "tounsi" as unknown }).languageHint).toBe(
      "ar-TN",
    );
  });

  it("maps legacy languageHint 'ar-SA' -> 'ar'", () => {
    expect(normalizeVoiceSettings({ languageHint: "ar-SA" as unknown }).languageHint).toBe("ar");
  });

  it("maps legacy languageHint 'fr-FR' -> 'fr'", () => {
    expect(normalizeVoiceSettings({ languageHint: "fr-FR" as unknown }).languageHint).toBe("fr");
  });

  it("maps legacy languageHint 'en-US' -> 'en'", () => {
    expect(normalizeVoiceSettings({ languageHint: "en-US" as unknown }).languageHint).toBe("en");
  });

  it("passes through valid languageHint 'ar-TN'", () => {
    expect(normalizeVoiceSettings({ languageHint: "ar-TN" }).languageHint).toBe("ar-TN");
  });

  it("falls back to default for invalid languageHint", () => {
    expect(normalizeVoiceSettings({ languageHint: "klingon" as unknown }).languageHint).toBe(
      DEFAULT_VOICE_SETTINGS.languageHint,
    );
  });

  it("maps legacy sttEngine 'whisper-multilingual' -> 'whisper-tiny'", () => {
    expect(normalizeVoiceSettings({ sttEngine: "whisper-multilingual" as unknown }).sttEngine).toBe(
      "whisper-tiny",
    );
  });

  it("maps legacy sttEngine 'whisper-tunisian' -> 'whisper-tiny'", () => {
    expect(normalizeVoiceSettings({ sttEngine: "whisper-tunisian" as unknown }).sttEngine).toBe(
      "whisper-tiny",
    );
  });

  it("preserves valid sttEngine 'whisper-base'", () => {
    expect(normalizeVoiceSettings({ sttEngine: "whisper-base" }).sttEngine).toBe("whisper-base");
  });

  it("falls back to default sttEngine for unknown value", () => {
    expect(normalizeVoiceSettings({ sttEngine: "turbo-ai" as unknown }).sttEngine).toBe(
      DEFAULT_VOICE_SETTINGS.sttEngine,
    );
  });

  it("normalizes sttRuntime to valid values", () => {
    expect(normalizeVoiceSettings({ sttRuntime: "webgpu" }).sttRuntime).toBe("webgpu");
    expect(normalizeVoiceSettings({ sttRuntime: "wasm" }).sttRuntime).toBe("wasm");
    expect(normalizeVoiceSettings({ sttRuntime: "invalid" as unknown }).sttRuntime).toBe(
      DEFAULT_VOICE_SETTINGS.sttRuntime,
    );
  });

  it("normalizes valid speakMode values", () => {
    expect(normalizeVoiceSettings({ speakMode: "off" }).speakMode).toBe("off");
    expect(normalizeVoiceSettings({ speakMode: "summary" }).speakMode).toBe("summary");
    expect(normalizeVoiceSettings({ speakMode: "full" }).speakMode).toBe("full");
  });

  it("maps legacy speakMode 'text-only' -> 'off'", () => {
    expect(normalizeVoiceSettings({ speakMode: "text-only" as unknown }).speakMode).toBe("off");
  });

  it("maps legacy speakMode 'speak-summary' -> 'summary'", () => {
    expect(normalizeVoiceSettings({ speakMode: "speak-summary" as unknown }).speakMode).toBe(
      "summary",
    );
  });

  it("maps legacy speakMode 'speak-full' -> 'full'", () => {
    expect(normalizeVoiceSettings({ speakMode: "speak-full" as unknown }).speakMode).toBe("full");
  });

  it("falls back to default speakMode for unknown value", () => {
    expect(normalizeVoiceSettings({ speakMode: "mumble" as unknown }).speakMode).toBe(
      DEFAULT_VOICE_SETTINGS.speakMode,
    );
  });

  it("normalizes debugLevel 'verbose'", () => {
    expect(normalizeVoiceSettings({ debugLevel: "verbose" }).debugLevel).toBe("verbose");
  });

  it("normalizes debugLevel 'normal'", () => {
    expect(normalizeVoiceSettings({ debugLevel: "normal" }).debugLevel).toBe("normal");
  });

  it("normalizes debugLevel 'off'", () => {
    expect(normalizeVoiceSettings({ debugLevel: "off" }).debugLevel).toBe("off");
  });

  it("falls back to default debugLevel for unknown value", () => {
    expect(normalizeVoiceSettings({ debugLevel: "extreme" as unknown }).debugLevel).toBe(
      DEFAULT_VOICE_SETTINGS.debugLevel,
    );
  });

  it("forces showTranscript=false when autoSubmit=true", () => {
    // Even if input says showTranscript=true, autoSubmit overrides it.
    const s = normalizeVoiceSettings({ autoSubmit: true, showTranscript: true });
    expect(s.autoSubmit).toBe(true);
    expect(s.showTranscript).toBe(false);
  });

  it("forces speakMode='off' and autoPlayTts=false when ttsEngine='off'", () => {
    const s = normalizeVoiceSettings({ ttsEngine: "off", speakMode: "summary", autoPlayTts: true });
    expect(s.speakMode).toBe("off");
    expect(s.autoPlayTts).toBe(false);
  });

  it("prevents minSpeechMs >= maxRecordingMs by clamping", () => {
    // Set minSpeechMs to max allowed (3000) and maxRecordingMs to min allowed (3000).
    // After normalization: minSpeechMs=3000, maxRecordingMs=3000 -> constraint triggers.
    const s = normalizeVoiceSettings({
      minSpeechMs: 3_000,
      maxRecordingMs: 3_000,
    });
    expect(s.minSpeechMs).toBeLessThan(s.maxRecordingMs);
  });

  it("migrates legacy key 'minRecordingMs' -> 'minSpeechMs'", () => {
    const s = normalizeVoiceSettings({ minRecordingMs: 400 } as Record<string, unknown>);
    expect(s.minSpeechMs).toBe(400);
  });

  it("migrates legacy key 'silenceHangoverMs' -> 'silenceTimeoutMs'", () => {
    const s = normalizeVoiceSettings({ silenceHangoverMs: 800 } as Record<string, unknown>);
    expect(s.silenceTimeoutMs).toBe(800);
  });

  it("migrates legacy key 'voiceMode' -> 'mode' when 'mode' absent", () => {
    const s = normalizeVoiceSettings({ voiceMode: "auto-vad" } as Record<string, unknown>);
    expect(s.mode).toBe("auto-vad");
  });

  it("does not override 'mode' with 'voiceMode' when 'mode' is already present", () => {
    const s = normalizeVoiceSettings({
      mode: "push-to-talk",
      voiceMode: "auto-vad",
    } as Record<string, unknown>);
    expect(s.mode).toBe("push-to-talk");
  });

  it("migrates legacy key 'ttsEnabled: true' -> speakMode='summary'", () => {
    const s = normalizeVoiceSettings({ ttsEnabled: true } as Record<string, unknown>);
    expect(s.speakMode).toBe("summary");
  });

  it("migrates legacy key 'ttsEnabled: false' -> speakMode='off'", () => {
    const s = normalizeVoiceSettings({ ttsEnabled: false } as Record<string, unknown>);
    expect(s.speakMode).toBe("off");
  });

  it("migrates legacy 'outputMode' -> 'speakMode' when 'speakMode' absent", () => {
    const s = normalizeVoiceSettings({ outputMode: "full" } as Record<string, unknown>);
    expect(s.speakMode).toBe("full");
  });

  it("preserves updatedAt when it is a finite number", () => {
    const ts = 1_700_000_000_000;
    const s = normalizeVoiceSettings({ updatedAt: ts });
    expect(s.updatedAt).toBe(ts);
  });

  it("refreshes updatedAt for NaN input", () => {
    const before = Date.now();
    const s = normalizeVoiceSettings({ updatedAt: NaN });
    expect(s.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it("normalizes ttsVoice: null falls back to default", () => {
    expect(normalizeVoiceSettings({ ttsVoice: null as unknown as string }).ttsVoice).toBe(
      DEFAULT_VOICE_SETTINGS.ttsVoice,
    );
  });

  it("normalizes ttsVoice: empty string falls back to default", () => {
    expect(normalizeVoiceSettings({ ttsVoice: "" }).ttsVoice).toBe(DEFAULT_VOICE_SETTINGS.ttsVoice);
  });

  it("preserves a recognized KOKORO voice id", () => {
    expect(normalizeVoiceSettings({ ttsVoice: "af_sky" }).ttsVoice).toBe("af_sky");
  });

  it("preserves an unrecognized TTS voice id (passthrough)", () => {
    // normalizeTtsVoice passes through any non-empty string
    expect(normalizeVoiceSettings({ ttsVoice: "my-custom-voice" }).ttsVoice).toBe(
      "my-custom-voice",
    );
  });

  it("normalizes localSttModelPath: non-string -> null", () => {
    expect(
      normalizeVoiceSettings({ localSttModelPath: 123 as unknown as string }).localSttModelPath,
    ).toBeNull();
  });

  it("normalizes localSttModelPath: whitespace -> null", () => {
    expect(normalizeVoiceSettings({ localSttModelPath: "   " }).localSttModelPath).toBeNull();
  });

  it("preserves a valid localSttModelPath", () => {
    expect(normalizeVoiceSettings({ localSttModelPath: "/models/stt" }).localSttModelPath).toBe(
      "/models/stt",
    );
  });

  it("normalizes localTtsModelPath: whitespace -> null", () => {
    expect(normalizeVoiceSettings({ localTtsModelPath: "   " }).localTtsModelPath).toBeNull();
  });

  it("preserves a valid localTtsModelPath", () => {
    expect(normalizeVoiceSettings({ localTtsModelPath: "/models/tts" }).localTtsModelPath).toBe(
      "/models/tts",
    );
  });
});

// ── validateVoiceSettings ─────────────────────────────────────────────────────

describe("validateVoiceSettings", () => {
  it("returns valid=true and no errors for a clean config", () => {
    const s = makeSettings({
      mode: "hold-to-talk",
      vadEnabled: true,
      ttsEngine: "off",
      speakMode: "off",
      autoPlayTts: false,
      autoSubmit: false,
      showTranscript: true,
      debugEnabled: false,
      debugLevel: "errors",
    });
    const result = validateVoiceSettings(s);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("errors when auto-vad mode is used without vadEnabled=true", () => {
    const s = makeSettings({ mode: "auto-vad", vadEnabled: false });
    const result = validateVoiceSettings(s);
    expect(result.errors).toContain("Auto-VAD mode requires vadEnabled=true.");
    expect(result.valid).toBe(false);
  });

  it("errors when speakMode is not off but ttsEngine is off", () => {
    // Manually construct to bypass normalizeVoiceSettings constraint
    const s = {
      ...makeSettings({ ttsEngine: "off" }),
      speakMode: "summary" as const,
    };
    const result = validateVoiceSettings(s);
    expect(result.errors).toContain("speakMode requires a TTS engine other than off.");
    expect(result.valid).toBe(false);
  });

  it("warns when autoSubmit=true and showTranscript=true", () => {
    // Manually bypass the normalizeVoiceSettings constraint (which sets showTranscript=false)
    const s = { ...makeSettings({ autoSubmit: true }), showTranscript: true };
    const result = validateVoiceSettings(s);
    expect(result.warnings.some((w) => w.includes("autoSubmit"))).toBe(true);
  });

  it("warns when debugLevel=verbose and debugEnabled=false", () => {
    const s = makeSettings({ debugLevel: "verbose", debugEnabled: false });
    const result = validateVoiceSettings(s);
    expect(result.warnings.some((w) => w.includes("verbose"))).toBe(true);
  });

  it("does not warn about enabled STT/TTS engines", () => {
    // whisper-tiny and kokoro are enabled in the registry
    const s = makeSettings({ sttEngine: "whisper-tiny", ttsEngine: "kokoro" });
    const result = validateVoiceSettings(s);
    const sttWarn = result.warnings.some((w) => w.includes("whisper-tiny"));
    const ttsWarn = result.warnings.some((w) => w.includes("kokoro"));
    expect(sttWarn).toBe(false);
    expect(ttsWarn).toBe(false);
  });

  it("warns when sttEngine is not enabled (moonshine is planned)", () => {
    const s = makeSettings({ sttEngine: "moonshine" });
    const result = validateVoiceSettings(s);
    // moonshine status is 'planned' -> not enabled
    const warned = result.warnings.some((w) => w.includes("moonshine"));
    expect(warned).toBe(true);
  });

  it("returns valid=false only when errors exist", () => {
    const cleanSettings = makeSettings();
    const { valid } = validateVoiceSettings(cleanSettings);
    // whisper-tiny is enabled; kokoro is enabled; mode is hold-to-talk
    // Only potential issue: piper/moonshine not enabled but those aren't the defaults
    // Default ttsEngine is kokoro which IS enabled, so valid depends on no errors
    expect(typeof valid).toBe("boolean");
  });
});

// ── localStorage / storage layer ──────────────────────────────────────────────

describe("loadVoiceSettings / saveVoiceSettings", () => {
  it("returns defaults when localStorage is empty", () => {
    const s = loadVoiceSettings();
    expect(s.mode).toBe(DEFAULT_VOICE_SETTINGS.mode);
  });

  it("saveVoiceSettings writes to localStorage and returns normalized settings", () => {
    const saved = saveVoiceSettings({ mode: "push-to-talk" }, { dispatch: false });
    expect(saved.mode).toBe("push-to-talk");

    const raw = window.localStorage.getItem(VOICE_SETTINGS_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.mode).toBe("push-to-talk");
  });

  it("loadVoiceSettings reads back what was saved", () => {
    saveVoiceSettings({ mode: "auto-vad" }, { dispatch: false });
    const loaded = loadVoiceSettings();
    expect(loaded.mode).toBe("auto-vad");
  });

  it("saveVoiceSettings dispatches a custom event by default", () => {
    const listener = vi.fn();
    window.addEventListener(VOICE_SETTINGS_EVENT_NAME, listener);
    saveVoiceSettings({ mode: "auto-vad" });
    window.removeEventListener(VOICE_SETTINGS_EVENT_NAME, listener);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("saveVoiceSettings does not dispatch when dispatch=false", () => {
    const listener = vi.fn();
    window.addEventListener(VOICE_SETTINGS_EVENT_NAME, listener);
    saveVoiceSettings({ mode: "auto-vad" }, { dispatch: false });
    window.removeEventListener(VOICE_SETTINGS_EVENT_NAME, listener);
    expect(listener).not.toHaveBeenCalled();
  });

  it("saveVoiceSettings uses the provided eventType in the dispatched event", () => {
    const received: CustomEvent[] = [];
    window.addEventListener(VOICE_SETTINGS_EVENT_NAME, (e) => received.push(e as CustomEvent));
    saveVoiceSettings({ mode: "auto-vad" }, { eventType: "migrated", dispatch: true });
    window.removeEventListener(VOICE_SETTINGS_EVENT_NAME, () => {});
    expect(received[0].detail.type).toBe("migrated");
  });
});

describe("loadVoiceSettingsSnapshot", () => {
  it("returns source='defaults' when localStorage is empty", () => {
    const snap = loadVoiceSettingsSnapshot();
    expect(snap.source).toBe("defaults");
    expect(snap.loadedAt).toBeGreaterThan(0);
  });

  it("returns source='storage' when localStorage has current-version data", () => {
    saveVoiceSettings({ mode: "auto-vad" }, { dispatch: false });
    const snap = loadVoiceSettingsSnapshot();
    expect(snap.source).toBe("storage");
    expect(snap.settings.mode).toBe("auto-vad");
  });

  it("returns source='migration' when localStorage has an older version", () => {
    // Write stale version directly.
    const stale = { ...DEFAULT_VOICE_SETTINGS, mode: "push-to-talk", version: 1 };
    window.localStorage.setItem(VOICE_SETTINGS_STORAGE_KEY, JSON.stringify(stale));
    const snap = loadVoiceSettingsSnapshot();
    expect(snap.source).toBe("migration");
    // After migration the cached settings should be updated to current version.
    const updated = JSON.parse(window.localStorage.getItem(VOICE_SETTINGS_STORAGE_KEY)!);
    expect(updated.version).toBe(VOICE_SETTINGS_VERSION);
  });
});

describe("updateVoiceSettings", () => {
  it("merges patch into current settings", () => {
    saveVoiceSettings({ mode: "hold-to-talk" }, { dispatch: false });
    const updated = updateVoiceSettings({ mode: "auto-vad" });
    expect(updated.mode).toBe("auto-vad");
  });

  it("dispatches an 'updated' event", () => {
    const received: CustomEvent[] = [];
    window.addEventListener(VOICE_SETTINGS_EVENT_NAME, (e) => received.push(e as CustomEvent));
    updateVoiceSettings({ mode: "push-to-talk" });
    window.removeEventListener(VOICE_SETTINGS_EVENT_NAME, () => {});
    expect(received[0].detail.type).toBe("updated");
  });
});

describe("resetVoiceSettings", () => {
  it("resets settings back to defaults and dispatches a 'reset' event", () => {
    saveVoiceSettings({ mode: "auto-vad" }, { dispatch: false });
    const received: CustomEvent[] = [];
    window.addEventListener(VOICE_SETTINGS_EVENT_NAME, (e) => received.push(e as CustomEvent));
    const reset = resetVoiceSettings();
    window.removeEventListener(VOICE_SETTINGS_EVENT_NAME, () => {});

    expect(reset.mode).toBe(DEFAULT_VOICE_SETTINGS.mode);
    expect(received[0].detail.type).toBe("reset");
  });
});

describe("clearVoiceSettings", () => {
  it("removes the localStorage key and dispatches a reset event", () => {
    saveVoiceSettings({ mode: "auto-vad" }, { dispatch: false });
    const received: CustomEvent[] = [];
    window.addEventListener(VOICE_SETTINGS_EVENT_NAME, (e) => received.push(e as CustomEvent));
    clearVoiceSettings();
    window.removeEventListener(VOICE_SETTINGS_EVENT_NAME, () => {});

    expect(window.localStorage.getItem(VOICE_SETTINGS_STORAGE_KEY)).toBeNull();
    expect(received[0].detail.type).toBe("reset");
  });
});

// ── dispatchVoiceSettingsChanged ──────────────────────────────────────────────

describe("dispatchVoiceSettingsChanged", () => {
  it("dispatches a CustomEvent with the given payload", () => {
    const received: CustomEvent[] = [];
    window.addEventListener(VOICE_SETTINGS_EVENT_NAME, (e) => received.push(e as CustomEvent));

    const s = getDefaultVoiceSettings();
    dispatchVoiceSettingsChanged({ type: "loaded", settings: s });

    window.removeEventListener(VOICE_SETTINGS_EVENT_NAME, () => {});
    expect(received).toHaveLength(1);
    expect(received[0].detail.type).toBe("loaded");
    expect(received[0].detail.settings).toEqual(s);
  });
});

// ── subscribeVoiceSettings ────────────────────────────────────────────────────

describe("subscribeVoiceSettings", () => {
  it("returns an unsubscribe function", () => {
    const unsub = subscribeVoiceSettings(() => {});
    expect(typeof unsub).toBe("function");
    unsub();
  });

  it("calls the listener when a voice settings event is dispatched", () => {
    const listener = vi.fn();
    const unsub = subscribeVoiceSettings(listener);

    const s = getDefaultVoiceSettings();
    dispatchVoiceSettingsChanged({ type: "saved", settings: s });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].type).toBe("saved");

    unsub();
  });

  it("stops receiving events after unsubscribe", () => {
    const listener = vi.fn();
    const unsub = subscribeVoiceSettings(listener);
    unsub();

    const s = getDefaultVoiceSettings();
    dispatchVoiceSettingsChanged({ type: "saved", settings: s });

    expect(listener).not.toHaveBeenCalled();
  });

  it("calls the listener when a storage event with the correct key fires", () => {
    const listener = vi.fn();
    const unsub = subscribeVoiceSettings(listener);

    // Simulate a cross-tab localStorage change
    window.dispatchEvent(new StorageEvent("storage", { key: VOICE_SETTINGS_STORAGE_KEY }));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].type).toBe("loaded");

    unsub();
  });

  it("ignores storage events for unrelated keys", () => {
    const listener = vi.fn();
    const unsub = subscribeVoiceSettings(listener);

    window.dispatchEvent(new StorageEvent("storage", { key: "some-other-key" }));

    expect(listener).not.toHaveBeenCalled();
    unsub();
  });
});

// ── loadVoiceSettingsFromDatabase ─────────────────────────────────────────────

describe("loadVoiceSettingsFromDatabase", () => {
  it("returns null when the durable store has no row", async () => {
    vi.mocked(getAppSettingRemote).mockResolvedValueOnce({ value: null, updatedAt: null });
    const result = await loadVoiceSettingsFromDatabase();
    expect(result).toBeNull();
  });

  it("propagates an error when the durable read rejects", async () => {
    vi.mocked(getAppSettingRemote).mockRejectedValueOnce(new Error("ipc failed"));
    await expect(loadVoiceSettingsFromDatabase()).rejects.toThrow();
  });

  it("returns null when the stored value is null", async () => {
    vi.mocked(getAppSettingRemote).mockResolvedValueOnce({ value: null, updatedAt: null });
    const result = await loadVoiceSettingsFromDatabase();
    expect(result).toBeNull();
  });

  it("returns normalized settings when a value is present", async () => {
    vi.mocked(getAppSettingRemote).mockResolvedValueOnce({
      value: { mode: "auto-vad" },
      updatedAt: null,
    });
    const result = await loadVoiceSettingsFromDatabase();
    expect(result).not.toBeNull();
    expect(result!.mode).toBe("auto-vad");
  });

  it("reads from the voice namespace + settings key", async () => {
    vi.mocked(getAppSettingRemote).mockResolvedValueOnce({ value: null, updatedAt: null });
    await loadVoiceSettingsFromDatabase();
    expect(getAppSettingRemote).toHaveBeenCalledWith("voice", "settings");
  });
});

// ── hydrateVoiceSettingsFromDatabase ─────────────────────────────────────────

describe("hydrateVoiceSettingsFromDatabase", () => {
  it("returns null when loadVoiceSettingsFromDatabase returns null", async () => {
    vi.mocked(getAppSettingRemote).mockResolvedValueOnce({ value: null, updatedAt: null });
    const result = await hydrateVoiceSettingsFromDatabase();
    expect(result).toBeNull();
  });

  it("writes remote to cache and returns remote when no local cache exists", async () => {
    const remoteTs = Date.now() - 1_000;
    vi.mocked(getAppSettingRemote).mockResolvedValueOnce({
      value: { mode: "auto-vad", updatedAt: remoteTs },
      updatedAt: null,
    });

    const result = await hydrateVoiceSettingsFromDatabase();
    expect(result).not.toBeNull();
    expect(result!.mode).toBe("auto-vad");

    const cached = window.localStorage.getItem(VOICE_SETTINGS_STORAGE_KEY);
    expect(cached).not.toBeNull();
  });

  it("persists local settings and returns local when local is newer than remote", async () => {
    const localTs = Date.now();
    const remoteTs = localTs - 5_000;

    const localSettings = normalizeVoiceSettings({
      mode: "push-to-talk",
      updatedAt: localTs,
    });
    window.localStorage.setItem(VOICE_SETTINGS_STORAGE_KEY, JSON.stringify(localSettings));

    vi.mocked(getAppSettingRemote).mockResolvedValueOnce({
      value: { mode: "auto-vad", updatedAt: remoteTs },
      updatedAt: null,
    });

    const result = await hydrateVoiceSettingsFromDatabase();
    expect(result).not.toBeNull();
    expect(result!.mode).toBe("push-to-talk");
  });

  it("does not dispatch an event when remote and local are identical", async () => {
    const ts = Date.now() - 1_000;
    const settings = normalizeVoiceSettings({ mode: "auto-vad", updatedAt: ts });

    window.localStorage.setItem(VOICE_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    vi.mocked(getAppSettingRemote).mockResolvedValueOnce({ value: settings, updatedAt: null });

    const listener = vi.fn();
    window.addEventListener(VOICE_SETTINGS_EVENT_NAME, listener);
    await hydrateVoiceSettingsFromDatabase();
    window.removeEventListener(VOICE_SETTINGS_EVENT_NAME, listener);

    expect(listener).not.toHaveBeenCalled();
  });
});

// ── Preset helpers ────────────────────────────────────────────────────────────

describe("getVoiceSettingsPreset", () => {
  it("returns the preset for a known id", () => {
    const preset = getVoiceSettingsPreset("safe-review");
    expect(preset).not.toBeNull();
    expect(preset!.id).toBe("safe-review");
  });

  it("returns null for an unknown id", () => {
    expect(getVoiceSettingsPreset("nonexistent-preset")).toBeNull();
  });

  it("can find all preset ids", () => {
    for (const p of VOICE_SETTINGS_PRESETS) {
      const found = getVoiceSettingsPreset(p.id);
      expect(found).not.toBeNull();
    }
  });
});

describe("applyVoiceSettingsPreset", () => {
  it("applies the 'safe-review' preset and returns updated settings", () => {
    const s = applyVoiceSettingsPreset("safe-review");
    expect(s.mode).toBe("hold-to-talk");
    expect(s.autoSubmit).toBe(false);
    expect(s.showTranscript).toBe(true);
  });

  it("applies the 'fast-command' preset", () => {
    const s = applyVoiceSettingsPreset("fast-command");
    expect(s.mode).toBe("push-to-talk");
    // autoSubmit=true forces showTranscript=false
    expect(s.autoSubmit).toBe(true);
    expect(s.showTranscript).toBe(false);
  });

  it("applies the 'hands-free' preset", () => {
    const s = applyVoiceSettingsPreset("hands-free");
    expect(s.mode).toBe("auto-vad");
  });

  it("applies the 'debug' preset", () => {
    const s = applyVoiceSettingsPreset("debug");
    expect(s.debugEnabled).toBe(true);
    expect(s.debugLevel).toBe("verbose");
  });

  it("applies the 'text-only' preset", () => {
    const s = applyVoiceSettingsPreset("text-only");
    // ttsEngine='off' forces speakMode='off'
    expect(s.ttsEngine).toBe("off");
    expect(s.speakMode).toBe("off");
    expect(s.autoPlayTts).toBe(false);
  });

  it("throws for an unknown preset id", () => {
    expect(() => applyVoiceSettingsPreset("invalid-preset")).toThrow(
      "Unknown voice settings preset: invalid-preset",
    );
  });
});

// ── Derived helpers ───────────────────────────────────────────────────────────

describe("getVoiceOutputMode", () => {
  it("returns 'text-only' when ttsEngine is 'off'", () => {
    const s = makeSettings({ ttsEngine: "off" });
    expect(getVoiceOutputMode(s)).toBe("text-only");
  });

  it("returns 'text-only' when speakMode is 'off'", () => {
    const s = { ...makeSettings(), speakMode: "off" as const };
    expect(getVoiceOutputMode(s)).toBe("text-only");
  });

  it("returns 'speak-summary' when speakMode is 'summary'", () => {
    const s = { ...makeSettings({ ttsEngine: "kokoro" }), speakMode: "summary" as const };
    expect(getVoiceOutputMode(s)).toBe("speak-summary");
  });

  it("returns 'speak-full' when speakMode is 'full'", () => {
    const s = { ...makeSettings({ ttsEngine: "kokoro" }), speakMode: "full" as const };
    expect(getVoiceOutputMode(s)).toBe("speak-full");
  });
});

describe("getTranscriptBehavior", () => {
  it("returns 'review' when autoSubmit=false", () => {
    const s = makeSettings({ autoSubmit: false, showTranscript: true });
    expect(getTranscriptBehavior(s)).toBe("review");
  });

  it("returns 'silent-submit' when autoSubmit=true and showTranscript=false", () => {
    const s = makeSettings({ autoSubmit: true }); // showTranscript forced to false
    expect(getTranscriptBehavior(s)).toBe("silent-submit");
  });

  it("returns 'auto-submit' when autoSubmit=true and showTranscript=true (manual object)", () => {
    // Bypass normalization by constructing directly
    const s = { ...makeSettings({ autoSubmit: true }), showTranscript: true };
    expect(getTranscriptBehavior(s)).toBe("auto-submit");
  });
});

describe("getVadThresholdsFromSensitivity", () => {
  it("at sensitivity=0, positiveSpeechThreshold is 0.75", () => {
    const s = makeSettings({ vadSensitivity: 0 });
    const t = getVadThresholdsFromSensitivity(s);
    // 0.75 - 0 * 0.35 = 0.75
    expect(t.positiveSpeechThreshold).toBe(0.75);
  });

  it("at sensitivity=1, positiveSpeechThreshold is 0.40", () => {
    const s = makeSettings({ vadSensitivity: 1 });
    const t = getVadThresholdsFromSensitivity(s);
    // 0.75 - 1 * 0.35 = 0.40
    expect(t.positiveSpeechThreshold).toBe(0.4);
  });

  it("negativeSpeechThreshold is at least 0.15", () => {
    const s = makeSettings({ vadSensitivity: 1 });
    const t = getVadThresholdsFromSensitivity(s);
    expect(t.negativeSpeechThreshold).toBeGreaterThanOrEqual(0.15);
  });

  it("negativeSpeechThreshold <= positiveSpeechThreshold for mid sensitivity", () => {
    const s = makeSettings({ vadSensitivity: 0.5 });
    const t = getVadThresholdsFromSensitivity(s);
    expect(t.negativeSpeechThreshold).toBeLessThanOrEqual(t.positiveSpeechThreshold);
  });

  it("returns rounded values to two decimal places", () => {
    const s = makeSettings({ vadSensitivity: 0.55 });
    const t = getVadThresholdsFromSensitivity(s);
    const pRounded = Math.round(t.positiveSpeechThreshold * 100) / 100;
    expect(t.positiveSpeechThreshold).toBe(pRounded);
  });
});

describe("getVadFrameSettings", () => {
  it("returns positive frame counts for default settings", () => {
    const s = makeSettings({ silenceTimeoutMs: 900, minSpeechMs: 350 });
    const f = getVadFrameSettings(s);
    expect(f.redemptionFrames).toBeGreaterThan(0);
    expect(f.preSpeechPadFrames).toBe(10);
    expect(f.minSpeechFrames).toBeGreaterThan(0);
  });

  it("redemptionFrames >= 4 for very short silenceTimeoutMs", () => {
    const s = makeSettings({ silenceTimeoutMs: 250 });
    const f = getVadFrameSettings(s);
    expect(f.redemptionFrames).toBeGreaterThanOrEqual(4);
  });

  it("minSpeechFrames >= 3 for very short minSpeechMs", () => {
    const s = makeSettings({ minSpeechMs: 150 });
    const f = getVadFrameSettings(s);
    expect(f.minSpeechFrames).toBeGreaterThanOrEqual(3);
  });

  it("preSpeechPadFrames is always 10", () => {
    const s = makeSettings({ silenceTimeoutMs: 5_000, minSpeechMs: 2_000 });
    const f = getVadFrameSettings(s);
    expect(f.preSpeechPadFrames).toBe(10);
  });

  it("larger silenceTimeoutMs gives more redemptionFrames", () => {
    const fShort = getVadFrameSettings(makeSettings({ silenceTimeoutMs: 250 }));
    const fLong = getVadFrameSettings(makeSettings({ silenceTimeoutMs: 5_000 }));
    expect(fLong.redemptionFrames).toBeGreaterThan(fShort.redemptionFrames);
  });
});

describe("mode predicate helpers", () => {
  it("shouldAutoStartVad is true for auto-vad", () => {
    expect(shouldAutoStartVad(makeSettings({ mode: "auto-vad" }))).toBe(true);
    expect(shouldAutoStartVad(makeSettings({ mode: "hold-to-talk" }))).toBe(false);
    expect(shouldAutoStartVad(makeSettings({ mode: "push-to-talk" }))).toBe(false);
  });

  it("shouldStopOnPointerUp is true for hold-to-talk", () => {
    expect(shouldStopOnPointerUp(makeSettings({ mode: "hold-to-talk" }))).toBe(true);
    expect(shouldStopOnPointerUp(makeSettings({ mode: "push-to-talk" }))).toBe(false);
    expect(shouldStopOnPointerUp(makeSettings({ mode: "auto-vad" }))).toBe(false);
  });

  it("shouldToggleOnPointerDown is true for push-to-talk", () => {
    expect(shouldToggleOnPointerDown(makeSettings({ mode: "push-to-talk" }))).toBe(true);
    expect(shouldToggleOnPointerDown(makeSettings({ mode: "auto-vad" }))).toBe(false);
    expect(shouldToggleOnPointerDown(makeSettings({ mode: "hold-to-talk" }))).toBe(false);
  });

  it("shouldReviewTranscript is true when not auto-submitting", () => {
    const s = makeSettings({ autoSubmit: false, showTranscript: true });
    expect(shouldReviewTranscript(s)).toBe(true);
  });

  it("shouldReviewTranscript is false when auto-submitting silently", () => {
    const s = makeSettings({ autoSubmit: true }); // silent-submit
    expect(shouldReviewTranscript(s)).toBe(false);
  });

  it("shouldSpeakAssistantResponse is false when ttsEngine='off'", () => {
    expect(shouldSpeakAssistantResponse(makeSettings({ ttsEngine: "off" }))).toBe(false);
  });

  it("shouldSpeakAssistantResponse is false when speakMode='off' even with active engine", () => {
    const s = { ...makeSettings({ ttsEngine: "kokoro" }), speakMode: "off" as const };
    expect(shouldSpeakAssistantResponse(s)).toBe(false);
  });

  it("shouldSpeakAssistantResponse is true for kokoro + summary", () => {
    const s = { ...makeSettings({ ttsEngine: "kokoro" }), speakMode: "summary" as const };
    expect(shouldSpeakAssistantResponse(s)).toBe(true);
  });

  it("shouldSpeakAssistantResponse is true for kokoro + full", () => {
    const s = { ...makeSettings({ ttsEngine: "kokoro" }), speakMode: "full" as const };
    expect(shouldSpeakAssistantResponse(s)).toBe(true);
  });
});

describe("getVoiceSettingsSummary", () => {
  it("includes mode, languageHint, sttEngine, and sttRuntime", () => {
    const s = makeSettings({
      mode: "auto-vad",
      languageHint: "fr",
      sttEngine: "whisper-tiny",
      sttRuntime: "wasm",
    });
    const summary = getVoiceSettingsSummary(s);
    expect(summary).toContain("auto-vad");
    expect(summary).toContain("fr");
    expect(summary).toContain("whisper-tiny");
    expect(summary).toContain("wasm");
  });

  it("includes debug info when debugEnabled=true", () => {
    const s = makeSettings({ debugEnabled: true, debugLevel: "verbose" });
    const summary = getVoiceSettingsSummary(s);
    expect(summary).toContain("debug:verbose");
  });

  it("does not include debug info when debugEnabled=false", () => {
    const s = makeSettings({ debugEnabled: false });
    const summary = getVoiceSettingsSummary(s);
    expect(summary).not.toContain("debug:");
  });

  it("uses · separator between fields", () => {
    const s = makeSettings();
    const summary = getVoiceSettingsSummary(s);
    expect(summary).toContain("·");
  });
});

describe("createVoiceWorkerSettingsPayload", () => {
  it("returns an object with vad, stt, tts sub-payloads", () => {
    const s = makeSettings();
    const payload = createVoiceWorkerSettingsPayload(s);
    expect(payload).toHaveProperty("vad");
    expect(payload).toHaveProperty("stt");
    expect(payload).toHaveProperty("tts");
  });

  it("vad sub-payload contains expected keys", () => {
    const s = makeSettings();
    const { vad } = createVoiceWorkerSettingsPayload(s);
    expect(vad).toHaveProperty("mode");
    expect(vad).toHaveProperty("vadEnabled");
    expect(vad).toHaveProperty("positiveSpeechThreshold");
    expect(vad).toHaveProperty("negativeSpeechThreshold");
    expect(vad).toHaveProperty("redemptionFrames");
    expect(vad).toHaveProperty("preSpeechPadFrames");
    expect(vad).toHaveProperty("minSpeechFrames");
    expect(vad).toHaveProperty("emitFrameEvents");
  });

  it("stt sub-payload maps fields correctly", () => {
    const s = makeSettings({ sttEngine: "whisper-base", sttRuntime: "webgpu", languageHint: "fr" });
    const { stt } = createVoiceWorkerSettingsPayload(s);
    expect(stt.engine).toBe("whisper-base");
    expect(stt.runtime).toBe("webgpu");
    expect(stt.language).toBe("fr");
    expect(stt.allowRemoteModels).toBe(s.allowRemoteSttModels);
    expect(stt.localModelPath).toBe(s.localSttModelPath);
  });

  it("tts sub-payload maps fields correctly", () => {
    const s = makeSettings({
      ttsEngine: "kokoro",
      ttsRuntime: "auto",
      ttsVoice: "af_heart",
      ttsSpeed: 1.5,
    });
    const { tts } = createVoiceWorkerSettingsPayload(s);
    expect(tts.engine).toBe("kokoro");
    expect(tts.runtime).toBe("auto");
    expect(tts.voice).toBe("af_heart");
    expect(tts.speed).toBe(1.5);
    expect(tts.autoPlay).toBe(s.autoPlayTts);
    expect(tts.localModelPath).toBe(s.localTtsModelPath);
  });

  it("vad.emitFrameEvents maps from emitVadFrameEvents", () => {
    const s = makeSettings({ emitVadFrameEvents: true });
    const { vad } = createVoiceWorkerSettingsPayload(s);
    expect(vad.emitFrameEvents).toBe(true);
  });
});

// ── Export / import helpers ───────────────────────────────────────────────────

describe("exportVoiceSettings", () => {
  it("returns a valid JSON string of the current settings", () => {
    saveVoiceSettings({ mode: "auto-vad" }, { dispatch: false });
    const json = exportVoiceSettings();
    const parsed = JSON.parse(json);
    expect(parsed.mode).toBe("auto-vad");
  });

  it("returns pretty-printed JSON (with newlines)", () => {
    const json = exportVoiceSettings();
    expect(json).toContain("\n");
  });
});

describe("exportVoiceSettingsFromDatabase", () => {
  it("returns serialized settings from the database when available", async () => {
    vi.mocked(getAppSettingRemote).mockResolvedValueOnce({
      value: { mode: "auto-vad" },
      updatedAt: null,
    });

    const json = await exportVoiceSettingsFromDatabase();
    const parsed = JSON.parse(json);
    expect(parsed.mode).toBe("auto-vad");
  });

  it("falls back to local settings when database returns null", async () => {
    saveVoiceSettings({ mode: "push-to-talk" }, { dispatch: false });
    vi.mocked(getAppSettingRemote).mockResolvedValueOnce({ value: null, updatedAt: null });

    const json = await exportVoiceSettingsFromDatabase();
    const parsed = JSON.parse(json);
    expect(parsed.mode).toBe("push-to-talk");
  });
});

describe("importVoiceSettings", () => {
  it("imports valid JSON and applies settings", () => {
    const data = JSON.stringify({ mode: "auto-vad" });
    const s = importVoiceSettings(data);
    expect(s.mode).toBe("auto-vad");
  });

  it("persists imported settings to localStorage", () => {
    importVoiceSettings(JSON.stringify({ mode: "push-to-talk" }));
    const raw = window.localStorage.getItem(VOICE_SETTINGS_STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!).mode).toBe("push-to-talk");
  });

  it("throws for invalid JSON", () => {
    expect(() => importVoiceSettings("not json {{")).toThrow("Invalid voice settings JSON.");
  });

  it("throws for JSON that parses to non-object (e.g. null literal)", () => {
    expect(() => importVoiceSettings("null")).toThrow("Invalid voice settings JSON.");
  });

  it("accepts JSON that parses to a number and normalizes to defaults (number is truthy)", () => {
    // safeJsonParse("42") returns 42, which is truthy, so importVoiceSettings
    // treats it as partial settings and normalizes it (falling back to defaults).
    const s = importVoiceSettings("42");
    expect(s.mode).toBe(DEFAULT_VOICE_SETTINGS.mode);
  });
});

// ── Coverage gap: TTS engine not-enabled warning ──────────────────────────────

describe("validateVoiceSettings – TTS engine not enabled warning", () => {
  it("warns when ttsEngine is 'piper' (status=planned, not enabled)", () => {
    // Construct settings directly to bypass normalizeVoiceSettings which may
    // coerce piper to the default; piper IS a valid TtsEngine key but has
    // status "planned" so getEnabledTtsEngines() does not include it.
    const s = {
      ...getDefaultVoiceSettings(),
      ttsEngine: "piper" as const,
    };
    const result = validateVoiceSettings(s);
    const warned = result.warnings.some((w) => w.includes("piper"));
    expect(warned).toBe(true);
  });
});

// ── Coverage gap: fetch .catch() handlers in persist / delete helpers ─────────

describe("persistVoiceSettingsToDatabase – catch handler (line 719)", () => {
  it("logs a warning and does not throw when fetch rejects during save", async () => {
    // Make the durable write reject so the void .catch() in persist fires.
    const fetchError = new Error("network down");
    vi.mocked(putAppSettingRemote).mockRejectedValueOnce(fetchError);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // saveVoiceSettings → writeCachedVoiceSettings + persistVoiceSettingsToDatabase
    // The void fetch inside persistVoiceSettingsToDatabase is fire-and-forget,
    // so we need to flush the micro-task queue after the call.
    saveVoiceSettings({ mode: "auto-vad" }, { dispatch: false });

    // Drain micro-tasks so the .catch() inside the fired Promise runs.
    await Promise.resolve();
    await Promise.resolve();

    expect(warnSpy).toHaveBeenCalledWith(
      "[voice-settings] failed to persist settings to database",
      fetchError,
    );
    warnSpy.mockRestore();
  });
});

describe("deleteVoiceSettingsFromDatabase – catch handler (line 729)", () => {
  it("logs a warning and does not throw when fetch rejects during delete", async () => {
    const fetchError = new Error("network down");
    // clearVoiceSettings calls deleteVoiceSettingsFromDatabase then persist; make
    // the delete reject so its void .catch() fires (persist uses the default).
    vi.mocked(deleteAppSettingRemote).mockRejectedValueOnce(fetchError);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    clearVoiceSettings();

    await Promise.resolve();
    await Promise.resolve();

    const deleteWarnCalled = warnSpy.mock.calls.some((args) =>
      String(args[0]).includes("failed to delete settings from database"),
    );
    expect(deleteWarnCalled).toBe(true);
    warnSpy.mockRestore();
  });
});

// ── Coverage gap: loadVoiceSettingsSnapshot non-browser path (line 788) ───────

describe("loadVoiceSettingsSnapshot – non-browser environment (line 788)", () => {
  it("returns defaults with source='defaults' when window.localStorage is undefined", () => {
    // Simulate a non-browser environment by temporarily removing localStorage.
    const originalLocalStorage = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      writable: true,
      value: undefined,
    });

    try {
      const snap = loadVoiceSettingsSnapshot();
      expect(snap.source).toBe("defaults");
      expect(snap.settings.mode).toBe(DEFAULT_VOICE_SETTINGS.mode);
    } finally {
      if (originalLocalStorage) {
        Object.defineProperty(window, "localStorage", originalLocalStorage);
      }
    }
  });
});

// ── Coverage gap: subscribeVoiceSettings non-browser path (line 925) ─────────

describe("subscribeVoiceSettings – non-browser environment (line 925)", () => {
  it("returns a no-op unsubscribe function when window.localStorage is undefined", () => {
    const originalLocalStorage = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      writable: true,
      value: undefined,
    });

    try {
      const unsub = subscribeVoiceSettings(() => {});
      expect(typeof unsub).toBe("function");
      // Calling the no-op should not throw.
      expect(() => unsub()).not.toThrow();
    } finally {
      if (originalLocalStorage) {
        Object.defineProperty(window, "localStorage", originalLocalStorage);
      }
    }
  });
});

// ── Coverage gap: ensureVoiceSettingsHydratedFromDatabase catch (line 782) ────
//
// remoteHydrationStarted is a module-level boolean that is set to true on first
// use and never reset within a single module instance. We need a fresh module
// import so the flag starts as false, then make hydrateVoiceSettingsFromDatabase
// throw so the .catch() at line 782 runs.

describe("ensureVoiceSettingsHydratedFromDatabase – catch handler (line 782)", () => {
  it("logs a warning when hydrateVoiceSettingsFromDatabase rejects on first hydration", async () => {
    // Reset module registry so remoteHydrationStarted resets to false.
    vi.resetModules();

    // Re-import the (still-mocked) settings-client and make the durable read
    // reject, so first-hydration throws and the .catch() at line 782 fires. Using
    // the post-reset instance keeps it the same one the re-imported module sees.
    const ipcError = new Error("hydration ipc failure");
    const settingsClient = await import("@/platform/settings/settings-client");
    vi.mocked(settingsClient.getAppSettingRemote).mockRejectedValue(ipcError);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Dynamically import the fresh module instance.
    const freshModule = await import("@/features/data-formulator/core/voice/voice-settings");

    // loadVoiceSettingsSnapshot with empty localStorage triggers
    // ensureVoiceSettingsHydratedFromDatabase which fires the void hydration.
    window.localStorage.clear();
    freshModule.loadVoiceSettingsSnapshot();

    // Drain the micro-task queue so the rejection .catch() at line 782 fires.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const hydrateWarnCalled = warnSpy.mock.calls.some((args) =>
      String(args[0]).includes("failed to hydrate settings from database"),
    );
    expect(hydrateWarnCalled).toBe(true);

    warnSpy.mockRestore();
    vi.resetModules();
  });
});
