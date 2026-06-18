/**
 * Unlock toast — slide-in via the already-bundled `motion` (replaces ad-hoc
 * Tailwind `animate-in` classes). Auto-dismisses after a delay; honors reduced
 * motion through the shared `--motion-allowed` token via motion's reduced-motion
 * handling.
 */

"use client";

import { Zap } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import { cn } from "@/shared/utils";
import { type AchievementDef, getCategoryMeta } from "../data/achievements";

export interface AchievementToastProps {
  def: AchievementDef;
  onDismiss: () => void;
  /** Auto-dismiss delay in ms. */
  durationMs?: number;
}

export function AchievementToast({ def, onDismiss, durationMs = 5000 }: AchievementToastProps) {
  const cat = getCategoryMeta(def.category);
  const Icon = def.icon;

  useEffect(() => {
    const t = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(t);
  }, [onDismiss, durationMs]);

  return (
    <AnimatePresence>
      <motion.div
        key={def.id}
        initial={{ opacity: 0, x: 48 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 48 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        className="fixed top-6 right-6 z-[10001]"
        role="status"
        aria-live="polite"
      >
        <div
          className={cn(
            "flex items-center gap-3 rounded-xl border px-4 py-3 shadow-2xl bg-slate-900 min-w-[300px]",
            cat.borderColor,
          )}
        >
          <div className={cn("p-2 rounded-lg", cat.bgColor)}>
            <Icon className={cn("size-5", cat.textColor)} />
          </div>
          <div className="flex-1">
            <p className={cn("text-xs font-semibold", cat.textColor)}>Achievement Unlocked!</p>
            <p className="text-sm font-bold text-slate-100">{def.name}</p>
            <p className="text-xs text-slate-400">{def.description}</p>
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold border self-start",
              cat.textColor,
              cat.bgColor,
              cat.borderColor,
            )}
          >
            <Zap className="size-3" />+{def.xp} XP
          </span>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default AchievementToast;
