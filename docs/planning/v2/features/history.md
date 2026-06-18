# Feature Plan — history

**Maturity:** partial

## Performance issues

- Full in-memory merge + sort of 4 stores on EVERY keystroke/render: HistoryScreen.tsx lines 90-132 concatenates datasets+transforms+queryHistory+events, allocates new objects, and re-sorts all rows; the useMemo dep array includes the raw arrays so any store mutation rebuilds everything.
- No virtualization: lines 217-281 render every row (potentially 500 activity + 200 query + N dataset/transform rows ~= 700+ DOM nodes) inside nested .map() with no windowing. TanStack Virtual is in the project but unused here.
- Per-row Framer Motion animation (motion.article, lines 231-236) mounts an animation controller for EVERY row, causing layout thrash and main-thread jank on large lists; delay is capped but still one animation node per item.
- Search/filter runs in JS on the main thread over the whole concatenated array (lines 134-146) with .toLowerCase() called repeatedly per row per keystroke — O(rows * fields) on every input change, no debounce, no memoized lowercased index.
- formatAgo / dayBucket call new Date() and toLocaleDateString() per row per render (lines 30-50, 256), which is expensive Intl work repeated for hundreds of rows on every filter change.
- Grouping (lines 148-157) rebuilds a Map from the full filtered list on every change; combined with the unbounded render this is recomputed needlessly.
- Query history is capped at 200 in memory but only 50 persisted (data-store.ts line 425); activity capped at 500 (activity-store.ts line 42). There is no pagination or time-window query, so the 'history' is silently truncated rather than backed by a durable queryable log.
- Dead/orphaned code shipped in the feature bundle: model/diff.ts (full Myers diff), model/types.ts (VersionEntry/ColumnDiff), components/history-widgets.tsx (DiffViewer/VersionBadge/AuthorAvatar) are not imported by HistoryScreen or anywhere else — pure bundle weight and maintenance noise.

## Offline gaps

- No true durable history log. Activity lives in zustand persisted via drizzle-storage (SQLite write-through) but is a single JSON blob capped at 500; query history is a 50-item slice in localStorage. There is no append-only, time-indexed, queryable event table — so 'history' cannot survive growth, cannot be filtered by date range at the data layer, and cannot be exported as a real audit log. This is a persistence-architecture gap, not a network gap (all current code is already offline).
- No export of history (CSV/JSON/Parquet) — an offline analyst cannot snapshot or share their activity log. The Tech Radar export stack (pdfmake/exceljs) is unused here.
- Diff machinery (Myers diff in model/diff.ts) implies a dataset-versioning/time-travel feature that is not wired to any real snapshot store; there is no offline version-content store (OPFS/Parquet snapshots) to diff against, so the diff code is non-functional offline (and everywhere).
- AuthorAvatar/author/email fields in VersionEntry suggest multi-user attribution, but there is no offline identity source wired (no Yjs Awareness / local profile), so collaboration history is unpopulated.
- No retention/compaction policy persisted durably: the 500/200/50 caps are arbitrary in-memory slices; a long-running offline desktop session will lose old events with no archival to disk.

## Recommended dependencies

