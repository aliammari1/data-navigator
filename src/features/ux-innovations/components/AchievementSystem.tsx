/**
 * AchievementSystem — thin shell.
 *
 * The former 2,320-line monolith (fake leaderboard/activity/heatmap fixtures,
 * a localStorage compat shim, dual `unlockedIds` state, main-thread
 * `react-confetti-boom`, in-render sorts) is gone. This shell:
 *   - reads ONE reactive source of truth (`useAchievements` store),
 *   - wires real telemetry → unlocks via `useAchievementSync` (datasets +
 *     activity log → rules engine), so every number is real,
 *   - lazy-loads each tab + the celebration burst behind `next/dynamic`,
 *   - subscribes through narrow selectors and memoizes all derived values.
 *
 * It is single-user / offline-legal: no cross-user ranking. "Progress" and
 * "History" are computed from the real local unlock log.
 */

"use client";

import { Award, Flame, Target, Trophy, Zap } from "lucide-react";
import dynamic from "next/dynamic";
import type React from "react";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/utils";
import { ACHIEVEMENTS, type AchievementDef } from "../data/achievements";
import { getLevelInfo } from "../data/levels";
import { progressFor } from "../events/rules";
import { useAchievementSync } from "../events/use-achievement-sync";
import {
  selectUnlocked,
  selectUnlockedCount,
  selectXP,
  useAchievements,
} from "../store/achievements-store";
import { LevelBadge } from "./LevelBadge";

const AchievementsTab = dynamic(() => import("./tabs/AchievementsTab"), { ssr: false });
const ProgressTab = dynamic(() => import("./tabs/ProgressTab"), { ssr: false });
const HistoryTab = dynamic(() => import("./tabs/HistoryTab"), { ssr: false });
const AchievementModal = dynamic(() => import("./AchievementModal"), { ssr: false });
const AchievementToast = dynamic(() => import("./AchievementToast"), { ssr: false });
// Confetti library loads ONLY when a real claim fires.
const Celebrate = dynamic(() => import("./Celebrate"), { ssr: false });

type TabId = "achievements" | "progress" | "history";

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "achievements", label: "Achievements", icon: Trophy },
  { id: "progress", label: "Progress", icon: Award },
  { id: "history", label: "History", icon: Zap },
];

