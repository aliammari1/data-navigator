/**
 * Presence via `y-protocols/awareness`.
 *
 * Awareness is the right primitive for presence: ephemeral, auto-pruned ~30s
 * after a peer stops refreshing, multiplexed over the same y-websocket /
 * BroadcastChannel provider as the doc. This replaces the hand-rolled 10s
 * heartbeat + 30s prune intervals and the per-render `me` object churn that the
 * old presence code used.
 *
 * Discipline:
 *  - DURABLE identity (id/name/role/color) → also lives in the doc.
 *  - EPHEMERAL cursor/selection/page → awareness ONLY, never written into the
 *    persisted doc (it would bloat the doc + the IndexedDB update log).
 *  - High-frequency fields (cursor) are throttled via rAF before the write.
 */

"use client";

import { Awareness } from "y-protocols/awareness";
import type * as Y from "yjs";
import type { AwarenessCursor, AwarenessUser, CollabPeer } from "./types";

/** Create an Awareness instance bound to a doc. */
export function createAwareness(doc: Y.Doc): Awareness {
  return new Awareness(doc);
}

/** Write the durable identity user field (low frequency: join/rename/role). */
export function setAwarenessUser(awareness: Awareness, user: AwarenessUser): void {
  awareness.setLocalStateField("user", {
    ...user,
    lastSeenAt: Date.now(),
  });
}

// rAF-throttled cursor writers keyed by awareness instance so a flood of
// selection/cursor events coalesces to at most one write per frame.
const pendingCursor = new WeakMap<Awareness, AwarenessCursor>();
type ScheduleHandle =
  | ReturnType<typeof requestAnimationFrame>
  | ReturnType<typeof setTimeout>;
const cursorRaf = new WeakMap<Awareness, ScheduleHandle>();

function scheduleFrame(cb: () => void): ScheduleHandle {
  if (typeof requestAnimationFrame === "function") {
    return requestAnimationFrame(cb);
  }
  return setTimeout(cb, 16);
}

/**
 * Throttled cursor/selection write (~1 per animation frame). Keeps high-rate
 * remote cursor traffic from re-rendering every subscriber on a medium CPU.
 */
export function publishCursor(awareness: Awareness, cursor: AwarenessCursor): void {
  pendingCursor.set(awareness, cursor);
  if (cursorRaf.has(awareness)) return;
  const handle = scheduleFrame(() => {
    cursorRaf.delete(awareness);
    const next = pendingCursor.get(awareness);
    pendingCursor.delete(awareness);
    if (next) awareness.setLocalStateField("cursor", next);
  });
  cursorRaf.set(awareness, handle);
}

/** Clear local awareness state (e.g. on leave) so peers prune us immediately. */
export function clearLocalAwareness(awareness: Awareness): void {
  awareness.setLocalState(null);
}

/**
 * Read all connected peers from awareness as plain objects. Reading is O(peers);
 * call it from a single subscriber and cache the identity for React.
 */
export function readPeers(awareness: Awareness): CollabPeer[] {
  const peers: CollabPeer[] = [];
  for (const [clientId, state] of awareness.getStates()) {
    const s = state as { user?: AwarenessUser; cursor?: AwarenessCursor };
    if (!s?.user) continue;
    peers.push({
      ...s.user,
      clientId,
      active: true,
      cursor: s.cursor,
    });
  }
  return peers;
}

/**
 * Subscribe to awareness membership changes. Returns an unsubscribe function.
 * `y-protocols` already coalesces add/update/remove into one `change` event per
 * tick, so this fires once per logical presence change (still: throttle the
 * consumer's projection if you derive cursors).
 */
export function subscribePeers(awareness: Awareness, handler: () => void): () => void {
  awareness.on("change", handler);
  return () => awareness.off("change", handler);
}

/** Tear down an awareness instance (removes local state + listeners). */
export function destroyAwareness(awareness: Awareness): void {
  try {
    awareness.setLocalState(null);
  } catch {
    // ignore
  }
  awareness.destroy();
}