| Package | Category | Stars | Maint. | License | Offline | Replaces | Why | URL |
|---|---|---|---|---|---|---|---|---|
| `@tanstack/react-virtual` | UI virtualization | ~6.8k (TanStack/virtual) | Very active, v3.x, multi-maintainer (TanStack org) | MIT | yes | hand-rolled full .map() render | Window the history timeline so only visible rows render; already a project dependency (TanStack Virtual in radar Adopt). Eliminates the 700+ DOM-node render and per-row Framer Motion cost. | https://github.com/TanStack/virtual |
| `dexie` | Offline persistence (IndexedDB) | ~14.3k | Very active, regular releases through 2026 | Apache-2.0 | yes | zustand JSON-blob activity log capped at 500 | Back the history log with an indexed, append-only IndexedDB table (by ts, source, datasetId) so filtering/date-range/pagination happen at the data layer instead of rebuilding the full array in JS. Radar Adopt for many small structured records. | https://github.com/dexie/Dexie.js |
| `@leeoniya/ufuzzy` | Search | ~2.3k | Active (leeoniya, also author of uPlot in radar) | MIT | yes | manual .includes() filter (HistoryScreen lines 134-146) | Tiny (~5kB) high-quality fuzzy search to replace naive substring .toLowerCase() scanning; builds a haystack once and runs filtered+ranked search fast on medium CPUs. Better relevance + outlining for the search box. | https://github.com/leeoniya/uFuzzy |
| `comlink` | Worker RPC | ~12.6k | Active (GoogleChromeLabs) | Apache-2.0 | yes | main-thread filtering | If the durable history grows large, move filter/search/group off the main thread into a worker via Comlink (radar Adopt). Keeps the timeline at 60fps while filtering thousands of events. | https://github.com/GoogleChromeLabs/comlink |
| `exceljs` | Export | ~15.4k | Stable maintenance-mode | MIT | yes | no current export path | Offline XLSX export of the history log via streaming WorkbookWriter (radar Adopt). Already in project; reuse for an 'Export history' action. | https://github.com/exceljs/exceljs |
| `y-protocols (Awareness)` | Local identity/attribution | y-crdt org (yjs ~19k) | Active | MIT | yes | hardcoded/empty author | Source local user identity for author attribution on history events without any cloud — radar Adopt. Populates the (currently dead) author/email fields offline. | https://github.com/yjs/y-protocols |

## CLIs & tools

| Tool | Type | Offline | Why | URL |
|---|---|---|---|---|
| `knip` | cli | yes | Detect and delete the orphaned history files (model/diff.ts, model/types.ts VersionEntry/ColumnDiff, components/history-widgets.tsx) — they are unused dead code in this feature. Already in repo. | https://github.com/webpro-nl/knip |
| `@next/bundle-analyzer / sonda` | cli | yes | Confirm the diff/widgets dead code (and Framer Motion per-row cost) leaves the history route bundle after cleanup; verify the route is light. | https://github.com/filipsobol/sonda |
| `react-scan` | library | yes | Visually catch the full-list re-render storm on every keystroke in the history timeline and confirm virtualization + debounce fix it. | https://github.com/aidenybai/react-scan |
| `tinybench (via Vitest bench)` | cli | yes | Microbench the merge+sort+filter+group pipeline (current vs Dexie-indexed vs worker) on representative event counts (1k/10k/100k). | https://github.com/tinylibs/tinybench |
| `dependency-cruiser` | cli | yes | Enforce that the history feature only depends on the new history data-access layer, not directly on 4 unrelated stores. | https://github.com/sverweij/dependency-cruiser |

---

# Deep Improvement Plan — Feature: `history` (Activity / Query History)

## 0. Scope and one-paragraph verdict

The `history` feature is a **read-only aggregated timeline** that merges four Zustand stores (datasets, transforms, query history, activity events) into one chronological list with search, a source filter, day-grouping, and KPI summary cards. The live screen (`src/features/history/screens/HistoryScreen.tsx`) is **functional and fully offline today** — there is no network code anywhere. But it is **partial**: it does the entire merge/sort/filter/group on the React main thread on every render, renders every row with a per-row Framer Motion animation and **no virtualization** (despite TanStack Virtual being in the project), and has **no durable, queryable, exportable history log** — it reads in-memory caps (500 activity / 200→50 query). Meanwhile the feature folder ships a large block of **orphaned dead code** — a full Myers diff implementation (`model/diff.ts`), `VersionEntry`/`ColumnDiff` types (`model/types.ts`), and diff/badge/avatar widgets (`components/history-widgets.tsx`) — none of which are imported by the live screen or anywhere else in `src/`. The plan below: (1) delete or repurpose the dead diff machinery, (2) make the timeline 60fps via virtualization + debounce + memoized derived index, (3) introduce a real append-only Dexie-backed history log with date-range/source indexes and export, and (4) optionally push filtering into a worker for large logs.

---

## 1. Current implementation (file-by-file)

### 1.1 Route
- `src/app/dashboard/history/page.tsx` — trivial wrapper, renders `<HistoryScreen />`. Fine as-is.

