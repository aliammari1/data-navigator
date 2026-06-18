# Implementation Brief — Real statistics, clustering, attribution (stats-ml cluster)

> Cluster: **Real statistics, clustering, attribution.**
> Target: Electron + Next.js 16 desktop app, **fully offline (no runtime network/CDN)**, medium-end PC (4-core, **no WebGPU**, 8 GB). All heavy compute runs in a **Comlink Web Worker** with a **seeded PRNG**.
> Downstream agents: implement directly from this brief. Every version, import path, signature, and offline caveat below was verified against the npm registry / official GitHub READMEs on 2026-06-12. **Do not re-research.**

---

## 0. TL;DR — what actually changed vs. the plan docs (read this first)

The feature plan docs (`deep-analytics.md`, `ai-analysis.md`, etc.) name some packages that are **wrong or out of date**. Corrections, all verified:

| Plan doc said | Reality (verified) | Action |
|---|---|---|
| `ml-dbscan` (npm) | **DOES NOT EXIST on npm.** `https://registry.npmjs.org/ml-dbscan` → **HTTP 404**; `unpkg.com/ml-dbscan` → "Package not found". The `mljs/dbscan` GitHub repo was never published. | **Do NOT `npm i ml-dbscan` — it breaks the build.** Use the already-installed **`density-clustering@1.3.0`** for DBSCAN. |
| `ml-kmeans` "v6" with `kmeans(data,k,{seed})→{clusters,centroids,withinss}` | Latest is **`ml-kmeans@7.0.1`** (ESM-only). Result is `{clusters, centroids, converged, iterations, nearest(), computeInformation()}` — **there is NO `withinss` field.** `seed` only affects `'random'`/`'mostDistant'` init, **NOT the default `'kmeans++'`**. | Adopt `ml-kmeans@7.0.1` **only** with `initialization:'random'` + `seed` if you need its determinism; otherwise **keep the existing in-house seeded k-means** (see §2) which already returns `withinss`. |
| `@stdlib/stats-ttest2` Welch | Correct. `@stdlib/stats-ttest2@0.2.3`, **CommonJS**, Welch by default (`variance:'unequal'`). | Adopt, but note CJS + ~22 transitive deps (§4). An in-house Welch already exists (`deep-analytics/lib/stats.ts`). |
| `ml-matrix` SVD/pseudo-inverse for attribution | Correct and **already installed** (`ml-matrix@6.12.2`, exports `SVD`, `pseudoInverse`, `solve`, `inverse`). | Already wired in `deep-analytics/workers/analytics.worker.ts::attribution`. Reuse it. |

**Already installed (no new install needed):** `ml-matrix@6.12.2`, `simple-statistics@7.9.0`, `density-clustering@1.3.0`, `comlink@4.4.2`, `apache-arrow@21.1.0`, `@uwdata/flechette@2.5.0`.

