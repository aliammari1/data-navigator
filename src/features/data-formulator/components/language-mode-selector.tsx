"use client";

import { Globe, MessageSquare, Mic, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/shared/utils";
import {
  useLanguageProfileStore,
  type LanguageMode,
  type ToneMode,
} from "@/features/data-formulator/core/language/language-profile";

const LANGUAGE_OPTIONS: Array<{ mode: LanguageMode; label: string; icon: React.ElementType }> = [
  { mode: "auto", label: "Auto-detect", icon: Globe },
  { mode: "tounsi", label: "Tounsi", icon: MessageSquare },
  { mode: "fr", label: "French", icon: MessageSquare },
  { mode: "en", label: "English", icon: MessageSquare },
  { mode: "ar", label: "Arabic", icon: MessageSquare },
];

const TONE_OPTIONS: Array<{ mode: ToneMode; label: string }> = [
  { mode: "casual", label: "Casual" },
  { mode: "professional", label: "Professional" },
  { mode: "executive", label: "Executive" },
  { mode: "technical", label: "Technical" },
];

export function LanguageModeSelector() {
  const languageMode = useLanguageProfileStore((s) => s.languageMode);
  const toneMode = useLanguageProfileStore((s) => s.toneMode);
  const voiceEnabled = useLanguageProfileStore((s) => s.voiceEnabled);
  const ttsEnabled = useLanguageProfileStore((s) => s.ttsEnabled);
  const ttsLanguage = useLanguageProfileStore((s) => s.ttsLanguage);
  const setLanguageMode = useLanguageProfileStore((s) => s.setLanguageMode);
  const setToneMode = useLanguageProfileStore((s) => s.setToneMode);
  const setVoiceEnabled = useLanguageProfileStore((s) => s.setVoiceEnabled);
  const setTtsEnabled = useLanguageProfileStore((s) => s.setTtsEnabled);
  const setTtsLanguage = useLanguageProfileStore((s) => s.setTtsLanguage);

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-violet-500/20 bg-violet-500/10">
          <Globe className="h-4 w-4 text-violet-300" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Language</h2>
          <p className="text-xs text-muted-foreground">Voice, tone, and response language</p>
        </div>
      </div>

      {/* Language mode */}
      <div>
        <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Response Language
        </div>
        <div className="grid grid-cols-3 gap-2">
          {LANGUAGE_OPTIONS.map((opt) => (
            <button
              key={opt.mode}
              onClick={() => setLanguageMode(opt.mode)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg border p-2.5 text-[11px] transition-colors",
                languageMode === opt.mode
                  ? "border-violet-500/30 bg-violet-500/10 text-violet-300"
                  : "border-white/10 bg-white/5 text-muted-foreground hover:border-white/20",
              )}
            >
              <opt.icon className="h-4 w-4" />
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tone */}
      <div>
        <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Tone
        </div>
        <div className="flex flex-wrap gap-2">
          {TONE_OPTIONS.map((opt) => (
            <button
              key={opt.mode}
              onClick={() => setToneMode(opt.mode)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-[11px] transition-colors",
                toneMode === opt.mode
                  ? "border-violet-500/30 bg-violet-500/10 text-violet-300"
                  : "border-white/10 bg-white/5 text-muted-foreground hover:border-white/20",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Voice */}
      <div className="rounded-lg border border-white/10 bg-white/5 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mic className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-foreground">Voice input</span>
          </div>
          <button
            onClick={() => setVoiceEnabled(!voiceEnabled)}
            className={cn(
              "relative h-5 w-9 rounded-full transition-colors",
              voiceEnabled ? "bg-violet-500/40" : "bg-white/10",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 block h-4 w-4 rounded-full bg-white transition-transform",
                voiceEnabled ? "left-4.5" : "left-0.5",
              )}
              style={{ left: voiceEnabled ? "18px" : "2px" }}
            />
          </button>
        </div>
      </div>

      {/* TTS */}
      <div className="rounded-lg border border-white/10 bg-white/5 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {ttsEnabled ? (
              <Volume2 className="h-4 w-4 text-muted-foreground" />
            ) : (
              <VolumeX className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="text-xs text-foreground">Read-aloud (TTS)</span>
          </div>
          <button
            onClick={() => setTtsEnabled(!ttsEnabled)}
            className={cn(
              "relative h-5 w-9 rounded-full transition-colors",
              ttsEnabled ? "bg-violet-500/40" : "bg-white/10",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 block h-4 w-4 rounded-full bg-white transition-transform",
              )}
              style={{ left: ttsEnabled ? "18px" : "2px" }}
            />
          </button>
        </div>
        {ttsEnabled && (
          <select
            value={ttsLanguage}
            onChange={(e) => setTtsLanguage(e.target.value as typeof ttsLanguage)}
            className="mt-2 w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-foreground focus:outline-none"
          >
            <option value="none">No voice output</option>
            <option value="fr">French</option>
            <option value="en">English</option>
            <option value="ar">Arabic (MSA)</option>
          </select>
        )}
        <p className="mt-2 text-[10px] text-muted-foreground">
          Tunisian Arabic TTS is not available offline. Use text chat in Tounsi.
        </p>
      </div>
    </div>
  );
}
