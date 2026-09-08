"use client";

import { useEffect, useState } from "react";
import {
  getLANPeers,
  type LANCursor,
  type LANPeer,
  subscribeLAN,
} from "@/platform/lan/lan-collab";

const CURSOR_FRESH_MS = 10_000;

export interface RemoteCursorEntry {
  peer: LANPeer;
  cursor: LANCursor;
}

function filterFresh(peers: LANPeer[], sectionId: string, now: number): RemoteCursorEntry[] {
  const out: RemoteCursorEntry[] = [];
  for (const peer of peers) {
    if (peer.sectionId !== sectionId) continue;
    const cursor = peer.cursor;
    if (!cursor || typeof cursor.ts !== "number") continue;
    if (now - cursor.ts >= CURSOR_FRESH_MS) continue;
    out.push({ peer, cursor });
  }
  return out;
}

/**
 * Live list of remote peers currently anchored to `sectionId`, paired with their
 * most-recent section cursor. Re-renders only when the filtered list actually
 * changes (peer join/leave, cursor refresh, or staleness prune). Returns `[]`
 * when `sectionId` is null so consumers can wire it unconditionally.
 */
export function useRemoteCursors(sectionId: string | null): RemoteCursorEntry[] {
  const [entries, setEntries] = useState<RemoteCursorEntry[]>([]);

  useEffect(() => {
    if (!sectionId) {
      setEntries([]);
      return;
    }

    const refresh = () => {
      setEntries((prev) => {
        const next = filterFresh(getLANPeers(), sectionId, Date.now());
        if (next.length !== prev.length) return next;
        for (let i = 0; i < next.length; i++) {
          const a = next[i];
          const b = prev[i];
          if (!b || a.peer.id !== b.peer.id || a.cursor.ts !== b.cursor.ts) return next;
        }
        return prev;
      });
    };

    refresh();
    return subscribeLAN(refresh);
  }, [sectionId]);

  return entries;
}
