/**
 * Feature-local React bindings + lifecycle for the collab-hub CRDT substrate.
 *
 * collab-hub does NOT own a collaboration system. It rides the platform Yjs doc
 * (`@/platform/collab`) so annotations, approvals and the audit trail merge
 * conflict-free across tabs (BroadcastChannel) and LAN peers (y-websocket), and
 * survive reload via y-indexeddb. This module is the thin glue:
 *
 *   - `useCollabHubReady()` ........ boots cross-tab sync + durable persistence
 *                                    and one-shot-migrates the legacy
 *                                    localStorage silos into the doc.
 *   - `useAnnotationsCRDT(section)`  live annotations for a section.
 *   - `useApprovalCRDT(reportId)` .. live approval record.
 *   - `useAuditCRDT()` ............. live audit events (newest-first).
 *   - `recordAudit(...)` ........... append an audit event from any call site.
 *   - `currentUserName()` .......... durable LAN peer identity (audit/author).
 *
 * Discipline: every read goes through `useSyncExternalStore` with a cached
 * snapshot identity (so React only re-renders on a real change), and every
 * write goes through the platform accessors which wrap `doc.transact(...)`.
 */

"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  type AnnotationNote,
  type ApprovalRecord,
  type ApprovalStatus,
  type AuditEventType,
  addAnnotation,
  appendAuditEvent,
  type CollabAuditEvent,
  deleteAnnotation,
  ensureAppDocPersistence,
  type NoteColor,
  type NotePriority,
  observeAnnotations,
  observeApprovals,
  observeAuditEvents,
  readAnnotations,
  readApproval,
  readAuditEvents,
  replyToAnnotation,
  setAnnotationResolved,
  setApprovalStatus,
  startCollabSync,
  yApprovals,
  yAudit,
  ydoc,
} from "@/platform/collab";
import { readLANSettings } from "@/platform/lan/lan-collab";

// ─── Identity ─────────────────────────────────────────────────────────────────

/**
 * Durable display name for the local peer. Reuses the LAN peer identity managed
 * by `@/platform/lan/lan-collab` so audit `user` fields and annotation authors
 * correlate with the presence list everywhere in the app — no free-text silo.
 * Falls back to a stored override (set via the collab-hub store) when present.
 */
export function currentUserName(fallback?: string): string {
  if (typeof window === "undefined") return fallback ?? "You";
  const override =
    (typeof localStorage !== "undefined" && localStorage.getItem("collab:username")) || "";
  if (override) return override;
  try {
    return readLANSettings().peer.name || fallback || "You";
  } catch {
    return fallback ?? "You";
  }
}

// ─── Audit append (single write path) ─────────────────────────────────────────

/** Append an audit event to the shared CRDT log (LAN-synced, durable). */
export function recordAudit(type: AuditEventType, description: string, user?: string): void {
  appendAuditEvent({ type, description, user: user ?? currentUserName() });
}

/** Clear the shared CRDT audit log (deletes every entry; syncs to peers). */
export function clearAudit(): void {
  if (yAudit.length === 0) return;
  ydoc.transact(() => {
    yAudit.delete(0, yAudit.length);
  });
}

// ─── Boot: cross-tab sync + persistence + one-shot migration ──────────────────

const MIGRATION_FLAG = "collab-hub:crdt-migrated-v1";
const LEGACY_SECTIONS = [
  "overview",
  "transactions",
  "channels",
  "anomalies",
  "operators",
  "regions",
];

interface LegacyAnnotation {
  id?: string;
  author?: string;
  text?: string;
  color?: NoteColor;
  priority?: NotePriority;
  at?: number;
  resolved?: boolean;
  resolvedAt?: number;
  resolvedBy?: string;
  replies?: { id?: string; author?: string; text?: string; at?: number }[];
}

/**
 * One-shot, idempotent migration of the old per-section localStorage silos
 * (`annotations:<section>`) and the persisted Zustand audit log into the CRDT
 * doc. Runs once (guarded by a flag) so reloads never duplicate content.
 */
