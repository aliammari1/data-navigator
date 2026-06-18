# Feature Plan — telecom

**Maturity:** functional

## Performance issues

- Enriched layer is a VIEW (createTelecomEnrichedView, queries.ts:1075), so every KPI/period/canal query re-evaluates the heavy CASE expressions (statusNorm, canalCaseExpr, date/hour parsing) over the FULL table — there is no materialized table on the hot path. The daily-agg TABLE (createTelecomDailyAgg, queries.ts:1122) exists but is NOT wired into fetchKPI/fetchPeriodKPI/fetchHourly, so its pre-aggregation benefit is unused.
- DuckDB results cross the Electron IPC boundary as JSON-serialized arrays of plain row objects (runReadOnlyQuery -> shared-duckdb.ts:407 -> duckdbBridge). For wide raw rows this means structured-clone + JSON cost on the renderer main thread; no Arrow IPC / transferable ArrayBuffer path exists despite DuckDB Neo supporting arrowIPCStream.
- DataGrid (data-grid.tsx) has NO row virtualization — it relies on 50-row server pages. The Raw Data tab cannot smoothly scroll large windows, and increasing PAGE_SIZE would render N*13 DOM nodes synchronously. No @tanstack/react-virtual is used anywhere in telecom.
- fetchFiltered (queries.ts:758) runs a fresh COUNT(*) over the whole filtered table on EVERY page change and every sort change (Promise.all with the data query). Count is invariant across pages/sorts for the same filter, so this is a full-table scan repeated on pagination.
- ECharts charts (overview-tab.tsx via echarts-for-react, and chart-options.ts) are configured without large/largeThreshold/progressive/sampling and without OffscreenCanvas+Worker rendering. Daily-trend/hourly/scatter on big ranges rasterize on the renderer main thread.
- Day Analytics tab (day-analytics-tab.tsx) fetches per-day KPIs in an awaited loop (await fetchPeriodKPI per day, ~line 89) instead of a single GROUP BY day query or Promise.all — N sequential IPC round-trips for N days.
- Spec stats (fetchSpecChannelStats/fetchSpecStatusStats/fetchSpecUnitAmountStats, queries.ts:846-995) issue one COUNT query PER channel / PER status via Promise.all (10-20+ separate full scans) instead of a single grouped CASE-aggregation pass over one table scan.
- Export panel (export-panel.tsx, 1250 lines) builds PDF with jspdf + jspdf-autotable on the renderer main thread (queries.ts HOLD lib; OOMs/hangs past a few k rows). Even though it exports aggregates today, any raw-row export path will block the UI thread.
- computeAIInsights / detectHourlyAnomalies / linearRegression (insights.ts) run on the main thread; fine for tiny aggregated arrays today but will block if pointed at per-transaction series (anomaly timeline, deep-analysis).
- analytics-cache.ts decompresses ALL cached entries to build the history list (getCachedAnalyticsEntries decompresses every blob just to read kpi.totalTransactions) — should store a tiny uncompressed meta record instead of inflating every payload.

## Offline gaps

- forecastNextHours (forecast-onnx.ts) and the AI insight/narrative paths depend on local models — verify the ONNX/LLM weights are bundled or cached-once in OPFS/IndexedDB and that there is a deterministic in-house fallback (Holt-Winters/EWMA) when no model/WebGPU is present, so the telecom forecast never silently no-ops offline.
- computeAnalytics calls new Notification(...) and reads Notification.permission (use-telecom-analytics.ts:198) — harmless offline but assumes a permission flow; ensure it degrades silently when notifications are denied/unavailable.
- broadcast(...) ANALYTICS_READY (channel.ts via BroadcastChannel) is local-only (good), but the LAN collab panel (lan-collab-panel.tsx, platform/lan/lan-collab.ts) must be confirmed to use only LAN/localhost (mDNS + bundled signaling) and never a public STUN/signaling server.
- Icon/asset reference in the Notification (icon: '/icon-192.png') and any echarts web-font/symbol assets must be bundled, not fetched.
- No materialized OPFS/Parquet cache of the enriched+daily-agg tables is persisted across app restarts for the telecom dataset, so each cold start re-derives them; persist them on disk (Electron main) keyed by dataset fingerprint to stay instant fully offline.

