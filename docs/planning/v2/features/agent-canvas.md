# Feature Plan — agent-canvas

**Maturity:** partial

## Performance issues

- transformers.js LLM inference runs on the renderer MAIN THREAD (core/llm.ts is "use client" and called directly from React callbacks in schema.ts/sql.ts/planner.ts) — every token generation blocks the UI; the voice feature already uses Workers but agent-canvas does not
- Per-column schema profiling fires 2 sequential DuckDB queries per column over ALL rows with no sampling (schema.ts profileColumnsSequentially) — a 40-col table = 80 round-trips; wide tables stall the schema phase for many seconds
- Insight generation per widget is fire-and-forget (pipeline.ts buildWidgetNode) and calls the single global LLM pipeline concurrently with SQL generation — serializes on one model causing head-of-line blocking; the .then() also emits a SECOND onWidget('done') after the synchronous one, double-rendering each widget
- ECharts charts use echarts-for-react with renderer:'canvas' on the main thread; no OffscreenCanvas/worker rendering, so 6-9 simultaneous chart mounts during sql_fan_out compete with LLM + layout for the main thread
- useAgentStore() is consumed without selectors in AgentCanvasScreen, Canvas, AgentFlowGraph, BuildStatus — every thought/event/widget update (hundreds during a run) re-renders the entire IDE tree; eventTicker + thoughts arrays push on every AG-UI event
- Canvas.tsx rebuilds full react-grid-layout layouts on every widgets change (buildLayouts useMemo keyed on widgets); react-grid-layout v2 has documented re-render lag with many items and no virtualization of off-screen widgets
- AgentFlowGraph syncs ReactFlow nodes via useEffect on every storeNodes change and StatsStrip runs a 1s setInterval re-render while running; xyflow nodes/edges/handlers are not memoized per official perf guidance, and onlyRenderVisibleElements is off
- Yjs doc is created (Canvas getYjsDoc) but layout is written on every drag with no persistence provider, no debounce, and never read back — pure overhead with no offline benefit
- DataTable renders up to 200 rows as plain DOM <tr> with no virtualization (WidgetRenderer); large data-table widgets blow up the DOM node count
- parseJSON brute-forces 4 candidate parses per LLM call with heavy console logging (llm.ts is a 'DEBUG BUILD' with _debug=true by default) — verbose logging left on the hot path

## Offline gaps

- CRITICAL: core/llm.ts sets env.allowRemoteModels=true and never sets env.localModelPath or env.backends.onnx.wasm.wasmPaths — model weights AND onnxruntime-web .wasm are fetched from the Hugging Face CDN / jsDelivr at runtime. First run REQUIRES internet and there is no bundled-once fallback; with no network the model-load step fails and the feature is dead
- MODEL_CATALOG (types.ts) references HuggingFaceTB/SmolLM2 and Qwen ONNX repos by hub id only; nothing pre-downloads or pins them into OPFS/disk for offline first-run
- No node-llama-cpp / Electron-main inference lane despite the app being Electron; the only LLM path is the network-dependent browser transformers.js path, contradicting the offline-only + medium-PC (no WebGPU) constraint
- onnxruntime-web wasm binaries are not self-hosted for agent-canvas (the voice workers self-host but the agent LLM path does not), so even cached models can fail to init the backend offline
- SetupScreen copy says 'First load downloads ~X MB; later runs use the local browser cache' — relies on a warm IndexedDB cache, which breaks on a fresh offline machine or cleared storage
- No model-presence preflight / 'download now while online' affordance and no integrity/size verification of cached weights
- WebGPU detection exists (detectDevice) but the WASM fallback still depends on remotely-hosted wasmPaths, so the graceful CPU path is itself not offline-safe

## Recommended dependencies

