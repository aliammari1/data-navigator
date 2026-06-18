/**
 * Shared CRDT structures + typed accessors for the collab-hub feature.
 *
 * These replace the localStorage / BroadcastChannel silos used today by
 * `useAnnotations` (localStorage `annotations:<section>`), the approval workflow
 * (zustand-persisted to localStorage), and the audit trail. Everything becomes
 * a Yjs shared type so it merges concurrently across tabs + LAN peers and
 * survives reload via y-indexeddb.
 *
 * Two surfaces are provided:
 *   1. App-doc-level singletons (`yApprovals` / `yAnnotations` / `yAudit`) that
 *      ride the existing singleton `ydoc` + its BroadcastChannel/LAN providers.
 *   2. Pure accessor helpers that operate on ANY Y.Map/Y.Array, so the same
 *      logic works against a per-room `CollabRoomDoc`.
 *
 * Mutation rule: always mutate inside `doc.transact(...)` so observers fire once
 * per logical change, and always create a FRESH Y.Map/Y.Array per insert (never
 * re-insert a detached one — Yjs throws).
 */

"use client";

import * as Y from "yjs";
import { ydoc } from "./collab";

// ─── Shared singletons on the app doc ─────────────────────────────────────────

/** Approval workflow state, keyed by reportId -> approval Y.Map. */
export const yApprovals = ydoc.getMap<Y.Map<unknown>>("collabhub:approvals");

/** Annotations: sectionId -> ordered Y.Array of note Y.Maps (replies nested). */
export const yAnnotations =
  ydoc.getMap<Y.Array<Y.Map<unknown>>>("collabhub:annotations");

/** Append-only audit JSON strings (mirrors the sharedAudit pattern). */
export const yAudit = ydoc.getArray<string>("collabhub:audit");

// ─── Plain-object view models ─────────────────────────────────────────────────

export type NoteColor = "yellow" | "blue" | "green" | "pink" | "purple";
export type NotePriority = "normal" | "important" | "urgent";

export interface AnnotationReply {
  id: string;
  author: string;
  text: string;
  at: number;
}

export interface AnnotationNote {
  id: string;
  sectionId: string;
  author: string;
  text: string;
  color: NoteColor;
  priority: NotePriority;
  at: number;
  resolved: boolean;
  resolvedAt?: number;
  resolvedBy?: string;
  replies: AnnotationReply[];
}

export type ApprovalStatus = "DRAFT" | "REVIEW" | "APPROVED" | "REJECTED";

export interface ApprovalHistoryEntry {
  id: string;
  status: ApprovalStatus;
  by: string;
  at: number;
  comment: string;
}

export interface ApprovalRecord {
  reportId: string;
  status: ApprovalStatus;
  reviewerName: string;
  history: ApprovalHistoryEntry[];
  sharedUrl?: string;
}

export type AuditEventType =
  | "data"
  | "export"
  | "annotation"
  | "approval"
  | "filter"
  | "system";

export interface CollabAuditEvent {
  id: string;
  type: AuditEventType;
  description: string;
  at: number;
  user: string;
}

// ─── id helper ────────────────────────────────────────────────────────────────

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 10);
}

// ─── Annotation accessors ─────────────────────────────────────────────────────

function sectionArray(
  map: Y.Map<Y.Array<Y.Map<unknown>>>,
  sectionId: string,
): Y.Array<Y.Map<unknown>> {
  let arr = map.get(sectionId);
  if (!arr) {
    arr = new Y.Array<Y.Map<unknown>>();
    map.set(sectionId, arr);
  }
  return arr;
}

function annotationFromYMap(m: Y.Map<unknown>): AnnotationNote {
  const repliesRaw = m.get("replies");
  const replies =
    repliesRaw instanceof Y.Array
      ? repliesRaw.toArray().map((r) => {
          const rm = r instanceof Y.Map ? r : null;
          return {
            id: String(rm?.get("id") ?? makeId()),
            author: String(rm?.get("author") ?? ""),
            text: String(rm?.get("text") ?? ""),
            at: Number(rm?.get("at")) || 0,
          } satisfies AnnotationReply;
        })
      : [];
  return {
    id: String(m.get("id")),
    sectionId: String(m.get("sectionId") ?? ""),
    author: String(m.get("author") ?? ""),
    text: String(m.get("text") ?? ""),
    color: (m.get("color") as NoteColor) ?? "yellow",
    priority: (m.get("priority") as NotePriority) ?? "normal",
    at: Number(m.get("at")) || 0,
    resolved: Boolean(m.get("resolved")),
    resolvedAt: m.get("resolvedAt") as number | undefined,
    resolvedBy: m.get("resolvedBy") as string | undefined,
    replies,
  };
}

