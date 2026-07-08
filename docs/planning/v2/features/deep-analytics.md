# Feature Plan — deep-analytics

**Maturity:** partial

## Performance issues

- K-means runs on the React main thread via `tensorKMeans` imported directly from `ml-engine.ts` (DeepAnalyticsScreen.tsx:31,97), even though a Comlink `ml.worker.ts` with `kMeansClustering` already exists and is imported NOWHERE — the whole worker is dead code. A 400-row/k=8/50-iter run blocks paint; on real 100k+ row datasets it would freeze the UI for seconds.
- k-means++ init in ml-engine.ts allocates O(n*k) distance arrays every iteration with `.map`/`.filter`/`.reduce` closures (lines 226-275) instead of typed arrays; centroid recompute does a full `normalised.filter` per cluster per dim (O(n*k*dims) garbage). No SIMD, no early-stop on empty clusters, no multiple restarts for stability.
- All four tabs operate on `Math.random()`-generated in-module constants (TRANSACTIONS = generateSampleTransactions(400) at module scope, SAMPLE_PERIODS, AUTO_COHORTS, COHORT_BASE). `generateWeeklyRates` re-runs `Math.random()` inside a `useMemo` keyed on `cohorts`, so every cohort add/remove silently re-rolls ALL cohort numbers — non-deterministic, unmemoizable, and never touches DuckDB.
- ECharts options are rebuilt as fresh object literals on every render; `echarts-for-react` deep-diffs and re-renders the whole canvas. No `notMerge`/`lazyUpdate`, no shared instance, no OffscreenCanvas. 5 ReactECharts instances mount per tab with heavy inline option objects.
- The `tTest` (DeepAnalyticsScreen.tsx:359) and `significanceLabel` (CohortAnalysis.tsx:122) are FAKE statistics — they bucket a t-like ratio into hard-coded p-values (0.04/0.08/0.15) and label significance by raw percentage-point gap. No real distribution, no df, no CI. simple-statistics is loaded but its proper tests are unused.
- Revenue attribution percentages (ATTRIBUTION_FACTORS) and the waterfall are hard-coded constants; `runAnalysis` is a `setTimeout(1200)` fake spinner. No correlation/regression is actually computed despite the description claiming 'correlation analysis'. ml-matrix is a dependency but never imported anywhere in the feature.
- No virtualization on the weekly-rate table / comparison matrix / discrepancy table; fine at 5-8 rows today but the design assumes growth to real channel counts (hundreds), where full DOM tables + per-cell `cn()` recompute will jank.
- Heavy libs (echarts-for-react + full echarts) are statically imported into every tab; no per-tab `next/dynamic` code-split, so the whole charts payload loads even if the user only opens the Cohort tab.

## Offline gaps

- No actual offline gap in the sense of network calls — but the inverse problem: the feature is 100% synthetic and never reads the user's offline DuckDB data. ReconciliationWizard step 2 literally claims 'Auto-populated from current DuckDB dataset' (line 303) while rendering `ACTUAL_DEFAULT` constants. This is a correctness/trust gap, not a connectivity gap.
- 'AI-generated hypotheses' in ReconciliationWizard (HYPOTHESIS_MAP + `setTimeout(1400)`) are a hard-coded lookup table pretending to be an LLM. The project already ships an offline LLM lane (@mlc-ai/web-llm present, llm.worker.ts) and embeddings, none of which are wired here.
- k-means results are not persisted; re-running re-randomizes centroids (no seeded RNG), so the same dataset yields different clusters each click — no reproducibility, no caching to IndexedDB/OPFS. Analytics runs are ephemeral.
- No model/threshold persistence: chosen k, selected periods, custom cohorts, reconciliation reason-codes/escalations all live in component `useState` and vanish on navigation — nothing written to Dexie/Zustand-persist despite the app having those stores.
- Feature-importance / anomaly / forecast functions in ml-engine.ts and the richer ml.worker.ts (PCA, correlation matrix) are implemented but unreferenced by deep-analytics — real offline ML capability exists but is unused.

## Recommended dependencies

