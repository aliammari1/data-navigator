"use client";

import { AnimatePresence } from "motion/react";
import { SnapshotArtifact } from "@/features/desktop/components/snapshot-artifact";
import {
  type DesktopSnapshot,
  useDesktopStore,
  useSnapshots,
} from "@/features/desktop/store/desktop-store";

/**
 * Desktop layer that renders every pinned snapshot as a draggable glass card on
 * the canvas. Mount this once inside the desktop, beneath the window layer so
 * artifacts sit on the wallpaper like sticky notes.
 *
 * It is a pure projection of `useSnapshots()`; positioning, removal and
 * re-opening are owned by each `<SnapshotArtifact>`.
 */
export function SnapshotsLayer() {
  const snapshots = useSnapshots();

  if (snapshots.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0">
      {/* Children re-enable pointer events so the wallpaper/icons behind stay interactive. */}
      <div className="pointer-events-auto contents">
        <AnimatePresence>
          {snapshots.map((snap) => (
            <SnapshotArtifact key={snap.id} snapshot={snap} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** Sensible default size for a freshly captured snapshot tile. */
const DEFAULT_SNAPSHOT_SIZE = { w: 280, h: 220 };

/** Loose cascade so consecutive captures don't stack perfectly. */
function cascadePosition(): { x: number; y: number } {
  const count = useDesktopStore.getState().snapshots.length;
  const off = (count % 6) * 30;
  return { x: 120 + off, y: 96 + off };
}

/**
 * Imperative helper to freeze an artifact onto the desktop as a pinned snapshot.
 *
 * Producing apps (charts, tables, AI answers, images) call this to "pin" their
 * current output. `x`/`y`/`w`/`h` are optional — when omitted, a cascading
 * position and a default tile size are applied. Returns the new snapshot id.
 *
 * @example
 * captureSnapshot({ title: "Taux de succès", kind: "chart", appId: "telecom", html });
 */
export function captureSnapshot(
  partial: Omit<DesktopSnapshot, "id" | "createdAt" | "x" | "y" | "w" | "h"> &
    Partial<Pick<DesktopSnapshot, "id" | "createdAt" | "x" | "y" | "w" | "h">>,
): string {
  const fallback = cascadePosition();
  return useDesktopStore.getState().pinSnapshot({
    ...partial,
    x: partial.x ?? fallback.x,
    y: partial.y ?? fallback.y,
    w: partial.w ?? DEFAULT_SNAPSHOT_SIZE.w,
    h: partial.h ?? DEFAULT_SNAPSHOT_SIZE.h,
  });
}
