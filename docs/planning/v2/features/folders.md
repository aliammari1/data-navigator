# Feature Plan — folders — Folder/dataset organization tree

**Maturity:** functional

## Performance issues

- O(n^2) tree rendering: every TreeNode calls allNodes.filter(n => n.parentId === node.id) on each render (FoldersScreen.tsx:164). With N nodes this is O(N^2) per full render. A flat index (Map<parentId, children[]>) built once would make it O(N).
- No virtualization: the entire tree and all list/grid items render to the DOM at once (TreeNode recursion at :276-291, list map at :1133, FileGrid map at :314). @tanstack/react-virtual is already a dependency but unused here.
- getFolderSize() (line 125) is fully recursive and re-walks all descendants per root folder on every storageChart recompute; it re-filters allNodes at each recursion level.
- Heavy Framer Motion usage: 23 motion.* nodes including per-item entry animations with index-based stagger delays (FileGrid delay idx*0.03 at :322; recent list idx*0.03 at :1255). Staggered animation on large lists janks the main thread.
- AnimatePresence height auto expand/collapse on every tree branch (:260-294) forces layout thrash (height:0 -> auto measurement) on each toggle.
- filteredChildren recomputes a full copy + sort on every keystroke in search (:614-652) with no debounce, on the render thread.
- fuse.js is in package.json but search uses naive .toLowerCase().includes (:617-622) — no ranking, no typo tolerance, full linear scan per keystroke.
- TreeNode is not memoized and receives new inline closure props (onDragStart/onDragOver recreated at :1017-1022), so the whole subtree re-renders on any drag hover state change.
- drag.over is set on every onDragOver fire into top-level state (:1020), re-rendering the entire tree on each mousemove-over-target.
- echarts-for-react pulls the full echarts build (dynamic import at :36) for two charts rather than a tree-shaken core+pie+bar.
- sizeBytes is 0 for catalog/transform datasets (data-store.ts:212), so 'Total Size' and 'Storage by Folder' render empty; folder size aggregation is meaningless on the common path.
- moveFolder (folders-store.ts:88) has no descendant-cycle guard — dropping a folder into its own child creates a cycle that makes getFolderSize and the tree walk infinite-loop / stack-overflow.

## Offline gaps

- No true offline gaps — persistence is local SQLite via createDrizzleStorage (folders-store.ts:117) with localStorage write-through, fully offline. But the 'shared'/'Globe' and 'locked' flags are hardcoded false (FoldersScreen.tsx:464,481) implying a cloud-sharing concept with no offline implementation; remove them or back with the local Yjs/Hocuspocus LAN path.
- Folder/dataset organization lives only in the Zustand JSON blob; there is no DuckDB-side catalog table, so search and storage rollups are done in JS over an in-memory array rather than SQL-pushed to the native engine. Not a network gap, a missed local-engine opportunity.
- sizeBytes and folder size rollups are recomputed in the renderer rather than cached as columns; offline-friendly caching is missing.
- No OPFS/IndexedDB preview/thumbnail cache for grid view; derived display data recomputed each render. Offline-capable but unoptimized.

## Recommended dependencies