### 1.2 Live screen — `src/features/history/screens/HistoryScreen.tsx` (288 lines)
This is the **only** file that actually runs in the route. It is a `"use client"` component that:

- Subscribes to four store slices (lines 85-88):
  ```ts
  const datasets = useDataStore((s) => s.datasets);
  const transforms = useDataStore((s) => s.transforms);
  const queryHistory = useDataStore((s) => s.queryHistory);
  const events = useActivityStore((s) => s.events);
  ```
- Builds a unified `HistoryRow[]` by mapping each store into a common shape and concatenating + sorting (lines 90-132). `HistoryRow` is a **local type** (lines 20-28), unrelated to `model/types.ts`.
- Filters by free-text `q` and a `kind` selector (lines 134-146).
- Groups by `dayBucket` (lines 148-157).
- Renders KPI `SummaryCard`s (lines 203-208) and a grouped, per-row animated list (lines 210-284), each row using `sourceStyle()` for icon/color and `formatAgo()` for relative time.

Helper functions live inline: `formatAgo` (30-40), `dayBucket` (42-50), `sourceStyle` (52-79).

### 1.3 Orphaned model + widgets (NOT used by the live screen)
- `src/features/history/model/types.ts` — `VersionEntry` (a git-like dataset version record with author/email/hash/branch/changes), `DiffLine`, `ColumnDiff`. **Only `DiffLine` is consumed — by the also-orphaned `diff.ts` and `history-widgets.tsx`.**
- `src/features/history/model/diff.ts` — a full **Myers diff algorithm** (`computeDiff`, `backtrack`, `applyContextWindow`). ~137 lines. Correct but **unreferenced** outside the feature.
- `src/features/history/model/format.ts` — `formatBytes`, `formatAge`, `typeColor`, `typeIcon` for `VersionEntry`. Only used by `history-widgets.tsx`.
- `src/features/history/components/history-widgets.tsx` — `VersionBadge`, `AuthorAvatar`, `DiffViewer`. **Not imported anywhere outside the feature** (verified: `grep -rn "history-widgets|computeDiff|DiffViewer|VersionBadge"` over `src/` excluding the feature folder returns nothing). The `*.stories.tsx` files exercise them in Storybook only.

> **Conclusion:** the diff/version machinery is a half-built "dataset version history / time-travel" feature that was never wired to a real snapshot store. It is dead weight in the route bundle and a maintenance liability. Decide deliberately: **delete** it now (recommended for P1) or **promote** it into a real versioning subfeature (P3, see §6).

### 1.4 Backing stores
- `src/core/stores/activity-store.ts` — `useActivityStore`, persisted under `workspace-activity-v1` via `createDrizzleStorage` (SQLite write-through). `addEvent` prepends and **slices to 500** (line 42). Six `ActivityType`s. ~10 call sites across features (`query-provider`, `data-browser`, `data-formulator`, etc.).
- `src/core/stores/data-store.ts` — `useDataStore`. `queryHistory` capped at **200** in memory (line 378), persisted as **50** (line 425, `localStorage`). `transforms` unbounded but small. `addQueryHistory`/`addTransform` called from `core/queries/datasets.ts` and `dashboard-shell/ai-panel.tsx`.
- `src/platform/storage/drizzle-storage.ts` — zustand `StateStorage` backed by drizzle `app_setting` table with a synchronous localStorage write-through; durable per-store **single JSON row**. This is the key constraint: the activity log is **one blob**, not rows — you cannot range-query it.

---

## 2. Performance bottlenecks and exact fixes

### 2.1 Full re-merge + re-sort on every render
**Problem.** `rows` (lines 90-132) maps four arrays into new objects, concatenates, and sorts. The `useMemo` deps are the raw arrays, so any unrelated store write (e.g. a new query elsewhere) rebuilds everything. Then `filtered` re-scans, then `grouped` rebuilds a Map. On a keystroke, `filtered`+`grouped` recompute over the full list.

