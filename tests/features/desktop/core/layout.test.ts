import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Behavioral tests for the desktop-canvas geometry module.
 *
 * `getDesktopCanvas` is the only DOM-touching function here (it measures the
 * live `.dn-desktop-canvas` element, falling back to viewport math, then to an
 * SSR-safe constant); every other export is pure math given an explicit
 * `CanvasBox`, so most assertions pass a fixed canvas fixture rather than
 * relying on the real DOM.
 */

import {
  type CanvasBox,
  clampRectToCanvas,
  DOCK_INSET,
  defaultRectForCanvas,
  getDesktopCanvas,
  MENU_BAR_H,
  MIN_WIN_H,
  MIN_WIN_W,
  maximizedRect,
  WINDOW_MARGIN,
} from "@/features/desktop/core/layout";

// ─── helpers ─────────────────────────────────────────────────────────────────

function setViewport(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", {
    writable: true,
    configurable: true,
    value: height,
  });
}

/** Append a `.dn-desktop-canvas` div with a stubbed measurable rect. */
function mountCanvasEl(width: number, height: number): HTMLElement {
  const el = document.createElement("div");
  el.className = "dn-desktop-canvas";
  el.getBoundingClientRect = () =>
    ({
      width,
      height,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      x: 0,
      y: 0,
      toJSON() {
        return {};
      },
    }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  setViewport(1024, 768);
});

afterEach(() => {
  document.querySelectorAll(".dn-desktop-canvas").forEach((el) => {
    el.remove();
  });
  setViewport(1024, 768);
});

// ─── exported constants ──────────────────────────────────────────────────────

describe("exported constants", () => {
  it("MENU_BAR_H is 28 (h-7)", () => {
    expect(MENU_BAR_H).toBe(28);
  });

  it("DOCK_INSET is 96", () => {
    expect(DOCK_INSET).toBe(96);
  });

  it("WINDOW_MARGIN is 8", () => {
    expect(WINDOW_MARGIN).toBe(8);
  });

  it("MIN_WIN_W is 420", () => {
    expect(MIN_WIN_W).toBe(420);
  });

  it("MIN_WIN_H is 280", () => {
    expect(MIN_WIN_H).toBe(280);
  });
});

// ─── getDesktopCanvas — SSR fallback ─────────────────────────────────────────

describe("getDesktopCanvas — SSR fallback", () => {
  it("returns the fallback box when window is undefined", () => {
    vi.stubGlobal("window", undefined);
    const canvas = getDesktopCanvas();
    expect(canvas).toEqual({
      w: 1280,
      h: 800 - MENU_BAR_H,
      usableH: 800 - MENU_BAR_H - DOCK_INSET,
    });
    vi.unstubAllGlobals();
  });

  it("returns the fallback box when document is undefined", () => {
    vi.stubGlobal("document", undefined);
    const canvas = getDesktopCanvas();
    expect(canvas).toEqual({
      w: 1280,
      h: 800 - MENU_BAR_H,
      usableH: 800 - MENU_BAR_H - DOCK_INSET,
    });
    vi.unstubAllGlobals();
  });
});

// ─── getDesktopCanvas — no measurable element (viewport math) ───────────────

describe("getDesktopCanvas — falls back to viewport math", () => {
  it("uses window.innerWidth/innerHeight when no .dn-desktop-canvas element exists", () => {
    setViewport(1400, 900);
    const canvas = getDesktopCanvas();
    expect(canvas.w).toBe(1400);
    expect(canvas.h).toBe(900 - MENU_BAR_H);
    expect(canvas.usableH).toBe(Math.max(MIN_WIN_H, 900 - MENU_BAR_H - DOCK_INSET));
  });

  it("clamps usableH to MIN_WIN_H when the viewport is very short", () => {
    setViewport(1200, 200);
    const canvas = getDesktopCanvas();
    // h = 200 - 28 = 172; usableH would be 172 - 96 = 76 < MIN_WIN_H, so it floors.
    expect(canvas.h).toBe(172);
    expect(canvas.usableH).toBe(MIN_WIN_H);
  });

  it("clamps h to 0 when the viewport is shorter than the menu bar", () => {
    setViewport(1200, 10);
    const canvas = getDesktopCanvas();
    expect(canvas.h).toBe(0);
    expect(canvas.usableH).toBe(MIN_WIN_H);
  });

  it("falls back to viewport math when the element's rect has zero width", () => {
    mountCanvasEl(0, 700);
    setViewport(1300, 850);
    const canvas = getDesktopCanvas();
    expect(canvas.w).toBe(1300);
    expect(canvas.h).toBe(850 - MENU_BAR_H);
  });

  it("falls back to viewport math when the element's rect has zero height", () => {
    mountCanvasEl(900, 0);
    setViewport(1300, 850);
    const canvas = getDesktopCanvas();
    expect(canvas.w).toBe(1300);
    expect(canvas.h).toBe(850 - MENU_BAR_H);
  });
});

