/// <reference lib="webworker" />

/**
 * export.worker — offline document generation OFF the renderer main thread (the
 * WEB build path). Electron uses a main-process export-service for streaming/
 * large exports; this worker builds an `ArrayBuffer` and hands it back to be
 * saved via the Electron fs bridge or a browser blob download.
 *
 * Generators (each lazy-imported so the chunk only loads what is used):
 *  - pdf  → pdfmake (bundled Roboto vfs; charts via vector {svg} when possible)
 *  - xlsx → exceljs in-memory writeBuffer (small/medium; big files stream in main)
 *  - docx → docx ImageRun (v9: `type` required) with rasterized PNG charts
 *  - pptx / slides → @marp-team/marp-core 16:9 widescreen presentation with rasterized PNG charts
 *
 * Comlink proxy name (renderer): `export` (see export-client.ts).
 *
 * Offline: all generators are pure JS; chart rasterization uses native
 * OffscreenCanvas/createImageBitmap (svg-raster) — no wasm, no network fetch.
 * ZIP outputs (xlsx/docx) start with PK; pdf starts with %PDF; pptx/slides returns HTML.
 */

import * as Comlink from "comlink";
import type { ChartImage, ReportDocument } from "./export-types";
import { pngToDataUri, svgToPng } from "./svg-raster";

// ─── Chart resolution (SVG → PNG once, reused across generators) ─────────────

async function resolveChartPng(chart: ChartImage): Promise<Uint8Array | null> {
  if (chart.png) return chart.png;
  if (chart.svg) return svgToPng(chart.svg, chart.width ?? 1200);
  return null;
}

/**
 * Copy a (possibly SharedArrayBuffer-backed or offset) byte view into a fresh,
 * standalone ArrayBuffer — safe to Comlink-transfer back to the renderer.
 */
function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(view.byteLength);
  new Uint8Array(out).set(view);
  return out;
}

/**
 * Resolve the pdfmake virtual file system across every module-interop shape:
 *  - `{ vfs }` (ESM-friendly bundling)
 *  - `{ default: { vfs } }`  / `{ pdfMake: { vfs } }`
 *  - the module/default object IS the font map directly (CJS in v0.3.x: keys are
 *    `Roboto-Regular.ttf` etc.) — the shape verified for pdfmake@0.3.11.
 * Getting this wrong throws "File 'Roboto-Regular.ttf' not found in VFS".
 */
function resolveVfs(mod: unknown): Record<string, string> {
  const m = mod as Record<string, unknown> & {
    default?: Record<string, unknown> & { vfs?: Record<string, string> };
    vfs?: Record<string, string>;
    pdfMake?: { vfs?: Record<string, string> };
  };
  const isFontMap = (o: unknown): o is Record<string, string> =>
    Boolean(o) &&
    typeof o === "object" &&
    Object.keys(o as object).some((k) => k.toLowerCase().endsWith(".ttf"));

  if (m.vfs) return m.vfs;
  if (m.default?.vfs) return m.default.vfs;
  if (m.pdfMake?.vfs) return m.pdfMake.vfs;
  if (isFontMap(m.default)) return m.default;
  if (isFontMap(m)) return m as Record<string, string>;
  return {};
}

// ─── PDF (pdfmake) ──────────────────────────────────────────────────────────

