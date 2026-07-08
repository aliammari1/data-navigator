# Tech Radar Brief — Offline-first statistics, forecasting & ML for data-navigator (JS/WASM, medium-end PC)

## Key findings

- simple-statistics (3.5k stars, ISC, released v7.9.0 June 2026) is the safest core dependency for descriptive stats, regression, and basic inference (t-test, sign test, correlation). Pair it with stdlib-js for distributions/p-values it lacks. jStat (1.8k stars) is RICHER in distributions and hypothesis tests but Snyk flags it as INACTIVE (no npm release in 12+ months) - vendor only the functions you need or prefer stdlib-js.
- The popular `arima` npm package (zemlyansky, WASM port of ctsa) is effectively STALE: ~100 stars, last release v0.2.4 in Nov 2021, single maintainer. It still works and is the only drop-in WASM AutoARIMA/SARIMA/SARIMAX in JS, but treat it as frozen/vendored with a `.destroy()` memory-management discipline. There is NO actively-maintained pure-JS ARIMA equivalent - the real modern alternatives are Rust->WASM (anofox-forecast) or Pyodide+statsmodels.
- For robust offline forecasting on a medium PC, the strongest path is a TIERED strategy: (1) hand-roll Holt-Winters / EWMA / simple exponential smoothing in ~150 lines of TS in a web worker (no dep, deterministic, tiny); (2) use vendored `arima` WASM in a worker for ARIMA/SARIMA when users need it; (3) reserve Pyodide+statsmodels/Prophet (~10-25MB download, cached in OPFS/IndexedDB once) as an OPT-IN 'advanced' mode only - do not put it on the hot path of a medium-end machine.
- onnxruntime is the clear winner for tabular ML inference (XGBoost/LightGBM/sklearn -> ONNX-ML). In Electron, prefer `onnxruntime-node` (native CPU, no 20MB wasm, full op coverage) in the main/utility process; use `onnxruntime-web` only for the pure-browser fallback. Default WASM build is ~20MB but a custom/minimal ORT-format build drops it to ~3-8MB. WebGPU is often unavailable on the target hardware - rely on wasm-simd + multi-threaded (cross-origin isolation required for threads).
- Clustering: mljs ecosystem (ml-kmeans, ml-dbscan, ml-matrix, ml-hclust under github.com/mljs, MIT, actively maintained) is the recommended stack over `density-clustering` (uhho, 229 stars, MIT but dormant). ml-matrix is the load-bearing dependency and is well maintained. For DBSCAN specifically, ml-dbscan is the maintained choice.
- Anomaly detection & change-point detection have NO mature, well-starred JS libraries - this is a genuine gap. S-H-ESD, MAD, EWMA, CUSUM, and PELT must be implemented in-house (they are small, well-specified algorithms). Build them on top of an STL decomposition (port `stlnode` or implement Loess-based STL) plus simple-statistics/stdlib for the GESD critical values. Budget engineering time here rather than a dependency.
- Recommended offline-first dependency set: simple-statistics + @stdlib/stats (core stats/tests), ml-matrix + ml-kmeans + ml-dbscan + ml-hclust (clustering/linear algebra), onnxruntime-node (Electron tabular inference) with onnxruntime-web/wasm fallback, vendored `arima` WASM (forecasting, worker-isolated), and in-house TS modules for Holt-Winters/EWMA/STL/MAD/S-H-ESD/CUSUM/PELT. Pyodide+statsmodels as optional advanced tier. All run with zero network at runtime; ONNX/Pyodide assets are bundled or cached-once in OPFS/IndexedDB.

## Dependencies evaluated