## Recommended dependencies

| Package | Category | Stars | Maint. | License | Offline | Replaces | Why | URL |
|---|---|---|---|---|---|---|---|---|
| `@tanstack/react-virtual` | grid virtualization | ~5.5k | Very active (TanStack) | MIT | yes | manual 50-row pagination in data-grid.tsx | Headless row/column virtualization to pair with the existing TanStack Table model so the Raw Data grid can window 50k-100k rows with sticky header + smooth scroll instead of 50-row server pages. Already in the radar Adopt list. | https://github.com/TanStack/virtual |
| `glide-data-grid` | canvas data grid | ~5.2k | Active (verified Feb 2026 releases/issues, MIT) | MIT | yes | DOM table at scale | Canvas-rendered grid for the 100k-millions row tier / streaming raw-data view beyond TanStack DOM comfort zone; lazy cell rendering keeps the main thread free. Trial behind a flag for the Raw Data + Period drill-down tables. | https://github.com/glideapps/glide-data-grid |
| `uPlot` | dense time-series charts | ~10.2k | Active; v1.6.x | MIT | yes | ECharts for dense line/area/OHLC | 166k points in ~25ms, ~10% CPU streaming vs ECharts ~70% — ideal for the daily-trend, hourly, success-rate-trend, and anomaly-timeline charts on long date ranges on a medium PC. Add alongside ECharts (keep ECharts for heatmaps/pies). | https://github.com/leeoniya/uPlot |
| `comlink` | worker RPC | ~12.6k | Active (GoogleChromeLabs) | Apache-2.0 | yes | main-thread compute in insights.ts | ~1.1kB Proxy worker glue to move insights/anomaly/regression and any raw-row post-processing + OffscreenCanvas chart rasterization off the renderer main thread. Radar Adopt; likely already a transitive dep. | https://github.com/GoogleChromeLabs/comlink |
| `apache-arrow (JS)` | columnar interchange | ~11-15k | Very active | Apache-2.0 | yes | JSON row-array IPC payloads | Transfer DuckDB Neo results as Arrow IPC (transferable ArrayBuffer) across the Electron IPC boundary instead of JSON row objects — zero-copy to charts/grid, big win for wide raw-row windows. DuckDB added first-class Arrow IPC streaming (2025). | https://github.com/apache/arrow |
| `@uwdata/flechette` | lightweight Arrow reader | ~0.1k | Active (UW IDL, same lab as Arquero) | BSD-3-Clause | yes | apache-arrow in renderer read path | ~14kB gz Arrow reader (vs ~43kB apache-arrow) for the renderer side if you only need to read Arrow IPC into typed columns for charts/grid — shrinks renderer bundle. Trial. | https://github.com/uwdata/flechette |
| `pdfmake` | PDF export | ~12.3k | Active; v0.3.x | MIT | yes | jspdf + jspdf-autotable in export-panel.tsx | Declarative JSON layout that auto-paginates large tables; replaces jspdf-autotable (HOLD — OOMs past a few k rows) for any data-driven/raw-row telecom export. Run in a worker/Electron main. | https://github.com/bpampuch/pdfmake |
| `simple-statistics` | stats | ~3.5k | Active; v7.x (2026) | ISC | yes | hand-rolled regression in insights.ts | Zero-dep descriptive stats / regression / MAD to back the in-house anomaly + risk-score logic in insights.ts deterministically (no model needed), runnable inside the worker. Radar Adopt. | https://github.com/simple-statistics/simple-statistics |

## CLIs & tools