**Fix A — memoize a normalized, lowercased index once.** Precompute a searchable haystack per row so the keystroke path is cheap:
```ts
type IndexedRow = HistoryRow & { _hay: string };

const indexed = useMemo<IndexedRow[]>(() => {
  const norm = (r: HistoryRow): IndexedRow => ({
    ...r,
    _hay: `${r.message} ${r.type} ${r.table ?? ""} ${r.dataset ?? ""}`.toLowerCase(),
  });
  // build + sort ONCE per store change, not per keystroke
  const all = [...aRows, ...dsRows, ...tfRows, ...qRows].map(norm);
  all.sort((a, b) => b._ts - a._ts); // precompute numeric _ts too
  return all;
}, [datasets, events, queryHistory, transforms]);
```
Store a numeric `_ts = new Date(when).getTime()` at build time so sort/group never re-parse dates.

**Fix B — debounce the query.** The text input drives `filtered`. Debounce ~120ms so we don't filter on every character:
```ts
const [qRaw, setQRaw] = useState("");
const q = useDeferredValue(qRaw); // React 18+, zero-dep, yields to rendering
```
`useDeferredValue` is the lightest option (no new dep) and lets the timeline keep painting while the filter catches up.

### 2.2 No virtualization (the big one)
**Problem.** Lines 217-281 render every row of every day group. With 500 activity + 200 query + datasets/transforms ~= **700-1000 DOM nodes**, each a `motion.article` with an animation controller. This is the dominant jank source on a 4-8 core / integrated-GPU target.

**Fix — TanStack Virtual over a flattened list.** Flatten groups into a single array of `{ kind: "header" } | { kind: "row" }` items and virtualize:
```tsx
import { useVirtualizer } from "@tanstack/react-virtual";

type FlatItem =
  | { kind: "header"; day: string; count: number }
  | { kind: "row"; row: IndexedRow };

const flat = useMemo<FlatItem[]>(() => {
  const out: FlatItem[] = [];
  for (const [day, rows] of grouped) {
    out.push({ kind: "header", day, count: rows.length });
    for (const row of rows) out.push({ kind: "row", row });
  }
  return out;
}, [grouped]);

const parentRef = useRef<HTMLDivElement>(null);
const virt = useVirtualizer({
  count: flat.length,
  getScrollElement: () => parentRef.current,
  estimateSize: (i) => (flat[i].kind === "header" ? 36 : 84),
  overscan: 12,
});

return (
  <div ref={parentRef} className="h-[70vh] overflow-auto">
    <div style={{ height: virt.getTotalSize(), position: "relative" }}>
      {virt.getVirtualItems().map((v) => {
        const item = flat[v.index];
        return (
          <div
            key={v.key}
            data-index={v.index}
            ref={virt.measureElement}
            style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${v.start}px)` }}
          >
            {item.kind === "header"
              ? <DayHeader day={item.day} count={item.count} />
              : <HistoryRowView row={item.row} />}
          </div>
        );
      })}
    </div>
  </div>
);
```
**Drop the per-row Framer Motion.** With virtualization, mount/unmount churn makes per-row entrance animations both pointless and janky. Replace with a single CSS fade on the scroll container, or animate only the first paint. This removes hundreds of animation controllers.

`@tanstack/react-virtual` is already a project dependency (TanStack Virtual is in the radar Adopt list) and verified active (~6.8k stars, v3.x, MIT — [TanStack/virtual](https://github.com/TanStack/virtual)).

### 2.3 Per-row `Intl`/Date work
**Problem.** `formatAgo` and `dayBucket` call `new Date(...)` + `toLocaleDateString` per row per render (lines 30-50, 256). `toLocaleDateString` is surprisingly expensive at scale.

**Fix.** (1) Precompute `_ts` once (§2.1). (2) For day bucket, derive a sortable `YYYY-MM-DD` key from `_ts` cheaply and format the human label once per *group* (there are at most ~dozens of days), not per row. (3) Cache an `Intl.DateTimeFormat` instance instead of calling `toLocaleDateString` repeatedly:
```ts
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });
// format only distinct day keys, memoized
```

### 2.4 Naive substring search
**Problem.** Lines 134-146 do `.toLowerCase().includes()` across 4 fields per row per keystroke. With the memoized `_hay` (§2.1) this is already much better, but ranking/relevance is poor.

**Fix (optional, P2).** Swap to `@leeoniya/uFuzzy` (~2.3k stars, MIT, ~5kB — [uFuzzy](https://github.com/leeoniya/uFuzzy)). Build the haystack once from `_hay`, run `search()` for filtered+ranked indices, and use its `highlight()` to mark matches in the message. uFuzzy is from the same author as uPlot (in the radar) and is explicitly designed for fast medium-CPU client search:
```ts
import uFuzzy from "@leeoniya/ufuzzy";
const uf = useMemo(() => new uFuzzy(), []);
const haystack = useMemo(() => indexed.map((r) => r._hay), [indexed]);
const order = useMemo(() => {
  if (!q) return indexed.map((_, i) => i);
  const idxs = uf.filter(haystack, q);
  if (!idxs) return [];
  const info = uf.info(idxs, haystack, q);
  return uf.sort(info, haystack, q).map((i) => idxs[i]);
}, [q, haystack, indexed]);
```

### 2.5 Off-main-thread filtering for large logs (P3)
Once the history is durable and can hold tens of thousands of rows (§3), move build/filter/group into a Web Worker via **Comlink** (radar Adopt, ~12.6k stars, Apache-2.0 — [comlink](https://github.com/GoogleChromeLabs/comlink)). The worker owns the Dexie cursor + uFuzzy index; the UI only ever receives the current virtual window. This keeps the main thread free even at 100k events.

---

## 3. Offline gaps and how to close them

> Everything here is already offline (no network). The gaps are **persistence-architecture** gaps, not connectivity gaps.

### 3.1 No durable, queryable history log
**Gap.** Activity = a single JSON blob capped at 500 (`activity-store.ts:42`); query history persisted as 50 (`data-store.ts:425`). A long offline desktop session silently loses old events; you cannot range-query by date or paginate at the data layer.

**Fix — append-only Dexie table.** Introduce a dedicated history log keyed and indexed for the exact access patterns the screen needs (sort by ts desc, filter by source, range by day). Dexie is radar-Adopt (~14.3k stars, Apache-2.0, active 2026 — [Dexie.js](https://github.com/dexie/Dexie.js)).

```ts
// src/features/history/data/history-db.ts
import Dexie, { type Table } from "dexie";

