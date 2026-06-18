# Boilerplate Reduction — Engineering Report

**Project:** data-navigator (offline-first telecom analytics — Next.js 16 / React 19 / Electron / TypeScript / pnpm)
**Scope:** Read-only audit of seven areas (state/persistence, async-data, utils/format, UI primitives, dnd/canvas/viz, parsing/workers, forms/validation) for opportunities to replace hand-rolled boilerplate by adopting/extending already-installed (or genuinely warranted, offline-safe) libraries.
**Hard constraint:** Everything must run with **no network at runtime**; every recommendation below is bundleable and offline-safe.
**Decision legend:** ADOPT (use directly) · EXTEND (thin wrapper) · COMPOSE (combine with existing infra) · BUILD (keep custom, justified).

---

## 1. Executive Summary

The codebase is, on the whole, **library-first and well-architected**. The platform layer (`src/platform/storage`, `src/core/queries`, `src/platform/duckdb`) is genuinely strong and should not be rewritten. The dominant problem is **non-adoption of code and dependencies that are already present** — not missing infrastructure.

Three findings stand out:

1. **Already-installed deps with one consumer each.** `nanoid@5.1.11` (1 consumer) and the `immer@11.1.8` zustand middleware (1 consumer) are installed but barely used, while ~12 hand-rolled id generators and dozens of nested-spread immutable updates exist across the stores.
2. **Internal platform helpers under-adopted.** `durablePersist()` / `makeDeepMergeMigrate()` / `pickKeys()` exist in `src/platform/storage/persist-helpers.ts` but only 3 of ~10 persisted stores use them; the rest hand-roll the `version`/`migrate`/`partialize` trio. Likewise the shared LLM-JSON extractor in `src/platform/ai/provider/structured.ts` is duplicated in two other places.
3. **Four dead dependencies.** `@dnd-kit/react@0.4.0`, `@dnd-kit/dom@0.4.0`, `dagre` (+ `@types/dagre`), and `react-force-graph-2d` have **zero source imports** and are removal candidates. `uuid@14.0.0` is also a near-dead candidate (verify import check).

**Estimated impact (no new deps in the quick-win tier):**

| Tier | LOC removed | New deps | Deps removed |
|---|---|---|---|
| State/persistence consolidation | ~175–235 | 0 | `uuid` (candidate) |
| Async-data (`parsed-data` hooks) | ~90 | 0 | 0 |
| Utils/format (`es-toolkit` adoption + consolidation) | ~90–110 | 1 (`es-toolkit`) | 0 |
| UI primitives (modals/sheets/virtual-list/tabs) | ~250–400+ | 0 | 0 |
| dnd/canvas (`useFreeDrag` hook + dead-dep removal) | ~80–100 | 0 | 4 (+`@types/dagre`) |
| Parsing/workers (consolidate LLM-JSON extractors) | ~60–80 | 0 (opt: `jsonrepair`) | 0 |
| Forms (spread `@tanstack/react-form` + Zod) | ~70–90 | 0 | 0 |
| **Total** | **~815–1100+** | **1 (es-toolkit), opt: jsonrepair** | **4–5** |

**Top opportunities (highest payoff, lowest risk):**
- Adopt the in-repo `durablePersist` across the remaining 6 stores (zero new deps, biggest consistency win).
- Consolidate the two duplicate `VirtualList` files and migrate hand-rolled modals to the installed `Dialog`/`Sheet` primitives (largest a11y payoff).
- Remove the four dead dnd/viz dependencies (zero risk).

---

## 2. Decision Matrices (per area)

### 2.1 State & Persistence

