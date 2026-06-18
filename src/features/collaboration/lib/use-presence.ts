/**
 * Selector-based presence hook over the room's y-protocols Awareness.
 *
 * Presence is ephemeral and multiplexed over the same provider as the doc, so it
 * works same-origin (BroadcastChannel) and cross-machine (LAN y-websocket) with
 * no hand-rolled heartbeat. Membership changes already coalesce into one
 * `change` event per tick; we cache the projected peer list as a stable identity
 * so React only re-renders when the membership actually changes — not on every
 * remote cursor move.
 */

"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";
import {
  type CollabPeer,
  readPeers,
  subscribePeers,
} from "@/platform/collab";
import type { Awareness } from "y-protocols/awareness";

function samePeers(a: CollabPeer[], b: CollabPeer[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (
      x.clientId !== y.clientId ||
      x.id !== y.id ||
      x.name !== y.name ||
      x.role !== y.role ||
      x.color !== y.color ||
      x.page !== y.page
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Live connected peers from a room's awareness, re-rendering only on real
 * membership/identity changes. Returns an empty list when awareness is null
 * (SSR / no BroadcastChannel).
 */
export function usePresence(awareness: Awareness | null): CollabPeer[] {
  const cacheRef = useRef<CollabPeer[] | null>(null);
  if (cacheRef.current === null) {
    cacheRef.current = awareness ? readPeers(awareness) : [];
  }

  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!awareness) return () => {};
      return subscribePeers(awareness, () => {
        const next = readPeers(awareness);
        const cache = cacheRef.current ?? [];
        if (!samePeers(cache, next)) {
          cacheRef.current = next;
          onChange();
        }
      });
    },
    [awareness],
  );

  const getSnapshot = useCallback(() => cacheRef.current ?? [], []);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
