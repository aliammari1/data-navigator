/**
 * React provider that mounts the per-room collaboration doc only on the
 * /dashboard/collaborative route. Acquiring/releasing here keeps the heavy
 * collaborative Yjs doc + persistence + awareness + providers out of every
 * other bundle.
 *
 * It also:
 *  - gates first render on `room.whenStored` so the screen never paints an empty
 *    list before durable IndexedDB content has loaded (offline-first invariant),
 *  - publishes the local peer identity into this room's awareness so presence is
 *    real (not a mock collaborator),
 *  - tracks the live peer identity from the LAN settings so comments/chat are
 *    attributed to the actual paired user.
 */

"use client";

import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { setAwarenessUser } from "@/platform/collab";
import { getLANPeers, readLANSettings, subscribeLAN } from "@/platform/lan/lan-collab";
import { acquireRoom, type RoomDoc, releaseRoom } from "./room";
import type { LocalPeer } from "./room-actions";

interface RoomContextValue {
  room: RoomDoc;
  peer: LocalPeer;
}

const RoomCtx = createContext<RoomContextValue | null>(null);

export function useRoom(): RoomDoc {
  const ctx = useContext(RoomCtx);
  if (!ctx) throw new Error("useRoom must be used inside <RoomProvider>");
  return ctx.room;
}

export function useLocalPeer(): LocalPeer {
  const ctx = useContext(RoomCtx);
  if (!ctx) throw new Error("useLocalPeer must be used inside <RoomProvider>");
  return ctx.peer;
}

function RoomSkeleton() {
  return (
    <div className=" flex items-center justify-center">
      <div className="flex items-center gap-3 text-muted-foreground text-sm">
        <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
        Loading collaboration room…
      </div>
    </div>
  );
}

export function RoomProvider({ roomId, children }: { roomId: string; children: ReactNode }) {
  const room = useMemo(() => acquireRoom(roomId), [roomId]);
  useEffect(() => () => releaseRoom(roomId), [roomId]);

  // Gate first render on durable local load. Resolves immediately under SSR /
  // no-IndexedDB; awaits the y-indexeddb sync otherwise so offline edits are
  // never momentarily hidden before they hydrate.
  const [stored, setStored] = useState(false);
  useEffect(() => {
    let live = true;
    void Promise.resolve(room.whenStored).then(() => {
      if (live) setStored(true);
    });
    return () => {
      live = false;
    };
  }, [room]);

  // Local peer identity comes from the real LAN settings (id/name/color),
  // so comments/chat are attributed to the actual paired identity, and it
  // stays in sync if the user renames themselves in the LAN control center.
  const [peer, setPeer] = useState<LocalPeer>(() => {
    const s = readLANSettings();
    return { id: s.peer.id, name: s.peer.name, color: s.peer.color };
  });

  useEffect(() => {
    return subscribeLAN(() => {
      const s = readLANSettings();
      const me = getLANPeers().find((p) => p.id === s.peer.id);
      const next: LocalPeer = {
        id: s.peer.id,
        name: me?.name ?? s.peer.name,
        color: me?.color ?? s.peer.color,
      };
      setPeer((prev) =>
        prev.id === next.id && prev.name === next.name && prev.color === next.color ? prev : next,
      );
    });
  }, []);

  // Announce the durable identity into this room's awareness so the live peer
  // list / presence avatars include us (membership only — never cursor here).
  useEffect(() => {
    const s = readLANSettings();
    if (!room.awareness) return;
    setAwarenessUser(room.awareness, {
      id: peer.id,
      name: peer.name,
      role: s.peer.role,
      color: peer.color,
      page: typeof location !== "undefined" ? location.pathname : undefined,
    });
  }, [room, peer]);

  // NOTE: this provider deliberately opens NO network transport. The room is
  // backed by the singleton app doc, whose LAN sync is owned solely by
  // `connectLAN`/`disconnectLAN` in `@/platform/lan/lan-collab` (one socket,
  // one authenticated session, one roster). The old per-room auto-connect here
  // double-connected the same Hocuspocus document and duplicated every peer.

  const value = useMemo<RoomContextValue>(() => ({ room, peer }), [room, peer]);

  if (!stored) return <RoomSkeleton />;
  return <RoomCtx.Provider value={value}>{children}</RoomCtx.Provider>;
}
