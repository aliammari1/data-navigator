# Implementation Brief — Cluster: Dense charts + virtualization

**Status:** Authoritative. Downstream agents implement directly from this — do NOT re-research.
**Verified:** 2026-06-12 against npm registry + official READMEs/docs (versions/dates inline).
**Hard constraints (apply to every line below):** fully offline (no runtime network/CDN, no Google Fonts, no jsdelivr/unpkg at runtime), medium-end PC (4-core, 8 GB, **no WebGPU**, integrated GPU), use the CURRENT stable API of each package.

## Repo facts this brief relies on (already verified)

- `package.json` already has: `echarts@^6.1.0`, `echarts-for-react@^3.0.6`, `@tanstack/react-virtual@^3.14.2`, `@tanstack/react-table@^8.21.3`, `comlink@^4.4.2`, `apache-arrow@^21.1.0`, `@uwdata/flechette@^2.5.0`, `simple-statistics@^7.9.0`, `dexie@^4.4.3`, `next@^16.2.7`, `electron@^41.7.1`.
- **NOT installed yet (this cluster adds):** `uplot`, `echarts-wordcloud`, `scrollama`, `canvas-confetti`.
- **Module-worker pattern in use repo-wide** (copy it verbatim): `new Worker(new URL("./x.worker.ts", import.meta.url), { type: "module", name: "..." })` then `Comlink.wrap`. Canonical example: `src/features/ai-analysis/worker/client.ts`. Other examples: `src/features/parsed-data/worker/useProfileWorker.ts`, `src/workers/ml.worker.ts`.
- **Renderer is cross-origin isolated**: `electron/security.ts` sets `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp` + `Cross-Origin-Resource-Policy: same-origin` on every document response (so `SharedArrayBuffer`/OffscreenCanvas/`transferControlToOffscreen` are all available — good).
- **Static assets** served from `/public` (e.g. `public/icon-192.png`, `public/models`, `public/workers`). Anything self-hosted goes here.
- DuckDB runs in Electron **main**; renderer talks to it via `runReadOnlyQuery` IPC. Charts/grids only ever render a small window — keep it that way.
- `next.config.ts` is minimal (`output: "standalone"`, `serverExternalPackages: [...]`). Next 16 + Turbopack/webpack both honor the `new URL(..., import.meta.url)` worker pattern; no extra worker-loader config needed.

## Wiring map (where each package lands)

| Package | Primary feature dirs | Worker file(s) |
|---|---|---|
| `uplot` | `src/features/telecom/components/` (daily-trend, hourly, success-rate-trend), `src/features/dashboard-home/`, `src/features/channel-monitor/components/SparklineCell.tsx`, `src/features/data-browser/` (sparklines) | optional `src/features/<f>/workers/` if driven from worker; default main-thread |
| `echarts/core` + OffscreenCanvas | shared chart layer `src/platform/charts/` (new), consumed by analytics-theater, telecom, dashboard-home, channel-monitor, parsed-data | `src/platform/charts/chart.worker.ts` (new) |
| `@tanstack/react-virtual` | `src/features/data-browser/components/`, `src/features/telecom/.../data-grid.tsx`, `src/features/parsed-data/components/ColumnList.tsx`, `src/features/channel-monitor/components/EventRow.tsx` | n/a (renderer) |
| `echarts-wordcloud` | `src/features/analytics-theater/scenes/WordCloudScene.tsx` (+ shared registry, see §2/§4) | reuses `chart.worker.ts` |
| `scrollama` | `src/features/analytics-theater/` (`useScrollama` hook + `TheaterPresenter`) | n/a |
| `canvas-confetti` | `src/platform/ui/confetti.ts` (new, shared); used by dashboard-home / report-studio / theater completion | self-managed blob worker (see §6) |

---

## 1. uPlot (npm: `uplot`)

