/**
 * F4 — Yjs Cross-Tab State Sync
 * Uses a lightweight BroadcastChannel provider (no y-indexeddb needed).
 * Syncs filter, activeTab, and columnMapping across all open tabs via CRDT.
 */

"use client";

import * as Y from "yjs";

// ─── Yjs Document ─────────────────────────────────────────────────────────────

export const ydoc = new Y.Doc();

/** Shared map for filter state */
export const sharedFilter = ydoc.getMap<string>("filter");

/** Shared map for active tab */
export const sharedTab = ydoc.getMap<string>("tab");

/** Shared map for column mapping */
export const sharedMapping = ydoc.getMap<string>("mapping");

// ─── BroadcastChannel Provider ────────────────────────────────────────────────
// Syncs Y.Doc updates across same-origin tabs with no server required.

const CHANNEL_NAME = "telecom-ydoc-v1";

let _channel: BroadcastChannel | null = null;
let _started = false;

export function startCollabSync(): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};
  if (_started) return () => {};
  _started = true;

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
  useEffect(() => {
    if (ymap.size === 0) {
      ydoc.transact(() => {
        for (const [k, v] of Object.entries(defaultValues)) {
          ymap.set(k, v as string);
        }
      }, "init");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
