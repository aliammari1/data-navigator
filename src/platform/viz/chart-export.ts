"use client";

/**
 * Offline chart export + clipboard helpers for the formulator chart surface.
 *
 * PNG export constraint (read carefully before wiring a button):
 * `OffscreenChart` renders in a Web Worker via `transferControlToOffscreen()`,
 * so the live ECharts instance lives in the worker and `getDataURL()` is NOT
 * reachable from the main thread. The reliable path is the main-thread
 * `echarts-for-react` (`ReactEChartsCore`) FALLBACK instance — its
 * `getEchartsInstance()` exposes `getDataURL()`. Every helper here therefore
 * takes a `getInstance` getter the caller wires to the FALLBACK ref. If the
 * chart is currently running through `OffscreenChart` (no fallback mounted),
 * the getter returns `null` and the helper reports that it could not export;
 * the caller should force the fallback render for export/copy.
 *
 * CSV export is pure + dependency-free (RFC-4180). The encoder
 * (`encodeRowsToCsv`) is separated from the download side-effect so it can be
 * unit-tested in isolation.
 *
 * Everything is fully offline: PNG bytes come from the local canvas, clipboard
 * writes go through the Electron main process (or `navigator.clipboard` when
 * available), and CSV is a local Blob download — no network at any point.
 */

import type { ECharts } from "./echarts-core";

/** Live ECharts instance (as returned by `ReactEChartsCore.getEchartsInstance()`). */
export type EChartsInstance = ECharts;

/** Getter the caller wires to the main-thread fallback instance ref. */
export type EChartsInstanceGetter = () => EChartsInstance | null;

// Retina-crisp exports without ballooning the data URL past the clipboard cap.
const PNG_PIXEL_RATIO = 2;
// Opaque fallback so a transparent-token export never lands as black-on-black.
const FALLBACK_BACKGROUND = "#ffffff";
const IMAGE_MIME = "image/png";
// Byte-order mark that makes spreadsheet apps read the CSV as UTF-8.
const UTF8_BOM = "\uFEFF";

// ─── Background resolution ────────────────────────────────────────────────────

/**
 * Resolve the active `--card` token to a concrete, canvas-safe color so PNG
 * exports aren't transparent-on-transparent. The token is authored in `oklch`
 * and, under the dark theme, indirects through `var(--surface-1)` — reading the
 * custom property literally would yield an unresolved `var(...)` string. A
 * hidden probe element lets the browser resolve the whole cascade to an `rgb()`
 * value for us.
 */
function resolveCardBackground(): string {
  if (typeof document === "undefined") return FALLBACK_BACKGROUND;
  const probe = document.createElement("div");
  probe.style.backgroundColor = "var(--card)";
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).backgroundColor;
  probe.remove();
  // A fully-transparent or unresolved value is useless as an export backdrop.
  if (!resolved || resolved === "rgba(0, 0, 0, 0)" || resolved === "transparent") {
    return FALLBACK_BACKGROUND;
  }
  return resolved;
}

// ─── PNG data URL ─────────────────────────────────────────────────────────────

/**
 * Build a PNG data URL from the fallback ECharts instance, or `null` when the
 * instance isn't reachable (chart is running through the worker-backed
 * `OffscreenChart` with no fallback mounted).
 */
export function buildChartPngDataUrl(getInstance: EChartsInstanceGetter): string | null {
  const chart = getInstance();
  if (!chart) return null;
  return chart.getDataURL({
    type: "png",
    pixelRatio: PNG_PIXEL_RATIO,
    backgroundColor: resolveCardBackground(),
  });
}

// ─── Client download helper ───────────────────────────────────────────────────

function triggerDownload(href: string, filename: string): void {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.click();
}

function withExtension(filename: string, ext: string): string {
  const lower = filename.toLowerCase();
  return lower.endsWith(`.${ext}`) ? filename : `${filename}.${ext}`;
}

/**
 * Download the chart as a PNG. Returns `false` (a no-op) when the fallback
 * instance isn't reachable, so the caller can decide to force the fallback
 * render and retry.
 */