| Package | Category | Stars | Maint. | License | Offline | Replaces | Why | URL |
|---|---|---|---|---|---|---|---|---|
| `ml-kmeans` | clustering | ~96 (repo mljs/kmeans); part of mljs/ml ~1.3k | Active — v7.0.0 published ~Dec 2025, maintained by Zakodium | MIT | yes | hand-rolled tensorKMeans | Replace the hand-rolled k-means in ml-engine.ts with a maintained k-means++ that returns centroids, withinss, and per-iteration convergence. Pairs with ml-matrix already installed. Small, zero network. | https://github.com/mljs/kmeans |
| `ml-dbscan` | clustering | mljs/ml org ~1.3k | Active (Zakodium, mljs) | MIT | yes | fixed-k-only clustering | Density-based clustering for the transaction scatter where k is unknown and clusters are non-spherical; gives a 'noise/outlier' label the current fixed-k k-means cannot. Run in the existing ml.worker. | https://github.com/mljs/ml |
| `@stdlib/stats (modular packages)` | statistics | ~5.8k (stdlib-js/stdlib) | Very active, multi-maintainer | Apache-2.0 | yes | fake tTest / significanceLabel | Real hypothesis tests with correct distributions: import only @stdlib/stats-ttest2 (Welch two-sample t), @stdlib/stats-anova1 (one-way ANOVA for >2 cohorts), and stats-base-dists for p-values/CIs. Replaces the fake bucketed p-values in tTest/significanceLabel. Tree-shakeable single-function packages keep bundle tiny. | https://github.com/stdlib-js/stats |
| `ml-matrix` | linear-algebra | ~1.3k | Active (mljs) | MIT | yes | hard-coded attribution constants | Already installed but UNUSED in this feature. Use it for the real revenue-attribution model: multiple linear regression (XᵀX)⁻¹Xᵀy via SVD/pseudo-inverse to get standardized coefficients = true attribution, replacing hard-coded ATTRIBUTION_FACTORS. | https://github.com/mljs/matrix |
| `apache-arrow (JS)` | columnar-interchange | ~14k (apache/arrow) | Very active | Apache-2.0 | yes | JS object-array materialization | Pull analytics inputs from DuckDB as Arrow record batches (zero-copy column vectors) instead of materializing JS object arrays. Feed numeric columns directly into typed-array ML kernels in the worker. Already transitive via duckdb-wasm/arquero. | https://github.com/apache/arrow |
| `umap-js` | dimensionality-reduction | ~382 (PAIR-code) | Active — last update Feb 2025, Google PAIR | Apache-2.0 | yes | manual 2-feature projection | OPTIONAL: project >2 numeric features into 2D before plotting the cluster scatter so clustering uses all features, not just amount×hour. Deterministic with a seeded RNG, runs in the ml.worker. Only adopt if multi-feature clustering is wanted. | https://github.com/PAIR-code/umap-js |
| `simple-statistics` | statistics | ~3.5k | Active — v7.9 (2026) | ISC | yes | fake stat helpers | Already installed. Keep for descriptive stats, sampleCorrelation, linearRegression in the worker — but actually USE its tTest/sampleCorrelation instead of the fake helpers. ~30kB zero-dep. | https://github.com/simple-statistics/simple-statistics |
| `comlink` | worker-rpc | ~12.6k | Active (GoogleChromeLabs) | Apache-2.0 | yes | main-thread ML calls | Already installed and already used by ml.worker.ts. Wire DeepAnalyticsScreen to call the worker through Comlink (currently it bypasses the worker entirely). ~1.1kB. | https://github.com/GoogleChromeLabs/comlink |
| `dexie` | persistence | ~13k | Active | Apache-2.0 | yes | ephemeral useState | Persist analytics runs (cluster results, chosen k, reconciliation reason-codes/escalations, custom cohorts) to IndexedDB for reproducibility and reload survival. Already an Adopt item in the radar. | https://github.com/dexie/Dexie.js |

## CLIs & tools

| Tool | Type | Offline | Why | URL |
|---|---|---|---|---|
| `@stdlib/stats CLI / REPL` | cli | yes | Validate t-test/ANOVA outputs against known fixtures offline while replacing the fake p-value helpers. | https://github.com/stdlib-js/stdlib |
| `vitest + tinybench` | cli | yes | Unit-test the real ML kernels (k-means determinism with seeded RNG, regression coefficients, t-test p-values) and micro-benchmark worker kernels on 10k/100k rows to set a perf budget. Both already in the repo's dev tooling radar. | https://github.com/tinylibs/tinybench |
| `@next/bundle-analyzer / sonda` | cli | yes | Verify per-tab code-splitting actually drops echarts off the initial Cohort-tab payload after switching to next/dynamic. | https://github.com/filipsobol/sonda |
| `duckdb CLI` | cli | yes | Prototype the SQL pushdown aggregations (cohort weekly rates, period metrics, channel revenue) against a local Parquet/CSV before wiring runReadOnlyQuery, so the heavy GROUP BY/window work lives in DuckDB not JS. | https://github.com/duckdb/duckdb |
| `react-scan` | library | yes | Detect the per-render ECharts option-literal re-renders and table re-render storms during refactor. | https://github.com/aidenybai/react-scan |

