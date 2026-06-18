export const meta = {
  name: 'wave5-realperf-tooling',
  description: 'Real DuckDB + LLM throughput benchmarks, plus property/mutation/autoevals test-quality tooling',
  phases: [
    { title: 'Build', detail: 'agents build real-engine perf benches + harden tests; each runs its own work to green/real-numbers' },
  ],
}

const RESULT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    bucket: { type: 'string' },
    kind: { type: 'string', enum: ['duckdb-bench', 'llm-throughput', 'property', 'mutation', 'autoevals'] },
    filesCreated: { type: 'array', items: { type: 'string' } },
    filesChanged: { type: 'array', items: { type: 'string' } },
    runCommand: { type: 'string', description: 'the exact command to run this' },
    succeeded: { type: 'boolean', description: 'bench ran and produced real numbers / tests pass / mutation run completed' },
    headlineMetric: { type: 'string', description: 'the KEY real numbers measured on this PC (e.g. tokens/sec, TTFT, per-query ms + rows/sec, mutation score %, test count)' },
    runEvidence: { type: 'string', description: 'the actual run output summary line(s)' },
    notes: { type: 'string' },
  },
  required: ['bucket', 'kind', 'filesCreated', 'succeeded', 'headlineMetric', 'runEvidence', 'notes'],
}