export function exportChartPng(getInstance: EChartsInstanceGetter, filename: string): boolean {
  const dataUrl = buildChartPngDataUrl(getInstance);
  if (!dataUrl) return false;
  triggerDownload(dataUrl, withExtension(filename, "png"));
  return true;
}

// ─── Clipboard ────────────────────────────────────────────────────────────────

/** Shape of the Electron clipboard bridge exposed by preload (renderer view). */
type ClipboardBridge = { writeImage(dataUrl: string): Promise<void> };

function clipboardBridge(): ClipboardBridge | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { electronClipboard?: ClipboardBridge }).electronClipboard ?? null;
}

/** Decode a base64 image data URL into a Blob (for the `navigator.clipboard` path). */
function dataUrlToBlob(dataUrl: string): Blob {
  const commaIndex = dataUrl.indexOf(",");
  const meta = dataUrl.slice(0, commaIndex);
  const base64 = dataUrl.slice(commaIndex + 1);
  const mime = /data:([^;]+)/.exec(meta)?.[1] ?? IMAGE_MIME;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * Copy an image data URL to the OS clipboard. Prefers the Electron main-process
 * clipboard (fully offline, native image); falls back to the async
 * `navigator.clipboard` image API where the browser supports it. Throws a
 * descriptive error when neither path is available.
 */
async function copyImageDataUrl(dataUrl: string): Promise<void> {
  const bridge = clipboardBridge();
  if (bridge) {
    await bridge.writeImage(dataUrl);
    return;
  }

  const canUseAsyncClipboard =
    typeof navigator !== "undefined" &&
    !!navigator.clipboard &&
    typeof navigator.clipboard.write === "function" &&
    typeof ClipboardItem !== "undefined";

  if (canUseAsyncClipboard) {
    const blob = dataUrlToBlob(dataUrl);
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    return;
  }

  throw new Error("Copie d'image disponible uniquement dans l'application de bureau.");
}

/**
 * Copy the chart to the clipboard as a PNG. Throws when the fallback instance
 * isn't reachable (nothing to copy) or when no clipboard path is available.
 */
export async function copyChartPng(getInstance: EChartsInstanceGetter): Promise<void> {
  const dataUrl = buildChartPngDataUrl(getInstance);
  if (!dataUrl) {
    throw new Error("Aucun graphique à copier — rendu hors-écran actif.");
  }
  await copyImageDataUrl(dataUrl);
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

/** Union of keys across all rows, in first-seen order (handles heterogeneous rows). */
function collectHeaders(rows: Record<string, unknown>[]): string[] {
  const seen = new Set<string>();
  const headers: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        headers.push(key);
      }
    }
  }
  return headers;
}

/** Stringify a single cell value for CSV (before quoting). */
function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  // Dates and other objects: ISO for dates, JSON for the rest.
  if (value instanceof Date) return value.toISOString();
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** RFC-4180 field escaping: quote when the field contains `,` `"` CR or LF. */
function escapeCsvField(field: string): string {
  if (/[",\r\n]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/**
 * Encode rows to an RFC-4180 CSV string (CRLF line terminators, header from the
 * union of row keys). Pure — no BOM, no side effects. Returns `""` for no rows.
 */
export function encodeRowsToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = collectHeaders(rows);
  const lines: string[] = [headers.map(escapeCsvField).join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => escapeCsvField(formatCell(row[header]))).join(","));
  }
  return lines.join("\r\n");
}

/**
 * Download rows as a CSV file. Prepends a UTF-8 BOM so spreadsheet apps (Excel)
 * read accented French text correctly; the pure `encodeRowsToCsv` stays
 * BOM-free for testing.
 */
export function exportRowsCsv(rows: Record<string, unknown>[], filename: string): void {
  const csv = encodeRowsToCsv(rows);
  const blob = new Blob([UTF8_BOM + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, withExtension(filename, "csv"));
  URL.revokeObjectURL(url);
}
