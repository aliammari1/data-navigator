# Feature Plan — data-browser

**Maturity:** functional

## Performance issues

- 3128-line monolithic client component (DataBrowserScreen.tsx) — every keystroke/hover/scroll re-runs the entire render tree; no React.memo on rows or cells, no useDeferredValue, no decomposition.
- fetchRows useCallback depends on the whole columns array, filterGroup object, sorts, page, pageSize, activeTable — hiding/resizing a column invalidates it and re-fires both a COUNT(*) and a data query.
- OFFSET-based pagination (LIMIT n OFFSET page*pageSize) — DuckDB Top-N materializes n+offset rows; deep pages on millions of rows balloon memory toward OOM and degrade linearly. Keyset/seek pagination is the fix.
- COUNT(*) recomputed on EVERY fetchRows call even when only sort changed; should be cached per (table+filter) and run in parallel with the data query.
- Rows cross Electron IPC as JSON Record<string,unknown>[] (getRowObjectsJS + structured clone), not Arrow IPC buffers — row<->object transposition + serialization is the dominant cost for wide/large results.
- Client-side Fuse.js fuzzy search re-instantiated on every rows/columns/query change and only searches the current 50-row page — wrong results AND a per-change main-thread index rebuild.
- columnRanges heatmap + selectionStats do O(rows*cols) JS passes in render on every relevant state change on the main thread.
- ExcelJS/CSV/JSON export runs on the renderer main thread over only the in-memory current page, building a giant Blob — freezes UI and silently exports the visible page, not the full filtered dataset.
- Cards view renders rows.map of motion.div with per-item transition delay i*0.01 and no virtualization; analytics recreates large ECharts option objects without OffscreenCanvas.
- Column resize uses setColumns(produce(...)) on every mousemove — a full columns array clone + re-render per pixel of drag.
- ECharts (echarts-for-react) is statically imported at module top (~1MB) so it ships in the browser route initial chunk even for users who never open the Charts tab.
- Cell-level state (focusedCell/editingCell/editValue/editedCells) lives in the parent — editing one cell re-renders all virtualized rows; editedCells keyed by rowIdx breaks on sort/page change.
- No abort/cancellation: rapid filter/sort changes fire overlapping queries; a stale slow query can resolve after a newer one and overwrite rows (race condition).

## Offline gaps

- SQL view header says 'Powered by DuckDB WASM' but the engine is native DuckDB node-api in Electron main — misleading copy.
- handleBrowserUpload is a dead-end: drag-drop intentionally errors and forces the native dialog. No OPFS/browser-path ingest fallback for a future non-Electron web build.
- No persistence of user state (column widths/visibility/pinning, saved filters, saved SQL, starred rows) — savedQueries/savedFilterGroups are in-memory useState lost on reload; should persist to Dexie/IndexedDB keyed by dataset.
- Cell edits (editedCells) are never written back to DuckDB and have no offline persistence — 'Save changes' just clears the Map; edits are silently discarded.
- Search is page-local client fuzzy match instead of a DuckDB ILIKE/FTS pushdown — offline correctness requires querying the engine, not the 50 rows in memory.
- Export only serializes the in-memory current page; a true offline full-filtered export must stream from DuckDB (COPY ... TO file via main process), not the renderer Blob path.
- No navigator.storage.persist()/estimate() handling for any cached UI state or future OPFS-backed preview parquet.

## Recommended dependencies

