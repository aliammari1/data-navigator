# Implementation Brief — Cluster: CSV / Import correctness

**Status:** ready-to-implement. Downstream agents implement directly from this without re-researching.
**Hard constraints:** 100% offline at runtime (no CDN, no `INSTALL ... FROM community`, no network fetch). Medium-end PC (4-core, 8 GB, **no WebGPU**). Current stable package APIs only.
**App shape:** Electron + Next.js 16. DuckDB (native `@duckdb/node-api`) runs in the **Electron main process** only; the renderer talks to it over IPC. Browser-only parsing/preview runs in **Web Workers** wrapped with Comlink.

> Verified against the code on disk and against npm/official READMEs on **2026-06-12**.
> Installed today: `papaparse@5.5.3`, `comlink@4.4.2`, `apache-arrow@21.1.0`, `arquero@8.0.3`, `dexie@4.4.3`, `simple-statistics@7.9.0`, `@duckdb/node-api@1.5.3-r.3`.
> NOT installed yet (this cluster adds them): `udsv@0.7.3`, `chardet@2.1.1`, `hyparquet@1.26.0` (+ optional `hyparquet-compressors@1.1.1`).

---

## 0. THE #1 OFFLINE GOTCHA (read first)

**Every package in this cluster is pure-JS / pure-WASM-free and ships its own code in the npm tarball — none fetch anything at runtime. There is NO wasm/model/tile/font asset to self-host for this cluster.** That is the good news. The two real offline traps are:

1. **`udsv`'s typed methods use `new Function()` (codegen).** `parser.typedArrs/typedObjs/typedCols/typedDeep` and `parser.chunk(..., parser.typed*)` dynamically generate a converter function. **A strict CSP without `unsafe-eval` will throw at parse time.** This app already runs `udsv` inside a **Web Worker** and the renderer CSP must allow worker eval, OR we use the **string methods** (`stringArrs/stringCols`) and cast manually with the existing `castValue` in `lib/profile.ts`. **Decision: keep type inference via `inferSchema` for the schema, but parse with `stringCols()` and cast with our own `castValue`, so CSP `unsafe-eval` is NOT required.** (If worker CSP already allows eval — verify `electron/security.ts` CSP for worker context — you may use `typedCols()` directly and delete the manual cast.)

2. **DuckDB encoding for the Electron path is a built-in core feature, NOT an extension.** `read_csv(..., encoding='utf-8'|'utf-16'|'latin-1')` is core in DuckDB ≥ 1.2 (we ship 1.5.3). It needs **no `INSTALL`/`LOAD`** and is offline-safe. `chardet` runs in **main process** over the first ~64 KB to pick that encoding. Never bundle `chardet` decisions into a network call.

COOP/COEP: already set unconditionally by `electron/security.ts:196-197` (`COOP: same-origin`, `COEP: require-corp`) so `crossOriginIsolated === true` everywhere. No new header work for this cluster. The Comlink workers (`new Worker(new URL(...), { type: "module" })`) already work under this config — `useCsvWorker.ts` is the proven pattern.

---

## 1. Package: `papaparse` (worker:true streaming) — keep, fix usage

- **Install:** already installed `papaparse@5.5.3` (+ `@types/papaparse`). MIT.
- **Where it runs:** TWO valid placements — pick by source size.
  - **Already correct in repo:** `src/features/csv-parser/workers/csv.worker.ts` runs `Papa.parse(text, ...)` *inside our own Comlink worker* — this already satisfies the "never block the main thread" goal without `worker:true`. Keep this for the paste/`rawText` (string-in-memory) path.
  - **For File/Blob streaming** (large dropped files, browser path) use Papa's own `worker:true` + `chunk` on the **main thread** (Papa spawns its own internal worker).

### 1.1 Current correct streaming API (verified papaparse.com/docs)

**HARD RULE: do NOT use `step` and `chunk` together.** Pick one. Use `chunk` for throughput (columnar batching), `step` only if you need per-row backpressure.

