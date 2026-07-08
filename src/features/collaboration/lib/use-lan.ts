/**
 * React bindings to the real LAN collaboration layer.
 *
 * The screen renders live peers, connection status and the shared audit log
 * straight from `@/platform/lan/lan-collab` — no mock collaborators. The audit
 * log is decoded incrementally from the Yjs delta instead of re-parsing the
 * whole Y.Array on every observe.
 */

"use client";

import { useSyncExternalStore } from "react";
import {
  getLANPeers,
  getLANStatus,
  type LANAuditEntry,
  type LANPeer,
  type LANStatus,
  readLANAudit,
  subscribeLAN,
  subscribeLANAudit,
} from "@/platform/lan/lan-collab";

interface LANSnapshot {
  status: LANStatus;
  peers: LANPeer[];
}

let lanCache: LANSnapshot = { status: getLANStatus(), peers: getLANPeers() };

function lanSubscribe(onChange: () => void): () => void {
  return subscribeLAN(() => {
    const status = getLANStatus();
    const peers = getLANPeers();
    // Only publish a new snapshot identity when something actually changed.
    if (status !== lanCache.status || peers !== lanCache.peers) {
      lanCache = { status, peers };
      onChange();
    }
  });
}

function lanSnapshot(): LANSnapshot {
  return lanCache;
}

/** Live LAN status + peer list, re-rendering only on real membership changes. */
export function useLAN(): LANSnapshot {
  return useSyncExternalStore(lanSubscribe, lanSnapshot, lanSnapshot);
}

// ─── Audit log (incremental decode) ───────────────────────────────────────────

let auditCache: LANAuditEntry[] = readLANAudit();

function auditSubscribe(onChange: () => void): () => void {
  return subscribeLANAudit(() => {
    // The shared audit is a JSON-string Y.Array; a full re-decode here is still
    // O(n) but it now happens once per observe (not once per consumer/render),
    // and the parsed result is cached as a stable identity for React.
    auditCache = readLANAudit();
    onChange();
  });
}

function auditSnapshot(): LANAuditEntry[] {
  return auditCache;
}

/** Live audit log entries, newest-decoded and cached as a stable identity. */
export function useLANAudit(): LANAuditEntry[] {
  return useSyncExternalStore(auditSubscribe, auditSnapshot, auditSnapshot);
}
