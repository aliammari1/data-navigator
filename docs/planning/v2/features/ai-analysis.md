# Feature Plan — ai-analysis

**Maturity:** functional

## Performance issues

- All analysis runs on the renderer main thread inside a single useCallback (runAnalysis, AiAnalysisScreen.tsx L211-733); no Web Worker, so the long synchronous JS phases (skewness/kurtosis/zscore/IQR over up-to-3000-element arrays, Pearson O(cols^2 x n), JS histogram) block paint and freeze the UI on medium PCs.
- Severe SQL query fan-out: a separate runReadOnlyQuery is issued per numeric column for stats, per numeric column again for anomalies (3000-row pull), per numeric column AGAIN for correlations (3000-row pull), plus categorical top-N etc. For a 20-column dataset this is 60+ sequential awaited round-trips, each materializing rows into JS — no batching, no Promise.all.
- Data is pulled out of DuckDB into JS arrays (SELECT col ... LIMIT 2000/3000) only to recompute things DuckDB does natively: skewness/kurtosis (SKEWNESS()/KURTOSIS()), quantiles (QUANTILE_CONT / PERCENTILE), histograms (histogram()/width_bucket), and correlations (CORR(), or the full matrix via a single crosstab query). This wastes IPC/copy bandwidth and CPU.
- Sampling uses LIMIT 2000/3000 with NO ORDER/USING SAMPLE — it takes the first N physical rows, which is statistically biased (clustered/sorted data gives wrong stats, correlations, and outliers). Should be USING SAMPLE reservoir(n) or TABLESAMPLE.
- Correlation matrix is computed by separately pulling each column's first-3000 values and zipping them positionally (pearsonCorrelation(corrData[a], corrData[b])) — but the per-column LIMIT does NOT guarantee row alignment after NULL filtering, so pairs can be misaligned, and it is O(cols^2) JS passes instead of one DuckDB query.
- ECharts charts use echarts-for-react with full SVG/canvas re-init; correlationHeatmap builds an O(cols^2) data array and the heatmap renders one label per cell on the main thread. No OffscreenCanvas worker rendering, no progressive/large mode. Multiple ReactECharts instances mount per tab.
- Heavy import surface: the 2224-line screen statically imports ~45 lucide-react icons and motion/react, and dynamically imports echarts-for-react (which pulls the full echarts bundle) with ssr:false. No per-chart lazy loading; entire echarts loads even if the user never opens a chart tab.
- Results are recomputed from scratch on every Run Analysis and auto-run on mount (useEffect L736-738) — no caching keyed by dataset id + rowCount, no persistence; re-visiting the page re-runs everything.
- forecast Model Metrics panel re-runs linearRegression + residual maps inside an IIFE in render (L1772-1836) on every re-render rather than memoizing.
- No virtualization on the anomalies / correlations / column-stats lists (they map over arrays directly); fine for small N but unbounded as numeric columns and anomalies grow.

## Offline gaps

- The 'AI' in AI-analysis is currently rule-based only and is NOT wired to any LLM. The screen imports only @/platform/ai/insights and runReadOnlyQuery; it never calls generateInsights, useAI(), or the LLM provider runtime — so there is no natural-language narrative, no LLM-summarized insights, despite a full local LLM stack existing in the repo.
- The one LLM path that does exist (insights.ts -> llm-engine.ts) uses @mlc-ai/web-llm via CreateMLCEngine, which is WebGPU-ONLY with no CPU fallback. On the medium-end / no-WebGPU target it throws 'WebGPU not supported' and silently degrades to rule-based — i.e. the LLM feature is effectively unavailable on the target hardware. The radar explicitly HOLDs web-llm as never-primary.
- There is already a correct offline-capable AI runtime (src/platform/ai/provider: useAI(), transformers.js/ONNX adapter with WASM fallback, Ollama adapter, structured.ts Zod validation, GBNF-style robust JSON extraction) that ai-analysis does not use. The feature is offline-broken not for lack of infra but for not adopting the existing CPU-capable provider.
- No persistence of analysis results to IndexedDB/OPFS; everything is in React state and lost on reload. Offline desktop UX expects cached insights per dataset.
- Forecasting is naive global OLS on up to 24 monthly buckets (or 100 raw rows as a 'time proxy'); no seasonality, no ARIMA/ETS, confidence band is a flat residual-stddev ribbon. The 'Performance Notes' panel even claims 'DuckDB WASM' though the desktop path is native DuckDB — stale copy.
- Clustering ('patterns' tab) is not clustering at all — it is GROUP BY catCol with AVG metrics (L536-592). No k-means/DBSCAN even though src/platform/ai/insights.ts already ships a real kMeans()/ckmeans implementation that is unused here. No embeddings-based semantic grouping despite a transformers.js embedding stack being available.