| Boilerplate | Files (file:line) | Recommended library | License / Downloads / Offline | Decision | LOC saved | Risk |
|---|---|---|---|---|---|---|
| Hand-rolled `migrate`/`partialize` trio instead of `durablePersist` | `src/core/stores/settings-store.ts:191-221`; `src/core/stores/folders-store.ts:122-164`; `src/core/stores/activity-store.ts:63-76`; `src/core/stores/report-draft-store.ts:58-63`; `src/features/dashboard-shell/shell/shell-store.ts:65-71`; `src/features/desktop/store/desktop-store.ts:439-451` | **none** — in-repo `durablePersist` / `makeDeepMergeMigrate` / `pickKeys` from `@/platform/storage` (`persist-helpers.ts`) | internal · n/a · offline-safe | **ADOPT (internal)** | ~120–150 | Low — `monitor-store.ts:287` already proves the pattern; lock with `tests/platform/storage/drizzle-storage.test.ts` first |
| Duplicated id generation (~12 sites) | `src/features/desktop/store/desktop-store.ts:165-169` (4 variants); `src/core/stores/activity-store.ts:50`; `src/core/stores/report-draft-store.ts:48`; `src/features/data-formulator/store.ts:147,180`; `src/features/data-formulator/core/helpers.ts:18-24`; `widget-registry.ts:40`; `src/features/telecom/lib/users.ts:22`; `src/features/analytics-theater/model/scene.ts:99-104`; `src/platform/lan/lan-collab.ts:181`; `src/features/collaboration/lib/room-actions.ts:28` | **nanoid@5.1.11** (already installed) OR in-repo `newId()` (`src/platform/storage/app-db.ts:507`) | MIT · ~30M+/wk · offline (`crypto.getRandomValues`) | **ADOPT/EXTEND** — route through `newId()`/`newPrefixedId(prefix)`; reserve `nanoid` for short ids | ~25–35 | Low |
| `uuid@14.0.0` installed, ~zero import consumers (code uses `crypto.randomUUID()` directly) | repo-wide | — | — | **DROP** (verify import check first) | — (dep removal) | Low |
| Nested-spread immutable updates immer would flatten | `src/core/stores/settings-store.ts:149-153`; `src/features/desktop/store/desktop-store.ts:248,255,259,286,291,333,347,410,397-406`; `src/core/stores/folders-store.ts:77-114`; `monitor-store.ts:194-197,206-210,227-233` | **immer / `zustand/middleware/immer`@11.1.8** (already installed; 1 consumer: `agent-canvas/core/agent-store.ts:7`) | MIT · immer ~13M/wk · offline-safe | **COMPOSE (selective)** — adopt in `desktop-store` + `folders-store` only; leave trivial `set({k:v})` stores alone | ~30–50 | Low–med — verify nothing mutates persisted slices in place (immer freezes); add per-store regression test first |
| Repeated `useShallow` actions-selector hooks | `settings-store.ts:230-271`; `desktop-store.ts:456-526`; `shell-store.ts:78-95`; `activity-store.ts:82-90`; `folders-store.ts:170-191` | none | — | **BUILD (keep)** — type-safe and explicit; optionally EXTEND `createSelectors` with `useActions()`. Low priority | ~0 | n/a |

### 2.2 Async Data

react-query (`@tanstack/react-query@5.101.0`) is **already adopted and used well** — no new library warranted. swr would be a regression.

| Boilerplate | Files (file:line) | Recommended approach | Decision | LOC saved | Risk |
|---|---|---|---|---|---|
| `useState`+`useEffect`+`cancelled` flag over `listRegisteredDatasets()` | `src/features/parsed-data/hooks/useDatasetCatalog.ts:29-55` | `useQuery({queryKey: queryKeys.datasets…, queryFn})`; mirror into zustand via `select`/effect; `refreshKey` → `invalidateQueries` | **COMPOSE** onto existing `useQuery` | ~25 | Low — preserve the zustand mirror + auto-select side-effect (`:42-44`) |
| Manual loading/cancel + bounded LRU `memoRef` over `runReadOnlyQuery` | `src/features/parsed-data/hooks/useColumnDetail.ts:148-213` | `useQuery` keyed `[datasetId, updatedAt, columnName]`; rq `gcTime` replaces the 64-entry LRU; `staleTime:Infinity` | **COMPOSE** onto `useDuckDBQuery` | ~35 | Med — cache semantics move from in-hook Map → QueryClient |
| `useState`+`cancelled`+manual Dexie cache+IPC `cancelToken` over `profileDataset()` | `src/features/parsed-data/hooks/useDatasetProfile.ts:54-159` | `useQuery` with Dexie-read→IPC-scan→worker in `queryFn`; wire `AbortController`/`signal` → IPC `cancelToken` | **COMPOSE (partial)** | ~30 | **Higher** — the cross-process IPC `cancelToken`/`cancelQueries` abort (`:151-155`) is load-bearing; verify cancellation parity |
| Staged worker pipeline w/ progress + run-token supersession | `src/features/ai-analysis/hooks/useAnalysis.ts` | — (orchestration, not a cacheable fetch) | **BUILD (keep)** | 0 | n/a |
| Button-triggered offline-LLM generations | `useGeoInsights.ts:44`; `useAutoOrganize.ts:73`; ai-briefing streaming | optional `useMutation` for `isPending`/`error` | **EXTEND (optional, low value)** | ~10–15 each | Low |
| Visibility-gated 30s polling loop w/ side-effects | `src/features/channel-monitor/hooks/useMonitorEngine.ts` | — (`refetchInterval` loses visibility-gated reschedule + side-effect fan-out) | **BUILD (keep)** | 0 | n/a |
| Yjs CRDT subscription | `src/features/telecom/hooks/use-shared-overview.ts` | — (subscription, not request/response) | **BUILD (keep)** | 0 | n/a |
| Presence probe fused w/ IPC download-progress subscription | `src/platform/ai/models/use-model-status.ts` | — | **BUILD (keep)** | 0 | n/a |