| Package | Category | Stars | Maint. | License | Offline | Replaces | Why | URL |
|---|---|---|---|---|---|---|---|---|
| `@tanstack/react-virtual` | virtualization | 5.5k | Very active (v3) | MIT | yes | unbounded full-tree DOM render | ALREADY a dependency (package.json:103) but unused in folders. Virtualize the flattened tree and list/grid so only visible rows mount. Single biggest DOM-count win. | https://github.com/TanStack/virtual |
| `@headless-tree/react` | tree-component | 0.85k | Very active; v1.7.0 May 2026; successor to react-complex-tree | MIT | yes | hand-rolled TreeNode recursion + DragState | Headless tree model: flat-node output (virtualization-ready), built-in keyboard nav, typeahead search, async loading, correct ARIA tree semantics, drag-drop with ordering — replaces the hand-rolled recursive TreeNode + manual drag state. | https://github.com/lukasbach/headless-tree |
| `react-arborist` | tree-component | 3.6k | Active; v3.10.x 2025 | MIT | yes | hand-rolled tree + own virtualization | ALTERNATIVE batteries-included tree: built-in virtualization (react-window), inline rename, multi-select, drag-drop, Unix tree lines. Heavier/opinionated but faster to adopt than headless-tree. | https://github.com/brimdata/react-arborist |
| `@dnd-kit/core` | drag-drop | 17.2k | Stable but slow (v6.3.1, ~2yr) | MIT | yes | native HTML5 draggable handlers | ALREADY a dependency (package.json:83-87) but unused in folders. Accessible pointer+keyboard DnD; use only if NOT using the tree lib's own DnD to avoid double-wiring. | https://github.com/clauderic/dnd-kit |
| `fuse.js` | search | 20k | Active | Apache-2.0 | yes | substring .includes filter | ALREADY a dependency (package.json:127) but folder search uses naive .includes. Wire it for ranked, typo-tolerant search over name+tags+description; build the index once from the flat node list. | https://github.com/krisk/fuse |
| `@leeoniya/uFuzzy` | search | 2.9k | Active (uPlot author) | MIT | yes | fuse.js (at very large N) | OPTIONAL faster/lighter alt to fuse.js: ~7.5kB, <1ms startup, 5ms over 162k phrases, superior out-of-order matching. Use if catalog grows to tens of thousands of datasets. | https://github.com/leeoniya/uFuzzy |
| `echarts (core + PieChart + BarChart)` | charts | 63k | Very active (Apache) | Apache-2.0 | yes | full echarts via echarts-for-react | Replace echarts-for-react's full-bundle import (FoldersScreen.tsx:36) with tree-shaken echarts/core + only PieChart/BarChart + CanvasRenderer to cut the stats-tab bundle. Already the project chart workhorse. | https://github.com/apache/echarts |

## CLIs & tools

| Tool | Type | Offline | Why | URL |
|---|---|---|---|---|
| `@next/bundle-analyzer` | cli | yes | Already in repo. Confirm the echarts-for-react full-bundle bloat on the folders/stats route before/after tree-shaking. | https://www.npmjs.com/package/@next/bundle-analyzer |
| `size-limit (@size-limit/preset-app)` | cli | yes | Already in repo. Add a per-route byte+eval budget for /dashboard/folders so the stats charts and tree libs stay bounded. | https://github.com/ai/size-limit |
| `react-scan` | library | yes | Detect the O(N^2) re-renders from unmemoized TreeNode and drag.over churn while scrolling/dragging a large tree. | https://github.com/aidenybai/react-scan |
| `vitest + @testing-library/react` | library | yes | Lock behavior of the folder tree (move/cycle-guard, delete-cascade, star, search) with regression tests before refactoring to a tree lib. | https://github.com/vitest-dev/vitest |
| `tinybench (Vitest bench)` | library | yes | Microbenchmark the flat-index build + fuzzy search over synthetic 10k/50k node catalogs to validate the O(N) rewrite. | https://github.com/tinylibs/tinybench |
| `axe-core / vitest-axe` | library | yes | Verify the new tree exposes correct ARIA tree/treeitem roles (headless-tree provides them) and keyboard nav — current role=button rows are not a real a11y tree. | https://github.com/dequelabs/axe-core |

---

# Deep Improvement Plan — `folders` (Folder/Dataset Organization Tree)

## 0. Scope and verdict

`folders` is a **functional** feature: it renders a real, persisted folder tree over the
live dataset catalog, supports create/rename/move/star/delete, drag-and-drop placement,
three view modes (tree+grid, grid, list), four tabs (files/starred/recent/stats), search,
sort, type filter, and two ECharts visualizations. It is wired to real Zustand stores with
durable local persistence — **no network/cloud dependency, fully offline-correct.**

