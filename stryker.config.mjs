// @ts-check
/**
 * Stryker mutation-testing config.
 *
 * Mutation testing measures *test quality*: Stryker injects small faults
 * ("mutants") into the source, re-runs the suite, and reports how many mutants
 * the tests detect ("kill"). A high score validates that the unit tests for a
 * module actually catch regressions; surviving mutants pinpoint untested logic.
 *
 * Scope is intentionally narrow — a handful of pure, high-value modules — so a
 * full run stays minutes, not hours. Each mutated module is paired with the unit
 * suite that exercises it via `vitest.mutation.config.ts` (the runner's config).
 *
 * Modules under test:
 *   - src/features/data-formulator/core/swarm/agents/base.ts     (SQL read-only guard)
 *   - src/shared/duckdb-summary.ts                               (SUMMARIZE coercion)
 *   - src/features/ai-analysis/model/stats.ts                    (statistics helpers)
 *   - src/features/data-import/model/summarize.ts                (column-info mapping)
 *   - src/platform/ai/nlq.ts                                     (NL->SQL translation)
 *   - src/features/telecom/lib/sql.ts                            (SQL-escaping + canal/status SQL builders)
 *   - src/platform/ai/provider/structured.ts                     (JSON repair/parse for AI output)
 *   - src/features/data-formulator/core/swarm/agents/validate.ts (swarm artifact safety gate)
 *   - electron/sql-guard.ts                                      (main-process read-only SQL guard)
 *   - src/features/desktop/core/menu/registry.ts                 (menu bar composition rules)
 *
 * NOT mutated despite being a candidate: src/features/ai-analysis/model/sql.ts
 * (buildHistogramSQL et al). Its only coverage is indirect, through
 * tests/features/ai-analysis/model/pipeline.test.ts, which re-derives the
 * "expected" SQL by calling the SAME builder functions the pipeline calls, then
 * matches by equality/prefix. Verified empirically: mutating a literal quantile
 * argument in `buildNumericStatsSQL` (0.25/0.75 -> 0.35/0.85) left all 62 tests
 * in that file green, because both sides of the match were built from the same
 * (mutated) function. Mutating this file would mostly produce "survived" noise
 * rather than signal; it needs direct unit tests asserting exact SQL text
 * before it belongs in this list.
 *
 * Run: `pnpm run test:mutation`  (alias for `stryker run`).
 */

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  $schema: "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  packageManager: "pnpm",
  // Explicit plugin load: pnpm's nested/symlinked node_modules layout defeats
  // Stryker's default "@stryker-mutator/*" auto-discovery glob, so name the
  // vitest runner directly (otherwise: 'Cannot find TestRunner plugin "vitest"').
  plugins: ["@stryker-mutator/vitest-runner"],
  testRunner: "vitest",
  vitest: {
    // Run only the scoped unit tests, not the whole tests/** suite, per mutant.
    configFile: "vitest.mutation.config.ts",
  },
  reporters: ["html", "clear-text", "progress", "json"],
  htmlReporter: { fileName: "reports/mutation/mutation.html" },
  jsonReporter: { fileName: "reports/mutation/mutation.json" },
  // Tight scope keeps the run sane. Only mutate the high-value pure modules;
  // restrict to their exported logic so the score reflects the public contract.
  mutate: [
    "src/features/data-formulator/core/swarm/agents/base.ts",
    "src/shared/duckdb-summary.ts",
    "src/features/ai-analysis/model/stats.ts",
    "src/features/data-import/model/summarize.ts",
    "src/platform/ai/nlq.ts",
    "src/features/telecom/lib/sql.ts",
    "src/platform/ai/provider/structured.ts",
    "src/features/data-formulator/core/swarm/agents/validate.ts",
    "electron/sql-guard.ts",
    "src/features/desktop/core/menu/registry.ts",
  ],
  // Be conservative on a medium-end PC: leave cores free for the OS / dev work.
  concurrency: 4,
  // Cache mutant results across runs so re-runs after small diffs are fast
  // (2026 best practice for scaling mutation testing without runaway CI time).
  // Kept outside `tempDirName` (which `cleanTempDir` wipes every run) and
  // inside the already-gitignored `reports/mutation/` dir alongside the other
  // reporters.
  incremental: true,
  incrementalFile: "reports/mutation/stryker-incremental.json",
  // Skip mutants in a test as soon as one survives long enough — keeps runtime
  // bounded without changing the score (timeout for hung mutants only).
  timeoutMS: 60000,
  timeoutFactor: 2,
  // Per-module + overall thresholds. `break` left null so a low score reports
  // (red/yellow) rather than failing the command — this run is a measurement.
  thresholds: { high: 80, low: 60, break: null },
  // Disable type-checking of mutants (we mutate already-typecheck-clean source;
  // ts checks per-mutant would dominate runtime for no extra signal).
  checkers: [],
  tempDirName: ".stryker-tmp",
  cleanTempDir: true,
};