export function AchievementSystem() {
  // Real telemetry → unlocks. Returns live metrics + xp used for progress bars.
  const { metrics } = useAchievementSync();

  const xp = useAchievements(selectXP);
  const unlocked = useAchievements(selectUnlocked);
  const unlockedCount = useAchievements(selectUnlockedCount);
  const claimed = useAchievements.use.claimed();
  const claim = useAchievements.use.claim();

  const [activeTab, setActiveTab] = useState<TabId>("achievements");
  const [selectedDef, setSelectedDef] = useState<AchievementDef | null>(null);
  const [toastDef, setToastDef] = useState<AchievementDef | null>(null);
  const [celebrate, setCelebrate] = useState(false);

  const lvlInfo = useMemo(() => getLevelInfo(xp), [xp]);
  const LevelIconComp = lvlInfo.level.icon;
  const completionPct = useMemo(
    () => Math.round((unlockedCount / ACHIEVEMENTS.length) * 100),
    [unlockedCount],
  );

  const handleClaim = useCallback(
    (id: string) => {
      claim(id);
      const def = ACHIEVEMENTS.find((a) => a.id === id);
      if (def) {
        setToastDef(def);
        setCelebrate(true);
      }
    },
    [claim],
  );

  const handleView = useCallback((def: AchievementDef) => setSelectedDef(def), []);

  const selectedProgress = useMemo(
    () => (selectedDef ? progressFor(selectedDef.id, metrics, xp, unlockedCount) : undefined),
    [selectedDef, metrics, xp, unlockedCount],
  );

  return (
    <>
      {celebrate && <Celebrate onDone={() => setCelebrate(false)} />}
      {toastDef && <AchievementToast def={toastDef} onDismiss={() => setToastDef(null)} />}
      {selectedDef && (
        <AchievementModal
          def={selectedDef}
          unlocked={Boolean(unlocked[selectedDef.id])}
          unlockedAt={unlocked[selectedDef.id] ?? null}
          progress={selectedProgress}
          claimed={Boolean(claimed[selectedDef.id])}
          onClose={() => setSelectedDef(null)}
          onClaim={handleClaim}
        />
      )}

      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-100 flex items-center gap-3">
              <div className="p-2 rounded-xl bg-yellow-900/30 border border-yellow-700/30">
                <Trophy className="size-7 text-yellow-400" />
              </div>
              Achievements
            </h1>
            <p className="text-sm text-slate-400 mt-1 ml-1">
              Track your progress and earn XP as you use Data Navigator — fully offline.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <LevelBadge level={lvlInfo.level.name} size="lg" />
            <span className="text-xl font-black text-slate-100">{xp.toLocaleString()} XP</span>
          </div>
        </div>

        {/* Level progress + summary */}
        <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-5">
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-yellow-900/20 border border-yellow-700/20 p-3">
              <LevelIconComp className={cn("size-8", lvlInfo.level.color)} />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <LevelBadge level={lvlInfo.level.name} size="md" />
                  {lvlInfo.next && (
                    <span className="text-xs text-slate-500">
                      Next:{" "}
                      <span className={cn("font-medium", lvlInfo.next.color)}>
                        {lvlInfo.next.name}
                      </span>
                    </span>
                  )}
                </div>
                <span className="text-sm font-bold text-slate-100">{xp.toLocaleString()} XP</span>
              </div>
              <div className="h-3 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-yellow-700 to-yellow-400 transition-all duration-1000"
                  style={{ width: `${lvlInfo.pct}%` }}
                />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-xs text-slate-600">{lvlInfo.level.min} XP</span>
                {lvlInfo.next ? (
                  <span className="text-xs text-yellow-500 font-medium">
                    {lvlInfo.xpToNext} XP to {lvlInfo.next.name}
                  </span>
                ) : (
                  <span className="text-xs text-violet-400 font-medium">MAX LEVEL</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Real stats row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            {
              label: "Unlocked",
              value: `${unlockedCount}/${ACHIEVEMENTS.length}`,
              color: "text-yellow-400",
              icon: Trophy,
            },
            {
              label: "Total XP",
              value: xp.toLocaleString(),
              color: "text-blue-400",
              icon: Zap,
            },
            {
              label: "Complete",
              value: `${completionPct}%`,
              color: "text-emerald-400",
              icon: Target,
            },
          ].map(({ label, value, color, icon: Icon }) => (
            <div
              key={label}
              className="rounded-xl border border-slate-800 bg-slate-900 p-3 text-center"
            >
              <Icon className={cn("size-4 mx-auto mb-1", color)} />
              <p className={cn("text-lg font-black", color)}>{value}</p>
              <p className="text-[10px] text-slate-500">{label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-slate-800">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              type="button"
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-all border-b-2 -mb-px",
                activeTab === id
                  ? "border-blue-500 text-blue-400 bg-blue-950/20"
                  : "border-transparent text-slate-500 hover:text-slate-200 hover:bg-slate-800/50",
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>

        {activeTab === "achievements" && (
          <AchievementsTab
            metrics={metrics}
            xp={xp}
            claimed={claimed}
            onClaim={handleClaim}
            onView={handleView}
          />
        )}
        {activeTab === "progress" && <ProgressTab />}
        {activeTab === "history" && <HistoryTab />}

        {/* Honest empty-state hint instead of a fake demo-unlock panel. */}
        {unlockedCount === 0 && (
          <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/50 p-4 flex items-center gap-3">
            <Flame className="size-4 text-orange-400 flex-shrink-0" />
            <p className="text-xs text-slate-400">
              Achievements unlock automatically from real activity — import a dataset, run a query,
              or explore screens to start earning XP.
            </p>
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <ResetControl />
        </div>
      </div>
    </>
  );
}

/** Small inline reset control wired to the real store reset (dev/utility). */
function ResetControl() {
  const reset = useAchievements.use.reset();
  const [confirm, setConfirm] = useState(false);
  if (!confirm) {
    return (
      <Button
        variant="ghost"
        className="text-red-500 hover:text-red-400 hover:bg-red-950/30 gap-2 text-xs"
        onClick={() => setConfirm(true)}
      >
        Reset Progress
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-red-400">Reset all achievement progress?</span>
      <Button
        size="sm"
        variant="ghost"
        className="text-slate-400 hover:bg-slate-800 text-xs"
        onClick={() => setConfirm(false)}
      >
        Cancel
      </Button>
      <Button
        size="sm"
        className="bg-red-900 text-red-100 hover:bg-red-800 text-xs"
        onClick={() => {
          reset();
          setConfirm(false);
        }}
      >
        Reset All
      </Button>
    </div>
  );
}

export default AchievementSystem;