The problems are almost entirely **performance and architecture**, not correctness or
offline gaps:

1. The tree is hand-rolled with **O(N^2) child lookups** (`allNodes.filter(...)` per node).
2. **Nothing is virtualized** even though `@tanstack/react-virtual` is already installed.
3. **Three already-installed libraries are unused here**: `@tanstack/react-virtual`,
   `@dnd-kit/*`, and `fuse.js`. Search uses naive `.includes`; DnD uses raw HTML5
   `draggable`; rendering mounts every node.
4. Heavy, index-staggered **Framer Motion** animations on potentially large lists.
5. A real **correctness bug**: `moveFolder` has no descendant-cycle guard, which can create
   an infinite recursion in `getFolderSize` / the tree walk.

This plan keeps the existing data model and stores (they are good), fixes the algorithmic
core, adopts a headless tree + virtualization, wires the already-present deps, and pushes
heavy aggregation toward cached/SQL paths.

---

## 1. Current implementation (file-by-file)

### 1.1 Entry + screen
- `src/app/dashboard/folders/page.tsx` (5 lines) — thin wrapper, renders `<FoldersScreen />`.
- `src/features/folders/screens/FoldersScreen.tsx` (1421 lines) — the entire feature in one
  client component. Contains:
  - Types `NodeType`, `FSNode`, `DragState` (:40-64).
  - Utilities `formatBytes`, `formatAge`, `fileTypeStyle`, `qualityColor`,
    `getFolderSize` (:68-131).
  - `TreeNode` recursive component (:150-297).
  - `FileGrid` (:301-388).
  - `FoldersScreen` default export (:392-1421) holding **all** UI state, derivations, chart
    configs, handlers, and JSX.
- `src/features/folders/screens/FoldersScreen.stories.tsx` (29 lines) — Storybook story.

### 1.2 State + persistence
- `src/core/stores/folders-store.ts` (120 lines) — `useFoldersStore` (Zustand + `persist`):
  - `folders: CatalogFolder[]`, `datasetFolderMap: Record<string, string|null>`,
    `starredDatasets: string[]`.
  - Actions: `addFolder`, `removeFolder` (recursive descendant collection + orphan-to-root),
    `renameFolder`, `starFolder`, `moveFolder`, `moveDataset`, `removeDatasetFromMap`,
    `starDataset`.
  - Persisted via `createDrizzleStorage({ namespace: "store" })` (:117) — **durable local
    SQLite + localStorage write-through. Offline-correct.**
- `src/core/queries/folders.ts` (280 lines) — TanStack Query hooks wrapping the store
  (`useFolders`, `useAllFolders`, `useFolder`, `useDatasetFolderMap`, `useStarredDatasets`)
  and mutations. **`FoldersScreen` does NOT use these hooks** — it calls the Zustand store
  actions directly (:399-410). The query layer is effectively dead code for this screen.
- `src/core/queries/keys.ts` (:59-66) — `queryKeys.folders.*` factory.
- `src/core/stores/data-store.ts` — `Dataset` interface (:32-82) is the source of file
  nodes; `sizeBytes` is `0` for catalog/transform datasets (:212), `qualityScore` computed
  in `computeQualityScore` (:455).

### 1.3 Data flow
`FoldersScreen` reads `datasets` from `useDataStore` and the folder catalog from
`useFoldersStore`, then in a single `useMemo` (`nodes`, :437-487) builds a flat `FSNode[]`:
a synthetic `root` + folder nodes + dataset nodes. Everything downstream
(`currentChildren`, `filteredChildren`, `starredNodes`, `recentNodes`, charts, breadcrumb)
derives from this `nodes` array via repeated `.filter`/`.find`/`.sort`.

---

## 2. Performance bottlenecks and exact fixes

