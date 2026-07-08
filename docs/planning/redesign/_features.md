# Data Navigator — Complete Feature Inventory & Audit

Audited: `D:\data-navigator` (Next.js 16 + Electron, offline-first telecom DailyTransactions analytics). 27 feature folders, 36 `page.tsx` route files under `src/app/dashboard/**`, 24 sidebar nav entries.

## Feature catalog

| Feature (`src/features/…`) | Description | Route | In nav? | Completeness | Duplicate-of / overlap |
|---|---|---|---|---|---|
| `telecom` (147 files, 25.5k LOC) | The core telecom DailyTransactions report engine: KPI/canal/analysis/grid/period/day/history/config tabs, column & status mapping, exports, LAN panel, AI agent panel | `/dashboard/telecom-report/*` (8 sub-routes) | Yes ("Telecom Report") | **Complete — flagship** | Overview shared with `dashboard-home`; grid duplicated by `/dashboard/browser`; export-panel overlaps `report-studio` |
| `data-formulator` (127 files, 39.8k LOC) | AI data workbench: NL→SQL canvas, manager-intent agents (briefing, investigation, scenario, signal radar), KPI foundry, RAG/vector search, MCP modal, full offline voice (VAD+Whisper STT+Kokoro/Piper TTS, Tunisian/FR/EN) | `/dashboard/data-formulator` | Yes ("Data Formulator") | **Complete — flagship, most ambitious** | Briefing agent overlaps `ai-briefing`; dashboard canvas overlaps `agent-canvas` |
| `agent-canvas` (11.9k LOC) | "A2UI" 4-panel IDE where an AI agent builds a dashboard live: react-grid-layout canvas, Monaco SQL IDE + DuckDB, xyflow agent DAG, narrative/trace panels | `/dashboard/agent-canvas` | Yes ("Agent Canvas", A2UI badge) | Real but experimental; needs local model setup | **Heavy overlap with `data-formulator`** (both AI-built dashboards) |
| `ai-analysis` (4.4k LOC) | Local statistical analysis: insights, anomalies, correlations, **forecast**, patterns, explain tabs over the active dataset (own stats lib + worker, report export) | `/dashboard/ai-analysis` | Yes ("AI Analysis") | Complete | Forecast tab duplicates `forecast-intelligence`; insights overlap `ai-briefing`/`deep-analytics` |
| `ai-briefing` (2.9k LOC) | LLM narrative briefings: Daily Briefing, Anomaly Report, Action Plan, Data Story tabs; Kokoro-82M offline TTS narration (`core/narrator.worker.ts`) | `/dashboard/ai-briefing` | Yes ("AI Intelligence Suite") | Complete (graceful fallback if model not downloaded) | Overlaps `data-formulator` briefing agent and `ai-analysis` insights |
| `analytics-theater` (3.0k LOC) | Scrollytelling presentation mode: scene registry (calendar heatmap, race, flow, hourly, word cloud, hierarchy, Gantt), LLM narration, PPTX/PDF export, theater persistence | `/dashboard/analytics-theater` | Yes ("Visual Theater") | Complete | Export overlaps `report-studio` (different use case — keep) |
| `channel-monitor` (3.4k LOC) | Live channel ops monitor: health grid, alert rules engine, alert timeline, SLA compliance, sound/notification config; IndexedDB history | `/dashboard/monitor` | Yes ("Operations Monitor", LIVE badge) | Complete, **but falls back to deterministic demo data** when no telecom table ("Demo data" badge in header) | None ("monitor" is just the route name) |
| `collab-hub` (3.0k LOC) | Team workspace: presence bar, sticky-note annotations on report sections, approval workflow, audit trail — Yjs CRDT + LAN | `/dashboard/collab-hub` | Yes ("Collaboration Hub") | Complete | **Duplicates `collaboration`** |
| `collaboration` (2.1k LOC) | Team workspace: room comments/replies/reactions, change feed, chat, audit, contribution charts — per-room Yjs doc + Awareness presence + LAN | `/dashboard/collaborative` | Yes ("Collaborative", hardcoded badge "3") | Complete | **Duplicates `collab-hub`** |
| `csv-parser` (2.3k LOC) | Standalone CSV parse workbench: dropzone/paste, delimiter & column-type config, filter expressions, rejects panel, profile, export, load-to-DuckDB (own worker) | `/dashboard/csv-parser` | **No** (linked only from Help cards) | Complete | Overlaps `data-import` (Upload) and `parsed-data` profiling |
| `dashboard-home` (1.6k LOC) | Landing screen, routes by dataset kind: empty state → import CTA; telecom → rich telecom OverviewTab; other → generic DuckDB SUMMARIZE overview | `/dashboard` | Yes ("Dashboard") | Complete | Telecom view reuses `telecom` OverviewTab (same UI as `/dashboard/telecom-report/overview`) |
| `dashboard-shell` (5.4k LOC) | App shell: sidebar (`nav/app-sidebar.tsx`), command palette, AI side panel, LAN access gate/dock/control center, boot, plus a runtime diagnostics screen | `/dashboard/dashboard-shell` (diagnostics) | **No** | Shell infra complete; diagnostics screen real | Contains **legacy duplicate sidebar** `components/sidebar-nav.tsx` (only stories reference it) |
| `data-browser` (4.5k LOC) | Generic dataset browser: virtualized grid, filter builder, SQL generation, saved filters/SQL, starred rows, CSV/JSON/XLSX export | `/dashboard/data-browser` | **No** | Complete | Overlaps `telecom` RawDataTab / `/dashboard/browser` / `parsed-data` |
| `data-import` (2.4k LOC) | The "Upload" pipeline: dropzone + Electron file dialog, batch import, encoding selection, telecom-column validation, import history | `/dashboard/upload` | Yes ("Upload") | Complete | Overlaps `csv-parser` |
| `data-transform` (3.1k LOC) | ETL pipeline builder: step cards (filter/select/derive/aggregate/join), AI recipe-from-NL, preview grid, CSV/XLSX export | `/dashboard/transform` | Yes ("Transform") | Complete (all "placeholder" hits are input attrs) | — |
| `deep-analytics` (3.5k LOC) | Statistical deep dives: cohort analysis, revenue attribution, k-means clusters (seeded worker), period comparison with Welch t-test | `/dashboard/deep-analytics` | Yes ("Deep Analytics") | Complete | Contains **dead second `ReconciliationWizard.tsx`** (unreferenced); insights overlap `ai-analysis` |
| `folders` (2.3k LOC) | Dataset catalog organizer: folder tree, tags, auto-organize, search, grid/list views, catalog PDF/XLSX export | `/dashboard/folders` | Yes ("Folders") | Complete | — |
| `forecast-intelligence` (4.2k LOC) | Predictive analytics: Tomorrow's Forecast, Intelligence, Revenue Simulator, Pattern Detector, Risk Assessment, Scenarios — real DuckDB pipeline + optional Pyodide sklearn | `/dashboard/forecast` | Yes ("Predictive Analytics") | Complete | `ai-analysis` forecast tab duplicates part of this |
| `geo-analysis` (2.8k LOC) | Spatial insights: MapLibre + offline PMTiles basemap, region list, channel heatmap, region pie, anomalies, AI insights, export | `/dashboard/geo-analysis` | Yes ("Geographic Analysis") | Complete (needs region column in data) | Does NOT use the shared geo cluster/hexbin worker (see hidden) |
| `help` (1.6k LOC) | Help center: fuzzy-searched feature cards, FAQ, shortcuts, tour launcher, feedback | `/dashboard/help` | Yes (footer) | Complete — but links to orphan routes & has a broken tour step | — |
| `history` (1.3k LOC) | Virtualized activity/version log with IndexedDB write-through mirror and export | `/dashboard/history` | Yes ("History") | Complete | Distinct from `/dashboard/telecom-report/history` (cached analyses) — naming collision only |
| `lineage` (2.4k LOC) | Data lineage: worker-built graph (ELK layout + node-sql-parser column lineage), xyflow graph, impact/columns tables | `/dashboard/lineage` | Yes ("Data Lineage") | Complete | Has its own ELK path; shared `layout.worker` ELK duplicates it |
| `parsed-data` (3.4k LOC) | Column profiler: one SUMMARIZE scan + worker post-process, virtualized column list, quality ring, per-column detail | `/dashboard/parsed` | Yes ("Parsed Data") | Complete | Overlaps `csv-parser` profile panel |
| `reconciliation` (2.8k LOC) | Reconciliation wizard: FULL OUTER JOIN diff of two datasets, variance surfacing, on-device AI hypotheses, immutable signed-off record, export | `/dashboard/reconciliation` | Yes ("Reconciliation") | Complete | Second (dead) wizard copy lives in `deep-analytics` |
| `report-studio` (3.7k LOC) | Executive report builder: 5 templates, PPTX/DOCX/PDF/XLSX worker exports, branding profiles, LLM narrative, presentation overlay | `/dashboard/report-studio` | Yes ("Report Studio", NEW badge) | Complete (seeded demo fallback when no dataset) | Overlaps `telecom` export-panel & theater export |
| `settings` (2.4k LOC) | Settings shell with lazy panels: appearance, data, performance, notifications, account, storage, shortcuts; drizzle write-through persistence | `/dashboard/settings` | Yes (footer) | Complete | — |
| `ux-innovations` (2.6k LOC) | Gamification + onboarding: telemetry-driven AchievementSystem (levels, toasts, confetti) + driver.js OnboardingTour | `/dashboard/ux-innovations` | **No** | Complete (real telemetry, not stub) | — |

