/**
 * Copy worker-side runtime assets that MUST be self-hosted under `public/` for
 * the zero-network offline invariant (never fetched from a CDN at runtime).
 *
 * Currently: the @resvg/resvg-wasm binary used by export.worker for offline
 * SVG → PNG rasterization. Served same-origin at `/wasm/resvg/index_bg.wasm`.
 *
 * Invoked from `esbuild.workers.mjs` (worker:build) so it runs on every build,
 * and safe to run standalone: `node scripts/copy-worker-assets.mjs`.
 */

import { createRequire } from "node:module";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** @type {{ from: string, to: string }[]} */
const ASSETS = [
  {
    from: require.resolve("@resvg/resvg-wasm/index_bg.wasm"),
    to: resolve(root, "public/wasm/resvg/index_bg.wasm"),
  },
];

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