### 2.1 O(N^2) tree: child lookup per node
**Where:** `TreeNode` body, `const children = allNodes.filter(n => n.parentId === node.id)`
(:164), called for **every** rendered node, and again in the sort/map (:269). With a tree of
N nodes this is O(N) per node = **O(N^2) per render**. Plus `nodes.find(...)` scans appear
in `handleSelect` (:502), `handleStar` (:515), `handleDelete` (:529), `handleDrop`
(:563-565), `currentChildren` (:608), `breadcrumb` (:678-682) — each O(N).

**Fix:** Build a child index once and pass it down. Replace per-node `.filter` with `Map`.

```ts
// useFolderIndex.ts
import { useMemo } from "react";
import type { FSNode } from "./types";

export interface FolderIndex {
  byId: Map<string, FSNode>;
  childrenOf: Map<string | null, FSNode[]>; // parentId -> sorted children
}

export function buildFolderIndex(nodes: FSNode[]): FolderIndex {
  const byId = new Map<string, FSNode>();
  const childrenOf = new Map<string | null, FSNode[]>();
  for (const n of nodes) {
    byId.set(n.id, n);
    const bucket = childrenOf.get(n.parentId);
    if (bucket) bucket.push(n);
    else childrenOf.set(n.parentId, [n]);
  }
  for (const bucket of childrenOf.values()) {
    bucket.sort((a, b) => {
      if (a.type === "folder" && b.type !== "folder") return -1;
      if (a.type !== "folder" && b.type === "folder") return 1;
      return a.name.localeCompare(b.name);
    });
  }
  return { byId, childrenOf };
}

export function useFolderIndex(nodes: FSNode[]): FolderIndex {
  return useMemo(() => buildFolderIndex(nodes), [nodes]);
}
```

All `nodes.find(n => n.id === x)` become `index.byId.get(x)` (O(1)); all
`allNodes.filter(n => n.parentId === x)` become `index.childrenOf.get(x) ?? []` (O(1)).

### 2.2 No virtualization (the big one)
**Where:** `TreeNode` recursion mounts every expanded node (:276-291); list view maps all
`filteredChildren` (:1133); `FileGrid` maps all nodes (:314). `@tanstack/react-virtual` is
**already installed (package.json:103)** and unused here.

**Fix — flatten the visible tree, then virtualize.**

```ts
// flattenVisible.ts
export interface FlatRow { node: FSNode; depth: number; hasChildren: boolean; }

export function flattenVisible(
  index: FolderIndex, rootIds: string[], expanded: Set<string>,
): FlatRow[] {
  const out: FlatRow[] = [];
  const walk = (id: string, depth: number) => {
    const node = index.byId.get(id);
    if (!node) return;
    const children = index.childrenOf.get(id) ?? [];
    out.push({ node, depth, hasChildren: children.length > 0 });
    if (expanded.has(id)) for (const c of children) walk(c.id, depth + 1);
  };
  for (const r of rootIds) walk(r, 0);
  return out;
}
```

```tsx
// VirtualTree.tsx
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";

export function VirtualTree({ rows, renderRow }: {
  rows: FlatRow[]; renderRow: (row: FlatRow) => React.ReactNode;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const v = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 30,
    overscan: 12,
  });
  return (
    <div ref={parentRef} className="h-full overflow-y-auto">
      <div style={{ height: v.getTotalSize(), position: "relative" }}>
        {v.getVirtualItems().map((vi) => (
          <div key={rows[vi.index].node.id} data-index={vi.index} ref={v.measureElement}
            style={{ position: "absolute", top: 0, left: 0, width: "100%",
                     transform: `translateY(${vi.start}px)` }}>
            {renderRow(rows[vi.index])}
          </div>
        ))}
      </div>
    </div>
  );
}
```

Apply the same pattern (with `lanes` for grid columns) to `FileGrid` and the list view. DOM
nodes are capped at ~(visible + overscan) regardless of catalog size.

### 2.3 Repeated recursive folder-size
**Where:** `getFolderSize(id, nodes)` (:125) re-filters `nodes` at every recursion level and
runs once per root folder inside `storageChart` (:721) on every recompute.

