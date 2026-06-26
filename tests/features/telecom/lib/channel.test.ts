import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for src/features/telecom/lib/channel.ts
 *
 * The module holds a module-level `_bc` singleton.  We use vi.resetModules()
 * and dynamic re-import inside each test group so every test starts with a
 * fresh module instance (and therefore a fresh `_bc = null`).
 *
 * When BroadcastChannel is available we replace the global with a class-based
 * stub (vi.fn() called as a constructor needs 'new' semantics, so we use a
 * real class or a stub function with a prototype).
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal BroadcastChannel stub returned by the constructor. */
function makeFakeBCInstance() {
  return {
    postMessage: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    close: vi.fn(),
  };
}

type FakeBCInstance = ReturnType<typeof makeFakeBCInstance>;

/**
 * Build a class-shaped BroadcastChannel stub.
 * `instances` accumulates every constructed instance for inspection.
 */
function makeFakeBCClass(instances: FakeBCInstance[]) {
  class FakeBroadcastChannel {
    postMessage: ReturnType<typeof vi.fn>;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;

    constructor(_name: string) {
      this.postMessage = vi.fn();
      this.addEventListener = vi.fn();
      this.removeEventListener = vi.fn();
      this.close = vi.fn();
      // push `this` so callers can inspect what was created
      instances.push(this as unknown as FakeBCInstance);
    }
  }
  return FakeBroadcastChannel;
}

// ---------------------------------------------------------------------------
// getBC / broadcast / onBroadcast — BroadcastChannel AVAILABLE
// ---------------------------------------------------------------------------

describe("channel — BroadcastChannel available", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("broadcast posts the message to the channel", async () => {
    const instances: FakeBCInstance[] = [];
    vi.stubGlobal("BroadcastChannel", makeFakeBCClass(instances));

    const { broadcast } = await import("@/features/telecom/lib/channel");

    const msg = { type: "FILE_LOADED" as const, fileName: "test.csv", reportDate: "2024-01-01" };
    broadcast(msg);

    expect(instances).toHaveLength(1);
    expect(instances[0]!.postMessage).toHaveBeenCalledWith(msg);
  });

  it("broadcast reuses the same BroadcastChannel instance on subsequent calls", async () => {
    const instances: FakeBCInstance[] = [];
    vi.stubGlobal("BroadcastChannel", makeFakeBCClass(instances));

    const { broadcast } = await import("@/features/telecom/lib/channel");

    broadcast({ type: "FILE_LOADED", fileName: "a.csv", reportDate: "2024-01-01" });
    broadcast({ type: "FILE_LOADED", fileName: "b.csv", reportDate: "2024-01-02" });

    // Constructor called only once — singleton (_bc) reuse
    expect(instances).toHaveLength(1);
    expect(instances[0]!.postMessage).toHaveBeenCalledTimes(2);
  });

  it("broadcast works for FILTER_CHANGE messages", async () => {
    const instances: FakeBCInstance[] = [];
    vi.stubGlobal("BroadcastChannel", makeFakeBCClass(instances));

    const { broadcast } = await import("@/features/telecom/lib/channel");

    const msg = {
      type: "FILTER_CHANGE" as const,
      filter: {
        status: "SUCCESS",
        canal: "all",
        region: "",
        operator: "",
        search: "",
        minAmount: "",
        maxAmount: "",
        hourFrom: "",
        hourTo: "",
      },
    };
    broadcast(msg);
    expect(instances[0]!.postMessage).toHaveBeenCalledWith(msg);
  });

  it("broadcast works for MAPPING_CHANGE messages", async () => {
    const instances: FakeBCInstance[] = [];
    vi.stubGlobal("BroadcastChannel", makeFakeBCClass(instances));

    const { broadcast } = await import("@/features/telecom/lib/channel");

    const mapping = {
      transactionId: "id",
      transactionDate: "date",
      transactionTime: "time",
      canal: "canal",
      serviceCode: "code",
      serviceName: "name",
      transactionType: "type",
      subscriberType: "sub",
      msisdn: "msisdn",
      amount: "amount",
      status: "status",
      errorCode: "errCode",
      errorMessage: "errMsg",
      operator: "op",
      region: "reg",
      processingTimeMs: "ms",
      previousBalance: "prev",
      newBalance: "new",
      totalAmount: "total",
      retryCount: "retry",
    };
    const msg = { type: "MAPPING_CHANGE" as const, mapping };
    broadcast(msg);
    expect(instances[0]!.postMessage).toHaveBeenCalledWith(msg);
  });

  it("broadcast works for ANALYTICS_READY messages", async () => {
    const instances: FakeBCInstance[] = [];
    vi.stubGlobal("BroadcastChannel", makeFakeBCClass(instances));

    const { broadcast } = await import("@/features/telecom/lib/channel");

    const msg = {
      type: "ANALYTICS_READY" as const,
      fileName: "data.csv",
      successRate: 98.5,
      totalTx: 10000,
    };
    broadcast(msg);
    expect(instances[0]!.postMessage).toHaveBeenCalledWith(msg);
  });

  it("onBroadcast registers a message listener and returns a cleanup function", async () => {
    const instances: FakeBCInstance[] = [];
    vi.stubGlobal("BroadcastChannel", makeFakeBCClass(instances));

    const { onBroadcast } = await import("@/features/telecom/lib/channel");

    const handler = vi.fn();
    const cleanup = onBroadcast(handler);

    const bc = instances[0]!;
    expect(bc.addEventListener).toHaveBeenCalledWith("message", expect.any(Function));

    // Simulate an incoming broadcast message by invoking the registered listener
    const registeredListener = (bc.addEventListener as ReturnType<typeof vi.fn>).mock.calls[0][1] as (
      e: MessageEvent,
    ) => void;

    const incomingMsg = {
      type: "FILE_LOADED" as const,
      fileName: "x.csv",
      reportDate: "2024-06-01",
    };
    registeredListener({ data: incomingMsg } as MessageEvent);

    expect(handler).toHaveBeenCalledWith(incomingMsg);

    // Cleanup removes the same listener reference
    cleanup();
    expect(bc.removeEventListener).toHaveBeenCalledWith("message", registeredListener);
  });

  it("onBroadcast forwards every BroadcastMsg variant to the handler", async () => {
    const instances: FakeBCInstance[] = [];
    vi.stubGlobal("BroadcastChannel", makeFakeBCClass(instances));

    const { onBroadcast } = await import("@/features/telecom/lib/channel");

    const received: unknown[] = [];
    onBroadcast((msg) => received.push(msg));

    const bc = instances[0]!;
    const registeredListener = (bc.addEventListener as ReturnType<typeof vi.fn>).mock.calls[0][1] as (
      e: MessageEvent,
    ) => void;

    const msgs = [
      { type: "FILE_LOADED" as const, fileName: "a.csv", reportDate: "2024-01-01" },
      {
        type: "FILTER_CHANGE" as const,
        filter: {
          status: "",
          canal: "",
          region: "",
          operator: "",
          search: "",
          minAmount: "",
          maxAmount: "",
          hourFrom: "",
          hourTo: "",
        },
      },
      {
        type: "ANALYTICS_READY" as const,
        fileName: "a.csv",
        successRate: 99,
        totalTx: 5000,
      },
    ];

    for (const m of msgs) {
      registeredListener({ data: m } as MessageEvent);
    }

    expect(received).toHaveLength(3);
    expect(received[0]).toEqual(msgs[0]);
    expect(received[1]).toEqual(msgs[1]);
    expect(received[2]).toEqual(msgs[2]);
  });
});

