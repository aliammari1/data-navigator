# Tech Radar Brief — Offline-first developer tooling & CLIs to raise quality/perf of data-navigator (Next.js 16 + Electron, on-device)

## Key findings

- The repo is already on best-in-class dead-code/dep-hygiene: knip 6.16 (11.5k stars, ISC, actively maintained, release Jun 2026), dependency-cruiser 17, sherif, publint, and @arethetypeswrong/cli. No replacement needed here — instead enable knip's strict/CI gating, plugin coverage for Vitest/Storybook/Playwright/Next, and a circular-dependency rule in depcruise (already partially wired via check:deps).
- Bundle/size discipline is mostly covered: size-limit 12 + @next/bundle-analyzer are present but underused. Recommendation: switch size-limit to the @size-limit/preset-app + @size-limit/time preset to also budget parse/eval time (not just gzip bytes), add per-route/per-worker budgets (the app ships many heavy workers: onnxruntime-web, transformers.js, web-llm, vad, sherpa), and add Sonda (773★, MIT, universal analyzer incl. Next) as a richer, fully-offline interactive treemap alternative/complement to @next/bundle-analyzer. Avoid bundlesize (unmaintained); bundlewatch is git/PR-status oriented and less useful for a desktop/offline app.
- Lighthouse-style perf/a11y auditing CAN be fully offline: Lighthouse + @lhci/cli (lighthouse-ci, 7k★, Apache-2.0) run against a localhost Next server with no internet, using the bundled local Chrome (or Electron's Chromium). Use `lhci collect` against http://localhost:3000 with assertions in lighthouserc.js and `--upload.target=filesystem` so NOTHING leaves the machine. Unlighthouse (4.6k★, MIT, active Jun 2026) is a faster multi-page crawler-based alternative — also offline against localhost — good for auditing every dashboard route in one pass.
- Accessibility is already wired the right way: @axe-core/playwright + vitest-axe both run axe-core (7.2k★, MPL-2.0, release Jun 2026) fully locally with zero network. Keep both; add @storybook/addon-a11y (already present) gating in test-runner, and consider pa11y-ci only if you want WCAG HTMLCS rules in addition to axe — but axe-core alone is the modern standard and sufficient.
- Benchmarking is already correct: the `bench` script uses Vitest bench which wraps tinybench (tinylibs, MIT, ~2KB). For micro-benchmarks of hot data paths (Arquero/DuckDB/Arrow transforms, clustering, stats) tinybench is the right offline choice. mitata is a strong cross-runtime alternative but is less actively maintained — stick with tinybench/Vitest bench. Add `bench` to CI as a non-gating report or with a regression threshold via a custom compare script.
- React render profiling can be done locally with react-scan (21.4k★, MIT) — install as a dev dependency (NOT the unpkg CDN script, to stay offline) and run it only in dev to catch unnecessary re-renders in the heavy dashboard/table/chart trees (react-grid-layout, react-table virtualization, echarts/vega). Pair with React DevTools Profiler (bundled, offline). This directly targets the medium-end-PC main-thread budget.
- WASM build/optimization tooling is relevant because the app ships/consumes WASM (onnxruntime-web, duckdb-wasm-style flows, transformers.js, vad). Even without authoring Rust, run binaryen's wasm-opt (binaryen, very active, Apache-2.0) on any first-party/vendored .wasm to cut 10-30% size, and ensure SIMD + threads paths with graceful fallback. If/when authoring WASM, wasm-pack + wasm-opt + vite-plugin-wasm/@rollup/plugin-wasm is the mature, fully-offline toolchain. Note WASM threads need COOP/COEP headers (SharedArrayBuffer) which Electron can set unconditionally — an advantage over the browser path.
- Dependency-graph visualization: madge (10.1k★, MIT) is heavier-downloaded but dependency-cruiser (already installed, 6.1k★, MIT) is more powerful for VALIDATION (forbidden-dependency rules, orphans, circular detection) which is what a layered architecture app needs. Keep depcruise for rules; optionally add madge ONLY for quick `--circular` graphs/SVGs in docs. Both run fully offline (madge needs graphviz only for image output; JSON/text needs nothing).
- All recommendations satisfy the hard constraints: every tool runs locally (Node/Electron main, web workers, or bundled Chromium), needs no cloud/SaaS/telemetry at runtime, and all carry permissive licenses (MIT/ISC/Apache-2.0) except axe-core (MPL-2.0, file-level copyleft — fine for tool usage, you don't modify its source). Net new deps to add are small/dev-only: Sonda, react-scan, @lhci/cli, and optionally unlighthouse/madge/wasm-opt.

## Dependencies evaluated

| Package | Stars | Maintenance | License | Offline | Role / replaces | URL |
|---|---|---|---|---|---|---|
| `knip` | 11.5k | Very active — release 6.16.1 Jun 6 2026, 590 releases | ISC | yes | Dead code + unused files/exports/deps/devDeps detection; ~150 framework plugins. ALREADY IN REPO — enable strict/CI gating | https://github.com/webpro-nl/knip |
| `dependency-cruiser` | 6.1k | Active (v17.x) | MIT | yes | Validate dependency graph: forbidden deps, orphans, circular detection. ALREADY IN REPO — keep for layer/architecture rules | https://github.com/sverweij/dependency-cruiser |
| `size-limit` | (present, v12) | Active (Andrei Sitnik / ai) | MIT | yes | Perf budgets on bundle bytes AND parse/eval time via @size-limit/preset-app + time plugin. ALREADY IN REPO — add per-route/per-worker budgets | https://github.com/ai/size-limit |
| `sonda` | 773 | Active — MIT, ~695 commits | MIT | yes | Universal offline bundle analyzer/treemap (Vite/Rollup/esbuild/webpack/Next). Richer complement to @next/bundle-analyzer | https://github.com/filipsobol/sonda |
| `@next/bundle-analyzer` | (part of Next) | Active (Next core) | MIT | yes | webpack-bundle-analyzer treemap for Next builds. ALREADY IN REPO via ANALYZE=true — keep | https://github.com/vercel/next.js/tree/canary/packages/next-bundle-analyzer |
| `lighthouse-ci (@lhci/cli)` | 7k | Active — v0.15.1 Jun 2025 | Apache-2.0 | yes | Run Lighthouse perf/a11y/best-practices audits offline vs localhost Next server; assertions + filesystem upload (no cloud) | https://github.com/GoogleChrome/lighthouse-ci |
| `unlighthouse` | 4.6k | Very active — v0.17.10 Jun 8 2026 | MIT | yes | Crawl every route and run Lighthouse on all pages in one fast pass, offline vs localhost. Optional alternative to lhci for multi-page coverage | https://github.com/harlan-zw/unlighthouse |
| `axe-core` | 7.2k | Very active — v4.12.1 Jun 10 2026 | MPL-2.0 | yes | Accessibility rules engine. ALREADY IN REPO via @axe-core/playwright + vitest-axe — keep, fully local | https://github.com/dequelabs/axe-core |
| `@axe-core/playwright` | (part of axe-core org) | Active | MPL-2.0 | yes | Run axe in Playwright E2E against localhost/Storybook. ALREADY IN REPO | https://github.com/dequelabs/axe-core-npm |
| `tinybench` | (tinylibs, ~1k+) | Active | MIT | yes | Microbenchmark engine under Vitest bench. ALREADY IN REPO via `vitest bench` — use for hot data paths | https://github.com/tinylibs/tinybench |
| `react-scan` | 21.4k | Very active | MIT | yes | Detect unnecessary React re-renders in heavy dashboard/table/chart trees; complements React DevTools Profiler | https://github.com/aidenybai/react-scan |
| `binaryen (wasm-opt)` | ~7k | Very active (WebAssembly org) | Apache-2.0 | yes | Optimize/shrink first-party or vendored .wasm 10-30%; enable SIMD. Use on any WASM you ship/control | https://github.com/WebAssembly/binaryen |
| `madge` | 10.1k | Active | MIT | partial | Quick circular-dependency detection and module graph SVGs for docs. OPTIONAL — depcruise already covers validation | https://github.com/pahen/madge |
| `web-vitals` | 8.5k | Active (GoogleChrome) | Apache-2.0 | yes | Capture CLS/LCP/INP etc. from real local sessions; log to local IndexedDB/OPFS instead of any endpoint — fully offline RUM | https://github.com/GoogleChrome/web-vitals |

## Brief

# Offline-First Tech-Radar Brief: Quality & Perf Tooling for data-navigator

**App context:** Next.js 16 + React 19 + Electron 41 desktop app, all data processing on-device (DuckDB, Arquero, Arrow-shaped flows, ONNX/transformers.js/web-llm/sherpa/VAD workers). Target: medium-end PC (4-8 cores, 8-16GB RAM, WebGPU often absent). Everything below runs **with no internet at runtime**: Node/Electron-main, web workers, or bundled Chromium. No SaaS, no telemetry, no hosted inference.

**TL;DR:** Your toolchain is already strong. The repo already ships knip, dependency-cruiser, size-limit, @next/bundle-analyzer, @axe-core/playwright, vitest-axe, publint, sherif, @arethetypeswrong/cli, and Vitest bench (tinybench). The highest-leverage moves are not swapping tools but **activating and gating** the ones you have, plus four small dev-only additions: **Sonda** (richer offline bundle treemap), **@lhci/cli** (offline Lighthouse against localhost), **react-scan** (local re-render profiler), and **wasm-opt** (shrink shipped WASM). Optional: **unlighthouse** (multi-route audit), **madge** (circular-dep graphs), **web-vitals** (local RUM to IndexedDB).

---

## 1. Dead code & dependency hygiene — KEEP, GATE HARDER

### knip 6.16 — 11.5k★, ISC, release Jun 6 2026 (`https://github.com/webpro-nl/knip`)
Already installed. ts-prune's author redirects to knip; unimported is unmaintained. knip is the unambiguous modern winner: finds unused files, exports, types, enum/class members, **and** unused (dev)dependencies, with ~150 framework plugins. It is fully offline (static analysis only).

**Action items:**
- Add a `knip` script and CI gate. You likely want plugin coverage for the frameworks already in the repo (Next, Vitest, Storybook, Playwright, Biome, changesets).
- Use a `knip.json` with `workspaces`/`entry`/`project` tuned for the `src` + `electron` + `scripts` + `.storybook` layout (mirroring your depcruise targets).
- Run in two modes: `--production` (ships-to-users surface) for the strict CI gate, and full mode locally for devDeps/test-file cleanup.

```jsonc
// knip.json (sketch)
{
  "$schema": "https://unpkg.com/knip@6/schema.json",
  "entry": [
    "src/app/**/{page,layout,route,loading,error,not-found}.tsx",
    "electron/main.ts",
    "src/**/*.worker.ts",
    "scripts/*.{mjs,ts}"
  ],
  "project": ["src/**/*.{ts,tsx}", "electron/**/*.ts", "scripts/**/*.{ts,mjs}"],
  "ignoreDependencies": ["onnxruntime-web"], // dynamically loaded in workers; whitelist as needed
  "next": true,
  "vitest": true,
  "storybook": true,
  "playwright": true
}
```

```jsonc
// package.json scripts
"check:dead": "knip",
"check:dead:ci": "knip --production --strict"
```

> **Worker gotcha:** the heavy ML workers (onnxruntime-web, @huggingface/transformers, @mlc-ai/web-llm, @ricky0123/vad-web, sherpa-onnx-node, kokoro-js) are often loaded by string path / dynamic import. Whitelist them in `ignoreDependencies` / `entry` so knip doesn't flag them as unused, but DO let knip flag genuinely dead UI deps — with ~180 deps there is almost certainly slack (e.g. overlapping chart/export libs: echarts + recharts + vega + react-vega; jspdf + pptxgenjs + docx + exceljs).

### dependency-cruiser 17 — 6.1k★, MIT (`https://github.com/sverweij/dependency-cruiser`)
Already wired via `check:deps`. Keep it for **architecture validation** (it is stronger than madge here): forbidden-dependency rules, orphan detection, and `no-circular`. For a layered app (`core/`, `design/`, `app/`, `electron/`) this enforces boundaries that knip can't.

**Action items:**
- Ensure a `no-circular` rule is `error` (cycles are a real perf/coldstart risk in worker bundles).
- Add provider-boundary rules to match `scripts/check-provider-boundaries.mjs` so the two checks don't drift.

### madge 10.1k★, MIT (`https://github.com/pahen/madge`) — OPTIONAL
Higher download count but **overlaps** depcruise. Only add it for fast one-off `madge --circular src` or doc SVGs (`madge --image graph.svg`, needs graphviz only for image output; JSON/text is graphviz-free and offline). Don't duplicate validation logic across both.

### Keep as-is: publint, sherif, @arethetypeswrong/cli
These already cover package-export correctness and monorepo/version-mismatch hygiene, fully offline. No change.

---

## 2. Bundle analysis & perf budgets — ACTIVATE + ADD SONDA

### size-limit 12 — MIT (`https://github.com/ai/size-limit`) — KEEP, EXPAND
Already present with a single 1800 kB gzip budget on `.next/static/chunks/*.js`. That's a blunt instrument for an app this heavy. Upgrade the config to:

1. **Budget parse/eval TIME, not just bytes** — critical for medium-end CPUs. Add `@size-limit/preset-app` (runs the bundle in a headless Chromium and reports estimated load + execution time on a throttled CPU). This catches "small gzip, slow to parse" regressions that byte budgets miss.
2. **Per-surface budgets** so one heavy worker doesn't hide under the aggregate.

```jsonc
// package.json (sketch)
"size-limit": [
  { "name": "App shell (gzip)", "path": ".next/static/chunks/main-*.js", "limit": "180 kB", "gzip": true },
  { "name": "Dashboard route + parse time", "path": ".next/static/chunks/app/dashboard/**/*.js", "limit": "350 ms" },
  { "name": "Charts vendor (echarts/vega)", "path": ".next/static/chunks/*echarts*.js", "limit": "500 kB", "gzip": true },
  { "name": "ML worker bundle", "path": "build/workers/*.js", "limit": "2 mb", "gzip": true }
]
```
Add `@size-limit/preset-app` to devDeps to enable the `ms` time limits. The existing `size` script stays; wire it into `quality`/`ci`.

### Sonda 773★, MIT (`https://github.com/filipsobol/sonda`) — ADD (offline treemap)
Universal bundle visualizer (Vite/Rollup/esbuild/webpack/**Next**/Rspack). Emits a **self-contained interactive HTML report** — no network, opens from disk. It's a richer complement to `@next/bundle-analyzer` (which is webpack-bundle-analyzer): Sonda gives gzip/brotli sizes, dependency attribution ("which import pulled in this 400KB"), and works across your esbuild worker build (`esbuild.workers.mjs`) too, which `@next/bundle-analyzer` does NOT see. Newer/smaller-community than wbA but actively maintained and MIT.

- Keep `@next/bundle-analyzer` (`ANALYZE=true next build`) for the Next webpack graph.
- Add Sonda specifically to analyze the **worker bundles** produced by esbuild — that's where the ONNX/LLM weight is and where your current analyzer is blind.

### Rejected: bundlesize (unmaintained), bundlewatch (PR-status oriented)
`bundlesize` is in maintenance mode — avoid. `bundlewatch` is the community reboot but is built around posting **GitHub PR commit statuses** and comparing against a hosted baseline — weak fit for a local-first desktop app where you don't want CI to phone home. size-limit + Sonda cover this fully offline.

### Statoscope (note)
Powerful webpack stats analyzer, and notably **size-limit already uses Statoscope internally**. No need to add it directly unless you want its validation DSL on raw webpack stats.

---

## 3. Lighthouse / web-vitals — FULLY OFFLINE IS POSSIBLE

The key insight: **Lighthouse needs a browser + a URL, not the internet.** Point it at your own `next start` (or Electron's loaded localhost) and it audits perf, a11y, best-practices, PWA entirely on-device using bundled Chromium.

### @lhci/cli (lighthouse-ci) — 7k★, Apache-2.0 (`https://github.com/GoogleChrome/lighthouse-ci`) — ADD
Run against localhost with **filesystem upload** so nothing leaves the machine:

```js
// lighthouserc.js
module.exports = {
  ci: {
    collect: {
      startServerCommand: 'pnpm run next:start',
      url: ['http://localhost:3000/', 'http://localhost:3000/dashboard/telecom-report/overview'],
      numberOfRuns: 3,
      settings: { preset: 'desktop', throttlingMethod: 'simulate' } // model the medium-end PC
    },
    assert: {
      assertions: {
        'categories:performance': ['warn', { minScore: 0.8 }],
        'categories:accessibility': ['error', { minScore: 0.95 }],
        'total-blocking-time': ['warn', { maxNumericValue: 400 }], // main-thread budget
        'unused-javascript': ['warn', { maxNumericValue: 200000 }]
      }
    },
    upload: { target: 'filesystem', outputDir: './.lighthouseci' } // NO cloud, NO LHCI server
  }
};
```
Script: `"audit:lh": "lhci autorun"`. In Electron you can also drive Lighthouse against the app's own renderer via `--remote-debugging-port=9222` (already enabled in your `electron:start` script).

### Unlighthouse 4.6k★, MIT, active Jun 2026 (`https://github.com/harlan-zw/unlighthouse`) — OPTIONAL
If you want to audit **every** dashboard route at once, unlighthouse crawls the site and runs Lighthouse on all discovered pages in one fast pass (bundled puppeteer Chromium, offline against localhost). Faster + better DX than scripting many lhci URLs; great for a periodic full-app a11y/perf sweep. Use lhci for the **gated** subset, unlighthouse for the **exploratory** full crawl.

### web-vitals 8.5k★, Apache-2.0, ~2KB (`https://github.com/GoogleChrome/web-vitals`) — OPTIONAL (local RUM)
Captures CLS/LCP/INP/TTFB from **real local sessions**. It requires no server — you choose the sink. For an offline desktop app, write metrics to **IndexedDB/OPFS** (you already use Dexie) and surface them in a dev panel. This gives true field data on the actual medium-end machines without any telemetry leaving the device.

```ts
import { onLCP, onINP, onCLS } from 'web-vitals';
const sink = (m) => db.vitals.add({ ...m, ts: Date.now() }); // Dexie/IndexedDB, never network
onLCP(sink); onINP(sink); onCLS(sink);
```

---

## 4. Accessibility — KEEP, axe-core is the standard

### axe-core 7.2k★, MPL-2.0, v4.12.1 Jun 10 2026 (`https://github.com/dequelabs/axe-core`)
Already integrated **twice** the right way: `@axe-core/playwright` (E2E + Storybook routes) and `vitest-axe` (component unit a11y). Both run the axe engine 100% locally with zero network. This is the modern standard — keep it.

**Action items:**
- Gate Storybook a11y: you already have `@storybook/addon-a11y` and `@storybook/test-runner`; enforce `axe` in the test-runner's `postVisit` so every story is checked offline.
- MPL-2.0 note: file-level copyleft applies only if you **modify axe's source**. Using it as a tool/dependency imposes no obligation on your app — fully fine.

### pa11y-ci — REJECTED (for this app)
pa11y wraps axe + HTMLCS but spins up its own Puppeteer Chrome and ignores externally-configured browser/auth context — awkward next to your Playwright setup. axe-core via Playwright already gives you the authoritative WCAG ruleset. Only add pa11y if you specifically need HTMLCS rules that axe lacks (rare).

---

## 5. Profiling & local benchmarking

### Vitest bench / tinybench — MIT — KEEP (`https://github.com/tinylibs/tinybench`)
Your `bench` script already uses `vitest bench`, which wraps **tinybench** (~2KB, statistically rigorous: stddev, margin of error, percentiles). This is the correct offline microbenchmark tool. Target your **hot data paths**: Arquero transforms, DuckDB query shaping, Arrow column ops, `density-clustering`, `simple-statistics`, `ml-matrix`. 

**Action item:** make benchmarks meaningful in CI — either run `bench` as a non-gating artifact, or add a small compare-against-baseline script (write `bench` JSON to a committed baseline and fail on >X% regression). mitata is a fine cross-runtime alternative but is **less actively maintained** — stay on tinybench.

### react-scan 21.4k★, MIT (`https://github.com/aidenybai/react-scan`) — ADD (dev-only)
Automatically highlights components doing **unnecessary re-renders** — exactly the medium-end main-thread killer in your heavy trees: `react-grid-layout` dashboards, `@tanstack/react-table` + `react-virtual`, `echarts-for-react`/`react-vega` charts, `@xyflow/react` graphs.

> **Offline requirement:** install as a **dev dependency** and import it in dev only — do NOT use the documented `//unpkg.com/...` CDN script tag (that would require network). The npm package runs entirely in-browser.

```ts
// only in dev, e.g. a client-side guard
if (process.env.NODE_ENV !== 'production') {
  const { scan } = await import('react-scan');
  scan({ enabled: true, log: true });
}
```
Pair with the bundled, offline **React DevTools Profiler** for flamecharts. For Electron-main / Node profiling, `node --prof` + `--cpu-prof` and Chrome DevTools (`--inspect`) are all local.

---

## 6. WASM build tooling

This app **ships and consumes WASM** (onnxruntime-web, transformers.js, web-llm, VAD, and likely duckdb-wasm-style paths). Two tracks:

### Track A — Optimize WASM you already ship: wasm-opt (Binaryen, Apache-2.0, very active) (`https://github.com/WebAssembly/binaryen`)
For any **first-party or vendored** `.wasm` you control, run `wasm-opt -O3 --enable-simd in.wasm -o out.wasm`. Typical **10-30% size reduction** and faster startup — directly helps cold-load on modest machines. (You cannot usefully re-optimize third-party prebuilt runtimes like ORT without their build, but any WASM you compile yourself should pass through wasm-opt.) There's a pure-JS `binaryen.js` wrapper if you want it in the Node build with no native toolchain.

**SIMD/threads strategy for medium-end + offline:**
- Prefer **WASM-SIMD + multi-threaded CPU** paths with graceful single-thread fallback (WebGPU is often unavailable). onnxruntime-web and transformers.js both expose this — ensure you ship the SIMD/threaded artifacts and feature-detect.
- **Threads need `SharedArrayBuffer`**, which needs **COOP/COEP** headers. In a browser this is friction; in **Electron you can set these headers unconditionally** on the loaded app (or use `webPreferences`), so you get reliable multi-threaded WASM — a genuine advantage of the desktop target. Verify your Next/Electron response headers include `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp` for worker-threaded inference.

### Track B — If you author WASM (e.g. a Rust Arrow/stats kernel): wasm-pack + wasm-opt + bundler plugin
Mature, fully-offline toolchain: `wasm-pack build --target web` (runs wasm-opt automatically), consumed via `vite-plugin-wasm` / `@rollup/plugin-wasm` (or Next's `asyncWebAssembly` experiment). Note: the rustwasm org was sunset July 2025 but the tools (wasm-pack, wasm-bindgen, binaryen) moved to independent orgs and remain maintained and production-ready in 2026. License: Apache-2.0/MIT. Worth it only if profiling shows a hot numeric kernel (clustering, matrix ops) that JS/Arquero can't keep up with on 4-core machines — otherwise DuckDB + Arrow already give you columnar speed and you shouldn't add a Rust build just to have one.

---

## 7. Consolidated recommendation set (medium-end, offline)

| Goal | Use | Status | Net action |
|---|---|---|---|
| Dead code / unused deps | **knip** | have | Add CI gate (`--production --strict`), tune worker whitelist |
| Architecture/circular rules | **dependency-cruiser** | have | Make `no-circular` an error; align with provider checks |
| Bundle size + parse-time budgets | **size-limit + @size-limit/preset-app** | partial | Add time limits + per-route/per-worker budgets |
| Offline bundle treemap (incl. workers) | **Sonda** | ADD | Analyze esbuild worker bundles + Next |
| Offline Lighthouse audit (gated) | **@lhci/cli** | ADD | `lhci autorun` vs localhost, filesystem upload |
| Offline full-site audit (exploratory) | **unlighthouse** | optional | Crawl all dashboard routes |
| Accessibility | **axe-core** (Playwright + Vitest) | have | Gate Storybook a11y via test-runner |
| Microbenchmarks | **Vitest bench / tinybench** | have | Add regression baseline compare |
| React re-render profiling | **react-scan** | ADD | dev-only import (NOT CDN) |
| Shipped-WASM optimization | **wasm-opt (Binaryen)** | ADD | Run on first-party/vendored .wasm; ensure SIMD+threads+COOP/COEP |
| Local RUM | **web-vitals** | optional | Sink to Dexie/IndexedDB |
| Circular-dep graphs (docs) | **madge** | optional | Only for SVG/quick `--circular` |

### Licensing summary (all permissive enough for a shipped app)
MIT: Sonda, unlighthouse, react-scan, madge, tinybench, size-limit, @next/bundle-analyzer. ISC: knip, dependency-cruiser. Apache-2.0: lighthouse-ci, web-vitals, binaryen. MPL-2.0: axe-core (file-level copyleft — only matters if you edit axe's source; using it as-is is unrestricted).

### What NOT to add
- **bundlesize** — unmaintained.
- **bundlewatch** — PR-status/baseline oriented; weak fit for offline desktop.
- **mitata** — stale vs tinybench (which you already have).
- **pa11y-ci** — redundant with axe-via-Playwright; conflicts with your Playwright context.
- Any **hosted** Lighthouse/RUM/perf dashboard (PageSpeed API, Calibre, SpeedCurve, DebugBear cloud, LHCI hosted server) — violates the offline constraint.

### Suggested rollout order
1. Gate **knip** + **depcruise no-circular** in `quality`/`ci` (cheap, immediate cleanup of ~180 deps).
2. Expand **size-limit** to time + per-worker budgets; add **Sonda** to see worker weight.
3. Add **@lhci/cli** offline audit + Storybook **axe** gate.
4. Add **react-scan** (dev) and profile the dashboard/table/chart hot paths.
5. Run **wasm-opt** on any first-party WASM; verify COOP/COEP + SIMD/threaded inference paths.
6. (Optional) **unlighthouse** full sweep, **web-vitals** local RUM, **madge** doc graphs.

All steps are local-only, reversible, dev-dependency additions — no runtime cloud, no telemetry, permissive licenses.