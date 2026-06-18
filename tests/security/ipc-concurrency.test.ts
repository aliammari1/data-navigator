import { describe, expect, it, vi } from "vitest";
import {
  ConcurrencyLimitError,
  type ConcurrencyLimiter,
  TaskTimeoutError,
  createConcurrencyLimiter,
  runBounded,
  withTimeout,
} from "../../electron/ipc-concurrency";

/**
 * DoS-bounding tests for the heavy DuckDB IPC channels. A regression here lets a
 * compromised/flooding renderer exhaust main-process resources (read
 * connections, threads, memory) — defense-in-depth alongside the trusted-sender
 * and SQL guards.
 */

/** A deferred promise whose resolution we control from the test. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createConcurrencyLimiter", () => {
  it("runs up to maxConcurrent tasks simultaneously", async () => {
    // Arrange
    const limiter = createConcurrencyLimiter({ label: "q", maxConcurrent: 2, maxQueue: 10 });
    const a = deferred<string>();
    const b = deferred<string>();

    // Act
    const p1 = limiter.run(() => a.promise);
    const p2 = limiter.run(() => b.promise);

    // Assert
    expect(limiter.stats().active).toBe(2);
    expect(limiter.stats().queued).toBe(0);

    a.resolve("a");
    b.resolve("b");
    await expect(p1).resolves.toBe("a");
    await expect(p2).resolves.toBe("b");
  });

  it("queues tasks beyond maxConcurrent and drains them as slots free up", async () => {
    // Arrange
    const limiter = createConcurrencyLimiter({ label: "q", maxConcurrent: 1, maxQueue: 5 });
    const a = deferred<string>();
    const b = deferred<string>();

    // Act
    const p1 = limiter.run(() => a.promise);
    const p2 = limiter.run(() => b.promise);

    // Assert: only one active, the second is queued.
    expect(limiter.stats().active).toBe(1);
    expect(limiter.stats().queued).toBe(1);

    a.resolve("a");
    await expect(p1).resolves.toBe("a");

    // Now the queued task is promoted.
    b.resolve("b");
    await expect(p2).resolves.toBe("b");
    expect(limiter.stats().active).toBe(0);
    expect(limiter.stats().queued).toBe(0);
  });

  it("rejects fast with ConcurrencyLimitError when the queue is saturated", async () => {
    // Arrange: 1 slot, queue depth 1 => max 2 outstanding.
    const limiter = createConcurrencyLimiter({ label: "flood", maxConcurrent: 1, maxQueue: 1 });
    const blocker = deferred<void>();

    // Act
    const running = limiter.run(() => blocker.promise); // occupies the slot
    const queued = limiter.run(() => Promise.resolve("queued")); // fills the queue
    const overflow = limiter.run(() => Promise.resolve("overflow")); // rejected

    // Assert
    await expect(overflow).rejects.toBeInstanceOf(ConcurrencyLimitError);
    await expect(overflow).rejects.toMatchObject({ code: "E_CONCURRENCY_LIMIT" });

    blocker.resolve();
    await running;
    await expect(queued).resolves.toBe("queued");
  });

  it("releases a slot even when a task rejects", async () => {
    // Arrange
    const limiter = createConcurrencyLimiter({ label: "q", maxConcurrent: 1, maxQueue: 0 });

    // Act + Assert
    await expect(limiter.run(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    // Slot must be freed so the next task can run.
    await expect(limiter.run(() => Promise.resolve("ok"))).resolves.toBe("ok");
    expect(limiter.stats().active).toBe(0);
  });

  it("clamps invalid options to safe minimums", () => {
    const limiter = createConcurrencyLimiter({ label: "q", maxConcurrent: 0, maxQueue: -5 });
    const stats = limiter.stats();
    expect(stats.maxConcurrent).toBeGreaterThanOrEqual(1);
    expect(stats.maxQueue).toBeGreaterThanOrEqual(0);
  });
});

describe("withTimeout", () => {
  it("resolves with the task value when it finishes before the deadline", async () => {
    const result = await withTimeout(async () => "done", { label: "fast", timeoutMs: 1000 });
    expect(result).toBe("done");
  });

  it("rejects with TaskTimeoutError and aborts the signal when the deadline elapses", async () => {
    vi.useFakeTimers();
    try {
      // Arrange: a task that never settles on its own but watches the signal.
      let aborted = false;
      const promise = withTimeout(
        (signal) =>
          new Promise<never>(() => {
            signal.addEventListener("abort", () => {
              aborted = true;
            });
          }),
        { label: "slow", timeoutMs: 50 },
      );
      const assertion = expect(promise).rejects.toBeInstanceOf(TaskTimeoutError);

      // Act
      await vi.advanceTimersByTimeAsync(50);

      // Assert
      await assertion;
      expect(aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not reject after the task already resolved (timer cleared)", async () => {
    vi.useFakeTimers();
    try {
      const promise = withTimeout(async () => "ok", { label: "race", timeoutMs: 10 });
      await expect(promise).resolves.toBe("ok");
      // Advancing past the deadline must not produce an unhandled rejection.
      await vi.advanceTimersByTimeAsync(100);
    } finally {
      vi.useRealTimers();
    }
  });

  it("runs without a deadline when timeoutMs is non-positive", async () => {
    await expect(withTimeout(async () => 42, { label: "none", timeoutMs: 0 })).resolves.toBe(42);
  });
});

describe("runBounded", () => {
  it("applies both the limiter and the timeout", async () => {
    const limiter: ConcurrencyLimiter = createConcurrencyLimiter({
      label: "bounded",
      maxConcurrent: 2,
      maxQueue: 4,
    });
    const value = await runBounded(limiter, async () => "v", { label: "bounded", timeoutMs: 1000 });
    expect(value).toBe("v");
    expect(limiter.stats().active).toBe(0);
  });

  it("rejects when the limiter queue is saturated before the task ever starts", async () => {
    const limiter = createConcurrencyLimiter({ label: "bounded", maxConcurrent: 1, maxQueue: 0 });
    const blocker = deferred<void>();
    const running = runBounded(limiter, () => blocker.promise, {
      label: "bounded",
      timeoutMs: 1000,
    });
    const overflow = runBounded(limiter, async () => "x", { label: "bounded", timeoutMs: 1000 });

    await expect(overflow).rejects.toBeInstanceOf(ConcurrencyLimitError);
    blocker.resolve();
    await running;
  });
});
