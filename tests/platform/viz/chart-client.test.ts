/**
 * Unit tests for src/platform/viz/chart-client.ts
 *
 * Strategy: the module holds module-level singletons (worker, proxy, unavailable,
 * nextId). Since there is no dispose export, we reset the module between tests via
 * vi.resetModules() + dynamic re-import. Comlink and the Worker global are stubbed
 * so no real threads are created.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Comlink from "comlink";

// ---------------------------------------------------------------------------
// Mock Comlink before the module under test is imported
// ---------------------------------------------------------------------------

vi.mock("comlink", () => ({
  wrap: vi.fn((w: unknown) => ({ __worker: w, __isProxy: true })),
}));

// Type-only import from the worker — no runtime effect
vi.mock("@/workers/chart.worker", () => ({}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Stub HTMLCanvasElement.prototype.transferControlToOffscreen as a function. */
function enableOffscreenCanvas() {
  Object.defineProperty(HTMLCanvasElement.prototype, "transferControlToOffscreen", {
    value: vi.fn(),
    configurable: true,
    writable: true,
  });
}

/** Remove transferControlToOffscreen from HTMLCanvasElement.prototype. */
function disableOffscreenCanvas() {
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLCanvasElement.prototype,
    "transferControlToOffscreen",
  );
  if (descriptor) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (HTMLCanvasElement.prototype as Record<string, unknown>).transferControlToOffscreen;
  }
  return descriptor;
}

/** Creates a minimal fake Worker class. */
function makeWorkerClass(opts: {
  throws?: boolean;
  onConstruct?: (url: URL, workerOpts?: WorkerOptions) => void;
} = {}) {
  if (opts.throws) {
    // Return a constructor function rather than a class to avoid S2094
    // (class with only a constructor).
    function ThrowingWorker() {
      throw new Error("Worker init failed");
    }
    return ThrowingWorker as unknown as new () => never;
  }

  return class FakeWorker {
    terminate = vi.fn();
    postMessage = vi.fn();
    addEventListener = vi.fn();
    removeEventListener = vi.fn();
    constructor(url: URL, workerOpts?: WorkerOptions) {
      opts.onConstruct?.(url, workerOpts);
    }
  };
}

// ---------------------------------------------------------------------------
// supportsOffscreenChart — does not mutate module singletons
// ---------------------------------------------------------------------------