const BUCKETS = [
  {
    key: 'duckdb-query-perf',
    kind: 'duckdb-bench',
    title: 'REAL DuckDB telecom report query performance (the primary ask)',
    detail: 'Build a benchmark that runs the ACTUAL telecom report SQL against a REAL in-process DuckDB (the @duckdb/node-api dependency, already installed) over synthetic telecom transaction data at scale. Steps: (1) Read the real query builders + schema: src/features/telecom/lib/queries.ts, report-engine.ts, status-definitions.ts, and the telecom column mapping, to learn the actual SELECT/aggregation SQL the app runs (KPI/success-rate, hourly series, operators matrix, regions, channel stats, period-over-period, day analytics) and the table schema (operator, region, channel, status code, amount, hour/timestamp, msisdn, etc.). (2) Create a synthetic DailyTransactions table in a real DuckDB instance via @duckdb/node-api, deterministically generated (counter-based, no Math.random/Date.now), at two sizes via an env knob DN_BENCH_ROWS (default 100000; run once at 1000000 to report real large-scale numbers). (3) Benchmark each real report query: measure wall-clock latency (ms) AND throughput (rows-scanned/sec). Use a real timer; do enough warmup + repeats for stable numbers (or use vitest bench async). (4) Also bench a raw-data grid query (filtered/paginated) since that is a hot interactive path.',
    extra: 'PLACEMENT/ENV: @duckdb/node-api is a NATIVE node module — it needs the node environment, NOT jsdom. Put the bench under tests/performance/ but add a per-file node environment directive (// @vitest-environment node) or, if vitest bench ignores that, create a dedicated vitest bench config + a package.json script bench:duckdb. The default vitest bench env is jsdom (vitest.config.ts) which will break native DuckDB — solve this explicitly and verify the bench actually executes queries (print row counts). RUN it on this PC at 100k and at 1,000,000 rows and put the real per-query ms + rows/sec numbers in headlineMetric.',
  },
  {
    key: 'duckdb-ingest-profile-perf',
    kind: 'duckdb-bench',
    title: 'REAL DuckDB ingestion + SUMMARIZE profiling performance',
    detail: 'Benchmark the data-onboarding hot path against a REAL DuckDB (@duckdb/node-api): (1) CSV ingestion throughput — write a synthetic CSV to a temp file and measure read_csv_auto / COPY ingestion rows/sec at 100k and 1M rows (mirror how src/platform/duckdb/upload-to-duckdb.ts loads files). (2) Dataset profiling latency — run SUMMARIZE over the ingested table (the path src/features/data-import/model/summarize.ts + parsed-data use via fetchFullTableColumnInfo) at wide schemas (e.g. 20 and 60 columns) and large row counts, measuring ms. (3) Optionally parquet round-trip if quick. Report rows/sec for ingestion and ms for SUMMARIZE at each size.',
    extra: 'Same native-DuckDB node-environment requirement as the other DuckDB bench (no jsdom). Reuse the same dedicated config/script if you create one. Generate synthetic data deterministically. RUN on this PC; put real ingestion rows/sec + SUMMARIZE ms in headlineMetric.',
  },
  {
    key: 'llm-throughput',
    kind: 'llm-throughput',
    title: 'REAL local-LLM throughput: tokens/sec + TTFT',
    detail: 'Add a live-gated throughput benchmark for the offline node-llama-cpp model (qwen2.5-1.5b GGUF, already installed at the model dir). Measure the standard inference metrics: PREFILL/prompt-eval tokens/sec, DECODE/generation tokens/sec, TIME-TO-FIRST-TOKEN (TTFT ms), and total end-to-end latency, across a couple of prompt sizes (short + long context) and output lengths. Use node-llama-cpp built-in metrics: model.tokenize(text) for exact token counts, the streaming onTextChunk callback (or onToken) to mark first-token time, and node:perf_hooks performance.now() for timing. Reuse/extend the existing eval harness: evals/_model.ts already has hasLocalModel()/liveIt and a loadLocalEngine() that lazily imports node-llama-cpp (getLlama + LlamaChatSession) — extend or mirror it to expose token counts + first-token timing (the current generate() only returns text). Place the bench at evals/perf/throughput.eval.ts, gated with liveIt/liveDescribe so it SKIPS without a model and RUNS with one. It must run under the eval config (vitest.eval.config.ts include is evals/**/*.eval.ts).',
    extra: 'RUN it live on this PC: pnpm exec vitest run --config vitest.eval.config.ts evals/perf/throughput.eval.ts with DN_EVAL_LIVE=1 (cross-env). Put the REAL measured prefill tok/s, decode tok/s, and TTFT ms in headlineMetric. Report metric DEFINITIONS in notes. Do not assert hard throughput thresholds (machine-dependent) — measure + report + assert only sane sanity bounds (e.g. decode tok/s > 0, TTFT finite).',
  },
  {
    key: 'property-tests',
    kind: 'property',
    title: 'Property-based fuzzing of the highest-value pure logic (fast-check)',
    detail: 'Using @fast-check/vitest (test.prop/it.prop) — newly installed — add property-based tests that fuzz the safety- and correctness-critical pure functions, complementing the existing example-based unit tests. Targets: (1) SQL safety — assertReadOnlySql / isReadOnlySql: property that NO generated statement containing a write keyword is ever accepted, and well-formed SELECTs are accepted (fuzz identifiers/whitespace/comments/case). (2) NL->SQL translateNLQ: property that every output parses (node-sql-parser) and is read-only for arbitrary question strings. (3) Coercers — numberOrUndefined / nullRateFromSummary / mapDuckTypeToColumnInfoType: properties like nullRate in [0,1], numeric round-trips, total function (never throws) over arbitrary inputs. (4) stats — mean/stdDev/pearsonCorrelation invariants (mean within [min,max]; correlation in [-1,1]; stdDev>=0) over arbitrary float arrays. (5) transform pipeline — idempotence/row-count invariants where applicable. Put files under tests/ mirroring src, named *.prop.test.ts (so the existing tests/** include picks them up). Calibrate by running; fix until green.',
    extra: 'RUN: pnpm exec vitest run <your new files>. They must pass and must not call IO/DuckDB/model (pure only). If a property surfaces a REAL bug (e.g. a coercer throwing), document it in notes and make the property assert the actual safe-contract (do not modify source). Report the test count + which invariants.',
  },
  {
    key: 'mutation-testing',
    kind: 'mutation',
    title: 'Mutation testing on the highest-value modules (Stryker)',
    detail: 'Configure @stryker-mutator/core + @stryker-mutator/vitest-runner (newly installed) to measure whether the new tests actually catch bugs. Add stryker.config.json (or .mjs) using the vitest test runner. SCOPE it tightly to a handful of high-value pure modules to keep runtime sane (e.g. src/platform/ai/nlq.ts, the SQL-safety guard module, src/shared/duckdb-summary.ts, src/features/ai-analysis/model/stats.ts, src/features/data-import/model/summarize.ts) — NOT the whole src. Add a package.json script: test:mutation. Run it on this PC over the scoped modules and report the mutation score (% mutants killed) per module. A high score validates test quality; surviving mutants reveal weak spots.',
    extra: 'RUN: pnpm exec stryker run (or the script). Mutation runs are slow — keep the scope small and set concurrency reasonably. Put the overall + per-module mutation score % in headlineMetric. If Stryker cannot resolve the vitest runner under Vitest 4, note the exact issue and the closest working config; do not leave a broken config.',
  },
  {
    key: 'autoevals-scorers',
    kind: 'autoevals',
    title: 'Wire offline autoevals scorers into the eval suites',
    detail: 'Use autoevals (newly installed) OFFLINE/heuristic scorers (e.g. ValidJSON, JSONDiff, Levenshtein, ExactMatch, NumericDiff — the ones that do NOT call a hosted LLM judge) to strengthen the existing evals/ suites. For example: in evals/structured-output.eval.ts add a ValidJSON/JSONDiff score over the corpus; in evals/nlq.eval.ts add a Levenshtein/structural score of generated-vs-gold SQL; report the scores via the existing _harness report(). Keep them DETERMINISTIC (offline) so they run in the normal pnpm run test:eval. Do NOT introduce any scorer that requires a network/API key.',
    extra: 'RUN: pnpm exec vitest run --config vitest.eval.config.ts <the eval files you touched>. Must stay green (deterministic) with live still skipped. Confirm autoevals offline scorers do not attempt network calls. Report which scorers wired + the scores observed.',
  },
]

