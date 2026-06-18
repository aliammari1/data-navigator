export const meta = {
  name: 'telecom-dedup-consolidation',
  description: 'Telecom-first dedup: migrate-then-delete duplicates across 3 build-gated batches',
  phases: [
    { title: 'Consolidate', detail: 'sequential batches, each gated on a fully-green `pnpm run build`' },
  ],
}

const EXEC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    batchKey: { type: 'string' },
    filesDeleted: { type: 'array', items: { type: 'string' } },
    filesChanged: { type: 'array', items: { type: 'string' } },
    migrationsDone: { type: 'array', items: { type: 'string' }, description: 'functionality migrated into a keeper BEFORE its twin was deleted' },
    skipped: { type: 'array', items: { type: 'string' }, description: 'targets NOT actioned, with the reason (e.g. still has a live consumer)' },
    buildGreen: { type: 'boolean', description: 'did `pnpm run build` exit 0 with a fully-green TypeScript type-check' },
    buildTail: { type: 'string', description: 'the final ~15 lines of the last `pnpm run build` output, as evidence' },
    needsRuntimeCheck: { type: 'boolean', description: 'true if behavior changed in ways the build cannot verify (e.g. the collab merge)' },
    notes: { type: 'string' },
  },
  required: ['batchKey', 'filesDeleted', 'filesChanged', 'buildGreen', 'buildTail', 'needsRuntimeCheck', 'notes'],
}

const BATCHES = [
  {
    key: 'dead-twins',
    title: 'Remove dead-code twins (no unique value to migrate)',
    targets: [
      'src/core/stores/file-store.ts — dead demo twin of folders-store. Grep for importers of file-store/useFileStore; migrate any LIVE consumer to folders-store (src/core/stores/folders-store.ts) + src/core/queries/folders.ts; then delete file-store.ts. If a consumer genuinely needs it and cannot be migrated safely, SKIP and report.',
      'src/core/stores/chart-store.ts + src/core/types/chart.ts — dead chart-customization store. Confirm ZERO importers (real charts render via src/platform/viz/OffscreenChart.tsx + chart-client.ts + src/workers/chart.worker.ts). If zero consumers, delete both files.',
      'src/workers/llm.worker.ts + src/hooks/use-llm-inference.ts — dead transformers.js text-gen twin. LIVE path = src/workers/inference.worker.ts + src/features/agent-canvas/core/llm.ts. Repoint any importer of use-llm-inference to the live path (or remove if unused), update esbuild.workers.mjs to drop the llm.worker entrypoint, delete generated public/workers/llm.worker.js + .map, then delete the two source files.',
      'src/features/deep-analytics/components/ReconciliationWizard.tsx — dead copy of src/features/reconciliation/components/ReconciliationWizard.tsx. Find what renders the deep-analytics copy; repoint to the reconciliation one or remove the usage if dead; delete the copy.',
      'src/features/data-import/model/helpers.tsx — remove ONLY the dead inferColumnType() + computeColumnStats() exports (superseded by model/summarize.ts). Confirm unused first. Keep any other live exports in the file.',
      'src/app/dashboard/browser/page.tsx — legacy broken twin of the telecom grid (src/app/dashboard/telecom-report/grid). Delete the route folder and remove any reference to /dashboard/browser in src/features/dashboard-shell/.../nav-config.ts (or wherever nav lives).',
      'src/workers/layout.worker.ts — remove ONLY provably-dead geo + layered-DAG(ELK) surfaces (e.g. layoutGraph / geo-clustering exports) that have zero callers (lineage ships its own src/features/lineage/core/elk-layout.ts; geo-analysis renders region aggregates without point clustering). Be conservative: keep every method that still has a caller; update esbuild + any layout-client/proxy if exports change.',
    ],
  },
  {
    key: 'shared-core',
    title: 'Extract shared cores for copy-pasted utilities (behavior-preserving)',
    targets: [
      'Collapse the data-import type-mapper pair: src/features/data-import/lib/import-pipeline.ts toColumnInfoType() and src/features/data-import/model/summarize.ts mapDuckTypeToColumnInfoType() are the same mapping to the same union — keep ONE canonical fn in summarize.ts and have import-pipeline import it. DO NOT touch the csv-parser or parsed-data type mappers (different output unions).',
      'Extract one PreviewGrid: src/features/csv-parser/components/PreviewGrid.tsx and src/features/data-transform/components/PreviewGrid.tsx are copy-pasted virtualized grids — create ONE shared component, point both imports at it, delete the data-transform copy. If the two have diverged, parametrize via props rather than dropping features.',
      'Share the SUMMARIZE coercion helpers (nullRateFromSummary / toProfileType / numberOrUndefined — most complete in src/features/parsed-data/model/summary-map.ts) into a shared duckdb-summary util reused by data-import + parsed-data. Keep csv-parser’s in-JS profiler separate.',
      'Share the Kokoro TTS core: extract the model-load + text-chunk logic duplicated between src/features/data-formulator/core/voice/voice-tts-worker.ts and src/features/ai-briefing/core/narrator.worker.ts into ONE shared module imported by both. Keep each worker’s message protocol intact.',
    ],
  },
  {
    key: 'collab-telecom',
    title: 'Extend Collaboration to serve the telecom report, fold in collab-hub, then remove the duplicate',
    targets: [
      'EXTEND src/features/collaboration/screens/CollaborationScreen.tsx: make it telecom-report-aware (comment/approve the report sections collab-hub already targets: overview/transactions/channels/anomalies/operators/regions) AND absorb collab-hub’s unique surfaces as tabs/sections — ApprovalWorkflow, AuditTrail, StickyNoteAnnotation, PresenceBar (src/features/collab-hub/components) — wiring their data through the existing collaboration store/CRDT, or migrate collab-hub’s store/CRDT (store/collab-hub-store, collab/collab-hub-crdt, hooks/useAnnotations) under collaboration. Lose NO functionality (presence, annotations, approval, audit).',
      'THEN remove the duplicate: delete src/features/collab-hub/ entirely, the route src/app/dashboard/collab-hub/page.tsx, and the registry entry id:"collab-hub" in src/features/desktop/core/app-registry.tsx. Remove any nav reference. Ensure no dangling imports remain.',
    ],
    runtimeCheck: true,
  },
]