| Package | Category | Stars | Maint. | License | Offline | Replaces | Why | URL |
|---|---|---|---|---|---|---|---|---|
| `node-llama-cpp` | local-llm-electron | 2.1k | Very active — v3.18.1 (Mar 2026) | MIT | yes | network-dependent transformers.js LLM path | PRIMARY offline LLM lane in Electron main/utility process: GGUF q4, auto GPU(Vulkan/Metal/CUDA)+CPU AVX, in-process (no daemon), and GBNF/JSON-schema grammar enforcement at the sampler — fixes both the offline gap and the fragile parseJSON path for plans/SQL. | https://github.com/withcatai/node-llama-cpp |
| `@huggingface/transformers` | local-llm-browser | ~15k | Very active — v4.x | Apache-2.0 | yes | its own current CDN-dependent configuration | Keep as the browser fallback + embeddings engine, but configure env.allowRemoteModels=false, env.localModelPath, and env.backends.onnx.wasm.wasmPaths so it runs fully offline from bundled/OPFS-cached assets inside a Web Worker. | https://github.com/huggingface/transformers.js |
| `comlink` | worker-rpc | 12.6k | Active (GoogleChromeLabs) | Apache-2.0 | yes | manual postMessage plumbing | ~1.1kB Proxy worker RPC to move transformers.js inference + chart-option building off the renderer main thread; the voice feature already uses raw Workers, Comlink makes the agent LLM worker ergonomic and typed. | https://github.com/GoogleChromeLabs/comlink |
| `zod (+ zod-to-json-schema)` | schema-validation | 34k+ | Very active | MIT | yes | ad-hoc manual field coercion in planner.ts | Already a dependency (parseJSONWithSchema exists). Drive both node-llama-cpp JSON-schema grammars and browser-side validation/repair so DashboardPlan/WidgetSpec output is structurally guaranteed. | https://github.com/colinhacks/zod |
| `@tanstack/react-virtual` | virtualization | 5.5k | Very active | MIT | yes | unvirtualized DataTable + log lists | Virtualize the data-table widget (currently 200 raw <tr>) and the thoughts/event tickers so large outputs do not blow up the DOM. | https://github.com/TanStack/virtual |
| `echarts (OffscreenCanvas in worker)` | viz | 63k | Very active (Apache) | Apache-2.0 | yes | main-thread echarts-for-react for heavy charts | Already used. Move chart rendering to a Worker via OffscreenCanvas (echarts.init(offscreen)) — the single biggest 60fps lever while LLM and grid layout fight for the main thread. | https://github.com/apache/echarts |
| `uPlot` | viz-timeseries | 10.2k | Active — v1.6.x | MIT | yes | ECharts for dense time-series only | For dense line/area/time-trend widgets (planner emits area/line/multi-line), uPlot renders 100k+ points at ~10% CPU vs ECharts — ideal for medium-end PCs. | https://github.com/leeoniya/uPlot |
| `y-indexeddb` | persistence-crdt | y-crdt org | Active | MIT | yes | the no-op in-memory Y.Doc in Canvas.tsx | If Yjs layout persistence is kept, gate it on a real IndexedDB provider with whenStored so canvas layouts survive reload offline; otherwise remove the unused Yjs doc entirely. | https://github.com/yjs/y-indexeddb |
| `sqlite-vec` | vector-search | 6k | Active (Mozilla-backed) | Apache-2.0/MIT | yes | external vector DB | Optional: if the ReAct loop grows into RAG over column samples / prior runs, embed with MiniLM (transformers.js) and store vectors in better-sqlite3 via sqlite-vec — fully offline, single file. | https://github.com/asg017/sqlite-vec |
| `react-scan` | dev-tooling | 21.4k | Very active | MIT | yes | manual render profiling | Dev-only: pinpoint the whole-tree re-renders caused by selector-less useAgentStore() across the 4-panel IDE. | https://github.com/aidenybai/react-scan |

## CLIs & tools

