# Feature Plan — parsed-data — Parsed dataset views (Data Profile screen)

**Maturity:** functional

## Performance issues

- N columns x 2-4 SEQUENTIAL runReadOnlyQuery IPC round-trips (ParsedDataScreen.tsx:485-610): a 50-col dataset = 100-200 serial main-process queries, each a full table/Parquet scan. O(columns x scans) instead of O(1-2 scans).
- Per-column setProfiles([...profileResults]) inside the profiling loop (line 638) re-renders the entire 1977-line component on every column finishing -> dozens of full reconciliations during one profile run.
- Column list (lines 1292-1308) is NOT virtualized despite @tanstack/react-virtual being a dependency; AnimatePresence mode=popLayout animates layout for every card -> jank on wide datasets (100s of columns).
- All ECharts option objects (overviewQualityChart, typeDistChart, nullHeatmapData, histogramChart, topValuesChart) are rebuilt from scratch on every profiles change and re-rendered without notMerge/lazyUpdate; overview/heatmap plot one bar/cell PER COLUMN with rotated category labels.
- Histogram is computed in JS by issuing a separate FLOOR()-bucketed GROUP BY per numeric column (lines 568-592) plus a separate MIN/MAX/AVG/STDDEV/MEDIAN/PERCENTILE_CONT query (534-546) and a COUNT(DISTINCT) query (485-491) -- 3-4 scans/numeric column when DuckDB histogram()/SUMMARIZE do it in one scan.
- COUNT(DISTINCT col) is exact (485-491) -- expensive on high-cardinality columns; approx_count_distinct is ~constant memory and 10-100x cheaper.
- No memoization of the profiling result: leaving and returning to the route, or pressing Refresh, recomputes every scan from zero (useEffect deps activeViewName/columnDefs/refreshKey, lines 653-673). No cache keyed on dataset updatedAt.
- filteredProfiles re-sorts/re-filters a fresh [...profiles] copy on every keystroke in the search box (lines 680-738) with no debounce.
- echarts-for-react + full echarts imported via dynamic() but the whole echarts bundle is pulled in for 5 small chart types; no per-chart tree-shaken core build.
- PERCENTILE_CONT(0.25/0.75) WITHIN GROUP (exact quantiles, lines 541-542) force a sort/materialization per numeric column; approx quantiles (reservoir/t-digest via SUMMARIZE) avoid it.

## Offline gaps

- No genuine cloud dependency (good) -- echarts-for-react is dynamically imported and DuckDB is local. The main 'offline' weakness is the ABSENCE of local persistence: profiles live only in component state and are recomputed on every mount, wasting CPU that an offline desktop app should cache.
- Profiles are not written to OPFS/Dexie/the DuckDB catalog, so there is no offline-durable profile store keyed on dataset content hash / updatedAt.
- Validity is a hardcoded heuristic (type !== 'unknown' ? 0.95 : 0.5, line 530) rather than a real local format/pattern check -- no offline regex/format inference, no semantic type detection, even though all data is local and cheap to scan.
- No cancellation token passed across the IPC boundary: switching datasets sets a local 'cancelled' flag (line 670) but already-queued main-process scans keep running, wasting the local CPU budget.
- Histogram/top-values are recomputed live every time instead of being persisted alongside the profile, so an offline user re-pays scan cost for views they have already seen.

## Recommended dependencies

