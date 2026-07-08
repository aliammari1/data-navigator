# Tech Radar Brief — High-performance offline data visualization & large-grid rendering for data-navigator (Next.js 16 + Electron, fully on-device)

## Key findings

- WebGPU is NOT a safe baseline on medium-end offline PCs: ~70-82% global coverage in 2026 but ~45% of older/integrated-GPU devices fall back to compat mode with reduced features. Design for Canvas 2D + WASM-SIMD first, WebGL2 second, and treat WebGPU as an opportunistic upgrade with automatic fallback only.
- uPlot is the strongest pick for high-density time-series/line/area/OHLC: ~10.2k stars, MIT, actively maintained (v1.6.32, Mar 2025), ~48KB min, Canvas 2D (no WebGL/WASM startup cost). Renders 166k points in ~25ms and streams 3,600 pts at 60fps using ~10% CPU / 12MB RAM vs ECharts 70% / 85MB. Ideal for medium-end hardware.
- The project ALREADY ships ECharts 6 (echarts-for-react), Recharts 3, Vega 6 / Vega-Lite 6 (react-vega), TanStack Table v8 + TanStack Virtual v3, react-force-graph-2d, DuckDB (node-api) and Arquero. The right move is to RATIONALIZE this stack by role, not add more: keep ECharts as the general-purpose canvas workhorse, add uPlot for dense time-series, and pick ONE grid strategy.
- Grid choice splits by row count: TanStack Table + TanStack Virtual (DOM) is great and already installed for up to ~50-100k rows with full React cell control; for 100k-millions of rows or heavy streaming, a canvas grid (glide-data-grid, MIT, ~5.2k stars) or Perspective (Apache-2.0, ~11k stars, C++/WASM + Arrow) wins. glide-data-grid's last release was Feb 2024 (plateaued) so verify maintenance before depending on new features.
- FINOS Perspective (~11k stars, Apache-2.0, v4.5.1 May 2026) is a standout offline-first analytics engine: C++/Rust compiled to WASM, native Apache Arrow read/write/streaming, pivots + canvas datagrid + charts, fully in-browser with NO server. It overlaps DuckDB-WASM but adds a ready-made interactive pivot grid; strong fit for the columnar/Arrow pipeline you already have via DuckDB + Arquero.
- Canvas vs SVG vs WebGL has clear thresholds: SVG/Vega-Lite is fine and accessible up to ~1-10k marks then degrades; Canvas (ECharts/uPlot) is the default above ~1k points; WebGL/regl/deck.gl is only needed above ~100k-1M+ points or for geospatial. deck.gl (~14.2k stars, MIT, v9.3.3 Jun 2026) gives WebGL2 with automatic fallback and is the right tool ONLY for map/large-scatter layers, not general charts.
- OffscreenCanvas + Web Worker rendering is the single biggest 60fps lever on medium-end CPUs and is well supported by ECharts and Chart.js (pass OffscreenCanvas to constructor; proxy pointer events via postMessage). Combine with comlink (already a dependency) to keep the main thread free during heavy redraws/streaming.
- regl (~5.5k stars, MIT) is viable but lower-velocity (maintenance is intermittent); prefer it only for bespoke WebGL where deck.gl/ECharts-GL don't fit. For most needs, ECharts' built-in large-mode/progressive rendering + WebGL series avoids hand-rolling shaders.

## Dependencies evaluated

