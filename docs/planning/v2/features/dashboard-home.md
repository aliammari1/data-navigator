# Feature Plan — dashboard-home — Main dashboard landing / KPI overview

**Maturity:** functional

## Performance issues

- DashboardHomeScreen.tsx hard-redirects /dashboard -> /dashboard/telecom-report (page.tsx), and DashboardHomeScreen is bound 1:1 to the telecom domain — it is not a generic landing/KPI overview; for any non-telecom dataset it shows only an empty state.
- useTelecomAnalytics.computeAnalytics fires ~8 sequential/parallel DuckDB IPC round-trips per run (ensureEnrichedView, fetchKPI which itself re-ensures the view, fetchHourly, fetchStatusBreakdown, then fetchRawCanalSummaries/fetchOperators/fetchRegions, then fetchDistinctStatuses) — operators/regions are computed but never rendered on the home screen (wasted full-table scans).
- fetchKPI calls ensureTelecomEnrichedView a SECOND time after computeAnalytics already called it (queries.ts:161 vs use-telecom-analytics.ts:143) — redundant CREATE OR REPLACE VIEW round-trip on every run.
- The analyticsQueryKey is recomputed via JSON.stringify(mapping)+JSON.stringify(statusMapping) on every render and is a dependency of the computeAnalytics useCallback, so the query function identity churns; combined with a manual runAnalytics effect (use-telecom-analytics.ts:178) the analytics can run twice (once via useQuery enabled, once via fetchQuery).
- OverviewTab defaultCards builds the entire card tree (including a full <table> of all canals and 7 ECharts Sections) inside one useMemo with ~9 dependencies; any KPI toggle or section toggle rebuilds all card nodes and re-renders every chart.
- DraggableAutoGrid wraps every card in @dnd-kit SortableContext/useSortable even though reordering is rare — DnD listeners and transforms are mounted permanently around heavy chart subtrees, adding context re-renders on drag and pointer overhead.
- Charts use echarts-for-react on the renderer main thread (canvas renderer) with no OffscreenCanvas/worker offload; 7+ ECharts instances plus the dynamic widget-registry ECharts widgets all initialize and animate on the main thread, contending with React render and the AnimCounter rAF loop.
- AnimCounter runs a per-KPI requestAnimationFrame easing loop (8 counters) writing textContent each frame for 800ms on every data change; motion/react spring stagger animations on the 5 revenue-group cards add further main-thread layout/animation work on each refresh.
- DailyTrendChart fetches its own daily-trend query on mount independent of the analytics pipeline (a 9th DuckDB round-trip), and recomputes movingAverage + chart option in JS on the main thread.
- computeAIInsights (insights.ts, 342 lines) runs synchronously in a useMemo on the main thread over kpi/canals/hourly/statusData on every analytics change.
- No daily pre-aggregation is used on the hot path: createTelecomDailyAgg exists (queries.ts:1122) but home-screen KPI/hourly/canal queries scan the full enriched view (full table) instead of the tiny *_daily rollup.

## Offline gaps

- The landing route depends on a server session: src/app/dashboard/layout.tsx calls auth.api.getSession with force-dynamic + nodejs runtime — fine inside Electron main, but it means the dashboard shell cannot render as a static offline shell; any auth backend that reaches out must be confirmed to be fully local.
- new Notification(...) is fired when document.hidden (use-telecom-analytics.ts:203) with icon "/icon-192.png" — relies on the Notification API + a bundled icon; harmless offline but should degrade silently when permission is unavailable (it does check permission, OK).
- No persisted analytics cache: TanStack Query staleTime:Infinity is in-memory only (gcTime 30m); on app restart every dashboard load re-runs the full DuckDB analytics pipeline. There is no OPFS/IndexedDB-persisted KPI snapshot for instant cold-load.
- Empty-state and all UX copy assume a telecom report exists; there is no offline-first generic dashboard for arbitrary local datasets, so a fully-offline user with non-telecom CSVs gets no KPI overview at all.
- Card order persistence uses localStorage (overview-tab.tsx readSavedCardOrder/saveCardOrder) which is renderer-scoped and not in the app's OPFS/Dexie persistence model — acceptable but inconsistent with the documented storage split.
- Forecast is pure-JS Holt-Winters (good, fully offline) but the file is named forecast-onnx.ts implying an ONNX path that does not exist — no model bundling gap, just a naming/clarity issue to avoid a future online model assumption.

## Recommended dependencies