- **Install:** `uplot` — **current stable `1.6.32`** (published 2025-03-14, MIT, single maintainer leeoniya, Canvas 2D, zero deps, ~48 KB min). No React wrapper dependency — mount with a ~30-line `useEffect` hook. Do **not** add `uplot-react`/`@flowtools/uplot`.
- **Offline/self-host:** ships ESM (`dist/uPlot.esm.js`), CJS, types (`dist/uPlot.d.ts`), and **CSS you MUST import** (`uplot/dist/uPlot.min.css`). The CSS is bundled by the package — importing it in JS is fully offline (no font/CDN fetch). uPlot uses system fonts only; no asset to copy to `public/`. Canvas 2D only — **no WebGPU/WebGL**, ideal for the constraint.
- **Imports:**
  ```ts
  import uPlot from "uplot";
  import "uplot/dist/uPlot.min.css"; // REQUIRED once (e.g. in the wrapper module); bundled, offline
  ```
- **Data shape — `AlignedData`** = array of equal-length arrays, **first array is x-values**, each subsequent array is one series' y-values. Prefer typed arrays (`Float64Array`) fed straight from DuckDB columns:
  ```ts
  // x = unix SECONDS (uPlot time scale expects seconds, NOT ms), y = totals
  const data: uPlot.AlignedData = [xsFloat64, totalFloat64, successFloat64];
  ```
- **Minimal correct init (dense time-series, telecom daily-trend/hourly):**
  ```ts
  const opts: uPlot.Options = {
    width,
    height,
    scales: {
      x: { time: true },        // x is unix-seconds timestamps; set { time:false } for categorical/hour buckets
      y: { auto: true },
    },
    series: [
      {},                        // index 0 = x series, always {}
      { label: "Total",   stroke: "#6366f1", width: 1, fill: "rgba(99,102,241,0.12)", points: { show: false } },
      { label: "Success", stroke: "#22c55e", width: 1, points: { show: false } },
    ],
    axes: [
      { stroke: "#9ca3af" },     // x axis
      { stroke: "#9ca3af" },     // y axis
    ],
    cursor: { drag: { x: true, y: false } },
  };
  ```
- **Key API calls (exact signatures):**
  - `new uPlot(opts: Options, data: AlignedData, target: HTMLElement)` → instance.
  - `u.setData(data: AlignedData, resetScales = true): void` — cheap streaming/refresh update (THE hot path; do NOT recreate the chart).
  - `u.setSize({ width: number, height: number }): void` — call from a `ResizeObserver`.
  - `u.destroy(): void` — call on unmount.
  - Hooks (in `opts.hooks`): `init`, `setData`, `setScale`, `setSize`, `draw`, `ready` — each is `(u: uPlot) => void`. Use `setScale`/`draw` for custom overlays; you usually need none.
- **Canonical React mount hook (no wrapper dep) — create `src/platform/charts/use-uplot.ts`:**
  ```tsx
  import uPlot from "uplot";
  import "uplot/dist/uPlot.min.css";
  import { useEffect, useRef } from "react";

  export function useUPlot(opts: uPlot.Options, data: uPlot.AlignedData) {
    const el = useRef<HTMLDivElement>(null);
    const plot = useRef<uPlot | null>(null);
    useEffect(() => {
      if (!el.current) return;
      plot.current = new uPlot(opts, data, el.current);
      const ro = new ResizeObserver(([e]) =>
        plot.current?.setSize({ width: e.contentRect.width, height: e.contentRect.height }),
      );
      ro.observe(el.current);
      return () => { ro.disconnect(); plot.current?.destroy(); plot.current = null; };
      // eslint-disable-next-line react-hooks/exhaustive-deps -- opts is stable per chart instance
    }, []);
    useEffect(() => { plot.current?.setData(data); }, [data]); // cheap update
    return el;
  }
  ```