**Fix:** One post-order pass using the child index, memoized on `nodes`.

```ts
export function computeFolderSizes(index: FolderIndex, rootId: string): Map<string, number> {
  const sizes = new Map<string, number>();
  const visit = (id: string): number => {
    let total = 0;
    for (const c of index.childrenOf.get(id) ?? []) {
      total += c.type === "folder" ? visit(c.id) : c.size;
    }
    sizes.set(id, total);
    return total;
  };
  visit(rootId);
  return sizes;
}
```

`storageChart` then reads `sizes.get(f.id)` — O(N) total.

### 2.4 Unmemoized TreeNode + drag-state churn
**Where:** `TreeNode` not `React.memo`-wrapped; `onDragStart`/`onDragOver` recreated inline
(:1017-1022); `drag.over` set on **every** `onDragOver` event (:1020) into top-level state,
re-rendering the whole tree per mousemove-over-target.

**Fix:** `React.memo` the row with a custom comparator; hoist callbacks with `useCallback`;
rAF-throttle the drag-over setter:

```ts
const dragOverRef = useRef<string | null>(null);
const rafRef = useRef(0);
const setDragOver = useCallback((id: string | null) => {
  dragOverRef.current = id;
  if (rafRef.current) return;
  rafRef.current = requestAnimationFrame(() => {
    rafRef.current = 0;
    setDrag((d) => ({ ...d, over: dragOverRef.current }));
  });
}, []);
```

Once headless-tree is adopted, the lib owns drag state and only affected rows re-render.

### 2.5 Framer Motion over large lists
**Where:** `FileGrid` per-item `initial/animate` + `delay: idx * 0.03` (:318-322); recent
list stagger (:1251-1255); `AnimatePresence` height-auto on every tree branch (:260-294).

**Fix:** Drop per-item entry animations on virtualized lists/grids (items mount/unmount
during scroll — animating fights virtualization). Keep animation on the **modal** only.
Replace `AnimatePresence height:auto` with CSS `grid-template-rows: 0fr/1fr` or instant
show/hide.

### 2.6 Search: debounce + wire fuse.js
**Where:** `filteredChildren` filters on raw `searchQuery` per keystroke with `.includes`
(:617-622); `fuse.js` installed (package.json:127) but unused.

```ts
import Fuse from "fuse.js";

const fuse = useMemo(
  () => new Fuse(nodes, {
    keys: ["name", "tags", "description"],
    threshold: 0.35, ignoreLocation: true, minMatchCharLength: 2,
  }),
  [nodes],
);

const deferredQuery = useDeferredValue(searchQuery);
const searchResults = useMemo(() => {
  const q = deferredQuery.trim();
  if (!q) return null;
  return new Set(fuse.search(q).map((r) => r.item.id));
}, [fuse, deferredQuery]);
```

Filter `currentChildren` by membership in `searchResults`. For very large catalogs swap Fuse
for `@leeoniya/uFuzzy` (7.5kB, ~5ms over 162k items).

### 2.7 ECharts full-bundle on stats tab
**Where:** `dynamic(() => import("echarts-for-react"))` (:36) pulls the entire echarts build
for two charts.

```ts
import * as echarts from "echarts/core";
import { PieChart, BarChart } from "echarts/charts";
import { TooltipComponent, GridComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
echarts.use([PieChart, BarChart, TooltipComponent, GridComponent, CanvasRenderer]);
```

Render through `echarts-for-react/lib/core` with the registered minimal instance, lazy-loaded
on stats-tab open.

---

## 3. Correctness / offline gaps and fixes

### 3.1 Cycle guard on moveFolder (real bug)
**Where:** `folders-store.ts:88-93` — `moveFolder` sets `parentId` with no check that
`newParentId` is not the folder itself or one of its descendants. Dropping folder A into its
own child B yields a cycle; `getFolderSize`/tree walk then recurse forever.

