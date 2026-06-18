export const meta = {
  name: 'wave1-unit-tests',
  description: 'Write + run Vitest unit tests across untested pure-logic modules (telecom-first)',
  phases: [
    { title: 'Unit', detail: 'one agent per module bucket: write tests, run vitest on own files to green' },
  ],
}

const UNIT_RESULT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    bucket: { type: 'string' },
    testFilesCreated: { type: 'array', items: { type: 'string' } },
    testCount: { type: 'number' },
    allPassing: { type: 'boolean' },
    runEvidence: { type: 'string', description: 'tail of the final `vitest run` output (the pass/fail summary line)' },
    modulesCovered: { type: 'array', items: { type: 'string' } },
    skipped: { type: 'array', items: { type: 'string' }, description: 'modules in scope you did NOT test, with the reason' },
    notes: { type: 'string' },
  },
  required: ['bucket', 'testFilesCreated', 'testCount', 'allPassing', 'runEvidence', 'modulesCovered', 'notes'],
}

const BUCKETS = [
  { key: 'dedup-shared-cores', area: 'The shared cores created during the recent dedup consolidation (lock in their behavior).', hints: 'src/shared/duckdb-summary.ts (numberOrUndefined, nullRateFromSummary), src/platform/ai/kokoro-tts.ts (normalizeText, splitIntoSentences, chunkText — NOT the model load), src/features/data-import/model/summarize.ts (mapDuckTypeToColumnInfoType + pure helpers), and any pure helpers in src/features/data-import/lib/import-pipeline.ts (fileNameFromPath, isSupported* allow-lists).' },
  { key: 'store-data', area: 'The main data store.', hints: 'src/core/stores/data-store.ts — datasets, query history, saved charts, transforms. Test actions/selectors by driving the zustand store directly (getState/setState); cover add/update/remove/clear, dedupe, and any derived selectors.' },
  { key: 'store-context-session-activity', area: 'App context + telecom session + activity (telecom session is flagship — test thoroughly).', hints: 'src/core/stores/app-context-store.ts, src/core/stores/app-session-store.ts (useTelecomSessionStore: table/file/report-date + restore), src/core/stores/activity-store.ts (ring buffer / event log).' },
  { key: 'store-folders', area: 'Folders catalog store + queries.', hints: 'src/core/stores/folders-store.ts (folders, dataset placement, starring), src/core/queries/folders.ts (pure parts only).' },
  { key: 'platform-ai-nlq-insights', area: 'NL->SQL pattern translator + insights (pure, high value).', hints: 'src/platform/ai/nlq.ts (the deterministic pattern-based NL->SQL translator + confidence; mock any LLM fallback), src/platform/ai/insights.ts (pure aggregation/formatting parts). Do NOT invoke a live model — mock the inference boundary.' },
  { key: 'swarm-orchestration', area: 'Data-formulator swarm orchestration logic (mock inference).', hints: 'src/features/data-formulator/core/swarm/scheduler.ts, router.ts, orchestrator.ts — test scheduling/queueing, routing decisions, and plan assembly with the LLM/inference boundary MOCKED. Pure logic only; do not call a real model.' },
  { key: 'swarm-agents', area: 'Swarm agent prompt-building + result-shaping (mock the LLM).', hints: 'src/features/data-formulator/core/swarm/agents/{critic,analyze,answer,lookup,base}.ts — mock the model call (return canned structured output) and assert prompt construction, schema parsing, artifact shaping, and the critic/validate decisions. validate.ts already has a test — extend siblings.' },
  { key: 'telecom-lib', area: 'TELECOM FLAGSHIP — library/computation logic beyond format (already tested).', hints: 'Explore src/features/telecom/lib/* and src/features/telecom/model/* — chart-options.ts (theme-driven palette), any KPI/aggregation/status-mapping/hourly-series/operator-matrix pure functions. Write thorough tests for the report computations. This is the most important feature in the app.' },
  { key: 'telecom-runtime', area: 'TELECOM FLAGSHIP — runtime/derivation helpers (pure parts).', hints: 'Explore src/features/telecom/ for pure derivation: status legend mapping, success-rate/volume computation, channel/region grouping, period-over-period and day analytics math. Mock DuckDB; test the pure transforms on in-memory rows.' },
  { key: 'reconciliation-lineage', area: 'Reconciliation variance/matching + lineage DAG helpers.', hints: 'src/features/reconciliation/* (variance detection, amount matching, gap audit — pure), src/features/lineage/core/elk-layout.ts + any DAG/graph builders (pure parts; mock elkjs if needed).' },
  { key: 'data-transform', area: 'Transform pipeline pure logic.', hints: 'src/features/data-transform/* — the transform step engine (filter/aggregate/join/pivot/derive/rename/sort/dedup/sample) applied to in-memory rows; compileFilter / filter DSL if present; SQL/recipe generation.' },
  { key: 'monitor-geo-parsed', area: 'Channel monitor alert rules + geo aggregation + parsed-data summary.', hints: 'src/features/channel-monitor/* (alert-rule evaluation, SLA/threshold logic), src/features/geo-analysis/* (region/H3 aggregation pure parts), src/features/parsed-data/model/summary-map.ts (extend coverage of the coercers/profile mapping).' },
]

