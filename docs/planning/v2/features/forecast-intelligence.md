# Feature Plan — forecast-intelligence — Time-series forecasting (offline)

**Maturity:** functional

## Performance issues

- ForecastScreen.tsx is a 1994-line monolithic client component with 6 tabs all mounted/computed eagerly; every ECharts instance, useMemo and synthetic-data generator runs even for hidden tabs (no tab-level code splitting or lazy mounting).
- Non-deterministic Math.random() is sprinkled across render-time data builders (generateHistoricalData, channelForecasts line ~230, extendedData line ~990, channelRisks line ~1320) — these run on the module/render path and re-randomize on each render, defeating memoization and making forecasts unstable.
- HISTORICAL is generated at module import time (line 133) on the main thread; all tabs reference this synthetic dataset rather than streaming from DuckDB, so the feature never exercises the real data path and main-thread work is unbounded as data grows.
- ForecastPanel kicks off a Pyodide worker round-trip in a useEffect on every series/horizon/seasonLength change (line 105-126); the sandbox boot (~6-30MB) + statsmodels install happens repeatedly and re-triggers on horizon toggle, with no debounce, caching of fitted model, or AbortController on the worker request.
- forecastSeries() and backtest() refit the entire Holt model from scratch synchronously on the main thread inside useMemo (forecast-panel.tsx line 95); fine for 30 points but will block the UI for thousands of points — no worker offload, no incremental fit.
- ECharts charts use full re-option rebuilds (notMerge) and canvas renderer without OffscreenCanvas/worker rendering; 6 simultaneous chart instances on one screen tax a medium-end CPU, and there is no virtualization for the scenario/channel lists.
- linearForecast (insights.ts) and forecastSeries both recompute regression/stats redundantly per tab; simple-statistics is imported as a namespace (import * as ss) which can defeat tree-shaking and bloat the route bundle.
- AnimatedNumber uses motion/react with key={Math.round(value)} causing a full remount+enter/exit animation on every value tick — expensive layout/animation thrash when sliders move.

## Offline gaps