| Package | Stars | Maintenance | License | Offline | Role / replaces | URL |
|---|---|---|---|---|---|---|
| `simple-statistics` | 3.5k | Active - v7.9.0 released June 4 2026, regular releases | ISC | yes | Core descriptive/regression/inference stats: mean/variance/quantiles, linear regression, t-test (one/two-sample), sign test, correlation, z-score. First-choice base stats lib. | https://github.com/simple-statistics/simple-statistics |
| `@stdlib/stats (stdlib-js)` | 5.8k (monorepo) | Active - monorepo updated May 2026, large multi-contributor project | Apache-2.0 | yes | Rigorous probability distributions (pdf/cdf/quantile), p-values, ANOVA, Kruskal-Wallis, GESD-supporting critical values. Fills simple-statistics' hypothesis-test gaps without jStat's staleness. | https://github.com/stdlib-js/stats |
| `jstat` | 1.8k | STALE - Snyk: Inactive, no npm release in 12+ months, single org | MIT | yes | Rich distributions + many hypothesis tests (t, F, chi-square, ANOVA, Tukey). Use ONLY by vendoring needed functions; prefer stdlib-js for new code due to maintenance risk. | https://github.com/jstat/jstat |
| `arima (zemlyansky)` | ~100 | STALE - last release v0.2.4 Nov 2021, single maintainer, open issues | Apache-2.0 (verify in repo) | yes | Only drop-in JS ARIMA/SARIMA/SARIMAX/AutoARIMA. Vendor + pin it, isolate in a web worker, always call .destroy() to free WASM memory. Treat as frozen. | https://github.com/zemlyansky/arima |
| `onnxruntime-node` | 18k+ (microsoft/onnxruntime) | Active - Microsoft, frequent releases | MIT | yes | Primary tabular ML inference in Electron main/utility process: XGBoost/LightGBM/sklearn exported to ONNX-ML. Runs fully offline once model file is bundled. | https://github.com/microsoft/onnxruntime |
| `onnxruntime-web` | 18k+ (microsoft/onnxruntime) | Active - Microsoft | MIT | yes | Browser-side fallback for tabular/onnx inference when not in Electron node process. Prefer custom/minimal build to cut bundle. | https://www.npmjs.com/package/onnxruntime-web |
| `ml-matrix (mljs)` | 1.3k+ (org-wide, mljs) | Active - mljs org maintained through 2025/2026 | MIT | yes | Load-bearing linear algebra: matrix ops, SVD/QR/EVD, used by PCA/regression/clustering. Foundation for the mljs stack. | https://github.com/mljs/matrix |
| `ml-kmeans (mljs)` | part of mljs org | Active - mljs org | MIT | yes | K-means clustering with KMeansResult (clusters, centroids, convergence, iterations). Preferred over density-clustering's kmeans. | https://github.com/mljs/kmeans |
| `ml-dbscan (mljs)` | part of mljs org | Active - mljs org | MIT | yes | Maintained DBSCAN density clustering. Recommended over uhho/density-clustering for new code. | https://github.com/mljs/ml |
| `density-clustering (uhho)` | 229 | Dormant - 27 commits, minimal recent activity | MIT | yes | DBSCAN + OPTICS + KMEANS in one tiny zero-dep package. Fine if you want OPTICS (mljs lacks it) and accept low maintenance; otherwise use mljs. | https://github.com/uhho/density-clustering |
| `stlnode` | low/niche | Niche - minimal docs | MIT (verify) | yes | Seasonal-Trend decomposition by Loess (STL) in pure JS - basis for S-H-ESD anomaly detection. Vendor + add tests; or reimplement STL in-house for control. | https://www.npmjs.com/package/stlnode |
| `danfojs` | ~5k | Active - v1.2.0 April 2025, issues active into late 2025 | MIT | partial | Pandas-like DataFrames + TF.js tensors. Optional convenience for data wrangling; weigh bundle/memory cost. Prefer Arrow/DuckDB-WASM (already in this app) for columnar data. | https://github.com/javascriptdata/danfojs |
| `Pyodide (+ statsmodels / Prophet / scikit-learn)` | 13k+ (pyodide) | Active - v0.29.x, strong community | MPL-2.0 (Pyodide); statsmodels BSD; Prophet MIT | partial | Opt-in ADVANCED tier: real statsmodels SARIMAX/STL/ETS and Prophet, fully offline after first cache. Run in a worker; NOT for the hot path on medium-end hardware. | https://github.com/pyodide/pyodide |
| `anofox-forecast (Rust/WASM)` | niche (crates.io) | Emerging - active Rust crate, multiple versions; WASM-capable | check repo (Rust crate) | yes | TRENDING watch item: AutoETS/AutoARIMA-style forecasting compiled to WASM, Arrow-native. Promising modern replacement for the stale `arima` lib once JS bindings mature. Not yet a turnkey npm dep - evaluate before adopting. | https://github.com/sipemu/anofox-regression |

