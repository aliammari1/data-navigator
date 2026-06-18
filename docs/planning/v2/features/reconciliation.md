# Feature Plan — reconciliation — Data reconciliation / diff between datasets

**Maturity:** stub

## Performance issues

- Entire feature is hardcoded sample data (EXPECTED_DEFAULT/ACTUAL_DEFAULT, 5 rows) — no DuckDB, no real data path, so it will never scale and is non-functional for real reconciliation.
- 'AI hypotheses' are a fake setTimeout(1400ms) lookup into a static HYPOTHESIS_MAP — no real LLM call, blocks the wizard with an artificial delay.
- All variance/diff math (buildDiscrepancies) runs on the JS main thread via Array.map/find; on real datasets this would be O(n*m) JS loops instead of a single DuckDB FULL OUTER JOIN with SQL pushdown.
- No virtualization anywhere — discrepancy tables render every row as a raw <table>; at 100k+ reconciled rows this freezes the renderer (the app already ships TanStack Table/Virtual but this feature ignores them).
- actual.find((a) => a.channel === exp.channel) inside a .map is a nested linear scan (quadratic key matching) instead of a hash join / DuckDB join.
- No memoization of derived totals (totalExpectedVol etc. recomputed every render) and discrepancy updates clone the whole array on every keystroke in the notes/reason inputs, causing full re-renders of all rows.
- Export ('Download PDF Report') and 'Paste CSV'/'Use Previous Report' buttons are dead no-ops — no streaming export, so when wired naively it risks main-thread OOM on large reports.
- No result streaming or pagination: a real diff must stream Arrow batches from DuckDB and virtualize, but the current shape materializes the full discrepancy array in React state.

## Offline gaps

- 'AI-powered investigation' is faked; when made real it must use the on-device LLM. The app's current LLM engine is @mlc-ai/web-llm (WebGPU-only, no CPU fallback) which fails on medium-end/iGPU/Linux targets — the Tech Radar HOLD. Needs a WASM-SIMD/CPU fallback lane (node-llama-cpp in Electron main, or transformers.js/wllama in a worker).
- No persistence of reconciliation runs: reasonCode, notes, escalations, and 'Mark as Reconciled' status are component state only and lost on reload. Needs local persistence (Dexie/IndexedDB or Electron-main SQLite/Drizzle, which the repo already has).
- No local audit trail / snapshot of expected-vs-actual at reconciliation time (regulatory/finance reconciliation needs an immutable signed-off record stored on disk).
- Export pipeline not implemented; must use bundled offline exporters (exceljs streaming, pdfmake) per radar — no cloud/print services.
- Column/key auto-mapping between two arbitrary datasets is absent; matching real datasets offline needs a local fuzzy-matcher (in-house Levenshtein) — no cloud schema-mapping service.
- 'Use Previous Report' implies cross-run history that has no local store backing it.

## Recommended dependencies

