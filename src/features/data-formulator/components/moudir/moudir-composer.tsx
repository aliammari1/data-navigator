"use client";

/**
 * Moudir — composer. The line you talk to Moudir through. Warm, calm, no neon.
 */

import { ArrowUp, Mic, MicOff, Square } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { cn } from "@/shared/utils";
import { MOUDIR, useMotionOn } from "./moudir-kit";

export function MoudirComposer({
  disabled,
  running,
  value,
  onChange,
  onSubmit,
  onPick,
  onCancel,
  suggestions,
  voice,
}: {
  disabled: boolean;
  running: boolean;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  /** Submit a specific prompt directly (used by suggestion chips), avoiding the
   * stale-`value` race that `onChange`+`onSubmit` in one tick would hit. */
  onPick: (text: string) => void;
  onCancel: () => void;
  suggestions?: string[];
  /** Optional offline voice capture. When `supported`, a mic button appears to
   * the left of the send button; toggling it starts/stops listening. A failed
   * start surfaces `error` as inline text with a retry affordance. */
  voice?: {
    supported: boolean;
    listening: boolean;
    onToggle: () => void;
    error?: string | null;
    onRetry?: () => void;
  };
}) {
  const motionOn = useMotionOn();
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  useEffect(() => {
    if (!running && !disabled) ref.current?.focus();
  }, [running, disabled]);

  const canSubmit = !disabled && value.trim().length > 0;
  const chips = (suggestions ?? []).slice(0, 4);
  const showChips = !running && value.trim().length === 0 && chips.length > 0;

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!running && canSubmit) onSubmit();
    }
  }

  return (
    <div className={cn("w-full", disabled && "pointer-events-none opacity-40")}>
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
                className="shrink-0 truncate rounded-full border border-border bg-[var(--glass-bg)] px-2.5 py-1 text-left text-[12.5px] leading-none text-muted-foreground transition-all duration-200 hover:border-[#17a2c9]/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17a2c9]/50 active:scale-[0.98]"
              >
                {chip}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className="flex items-end gap-3 rounded-2xl px-4 py-3 transition-colors"
        style={{
          background: "var(--glass-bg)",
          boxShadow: `inset 0 0 0 1px ${running ? "rgba(23, 162, 201,0.3)" : "var(--glass-border)"}`,
        }}
      >
        <textarea
          ref={ref}
          rows={1}
          value={value}
          disabled={disabled || running}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Demandez à Moudir…  (ex. pourquoi le taux de réussite a-t-il baissé ?)"
          spellCheck={false}
          className="block max-h-[160px] w-full resize-none bg-transparent text-base leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
        />
        {voice?.supported && (
          <button
            type="button"
            onClick={voice.onToggle}
            aria-label={voice.listening ? "Arrêter l'écoute" : "Parler"}
            aria-pressed={voice.listening}
            className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17a2c9]/50 active:scale-[0.96]"
            style={{
              background: voice.listening ? "rgba(23, 162, 201,0.15)" : "var(--glass-bg)",
              color: voice.listening ? MOUDIR.coral : "hsl(var(--muted-foreground))",
            }}
          >
            {voice.listening && (
              <span
                className="absolute inset-0 animate-ping rounded-xl"
                style={{ boxShadow: "inset 0 0 0 1px rgba(23, 162, 201,0.4)" }}
              />
            )}
            {voice.listening ? (
              <Mic className="relative h-4 w-4" strokeWidth={2.25} />
            ) : (
              <MicOff className="relative h-4 w-4" strokeWidth={2.25} />
            )}
          </button>
        )}
        <button
          type="button"
          onClick={running ? onCancel : canSubmit ? onSubmit : undefined}
          disabled={!running && !canSubmit}
          aria-label={running ? "Arrêter" : "Demander"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17a2c9]/50 active:scale-[0.96] disabled:cursor-not-allowed"
          style={{
            background: running ? `${MOUDIR.rose}26` : canSubmit ? MOUDIR.coral : "var(--glass-bg)",
            color: running ? MOUDIR.rose : canSubmit ? "#14120d" : "hsl(var(--muted-foreground))",
          }}
        >
          {running ? (
            <Square className="h-4 w-4 fill-current" />
          ) : (
            <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
          )}
        </button>
      </div>

      {voice?.supported && voice.error && (
        <div className="mt-2 flex items-center gap-2 px-1 text-[12px] text-[#e06a55]">
          <span>{voice.error}</span>
          {voice.onRetry && (
            <button
              type="button"
              onClick={voice.onRetry}
              className="rounded-md border border-[#e06a55]/40 px-2 py-0.5 text-[11px] text-[#e06a55] transition-colors hover:border-[#e06a55]/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e06a55]/50"
            >
              Réessayer
            </button>
          )}
        </div>
      )}
    </div>
  );
}
