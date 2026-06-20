import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ZodType } from "zod";

/**
 * Unit tests for the InferenceScheduler.
 *
 * The scheduler is the performance heart of the swarm: a serialized LLM lane
 * (concurrency 1) plus a parallel IO lane. We mock the unified AI provider
 * boundary entirely (`pickDefaultProvider`) and exercise the REAL queueing,
 * ordering, stats accounting, structured-retry, and abort logic. No model,
 * network, or DuckDB is touched.
 */

// ── Provider boundary mock ───────────────────────────────────────────────────
const pickDefaultProvider = vi.fn();

// `vi.mock` is hoisted above the file body, so the factory must not reference
// module-scope `const`s. Declare the error class INSIDE the factory and re-import
// it through the mocked module below.
vi.mock("@/platform/ai/provider", () => {
  class AIUnavailableError extends Error {
    constructor(
      readonly provider: string,
      detail?: string,
    ) {
      super(`AI provider "${provider}" is not available${detail ? `: ${detail}` : ""}.`);
      this.name = "AIUnavailableError";
    }
  }
  return {
    pickDefaultProvider: (...args: unknown[]) => pickDefaultProvider(...args),
    AIUnavailableError,
  };
});

// Import AFTER the mock is registered.
import { AIUnavailableError } from "@/platform/ai/provider";
import { InferenceScheduler } from "@/features/data-formulator/core/swarm/scheduler";

/** A controllable fake provider with spy-able generate/generateStructured. */
function fakeProvider(overrides: Record<string, unknown> = {}) {
  return {
    id: "llamacpp",
    label: "Llama",
    capabilities: {},
    isAvailable: vi.fn().mockResolvedValue(true),
    listModels: vi.fn().mockResolvedValue([]),
    ensureReady: vi.fn().mockResolvedValue(undefined),
    generate: vi.fn().mockResolvedValue({ text: "ok", model: "m", provider: "llamacpp" }),
    generateStructured: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  };
}