const prompt = (b) => `${b.title}

CONTEXT: Next.js + Electron offline-first data app at d:/data-navigator. Vitest 4 (unit at tests/**, bench at tests/performance/**.bench.ts, evals at evals/**.eval.ts via vitest.eval.config.ts). The user explicitly cares about REAL performance of heavy engines (DuckDB, the local LLM) — measured against the actual engines, not mocked. Deps already installed for this wave: @duckdb/node-api, node-llama-cpp (existing), and (new) @fast-check/vitest, fast-check, autoevals, @stryker-mutator/core, @stryker-mutator/vitest-runner.

TASK: ${b.detail}

${b.extra}

RULES: match existing conventions (read a sibling file first). Deterministic synthetic data (no Math.random/Date.now). Do not modify app source to make a test pass (if you find a real bug, document it). Distinct files; do not touch tests/e2e/ (another agent owns it). Then ACTUALLY RUN your work on this PC and capture the real output.

Report per schema: bucket="${b.key}", kind="${b.kind}", files created/changed, the run command, whether it succeeded, the HEADLINE real numbers measured on this machine, the run evidence line(s), and notes.`

phase('Build')
const results = await parallel(
  BUCKETS.map((b) => () =>
    agent(prompt(b), { label: `w5:${b.key}`, phase: 'Build', schema: RESULT })
      .then((r) => (r ? r : { bucket: b.key, kind: b.kind, succeeded: false, died: true, filesCreated: [], headlineMetric: 'n/a', runEvidence: 'agent died', notes: '' })),
  ),
)
const ok = results.filter((r) => r && r.succeeded)
log(`Wave 5 done: ${ok.length}/${results.length} buckets succeeded`)
return { results, summary: { succeeded: ok.length, buckets: results.length } }