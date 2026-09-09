"use client";

/**
 * CursorNoteMarker — a peer's sticky note anchored to a cursor position.
 *
 * Visible to every LAN peer, this is the shared-space counterpart to the
 * single-user StickyNoteAnnotation. Position is computed from `note.x` / `note.y`
 * (normalized 0..1 within the section's bounding rect) or, when only `row` is
 * provided, anchored to the row's vertical center.
 *
 * Security: peer-supplied color is hex-validated before being injected into a
 * style attribute, mirroring the `SAFE_COLOR` discipline in `live-cursors.tsx`
 * and `PresenceBar.tsx`. Anything else falls back to a neutral background.
 */

import { motion } from "motion/react";
import type { RefObject } from "react";
import { useEffect, useState } from "react";
import { cn } from "@/shared/utils";
import type { CursorNote } from "../hooks/use-cursor-notes";

const SAFE_COLOR = /^#[0-9a-f]{3,8}$/i;

interface CursorNoteMarkerProps {
  note: CursorNote;
  containerRef?: RefObject<HTMLElement | null>;
}

function firstLetter(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return trimmed[0].toUpperCase();
}

function safeColor(color: string): string | undefined {
  return SAFE_COLOR.test(color) ? color : undefined;
}

type Position = { left: number; top: number; height: number; width: number } | null;

function computePosition(note: CursorNote, rect: DOMRect | null): Position {
  if (!rect) return null;
  // Row anchor: place the note at the row's vertical center, indented ~12px
  // from the container's left edge. Row is treated as a 1-based index out of
  // the visible content height; peers can agree on a canonical row size by
  // convention (the consumer of the hook can stamp row heights).
  if (typeof note.row === "number") {
    const rowHeight = 32; // sensible default for table-style rows
    const top = (note.row - 1) * rowHeight + rowHeight / 2;
    if (top < 0 || top > rect.height) return null;
    return {
      left: 12,
      top,
      height: rect.height,
      width: rect.width,
    };
  }
  // Normalized x/y anchor: place the marker's top-left at the given fraction.
  if (typeof note.x === "number" && typeof note.y === "number") {
    const top = note.y * rect.height;
    const left = note.x * rect.width;
    return {
      left,
      top,
      height: rect.height,
      width: rect.width,
    };
  }
  return null;
}

export function CursorNoteMarker({ note, containerRef }: CursorNoteMarkerProps) {
  const [pos, setPos] = useState<Position>(() =>
    computePosition(note, containerRef?.current?.getBoundingClientRect() ?? null),
  );

  useEffect(() => {
    const el = containerRef?.current;
    if (!el) {
      setPos(null);
      return;
    }
    const update = () => {
      setPos(computePosition(note, el.getBoundingClientRect()));
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    // ResizeObserver handles parent layout reflow (the ref object is stable
    // but the element it points to can be replaced by the parent).
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      ro.disconnect();
    };
  }, [note, containerRef, containerRef?.current]);

  const accent = safeColor(note.authorColor);
  if (!pos) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.85, y: -4 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="absolute z-30"
      style={{
        left: pos.left,
        top: pos.top,
        transform: "translate(-50%, -50%)",
        pointerEvents: "none",
      }}
    >
      {/* Pin / anchor — non-interactive so the underlying surface stays clickable. */}
      <span
        aria-hidden
        className="absolute left-0 top-0 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background"
        style={{ backgroundColor: accent ?? "#3b82f6" }}
      />
      {/* Note card — interactive so the user can read / hover it. */}
      <div
        className={cn(
          "origin-top-left rounded-md border bg-amber-50 px-2.5 py-2 shadow-md",
          "dark:bg-amber-950/40 dark:text-amber-100",
          "border-amber-300/70 dark:border-amber-700/60",
        )}
        style={{
          borderLeftWidth: 4,
          borderLeftColor: accent ?? "#f59e0b",
          transform: "rotate(-2deg)",
          pointerEvents: "auto",
          maxWidth: 220,
        }}
      >
        <div className="flex items-center gap-1.5">
          <span
            className="grid size-8 shrink-0 place-content-center rounded-full text-xs font-semibold text-white"
            style={{ backgroundColor: accent ?? "#f59e0b" }}
          >
            {firstLetter(note.authorName)}
          </span>
          <span className="truncate text-xs font-semibold text-foreground">{note.authorName}</span>
        </div>
        <p className="mt-1 line-clamp-2 text-xs leading-snug text-foreground/90">{note.text}</p>
      </div>
    </motion.div>
  );
}