- **Pitfalls:**
  - **Time scale is in SECONDS.** If your timestamps are ms (DuckDB `epoch_ms`), divide by 1000 or set `scales.x.time = false` and supply your own tick formatter via `axes[0].values`.
  - `opts` must be **stable** across renders — build it once (the hook above only reads it on mount). Changing `width`/`height` at runtime → use `setSize`, not a new `opts`.
  - All series arrays must be the **same length as x**; ragged data throws/renders blank. Pad with `null` for gaps (uPlot draws gaps for `null`).
  - Use uPlot ONLY for line/area/bar/OHLC time-series. Pie/donut/sunburst/sankey/heatmap/wordcloud stay on ECharts.

---

## 2. ECharts via `echarts/core` (tree-shaken) + OffscreenCanvas worker

- **Install:** already present (`echarts@^6.1.0`). **Switch from the full `echarts` import / `echarts-for-react` default build to `echarts/core` + explicit registration** to cut the ~1 MB bundle to ~150–400 KB. `echarts-for-react@3` can still be used as the **main-thread fallback** but must be fed the core instance via its `echarts` prop.
- **Offline/self-host:** ECharts core + registered modules are pure JS, no runtime assets. **Do NOT use any web-font symbol or map GeoJSON loaded from a URL.** If you need a geo map, bundle the GeoJSON locally and `echarts.registerMap(name, geoJson)`. No CDN. Canvas renderer is the default; also register `SVGRenderer` for crisp vector export (see export §below).
- **Shared registry — create `src/platform/charts/echarts-core.ts`** (single source of truth; every feature imports from here):
  ```ts
  import * as echarts from "echarts/core";
  import {
    BarChart, LineChart, PieChart, ScatterChart, HeatmapChart,
    SankeyChart, SunburstChart, CustomChart,
  } from "echarts/charts";
  import {
    GridComponent, TooltipComponent, LegendComponent, TitleComponent,
    VisualMapComponent, DataZoomComponent, CalendarComponent, MarkLineComponent,
  } from "echarts/components";
  import { CanvasRenderer, SVGRenderer } from "echarts/renderers";

  echarts.use([
    BarChart, LineChart, PieChart, ScatterChart, HeatmapChart,
    SankeyChart, SunburstChart, CustomChart,
    GridComponent, TooltipComponent, LegendComponent, TitleComponent,
    VisualMapComponent, DataZoomComponent, CalendarComponent, MarkLineComponent,
    CanvasRenderer, SVGRenderer,
  ]);

  export { echarts };
  export type { ECharts } from "echarts/core";
  export type { EChartsOption } from "echarts"; // type-only import of full pkg is fine (erased at build)
  ```
  Register ONLY the charts/components a feature actually uses — trim the list per real usage to keep the bundle minimal. Add modules as needed; an unregistered series type renders blank with a console warning.
- **Dense-series perf flags (set these on big line/scatter series; ECharts equivalent of uPlot when you must stay on ECharts):**
  ```ts
  series: [{
    type: "line", // or "scatter"
    large: true, largeThreshold: 2000,
    sampling: "lttb",                 // downsample dense lines
    progressive: 4000, progressiveThreshold: 5000,
    showSymbol: false, animation: false, // animation:false for streaming
    data,
  }]
  ```
- **OffscreenCanvas + Comlink worker (the single biggest 60fps lever) — create `src/platform/charts/chart.worker.ts`:**
  ```ts
  import * as Comlink from "comlink";
  import { echarts } from "./echarts-core";
  import type { EChartsOption } from "./echarts-core";

  const charts = new Map<number, ReturnType<typeof echarts.init>>();

  const api = {
    init(id: number, canvas: OffscreenCanvas, dpr: number, w: number, h: number, theme?: string) {
      charts.set(id, echarts.init(canvas, theme ?? null, {
        renderer: "canvas", devicePixelRatio: dpr, width: w, height: h,
      }));
    },
    setOption(id: number, option: EChartsOption, notMerge = true) {
      charts.get(id)?.setOption(option, { notMerge, lazyUpdate: true });
    },
    resize(id: number, w: number, h: number) { charts.get(id)?.resize({ width: w, height: h }); },
    // Pointer proxy: canvas events fire on the MAIN thread; forward coords here.
    showTip(id: number, x: number, y: number) { charts.get(id)?.dispatchAction({ type: "showTip", x, y }); },
    hideTip(id: number) { charts.get(id)?.dispatchAction({ type: "hideTip" }); },
    pngDataUrl(id: number, pixelRatio = 2, backgroundColor = "#0f172a") {
      return charts.get(id)?.getDataURL({ type: "png", pixelRatio, backgroundColor });
    },
    dispose(id: number) { charts.get(id)?.dispose(); charts.delete(id); },
  };
  export type ChartWorkerApi = typeof api;
  Comlink.expose(api);
  ```
