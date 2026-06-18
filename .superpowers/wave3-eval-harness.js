export const meta = {
  name: 'wave3-eval-harness',
  description: 'Build an offline-LLM eval harness (deterministic always-on + live gated) and 4 eval suites',
  phases: [
    { title: 'Scaffold', detail: 'one agent builds evals/ infra: config, scripts, scoring + model-detection helpers' },
    { title: 'Suites', detail: 'parallel agents build nlq / structured-output / swarm+sql-safety / briefing evals' },
  ],
}

const SCAFFOLD_RESULT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    filesCreated: { type: 'array', items: { type: 'string' } },
    scriptsAdded: { type: 'array', items: { type: 'string' } },
    harnessApi: { type: 'string', description: 'EXACT exported helpers + signatures from evals/_harness.ts and evals/_model.ts so suite agents can use them verbatim' },
    runCommand: { type: 'string', description: 'the exact command to run the eval suite' },
    smokeRan: { type: 'boolean' },
    runEvidence: { type: 'string' },
    notes: { type: 'string' },
  },
  required: ['filesCreated', 'scriptsAdded', 'harnessApi', 'runCommand', 'smokeRan', 'runEvidence', 'notes'],
}

const EVAL_RESULT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    suite: { type: 'string' },
    filesCreated: { type: 'array', items: { type: 'string' } },
    deterministicEvalCount: { type: 'number' },
    liveEvalCount: { type: 'number', description: 'evals gated behind the model-presence flag (skipped without a model)' },
    deterministicPassing: { type: 'boolean' },
    metricsSummary: { type: 'string', description: 'the metrics each eval computes + the thresholds asserted' },
    runEvidence: { type: 'string' },
    notes: { type: 'string' },
  },
  required: ['suite', 'filesCreated', 'deterministicEvalCount', 'liveEvalCount', 'deterministicPassing', 'metricsSummary', 'runEvidence', 'notes'],
}

const scaffoldPrompt = `Build an OFFLINE-LLM EVAL HARNESS from scratch for the Next.js+Electron app at d:/data-navigator. No eval harness currently exists. The app runs a local LLM (node-llama-cpp) with NL->SQL, structured output (Zod), a multi-agent "Moudir" swarm, and AI briefings. Memory: the GGUF model lives at %APPDATA%/Electron/models/llm and is NOT always present, so LIVE evals must skip cleanly when absent.

Build ALL of this and keep it OUT of the normal unit suite (the default vitest include is tests/**, so put evals under evals/):

1. **vitest.eval.config.ts** (repo root): a vitest config whose include is ['evals/**/*.eval.ts']; reuse the base setup/aliases from vitest.config.ts (read it first) so @/ imports + jsdom + tests/setup.ts work; set testTimeout high (e.g. 180000) for live runs; no coverage.

2. **package.json scripts** (add, don't remove existing): "test:eval": "vitest run --config vitest.eval.config.ts", and "test:eval:live": "cross-env DN_EVAL_LIVE=1 vitest run --config vitest.eval.config.ts". (cross-env is already a devDependency.)

3. **evals/_harness.ts** — pure scoring/reporting helpers, e.g.: accuracy(predicted[], gold[], eq?) -> number; mean(nums)->number; assertAtLeast(metric, threshold, label) (throws a clear message if metric < threshold); and a small report(label, metric) that console.logs the score. Keep it dependency-free and well-typed.

4. **evals/_model.ts** — model-presence detection: hasLocalModel(): boolean (true only if process.env.DN_EVAL_LIVE is set AND a GGUF exists under the model dir — check process.env.DN_MODEL_DIR, else the %APPDATA%/Electron/models/llm path via node fs/os; never throw). Export liveIt = hasLocalModel() ? it : it.skip (and liveDescribe similarly) so suites can write live evals that auto-skip. Also export a lazy loadLocalEngine() that dynamically imports the app's llama engine ONLY when called (so importing _model.ts never loads native modules).

5. **evals/fixtures/.gitkeep** and **evals/README.md** documenting how to run deterministic (\`pnpm run test:eval\`) vs live (\`pnpm run test:eval:live\` with the model installed + DN_MODEL_DIR).

6. **evals/smoke.eval.ts** — a tiny eval proving the harness loads and runs (assertAtLeast on a trivial computed metric + one liveIt that skips without a model).

Then RUN \`pnpm exec vitest run --config vitest.eval.config.ts\` from d:/data-navigator and confirm it passes (deterministic green, live skipped). Iterate until green.

Report per schema. CRITICAL: in harnessApi, write the EXACT signatures of every helper you exported from _harness.ts and _model.ts (names, params, return types) — downstream agents will import them verbatim.`

