# Master Dependency Catalog

_124 entries deduped across the tech radar and all feature plans. Status: `add` = new, `replace-existing` = swap, `already-installed-unused` = wire up what you have, `trial`/`hold`._

## add (33)

| Package | Category | Stars | License | Offline | Used by | Why |
|---|---|---|---|---|---|---|
| `ml-kmeans` | clustering | ~0.1k (mljs) | MIT | yes | deep-analytics, ai-analysis | Maintained k-means++ (centroids/withinss/convergence) replacing hand-rolled main-thread k-means; run in analysis.worker, seeded RNG. |
| `ml-dbscan` | clustering | ~1.3k (mljs) | MIT | yes | deep-analytics, ai-analysis | Maintained DBSCAN with noise/outlier labels for non-spherical clusters where k is unknown. |
| `apache-arrow` | columnar-interchange | ~14k | Apache-2.0 | yes | data-browser, telecom, parsed-data, ai-analysis, data-formulator, data-transform, reconciliation, deep-analytics, geo-analysis | Make explicit. Arrow IPC transferable ArrayBuffers replace JSON Record[] across IPC/worker — eliminates row↔object transposition, the dominant large-result cost. |
| `@hocuspocus/server` | crdt-hub | ~2.4k | MIT | yes | collab-hub, collaboration | Maintained Yjs backend embeddable in Electron main as the reliable LAN hub (awareness multiplexing + SQLite/file persistence). Replaces hand-rolled lan-server.mjs. |
| `y-indexeddb` | crdt-persistence | ~0.25k | MIT | yes | collab-hub, collaboration, agent-canvas | Durable async per-room CRDT log with whenStored; survives reload offline. Closes the #1 collab persistence gap. |
| `y-protocols` | crdt-presence | y-crdt org | MIT | yes | collab-hub, collaboration, history | Native Awareness presence (auto-prunes) replacing hand-rolled heartbeat/prune. Missing from package.json though lan-server.mjs imports it. |
| `@lhci/cli` | dev-audit | ~7k | Apache-2.0 | yes | dev-tooling | INP/CLS/TBT audits + assertions vs localhost/bundled Chromium, fully offline (no cloud upload). |
| `react-scan` | dev-render | ~21.4k | MIT | yes | dev-tooling | Detect whole-tree re-render storms (selector-less stores, per-row motion). Install as dep, not CDN. |
| `sonda` | dev-treemap | ~0.77k | MIT | yes | dev-tooling | Universal offline bundle treemap complementing @next/bundle-analyzer (verify chart/LLM libs are code-split into worker chunks). |
| `binaryen (wasm-opt)` | dev-wasm | ~7k | Apache-2.0 | yes | dev-tooling | Build-time shrink/SIMD-enable self-hosted/vendored .wasm (onnxruntime-web, augurs, h3) 10-30%. |
| `chardet` | encoding-detection | ~0.3k | MIT | yes | data-import, csv-parser | Main-process encoding detection over first ~64KB → feed DuckDB read_csv(encoding=). Today the encoding dropdown is dead UI; Latin-1/UTF-16 mojibake. |
| `lib0` | encoding-utils | ~0.4k | MIT | yes | collaboration | lan-server.mjs imports lib0/encoding/decoding/map directly; declare it (transitive today). |
| `html-to-image` | export-dom-image | ~7.2k | MIT | yes | analytics-theater, report-studio | SVG foreignObject DOM→image with better modern CSS; replaces stale html2canvas. Prefer native chart getDataURL for charts. |
| `pdfmake` | export-pdf | ~12.3k | MIT | yes | ai-briefing, report-studio, reconciliation, telecom, data-browser, history | Data-driven PDF, auto-paginates large tables; bundles its own fonts (consistent offline). Replaces jspdf-autotable for big tables. |
| `canvas-confetti` | fx | ~12.6k | ISC | yes | ux-innovations | useWorker:true OffscreenCanvas confetti off the main thread; replaces react-confetti-boom. |
| `@protomaps/basemaps` | geo-basemap | ~0.68k | BSD-3 / CC0 / ODbL | yes | geo-analysis | Downloadable token-free basemap PMTiles + MapLibre styles; self-host glyphs+sprites locally. |
| `tippecanoe (felt)` | geo-build-cli | ~1.5k | BSD-2-Clause | yes | geo-analysis | Build-time/Electron-main CLI: GeoJSON/CSV→PMTiles to tile user data locally. Not bundled into renderer. |
| `supercluster` | geo-clustering | ~2.3k | ISC | yes | geo-analysis | Zoom-reactive point clustering (millions in ms) — run in a Web Worker. |
| `deck.gl` | geo-gpu-overlay | ~14.2k | MIT | yes | geo-analysis | WebGL2 GPU overlay (MapboxOverlay interleaved) for 100k-1M+ points; auto fallback matches no-WebGPU target. |
| `@geoarrow/deck.gl-layers` | geo-gpu-overlay | ~0.16k | MIT | yes | geo-analysis | Zero-copy Arrow→GPU layers for 3M-10M points fed from DuckDB Arrow output. |
| `h3-js` | geo-index | ~1.1k | Apache-2.0 | yes | geo-analysis | Hexagonal spatial index for fixed-res hexbin density + spatial joins (analytics, complementary to clustering UX). |
| `maplibre-gl` | geo-renderer | ~10.8k | BSD-3-Clause | yes | geo-analysis | Only mature token-free fully-offline WebGL2 vector renderer; replaces leaflet+remote OSM tiles. BYO local tiles/style. |
| `pmtiles` | geo-tiles | ~2.9k | BSD-3-Clause | yes | geo-analysis | Single-file tile archive via addProtocol range reads — zero tile server. The mechanism that makes the map offline. |
| `elkjs` | graph-layout | ~2.2k | EPL-2.0 | yes | lineage | Worker-side layered DAG layout (elk-worker.js) replacing custom computeLayout and deprecated dagre. |
| `onnxruntime-node` | inference-backend | ~18k | MIT | yes | ai-analysis, deep-analytics, forecast-intelligence, reconciliation | Native CPU tabular ML inference (XGBoost/LightGBM/sklearn→ONNX-ML) in main; no 20MB wasm payload. |
| `bonjour-service` | lan-discovery | ~0.4k | MIT | yes | collab-hub, collaboration | mDNS advertise/discover so peers auto-find the hub; replaces 254-host subnet fetch scan. Main-process only. |
| `ws` | lan-server-runtime | ~22k | MIT | yes | collaboration | lan-server.mjs imports WebSocketServer but ws is absent from package.json — the LAN hub crashes without it. |
| `node-llama-cpp` | local-llm-electron | ~2.1k | MIT | yes | agent-canvas, ai-analysis, ai-briefing, channel-monitor, reconciliation, data-formulator, deep-analytics, data-transform | PRIMARY generative engine (v3.18.1, MIT). GGUF q4 + GPU/CPU + GBNF/JSON-schema grammars = guaranteed-valid structured JSON; kills parseJSON repair loops; works with no WebGPU. |
| `driver.js` | onboarding-tour | ~25.7k | MIT | yes | help, ux-innovations | ~5kB zero-dep spotlight/coach-marks; replaces react-joyride's wrong-API dead code + ~10 transitive deps. |
| `scrollama` | scrollytelling | ~5.9k | MIT | yes | analytics-theater | IntersectionObserver scrollytelling (~3kB) driving presentation scene steps; wrap in a local hook. |
| `node-sql-parser` | sql-parse | ~1k | Apache-2.0 | yes | data-transform, lineage | Offline SQL→AST validation + safe identifier quoting; real column lineage. In Electron prefer DuckDB json_serialize_sql for dialect accuracy. |
| `@stdlib/stats` | stats | ~5.8k | Apache-2.0 | yes | ai-analysis, ai-briefing, channel-monitor, deep-analytics, forecast-intelligence, dashboard-home, parsed-data | Modular per-fn: rigorous distributions/p-values, ANOVA, GESD criticals for real S-H-ESD anomaly + hypothesis tests. Replaces fake bucketed p-values. |
| `uPlot` | viz-timeseries | ~10k | MIT | yes | telecom, forecast-intelligence, ai-analysis, channel-monitor, dashboard-home, data-browser, parsed-data, data-formulator, geo-analysis, csv-parser | Dense time-series at ~10% CPU vs ECharts ~70% (v1.6.32, MIT). The biggest medium-PC chart lever. Add alongside ECharts. |

