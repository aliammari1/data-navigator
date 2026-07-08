# Feature Plan — data-import — File/data import pipeline (dropzone, exceljs, encoding)

**Maturity:** functional

## Performance issues

- Fake/simulated progress: processFilePath() hardcodes progress 10/35/75 and inserts an artificial `await new Promise(r=>setTimeout(r,80))` (DataImportScreen.tsx:318-321). The single blocking call is loadUploadPathToDuckDB() which streams the whole CSV->Parquet COPY on the main process with NO progress feedback, so on a 500MB file the UI sits at 35% for many seconds with no signal.
- Sequential batch import: importFromFolder() and importFromFiles() iterate `for (const filePath of supported) { await processFilePath(filePath); }` (DataImportScreen.tsx:478-480, 504-510). Each file fully blocks the next AND each calls router.push(getUploadSuccessPath()) at line 423, so navigation fires on the FIRST completed file and aborts the rest of the batch.
- router.push fires inside per-file success branch (line 423) — for multi-file/folder imports this navigates away mid-batch, orphaning every subsequent file and leaving the screen unmounted while async work continues.
- Whole-state immer rebuild per progress tick: every update() call runs produce(prev, draft=>...) over the ENTIRE files array (lines 307-313). With many session files and 5 status transitions each, this re-clones and re-renders the full list + AnimatePresence motion children on each tick.
- No virtualization of the session file list or preview rows. UploadedFilesPanel maps all files with motion.button (AnimatePresence) and previewRows.slice(0,50) is materialized into Dataset state; for folder imports of hundreds of files this is unbounded DOM.
- File size is never read: every ParsedFileInfo.size is hardcoded 0 (line 282) and Dataset.sizeBytes:0 (line 378). totalStorageUsed, UploadSummaryCard storage stats, and getDisplaySize() all show 'Fichier local' / 0 — wasted compute and misleading UI.
- Redundant preview profiling done twice: buildPreviewColumnMetadata() in upload-to-duckdb.ts recomputes null/distinct/min/max/mean over preview rows in JS (lines 206-242), then computeQualityScores() + columnInfoToColMeta() re-walk the same columns in the renderer (helpers.tsx). DuckDB already has SUMMARIZE/approx stats over the FULL table — this JS work is both duplicated and only preview-accurate.
- Quality scores computed from a 100-row preview sample (computeQualityScores called with loaded.previewRows.length, line 348-350) but presented as dataset-wide completeness/accuracy — statistically meaningless on large files and recomputed on the main thread.
- Dead exceljs/XLSX path: model/xlsx.ts parseXLSXRows() loads the full workbook into memory via workbook.xlsx.load(buffer) and does an O(rows*cols) eachRow/eachCell with a getRow(1).getCell() header lookup PER CELL — quadratic and main-thread; it is unused here but is the pattern the feature would regress to if XLSX import is added naively.
- DEFAULT_CSV_SAMPLE_SIZE = 20_480 rows sniffed for dialect/type detection (duckdb-service.ts:41) with no cap surfaced to the user; on pathological wide files the sniff itself is a cost with no progress.
- No streaming Arrow result transport for preview — preview rows come back as Record<string,unknown>[] JSON over IPC (measureRows), not Arrow IPC, so large previewLimit values pay JSON serialize/parse on both sides.

## Offline gaps

- Encoding is dead UI with NO offline fallback: UploadSettings.encoding ('UTF-8'|'ISO-8859-1'|'UTF-16', types.ts:59) is set in state (DataImportScreen.tsx:240-248) but NEVER passed to DuckDB. buildCsvOptions() (duckdb-service.ts:258-277) omits the `encoding` parameter that DuckDB 1.2+ supports (project ships @duckdb/node-api 1.5.3). Latin-1/UTF-16 telecom exports — a stated target — will mojibake or fail with no detection and no user override.
- No character-encoding detection at all. There is no chardet/jschardet step and no BOM sniff; a UTF-16LE file with a BOM is fed to read_csv as UTF-8. This is a pure local/offline gap — encoding detection is a bundled-library concern, not a network one.
- Browser/non-Electron path is a dead end: onDrop() only sets a notice string (lines 513-517) and loadUploadFileToDuckDB() throws by design (upload-to-duckdb.ts:317-332). There is no offline File-based fallback (duckdb-wasm + OPFS registerFileHandle, or hyparquet preview) so the web build cannot import anything — even though everything needed runs locally.
- Drag-and-drop accepts File objects but cannot use them: the dropzone is configured (lines 519-529) yet drops are rejected because File lacks a trusted path. No OPFS copy-then-register bridge exists to make dropped files importable offline.
- XLSX/XLS import is absent from the live pipeline despite exceljs being a dependency and a working xlsxToPipeCSV() converter existing in platform/parsers/xlsx-to-csv.ts. Users with local .xlsx must convert externally — a gap for a fully-offline desktop tool.
- No CSV error/reject surfacing: read_csv runs with strict_mode=false, null_padding=true, ignore_errors-style leniency but DuckDB's reject_errors / reject_scans tables are never queried, so silently dropped/coerced rows are invisible — offline users get no recourse and no log.
- No persistence of import history: model/upload-history.ts ships a hardcoded INITIAL_UPLOAD_HISTORY mock and session files live only in React useState. Nothing is written to Dexie/IndexedDB or the DuckDB app_datasets catalog view for the screen, so import history is lost on reload (the catalog exists in main but the screen never reads it).

