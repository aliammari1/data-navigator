/**
 * F4 — Yjs Cross-Tab State Sync + durable offline persistence.
 *
 * The singleton app `ydoc` syncs filter/tab/mapping/overview across same-origin
 * tabs via a lightweight BroadcastChannel CRDT provider, AND now persists
 * durably via y-indexeddb (so collab-hub annotations/approvals/audit and LAN
 * room state survive reload). Call `ensureAppDocPersistence()` once at app
 * startup and `await` it before reading the collab-hub shared types if you need
 * the offline content loaded first.
 */

"use client";

import * as Y from "yjs";
import { attachPersistence } from "./persistence";

// ─── Yjs Document ─────────────────────────────────────────────────────────────

export const ydoc = new Y.Doc();

/** Shared map for filter state */
export const sharedFilter = ydoc.getMap<string>("filter");

/** Shared map for active tab */
export const sharedTab = ydoc.getMap<string>("tab");

/** Shared map for column mapping */
export const sharedMapping = ydoc.getMap<string>("mapping");

/**
 * Shared map for the computed overview snapshot.
 * Values are JSON-stringified so any peer can apply them directly to local state.
 * Keys: kpi, canals, hourly, statusData, errors, operators, regions,
 *       reportDate, fileName, presenterId, updatedAt.
 */
export const sharedOverview = ydoc.getMap<string>("overview");

/** LAN room metadata: pairing state, selected report tab, active file drops. */
export const sharedLanRoom = ydoc.getMap<string>("lan-room");

/**
 * Shared per-peer DURABLE identity keyed by peer id (name/role/color/page).
 * Ephemeral cursor/selection lives in `y-protocols/awareness`, NOT here — see
 * `publishPresence` / `publishSelection` in `@/platform/lan/lan-collab`.
 */
export const sharedPresence = ydoc.getMap<string>("presence");

/** Append-only LAN audit entries mirrored to connected browsers. */
export const sharedAudit = ydoc.getArray<string>("audit");

// ─── Durable persistence (y-indexeddb) ────────────────────────────────────────
// The app doc carries collab-hub annotations/approvals/audit + LAN room state;
// persisting it makes that content survive reload (the localStorage silos it
// replaces are being removed). One IndexeddbPersistence keyed by a stable name.

const APP_DOC_NAME = "collab-app-doc";

let _appPersistenceReady: Promise<void> | null = null;

/**
 * Attach durable IndexedDB persistence to the singleton app doc (idempotent).
 * Resolves once local content has loaded — gate UI on this before reading the
 * collab-hub shared types if offline content must be present first. Resolves
 * immediately under SSR / no-IndexedDB.
 */
export function ensureAppDocPersistence(): Promise<void> {
  if (_appPersistenceReady) return _appPersistenceReady;
  const persistence = attachPersistence(APP_DOC_NAME, ydoc);
  _appPersistenceReady = persistence
    ? persistence.whenSynced.then(() => undefined)
    : Promise.resolve();
  return _appPersistenceReady;
}

// ─── BroadcastChannel Provider ────────────────────────────────────────────────
// Syncs Y.Doc updates across same-origin tabs with no server required.

const CHANNEL_NAME = "telecom-ydoc-v1";

let _channel: BroadcastChannel | null = null;
let _started = false;

export function startCollabSync(): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};
  if (_started) return () => {};
  _started = true;

  // Attach durable persistence on the default boot path (fire-and-forget; the
  // BroadcastChannel provider does not need to wait for it).
  void ensureAppDocPersistence();

  _channel = new BroadcastChannel(CHANNEL_NAME);

  // Send local updates to other tabs
  const handleUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === "remote") return; // don't echo back
    _channel?.postMessage(update);
  };
  ydoc.on("update", handleUpdate);

  // Receive updates from other tabs
  _channel.onmessage = (e: MessageEvent<Uint8Array>) => {
    Y.applyUpdate(ydoc, new Uint8Array(e.data), "remote");
  };

  return () => {
    ydoc.off("update", handleUpdate);
    _channel?.close();
    _channel = null;
    _started = false;
  };
}

// ─── useYMap hook ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useReducer } from "react";

/**
 * React hook that binds a Y.Map to component state.
 * Returns [snapshot, setKey] where snapshot is a plain JS object.
 */
export function useYMap<T extends Record<string, string>>(
  ymap: Y.Map<string>,
  defaultValues: T,
): [T, (key: keyof T, value: string) => void] {
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  // Hydrate defaults into the map only if it's completely empty
  // biome-ignore lint/correctness/useExhaustiveDependencies: hydrate-once-on-mount; ymap/defaultValues intentionally excluded to avoid re-running
  useEffect(() => {
    if (ymap.size === 0) {
      ydoc.transact(() => {
        for (const [k, v] of Object.entries(defaultValues)) {
          ymap.set(k, v as string);
        }
      }, "init");
    }
  }, []);

  useEffect(() => {
    ymap.observe(forceUpdate);
    return () => ymap.unobserve(forceUpdate);
  }, [ymap]);

  const snapshot = { ...defaultValues };
  for (const [k, v] of ymap.entries()) {
    (snapshot as Record<string, string>)[k] = v;
  }

  const setKey = useCallback(
    (key: keyof T, value: string) => {
      ydoc.transact(() => {
        ymap.set(key as string, value);
      });
    },
    [ymap],
  );

  return [snapshot, setKey];
}
