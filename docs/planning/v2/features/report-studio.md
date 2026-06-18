# Feature Plan — report-studio

**Maturity:** partial

## Performance issues

- All export generation (PPTX/DOCX/PDF) runs on the renderer MAIN THREAD — pptxgenjs ZIP compression, docx Packer.toBlob, and jsPDF rendering block the UI; with real datasets (thousands of channels/rows) this freezes the window for seconds.
- jspdf + jspdf-autotable is used for tabular PDF. autotable OOMs/hangs past a few thousand rows (Tech Radar HOLD). The channel table iterates the full array client-side with per-cell didParseCell hooks.
- No virtualization anywhere: SlideThumbnail renders a fixed 10-card grid, but the channel <select> list, DOCX table preview, and PDF page preview all map over full arrays with no windowing. With large topChannels this re-renders on every keystroke.
- Branding state is held in one giant `branding` object and every Input onChange calls saveBranding() which does setBranding + JSON.stringify + localStorage.setItem synchronously on each keystroke — a synchronous localStorage write on the typing hot path.
- getReportData is a useCallback over `branding`, but PresentationOverlay receives `getReportData(SAMPLE_DATA.date)` inline in JSX so it recomputes a fresh object every parent render, and the 24-point hourly sine array in SAMPLE_DATA is recreated at module scope only once (ok) but channel filtering in generators runs O(n*m) with Array.includes inside map.
- Charts in exports are NOT real charts: PPTX uses pptxgenjs native charts (fine) but DOCX embeds a literal '[Chart: ...]' text placeholder and PDF hand-draws a line chart with dozens of doc.moveTo/lineTo/circle calls per point on the main thread. No reuse of the app's ECharts instances via getDataURL/renderToSVGString.
- Dynamic import of pptxgenjs/docx/jspdf happens at click time with no prefetch, so first export pays a multi-hundred-KB parse+eval stall on the main thread in addition to generation.
- PresentationOverlay autoplay uses setInterval(8000) plus a keydown listener re-subscribed on every currentSlide change (effect dep on currentSlide) — minor, but the whole overlay re-renders all 5 slide branches' JSX conditionally each tick.
- SAMPLE_DATA is fully hardcoded; there is zero SQL pushdown — a real report should aggregate via DuckDB (GROUP BY channel, hourly histogram) in the Electron main process and stream small Arrow results, instead of materializing/filtering in JS.

## Offline gaps

- Branding logoUrl is a free-text URL input ('https://example.com/logo.png') rendered with <img src={logoUrl}> and intended to be embedded in exports — this assumes runtime network fetch and will fail offline. Must switch to a local file picker that stores the logo as a base64/ArrayBuffer in IndexedDB/OPFS.
- Exports use the browser blob + <a download> path (docx, pdf via doc.save, pptx via writeFile). In Electron this dumps to the default Downloads folder with no save dialog, no chosen path, and bypasses the existing fs:saveDialog / fs:writeFile IPC bridge already in preload.ts. Heavy export bytes are built in the renderer instead of Node.
- No persistence of report definitions/templates: the 5 TEMPLATES_DEF and branding are in-memory + a single localStorage key 'report-studio-branding'. No saved-report library, no scheduled/repeatable report definitions stored in Dexie.
- DOCX 'Visual Analysis' section ships a text placeholder instead of a real embedded chart image — closing this requires offline chart rasterization (ECharts SSR SVG -> resvg-wasm/canvas), not a hosted render service.
- Fonts: jsPDF uses built-in Helvetica and docx uses Calibri (a system font that may be absent on Linux/non-Office machines) — for guaranteed-offline, consistent output, bundle a font (e.g. embed via @cantoo/pdf-lib fontkit or pdfmake vfs_fonts) rather than relying on the OS having Calibri.
- No use of the real DuckDB datasets registered in the app (data-store.ts / duckdb-service.ts) — the report is disconnected from actual on-device data, so 'offline data source' is effectively a stub.

## Recommended dependencies

