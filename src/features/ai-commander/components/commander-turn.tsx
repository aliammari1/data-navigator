"use client";

/**
 * One Commander exchange: the user's instruction, the assistant's spoken reply,
 * and — when the instruction triggered an OS action — a result card that echoes
 * the desktop's Spotlight command language (a hue-tinted icon chip + label). The
 * card is clickable when it points at an app, re-focusing that window.
 */

import { ChevronRight, type LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { CommanderGlyph } from "./commander-kit";

export interface CommanderAction {
  /** What was done, e.g. "Ouvert · Rapport Télécom". */
  label: string;
  icon: LucideIcon;
  /** Accent hue (0–360) of the target domain, matching the desktop convention. */
  hue: number;
  /** When set, the card is clickable and re-opens/focuses this app. */
  appId?: string;
}

export interface CommanderTurnData {
  id: string;
  user: string;
  reply: string;
  action?: CommanderAction;
  error?: boolean;
}

export function CommanderTurn({
  turn,
  onOpen,
}: {
  turn: CommanderTurnData;
  onOpen?: (appId: string) => void;
}) {
  const motionOn = !useReducedMotion();
  return (
    <motion.div
      initial={motionOn ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className="space-y-2"
    >
      {/* User instruction */}
      <div className="flex justify-end">
        <div className="w-fit max-w-[85%] rounded-2xl rounded-br-md bg-foreground/90 px-3.5 py-2 text-sm text-background">
          {turn.user}
        </div>
      </div>

      {/* Assistant reply + optional action card */}
      <div className="flex items-start gap-2.5">
        <CommanderGlyph size={28} className="mt-0.5" />
        <div className="min-w-0 flex-1 space-y-2">
          <div
            className="w-fit max-w-[92%] rounded-2xl rounded-tl-md px-3.5 py-2 text-sm text-foreground"
            style={
              turn.error
                ? {
                    background: "color-mix(in oklab, var(--color-destructive) 12%, transparent)",
                    color:
                      "color-mix(in oklab, var(--color-destructive) 82%, var(--color-foreground))",
                  }
                : {
                    background: "var(--glass-bg-strong)",
                    boxShadow: "inset 0 0 0 1px var(--glass-border)",
                  }
            }
          >
            {turn.reply}
          </div>
          {turn.action && <ActionCard action={turn.action} onOpen={onOpen} />}
        </div>
      </div>
    </motion.div>
  );
}

function ActionCard({
  action,
  onOpen,
}: {
  action: CommanderAction;
  onOpen?: (appId: string) => void;
}) {
  const Icon = action.icon;
  const clickable = Boolean(action.appId && onOpen);

  const inner = (
    <>
      <span
        className="grid size-7 shrink-0 place-items-center rounded-lg"
        style={{
          background: `hsl(${action.hue} 60% 50% / 0.14)`,
          color: `hsl(${action.hue} 55% 45%)`,
        }}
      >
        <Icon className="size-3.5" aria-hidden />
      </span>
      <span className="truncate text-[12.5px] font-medium text-foreground/90">{action.label}</span>
      {clickable && (
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      )}
    </>
  );

  const base =
    "flex w-fit max-w-full items-center gap-2.5 rounded-xl border border-border bg-[var(--glass-bg)] px-2.5 py-1.5 text-left";

  if (clickable && action.appId) {
    const targetId = action.appId;
    return (
      <button
        type="button"
        onClick={() => onOpen?.(targetId)}
        className={cn(base, "transition-colors hover:border-foreground/15 hover:bg-foreground/5")}
        title={`Rouvrir · ${action.label}`}
      >
        {inner}
      </button>
    );
  }
  return <div className={base}>{inner}</div>;
}
