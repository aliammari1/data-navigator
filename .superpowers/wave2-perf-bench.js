export const meta = {
  name: 'wave2-perf-bench',
  description: 'Write + run Vitest performance benchmarks for hot-path pure functions',
  phases: [
    { title: 'Bench', detail: 'one agent per hot-path area: write .bench.ts, run vitest bench on own files' },
  ],
}

const BENCH_RESULT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    bucket: { type: 'string' },
    benchFilesCreated: { type: 'array', items: { type: 'string' } },
    benchCount: { type: 'number', description: 'number of bench() cases' },
    ran: { type: 'boolean', description: 'did `vitest bench --run` execute cleanly and emit ops/sec for every case' },
    runEvidence: { type: 'string', description: 'a few sample result lines (name + hz/ops-per-sec) from the bench run' },
    notes: { type: 'string' },
  },
  required: ['bucket', 'benchFilesCreated', 'benchCount', 'ran', 'runEvidence', 'notes'],
}

const BUCKETS = [
  { key: 'telecom-aggregation', area: 'TELECOM FLAGSHIP hot path: report computations over large synthetic transaction sets (10k–100k rows).', hints: 'Bench the pure KPI/channel/hourly/operator/region/period aggregation + status-mapping functions in src/features/telecom/lib/* and src/features/telecom/model/* (the same functions Wave 1 unit-tested). Generate deterministic in-memory rows; bench at 10k and 100k.' },
  { key: 'profiling-coercion', area: 'DuckDB summary coercion + type mapping over large column/summary sets.', hints: 'src/shared/duckdb-summary.ts (numberOrUndefined, nullRateFromSummary), src/features/data-import/model/summarize.ts (mapDuckTypeToColumnInfoType, summarizeRowsToColumnInfo) — bench over a wide schema (e.g. 200–1000 columns of SUMMARIZE rows).' },
  { key: 'stats-forecast', area: 'Statistics + forecasting over large numeric arrays.', hints: 'src/features/ai-analysis/model/stats.ts (mean, stdDev, pearsonCorrelation, linearRegression, z-score/IQR anomaly) over arrays of 10k–100k; src/features/forecast-intelligence/core/forecast-engine.ts (normalization, seasonal indices, backtest, residuals) over a long series.' },
  { key: 'transform-pipeline', area: 'Transform pipeline over large row sets.', hints: 'src/features/data-transform/* — bench filter/aggregate/pivot/derive/sort/dedup and compileFilter over 10k–100k in-memory rows.' },
  { key: 'text-nlq-search', area: 'Text chunking + NL->SQL + fuzzy search hot paths.', hints: 'src/platform/ai/kokoro-tts.ts chunkText over a large document; src/platform/ai/nlq.ts deterministic translate over a batch of many questions; any fuse.js-backed search helper if present. Pure only — no model calls.' },
  { key: 'reconciliation-catalog', area: 'Reconciliation matching + catalog sync over large sets.', hints: 'src/features/reconciliation/* amount-matching/variance over 10k+ paired rows; src/core/stores/data-store.ts replaceDatasetsFromCatalog mapping over a large catalog (drive via getState, no persistence IO).' },
]

const prompt = (b) => `Write Vitest PERFORMANCE BENCHMARKS for this hot-path area of d:/data-navigator:

AREA: ${b.area}
TARGETS: ${b.hints}

CONVENTIONS (match the existing bench tests/performance/format.bench.ts — READ IT FIRST):
- Use Vitest's bench API: \`import { bench, describe } from "vitest"\` (bench is NOT a global; import it). jsdom env.
- Files go under tests/performance/ MIRRORING src, named *.bench.ts. The vitest benchmark include is tests/performance/**/*.bench.{ts,tsx}.
- Import source via the @/ alias.
- Build deterministic synthetic input ONCE at module/describe scope (outside bench callbacks) so the bench measures the function, not data generation. Use a seeded/counter-based generator (NO Math.random / Date.now — they are unavailable and non-deterministic). Vary by index.
- Bench REAL hot-path pure functions only. No IO, no DuckDB, no model, no network — if a module imports such a boundary, mock it so the pure function under test runs. Realistic sizes (10k–100k rows / long series / wide schemas) so the numbers mean something.
- Add a couple of sizes per function where useful (e.g. 10k and 100k) as separate bench() cases with clear names.

PROCESS:
1. Read tests/performance/format.bench.ts + the target source to find the exact exported hot functions.
2. Write the .bench.ts file(s) under tests/performance/ mirroring src.
3. Run ONLY your files: \`pnpm exec vitest bench --run <your bench file paths>\` from d:/data-navigator. Confirm every case executes and emits an ops/sec (hz) number with no errors. Fix any import/mock issues until it runs clean.
4. Distinct files only; do not touch other buckets.

Report per the schema: files created, number of bench cases, whether it ran clean (ran), a few sample result lines as runEvidence, and notes. Output JSON per the schema.`

phase('Bench')
const results = await parallel(
  BUCKETS.map((b) => () =>
    agent(prompt(b), { label: `bench:${b.key}`, phase: 'Bench', schema: BENCH_RESULT })
      .then((r) => (r ? r : { bucket: b.key, ran: false, died: true, benchFilesCreated: [], benchCount: 0 })),
  ),
)
const ran = results.filter((r) => r && r.ran)
const files = results.reduce((n, r) => n + (r && r.benchFilesCreated ? r.benchFilesCreated.length : 0), 0)
const cases = results.reduce((n, r) => n + (r && r.benchCount ? r.benchCount : 0), 0)
log(`Wave 2 done: ${ran.length}/${results.length} buckets ran, ${files} bench files, ${cases} cases`)
return { results, summary: { bucketsRan: ran.length, buckets: results.length, files, cases } }