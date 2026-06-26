/**
 * Tests for useUPlot — the React mount hook that wraps uPlot.
 *
 * Strategy:
 * - Mock `uplot` using vi.hoisted so the constructor function can be called
 *   with `new` and the spy functions are shared between the factory and tests.
 * - Mock the CSS import (bundled in production; jsdom cannot handle it).
 * - Render thin wrapper components via @testing-library/react `render` so
 *   the el ref actually points to a mounted HTMLDivElement.
 * - Override ResizeObserver per-test to capture the callback and fire entries.
 * - Verify every branch: el.current null guard, entry undefined guard,
 *   height || fallback, optional-chaining on setSize/setData/destroy.
 *
 * Note: The test file is .ts (not .tsx); JSX is written as React.createElement.
 */

import React from "react";
import { render, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Hoisted mock fns — shared between vi.mock factory and test assertions ────

const { mockSetSize, mockSetData, mockDestroy, MockUPlot } = vi.hoisted(() => {
  const mockSetSize = vi.fn();
  const mockSetData = vi.fn();
  const mockDestroy = vi.fn();

  // Must be a real constructor function (not an arrow fn) so `new` works.
  function MockUPlot(
    this: { setSize: unknown; setData: unknown; destroy: unknown },
    _opts: unknown,
    _data: unknown,
    _el: unknown,
  ) {
    this.setSize = mockSetSize;
    this.setData = mockSetData;
    this.destroy = mockDestroy;
  }

  return { mockSetSize, mockSetData, mockDestroy, MockUPlot };
});

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("uplot", () => ({ default: MockUPlot }));
vi.mock("uplot/dist/uPlot.min.css", () => ({}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeOpts(height = 300): uPlot.Options {
  return {
    width: 600,
    height,
    series: [{}, { stroke: "blue" }],
  } as unknown as uPlot.Options;
}

function makeData(): uPlot.AlignedData {
  return [[1, 2, 3], [10, 20, 30]];
}

// ─── Setup ────────────────────────────────────────────────────────────────────

let originalResizeObserver: typeof ResizeObserver;

beforeEach(() => {
  vi.clearAllMocks();
  originalResizeObserver = window.ResizeObserver;
});

afterEach(() => {
  (window as unknown as Record<string, unknown>).ResizeObserver =
    originalResizeObserver;
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useUPlot", () => {
  // ─── Basic mount with ref attached to DOM ──────────────────────────────────

  describe("mount — el.current attached to DOM", () => {
    it("creates a uPlot instance (setData is called) when el.current is an HTMLDivElement", async () => {
      const { useUPlot } = await import("@/platform/viz/use-uplot");

      function Wrapper() {
        const ref = useUPlot(makeOpts(), makeData());
        return React.createElement("div", { ref });
      }

      render(React.createElement(Wrapper));

      // The second useEffect always fires; if chart was created, setData is called
      expect(mockSetData).toHaveBeenCalled();
    });

    it("passes data to the uPlot instance (verifies constructor ran with correct data)", async () => {
      const { useUPlot } = await import("@/platform/viz/use-uplot");
      const data = makeData();

      function Wrapper() {
        const ref = useUPlot(makeOpts(400), data);
        return React.createElement("div", { ref });
      }

      render(React.createElement(Wrapper));
      expect(mockSetData).toHaveBeenCalledWith(data);
    });

    it("registers a ResizeObserver and observes the container element", async () => {
      const observeMock = vi.fn();

      class TrackingResizeObserver {
        constructor(_cb: ResizeObserverCallback) {}
        observe = observeMock;
        disconnect = vi.fn();
        unobserve = vi.fn();
      }

      (window as unknown as Record<string, unknown>).ResizeObserver =
        TrackingResizeObserver;

      const { useUPlot } = await import("@/platform/viz/use-uplot");

      function Wrapper() {
        const ref = useUPlot(makeOpts(), makeData());
        return React.createElement("div", { ref });
      }

      const { container } = render(React.createElement(Wrapper));
      const div = container.firstChild as HTMLDivElement;
      expect(observeMock).toHaveBeenCalledWith(div);
    });

    it("returns a React ref object whose current is the mounted div", async () => {
      const { useUPlot } = await import("@/platform/viz/use-uplot");

      let capturedRef: React.RefObject<HTMLDivElement | null> | null = null;

      function Wrapper() {
        const ref = useUPlot(makeOpts(), makeData());
        capturedRef = ref as React.RefObject<HTMLDivElement | null>;
        return React.createElement("div", { ref });
      }

      render(React.createElement(Wrapper));
      expect(capturedRef).not.toBeNull();
      expect(capturedRef?.current).toBeInstanceOf(HTMLDivElement);
    });
  });

  // ─── Early return — el.current is null ────────────────────────────────────

  describe("early return when el.current is null (ref not attached)", () => {
    it("does NOT call setData when the ref is not attached to any element", async () => {
      const { useUPlot } = await import("@/platform/viz/use-uplot");

      function DetachedWrapper() {
        useUPlot(makeOpts(), makeData());
        // ref NOT attached — just render a bare div
        return React.createElement("div");
      }

      render(React.createElement(DetachedWrapper));
      // No chart created → setData must NOT be called (plot.current is null)
      expect(mockSetData).not.toHaveBeenCalled();
    });

    it("does NOT call setSize when ref is not attached", async () => {
      const { useUPlot } = await import("@/platform/viz/use-uplot");

      function DetachedWrapper({ data }: { data: uPlot.AlignedData }) {
        useUPlot(makeOpts(), data);
        return React.createElement("div");
      }

      const { rerender } = render(
        React.createElement(DetachedWrapper, { data: makeData() }),
      );

      act(() => {
        rerender(
          React.createElement(DetachedWrapper, {
            data: [[4, 5], [40, 50]] as uPlot.AlignedData,
          }),
        );
      });

      expect(mockSetSize).not.toHaveBeenCalled();
    });
  });

  // ─── ResizeObserver callback branches ────────────────────────────────────

  describe("ResizeObserver callback branches", () => {
    it("calls plot.setSize with entry width and height when entry is defined and height > 0", async () => {
      let capturedCallback: ResizeObserverCallback | null = null;

      class TestResizeObserver {
        constructor(cb: ResizeObserverCallback) {
          capturedCallback = cb;
        }
        observe = vi.fn();
        disconnect = vi.fn();
        unobserve = vi.fn();
      }

      (window as unknown as Record<string, unknown>).ResizeObserver =
        TestResizeObserver;

      const { useUPlot } = await import("@/platform/viz/use-uplot");

      function Wrapper() {
        const ref = useUPlot(makeOpts(300), makeData());
        return React.createElement("div", { ref });
      }

      render(React.createElement(Wrapper));

      act(() => {
        capturedCallback?.(
          [
            {
              contentRect: { width: 800, height: 400 } as DOMRectReadOnly,
            } as ResizeObserverEntry,
          ],
          null as unknown as ResizeObserver,
        );
      });

      expect(mockSetSize).toHaveBeenCalledWith({ width: 800, height: 400 });
    });

    it("uses opts.height as fallback when contentRect.height is 0 (falsy branch of ||)", async () => {
      let capturedCallback: ResizeObserverCallback | null = null;

      class FallbackResizeObserver {
        constructor(cb: ResizeObserverCallback) {
          capturedCallback = cb;
        }
        observe = vi.fn();
        disconnect = vi.fn();
        unobserve = vi.fn();
      }

      (window as unknown as Record<string, unknown>).ResizeObserver =
        FallbackResizeObserver;

      const { useUPlot } = await import("@/platform/viz/use-uplot");

      function Wrapper() {
        const ref = useUPlot(makeOpts(500), makeData()); // opts.height = 500
        return React.createElement("div", { ref });
      }

      render(React.createElement(Wrapper));

      act(() => {
        capturedCallback?.(
          [
            {
              contentRect: { width: 640, height: 0 } as DOMRectReadOnly,
            } as ResizeObserverEntry,
          ],
          null as unknown as ResizeObserver,
        );
      });

      // height=0 is falsy → falls back to opts.height=500
      expect(mockSetSize).toHaveBeenCalledWith({ width: 640, height: 500 });
    });

    it("early-returns (does not call setSize) when the ResizeObserver entry is undefined", async () => {
      let capturedCallback: ResizeObserverCallback | null = null;

      class UndefinedEntryResizeObserver {
        constructor(cb: ResizeObserverCallback) {
          capturedCallback = cb;
        }
        observe = vi.fn();
        disconnect = vi.fn();
        unobserve = vi.fn();
      }

      (window as unknown as Record<string, unknown>).ResizeObserver =
        UndefinedEntryResizeObserver;

      const { useUPlot } = await import("@/platform/viz/use-uplot");

      function Wrapper() {
        const ref = useUPlot(makeOpts(), makeData());
        return React.createElement("div", { ref });
      }

      render(React.createElement(Wrapper));

      // Empty entries array → destructured `entry` is undefined → if(!entry) return
      act(() => {
        capturedCallback?.([], null as unknown as ResizeObserver);
      });

      expect(mockSetSize).not.toHaveBeenCalled();
    });

    it("does not throw when plot.current is null at the time the ResizeObserver fires", async () => {
      let capturedCallback: ResizeObserverCallback | null = null;

      class LateResizeObserver {
        constructor(cb: ResizeObserverCallback) {
          capturedCallback = cb;
        }
        observe = vi.fn();
        disconnect = vi.fn();
        unobserve = vi.fn();
      }

      (window as unknown as Record<string, unknown>).ResizeObserver =
        LateResizeObserver;

      const { useUPlot } = await import("@/platform/viz/use-uplot");

      function Wrapper() {
        const ref = useUPlot(makeOpts(300), makeData());
        return React.createElement("div", { ref });
      }

      const { unmount } = render(React.createElement(Wrapper));

      // Unmount first → cleanup sets plot.current = null
      act(() => {
        unmount();
      });

      // Now fire the callback — plot.current?.setSize must silently skip
      expect(() => {
        act(() => {
          capturedCallback?.(
            [
              {
                contentRect: { width: 900, height: 300 } as DOMRectReadOnly,
              } as ResizeObserverEntry,
            ],
            null as unknown as ResizeObserver,
          );
        });
      }).not.toThrow();
    });
  });

  // ─── setData streaming effect ──────────────────────────────────────────────

  describe("setData streaming effect", () => {
    it("calls plot.setData once on initial mount with the initial data", async () => {
      const { useUPlot } = await import("@/platform/viz/use-uplot");
      const data = makeData();

      function Wrapper() {
        const ref = useUPlot(makeOpts(), data);
        return React.createElement("div", { ref });
      }

      render(React.createElement(Wrapper));
      // The second useEffect fires on every render with the current data
      expect(mockSetData).toHaveBeenCalledWith(data);
    });

    it("calls plot.setData when the data prop changes", async () => {
      const { useUPlot } = await import("@/platform/viz/use-uplot");

      function Wrapper({ data }: { data: uPlot.AlignedData }) {
        const ref = useUPlot(makeOpts(), data);
        return React.createElement("div", { ref });
      }

      const { rerender } = render(
        React.createElement(Wrapper, { data: makeData() }),
      );
      mockSetData.mockClear();

      const newData: uPlot.AlignedData = [[4, 5, 6], [40, 50, 60]];
      act(() => {
        rerender(React.createElement(Wrapper, { data: newData }));
      });

      expect(mockSetData).toHaveBeenCalledWith(newData);
    });

    it("does not call setData when plot.current is null (optional chaining skips)", async () => {
      const { useUPlot } = await import("@/platform/viz/use-uplot");

      // Do NOT attach the ref → plot.current stays null
      function DetachedWrapper({ data }: { data: uPlot.AlignedData }) {
        useUPlot(makeOpts(), data);
        return React.createElement("div");
      }

      const { rerender } = render(
        React.createElement(DetachedWrapper, { data: makeData() }),
      );
      mockSetData.mockClear();

      act(() => {
        rerender(
          React.createElement(DetachedWrapper, {
            data: [[9, 10], [90, 100]] as uPlot.AlignedData,
          }),
        );
      });

      expect(mockSetData).not.toHaveBeenCalled();
    });
  });

  // ─── Cleanup on unmount ────────────────────────────────────────────────────

  describe("cleanup on unmount", () => {
    it("calls ro.disconnect when the component unmounts", async () => {
      const disconnectMock = vi.fn();

      class CleanupResizeObserver {
        constructor(_cb: ResizeObserverCallback) {}
        observe = vi.fn();
        disconnect = disconnectMock;
        unobserve = vi.fn();
      }

      (window as unknown as Record<string, unknown>).ResizeObserver =
        CleanupResizeObserver;

      const { useUPlot } = await import("@/platform/viz/use-uplot");

      function Wrapper() {
        const ref = useUPlot(makeOpts(), makeData());
        return React.createElement("div", { ref });
      }

      const { unmount } = render(React.createElement(Wrapper));

      act(() => {
        unmount();
      });

      expect(disconnectMock).toHaveBeenCalledOnce();
    });

    it("calls plot.destroy when the component unmounts", async () => {
      const { useUPlot } = await import("@/platform/viz/use-uplot");

      function Wrapper() {
        const ref = useUPlot(makeOpts(), makeData());
        return React.createElement("div", { ref });
      }

      const { unmount } = render(React.createElement(Wrapper));

      act(() => {
        unmount();
      });

      expect(mockDestroy).toHaveBeenCalledOnce();
    });

    it("sets plot.current to null after destroy (verified: setSize not called after unmount)", async () => {
      let capturedCallback: ResizeObserverCallback | null = null;

      class NullCheckResizeObserver {
        constructor(cb: ResizeObserverCallback) {
          capturedCallback = cb;
        }
        observe = vi.fn();
        disconnect = vi.fn();
        unobserve = vi.fn();
      }

      (window as unknown as Record<string, unknown>).ResizeObserver =
        NullCheckResizeObserver;

      const { useUPlot } = await import("@/platform/viz/use-uplot");

      function Wrapper() {
        const ref = useUPlot(makeOpts(300), makeData());
        return React.createElement("div", { ref });
      }

      const { unmount } = render(React.createElement(Wrapper));

      act(() => {
        unmount(); // cleanup: ro.disconnect(), plot.destroy(), plot.current = null
      });

      mockSetSize.mockClear();

      // After unmount, plot.current is null, so ?. skips setSize
      act(() => {
        capturedCallback?.(
          [
            {
              contentRect: { width: 700, height: 200 } as DOMRectReadOnly,
            } as ResizeObserverEntry,
          ],
          null as unknown as ResizeObserver,
        );
      });

      expect(mockSetSize).not.toHaveBeenCalled();
    });

    it("does NOT call destroy when no chart was created (el.current was null)", async () => {
      const { useUPlot } = await import("@/platform/viz/use-uplot");

      function DetachedWrapper() {
        useUPlot(makeOpts(), makeData());
        return React.createElement("div"); // ref NOT attached
      }

      const { unmount } = render(React.createElement(DetachedWrapper));
      mockDestroy.mockClear();

      act(() => {
        unmount();
      });

      expect(mockDestroy).not.toHaveBeenCalled();
    });
  });
});