function migrateLegacyOnce(): void {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return;
  }
  if (localStorage.getItem(MIGRATION_FLAG)) return;

  try {
    // 1. Annotations: legacy notes were newest-first; addAnnotation unshifts, so
    //    replay oldest-first to preserve the visual order.
    for (const sectionId of LEGACY_SECTIONS) {
      const raw = localStorage.getItem(`annotations:${sectionId}`);
      if (!raw) continue;
      let legacy: LegacyAnnotation[] = [];
      try {
        legacy = JSON.parse(raw) as LegacyAnnotation[];
      } catch {
        legacy = [];
      }
      // Skip if this section already has CRDT notes (avoid double-import).
      if (readAnnotations(sectionId).length > 0) continue;
      for (let i = legacy.length - 1; i >= 0; i--) {
        const note = legacy[i];
        if (!note?.text) continue;
        const id = addAnnotation({
          sectionId,
          author: note.author ?? "Unknown",
          text: note.text,
          color: note.color ?? "yellow",
          priority: note.priority ?? "normal",
        });
        if (note.resolved) {
          setAnnotationResolved(sectionId, id, true, note.resolvedBy);
        }
        for (const reply of note.replies ?? []) {
          if (!reply?.text) continue;
          replyToAnnotation(sectionId, id, {
            author: reply.author ?? "Unknown",
            text: reply.text,
          });
        }
      }
      localStorage.removeItem(`annotations:${sectionId}`);
    }

    // 2. Audit: drain the persisted zustand store's audit (if it exists) into the
    //    CRDT log oldest-first so chronology is preserved, then clear it.
    try {
      const storeRaw = localStorage.getItem("collab-hub-store");
      if (storeRaw && readAuditEvents().length === 0) {
        const parsed = JSON.parse(storeRaw) as {
          state?: { auditEvents?: CollabAuditEvent[] };
        };
        const events = parsed.state?.auditEvents ?? [];
        // Stored newest-first → replay oldest-first.
        for (let i = events.length - 1; i >= 0; i--) {
          const ev = events[i];
          if (!ev?.description) continue;
          appendAuditEvent({
            type: ev.type ?? "system",
            description: ev.description,
            user: ev.user ?? "Unknown",
          });
        }
      }
    } catch {
      // ignore malformed store
    }

    // Legacy standalone audit key (pre-fix double-write) — remove if present.
    localStorage.removeItem("audit:events");
  } catch {
    // best-effort; a partial migration is still flagged so we don't loop
  } finally {
    localStorage.setItem(MIGRATION_FLAG, "1");
  }
}

let _migrated = false;

/**
 * Boot the collab-hub CRDT substrate: start cross-tab sync, attach durable
 * persistence, then run the one-shot legacy migration once local content has
 * loaded. Returns `true` once the doc is ready to read.
 *
 * Gating on this prevents a remote LAN peer's state from clobbering local-only
 * offline edits before they are loaded (the offline ordering invariant).
 */
export function useCollabHubReady(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const stopSync = startCollabSync();
    ensureAppDocPersistence()
      .then(() => {
        if (cancelled) return;
        if (!_migrated) {
          _migrated = true;
          migrateLegacyOnce();
        }
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
      stopSync();
    };
  }, []);

  return ready;
}

// ─── Annotations hook ─────────────────────────────────────────────────────────

export interface AnnotationsApi {
  notes: AnnotationNote[];
  unresolvedCount: number;
  addNote: (text: string, color?: NoteColor, priority?: NotePriority) => void;
  resolveNote: (id: string) => void;
  unresolveNote: (id: string) => void;
  deleteNote: (id: string) => void;
  replyToNote: (id: string, text: string) => void;
}

const EMPTY_NOTES: AnnotationNote[] = [];