async function buildPdf(doc: ReportDocument): Promise<ArrayBuffer> {
  const pdfMakeMod = await import("pdfmake/build/pdfmake");
  const pdfFontsMod = await import("pdfmake/build/vfs_fonts");
  const pdfMake =
    (pdfMakeMod as unknown as { default: PdfMake }).default ?? (pdfMakeMod as unknown as PdfMake);
  pdfMake.vfs = resolveVfs(pdfFontsMod);

  const content: unknown[] = [];
  if (doc.logoDataUri) content.push({ image: doc.logoDataUri, width: 40, margin: [0, 0, 0, 8] });
  content.push({ text: doc.title, style: "h1" });
  if (doc.subtitle) content.push({ text: doc.subtitle, style: "subtitle" });

  for (const section of doc.sections) {
    if (section.title) content.push({ text: section.title, style: "h2" });
    content.push({
      table: {
        headerRows: 1, // auto-repeats header across page breaks
        widths: section.widths ?? section.headers.map(() => "auto"),
        body: [
          section.headers.map((h) => ({ text: h, style: "th" })),
          ...section.rows.map((r) => r.map((c) => String(c))),
        ],
      },
      layout: "lightHorizontalLines",
      margin: [0, 4, 0, 12],
    });
  }

  // PDF prefers crisp vector SVG (no rasterization needed).
  if (doc.includeCharts && doc.charts) {
    for (const chart of doc.charts) {
      if (chart.svg) content.push({ svg: chart.svg, width: 515, margin: [0, 8, 0, 8] });
      else if (chart.png) content.push({ image: pngToDataUri(chart.png), width: 515 });
    }
  }

  const docDefinition = {
    pageSize: doc.paperSize === "letter" ? "LETTER" : "A4",
    pageMargins: [40, 70, 40, 50],
    footer: (currentPage: number, pageCount: number) => ({
      text: `Page ${currentPage} of ${pageCount}`,
      alignment: "center",
      fontSize: 8,
      color: "#94a3b8",
    }),
    content,
    styles: {
      h1: { fontSize: 18, bold: true, color: "#0f172a", margin: [0, 8, 0, 4] },
      h2: { fontSize: 13, bold: true, color: "#1e293b", margin: [0, 8, 0, 4] },
      subtitle: { fontSize: 10, color: "#64748b", margin: [0, 0, 0, 8] },
      th: { bold: true, color: "white", fillColor: "#1e3a8a" },
    },
    defaultStyle: { font: "Roboto" },
  };

  return await new Promise<ArrayBuffer>((resolve, reject) => {
    try {
      pdfMake.createPdf(docDefinition).getBuffer((buf: Uint8Array) => {
        resolve(toArrayBuffer(buf));
      });
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

interface PdfMake {
  vfs: Record<string, string>;
  createPdf(def: unknown): { getBuffer(cb: (buf: Uint8Array) => void): void };
}

// ─── XLSX (exceljs in-memory) ───────────────────────────────────────────────

async function buildXlsx(doc: ReportDocument): Promise<ArrayBuffer> {
  const ExcelJSMod = await import("exceljs");
  const ExcelJS =
    (ExcelJSMod as unknown as { default?: typeof import("exceljs") }).default ?? ExcelJSMod;
  const wb = new ExcelJS.Workbook();
  wb.creator = "data-navigator";
  wb.created = new Date();

  doc.sections.forEach((section, idx) => {
    const ws = wb.addWorksheet(section.title?.slice(0, 28) || `Sheet${idx + 1}`);
    ws.columns = section.headers.map((h) => ({
      header: h,
      key: h,
      width: Math.max(12, h.length + 4),
    }));
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
    for (const row of section.rows) ws.addRow(row);
  });

  if (wb.worksheets.length === 0) wb.addWorksheet("Sheet1");
  const buf = await wb.xlsx.writeBuffer();
  return buf as ArrayBuffer;
}

// ─── DOCX (docx) ────────────────────────────────────────────────────────────

async function buildDocx(doc: ReportDocument): Promise<ArrayBuffer> {
  const {
    Document,
    Packer,
    Paragraph,
    HeadingLevel,
    TextRun,
    ImageRun,
    Table,
    TableRow,
    TableCell,
    WidthType,
  } = await import("docx");

  const children: InstanceType<typeof Paragraph>[] = [
    new Paragraph({ text: doc.title, heading: HeadingLevel.HEADING_1 }),
  ];
  if (doc.subtitle) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: doc.subtitle, italics: true, color: "64748B" })],
      }),
    );
  }
  if (doc.logoPng) {
    children.push(
      new Paragraph({
        children: [
          new ImageRun({
            type: "png",
            data: doc.logoPng,
            transformation: { width: 64, height: 64 },
          }),
        ],
      }),
    );
  }

  // Build the document body as a flat array (paragraphs + tables interleaved).
  const body: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [...children];

  for (const section of doc.sections) {
    if (section.title) {
      body.push(new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_2 }));
    }
    body.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: section.headers.map(
              (h) =>
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
                }),
            ),
          }),
          ...section.rows.map(
            (r) =>
              new TableRow({
                children: r.map((c) => new TableCell({ children: [new Paragraph(String(c))] })),
              }),
          ),
        ],
      }),
    );
  }

  if (doc.includeCharts && doc.charts) {
    for (const chart of doc.charts) {
      const png = await resolveChartPng(chart);
      if (!png) continue;
      const w = chart.width ?? 600;
      const h = chart.height ?? Math.round(w * 0.4);
      // v9: ImageRun requires `type`. Embed PNG directly (no SVG fallback needed).
      body.push(
        new Paragraph({
          children: [
            new ImageRun({ type: "png", data: png, transformation: { width: w, height: h } }),
          ],
        }),
      );
    }
  }

  const document = new Document({ sections: [{ children: body }] });
  const buf = await Packer.toBuffer(document);
  return toArrayBuffer(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
}