| Tool | Type | Offline | Why | URL |
|---|---|---|---|---|
| `node-llama-cpp CLI (npx node-llama-cpp pull / chat)` | cli | yes | Download/quantize/verify GGUF models once while online, then run fully offline; smoke-test GBNF JSON-schema grammars against the DashboardPlan schema from the terminal. | https://node-llama-cpp.withcat.ai/guide/grammar |
| `huggingface-cli download` | cli | partial | Pre-fetch SmolLM2/Qwen ONNX weights into a local models/ dir at build time so env.localModelPath can serve them with allowRemoteModels=false. | https://huggingface.co/docs/huggingface_hub/guides/cli |
| `DuckDB CLI` | cli | yes | Validate generated SQL (SUMMARIZE, EXPLAIN, reservoir sampling) against the managed Parquet locally before wiring it into widget queries. | https://duckdb.org/docs/api/cli |
| `size-limit (@size-limit/preset-app)` | cli | yes | Add per-worker budgets for the agent LLM worker + echarts worker bundles so the offline payload stays bounded on medium PCs. | https://github.com/ai/size-limit |
| `binaryen wasm-opt` | cli | yes | Optimize/SIMD-enable any self-hosted onnxruntime-web .wasm bundled for the offline transformers.js fallback. | https://github.com/WebAssembly/binaryen |
| `tinybench / Vitest bench` | library | yes | Microbench schema-profiling and SQL fan-out against fixture datasets to lock a perf budget for the schema phase. | https://github.com/tinylibs/tinybench |

---

# Agent Canvas — Deep Improvement Plan

`src/features/agent-canvas/` · route `src/app/dashboard/agent-canvas/page.tsx`

Agent Canvas is the most ambitious feature in data-navigator: a multi-agent LangGraph pipeline (schema → ReAct SQL → planner → human review → critique/revise → parallel SQL fan-out → narrator) that auto-builds a dashboard from a DuckDB dataset, with a 4-panel "IDE" (canvas / SQL / xyflow agent graph / narrative), AG-UI event streaming, and a local transformers.js LLM. The skeleton is genuinely impressive and mostly wired. But it has **one disqualifying offline bug**, **one disqualifying perf bug**, and a cluster of architectural smells that keep it at `partial` maturity.

The two headline problems:

1. **It is not offline.** `core/llm.ts` loads models from the Hugging Face CDN at runtime (`env.allowRemoteModels = true`, no `localModelPath`, no self-hosted `wasmPaths`). On a fresh machine with no internet the model-load step fails and the whole feature is dead. Violates HARD CONSTRAINT #1.
2. **Inference runs on the renderer main thread.** `core/llm.ts` is `"use client"` and is called directly from `schema.ts` / `sql.ts` / `planner.ts` inside React callbacks. Every token of every agent step blocks the UI. The voice feature in this same repo already runs sherpa/transformers in Web Workers — agent-canvas just never adopted that pattern. Violates HARD CONSTRAINT #2.

Everything else in this plan is downstream of fixing those two.

---

## 1. Current implementation

### 1.1 Orchestration — `core/pipeline.ts` (664 lines)

A real `@langchain/langgraph` `StateGraph` (`AgentState` annotation) with nodes:

- `schemaNode` → `analyzeSchema()`
- `reactSqlLoopNode` → fires up to 3 canned exploration queries
- `plannerNode` → `buildPlan()`
- `humanInterruptNode` → `interrupt({reason:"plan-review"})` with `interruptBefore:["human_interrupt"]`
- `critiqueNode` / `reviseNode` → rule-based loop (max 3 cycles)
- `sqlFanOutNode` → builds widgets with hand-rolled concurrency 3
- `narratorNode` → string-concatenated markdown summary

State carries **callback functions** (`onWidget`, `onThought`, `onPlan`, …) *inside the graph annotation* (lines 69–92). This is the central architectural smell: a `MemorySaver` checkpointer is configured, but the state is full of non-serializable closures, so checkpointing/replay/resume can never actually round-trip. The `resume()` path re-`invoke`s with the same closures rather than `Command({resume})`, and `runPipeline` does `void graph.invoke(input, config).catch(console.error)` — fire-and-forget, no surfaced errors.

