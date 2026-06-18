# Implementation Brief — Offline Export / Reporting Pipeline

**Cluster:** Offline export & reporting (PDF / XLSX / DOCX / PPTX + chart rasterization)
**Targets:** Electron + Next.js 16, fully offline (no runtime network/CDN), medium-end PC (4-core, no WebGPU, 8 GB).
**Research date:** June 2026. Versions/APIs below were verified against npm registry + GitHub source.
**Downstream:** Implement directly from this. Do NOT re-research. Snippets are copy-pasteable; only swap data shapes.

Consuming feature plans: `report-studio.md`, `reconciliation.md`, `telecom.md`, `ai-briefing.md`, `history.md`.

---

## 0. Architecture invariants (read first — they bind every package below)

1. **Two execution lanes.**
   - **Web Worker (renderer-spawned):** pdfmake, docx, pptxgenjs, ECharts SSR → resvg PNG. These are pure-JS/WASM, no Node deps, build an `ArrayBuffer` and hand it back. This is the path for report-studio / ai-briefing / reconciliation-renderer.
   - **Electron main (Node):** exceljs streaming `WorkbookWriter` writing to disk with a `filename`, and any large export that must stream (telecom raw rows, reconciliation 100k+ rows). Streams via `fs`, never materializes in the renderer heap.
2. **Worker construction pattern is already established in this repo** — mirror it exactly:
   ```ts
   const worker = new Worker(new URL("./export.worker.ts", import.meta.url), {
     type: "module",
     name: "report-export",
   });
   const api = Comlink.wrap<ExportWorkerApi>(worker);
   ```
   Reference implementation to copy: `src/features/ai-analysis/worker/client.ts` (lazy singleton + inline fallback when `typeof Worker === "undefined"`). Comlink is installed (`comlink@^4.4.2`).
3. **Saving bytes goes through the existing Electron bridge, NOT `<a download>` in Electron.** The bridge already exists:
   - `src/platform/electron/electron-fs.ts` → `saveDialog(options)` returns `{ canceled, filePath? }`, `writeFile(filePath, data: ArrayBuffer)`.
   - IPC handlers `fs:saveDialog` / `fs:writeFile` are wired in `electron/main.ts` (lines 252 / 156) and exposed in `electron/preload.ts` (lines 123 / 108).
   - Browser fallback only: `new Blob([bytes]) → URL.createObjectURL → <a download>`.
4. **Every WASM/font/model asset must be self-hosted under `public/` and loaded by URL** — never from unpkg/jsDelivr/HF CDN. The repo already does this for onnxruntime-web (`src/platform/ai/transformers-env.ts`, served from `/models/onnx-runtime/`). resvg's `index_bg.wasm` follows the same rule (see §6).
5. **Charts → image is ALREADY half-built.** `src/features/report-studio/lib/charts.ts` does ECharts SSR (`echarts.init(null, …, { ssr:true, renderer:'svg' }).renderToSVGString()`). Reuse it; the new work is rasterizing that SVG to PNG via resvg for DOCX/PPTX/XLSX (DOCX can embed SVG but needs a PNG fallback — see §3). Never DOM-screenshot a chart.
6. **No new bundling config needed for the JS exporters.** The `new Worker(new URL(...))` pattern already works in this Next build. resvg-wasm needs an asset copy step (§6.4) but no webpack `asyncWebAssembly` flag because `initWasm(fetch(url))` loads the wasm at runtime from `/public`, not via import.

Target module layout (per `report-studio.md` §4.1, applies cluster-wide):
```
src/features/report-studio/
  lib/   pptx-generator.ts  docx-generator.ts  pdf-report.ts  xlsx-generator.ts  charts.ts  resvg-raster.ts  types.ts
  workers/ export.worker.ts            # Comlink: { pptx, docx, pdf, xlsx } -> ArrayBuffer
  hooks/   use-export-worker.ts        # worker lifecycle + Electron/browser save
src/platform/export/                   # NEW shared home for cross-feature exporters (recon/telecom/history/ai-briefing reuse)
  save-bytes.ts                        # saveDialog+writeFile / blob fallback (one impl, all features)
electron/services/xlsx-stream.ts       # NEW: exceljs WorkbookWriter (Node, disk streaming) over IPC
```

---

## 1. pdfmake — data-driven, auto-paginating PDF (worker)