| Package | Category | Stars | Maint. | License | Offline | Replaces | Why | URL |
|---|---|---|---|---|---|---|---|---|
| `pdfmake` | PDF (data-driven tables) | ~12.3k | Active, v0.3.x; 90+ contributors, ~940k weekly downloads | MIT | yes | jspdf + jspdf-autotable (keep jspdf only for trivial quick exports) | Declarative JSON doc definition that auto-paginates large tables, native headers/footers/page numbers — replaces the fragile jsPDF+autotable hand-layout that OOMs past a few k rows. Bundles its own vfs fonts (Roboto) so output is identical offline regardless of OS fonts. | https://github.com/bpampuch/pdfmake |
| `exceljs` | XLSX export (NEW format) | ~15.4k | Stable/maintenance-mode, v4.x; already a project dependency | MIT | yes | sheetjs (rejected: in-memory OOM, off public npm) | Streaming WorkbookWriter uses ~6x less memory than SheetJS and is already installed but UNUSED in report-studio. Adds an Excel export tab that streams aggregated rows from DuckDB without materializing them in JS heap. | https://github.com/exceljs/exceljs |
| `@cantoo/pdf-lib` | PDF post-processing | ~336 (maintained fork; upstream pdf-lib 4.6k) | Active fork (original pdf-lib stale since Nov 2021) | MIT | yes | pdf-lib (stale original) | For merge/stamp/form-fill and embedding a bundled logo + custom font into the final PDF (fontkit2). Use to stitch a pdfmake body with a branded cover or to embed the user's local logo. Pin version (low bus-factor). | https://github.com/cantoo-scribe/pdf-lib |
| `comlink` | Worker RPC | ~12.6k | Active (GoogleChromeLabs); already a dependency | Apache-2.0 | yes | main-thread generation | ~1.1kB Proxy-based RPC to move ALL export generation (pptxgenjs/docx/pdfmake) into a dedicated export.worker.ts off the renderer main thread. Already used elsewhere in the repo — reuse the pattern. | https://github.com/GoogleChromeLabs/comlink |
| `dexie` | Local persistence | ~13k | Active, already a dependency | Apache-2.0 | yes | localStorage 'report-studio-branding' | Persist saved report definitions, branding profiles, and base64 logo blobs in IndexedDB instead of a single localStorage key. Many small structured records is exactly Dexie's sweet spot. | https://github.com/dexie/Dexie.js |
| `echarts` | Chart -> image for exports | ~63k | Very active (Apache); already a dependency v6 | Apache-2.0 | yes | hand-drawn jsPDF chart + DOCX text placeholder | Use echarts.getDataURL() (browser) and renderToSVGString() (SSR, zero-dep) to embed REAL charts into DOCX/PDF instead of the current '[Chart: ...]' text placeholder and hand-drawn jsPDF lines. Never DOM-screenshot. | https://github.com/apache/echarts |
| `@resvg/resvg-wasm` | SVG -> PNG rasterization (offline) | ~3.3k (resvg-js org) | Active | MPL-2.0 (tool/runtime wasm) | yes | headless-chrome / hosted render | Rasterize ECharts renderToSVGString() output to PNG fully offline (WASM, no headless Chrome, no node-canvas/Cairo native build) so chart images can be embedded in DOCX/PPTX/XLSX. Critical for the no-network constraint. Verify license fit; alternative is canvas getDataURL in a worker with OffscreenCanvas. | https://github.com/yisibl/resvg-js |
| `docx-templates` | DOCX templating (optional) | ~1.1k | Active, v4.15 (Dec 2025) | MIT | yes | none (complements docx) | OPTIONAL: lets users author a branded .docx template with IMAGE/LINK/loops and merge report data into it — complements the existing programmatic `docx` usage for fully custom corporate layouts. Supports embedding chart PNGs via IMAGE. | https://github.com/guigrpa/docx-templates |
| `docx` | DOCX (programmatic) | ~5.8k | Very active, v9.x; already a dependency | MIT | yes | none (keep) | Keep as primary DOCX engine but extend with ImageRun for embedded chart PNGs and bundle a font instead of relying on system Calibri. Move Packer.toBlob into the export worker. | https://github.com/dolanmiu/docx |
| `pptxgenjs` | PPTX | ~5.6k | Active, v4.x; already a dependency | MIT | yes | none (keep) | Keep as primary PPTX engine (native charts are good). Move writeFile/write into the worker and feed it real aggregated data + embedded logo. Use pptx.write({outputType:'arraybuffer'}) then hand bytes to Electron fs:saveDialog. | https://github.com/gitbrent/PptxGenJS |

## CLIs & tools

| Tool | Type | Offline | Why | URL |
|---|---|---|---|---|
| `size-limit (+@size-limit/preset-app)` | cli | yes | Add a per-route budget for /dashboard/report-studio and a per-worker budget for export.worker so the pptxgenjs/docx/pdfmake bundle doesn't silently bloat the main route. Already in repo — wire a budget entry. | https://github.com/ai/size-limit |
| `@next/bundle-analyzer / sonda` | cli | yes | Treemap the report-studio chunk to confirm the export libs are code-split into the worker chunk and not the initial route. sonda gives a richer offline treemap. | https://github.com/filipsobol/sonda |
| `tinybench (via Vitest bench)` | library | yes | Benchmark export generation time for 100 / 1k / 10k channel rows on the worker path vs the old main-thread path to prove the perf budget (e.g. <500ms p95 for 1k rows, no main-thread block). | https://github.com/tinylibs/tinybench |
| `resvg-js CLI / wasm-opt (binaryen)` | wasm | yes | resvg for offline SVG->PNG of chart images; wasm-opt to shrink the resvg/echarts wasm payloads 10-30% at build time. | https://github.com/WebAssembly/binaryen |
| `LibreOffice --headless (soffice)` | cli | yes | Dev/QA only: convert generated .pptx/.docx/.xlsx to PDF offline to visually diff that exports open correctly in real Office-format readers, and to snapshot-test layouts in CI without a network. | https://www.libreoffice.org/ |
| `axe-core (@axe-core/playwright)` | library | yes | Run a11y checks on the report-studio screen (color-contrast of the colored KPI cards, checkbox labels) fully offline against localhost. Already in repo. | https://github.com/dequelabs/axe-core |

