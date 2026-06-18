// ─── Store → Dexie history mirror (durable write-through + backfill) ─────────
//
// The four Zustand stores remain the synchronous app-wide write API. This module
// fans every event into the durable, queryable `historyDB` (history-db.ts) so a
// long-running offline session keeps a real audit log instead of silently losing
// old rows to the in-memory 500/200/50 caps.
//
// - One-time idempotent backfill lifts whatever is currently in the stores into
//   Dexie exactly once (guarded by a `_backfill` version row).
// - Live subscribers append future events via upsert-by-id (idempotent), so a
//   re-render or reload never duplicates a row.
// - A boot prune enforces the durable retention policy.
//
// Mounted once from the route screen effect (client-only). Fully offline.

import { useActivityStore } from "@/core/stores/activity-store";
import { useDataStore } from "@/core/stores/data-store";
import { mirrorStoreToDexie, runOnceBackfill } from "@/platform/storage";

import type { HistoryRow } from "../model/types";
import {
  appendHistory,
  historyDB,
  pruneHistory,
} from "./history-db";
import {
  activityRow,
  datasetRow,
  queryRow,
  transformRow,
} from "./normalize";

const BACKFILL_VERSION = 1;
let started = false;

/**
 * Start the durable history mirror. Idempotent at the module level — calling it
 * again (StrictMode double-effect, HMR) is a no-op and returns the existing
 * teardown. Returns a function that stops all live subscriptions.
 */
export function startHistoryMirror(): () => void {
  if (started) return stopHistoryMirror;
  started = true;

  // 1) One-time backfill: persist whatever is already in the stores, exactly
  //    once. Upsert-by-id makes it safe even if the guard ever misfires.
  void runOnceBackfill(historyDB, "history", BACKFILL_VERSION, async () => {
    const data = useDataStore.getState();
    const activity = useActivityStore.getState();
    const rows: HistoryRow[] = [
      ...activity.events.map(activityRow),
      ...data.datasets.map(datasetRow),
      ...data.transforms.map(transformRow),
      ...data.queryHistory.map(queryRow),
    ];
    await appendHistory(rows);
  })
    // 2) Retention/compaction after backfill settles.
    .then(() => pruneHistory())
    .catch(() => {
      // best-effort durability — never throw into the UI
    });

  // 3) Live mirrors — fire only when the selected slice changes (referential).
  const unsubs: Array<() => void> = [
    mirrorStoreToDexie(
      useActivityStore,
      (s) => s.events,
      (events) => void appendHistory(events.map(activityRow)),
    ),
    mirrorStoreToDexie(
      useDataStore,
      (s) => s.datasets,
      (datasets) => void appendHistory(datasets.map(datasetRow)),
    ),
    mirrorStoreToDexie(
      useDataStore,
      (s) => s.transforms,
      (transforms) => void appendHistory(transforms.map(transformRow)),
    ),
    mirrorStoreToDexie(
      useDataStore,
      (s) => s.queryHistory,
      (queryHistory) => void appendHistory(queryHistory.map(queryRow)),
    ),
  ];

  liveUnsubs = unsubs;
  return stopHistoryMirror;
}

let liveUnsubs: Array<() => void> = [];

export function stopHistoryMirror(): void {
  for (const stop of liveUnsubs) stop();
  liveUnsubs = [];
  started = false;
}
