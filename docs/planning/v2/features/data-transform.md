# Feature Plan — data-transform — Data transformation / wrangling + SQL pipeline

**Maturity:** partial

## Performance issues

- Pipeline runs serially on the renderer with an artificial `await sleep(60)` per step (DataTransformScreen.tsx:466), so a 10-step pipeline pays 600ms of pure dead time before any SQL even runs.
- Every step does TWO round-trips over Electron IPC: `CREATE OR REPLACE TABLE step_x AS (...)` then a separate `SELECT COUNT(*)`. For N steps that is 2N serial IPC calls instead of one batched script — IPC + DuckDB plan overhead dominates on small/medium data.
- Each step fully MATERIALIZES an intermediate base table (`CREATE OR REPLACE TABLE`) even for trivial transforms like LIMIT/SELECT. DuckDB views or a single nested CTE would let the optimizer fuse filter+project+limit and avoid writing intermediate tables to disk.
- Preview uses a raw HTML `<table>` that renders ALL returned rows with no virtualization (DataTransformScreen.tsx:1274-1300); it is capped at LIMIT 50 today, but any attempt to raise the preview size or show wide tables re-renders the whole DOM table and blocks the main thread.
- `produce(immer)` is called 3-5 times PER STEP inside the run loop to flip status (running→done), each triggering a full React re-render of the 320px step list and StepCard tree mid-run; combined with `motion`/`AnimatePresence` layout animations this causes jank during execution.
- `runPipeline`'s useCallback depends on the entire `steps` array (DataTransformScreen.tsx:562-570), so the callback identity changes on every keystroke in any step config, invalidating memoization and re-binding handlers across the tree.
- ECharts funnel chart hard-codes `{ label: 'Source', rows: 10000 }` and the reduction KPI divides by a literal `10000` (DataTransformScreen.tsx:646, 1381) — analytics are partially fake, not driven by real `sourceRowCount`.
- No result virtualization or Arrow path: results come back as `Record<string,unknown>[]` (row-major JS objects) over IPC; large previews/exports would copy and GC-thrash instead of streaming Arrow columnar batches.
- No debounce on the live 'Generated SQL' preview (`stepToSQL(activeStep,'prev_step')` recomputed on every render at line 1212) and Monaco is loaded even when the SQL tab is never opened in some flows.
- Intermediate `step_*` tables are never cleaned up; repeated runs accumulate `CREATE OR REPLACE TABLE step_s1...` tables in the DuckDB instance, growing memory/disk over a session.

## Offline gaps

- No SQL validation/parsing happens locally before execution — invalid SQL is only caught by the DuckDB round-trip, so there is no offline lint/error surface; a local AST parser (node-sql-parser) would validate offline.
- Monaco SQL editor is read-only and has NO schema-aware autocomplete (table/column names) — there is no offline completion provider wired to the dataset catalog, so the 'SQL' surface gives no local IntelliSense.
- No 'AI assist' / NL→SQL or NL→step is wired here despite the app shipping a local LLM (node-llama-cpp / transformers.js + use-llm-inference.ts); generating steps from natural language is the obvious offline-LLM win and is entirely absent.
- Pipelines are NOT persisted: `steps`, `runHistory`, and the active dataset binding live only in React `useState` and vanish on navigation/reload. No Dexie/IndexedDB or OPFS persistence of the transform recipe, so work is lost offline.
- No way to materialize the transform OUTPUT back into the dataset catalog as a new Parquet-backed dataset (the `DataTransform`/`source: 'transform'` types exist in data-store.ts but are never written) — the result is a throwaway `step_*` table, not a durable offline artifact.
- The generated SQL builds identifiers via naive string interpolation with single-quote-only escaping (`prevTable.replace('"','""')` replaces only the FIRST quote; conditions/columns/agg are injected verbatim) — an offline correctness/safety gap for arbitrary table or column names.
- Export of the transformed result is missing entirely (no CSV/Parquet/Arrow download), so even offline the user cannot get the wrangled data out except by copying SQL.
- No column profiling / data-quality panel (null %, distinct count, min/max, histogram) although DuckDB `SUMMARIZE` makes this a single offline query — wrangling UX expects profiling to decide which steps to add.

## Recommended dependencies