---

# Report Studio — Deep Improvement Plan

Feature: `report-studio` (Report builder / multi-format export)
Code: `src/features/report-studio/`
Route: `src/app/dashboard/report-studio/page.tsx`

---

## 1. Current implementation

### 1.1 File map

| File | Lines | Role |
|---|---|---|
| `src/app/dashboard/report-studio/page.tsx` | 12 | Thin route, renders `<ReportStudioScreen/>`. Sets metadata. |
| `src/features/report-studio/screens/ReportStudioScreen.tsx` | 1342 | The entire UI: a 6-tab `Tabs` (PowerPoint / Word / PDF / Templates / Presentation / Branding), hardcoded `SAMPLE_DATA`, branding state in `localStorage`, a full-screen `PresentationOverlay`, and the three `handleGenerate*` click handlers that lazy-import the generators. |
| `src/features/report-studio/lib/pptx-generator.ts` | 546 | `generatePPTX(data, template, selectedChannels)` — builds a 10-slide deck with `pptxgenjs`, native bar/pie/line charts, then `pptx.writeFile(...)`. |
| `src/features/report-studio/lib/docx-generator.ts` | 561 | `generateDOCX(data, options)` — builds a Word doc with `docx`, tables + headings, **a literal `[Chart: ...]` text placeholder** for visuals, then `Packer.toBlob` + `<a download>`. |
| `src/features/report-studio/lib/pdf-report.ts` | 583 | `generatePDFReport(data, options)` — `jsPDF` + `jspdf-autotable`, a **hand-drawn** line chart (per-point `moveTo`/`lineTo`/`circle`), then `doc.save(...)`. |

### 1.2 Data model

The only data shape is `ReportData` (defined in `pptx-generator.ts`, re-imported by the others):

```ts
export interface ReportData {
  date: string
  totalTransactions: number
  successRate: number
  totalRevenue: number
  failedTransactions: number
  topChannels: { name: string; volume: number; successRate: number; revenue: number }[]
  hourlyData: { hour: number; count: number; successRate: number }[]
  companyName?: string
  primaryColor?: string
  footerText?: string
}
```

`SAMPLE_DATA` (ReportStudioScreen.tsx:20-42) is **fully hardcoded**, including a 24-point sine-wave `hourlyData`. There is **no connection to the app's real DuckDB datasets** (`src/core/stores/data-store.ts`, `electron/duckdb-service.ts`). So today report-studio is a *visual demo*, not a data product.

### 1.3 State & persistence

- `branding` is a single object (`BrandingConfig`) persisted to **one `localStorage` key** `report-studio-branding` (lines 567-577).
- Every text input calls `saveBranding({...branding, field: value})` on each keystroke → `setBranding` + `JSON.stringify` + `localStorage.setItem` synchronously (lines 689, 1222-1261).
- `getReportData(date)` (579-588) merges branding into `SAMPLE_DATA`.

### 1.4 Export delivery

All three exports write via the **browser blob path**:
- PPTX: `pptx.writeFile({ fileName })` (pptx-generator.ts:544)
- DOCX: `Packer.toBlob` → `URL.createObjectURL` → `<a download>` (docx-generator.ts:551-559)
- PDF: `doc.save(fileName)` (pdf-report.ts:581)

In Electron this drops files into the default Downloads dir with **no save dialog and no chosen path**, even though `electron/preload.ts` already exposes `fs:saveDialog` + `fs:writeFile` (preload.ts:121-124, plus `fs:writeFile` at 109). The existing IPC bridge is bypassed.

---

## 2. Performance bottlenecks & exact fixes

### 2.1 BOTTLENECK — everything runs on the renderer main thread

`pptxgenjs` does ZIP/deflate, `docx` `Packer.toBlob` serializes XML + zips, and `jsPDF` rasterizes — all synchronously on the UI thread. With `SAMPLE_DATA` (8 channels) it's fine; with a real aggregate (hundreds–thousands of channels/rows) the window freezes for seconds and the "Generating…" spinner can't even animate smoothly.

**Fix — move generation into a Comlink worker.** `comlink` is already a dependency.

