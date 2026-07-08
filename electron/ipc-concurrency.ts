/**
 * IPC concurrency / DoS bounding helpers (pure, dependency-free).
 *
 * Heavy DuckDB query channels (runReadOnlyQuery, runReadOnlyQueryArrow,
 * profileDataset, fetchKeysetPage) are reachable from the renderer. A
 * compromised or buggy renderer can flood them with concurrent / never-settling
 * requests and exhaust main-process memory, threads, and DuckDB read
 * connections.
 *
 * This module provides two small, additive, behavior-preserving primitives:
 *
 *  1. `createConcurrencyLimiter` — bounds how many tasks of a given kind run
 *     at once and caps how many may wait in the queue. Beyond the queue cap, new
 *     requests are rejected fast with a typed error instead of piling up.
 *
 *  2. `withTimeout` — races a task against an AbortController-driven deadline so
 *     a single runaway query cannot occupy a slot forever.
 *
 * Both are pure (no Electron / no globals beyond injectable timers) so they can
 * be unit-tested deterministically.
 */

/** Error thrown when the limiter's queue is saturated (back-pressure / DoS). */
export class ConcurrencyLimitError extends Error {
  readonly code = "E_CONCURRENCY_LIMIT" as const;
  constructor(label: string, maxConcurrent: number, maxQueue: number) {
    super(
      `Too many concurrent "${label}" requests (limit ${maxConcurrent} in-flight, ` +
        `${maxQueue} queued). Try again shortly.`,
    );
    this.name = "ConcurrencyLimitError";
  }
}

/** Error thrown when a task exceeds its deadline. */
export class TaskTimeoutError extends Error {
  readonly code = "E_TASK_TIMEOUT" as const;
  constructor(label: string, timeoutMs: number) {
    super(`Operation "${label}" timed out after ${timeoutMs}ms.`);
    this.name = "TaskTimeoutError";
  }
}

export interface ConcurrencyLimiterOptions {
  /** Human-readable label used in error messages and stats. */
  readonly label: string;
  /** Max tasks running simultaneously. Must be >= 1. */
  readonly maxConcurrent: number;
  /**
   * Max tasks allowed to WAIT while all slots are busy. Beyond this, `run`
   * rejects immediately with {@link ConcurrencyLimitError}. Must be >= 0.
   * Defaults to a small multiple of `maxConcurrent`.
   */
  readonly maxQueue?: number;
}

export interface LimiterStats {
  readonly label: string;
  readonly active: number;
  readonly queued: number;
  readonly maxConcurrent: number;
  readonly maxQueue: number;
}

export interface ConcurrencyLimiter {
  /**
   * Run `task` under the limiter. Resolves/rejects with the task's result.
   * Rejects synchronously-fast with {@link ConcurrencyLimitError} when the
   * queue is full.
   */
  run<T>(task: () => Promise<T>): Promise<T>;
  /** Current snapshot of limiter occupancy (for diagnostics / tests). */
  stats(): LimiterStats;
}

interface QueueEntry {
  readonly start: () => void;
}

/**
 * Create a bounded concurrency limiter.
 *
 * Invariants:
 * - At most `maxConcurrent` tasks run concurrently.
 * - At most `maxQueue` tasks wait; further `run` calls reject immediately.
 * - A task is always released from its slot when it settles (resolve OR reject).
 */
export function createConcurrencyLimiter(options: ConcurrencyLimiterOptions): ConcurrencyLimiter {
  const label = options.label;
  const maxConcurrent = Math.max(1, Math.floor(options.maxConcurrent));
  const maxQueue =
    options.maxQueue === undefined ? maxConcurrent * 4 : Math.max(0, Math.floor(options.maxQueue));

  let active = 0;
  const queue: QueueEntry[] = [];

  function release(): void {
    active -= 1;
    const next = queue.shift();
    if (next) {
      next.start();
    }
  }

  function launch<T>(task: () => Promise<T>): Promise<T> {
    active += 1;
    // Defer the task into a promise so its rejection is captured here and a slot
    // is always released exactly once.
    return (async () => {
      try {
        return await task();
      } finally {
        release();
      }
    })();
  }

  function run<T>(task: () => Promise<T>): Promise<T> {
    if (active < maxConcurrent) {
      return launch(task);
    }

    if (queue.length >= maxQueue) {
      return Promise.reject(new ConcurrencyLimitError(label, maxConcurrent, maxQueue));
    }

    return new Promise<T>((resolve, reject) => {
      queue.push({
        start: () => {
          launch(task).then(resolve, reject);
        },
      });
    });
  }

  function stats(): LimiterStats {
    return { label, active, queued: queue.length, maxConcurrent, maxQueue };
  }

  return { run, stats };
}

export interface WithTimeoutOptions {
  /** Human-readable label used in the timeout error. */
  readonly label: string;
  /** Deadline in milliseconds. Must be > 0; otherwise no timeout is applied. */
  readonly timeoutMs: number;
  /**
   * Injectable timers (defaults to global setTimeout/clearTimeout). Lets tests
   * drive deadlines deterministically.
   */
  readonly setTimeoutFn?: (fn: () => void, ms: number) => unknown;
  readonly clearTimeoutFn?: (handle: unknown) => void;
}

/**
 * Run `task(signal)` with an abort-on-timeout deadline.
 *
 * - The task receives an AbortSignal that fires when the deadline elapses, so
 *   cancellation-aware work (e.g. DuckDB query cancellation) can react.
 * - If the task does not settle before the deadline, the returned promise
 *   rejects with {@link TaskTimeoutError}. (The underlying task may still be
 *   running; honoring the signal is the task's responsibility.)
 * - The timer is always cleared once the task settles, avoiding leaks.
 */
export function withTimeout<T>(
  task: (signal: AbortSignal) => Promise<T>,
  options: WithTimeoutOptions,
): Promise<T> {
  const { label, timeoutMs } = options;
  const setTimeoutFn = options.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimeoutFn = options.clearTimeoutFn ?? ((h) => clearTimeout(h as never));

  const controller = new AbortController();

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    // No usable deadline — just run the task with a live (never-aborted) signal.
    return task(controller.signal);
  }

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const handle = setTimeoutFn(() => {
      if (settled) return;
      settled = true;
      controller.abort();
      reject(new TaskTimeoutError(label, timeoutMs));
    }, timeoutMs);

    const finish = (): void => {
      if (handle !== undefined) clearTimeoutFn(handle);
    };

    task(controller.signal).then(
      (value) => {
        if (settled) return;
        settled = true;
        finish();
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        finish();
        reject(error);
      },
    );
  });
}

/**
 * Convenience: bound a task by BOTH a concurrency limiter and a per-task
 * timeout. The timeout deadline starts when the task actually begins running
 * (after acquiring a slot), not while it is queued.
 */
export function runBounded<T>(
  limiter: ConcurrencyLimiter,
  task: (signal: AbortSignal) => Promise<T>,
  timeout: WithTimeoutOptions,
): Promise<T> {
  return limiter.run(() => withTimeout(task, timeout));
}
