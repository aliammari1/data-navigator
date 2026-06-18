/**
 * Progress tab — REAL personal progress (single-user, offline-legal). Replaces
 * the former fake multi-user "Stats" tab (PERSONAL_STATS / HEATMAP_DATA
 * constants).
 *
 * Everything here is derived from real local state:
 *   - XP / level from the unlock store,
 *   - per-category completion from real unlocked ids,
 *   - the activity heatmap from the REAL unlock event log timestamps (bucketed
 *     by day), not a hardcoded intensity grid.
 */

"use client";

import { useMemo } from "react";
import { cn } from "@/shared/utils";
import { ACHIEVEMENTS, CATEGORIES } from "../../data/achievements";
import { getLevelInfo } from "../../data/levels";
import {
  selectEvents,
  selectUnlocked,
  selectXP,
  useAchievements,
} from "../../store/achievements-store";
import { LevelBadge } from "../LevelBadge";

const HEATMAP_DAYS = ["M", "T", "W", "T", "F", "S", "S"];
const WEEKS = 7;

function heatClass(v: number): string {
  if (v === 0) return "bg-slate-800";
  if (v === 1) return "bg-blue-900";
  if (v === 2) return "bg-blue-700";
  if (v === 3) return "bg-blue-500";
  return "bg-blue-400";
}

/**
 * Bucket real unlock-event timestamps into the trailing `WEEKS * 7` day cells,
 * mapping each day's unlock count to an intensity 0–4. Aligns the grid so the
 * last column is the current (Monday-anchored) week.
 */
function buildHeatmap(events: { ts: string }[]): number[] {
  const days = WEEKS * 7;
  const counts = new Array<number>(days).fill(0);

  const today = new Date();
  // Monday-anchored end of the grid.
  const dow = (today.getDay() + 6) % 7; // 0 = Monday
  const lastCellDate = new Date(today);
  lastCellDate.setHours(0, 0, 0, 0);
  // Index of "today" within its week column.
  const startMs = lastCellDate.getTime() - (days - 1 - (6 - dow)) * 86_400_000;

  for (const e of events) {
    const t = new Date(e.ts);
    t.setHours(0, 0, 0, 0);
    const idx = Math.floor((t.getTime() - startMs) / 86_400_000);
    if (idx >= 0 && idx < days) counts[idx] += 1;
  }

  // Map raw counts → 0..4 intensity buckets.
  return counts.map((c) => (c === 0 ? 0 : c === 1 ? 1 : c === 2 ? 2 : c >= 3 && c < 5 ? 3 : 4));
}

export default function ProgressTab() {
  const xp = useAchievements(selectXP);
  const unlocked = useAchievements(selectUnlocked);
  const events = useAchievements(selectEvents);

  const lvl = useMemo(() => getLevelInfo(xp), [xp]);
  const LevelIcon = lvl.level.icon;

  const categoryStats = useMemo(
    () =>
      CATEGORIES.map((cat) => {
        const catAchs = ACHIEVEMENTS.filter((a) => a.category === cat.id);
        const done = catAchs.filter((a) => unlocked[a.id]).length;
        return { cat, unlocked: done, total: catAchs.length };
      }),
    [unlocked],
  );

  const heat = useMemo(() => buildHeatmap(events), [events]);
  const unlockedCount = useMemo(() => Object.keys(unlocked).length, [unlocked]);

  return (
    <div className="space-y-6">
      {/* Big XP / level card */}
      <div className="rounded-2xl border border-yellow-700/30 bg-gradient-to-br from-yellow-950/20 via-slate-900 to-slate-900 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="rounded-2xl bg-yellow-900/30 p-4">
              <LevelIcon className={cn("size-10", lvl.level.color)} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <LevelBadge level={lvl.level.name} size="lg" />
                {lvl.next && <span className="text-xs text-slate-500">Next: {lvl.next.name}</span>}
              </div>
              <p className="text-3xl font-black text-slate-100 mt-2">{xp.toLocaleString()} XP</p>
              {lvl.next && (
                <p className="text-sm text-slate-400 mt-0.5">
                  {lvl.xpToNext} XP to {lvl.next.name}
                </p>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-3xl font-black text-yellow-400">{lvl.pct}%</p>
            <p className="text-xs text-slate-500">to next level</p>
          </div>
        </div>
        <div className="mt-5">
          <div className="h-3 rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-yellow-600 to-yellow-400 transition-all duration-1000"
              style={{ width: `${lvl.pct}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-slate-500 mt-1">
            <span>{lvl.level.min} XP</span>
            {lvl.next && <span>{lvl.next.min} XP</span>}
          </div>
        </div>
      </div>

      {/* Real summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: "Achievements Unlocked", value: `${unlockedCount}/${ACHIEVEMENTS.length}` },
          { label: "Total XP Earned", value: xp.toLocaleString() },
          { label: "Current Level", value: lvl.level.name },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-xl font-black text-slate-100">{value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Category completion (real) */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-200">Category Progress</h3>
        {categoryStats.map(({ cat, unlocked: done, total }) => {
          const CatIcon = cat.icon;
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;
          return (
            <div key={cat.id} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CatIcon className={cn("size-4", cat.textColor)} />
                  <span className="text-sm text-slate-300 font-medium">{cat.label}</span>
                </div>
                <span className="text-xs text-slate-400">
                  {done}/{total}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-700",
                    cat.textColor.replace("text-", "bg-").replace("-400", "-600"),
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Real activity heatmap from unlock-event timestamps */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h3 className="text-sm font-semibold text-slate-200 mb-4">7-Week Unlock Activity</h3>
        <div className="grid grid-cols-7 gap-1 mb-1">
          {HEATMAP_DAYS.map((d, i) => (
            <div key={`${d}-${i}`} className="text-center text-[9px] text-slate-500 font-medium">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {heat.map((v, i) => (
            <div
              key={i}
              className={cn("rounded-sm aspect-square", heatClass(v))}
              title={`Intensity ${v}`}
            />
          ))}
        </div>
        <div className="flex items-center gap-2 mt-3 justify-end">
          <span className="text-[10px] text-slate-500">Less</span>
          {[0, 1, 2, 3, 4].map((v) => (
            <div key={v} className={cn("w-3 h-3 rounded-sm", heatClass(v))} />
          ))}
          <span className="text-[10px] text-slate-500">More</span>
        </div>
        {events.length === 0 && (
          <p className="text-xs text-slate-500 mt-3 text-center">
            No unlocks yet — use the app to start earning achievements.
          </p>
        )}
      </div>
    </div>
  );
}
