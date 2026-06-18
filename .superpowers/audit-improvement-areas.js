export const meta = {
  name: 'audit-improvement-areas',
  description: 'Evidence-based completeness/quality audit across telecom, report-stats, widgets, AI, performance',
  phases: [
    { title: 'Audit', detail: 'one agent per subsystem: find missing/incomplete/stubbed/improvable, with file evidence + impact/effort' },
  ],
}

const FINDINGS = {
  type: 'object',
  additionalProperties: false,
  properties: {
    area: { type: 'string' },
    completenessSummary: { type: 'string', description: 'honest one-paragraph state of this area: how complete/real is it vs stubbed/fake' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          status: { type: 'string', enum: ['missing', 'incomplete', 'stubbed', 'fake-or-placeholder', 'improvable'] },
          evidence: { type: 'string', description: 'concrete file paths + what is/is not there' },
          impact: { type: 'string', enum: ['high', 'medium', 'low'] },
          effort: { type: 'string', enum: ['small', 'medium', 'large'] },
          recommendation: { type: 'string', description: 'the concrete improvement' },
        },
        required: ['title', 'status', 'evidence', 'impact', 'effort', 'recommendation'],
      },
    },
    topOpportunities: { type: 'string', description: 'the 2-3 highest value-to-effort improvements in this area' },
  },
  required: ['area', 'completenessSummary', 'findings', 'topOpportunities'],
}

const BUCKETS = [
  {
    key: 'telecom-completeness',
    title: 'Telecom report engine — feature completeness (the flagship)',
    detail: 'Audit every telecom report tab for completeness and quality. Routes: src/app/dashboard/telecom-report/{overview,canals,analysis,grid,period,day,history,config}; feature code: src/features/telecom/. For EACH tab: is it fully implemented and wired to real data, or partially stubbed / placeholder / TODO / hardcoded? What is MISSING that a telecom transactions report should have (drill-downs, exports, comparisons, alerting, filters, saved views)? Note any "coming soon" / empty states / mock data / commented-out features. Be concrete with file paths.',
  },
  {
    key: 'telecom-stats',
    title: 'Telecom report engine — STATISTICS quality (user emphasized this)',
    detail: 'DEEP audit of the statistical / analytical rigor of the report engine — the user specifically wants the stats parts much better. Look at src/features/telecom/lib/insights.ts (computeAIInsights, detectHourlyAnomalies, computeCanalRiskScore, linearRegression, generateNarrative), src/features/ai-analysis/model/stats.ts, src/features/forecast-intelligence/, src/features/deep-analytics/. Assess: which statistics are actually computed and are they CORRECT/RIGOROUS or naive/fake? (e.g. is anomaly detection real z-score/IQR or a hardcoded threshold? is forecasting real time-series or a toy linear fit? are there confidence intervals, significance tests, seasonality, proper distributions, cohort/segmentation analysis, period-over-period significance, correlation with caveats?). NOTE the known bugs: pearsonCorrelation/linearRegression return NaN on constant columns. Recommend concretely how to make the stats RICHER and more rigorous (specific methods/libraries already available: simple-statistics, @stdlib/stats, @bsull/augurs, ml-* are all deps).',
  },
  {
    key: 'widgets',
    title: 'Desktop widgets',
    detail: 'Audit the desktop widget system. Look at src/features/desktop/ (the widget types in desktop-store: kpi/sparkline/clock/channels and the widget rendering layer/components). For each widget type: is it real and wired to live data, or a stub/placeholder? Is there a way for users to ADD/configure widgets (the user wants user-addable widgets)? What widgets are MISSING that would be valuable on an analytics desktop (live KPI tiles, channel pulse, AI briefing-of-the-day, recent activity, forecast snapshot, anomaly alerts)? How interactive/live are they? Concrete file evidence + improvement recommendations.',
  },
  {
    key: 'ai-features',
    title: 'AI features (Moudir swarm, briefing, Commander, analysis)',
    detail: 'Audit AI feature completeness + quality. src/features/data-formulator/core/swarm/ (Moudir orchestrator + agents), src/features/ai-briefing/, src/features/ai-commander/, src/platform/ai/. Assess: what is fully working vs stubbed/fake/incomplete? Is the swarm orchestration real (multi-agent plan->sql->chart->verify) or partly mocked? Quality of outputs (grounded vs hallucination-prone)? The known LATENCY problem (12+ serialized LLM calls; measured ~4-5 tok/s decode, 8-82s TTFT on CPU) — where is the time spent and how to cut it (parallelize agents, reduce calls, smaller prompts, caching, streaming)? Concrete improvements to make AI better AND faster.',
  },
  {
    key: 'performance',
    title: 'App-wide performance (beyond DuckDB, already analyzed)',
    detail: 'Audit performance bottlenecks across the app (DuckDB query perf is already benchmarked separately — focus on the REST). Look at: render performance of heavy screens (large data grids, charts, telecom tabs), worker usage (chart/export/parse/layout/analysis workers — are heavy computations off-main-thread?), the LLM latency path, large-dataset handling (virtualization, pagination), bundle/load. Where are the real bottlenecks that make the app feel slow, and what are the concrete high-leverage fixes (memoization, virtualization, moving work to workers, query result caching, debouncing, lazy loading)? File evidence + impact/effort.',
  },
]

const prompt = (b) => `Audit this subsystem of the offline Next.js + Electron telecom analytics app at d:/data-navigator. Be brutally HONEST and concrete — the user believes a lot is incomplete and wants real improvements; find the truth with file evidence, do not flatter.

SUBSYSTEM: ${b.title}
WHAT TO ASSESS: ${b.detail}

For each finding give: a clear title; status (missing / incomplete / stubbed / fake-or-placeholder / improvable); concrete evidence (file paths + what is or is not there — quote a stub/TODO/hardcode if you find one); impact (high/medium/low to the product); effort (small/medium/large); and a concrete recommendation. Then a one-paragraph honest completenessSummary of the whole area and the topOpportunities (2-3 best value-to-effort wins).

Read real code. Distinguish REAL implementations from placeholders/mock-data/TODOs. Prioritize findings by impact. Output JSON per the schema.`

phase('Audit')
const results = await parallel(
  BUCKETS.map((b) => () =>
    agent(prompt(b), { label: `audit:${b.key}`, phase: 'Audit', schema: FINDINGS })
      .then((r) => (r ? r : { area: b.key, died: true, completenessSummary: 'agent died', findings: [], topOpportunities: '' })),
  ),
)
const totalFindings = results.reduce((n, r) => n + (r.findings ? r.findings.length : 0), 0)
const highImpact = results.flatMap((r) => (r.findings || []).filter((f) => f.impact === 'high')).length
log(`Audit done across ${results.length} areas; ${totalFindings} findings, ${highImpact} high-impact`)
return { results, summary: { areas: results.length, totalFindings, highImpact } }