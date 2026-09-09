/**
 * Unit tests for src/platform/viz/export-client.ts
 *
 * Strategy: the module holds module-level singletons (worker, proxy, unavailable).
 * We reset them between tests via disposeExportWorker(), stub the global Worker
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
vi.mock("@/workers/export.worker", () => ({}));

import * as Comlink from "comlink";
import {
  disposeExportWorker,
  getExportProxy,
  warmExportWorker,
} from "@/platform/viz/export-client";

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
 * Stubs the global Worker with a class whose constructor calls the supplied
 * factory and returns a fake instance. Vitest requires `function`/`class`
 * keyword for constructors used with `new`.
 */
function stubWorkerClass(factory: () => FakeWorkerInstance) {
  // eslint-disable-next-line @typescript-eslint/no-extraneous-class
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

  const ctor = vi.fn().mockImplementation(function (
    this: FakeWorker,
    url: URL,
    opts?: WorkerOptions,
  ) {
    // Transfer properties from FakeWorker instance
    const real = new FakeWorker(url, opts);
    Object.assign(this, real);
  });

  vi.stubGlobal("Worker", ctor);
  return { ctor, factory };
}

/**
 * Stubs Worker as a class whose constructor throws to exercise the catch branch.
 */
function stubWorkerThatThrows(message = "Worker init failed") {
  // eslint-disable-next-line @typescript-eslint/no-extraneous-class
  class ThrowingWorker {
    constructor() {
      throw new Error(message);
    }
  }
  vi.stubGlobal("Worker", ThrowingWorker);
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("getExportProxy", () => {
  beforeEach(() => {
    // Reset all module-level singletons before each test
    disposeExportWorker();
    vi.mocked(Comlink.wrap).mockClear();
  });

  afterEach(() => {
    disposeExportWorker();
    vi.unstubAllGlobals();
  });

  it("returns a proxy when Worker is available (happy path)", () => {
    // Arrange
    const fakeWorker = makeFakeWorker();
    // Use a proper class stub so `new Worker(...)` works
    class FakeWorkerCls {
      terminate = fakeWorker.terminate;
      postMessage = fakeWorker.postMessage;
    }
    vi.stubGlobal("Worker", FakeWorkerCls);
    vi.mocked(Comlink.wrap).mockReturnValueOnce({ __isProxy: true });

    // Act
    const result = getExportProxy();

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
    const first = getExportProxy();
    const second = getExportProxy();

    // Assert — wrap called only once; same reference returned
    expect(vi.mocked(Comlink.wrap)).toHaveBeenCalledOnce();
    expect(first).toBe(second);
  });

  it("returns null when Worker is undefined (SSR / Node env)", () => {
    // Arrange — remove the global Worker
    vi.stubGlobal("Worker", undefined);

    // Act
    const result = getExportProxy();

    // Assert
    expect(result).toBeNull();
  });

  it("sets unavailable so subsequent calls skip construction after undefined Worker", () => {
    // Arrange
    vi.stubGlobal("Worker", undefined);
    getExportProxy(); // first call — sets unavailable = true

    // Restore a working Worker class; the flag should still block
    class FakeWorkerCls {
      terminate = vi.fn();
    }
    vi.stubGlobal("Worker", FakeWorkerCls);

    // Act
    const second = getExportProxy();

    // Assert
    expect(second).toBeNull();
    expect(vi.mocked(Comlink.wrap)).not.toHaveBeenCalled();
  });

  it("returns null when the Worker constructor throws", () => {
    // Arrange
    stubWorkerThatThrows();

    // Act
    const result = getExportProxy();

    // Assert
    expect(result).toBeNull();
  });

  it("sets unavailable so subsequent calls return null after a constructor throw", () => {
    // Arrange — first call throws
    stubWorkerThatThrows();
    getExportProxy();

    // Swap to a working constructor
    class FakeWorkerCls {
      terminate = vi.fn();
    }
    vi.stubGlobal("Worker", FakeWorkerCls);

    // Act
    const second = getExportProxy();

    // Assert — still null because unavailable is true
    expect(second).toBeNull();
    expect(vi.mocked(Comlink.wrap)).not.toHaveBeenCalled();
  });

  it("passes the correct worker options (type:module, name:export) to the constructor", () => {
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
    getExportProxy();

    // Assert
    expect(calls).toHaveLength(1);
    const [, opts] = calls[0];
    expect(opts).toMatchObject({ type: "module", name: "export" });
  });
});

// ---------------------------------------------------------------------------

describe("disposeExportWorker", () => {
  beforeEach(() => {
    disposeExportWorker();
    vi.mocked(Comlink.wrap).mockClear();
  });

  afterEach(() => {
    disposeExportWorker();
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
    getExportProxy(); // creates the worker

    // Act
    disposeExportWorker();

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

    const first = getExportProxy();

    // Act
    disposeExportWorker();
    const second = getExportProxy();

    // Assert — wrap called twice, different proxy instances
    expect(vi.mocked(Comlink.wrap)).toHaveBeenCalledTimes(2);
    expect(second).not.toBeNull();
    expect(first).not.toBe(second);
  });

  it("is safe to call when no worker has been created (no-op)", () => {
    // Act + Assert — should not throw
    expect(() => disposeExportWorker()).not.toThrow();
    expect(() => disposeExportWorker()).not.toThrow();
  });

  it("clears the unavailable flag so Worker construction is retried after disposal", () => {
    // Arrange — trigger unavailable state
    vi.stubGlobal("Worker", undefined);
    getExportProxy(); // sets unavailable = true

    // Restore and dispose
    class FakeWorkerCls {
      terminate = vi.fn();
    }
    vi.stubGlobal("Worker", FakeWorkerCls);
    vi.mocked(Comlink.wrap).mockReturnValueOnce({ __isProxy: true });
    disposeExportWorker(); // should reset unavailable = false

    // Act
    const result = getExportProxy();

    // Assert
    expect(result).not.toBeNull();
    expect(vi.mocked(Comlink.wrap)).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------

describe("warmExportWorker", () => {
  beforeEach(() => {
    disposeExportWorker();
    vi.mocked(Comlink.wrap).mockClear();
  });

  afterEach(() => {
    disposeExportWorker();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses requestIdleCallback when it is available", () => {
    // Arrange
    const idleCb = vi.fn();
    vi.stubGlobal("requestIdleCallback", idleCb);
    class FakeWorkerCls {
      terminate = vi.fn();
    }
    vi.stubGlobal("Worker", FakeWorkerCls);

    // Act
    warmExportWorker();

    // Assert — callback registered but not yet invoked
    expect(idleCb).toHaveBeenCalledOnce();
    expect(typeof idleCb.mock.calls[0][0]).toBe("function");
  });

  it("invokes getExportProxy when the idle callback fires", () => {
    // Arrange
    let capturedCb: (() => void) | null = null;
    vi.stubGlobal("requestIdleCallback", (cb: () => void) => {
      capturedCb = cb;
    });
    class FakeWorkerCls {
      terminate = vi.fn();
    }
    vi.stubGlobal("Worker", FakeWorkerCls);
    vi.mocked(Comlink.wrap).mockReturnValueOnce({ __isProxy: true });

    // Act
    warmExportWorker();
    capturedCb?.(); // simulate browser idle event

    // Assert — the proxy was created
    expect(vi.mocked(Comlink.wrap)).toHaveBeenCalledOnce();
  });

  it("falls back to setTimeout when requestIdleCallback is undefined", () => {
    // Arrange
    vi.stubGlobal("requestIdleCallback", undefined);
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    class FakeWorkerCls {
      terminate = vi.fn();
    }
    vi.stubGlobal("Worker", FakeWorkerCls);

    // Act
    warmExportWorker();

    // Assert — setTimeout called with delay 0
    const timeoutCalls = setTimeoutSpy.mock.calls;
    expect(timeoutCalls.length).toBeGreaterThanOrEqual(1);
    // Find the call from warmExportWorker (delay === 0)
    const relevantCall = timeoutCalls.find((c) => c[1] === 0);
    expect(relevantCall).toBeDefined();
  });

  it("invokes getExportProxy when the setTimeout callback fires", () => {
    // Arrange
    vi.stubGlobal("requestIdleCallback", undefined);
    vi.useFakeTimers();
    class FakeWorkerCls {
      terminate = vi.fn();
    }
    vi.stubGlobal("Worker", FakeWorkerCls);
    vi.mocked(Comlink.wrap).mockReturnValueOnce({ __isProxy: true });

    // Act
    warmExportWorker();
    vi.runAllTimers();

    // Assert — proxy was created
    expect(vi.mocked(Comlink.wrap)).toHaveBeenCalledOnce();

    vi.useRealTimers();
  });
});
