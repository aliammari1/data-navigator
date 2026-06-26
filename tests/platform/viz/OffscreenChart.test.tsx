/**
 * Tests for OffscreenChart component and its internal hasFunctionValue helper.
 *
 * Strategy:
 * - Mock `chart-client` to control proxy availability and track calls.
 * - Mock `comlink` so transfer is a no-op.
 * - Keep the real OffscreenChart logic so it counts toward coverage.
 * - Use @testing-library/react render + act to exercise all code paths.
 */

import { act, render, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OffscreenChart } from "@/platform/viz/OffscreenChart";

// ─── Fake proxy ──────────────────────────────────────────────────────────────

const fakeProxy = {
  init: vi.fn(async () => undefined),
  setOption: vi.fn(async () => undefined),
  resize: vi.fn(async () => undefined),
  showTip: vi.fn(async () => undefined),
  hideTip: vi.fn(async () => undefined),
  dispose: vi.fn(async () => undefined),
};

// ─── Module mocks ────────────────────────────────────────────────────────────

let _proxyValue: typeof fakeProxy | null = fakeProxy;
let _nextId = 1;

vi.mock("@/platform/viz/chart-client", () => ({
  getChartProxy: vi.fn(() => _proxyValue),
  nextChartId: vi.fn(() => _nextId++),
}));

