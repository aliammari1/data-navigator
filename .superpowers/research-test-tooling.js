export const meta = {
  name: 'research-test-tooling',
  description: 'Web-research best-in-class perf, LLM-eval, throughput, property+mutation testing tools for this stack',
  phases: [
    { title: 'Research', detail: 'one agent per tooling category: web search + fetch docs, return vetted recommendations' },
  ],
}

const RESEARCH_RESULT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    category: { type: 'string' },
    tools: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          npmPackage: { type: 'string', description: 'exact install name plus latest version if found' },
          whatItAdds: { type: 'string' },
          fitsStack: { type: 'string', description: 'compatibility with Vitest 4 / Node / TypeScript / node-llama-cpp local GGUF / offline-first / Electron' },
          maturity: { type: 'string', description: 'stars/activity/last-release signal' },
          integrationEffort: { type: 'string', enum: ['tiny', 'small', 'medium', 'large'] },
          recommendation: { type: 'string', enum: ['adopt', 'consider', 'skip'] },
          notes: { type: 'string' },
          source: { type: 'string', description: 'primary URLs consulted' },
        },
        required: ['name', 'npmPackage', 'whatItAdds', 'fitsStack', 'integrationEffort', 'recommendation', 'source'],
      },
    },
    topPick: { type: 'string' },
    summary: { type: 'string' },
  },
  required: ['category', 'tools', 'topPick', 'summary'],
}

const CATEGORIES = [
  { key: 'perf-bench', title: 'JavaScript/TypeScript performance benchmarking and regression tooling', detail: 'Tools that improve on bare vitest bench / tinybench: continuous benchmarking plus CI regression detection (for example CodSpeed @codspeed/vitest-plugin), higher-precision microbench (mitata), benchmark.js, Tachometer, hyperfine, github-action-benchmark. Which integrate with VITEST 4 bench and a CI that already runs vitest? Which detect perf regressions over time (instrumented vs wall-clock)? The app is an offline Electron+Next desktop app (not a high-traffic server), so prioritize microbenchmark accuracy plus CI regression tracking over HTTP load tools, but note if any load tool (autocannon/k6) is worth it for the Next server routes.' },
  { key: 'llm-eval', title: 'JS/TS LLM-output evaluation frameworks that work with LOCAL models', detail: 'Frameworks for evaluating LLM OUTPUT QUALITY that run in TypeScript/Node and can target a LOCAL model (node-llama-cpp or a custom generate function), NOT just hosted APIs. Compare promptfoo, Evalite (vitest-native), autoevals (Braintrust), Langfuse, Inspect, DeepEval (note if Python-only). Focus on local/custom-provider support, assertion/scoring capabilities (factuality, JSON-schema conformance, rubric or LLM-as-judge), CI-friendliness, and how each would COMPLEMENT an existing custom vitest-based eval harness (an evals/ folder with deterministic plus gated-live evals). Note license plus maintenance.' },
  { key: 'llm-throughput', title: 'Local LLM inference throughput/latency benchmarking (GGUF / node-llama-cpp / llama.cpp)', detail: 'How to measure THROUGHPUT for the offline model: tokens/sec (generation and prompt eval), time-to-first-token (TTFT), tokens-per-second under load, memory. Cover llama.cpp llama-bench, node-llama-cpp built-in timing/metrics APIs (does it expose tokens/sec, eval timings?), and patterns for a repeatable throughput benchmark in Node. Give a CONCRETE approach to add a tokens/sec plus TTFT benchmark for the node-llama-cpp engine used by this app (src/platform/ai and electron/llama-service.ts), ideally runnable via the existing eval or bench setup. Note any standard metric definitions to report.' },
  { key: 'property-mutation', title: 'Property-based and mutation testing to harden the new suites', detail: 'Tools to raise test QUALITY for the roughly 1000 new unit tests over pure functions: property-based testing (fast-check, is it Vitest 4 compatible, plus @fast-check/vitest?) for the pure logic (stats, parsers, coercers, transforms, telecom math), and mutation testing (Stryker / @stryker-mutator with the vitest runner) to measure whether the tests actually catch bugs. Note compatibility with Vitest 4, run cost, and a sane scope (for example mutation-test only the highest-value modules). Also note property-based fuzzing for the SQL-safety and NL-to-SQL paths.' },
]

const prompt = (c) => `Research the BEST current (2025 to 2026) tools in this category for the project at d:/data-navigator, using the web. Then return vetted, concrete recommendations.

CATEGORY: ${c.title}
WHAT I NEED: ${c.detail}

PROJECT STACK (for compatibility judgments): Vitest 4.1.8 (unit and bench), Playwright 1.60, @vitest/coverage-v8, TypeScript 6, Node 24, pnpm 10, Next 16, Electron 41, an offline local LLM via node-llama-cpp 3.x (GGUF qwen2.5-1.5b), and a brand-new custom eval harness under evals/ (deterministic plus model-gated-live, vitest-based). Offline-first product; CI runs vitest plus a build via GitHub Actions.

METHOD:
- Use web search plus fetch official docs, GitHub READMEs, npm pages. Load WebSearch and WebFetch via ToolSearch (query "select:WebSearch,WebFetch") first.
- Verify CURRENT package names, latest versions, last-release recency, and explicit Vitest-4 / Node-24 / TypeScript compatibility (flag if a tool only supports Vitest 1 to 3, or is Python-only).
- Prefer maintained, popular, license-clean tools that fit an offline/local-model plus vitest workflow. Be skeptical of abandoned or hosted-only tools.

Return per schema: for each candidate tool give npmPackage (plus version), whatItAdds, fitsStack (explicit compat verdict), maturity, integrationEffort, a recommendation (adopt/consider/skip), notes, and source URLs. Then a topPick and a short summary. Aim for 3 to 6 real candidates; do not pad with irrelevant tools.`

phase('Research')
const results = await parallel(
  CATEGORIES.map((c) => () =>
    agent(prompt(c), { label: `research:${c.key}`, phase: 'Research', schema: RESEARCH_RESULT })
      .then((r) => (r ? r : { category: c.key, died: true, tools: [], topPick: 'n/a', summary: 'agent died' })),
  ),
)
const adopt = results.flatMap((r) => (r.tools || []).filter((t) => t.recommendation === 'adopt').map((t) => `${r.category}: ${t.name} (${t.npmPackage})`))
log(`Research done across ${results.length} categories; ${adopt.length} adopt recommendations`)
return { results, adopt }