| Package | Category | Stars | Maint. | License | Offline | Replaces | Why | URL |
|---|---|---|---|---|---|---|---|---|
| `node-sql-parser` | SQL parsing / offline validation | ~1.0k | Active — v5.4.0 (Jan 2026) | Apache-2.0 | yes | DuckDB round-trip-only validation | Parse generated/user SQL into an AST fully offline to validate WHERE/SELECT/GROUP BY before hitting DuckDB, extract referenced columns/tables, and safely re-stringify. PostgreSQL dialect is closest to DuckDB. ~150KB. | https://github.com/taozhi8833998/node-sql-parser |
| `monaco-sql-languages` | SQL editor IntelliSense | ~290 | Active (DTStack); pin to a tested monaco version | MIT | partial | hand-rolled CompletionItemProvider | Adds SQL tokenizer + a customizable `completionService` so the Monaco editor can offer offline schema-aware table/column completion driven by the dataset catalog. Niche but the only turnkey Monaco SQL completion layer; justify by scoping to one pinned monaco version. | https://github.com/DTStack/monaco-sql-languages |
| `@xyflow/react (React Flow)` | Visual node pipeline (optional P3) | ~28k | Very active (xyflow team) | MIT | yes | custom DAG canvas | If the linear step list grows into a branching DAG (joins, multiple sources, fan-out), React Flow is the mature, fully-offline node-UI canvas. Only adopt when branching is a real requirement; the current linear model does not need it. | https://github.com/xyflow/xyflow |
| `@tanstack/react-table + @tanstack/react-virtual` | Virtualized result grid | 26k / 5.5k | Very active | MIT | yes | raw HTML <table> preview | Already dependencies. Replace the raw `<table>` preview with a headless virtualized grid so previews can show thousands of rows / wide tables without main-thread DOM blowup. Zero new dependency cost. | https://github.com/tanstack/table |
| `arquero` | In-memory reshaping (pivot/unpivot) | ~1.4k | Active (UW IDL) | BSD-3-Clause | yes | extra DuckDB round-trips for tiny reshapes | Already a dependency. Use for small/medium client-side reshaping (pivot/unpivot, derived columns) where a DuckDB round-trip is overkill, and as the verb vocabulary reference for the recipe schema. | https://github.com/uwdata/arquero |
| `dexie` | Recipe persistence | ~13k | Active | Apache-2.0 | yes | ephemeral React useState | Persist transform recipes + run history to IndexedDB so pipelines survive reload fully offline. Per Tech Radar it is the ADOPT store for many small structured records. | https://github.com/dexie/Dexie.js |
| `comlink` | Worker RPC | ~12.6k | Active (GoogleChromeLabs) | Apache-2.0 | yes | main-thread parsing | Already a dependency. Move SQL parsing/validation and any client-side arquero reshaping into a Web Worker behind a Comlink proxy to keep parse/validate off the main thread. | https://github.com/GoogleChromeLabs/comlink |
| `apache-arrow` | Columnar result transport | ~14k | Very active | Apache-2.0 | yes | Record<string,unknown>[] row objects | Stream DuckDB results as Arrow record batches instead of row-major JS objects for large previews/exports; zero-copy into the virtualized grid and into ECharts/recharts. | https://github.com/apache/arrow |

## CLIs & tools

| Tool | Type | Offline | Why | URL |
|---|---|---|---|---|
| `DuckDB CLI (SUMMARIZE / EXPLAIN ANALYZE)` | cli | yes | Validate generated pipeline SQL offline, profile columns with SUMMARIZE, and use EXPLAIN ANALYZE to confirm filter/limit pushdown and that views beat materialized step tables. | https://duckdb.org/docs/api/cli |
| `node-sql-parser (library/test use)` | library | yes | Locally parse and re-stringify generated SQL in tests to assert identifier quoting and AST correctness without a DB. | https://github.com/taozhi8833998/node-sql-parser |
| `size-limit (preset-app)` | cli | yes | Add a per-route budget for /dashboard/transform and a per-worker budget for the new transform worker (Monaco + sql-parser must not regress bundle). | https://github.com/ai/size-limit |
| `tinybench / Vitest bench` | library | yes | Microbenchmark the batched-script vs per-step-IPC execution and the SQL builder on representative pipelines, fully offline. | https://github.com/tinylibs/tinybench |
| `react-scan` | library | yes | Detect the mid-run re-renders of the step list/StepCard tree caused by per-step immer produce and confirm memoization fixes. | https://github.com/aidenybai/react-scan |

