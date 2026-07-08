"use client";

/**
 * The Commander's composer — the line you give orders through. A warm glass bar
 * with an optional offline-voice mic and a send/stop affordance. The inset border
 * keys to state (listening → green, busy → faint green) for an OS-native feel.
 */

import { ArrowUp, Mic, MicOff, Square } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { Kbd } from "@/components/ui/kbd";
import { CMD_ACCENT, cmdAlpha } from "./commander-kit";

export interface ComposerVoice {
  supported: boolean;
  listening: boolean;
  transcribing: boolean;
  error?: string | null;
  onToggle: () => void;
  onRetry?: () => void;
}

export function CommanderComposer({
  value,
  onChange,
  onSubmit,
  onPick,
  onCancel,
  busy,
  suggestions,
  voice,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  /** Run a specific instruction directly (suggestion chips) — avoids the stale
   *  `value` race that onChange+onSubmit in one tick would hit. */
  onPick: (text: string) => void;
  onCancel: () => void;
  busy: boolean;
  suggestions?: string[];
  voice: ComposerVoice;
}) {
  const motionOn = !useReducedMotion();
  const ref = useRef<HTMLTextAreaElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure the textarea height whenever its value changes.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [value]);

  useEffect(() => {
    if (!busy) ref.current?.focus();
  }, [busy]);

  const canSubmit = value.trim().length > 0 && !busy;
  const chips = (suggestions ?? []).slice(0, 4);
  const showChips = !busy && value.trim().length === 0 && chips.length > 0;

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSubmit) onSubmit();
    }
  }

  const placeholder = voice.transcribing
    ? "Transcription…"
    : voice.supported
      ? "Donnez un ordre — tapez ou parlez…"
      : "Donnez un ordre au Commandant…";

  return (
    <div className="w-full">
      {voice.supported && voice.error && (
        <div className="mb-2 flex items-center gap-2 px-1 text-[12px] text-destructive">
          <span className="min-w-0 flex-1 truncate">{voice.error}</span>
          {voice.onRetry && (
            <button
              type="button"
              onClick={voice.onRetry}
              className="shrink-0 rounded-md border border-destructive/40 px-2 py-0.5 text-[11px] transition-colors hover:border-destructive/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/50"
            >
              Réessayer
            </button>
          )}
        </div>
      )}

      <AnimatePresence initial={false}>
        {showChips && (
          <motion.div
            initial={motionOn ? { opacity: 0, y: 4 } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={motionOn ? { opacity: 0, y: 4 } : undefined}
            className="scrollbar-none mb-2 flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-0.5"
          >
            {chips.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => onPick(chip)}
                title={chip}
                className="shrink-0 truncate rounded-full border border-border bg-[var(--glass-bg)] px-2.5 py-1 text-left text-[12.5px] leading-none text-muted-foreground transition-all duration-200 hover:text-foreground active:scale-[0.98]"
              >
                {chip}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className="flex items-end gap-2.5 rounded-2xl px-3.5 py-2.5 transition-colors"
        style={{
          background: "var(--glass-bg)",
          boxShadow: `inset 0 0 0 1px ${
            voice.listening ? cmdAlpha(0.45) : busy ? cmdAlpha(0.3) : "var(--glass-border)"
          }`,
        }}
      >
        {voice.supported && (
          <button
            type="button"
            onClick={voice.onToggle}
            aria-label={voice.listening ? "Arrêter l'écoute" : "Parler au Commandant"}
            aria-pressed={voice.listening}
            className="relative flex size-9 shrink-0 items-center justify-center rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background active:scale-[0.96]"
            style={{
              background: voice.listening ? cmdAlpha(0.16) : "transparent",
              color: voice.listening ? CMD_ACCENT : "hsl(var(--muted-foreground))",
            }}
          >
            {voice.listening && motionOn && (
              <span
                className="absolute inset-0 animate-ping rounded-xl"
                style={{ boxShadow: `inset 0 0 0 1px ${cmdAlpha(0.4)}` }}
              />
            )}
            {voice.listening ? (
              <Mic className="relative size-4" strokeWidth={2.25} />
            ) : (
              <MicOff className="relative size-4" strokeWidth={2.25} />
            )}
          </button>
        )}

        <textarea
          ref={ref}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label="Donnez un ordre au Commandant"
          spellCheck={false}
          className="block max-h-[140px] min-h-[24px] w-full resize-none bg-transparent py-1.5 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
        />

        <button
          type="button"
          onClick={busy ? onCancel : canSubmit ? onSubmit : undefined}
          disabled={!busy && !canSubmit}
          aria-label={busy ? "Arrêter" : "Envoyer"}
          className="flex size-9 shrink-0 items-center justify-center rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background active:scale-[0.96] disabled:cursor-not-allowed"
          style={{
            background: busy ? "rgba(224,106,85,0.15)" : canSubmit ? CMD_ACCENT : "var(--glass-bg)",
            color: busy ? "#e06a55" : canSubmit ? "#fff" : "hsl(var(--muted-foreground))",
            boxShadow: busy ? "inset 0 0 0 1px rgba(224,106,85,0.45)" : undefined,
          }}
        >
          {busy ? (
            <Square className="size-4 fill-current" />
          ) : (
            <ArrowUp className="size-4" strokeWidth={2.5} />
          )}
        </button>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 px-1 text-[11px] text-muted-foreground/70">
        <Kbd>Entrée</Kbd>
        <span>envoyer</span>
        <span className="opacity-50">·</span>
        <Kbd>Maj</Kbd>
        <Kbd>Entrée</Kbd>
        <span>nouvelle ligne</span>
      </div>
    </div>
  );
}