| Package | Category | Stars | Maint. | License | Offline | Replaces | Why | URL |
|---|---|---|---|---|---|---|---|---|
| `@tanstack/react-virtual` | grid-virtualization | ~5.5k | Very active (TanStack), v3 | MIT | yes | — | Already used for row virtualization. Keep; extend to column virtualization for wide tables and pair with keyset windowed fetching. Headless, ~10kB, zero network. | https://github.com/TanStack/virtual |
| `@tanstack/react-table` | grid-model | ~26k | Very active, v8 | MIT | yes | hand-rolled column/sort state | Headless table model for sort/filter/column-sizing/visibility/pinning. The screen hand-rolls all of this in useState; adopting it removes hundreds of lines and standardizes/batches column-sizing state. | https://github.com/tanstack/table |
| `glide-data-grid` | canvas-grid | ~5.1k | Active (Glide), v6.x; verify cadence before commit | MIT | yes | DOM cell divs at scale | Canvas grid rendering millions of rows with lazy per-cell fetching — the escape hatch when a dataset exceeds TanStack DOM comfort (~50-100k window rows) or for smooth heatmap/edit cells without per-cell React nodes. | https://github.com/glideapps/glide-data-grid |
| `apache-arrow` | data-interchange | ~14k | Very active (Apache) | Apache-2.0 | yes | getRowObjectsJS + JSON IPC | Move the IPC contract from JSON rows to Arrow IPC buffers. Native DuckDB emits Arrow; transfer the buffer (transferable ArrayBuffer) and read columnar in the renderer — eliminates row<->object transposition and serialization, the dominant cost for large results. | https://github.com/apache/arrow-js |
| `@uwdata/flechette` | data-interchange | ~0.1k | Active (UW IDL) | BSD-3-Clause | yes | apache-arrow (renderer reader) | Lighter/faster Arrow IPC reader (~14kB gz vs 43kB) for the renderer/worker side — decode the DuckDB Arrow buffer without the full apache-arrow footprint. Trial behind the Arrow-IPC migration. | https://github.com/uwdata/flechette |
| `comlink` | worker-rpc | ~12.6k | Active (GoogleChromeLabs) | Apache-2.0 | yes | main-thread compute | Wrap a Web Worker that owns client heavy work (Arrow decode, search rank, heatmap ranges, export streaming) with Proxy RPC so the main thread stays at 60fps. ~1.1kB. | https://github.com/GoogleChromeLabs/comlink |
| `dexie` | persistence | ~13k | Active | Apache-2.0 | yes | in-memory savedQueries/savedFilterGroups | Persist per-dataset UI state offline (column layout, saved filters, saved SQL, starred rows, recent queries) in IndexedDB. Replaces lost in-memory useState; typed, ~25kB, zero network. | https://github.com/dexie/Dexie.js |
| `@tanstack/react-query` | data-fetching | ~44k | Very active | MIT | yes | manual fetch + race guard | Wrap the keyset page fetch: request dedup, automatic cancellation by queryKey, and keepPreviousData for smooth paging — replaces the manual stale-query guard and fixes the overlapping-query race. Already a project dependency. | https://github.com/TanStack/query |
| `exceljs` | export | ~15.4k | Maintenance-mode, stable | MIT | yes | main-thread page-only export | Already used. Keep but move to a Worker / Electron main streaming WorkbookWriter and feed it the FULL filtered result streamed from DuckDB, not the current page. ~6x less memory than SheetJS. | https://github.com/exceljs/exceljs |
| `uPlot` | charts | ~10.2k | Active, v1.6.x | MIT | yes | ECharts for dense lines | For dense numeric column previews/sparklines and time-series in analytics, uPlot is far lighter/faster on CPU than ECharts (166k pts ~25ms). Use alongside ECharts. | https://github.com/leeoniya/uPlot |
| `echarts` | charts | ~63k | Very active (Apache), v6 | Apache-2.0 | yes | — | Keep as analytics workhorse but dynamic-import it so it leaves the initial route chunk, and render heavy scatter/large series via OffscreenCanvas in a worker on weak GPUs. | https://github.com/apache/echarts |

## CLIs & tools