## Recommended dependencies

| Package | Category | Stars | Maint. | License | Offline | Replaces | Why | URL |
|---|---|---|---|---|---|---|---|---|
| `@duckdb/node-api (already installed 1.5.3-r.3)` | data-engine | 1.5k (neo) / 31k core | Very active, official DuckDB org | MIT | yes | manual encoding/dialect detection | Already the primary engine. The fix is to USE its 1.2+ `encoding` read_csv param and `sniff_csv`/`reject_errors` tables — no new dep, just expose existing capability. read_csv streams CSV->Parquet off disk with native SIMD. | https://github.com/duckdb/duckdb-node-neo |
| `chardet` | encoding-detection | 301 | Active (runk/node-chardet), v2.1.1, 45M weekly downloads | MIT | yes | no detection (silent mojibake) | Pure-JS/TS ICU-style encoding detector. Run in Electron main over the first ~64KB of the file to auto-pick UTF-8/UTF-16/Latin-1 and feed DuckDB's `encoding` param. Tiny, zero native deps, fully offline. | https://github.com/runk/node-chardet |
| `jschardet` | encoding-detection | 739 | Active, v3.1.4, ~1M weekly downloads; used by VSCode/Atom | LGPL-2.1 (note: copyleft — keep in main process, do not bundle into renderer) | yes | — | Alternative/cross-check detector (Mozilla universalchardet port) with stronger multibyte/legacy coverage. Use as a confidence tie-breaker behind chardet; LGPL is acceptable for an unmodified main-process dependency but record it. | https://github.com/aadsm/jschardet |
| `@duckdb/duckdb-wasm` | data-engine (browser fallback) | 2k (wasm) / 31k core | Active, official | MIT | yes | the throwing loadUploadFileToDuckDB() | Only needed IF a non-Electron web build ships. Lazy-load in a Worker, registerFileHandle() over an OPFS-copied dropped File, then read_csv — closes the browser drag-and-drop dead end fully offline. COI bundle needs COOP/COEP headers. | https://github.com/duckdb/duckdb-wasm |
| `hyparquet` | preview | ~1.3k | Actively maintained, pure-JS zero-dep | MIT | yes | duckdb-wasm for quick preview | Read Parquet metadata + a row sample for instant preview in the browser path WITHOUT booting DuckDB-WASM. ~10-20KB. Good for a fast 'peek' before committing to a full register. | https://github.com/hyparam/hyparquet |
| `comlink (already installed 4.4.2)` | workers | 12.6k | Active (GoogleChromeLabs) | Apache-2.0 | yes | raw postMessage | Already a dep. Wrap any browser-side parsing (hyparquet/duckdb-wasm/exceljs) in a Worker via Comlink so the renderer main thread never parses. Glue for the future web fallback. | https://github.com/GoogleChromeLabs/comlink |
| `exceljs (already installed 4.4.0)` | xlsx | 15.4k | Maintenance-mode but stable, MIT | MIT | yes | in-renderer workbook.xlsx.load | Already used by xlsx-to-csv.ts. For XLSX import, use its streaming WorkbookReader in the Electron MAIN process to convert .xlsx -> temp CSV on disk, then hand the path to read_csv — keeps the path-based DuckDB pipeline and avoids loading the whole workbook into renderer memory. | https://github.com/exceljs/exceljs |
| `dexie` | persistence | 13k | Active, Apache-2.0 | Apache-2.0 | yes | hardcoded mock + ephemeral useState | Persist real import history (replace the INITIAL_UPLOAD_HISTORY mock) as small structured records in IndexedDB so the session list survives reload. Already endorsed by the Tech Radar Adopt list. | https://github.com/dexie/Dexie.js |
| `react-dropzone (already installed 15.0.0)` | ui | 10.9k | Active, ~3.5M weekly downloads | MIT | yes | — | Keep — it is the right headless drop zone. The fix is wiring onDrop to an OPFS-copy bridge (web) / native-path resolution (Electron) instead of just showing a notice. No replacement needed. | https://github.com/react-dropzone/react-dropzone |

## CLIs & tools