| Package | Category | Stars | Maint. | License | Offline | Replaces | Why | URL |
|---|---|---|---|---|---|---|---|---|
| `@tanstack/react-virtual` | UI virtualization | ~6.8k | Very active (v3.14.2, 2025) | MIT | yes | AnimatePresence popLayout over full column list | Already a project dependency but UNUSED on this screen. Virtualize the column-explorer list so 100s-1000s of columns render at 60fps instead of mounting every card. Drop AnimatePresence popLayout on the list. | https://github.com/TanStack/virtual |
| `comlink` | Worker RPC | ~12.6k | Active (GoogleChromeLabs) | Apache-2.0 | yes | main-thread profiling loop | Already a dependency. Move the profile orchestration + result post-processing (sorting, quality-dimension aggregation, ECharts option building) into a Web Worker so the renderer main thread never blocks during a profile run. | https://github.com/GoogleChromeLabs/comlink |
| `@duckdb/node-api (DuckDB SUMMARIZE / histogram / approx_top_k / approx_count_distinct)` | Analytical engine (SQL pushdown) | ~31k core / 1.5k neo | Very active (official, v1.5.x in project) | MIT | yes | per-column COUNT(DISTINCT)/MIN/MAX/PERCENTILE_CONT/FLOOR-bucket queries | Already the engine. Collapse N x 2-4 scans into ONE SUMMARIZE scan for whole-dataset stats, plus one histogram()/approx_top_k pass for selected-column detail. DuckDB 1.1+ histogram() and approx_top_k() are built-in. This is the single biggest win and needs ZERO new dependency. | https://github.com/duckdb/duckdb-node-neo |
| `apache-arrow (JS)` | Columnar interchange | ~11-15k | Very active | Apache-2.0 | yes | Record<string,unknown>[] JSON row transport | Return SUMMARIZE / histogram results as Arrow over IPC to avoid row-object JSON allocation; zero-copy into the worker for post-processing. Transitive today; make it explicit for the profile transport. | https://github.com/apache/arrow-js |
| `dexie` | Offline persistence | ~13k | Active | Apache-2.0 | yes | ephemeral component-state-only profiles | Persist computed ColProfile[] keyed by datasetId + dataset.updatedAt so revisiting the route is instant and Refresh is a true cache-bust, not a forced full recompute. Many small structured records = IndexedDB sweet spot. | https://github.com/dexie/Dexie.js |
| `echarts (core build) + custom renderer` | Charts | ~63k | Very active (Apache) | Apache-2.0 | yes | echarts-for-react full import | Replace echarts-for-react's full-bundle import with echarts/core + only BarChart/LineChart/PieChart/Heatmap + CanvasRenderer; pass notMerge=false/lazyUpdate to avoid full re-inits. Enable large/progressive mode for per-column overview/heatmap charts. | https://github.com/apache/echarts |
| `simple-statistics` | Stats (validity/semantic typing) | ~3.5k | Active (v7.9, 2026) | ISC | yes | validity = type!=='unknown'?0.95:0.5 heuristic | Back a REAL validity/anomaly score (e.g. MAD-based outlier flagging on the numeric sample, format-consistency) instead of the hardcoded 0.95/0.5 heuristic. ~30kB zero-dep, runs in the worker. | https://github.com/simple-statistics/simple-statistics |
| `uPlot` | Dense charts (optional) | ~10.2k | Active (v1.6.x) | MIT | yes | ECharts for very wide overview charts | OPTIONAL: for the per-column completeness/null overview across hundreds of columns, uPlot renders dense bar/line far cheaper than ECharts on medium CPUs. Trial behind a column-count threshold. | https://github.com/leeoniya/uPlot |

## CLIs & tools

| Tool | Type | Offline | Why | URL |
|---|---|---|---|---|
| `duckdb CLI` | cli | yes | Prototype the single-scan SUMMARIZE + histogram()/approx_top_k profile SQL against the managed Parquet cache offline before wiring it into duckdb-service.ts; validate timing with .timer on. | https://duckdb.org/docs/api/cli |
| `@next/bundle-analyzer / sonda` | cli | yes | Confirm the echarts-for-react -> tree-shaken echarts/core swap actually drops the parsed/ route chunk; treemap the dynamic chart imports. | https://github.com/filipsobol/sonda |
| `size-limit (@size-limit/preset-app + time)` | cli | yes | Add a per-route budget for the /dashboard/parsed chunk and a per-worker budget for the new profiling worker so the SUMMARIZE refactor and worker move don't regress bundle/parse time. | https://github.com/ai/size-limit |
| `react-scan` | library | yes | Prove the per-column setProfiles re-render storm before the fix and confirm it is gone after batching + worker offload + virtualization. | https://github.com/aidenybai/react-scan |
| `tinybench (via Vitest bench)` | library | yes | Micro-benchmark the worker-side post-processing (sort/filter/quality aggregation) and the SUMMARIZE-vs-per-column query path against a synthetic wide dataset. | https://github.com/tinylibs/tinybench |

---

## data-navigator — Deep Improvement Plan: `parsed-data` (Data Profile screen)

### Scope & file map

The feature is small in file count but heavy in one component:

- `src/app/dashboard/parsed/page.tsx` — 5-line route shim, renders `<ParsedDataScreen />`.
- `src/features/parsed-data/screens/ParsedDataScreen.tsx` — **1977 lines**, the entire feature: catalog loading, profiling orchestration, filtering/sorting, 5 ECharts options, detail tabs, CSV export.
- `src/features/parsed-data/model/types.ts` — `ColProfile`, `QualityDimension`.
- `src/features/parsed-data/model/profile-format.ts` — `qualityColor/qualityLabel/typeIcon/typeColor`.
- `src/features/parsed-data/components/profile-cards.tsx` — `QualityRing`, `MiniBar`, `ColCard` (note: `ColCard` is defined here but the screen actually inlines its own `ColumnListCard`), `StatGrid`.

