/**
 * Copy worker-side runtime assets that MUST be self-hosted under `public/` for
 * the zero-network offline invariant (never fetched from a CDN at runtime).
 *
 * Currently: no assets are registered (export.worker's SVG → PNG rasterization
 * uses native OffscreenCanvas/createImageBitmap — see `src/workers/svg-raster.ts`
 * — so there is no wasm binary to self-host anymore).
 *
 * Invoked from `esbuild.workers.mjs` (worker:build) so it runs on every build,
 * and safe to run standalone: `node scripts/copy-worker-assets.mjs`.
 */

import { copyFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

/** @type {{ from: string, to: string }[]} */
const ASSETS = [];

export function copyWorkerAssets() {
  for (const { from, to } of ASSETS) {
    try {
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(from, to);
      console.log(`[worker-assets] copied ${to}`);
    } catch (err) {
      console.error(`[worker-assets] FAILED to copy ${from} -> ${to}`, err);
      throw err;
    }
  }
}

// Allow standalone execution.
if (import.meta.url === `file://${process.argv[1]}`) {
  copyWorkerAssets();
}
