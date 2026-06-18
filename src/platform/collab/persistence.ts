/**
 * Durable offline CRDT persistence via `y-indexeddb`.
 *
 * This closes the #1 offline gap: a CRDT update log that survives reload. Every
 * room (and the singleton app doc) gets its own `IndexeddbPersistence` keyed by
 * a UNIQUE doc name. Reusing a name across two different docs corrupts state, so
 * callers pass distinct names (`collab-app-doc`, `dn-room-<id>`, …).
 *
 * Ordering invariant (critical): `await whenSynced` (local load) MUST resolve
 * before any network provider connects, otherwise a remote peer's state can
 * overwrite local-only offline edits before they are loaded.
 *
 * Pure JS (~5kB, no WASM, no native deps) — nothing to bundle into public/.
 */

"use client";

import { IndexeddbPersistence } from "y-indexeddb";
import type * as Y from "yjs";

/** True when IndexedDB exists (false under SSR / Node / unsupported env). */
export function hasIndexedDB(): boolean {
  return typeof indexedDB !== "undefined";
}

// One persistence per (docName) — guards against accidental duplicate attach
// (which y-indexeddb does not protect against and which corrupts the store).
const registry = new Map<string, IndexeddbPersistence>();

/**
 * Attach durable IndexedDB persistence to `doc` under `docName`. Idempotent per
 * name: a second call with the same name returns the existing instance.
 *
 * Best-effort requests durable storage (`navigator.storage.persist()`), which
 * generally returns true under Electron's trusted app origin.
 */
export function attachPersistence(
  docName: string,
  doc: Y.Doc,
): IndexeddbPersistence | null {
  if (!hasIndexedDB()) return null;
  const existing = registry.get(docName);
  if (existing) return existing;

  // Fire-and-forget: do not block doc creation on the storage permission prompt.
  void navigator.storage?.persist?.().catch(() => {});

  const persistence = new IndexeddbPersistence(docName, doc);
  registry.set(docName, persistence);
  return persistence;
}

/**
 * Resolve once the local content for `docName`/`doc` has loaded. Convenience
 * wrapper that also attaches persistence if it is not yet attached. Resolves
 * immediately (no persistence) under SSR / no-IndexedDB.
 */
export async function whenStored(docName: string, doc: Y.Doc): Promise<void> {
  const persistence = attachPersistence(docName, doc);
  if (!persistence) return;
  await persistence.whenSynced;
}

/** Stop syncing + close the IndexedDB connection but KEEP the stored data. */
export async function detachPersistence(docName: string): Promise<void> {
  const persistence = registry.get(docName);
  if (!persistence) return;
  registry.delete(docName);
  try {
    await persistence.destroy();
  } catch {
    // ignore — teardown is best-effort
  }
}

/** Destroy the IndexedDB store for a doc (use for "leave / reset room"). */
export async function clearStoredData(docName: string): Promise<void> {
  const persistence = registry.get(docName);
  if (persistence) {
    registry.delete(docName);
    try {
      await persistence.clearData();
    } catch {
      // ignore
    }
    return;
  }
  // Not currently attached — best-effort delete the underlying DB directly.
  if (hasIndexedDB()) {
    try {
      indexedDB.deleteDatabase(docName);
    } catch {
      // ignore
    }
  }
}

/**
 * Best-effort storage quota/usage for surfacing in the UI (long-lived rooms).
 * Returns null when the StorageManager API is unavailable.
 */
export async function storageEstimate(): Promise<StorageEstimate | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
    return null;
  }
  try {
    return await navigator.storage.estimate();
  } catch {
    return null;
  }
}
