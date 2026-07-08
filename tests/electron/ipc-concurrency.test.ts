import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ConcurrencyLimitError,
  TaskTimeoutError,
  createConcurrencyLimiter,
  withTimeout,
  runBounded,
  type ConcurrencyLimiter,
  type LimiterStats,
  type WithTimeoutOptions,
} from "../../electron/ipc-concurrency";

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

// ─────────────────────────────────────────────────────────────────────────────
// ConcurrencyLimitError
// ─────────────────────────────────────────────────────────────────────────────
describe("ConcurrencyLimitError", () => {
  it("has code E_CONCURRENCY_LIMIT and name ConcurrencyLimitError", () => {
    const err = new ConcurrencyLimitError("myLabel", 3, 10);
    expect(err.code).toBe("E_CONCURRENCY_LIMIT");
    expect(err.name).toBe("ConcurrencyLimitError");
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("myLabel");
    expect(err.message).toContain("3");
    expect(err.message).toContain("10");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TaskTimeoutError
// ─────────────────────────────────────────────────────────────────────────────
describe("TaskTimeoutError", () => {
  it("has code E_TASK_TIMEOUT and name TaskTimeoutError", () => {
    const err = new TaskTimeoutError("myOp", 5000);
    expect(err.code).toBe("E_TASK_TIMEOUT");
    expect(err.name).toBe("TaskTimeoutError");
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("myOp");
    expect(err.message).toContain("5000");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createConcurrencyLimiter
// ─────────────────────────────────────────────────────────────────────────────
describe("createConcurrencyLimiter", () => {
  it("runs a single task and returns its value", async () => {
    const limiter = createConcurrencyLimiter({ label: "test", maxConcurrent: 2, maxQueue: 4 });
    const result = await limiter.run(() => Promise.resolve(42));
    expect(result).toBe(42);
  });

  it("reports correct stats", () => {
    const limiter = createConcurrencyLimiter({ label: "stats", maxConcurrent: 3, maxQueue: 6 });
    const stats: LimiterStats = limiter.stats();
    expect(stats.label).toBe("stats");
    expect(stats.active).toBe(0);
    expect(stats.queued).toBe(0);
    expect(stats.maxConcurrent).toBe(3);
    expect(stats.maxQueue).toBe(6);
  });

  it("defaults maxQueue to maxConcurrent * 4 when undefined", () => {
    const limiter = createConcurrencyLimiter({ label: "q", maxConcurrent: 3 });
    expect(limiter.stats().maxQueue).toBe(12);
  });

  it("clamps maxConcurrent to at least 1", () => {
    const limiter = createConcurrencyLimiter({ label: "q", maxConcurrent: 0 });
    expect(limiter.stats().maxConcurrent).toBe(1);
  });

  it("clamps maxQueue to at least 0", () => {
    const limiter = createConcurrencyLimiter({ label: "q", maxConcurrent: 2, maxQueue: -5 });
    expect(limiter.stats().maxQueue).toBe(0);
  });

  it("runs up to maxConcurrent tasks simultaneously", async () => {
    const limiter = createConcurrencyLimiter({ label: "q", maxConcurrent: 2, maxQueue: 10 });
    const a = deferred<string>();
    const b = deferred<string>();

    const p1 = limiter.run(() => a.promise);
    const p2 = limiter.run(() => b.promise);

    expect(limiter.stats().active).toBe(2);
    expect(limiter.stats().queued).toBe(0);

    a.resolve("a");
    b.resolve("b");
    await expect(p1).resolves.toBe("a");
    await expect(p2).resolves.toBe("b");
  });

  it("queues tasks beyond maxConcurrent and drains them as slots free", async () => {
    const limiter = createConcurrencyLimiter({ label: "q", maxConcurrent: 1, maxQueue: 5 });
    const a = deferred<string>();
    const b = deferred<string>();

    const p1 = limiter.run(() => a.promise);
    const p2 = limiter.run(() => b.promise);

    expect(limiter.stats().active).toBe(1);
    expect(limiter.stats().queued).toBe(1);

    a.resolve("done-a");
    await expect(p1).resolves.toBe("done-a");

    b.resolve("done-b");
    await expect(p2).resolves.toBe("done-b");
    expect(limiter.stats().active).toBe(0);
    expect(limiter.stats().queued).toBe(0);
  });

  it("release() does not start a next task when the queue is empty", async () => {
    // Arrange: single slot, no queue (release with empty queue = next === undefined branch)
    const limiter = createConcurrencyLimiter({ label: "q", maxConcurrent: 1, maxQueue: 0 });

    // Run the one task — when it finishes, queue.shift() returns undefined (falsy branch)
    await expect(limiter.run(() => Promise.resolve("solo"))).resolves.toBe("solo");
    expect(limiter.stats().active).toBe(0);
    expect(limiter.stats().queued).toBe(0);
  });

  it("rejects fast with ConcurrencyLimitError when the queue is full", async () => {
    const limiter = createConcurrencyLimiter({ label: "flood", maxConcurrent: 1, maxQueue: 1 });
    const blocker = deferred<void>();

    const running = limiter.run(() => blocker.promise);
    const queued = limiter.run(() => Promise.resolve("q"));
    const overflow = limiter.run(() => Promise.resolve("overflow"));

    await expect(overflow).rejects.toBeInstanceOf(ConcurrencyLimitError);
    await expect(overflow).rejects.toMatchObject({ code: "E_CONCURRENCY_LIMIT" });

    blocker.resolve();
    await running;
    await expect(queued).resolves.toBe("q");
  });

  it("releases the slot when a task rejects, allowing subsequent tasks to run", async () => {
    const limiter = createConcurrencyLimiter({ label: "q", maxConcurrent: 1, maxQueue: 0 });

    await expect(limiter.run(() => Promise.reject(new Error("task failed")))).rejects.toThrow(
      "task failed",
    );
    // Slot must be freed
    await expect(limiter.run(() => Promise.resolve("ok"))).resolves.toBe("ok");
    expect(limiter.stats().active).toBe(0);
  });

  it("queued task propagates rejection from the queued task itself", async () => {
    const limiter = createConcurrencyLimiter({ label: "q", maxConcurrent: 1, maxQueue: 5 });
    const blocker = deferred<void>();
    const inner = deferred<string>();

    const p1 = limiter.run(() => blocker.promise);
    const p2 = limiter.run(() => inner.promise);

    expect(limiter.stats().queued).toBe(1);

    // Release the slot
    blocker.resolve();
    await p1;

    // Now the queued task runs and rejects
    inner.reject(new Error("queued-rejection"));
    await expect(p2).rejects.toThrow("queued-rejection");
    expect(limiter.stats().active).toBe(0);
  });

  it("handles maxQueue === 0 (no queue, immediate overflow)", async () => {
    const limiter = createConcurrencyLimiter({ label: "q", maxConcurrent: 1, maxQueue: 0 });
    const blocker = deferred<void>();

    const running = limiter.run(() => blocker.promise);
    const overflow = limiter.run(() => Promise.resolve("x"));

    await expect(overflow).rejects.toBeInstanceOf(ConcurrencyLimitError);
    blocker.resolve();
    await running;
  });

  it("floors fractional maxConcurrent via Math.floor", () => {
    // 1.9 → floor → 1
    const limiter = createConcurrencyLimiter({ label: "q", maxConcurrent: 1.9, maxQueue: 0 });
    expect(limiter.stats().maxConcurrent).toBe(1);
  });

  it("floors fractional maxQueue via Math.floor", () => {
    // 2.7 → floor → 2
    const limiter = createConcurrencyLimiter({ label: "q", maxConcurrent: 2, maxQueue: 2.7 });
    expect(limiter.stats().maxQueue).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// withTimeout
// ─────────────────────────────────────────────────────────────────────────────
describe("withTimeout", () => {
  it("resolves with the task value when it finishes before the deadline", async () => {
    const result = await withTimeout(async () => "fast", { label: "t", timeoutMs: 5000 });
    expect(result).toBe("fast");
  });

  it("runs without timeout when timeoutMs <= 0 (zero)", async () => {
    const result = await withTimeout(async () => 99, { label: "t", timeoutMs: 0 });
    expect(result).toBe(99);
  });

  it("runs without timeout when timeoutMs is negative", async () => {
    const result = await withTimeout(async () => "neg", { label: "t", timeoutMs: -1 });
    expect(result).toBe("neg");
  });

  it("runs without timeout when timeoutMs is NaN (not finite)", async () => {
    const result = await withTimeout(async () => "nan", { label: "t", timeoutMs: Number.NaN });
    expect(result).toBe("nan");
  });

  it("runs without timeout when timeoutMs is Infinity", async () => {
    const result = await withTimeout(async () => "inf", {
      label: "t",
      timeoutMs: Number.POSITIVE_INFINITY,
    });
    expect(result).toBe("inf");
  });

  it("rejects with TaskTimeoutError and aborts signal when deadline elapses", async () => {
    vi.useFakeTimers();
    try {
      let aborted = false;
      const inner = deferred<never>();
      const promise = withTimeout(
        (signal) => {
          signal.addEventListener("abort", () => {
            aborted = true;
          });
          return inner.promise;
        },
        { label: "slow", timeoutMs: 50 },
      );
      const assertion = expect(promise).rejects.toBeInstanceOf(TaskTimeoutError);

      await vi.advanceTimersByTimeAsync(50);

      await assertion;
      expect(aborted).toBe(true);

      // Clean up the floating inner promise
      inner.reject(new Error("cleanup"));
      await vi.advanceTimersByTimeAsync(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("task rejects with error before deadline — error propagates, timer cleared", async () => {
    // This exercises lines 202-205: the error rejection path in withTimeout
    vi.useFakeTimers();
    try {
      const taskError = new Error("task-error");
      const promise = withTimeout((signal) => Promise.reject(taskError), {
        label: "erroring",
        timeoutMs: 10000,
      });

      await expect(promise).rejects.toBe(taskError);
    } finally {
      vi.useRealTimers();
    }
  });

  it("task rejects asynchronously before deadline — error propagates", async () => {
    vi.useFakeTimers();
    try {
      const taskError = new Error("async-task-error");
      const blocker = deferred<string>();
      const promise = withTimeout(() => blocker.promise, {
        label: "async-error",
        timeoutMs: 5000,
      });

      // Reject before timeout
      blocker.reject(taskError);
      await expect(promise).rejects.toBe(taskError);
    } finally {
      vi.useRealTimers();
    }
  });

  it("settled=true guard: timeout fires after task already resolved (no double settle)", async () => {
    vi.useFakeTimers();
    try {
      // This covers the `if (settled) return` at line 184 (timeout fires but task already settled)
      // Use a custom setTimeout so we can control when the timer callback runs
      let timerCb: (() => void) | undefined;
      const captureSetTimeout = (fn: () => void, _ms: number) => {
        timerCb = fn;
        return 1; // non-undefined handle
      };
      const noClear = vi.fn();

      const d = deferred<string>();
      const promise = withTimeout(() => d.promise, {
        label: "race",
        timeoutMs: 10,
        setTimeoutFn: captureSetTimeout,
        clearTimeoutFn: noClear,
      });

      // Task resolves first — sets settled=true, calls finish(), calls resolve
      d.resolve("winner");
      await expect(promise).resolves.toBe("winner");

      // Now fire the timer callback manually — settled is already true, so `if (settled) return`
      // at line 184 takes the true branch (the only previously-uncovered branch)
      expect(timerCb).toBeDefined();
      timerCb!();
      // If the guard wasn't there, a TaskTimeoutError would be thrown/unhandled
    } finally {
      vi.useRealTimers();
    }
  });

  it("settled=true guard: timeout fires after task already rejected (no double settle)", async () => {
    vi.useFakeTimers();
    try {
      // This covers `if (settled) return` at line 202 — task was already settled
      // (by timeout) when the task callback's rejection fires later
      // We use a custom setTimeout that we fire manually to ensure ordering
      let timerCb: (() => void) | undefined;
      const captureSetTimeout = (fn: () => void, _ms: number) => {
        timerCb = fn;
        return 2;
      };
      const noClear = vi.fn();

      const a = deferred<string>();
      const promise = withTimeout(() => a.promise, {
        label: "late-reject",
        timeoutMs: 10,
        setTimeoutFn: captureSetTimeout,
        clearTimeoutFn: noClear,
      });

      // Reject the task first — this sets settled=true via line 202-205
      a.reject(new Error("task-err"));
      await expect(promise).rejects.toThrow("task-err");

      // Now fire the timer — settled is already true, so the timeout guard at line 184
      // returns early without creating a new TaskTimeoutError
      expect(timerCb).toBeDefined();
      timerCb!();
    } finally {
      vi.useRealTimers();
    }
  });

  it("settled=true guard: task resolves after timeout already fired (no double settle)", async () => {
    vi.useFakeTimers();
    try {
      // This covers `if (settled) return` at line 196 — task resolves after timeout has already fired
      const inner = deferred<string>();
      const promise = withTimeout(() => inner.promise, { label: "late-resolve", timeoutMs: 10 });

      const assertion = expect(promise).rejects.toBeInstanceOf(TaskTimeoutError);

      // Let the timeout fire first
      await vi.advanceTimersByTimeAsync(10);
      await assertion;

      // Now resolve the underlying task — settled guard at line 196 should swallow it
      inner.resolve("too-late");
      await vi.advanceTimersByTimeAsync(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses injectable setTimeoutFn when provided", async () => {
    // Arrange: custom setTimeoutFn that we control
    const customSetTimeout = vi.fn((fn: () => void, ms: number) => {
      // Return a non-standard handle value
      return "custom-handle-123";
    });
    const customClearTimeout = vi.fn();

    const promise = withTimeout(async () => "custom-timer", {
      label: "custom",
      timeoutMs: 5000,
      setTimeoutFn: customSetTimeout,
      clearTimeoutFn: customClearTimeout,
    });

    await expect(promise).resolves.toBe("custom-timer");
    expect(customSetTimeout).toHaveBeenCalledTimes(1);
    expect(customClearTimeout).toHaveBeenCalledWith("custom-handle-123");
  });

  it("uses injectable clearTimeoutFn when provided — handle is undefined", async () => {
    // Arrange: setTimeoutFn returns undefined (handle === undefined)
    // This covers the `if (handle !== undefined)` branch — false path (no clearTimeout call)
    const customSetTimeout = vi.fn((_fn: () => void, _ms: number) => {
      return undefined;
    });
    const customClearTimeout = vi.fn();

    const promise = withTimeout(async () => "undef-handle", {
      label: "undef",
      timeoutMs: 5000,
      setTimeoutFn: customSetTimeout,
      clearTimeoutFn: customClearTimeout,
    });

    await expect(promise).resolves.toBe("undef-handle");
    expect(customSetTimeout).toHaveBeenCalledTimes(1);
    // clearTimeout should NOT be called because handle is undefined
    expect(customClearTimeout).not.toHaveBeenCalled();
  });

  it("uses default setTimeout/clearTimeout when no injectable provided", async () => {
    // Default path: setTimeoutFn and clearTimeoutFn are both undefined → use global
    const result = await withTimeout(async () => "default-timers", {
      label: "defaults",
      timeoutMs: 5000,
    });
    expect(result).toBe("default-timers");
  });

  it("task receives an AbortSignal that is not yet aborted while running", async () => {
    let capturedSignal: AbortSignal | null = null;
    await withTimeout(
      (signal) => {
        capturedSignal = signal;
        return Promise.resolve("signal-test");
      },
      { label: "signal", timeoutMs: 5000 },
    );
    expect(capturedSignal).not.toBeNull();
    expect(capturedSignal!.aborted).toBe(false);
  });

  it("signal is aborted after TaskTimeoutError fires", async () => {
    vi.useFakeTimers();
    try {
      let capturedSignal: AbortSignal | null = null;
      // The task watches the signal and resolves when aborted, so the inner
      // promise always settles cleanly — no floating rejection.
      const promise = withTimeout(
        (signal) => {
          capturedSignal = signal;
          return new Promise<never>((_, reject) => {
            signal.addEventListener("abort", () => {
              reject(new Error("aborted-by-signal"));
            });
          });
        },
        { label: "abort-check", timeoutMs: 20 },
      );
      // Catch the inner abort-rejection so it doesn't become unhandled
      promise.catch(() => {});

      await vi.advanceTimersByTimeAsync(20);
      await expect(promise).rejects.toBeInstanceOf(TaskTimeoutError);
      expect(capturedSignal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// runBounded
// ─────────────────────────────────────────────────────────────────────────────
describe("runBounded", () => {
  it("applies both the limiter and the timeout, returning the task value", async () => {
    const limiter = createConcurrencyLimiter({
      label: "bounded",
      maxConcurrent: 2,
      maxQueue: 4,
    });
    const value = await runBounded(limiter, async () => "v", { label: "bounded", timeoutMs: 1000 });
    expect(value).toBe("v");
    expect(limiter.stats().active).toBe(0);
  });

  it("rejects with ConcurrencyLimitError when the limiter queue is saturated", async () => {
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

  it("rejects with TaskTimeoutError when bounded task exceeds timeout", async () => {
    vi.useFakeTimers();
    try {
      const limiter = createConcurrencyLimiter({ label: "t-bounded", maxConcurrent: 1, maxQueue: 0 });
      const inner = deferred<never>();
      const promise = runBounded(limiter, () => inner.promise, {
        label: "t-bounded",
        timeoutMs: 100,
      });

      const assertion = expect(promise).rejects.toBeInstanceOf(TaskTimeoutError);
      await vi.advanceTimersByTimeAsync(100);
      await assertion;

      // Clean up the floating inner promise to avoid unhandled rejection
      inner.reject(new Error("cleanup"));
      await vi.advanceTimersByTimeAsync(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("passes AbortSignal to the task via runBounded", async () => {
    const limiter = createConcurrencyLimiter({ label: "sig", maxConcurrent: 1, maxQueue: 0 });
    let receivedSignal: AbortSignal | null = null;

    await runBounded(
      limiter,
      (signal) => {
        receivedSignal = signal;
        return Promise.resolve("ok");
      },
      { label: "sig", timeoutMs: 1000 },
    );

    expect(receivedSignal).not.toBeNull();
    expect(receivedSignal).toBeInstanceOf(AbortSignal);
  });
});