`sqlFanOutNode` (471–499) reimplements a concurrency pool with a dead `tasks` array (`void tasks;`). `buildWidgetNode` (367–469) emits `onWidget(done)` **synchronously** AND again inside a fire-and-forget `generateInsight().then()` — so every widget renders twice and insight ordering races.

### 1.2 LLM engine — `core/llm.ts` (1404 lines)

A self-described "DEBUG BUILD" with `_debug = true` by default. Wraps `@huggingface/transformers` `pipeline("text-generation")`. Notable:

- `loadLLM` (620–817): `env.allowRemoteModels = true`, `env.useBrowserCache = true`. **No `localModelPath`, no `wasmPaths`.** `detectDevice` (347–413) tries WebGPU then falls back to `"wasm"` — but the wasm backend itself is CDN-hosted.
- `chatMessages` (861–1095): runs the pipeline with a 60s timeout race + 5s heartbeat logging. All synchronous on the calling thread.
- `parseJSON` (1192–1314): tries 4 candidates (direct / fence / balanced-object / balanced-array) with verbose logging each attempt. This is the only structured-output safety net — there is **no constrained decoding**, so malformed JSON from a 360M model is common and only caught after the fact.

### 1.3 Agents — `schema.ts` (406) · `sql.ts` (324) · `planner.ts` (299)

- `schema.ts`: resolves a dataset from the DuckDB catalog (`listRegisteredDatasets`) or falls back to `DESCRIBE`. `profileColumnsSequentially` runs **2 queries per column over the full table** (stats + 6 distinct samples) — no `USING SAMPLE`, no batching. Heuristic `inferSemantic` + regex `detectCategory`. One optional LLM summarize call.
- `sql.ts`: solid heuristic SQL templates per chart type (good!), plus an LLM path gated on `isLoaded()`. Post-processes with `addLimit` + `explicitColumns`. Safety is "must start with SELECT/WITH" — no AST/EXPLAIN validation.
- `planner.ts`: heuristic plan (KPI + time + bar + pie + scatter + stacked + table) and an LLM path returning JSON parsed by `parseJSON`. Field coercion is manual.

### 1.4 UI — `AgentCanvasScreen.tsx` (502) + components

- 4-panel resizable IDE. **The SQL IDE panel is an empty `<div>`** (around line 424) — Monaco/PrimeReact promised in the header comment but not present.
- `Canvas.tsx`: `react-grid-layout` v2 `ResponsiveGridLayout`; creates a `Y.Doc` and writes layout on every drag but never reads it back or persists it.
- `WidgetRenderer.tsx` (689): ECharts via `echarts-for-react` lazy import, `renderer:"canvas"`, main thread. KPI grid uses `react-countup`. `DataTable` renders ≤200 raw `<tr>` (no virtualization).
- `AgentFlowGraph.tsx`: `@xyflow/react` v12; syncs nodes via `useEffect` on store change; `StatsStrip` has a 1s `setInterval` while running.
- `agent-store.ts`: zustand+immer; `thoughts` and `eventTicker` capped at 200 but pushed on **every** event. All consumers call `useAgentStore()` with no selector.

### 1.5 Offline posture of dependencies

Versions confirmed: `@huggingface/transformers ^4.2.0`, `@langchain/langgraph ^1.3.6`, `@xyflow/react ^12.11.0`, `react-grid-layout ^2.2.3`, `echarts ^6.1.0`, `yjs ^13.6.31`. `node-llama-cpp` is **not** installed. The DuckDB native path (`@duckdb/node-api 1.5.3`) is correct and offline. The single weak link is the transformers.js CDN config.

---

## 2. Performance bottlenecks & exact fixes

### 2.1 Move LLM inference into a Web Worker (highest priority)

Today `chat()` runs on the renderer thread. Mirror the voice feature: a dedicated worker that owns the transformers.js pipeline, exposed over Comlink.