| Tool | Type | Offline | Why | URL |
|---|---|---|---|---|
| `duckdb CLI` | cli | yes | Offline EXPLAIN ANALYZE of the generated paginated/sort/filter SQL against the managed Parquet cache to verify keyset pagination and pushdown beat OFFSET. | https://github.com/duckdb/duckdb |
| `@next/bundle-analyzer / sonda` | cli | yes | Confirm ECharts/Monaco are split out of the browser route initial chunk and measure the /dashboard/browser payload after refactor. | https://github.com/filipsobol/sonda |
| `size-limit (@size-limit/preset-app + time)` | cli | yes | Add a per-route byte+parse-time budget for /dashboard/browser and a per-worker budget for the new data-browser worker; gate in CI. | https://github.com/ai/size-limit |
| `react-scan` | library | yes | Visually detect unnecessary re-renders (rows/cells re-rendering on unrelated state) before and after decomposition; target zero row re-renders on cell edit/hover. | https://github.com/aidenybai/react-scan |
| `tinybench (via Vitest bench)` | library | yes | Microbench the SQL builders (generateKeysetSQL/buildWhereClause), keyset vs OFFSET latency, and Arrow-decode vs JSON-parse on representative datasets. | https://github.com/tinylibs/tinybench |
| `@lhci/cli (Lighthouse CI)` | cli | yes | Audit INP/long-tasks on the browser route against localhost/bundled Chromium to prove main-thread work dropped after worker offloading. | https://github.com/GoogleChrome/lighthouse-ci |

---

# Data Browser — Deep Improvement Plan

Feature: `data-browser` — virtualized tabular grid over DuckDB.
Code surface:
- `src/features/data-browser/screens/DataBrowserScreen.tsx` (3128 lines — the entire feature)
- `src/features/data-browser/components/table-widgets.tsx` (363 lines, presentational widgets)
- `src/features/data-browser/model/helpers.ts` (SQL builders, formatters)
- `src/features/data-browser/model/types.ts`, `model/constants.tsx`
- Route: `src/app/dashboard/browser/page.tsx` (wires telecom data and renders `RawDataTab` = `DataBrowserScreen`)
- Engine: `src/platform/duckdb/duckdb.ts` → `shared-duckdb.ts` → IPC → `electron/duckdb-service.ts` (native DuckDB neo, read-connection pool, `assertReadOnlySql`)

This plan is offline-only and medium-end-PC friendly. The engine architecture (native DuckDB in Electron main, IPC bridge, read pool) is already correct and is **not** what needs replacing. The problem is the **renderer**: a single 3000-line client component that does too much on the main thread, paginates badly, serializes data inefficiently, and loses user state.

---

## 1. Current implementation

### 1.1 Data flow
1. `page.tsx` renders `RawDataTab` (`DataBrowserScreen`) with telecom props (`m`, `operators`, `fetchFiltered`, `fetchCustomerProfile`, …). Most of those props (`fetchFiltered`, `fetchCustomerProfile`) are **not used** by the screen — it queries DuckDB directly via `runReadOnlyQuery`. This is dead prop plumbing.
2. On mount (`useEffect`, lines 361-404) the screen calls `listRegisteredDatasets()` (IPC → main) and `switchToDataset()` which runs `SELECT * FROM view LIMIT 1` to infer a sample row, builds `ColumnDef[]` via `columnsFromDataset` (179-194), and sets `totalRows` from the catalog's `rowCount`.
3. `fetchRows` (486-525) runs **two** queries every time: a `COUNT(*)` (with WHERE) then a `generateSQL(...)` page query. Both return JSON `Record<string,unknown>[]` across IPC.
4. Rows render in a TanStack-Virtual windowed list (2073-2271). Cells are plain `<div>`s with inline styling, per-cell click/double-click handlers, inline edit `<input>`, and heatmap styles.
5. Column stats are loaded lazily per column via SQL aggregates (601-621) — this part is good.