`src/features/report-studio/workers/export.worker.ts`:
```ts
import * as Comlink from 'comlink'
import type { ReportData } from '../lib/types'
import type { PptxTemplate } from '../lib/types'
import type { DocxOptions } from '../lib/docx-generator'
import type { PDFOptions } from '../lib/pdf-report'

// All heavy imports live INSIDE the worker, off the main thread.
const api = {
  async pptx(data: ReportData, template: PptxTemplate, channels: string[]): Promise<ArrayBuffer> {
    const { buildPptx } = await import('../lib/pptx-generator')
    return buildPptx(data, template, channels) // returns ArrayBuffer, no writeFile
  },
  async docx(data: ReportData, options: DocxOptions): Promise<ArrayBuffer> {
    const { buildDocx } = await import('../lib/docx-generator')
    return buildDocx(data, options)
  },
  async pdf(data: ReportData, options: PDFOptions): Promise<ArrayBuffer> {
    const { buildPdf } = await import('../lib/pdf-report')
    return buildPdf(data, options)
  },
  async xlsx(data: ReportData): Promise<ArrayBuffer> {
    const { buildXlsx } = await import('../lib/xlsx-generator')
    return buildXlsx(data)
  },
}
export type ExportApi = typeof api
Comlink.expose(api)
```

Refactor each generator to a pure `build*` that **returns bytes** instead of triggering a download. e.g. PPTX:
```ts
export async function buildPptx(data, template, channels): Promise<ArrayBuffer> {
  const pptxgen = (await import('pptxgenjs')).default
  const pptx = new pptxgen()
  // ...all existing slide code unchanged...
  return (await pptx.write({ outputType: 'arraybuffer' })) as ArrayBuffer
}
```
DOCX: `return await Packer.toArrayBuffer(doc)` (docx exposes `toArrayBuffer`). PDF: `return doc.output('arraybuffer')`.

Client hook owns the worker lifecycle and the save step:
```ts
// src/features/report-studio/hooks/use-export-worker.ts
import * as Comlink from 'comlink'
import type { ExportApi } from '../workers/export.worker'

let cached: { worker: Worker; api: Comlink.Remote<ExportApi> } | null = null

function getWorker() {
  if (!cached) {
    const worker = new Worker(new URL('../workers/export.worker.ts', import.meta.url), { type: 'module' })
    cached = { worker, api: Comlink.wrap<ExportApi>(worker) }
  }
  return cached
}

export function useExportWorker() {
  const save = useCallback(async (bytes: ArrayBuffer, fileName: string, mime: string) => {
    // Electron path first
    if (window.electronAPI?.fs?.saveDialog) {
      const { canceled, filePath } = await window.electronAPI.fs.saveDialog({
        defaultPath: fileName,
        filters: filtersFor(mime),
      })
      if (!canceled && filePath) {
        await window.electronAPI.fs.writeFile(filePath, bytes) // Node fs, not renderer blob
        return { saved: true, path: filePath }
      }
      return { saved: false }
    }
    // Browser fallback
    const blob = new Blob([bytes], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = fileName
    a.click(); URL.revokeObjectURL(url)
    return { saved: true }
  }, [])

  const exportPptx = useCallback(async (data, tmpl, channels) => {
    const { api } = getWorker()
    const bytes = await api.pptx(data, tmpl, channels)
    return save(bytes, `transaction-report-${data.date}.pptx`,
      'application/vnd.openxmlformats-officedocument.presentationml.presentation')
  }, [save])

  // ...exportDocx / exportPdf / exportXlsx analogous...
  return { exportPptx, exportDocx, exportPdf, exportXlsx }
}
```

Result: the main thread only marshals a small config object out and an `ArrayBuffer` back; the UI stays at 60fps and the spinner animates.

### 2.2 BOTTLENECK — jsPDF + autotable for the tabular PDF

`jspdf-autotable` is a Tech-Radar **HOLD** ("light tables only; OOMs past a few k rows"). The channel table (pdf-report.ts:243-282) iterates the full array with a per-cell `didParseCell` hook. For a real report with many channels this is the failure mode.

**Fix — replace the PDF body with `pdfmake`** (declarative, auto-paginating, bundles its own fonts so output is OS-independent and offline-deterministic):
```ts
export async function buildPdf(data: ReportData, options: PDFOptions): Promise<ArrayBuffer> {
  const pdfMake = (await import('pdfmake/build/pdfmake')).default
  const pdfFonts = (await import('pdfmake/build/vfs_fonts')).default
  pdfMake.vfs = pdfFonts.vfs

  const docDefinition = {
    pageSize: options.paperSize === 'a4' ? 'A4' : 'LETTER',
    pageMargins: [40, 70, 40, 50],
    header: brandedHeader(data),
    footer: (current: number, total: number) => brandedFooter(data, current, total),
    content: [
      coverBlock(data),
      { text: 'Channel Performance', style: 'h1', pageBreak: 'before' },
      {
        table: {
          headerRows: 1, // repeats across page breaks automatically
          widths: ['*', 'auto', 'auto', 'auto', 'auto'],
          body: [
            ['Channel', 'Volume', 'Success', 'Revenue', 'Status'].map(h => ({ text: h, style: 'th' })),
            ...data.topChannels.map(ch => [
              ch.name, fmtNum(ch.volume), fmtPct(ch.successRate), fmtAmount(ch.revenue),
              { text: statusOf(ch.successRate), color: statusColor(ch.successRate) },
            ]),
          ],
        },
        layout: 'lightHorizontalLines',
      },
      options.includeCharts ? { image: await chartPng(data), width: 515, pageBreak: 'before' } : null,
    ].filter(Boolean),
    styles: { h1: { fontSize: 16, bold: true, color: '#003087', margin: [0, 8, 0, 6] },
              th: { bold: true, color: 'white', fillColor: '#003087' } },
    defaultStyle: { font: 'Roboto' },
  }
  return new Promise<ArrayBuffer>((resolve) =>
    pdfMake.createPdf(docDefinition).getBuffer((buf: Uint8Array) => resolve(buf.buffer)))
}
```
Keep `jspdf` only for trivial one-page exports if any remain. `pdfmake` auto-repeats `headerRows` across page breaks — the manual `addPageHeader`/`addPageFooter`/`pageNum` bookkeeping (pdf-report.ts:44-74) disappears.

