"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Typed drag-and-drop protocol for the desktop.
 *
 * Desktop items (datasets, folders, columns, charts, KPIs) can be dragged onto
 * windows, the dock, or folders. To keep payloads typed and self-describing we
 * serialize a single JSON blob under a private MIME type. Drop targets read it
 * back through `readDrag` and decide whether to accept it via the `accept` set
 * in `useDropTarget`.
 *
 * The browser exposes drag types in lowercase, so the MIME type is lowercase
 * and we always set a `text/plain` fallback (the label) for native targets.
 */

/** What can be dragged across the desktop. */
export type DesktopDragKind = "dataset" | "folder" | "column" | "chart" | "kpi";

/** Self-describing drag payload carried on the dataTransfer object. */
export interface DesktopDragPayload {
  kind: DesktopDragKind;
  id: string;
  label?: string;
  /** Underlying DuckDB/SQL table name when the item is data-backed. */
  tableName?: string;
  meta?: Record<string, unknown>;
}

/** Private MIME type identifying a data-navigator desktop drag. */
export const DESKTOP_DND_MIME = "application/x-data-navigator";

type AnyDragEvent = DragEvent | (React.DragEvent & { dataTransfer: DataTransfer });

/**
 * Write a typed payload onto the drag event's dataTransfer.
 * Also sets a `text/plain` label fallback and a copy effect.
 */
export function serializeDrag(e: DragEvent | React.DragEvent, payload: DesktopDragPayload): void {
  const dt = (e as AnyDragEvent).dataTransfer;
  if (!dt) return;
  const json = JSON.stringify(payload);
  try {
    dt.setData(DESKTOP_DND_MIME, json);
    // Fallbacks for native drop targets / inspectors.
    dt.setData("text/plain", payload.label ?? payload.id);
  } catch {
    // Some environments throw if setData is called outside a dragstart; ignore.
  }
  try {
    dt.effectAllowed = "copy";
  } catch {
    // effectAllowed may be read-only during certain phases.
  }
}

/**
 * Read a typed payload back from a drag/drop event.
 * Returns `null` when the event carries no data-navigator payload or it is
 * malformed.
 */
export function readDrag(e: DragEvent | React.DragEvent): DesktopDragPayload | null {
  const dt = (e as AnyDragEvent).dataTransfer;
  if (!dt) return null;
  let raw = "";
  try {
    raw = dt.getData(DESKTOP_DND_MIME);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DesktopDragPayload;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.id !== "string" || typeof parsed.kind !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Cheaply detect whether the current dragover event carries a desktop payload
 * of an accepted kind. During `dragover` the payload data is NOT readable for
 * security reasons, so we can only inspect `dataTransfer.types`. Kind filtering
 * therefore happens on drop; dragover only checks the MIME type is present.
 */
function hasDesktopType(e: DragEvent | React.DragEvent): boolean {
  const dt = (e as AnyDragEvent).dataTransfer;
  if (!dt) return false;
  const types = dt.types;
  if (!types) return false;
  // DOMStringList vs string[] — both support includes/contains semantics.
  for (let i = 0; i < types.length; i++) {
    if (types[i] === DESKTOP_DND_MIME) return true;
  }
  return false;
}

/** Handlers returned by {@link useDropTarget}, spread onto the drop zone element. */
interface DropProps {
  onDragOver: (e: React.DragEvent) => void;
  onDragEnter: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

export interface UseDropTargetOptions {
  /** Accepted drag kinds. Omit/empty to accept any desktop payload. */
  accept?: DesktopDragKind[];
  /** Called with the decoded payload when an accepted item is dropped. */
  onDrop: (payload: DesktopDragPayload, e: React.DragEvent) => void;
}

export interface UseDropTargetResult {
  /** True while an accepted desktop drag is hovering this target. */
  isOver: boolean;
  /** Spread these onto the drop-zone element. */
  dropProps: DropProps;
}

/**
 * Build a drop zone for desktop drag payloads.
 *
 * Tracks `isOver` (true only while an accepted desktop drag hovers), and calls
 * `onDrop` with the decoded, kind-filtered payload. Uses an enter/leave counter
 * so nested children don't flicker the `isOver` flag.
 */
export function useDropTarget(options: UseDropTargetOptions): UseDropTargetResult {
  const { accept, onDrop } = options;
  const [isOver, setIsOver] = useState(false);
  const depth = useRef(0);

  const isAccepted = useCallback(
    (payload: DesktopDragPayload) =>
      !accept || accept.length === 0 || accept.includes(payload.kind),
    [accept],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (!hasDesktopType(e)) return;
    e.preventDefault();
    try {
      e.dataTransfer.dropEffect = "copy";
    } catch {
      // dropEffect can be read-only in some phases.
    }
  }, []);

  const onDragEnter = useCallback((e: React.DragEvent) => {
    if (!hasDesktopType(e)) return;
    e.preventDefault();
    depth.current += 1;
    setIsOver(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (!hasDesktopType(e)) return;
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setIsOver(false);
  }, []);

  const onDropHandler = useCallback(
    (e: React.DragEvent) => {
      depth.current = 0;
      setIsOver(false);
      const payload = readDrag(e);
      if (!payload) return;
      if (!isAccepted(payload)) return;
      e.preventDefault();
      onDrop(payload, e);
    },
    [isAccepted, onDrop],
  );

  return {
    isOver,
    dropProps: {
      onDragOver,
      onDragEnter,
      onDragLeave,
      onDrop: onDropHandler,
    },
  };
}