```ts
// File/Blob streaming on the MAIN thread; Papa runs its own worker internally.
import Papa from "papaparse";

Papa.parse<Record<string, string>>(file /* File | Blob */, {
  worker: true,               // Papa's internal worker; keeps UI responsive
  header: hasHeader,
  delimiter: delimiter || "", // "" = auto-detect
  skipEmptyLines: "greedy",
  dynamicTyping: false,       // we cast ourselves (consistent typing)
  chunkSize: 1 << 20,         // 1 MB chunks (override Papa.LocalChunkSize 10MB)
  chunk: (results, _parser) => {
    // results.data: Record<string,string>[] for THIS chunk
    pushColumnar(results.data);          // append into per-column arrays
    collectErrors(results.errors);       // capture rejected rows (see §1.2)
  },
  complete: () => resolve(finalize()),
  error: (err) => reject(err),
});
```

- `chunk(results, parser)` and `step(results, parser)` share the same signature. `results.data` is the rows for that callback; `results.errors` is `ParseError[]` for that slice.
- `Papa.WORKERS_SUPPORTED` — gate `worker:true` on this boolean; fall back to `worker:false` (still streams) if false.
- **`worker:true` caveat:** `parser.pause()/resume()` do NOT work inside Papa's worker. We don't pause, so this is fine.
- **Why keep Papa at all:** it is the mature fallback when `udsv`'s strict-quote streaming chokes on messy/embedded-newline CSVs. `udsv` is the fast default; Papa is the robustness net.

### 1.2 Rejected-row capture (pitfall the plan flags)

Today `csv.worker.ts:62` keeps `result.errors.slice(0, 50)`. Keep collecting `results.errors` across all chunks into a `RejectsPanel` feed: `{ row, code, type, message }`. Do not silently drop.

### 1.3 Pitfalls

- Do NOT pass a giant `rawText` string to `Papa.parse` synchronously on the main thread (the original bug at `CsvParserScreen.tsx:526`). Either keep it inside our Comlink worker (current `csv.worker.ts`) or stream the File with `worker:true`.
- `delimiter: ""` triggers auto-detect; pass an explicit delimiter only when the user overrides.
- `header:true` yields objects keyed by header; `header:false` yields string arrays — `csv.worker.ts:inferPositionalColumns` already handles the headerless case.

---

## 2. Package: `udsv` (streaming parse + typed schema inference) — ADD, fast default

- **Install:** `npm i udsv@0.7.3` (pin exact — single maintainer, low bus factor). MIT, ~5 KB min, zero deps.
- **Import (ESM):** `import { inferSchema, initParser } from "udsv";`
- **Where it runs:** inside `src/features/csv-parser/workers/csv.worker.ts` (replace/augment the Papa call for the string path), and in a streaming variant for OPFS/File chunks.
- **Offline/self-host:** pure JS in the tarball, nothing to self-host. **CSP caveat from §0.1 applies to typed methods.**

### 2.1 Whole-string parse (paste path) — schema inference + columnar

```ts
import { inferSchema, initParser } from "udsv";

// 1) infer schema (delimiter, column names, per-column types) from the buffer.
//    Second arg overrides detection: { delim, rowDelim, quoteDelim, escapeDelim }.
const schema = inferSchema(text, delimiter ? { delim: delimiter } : undefined);
const parser = initParser(schema);

// 2a) CSP-SAFE path (NO unsafe-eval): get string columns, cast with our castValue.
const stringCols = parser.stringCols(text);          // string[][], one array per column
const columns = schema.cols.map((c) => c.name);
const types = stringCols.map((col) => detectType(col));        // lib/profile.ts
const columnar = stringCols.map((col, i) => col.map((v) => castValue(v, types[i])));

// 2b) FAST path (requires worker CSP to allow eval): typed columnar in one shot.
// const columnar = parser.typedCols(text);          // unknown[][], already cast by uDSV
// const types = schema.cols.map((c) => mapUdsvType(c.type));
```