---

# data-transform — Deep Improvement Plan

Feature: **Data transformation / wrangling + SQL** — `src/features/data-transform/` + route `src/app/dashboard/transform/`.

This is a 1,467-line single-file screen (`DataTransformScreen.tsx`) implementing a **linear, step-based transform pipeline** that compiles each step to SQL and executes it against the Electron-main DuckDB over IPC. It is a *functional prototype*: it runs real SQL and shows real previews, but it materializes every intermediate, runs serially with artificial delays, has fake analytics constants, no persistence, no validation, no autocomplete, no export, and no AI assist. The good news: the hard part (a native DuckDB engine reachable from the renderer) already exists and is correct per the Tech Radar; this plan is mostly about **doing less work, on the right thread, durably, offline**.

---

## 1. Current implementation

### 1.1 Files & responsibilities
- `src/app/dashboard/transform/page.tsx` (5 lines) — thin route shell that renders the screen.
- `src/features/data-transform/screens/DataTransformScreen.tsx` (1,467 lines) — the entire feature: types, SQL builder, step card, run loop, preview table, SQL tab (Monaco read-only), analytics tab (ECharts funnel + KPIs + per-step timings), run history.
- `src/features/data-transform/screens/DataTransformScreen.stories.tsx` (30 lines) — Storybook entry.

### 1.2 Data + execution model
- Engine access is `runReadOnlyQuery(sql)` from `src/platform/duckdb/duckdb.ts:152`, which forwards to `sharedDuckDB.runReadOnlyQuery` (`shared-duckdb.ts:407`) over Electron IPC with a 60s timeout, returning `Record<string, unknown>[]` (row-major).
- **Note the contract mismatch:** the function is named *read-only*, but the transform screen pushes `CREATE OR REPLACE TABLE step_x AS (...)` through it (DataTransformScreen.tsx:472-474). Either the main-process handler is not actually read-only, or this works by accident on a writable connection. This is a latent correctness/security gap — writes are flowing through a "read-only" door.
- Dataset binding: reads `activeDatasetId`, `datasets`, `loadedTableNames` from `useDataStore` (`src/core/stores/data-store.ts`). `Dataset.tableName` is the DuckDB view name (`data-store.ts:204` maps `viewName → tableName`). The init effect (lines 373-414) resolves a source table via `SHOW TABLES`, counts rows, and sets `dbReady`.

### 1.3 Step → SQL compilation
`stepToSQL(step, prevTable)` (lines 141-171) emits one `SELECT ... FROM prevTable` per step for: filter, select, rename, derive, aggregate, sort, deduplicate, limit. `join` and `pivot` are typed but **fall through to `SELECT *`** (no implementation). `buildPipelineSQL` (417-432) wraps each in `CREATE OR REPLACE TABLE step_<id> AS (...)`, chaining `step_<id>` as the next input.