- **Renderer wrapper — `src/platform/charts/OffscreenChart.tsx`** (worker singleton + capability check + fallback):
  ```tsx
  import * as Comlink from "comlink";
  import { useEffect, useRef } from "react";
  import type { ChartWorkerApi } from "./chart.worker";
  import type { EChartsOption } from "./echarts-core";

  let worker: Worker | null = null;
  let proxy: Comlink.Remote<ChartWorkerApi> | null = null;
  let nextId = 1;
  function getProxy(): Comlink.Remote<ChartWorkerApi> | null {
    if (typeof Worker === "undefined") return null;
    if (typeof HTMLCanvasElement === "undefined"
        || typeof HTMLCanvasElement.prototype.transferControlToOffscreen !== "function") return null;
    if (!proxy) {
      worker = new Worker(new URL("./chart.worker.ts", import.meta.url), { type: "module", name: "echarts" });
      proxy = Comlink.wrap<ChartWorkerApi>(worker);
    }
    return proxy;
  }

  export function OffscreenChart({ option, height }: { option: EChartsOption; height: number }) {
    const ref = useRef<HTMLCanvasElement>(null);
    const id = useRef(nextId++);
    const api = useRef<Comlink.Remote<ChartWorkerApi> | null>(null);
    useEffect(() => {
      const p = getProxy();
      const canvas = ref.current;
      if (!p || !canvas) return; // caller renders <ReactECharts echarts={echarts}/> fallback instead
      api.current = p;
      const off = canvas.transferControlToOffscreen();
      const r = canvas.getBoundingClientRect();
      p.init(id.current, Comlink.transfer(off, [off]), window.devicePixelRatio || 1, r.width, r.height);
      const move = (e: PointerEvent) => p.showTip(id.current, e.offsetX, e.offsetY);
      const leave = () => p.hideTip(id.current);
      canvas.addEventListener("pointermove", move);
      canvas.addEventListener("pointerleave", leave);
      const ro = new ResizeObserver(([e]) => p.resize(id.current, e.contentRect.width, e.contentRect.height));
      ro.observe(canvas);
      return () => {
        ro.disconnect();
        canvas.removeEventListener("pointermove", move);
        canvas.removeEventListener("pointerleave", leave);
        p.dispose(id.current);
      };
    }, []);
    useEffect(() => { api.current?.setOption(id.current, option); }, [option]);
    return <canvas ref={ref} style={{ width: "100%", height }} />;
  }
  ```
- **Export (offline, no screenshots):**
  - **Canvas → PNG:** `chart.getDataURL({ type: "png", pixelRatio: 2, backgroundColor })` → returns a `data:image/png;base64,...` string. For the worker path, call `pngDataUrl()` above (works on the OffscreenCanvas instance). Feed straight into pptxgenjs `addImage({ data })` / pdfmake.
  - **Vector → SVG string:** use a **separate SSR instance** (cannot getDataURL-as-svg from a live canvas chart):
    ```ts
    import { echarts } from "./echarts-core"; // SVGRenderer already registered
    const ssr = echarts.init(null, null, { renderer: "svg", ssr: true, width, height });
    ssr.setOption(option);
    const svg = ssr.renderToSVGString(); // string; no DOM needed -> can run in worker/main
    ssr.dispose();
    ```
    `renderToSVGString()` requires `renderer:"svg"` + `ssr:true` at init. Never DOM-screenshot a chart.