**Already implemented in the repo (reuse, don't rebuild):**
- `src/features/deep-analytics/workers/analytics.worker.ts` — seeded typed-array **k-means** (`kMeans`, returns `withinss`) + **SVD-pseudo-inverse attribution** (`attribution`). Comlink-exposed.
- `src/features/deep-analytics/lib/ml-client.ts` — `getMLClient()` Comlink singleton.
- `src/features/deep-analytics/lib/stats.ts` — in-house **Welch t-test** (`welchTTest`) with a Student-t p-value via regularized incomplete beta, plus `safeCorrelation`, `significanceFromP`.
- `src/workers/ml.worker.ts` — a second, older Comlink ML worker (`kMeansClustering`, `detectAnomalies`, `computeCorrelationMatrix`, `forecastTimeSeries`, `computePCA`) — **currently imported by nobody.** Consolidate, don't add a third worker.

**Net new packages this brief recommends installing (all verified resolvable on npm, all offline-safe once in `node_modules`):**
- `ml-kmeans@7.0.1` — optional; only if you want the library k-means instead of the in-house one.
- `@stdlib/stats-ttest2@^0.2.3`, `@stdlib/stats-anova1@^0.2.3` — real two-sample t / one-way ANOVA with `print()`-able output.
- `@stdlib/stats-base-dists-t-quantile@^0.2.3` — t critical values for GESD / S-H-ESD anomaly thresholds (the only stdlib piece you strictly need for criticals).

Everything below is medium-PC friendly (pure JS / wasm-free), no WebGPU, no COOP/COEP requirement (these are CPU JS libs — see §6 for the one nuance).

---

## 1. Seeded PRNG (shared, deterministic) — already in repo

Reproducibility is a hard requirement (same dataset + same seed ⇒ same clusters). The repo already has **mulberry32**; reuse it, do not re-roll.

Canonical copy lives in `src/features/deep-analytics/workers/analytics.worker.ts`:

```ts
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

**Action:** if a second worker (e.g. `src/workers/ml.worker.ts`) needs determinism, hoist this into `src/platform/ai/seeded-rng.ts` and import it in both. Default seed `42`. **Never use bare `Math.random()` in any ML kernel** (the old `ml.worker.ts::kMeansClustering` and `ml-engine.ts::tensorKMeans` do — they must be replaced or seeded).

---

## 2. Clustering — k-means

### 2a. PRIMARY: in-house seeded k-means (already implemented, recommended)

Use `kMeans` in `src/features/deep-analytics/workers/analytics.worker.ts`. It is seeded (k-means++ over a seeded `mulberry32`), typed-array based (no GC churn), returns `withinss` for elbow analysis, and is deterministic. **Prefer it over `ml-kmeans`** because `ml-kmeans`'s default `'kmeans++'` is NOT seedable (see 2b).

```ts
// call site (renderer) via the existing Comlink client
import { getMLClient } from "@/features/deep-analytics/lib/ml-client";

const ml = getMLClient();
const { labels, centroids, withinss, totalWithinss, iterations } =
  await ml.kMeans(features /* number[][], finite rows only */, {
    k,                 // number of clusters
    maxIterations: 50, // default 50
    seed: 42,          // deterministic
  });
// Elbow: loop k=2..8, collect totalWithinss, recommend the knee.
```

Signature (verbatim from the worker):
```ts
kMeans(data: number[][], opts: { k: number; maxIterations?: number; seed?: number })
  => Promise<{ labels: number[]; centroids: number[][];
               withinss: number[]; totalWithinss: number; iterations: number }>
```
Pitfalls: caller MUST pre-filter non-finite rows; empty clusters keep their prior centroid (no crash); `k` is clamped to `[1, n]`.

### 2b. OPTIONAL: `ml-kmeans@7.0.1` (library alternative)

Install: `pnpm add ml-kmeans` → resolves `ml-kmeans@7.0.1` + transitive `ml-random@2`, `ml-xsadd@3`, `ml-distance-euclidean@3`, `ml-nearest-vector@3`, `ml-matrix@6` (matches installed). **ESM-only** (`"type":"module"`, `exports: {".":"./lib/index.js"}`).

```ts
import { kmeans } from "ml-kmeans";

const result = kmeans(data /* number[][] */, k, {
  initialization: "random", // MUST be 'random' or 'mostDistant' for `seed` to apply
  seed: 42,                  // ONLY honored by 'random'/'mostDistant', NOT 'kmeans++'
  maxIterations: 100,        // default 100; 0 = run to convergence
  tolerance: 1e-6,           // default
  // distanceFunction: (p, q) => number   // default squaredEuclidean
});
// result.clusters  : number[]   (cluster index per row)
// result.centroids : number[][]
// result.converged : boolean
// result.iterations: number
// result.nearest(points): number[]                 (assign new points)
// result.computeInformation(data): { centroid:number[]; error:number; size:number }[]
```

**Critical pitfalls (verified):**
- **No `withinss`/SSE field.** The plan doc's `withinss` is wrong for this lib. For an elbow metric, sum `computeInformation(data)[i].error * size` per cluster, or just use the in-house k-means which returns `withinss` directly.
- **`'kmeans++'` (the default) is NOT seeded** → non-reproducible. You MUST pass `initialization:'random'` (or `'mostDistant'`) **and** `seed` to get determinism. This is the single biggest gotcha — do not ship the default if reproducibility matters.

### 2c. DBSCAN — use `density-clustering` (NOT `ml-dbscan`)

`ml-dbscan` is **not on npm (404)**. Use the **already-installed** `density-clustering@1.3.0` (also exposes OPTICS + KMEANS). CommonJS.

```ts
import { DBSCAN } from "density-clustering";

const dbscan = new DBSCAN();
// run(dataset, epsilon, minPoints, distanceFn?)
const clusters: number[][] = dbscan.run(data /* number[][] */, /*eps*/ 0.5, /*minPts*/ 5);
// clusters: array of clusters, each an array of ROW INDICES (not labels)
const noise: number[] = dbscan.noise; // row indices flagged as outliers
```

**Pitfalls:** output is **arrays of indices per cluster + a separate `.noise` index array** — NOT a per-row label vector. Convert to labels yourself if the UI needs `label[i]`:
```ts
const labels = new Array(data.length).fill(-1);
clusters.forEach((idxs, c) => idxs.forEach((i) => { labels[i] = c; }));
```
`density-clustering` is dormant (last meaningful release years ago) but tiny, zero-dep, MIT, fully offline, and deterministic (no RNG). It is the correct choice here. `eps` is in raw feature units → **standardize features first** (z-score) so `eps` is meaningful across dimensions.

---

## 3. Attribution — multiple linear regression via `ml-matrix` SVD pseudo-inverse (already implemented)

`ml-matrix@6.12.2` is installed; it exports `Matrix`, `SVD`, `pseudoInverse`, `solve`, `inverse`. The attribution model is **already implemented** in `src/features/deep-analytics/workers/analytics.worker.ts::attribution`: it z-scores X and y, fits β via the SVD pseudo-inverse `β = V Σ⁺ Uᵀ y` (singular values below tolerance dropped → robust to collinear channel-mix columns), and returns `|β|`-normalized shares + R².

```ts
// call site (renderer)
const { shares, coefficients, rSquared } = await ml.attribution(
  X /* number[][]: rows = observations, cols = channel/feature dummies */,
  y /* number[]: revenue (or target) per observation */,
);
// shares: number[]  (standardized |coef| share per feature, sums to 100)
```

Verbatim core of the fit (already in the worker — do not rewrite, just reuse):
```ts
import { Matrix, SVD } from "ml-matrix";
const Xm = new Matrix(zScoredX);
const svd = new SVD(Xm, { autoTranspose: true });
const u = svd.leftSingularVectors, v = svd.rightSingularVectors, s = svd.diagonal;
const tol = (s.length ? Math.max(...s) : 0) * Math.max(n, d) * Number.EPSILON;
const uty = u.transpose().mmul(Matrix.columnVector(yz)).to1DArray();
const scaled = uty.map((val, i) => (s[i]! > tol ? val / s[i]! : 0));
const beta = v.mmul(Matrix.columnVector(scaled)).to1DArray(); // β
```

**Pitfalls:**
- `new SVD(matrix, { autoTranspose: true })` is required when `rows < cols` (wide feature matrices) or it throws. The existing code sets it.
- Standardize X and y **before** the fit so coefficients are comparable = true attribution. Already done (`standardizeColumns`, `standardize1d`).
- `ml-matrix`'s top-level `pseudoInverse(matrix)` / `solve(A, b)` also work, but the **manual SVD path above is version-robust** and explicit about the singular-value tolerance — keep it.

---

## 4. Statistics — `simple-statistics` + `@stdlib/stats-*`

### 4a. `simple-statistics@7.9.0` (installed) — descriptive + base inference

**Fix the namespace import for tree-shaking.** `src/features/ai-analysis/model/stats.ts` and `ForecastScreen.tsx` use `import * as ss from "simple-statistics"` — switch to named imports:

```ts
// before (defeats tree-shaking)
import * as ss from "simple-statistics";
// after
import {
  mean, sampleVariance, sampleStandardDeviation, sampleCorrelation,
  linearRegression, linearRegressionLine, medianAbsoluteDeviation,
  median, quantileSorted, zScore, tTest, tTestTwoSample,
} from "simple-statistics";
```
All of the above are present in 7.9.0 (verified). `tTestTwoSample(a, b)` exists but returns only the **t-statistic** (no p-value/df) → for real p-values use the in-house Welch (`deep-analytics/lib/stats.ts::welchTTest`) or stdlib (§4b).

### 4b. `@stdlib/stats-ttest2` — Welch two-sample t with p-value + CI

Install: `pnpm add @stdlib/stats-ttest2` → `@stdlib/stats-ttest2@0.2.3`. **CommonJS** (`require`, `main: ./lib`). Welch (`variance:'unequal'`) by default.

```ts
const ttest2 = require("@stdlib/stats-ttest2"); // CJS
// or, with esModuleInterop / Next bundler:  import ttest2 from "@stdlib/stats-ttest2";

const out = ttest2(a, b, { alpha: 0.05 /*, alternative:'two-sided', variance:'unequal' */ });
// out.pValue     : number
// out.statistic  : number  (Welch t)
// out.ci         : [number, number]
// out.df         : number  (Satterthwaite)
// out.rejected   : boolean
// out.method     : string
// out.print()    : string  (formatted report)
```

### 4c. `@stdlib/stats-anova1` — one-way ANOVA (for >2 cohorts)

Install: `pnpm add @stdlib/stats-anova1` → `@stdlib/stats-anova1@0.2.3`. CommonJS. Signature is **`anova1(x, factor)`** where `x` is the flat values array and `factor` is the parallel group-label array (NOT a list of groups):

```ts
const anova1 = require("@stdlib/stats-anova1");
const values  = [12, 9, 15, 7, 11, 8, 14, 6 /* ... */];
const factor  = ["A","A","B","B","C","C","A","B" /* same length as values */];
const out = anova1(values, factor, { alpha: 0.05 });
// out.statistic : number  (F)
// out.pValue    : number
// out.treatment : { df, ss, ms }
// out.error     : { df, ss, ms }
// out.means     : { [group]: { mean, sampleSize, SD } }
// out.method    : "One-Way ANOVA"
// out.print()   : string
```

### 4d. `@stdlib/stats-base-dists-t-quantile` — GESD / S-H-ESD critical values

For anomaly detection (Generalized ESD), you need Student-t quantiles. Use the **leaf** package (6 deps, smallest footprint) — NOT the full `@stdlib/stats-base-dists-t` bundle (15 deps).

Install: `pnpm add @stdlib/stats-base-dists-t-quantile` → `@stdlib/stats-base-dists-t-quantile@0.2.3`. CJS.

```ts
const tQuantile = require("@stdlib/stats-base-dists-t-quantile");
// tQuantile(p, df) → t critical value (inverse CDF)
const tcrit = tQuantile(1 - alpha / (2 * (n - i)), n - i - 2); // GESD lambda_i input
```
GESD critical value (Rosner) per iteration i (0-based), sample size n:
```ts
function gesdLambda(i: number, n: number, alpha = 0.05): number {
  const p = 1 - alpha / (2 * (n - i));
  const t = tQuantile(p, n - i - 2);
  return ((n - i - 1) * t) / Math.sqrt((n - i - 2 + t * t) * (n - i));
}
```
(There is no off-the-shelf JS S-H-ESD lib — this ~10-line critical-value helper + an STL/MAD residual is the in-house path the tech-radar brief mandates.)

**Note on simple-statistics alternative:** if you want to avoid adding stdlib at all, `simple-statistics` exposes `cumulativeStdNormalProbability`/`probit` for **normal** criticals and the in-house Student-t CDF already lives in `deep-analytics/lib/stats.ts` (regularized incomplete beta). stdlib is preferred only where you want validated t/F criticals without hand-maintaining special functions.

---

## 5. Where to wire each piece (concrete file map)

| Concern | Worker (compute) | Client/lib (call site) | Feature screens that consume |
|---|---|---|---|
| Seeded k-means + attribution | `src/features/deep-analytics/workers/analytics.worker.ts` (exists) | `src/features/deep-analytics/lib/ml-client.ts` (`getMLClient`, exists) | `deep-analytics` (Cluster + Attribution tabs), `ai-analysis` (patterns tab) |
| DBSCAN (`density-clustering`) | add `dbscanCluster()` to `analytics.worker.ts` and `Comlink.expose` it | extend `getMLClient()` proxy | `deep-analytics` cluster (outlier/noise view), `channel-monitor` anomaly grouping |
| Welch t / ANOVA / Student-t p | in-house `src/features/deep-analytics/lib/stats.ts` (exists); add `@stdlib/stats-ttest2`/`-anova1` if you want `print()` + ANOVA | called from screen `useMemo`/handlers (cheap, can stay on main thread for small N) | `deep-analytics` (Period Comparison, Cohort Analysis), `ai-analysis` |
| Attribution regression (`ml-matrix` SVD) | `analytics.worker.ts::attribution` (exists) | `getMLClient().attribution` | `deep-analytics` Revenue Attribution |
| GESD/S-H-ESD criticals (`t-quantile`) | new `src/platform/ai/stats/anomaly.ts` (worker-imported) | — | `ai-analysis` (anomalies), `channel-monitor` (baseline), `forecast-intelligence` (residual anomalies) |
| Namespace-import cleanup | — | `src/features/ai-analysis/model/stats.ts`, `src/features/forecast-intelligence/screens/ForecastScreen.tsx` | both |
| Dead/duplicate worker | **consolidate** `src/workers/ml.worker.ts` (unused, uses unseeded `Math.random()`) into the deep-analytics worker, or seed it. Don't add a 3rd. | — | — |
| DuckDB feature source (don't materialize in JS) | — | `src/platform/duckdb/duckdb.ts::runReadOnlyQuery` | all four features pull numeric vectors via SQL, then send typed arrays to the worker |
| Active dataset | — | `src/core/stores/data-store.ts::getActiveDataset()` → `{ viewName, rowCount, columns }` | all |

**Shared placement recommendation:** promote the seeded-RNG + GESD helpers into `src/platform/ai/stats/` so `deep-analytics`, `ai-analysis`, `channel-monitor`, and `forecast-intelligence` import one implementation. Keep the heavy ML kernels behind the single Comlink worker; statistics on small arrays (t-test/ANOVA over cohorts) can run synchronously on the main thread.

---

## 6. Offline / self-host requirements (HARD constraint compliance)

**The single most important offline gotcha:** none of these packages fetch anything at runtime — **they are all pure-JS CPU libraries with NO wasm, NO model files, NO tiles/fonts, NO CDN.** There is therefore **nothing to put in `public/` or `models/`** for this cluster. The ONLY way these break offline is at **install time** — so:

- `ml-kmeans@7.0.1` (+ `ml-random`/`ml-xsadd`/`ml-distance-euclidean`/`ml-nearest-vector`/`ml-matrix`), `@stdlib/stats-ttest2`, `@stdlib/stats-anova1`, `@stdlib/stats-base-dists-t-quantile` must be **added to `package.json` and committed to the `pnpm-lock.yaml`** so they are present in `node_modules` and bundled by esbuild/Next at build time. After that, **zero runtime network.** Verified: all resolve HTTP 200 on the npm registry.
- **`ml-dbscan` must NEVER be added** — it 404s on npm and will break `pnpm install` (which, in a network-restricted build, fails the whole offline build). Use `density-clustering` (already a dependency).
- **stdlib packages are CommonJS** and each pulls 6-24 transitive `@stdlib/*` leaf packages. They tree-shake poorly. To keep the renderer bundle lean, **import them inside the Comlink worker** (`esbuild.workers.mjs` bundles workers separately from the Next route chunks) rather than in route components. Add a `size-limit` budget for the worker bundle.
- **No COOP/COEP / cross-origin isolation needed** for this cluster (that requirement is only for wasm-threads in `onnxruntime-web`/Pyodide, which are a *different* cluster). `next.config.ts` currently sets no COOP/COEP headers and does not need to for stats-ml.
- **Worker bundling:** the deep-analytics worker is loaded via `new Worker(new URL("../workers/analytics.worker.ts", import.meta.url), { type: "module" })` (Next/Turbopack handles it). The pre-bundled workers in `esbuild.workers.mjs` (`platform:"browser", format:"esm", target:["es2022"]`) are an alternative path — `ml-kmeans` (ESM) and the CJS stdlib packages both bundle fine under esbuild. If you add a new worker entry, register it there.
- **Determinism = offline reproducibility:** persist `{ seed, k, run results }` to Dexie (already a dep) so a reload reproduces the exact clustering without recompute.

---

## 7. Install commands (one block)

```bash
# Optional library k-means (only if not using the in-house seeded kernel):
pnpm add ml-kmeans                                   # 7.0.1, ESM
# Real hypothesis tests + GESD criticals (CommonJS, import inside the worker):
pnpm add @stdlib/stats-ttest2 @stdlib/stats-anova1 @stdlib/stats-base-dists-t-quantile
# DBSCAN, ml-matrix, simple-statistics, comlink, apache-arrow are ALREADY installed.
# DO NOT run: pnpm add ml-dbscan   (404 on npm — breaks install)
```

---

## 8. Verification checklist for downstream agents

1. `pnpm install` succeeds with the new deps in the lockfile (no `ml-dbscan`).
2. Determinism test (vitest): same `data` + `seed:42` ⇒ identical `labels`/`centroids` across runs — for in-house k-means AND for `ml-kmeans` only when `initialization:'random'`.
3. `ttest2`/`anova1` p-values match a known fixture (e.g. compare `out.print()` to a hand-computed example).
4. `attribution` shares sum to ~100 and R² ∈ [0,1] on a fixture with a known dominant feature.
5. DBSCAN: `.noise` indices are excluded from clusters; converting to a label vector yields `-1` for noise.
6. `react-scan`/`size-limit`: stdlib lives in the worker chunk, not the route chunk.
7. Network-off smoke test: with the machine offline, the cluster/attribution/stat flows still run (they will — no runtime fetch).
