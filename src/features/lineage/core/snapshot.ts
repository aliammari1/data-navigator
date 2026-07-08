// ─── Lineage snapshot persistence (Dexie, offline) ───────────────────────────
//
// The v2 plan calls for persisting computed lineage snapshots to IndexedDB so
// the graph hydrates instantly offline and supports versioned diff/time-travel
// without recompute. This is a FEATURE-LOCAL Dexie DB (same pattern the app
// already uses for `help/lib/onboarding-db`); it does not touch the central
// app-db or any shared provider files.
//
// A snapshot is keyed by a content hash of the serialized input record
// ids/updatedAts — if the inputs have not changed since the last build, we
// hydrate the persisted model instead of recomputing.

import Dexie, { type Table } from "dexie";
import type { ColumnLineage, LEdge, LNode } from "./types";

export interface LineageModel {
  nodes: LNode[];
  edges: LEdge[];
  columnLineage: ColumnLineage[];
  positions: Record<string, { x: number; y: number }>;
}

export interface LineageSnapshot extends LineageModel {
  /** stable content hash of the build input */
  hash: string;
  createdAt: number;
}

class LineageDb extends Dexie {
  snapshots!: Table<LineageSnapshot, string>;

  constructor() {
    super("data-navigator-lineage-v1");
    this.version(1).stores({
      // hash = primary key; createdAt indexed for pruning / time-travel listing.
      snapshots: "hash, createdAt",
    });
  }
}

const MAX_SNAPSHOTS = 10;

let db: LineageDb | null = null;

/**
 * Lazily open the DB. Returns `null` when IndexedDB is unavailable (e.g. SSR /
 * locked-down environments) so callers degrade to recompute-every-time.
 */
function getDb(): LineageDb | null {
  if (typeof indexedDB === "undefined") return null;
  if (!db) {
    try {
      db = new LineageDb();
    } catch {
      return null;
    }
  }
  return db;
}

/**
 * Stable, order-independent content hash (FNV-1a 32-bit, hex). Cheap,
 * dependency-free, and good enough to detect whether the inputs changed.
 */
export function hashInput(parts: string[]): string {
  // Sort so input ordering does not change the hash.
  const joined = [...parts].sort().join("");
  let h = 0x811c9dc5;
  for (let i = 0; i < joined.length; i++) {
    h ^= joined.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Mix in the length to reduce collisions across very different inputs.
  h ^= joined.length;
  return (h >>> 0).toString(16).padStart(8, "0");
}

export async function loadSnapshot(hash: string): Promise<LineageSnapshot | null> {
  const database = getDb();
  if (!database) return null;
  try {
    return (await database.snapshots.get(hash)) ?? null;
  } catch {
    return null;
  }
}

export async function saveSnapshot(snapshot: LineageSnapshot): Promise<void> {
  const database = getDb();
  if (!database) return;
  try {
    await database.snapshots.put(snapshot);
    // Prune to the newest MAX_SNAPSHOTS to bound IndexedDB growth while keeping
    // a short history for diff/time-travel.
    const count = await database.snapshots.count();
    if (count > MAX_SNAPSHOTS) {
      const stale = await database.snapshots
        .orderBy("createdAt")
        .limit(count - MAX_SNAPSHOTS)
        .primaryKeys();
      if (stale.length > 0) await database.snapshots.bulkDelete(stale);
    }
  } catch {
    // Persistence is best-effort; never break the feature on a write failure.
  }
}

/** Recent snapshots (newest first) for time-travel / diff UIs. */
export async function listSnapshots(): Promise<LineageSnapshot[]> {
  const database = getDb();
  if (!database) return [];
  try {
    return await database.snapshots.orderBy("createdAt").reverse().toArray();
  } catch {
    return [];
  }
}
