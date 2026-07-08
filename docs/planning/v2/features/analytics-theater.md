# Feature Plan — analytics-theater — Presentation / scrollytelling mode for analytics

**Maturity:** partial

## Performance issues

- All six chart datasets are generated at MODULE LOAD with Math.random() (CALENDAR_DATA, RACE_FRAMES, GANTT_DATA), so ~1095 calendar rows + 30 race frames + 48 gantt windows are computed synchronously on the main thread the moment the module is imported, before React even mounts — blocks first paint and ships dead synthetic data in the bundle.
- Every ECharts chart is rendered with echarts-for-react on the MAIN THREAD via canvas; no OffscreenCanvas + Worker offload, so layout/animation of the sankey, sunburst, calendar and the 30-frame racing bar all contend with React reconciliation on a medium-end CPU.
- ChannelRacingBarTab rebuilds the ENTIRE ECharts option object on every frame (buildOption(frame) inside render) and feeds it with notMerge:false default; combined with a setInterval at 800/speed ms this triggers a full option diff + re-render up to ~2.5×/sec, and the sort([...f.data]) allocates a new array each frame.
- CalendarHeatmapTab recomputes maxVal/minVal/avg/total/bestDay/worstDay/streak on EVERY render via Math.max(...values) spread over ~365 numbers and multiple reduce passes, with no useMemo — re-runs on every year-button click and any parent re-render.
- WordCloudTab is NOT a real word cloud: it is flex-wrap text with hand-tuned font sizes; it recomputes max/min/sort/map on every render and every hover sets React state (setTooltip) causing a full re-render of up to 50 spans per mousemove-enter.
- The whole screen is one 1233-line 'use client' component; all six heavy tabs (ECharts instances) and their module-level data are eagerly imported, so the entire ECharts surface (sankey/sunburst/calendar/custom/heatmap) is parsed and the inactive tabs still hold mounted chart code paths — large client bundle, no code-splitting per tab.
- echarts-for-react re-creates option references each render and does not tree-shake ECharts; the full echarts build is pulled in (~1MB+) rather than echarts/core with only the needed renderers/charts registered.
- Sankey/Sunburst/Gantt build their nodes/links/data arrays inline in render with no memoization, re-allocating on every re-render even though the underlying constants never change.
- No virtualization or progressive rendering and no 'large'/'progressive' ECharts mode enabled; fine at current toy sizes but there is no path to real datasets (100k+ rows) without main-thread stalls.
- Racing animation uses setInterval rather than requestAnimationFrame and keeps playing even when the tab is backgrounded / not visible (no IntersectionObserver / document.visibilityState gate), wasting CPU.

## Offline gaps

- No real data source at all — 100% of the content is Math.random() synthetic data hardcoded in the component (CALENDAR_DATA, RACE_FRAMES, SANKEY_CHANNELS, GANTT_DATA, WORD_DATA, sunburstData). The feature never touches the offline DuckDB engine (useDuckDBQuery / runReadOnlyQuery), so it is offline by accident, not by design, and shows nothing about the user's actual dataset.
- No persistence of presentation state: scene order, selected year, playback position, narration text, and the active tab are all ephemeral React state — nothing is saved to Dexie/IndexedDB or OPFS, so a 'presentation/theater' cannot be authored, saved, reopened, or exported offline.
- No offline export path: a 'theater/presentation' mode implies export to PPTX/PDF/PNG, but the feature wires none of the project's already-bundled offline exporters (pptxgenjs, pdfmake, html-to-image) and does not use native echarts.getDataURL() for chart→image.
- No scrollytelling/presentation engine despite the feature name — there is no scene model, no narration, no auto-advance, no IntersectionObserver-driven step triggers; it is a plain tab strip. The intended offline 'theater' UX does not exist.
- Word cloud has no offline layout library; it would need d3-cloud / echarts-wordcloud bundled locally (no CDN) to become a real cloud — currently fakes it with CSS so there is nothing to make offline-correct, but also nothing reusable.
- No local narration/voice: the project ships sherpa-onnx Kokoro TTS + Piper voices, but the theater does not use them to narrate scenes offline (a natural fit for a presentation mode).

