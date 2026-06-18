# Roadmap

# data-navigator — Phased Roadmap

Every phase must pass two universal gates before it is considered done:
- **OFFLINE GATE:** the full test profile runs on a **cold profile with the network disabled** (airplane-mode CI). No request leaves the machine; no model/WASM/tile/font is fetched at runtime. `navigator.storage.persist()` returns true; `estimate()` is surfaced.
- **PERF GATE (medium-end profile: 4-core CPU throttle, no WebGPU, 8GB):** no single main-thread task >50ms during steady interaction; route INP p75 ≤200ms; per-route initial JS within budget; per-worker bundle within budget. Measured with `@lhci/cli` vs localhost and `react-scan`/`tinybench`.

---

## Phase 1 — Foundations: kill the two systemic defects (offline AI + main-thread)

**Theme:** make the app actually offline and actually responsive. Nothing user-facing is "new"; this is consolidation + hardening that unblocks every later feature.

**Initiatives → features**
1. **Unified AI runtime (provider registry).** Add `node-llama-cpp` (Lane A, Electron utility). Repin `@huggingface/transformers` (Lane B): `allowRemoteModels=false`, `localModelPath`, self-hosted `wasmPaths`, CPU/q8-first, in a Comlink worker. Demote `@mlc-ai/web-llm` to opportunistic. Rewire **ai-analysis, ai-briefing, channel-monitor, reconciliation, deep-analytics** off web-llm and **agent-canvas, data-formulator** off CDN transformers.js. Drive structured output via GBNF/JSON-schema grammars from existing Zod schemas (`zod-to-json-schema`).
2. **Model bundling + preflight.** Build-time prefetch of `all-MiniLM-L6-v2` (int8) + a Qwen2.5-1.5B/0.5B GGUF into `public/models`/`models/`; self-host onnxruntime-web simd+threaded `.wasm`; "download-now-while-online" Setup affordance with integrity/size check.
3. **Worker-boundary + Arrow IPC.** Stand up `inference.worker`, `analysis.worker`, `chart.worker` (OffscreenCanvas). Replace JSON row IPC with Arrow IPC (`apache-arrow`) on the hottest paths (**data-browser, telecom, ai-analysis, parsed-data**). Move the agent-canvas LLM and ai-analysis `runAnalysis` off the main thread.
4. **Store discipline.** Selector slices + `useShallow` + persist version/migrate across **dashboard-shell, channel-monitor, collab-hub, agent-canvas, ux-innovations**. Add `react-scan`, `size-limit` per-worker budgets, airplane-mode CI smoke test.
5. **Security/offline shell.** Enforce `@electron/fuses` in prod; COOP/COEP on custom protocol; harden better-auth for the custom protocol; persist `BETTER_AUTH_SECRET`.

**Acceptance criteria**
- OFFLINE: every AI feature produces real output on a cold, network-disabled, **no-WebGPU** machine (no "WebGPU not supported", no CDN fetch). Structured outputs (ChartSpec/SQL/plans/anomaly JSON) are schema-valid ≥99% via grammar (no regex repair loop).
- PERF: LLM token generation never blocks paint (streaming via worker); agent-canvas/ai-analysis main-thread block <50ms during a run; INP p75 ≤200ms on the AI routes.
- Airplane-mode CI green; per-worker budgets enforced (inference worker bundle gated).

---

## Phase 2 — Engine truth + render performance (real data, fast charts/grids)

**Theme:** every feature reads the real DuckDB engine via SQL pushdown + Arrow, renders dense data cheaply, and persists durably.

**Initiatives → features**
1. **SQL pushdown + sampling.** `SUMMARIZE`/`histogram()`/`approx_*`/`CORR`/`QUANTILE_CONT` and `USING SAMPLE reservoir(n)` replace per-column query fan-out and biased `LIMIT` sampling in **parsed-data, ai-analysis, data-import, data-transform, deep-analytics**. Keyset pagination + cached `COUNT(*)` in **data-browser**. Materialize telecom enriched+daily tables; wire the rollup. Abort tokens across IPC.
2. **De-synthesize features.** Wire **analytics-theater, channel-monitor, deep-analytics, geo-analysis, forecast-intelligence, ux-innovations** to real datasets (remove Math.random() module-load data). Real stats: `@stdlib/stats` + `simple-statistics` named imports + `ml-kmeans`/`ml-dbscan`/`ml-matrix` in `analysis.worker` (seeded RNG) replacing fake p-values/clustering/attribution.
3. **Dense viz + virtualization.** Add `uPlot` for all dense time-series; tree-shake ECharts to `echarts/core` + OffscreenCanvas; virtualize every list/grid/tree (**data-browser, data-transform, parsed-data, telecom, history, collab-hub, reconciliation, folders, ux-innovations**). `canvas-confetti` replaces `react-confetti-boom`.
4. **CSV/import correctness.** `uDSV` worker parse + `chardet` encoding → `read_csv(encoding=,store_rejects=)`; rejected-rows quality panel; OPFS draft autosave.
5. **Durable persistence.** `dexie` replaces localStorage-as-DB across **channel-monitor, collab-hub, history, achievements, report-studio, settings**; column profiles/recipes/history keyed by `datasetId+updatedAt`; TanStack Query OPFS persister for instant cold-load (**dashboard-home, telecom**). Settings actually applied + Zod-validated.
6. **Forecasting tier.** Trial `@grafana/augurs` (worker) for ETS/MSTL/changepoint; fix Pyodide to self-host runtime+wheels via `loadPackage` (no CDN/micropip) as opt-in advanced tier.