**Install:** `pdfmake@0.3.11` (`pnpm add pdfmake @types/pdfmake`). MIT. Replaces `jspdf` + `jspdf-autotable` for the main tabular report (autotable OOMs past a few k rows).

**v0.3 vfs change — THE pitfall.** In v0.2 you wrote `pdfMake.vfs = pdfFonts.pdfMake.vfs`. In **v0.3 the shape changed**: the vfs module default-exports `{ vfs }` directly. Use `pdfFonts.vfs` (or `pdfFonts.default.vfs` depending on interop). Getting this wrong throws "File 'Roboto-Regular.ttf' not found in virtual file system" at render time.

**Minimal correct init + render (inside the export worker):**
```ts
// src/features/report-studio/lib/pdf-report.ts
import type { TDocumentDefinitions } from "pdfmake/interfaces";

export async function buildPdf(data: ReportData, options: PDFOptions): Promise<ArrayBuffer> {
  const pdfMake = (await import("pdfmake/build/pdfmake")).default;
  const pdfFonts = (await import("pdfmake/build/vfs_fonts")).default;
  // v0.3: vfs is on the module's `.vfs` (NOT `.pdfMake.vfs`).
  pdfMake.vfs = (pdfFonts as unknown as { vfs: Record<string, string> }).vfs;

  const docDefinition: TDocumentDefinitions = {
    pageSize: options.paperSize === "a4" ? "A4" : "LETTER",
    pageMargins: [40, 70, 40, 50],
    footer: (currentPage: number, pageCount: number) => ({
      text: `Page ${currentPage} of ${pageCount}`, alignment: "center", fontSize: 8, color: "#94a3b8",
    }),
    content: [
      data.logoDataUri ? { image: data.logoDataUri, width: 40 } : ({} as never), // base64 data URI from Dexie (offline)
      { text: "Channel Performance", style: "h1" },
      {
        table: {
          headerRows: 1,                       // auto-repeats header across page breaks
          widths: ["*", "auto", "auto", "auto"],
          body: [
            ["Channel", "Volume", "Success %", "Revenue"].map((h) => ({ text: h, style: "th" })),
            ...data.topChannels.map((ch) => [ch.name, fmtNum(ch.volume), fmtPct(ch.successRate), fmtAmount(ch.revenue)]),
          ],
        },
        layout: "lightHorizontalLines",
      },
      // chart image: data URI built from resvg PNG (see §6) — pdfmake also accepts raw SVG via { svg: svgString }
      options.includeCharts && data.chartPngDataUri ? { image: data.chartPngDataUri, width: 515 } : ({} as never),
    ],
    styles: {
      h1: { fontSize: 16, bold: true, color: "#003087", margin: [0, 8, 0, 6] },
      th: { bold: true, color: "white", fillColor: "#003087" },
    },
    defaultStyle: { font: "Roboto" },          // Roboto ships in the bundled vfs
  };

  return await new Promise<ArrayBuffer>((resolve, reject) => {
    pdfMake.createPdf(docDefinition).getBuffer((buf: Uint8Array) => {
      // copy out of the worker-owned buffer view to a standalone ArrayBuffer
      resolve(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    }, undefined /* tableLayouts */);
  });
}
```

**Key API:**
- `pdfMake.createPdf(docDefinition)` → has `.getBuffer(cb)`, `.getBlob(cb)`, `.download(name)` (download is browser-main-thread only; in the worker use `getBuffer`).
- `table.headerRows: 1` is the auto-pagination win — no manual page-header bookkeeping.
- pdfmake accepts vector charts directly via `{ svg: "<svg…>" }` (from `charts.ts`), avoiding rasterization entirely for the PDF path. Prefer `{ svg }` for PDF (crisp, smaller); use resvg PNG only for DOCX/PPTX/XLSX.

**Offline / self-host:** `pdfmake/build/vfs_fonts` ships base64 Roboto inside the JS — **no external font files, fully offline by default.** Bundle weight ~1.2 MB; it lives in the worker chunk (lazy `import()`), never the route's initial JS. If you only need Roboto, you may later build a slim custom vfs, but the default is offline-correct as-is.

