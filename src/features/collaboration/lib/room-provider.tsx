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
import { connectRoomLAN, disconnectRoomLAN, setAwarenessUser } from "@/platform/collab";
import { getLANPeers, readLANSettings, subscribeLAN } from "@/platform/lan/lan-collab";
import { acquireRoom, releaseRoom, type RoomDoc } from "./room";
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

  // When the user has configured a LAN hub, attach THIS room's doc to it so
  // comments/changes/chat/presence sync cross-machine (the platform awaits
  // `whenStored` first, so offline edits are never clobbered). With no hub URL
  // the room stays local-only + durable — fully offline by default. Re-runs when
  // the LAN settings change (subscribeLAN) so connecting in the control center
  // wires this room without a reload.
  useEffect(() => {
    let active = true;
    // Only (re)connect when the transport-relevant settings actually change —
    // subscribeLAN fires on every awareness tick, so guard against thrashing the
    // provider (which would tear down + recreate the socket each cursor move).
    let lastSig = "";
    const sync = () => {
      if (!active) return;
      const s = readLANSettings();
      const sig = `${s.url}|${s.room}|${s.pairingCode}|${s.peer.id}|${s.peer.name}|${s.peer.role}|${s.peer.color}`;
      if (sig === lastSig) return;
      lastSig = sig;
      if (s.url) {
        void connectRoomLAN(roomId, {
          url: s.url,
          room: s.room,
          pairingCode: s.pairingCode,
          identity: {
            id: s.peer.id,
            name: s.peer.name,
            role: s.peer.role,
            color: s.peer.color,
          },
        }).catch(() => {
          /* offline / hub unreachable — stay local-only */
        });
      } else {
        disconnectRoomLAN(roomId);
      }
    };
    sync();
    const unsub = subscribeLAN(sync);
    return () => {
      active = false;
      unsub();
      disconnectRoomLAN(roomId);
    };
  }, [roomId]);

  const value = useMemo<RoomContextValue>(() => ({ room, peer }), [room, peer]);

  if (!stored) return <RoomSkeleton />;
  return <RoomCtx.Provider value={value}>{children}</RoomCtx.Provider>;
}