| Tool | Type | Offline | Why | URL |
|---|---|---|---|---|
| `duckdb (CLI)` | cli | yes | Verify sniff_csv output, encoding handling, and reject_errors locally against real fixture files: `duckdb -c "FROM sniff_csv('fixture.csv')"` and `SELECT * FROM read_csv('x.csv', encoding='latin-1')`. Mirrors exactly what the main process runs. | https://duckdb.org/docs/api/cli |
| `chardet (CLI)` | cli | yes | Sanity-check encoding detection on fixtures from the terminal before wiring it into main: `npx chardet fixture-latin1.csv`. Fully offline. | https://github.com/runk/node-chardet |
| `iconv / iconv-lite` | library | yes | Build deterministic test fixtures in non-UTF-8 encodings (UTF-16LE w/ BOM, ISO-8859-1, Windows-1252) to exercise the detection + DuckDB encoding path; iconv-lite is pure-JS and offline. | https://github.com/ashtuchkin/iconv-lite |
| `vitest + tinybench` | library | yes | Unit-test buildCsvOptions/encoding selection and benchmark the CSV->Parquet register on fixture sizes (1MB/50MB/500MB) with a per-file time budget; both run fully offline. | https://github.com/tinylibs/tinybench |
| `size-limit (@size-limit/preset-app)` | cli | yes | Add a per-worker budget for any new browser-fallback Worker (duckdb-wasm/hyparquet/exceljs) so the web import path does not balloon the bundle. Already in repo. | https://github.com/ai/size-limit |
| `react-scan` | library | yes | Detect the redundant full-list re-renders in UploadedFilesPanel caused by whole-array immer updates; confirm the per-file-id store refactor removes them. | https://github.com/aidenybai/react-scan |

---

# data-import — Deep Improvement Plan

Feature: File/data import pipeline (dropzone, exceljs, encoding)
Code: `src/features/data-import/` + route `src/app/dashboard/upload/page.tsx`
Backend: `src/platform/duckdb/upload-to-duckdb.ts` → `src/platform/duckdb/duckdb.ts` → `electron/duckdb-service.ts` (native DuckDB main process)

---

## 1. Current implementation

### 1.1 Entry points and file map

| File | Lines | Role |
|---|---|---|
| `src/app/dashboard/upload/page.tsx` | 5 | Thin route → renders `DataImportScreen`. |
| `src/features/data-import/screens/DataImportScreen.tsx` | 1154 | The entire UI + orchestration. One file does drop handling, per-file pipeline, DuckDB calls, dataset/store wiring, navigation, and ~8 presentational subcomponents. |
| `src/features/data-import/model/types.ts` | 65 | `UploadStatus`, `ColumnInfo`, `ValidationIssue`, `ParsedFileInfo`, `UploadSettings`. |
| `src/features/data-import/model/helpers.tsx` | 178 | `formatBytes`, `detectFileType`, `getFileIcon`, `inferColumnType`, `computeColumnStats`, `computeQualityScores`, `columnInfoToColMeta`, `StatusStep`. |
| `src/features/data-import/model/xlsx.ts` | 20 | `parseXLSXRows()` — **dead** (only referenced by its own story). |
| `src/features/data-import/model/upload-history.ts` | 23 | Hardcoded `INITIAL_UPLOAD_HISTORY` mock — **dead/placeholder**. |
| `src/platform/duckdb/upload-to-duckdb.ts` | 333 | `loadUploadPathToDuckDB()` (live) and `loadUploadFileToDuckDB()` (throws by design). Builds `LoadedUploadTable` + preview column metadata. |
| `electron/duckdb-service.ts` | ~870 | `registerCSVPathDataset()` / `registerParquetPathDataset()` — native CSV→Parquet COPY, view creation, catalog insert, preview. `buildCsvOptions()` at 258-277. |

### 1.2 The happy path (what actually runs)

1. User clicks **"Fichier local"** / **"Dossier local"** → `importFromFiles()` / `importFromFolder()` (DataImportScreen.tsx:447-511). These are **Electron-only** (`isElectron()` guard).
2. Native `openFileDialog()` returns trusted paths; paths are filtered by `isSupportedImportPath()` (csv/tsv/txt/parquet/pq).
3. For each path, `processFilePath()` (271-445):
   - Pushes an `initial` `ParsedFileInfo` with `size: 0`, `status: 'reading'`.
   - Fakes progress: `update({status:'reading',progress:10})` → `await sleep(80)` → `update({status:'loading_db',progress:35})`.
   - Calls `loadUploadPathToDuckDB(filePath, { tableName, fileExtension, hasHeader, previewLimit:100 })`.
   - Backend (`electron/duckdb-service.ts:555-665`) runs:
     ```sql
     COPY (SELECT * FROM read_csv('<path>', auto_detect=true, header=<h>,
            strict_mode=false, null_padding=true, sample_size=20480,
            max_line_size=10000000 [, delim='\t']))
     TO '<datasetsDir>/<id>.parquet' (FORMAT parquet, COMPRESSION zstd, COMPRESSION_LEVEL 1);
     CREATE OR REPLACE VIEW <viewName> AS SELECT * FROM read_parquet('<cache>.parquet');
     ```
     then `DESCRIBE`/`COUNT`/`LIMIT previewLimit` and inserts into `app_datasets`.
   - Renderer maps columns, builds validation issues, computes quality scores from the **100-row preview**, registers a `Dataset` in `useDataStore`, sets app context + activity, and `router.push()` to `/dashboard/parsed` or `/dashboard/telecom-report`.