## Recommended dependencies

| Package | Category | Stars | Maint. | License | Offline | Replaces | Why | URL |
|---|---|---|---|---|---|---|---|---|
| `scrollama` | scrollytelling-engine | ~5.9k | Active — v3.2.0, refactored core for v3, multiple maintainers, issues triaged 2025 | MIT | yes | hand-rolled scroll listeners | Canonical IntersectionObserver-based scrollytelling library; ~3kB, no scroll-event jank, drives step-enter/exit + progress for the presentation scenes. Wrap in a tiny local React hook (do NOT use the inactive react-scrollama). | https://github.com/russellsamora/scrollama |
| `echarts-wordcloud` | chart-extension | ~2k | Maintained by ecomfe (ECharts org); issues active in 2025, last tagged release 2022 — pin version | Apache-2.0 | yes | WordCloudTab flexbox hack | Official ECharts word-cloud series built on wordcloud2.js; replaces the fake flexbox cloud with a real spiral-packed canvas layout that reuses the existing ECharts instance/theme. Bundle locally. | https://github.com/ecomfe/echarts-wordcloud |
| `d3-cloud` | layout-algorithm | ~3.8k | Mature/stable (jasondavies); slow cadence but de-facto standard, no security issues | BSD-3-Clause | yes | echarts-wordcloud (control alternative) | Alternative/precise word-cloud LAYOUT (Archimedean spiral, sprite collision) you can run inside a Web Worker and render yourself if you want full control over fonts/rotation beyond echarts-wordcloud. | https://github.com/jasondavies/d3-cloud |
| `comlink` | worker-rpc | ~12.6k | Active (GoogleChromeLabs) | Apache-2.0 | yes | main-thread compute | Already a dependency. Use it to move chart-data shaping (calendar aggregation, race frames, word-cloud layout) and OffscreenCanvas ECharts rendering off the main thread. | https://github.com/GoogleChromeLabs/comlink |
| `dexie` | persistence | ~13k | Active | Apache-2.0 | yes | ephemeral React state | Already in the radar/stack. Persist authored presentations (scene list, narration, chart specs, playback settings) as small structured records so theaters survive reloads fully offline. | https://github.com/dexie/Dexie.js |
| `pptxgenjs` | export | ~5.6k | Active; v4.0 | MIT | yes | no export | Already bundled. Export the theater as a real offline .pptx deck (one slide per scene, chart PNG via echarts.getDataURL + narration as speaker notes). | https://github.com/gitbrent/PptxGenJS |
| `html-to-image` | export | ~7.2k | Active; v1.11 | MIT | yes | html2canvas / DOM screenshot | Already in radar. Capture composed scene DOM (KPI cards + caption) to PNG for PDF/PPTX fallback when a scene is not a single ECharts canvas. Prefer native echarts.getDataURL for charts. | https://github.com/bubkoo/html-to-image |
| `echarts (core build)` | charting | ~63k | Very active (Apache) | Apache-2.0 | yes | full echarts import | Already present at v6, but imported as the full bundle. Switch to echarts/core + explicit chart/component/renderer registration to cut ~50%+ of the chart bundle and enable SVGRenderer for crisp export. | https://github.com/apache/echarts |
| `framer-motion (motion)` | animation | ~28k | Very active | MIT | yes | ad-hoc CSS transitions | OPTIONAL. Smooth scene transitions/cross-fades and KPI reveals in presentation mode using transform/opacity (GPU-cheap) instead of layout-thrashing CSS; only if not already present. Keep usage minimal on medium-end PCs. | https://github.com/motiondivision/motion |

## CLIs & tools