- uDSV auto-detected types: `string | number | boolean | date | json | null`. Map to our `ColType` (`string|number|date|boolean`); treat `json`/`null` as `string`.
- `schema.cols[i]` has `.name`, `.type`, and an overridable `.parse` hook: `schema.cols[2].parse = (s) => s.split("-")` before `initParser`.
- Output method matrix (verified README): `stringArrs/stringObjs/stringCols` (raw strings, fastest, CSP-safe) vs `typedArrs/typedObjs/typedCols/typedDeep` (cast, uses codegen). **`*Cols` is what we want — already columnar, no transpose.**

### 2.2 Incremental / streaming parse (OPFS file, large File, >16 MB path)

This is the real win over Papa for the in-worker large-file path — no full-string materialization.

```ts
import { inferSchema, initParser } from "udsv";

let parser: ReturnType<typeof initParser> | null = null;

// Web stream of text chunks (e.g. file.stream().pipeThrough(new TextDecoderStream()))
for await (const strChunk of textChunks) {
  // init from the FIRST chunk only
  parser ??= initParser(inferSchema(strChunk, delim ? { delim } : undefined));
  // accumulate string columns (CSP-safe); pass parser.stringArrs / parser.stringCols
  parser.chunk(strChunk, parser.stringArrs);
}
const rows = parser!.end();            // string[][] (array-of-tuples) when accumulating

// MEMORY-EFFICIENT (non-accumulating) — pass a reducer as 3rd arg; end() returns nothing useful
let nullCounts = new Int32Array(colCount);
for await (const strChunk of textChunks) {
  parser ??= initParser(inferSchema(strChunk, delim ? { delim } : undefined));
  parser.chunk(strChunk, parser.stringArrs, (row) => {
    // process row immediately (profile/stream into DuckDB), never buffered
  });
}
parser!.end();
```

- **Exact signatures (verified README):**
  - `inferSchema(csvStr, opts?)` — `opts`: `{ delim, rowDelim, quoteDelim, escapeDelim }`.
  - `initParser(schema)`.
  - `parser.chunk(strChunk, method, reducer?)` — `method` is `parser.stringArrs | parser.typedArrs | parser.stringCols | ...`; `reducer?` (row) => void switches to non-accumulating mode.
  - `parser.end()` — returns accumulated result (only meaningful without a reducer).
- **CSP:** prefer `parser.stringArrs`/`stringCols` in `chunk()` to avoid codegen. Cast after with `castValue`.

### 2.3 Pitfalls

- uDSV's streaming assumes chunk boundaries can split mid-row — it buffers the partial line internally; that is handled, but do NOT pre-split on `\n` yourself. Feed raw decoded text chunks straight from the stream.
- Schema is inferred from the FIRST chunk only in streaming mode — for wildly heterogeneous files, infer from a larger first read (e.g. first 256 KB) before starting `chunk()`.
- Single maintainer (`leeoniya`, same as uPlot): **pin the exact version**; MIT lets you vendor if needed.

---

## 3. Package: `chardet` (encoding detection feeding DuckDB `read_csv(encoding=)`) — ADD, main process

- **Install:** `npm i chardet@2.1.1`. MIT, pure JS, zero native deps.
- **Import:** ESM `import chardet from "chardet";` / CJS `const chardet = require("chardet");`
- **Where it runs:** **Electron main process ONLY** — `electron/duckdb-service.ts` (new `detectEncoding` helper), called before `read_csv`. Never import into the renderer (no need; main owns file paths).
- **Offline/self-host:** pure JS, nothing to host.

### 3.1 Detect over first ~64 KB + BOM fast-path, then feed DuckDB

```ts
// electron/duckdb-service.ts (main)
import chardet from "chardet";
import { openSync, readSync, closeSync } from "node:fs";

export function detectEncoding(filePath: string): "utf-8" | "utf-16" | "latin-1" {
  const fd = openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(65536);                 // first 64 KB is plenty
    const n = readSync(fd, buf, 0, buf.length, 0);
    const head = buf.subarray(0, n);
    // BOM fast-path (more reliable than statistical guess)
    if (head[0] === 0xff && head[1] === 0xfe) return "utf-16";       // UTF-16LE
    if (head[0] === 0xfe && head[1] === 0xff) return "utf-16";       // UTF-16BE
    if (head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf) return "utf-8";
    const guess = (chardet.detect(head) ?? "UTF-8").toLowerCase();
    if (guess.includes("utf-16")) return "utf-16";
    if (guess.includes("1252") || guess.includes("8859") || guess.includes("latin"))
      return "latin-1";
    return "utf-8";
  } finally {
    closeSync(fd);
  }
}
```

