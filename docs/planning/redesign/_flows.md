# User-Flow & Feature-Integration Audit — data-navigator

## Core journey map (current, with breaks marked)

The intended journey is **Upload DailyTransactions CSV -> parse -> analyze -> report**. What is actually wired:

```
/dashboard (DashboardHomeScreen)
 |  no datasets -> EmptyState: [Importer un rapport] -> /dashboard/upload?context=telecom
 |                              [Rapport Telecom]    -> /dashboard/telecom-report
 |                                  \-> ALSO an empty state pointing back to Upload  (X) circular loop
 v
/dashboard/upload (DataImportScreen, src/features/data-import/screens/DataImportScreen.tsx)
 |  Mode fork is a QUERY PARAM ONLY (`?context=telecom`, line 174). Entering via the sidebar
 |  "Upload" item is generic mode — invisible difference to the user.
 |  - drag-and-drop is intentionally rejected ("use the native file picker", line 338-342)
 |  - success navigation (line 226-228, getUploadSuccessPath):
 |      telecom mode -> /dashboard/telecom-report  (OK, complete loop)
 |      generic mode -> /dashboard/parsed          (X) even when the file IS a telecom file —
 |        the pipeline already detects telecom shape (import-pipeline.ts line 342-355,
 |        getTelecomDatasetProfile) but the result is only used for a tag/warning, never routing.
 v
/dashboard/parsed (ParsedDataScreen)  ====== DEAD END ======
 |  Column profiler only. ZERO outbound links: `grep router.push|href` in
 |  src/features/parsed-data returns NOTHING. No "Analyze", no "Open report", no "next step".
 |  The core journey terminates here for every generic upload.
 X
 (analysis screens: ai-analysis, deep-analytics, forecast, geo-analysis, ai-briefing,
  monitor, analytics-theater, data-formulator — all reachable ONLY via the sidebar,
  none reachable from the upload/parse flow, none linking onward)
 X
/dashboard/report-studio  — never linked from any analysis screen; falls back to
  seeded demo data (use-report-data.ts line 82-99) so it silently shows fake numbers.
```

The telecom path (`upload?context=telecom` -> telecom-report/overview) is the only complete loop. Everything else fans out into sidebar islands.

Side journey that competes with the main one: `src/features/csv-parser` (route `/dashboard/csv-parser`, NOT in the sidebar) is a second, parallel import pipeline — it loads files into DuckDB and calls `addDataset`/`setActiveDataset` itself (CsvParserScreen.tsx lines 176, 449-450) — duplicating data-import. It is reachable only from a Help-page link (help-content.ts line 75).

## State/data sharing assessment

**The store layer is actually shared — this is NOT the problem.**
- `src/core/stores/data-store.ts` is a single persisted Zustand store with `datasets[]` + `activeDatasetId`; 29 feature files consume it. `src/core/queries/datasets.ts` is a TanStack Query facade over the same store.
- Features that correctly honor the shared active dataset: deep-analytics (`use-analytics-source.ts`), report-studio (`use-report-data.ts`), forecast (`use-forecast-data.ts` line 65-70), geo-analysis (`use-geo-data.ts`), ai-panel (lines 484-572), data-transform, telecom-report-runtime, ai-briefing, channel-monitor, analytics-theater.