// ---------------------------------------------------------------------------
// getBC / broadcast / onBroadcast — BroadcastChannel UNDEFINED
// ---------------------------------------------------------------------------

describe("channel — BroadcastChannel undefined", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("broadcast is a no-op when BroadcastChannel is not available", async () => {
    vi.stubGlobal("BroadcastChannel", undefined);

    const { broadcast } = await import("@/features/telecom/lib/channel");

    // Must not throw
    expect(() =>
      broadcast({ type: "FILE_LOADED", fileName: "x.csv", reportDate: "2024-01-01" }),
    ).not.toThrow();
  });

  it("onBroadcast returns an empty cleanup function when BroadcastChannel is not available", async () => {
    vi.stubGlobal("BroadcastChannel", undefined);

    const { onBroadcast } = await import("@/features/telecom/lib/channel");

    const handler = vi.fn();
    const cleanup = onBroadcast(handler);

    // Should be a no-op function that does not throw
    expect(typeof cleanup).toBe("function");
    expect(() => cleanup()).not.toThrow();

    // Handler should never be called because there is no channel
    expect(handler).not.toHaveBeenCalled();
  });

  it("getBC returns null (both exported functions degrade gracefully)", async () => {
    vi.stubGlobal("BroadcastChannel", undefined);

    const { broadcast, onBroadcast } = await import("@/features/telecom/lib/channel");

    expect(() =>
      broadcast({
        type: "ANALYTICS_READY",
        fileName: "y.csv",
        successRate: 0,
        totalTx: 0,
      }),
    ).not.toThrow();

    const cleanup = onBroadcast(vi.fn());
    expect(typeof cleanup).toBe("function");
    expect(() => cleanup()).not.toThrow();
  });
});