| Package | Category | Stars | Maint. | License | Offline | Replaces | Why | URL |
|---|---|---|---|---|---|---|---|---|
| `@duckdb/node-api (DuckDB Neo)` | data-engine (already in project) | 31k core / 1.5k neo | Very active, official | MIT | yes | hand-rolled JS diff loops | The reconciliation diff is fundamentally a SQL problem. Push the entire row-level diff (FULL OUTER JOIN + COALESCE + variance columns) and aggregate rollups into DuckDB; stream Arrow results. Replaces the JS .map/.find quadratic diff. Already the app's primary engine. | https://github.com/duckdb/duckdb-node-neo |
| `apache-arrow (JS)` | columnar interchange (transitive) | 14k | Very active | Apache-2.0 | yes | JSON row materialization | Stream diff result batches DuckDB->worker->TanStack grid zero-copy instead of materializing a big JS array in React state. Type backbone for the virtualized diff grid. | https://github.com/apache/arrow |
| `@tanstack/react-table + @tanstack/react-virtual` | grid (already in project) | 26k / 5.5k | Very active | MIT | yes | raw <table> full render | Replace the raw <table> in Steps 2/3/4 with a headless virtualized grid so reconciliation of 50k-100k rows stays at 60fps. Already a dependency; this feature simply doesn't use it yet. | https://github.com/tanstack/table |
| `node-llama-cpp` | local LLM (Electron main, radar ADOPT) | 2.1k | Very active (v3.18 Mar 2026) | MIT | yes | @mlc-ai/web-llm (WebGPU-only) + fake setTimeout | Real on-device hypothesis generation with a CPU/AVX fallback and GBNF/JSON-schema grammars to force structured {reasonCode, confidence, hypothesis} output. The correct primary replacement for web-llm on medium-end PCs without WebGPU. | https://github.com/withcatai/node-llama-cpp |
| `@huggingface/transformers` | browser embeddings/LLM fallback (already in project) | 14k | Very active | Apache-2.0 | yes | web-llm renderer-only path | Browser-side fallback for hypothesis generation and (optionally) all-MiniLM embeddings to fuzzy-match channel/account names that don't match exactly across datasets. WebGPU->WASM-SIMD auto fallback; models cached to IndexedDB. | https://github.com/huggingface/transformers.js |
| `dexie` | persistence (radar ADOPT) | 13k | Active | Apache-2.0 | yes | ephemeral component state | Persist reconciliation runs, per-channel reasonCode/notes/escalation, and sign-off status as small structured records in IndexedDB so they survive reload and power 'Use Previous Report'. (Electron path can instead use the repo's existing Drizzle/SQLite main store.) | https://github.com/dexie/Dexie.js |
| `exceljs` | export (radar ADOPT) | 15.4k | Maintenance-mode, stable | MIT | yes | dead 'Download PDF' button for tabular export | Streaming WorkbookWriter for the reconciliation export (full diff + variance + sign-off), ~6x less memory than SheetJS. Run in Electron main/worker, write to disk incrementally. Already in project. | https://github.com/exceljs/exceljs |
| `pdfmake` | export (radar ADOPT) | 12.3k | Active (v0.3.x) | MIT | yes | jspdf-autotable for big tables | Data-driven PDF reconciliation report that auto-paginates large discrepancy tables (jspdf-autotable OOMs past a few k rows). Generate in worker/main. | https://github.com/bpampuch/pdfmake |
| `comlink` | worker RPC (radar ADOPT) | 12.6k | Active (GoogleChromeLabs) | Apache-2.0 | yes | main-thread diff math | Move the diff orchestration, Arrow decoding, fuzzy key-matching, and export rendering off the renderer main thread into a Web Worker. ~1.1kB Proxy RPC. | https://github.com/GoogleChromeLabs/comlink |
| `fastest-levenshtein (vendor+pin OR reimplement ~40 LOC)` | fuzzy key matching | 769 | STALE (last release Aug 2022) | MIT | yes | exact-string .find() | Auto-map keys/columns between two datasets whose channel/account names don't match exactly. STALE — prefer a ~40-line in-house Myers/bit-parallel Levenshtein in the worker, or vendor+pin this. Not on the hot path (only over distinct key sets). | https://github.com/ka-weihe/fastest-levenshtein |
| `simple-statistics` | stats (radar ADOPT) | 3.5k | Active (v7.9) | ISC | yes | hardcoded >5% rule | Materiality thresholds beyond a flat 5%: compute MAD/z-score/IQR-based outlier flags on variances so 'isMaterial' adapts to the distribution instead of a magic constant. ~30kB zero-dep. | https://github.com/simple-statistics/simple-statistics |

## CLIs & tools

| Tool | Type | Offline | Why | URL |
|---|---|---|---|---|
| `DuckDB CLI` | cli | yes | Prototype and verify the reconciliation diff SQL (FULL OUTER JOIN + COALESCE + variance) against real CSV/Parquet locally before wiring into the app; EXPLAIN ANALYZE to check it pushes down. | https://duckdb.org/docs/api/cli |
| `data-diff (datafold) — reference only` | cli | yes | Reference implementation of joindiff (same-DB outer-join diff) and hashdiff (segmented checksum divide-and-conquer). Study its SQL/algorithm to mirror in DuckDB; not a runtime dependency. | https://github.com/datafold/data-diff |
| `@huggingface/transformers feature-extraction (all-MiniLM-L6-v2)` | model | yes | 384-dim int8 embeddings (~23MB, cached once) to semantically match near-duplicate channel/account labels across the two datasets when exact + Levenshtein matching is insufficient. | https://huggingface.co/Xenova/all-MiniLM-L6-v2 |
| `node-llama-cpp + GBNF grammar` | library | yes | Constrain the investigation LLM to emit valid JSON {reasonCode, confidence, hypothesis} so Step 4 output is parseable and never free-form. Runs in Electron main with CPU fallback. | https://github.com/withcatai/node-llama-cpp |
| `tinybench (via Vitest bench)` | library | yes | Micro-benchmark the diff SQL + Arrow decode + grid render path at 10k/100k/1M rows to enforce a per-step perf budget offline. | https://github.com/tinylibs/tinybench |
| `size-limit (preset-app + time)` | cli | yes | Add a per-route budget for /dashboard/reconciliation and a per-worker budget for the reconciliation worker so the export/LLM deps don't bloat the renderer bundle. | https://github.com/ai/size-limit |

---

## Reconciliation Feature — Deep Improvement Plan

### TL;DR

The `reconciliation` feature is a **stub / UI mockup**, not a working feature. Every number on screen is hardcoded (`EXPECTED_DEFAULT` / `ACTUAL_DEFAULT`, 5 channels), the "AI investigation" is a `setTimeout(1400)` lookup into a static `HYPOTHESIS_MAP`, and every action button that touches data (Paste CSV, Use Previous Report, Download PDF) is a dead no-op. There is **no DuckDB, no real LLM, no persistence, no export, no virtualization**.

The good news: the app already ships *all* the right primitives (native DuckDB via `@duckdb/node-api`, TanStack Table/Virtual, Arrow, exceljs/pdfmake, an LLM engine, embeddings, Dexie-capable storage). The work is almost entirely **wiring this feature into the existing platform** plus replacing the WebGPU-only LLM path with a CPU-fallback lane. Reconciliation is fundamentally a **SQL-pushdown diff** (FULL OUTER JOIN + COALESCE in DuckDB) — not a JS-library problem — so the dependency footprint stays tiny.

---

## 1. Current implementation

### Files
- **Route**: `src/app/dashboard/reconciliation/page.tsx` — 5-line passthrough to `ReconciliationScreen`.
- **Screen**: `src/features/reconciliation/screens/ReconciliationScreen.tsx` — header + renders `ReconciliationWizard` (imported, oddly, from `@/features/deep-analytics/components/ReconciliationWizard`).
- **All logic**: `src/features/deep-analytics/components/ReconciliationWizard.tsx` (566 lines) — the entire feature.

### What exists (in `ReconciliationWizard.tsx`)
- A 5-step wizard (`STEPS`): Expected Totals → Actual Data → Comparison → Investigation → Finalize, driven by `const [step, setStep] = useState(1)`.
- Hardcoded `EXPECTED_DEFAULT` and `ACTUAL_DEFAULT` arrays (5 channels each), lines 60-74.
- `buildDiscrepancies()` (lines 133-157): for each expected row, `actual.find(...)` by channel name, compute `volVariance`, `volVariancePct`, `revVariance`, `revVariancePct`, set `isMaterial = |volVariancePct|>5 || |revVariancePct|>5`.
- `goNext()` (lines 159-175): on step 3, sets `loadingHypotheses`, `await new Promise(r => setTimeout(r, 1400))`, then maps each discrepancy to `HYPOTHESIS_MAP[d.channel]` — **the "AI" is a static dictionary lookup behind a fake spinner**.
- Step 4 lets the investigator pick a `reasonCode` (from `REASON_CODES`), type `notes`, toggle `escalated`.
- Step 5 shows a summary, a static checklist, a dead "Download PDF Report" button, and a "Mark as Reconciled" button that flips local `reconciled` state.

### What the rest of the app already has (and this feature ignores)
- `src/platform/duckdb/duckdb.ts`: `runReadOnlyQuery(sql)`, `registerCSVPathDataset`, `registerParquetPathDataset`, `listRegisteredDatasets`, `previewRegisteredDataset`, `exportRegisteredDataset`.
- `src/core/queries/duckdb.ts`: `useDuckDBQuery(sql, params, options)` (React Query wrapper).
- `src/core/queries/datasets.ts`: `useDatasets`, `useActiveDataset`, `useDataset`, etc.
- `src/platform/ai/llm-engine.ts`: `generateText(prompt, {systemPrompt, maxTokens, temperature})`; **backend is `@mlc-ai/web-llm`** (`DEFAULT_MODEL = "Qwen2-0.5B-Instruct-q4f16_1-MLC"`, line 15; `CreateMLCEngine` import line 78) — WebGPU-only.
- `src/platform/ai/embeddings.ts`, `ml-engine.ts`, `nlq.ts` (natural-language-to-SQL), `report-ai.ts`.
- Export libs in `package.json`: `exceljs`, `docx`, `jspdf`+`jspdf-autotable`. Radar wants `pdfmake` added for big tables.

### Maturity verdict: **stub.** Functional UI shell, zero functional substance.

---

## 2. Performance bottlenecks & exact fixes

Because the feature is mock data today, "bottlenecks" = the things that will break the moment real data flows through the current shape. Each is paired with the concrete fix.

### 2.1 JS-loop diff instead of SQL pushdown
**Problem**: `buildDiscrepancies()` does `expected.map(exp => actual.find(a => a.channel === exp.channel))` — an O(n·m) nested scan on the main thread. With two 200k-row datasets this is ~40 billion comparisons and a frozen tab.

**Fix**: push the entire diff into DuckDB as a single `FULL OUTER JOIN`. DuckDB hash-joins in native code and returns only what you ask for. This is the single most important change.

```sql
-- reconciliation diff: one row per key, classified
WITH e AS (SELECT channel AS key, expectedVolume AS exp_vol, expectedRevenue AS exp_rev FROM expected_view),
     a AS (SELECT channel AS key, actualVolume   AS act_vol, actualRevenue   AS act_rev FROM actual_view)
SELECT
  COALESCE(e.key, a.key)                              AS key,
  e.exp_vol, a.act_vol,
  COALESCE(a.act_vol,0) - COALESCE(e.exp_vol,0)       AS vol_variance,
  CASE WHEN e.exp_vol IS NULL OR e.exp_vol = 0 THEN NULL
       ELSE (COALESCE(a.act_vol,0) - e.exp_vol) * 100.0 / e.exp_vol END AS vol_variance_pct,
  e.exp_rev, a.act_rev,
  COALESCE(a.act_rev,0) - COALESCE(e.exp_rev,0)       AS rev_variance,
  CASE
    WHEN e.key IS NULL                THEN 'ADDED'        -- only in actual
    WHEN a.key IS NULL                THEN 'REMOVED'      -- only in expected
    WHEN e.exp_vol = a.act_vol
     AND e.exp_rev = a.act_rev        THEN 'UNCHANGED'
    ELSE 'CHANGED'
  END                                                 AS diff_status
FROM e FULL OUTER JOIN a ON e.key = a.key
ORDER BY ABS(COALESCE(a.act_vol,0) - COALESCE(e.exp_vol,0)) DESC;
```

This generalizes the current `channel`-only join to arbitrary composite keys (`ON e.k1=a.k1 AND e.k2=a.k2`) and handles **ADDED / REMOVED** rows that the current `.find()` silently drops.

**Materiality + rollup in SQL** (replaces the JS `materialCount` reduce and the flat `>5%` rule):
```sql
SELECT
  COUNT(*)                                        AS rows_total,
  COUNT(*) FILTER (WHERE diff_status='CHANGED')   AS rows_changed,
  COUNT(*) FILTER (WHERE diff_status='ADDED')     AS rows_added,
  COUNT(*) FILTER (WHERE diff_status='REMOVED')   AS rows_removed,
  COUNT(*) FILTER (WHERE ABS(vol_variance_pct) > :tol_pct) AS rows_material,
  SUM(exp_rev) AS total_exp_rev, SUM(act_rev) AS total_act_rev
FROM recon_diff;
```

### 2.2 Quadratic key matching → hash join
Already solved by 2.1: `FULL OUTER JOIN ... ON` is a hash join in DuckDB. Never reintroduce `actual.find(...)` in a `.map`.

### 2.3 No virtualization → freeze on render
**Problem**: Steps 2/3/4 render raw `<table>` over `discrepancies.map(...)`. At 100k changed rows this mounts 100k DOM rows.

**Fix**: virtualize with the already-installed TanStack stack. Only render visible rows.

```tsx
// ReconciliationDiffGrid.tsx
import { useReactTable, getCoreRowModel, flexRender, type ColumnDef } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";

export function ReconciliationDiffGrid({ rows, columns }: { rows: DiffRow[]; columns: ColumnDef<DiffRow>[] }) {
  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() });
  const parentRef = useRef<HTMLDivElement>(null);
  const model = table.getRowModel().rows;
  const rowVirtualizer = useVirtualizer({
    count: model.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 34,
    overscan: 12,
  });
  return (
    <div ref={parentRef} className="h-[600px] overflow-auto">
      <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
        {rowVirtualizer.getVirtualItems().map((vi) => {
          const row = model[vi.index];
          return (
            <div key={row.id}
                 className="absolute left-0 flex w-full border-b border-slate-800"
                 style={{ top: vi.start, height: vi.size }}>
              {row.getVisibleCells().map((cell) => (
                <div key={cell.id} className="px-2 py-1 text-xs">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

Even better for >100k rows: don't pull the full result set into React at all — keep it in DuckDB, `LIMIT/OFFSET` (or keyset-paginate) per scroll window, and feed pages to the virtualizer. The diff result can be persisted as a DuckDB temp view / Parquet and queried lazily.

### 2.4 Fake LLM delay + main-thread blocking
**Problem**: `await new Promise(r => setTimeout(r, 1400))` is a deliberate stall; the real fix also keeps inference off the renderer.

**Fix**: call the real engine, stream tokens, and (for the heavy lane) run in Electron main. See §4.4. Generate hypotheses **only for material rows**, batched, with a hard cap (e.g. top 20 by absolute variance) so a 100k-row diff doesn't trigger 100k LLM calls.

### 2.5 Re-render storms on every keystroke
**Problem**: `updateDiscrepancy` clones the entire `discrepancies` array on every character typed in notes/reason; with the whole list rendered, every keystroke re-renders all rows.

**Fix**: (a) virtualize (2.3) so only visible rows re-render; (b) move per-row annotation state into a keyed map / store keyed by `key`, not a positional array; (c) memoize row cells and debounce notes persistence to Dexie.

```ts
// annotations-store.ts (zustand) — keyed, not positional
interface RecRunState {
  annotations: Record<string, { reasonCode: string; notes: string; escalated: boolean }>;
  setAnnotation: (key: string, patch: Partial<RecRunState["annotations"][string]>) => void;
}
```

### 2.6 Derived totals recomputed every render
**Problem**: `totalExpectedVol`, `totalActualVol`, `materialCount` etc. (lines 185-189) recompute on every render.

**Fix**: compute them once in SQL (2.1 rollup) and read from React Query cache; or `useMemo` keyed on the run id. Do not reduce arrays in render.

### 2.7 Export risks main-thread OOM
**Problem**: "Download PDF Report" is dead; a naive wiring of `jspdf-autotable` OOMs past a few k rows.

**Fix**: stream exports in a worker / Electron main with `exceljs` `WorkbookWriter` and `pdfmake` (auto-paginates). Write to disk incrementally, free buffers between chunks. Never `getDataURL`-screenshot tables.

---

## 3. Offline gaps & how to close them

| Gap | Current | Fix |
|---|---|---|
| AI uses WebGPU-only engine | `llm-engine.ts` → `@mlc-ai/web-llm` (radar HOLD: no CPU fallback) | Add `node-llama-cpp` (Electron main, CPU/AVX + GBNF grammar) as primary; `transformers.js`/`wllama` in worker as browser fallback. §4.4 |
| No persistence of runs | reasonCode/notes/escalation/sign-off in component state | Dexie table `reconciliationRuns` (renderer) or the repo's existing Drizzle/SQLite main store (`src/platform/storage/drizzle-storage.ts`). §4.5 |
| No immutable audit snapshot | nothing stored at sign-off | At "Mark as Reconciled", snapshot expected+actual+diff+annotations to a Parquet/JSON on disk via Electron main with a hash; never mutate after. |
| Export = cloud-free? | dead button | `exceljs`/`pdfmake` are pure JS, bundled, fully offline. Run in worker/main. |
| Key/column auto-mapping | exact string `.find()` only | In-house Levenshtein (or `fastest-levenshtein` vendored+pinned) over distinct key sets in the worker; optional `all-MiniLM` embeddings for semantic label matching — all local, cached once. §4.6 |
| "Use Previous Report" | no backing store | Read prior runs from Dexie/SQLite. |

No part of this feature should ever touch the network at runtime. The LLM model (GGUF q4) and embedding model (all-MiniLM int8, ~23MB) are downloaded once and cached to disk/OPFS/IndexedDB.

---

## 4. Better architecture & implementation (step-by-step)

### 4.0 Target architecture
```
Renderer (React)
  └─ ReconciliationScreen / Wizard (UI only, virtualized grids)
       │ Comlink RPC
       ▼
Reconciliation Worker (Web Worker)
  ├─ key/column auto-mapping (Levenshtein / embeddings)
  ├─ orchestrates diff SQL, decodes Arrow batches
  └─ streams pages to the grid
       │
       ▼
DuckDB (native, Electron main via @duckdb/node-api)
  ├─ registers both datasets as views
  ├─ runs FULL OUTER JOIN diff → temp view / Parquet
  └─ aggregate rollups
       │
       ├─ LLM lane (Electron main): node-llama-cpp + GBNF for hypotheses
       └─ Persistence: Drizzle/SQLite (runs, annotations, sign-off, audit snapshot)
```

### 4.1 Replace mock with a dataset-selection step
Two real datasets, plus key + measure mapping. Use the existing `useDatasets` hook.

```tsx
// Step 1 — pick datasets + map keys/measures
function SelectSourcesStep({ onReady }: { onReady: (cfg: DiffConfig) => void }) {
  const { data: datasets = [] } = useDatasets();
  const [expectedId, setExpectedId] = useState<string | null>(null);
  const [actualId, setActualId]     = useState<string | null>(null);
  const [keyCols, setKeyCols]       = useState<string[]>([]);
  const [measures, setMeasures]     = useState<MeasurePair[]>([]); // {expectedCol, actualCol, label}
  // schema comes from listRegisteredDatasets()[].columns
  return (/* two dataset <select>s + key multi-select + measure mapping rows */);
}
interface DiffConfig {
  expectedView: string; actualView: string;
  keyCols: { expected: string; actual: string }[];
  measures: { label: string; expected: string; actual: string }[];
  tolerancePct: number;
}
```

### 4.2 Build the diff SQL generically (composite keys + N measures)
```ts
// recon-sql.ts
function quote(id: string) { return `"${id.replaceAll('"', '""')}"`; }

export function buildDiffSQL(cfg: DiffConfig): string {
  const on = cfg.keyCols.map(k => `e.${quote(k.expected)} = a.${quote(k.actual)}`).join(" AND ");
  const keySelect = cfg.keyCols
    .map(k => `COALESCE(e.${quote(k.expected)}, a.${quote(k.actual)}) AS ${quote("key_" + k.expected)}`)
    .join(", ");
  const measureCols = cfg.measures.flatMap(m => {
    const E = `e.${quote(m.expected)}`, A = `a.${quote(m.actual)}`;
    const v = quote(`var_${m.label}`), p = quote(`varpct_${m.label}`);
    return [
      `${E} AS ${quote("exp_" + m.label)}`,
      `${A} AS ${quote("act_" + m.label)}`,
      `COALESCE(${A},0) - COALESCE(${E},0) AS ${v}`,
      `CASE WHEN ${E} IS NULL OR ${E}=0 THEN NULL ELSE (COALESCE(${A},0)-${E})*100.0/${E} END AS ${p}`,
    ];
  }).join(",\n  ");
  const changed = cfg.measures.map(m => `e.${quote(m.expected)} IS DISTINCT FROM a.${quote(m.actual)}`).join(" OR ");
  const allKeysExpNull = cfg.keyCols.map(k => `e.${quote(k.expected)} IS NULL`).join(" AND ");
  const allKeysActNull = cfg.keyCols.map(k => `a.${quote(k.actual)} IS NULL`).join(" AND ");
  return `
  SELECT ${keySelect}, ${measureCols},
    CASE
      WHEN ${allKeysExpNull} THEN 'ADDED'
      WHEN ${allKeysActNull} THEN 'REMOVED'
      WHEN ${changed}        THEN 'CHANGED'
      ELSE 'UNCHANGED'
    END AS diff_status
  FROM ${quote(cfg.expectedView)} e
  FULL OUTER JOIN ${quote(cfg.actualView)} a ON ${on}`;
}
```
Materialize once so paging/rollups are cheap:
```ts
await runReadOnlyQuery(`CREATE OR REPLACE TEMP VIEW recon_diff AS ${buildDiffSQL(cfg)}`);
// or, for very large diffs / audit: COPY (... ) TO 'run-<id>.parquet' (FORMAT PARQUET)
```
> Note: `runReadOnlyQuery` is read-only today. Add a sibling `runManagedQuery`/`createTempView` to the DuckDB platform module for DDL (temp views / COPY), mirroring the existing `registerParquetPathDataset` pattern — keep it allowlisted and validated.

### 4.3 Stream + virtualize results (React Query + keyset paging)
```ts
export function useDiffPage(runId: string, offset: number, limit = 500) {
  return useDuckDBQuery(
    `SELECT * FROM recon_diff ORDER BY diff_status, key_0 LIMIT ${limit} OFFSET ${offset}`,
    [runId, offset, limit],
    { staleTime: 5 * 60_000 },
  );
}
export function useDiffSummary(runId: string) {
  return useDuckDBQuery(
    `SELECT COUNT(*) rows_total,
            COUNT(*) FILTER (WHERE diff_status='CHANGED') rows_changed,
            COUNT(*) FILTER (WHERE diff_status='ADDED')   rows_added,
            COUNT(*) FILTER (WHERE diff_status='REMOVED') rows_removed
     FROM recon_diff`, [runId]);
}
```
Render the page array through `ReconciliationDiffGrid` (§2.3), color cells by `diff_status` and sign of `varpct_*`.

### 4.4 Real, structured, CPU-fallback LLM hypotheses
Primary (Electron main, GBNF-constrained JSON):
```ts
// main: recon-llm.ts
import { getLlama, LlamaChatSession } from "node-llama-cpp";
const schema = {
  type: "object",
  properties: {
    reasonCode: { enum: ["Human Error","System Issue","Expected Variance","Pricing Change","Campaign Effect","Unknown"] },
    confidence: { type: "number" },
    hypothesis: { type: "string", maxLength: 600 },
  },
  required: ["reasonCode","confidence","hypothesis"],
} as const;

export async function explainVariance(row: MaterialRow) {
  const llama = await getLlama();
  const model = await llama.loadModel({ modelPath: bundledGgufPath }); // CPU/AVX or GPU offload
  const grammar = await llama.createGrammarForJsonSchema(schema);
  const session = new LlamaChatSession({ contextSequence: (await model.createContext()).getSequence() });
  const out = await session.prompt(
    `Channel ${row.key}: expected vol ${row.expVol}, actual ${row.actVol} (${row.varPct}%). ` +
    `expected rev ${row.expRev}, actual ${row.actRev}. Give a likely reason and a one-paragraph hypothesis.`,
    { grammar, maxTokens: 256 });
  return grammar.parse(out); // typed {reasonCode, confidence, hypothesis}
}
```
Browser fallback: keep `generateText()` but route through `transformers.js`/`wllama` when WebGPU is absent; instruct JSON output and validate with a tiny schema check (no grammar in the browser path).

Orchestration: only material rows, capped + batched, off the main thread:
```ts
const targets = diffRows.filter(r => r.diffStatus !== "UNCHANGED" && Math.abs(r.varPct ?? 0) > cfg.tolerancePct)
                        .sort((a,b)=>Math.abs(b.var)-Math.abs(a.var)).slice(0, 20);
for (const r of targets) { const h = await explainVariance(r); persistHypothesis(runId, r.key, h); }
```

### 4.5 Persist runs + annotations + sign-off (offline)
```ts
// dexie (renderer) — or Drizzle/SQLite via Electron main for the desktop build
import Dexie, { type Table } from "dexie";
interface ReconRun { id: string; createdAt: number; expectedView: string; actualView: string;
  config: DiffConfig; summary: DiffSummary; signedOff: boolean; signedBy?: string; snapshotPath?: string; }
interface ReconAnnotation { runId: string; key: string; reasonCode: string; notes: string; escalated: boolean; }
class ReconDB extends Dexie {
  runs!: Table<ReconRun, string>; annotations!: Table<ReconAnnotation, [string,string]>;
  constructor(){ super("reconciliation"); this.version(1).stores({
    runs: "id, createdAt, signedOff", annotations: "[runId+key], runId, escalated" }); }
}
export const reconDB = new ReconDB();
```
"Mark as Reconciled" → set `signedOff`, write an immutable Parquet/JSON snapshot via Electron main, store `snapshotPath` + content hash. This backs "Use Previous Report".

### 4.6 Key/column auto-mapping (offline)
```ts
// in worker — in-house bit-parallel Levenshtein (~40 LOC) avoids the stale dep
function lev(a: string, b: string): number {/* Myers/DP */ return 0;}
export function suggestKeyMapping(expCols: string[], actCols: string[]) {
  return expCols.map(e => {
    const ranked = actCols.map(a => ({ a, d: lev(e.toLowerCase(), a.toLowerCase()) }))
                          .sort((x,y)=>x.d-y.d);
    return { expected: e, actual: ranked[0]?.a, confidence: 1 - ranked[0].d / Math.max(e.length,1) };
  });
}
```
Optional semantic pass with `all-MiniLM` embeddings (cosine similarity of column names / sample values) for labels that differ lexically (e.g. "MSISDN" vs "Phone").

### 4.7 Export (offline, streamed)
```ts
// worker/main — exceljs streaming
import ExcelJS from "exceljs";
export async function exportRecon(runId: string, outPath: string) {
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: outPath });
  const ws = wb.addWorksheet("Reconciliation");
  ws.addRow(["Key","Expected Vol","Actual Vol","Var","Var%","Status","Reason","Notes"]).commit();
  for await (const batch of streamDiffRows(runId, 5000)) {       // keyset-paged from DuckDB
    for (const r of batch) ws.addRow([r.key, r.expVol, r.actVol, r.var, r.varPct, r.status, r.reason, r.notes]).commit();
  }
  await ws.commit(); await wb.commit();
}
```
PDF: `pdfmake` doc definition with a `table` body fed from paged rows (auto-paginates); summary header from `useDiffSummary`.

---

## 5. Recommended dependencies (summary)

| Dep | Stars | Maint | License | Offline | Why here |
|---|---|---|---|---|---|
| @duckdb/node-api | 31k/1.5k | Very active | MIT | yes | The diff IS SQL (FULL OUTER JOIN + COALESCE + rollups). Already primary. |
| apache-arrow / @uwdata/flechette | 14k / 0.1k | Active | Apache/BSD | yes | Stream diff batches zero-copy; flechette shrinks renderer Arrow (~14kB). |
| @tanstack/react-table + react-virtual | 26k / 5.5k | Very active | MIT | yes | Virtualize diff grids to 100k+ rows. Already installed, unused here. |
| node-llama-cpp | 2.1k | Very active | MIT | yes | Real CPU-fallback LLM + GBNF JSON grammar for structured hypotheses. |
| @huggingface/transformers | 14k | Very active | Apache-2.0 | yes | Browser LLM fallback + all-MiniLM embeddings for fuzzy key mapping. |
| dexie | 13k | Active | Apache-2.0 | yes | Persist runs/annotations/sign-off (or use existing Drizzle/SQLite). |
| exceljs | 15.4k | Stable | MIT | yes | Streaming XLSX export. Already installed. |
| pdfmake | 12.3k | Active | MIT | yes | Auto-paginating PDF report (jspdf-autotable OOMs). |
| comlink | 12.6k | Active | Apache-2.0 | yes | Move diff/Arrow/export off the renderer main thread. |
| simple-statistics | 3.5k | Active | ISC | yes | Distribution-aware materiality (MAD/z-score) vs flat 5%. |
| fastest-levenshtein (vendor+pin) or in-house | 769 | STALE (2022) | MIT | yes | Fuzzy key/column auto-map. Prefer ~40-LOC in-house. |

**Deliberately NOT added**: `@mlc-ai/web-llm` stays only as an opportunistic WebGPU upgrade, never the primary path (radar HOLD); no `react-diff-viewer-*` (those are *text/line* diff components — wrong model for a columnar data grid; build cell highlighting on the existing TanStack grid); no cloud/data-diff Python runtime (reference only).

---

## 6. CLIs & tools (offline)
- **DuckDB CLI** — prototype/verify the diff SQL against real CSV/Parquet; `EXPLAIN ANALYZE` to confirm hash-join pushdown. https://duckdb.org/docs/api/cli
- **datafold/data-diff** (reference only) — study joindiff (outer-join, same DB) and hashdiff (segmented checksum divide-and-conquer) to mirror in DuckDB. https://github.com/datafold/data-diff
- **node-llama-cpp + GBNF** — constrained JSON hypotheses with CPU fallback.
- **tinybench (Vitest bench)** — benchmark diff SQL + Arrow decode + render at 10k/100k/1M.
- **size-limit (preset-app + time)** — per-route budget for `/dashboard/reconciliation` and per-worker budget for the reconciliation worker.

---

## 7. Phased tasks

### P1 — Make it real (functional MVP)
1. New `recon-sql.ts` (`buildDiffSQL`) + a `createTempView`/`runManagedQuery` addition to `src/platform/duckdb/duckdb.ts` (DDL, allowlisted).
2. Replace Step 1/2 mock arrays with dataset selection via `useDatasets` + key/measure mapping (`DiffConfig`).
3. Run the FULL OUTER JOIN diff in DuckDB; materialize `recon_diff`; wire `useDiffSummary`/`useDiffPage`.
4. Replace raw `<table>`s with `ReconciliationDiffGrid` (TanStack Table + Virtual), color by `diff_status`.
5. Handle ADDED/REMOVED rows (currently dropped by `.find()`).
6. Delete the `setTimeout` fake-AI; gate Step 4 on real data.

### P2 — Intelligence, persistence, export
7. Real structured hypotheses: `node-llama-cpp` + GBNF (Electron main), `transformers.js`/`wllama` browser fallback; cap to top-N material rows, batched, off main thread.
8. Dexie (or Drizzle/SQLite) persistence: runs, keyed annotations, sign-off; back "Use Previous Report".
9. Immutable audit snapshot (Parquet/JSON + hash) on "Mark as Reconciled".
10. Streaming export: `exceljs` WorkbookWriter + `pdfmake` in worker/main; wire the dead Download button.
11. Move diff orchestration, fuzzy mapping, Arrow decode, and export into a Comlink worker.

### P3 — Polish & scale
12. Distribution-aware materiality (`simple-statistics` MAD/z-score) replacing flat 5%; user-set tolerance per measure.
13. Key/column auto-mapping (in-house Levenshtein + optional all-MiniLM embeddings).
14. Keyset pagination for >1M-row diffs (don't pull full set into React); optional `glide-data-grid`/Perspective if DOM virtualization tops out.
15. Drill-down: click a CHANGED key → underlying-row diff (second-level FULL OUTER JOIN on detail tables).
16. Perf budgets: tinybench at 10k/100k/1M; size-limit per-route/per-worker; verify CPU-only LLM path on a no-WebGPU profile.

### Verification gates
- Correctness: golden CSV pair with known ADDED/REMOVED/CHANGED/UNCHANGED counts; assert summary matches.
- Perf: 100k×100k diff renders < 1s to first page, scroll stays 60fps (react-scan clean).
- Offline: run with network fully disabled; confirm diff, LLM (CPU path), persistence, and export all succeed.
- Bundle: `/dashboard/reconciliation` route budget holds after adding pdfmake/persistence (kept in worker/main).