```ts
moveFolder: (id, newParentId) =>
  set((s) => {
    if (id === newParentId) return s;
    const byId = new Map(s.folders.map((f) => [f.id, f] as const));
    const isDescendant = (candidate: string | null): boolean => {
      let cur = candidate;
      while (cur) {
        if (cur === id) return true;
        cur = byId.get(cur)?.parentId ?? null;
      }
      return false;
    };
    if (newParentId && isDescendant(newParentId)) return s;
    return {
      folders: s.folders.map((f) =>
        f.id === id ? { ...f, parentId: newParentId } : f),
    };
  }),
```

Mirror this guard in `handleDrop` (:567) so the UI gives feedback (the comment at :568
acknowledges the case but does nothing).

### 3.2 `shared`/`locked` are dead cloud concepts
**Where:** every node gets `shared: false, locked: false` (:464,481); UI renders Globe/Lock
icons (:239,373,1182). No offline implementation. Either remove them (honors offline-only),
or back `shared` with the radar's local-first path (Yjs doc + Hocuspocus LAN hub) and
`locked` with a persisted local read-only flag. Until then, delete the icons.

### 3.3 sizeBytes = 0 for most datasets
**Where:** `data-store.ts:212` sets `sizeBytes: 0` for catalog datasets, so storage charts
and "Total Size" are empty. Fix at the source (populate from the managed Parquet cache file
stat in Electron main on register), or fall back to a labeled estimate
(`rowCount * colCount * avgCellBytes`).

### 3.4 Optional: DuckDB-backed catalog view
Org/search/rollup runs in JS over an array. For large catalogs, a tiny DuckDB `app_folders`
+ `app_dataset_folder` table lets storage rollups and search be SQL-pushed (recursive CTE
for subtree sizes) on the native main-process engine. Keep the Zustand store as source of
truth; mirror into DuckDB for analytics. Offline-local, only worth it at thousands of nodes.

---

## 4. Better architecture (step-by-step)

### 4.1 Split the 1421-line monolith
```
src/features/folders/
  screens/FoldersScreen.tsx        // orchestration only (~200 lines)
  components/
    FolderTree.tsx                 // headless-tree + virtualizer
    FolderTreeRow.tsx              // memoized row
    FileGrid.tsx                   // virtualized grid
    FileList.tsx                   // virtualized list
    Breadcrumb.tsx
    NewFolderModal.tsx
    StatsTab.tsx                   // charts, lazy
  hooks/
    useFolderNodes.ts              // build FSNode[] from stores
    useFolderIndex.ts              // byId + childrenOf maps
    useFlattenVisible.ts
    useFolderSearch.ts             // fuse.js / uFuzzy
  lib/
    folderTree.ts                  // flattenVisible, computeFolderSizes, cycle guard
    format.ts                      // formatBytes/formatAge/qualityColor/fileTypeStyle
  types.ts
```

### 4.2 Adopt a headless tree
Two viable, offline, MIT options validated:

- **`@headless-tree/react`** (recommended): headless, flat-node output (virtualization-ready),
  built-in keyboard nav, typeahead search, async loading, **correct ARIA tree semantics**,
  drag-drop with ordering — directly replaces `TreeNode`, `DragState`, the expand set, and
  selection logic. ~9.5kB gz.
- **`react-arborist`** (alternative): batteries-included (own virtualization, inline rename,
  multi-select, DnD, tree lines) — faster to adopt but heavier/opinionated.

Recommended: **headless-tree + @tanstack/react-virtual** (you already own the virtualizer;
the tree lib stays unopinionated and matches the TanStack-headless stack).