**Wire into:** `src/features/report-studio/lib/pdf-report.ts` (refactor existing `generatePDFReport` → pure `buildPdf` returning `ArrayBuffer`); also the PDF branch of `reconciliation` and `telecom` exports and `ai-briefing` PDF.
**Pitfalls:** (a) the v0.3 `.vfs` shape above; (b) `pageBreak: "before"` on a heading + a giant table can produce one stray blank page — put the table immediately after the heading; (c) don't pass `Uint8Array` directly to Comlink return without slicing — transfer a clean `ArrayBuffer`.

---

## 2. exceljs — streaming XLSX (Electron main for big files; worker StreamBuf for small)

**Install:** already present — `exceljs@^4.4.0`. MIT, maintenance-mode but stable. Do NOT upgrade hoping for features; pin 4.4.0.

**Two correct modes — pick by size and lane:**

**(A) Small/medium, in-renderer-worker → in-memory buffer.** `wb.xlsx.writeBuffer()` returns the whole file in memory. Fine for a few-thousand-row report.
```ts
// src/features/report-studio/lib/xlsx-generator.ts  (runs in export.worker)
export async function buildXlsx(data: ReportData): Promise<ArrayBuffer> {
  const ExcelJS = (await import("exceljs")).default ?? (await import("exceljs"));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Channels");
  ws.columns = [
    { header: "Channel", key: "name", width: 28 },
    { header: "Volume", key: "volume", width: 14 },
    { header: "Success %", key: "successRate", width: 12 },
    { header: "Revenue", key: "revenue", width: 16 },
  ];
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF003087" } };
  for (const ch of data.topChannels) ws.addRow(ch);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;  // ArrayBuffer in browser/worker
}
```

**(B) Large (10k+ / 100k+ rows) → `stream.xlsx.WorkbookWriter` in Electron main, streaming to disk.** This is the memory-critical path (~45 MB heap for 100k rows vs SheetJS ~280 MB). `WorkbookWriter` needs Node streams — run it in **Electron main**, fed by a DuckDB cursor so rows are never fully materialized.
```ts
// electron/services/xlsx-stream.ts  (Node, main process, exposed over IPC)
import ExcelJS from "exceljs";

export async function exportLargeXlsx(
  filename: string,
  headers: string[],
  rowSource: AsyncIterable<unknown[]>,   // e.g. keyset-paged DuckDB result batches
): Promise<void> {
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({
    filename,                 // streams to this path on disk (the saveDialog result)
    useStyles: true,
    useSharedStrings: false,  // false = lower memory on huge writes (shared strings table is held in RAM)
  });
  const ws = wb.addWorksheet("data");
  ws.addRow(headers).commit();
  for await (const row of rowSource) {
    ws.addRow(row).commit();  // .commit() flushes the row to disk and frees it -> flat memory
  }
  await ws.commit();
  await wb.commit();          // finalizes the file
}
```
IPC: add `ipcMain.handle("export:xlsxStream", …)` in `electron/main.ts` (mirror the existing `fs:writeFile` handler at line 156), call `dialog.showSaveDialog` (already used by `fs:saveDialog`) to get `filename` first, expose in `preload.ts`.

**Key API:**
- `worksheet.addRow(rowArrayOrObject).commit()` — `.commit()` is mandatory in streaming mode (without it, rows buffer in memory, defeating the purpose).
- `workbook.commit()` resolves when the file is fully written.
- Non-streaming: `wb.xlsx.writeBuffer()` (browser) / `wb.xlsx.writeFile(path)` (Node).

**Offline / self-host:** pure JS, zero assets, fully offline. No fonts, no wasm.
**Wire into:** new `electron/services/xlsx-stream.ts` (telecom raw-row export, reconciliation full-diff export per `reconciliation.md` §4.7) and `src/features/report-studio/lib/xlsx-generator.ts` (small in-worker reports), `history` XLSX export.
**Pitfalls:** (a) `stream.xlsx.WorkbookWriter` will throw in a browser/worker if you pass `filename` (no `fs`) — only use it in Electron main; in the worker use mode (A); (b) forgetting `.commit()` per row silently reintroduces the OOM; (c) `useSharedStrings: true` shrinks the file but grows RAM (whole string table held) — keep `false` for large exports; (d) `argb` colors are 8-hex (`FF` alpha prefix), not 6.

---

## 3. docx — programmatic Word with embedded chart images (worker)

**Install:** already present — `docx@^9.7.1`. MIT.