- **API (verified v2.1.1):**
  - `chardet.detect(Buffer | Uint8Array): string | null` — sync, returns e.g. `'UTF-8'`, `'ISO-8859-1'`, `'UTF-16LE'`, `'windows-1252'`.
  - `chardet.analyse(buf): { confidence: number; name: string; lang?: string }[]` — sorted desc by confidence; use for a confidence tie-breaker / UI display.
  - `await chardet.detectFile(path, { sampleSize?, offset? })` — async, reads the file itself; **but** prefer the manual 64 KB `readSync` above so we control the slice and add the BOM path.
- **DuckDB only accepts three encodings:** `utf-8`, `utf-16`, `latin-1`. Map everything else (windows-1252, ISO-8859-*) to `latin-1`.

### 3.2 Wire into `buildCsvOptions` (electron/duckdb-service.ts:258)

The current `buildCsvOptions` (lines 258-277) omits `encoding`. Add it:

```ts
function buildCsvOptions(options: {
  hasHeader?: boolean;
  delimiter?: string;
  sampleSize?: number;
  encoding?: "utf-8" | "utf-16" | "latin-1";   // NEW
  storeRejects?: boolean;                       // NEW (rejects panel)
}): string {
  const parts = [
    "auto_detect = true",
    `header = ${options.hasHeader ?? true}`,
    "strict_mode = false",
    "null_padding = true",
    `sample_size = ${options.sampleSize ?? DEFAULT_CSV_SAMPLE_SIZE}`,
    "max_line_size = 10000000",
    `encoding = ${quoteSqlString(options.encoding ?? "utf-8")}`,   // NEW
  ];
  if (options.delimiter) parts.push(`delim = ${quoteSqlString(options.delimiter)}`);
  if (options.storeRejects) parts.push("store_rejects = true");    // NEW
  return parts.join(", ");
}
```

Call `detectEncoding(sourcePath)` in `registerCSVPathDataset` (around `duckdb-service.ts:575`), pass result into `buildCsvOptions`, and surface the detected value to the renderer so `UploadSettings.encoding` becomes a pre-filled override. After a `store_rejects=true` read, query rejects for the panel:

```sql
SELECT line, column_name, error_message FROM reject_errors LIMIT 200;
```

### 3.3 Pitfalls

- `chardet.detect` returns `null` on empty/ambiguous input — always default to `'utf-8'`.
- Do not feed a UTF-16 file to DuckDB as UTF-8 — that mojibakes accented telecom exports (`café`, `Müller`). The BOM path catches the common UTF-16LE-with-BOM case deterministically.
- `chardet` is MIT (renderer-safe in principle), but there is **no reason to bundle it into the renderer** — keep it main-only to avoid bloat. (`jschardet` is LGPL — if added as a tie-breaker, keep it main-process only.)

---

## 4. Package: `hyparquet` (zero-DuckDB Parquet preview) — ADD, browser/quick-peek path

- **Install:** `npm i hyparquet@1.26.0` and (for compressed Parquet) `npm i hyparquet-compressors@1.1.1`. MIT, pure JS, zero deps.
- **Import:**
  ```ts
  import {
    asyncBufferFromFile, parquetMetadataAsync, parquetReadObjects, parquetSchema,
  } from "hyparquet";
  import { compressors } from "hyparquet-compressors"; // snappy/gzip/zstd/brotli/lz4
  ```