## replace-existing (3)

| Package | Category | Stars | License | Offline | Used by | Why |
|---|---|---|---|---|---|---|
| `react-confetti-boom` | fx | ~0.2k | MIT | yes | ux-innovations | Installed. Main-thread canvas burst competes with reconciliation. Replace with canvas-confetti. |
| `@huggingface/transformers` | local-llm-browser | ~14-16k | Apache-2.0 | yes | agent-canvas, data-formulator, ai-analysis, ai-briefing, channel-monitor, reconciliation | Installed but CDN-dependent config. REPLACE config: allowRemoteModels=false + localModelPath + pinned wasmPaths, run in Web Worker, CPU/q8-first. Primary browser embeddings + LLM fallback. |
| `react-joyride` | onboarding-tour | ~6.9k | MIT | yes | help, ux-innovations | Installed but used with wrong v3 API (dead) and tour targets non-existent routes. Replace with driver.js. |

## already-installed-unused (43)

| Package | Category | Stars | License | Offline | Used by | Why |
|---|---|---|---|---|---|---|
| `better-auth (+@better-auth/electron)` | auth | ~28.6k | MIT | yes | settings, dashboard-shell | Installed. Harden for offline Electron: trustedOrigins for custom protocol, persist generated BETTER_AUTH_SECRET in userData, Account settings tab. |
| `cmdk` | command-palette | ~12.7k | MIT | yes | dashboard-shell, help | Installed but the dashboard palette is hand-rolled. Accessible ARIA combobox; expose help/search/'start tour'. |
| `p-queue` | concurrency | ~4k | MIT | yes | data-engine, ai-analysis, data-import | Installed. Bound concurrent DuckDB/worker round-trips (replace sequential await loops with controlled parallelism). |
| `yjs` | crdt | ~19-22k | MIT | yes | collab-hub, collaboration, agent-canvas, history | Installed. ~18kB no-WASM CRDT substrate. Make annotations/approvals/audit/chat Y.Doc instead of localStorage/BroadcastChannel silos. |
| `y-websocket` | crdt-transport | y-crdt org | MIT | partial | collab-hub, collaboration | Installed (v3). Client provider against a LAN/localhost hub you ship (fully offline). |
| `papaparse` | csv-parse | ~13k | MIT | yes | csv-parser | Installed. Keep as mature fallback but MUST switch to worker:true + step/chunk streaming (today synchronous main-thread). |
| `@duckdb/node-api (DuckDB Neo)` | data-engine | ~31k core / 1.5k neo | MIT | yes | data-engine, csv-parser, data-import, data-transform, data-browser, parsed-data, telecom, ai-analysis, data-formulator, reconciliation, lineage, deep-analytics, geo-analysis | PRIMARY native engine (installed 1.5.3-r.3). Push SUMMARIZE/histogram/approx_*/CORR/FULL OUTER JOIN/keyset; emit Arrow IPC; use read_csv encoding+store_rejects; materialize telecom enriched+daily tables. |
| `@tanstack/react-query` | data-fetching | ~44k | MIT | yes | dashboard-home, data-browser, telecom | Installed. Dedup/cancellation by queryKey + keepPreviousData fixes overlapping-query races; add IndexedDB/OPFS persister for instant cold-load. |
| `date-fns` | date | ~34k | MIT | yes | channel-monitor, history, telecom | Installed. Tree-shaken memoizable formatters replacing per-row inline new Date().toLocaleString() Intl allocations. |
| `axe-core (+@axe-core/playwright, vitest-axe)` | dev-a11y | ~7.2k | MPL-2.0 | yes | dev-tooling, help, settings, folders, dashboard-shell, collaboration | Installed. Gate a11y on new cmdk palette, tree, tour, settings controls (current custom switch/select fail). |
| `tinybench` | dev-bench | ~1k | MIT | yes | dev-tooling | Via Vitest bench. Lock hot-path budgets: SQL-pushdown vs JS, Arrow vs JSON, keyset vs OFFSET, worker vs main. |
| `size-limit` | dev-budget | ~(v12) | MIT | yes | dev-tooling | Installed. @size-limit/preset-app + time plugin; per-route AND per-worker budgets (inference/chart/parse/vector). |
| `knip` | dev-deadcode | ~11.5k | ISC | yes | dev-tooling | Installed. Enable strict/CI gating + plugin coverage; flags history/lineage/ux dead code. |
| `dependency-cruiser` | dev-graph | ~6.1k | MIT | yes | dev-tooling | Installed. Forbidden-dep/orphan/circular rules; enforce renderer→data-access layer, UI→core→worker. |
| `@dnd-kit/*` | drag-drop | ~17.2k | MIT | yes | dashboard-home, folders, report-studio | Installed. Mount lazily only in edit-layout mode; don't permanently wrap heavy chart subtrees in SortableContext. |
| `@monaco-editor/react` | editor | ~4k | MIT | yes | data-transform, data-browser | Installed. SQL editor surface; lazy-load and add the completion provider. |
| `docx` | export-docx | ~5.8k | MIT | yes | ai-briefing, report-studio | Installed. Programmatic DOCX; embed real chart PNGs via ImageRun; bundle a font; move Packer into export.worker. |
| `pptxgenjs` | export-pptx | ~5.6k | MIT | yes | analytics-theater, report-studio | Installed. Offline PPTX; feed real aggregated data + chart PNG + speaker notes; write via fs:saveDialog from worker/main. |
| `exceljs` | export-xlsx | ~15.4k | MIT | yes | data-browser, reconciliation, report-studio, history, telecom, data-import | Installed. Streaming WorkbookWriter (~6× less memory than SheetJS) fed full filtered results from DuckDB; move to worker/main. |
| `@xyflow/react` | graph-renderer | ~28k | MIT | yes | lineage, agent-canvas, data-transform | Installed (used by agent-canvas). Replace lineage's hand-rolled SVG canvas/pan-zoom (viewport culling, minimap); memoize nodes/edges per perf guidance. |
| `@tanstack/react-table` | grid-model | ~26k | MIT | yes | data-browser, csv-parser, data-transform, reconciliation, telecom | Installed. Headless sort/filter/visibility/pinning model; removes hundreds of lines of hand-rolled column state. |
| `arquero` | in-memory-reshape | ~1.4k | BSD-3-Clause | yes | csv-parser, data-transform, data-formulator | Installed. Small/medium dplyr-style reshaping + structured filter without a SQL round-trip; replaces hand-rolled regex applyFilter. |
| `onnxruntime-web` | inference-backend | ~18-19k | MIT | yes | agent-canvas, data-formulator, ai-analysis, voice | Installed. Backend under transformers.js/sherpa. Self-host the simd+threaded .wasm locally and pin env.backends.onnx.wasm.wasmPaths. |
| `react-grid-layout` | layout | ~22.2k | MIT | yes | dashboard-home, agent-canvas | Installed (v2). Documented re-render lag with many items — debounce layout writes, virtualize off-screen widgets; use only if resize/breakpoints needed. |
| `react-resizable-panels` | layout | ~5.2k | MIT | yes | dashboard-shell | Installed. Make the AI panel a dockable/resizable/persistable region instead of a fixed overlay. |
| `ml-matrix` | linear-algebra | ~1.3k | MIT | yes | deep-analytics, ai-analysis | Installed but unused in features. SVD/pseudo-inverse for real regression-based attribution (replaces hardcoded ATTRIBUTION_FACTORS). |
| `dexie` | persistence | ~13k | Apache-2.0 | yes | ai-analysis, analytics-theater, channel-monitor, collab-hub, data-browser, data-import, data-transform, deep-analytics, forecast-intelligence, history, parsed-data, reconciliation, report-studio, ux-innovations, help, settings | Installed. Durable IndexedDB small-record store replacing every localStorage-as-database use (synchronous, ~5MB capped, blocking). |
| `better-sqlite3` | persistence-native | ~6k | MIT | yes | collab-hub, data-store, reconciliation | Installed. Host for sqlite-vec + Hocuspocus persistence + app catalog in Electron main. |
| `zod (+ zod-to-json-schema)` | schema-validation | ~39k | MIT | yes | agent-canvas, data-formulator, ai-briefing, settings, reconciliation, data-import | Installed (v4). Drive node-llama-cpp JSON-schema grammars + validate/coerce; replaces regex JSON extraction and Number() casts. |
| `fuse.js` | search | ~18-20k | Apache-2.0 | yes | help, folders, dashboard-shell, data-formulator, reconciliation | Installed but help/folders use naive .includes. Ranked typo-tolerant search; build index once from flat list. |
| `@electron/fuses` | security | electron org | MIT | yes | security, packaging | Installed (devDep). Enforce in prod: disable RunAsNode/CLI/inspector. |
| `zustand` | state | ~49k | MIT | yes | dashboard-shell, channel-monitor, collab-hub, agent-canvas, ux-innovations, settings, deep-analytics, data-store | Installed. Enforce selector slices + useShallow + persist version/migrate/partialize; ≥5.0.10. Root fix for whole-tree re-render storms. |
| `simple-statistics` | stats | ~3.5k | ISC | yes | ai-analysis, ai-briefing, channel-monitor, deep-analytics, forecast-intelligence, telecom, parsed-data, reconciliation, csv-parser, dashboard-home | Installed (v7.9). Base stats; use named imports (not import * as ss). Use its real tTest/correlation, not fake helpers. |
| `serwist (+@serwist/next)` | sw-offline | ~1.5k | MIT | yes | offline-shell | Installed. Workbox-fork SW precaching/offline shell for Next. Pin versions (bus-factor). |
| `sqlite-vec` | vector-search | ~6k | Apache-2.0/MIT | yes | data-formulator, agent-canvas, reconciliation, ai-analysis | Installed. Persistent per-dataset embeddings in better-sqlite3 (main); closes the in-memory rebuild-every-session vector gap. |
| `@lancedb/lancedb` | vector-search | ~7k | Apache-2.0 | yes | data-formulator | Installed. Arrow-native embedded vector DB that memory-maps >RAM corpora; TRIAL escalation when sqlite-vec is outgrown. |
| `@tanstack/react-virtual` | virtualization | ~5.5k | MIT | yes | data-browser, data-transform, parsed-data, telecom, history, collab-hub, collaboration, channel-monitor, lineage, reconciliation, folders, ux-innovations, dashboard-shell, agent-canvas, ai-analysis, csv-parser | Installed, widely unused. Virtualize every list/grid/tree/timeline; extend to column virtualization for wide tables. |
| `echarts` | viz-general | ~63k | Apache-2.0 | yes | agent-canvas, ai-analysis, analytics-theater, dashboard-home, data-browser, deep-analytics, folders, geo-analysis, parsed-data, telecom, report-studio, forecast-intelligence, data-formulator, channel-monitor | Installed (v6). Tree-shake to echarts/core + explicit registration; render via OffscreenCanvas in chart.worker; export via getDataURL/renderToSVGString. |
| `vega / vega-lite (+ react-vega)` | viz-grammar | ~11k / 4.9k | BSD-3-Clause | yes | data-formulator | Installed. Canonical grammar the data-formulator LLM emits + accessible/ad-hoc charts ≤~1-10k marks (force Canvas >1k). |
| `sherpa-onnx-node` | voice-stt-tts | ~5k | Apache-2.0 | yes | ai-briefing, analytics-theater, voice | Installed. Native offline STT (multilingual Whisper-small, EN/FR/AR) + TTS (Kokoro for English, Supertonic 3 for French/Arabic, picked by language). Wire read-aloud here instead of window.speechSynthesis. |
| `kokoro-js` | voice-tts | n/a (HF model) | Apache-2.0 | yes | ai-briefing, analytics-theater | Installed. On-device neural TTS, sentence-chunked WAV; replaces OS speechSynthesis for narration. |
| `@ricky0123/vad-web` | voice-vad | ~1.5k | MIT | yes | voice | Installed (Silero VAD weights present). Voice activity detection in a worker for voice-driven flows. |
| `comlink` | worker-rpc | ~12.6k | Apache-2.0 | yes | agent-canvas, ai-analysis, ai-briefing, channel-monitor, data-formulator, data-browser, csv-parser, deep-analytics, geo-analysis, lineage, parsed-data, telecom, report-studio, analytics-theater | Installed. ~1.1kB Proxy RPC — the worker-boundary glue for every inference/stats/parse/chart/layout/export worker. |

