# Feature Plan — csv-parser

**Maturity:** functional

## Performance issues

- Synchronous main-thread PapaParse: handleParse() calls Papa.parse(rawText, ...) without worker:true and without step/chunk streaming (CsvParserScreen.tsx:526). For anything past a few MB the parse, the whitespace-trim map, and detectType all block the UI thread and freeze the React tree.
- Full-table materialization in memory: parsed.rows holds the ENTIRE dataset as Record<string,unknown>[] (CsvParserScreen.tsx:555). The allTransformed useMemo (line 593) re-casts and re-filters EVERY row on every keystroke of the filter or any column-config toggle, with no debounce.
- Double transformation: both transformed (preview, line 572) and allTransformed (full, line 593) recompute on overlapping deps; filteredTotal (line 713) runs applyFilter over all rows a THIRD time. Three full-table passes per render cycle.
- Non-virtualized DOM table: the preview renders up to 500 <tr> rows with per-cell colConfigs.find() lookups (lines 1328, 1364) — an O(rows x cols) linear scan inside render. The repo already uses @tanstack/react-virtual elsewhere (DataBrowserScreen, telecom data-grid) but not here.
- Row-of-objects shape instead of columnar/Arrow: type detection, casting, null-counting and distinct-counting all iterate row objects in JS (detectType line 97, castValue line 141, parsedColumnsToColMeta line 308) instead of pushing to DuckDB which is already wired in this app.
- applyFilter runs a regex .match() per row per render (line 171) and re-parses the filter expression every call — no compilation/memoization of the predicate.
- handleLoadDB serializes the full transformed table back to a CSV string in JS (rowsToCSV, line 232), writes it to disk, then re-reads it through DuckDB — a needless round-trip that duplicates the data and blocks on a giant string build.
- detectType only samples first 200 rows (line 551) yet the cast in allTransformed is applied to all rows, so type inference and casting are inconsistent for large files.
- No useTransition / no Suspense around the heavy parse+cast; setParsing(true) is the only feedback and the actual work still blocks paint.

## Offline gaps

- No genuine offline gaps in the network sense — PapaParse, arquero, DuckDB-native are all local. But the in-browser paste/drop path has NO persistence: rawText, parsed rows, and column configs live only in React state and are lost on reload/crash (no OPFS/IndexedDB draft autosave).
- Profiling for the paste path is hand-rolled and shallow (preview-only nullCount/distinctCount in parsedColumnsToColMeta, line 308) and explicitly flagged metadataSource:'preview' in upload-to-duckdb.ts — real full-table statistics from DuckDB SUMMARIZE are available (summarizeDataset, shared-duckdb.ts:345) but never surfaced in the parser UI.
- DuckDB-dependent actions (handleLoadDB line 631, handleOpenLocalDataset line 413) hard-fail outside Electron with a toast; there is no @duckdb/duckdb-wasm in-worker fallback for a pure-browser build, so the 'Register dataset' and large-file paths are Electron-only.
- Large-file handling is a dead-end in the browser: files >= 16MB (LARGE_FILE_EDITOR_BYTES, line 53) just show a toast telling the user to use the native picker; there is no OPFS-streamed parse path for the non-Electron case.
- Bad/rejected rows are silently dropped — DuckDB store_rejects / reject_errors and PapaParse error rows are not captured into a reviewable 'data quality' panel; only result.errors.slice(0,3) (line 546) is shown.
- Model/asset caching is irrelevant here (no model), but there is no cached schema/profile so re-opening the same file re-runs everything.

## Recommended dependencies