## Recommended dependencies

| Package | Category | Stars | Maint. | License | Offline | Replaces | Why | URL |
|---|---|---|---|---|---|---|---|---|
| `node-llama-cpp` | Local LLM (Electron main) for insight narration + structured output | ~2.1k | Very active; v0.2.8-era / 3.x line, releases within 2026 | MIT | yes | @mlc-ai/web-llm in llm-engine.ts | Primary generative engine in Electron main: GGUF q4, auto GPU offload + CPU AVX fallback, and decisive GBNF/JSON-schema grammar enforcement so insight/forecast JSON is always schema-valid. Use it to turn the rule-based stats into narrated, ranked insights without WebGPU. | https://github.com/withcatai/node-llama-cpp |
| `@huggingface/transformers` | Browser embeddings + LLM fallback (already in repo via provider adapter) | ~14-16k | Very active; v4 (2026) with new ONNX C++ runtime + WASM-SIMD fallback | Apache-2.0 | yes | web-llm fallback | CPU-capable (WASM-SIMD) feature-extraction for semantic clustering of categorical/text columns and as the no-WebGPU LLM fallback. Already wrapped by src/platform/ai/provider/adapters/transformers.ts — wire it in instead of web-llm. | https://github.com/huggingface/transformers.js |
| `arima` | Forecasting (ARIMA/SARIMA/AutoARIMA) in a worker | ~100 | Updated: v0.2.8 ~Mar 2026 (fresher than radar's 2021 note); ~16k weekly downloads | MIT (Apache-2.0 components) | yes | linearRegression-only forecast | Only drop-in JS ARIMA/SARIMA/AutoARIMA (Emscripten WASM) — replaces naive global OLS for the forecast tab with seasonality-aware models and proper CI. Niche/low-star: vendor + pin, run in a worker, always call .destroy(). | https://github.com/zemlyansky/arima |
| `@stdlib/stats` | Rigorous statistics (tests, distributions, GESD criticals) | ~5.8k | Active | Apache-2.0 | yes | ad-hoc thresholds | Adds p-values, normality tests, and the critical values needed for a real Generalized ESD / S-H-ESD anomaly detector — closes the gap where the current zscore/IQR is ad-hoc. Modular imports keep bundle small. | https://github.com/stdlib-js/stats |
| `comlink` | Worker RPC | ~12.6k | Active (GoogleChromeLabs) | Apache-2.0 | yes | main-thread compute | Already a dependency. Move runAnalysis off the main thread by exposing an analysis worker over Comlink; the screen awaits a single proxy call instead of running stats inline. | https://github.com/GoogleChromeLabs/comlink |
| `apache-arrow` | Zero-copy columnar transport DuckDB <-> worker <-> charts | ~11-15k | Very active | Apache-2.0 | yes | manual row mapping | Stream DuckDB aggregate results as Arrow into the worker/charts instead of materializing Record<string,unknown>[]; avoids the per-row JS object overhead in the current SELECT loops. | https://github.com/apache/arrow |
| `dexie` | IndexedDB persistence of analysis runs | ~13k | Active | Apache-2.0 | yes | ephemeral React state | Cache computed insights/anomalies/correlations keyed by datasetId+rowCount so reopening the page is instant and offline; the current implementation recomputes everything on mount. | https://github.com/dexie/Dexie.js |
| `@tanstack/react-virtual` | List virtualization | ~5.5k | Very active | MIT | yes | unbounded .map() | Already a dependency. Virtualize the anomalies / correlations / column-stats lists so wide datasets (many numeric columns) don't mount hundreds of motion.div nodes. | https://github.com/TanStack/virtual |
| `uPlot` | Dense time-series forecast chart | ~10.2k | Active; v1.6.x | MIT | yes | ECharts for dense lines | For long forecast/actual series uPlot renders 100k+ points at ~10% CPU vs ECharts; use it for the forecast line+CI band to keep the chart tab smooth on iGPU. | https://github.com/leeoniya/uPlot |

## CLIs & tools

| Tool | Type | Offline | Why | URL |
|---|---|---|---|---|
| `DuckDB CLI` | cli | yes | Prototype the consolidated single-pass aggregate/correlation/quantile SQL (CORR, SKEWNESS, QUANTILE_CONT, histogram, USING SAMPLE) against a real Parquet before wiring it into the worker. | https://github.com/duckdb/duckdb |
| `node-llama-cpp CLI (npx node-llama-cpp chat)` | cli | yes | Validate GGUF models and GBNF/JSON-schema grammars offline so insight narration always returns schema-valid JSON before integrating. | https://github.com/withcatai/node-llama-cpp |
| `size-limit (+ @size-limit/preset-app)` | cli | yes | Already in repo. Add a per-route budget for /dashboard/ai-analysis and a per-worker budget for the analysis worker to catch echarts/transformers bloat. | https://github.com/ai/size-limit |
| `react-scan` | library | yes | Detect the unnecessary re-renders in the forecast IIFE and tab switches on this heavy screen. | https://github.com/aidenybai/react-scan |
| `tinybench (via Vitest bench)` | library | yes | Microbenchmark the worker stats path (skewness/zscore/correlation) against the DuckDB-pushdown path to prove the SQL-first win. | https://github.com/tinylibs/tinybench |
| `all-MiniLM-L6-v2 (int8 ONNX)` | model | yes | 384-dim CPU embeddings (<30ms) for real semantic clustering of categorical/text columns via the existing transformers.js adapter. | https://huggingface.co/Xenova/all-MiniLM-L6-v2 |

---

## AI Analysis — Deep Improvement Plan

> Scope: `src/features/ai-analysis/**` and `src/app/dashboard/ai-analysis/page.tsx`, plus the platform AI/DuckDB modules it touches. Target: offline-only, medium-end PC (4-8 cores, 8-16GB RAM, no guaranteed WebGPU).

---

### 1. Current implementation

**Route shell** — `src/app/dashboard/ai-analysis/page.tsx` (5 lines) is a thin client wrapper that renders `AiAnalysisScreen`.

**The screen** — `src/features/ai-analysis/screens/AiAnalysisScreen.tsx` is a **2224-line single component**. It owns:

- Tab state for 6 tabs: `insights | anomalies | correlations | forecast | patterns | explain` (L98-105).
- ~12 `useState` slices: `analysisState`, `colStats`, `anomalies`, `correlations`, `forecasts`, `insights`, `clusters`, `selectedCol`, filters, `rowCount`, `tableLoaded` (L106-123).
- Data-store integration (L127-153): reads `datasets`, `activeDatasetId`, `loadedTableNames` from `useDataStore`; derives `numericCols`, `catCols`, `dateCols` from `activeDataset.columns`.
- A table-resolution effect (L167-207) that runs `SHOW TABLES`, picks a table, and `SELECT COUNT(*)`.
- **`runAnalysis`** (L211-733) — a single `useCallback` that does the entire pipeline inline on the main thread.
- A pile of `useMemo` ECharts option builders (correlation heatmap L742-807, forecast L809-881, cluster scatter L883-929, anomaly pie L931-972, histogram L976-1025).
- ~1150 lines of JSX for the 6 tabs.

**Stats helpers** — `src/features/ai-analysis/model/stats.ts` (81 lines) wraps `simple-statistics`: `mean`, `stdDev`, `pearsonCorrelation`, `linearRegression`, `detectZScoreAnomalies`, `detectIQRAnomalies`, `correlationStrength`, `buildHistogram` (a hand-rolled JS binning loop).

**Types** — `src/features/ai-analysis/model/types.ts` (81 lines): `ColStat`, `Anomaly`, `Correlation`, `ForecastPoint`, `Insight`, `ClusterGroup`, `AnalysisState`.

**Cards** — `src/features/ai-analysis/components/analysis-cards.tsx` (263 lines): `InsightCard`, `SeverityBadge`, `StatCard`.

**What `runAnalysis` actually does (the pipeline), stage by stage:**

1. **Column stats** (L228-301): for *each* numeric column, one aggregate query (`MIN/MAX/AVG/STDDEV_SAMP/MEDIAN/COUNT DISTINCT`) **plus a second query** pulling `LIMIT 2000` raw values into JS to compute `buildHistogram`, `computeSkewness`, `computeKurtosis`. For each categorical column, a count query + a top-10 `GROUP BY` query.
2. **Anomalies** (L304-387): for *each* numeric column **another** `LIMIT 3000` raw pull, then JS `detectZScoreAnomalies` + `detectIQRAnomalies`, plus skew/null-rate rules.
3. **Correlations** (L389-426): for *each* numeric column **another** `LIMIT 3000` raw pull into `corrData[col]`, then an O(cols²) JS double loop calling `pearsonCorrelation(corrData[a], corrData[b])`.
4. **Forecast** (L428-527): one `GROUP BY strftime(date,'%Y-%m')` query (≤24 rows) → `linearRegression` → 6-step linear extrapolation with a flat `±1.96·stdDev` band. Fallback uses the first 100 raw rows as a fake time axis.
5. **Patterns** (L529-593): one `GROUP BY catCol` with `AVG(metric)` → labelled as "segments/clusters". **This is not clustering.**
6. **Insights** (L595-723): rule-based string assembly from the above. **No LLM is called anywhere.**

**The critical architectural gap:** the repo already ships a *correct* offline AI runtime that this screen ignores:

- `src/platform/ai/provider/use-ai.ts` — `useAI()` hook with provider auto-detection, model warm-up, `generate` / `generateStructured`.
- `src/platform/ai/provider/adapters/transformers.ts` — **CPU-capable** (WASM-SIMD) ONNX/transformers.js adapter ("works even without WebGPU"), plus `ollama.ts`, `webllm.ts`, `openai.ts` adapters.
- `src/platform/ai/provider/structured.ts` — robust `extractJsonBlock` / `parseStructured` (Zod) for reliable structured output from small models.
- `src/platform/ai/insights.ts` — a richer `generateInsights()` (LLM-or-rule) and a real `kMeans()`/`ckmeans()` clustering implementation — **both unused by the screen.**

Instead, the screen reaches past all of that to `@/platform/ai/insights` for *pure math helpers only* and never narrates anything. The one LLM path that the insights module does use is `src/platform/ai/llm-engine.ts`, which is **`@mlc-ai/web-llm` (WebGPU-only, no CPU fallback)** — exactly the library the Tech Radar HOLDs as never-primary because it fails on the medium/iGPU/Linux target.

**Maturity verdict: functional.** It runs, computes real (if biased) statistics, and renders polished charts — but it is "AI" in name only, blocks the main thread, fans out dozens of redundant queries, and bypasses the offline LLM infra that already exists.

---

### 2. Performance bottlenecks and exact fixes

#### 2.1 Everything runs on the renderer main thread

`runAnalysis` (L211-733) is one long async function executed in the React render thread. Between every `await` the synchronous JS work (skew/kurtosis/zscore/IQR over 2-3k-element arrays, O(cols²) Pearson, JS histogram binning, building the O(cols²) heatmap data array) blocks paint. On a 4-core iGPU laptop with 20 numeric columns this visibly freezes the tab.

**Fix — move the whole pipeline into a Comlink worker.** `comlink` is already a dependency.

```ts
// src/features/ai-analysis/worker/analysis.worker.ts
import * as Comlink from "comlink";
import { runAnalysisPipeline } from "./pipeline"; // pure, no React

export interface AnalysisInput {
  tableName: string;
  numericCols: string[];
  catCols: string[];
  dateCols: string[];
  sampleSize: number;
}
const api = {
  run(input: AnalysisInput, onStage: (s: { progress: number; stage: string }) => void) {
    return runAnalysisPipeline(input, onStage);
  },
};
export type AnalysisWorker = typeof api;
Comlink.expose(api);
```

```ts
// src/features/ai-analysis/worker/client.ts
import * as Comlink from "comlink";
import type { AnalysisWorker } from "./analysis.worker";

let proxy: Comlink.Remote<AnalysisWorker> | null = null;
export function getAnalysisWorker() {
  if (!proxy) {
    const w = new Worker(new URL("./analysis.worker.ts", import.meta.url), { type: "module" });
    proxy = Comlink.wrap<AnalysisWorker>(w);
  }
  return proxy;
}
```

The screen then awaits a single proxy call and only ever does `setState`:

```ts
const worker = getAnalysisWorker();
const result = await worker.run(
  { tableName, numericCols, catCols, dateCols, sampleSize: 5000 },
  Comlink.proxy((s) => setAnalysisState({ status: "running", ...s })),
);
setColStats(result.colStats);
setAnomalies(result.anomalies);
// ...
```

> Note: DuckDB access from a worker. On the Electron desktop path DuckDB lives in the main process and is reached via IPC; expose a read-only query channel callable from the worker (or run the *math* in the worker and keep the few SQL calls on a thin renderer proxy). On any browser fallback build, use `@duckdb/duckdb-wasm` registered inside the same worker.

#### 2.2 Query fan-out — collapse N+N+N round-trips into a few

Today: per-column stats query + per-column histogram pull + per-column anomaly pull + per-column correlation pull. 20 columns ⇒ 60-80 sequential awaited queries.

**Fix A — one aggregate query for all numeric columns.** DuckDB can compute every stat in a single pass, including skewness/kurtosis/quantiles, with **no JS pull**:

```sql
SELECT
  'amount' AS col,
  count(*) AS total, count(amount) AS non_null,
  min(amount) AS min_val, max(amount) AS max_val,
  avg(amount) AS avg_val, stddev_samp(amount) AS std_val,
  quantile_cont(amount, 0.5) AS median_val,
  quantile_cont(amount, 0.25) AS q1, quantile_cont(amount, 0.75) AS q3,
  skewness(amount) AS skew, kurtosis(amount) AS kurt,
  count(DISTINCT amount) AS distinct_count
FROM tbl
UNION ALL SELECT 'qty', ... FROM tbl
-- generated programmatically, one UNION ALL arm per numeric column
```

Build this string by mapping over `numericCols`; it is one query instead of `2 × numericCols` queries, and skewness/kurtosis/median/IQR come back already computed — deleting the `LIMIT 2000` pulls and the JS `computeSkewness/computeKurtosis` entirely.

**Fix B — histograms in SQL** via `histogram()` or explicit `width_bucket`:

```sql
SELECT width_bucket(amount, :min, :max, 20) AS bin, count(*) AS c
FROM tbl WHERE amount IS NOT NULL GROUP BY bin ORDER BY bin;
```

This replaces `buildHistogram` (L69-81 of stats.ts) and its `Math.min(...values)` spread (which itself stack-overflows on large arrays).

**Fix C — correlation matrix in one query.** Instead of pulling each column and zipping in JS (which is also *misaligned* — see 2.3), use `CORR()`:

```sql
SELECT corr(a, b) AS r_ab, corr(a, c) AS r_ac, corr(b, c) AS r_bc FROM tbl;
```

generated for the upper triangle. One query, exact, no sampling bias, no O(cols²) JS. For very wide tables cap at the top-K highest-variance columns first.

#### 2.3 Sampling is biased and correlation pairing is broken

`LIMIT 2000/3000` (L246, L316, L400) takes the **first N physical rows** — for sorted/clustered data this skews every statistic. Worse, in the correlation step each column is pulled with its *own* `WHERE col IS NOT NULL LIMIT 3000`, so after null-filtering the arrays are **not row-aligned**; `pearsonCorrelation(corrData[a], corrData[b])` correlates unrelated rows.

**Fix:** push correlation to `CORR()` (handles nulls + alignment correctly), and where a JS sample is genuinely needed (e.g. for the scatter overlay) use a *reservoir* sample:

```sql
SELECT amount FROM tbl USING SAMPLE reservoir(5000 ROWS);
```

#### 2.4 Charts — defer ECharts, render off-thread, prefer uPlot for dense lines

- `echarts-for-react` is `dynamic(..., { ssr:false })` (L60) but still pulls the **entire** echarts bundle the moment any chart tab mounts. Split per chart and only import the chart modules you use (`echarts/core` + `LineChart`/`HeatmapChart`/`PieChart` + `CanvasRenderer`) instead of the full `echarts`.
- Use **OffscreenCanvas + worker rendering** (ECharts supports it) for the heatmap and forecast so chart layout doesn't compete with React on the main thread.
- For the forecast/actual series (which can be long), swap ECharts for **uPlot** — ~10% CPU streaming 100k+ points vs ECharts's heavier canvas pipeline.
- The correlation heatmap currently emits one text label per cell (L796-802); for >12 columns disable per-cell labels and rely on the tooltip.

#### 2.5 Memoize render-time compute and cache results

- The forecast **Model Metrics IIFE** (L1772-1836) recomputes `linearRegression` + residual arrays on *every* re-render (tab switch, hover). Hoist it into a `useMemo` keyed on `forecasts`.
- `runAnalysis` re-runs fully on mount and on every button press. **Cache** the result in IndexedDB via `dexie` keyed by `datasetId + rowCount + columnsHash`; on mount, hydrate from cache and only recompute on explicit refresh or dataset change.

#### 2.6 Split the 2224-line component

Extract each tab into its own file (`tabs/InsightsTab.tsx`, `AnomaliesTab.tsx`, …) and lazy-load with `next/dynamic` so the JSX + its chart imports only load when the tab is opened. Move the ~45 `lucide-react` imports to per-tab files. This shrinks the initial route bundle and the React reconciliation surface.

---

### 3. Offline gaps and how to close them

1. **No LLM narration at all, despite full infra.** Close by routing insight generation through the existing `useAI()` runtime (CPU-capable transformers.js adapter), not the dead-on-target web-llm path. See §4.3.
2. **web-llm is WebGPU-only.** Repoint `src/platform/ai/insights.ts` (and any insight narration) away from `llm-engine.ts` to the provider runtime, which auto-detects and falls back to WASM. Keep web-llm only as an *opportunistic* accelerator when WebGPU is present.
3. **No persistence.** Add `dexie` caching (§2.5) so analyses survive reload offline.
4. **Forecast has no seasonality.** Add a vendored, worker-isolated `arima` model for AutoARIMA/SARIMA (cached WASM, `.destroy()` discipline) behind the existing linear fallback.
5. **"Clustering" is GROUP BY.** Use the already-present `kMeans()`/`ckmeans()` in `insights.ts`, fed by DuckDB-computed per-row feature vectors, and optionally `all-MiniLM-L6-v2` embeddings for text/categorical columns — all CPU/WASM, all offline.
6. **Stale copy.** The "Performance Notes" panel claims "DuckDB WASM" and "simple-statistics" (L2200-2205); on desktop it is native DuckDB. Fix the copy or compute it from the active engine.

---

### 4. Better architecture and implementation (step by step)

#### 4.1 Layering

```
AiAnalysisScreen (thin: state + tabs + charts)
  └─ useAnalysis(datasetId)            // hook: cache-read, worker.run, cache-write
       └─ analysis.worker (Comlink)
            ├─ sql/                     // single-pass DuckDB queries (stats, hist, corr, segments)
            ├─ forecast/ (arima + OLS fallback)
            ├─ anomalies/ (GESD/S-H-ESD via @stdlib criticals)
            └─ cluster/ (kMeans + optional MiniLM embeddings)
  └─ narrateInsights()                 // useAI().generateStructured(InsightSchema)
```

#### 4.2 The pipeline module (pure, worker-side)

```ts
// worker/sql.ts — build ONE multi-arm aggregate query
export function buildStatsSQL(table: string, numeric: string[]): string {
  const q = (id: string) => '"' + id.replace(/"/g, '""') + '"';
  return numeric.map((c) => `
    SELECT '${c}' AS col, count(*) total, count(${q(c)}) non_null,
      min(${q(c)}) min_val, max(${q(c)}) max_val, avg(${q(c)}) avg_val,
      stddev_samp(${q(c)}) std_val,
      quantile_cont(${q(c)},0.5) median_val,
      quantile_cont(${q(c)},0.25) q1, quantile_cont(${q(c)},0.75) q3,
      skewness(${q(c)}) skew, kurtosis(${q(c)}) kurt,
      count(DISTINCT ${q(c)}) distinct_count
    FROM ${q(table)}`).join("\nUNION ALL\n");
}
```

```ts
// worker/pipeline.ts
import { buildStatsSQL } from "./sql";
import { runReadOnlyQuery } from "@/platform/duckdb/duckdb"; // worker-safe proxy

export async function runAnalysisPipeline(input: AnalysisInput, onStage: (s:{progress:number;stage:string})=>void) {
  onStage({ progress: 10, stage: "Column statistics (single pass)" });
  const stats = await runReadOnlyQuery(buildStatsSQL(input.tableName, input.numericCols));

  onStage({ progress: 35, stage: "Correlations" });
  const corr = await runReadOnlyQuery(buildCorrSQL(input.tableName, input.numericCols));

  onStage({ progress: 55, stage: "Anomalies (GESD)" });
  const anomalies = detectGESD(stats); // uses q1/q3/skew already returned + @stdlib criticals

  onStage({ progress: 75, stage: "Forecast" });
  const forecast = await forecastSeries(input); // arima → OLS fallback

  onStage({ progress: 90, stage: "Segments" });
  const clusters = await clusterSegments(input, stats);

  return { colStats: toColStats(stats), correlations: toCorr(corr), anomalies, forecast, clusters };
}
```

#### 4.3 LLM narration via the existing offline runtime + Zod schema

Replace the silent rule-only path with structured, validated narration that *degrades gracefully* when no LLM is loaded:

```ts
// model/insight-schema.ts
import { z } from "zod";
export const InsightSchema = z.object({
  insights: z.array(z.object({
    category: z.enum(["anomaly","trend","correlation","quality","pattern","forecast"]),
    title: z.string().max(80),
    description: z.string().max(400),
    severity: z.enum(["critical","warning","info","success"]),
    impact: z.enum(["high","medium","low"]),
    confidence: z.number().min(0).max(1),
  })).max(8),
});
```

```ts
// in the screen / a hook
const ai = useAI();
async function narrate(facts: AnalysisFacts): Promise<Insight[]> {
  const ruleBased = buildRuleInsights(facts);           // always available, offline
  if (!ai.canGenerate) return ruleBased;                // no model loaded → still useful
  try {
    const { insights } = await ai.generateStructured(
      { system: "You are a precise data analyst. Use ONLY the provided numbers.",
        prompt: `Facts:\n${JSON.stringify(facts)}\nReturn ranked insights.` },
      InsightSchema,
    );
    return insights.map(withId);
  } catch {
    return ruleBased;                                   // schema/parse failure → fallback
  }
}
```

On the Electron path, prefer `node-llama-cpp` with a GBNF grammar derived from `InsightSchema` so the model is *constrained* to valid JSON at sampling time (no post-hoc repair needed). On the browser path, the existing transformers.js adapter + `parseStructured` handles it. Either way: **never block the UI on the model** — render rule-based insights immediately, then replace/augment when narration resolves.

#### 4.4 Real anomaly detection

Replace the per-column ad-hoc `z>3 || (iqr && z>2)` with **Generalized ESD (S-H-ESD)** using `@stdlib/stats` for the t-distribution critical values, computed in the worker on a reservoir sample. Keep IQR fences as a robust complement. Report each anomaly with method, critical value, and a calibrated score (not `length/n`).

#### 4.5 Real forecasting

```ts
// worker/forecast/index.ts
export async function forecastSeries(input: AnalysisInput): Promise<ForecastResult> {
  const series = await aggregateSeries(input);          // DuckDB GROUP BY period
  if (series.length >= 12) {
    const arima = await import("arima");                // vendored + pinned
    const model = new arima.default(series.map(p=>p.y), { auto: true, s: 12 });
    const [pred, err] = model.predict(6);
    model.destroy();                                    // free WASM
    return toForecast(series, pred, err);
  }
  return olsForecast(series);                           // existing linear path as fallback
}
```

#### 4.6 Real segments (clustering)

Build per-group feature vectors in DuckDB (`AVG`/`STDDEV` of standardized metrics per category), then run the **existing** `kMeans()` from `insights.ts` (or `ckmeans` for 1-D). For high-cardinality text dimensions, embed labels with `all-MiniLM-L6-v2` (transformers.js, CPU) and cluster the embeddings. This makes the "patterns" tab actually discover structure instead of just averaging a GROUP BY.

---

### 5. Recommended dependencies (summary table)

| Dep | Stars | Maint. | License | Offline | Why |
|---|---|---|---|---|---|
| node-llama-cpp | ~2.1k | Very active (2026) | MIT | yes | Electron LLM narration + GBNF/JSON-schema-constrained insights; CPU fallback. |
| @huggingface/transformers | ~14-16k | Very active v4 | Apache-2.0 | yes | Browser embeddings + WASM-SIMD LLM fallback (already wrapped by provider adapter). |
| arima (vendored) | ~100 | v0.2.8 ~Mar 2026 | MIT | yes | Seasonality-aware forecasting; worker-isolated, `.destroy()`. |
| @stdlib/stats | ~5.8k | Active | Apache-2.0 | yes | GESD criticals, tests, distributions for rigorous anomaly detection. |
| comlink | ~12.6k | Active | Apache-2.0 | yes | Move the pipeline off the main thread (already a dep). |
| apache-arrow | ~11-15k | Very active | Apache-2.0 | yes | Zero-copy columnar transport DuckDB↔worker↔charts. |
| dexie | ~13k | Active | Apache-2.0 | yes | Persist analyses keyed by dataset for instant offline reload. |
| @tanstack/react-virtual | ~5.5k | Very active | MIT | yes | Virtualize anomaly/correlation/stat lists (already a dep). |
| uPlot | ~10.2k | Active | MIT | yes | Dense forecast line+CI at ~10% CPU on iGPU. |

**Reject / repoint:** `@mlc-ai/web-llm` (WebGPU-only, no CPU fallback) — keep only as opportunistic accelerator, repoint `insights.ts`/narration to the provider runtime.

---

### 6. CLIs & tools (offline)

- **DuckDB CLI** — prototype the consolidated stats/corr/histogram/sample SQL on real Parquet.
- **node-llama-cpp CLI** (`npx node-llama-cpp chat`) — validate GGUF + GBNF grammar for `InsightSchema` offline.
- **size-limit** (already in repo) — add `/dashboard/ai-analysis` route budget + analysis-worker budget.
- **react-scan** — catch the forecast-IIFE and tab-switch re-renders.
- **tinybench / Vitest bench** — prove SQL-pushdown beats the JS-pull path for stats/correlation.

---

### 7. Phased task list

**P1 — Correctness + responsiveness (no new heavy deps)**
1. Extract `runAnalysis` into a pure `worker/pipeline.ts` and run it in a **Comlink** worker; screen only `setState`s. Fixes main-thread freeze.
2. Collapse per-column stats + histogram + skew/kurtosis into **one multi-arm DuckDB query**; delete the `LIMIT 2000` JS pulls and `computeSkewness/Kurtosis/buildHistogram`.
3. Replace JS correlation zip with `CORR()` SQL (fixes the **misaligned-pairs bug** and the bias from `LIMIT`); use `USING SAMPLE reservoir(n)` wherever a JS sample is still needed.
4. Memoize the forecast Model-Metrics IIFE; split the 2224-line component into per-tab lazy modules; tree-shake echarts to used charts only.
5. Fix stale "DuckDB WASM / simple-statistics" copy in the Performance Notes panel.

**P2 — Real AI, offline**
6. Add `InsightSchema` (Zod) and route narration through `useAI().generateStructured`, with **rule-based insights rendered immediately** and LLM augmentation applied async. Repoint `insights.ts` off `web-llm`.
7. On Electron, wire `node-llama-cpp` with a GBNF grammar from `InsightSchema` for constrained JSON.
8. Persist analysis results in **dexie** keyed by `datasetId+rowCount+columnsHash`; hydrate on mount.
9. Replace ad-hoc anomaly thresholds with **GESD/S-H-ESD** using `@stdlib/stats` criticals.

**P3 — Depth + scale**
10. Vendor + pin **arima**; add AutoARIMA/SARIMA forecasting in the worker with `.destroy()`, OLS as fallback.
11. Replace GROUP-BY "segments" with real **kMeans/ckmeans** (already in `insights.ts`) over standardized feature vectors; optional **MiniLM** embeddings for text dimensions.
12. Swap the forecast chart to **uPlot**, render heatmap/forecast via **OffscreenCanvas** worker; virtualize long lists with **@tanstack/react-virtual**.
13. Add size-limit budgets + a Vitest bench comparing SQL-pushdown vs JS-pull to lock in the perf wins.

---

### Sources
- node-llama-cpp — https://github.com/withcatai/node-llama-cpp
- transformers.js v4 — https://github.com/huggingface/transformers.js ; https://huggingface.co/blog/transformersjs-v4
- arima — https://github.com/zemlyansky/arima ; https://www.npmjs.com/package/arima
- @stdlib/stats — https://github.com/stdlib-js/stats
- DuckDB — https://github.com/duckdb/duckdb
- uPlot — https://github.com/leeoniya/uPlot
- all-MiniLM-L6-v2 — https://huggingface.co/Xenova/all-MiniLM-L6-v2