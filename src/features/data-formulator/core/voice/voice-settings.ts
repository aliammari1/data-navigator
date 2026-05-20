"use client";

/**
 * Voice Settings
 * Configuration for voice command modes and STT preferences.
 */

export type VoiceMode = "push-to-talk" | "hold-to-talk";
export type SttEngine = "whisper-multilingual" | "whisper-tunisian";

export interface VoiceSettings {
  mode: VoiceMode;
  sttEngine: SttEngine;
  autoSubmit: boolean;
  showTranscript: boolean;
  languageHint: "auto" | "ar" | "fr" | "en";
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  mode: "hold-to-talk",
  sttEngine: "whisper-multilingual",
  autoSubmit: false,
  showTranscript: true,
  languageHint: "auto",
};

export function loadVoiceSettings(): VoiceSettings {
  try {
    const raw = localStorage.getItem("moudir_voice_settings");
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<VoiceSettings>;
      const next = { ...DEFAULT_VOICE_SETTINGS, ...parsed };
      if (
        next.sttEngine !== "whisper-multilingual" &&
        next.sttEngine !== "whisper-tunisian"
      ) {
        next.sttEngine = DEFAULT_VOICE_SETTINGS.sttEngine;
      }
      return next;
    }
  } catch {
    // ignore parse errors
  }
  return DEFAULT_VOICE_SETTINGS;
}

export function saveVoiceSettings(settings: VoiceSettings): void {
  localStorage.setItem("moudir_voice_settings", JSON.stringify(settings));
}