| Tool | Type | Offline | Why | URL |
|---|---|---|---|---|
| `@next/bundle-analyzer / sonda` | cli | yes | Confirm the per-tab/per-scene code-split actually shrinks the analytics-theater route chunk and that the full echarts build is no longer pulled in. | https://github.com/filipsobol/sonda |
| `size-limit (@size-limit/preset-app + time)` | cli | yes | Add a per-route byte+parse-time budget for /dashboard/analytics-theater and a per-worker budget for the chart-render worker so the theater bundle can't regress. | https://github.com/ai/size-limit |
| `react-scan` | library | yes | Detect the per-frame re-renders in ChannelRacingBarTab and per-hover re-renders in WordCloudTab; verify memoization fixes removed them. | https://github.com/aidenybai/react-scan |
| `binaryen (wasm-opt)` | cli | yes | Only if d3-cloud/wordcloud2 ships any wasm; otherwise N/A. Keep for any first-party wasm used in worker layout. | https://github.com/WebAssembly/binaryen |
| `@lhci/cli (Lighthouse CI)` | cli | yes | Run against localhost to measure LCP/INP of the theater route before/after moving rendering to OffscreenCanvas + lazy tabs. | https://github.com/GoogleChrome/lighthouse-ci |
| `vitest + @vitest/browser` | cli | yes | Unit-test the new scene model + DuckDB scene queries with a fixture dataset; snapshot the generated ECharts option objects. | https://github.com/vitest-dev/vitest |

---

## Analytics Theater — Deep Improvement Plan

### TL;DR

`analytics-theater` is currently a **demo gallery**, not a **theater**. It is a single 1233-line client component (`src/features/analytics-theater/screens/AnalyticsTheaterScreen.tsx`) rendering six ECharts tabs whose data is 100% `Math.random()` generated at module-load time. Despite the route name and metadata promising a "presentation / scrollytelling mode," there is **no scene model, no narration, no auto-advance, no IntersectionObserver step triggers, no persistence, and no export** — it is a `Tabs` strip.

The two big workstreams are therefore:

1. **Make it real & offline-correct**: drive every chart from the on-device DuckDB engine (`useDuckDBQuery` / `runReadOnlyQuery`) over the active dataset, persist authored presentations to Dexie, and add offline export (PPTX/PDF/PNG) using already-bundled exporters.
2. **Make it a theater**: add a scrollytelling/presentation engine (`scrollama`) with a typed scene model, narration (optionally via the bundled sherpa-onnx Kokoro TTS), transitions, and a present/edit split — while fixing the main-thread/render-thrash perf problems (module-load data gen, full ECharts bundle, per-frame option rebuilds, fake word cloud).

---

## 1. Current implementation

### Files
- `src/app/dashboard/analytics-theater/page.tsx` — trivial route; exports `metadata` (title "Visual Analytics Theater") and renders `<AnalyticsTheaterScreen />`.
- `src/features/analytics-theater/screens/AnalyticsTheaterScreen.tsx` — the entire feature, 1233 lines, `"use client"`.

### What exists (six tabs, all ECharts via `echarts-for-react`)
1. **CalendarHeatmapTab** (L63-200) — GitHub-style calendar heatmap. Data: `CALENDAR_DATA` built by `generateCalendarData(year)` (L25-55) for 2023/2024/2025 at module load — ~1095 rows of random volume/success. KPIs (total/avg/best/worst/streak) recomputed inline every render (L67-80).
2. **ChannelRacingBarTab** (L266-454) — animated racing bar over 30 frames. Data: `RACE_FRAMES = generateRaceFrames()` at module load (L264). `buildOption(frame)` rebuilds the whole option each frame (L274-327); `setInterval` driver (L329-346); auto-plays after 400ms (L348-351).
3. **SankeyFlowTab** (L475-599) — channel→status→outcome Sankey. Static `SANKEY_CHANNELS` (L466-473); nodes/links built inline in render (L476-521). Uses native ECharts `sankey` series.
4. **GanttTab** (L642-768) — intraday activity windows via ECharts `custom` series `renderItem` (L695-725). Data `GANTT_DATA = buildGanttData()` at module load (L640).
5. **WordCloudTab** (L840-957) — **NOT a real word cloud**: `flex-wrap` of `<span>`s with hand-computed `fontSize` (L860-863). Hover sets `setTooltip` React state on every `onMouseEnter` (L901-913) → re-render of up to 50 spans.
6. **SunburstTab** (L961-1131) — native ECharts `sunburst` with a hand-managed breadcrumb (`useState<string[]>`, L962, click handler L1109-1120). Static nested `sunburstData` rebuilt inline every render.