Data layer it depends on:

- `src/platform/duckdb/duckdb.ts` — public renderer API (`listRegisteredDatasets`, `runReadOnlyQuery`, `summarizeRegisteredDataset`, …).
- `src/platform/duckdb/shared-duckdb.ts` — IPC client (`ipc()` wrapper, timeouts, `ensureReady`).
- `electron/duckdb-service.ts` — main-process engine: `summarizeDataset` (line 831, runs `SUMMARIZE SELECT *`), `runReadOnlyQuery` (line 933, validated read-only SQL), read-connection pool + read queue.
- `src/core/stores/data-store.ts` — Zustand `useDataStore` (`datasets`, `activeDatasetId`, `setActiveDataset`, `replaceDatasetsFromCatalog`).

---

## 1. Current implementation

### 1.1 Data flow

1. On mount, `refreshCatalog()` (ParsedDataScreen.tsx:430) calls `listRegisteredDatasets()` over IPC, stores the catalog, mirrors it into Zustand via `replaceDatasetsFromCatalog`, and auto-selects the first dataset.
2. `columnDefs` (line 402) is derived from the active catalog dataset's `columns[]` (name + SQL type → app type via `toProfileType`).
3. A `useEffect` (line 653) calls `computeProfiles(activeViewName, columnDefs, isCancelled)`.
4. `computeProfiles` (line 454) loops **sequentially** over every column and issues:
   - a base query: `COUNT(*), COUNT(col), COUNT(DISTINCT col)` (lines 485-491),
   - a top-values query: `GROUP BY val ORDER BY cnt DESC LIMIT 10` (lines 500-509),
   - for numeric columns: a stats query with `MIN/MAX/AVG/STDDEV_SAMP/MEDIAN/PERCENTILE_CONT(0.25)/PERCENTILE_CONT(0.75)/SUM` (lines 534-546),
   - for numeric columns with a range: a histogram query using `FLOOR((col-min)/binWidth)` GROUP BY (lines 568-576),
   - for string columns: `MIN/MAX/AVG(LENGTH(col))` (lines 596-603).
5. After **each** column it calls `setProfiles([...profileResults])` (line 638) and updates progress.
6. When done it builds `qualityDimensions` (line 644) and selects the first column.

### 1.2 Rendering

- Left aside: 4 metric cards, a search/filter/sort panel, and a column list rendered with `AnimatePresence mode="popLayout"` over `filteredProfiles` (lines 1292-1308) — **every** matching column is a `motion.div` with layout animation.
- Right section: a dataset quality overview (4 dimension cards with animated bars), a "Type Mix" pie, a per-column detail panel with 4 tabs (overview/distribution/quality/samples), and two full-width charts ("Completeness by Column" bar+line, "Null Rate Heatmap") that plot **one mark per column**.
- All 5 chart option objects are `useMemo`'d on `profiles`/`selectedProfile` but `ReactECharts` is re-rendered with a fresh `option` each time (no `notMerge`/`lazyUpdate`).

### 1.3 What works

- SQL is correctly identifier-quoted (`quoteIdentifier`, line 58) and goes through the validated read-only path.
- Progress UI + cancellation flag is wired.
- CSV export of the profile table is fully local (Blob + object URL, lines 992-1038).
- Profiling logic is read-only and offline by construction.

---

## 2. Performance bottlenecks & exact fixes

### 2.1 BOTTLENECK A — O(columns × scans) sequential IPC profiling

For a 50-column dataset with 10 numeric columns, the current loop issues roughly:
`50 base + 50 top-values + 10 numeric-stats + 10 histogram + 40 string-length ≈ 160 sequential main-process scans`, each one a separate IPC round-trip with its own queue wait. On a 1M-row managed Parquet cache this is seconds-to-minutes of avoidable work.

**Fix A1 — one `SUMMARIZE` scan for the whole dataset.** DuckDB computes `min, max, approx_unique, avg, std, q25, q50, q75, count, null_percentage` for **all columns in a single pass** (`electron/duckdb-service.ts:831` already runs `SUMMARIZE SELECT * FROM view`). Expose a dedicated profiling IPC that returns this directly instead of recomputing per column in the renderer.