**v9 breaking change — THE pitfall.** `ImageRun` now **requires a `type` field** (`"png" | "jpg" | "gif" | "bmp" | "svg"`). Old v8 code (`new ImageRun({ data, transformation })`) does not type-check and throws in v9. Verified against source (`IImageOptions = (RegularImageOptions | SvgMediaOptions) & CoreImageOptions`).

**SVG requires a PNG `fallback`.** If you embed the ECharts SVG directly (`type: "svg"`), docx mandates a `fallback` raster (a `RegularImageOptions` PNG) for Word versions that can't render SVG. This is exactly why resvg (§6) is needed: produce the PNG fallback. Simplest robust path: **embed the PNG directly** (`type: "png"`) and skip SVG.

```ts
// src/features/report-studio/lib/docx-generator.ts  (export.worker)
import { Document, Packer, Paragraph, HeadingLevel, ImageRun } from "docx";

export async function buildDocx(data: ReportData, options: DocxOptions): Promise<ArrayBuffer> {
  const chartPng: Uint8Array | null = data.chartPng ?? null;          // from resvg (§6)
  const logoPng: Uint8Array | null = data.logoPng ?? null;            // local file -> bytes (offline)

  const children: Paragraph[] = [
    new Paragraph({ text: "Transaction Report", heading: HeadingLevel.HEADING_1 }),
  ];
  if (logoPng) {
    children.push(new Paragraph({
      children: [new ImageRun({ type: "png", data: logoPng, transformation: { width: 64, height: 64 } })],
    }));
  }
  if (chartPng) {
    children.push(new Paragraph({
      children: [new ImageRun({ type: "png", data: chartPng, transformation: { width: 600, height: 240 } })],
    }));
  }
  // --- OR embed vector SVG with required PNG fallback (only if you want crisp vector) ---
  // new ImageRun({
  //   type: "svg",
  //   data: svgString,                                   // string | Uint8Array
  //   transformation: { width: 600, height: 240 },
  //   fallback: { type: "png", data: chartPng! },        // MANDATORY for type:"svg"
  // })

  const doc = new Document({ sections: [{ children }] });
  // Packer.toBuffer -> Node Buffer (works in worker too); convert to a clean ArrayBuffer:
  const buf = await Packer.toBuffer(doc);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}
```

**Key API:**
- `ImageRun({ type, data, transformation: { width, height } })` — `type` REQUIRED; `data` is `Buffer | string | Uint8Array | ArrayBuffer`.
- `Packer.toBuffer(doc)` → `Buffer` (worker/Node); `Packer.toBlob(doc)` → `Blob` (browser main only). Prefer `toBuffer` in the worker, return `ArrayBuffer`.

**Offline / self-host:** pure JS, zero native deps, fully offline. Word uses the document's declared fonts; **bundling a font is NOT done via docx** — if you need guaranteed-identical rendering, embed a font through the PDF path instead, or accept OS font substitution (Calibri may be absent on Linux). For exports, embedding chart **images** (not fonts) is what matters and is fully deterministic.
**Wire into:** `src/features/report-studio/lib/docx-generator.ts` (kill the existing `[Chart: …]` text placeholder; replace with `ImageRun` PNG from resvg). Also `ai-briefing` DOCX export and `reconciliation` DOCX (optional).
**Pitfalls:** (a) missing `type` (v9); (b) `type:"svg"` without `fallback` throws; (c) `Packer.toBlob` references `document`/`Blob` — fine on main thread, use `toBuffer` in the worker; (d) image `transformation` is in pixels and aspect-ratio is NOT auto-preserved — compute height from width × (chartH/chartW).

---

## 4. pptxgenjs — offline PowerPoint (worker)

**Install:** already present — `pptxgenjs@^4.0.1`. MIT, zero runtime deps (bundles JSZip).

