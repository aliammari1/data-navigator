"use client";

/**
 * Moudir — composer. The line you talk to Moudir through. Warm, calm, no neon.
 */

import { ArrowUp, Square } from "lucide-react";
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
}) {
  const motionOn = useMotionOn();
  const ref = useRef<HTMLTextAreaElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: ref is stable; resize must rerun on value change
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
    </div>
  );
}
