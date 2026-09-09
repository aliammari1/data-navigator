/**
 * Offline SVG → PNG rasterization for the export worker, via native Worker
 * APIs only (no @resvg/resvg-wasm, no wasm asset, no network fetch).
 *
 * Pipeline:
 *  1. Parse the SVG string's root `<svg>` tag for its natural (intrinsic)
 *     width/height — explicit numeric `width`/`height` attributes first
 *     (percentage values don't count as "natural" pixel dimensions), else the
 *     `viewBox` width/height, else a documented fallback aspect ratio. This
 *     mirrors resvg's own behavior of substituting the SVG spec's default
 *     100x100 viewport rather than failing on a dimension-less SVG.
 *  2. Scale so the output width equals `widthPx` (mirrors resvg's
 *     `fitTo: { mode: "width", value: widthPx }`), preserving aspect ratio.
 *  3. Decode the SVG via `createImageBitmap`, passing BOTH `resizeWidth` and
 *     `resizeHeight` explicitly — per the HTML spec, an image source with no
 *     natural dimensions (e.g. a dimension-less/viewBox-only SVG) causes
 *     `createImageBitmap` to reject with `InvalidStateError` unless both
 *     resize dimensions are supplied, so we never rely on its single-axis
 *     aspect-ratio inference.
 *  4. Flatten onto a white `OffscreenCanvas` background (matches resvg's
 *     `background: "white"`) and encode to PNG.
 *
 * This is single-threaded, needs no SharedArrayBuffer/COOP-COEP, and performs
 * zero network access — the offline invariant holds.
 */

/** Fallback natural size (SVG spec's default viewport) when neither explicit
 * width/height nor a viewBox can be parsed from the root `<svg>` tag. */
const FALLBACK_WIDTH = 100;
const FALLBACK_HEIGHT = 100;

interface NaturalSize {
  width: number;
  height: number;
}

/** Match the opening `<svg ...>` tag (attributes only, no children needed). */
function extractSvgRootTag(svg: string): string | null {
  const match = /<svg\b[^>]*>/i.exec(svg);
  return match ? match[0] : null;
}

/** Read a numeric (non-percentage) `attr="..."` value from an SVG tag string. */
function readNumericAttr(tag: string, attr: string): number | null {
  const re = new RegExp(`${attr}\\s*=\\s*["']\\s*([0-9.eE+-]+)\\s*(px)?\\s*["']`, "i");
  const match = re.exec(tag);
  if (!match) return null;
  const value = Number.parseFloat(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Read and parse the four `viewBox="minX minY w h"` numbers, if present. */
function readViewBoxSize(tag: string): NaturalSize | null {
  const match = /viewBox\s*=\s*["']\s*([^"']+)\s*["']/i.exec(tag);
  if (!match) return null;
  const parts = match[1]
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [, , width, height] = parts;
  return width > 0 && height > 0 ? { width, height } : null;
}

/**
 * Determine the SVG's natural width/height in user units, preferring explicit
 * numeric width/height attributes, then viewBox, then a documented fallback.
 */
export function getNaturalSize(svg: string): NaturalSize {
  const tag = extractSvgRootTag(svg);
  if (tag) {
    const width = readNumericAttr(tag, "width");
    const height = readNumericAttr(tag, "height");
    if (width !== null && height !== null) return { width, height };

    const viewBox = readViewBoxSize(tag);
    if (viewBox) return viewBox;
  }
  return { width: FALLBACK_WIDTH, height: FALLBACK_HEIGHT };
}

/** Rasterize an ECharts (or any) SVG string to PNG bytes (offline). */
export async function svgToPng(svg: string, widthPx = 1200): Promise<Uint8Array> {
  const natural = getNaturalSize(svg);
  const targetHeight = Math.round((widthPx * natural.height) / natural.width);

  try {
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const bitmap = await createImageBitmap(blob, {
      resizeWidth: widthPx,
      resizeHeight: targetHeight,
      resizeQuality: "high",
    });

    const canvas = new OffscreenCanvas(widthPx, targetHeight);
    const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;

    // Flatten SVG transparency onto white, exactly like resvg's `background: "white"`.
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, widthPx, targetHeight);
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    const pngBlob = await canvas.convertToBlob({ type: "image/png" });
    const buf = await pngBlob.arrayBuffer();
    return new Uint8Array(buf);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `svgToPng failed (widthPx=${widthPx}, targetHeight=${targetHeight}, natural=${natural.width}x${natural.height}): ${reason}`,
    );
  }
}

/** PNG bytes → data URI string (for marp / docx / pdfmake image inputs). */
export function pngToDataUri(png: Uint8Array): string {
  let bin = "";
  // Chunked to avoid call-stack limits on large images.
  const CHUNK = 0x8000;
  for (let i = 0; i < png.length; i += CHUNK) {
    bin += String.fromCharCode(...png.subarray(i, i + CHUNK));
  }
  return `data:image/png;base64,${btoa(bin)}`;
}