This architecture is **fundamentally correct** and matches the Tech Radar: native DuckDB streams CSV off disk, materializes a zstd Parquet cache, and exposes a view. The problems are in the **renderer orchestration**, **encoding**, **progress**, **batching**, and **offline-web** layers — not the engine.

### 1.3 Dropzone today

`react-dropzone` is configured (519-529) but `onDrop()` (513-517) **only sets a notice**: "use the native file picker; drag-and-drop File objects do not expose trusted filesystem paths to DuckDB." So drag-and-drop is decorative. `loadUploadFileToDuckDB()` (upload-to-duckdb.ts:317-332) **throws on purpose**. There is no web import path at all.

---

## 2. Performance bottlenecks and exact fixes

### 2.1 Fake progress → real streaming progress

**Problem.** `processFilePath()` hardcodes `progress: 10/35/75/100` and inserts `await new Promise(r=>setTimeout(r,80))` (318-321). The only real work — the `COPY ... read_csv` — is opaque. On a 500MB CSV the bar sits at 35% for the entire parse.

**Fix.** DuckDB can report progress. Expose a progress channel from main → renderer and drive the bar off byte/row throughput.

Main process (`electron/duckdb-service.ts`), emit progress around the COPY using DuckDB's progress bar callback or a polled `pragma database_size` / row counter. Minimal version: run COPY then poll a side query, but the robust version uses `read_csv` with a streaming row count emitted over IPC:

```ts
// electron/duckdb-service.ts — sketch
async function registerCSVPathDatasetStreaming(input, onProgress: (p:{rows:number;bytes:number})=>void) {
  const conn = getWriteConnection();
  const totalBytes = (await fs.stat(input.filePath)).size;
  // 1) sniff first so the UI can show detected dialect/encoding immediately
  const sniff = await measureRows(conn, `FROM sniff_csv(${q(input.filePath)}, sample_size=20480)`);
  onProgress({ phase: 'sniffed', dialect: sniff[0] });
  // 2) COPY with progress: poll pragma every 250ms on a read connection
  const copyPromise = measureRun(conn, copySql);
  const timer = setInterval(async () => {
    const [{ bytes }] = await measureRows(readConn, `PRAGMA database_size`);
    onProgress({ phase: 'copy', bytes, totalBytes });
  }, 250);
  await copyPromise; clearInterval(timer);
}
```

Preload (`electron/preload.ts`) adds an event channel:
```ts
registerCSVPathDatasetWithProgress: (input, onProgress) => {
  const ch = `duckdb:csvProgress:${crypto.randomUUID()}`;
  ipcRenderer.on(ch, (_e, p) => onProgress(p));
  return ipcRenderer.invoke('duckdb:registerCSVPathDatasetWithProgress', { ...input, _progressChannel: ch })
    .finally(() => ipcRenderer.removeAllListeners(ch));
}
```

Renderer drives the real bar:
```ts
await registerCSVPathDatasetWithProgress(input, (p) => {
  if (p.phase === 'sniffed') update({ status:'parsing', detectedDialect:p.dialect, progress: 15 });
  if (p.phase === 'copy')    update({ status:'loading_db', progress: 20 + Math.round(70 * p.bytes / p.totalBytes) });
});
```

Delete the `setTimeout(80)` and all hardcoded percentages.

### 2.2 Sequential batch + premature navigation

**Problem.** `for (const filePath of supported) { await processFilePath(filePath); }` (478-480, 504-510) runs strictly sequentially, and `processFilePath` calls `router.push()` on **every** success (line 423). For a folder of N files this navigates away after file #1 and unmounts the screen, orphaning #2..N.

**Fix.** (a) Move navigation OUT of `processFilePath`; navigate once after the batch settles. (b) Bound concurrency (native DuckDB is I/O+CPU bound; 2-3 concurrent registers is the sweet spot on a 4-8 core box — more contends on the single write connection).

```ts
async function importBatch(paths: string[]) {
  const CONCURRENCY = 2; // write conn is serialized in main anyway; keep small
  const queue = [...paths];
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const p = queue.shift()!;
      try { await processFilePath(p, { navigate: false }); } catch { /* collected per-file */ }
    }
  });
  await Promise.all(workers);
  const anyDone = filesRef.current.some(f => f.status === 'done');
  if (anyDone) router.push(getUploadSuccessPath());
}
```