The main screen (`AnalyticsTheaterScreen`, L1173-1232) is a `Tabs` with a `TABS` array of label/subtitle (L1135-1171) and a single `activeTab` state.

### Data & engine context (verified)
- The app has a real offline engine: `src/core/queries/duckdb.ts` exposes `useDuckDBQuery(sql, params, opts)` (React-Query-cached, `staleTime` 2m, `runReadOnlyQuery` SQL-only) and `src/platform/duckdb/duckdb.ts` exposes `runReadOnlyQuery`, `listRegisteredDatasets`, `registerCSVPathDataset`, `registerParquetPathDataset`, `summarizeRegisteredDataset`, `exportRegisteredDataset`.
- Active dataset lives in `src/core/stores/data-store.ts` (`activeDatasetId`, `setActiveDataset`, `getActiveDataset()`), with `Dataset.viewName` for SQL.
- **No feature currently calls `useDuckDBQuery`** (grep returned nothing) — analytics-theater is a natural first real consumer.
- Chart deps already installed: `echarts@^6.1.0`, `echarts-for-react@^3.0.6`, `recharts@3.8.0`, `vega@^6.2.0`, `comlink@^4.4.2`, `arquero@^8.0.3`, `zustand`. No `echarts-wordcloud`, no `scrollama`, no OffscreenCanvas usage anywhere.

---

## 2. Performance bottlenecks & exact fixes

### B1 — Module-load synthetic data generation (blocks import, ships dead data)
`CALENDAR_DATA` (L57-61), `RACE_FRAMES` (L264), `GANTT_DATA` (L640) all run `Math.random()` loops **at import time**. This executes synchronously before React mounts and bloats the client bundle with generators + data.

**Fix**: delete all generators; data comes from DuckDB via React Query (async, cached, off the bundle). For any remaining demo/empty-state, generate lazily inside a `useMemo`/worker, never at module scope.

### B2 — Full ECharts bundle, main-thread canvas, no tree-shaking
`echarts-for-react` + `import ... from "echarts"` pulls the whole build (~1MB). All charts render on the main thread.

**Fix A — tree-shake**: switch to `echarts/core` with explicit registration. Create `src/features/analytics-theater/lib/echarts-core.ts`:
```ts
import * as echarts from "echarts/core";
import { HeatmapChart, BarChart, SankeyChart, SunburstChart, CustomChart } from "echarts/charts";
import { CalendarComponent, VisualMapComponent, TooltipComponent, GridComponent } from "echarts/components";
import { CanvasRenderer, SVGRenderer } from "echarts/renderers";
import "echarts-wordcloud"; // registers the wordCloud series

echarts.use([
  HeatmapChart, BarChart, SankeyChart, SunburstChart, CustomChart,
  CalendarComponent, VisualMapComponent, TooltipComponent, GridComponent,
  CanvasRenderer, SVGRenderer,
]);
export { echarts };
```
This alone typically removes 40-60% of the chart payload. `SVGRenderer` also gives crisp vector export later.