Other routes: `/` (landing), `/login`, `/signup`; API routes only for auth + settings (`src/app/api/**`).

## Orphaned routes (page exists, NOT reachable from sidebar nav or command palette)

The command palette (`src/features/dashboard-shell/command/command-palette.tsx`) searches `ALL_ITEMS` from nav-config, so these are invisible there too:

1. **`/dashboard/browser`** — `src/app/dashboard/browser/page.tsx`. Inlines telecom `RawDataTab` against the fixed `TELECOM_TABLE_BASE` with hand-rolled fetchers (operators/regions swallowed with `.catch(() => {})`), bypassing `TelecomReportRuntimeProvider`. Strict, lesser duplicate of `/dashboard/telecom-report/grid`. Linked from Help feature card + a tour step.
2. **`/dashboard/csv-parser`** — full standalone parser workbench. Linked only from Help feature card (`src/features/help/data/help-content.ts:75`).
3. **`/dashboard/data-browser`** — generic 4.5k-LOC dataset browser. No inbound links at all.
4. **`/dashboard/dashboard-shell`** — shell runtime diagnostics (`shell-overview-screen.tsx`: engine, model, LAN, storage, layout state). No inbound links.
5. **`/dashboard/ux-innovations`** — achievements + onboarding. No inbound links (storage docs reference it in comments only).