const prompt = (b) => `Write high-quality Vitest UNIT tests for this area of the Next.js + Electron app at d:/data-navigator:

AREA: ${b.area}
TARGET FILES (explore to find exact exports; adjust if paths differ): ${b.hints}

CONVENTIONS (match the existing suite exactly):
- Vitest 4 with globals (describe/it/expect/vi) — no imports of the test fns needed. jsdom env.
- Tests live under the top-level tests/ tree MIRRORING the src path (e.g. src/shared/duckdb-summary.ts -> tests/shared/duckdb-summary.test.ts). The vitest include is tests/**/*.{test,spec}.{ts,tsx} — files MUST be under tests/ or they won't run.
- Import source via the @/ alias (e.g. import { chunkText } from "@/platform/ai/kokoro-tts").
- For React components use the custom render from tests/test-utils.tsx (NOT @testing-library/react directly). Read tests/test-utils.tsx and an existing test (e.g. tests/features/telecom/format.test.ts, tests/features/ai-analysis/stats.test.ts, tests/platform/ai/provider-structured.test.ts) FIRST to copy conventions.
- AAA structure; descriptive behavior names ("returns empty array when ...", "throws when ..."). Cover happy path, edge cases, and error/empty/boundary inputs. NO brittle snapshot tests, no testing of trivial getters, no asserting implementation details. Test REAL behavior and contracts.
- For modules with IO/LLM/DuckDB/worker boundaries: MOCK the boundary (vi.mock / vi.fn) and test the pure orchestration + data shaping around it. Never call a real model, real DuckDB, or real network.

PROCESS:
1. Read the target source files + tests/test-utils.tsx + 1-2 existing tests for conventions.
2. Write the test file(s) under tests/ mirroring src.
3. Run ONLY your own files: \`pnpm exec vitest run <your test file paths>\` from d:/data-navigator. Read the output. If failing, fix the TEST (or the test's understanding of the code — do NOT modify source unless you find a genuine bug; if you find a real source bug, note it in skipped/notes and test around it). Iterate until your files are fully green.
4. Do not touch other buckets' files. Distinct test files only.

Report per the schema: the test files you created, total test count, whether all your files pass (allPassing), the final vitest summary line as runEvidence, the modules you covered, anything in scope you skipped (with reason), and notes (incl. any real source bugs found). Output JSON per the schema.`

phase('Unit')
const results = await parallel(
  BUCKETS.map((b) => () =>
    agent(prompt(b), { label: `unit:${b.key}`, phase: 'Unit', schema: UNIT_RESULT })
      .then((r) => (r ? { ...r } : { bucket: b.key, allPassing: false, died: true, testFilesCreated: [], testCount: 0 })),
  ),
)
const ok = results.filter((r) => r && r.allPassing)
const totalTests = results.reduce((n, r) => n + (r && r.testCount ? r.testCount : 0), 0)
const totalFiles = results.reduce((n, r) => n + (r && r.testFilesCreated ? r.testFilesCreated.length : 0), 0)
log(`Wave 1 done: ${ok.length}/${results.length} buckets green, ${totalFiles} files, ${totalTests} tests`)
return { results, summary: { bucketsGreen: ok.length, buckets: results.length, totalFiles, totalTests } }