### 2.3 BOTTLENECK — fake/hand-drawn charts; no reuse of app charts

DOCX embeds `[Chart: ...]` *text* (docx-generator.ts:330). PDF hand-draws a chart with ~50 `moveTo`/`lineTo`/`circle` calls per render (pdf-report.ts:491-552). The app already has ECharts 6.

**Fix — render real charts to images offline.** Two-mode, no network, no headless Chrome:

1. **Browser/renderer (preferred when a live chart exists):** if the dashboard already mounted an ECharts instance, reuse `echarts.getInstanceByDom(el)?.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' })`.
2. **Worker/SSR (for export-only charts):** ECharts zero-dependency SSR:
```ts
// in a worker — produce SVG string, then rasterize to PNG with resvg-wasm (offline)
import * as echarts from 'echarts'
import { Resvg, initWasm } from '@resvg/resvg-wasm'

let wasmReady: Promise<void> | null = null
export async function chartPng(data: ReportData): Promise<ArrayBuffer> {
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 900, height: 360 })
  chart.setOption(hourlyOption(data.hourlyData))
  const svg = chart.renderToSVGString()
  chart.dispose()
  wasmReady ??= initWasm(fetch(new URL('@resvg/resvg-wasm/index_bg.wasm', import.meta.url)))
  await wasmReady
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1800 } }).render().asPng()
  return png.buffer
}
```
Then DOCX uses `new ImageRun({ data: pngBuffer, transformation: { width: 600, height: 240 } })` instead of the text placeholder, and pdfmake uses `{ image: dataUriFrom(png) }`. **Never DOM-screenshot charts** (Tech Radar rule). `OffscreenCanvas` + `chart.getDataURL()` inside the worker is an acceptable alternative to resvg if a canvas creator is registered.

### 2.4 BOTTLENECK — synchronous localStorage writes on the typing hot path

Every keystroke in the branding/company inputs runs `JSON.stringify` + `localStorage.setItem` (ReportStudioScreen.tsx:574-577, called from 689/1222/1233/1239/1249/1259/1268).

**Fix — debounce + move to Dexie (IndexedDB, async).** Keep React state immediate; persist async/debounced:
```ts
const persist = useMemo(() => debounce((b: BrandingConfig) =>
  db.brandingProfiles.put({ id: 'active', ...b }), 300), [])
function setField<K extends keyof BrandingConfig>(k: K, v: BrandingConfig[K]) {
  setBranding(prev => { const next = { ...prev, [k]: v }; persist(next); return next })
}
```
Dexie schema:
```ts
// src/features/report-studio/data/db.ts
import Dexie, { type Table } from 'dexie'
export interface BrandingProfile extends BrandingConfig { id: string; logoBlob?: ArrayBuffer }
export interface SavedReport { id: string; name: string; templateId: string; config: unknown; updatedAt: number }
class ReportDB extends Dexie {
  brandingProfiles!: Table<BrandingProfile, string>
  savedReports!: Table<SavedReport, string>
  constructor() { super('report-studio'); this.version(1).stores({ brandingProfiles: 'id', savedReports: 'id, updatedAt' }) }
}
export const db = new ReportDB()
```

### 2.5 BOTTLENECK — no virtualization on long lists

The channel checkbox list (768-779), DOCX/PDF preview maps, and any future "rows" list map over full arrays and re-render on every keystroke because they live in the same component as the branding inputs.

**Fixes:**
- Wrap `SAMPLE_DATA`-derived static lists in `useMemo`; split the typing-heavy branding panel into its own memoized child so channel lists don't re-render on company-name keystrokes.
- For the channel selector when channel count is large (real data), use `@tanstack/react-virtual` (already a dependency) to window the checkbox list:
```tsx
const rowVirtualizer = useVirtualizer({ count: channels.length, getScrollElement: () => parentRef.current, estimateSize: () => 32, overscan: 8 })
```
- Memoize `getReportData` consumers: compute `presentationData = useMemo(() => getReportData(date), [getReportData, date])` instead of calling it inline in JSX (line 639).

### 2.6 BOTTLENECK — no prefetch of export chunks

Dynamic `import('pptxgenjs')` happens at click (594, 607, 619). First click pays parse+eval.