// ─── Presentation (Marp Core) ────────────────────────────────────────────────

async function buildPptx(doc: ReportDocument): Promise<ArrayBuffer> {
  const { Marp } = await import("@marp-team/marp-core");
  const marp = new Marp({
    html: true,
  });

  const slides: string[] = [];

  // Frontmatter & Title slide
  slides.push(`---
marp: true
theme: default
paginate: true
size: 16:9
style: |
  section {
    background-color: #F8FAFC;
    color: #0F172A;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  section.lead {
    background-color: #0B132B;
    color: #FFFFFF;
  }
  section.lead h1 {
    color: #38BDF8;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
    margin-top: 16px;
  }
  th {
    background-color: #1E3A8A;
    color: #FFFFFF;
    padding: 8px 12px;
    text-align: left;
  }
  td {
    border: 1px solid #E2E8F0;
    padding: 6px 12px;
  }
---

<!-- _class: lead -->
<!-- _paginate: false -->

# ${doc.title}

${doc.subtitle ? `### ${doc.subtitle}` : ""}

${doc.logoDataUri ? `![logo](${doc.logoDataUri})` : ""}
`);

  // One slide per table section
  for (const section of doc.sections) {
    const tableHeader = `| ${section.headers.join(" | ")} |`;
    const tableDivider = `| ${section.headers.map(() => "---").join(" | ")} |`;
    const tableBody = section.rows
      .slice(0, 15)
      .map((r) => `| ${r.map((c) => String(c).replace(/\|/g, "\\|")).join(" | ")} |`)
      .join("\n");

    slides.push(`---

## ${section.title || "Section de données"}

${tableHeader}
${tableDivider}
${tableBody}
`);
  }

  // Chart slides
  if (doc.includeCharts && doc.charts) {
    for (const chart of doc.charts) {
      const png = await resolveChartPng(chart);
      if (!png) continue;
      const dataUri = pngToDataUri(png);
      const titleBlock = chart.title ? `## ${chart.title}\n\n` : "";
      slides.push(`---

${titleBlock}![bg contain](${dataUri})
`);
    }
  }

  const markdown = slides.join("\n\n");
  const { html, css } = marp.render(markdown);
  const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${doc.title}</title>
  <style>
    ${css}
    body { margin: 0; background: #000; }
  </style>
</head>
<body>
  ${html}
</body>
</html>`;

  const bytes = new TextEncoder().encode(fullHtml);
  return toArrayBuffer(bytes);
}

// ─── Comlink exposure ───────────────────────────────────────────────────────

const api = {
  pdf: buildPdf,
  xlsx: buildXlsx,
  docx: buildDocx,
  pptx: buildPptx,
  slides: buildPptx,
  /** Rasterize an ECharts SVG to PNG bytes (offline) — reusable by callers. */
  svgToPng: (svg: string, width?: number): Promise<Uint8Array> => svgToPng(svg, width),
};

export type ExportWorkerApi = typeof api;

Comlink.expose(api);