- **Pitfalls:**
  - **Two echarts instances trap:** import echarts ONLY from `src/platform/charts/echarts-core.ts`. If some module imports full `"echarts"` and another imports `"echarts/core"`, you get two registries and charts render blank. (This is also the root of the wordcloud gotcha — see §4.)
  - OffscreenCanvas needs the capability guard above; keep a `echarts-for-react` main-thread fallback (pass `echarts={echarts}` so it uses the same tree-shaken core, not the full build).
  - After `transferControlToOffscreen()`, the main thread MUST NOT touch that canvas (same rule as canvas-confetti §6).
  - `setOption(option, { notMerge: true })` for full replacement; without `notMerge`, removed series linger.

---

## 3. `@tanstack/react-virtual` (row + column windowing)

- **Install:** already present (`@tanstack/react-virtual@^3.14.2`, current latest `3.14.2` as of 2026-06-02, MIT, very active). Headless, ~10 KB, zero network. No new install.
- **Import:** `import { useVirtualizer } from "@tanstack/react-virtual";`
- **Row virtualization (data-browser / telecom data-grid / parsed-data column list / monitor event log):**
  ```tsx
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32,   // row px height
    overscan: 12,
  });
  return (
    <div ref={parentRef} className="h-[70vh] overflow-auto">
      <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
        {rowVirtualizer.getVirtualItems().map((v) => (
          <div key={v.key} data-index={v.index}
               ref={rowVirtualizer.measureElement}      // for dynamic heights; omit if fixed
               style={{ position: "absolute", top: 0, left: 0, width: "100%",
                        transform: `translateY(${v.start}px)` }}>
            {/* render rows[v.index] */}
          </div>
        ))}
      </div>
    </div>
  );
  ```
- **Column virtualization (wide tables in data-browser) — second virtualizer with `horizontal: true`:**
  ```tsx
  const colVirtualizer = useVirtualizer({
    horizontal: true,
    count: columns.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => columns[i].width ?? 140,
    overscan: 4,
  });
  // Inside a row: colVirtualizer.getVirtualItems().map(c => cell at column c.index, transform translateX(c.start))
  // The row inner div width = colVirtualizer.getTotalSize(); use a single scroll parent for both axes.
  ```
- **Key API (exact):** `useVirtualizer(options)` returns `{ getVirtualItems(), getTotalSize(), measureElement, scrollToIndex(index, { align }), scrollToOffset(px) }`. `VirtualItem` = `{ index, key, start, size, end, lane }`.
- **Pairs with `@tanstack/react-table` v8:** drive `count` from `table.getRowModel().rows.length`; index into `table.getRowModel().rows[v.index]` and render `row.getVisibleCells()` with `flexRender`.
- **Pitfalls:**
  - Scroll parent MUST have a bounded height + `overflow:auto`; the inner sizer div MUST have `position:relative` and `height = getTotalSize()`. Forgetting either → no scroll / all rows stacked.
  - Use `transform: translateY(...)` (NOT `top`) for GPU-cheap positioning.
  - For dynamic row heights attach `ref={measureElement}` and add `data-index`; for fixed heights skip it (faster).
  - Virtualize a **window over a DuckDB-paged query**, not millions of DOM rows — fetch the slice the virtualizer asks for. Beyond ~50–100k window rows, escalate to a canvas grid (out of scope for this cluster).

---

## 4. `echarts-wordcloud`  ⚠️ highest-risk integration in this cluster