**Fix — warm the worker + prefetch on tab focus/hover:**
```ts
useEffect(() => { getWorker() }, []) // spin up worker module eagerly (idle)
// and on hover of the Generate button: void import('pptxgenjs')
```
Use `requestIdleCallback` to avoid competing with first paint. Ensure size-limit per-worker budget so this chunk stays out of the initial route bundle.

### 2.7 Push aggregation to DuckDB (SQL pushdown) — the real win

The report should not materialize/filter rows in JS. Aggregate in the Electron main process and stream tiny results:
```sql
-- channel performance (one row per channel, already aggregated)
SELECT channel AS name,
       count(*) AS volume,
       100.0 * avg(CASE WHEN status='OK' THEN 1 ELSE 0 END) AS successRate,
       sum(amount) AS revenue
FROM tx WHERE day = $day
GROUP BY channel ORDER BY volume DESC;

-- hourly histogram (24 rows)
SELECT extract(hour FROM ts) AS hour, count(*) AS count,
       100.0*avg(CASE WHEN status='OK' THEN 1 ELSE 0 END) AS successRate
FROM tx WHERE day = $day GROUP BY 1 ORDER BY 1;
```
Run via the existing `runReadOnlyQuery` IPC (`electron/duckdb-service.ts:933`, exposed in preload). The renderer receives ~30 small rows, not the raw table — keeping memory and IPC cost trivial regardless of dataset size.

---

## 3. Offline gaps & how to close them

| Gap | Current | Fix |
|---|---|---|
| Logo via remote URL | `logoUrl` text input + `<img src={url}>` (1247-1252, 1296-1303); intended for export embedding | Replace with a **local file picker** (Electron `fs:openDialog` or `<input type=file>`), read as `ArrayBuffer`, store base64 in Dexie `brandingProfiles.logoBlob`, embed into exports via `ImageRun`/`slide.addImage({ data })`/pdfmake `{image}`. No runtime fetch. |
| Browser-only download | blob + `<a download>` / `doc.save` / `writeFile` to Downloads | Route through Electron `fs:saveDialog` + `fs:writeFile` (already in preload). Build bytes in worker, write via Node. |
| Charts assume "see the PPTX" / network render | DOCX text placeholder; no SSR | ECharts `renderToSVGString` + `@resvg/resvg-wasm` (WASM, offline) → embed PNG. |
| Fonts | jsPDF Helvetica builtin; docx **Calibri** (absent on Linux/non-Office) | `pdfmake` bundles Roboto vfs; for `docx` embed a bundled font, or document that Calibri substitution is acceptable. Deterministic offline output. |
| No saved reports / templates persistence | 5 in-memory `TEMPLATES_DEF`; 1 localStorage branding key | Dexie `savedReports` + `brandingProfiles`; optional Yjs doc later for shared report definitions on a LAN hub. |
| Disconnected from real data | hardcoded `SAMPLE_DATA` | Wire to DuckDB aggregates (Section 2.7). |

---

## 4. Better architecture & implementation (step-by-step)

### 4.1 Target module layout
```
src/features/report-studio/
  data/
    db.ts                 # Dexie: brandingProfiles, savedReports
    queries.ts            # DuckDB aggregate SQL -> ReportData (TanStack Query)
  lib/
    types.ts              # ReportData, PptxTemplate, *Options (extracted from pptx-generator)
    pptx-generator.ts     # buildPptx(...) -> ArrayBuffer
    docx-generator.ts     # buildDocx(...) -> ArrayBuffer  (+ ImageRun charts)
    pdf-report.ts         # buildPdf(...)  -> ArrayBuffer  (pdfmake)
    xlsx-generator.ts     # buildXlsx(...) -> ArrayBuffer  (exceljs streaming)  [NEW]
    charts.ts             # chartPng(): ECharts SSR -> resvg PNG
    branding.ts           # applyBranding(data, profile), logo embedding helpers
  workers/
    export.worker.ts      # Comlink-exposed { pptx, docx, pdf, xlsx }
  hooks/
    use-export-worker.ts  # worker lifecycle + Electron/browser save
    use-branding.ts       # Dexie-backed branding profile (debounced)
    use-report-data.ts    # TanStack Query: DuckDB aggregates or SAMPLE_DATA fallback
  components/
    BrandingPanel.tsx     # memoized; isolates typing re-renders
    ChannelSelector.tsx   # virtualized when large
    ExportTabs/{Pptx,Docx,Pdf,Xlsx}Tab.tsx
    PresentationOverlay.tsx
  screens/
    ReportStudioScreen.tsx  # orchestration only (~200 lines, down from 1342)
```