## Brief

# Offline-First Statistics, Forecasting & ML Tech-Radar Brief — data-navigator

**Context:** Next.js 16 + Electron desktop app. All processing on-device. No cloud, no SaaS, no telemetry. Target hardware: 4–8 CPU cores, 8–16 GB RAM, integrated/modest GPU, **WebGPU often absent**. Optimize for small bundles, low main-thread work, web workers, and columnar/Arrow data (the app already ships DuckDB-WASM and Arrow per the repo).

This brief covers six capability areas: (1) hypothesis tests / core stats, (2) ARIMA/SARIMA/Holt-Winters/Prophet-like forecasting, (3) STL decomposition, (4) anomaly detection (S-H-ESD/EWMA/MAD), (5) clustering (DBSCAN/k-means/hierarchical) + linear algebra, (6) ONNX tabular inference. Plus change-point detection. Each recommendation respects the offline + medium-PC + maturity constraints.

---

## TL;DR Recommendation Set

| Capability | Primary pick | Why | Fallback / notes |
|---|---|---|---|
| Descriptive + regression + basic inference | **simple-statistics** (ISC, 3.5k★, active) | Zero-dep, tree-shakeable, released June 2026 | — |
| Distributions, p-values, ANOVA, Kruskal-Wallis | **@stdlib/stats** sub-packages (Apache-2.0, active) | Modular, rigorous, avoids jStat staleness | jStat only by vendoring |
| Linear algebra (SVD/QR/EVD) | **ml-matrix** (MIT, mljs, active) | Load-bearing for PCA/regression/clustering | — |
| K-means / DBSCAN / hierarchical | **ml-kmeans / ml-dbscan / ml-hclust** (MIT, mljs) | Maintained, consistent API | density-clustering for OPTICS |
| ARIMA / SARIMA / SARIMAX | **arima (zemlyansky)** — *vendored & frozen* | Only JS WASM AutoARIMA; but stale | Pyodide+statsmodels (advanced tier) |
| Holt-Winters / EWMA / simple smoothing | **In-house TS** (~150 LOC in a worker) | Deterministic, tiny, no stale dep | — |
| STL decomposition | **stlnode (vendored)** or in-house Loess STL | Basis for S-H-ESD | Pyodide STL (advanced) |
| Anomaly detection (S-H-ESD/MAD/EWMA) | **In-house** on top of STL + stdlib | No mature JS lib exists | — |
| Change-point (CUSUM/PELT/BinSeg) | **In-house** | No mature JS lib exists | — |
| Tabular ML inference (XGBoost/LightGBM/sklearn) | **onnxruntime-node** in Electron (MIT, Microsoft) | Native CPU, no 20MB wasm, full op coverage | onnxruntime-web/wasm in browser |
| Heavy stats/Prophet (opt-in) | **Pyodide + statsmodels/Prophet** | Real SARIMAX/ETS/Prophet, offline after cache | Worker-only, advanced mode |

**Guiding principle:** the JS ecosystem is mature for *core statistics, linear algebra, clustering, and ONNX inference*, but **thin for forecasting and essentially empty for anomaly/change-point detection**. Spend dependency budget on the former; spend engineering budget (small, well-specified algorithms) on the latter.

---

## 1. Hypothesis tests & core statistics

### simple-statistics — RECOMMENDED CORE
- **3.5k★, ISC, v7.9.0 (June 4 2026), zero deps, ~30–40KB, tree-shakeable.** Actively released.
- Provides: mean/median/variance/stddev/quantiles, linear regression + r², sample correlation, **t-test (one- and two-sample)**, sign test, z-score, mode, IQR.
- Excellent default: works identically in Electron node and the renderer, no network, trivially tree-shaken.
- **Gap:** limited distribution functions and a narrow hypothesis-test catalog (no F-test/chi-square/ANOVA/Tukey out of the box).

