# Feature Plan — data-formulator — Interactive chart/data formulation (vega/vega-lite)

**Maturity:** functional

## Performance issues

- LLM inference (@huggingface/transformers `pipeline`/`chat`/embeddings) runs on the renderer MAIN THREAD via src/features/agent-canvas/core/llm.ts — token generation and `loadLLM()` (model download + WASM/WebGPU init) freeze the entire UI; the existing 'heartbeat' + 60s timeout code is a symptom, not a fix.
- Semantic vector index is built ENTIRELY on the main thread, row-by-row, with no real batching: src/features/data-formulator/core/vector-search.ts `buildVectorIndex` awaits `embedText` per row across up to 2000 rows (SELECT * ... LIMIT 2000 in DataFormulatorScreen.tsx:447-449). 2000 sequential MiniLM forward passes block the UI for tens of seconds.
- Cosine similarity scan is O(n*384) brute-force on the main thread (vector-search.ts `searchVectorIndex` + retriever.ts `vectorRanking`) — no typed-array SIMD, no approximate index (HNSW/IVF), recomputes norms every query even though vectors are pre-normalized.
- Vector index has NO persistence: rebuilt from scratch every session and every dataset switch (only the RAG corpus embeddings are cached in Dexie; the 2000-row data index is in-memory only).
- Auto-dashboard fires SQL per chart SEQUENTIALLY (auto-dashboard.ts:164-172 loop with `await runReadOnlyQuery` inside) — N charts = N serial IPC round-trips; should be Promise.all / a single batched query.
- ECharts charts are NOT rendered off-main-thread: bento-chart-grid.tsx uses echarts-for-react with `renderer: canvas` on the DOM and `notMerge`, re-instantiating the whole option on every spec/result change.
- chart-options.ts does expensive JS reshaping on the main thread: stacked/multi-line path does `xs.map(x => data.find(...))` — O(xs * data) nested scan; heatmap does `Math.max(...vals.map())` spread that can stack-overflow on large arrays; pivoting belongs in SQL.
- No virtualization for table cards: semantic-search result rows and `tableData` are passed as plain arrays into table cards; large result sets render every row.
- Heavy debug logging in the hot path: llm.ts defaults `_debug = true` and `safeStringify(result, 5000)` runs on every inference, serializing big tensors/results on the main thread for console output even in production.
- Zustand persist serializes the whole `threads` graph (with `chartResult`/`chartSpec` per step) through a custom Drizzle storage + bigIntJsonReplacer on every step add — store.ts partialize includes full threads; large exploration histories cause synchronous JSON serialization jank.
- fuse.js Fuse index is re-created on every `findCol` call (ai.ts:66) inside the rule-pattern loop — rebuilding the fuzzy index per column lookup.

## Offline gaps

- llm.ts `loadLLM` defaults `allowRemoteModels = true` and never sets `env.localModelPath` / `env.remoteHost` — on a fresh offline machine the first model load will attempt to hit huggingface.co and fail; models must be pre-bundled/served locally and `allowRemoteModels` forced false at runtime.
- vector-search.ts hardcodes `device: 'webgpu'` first with a single fallback to default (CPU) — on the medium-end/no-WebGPU target this always pays an adapter-request failure, and there is no explicit `dtype: 'q8'` int8 path for fast CPU embedding.
- Embedding model id `Xenova/all-MiniLM-L6-v2` is referenced by name only (vector-search.ts, embedding-cache.ts) with no guarantee the ONNX weights + tokenizer are bundled in public/ or OPFS; if not pre-fetched, semantic search is dead offline.
- ollama-provider.ts and mcp-client.ts introduce network-shaped providers (Ollama HTTP host, MCP connections) — acceptable only as localhost/LAN escape hatches but the store default `ollamaHost: 'edge://transformers-worker'` and provider plumbing must never silently fall back to a public endpoint.
- No persistent cache of the per-dataset row vector index (only RAG corpus is cached) — closing the app loses all semantic indexes, forcing a full offline re-embed on next launch.
- onnxruntime-web WASM assets (.wasm threaded/simd binaries) location is implicit via transformers.js defaults; for guaranteed offline they must be `env.backends.onnx.wasm.wasmPaths`-pinned to a local path, otherwise CDN fetch on first init.

## Recommended dependencies

