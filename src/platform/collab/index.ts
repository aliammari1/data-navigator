/**
 * Renderer-side CRDT collaboration substrate — public API.
 *
 * Feature code (collaboration, collab-hub, telecom presence) should import from
 * here. Internals (Yjs wiring, y-indexeddb persistence, y-protocols awareness,
 * y-websocket transport) are owned by this platform subsystem.
 *
 *   acquireRoomDoc / releaseRoom ........ room handles on the app doc
 *   ensureAppDocPersistence ................. durable singleton-doc persistence
 *   annotation / approval / audit accessors . collab-hub shared types
 *   awareness helpers ....................... presence (auto-pruned)
 *   persistence helpers ..................... y-indexeddb durability
 */

"use client";

// ── Presence / awareness ──
export {
  readPeers,
  setAwarenessUser,
  subscribePeers,
} from "./awareness";
// ── Singleton app doc + cross-tab sync + persistence ──
export {
  ensureAppDocPersistence,
  sharedLanRoom,
  startCollabSync,
  ydoc,
} from "./collab";
// ── Types ──
export type {
  AnnotationNote,
  ApprovalHistoryEntry,
  ApprovalRecord,
  ApprovalStatus,
  AuditEventType,
  CollabAuditEvent,
  NoteColor,
  NotePriority,
} from "./collab-hub-doc";
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
  readAuditEvents,
  replyToAnnotation,
  setAnnotationResolved,
  setApprovalStatus,
  yApprovals,
  yAudit,
} from "./collab-hub-doc";
// ── Durable persistence ──

// ── Room handles (backed by the singleton app doc; LAN transport lives in
// `@/platform/lan/lan-collab`) ──
export { acquireRoomDoc, releaseRoom } from "./room-doc";
export type {
  CollabPeer,
  CollabRoomDoc,
} from "./types";
