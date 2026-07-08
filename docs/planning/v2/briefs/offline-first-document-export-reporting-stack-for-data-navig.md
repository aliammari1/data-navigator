# Tech Radar Brief — Offline-first document export & reporting stack for data-navigator (Next.js 16 + Electron, on-device): PDF, XLSX, DOCX, PPTX, DOM-to-image, charts-to-image, large-export memory on medium-end PCs

## Key findings

- PDF: No single winner — use a SPLIT stack. pdfmake (12.3k stars, MIT, v0.3.10 Jun-2026, active) for data-driven tabular reports (declarative JSON layout auto-paginates large tables); pdf-lib (via the maintained @cantoo fork) for merge/stamp/fill/assemble of existing PDFs; keep jspdf 4.2.1 (31.2k stars, MIT, v4.2.1 Mar-2026, active under yWorks) + jspdf-autotable only for simple/quick exports. Avoid @react-pdf/renderer for very large tables (heavy, React-reconciler + yoga-WASM overhead).
- pdf-lib ORIGINAL (Hopding) is effectively stale — last npm release v1.17.1 Nov-2021, 278 open issues, maintainer asked 'is this thing still on?'. For an offline app needing PDF editing/merging prefer the actively-patched fork @cantoo/pdf-lib (SVG + fontkit2 fixes, MIT), but pin versions; it is low-bus-factor (336 stars).
- XLSX large-export memory is the biggest medium-end-PC risk. SheetJS community edition is IN-MEMORY ONLY (a 50MB xlsx -> 300-400MB heap; 1M rows -> 8-12GB). ExcelJS WorkbookWriter streams rows to disk at ~constant memory (~45MB for 100k rows vs SheetJS 280MB, ~6x less). KEEP exceljs (already 4.4.0) and use streaming WorkbookWriter in Electron main/Node for big exports. Note exceljs 4.4.0 (Oct-2023) is maintenance-mode but stable; SheetJS left the public npm registry (self-hosted CDN, Apache-2.0) — an offline-bundling/supply-chain friction point.
- DOM-to-image: SWAP your current html2canvas (31.9k stars but STALE — v1.4.1 Jan-2022, README says 'experimental, not for production') for html-to-image (7.2k stars, MIT, v1.11.13 Feb-2025, active). html-to-image uses SVG foreignObject, scales better with DOM complexity, handles modern flex/grid/transforms better. Keep html2canvas only as fallback for canvas/WebGL captures.
- Charts-to-image: do NOT screenshot the DOM for charts. You already use echarts 6.1.0 — call native getDataURL()/renderToSVGString() (init SVG renderer for vector) for crisp, deterministic, low-memory offline export. For recharts (SVG), serialize the <svg> node directly and rasterize via canvas. Avoid html2canvas for charts entirely — faster, lower-memory, pixel-perfect.
- DOCX: keep docx (dolanmiu, 5.8k stars, MIT, v9.7.1 May-2026, very active, 4000+ commits) — pure-JS, zero native deps, browser + Node/Electron, best-in-class. For template-fill add docx-templates as a complement.
- PPTX: keep pptxgenjs (gitbrent, 5.6k stars, MIT, v4.0.1 Jun-2025, active, zero runtime deps, bundles JSZip) — de-facto standard for offline PowerPoint generation in Electron/browser/Node.
- MEDIUM-END-PC ARCHITECTURE RULE: run all heavy export work (XLSX streaming, large PDF assembly, image rasterization) in the ELECTRON MAIN/NODE process or a Web Worker — never on the renderer main thread. jsPDF-autotable hangs/OOMs past ~2,500-100,000 rows (all rows stay referenced, no GC, blocks UI). Stream/paginate, write to disk incrementally via fs (Electron advantage), free buffers between chunks.

## Dependencies evaluated

