/**
 * Reactive bridge: real telemetry → achievement unlocks.
 *
 * Subscribes to the real dataset registry and the real workspace activity log,
 * derives live metrics, and idempotently unlocks any achievement whose goal is
 * now satisfied. Returns the live metrics + XP so the UI can render real
 * progress bars (replacing the former hardcoded `progress: {current, max}`).
 *
 * This runs entirely in-process and offline — no event bus indirection is
 * needed because the producing stores are already reactive zustand stores.
 */

"use client";

import { useEffect, useMemo } from "react";
import { useActivityStore } from "@/core/stores/activity-store";
import { useDataStore } from "@/core/stores/data-store";
import { ensurePersistentStorage } from "@/platform/storage";
import { ACHIEVEMENTS } from "../data/achievements";
import { useAchievements } from "../store/achievements-store";
import { computeMetrics, evaluate, type Metrics } from "./rules";

export interface AchievementSync {
  metrics: Metrics;
  xp: number;
}

function computeXp(unlocked: Record<string, string>): number {
  return ACHIEVEMENTS.reduce((sum, a) => (unlocked[a.id] ? sum + a.xp : sum), 0);
}

export function useAchievementSync(): AchievementSync {
  const datasets = useDataStore((s) => s.datasets);
  const events = useActivityStore((s) => s.events);
  const unlocked = useAchievements((s) => s.unlocked);
  const unlock = useAchievements((s) => s.unlock);

  const metrics = useMemo(() => computeMetrics(datasets, events), [datasets, events]);
  const xp = useMemo(() => computeXp(unlocked), [unlocked]);

  // Resist browser/OS eviction of the achievement progress (one-shot, offline).
  useEffect(() => {
    void ensurePersistentStorage().catch(() => {});
  }, []);

  useEffect(() => {
    // Evaluate against the latest store snapshot to avoid stale closures.
    const state = useAchievements.getState();
    const currentXp = computeXp(state.unlocked);
    const newly = evaluate(metrics, currentXp, state.unlocked);
    if (newly.length === 0) return;
    // Cascade: unlocking xp-gated/meta achievements can satisfy further ones,
    // so re-evaluate until the set stabilises (bounded by achievement count).
    for (let i = 0; i < 4; i += 1) {
      const snapshot = useAchievements.getState();
      const xpNow = computeXp(snapshot.unlocked);
      const round = evaluate(metrics, xpNow, snapshot.unlocked);
      if (round.length === 0) break;
      for (const id of round) unlock(id);
    }
  }, [metrics, unlock]);

  return { metrics, xp };
}
