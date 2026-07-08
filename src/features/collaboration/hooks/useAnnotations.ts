"use client";

/**
 * Annotations hook — CRDT-backed.
 *
 * This used to be a per-section `localStorage` silo (`annotations:<id>`) that
 * never reached teammates and clobbered on concurrent edits. It now delegates
 * to the platform Yjs substrate (`@/platform/collab`) via
 * `useAnnotationsCRDT`, so notes:
 *   - merge conflict-free across tabs (BroadcastChannel) and LAN peers
 *     (y-websocket relay), with nested replies that never clobber;
 *   - persist durably via y-indexeddb (survive reload, no 5MB localStorage cap);
 *   - share one identity with presence/audit (the LAN peer name).
 *
 * The public surface (types + return shape) is unchanged so the sticky-note UI
 * and the screen consume it without edits.
 */

import { type AnnotationsApi, useAnnotationsCRDT } from "../collab/collab-hub-crdt";

// Re-export the canonical CRDT view-model types under the names the UI imports.
export type {
  AnnotationNote as Annotation,
  AnnotationReply as NoteReply,
  NoteColor,
  NotePriority,
} from "@/platform/collab";

export type UseAnnotationsResult = AnnotationsApi;

/**
 * Live annotations for a report section. Reads/writes the shared CRDT doc; every
 * consumer re-renders only when that section's notes actually change.
 */
export function useAnnotations(sectionId: string): UseAnnotationsResult {
  return useAnnotationsCRDT(sectionId);
}