### @stdlib/stats — RECOMMENDED COMPANION
- Part of stdlib (5.8k★ monorepo, **Apache-2.0**, updated May 2026, many contributors). Install only the leaf packages you need:
  - `@stdlib/stats-ttest`, `@stdlib/stats-anova1`, `@stdlib/stats-kruskal-test`, `@stdlib/stats-base-dists-*` (normal/t/f/chi-square pdf/cdf/quantile).
- This is the modern, maintained way to get **p-values and critical values** (including the GESD critical values you need for S-H-ESD) without taking on jStat's maintenance risk. Each sub-package is tiny and offline.

### jStat — USE WITH CAUTION (vendor only)
- **1.8k★, MIT, but Snyk classifies it as INACTIVE** (no npm release in 12+ months). Richer distribution + test catalog (t, F, chi-square, ANOVA, Tukey HSD) than simple-statistics.
- Recommendation: **do not add as a live dependency.** If you need a specific jStat function (e.g., its `jStat.anovaftest`), vendor that single function into `src/core/stats/` with a test, or replace it with `@stdlib/stats-*`. Avoid coupling the app to a discontinued package.

**Verdict:** `simple-statistics` + targeted `@stdlib/stats-*` packages cover essentially all hypothesis-testing needs (t-test, ANOVA, Kruskal-Wallis, chi-square, correlation, regression) with active maintenance and permissive licenses.

---

## 2. Forecasting: ARIMA/SARIMA, Holt-Winters, Prophet-like

This is the **weakest area of the JS ecosystem.** Be deliberate.

### `arima` (zemlyansky) — the only drop-in, but FROZEN
- **~100★, last release v0.2.4 Nov 2021, single maintainer, Apache-2.0 (verify in repo).** Emscripten/WASM port of the C `ctsa` library.
- Capabilities: **ARIMA, SARIMA, SARIMAX, AutoARIMA**, L-BFGS optimization. This is genuinely useful and the *only* turnkey JS option for seasonal ARIMA.
- Risks: stale, WASM memory must be freed (`.destroy()`), Chrome async-compile requirement for >4KB wasm (so run it in a worker), no TypeScript types.
- **Recommendation:** if ARIMA is a real user requirement, **vendor and pin it**, wrap it in a typed worker module, and add regression tests that lock its output. Treat upstream as dead. Do not block the app's roadmap on upstream fixes.

```ts
// src/workers/arima.worker.ts  (vendored 'arima' isolated + memory-safe)
import ARIMA from "@/vendor/arima";            // pinned copy
self.onmessage = (e: MessageEvent<{ y: number[]; opts: any; steps: number }>) => {
  const { y, opts, steps } = e.data;
  const model = new ARIMA({ p: 2, d: 1, q: 2, P: 0, D: 0, Q: 0, s: 0, verbose: false, ...opts });
  model.train(y);
  const [pred, errors] = model.predict(steps);
  // CRITICAL on medium-end PC: free WASM heap or you leak across runs
  model.destroy?.();
  (self as any).postMessage({ pred, errors });
};
```

### Holt-Winters / EWMA / simple exponential smoothing — IMPLEMENT IN-HOUSE
- These are small, fully-specified recurrences. A pure-TS implementation is ~150 lines, deterministic, zero-dependency, trivially worker-able, and avoids a stale lib entirely. **Strongly recommended over any npm smoothing package.**

```ts
// Triple exponential smoothing (additive Holt-Winters). m = season length.
export function holtWinters(y: number[], m: number, a: number, b: number, g: number, h: number) {
  const season = y.slice(0, m);
  const seasonalAvg = season.reduce((s, v) => s + v, 0) / m;
  let level = seasonalAvg;
  let trend = (y.slice(m, 2 * m).reduce((s, v) => s + v, 0) / m - seasonalAvg) / m;
  const S = season.map(v => v - seasonalAvg);     // additive seasonal init
  const fitted: number[] = [];
  for (let t = 0; t < y.length; t++) {
    const s = S[t % m];
    const prevLevel = level;
    level = a * (y[t] - s) + (1 - a) * (prevLevel + trend);
    trend = b * (level - prevLevel) + (1 - b) * trend;
    S[t % m] = g * (y[t] - level) + (1 - g) * s;
    fitted.push(prevLevel + trend + s);
  }
  const fc: number[] = [];
  for (let k = 1; k <= h; k++) fc.push(level + k * trend + S[(y.length + k - 1) % m]);
  return { fitted, forecast: fc, level, trend };
}
```

