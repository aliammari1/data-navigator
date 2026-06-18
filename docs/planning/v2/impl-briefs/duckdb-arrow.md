# Implementation Brief — Cluster: DuckDB SQL pushdown + Arrow IPC

**Status:** ready-to-implement. Downstream agents implement directly from this without re-researching.
**Hard constraints:** 100% offline at runtime (no CDN, no `INSTALL ... FROM community`, no network), medium-end PC (4-core, 8 GB, no WebGPU), current stable APIs only.
**App shape:** Electron + Next.js 16. DuckDB runs in the **Electron main process** only; the renderer talks to it over IPC. This is already correct — do not migrate the desktop hot path to duckdb-wasm.

> Verified against the code on disk and against installed package type definitions on 2026-06-12. Installed versions: `@duckdb/node-api@1.5.3-r.3`, `apache-arrow@21.1.0`, `@uwdata/flechette@2.5.0`, `comlink@4.4.2`, `@tanstack/react-virtual@3.14.2`, `arquero@8.0.3`.

---

## 0. THE #1 OFFLINE GOTCHA (read this first)

**`@duckdb/node-api` 1.5.3 (DuckDB Neo) has NO native Arrow / Arrow-IPC export.** Verified directly in the installed type definitions: `DuckDBResultReader` / `DuckDBResult` expose only chunk/row/column converters (`getColumnsObjectJS`, `getRowObjectsJS`, `fetchChunk`, `convertColumns`, …) — there is **no** `arrow()`, `arrowIPCStream()`, or `arrowIPCAll()` method. Those methods belong to the **old callback `duckdb` package**, not Neo. (Tracking issue: duckdb/duckdb-node-neo #45, still open / "C API Parity" milestone.)

**DuckDB's SQL-side Arrow IPC (`COPY ... TO '*.arrows'` / `read_arrow()` / `to_arrow_ipc()`) lives in the `arrow` COMMUNITY extension**, installed via `INSTALL arrow FROM community; LOAD arrow;` — that is a **network operation and is FORBIDDEN** by the offline constraint. Do **not** use it. (Source: DuckDB blog "Arrow IPC Support in DuckDB", 2025-05-23.)

### Offline-correct Arrow IPC path (this is the contract for the whole cluster)

Build the Arrow IPC buffer **in the Electron main process with `apache-arrow`**, from DuckDB's native columnar output, and ship it as a **transferable `ArrayBuffer`** over IPC. Decode in the renderer/worker with `@uwdata/flechette` (light) or `apache-arrow`.

```
DuckDB Neo (main)                          IPC boundary          Renderer / Worker
─────────────────                          ────────────          ─────────────────
conn.runAndReadAll(sql)                                          flechette.tableFromIPC(buf)
  → reader.getColumnsObjectJS()    ──┐                             → table.getChild(name)
apache-arrow tableFromArrays(cols) ──┤  transfer(ArrayBuffer)      → table.toColumns()
apache-arrow tableToIPC(table,'stream') ┘  (zero structured-clone) → lazy columnar reads
```

Why this is correct and offline-safe:
- No extension install, no network. `apache-arrow` is pure JS and already a dependency.
- The `ArrayBuffer` crosses Electron IPC as a **transferable** (no expensive structured-clone of N×cols cells).
- Renderer reads columns lazily — no row↔object transposition, no JSON parse.

Keep the existing JSON path (`getRowObjectsJS()` → `Record<string,unknown>[]`) for **small** results (aggregates, ≤ ~200 rows, previews). Only use Arrow IPC for **large row windows / exports / worker hand-off** where serialization dominates. Do not Arrow-ify tiny KPI rows — it is net slower.

---

## 1. Package: `@duckdb/node-api` (DuckDB Neo) — the engine + SQL pushdown

- **Install name / version:** `@duckdb/node-api` — installed `1.5.3-r.3` (keep). MIT. Wraps released DuckDB binaries; no source build.
- **Where it runs:** Electron **main only**. Already wired in `electron/duckdb-service.ts`. Renderer never imports it.
- **Offline/self-host:** the npm package bundles the native DuckDB binary per platform — fully offline. **Never call `INSTALL`/`LOAD`** for any extension (they fetch from the community repo / network). `app/main.ts` already blocks those keywords in `assertReadOnlySql` (good). Parquet, CSV, `SUMMARIZE`, `histogram`, `approx_*`, `corr`, sampling, keyset pagination are all **core built-ins** — no extension needed.

### 1.1 Init (already present — `electron/duckdb-service.ts:490-545`)

```ts
import { type DuckDBConnection, DuckDBInstance } from "@duckdb/node-api";

instance = await DuckDBInstance.create(dbPath, { threads });
writeConn = await instance.connect();
// + a small pool of read connections (READ_CONN_COUNT = 3) for concurrent reads
```

**Tuning to add** (medium-end PC; set once on each connection right after connect, alongside the existing `PRAGMA threads` / `enable_progress_bar`):

```ts
// cap cores so the renderer/compositor stay responsive; cap RAM so a big scan can't OOM 8GB
const threads = String(Math.max(2, Math.min((os.availableParallelism?.() ?? 4) - 1, 6)));
await conn.run(`PRAGMA threads = ${threads}`);
await conn.run(`PRAGMA memory_limit = '4GB'`);
await conn.run(`PRAGMA temp_directory = '${tmpSpillDir}'`);   // spill to disk instead of OOM
await conn.run(`PRAGMA max_temp_directory_size = '20GB'`);
await conn.run(`PRAGMA enable_object_cache`);                 // cache Parquet footers across queries
```

### 1.2 Reading results — the three correct shapes

```ts
// (a) Small JSON rows (existing measureRows pattern) — KEEP for aggregates/preview
const result = await conn.run(sql);
const rows = await result.getRowObjectsJS();                 // Record<string, unknown>[]

// (b) Columnar (needed to build Arrow) — use the reader
const reader = await conn.runAndReadAll(sql);                // reads all chunks
const cols = reader.getColumnsObjectJS();                    // Record<string, unknown[]>  (column-major)
const names = reader.columnNames();
const types = reader.columnTypes();

// (c) Bounded streaming (large preview windows) — read only the rows the UI needs
const r = await conn.runAndReadUntil(sql, 1000);             // stop after ≥1000 rows
r.getRowObjectsJS();                                         // first page only
```

> Note: `getColumnsObjectJS()` returns DuckDB→JS-converted values (BigInt for `BIGINT`, etc.). When building Arrow, normalize JS types (see 2.2) so `apache-arrow` infers a sane schema.

### 1.3 Profiling / stats SQL — collapse N×scans into 1 (the biggest perf win)

These are the pushdown queries the feature plans (`parsed-data`, `ai-analysis`, `data-transform`, `telecom`) all need. Verified signatures (DuckDB docs, current):

**Whole-dataset profile — ONE scan via `SUMMARIZE`.** Returns per column: `column_name, column_type, min, max, approx_unique, avg, std, q25, q50, q75, count, null_percentage`. Quantiles/`approx_unique` are **approximate** (T-Digest / HyperLogLog) — that is the point: cheap.

```sql
SUMMARIZE SELECT * FROM "view_name";
-- DuckDB ≥0.10: SUMMARIZE is itself a table source, so you can project/filter:
SELECT column_name, min, max, approx_unique, null_percentage, avg, std, q25, q50, q75
FROM (SUMMARIZE SELECT * FROM "view_name");
```

**Per-selected-column detail — ONE scan.** (Lazy; only for the column the user clicked.)

```sql
-- top-K most frequent values (Filtered Space-Saving) — returns a LIST
SELECT approx_top_k("col", 10) AS top_values FROM "view_name";

-- exact distinct is expensive; use approximate (HyperLogLog) for cardinality
SELECT approx_count_distinct("col") AS distinct_approx FROM "view_name";
```

**Histogram — there are TWO different APIs. Use the right one:**

```sql
-- (A) histogram AGGREGATE: returns a MAP(bucket -> count). No bin_count arg.
--     signatures: histogram(arg) | histogram(arg, boundaries) | histogram_exact(arg, elements)
SELECT histogram("col") FROM "view_name";
SELECT histogram("col", [0, 100, 200, 300]) FROM "view_name";  -- explicit upper boundaries

-- (B) histogram TABLE MACRO (DuckDB ≥1.1): THIS is the one with bin_count.
--     FROM histogram(table, column, bin_count := N, technique := 'equi-width' | 'sample' | 'auto')
FROM histogram("view_name", "col", bin_count := 20);

-- equi-width boundaries helper, if you want to drive the aggregate form yourself:
SELECT equi_width_bins(min_val, max_val, 20, nice := true);
```

> PITFALL: the v2 feature plans wrote `histogram(col, bin_count := 20)` as an **aggregate** — that is WRONG and will error. `bin_count` only exists on the **table macro** `FROM histogram(tbl, col, bin_count := N)`. Use form (A) (aggregate, MAP) inside a `SELECT`, or form (B) (`FROM histogram(...)`) as a table source — never mix them.

**Other pushdown the JS code currently does by hand (push to SQL, one pass):**

```sql
-- exact quantiles (force a sort; only when exactness is explicitly requested)
quantile_cont("col", 0.5)            -- median; quantile_cont("col", [0.25,0.5,0.75]) for a list
-- approximate quantiles (cheap; prefer these)
approx_quantile("col", 0.5)          -- T-Digest
-- shape
skewness("col"), kurtosis("col")     -- kurtosis = excess (Fisher), bias-corrected
-- correlation: ONE query for the upper triangle, NOT per-column JS zip (which misaligns after NULL filter)
SELECT corr("a","b") AS r_ab, corr("a","c") AS r_ac, corr("b","c") AS r_bc FROM "view_name";
-- modal value (affected by ordering)
mode("col")
```

**Unbiased sampling — never `LIMIT n` for stats** (it takes the first N physical rows = biased on sorted/clustered data):

```sql
SELECT * FROM "view_name" USING SAMPLE reservoir(2000 ROWS);
SELECT * FROM "view_name" USING SAMPLE reservoir(2000 ROWS) REPEATABLE (100);  -- deterministic seed
-- percentage form uses system sampling by default:
SELECT * FROM "view_name" USING SAMPLE 5%;
```

### 1.4 Keyset / seek pagination — replace `LIMIT n OFFSET page*size`

OFFSET makes DuckDB's Top-N materialize `n+offset` rows; deep pages on millions of rows degrade linearly and can OOM. Keyset is O(window) regardless of depth. Build in `electron/duckdb-service.ts` (main owns SQL) or in a `model/sql.ts` helper used by main.

```sql
-- forward page after the last-seen sort key, with a stable tiebreaker (rowid)
SELECT *, rowid
FROM "view_name"
WHERE ( "sortCol" > $lastSortVal )
   OR ( "sortCol" = $lastSortVal AND rowid > $lastRowid )   -- composite predicate per ORDER key
ORDER BY "sortCol" ASC, rowid ASC
LIMIT 100;
```

Keep an OFFSET path only for rare "jump to page N". Cache `COUNT(*)` per `(view, whereClause)` — it is invariant across page/sort; for the empty filter use the catalog `rowCount`.

### 1.5 CSV import params used by this cluster (`buildCsvOptions`, `duckdb-service.ts:258`)

Current builder omits `encoding` and `store_rejects`. Add both (DuckDB ≥1.2 supports `encoding`; project is on 1.5.3):

```sql
-- encoding: supported values 'utf-8' (default), 'utf-16', 'latin-1'
read_csv('file.csv', auto_detect = true, header = true, strict_mode = false,
         null_padding = true, sample_size = 20480, max_line_size = 10000000,
         encoding = 'latin-1',          -- NEW: pass the detected/overridden encoding
         store_rejects = true)          -- NEW: capture coerced/skipped rows
```

After a `store_rejects = true` read, two **temp** tables exist (query them in the same connection/session):

```sql
FROM reject_scans;    -- one row per scan: scanner config
FROM reject_errors;   -- one row per faulty line
-- reject_errors columns (verified): scan_id, file_id, line, line_byte_position, byte_position,
--   column_idx, column_name, error_type (ENUM), csv_line, error_message
SELECT line, column_name, error_type, error_message FROM reject_errors LIMIT 20;
SELECT count(*) AS bad_rows FROM reject_errors;
```

Encoding detection itself (chardet/BOM sniff) is the `data-import` cluster's job; this cluster just plumbs the `encoding` param through `buildCsvOptions`.

---

## 2. Package: `apache-arrow` (JS) — build & serialize Arrow IPC in MAIN

- **Install name / version:** `apache-arrow` — installed `21.1.0` (keep, make explicit; it is also transitive). Apache-2.0. Pure JS, fully offline.
- **Role in this cluster:** in **Electron main**, turn DuckDB columnar output into an Arrow `Table` and serialize to an **IPC stream buffer**. This is the offline replacement for the missing native Arrow export (see §0).
- **Key API (verified in `apache-arrow@21.1.0` exports):** `tableFromArrays`, `makeTable`, `Table`, `vectorFromArray`, `tableToIPC`, `tableFromIPC`, `RecordBatchStreamWriter`.

### 2.1 Minimal correct main-process helper (`electron/duckdb-service.ts`, new export)

```ts
import { tableFromArrays, tableToIPC } from "apache-arrow";

/** Run a read-only query and return Arrow IPC STREAM bytes (offline; no extension). */
export async function runReadOnlyQueryArrow(rawSql: string): Promise<Uint8Array> {
  return enqueueRead(async () => {
    await ensureInit();
    const conn = getReadConnection();
    const sql = assertReadOnlySql(rawSql);                 // reuse existing guard

    const reader = await conn.runAndReadAll(sql);          // DuckDB Neo reader
    const cols = reader.getColumnsObjectJS();              // Record<string, unknown[]> (column-major)
    const normalized = normalizeColumnsForArrow(cols, reader.columnTypes()); // see 2.2

    const table = tableFromArrays(normalized);             // infers schema from JS arrays
    return tableToIPC(table, "stream");                    // Uint8Array, IPC streaming format
  });
}
```

- Use **`"stream"`** format (not `"file"`) — flechette and apache-arrow `tableFromIPC` both read the stream format, and it is what you want for IPC transfer.
- `tableToIPC` returns a `Uint8Array`. Ship `.buffer` (an `ArrayBuffer`) as a **transferable** (§3).

### 2.2 JS-type normalization before `tableFromArrays` (the subtle gotcha)

`getColumnsObjectJS()` yields `BigInt` for `BIGINT/HUGEINT`, JS `Date`/temporal objects for timestamps, and the DuckDB value wrappers for some types. `tableFromArrays` infers the Arrow type from the JS values, so normalize:

```ts
function normalizeColumnsForArrow(
  cols: Record<string, unknown[]>,
  types: { typeId: number }[],   // from reader.columnTypes(); map by column order
): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {};
  for (const [name, values] of Object.entries(cols)) {
    out[name] = values.map((v) => {
      if (typeof v === "bigint") {
        // keep as BigInt for true 64-bit; or Number(v) if the column fits in 2^53 and the
        // renderer wants plain numbers. Decide per column; be consistent app-wide.
        return v;
      }
      if (v instanceof Date) return v;           // apache-arrow handles Date → Timestamp
      return v;                                  // strings/numbers/booleans/null pass through
    });
  }
  return out;
}
```

If you need precise control over the schema (e.g. force `Float64` for a numeric column that is all-null in the sample), build vectors explicitly with `vectorFromArray` / `makeTable` instead of `tableFromArrays`. For 95% of cases `tableFromArrays` is enough.

### 2.3 Decoding in the renderer/worker (apache-arrow path)

```ts
import { tableFromIPC } from "apache-arrow";
const table = tableFromIPC(new Uint8Array(buf));   // buf: ArrayBuffer from IPC
const col = table.getChild("amount");              // Vector, lazy
const v = col?.get(rowIndex);                       // random access by row
table.numRows;                                      // row count
```

Prefer **flechette** in the renderer to shrink bundle (§4); use apache-arrow on the renderer side only if you already need its richer type system there.

---

## 3. Shipping Arrow IPC across Electron IPC as a transferable

Electron `ipcRenderer.invoke` already structured-clones the return value. An `ArrayBuffer` returned from the main handler is sent **without a deep clone** (it is cloned by transfer of the underlying memory for `ArrayBuffer`/`TypedArray` in the structured clone algorithm — far cheaper than cloning an array of N row objects). The path:

```
duckdb-service.ts  runReadOnlyQueryArrow(sql): Promise<Uint8Array>      // returns bytes
        ↓ (main.ts ipcMain.handle)
main.ts            ipcMain.handle("duckdb:runReadOnlyQueryArrow",
                     (e, sql) => withTrustedSender(e, () =>
                       duckdbService.runReadOnlyQueryArrow(sql)))        // return the Uint8Array
        ↓ (preload.ts electronDuckDB)
preload.ts         runReadOnlyQueryArrow: (sql) =>
                     ipcRenderer.invoke("duckdb:runReadOnlyQueryArrow", sql)  // : Promise<Uint8Array>
        ↓ (shared-duckdb.ts ipc wrapper + timeout)
shared-duckdb.ts   runReadOnlyQueryArrow(sql): Promise<Uint8Array>      // add to DuckDBBridgeApi + SharedDuckDB
        ↓ (duckdb.ts public renderer API)
duckdb.ts          export async function runReadOnlyQueryArrow(sql): Promise<Uint8Array>
```

> Return `Uint8Array` (not `ArrayBuffer`) from the main handler — Electron serializes typed arrays fine, and the renderer passes `buf` straight to `tableFromIPC`. If you hand it to a Web Worker afterward, **then** use a true transfer:

```ts
// renderer → worker hand-off with Comlink (zero-copy)
import * as Comlink from "comlink";
const bytes = await runReadOnlyQueryArrow(sql);            // Uint8Array
await worker.decode(Comlink.transfer(bytes, [bytes.buffer]));  // transfers the ArrayBuffer
```

Wire the new method in all four files exactly mirroring the existing `runReadOnlyQuery` entries:
- `electron/duckdb-service.ts` — add `runReadOnlyQueryArrow` export (code in §2.1).
- `electron/main.ts:411` — add `ipcMain.handle("duckdb:runReadOnlyQueryArrow", ...)` next to the existing `duckdb:runReadOnlyQuery`.
- `electron/preload.ts:159` — add `runReadOnlyQueryArrow` to the `electronDuckDB` object.
- `src/platform/duckdb/shared-duckdb.ts` — add to `DuckDBBridgeApi`, `SharedDuckDB`, and the impl (reuse the `ipc()` wrapper, 60s timeout).
- `src/platform/duckdb/duckdb.ts` — export the public `runReadOnlyQueryArrow(sql)`.

---

## 4. Package: `@uwdata/flechette` — renderer-light Arrow read

- **Install name / version:** `@uwdata/flechette` — installed `2.5.0` (keep). BSD-3-Clause. ~14 kB gzip vs ~43 kB for apache-arrow; 2-11× faster extraction. Same lab as Arquero (Arquero v8 uses it internally), pure JS, offline.
- **Role:** decode the Arrow IPC `Uint8Array` in the **renderer or a worker**, hand typed columns straight to the grid/charts. Use this as the default renderer reader; keep apache-arrow on the main side for *writing* IPC.
- **Key API (verified in `@uwdata/flechette@2.5.0` exports):** `tableFromIPC`, `tableToIPC`, `tableFromColumns`, `tableFromArrays`, `columnFromArray`, `Table`, `Column`.

### 4.1 Decode (renderer/worker)

```ts
import { tableFromIPC } from "@uwdata/flechette";

// buf: ArrayBuffer | Uint8Array | Uint8Array[]  (stream format)
const table = tableFromIPC(buf, { useBigInt: false });  // ExtractionOptions: coerce BigInt→Number etc.

table.numRows;                       // number
table.numCols;                       // number
const col = table.getChild("amount"); // Column<T>; column-major
col.at(rowIndex);                     // random access by row (lazy)
const obj = table.at(rowIndex);       // one row object { col: value, ... }
const columns = table.toColumns();    // { name: ValueArray } — feed typed arrays to charts (uPlot/ECharts)
const rows = table.toArray();         // row objects[] — only when you truly need rows
```

- `ExtractionOptions` lets you control BigInt/date coercion at decode time — set `useBigInt: false` if the grid/charts want plain numbers (avoids the §2.2 ambiguity surfacing in the renderer).
- For the data grid, read via `getChild(name).at(row)` lazily inside the virtualizer's `getVirtualItems()` loop — never materialize the whole table to row objects.

### 4.2 When to use which reader

| Side | Library | Function | Why |
|---|---|---|---|
| Main (write) | `apache-arrow` | `tableFromArrays` + `tableToIPC(t,'stream')` | builds IPC from DuckDB columns; richer type system for encode |
| Renderer/worker (read) | `@uwdata/flechette` | `tableFromIPC` | smallest bundle, fastest extract, lazy columns |
| Renderer (read, if already imported) | `apache-arrow` | `tableFromIPC` | only if you need apache-arrow's Vector API elsewhere |

Both readers consume the **same** stream-format bytes produced in §2.1 — they are interchangeable on the wire.

---

## 5. Where each piece wires into the repo (concrete file map)

DuckDB cluster touches `src/platform/duckdb/*`, `electron/*`, and the per-feature worker dirs. Engine code stays in main; Arrow decode + columnar reads go in workers.

**Platform / engine (main + renderer bridge):**
- `electron/duckdb-service.ts` — engine. Add: tuning pragmas (§1.1), `runReadOnlyQueryArrow` (§2.1), profiling helpers (`profileDataset` = single `SUMMARIZE`; `profileColumnDetail` = `approx_top_k` + `FROM histogram(...)`), keyset `generateKeysetSQL` (§1.4), `encoding`/`store_rejects` in `buildCsvOptions` (§1.5).
- `electron/main.ts` — add `ipcMain.handle("duckdb:runReadOnlyQueryArrow", ...)` and handlers for any new profiling/detail IPC (mirror the block at lines 269-413, all behind `withTrustedSender`).
- `electron/preload.ts` — add the new methods to the `electronDuckDB` bridge object (lines 127-161).
- `src/platform/duckdb/shared-duckdb.ts` — extend `DuckDBBridgeApi` + `SharedDuckDB` + impl with the new methods (reuse `ipc()` + `withTimeout`).
- `src/platform/duckdb/duckdb.ts` — export the new public renderer functions (`runReadOnlyQueryArrow`, `profileDataset`, `profileColumnDetail`).
- `src/platform/duckdb/upload-to-duckdb.ts` — pass `encoding`/`storeRejects` through to registration; surface `reject_errors` count in the returned descriptor.

**Workers (Arrow decode + columnar post-processing off the main thread):**
- `src/features/parsed-data/worker/profile.worker.ts` (exists) — decode `SUMMARIZE` rows / Arrow into `ColProfile[]`; build chart option arrays from `table.toColumns()`.
- `src/features/ai-analysis/worker/analysis.worker.ts` (exists) — run the single-pass stats/corr SQL via the renderer Arrow proxy; decode with flechette; do GESD/clustering on typed columns.
- `src/features/deep-analytics/workers/analytics.worker.ts` (exists) — same pattern for heavy analytics.
- New, per `data-browser`/`telecom`: `src/features/data-browser/data/grid.worker.ts` — `tableFromIPC` the keyset page, expose lazy `getChild(col).at(row)` to the virtualized grid; stream exports.
- `src/workers/*` (`ml.worker.ts`, `llm.worker.ts`) — unaffected by this cluster.

**Renderer consumers (read columns, virtualize):**
- `src/features/data-browser/screens/DataBrowserScreen.tsx` — large windows via `runReadOnlyQueryArrow` → worker → flechette → `@tanstack/react-virtual`.
- `src/features/telecom/lib/queries.ts` + `components/data-grid.tsx` — `fetchFilteredPage` via Arrow for wide raw rows; keep JSON for tiny KPI rows.
- `src/features/parsed-data/screens/ParsedDataScreen.tsx`, `src/features/ai-analysis/screens/AiAnalysisScreen.tsx`, `src/features/data-transform/screens/DataTransformScreen.tsx` — call `profileDataset`/`profileColumnDetail` (single-scan) instead of per-column loops.

---

## 6. No self-hosted assets required for THIS cluster

- `@duckdb/node-api` binary ships in the npm package → offline. No wasm/model/tile/font to place in `public/` or `models/`.
- `apache-arrow` and `@uwdata/flechette` are pure JS → offline, no assets.
- **COOP/COEP/CORP** (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`, `Cross-Origin-Resource-Policy: same-origin`) are **already set** in `electron/security.ts` (verified) for cross-origin isolation. This cluster does **not** need SharedArrayBuffer (native DuckDB is in main, not wasm), so COOP/COEP are not a hard requirement here — but they are already correct and must not be removed (the duckdb-wasm browser-fallback cluster depends on them).
- The only place wasm/COOP/COEP matters is a hypothetical **non-Electron web build** using `@duckdb/duckdb-wasm` (the COI bundle, ~3.5 MB, lazy-loaded in a worker) — **out of scope for this cluster**; it is the browser-fallback cluster's concern.

---

## 7. Pitfalls checklist (do NOT repeat these)

1. **Do not call any Neo Arrow method** — `arrow()`/`arrowIPCStream()`/`arrowIPCAll()` do not exist in `@duckdb/node-api`. Build IPC with apache-arrow in main (§2.1).
2. **Do not `INSTALL arrow FROM community` / `LOAD arrow`** — network, forbidden offline. The `assertReadOnlySql` guard already blocks `INSTALL`/`LOAD`; keep it.
3. **`histogram(col, bin_count := N)` as an aggregate is invalid.** `bin_count` is only on the **table macro** `FROM histogram(tbl, col, bin_count := N)`. Aggregate form is `histogram(col)` / `histogram(col, boundaries)` and returns a MAP.
4. **Never `LIMIT n` to sample for statistics** — biased. Use `USING SAMPLE reservoir(n ROWS)`.
5. **Never compute correlations by per-column `LIMIT` + JS zip** — arrays misalign after NULL filtering and it is O(cols²) on the main thread. Use one `corr(a,b)` query per upper-triangle pair.
6. **Do not Arrow-ify tiny results** — for ≤ ~200 aggregate rows, JSON (`getRowObjectsJS`) is faster than building+serializing+decoding an Arrow table. Arrow IPC is for large windows/exports only.
7. **Normalize BigInt/temporal before `tableFromArrays`** (§2.2), or decode with flechette `{ useBigInt: false }` (§4.1) — otherwise the renderer gets BigInt where it expects Number, and `JSON.stringify` on results will throw.
8. **OFFSET deep-paging OOMs** on millions of rows — use keyset pagination (§1.4); reserve OFFSET for rare jump-to-page.
9. **`reject_errors`/`reject_scans` are temp tables for the session** — query them on the same connection right after the `store_rejects` read, before it is reused for another scan.
10. **`SUMMARIZE` quantiles/`approx_unique` are approximate** — correct and intended; if a feature genuinely needs exact distinct/quantiles, gate it behind an explicit "compute exact" action (`count(distinct col)` / `quantile_cont`), do not pay it for every column on every load.
11. **`COUNT(*)` is invariant across page/sort** — cache it per `(view, where)`; use catalog `rowCount` for the empty filter; run it in parallel with the data query, not before it.
12. **Use IPC `"stream"` format**, not `"file"`, for `tableToIPC` — both flechette and apache-arrow `tableFromIPC` read stream bytes directly.

---

## Sources

- DuckDB Neo client overview — https://duckdb.org/docs/stable/clients/node_neo/overview ; package — https://www.npmjs.com/package/@duckdb/node-api
- Neo lacks native Arrow (tracking) — https://github.com/duckdb/duckdb-node-neo/issues/45
- Arrow IPC is a COMMUNITY extension (network install) — https://duckdb.org/2025/05/23/arrow-ipc-support-in-duckdb ; https://duckdb.org/community_extensions/extensions/arrow
- SUMMARIZE — https://duckdb.org/docs/current/guides/meta/summarize
- Aggregate functions (histogram/approx_*/corr/skewness/kurtosis/mode) — https://duckdb.org/docs/current/sql/functions/aggregates.html
- histogram table macro + equi_width_bins — https://duckdb.org/docs/current/sql/functions/utility ; https://github.com/duckdb/duckdb/issues/2268
- Samples (USING SAMPLE reservoir) — https://duckdb.org/docs/current/sql/samples
- Reading faulty CSV / store_rejects / reject_errors — https://duckdb.org/docs/current/data/csv/reading_faulty_csv_files.html
- apache-arrow JS (tableFromArrays/tableToIPC/tableFromIPC) — https://www.npmjs.com/package/apache-arrow ; https://github.com/apache/arrow-js
- flechette (tableFromIPC, ExtractionOptions) — https://github.com/uwdata/flechette ; https://www.npmjs.com/package/@uwdata/flechette