### 4.2 Decouple data from sample
```ts
// hooks/use-report-data.ts
export function useReportData(date: string) {
  return useQuery({
    queryKey: ['report-studio', 'aggregate', date],
    queryFn: async (): Promise<ReportData> => {
      const api = window.electronAPI?.duckdb
      if (!api) return { ...SAMPLE_DATA, date } // browser/demo fallback
      const [channels, hourly, totals] = await Promise.all([
        api.runReadOnlyQuery(CHANNEL_SQL(date)),
        api.runReadOnlyQuery(HOURLY_SQL(date)),
        api.runReadOnlyQuery(TOTALS_SQL(date)),
      ])
      return mapToReportData(channels, hourly, totals, date)
    },
    staleTime: 5 * 60_000,
  })
}
```
Generators are now data-source agnostic — they take `ReportData` either from DuckDB or the demo fallback.

### 4.3 Branding hook (offline, persisted, debounced)
```ts
export function useBranding() {
  const profile = useLiveQuery(() => db.brandingProfiles.get('active'))
  const [draft, setDraft] = useState<BrandingProfile | null>(null)
  const persist = useMemo(() => debounce((b: BrandingProfile) => db.brandingProfiles.put(b), 300), [])
  const update = (patch: Partial<BrandingProfile>) =>
    setDraft(prev => { const next = { ...(prev ?? profile ?? DEFAULT), ...patch, id: 'active' }; persist(next); return next })
  async function setLogoFromFile(file: File) {
    const buf = await file.arrayBuffer()
    update({ logoBlob: buf }) // stored locally; embedded into exports offline
  }
  return { branding: draft ?? profile ?? DEFAULT, update, setLogoFromFile }
}
```

### 4.4 Embed the logo into exports (offline)
```ts
// pptx
if (data.logoBase64) slide.addImage({ data: data.logoBase64, x: 0.4, y: 0.3, w: 0.8, h: 0.8 })
// docx
children: data.logoBuf ? [new ImageRun({ data: data.logoBuf, transformation: { width: 64, height: 64 } })] : []
// pdfmake
header: { columns: [ data.logoDataUri ? { image: data.logoDataUri, width: 40 } : {}, { text: company } ] }
```

### 4.5 New XLSX export (exceljs streaming, memory-light)
```ts
export async function buildXlsx(data: ReportData): Promise<ArrayBuffer> {
  const ExcelJS = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Channels')
  ws.columns = [
    { header: 'Channel', key: 'name', width: 28 },
    { header: 'Volume', key: 'volume', width: 14 },
    { header: 'Success %', key: 'successRate', width: 12 },
    { header: 'Revenue', key: 'revenue', width: 16 },
  ]
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF003087' } }
  for (const ch of data.topChannels) ws.addRow(ch).commit() // commit() frees rows incrementally
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}
```
For very large row sets, swap to `new ExcelJS.stream.xlsx.WorkbookWriter({ buffer })` so rows are flushed (~6x less heap than SheetJS, confirmed in 2026 comparisons).

### 4.6 ReportStudioScreen slims to orchestration
The 1342-line screen becomes ~200 lines: `useBranding()`, `useReportData(date)`, `useExportWorker()`, render `<ExportTabs>` with memoized child panels. The `PresentationOverlay`, `SlideThumbnail`, `TemplateCard`, and the per-tab forms move to `components/`.

---

## 5. Recommended dependencies

| Dep | Stars | Maint. | License | Offline | Bundle | Why | URL |
|---|---|---|---|---|---|---|---|
| pdfmake | ~12.3k | Active v0.3.x, 90+ contrib | MIT | yes | ~1.2MB (fonts) | Auto-paginating tables, bundled fonts; replaces fragile jsPDF+autotable | https://github.com/bpampuch/pdfmake |
| exceljs | ~15.4k | Stable v4.x (installed, unused here) | MIT | yes | installed | Streaming XLSX, 6x less memory than SheetJS; new export format | https://github.com/exceljs/exceljs |
| @cantoo/pdf-lib | ~336 (fork) | Active (orig stale) | MIT | yes | ~600KB | Merge/stamp/embed local logo+font into final PDF; pin version | https://github.com/cantoo-scribe/pdf-lib |
| comlink | ~12.6k | Active (installed) | Apache-2.0 | yes | installed | Move all generation off main thread | https://github.com/GoogleChromeLabs/comlink |
| dexie | ~13k | Active (installed) | Apache-2.0 | yes | installed | Persist branding/logos/saved reports in IndexedDB | https://github.com/dexie/Dexie.js |
| echarts | ~63k | Very active (installed v6) | Apache-2.0 | yes | installed | Real charts via getDataURL/renderToSVGString for exports | https://github.com/apache/echarts |
| @resvg/resvg-wasm | ~3.3k | Active | MPL-2.0 | yes | ~1.5MB wasm | Offline SVG→PNG for embedded charts (no headless Chrome) | https://github.com/yisibl/resvg-js |
| docx-templates | ~1.1k | Active v4.15 | MIT | yes | ~150KB | OPTIONAL: branded .docx template merge with IMAGE | https://github.com/guigrpa/docx-templates |
| docx | ~5.8k | Very active (installed) | MIT | yes | installed | Keep; add ImageRun charts + bundled font | https://github.com/dolanmiu/docx |
| pptxgenjs | ~5.6k | Active (installed) | MIT | yes | installed | Keep; move to worker, feed real data + logo | https://github.com/gitbrent/PptxGenJS |