| Package | Category | Stars | Maint. | License | Offline | Replaces | Why | URL |
|---|---|---|---|---|---|---|---|---|
| `uplot` | Dense time-series / KPI sparkline charts | ~10.3k | Active (v1.6.x, single maintainer leeoniya) | MIT | yes | echarts-for-react for line/area charts on the home overview | For the hourly + daily-trend + success-rate line charts, uPlot renders 166k points in ~25ms at ~10% CPU vs ECharts ~70% CPU/85MB. Use it for the home screen's line/area charts to cut main-thread chart cost dramatically on medium PCs; keep ECharts for pies/donuts/heatmaps. | https://github.com/leeoniya/uPlot |
| `echarts (OffscreenCanvas + worker)` | General canvas charts (pie/donut/heatmap) | ~63k | Very active (Apache, v6) | Apache-2.0 | yes | main-thread echarts-for-react usage for retained ECharts charts | Already a dep. Move ECharts instances off the renderer main thread via echarts.init(offscreenCanvas) inside a Comlink worker (transferControlToOffscreen) so the dashboard's many charts stop blocking React render and AnimCounter rAF. | https://github.com/apache/echarts |
| `comlink` | Worker RPC glue | ~12.6k | Active (GoogleChromeLabs) | Apache-2.0 | yes | main-thread insights/forecast computation | Already a dep. Use it to host an analytics/insights worker: run computeAIInsights, movingAverage, forecast, and chart-option building off the main thread; also the glue for OffscreenCanvas chart workers. | https://github.com/GoogleChromeLabs/comlink |
| `@tanstack/react-query persister (idb-keyval/OPFS)` | Persisted analytics cache | ~45k (react-query) | Very active | MIT | yes | in-memory-only staleTime:Infinity cold loads | Wrap the analytics query with persistQueryClient + an IndexedDB/OPFS persister so the last KPI snapshot paints instantly on cold start (offline), then revalidates in the background. Eliminates the full DuckDB pipeline re-run blocking first paint. | https://github.com/TanStack/query |
| `dnd-kit` | Draggable dashboard grid (current) | ~17.1k | Active (commits into 2026) | MIT | yes | — | Already in use and adequate. KEEP, but mount DnD lazily (only when an 'edit layout' mode is on) so heavy chart subtrees aren't permanently wrapped in SortableContext on the read-only dashboard. | https://github.com/clauderic/dnd-kit |
| `react-grid-layout (v2)` | Resizable+draggable widget grid (optional upgrade) | ~22.2k | Active; v2 TS rewrite (2026) | MIT | yes | DraggableAutoGrid only if resize/breakpoints needed | OPTIONAL: if the home screen should become a true configurable KPI dashboard with resizable widgets and responsive breakpoints, RGL v2 (hooks API) is the mature standard. Heavier than dnd-kit reorder-only; adopt only if resize is a real requirement. | https://github.com/react-grid-layout/react-grid-layout |
| `@stdlib/stats` | Stats for insights/thresholds | ~5.8k | Active | Apache-2.0 | yes | ad-hoc threshold math in insights.ts | If KPI insight logic grows (z-scores, robust thresholds, distribution tests for anomaly flags on the overview), use modular @stdlib/stats functions in the worker rather than hand-rolled comparisons in insights.ts. | https://github.com/stdlib-js/stats |

## CLIs & tools

| Tool | Type | Offline | Why | URL |
|---|---|---|---|---|
| `@next/bundle-analyzer / sonda` | cli | yes | Quantify the home-route bundle — echarts, echarts-for-react, motion, dnd-kit, recharts are all pulled in; verify dynamic-import code-splitting actually isolates each chart chunk. | https://github.com/filipsobol/sonda |
| `size-limit (@size-limit/preset-app + time)` | cli | yes | Add a per-route budget for /dashboard and per-worker budgets for the new analytics/chart workers; gate parse+eval time on medium-PC profile. | https://github.com/ai/size-limit |
| `react-scan` | library | yes | Detect unnecessary re-renders in OverviewTab card tree and KPICard/AnimCounter during refresh; confirms the memoization fixes work. | https://github.com/aidenybai/react-scan |
| `tinybench (via Vitest bench)` | library | yes | Microbench computeAIInsights, movingAverage, and forecast to justify moving them into the worker and to set a perf budget for the home pipeline. | https://github.com/tinylibs/tinybench |
| `@lhci/cli (Lighthouse CI)` | cli | yes | Run TBT/INP/LCP audits against localhost Electron dev server fully offline to track main-thread blocking of the dashboard before/after worker offload. | https://github.com/GoogleChrome/lighthouse-ci |
| `DuckDB query metrics (__duckdbMetrics)` | service-local | yes | shared-duckdb already exposes window.__duckdbMetrics in dev — use it to count and time the per-load IPC round-trips and prove the consolidation (single combined query / daily rollup) reduces them. | https://github.com/duckdb/duckdb-node-neo |

---

# Deep Improvement Plan — `dashboard-home` (Main dashboard landing / KPI overview)

## 0. TL;DR

The feature advertised as a generic "dashboard landing / KPI overview" is, in the current code, **a thin shell that immediately redirects to the telecom report and renders a telecom-only overview**. There is no generic, dataset-agnostic KPI home. The data path is architecturally sound at the boundary (DuckDB runs in the Electron main process over IPC, all compute is local, forecasting is pure-JS Holt-Winters), but the home screen is **chart-heavy and main-thread bound**: 7+ ECharts instances render on the renderer main thread, the analytics pipeline issues ~8-9 DuckDB IPC round-trips per load (two of them for data never shown on this screen), the enriched view is created twice, and the whole card tree is rebuilt in one `useMemo` on every KPI/section toggle. There is no persisted cache, so every cold start re-runs the full pipeline before first paint.

