/**
 * Renderer-side CRDT collaboration substrate — public API.
 *
 * Feature code (collaboration, collab-hub, telecom presence) should import from
 * here. Internals (Yjs wiring, y-indexeddb persistence, y-protocols awareness,
 * y-websocket transport) are owned by this platform subsystem.
 *
 *   getRoomDoc / acquireRoom / releaseRoom .. per-room CRDT doc + lifecycle
 *   connectRoomLAN / disconnectRoomLAN ...... attach a room to a LAN hub
 *   ensureAppDocPersistence ................. durable singleton-doc persistence
 *   annotation / approval / audit accessors . collab-hub shared types
 *   awareness helpers ....................... presence (auto-pruned)
 *   persistence helpers ..................... y-indexeddb durability
 */

"use client";

// ── Singleton app doc + cross-tab sync + persistence ──
export {
  ensureAppDocPersistence,
  sharedAudit,
  sharedFilter,
  sharedLanRoom,
  sharedMapping,
  sharedOverview,
  sharedPresence,
  sharedTab,
  startCollabSync,
  useYMap,
  ydoc,
} from "./collab";

// ── Per-room CRDT substrate ──
export {
  acquireRoom,
  connectRoomLAN,
  disconnectRoomLAN,
  getRoomDoc,
  getRoomStatus,
  releaseRoom,
  subscribeRoomStatus,
} from "./room";

// ── Presence / awareness ──
export {
  clearLocalAwareness,
  createAwareness,
  destroyAwareness,
  publishCursor,
  readPeers,
  setAwarenessUser,
  subscribePeers,
} from "./awareness";

// ── Durable persistence ──
export {
  attachPersistence,
  clearStoredData,
  detachPersistence,
  hasIndexedDB,
  storageEstimate,
  whenStored,
} from "./persistence";

// ── collab-hub shared types + accessors ──
export {
  addAnnotation,
  appendAuditEvent,
  deleteAnnotation,
  observeAnnotations,
  observeApprovals,
  observeAuditEvents,
  readAnnotations,
  readApproval,
  readApprovals,
  readAuditEvents,
  replyToAnnotation,
  setAnnotationResolved,
  setApprovalStatus,
  yAnnotations,
  yApprovals,
  yAudit,
} from "./collab-hub-doc";

// ── Types ──
export type {
  AnnotationNote,
  AnnotationReply,
  ApprovalHistoryEntry,
  ApprovalRecord,
  ApprovalStatus,
  AuditEventType,
  CollabAuditEvent,
  NoteColor,
  NotePriority,
} from "./collab-hub-doc";
export type {
  AwarenessCursor,
  AwarenessUser,
  CollabConnectOptions,
  CollabIdentity,
  CollabPeer,
  CollabRole,
  CollabRoomDoc,
  CollabTransportStatus,
} from "./types";