---

# Deep Analytics — Deep Improvement Plan

> Feature: `src/features/deep-analytics/` + route `src/app/dashboard/deep-analytics/page.tsx`
> Verdict: **partial maturity, demo-grade.** The UI is polished and the chart work is competent, but the analytics layer is almost entirely **synthetic, main-thread, and statistically fake.** A complete, correct, off-thread ML worker already exists in the repo (`src/workers/ml.worker.ts`) and is wired to NOTHING. The single highest-leverage move is to connect real DuckDB data → existing Comlink worker → real stats, and delete the `Math.random()` data factories.

---

## 1. Current implementation (file-by-file)

### Route + screen
- `src/app/dashboard/deep-analytics/page.tsx` — 5-line passthrough to `DeepAnalyticsScreen`.
- `src/features/deep-analytics/screens/DeepAnalyticsScreen.tsx` (632 lines) — a `Tabs` shell with four tabs:
  - **Cohort Analysis** → `<CohortAnalysis/>`
  - **Revenue Attribution** → `<RevenueAttributionModel/>`
  - **Cluster Analysis** → inline `ClusterAnalysis()` component
  - **Period Comparison** → inline `MultiPeriodComparison()` component
  - Note: `ReconciliationWizard.tsx` lives in this folder but is **not** rendered here — it is imported by `src/features/reconciliation/screens/ReconciliationScreen.tsx`. So the deep-analytics folder owns 4 surfaces, one of which is consumed by another feature.

### Cluster Analysis (DeepAnalyticsScreen.tsx:38–313)
- `generateSampleTransactions(400)` builds 400 random transactions **at module scope** (`const TRANSACTIONS = generateSampleTransactions(400)`, line 65). Every import of this module rolls new data.
- `runClustering` (line 94) maps transactions to `[amount, hour]` and calls:
  ```ts
  import { tensorKMeans } from "@/platform/ai/ml-engine";
  const result = await tensorKMeans(data, k, 50);
  ```
  **This runs on the main thread.** `ml-engine.ts` is a pure-JS module, not a worker.
- Cluster post-processing (success rate, avg amount, dominant channel) is plain JS reduce loops.
- Charts: one `ReactECharts` scatter with `series` rebuilt per render inside `useMemo([clusters])`.

### Multi-Period Comparison (DeepAnalyticsScreen.tsx:319–578)
- `SAMPLE_PERIODS` — 4 hard-coded weeks.
- `tTest(a, b)` (line 359) — **fake**: computes a t-like ratio then returns `t > 2.0 ? 0.04 : t > 1.5 ? 0.08 : 0.15`. Hard-coded p-values. No degrees of freedom, no t-distribution CDF.
- Comparison matrix + normalized trend line chart + a 'statistical significance' card driven by the fake p-value.

### CohortAnalysis.tsx (534 lines)
- `AUTO_COHORTS` + `COHORT_BASE` constants.
- `generateWeeklyRates(base, delta)` (line 89) calls `Math.random()` and is invoked **inside a `useMemo` keyed on `cohorts`** (line 142). Consequence: adding/removing one cohort re-rolls the weekly rates of *all* cohorts → numbers jump around, winner/struggler flips randomly. This is a real bug, not just synthetic data.
- `significanceLabel(diff)` (line 122) — **fake**: labels 'Highly Significant (p<0.01)' purely from `Math.abs(diff) > 8`. No test at all.
- Three ECharts (heatmap, line) + a weekly-rate table with per-cell `getCellColor` + `cn()`.

### RevenueAttributionModel.tsx (473 lines)
- `ATTRIBUTION_FACTORS`, `CHANNEL_REVENUES`, `WATERFALL_DATA` — all constants.
- `runAnalysis` (line 77) is `await new Promise(r => setTimeout(r, 1200))` — a fake spinner. **No correlation or regression is computed**, despite the UI claiming 'correlation analysis'. `ml-matrix` (installed) is never imported.
- Three ECharts (horizontal attribution bar, manual stacked-bar waterfall, revenue-per-tx bar).