**Get bytes (not writeFile) so the worker can hand them to the save bridge:**
```ts
// src/features/report-studio/lib/pptx-generator.ts  (export.worker)
export async function buildPptx(data: ReportData, template: PptxTemplate, channels: string[]): Promise<ArrayBuffer> {
  const pptxgen = (await import("pptxgenjs")).default;
  const pptx = new pptxgen();
  pptx.defineLayout({ name: "WIDE", width: 13.333, height: 7.5 });
  pptx.layout = "WIDE";

  const slide = pptx.addSlide();
  if (data.logoBase64) {
    // addImage data MUST be a data URI string: "data:image/png;base64,AAAA…"
    slide.addImage({ data: data.logoBase64, x: 0.4, y: 0.3, w: 0.8, h: 0.8 });
  }
  slide.addText("Transaction Report", { x: 0.5, y: 0.4, fontSize: 28, bold: true, color: "003087" });
  if (data.chartPngDataUri) {
    slide.addImage({ data: data.chartPngDataUri, x: 0.5, y: 1.5, w: 9, h: 4 }); // chart from resvg (§6)
  }
  // pptxgenjs native charts are also fine for simple bar/pie/line:
  // slide.addChart(pptx.ChartType.bar, [{ name: "Vol", labels, values }], { x, y, w, h });

  // v4: write() with outputType -> arraybuffer. (writeFile triggers a browser download; not for the worker.)
  return (await pptx.write({ outputType: "arraybuffer" })) as ArrayBuffer;
}
```

**Key API:**
- `pptx.write({ outputType: "arraybuffer" })` → `Promise<ArrayBuffer>` (also `"base64" | "blob" | "uint8array" | "nodebuffer"`).
- `pptx.writeFile({ fileName })` → browser download — **do not use** inside the worker / Electron; use `write()` + the save bridge.
- `slide.addImage({ data })` — `data` must be a **base64 data URI string** (`data:image/png;base64,…`), or use `{ path }` (filesystem, Node only). Raw `Uint8Array` is not accepted — convert resvg PNG bytes to a data URI.

**Offline / self-host:** pure JS, bundles JSZip, fully offline. No assets.
**Wire into:** `src/features/report-studio/lib/pptx-generator.ts` (refactor `generatePPTX` → pure `buildPptx` returning `ArrayBuffer`, feed real data + resvg chart + local logo).
**Pitfalls:** (a) `addImage` needs a data-URI string, not bytes — see §6.3 helper; (b) colors are 6-hex **without** `#`; (c) `write()` is async and returns the requested type — don't forget `await`.

---

## 5. ECharts SSR → SVG (already implemented, reuse)

**Status:** done. `src/features/report-studio/lib/charts.ts` already does `echarts.init(null, undefined, { renderer:"svg", ssr:true, width, height }).setOption(...).renderToSVGString()` and `chart.dispose()`. `echarts@^6.1.0` installed.

**Use it:**
- **PDF:** pass the SVG string straight to pdfmake as `{ svg: svgString }` (vector, crisp, no rasterization). Preferred for PDF.
- **DOCX / PPTX / XLSX:** ECharts SVG → resvg PNG (§6), because PPTX `addImage` and XLSX images need raster, and DOCX SVG needs a PNG fallback anyway.

**Pitfalls:** always `chart.dispose()` in a `finally` (the existing code does) — SSR instances leak otherwise. ECharts symbol/web-font assets must be bundled (default build is self-contained; do not enable any CDN map/symbol features).

---

## 6. @resvg/resvg-wasm — offline SVG → PNG rasterization (worker)

**Install:** `@resvg/resvg-wasm@2.6.2` (`pnpm add @resvg/resvg-wasm`). License **MPL-2.0** (file-level copyleft on the wasm; fine as a runtime dependency — note in license review). This is the offline rasterizer (no headless Chrome, no node-canvas/Cairo native build) that turns the ECharts SVG into PNG for DOCX/PPTX/XLSX.

**THE pitfalls:** (1) `initWasm()` must be called **exactly once per worker** — calling it twice throws. Guard with a module-level promise. (2) The wasm binary must be **self-hosted under `public/`** and loaded by URL — the README example fetches it from unpkg, which violates the offline constraint. (3) `initWasm` takes a `Promise<Response>` (i.e. `fetch(url)`) or a compiled `WebAssembly.Module`.

**Minimal correct init + render:**
```ts
// src/features/report-studio/lib/resvg-raster.ts  (runs inside export.worker)
import { initWasm, Resvg } from "@resvg/resvg-wasm";

let wasmReady: Promise<void> | null = null;

function ensureResvg(): Promise<void> {
  // initialize once and only once per worker
  wasmReady ??= initWasm(fetch("/wasm/resvg/index_bg.wasm")); // self-hosted, see §6.4
  return wasmReady;
}

/** ECharts SVG string -> PNG bytes (offline). */
export async function svgToPng(svg: string, widthPx = 1200): Promise<Uint8Array> {
  await ensureResvg();
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: widthPx },   // upscale for crisp output; 'zoom'|'height'|'original' also valid
    background: "white",                          // ECharts SVG already has bg; explicit is safer
    font: { loadSystemFonts: false },            // deterministic offline: don't touch OS fonts
  });
  const rendered = resvg.render();
  return rendered.asPng();                        // Uint8Array (PNG bytes)
}
```