Note: because the main process serializes writes via `enqueueWrite`, true parallelism is limited — but overlapping renderer-side preview/profile work with the next file's COPY still wins. The decisive fix is removing the mid-loop `router.push`.

### 2.3 Whole-array immer rebuild per tick

**Problem.** Every `update(patch)` runs `produce(prev, draft => ...)` over the **entire** `files` array (307-313) and triggers a re-render of `UploadedFilesPanel`'s full `AnimatePresence` list on each of ~5 status transitions × N files.

**Fix.** Move per-file mutable progress into a Zustand store keyed by id, and have each `FileRow` subscribe to **its own** slice so only the active row re-renders:

```ts
// import-session-store.ts
interface ImportSessionState {
  files: Record<string, ParsedFileInfo>;
  order: string[];
  patch: (id: string, p: Partial<ParsedFileInfo>) => void;
}
export const useImportSession = create<ImportSessionState>((set) => ({
  files: {}, order: [],
  patch: (id, p) => set((s) => ({ files: { ...s.files, [id]: { ...s.files[id], ...p } } })),
}));

// FileRow subscribes narrowly
const file = useImportSession(s => s.files[id]); // re-renders only when THIS file changes
```

Combined with `motion` `layout` instead of full AnimatePresence re-mount, the active-row update cost drops from O(N) to O(1).

### 2.4 Virtualize the session list (folder imports)

For folder imports of hundreds of files, wrap `UploadedFilesPanel` rows in `@tanstack/react-virtual` (already a project dep per Tech Radar). Render only visible rows; keep `order: string[]` in the store as the virtualization index.

### 2.5 Stop double-profiling; push stats to SQL

**Problem.** `buildPreviewColumnMetadata()` (upload-to-duckdb.ts:206-242) computes null/distinct/min/max/mean in JS over preview rows, then the renderer re-walks them via `computeQualityScores()` + `columnInfoToColMeta()` (helpers.tsx). Both are **preview-only** and therefore wrong for big files, and both run on the main thread.

**Fix.** Compute real, full-table stats once in DuckDB and return them as part of registration. DuckDB's `SUMMARIZE` gives min/max/approx-unique/null% over the full Parquet cache cheaply:

```sql
-- after the view exists, one query for the whole dataset:
SELECT column_name, min, max, approx_unique, null_percentage, avg
FROM (SUMMARIZE SELECT * FROM <viewName>);
```

Return that as `columns[].stats` with `metadataSource: 'full'`. Then `computeQualityScores` consumes accurate `null_percentage` instead of a 100-row sample. Delete the JS min/max/mean loop in `buildPreviewColumnMetadata` (keep only `sample` from preview). This removes duplicated work AND makes quality scores correct.

`inferColumnType` / `computeColumnStats` (helpers.tsx:35-82) become **dead** once SUMMARIZE drives types — delete them.

### 2.6 Arrow IPC for preview (optional, larger previews)

Preview currently returns `Record<string,unknown>[]` JSON over IPC. If preview limits grow (e.g. 1000 rows for a richer grid), switch the preview channel to Arrow IPC bytes (`@duckdb/node-api` can emit Arrow) and decode with `apache-arrow` in the renderer — zero-copy columnar, no JSON parse. Keep JSON for the default 50-100 row preview.

### 2.7 File size

`size` is hardcoded `0` everywhere. In Electron, `fs.stat(path).size` is one cheap call in main; return it in `LoadedUploadTable.sizeBytes` and populate `ParsedFileInfo.size` + `Dataset.sizeBytes`. Cheap correctness fix that unblocks `UploadSummaryCard` storage stats and `getDisplaySize`.

---

## 3. Offline gaps and how to close them

### 3.1 Encoding — the biggest correctness gap

`UploadSettings.encoding` is plumbed into state (240-248) but **never reaches DuckDB**. `buildCsvOptions()` (duckdb-service.ts:258-277) does not emit `encoding`. DuckDB **1.2+** (project ships **1.5.3**) supports `read_csv(..., encoding='utf-8'|'utf-16'|'latin-1')`. A Latin-1/UTF-16 telecom export — explicitly a target — currently mojibakes or errors.

**Two-layer fix, fully offline:**

**(a) Auto-detect in main** with `chardet` over the first 64KB, with a BOM fast-path:
```ts
import chardet from 'chardet';
import { readFileSync, openSync, readSync } from 'node:fs';

function detectEncoding(filePath: string): 'utf-8' | 'utf-16' | 'latin-1' {
  const fd = openSync(filePath, 'r');
  const buf = Buffer.alloc(65536);
  const n = readSync(fd, buf, 0, buf.length, 0);
  const head = buf.subarray(0, n);
  // BOM fast-path
  if (head[0] === 0xff && head[1] === 0xfe) return 'utf-16';
  if (head[0] === 0xfe && head[1] === 0xff) return 'utf-16';
  if (head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf) return 'utf-8';
  const guess = (chardet.detect(head) || 'UTF-8').toLowerCase();
  if (guess.includes('utf-16')) return 'utf-16';
  if (guess.includes('1252') || guess.includes('8859') || guess.includes('latin')) return 'latin-1';
  return 'utf-8';
}
```