| Package | Category | Stars | Maint. | License | Offline | Replaces | Why | URL |
|---|---|---|---|---|---|---|---|---|
| `uDSV` | CSV parsing (paste/preview path) | ~753 | Active; v0.7.3 Jul 2025 (single maintainer leeoniya, same author as uPlot) | MIT | yes | papaparse (paste/preview path) | ~2x faster than PapaParse (2M rows/s vs 1.13M, 330 vs 186 MiB/s on 17MB CSV), ~5KB min, built-in incremental/streaming API + typed schema inference (string/number/bool/date/json). Ideal drop-in for the in-memory paste path and for streaming OPFS files chunk-by-chunk in a worker. Pin (low bus-factor). | https://github.com/leeoniya/uDSV |
| `papaparse` | CSV parsing (keep, fix usage) | ~13k | Active; v5.x | MIT | yes |  | Already a dependency. Keep, but MUST switch to worker:true + step/chunk streaming so parsing never blocks the main thread. The mature fallback when uDSV's strict-quote streaming caveat matters. | https://github.com/mholt/PapaParse |
| `comlink` | Worker RPC | ~12.6k | Active (GoogleChromeLabs) | Apache-2.0 | yes | raw postMessage | ~1.1KB Proxy-based RPC to drive the parse/profile Web Worker cleanly (Tech Radar Adopt). Wrap the CSV worker so the screen calls await csvWorker.parse(text, opts) with no postMessage boilerplate. | https://github.com/GoogleChromeLabs/comlink |
| `@tanstack/react-virtual` | Preview grid virtualization | ~5.5k | Very active; v3 | MIT | yes | raw <table> map | ALREADY a dependency and used elsewhere in the repo. The preview <table> must be row+column virtualized so 500/5k/50k preview rows render a constant ~30 DOM rows. Biggest single render win. | https://github.com/TanStack/virtual |
| `@tanstack/react-table` | Headless grid model | ~26k | Very active; v8 | MIT | yes | hand-rolled table state | ALREADY a dependency. Replace the ad-hoc colConfigs.find() per-cell lookups and manual sort/filter with a headless column model + columnVisibility state; pairs with react-virtual. | https://github.com/tanstack/table |
| `@duckdb/node-api` | Native parse + profiling engine | ~31k core / 1.5k neo | Very active (official) | MIT | yes | JS detectType/castValue profiling | ALREADY a dependency. The parser should push parsing AND profiling to native DuckDB: read_csv(auto_detect) for dialect/type sniffing, sniff_csv() for a confidence-scored dialect preview, SUMMARIZE for real full-table stats, store_rejects for a bad-rows panel. Eliminates the JS detectType/castValue/distinct-count passes for the Electron path. | https://github.com/duckdb/duckdb-node-neo |
| `apache-arrow` | Columnar interchange | ~14k | Very active | Apache-2.0 | yes | row-of-objects arrays | Carry parsed/profiled data worker->renderer->grid as zero-copy Arrow instead of Record<string,unknown>[]; lets the virtualized grid read columns directly and avoids per-row object allocation. Transitive today; use it explicitly here. | https://github.com/apache/arrow |
| `@uwdata/flechette` | Lighter Arrow reader (Trial) | ~0.1k | Active (UW IDL, backs Arquero v8) | BSD-3-Clause | yes | apache-arrow (renderer read-only) | OPTIONAL ~14KB gz Arrow reader vs apache-arrow's 43KB for the renderer side, to shrink the parser's bundle when only reading Arrow into the grid. | https://github.com/uwdata/flechette |
| `arquero` | In-memory reshaping (keep) | ~1.4k | Active (UW IDL) | BSD-3-Clause | yes | hand-rolled applyFilter | ALREADY a dependency. Use for small/medium derive/rename/filter without a DuckDB round-trip, and as the structured filter engine instead of the hand-rolled regex applyFilter. Backed by Flechette for Arrow. | https://github.com/uwdata/arquero |
| `@duckdb/duckdb-wasm` | Browser fallback engine (Trial) | ~2k pkg | Active (official) | MIT | yes | Electron-only DuckDB path (browser) | OPTIONAL — only if a non-Electron web build ships. Lazy-load in a worker (COI bundle, needs COOP/COEP) so 'Register dataset', SUMMARIZE profiling, and large OPFS-file parsing work in the browser too, removing the Electron-only hard fails. | https://github.com/duckdb/duckdb-wasm |
| `simple-statistics` | Profiling math (paste path) | ~3.5k | Active; v7.9 2026 | ISC | yes | ad-hoc Math in upload-to-duckdb.ts | For the in-browser path with no DuckDB, compute quantiles/mean/stdev/mode for the profile cards in the worker (~30KB zero-dep) instead of ad-hoc Math.min/max in buildPreviewColumnMetadata. | https://github.com/simple-statistics/simple-statistics |
| `uPlot` | Profile mini-histograms (Trial) | ~10.2k | Active; v1.6 | MIT | yes | no chart today | Tiny canvas charts for per-column distribution/histogram sparklines in profile cards; far cheaper on a medium PC than ECharts for dozens of tiny charts. Same author as uDSV. | https://github.com/leeoniya/uPlot |