### 2.3 Utils & Format

Existing deps: `clsx`, `tailwind-merge`, `date-fns`, `nanoid`, `uuid`, `ts-pattern`, `p-queue`, `immer`. No `lodash`/`es-toolkit`/`numbro`/`p-retry`.

| Boilerplate | Files (file:line) | Recommended library | License / Downloads / Offline | Decision | LOC saved | Risk |
|---|---|---|---|---|---|---|
| `debounce` hand-rolled (2 copies) | `src/features/report-studio/hooks/use-branding.ts:20-31` (with `.flush`); `src/features/forecast-intelligence/components/forecast-panel.tsx:378-385` (`useDebouncedValue`) | **es-toolkit@1.47.1** `debounce`/`throttle` | MIT · ~3–4M/wk · zero-dep, pure ESM, offline-safe, tree-shakeable | **EXTEND** — use `es-toolkit` `debounce` (has `.flush()`/`.cancel()`); keep one `useDebouncedValue<T>` React wrapper | ~20 | Low |
| `clamp` duplicated ~12× (named + inline `Math.max/min`) | `src/features/telecom/lib/format.ts:51`; `src/platform/browser/forecast-onnx.ts:28`; inline at `pyodide-ml.ts:97,168`; `use-gaze.ts:68`; `gaze-overlay.tsx:21`; `voice-tts-worker.ts:974`; `dock-extras.tsx:304`; `DataBrowserScreen.tsx:563`; `OfflineMap.tsx:274`; `settings/components/controls.tsx:299`; `parsed-data/model/summary-map.ts:457` (`clamp01`) | **es-toolkit** `clamp` | MIT · offline-safe | **ADOPT** (`clamp(v,0,1)` covers `clamp01`) | ~15–20 | Low |
| `uniq` inline `Array.from(new Set(...))` ~4× | `CohortAnalysis.tsx:128-129`; `voice-model-cache.ts:372`; voice-settings area | **es-toolkit** `uniq`/`uniqBy` | MIT · offline-safe | **ADOPT** (low value individually) | ~5 | Low |
| `formatBytes` duplicated 4×, three behaviors | `src/features/folders/lib/format.ts:11`; `src/features/settings/lib/format.ts:6` (most robust); `src/features/data-import/model/helpers.tsx:12`; + `formatAge` (folders:19) | native — no good single dep (`pretty-bytes` adds little); `formatAge` → `date-fns/formatDistanceToNowStrict` (dep) | n/a | **BUILD (consolidate)** — promote `settings/lib/format.ts:formatBytes` to shared util, delete other 3 | ~30 | Low — verify `"—"` vs `"0 B"` zero-case per call-site |
| Scattered number formatters; `fmtN` re-allocates `Intl` per call | `src/features/parsed-data/model/format.ts:3`; `src/features/deep-analytics/lib/format.ts:3-18`; `src/features/telecom/lib/format.ts:3-36` (`fmtN` allocs per call) | native **`Intl.NumberFormat`** (numbro NOT recommended — unmaintained, redundant) | built-in · offline | **BUILD (consolidate + cache)** — hoist formatter instances to module scope (mirror `channel-monitor/lib/format-helpers.ts`), dedupe `fmtPct`/`formatNumber` | ~15–25 + perf | Med — preserve locale + deliberate floor-not-round in `telecom fmtPct:24-30` |
| `groupBy`/`chunk`/`range`/`partition` | (`groupBy` hits are SQL strings; `chunk` hits are byte-buffer chunking; `range` hits are numeric math) | — | **no action** — not actually present as reusable utils | 0 | n/a |
| `deepMergeDefaults` deep-merge | `src/platform/storage/persist-helpers.ts:35-48` | es-toolkit `merge` | — | **BUILD (keep)** — intentionally drops keys absent from defaults (persisted-state compat); generic `merge` leaks stale keys | 0 | n/a |
| `retry`/`sleep` | — (rq handles query retry; no `sleep`/`delay` pattern found) | — | **no action** — `p-retry` not warranted | 0 | n/a |

