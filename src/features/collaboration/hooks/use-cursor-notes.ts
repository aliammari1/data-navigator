"use client";

/**
 * Cursor-anchored sticky notes — collaboration overlay.
 *
 * Mirrors the existing single-user StickyNoteAnnotation, but the notes live on
 * the shared LAN room map (`sharedLanRoom`) so they show up for every peer in
 * the room the moment the author clicks "Share". One key per section holding a
 * JSON-encoded `CursorNote[]` keeps the shape small and idempotent — re-emitting
 * the full array is fine because notes are low-rate (one per "Post Note" click),
 * unlike pointer/selection which is throttled upstream.
 *
 * The hook re-renders only when the notes for `sectionId` actually change
 * (string-comparison of the JSON payload, so a no-op transaction doesn't churn).
 */

import { useCallback, useEffect, useState } from "react";
import { sharedLanRoom } from "@/platform/collab";
import { readLANSettings, subscribeLANRoom } from "@/platform/lan/lan-collab";

export interface CursorNote {
  id: string;
  sectionId: string;
  authorPeerId: string;
  authorName: string;
  authorColor: string;
  row?: number;
  x?: number;
  y?: number;
  text: string;
  createdAt: number;
}

const CURSOR_NOTES_KEY_PREFIX = "cursorNotes:";
const SAFE_COLOR = /^#[0-9a-f]{3,8}$/i;

function keyFor(sectionId: string): string {
  return `${CURSOR_NOTES_KEY_PREFIX}${sectionId}`;
}

function readNotes(sectionId: string): CursorNote[] {
  const raw = sharedLanRoom.get(keyFor(sectionId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCursorNote);
  } catch {
    return [];
  }
}

function isCursorNote(value: unknown): value is CursorNote {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.sectionId === "string" &&
    typeof v.authorPeerId === "string" &&
    typeof v.authorName === "string" &&
    typeof v.authorColor === "string" &&
    typeof v.text === "string" &&
    typeof v.createdAt === "number"
  );
}

/**
 * Live cursor notes for a section, LAN-synced via the shared room map.
 * Re-renders only when the notes for this section change.
 */
export function useCursorNotes(sectionId: string | null): CursorNote[] {
  const [notes, setNotes] = useState<CursorNote[]>(() =>
    sectionId ? readNotes(sectionId) : [],
  );

  useEffect(() => {
    if (!sectionId) {
      setNotes([]);
      return;
    }
    setNotes(readNotes(sectionId));
    return subscribeLANRoom(() => {
      setNotes((prev) => {
        const next = readNotes(sectionId);
        if (next.length === prev.length) {
          let changed = false;
          for (let i = 0; i < next.length; i++) {
            if (next[i].id !== prev[i].id || next[i].text !== prev[i].text) {
              changed = true;
              break;
            }
          }
          if (!changed) return prev;
        }
        return next;
      });
    });
  }, [sectionId]);

  return notes;
}

/**
 * Append a cursor note to the section's shared list. The peer identity is
 * pulled from the LAN settings so the author + color match presence/audit.
 */
export function addCursorNote(note: Omit<CursorNote, "id" | "createdAt">): CursorNote {
  const settings = readLANSettings();
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const createdAt = Date.now();
  const safeColor = SAFE_COLOR.test(note.authorColor) ? note.authorColor : settings.peer.color;
  const full: CursorNote = {
    ...note,
    id,
    createdAt,
    authorPeerId: settings.peer.id || note.authorPeerId,
    authorName: settings.peer.name || note.authorName,
    authorColor: safeColor,
  };
  const current = readNotes(note.sectionId);
  // Drop any pre-existing entry with the same id (idempotent re-share) before
  // pushing the fresh one — collisions are essentially impossible with UUIDs
  // but keeping the list clean avoids stale duplicates on retried clicks.
  const deduped = current.filter((n) => n.id !== full.id);
  deduped.push(full);
  sharedLanRoom.set(keyFor(note.sectionId), JSON.stringify(deduped));
  return full;
}

/**
 * Convenience hook that also returns a memoized `addCursorNote` bound to the
 * current section. Identity fields default to the local peer settings.
 */
export function useCursorNoteActions(sectionId: string | null): {
  addCursorNote: (note: Omit<CursorNote, "id" | "createdAt" | "sectionId">) => CursorNote | null;
} {
  const add = useCallback(
    (note: Omit<CursorNote, "id" | "createdAt" | "sectionId">): CursorNote | null => {
      if (!sectionId) return null;
      return addCursorNote({ ...note, sectionId });
    },
    [sectionId],
  );
  return { addCursorNote: add };
}
