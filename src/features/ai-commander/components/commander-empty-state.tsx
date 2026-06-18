"use client";

/**
 * The Commander's empty state — its identity moment. A greeting, a live model
 * status, and a grid of capability tiles that surface the OS-level powers the
 * Commander actually has. Tapping a tile runs its example instruction verbatim,
 * so the blank prompt is never a dead end.
 */

import { motion, useReducedMotion } from "motion/react";
import type { CommanderCapability } from "@/features/ai-commander/core/commander";
import { CommanderGlyph } from "./commander-kit";

const EASE = [0.16, 1, 0.3, 1] as const;

export type StatusTone = "ready" | "loading" | "error";

/** Theme-aware status dot colors — the semantic tokens are tuned for contrast
 *  on both the cream and navy surfaces, unlike fixed hex. */
const TONE_DOT: Record<StatusTone, string> = {
  ready: "var(--color-success)",
  loading: "var(--color-warning)",
  error: "var(--color-destructive)",
};

export function CommanderEmptyState({
  greeting,
  statusLabel,
  statusTone,
  capabilities,
  onRun,
}: {
  greeting: string;
  statusLabel: string;
  statusTone: StatusTone;
  capabilities: CommanderCapability[];
  onRun: (text: string) => void;
}) {
  const motionOn = !useReducedMotion();

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6 py-10 text-center">
      <motion.div
        initial={motionOn ? { opacity: 0, y: 10 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
        className="flex flex-col items-center"
      >
        <CommanderGlyph size={56} />
        <h1
          className="mt-4 font-semibold text-2xl tracking-tight text-foreground"
          style={{ fontFamily: "var(--font-display, var(--font-serif, inherit))" }}
        >
          {greeting}
        </h1>
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
          Je pilote l'application pour vous. Dites-moi ce que vous voulez faire.
        </p>
        <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-[var(--glass-bg)] px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          <span
            className={
              statusTone === "loading" && motionOn
                ? "size-1.5 animate-pulse rounded-full"
                : "size-1.5 rounded-full"
            }
            style={{ background: TONE_DOT[statusTone] }}
          />
          {statusLabel}
        </span>
      </motion.div>

      <div className="mt-8 grid w-full max-w-md grid-cols-1 gap-2.5 sm:grid-cols-2">
        {capabilities.map((cap, i) => {
          const Icon = cap.icon;
          return (
            <motion.button
              key={cap.id}
              type="button"
              onClick={() => onRun(cap.example)}
              initial={motionOn ? { opacity: 0, y: 8 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.05 + i * 0.05, ease: EASE }}
              className="group flex flex-col gap-2 rounded-2xl border border-border bg-card/70 p-3.5 text-left shadow-sm backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.99]"
            >
              <span
                className="flex size-9 items-center justify-center rounded-xl border [&_svg]:size-4"
                style={{
                  borderColor: `hsl(${cap.hue} 60% 50% / 0.25)`,
                  background: `hsl(${cap.hue} 60% 50% / 0.1)`,
                  color: `hsl(${cap.hue} 55% 45%)`,
                }}
              >
                <Icon aria-hidden />
              </span>
              <span className="font-medium text-foreground text-sm">{cap.title}</span>
              <span className="text-[12px] text-muted-foreground leading-snug">{cap.hint}</span>
              <span className="mt-0.5 truncate text-[11px] text-muted-foreground/60 italic">
                « {cap.example} »
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