export interface HistoryEvent {
  id: string;            // ulid/uuid
  ts: number;            // epoch ms (primary sort)
  day: string;           // "2026-06-11" (range/group index)
  source: "activity" | "dataset" | "transform" | "query";
  type: string;
  message: string;
  datasetId?: string;
  tableName?: string;
  author?: string;       // from local identity (§3.4)
  meta?: Record<string, unknown>;
}

class HistoryDB extends Dexie {
  events!: Table<HistoryEvent, string>;
  constructor() {
    super("data-navigator-history");
    this.version(1).stores({
      // compound + single indexes for the screen's filters
      events: "id, ts, day, source, datasetId, [source+ts], [day+source]",
    });
  }
}
export const historyDB = new HistoryDB();

export async function appendHistory(e: Omit<HistoryEvent, "id" | "day">) {
  const day = new Date(e.ts).toISOString().slice(0, 10);
  await historyDB.events.add({ ...e, id: crypto.randomUUID(), day });
}

// paged, indexed read — no full-array merge in JS
export async function pageHistory(opts: {
  source?: HistoryEvent["source"]; before?: number; limit: number;
}) {
  let coll = opts.source
    ? historyDB.events.where("[source+ts]").between([opts.source, Dexie.minKey], [opts.source, opts.before ?? Dexie.maxKey])
    : historyDB.events.where("ts").below(opts.before ?? Infinity);
  return coll.reverse().limit(opts.limit).toArray();
}
```

**Migration / dual-write.** Keep the existing Zustand stores as the *write API* used across the app, but add a thin subscriber that mirrors every new event into Dexie. The history screen then reads from Dexie (paged) instead of merging four stores:
```ts
// one-time on app boot: mirror future events
useActivityStore.subscribe((s, prev) => {
  const fresh = s.events.filter((e) => !prev.events.includes(e));
  for (const e of fresh) appendHistory({ ts: Date.parse(e.createdAt), source: "activity", type: e.type, message: e.message, datasetId: e.datasetId, tableName: e.tableName });
});
// similar subscribers for queryHistory / transforms / datasets.updatedAt
```
Backfill once from current store contents on first run (guard with a `historyDB` count check). The Dexie store becomes the source of truth for *history*; the Zustand caps can be lowered safely because nothing is lost.

### 3.2 No export
**Gap.** An offline analyst cannot snapshot/share their activity log.

**Fix.** Add an "Export history" action. For CSV/JSON, stream from Dexie. For XLSX use **exceljs** streaming `WorkbookWriter` (radar Adopt, already in project, ~15.4k stars, MIT — [exceljs](https://github.com/exceljs/exceljs)) in a worker or Electron main:
```ts
async function exportHistoryCsv() {
  const rows: string[] = ["ts,source,type,message,dataset,table"];
  await historyDB.events.orderBy("ts").reverse().each((e) => {
    rows.push([new Date(e.ts).toISOString(), e.source, e.type, JSON.stringify(e.message), e.datasetId ?? "", e.tableName ?? ""].join(","));
  });
  downloadBlob(new Blob([rows.join("\n")], { type: "text/csv" }), "history.csv");
}
```

### 3.3 Retention / compaction
**Gap.** Arbitrary 500/200/50 in-memory caps.

**Fix.** With Dexie, implement an explicit, durable retention policy (e.g. keep last N days, or cap at M rows with oldest-pruned) run on boot/idle:
```ts
async function pruneHistory(maxRows = 50_000) {
  const total = await historyDB.events.count();
  if (total <= maxRows) return;
  const excess = total - maxRows;
  const old = await historyDB.events.orderBy("ts").limit(excess).primaryKeys();
  await historyDB.events.bulkDelete(old);
}
```

### 3.4 Author attribution (dead `VersionEntry.author/email`)
**Gap.** The version model has author/email but no offline identity source.

**Fix (if you keep attribution).** Source identity from local Yjs **Awareness** (`y-protocols`, radar Adopt) or a simple local profile in settings — never a cloud account. Stamp `author` on `appendHistory`.

---

## 4. Better architecture (step-by-step)

### Layering
```
src/features/history/
  data/
    history-db.ts        // Dexie schema + append/page/prune/export (NEW)
    history-mirror.ts    // store→Dexie subscribers + one-time backfill (NEW)
    use-history.ts       // hook: paged query + filter state (NEW)
  model/
    types.ts             // KEEP only HistoryEvent/HistoryRow; remove VersionEntry/ColumnDiff unless §6
    format.ts            // keep formatAgo/dayBucket helpers (move from screen)
  components/
    HistoryRow.tsx       // memoized row view (NEW, extracted)
    DayHeader.tsx        // group header (NEW)
    HistoryToolbar.tsx   // search + source filter + export (NEW)
  screens/
    HistoryScreen.tsx    // thin: toolbar + virtualized list