### Prophet-like / SARIMAX-grade — Pyodide as an OPT-IN ADVANCED TIER
- **Pyodide (13k★, MPL-2.0, active v0.29.x)** runs CPython + numpy/pandas/**statsmodels**/scikit-learn (and Prophet) in WASM. Fully offline **after the first download** if you cache the wheels in **OPFS/IndexedDB** (or bundle them with the Electron app and point `indexURL` at a local path).
- Reality check for a medium-end PC: Pyodide core is ~6–10MB and the scientific wheels push the cached payload to **15–30MB**, plus multi-second cold start and significant RAM. **Do not put this on the default forecasting path.** Expose it behind an explicit "Advanced statistical models (statsmodels/Prophet)" toggle, run it in a dedicated worker, and show a one-time "downloading models" state.
- In Electron specifically, you can ship the wheels on disk so there is literally zero network at any time.

### `anofox-forecast` (Rust → WASM) — TRENDING WATCH ITEM
- An emerging Rust forecasting crate (AutoETS/AutoARIMA-style, Arrow/Parquet-native, explicitly "WASM in the browser"). Conceptually the right modern replacement for the stale `arima` lib and a great fit for this app's Arrow pipeline.
- **Not yet a turnkey npm package with stable JS bindings.** Track it; do not depend on it for production until bindings + docs mature. (Nixtla's `statsforecast` is Python-only and only reachable here via Pyodide.)

**Forecasting verdict (tiered):**
1. **Default:** in-house Holt-Winters / EWMA / SES in a worker — zero dep, fast, deterministic.
2. **ARIMA/SARIMA when needed:** vendored `arima` WASM, worker-isolated, `.destroy()` discipline.
3. **Advanced (opt-in):** Pyodide + statsmodels/Prophet, cached-once in OPFS, never on the hot path.

---

## 3. STL decomposition

- **stlnode** (npm) provides Seasonal-Trend decomposition by Loess in pure JS. Niche, thin docs, but small and offline. **Vendor it with tests**, or implement Loess-based STL in-house (it underpins both seasonal forecasting diagnostics and S-H-ESD anomaly detection, so owning it is reasonable).
- Higher-fidelity STL (matching statsmodels) is only realistically available via **Pyodide** (advanced tier).
- Recommendation: ship a small, tested in-house/vendored STL for the default path; defer to Pyodide STL only in advanced mode.

---

## 4. Anomaly detection (S-H-ESD, EWMA, MAD) — BUILD IN-HOUSE

**Finding: there is no mature, well-starred JS library for time-series anomaly detection.** Twitter's S-H-ESD lives in R; the good ports are Python. This is a genuine gap — but the algorithms are small and well-specified, so implement them:

- **MAD (Median Absolute Deviation):** trivial; robust outlier score = `0.6745·|x − median| / MAD`.
- **EWMA control chart:** one-line recurrence + control limits from the smoothing factor.
- **S-H-ESD:** STL-decompose (section 3) → take the residual → apply Generalized ESD using MAD (the "hybrid" robustifier) with **GESD critical values from `@stdlib/stats-base-dists-t` (Student-t quantiles)**. ~120 lines total.

```ts
export function mad(x: number[]) {
  const med = median(x);
  const dev = x.map(v => Math.abs(v - med));
  return { med, mad: median(dev) };
}
export function madScores(x: number[]) {
  const { med, mad: m } = mad(x);
  const s = m || 1e-9;
  return x.map(v => (0.6745 * (v - med)) / s);   // |z| > 3.5 ⇒ candidate anomaly
}
// S-H-ESD: stl(x).remainder -> generalizedESD(remainder, alpha, maxAnoms) using t-quantiles
```

This keeps the bundle tiny, runs in a worker, and has no stale-dependency risk. Lock behavior with golden-output tests against a known R/Python reference series.

---

## 5. Clustering & linear algebra

### mljs ecosystem — RECOMMENDED
- `github.com/mljs` org, **MIT, actively maintained through 2025/2026.** Consistent API, browser + node, offline.
  - **ml-matrix** (1.3k★-class, the load-bearing dep): matrix ops, SVD/QR/eigen — used by PCA, regression, and clustering. Well maintained.
  - **ml-kmeans**: returns `{ clusters, centroids, converged, iterations }`.
  - **ml-dbscan**: maintained DBSCAN (preferred for density clustering).
  - **ml-hclust**: agglomerative hierarchical clustering.
  - Also available: PCA, KNN, naive Bayes, PLS, cross-validation, confusion matrix.

```ts
import { kmeans } from "ml-kmeans";
import DBSCAN from "ml-dbscan";
const km = kmeans(points, k, { initialization: "kmeans++", maxIterations: 100 });
const labels = new DBSCAN().run(points, /*epsilon*/ 0.5, /*minPts*/ 5);
```

### density-clustering (uhho) — only if you need OPTICS
- **229★, MIT, dormant** (27 commits). Bundles DBSCAN + **OPTICS** + KMEANS in one tiny zero-dep file. mljs has no OPTICS, so if variable-density OPTICS matters, this is the pragmatic pick — accept the low maintenance and pin it.

**Verdict:** standardize on **mljs (ml-matrix + ml-kmeans + ml-dbscan + ml-hclust)**; reach for density-clustering only for OPTICS.

---

## 6. ONNX tabular model inference

ONNX Runtime is the unambiguous winner for running **XGBoost / LightGBM / scikit-learn** models offline (export to **ONNX-ML** via skl2onnx/onnxmltools). MIT, Microsoft-maintained, frequent releases.

### In Electron → `onnxruntime-node` (RECOMMENDED)
- Native CPU binding in the **main/utility process**: full ONNX-ML operator coverage, **no 20MB wasm payload**, multi-threaded, and trivially offline once the `.onnx` file is bundled. This is the right default for a desktop app.

### In the browser (renderer-only fallback) → `onnxruntime-web`
- Bundle reality: default wasm is **~20MB**; `MinSizeRel` ≈ 8MB; a **minimal ORT-format custom build ≈ 3MB** (ORT-format models only, some ops fall back to CPU).
- Use the **`onnxruntime-web/wasm`** entrypoint (conditional import) to avoid pulling WebGPU/WebNN code you won't use.
- **WebGPU is often unavailable on the target hardware** — rely on **wasm-SIMD + multi-threading**. Threads require **cross-origin isolation** (`COOP`/`COEP` headers, or Electron's equivalent). For tabular tree-ensembles the CPU/wasm path is plenty fast; WebGPU buys little here.

```ts
import * as ort from "onnxruntime-web/wasm";   // skip webgpu bundle
ort.env.wasm.numThreads = Math.min(4, navigator.hardwareConcurrency ?? 4);
ort.env.wasm.simd = true;
const session = await ort.InferenceSession.create("/models/tabular/model.onnx");
const out = await session.run({ input: new ort.Tensor("float32", feats, [1, nFeat]) });
```

**Strategy:** detect environment — use `onnxruntime-node` when running under Electron's node side (best perf, smallest renderer bundle), and lazy-load `onnxruntime-web/wasm` (custom minimal build) only for pure-browser execution. Ship the model files inside the app; never fetch them at runtime.

---

## 7. Change-point detection (CUSUM, PELT, Binary Segmentation) — BUILD IN-HOUSE

**Finding: no mature JS library.** The good implementations are Python (`ruptures`), R (`changepoint`), Julia. The algorithms are well-documented:
- **CUSUM** — cumulative deviation from target mean; best for small sustained shifts. ~30 LOC.
- **Binary Segmentation** — recursive single-best split; simple greedy. ~60 LOC.
- **PELT** — exact, near-linear via DP + pruning; the modern default for unknown number of changepoints. ~120 LOC with a cost function (mean/variance/normal-likelihood).

Implement these in-house on top of `simple-statistics`/`@stdlib/stats` cost functions, run them in a worker, and validate against `ruptures` reference outputs. If you ever need heavy multivariate change-point detection, defer to Pyodide+`ruptures` in the advanced tier.

---

## DataFrame / wrangling note (danfojs)

- **danfojs** (~5k★, MIT, v1.2.0 April 2025, active) gives Pandas-like DataFrames and TF.js tensor interop. But it **bundles TensorFlow.js + SheetJS** → large bundle and meaningful memory on a medium PC.
- **Recommendation: do not adopt danfojs for wrangling.** This app already has **DuckDB-WASM + Arrow**, which is faster, columnar, OPFS-friendly, and far lighter. Keep tabular transforms in DuckDB/Arrow and pass typed arrays to the stats/ML layer.

---

## Architecture & performance guidance (medium-end PC)

1. **Everything heavy runs in web workers** (forecasting, clustering, anomaly/change-point, ONNX-web). Keep the main thread for UI; the repo already has a worker pattern (VAD worker) to follow.
2. **Columnar end-to-end:** pull data with DuckDB-WASM → Arrow → typed `Float64Array`/`Float32Array` into algorithms. Avoid object-array overhead and avoid danfojs.
3. **WASM memory hygiene:** the `arima` and ONNX wasm paths allocate heap — call `.destroy()` / release sessions; reuse sessions across runs.
4. **Bundle discipline:** conditional-import `onnxruntime-web/wasm`; tree-shake simple-statistics and stdlib leaf packages; lazy-load Pyodide only when the advanced toggle is used.
5. **WebGPU is optional, not assumed:** wasm-SIMD + threads (with cross-origin isolation) is the baseline; degrade to single-thread wasm where isolation isn't available.
6. **Offline asset strategy:** bundle ONNX models and (if used) Pyodide wheels on disk in the Electron build, or cache-once in **OPFS/IndexedDB** for the browser context. Zero runtime network calls anywhere.
7. **Vendoring policy:** for stale-but-useful libs (`arima`, `stlnode`, any cherry-picked jStat function), copy into `src/vendor/` or `src/core/stats/`, pin, type, and lock with regression tests so upstream death never breaks the app.

---

## Honest gaps & risks

- **Forecasting depth:** native-JS SARIMAX/ETS/Prophet quality is only reachable via Pyodide (heavy) or the still-immature Rust/WASM `anofox-forecast`. The default JS path tops out at vendored `arima` + in-house Holt-Winters. Set product expectations accordingly.
- **Anomaly & change-point:** no off-the-shelf JS dependency meets the maturity bar — these are **engineering tasks, not dependency choices.** Budget ~1–2 weeks to implement + test MAD/EWMA/S-H-ESD/CUSUM/PELT against Python references.
- **jStat / arima / density-clustering staleness:** all three are useful but not actively maintained; only adopt via vendoring with tests, never as live evolving deps.
- **onnxruntime-web bundle:** the 20MB default is unacceptable for a medium PC renderer — a custom minimal build (or `onnxruntime-node` in Electron) is mandatory, not optional.

---

## Concrete adoption plan

1. Add `simple-statistics` + targeted `@stdlib/stats-*` packages → core stats/tests. (low risk, immediate)
2. Add `ml-matrix`, `ml-kmeans`, `ml-dbscan`, `ml-hclust` → clustering/linear algebra. (low risk)
3. Add `onnxruntime-node` for Electron tabular inference; lazy `onnxruntime-web/wasm` (custom minimal build) for browser fallback. (medium effort: build config + COOP/COEP)
4. Vendor `arima` + `stlnode`; build worker wrappers with `.destroy()` and golden tests. (medium effort)
5. Implement in-house Holt-Winters/EWMA/SES, MAD/EWMA/S-H-ESD, CUSUM/PELT/BinSeg in `src/core/stats/` with reference-validated tests. (the real engineering investment)
6. Gate Pyodide+statsmodels/Prophet behind an explicit advanced toggle, assets cached in OPFS / bundled on disk. (optional tier)
7. Track `anofox-forecast` (Rust/WASM) and Nixtla as future replacements for the stale `arima` lib.