// ─── getDesktopCanvas — measurable .dn-desktop-canvas element ────────────────

describe("getDesktopCanvas — measures the real canvas element", () => {
  it("uses the element's bounding rect for w/h when it is measurable", () => {
    mountCanvasEl(1600, 1000);
    const canvas = getDesktopCanvas();
    expect(canvas.w).toBe(1600);
    expect(canvas.h).toBe(1000);
  });

  it("computes usableH as the rect height minus the dock inset", () => {
    mountCanvasEl(1600, 1000);
    const canvas = getDesktopCanvas();
    expect(canvas.usableH).toBe(1000 - DOCK_INSET);
  });

  it("clamps usableH to MIN_WIN_H when the element is short", () => {
    mountCanvasEl(1600, 150);
    const canvas = getDesktopCanvas();
    // 150 - 96 = 54 < MIN_WIN_H(280) → floors.
    expect(canvas.usableH).toBe(MIN_WIN_H);
  });
});

// ─── maximizedRect ────────────────────────────────────────────────────────────

describe("maximizedRect", () => {
  const canvas: CanvasBox = { w: 1200, h: 900, usableH: 800 };

  it("insets the usable canvas by WINDOW_MARGIN on every side", () => {
    const rect = maximizedRect(canvas);
    expect(rect).toEqual({ x: 8, y: 8, w: 1184, h: 784 });
  });

  it("floors width to MIN_WIN_W when the canvas is narrower than the minimum", () => {
    const rect = maximizedRect({ w: 100, h: 900, usableH: 800 });
    expect(rect.w).toBe(MIN_WIN_W);
  });

  it("floors height to MIN_WIN_H when usableH is small", () => {
    const rect = maximizedRect({ w: 1200, h: 900, usableH: 100 });
    expect(rect.h).toBe(MIN_WIN_H);
  });

  it("uses the live desktop canvas when no canvas argument is supplied", () => {
    // No .dn-desktop-canvas mounted → falls back to viewport math; just assert
    // the default-parameter branch produces a well-formed, minimum-respecting rect.
    const rect = maximizedRect();
    expect(rect.w).toBeGreaterThanOrEqual(MIN_WIN_W);
    expect(rect.h).toBeGreaterThanOrEqual(MIN_WIN_H);
    expect(rect.x).toBe(WINDOW_MARGIN);
    expect(rect.y).toBe(WINDOW_MARGIN);
  });
});

// ─── clampRectToCanvas ────────────────────────────────────────────────────────