| Package | Stars | Maintenance | License | Offline | Role / replaces | URL |
|---|---|---|---|---|---|---|
| `jspdf` | 31.2k | Active — v4.2.1 Mar-2026, co-maintained by yWorks, 2333 commits | MIT | yes | Client-side PDF generation for simple/quick exports; pair with jspdf-autotable for basic tables. Already in project. | https://github.com/parallax/jsPDF |
| `jspdf-autotable` | 3.4k | Active — v5.0.8, tracks jsPDF | MIT | yes | Table plugin for jsPDF. Fine for small/medium tables; OOMs past ~2.5k-100k rows. Keep for light reports only. | https://github.com/simonbengtsson/jsPDF-AutoTable |
| `pdfmake` | 12.3k | Active — v0.3.10 Jun-2026, 102 releases | MIT | yes | RECOMMENDED for data-driven/tabular PDF reports — declarative JSON layout with automatic pagination of large tables. | https://github.com/bpampuch/pdfmake |
| `pdf-lib` | 8.5k | STALE — last release v1.17.1 Nov-2021, 278 open issues | MIT | yes | Create/edit/merge/split/stamp/fill existing PDFs. Use the maintained fork instead. | https://github.com/Hopding/pdf-lib |
| `@cantoo/pdf-lib` | 336 | Conditionally active fork — adds SVG + fontkit2, MIT; low bus-factor, pin versions | MIT | yes | Maintained pdf-lib replacement for PDF merge/stamp/form-fill/assembly. Niche but best-patched fork. | https://github.com/cantoo-scribe/pdf-lib |
| `@react-pdf/renderer` | 16.6k | Active — releases through Apr-2026, 432 releases | MIT | yes | Author PDFs as React components. Good DX; AVOID for very large tabular exports (memory/CPU heavy on medium PCs). | https://github.com/diegomura/react-pdf |
| `exceljs` | 15.4k | Maintenance-mode — v4.4.0 Oct-2023, stable, 655 open issues | MIT | yes | RECOMMENDED for XLSX. Use streaming WorkbookWriter in Node/Electron for large exports (~6x less memory than SheetJS). Already in project. | https://github.com/exceljs/exceljs |
| `sheetjs (xlsx)` | 36.3k | Active dev but NOT on public npm registry (self-hosted CDN) | Apache-2.0 | partial | Broadest format support (xls/ods/csv), fast for small files, but community edition is in-memory only (OOM risk on big exports) and registry move complicates offline bundling. Use only for format breadth, not large writes. | https://github.com/SheetJS/sheetjs |
| `docx` | 5.8k | Very active — v9.7.1 May-2026, 4039 commits | MIT | yes | RECOMMENDED best-in-class programmatic DOCX (Word) generation; browser + Node/Electron, zero native deps. Already in project. | https://github.com/dolanmiu/docx |
| `docx-templates` | 1.1k | Active | MIT | yes | Optional complement to docx for template-fill (merge data into a designed .docx template). | https://github.com/guigrpa/docx-templates |
| `pptxgenjs` | 5.6k | Active — v4.0.1 Jun-2025, zero runtime deps | MIT | yes | RECOMMENDED de-facto standard for offline PPTX (PowerPoint) generation; Electron/browser/Node. Already in project. | https://github.com/gitbrent/PptxGenJS |
| `html-to-image` | 7.2k | Active — v1.11.13 Feb-2025, 60 releases | MIT | yes | RECOMMENDED DOM-to-image (SVG foreignObject). Better modern-CSS/flex/grid/transform support; scales with DOM complexity. SWAP IN over html2canvas. | https://github.com/bubkoo/html-to-image |
| `html2canvas` | 31.9k | STALE — v1.4.1 Jan-2022, 'experimental' per README | MIT | yes | Currently in project. Keep ONLY as fallback for canvas/WebGL captures where SVG approach fails; not the default. | https://github.com/niklasvh/html2canvas |
| `echarts` | 63k | Very active — v6.1.0 | Apache-2.0 | yes | Charts-to-image via native getDataURL() (PNG/JPEG) or SVG renderer + renderToSVGString(). Use this, not DOM capture, for chart export. Already in project. | https://github.com/apache/echarts |
| `recharts` | 24k | Active — v3.8.0 | MIT | yes | SVG charts already in project. For export, serialize its <svg> node directly and rasterize via canvas; avoid html2canvas. | https://github.com/recharts/recharts |