### ReconciliationWizard.tsx (565 lines)
- 5-step wizard. Step 2 header says **'Auto-populated from current DuckDB dataset'** (line 303) but renders `ACTUAL_DEFAULT` constants.
- Step 4 'AI Hypotheses': `HYPOTHESIS_MAP` lookup + `setTimeout(1400)` fake 'Generating AI hypotheses…' spinner.
- 'Download PDF Report' button is a no-op.

### The dead worker (the crux)
`src/workers/ml.worker.ts` is a **fully implemented Comlink worker** exposing:
```ts
Comlink.expose({
  kMeansClustering, detectAnomalies,
  computeCorrelationMatrix, forecastTimeSeries, computePCA,
});
```
It has rigorous input validation (`validateMatrix`, `assertFiniteVector`), and richer algorithms than `ml-engine.ts` (PCA, correlation matrix). **It is imported by zero files** (`grep -rn "ml.worker"` → only the file itself). Meanwhile the screen imports the main-thread `ml-engine.ts`. So the team already paid for the right architecture and then bypassed it.

### Real data path that exists but is unused here
- `src/platform/duckdb/duckdb.ts` → `runReadOnlyQuery(sql): Promise<Record<string,unknown>[]>` and `listRegisteredDatasets()`.
- `src/core/queries/duckdb.ts` → `useDuckDBQuery(sql, params, options)` TanStack hook.
- `src/core/stores/data-store.ts` → `Dataset { viewName, rowCount, columns: ColMeta[] }`, `getActiveDataset()`.
None of these are referenced by deep-analytics.

---

## 2. Performance bottlenecks & exact fixes

### 2.1 Main-thread ML → route through the existing Comlink worker
**Problem:** `tensorKMeans` runs synchronously on the render thread. At 400 rows it's invisible; at realistic 50k–500k transaction rows the k-means++ init alone (`O(n·k)` per candidate centroid, `Math.min(...centroids.map(...))`) plus 50 iterations of full reassignment will freeze paint for seconds and likely blow the call stack via `Math.min(...spread)` on large arrays.

**Fix:** Create a single shared worker client and call the *already-exposed* `kMeansClustering`.

```ts
// src/features/deep-analytics/lib/ml-client.ts
import * as Comlink from "comlink";
import type * as MLWorker from "@/workers/ml.worker";

let api: Comlink.Remote<typeof MLWorker> | null = null;

export function getMLClient() {
  if (!api) {
    const worker = new Worker(
      new URL("@/workers/ml.worker.ts", import.meta.url),
      { type: "module" },
    );
    api = Comlink.wrap<typeof MLWorker>(worker);
  }
  return api;
}
```
```ts
// in ClusterAnalysis.runClustering
const ml = getMLClient();
const { clusters, iterations, withinss } =
  await ml.kMeansClustering(features, { k, maxIterations: 50, seed: 42 });
```
Result: zero main-thread blocking, deterministic (seeded), and the worker's input validation guards against NaNs from real data.

### 2.2 Push aggregation into DuckDB (SQL pushdown), stream Arrow
**Problem:** Every tab fabricates JS arrays. The correct pattern is: aggregate in DuckDB, return small result sets, only send *raw numeric vectors* to the worker for ML.

**Cohort weekly rates** become one SQL query instead of `generateWeeklyRates`:
```sql
SELECT cohort, week,
       100.0 * SUM(CASE WHEN status='SUCCESS' THEN 1 ELSE 0 END) / COUNT(*) AS rate
FROM (
  SELECT *,
    date_trunc('week', ts) AS week,
    CASE
      WHEN channel IN ('TTCASH_MOBILE_01','TTCASH_MOBILE_02','MOBILE_RECHARGE_03') THEN 'Mobile'
      WHEN channel IN ('IZIPAY_DIGITAL','SMT_DIGITAL','IZIPAY_PREMIUM') THEN 'Digital'
      ELSE 'Other' END AS cohort
  FROM {{view}}
)
GROUP BY cohort, week ORDER BY cohort, week;
```
Wire via the existing hook:
```ts
const { data } = useDuckDBQuery(cohortSql, [viewName], { enabled: !!viewName });
```
**Period metrics** (volume, success rate, revenue, failures, avg amount) → a single `GROUP BY period` query, not `SAMPLE_PERIODS`.
**Cluster features** → `SELECT amount, hour, ... FROM {{view}} USING SAMPLE 20000 ROWS;` so clustering operates on a bounded, representative sample, not the full table — keeps the worker fast and memory bounded on a medium PC.