```ts
// core/worker/llm.worker.ts
import * as Comlink from "comlink";
import { env, pipeline, TextStreamer, type Message } from "@huggingface/transformers";

// OFFLINE-FIRST CONFIG — see §3.1
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = "/models/llm/";                 // bundled / OPFS-synced
env.backends.onnx.wasm.wasmPaths = "/onnx/";         // self-hosted ORT wasm
env.backends.onnx.wasm.numThreads = navigator.hardwareConcurrency ?? 4;

let pipe: Awaited<ReturnType<typeof pipeline>> | null = null;

const api = {
  async load(modelId: string, onProgress: (p: number, t: string) => void) {
    pipe = await pipeline("text-generation", modelId, {
      dtype: "q4", device: "wasm",                   // webgpu auto-upgrade in load()
      progress_callback: (i: any) => onProgress((i.progress ?? 0) / 100, i.file ?? i.status),
    });
  },
  async chat(messages: Message[], opts: { maxTokens?: number; temperature?: number },
             onToken: (t: string) => void) {
    if (!pipe) throw new Error("LLM not loaded");
    const streamer = new TextStreamer((pipe as any).tokenizer, {
      skip_prompt: true, callback_function: onToken,
    });
    const out = await (pipe as any)(messages, {
      max_new_tokens: opts.maxTokens ?? 256,
      do_sample: (opts.temperature ?? 0) > 0,
      temperature: opts.temperature, streamer, return_full_text: false,
    });
    return extractAssistant(out);
  },
};
Comlink.expose(api);
```

```ts
// core/llm.ts (main thread) — thin client, same public surface
import * as Comlink from "comlink";
let worker: Worker | null = null;
let api: Comlink.Remote<LLMWorkerApi> | null = null;

export function ensureWorker() {
  if (!worker) {
    worker = new Worker(new URL("./worker/llm.worker.ts", import.meta.url), { type: "module" });
    api = Comlink.wrap<LLMWorkerApi>(worker);
  }
  return api!;
}
export async function chat(system: string, user: string, opts: ChatOptions = {}) {
  return ensureWorker().chat(
    [{ role: "system", content: system }, { role: "user", content: user }],
    { maxTokens: opts.maxTokens, temperature: opts.temperature },
    opts.onToken ? Comlink.proxy(opts.onToken) : Comlink.proxy(() => {}),
  );
}
```

Net effect: token generation no longer blocks the canvas, the xyflow graph animates, and the 1s stats interval stays smooth. Also strip the default-on `_debug` logging from the hot path (gate behind `process.env.NODE_ENV !== "production"`).

### 2.2 Sample-based, batched schema profiling

`profileColumnsSequentially` is O(columns) full-table scans. Replace with a **single** `SUMMARIZE` (DuckDB native) plus a bounded sample for distinct values.

```ts
// schema.ts
const summary = await runReadOnlyQuery(`SUMMARIZE SELECT * FROM ${quotedTable}`);
// rows give column_name, column_type, min, max, approx_unique, null_percentage, avg
const sampleRows = await runReadOnlyQuery(
  `SELECT * FROM ${quotedTable} USING SAMPLE 500 ROWS`,
);
```

`SUMMARIZE` uses HyperLogLog for `approx_unique`, so cardinality no longer requires `COUNT(DISTINCT)` per column. This collapses ~80 round-trips into 2 and removes the dominant schema-phase stall. Emit progress per *summary row* parsed, not per query.

### 2.3 Fix the double-render + serialize insight generation

In `buildWidgetNode`, remove the fire-and-forget `.then()` that emits a second `onWidget`. Make insight a clearly separate awaited enrich step:

```ts
const base: WidgetState = { spec, status: "done", sql, rawData, echartsOption, kpis, tableHeaders, tableRows };
state.onWidget?.(base);
const insight = await generateInsight(spec, rawData, emit).catch(() => "");
if (insight) state.onWidget?.({ ...base, insight });
return { widgets: [...state.widgets, base], thoughts };
```