## trial (26)

| Package | Category | Stars | License | Offline | Used by | Why |
|---|---|---|---|---|---|---|
| `glide-data-grid` | canvas-grid | ~5.2k | MIT | yes | data-browser, telecom, reconciliation | Canvas grid for 100k-millions rows / streaming beyond TanStack DOM comfort. Plateaued (v6 Feb 2024) — verify maintenance before commit. |
| `echarts-wordcloud` | chart-extension | ~2k | Apache-2.0 | yes | analytics-theater | Real spiral-packed word cloud reusing the ECharts instance; replaces the flexbox fake. Pin (slow release cadence). |
| `@uwdata/flechette` | columnar-interchange | ~0.1k | BSD-3-Clause | yes | data-browser, csv-parser, parsed-data, telecom | ~14kB gz Arrow reader vs apache-arrow ~43kB for renderer read-only decode; backs Arquero v8. Shrinks renderer Arrow footprint. |
| `y-webrtc` | crdt-transport | y-crdt org | MIT | partial | collaboration | Secondary P2P mesh + locally-bundled signaling; less reliable on locked-down LANs. Hub is the default. |
| `uDSV` | csv-parse | ~0.75k | MIT | yes | csv-parser | ~2× PapaParse, ~5kB, streaming + typed schema inference for the paste/preview + OPFS-stream path. Niche (uPlot author) — pin. |
| `@duckdb/duckdb-wasm` | data-engine | ~2-31k | MIT | yes | csv-parser, data-import, data-browser | Browser-only fallback engine IF a non-Electron web build ships. Lazy in worker, COI bundle needs COOP/COEP. Not the desktop path. |
| `unlighthouse / madge` | dev-audit | ~4.6k / 10.1k | MIT | partial | dev-tooling | OPTIONAL multi-route Lighthouse crawl / quick --circular dep graphs for docs. |
| `web-vitals` | dev-rum | ~8.5k | Apache-2.0 | yes | dev-tooling | Capture CLS/LCP/INP locally → log to IndexedDB/OPFS (no endpoint). Offline RUM. |
| `umap-js` | dim-reduction | ~0.4k | Apache-2.0 | yes | deep-analytics | OPTIONAL deterministic (seeded) >2D→2D projection so cluster scatter uses all features; run in worker. |
| `monaco-sql-languages` | editor-intellisense | ~0.3k | MIT | partial | data-transform | Schema-aware offline SQL completion for Monaco driven by the dataset catalog. Pin to one monaco version (niche). |
| `docx-templates` | export-docx | ~1.1k | MIT | yes | report-studio | OPTIONAL merge data into a designed .docx template (IMAGE/loops); complements docx. |
| `@cantoo/pdf-lib` | export-pdf | ~0.34k | MIT | yes | report-studio | Maintained pdf-lib fork (SVG+fontkit2) for merge/stamp/form-fill + embed bundled logo/font. Pin (low bus-factor). Original pdf-lib stale. |
| `@resvg/resvg-wasm` | export-rasterize | ~3.3k | MPL-2.0 | yes | report-studio, analytics-theater | Offline SVG→PNG (no headless Chrome / native canvas) to embed ECharts renderToSVGString output in DOCX/PPTX/XLSX. Verify license fit (tool/runtime). |
| `@grafana/augurs` | forecasting | ~1.2k | Apache-2.0/MIT | yes | forecast-intelligence, ai-analysis, telecom | Rust/WASM AutoETS/MSTL/Prophet/changepoint/MAD; modern, maintained replacement for stale arima, lighter than Pyodide. Community-maintained — pin + worker-isolate. |
| `Pyodide (+statsmodels/Prophet)` | forecasting-advanced | ~13k | MPL-2.0 | partial | forecast-intelligence | Opt-in advanced tier ONLY after self-hosting runtime+wheels in OPFS and loading via py.loadPackage (not micropip). Today loads from jsdelivr CDN — dead offline. |
| `@tanstack/react-form` | forms | ~5k | MIT | yes | settings | Headless type-safe forms with Zod adapter for validated settings/account forms (field-level validation, fewer re-renders). Pick one of this / react-hook-form. |
| `react-map-gl` | geo-react | ~8.4k | MIT | yes | geo-analysis | OPTIONAL declarative React wrapper for MapLibre + deck.gl useControl. |
| `tinykeys` | keyboard | ~3.4k | MIT | yes | dashboard-shell | ~650B declarative keybinding map centralizing scattered keydown effects (Cmd+K/\/B). |
| `d3-cloud` | layout-algorithm | ~3.8k | BSD-3-Clause | yes | analytics-theater | Precise word-cloud layout in a worker if full font/rotation control is needed (alternative to echarts-wordcloud). |
| `wllama` | local-llm-browser | ~1.1k | MIT | yes | agent-canvas, ai-briefing | llama.cpp WASM CPU-only in-renderer LLM fallback (threads need COOP/COEP). Alternative to web-llm where browser-lane generation is needed. |
| `streamdown` | markdown-stream | ~3k | Apache-2.0 | yes | ai-briefing | Streaming markdown renderer that handles incomplete tokens + memoizes per-block; replaces split('\n\n').map(<p>) full re-render. Self-host. |
| `hyparquet` | parquet-preview | ~0.6-1.3k | MIT | yes | data-import, csv-parser | Pure-JS zero-dep ~10-20kB Parquet metadata+sample preview without booting DuckDB-WASM in the browser path. |
| `tinybase` | reactive-store | ~5.8k | MIT | yes | collaboration | Lighter reactive local store with pluggable IndexedDB/OPFS persistence; alternative to @tanstack/db. |
| `@leeoniya/uFuzzy` | search | ~2.9k | MIT | yes | folders, history | ~7.5kB faster/lighter fuzzy alt to fuse.js at very large N (tens of thousands of records). |
| `@headless-tree/react` | tree-component | ~0.85k | MIT | yes | folders | Headless flat-node tree (virtualization-ready, ARIA tree, keyboard, async, drag-drop) replacing recursive O(n^2) TreeNode. |
| `usearch` | vector-search | ~2.5k | Apache-2.0 | yes | data-formulator | In-worker ANN index for sub-ms KNN in a browser-only build (sqlite-vec is the Electron default). |