## Brief

# Offline Document Export & Reporting — Tech Radar Brief

**App:** data-navigator (Next.js 16 + Electron, fully on-device).
**Constraints:** offline-only, no cloud/SaaS/telemetry; medium-end PC (4–8 cores, 8–16GB RAM, weak/no GPU; WebGPU often unavailable); mature or strongly-trending, permissive-licensed deps only.
**Date of research:** June 2026.

All recommended libraries are pure-JS / WASM-free-where-possible, run in browser + Web Worker + Electron main/Node, and require zero network at runtime. The headline risk for this app is **not capability — it is memory and main-thread blocking on large exports on a 8–16GB machine.** Electron is a major advantage here because heavy work can move to the Node main process and stream to disk via `fs`, which a pure-browser app cannot do.

---

## TL;DR recommendation set

| Format | Primary pick | When | Secondary / fallback |
|---|---|---|---|
| **PDF (tabular reports)** | **pdfmake** | Data-driven invoices/reports/large tables with auto-pagination | jspdf + jspdf-autotable (small tables only) |
| **PDF (edit/merge/stamp/fill)** | **@cantoo/pdf-lib** (maintained fork) | Combining or modifying existing PDFs, form fill, watermarks | pdf-lib original (stale; avoid for new work) |
| **PDF (component-authored)** | @react-pdf/renderer | Small/medium designed docs you want to write as React | Avoid for huge tables |
| **XLSX** | **exceljs (streaming WorkbookWriter)** | All exports, esp. large; run in Node/Electron main | SheetJS only for exotic format breadth |
| **DOCX** | **docx** (dolanmiu) | All Word generation | docx-templates for template fill |
| **PPTX** | **pptxgenjs** | All PowerPoint generation | — |
| **DOM → image** | **html-to-image** | UI snapshots, report cards, dashboards | html2canvas (canvas/WebGL only) |
| **Chart → image** | **native echarts getDataURL / SVG** | All chart export | serialize recharts `<svg>` + canvas raster |

**Net change vs your current package.json:** you already have `jspdf`, `jspdf-autotable`, `exceljs`, `docx`, `pptxgenjs`, `echarts`, `recharts`, and `html2canvas`. The recommended deltas are: **add `pdfmake`** (large-table PDFs), **add `@cantoo/pdf-lib`** (PDF assembly/merge if needed), **add `html-to-image` and demote `html2canvas` to fallback**, and **adopt exceljs streaming + worker/main-process offloading** patterns. No abandoned or single-maintainer-stale primary picks.

---

## 1. PDF generation

### The honest landscape
There is no universal best PDF library — each occupies a different niche, and choosing one for everything is the most common mistake.

- **jsPDF** (31.2k★, MIT, **v4.2.1 Mar-2026**, active under yWorks) — imperative "draw at coordinates" API. Great for receipts, badges, certificates, simple fixed layouts. With `jspdf-autotable` it does tables, but **autotable is where large exports die**: documented GitHub issues show hangs past ~2,500 rows and >1GB memory / browser "long-running script" warnings at ~100k rows because every row stays referenced (no GC) and the work blocks the main thread.
- **pdfmake** (12.3k★, MIT, **v0.3.10 Jun-2026**, active) — *declarative JSON document definition*. You describe content (columns, tables, styles) and it lays out + **auto-paginates**. This is the right tool for data-driven reports and big tables: the layout engine handles page breaks for you, and you can feed it generated content in chunks. Ships bundled fonts (Roboto) via a virtual file system (vfs) — fully offline. Bundle is large (~1.9MB min) but you can build a slim custom vfs with only the fonts you ship.
- **pdf-lib** (8.5k★, MIT) — *not a layout engine*; it creates/edits/merges/splits/stamps/fills existing PDFs. **Original repo is stale (last release v1.17.1, Nov-2021; 278 open issues; maintainer publicly uncertain).** Use the **`@cantoo/pdf-lib`** fork (MIT, adds SVG + fontkit2 fixes, conditionally maintained). Pin the version; it's low bus-factor (336★) but it's the best-patched continuation and is genuinely offline.
- **@react-pdf/renderer** (16.6k★, MIT, active through Apr-2026) — author PDFs as React components; pleasant DX and works in browser + Node. **But it carries a React reconciler + Yoga (flexbox) WASM layout engine and is heavy (~2.5MB+).** For thousands of table rows on a medium PC it is the wrong tool — CPU/memory cost is high. Reserve for small, designed documents where the React-component authoring is worth it.