- CRITICAL: the Pyodide worker loads the runtime from a hardcoded public CDN — PYODIDE_CDN = https://cdn.jsdelivr.net/pyodide/v0.26.4/full/ (python-sandbox.worker.ts line 48) via importScripts and indexURL. With no internet this throws 'Pyodide CDN unreachable' and the entire advanced-forecast tier silently fails.
- CRITICAL: statsmodels/pandas/numpy are installed at runtime via micropip.install (worker line 265), which pulls wheels from PyPI/jsDelivr over the network. micropip cannot fetch offline, so holtWintersStatsmodels always falls back. Worse, the prebuilt statsmodels Pyodide wheel must be loaded via py.loadPackage, not micropip — the current code uses the wrong loader.
- The forecast-pyodide comment claims 'statsmodels often isn't a prebuilt pyodide wheel' — this is outdated; statsmodels IS a built-in Pyodide package, so the offline failure is a packaging/loader bug, not a fundamental limitation.
- No local persistence of forecast results, fitted models, scenarios, or the Pyodide model cache — SavedScenario state (ForecastScreen) lives only in React state and is lost on reload; nothing is written to OPFS/IndexedDB/Dexie.
- The feature is wired entirely to synthetic generateHistoricalData() rather than real on-device datasets from DuckDB, so there is no offline data pipeline (CSV->Parquet->Arrow->series) feeding the forecaster.
- ECharts dark-theme colors are hardcoded hex (#1e293b etc.) rather than driven by the offline design tokens; not a network gap but blocks theming and accessibility consistency.

## Recommended dependencies

| Package | Category | Stars | Maint. | License | Offline | Replaces | Why | URL |
|---|---|---|---|---|---|---|---|---|
| `@stdlib/stats (+ @stdlib/stats-anova / distributions)` | stats/forecast-support | ~5.8k | Active (stdlib-js, frequent releases) | Apache-2.0 | yes | hardcoded 1.96 / ad-hoc std math | Rigorous distributions, quantiles (proper z/t multipliers for CI instead of hardcoded 1.96), GESD/ESD criticals for anomaly detection, and prediction-interval math — modular imports keep bundle tiny. Backs a correct, dependency-light pure-TS forecaster. | https://github.com/stdlib-js/stats |
| `simple-statistics` | stats | ~3.5k | Active (v7.9, Jun 2026) | ISC | yes | — | Already in use via insights.ts; keep for descriptive stats/linear regression but switch from `import * as ss` to named imports for tree-shaking. Solid offline base-stats layer under the engine. | https://github.com/simple-statistics/simple-statistics |
| `@grafana/augurs (augurs-js)` | forecasting (WASM) | ~1.2k (grafana/augurs) | Very active (Grafana-backed, 2025 releases) | Apache-2.0/MIT | yes | arima (zemlyansky) + much of the Pyodide statsmodels path | TRIAL: Rust->WASM toolkit with AutoETS, MSTL (seasonal-trend), Prophet, MAD/DBSCAN outliers and changepoint detection — a modern, maintained replacement for the stale `arima` and a far lighter alternative to Pyodide for the 'advanced' tier. Runs in a worker, CPU-only, no WebGPU needed. Bundle the .wasm as a static asset for full offline use. | https://github.com/grafana/augurs |
| `arima (zemlyansky)` | forecasting (WASM) | ~150 | STALE (v0.2.4, Nov 2021) | Apache-2.0 | yes | — | HOLD/fallback only: the one drop-in JS ARIMA/SARIMA/AutoARIMA WASM. Vendor + pin, worker-isolate, always call .destroy(). Prefer augurs for new work; keep arima only if SARIMAX parity is required and augurs gaps remain. | https://github.com/zemlyansky/arima |
| `uPlot` | visualization (dense time-series) | ~10.2k | Active (v1.6.x, single maintainer) | MIT | yes | ECharts for the primary line/band chart | ADOPT for the forecast chart: 166k points in ~25ms, ~10% CPU / 12MB RAM streaming vs ECharts' 70%/85MB. Renders history+forecast+CI band+anomaly markers at a fraction of the cost; pairs perfectly with horizon sweeps and large real datasets. ECharts stays for heatmap/scatter tabs. | https://github.com/leeoniya/uPlot |
| `Pyodide (loadPackage statsmodels/scipy/pandas, self-hosted)` | advanced forecasting tier | ~13k | Active (v0.26+) | MPL-2.0 | partial | — | Keep as the opt-in 'advanced' tier (real ExponentialSmoothing/SARIMAX/STL) but it is offline ONLY after self-hosting the runtime+wheels locally and loading statsmodels via py.loadPackage (built-in wheel), not micropip. Cache once in OPFS. Worker-only, never hot path. | https://github.com/pyodide/pyodide |
| `comlink` | worker RPC | ~12.6k | Active (GoogleChromeLabs) | Apache-2.0 | yes | raw postMessage plumbing | Wrap a dedicated forecast.worker behind a typed proxy so heavy fits (augurs/pure-TS at scale) leave the main thread cleanly; consistent with the app's existing worker-boundary pattern. | https://github.com/GoogleChromeLabs/comlink |
| `dexie` | persistence | ~13k | Active | Apache-2.0 | yes | in-memory React state for scenarios | Persist SavedScenario records, forecast snapshots, chosen models and last-fit metadata to IndexedDB so the workspace survives reloads; small structured records fit IndexedDB well (OPFS reserved for big model/Parquet blobs). | https://github.com/dexie/Dexie.js |
| `@duckdb/node-api (DuckDB) + apache-arrow` | data pipeline | 31k / ~12k | Very active | MIT / Apache-2.0 | yes | generateHistoricalData() synthetic data | Feed the forecaster from real datasets: push date-bucketing/aggregation into SQL (time_bucket, GROUP BY, window funcs), stream the resulting series as Arrow into the worker. Replaces synthetic generateHistoricalData with the real offline pipeline. | https://github.com/duckdb/duckdb-node-neo |

## CLIs & tools

| Tool | Type | Offline | Why | URL |
|---|---|---|---|---|
| `vitest + tinybench` | cli | yes | Unit-test the pure forecast engine (deterministic given fixed input) and microbench Holt/backtest/anomaly fits to set per-call perf budgets; both run fully offline against localhost/node. | https://github.com/tinylibs/tinybench |
| `@next/bundle-analyzer + sonda + size-limit` | cli | yes | Track the forecast route + forecast.worker bundle; enforce per-route/per-worker byte budgets (ECharts vs uPlot, augurs wasm lazy-load) so the offline app stays lean on medium PCs. | https://github.com/filipsobol/sonda |
| `react-scan` | library | yes | Detect the unnecessary re-renders in the 6-tab ForecastScreen (AnimatedNumber remounts, slider-driven cascades) and verify lazy-mounted tabs no longer compute when hidden. | https://github.com/aidenybai/react-scan |
| `pyodide build / loadPackage tooling (self-host)` | cli | yes | Download Pyodide runtime + statsmodels/scipy/pandas wheels at build time into public/pyodide so the advanced tier works with zero runtime network; verify with an offline smoke test. | https://pyodide.org/en/stable/usage/loading-packages.html |
| `binaryen wasm-opt` | cli | yes | Shrink/SIMD-optimize the augurs (or vendored arima) .wasm at build time (10-30% smaller, faster) before shipping it as a bundled offline asset. | https://github.com/WebAssembly/binaryen |
| `knip + dependency-cruiser` | cli | yes | Enforce that forecast core stays dependency-free/pure and that UI->core->worker layering has no forbidden edges; flag dead synthetic-data code once the DuckDB pipeline lands. | https://github.com/webpro-nl/knip |

---

# forecast-intelligence — Deep Improvement Plan (offline time-series forecasting)

## 0. Executive summary

The feature is in better shape than most: there is a genuinely clean, **pure, deterministic, dependency-free forecast engine** (`core/forecast-engine.ts`) implementing additive seasonal decomposition + Holt's linear trend, with backtesting (MAE/RMSE/MAPE), robust-MAD residual anomaly detection, and CI bands that widen as σ·√h. The `ForecastPanel` component is well-structured and accessible. The architecture *intends* a tiered model: pure-TS instant result, upgraded by a Pyodide/statsmodels Holt-Winters fit, with an on-device LLM narrative.

However there are **two showstopper offline bugs** and a set of **performance/architecture problems**:

1. **Offline-fatal:** the Pyodide worker loads its runtime from `https://cdn.jsdelivr.net` and installs statsmodels via `micropip` from PyPI — both require the internet. With no network the entire "advanced" tier silently fails every time. The code even mis-loads statsmodels (uses `micropip.install` instead of `loadPackage`) and carries an outdated comment claiming statsmodels has no Pyodide wheel.
2. **No real data pipeline:** the screen is wired to `generateHistoricalData()` synthetic data with render-time `Math.random()`, not to DuckDB/Arrow. The forecaster never touches real datasets and the random calls defeat memoization and make forecasts non-deterministic.
3. **Monolith + eager compute:** `ForecastScreen.tsx` is 1994 lines, one client component, six tabs, all mounted and computing (six ECharts instances) regardless of which tab is visible.

The right move is **consolidation + hardening**, not a rewrite: keep the excellent pure engine, fix the offline Pyodide packaging, add a worker boundary, swap the hot-path chart to **uPlot**, introduce **augurs (Grafana's Rust/WASM toolkit)** as a maintained advanced tier that does not need Python at all, feed it from **DuckDB→Arrow**, and persist scenarios with **Dexie**.

---

## 1. Current implementation (with file references)

### 1.1 Files
- `src/app/dashboard/forecast/page.tsx` — server component, renders `<ForecastScreen/>` under `<Suspense>` with a skeleton. Fine.
- `src/features/forecast-intelligence/core/forecast-engine.ts` (542 lines) — the pure engine. **High quality.** Exports `forecastSeries`, `backtest`, `scoreForecast`, `detectResidualAnomalies`, `seasonalIndices`, `normalizeSeries`, plus types.
- `src/features/forecast-intelligence/core/forecast-pyodide.ts` (313 lines) — async "upgrade" using statsmodels `ExponentialSmoothing`, falling back to a sklearn linear trend (`linearTrendSklearn` from `@/platform/ai/pyodide-ml`), shaped to the same `ForecastResult`.
- `src/features/forecast-intelligence/components/forecast-panel.tsx` (582 lines) — the reusable panel: horizon control, ECharts line+band+anomaly chart, MAE/RMSE/MAPE strip, anomaly callout, and an AI narrative via `useAI().generateStructured` with a Zod schema.
- `src/features/forecast-intelligence/screens/ForecastScreen.tsx` (1994 lines) — the dashboard: six tabs (Tomorrow's Forecast, Forecast Intelligence, Revenue Simulator, Pattern Detector, Risk Assessment, Scenarios). Uses `linearForecast` (`@/platform/ai/insights`), `simple-statistics`, and `ForecastPanel`.
- Worker infra: `src/platform/python-sandbox/core/index.ts` (postMessage client) → `src/workers/python-sandbox.worker.ts` (Pyodide host) → precompiled to `public/workers/python-sandbox.worker.js`.

### 1.2 The engine (forecast-engine.ts) — what's good
- Deterministic, no `Date.now()`/randomness, pure functions → trivially unit-testable, safe in any context (server/worker/client).
- Graceful degradation: n=0 → empty; n=1 → flat; constant series → flat; series shorter than `2·m` → drops seasonality and falls back to pure Holt.
- Holt seed is deterministic (trend = mean first difference), good.
- Robust anomaly scale: `mad·1.4826` with stdDev fallback (lines 487-491).
- Backtest holds out ~20% (capped at horizon), refits on the prefix (lines 397-431). Honest.

**Engine weaknesses (correctness/stats, not perf):**
- CI multiplier is a literal `1.96` default and also doubles as the anomaly z-threshold `k` (`opts.ci` used in `detectResidualAnomalies`). These are conceptually different (interval coverage vs outlier sensitivity) and should be decoupled.
- `σ·√h` error growth is a random-walk approximation; for a *trend* model the true predictive variance is larger and h-dependent in a more complex way. Acceptable heuristic, but document it and consider proper ETS prediction intervals when augurs/statsmodels is available.
- Seasonality is fixed additive with a single period `m`. No multiplicative option, no multi-seasonal (e.g. weekly+yearly) support. `seasonalIndices` uses a coarse OLS detrend then phase-mean — reasonable but biased for strong trends.

### 1.3 ForecastScreen — what it does and how
- `generateHistoricalData()` (line 52) builds 30 days of synthetic telecom KPIs using `Math.random()` at module load (line 133 `const HISTORICAL = generateHistoricalData()`).
- `TomorrowForecastTab` (line 179) calls `linearForecast(volumes,7)` etc. (simple linear regression from `insights.ts`), computes a crude CI as `±1.5·stdVolume`, builds an ECharts option in a `useMemo`.
- Other tabs build **more** synthetic data at render: `channelForecasts` with `Math.random()` (line 230), `extendedData` 90-day generator with noise (line 990), `channelRisks` with random volatility/trend (line 1320). All re-randomize on every render.
- The "Intelligence" tab embeds the real `ForecastPanel` fed by `volumeSeries`/`revenueSeries` memoized from `HISTORICAL` (lines 1900-1905).

### 1.4 ForecastPanel data flow
- `baseResult = useMemo(forecastSeries(series,{horizon,seasonLength}), [series,horizon,seasonLength])` — synchronous pure fit.
- A `useEffect` (line 105) launches `forecastSeriesPyodide(...)`, sets `computingOffline`, and replaces the result if a non-null Pyodide result returns.
- `result = pyResult ?? baseResult`; chart option memoized on `result`.
- AI narrative via `ai.generateStructured(..., NarrativeSchema)` with AbortController. Good pattern.

---

## 2. Performance bottlenecks and exact fixes

### 2.1 Monolithic eager screen → split + lazy-mount tabs
**Problem:** all six tabs and their ECharts instances mount and compute on first paint. On a 4-core/8GB machine, six canvas charts + six `useMemo` option builders + synthetic generators is needless main-thread work, and the route bundle ships every chart config at once.

**Fix:** split each tab into its own file and lazy-mount only the active tab. Keep ECharts imports per-tab so unused tabs are not in the initial chunk.

```tsx
// screens/ForecastScreen.tsx (skeleton after refactor)
const TAB_COMPONENTS: Record<TabId, React.LazyExoticComponent<React.FC>> = {
  forecast:     lazy(() => import("../tabs/TomorrowForecastTab")),
  intelligence: lazy(() => import("../tabs/IntelligenceTab")),
  simulator:    lazy(() => import("../tabs/RevenueSimulatorTab")),
  patterns:     lazy(() => import("../tabs/PatternDetectorTab")),
  risk:         lazy(() => import("../tabs/RiskAssessmentTab")),
  scenarios:    lazy(() => import("../tabs/ScenariosTab")),
};

export function ForecastScreen() {
  const [tab, setTab] = useState<TabId>("forecast");
  const Active = TAB_COMPONENTS[tab];
  return (
    <>
      <TabBar tabs={TABS} active={tab} onChange={setTab} />
      <Suspense fallback={<TabSkeleton />}>
        <Active key={tab} />  {/* only the active tab mounts/computes */}
      </Suspense>
    </>
  );
}
```

This alone removes ~5/6 of the chart + compute cost on load and shrinks the initial route chunk substantially (verify with `@next/bundle-analyzer`).

### 2.2 Remove render-time randomness; make data deterministic and memo-stable
**Problem:** `Math.random()` in `generateHistoricalData`, `channelForecasts`, `extendedData`, `channelRisks` runs during render → new arrays each render → `useMemo` on derived values is partially defeated, charts re-option, and forecasts are non-reproducible (a forecasting feature must be deterministic for the same inputs).

**Fix (interim, while synthetic):** seed a deterministic PRNG once and memoize the dataset at module scope, never in render.

```ts
// lib/seeded-rng.ts — mulberry32, tiny + deterministic
export function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```
```ts
const rng = mulberry32(20260611);
export const HISTORICAL = buildHistorical(rng); // computed once, stable
```
All per-tab synthetic builders must take `rng` (or precomputed constants) instead of calling `Math.random()` in render. **End state:** delete these generators entirely once real DuckDB data feeds the screen (§4).

### 2.3 Offload heavy fits to a worker (Comlink)
**Problem:** `forecastSeries` + `backtest` + `detectResidualAnomalies` run synchronously in `ForecastPanel`'s `useMemo` on the main thread. At 30 points this is microseconds; at 10k–100k points (real datasets) the Holt loop, sort-based medians, and backtest refit will jank the UI. The Pyodide path is already off-thread, but the *pure* path is not.

**Fix:** a single typed `forecast.worker` behind Comlink that runs the pure engine and (lazily) the augurs WASM tier. Keep a tiny synchronous fast-path for short series (≤ ~500 points) so the panel stays instant, and offload only when large.

```ts
// workers/forecast.worker.ts
import * as Comlink from "comlink";
import { forecastSeries } from "@/features/forecast-intelligence/core/forecast-engine";
import type { ForecastOptions, SeriesPoint } from "@/features/forecast-intelligence/core/forecast-engine";

let augurs: typeof import("@bsull/augurs") | null = null; // lazy

const api = {
  pure(series: SeriesPoint[], opts: ForecastOptions) {
    return forecastSeries(series, opts);          // pure, deterministic
  },
  async advanced(series: SeriesPoint[], opts: ForecastOptions) {
    augurs ??= await import("@bsull/augurs");      // wasm loaded once, offline
    await augurs.default();                        // init wasm (bundled asset)
    const y = Float64Array.from(series.map(p => p.value));
    const ets = augurs.ets(opts.seasonLength ?? 1);
    ets.fit(y);
    const out = ets.predict(opts.horizon ?? 7, (opts.ci ?? 1.96) > 0 ? 0.95 : undefined);
    return mapAugursToForecastResult(series, out, opts); // same ForecastResult shape
  },
};
export type ForecastWorkerApi = typeof api;
Comlink.expose(api);
```
```ts
// core/forecast-client.ts
import * as Comlink from "comlink";
import type { ForecastWorkerApi } from "@/workers/forecast.worker";
let proxy: Comlink.Remote<ForecastWorkerApi> | null = null;
export function getForecastWorker() {
  if (!proxy) {
    const w = new Worker(new URL("@/workers/forecast.worker", import.meta.url), { type: "module" });
    proxy = Comlink.wrap<ForecastWorkerApi>(w);
  }
  return proxy;
}
```
Panel usage with a size threshold and request-cancellation:
```tsx
const SYNC_LIMIT = 500;
const baseResult = useMemo<ForecastResult | null>(
  () => (series.length <= SYNC_LIMIT ? forecastSeries(series, { horizon, seasonLength }) : null),
  [series, horizon, seasonLength],
);
const [bigResult, setBigResult] = useState<ForecastResult | null>(null);
useEffect(() => {
  if (series.length <= SYNC_LIMIT) { setBigResult(null); return; }
  let live = true;
  getForecastWorker().pure(series, { horizon, seasonLength }).then(r => { if (live) setBigResult(r); });
  return () => { live = false; };
}, [series, horizon, seasonLength]);
const result = pyResult ?? bigResult ?? baseResult ?? EMPTY;
```

### 2.4 Swap the hot-path chart from ECharts to uPlot
**Problem:** the primary line/band/anomaly chart is the most-rendered surface (re-renders on every horizon toggle and during the Pyodide upgrade). ECharts costs ~70% CPU / ~85MB on streaming updates; uPlot costs ~10% / ~12MB and draws 166k points in ~25ms. Keep ECharts for the heatmap/scatter/gauge tabs (its strengths) but move the core forecast chart to uPlot.

```tsx
// components/ForecastChart.tsx
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

export function ForecastChart({ result, height = 320 }: { result: ForecastResult; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);

  const data = useMemo<uPlot.AlignedData>(() => {
    const xs: number[] = [], hist: (number|null)[] = [], fc: (number|null)[] = [], lo: (number|null)[] = [], hi: (number|null)[] = [];
    const H = result.history.length;
    result.history.forEach((p, i) => { xs.push(toTs(p.date)); hist.push(p.value); fc.push(i === H-1 ? p.value : null); lo.push(null); hi.push(null); });
    result.forecast.forEach((p) => { xs.push(toTs(p.date)); hist.push(null); fc.push(p.value); lo.push(p.lower); hi.push(p.upper); });
    return [xs, hist, fc, lo, hi];
  }, [result]);

  useEffect(() => {
    if (!ref.current) return;
    const opts: uPlot.Options = {
      width: ref.current.clientWidth, height,
      series: [
        {},
        { label: "History",  stroke: "var(--atlas-accent)", width: 2 },
        { label: "Forecast", stroke: "#f97316", width: 2, dash: [6,4] },
        { label: "CI lower", stroke: "transparent", fill: "rgba(99,102,241,0.14)", band: true },
        { label: "CI upper", stroke: "transparent", fill: "rgba(99,102,241,0.14)", band: true },
      ],
      bands: [{ series: [4, 3] }], // shade between upper(4) and lower(3)
    };
    plot.current = new uPlot(opts, data, ref.current);
    return () => plot.current?.destroy();
  }, []);                       // create once
  useEffect(() => { plot.current?.setData(data); }, [data]); // cheap incremental updates
  // ResizeObserver -> plot.setSize for responsiveness
  return <div ref={ref} role="img" aria-label="Forecast with confidence band" />;
}
```
For very large real series, uPlot will stay at 60fps where six ECharts canvases would not. Anomaly markers: add a points-only series for anomaly indices, or draw them via a `hooks.draw` overlay.

### 2.5 Debounce + cache the Pyodide/advanced upgrade
**Problem:** `ForecastPanel`'s effect re-launches the advanced fit on *every* horizon/season change (line 105-126). Pyodide boot + statsmodels load is heavy and runs again on a simple `7d→14d` toggle.

**Fixes:**
- Decouple horizon from the fit: fit the model **once** per `(series, seasonLength)`, then extend the forecast to `horizon` cheaply (the model state is horizon-independent; only the projection length changes). For augurs/statsmodels, re-`predict(horizon)` without re-`fit`.
- Debounce horizon changes by ~250ms.
- Cache the fitted model + result by a stable key (hash of series + season) in a `Map` (session) and in **Dexie** (persistent), so re-opening the panel is instant offline.

```ts
const key = `${seasonLength}:${hashSeries(series)}`;
const cached = modelCache.get(key) ?? await dexie.forecasts.get(key);
```

### 2.6 Kill AnimatedNumber remount thrash
**Problem:** `AnimatedNumber` (line 139) uses `key={Math.round(value)}` so motion/react unmounts+remounts and runs enter/exit on every integer change — expensive during slider drags.

**Fix:** animate the *value*, not the element identity, with a spring/tween on a ref, or use the project's `number-ticker` primitive. No key churn.
```tsx
const mv = useSpring(0, { stiffness: 120, damping: 20 });
useEffect(() => { mv.set(value); }, [value]);
return <motion.span>{useTransform(mv, v => format(v))}</motion.span>;
```

### 2.7 Tree-shake stats imports
`import * as ss from "simple-statistics"` (ForecastScreen line 17) pulls the namespace. Use named imports (`import { sampleStandardDeviation, linearRegression } from "simple-statistics"`) so the bundler can drop unused functions. Same for any `@stdlib` usage — import the specific submodule packages.

---

## 3. Offline gaps and how to close them

### 3.1 SHOWSTOPPER — Pyodide runtime + packages over the network
`src/workers/python-sandbox.worker.ts`:
- line 48: `const PYODIDE_CDN = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/"`
- `self.importScripts(`${PYODIDE_CDN}pyodide.js`)` and `loadPyodide({ indexURL: PYODIDE_CDN })`
- line 265: `micropip.install(msg.packages)` (statsmodels/pandas/numpy) → PyPI/jsDelivr at runtime.

**Close it:**
1. **Self-host the Pyodide runtime.** Add a build step that downloads the Pyodide v0.26.4 dist (`pyodide.js`, `pyodide.asm.wasm`, `python_stdlib.zip`, `pyodide-lock.json`, and the wheel files) into `public/pyodide/`. Point the worker at a local URL:
```ts
const PYODIDE_BASE = "/pyodide/"; // bundled, offline
self.importScripts(`${PYODIDE_BASE}pyodide.js`);
pyodide = await loadPyodide({ indexURL: PYODIDE_BASE });
```
2. **Load statsmodels via `loadPackage`, not micropip.** statsmodels (with numpy/scipy/pandas) ships as a **prebuilt Pyodide wheel** (search confirms statsmodels 0.13.x in Pyodide). The current code's comment ("statsmodels often isn't a prebuilt pyodide wheel") and `micropip.install(["statsmodels",...])` are wrong for the offline case. Replace with:
```ts
await py.loadPackage(["numpy", "scipy", "pandas", "statsmodels"]); // resolves from local indexURL
```
Reserve `micropip` strictly for pure-Python wheels you also bundle and reference by local URL (`emfs://` or `/pyodide/wheels/...`), never PyPI.
3. **Fail loudly with an offline-aware message** and fall back to the pure engine / augurs tier when the local runtime is absent, instead of the current generic "Check your network connection".

### 3.2 Prefer augurs (WASM) over Pyodide for the advanced tier
Pyodide is 6–30MB and heavyweight. **augurs** (grafana/augurs, Apache-2.0) is a Rust→WASM time-series toolkit with **AutoETS, MSTL, Prophet, MAD/DBSCAN outliers, changepoint detection** and **JS bindings via WASM** — a ~1–2MB lazy worker asset, fully offline, no Python. Recommendation:
- **Tier 1 (instant, pure-TS):** existing engine for ≤ a few hundred points.
- **Tier 2 (advanced, default upgrade):** augurs ETS/MSTL in the forecast worker — maintained, lighter than Pyodide, gives proper ETS prediction intervals and multi-seasonal decomposition. Replaces the stale `arima` dependency the radar flags.
- **Tier 3 (power user, opt-in):** self-hosted Pyodide + statsmodels for SARIMAX/STL parity, cached once in OPFS.

This makes the default advanced path **lighter and more reliable offline** than the current Python-only design.

### 3.3 No real data pipeline (synthetic only)
The feature must consume real on-device data. Bucket/aggregate in DuckDB SQL and stream Arrow to the worker:
```sql
-- run in DuckDB main process; stream result as Arrow
SELECT time_bucket(INTERVAL '1 day', ts) AS date, SUM(amount) AS value
FROM read_parquet('cache/txns.parquet')
WHERE channel = $1
GROUP BY 1 ORDER BY 1;
```
Map the Arrow result to `SeriesPoint[]` (zero-copy where possible) and feed `ForecastPanel`/worker. Delete `generateHistoricalData` and the per-tab random builders once this lands.

### 3.4 No persistence
Scenarios (`SavedScenario[]`), forecast snapshots, fitted models, and the Pyodide/augurs model cache are all in-memory. Add **Dexie** tables (`scenarios`, `forecasts`, `models`) and persist on save; call `navigator.storage.persist()` at app start. Large model blobs (Pyodide wheels cache, augurs wasm) belong in OPFS, small records in IndexedDB/Dexie.

### 3.5 Hardcoded chart colors
ECharts/uPlot colors are literal hex (`#1e293b`, `#3b82f6`...). Drive them from the design tokens (`var(--atlas-...)`) so theming/contrast stay consistent and accessible offline.

---

## 4. Better architecture & implementation (step by step)

### 4.1 Target module layout
```
src/features/forecast-intelligence/
  core/
    forecast-engine.ts        # pure tier-1 (keep, harden CI/anomaly decoupling)
    forecast-augurs.ts        # tier-2 augurs WASM adapter -> ForecastResult
    forecast-pyodide.ts       # tier-3, self-hosted Pyodide (fix loader)
    forecast-client.ts        # Comlink proxy to forecast.worker
    types.ts                  # shared ForecastResult/SeriesPoint/options
  data/
    series-from-duckdb.ts     # SQL bucket/aggregate -> SeriesPoint[] (Arrow)
    forecast-db.ts            # Dexie: scenarios / forecasts / models
  components/
    forecast-panel.tsx        # orchestrates tiers, AI narrative (keep)
    ForecastChart.tsx         # uPlot hot-path chart (new)
  tabs/                       # one file per tab, lazy-mounted
    TomorrowForecastTab.tsx ... ScenariosTab.tsx
  screens/ForecastScreen.tsx  # thin shell: tab bar + Suspense + lazy tab
  workers (shared): src/workers/forecast.worker.ts
```

### 4.2 Unified tiered orchestration
```ts
// core/forecast-client.ts
export async function runForecast(
  series: SeriesPoint[], opts: ForecastOptions, tier: "pure"|"advanced"|"python",
  onProgress?: (s: string) => void,
): Promise<ForecastResult> {
  if (series.length < 2) return EMPTY;
  if (series.length <= 500 && tier === "pure") return forecastSeries(series, opts); // sync, instant
  const w = getForecastWorker();
  if (tier === "python") {
    const py = await forecastSeriesPyodide(series, opts, onProgress); // self-hosted
    if (py) return py;
  }
  if (tier !== "pure") {
    try { return await w.advanced(series, opts); } catch { /* fall through */ }
  }
  return w.pure(series, opts);
}
```

### 4.3 Panel: instant pure + background advanced + persisted cache
```tsx
const pure = useMemo(
  () => (series.length <= 500 ? forecastSeries(series, { horizon, seasonLength }) : null),
  [series, horizon, seasonLength],
);
const [adv, setAdv] = useState<ForecastResult | null>(null);
const debHorizon = useDebounced(horizon, 250);
useEffect(() => {
  let live = true;
  const key = cacheKey(series, seasonLength, debHorizon);
  (async () => {
    const cached = await db.forecasts.get(key);
    if (cached && live) { setAdv(cached.result); return; }
    const r = await runForecast(series, { horizon: debHorizon, seasonLength }, "advanced", setPyStatus);
    if (live) { setAdv(r); db.forecasts.put({ key, result: r, ts: Date.now() }); }
  })();
  return () => { live = false; };
}, [series, seasonLength, debHorizon]);
const result = adv ?? pure ?? EMPTY;
```

### 4.4 Decouple CI coverage from anomaly sensitivity (engine fix)
Add separate options and proper quantiles via `@stdlib/stats`:
```ts
interface ForecastOptions {
  horizon?: number; seasonLength?: number; alpha?: number; beta?: number;
  ciLevel?: number;       // e.g. 0.95 -> z via stdlib quantile, not literal 1.96
  anomalyZ?: number;      // separate outlier threshold, default ~3.0
}
const z = normalQuantile(0.5 + ciLevel/2); // stdlib: replaces hardcoded 1.96
```

### 4.5 augurs adapter (tier-2)
```ts
// core/forecast-augurs.ts (runs inside the worker)
import init, { ets, mstl } from "@bsull/augurs";
let ready: Promise<unknown> | null = null;
export async function forecastAugurs(series: SeriesPoint[], opts: Required<ForecastOptions>): Promise<ForecastResult> {
  ready ??= init();                       // wasm from bundled asset, offline
  await ready;
  const y = Float64Array.from(series.map(p => p.value));
  const model = opts.seasonLength > 1 ? mstl([opts.seasonLength], { ets: true }) : ets(opts.seasonLength);
  model.fit(y);
  const f = model.predict(opts.horizon, opts.ciLevel); // {point, lower, upper}
  return mapAugurs(series, f, opts);      // build fitted/residuals/anomalies/metrics in TS
}
```

---

## 5. Recommended dependencies

| Dep | ~Stars | Maintenance | License | Offline | Why | URL |
|---|---|---|---|---|---|---|
| @grafana/augurs (augurs-js) | ~1.2k | Very active (Grafana) | Apache-2.0/MIT | yes (bundled wasm) | Maintained Rust→WASM ETS/MSTL/Prophet + MAD/DBSCAN outliers + changepoints; replaces stale `arima`, lighter than Pyodide | https://github.com/grafana/augurs |
| uPlot | ~10.2k | Active | MIT | yes | 60fps dense time-series at ~10% CPU/12MB; hot-path forecast chart | https://github.com/leeoniya/uPlot |
| @stdlib/stats | ~5.8k | Active | Apache-2.0 | yes | Correct z/t quantiles, ESD/GESD criticals, prediction-interval math; decouple CI from anomaly z | https://github.com/stdlib-js/stats |
| simple-statistics | ~3.5k | Active (v7.9) | ISC | yes | Already used; keep for base stats, switch to named imports | https://github.com/simple-statistics/simple-statistics |
| comlink | ~12.6k | Active | Apache-2.0 | yes | Typed proxy for the forecast worker; matches app conventions | https://github.com/GoogleChromeLabs/comlink |
| dexie | ~13k | Active | Apache-2.0 | yes | Persist scenarios/forecasts/models offline (IndexedDB) | https://github.com/dexie/Dexie.js |
| Pyodide (self-hosted) | ~13k | Active | MPL-2.0 | partial | Opt-in tier-3 statsmodels SARIMAX/STL; `loadPackage` not micropip; offline only after bundling | https://github.com/pyodide/pyodide |
| arima (zemlyansky) | ~150 | STALE (2021) | Apache-2.0 | yes | HOLD: fallback only if augurs lacks SARIMAX parity; vendor+pin+`.destroy()` | https://github.com/zemlyansky/arima |

**Reject/avoid:** `@mlc-ai/web-llm` for any forecast compute (irrelevant, WebGPU-only); `danfojs` (heavy TF.js bundle); any cloud forecasting API. Keep ECharts only for heatmap/scatter/gauge tabs, not the hot line chart.

---

## 6. CLIs & tools (all offline)

- **vitest + tinybench** — deterministic engine tests (golden fixtures) and microbenchmarks for `forecastSeries`/`backtest`/anomaly detection to set per-call budgets (e.g. ≤ 5ms for 10k points in-worker).
- **@next/bundle-analyzer + sonda + size-limit** — enforce per-route and per-worker byte budgets; confirm ECharts is no longer in the initial forecast chunk and augurs wasm is lazy.
- **react-scan** — prove hidden tabs don't render and `AnimatedNumber` no longer remounts during slider drags.
- **Pyodide self-host download script** (build step) — pull runtime + statsmodels/scipy/pandas/numpy wheels into `public/pyodide/`; offline smoke test that disables the network and asserts tier-3 still fits.
- **binaryen `wasm-opt`** — shrink/SIMD-optimize the augurs (or vendored arima) `.wasm` at build time.
- **knip + dependency-cruiser** — keep `core/forecast-engine.ts` dependency-free, enforce UI→core→worker layering, and flag dead synthetic-data code once DuckDB feeds the screen.

---

## 7. Phased task list

### P1 — Offline correctness + biggest perf wins (must-do)
1. **Self-host Pyodide**: bundle runtime+wheels into `public/pyodide/`, repoint `PYODIDE_BASE` (worker line 48), switch statsmodels load to `py.loadPackage([...])`, remove the wrong `micropip.install` of statsmodels and the outdated comment. Add offline-aware fallback messaging.
2. **Determinism**: replace all render-time `Math.random()` with a seeded PRNG computed once at module scope (`generateHistoricalData`, `channelForecasts`, `extendedData`, `channelRisks`).
3. **Lazy-mount tabs**: split `ForecastScreen.tsx` into `tabs/*` and `lazy()` + `Suspense` so only the active tab computes/renders.
4. **uPlot hot chart**: replace the primary line/band/anomaly chart in `ForecastPanel` with `ForecastChart.tsx` (uPlot); keep ECharts for heatmap/scatter/gauge.
5. **Decouple Pyodide upgrade from horizon** (re-predict, don't re-fit) and **debounce** horizon changes.

### P2 — Architecture + advanced tier (high value)
6. **Forecast worker (Comlink)**: move pure-engine fits for large series off the main thread; add the **augurs** tier-2 adapter as the default advanced path (replacing reliance on Python for the common case).
7. **Real data pipeline**: `series-from-duckdb.ts` (SQL bucket/aggregate → Arrow → SeriesPoint[]); wire the Intelligence tab and remove synthetic generators.
8. **Persistence (Dexie)**: `scenarios`/`forecasts`/`models` tables; persist saved scenarios and cache fitted models; `navigator.storage.persist()` at startup.
9. **Engine hardening**: decouple `ciLevel` (z via `@stdlib/stats`) from `anomalyZ`; document/refine prediction-interval growth.

### P3 — Polish + budgets
10. **Tree-shake stats imports**; theme charts from design tokens; replace `AnimatedNumber` key-remount with value animation.
11. **wasm-opt** the augurs/arima wasm; size-limit budgets per route/worker in CI.
12. **Tests/benches**: golden-fixture engine tests, tinybench budgets, react-scan render audit, offline smoke test for all three tiers (network disabled).

---

## 8. Risks & notes
- augurs JS bindings are younger than statsmodels; validate ETS/MSTL parity against the pure engine and statsmodels on fixtures before making it the default tier-2. Keep the pure engine as the always-available floor.
- Self-hosting Pyodide adds ~6–30MB to the app distribution; gate tier-3 behind an explicit "advanced model" toggle and lazy-load.
- uPlot is single-maintainer (radar flag); it is mature and tiny, but pin the version and keep the ECharts path available as a fallback renderer.
- Decoupling CI from anomaly z is a behavior change — update tests and any snapshotted narrative prompts accordingly.