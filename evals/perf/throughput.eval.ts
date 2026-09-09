/**
 * Offline local-LLM THROUGHPUT benchmark (live, model-gated).
 *
 * FOCUS: the REAL inference performance of the bundled offline model
 * (qwen2.5-1.5b GGUF) on THIS machine — measured against the actual
 * `node-llama-cpp` engine, never a mock. It reports the standard inference
 * metrics across a couple of prompt sizes and output lengths:
 *
 *   - PREFILL / prompt-eval throughput (tokens/sec)
 *   - DECODE / generation throughput (tokens/sec)
 *   - TIME-TO-FIRST-TOKEN (TTFT, ms)
 *   - total end-to-end latency (ms)
 *
 * METHOD (how each number is obtained — see also `GenerationMetrics` in
 * `evals/_model.ts`):
 *   - Token counts are EXACT: `model.tokenize(text).length` from the model's own
 *     tokenizer, taken before generation (prompt) and after (response).
 *   - TTFT is the interval from prompt submit to the FIRST streamed chunk,
 *     captured by the `onTextChunk` callback firing once.
 *   - All timing uses `node:perf_hooks` `performance.now()` (a monotonic clock),
 *     so it is immune to wall-clock skew and never derived from `Date.now()`.
 *   - PREFILL tok/s ≈ promptTokens / TTFT (TTFT is dominated by prefill on a
 *     cold sequence: the model reads the whole prompt before emitting token 1).
 *   - DECODE tok/s = generatedTokens / (totalMs − TTFT) — the steady-state
 *     generation rate AFTER the first token.
 *   - Each case runs on a FRESH context (`generateWithMetrics` creates one per
 *     call), so every prefill measurement starts cold and is comparable.
 *
 * GATING: the whole block is wrapped in `liveDescribe`, so it SKIPS cleanly when
 * no GGUF is installed or `DN_EVAL_LIVE` is unset, and RUNS the real model when
 * both are present. Run it live with:
 *
 *   cross-env DN_EVAL_LIVE=1 pnpm exec vitest run \
 *     --config vitest.eval.config.ts evals/perf/throughput.eval.ts
 *
 * ASSERTIONS are SANITY bounds only — never hard throughput thresholds. Absolute
 * tok/s and TTFT are wildly machine-dependent (CPU, cores, GPU, thermal state),
 * so gating on a number would be flaky and meaningless. We assert only that the
 * measurement is well-formed: tokens were generated, decode tok/s > 0, TTFT is
 * finite and positive, and total latency brackets TTFT.
 */

import { expect } from "vitest";
import { report } from "../_harness";
import {
  type GenerationMetrics,
  type LocalEngine,
  liveDescribe,
  liveIt,
  loadLocalEngine,
} from "../_model";

/**
 * Deterministic synthetic prompt builder — NO `Math.random` / `Date.now`. It
 * tiles a fixed sentence set so prompt length grows predictably; the same
 * `sentences` count always yields byte-identical text. This keeps the
 * SHORT-vs-LONG context comparison fair and reproducible run to run.
 */
const FILLER_SENTENCES: readonly string[] = [
  "The telecom report aggregates daily transactions by region and product.",
  "Each row records a settlement amount, a status code, and a timestamp.",
  "Reconciliation compares expected totals against the ledger of record.",
  "Analysts flag anomalies when a region deviates from its trailing mean.",
  "The pipeline ingests a CSV, validates schema, then loads it into DuckDB.",
  "Downstream charts summarize volume, revenue, and failure rates over time.",
];

/** Build a prompt body of exactly `sentences` deterministic sentences. */
function buildContext(sentences: number): string {
  const out: string[] = [];
  for (let i = 0; i < sentences; i += 1) {
    out.push(FILLER_SENTENCES[i % FILLER_SENTENCES.length]);
  }
  return out.join(" ");
}

/** One benchmark scenario: a named prompt of a given size + an output budget. */
interface Scenario {
  readonly name: string;
  readonly prompt: string;
  readonly maxTokens: number;
}

/**
 * Fixed scenario matrix: two prompt sizes (short context vs long context) and
 * two output budgets (short vs longer generation). Deterministic by construction.
 */
const SCENARIOS: readonly Scenario[] = [
  {
    name: "short-prompt/short-output",
    prompt: "In one short sentence, state what a telecom daily-transactions report is for.",
    maxTokens: 48,
  },
  {
    name: "short-prompt/long-output",
    prompt: "Explain, in a few sentences, what a telecom daily-transactions report is used for.",
    maxTokens: 192,
  },
  {
    name: "long-prompt/short-output",
    prompt:
      `Read the following background, then answer in ONE short sentence.\n\n` +
      `${buildContext(40)}\n\nQuestion: what does the reconciliation step compare?`,
    maxTokens: 48,
  },
  {
    name: "long-prompt/long-output",
    prompt:
      `Read the following background, then summarize it in a few sentences.\n\n` +
      `${buildContext(40)}\n\nSummary:`,
    maxTokens: 192,
  },
];