```tsx
import { useTree } from "@headless-tree/react";
import {
  syncDataLoaderFeature, selectionFeature, hotkeysCoreFeature,
  dragAndDropFeature, searchFeature, expandAllFeature,
} from "@headless-tree/core";

const tree = useTree<FSNode>({
  rootItemId: "root",
  getItemName: (i) => i.getItemData().name,
  isItemFolder: (i) => i.getItemData().type === "folder",
  dataLoader: {
    getItem: (id) => index.byId.get(id)!,
    getChildren: (id) => (index.childrenOf.get(id) ?? []).map((n) => n.id),
  },
  onDrop: (items, target) => {
    const targetId = target.item.getId();
    for (const it of items) {
      const data = it.getItemData();
      if (data.type === "folder")
        storeMoveFolder(data.id, targetId === "root" ? null : targetId);
      else storeMoveDataset(data.id, targetId === "root" ? null : targetId);
    }
  },
  features: [
    syncDataLoaderFeature, selectionFeature, hotkeysCoreFeature,
    dragAndDropFeature, searchFeature, expandAllFeature,
  ],
});
// render tree.getItems() through the @tanstack/react-virtual VirtualTree above
```

This deletes ~150 lines of recursive component plus the manual `expanded`/`selected`/`drag`
state and HTML5 drag handlers, and gains real a11y + keyboard nav + typeahead. The store's
`moveFolder` cycle guard backstops the lib's DnD.