**(b) Pass it to DuckDB** in `buildCsvOptions`:
```ts
function buildCsvOptions(o) {
  const parts = [
    'auto_detect = true',
    `header = ${o.hasHeader ?? true}`,
    'strict_mode = false',
    'null_padding = true',
    `sample_size = ${o.sampleSize ?? DEFAULT_CSV_SAMPLE_SIZE}`,
    'max_line_size = 10000000',
    `encoding = ${quoteSqlString(o.encoding ?? 'utf-8')}`, // NEW
  ];
  if (o.delimiter) parts.push(`delim = ${quoteSqlString(o.delimiter)}`);
  return parts.join(', ');
}
```

Surface the detected encoding in the UI (the `UploadSettings.encoding` select becomes a real override with the auto-detected value pre-filled). `jschardet` can be added as a confidence tie-breaker (LGPL → keep main-process only, never bundle into renderer).

### 3.2 Browser / web import dead end

`onDrop()` only warns; `loadUploadFileToDuckDB()` throws. For a non-Electron build there is **no** import path even though everything can run locally. Close it with an OPFS-backed DuckDB-WASM worker:

```ts
// browser-import.worker.ts (Comlink) — only loaded when !isElectron()
import * as duckdb from '@duckdb/duckdb-wasm';
export async function importDroppedFile(file: File) {
  const root = await navigator.storage.getDirectory();
  const handle = await root.getFileHandle(file.name, { create: true });
  const w = await handle.createWritable();
  await file.stream().pipeTo(w);                 // stream to OPFS, no full buffer
  const db = await getDuckDBWasm();              // lazy, COI bundle
  const conn = await db.connect();
  await db.registerFileHandle(file.name, handle, duckdb.DuckDBDataProtocol.BROWSER_FSACCESS, true);
  await conn.query(`CREATE VIEW v AS SELECT * FROM read_csv('${file.name}', auto_detect=true, encoding='utf-8')`);
  return conn.query(`SELECT * FROM v LIMIT 100`);
}
```

Wire `onDrop(accepted)` → if Electron, resolve native path (Electron exposes `webUtils.getPathForFile` in preload — cleaner than the current "can't get path" assumption); if web, route to the worker above. Requires COOP/COEP headers (the Tech Radar notes Electron can set these unconditionally; the web build needs them for SharedArrayBuffer/threads).

**Electron drag-and-drop CAN get paths** via `webUtils.getPathForFile(file)` (preload). The current notice is overly pessimistic — expose this and drag-and-drop becomes a first-class native import too.

### 3.3 XLSX import (offline, streaming, main process)

`exceljs` is already installed and `platform/parsers/xlsx-to-csv.ts` already converts to pipe-CSV — but it runs in the **renderer** with `workbook.xlsx.load(fullBuffer)`. Move XLSX→CSV to **main**, streaming:

```ts
// electron/xlsx-import.ts
import ExcelJS from 'exceljs';
export async function xlsxPathToTempCsv(xlsxPath: string): Promise<string> {
  const wb = new ExcelJS.stream.xlsx.WorkbookReader(xlsxPath, {}); // streaming reader
  const tmp = path.join(os.tmpdir(), `import_${nanoid()}.csv`);
  const out = fs.createWriteStream(tmp);
  for await (const worksheet of wb) {
    for await (const row of worksheet) {
      out.write(row.values.slice(1).map(csvEscape).join(',') + '\n');
    }
    break; // first sheet
  }
  out.end();
  return tmp; // hand to read_csv, then unlink
}
```

Then `registerCSVPathDataset(tempCsv)` reuses the entire existing pipeline. Add `xlsx`/`xls` to `isSupportedImportPath`, the dialog filters, and `detectFileType`. Delete the dead `model/xlsx.ts parseXLSXRows`.

### 3.4 CSV error surfacing (reject_errors)

read_csv runs lenient (`strict_mode=false`, `null_padding=true`). Coerced/skipped rows are invisible. Add a sidecar query using DuckDB's reject tables so the existing `ValidationIssue` UI can report them:

```sql
SELECT count(*) AS bad_rows FROM read_csv('<path>', store_rejects=true, ...);
SELECT line, column_name, error_message FROM reject_errors LIMIT 20;
```

Map non-empty `reject_errors` → `ValidationIssue[]` with `severity:'warning'` and `affectedRows`. This is purely local and finally makes `buildValidationIssues` (which today only checks empty-file + preview null%) meaningful.

### 3.5 Persist import history