/** Format a tokens/sec value (or a dash when it could not be measured). */
function fmtRate(rate: number | null): string {
  return rate === null ? "n/a" : rate.toFixed(1);
}

/** Pretty one-line summary of a measured scenario for the run log. */
function logScenario(name: string, m: GenerationMetrics): void {
  // eslint-disable-next-line no-console
  console.log(
    `[bench] ${name} | ` +
      `prompt=${m.promptTokens}tok gen=${m.generatedTokens}tok | ` +
      `prefill=${fmtRate(m.prefillTokensPerSec)} tok/s | ` +
      `decode=${fmtRate(m.decodeTokensPerSec)} tok/s | ` +
      `ttft=${m.ttftMs.toFixed(1)}ms total=${m.totalMs.toFixed(1)}ms`,
  );
}

/** Assert a single measurement is well-formed (sanity bounds only). */
function assertSane(name: string, m: GenerationMetrics): void {
  // The model must have actually read a prompt and emitted tokens.
  expect(m.promptTokens, `${name}: prompt tokens`).toBeGreaterThan(0);
  expect(m.generatedTokens, `${name}: generated tokens`).toBeGreaterThan(0);

  // Timing must be finite, positive, and self-consistent.
  expect(Number.isFinite(m.ttftMs), `${name}: TTFT finite`).toBe(true);
  expect(m.ttftMs, `${name}: TTFT positive`).toBeGreaterThan(0);
  expect(Number.isFinite(m.totalMs), `${name}: total finite`).toBe(true);
  // First token cannot arrive after the whole generation finished (allow equal
  // for a degenerate single-token output).
  expect(m.totalMs, `${name}: total >= TTFT`).toBeGreaterThanOrEqual(m.ttftMs);

  // Decode throughput must be a real, positive rate (we generated >0 tokens over
  // a >=0 decode interval; for multi-token output the interval is > 0).
  if (m.generatedTokens > 1) {
    expect(m.decodeTokensPerSec, `${name}: decode tok/s`).not.toBeNull();
    expect(m.decodeTokensPerSec ?? 0, `${name}: decode tok/s > 0`).toBeGreaterThan(0);
    expect(
      Number.isFinite(m.decodeTokensPerSec ?? Number.NaN),
      `${name}: decode tok/s finite`,
    ).toBe(true);
  }

  // Prefill throughput is derived from TTFT + prompt tokens; both are > 0 here.
  expect(m.prefillTokensPerSec, `${name}: prefill tok/s`).not.toBeNull();
  expect(m.prefillTokensPerSec ?? 0, `${name}: prefill tok/s > 0`).toBeGreaterThan(0);
}

liveDescribe("offline LLM throughput (live, model-gated)", () => {
  liveItAcrossScenarios();
});

/**
 * Registers one `liveIt` test per scenario plus a warm-up, sharing a single
 * loaded engine. Split into a function so the engine is created lazily inside
 * the gated block (never at import time).
 */
function liveItAcrossScenarios(): void {
  // One engine, loaded once and reused; disposed after the suite.
  let enginePromise: Promise<LocalEngine> | null = null;
  const engine = (): Promise<LocalEngine> => {
    if (!enginePromise) enginePromise = loadLocalEngine();
    return enginePromise;
  };

  // Warm-up: load weights + a trivial generation so the FIRST scenario's prefill
  // is not skewed by one-time native init / memory mapping.
  liveIt("warms up the model (load + trivial generation)", async () => {
    const e = await engine();
    await e.ensureModel();
    const warm = await e.generateWithMetrics({
      prompt: "Reply with the single word: ok",
      maxTokens: 8,
      temperature: 0,
    });
    expect(warm.text.length, "warmup produced text").toBeGreaterThan(0);
    logScenario("warmup", warm);
  });

  for (const scenario of SCENARIOS) {
    liveIt(`measures throughput — ${scenario.name}`, async () => {
      const e = await engine();
      const m = await e.generateWithMetrics({
        prompt: scenario.prompt,
        maxTokens: scenario.maxTokens,
        temperature: 0, // greedy decode — deterministic output, comparable timing.
      });

      logScenario(scenario.name, m);

      // Headline metrics, logged via the shared reporter for machine-grep too.
      report(`throughput.${scenario.name}.prefillTokPerSec`, m.prefillTokensPerSec ?? 0);
      report(`throughput.${scenario.name}.decodeTokPerSec`, m.decodeTokensPerSec ?? 0);
      report(`throughput.${scenario.name}.ttftMs`, m.ttftMs);
      report(`throughput.${scenario.name}.totalMs`, m.totalMs);

      assertSane(scenario.name, m);
    });
  }

  // Tear down the shared engine once all scenarios have run.
  liveIt("disposes the engine", async () => {
    if (enginePromise) {
      const e = await enginePromise;
      await e.dispose();
    }
    expect(true).toBe(true);
  });
}
