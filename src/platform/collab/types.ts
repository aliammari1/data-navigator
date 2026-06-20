/**
 * Subsystem-local types for the renderer-side CRDT collaboration substrate.
 *
 * Kept INSIDE `src/platform/collab/` (not `src/shared`) on purpose: sibling
 * platform agents own their own subsystem types, and these shapes are specific
 * to the Yjs/awareness collab layer. Feature code re-exports / maps these into
 * its own view models — it does not own these primitives.
 */

import type * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";

// ─── Identity / roles ─────────────────────────────────────────────────────────

export type CollabRole = "host" | "editor" | "reviewer" | "viewer";

/** Durable identity for a peer (id/name/role/color). Lives in the doc + awareness. */
export interface CollabIdentity {
  id: string;
  name: string;
  role: CollabRole;
  color: string;
}

/** A live awareness user state (durable identity + ephemeral cursor/page). */
export interface AwarenessUser extends CollabIdentity {
  /** Route / location the peer is currently viewing. */
  page?: string;
  /** Last refresh timestamp (ms). Awareness auto-prunes ~30s after this stalls. */
  lastSeenAt?: number;
}

/** Ephemeral cursor/selection — awareness only, NEVER persisted into the doc. */
export interface AwarenessCursor {
  page: string;
  selection?: string;
  at: number;
}

/** A snapshot of one connected peer assembled from awareness. */
export interface CollabPeer extends AwarenessUser {
  /** Awareness client id (numeric) — stable for the lifetime of a connection. */
  clientId: number;
  /** Always true for peers read out of awareness (they are connected). */
  active: boolean;
  cursor?: AwarenessCursor;
}

// ─── Room document substrate ──────────────────────────────────────────────────

/**
 * Canonical per-room collaborative document. The room owns the Y.Doc and the
 * shared types feature screens read/write; persistence + presence + (optional)
 * LAN transport are wired by the substrate, not the screen.
 */
export interface CollabRoomDoc {
  id: string;
  doc: Y.Doc;
  /** Threaded comments / suggestions / questions / approval requests. */
  comments: Y.Array<Y.Map<unknown>>;
  /** Audit-style change log entries. */
  changes: Y.Array<Y.Map<unknown>>;
  /** Free-form room chat. */
  chat: Y.Array<Y.Map<unknown>>;
  /** Sticky-note annotations keyed by sectionId -> ordered Y.Array of note maps. */
  annotations: Y.Map<Y.Array<Y.Map<unknown>>>;
  /** Approval workflow state keyed by reportId -> approval Y.Map. */
  approvals: Y.Map<Y.Map<unknown>>;
  /** Append-only audit JSON strings (mirrors sharedAudit). */
  audit: Y.Array<string>;
  /** Room-level metadata (pairing state, selected tab, file drops, …). */
  meta: Y.Map<unknown>;
  /**
   * Resolves once local IndexedDB content has loaded. Gate UI render and any
   * network provider connect on this so offline edits are never clobbered by a
   * remote peer's state before they load.
   */
  whenStored: Promise<unknown>;
  /** Awareness for this room (presence). Null in SSR / no-BroadcastChannel envs. */
  awareness: Awareness | null;
  /** Detach + tear down persistence, awareness, providers and the doc. */
  destroy(): void;
}

// ─── Provider transport ───────────────────────────────────────────────────────

export type CollabTransportStatus = "off" | "connecting" | "connected" | "disconnected" | "error";

/** Settings to attach a room/doc to a LAN hub over y-websocket. */
export interface CollabConnectOptions {
  /** ws:// hub URL (LAN ip or localhost). Never a public/CDN URL. */
  url: string;
  /** Room name (NOT in the URL path — passed as a separate arg). */
  room: string;
  /** Pairing code → the hub's onAuthenticate gate. */
  pairingCode: string;
  /** Local peer identity announced over awareness + query params. */
  identity: CollabIdentity;
}