- **Install:** `echarts-wordcloud` — **current stable `2.1.0`** (published **2022-11-24**, Apache-2.0, ecomfe/ECharts org; built on wordcloud2.js). **PIN it exactly: `"echarts-wordcloud": "2.1.0"`** (slow release cadence).
- **CRITICAL compatibility facts (verified):**
  1. Its **peer dependency declares `echarts@^5.0.1`** but the repo runs **echarts 6**. npm/pnpm will emit a peer-dependency warning/error. Resolve it with an override, do NOT downgrade echarts:
     - npm: add `"overrides": { "echarts-wordcloud": { "echarts": "$echarts" } }` to `package.json`, or install with `--legacy-peer-deps`.
     - pnpm: add `"pnpm": { "peerDependencyRules": { "allowedVersions": { "echarts-wordcloud>echarts": "6" } } }`.
     It runs correctly against echarts 6 at runtime (the wordCloud series API is unchanged); only the declared range is stale.
  2. **It registers via global side-effects against the FULL echarts instance.** Source (`src/wordCloud.js`) does `import * as echarts from "echarts/lib/echarts"` and calls `echarts.registerLayout(...)` / `echarts.registerPreprocessor(...)`. It does **NOT** export a `use()`-installable module. Consequence: with a **tree-shaken `echarts/core`** instance, `import "echarts-wordcloud"` registers onto a *different* echarts object → the `wordCloud` series silently does not register and the chart renders blank.