**Fix B — OffscreenCanvas + Worker render** (single biggest 60fps lever on medium CPUs). Move ECharts to a worker via `comlink` so animation/layout never blocks React. Sketch:
```ts
// chart-worker.ts
import { expose } from "comlink";
import { echarts } from "./echarts-core";
let chart: echarts.ECharts | null = null;
expose({
  init(canvas: OffscreenCanvas, dpr: number, w: number, h: number) {
    chart = echarts.init(canvas, "dark", { renderer: "canvas", devicePixelRatio: dpr, width: w, height: h });
  },
  setOption(opt: unknown, notMerge = false) { chart?.setOption(opt as never, notMerge); },
  resize(w: number, h: number) { chart?.resize({ width: w, height: h }); },
  toDataURL() { return chart?.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: "#0f172a" }); },
});
```
```tsx
// useOffscreenChart.ts
export function useOffscreenChart(ref: RefObject<HTMLCanvasElement>) {
  const apiRef = useRef<Comlink.Remote<ChartApi> | null>(null);
  useEffect(() => {
    const el = ref.current; if (!el || !("transferControlToOffscreen" in el)) return;
    const worker = new Worker(new URL("./chart-worker.ts", import.meta.url), { type: "module" });
    const api = Comlink.wrap<ChartApi>(worker);
    const off = el.transferControlToOffscreen();
    const r = el.getBoundingClientRect();
    api.init(Comlink.transfer(off, [off]), devicePixelRatio, r.width, r.height);
    apiRef.current = api;
    const ro = new ResizeObserver(([e]) => api.resize(e.contentRect.width, e.contentRect.height));
    ro.observe(el);
    return () => { ro.disconnect(); worker.terminate(); };
  }, [ref]);
  return apiRef;
}
```
Provide a **graceful fallback** to in-thread `echarts-for-react` when `transferControlToOffscreen` is unavailable (older Safari/Electron quirks) — required by the medium-end constraint.

### B3 — Racing bar rebuilds whole option per frame (`buildOption` in render, `setInterval`)
L274-327 + L329-346. Fix: precompute all 30 frames' option once (memoized), advance via `requestAnimationFrame` gated on visibility, and use **ECharts' built-in transition** by only updating the series `data` array, not the whole option.
```tsx
const frameOptions = useMemo(() => RACE_FRAMES.map(buildOption), [speed]); // or precompute in worker
// rAF loop, pause when !document.hidden && inView
useEffect(() => {
  if (!playing) return; let raf = 0; let last = performance.now();
  const tick = (t: number) => {
    if (t - last >= 800 / speed && !document.hidden) {
      last = t; setFrameIdx((i) => (i >= RACE_FRAMES.length - 1 ? (setPlaying(false), i) : i + 1));
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
}, [playing, speed]);
```
Better still, ECharts' native `dataset` + `transition` or the **bar race** universal-transition recipe lets you push only updated values and let ECharts animate — drop the per-frame option churn entirely.

### B4 — Unmemoized derived stats & inline data builders
Calendar KPIs (L67-80), Sankey nodes/links (L476-521), Sunburst data (L964-1027), Gantt mapping (L726-732) all rebuild every render. Wrap each in `useMemo` keyed on inputs (year, dataset rows). Replace `Math.max(...values)` spreads (stack-risk + O(n) alloc) with a single reduce.

### B5 — Word cloud re-renders on hover; not a real cloud
L901-914 sets React state on hover. Replace with `echarts-wordcloud` (canvas, native tooltip — zero React re-render on hover) **or** a worker-run `d3-cloud` layout rendered to one canvas. Either way hover tooltips stay inside the canvas/ECharts and never touch React state.

### B6 — One mega client component, no code splitting
Split each tab into its own module and `next/dynamic` import so inactive tabs/scenes aren't parsed:
```tsx
const CalendarScene = dynamic(() => import("../scenes/CalendarScene"), { ssr: false, loading: () => <SceneSkeleton/> });
```
Set per-route + per-worker `size-limit` budgets so this can't regress.

---

## 3. Offline gaps & how to close them