Because there is only ONE LLM (single global pipeline), do not run SQL-gen and insight-gen concurrently across widgets — they serialize on the worker anyway and the unbounded `Promise.all` just thrashes. Keep `CONC=1` for LLM-bound steps; let the DuckDB execution be the parallel part.

### 2.4 OffscreenCanvas chart rendering

Heavy widgets mount 6-9 ECharts instances during `sql_fan_out`. Render them in a worker:

```ts
// WidgetRenderer: for chart widgets, transfer an OffscreenCanvas
const offscreen = canvasRef.current!.transferControlToOffscreen();
chartWorker.render(Comlink.transfer(offscreen, [offscreen]), chartOpts);
// chart.worker.ts: echarts.init(offscreen); chart.setOption(opts);
```

ECharts 6 supports this directly. Keep `echarts-for-react` only for tiny/KPI widgets.

### 2.5 Zustand selectors + memoization

Every component uses bare `useAgentStore()`. Switch to selectors so a thought push doesn't re-render the canvas:

```ts
const widgets = useAgentStore((s) => s.widgets);
const running = useAgentStore((s) => s.running);
// BuildStatus: const { phase, plan } = useAgentStore(useShallow(s => ({phase: s.phase, plan: s.plan})));
```

Memoize `WidgetCard` (`React.memo` with a comparator on `widget.status` + `widget.insight`), memoize xyflow `nodeTypes`/`edges`, follow xyflow's perf guide (memoized node components, `useCallback` handlers). Add `onlyRenderVisibleElements` to ReactFlow.

### 2.6 Virtualize tables and tickers

`DataTable` and the thoughts/event logs should use `@tanstack/react-virtual`. Cap `eventTicker` rendering to the visible window, not 200 DOM rows.

### 2.7 Decide on Yjs

Either wire `y-indexeddb` so layouts persist offline across reloads (gate render on `whenStored`), or delete the dead `Y.Doc` in `Canvas.tsx`. Right now it is pure overhead with no payoff.

---

## 3. Offline gaps & how to close them

### 3.1 The model + wasm must be local (blocking)

This is the must-fix. Three settings, all shown in §2.1:

```ts
env.allowRemoteModels = false;
env.allowLocalModels  = true;
env.localModelPath    = "/models/llm/";          // served by Electron protocol / Next public
env.backends.onnx.wasm.wasmPaths = "/onnx/";     // self-hosted onnxruntime-web .wasm
```

Then ship a **download-once-while-online** step (the app already has this UX language in `SetupScreen`). Pre-fetch the chosen ONNX model into OPFS via a build script or a first-run guarded fetch, and verify presence before allowing "Build":

```ts
async function modelIsLocal(modelId: string): Promise<boolean> {
  const root = await navigator.storage.getDirectory();
  try { await root.getDirectoryHandle("models"); /* walk to modelId */ return true; }
  catch { return false; }
}
```

Build-time prefetch (offline-safe thereafter):
```bash
huggingface-cli download HuggingFaceTB/SmolLM2-360M-Instruct \
  --include "onnx/*q4*" "*.json" "tokenizer*" \
  --local-dir public/models/llm/SmolLM2-360M-Instruct
```

### 3.2 Add the node-llama-cpp Electron lane (recommended primary)

The app is Electron with a native DuckDB main process. The Tech Radar's two-lane design applies directly: **node-llama-cpp in the main/utility process is the right primary LLM** for a no-WebGPU medium PC, and it solves the structured-output fragility (§4) for free via GBNF/JSON-schema grammars. Wire it behind the existing IPC contract (one `contextBridge` method, trusted-sender validation already present per the radar). transformers.js becomes the browser-only fallback + embeddings engine.

```ts
// electron/main: llama-service.ts
import { getLlama, LlamaChatSession } from "node-llama-cpp";
const llama = await getLlama();                       // auto GPU(Vulkan)→CPU
const model = await llama.loadModel({ modelPath: gguf("Qwen2.5-1.5B-Instruct-q4_k_m.gguf") });
const ctx = await model.createContext();
const session = new LlamaChatSession({ contextSequence: ctx.getSequence() });

export async function plan(schemaJson: string, planSchema: object) {
  const grammar = await llama.createGrammarForJsonSchema(planSchema); // ENFORCED JSON
  const res = await session.prompt(buildPlannerPrompt(schemaJson), { grammar });
  return grammar.parse(res); // guaranteed-valid DashboardPlan
}
```