| Package | Stars | Maintenance | License | Offline | Role / replaces | URL |
|---|---|---|---|---|---|---|
| `uPlot` | 10.2k | Active - v1.6.32 (Mar 2025), single primary maintainer (leeoniya) but steady releases | MIT | yes | Dense time-series / line / area / OHLC / bar charts. Best-in-class CPU/RAM for streaming on medium-end PCs. Add alongside existing ECharts. | https://github.com/leeoniya/uPlot |
| `Apache ECharts (already installed v6)` | 63k+ | Very active - Apache top-level project, ECharts 6.0 released 2025, multi-maintainer | Apache-2.0 | yes | General-purpose canvas charting workhorse: heatmaps, large scatter, geo, progressive/large-mode rendering, WebGL series via echarts-gl. Keep as primary. | https://github.com/apache/echarts |
| `FINOS Perspective` | 11k | Very active - v4.5.1 (May 2026), OpenJS/FINOS backed, 6600+ commits | Apache-2.0 | yes | Offline in-browser pivot/analytics engine + canvas datagrid + charts, native Apache Arrow streaming. Complements DuckDB-WASM for interactive pivots over millions of rows. | https://github.com/finos/perspective |
| `glide-data-grid` | 5.2k | Plateaued - latest tagged release v6.0.3 (Feb 2024); still used in production by Glide, verify recent commits before adopting | MIT | yes | Canvas data grid scaling to millions of rows with lazy cell rendering and native scroll. Use when TanStack Table DOM virtualization hits limits. | https://github.com/glideapps/glide-data-grid |
| `TanStack Virtual (already installed v3)` | 5.5k+ | Very active - part of TanStack, frequent releases | MIT | yes | Headless row/column virtualization. Pair with TanStack Table for up to ~50-100k rows with full React cell control. Keep as default grid path. | https://github.com/TanStack/virtual |
| `TanStack Table (already installed v8)` | 26k+ | Very active - core TanStack project | MIT | yes | Headless table model (sorting/filtering/grouping). Default grid engine; combine with TanStack Virtual. Use canvas grid only beyond its comfort zone. | https://github.com/tanstack/table |
| `deck.gl` | 14.2k | Very active - v9.3.3 (Jun 2026), vis.gl/OpenJS, luma.gl v9 (WebGL2 + optional WebGPU) | MIT | yes | GPU-accelerated geospatial + very-large scatter/point/arc/hexbin layers. WebGL2 baseline with automatic fallback. Use ONLY for map/100k-1M+ point layers, not general charts. | https://github.com/visgl/deck.gl |
| `regl` | 5.5k | Intermittent - 'under active development' per README but low release cadence; 111 open issues | MIT | yes | Low-level WebGL for bespoke high-throughput custom visuals. Prefer ECharts-GL/deck.gl first; reach for regl only when nothing higher-level fits. | https://github.com/regl-project/regl |
| `Vega / Vega-Lite (already installed v6)` | 11k+ (vega) / 4.9k+ (vega-lite) | Active - UW IDL, v6 lines current | BSD-3-Clause | yes | Declarative grammar-of-graphics for flexible/ad-hoc and accessible (SVG) charts up to ~1-10k marks. Force Canvas renderer above 1k points. Keep for spec-driven/LLM-generated charts. | https://github.com/vega/vega |
| `apache-arrow (JS)` | 15k+ (monorepo) | Very active - v21.x (2025-2026), Apache foundation | Apache-2.0 | yes | Zero-copy columnar interchange between DuckDB-WASM, Perspective, workers and charts. The backbone for fast offline pipelines; pairs with existing DuckDB + Arquero. | https://github.com/apache/arrow-js |

## Brief

# Offline-First Tech Radar: High-Performance Data Visualization & Large-Grid Rendering

**Target:** `data-navigator` — Next.js 16 + Electron desktop app, 100% on-device processing.
**Constraints applied to every pick:** offline-only (no cloud/SaaS/telemetry), medium-end PC (4-8 cores, 8-16GB RAM, integrated/modest GPU, WebGPU often unavailable), mature or strongly-trending MIT/Apache/BSD deps with active maintenance.

---

## 0. TL;DR Recommendation Set

| Need | Recommended | Why (offline + medium-end) |
|---|---|---|
| Dense time-series / line / area / OHLC | **uPlot** (add) | Canvas 2D, ~48KB, 166k pts in 25ms, streams at 60fps using ~10% CPU / 12MB RAM. Lowest footprint of any option. |
| General charts (heatmap, scatter, geo, bar, pie) | **ECharts 6** (already installed) | Canvas workhorse, progressive/large-mode, OffscreenCanvas-capable, tree-shakable. |
| Declarative / LLM-generated / ad-hoc charts | **Vega-Lite 6** (already installed) | Grammar-of-graphics; force Canvas renderer >1k marks; SVG only for small accessible charts. |
| Grid up to ~50-100k rows, React cells | **TanStack Table v8 + Virtual v3** (already installed) | Headless DOM virtualization, full React control, tiny bundle. Default. |
| Grid 100k-millions / streaming | **glide-data-grid** OR **Perspective** | Canvas rendering, lazy cells, native scroll. Perspective adds pivots + Arrow streaming. |
| In-browser pivots / analytics over millions of rows | **FINOS Perspective** (add) | C++/Rust→WASM, native Arrow, fully offline, ready-made datagrid+charts. |
| Geospatial / 100k-1M+ point layers | **deck.gl** (add, scoped) | WebGL2 baseline + automatic fallback. ONLY for maps/huge scatter. |
| Custom bespoke WebGL | **regl** (last resort) | Use ECharts-GL/deck.gl first; regl only when nothing higher-level fits. |
| Columnar backbone | **apache-arrow** + existing **DuckDB** + **Arquero** | Zero-copy interchange across workers/grid/charts. |
| 60fps lever | **OffscreenCanvas + Web Worker** (via existing **comlink**) | Biggest main-thread relief on medium CPUs. |