| Gap | Close it with |
|---|---|
| 100% random data, never touches user dataset | `useDuckDBQuery` over `activeDatasetId`'s `viewName` (Section 4). All aggregation pushed to SQL. |
| No saved presentations | Dexie table `theaters` (scenes, narration, chart specs, settings). Call `navigator.storage.persist()` once. |
| No offline export | `pptxgenjs` (deck), `pdfmake` (report), native `echarts.getDataURL()` + `html-to-image` (PNG) — all already bundled, run in worker/main per radar Domain 7. |
| No scrollytelling engine | `scrollama` (IntersectionObserver) — fully local, ~3kB. |
| Fake word cloud | bundle `echarts-wordcloud` locally (Apache-2.0), no CDN. |
| No narration | optional: reuse bundled sherpa-onnx Kokoro TTS / Piper to narrate scenes offline. |

All assets bundled or generated locally; no network at runtime.

---

## 4. Better architecture & implementation (step-by-step)

### 4.1 Scene model (the heart of "theater")
Create `src/features/analytics-theater/model/scene.ts`:
```ts
export type SceneKind = "kpi" | "calendar" | "race" | "sankey" | "gantt" | "wordcloud" | "sunburst" | "text";
export interface SceneQuery { sql: string; /* templated against {{view}} */ }
export interface Scene {
  id: string;
  kind: SceneKind;
  title: string;
  narration: string;          // shown as caption + optional TTS
  query?: SceneQuery;         // DuckDB SQL producing the scene's rows
  options?: Record<string, unknown>; // chart-kind-specific knobs (e.g. race speed)
}
export interface Theater {
  id: string; name: string; datasetId: string;
  scenes: Scene[]; createdAt: number; updatedAt: number;
}
```
A theater = an ordered list of scenes bound to a dataset. This replaces the hardcoded `TABS` array.

### 4.2 Bind scenes to the offline engine
Each scene runs one DuckDB query against the active dataset's view. Example calendar query (replaces `generateCalendarData`):
```ts
function calendarSql(view: string, dateCol: string, valueCol: string) {
  return `SELECT CAST(${dateCol} AS DATE) AS d, SUM(${valueCol}) AS v
          FROM ${view} WHERE ${dateCol} IS NOT NULL GROUP BY 1 ORDER BY 1`;
}
```
```tsx
function CalendarScene({ scene, view }: { scene: Scene; view: string }) {
  const { data = [], isLoading } = useDuckDBQuery(scene.query?.sql ?? "", [view], { enabled: !!view });
  const pairs = useMemo(() => data.map(r => [String(r.d), Number(r.v)] as const), [data]);
  const stats = useMemo(() => computeCalendarStats(pairs), [pairs]); // single-pass reduce, memoized
  const option = useMemo(() => buildCalendarOption(pairs, stats), [pairs, stats]);
  // render via useOffscreenChart fallback to <ReactECharts/>
}
```
Aggregation (group-by, sums, top-N champions, hourly windows) is **SQL pushdown** — DuckDB returns a few hundred aggregated rows, never the full table, so the UI stays light even on 10M-row datasets.

### 4.3 Scrollytelling presenter (the missing feature)
Thin local hook around `scrollama` (do NOT use the inactive `react-scrollama`):
```ts
// useScrollama.ts
import scrollama from "scrollama";
export function useScrollama(onStep: (i: number) => void, onProgress?: (i: number, p: number) => void) {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sc = scrollama();
    sc.setup({ step: rootRef.current!.querySelectorAll("[data-scene]"), offset: 0.5, progress: !!onProgress })
      .onStepEnter(({ index }) => onStep(index))
      .onStepProgress(({ index, progress }) => onProgress?.(index, progress));
    const onResize = () => sc.resize();
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); sc.destroy(); };
  }, []);
  return rootRef;
}
```
```tsx
function TheaterPresenter({ theater, view }: { theater: Theater; view: string }) {
  const [active, setActive] = useState(0);
  const rootRef = useScrollama(setActive);
  return (
    <div ref={rootRef} className="relative">
      {/* sticky stage shows the active scene's chart */}
      <div className="sticky top-0 h-screen flex items-center justify-center">
        <SceneStage scene={theater.scenes[active]} view={view} />
      </div>
      {/* scroll spacers + narration drive the steps */}
      {theater.scenes.map((s, i) => (
        <section key={s.id} data-scene data-index={i} className="min-h-[90vh] flex items-end p-8">
          <p className="max-w-prose text-lg text-muted-foreground">{s.narration}</p>
        </section>
      ))}
    </div>
  );
}
```
Add a **Present mode** (full-screen, keyboard ←/→ / space auto-advance using `requestAnimationFrame`, `document.fullscreenElement`) and an **Edit mode** (reorder scenes, edit SQL/narration, pick chart kind). The same `Scene` renders in both.