### 1.4 Run loop (the hot path) — lines 435-570
For each enabled step, serially:
1. `produce` immer to set status `running` (re-render),
2. `await sleep(60)` (artificial),
3. `CREATE OR REPLACE TABLE step_x AS (...)` (IPC #1),
4. `SELECT COUNT(*) FROM step_x` (IPC #2),
5. `produce` immer to set status `done` + rows + duration (re-render).
Then a final `SELECT * FROM lastTable LIMIT 50` for preview, a hand-built SQL string for the SQL tab, a run-history push, and an activity/app-context update.

### 1.5 UI surfaces
- Left: 320px step list with `motion`/`AnimatePresence`, source/output nodes, run history (last 3).
- Right tabs: **Configure** (per-step form + live `stepToSQL` preview), **Preview** (raw `<table>`), **SQL** (read-only Monaco), **Analytics** (ECharts funnel + 3 KPI cards + per-step table).

---

## 2. Performance bottlenecks & exact fixes

### 2.1 Kill the artificial delay + collapse IPC round-trips
**Problem:** `await new Promise(r => setTimeout(r, 60))` per step (line 466) is 60ms × N of pure dead time, purely cosmetic. Plus 2N serial IPC calls (CREATE + COUNT).

**Fix:** Execute the whole pipeline as **one batched SQL script** and get all row counts in a single final query. Remove the sleep. Drive UI status optimistically from the script structure, not from per-step awaits.

```ts
// transform/engine.ts
import { runReadOnlyQuery } from "@/platform/duckdb/duckdb";

export interface CompiledStep { id: string; sql: string; outTable: string; }

export function compilePipeline(steps: TransformStep[], source: string): CompiledStep[] {
  const out: CompiledStep[] = [];
  let cur = source;
  for (const s of steps) {
    if (!s.enabled) continue;
    const outTable = `step_${s.id}`;
    out.push({ id: s.id, sql: stepToSQL(s, cur), outTable });
    cur = outTable;
  }
  return out;
}

// Build a single CREATE OR REPLACE VIEW chain (views, not tables — see 2.2)
export function buildScript(compiled: CompiledStep[]): string {
  return compiled
    .map((c) => `CREATE OR REPLACE TEMP VIEW \"${c.outTable}\" AS (${c.sql});`)
    .join(\"\\n\");
}

// One round-trip for all counts via UNION ALL
export function buildCountQuery(compiled: CompiledStep[], source: string, sourceCount: number) {
  const rows = [
    `SELECT '__source__' AS id, ${sourceCount} AS n`,
    ...compiled.map((c) => `SELECT '${c.id}' AS id, COUNT(*) AS n FROM \"${c.outTable}\"`),
  ];
  return rows.join(\"\\nUNION ALL\\n\");
}
```

Run flow becomes: build script → run script (1 IPC) → run count query (1 IPC) → run preview (1 IPC). **2N+1 IPC calls → 3.** On a 10-step pipeline over small data this is the single biggest latency win.

### 2.2 Use VIEWS / a single CTE instead of materializing every step
**Problem:** `CREATE OR REPLACE TABLE` materializes and writes each intermediate to the DuckDB store. For filter→select→limit chains this defeats DuckDB's optimizer (which would fuse projection + predicate + limit pushdown) and leaves orphaned `step_*` tables (memory/disk leak — see 2.7).

**Fix options (prefer A, offer B for COUNT accuracy):**
- **A. Chained TEMP VIEWs** (above): DuckDB optimizes across views; `COUNT(*)` on the final view still runs the full plan but without persisting intermediates. Temp views are session-scoped and auto-drop.
- **B. Single nested CTE** for the *final* output, materializing only the terminal result if the user explicitly clicks "Materialize":

```ts
export function buildCTE(steps, source) {
  // WITH s1 AS (SELECT ... FROM source), s2 AS (SELECT ... FROM s1) ... SELECT * FROM sN
  const ctes = []; let cur = `\"${source}\"`;
  for (const s of steps.filter(s => s.enabled)) {
    const name = `s_${s.id}`;
    ctes.push(`${name} AS (${stepToSQL(s, cur.replace(/^\"|\"$/g,''))})`);
    cur = name;
  }
  return ctes.length ? `WITH ${ctes.join(\",\\n\")}\\nSELECT * FROM ${cur}` : `SELECT * FROM \"${source}\"`;
}
```
Per-step row counts then come from running `SELECT COUNT(*)` against each CTE prefix in one UNION-ALL query (or accept that intermediate counts are best-effort and only show source/final counts). **Validate the win with `EXPLAIN ANALYZE`** in the DuckDB CLI: confirm a single fused plan vs N materializations.

### 2.3 Virtualize the preview grid
**Problem:** `previewData.map(...)` renders a full `<table>` with no virtualization (lines 1274-1300). Capped at 50 rows today, but it blocks any move to larger previews and re-renders all rows on any state change.

**Fix:** Use the already-installed `@tanstack/react-table` + `@tanstack/react-virtual`. Raise preview to e.g. 1,000 rows and only mount visible rows.

```tsx
const rowVirtualizer = useVirtualizer({
  count: previewData.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 30,
  overscan: 12,
});
// render only rowVirtualizer.getVirtualItems(), absolute-position by virtualRow.start
```
Also memoize cell stringification and add column virtualization for wide tables (`useVirtualizer` horizontal) since DuckDB tables can be 100+ columns.

### 2.4 Stop re-rendering the whole tree mid-run
**Problem:** 3-5 `produce` calls per step flip `steps[]`, re-rendering the 320px list and every `StepCard` (each wrapped in `motion.div layout`) during execution. `runPipeline` also depends on the whole `steps` array (line 569), so its identity churns on every keystroke.

**Fixes:**
- Split *status* state out of the *config* state: keep `Record<stepId, StepRuntime>` (status/rows/duration) in a separate store/`useReducer` so config edits don't touch runtime and vice-versa.
- `React.memo(StepCard)` with a custom comparator on `step.id/status/enabled/label` (and stable handler identities via `useCallback` keyed by id).
- Read `steps` inside `runPipeline` from a ref or pass as an argument so the callback is stable; or move execution to a small Zustand slice.
- Gate `motion` `layout` animations behind a `useReducedMotion()` / "during run" flag to avoid layout thrash while statuses tick.

```tsx
const StepCard = React.memo(StepCardImpl, (a, b) =>
  a.step.id === b.step.id &&
  a.step.status === b.step.status &&
  a.step.enabled === b.step.enabled &&
  a.step.label === b.step.label &&
  a.isActive === b.isActive,
);
```

### 2.5 Move parse/validate (and tiny reshapes) into a Worker via Comlink
**Problem:** SQL building/validation and any client-side reshaping run on the renderer main thread.

**Fix:** A `transform.worker.ts` exposing `{ validateSQL, compilePipeline, profile }` behind Comlink (already a dep). Heavy DuckDB stays in main; the worker only does AST parsing (node-sql-parser) and arquero reshapes on small result sets.

```ts
// transform.worker.ts
import * as Comlink from \"comlink\";
import { Parser } from \"node-sql-parser\";
const parser = new Parser();
const api = {
  validate(sql: string) {
    try { parser.astify(sql, { database: \"postgresql\" }); return { ok: true }; }
    catch (e) { return { ok: false, error: String(e) }; }
  },
};
Comlink.expose(api);
```

### 2.6 Real analytics, debounced SQL preview
- Replace hard-coded `10000` (lines 646, 1381) with real `sourceRowCount` so the funnel and "Reduction %" are truthful.
- Debounce the live `stepToSQL(activeStep,'prev_step')` (line 1212) behind a 150ms `useDeferredValue`/debounce so typing in a config field doesn't recompute+reformat on every keystroke.
- Lazy-mount Monaco only when the SQL tab is first activated (`activeTab === 'sql'`), not eagerly via `dynamic`.

### 2.7 Clean up intermediate tables
**Problem:** `step_*` tables accumulate across runs. Switching to TEMP VIEWs (2.2) fixes this automatically (session-scoped, replaced by name). If you keep tables for "materialize", track created names and `DROP TABLE IF EXISTS` stale ones before each run.

---

## 3. Offline gaps & how to close them

All fixes below run with zero network — local AST parser, local Monaco completion fed by the in-memory catalog, local LLM already in the app, IndexedDB/OPFS persistence, DuckDB-native export.

### 3.1 Offline SQL validation (node-sql-parser)
Today invalid SQL is only caught by the DuckDB round-trip. Parse generated and user SQL **before** execution in the worker (2.5). Surface inline errors in Configure and in the SQL tab. node-sql-parser (Apache-2.0, ~1k★, v5.4.0 Jan 2026) supports a PostgreSQL dialect — closest to DuckDB. Use it to: (a) validate, (b) extract referenced columns to drive the "did you mean" UX, (c) re-stringify safely.

### 3.2 Schema-aware autocomplete in Monaco
The SQL editor is read-only with no IntelliSense. Wire `monaco-sql-languages` `completionService` (MIT) to the dataset catalog so table/column names autocomplete offline. Pin the monaco version it supports. Minimal fallback if you'd rather not add the dep: register a hand-rolled `CompletionItemProvider`:

```ts
monaco.languages.registerCompletionItemProvider(\"sql\", {
  triggerCharacters: [\".\", \" \"],
  provideCompletionItems(model, pos) {
    const cols = activeDataset?.columns.map(c => c.name) ?? [];
    const tables = datasets.map(d => d.tableName);
    return { suggestions: [
      ...tables.map(t => ({ label: t, kind: monaco.languages.CompletionItemKind.Struct, insertText: `\"${t}\"` })),
      ...cols.map(c => ({ label: c, kind: monaco.languages.CompletionItemKind.Field, insertText: `\"${c}\"` })),
    ]};
  },
});
```

### 3.3 NL → steps / NL → SQL via the bundled local LLM
The app ships a local LLM (`src/hooks/use-llm-inference.ts`, node-llama-cpp / transformers.js) but the transform screen has **no AI assist**. This is the headline offline feature. Use **GBNF / JSON-schema-grammar-constrained decoding** (Tech Radar Domain 3) on the llama.cpp side to force the model to emit a valid `TransformStep[]` recipe from a natural-language instruction plus the column schema.

```ts
// \"remove duplicates, keep rows where amount > 100, then total by region\"
const grammar = jsonSchemaToGBNF(TransformRecipeSchema); // step[] with type ∈ enum, config keyed by type
const recipe = await llm.generate({ prompt: buildPrompt(nlText, activeDataset.columns), grammar });
setSteps(validateAndCoerce(recipe.steps));
```
Because output is grammar-constrained, you never get malformed steps. Validate each emitted `config.condition`/`agg`/`expression` through node-sql-parser (3.1) before enabling. This is fully offline.

### 3.4 Persist recipes + run history (Dexie)
`steps`/`runHistory` live in `useState` and die on reload. Persist a **recipe** (name, sourceDatasetId, steps[], createdAt) and run history to IndexedDB via Dexie (Apache-2.0, ADOPT). Auto-save on edit (debounced); list saved recipes; "duplicate" / "apply to another dataset".

```ts
// db.ts
export const db = new Dexie(\"dn-transform\");
db.version(1).stores({ recipes: \"id, name, sourceDatasetId, updatedAt\", runs: \"id, recipeId, ts\" });
```

### 3.5 Materialize output as a durable dataset
`data-store.ts` already defines `DataTransform` and `source: 'transform'` but nothing writes them. Add a **"Save as dataset"** action: `COPY (<final CTE>) TO '<datasetsDir>/<id>.parquet' (FORMAT PARQUET)` in main, then `registerParquetPathDataset(...)` and `upsertDataset({ source: 'transform', ... })`. Now the transform result is a first-class, offline, Parquet-backed dataset usable by other features.

### 3.6 Safe identifier quoting (correctness)
`prevTable.replace('\"','\"\"')` (line 143) replaces only the FIRST quote; user-supplied columns/conditions/agg are injected verbatim. Centralize a `quoteIdent`/`quoteString` helper, escape ALL quotes (`replaceAll`), and validate free-form SQL fragments through node-sql-parser before assembling. Add unit tests with adversarial identifiers (`a\"b`, `weird name`, reserved words).

```ts
const quoteIdent = (s: string) => `\"${s.replaceAll('\"', '\"\"')}\"`;
```

### 3.7 Export the result offline
No CSV/Parquet/Arrow export exists. Add export of the final output via DuckDB `COPY ... TO` (CSV/Parquet) to a user-chosen path in Electron main, plus an in-renderer "copy as CSV" for small previews. This closes the loop: wrangle → preview → **export**, all offline.

### 3.8 Column profiling panel (DuckDB SUMMARIZE)
Wrangling UX needs profiling to decide steps. A single offline `SUMMARIZE \"table\"` returns min/max/avg/std/q25/q50/q75/approx_unique/null%/count per column. Render as a compact profile strip (null% bar + mini histogram via `histogram(col)`), driving "suggested steps" (e.g., high null% → suggest filter/derive). One query, zero network.

---

## 4. Better architecture & implementation (step-by-step)

### 4.1 Module split (decompose the 1,467-line file)
```
src/features/data-transform/
  screens/DataTransformScreen.tsx        # layout + tab orchestration only (~250 lines)
  engine/
    step-to-sql.ts                       # stepToSQL + quoteIdent + JOIN/PIVOT impl
    compile.ts                           # compilePipeline, buildScript, buildCTE, buildCountQuery
    validate.ts                          # node-sql-parser wrappers
    run.ts                               # runPipeline orchestration (3 IPC calls)
  state/
    transform-store.ts                   # zustand: steps(config) + runtime(status) split
    recipes.db.ts                        # Dexie persistence
  workers/transform.worker.ts            # Comlink: validate, compile, arquero reshapes
  ai/recipe-from-nl.ts                   # grammar-constrained LLM → TransformStep[]
  components/
    StepCard.tsx (memoized)
    StepConfig/<per-type>.tsx
    PreviewGrid.tsx (tanstack virtual)
    ProfileStrip.tsx (SUMMARIZE)
    SqlEditor.tsx (monaco + completion, lazy)
```

### 4.2 Engine contract
```ts
export interface RunResult {
  finalRows: number;
  perStep: Record<string, { in: number; out: number }>;
  preview: { cols: string[]; rows: unknown[][] };  // virtualized
  sql: string;
}
export async function runPipeline(steps, source, sourceCount): Promise<RunResult> {
  const compiled = compilePipeline(steps, source);
  await runReadOnlyQuery(buildScript(compiled));               // IPC 1: temp views
  const counts = await runReadOnlyQuery(buildCountQuery(compiled, source, sourceCount)); // IPC 2
  const last = compiled.at(-1)?.outTable ?? source;
  const preview = await runReadOnlyQuery(`SELECT * FROM \"${last}\" LIMIT 1000`); // IPC 3
  return assemble(compiled, counts, preview);
}
```
Note: if intermediate per-step counts aren't worth the extra plan cost, drop IPC-2 to only source/final counts.

### 4.3 State model (config vs runtime split)
```ts
interface TransformState {
  steps: TransformStep[];                 // config only (no status)
  runtime: Record<string, StepRuntime>;   // status/in/out/duration/error
  setSteps, updateConfig, moveStep, toggle, remove,  // mutate steps
  setRuntime, resetRuntime,                          // mutate runtime
}
```
This is the key re-render fix: editing config never touches runtime; running never touches config.

### 4.4 Implement the missing JOIN / PIVOT
JOIN: pick a second dataset (catalog), join keys, join type → `... <type> JOIN \"<otherTable>\" t2 ON <keys>`. PIVOT: DuckDB native `PIVOT src ON <col> USING <agg> GROUP BY <rows>`. Both validated via node-sql-parser before run. arquero is the fallback for tiny in-memory reshapes that don't warrant DuckDB.

### 4.5 AI-assist flow (offline)
1. User types NL instruction → `recipe-from-nl.ts` builds prompt with `activeDataset.columns` + a GBNF grammar derived from `TransformRecipeSchema`.
2. Local LLM (node-llama-cpp main / transformers.js worker fallback) returns grammar-valid `steps[]`.
3. Validate each fragment via node-sql-parser; mark unparseable steps disabled with an inline warning.
4. Show a diff (\"AI proposed 3 steps\") with accept/reject per step before mutating state.

### 4.6 Persistence + materialize wiring
- Debounced autosave of the active recipe to Dexie on any `steps` change.
- \"Save as dataset\" → `COPY (<buildCTE>) TO parquet` in main → `registerParquetPathDataset` → `upsertDataset({source:'transform'})` → record `DataTransform{inputDatasetId, outputDatasetId}`.

---

## 5. Recommended dependencies (summary table)

| Dep | ★ | Maint | License | Offline | Why | URL |
|---|---|---|---|---|---|---|
| node-sql-parser | ~1.0k | v5.4.0 Jan 2026 | Apache-2.0 | yes | Offline SQL validate/AST/safe re-stringify (PG dialect ≈ DuckDB) | https://github.com/taozhi8833998/node-sql-parser |
| monaco-sql-languages | ~290 | Active (pin monaco) | MIT | partial | Schema-aware SQL completion via `completionService` | https://github.com/DTStack/monaco-sql-languages |
| @tanstack/react-table + react-virtual | 26k/5.5k | Very active | MIT | yes | Virtualized result grid (already in repo) | https://github.com/tanstack/table |
| arquero | ~1.4k | Active (UW IDL) | BSD-3 | yes | Small in-memory reshapes / verb vocabulary (already in repo) | https://github.com/uwdata/arquero |
| dexie | ~13k | Active | Apache-2.0 | yes | Persist recipes + run history to IndexedDB | https://github.com/dexie/Dexie.js |
| comlink | ~12.6k | Active | Apache-2.0 | yes | Worker RPC for parse/validate/reshape (already in repo) | https://github.com/GoogleChromeLabs/comlink |
| apache-arrow | ~14k | Very active | Apache-2.0 | yes | Columnar result transport for large previews/exports | https://github.com/apache/arrow |
| @xyflow/react (P3 only) | ~28k | Very active | MIT | yes | Branching DAG canvas IF/when pipeline goes non-linear | https://github.com/xyflow/xyflow |

**Rejected / deferred:** React Flow now (linear model doesn't need a graph canvas — defer to P3). DataShaper (microsoft/datashaper, MIT) is a useful *reference* for a JSON recipe schema but is heavier than needed — borrow the schema idea, don't adopt the package. No cloud SQL formatters/validators — all validation stays local via node-sql-parser + DuckDB.

---

## 6. CLIs & tools (all offline)
- **DuckDB CLI** — `EXPLAIN ANALYZE <script>` to prove view/CTE fusion beats per-step materialization; `SUMMARIZE` to prototype the profile panel; validate generated SQL by hand.
- **node-sql-parser** in tests — assert identifier quoting + AST round-trip for adversarial names, no DB needed.
- **size-limit (preset-app)** — per-route budget for `/dashboard/transform`, per-worker budget for `transform.worker` (Monaco + sql-parser must not regress). https://github.com/ai/size-limit
- **tinybench / Vitest bench** — benchmark batched-script vs 2N-IPC, and the SQL builder, on representative pipelines.
- **react-scan** — confirm the config/runtime state split eliminates mid-run StepCard re-renders.

---

## 7. Phased task list

### P1 — Correctness & latency (no new deps)
1. Remove `await sleep(60)` from the run loop (line 466).
2. Collapse 2N IPC calls → 3 (batched TEMP-VIEW script + single UNION-ALL count query + one preview). (§2.1, §4.2)
3. Switch `CREATE TABLE` → `CREATE OR REPLACE TEMP VIEW` (or terminal CTE); drop orphaned `step_*` cleanup. (§2.2, §2.7)
4. Fix `quoteIdent` to escape ALL quotes; add adversarial-identifier unit tests. (§3.6)
5. Replace hard-coded `10000` with real `sourceRowCount` in funnel + reduction KPI. (§2.6)
6. Split config vs runtime state; `React.memo(StepCard)`; stabilize `runPipeline` deps. (§2.4, §4.3)
7. Audit the \"read-only query runs writes\" contract; route writes through an explicit write API in `shared-duckdb`.

### P2 — Offline depth (node-sql-parser, dexie, tanstack grid, profiling)
8. `transform.worker.ts` (Comlink) with node-sql-parser validation; inline errors in Configure + SQL tabs. (§2.5, §3.1)
9. Virtualize preview with TanStack Table/Virtual; raise preview cap to ~1,000 rows; column virtualization. (§2.3)
10. Persist recipes + run history to Dexie; recipe list / duplicate / apply-to-dataset. (§3.4)
11. Column profiling panel via `SUMMARIZE` + `histogram`; suggested-step hints. (§3.8)
12. Implement JOIN + PIVOT step types (DuckDB native). (§4.4)
13. Export final output (CSV/Parquet via `COPY TO`) + \"Save as dataset\" materialize → catalog. (§3.5, §3.7, §4.6)
14. Schema-aware Monaco completion (monaco-sql-languages or hand-rolled provider). (§3.2)

### P3 — AI assist & advanced UX
15. NL → recipe via grammar-constrained local LLM (`recipe-from-nl.ts`), per-step accept/reject diff. (§3.3, §4.5)
16. Apache-Arrow streaming result transport for large previews/exports. (dep table)
17. (Optional) React Flow branching DAG canvas only if multi-source/fan-out becomes a real requirement.
18. size-limit budgets + tinybench perf gates + react-scan verification wired into CI. (§6)

---

## 8. Verification notes
- After P1, benchmark a 10-step pipeline: expect ~600ms artificial delay removed + (2N−2) fewer IPC calls; confirm with tinybench and DuckDB `EXPLAIN ANALYZE` showing a single fused plan.
- After P2, use react-scan to confirm StepCards no longer re-render during a run, and size-limit to confirm the transform route/worker stay within budget despite Monaco completion + sql-parser.
- All P1-P3 work runs with networking disabled; the only \"download-once\" asset is the LLM model already bundled by the app.