| Tool | Type | Offline | Why | URL |
|---|---|---|---|---|
| `DuckDB CLI` | cli | yes | Offline EXPLAIN ANALYZE on the exact telecom SQL (KPI/spec/period queries) to verify the materialized-table refactor actually prunes scans and to measure per-query ms on a representative Parquet cache. | https://github.com/duckdb/duckdb |
| `size-limit (+ @size-limit/preset-app, time plugin)` | cli | yes | Set per-route budgets for /dashboard/telecom-report/* and per-worker budgets (echarts, uplot, pdfmake, arrow) so the telecom lazy chunks stay small; runs fully offline. Already in repo. | https://github.com/ai/size-limit |
| `react-scan` | library | yes | Detect unnecessary re-renders in the heavy overview-tab / draggable grid / chart trees and the runtime context provider (large context value re-renders all consumers). Install as dep, not CDN. | https://github.com/aidenybai/react-scan |
| `tinybench (via Vitest bench)` | library | yes | Microbenchmark the hot data paths (statusNorm CASE vs materialized column, JSON-row vs Arrow decode, insights compute) offline in CI as a regression report. Already in repo. | https://github.com/tinylibs/tinybench |
| `@lhci/cli (Lighthouse CI)` | cli | yes | Run LCP/INP/CLS audits against localhost for each telecom route with assertions, fully offline (no cloud upload), to gate the virtualization + worker-rendering work. | https://github.com/GoogleChrome/lighthouse-ci |
| `@next/bundle-analyzer / sonda` | cli | yes | Offline treemap to confirm echarts-for-react / pdfmake / exceljs / arrow land in lazy chunks and never in the initial telecom route bundle. | https://github.com/filipsobol/sonda |

---

# Telecom Report — Deep Improvement Plan

Scope: `src/features/telecom/` and route `src/app/dashboard/telecom-report/` (overview, period, canals, grid, day, analysis, history, config). Hard constraints: offline-only, medium-end PC (4-8 cores, 8-16GB RAM, WebGPU often absent), mature/trending permissive deps.

---

## 1. Current implementation

### 1.1 Data engine path (good foundation)
- DuckDB runs in the **Electron main process** (`src/platform/duckdb/shared-duckdb.ts` -> `duckdbBridge()` IPC -> `electronDuckDB` preload). The renderer never runs DuckDB itself, so query *execution* is already off the renderer main thread. This matches the radar's "two-process discipline" and is the single most important thing already correct.
- The only renderer entry point is `runReadOnlyQuery(sql)` (`src/platform/duckdb/duckdb.ts:152` -> `shared-duckdb.ts:407`) with a 60s timeout. Results return as `Record<string, unknown>[]` (plain JS row objects).
- Datasets are CSV -> managed Parquet cache -> exposed as a stable view (`RegisteredDataset.viewName`). Telecom resolves the active table via `getDatasetViewName(...)` (`telecom-report-runtime.tsx:174`).

### 1.2 Telecom SQL layer
- `src/features/telecom/lib/queries.ts` (1139 lines) is the query hub. It builds CASE expressions for status normalization (`statusNorm`), canal classification (`canalCaseExpr`), and date/hour parsing (`transactionDateExpr`, `transactionHourExpr`) from `src/features/telecom/lib/sql.ts`.
- An **enriched VIEW** is created per dataset (`createTelecomEnrichedView`, `queries.ts:1060` -> `CREATE OR REPLACE VIEW ..._enriched`) adding `_status_norm`, `_canal`, `_txn_date/_txn_hour/_txn_day`, `_amount`, `_proc_ms`, `_customer_id`, `_error_code`. `ensureTelecomEnrichedView` (`queries.ts:1091`) memoizes creation by mapping+status hash.
- A **daily-agg TABLE** exists (`createTelecomDailyAgg`, `queries.ts:1122` -> `CREATE OR REPLACE TABLE ..._daily`) grouping by day/canal/status — but it is **not referenced** by `fetchKPI`, `fetchPeriodKPI`, `fetchHourly`, or `fetchDailyTrend`. Dead on the hot path.
- KPI: `fetchKPI` (`queries.ts:153`) prefers the enriched view, else rebuilds CASE in a CTE. Period KPI: `fetchPeriodKPI` (`period-queries.ts:77`) same pattern. Spec stats: `fetchSpecChannelStats/StatusStats/UnitAmountStats` (`queries.ts:846-995`) issue **one COUNT per channel/status** via `Promise.all` (10-20+ scans).
- Raw rows: `fetchFiltered` (`queries.ts:758`) builds a WHERE from `FilterState`, runs `COUNT(*)` + `SELECT * ... LIMIT 50 OFFSET n` in `Promise.all`.

### 1.3 React / hooks layer
- `useTelecomAnalytics` (`hooks/use-telecom-analytics.ts`) wraps everything in one TanStack Query keyed by `[telecom, analytics, table, hash(mapping), hash(statusMapping)]`, `staleTime: Infinity`, `placeholderData: previous`. `computeAnalytics` does: existence check -> `ensureTelecomEnrichedView` -> `Promise.all([KPI, hourly, status])` -> `Promise.all([canals, operators, regions])` -> `forecastNextHours` -> optional distinct-status discovery -> Notification + BroadcastChannel.
- `TelecomReportRuntimeProvider` (`components/telecom-report-runtime.tsx`, 1019 lines) is a big React context exposing ~30 fetchers + all analytics state. Every consumer re-renders when this value changes.
- Charts: `overview-tab.tsx` (844 lines) lazy-loads chart components via `next/dynamic` (`echarts-for-react`, plus amount-pie, canal-share, daily-trend, hourly, status-donut, success-rate-trend). Good code-splitting; **no ECharts perf flags**.
- Grid: `data-grid.tsx` uses `@tanstack/react-table` headless model with `manualPagination`/`manualSorting`, 50-row pages, **no virtualization**.
- Cache: `analytics-cache.ts` stores compressed analytics payloads in IndexedDB keyed by `name|size|lastModified`, plus source-file blobs (max 5) and a localStorage "latest meta".
- Insights: `lib/insights.ts` computes anomalies (z-score on 24 hourly buckets), canal risk score, linear regression, narrative — all on **tiny aggregated arrays** on the main thread (fine today).

### 1.4 Day / Period tabs
- `day-analytics-tab.tsx` fetches available days then, for each day, awaits `fetchPeriodKPI` in a loop (~line 89) — sequential IPC round-trips.
- `period-studio-tab.tsx` fetches `fetchPeriodKPI` + `fetchBrandBreakdown` for an applied range; render maps are small.

---

## 2. Performance bottlenecks and exact fixes

### 2.1 Materialize the enriched layer as a TABLE, not a VIEW  (biggest single win)
Today every KPI/period/canal/hourly query re-evaluates `statusNorm` (a long CASE), `canalCaseExpr` (10-branch CASE), and date/hour `TRY_STRPTIME`/`SPLIT_PART` parsing over the **entire** dataset, because `_enriched` is a VIEW (`queries.ts:1075`). On a multi-million-row Parquet cache this re-parses dates and re-runs regex-ish string ops on every tab switch.

Fix: build a materialized enriched table once per dataset fingerprint, persisted to the Parquet cache so it survives restarts. Run in Electron main.

```ts
// queries.ts — replace VIEW with a materialized TABLE (+ projection pruning)
export async function materializeTelecomEnriched(
  tableName: string, m: ColumnMapping, sm: StatusMapping[],
): Promise<void> {
  const enriched = enrichedViewName(tableName);
  await runReadOnlyQuery(`
    CREATE OR REPLACE TABLE ${qc(enriched)} AS
    SELECT
      ${statusNorm(m, sm)}                              AS _status_norm,
      ${canalCaseExpr(m)}                               AS _canal,
      ${transactionDateExpr(m.transactionDate)}         AS _txn_date,
      ${transactionHourExpr(m.transactionDate)}         AS _txn_hour,
      DATE_TRUNC('day', ${transactionDateExpr(m.transactionDate)}) AS _txn_day,
      TRY_CAST(${colExpr(m.amount)} AS DOUBLE)          AS _amount,
      TRY_CAST(${colExpr(m.processingTimeMs)} AS DOUBLE) AS _proc_ms,
      CAST(${colExpr(m.msisdn)}    AS VARCHAR)          AS _customer_id,
      CAST(${colExpr(m.errorCode)} AS VARCHAR)          AS _error_code,
      CAST(${qc(m.region)}   AS VARCHAR)                AS _region,
      CAST(${qc(m.operator)} AS VARCHAR)                AS _operator,
      -- keep only columns the Raw Data grid actually shows + ids needed for drill-down
      ${qc(m.serviceName)}, ${qc(m.transactionType)}, ${qc(m.serviceCode)}
    FROM ${qc(tableName)}
  `);
  // Persist to disk so a restart is instant (Electron main writes Parquet next to the cache).
}
```

Then point every aggregate at the typed columns (no CASE):

```ts
// fetchKPI fast path — already mostly there, but guarantee the TABLE branch:
SELECT COUNT(*) AS total,
  COUNT(*) FILTER (WHERE _status_norm='SUCCESS') AS success_count,
  ... MODE(_txn_hour) AS peak_hour, MODE(_error_code) AS top_error
FROM ${qc(enriched)}   -- now a physical table: integer/double columns, no string parsing
```

Expected: KPI / period / hourly drop from "full scan + CASE/strptime per row" to a columnar scan over pre-typed columns. On medium hardware this is commonly 3-10x on the aggregate queries and removes repeated date-parse cost on every tab switch.

Refresh discipline: rebuild only when `enrichmentKey(m, sm)` changes (you already track this in `enrichmentKeys`); otherwise reuse the persisted table.

### 2.2 Wire the daily-agg TABLE into KPI/period/trend (it already exists, unused)
`createTelecomDailyAgg` (`queries.ts:1122`) produces `(day, canal, status, cnt, amount, avg_proc_ms, unique_customers)`. Route range/day/trend queries through it:

```ts
// fetchDailyTrend / fetchPeriodKPI over a date range can sum the tiny daily table:
SELECT day,
  SUM(cnt)                                   AS total,
  SUM(cnt) FILTER (WHERE status='SUCCESS')   AS success,
  SUM(cnt) FILTER (WHERE status='DECLINED')  AS declined,
  SUM(amount)                                AS amount
FROM ${qc(dailyAggTableName(tableName))}
WHERE day BETWEEN ... GROUP BY day ORDER BY day;
```
This turns the daily trend and period KPI from a full-table scan into a scan of (#days * #canals * #statuses) rows — typically a few thousand. Note: `unique_customers` is non-additive (APPROX_COUNT_DISTINCT), so keep the exact distinct count on the enriched table only when the UI actually shows it.

### 2.3 Single-pass spec stats (collapse 10-20 scans into 1)
`fetchSpecChannelStats` runs one COUNT per channel; `fetchSpecStatusStats` one per status. Replace with one grouped pass using conditional aggregation:

```ts
// One scan, conditional SUMs per channel:
const channelCols = channels.map((ch, i) =>
  `SUM(CASE WHEN (${ch.condition}) THEN 1 ELSE 0 END) AS n_${i},
   SUM(CASE WHEN (${ch.condition}) THEN TRY_CAST(${amountExpr} AS DOUBLE) ELSE 0 END) AS m_${i}`
).join(",\n");
const [row] = await runReadOnlyQuery(
  `SELECT ${channelCols} FROM ${qc(tableName)} WHERE ${successFilter}${df}`,
);
// then read n_0..n_k / m_0..m_k back into SpecChRow[]
```
10-20 IPC round-trips + 10-20 scans -> one. This is the Period/Config "spec tables" hot path.

### 2.4 Don't re-COUNT on every page / sort in the grid
`fetchFiltered` re-runs `COUNT(*)` with each page and sort, but the count only depends on the filter. Split it:

```ts
// queries.ts
export async function fetchFilteredCount(tableName, m, f, sm): Promise<number> {
  // build WHERE only; cache by hash(filter) in TanStack Query
}
export async function fetchFilteredPage(tableName, m, f, sm, limit, offset, sortCol, sortDir) {
  // SELECT ... LIMIT OFFSET only — no COUNT
}
```
In the grid, key the count query separately so pagination/sort reuse it:
```ts
const { data: total } = useQuery({ queryKey: ['tc','count',table,hash(filters)],
  queryFn: () => fetchFilteredCount(...), staleTime: Infinity });
```

### 2.5 Virtualize the Raw Data grid
Replace 50-row pages with windowed scrolling over larger server pages using `@tanstack/react-virtual` (keeps the existing TanStack Table model). Sketch:

```tsx
const parentRef = useRef<HTMLDivElement>(null);
const rowVirtualizer = useVirtualizer({
  count: table.getRowModel().rows.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 32,
  overscan: 12,
});
return (
  <div ref={parentRef} className="h-[70vh] overflow-auto">
    <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
      {rowVirtualizer.getVirtualItems().map(v => {
        const row = table.getRowModel().rows[v.index];
        return (
          <div key={row.id} style={{ position:'absolute', top:0, transform:`translateY(${v.start}px)` }}
               className="flex">
            {row.getVisibleCells().map(c => (
              <div key={c.id} className="px-3 py-1.5 truncate" style={{ width: 140 }}>
                {flexRender(c.column.columnDef.cell, c.getContext())}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  </div>
);
```
For the 100k-millions tier (and streaming), trial **glide-data-grid** (canvas, lazy cells) behind a feature flag and feed it pages via a `getCellContent` that pulls from a sliding window cache keyed by row index -> server page.

### 2.6 Arrow IPC across the Electron boundary (kill JSON serialization)
DuckDB Neo + DuckDB 1.3+ support Arrow IPC streaming. For wide raw-row windows, return a transferable `ArrayBuffer` (Arrow IPC) instead of `Record<string,unknown>[]`:

```ts
// preload/main: add an IPC method that returns Arrow IPC bytes
async runReadOnlyQueryArrow(sql: string): Promise<ArrayBuffer> {
  const reader = await connection.runAndReadAll(sql); // DuckDB Neo
  return reader.getRowObjectsArrowIpc?.() ?? toArrowIpc(reader);
}
```
```ts
// renderer: decode with flechette (lighter) or apache-arrow, hand columns straight to grid/charts
import { tableFromIPC } from '@uwdata/flechette';
const buf = await bridge.runReadOnlyQueryArrow(sql); // transferable, no JSON
const tbl = tableFromIPC(new Uint8Array(buf));
```
Zero-copy columnar transport; the renderer never JSON-parses N*cols cells. Use this specifically on `fetchFilteredPage` and any large drill-down; keep JSON for tiny aggregate rows where it doesn't matter.

### 2.7 ECharts: enable large-mode + OffscreenCanvas worker rendering
The dense charts (daily-trend, hourly, success-rate-trend, anomaly-timeline) should set:
```ts
series: [{ type: 'line', large: true, largeThreshold: 2000,
           sampling: 'lttb', progressive: 4000, progressiveThreshold: 5000, ... }]
```
And for the heaviest charts, render in a Worker via OffscreenCanvas (ECharts supports it) so rasterization never blocks scroll:
```ts
// chart.worker.ts
import * as echarts from 'echarts';
let chart;
onmessage = ({ data }) => {
  if (data.canvas) chart = echarts.init(data.canvas, null, { width: data.w, height: data.h });
  if (data.option) chart.setOption(data.option, true);
};
// component: const off = canvasRef.current.transferControlToOffscreen();
// worker.postMessage({ canvas: off, w, h }, [off]);
```
Better still for pure time-series: swap daily-trend/hourly/success-rate-trend to **uPlot** (166k pts ~25ms, ~10% CPU vs ECharts ~70%). Keep ECharts for heatmap/pie/donut/geo.

### 2.8 Day Analytics: one query instead of N
Replace the per-day awaited loop (`day-analytics-tab.tsx:~89`) with a single grouped query (ideally over the daily-agg table):
```ts
SELECT _txn_day AS day, COUNT(*) total,
  COUNT(*) FILTER (WHERE _status_norm='SUCCESS') success, SUM(_amount) amount
FROM ${qc(enriched)} WHERE _txn_day IS NOT NULL GROUP BY 1 ORDER BY 1;
```
Then build per-day cards from the in-memory result. Removes N sequential IPC round-trips.

### 2.9 Move main-thread compute into a worker (Comlink)
`computeAIInsights`, `detectHourlyAnomalies`, `linearRegression`, narrative generation, and any future per-transaction anomaly series should run in a worker exposed via Comlink, returning small JSON. Back the math with `simple-statistics` (MAD/z-score/regression) for determinism offline. Today's inputs are tiny, but the anomaly-timeline / deep-analysis panels will grow — isolate them now.

### 2.10 Shrink the runtime context re-render surface
`TelecomReportRuntimeProvider` exposes ~30 fetchers + all state in one context value. Split into two contexts: a stable **actions** context (fetchers, memoized once) and a **data** context (kpi/canals/...). Consumers that only call fetchers won't re-render on data changes. Verify with react-scan.

### 2.11 Analytics history without inflating every blob
`getCachedAnalyticsEntries` decompresses every cached payload just to read `kpi.totalTransactions`/`successRate`. Store a tiny uncompressed meta record (`{key, savedAt, fileName, totalTransactions, successRate}`) in a separate store and read that for the history list; decompress only the one entry the user opens.

---

## 3. Offline gaps and how to close them

1. **Forecast / AI fallback**: `forecastNextHours` (`platform/browser/forecast-onnx.ts`) and insight/narrative paths must have a deterministic in-house fallback (Holt-Winters / EWMA, ~150 lines in the insights worker) when the ONNX model or WebGPU is unavailable. Ensure model weights are bundled or cached-once in OPFS/IndexedDB and never fetched at runtime.
2. **Notification path**: `new Notification(...)` + `Notification.permission` (`use-telecom-analytics.ts:198`) and `icon:'/icon-192.png'` must degrade silently when denied/unavailable and the icon must be bundled.
3. **LAN collab**: confirm `lan-collab-panel.tsx` / `platform/lan/lan-collab.ts` use only mDNS + locally-bundled signaling / localhost hub (radar: Hocuspocus-in-Electron or y-webrtc with bundled signaling) and never public STUN.
4. **Persist derived tables**: write the materialized `_enriched` and `_daily` tables to the on-disk Parquet cache keyed by dataset fingerprint so cold start is instant fully offline (no re-derivation).
5. **Chart/font assets**: ensure ECharts symbol/web-font assets and any uPlot CSS are bundled.

---

## 4. Better architecture & implementation (step by step)

1. **Persisted derived layer (main process).** On dataset registration / mapping change, build `_enriched` (materialized, projection-pruned) and `_daily` once, persist both to disk. Expose a `prepareTelecomDataset(datasetId, mapping, statusMapping)` IPC that returns when ready. The renderer's `ensureTelecomEnrichedView` becomes "ensure prepared" and resolves instantly on revisit.
2. **Query layer split.** Refactor `queries.ts` so each aggregate has a clear "fast (typed table) path" and only falls back to CASE when no derived table exists. Collapse spec/status/unit-amount into single-scan conditional aggregations.
3. **Result transport.** Add `runReadOnlyQueryArrow(sql) -> ArrayBuffer` for large row windows; decode with flechette in the renderer; keep JSON for small aggregates.
4. **Grid.** Phase 1: virtualize TanStack table with `@tanstack/react-virtual` + split count query. Phase 2 (flagged): glide-data-grid canvas for the millions tier with windowed Arrow fetches.
5. **Charts.** Add ECharts large/progressive/sampling now; migrate the three dense time-series charts to uPlot; OffscreenCanvas-worker the heaviest remaining ECharts.
6. **Compute.** Comlink worker for insights/anomaly/regression/narrative, backed by simple-statistics; in-house Holt-Winters forecast fallback.
7. **Export.** Replace jspdf-autotable with pdfmake, run export generation in a worker / Electron main, stream to disk; never screenshot charts — use `echarts.getDataURL()` / serialize recharts/uPlot SVG.
8. **Context.** Split actions vs data contexts; memoize the actions object.

---

## 5. Recommended dependencies

| Dep | ~Stars | Maint. | License | Offline | Why | URL |
|---|---|---|---|---|---|---|
| @tanstack/react-virtual | 5.5k | Very active | MIT | yes | Virtualize Raw Data grid to 50-100k rows over the existing Table model | https://github.com/TanStack/virtual |
| glide-data-grid | 5.2k | Active (Feb 2026 releases) | MIT | yes | Canvas grid for 100k-millions row tier / streaming, lazy cells | https://github.com/glideapps/glide-data-grid |
| uPlot | 10.2k | Active | MIT | yes | Dense daily/hourly/success-trend/anomaly charts, ~10% CPU streaming | https://github.com/leeoniya/uPlot |
| comlink | 12.6k | Active (Google) | Apache-2.0 | yes | Move insights/anomaly + OffscreenCanvas off main thread | https://github.com/GoogleChromeLabs/comlink |
| apache-arrow | 11-15k | Very active | Apache-2.0 | yes | Arrow IPC transport for large row windows (zero-copy) | https://github.com/apache/arrow |
| @uwdata/flechette | ~0.1k | Active (UW IDL) | BSD-3-Clause | yes | ~14kB Arrow reader for renderer decode path | https://github.com/uwdata/flechette |
| pdfmake | 12.3k | Active | MIT | yes | Auto-paginating PDF export, replaces jspdf-autotable (OOM) | https://github.com/bpampuch/pdfmake |
| simple-statistics | 3.5k | Active (v7, 2026) | ISC | yes | Deterministic MAD/z-score/regression in the insights worker | https://github.com/simple-statistics/simple-statistics |

Keep (already correct): @duckdb/node-api (native main), ECharts (heatmap/pie/geo), @tanstack/react-table, exceljs (streaming XLSX), TanStack Query, the Electron-main DuckDB IPC design.

---

## 6. CLIs & tools (offline)

- **DuckDB CLI** — `EXPLAIN ANALYZE` the KPI/spec/period SQL on a representative Parquet cache to verify the materialized-table refactor prunes scans and to measure ms.
- **size-limit (+ preset-app + time)** — per-route budgets for `/dashboard/telecom-report/*`, per-worker budgets (echarts, uplot, pdfmake, arrow).
- **react-scan** — find unnecessary re-renders in overview-tab / draggable grid / runtime context.
- **tinybench (Vitest bench)** — benchmark CASE-view vs materialized-table, JSON-row vs Arrow decode.
- **@lhci/cli** — offline LCP/INP/CLS audits vs localhost per route.
- **@next/bundle-analyzer / sonda** — confirm echarts/pdfmake/exceljs/arrow stay in lazy chunks.

All run fully offline against localhost / bundled Chromium.

---

## 7. Phased tasks

**P1 — biggest wins, low risk**
- Materialize `_enriched` as a persisted TABLE (projection-pruned); make every aggregate use the typed columns; persist + reuse by fingerprint (sec 2.1, 4.1-4.2).
- Wire the existing `_daily` table into daily-trend / period-range KPI (2.2).
- Split `fetchFiltered` into separate count + page queries; cache count by filter hash (2.4).
- Collapse spec/status/unit-amount into single-scan conditional aggregation (2.3).
- Replace per-day await loop in Day Analytics with one grouped query (2.8).
- Add ECharts `large`/`progressive`/`sampling` to dense charts (2.7).

**P2 — structural perf**
- Virtualize Raw Data grid with `@tanstack/react-virtual` + larger server pages (2.5).
- Arrow IPC transport (`runReadOnlyQueryArrow`) + flechette decode for large windows (2.6).
- Migrate daily-trend/hourly/success-rate-trend to uPlot; OffscreenCanvas-worker remaining heavy ECharts (2.7).
- Comlink worker for insights/anomaly/regression + simple-statistics; in-house forecast fallback (2.9, 3.1).
- Split runtime context into actions vs data; verify with react-scan (2.10).
- Analytics history meta store (no full decompress) (2.11).

**P3 — scale + polish**
- glide-data-grid canvas tier (flagged) with windowed Arrow fetches for millions of rows (2.5).
- Replace jspdf-autotable with pdfmake; run export in worker/main, stream to disk; native chart->image (4.7).
- size-limit per-route/worker budgets + tinybench regression report in CI (sec 6).
- Persist derived tables across restarts; verify offline cold-start is instant (3.4).