// Comlink: transfer returns the first arg, wrap is a no-op.
vi.mock("comlink", () => ({
  transfer: vi.fn((val: unknown) => val),
  wrap: vi.fn(() => fakeProxy),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resetId() {
  _nextId = 1;
}

/** A minimal EChartsOption with no function values. */
function simpleOption() {
  return { series: [{ type: "line", data: [1, 2, 3] }] };
}

/** An option with a function value (formatter) — cannot be structured-cloned. */
function optionWithFunction() {
  return {
    tooltip: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      formatter: (params: any) => String(params),
    },
    series: [{ type: "bar", data: [1] }],
  };
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  _proxyValue = fakeProxy;
  resetId();

  // jsdom does not implement transferControlToOffscreen; stub it.
  HTMLCanvasElement.prototype.transferControlToOffscreen = vi.fn(function (
    this: HTMLCanvasElement,
  ) {
    return { width: 0, height: 0 } as unknown as OffscreenCanvas;
  });

  HTMLCanvasElement.prototype.getBoundingClientRect = vi.fn(() => ({
    width: 400,
    height: 300,
    top: 0,
    left: 0,
    right: 400,
    bottom: 300,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  }));
});

// ─── Basic rendering ─────────────────────────────────────────────────────────

describe("basic rendering", () => {
  it("renders a canvas element when proxy is available and option is cloneable", () => {
    const { container } = render(
      <OffscreenChart option={simpleOption()} height={300} />,
    );
    expect(container.querySelector("canvas")).not.toBeNull();
  });

  it("renders the fallback when proxy is null and fallback is provided", () => {
    _proxyValue = null;
    const { container } = render(
      <OffscreenChart
        option={simpleOption()}
        height={300}
        fallback={<span>no-worker</span>}
      />,
    );
    expect(container.textContent).toContain("no-worker");
    expect(container.querySelector("canvas")).toBeNull();
  });

  it("renders canvas even when proxy is null and no fallback is provided", () => {
    _proxyValue = null;
    const { container } = render(
      <OffscreenChart option={simpleOption()} height={300} />,
    );
    // No fallback → useFallback = false → canvas branch taken.
    expect(container.querySelector("canvas")).not.toBeNull();
  });

  it("renders JSX element as fallback when proxy is unavailable", () => {
    _proxyValue = null;
    const { container } = render(
      <OffscreenChart
        option={simpleOption()}
        height={300}
        fallback={<div className="fb-root">Custom Fallback</div>}
      />,
    );
    expect(container.querySelector(".fb-root")).not.toBeNull();
  });

  it("renders string fallback when proxy is unavailable", () => {
    _proxyValue = null;
    const { container } = render(
      <OffscreenChart
        option={simpleOption()}
        height={300}
        fallback="text fallback"
      />,
    );
    expect(container.textContent).toBe("text fallback");
  });
});

// ─── Canvas style props ───────────────────────────────────────────────────────

describe("canvas style and class props", () => {
  it("applies className to the canvas element", () => {
    const { container } = render(
      <OffscreenChart option={simpleOption()} height={250} className="chart-cls" />,
    );
    expect(container.querySelector("canvas")?.className).toBe("chart-cls");
  });

  it("sets height as an inline style on the canvas", () => {
    const { container } = render(
      <OffscreenChart option={simpleOption()} height={480} />,
    );
    expect(container.querySelector("canvas")?.style.height).toBe("480px");
  });

  it("sets width:100% as an inline style on the canvas", () => {
    const { container } = render(
      <OffscreenChart option={simpleOption()} height={300} />,
    );
    expect(container.querySelector("canvas")?.style.width).toBe("100%");
  });

  it("renders canvas without className when className prop is omitted", () => {
    const { container } = render(
      <OffscreenChart option={simpleOption()} height={300} />,
    );
    const canvas = container.querySelector("canvas");
    expect(canvas).not.toBeNull();
    expect(canvas?.className).toBe("");
  });
});

// ─── hasFunctionValue detection ───────────────────────────────────────────────

describe("hasFunctionValue (function-in-option detection)", () => {
  it("detects a top-level function value and shows fallback", () => {
    const option = { formatter: () => "x" };
    const { container } = render(
      <OffscreenChart option={option} height={200} fallback={<span>fb</span>} />,
    );
    expect(container.textContent).toContain("fb");
  });

  it("detects a function nested inside an array", () => {
    const option = { series: [{ formatter: () => "y" }] };
    const { container } = render(
      <OffscreenChart option={option} height={200} fallback={<span>arr-fb</span>} />,
    );
    expect(container.textContent).toContain("arr-fb");
  });

  it("detects a function nested inside an object inside an object", () => {
    const option = { tooltip: { label: { formatter: () => "" } } };
    const { container } = render(
      <OffscreenChart option={option} height={200} fallback={<span>deep-fb</span>} />,
    );
    expect(container.textContent).toContain("deep-fb");
  });

  it("does not flag null values as function-like", () => {
    const option = { series: null, legend: undefined };
    const { container } = render(
      <OffscreenChart option={option} height={200} fallback={<span>fb</span>} />,
    );
    // null/undefined → cloneable → canvas.
    expect(container.querySelector("canvas")).not.toBeNull();
  });

  it("does not flag a plain array of primitives as non-cloneable", () => {
    const option = { data: [1, 2, "hello", true, null] };
    const { container } = render(
      <OffscreenChart option={option} height={200} fallback={<span>fb</span>} />,
    );
    expect(container.querySelector("canvas")).not.toBeNull();
  });

  it("stops at depth 8 — a function buried deeper than 8 levels is not detected", () => {
    // Build a 10-level deep object with a function at the bottom.
    let inner: Record<string, unknown> = { fn: () => "deep" };
    for (let i = 0; i < 9; i++) {
      inner = { child: inner };
    }
    const { container } = render(
      <OffscreenChart option={inner} height={200} fallback={<span>deep-fb</span>} />,
    );
    // Function is beyond depth 8 → not detected → cloneable → canvas.
    expect(container.querySelector("canvas")).not.toBeNull();
  });

  it("option with function but no fallback renders canvas (useFallback = false)", () => {
    const option = optionWithFunction();
    const { container } = render(
      <OffscreenChart option={option} height={200} />,
    );
    // fallback=undefined → !!fallback=false → useFallback=false → canvas.
    expect(container.querySelector("canvas")).not.toBeNull();
  });
});

// ─── Mount effect — proxy.init ────────────────────────────────────────────────

describe("mount effect — proxy.init", () => {
  it("calls proxy.init once on mount", async () => {
    render(<OffscreenChart option={simpleOption()} height={300} />);
    await waitFor(() => expect(fakeProxy.init).toHaveBeenCalledTimes(1));
  });

  it("passes the chart id as a number to proxy.init", async () => {
    render(<OffscreenChart option={simpleOption()} height={300} />);
    await waitFor(() => expect(fakeProxy.init).toHaveBeenCalled());
    const [id] = fakeProxy.init.mock.calls[0];
    expect(typeof id).toBe("number");
  });

  it("passes devicePixelRatio (>=1) to proxy.init", async () => {
    render(<OffscreenChart option={simpleOption()} height={300} />);
    await waitFor(() => expect(fakeProxy.init).toHaveBeenCalled());
    const [, , dpr] = fakeProxy.init.mock.calls[0];
    expect(dpr).toBeGreaterThanOrEqual(1);
  });

  it("passes height prop as fallback height when BoundingClientRect returns 0", async () => {
    HTMLCanvasElement.prototype.getBoundingClientRect = vi.fn(() => ({
      width: 0,
      height: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }));

    render(<OffscreenChart option={simpleOption()} height={555} />);
    await waitFor(() => expect(fakeProxy.init).toHaveBeenCalled());
    const [, , , , height] = fakeProxy.init.mock.calls[0];
    expect(height).toBe(555);
  });

  it("passes the theme string to proxy.init when theme prop is provided", async () => {
    render(<OffscreenChart option={simpleOption()} height={300} theme="dark" />);
    await waitFor(() => expect(fakeProxy.init).toHaveBeenCalled());
    const [, , , , , theme] = fakeProxy.init.mock.calls[0];
    expect(theme).toBe("dark");
  });

  it("passes undefined theme when theme prop is omitted", async () => {
    render(<OffscreenChart option={simpleOption()} height={300} />);
    await waitFor(() => expect(fakeProxy.init).toHaveBeenCalled());
    const [, , , , , theme] = fakeProxy.init.mock.calls[0];
    expect(theme).toBeUndefined();
  });

  it("does not call proxy.init when transferControlToOffscreen throws", async () => {
    HTMLCanvasElement.prototype.transferControlToOffscreen = vi.fn(() => {
      throw new Error("already transferred");
    });

    render(<OffscreenChart option={simpleOption()} height={300} />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(fakeProxy.init).not.toHaveBeenCalled();
  });

  it("does not call proxy.init when getChartProxy returns null", async () => {
    _proxyValue = null;

    render(<OffscreenChart option={simpleOption()} height={300} />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(fakeProxy.init).not.toHaveBeenCalled();
  });
});

// ─── setOption effect ─────────────────────────────────────────────────────────

describe("setOption effect on option change", () => {
  it("calls proxy.setOption when option prop changes after successful transfer", async () => {
    const { rerender } = render(
      <OffscreenChart option={simpleOption()} height={300} />,
    );

    await waitFor(() => expect(fakeProxy.init).toHaveBeenCalledTimes(1));

    // Clear calls from the initial render effect.
    fakeProxy.setOption.mockClear();

    const newOption = { series: [{ type: "bar", data: [4, 5, 6] }] };
    rerender(<OffscreenChart option={newOption} height={300} />);

    await waitFor(() => expect(fakeProxy.setOption).toHaveBeenCalled());

    const [id, opt] = fakeProxy.setOption.mock.calls[0];
    expect(typeof id).toBe("number");
    expect(opt).toEqual(newOption);
  });

  it("does not call proxy.setOption when transfer never happened (init threw)", async () => {
    HTMLCanvasElement.prototype.transferControlToOffscreen = vi.fn(() => {
      throw new Error("unsupported");
    });

    const { rerender } = render(
      <OffscreenChart option={simpleOption()} height={300} />,
    );

    rerender(<OffscreenChart option={{ series: [{ type: "bar" }] }} height={300} />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(fakeProxy.setOption).not.toHaveBeenCalled();
  });
});

// ─── Pointer events ───────────────────────────────────────────────────────────

describe("pointer event forwarding", () => {
  it("forwards pointermove to proxy.showTip", async () => {
    const { container } = render(
      <OffscreenChart option={simpleOption()} height={300} />,
    );

    await waitFor(() => expect(fakeProxy.init).toHaveBeenCalled());

    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    act(() => {
      canvas.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          offsetX: 50,
          offsetY: 75,
        } as PointerEventInit),
      );
    });

    await waitFor(() => expect(fakeProxy.showTip).toHaveBeenCalled());
  });

  it("forwards pointerleave to proxy.hideTip", async () => {
    const { container } = render(
      <OffscreenChart option={simpleOption()} height={300} />,
    );

    await waitFor(() => expect(fakeProxy.init).toHaveBeenCalled());

    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    act(() => {
      canvas.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }));
    });

    await waitFor(() => expect(fakeProxy.hideTip).toHaveBeenCalled());
  });
});