### 4.4 Persistence (Dexie)
```ts
// db.ts
import Dexie, { type Table } from "dexie";
class TheaterDB extends Dexie {
  theaters!: Table<Theater, string>;
  constructor() { super("analytics-theater"); this.version(1).stores({ theaters: "id, datasetId, updatedAt" }); }
}
export const theaterDb = new TheaterDB();
// on app start: navigator.storage?.persist?.();
```
Autosave on edit (debounced), list on open. Pairs naturally with the radar's collab story (Yjs) later if multi-user authoring is wanted.

### 4.5 Real word cloud (offline)
```tsx
function WordCloudScene({ rows }: { rows: { word: string; count: number; category: string }[] }) {
  const option = useMemo(() => ({
    series: [{ type: "wordCloud", shape: "circle", sizeRange: [12, 64], rotationRange: [-30, 30],
      gridSize: 8, drawOutOfBound: false,
      data: rows.map(r => ({ name: r.word, value: r.count,
        textStyle: { color: CATEGORY_COLORS[r.category as WordCategory] } })) }],
    tooltip: { /* native ECharts tooltip — no React re-render on hover */ },
  }), [rows]);
  // render via offscreen/worker chart
}
```
`rows` come from a DuckDB query (e.g. tokenized `remark` column with `GROUP BY word`). Word-frequency tokenization itself can be a one-off SQL `regexp_split_to_table` or a worker pass.

### 4.6 Offline export
```ts
// export-pptx.ts (run in worker or main; pptxgenjs is bundled)
import pptxgen from "pptxgenjs";
export async function exportTheaterPptx(theater: Theater, pngBySceneId: Record<string, string>) {
  const pptx = new pptxgen();
  for (const s of theater.scenes) {
    const slide = pptx.addSlide();
    slide.addText(s.title, { x: 0.4, y: 0.3, fontSize: 24, bold: true });
    const png = pngBySceneId[s.id];
    if (png) slide.addImage({ data: png, x: 0.5, y: 1.0, w: 9, h: 4.5 });
    slide.addNotes(s.narration);
  }
  return pptx.write({ outputType: "blob" }); // save via Electron fs / download
}
```
Chart PNGs come from `worker.toDataURL()` / `echarts.getDataURL()` per scene (never DOM-screenshot a chart). For composed scenes (KPI cards), `html-to-image` captures the DOM. PDF path uses `pdfmake` analogously.

### 4.7 Optional narration via bundled TTS
Reuse sherpa-onnx Kokoro / Piper (already in `public/models/`) to synthesize `scene.narration` to audio offline and auto-advance on audio end in Present mode — a strong, fully-offline differentiator for a "theater."

---

## 5. Recommended dependencies (see structured `dependencies` for full table)

- **scrollama** (~5.9k★, MIT, active v3.2, ~3kB) — scrollytelling engine. Wrap in a local hook; avoid `react-scrollama` (verified **inactive/discontinued**, ~373★, no release in 12 months).
- **echarts-wordcloud** (~2k★, Apache-2.0, ecomfe org, issues active 2025) — real word cloud on the existing ECharts instance. Pin the version (last tag 2022). Bundle locally.
- **d3-cloud** (~3.8k★, BSD-3) — alternative worker-run word-cloud layout if you want full font/rotation control.
- **comlink** (already in) — OffscreenCanvas worker rendering + off-thread data shaping.
- **dexie** (already in radar) — persist authored theaters.
- **pptxgenjs / pdfmake / html-to-image** (already bundled, radar Domain 7) — offline export.
- **echarts/core** (already at v6) — switch from full build to tree-shaken `echarts.use([...])`.
- **framer-motion/motion** (optional, ~28k★, MIT) — GPU-cheap scene transitions; only if not already present, keep minimal.