/** Read all annotations for a section as plain objects (newest-first). */
export function readAnnotations(
  sectionId: string,
  map: Y.Map<Y.Array<Y.Map<unknown>>> = yAnnotations,
): AnnotationNote[] {
  const arr = map.get(sectionId);
  if (!arr) return [];
  return arr.toArray().map(annotationFromYMap);
}

/** Add an annotation note to a section. Returns the new note id. */
export function addAnnotation(
  input: {
    sectionId: string;
    author: string;
    text: string;
    color?: NoteColor;
    priority?: NotePriority;
  },
  map: Y.Map<Y.Array<Y.Map<unknown>>> = yAnnotations,
  doc: Y.Doc = ydoc,
): string {
  const id = makeId();
  doc.transact(() => {
    const arr = sectionArray(map, input.sectionId);
    const note = new Y.Map<unknown>();
    note.set("id", id);
    note.set("sectionId", input.sectionId);
    note.set("author", input.author);
    note.set("text", input.text);
    note.set("color", input.color ?? "yellow");
    note.set("priority", input.priority ?? "normal");
    note.set("at", Date.now());
    note.set("resolved", false);
    note.set("replies", new Y.Array<Y.Map<unknown>>());
    // newest-first ordering to match the existing UI
    arr.unshift([note]);
  });
  return id;
}

function findNote(
  arr: Y.Array<Y.Map<unknown>>,
  noteId: string,
): Y.Map<unknown> | null {
  for (const m of arr.toArray()) {
    if (m.get("id") === noteId) return m;
  }
  return null;
}

/** Mark / unmark an annotation resolved. */
export function setAnnotationResolved(
  sectionId: string,
  noteId: string,
  resolved: boolean,
  by: string | undefined,
  map: Y.Map<Y.Array<Y.Map<unknown>>> = yAnnotations,
  doc: Y.Doc = ydoc,
): void {
  const arr = map.get(sectionId);
  if (!arr) return;
  doc.transact(() => {
    const note = findNote(arr, noteId);
    if (!note) return;
    note.set("resolved", resolved);
    if (resolved) {
      note.set("resolvedAt", Date.now());
      note.set("resolvedBy", by);
    } else {
      note.delete("resolvedAt");
      note.delete("resolvedBy");
    }
  });
}

/** Delete an annotation note. */
export function deleteAnnotation(
  sectionId: string,
  noteId: string,
  map: Y.Map<Y.Array<Y.Map<unknown>>> = yAnnotations,
  doc: Y.Doc = ydoc,
): void {
  const arr = map.get(sectionId);
  if (!arr) return;
  doc.transact(() => {
    const items = arr.toArray();
    const idx = items.findIndex((m) => m.get("id") === noteId);
    if (idx >= 0) arr.delete(idx, 1);
  });
}

/** Append a reply to an annotation (nested CRDT → concurrent replies merge). */
export function replyToAnnotation(
  sectionId: string,
  noteId: string,
  reply: { author: string; text: string },
  map: Y.Map<Y.Array<Y.Map<unknown>>> = yAnnotations,
  doc: Y.Doc = ydoc,
): void {
  const arr = map.get(sectionId);
  if (!arr) return;
  doc.transact(() => {
    const note = findNote(arr, noteId);
    if (!note) return;
    let replies = note.get("replies") as Y.Array<Y.Map<unknown>> | undefined;
    if (!(replies instanceof Y.Array)) {
      replies = new Y.Array<Y.Map<unknown>>();
      note.set("replies", replies);
    }
    const rm = new Y.Map<unknown>();
    rm.set("id", makeId());
    rm.set("author", reply.author);
    rm.set("text", reply.text);
    rm.set("at", Date.now());
    replies.push([rm]);
  });
}

/** Observe annotation changes for a section (deep — notes mutate internally). */
export function observeAnnotations(
  sectionId: string,
  cb: () => void,
  map: Y.Map<Y.Array<Y.Map<unknown>>> = yAnnotations,
): () => void {
  // Observe the section array if present, else the parent map until it appears.
  const arr = map.get(sectionId);
  if (arr) {
    arr.observeDeep(cb);
    const mapCb = () => {
      // re-attach if the array identity is replaced
      cb();
    };
    map.observe(mapCb);
    return () => {
      arr.unobserveDeep(cb);
      map.unobserve(mapCb);
    };
  }
  map.observe(cb);
  return () => map.unobserve(cb);
}