### 3.3 Self-host ORT wasm for agent-canvas

The voice workers already self-host onnxruntime-web; copy the same `public/onnx/` assets and point `wasmPaths` at them so the CPU fallback is itself offline.

---

## 4. Better architecture & implementation

### 4.1 Structured output: stop parsing, start constraining

The planner/SQL agents currently emit free text and hope `parseJSON` recovers JSON. transformers.js (browser) has **no grammar-constrained decoding** (confirmed: Outlines is Python-only; transformers.js exposes only `LogitsProcessorList`). Two tiers:

- **Electron lane (preferred):** node-llama-cpp `createGrammarForJsonSchema(zodToJsonSchema(PlanSchema))` — output is structurally guaranteed; delete the 4-candidate `parseJSON` heuristic from this path.
- **Browser fallback:** keep `parseJSONWithSchema` (Zod) but add a single repair retry that feeds the Zod error back to the model. Optionally add a minimal custom `LogitsProcessor` that bans tokens which can't continue valid JSON (whitespace/brace tracking) — partial but cheap.

```ts
import { zodToJsonSchema } from "zod-to-json-schema";
const PlanSchema = z.object({
  title: z.string(), description: z.string(),
  widgets: z.array(z.object({
    id: z.string(), title: z.string(),
    chartType: z.enum(["bar","line","area","pie","donut","scatter","heatmap","kpi-grid","data-table" /*…*/]),
    sqlIntent: z.string(), dimensions: z.array(z.string()), metrics: z.array(z.string()),
  })).min(3).max(9),
});
```

### 4.2 Make the LangGraph state serializable (real checkpoint/resume)

Pull every callback out of `AgentState`. The graph should emit **events**, and the React layer subscribes — which the AG-UI event bus already does. State holds only data (`schema`, `plan`, `widgets`, `critiqueCount`, `approved`). Resume via `Command`:

```ts
// pipeline.ts
const stream = await graph.stream(input, { configurable: { thread_id }, streamMode: "updates" });
for await (const update of stream) emitToBus(update);     // UI reads the bus
// resume:
await graph.stream(new Command({ resume: { action, plan } }), config);
```

Now `MemorySaver` (or a SQLite checkpointer in Electron) actually enables pause/replay/crash-recovery — the whole point of the interrupt design.

### 4.3 SQL validation before execution

Before `runReadOnlyQuery`, validate with DuckDB itself: `EXPLAIN <sql>` in a try/catch; on failure, feed the error back to the SQL agent once. This catches hallucinated columns the regex check misses, cheaply and offline.

### 4.4 Fill the empty SQL IDE panel

The panel is a stub. Wire it to the existing `sqlTabs` store state with a lightweight editor (CodeMirror 6 is far smaller than Monaco and offline) + a virtualized results table reusing the `DataTable` improvements. This is a real promised feature currently shipping empty.

### 4.5 Worker topology (target)

```
Renderer (main thread)            Electron main / utility
  AgentCanvasScreen  ──IPC──►  node-llama-cpp (primary LLM, GBNF)
  zustand (selectors)          DuckDB (native, runReadOnlyQuery)
     ▲   │
     │   ├─ Comlink ─► llm.worker  (transformers.js fallback + MiniLM embeddings)
     │   └─ Comlink ─► chart.worker (ECharts OffscreenCanvas)
  AG-UI event bus  ◄── graph.stream() updates (data-only state)
```

---

## 5. Recommended dependencies