### Recommendation
- **Tabular/data reports → pdfmake.** Generate the docDefinition, render in a **Web Worker** (pdfmake works in a worker), stream the resulting Blob to disk.
- **Assemble/merge/stamp/fill → @cantoo/pdf-lib** in the Electron main process.
- **Quick simple PDFs → keep jsPDF**, but cap autotable at a few thousand rows; route anything larger to pdfmake.

### Code sketch — pdfmake large table, paginated, off main thread
```ts
// pdf.worker.ts
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts'; // bundled offline fonts
pdfMake.vfs = pdfFonts.vfs;

self.onmessage = (e: MessageEvent<{ rows: string[][]; headers: string[] }>) => {
  const { rows, headers } = e.data;
  const body = [headers, ...rows]; // pdfmake auto-paginates this table
  const doc = {
    pageOrientation: 'landscape',
    content: [{ table: { headerRows: 1, body }, layout: 'lightHorizontalLines' }],
    defaultStyle: { fontSize: 8 },
  };
  pdfMake.createPdf(doc).getBlob((blob) => {
    self.postMessage(blob); // transfer to renderer, then save via Electron fs
  });
};
```

### Code sketch — merge generated chart-PDF pages with @cantoo/pdf-lib (Electron main)
```ts
import { PDFDocument } from '@cantoo/pdf-lib';
import { writeFile } from 'node:fs/promises';

export async function mergePdfs(buffers: Uint8Array[], out: string) {
  const merged = await PDFDocument.create();
  for (const buf of buffers) {
    const src = await PDFDocument.load(buf);
    const pages = await merged.copyPages(src, src.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
  }
  await writeFile(out, await merged.save()); // streams to disk, no browser memory ceiling
}
```

---

## 2. XLSX (Excel) — the memory-critical category

This is the **highest-risk area for a medium-end PC** and deserves the most care.

### Benchmarks (100k-row XLSX, ~8MB; from 2026 comparison data)
| Library | Peak memory | Time |
|---|---|---|
| SheetJS (community) | **280 MB** | 1.8s |
| ExcelJS (streaming) | **45 MB** | 2.4s |
| node-xlsx | 290 MB | 1.9s |

Scaling up: a **50MB xlsx expands to 300–400MB JS heap** in SheetJS once parsed; a **1M-row** sheet needs **8–12GB** in SheetJS community vs **~4GB** with ExcelJS streaming. On a 8–16GB machine, the SheetJS in-memory path will OOM or thrash the page file; ExcelJS streaming will not.

### Why ExcelJS wins *here*
- **`stream.xlsx.WorkbookWriter`** commits rows to disk as you write them → ~constant memory regardless of file size (~6× less than SheetJS).
- Rich formatting, styles, formulas, images — all supported.
- MIT, 15.4k★. **Caveat:** v4.4.0 (Oct-2023) is in *maintenance mode* (655 open issues, no new feature releases). It is stable and battle-tested; treat as "mature, not evolving." For an offline desktop app this is acceptable — pin it and own the integration.

