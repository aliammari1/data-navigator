# Foundation API surface (Phase 1 — built, use these from features)

The platform foundation is implemented. **Feature code must call these real exports** — do not re-invent inference/DuckDB/stats/chart/persistence/collab plumbing. All are offline, worker/main-isolated, and Arrow/selector-disciplined.

## AI — `@/platform/ai/provider`
- `useAI()` hook + provider registry. The **llamacpp** adapter (Electron main, grammar-constrained JSON) is registered first and is the default in Electron; transformers.js worker is the browser/embeddings lane; web-llm is demoted (opt-in + real WebGPU only).
- Structured output: `provider.generateStructured(zodSchema, prompt)` → valid JSON **by construction** (GBNF grammar from the Zod schema via `schemaToGrammarJson`/`zod-to-json-schema`). Stop using regex/parseJSON repair loops.
- `provider.generate({system,prompt,...})` (streaming via `onToken`), `provider.embed(texts)`.
- Underlying IPC (don't call directly from features; the adapter wraps it): `window.electronLlama.*`, browser embeddings via the inference worker.

## DuckDB + Arrow — `@/platform/duckdb` (from `duckdb.ts`)
Renderer API (all accept an optional cancel token; call `cancelQueries(token)` on dataset switch):
- `runReadOnlyQueryArrow(sql, cancelToken?)` → Arrow IPC bytes
- `profileDataset({datasetId, cancelToken?})` — ONE SUMMARIZE-based scan (not N per-column queries)
- `profileColumnDetail({datasetId, column, topK?, binCount?, cancelToken?})`
- `countRows({datasetId, where?, force?, cancelToken?})` — cached COUNT(*)
- `fetchKeysetPage({datasetId, sortKeys, limit, where?, cursor?, columns?, cancelToken?})` → `{arrow, nextCursor, rowCount}` — **keyset/seek pagination, O(1) deep pages** (NOT OFFSET)
- `cancelQueries(token)`, `resetCancelToken(token)`
- Arrow decode: `decodeArrowIPC(bytes)`, `arrowToColumns`, `arrowToRows`, `getArrowColumn`, `arrowRowAt`, `arrowColumnNames`, `arrowRowCount`
- SQL builders (`@/platform/duckdb/pushdown`): `buildSummarizeSQL`, `buildApproxTopKSQL`, `buildApproxCountDistinctSQL`, `buildHistogram{Table,Aggregate}SQL`, `buildApproxQuantileSQL`, `buildQuantileContSQL`, `buildCorrelationCrosstabSQL`, `buildReservoirSampleSQL`, `buildCountSQL`, `buildKeysetPageSQL`, `quoteIdent`, `quoteLiteral`
- CSV import supports `encoding` + `storeRejects` (rejects summary surfaced) via `upload-to-duckdb.ts`.

## Workers (Comlink) — `@/platform/viz`
- `getAnalysisProxy()` → `kMeans` (seeded, withinss), `dbscan`, `attribution` (SVD), `correlationMatrix`, `welchTTest`, `anova1`, `detectAnomalies` (iqr/zscore/mad), `gesdAnomalies` (S-H-ESD), `ewma`, `stlDecompose`, `pelt`, `holtWinters`. **All seeded (default 42)** — use these instead of Math.random/fake p-values/hand-rolled k-means.
- `getChartProxy()` + `<OffscreenChart>` component → echarts/core in OffscreenCanvas; `render`/`setOption`/`getDataURL`/`renderToSVGString`/`renderToPNGDataURL`. Use `<OffscreenChart>` for heavy charts.
- uPlot (dense time-series, main-thread Canvas): `buildTimeSeriesOptions`, `buildSparklineOptions`, `useUPlot()` hook.
- `getParseProxy()` → `parseString` (uDSV, CSP-safe), `parseStream`, `inferColumnTypes`, `decodeArrowColumns`.
- `getLayoutProxy()` → `layoutGraph` (ELK layered DAG), supercluster (`loadGeoPoints`/`getClusters`/`getClusterExpansionZoom`/`getClusterLeaves`), `hexbin` (h3-js).
- `getExportProxy()` → `pdf`/`xlsx`/`docx`/`pptx` → ArrayBuffer + `svgToPng` (resvg). Pair with `saveBytes()` (Electron fs save dialog). **All heavy export off the main thread.**

## State / persistence — `@/platform/storage`
- Dexie app-db (`data-navigator-app-v1`) accessors — **replace every localStorage-as-DB use**: `putColumnProfile`/`listColumnProfiles`, `putTransformRecipe`/`listTransformRecipes`, `addImportRecord`/`listImportHistory`, `addActivityRecord`/`listActivity`, `putSavedQuery`/`listSavedQueries`, `unlockAchievement`/`recordAchievementEvent`/`isAchievementUnlocked`, `putReportDefinition`/`listReportDefinitions`, `recordSettingsDrift`/`listUnresolvedDrift`, `putCollabAnnotation`/`listCollabAnnotations`. Plus `newId`, `dayKey`, `compactLogs`.
- OPFS big-blob store: `OPFSBlobStore(namespace)`, `OPFS_NS` (`parquetCache`/`modelWeights`/`pmtiles`/`pyodide`), `isOpfsAvailable`.
- Zustand discipline: `createSelectors(store)` → `store.use.field()`; `useShallowSelector`; `durablePersist({name, version, getDefaults, persistKeys, transforms})` for version+migrate+partialize.
- TanStack Query: `restoreQueryClient(client)` (before first paint), `persistQueryClient(client)` (debounced) — instant cold-load.
- Boot/settings: `ensurePersistentStorage()`, `applySettings`/`applyAppearance` (theme/accent/density/animations → CSS vars+data-attrs, zod-clamped), `getRuntimePerformanceConfig`/`subscribePerformanceConfig` (duckdbWorkers/maxMemoryMB/virtualizeThreshold — read this to make perf settings real).
- Store→Dexie migration helper: `mirrorStoreToDexie(store, selector, onChange)`, `runOnceBackfill(db, key, version, work)`.

> **dashboard-shell owns the wire-in** of `ensurePersistentStorage()` (dashboard layout), `restoreQueryClient`/`persistQueryClient` (query-provider), and `applySettings` (settings provider effect), plus design-token CSS consuming `--accent`/`--density-scale`/`--motion-allowed`/`data-*`. Other features must NOT edit those shared provider files.

## Collaboration — `@/platform/collab` (+ `@/platform/lan/lan-collab`)
Yjs + y-indexeddb + awareness substrate (replaces localStorage/BroadcastChannel silos):
- Rooms: `getRoomDoc(roomId)`/`acquireRoom`/`releaseRoom`; `connectRoomLAN(roomId,{url,room,pairingCode,identity})`/`disconnectRoomLAN`; `getRoomStatus`/`subscribeRoomStatus`. Each room exposes `.whenStored`, `.awareness`, and shared `comments/changes/chat/annotations/approvals/audit/meta`.
- Annotations: `readAnnotations`/`addAnnotation`/`setAnnotationResolved`/`deleteAnnotation`/`replyToAnnotation`/`observeAnnotations`.
- Approvals: `readApproval`/`readApprovals`/`setApprovalStatus`/`observeApprovals`.
- Audit: `appendAuditEvent`/`readAuditEvents`/`observeAuditEvents`.
- Presence: `setAwarenessUser`/`publishCursor`/`readPeers`/`subscribePeers`.
- LAN: `discoverHubs`, `subscribeHubDiscovery`, `startInAppHub`/`stopInAppHub`, `hasCollabHubBridge` (mDNS via `window.electronCollab`; falls back to local-only y-indexeddb offline).

> The collaboration/collab-hub features must **re-point** `src/features/collaboration/lib/room.ts`, `room-provider.tsx`, `useAnnotations.ts`, `collab-hub-store.ts`, `PresenceBar.tsx` at `@/platform/collab` to delete the old silos — the substrate is ready.

## Hard rules for feature work
- CODE ONLY — do not run `tsc`/`next build`/`pnpm test` (slow on this WSL2 setup); do not `pnpm add` (everything is installed; for DBSCAN use the installed `density-clustering`, not `ml-dbscan`).
- No `Math.random()` data — every number traces to a DuckDB query (via the foundation API) or seeded analysis worker.
- Virtualize every list/grid/tree (`@tanstack/react-virtual`); dense charts via `OffscreenChart`/uPlot; durable state via Dexie/collab; AI via the provider registry; exports via `getExportProxy`.
- Stay inside your feature dir `src/features/<feature>/` (+ its route under `src/app/dashboard/<feature>/`). Don't touch other features, `electron/`, `package.json`, or dashboard-shell's shared provider files.