| Dep | Stars | Maint. | License | Offline | Why |
|---|---|---|---|---|---|
| node-llama-cpp | 2.1k | v3.18.1 Mar 2026 | MIT | yes | Primary Electron LLM; GBNF/JSON-schema enforced output; auto GPU/CPU |
| @huggingface/transformers | ~15k | v4.x active | Apache-2.0 | yes | Browser fallback + embeddings; reconfigure for offline |
| comlink | 12.6k | active | Apache-2.0 | yes | Worker RPC for LLM + chart workers |
| zod (+ zod-to-json-schema) | 34k+ | active | MIT | yes | Drives grammars + validates plans |
| @tanstack/react-virtual | 5.5k | active | MIT | yes | Virtualize tables + log tickers |
| echarts (OffscreenCanvas) | 63k | active | Apache-2.0 | yes | Off-main-thread chart render |
| uPlot | 10.2k | active | MIT | yes | Dense time-series widgets |
| y-indexeddb | y-crdt | active | MIT | yes | Persist layout offline (or remove Yjs) |
| react-scan (dev) | 21.4k | active | MIT | yes | Find re-render storms |
| sqlite-vec (opt) | 6k | active | Apache/MIT | yes | Offline RAG if ReAct grows |

All permissive, all run with zero runtime network once assets are local.

---

## 6. CLIs & tools (offline)

- `npx node-llama-cpp pull` / `chat` — fetch+verify GGUF once, test grammars offline.
- `huggingface-cli download` — prefetch ONNX weights into `public/models/llm/` at build.
- DuckDB CLI — `SUMMARIZE` / `EXPLAIN` validation of generated SQL.
- `size-limit` with per-worker budgets (llm.worker, chart.worker).
- `binaryen wasm-opt` — SIMD-optimize self-hosted ORT wasm.
- `tinybench` / Vitest bench — lock schema-phase + fan-out perf budgets against fixtures.

---

## 7. Phased tasks

### P1 — Make it offline + non-blocking (ship-blockers)
1. Set `allowRemoteModels=false` + `localModelPath` + self-hosted `wasmPaths`; bundle/prefetch one model; add a model-presence preflight before "Build".
2. Move transformers.js into `llm.worker.ts` behind Comlink; keep `chat()` signature.
3. Strip default-on debug logging from the hot path; gate on dev.
4. Fix `buildWidgetNode` double-`onWidget`; serialize LLM-bound steps (CONC=1), parallelize only DuckDB execution.
5. Replace per-column profiling with `SUMMARIZE` + `USING SAMPLE`.

### P2 — Correctness + perf hardening
6. Add node-llama-cpp Electron lane with GBNF/JSON-schema for plan + SQL; make transformers.js the fallback.
7. Remove callbacks from `AgentState`; drive UI from `graph.stream()` + AG-UI bus; resume via `Command`.
8. Zustand selectors everywhere; `React.memo` `WidgetCard`; memoize xyflow nodes/edges; `onlyRenderVisibleElements`.
9. OffscreenCanvas chart worker for heavy widgets; uPlot for dense time-series.
10. Virtualize `DataTable` + thought/event logs.
11. Pre-execution SQL `EXPLAIN` validation with one repair retry.

### P3 — Finish the promised feature
12. Implement the empty SQL IDE panel (CodeMirror 6 + virtualized results) against existing `sqlTabs` state.
13. Decide Yjs: wire `y-indexeddb` persistence or delete the dead doc.
14. Optional sqlite-vec RAG for the ReAct loop over column samples / prior runs.
15. Add size-limit per-worker budgets + tinybench schema/fan-out benchmarks to CI.

Sources: transformers.js (github.com/huggingface/transformers.js), transformers.js offline/WebGPU docs (huggingface.co/docs/transformers.js), node-llama-cpp grammar guide (node-llama-cpp.withcat.ai/guide/grammar), node-llama-cpp repo (github.com/withcatai/node-llama-cpp), react-grid-layout v2 perf discussion #2228, React Flow performance (reactflow.dev/learn/advanced-use/performance), Outlines Python-only constrained decoding (github.com/dottxt-ai/outlines), transformers.js logits_process docs.