Already good: `src/lib/utils.ts:4` `cn = twMerge(clsx(...))` (canonical); `channel-monitor/lib/format-helpers.ts` (hoisted `Intl` instances + tree-shaken `date-fns`).

### 2.4 UI Primitives

`src/components/ui/**` is a full shadcn install (60 primitives on `radix-ui`/`@base-ui/react`). All libs below are already present: `cmdk`, `sonner`, `vaul`, `@tanstack/react-table`, `@tanstack/react-virtual`, `react-resizable-panels`, `input-otp`. **No new deps.**

| Boilerplate | Files (file:line) | Recommended library (installed) | License / Offline | Decision | LOC saved | Risk |
|---|---|---|---|---|---|---|
| Hand-rolled `fixed inset-0` modals (no portal/focus-trap/Esc/scroll-lock/ARIA) | `src/features/telecom/components/file-management-modal.tsx:52`; `column-mapper.tsx:58`; `src/features/ux-innovations/components/AchievementModal.tsx:42`; `src/features/channel-monitor/tabs/ChannelHealthTab.tsx:221`, `SlaComplianceTab.tsx:231`; `src/features/folders/screens/FoldersScreen.tsx:1126` | `@/components/ui/dialog` (radix-ui) | MIT · offline | **ADOPT** | ~40–60/modal (~250+ total) | Low–med — re-check `motion/react` enter/exit (Dialog wires `data-open`/`data-closed`, `dialog.tsx:42`) |
| Hand-rolled side-panel/drawer w/ `motion` slide-in | `src/features/telecom/components/customer-profile-panel.tsx:66` (manual `x:"100%"` spring + backdrop close) | `@/components/ui/sheet` or `@/components/ui/drawer` (vaul) | MIT · offline | **ADOPT** sheet | ~50 | Med — preserve sticky header + internal pagination. (`agent-canvas/AnomalyDrawer.tsx:218` already uses vaul correctly — follow it) |
| Two near-identical `VirtualList` wrappers (~95% same) + 18 inline `useVirtualizer` sites | `src/features/collaboration/components/VirtualList.tsx`; `src/features/ai-analysis/components/VirtualList.tsx` (dupes); inline in `data-grid.tsx`, `AuditTrail.tsx`, `FolderTree.tsx`, `RegionList.tsx`, `VirtualEventLog.tsx`, … | `@tanstack/react-virtual` (installed) | MIT · offline | **COMPOSE** — promote one generic `VirtualList<T>` to `src/components/ui/` or `src/shared/`, delete dupe | ~75 immediate + more across 18 sites | Low — pure refactor; keep bespoke for column-logic grids |
| Manual tab-bars (`activeTab` state + styled `<button>` + `{activeTab===x && …}`) ~14 screens | `ai-analysis/screens/AiAnalysisScreen.tsx:689-1387`; `lineage/screens/LineageScreen.tsx`; `collaboration/screens/CollaborationScreen.tsx`; `forecast-intelligence/screens/ForecastScreen.tsx`; `telecom/components/period-studio-tab.tsx` | `@/components/ui/tabs` (radix) | MIT · offline | **ADOPT** where simple; **BUILD/keep** where panels are lazy-mounted/animated | ~15–25/screen | Med — verify perf-sensitive lazy-mount screens (AiAnalysis) keep conditional content |
| shadcn `table.tsx` unused (0 imports); repeated sticky-header/zebra wrappers | `top-accounts-leaderboard.tsx:75`; `spec-status-table.tsx:53`; `spec-unit-amount-table.tsx`; `spec-channel-table.tsx`; `overview-tab.tsx` | `@/components/ui/table` shell; `@tanstack/react-table` for sortable | MIT · offline | **EXTEND** (`DataTableShell`) for wrapper dedupe; **ADOPT** react-table only where sorting/filtering grows; **BUILD** simple 2-col summaries | ~10–15/table | Low |
| Segmented toggle / mode-switch repeated ~19× | `file-drop-zone.tsx:50`; `top-accounts-leaderboard.tsx:48-71`; `FoldersScreen`, `LineageScreen`, `access-control-pill.tsx`, `ColumnDetail.tsx` | `@/components/ui/toggle-group` (radix, 0 feature consumers) | MIT · offline | **ADOPT/EXTEND** `SegmentedControl` wrapper | ~10/site | Low |