```ts
// electron/duckdb-service.ts  (new, near summarizeDataset)
export async function profileDataset(rawInput: unknown) {
  const { datasetId } = DatasetOnlySchema.parse(rawInput);
  return enqueueRead(async () => {
    await ensureInit();
    const conn = getReadConnection();
    const view = quoteIdentifier(datasetViewName(datasetId));
    // 1 scan: full-column summary
    const summary = await measureRows(conn, `SUMMARIZE SELECT * FROM ${view}`);
    return { summary };
  });
}
```

`SUMMARIZE` uses `approx_unique` (HyperLogLog) and approximate quantiles, so it is dramatically cheaper than the current exact `COUNT(DISTINCT)` + `PERCENTILE_CONT` per column. Map its rows straight into `ColProfile`:

```ts
// worker side: summary row -> ColProfile
function summaryRowToProfile(r: Record<string, unknown>, index: number): ColProfile {
  const total = Number(r.count ?? 0);
  const nullPct = Number(r.null_percentage ?? 0) / 100;
  const distinct = Number(r.approx_unique ?? 0);
  const type = toProfileType(String(r.column_type ?? ""));
  return {
    name: String(r.column_name), index, type, sqlType: String(r.column_type),
    rowCount: total,
    nullCount: Math.round(total * nullPct),
    nullRate: nullPct,
    distinctCount: distinct,
    uniquenessRate: total > 0 ? distinct / total : 0,
    min: numberOrUndefined(r.min), max: numberOrUndefined(r.max),
    avg: numberOrUndefined(r.avg), stddev: numberOrUndefined(r.std),
    p25: numberOrUndefined(r.q25), median: numberOrUndefined(r.q50),
    p75: numberOrUndefined(r.q75),
    topValues: [],
    completeness: 1 - nullPct,
    uniqueness: Math.min(1, distinct / Math.max(total * 0.5, 1)),
    validity: type !== "unknown" ? 0.95 : 0.5, // replaced in 2.6
  };
}
```

This single change turns the whole-dataset overview (metric cards, quality dimensions, completeness/null charts) from ~160 scans into **1 scan**.

**Fix A2 — lazy, on-demand detail for the SELECTED column only.** Histograms, exact top-values, and string-length stats are only ever shown for one selected column at a time. Stop computing them for all columns up front. Fetch them lazily when a column is selected, in **one** query using DuckDB's native `histogram()` and `approx_top_k()` (DuckDB 1.1+; project is on 1.5.x):

```ts
// electron/duckdb-service.ts
export async function profileColumnDetail(rawInput: unknown) {
  const { datasetId, column, isNumeric } = ColumnDetailSchema.parse(rawInput);
  return enqueueRead(async () => {
    await ensureInit();
    const conn = getReadConnection();
    const view = quoteIdentifier(datasetViewName(datasetId));
    const col = quoteIdentifier(column);
    // top-k in one pass
    const top = await measureRows(conn,
      `SELECT approx_top_k(${col}, 10) AS tk FROM ${view}`);
    // equi-width histogram in one pass (numeric only)
    const hist = isNumeric
      ? await measureRows(conn,
          `SELECT histogram(${col}, bin_count := 20) AS h FROM ${view}`)
      : [];
    return { top, hist };
  });
}
```

Now selecting a column is a single scan, and the initial profile render needs **zero** per-column detail scans.

**Net effect:** initial profile = 1 scan; each column inspection = 1 scan, cached after first view.

### 2.2 BOTTLENECK B — per-column `setProfiles` re-render storm

`setProfiles([...profileResults])` inside the loop (line 638) re-renders the 1977-line component once per column — dozens of full reconciliations, each re-running every `useMemo` and re-diffing the column list. With Fix A this loop disappears, but the principle stands: **build the full `ColProfile[]` once, then set state once.**

```ts
const profiles = summary.map(summaryRowToProfile);
setProfiles(profiles);                       // single update
setQualityDimensions(buildQualityDimensions(profiles));
setSelectedCol((c) => c ?? profiles[0]?.name ?? null);
```

If incremental progress UX is still wanted, throttle UI updates to ~4/sec with a buffer rather than one-per-column.

### 2.3 BOTTLENECK C — column list not virtualized

`@tanstack/react-virtual@3.14.2` is already a dependency but unused here. Replace the `AnimatePresence popLayout` map (lines 1292-1308) with a virtualizer so wide datasets (hundreds of columns) only mount visible cards:

