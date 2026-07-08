/**
 * Tests for src/platform/perf/web-vitals.ts
 *
 * Strategy:
 *  - Mock "web-vitals" to capture callbacks passed to onCLS/onLCP/onINP/onFCP/onTTFB.
 *  - Mock "@/platform/storage" to capture/control addPerfMetric and prunePerfMetrics.
 *  - Reset the module's `started` guard between tests via vi.resetModules().
 *  - Exercise all branches: window undefined, started guard, entries array/non-array,
 *    addPerfMetric rejection, prunePerfMetrics rejection, window.location.pathname truthy/falsy.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks (declared before any dynamic import of the target module)
// ---------------------------------------------------------------------------

const mockOnCLS = vi.fn();
const mockOnLCP = vi.fn();
const mockOnINP = vi.fn();
const mockOnFCP = vi.fn();
const mockOnTTFB = vi.fn();

vi.mock("web-vitals", () => ({
  onCLS: mockOnCLS,
  onLCP: mockOnLCP,
  onINP: mockOnINP,
  onFCP: mockOnFCP,
  onTTFB: mockOnTTFB,
}));

const mockAddPerfMetric = vi.fn();
const mockPrunePerfMetrics = vi.fn();

vi.mock("@/platform/storage", () => ({
  addPerfMetric: mockAddPerfMetric,
  prunePerfMetrics: mockPrunePerfMetrics,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Flush all queued microtasks + macrotasks (fire-and-forget promises). */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Build a minimal Metric object. */