### 1.2 Engine boundary (confirmed)
- `electron/duckdb-service.ts:933 runReadOnlyQuery` → `measureRows(conn, safeSql)` → `result.getRowObjectsJS()` (line 156). The native engine converts Arrow → JS row objects **in main**, then those objects cross IPC via structured clone, then land in renderer state. This is the single biggest data-path inefficiency.
- `assertReadOnlySql` already guards the SQL view (custom SQL is sandboxed read-only — good).
- Read queries are serialized through a `readQueue` with a 60s timeout; there is a read-connection pool (`getReadConnection`).

### 1.3 What already works well (do not churn)
- Native DuckDB (not WASM) — fast, no SharedArrayBuffer/COOP-COEP constraint, no 4GB ceiling. The SQL-view label "Powered by DuckDB WASM" (line 2738) is just wrong copy.
- Row virtualization via `@tanstack/react-virtual` (the right primitive).
- SQL pushdown for filters/sorts/pagination via `generateSQL`/`buildWhereClause` (helpers.ts) — compute in SQL, not JS.
- Column stats via SQL aggregates, not JS scans.
- Monaco is `dynamic()`-imported (line 150).
- `buildWhereClause`/`generateSQL` quote identifiers and literals (basic injection hygiene); custom SQL is read-only-guarded.

---

## 2. Performance bottlenecks and exact fixes

### 2.1 The monolith re-renders everything
`DataBrowserScreen` holds ~40 `useState` hooks and renders header + filter panel + column panel + table + cards + analytics + SQL + drawer in one component. Editing a single cell (`editValue`) or hovering a row re-renders the whole tree, including every virtualized row and every memoized ECharts option object.

**Fix: decompose + memoize.** Split into a thin shell that routes to view components, and memoize rows/cells.

```tsx
// GridRow.tsx
import { memo } from "react";
export const GridRow = memo(function GridRow({
  row, rowIndex, columns, isSelected, isZebra, rowHeight, onToggle,
}: GridRowProps) {
  return (
    <div style={{ height: rowHeight }} onClick={(e) => onToggle(rowIndex, e)}
      className={cn("flex", isSelected && "bg-emerald-500/10", isZebra && "bg-zinc-900/30")}>
      {columns.map((col) => <GridCell key={col.id} value={row[col.name]} col={col} />)}
    </div>
  );
}, (a, b) =>
  a.row === b.row && a.isSelected === b.isSelected &&
  a.columns === b.columns && a.rowHeight === b.rowHeight);
```

Move `editingCell`/`editValue` into the cell itself so typing never re-renders siblings.

### 2.2 `fetchRows` over-fires
`fetchRows` depends on `columns` (whole array). Resizing a column (`startResize`/`onMove`, 833-862) or toggling visibility mutates `columns` → `fetchRows` identity changes → the `useEffect` at 528 re-queries. Resizing must never hit the database.

**Fix:** derive a stable query key; refetch only when it changes.
```ts
const queryKey = useMemo(() => ({
  table: activeTable, where: buildWhereClause(filterGroup),
  order: serializeSorts(sorts), page, pageSize, search,
}), [activeTable, filterGroup, sorts, page, pageSize, search]);
useEffect(() => { void fetchPage(queryKey); }, [queryKey]);
```
Column visibility can change the projection (`SELECT a, b`) OR just `SELECT *` once and hide client-side to avoid refetch on visibility toggles. Prefer projection-refetch only when column count is large.

### 2.3 OFFSET pagination → keyset/seek pagination
`generateSQL` (helpers.ts:106) emits `LIMIT n OFFSET page*pageSize`. DuckDB's Top-N holds `n+offset` rows; deep pages on millions of rows balloon memory and slow linearly (DuckDB issues #14218, #11261; discussion #17620 reports OOM at large offsets). The seek method is O(window) regardless of depth.

