"use client";

/**
 * Window snapping geometry — pure, presentation-free.
 *
 * Windows-11 "Snap" + macOS edge-tiling: while a window is dragged near a
 * viewport edge or corner, the frame should show a translucent preview of the
 * rect the window will occupy when released. This module owns the maths only:
 * it computes the named snap zones for a viewport and resolves which zone a
 * pointer is hovering. The window frame consumes these to render a preview
 * (see `snap-overlay`) and to commit a rect on drop.
 *
 * No React, no DOM side effects — just rects. All rects are in viewport
 * pixels and share the {@link WindowRect} shape used by the desktop store.
 */

import type { WindowRect } from "./types";

/** Named snap targets. `maximize` is the full-viewport tile. */
export type SnapZoneName =
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "topLeft"
  | "topRight"
  | "bottomLeft"
  | "bottomRight"
  | "maximize";

/** Viewport box the zones are computed against. */
export interface SnapViewport {
  /** Usable width in px (typically window.innerWidth). */
  width: number;
  /** Usable height in px (typically window.innerHeight). */
  height: number;
  /** Inset reserved at the top for the menu bar. Default 0. */
  top?: number;
  /** Inset reserved at the bottom for the dock. Default 0. */
  bottom?: number;
  /** Inset reserved at the left. Default 0. */
  left?: number;
  /** Inset reserved at the right. Default 0. */
  right?: number;
}

/** Full map of every snap zone to its target rect. */
export type SnapZones = Record<SnapZoneName, WindowRect>;

/**
 * How close (in px) the pointer must be to an edge to trigger a half/full snap,
 * and to a corner to trigger a quarter snap. The corner band is intentionally
 * larger so corners win over edges when both would match.
 */
export const SNAP_EDGE_THRESHOLD = 12;
export const SNAP_CORNER_THRESHOLD = 36;

/** Resolve the usable content box of a viewport after applying its insets. */
function contentBox(viewport: SnapViewport): WindowRect {
  const top = viewport.top ?? 0;
  const bottom = viewport.bottom ?? 0;
  const left = viewport.left ?? 0;
  const right = viewport.right ?? 0;
  const x = left;
  const y = top;
  const w = Math.max(0, viewport.width - left - right);
  const h = Math.max(0, viewport.height - top - bottom);
  return { x, y, w, h };
}

/**
 * Compute every snap zone's target rect for a viewport.
 *
 * Halves split the usable box down the middle; quarters split it into four;
 * `top`/`bottom` are the horizontal halves; `maximize` is the whole box.
 */
export function computeSnapZones(viewport: SnapViewport): SnapZones {
  const box = contentBox(viewport);
  const halfW = Math.round(box.w / 2);
  const halfH = Math.round(box.h / 2);
  const rightW = box.w - halfW;
  const bottomH = box.h - halfH;
  const midX = box.x + halfW;
  const midY = box.y + halfH;

  return {
    maximize: { x: box.x, y: box.y, w: box.w, h: box.h },
    left: { x: box.x, y: box.y, w: halfW, h: box.h },
    right: { x: midX, y: box.y, w: rightW, h: box.h },
    top: { x: box.x, y: box.y, w: box.w, h: halfH },
    bottom: { x: box.x, y: midY, w: box.w, h: bottomH },
    topLeft: { x: box.x, y: box.y, w: halfW, h: halfH },
    topRight: { x: midX, y: box.y, w: rightW, h: halfH },
    bottomLeft: { x: box.x, y: midY, w: halfW, h: bottomH },
    bottomRight: { x: midX, y: midY, w: rightW, h: bottomH },
  };
}

/**
 * Resolve which snap zone a pointer at (x, y) targets, or `null` when the
 * pointer is not near any edge/corner.
 *
 * Resolution order:
 *  1. Corners (within {@link SNAP_CORNER_THRESHOLD} of two edges) → quarter.
 *  2. Top edge → `maximize` (Windows-11 behaviour: drag to top = full).
 *  3. Left / right edge → half.
 *  4. Bottom edge → bottom half.
 * Anything else → `null`.
 *
 * Coordinates are interpreted against the viewport's own insets so the dock /
 * menu bar bands do not count as the true viewport edges.
 */
export function snapForPointer(x: number, y: number, viewport: SnapViewport): SnapZoneName | null {
  const top = viewport.top ?? 0;
  const bottom = viewport.bottom ?? 0;
  const left = viewport.left ?? 0;
  const right = viewport.right ?? 0;

  const minX = left;
  const maxX = viewport.width - right;
  const minY = top;
  const maxY = viewport.height - bottom;

  // Outside the usable box entirely → clamp to nearest edge band by distance.
  const nearLeft = x - minX <= SNAP_EDGE_THRESHOLD;
  const nearRight = maxX - x <= SNAP_EDGE_THRESHOLD;
  const nearTop = y - minY <= SNAP_EDGE_THRESHOLD;
  const nearBottom = maxY - y <= SNAP_EDGE_THRESHOLD;

  const inCornerLeft = x - minX <= SNAP_CORNER_THRESHOLD;
  const inCornerRight = maxX - x <= SNAP_CORNER_THRESHOLD;
  const inCornerTop = y - minY <= SNAP_CORNER_THRESHOLD;
  const inCornerBottom = maxY - y <= SNAP_CORNER_THRESHOLD;

  // 1) Corners first (quarters).
  if (inCornerTop && inCornerLeft) return "topLeft";
  if (inCornerTop && inCornerRight) return "topRight";
  if (inCornerBottom && inCornerLeft) return "bottomLeft";
  if (inCornerBottom && inCornerRight) return "bottomRight";

  // 2) Top edge → maximize.
  if (nearTop) return "maximize";

  // 3) Side edges → halves.
  if (nearLeft) return "left";
  if (nearRight) return "right";

  // 4) Bottom edge → bottom half.
  if (nearBottom) return "bottom";

  return null;
}

/** Convenience: the target rect for a resolved zone, or `null`. */
export function rectForZone(zone: SnapZoneName | null, viewport: SnapViewport): WindowRect | null {
  if (!zone) return null;
  return computeSnapZones(viewport)[zone];
}
