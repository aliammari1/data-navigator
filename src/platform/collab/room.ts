/**
 * Room CRDT substrate — now backed by the SINGLETON app doc.
 *
 * Historically each room created its OWN Y.Doc/Awareness/HocuspocusProvider.
 * Because the LAN singleton (`@/platform/lan/lan-collab`) also connected to the
 * same Hocuspocus document name, the hub merged both docs' roots into one
 * server-side union, every machine appeared twice in every roster (two
 * clientIds), and the same screen rendered two disagreeing peer lists. The
 * per-room transport also auto-connected with raw keystroke URLs (resolved as
 * relative → ws://localhost:3000/dashboard/<garbage>) and leaked providers on
 * unmount races.
 *
 * `getRoomDoc(roomId)` now assembles the room handle from the app `ydoc`'s
 * root types (same root NAMES as before, so previously-synced server data and
 * migrated local data are picked up as-is) and the shared app Awareness.
 * Transport is owned SOLELY by `connectLAN` in `@/platform/lan/lan-collab` —
 * one socket, one awareness, one roster, one auth path.
 *
 * Legacy per-room IndexedDB stores (`dn-room-<id>`) are merged into the app
 * doc once via `migrateLegacyRoomDoc` (gated by `whenStored`), then cleared.
 */

"use client";

import * as Y from "yjs";
import { ensureAppDocPersistence, getAppAwareness, ydoc } from "./collab";
import { attachPersistence, clearStoredData, hasIndexedDB } from "./persistence";
import type { CollabRoomDoc } from "./types";

const PERSIST_PREFIX = "dn-room-";

// ─── Legacy store migration ───────────────────────────────────────────────────

const migrationRuns = new Map<string, Promise<void>>();

/**
 * One-shot merge of a legacy per-room IndexedDB store into the app doc.
 * Idempotent: guarded by a meta flag persisted on the app doc AND a per-session
 * promise cache. CRDT merge is itself idempotent, so a crash between the flag
 * write and the store clear only costs a harmless re-merge on next boot.
 */
function migrateLegacyRoomDoc(roomId: string): Promise<void> {
  const legacyName = `${PERSIST_PREFIX}${roomId}`;
  const existing = migrationRuns.get(legacyName);
  if (existing) return existing;

  const run = (async () => {
    if (!hasIndexedDB()) return;
    const meta = ydoc.getMap<unknown>("meta");
    const flagKey = `migrated:${legacyName}`;
    if (meta.get(flagKey) === true) return;

    const tmp = new Y.Doc();
    try {
      const persistence = attachPersistence(legacyName, tmp);
      if (!persistence) return;
      await persistence.whenSynced;
      Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(tmp));
      meta.set(flagKey, true);
      await clearStoredData(legacyName);
    } finally {
      tmp.destroy();
    }
  })().catch(() => {
    // Best-effort: a failed migration must never block the room from opening.
    // The flag stays unset, so it retries on the next acquire/boot.
    migrationRuns.delete(legacyName);
  });

  migrationRuns.set(legacyName, run);
  return run;
}

// ─── Public API ───────────────────────────────────────────────────────────────

const handles = new Map<string, CollabRoomDoc>();

/**
 * Acquire the room handle, backed by the singleton app doc. Stable per roomId
 * (same object across acquires). `releaseRoom` is a no-op — the app doc and
 * shared awareness live for the app's lifetime; transport teardown belongs to
 * `disconnectLAN` in `@/platform/lan/lan-collab`.
 */
export function getRoomDoc(roomId: string): CollabRoomDoc {
  const cached = handles.get(roomId);
  if (cached) return cached;

  const handle: CollabRoomDoc = {
    id: roomId,
    doc: ydoc,
    comments: ydoc.getArray<Y.Map<unknown>>("comments"),
    changes: ydoc.getArray<Y.Map<unknown>>("changes"),
    chat: ydoc.getArray<Y.Map<unknown>>("chat"),
    annotations: ydoc.getMap<Y.Array<Y.Map<unknown>>>("annotations"),
    approvals: ydoc.getMap<Y.Map<unknown>>("approvals"),
    audit: ydoc.getArray<string>("audit"),
    meta: ydoc.getMap<unknown>("meta"),
    // Durable local load first, then the one-shot legacy-store merge — the
    // offline ordering invariant callers already gate first paint on.
    whenStored: ensureAppDocPersistence().then(() => migrateLegacyRoomDoc(roomId)),
    awareness: getAppAwareness(),
    destroy() {
      // The backing doc is the app singleton — never destroyed per-room.
    },
  };
  handles.set(roomId, handle);
  return handle;
}

/** No-op: singleton-backed rooms have no per-room resources to tear down. */
export function releaseRoom(_roomId: string): void {}