### 6.3 Convert PNG bytes to the forms each exporter wants
```ts
// PPTX addImage + pdfmake image need a data URI string:
function pngToDataUri(png: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < png.length; i++) bin += String.fromCharCode(png[i]);
  return "data:image/png;base64," + btoa(bin);   // btoa exists in workers
}
// docx ImageRun takes the raw Uint8Array directly (type: "png", data: png).
```

### 6.4 Self-hosting the wasm (REQUIRED — this is the #1 offline gotcha for this cluster)
- The wasm ships at `node_modules/@resvg/resvg-wasm/index_bg.wasm`.
- Copy it into `public/wasm/resvg/index_bg.wasm` so it is served same-origin at `/wasm/resvg/index_bg.wasm` (matches the existing `/models/onnx-runtime/` self-hosting convention in `transformers-env.ts`).
- Add a copy step (postinstall or a small Node script in `scripts/`, mirror whatever copies the ORT wasm). Example:
  ```jsonc
  // package.json scripts
  "copy-resvg-wasm": "node -e \"require('fs').copyFileSync(require.resolve('@resvg/resvg-wasm/index_bg.wasm'),'public/wasm/resvg/index_bg.wasm')\""
  ```
  and run it in `postinstall` / prebuild. In the Electron packaged app, `public/` assets are served by the Next standalone server, so `/wasm/resvg/index_bg.wasm` resolves with no network.