**Acceptance criteria**
- OFFLINE: no feature renders Math.random() data; all numbers trace to a DuckDB query. Pyodide advanced tier works network-disabled. Latin-1/UTF-16 CSV imports without mojibake.
- PERF: profiling a 50-col dataset is ≤2 scans (not 80-200 queries); deep-page navigation on 1M rows is O(1) (keyset), memory flat. Dense charts (166k pts) render <30ms / ~10% CPU (uPlot). Wide grids window at 60fps; zero row re-render on cell edit/hover (`react-scan`). Per-route budgets pass (ECharts no longer in initial chunks).
- `tinybench`: SQL-pushdown beats JS, Arrow beats JSON, keyset beats OFFSET — recorded in CI.

---

## Phase 3 — Offline geo, collaboration, export, lineage, polish

**Theme:** complete the remaining offline-violating / stubbed surfaces and finish dev-quality gating.

**Initiatives → features**
1. **Offline geospatial (geo-analysis).** Replace Leaflet+OSM-raster with `maplibre-gl` + `pmtiles` + `@protomaps/basemaps` (self-hosted glyphs/sprites) + `deck.gl` + `@geoarrow/deck.gl-layers` (DuckDB Arrow) + `supercluster` (worker) + `h3-js`; `tippecanoe` build-step to tile user data; DuckDB spatial extension bundled. Remove the remote tile URL.
2. **LAN collaboration (collab-hub, collaboration).** Add missing `ws`/`lib0`/`y-protocols`/`y-indexeddb`; embed `@hocuspocus/server` in Electron main as the LAN hub; `bonjour-service` mDNS discovery; move annotations/approvals/audit/chat/presence to Yjs + Awareness (stop BroadcastChannel/localStorage silos). Real cross-machine sync offline.
3. **Export pipeline (report-studio, reconciliation, telecom, ai-briefing, history, data-browser).** `pdfmake` + streaming `exceljs` + `docx`/`pptxgenjs` in `export.worker`/main via `fs:saveDialog`; embed real chart PNGs (`renderToSVGString` → `@resvg/resvg-wasm`); bundle fonts; local logo picker; `html-to-image` replaces `html2canvas`; demote jspdf-autotable.
4. **Lineage + SQL (lineage, data-transform).** `@xyflow/react` renderer + `elkjs` worker layout (drop `dagre`); `node-sql-parser` / DuckDB `json_serialize_sql` for real column lineage + offline SQL validation/safe quoting; Monaco schema-aware completion.
5. **Onboarding/help (help, ux-innovations).** `driver.js` replaces `react-joyride` (fix non-existent route targets); `fuse.js`/`cmdk` ranked search; persist onboarding to Dexie; remove external GitHub URL.
6. **Dev-quality gating.** `knip` strict (delete flagged dead code: history diff/widgets, lineage hand-rolled, deactivated ml.worker, ux mock data); `dependency-cruiser` layer rules; `sonda`/`@lhci/cli`/`web-vitals`/`binaryen` wired; a11y gates on new palette/tree/tour/settings.

**Acceptance criteria**
- OFFLINE: map renders from bundled PMTiles + self-hosted glyphs/sprites with network disabled (no blank tiles, no CDN). Two machines on a LAN sync presence/comments/approvals via the embedded hub with zero internet; `npm run lan-server` boots (ws/lib0 present). All exports generate offline with embedded fonts + real chart images; saved via native dialog.
- PERF: geo iGPU budget ~100k-500k points smooth, 1M+ via GeoArrow without JS arrays; lineage graph renders viewport-culled (large graphs <50ms layout in worker); export of 10k+ rows runs in worker with main-thread block <50ms (no OOM). Help/tour bundle shrinks after `react-joyride`→`driver.js` (size-limit proves the drop).
- `knip`/`dependency-cruiser`/a11y/airplane-mode all green in CI; per-route and per-worker budgets enforced project-wide.

---

## Cross-phase budgets (enforced from Phase 1, tightened each phase)

| Budget | Target (medium-end) |
|---|---|
| Main-thread task (steady interaction) | <50ms |
| Route INP p75 | ≤200ms |
| LLM/stats/parse/export on main thread | 0 (workers/main-process only) |
| DuckDB result transport | Arrow IPC (no JSON Record[]) |
| Column profiling scans (50 cols) | ≤2 |
| Pagination (1M rows, deep page) | O(1) keyset, flat memory |
| Dense chart (166k pts) | <30ms, ~10% CPU (uPlot) |
| Per-worker bundle | size-limit gated (inference/chart/parse/vector) |
| Runtime network requests | 0 (airplane-mode CI) |
| Model/WASM/tile/font source | bundled or OPFS-cached-once, pinned |