Already good: `command-palette.tsx` (cmdk + fuse.js, proper ARIA); sonner toasts (12 files, no reimpls); desktop OS-shell context menus (`desktop-context-menu.tsx` — deliberate custom aesthetic, BUILD); `resizable.tsx` (react-resizable-panels).

### 2.5 DnD / Canvas / Viz

| Boilerplate | Files (file:line) | Recommended approach | Decision | LOC saved | Risk |
|---|---|---|---|---|---|
| Hand-rolled free-position pointer-drag duplicated 3× (`dragInfo` ref + `setPointerCapture` + `clientX-off` + `moved` guard) | `src/features/desktop/components/widgets/widgets-layer.tsx:52-84`; `snapshot-artifact.tsx:49-85`; `desktop-icons.tsx:145-192` | extract internal `useFreeDrag({x,y,onCommit})` hook (~50 LOC). A library is wrong here — `@dnd-kit` is reorder-flavored/heavier; `react-rnd` is for resizable windows | **BUILD (dedupe via 1 hook)** | ~80–100 | Low — pure refactor; keep `desktop-icons` HTML5-DnD payload layer |
| `@dnd-kit/react@0.4.0` + `@dnd-kit/dom@0.4.0` installed, **0 source imports** (experimental v0.4 API; only stable `@dnd-kit/core`+`/sortable`+`/utilities` used) | `package.json:89-90` | — | **DROP both** | dep removal | None (dead) |
| `dagre` (+ `@types/dagre`) installed, **0 source imports** (elkjs replaced it; doc comments at `lineage/core/elk-layout.ts:3`, `build-lineage.ts:290`) | `package.json:133`, devDep:265 | — | **DROP** | dep removal | None (dead) |
| `react-force-graph-2d` installed, **0 source imports** (only in planning docs; ~150–200kB bundle) | `package.json:190` | if needed later, COMPOSE with `@xyflow/react` + elkjs worker | **DROP** unless force-directed view imminent | dep removal | Low (reversible) |
| Bespoke Canvas-2D Sugiyama DAG (1256 LOC) overlaps elkjs + xyflow | `src/features/data-formulator/components/moudir/canvas/swarm-canvas.tsx` (`layout()`:212) | optionally COMPOSE: call elkjs worker (`layoutGraph`) for x/y, keep custom rAF/particle paint | **BUILD (keep, justified)** — explicit warm-Moudir branding requirement; optional ~90 LOC layout-math removal | ~0 (opt ~90) | Med (opt) — layout coords feed animation, needs visual re-tune |

Already good (status quo ADOPT): `react-rnd@10.5.3` window drag/resize (`window-frame.tsx:256`); `@xyflow/react` DAG renderers (`AgentFlowGraph.tsx:18`, `lineage/LineageGraph.tsx:11`); `elkjs` in Comlink worker (`workers/layout.worker.ts:73`, `lineage/core/elk-layout.ts:81`); `@dnd-kit` sortable (`telecom/draggable-auto-grid.tsx`, `agent-canvas/NarrativePanel.tsx`); `react-grid-layout` (`agent-canvas/Canvas.tsx:14`).

### 2.6 Parsing & Workers

The CSV / worker / Arrow layer is already library-first and well-built — no replacements warranted.