describe("supportsOffscreenChart", () => {
  let supportsOffscreenChart: () => boolean;

  beforeEach(async () => {
    vi.resetModules();
    vi.mocked(Comlink.wrap).mockClear();
    const mod = await import("@/platform/viz/chart-client");
    supportsOffscreenChart = mod.supportsOffscreenChart;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    // Restore transferControlToOffscreen to whatever state we need
  });

  it("returns true when Worker, HTMLCanvasElement, and transferControlToOffscreen are all available", () => {
    // Arrange
    vi.stubGlobal("Worker", makeWorkerClass());
    enableOffscreenCanvas();

    // Act + Assert
    expect(supportsOffscreenChart()).toBe(true);
  });

  it("returns false when Worker is undefined", () => {
    // Arrange
    vi.stubGlobal("Worker", undefined);
    enableOffscreenCanvas();

    // Act + Assert
    expect(supportsOffscreenChart()).toBe(false);
  });

  it("returns false when transferControlToOffscreen is not present on HTMLCanvasElement.prototype", () => {
    // Arrange
    vi.stubGlobal("Worker", makeWorkerClass());
    const saved = disableOffscreenCanvas();

    // Act
    const result = supportsOffscreenChart();

    // Restore
    if (saved) {
      Object.defineProperty(HTMLCanvasElement.prototype, "transferControlToOffscreen", saved);
    }

    // Assert
    expect(result).toBe(false);
  });

  it("returns false when HTMLCanvasElement is undefined", () => {
    // Arrange — Worker available but no HTMLCanvasElement
    vi.stubGlobal("Worker", makeWorkerClass());
    vi.stubGlobal("HTMLCanvasElement", undefined);

    // Act + Assert
    expect(supportsOffscreenChart()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getChartProxy — each test resets the module to clear singletons
// ---------------------------------------------------------------------------

describe("getChartProxy", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(Comlink.wrap).mockClear();
    enableOffscreenCanvas();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("returns a Comlink proxy on the happy path (Worker + OffscreenCanvas available)", async () => {
    // Arrange
    vi.stubGlobal("Worker", makeWorkerClass());
    vi.mocked(Comlink.wrap).mockReturnValueOnce({ __isProxy: true });
    const { getChartProxy } = await import("@/platform/viz/chart-client");

    // Act
    const result = getChartProxy();

    // Assert
    expect(result).not.toBeNull();
    expect(vi.mocked(Comlink.wrap)).toHaveBeenCalledOnce();
  });

  it("passes type:module and name:echarts options to the Worker constructor", async () => {
    // Arrange
    const calls: Array<[URL, WorkerOptions?]> = [];
    vi.stubGlobal("Worker", makeWorkerClass({ onConstruct: (u, o) => calls.push([u, o]) }));
    vi.mocked(Comlink.wrap).mockReturnValueOnce({ __isProxy: true });
    const { getChartProxy } = await import("@/platform/viz/chart-client");

    // Act
    getChartProxy();

    // Assert
    expect(calls).toHaveLength(1);
    const [, opts] = calls[0];
    expect(opts).toMatchObject({ type: "module", name: "echarts" });
  });

  it("returns the same proxy instance on repeated calls (singleton cache)", async () => {
    // Arrange
    vi.stubGlobal("Worker", makeWorkerClass());
    vi.mocked(Comlink.wrap).mockReturnValue({ __isProxy: true });
    const { getChartProxy } = await import("@/platform/viz/chart-client");

    // Act
    const first = getChartProxy();
    const second = getChartProxy();

    // Assert — wrap called only once; same reference returned
    expect(vi.mocked(Comlink.wrap)).toHaveBeenCalledOnce();
    expect(first).toBe(second);
  });

  it("returns null immediately when proxy exists and unavailable is already set", async () => {
    // Arrange — first obtain a proxy, then force an unavailable scenario via module reset
    vi.stubGlobal("Worker", undefined);
    const { getChartProxy } = await import("@/platform/viz/chart-client");

    // First call sets unavailable = true
    const first = getChartProxy();
    expect(first).toBeNull();

    // Restore Worker — unavailable flag should still block
    vi.stubGlobal("Worker", makeWorkerClass());

    // Act
    const second = getChartProxy();

    // Assert
    expect(second).toBeNull();
    expect(vi.mocked(Comlink.wrap)).not.toHaveBeenCalled();
  });

  it("returns null when Worker is undefined (SSR env) and sets unavailable=true", async () => {
    // Arrange
    vi.stubGlobal("Worker", undefined);
    const { getChartProxy } = await import("@/platform/viz/chart-client");

    // Act
    const result = getChartProxy();

    // Assert
    expect(result).toBeNull();
    expect(vi.mocked(Comlink.wrap)).not.toHaveBeenCalled();
  });

  it("returns null when the Worker constructor throws and sets unavailable", async () => {
    // Arrange
    vi.stubGlobal("Worker", makeWorkerClass({ throws: true }));
    const { getChartProxy } = await import("@/platform/viz/chart-client");

    // Act
    const result = getChartProxy();

    // Assert
    expect(result).toBeNull();
    expect(vi.mocked(Comlink.wrap)).not.toHaveBeenCalled();
  });

  it("subsequent calls return null after a constructor throw marks unavailable", async () => {
    // Arrange — first call throws
    vi.stubGlobal("Worker", makeWorkerClass({ throws: true }));
    const { getChartProxy } = await import("@/platform/viz/chart-client");

    getChartProxy(); // sets unavailable = true

    // Restore a working constructor — unavailable flag should still block
    vi.stubGlobal("Worker", makeWorkerClass());

    // Act
    const second = getChartProxy();

    // Assert
    expect(second).toBeNull();
    expect(vi.mocked(Comlink.wrap)).not.toHaveBeenCalled();
  });

  it("returns null (and sets unavailable) when transferControlToOffscreen is absent", async () => {
    // Arrange — Worker available but no OffscreenCanvas support
    vi.stubGlobal("Worker", makeWorkerClass());
    const saved = disableOffscreenCanvas();

    const { getChartProxy } = await import("@/platform/viz/chart-client");

    // Act
    const result = getChartProxy();

    // Restore
    if (saved) {
      Object.defineProperty(HTMLCanvasElement.prototype, "transferControlToOffscreen", saved);
    } else {
      enableOffscreenCanvas();
    }

    // Assert
    expect(result).toBeNull();
    expect(vi.mocked(Comlink.wrap)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// nextChartId — monotonic counter; reset per describe via resetModules
// ---------------------------------------------------------------------------

describe("nextChartId", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns 1 on the first call after module reset", async () => {
    // Arrange
    const { nextChartId } = await import("@/platform/viz/chart-client");

    // Act + Assert
    expect(nextChartId()).toBe(1);
  });

  it("returns monotonically increasing IDs on successive calls", async () => {
    // Arrange
    const { nextChartId } = await import("@/platform/viz/chart-client");

    // Act
    const a = nextChartId();
    const b = nextChartId();
    const c = nextChartId();

    // Assert
    expect(b).toBe(a + 1);
    expect(c).toBe(b + 1);
  });

  it("counter is independent per module instance (reset between test groups)", async () => {
    // Arrange — fresh module instance after resetModules in beforeEach
    const { nextChartId } = await import("@/platform/viz/chart-client");

    // Act + Assert — starts from 1 regardless of previous tests
    const id = nextChartId();
    expect(typeof id).toBe("number");
    expect(id).toBeGreaterThanOrEqual(1);
  });
});