### Why not SheetJS as primary
- Community edition is **in-memory only** (streaming write is a Pro/commercial feature) → OOM risk on big exports.
- **It left the public npm registry** and is distributed from a self-hosted CDN (`cdn.sheetjs.com`). For an offline app you'd vendor a tarball, but it's added supply-chain/bundling friction and breaks `pnpm` registry expectations. Apache-2.0, 36.3k★ — still excellent for **reading exotic formats** (xls/ods/csv/numbers), just not your large-write path.

### Recommendation
**Keep exceljs as the XLSX engine; do large exports via `WorkbookWriter` in the Electron main/Node process, streaming to disk.** Only reach for SheetJS if you must *import* unusual spreadsheet formats.

### Code sketch — streaming XLSX export in Electron main
```ts
import ExcelJS from 'exceljs';

export async function exportLargeXlsx(path: string, rowSource: AsyncIterable<unknown[]>, headers: string[]) {
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: path, useStyles: true });
  const ws = wb.addWorksheet('data');
  ws.addRow(headers).commit();
  for await (const row of rowSource) {
    ws.addRow(row).commit(); // row flushed to disk immediately → flat memory
  }
  await ws.commit();
  await wb.commit();
}
```
Pair this with a **DuckDB/Arrow streaming query** (you already have duckdb queries in `src/core/queries/duckdb.ts`) so rows are produced lazily and never fully materialized in JS.

---

## 3. DOCX (Word)

**docx (dolanmiu)** — 5.8k★, MIT, **v9.7.1 May-2026**, *very active* (4,039 commits, 95 releases). Pure-JS, zero native deps, works in browser + Node/Electron. This is unambiguously the best programmatic Word generator in the JS ecosystem; no real competitor for general-purpose generation. `officegen` is older/less maintained; `docx-templates` (1.1k★, MIT, active) is complementary for the *fill-a-designed-template* workflow.

**Recommendation:** keep `docx`. Add `docx-templates` only if business users supply `.docx` templates to merge data into. Generation is light enough to run in the renderer for normal report sizes; move to a worker if you embed many large images.

```ts
import { Document, Packer, Paragraph, Table, TableRow, TableCell } from 'docx';
const doc = new Document({ sections: [{ children: [
  new Paragraph({ text: 'Telecom Report', heading: 'Heading1' }),
  new Table({ rows: rows.map(r => new TableRow({ children: r.map(c => new TableCell({ children:[new Paragraph(String(c))] })) })) }),
]}]});
const blob = await Packer.toBlob(doc); // Node: Packer.toBuffer(doc) -> fs.writeFile
```

---

## 4. PPTX (PowerPoint)

**pptxgenjs** — 5.6k★, MIT, **v4.0.1 Jun-2025**, active, **zero runtime deps** (bundles JSZip), dual ESM/CJS. Standards-compliant OOXML, full text/table/shape/image/chart API, runs in Electron/browser/Node with no PowerPoint install. It is the de-facto standard and has no serious offline competitor.

**Recommendation:** keep `pptxgenjs`. For data slides, push **pre-rendered chart images** (from echarts, see below) onto slides rather than relying on its native chart objects when you need exact visual parity with the app.

```ts
import pptxgen from 'pptxgenjs';
const pptx = new pptxgen();
const slide = pptx.addSlide();
slide.addImage({ data: chartPngDataUrl, x: 0.5, y: 0.5, w: 9, h: 5 }); // chart from echarts
await pptx.writeFile({ fileName: 'report.pptx' }); // Electron: write to chosen path
```

---

## 5. DOM → image

### html-to-image vs html2canvas
- **html2canvas** (31.9k★, MIT) — **stale: last release v1.4.1, Jan-2022**, README explicitly calls itself *experimental / not recommended for production*. It re-implements browser painting in JS, so it gets **exponentially slower as element count grows** and has known gaps with modern CSS. It *does* capture `<canvas>`/WebGL pixel data well.
- **html-to-image** (7.2k★, MIT, **v1.11.13 Feb-2025**, actively maintained) — fork lineage of dom-to-image; serializes DOM to **SVG via `<foreignObject>`** and lets the *browser* render it. Better flex/grid/transform/web-font fidelity, **scales better with DOM complexity** (offloads to the browser engine), tiny bundle (~14KB gz). Weakness: it cannot reliably capture live `<canvas>`/WebGL contents.