const execPrompt = (b) => `You are executing a TELECOM-FIRST deduplication batch in the Next.js + Electron app at d:/data-navigator. The telecom report engine is the most important feature of the whole app — it must keep working; never sacrifice telecom behavior to remove a duplicate.

BATCH: ${b.title}

Do these, in order, carefully:
${b.targets.map((t, i) => `${i + 1}. ${t}`).join('\n')}

Rules:
- For every removal, FIRST grep the codebase for all importers/consumers. If a target still has a LIVE consumer, migrate that consumer onto the keeper BEFORE deleting (this is the "extend then remove" rule). If you cannot safely migrate, SKIP that target and report why — do not break the build.
- Prefer the telecom-serving surface as the keeper when consolidating.
- Keep diffs minimal and behavior-preserving except where a target explicitly says EXTEND.
- After your edits, run \`pnpm run build\` (NOT tsc/biome directly) from d:/data-navigator. It must exit 0 with a fully-green TypeScript type-check. If it fails, READ the errors and fix them, then rebuild. Iterate until green. The baseline was green before this batch, so any new failure is yours to fix.
- If after genuine effort a target cannot be made green, revert that target's changes, SKIP it, and ensure the build is green without it.

Report: batchKey="${b.key}", the files you deleted/changed, what functionality you migrated, anything skipped (with reason), whether the final build is green (buildGreen) with the final ~15 lines of build output (buildTail), whether runtime smoke-testing is needed (needsRuntimeCheck), and notes. Output JSON per the schema.`

phase('Consolidate')
const results = []
for (const b of BATCHES) {
  const r = await agent(execPrompt(b), { label: `batch:${b.key}`, phase: 'Consolidate', schema: EXEC_SCHEMA })
  results.push(r ? { key: b.key, ...r } : { key: b.key, buildGreen: false, died: true })
  if (!r || !r.buildGreen) {
    log(`STOP at batch ${b.key}: build not green (or agent died). Halting so later batches don't pile onto a broken tree.`)
    break
  }
  log(`batch ${b.key} OK — green. deleted=${(r.filesDeleted || []).length} changed=${(r.filesChanged || []).length} skipped=${(r.skipped || []).length}`)
}
return { results }