**Fix:** keyset pagination using the last seen sort key plus a stable tiebreaker (`rowid`).
```ts
export function generateKeysetSQL(
  table: string, cols: ColumnDef[], sorts: SortConfig[],
  where: string, limit: number, cursor: CursorValue | null,
): string {
  const order = sorts.length ? sorts : [{ column: "rowid", direction: "asc", priority: 0 }];
  const orderSql = order.map(s => `${q(s.column)} ${s.direction.toUpperCase()}`).join(", ");
  let sql = `SELECT ${projection(cols)}, rowid FROM ${q(table)}`;
  const preds: string[] = [];
  if (where) preds.push(`(${where})`);
  if (cursor) preds.push(keysetPredicate(order, cursor)); // (a>?) OR (a=? AND b>?) ...
  if (preds.length) sql += ` WHERE ${preds.join(" AND ")}`;
  return `${sql} ORDER BY ${orderSql} LIMIT ${limit}`;
}
```
Keep an OFFSET fallback for "jump to page N" (rare). Default forward/backward scroll uses keyset, removing the deep-page cliff.

### 2.4 `COUNT(*)` recomputed every fetch
`fetchRows` runs `SELECT COUNT(*)` on every call. With no filter the total is constant (catalog `rowCount`); with a filter it changes only when WHERE changes — not on sort/page.