```tsx
function ColumnList({ profiles, selected, onSelect }: {
  profiles: ColProfile[]; selected: string | null; onSelect: (n: string) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: profiles.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 92,          // ColumnListCard height
    overscan: 8,
  });
  return (
    <div ref={parentRef} className="max-h-[calc(100vh-25rem)] overflow-y-auto pr-1">
      <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
        {rowVirtualizer.getVirtualItems().map((vi) => {
          const p = profiles[vi.index];
          return (
            <div key={p.name}
              style={{ position: "absolute", top: 0, left: 0, width: "100%",
                       transform: `translateY(${vi.start}px)` }}>
              <ColumnListCard profile={p} selected={selected === p.name}
                onClick={() => onSelect(p.name)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

Drop the layout animation on the list (keep the subtle entrance only). This removes the single biggest scroll/jank cost on wide datasets.

### 2.4 BOTTLENECK D — ECharts: full bundle + full re-init + per-column marks

- **Bundle:** `echarts-for-react` (line 40) pulls the full ECharts build for 5 simple chart types. Swap to a tree-shaken core build:

```ts
// src/features/parsed-data/charts/echarts-core.ts
import * as echarts from "echarts/core";
import { BarChart, LineChart, PieChart, HeatmapChart } from "echarts/charts";
import { GridComponent, TooltipComponent, LegendComponent,
         VisualMapComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
echarts.use([BarChart, LineChart, PieChart, HeatmapChart,
  GridComponent, TooltipComponent, LegendComponent, VisualMapComponent, CanvasRenderer]);
export { echarts };
```

Then a thin `<Chart option={...} />` wrapper that uses `echarts.init` + `setOption(option, { notMerge: false, lazyUpdate: true })` and resizes via `ResizeObserver`. This avoids re-instantiating the chart on every option change and cuts the route chunk substantially.

- **Per-column marks:** the "Completeness by Column" (line 762) and "Null Rate Heatmap" (line 857) charts render one bar/cell per column with rotated labels. For wide datasets enable progressive/large mode and cap labels:

```ts
series: [{ type: "bar", large: true, largeThreshold: 100,
           progressive: 2000, data, itemStyle: { color: "#22c55e" } }],
xAxis: { axisLabel: { interval: profiles.length > 60 ? "auto" : 0, rotate: 35 } },
```

For >~150 columns prefer uPlot (Trial) or a virtualized strip instead of one giant ECharts axis.

### 2.5 BOTTLENECK E — main-thread orchestration & post-processing

`computeProfiles`, the sort/filter in `filteredProfiles` (lines 680-738), `buildQualityDimensions`, and all 5 ECharts option builders run on the renderer main thread. Move orchestration + post-processing into a Comlink worker:

```ts
// src/features/parsed-data/worker/profile.worker.ts
import * as Comlink from "comlink";

export interface ProfileApi {
  buildProfiles(summaryRows: Record<string, unknown>[]): {
    profiles: ColProfile[]; dimensions: QualityDimension[];
  };
  filterSort(profiles: ColProfile[], q: ProfileQuery): ColProfile[];
}

const api: ProfileApi = {
  buildProfiles(rows) {
    const profiles = rows.map(summaryRowToProfile);
    return { profiles, dimensions: buildQualityDimensions(profiles) };
  },
  filterSort(profiles, q) { /* the lines 680-738 logic, off main thread */ },
};
Comlink.expose(api);
```

```ts
// hook
const worker = useMemo(() =>
  Comlink.wrap<ProfileApi>(
    new Worker(new URL("../worker/profile.worker.ts", import.meta.url),
               { type: "module" })), []);
```

The renderer only does the single `profileDataset` IPC call, hands the rows to the worker, and renders the result. Search/sort becomes a debounced worker call (150ms) so keystrokes never block paint.

### 2.6 BOTTLENECK F — exact distinct & exact quantiles

`COUNT(DISTINCT col)` and `PERCENTILE_CONT WITHIN GROUP` are exact and expensive. `SUMMARIZE` already returns `approx_unique` and approximate quantiles. If exactness is ever required for a single column, gate it behind an explicit "compute exact" action on the detail panel rather than paying it for every column on every load.

### 2.7 Debounce search

```ts
const [searchInput, setSearchInput] = useState("");
const searchQuery = useDeferredValue(searchInput); // or 150ms debounce -> worker
```

---

## 3. Offline gaps & how to close them

The feature is already offline-correct (no network calls; DuckDB and charts are local). The gaps are about **not wasting the local CPU budget** and **not enriching with cheap local computation**:

### 3.1 Persist profiles locally (Dexie)

Profiles live only in component state, so every mount and every Refresh recomputes from scratch. Cache the computed `ColProfile[]` keyed by `datasetId + dataset.updatedAt`:

```ts
// src/features/parsed-data/store/profile-cache.ts
import Dexie, { type Table } from "dexie";
interface ProfileRecord {
  key: string;            // `${datasetId}:${updatedAt}`
  datasetId: string;
  updatedAt: string;
  profiles: ColProfile[];
  dimensions: QualityDimension[];
  computedAt: number;
}
class ProfileDB extends Dexie {
  records!: Table<ProfileRecord, string>;
  constructor() { super("parsed-data-profiles");
    this.version(1).stores({ records: "key, datasetId" }); }
}
export const profileDB = new ProfileDB();

export async function loadCachedProfile(datasetId: string, updatedAt: string) {
  return profileDB.records.get(`${datasetId}:${updatedAt}`);
}
export async function saveProfile(rec: ProfileRecord) {
  await profileDB.records.put(rec);
  // prune stale versions of the same dataset
  await profileDB.records.where("datasetId").equals(rec.datasetId)
    .and((r) => r.key !== rec.key).delete();
}
```

Flow: on dataset select → `loadCachedProfile`; if hit, render instantly; if miss, run the single-scan profile, then `saveProfile`. Refresh = delete the keyed record then recompute. This makes the common "open the page again" case **instant and zero-scan** — the right behavior for an offline desktop app.

### 3.2 Real validity instead of a constant

`validity` is hardcoded (`type !== "unknown" ? 0.95 : 0.5`, line 530). With everything local, compute a real score cheaply in the worker from the SUMMARIZE row + a small reservoir sample:

- numeric: fraction within `[avg ± k·std]` and MAD-based outlier rate (via `simple-statistics`),
- string: format-consistency (regex inference for email/uuid/date-like/numeric-in-string), length-stability,
- date: parse-success rate.

Pull one cheap sample per detail view:

```sql
SELECT * FROM view USING SAMPLE reservoir(2000 ROWS);
```

This turns the "Validity" dimension and the per-column quality tab into something meaningful, fully offline.

### 3.3 Cancellation across the IPC boundary

The local `cancelled` flag (line 670) doesn't stop already-queued main-process scans. With Fix A there is only 1-2 queries so this matters far less, but for the detail path, attach an abort token and skip applying results when the active column/dataset changed (compare against a ref captured at request time).

### 3.4 Persist last-selected column / tab per dataset

Small UX win: store `selectedCol` and `activeDetailTab` per dataset in the existing Zustand persisted store so returning to a dataset restores context — no recompute, offline-durable.

---

## 4. Better architecture & implementation (step by step)

### 4.1 Target module layout

```
src/features/parsed-data/
  model/
    types.ts                 # ColProfile, QualityDimension (extend: validityDetail?)
    profile-format.ts        # unchanged
    summary-map.ts           # summaryRowToProfile, toProfileType, buildQualityDimensions
  store/
    profile-cache.ts         # Dexie cache (3.1)
  worker/
    profile.worker.ts        # Comlink: buildProfiles, filterSort, validity (2.5/3.2)
  charts/
    echarts-core.ts          # tree-shaken echarts.use(...) (2.4)
    Chart.tsx                # init + setOption(lazyUpdate) wrapper
    options.ts               # pure option builders (testable, no React)
  hooks/
    useDatasetCatalog.ts     # refreshCatalog logic extracted
    useDatasetProfile.ts     # cache -> IPC -> worker -> state orchestration
    useColumnDetail.ts       # lazy histogram/top-k per selected column
  components/
    profile-cards.tsx        # QualityRing, StatGrid, ColumnListCard (moved in)
    ColumnList.tsx           # virtualized list (2.3)
    QualityOverview.tsx
    ColumnDetail.tsx         # the 4 tabs, split out
  screens/
    ParsedDataScreen.tsx     # ~250 lines: layout + wiring only
```

The 1977-line screen drops to a thin composition root. Each extracted piece is independently testable and re-renders in isolation.

### 4.2 `useDatasetProfile` orchestration hook

```ts
export function useDatasetProfile(dataset: RegisteredDataset | null) {
  const [profiles, setProfiles] = useState<ColProfile[]>([]);
  const [dimensions, setDimensions] = useState<QualityDimension[]>([]);
  const [status, setStatus] = useState<"idle"|"loading"|"ready"|"error">("idle");
  const worker = useProfileWorker();

  useEffect(() => {
    if (!dataset) { setProfiles([]); setStatus("idle"); return; }
    let active = true;
    (async () => {
      setStatus("loading");
      // 1) cache
      const cached = await loadCachedProfile(dataset.id, dataset.updatedAt);
      if (cached && active) {
        setProfiles(cached.profiles); setDimensions(cached.dimensions);
        setStatus("ready"); return;
      }
      // 2) single-scan IPC
      const { summary } = await profileDataset({ datasetId: dataset.id });
      if (!active) return;
      // 3) worker post-process
      const { profiles, dimensions } = await worker.buildProfiles(summary);
      if (!active) return;
      setProfiles(profiles); setDimensions(dimensions); setStatus("ready");
      // 4) persist
      void saveProfile({ key: `${dataset.id}:${dataset.updatedAt}`,
        datasetId: dataset.id, updatedAt: dataset.updatedAt,
        profiles, dimensions, computedAt: Date.now() });
    })().catch(() => active && setStatus("error"));
    return () => { active = false; };
  }, [dataset?.id, dataset?.updatedAt, worker]);

  return { profiles, dimensions, status };
}
```

### 4.3 `useColumnDetail` lazy hook

```ts
export function useColumnDetail(dataset: RegisteredDataset | null, profile: ColProfile | null) {
  const [detail, setDetail] = useState<ColumnDetail | null>(null);
  useEffect(() => {
    if (!dataset || !profile) { setDetail(null); return; }
    let active = true;
    const cacheKey = `${dataset.id}:${dataset.updatedAt}:${profile.name}`;
    (async () => {
      const cached = detailMemo.get(cacheKey);
      if (cached) { setDetail(cached); return; }
      const isNumeric = profile.type === "integer" || profile.type === "float";
      const { top, hist } = await profileColumnDetail({
        datasetId: dataset.id, column: profile.name, isNumeric });
      if (!active) return;
      const parsed = parseColumnDetail(top, hist);
      detailMemo.set(cacheKey, parsed);
      setDetail(parsed);
    })();
    return () => { active = false; };
  }, [dataset?.id, dataset?.updatedAt, profile?.name]);
  return detail;
}
```

`detailMemo` is a small in-memory LRU so re-selecting a column is instant within a session; the whole-dataset profile is already Dexie-persisted.

### 4.4 Pure, testable chart option builders

Move the 5 `useMemo` option blobs into `charts/options.ts` as pure functions (`overviewOption(profiles)`, `typeMixOption(profiles)`, `nullHeatmapOption(profiles)`, `histogramOption(detail)`, `topValuesOption(detail)`). The screen just calls them; they get unit tests and can run in the worker for very wide datasets.

### 4.5 Screen becomes composition

```tsx
export default function ParsedDataScreen() {
  const { catalog, activeDataset, setActive, refresh, catalogStatus } = useDatasetCatalog();
  const { profiles, dimensions, status } = useDatasetProfile(activeDataset);
  const [selected, setSelected] = useState<string | null>(null);
  const selectedProfile = useMemo(
    () => profiles.find((p) => p.name === selected) ?? null, [profiles, selected]);
  const detail = useColumnDetail(activeDataset, selectedProfile);
  const [query, setQuery] = useState<ProfileQuery>(defaultQuery);
  const visible = useFilteredProfiles(profiles, query); // debounced worker call

  if (!activeDataset && status === "idle") return <DatasetEmptyState />;
  return (
    <ProfileLayout
      header={<ProfileHeader dataset={activeDataset} catalog={catalog}
                onSelect={setActive} onRefresh={refresh} dimensions={dimensions} />}
      aside={<>
        <MetricCards dataset={activeDataset} profiles={profiles} />
        <ColumnFilters query={query} onChange={setQuery} />
        <ColumnList profiles={visible} selected={selected} onSelect={setSelected} />
      </>}
      main={<>
        <QualityOverview dimensions={dimensions} profiles={profiles} />
        {selectedProfile && <ColumnDetail profile={selectedProfile} detail={detail} />}
        <DatasetCharts profiles={profiles} />
      </>}
    />
  );
}
```

---

## 5. Recommended dependencies

| Dep | ~Stars | Maint. | License | Offline | Why | URL |
|---|---|---|---|---|---|---|
| @tanstack/react-virtual | ~6.8k | Active v3.14.2 | MIT | yes | Already installed, unused here. Virtualize the column list. | https://github.com/TanStack/virtual |
| comlink | ~12.6k | Active | Apache-2.0 | yes | Already installed. Move orchestration + filter/sort + validity off the main thread. | https://github.com/GoogleChromeLabs/comlink |
| @duckdb/node-api (SUMMARIZE / histogram / approx_top_k) | ~31k/1.5k | Active v1.5.x | MIT | yes | Already the engine. Collapse 160 scans → 1 (overview) + 1 per selected column. Zero new dep. | https://github.com/duckdb/duckdb-node-neo |
| apache-arrow | ~11-15k | Active | Apache-2.0 | yes | Arrow transport for SUMMARIZE/detail to avoid JSON row allocation; zero-copy into worker. | https://github.com/apache/arrow-js |
| dexie | ~13k | Active | Apache-2.0 | yes | Persist profiles keyed by datasetId+updatedAt → instant revisit, true offline cache. | https://github.com/dexie/Dexie.js |
| echarts (core build) | ~63k | Active | Apache-2.0 | yes | Tree-shaken `echarts/core` + 4 charts + CanvasRenderer; `lazyUpdate`; large/progressive mode. | https://github.com/apache/echarts |
| simple-statistics | ~3.5k | Active v7.9 | ISC | yes | Real validity/outlier scoring (MAD) on a reservoir sample, in the worker. | https://github.com/simple-statistics/simple-statistics |
| uPlot (Trial) | ~10.2k | Active | MIT | yes | Optional: dense per-column overview when column count is very high. | https://github.com/leeoniya/uPlot |

All are already in the repo (virtual, comlink, duckdb, arrow transitive) or are mature, permissive, offline-safe additions (dexie, simple-statistics, uPlot). No network, no WebGPU requirement.

---

## 6. CLIs & tools (offline)

- **duckdb CLI** — prototype/benchmark the single-scan profile SQL (`SUMMARIZE`, `histogram(col, bin_count := 20)`, `approx_top_k(col, 10)`) against the managed Parquet cache with `.timer on` before wiring into `duckdb-service.ts`.
- **@next/bundle-analyzer / sonda** — verify the `echarts-for-react` → tree-shaken `echarts/core` swap drops the `/dashboard/parsed` chunk.
- **size-limit (@size-limit/preset-app + time)** — add a per-route budget for `/dashboard/parsed` and a per-worker budget for `profile.worker.ts`.
- **react-scan** — prove the per-column re-render storm before and confirm it's gone after batching + virtualization + worker offload.
- **tinybench (Vitest bench)** — micro-bench worker post-processing and the SUMMARIZE path on a synthetic wide dataset.
- **vitest + @testing-library** — unit-test pure option builders and `summaryRowToProfile`; integration-test the cache hit/miss flow with a fake IPC.

---

## 7. Phased task list

### P1 — Correctness & the big perf win (no new deps)
1. Add `profileDataset` (single `SUMMARIZE` scan) and `profileColumnDetail` (`histogram` + `approx_top_k`) to `electron/duckdb-service.ts`; expose via preload + `shared-duckdb.ts` + `duckdb.ts` with zod-validated inputs.
2. Replace the per-column loop in `ParsedDataScreen.tsx` with: 1 IPC call → map `summaryRowToProfile` → single `setProfiles`. Delete the inner `setProfiles([...])` re-render storm.
3. Make histogram/top-values/string-length **lazy** for the selected column only (`useColumnDetail`).
4. Virtualize the column list with `@tanstack/react-virtual`; drop `AnimatePresence popLayout` from the list.
5. Debounce/`useDeferredValue` the search box.

### P2 — Architecture, persistence, bundle
6. Split `ParsedDataScreen.tsx` into hooks + components (section 4.1); extract pure chart option builders.
7. Move orchestration + filter/sort into a Comlink worker (`profile.worker.ts`).
8. Add Dexie profile cache keyed by `datasetId+updatedAt`; cache hit renders instantly, Refresh busts the key.
9. Swap `echarts-for-react` for a tree-shaken `echarts/core` `<Chart>` wrapper with `lazyUpdate`; enable large/progressive mode on overview/heatmap.
10. Add size-limit per-route + per-worker budgets; verify with bundle-analyzer.

### P3 — Enrichment & polish
11. Real `validity`/anomaly scoring in the worker via `simple-statistics` on a `reservoir(2000)` sample; surface in the Quality tab.
12. Semantic-type inference (email/uuid/date-like/numeric-in-string) for richer profiles.
13. Persist last selected column + tab per dataset in Zustand.
14. Cross-IPC cancellation tokens for the detail path; LRU detail memo.
15. Optional uPlot path for very wide (>150 column) overview charts; unit tests for option builders + cache flow; react-scan/tinybench regression checks in CI.

**Perf budget targets after P1/P2:** initial profile ≤ 1 DuckDB scan; revisit (cache hit) = 0 scans, < 50ms to interactive; column select ≤ 1 scan (cached after first); column list at 60fps for 1000+ columns; main thread never blocked > 16ms during profiling (work in worker/main-process).