**Headline guidance:** You already have a *very* rich stack (ECharts 6, Recharts 3, Vega/Vega-Lite 6, react-vega, TanStack Table+Virtual, react-force-graph-2d, DuckDB, Arquero, onnxruntime-web). The highest-value action is **rationalization by role + adding uPlot and (optionally) Perspective**, not piling on more libraries. Recharts and ECharts overlap heavily — see §6.

---

## 1. The WebGPU Reality Check (drives every GPU decision)

Research confirms WebGPU is **not** a safe baseline for this app's target hardware in 2026:

- Global coverage ~70-82% (sources vary), but **~30% of users still rely on WebGL fallback**, and **~45% of older/integrated-GPU devices** drop into "compatibility mode" with reduced features (e.g. no storage buffers in vertex shaders).
- Electron's Chromium gives you a *consistent* engine, but you ship to whatever GPU the user has. Integrated GPUs share system RAM and are exactly the "modest GPU" case in scope.

**Design rule:** Canvas 2D + WASM-SIMD (CPU) **first**, WebGL2 **second**, WebGPU as an *opportunistic upgrade with automatic fallback only*. Never make a feature *require* WebGPU. deck.gl/luma.gl v9 and Three.js r171+ both do automatic WebGL2 fallback — lean on libraries that already handle this rather than hand-rolling.

Sources: web.dev WebGPU baseline; caniuse WebGPU; gpuweb Implementation-Status; VR.org WebGPU baseline 2026.

---

## 2. Charting Libraries — Honest Comparison

### 2.1 Rendering-tech thresholds (the decision spine)

| Marks/points | Best renderer | Library |
|---|---|---|
| < 1k, needs a11y/interactivity | SVG | Vega-Lite (SVG), ECharts (SVG) |
| 1k - ~50k | Canvas 2D | **uPlot** (time-series), **ECharts** (general) |
| ~50k - ~100k+ streaming | Canvas 2D + OffscreenCanvas worker | uPlot / ECharts in worker |
| 100k - 1M+ / geo | WebGL2 | ECharts-GL, **deck.gl**, regl |

- SVG (DOM) "works beautifully up to a few thousand elements, then degrades quickly." ECharts recommends Canvas above ~1k points. Vega's comfortable interactive ceiling is ~10k datapoints.
- Canvas is "2-10x faster than SVG for full-component redraws" but is a black box to screen readers — keep SVG for small, accessible charts.

### 2.2 uPlot — the medium-end MVP (ADD)

- **~10.2k stars, MIT, v1.6.32 (Mar 2025), ~48KB min, Canvas 2D, zero deps.**
- Benchmarks (from maintainer + independent notes): cold-start interactive chart of **166,650 points in ~25ms**, then ~100k pts/ms. Streaming **3,600 points at 60fps → ~10% CPU / 12.3MB RAM**, vs Chart.js 40% / 77MB and ECharts 70% / 85MB.
- Why it wins here: no WebGL/WASM startup cost or code size, tiny memory, perfect for the "modest hardware + many small charts" dashboard case (your telecom-report pages).
- Caveats: single primary maintainer (steady cadence, low bus-factor risk but watch it); time-series-shaped API; no built-in pie/treemap/geo (that's ECharts' job). React usage via a thin wrapper (`uplot-react`) or a ~30-line `useEffect` mount — don't pull a heavy wrapper.

```ts
// Minimal uPlot mount in React (no wrapper dep)
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { useEffect, useRef } from "react";

export function TimeSeries({ data, opts }: { data: uPlot.AlignedData; opts: uPlot.Options }) {
  const el = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);
  useEffect(() => {
    if (!el.current) return;
    plot.current = new uPlot(opts, data, el.current);
    return () => plot.current?.destroy();
  }, []); // opts stable
  useEffect(() => { plot.current?.setData(data); }, [data]); // cheap streaming update
  return <div ref={el} />;
}
```

### 2.3 ECharts 6 — keep as general-purpose workhorse (INSTALLED)