`model/upload-history.ts` ships a hardcoded mock; session files are ephemeral `useState`. The `app_datasets` catalog already exists in main (duckdb-service.ts:332-352) and there is `listRegisteredDatasets()`. Hydrate the session panel from the catalog on mount, and persist lightweight per-import metadata (encoding chosen, reject count, parse time) in **Dexie** so reload preserves history. Delete the `INITIAL_UPLOAD_HISTORY` placeholder.

---

## 4. Better architecture & implementation (step by step)

### 4.1 Split the 1154-line screen

`DataImportScreen.tsx` mixes orchestration with 8 presentational components. Extract:

```
src/features/data-import/
  model/
    types.ts                 (keep; add detectedEncoding, sizeBytes, rejectCount)
    import-session.store.ts   (NEW — Zustand keyed-by-id, see 2.3)
    quality.ts                (computeQualityScores only; delete inferColumnType/computeColumnStats)
  lib/
    import-pipeline.ts        (NEW — processFilePath, importBatch, navigation; framework-free)
    encoding.ts               (NEW — detect + override resolution, shared types with main)
  components/
    UploadDropzone.tsx
    UploadedFilesPanel.tsx    (+ virtualization)
    UploadPipelineCard.tsx
    UploadSummaryCard.tsx
    ValidationIssuesCard.tsx
  screens/
    DataImportScreen.tsx      (composition only, ~150 lines)
```

### 4.2 The pipeline as a pure orchestrator

```ts
// lib/import-pipeline.ts
export async function processFilePath(filePath: string, opts: { navigate: boolean }) {
  const id = makeId();
  const session = useImportSession.getState();
  session.add(id, baseInfo(filePath));            // size from fs.stat via IPC
  try {
    session.patch(id, { status: 'parsing', progress: 5 });
    const enc = await resolveEncoding(filePath);  // chardet in main (3.1)
    session.patch(id, { detectedEncoding: enc, status: 'loading_db' });

    const loaded = await registerCSVPathDatasetWithProgress(
      { filePath, fileExtension: ext(filePath), hasHeader: true, encoding: enc,
        previewLimit: 100, storeRejects: true },
      (p) => session.patch(id, { progress: progressOf(p) }),   // real bar (2.1)
    );

    const issues = [...buildEmptyIssue(loaded), ...buildRejectIssues(loaded.rejects)]; // 3.4
    const quality = computeQualityScores(loaded.columns /* full-table */, loaded.rowCount); // 2.5

    registerDatasetInStore(loaded, quality, issues);
    session.patch(id, { status:'done', progress:100, ...quality, parseTime: loaded.parseMs });
  } catch (e) {
    session.patch(id, { status:'error', error: msg(e), progress:0 });
  }
}
```

### 4.3 Backend contract changes (electron/duckdb-service.ts)

Extend `RegisterCSVPathDatasetInput` with `encoding?: string` and `storeRejects?: boolean`; extend the returned `RegisteredDatasetWithPreview` with `sizeBytes`, `rejects: {count:number; samples:Array<{line:number;column?:string;message:string}>}`, and full-table `stats` from SUMMARIZE. Add the progress IPC channel (2.1). Keep the existing `enqueueWrite` serialization and zstd Parquet cache untouched.

### 4.4 Dropzone wiring (Electron + web)

```ts
const onDrop = useCallback(async (accepted: File[]) => {
  if (isElectron()) {
    const paths = accepted.map(f => window.electronFS.getPathForFile(f)); // webUtils
    await importBatch(paths);
  } else {
    for (const f of accepted) await importDroppedFileWeb(f);  // OPFS+duckdb-wasm worker (3.2)
  }
}, []);
```

This finally makes drag-and-drop functional on BOTH targets and removes the apologetic `dropNotice` default.

---

## 5. Recommended dependencies

| Dep | Stars | Maint. | License | Offline | Bundle | Why |
|---|---|---|---|---|---|---|
| `@duckdb/node-api` (installed 1.5.3) | 1.5k/31k | Very active | MIT | yes | native | Already primary; USE its `encoding`, `sniff_csv`, `reject_errors`, `SUMMARIZE`. No new dep. |
| `chardet` | 301 | Active, 45M dl/wk | MIT | yes | ~40KB main | Encoding auto-detect over first 64KB; pure-JS, offline. |
| `jschardet` | 739 | Active, ~1M dl/wk | LGPL-2.1 (main-process only) | yes | ~250KB main | Multibyte/legacy tie-breaker behind chardet. Record copyleft; do not bundle into renderer. |
| `@duckdb/duckdb-wasm` | 2k/31k | Active | MIT | yes | 3-35MB lazy worker | Browser fallback engine for web build; OPFS registerFileHandle. |
| `hyparquet` | ~1.3k | Active, zero-dep | MIT | yes | ~10-20KB gz | Instant Parquet preview in browser without booting duckdb-wasm. |
| `comlink` (installed) | 12.6k | Active | Apache-2.0 | yes | ~1.1KB | Worker glue for the web parse path. |
| `exceljs` (installed) | 15.4k | Stable | MIT | yes | in-project | Streaming WorkbookReader in MAIN for XLSX→temp CSV. |
| `dexie` | 13k | Active | Apache-2.0 | yes | ~25KB | Persist real import history; replace the mock. |
| `react-dropzone` (installed) | 10.9k | Active | MIT | yes | in-project | Keep; wire onDrop to real paths (Electron) / OPFS (web). |

