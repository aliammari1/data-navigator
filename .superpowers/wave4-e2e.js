export const meta = {
  name: 'wave4-e2e',
  description: 'Write Playwright e2e specs for flagship + uncovered journeys; fix stale /dashboard/browser refs',
  phases: [
    { title: 'E2E', detail: 'one agent per journey: write spec, verify it loads via `playwright test --list`' },
  ],
}

const E2E_RESULT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    area: { type: 'string' },
    specFilesCreated: { type: 'array', items: { type: 'string' } },
    specFilesEdited: { type: 'array', items: { type: 'string' } },
    testCount: { type: 'number' },
    listsClean: { type: 'boolean', description: 'did `playwright test --list <spec>` collect the tests with no load/parse error' },
    runEvidence: { type: 'string' },
    notes: { type: 'string' },
  },
  required: ['area', 'specFilesCreated', 'specFilesEdited', 'testCount', 'listsClean', 'runEvidence', 'notes'],
}

const BUCKETS = [
  { key: 'telecom-report', area: 'TELECOM FLAGSHIP — full report journey', detail: 'New spec tests/e2e/telecom-report-journey.spec.ts that walks the telecom report: /dashboard/telecom-report (redirects to overview) then the tabs overview/canals/analysis/grid/period/day/history/config. Assert each tab route loads and shows its key region (KPIs on overview, the data grid on grid, channel content on canals, config controls on config). Use resilient role/text locators, not brittle selectors.' },
  { key: 'collaboration', area: 'Collaboration (the merged collab-hub surfaces)', detail: 'New spec tests/e2e/collaboration-journey.spec.ts: visit /dashboard/collaborative and assert the CollaborationScreen renders, then that the NEW telecom-aware tabs exist — Annotations, Approval (with its REVIEW badge), Audit — and switching tabs shows their content. These came from the recent collab-hub merge.' },
  { key: 'desktop-workspace', area: 'Desktop workspace (default shell)', detail: 'New spec tests/e2e/desktop-journey.spec.ts: load /dashboard (desktop mode is the default), assert the dock and desktop canvas render, open the Launchpad, launch a couple of apps (e.g. Rapport Télécom, Paramètres) and assert a window appears. Keep locators resilient; allow for the windowed shell.' },
  { key: 'data-tools', area: 'Data tooling journeys (csv-parser / data-browser / report-studio)', detail: 'New spec tests/e2e/data-tools-journey.spec.ts smoke-testing /dashboard/csv-parser, /dashboard/data-browser, and /dashboard/report-studio — each route loads and shows its primary surface (dropzone/parse controls; the explorer grid/SQL; the report builder).' },
  { key: 'fix-stale-browser', area: 'Repair stale /dashboard/browser references', detail: 'Edit tests/e2e/complete-user-journeys.spec.ts and tests/e2e/ai-analysis-journey.spec.ts: the route /dashboard/browser was removed (now a redirect → /dashboard/telecom-report/grid). Repoint those navigations to a SURVIVING route that matches each test’s intent — /dashboard/data-browser (the generic SQL/duckdb explorer) is the closest functional match for the anchored "browser|sql|duckdb" steps; update the path AND the content anchor regex to match the real target page. Do not delete the test coverage; relocate it.' },
]

const prompt = (b) => `Write/repair Playwright E2E tests for d:/data-navigator.

AREA: ${b.area}
TASK: ${b.detail}

CONVENTIONS (match the existing suite — READ FIRST): read playwright.config.ts (baseURL http://localhost:3000, projects incl. mobile) and 2 existing specs (tests/e2e/complete-user-journeys.spec.ts, tests/e2e/navigation-journey.spec.ts) to reuse their helpers/patterns (e.g. a gotoPage(page, path, anchorRegex) helper if present, how they assert a route loaded, how they handle the dashboard shell). Specs live in tests/e2e/*.spec.ts.

RULES:
- Use resilient locators: getByRole / getByText / getByTestId with sensible regexes; avoid brittle CSS/nth selectors. The app UI is in French — match French labels (Rapport, Canaux, Analyse, Annotations, Validation/Approbation, Audit, Paramètres, etc.) but keep anchors tolerant (case-insensitive, alternations).
- Tests must be robust to the windowed desktop shell being the default at /dashboard.
- Do NOT run the full e2e suite (no dev server here). VERIFY your spec(s) only by collection: run \`pnpm exec playwright test --list <your spec path>\` from d:/data-navigator and confirm it lists your tests with NO load/parse/import error. Fix any TypeScript/import errors until --list is clean.
- Distinct files per bucket; the fix-stale-browser bucket EDITS the two named existing specs (others create new specs).

Report per schema: spec files created/edited, test count, whether --list was clean (listsClean), the --list output summary as runEvidence, and notes (incl. any assumptions about labels you couldn’t verify without running).`

phase('E2E')
const results = await parallel(
  BUCKETS.map((b) => () =>
    agent(prompt(b), { label: `e2e:${b.key}`, phase: 'E2E', schema: E2E_RESULT })
      .then((r) => (r ? r : { area: b.key, listsClean: false, died: true, specFilesCreated: [], specFilesEdited: [], testCount: 0 })),
  ),
)
const clean = results.filter((r) => r && r.listsClean)
const created = results.reduce((n, r) => n + (r && r.specFilesCreated ? r.specFilesCreated.length : 0), 0)
const tests = results.reduce((n, r) => n + (r && r.testCount ? r.testCount : 0), 0)
log(`Wave 4 done: ${clean.length}/${results.length} buckets list-clean; ${created} new specs, ~${tests} tests`)
return { results, summary: { listClean: clean.length, buckets: results.length, newSpecs: created, tests } }