"use client";

/**
 * Moudir AI — Inference Scheduler.
 *
 * The performance heart of the swarm. On a single offline device, LLM inference
 * is compute-bound and serializes through ONE engine (node-llama-cpp main lane,
 * or the transformers.js worker). Running many model calls "in parallel" on one
 * device only thrashes memory and inflates latency, so:
 *
 *   - The LLM lane has concurrency 1: every `generate` / `generateStructured`
 *     call queues and runs one at a time, in arrival order.
 *   - The IO lane has concurrency N: non-LLM work (DuckDB SQL, embeddings,
 *     aggregations) genuinely runs in parallel AND overlaps with LLM thinking.
 *
 * That overlap — not parallel inference — is where the real speedup lives.
 *
 * Strict AI-only: if no offline provider is ready, the scheduler throws. There
 * are no heuristic fallbacks.
 */

import type { ZodType } from "zod";
import {
  type AIGenerateRequest,
  type AIProvider,
  AIUnavailableError,
  pickDefaultProvider,
} from "@/platform/ai/provider";

/**
 * A minimal promise-concurrency limiter (no external dependency). Resolves tasks
 * in submission order subject to `concurrency` simultaneous in-flight tasks.
 */
function createLimiter(concurrency: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    if (active >= concurrency) return;
    const run = queue.shift();
    if (!run) return;
    active += 1;
    run();
  };

  return function limit<T>(factory: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        factory()
          .then(resolve, reject)
          .finally(() => {
            active -= 1;
            next();
          });
      };
      queue.push(run);
      next();
    });
  };
}

export interface SchedulerOptions {
  /** Parallelism for non-LLM work (SQL, embeddings). Default 4. */
  ioConcurrency?: number;
  /** Preferred provider id; defaults to the auto-selected offline provider. */
  preferProvider?: Parameters<typeof pickDefaultProvider>[0];
}

export interface SchedulerStats {
  /** LLM calls completed this run. */
  llmCalls: number;
  /** IO tasks completed this run. */
  ioTasks: number;
  /** Total wall-clock spent inside the LLM lane (ms). */
  llmMs: number;
}

/**
 * Wraps the unified AI provider with a serialized LLM lane and a parallel IO
 * lane. One instance should back one swarm run so stats and cancellation are
 * scoped to that run.
 */
export class InferenceScheduler {
  private readonly llmLane = createLimiter(1);
  private readonly ioLane: ReturnType<typeof createLimiter>;
  private readonly preferProvider: SchedulerOptions["preferProvider"];
  private providerPromise: Promise<AIProvider> | null = null;
  private readonly controller = new AbortController();

  readonly stats: SchedulerStats = { llmCalls: 0, ioTasks: 0, llmMs: 0 };

  constructor(options: SchedulerOptions = {}) {
    this.ioLane = createLimiter(Math.max(1, options.ioConcurrency ?? 4));
    this.preferProvider = options.preferProvider;
  }

  /** Abort signal scoped to this run; passed into every LLM request. */
  get signal(): AbortSignal {
    return this.controller.signal;
  }

  /** Cancel every queued and in-flight LLM call for this run. */
  cancel(): void {
    this.controller.abort();
  }

  /** Resolve (and cache) the offline provider, asserting it is usable. */
  async provider(): Promise<AIProvider> {
    if (!this.providerPromise) {
      this.providerPromise = (async () => {
        const provider = await pickDefaultProvider(this.preferProvider);
        if (!(await provider.isAvailable())) {
          throw new AIUnavailableError(
            provider.id,
            "no offline model is ready",
          );
        }
        return provider;
      })();
    }
    return this.providerPromise;
  }

  /** True when an offline provider is ready (cheap probe, no throw). */
  async isReady(): Promise<boolean> {
    try {
      await this.provider();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Warm the model up front so the first real call isn't a silent multi-second
   * (or, on a cold WASM load, multi-minute) stall. Reports load progress and is
   * bound to this run's abort signal. Throws if loading fails.
   */
  async ensureReady(
    model: string,
    onProgress?: (progress: number, message: string) => void,
  ): Promise<void> {
    const provider = await this.provider();
    await provider.ensureReady(
      model,
      (p) => onProgress?.(p.progress, p.message ?? "Loading the model…"),
      this.controller.signal,
    );
  }

  /**
   * Free-form generation through the serialized LLM lane. Streams via
   * `req.onToken` and is bound to this run's abort signal.
   */
  generate(req: Omit<AIGenerateRequest, "signal">): Promise<string> {
    return this.llmLane(async () => {
      const provider = await this.provider();
      const startedAt = performance.now();
      try {
        const result = await provider.generate({
          ...req,
          signal: this.controller.signal,
        });
        return result.text;
      } finally {
        this.stats.llmCalls += 1;
        this.stats.llmMs += performance.now() - startedAt;
      }
    });
  }

  /**
   * Schema-validated structured generation through the serialized LLM lane. With
   * the llamacpp lane this is grammar-constrained (valid by construction); other
   * lanes use prompt-grounding + Zod repair inside the provider. Throws on
   * irrecoverable output — callers handle the failure visibly.
   */
  generateStructured<T>(
    req: Omit<AIGenerateRequest, "signal">,
    schema: ZodType<T>,
  ): Promise<T> {
    return this.llmLane(async () => {
      const provider = await this.provider();
      const startedAt = performance.now();
      // Small offline models occasionally emit truncated/invalid JSON (e.g.
      // "Unexpected end of JSON input") or miss a Zod refinement. Retry a couple
      // of times before giving up — this is transient-output resilience, not a
      // rule-based fallback (the MODEL still produces every result).
      let lastError: unknown;
      try {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          if (this.controller.signal.aborted) {
            throw new Error("Run aborted.");
          }
          try {
            return await provider.generateStructured(
              { ...req, signal: this.controller.signal },
              schema,
            );
          } catch (error) {
            lastError = error;
            if (this.controller.signal.aborted) throw error;
          }
        }
        throw lastError instanceof Error
          ? lastError
          : new Error(String(lastError));
      } finally {
        this.stats.llmCalls += 1;
        this.stats.llmMs += performance.now() - startedAt;
      }
    });
  }

  /** Run one non-LLM task in the parallel IO lane. */
  io<T>(factory: () => Promise<T>): Promise<T> {
    return this.ioLane(async () => {
      try {
        return await factory();
      } finally {
        this.stats.ioTasks += 1;
      }
    });
  }

  /** Map items through the IO lane, preserving order, all overlapping. */
  ioMap<I, O>(items: I[], fn: (item: I, index: number) => Promise<O>): Promise<O[]> {
    return Promise.all(items.map((item, index) => this.io(() => fn(item, index))));
  }
}