- **Where it runs:** a Comlink worker for the browser/non-Electron path (instant Parquet "peek" before booting any heavier engine), and optionally main process for a fast Parquet metadata read without spinning DuckDB. Suggested file: `src/features/data-import/workers/parquet-preview.worker.ts` (NEW) + reuse the `useCsvWorker` pattern.
- **Offline/self-host:** pure JS in the tarball, nothing to host. **`hyparquet-compressors` is REQUIRED for any non-trivial Parquet** because real files are almost always Snappy/Zstd-compressed; hyparquet core only handles uncompressed + Snappy natively, so always pass `compressors`.

### 4.1 Metadata + row sample for instant preview

```ts
// From a Node file path (main process) or use asyncBufferFromUrl in browser.
const file = await asyncBufferFromFile(parquetPath);   // AsyncBuffer

// 1) metadata (row groups, row count, schema) — cheap, reads only the footer.
const metadata = await parquetMetadataAsync(file);
const schema = parquetSchema(metadata);
const columnNames = schema.children.map((c) => c.element.name);
const totalRows = Number(metadata.num_rows);           // BigInt → number

// 2) read just the first N rows for preview (row-window, not whole file).
const previewRows = await parquetReadObjects({
  file,
  compressors,                 // REQUIRED for Snappy/Zstd/Gzip files
  rowStart: 0,
  rowEnd: 100,                 // preview window only
  // columns: ["a", "b"],      // optional column projection
  // rowFormat: "object",      // 'object' (default) | 'array'
});
// previewRows: Record<string, any>[]
```

### 4.2 From an ArrayBuffer / dropped File (browser path)

```ts
// hyparquet accepts a raw ArrayBuffer / Node Buffer directly wherever AsyncBuffer is expected.
const buf = await file.arrayBuffer();                  // File → ArrayBuffer
const metadata = await parquetMetadataAsync(buf);
const rows = await parquetReadObjects({ file: buf, compressors, rowStart: 0, rowEnd: 100 });
```

- **API (verified v1.26.0):**
  - `parquetMetadataAsync(file): Promise<metadata>` (sync `parquetMetadata(arrayBuffer)` also exists for a fully-buffered file).
  - `parquetReadObjects({ file, columns?, rowStart?, rowEnd?, rowFormat?, utf8?, compressors? }): Promise<Record<string,any>[]>`.
  - `parquetSchema(metadata)` → nested schema; column names via `schema.children.map(e => e.element.name)`.
  - `asyncBufferFromFile(path)` (Node) / `asyncBufferFromUrl({ url, byteLength?, requestInit? })` (browser; for offline use a `blob:`/OPFS URL, never a network URL).

### 4.3 Pitfalls

- **Without `hyparquet-compressors`, a Snappy/Zstd Parquet throws "unsupported codec".** Always pass `compressors`. It is the single most common hyparquet mistake.
- hyparquet returns BigInt for `num_rows` and INT64 columns — coerce with `Number()` for display (watch >2^53).
- This is a **preview-only** tool. For full registration/SQL over Parquet on the Electron path, keep using native DuckDB `read_parquet` (already wired). hyparquet's role is the fast browser "peek" and the no-DuckDB metadata read, not the analytical engine.
- `asyncBufferFromUrl` must NOT hit the network in this app — only use it with local `blob:`/OPFS object URLs.

---

## 5. OPFS draft autosave (resilience — paste path persistence)

Plan gap: `rawText`, `parsed`, `colConfigs` live only in React state and are lost on reload/crash. Close it with OPFS (already available; `crossOriginIsolated` true). No new dependency — `dexie@4.4.3` is also available as an alternative store.

```ts
// src/features/csv-parser/lib/draft-store.ts (NEW) — OPFS, debounced
const DRAFT = "csv-parser-draft.json";

export async function saveDraft(draft: {
  rawText: string; delimiter: string; colConfigs: ColConfig[];
}): Promise<void> {
  const root = await navigator.storage.getDirectory();
  const fh = await root.getFileHandle(DRAFT, { create: true });
  const w = await fh.createWritable();
  await w.write(new Blob([JSON.stringify(draft)]));
  await w.close();
}

export async function loadDraft(): Promise<unknown | null> {
  try {
    const root = await navigator.storage.getDirectory();
    const fh = await root.getFileHandle(DRAFT);           // throws if absent
    return JSON.parse(await (await fh.getFile()).text());
  } catch { return null; }
}
```