All MIT/Apache/BSD, all run with zero runtime network. WebGPU not required — ECharts canvas/SVG + WASM-free libs are the baseline.

---

## 6. CLIs & tools (offline) to build/verify

- **sonda / @next/bundle-analyzer** — verify the per-scene `next/dynamic` split removed the full-echarts payload from the route chunk.
- **size-limit (`@size-limit/preset-app` + time)** — add a `/dashboard/analytics-theater` route budget and a `chart-worker` budget; fail CI on regression.
- **react-scan** — confirm ChannelRacingBar no longer re-renders per frame and WordCloud no longer re-renders per hover.
- **@lhci/cli (Lighthouse CI)** — measure LCP/INP of the route before/after OffscreenCanvas + lazy tabs, all against localhost.
- **vitest (+ @vitest/browser)** — unit-test scene SQL builders and snapshot the generated ECharts option objects against a fixture dataset.
- **binaryen wasm-opt** — only if any first-party wasm ends up in the layout worker.

---

## 7. Phased tasks

### P1 — Make it real & stop the bleeding (highest value)
1. Split the mega component: one module per scene under `src/features/analytics-theater/scenes/`, lazy-loaded via `next/dynamic` (`ssr:false`).
2. Introduce `echarts-core.ts` (tree-shaken `echarts.use`) and replace `import ... "echarts"`; keep `echarts-for-react` only as the in-thread fallback.
3. Delete all `Math.random()` module-load generators; add the `Scene`/`Theater` model and bind Calendar + Sankey + Sunburst scenes to `useDuckDBQuery` over `activeDatasetId`'s `viewName`. Push all aggregation to SQL.
4. `useMemo` all derived stats / nodes-links / option objects keyed on query rows.
5. Add empty/loading/error states (the app has `design/blocks/states.tsx`).

### P2 — Theater UX + perf hardening
6. Add `scrollama` + `useScrollama` and the `TheaterPresenter` (sticky stage + scroll-driven scenes); add Present mode (fullscreen, keyboard, auto-advance via rAF, visibility-gated).
7. Move chart rendering to OffscreenCanvas + Comlink worker with graceful in-thread fallback; convert ChannelRacingBar to data-only updates + rAF loop; gate animation on `inView && !document.hidden`.
8. Replace the fake word cloud with `echarts-wordcloud` (or worker `d3-cloud`), data from DuckDB token frequencies.
9. Add Dexie persistence (`theaters` table), autosave, open/list; call `navigator.storage.persist()`.
10. Add per-route + per-worker `size-limit` budgets; run react-scan + Lighthouse CI to verify.

### P3 — Authoring, export, narration
11. Edit mode: reorder scenes (dnd), edit SQL/narration, pick chart kind, live preview.
12. Offline export: PPTX (`pptxgenjs`, one slide/scene + speaker notes), PDF (`pdfmake`), PNG (`echarts.getDataURL` / `html-to-image`); run heavy export in worker/Electron main.
13. Optional offline narration via bundled sherpa-onnx Kokoro/Piper TTS with auto-advance on audio end.
14. Optional collab authoring via Yjs (radar Domain 8) if multi-user theaters are desired.

---

## 8. Risks / notes
- OffscreenCanvas must have a fallback path — confirm in the Electron Chromium version; keep `echarts-for-react` as the safety net.
- Pin `echarts-wordcloud` (older release cadence) and bundle locally — no CDN, per offline constraint.
- Word-frequency tokenization on large text columns should be a one-off SQL/worker pass, cached, not per-render.
- Keep ECharts animation modest on integrated GPUs; prefer `transform`/`opacity` for scene transitions; avoid simultaneous heavy animations across multiple mounted charts (only the active scene's chart should animate).