// ─── ResizeObserver integration ───────────────────────────────────────────────

describe("ResizeObserver integration", () => {
  it("calls proxy.resize when the ResizeObserver fires an entry", async () => {
    let capturedCb: ResizeObserverCallback | null = null;
    const observeMock = vi.fn();
    const disconnectMock = vi.fn();

    class TestResizeObserver {
      constructor(cb: ResizeObserverCallback) {
        capturedCb = cb;
      }
      observe = observeMock;
      disconnect = disconnectMock;
      unobserve = vi.fn();
    }

    // setup.ts defines ResizeObserver with writable:true, so direct assignment works.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).ResizeObserver = TestResizeObserver;

    render(<OffscreenChart option={simpleOption()} height={300} />);

    await waitFor(() => expect(fakeProxy.init).toHaveBeenCalled());

    act(() => {
      capturedCb?.(
        [
          {
            contentRect: { width: 800, height: 600 } as DOMRectReadOnly,
          } as ResizeObserverEntry,
        ],
        null as unknown as ResizeObserver,
      );
    });

    await waitFor(() =>
      expect(fakeProxy.resize).toHaveBeenCalledWith(
        expect.any(Number),
        800,
        600,
      ),
    );
  });

  it("calls ro.observe on the canvas element", async () => {
    const observeMock = vi.fn();

    class TrackingResizeObserver {
      constructor(_cb: ResizeObserverCallback) {}
      observe = observeMock;
      disconnect = vi.fn();
      unobserve = vi.fn();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).ResizeObserver = TrackingResizeObserver;

    const { container } = render(
      <OffscreenChart option={simpleOption()} height={300} />,
    );

    await waitFor(() => expect(fakeProxy.init).toHaveBeenCalled());
    const canvas = container.querySelector("canvas");
    expect(observeMock).toHaveBeenCalledWith(canvas);
  });
});