## CLIs & tools

| Tool | Type | Offline | Why | URL |
|---|---|---|---|---|
| `duckdb (CLI)` | cli | yes | Locally validate dialect sniffing and profiling SQL the worker will emit: duckdb -c "FROM sniff_csv('f.csv'); SUMMARIZE FROM read_csv('f.csv', store_rejects=true);" Reproduce exactly what the Electron service does. | https://duckdb.org/docs/api/cli |
| `size-limit (+@size-limit/preset-app)` | cli | yes | Already in repo. Add a per-route budget for the csv-parser route and a per-worker budget for the new csv parse/profile worker so uDSV/arquero/arrow additions stay in check. | https://github.com/ai/size-limit |
| `tinybench / Vitest bench` | library | yes | Already in repo. Microbench parse throughput (uDSV vs PapaParse) and the cast/filter hot paths on representative CSVs to prove the worker migration improves rows/sec. | https://github.com/tinylibs/tinybench |
| `react-scan` | library | yes | Detect the unnecessary full re-renders caused by the triple full-table useMemos and per-keystroke filter recompute; verify they disappear after virtualization + debounce. | https://github.com/aidenybai/react-scan |
| `@lhci/cli (Lighthouse CI)` | cli | yes | Run offline against localhost to measure TBT/INP on the parser route before/after moving parsing off the main thread. | https://github.com/GoogleChrome/lighthouse-ci |
| `knip` | cli | yes | Already in repo. After swapping the paste path to uDSV, confirm no dead PapaParse-only helpers (csvEscape/rowsToCSV) linger if the DuckDB COPY path replaces them. | https://github.com/webpro-nl/knip |

---

# csv-parser — Deep Improvement Plan

## 1. Current implementation

The feature is a single large client component plus a one-line route.

- **Route:** `src/app/dashboard/csv-parser/page.tsx` — just renders `<CsvParserScreen />`.
- **Screen:** `src/features/csv-parser/screens/CsvParserScreen.tsx` (~1405 lines, one default-exported component, all logic inline).
- **Story:** `src/features/csv-parser/screens/CsvParserScreen.stories.tsx` — boots into the empty state (no FS/DuckDB in Storybook), tagged `no-visual-test`.

### Two distinct data paths

**Path A — Electron native (large files, "Open local dataset"):** `handleOpenLocalDataset` (`CsvParserScreen.tsx:413`) opens a native dialog and calls `loadUploadPathToDuckDB(filePath, ...)` from `src/platform/duckdb/upload-to-duckdb.ts`. That delegates to `registerCSVPathDataset` (`src/platform/duckdb/duckdb.ts:108` → `shared-duckdb.ts:299` → IPC → `electron/duckdb-service.ts`). The native service does the right thing: `read_csv(auto_detect=true, sample_size=...)` → `COPY ... TO parquet` managed cache (`electron/duckdb-service.ts:584`), then `describeView` for columns. This is the fast, correct path and matches the Tech Radar Domain 2 design ("CSV → managed Parquet cache → views").

**Path B — In-browser paste/drop (small files):** `onDrop` (`:481`) reads the file with `FileReader.readAsText` into `rawText`; files `>= 16MB` (`LARGE_FILE_EDITOR_BYTES`, `:53`) are refused with a toast. `handleParse` (`:518`) runs **synchronous** `Papa.parse(rawText, ...)` on the main thread, then trims whitespace via `raw.map(...Object.fromEntries...)`, derives headers, and runs `detectType` (`:97`) on the first 200 rows per column. Results land in `parsed.rows` — the **entire** dataset as `Record<string,unknown>[]`.

### Derived state and rendering

- `transformed` (`:572`) — filter + slice(previewLimit) + per-cell `castValue`.
- `allTransformed` (`:593`) — filter + **all rows** + `castValue`, used for export and DuckDB registration.
- `filteredTotal` (`:713`) — a third full-table `applyFilter` pass.
- The preview is a plain `<table>` (`:1320`) mapping up to 500 `<tr>`; each cell calls `colConfigs.find(...)` (`:1328`, `:1364`) — O(rows × cols) lookups during render.
- `applyFilter` (`:171`) regex-parses the filter string **per row, per render**.