**Fix:** cache count keyed by `(table, whereClause)`; use catalog `rowCount` for the empty filter; run the count in parallel with the data query (don't await sequentially) and only when the key is new.

### 2.5 JSON IPC → Arrow IPC
`getRowObjectsJS()` transposes columnar Arrow to row objects in main, then structured-clone serializes them across IPC. Arrow docs/blog (2025) confirm serialization dominates transfer cost and columnar→columnar with zero-copy avoids the row transpose twice.

**Fix (high-impact, medium-effort):**
- In `electron/duckdb-service.ts`, add `runReadOnlyQueryArrow(sql)` returning an Arrow IPC stream `Uint8Array` (DuckDB neo produces Arrow result chunks; serialize via Arrow IPC writer).
- Send the `ArrayBuffer` over IPC as a **transferable** (no clone).
- In the renderer worker, decode with `@uwdata/flechette` (~14kB) or `apache-arrow`. Read columns lazily.

```ts
import { tableFromIPC } from "@uwdata/flechette";
export async function fetchArrowPage(sql: string) {
  const buf: ArrayBuffer = await duckdbBridge.runReadOnlyQueryArrow(sql);
  const table = tableFromIPC(new Uint8Array(buf));
  return { numRows: table.numRows, table }; // lazy column accessors
}
```
The grid reads `table.getChild(col).at(rowIndex)` lazily instead of materializing 50 objects × N columns. Heatmap ranges and full-result export become cheap column-vector ops.

### 2.6 Client-side Fuse.js search is wrong and expensive
`fuse` (1019) builds an index over the current 50-row page on every change and only highlights. It cannot find matches outside the page and re-instantiates per keystroke.

**Fix:** push search to DuckDB (ILIKE across text columns, debounced; DuckDB FTS extension for big tables). Keep highlight purely visual.
```ts
function buildSearchPredicate(term: string, cols: ColumnDef[]): string {
  const t = quoteLiteral(`%${term}%`);
  return cols.filter(c => ["string","email","url"].includes(c.type))
    .map(c => `CAST(${q(c.name)} AS VARCHAR) ILIKE ${t}`).join(" OR ");
}
```

### 2.7 Main-thread O(rows×cols) passes
`columnRanges` (1064) and `selectionStats` (1047) scan all rows in JS. With Arrow columns these become column-vector min/max/sum (fast) and run in the worker. Heatmap ranges should reuse the existing SQL `MIN/MAX` stats path.

### 2.8 Export silently exports the current page only
`exportData/exportExcel/exportJSON` operate on `rows` (the page) or selected indices within it. A user with a 2M-row filtered set who clicks Export gets 50 rows.

**Fix:** stream the full filtered result from DuckDB.
- Electron main: `COPY (<SELECT without LIMIT>) TO '<userPath>' (FORMAT CSV/PARQUET)` written incrementally via `fs`. Offline-correct, memory-safe.
- XLSX: stream rows from a DuckDB Arrow reader into ExcelJS `WorkbookWriter` in the worker/main, committing in chunks.
- UI: progress toast; never build a giant Blob on the renderer main thread.

### 2.9 Column resize thrashes state
`onMove` (846) does `setColumns(produce(...))` per mousemove — a full array clone + re-render per pixel.

**Fix:** drive resize via a CSS variable / ref during drag, commit the final width on mouseup; or adopt TanStack Table's column-sizing model which batches this.

### 2.10 Static ECharts import
`import ReactECharts from "echarts-for-react"` (161) is top-level → ECharts (~1MB) ships in the route's initial JS even for users who never open Charts.

**Fix:** `const AnalyticsView = dynamic(() => import("./AnalyticsView"))`, mount only when `viewMode === "analytics"`. Render scatter/large series via OffscreenCanvas in a worker on weak GPUs.

### 2.11 Cards view unbounded + animated
`viewMode === "cards"` maps `rows.map` into `motion.div` with `transition={{ delay: i * 0.01 }}` — staggered animation over every card, no virtualization.

**Fix:** virtualize the card grid (column-count-aware row virtualizer); drop per-item delay (single container fade).

### 2.12 Query race conditions
Rapid filter/sort changes fire overlapping `runReadOnlyQuery` calls; a slow earlier query can resolve after a newer one and overwrite `rows`.

**Fix:** tag each fetch with a monotonically increasing id and drop stale results, or adopt TanStack Query with `keepPreviousData` and automatic cancellation keyed by `queryKey`.
```ts
const reqId = useRef(0);
async function fetchPage(key: QueryKey) {
  const id = ++reqId.current;
  const page = await worker.fetchArrowPage(buildSql(key));
  if (id !== reqId.current) return; // stale, drop
  setPage(page);
}
```

---

## 3. Offline gaps and how to close them

1. **Misleading "DuckDB WASM" label** (line 2738) — cosmetic; fix copy to "native DuckDB".
2. **No user-state persistence.** `savedQueries`, `savedFilterGroups`, column layout, starred rows, recent SQL are `useState` → lost on reload. Persist with **Dexie** (IndexedDB, offline), keyed by `datasetId`.
```ts
import Dexie, { type Table } from "dexie";
export interface GridLayout { datasetId: string; columns: ColumnLayout[]; updatedAt: number; }
export interface SavedView { id: string; datasetId: string; name: string; filter: FilterGroup; sorts: SortConfig[]; }
class BrowserDB extends Dexie {
  layouts!: Table<GridLayout, string>; views!: Table<SavedView, string>; queries!: Table<SavedQuery, string>;
  constructor() { super("data-browser"); this.version(1).stores({
    layouts: "datasetId", views: "id, datasetId", queries: "id, datasetId" }); }
}
export const db = new BrowserDB();
```
Call `navigator.storage.persist()` at startup and surface `estimate()` quota in settings.
3. **Cell edits discarded.** `editedCells` is never written back; "Save changes" clears the Map. Either make the grid explicitly read-only (remove edit affordance) or implement a write path: stage edits → `UPDATE` via the main-process write connection (the service already has a `writeConn`). Edits keyed by `rowIdx-colId` break on sort/page — key by stable `rowid`.
4. **Browser-only ingest dead-end.** `handleBrowserUpload` errors by design. For a future web build, wire OPFS: write the dropped File to OPFS via a Worker `createSyncAccessHandle`, then `registerFileHandle`/`read_csv` in DuckDB-WASM. Out of scope for Electron but required for the non-Electron web build trial.
5. **Search/export correctness** — both must hit the engine (§2.6/§2.8) so offline results are complete, not page-local.

Everything else is already offline (native engine, no network calls in the feature).

---

## 4. Better architecture & implementation (step by step)

### 4.1 Target module layout
```
src/features/data-browser/
  screens/DataBrowserScreen.tsx        // thin shell: provider + view router
  state/store.ts                       // zustand: viewMode, filters, sorts, page, selection
  state/persistence.ts                 // Dexie load/save layout + saved views
  data/use-grid-data.ts                // TanStack Query hook -> worker -> Arrow page
  data/grid.worker.ts                  // comlink: Arrow decode, search rank, heatmap, export stream
  data/sql.ts                          // generateKeysetSQL, buildWhereClause, search predicate
  components/
    DataGrid.tsx                       // virtualized table (memoized rows/cells)
    GridRow.tsx / GridCell.tsx
    Toolbar.tsx / FilterPanel.tsx / ColumnPanel.tsx
    CardsView.tsx                      // dynamic, virtualized
    AnalyticsView.tsx                  // dynamic (ECharts split out)
    SqlView.tsx                        // dynamic (Monaco already lazy)
    RowDetailDrawer.tsx
```

### 4.2 State store (zustand) — kills prop-drilling and over-renders
```ts
import { create } from "zustand";
interface BrowserState {
  activeTable: string; columns: ColumnDef[]; sorts: SortConfig[];
  filterGroup: FilterGroup; search: string; page: number; pageSize: number;
  selection: Set<number>; viewMode: ViewMode;
  setSorts(s: SortConfig[]): void; setFilter(f: FilterGroup): void; /* ... */
}
export const useBrowser = create<BrowserState>((set) => ({ /* ... */ }));
```
Selectors (`useBrowser(s => s.sorts)`) mean a column-width change never re-renders the toolbar, and the grid subscribes only to data-relevant slices.

### 4.3 Worker + Arrow data hook
```ts
// data/grid.worker.ts
import * as Comlink from "comlink";
import { tableFromIPC } from "@uwdata/flechette";
const api = {
  async page(sql: string) {
    const buf = await (self as any).duckdbBridge.runReadOnlyQueryArrow(sql);
    const t = tableFromIPC(new Uint8Array(buf));
    return Comlink.transfer({ numRows: t.numRows /* + typed-array columns */ }, [buf]);
  },
  async exportStream(sql: string, path: string, fmt: "csv" | "xlsx" | "parquet") { /* COPY ... TO */ },
};
Comlink.expose(api);
```
The IPC bridge lives on the renderer main thread (`window.electronDuckDB`), so either (a) the worker proxies through the main thread via a MessageChannel, or (b) the Arrow buffer is fetched on the main thread and transferred into the worker for decode. Decode + columnar reads (the expensive part) belong in the worker regardless.

```ts
// data/use-grid-data.ts
export function useGridData() {
  const key = useBrowser(selectQueryKey, shallow);
  return useQuery({
    queryKey: ["grid", key],
    queryFn: ({ signal }) => worker.page(buildKeysetSql(key), { signal }),
    placeholderData: keepPreviousData,  // smooth paging, auto-cancels stale
    staleTime: 30_000,
  });
}
```
TanStack Query gives request dedup, cancellation, and `keepPreviousData` for free — replacing the manual `reqId` guard and the overlapping-query race.

### 4.4 Grid rendering (DOM default, canvas escape hatch)
- Default: TanStack Virtual rows + memoized `GridRow`/`GridCell`, **also** virtualize columns for wide tables (`useVirtualizer({ horizontal: true })`). Holds ~50-100k window rows comfortably.
- Escape hatch: when `numRows` is huge or heatmap/streaming is heavy, swap `DataGrid` for **glide-data-grid** fed lazily from Arrow columns (`getCellContent` reads `column.at(row)`), avoiding per-cell React nodes.
```tsx
<DataEditor columns={glideCols} rows={numRows}
  getCellContent={([c, r]) => arrowCell(table, c, r)} smoothScrollX smoothScrollY />
```

### 4.5 Push everything that scales to the engine
- Filters/sorts/search/pagination: SQL pushdown (keyset).
- Stats/heatmap ranges: SQL `MIN/MAX/AVG/COUNT(DISTINCT)` (reuse the stats path).
- Export: `COPY (...) TO` in main.
The renderer's only job becomes "render a small window" — the one way to stay at 60fps on a medium PC.

---

## 5. CLIs & tools (all offline)

- **duckdb CLI** — `EXPLAIN ANALYZE` the keyset vs OFFSET SQL on the managed Parquet cache to prove the win and validate zonemap/index usage.
- **@next/bundle-analyzer / sonda** — verify ECharts + Monaco are out of the `/dashboard/browser` initial chunk.
- **size-limit (@size-limit/preset-app + time)** — per-route byte+parse-time budget for the browser route and a per-worker budget for `grid.worker`.
- **react-scan** — record re-renders before/after decomposition; target zero row re-renders on cell edit/hover.
- **tinybench (Vitest bench)** — bench `generateKeysetSQL`, `buildWhereClause`, Arrow-decode vs JSON-parse, heatmap range compute.
- **@lhci/cli** — INP/long-task audit vs localhost to confirm main-thread reduction.

---

## 6. Phased tasks

### P1 — correctness + worst perf cliffs (highest ROI, low risk)
1. Fix the "DuckDB WASM" label; remove dead `fetchFiltered`/`fetchCustomerProfile` prop plumbing.
2. Decompose `DataBrowserScreen` into shell + view components; memoize `GridRow`/`GridCell`; move `editingCell`/`editValue` local to the cell.
3. Stabilize `fetchRows`: introduce `queryKey`; stop refetching on column width/visibility changes; cache `COUNT(*)` per `(table, where)`; run count in parallel.
4. Keyset/seek pagination in `helpers.ts` with OFFSET fallback for jump-to-page.
5. Add a request-id (or TanStack Query) guard to kill stale-query races.
6. Push global search to SQL (`ILIKE` across text columns), debounced; keep highlight visual.
7. Dynamic-import `AnalyticsView`/ECharts and `CardsView`; virtualize the cards grid; drop staggered per-item animation.
8. Fix export to stream the **full filtered result** via `COPY ... TO` in main; progress toast.

### P2 — data path + persistence (medium effort)
9. Add `runReadOnlyQueryArrow` in `duckdb-service.ts`; transfer Arrow IPC buffers over IPC; decode with flechette in a comlink worker. Migrate the grid to lazy columnar reads.
10. Move heatmap ranges + selection stats into SQL/worker (no main-thread O(rows×cols)).
11. Dexie persistence for column layout, saved filters, saved SQL, starred rows, recent queries; `navigator.storage.persist()` + quota surface.
12. Column virtualization for wide tables; resize via CSS var + commit-on-mouseup (or TanStack Table sizing model).
13. Replace hand-rolled column/sort state with TanStack Table's headless model (optional; removes ~hundreds of lines).

### P3 — scale + future web build (trial, behind flags)
14. glide-data-grid canvas escape hatch for >100k-window / streaming datasets, fed from Arrow.
15. uPlot for dense numeric sparklines/time-series; OffscreenCanvas ECharts for scatter on weak GPUs.
16. Cell-edit write-back path (`UPDATE` via main write connection) keyed by stable `rowid`, or make the grid explicitly read-only.
17. OPFS-backed browser ingest (`createSyncAccessHandle` + DuckDB-WASM `registerFileHandle`) for a non-Electron web build; DuckDB FTS extension for large-table search.

---

## 7. Sources
- DuckDB OFFSET memory/latency on deep pages, keyset as the fix: DuckDB issues #14218, #11261, discussion #17620.
- Arrow IPC zero-copy / serialization-dominates-transfer: Apache Arrow IPC docs + "How the Apache Arrow Format Accelerates Query Result Transfer" (arrow.apache.org/blog, 2025-01-10).
- glide-data-grid (~5.1k stars, MIT, canvas, millions of rows, lazy cells) and TanStack Virtual v3 (~5.5k, 50k+ row windows at 60fps) verified via GitHub.