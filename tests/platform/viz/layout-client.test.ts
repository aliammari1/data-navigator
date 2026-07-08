/**
 * Unit tests for src/platform/viz/layout-client.ts
 *
 * Strategy: the module holds module-level singletons (worker, proxy, unavailable).
 * We reset them between tests via disposeLayoutWorker(), stub the global Worker
 * constructor as a class, and mock Comlink so no real threads are created.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock Comlink before the module under test is imported
// ---------------------------------------------------------------------------

vi.mock("comlink", () => ({
  wrap: vi.fn((w: unknown) => ({ __worker: w, __isProxy: true })),
}));

// Type-only import from the worker — no runtime effect
vi.mock("@/workers/layout.worker", () => ({}));

import * as Comlink from "comlink";
import {
  disposeLayoutWorker,
  getLayoutProxy,
} from "@/platform/viz/layout-client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a minimal fake Worker instance with a terminate spy. */
function makeFakeWorker() {
  return {
    terminate: vi.fn(),
    postMessage: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
}

type FakeWorkerInstance = ReturnType<typeof makeFakeWorker>;

/**
 * Stubs the global Worker with a class whose constructor delegates to a
 * factory function. Uses a class keyword so `new Worker(...)` works correctly.
 */
function stubWorkerClass(factory: () => FakeWorkerInstance) {
  class FakeWorker {
    terminate: () => void;
    postMessage: () => void;
    addEventListener: () => void;
    removeEventListener: () => void;
    dispatchEvent: () => void;

    constructor(_url: URL, _opts?: WorkerOptions) {
      const instance = factory();
      this.terminate = instance.terminate;
      this.postMessage = instance.postMessage;
      this.addEventListener = instance.addEventListener;
      this.removeEventListener = instance.removeEventListener;
      this.dispatchEvent = instance.dispatchEvent;
    }
  }

  vi.stubGlobal("Worker", FakeWorker);
  return { factory };
}

/**
 * Stubs Worker as a class whose constructor throws, exercising the catch branch.
 */
function stubWorkerThatThrows(message = "Worker init failed") {
  class ThrowingWorker {
    constructor() {
      throw new Error(message);
    }
  }
  vi.stubGlobal("Worker", ThrowingWorker);
}

// ---------------------------------------------------------------------------
// Suite: getLayoutProxy
// ---------------------------------------------------------------------------

describe("getLayoutProxy", () => {
  beforeEach(() => {
    // Reset all module-level singletons before each test
    disposeLayoutWorker();
    vi.mocked(Comlink.wrap).mockClear();
  });

  afterEach(() => {
    disposeLayoutWorker();
    vi.unstubAllGlobals();
  });

  it("returns a proxy when Worker is available (happy path)", () => {
    // Arrange
    const fakeWorker = makeFakeWorker();
    class FakeWorkerCls {
      terminate = fakeWorker.terminate;
      postMessage = fakeWorker.postMessage;
    }
    vi.stubGlobal("Worker", FakeWorkerCls);
    vi.mocked(Comlink.wrap).mockReturnValueOnce({ __isProxy: true });

    // Act
    const result = getLayoutProxy();

    // Assert
    expect(result).not.toBeNull();
    expect(vi.mocked(Comlink.wrap)).toHaveBeenCalledOnce();
  });

  it("returns the same proxy instance on repeated calls (singleton cache)", () => {
    // Arrange
    class FakeWorkerCls {
      terminate = vi.fn();
    }
    vi.stubGlobal("Worker", FakeWorkerCls);
    vi.mocked(Comlink.wrap).mockReturnValue({ __isProxy: true });

    // Act
    const first = getLayoutProxy();
    const second = getLayoutProxy();

    // Assert — wrap called only once; same reference returned
    expect(vi.mocked(Comlink.wrap)).toHaveBeenCalledOnce();
    expect(first).toBe(second);
  });

  it("returns null when Worker is undefined (SSR / Node env)", () => {
    // Arrange — remove the global Worker
    vi.stubGlobal("Worker", undefined);

    // Act
    const result = getLayoutProxy();

    // Assert
    expect(result).toBeNull();
  });

  it("sets unavailable so subsequent calls skip construction after undefined Worker", () => {
    // Arrange
    vi.stubGlobal("Worker", undefined);
    getLayoutProxy(); // first call — sets unavailable = true

    // Restore a working Worker class; the flag should still block
    class FakeWorkerCls {
      terminate = vi.fn();
    }
    vi.stubGlobal("Worker", FakeWorkerCls);

    // Act
    const second = getLayoutProxy();

    // Assert
    expect(second).toBeNull();
    expect(vi.mocked(Comlink.wrap)).not.toHaveBeenCalled();
  });

  it("returns null when the Worker constructor throws", () => {
    // Arrange
    stubWorkerThatThrows();

    // Act
    const result = getLayoutProxy();

    // Assert
    expect(result).toBeNull();
  });

  it("sets unavailable so subsequent calls return null after a constructor throw", () => {
    // Arrange — first call throws
    stubWorkerThatThrows();
    getLayoutProxy();

    // Swap to a working constructor
    class FakeWorkerCls {
      terminate = vi.fn();
    }
    vi.stubGlobal("Worker", FakeWorkerCls);

    // Act
    const second = getLayoutProxy();

    // Assert — still null because unavailable is true
    expect(second).toBeNull();
    expect(vi.mocked(Comlink.wrap)).not.toHaveBeenCalled();
  });

  it("passes the correct worker options (type:module, name:layout) to the constructor", () => {
    // Arrange
    const calls: Array<[URL, WorkerOptions?]> = [];
    class CapturingWorker {
      terminate = vi.fn();
      constructor(url: URL, opts?: WorkerOptions) {
        calls.push([url, opts]);
      }
    }
    vi.stubGlobal("Worker", CapturingWorker);
    vi.mocked(Comlink.wrap).mockReturnValueOnce({ __isProxy: true });

    // Act
    getLayoutProxy();

    // Assert
    expect(calls).toHaveLength(1);
    const [, opts] = calls[0];
    expect(opts).toMatchObject({ type: "module", name: "layout" });
  });
});

// ---------------------------------------------------------------------------
// Suite: disposeLayoutWorker
// ---------------------------------------------------------------------------

describe("disposeLayoutWorker", () => {
  beforeEach(() => {
    disposeLayoutWorker();
    vi.mocked(Comlink.wrap).mockClear();
  });

  afterEach(() => {
    disposeLayoutWorker();
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
    getLayoutProxy(); // creates the worker

    // Act
    disposeLayoutWorker();

    // Assert
    expect(terminateSpy).toHaveBeenCalledOnce();
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

    const first = getLayoutProxy();

    // Act
    disposeLayoutWorker();
    const second = getLayoutProxy();

    // Assert — wrap called twice, different proxy instances
    expect(vi.mocked(Comlink.wrap)).toHaveBeenCalledTimes(2);
    expect(second).not.toBeNull();
    expect(first).not.toBe(second);
  });

  it("is safe to call when no worker has been created (no-op)", () => {
    // Act + Assert — should not throw
    expect(() => disposeLayoutWorker()).not.toThrow();
    expect(() => disposeLayoutWorker()).not.toThrow();
  });

  it("clears the unavailable flag so Worker construction is retried after disposal", () => {
    // Arrange — trigger unavailable state
    vi.stubGlobal("Worker", undefined);
    getLayoutProxy(); // sets unavailable = true

    // Restore and dispose
    class FakeWorkerCls {
      terminate = vi.fn();
    }
    vi.stubGlobal("Worker", FakeWorkerCls);
    vi.mocked(Comlink.wrap).mockReturnValueOnce({ __isProxy: true });
    disposeLayoutWorker(); // should reset unavailable = false

    // Act
    const result = getLayoutProxy();

    // Assert
    expect(result).not.toBeNull();
    expect(vi.mocked(Comlink.wrap)).toHaveBeenCalledOnce();
  });

  it("sets worker and proxy to null after disposal so getLayoutProxy recreates them", () => {
    // Arrange
    let callCount = 0;
    class CountingWorker {
      terminate = vi.fn();
      constructor() {
        callCount++;
      }
    }
    vi.stubGlobal("Worker", CountingWorker);
    vi.mocked(Comlink.wrap).mockReturnValue({ __isProxy: true });

    getLayoutProxy(); // first creation
    expect(callCount).toBe(1);

    // Act
    disposeLayoutWorker();
    getLayoutProxy(); // second creation

    // Assert — Worker was constructed a second time
    expect(callCount).toBe(2);
  });
});