### Registration round-trip

`handleLoadDB` (`:631`) takes `allTransformed`, serializes it back to a CSV **string** in JS (`rowsToCSV`, `:232`), writes it to disk (`writeLocalFile`), then re-imports it via `loadUploadPathToDuckDB`. So the in-browser path materializes the data three times (parsed objects → cast objects → CSV string) before DuckDB ever sees it.

### Profiling

Profiling is shallow and preview-only. `parsedColumnsToColMeta` (`:308`) counts nulls/distincts over the **cast rows**; `buildPreviewColumnMetadata` (`upload-to-duckdb.ts:206`) computes min/max/mean over **preview rows only** and is explicitly stamped `metadataSource: "preview"`. Meanwhile `summarizeDataset` (real DuckDB `SUMMARIZE`, `shared-duckdb.ts:345`, `electron/duckdb-service.ts:831`) exists but is **never called** by this screen.

---

## 2. Performance bottlenecks and exact fixes

### 2.1 Main-thread synchronous parse (worst offender)

`handleParse` (`:518`) blocks the UI for the whole parse + trim + type-detect. On a medium PC a 10–30MB paste freezes the tab for seconds.

**Fix — move parsing into a Web Worker, prefer uDSV, stream chunks.** Create `src/features/csv-parser/workers/csv.worker.ts` and wrap it with Comlink.

```ts
// csv.worker.ts
import * as Comlink from "comlink";
import { inferSchema, initParser } from "udsv";

export interface ParseRequest {
  text: string;
  delimiter?: string;
  hasHeader: boolean;
  trimWS: boolean;
}
export interface ColProfile {
  name: string; type: "string"|"number"|"date"|"boolean";
  nullCount: number; distinctApprox: number;
  min?: number; max?: number; mean?: number;
  hist?: { x: number; n: number }[];
}
export interface ParseResult {
  // columnar, not row-of-objects
  columns: string[];
  columnar: unknown[][];        // one array per column
  rowCount: number;
  profiles: ColProfile[];
  errors: string[];
  parseMs: number;
}

const api = {
  async parse(req: ParseRequest): Promise<ParseResult> {
    const t0 = performance.now();
    const schema = inferSchema(req.text, { col: req.delimiter });
    const parser = initParser(schema);
    // typedObjs() casts using inferred types; or use stringArrs() then cast lazily
    const rows = parser.typedArrs(req.text); // array-of-arrays, fastest
    const columns = schema.cols.map((c) => c.name);
    const columnar = columnarize(rows, columns.length); // transpose once
    const profiles = columns.map((name, i) =>
      profileColumn(name, columnar[i], schema.cols[i].type));
    return {
      columns, columnar, rowCount: rows.length,
      profiles, errors: [], parseMs: Math.round(performance.now() - t0),
    };
  },
};
Comlink.expose(api);
```

```ts
// useCsvWorker.ts
import * as Comlink from "comlink";
export function makeCsvWorker() {
  const worker = new Worker(new URL("./csv.worker.ts", import.meta.url),
    { type: "module" });
  return Comlink.wrap<typeof import("./csv.worker").api>(worker);
}
```

Screen becomes:

```ts
const [busy, startTransition] = useTransition();
const parseRef = useRef<ReturnType<typeof makeCsvWorker>>();
parseRef.current ??= makeCsvWorker();

const handleParse = useCallback(async () => {
  if (!rawText.trim()) return;
  setParsing(true);
  try {
    const res = await parseRef.current!.parse({
      text: rawText, delimiter: delimiter || undefined,
      hasHeader, trimWS,
    });
    setParsed(res); // columnar + profiles already computed off-thread
    setColConfigs(res.columns.map((name, i) => ({
      original: name, alias: name,
      type: res.profiles[i].type, include: true,
    })));
  } catch (e) {
    toast.error(String(e));
  } finally {
    setParsing(false);
  }
}, [rawText, delimiter, hasHeader, trimWS]);
```