/** Manual deferred promise helper. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const stubSchema = {} as unknown as ZodType<unknown>;

/** Drain the microtask + timer queue so async scheduler internals settle. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  pickDefaultProvider.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("InferenceScheduler.provider / isReady", () => {
  it("resolves and caches the provider, calling pickDefaultProvider once", async () => {
    const provider = fakeProvider();
    pickDefaultProvider.mockResolvedValue(provider);
    const scheduler = new InferenceScheduler();

    const a = await scheduler.provider();
    const b = await scheduler.provider();

    expect(a).toBe(b);
    expect(pickDefaultProvider).toHaveBeenCalledTimes(1);
  });

  it("passes the preferProvider option through to pickDefaultProvider", async () => {
    const provider = fakeProvider();
    pickDefaultProvider.mockResolvedValue(provider);
    const scheduler = new InferenceScheduler({ preferProvider: "webllm" as never });

    await scheduler.provider();

    expect(pickDefaultProvider).toHaveBeenCalledWith("webllm");
  });

  it("throws AIUnavailableError when the provider reports it is not available", async () => {
    const provider = fakeProvider({ isAvailable: vi.fn().mockResolvedValue(false) });
    pickDefaultProvider.mockResolvedValue(provider);
    const scheduler = new InferenceScheduler();

    await expect(scheduler.provider()).rejects.toBeInstanceOf(AIUnavailableError);
  });

  it("isReady returns true when a provider is available", async () => {
    pickDefaultProvider.mockResolvedValue(fakeProvider());
    const scheduler = new InferenceScheduler();

    await expect(scheduler.isReady()).resolves.toBe(true);
  });

  it("isReady returns false (never throws) when no provider is available", async () => {
    pickDefaultProvider.mockResolvedValue(
      fakeProvider({ isAvailable: vi.fn().mockResolvedValue(false) }),
    );
    const scheduler = new InferenceScheduler();

    await expect(scheduler.isReady()).resolves.toBe(false);
  });

  it("isReady returns false when provider selection itself rejects", async () => {
    pickDefaultProvider.mockRejectedValue(new Error("registry boom"));
    const scheduler = new InferenceScheduler();

    await expect(scheduler.isReady()).resolves.toBe(false);
  });
});

describe("InferenceScheduler.generate (serialized LLM lane)", () => {
  it("returns the provider's text and binds the run abort signal", async () => {
    const provider = fakeProvider();
    pickDefaultProvider.mockResolvedValue(provider);
    const scheduler = new InferenceScheduler();

    const text = await scheduler.generate({ model: "m", prompt: "hi" });

    expect(text).toBe("ok");
    expect(provider.generate).toHaveBeenCalledTimes(1);
    const passed = provider.generate.mock.calls[0][0];
    expect(passed.signal).toBe(scheduler.signal);
    expect(passed.prompt).toBe("hi");
  });

  it("runs LLM calls one-at-a-time in arrival order (concurrency 1)", async () => {
    const order: string[] = [];
    const gates = [deferred<{ text: string }>(), deferred<{ text: string }>()];
    let started = 0;
    const provider = fakeProvider({
      generate: vi.fn((req: { prompt: string }) => {
        order.push(`start:${req.prompt}`);
        const gate = gates[started];
        started += 1;
        return gate.promise;
      }),
    });
    pickDefaultProvider.mockResolvedValue(provider);
    const scheduler = new InferenceScheduler();

    const p1 = scheduler.generate({ model: "m", prompt: "A" });
    const p2 = scheduler.generate({ model: "m", prompt: "B" });
    await flush();

    // Only the first call may have started while the lane is busy.
    expect(order).toEqual(["start:A"]);

    gates[0].resolve({ text: "ra" });
    await p1;
    await flush();
    expect(order).toEqual(["start:A", "start:B"]);

    gates[1].resolve({ text: "rb" });
    await p2;
    expect(provider.generate).toHaveBeenCalledTimes(2);
  });

  it("accumulates llmCalls and non-negative llmMs stats", async () => {
    pickDefaultProvider.mockResolvedValue(fakeProvider());
    const scheduler = new InferenceScheduler();

    await scheduler.generate({ model: "m", prompt: "1" });
    await scheduler.generate({ model: "m", prompt: "2" });

    expect(scheduler.stats.llmCalls).toBe(2);
    expect(scheduler.stats.llmMs).toBeGreaterThanOrEqual(0);
  });

  it("counts the LLM call even when generation rejects", async () => {
    const provider = fakeProvider({
      generate: vi.fn().mockRejectedValue(new Error("inference failed")),
    });
    pickDefaultProvider.mockResolvedValue(provider);
    const scheduler = new InferenceScheduler();

    await expect(scheduler.generate({ model: "m", prompt: "x" })).rejects.toThrow(
      "inference failed",
    );
    expect(scheduler.stats.llmCalls).toBe(1);
  });
});

describe("InferenceScheduler.generateStructured (retry resilience)", () => {
  it("returns the parsed object on first success without retrying", async () => {
    const generateStructured = vi.fn().mockResolvedValue({ value: 42 });
    pickDefaultProvider.mockResolvedValue(fakeProvider({ generateStructured }));
    const scheduler = new InferenceScheduler();

    const out = await scheduler.generateStructured({ model: "m", prompt: "p" }, stubSchema);

    expect(out).toEqual({ value: 42 });
    expect(generateStructured).toHaveBeenCalledTimes(1);
  });

  it("retries transient invalid output up to 3 attempts then succeeds", async () => {
    const generateStructured = vi
      .fn()
      .mockRejectedValueOnce(new Error("Unexpected end of JSON input"))
      .mockRejectedValueOnce(new Error("schema repair failed"))
      .mockResolvedValueOnce({ recovered: true });
    pickDefaultProvider.mockResolvedValue(fakeProvider({ generateStructured }));
    const scheduler = new InferenceScheduler();

    const out = await scheduler.generateStructured({ model: "m", prompt: "p" }, stubSchema);

    expect(out).toEqual({ recovered: true });
    expect(generateStructured).toHaveBeenCalledTimes(3);
  });

  it("throws the last error after exhausting all 3 attempts", async () => {
    const generateStructured = vi.fn().mockRejectedValue(new Error("always bad"));
    pickDefaultProvider.mockResolvedValue(fakeProvider({ generateStructured }));
    const scheduler = new InferenceScheduler();

    await expect(
      scheduler.generateStructured({ model: "m", prompt: "p" }, stubSchema),
    ).rejects.toThrow("always bad");
    expect(generateStructured).toHaveBeenCalledTimes(3);
  });

  it("still increments llmCalls exactly once per structured request despite retries", async () => {
    const generateStructured = vi
      .fn()
      .mockRejectedValueOnce(new Error("bad"))
      .mockResolvedValueOnce({ ok: 1 });
    pickDefaultProvider.mockResolvedValue(fakeProvider({ generateStructured }));
    const scheduler = new InferenceScheduler();

    await scheduler.generateStructured({ model: "m", prompt: "p" }, stubSchema);

    expect(scheduler.stats.llmCalls).toBe(1);
  });

  it("stops retrying immediately once the run is aborted", async () => {
    const scheduler = new InferenceScheduler();
    const generateStructured = vi.fn(() => {
      // Abort mid-flight, then fail: the loop must not retry after abort.
      scheduler.cancel();
      return Promise.reject(new Error("aborted mid-call"));
    });
    pickDefaultProvider.mockResolvedValue(fakeProvider({ generateStructured }));

    await expect(
      scheduler.generateStructured({ model: "m", prompt: "p" }, stubSchema),
    ).rejects.toThrow("aborted mid-call");
    expect(generateStructured).toHaveBeenCalledTimes(1);
  });

  it("throws 'Run aborted.' without calling the provider when pre-aborted", async () => {
    const generateStructured = vi.fn();
    pickDefaultProvider.mockResolvedValue(fakeProvider({ generateStructured }));
    const scheduler = new InferenceScheduler();
    scheduler.cancel();

    await expect(
      scheduler.generateStructured({ model: "m", prompt: "p" }, stubSchema),
    ).rejects.toThrow("Run aborted.");
    expect(generateStructured).not.toHaveBeenCalled();
  });
});

describe("InferenceScheduler abort signal", () => {
  it("exposes a non-aborted signal initially and aborts it on cancel", () => {
    pickDefaultProvider.mockResolvedValue(fakeProvider());
    const scheduler = new InferenceScheduler();

    expect(scheduler.signal.aborted).toBe(false);
    scheduler.cancel();
    expect(scheduler.signal.aborted).toBe(true);
  });
});

describe("InferenceScheduler IO lane", () => {
  it("runs an IO task and counts it in stats", async () => {
    pickDefaultProvider.mockResolvedValue(fakeProvider());
    const scheduler = new InferenceScheduler();

    const result = await scheduler.io(async () => 7);

    expect(result).toBe(7);
    expect(scheduler.stats.ioTasks).toBe(1);
  });

  it("counts an IO task even when its factory rejects", async () => {
    pickDefaultProvider.mockResolvedValue(fakeProvider());
    const scheduler = new InferenceScheduler();

    await expect(scheduler.io(async () => Promise.reject(new Error("io boom")))).rejects.toThrow(
      "io boom",
    );
    expect(scheduler.stats.ioTasks).toBe(1);
  });

  it("respects ioConcurrency, capping simultaneous in-flight IO tasks", async () => {
    pickDefaultProvider.mockResolvedValue(fakeProvider());
    const scheduler = new InferenceScheduler({ ioConcurrency: 2 });
    let active = 0;
    let peak = 0;
    const gates = [deferred<void>(), deferred<void>(), deferred<void>()];

    const task = (i: number) =>
      scheduler.io(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await gates[i].promise;
        active -= 1;
      });

    const all = Promise.all([task(0), task(1), task(2)]);
    await flush();

    // With concurrency 2 only two may run before any gate opens.
    expect(peak).toBe(2);

    gates[0].resolve();
    gates[1].resolve();
    gates[2].resolve();
    await all;
    expect(peak).toBe(2);
  });

  it("clamps a zero/negative ioConcurrency up to at least 1", async () => {
    pickDefaultProvider.mockResolvedValue(fakeProvider());
    const scheduler = new InferenceScheduler({ ioConcurrency: 0 });
    let active = 0;
    let peak = 0;
    const gates = [deferred<void>(), deferred<void>()];

    const task = (i: number) =>
      scheduler.io(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await gates[i].promise;
        active -= 1;
      });

    const all = Promise.all([task(0), task(1)]);
    await flush();

    expect(peak).toBe(1);
    gates[0].resolve();
    gates[1].resolve();
    await all;
  });

  it("ioMap preserves input order even when later tasks resolve first", async () => {
    pickDefaultProvider.mockResolvedValue(fakeProvider());
    const scheduler = new InferenceScheduler({ ioConcurrency: 4 });

    const out = await scheduler.ioMap([10, 20, 30], async (n, i) => `${i}:${n * 2}`);

    expect(out).toEqual(["0:20", "1:40", "2:60"]);
    expect(scheduler.stats.ioTasks).toBe(3);
  });

  it("ioMap returns an empty array for empty input without running tasks", async () => {
    pickDefaultProvider.mockResolvedValue(fakeProvider());
    const scheduler = new InferenceScheduler();

    const out = await scheduler.ioMap<number, number>([], async (n) => n);

    expect(out).toEqual([]);
    expect(scheduler.stats.ioTasks).toBe(0);
  });
});

describe("InferenceScheduler.ensureReady", () => {
  it("delegates to the provider and forwards progress + abort signal", async () => {
    const ensureReady = vi.fn(
      (
        model: string,
        onProgress?: (p: { progress: number; message?: string }) => void,
        signal?: AbortSignal,
      ) => {
        void model;
        void signal;
        onProgress?.({ progress: 0.5, message: "halfway" });
        return Promise.resolve();
      },
    );
    pickDefaultProvider.mockResolvedValue(fakeProvider({ ensureReady }));
    const scheduler = new InferenceScheduler();
    const progress: Array<[number, string]> = [];

    await scheduler.ensureReady("model-x", (p, m) => progress.push([p, m]));

    expect(ensureReady).toHaveBeenCalledTimes(1);
    expect(ensureReady.mock.calls[0][0]).toBe("model-x");
    expect(ensureReady.mock.calls[0][2]).toBe(scheduler.signal);
    expect(progress).toEqual([[0.5, "halfway"]]);
  });

  it("supplies a default progress message when the provider omits one", async () => {
    const ensureReady = vi.fn(
      (_m: string, onProgress?: (p: { progress: number; message?: string }) => void) => {
        onProgress?.({ progress: 0.2 });
        return Promise.resolve();
      },
    );
    pickDefaultProvider.mockResolvedValue(fakeProvider({ ensureReady }));
    const scheduler = new InferenceScheduler();
    const messages: string[] = [];

    await scheduler.ensureReady("m", (_p, msg) => messages.push(msg));

    expect(messages[0]).toMatch(/Loading the model/);
  });
});
