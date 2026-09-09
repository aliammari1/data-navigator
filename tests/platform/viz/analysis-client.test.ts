/**
 * Unit tests for src/platform/viz/analysis-client.ts
 *
 * Strategy: the module holds module-level singletons (worker, proxy, unavailable).
 * We reset them between tests via disposeAnalysisWorker(), stub the global Worker
 * constructor as a class, and mock Comlink so no real threads are created.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock Comlink before the module under test is imported
// ---------------------------------------------------------------------------

// Stub return type for Comlink.wrap — avoids `as never` casts at every call site.
type FakeProxy = { __isProxy: boolean; id?: number };

vi.mock("comlink", () => ({
  wrap: vi.fn((w: unknown) => ({ __worker: w, __isProxy: true }) as FakeProxy),
}));

// Type-only import from the worker — no runtime effect
vi.mock("@/workers/analysis.worker", () => ({}));

import * as Comlink from "comlink";
import { disposeAnalysisWorker, getAnalysisProxy } from "@/platform/viz/analysis-client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a minimal fake Worker class with a terminate spy whose constructor
 * captures the URL and options passed to it.
 */
function makeWorkerClass(
  opts: { throws?: boolean; onConstruct?: (url: URL, workerOpts?: WorkerOptions) => void } = {},
) {
  if (opts.throws) {
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
// getAnalysisProxy — each test resets state via disposeAnalysisWorker
// ---------------------------------------------------------------------------

describe("getAnalysisProxy", () => {
  beforeEach(() => {
    // Reset all module-level singletons before each test
    disposeAnalysisWorker();
    vi.mocked(Comlink.wrap).mockClear();
  });

  afterEach(() => {
    disposeAnalysisWorker();
    vi.unstubAllGlobals();
  });

  it("returns a Comlink proxy on the happy path (Worker available)", () => {
    // Arrange
    vi.stubGlobal("Worker", makeWorkerClass());
    vi.mocked(Comlink.wrap).mockReturnValueOnce({ __isProxy: true });

    // Act
    const result = getAnalysisProxy();

    // Assert
    expect(result).not.toBeNull();
    expect(vi.mocked(Comlink.wrap)).toHaveBeenCalledOnce();
  });

  it("passes type:module and name:analysis options to the Worker constructor", () => {
    // Arrange
    const calls: Array<[URL, WorkerOptions?]> = [];
    vi.stubGlobal("Worker", makeWorkerClass({ onConstruct: (u, o) => calls.push([u, o]) }));
    vi.mocked(Comlink.wrap).mockReturnValueOnce({ __isProxy: true });

    // Act
    getAnalysisProxy();

    // Assert
    expect(calls).toHaveLength(1);
    const [, opts] = calls[0];
    expect(opts).toMatchObject({ type: "module", name: "analysis" });
  });

  it("returns the same proxy instance on repeated calls (singleton cache)", () => {
    // Arrange
    vi.stubGlobal("Worker", makeWorkerClass());
    vi.mocked(Comlink.wrap).mockReturnValue({ __isProxy: true });

    // Act
    const first = getAnalysisProxy();
    const second = getAnalysisProxy();

    // Assert — wrap called only once; same reference returned
    expect(vi.mocked(Comlink.wrap)).toHaveBeenCalledOnce();
    expect(first).toBe(second);
  });

  it("returns null when Worker is undefined (SSR / Node env) and sets unavailable=true", () => {
    // Arrange — remove the global Worker
    vi.stubGlobal("Worker", undefined);

    // Act
    const result = getAnalysisProxy();

    // Assert
    expect(result).toBeNull();
    expect(vi.mocked(Comlink.wrap)).not.toHaveBeenCalled();
  });

  it("sets unavailable so subsequent calls skip construction after undefined Worker", () => {
    // Arrange
    vi.stubGlobal("Worker", undefined);
    getAnalysisProxy(); // first call — sets unavailable = true

    // Restore a working Worker class; the flag should still block
    vi.stubGlobal("Worker", makeWorkerClass());

    // Act
    const second = getAnalysisProxy();

    // Assert
    expect(second).toBeNull();
    expect(vi.mocked(Comlink.wrap)).not.toHaveBeenCalled();
  });

  it("returns null when the Worker constructor throws and sets unavailable", () => {
    // Arrange
    vi.stubGlobal("Worker", makeWorkerClass({ throws: true }));

    // Act
    const result = getAnalysisProxy();

    // Assert
    expect(result).toBeNull();
    expect(vi.mocked(Comlink.wrap)).not.toHaveBeenCalled();
  });

  it("sets unavailable so subsequent calls return null after a constructor throw", () => {
    // Arrange — first call throws
    vi.stubGlobal("Worker", makeWorkerClass({ throws: true }));
    getAnalysisProxy(); // sets unavailable = true

    // Swap to a working constructor — unavailable flag should still block
    vi.stubGlobal("Worker", makeWorkerClass());

    // Act
    const second = getAnalysisProxy();

    // Assert — still null because unavailable is true
    expect(second).toBeNull();
    expect(vi.mocked(Comlink.wrap)).not.toHaveBeenCalled();
  });

  it("returns null immediately on repeated calls when unavailable is already set", () => {
    // Arrange — trigger unavailable first
    vi.stubGlobal("Worker", undefined);
    const first = getAnalysisProxy();
    expect(first).toBeNull();

    // Restore Worker — unavailable flag should still block
    vi.stubGlobal("Worker", makeWorkerClass());

    // Act
    const second = getAnalysisProxy();

    // Assert
    expect(second).toBeNull();
    expect(vi.mocked(Comlink.wrap)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// disposeAnalysisWorker — verifies teardown behaviour
// ---------------------------------------------------------------------------

describe("disposeAnalysisWorker", () => {
  beforeEach(() => {
    disposeAnalysisWorker();
    vi.mocked(Comlink.wrap).mockClear();
  });

  afterEach(() => {
    disposeAnalysisWorker();
    vi.unstubAllGlobals();
  });

  it("calls terminate() on the live worker", () => {
    // Arrange
    const terminateSpy = vi.fn();
    class FakeWorkerCls {
      terminate = terminateSpy;
      postMessage = vi.fn();
    }
    vi.stubGlobal("Worker", FakeWorkerCls);
    vi.mocked(Comlink.wrap).mockReturnValueOnce({ __isProxy: true });
    getAnalysisProxy(); // creates the worker

    // Act
    disposeAnalysisWorker();

    // Assert
    expect(terminateSpy).toHaveBeenCalledOnce();
  });

  it("is safe to call when no worker has been created (no-op via optional chaining)", () => {
    // Act + Assert — should not throw even when worker is null
    expect(() => disposeAnalysisWorker()).not.toThrow();
    expect(() => disposeAnalysisWorker()).not.toThrow();
  });

  it("allows a fresh proxy to be created after disposal", () => {
    // Arrange — first proxy
    class FakeWorkerCls {
      terminate = vi.fn();
    }
    vi.stubGlobal("Worker", FakeWorkerCls);
    vi.mocked(Comlink.wrap)
      .mockReturnValueOnce({ __isProxy: true, id: 1 })
      .mockReturnValueOnce({ __isProxy: true, id: 2 });

    const first = getAnalysisProxy();

    // Act
    disposeAnalysisWorker();
    const second = getAnalysisProxy();

    // Assert — wrap called twice, different proxy instances
    expect(vi.mocked(Comlink.wrap)).toHaveBeenCalledTimes(2);
    expect(second).not.toBeNull();
    expect(first).not.toBe(second);
  });

  it("clears the unavailable flag so Worker construction is retried after disposal", () => {
    // Arrange — trigger unavailable state
    vi.stubGlobal("Worker", undefined);
    getAnalysisProxy(); // sets unavailable = true

    // Restore and dispose
    class FakeWorkerCls {
      terminate = vi.fn();
    }
    vi.stubGlobal("Worker", FakeWorkerCls);
    vi.mocked(Comlink.wrap).mockReturnValueOnce({ __isProxy: true });
    disposeAnalysisWorker(); // should reset unavailable = false

    // Act
    const result = getAnalysisProxy();

    // Assert
    expect(result).not.toBeNull();
    expect(vi.mocked(Comlink.wrap)).toHaveBeenCalledOnce();
  });

  it("resets all three singletons (worker, proxy, unavailable) to null/false", () => {
    // Arrange — create a proxy
    class FakeWorkerCls {
      terminate = vi.fn();
    }
    vi.stubGlobal("Worker", FakeWorkerCls);
    vi.mocked(Comlink.wrap).mockReturnValue({ __isProxy: true });
    getAnalysisProxy();

    // Act
    disposeAnalysisWorker();

    // Assert — after dispose, next call with no Worker returns null (not cached proxy)
    vi.stubGlobal("Worker", undefined);
    const result = getAnalysisProxy();
    expect(result).toBeNull();
    // wrap should NOT have been called again after dispose (Worker is undefined)
    expect(vi.mocked(Comlink.wrap)).toHaveBeenCalledOnce();
  });
});