const SUITES = [
  { key: 'nlq', focus: 'NL->SQL translation quality', detail: 'Build evals/fixtures/nlq-gold.json: a labelled corpus of {question, expectedShape} (telecom-flavoured questions → expected SQL intent: aggregation, group-by column, filter, etc.). DETERMINISTIC: run the pattern translator in src/platform/ai/nlq.ts over the corpus, score accuracy vs gold (shape/intent match), assertAtLeast a sane threshold (set it to what the current translator actually achieves, do not invent). LIVE (liveIt): prompt the local engine for SQL, assert it parses via node-sql-parser and is read-only (reuse assertReadOnlySql), and optionally executes against an in-memory dataset; score executable-rate.' },
  { key: 'structured', focus: 'Structured-output schema conformance', detail: 'Build a corpus of raw model-like outputs (clean JSON, fenced ```json blocks, trailing prose, minor JSON errors) + target Zod schemas. DETERMINISTIC: measure parseStructured/extractJsonBlock/repairJson recovery-rate (in src/platform/ai/provider/structured.ts) over the corpus, assertAtLeast. LIVE (liveIt): prompt the model for a small structured object and measure FIRST-PASS schema conformance (no repair needed) rate.' },
  { key: 'swarm-safety', focus: 'Swarm plan validity + SQL safety (deterministic-heavy)', detail: 'DETERMINISTIC: (a) feed canned SwarmPlans/Artifacts (valid + subtly-invalid: missing columns, empty tables, bad KPI deltas) through validateArtifact / the swarm validate logic (src/features/data-formulator/core/swarm/agents/validate.ts) and score catch-rate of invalid ones (assert 100% of unsafe caught). (b) SQL-safety: a corpus of safe SELECTs + unsafe statements (DROP/DELETE/UPDATE/INSERT/ATTACH/PRAGMA/multi-statement) through assertReadOnlySql; assert it blocks ALL unsafe and allows ALL safe (precision+recall=1).' },
  { key: 'briefing', focus: 'AI briefing grounding', detail: 'Write a grounding scorer: given synthetic KPIs (numbers) and a briefing text, score whether every numeric claim in the text traces to a real input figure (no invented metrics) and key figures are mentioned. DETERMINISTIC: run the scorer over canned/templated briefings (well-grounded + deliberately-hallucinated) and assert it scores grounded ones high and hallucinated ones low. LIVE (liveIt): generate a briefing over synthetic KPIs via the local engine and assertAtLeast a grounding threshold.' },
]

const suitePrompt = (s, scaffold) => `Build the "${s.key}" eval suite for d:/data-navigator using the eval harness that was just scaffolded.

HARNESS API (use these exact helpers; import from @/ or relative as appropriate — the scaffold created evals/_harness.ts and evals/_model.ts):
${scaffold.harnessApi}

Run command: ${scaffold.runCommand}

FOCUS: ${s.focus}
WHAT TO BUILD: ${s.detail}

RULES:
- Put your file(s) under evals/ named *.eval.ts (so the eval config picks them up). Fixtures under evals/fixtures/.
- DETERMINISTIC evals must run with NO model and pass (these are the real gate). Use assertAtLeast with thresholds calibrated to ACTUAL current behavior — first measure, then set the threshold at/just below what you observe; never invent a passing number.
- LIVE evals must use liveIt/liveDescribe from evals/_model.ts so they SKIP cleanly when no model is present. Never call a real model at import time.
- Read the actual source under test (src/platform/ai/*, src/features/data-formulator/core/swarm/*) to use real function signatures.
- Run \`${scaffold.runCommand} <your eval file>\` and confirm the deterministic evals pass and live ones skip. Iterate to green.

Report per schema: files created, deterministic vs live eval counts, whether deterministic passes, the metrics+thresholds, the run summary line, and notes.`

phase('Scaffold')
const scaffold = await agent(scaffoldPrompt, { label: 'eval-scaffold', phase: 'Scaffold', schema: SCAFFOLD_RESULT })
if (!scaffold || !scaffold.smokeRan) {
  log('Eval scaffold failed or smoke did not run — stopping before suites.')
  return { scaffold, results: [] }
}
log(`Scaffold OK: ${(scaffold.filesCreated || []).length} files; run via "${scaffold.runCommand}"`)

phase('Suites')
const results = await parallel(
  SUITES.map((s) => () =>
    agent(suitePrompt(s, scaffold), { label: `eval:${s.key}`, phase: 'Suites', schema: EVAL_RESULT })
      .then((r) => (r ? r : { suite: s.key, deterministicPassing: false, died: true, filesCreated: [], deterministicEvalCount: 0, liveEvalCount: 0 })),
  ),
)
const green = results.filter((r) => r && r.deterministicPassing)
const det = results.reduce((n, r) => n + (r && r.deterministicEvalCount ? r.deterministicEvalCount : 0), 0)
const live = results.reduce((n, r) => n + (r && r.liveEvalCount ? r.liveEvalCount : 0), 0)
log(`Wave 3 done: ${green.length}/${results.length} suites green; ${det} deterministic evals, ${live} live-gated evals`)
return { scaffold, results, summary: { suitesGreen: green.length, suites: results.length, deterministicEvals: det, liveEvals: live } }