- **63k+ stars, Apache-2.0, ECharts 6.0 (2025), multi-maintainer (Apache TLP).** Canvas + (v5.3+ vDOM) SVG renderers.
- Strengths: huge chart-type coverage, **progressive + `large: true` modes** for big scatter/lines, `echarts-gl` for WebGL series, **OffscreenCanvas worker rendering** supported, incremental rendering.
- Use for everything uPlot doesn't cover. Tree-shake via `echarts/core` + explicit chart/component imports to cut the ~1MB full bundle to ~150-400KB.

### 2.4 Vega / Vega-Lite 6 — declarative & LLM-friendly (INSTALLED)

- **Vega ~11k / Vega-Lite ~4.9k stars, BSD-3-Clause, v6 current, UW IDL.**
- Best for spec-driven and LLM-generated charts (you have `@langchain/*` + web-llm — Vega-Lite specs are an excellent LLM target). Force `renderer: "canvas"` above ~1k marks; reserve SVG for small accessible exports.
- Cost: large bundle (vega core ~400KB+ plus compiler). Keep it, but don't make it the default for high-density dashboards — that's uPlot/ECharts.

### 2.5 deck.gl — scoped to geo + huge scatter (ADD, narrow)

- **~14.2k stars, MIT, v9.3.3 (Jun 2026), luma.gl v9 = WebGL2 baseline + optional WebGPU with automatic fallback.**
- Right tool for Leaflet-adjacent map overlays (you ship `leaflet`/`react-leaflet`) and 100k-1M+ point/hexbin/arc layers. Wrong tool for bar/line dashboards (overkill + bundle).

### 2.6 regl — last-resort custom WebGL

- **~5.5k stars, MIT, intermittent maintenance (low release cadence, 111 open issues).** Functional WebGL wrapper, ~30KB. Only if ECharts-GL/deck.gl can't express a bespoke visual. Flag the maintenance signal in any ADR.

### 2.7 Plotly — *not recommended to add*

Plotly.js is capable but heavy (~3MB+), and its strengths (declarative + many chart types) are already covered by ECharts + Vega-Lite. No offline blocker, but bundle/redundancy argues against it for this stack.

---

## 3. Table / Grid Virtualization — Honest Comparison

### 3.1 The split by scale

| Scenario | Pick | Notes |
|---|---|---|
| ≤ ~50-100k rows, rich React cells, full styling control | **TanStack Table + TanStack Virtual** (DOM) | Already installed. Headless, ~25-30KB total in practice, BYO UI. The default. |
| 100k - millions of rows, simple/streaming cells | **glide-data-grid** (canvas) | MIT, ~5.2k stars, lazy canvas cells, native scroll, millions of rows. |
| Millions of rows + pivots + Arrow streaming | **FINOS Perspective** (canvas + WASM) | Apache-2.0, ~11k stars, v4.5.1 (May 2026). |
| Enterprise feature breadth | AG Grid Community | MIT community tier is solid but heavy (200KB+ with enterprise feel); license-gates advanced features. Avoid unless you need its specific features. |

- TanStack Table + Virtual "runs smoothly on datasets with 50,000+ rows" with sticky headers, pinning, resizing — and you already pay for it. Past six-figure rows with client-side processing, DOM virtualization starts to strain.
- **glide-data-grid**: canvas-rendered, "scales to millions of rows, cells rendered lazily on demand," MIT, React 16-19. **Maintenance flag:** latest tagged release **v6.0.3 (Feb 2024)** — production-used by Glide but cadence has plateaued; verify recent commit activity before depending on *new* features. Safe for stable use.

### 3.2 Why DOM virtualization is usually enough for you

Your data path is **DuckDB (already installed)**. With DuckDB doing SQL-side filtering/sorting/aggregation and returning *paged* Arrow result sets, the grid rarely needs to hold millions of rows in the DOM at once — you virtualize a window over a query, not over the whole table. This makes **TanStack Table + Virtual the right default** and pushes the canvas grid / Perspective into the genuinely-huge-or-pivot cases.

```ts
// Pattern: virtualize a window, let DuckDB page the data
// 1. SELECT ... LIMIT :pageSize OFFSET :pageStart  -> Arrow table
// 2. TanStack Virtual computes visible range -> request that window from DuckDB
// 3. Map Arrow columns -> rows lazily (zero-copy column access)
```

---

## 4. FINOS Perspective — the offline analytics standout (ADD, evaluate)