**HOLD/avoid (per Tech Radar):** `@react-pdf/renderer` (heavy for big tables), `sheetjs` (in-memory OOM, off npm), `html2canvas`/DOM-screenshot for charts, `jspdf-autotable` for large tables.

---

## 6. CLIs & tools (all offline)

- **size-limit (`@size-limit/preset-app` + time plugin):** add a per-route budget for `/dashboard/report-studio` and a per-worker budget for `export.worker` so pptxgenjs/docx/pdfmake stay code-split off the initial route. Already in repo.
- **@next/bundle-analyzer / sonda:** confirm the export libs land in the worker chunk, not the route entry.
- **tinybench (Vitest bench):** benchmark generation at 100/1k/10k rows, worker vs main-thread, to lock a perf budget (e.g. p95 < 500ms for 1k rows, zero long-tasks > 50ms on main thread).
- **resvg-js + wasm-opt (binaryen):** offline chart rasterization; shrink wasm 10–30%.
- **LibreOffice `--headless` (soffice):** dev/CI — convert generated .pptx/.docx/.xlsx → PDF offline to visually diff that exports open correctly in real Office readers; snapshot-test layouts without network.
- **axe-core (@axe-core/playwright):** a11y of the screen (KPI-card color contrast, checkbox labels). Already in repo.

---

## 7. Testing & perf-budget notes

- **Unit:** each `build*` returns a non-empty `ArrayBuffer` for empty / 1 / 1k channels; assert PPTX/DOCX/XLSX are valid ZIP (PK magic bytes `0x50 0x4B`), PDF starts with `%PDF`.
- **Golden-file (offline):** run `soffice --headless --convert-to pdf` on generated docs in CI, hash/visual-diff the resulting PDF for layout regressions.
- **Worker isolation:** assert generation never blocks main thread — measure `performance.now()` long-tasks during export in a Playwright test.
- **Perf budgets:** report-studio route initial JS budget (size-limit) excludes export libs; export.worker chunk has its own budget. Bench gate: 1k-row PDF < 1s, 10k-row XLSX streaming heap < 100MB.
- **Offline E2E:** with network disabled, full flow (pick local logo → DuckDB aggregate → generate all 4 formats → save via dialog) must succeed.

---

## 8. Phased task list

### P1 — correctness, offline, no-freeze (highest value)
1. Extract `ReportData`/types into `lib/types.ts`; refactor `generate*` → pure `build*` returning `ArrayBuffer`.
2. Add `export.worker.ts` (Comlink) + `use-export-worker.ts`; move ALL generation off the main thread.
3. Route saving through Electron `fs:saveDialog` + `fs:writeFile` with browser blob fallback.
4. Replace remote-URL logo with local file picker stored in Dexie; embed logo into all exports.
5. Replace `localStorage` branding with debounced Dexie `brandingProfiles`.

### P2 — quality of output & data
6. Swap PDF body to **pdfmake** (auto-paginating tables, bundled fonts); retire jspdf-autotable for the main report.
7. Real charts: ECharts `renderToSVGString` + `@resvg/resvg-wasm` → embed PNG in DOCX (`ImageRun`) and PDF; kill the `[Chart: ...]` placeholder and hand-drawn jsPDF chart.
8. Add **XLSX** export tab via exceljs streaming.
9. Wire `useReportData(date)` to DuckDB aggregates (Section 2.7) with SAMPLE_DATA fallback; remove hardcoded data from the hot path.

### P3 — scale, persistence, polish
10. Virtualize the channel selector (`@tanstack/react-virtual`) and split `BrandingPanel`/`ChannelSelector` into memoized children to kill keystroke re-renders.
11. Saved-report library in Dexie (`savedReports`); "duplicate / open / delete" UX; map `TEMPLATES_DEF` to persisted definitions.
12. Prefetch/warm worker on idle + per-route/per-worker size-limit budgets; wasm-opt the resvg/echarts wasm.
13. Optional: `docx-templates` for fully custom corporate .docx templates; optional Yjs-backed shared report definitions over the LAN hub.
14. CI: soffice golden-file diffs, tinybench perf gates, axe-core a11y pass.

---

## 9. Risks & notes
- `@resvg/resvg-wasm` is MPL-2.0 (file-level copyleft) — fine to use as a runtime wasm dependency, but if license posture is strict, the **OffscreenCanvas + `chart.getDataURL()`** path inside the worker is an MIT/Apache-only alternative (register a canvas creator).
- `pdfmake` vfs fonts add ~1.2MB — keep it in the worker chunk, lazy-imported, never on the initial route.
- Keep `jspdf` installed only if a genuinely trivial one-page export remains; otherwise it can be dropped once pdfmake covers PDF.
- Calibri substitution: bundling a font for `docx` guarantees identical rendering across machines; if not bundled, document that the OS may substitute the font.