| Package | Category | Stars | Maint. | License | Offline | Replaces | Why | URL |
|---|---|---|---|---|---|---|---|---|
| `@huggingface/transformers` | LLM + embeddings runtime (already in use) | ~14-16k | Very active, v4.x | Apache-2.0 | yes | main-thread inference | Keep as the browser embedding + fallback-LLM engine, but MOVE all calls into a Web Worker and pin env.localModelPath/wasmPaths + allowRemoteModels=false. Auto WebGPU->WASM-SIMD fallback matches the no-GPU target. | https://github.com/huggingface/transformers.js |
| `comlink` | Worker RPC glue | ~12.6k | Active (GoogleChromeLabs) | Apache-2.0 | yes | ad-hoc postMessage | ~1.1kB Proxy-based RPC to wrap the new embedding/LLM worker and a vector-search worker; the clean boundary that gets inference + cosine scan off the main thread. | https://github.com/GoogleChromeLabs/comlink |
| `node-llama-cpp` | Electron-main generative LLM (structured output) | ~2.1k | Very active, v3.18 (Mar 2026) | MIT | yes | renderer-side transformers.js generation for structured tasks | PRIMARY generative path for chart-spec/SQL/filter JSON: GGUF q4 in the Electron utility process with GBNF/JSON-schema grammars that GUARANTEE valid ChartSpec JSON at token-sampling time, eliminating the fragile parseJSON() repair loop and freeing the renderer. | https://github.com/withcatai/node-llama-cpp |
| `@duckdb/node-api (DuckDB Neo)` | Analytical engine (already primary) | ~31k core / 1.5k neo | Very active (official) | MIT | yes | JS pivot/aggregate in chart-options.ts | Push ALL chart aggregation/pivot/binning into SQL and return Arrow; run per-chart queries in parallel and replace JS-side reshaping in chart-options.ts. Native = no 4GB WASM cap, real threads. | https://github.com/duckdb/duckdb-node-neo |
| `apache-arrow` | Columnar interchange | ~11-15k | Healthy/very active | Apache-2.0 | yes | row-object materialization | Return DuckDB results as Arrow tables to charts/grid zero-copy instead of materializing Record<string,unknown>[] (sanitizeJsonValue over 2000 rows). Backbone for worker transfer. | https://github.com/apache/arrow |
| `sqlite-vec` | Persistent vector store | ~6k | Active (Mozilla-backed) | Apache-2.0/MIT | yes | in-memory brute-force cosine + no persistence | Persist per-dataset row embeddings in SQLite (better-sqlite3) in Electron main so the semantic index survives restarts and supports fast KNN without rebuilding 2000 embeddings each session. | https://github.com/asg017/sqlite-vec |
| `usearch (WASM)` | Approximate NN index (browser fallback) | ~2.5k | Active | Apache-2.0 | yes | searchVectorIndex brute force | If a browser-only build ships, replace the O(n) cosine scan with an in-worker ANN index for sub-ms KNN over tens of thousands of rows. Trial behind a flag; sqlite-vec is the Electron default. | https://github.com/unum-cloud/usearch |
| `vega-lite + vega` | Declarative chart grammar (already present) | ~4.9k / 11k | Active (UW IDL) | BSD-3-Clause | yes | bespoke ad-hoc ChartSpec semantics | Keep Vega-Lite as the CANONICAL spec the LLM emits (the feature's namesake and the grammar the agent reasons about); compile to Vega render or map to ECharts. Force Canvas >1k marks. Aligns ChartSpec with a real grammar instead of bespoke x_val/y_val. | https://github.com/vega/vega-lite |
| `echarts` | Canvas chart workhorse (already present) | ~63k | Very active (Apache) | Apache-2.0 | yes | n/a | Keep as the high-performance renderer for large scatter/heatmap with progressive/large mode + OffscreenCanvas in a worker. Use echarts.getDataURL()/renderToSVGString() for export, never DOM screenshot. | https://github.com/apache/echarts |
| `uPlot` | Dense time-series renderer | ~10.2k | Active, v1.6.x | MIT | yes | ECharts for dense lines | For line/area time-series with thousands of points, uPlot draws 166k pts in ~25ms at ~10% CPU, far cheaper than ECharts/Vega on the medium target. Route trend charts here. | https://github.com/leeoniya/uPlot |
| `@tanstack/react-virtual` | Row/col virtualization | ~5.5k | Very active | MIT | yes | unvirtualized table cards | Virtualize semantic-search result tables and large `tableData` cards so big result sets don't render every DOM row. | https://github.com/TanStack/virtual |
| `mosaic / vgplot (uwdata)` | Crossfilter + DuckDB-coordinated views (Trial) | ~1.2k | Active (UW IDL) | BSD-3-Clause | yes | per-chart serial SQL + manual filter plumbing | Trial: Mosaic coordinates many linked charts against one DuckDB instance with automatic pre-aggregation + crossfilter over 10M rows, the proven architecture for an interactive multi-chart canvas. Adopt its coordinator pattern even if not the whole lib. | https://github.com/uwdata/mosaic |
| `zod` | Spec validation (already present) | ~34k | Very active | MIT | yes | hand-rolled JSON repair | Already used in ai-schemas.ts; pair with node-llama-cpp JSON-schema grammar so LLM output is validated AND constrained, removing the parseJSON balanced-brace repair heuristics. | https://github.com/colinhacks/zod |

## CLIs & tools

| Tool | Type | Offline | Why | URL |
|---|---|---|---|---|
| `transformers.js model pre-fetch script` | cli | yes | Build-time node script that downloads Xenova/all-MiniLM-L6-v2 + Qwen GGUF once into public/models (or OPFS seed) so runtime is fully offline; verify with allowRemoteModels=false smoke test. | https://github.com/huggingface/transformers.js |
| `DuckDB CLI` | cli | yes | Validate generated buildSQL() strings and EXPLAIN ANALYZE the aggregation/pivot pushdown against managed Parquet locally before wiring into the agent. | https://github.com/duckdb/duckdb |
| `size-limit (+@size-limit/preset-app, time plugin)` | cli | yes | Per-route/per-worker byte + parse-time budgets for the data-formulator route and the new embedding/LLM/vector workers (onnxruntime-web is the heavy one). | https://github.com/ai/size-limit |
| `sonda / @next/bundle-analyzer` | cli | yes | Offline treemap to confirm transformers.js/echarts/vega-lite are code-split out of the initial route chunk and into lazy worker bundles. | https://github.com/filipsobol/sonda |
| `tinybench (via Vitest bench)` | library | yes | Microbench cosine-scan vs ANN, JS pivot vs SQL pivot, and embed-throughput (per-row vs batched) to lock perf budgets in CI. | https://github.com/tinylibs/tinybench |
| `react-scan` | library | yes | Detect unnecessary re-renders in the bento grid / canvas cards when a single chart result updates (notMerge + motion.div spring re-renders). | https://github.com/aidenybai/react-scan |
| `@lhci/cli (Lighthouse CI)` | cli | yes | Measure TBT/INP on the route against localhost to prove the worker migration removed main-thread blocking. | https://github.com/GoogleChrome/lighthouse-ci |
| `onnxruntime-web (simd+threaded build)` | wasm | yes | Backend under transformers.js; host the threaded+SIMD .wasm locally and pin env.backends.onnx.wasm.wasmPaths for guaranteed offline CPU inference. | https://github.com/microsoft/onnxruntime |

---

## data-formulator — Deep Improvement Plan

Feature root: `src/features/data-formulator/` · Route: `src/app/dashboard/data-formulator/page.tsx` → `screens/DataFormulatorScreen.tsx`.

This feature is the AI-driven, multi-chart "workbench": a natural-language command bar + intent rail drives a set of agents (auto-dashboard, investigation, signal-radar, scenario, briefing, manager-answer) that emit chart specs, run DuckDB SQL, and render an infinite-canvas / bento grid of chart, KPI, insight, and table cards. It also offers semantic (vector) row search and a hybrid RAG retriever. It is genuinely **functional** but has serious, fixable performance and offline-correctness problems centered on doing heavy inference and reshaping on the renderer main thread.

---

### 1. Current implementation (with file references)

**Entry + data load**
- `page.tsx` renders `DataFormulatorScreen` (55k file). The screen resolves the active dataset from the DuckDB catalog (`listRegisteredDatasets`) and loads data with a single query: `SELECT * FROM "view" LIMIT 2000` (`DataFormulatorScreen.tsx:447-449`), then `setRows(sanitizeJsonValue(result))`. This 2000-row array is the in-memory substrate for semantic indexing and rowSample prompts.
- Columns/schema are derived from catalog metadata (`datasetColumnsToColumnInfo`, `schemaFromColumns`).

**LLM core** — `src/features/agent-canvas/core/llm.ts` (1180+ lines, shared with agent-canvas)
- Wraps `@huggingface/transformers` `pipeline("text-generation", …)`. `loadLLM()` and `chat()/chatMessages()` run **on the main thread**. Defaults: `DEFAULT_DTYPE = "q4"`, `preferredDevice = "auto"` (WebGPU adapter probe → WASM fallback), and critically `allowRemoteModels = true`.
- `_debug = true` by default. Every inference does `safeStringify(result, 5000)` and verbose `console.group` logging — expensive serialization in the hot path.
- A `setInterval` heartbeat + 60s `Promise.race` timeout exists specifically because long generations freeze the tab; this is a band-aid over the lack of a worker.
- `parseJSON` does balanced-brace/markdown-fence repair to coax JSON out of free-form output, and `parseJSONWithSchema` validates with Zod after the fact.

**Chart spec → SQL → option pipeline**
- `core/types.ts` defines `ChartSpec` with `encodings` (channel x/y/color/size), `filters`, `derived`, `limit/topN`.
- `core/sql.ts` `buildSQL` compiles a spec to DuckDB SQL with `x_val/y_val/color_val/size_val` aliases, aggregation (`buildAgg`), filters (`buildWhereClause`), histogram binning (`WIDTH_BUCKET`), ordering, and LIMIT. String-built; `replace("'","''")` only replaces the FIRST quote — an escaping correctness smell that should be `replaceAll` or parameter binding.
- `core/chart-options.ts` `buildOption` turns the SQL result rows into an ECharts option **client-side**, including JS pivoting for stacked/multi-line (`xs.map(x => data.find(d => …))`, O(xs·data)), heatmap `Math.max(...vals.map())` spread, treemap/funnel slicing.
- `core/ai.ts` (1180 lines) has rule-based derived-field generation (`RULE_PATTERNS`), `findCol` fuzzy matching that **constructs a new `Fuse` index on every call**, plus `flagOutliers`/`linearTrendline` helpers imported by chart-options.

**Auto-dashboard agent** — `core/auto-dashboard.ts`
- Runs an agent graph (`trace.nodes`), then for each proposed chart: `buildSQL` → `await runReadOnlyQuery(sql)` **inside a sequential loop** (`auto-dashboard.ts:164-172`). N charts = N serial IPC round-trips.

**Semantic / vector search** — `core/vector-search.ts`
- `getEmbedder()` loads `Xenova/all-MiniLM-L6-v2` with `device: "webgpu"` hardcoded first, fallback to default.
- `buildVectorIndex` embeds **row by row** (`for … await embedText(texts[i])`), up to 2000 rows, on the main thread. `embedTexts` claims batching but still `Promise.all`s individual `model(text)` calls.
- `searchVectorIndex` is brute-force cosine over all vectors, recomputing both norms each call even though embeddings are `normalize:true`.
- `useVectorSearch` hook holds the index in React state/ref — **no persistence**; rebuilt on every dataset switch and session.

**Hybrid RAG** — `rag/retriever.ts`, `rag/corpus.ts`, `rag/embedding-cache.ts`
- `HybridRetriever` fuses Fuse.js keyword + MiniLM dense ranks via Reciprocal Rank Fusion. Corpus embeddings ARE cached in Dexie/IndexedDB (`embedding-cache.ts`, FNV-1a key) — good pattern, but only for the small corpus, not the row index.

**Rendering** — `components/bento-chart-grid.tsx`, `components/canvas.tsx`, `components/canvas-cards.tsx`
- `BentoChartCard` uses `echarts-for-react` (`dynamic(ssr:false)`) with `opts={{renderer:"canvas"}}` and `notMerge` — full option rebuild + re-instantiate on every spec/result change. `useMemo(buildOption)` helps but the option object itself is large.
- `motion.div` spring animation + `whileHover` per card; `AnimatePresence` over all charts.
- `Canvas` is an infinite pan/zoom surface; renders ALL `visibleCards` with no viewport culling.

**Store** — `store.ts` + `store/workbench-store.ts`
- Zustand `persist` with a custom Drizzle storage and `bigIntJsonReplacer`. `partialize` persists the whole `threads` record including `chartSpec`/`chartResult` per step — synchronous JSON serialization on every `addStep`.

---

### 2. Performance bottlenecks and exact fixes

#### 2.1 Get inference off the main thread (biggest win)
Today `loadLLM`/`chat`/`embedText` all execute in the renderer. The fix is a dedicated **inference worker** wrapped with Comlink. Two engines:
- **Generative/structured** (chart spec, SQL, filters): route to **Electron main `node-llama-cpp`** with a JSON-schema/GBNF grammar so output is valid by construction.
- **Embeddings + browser-only LLM fallback**: a **Web Worker** running transformers.js.

Worker (browser embeddings):
```ts
// src/features/data-formulator/workers/embed.worker.ts
import * as Comlink from "comlink";
import { pipeline, env, type FeatureExtractionPipeline } from "@huggingface/transformers";

env.allowRemoteModels = false;                 // OFFLINE: never hit the network
env.localModelPath = "/models/";               // bundled weights
env.backends.onnx.wasm.wasmPaths = "/ort/";    // pinned threaded+SIMD wasm

let embedder: FeatureExtractionPipeline | null = null;

async function ensure(device: "webgpu" | "wasm") {
  if (embedder) return embedder;
  embedder = await pipeline("feature-extraction", "all-MiniLM-L6-v2", {
    device, dtype: device === "wasm" ? "q8" : "fp32",   // int8 on CPU
  });
  return embedder;
}

const api = {
  async embedBatch(texts: string[], device: "webgpu" | "wasm") {
    const m = await ensure(device);
    // TRUE batching: one forward pass over the whole array
    const out = await m(texts, { pooling: "mean", normalize: true });
    const [n, d] = out.dims as [number, number];          // [n, 384]
    const flat = out.data as Float32Array;
    const vecs: Float32Array[] = [];
    for (let i = 0; i < n; i++) vecs.push(flat.slice(i * d, (i + 1) * d));
    return Comlink.transfer(vecs, vecs.map((v) => v.buffer));
  },
};
Comlink.expose(api);
```
Main side:
```ts
// device chosen ONCE via adapter probe, default wasm on the medium target
const worker = new Worker(new URL("../workers/embed.worker.ts", import.meta.url), { type: "module" });
export const embedApi = Comlink.wrap<typeof api>(worker);
```
This removes both the freeze AND the per-row await: `buildVectorIndex` becomes a handful of `embedBatch(chunk)` calls (chunk ~64) instead of 2000 serial passes.

#### 2.2 Persist the row vector index
Stop rebuilding 2000 embeddings every session. In Electron main use **sqlite-vec**:
```sql
CREATE VIRTUAL TABLE df_vec USING vec0(row_id INTEGER PRIMARY KEY, embedding float[384]);
-- query: nearest 10
SELECT row_id, distance FROM df_vec
WHERE embedding MATCH ? ORDER BY distance LIMIT 10;
```
Key the table by `(datasetId, contentHash(schema))` so a re-import invalidates it. On dataset open: if a vec table exists for this dataset+schema, skip embedding entirely. Browser-only fallback: persist the `Float32Array` blob to OPFS (`createSyncAccessHandle`) and load into an in-worker `usearch`/`hnswlib-wasm` index — both give sub-ms KNN vs the current O(n) scan.

#### 2.3 Parallelize + push down auto-dashboard SQL
Replace the serial loop in `auto-dashboard.ts:164-172`:
```ts
const widgets = (await Promise.all(
  chartSpecs.map(async (chartSpec) => {
    const sql = buildSQL(chartSpec, tableName, columns);
    const data = await runReadOnlyQuery(sql);       // runs concurrently
    return toChartWidget(chartSpec, { sql, data });
  }),
)).filter(Boolean);
```
Even better: emit Arrow from DuckDB and skip `sanitizeJsonValue` row materialization. Move the JS pivot in `chart-options.ts` (stacked/multi-line `xs.map(x => data.find(...))`) into SQL with `GROUP BY x, color` so the renderer receives already-pivoted, already-aggregated, already-LIMITed data.

#### 2.4 Fix the O(xs·data) pivot and unsafe spreads in chart-options.ts
Build a lookup once instead of `data.find` per cell:
```ts
const byKey = new Map<string, number>();
for (const d of data) byKey.set(`${d.x_val}${d.color_val}`, Number(d.y_val ?? 0));
const series = groups.map((g, i) => ({
  name: g, type: isMultiLine ? "line" : "bar",
  data: xs.map((x) => byKey.get(`${x}${g}`) ?? 0),
  itemStyle: { color: PALETTE[i % PALETTE.length] },
}));
```
Replace `Math.max(...vals.map())` (stack-overflow risk on large arrays) with a `reduce`. Better still, compute the max in SQL.

#### 2.5 Render charts off the main thread / cheaper
- For dense line/area trend charts, route to **uPlot** (10x cheaper than ECharts on the medium CPU).
- For ECharts, enable `large: true` / `progressive` for scatter/heatmap and use **OffscreenCanvas + worker** rendering where supported; pass a typed-array dataset, not a giant option literal rebuilt with `notMerge`.
- Memoize the ECharts instance and call `setOption(option, { lazyUpdate: true, notMerge: false })` on refine instead of full re-instantiation.

#### 2.6 Kill hot-path logging
Default `_debug = false` in `llm.ts` and gate `safeStringify(result, 5000)` behind `isDebugEnabled()`. Production inference should not serialize 5kB of tensor output per call to the console.

#### 2.7 Memoize fuzzy column matching
In `ai.ts` `findCol`, build the `Fuse` index ONCE per `columns` array (columns are stable for a dataset), not on every call inside the rule loop:
```ts
const fuseCache = new WeakMap<ColumnInfo[], Fuse<ColumnInfo>>();
function colFuse(cols: ColumnInfo[]) {
  let f = fuseCache.get(cols);
  if (!f) { f = new Fuse(cols, { keys: ["name"], threshold: 0.4, ignoreLocation: true }); fuseCache.set(cols, f); }
  return f;
}
```

#### 2.8 Virtualize result tables
Table cards (semantic results, `tableData`) should use `@tanstack/react-virtual` so a 2000-row match doesn't mount 2000 rows.

#### 2.9 Trim persisted store
`partialize` should NOT persist `chartResult` (re-derivable from SQL) — store only the spec + sql + prompt per step, and re-run SQL on rehydrate. This shrinks synchronous JSON serialization on every `addStep`.

---

### 3. Offline gaps and how to close them

1. **`allowRemoteModels = true` (llm.ts default)** → a fresh offline machine tries huggingface.co. Fix: in the worker set `env.allowRemoteModels = false`, `env.localModelPath = "/models/"`, and bundle/seed the MiniLM + (optional) generative model weights. Add a startup smoke test that loads with the network blocked.
2. **ORT wasm path implicit** → pin `env.backends.onnx.wasm.wasmPaths` to a locally served threaded+SIMD build, otherwise first init fetches from CDN.
3. **`device: "webgpu"` hardcoded (vector-search.ts)** → probe once, default `wasm` + `dtype:"q8"` on the medium/no-GPU target; treat WebGPU as an opportunistic upgrade only.
4. **Model weights not guaranteed bundled** → add a build-time pre-fetch script writing `Xenova/all-MiniLM-L6-v2` (and tokenizer) into `public/models/` (or an OPFS seed on first run from a packaged asset), mirroring how piper/sherpa/kokoro models are already tracked via git-lfs.
5. **Row index not persisted** → sqlite-vec (Electron) / OPFS blob (browser) as in 2.2.
6. **Ollama/MCP providers** (`ollama-provider.ts`, `mcp-client.ts`) → keep strictly as localhost/LAN escape hatches; never let provider resolution fall back to a public host. The store default `ollamaHost: "edge://transformers-worker"` is a pseudo-scheme, fine, but document that real Ollama use requires an explicitly user-entered localhost URL.

---

### 4. Better architecture and implementation (step by step)

**Target shape:** the renderer is a thin view; all heavy work lives in (a) Electron main (DuckDB + node-llama-cpp + sqlite-vec) and (b) Web Workers (transformers.js embeddings, vector scan, chart-option/Arrow reshaping, OffscreenCanvas render).

**Step A — Adopt Vega-Lite as the canonical agent output.** The feature is named for vega/vega-lite; make the LLM emit a real (restricted) Vega-Lite spec instead of the bespoke `x_val/y_val` convention. This gives the agent a grammar it can reason about and a 30-chart-type surface (matching Microsoft's Data Formulator semantic engine). Validate with Zod, then either render with Vega (Canvas >1k marks) or compile to an ECharts/uPlot option for performance-critical types.
```ts
// constrained Vega-Lite the LLM is allowed to produce
const ChartSpec = z.object({
  mark: z.enum(["bar","line","area","point","arc","rect","boxplot"]),
  encoding: z.object({
    x: z.object({ field: z.string(), type: z.enum(["nominal","ordinal","quantitative","temporal"]), aggregate: z.string().optional(), bin: z.boolean().optional() }).optional(),
    y: z.object({ field: z.string(), type: z.string(), aggregate: z.string().optional() }).optional(),
    color: z.object({ field: z.string(), type: z.string() }).optional(),
  }),
  transform: z.array(z.object({ filter: z.string() })).optional(),
});
```

**Step B — Constrained generation via node-llama-cpp grammar.** Convert the Zod schema to JSON-schema and hand it to the grammar so tokens that would break the schema are never sampled. This deletes the `parseJSON` balanced-brace repair path:
```ts
// Electron main (utility process)
import { getLlama, LlamaChatSession, LlamaJsonSchemaGrammar } from "node-llama-cpp";
const llama = await getLlama();
const model = await llama.loadModel({ modelPath: "/models/qwen2.5-1.5b-instruct-q4_k_m.gguf" });
const ctx = await model.createContext();
const grammar = new LlamaJsonSchemaGrammar(llama, chartJsonSchema);
const session = new LlamaChatSession({ contextSequence: ctx.getSequence() });
const spec = await session.promptWithGrammar(grammar, prompt); // guaranteed valid JSON
```
Renderer calls this over a single rate-limited `contextBridge` IPC method.

**Step C — Vega-Lite → SQL.** Keep `buildSQL` as the compiler from the validated spec to DuckDB SQL, but harden escaping (`replaceAll`, parameter binding where possible) and push pivot/aggregate/topN into SQL. Return Arrow.

**Step D — Embedding + vector pipeline in worker + sqlite-vec** (sections 2.1/2.2). The `useVectorSearch` hook becomes:
```ts
async function buildIndex(datasetId, schemaHash, rows) {
  if (await vecStoreHas(datasetId, schemaHash)) return; // persisted, skip
  const texts = rows.map(rowToText);
  for (let i = 0; i < texts.length; i += 64) {
    const vecs = await embedApi.embedBatch(texts.slice(i, i + 64), device);
    await vecStorePut(datasetId, schemaHash, i, vecs);   // sqlite-vec / OPFS
    onProgress(i, texts.length);                          // non-blocking
  }
}
async function search(q, k) {
  const [qv] = await embedApi.embedBatch([q], device);
  return vecStoreSearch(datasetId, schemaHash, qv, k);    // ANN, not O(n)
}
```

**Step E — Coordinated views (Mosaic pattern, Trial).** As the canvas grows to many linked charts, adopt Mosaic's coordinator idea: one DuckDB instance, selections as SQL predicates, automatic pre-aggregation + crossfilter. Even a lightweight homegrown coordinator (a shared filter store that rewrites each chart's WHERE clause and dispatches parallel queries) beats today's independent per-card SQL.

**Step F — Render layer.** Route by mark/row-count: uPlot for dense time-series, ECharts (large/progressive, OffscreenCanvas) for scatter/heatmap, Vega for ad-hoc/rare marks. Virtualize tables. Cull off-screen canvas cards.

---

### 5. Recommended dependencies

| Dep | ~Stars | Maint. | License | Offline | Why |
|---|---|---|---|---|---|
| @huggingface/transformers | ~14-16k | Very active v4 | Apache-2.0 | yes | Keep for browser embeddings + LLM fallback, but in a worker with `allowRemoteModels=false` + pinned wasm/model paths |
| comlink | ~12.6k | Active | Apache-2.0 | yes | ~1.1kB worker RPC boundary for embed/vector/render workers |
| node-llama-cpp | ~2.1k | Very active v3.18 | MIT | yes | Electron-main structured generation with JSON-schema grammar → valid ChartSpec by construction |
| @duckdb/node-api | ~31k/1.5k | Very active | MIT | yes | Push all aggregation/pivot to SQL, Arrow output, parallel per-chart queries |
| apache-arrow | ~11-15k | Active | Apache-2.0 | yes | Zero-copy DuckDB→worker→chart interchange; avoid 2000-row object materialization |
| sqlite-vec | ~6k | Active | Apache-2.0/MIT | yes | Persist per-dataset row embeddings; no re-embed on restart |
| usearch / hnswlib-wasm | ~2.5k | Active | Apache-2.0 | yes | In-worker ANN for browser fallback (replace O(n) cosine) |
| vega-lite + vega | ~4.9k/11k | Active (UW) | BSD-3 | yes | Canonical agent grammar (feature namesake), 30 chart types |
| echarts | ~63k | Very active | Apache-2.0 | yes | Canvas workhorse, large/progressive + OffscreenCanvas |
| uPlot | ~10.2k | Active | MIT | yes | Dense time-series at ~10% CPU |
| @tanstack/react-virtual | ~5.5k | Very active | MIT | yes | Virtualize big result tables |
| mosaic/vgplot (uwdata) | ~1.2k | Active (UW) | BSD-3 | yes | Trial: crossfilter coordinator over local DuckDB |
| zod | ~34k | Very active | MIT | yes | Validate constrained spec; pair with grammar |

(Stars/maintenance verified via WebSearch against the respective GitHub repos, June 2026.)

---

### 6. CLIs & tools (offline) to build and verify

- **Model pre-fetch script** (node, build-time): download MiniLM + tokenizer (and optional Qwen GGUF) into `public/models/`; run an `allowRemoteModels=false` smoke test in CI with the network blocked.
- **DuckDB CLI**: `EXPLAIN ANALYZE` the generated `buildSQL` strings against managed Parquet; confirm pivot/aggregate pushdown.
- **size-limit (+preset-app, time plugin)**: per-route + per-worker byte/parse-time budgets (onnxruntime-web is the heavy one — keep it out of the initial route chunk).
- **sonda / @next/bundle-analyzer**: confirm transformers.js/echarts/vega-lite are lazy worker bundles, not in the first paint.
- **tinybench (Vitest bench)**: cosine-scan vs ANN, JS-pivot vs SQL-pivot, per-row vs batched embed throughput — lock budgets in CI.
- **react-scan**: catch re-render storms in the bento grid when one result updates.
- **@lhci/cli**: TBT/INP on the route vs localhost before/after the worker migration to prove main-thread unblocking.

---

### 7. Phased task list

**P1 — Unblock the main thread + close offline holes (highest value)**
1. Create `embed.worker.ts` (transformers.js) wrapped in Comlink; route `embedText`/`embedTexts`/`buildVectorIndex` through it with TRUE batching (chunk 64).
2. In the worker set `env.allowRemoteModels = false`, `env.localModelPath`, `env.backends.onnx.wasm.wasmPaths`; add build-time model pre-fetch + a network-blocked smoke test.
3. Default device to `wasm`+`q8`; WebGPU only as auto-detected upgrade. Remove hardcoded `device:"webgpu"` (vector-search.ts).
4. Default `_debug=false` in llm.ts; gate `safeStringify` behind debug.
5. Parallelize auto-dashboard SQL (`Promise.all`).
6. Memoize Fuse index in `ai.ts findCol`; fix O(xs·data) pivot + `Math.max(...spread)` in chart-options.ts; fix `replace`→`replaceAll` SQL escaping in sql.ts.

**P2 — Persistence, structured generation, render perf**
7. Persist per-dataset row index via sqlite-vec (Electron) / OPFS+usearch (browser), keyed by datasetId+schemaHash; skip re-embed when present.
8. Move structured generation (chart spec / SQL / filters) to node-llama-cpp in Electron main with a JSON-schema grammar; delete the parseJSON repair path for those calls.
9. Return Arrow from DuckDB; stop `sanitizeJsonValue` over 2000 rows; push pivot/aggregate/topN into SQL.
10. Virtualize table cards (@tanstack/react-virtual); slim store `partialize` (drop persisted `chartResult`).
11. Route trend charts to uPlot; enable ECharts large/progressive; memoize ECharts instances (no `notMerge` rebuild).

**P3 — Grammar + coordinated views + scale**
12. Adopt restricted Vega-Lite as the canonical agent output; map to ECharts/uPlot/Vega by mark+row-count.
13. Introduce a crossfilter coordinator (Mosaic pattern) for linked charts over one DuckDB instance with pre-aggregation.
14. OffscreenCanvas worker rendering for heavy chart types; viewport culling on the infinite canvas.
15. CI perf budgets (size-limit per-worker, tinybench, lhci) to prevent regressions.

Sources: [microsoft/data-formulator](https://github.com/microsoft/data-formulator), [transformers.js v3 WebGPU/wasm fallback](https://huggingface.co/blog/transformersjs-v3), [uwdata/mosaic](https://github.com/uwdata/mosaic), [vega-lite](https://github.com/vega/vega-lite), [offline-first IndexedDB embeddings](https://markaicode.com/offline-first-ai-web-app-indexeddb/).