describe("clampRectToCanvas", () => {
  const canvas: CanvasBox = { w: 1200, h: 900, usableH: 800 };

  it("returns the rect unchanged when it already fits and is in range", () => {
    const rect = clampRectToCanvas({ x: 100, y: 100, w: 500, h: 400 }, canvas);
    expect(rect).toEqual({ x: 100, y: 100, w: 500, h: 400 });
  });

  it("caps an oversized rect to the canvas and pulls it back to the margin corner", () => {
    const rect = clampRectToCanvas({ x: 0, y: 0, w: 2000, h: 2000 }, canvas);
    // maxW = 1200-16 = 1184; maxH = 900-16 = 884.
    expect(rect).toEqual({ x: 8, y: 8, w: 1184, h: 884 });
  });

  it("pulls a negative position back to WINDOW_MARGIN", () => {
    const rect = clampRectToCanvas({ x: -50, y: -50, w: 300, h: 300 }, canvas);
    expect(rect.x).toBe(WINDOW_MARGIN);
    expect(rect.y).toBe(WINDOW_MARGIN);
  });

  it("clamps x that overflows past the right edge to maxX", () => {
    const rect = clampRectToCanvas({ x: 5000, y: 100, w: 300, h: 300 }, canvas);
    // maxX = max(8, 1200-300-8) = 892.
    expect(rect.x).toBe(892);
    expect(rect.y).toBe(100);
  });

  it("keeps the titlebar visible for a window taller than the usable canvas", () => {
    const rect = clampRectToCanvas({ x: 100, y: 5000, w: 300, h: 1000 }, canvas);
    // maxY = max(8, usableH(800) - TITLE_VISIBLE(80)) = 720, independent of h.
    // h is capped separately to maxH = canvas.h(900) - WINDOW_MARGIN*2 = 884.
    expect(rect.y).toBe(720);
    expect(rect.h).toBe(884);
  });

  it("floors maxY to WINDOW_MARGIN when usableH is smaller than TITLE_VISIBLE", () => {
    const tinyCanvas: CanvasBox = { w: 100, h: 100, usableH: 50 };
    const rect = clampRectToCanvas({ x: 0, y: 0, w: 50, h: 50 }, tinyCanvas);
    // usableH(50) - TITLE_VISIBLE(80) = -30 → max(8, -30) = 8.
    expect(rect.y).toBe(WINDOW_MARGIN);
    expect(rect.x).toBe(WINDOW_MARGIN);
  });

  it("uses the live desktop canvas when no canvas argument is supplied", () => {
    const rect = clampRectToCanvas({ x: 0, y: 0, w: 300, h: 300 });
    expect(rect.w).toBeLessThanOrEqual(300);
    expect(rect.h).toBeLessThanOrEqual(300);
  });
});

// ─── defaultRectForCanvas ─────────────────────────────────────────────────────

describe("defaultRectForCanvas", () => {
  const canvas: CanvasBox = { w: 1200, h: 900, usableH: 800 };

  it("centers a preferred size that fits comfortably (seed 0 → no cascade offset)", () => {
    const rect = defaultRectForCanvas({ w: 600, h: 400 }, 0, canvas);
    // baseX = round((1200-600)/2) = 300; baseY = round((800-400)/3) = 133.
    expect(rect).toEqual({ x: 300, y: 133, w: 600, h: 400 });
  });

  it("offsets the cascade by 28px per seed step", () => {
    const rect = defaultRectForCanvas({ w: 600, h: 400 }, 1, canvas);
    expect(rect).toEqual({ x: 328, y: 161, w: 600, h: 400 });
  });

  it("wraps the cascade offset back to 0 every 6 seeds", () => {
    const seed0 = defaultRectForCanvas({ w: 600, h: 400 }, 0, canvas);
    const seed6 = defaultRectForCanvas({ w: 600, h: 400 }, 6, canvas);
    expect(seed6).toEqual(seed0);
  });

  it("shrinks a preferred size larger than the canvas down to the canvas bounds", () => {
    const rect = defaultRectForCanvas({ w: 2000, h: 2000 }, 0, canvas);
    // w = max(420, min(2000, 1184)) = 1184; h = max(280, min(2000, 784)) = 784.
    expect(rect.w).toBe(1184);
    expect(rect.h).toBe(784);
  });

  it("floors a preferred size below the minimums up to MIN_WIN_W/MIN_WIN_H", () => {
    const rect = defaultRectForCanvas({ w: 100, h: 100 }, 0, canvas);
    expect(rect.w).toBe(MIN_WIN_W);
    expect(rect.h).toBe(MIN_WIN_H);
  });

  it("is deterministic — same inputs always produce the same rect", () => {
    const a = defaultRectForCanvas({ w: 700, h: 500 }, 3, canvas);
    const b = defaultRectForCanvas({ w: 700, h: 500 }, 3, canvas);
    expect(a).toEqual(b);
  });

  it("uses the live desktop canvas when no canvas argument is supplied", () => {
    const rect = defaultRectForCanvas({ w: 600, h: 400 }, 0);
    expect(rect.w).toBeGreaterThanOrEqual(MIN_WIN_W);
    expect(rect.h).toBeGreaterThanOrEqual(MIN_WIN_H);
  });
});