If uDSV's strict-quote streaming caveat is a concern for messy files, keep PapaParse as the worker engine but with `worker:true` semantics already satisfied (it runs in our worker) and `step`/`chunk` to stream:

```ts
Papa.parse(text, {
  header: hasHeader, delimiter: delimiter || undefined,
  skipEmptyLines: true, dynamicTyping: false,
  chunkSize: 1 << 20, // 1MB chunks
  chunk: (results) => pushColumnar(results.data),
  complete: () => resolve(finalize()),
});
```

### 2.2 Triple full-table passes per render

`transformed`, `allTransformed`, and `filteredTotal` all walk every row; `allTransformed` re-casts every row on each filter keystroke.

**Fixes:**
1. **Cast once, in the worker.** The worker returns already-typed columnar data; the renderer never calls `castValue` per render.
2. **Filter via arquero, debounced.** Build one arquero table from the columnar arrays and let it filter; memoize the compiled predicate.

```ts
import { table } from "arquero";

const at = useMemo(() =>
  parsed ? table(Object.fromEntries(
    parsed.columns.map((c, i) => [c, parsed.columnar[i]]))) : null,
[parsed]);

const debouncedFilter = useDeferredValue(filterExpr);
const filtered = useMemo(() => {
  if (!at) return null;
  const pred = compileFilter(debouncedFilter); // parse once
  return pred ? at.filter(pred) : at;
}, [at, debouncedFilter]);

const filteredTotal = filtered?.numRows() ?? 0;
```

`filteredTotal` now comes free from `filtered.numRows()`; no third pass.

### 2.3 Non-virtualized preview table

500 rows × N cols of DOM with per-cell `.find()` is the render killer.

**Fix — `@tanstack/react-table` (column model, columnVisibility) + `@tanstack/react-virtual` (rows AND columns).** Both are already deps and used in `DataBrowserScreen` / telecom `data-grid.tsx`.

```tsx
const rowVirt = useVirtualizer({
  count: viewRows.length, getScrollElement: () => scrollRef.current,
  estimateSize: () => 28, overscan: 12,
});
const colVirt = useVirtualizer({
  horizontal: true, count: columns.length,
  getScrollElement: () => scrollRef.current,
  estimateSize: (i) => colWidths[i] ?? 140, overscan: 4,
});
// render only rowVirt.getVirtualItems() x colVirt.getVirtualItems()
```

Replace `colConfigs.find()` with a precomputed `Map<string, ColConfig>` (or read straight off the table column model).

### 2.4 Registration round-trip

`handleLoadDB` rebuilds a CSV string then re-imports. For the **Electron native path** this is unnecessary — the file is already on disk and already registered. The in-browser path should write the **original** bytes (or an Arrow IPC/Parquet buffer), not a re-serialized CSV.

**Fix:** when the source is a real file, register the path directly (already done in Path A). For paste-only data, write the raw pasted text to OPFS/disk once and `read_csv` it — skip `rowsToCSV` entirely. Even better: hand DuckDB an Arrow buffer built from the columnar arrays via `arrow.tableToIPC`, and `CREATE VIEW ... FROM arrow_scan(...)`.

### 2.5 Type detection sampling mismatch

`detectType` samples 200 rows (`:551`) but casting applies to all rows. Push inference to uDSV's `inferSchema` (whole-buffer, cheap) or, for the Electron path, to DuckDB `sniff_csv()` which returns a confidence-scored dialect + per-column types over a configurable sample. Surface that in the column panel as "detected (92% confidence)".

---

## 3. Offline gaps and how to close them

The feature is already offline-capable (no network calls). The real gaps are **resilience, persistence, and parity**:

1. **No draft persistence.** `rawText`, `parsed`, and `colConfigs` are React-only; a reload loses everything. **Fix:** debounced autosave of `{rawText, delimiter, colConfigs}` to OPFS (`navigator.storage.getDirectory()`) or Dexie (already in the radar's Adopt list), keyed by a session id; restore on mount. Call `navigator.storage.persist()` at app start (Tech Radar Domain 1).

2. **Profiling parity.** The paste path only has preview stats. **Fix:** in the worker compute real full-column stats with `simple-statistics` (quantiles, mean, stdev, mode, null %, approx-distinct via a HyperLogLog-lite or a `Set` cap), and for the Electron path call the existing `summarizeDataset` (`shared-duckdb.ts:345`) and render its `SUMMARIZE` output (min/max/avg/std/q25/q50/q75/count/null%). This closes the "metadataSource: preview" gap noted in `upload-to-duckdb.ts:70`.

3. **Browser DuckDB fallback (Trial).** `handleLoadDB`/`handleOpenLocalDataset` hard-fail outside Electron (`:414`, `:636`). For a web build, lazy-load `@duckdb/duckdb-wasm` (COI bundle) in a worker so registration + SUMMARIZE + large-file OPFS parsing work without Electron. Gate behind `isElectron()` with a WASM fallback module.

4. **Large-file dead-end.** Files `>= 16MB` are refused in the browser. **Fix:** stream them from an OPFS file handle through uDSV/PapaParse `chunk` mode in the worker, never loading the whole string; or in Electron just register the path (already supported).

5. **Rejected-rows capture.** Only `result.errors.slice(0,3)` is shown. **Fix:** Electron path — pass `store_rejects=true` to `read_csv` and query `reject_errors`/`reject_scans` into a "Data quality" panel (row #, column, error type, raw line). Browser path — collect uDSV/PapaParse error rows into the same panel. All offline.

---

## 4. Better architecture and implementation (step-by-step)

### 4.1 Split the monolith

`CsvParserScreen.tsx` is 1405 lines. Decompose:

```
src/features/csv-parser/
  screens/CsvParserScreen.tsx        // orchestration only
  workers/csv.worker.ts              // uDSV/PapaParse + profiling (Comlink)
  workers/useCsvWorker.ts
  components/SourcePanel.tsx          // textarea, dropzone, paste, settings
  components/ColumnConfigBar.tsx      // rename/type/include
  components/FilterBar.tsx
  components/PreviewGrid.tsx          // tanstack-table + virtual
  components/ProfilePanel.tsx         // per-column stats + uPlot histograms
  components/RejectsPanel.tsx         // bad rows
  lib/profile.ts                      // pure stat functions (tested)
  lib/filter.ts                       // compileFilter (tested)
  lib/duckdb-register.ts             // path/Arrow registration helpers
  state/use-csv-store.ts             // zustand slice (matches app pattern)
```

### 4.2 Worker contract (columnar + profiled)

The worker returns **columnar** data and **profiles in one shot** so the renderer does zero heavy work. See the `ParseResult` shape in §2.1. Transferring columnar typed arrays (Float64Array/Int32Array where possible) is transferable and cheap.

### 4.3 Pure, tested helpers

```ts
// lib/filter.ts — compile once, run many
type Pred = (row: Record<string, unknown>) => boolean;
export function compileFilter(expr: string): Pred | null {
  if (!expr.trim()) return null;
  const m = expr.match(/^(\w+)\s*(>=|<=|!=|=|>|<)\s*(.+)$/i);
  if (m) {
    const [, col, op, raw] = m;
    const target = raw.trim().replace(/^['"]|['"]$/g, "");
    const nB = Number(target);
    return (row) => {
      const v = row[col];
      const nA = Number(v);
      switch (op) {
        case "=":  return String(v ?? "").toLowerCase() === target.toLowerCase();
        case "!=": return String(v ?? "").toLowerCase() !== target.toLowerCase();
        case ">":  return nA > nB; case "<": return nA < nB;
        case ">=": return nA >= nB; case "<=": return nA <= nB;
      }
      return true;
    };
  }
  const like = expr.match(/^(\w+)\s+LIKE\s+%(.+)%$/i);
  if (like) {
    const [, col, sub] = like; const s = sub.toLowerCase();
    return (row) => String(row[col] ?? "").toLowerCase().includes(s);
  }
  return null;
}
```

```ts
// lib/profile.ts
import { quantileSorted, mean, standardDeviation, mode } from "simple-statistics";
export function profileColumn(name: string, col: unknown[], type: Type): ColProfile {
  let nulls = 0; const seen = new Set<string>(); const nums: number[] = [];
  for (const v of col) {
    if (v === null || v === "" || v === undefined) { nulls++; continue; }
    if (seen.size < 10_000) seen.add(String(v)); // cap distinct cost
    if (type === "number") { const n = Number(v); if (!Number.isNaN(n)) nums.push(n); }
  }
  const out: ColProfile = { name, type, nullCount: nulls, distinctApprox: seen.size };
  if (nums.length) {
    nums.sort((a, b) => a - b);
    out.min = nums[0]; out.max = nums.at(-1);
    out.mean = mean(nums);
    out.hist = histogram(nums, 24); // for uPlot sparkline
  }
  return out;
}
```

### 4.4 Electron path: native sniff + summarize

```ts
// in duckdb-service.ts (main) — expose sniff + rejects
const sniff = await conn.run(`FROM sniff_csv(${q(path)}, sample_size=20480)`);
// returns Delimiter, Quote, Columns[], with confidence
await conn.run(`
  CREATE VIEW ${view} AS
  SELECT * FROM read_csv(${q(path)}, auto_detect=true,
    store_rejects=true, sample_size=${sampleSize});
`);
const rejects = await conn.run(`SELECT * FROM reject_errors LIMIT 200`);
const summary = await conn.run(`SUMMARIZE ${view}`);
```

Surface `sniff` confidence in the column bar, `summary` in the profile panel, `rejects` in the rejects panel — all the heavy lifting in native DuckDB, zero JS row iteration.

### 4.5 Preview grid (virtualized)

```tsx
export function PreviewGrid({ columns, getCell, rowCount, colWidths }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rv = useVirtualizer({ count: rowCount,
    getScrollElement: () => scrollRef.current!, estimateSize: () => 28, overscan: 12 });
  const cv = useVirtualizer({ horizontal: true, count: columns.length,
    getScrollElement: () => scrollRef.current!,
    estimateSize: (i) => colWidths[i] ?? 140, overscan: 4 });
  return (
    <div ref={scrollRef} className="flex-1 overflow-auto">
      <div style={{ height: rv.getTotalSize(), width: cv.getTotalSize(), position: "relative" }}>
        {rv.getVirtualItems().map((vr) =>
          cv.getVirtualItems().map((vc) => (
            <div key={`${vr.index}:${vc.index}`}
              style={{ position: "absolute", transform:
                `translate(${vc.start}px, ${vr.start}px)`,
                width: vc.size, height: vr.size }}>
              {getCell(vr.index, vc.index)}
            </div>
          )))}
      </div>
    </div>
  );
}
```

`getCell(r, c)` reads from the columnar arrays — O(1), no `.find()`.

### 4.6 Skip the CSV round-trip on register

```ts
// lib/duckdb-register.ts
import { tableFromArrays, tableToIPC } from "apache-arrow";
export async function registerColumnar(name: string, cols: Record<string, unknown[]>) {
  const arrowTable = tableFromArrays(cols);
  const ipc = tableToIPC(arrowTable, "stream");
  // Electron main: CREATE VIEW name AS SELECT * FROM arrow_scan(ipc_buffer)
  return registerArrowDataset({ name, ipc });
}
```

No `rowsToCSV`, no disk re-read for paste data.

---

## 5. Recommended dependencies

| Dep | Stars | Maint. | License | Offline | Bundle | Why | URL |
|---|---|---|---|---|---|---|---|
| uDSV | ~753 | Active, v0.7.3 Jul 2025 (1 maint.) | MIT | yes | ~5KB | ~2x faster than PapaParse, streaming + typed schema; paste/OPFS path | https://github.com/leeoniya/uDSV |
| papaparse | ~13k | Active | MIT | yes | ~45KB | Keep as mature fallback; run in worker w/ chunk | https://github.com/mholt/PapaParse |
| comlink | ~12.6k | Active | Apache-2.0 | yes | ~1.1KB | Clean worker RPC | https://github.com/GoogleChromeLabs/comlink |
| @tanstack/react-virtual | ~5.5k | Very active | MIT | yes | ~10KB | Row+col virtualization (already dep) | https://github.com/TanStack/virtual |
| @tanstack/react-table | ~26k | Very active | MIT | yes | ~14KB | Headless grid model (already dep) | https://github.com/tanstack/table |
| @duckdb/node-api | ~31k | Very active | MIT | yes | native | Native parse + sniff + SUMMARIZE + rejects (already dep) | https://github.com/duckdb/duckdb-node-neo |
| apache-arrow | ~14k | Very active | Apache-2.0 | yes | ~43KB gz | Columnar zero-copy worker→grid→DuckDB | https://github.com/apache/arrow |
| @uwdata/flechette | ~0.1k | Active | BSD-3 | yes | ~14KB gz | Lighter Arrow reader (Trial) | https://github.com/uwdata/flechette |
| arquero | ~1.4k | Active | BSD-3 | yes | ~80KB | Structured filter/reshape (already dep) | https://github.com/uwdata/arquero |
| @duckdb/duckdb-wasm | ~2k pkg | Active | MIT | yes | lazy | Browser fallback engine (Trial) | https://github.com/duckdb/duckdb-wasm |
| simple-statistics | ~3.5k | Active | ISC | yes | ~30KB | Profile math (paste path) | https://github.com/simple-statistics/simple-statistics |
| uPlot | ~10.2k | Active | MIT | yes | ~50KB | Tiny histogram sparklines (Trial) | https://github.com/leeoniya/uPlot |

All permissive-licensed, all run with zero runtime network, all medium-PC-friendly (CPU/WASM, no WebGPU requirement).

---

## 6. CLIs and tools (offline)

- **duckdb CLI** — reproduce `sniff_csv` / `SUMMARIZE` / `store_rejects` SQL locally before wiring it. `duckdb -c "FROM sniff_csv('x.csv');"`
- **size-limit** (already in repo) — add a `csv-parser` route budget + a `csv.worker` budget; gate uDSV/arrow/arquero additions.
- **tinybench / Vitest bench** (already in repo) — prove uDSV vs PapaParse throughput and cast/filter hot paths on representative CSVs.
- **react-scan** — confirm the triple-useMemo re-render storm is gone after virtualization + deferred filter.
- **@lhci/cli** — offline TBT/INP on the route before/after worker migration.
- **knip** (already in repo) — remove dead `csvEscape`/`rowsToCSV` if the CSV round-trip is eliminated.

---

## 7. Phased tasks

### P1 — Stop blocking the main thread + virtualize (highest impact, low risk)
1. Add `src/features/csv-parser/workers/csv.worker.ts` + `useCsvWorker` (Comlink); move `Papa.parse` (or uDSV) + trim + type-detect + profiling into it; return **columnar** data.
2. Replace the preview `<table>` with a `@tanstack/react-virtual` row+col virtualized grid; precompute a `Map` for column config, kill per-cell `.find()`.
3. Debounce/`useDeferredValue` the filter; compile the predicate once (`lib/filter.ts`); derive `filteredTotal` from the filtered view, eliminating the third pass.
4. Cast **once** in the worker; delete `allTransformed`'s per-render re-cast.
5. Add `react-scan` + `tinybench` checks; add `size-limit` budgets.

### P2 — Real profiling, native pushdown, no round-trip
6. Electron path: emit `sniff_csv` (confidence) + `SUMMARIZE` (real stats) + `store_rejects` (reject_errors); surface them in `ProfilePanel` + `RejectsPanel`. Call the existing `summarizeDataset` from the screen.
7. Paste path: compute full-column stats with `simple-statistics` in the worker; add `uPlot` mini-histograms.
8. Register paste data via Arrow IPC (`tableFromArrays` → `arrow_scan`) instead of `rowsToCSV` + disk re-read.
9. Split `CsvParserScreen.tsx` into the component/lib/state structure in §4.1; add unit tests for `lib/filter.ts` and `lib/profile.ts`.

### P3 — Browser parity, persistence, large files
10. Lazy-load `@duckdb/duckdb-wasm` (COI/COOP-COEP) worker fallback so register/SUMMARIZE/large-file work without Electron; gate behind `isElectron()`.
11. OPFS draft autosave/restore of `{rawText, delimiter, colConfigs}`; call `navigator.storage.persist()`.
12. Stream `>=16MB` files from an OPFS file handle via uDSV/PapaParse `chunk` mode in the worker (remove the hard refusal).
13. Optional: swap renderer-side `apache-arrow` for `@uwdata/flechette` to shrink the route bundle.