```
Delete `model/diff.ts` + `components/history-widgets.tsx` (and the diff-only parts of `model/types.ts`/`format.ts`) unless promoting versioning (§6).

### The hook
```ts
// src/features/history/data/use-history.ts
export function useHistory() {
  const [source, setSource] = useState<HistoryEvent["source"] | "all">("all");
  const [qRaw, setQRaw] = useState("");
  const q = useDeferredValue(qRaw);

  // liveQuery re-runs only when the Dexie table changes for the active filter
  const all = useLiveQuery(
    () => (source === "all"
      ? historyDB.events.orderBy("ts").reverse().limit(2000).toArray()
      : historyDB.events.where("source").equals(source).reverse().limit(2000).toArray()),
    [source],
    [] as HistoryEvent[],
  );

  const uf = useMemo(() => new uFuzzy(), []);
  const haystack = useMemo(() => all.map((e) => `${e.message} ${e.type} ${e.tableName ?? ""}`.toLowerCase()), [all]);
  const filtered = useMemo(() => {
    if (!q) return all;
    const idxs = uf.filter(haystack, q);
    return idxs ? idxs.map((i) => all[i]) : [];
  }, [q, all, haystack, uf]);

  return { source, setSource, qRaw, setQRaw, events: filtered };
}
```
`useLiveQuery` (from `dexie-react-hooks`) gives reactive offline queries with no manual subscription wiring. Note the explicit `.limit(2000)` — we never load the entire log into the renderer; deeper history is reached via "load older" pagination (`pageHistory` with a `before` cursor) appending to the virtualized list.

### The screen (final shape)
```tsx
export default function HistoryScreen() {
  const { source, setSource, qRaw, setQRaw, events } = useHistory();
  const grouped = useMemo(() => groupByDay(events), [events]);   // cheap: events already bounded
  const flat = useMemo(() => flatten(grouped), [grouped]);
  const parentRef = useRef<HTMLDivElement>(null);
  const virt = useVirtualizer({ count: flat.length, getScrollElement: () => parentRef.current, estimateSize: (i) => flat[i].kind === "header" ? 36 : 84, overscan: 12 });
  // ... render toolbar + virtualized container (see §2.2)
}
```

### Why this is faster on a medium PC
- **Data-layer filtering** (Dexie indexes) replaces O(rows) JS scans; only ~2k rows ever reach the renderer regardless of total log size.
- **Virtualization** caps DOM nodes to the viewport (~20-30) instead of 700-1000.
- **No per-row animation controllers.**
- **Deferred search** keeps the input responsive.
- **Optional worker** (§2.5) removes even the bounded JS work from the main thread for very large logs.

---

## 5. Recommended dependencies (verified)

| Dep | ~Stars | Maint. | License | Offline | Bundle | Why | URL |
|---|---|---|---|---|---|---|---|
| @tanstack/react-virtual | ~6.8k | Very active, v3, MIT, multi-maintainer | MIT | yes | ~10-15kB | Virtualize the timeline; already a project dep (radar Adopt) | https://github.com/TanStack/virtual |
| dexie (+ dexie-react-hooks) | ~14.3k | Active 2026 | Apache-2.0 | yes | ~25kB | Durable, indexed, paginatable append-only history log (radar Adopt) | https://github.com/dexie/Dexie.js |
| @leeoniya/ufuzzy | ~2.3k | Active (uPlot author) | MIT | yes | ~5kB | Fast ranked fuzzy search + highlight on medium CPUs | https://github.com/leeoniya/uFuzzy |
| comlink | ~12.6k | Active (GoogleChromeLabs) | Apache-2.0 | yes | ~1.1kB | Move filtering/grouping off main thread at scale (radar Adopt) | https://github.com/GoogleChromeLabs/comlink |
| exceljs | ~15.4k | Stable maintenance | MIT | yes | n/a | Offline XLSX export of the log (radar Adopt, in project) | https://github.com/exceljs/exceljs |
| y-protocols (Awareness) | y-crdt org | Active | MIT | yes | small | Local offline author attribution (radar Adopt) | https://github.com/yjs/y-protocols |

**Deliberately NOT recommended:** any new date library — keep using the tiny inline `formatAgo`/`Intl.DateTimeFormat`; `date-fns` (~36.5k) / `dayjs` (~48.6k) are both fine but add weight for what is ~15 lines of code here. No `react-window` (TanStack Virtual already present). No `fuse.js` (heavier than uFuzzy for this).

---

## 6. Optional: promote the dead diff machinery into real dataset versioning (P3)

If product wants the git-like "dataset version history / time-travel" that `VersionEntry`/`computeDiff`/`DiffViewer` imply, **wire it to a real offline snapshot store** rather than deleting:
- On each transform, write a **Parquet snapshot** of the dataset to OPFS/disk (Electron main, DuckDB `COPY`), recording a `VersionEntry` row in Dexie/SQLite (hash = content hash of the Parquet).
- Diff **schemas + summary stats** (cheap), and only diff a **sampled subset of rows** as text via the existing `computeDiff` (it is correct) for a "what changed" view — never diff millions of rows on the main thread; run `computeDiff` in a worker.
- Reuse `DiffViewer`/`VersionBadge`/`AuthorAvatar` as the UI. This makes the currently-dead code load-bearing.
Until then, the code is unused and should be removed to keep the route bundle lean (see `knip`).

---

## 7. CLIs & tools (offline)
- **knip** ([webpro-nl/knip](https://github.com/webpro-nl/knip)) — already in repo; run to confirm and delete the orphaned `diff.ts` / `history-widgets.tsx` / unused `VersionEntry`/`ColumnDiff`.
- **@next/bundle-analyzer / sonda** ([sonda](https://github.com/filipsobol/sonda)) — verify the history route bundle shrinks after dead-code removal and Framer-Motion-per-row removal.
- **react-scan** ([react-scan](https://github.com/aidenybai/react-scan)) — visually confirm the keystroke re-render storm is gone after virtualization + `useDeferredValue`.
- **tinybench via Vitest bench** ([tinybench](https://github.com/tinylibs/tinybench)) — bench merge+sort+filter+group at 1k/10k/100k events: current vs Dexie-indexed vs worker.
- **dependency-cruiser** ([dependency-cruiser](https://github.com/sverweij/dependency-cruiser)) — add a rule that the history screen depends only on `features/history/data/*`, not directly on four cross-cutting stores.

### Perf budget targets
- Initial route JS (history chunk): **< 60kB gz** after removing diff/widgets dead code + Motion-per-row.
- Keystroke→repaint with 2k visible events: **< 16ms** main-thread work (verify with react-scan + Performance panel).
- Scroll at 10k+ log size: steady 60fps, **DOM nodes ≤ ~40** in the list.

---

## 8. Phased task list

### P1 — correctness, dead code, quick perf wins (no new deps)
1. **Delete** `model/diff.ts`, `components/history-widgets.tsx`, and the `VersionEntry`/`ColumnDiff` types + `format.ts` diff helpers (or move to a `versioning` feature stub if §6 is greenlit). Run `knip` to confirm zero remaining references; update the orphaned `*.stories.tsx`.
2. In `HistoryScreen.tsx`: precompute `_ts` and `_hay` per row in the build `useMemo`; sort/group on `_ts` numerically; cache one `Intl.DateTimeFormat`; format day labels per-group not per-row.
3. Replace `q` state usage with `useDeferredValue` for the filter path.
4. **Virtualize** the list with `@tanstack/react-virtual` (already present) over a flattened header/row list; **remove per-row `motion.article`**.

### P2 — durable, queryable, exportable log
5. Add `features/history/data/history-db.ts` (Dexie schema + indexes) and `history-mirror.ts` (store→Dexie subscribers + one-time backfill, idempotent).
6. Add `use-history.ts` with `useLiveQuery` paged reads + source filter at the data layer; switch the screen to read from it. Add "load older" cursor pagination.
7. Add `@leeoniya/ufuzzy` ranked search + match highlighting in the message.
8. Add "Export history" (CSV/JSON via Dexie stream; XLSX via exceljs in worker/Electron main).
9. Add a durable retention/compaction policy (`pruneHistory`) on boot/idle; lower the in-memory Zustand caps now that nothing is lost.

### P3 — scale + optional versioning
10. Move build/filter/group into a Comlink worker that owns the Dexie cursor + uFuzzy index for 100k+ logs; UI receives only the virtual window.
11. (Optional) Promote diff machinery into a real Parquet-snapshot dataset-versioning subfeature (§6): worker-run diffs, schema+stat diffs, reuse `DiffViewer`.
12. (Optional) Local author attribution via y-protocols Awareness / settings profile.
13. Add dependency-cruiser rule + size-limit per-route budget; add tinybench bench to CI report.

---

## 9. Risk notes
- **Dual-write/backfill must be idempotent** — guard backfill with a Dexie count + a stored `backfillVersion` flag so re-runs don't duplicate events.
- **`crypto.randomUUID()`** is available in Electron renderer + secure contexts; fall back to a ULID generator if running in a non-secure dev origin.
- **Removing per-row animation** is a deliberate UX tradeoff; if entrance motion is desired, animate only newly-prepended top rows, not the whole virtualized set.
- **Keep the Zustand stores as the app-wide write API** during migration to avoid touching ~10 call sites; the history feature only changes its *read* path first, then the mirror handles durability.