### Recommendation
**Add `html-to-image` and make it the default; demote `html2canvas` to a fallback** used only when capturing canvas/WebGL surfaces. On a medium PC, cap output `pixelRatio` (e.g. 2) to control memory — a full-page 4×-scaled raster of a dashboard can balloon to hundreds of MB.

```ts
import { toPng } from 'html-to-image';
const dataUrl = await toPng(node, { pixelRatio: 2, cacheBust: true });
// fallback only for canvas/WebGL nodes:
// const canvas = await html2canvas(node, { scale: 2, useCORS: true });
```

---

## 6. Charts → image (the part most people get wrong)

**Do not use DOM-to-image for charts.** It's slow, memory-heavy, and produces inconsistent results. Both charting libs you already ship can export themselves natively, which is faster, lower-memory, and pixel-perfect — and fully offline.

- **echarts** (63k★, Apache-2.0, v6.1.0) — you already have `echarts` + `echarts-for-react`. Use the instance API:
  - Raster: `chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' })` → drop straight into PDF/PPTX/DOCX.
  - Vector: initialize with the **SVG renderer** (`echarts.init(el, null, { renderer: 'svg' })`) then `getDataURL`/`renderToSVGString()` for crisp scalable output (great for PDF). For headless export in the Electron main process, echarts supports SSR SVG string rendering with no DOM.
- **recharts** (24k★, MIT, v3.8.0) — pure SVG. **Serialize the chart's `<svg>` node** (`new XMLSerializer().serializeToString(svgEl)`), then either embed the SVG directly (PDF/DOCX support varies) or rasterize via an offscreen `<canvas>` + `Image`. No third-party lib needed.

```ts
// echarts -> PNG for PPTX/PDF
const url = echartsInstance.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' });

// recharts SVG -> PNG via canvas
function svgToPng(svgEl: SVGSVGElement, scale = 2): Promise<string> {
  const xml = new XMLSerializer().serializeToString(svgEl);
  const img = new Image();
  const { width, height } = svgEl.getBoundingClientRect();
  return new Promise((res) => {
    img.onload = () => {
      const c = Object.assign(document.createElement('canvas'), { width: width*scale, height: height*scale });
      const ctx = c.getContext('2d')!; ctx.scale(scale, scale); ctx.drawImage(img, 0, 0);
      res(c.toDataURL('image/png'));
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)));
  });
}
```

---

## 7. Large-export memory & medium-end-PC architecture

This is the cross-cutting concern that determines whether the app feels solid or crashes on a 8GB laptop.

**Rules of thumb to enforce in the codebase:**
1. **Move heavy export work off the renderer main thread.** Use a **Web Worker** for pdfmake/docx/image rasterization, and the **Electron main (Node) process** for anything that should stream to disk (XLSX WorkbookWriter, PDF merge). The renderer should orchestrate + show progress, not crunch.
2. **Stream, don't materialize.** Feed exporters from lazy iterators / DuckDB-Arrow streaming, not from a fully-built JS array of all rows. jsPDF-autotable's failures are precisely the "build everything in memory, keep all rows referenced" anti-pattern.
3. **Prefer disk-streaming writers under Electron.** ExcelJS `WorkbookWriter` and pdf-lib-in-main both write incrementally; this sidesteps the browser's per-tab heap ceiling entirely.
4. **Bound rasterization.** Cap `pixelRatio`/`scale` (2 is usually enough), tile very large captures, and revoke object URLs / null out big buffers between chunks so GC can reclaim them.
5. **Show progress & allow cancel.** Long exports must be cancellable (AbortController / worker terminate) so a runaway export can't lock the UI.
6. **No WebGPU dependency.** None of these export paths need GPU; they're CPU/WASM-free JS. This matches the "WebGPU often unavailable" constraint perfectly — nothing here regresses on integrated-GPU machines.
7. **Bundle hygiene.** pdfmake (~520KB gz w/ fonts), @react-pdf (~heavy), exceljs, and echarts are the bundle-size heavyweights. **Lazy-load each exporter on demand** (dynamic `import()` when the user clicks Export) so they never sit in the initial Next.js bundle. In Electron you can also keep XLSX/PDF-merge logic entirely in the main process so it never ships to the renderer bundle at all.

