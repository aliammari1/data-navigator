/**
 * Offline SVG → PNG rasterization via @resvg/resvg-wasm, for the export worker.
 *
 * Pitfalls handled here:
 *  - `initWasm()` must run EXACTLY ONCE per worker (a second call throws). The
 *    module-level promise guards it.
 *  - The wasm binary is SELF-HOSTED under `public/wasm/resvg/index_bg.wasm` and
 *    loaded by URL — never from unpkg (offline invariant). The copy step lives
 *    in `scripts/copy-worker-assets.mjs` (run on prebuild).
 *  - `loadSystemFonts:false` keeps output deterministic and offline.
 *
 * resvg-wasm is single-threaded and does NOT need SharedArrayBuffer / COOP-COEP.
 */

import { initWasm, Resvg } from "@resvg/resvg-wasm";

/** Self-hosted wasm path (served same-origin by the Next standalone server). */
const RESVG_WASM_URL = "/wasm/resvg/index_bg.wasm";

let wasmReady: Promise<void> | null = null;

function ensureResvg(): Promise<void> {
  wasmReady ??= initWasm(fetch(RESVG_WASM_URL));
  return wasmReady;
}

/** Rasterize an ECharts (or any) SVG string to PNG bytes (offline). */
export async function svgToPng(svg: string, widthPx = 1200): Promise<Uint8Array> {
  await ensureResvg();
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: widthPx },
    background: "white",
    font: { loadSystemFonts: false },
  });
  return resvg.render().asPng();
}

/** PNG bytes → data URI string (for pptxgenjs / pdfmake image inputs). */
export function pngToDataUri(png: Uint8Array): string {
  let bin = "";
  // Chunked to avoid call-stack limits on large images.
  const CHUNK = 0x8000;
  for (let i = 0; i < png.length; i += CHUNK) {
    bin += String.fromCharCode(...png.subarray(i, i + CHUNK));
  }
  return `data:image/png;base64,${btoa(bin)}`;
}