## hold (19)

| Package | Category | Stars | License | Offline | Used by | Why |
|---|---|---|---|---|---|---|
| `density-clustering` | clustering | ~0.2k | MIT | yes | deep-analytics | Installed but dormant. Use only if OPTICS is required; prefer mljs for new code. |
| `loro-crdt` | crdt | ~5.7k | MIT | yes | collab-hub, collaboration | WATCH only. Faster + git-like history + EphemeralStore presence (~180kB WASM). Adopt only if history/branching becomes primary. |
| `@automerge/automerge` | crdt | ~6.3k | MIT | yes | collaboration | Heavier/slower (~320kB WASM); only if time-travel history is the primary need. Yjs wins today. |
| `html2canvas` | export-dom-image | ~31.9k | MIT | yes | report-studio | Installed but stale/experimental (v1.4.1 Jan 2022). Fallback for canvas/WebGL captures only. |
| `jspdf (+autotable)` | export-pdf | ~31.2k / 3.4k | MIT | yes | report-studio, telecom | Installed. Keep jspdf for light/quick PDFs only; jspdf-autotable HOLD (OOMs past ~2.5k rows) — use pdfmake for data tables. |
| `@react-pdf/renderer` | export-pdf | ~16.6k | MIT | yes |  | Avoid for large tabular exports (yoga-WASM + reconciler heavy). Small docs only. |
| `sheetjs (xlsx)` | export-xlsx | ~36.3k | Apache-2.0 | partial |  | In-memory only (OOM on big writes) + off public npm. Format breadth only; prefer exceljs. |
| `arima (zemlyansky)` | forecasting | ~0.1k | Apache-2.0/MIT | yes | ai-analysis, forecast-intelligence | Only drop-in JS ARIMA/SARIMA WASM but STALE. Vendor+pin+worker+.destroy() only if SARIMAX parity needed; prefer augurs. |
| `leaflet / react-leaflet` | geo-renderer | ~42k / 5k | BSD-2 / Hippocratic-ish | no | geo-analysis | Installed. Current impl fetches remote OSM raster tiles (offline violation) + default icon CDN URLs. Replace with MapLibre/PMTiles stack. |
| `dagre` | graph-layout | ~5k | MIT | yes | lineage | Installed but deprecated/unused. Remove in favor of elkjs. |
| `@mlc-ai/web-llm` | local-llm-browser | ~16-18k | Apache-2.0 | partial | ai-analysis, ai-briefing, channel-monitor, reconciliation, deep-analytics | Installed and currently PRIMARY — wrong: WebGPU-only, no CPU fallback, fails on medium/iGPU/Linux. Demote to opportunistic accelerator behind a capability flag; rewire all features off it. |
| `ollama (+ electron-ollama)` | local-llm-electron | ~150k+ | MIT | yes | ai-analysis, data-formulator, reconciliation | Documented power-user localhost escape hatch only (separate daemon, heavier). Never default; never a public endpoint fallback. |
| `@tanstack/db` | reactive-store | ~3.8k | MIT | partial | collaboration | Installed but BETA + sync-oriented. Not the offline source of truth; keep scoped/off the critical path. |
| `immer` | state-util | ~28k | MIT | yes | data-import, data-transform | Installed. Stop whole-array produce() per progress tick (full clone+re-render); update by id / use shallow patches. |
| `electricsql / @powersync/web / zero / convex` | sync-engine | ~8k / ~1k | Apache-2.0 / FSL-OSL | no |  | REJECTED. Server+Postgres/Mongo sync engines; violate offline-only. CRDTs (Yjs/Loro) are the cloudless primitive. |
| `react-arborist` | tree-component | ~3.6k | MIT | yes | folders | Batteries-included tree alternative (built-in virtualization). Heavier/opinionated; choose one of this / headless-tree. |
| `react-force-graph-2d` | viz-graph | ~1.8k | MIT | yes | geo-analysis | Installed. Full d3-force+canvas bundle for tiny node counts on main thread; prefer @xyflow/react (graphs) or deck.gl (geo arcs). |
| `echarts-for-react` | viz-react | ~4k | MIT | yes | agent-canvas, ai-analysis, dashboard-home, telecom | Installed. Pulls full echarts + re-creates options each render. Migrate heavy charts to OffscreenCanvas worker; keep only for trivial main-thread charts. |
| `recharts` | viz-react | ~24k | MIT | yes | dashboard-home | Installed. SVG-based; fine for small static charts but redundant with ECharts/uPlot. Rationalize by role; serialize <svg> for export, don't screenshot. |