This plan keeps the offline-only, no-WebGPU, medium-PC constraints front and center. **No new mandatory runtime dependency is required** — the biggest wins come from consolidating SQL, moving compute into a Comlink worker, offloading ECharts via OffscreenCanvas, persisting the analytics snapshot, and (optionally) generalizing the home screen beyond telecom. uPlot is the one strongly-recommended additive dep for the line/area charts.

---

## 1. Current implementation (file-by-file)

### 1.1 Route + shell

- **`src/app/dashboard/page.tsx`** — 5 lines. `redirect("/dashboard/telecom-report")`. The literal `/dashboard` index does **not** render `DashboardHomeScreen`; it bounces to the telecom report. So "dashboard home" as a landing page is effectively unreachable via the index route.
- **`src/app/dashboard/layout.tsx`** — server component, `runtime = "nodejs"`, `dynamic = "force-dynamic"`. Calls `auth.api.getSession({ headers })` then renders `DashboardClientShell`. This forces a dynamic server render of the dashboard root on every navigation; offline this works only because auth is local to Electron, but it prevents a static offline shell.
- **`src/features/dashboard-home/screens/DashboardHomeScreen.tsx`** (406 lines) — the actual "home" component, but **bound 1:1 to telecom**:
  - Reads `datasets`, `activeDatasetId`, `setActiveDataset` from `useDataStore`.
  - `telecomDatasets = datasets.filter(isTelecomDataset).sort(byUpdatedAt)` (memoized).
  - `activeTelecomDataset` = active dataset if telecom, else newest telecom dataset.
  - Local state: `activeTableName`, `tableReady`, `statusMapping`, `selectedKpis`, `selectedOverviewSections`, plus a pile of refs (`firstLoad`, `fileNameRef`, `tableNameRef`, `statusMappingRef`).
  - An effect (lines 139-173) resolves the active dataset's `viewName`/`tableName`, sets `tableReady`, and resets `firstLoad`.
  - A second effect (lines 175-179) calls `analytics.runAnalytics(...)` whenever `tableReady || activeTableName || analytics.refresh` changes — with `eslint-disable exhaustive-deps`. This is **a manual run that duplicates** what `useQuery` already does.
  - Renders a sticky header (title, dataset name, tx count, success rate badge), a `TelecomDatasetPicker` (`<select>` when >1 dataset), Refresh/Import/Full-report buttons, and `<OverviewTab>`.
  - `DashboardHomeEmptyState` is shown when there is no telecom dataset — so non-telecom users get nothing.

### 1.2 Analytics hook

