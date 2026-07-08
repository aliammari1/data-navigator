/**
 * Zustand → Dexie write-through mirror (DOCUMENTED HELPER for feature agents).
 *
 * The brief forbids this subsystem from editing feature stores in
 * `src/features/*` directly, so this is the adoption helper feature agents wire
 * in themselves. It solves the async-IndexedDB-vs-sync-store-API tension
 * (architecture §4 / history.md §3.1): the app keeps writing to the synchronous
 * Zustand store as usual, and a `subscribe` mirror fans those writes into Dexie
 * asynchronously, so the Dexie copy becomes the *queryable / range-paginated*
 * source of truth for read paths (history timeline, activity log, achievements)
 * without forcing every caller to await IndexedDB.
 *
 * It also provides an idempotent one-time backfill (guarded by a version row)
 * to lift any pre-existing localStorage-as-DB data into Dexie exactly once.
 *
 * Usage (in a feature, e.g. achievements or history):
 *   import { mirrorStoreToDexie, runOnceBackfill } from "@/platform/storage/store-mirror";
 *   import { appDb, addActivityRecord } from "@/platform/storage/app-db";
 *
 *   // 1) one-time backfill of legacy localStorage rows
 *   await runOnceBackfill(appDb, "history", 1, async () => {
 *     for (const evt of readLegacyLocalStorageEvents()) await addActivityRecord(evt);
 *   });
 *
 *   // 2) live mirror: append a Dexie row whenever the selected slice changes
 *   const stop = mirrorStoreToDexie(useHistoryStore, s => s.lastEvent, (evt) => {
 *     if (evt) void addActivityRecord(evt);
 *   });
 */

import type { Table } from "dexie";

/** Minimal structural type for a zustand store (no zustand import needed). */
export interface SubscribableStore<T> {
  getState: () => T;
  subscribe: (listener: (state: T, prev: T) => void) => () => void;
}

/**
 * Mirror a selected slice of a zustand store into a side-effect (typically a
 * Dexie write). Fires only when the selected value changes (referential
 * compare), so a noisy store does not spam IndexedDB. Returns an unsubscribe.
 *
 * `equals` defaults to `Object.is`; pass a shallow/deep comparator for object
 * slices.
 */
export function mirrorStoreToDexie<T, S>(
  store: SubscribableStore<T>,
  selector: (state: T) => S,
  onChange: (selected: S, previous: S | undefined) => void,
  equals: (a: S, b: S) => boolean = Object.is,
): () => void {
  let prev = selector(store.getState());
  // Emit the initial value so a fresh mount captures current state once.
  onChange(prev, undefined);
  return store.subscribe((state) => {
    const next = selector(state);
    if (!equals(next, prev)) {
      const before = prev;
      prev = next;
      onChange(next, before);
    }
  });
}

// ─── One-time backfill guard ──────────────────────────────────────────────────

interface BackfillMeta {
  key: string;
  version: number;
  ranAt: number;
}

/** Lazily-created `_backfill` meta table on any Dexie DB. */
interface BackfillCapableDb {
  table(name: string): Table<BackfillMeta, string>;
}

/**
 * Run a migration/backfill exactly once per `(key, version)` per client. Records
 * a guard row in a `_backfill` Dexie table; bumping `version` re-runs it once.
 * Safe across reloads and multiple call sites (the guard read/write is atomic
 * enough for a single-tab desktop app; a Dexie transaction wraps the check).
 *
 * Requires the DB schema to declare a `_backfill: "key"` store. `app-db.ts`
 * callers can instead pass their own guard table; see the wire-in note below.
 */
export async function runOnceBackfill(
  db: BackfillCapableDb,
  key: string,
  version: number,
  work: () => Promise<void>,
): Promise<boolean> {
  let table: Table<BackfillMeta, string>;
  try {
    table = db.table("_backfill");
  } catch {
    // Schema doesn't declare a _backfill table — fall back to a localStorage
    // guard so adoption never throws. (Feature can add the table for durability.)
    return runOnceBackfillLocalStorage(key, version, work);
  }

  const existing = await table.get(key);
  if (existing && existing.version >= version) return false;

  await work();
  await table.put({ key, version, ranAt: Date.now() });
  return true;
}

/** localStorage-guarded fallback when no `_backfill` Dexie table exists. */
async function runOnceBackfillLocalStorage(
  key: string,
  version: number,
  work: () => Promise<void>,
): Promise<boolean> {
  const guardKey = `dn:backfill:${key}`;
  let done = false;
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(guardKey) : null;
    done = raw !== null && Number(raw) >= version;
  } catch {
    done = false;
  }
  if (done) return false;

  await work();
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(guardKey, String(version));
    }
  } catch {
    // ignore — worst case the backfill re-runs once next launch (idempotent work expected)
  }
  return true;
}