| Boilerplate | Files (file:line) | Recommended library | License / Downloads / Offline | Decision | LOC saved | Risk |
|---|---|---|---|---|---|---|
| Duplicated hand-rolled LLM-JSON extraction (3 copies: balanced-brace scan + fence-strip + trailing-comma regex) | `src/platform/ai/provider/structured.ts:37-95` (canonical); `src/features/agent-canvas/core/llm.ts:1193-1405` (`parseJSON`+`stripMarkdownFence`:1359+`extractBalancedBlock`:1364, near-identical); `src/features/data-formulator/core/ollama-provider.ts:78-85` (already delegates — template) | **none** — shared `structured.ts` helpers | internal · offline | **BUILD + consolidate** — migrate `llm.ts` to import `extractJsonBlock`/`repairJson`/`parseStructured`; delete the private dupes; wrap shared call in its logging | ~60–80 | Low — equivalent behavior |
| `repairJson` is a thin regex (trailing-comma + smart-quotes only); local LLMs also emit unquoted keys, single quotes, truncated JSON, NaN/Infinity, comments | `src/platform/ai/provider/structured.ts:89-95` | **jsonrepair@3.14.0** | ISC · ~2.32M/wk · pure JS, offline-safe, ~508KB unpacked (tree-shakeable, core fn small) | **EXTEND** — keep `extractJsonBlock`; replace `repairJson` body with `jsonRepair()` as 2nd candidate in `parseStructured` (`:113`), regex as zero-dep fast path first | ~5 (real win: recovery rate) | Low–med — adds 1 dep; verify bundle via `size-limit` |
| Streaming partial-JSON parse (tokens stream to `run.partial` but only displayed raw) | `swarm-store.ts:143-153`; displayed `agent-lane.tsx`, `swarm-canvas.tsx:967` | **partial-json@0.1.7** (MIT, ~2.7M/wk, 22KB) or **best-effort-json-parser@1.4.1** | offline-safe | **COMPOSE if/when feature built; BUILD no-op now** — capability gap, not boilerplate | 0 | n/a |

Already good: dual CSV engines `udsv@0.7.3` + `papaparse@5.5.3` fallback (`csv-parser/workers/csv.worker.ts`, `workers/parse.worker.ts:39-117`); `comlink@4.4.2` worker plumbing (uniform); Arrow `apache-arrow@21` (main, write) + `@uwdata/flechette@2.5` (renderer, read) in `platform/duckdb/arrow-ipc.ts`; `simple-statistics` profiling (`profile.ts:10-16`).

### 2.7 Forms & Validation

**Key correction:** react-hook-form is the **wrong** recommendation — the project already standardized on **`@tanstack/react-form@^1.33.0`**, which consumes **Zod v4 `^4.4.3`** natively via Standard Schema (so `@hookform/resolvers` and `@tanstack/zod-form-adapter` are also unnecessary). Adopting rhf would introduce a competing library. The real gap: TanStack Form is used in exactly **one** file while other multi-field forms hand-roll `useState`.

| Boilerplate | Files (file:line) | Recommended library | License / Offline | Decision | LOC saved | Risk |
|---|---|---|---|---|---|---|
| Auth forms — per-field `useState` + manual `error`/`pending`/`preventDefault`; HTML-only validation (`required`, `minLength={8}`) | `src/components/auth/sign-in-form.tsx:18-45`; `sign-up-form.tsx:19-54` | `@tanstack/react-form@^1.33.0` + Zod schema (mirror `ChangePasswordSchema`) | MIT · offline | **EXTEND (reuse in-repo)** | ~20–30/form | Low — highest value (security-adjacent; `min(8)` should live in a shared Zod schema) |
| Alert-rule builder — 7-field `useState` object + manual spread per field; only `disabled={!label.trim()}` validation despite typed unions | `src/features/channel-monitor/tabs/AlertRulesTab.tsx:48-117` | `@tanstack/react-form` + Zod (`z.enum`) | MIT · offline | **EXTEND** | ~30–40 | Low–med — AI "apply suggestion" writes the same draft; keep `form.setFieldValue` semantics |
| User-management create form — `useState` 3-field draft + `try/catch` string error; `throw new Error("Nom requis")` ad-hoc validation | `src/features/telecom/components/user-management-panel.tsx:25-59` | `@tanstack/react-form` + small Zod schema | MIT · offline | **EXTEND** | ~15–20 | Low |
| Single-textarea feedback (`message`/`saving`/`justSaved`, Ctrl+Enter) | `src/features/help/components/HelpFeedback.tsx:18-61` | none (form lib overkill for one field) | — | **BUILD (keep)** | 0 | n/a |
| react-hook-form / @hookform/resolvers adoption | — | — | — | **REJECT** — duplicates `@tanstack/react-form` | — | — |

Already good: `src/features/settings/lib/settings-schema.ts` (exemplary Zod-v4 layer — `z.coerce`, `parseNumericSetting`/`clampNumericSetting`, `.passthrough()` envelopes); `src/features/settings/components/controls.tsx` (`NumberSetting`/`SliderSetting` — draft + commit-on-blur + Zod, single-field controls); `src/features/settings/components/panels/account-panel.tsx:29-122` (the one reference `useForm` impl with `.refine()` cross-field rule).

---