## Dead nav links

1. **`/dashboard/charts`** — `nav-config.ts:297-303` ("Charts / Visualizations"). **No page directory exists** anywhere under `src/app/dashboard/charts`. Clicking it 404s.
2. **Broken tour step** — `src/features/help/data/tours.ts:77-78` targets `[href="/dashboard/browser"]` in the sidebar; no such sidebar element exists, so that tour step cannot anchor.
3. Cosmetic: nav item "Collaborative" carries a hardcoded badge `"3"` (`nav-config.ts:293`) — fake count.

## Duplicate clusters (keep / merge / delete)

1. **Collaboration: `collab-hub` vs `collaboration`** — both real, both Yjs/LAN-backed, both in nav with near-identical descriptions ("Team workspace & comments" vs "Team workspace"). `collab-hub` = presence + section annotations + approval workflow + audit; `collaboration` = room comments/chat/changes + contribution charts + audit. **Recommend: merge into one Collaboration feature** (collab-hub's approval/audit + collaboration's room comments/chat), keep one nav entry, delete the other route. `collaboration` has the cleaner CRDT substrate (`lib/room*`); `collab-hub` has the more report-specific workflow. Also note LAN UI exists in 3 more places (dashboard-shell `lan-control-center`/`lan-status-dock`/`lan-access-gate`, telecom `lan-collab-panel`) — acceptable as surfaces of one platform module (`src/platform/lan`).
2. **AI insight suite: `ai-analysis` vs `ai-briefing` vs `deep-analytics` (+ `data-formulator` agents, `telecom` ai-agent/deep-analysis panels)** — three nav entries with "AI/Brain" branding. They are technically distinct (deterministic stats vs LLM narrative vs heavy statistics) but the **`ai-analysis` forecast tab duplicates `forecast-intelligence`**, and `data-formulator`'s briefing agent duplicates `ai-briefing`. **Recommend: keep all three screens but (a) remove/redirect ai-analysis's forecast tab to `/dashboard/forecast`, (b) make `data-formulator` call the `ai-briefing` engine instead of its own, (c) unify nav labels** (two items both badged "AI" with Brain icons confuse discovery).
3. **Data grids: `data-browser` vs `/dashboard/browser` vs `telecom-report/grid` vs `parsed-data` vs `csv-parser` preview** — **Recommend: DELETE `/dashboard/browser`** (inferior duplicate of telecom grid); **keep `telecom-report/grid`** (most complete: runtime provider, paging, customer profile); **decide on `data-browser`**: it is the only generic any-dataset browser and is complete — either add to nav under Data or delete (4.5k LOC of hidden inventory is the worst option). `parsed-data` (profiling) is distinct — keep.
4. **Import: `data-import` (Upload) vs `csv-parser`** — both parse CSV → DuckDB. `data-import` is the wired pipeline (validation, history, batch, Electron dialogs); `csv-parser` adds manual delimiter/type/filter control. **Recommend: keep `data-import` as primary; merge `csv-parser` in as an "advanced parsing" mode or link it intentionally from Upload; do not leave it orphaned.**
5. **Dashboard builders: `agent-canvas` vs `data-formulator`** — both "AI builds a dashboard on a canvas". `data-formulator` is 3.3× larger and dramatically more complete (voice, RAG, KPI catalog, agents). **Recommend: fold agent-canvas's distinctive bits (agent DAG trace view, AG-UI event log) into data-formulator and delete or explicitly demote agent-canvas to an experiment; remove its nav entry if kept as a lab.**
6. **Reporting/export: `report-studio` vs `telecom` export-panel vs `analytics-theater` export** — `report-studio` is the generic branded export hub; telecom export-panel is in-context daily-report export; theater exports presentations. **Recommend: keep all three but route shared codegen through the common export worker (`src/platform/viz/export-client.ts`) — report-studio currently maintains its own `workers/export.worker.ts`.**
7. **Sidebars: `dashboard-shell/nav/app-sidebar.tsx` (live) vs `dashboard-shell/components/sidebar-nav.tsx` (legacy)** — the legacy one is referenced only by its own stories. **Recommend: delete `sidebar-nav.tsx` + stories.**
8. **Reconciliation wizards**: `reconciliation/components/ReconciliationWizard.tsx` (used) vs `deep-analytics/components/ReconciliationWizard.tsx` (**unreferenced — dead code**). **Recommend: delete the deep-analytics copy.**
9. **Overview duplication: `dashboard-home` vs `telecom-report/overview`** — same `OverviewTab` component rendered at both `/dashboard` and `/dashboard/telecom-report/overview`. Component reuse, not code dup — acceptable, but consider making `/dashboard` summarize + link rather than fully duplicate.