### 2.3 ECharts: stop rebuilding option literals; use OffscreenCanvas
**Problem:** 5 `ReactECharts` per tab, each option object recreated every render; `echarts-for-react` re-diffs and redraws canvas.

**Fixes:**
1. Pass `notMerge={false}` + `lazyUpdate` and keep option identity stable (already partly `useMemo`'d, but the random data invalidates memo). Once data is deterministic from DuckDB, memos hold.
2. For the dense scatter (potentially 20k points after sampling) enable ECharts large-mode:
   ```ts
   series: [{ type: "scatter", large: true, largeThreshold: 2000, progressive: 4000, ...}]
   ```
3. Move rendering off the main thread with OffscreenCanvas (radar's 'single biggest 60fps lever'):
   ```ts
   // only when supported; fall back to normal ReactECharts otherwise
   const supportsOffscreen = typeof HTMLCanvasElement !== "undefined"
     && "transferControlToOffscreen" in HTMLCanvasElement.prototype;
   ```

### 2.4 Code-split charts per tab
**Problem:** echarts + echarts-for-react load even if only the Cohort tab is viewed.
```ts
const RevenueAttributionModel = dynamic(
  () => import("../components/RevenueAttributionModel").then(m => m.RevenueAttributionModel),
  { ssr: false, loading: () => <ChartSkeleton/> },
);
```
Apply to all four surfaces. Verify with `@next/bundle-analyzer`/sonda that the initial tab payload drops.

### 2.5 Typed-array k-means kernel (if you keep an in-house path)
If `ml-kmeans` is not adopted, rewrite the kernel against `Float64Array` to kill GC churn:
```ts
function kmeans(X: Float64Array, n: number, d: number, k: number, seed: number) {
  const assign = new Int32Array(n);
  const cent = new Float64Array(k * d);
  // k-means++ with seeded mulberry32, fixed-size buffers, no closures in hot loop
  // reuse a single dist Float64Array(n); accumulate centroid sums in Float64Array(k*d)
}
```
Avoid `Math.min(...arr)` / `arr.filter` inside iterations entirely.

### 2.6 Virtualize tables once row counts grow
Tables are 5–8 rows today. The moment cohorts/channels come from real data (hundreds), wrap the weekly-rate, comparison, and discrepancy tables in **TanStack Virtual** (already an Adopt dep) and memoize row components.

---

## 3. Offline gaps & how to close them

The feature already runs 100% offline — the gap is **honesty and real local compute**, not connectivity.

1. **Synthetic-data masquerade.** ReconciliationWizard claims DuckDB; CohortAnalysis/Attribution claim analysis. Replace every `Math.random()`/constant with `useDuckDBQuery` against `getActiveDataset().viewName`. Add a visible empty state when no dataset is loaded (the app has `data/empty` patterns) instead of fabricating numbers.
2. **Fake 'AI hypotheses'.** Wire ReconciliationWizard step 4 to the existing offline LLM lane (`src/workers/llm.worker.ts`, `@mlc-ai/web-llm` present). Feed the computed discrepancies as a structured prompt; gate behind a capability check (WebGPU/CPU) with the deterministic `HYPOTHESIS_MAP` as the **documented offline fallback** when no model is available — this is acceptable per the radar's CPU-first rule.
3. **No persistence / reproducibility.** Seed all RNG (worker already accepts a seed param shape). Persist analytics runs to Dexie/IndexedDB:
   ```ts
   // src/features/deep-analytics/lib/runs-db.ts
   import Dexie from "dexie";
   export const db = new Dexie("deep-analytics");
   db.version(1).stores({ runs: "++id, datasetId, kind, createdAt" });
   ```
   Save cluster outputs, chosen k, period selection, reconciliation reason-codes + escalations.
4. **Unused real ML.** `ml.worker.ts` already has `detectAnomalies`, `computeCorrelationMatrix`, `computePCA`, `forecastTimeSeries`; `ml-engine.ts` has isolation-forest anomalies + Holt-Winters + permutation importance. Surface these as new deep-analytics capabilities (anomaly tab, forecast on period metrics) instead of leaving them dead.

---

## 4. Better architecture & implementation (step-by-step)

### 4.1 Layering
```
DuckDB (SQL aggregation)  ──Arrow/rows──▶  React Query hooks  ──numeric vectors──▶  ml.worker (Comlink)  ──results──▶  memoized ECharts + virtualized tables  ──persist──▶ Dexie
```
No ML on the main thread; no synthetic data; all stats from real libraries.

### 4.2 Shared data hook
```ts
// src/features/deep-analytics/lib/use-analytics-source.ts
export function useAnalyticsSource() {
  const ds = useDataStore((s) => s.getActiveDataset());
  const enabled = !!ds?.viewName;
  return { datasetId: ds?.id, viewName: ds?.viewName, columns: ds?.columns ?? [], enabled };
}
```

### 4.3 Real two-sample test (replace fake tTest)
```ts
// src/features/deep-analytics/lib/stats.ts
import ttest2 from "@stdlib/stats-ttest2"; // Welch by default
export function comparePeriods(a: number[], b: number[]) {
  const r = ttest2(a, b, { alpha: 0.05 });   // {pValue, statistic, ci, ...}
  return { p: r.pValue, t: r.statistic, ci: r.ci, significant: r.pValue < 0.05 };
}
```
For >2 cohorts use `@stdlib/stats-anova1`. Delete `tTest` (DeepAnalyticsScreen.tsx:359) and `significanceLabel` (CohortAnalysis.tsx:122).

### 4.4 Real revenue attribution (replace constants)
Standardized multiple-linear-regression coefficients = attribution. Use installed `ml-matrix`:
```ts
// src/workers/ml.worker.ts  (add export, runs off-thread)
import { Matrix, solve } from "ml-matrix";
export async function attribution(X: number[][], y: number[]) {
  // z-score X and y so coefficients are comparable
  const Xz = standardize(X), yz = standardize1d(y);
  const Xm = new Matrix(Xz), ym = Matrix.columnVector(yz);
  const beta = solve(Xm.transpose().mmul(Xm), Xm.transpose().mmul(ym)); // (XᵀX)⁻¹Xᵀy
  const coefs = beta.to1DArray().map(Math.abs);
  const total = coefs.reduce((s,c)=>s+c,0) || 1;
  return coefs.map((c,i)=>({ factor: i, attribution: 100*c/total }));
}
```
Feature columns (channel mix dummies, success rate, avg amount, hour) come from a DuckDB `GROUP BY channel` query. Replace `ATTRIBUTION_FACTORS` + the `setTimeout` spinner with this real call.

### 4.5 Clustering with model choice + outliers
```ts
const { clusters, withinss } = await ml.kMeansClustering(features, { k, seed: 42 });
// elbow: run k=2..8, plot withinss to recommend k (cache results)
// optional: ml-dbscan for non-spherical + noise points, umap-js to project >2 features to 2D for the scatter
```
Persist the chosen run to Dexie; show the same clustering on reload.

### 4.6 Wiring the worker once
Use the `getMLClient()` singleton from §2.1 across all tabs (cluster, attribution, anomaly, forecast). One worker, many methods — the worker already multiplexes.

### 4.7 Honest reconciliation
- Step 2: `useDuckDBQuery` GROUP BY channel from the active dataset; remove `ACTUAL_DEFAULT`.
- Step 3: variance computed from real expected (user input, persisted) vs real actual.
- Step 4: real LLM via `llm.worker` with `HYPOTHESIS_MAP` fallback when no model loaded.
- Step 5: 'Download PDF' → wire to the export stack (pdfmake, in radar) in Electron main/worker.

---

## 5. Recommended dependencies (verified)

| Dep | Stars | Maint. | License | Offline | Bundle | Why |
|---|---|---|---|---|---|---|
| **ml-kmeans** | ~96 (mljs/kmeans) | Active v7.0.0 (Dec 2025, Zakodium) | MIT | yes | ~15kB | Maintained k-means++ w/ withinss + convergence; replaces hand-rolled kernel. |
| **ml-dbscan** | mljs ~1.3k | Active | MIT | yes | ~10kB | Density clustering + noise labels for unknown-k scatter. |
| **@stdlib/stats-ttest2 / -anova1** | ~5.8k stdlib | Very active | Apache-2.0 | yes | ~5–15kB each | REAL p-values/CIs; kills fake tTest/significanceLabel. Tree-shakeable single-fn pkgs. |
| **ml-matrix** | ~1.3k | Active (mljs) | MIT | yes | ~40kB | Already installed, unused here; real regression-based attribution. |
| **apache-arrow** | ~14k | Very active | Apache-2.0 | yes | ~43kB (flechette ~14kB) | Zero-copy DuckDB→worker numeric columns. |
| **comlink** | ~12.6k | Active (Google) | Apache-2.0 | yes | ~1.1kB | Installed; wire screen→ml.worker (currently bypassed). |
| **dexie** | ~13k | Active | Apache-2.0 | yes | ~25kB | Persist runs/k/cohorts/reason-codes to IndexedDB. |
| **umap-js** *(optional)* | ~382 (PAIR) | Active Feb 2025 | Apache-2.0 | yes | ~30kB | Project multi-feature data to 2D for the cluster scatter. |
| **simple-statistics** | ~3.5k | Active v7.9 | ISC | yes | ~30kB | Installed; use its real corr/regression in worker. |

All MIT/ISC/Apache-2.0, all run offline, all medium-PC friendly (no WebGPU requirement). Avoid adding TensorFlow.js/danfojs (heavy) — the radar's HOLD list and the existing Arrow/DuckDB path make them unnecessary.

---

## 6. CLIs & tools (offline)

- **duckdb CLI** — prototype every GROUP BY/window before wiring `runReadOnlyQuery`; keep heavy compute in SQL.
- **vitest + tinybench** — determinism tests (same seed ⇒ same clusters), regression-coefficient fixtures, t-test p-values vs known answers; micro-bench worker kernels on 10k/100k synthetic rows to set a perf budget (e.g. k-means ≤150ms @50k rows in worker).
- **@next/bundle-analyzer / sonda** — confirm per-tab `next/dynamic` removes echarts from the initial Cohort payload.
- **react-scan** — catch ECharts option-literal re-renders and table re-render storms during the refactor.
- **size-limit** — add a per-route budget for `dashboard/deep-analytics` and a per-worker budget for `ml.worker`.

---

## 7. Phased tasks

### P1 — Correctness & off-thread (highest leverage, low risk)
1. Add `getMLClient()` Comlink singleton; switch `ClusterAnalysis` from `tensorKMeans` (main thread) to `ml.worker.kMeansClustering`. Seed RNG.
2. Replace fake `tTest` and `significanceLabel` with `@stdlib/stats-ttest2` / `-anova1`. Show real p-value + CI.
3. Fix the CohortAnalysis re-roll bug: move data out of the `Math.random()` `useMemo`; make deterministic.
4. Add lock-behavior tests (vitest) for clustering determinism + stat outputs before further edits (anti-slop).

### P2 — Real data + persistence
5. `useAnalyticsSource` + `useDuckDBQuery` for cohort weekly rates, period metrics, cluster feature sample, reconciliation actuals (delete `ACTUAL_DEFAULT`, `SAMPLE_PERIODS`, `generateWeeklyRates`, `generateSampleTransactions`). Add empty states.
6. Real attribution via `ml-matrix` regression in the worker; remove the `setTimeout` fake and `ATTRIBUTION_FACTORS` constants.
7. Persist runs/k/cohorts/reason-codes/escalations to Dexie; reload-stable.
8. Per-tab `next/dynamic` code-split; ECharts large-mode + stable memoized options.

### P3 — Capability expansion & polish
9. Surface the already-built `detectAnomalies` / `forecastTimeSeries` / `computePCA` as new deep-analytics views (anomaly flagging on transactions, forecast on period metrics, PCA-colored scatter).
10. Optional `ml-dbscan` (noise/outliers) + `umap-js` (multi-feature 2D projection) behind a flag.
11. Wire ReconciliationWizard step 4 to `llm.worker` (offline LLM) with `HYPOTHESIS_MAP` fallback; step 5 'Download PDF' to pdfmake export.
12. OffscreenCanvas rendering with graceful fallback; TanStack Virtual on tables once real channel/cohort counts grow; size-limit budgets in CI.

---

### Bottom line
The expensive parts (a validated Comlink ML worker, DuckDB+Arrow data layer, charting, export stack, offline LLM) **already exist in this repo**. Deep-analytics just hasn't been plugged into any of them — it's a high-fidelity mock. P1 alone (worker wiring + real stats + determinism) converts it from demo to real with almost no new dependencies, since `comlink`, `ml-matrix`, and `simple-statistics` are already installed.