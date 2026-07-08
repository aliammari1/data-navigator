/**
 * Unit tests for src/platform/viz/parse-client.ts
 *
 * Strategy: the module holds module-level singletons (worker, proxy, unavailable).
 * We reset them between tests via disposeParseWorker(), stub the global Worker
 * constructor, and mock Comlink so no real threads are created.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock Comlink before the module under test is imported
// ---------------------------------------------------------------------------

type FakeProxy = { __isProxy: boolean; id?: number };

vi.mock("comlink", () => ({
  wrap: vi.fn((w: unknown) => ({ __worker: w, __isProxy: true } as FakeProxy)),
}));

// Type-only import from the worker — no runtime effect
vi.mock("@/workers/parse.worker", () => ({}));

import * as Comlink from "comlink";
import { disposeParseWorker, getParseProxy } from "@/platform/viz/parse-client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a minimal fake Worker class whose constructor optionally captures args. */
function makeWorkerClass(opts: {
  throws?: boolean;
  onConstruct?: (url: URL, workerOpts?: WorkerOptions) => void;
} = {}) {
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
// getParseProxy — uses module-level singletons reset by disposeParseWorker()
// ---------------------------------------------------------------------------

describe("getParseProxy", () => {
  beforeEach(() => {
    // Reset all module-level singletons before each test
    disposeParseWorker();
    vi.mocked(Comlink.wrap).mockClear();
  });

  afterEach(() => {
    disposeParseWorker();
    vi.unstubAllGlobals();
  });

  it("returns a proxy when Worker is available (happy path)", () => {
    // Arrange
    vi.stubGlobal("Worker", makeWorkerClass());
    vi.mocked(Comlink.wrap).mockReturnValueOnce({ __isProxy: true });

    // Act
    const result = getParseProxy();

    // Assert
    expect(result).not.toBeNull();
    expect(vi.mocked(Comlink.wrap)).toHaveBeenCalledOnce();
  });

  it("returns the same proxy instance on repeated calls (singleton cache)", () => {
    // Arrange
    vi.stubGlobal("Worker", makeWorkerClass());
    vi.mocked(Comlink.wrap).mockReturnValue({ __isProxy: true });

    // Act
    const first = getParseProxy();
    const second = getParseProxy();

    // Assert — wrap called only once; same reference returned
    expect(vi.mocked(Comlink.wrap)).toHaveBeenCalledOnce();
    expect(first).toBe(second);
  });

  it("returns null when Worker is undefined (SSR / Node env) and sets unavailable", () => {
    // Arrange
    vi.stubGlobal("Worker", undefined);

    // Act
    const result = getParseProxy();

    // Assert
    expect(result).toBeNull();
    expect(vi.mocked(Comlink.wrap)).not.toHaveBeenCalled();
  });

  it("returns null on subsequent calls when unavailable was set due to missing Worker", () => {
    // Arrange — first call sets unavailable = true
    vi.stubGlobal("Worker", undefined);
    getParseProxy();

    // Restore a working Worker; the unavailable flag should still block
    vi.stubGlobal("Worker", makeWorkerClass());

    // Act
    const second = getParseProxy();

    // Assert
    expect(second).toBeNull();
    expect(vi.mocked(Comlink.wrap)).not.toHaveBeenCalled();
  });

  it("returns null when the Worker constructor throws and sets unavailable", () => {
    // Arrange
    vi.stubGlobal("Worker", makeWorkerClass({ throws: true }));

    // Act
    const result = getParseProxy();

    // Assert
    expect(result).toBeNull();
    expect(vi.mocked(Comlink.wrap)).not.toHaveBeenCalled();
  });

  it("returns null on subsequent calls after a constructor throw marks unavailable", () => {
    // Arrange — first call throws
    vi.stubGlobal("Worker", makeWorkerClass({ throws: true }));
    getParseProxy(); // sets unavailable = true

    // Restore a working constructor — unavailable flag should still block
    vi.stubGlobal("Worker", makeWorkerClass());

    // Act
    const second = getParseProxy();

    // Assert
    expect(second).toBeNull();
    expect(vi.mocked(Comlink.wrap)).not.toHaveBeenCalled();
  });

  it("passes the correct worker options (type:module, name:parse) to the constructor", () => {
    // Arrange
    const calls: Array<[URL, WorkerOptions?]> = [];
    vi.stubGlobal("Worker", makeWorkerClass({ onConstruct: (u, o) => calls.push([u, o]) }));
    vi.mocked(Comlink.wrap).mockReturnValueOnce({ __isProxy: true });

    // Act
    getParseProxy();

    // Assert
    expect(calls).toHaveLength(1);
    const [, opts] = calls[0];
    expect(opts).toMatchObject({ type: "module", name: "parse" });
  });

  it("passes Comlink.wrap the constructed worker instance", () => {
    // Arrange
    vi.stubGlobal("Worker", makeWorkerClass());
    vi.mocked(Comlink.wrap).mockReturnValueOnce({ __isProxy: true });

    // Act
    getParseProxy();

    // Assert — Comlink.wrap was called with some Worker instance
    const [workerArg] = vi.mocked(Comlink.wrap).mock.calls[0];
    expect(workerArg).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// disposeParseWorker
// ---------------------------------------------------------------------------

describe("disposeParseWorker", () => {
  beforeEach(() => {
    disposeParseWorker();
    vi.mocked(Comlink.wrap).mockClear();
  });

  afterEach(() => {
    disposeParseWorker();
    vi.unstubAllGlobals();
  });

  it("calls terminate() on the live worker", () => {
    // Arrange
    const terminateSpy = vi.fn();
    class FakeWorkerCls {
      terminate = terminateSpy;
    }
    vi.stubGlobal("Worker", FakeWorkerCls);
    vi.mocked(Comlink.wrap).mockReturnValueOnce({ __isProxy: true });
    getParseProxy(); // creates the worker

    // Act
    disposeParseWorker();

    // Assert
    expect(terminateSpy).toHaveBeenCalledOnce();
  });

  it("is safe to call when no worker has been created (no-op)", () => {
    // Act + Assert — should not throw even with no worker
    expect(() => disposeParseWorker()).not.toThrow();
    expect(() => disposeParseWorker()).not.toThrow();
  });

  it("allows a fresh proxy to be created after disposal", () => {
    // Arrange
    class FakeWorkerCls {
      terminate = vi.fn();
    }
    vi.stubGlobal("Worker", FakeWorkerCls);
    vi.mocked(Comlink.wrap)
      .mockReturnValueOnce({ __isProxy: true, id: 1 })
      .mockReturnValueOnce({ __isProxy: true, id: 2 });

    const first = getParseProxy();

    // Act
    disposeParseWorker();
    const second = getParseProxy();

    // Assert — wrap called twice, different proxy instances
    expect(vi.mocked(Comlink.wrap)).toHaveBeenCalledTimes(2);
    expect(second).not.toBeNull();
    expect(first).not.toBe(second);
  });

  it("clears the unavailable flag so Worker construction is retried after disposal", () => {
    // Arrange — trigger unavailable state
    vi.stubGlobal("Worker", undefined);
    getParseProxy(); // sets unavailable = true

    // Restore Worker and dispose
    class FakeWorkerCls {
      terminate = vi.fn();
    }
    vi.stubGlobal("Worker", FakeWorkerCls);
    vi.mocked(Comlink.wrap).mockReturnValueOnce({ __isProxy: true });
    disposeParseWorker(); // should reset unavailable = false

    // Act
    const result = getParseProxy();

    // Assert
    expect(result).not.toBeNull();
    expect(vi.mocked(Comlink.wrap)).toHaveBeenCalledOnce();
  });

  it("resets proxy to null so that getParseProxy creates a new one after dispose", () => {
    // Arrange
    class FakeWorkerCls {
      terminate = vi.fn();
    }
    vi.stubGlobal("Worker", FakeWorkerCls);
    vi.mocked(Comlink.wrap)
      .mockReturnValueOnce({ __isProxy: true, id: 10 })
      .mockReturnValueOnce({ __isProxy: true, id: 20 });

    getParseProxy(); // warm the proxy

    // Act
    disposeParseWorker();

    // After disposal, the next call must rebuild (wrap called a second time)
    const fresh = getParseProxy();

    // Assert
    expect(fresh).not.toBeNull();
    expect(vi.mocked(Comlink.wrap)).toHaveBeenCalledTimes(2);
  });
});
