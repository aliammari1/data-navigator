# Target Architecture — Offline-First, Medium-End PC

## Executive Summary

data-navigator is an Electron + Next.js 16 offline desktop data-analysis app whose existing stack is ~90% correct. The synthesis of the tech radar and 27 per-feature plans reveals ONE systemic offline-breaking defect repeated across nearly every AI-touching feature, plus ONE systemic performance defect repeated across nearly every screen.

OFFLINE DEFECT (critical, ship-blocking): The primary LLM path in the codebase is `@mlc-ai/web-llm` (installed, used by ai-analysis, ai-briefing, channel-monitor, reconciliation, deep-analytics) which is WebGPU-ONLY with no CPU fallback. On the medium-end / integrated-GPU / Linux target WebGPU is frequently unavailable, so the entire AI layer silently degrades to rule-based stubs or throws. Compounding this, the transformers.js path used by agent-canvas and data-formulator runs with `allowRemoteModels=true` and never pins `env.localModelPath` / `env.backends.onnx.wasm.wasmPaths`, so first run fetches model weights AND onnxruntime-web .wasm from the Hugging Face CDN — meaning a fresh offline machine has a dead AI feature. The fix is a unified two-lane local-inference layer: node-llama-cpp (GGUF q4 + GBNF/JSON-schema grammars) in the Electron utility process as PRIMARY, and a fully-pinned offline transformers.js Web Worker as the browser/embeddings lane. web-llm is demoted to an opportunistic WebGPU-only accelerator behind a capability flag, never primary.

PERFORMANCE DEFECT (systemic): Almost every feature runs heavy work on the renderer main thread — LLM token generation, k-means/stats, CSV parsing, DuckDB result materialization as JSON row-objects, ECharts canvas rendering, and export ZIP/PDF generation. Stores are consumed without selectors causing whole-tree re-renders on every event; lists are unvirtualized; many screens fabricate Math.random() data instead of querying the native DuckDB engine. The unifying remedy is a strict worker-boundary architecture: Comlink-wrapped workers for inference, stats, parsing, vector search, layout, and export; OffscreenCanvas for charts; Arrow-IPC (transferable ArrayBuffers) replacing JSON row transport; uPlot for dense time-series; TanStack Virtual everywhere; and SUMMARIZE/histogram()/approx_* SQL pushdown replacing per-column query fan-out.

This document delivers: (1) a target architecture organized around process/worker discipline, a unified data layer (native DuckDB + Arrow + OPFS), a unified AI runtime, and a unified offline-collab substrate (Yjs + Hocuspocus LAN hub); (2) a deduplicated MASTER dependency catalog of ~70 libraries with status (add / replace / already-installed-unused / trial / hold), stars, offline-capability and which features consume each; and (3) a 3-phase roadmap with explicit performance budgets (INP, main-thread block, bundle/route) and offline acceptance gates (zero-network smoke test, pinned WASM, bundled models) that every phase must pass.

---

# data-navigator — Target Architecture (Offline-First, Medium-End PC)

## 0. Guiding invariants (apply to every layer)

1. **Zero network at runtime.** No cloud APIs, no hosted inference, no CDN fetch of models/WASM, no telemetry. Every model/WASM asset is bundled or cached-once into OPFS/IndexedDB/disk. A CI "airplane-mode" smoke test (network disabled) must pass on a cold profile.
2. **WebGPU is opportunistic, never required.** WASM-SIMD + INT8 CPU is the guaranteed baseline. WebGPU is an auto-detected upgrade with mandatory CPU fallback. This single rule demotes `@mlc-ai/web-llm` from primary to optional accelerator.
3. **Two-process discipline.** Native-heavy work (DuckDB, node-llama-cpp, onnxruntime-node, export streaming, tippecanoe) runs in **Electron main/utility process**. Browser-heavy work (transformers.js embeddings, ONNX-web, OPFS SyncAccessHandle, rasterization, clustering, layout) runs in **Web Workers via Comlink** — never the renderer main thread.
4. **Arrow, not JSON, across boundaries.** DuckDB → worker → chart/grid moves as Arrow IPC (transferable `ArrayBuffer`), not `Record<string,unknown>[]`. Eliminates row↔object transposition, the dominant cost on wide/large results.
5. **Push compute down.** Stats/aggregation/quantiles/histograms/correlation/diff are SQL (`SUMMARIZE`, `histogram()`, `approx_count_distinct`, `CORR`, `QUANTILE_CONT`, `FULL OUTER JOIN`), not JS loops. Sampling is `USING SAMPLE reservoir(n)`, never `LIMIT n` (biased).
6. **Selectors + virtualization always.** Zustand consumed via narrow selectors + `useShallow`; every list/grid/tree virtualized with TanStack Virtual; charts via OffscreenCanvas; per-route/per-worker bundle budgets gated in CI.