## Implemented-but-hidden capability

1. **Electron-native sherpa-onnx voice service — fully wired, ZERO consumers.** `electron/voice-service.ts` (Whisper-tiny STT + Kokoro TTS via `sherpa-onnx-node`), IPC handlers exposed in `electron/preload.ts` (`voice:transcribe`, `voice:speak`, `voice:preloadStt/Tts`, `voice:clearModels`), model dirs `public/models/sherpa/{stt,tts}`, download script `scripts/download-sherpa-models.ps1`, and a renderer bridge `voiceBridge()` in `src/platform/electron/electron-fs.ts:234` — but no feature ever calls transcribe/speak through it. The data-formulator voice stack uses web workers instead. This is the repo's kokoro/sherpa model weight payload with no UI path.
2. **`src/workers/ml.worker.ts`** — kMeansClustering, detectAnomalies, computeCorrelationMatrix, forecastTimeSeries, computePCA — **never imported anywhere** (deep-analytics ships its own `workers/analytics.worker.ts`). Dead capability.
3. **`src/workers/llm.worker.ts` + `src/hooks/use-llm-inference.ts`** — a complete transformers.js offline text-generation worker + React hook — **unused** (the live AI path is `src/platform/ai/provider` + llama.cpp adapter). Dead capability.
4. **Geo clustering/hexbinning in `src/workers/layout.worker.ts`** — `loadGeoPoints`/`getClusters` (supercluster) and `hexbin` (h3-js) are exported via `getLayoutProxy()` (`src/platform/viz/layout-client.ts`) but **no feature calls them**; `geo-analysis` renders region aggregates without point clustering. The `supercluster` dependency exists solely for this unused surface. (The worker's ELK DAG layout is also shadowed by lineage's own in-feature ELK worker.)
5. **Python sandbox** — `src/platform/python-sandbox/` + `src/workers/python-sandbox.worker.ts` + `public/workers/python-sandbox.worker.js` (Pyodide): consumed only by `forecast-intelligence/core/forecast-pyodide.ts` → `platform/ai/pyodide-ml.ts` (`linearTrendSklearn`). A general Python execution sandbox exposed for exactly one optional regression call — far more capability than UI.
6. **Browser voice stack (VAD + STT + TTS)** — `public/vad/silero_vad_v5.onnx` + worklet, `public/workers/voice-vad.worker.js`, `src/features/data-formulator/core/voice/*` (13 modules: capture, VAD service/worker, STT worker, TTS worker w/ Kokoro & Piper, command router, model cache/registry, debug store), `public/models/kokoro/onnx-community`. **It IS reachable — but only via the VoiceButton inside Data Formulator's command bar.** Nothing else (telecom report, briefing) uses voice input. Kokoro TTS is additionally used by `ai-briefing`'s narrator worker (read-aloud briefings).
7. **Orphan screens** (also listed above): `data-browser` (4.5k LOC), `csv-parser` (2.3k LOC), `ux-innovations` achievements/onboarding (2.6k LOC), `dashboard-shell` diagnostics — all real, all invisible from nav.