- **~11k stars, Apache-2.0, v4.5.1 (May 2026), OpenJS/FINOS, 6600+ commits — very active.**
- Data model is **C++/Rust compiled to WebAssembly**, with **native Apache Arrow read/write/streaming** and a columnar expression language. Ships a **framework-agnostic Custom Element** UI: interactive **pivot datagrid + charts**, all in-browser, **no server required** — i.e. fully offline-compliant.
- Where it fits `data-navigator`: it overlaps DuckDB-WASM (both are WASM columnar engines) but adds a **ready-made interactive pivot grid + chart UI** you'd otherwise build by hand on top of DuckDB + TanStack. Strong fit since you already standardize on Arrow/columnar (DuckDB + Arquero).
- Cost: large WASM payload (lazy-load it; don't put it on the critical path). Custom Element (not React-native) — wrap in a thin React component.
- **Decision:** prototype Perspective for the "pivot/explore millions of rows" surface. If DuckDB + TanStack already covers your pivot UX, you may not need it — avoid two WASM analytics engines unless the pivot UI value is real.

---

## 5. 60fps on Medium-End Hardware — the playbook

1. **OffscreenCanvas + Web Worker rendering.** Biggest lever. ECharts and Chart.js accept an `OffscreenCanvas` in the constructor; render in a worker, proxy pointer events from the main thread via `postMessage`. uPlot can also run in a worker with manual event proxying. You already depend on **comlink** — use it to wrap the worker chart API ergonomically.
2. **Columnar end-to-end (Arrow).** Querying DuckDB-WASM over Arrow is "10-100x faster than processing plain JS objects." Keep data in Arrow columns from DuckDB → worker → chart/grid; avoid materializing arrays of JS row objects.
3. **Virtualize everything.** Grids: TanStack Virtual. Charts: ECharts progressive/`large` mode; uPlot's built-in downsampling-friendly API. Don't draw points you can't see.
4. **Push compute off the main thread.** DuckDB, Arquero transforms, Arrow decoding, and chart rasterization all belong in workers. Keep the React main thread for layout + events only.
5. **Downsample before draw.** For >100k-point series, LTTB/min-max bucketing per pixel column keeps Canvas 2D at 60fps without WebGL. Do it in the worker.
6. **OPFS / IndexedDB caching.** Cache parsed Arrow/Parquet and any one-time-downloaded models (you already use onnxruntime-web, kokoro, sherpa) in OPFS/IndexedDB so cold loads stay offline and fast.
7. **WebGL only when CPU can't keep up.** Reserve deck.gl/ECharts-GL for genuine >100k-1M point/geo cases, with WebGL2 fallback verified.

```ts
// OffscreenCanvas worker chart (ECharts) sketch
// main.ts
const canvas = ref.current!.transferControlToOffscreen();
const worker = new Worker(new URL("./chart.worker.ts", import.meta.url), { type: "module" });
worker.postMessage({ type: "init", canvas, dpr: devicePixelRatio }, [canvas]);
ref.current!.addEventListener("pointermove", (e) =>
  worker.postMessage({ type: "pointer", x: e.offsetX, y: e.offsetY }));

// chart.worker.ts
import * as echarts from "echarts";
let chart: echarts.ECharts;
onmessage = (ev) => {
  const m = ev.data;
  if (m.type === "init") { chart = echarts.init(m.canvas, null, { devicePixelRatio: m.dpr }); }
  if (m.type === "setOption") chart.setOption(m.option);
  if (m.type === "pointer") chart.dispatchAction({ type: "showTip", x: m.x, y: m.y });
};
```

---

## 6. Stack rationalization — what to do with what you have

You currently ship **three+ overlapping chart engines** (ECharts 6, Recharts 3, Vega/Vega-Lite 6) plus react-force-graph-2d. Recommendation:

- **ECharts 6** — keep as the canvas general-purpose engine (heatmaps, scatter, geo, big data modes, OffscreenCanvas).
- **uPlot** — ADD for dense time-series; migrate the heaviest streaming/line dashboards (telecom-report period/overview) off ECharts/Recharts to uPlot for the CPU/RAM win.
- **Vega-Lite 6** — keep for declarative/LLM-generated/spec-driven charts (pairs with your LangChain/web-llm). Force canvas renderer >1k marks.
- **Recharts 3** — **candidate for deprecation.** It's SVG/React-DOM-based (composable, pretty, but DOM-bound and slow at scale). Anything performance-sensitive should be ECharts or uPlot; anything declarative should be Vega-Lite. Recharts' niche (small, simple, JSX-composed charts) is real but redundant — keep only if it's load-bearing in the design system, otherwise retire to cut bundle + maintenance surface.
- **react-force-graph-2d** — fine for graph views (Canvas 2D); keep scoped to network/graph pages.

Net: **add uPlot, evaluate Perspective, deprecate Recharts, scope deck.gl/regl narrowly.** This *reduces* total dependency weight while raising the performance ceiling.

---

## 7. Migration notes & sequencing

1. **Add uPlot**, build the `<TimeSeries>` wrapper (§2.2), migrate one high-density dashboard, measure CPU/RAM vs current Recharts/ECharts. Expect large wins on streaming pages.
2. **Stand up an OffscreenCanvas chart worker** (comlink-wrapped) for the heaviest ECharts dashboards; proxy events. Verify Electron renderer supports `transferControlToOffscreen` (it does in Chromium).
3. **Standardize the grid contract** on TanStack Table + Virtual reading **paged Arrow** windows from DuckDB. Keep glide-data-grid / Perspective behind a feature flag for the genuinely-huge / pivot surfaces only.
4. **Prototype Perspective** for pivot/explore; decide build-vs-adopt vs DuckDB + TanStack. Don't ship two WASM analytics engines without justification.
5. **Scope deck.gl** to the Leaflet/geo + huge-scatter layers with explicit WebGL2-fallback testing on an integrated-GPU machine.
6. **Deprecate Recharts** once its charts are re-homed; remove from `package.json` to shrink bundle.
7. **Bench on a real medium-end machine** (4-core, integrated GPU, WebGPU forced off) as the CI/perf gate — not on a dev laptop with a discrete GPU.

---

## 8. Risk register

| Risk | Mitigation |
|---|---|
| WebGPU assumed available | Canvas/WASM-first; verify WebGL2 fallback on integrated GPU; never require WebGPU. |
| uPlot single-maintainer bus factor | Thin wrapper, no deep coupling; MIT lets you vendor/fork if needed. |
| glide-data-grid plateaued (Feb 2024 release) | Use for stable features only; prefer Perspective/TanStack for actively-evolving needs; recheck commit activity before adopting. |
| Two WASM analytics engines (DuckDB + Perspective) | Choose one for pivots; lazy-load WASM off critical path. |
| Chart-engine sprawl (ECharts/Recharts/Vega) | Rationalize by role; deprecate Recharts. |
| Large WASM/WebGL bundles hurt cold start | Lazy-load, code-split, cache parsed assets in OPFS/IndexedDB. |
| Canvas/WebGL inaccessible to screen readers | Keep SVG (Vega-Lite/ECharts-SVG) path for small accessible charts + data-table fallbacks. |

---

## 9. Sources

- uPlot — https://github.com/leeoniya/uPlot ; perf notes: https://cprimozic.net/notes/posts/my-thoughts-on-the-uplot-charting-library/
- ECharts — https://github.com/apache/echarts ; canvas vs svg: https://apache.github.io/echarts-handbook/en/best-practices/canvas-vs-svg/ ; v6: https://echarts.apache.org/handbook/en/basics/release-note/v6-feature/
- Vega/Vega-Lite — https://github.com/vega/vega ; perf: https://grechin.org/2022/07/19/vega-visualization-performance-benchmark.html
- deck.gl — https://github.com/visgl/deck.gl ; WebGL fallback: https://github.com/visgl/deck.gl/discussions/9171
- regl — https://github.com/regl-project/regl
- glide-data-grid — https://github.com/glideapps/glide-data-grid
- FINOS Perspective — https://github.com/finos/perspective
- TanStack Table — https://github.com/tanstack/table ; Virtual — https://github.com/TanStack/virtual ; comparison: https://www.simple-table.com/blog/tanstack-table-vs-ag-grid-comparison
- WebGPU support — https://web.dev/blog/webgpu-supported-major-browsers ; https://caniuse.com/webgpu ; https://github.com/gpuweb/gpuweb/wiki/Implementation-Status
- OffscreenCanvas — https://blog.scottlogic.com/2020/03/19/offscreen-canvas.html ; ECharts worker: https://github.com/CarterLi/echarts-with-offscreencanvas
- DuckDB-WASM + Arrow — https://motifanalytics.medium.com/my-browser-wasmt-prepared-for-this-using-duckdb-apache-arrow-and-web-workers-in-real-life-e3dd4695623d ; https://www.npmjs.com/package/apache-arrow