## 3. Prioritized Roadmap

### Tier A — Quick wins (low risk, immediate, zero/one new dep)

1. **Remove four dead dependencies.** `@dnd-kit/react`, `@dnd-kit/dom`, `dagre` (+`@types/dagre`), `react-force-graph-2d`. **First step:** run a repo-wide import check (`rg "from ['\"](@dnd-kit/react|@dnd-kit/dom|dagre|react-force-graph-2d)"`) to confirm zero source consumers, then drop from `package.json` and re-lock. Zero source risk.
2. **Consolidate the two duplicate `VirtualList` files** into one generic `VirtualList<T>` in `src/components/ui/` (or `src/shared/`); delete the second copy; update the two importers. Pure refactor, ~75 LOC.
3. **Consolidate the 3 LLM-JSON extractors** onto `src/platform/ai/provider/structured.ts`. **First step:** in `src/features/agent-canvas/core/llm.ts`, replace `parseJSON`/`extractBalancedBlock`/`stripMarkdownFence` (`:1193-1405`) with imports of `extractJsonBlock`/`repairJson`/`parseStructured`, keeping its logging as a wrapper. ~60–80 LOC.
4. **Adopt `es-toolkit@1.47.1`** (one new dep, tree-shakeable, offline-safe) for `clamp` (~12 sites), `debounce`/`throttle` (2 copies), `uniq` (~4 sites). **First step:** add a `useDebouncedValue<T>` React wrapper around `es-toolkit/debounce`, then delete the two hand-rolled debounces; sweep `clamp` next.
5. **Consolidate `formatBytes`** (promote `settings/lib/format.ts` version to a shared util, delete the other 3) and replace folders' `formatAge` with `date-fns/formatDistanceToNowStrict`. Verify zero-case (`"—"` vs `"0 B"`) per call-site.

### Tier B — Store consolidation (low–med risk, biggest LOC/consistency win, zero new deps)

6. **Adopt `durablePersist`** in `settings-store`, `folders-store`, `activity-store`, `report-draft-store`, `shell-store`, `desktop-store`. **First step:** extend `tests/platform/storage/drizzle-storage.test.ts` to lock each store's persisted shape, then refactor one store at a time using `monitor-store.ts:287` as the template. ~120–150 LOC.
7. **Consolidate id generation** onto `newId()` / `newPrefixedId(prefix)` (or `nanoid` for short ids) across the ~12 sites; remove the `idSeq` module-global in `desktop-store.ts`. Then **drop `uuid`** if the import check confirms no consumers.
8. **COMPOSE the immer middleware** into `desktop-store` + `folders-store` only (the map/spread-heavy ones). Add a per-store regression test first; verify nothing mutates persisted slices in place (immer freezes by default).

### Tier C — UI a11y migrations (med risk, highest a11y payoff, zero new deps)

9. **Migrate hand-rolled modals → `Dialog`/`Sheet`.** Start with `file-management-modal.tsx`, `column-mapper.tsx`, `AchievementModal.tsx`, the channel-monitor incident dialogs, then `customer-profile-panel.tsx` → `Sheet`. Re-check `motion/react` enter/exit parity. Gains focus-trap/Esc/ARIA for free.
10. **`SegmentedControl` wrapper over `ToggleGroup`** + adopt across ~19 toggle sites.
11. **Adopt `Tabs`** on simple tab screens; leave lazy-mounted/animated ones bespoke (verify AiAnalysis perf).
12. **`DataTableShell`** for the repeated sticky-header table wrapper; adopt `@tanstack/react-table` only where sorting/filtering grows.

### Tier D — Larger / careful migrations (med risk)