All permissive except `jschardet` (LGPL — acceptable as an unmodified main-process dependency; flag in license report). Everything runs fully offline; `duckdb-wasm` is lazy and Worker-only.

---

## 6. CLIs & tools (all offline)

- **`duckdb` CLI** — validate `sniff_csv`, `encoding`, `reject_errors` on fixtures before wiring: `duckdb -c "FROM sniff_csv('fixture.csv', sample_size=20480)"`.
- **`npx chardet fixture.csv`** — confirm detector picks Latin-1/UTF-16 on real fixtures.
- **`iconv-lite`** — generate deterministic non-UTF-8 fixtures (UTF-16LE+BOM, ISO-8859-1, Windows-1252) for tests.
- **vitest + tinybench** — unit-test `buildCsvOptions`/encoding resolution; benchmark register on 1MB/50MB/500MB with a time budget.
- **size-limit (`@size-limit/preset-app`)** — per-worker budget for the new web `browser-import.worker` so the fallback path doesn't bloat the bundle.
- **react-scan** — verify the keyed-store refactor (2.3) eliminates full-list re-renders.

---

## 7. Testing & perf budgets

- **Encoding matrix test:** for each of {UTF-8, UTF-8+BOM, UTF-16LE+BOM, ISO-8859-1, Windows-1252} fixture, assert detected encoding and that a known accented value (`café`, `Müller`) round-trips through DuckDB into preview rows. This is the regression lock for the #1 bug.
- **Batch test:** import a 5-file folder; assert all 5 reach `done` and navigation fires exactly once (guards against the mid-loop `router.push` regression).
- **Reject test:** a CSV with 3 malformed rows yields a warning `ValidationIssue` with `affectedRows === 3`.
- **Perf budget:** register(50MB CSV) under a target wall-clock on a 4-core fixture; preview returns ≤100ms after COPY. Assert no preview profiling runs on the main thread (move to SUMMARIZE).
- **No-network test:** run the whole import suite with network disabled (it already should be — assert no fetch/XHR is issued during import).

---

## 8. Phased task list

### P1 — correctness & no-new-architecture (highest value, low risk)
1. **Wire encoding end-to-end**: `chardet` detect in main + BOM fast-path; add `encoding` to `buildCsvOptions`; surface detected value in the existing `UploadSettings.encoding` select as an override. (Closes the #1 offline bug.)
2. **Remove fake progress**: delete `setTimeout(80)` + hardcoded percentages; add DuckDB COPY progress over IPC (2.1).
3. **Fix batch + navigation**: move `router.push` out of `processFilePath`; navigate once after `importBatch` settles; bound concurrency to 2 (2.2).
4. **Read file size** via `fs.stat` in main; populate `ParsedFileInfo.size` + `Dataset.sizeBytes`.
5. **Surface reject_errors** as `ValidationIssue[]` (3.4).
6. **Delete dead code**: `model/xlsx.ts parseXLSXRows`, `INITIAL_UPLOAD_HISTORY`, `inferColumnType`/`computeColumnStats` (after SUMMARIZE lands).

### P2 — accuracy, perf, persistence
7. **Full-table stats via SUMMARIZE** replacing preview-only profiling; quality scores become correct (2.5).
8. **Keyed import store + per-row subscription** to kill O(N) re-renders; virtualize the file list (2.3, 2.4).
9. **Split the 1154-line screen** into `lib/` + `components/` (4.1).
10. **Persist import history in Dexie**; hydrate session panel from `listRegisteredDatasets()` (3.5).
11. **XLSX import in main** via streaming `WorkbookReader` → temp CSV → existing pipeline (3.3).

### P3 — web fallback & advanced
12. **Electron drag-and-drop paths** via `webUtils.getPathForFile`; remove the apologetic notice (3.2).
13. **Browser web import path**: OPFS copy + `duckdb-wasm` worker behind `!isElectron()`, COOP/COEP headers; `hyparquet` quick-preview for Parquet (3.2).
14. **Arrow IPC preview** for large preview limits (2.6).
15. **Perf budgets + benchmarks** in CI (size-limit per-worker, tinybench register timings) (7).

Sources verified: DuckDB CSV encoding (1.2+, `encoding` param) and `sniff_csv`/`reject_errors` (duckdb.org docs + PR #14560); chardet/jschardet stars+maintenance (GitHub); react-dropzone activity; hyparquet (hyparam/hyparquet); installed `@duckdb/node-api` 1.5.3-r.3 (node_modules).
