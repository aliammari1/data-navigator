"use client";

/**
 * Language Profile Store
 * User preferences for language, tone, and voice settings.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type LanguageMode = "auto" | "tounsi" | "fr" | "en" | "ar";
export type ToneMode = "casual" | "professional" | "executive" | "technical";

export interface LanguageProfile {
  languageMode: LanguageMode;
  toneMode: ToneMode;
  autoDetect: boolean;
  translateEvidence: boolean;
  voiceEnabled: boolean;
  ttsEnabled: boolean;
  ttsLanguage: "fr" | "en" | "ar" | "none";
  sttModel: "whisper-multilingual" | "whisper-tunisian";
  preferredModel: string;
}

export interface LanguageProfileState extends LanguageProfile {
  setLanguageMode: (mode: LanguageMode) => void;
  setToneMode: (tone: ToneMode) => void;
  setAutoDetect: (v: boolean) => void;
  setTranslateEvidence: (v: boolean) => void;
  setVoiceEnabled: (v: boolean) => void;
  setTtsEnabled: (v: boolean) => void;
  setTtsLanguage: (lang: LanguageProfile["ttsLanguage"]) => void;
  setSttModel: (model: LanguageProfile["sttModel"]) => void;
  setPreferredModel: (model: string) => void;
  getPromptLanguage: () => string;
}

export const useLanguageProfileStore = create<LanguageProfileState>()(
  persist(
    (set, get) => ({
      languageMode: "auto",
      toneMode: "professional",
      autoDetect: true,
      translateEvidence: true,
      voiceEnabled: true,
      ttsEnabled: false,
      ttsLanguage: "none",
      sttModel: "whisper-multilingual",
      preferredModel: "",

      setLanguageMode: (languageMode) => set({ languageMode }),
      setToneMode: (toneMode) => set({ toneMode }),
      setAutoDetect: (autoDetect) => set({ autoDetect }),
      setTranslateEvidence: (translateEvidence) => set({ translateEvidence }),
      setVoiceEnabled: (voiceEnabled) => set({ voiceEnabled }),
      setTtsEnabled: (ttsEnabled) => set({ ttsEnabled }),
      setTtsLanguage: (ttsLanguage) => set({ ttsLanguage }),
      setSttModel: (sttModel) => set({ sttModel }),
      setPreferredModel: (preferredModel) => set({ preferredModel }),

      getPromptLanguage: () => {
        const mode = get().languageMode;
        switch (mode) {
          case "tounsi":
            return "Tunisian Arabic (Tounsi) dialect";
          case "fr":
            return "French";
          case "en":
            return "English";
          case "ar":
            return "Modern Standard Arabic";
          default:
            return "auto-detect (Tunisian Arabic, French, English, Arabic)";
        }
      },
    }),
    {
      name: "moudir-language-profile",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
