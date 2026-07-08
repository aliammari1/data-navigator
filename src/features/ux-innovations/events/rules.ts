/**
 * Achievement rules engine — connects REAL app telemetry to unlocks.
 *
 * Live metrics are computed deterministically from:
 *   - the real dataset registry (`useDataStore().datasets`), and
 *   - the real workspace activity log (`useActivityStore().events`).
 *
 * There is no fake data and no network: everything is derived from local,
 * persisted state that real user actions (upload, select, transform, query,
 * telecom-analysis-save, navigation) write into those shared stores.
 */

import type { Dataset } from "@/core/stores/data-store";
import type { ActivityEvent } from "@/core/stores/activity-store";
import { ACHIEVEMENTS, type MetricId } from "../data/achievements";

export type Metrics = Record<MetricId, number>;

/**
 * Compute every live metric from real datasets + activity events.
 * Pure function of its inputs → safe to memoize on the caller side.
 */
export function computeMetrics(datasets: Dataset[], events: ActivityEvent[]): Metrics {
  let datasetsSelected = 0;
  let transformsRun = 0;
  let queriesRun = 0;
  let telecomAnalysesSaved = 0;
  const screens = new Set<string>();

  for (const e of events) {
    switch (e.type) {
      case "dataset_selected":
        datasetsSelected += 1;
        break;
      case "transform_run":
        transformsRun += 1;
        break;
      case "query_run":
        queriesRun += 1;
        break;
      case "telecom_analysis_saved":
        telecomAnalysesSaved += 1;
        break;
      case "telecom_opened":
        screens.add("telecom");
        break;
      case "dataset_uploaded":
        // Counted from the dataset registry below for accuracy across sessions.
        break;
    }
    // Any event carrying a tableName/datasetId implies a visited surface; use
    // the navigation-style event metadata to approximate screens visited.
    const screen = (e.metadata?.screen ?? e.metadata?.href) as string | undefined;
    if (screen) screens.add(screen);
  }

  const totalRowsProcessed = datasets.reduce((sum, d) => sum + (d.rowCount || 0), 0);

  return {
    datasetsUploaded: datasets.length,
    totalRowsProcessed,
    datasetsSelected,
    transformsRun,
    queriesRun,
    telecomAnalysesSaved,
    screensVisited: screens.size,
  };
}

export interface AchievementProgress {
  /** Current measured value for the achievement's goal (0 when no goal). */
  current: number;
  /** Target threshold (0 when no goal). */
  target: number;
  /** Whether real telemetry now satisfies the goal. */
  reached: boolean;
}

/** Resolve live progress for a single achievement id against metrics. */
export function progressFor(
  achievementId: string,
  metrics: Metrics,
  xp: number,
  unlockedCount: number,
): AchievementProgress {
  const def = ACHIEVEMENTS.find((a) => a.id === achievementId);
  if (!def) return { current: 0, target: 0, reached: false };

  // Meta achievements that depend on derived totals rather than a single metric.
  if (def.id === "master-analyst") {
    return { current: Math.min(xp, 500), target: 500, reached: xp >= 500 };
  }
  if (def.id === "legend") {
    return { current: Math.min(xp, 5000), target: 5000, reached: xp >= 5000 };
  }
  if (def.id === "data-wizard") {
    const dataExpert = ACHIEVEMENTS.filter(
      (a) => a.category === "DATA_EXPERT" && a.id !== "data-wizard",
    );
    return {
      current: unlockedCount,
      target: dataExpert.length,
      reached: false, // resolved by the engine which knows which ids are unlocked
    };
  }

  if (!def.goal) return { current: 0, target: 0, reached: false };
  const current = metrics[def.goal.metric] ?? 0;
  return { current, target: def.goal.target, reached: current >= def.goal.target };
}

/**
 * Determine which achievement ids should now be unlocked, given live metrics,
 * the current XP total, and the set of already-unlocked ids. Returns only the
 * ids that are *newly* satisfied (not already unlocked) so callers can unlock
 * idempotently and celebrate once.
 */
export function evaluate(metrics: Metrics, xp: number, unlocked: Record<string, string>): string[] {
  const newlyUnlocked: string[] = [];
  const isUnlocked = (id: string) => Boolean(unlocked[id]) || newlyUnlocked.includes(id);

  // First pass: metric-based + xp-based goals.
  for (const def of ACHIEVEMENTS) {
    if (isUnlocked(def.id)) continue;
    if (def.id === "master-analyst") {
      if (xp >= 500) newlyUnlocked.push(def.id);
      continue;
    }
    if (def.id === "legend") {
      if (xp >= 5000) newlyUnlocked.push(def.id);
      continue;
    }
    if (def.id === "data-wizard") continue; // resolved in second pass
    if (def.goal) {
      const current = metrics[def.goal.metric] ?? 0;
      if (current >= def.goal.target) newlyUnlocked.push(def.id);
    }
  }

  // Second pass: "data-wizard" depends on the full Data Expert set being done.
  if (!isUnlocked("data-wizard")) {
    const dataExpert = ACHIEVEMENTS.filter(
      (a) => a.category === "DATA_EXPERT" && a.id !== "data-wizard",
    );
    if (dataExpert.length > 0 && dataExpert.every((a) => isUnlocked(a.id))) {
      newlyUnlocked.push("data-wizard");
    }
  }

  return newlyUnlocked;
}