---

## 1. Process & worker model

```
┌─────────────────────────── Electron MAIN / UTILITY PROCESS (Node) ───────────────────────────┐
│  duckdb-service        @duckdb/node-api  → native vectorized read_csv/COPY/Parquet/Arrow IPC  │
│  llm-service           node-llama-cpp    → GGUF q4 + GBNF/JSON-schema grammars (PRIMARY LLM)   │
│  tabular-ml-service    onnxruntime-node  → XGBoost/LightGBM/sklearn→ONNX-ML (no 20MB wasm)     │
│  voice-service         sherpa-onnx-node  → Whisper-tiny STT + Kokoro TTS (native)             │
│  export-service        pdfmake/exceljs/docx/pptxgenjs streaming → fs (saveDialog)             │
│  vector-service        better-sqlite3 + sqlite-vec → persistent per-dataset KNN               │
│  collab-hub            @hocuspocus/server (embedded) + bonjour-service mDNS → LAN room sync    │
│  tile-service (build)  tippecanoe → PMTiles (offline, build-step / on-demand)                 │
│  IPC: contextBridge, one method per channel, trusted-sender validation, PathAccessController  │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
                                   ▲   Arrow IPC buffers / structured RPC   ▲
                                   │  (@electron/fuses locked, CSP, COOP/COEP on custom protocol)
┌──────────────────────────────── RENDERER (Next.js 16, React 19) ────────────────────────────────┐
│  React tree: thin. Selectors only. No heavy compute, no parsing, no inference, no export.        │
│                                                                                                  │
│  ── Web Workers (Comlink-wrapped) ──                                                              │
│  inference.worker     transformers.js (WASM-SIMD, env pinned) → embeddings + browser LLM fallback│
│  analysis.worker      simple-statistics/@stdlib/stats/ml-kmeans/ml-dbscan + STL/MAD/EWMA/PELT     │
│  parse.worker         uDSV/PapaParse(worker) streaming + Arrow decode (flechette)                │
│  vector.worker        cosine/ANN over typed arrays (browser fallback to sqlite-vec)              │
│  chart.worker         echarts.init(OffscreenCanvas) render off main thread                       │
│  layout.worker        elkjs (lineage DAG), supercluster + h3 (geo), d3-cloud (wordcloud)         │
│  export.worker        pdfmake/docx/pptxgenjs/exceljs when running the non-Electron web build     │
│                                                                                                  │
│  ── Storage ──  OPFS SyncAccessHandle (big blobs: Parquet cache, model weights, PMTiles)         │
│                 Dexie/IndexedDB (small records: profiles, recipes, history, settings, achievements)│
│                 y-indexeddb (CRDT update log)   |  navigator.storage.persist()+estimate() at boot │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Why this split.** Native DuckDB is 5–50× faster than DuckDB-WASM, has no 4GB ceiling, no SharedArrayBuffer/COOP-COEP constraint, and real OS threads/SIMD. node-llama-cpp gives in-process GGUF inference with grammar-constrained JSON — the decisive structured-output edge browser engines lack. The renderer becomes a presentation layer; everything expensive is one `await proxy.method()` away on a worker or in main.

---

## 2. Data layer (DuckDB / Arrow / OPFS)

**Engine.** `@duckdb/node-api` (DuckDB Neo, installed `1.5.3-r.3`) is PRIMARY in Electron main. The CSV → managed-Parquet-cache → exposed-as-views design is correct (pay parse cost once; later queries are fast and seekable). `@duckdb/duckdb-wasm` is a TRIAL fallback only if a non-Electron web build ships (lazy-loaded in a worker, COI bundle needs COOP/COEP).

**Transport.** Replace the `getRowObjectsJS` + JSON-IPC contract with **Arrow IPC**. Native DuckDB emits Arrow; transfer the `ArrayBuffer`; decode in the renderer/worker with `apache-arrow` (or `@uwdata/flechette` ~14kB for read-only paths). This kills the per-row object allocation seen in data-browser, telecom, parsed-data, data-import, ai-analysis.

**SQL pushdown patterns (replace JS fan-out):**
- Profiling (parsed-data, data-import, ai-analysis): one `SUMMARIZE` scan + one `histogram()`/`approx_top_k` pass per *selected* column — not N×2-4 sequential queries. `approx_count_distinct` over exact `COUNT(DISTINCT)`; approx quantiles over `PERCENTILE_CONT … WITHIN GROUP`.
- Correlation matrix (ai-analysis, deep-analytics): single crosstab `CORR()` query, not O(cols²) positional JS zips (which misalign after NULL filtering).
- Reconciliation diff: `FULL OUTER JOIN + COALESCE + variance` streamed as Arrow batches — not nested `.find()` (quadratic).
- Telecom: **materialize** the enriched view to a table and wire the existing `*_daily` rollup into `fetchKPI/fetchHourly` (today they re-scan the full enriched VIEW). Persist the materialized + daily-agg tables to disk keyed by dataset fingerprint so cold start is instant.
- Pagination (data-browser): **keyset/seek**, not `OFFSET` (DuckDB Top-N materializes n+offset rows → OOM on deep pages). Cache `COUNT(*)` per (table+filter); run it in parallel, not per page/sort.

**Cancellation.** Every long query carries an abort token across IPC; switching datasets must actually cancel queued main-process scans (today a local flag is set but scans keep running — wasted CPU).

**Storage split.**
- OPFS `createSyncAccessHandle` (Worker-only, ~10× IndexedDB) → Parquet cache, model weights, PMTiles archives, Pyodide runtime.
- Dexie/IndexedDB → many small structured records (column profiles keyed by `datasetId+updatedAt`, transform recipes, import history, query/activity history, saved filters/queries, achievement state, report definitions).
- `navigator.storage.persist()` at startup + surface `estimate()` quota in Settings; a model-cache management panel (list/size/clear) in Settings.

**CSV ingest.** `uDSV` (~2× PapaParse, streaming, typed) for the paste/preview path in a worker; keep `papaparse` but switch to `worker:true` + `step/chunk`. Encoding: `chardet` (main process, first ~64KB) → feed DuckDB 1.2+ `read_csv(encoding=…)` — today the encoding dropdown is dead UI and Latin-1/UTF-16 telecom exports mojibake. Surface `read_csv(store_rejects=true)` rejected rows in a data-quality panel.

---

## 3. AI layer (local inference) — the unified runtime

This is the single most important refactor. Today there are **three competing, partly-broken AI paths**: web-llm (WebGPU-only), a CDN-dependent transformers.js, and rule-based stubs. Collapse to one provider registry with capability-based routing.

```
                          ┌────────────── ai/provider registry ──────────────┐
