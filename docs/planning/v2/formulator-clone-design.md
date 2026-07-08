# Formulator — Data Formulator clone on the offline stack

Goal: make `/dashboard/data-formulator` a faithful clone of Microsoft Data
Formulator's *way of doing things* (concept shelves + AI-derived fields + data
threads), rendered in this app's design language and running fully offline.
Moudir stays as a separate conversational assistant (phase 2, extracted from
the current swarm screen).

References: microsoft/data-formulator (GitHub), arXiv:2309.10094 (DF1),
arXiv:2408.16119 (DF2). Recon: session workflow `wf_d06e1f17-93d`.

## What we clone (the DF laws)

1. **Concept binding, not chat.** Users drag fields onto encoding shelves or
   type a field name that doesn't exist yet; the AI's only job is deriving
   DATA for those concepts. Chart specs are compiled deterministically from
   shelf state — never AI-generated.
2. **Tables are immutable; derivations create new tables.** Every Formulate
   run yields a new `TableNode` pointing at its parent. The data-threads panel
   *is* this lineage; branching = two children of one node; jump-back = focus
   an earlier node and formulate from it.
3. **Refine continues the dialog.** Each node stores code + the conversation
   that produced it; follow-ups send that history so the model updates the
   previous code rather than starting over (DF2 `/refine-data`).
4. **Verification affordances everywhere** (the papers' #1 trust driver):
   generated code always visible per node, sample-output table, engine badge,
   rerun/edit-instruction.

## Architecture (this repo's lanes)

- **Contract**: `core/formulator/model.ts` — TableNode/ConceptItem/zod schemas
  (`RefinedGoalSchema`, `ChartRecoSchema`), limits, lineage helpers.
- **SQL engine** (`core/formulator/lineage.ts`): renderer DuckDB is read-only,
  so derived tables NEVER materialize. A leaf's data = inline `WITH` chain
  walked from lineage: each sql node wraps its LLM code as
  `node_<id> AS (WITH src AS (SELECT * FROM <parent>) <code>)`. Validation via
  `EXPLAIN`, previews via `LIMIT`, schema via `DESCRIBE` — all through
  `runReadOnlyQuery`.
- **Python engine** (`core/formulator/python-engine.ts`): DF-style pandas lane
  in the self-hosted Pyodide sandbox (`src/platform/python-sandbox/core`).
  Parent rows in via `loadDataFrame` (≤10k), script contract `df -> result`,
  JSON-serialized result back, ≤10k rows materialized on the node.
- **Derive agent** (`core/formulator/derive-agent.ts`): two-step DF2 prompt on
  the local GGUF via the provider registry — (1) `generateStructured` →
  RefinedGoal (grammar-constrained, enums only), (2) plain-text codegen with
  ONE fenced block, extracted + executed, ≤1 repair loop feeding stderr back.
  Prompt context = per-table column types + ~7 example values + 5 sample rows
  (DF's `generate_data_summary` format). Reuses the swarm's readiness gate,
  semantic cache pattern, and scheduler conventions.
- **Charts**: shelf state compiles to the existing `ChartSpec`
  (`core/types.ts`) → `buildSQL` (`core/sql.ts`, already live) for sql-lane
  tables, or in-memory aggregation for python-lane rows → `chart-options.ts` →
  `OffscreenChart`. New chart types only via `platform/viz/echarts-core.ts`
  registration.

## UI (wave 2) — DF layout, telecom skin

3-pane: LEFT concepts panel (original/derived/custom pill groups, dnd-kit
draggable, combobox-create for custom concepts); CENTER shelf card (chart-type
gallery grid + x/y/color/size/facet channels with aggregate dropdowns on
pills + NL instruction input + Formuler) over the chart canvas over a
virtualized data table (per-node tabs, code toggle); RIGHT data threads
(lineage cards: thumbnail, instruction, table chip, branch/rerun) + insights.
shadcn tokens only; `--ai` tint marks AI-derived surfaces; Poppins; Electric
Blue primary; dnd-kit `DragOverlay` (no motion layout animation on pills).
Keep the `moudir:ask` window event + app-menu `reset`/`cancel` bus working.

## Waves

1. Core: lineage.ts + python-engine.ts + derive-agent.ts + tests (this wave,
   fleet `formulator-wave1`).
2. UI: shelf/pills/gallery/canvas/table rebuild on the real spec state.
3. Threads & insights: lineage UI, branch/jump/refine, insight cards,
   pin-to-dashboard via widget-registry.
4. Integration & polish: routes/menus/a11y/perf; then the standalone Moudir
   assistant.