- **Correct offline registration (the only reliable pattern with this repo's tree-shaken core) — create `src/platform/charts/echarts-wordcloud.ts`:**
  ```ts
  // Import the FULL echarts namespace HERE (only in this wordcloud module), then the extension,
  // so the extension's global registerLayout/registerPreprocessor lands on the instance the
  // wordCloud series actually uses. Other charts keep using ./echarts-core (tree-shaken).
  import * as echarts from "echarts";       // full build, but ONLY pulled into the wordcloud chunk
  import "echarts-wordcloud";               // side-effect: registers the `wordCloud` series

  export { echarts as echartsWordCloud };
  ```
  Keep this module dynamically imported (`next/dynamic` / lazy) so the full-echarts cost lands only in the analytics-theater wordcloud chunk, never the initial bundle. Initialize the wordcloud chart with THIS `echartsWordCloud` instance (not the core one).
  - Alternative if you want to avoid the full build entirely: swap to `@echarts-x/custom-word-cloud` which is `echarts.use(wordCloudCustomSeriesInstaller)`-installable on `echarts/core` and renders via a `type:"custom"` series. Treat as a fallback only if bundle size of the wordcloud chunk becomes a problem; the ecomfe package is the spec'd one.
- **Series option (verified keys from README):**
  ```ts
  series: [{
    type: "wordCloud",
    shape: "circle",            // circle | cardioid | diamond | triangle-forward | triangle | pentagon | star
    keepAspect: false,
    left: "center", top: "center", width: "70%", height: "80%",
    sizeRange: [12, 64],        // min/max font px
    rotationRange: [-30, 30],
    rotationStep: 45,
    gridSize: 8,                // spacing; larger = sparser
    drawOutOfBound: false,
    shrinkToFit: false,
    layoutAnimation: true,
    textStyle: { fontFamily: "sans-serif", fontWeight: "bold",
      color: () => `rgb(${[Math.round(Math.random()*160)+60,Math.round(Math.random()*160)+60,Math.round(Math.random()*160)+60].join(",")})` },
    emphasis: { focus: "self", textStyle: { textShadowBlur: 10, textShadowColor: "#333" } },
    data: words.map((w) => ({ name: w.word, value: w.count, textStyle: { color: CATEGORY_COLORS[w.category] } })),
  }]
  ```
  Tooltip: native ECharts `tooltip: { show: true }` — keeps hover off React state (the analytics-theater fix). Data (word/count) comes from a DuckDB `GROUP BY`/tokenization query; never compute layout in React render.
- **Offline/self-host:** no runtime assets; `maskImage` (optional shape mask) must be a locally bundled image if used (put in `public/`), never a URL. Canvas-based, no WebGPU.
- **Pitfalls:** (a) the echarts-5-peer + tree-shake double-gotcha above is THE thing that breaks it — follow the wordcloud module pattern exactly; (b) `gridSize` too small + many words = very slow layout on a 4-core box (cap word count ~150–200, precompute in SQL); (c) if rendered via the OffscreenCanvas worker, the worker must import from the same wordcloud module so the series is registered in the worker context too.

---

## 5. `scrollama` (scrollytelling steps)

- **Install:** `scrollama` — **current stable `3.2.0`** (published 2022-06-17, MIT, IntersectionObserver-based, ~3 KB). Do **NOT** use `react-scrollama` (inactive). Wrap in a tiny local hook.
- **Offline/self-host:** pure JS, zero assets, zero network. IntersectionObserver is native. Nothing to copy to `public/`.
- **Import:** `import scrollama from "scrollama";`
- **Local hook — `src/features/analytics-theater/hooks/use-scrollama.ts`:**
  ```ts
  import scrollama from "scrollama";
  import { useEffect, useRef } from "react";

  export function useScrollama(
    onStep: (index: number, direction: "up" | "down") => void,
    onProgress?: (index: number, progress: number) => void,
  ) {
    const rootRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
      const root = rootRef.current;
      if (!root) return;
      const steps = root.querySelectorAll<HTMLElement>("[data-scene]");
      const sc = scrollama();
      sc.setup({
        step: steps,            // NodeList | selector string | element[]
        offset: 0.5,            // 0..1 viewport fraction, or "200px"
        progress: Boolean(onProgress),
        threshold: 4,           // progress granularity in px (default 4)
      })
        .onStepEnter(({ index, direction }) => onStep(index, direction))
        .onStepProgress(({ index, progress }) => onProgress?.(index, progress));
      const onResize = () => sc.resize();
      window.addEventListener("resize", onResize);
      return () => { window.removeEventListener("resize", onResize); sc.destroy(); };
    }, []); // callbacks read via stable refs if they change
    return rootRef;
  }
  ```
- **Key API (exact):** `scrollama()` → instance. `.setup({ step, offset, progress, threshold, order?, once? })`. Chainable callbacks: `.onStepEnter(cb)`, `.onStepExit(cb)`, `.onStepProgress(cb)`. Callback payload: `{ element, index, direction }` (+ `progress` 0.0–1.0 for `onStepProgress`). Lifecycle: `.resize()` (call on layout/size change), `.enable()`, `.disable()`, `.destroy()`.
- **Markup contract:** each step element must carry `data-scene` (matching the selector above); steps are siblings inside `rootRef`. Typical layout: a `sticky top-0 h-screen` "stage" showing the active scene's chart, plus `min-h-[90vh]` step `<section data-scene>` spacers carrying narration.
- **Pitfalls:** (a) call `.resize()` after content/layout changes or steps misfire; (b) `offset` is 0–1 fraction OR a px string — not raw pixels number; (c) `progress:true` only emits `onStepProgress` if set in `setup`; (d) always `.destroy()` on unmount to disconnect observers; (e) step elements must have non-zero height (the `min-h-*` spacers).

---

## 6. `canvas-confetti` (`useWorker: true`)

- **Install:** `canvas-confetti` — **current stable `1.9.4`** (published 2025-10-25, MIT, actively maintained). ESM entry `dist/confetti.module.mjs`. Types: ship via `@types/canvas-confetti` (DefinitelyTyped) — add as devDependency.
  - `npm i canvas-confetti && npm i -D @types/canvas-confetti`
- **Offline/self-host:** zero runtime assets, zero network — but see CSP gotcha below. **`useWorker:true` builds its worker from `new Worker(URL.createObjectURL(new Blob([code])))`** (verified in source). This means the app's Content-Security-Policy MUST allow **`worker-src blob:`** (and not block `blob:`), or the worker creation throws and it silently falls back to main-thread. Check/extend the CSP in `electron/security.ts` to include `worker-src 'self' blob:`.
- **Import (client-only — references `window`/`document` at runtime, so never import in SSR/main path):**
  ```ts
  import confetti from "canvas-confetti";
  ```
- **Recommended: dedicated canvas + worker (off main thread) — `src/platform/ui/confetti.ts`:**
  ```ts
  import confetti from "canvas-confetti";
  import type { CreateTypes } from "canvas-confetti";

  let instance: CreateTypes | null = null;
  function getInstance(): CreateTypes {
    if (instance) return instance;
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:9999;";
    document.body.appendChild(canvas);
    // useWorker:true => off main thread; resize:true keeps canvas sized to the viewport.
    instance = confetti.create(canvas, { resize: true, useWorker: true });
    return instance;
  }

  export function celebrate(opts?: confetti.Options) {
    getInstance()({ particleCount: 120, spread: 70, origin: { y: 0.6 }, ...opts });
  }
  export function stopConfetti() { instance?.reset(); }
  ```
- **Key API (exact):**
  - Default global: `confetti(options?) => Promise<void>` — fires on a library-managed full-window canvas.
  - `confetti.create(canvas, { resize?: boolean, useWorker?: boolean, disableForReducedMotion?: boolean }) => (options?) => Promise<void>` — scoped instance bound to YOUR canvas.
  - `confetti.reset()` (global) / `instance.reset()` — stop + clear + resolve outstanding promises.
  - Common shoot options: `{ particleCount, spread, angle, startVelocity, decay, gravity, drift, ticks, origin: { x, y }, colors: string[], shapes, scalar, zIndex }`.
- **Pitfalls:**
  - **CSP `worker-src blob:` is mandatory** for `useWorker:true` (the #1 offline gotcha for this package). If you cannot loosen CSP, set `useWorker:false` and accept main-thread rendering.
  - With `useWorker:true` the canvas is **transferred to the worker** — the main thread must NOT touch that canvas (don't read it, resize it manually, or draw to it; only `resize:true` auto-handles sizing). Reuse ONE instance; do not recreate per call.
  - `disableForReducedMotion:true` if you respect `prefers-reduced-motion`.
  - Import client-side only (guard with `"use client"` / dynamic import) — it touches `window`/`document` at runtime.

---

## CSP / headers checklist (do once, in `electron/security.ts`)

- Already set (keep): `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`, `Cross-Origin-Resource-Policy: same-origin` → enables OffscreenCanvas/`transferControlToOffscreen` and SharedArrayBuffer.
- **Add/verify** in the CSP `worker-src` directive: `worker-src 'self' blob:` (required by canvas-confetti `useWorker:true`; module workers from `new URL(...import.meta.url)` are `'self'`).
- No `connect-src`/`font-src`/`img-src` to any external origin is needed by this cluster — everything self-hosted. Do NOT add CDN origins.

## Install command (single line for this cluster)

```
npm i uplot@1.6.32 echarts-wordcloud@2.1.0 scrollama@3.2.0 canvas-confetti@1.9.4 \
  && npm i -D @types/canvas-confetti
# add to package.json: "overrides": { "echarts-wordcloud": { "echarts": "$echarts" } }
```
(`echarts`, `@tanstack/react-virtual`, `comlink` already installed — no action.)

## Cross-cutting pitfalls (read before implementing)

1. **Single echarts instance.** All non-wordcloud charts import the tree-shaken core from `src/platform/charts/echarts-core.ts`; the wordcloud chart uses its own full-echarts module (`echarts-wordcloud.ts`). Mixing core and full imports for the SAME chart → blank render.
2. **uPlot time is seconds, not ms.** Convert DuckDB epoch-ms.
3. **OffscreenCanvas + confetti both consume the canvas** — once transferred, main thread is hands-off.
4. **echarts-wordcloud peer range is stale (echarts 5)** — use the override, keep echarts 6.
5. **Everything offline:** no Google Fonts in echarts/wordcloud textStyle, no map GeoJSON/maskImage from a URL, no CDN. Self-host any optional asset under `public/`.
6. **Feature wiring:** uPlot replaces the three telecom dense line charts + dashboard/monitor sparklines; OffscreenChart wraps remaining ECharts (pie/donut/sankey/sunburst/calendar/heatmap); react-virtual virtualizes every long list/grid (data-browser, telecom grid, parsed-data column list, monitor event log); scrollama drives analytics-theater scenes; wordcloud replaces the fake flex word cloud; confetti is a shared one-shot celebration util.
