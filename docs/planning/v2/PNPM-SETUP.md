# pnpm setup — finish the v2 implementation

All v2 **code** is written. This file lists the **pnpm / environment actions you should run** to make it resolve, build, and run. (Done on the very slow WSL2 `/mnt/d` filesystem, several installs timed out mid-relink, so do step 0 first.)

---

## 0. Re-stabilize `node_modules` (do this FIRST)

Several `pnpm add` runs were interrupted by the slow Windows filesystem, leaving `node_modules` in a half-relinked state. Re-run a clean install to reconcile it with the (correct) `package.json`:

```bash
pnpm install
```

> Tip: this repo lives on `/mnt/d` (Windows FS) under WSL2 — installs and `tsc` are very slow there. If you can, move the repo to the Linux filesystem (`~/…`) for ~10× faster installs/builds.

---

## 1. Dev-only packages still to add

These are imported by the new dev-quality/RUM instrumentation but never finished installing:

```bash
pnpm add -D web-vitals react-scan sonda binaryen @size-limit/preset-app @size-limit/time
```

- `web-vitals` — offline RUM; `src/platform/perf/web-vitals.ts` logs CLS/LCP/INP to Dexie (no network).
- `react-scan` — dev-only re-render profiler; `src/platform/perf/react-scan-dev.ts` enables it only when `NODE_ENV !== production` (tree-shaken from prod).
- `sonda` — bundle treemap.
- `binaryen` — `wasm-opt` for shrinking self-hosted `.wasm`.
- `@size-limit/preset-app` + `@size-limit/time` — needed by the new `.size-limit.json` per-route/per-worker budgets.

`@lhci/cli` is **heavy** (pulls Lighthouse + a Chromium download) — install it separately, and skip Chromium if you don't need the audit:

```bash
PUPPETEER_SKIP_DOWNLOAD=1 pnpm add -D @lhci/cli
```

(Used by `lighthouserc.cjs` + the `audit:lhci` script; run `pnpm start` first, it audits `http://localhost:3000` offline.)

---

## 2. Already installed (reference — no action)

`package.json` already records these (added during this work): `ml-kmeans`, `density-clustering`, `@bsull/augurs`, `apache-arrow`, `@uwdata/flechette`, `maplibre-gl`, `pmtiles`, `@protomaps/basemaps`, `deck.gl`, `@geoarrow/deck.gl-layers`, `supercluster`, `h3-js`, `node-llama-cpp`, `onnxruntime-node`, `@hocuspocus/server`, `@hocuspocus/extension-sqlite`, `bonjour-service`, `y-indexeddb`, `uplot`, `echarts-wordcloud`, `pdfmake`, `html-to-image`, `canvas-confetti`, `@resvg/resvg-wasm`, `@stdlib/stats`, `udsv`, `hyparquet`, `elkjs`, `node-sql-parser`, `monaco-sql-languages`, `driver.js`, `scrollama`, `streamdown`, `tinykeys`, `@headless-tree/react`, `@tanstack/react-form`, `@types/geojson`. (`knip`, `size-limit`, `dexie`, `yjs`, `ws`, `lib0`, `y-protocols`, `comlink`, etc. were already present.)

---

## 3. Substitutions made vs the dependency-catalog (intentional — FYI)

- **`ml-dbscan` → `density-clustering`.** `ml-dbscan` is **not published on npm** (404). The already-installed `density-clustering` provides DBSCAN (with noise labels); the analysis worker uses it. No action needed.
- **`@grafana/augurs` → `@bsull/augurs`.** The catalog's `@grafana/augurs` name 404s; the real published package is `@bsull/augurs` (installed). No action.
- **`@geoarrow/deck.gl-layers` is deprecated** → renamed `@geoarrow/deck.gl-geoarrow`. The old one is installed but the geo feature does **not** import it (it uses maplibre + pmtiles + deck.gl directly), so this is harmless. If you later wire GeoArrow GPU layers, switch to:
  ```bash
  pnpm remove @geoarrow/deck.gl-layers && pnpm add @geoarrow/deck.gl-geoarrow
  ```

---

## 4. pnpm v10 build-script approval (native modules)

`node-llama-cpp` was added to `onlyBuiltDependencies` in `pnpm-workspace.yaml` (alongside the existing `onnxruntime-node`, `better-sqlite3`, `electron`, `@swc/core`, …). After `pnpm install`, if pnpm reports "ignored build scripts", approve them so the native binaries link:

```bash
pnpm approve-builds   # ensure node-llama-cpp, onnxruntime-node, better-sqlite3, @hocuspocus/extension-sqlite are allowed
```

`node-llama-cpp` ships prebuilt binaries per platform; on a fresh machine its install script downloads the right one. (On WSL you'll get the linux-x64 binary; packaging a Windows build needs the win-x64 binary present at package time.)

---

## 5. System tool (NOT npm) — geospatial tiling

`tippecanoe` (build-time / Electron-main CLI that turns user GeoJSON/CSV into offline PMTiles) is a C++ tool, **not** an npm package. Install it from the OS package manager when you want on-device user-data tiling:

```bash
# Debian/Ubuntu (WSL):
sudo apt-get install -y build-essential libsqlite3-dev zlib1g-dev && \
  git clone https://github.com/felt/tippecanoe && cd tippecanoe && make -j && sudo make install
# macOS:  brew install tippecanoe
```

It is invoked via `child_process` from the main process / a build step — never bundled into the renderer.

---

## 6. AI models — fetch + pin hashes

The model **acquisition code** is written (`scripts/prepare-models.mjs`, `electron/model-download-service.ts`, `window.electronModels` IPC, and the "Download AI models" panel in Setup). To populate the weights (needs network ONCE):

```bash
pnpm run prepare:models           # fetches Qwen2.5-1.5B-Instruct q4_k_m GGUF + all-MiniLM-L6-v2 int8
pnpm run prepare:models --low-ram # also/instead the 0.5B fallback
```

Models go to `<userData>/models/llm/*.gguf` (GGUF, via the in-app downloader too) and `public/models/transformers/Xenova/all-MiniLM-L6-v2/` (embeddings).

⚠️ **Before a verified/air-gapped release:** the `sha256` + `bytes` fields are TODO placeholders in three files — fill them from the real Hugging Face artifacts to enable the hard integrity gate:
`scripts/prepare-models.mjs`, `src/platform/ai/models/model-manifest.ts`, `electron/model-download-service.ts`.

---

## 7. When you're ready to verify (these were intentionally NOT run)

```bash
pnpm typecheck      # tsc --noEmit   (slow on /mnt/d)
pnpm lint           # biome — was at 0 errors / 238 warnings (warnings are tolerated noNonNullAssertion etc.)
pnpm build          # worker build + next build
pnpm test           # vitest — note: vitest fork workers time out on /mnt/d; raise testTimeout / use pool:'threads' or run on the Linux FS
pnpm check:deadcode # knip (strict)   |  pnpm size  (budgets)  |  pnpm audit:lhci (after pnpm start)
```

**Safety net:** the entire pre-retry state is on branch `backup/v2-attempt-snapshot` (commit `048ac38`). Nothing here is committed — review the working tree before committing.
