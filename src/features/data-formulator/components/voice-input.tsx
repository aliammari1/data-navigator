"use client";

/**
 * Voice Input
 *
 * Compatibility wrapper around the new library-powered VoiceButton.
 *
 * Purpose:
 * - Preserve the old `VoiceInput` and `VoiceButton` exports.
 * - Keep older call sites working.
 * - Show the latest captured transcript beside the microphone.
 * - Make it clear that voice input is local/offline-first and routed through
 *   the new voice-agent pipeline.
 *
 * New main pipeline lives in:
 * - voice-button.tsx
 * - voice-vad-service.ts
 * - voice-stt-worker.ts
 * - voice-command-router.ts
 * - voice-tts-worker.ts
 */

import {
  CheckCircle2,
  MessageSquareText,
  Mic,
  Sparkles,
  Volume2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { mapLanguageHintToDisplayLabel } from "@/features/data-formulator/core/voice/voice-model-registry";
import {
  loadVoiceSettings,
  subscribeVoiceSettings,
  type VoiceSettings,
} from "@/features/data-formulator/core/voice/voice-settings";
import { cn } from "@/shared/utils";
import { VoiceButton as OfflineVoiceButton } from "./voice-button";

interface VoiceInputProps {
  onTranscript: (text: string, isFinal: boolean) => void;
  onResult?: (text: string) => void;
  disabled?: boolean;
  language?: string;
  languageLabel?: string;
  placeholder?: string;
  size?: "sm" | "md" | "lg";
  className?: string;

  /**
   * Shows the latest captured transcript inside the wrapper.
   */
  showLatestTranscript?: boolean;

  /**
   * Shows small voice pipeline badges.
   */
  showBadges?: boolean;
}

const sizeClasses = {
  sm: "min-h-8 px-3 py-2 text-xs",
  md: "min-h-10 px-4 py-2.5 text-sm",
  lg: "min-h-12 px-5 py-3 text-base",
} satisfies Record<NonNullable<VoiceInputProps["size"]>, string>;

const buttonSizeClasses = {
  sm: "h-8 w-8",
  md: "h-9 w-9",
  lg: "h-10 w-10",
} satisfies Record<NonNullable<VoiceInputProps["size"]>, string>;

function getDisplayLanguage(
  settings: VoiceSettings,
  language?: string,
  languageLabel?: string,
): string {
  if (settings.languageHint !== "auto") {
    return mapLanguageHintToDisplayLabel(settings.languageHint);
  }

  if (languageLabel) return languageLabel;
  if (language) return language;

  return "Auto";
}

function getOutputLabel(settings: VoiceSettings): string {
  if (settings.ttsEngine === "off" || settings.speakMode === "off") {
    return "Text only";
  }

  if (settings.speakMode === "summary") {
    return "Speaks summary";
  }

  return "Speaks full answer";
}

export function VoiceInput({
  onTranscript,
  onResult,
  disabled,
  language = "ar-TN",
  languageLabel,
  placeholder = "Hold the microphone and speak your query...",
  size = "md",
  className,
  showLatestTranscript = true,
  showBadges = true,
}: VoiceInputProps) {
  const [latestTranscript, setLatestTranscript] = useState("");
  const [settings, setSettings] = useState<VoiceSettings>(() =>
    loadVoiceSettings(),
  );

  useEffect(() => {
    const unsubscribe = subscribeVoiceSettings((event) => {
      setSettings(event.settings);
    });

    return unsubscribe;
  }, []);

  const displayLanguage = useMemo(
    () => getDisplayLanguage(settings, language, languageLabel),
    [settings, language, languageLabel],
  );

  const outputLabel = useMemo(() => getOutputLabel(settings), [settings]);

  const handleResult = useCallback(
    (text: string) => {
      const transcript = text.trim();

      if (!transcript) return;

      setLatestTranscript(transcript);
      onTranscript(transcript, true);
      onResult?.(transcript);
    },
    [onResult, onTranscript],
  );

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-3 rounded-xl border border-white/10 bg-white/5",
        "transition-colors focus-within:border-emerald-500/35 focus-within:bg-emerald-500/[0.04]",
        sizeClasses[size],
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      <OfflineVoiceButton
        disabled={disabled}
        language={language}
        languageLabel={languageLabel}
        onResult={handleResult}
        className={buttonSizeClasses[size]}
      />

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
            {showLatestTranscript && latestTranscript
              ? latestTranscript
              : placeholder}
          </div>

          {latestTranscript && (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
          )}
        </div>

        {showBadges && (
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
              <Mic className="h-3 w-3" />
              {settings.mode}
            </span>

            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
              <MessageSquareText className="h-3 w-3" />
              {displayLanguage}
            </span>

            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
              <Sparkles className="h-3 w-3" />
              {settings.sttEngine}
            </span>

            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
              <Volume2 className="h-3 w-3" />
              {outputLabel}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Compatibility export.
 *
 * Older code may import `VoiceButton` from this file instead of importing the
 * new implementation directly from `voice-button.tsx`.
 */
export function VoiceButton({
  onResult,
  disabled,
  language = "ar-TN",
  languageLabel,
  className,
}: {
  onResult: (text: string) => void;
  disabled?: boolean;
  language?: string;
  languageLabel?: string;
  className?: string;
}) {
  return (
    <OfflineVoiceButton
      onResult={onResult}
      disabled={disabled}
      language={language}
      languageLabel={languageLabel}
      className={className}
    />
  );
}
