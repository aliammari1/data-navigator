"use client";

/**
 * Shared desktop-canvas geometry.
 *
 * The desktop is a flex column: a fixed-height menu bar on top, then the
 * `.dn-desktop-canvas` (`flex-1`) that hosts every window, with the dock
 * floating over the bottom as a `fixed` overlay. Windows are positioned in the
 * canvas's coordinate space (Rnd `bounds="parent"`), so any code that places,
 * clamps or maximises a window needs the same canvas math. Keeping it here is
 * the single source of truth so the store, the window frame and the resize
 * reflow never drift.
 */

import type { WindowRect } from "@/features/desktop/core/types";

/** Menu-bar height (`h-7` = 1.75rem). */
export const MENU_BAR_H = 28;
/** Bottom strip reserved for the floating dock so windows stay clear of it. */
export const DOCK_INSET = 96;
/** Breathing room kept around a window inside the canvas. */
export const WINDOW_MARGIN = 8;
/** Minimum window size — mirrors the Rnd `minWidth`/`minHeight` in window-frame. */
export const MIN_WIN_W = 420;
export const MIN_WIN_H = 280;
/** Keep at least this much of a window's top edge grabbable when clamping. */
const TITLE_VISIBLE = 80;

export interface CanvasBox {
  /** Full canvas width (≈ viewport width). */
  w: number;
  /** Full canvas height below the menu bar (the dock floats over the bottom). */
  h: number;
  /** Usable height that is NOT covered by the dock — what a maximised window fills. */
  usableH: number;
}

const FALLBACK: CanvasBox = {
  w: 1280,
  h: 800 - MENU_BAR_H,
  usableH: 800 - MENU_BAR_H - DOCK_INSET,
};

/**
 * Measure the live desktop canvas. Prefers the real `.dn-desktop-canvas` element
 * (robust to chrome changes); falls back to viewport math, then to a sane SSR
 * default. `usableH` subtracts the dock overlay so maximised/clamped windows do
 * not tuck behind it.
 */
export function getDesktopCanvas(): CanvasBox {
  if (typeof window === "undefined" || typeof document === "undefined") return FALLBACK;
  const el = document.querySelector(".dn-desktop-canvas");
  if (el) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      return { w: r.width, h: r.height, usableH: Math.max(MIN_WIN_H, r.height - DOCK_INSET) };
    }
  }
  const h = Math.max(0, window.innerHeight - MENU_BAR_H);
  return { w: window.innerWidth, h, usableH: Math.max(MIN_WIN_H, h - DOCK_INSET) };
}

/** The rect a maximised window fills: the usable canvas minus a small inset. */
export function maximizedRect(canvas: CanvasBox = getDesktopCanvas()): WindowRect {
  return {
    x: WINDOW_MARGIN,
    y: WINDOW_MARGIN,
    w: Math.max(MIN_WIN_W, canvas.w - WINDOW_MARGIN * 2),
    h: Math.max(MIN_WIN_H, canvas.usableH - WINDOW_MARGIN * 2),
  };
}

/**
 * Clamp a window rect so it fits inside — and stays reachable within — the
 * canvas: size is capped to the canvas (never below the minimums), then the
 * position is pulled back so the window is on-screen with its titlebar grabbable.
 */
export function clampRectToCanvas(
  rect: WindowRect,
  canvas: CanvasBox = getDesktopCanvas(),
): WindowRect {
  const maxW = Math.max(MIN_WIN_W, canvas.w - WINDOW_MARGIN * 2);
  const maxH = Math.max(MIN_WIN_H, canvas.h - WINDOW_MARGIN * 2);
  const w = Math.min(rect.w, maxW);
  const h = Math.min(rect.h, maxH);
  const maxX = Math.max(WINDOW_MARGIN, canvas.w - w - WINDOW_MARGIN);
  // Keep the titlebar on-screen even for windows taller than the usable canvas.
  const maxY = Math.max(WINDOW_MARGIN, canvas.usableH - TITLE_VISIBLE);
  const x = Math.min(Math.max(WINDOW_MARGIN, rect.x), maxX);
  const y = Math.min(Math.max(WINDOW_MARGIN, rect.y), maxY);
  return { x, y, w, h };
}

/**
 * A cascading default rect for a freshly opened window: the app's preferred size
 * shrunk to fit the canvas, offset by the spawn seed, and centred when it would
 * otherwise overflow. Pure given a canvas, so it is deterministic and SSR-safe.
 */
export function defaultRectForCanvas(
  preferred: { w: number; h: number },
  seed: number,
  canvas: CanvasBox = getDesktopCanvas(),
): WindowRect {
  const w = Math.max(MIN_WIN_W, Math.min(preferred.w, canvas.w - WINDOW_MARGIN * 2));
  const h = Math.max(MIN_WIN_H, Math.min(preferred.h, canvas.usableH - WINDOW_MARGIN * 2));
  const off = (seed % 6) * 28;
  // Centre as the baseline, then nudge by the cascade offset so stacked opens
  // don't perfectly overlap — and clamp the whole thing back onto the canvas.
  const baseX = Math.max(WINDOW_MARGIN, Math.round((canvas.w - w) / 2));
  const baseY = Math.max(WINDOW_MARGIN, Math.round((canvas.usableH - h) / 3));
  return clampRectToCanvas({ x: baseX + off, y: baseY + off, w, h }, canvas);
}
