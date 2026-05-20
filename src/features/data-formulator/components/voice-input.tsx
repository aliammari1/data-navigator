"use client";

/**
 * Offline voice input compatibility wrapper.
 *
 * The manager cockpit must not use the browser Web Speech API as a primary
 * engine because it can depend on cloud services. This module keeps the older
 * `VoiceInput` export available while delegating to the offline worker-backed
 * microphone + Transformers.js pipeline in `voice-button.tsx`.
 */

import { Mic } from "lucide-react";
import { useState } from "react";
import { cn } from "@/shared/utils";
import { VoiceButton as OfflineVoiceButton } from "./voice-button";

interface VoiceInputProps {
  onTranscript: (text: string, isFinal: boolean) => void;
  onResult?: (text: string) => void;
  disabled?: boolean;
  language?: string;
  placeholder?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "min-h-8 px-3 text-xs",
  md: "min-h-10 px-4 text-sm",
  lg: "min-h-12 px-5 text-base",
};

export function VoiceInput({
  onTranscript,
  onResult,
  disabled,
  language = "ar-TN",
  placeholder = "Hold the microphone and speak your query...",
  size = "md",
  className,
}: VoiceInputProps) {
  const [latestTranscript, setLatestTranscript] = useState("");

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border border-white/10 bg-white/5",
        sizeClasses[size],
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      <OfflineVoiceButton
        disabled={disabled}
        language={language}
        onResult={(text) => {
          setLatestTranscript(text);
          onTranscript(text, true);
          onResult?.(text);
        }}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium text-foreground">
          {latestTranscript || placeholder}
        </div>
        <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
          <Mic className="h-3 w-3" />
          Offline Whisper pipeline. Browser speech fallback is disabled.
        </div>
      </div>
    </div>
  );
}

export function VoiceButton({
  onResult,
  disabled,
  language = "ar-TN",
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
      className={className}
    />
  );
}