generateStructured(schema)│  route by: isElectron? → llamacpp                 │
generateText(stream)      │            WASM/CPU browser → transformers.js     │
embed(texts)              │            WebGPU available + opt-in → web-llm     │
                          │            power-user → ollama (localhost escape)  │
                          └───────────────────────────────────────────────────┘
        │                                   │                                  │
   LANE A (PRIMARY, Electron)        LANE B (browser/embeddings)          LANE C (HOLD)
   node-llama-cpp (utility proc)     transformers.js (Web Worker)         @mlc-ai/web-llm
   GGUF q4_K_M                       env.allowRemoteModels=false          WebGPU-only,
   GBNF/JSON-schema grammar          env.localModelPath=<bundled>         NO cpu fallback →
   = guaranteed-valid JSON           env.backends.onnx.wasm.wasmPaths     opportunistic only,
   for ChartSpec/SQL/plans/          =<self-hosted simd+threaded .wasm>   behind capability flag
   filters/anomaly/reconciliation    all-MiniLM-L6-v2 int8 (embeddings)
```

**Lane A — node-llama-cpp (ADD, MIT, v3.18.1).** The primary generative engine in the Electron utility process. GGUF q4 with auto GPU offload (Vulkan/Metal/CUDA) + CPU AVX. Its **GBNF / JSON-schema grammars enforced at token sampling** make every structured output (DashboardPlan, ChartSpec, SQL, filters, reconciliation hypotheses, threshold suggestions, briefing/anomaly JSON) structurally valid by construction — eliminating the fragile `parseJSON` "DEBUG BUILD" 4-candidate brute-force / regex-repair loops in agent-canvas, data-formulator, ai-briefing, channel-monitor. Drive grammars from the existing Zod schemas via `zod-to-json-schema`.

**Lane B — @huggingface/transformers (already installed, REPLACE its config).** Keep as PRIMARY browser embeddings engine + browser LLM fallback, but it MUST run in a Web Worker (Comlink) with `allowRemoteModels=false`, `localModelPath` pointing at bundled/OPFS-seeded weights, and `wasmPaths` pinned to self-hosted onnxruntime-web simd+threaded binaries. Default embeddings model `all-MiniLM-L6-v2` (384-dim, ~23MB int8, <30ms CPU). Device order must be `wasm`/`q8` first on the no-WebGPU target — not `webgpu`-first-with-failing-adapter-request as data-formulator does today.

**Lane C — @mlc-ai/web-llm (already installed, demote to HOLD/opportunistic).** Never primary. Only used when WebGPU is detected AND the user opts in. Every feature currently defaulting to it (ai-analysis `llm-engine.ts`, ai-briefing, channel-monitor, reconciliation) is rewired onto the provider registry.

**Model bundling.** A build-time prefetch script downloads `Xenova/all-MiniLM-L6-v2` + a small Qwen2.5-1.5B/3B-Instruct GGUF (q4_K_M; low-RAM fallback Qwen2.5-0.5B / SmolLM2-1.7B — avoid >3B on 8GB) into `public/models` (transformers) and a `models/` dir on disk (GGUF), with a "download now while online" preflight + integrity/size verification surfaced in Setup. No feature may assume a warm IndexedDB cache.

**Voice.** `sherpa-onnx-node` (installed) for native STT/TTS; `kokoro-js` (installed) for neural TTS narration. ai-briefing/analytics-theater read-aloud must use the bundled Kokoro/sherpa worker, not `window.speechSynthesis` (OS-dependent, absent in packaged Electron).

**Vector search (offline RAG).** `sqlite-vec` (installed) in better-sqlite3 (Electron main) as the persistent per-dataset KNN store — closes the data-formulator gap where the 2000-row index is rebuilt in-memory on every session by sequential main-thread MiniLM passes. `@lancedb/lancedb` (installed) is the TRIAL escalation when a corpus memory-maps beyond RAM. Browser fallback: cosine over typed arrays in `vector.worker`, optional `usearch` ANN behind a flag.

---

## 4. State & persistence

- **Zustand** (installed) is the store layer — but enforce selector slices + `useShallow`, `persist` `version`+`migrate`+`partialize`, and stop subscribing whole stores (the root cause of whole-tree re-render storms in dashboard-shell, channel-monitor, collab-hub, agent-canvas, ux-innovations). Ensure ≥5.0.10 for the persist rehydrate-merge fix.
- **Dexie** (installed) is the durable small-record store. Replace every `localStorage`-as-database use (collab annotations/audit, channel-monitor alert history, achievements unlock log, settings drift, report branding) — `localStorage` is synchronous, ~5MB-capped, and main-thread-blocking.
- **TanStack Query** (installed) wraps DuckDB fetches; add an IndexedDB/OPFS persister so the last KPI/analytics snapshot paints instantly on cold start, then revalidates (fixes dashboard-home re-running the full pipeline every launch).
- **Settings** must actually be applied: theme single-sourced (today theme-provider localStorage vs settings-store drift), accent/density/animations injected as CSS vars/data-attrs, performance settings (duckdbWorkers/maxMemoryMB/virtualizeThreshold) wired to the actual DuckDB pool and TanStack Virtual (today write-only theater). Validate numeric inputs with Zod coercion/clamping.

---

## 5. Visualization & large-grid render strategy

**Renderer order: Canvas 2D + WASM-SIMD first, WebGL2 second, WebGPU opportunistic.** ~45% of older/iGPU devices fall to compat mode.

- **uPlot (ADD, MIT, ~10k★, v1.6.32).** Dense time-series/line/area/OHLC across the app (telecom trends, forecast actual+CI, ai-analysis forecast, channel-monitor sparklines, dashboard-home hourly/daily, data-browser column previews). 166k pts ~25ms at ~10% CPU vs ECharts ~70%. The single biggest medium-PC chart win.
- **ECharts 6 (installed) via OffscreenCanvas + chart.worker.** Keep as the general canvas workhorse (pie/heatmap/sankey/sunburst/scatter/geo) but tree-shake to `echarts/core` + explicit registration (today the full ~1MB build ships, often eagerly imported into routes that never chart) and render off the main thread via `echarts.init(offscreenCanvas)` + `transferControlToOffscreen`. Export via `getDataURL()`/`renderToSVGString()` — never DOM-screenshot a chart.
- **Vega/Vega-Lite (installed).** Canonical grammar the data-formulator LLM emits and for ad-hoc/accessible charts ≤~1-10k marks (force Canvas >1k). Keep.
- **Grid by row count.** TanStack Table + Virtual (both installed) headless DOM grid to ~50-100k window rows (extend to column virtualization for wide tables); `glide-data-grid` (TRIAL) canvas grid beyond that / for streaming. Apply virtualization everywhere it is missing: data-browser cards, data-transform/parsed preview, telecom raw grid, history timeline, collab audit (500 rows), reconciliation diff, every `.map()` over unbounded arrays.
- **Marks by count.** SVG/Vega-Lite ≤~1-10k → Canvas (ECharts/uPlot) >~1k → WebGL/deck.gl >~100k-1M+ / geospatial.
- **react-confetti-boom → canvas-confetti** (ADD): `useWorker:true` OffscreenCanvas path keeps celebration FX off the main thread.

---

## 6. Geospatial — fully offline, token-free, WebGL2

The geo-analysis feature currently fetches `tile.openstreetmap.org` (hard offline violation) and uses 100% synthetic data. Replace the Leaflet+OSM-raster stack:

`maplibre-gl` (ADD, BSD-3, ~10.8k★, WebGL2) renderer + `pmtiles` (ADD) single-file tile archive via `addProtocol` (range reads, no server) + `@protomaps/basemaps` (ADD) downloadable token-free basemap + **self-hosted glyphs (.pbf) and sprites** (MapLibre fetches these at runtime — must be local) + `deck.gl` (ADD, MIT, ~14k★) `MapboxOverlay({interleaved:true})` for 100k-1M+ points + `@geoarrow/deck.gl-layers` (ADD) zero-copy Arrow→GPU from DuckDB + `supercluster` (ADD, in worker) zoom-reactive clustering + `h3-js` (ADD) analytical hexbins + `tippecanoe` (ADD, build-time, Electron main) to tile user data locally. DuckDB spatial extension (bundled for offline INSTALL) does ST_* joins in SQL. iGPU budget: ~100k-500k smooth, aggregate beyond; for 1M+ never pass plain JS arrays — use GeoArrow buffers.

---

## 7. Statistics, forecasting & ML

**Tiered, dependency-light, worker-isolated:**
- Tier 1 (hot path): in-house Holt-Winters/EWMA/STL/MAD/S-H-ESD/CUSUM/PELT (~small, deterministic) atop `simple-statistics` (installed) + `@stdlib/stats` (ADD, modular per-fn imports) for rigorous distributions, p-values, GESD criticals. Replace the FAKE bucketed p-values (deep-analytics `tTest`, ai-briefing severity) and the naive global-OLS forecasts with real tests + Holt-Winters/ETS.
- Clustering: `ml-kmeans` + `ml-dbscan` (ADD, mljs, MIT) replacing the hand-rolled main-thread k-means and `density-clustering` (installed, dormant → HOLD). Run in `analysis.worker`; seed the RNG for reproducibility (today re-randomizes every click). `ml-matrix` (installed, currently unused in features) backs real regression-based attribution.
- Tier 2 (advanced, opt-in): `@grafana/augurs` (TRIAL, Rust/WASM AutoETS/MSTL/Prophet/changepoint) as the modern replacement for the stale `arima`; or self-hosted **Pyodide + statsmodels** (load via `py.loadPackage`, NOT micropip; runtime + wheels bundled into OPFS) — the forecast-intelligence feature currently loads Pyodide from a **hardcoded jsdelivr CDN** and micropips statsmodels from PyPI, both dead offline. Tabular ML inference: `onnxruntime-node` (ADD) in main for XGBoost/LightGBM/sklearn→ONNX-ML (no 20MB wasm).

---

## 8. Local-first collaboration (no cloud)

Yjs is already the substrate but most collab features bypass it (collab-hub/collaboration use BroadcastChannel only = same-machine same-browser; "session codes" are cosmetic). The repo already ships `src/platform/lan/lan-collab.ts` + `scripts/lan-server.mjs` (a y-protocols relay) — but `y-protocols`, `ws`, `lib0` are **missing from package.json**, so `npm run lan-server` crashes today.

**Target:** `yjs` (installed) as the CRDT for annotations/approvals/audit/comments/chat (stop using localStorage silos); `y-indexeddb` (ADD) durable per-room persistence with `whenStored`; `y-protocols` Awareness (ADD explicit) for presence (auto-prunes — removes hand-rolled heartbeat/prune intervals); `y-websocket` (installed) client against an **`@hocuspocus/server` (ADD) embedded in Electron main** as the reliable LAN hub (more reliable than WebRTC on locked-down LANs) with SQLite/file persistence; `bonjour-service` (ADD) mDNS auto-discovery (replaces 254-host subnet fetch scan). Add the missing `ws`/`lib0` so the relay runs. `loro-crdt` is WATCH only (history/branching). Reject ElectricSQL/PowerSync/Zero/Convex (server+Postgres sync engines, violate offline-only). `@tanstack/db` (installed) stays HOLD (beta, sync-oriented — not the offline source of truth).

---

## 9. Document export & reporting

All heavy export runs in Electron main / a worker — never the renderer main thread (jspdf-autotable OOMs past a few k rows). Stream/paginate, write incrementally via `fs` through the existing `fs:saveDialog`/`fs:writeFile` IPC bridge (today exports dump to Downloads with no dialog and build bytes in the renderer).

- PDF: `pdfmake` (ADD) for data-driven tables (auto-paginates); `@cantoo/pdf-lib` (TRIAL, pinned) for merge/stamp/fill; keep `jspdf` (installed) for light only. `jspdf-autotable` (installed) → HOLD.
- XLSX: `exceljs` (installed) streaming `WorkbookWriter` (~6× less memory than SheetJS) — actually use it in report-studio/data-browser/reconciliation/history exports.
- DOCX/PPTX: `docx`, `pptxgenjs` (installed) — keep, move into export.worker, embed real chart PNGs (ECharts `renderToSVGString` → `@resvg/resvg-wasm` TRIAL, offline rasterization) instead of `[Chart: …]` text placeholders / hand-drawn jsPDF lines.
- DOM→image: `html-to-image` (ADD) replacing `html2canvas` (installed → HOLD, stale/experimental). Bundle fonts (don't rely on system Calibri/Helvetica). Logo via local file picker stored as base64 in IndexedDB, never a runtime URL fetch.

---

## 10. Lineage, graphs & SQL

- `@xyflow/react` (installed, used by agent-canvas) replaces the hand-rolled SVG canvas + manual pan/zoom in lineage (viewport culling, minimap). `dagre` (installed → HOLD, deprecated) → `elkjs` (ADD, worker-side layered DAG layout).
- `node-sql-parser` (ADD) for real offline SQL→AST: turns data-transform's execute-then-fail into local validation + safe identifier quoting; turns lineage's fake name-equality column matching into real table/column lineage. In Electron, prefer DuckDB `json_serialize_sql`/EXPLAIN for dialect-accurate binding.
- Monaco (installed) SQL editor: add schema-aware offline completion (`monaco-sql-languages` TRIAL, pinned to one monaco version) driven by the dataset catalog.

---

## 11. Onboarding / help / tours

`react-joyride` (installed → REPLACE) + `OnboardingTour` is wrong-API/dead-code pulling ~10 transitive deps. → `driver.js` (ADD, MIT, ~25.7k★, ~5kB, zero-dep) for spotlight/coach-marks. `fuse.js` (installed, unused in help/folders) for ranked search instead of naive `.includes`. `cmdk` (installed, unused by the dashboard palette) for the command palette. Persist onboarding state to Dexie, not scattered localStorage. Remove the external GitHub feedback URL (offline-dead).

---

## 12. Security & packaging

`@electron/fuses` (installed, devDep) enforced in prod (disable RunAsNode/CLI/inspector). `sandbox:true` + `contextIsolation:true` + `nodeIntegration:false`; one `contextBridge` method per channel; strict CSP; IPC rate-limiting + trusted-sender validation + PathAccessController allowlist (present). Set COOP:same-origin + COEP:require-corp unconditionally on Electron's custom protocol (unlocks SharedArrayBuffer → WASM threads + DuckDB-WASM COI bundle for any browser path). better-auth: set `trustedOrigins` for the custom protocol, generate+persist `BETTER_AUTH_SECRET` in userData (today a shipped constant), surface an Account settings tab. `serverExternalPackages` for native modules; `@electron-forge/plugin-auto-unpack-natives` (installed) for the native addons (duckdb, llama-cpp, sherpa, better-sqlite3).

---

## 13. Dev tooling & quality (offline, dev-only)

Enable, don't add: `knip` strict/CI gating (lots of dead code flagged: history diff/widgets, ux-innovations, lineage hand-rolled, deactivated `ml.worker`), `dependency-cruiser` layer rules (renderer must depend on a data-access layer, not 4 stores directly; UI→core→worker no forbidden edges), `size-limit` `@size-limit/preset-app` + time plugin with **per-route AND per-worker budgets** (heavy workers: inference, chart, parse, vector). Add small dev-only: `sonda` (richer treemap), `react-scan` (the re-render storms), `@lhci/cli` (INP/CLS vs localhost offline), `binaryen` wasm-opt (shrink/SIMD self-hosted .wasm), `web-vitals` (offline RUM → IndexedDB). `axe-core`/`vitest-axe`/`@axe-core/playwright` (installed) gate a11y on new cmdk palette, tree, tour, settings controls. `tinybench` via Vitest bench locks hot-path budgets (SQL-pushdown vs JS, Arrow vs JSON, keyset vs OFFSET, worker vs main).

---

## 14. Reference code patterns

**Pinned-offline transformers.js worker (Lane B):**
```ts
// inference.worker.ts
import { env, pipeline } from '@huggingface/transformers';
env.allowRemoteModels = false;
env.localModelPath = '/models/';                       // bundled
env.backends.onnx.wasm.wasmPaths = '/ort/';            // self-hosted simd+threaded
const embed = await pipeline('feature-extraction',
  'Xenova/all-MiniLM-L6-v2', { dtype: 'q8', device: 'wasm' }); // CPU-first
```

**node-llama-cpp grammar-constrained JSON (Lane A, main):**
```ts
const grammar = await llama.createGrammarForJsonSchema(zodToJsonSchema(ChartSpecSchema));
const res = await session.prompt(userPrompt, { grammar }); // structurally valid by construction
```

**Arrow IPC across the boundary (data layer):**
```ts
// main: const buf = await conn.arrowIPCStream(sql); return Comlink.transfer(buf, [buf.buffer]);
// worker: const table = tableFromIPC(buf); // flechette/apache-arrow, zero-copy columns
```

**OffscreenCanvas chart (viz):**
```ts
const off = canvas.transferControlToOffscreen();
await chartWorker.render(Comlink.transfer(off, [off]), option); // echarts.init(off) in worker
```