**COOP/COEP:** resvg-wasm is **single-threaded** and does **not** require `SharedArrayBuffer`, so **no cross-origin isolation (COOP/COEP) headers are needed** for it. (Contrast: onnxruntime threaded wasm may want them, but that is the AI cluster's concern, not export.)

**License alternative (if MPL-2.0 is unacceptable):** `OffscreenCanvas` + ECharts canvas renderer + `chart.getDataURL()` inside the worker (register a canvas creator). MIT/Apache-only, no extra dep, but requires OffscreenCanvas (available in the target Electron Chromium). Keep resvg as primary unless legal rejects MPL.

**Wire into:** new `src/features/report-studio/lib/resvg-raster.ts`, imported by `docx-generator.ts`, `pptx-generator.ts`, and any XLSX-with-chart-image path. The export worker builds the PNG once and passes bytes/data-URI into each generator.

---

## 7. html-to-image — DOM node → PNG (main thread only, NOT for charts)

**Install:** `html-to-image@1.11.13` (`pnpm add html-to-image`). MIT. Replaces stale `html2canvas` as the default DOM-snapshot tool.

**Critical constraint:** it serializes a **live DOM node** via SVG `<foreignObject>` and needs `window`/`document` — **it CANNOT run in a Web Worker.** Use it on the main thread for UI snapshots (a rendered report card, a dashboard panel), then hand the resulting bytes/data-URL to the worker or save bridge.

```ts
import { toPng, toBlob } from "html-to-image";

const dataUrl = await toPng(node, {                 // node: HTMLElement
  pixelRatio: 2,            // cap at 2 on medium PCs; 4x can balloon to hundreds of MB
  cacheBust: true,
  backgroundColor: "#ffffff",
});
// or bytes for embedding/saving:
const blob = await toBlob(node, { pixelRatio: 2 });
```

**Use it for:** snapshotting an already-rendered UI panel (e.g. a report preview, a KPI card grid) into a report. **Do NOT use it for charts** — use ECharts SSR (§5) + resvg (§6), which is faster, lower-memory, and pixel-deterministic (tech-radar rule).
**Offline / self-host:** pure JS, no assets, offline. Cap `pixelRatio`; for very large nodes it gets slow (SVG foreignObject serialization is O(DOM)).
**Wire into:** main-thread call sites only (e.g. a "snapshot this view" button in report-studio / telecom). Keep `html2canvas` only as a fallback for `<canvas>`/WebGL nodes html-to-image can't capture.
**Pitfalls:** (a) not worker-safe; (b) external `<img>`/font URLs inside the node would trigger network — ensure embedded/local assets only (offline); (c) `cacheBust:true` appends a query string to asset URLs (harmless for local assets).

---

## 8. The export worker + save hook (glue — wires §1-§7 together)

```ts
// src/features/report-studio/workers/export.worker.ts
import * as Comlink from "comlink";

const api = {
  async pptx(data: ReportData, t: PptxTemplate, ch: string[]): Promise<ArrayBuffer> {
    const { buildPptx } = await import("../lib/pptx-generator"); return buildPptx(data, t, ch);
  },
  async docx(data: ReportData, o: DocxOptions): Promise<ArrayBuffer> {
    const { buildDocx } = await import("../lib/docx-generator"); return buildDocx(data, o);
  },
  async pdf(data: ReportData, o: PDFOptions): Promise<ArrayBuffer> {
    const { buildPdf } = await import("../lib/pdf-report"); return buildPdf(data, o);
  },
  async xlsx(data: ReportData): Promise<ArrayBuffer> {
    const { buildXlsx } = await import("../lib/xlsx-generator"); return buildXlsx(data);
  },
};
export type ExportWorkerApi = typeof api;
Comlink.expose(api);
```
```ts
// src/platform/export/save-bytes.ts  (shared by ALL features)
const MIME = {
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
} as const;

export async function saveBytes(bytes: ArrayBuffer, fileName: string, kind: keyof typeof MIME) {
  const electron = (globalThis as any).electronAPI?.fs;
  if (electron?.saveDialog) {
    const { canceled, filePath } = await electron.saveDialog({ defaultPath: fileName });
    if (canceled || !filePath) return { saved: false };
    await electron.writeFile(filePath, bytes);     // Node fs write, not renderer blob
    return { saved: true, path: filePath };
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: MIME[kind] }));
  const a = document.createElement("a"); a.href = url; a.download = fileName; a.click();
  URL.revokeObjectURL(url);
  return { saved: true };
}
```
Worker lifecycle hook: copy `src/features/ai-analysis/worker/client.ts` (lazy singleton + `typeof Worker === "undefined"` inline fallback). Warm the worker on idle (`requestIdleCallback`) so the first export doesn't pay the parse stall.

---

## 9. Per-package summary table

| Package | Version | Lane | Offline asset to self-host | Top gotcha |
|---|---|---|---|---|
| pdfmake | 0.3.11 (add) | worker | none (Roboto vfs bundled in JS) | v0.3 vfs is `pdfFonts.vfs`, not `pdfFonts.pdfMake.vfs` |
| exceljs | 4.4.0 (have) | Electron main (big) / worker (small) | none | `WorkbookWriter` needs Node `fs` → main only; `.commit()` per row mandatory |
| docx | 9.7.1 (have) | worker | none (font substitution by Word) | v9 `ImageRun` needs `type`; `type:"svg"` needs PNG `fallback` |
| pptxgenjs | 4.0.1 (have) | worker | none (bundles JSZip) | `addImage.data` must be a base64 data-URI; use `write({outputType:'arraybuffer'})` |
| @resvg/resvg-wasm | 2.6.2 (add) | worker | `public/wasm/resvg/index_bg.wasm` | `initWasm()` once only; fetch wasm from `/public`, not unpkg; MPL-2.0 |
| html-to-image | 1.11.13 (add) | main thread only | none | NOT worker-safe (needs DOM); never use for charts |
| echarts (SSR) | 6.1.0 (have) | worker | none | already in `charts.ts`; `dispose()` in finally |

---

## 10. Verification checklist (offline, before claiming done)
- ZIP-format outputs (pptx/docx/xlsx) start with PK magic `0x50 0x4B`; PDF starts with `%PDF`.
- Network fully disabled: generate all four formats → save via dialog (Electron) → file opens in LibreOffice/Reader.
- resvg path: confirm `/wasm/resvg/index_bg.wasm` is requested **same-origin** (DevTools Network), never a CDN.
- 100k-row XLSX via `WorkbookWriter` in main: peak heap stays flat (~tens of MB), file completes; renderer never freezes.
- `initWasm` called once: rapid double-export does not throw "Already initialized".
- docx with chart: opens in Word with a real embedded image (not `[Chart: …]` text), and on an SVG-less Word the PNG fallback shows.