**Suggested module boundary:**
```
renderer (UI)  ──postMessage──▶  export.worker.ts   (pdfmake, docx, html-to-image, chart raster)
      │
      └──IPC──▶  electron/main export service  (exceljs WorkbookWriter, @cantoo/pdf-lib merge, fs streaming)
```

---

## 8. Maintenance / license / risk summary

| Lib | Stars | Last activity | License | Offline | Risk note |
|---|---|---|---|---|---|
| jspdf | 31.2k | v4.2.1 Mar-2026 | MIT | yes | autotable OOMs on huge tables |
| jspdf-autotable | 3.4k | v5.0.8 | MIT | yes | cap row count |
| pdfmake | 12.3k | v0.3.10 Jun-2026 | MIT | yes | bundle size; trim vfs |
| pdf-lib (orig) | 8.5k | v1.17.1 Nov-2021 | MIT | yes | **stale — avoid for new** |
| @cantoo/pdf-lib | 336 | active fork | MIT | yes | low bus-factor; pin |
| @react-pdf/renderer | 16.6k | Apr-2026 | MIT | yes | heavy; not for big tables |
| exceljs | 15.4k | v4.4.0 Oct-2023 | MIT | yes | maintenance-mode but stable; **streaming wins** |
| sheetjs | 36.3k | active | Apache-2.0 | partial | off-registry; in-memory only |
| docx | 5.8k | v9.7.1 May-2026 | MIT | yes | best-in-class |
| docx-templates | 1.1k | active | MIT | yes | optional template fill |
| pptxgenjs | 5.6k | v4.0.1 Jun-2025 | MIT | yes | de-facto standard |
| html-to-image | 7.2k | v1.11.13 Feb-2025 | MIT | yes | **default DOM capture** |
| html2canvas | 31.9k | v1.4.1 Jan-2022 | MIT | yes | **stale; fallback only** |
| echarts | 63k | v6.1.0 | Apache-2.0 | yes | use native export |
| recharts | 24k | v3.8.0 | MIT | yes | serialize svg |

All picks are MIT/Apache-2.0 (permissive), run with no network at runtime, and need no GPU.

---

## 9. Concrete action items for data-navigator

1. **Add `pdfmake`**; route large/tabular PDF reports to it (worker), keep jsPDF for quick exports. Trim its font vfs to only shipped fonts.
2. **Add `@cantoo/pdf-lib`** (pinned) if/when you need PDF merge/stamp/form-fill; run it in `electron/main.ts` and stream output via `fs`.
3. **Add `html-to-image`; switch default DOM-capture calls to it; keep `html2canvas` only behind a canvas/WebGL fallback branch.**
4. **Replace any chart DOM-screenshotting with `echarts.getDataURL()` / SVG renderer** and direct `<svg>` serialization for recharts.
5. **Adopt exceljs `stream.xlsx.WorkbookWriter` in the main process** for all non-trivial XLSX exports, fed by DuckDB streaming so rows are never fully materialized.
6. **Lazy-load every exporter** (`import()` on user action) to keep the Next.js initial bundle lean; push XLSX/PDF-merge into the Electron main process so they leave the renderer bundle entirely.
7. **Wrap exports with progress + AbortController/worker-terminate** so large jobs are cancellable on a medium PC.