- **`src/features/telecom/hooks/use-telecom-analytics.ts`** (297 lines):
  - Builds `analyticsQueryKey = ["telecom","analytics", tableName, stableHash(mapping), stableHash(statusMapping)]` where `stableHash = JSON.stringify`. This key is **recomputed every render** and is a dependency of `computeAnalytics` (`useCallback`), so the query fn identity changes whenever mapping/statusMapping object identity changes.
  - `computeAnalytics`:
    1. `runReadOnlyQuery("SELECT 1 FROM information_schema.tables WHERE table_name = '<table>'")` — existence check (round-trip #1).
    2. `await ensureTelecomEnrichedView(table, m, sm)` — `CREATE OR REPLACE VIEW <table>_enriched` (round-trip #2).
    3. `Promise.all([fetchKPI, fetchHourly, fetchStatusBreakdown])` — #3-#5. **`fetchKPI` internally calls `ensureTelecomEnrichedView` again** (queries.ts:161) → redundant view creation.
    4. `Promise.all([fetchRawCanalSummaries, fetchOperators, fetchRegions])` — #6-#8. **operators and regions are not rendered by OverviewTab** — wasted full scans on the home screen.
    5. `forecastNextHours(hourly, 4)` — pure JS, cheap.
    6. On `firstLoad`, `fetchDistinctStatuses` — #9, plus status auto-mapping additions pushed back into page state.
    7. Side effects: `new Notification(...)` if `document.hidden`, and `broadcast({ type: "ANALYTICS_READY", ... })` to other tabs.
  - `useQuery({ queryKey, queryFn, enabled: loaded && tableName, staleTime: Infinity, gcTime: 30m, placeholderData: previous })`.
  - `runAnalytics` calls `queryClient.fetchQuery` with a **separately-constructed key** (re-hashing m/sm) — so the manual effect path and the `useQuery` path can both execute.

### 1.3 Presentation

- **`src/features/telecom/components/overview-tab.tsx`** (845 lines):
  - Dynamically imports `echarts-for-react` and 6 chart components (`AmountPieChart`, `CanalShareChart`, `DailyTrendChart`, `HourlyChart`, `StatusDonut`, `SuccessRateTrendChart`) — good code-splitting.
  - `insights = useMemo(() => computeAIInsights(kpi, canals, hourly, statusData).slice(0,3))` — **synchronous main-thread** insight computation (insights.ts is 342 lines).
  - `revenueGroupData = useMemo(...)` over canals — cheap.
  - `defaultCards = useMemo<DashboardCardItem[]>(() => [...7 cards...], [statusData, kpi, selectedOverviewSections, toggleOverviewSection, forecast, hourly, canals, fetchDailyTrend, m])` — **the entire card tree, including a full `<table>` over all canals and 7 chart Sections, is one memo**. Toggling a KPI or an export section invalidates and rebuilds all nodes.
  - `widgetCards` from `useWidgetRegistry().getWidgetsForPage("telecom-overview")` → each is a main-thread `ReactEChartsWidget`.
  - `cards = sortCardsBySavedOrder([...defaultCards, ...widgetCards], cardOrder)` → `<DraggableAutoGrid>`.
  - KPI cards use `<AnimCounter>` (8 instances) and `motion/react` stagger animations on 5 revenue-group cards.
- **`draggable-auto-grid.tsx`** — wraps **every** card in `@dnd-kit` `SortableContext` + `useSortable`, always-on, even though reordering is an occasional action.
- **`anim-counter.tsx`** — per-counter `requestAnimationFrame` easing for 800ms writing `textContent` each frame.
- **`daily-trend-chart.tsx`** — fetches its **own** daily-trend query on mount (independent 9th round-trip), computes `movingAverage` + ECharts option in JS, renders main-thread `ReactECharts`.

### 1.4 Data engine boundary (good)

- **`src/platform/duckdb/shared-duckdb.ts`** — renderer is a thin IPC client to the Electron main-process DuckDB service (`window.electronDuckDB`). Renderer never holds large buffers; all SQL runs natively in main with timeouts. This matches the Tech Radar "native DuckDB primary" guidance. `__duckdbMetrics` is exposed in dev for timing.
- **`forecast-onnx.ts`** — despite the name, pure JS (Holt-Winters + `simple-statistics` linear regression). Fully offline, no model. The `-onnx` suffix is misleading.

---

## 2. Performance bottlenecks and exact fixes

### 2.1 Redundant + wasteful DuckDB round-trips (biggest data-path win)

**Problem:** ~9 IPC round-trips per load; the enriched view is created twice; operators/regions are fetched but never shown on the home screen; KPI/hourly/canal each scan the full enriched view instead of a daily rollup.

**Fix A — drop dead work on the home path.** Operators and regions are not rendered by `OverviewTab`. Remove them from `computeAnalytics` (or gate them behind a flag only the full report sets). This removes 2 full-table scans per load immediately.

```ts
// use-telecom-analytics.ts — home variant
const [kpiResult, hourlyResult, statusResult] = await Promise.all([
  _fetchKPI(table, m, sm),
  _fetchHourly(table, m, sm),
  _fetchStatusBreakdown(table, m, sm),
]);
const rawCanalsResult = await fetchRawCanalSummaries(table, m, kpiResult?.totalTransactions ?? 0, sm);
// operators/regions intentionally omitted on the overview screen
```

**Fix B — ensure the enriched view exactly once.** `computeAnalytics` already calls `ensureTelecomEnrichedView`; `fetchKPI` calls it again. Pass a flag (or rely on the in-flight/cache map in `ensureTelecomEnrichedView`, which already dedupes by key) — but the cleaner fix is to make `fetchKPI` *assume* the view exists when called from the pipeline:

```ts
// queries.ts
export async function fetchKPI(table, m, sm, opts?: { ensureView?: boolean }) {
  const hasEnriched = opts?.ensureView === false
    ? enrichmentKeys.get(enrichedViewName(table)) === enrichmentKey(m, sm)
    : await ensureTelecomEnrichedView(table, m, sm);
  // ...
}
```
The dedupe cache in `ensureTelecomEnrichedView` (queries.ts:1096-1098) already short-circuits on identical keys, so the redundant call is cheap-ish, but eliminating the await still removes one promise hop on the critical path.

**Fix C — fold KPI + hourly + status into ONE query over the enriched view.** All three are simple aggregates over the same view. DuckDB can return them in a single round-trip using a CTE + a couple of grouped sub-selects materialized as arrays, or three statements in one `runReadOnlyQuery` batch if the bridge supports multi-statement. A single combined statement (KPI scalars + hourly grouped + status grouped) cuts 3 round-trips to 1:

```sql
-- one round-trip; client splits the result sets
WITH e AS (SELECT * FROM "<table>_enriched")
SELECT 'kpi' AS _k, NULL AS hour, NULL AS status,
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE _status_norm='SUCCESS') AS success_count,
       /* ...rest of KPI aggregates... */
FROM e
UNION ALL
SELECT 'hourly', _txn_hour, NULL, COUNT(*), COUNT(*) FILTER (WHERE _status_norm='SUCCESS'), ...
FROM e GROUP BY _txn_hour
UNION ALL
SELECT 'status', NULL, _status_norm, COUNT(*), ...
FROM e GROUP BY _status_norm;
```
(If a heterogeneous UNION is awkward, prefer the daily rollup below, which is the real fix.)

**Fix D — use the daily rollup on the hot path.** `createTelecomDailyAgg` already builds `<table>_daily` (day × canal × status → cnt/amount/avg_proc_ms/unique). For a single-day telecom report the home KPIs (totals, per-canal, per-status, hourly is the exception) can be derived from a tiny pre-aggregated table instead of scanning the full enriched view. Build `<table>_daily` once during dataset registration (or on first analytics run) and serve KPI/canal/status/daily-trend from it. Hourly still needs the enriched view (hour granularity), but that is one scan instead of four.

**Expected result:** from ~9 round-trips + 2 redundant view creations down to **2-3 round-trips** (build/refresh rollup once, then KPI+canal+status from rollup in 1, hourly in 1). On a multi-hundred-MB Parquet-backed dataset this is the difference between a visibly janky refresh and an instant one.

### 2.2 Double-execution of analytics

**Problem:** `useQuery` (enabled) and the manual `useEffect → runAnalytics → fetchQuery` (DashboardHomeScreen lines 175-179) can both fire, and the query-key churn (JSON.stringify on every render) can cause refetches.

**Fix:** Delete the manual `runAnalytics` effect entirely and rely on `useQuery`. Make the query key stable by hashing mapping/statusMapping with a stable serializer and memoizing it:

```ts
const analyticsQueryKey = useMemo(
  () => ["telecom","analytics", tableName, stableHash(mapping), stableHash(statusMapping)] as const,
  [tableName, mapping, statusMapping],
);
```
And memoize `computeAnalytics` on stable inputs only (not on the array literal). Remove `analyticsQueryKey` from the `computeAnalytics` dependency list (read `rawStatuses` via `queryClient.getQueryData(queryKey)` using the memoized key). This guarantees exactly one run per (table, mapping, statusMapping).

### 2.3 Charts on the main thread

**Problem:** 7+ ECharts instances + widget-registry ECharts all init/animate on the renderer main thread, competing with React reconciliation and the AnimCounter rAF loop. On a 4-core integrated-GPU machine this is the dominant cause of jank during refresh.

**Fix 1 — OffscreenCanvas + worker for ECharts.** ECharts supports `init` on an `OffscreenCanvas`. Create a single chart worker (Comlink) that owns N offscreen canvases; the renderer transfers control of each `<canvas>` via `transferControlToOffscreen()` and posts only the option JSON + data (ideally Arrow/typed arrays):

```ts
// chart.worker.ts
import * as echarts from "echarts/core";
import { /* PieChart, BarChart, LineChart */ } from "echarts/charts";
import { /* GridComponent, TooltipComponent, ... */ } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
echarts.use([/* registered modules */]);

const charts = new Map<number, echarts.ECharts>();
const api = {
  init(id: number, canvas: OffscreenCanvas, dpr: number) {
    charts.set(id, echarts.init(canvas, undefined, { renderer: "canvas", devicePixelRatio: dpr, width: canvas.width, height: canvas.height }));
  },
  setOption(id: number, option: unknown) { charts.get(id)?.setOption(option as never, true); },
  resize(id: number, w: number, h: number) { charts.get(id)?.resize({ width: w, height: h }); },
  dispose(id: number) { charts.get(id)?.dispose(); charts.delete(id); },
};
export type ChartWorkerApi = typeof api;
Comlink.expose(api);
```

```tsx
// OffscreenChart.tsx (renderer)
export function OffscreenChart({ option, height }: { option: unknown; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const idRef = useRef(nextChartId());
  useEffect(() => {
    const canvas = ref.current!;
    const off = canvas.transferControlToOffscreen();
    const dpr = window.devicePixelRatio || 1;
    chartWorker.init(idRef.current, Comlink.transfer(off, [off]), dpr);
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      chartWorker.resize(idRef.current, width, height);
    });
    ro.observe(canvas);
    return () => { ro.disconnect(); chartWorker.dispose(idRef.current); };
  }, []);
  useEffect(() => { chartWorker.setOption(idRef.current, option); }, [option]);
  return <canvas ref={ref} style={{ height, width: "100%" }} />;
}
```
Guard with a capability check (`typeof HTMLCanvasElement.prototype.transferControlToOffscreen === "function"`); fall back to current `echarts-for-react` on the main thread when unavailable. This is the single biggest 60fps lever per the Tech Radar.

**Fix 2 — uPlot for line/area charts.** The hourly distribution, daily trend, and success-rate-trend are line/area charts where uPlot is dramatically cheaper than ECharts (166k pts in ~25ms, ~10% CPU streaming vs ECharts ~70%). Swap those three to uPlot (still Canvas 2D, no WebGL/WebGPU — perfect for the no-WebGPU constraint). Keep ECharts only for pie/donut/heatmap. uPlot runs fine on the main thread because it is so light, but can also be driven from the worker.

```ts
import uPlot from "uplot";
const opts: uPlot.Options = {
  width, height,
  series: [{}, { label: "Total", stroke: "#6366f1", width: 1, fill: "rgba(99,102,241,0.1)" }],
  axes: [{}, {}],
  scales: { x: { time: false } },
};
// data: [xs: Float64Array, ys: Float64Array] — feed from DuckDB hourly result
const plot = new uPlot(opts, [xs, ys], containerEl);
```

### 2.4 Card-tree rebuild on every toggle

**Problem:** `defaultCards` is one `useMemo` with 9 deps; toggling a KPI/export checkbox rebuilds all chart nodes.

**Fix:** Split each card into its own memoized component, pass only the props it needs, and move the export-toggle state out of the data-bearing subtree (toggles should not invalidate chart nodes). Concretely, extract `StatusCard`, `HourlyCard`, `CanalShareCard`, `CanalAmountCard`, `SuccessRateCard`, `CanalTableCard`, `DailyTrendCard` as `React.memo` components keyed by their slice of data; the `selectedOverviewSections` set is read by a tiny `ExportToggle` that subscribes only to its own key (e.g. via a Zustand selector store rather than a parent `Set` passed wholesale).

```tsx
const StatusCard = memo(function StatusCard({ statusData, total }: { statusData: StatusRow[]; total: number }) {
  return (<Section title="Répartition des Statuts" /* ... */><StatusDonut data={statusData} total={total} /></Section>);
});
```
Move card *order* to a store too; reordering should not rebuild card *content*.

### 2.5 Insights / moving-average / option-building on main thread

**Fix:** Move `computeAIInsights`, `movingAverage`, forecast, and ECharts/uPlot option building into the Comlink analytics worker so the main thread only receives finished view-models. The worker can compute insights as part of the same job that returns KPI/canal/status, so the UI receives one resolved payload.

```ts
// analytics.worker.ts
const api = {
  async buildOverviewVM(rawPayload: AnalyticsRaw): Promise<OverviewVM> {
    const insights = computeAIInsights(rawPayload.kpi, rawPayload.canals, rawPayload.hourly, rawPayload.statusData).slice(0,3);
    const hourlyOption = buildHourlyOption(rawPayload.hourly, rawPayload.forecast);
    const dailyVM = buildDailyTrendVM(rawPayload.daily);
    return { insights, hourlyOption, dailyVM, /* ... */ };
  },
};
Comlink.expose(api);
```
DuckDB IPC must stay on the renderer/main side (the bridge is on `window`), so the worker receives raw rows and only does CPU-bound transforms.

### 2.6 AnimCounter + motion overhead

**Fix:** Cap AnimCounter to run only when the value actually changes by a meaningful delta and only once per data load (it already keys on `value`, but 8 simultaneous rAF loops + motion springs on refresh is a lot). Prefer a single shared rAF ticker that drives all counters, or replace per-frame `textContent` writes with a CSS-driven count using `@property`-animated custom properties where available. Reduce `motion/react` stagger to a one-shot entrance animation gated on first paint only (skip on refresh) via `initial={false}` after mount.

### 2.7 DnD always-on

**Fix:** Render `DraggableAutoGrid` only in an explicit "Edit layout" mode; in read mode render a plain CSS grid. This removes `SortableContext`/`useSortable` and pointer-sensor overhead from the default dashboard view.

```tsx
{editMode ? <DraggableAutoGrid items={cards} onChange={...} /> : <StaticGrid items={cards} />}
```

### 2.8 DailyTrendChart independent fetch

**Fix:** Fold the daily-trend query into the main analytics pipeline (or serve it from `<table>_daily`), pass `daily` data down as a prop, and drop the component-local `useEffect` fetch + `setLoading` round-trip. This removes the 9th round-trip and a separate loading flash.

---

## 3. Offline gaps and how to close them

1. **No persisted analytics snapshot.** TanStack staleTime:Infinity is in-memory; restart = full pipeline before first paint. **Fix:** add `@tanstack/react-query-persist-client` with an OPFS/IndexedDB persister (idb-keyval or a small OPFS adapter) scoped to the analytics query key. Paint last snapshot instantly, revalidate in background.

```ts
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
const persister = createAsyncStoragePersister({ storage: idbStorage /* OPFS/IDB */ });
persistQueryClient({ queryClient, persister, maxAge: 24*60*60*1000,
  dehydrateOptions: { shouldDehydrateQuery: (q) => q.queryKey[0] === "telecom" && q.queryKey[1] === "analytics" } });
```

2. **Server-dynamic dashboard shell.** `layout.tsx` force-dynamic + `auth.api.getSession`. Confirm the auth backend is 100% local (Electron main / SQLite). If so, document it; if any path can reach the network, make session resolution offline-tolerant (cached session, no fetch on the critical path).

3. **Telecom-only home = no overview for arbitrary offline datasets.** See §4 generalization. At minimum, when no telecom dataset exists but other datasets do, render a **generic KPI overview** (row count, column count, null %, numeric column summaries) computed from DuckDB `SUMMARIZE`, so an offline user with any CSV gets a real landing page.

4. **`forecast-onnx.ts` naming** implies an ONNX/online path. Rename to `forecast.ts` (a `forecast.ts` already exists — consolidate) to avoid a future maintainer wiring a remote model. No actual offline gap, but a clarity/risk fix.

5. **Card order in localStorage** is inconsistent with the documented OPFS/Dexie storage split. Move layout prefs into the same persistence layer as other settings for consistency and to survive renderer storage clears.

6. **Notification + icon**: already permission-gated; keep, but ensure `/icon-192.png` is precached by the service worker (serwist) so it works offline.

---

## 4. Better architecture & implementation (step-by-step)

### 4.1 Make "dashboard home" actually generic (decouple from telecom)

Today `DashboardHomeScreen` *is* the telecom overview. Restructure so the home screen is a **router over dataset kind**:

```tsx
// DashboardHomeScreen.tsx (new shape)
export default function DashboardHomeScreen() {
  const datasets = useDataStore((s) => s.datasets);
  const activeId = useDataStore((s) => s.activeDatasetId);
  const active = datasets.find((d) => d.id === activeId) ?? null;

  if (!datasets.length) return <NoDatasetsLanding />;            // import CTA
  if (active && isTelecomDataset(active)) return <TelecomOverview dataset={active} />;
  return <GenericDatasetOverview dataset={active ?? datasets[0]} />; // NEW
}
```

`GenericDatasetOverview` uses DuckDB `SUMMARIZE` + a handful of aggregates to render universal KPI cards (rows, columns, null ratio, distinct counts, min/max/mean for numerics) and 2-3 auto-chosen charts (top categorical bar, numeric histogram, time-series if a date column exists). This turns the page into a true landing/KPI overview for any local dataset while preserving the rich telecom view.

```ts
// generic overview query (one round-trip)
const summary = await runReadOnlyQuery(`SUMMARIZE "<view>"`);
// → column_name, column_type, min, max, approx_unique, avg, std, null_percentage, ...
```

### 4.2 Consolidated, worker-fed analytics pipeline

```
DashboardHomeScreen
  └─ useOverviewAnalytics(datasetId)            // TanStack Query, stable key, persisted
       ├─ (renderer) DuckDB IPC: 1× rollup build (if stale) → 1× KPI/canal/status (rollup) → 1× hourly (enriched)
       └─ Comlink analytics.worker:
             buildOverviewVM(raw) → { kpiVM, insights, hourlyOption(uPlot/echarts), canalVM, statusVM, dailyVM, forecast }
  └─ OverviewTab(vm)                            // pure render of finished view-models
       ├─ KPICards (single shared rAF ticker)
       ├─ OffscreenChart (ECharts pie/donut/heatmap)  / uPlotChart (line/area)
       └─ EditMode? DraggableAutoGrid : StaticGrid
```

Key properties: DuckDB stays in Electron main (unchanged, correct), CPU transforms move to a worker, charts render off the main thread, and the VM is cached to disk for instant cold paint.

### 4.3 Hook skeleton

```ts
export function useOverviewAnalytics(datasetId: string, mapping: ColumnMapping, statusMapping: StatusMapping[]) {
  const key = useMemo(() => ["overview", datasetId, stableHash(mapping), stableHash(statusMapping)] as const,
    [datasetId, mapping, statusMapping]);
  return useQuery({
    queryKey: key,
    enabled: Boolean(datasetId),
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    placeholderData: (p) => p,
    queryFn: async () => {
      const table = await resolveViewName(datasetId);
      await ensureRollupFresh(table, mapping, statusMapping);          // build <table>_daily if stale
      const [coreRows, hourly] = await Promise.all([
        runReadOnlyQuery(coreOverviewSql(table)),                       // KPI+canal+status from rollup, 1 round-trip
        runReadOnlyQuery(hourlySql(table)),                             // hourly from enriched, 1 round-trip
      ]);
      const raw = parseCore(coreRows, hourly);
      return analyticsWorker.buildOverviewVM(raw);                      // insights+options off main thread
    },
  });
}
```

### 4.4 Chart capability + fallback ladder (no-WebGPU safe)

```
line/area  → uPlot (Canvas 2D, main or worker)            // hourly, daily-trend, success-rate
pie/donut  → ECharts via OffscreenCanvas+worker, else main-thread echarts-for-react
heatmap    → ECharts (progressive/large mode) off main thread
table      → plain DOM (small N); TanStack Table+Virtual if canal table ever grows
```
Never reach for WebGL/deck.gl on the home overview — counts are tiny (≤24 hourly points, ≤~30 canals/days). The whole screen fits comfortably in Canvas 2D, satisfying the medium-PC/no-WebGPU constraint.

---

## 5. Recommended dependencies

| Dep | ~Stars | Maint. | License | Offline | Size | Why |
|---|---|---|---|---|---|---|
| **uplot** | ~10.3k | Active (v1.6.x) | MIT | yes | ~16KB gz | Line/area/OHLC at ~10% the CPU of ECharts; ideal for hourly/daily/success-rate charts on medium PCs. |
| **echarts (OffscreenCanvas)** | ~63k | Very active (v6) | Apache-2.0 | yes | in project | Keep for pie/donut/heatmap, but move to worker via `init(offscreenCanvas)`. |
| **comlink** | ~12.6k | Active | Apache-2.0 | yes | ~1.1KB | Already a dep; glue for the analytics worker + offscreen chart workers. |
| **@tanstack/react-query-persist-client + async-storage-persister** | ~45k | Very active | MIT | yes | ~2KB | Persist analytics snapshot to OPFS/IndexedDB for instant offline cold paint. |
| **dnd-kit** (keep) | ~17.1k | Active (2026) | MIT | yes | in project | Reorder is adequate; mount lazily in edit mode only. |
| **react-grid-layout v2** (optional) | ~22.2k | Active (TS rewrite 2026) | MIT | yes | ~30KB gz | Only if resizable/breakpoint widgets become a real requirement. |
| **@stdlib/stats** (optional) | ~5.8k | Active | Apache-2.0 | yes | modular | For robust insight thresholds/anomaly flags in the worker. |

All permissive-licensed, all run with zero runtime network, all Canvas/CPU paths (no WebGPU requirement). No HOLD-list items introduced.

---

## 6. CLIs & tools (offline) to build/verify

- **sonda / @next/bundle-analyzer** — confirm echarts/motion/dnd-kit/recharts are split into lazy chunks and the home route's initial JS is small.
- **size-limit (`@size-limit/preset-app` + time)** — add `/dashboard` route budget and per-worker budgets for `analytics.worker` and `chart.worker`.
- **react-scan** — verify OverviewTab no longer re-renders all cards on a KPI/section toggle.
- **Vitest bench + tinybench** — micro-benchmark `computeAIInsights`, `movingAverage`, forecast; set a budget before/after moving to the worker.
- **@lhci/cli (Lighthouse CI)** — TBT/INP against localhost Electron; track main-thread blocking before/after OffscreenCanvas offload.
- **`window.__duckdbMetrics`** (already in dev) — count/time IPC round-trips per load; prove the consolidation (9→~3) and rollup usage.

---

## 7. Phased task list

### P1 — Correctness + cheap perf (no new deps)
- Delete the manual `runAnalytics` effect (DashboardHomeScreen 175-179); rely on `useQuery`. Memoize the query key; stop re-hashing per render.
- Remove operators/regions from the home pipeline (not rendered).
- Eliminate the double `ensureTelecomEnrichedView` (pipeline + fetchKPI).
- Fold DailyTrendChart's fetch into the pipeline; pass `daily` as a prop.
- Split `defaultCards` into per-card `React.memo` components so toggles don't rebuild chart nodes; move card order + export-toggle state into a small store/selectors.
- Gate DnD behind an explicit edit mode; static CSS grid by default.
- Reduce AnimCounter to a single shared rAF ticker; make motion entrance one-shot (`initial={false}` after mount).

### P2 — Worker offload + persistence
- Add `analytics.worker.ts` (Comlink): `computeAIInsights`, `movingAverage`, forecast, chart-option building → return finished VMs.
- Add `chart.worker.ts` + `OffscreenChart` wrapper (ECharts on OffscreenCanvas) with main-thread fallback.
- Swap hourly/daily-trend/success-rate charts to **uPlot**.
- Add `@tanstack/react-query-persist-client` with OPFS/IndexedDB persister scoped to the analytics key; instant cold paint + background revalidate.
- Consolidate KPI+canal+status into one query (prefer serving from `<table>_daily` rollup; build rollup at registration or first run).

### P3 — Generalization + polish
- Introduce `GenericDatasetOverview` (DuckDB `SUMMARIZE` + auto-charts) so any offline dataset gets a real KPI landing page; route by dataset kind in `DashboardHomeScreen`.
- Decide whether `/dashboard` index should render the home overview instead of redirecting to the telecom report (product call); if kept, make it dataset-kind aware.
- Rename/merge `forecast-onnx.ts` → `forecast.ts` to remove the misleading ONNX implication.
- Move layout/order prefs out of localStorage into the app's OPFS/Dexie persistence for consistency.
- Optional: adopt react-grid-layout v2 if resizable widgets become a requirement; add @stdlib/stats for robust insight thresholds.

---

## 8. Risks & notes

- **OffscreenCanvas availability**: Electron's bundled Chromium supports it, so the worker chart path is reliable here; still ship the main-thread fallback for non-Electron web builds (Tech Radar TRIAL path).
- **DuckDB IPC must stay renderer-side** (bridge is on `window`); the analytics worker only does CPU transforms on raw rows — do not try to move the bridge into the worker.
- **Single-day telecom reports**: the daily rollup is most valuable for multi-day datasets; for single-day reports the win is mainly from dropping operators/regions and consolidating queries — still worthwhile.
- **Verification gates**: after P1/P2, assert via `__duckdbMetrics` that per-load round-trips dropped to ≤3, via react-scan that toggles re-render only the touched card, and via Lighthouse that TBT improved. Do not claim completion without these readings.

Sources: [LogRocket – Best React chart libraries 2026](https://blog.logrocket.com/best-react-chart-libraries-2026/), [echarts-with-offscreencanvas](https://github.com/CarterLi/echarts-with-offscreencanvas), [Scott Logic – OffscreenCanvas charts](https://blog.scottlogic.com/2020/03/19/offscreen-canvas.html), [dnd-kit](https://github.com/clauderic/dnd-kit), [react-grid-layout](https://github.com/react-grid-layout/react-grid-layout), [uPlot](https://github.com/leeoniya/uPlot).