### 4.3 Keep the query layer OR the store, not both
`src/core/queries/folders.ts` duplicates the store as TanStack Query hooks the screen never
uses. Either route the screen through those hooks (consistent with the app's query usage) or
delete the unused hooks. Since the store is synchronous and local, the wrappers add no value
here — keep direct store access in the screen and trim `folders.ts` via knip if no other
feature consumes it.

### 4.4 Concurrency / responsiveness
- `useDeferredValue` for search keeps typing at 60fps.
- All derivations now O(N) via the index — safe on the render thread for realistic N.
- If catalogs exceed ~50k nodes, move `buildFolderIndex` + `computeFolderSizes` into a
  Comlink worker (Comlink is already used in the project) and pass back the flat row list +
  size map.

---

## 5. Recommended dependencies (table)

| Dep | Stars | Maint. | License | Offline | Bundle | Why | URL |
|---|---|---|---|---|---|---|---|
| @tanstack/react-virtual | 5.5k | Very active | MIT | yes | ~10kB | **Installed, unused here.** Virtualize tree/list/grid. | https://github.com/TanStack/virtual |
| @headless-tree/react | 0.85k | Very active; v1.7 May 2026 | MIT | yes | ~9.5kB gz | Headless tree: flat nodes, a11y, keyboard, typeahead, DnD, async. | https://github.com/lukasbach/headless-tree |
| react-arborist | 3.6k | Active; v3.10 (2025) | MIT | yes | ~30kB | Alt: batteries-included tree w/ built-in virtualization + rename + DnD. | https://github.com/brimdata/react-arborist |
| @dnd-kit/core | 17.2k | Stable, slow (v6.3.1) | MIT | yes | ~30kB | **Installed, unused here.** Only if NOT using tree-lib DnD. | https://github.com/clauderic/dnd-kit |
| fuse.js | 20k | Active | Apache-2.0 | yes | ~12kB | **Installed, unused here.** Ranked, typo-tolerant search. | https://github.com/krisk/fuse |
| @leeoniya/uFuzzy | 2.9k | Active | MIT | yes | ~7.5kB | Faster/lighter search at very large N (uPlot author). | https://github.com/leeoniya/uFuzzy |
| echarts (core+charts) | 63k | Very active | Apache-2.0 | yes | ~120kB tree-shaken | Replace echarts-for-react full bundle on stats tab. | https://github.com/apache/echarts |

**Net new install footprint is tiny:** the headline win is *using* `@tanstack/react-virtual`,
`@dnd-kit`/`fuse.js` you already ship, plus one small new tree lib (~9.5kB). Everything is
MIT/Apache, offline, and medium-PC friendly (no WASM, no GPU).

---

## 6. CLIs & tools (offline)

- **@next/bundle-analyzer** (in repo) — measure echarts-for-react bloat on `/dashboard/folders`
  before/after tree-shaking.
- **size-limit `@size-limit/preset-app`** (in repo) — per-route byte+eval budget for the
  folders route and stats-tab chunk.
- **react-scan** — watch for O(N^2) re-renders from unmemoized `TreeNode` and `drag.over`
  churn while scrolling/dragging a large tree.
- **vitest + @testing-library/react** — lock behavior (move/cycle-guard, delete-cascade,
  star, search) before refactor.
- **tinybench (via Vitest bench)** — benchmark `buildFolderIndex` + search over synthetic
  10k/50k node catalogs.
- **axe-core / vitest-axe** — verify real `tree`/`treeitem` ARIA roles + keyboard nav after
  adopting headless-tree (current `role="button"` rows are not a real a11y tree).
- **knip** (in repo) — confirm the unused `src/core/queries/folders.ts` hooks and dead
  `shared`/`locked` paths after cleanup.

---

## 7. Phased task list

### P1 — Correctness + algorithmic core (no new deps, low risk)
1. Add regression tests: create, rename, star, move (incl. cycle attempt), delete-cascade,
   search, sort. (`vitest`)
2. **Fix the cycle bug**: descendant guard in `folders-store.ts moveFolder` + mirror in
   `handleDrop`. (3.1)
3. Introduce `useFolderIndex` (`byId` + `childrenOf`); replace all
   `nodes.find`/`allNodes.filter` with O(1) lookups. (2.1)
4. Replace recursive `getFolderSize` with one-pass `computeFolderSizes`. (2.3)
5. `React.memo` the row; stabilize callbacks; rAF-throttle drag-over state. (2.4)
6. `useDeferredValue` + debounce search; wire **fuse.js** (already installed). (2.6)
7. Remove index-stagger entry animations on lists/grids; keep modal animation only. (2.5)

### P2 — Virtualization + headless tree (uses installed + 1 small dep)
8. Add `flattenVisible` + `VirtualTree` using **@tanstack/react-virtual** (installed) for the
   tree; virtualize list and grid views too. (2.2)
9. Adopt **@headless-tree/react** for tree state (selection, expand, keyboard, typeahead,
   ARIA, DnD); delete hand-rolled `TreeNode`/`DragState`/`expanded`/`selected`. (4.2)
10. Split the monolith into the component/hook/lib structure in 4.1.
11. Tree-shake **echarts** core+pie+bar for the stats tab. (2.7)
12. Add a11y verification (`vitest-axe`) and a per-route `size-limit` budget.

### P3 — Scale + polish (optional, behind flags)
13. Populate real `sizeBytes` from the Parquet cache stat in Electron main; or labeled
    estimate. (3.3)
14. Decide `shared`/`locked`: remove, or back `shared` with Yjs + Hocuspocus LAN hub and
    `locked` with a persisted local read-only flag. (3.2)
15. For catalogs >50k nodes, move index build + size rollup + fuzzy index into a Comlink
    worker; optionally mirror folders into a DuckDB `app_folders` table for SQL-pushed
    rollups/search (recursive CTE). (3.4, 4.4)
16. Reconcile the dead `src/core/queries/folders.ts` hooks (route screen through them or
    trim via knip). (4.3)
17. Inline folder rename in-tree (headless-tree supports it) to replace the create-only
    modal flow; multi-select move via DnD.

---

## 8. Summary of load-bearing facts
- **Already-installed-but-unused-here:** `@tanstack/react-virtual` (package.json:103),
  `@dnd-kit/*` (:83-87), `fuse.js` (:127). Wiring these is most of the win.
- **Real bug:** `moveFolder` cycle (folders-store.ts:88) → infinite recursion in
  `getFolderSize`/tree walk.
- **Hot O(N^2):** `allNodes.filter` per `TreeNode` (FoldersScreen.tsx:164).
- **Offline status:** correct — persistence is local SQLite (`createDrizzleStorage`,
  folders-store.ts:117); only `shared`/`locked` imply an unimplemented cloud concept.