**What IS broken about state:**
1. **No boot-time catalog sync.** `loadedTableNames` is deliberately not persisted (data-store.ts line 449-450) and `DashboardBoot`/`dashboard-client-shell` never call `replaceDatasetsFromCatalog`. Each feature syncs the DuckDB catalog independently (ai-panel, parsed-data, telecom-runtime, data-browser, data-formulator, reconciliation do; ai-analysis, data-transform, forecast, deep-analytics do NOT). Result: on a fresh app start, `/dashboard/ai-analysis` shows a false **"Session Expired — Re-upload Dataset"** (AiAnalysisScreen.tsx lines 490-507) for data that is perfectly restorable, until the user happens to visit a screen that syncs the catalog.
2. **Three overlapping context layers**: data-store (`activeDatasetId`), app-context-store (`activeDomain/activeDatasetId/activeTableName`, mirrored manually in dashboard-client-shell.tsx lines 60-66), and telecom's own session store (`useTelecomSessionStore` + `useTelecomStore` fileName/reportDate). Telecom-report-runtime force-overwrites the global active dataset to a telecom one on mount (lines 429-450), so visiting the report silently switches the global selection.
3. `/dashboard/browser/page.tsx` ignores all of it: it hardcodes `TELECOM_TABLE_BASE` as the table name (lines 5-17), so it queries a fixed table regardless of the active dataset.

## Inter-feature navigation graph (actual edges found)

Every `router.push`/`href="/dashboard..."` in feature code:

| From | To | Evidence |
|---|---|---|
| dashboard-home | upload?context=telecom, telecom-report | DashboardHomeScreen.tsx 294, 305, 364, 371 |
| data-import | telecom-report (x3), parsed OR telecom-report on success | DataImportScreen.tsx 271, 393, 455, 495 |
| ai-analysis | upload (empty + stale states) | AiAnalysisScreen.tsx 484, 502 |
| folders | upload (x2) | FoldersScreen.tsx 491, 769 |
| topbar | settings, login | topbar.tsx 172, 218 |
| dataset-picker (topbar) | upload | dataset-picker.tsx 85 |
| sidebar | all nav routes + telecom-report/{8 tabs} | app-sidebar.tsx 49 |
| command palette | any nav page; folders; `/dashboard` on dataset select | command-palette.tsx 54, 59, 78 |
| telecom file-management-modal | lineage | file-management-modal.tsx 82 |
| telecom-report-runtime | telecom-report/overview, upload?context=telecom | telecom-report-runtime.tsx 641, 669 |
| help tour runner | tour routes | use-onboarding.ts 52 |

**Zero outbound edges** (verified by grep, no matches): parsed-data, deep-analytics, report-studio, forecast-intelligence, geo-analysis, ai-briefing, channel-monitor, data-formulator, history, analytics-theater, lineage. Eleven of ~20 feature surfaces are navigation leaf-islands; only Upload and Telecom-Report participate in any flow. There is no edge from any analysis feature to report-studio, and none from parsed-data to anything.

**Broken/orphan edges:**
- Sidebar "Charts" -> `/dashboard/charts` — **the route does not exist** (nav-config.ts 297-303; `Glob src/app/dashboard/charts/**` = no files). Clicking it 404s; it is also indexed in the command palette.
- Orphan routes with pages but no nav entry: `/dashboard/csv-parser`, `/dashboard/browser`, `/dashboard/data-browser`, `/dashboard/ux-innovations`, `/dashboard/dashboard-shell`.
- The global tour anchors a step to `[href="/dashboard/browser"]` in the sidebar (tours.ts 77-78) — that sidebar link doesn't exist, so the "SQL IDE" step silently skips.

## Empty-state & onboarding gaps

Empty states exist almost everywhere, but most are **dead-ends with no action**:

| Screen | Empty state | CTA to fix it? |
|---|---|---|
| dashboard-home | "Aucun rapport télécom" | YES — upload + telecom-report buttons |
| telecom-report | "Aucun rapport télécom chargé" | YES — "Ouvrir Upload" (runtime 895-921) |
| ai-analysis | "No Dataset Selected" / "Session Expired" | YES — Go to Upload links |
| parsed-data | "No dataset loaded" | **NO** (ParsedDataScreen.tsx 77-94, text only) |
| deep-analytics | `NoDatasetState` | **NO** (AnalyticsStates.tsx 11-29) |
| forecast | `NoDatasetState` | **NO** (tabs/shared.tsx 46-57) |
| ai-briefing | `EmptyDatasetState` | **NO** (only a Retry button on error) |
| analytics-theater | "No active dataset" `AtlasEmptyState` | **NO** (screen 231-234) |
| lineage | "Upload a dataset, run a transform…" | **NO** (text only, line 276) |
| report-studio / channel-monitor | no empty state at all — render **seeded demo data** instead | misleading rather than guiding |