## Half-built / placeholder

- **`/dashboard/charts` nav item** — pure dead link; the only true "phantom feature".
- **`/dashboard/browser` route** — half-wired duplicate (no runtime provider, silent error swallowing, fixed table).
- **`channel-monitor`** — real engine, but renders a **deterministic demo dataset** (`lib/simulate.ts`) whenever no telecom DuckDB table is loaded; clearly badged "Demo data" vs "Live DuckDB".
- **`report-studio`** — seeded demo fallback (`lib/sample-data.ts`) when no dataset is registered; real path is `aggregateReportData`.
- **`agent-canvas`** — functional but experimental (A2UI); value depends on local model download; overlaps the more finished data-formulator.
- **Voice model registry** (`voice-model-registry.ts`) — includes `"planned"`/`"experimental"`/`"disabled"` statuses (e.g., Piper TTS), i.e., declared engines beyond what is fully shipped.
- **Dead code**: `deep-analytics/components/ReconciliationWizard.tsx`, `dashboard-shell/components/sidebar-nav.tsx`, `src/workers/ml.worker.ts`, `src/workers/llm.worker.ts` + `src/hooks/use-llm-inference.ts`, layout.worker geo functions, Electron sherpa voice service.
- Everything else audited is **real** — the codebase's "placeholder" grep hits are overwhelmingly input `placeholder=` attributes, and several screens carry explicit "no Math.random / no fabricated data" engineering notes that hold up on inspection.

## Telecom sub-tabs (`/dashboard/telecom-report/*`)

All eight share `TelecomReportRuntimeProvider` via `src/app/dashboard/telecom-report/layout.tsx`; the tab rail comes from `TELECOM_NAV_ITEMS` rendered in `nav/app-sidebar.tsx:151`. `/dashboard/telecom-report` redirects to `/overview`.

| Tab | Route | Renders | What it does |
|---|---|---|---|
| Vue d'ensemble | `/overview` | `telecom/components/overview-tab.tsx` | KPI cards, canal share/amount, hourly, status mix, forecast section, daily trend; per-user KPI & section toggles; shared-overview (LAN) mode |
| Canaux | `/canals` | `canal-tab.tsx` | Per-transactional-channel analysis on the active table (keyed remount per table) |
| Analyse | `/analysis` | `analysis-tab.tsx` | Errors, operators, regions, destinations per group, canal×hour matrix drilldowns |
| Données brutes | `/grid` | `raw-data-tab.tsx` | Filtered raw transaction explorer: server-side count/page/sort, customer (MSISDN) profile lookup |
| Période | `/period` | `period-studio-tab.tsx` | Period studio & period-over-period comparisons |
| Journalier | `/day` | `day-analytics-tab.tsx` | Per-day analytics for the loaded file |
| Historique | `/history` | `analytics-history-tab.tsx` | Cached analyses & source files (IndexedDB), reload from cache, export active DuckDB database |
| Configuration | `/config` | `user-management-panel` + `lan-collab-panel` + `config-tab.tsx` | Role management, LAN collaboration, column mapping, status mapping, service codes, custom KPI expressions |

## `src/features/ux-innovations` — what's there

Not a grab-bag of experiments; it is one coherent **gamification + onboarding** feature (route orphaned):
- `components/AchievementSystem.tsx` (+ `AchCard`, `AchievementModal`, `AchievementToast`, `LevelBadge`, `Celebrate` confetti, `tabs/`) — telemetry-driven achievements with levels and progress, code-split with skeleton.
- `components/OnboardingTour.tsx` — driver.js first-visit guided walkthrough.
- `events/`, `store/`, `data/` — real event tracking feeding achievement progress (the screen header comment stresses "real, telemetry-driven progress").
Status: complete and real, but unreachable except by typing the URL — either add to nav (e.g., footer "Achievements") or wire the tour/achievements into Help and retire the standalone route.