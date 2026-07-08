/**
 * Single achievement card — pure presentational. Progress is REAL: the
 * `{current,target}` shown comes from the live rules engine
 * (`progressFor` over real datasets + activity), never a hardcoded constant.
 */

"use client";

import { Lock, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/utils";
import { type AchievementDef, getCategoryMeta } from "../data/achievements";
import type { AchievementProgress } from "../events/rules";

export interface AchCardProps {
  def: AchievementDef;
  unlocked: boolean;
  unlockedAt?: string | null;
  /** Live progress toward the goal (omitted/zero-target when not goal-based). */
  progress?: AchievementProgress;
  claimed: boolean;
  onClaim: (id: string) => void;
  onView: (def: AchievementDef) => void;
}

export function AchCard({
  def,
  unlocked,
  unlockedAt,
  progress,
  claimed,
  onClaim,
  onView,
}: AchCardProps) {
  const cat = getCategoryMeta(def.category);
  const Icon = def.icon;
  const hasProgress = !unlocked && !!progress && progress.target > 0;
  const pct = hasProgress
    ? Math.min(100, Math.round((progress.current / progress.target) * 100))
    : 0;

  return (
    <div
      className={cn(
        "relative rounded-xl border p-4 transition-all duration-300 cursor-pointer group",
        "hover:shadow-lg hover:-translate-y-0.5",
        unlocked
          ? cn("bg-slate-900", cat.borderColor, cat.bgColor)
          : "border-slate-800 bg-slate-900/50",
        !unlocked && def.secret && "border-dashed",
      )}
      role="button"
      tabIndex={0}
      onClick={() => onView(def)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onView(def);
        }
      }}
    >
      {!unlocked && (
        <div className="absolute inset-0 rounded-xl bg-slate-950/50 backdrop-blur-[1px] flex items-center justify-center z-10 pointer-events-none">
          <Lock className="size-5 text-slate-600" />
        </div>
      )}

      {def.secret && !unlocked && (
        <div className="absolute top-2 right-2 z-20">
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-950/60 border border-rose-700/40 text-rose-400 font-medium">
            SECRET
          </span>
        </div>
      )}

      {unlocked && (
        <div className="absolute top-2 right-2">
          <span
            className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-full font-medium border",
              claimed
                ? "bg-emerald-950/60 border-emerald-700/40 text-emerald-400"
                : "bg-amber-950/60 border-amber-700/40 text-amber-400 animate-pulse",
            )}
          >
            {claimed ? "Earned!" : "Claim!"}
          </span>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div
          className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all",
            unlocked
              ? cn("opacity-100", cat.bgColor, "border", cat.borderColor)
              : "opacity-20 grayscale bg-slate-800",
          )}
        >
          <Icon className={cn("size-5", unlocked ? cat.textColor : "text-slate-600")} />
        </div>

        <div>
          <p
            className={cn(
              "text-sm font-semibold leading-tight",
              unlocked ? "text-slate-100" : "text-slate-600",
            )}
          >
            {def.secret && !unlocked ? "???" : def.name}
          </p>
          <p
            className={cn(
              "text-xs mt-0.5 leading-snug",
              unlocked ? "text-slate-400" : "text-slate-700",
            )}
          >
            {def.secret && !unlocked ? "Unlock related achievements to reveal…" : def.description}
          </p>
        </div>

        <div className="flex items-center justify-between">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold border",
              unlocked
                ? cn(cat.textColor, cat.bgColor, cat.borderColor)
                : "text-slate-600 bg-slate-800/50 border-slate-700/30",
            )}
          >
            <Zap className="size-3" />
            {def.xp} XP
          </span>
        </div>

        {hasProgress && progress && (
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>Progress</span>
              <span>
                {progress.current.toLocaleString()}/{progress.target.toLocaleString()}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  cat.textColor.replace("text-", "bg-").replace("-400", "-600"),
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}

        {unlocked && unlockedAt && (
          <p className={cn("text-[10px]", cat.textColor, "opacity-70")}>
            Earned{" "}
            {new Date(unlockedAt).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </p>
        )}

        {unlocked && !claimed && (
          <Button
            size="sm"
            className={cn(
              "w-full h-7 text-xs mt-1",
              cat.bgColor,
              cat.textColor,
              "border",
              cat.borderColor,
              "hover:opacity-80",
            )}
            onClick={(e) => {
              e.stopPropagation();
              onClaim(def.id);
            }}
          >
            Claim Reward
          </Button>
        )}
      </div>
    </div>
  );
}

export default AchCard;
