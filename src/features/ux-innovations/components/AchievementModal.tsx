/**
 * Achievement detail modal — pure presentational. The former fake
 * "who also has this" multi-user roster (impossible offline) is removed; the
 * modal now shows real live progress toward the goal instead.
 */

"use client";

import { CheckCircle, ChevronRight, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/utils";
import { type AchievementDef, getCategoryMeta } from "../data/achievements";
import type { AchievementProgress } from "../events/rules";

export interface AchievementModalProps {
  def: AchievementDef;
  unlocked: boolean;
  unlockedAt?: string | null;
  progress?: AchievementProgress;
  claimed: boolean;
  onClose: () => void;
  onClaim: (id: string) => void;
}

export function AchievementModal({
  def,
  unlocked,
  unlockedAt,
  progress,
  claimed,
  onClose,
  onClaim,
}: AchievementModalProps) {
  const cat = getCategoryMeta(def.category);
  const Icon = def.icon;
  const hasProgress = !unlocked && !!progress && progress.target > 0;
  const pct = hasProgress
    ? Math.min(100, Math.round((progress.current / progress.target) * 100))
    : 0;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
        role="button"
        tabIndex={0}
        aria-label="Close"
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClose();
          }
        }}
      />
      <div
        className={cn(
          "relative z-10 w-full max-w-md rounded-2xl border bg-slate-900 shadow-2xl",
          cat.borderColor,
        )}
      >
        <div className={cn("p-6 rounded-t-2xl border-b", cat.bgColor, cat.borderColor)}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div
                className={cn(
                  "w-14 h-14 rounded-2xl border-2 flex items-center justify-center",
                  cat.borderColor,
                  cat.bgColor,
                )}
              >
                <Icon
                  className={cn("size-8", unlocked ? cat.textColor : "text-slate-600 opacity-40")}
                />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-100">
                  {def.secret && !unlocked ? "???" : def.name}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className={cn("text-xs font-medium", cat.textColor)}>{cat.label}</span>
                  {def.secret && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-950/60 border border-rose-700/40 text-rose-400">
                      SECRET
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-500 hover:text-slate-200 transition-colors mt-1"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <p className="text-sm text-slate-300 leading-relaxed">
            {def.secret && !unlocked
              ? "This is a secret achievement. Keep using Data Navigator to reveal its requirements."
              : def.description}
          </p>

          {(!def.secret || unlocked) && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                How to unlock
              </p>
              <ul className="space-y-1.5">
                {def.howToUnlock.map((step) => (
                  <li key={step} className="flex items-start gap-2 text-xs text-slate-300">
                    <ChevronRight className={cn("size-3.5 mt-0.5 flex-shrink-0", cat.textColor)} />
                    {step}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold border",
                cat.textColor,
                cat.bgColor,
                cat.borderColor,
              )}
            >
              <Zap className="size-4" />
              {def.xp} XP Reward
            </span>
            {unlocked && (
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold border border-emerald-700/40 bg-emerald-950/30 text-emerald-400">
                <CheckCircle className="size-4" />
                {unlockedAt
                  ? new Date(unlockedAt).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })
                  : "Earned"}
              </span>
            )}
          </div>

          {hasProgress && progress && (
            <div>
              <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                <span>Progress</span>
                <span className="font-medium">
                  {progress.current.toLocaleString()} / {progress.target.toLocaleString()}
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full",
                    cat.textColor.replace("text-", "bg-").replace("-400", "-600"),
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-500 mt-1">{pct}% complete</p>
            </div>
          )}
        </div>

        <div className="px-6 pb-6 flex items-center gap-3">
          {unlocked && !claimed && (
            <Button
              className={cn(
                "flex-1",
                cat.bgColor,
                cat.textColor,
                "border",
                cat.borderColor,
                "hover:opacity-80 font-semibold",
              )}
              onClick={() => {
                onClaim(def.id);
                onClose();
              }}
            >
              <Zap className="size-4 mr-1.5" />
              Claim {def.xp} XP
            </Button>
          )}
          <Button
            variant="outline"
            className="flex-1 border-slate-700 text-slate-300 hover:text-slate-100"
            onClick={onClose}
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

export default AchievementModal;
