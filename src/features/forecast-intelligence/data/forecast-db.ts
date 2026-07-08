"use client";

/**
 * Forecast-intelligence local persistence (IndexedDB via Dexie).
 *
 * Saved what-if scenarios used to live only in React state and were lost on
 * reload. This feature-local Dexie DB persists them as small structured records
 * so the workspace survives a refresh — fully on-device, zero network.
 *
 * Scenarios are scoped by the dataset (`tableName`) they were built against, so
 * switching datasets shows the right saved set and never mixes baselines.
 *
 * Mirrors the Dexie conventions already used by
 * `@/features/report-studio/data/db` and `@/features/help/lib/onboarding-db`;
 * the shared platform store (`@/platform/storage/app-db`) intentionally does not
 * carry feature-specific tables, so we keep our own versioned DB and reuse the
 * platform's `newId` / `toCloneSafeValue` helpers for id + clone safety.
 */

import Dexie, { type Table } from "dexie";
import { newId, toCloneSafeValue } from "@/platform/storage";

/** A persisted what-if revenue scenario, tied to a dataset baseline. */
export interface SavedScenarioRecord {
  id: string;
  /** Dataset/table the scenario was built against (its baseline source). */
  tableName: string;
  name: string;
  updatedAt: number;
  /** What-if adjustments (the deterministic inputs). */
  successAdj: number;
  volumeAdj: number;
  amountAdj: number;
  /** Snapshot of the projected daily revenue + delta at save time. */
  projectedRevenue: number;
  delta: number;
}

class ForecastDatabase extends Dexie {
  scenarios!: Table<SavedScenarioRecord, string>;

  constructor() {
    super("data-navigator-forecast-v1");
    this.version(1).stores({
      // Compound [tableName+updatedAt] index → one range read per dataset,
      // newest first.
      scenarios: "id, tableName, updatedAt, [tableName+updatedAt]",
    });
  }
}

export const forecastDb = new ForecastDatabase();

/** Persist (insert or update) a scenario for a dataset. Returns its id. */
export async function putScenario(
  rec: Omit<SavedScenarioRecord, "id" | "updatedAt"> & {
    id?: string;
    updatedAt?: number;
  },
): Promise<string> {
  const id = rec.id ?? newId();
  // Funnel through the platform clone-safe sanitiser to avoid DataCloneError
  // on any accidental non-cloneable field, then coerce back to our shape.
  const safe = toCloneSafeValue({
    ...rec,
    id,
    updatedAt: rec.updatedAt ?? Date.now(),
  }) as SavedScenarioRecord;
  await forecastDb.scenarios.put(safe);
  return id;
}

/** Newest scenarios saved against a dataset (one compound-index range read). */
export async function listScenarios(tableName: string): Promise<SavedScenarioRecord[]> {
  if (!tableName) return [];
  return forecastDb.scenarios
    .where("[tableName+updatedAt]")
    .between([tableName, Dexie.minKey], [tableName, Dexie.maxKey])
    .reverse()
    .toArray();
}

/** Delete one saved scenario by id. */
export async function deleteScenario(id: string): Promise<void> {
  await forecastDb.scenarios.delete(id);
}
