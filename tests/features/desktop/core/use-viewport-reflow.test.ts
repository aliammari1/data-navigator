import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Behavioral tests for `useViewportReflow`.
 *
 * The hook reads/writes the desktop store imperatively and debounces work
 * through `requestAnimationFrame`, so both the store and the canvas measurer
 * are mocked, and `requestAnimationFrame`/`cancelAnimationFrame` are replaced
 * with a deterministic fake that lets tests control exactly when a scheduled
 * frame fires — without that, the debounce/cleanup behavior under test would
 * be at the mercy of real animation-frame timing.
 */

const h = vi.hoisted(() => ({
  reflowWindows: vi.fn(),
  canvasBox: { w: 1280, h: 800, usableH: 700 },
}));

vi.mock("@/features/desktop/store/desktop-store", () => ({
  useDesktopStore: {
    getState: () => ({ reflowWindows: h.reflowWindows }),
  },
}));

vi.mock("@/features/desktop/core/layout", () => ({
  getDesktopCanvas: () => h.canvasBox,
}));

import { useViewportReflow } from "@/features/desktop/core/use-viewport-reflow";

// ─── Fake requestAnimationFrame ──────────────────────────────────────────────

let nextId: number;
let pending: Map<number, FrameRequestCallback>;
let rafSpy: ReturnType<typeof vi.fn>;
let cafSpy: ReturnType<typeof vi.fn>;

function installFakeRaf() {
  nextId = 1;
  pending = new Map();
  rafSpy = vi.fn((cb: FrameRequestCallback) => {
    const id = nextId++;
    pending.set(id, cb);
    return id;
  });
  cafSpy = vi.fn((id: number) => {
    pending.delete(id);
  });
  vi.stubGlobal("requestAnimationFrame", rafSpy);
  vi.stubGlobal("cancelAnimationFrame", cafSpy);
}

/** Run a specific pending frame by id (as the browser would on the next tick). */
function runFrame(id: number) {
  const cb = pending.get(id);
  pending.delete(id);
  cb?.(0);
}

beforeEach(() => {
  installFakeRaf();
});

// ─── initial mount ────────────────────────────────────────────────────────────

describe("useViewportReflow — initial mount", () => {
  it("schedules exactly one animation frame on mount", () => {
    renderHook(() => useViewportReflow());
    expect(rafSpy).toHaveBeenCalledTimes(1);
  });

  it("does not call reflowWindows before the scheduled frame fires", () => {
    renderHook(() => useViewportReflow());
    expect(h.reflowWindows).not.toHaveBeenCalled();
  });

  it("calls reflowWindows with the measured canvas once the initial frame fires", () => {
    renderHook(() => useViewportReflow());
    act(() => runFrame(1));
    expect(h.reflowWindows).toHaveBeenCalledTimes(1);
    expect(h.reflowWindows).toHaveBeenCalledWith(h.canvasBox);
  });

  it("registers a window resize listener", () => {
    const addEventListenerSpy = vi.spyOn(window, "addEventListener");
    renderHook(() => useViewportReflow());
    expect(addEventListenerSpy).toHaveBeenCalledWith("resize", expect.any(Function));
    addEventListenerSpy.mockRestore();
  });
});

// ─── resize scheduling ────────────────────────────────────────────────────────

describe("useViewportReflow — window resize", () => {
  it("reflows again when a resize event fires after the initial frame settles", () => {
    renderHook(() => useViewportReflow());
    act(() => runFrame(1)); // settle the initial reflow

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(rafSpy).toHaveBeenCalledTimes(2);

    act(() => runFrame(2));
    expect(h.reflowWindows).toHaveBeenCalledTimes(2);
  });

  it("cancels the still-pending initial frame when a resize fires before it settles", () => {
    renderHook(() => useViewportReflow());

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    // The first frame (id 1) is canceled in favor of a fresh one (id 2).
    expect(cafSpy).toHaveBeenCalledWith(1);
    expect(rafSpy).toHaveBeenCalledTimes(2);
  });

  it("only reflows once when a rapid resize burst is debounced through one frame", () => {
    renderHook(() => useViewportReflow());
    act(() => runFrame(1)); // settle initial

    act(() => {
      window.dispatchEvent(new Event("resize"));
      window.dispatchEvent(new Event("resize"));
      window.dispatchEvent(new Event("resize"));
    });
    // Each resize cancels the previous pending frame, so only the last survives.
    expect(cafSpy).toHaveBeenCalledWith(2);
    expect(cafSpy).toHaveBeenCalledWith(3);

    act(() => runFrame(4));
    expect(h.reflowWindows).toHaveBeenCalledTimes(2); // initial + one debounced reflow
  });
});

// ─── unmount cleanup ──────────────────────────────────────────────────────────

describe("useViewportReflow — unmount cleanup", () => {
  it("cancels a still-pending animation frame on unmount", () => {
    const { unmount } = renderHook(() => useViewportReflow());
    unmount();
    expect(cafSpy).toHaveBeenCalledWith(1);
  });

  it("removes the resize listener on unmount", () => {
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useViewportReflow());
    unmount();
    expect(removeEventListenerSpy).toHaveBeenCalledWith("resize", expect.any(Function));
    removeEventListenerSpy.mockRestore();
  });

  it("does not call cancelAnimationFrame on unmount once the frame already settled", () => {
    const { unmount } = renderHook(() => useViewportReflow());
    act(() => runFrame(1));
    cafSpy.mockClear();
    unmount();
    expect(cafSpy).not.toHaveBeenCalled();
  });

  it("does not reflow again after unmount even if a resize event still fires", () => {
    const { unmount } = renderHook(() => useViewportReflow());
    act(() => runFrame(1));
    unmount();
    h.reflowWindows.mockClear();

    window.dispatchEvent(new Event("resize"));

    expect(h.reflowWindows).not.toHaveBeenCalled();
  });
});
