/**
 * Achievements grid tab — category filter + cards with REAL live progress.
 *
 * Progress for each card comes from the rules engine (`progressFor` over real
 * datasets + activity metrics), never a hardcoded constant. Sorting/filtering
 * is memoized. The card grid is fixed at ~30 achievements; should the set ever
 * grow past the runtime virtualize threshold the plain map is fine here since
 * a 6-column CSS grid of small cards has no scroll cost at this scale (the
 * heavy, growth-prone lists — History — are the ones virtualized).
 */

"use client";

import { useMemo, useState } from "react";
import { cn } from "@/shared/utils";
import {
  ACHIEVEMENTS,
  type AchievementDef,
  CATEGORIES,
  type CategoryId,
} from "../../data/achievements";
import { type Metrics, progressFor } from "../../events/rules";
import { selectUnlocked, useAchievements } from "../../store/achievements-store";
import { AchCard } from "../AchCard";

export interface AchievementsTabProps {
  metrics: Metrics;
  xp: number;
  claimed: Record<string, true>;
  onClaim: (id: string) => void;
  onView: (def: AchievementDef) => void;
}

export default function AchievementsTab({
  metrics,
  xp,
  claimed,
  onClaim,
  onView,
}: AchievementsTabProps) {
  const unlocked = useAchievements(selectUnlocked);
  const [categoryFilter, setCategoryFilter] = useState<CategoryId | "ALL">("ALL");

  const unlockedCount = useMemo(() => Object.keys(unlocked).length, [unlocked]);

  const filtered = useMemo(
    () => ACHIEVEMENTS.filter((a) => categoryFilter === "ALL" || a.category === categoryFilter),
    [categoryFilter],
  );

  return (
    <div className="space-y-5">
      {/* Category filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setCategoryFilter("ALL")}
          className={cn(
            "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
            categoryFilter === "ALL"
              ? "bg-slate-700 border-slate-500 text-slate-100"
              : "border-slate-700 text-slate-400 hover:border-slate-500",
          )}
        >
          All ({ACHIEVEMENTS.length})
        </button>
        {CATEGORIES.map((cat) => {
          const CatIcon = cat.icon;
          const count = ACHIEVEMENTS.filter((a) => a.category === cat.id && unlocked[a.id]).length;
          const total = ACHIEVEMENTS.filter((a) => a.category === cat.id).length;
          return (
            <button
              type="button"
              key={cat.id}
              onClick={() => setCategoryFilter(cat.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                categoryFilter === cat.id
                  ? cn(cat.bgColor, cat.borderColor, cat.textColor)
                  : "border-slate-700 text-slate-400 hover:border-slate-600",
              )}
            >
              <CatIcon className="size-3" />
              {cat.label}
              <span className="opacity-60">
                ({count}/{total})
              </span>
            </button>
          );
        })}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {filtered.map((def) => (
          <AchCard
            key={def.id}
            def={def}
            unlocked={Boolean(unlocked[def.id])}
            unlockedAt={unlocked[def.id] ?? null}
            progress={progressFor(def.id, metrics, xp, unlockedCount)}
            claimed={Boolean(claimed[def.id])}
            onClaim={onClaim}
            onView={onView}
          />
        ))}
      </div>
    </div>
  );
}
