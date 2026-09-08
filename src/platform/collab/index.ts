/**
 * Renderer-side CRDT collaboration substrate — public API.
 *
 * Feature code (collaboration, collab-hub, telecom presence) should import from
 * here. Internals (Yjs wiring, y-indexeddb persistence, y-protocols awareness,
 * y-websocket transport) are owned by this platform subsystem.
 *
 *   getRoomDoc / acquireRoom / releaseRoom .. room handles on the app doc
 *   ensureAppDocPersistence ................. durable singleton-doc persistence
 *   annotation / approval / audit accessors . collab-hub shared types
 *   awareness helpers ....................... presence (auto-pruned)
 *   persistence helpers ..................... y-indexeddb durability
 */

"use client";

// ── Singleton app doc + cross-tab sync + persistence ──
export {
  ensureAppDocPersistence,
  getAppAwareness,
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

// ── Room handles (backed by the singleton app doc; LAN transport lives in
// `@/platform/lan/lan-collab`) ──
export { acquireRoom, getRoomDoc, releaseRoom } from "./room";

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
  CollabIdentity,
  CollabPeer,
  CollabRole,
  CollabRoomDoc,
} from "./types";