// ─── Unmount / disposal ───────────────────────────────────────────────────────

describe("unmount disposal (deferred)", () => {
  it("schedules proxy.dispose via setTimeout and runs it after the timer fires", async () => {
    // Render + let effects settle with real timers, then verify dispose is called
    // after unmount (the component defers via setTimeout(0)).
    const { unmount } = render(
      <OffscreenChart option={simpleOption()} height={300} />,
    );

    await waitFor(() => expect(fakeProxy.init).toHaveBeenCalled());

    unmount();

    // dispose is scheduled in a setTimeout(0); wait for it via real-timer flush.
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    });

    expect(fakeProxy.dispose).toHaveBeenCalled();
  });

  it("passes the correct chart id to proxy.dispose", async () => {
    const { unmount } = render(
      <OffscreenChart option={simpleOption()} height={300} />,
    );

    await waitFor(() => expect(fakeProxy.init).toHaveBeenCalled());
    const [initId] = fakeProxy.init.mock.calls[0];

    unmount();

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    });

    const [disposeId] = fakeProxy.dispose.mock.calls[0];
    expect(disposeId).toBe(initId);
  });
});

// ─── StrictMode double-mount cancellation ────────────────────────────────────

describe("StrictMode dispose-timer cancellation (lines 75-76)", () => {
  it("cancels the pending disposal timer when the effect re-runs before the timer fires", async () => {
    // React 18 StrictMode mounts effects twice: mount → cleanup → mount.
    // The cleanup schedules a dispose timer; the second mount must cancel it
    // so dispose is never called on a live chart.
    const { unmount } = render(
      <React.StrictMode>
        <OffscreenChart option={simpleOption()} height={300} />
      </React.StrictMode>,
    );

    // Let React StrictMode run its double-invoke cycle.
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    // The timer from the first cleanup should have been cancelled by the
    // second mount — dispose must NOT have been called yet.
    expect(fakeProxy.dispose).not.toHaveBeenCalled();

    // Unmounting for real lets the final cleanup run.
    unmount();

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    });

    // After the real unmount the dispose timer fires exactly once.
    expect(fakeProxy.dispose).toHaveBeenCalledTimes(1);
  });
});

// ─── devicePixelRatio fallback branch ────────────────────────────────────────

describe("devicePixelRatio fallback to 1", () => {
  it("uses dpr=1 when window.devicePixelRatio is 0 (falsy)", async () => {
    const originalDpr = window.devicePixelRatio;
    Object.defineProperty(window, "devicePixelRatio", {
      writable: true,
      value: 0,
    });

    render(<OffscreenChart option={simpleOption()} height={300} />);

    await waitFor(() => expect(fakeProxy.init).toHaveBeenCalled());

    const [, , dpr] = fakeProxy.init.mock.calls[0];
    expect(dpr).toBe(1);

    Object.defineProperty(window, "devicePixelRatio", {
      writable: true,
      value: originalDpr,
    });
  });
});

// ─── ResizeObserver with undefined/null entry ─────────────────────────────────

describe("ResizeObserver null entry guard", () => {
  it("does not call proxy.resize when the ResizeObserver entry is undefined", async () => {
    let capturedCb: ResizeObserverCallback | null = null;

    class NullEntryResizeObserver {
      constructor(cb: ResizeObserverCallback) {
        capturedCb = cb;
      }
      observe = vi.fn();
      disconnect = vi.fn();
      unobserve = vi.fn();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).ResizeObserver = NullEntryResizeObserver;

    render(<OffscreenChart option={simpleOption()} height={300} />);

    await waitFor(() => expect(fakeProxy.init).toHaveBeenCalled());

    act(() => {
      // Fire the callback with an empty entries array so `entries[0]` is undefined.
      capturedCb?.([], null as unknown as ResizeObserver);
    });

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    });

    // proxy.resize must NOT be called when entry is undefined/falsy.
    expect(fakeProxy.resize).not.toHaveBeenCalled();
  });
});

// ─── setOption skipped when not yet transferred ───────────────────────────────

describe("setOption guard when apiRef or transferredRef is falsy", () => {
  it("does not call setOption when proxy is null (apiRef never set)", async () => {
    _proxyValue = null;

    const { rerender } = render(
      <OffscreenChart option={simpleOption()} height={300} />,
    );

    // Trigger the option-change effect with a new option.
    rerender(<OffscreenChart option={{ series: [{ type: "pie" }] }} height={300} />);

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    });

    expect(fakeProxy.setOption).not.toHaveBeenCalled();
  });
});