function makeMetric(
  overrides: Partial<{
    name: string;
    value: number;
    rating: "good" | "needs-improvement" | "poor";
    delta: number;
    id: string;
    navigationType: string;
    entries: unknown[];
  }> = {},
) {
  return {
    name: overrides.name ?? "CLS",
    value: overrides.value ?? 0.05,
    rating: overrides.rating ?? "good",
    delta: overrides.delta ?? 0.05,
    id: overrides.id ?? "v3-abc",
    navigationType: overrides.navigationType ?? "navigate",
    entries: overrides.entries ?? [{}],
  } as unknown as import("web-vitals").Metric;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("initWebVitals", () => {
  beforeEach(() => {
    // Reset all mock call counts.
    mockOnCLS.mockReset();
    mockOnLCP.mockReset();
    mockOnINP.mockReset();
    mockOnFCP.mockReset();
    mockOnTTFB.mockReset();
    mockAddPerfMetric.mockReset();
    mockPrunePerfMetrics.mockReset();

    // Default: addPerfMetric resolves; prunePerfMetrics resolves.
    mockAddPerfMetric.mockResolvedValue(undefined);
    mockPrunePerfMetrics.mockResolvedValue(undefined);

    // Reset the module so the `started` flag is cleared between tests.
    vi.resetModules();
  });

  // -------------------------------------------------------------------------
  // initWebVitals — happy path
  // -------------------------------------------------------------------------

  it("registers all five web-vitals callbacks on first call", async () => {
    const { initWebVitals } = await import("@/platform/perf/web-vitals");
    initWebVitals();

    expect(mockOnCLS).toHaveBeenCalledOnce();
    expect(mockOnLCP).toHaveBeenCalledOnce();
    expect(mockOnINP).toHaveBeenCalledOnce();
    expect(mockOnFCP).toHaveBeenCalledOnce();
    expect(mockOnTTFB).toHaveBeenCalledOnce();
  });

  it("calls prunePerfMetrics once on first call", async () => {
    const { initWebVitals } = await import("@/platform/perf/web-vitals");
    initWebVitals();
    await flush();

    expect(mockPrunePerfMetrics).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // idempotent / started guard
  // -------------------------------------------------------------------------

  it("is idempotent: a second call is a no-op (started guard)", async () => {
    const { initWebVitals } = await import("@/platform/perf/web-vitals");
    initWebVitals();
    initWebVitals(); // second call must be a no-op

    expect(mockOnCLS).toHaveBeenCalledOnce();
    expect(mockPrunePerfMetrics).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // SSR guard (window === undefined)
  // -------------------------------------------------------------------------

  it("is a no-op when window is undefined (SSR guard)", async () => {
    // Temporarily hide window from the module under test.
    const originalWindow = globalThis.window;
    // @ts-expect-error — intentionally set to undefined to simulate SSR
    globalThis.window = undefined;

    try {
      const { initWebVitals } = await import("@/platform/perf/web-vitals");
      initWebVitals();

      expect(mockOnCLS).not.toHaveBeenCalled();
      expect(mockPrunePerfMetrics).not.toHaveBeenCalled();
    } finally {
      globalThis.window = originalWindow;
    }
  });

  // -------------------------------------------------------------------------
  // persist callback — entries is an array
  // -------------------------------------------------------------------------

  it("persist: records entryCount from an array of entries", async () => {
    const { initWebVitals } = await import("@/platform/perf/web-vitals");
    initWebVitals();

    // Grab the callback passed to onCLS.
    const persistFn = mockOnCLS.mock.calls[0][0];
    const metric = makeMetric({ name: "CLS", entries: [{}, {}, {}] });
    persistFn(metric);
    await flush();

    expect(mockAddPerfMetric).toHaveBeenCalledOnce();
    const arg = mockAddPerfMetric.mock.calls[0][0];
    expect(arg.detail.entryCount).toBe(3);
    expect(arg.metric).toBe("CLS");
    expect(arg.value).toBe(metric.value);
    expect(arg.rating).toBe("good");
    expect(arg.delta).toBe(metric.delta);
    expect(arg.navigationId).toBe("navigate");
  });

  it("persist: records entryCount 0 when entries is not an array", async () => {
    const { initWebVitals } = await import("@/platform/perf/web-vitals");
    initWebVitals();

    const persistFn = mockOnLCP.mock.calls[0][0];
    // Construct a metric where entries is a non-array value to exercise the false branch.
    const metric = {
      name: "LCP",
      value: 1200,
      rating: "good",
      delta: 1200,
      id: "v3-lcp",
      navigationType: "navigate",
      entries: "not-an-array", // non-array: Array.isArray → false → entryCount = 0
    } as unknown as import("web-vitals").Metric;
    persistFn(metric);
    await flush();

    expect(mockAddPerfMetric).toHaveBeenCalledOnce();
    const arg = mockAddPerfMetric.mock.calls[0][0];
    expect(arg.detail.entryCount).toBe(0);
  });

  it("persist: passes the current route from window.location.pathname", async () => {
    // jsdom sets window.location.pathname = "/" by default.
    const { initWebVitals } = await import("@/platform/perf/web-vitals");
    initWebVitals();

    const persistFn = mockOnFCP.mock.calls[0][0];
    persistFn(makeMetric({ name: "FCP" }));
    await flush();

    const arg = mockAddPerfMetric.mock.calls[0][0];
    expect(arg.route).toBe("/");
  });

  // -------------------------------------------------------------------------
  // persist — addPerfMetric rejects (error must be swallowed silently)
  // -------------------------------------------------------------------------

  it("persist: swallows addPerfMetric rejection without throwing", async () => {
    mockAddPerfMetric.mockRejectedValue(new Error("storage full"));

    const { initWebVitals } = await import("@/platform/perf/web-vitals");
    initWebVitals();

    const persistFn = mockOnINP.mock.calls[0][0];

    // Must not throw into the test.
    await expect(
      (async () => {
        persistFn(makeMetric({ name: "INP" }));
        await flush();
      })(),
    ).resolves.toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // prunePerfMetrics rejection — must be swallowed silently
  // -------------------------------------------------------------------------

  it("swallows prunePerfMetrics rejection without throwing", async () => {
    mockPrunePerfMetrics.mockRejectedValue(new Error("pruning failed"));

    const { initWebVitals } = await import("@/platform/perf/web-vitals");

    await expect(
      (async () => {
        initWebVitals();
        await flush();
      })(),
    ).resolves.toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // persist — detail structure (id, navigationType)
  // -------------------------------------------------------------------------

  it("persist: passes metric id and navigationType in detail", async () => {
    const { initWebVitals } = await import("@/platform/perf/web-vitals");
    initWebVitals();

    const persistFn = mockOnTTFB.mock.calls[0][0];
    const metric = makeMetric({
      name: "TTFB",
      id: "v3-xyz",
      navigationType: "reload",
    });
    persistFn(metric);
    await flush();

    const arg = mockAddPerfMetric.mock.calls[0][0];
    expect(arg.detail.id).toBe("v3-xyz");
    expect(arg.detail.navigationType).toBe("reload");
  });

  // -------------------------------------------------------------------------
  // currentRoute — window.location.pathname is empty string
  // -------------------------------------------------------------------------

  it("currentRoute returns '/' when window.location.pathname is empty string", async () => {
    // Patch location to have an empty pathname.
    const originalPathname = window.location.pathname;

    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: { ...window.location, pathname: "" },
    });

    try {
      const { initWebVitals } = await import("@/platform/perf/web-vitals");
      initWebVitals();

      const persistFn = mockOnCLS.mock.calls[0][0];
      persistFn(makeMetric({ name: "CLS" }));
      await flush();

      const arg = mockAddPerfMetric.mock.calls[0][0];
      // pathname "" is falsy → falls back to "/"
      expect(arg.route).toBe("/");
    } finally {
      Object.defineProperty(window, "location", {
        configurable: true,
        writable: true,
        value: { ...window.location, pathname: originalPathname },
      });
    }
  });

  // -------------------------------------------------------------------------
  // currentRoute — window.location.pathname throws
  // -------------------------------------------------------------------------

  it("currentRoute returns '' when window.location throws", async () => {
    Object.defineProperty(window, "location", {
      configurable: true,
      get() {
        throw new Error("access denied");
      },
    });

    try {
      const { initWebVitals } = await import("@/platform/perf/web-vitals");
      initWebVitals();

      const persistFn = mockOnCLS.mock.calls[0][0];
      persistFn(makeMetric({ name: "CLS" }));
      await flush();

      const arg = mockAddPerfMetric.mock.calls[0][0];
      expect(arg.route).toBe("");
    } finally {
      // Restore a normal location.
      Object.defineProperty(window, "location", {
        configurable: true,
        writable: true,
        value: { pathname: "/" },
      });
    }
  });
});
