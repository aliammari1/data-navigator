/**
 * Tests for src/platform/perf/react-scan-dev.ts
 *
 * Strategy:
 *  - Mock "react-scan" to capture calls to scan().
 *  - Reset the module's `started` guard between tests via vi.resetModules().
 *  - Exercise all branches: started guard, window undefined, production env guard,
 *    happy-path scan call, and catch block when react-scan import fails.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks (declared before any dynamic import of the target module)
// ---------------------------------------------------------------------------

const mockScan = vi.fn();

vi.mock("react-scan", () => ({
  scan: mockScan,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Flush all queued microtasks so fire-and-forget promises settle. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("initReactScanDev", () => {
  beforeEach(() => {
    mockScan.mockReset();
    // Reset the module so the `started` flag is cleared between tests.
    vi.resetModules();
  });

  // -------------------------------------------------------------------------
  // Happy path — scan() is called with the expected options
  // -------------------------------------------------------------------------

  it("calls scan() with enabled:true, log:false, showToolbar:true on first call", async () => {
    const { initReactScanDev } = await import("@/platform/perf/react-scan-dev");
    initReactScanDev();
    await flush();

    expect(mockScan).toHaveBeenCalledOnce();
    expect(mockScan).toHaveBeenCalledWith({
      enabled: true,
      log: false,
      showToolbar: true,
    });
  });

  // -------------------------------------------------------------------------
  // Idempotent / started guard
  // -------------------------------------------------------------------------

  it("is idempotent: a second call is a no-op (started guard)", async () => {
    const { initReactScanDev } = await import("@/platform/perf/react-scan-dev");
    initReactScanDev();
    initReactScanDev(); // second call must be a no-op
    await flush();

    // scan() should still only be called once from the first invocation
    expect(mockScan).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // SSR guard (window === undefined)
  // -------------------------------------------------------------------------

  it("is a no-op when window is undefined (SSR guard)", async () => {
    const originalWindow = globalThis.window;
    // @ts-expect-error — intentionally set to undefined to simulate SSR
    globalThis.window = undefined;

    try {
      const { initReactScanDev } = await import("@/platform/perf/react-scan-dev");
      initReactScanDev();
      await flush();

      expect(mockScan).not.toHaveBeenCalled();
    } finally {
      globalThis.window = originalWindow;
    }
  });

  // -------------------------------------------------------------------------
  // Production guard (NODE_ENV === "production")
  // -------------------------------------------------------------------------

  it("is a no-op when NODE_ENV is production", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    try {
      const { initReactScanDev } = await import("@/platform/perf/react-scan-dev");
      initReactScanDev();
      await flush();

      expect(mockScan).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  // -------------------------------------------------------------------------
  // Catch block — react-scan import rejects (error must be swallowed silently)
  // -------------------------------------------------------------------------

  it("swallows import failure without throwing (catch block)", async () => {
    // Make scan() throw to simulate a failure inside the .then() callback,
    // which causes the promise chain to reject — the .catch() in the source
    // swallows it. This exercises the catch branch.
    mockScan.mockImplementationOnce(() => {
      throw new Error("react-scan scan() failed");
    });

    const { initReactScanDev } = await import("@/platform/perf/react-scan-dev");

    await expect(
      (async () => {
        initReactScanDev();
        await flush();
      })(),
    ).resolves.toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Verify scan() runs when NODE_ENV is 'test' (not production),
  // confirming the guard is specifically for "production" only.
  // -------------------------------------------------------------------------

  it("runs scan() when NODE_ENV is 'test' (not production)", async () => {
    // Default vitest NODE_ENV is "test"
    expect(process.env.NODE_ENV).not.toBe("production");

    const { initReactScanDev } = await import("@/platform/perf/react-scan-dev");
    initReactScanDev();
    await flush();

    expect(mockScan).toHaveBeenCalledOnce();
  });
});
