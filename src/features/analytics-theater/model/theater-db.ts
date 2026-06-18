"use client";

/**
 * Durable, offline persistence for authored theaters via Dexie / IndexedDB.
 *
 * Presentation state (scene order, narration, name) must survive reloads so a
 * "theater" can be authored, saved, reopened and exported entirely offline —
 * never localStorage-as-DB. We own this Dexie database (separate from the shared
 * app-db) because it stores a feature-specific record shape; we still call
 * `ensurePersistentStorage()` semantics via `navigator.storage.persist()` once.
 */

import Dexie, { type Table } from "dexie";
import type { Theater } from "./scene";

class TheaterDatabase extends Dexie {
  theaters!: Table<Theater, string>;

  constructor() {
    super("data-navigator-analytics-theater");
    this.version(1).stores({
      // Primary key id; secondary indexes for dataset scoping + recency.
      theaters: "id, datasetId, updatedAt",
    });
  }
}

let dbSingleton: TheaterDatabase | null = null;

function db(): TheaterDatabase {
  if (!dbSingleton) dbSingleton = new TheaterDatabase();
  return dbSingleton;
}

let persistRequested = false;
/** Ask the browser to keep our IndexedDB data durable (once). */
export async function requestPersistentStorage(): Promise<void> {
  if (persistRequested) return;
  persistRequested = true;
  try {
    await navigator.storage?.persist?.();
  } catch {
    // Non-fatal: persistence is best-effort.
  }
}

/** Save (insert or replace) an authored theater. */
export async function saveTheater(theater: Theater): Promise<void> {
  await requestPersistentStorage();
  await db().theaters.put({ ...theater, updatedAt: Date.now() });
}

/** List theaters for a dataset, most-recently-updated first. */
export async function listTheaters(datasetId: string): Promise<Theater[]> {
  if (!datasetId) return [];
  const rows = await db()
    .theaters.where("datasetId")
    .equals(datasetId)
    .toArray();
  return rows.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getTheater(id: string): Promise<Theater | undefined> {
  return db().theaters.get(id);
}

export async function deleteTheater(id: string): Promise<void> {
  await db().theaters.delete(id);
}