/** Live annotations for a section, CRDT-backed and LAN-synced. */
export function useAnnotationsCRDT(sectionId: string): AnnotationsApi {
  // Cache the projected snapshot so useSyncExternalStore only triggers a render
  // when the section's notes actually change (observeDeep fires on any mutation).
  const cacheRef = useRef<AnnotationNote[]>(readAnnotations(sectionId));
  // Re-seed the cache when the section changes.
  const seededFor = useRef(sectionId);
  if (seededFor.current !== sectionId) {
    seededFor.current = sectionId;
    cacheRef.current = readAnnotations(sectionId);
  }

  const subscribe = useCallback(
    (onChange: () => void) => {
      // `observeAnnotations` deep-observes the section's Y.Array when it exists,
      // else the parent map until it appears. A section's first note both
      // creates the array AND attaches our parent-map listener, but that
      // listener won't deep-observe the (now materialized) array. Re-attach
      // whenever the array identity changes from absent → present so later
      // resolve/reply/delete mutations keep firing.
      let detach = observeAnnotations(sectionId, handle);
      let hadArray = readAnnotations(sectionId).length > 0;
      function handle() {
        cacheRef.current = readAnnotations(sectionId);
        const hasArray = cacheRef.current.length > 0;
        if (hasArray !== hadArray) {
          hadArray = hasArray;
          detach();
          detach = observeAnnotations(sectionId, handle);
        }
        onChange();
      }
      return () => detach();
    },
    [sectionId],
  );

  const getSnapshot = useCallback(() => cacheRef.current, []);
  const notes = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_NOTES);

  const addNote = useCallback(
    (text: string, color: NoteColor = "yellow", priority: NotePriority = "normal") => {
      const author = currentUserName();
      addAnnotation({ sectionId, author, text, color, priority });
      recordAudit("annotation", `Annotation added to "${sectionId}" section`, author);
    },
    [sectionId],
  );

  const resolveNote = useCallback(
    (id: string) => setAnnotationResolved(sectionId, id, true, currentUserName()),
    [sectionId],
  );
  const unresolveNote = useCallback(
    (id: string) => setAnnotationResolved(sectionId, id, false, undefined),
    [sectionId],
  );
  const deleteNote = useCallback((id: string) => deleteAnnotation(sectionId, id), [sectionId]);
  const replyToNote = useCallback(
    (id: string, text: string) =>
      replyToAnnotation(sectionId, id, { author: currentUserName(), text }),
    [sectionId],
  );

  const unresolvedCount = notes.reduce((n, note) => (note.resolved ? n : n + 1), 0);

  return {
    notes,
    unresolvedCount,
    addNote,
    resolveNote,
    unresolveNote,
    deleteNote,
    replyToNote,
  };
}

// ─── Approval hook ────────────────────────────────────────────────────────────

const DEFAULT_REPORT_ID = "current-report";

export interface ApprovalApi {
  reportId: string;
  record: ApprovalRecord;
  transition: (status: ApprovalStatus, comment?: string, reviewerName?: string) => void;
  setSharedUrl: (url: string) => void;
  reset: () => void;
}

function defaultApproval(reportId: string): ApprovalRecord {
  return { reportId, status: "DRAFT", reviewerName: "", history: [] };
}

/** Live approval record for a report, CRDT-backed and LAN-synced. */
export function useApprovalCRDT(reportId: string = DEFAULT_REPORT_ID): ApprovalApi {
  const cacheRef = useRef<ApprovalRecord>(readApproval(reportId) ?? defaultApproval(reportId));

  const subscribe = useCallback(
    (onChange: () => void) =>
      observeApprovals(() => {
        cacheRef.current = readApproval(reportId) ?? defaultApproval(reportId);
        onChange();
      }),
    [reportId],
  );
  const getSnapshot = useCallback(() => cacheRef.current, []);
  const serverSnapshot = useCallback(() => defaultApproval(reportId), [reportId]);
  const record = useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);

  const transition = useCallback(
    (status: ApprovalStatus, comment?: string, reviewerName?: string) => {
      const by = currentUserName();
      setApprovalStatus({ reportId, status, by, comment, reviewerName });
      recordAudit("approval", `Report ${status.toLowerCase()} by ${by}`, by);
    },
    [reportId],
  );

  // Set just the shared URL without appending a workflow history entry.
  const setSharedUrl = useCallback(
    (url: string) => {
      const m = yApprovals.get(reportId);
      if (!m) {
        setApprovalStatus({ reportId, status: "DRAFT", by: currentUserName(), sharedUrl: url });
        return;
      }
      ydoc.transact(() => {
        m.set("sharedUrl", url);
      });
    },
    [reportId],
  );

  const reset = useCallback(() => {
    const by = currentUserName();
    // A DRAFT transition with a fresh history start: clear by setting status and
    // letting history record the reset (CRDT history is append-only by design).
    setApprovalStatus({ reportId, status: "DRAFT", by, reviewerName: "", comment: "reset" });
    recordAudit("approval", `Report reset to draft by ${by}`, by);
  }, [reportId]);

  return { reportId, record, transition, setSharedUrl, reset };
}

// ─── Audit hook ───────────────────────────────────────────────────────────────

const EMPTY_AUDIT: CollabAuditEvent[] = [];

/** Live audit events (newest-first), CRDT-backed and LAN-synced. */
export function useAuditCRDT(): CollabAuditEvent[] {
  const cacheRef = useRef<CollabAuditEvent[]>(readAuditEvents());

  const subscribe = useCallback((onChange: () => void) => {
    return observeAuditEvents(() => {
      cacheRef.current = readAuditEvents();
      onChange();
    });
  }, []);
  const getSnapshot = useCallback(() => cacheRef.current, []);

  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_AUDIT);
}
