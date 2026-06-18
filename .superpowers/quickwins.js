export const meta = {
  name: 'telecom-quickwins',
  description: 'Four approved quick-wins: telecom tab-nav, stats NaN fix, add-widget entry, AI answer streaming',
  phases: [
    { title: 'Implement', detail: 'four implementers in parallel, each owns disjoint files' },
    { title: 'Verify', detail: 'one agent runs pnpm run build + full unit suite, fixes, reports green' },
  ],
}

const IMPL = {
  type: 'object',
  additionalProperties: false,
  properties: {
    item: { type: 'string' },
    filesChanged: { type: 'array', items: { type: 'string' } },
    filesCreated: { type: 'array', items: { type: 'string' } },
    selfCheck: { type: 'string', description: 'what you verified (targeted vitest run / type soundness / pattern match)' },
    risk: { type: 'string' },
    notes: { type: 'string' },
  },
  required: ['item', 'filesChanged', 'selfCheck', 'notes'],
}

const VERIFY = {
  type: 'object',
  additionalProperties: false,
  properties: {
    buildGreen: { type: 'boolean' },
    testGreen: { type: 'boolean' },
    buildTail: { type: 'string' },
    testTail: { type: 'string' },
    fixesApplied: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
  required: ['buildGreen', 'testGreen', 'buildTail', 'testTail', 'notes'],
}

const ITEMS = [
  {
    key: 'tab-nav',
    detail: `TELECOM TAB NAVIGATION. The 8 telecom report tabs are reachable only by URL today. Add a horizontal tab strip inside the telecom report shell so all tabs are discoverable.
- Edit src/features/telecom/components/telecom-report-runtime.tsx (the report shell, ~1066 lines): render a horizontal tab strip directly under the existing header chrome (above the routed children/content area). Prefer extracting a small new component src/features/telecom/components/telecom-tab-strip.tsx and mounting it in the shell.
- Tabs (route -> French label): overview -> "Vue d'ensemble", canals -> "Canaux", analysis -> "Analyse", grid -> "Données", period -> "Période", day -> "Jour", history -> "Historique", config -> "Config". Routes are /dashboard/telecom-report/<seg>.
- Use next/link (Link) for each tab and usePathname() to mark the active tab. Horizontal, scrollable on small widths.
- STYLE: reuse the EXISTING report header styling and shadcn semantic tokens already used in telecom-report-runtime.tsx (bg-background/muted/foreground/border, primary for active). Do NOT introduce any new colors, gradients, or visual language. Match the chrome that is already there.
- It must render in both the standalone /dashboard/telecom-report route AND when the telecom app is hosted as a desktop window (the shell renders the strip either way; client-side Link navigation works inside the framed route).
SELF-CHECK: ensure TypeScript is sound (correct Link/usePathname imports from next/link and next/navigation, "use client" already present in the shell). Do not run a full build (the verify phase does).`,
  },
  {
    key: 'stats-nan',
    detail: `STATS NaN FIX. pearsonCorrelation and linearRegression return NaN on zero-variance (constant) inputs and that NaN reaches the UI (correlation cards, forecast fallbacks, narratives).
- Edit src/features/ai-analysis/model/stats.ts: guard pearsonCorrelation to RETURN 0 when either series has zero variance (no linear relationship; keep the value in [-1,1]). Guard linearRegression so a degenerate x (zero variance) returns { slope: 0, intercept: mean(y), r2: 0 } and r2 is 0 (not NaN) whenever the denominator is 0 (e.g. constant y). Never return NaN/Infinity from either; keep the numeric return contract.
- Check src/platform/ai/insights.ts for its own correlation/regression usage (e.g. a local helper or call site that could surface NaN) and apply the same guard / use the fixed functions. Also check src/features/telecom/lib/insights.ts linearRegression for the same degenerate-x issue and guard it too.
- UPDATE THE PINNED TESTS that documented the buggy behavior so they now assert the SAFE contract (finite, in-range): tests/features/ai-analysis/stats.test.ts (the Wave-1 unit tests) and tests/features/ai-analysis/stats.prop.test.ts (the Wave-5 property tests). Where a test previously asserted/allowed NaN on a constant column, change it to assert 0 / finite-in-range.
SELF-CHECK: run pnpm exec vitest run tests/features/ai-analysis/stats.test.ts tests/features/ai-analysis/stats.prop.test.ts and confirm green. Do not modify unrelated tests.`,
  },
  {
    key: 'add-widget',
    detail: `ADD-WIDGET ENTRY. The desktop widget engine is real and live but there is no user-facing way to add a widget (the addWidget store action is unreachable dead code).
- Read src/features/desktop/store/desktop-store.ts to find the exact addWidget action signature and the Widget type union (kpi / sparkline / clock / channels) + how position/config are passed.
- Edit src/features/desktop/components/desktop-context-menu.tsx: add an "Ajouter un widget" item that opens a submenu listing the 4 widget types with French labels (KPI -> "KPI", sparkline -> "Tendance", channels -> "Canaux", clock -> "Horloge"). Selecting one calls addWidget with that type, positioned at the right-click point (the context menu already has the click coordinates — reuse them; otherwise a sensible default canvas position).
- Match the existing context-menu markup/components and shadcn tokens already used in desktop-context-menu.tsx (likely a shadcn ContextMenu/DropdownMenu with ContextMenuSub). No new visual language.
SELF-CHECK: TypeScript soundness; the widget types + addWidget signature match the store exactly. Do not run a full build.`,
  },
  {
    key: 'ai-stream',
    detail: `AI ANSWER STREAMING + CRITIC DEFAULT-OFF. The Moudir final answer is generated non-streamed (full TTFT wait); streaming makes it feel 3-8x faster.
- Find the answer agent: src/features/data-formulator/core/swarm/agents/answer.ts (runAnswer) — confirm it accepts an onToken/streaming callback (the audit says it does). Find the orchestrator src/features/data-formulator/core/swarm/orchestrator.ts and the answer UI panel under src/features/data-formulator/components/ (e.g. manager-answer-panel.tsx or the Moudir answer surface) + the swarm store (src/features/data-formulator/store/).
- STREAM: wire runAnswer's onToken through the orchestrator into the swarm store so the answer panel renders the answer prose incrementally as tokens arrive (append to a streaming buffer; finalize on completion). Keep the structured result intact at the end.
- CRITIC DEFAULT-OFF: find where the batched critic agent runs in the orchestrator. Gate it behind a setting (add e.g. enableAiCritic to src/core/stores/settings-store.ts, default false) and only run the critic when enabled. The existing validators (validate.ts) already catch the dangerous cases, so default-off is safe. If there is a settings UI surface for AI, add the toggle there; otherwise just the store flag is fine.
SELF-CHECK: TypeScript soundness; do not break the swarm result shape. If you add a settings field, keep its persist/migrate consistent with the other settings fields. Do not run a full build.`,
  },
]

const implPrompt = (it) => `Implement ONE approved quick-win in the offline Next.js + Electron app at d:/data-navigator. The user approved this exact change; build it cleanly and idiomatically.

${it.detail}

GLOBAL RULES: match existing code patterns + shadcn semantic tokens (NO new colors/gradients/visual language, no AI slop). No new dependencies. Edit only the files this task names (plus a small new component if specified). Do NOT touch other quick-wins' files. Keep changes minimal and reviewable. Another agent will run the full build + test afterward, so focus on correctness + the specified self-check.

Report per schema: item, files changed/created, what you self-checked, risk, notes.`

const verifyPrompt = (impl) => `Four quick-wins were just implemented in parallel in d:/data-navigator:
${(impl || []).filter(Boolean).map((r) => `- ${r.item}: changed ${(r.filesChanged || []).concat(r.filesCreated || []).join(', ')}`).join('\n')}

Verify the whole thing is green and fix anything broken:
1. Run pnpm run build (Next build incl TypeScript type-check) from d:/data-navigator. It MUST exit 0 / fully green. If it fails, READ the errors and FIX them (compile errors from the new tab strip / context menu / streaming wiring, type errors, missing imports). Iterate until green. Do not weaken types to pass.
2. Run pnpm run test (the full Vitest unit suite). It MUST be green — pay attention to the stats tests that were updated for the NaN fix; if any stale assertion remains, fix the TEST to the correct safe contract (finite/in-range), not the source.
Keep fixes minimal and correct; do not revert the quick-wins. Report buildGreen, testGreen, the final build + test summary lines as evidence (buildTail/testTail), the list of fixes you applied, and notes.`

phase('Implement')
const impl = await parallel(
  ITEMS.map((it) => () =>
    agent(implPrompt(it), { label: `impl:${it.key}`, phase: 'Implement', schema: IMPL })
      .then((r) => (r ? r : { item: it.key, died: true, filesChanged: [], selfCheck: 'agent died', notes: '' })),
  ),
)
log(`Implemented ${impl.filter((r) => r && !r.died).length}/${ITEMS.length} quick-wins; verifying...`)

phase('Verify')
const verify = await agent(verifyPrompt(impl), { label: 'verify:build+test', phase: 'Verify', schema: VERIFY })
log(`Verify: build=${verify && verify.buildGreen} test=${verify && verify.testGreen}`)
return { impl, verify }