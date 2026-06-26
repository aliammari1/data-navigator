import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Unit tests for getMLClient / disposeMLClient in @/features/deep-analytics/lib/ml-client.
 *
 * The module is a thin singleton wrapper around Comlink + a Web Worker.
 * All external dependencies (Worker constructor, Comlink) are mocked so the
 * logic — lazy-initialisation, singleton caching, SSR guard, disposal — is
 * tested entirely in-process without touching the filesystem or a real Worker.
 *
 * Test plan:
 *  1. getMLClient – SSR guard (window undefined)
 *  2. getMLClient – first call creates Worker + wraps with Comlink
 *  3. getMLClient – second call returns the cached api (no new Worker)
 *  4. disposeMLClient – terminates the worker and nulls state
 *  5. disposeMLClient – safe to call when no worker is alive (worker === null)
 *  6. disposeMLClient + getMLClient round-trip – dispose then reinitialise
 *  7. disposeMLClient called twice – idempotent, no double-terminate
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock Comlink so the module never needs a real Worker realm.
const mockWrap = vi.fn();
vi.mock("comlink", () => ({
  wrap: mockWrap,
}));

// ---------------------------------------------------------------------------
// Helpers: a proper class-based Worker mock that `new Worker(...)` can use.
// ---------------------------------------------------------------------------

const mockTerminate = vi.fn();

class MockWorker {
  terminate = mockTerminate;
  constructor(_url: unknown, _opts?: unknown) {}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getMLClient", () => {
  beforeEach(() => {
    // Provide the class as the Worker global so `new Worker(...)` succeeds.
    vi.stubGlobal("Worker", MockWorker);
    mockWrap.mockReturnValue({ fakeApi: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    mockWrap.mockReset();
    mockTerminate.mockReset();
  });

  it("throws when called outside the browser (window is undefined)", async () => {
    // Arrange – remove window to simulate SSR.
    vi.stubGlobal("window", undefined);

    const { getMLClient } = await import("@/features/deep-analytics/lib/ml-client");

    // Act / Assert
    expect(() => getMLClient()).toThrowError("getMLClient must be called in the browser");
  });

  it("creates a Worker and wraps it with Comlink on the first call", async () => {
    // Arrange
    const workerSpy = vi.spyOn(globalThis, "Worker" as never);
    const { getMLClient } = await import("@/features/deep-analytics/lib/ml-client");

    // Act
    const api = getMLClient();

    // Assert – Worker was constructed and Comlink.wrap was called with it.
    expect(workerSpy).toHaveBeenCalledTimes(1);
    expect(mockWrap).toHaveBeenCalledTimes(1);
    // Comlink.wrap receives a Worker-like object with a terminate method.
    expect(mockWrap).toHaveBeenCalledWith(expect.objectContaining({ terminate: expect.any(Function) }));
    // The return value is whatever Comlink.wrap returned.
    expect(api).toEqual({ fakeApi: true });
  });

  it("returns the cached api on subsequent calls without creating a new Worker", async () => {
    // Arrange
    const workerSpy = vi.spyOn(globalThis, "Worker" as never);
    const { getMLClient } = await import("@/features/deep-analytics/lib/ml-client");

    // Act
    const first = getMLClient();
    const second = getMLClient();
    const third = getMLClient();

    // Assert – singleton: only one Worker and one wrap call across all invocations.
    expect(workerSpy).toHaveBeenCalledTimes(1);
    expect(mockWrap).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
    expect(second).toBe(third);
  });
});

describe("disposeMLClient", () => {
  beforeEach(() => {
    vi.stubGlobal("Worker", MockWorker);
    mockWrap.mockReturnValue({ fakeApi: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    mockWrap.mockReset();
    mockTerminate.mockReset();
  });

  it("terminates the underlying Worker and resets the singleton state", async () => {
    // Arrange – initialise the singleton first.
    const { getMLClient, disposeMLClient } = await import("@/features/deep-analytics/lib/ml-client");
    getMLClient();

    // Act
    disposeMLClient();

    // Assert – terminate was called on the Worker instance.
    expect(mockTerminate).toHaveBeenCalledTimes(1);
  });

  it("is safe to call when no Worker has been created (worker is null)", async () => {
    // Arrange – do NOT call getMLClient; worker starts as null.
    const { disposeMLClient } = await import("@/features/deep-analytics/lib/ml-client");

    // Act / Assert – should not throw even though worker === null.
    expect(() => disposeMLClient()).not.toThrow();
    // terminate should NOT have been called.
    expect(mockTerminate).not.toHaveBeenCalled();
  });

  it("allows reinitialisation after disposal (dispose then getMLClient creates a fresh Worker)", async () => {
    // Arrange
    const workerSpy = vi.spyOn(globalThis, "Worker" as never);
    const { getMLClient, disposeMLClient } = await import("@/features/deep-analytics/lib/ml-client");

    // First initialisation.
    const firstApi = getMLClient();
    expect(workerSpy).toHaveBeenCalledTimes(1);

    // Dispose.
    disposeMLClient();
    expect(mockTerminate).toHaveBeenCalledTimes(1);

    // Provide a fresh mock return for the second wrap call.
    mockWrap.mockReturnValue({ fakeApi2: true });

    // Second initialisation – must create a brand-new Worker.
    const secondApi = getMLClient();
    expect(workerSpy).toHaveBeenCalledTimes(2);
    expect(mockWrap).toHaveBeenCalledTimes(2);
    expect(secondApi).toEqual({ fakeApi2: true });
    // The two api objects must be distinct instances (different mock returns).
    expect(secondApi).not.toBe(firstApi);
  });

  it("calling dispose twice is idempotent (no double-terminate)", async () => {
    // Arrange
    const { getMLClient, disposeMLClient } = await import("@/features/deep-analytics/lib/ml-client");
    getMLClient();

    // Act – first dispose.
    disposeMLClient();
    expect(mockTerminate).toHaveBeenCalledTimes(1);

    // Act – second dispose: worker is now null, optional chain is a no-op.
    disposeMLClient();
    // terminate should still have been called only once.
    expect(mockTerminate).toHaveBeenCalledTimes(1);
  });
});