**Onboarding: two complete tour systems exist; neither ever fires for a first-time user.**
1. `src/features/help` — driver.js `GLOBAL_TOUR` with persistence (onboarding-db) — but `startTour` is only invoked from `TourLauncher`, which renders only on `/dashboard/help` (HelpScreen.tsx 66). Nothing auto-starts it; nothing in the shell or palette offers it.
2. `src/features/ux-innovations` — a "first-visit welcome card + guided walkthrough" (`OnboardingTour.tsx`) that mounts **only** on `/dashboard/ux-innovations` — a route absent from the sidebar. The welcome card can never be seen.

So a first-run user lands on an empty dashboard with 22 sidebar items (incl. one broken), no tour, no checklist, no "step 1: import your DailyTransactions file" — except the home empty state, which is good but is the only guidance in the app.

## AI/palette discoverability

- **Command palette** (command-palette.tsx): cmdk + fuse over nav items, datasets, folders, plus 2 actions (toggle AI, cycle theme). Discoverable: topbar "Search… ⌘K" button + `$mod+k` (use-shell-shortcuts.ts). Issues: it indexes the broken `/dashboard/charts` item; selecting a dataset always routes to `/dashboard` (line 78) regardless of context; it has no actions for the real journeys ("Import file", "Run analysis", "Start tour", "Export report") — the tours module even has a comment saying it was designed to be wired into the palette, but isn't.
- **AI panel** (ai-panel.tsx, 1289 lines, lazy-loaded): NLQ-to-SQL chat against the shared active dataset (read-only SQL + result table + auto-chart), suggested questions, an Insights tab (generateInsights/recommendCharts). Discoverable via floating `AIToggle`, a sidebar-footer "AI Assistant" button, a topbar brain icon, palette action, and `$mod+\`. Reasonably discoverable — but it is itself an island: results/charts cannot be sent to report-studio, saved charts, or any screen; and it duplicates the separate `/dashboard/ai-analysis` page and `agent-canvas`/`data-formulator` AI surfaces, so "AI" exists in 4+ disconnected places.

## Flow problems ranked top 10 (with file evidence)

1. **The core journey dead-ends after upload (generic mode).** Upload success routes to `/dashboard/parsed` (DataImportScreen.tsx 226-228) and ParsedDataScreen has zero outbound navigation. A telecom-shaped file uploaded via the sidebar Upload item never reaches the telecom report even though the pipeline detected it (import-pipeline.ts 342-355).
2. **No onboarding ever runs.** GLOBAL_TOUR requires finding /dashboard/help first; the ux-innovations first-run welcome card mounts only on an unreachable orphan route (OnboardingTour.tsx 42-44; UxInnovationsScreen.tsx 47; nav-config.ts has no entry).
3. **Sidebar links to a non-existent route.** "Charts" -> `/dashboard/charts` (nav-config.ts 297-303) — 404 in nav AND in the command palette.
4. **11 feature screens are navigation islands.** No edges out of parsed-data, deep-analytics, report-studio, forecast, geo-analysis, ai-briefing, channel-monitor, data-formulator, history, analytics-theater, lineage — "analyze -> report" has no path; features feel unrelated because they literally are.
5. **Dead-end empty states in 7+ screens** (table above): users with no data get told to load a dataset with no button to do it; report-studio and channel-monitor instead show seeded demo numbers (use-report-data.ts 82-107), which actively hides the "you need to upload" step.
6. **Journeys fork confusingly between telecom-report tabs and dashboard pages.** Three "history" surfaces with different data: `/dashboard/history` (activity audit log), `/dashboard/telecom-report/history` (analytics snapshots), and the Upload page's "Datasets enregistrés" panel. Two settings surfaces: `/dashboard/settings` (app prefs) vs `/dashboard/telecom-report/config` (mapping/status/users/LAN). The sidebar shows both trees simultaneously (app-sidebar.tsx 122-190) with no explanation.
7. **/dashboard/browser is wired to a hardcoded table** (`TELECOM_TABLE_BASE`, src/app/dashboard/browser/page.tsx 5-17), ignoring the active dataset, while help and the global tour advertise it as the "SQL IDE" (help-content.ts 86-99, tours.ts 77-86) and a separate `/dashboard/data-browser` does the job correctly — both off-nav.
8. **False "Session Expired — Re-upload"** on fresh start: `loadedTableNames` not persisted, no shell-level catalog sync, each screen syncs (or doesn't) on its own (data-store.ts 449-450; AiAnalysisScreen.tsx 490-507; only 6 of ~15 data screens call `replaceDatasetsFromCatalog`).
9. **Duplicate features in nav confuse the path**: two collaboration workspaces ("Collaboration Hub" `/collab-hub` and "Collaborative" `/collaborative`, nav-config.ts 282-296), two AI analysis surfaces (ai-panel vs `/ai-analysis`), and the hidden csv-parser duplicating data-import.
10. **Help content contradicts the actual flows**: claims drag & drop and JSON/XLSX support (help-content.ts 62-68) — the import screen rejects drops and accepts only CSV/TSV/TXT/Parquet; says "Upload the file in the Telecom Report page — not the generic Upload page" (line 110) while the telecom page's only import button routes TO the generic upload page (`telecom-report-runtime.tsx 669`).

## Quick-win integration opportunities

1. **Route telecom files to the report after generic upload** — `processFilePath` already computes `telecomProfile.compatible`; make `getUploadSuccessPath` (DataImportScreen.tsx 226) check it, or add an "Ouvrir le rapport télécom" button to the non-telecom success path. One-file change that completes the core journey.
2. **Remove or implement the "Charts" nav item** (nav-config.ts 297-303). One-line deletion kills a 404 in both sidebar and palette.
3. **Add an upload CTA to every empty state** — `NoDatasetState` (deep-analytics, forecast), `EmptyDatasetState` (ai-briefing), `AtlasEmptyState` callers, ParsedDataScreen, lineage. The components already exist; add a `<Link href="/dashboard/upload">` like ai-analysis already does.
4. **Add a "Next steps" strip to ParsedDataScreen** linking to AI Analysis / Deep Analytics / Report Studio for the active dataset — turns the dead-end into a hub.
5. **Auto-offer GLOBAL_TOUR on first run** — mount a small check in `DashboardBoot` (dashboard-boot.tsx) using the existing `onboarding-db` completed flag and `useOnboarding().startTour`; everything needed is already built.
6. **Sync the DuckDB catalog once at shell boot** — call `listRegisteredDatasets()` + `replaceDatasetsFromCatalog` in `DashboardBoot`/`dashboard-client-shell`; removes the false "Session Expired" and lets every screen drop its private sync effect.
7. **Fix `/dashboard/browser` to resolve the active dataset view** (or delete it and point help/tour at `/dashboard/data-browser`, which already opens the first catalogued dataset).
8. **Make palette dataset selection context-aware** — route telecom datasets to `/dashboard/telecom-report`, others to `/dashboard/parsed` or `/dashboard` (command-palette.tsx 63-80), and add palette actions: "Import file", "Start welcome tour", "Open report studio".
9. **Banner real-vs-demo in report-studio / channel-monitor** — `isDemo` is already returned by use-report-data; render a prominent "Demo data — import a dataset" banner with an upload link.
10. **Consolidate duplicates**: pick one collaboration feature in nav; fold csv-parser's paste-text capability into the Upload screen as a tab; rewrite help-content.ts to match actual routes/capabilities (removes the contradictory guidance cheaply).