13. **COMPOSE the 3 `parsed-data` hooks onto react-query.** Do `useDatasetCatalog` and `useColumnDetail` first; do `useDatasetProfile` last and carefully — wire `AbortController`/`signal` to the IPC `cancelToken` (`:151-155`) and verify cross-process cancellation parity.
14. **`useFreeDrag` hook** to dedupe the 3 desktop pointer-drag copies (`widgets-layer.tsx`, `snapshot-artifact.tsx`, `desktop-icons.tsx`); keep `desktop-icons` HTML5-DnD payload layer.
15. **Spread `@tanstack/react-form` + Zod** to auth (#1 highest value), alert-rule, and user-management forms. **First step:** create `shared/forms` exporting the `FieldError` helper (currently private in `account-panel.tsx:125-143`) + auth/alert/user Zod schemas.
16. **(Optional) `jsonrepair@3.14.0`** as the second candidate in `parseStructured` for more robust offline-LLM JSON recovery — requires approval (new dep); verify bundle impact via `size-limit`.

---

## 4. Already Good — Leave Alone

These are correct uses of the right library/pattern; **do not** refactor:

- **State platform:** `persist-helpers.ts` (`durablePersist`/`makeDeepMergeMigrate`/`pickKeys`), `create-selectors.ts` (thin `useShallow` wrapper), `app-db.ts` (Dexie schema, `newId()` at `:507`, `toCloneSafeValue`, `pruneByTimestamp`), `drizzle-storage.ts`, `store-mirror.ts`. `monitor-store.ts` is the reference adopter. Dexie correctly covers keyed storage — `idb-keyval` not needed.
- **Async data:** `query-provider.tsx` (offline-first rq defaults + Electron `focusManager` + IndexedDB hydrate/persist), `query-persister.ts` (offline-tailored debounced persister), `core/queries/{duckdb,datasets,files,folders}.ts` + `keys.ts` (queryKey factory), `useDuckDBQuery` (`duckdb.ts:37`, composed cleanly in `use-geo-data.ts:133-135`). AI streaming adapters (`ollama`/`openai`) correctly use raw `fetch`, not rq.
- **Utils:** `cn` (`src/lib/utils.ts:4`), `channel-monitor/lib/format-helpers.ts` (hoisted `Intl` + tree-shaken `date-fns`), `persist-helpers.ts:deepMergeDefaults` (deliberately non-standard).
- **UI:** `command-palette.tsx` (cmdk + fuse.js + ARIA), sonner toasts, desktop OS-shell context menus (deliberate aesthetic), `resizable.tsx`.
- **DnD/viz:** `react-rnd`, `@xyflow/react`, `elkjs` worker, `@dnd-kit` sortable, `react-grid-layout`. `swarm-canvas.tsx` bespoke DAG is a justified branding requirement.
- **Parsing:** `udsv`+`papaparse` dual engine, `comlink` plumbing, `apache-arrow`/`@uwdata/flechette` Arrow IPC, `simple-statistics`.
- **Forms:** `settings-schema.ts`, `controls.tsx`, `account-panel.tsx` (reference `useForm`).

---

## 5. Offline & Risk Caveats

- **Offline (hard constraint):** every recommended package is pure JS/ESM, bundleable, zero runtime network. `es-toolkit` (zero-dep), `nanoid`/`immer`/`@tanstack/*`/radix/`@dnd-kit-core`/`elkjs`/`udsv`/`papaparse`/`comlink`/`apache-arrow`/`flechette` are all already installed and offline-proven. `jsonrepair` and `partial-json` (the only genuinely new candidates beyond `es-toolkit`) are pure-JS, no native deps. The renderer DuckDB is **read-only** — none of these recommendations introduce CREATE/DROP; telecom enrichment must keep using inline CTEs.
- **immer freeze caveat:** immer freezes state by default. Before composing the middleware into `desktop-store`/`folders-store`, confirm nothing mutates a persisted slice in place; add a per-store regression test (repo anti-slop rule: lock behavior before editing).
- **react-query cache-key bloat (flag, not a fix):** `useDuckDBQuery` keys on the raw SQL string (`duckdb.ts:43`) and `useForecastData` uses `JSON.stringify(mapping)` (`use-forecast-data.ts:99`) — works, but long keys bloat the persisted cache. Minor; revisit only if cache size becomes an issue.
- **IPC cancellation parity (highest single risk):** the `useDatasetProfile` migration must preserve cross-process abort via the IPC `cancelToken` (`useDatasetProfile.ts:151-155`); verify cancellation parity before merging.
- **Motion parity on modal migration:** hand-rolled modals use `motion/react` enter/exit; the shadcn `Dialog` animates via `data-open`/`data-closed` (`dialog.tsx:42`). Re-check visual parity per modal.
- **Lazy-mount tabs:** some tab screens intentionally lazy-mount heavy panels via `{activeTab===x && …}`; radix `Tabs` mounts differently — verify perf-sensitive screens (AiAnalysis) keep conditional content before adopting.
- **Verification:** this audit was read-only. Re-run the import checks for `uuid` and the four dead deps before removal, and run lint/typecheck/tests after each refactor (per repo policy, prefer live dev-server compile over standalone `tsc`).