// ─── Approval accessors ───────────────────────────────────────────────────────

function approvalFromYMap(m: Y.Map<unknown>): ApprovalRecord {
  const historyRaw = m.get("history");
  const history =
    historyRaw instanceof Y.Array
      ? historyRaw.toArray().map((h) => {
          const hm = h instanceof Y.Map ? h : null;
          return {
            id: String(hm?.get("id") ?? makeId()),
            status: (hm?.get("status") as ApprovalStatus) ?? "DRAFT",
            by: String(hm?.get("by") ?? ""),
            at: Number(hm?.get("at")) || 0,
            comment: String(hm?.get("comment") ?? ""),
          } satisfies ApprovalHistoryEntry;
        })
      : [];
  return {
    reportId: String(m.get("reportId")),
    status: (m.get("status") as ApprovalStatus) ?? "DRAFT",
    reviewerName: String(m.get("reviewerName") ?? ""),
    history,
    sharedUrl: m.get("sharedUrl") as string | undefined,
  };
}

/** Read the approval record for a report (null if none yet). */
export function readApproval(
  reportId: string,
  map: Y.Map<Y.Map<unknown>> = yApprovals,
): ApprovalRecord | null {
  const m = map.get(reportId);
  return m ? approvalFromYMap(m) : null;
}

/** Read every approval record. */
export function readApprovals(
  map: Y.Map<Y.Map<unknown>> = yApprovals,
): ApprovalRecord[] {
  const out: ApprovalRecord[] = [];
  for (const [, m] of map.entries()) out.push(approvalFromYMap(m));
  return out;
}

/**
 * Transition an approval, appending a history entry. Creates the record if it
 * does not exist yet.
 */
export function setApprovalStatus(
  input: {
    reportId: string;
    status: ApprovalStatus;
    by: string;
    comment?: string;
    reviewerName?: string;
    sharedUrl?: string;
  },
  map: Y.Map<Y.Map<unknown>> = yApprovals,
  doc: Y.Doc = ydoc,
): void {
  doc.transact(() => {
    let m = map.get(input.reportId);
    if (!m) {
      m = new Y.Map<unknown>();
      m.set("reportId", input.reportId);
      m.set("history", new Y.Array<Y.Map<unknown>>());
      map.set(input.reportId, m);
    }
    m.set("status", input.status);
    if (input.reviewerName !== undefined) {
      m.set("reviewerName", input.reviewerName);
    }
    if (input.sharedUrl !== undefined) m.set("sharedUrl", input.sharedUrl);
    let history = m.get("history") as Y.Array<Y.Map<unknown>> | undefined;
    if (!(history instanceof Y.Array)) {
      history = new Y.Array<Y.Map<unknown>>();
      m.set("history", history);
    }
    const entry = new Y.Map<unknown>();
    entry.set("id", makeId());
    entry.set("status", input.status);
    entry.set("by", input.by);
    entry.set("at", Date.now());
    entry.set("comment", input.comment ?? "");
    history.push([entry]);
  });
}

/** Observe approval changes (deep — records + history mutate internally). */
export function observeApprovals(
  cb: () => void,
  map: Y.Map<Y.Map<unknown>> = yApprovals,
): () => void {
  map.observeDeep(cb);
  return () => map.unobserveDeep(cb);
}

// ─── Audit accessors ──────────────────────────────────────────────────────────

const AUDIT_CAP = 500;

/** Append an audit event (append-only, capped). */
export function appendAuditEvent(
  event: Omit<CollabAuditEvent, "id" | "at">,
  arr: Y.Array<string> = yAudit,
  doc: Y.Doc = ydoc,
): CollabAuditEvent {
  const entry: CollabAuditEvent = {
    ...event,
    id: makeId(),
    at: Date.now(),
  };
  doc.transact(() => {
    arr.push([JSON.stringify(entry)]);
    if (arr.length > AUDIT_CAP) arr.delete(0, arr.length - AUDIT_CAP);
  });
  return entry;
}

/** Read audit events as plain objects (newest-first). */
export function readAuditEvents(
  arr: Y.Array<string> = yAudit,
): CollabAuditEvent[] {
  const out: CollabAuditEvent[] = [];
  for (const raw of arr.toArray()) {
    try {
      out.push(JSON.parse(raw) as CollabAuditEvent);
    } catch {
      // skip malformed
    }
  }
  return out.reverse();
}

/** Observe audit changes. */
export function observeAuditEvents(
  cb: () => void,
  arr: Y.Array<string> = yAudit,
): () => void {
  arr.observe(cb);
  return () => arr.unobserve(cb);
}