- Call `await navigator.storage.persist()` once at app start (request durable storage).
- Debounce `saveDraft` (~500 ms) off the React state; restore via `loadDraft` on `CsvParserScreen` mount.
- **Offline note:** OPFS is fully local; no network. `getDirectory()` requires a secure context — Electron `file://`/app origin qualifies.

---

## 6. Where each piece wires into the repo (exact paths)

| Concern | File (exists / NEW) | Action |
|---|---|---|
| In-worker string parse + profile | `src/features/csv-parser/workers/csv.worker.ts` (exists) | Add `udsv` `inferSchema`+`stringCols` path; keep Papa as fallback engine. Keep returning the columnar `ParseResult`. |
| Streaming large File/OPFS | `src/features/csv-parser/workers/csv.worker.ts` (exists) | Add a `parseStream(stream)` method using `udsv` `parser.chunk(..., parser.stringArrs)` (§2.2) or Papa `worker:true`+`chunk` (§1.1). |
| Worker RPC hook | `src/features/csv-parser/workers/useCsvWorker.ts` (exists) | Extend the proxy surface with the new stream method. Comlink pattern already proven. |
| Shared types | `src/features/csv-parser/lib/types.ts` (exists) | Add a `RejectRow` type + `rejects: RejectRow[]` on `ParseResult`. |
| Cast / profile / type-detect | `src/features/csv-parser/lib/profile.ts` (exists) | Reuse `detectType`/`castValue`/`profileColumn` for the CSP-safe uDSV `stringCols` path. Add `mapUdsvType` if using `typedCols`. |
| Encoding detect (main) | `electron/duckdb-service.ts` (exists) | Add `detectEncoding` (§3.1); extend `buildCsvOptions` with `encoding` + `storeRejects` (§3.2); query `reject_errors`. |
| Encoding override UI | `src/features/data-import/model/types.ts` + `DataImportScreen.tsx` (exist) | Pre-fill `UploadSettings.encoding` from detected value; pass through IPC. |
| Parquet quick-preview | `src/features/data-import/workers/parquet-preview.worker.ts` (NEW) | `hyparquet` metadata + 100-row read (§4); Comlink-wrapped like `useCsvWorker`. |
| OPFS draft autosave | `src/features/csv-parser/lib/draft-store.ts` (NEW) | §5; wire into `CsvParserScreen` mount/unmount + debounced save. |
| Rejects panel | `src/features/csv-parser/components/` (dir exists) | New `RejectsPanel.tsx` fed by `ParseResult.rejects` (browser) and `reject_errors` (Electron). |

`src/workers/*` (`llm.worker.ts`, `ml.worker.ts`, `python-sandbox.worker.ts`) are the global-worker precedent; the CSV/Parquet workers stay feature-local under `src/features/*/workers/` per the existing `csv.worker.ts` convention.

---

## 7. Install command (one line)

```bash
npm i udsv@0.7.3 chardet@2.1.1 hyparquet@1.26.0 hyparquet-compressors@1.1.1
```

(`papaparse`, `comlink`, `apache-arrow`, `arquero`, `dexie`, `simple-statistics`, `@duckdb/node-api` already installed.)

## 8. Verification checklist (offline, medium-PC)

- [ ] Encoding matrix: UTF-8, UTF-8+BOM, UTF-16LE+BOM, ISO-8859-1, Windows-1252 fixtures → `detectEncoding` picks correctly and `café`/`Müller` round-trip through DuckDB preview.
- [ ] uDSV `stringCols` path parses without `unsafe-eval` (CSP-safe); typed path only if worker CSP allows eval.
- [ ] Papa `worker:true`+`chunk` streams a >100 MB File without freezing the UI; rejected rows land in the panel.
- [ ] hyparquet previews a Snappy AND a Zstd Parquet with `compressors` passed (no "unsupported codec").
- [ ] No network request issued during any import (DevTools/Electron net log empty).
- [ ] OPFS draft survives a reload of the CSV parser screen.
