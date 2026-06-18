# Feature Plan — lineage

**Maturity:** partial

## Performance issues

- computeLayout in build-lineage.ts uses nodes.find() inside nested loops (O(n^2)/O(n^3)); on the main thread it blocks UI as node count grows.
- Custom SVG canvas renders EVERY node and edge DOM element with no virtualization/viewport culling; hundreds of nodes mount Framer Motion motion.div components simultaneously.
- highlightedNodes, impactAnalysis, and walkUp/walkDown all do repeated nodes.find() scans (O(n^2)) instead of using an id->node Map; recomputed on every selection.
- Table tab and Columns tab render staggered Framer Motion transition delays (idx*0.02, i*0.04) on potentially thousands of rows with no row virtualization, causing long animation/layout thrash.
- Pan/zoom via React state (setPan/setScale on every mousemove/wheel) triggers a full React re-render of the whole graph subtree per frame instead of a CSS transform on a ref.
- buildRealLineage + computeLayout run synchronously inside useMemo on the React render thread; large workspaces stall the first paint.
- columnLineage filtering (incoming/outgoing) does full-array .filter scans per selection instead of pre-indexed maps.
- The installed dagre and @xyflow/react deps are NOT used here — the feature reinvents pan/zoom/layout/edge-routing by hand, shipping dead weight and a buggier renderer.

## Offline gaps

- No real SQL parsing exists despite the feature brief naming it: column lineage is faked by slicing ds.columns.slice(0,40) and mapping by name equality (build-lineage.ts:110-120); transformSql is stored but never parsed into an AST.
- No persistence of the lineage graph itself — it is rebuilt from scratch on every mount from data-store + IndexedDB caches; no snapshot/versioning for offline diff or time-travel.
- Impact analysis is purely structural (hop distance) with no derived metric persistence; nothing cached for offline recompute avoidance.
- No worker offload — all graph building/layout is main-thread, so there is no offline-safe background compute path.
- Column-name matching assumes identical names across parent/child and cannot follow renames/expressions because there is no AST; this silently drops real offline-derivable lineage that DuckDB could provide.

## Recommended dependencies

| Package | Category | Stars | Maint. | License | Offline | Replaces | Why | URL |
|---|---|---|---|---|---|---|---|---|
| `@xyflow/react` | graph-renderer | ~28k | Very active (xyflow team), v12.x | MIT | yes | hand-rolled SVG canvas + manual pan/zoom in LineageScreen.tsx | Already installed and used by agent-canvas; replace the hand-rolled SVG canvas with battle-tested pan/zoom/minimap/viewport-culling. Renders only on-screen nodes, supports custom node components, handles edges/markers. Eliminates the bespoke pan/zoom re-render storm. | https://github.com/xyflow/xyflow |
| `elkjs` | graph-layout | ~2.2k | Active (Kieler), v0.11.1 | EPL-2.0 | yes | dagre (deprecated, installed but unused) and custom computeLayout() | Ships elk-worker.js — runs the layered/DAG layout fully inside a Web Worker off the main thread, far more capable than the custom topo-sort in computeLayout(). Handles ports, nested groups, edge routing. dagre is deprecated; elkjs is the maintained successor. | https://github.com/kieler/elkjs |
| `node-sql-parser` | sql-parser | ~1k | Active, v5.4.0 (Jan 2026) | Apache-2.0 | yes | the fake name-equality column lineage in build-lineage.ts | Pure-JS SQL->AST with tableList + columnList extraction (select::table::column). The missing piece to turn transformSql into REAL table+column lineage offline. Use a single dialect bundle (~150KB) not the full 750KB build; run in a worker. | https://github.com/taozhi8833998/node-sql-parser |
| `@duckdb/node-api` | data-engine | ~1.5k (neo) | Very active (official) | MIT | yes | approximate JS-side lineage when running in Electron | Already the primary engine. Use json_serialize_sql / EXPLAIN / parser introspection in the Electron main process to derive authoritative column lineage from the same SQL DuckDB actually runs — more accurate than a JS parser for DuckDB-dialect SQL. | https://github.com/duckdb/duckdb-node-neo |
| `@tanstack/react-virtual` | virtualization | ~5.5k | Very active | MIT | yes | unvirtualized <table> + per-row Framer Motion delays | Virtualize the Table tab and Columns tab so thousands of lineage rows render without staggered-motion layout thrash. Already in the stack per the radar. | https://github.com/TanStack/virtual |
| `comlink` | worker-rpc | ~12.6k | Active (GoogleChromeLabs) | Apache-2.0 | yes | main-thread synchronous build/layout | ~1.1kB Proxy worker RPC to wrap the lineage-build + SQL-parse + ELK-layout worker behind a clean async API. Already in the stack. | https://github.com/GoogleChromeLabs/comlink |
| `dexie` | persistence | ~13k | Active | Apache-2.0 | yes | full rebuild-from-scratch on every mount | Persist computed lineage snapshots (nodes/edges/columnLineage + a content hash) to IndexedDB so the graph loads instantly offline and supports versioned diffs/time-travel without recompute. | https://github.com/dexie/Dexie.js |

## CLIs & tools

| Tool | Type | Offline | Why | URL |
|---|---|---|---|---|
| `@xyflow/react` | library | yes | Viewport-culled graph rendering with pan/zoom/minimap; already a project dependency. | https://github.com/xyflow/xyflow |
| `elkjs (elk-worker.js)` | library | yes | Worker-side DAG/layered layout engine; offline, no network. | https://github.com/kieler/elkjs |
| `node-sql-parser` | library | yes | SQL->AST table/column lineage extraction in-browser or in Electron. | https://github.com/taozhi8833998/node-sql-parser |
| `DuckDB json_serialize_sql` | cli | yes | Authoritative SQL AST/column-binding extraction matching the dialect actually executed. | https://duckdb.org/docs/sql/statements/explain |
| `vitest + tinybench` | library | yes | Unit-test lineage extraction against fixture SQL and microbench build/layout hot paths offline. | https://github.com/tinylibs/tinybench |
| `size-limit` | cli | yes | Enforce a per-worker bundle budget for node-sql-parser (single-dialect ~150KB) and elk-worker. | https://github.com/ai/size-limit |

---

# Data Lineage — Deep Improvement Plan

## 0. Executive summary

The lineage feature is a **partial, demo-grade implementation**. It produces a real graph from local workspace records (datasets, transforms, saved charts, telecom caches), which is genuinely useful — but the rendering, layout, and "SQL parsing / column lineage" claims are all hand-rolled approximations that will not scale and are not actually parsing SQL.

Three structural problems dominate:

1. **It reinvents a graph renderer.** The project already depends on `@xyflow/react` (used by `agent-canvas`) and `dagre`, yet `LineageScreen.tsx` hand-codes SVG edges, manual pan/zoom via React state, a custom topological layout, and per-node Framer Motion mounts. This is slower, buggier, and ships dead dependencies.
2. **There is no SQL parsing.** The feature brief names "SQL parsing," but `build-lineage.ts` derives column lineage by `ds.columns.slice(0, 40)` and matching column **names** (lines 110-120). `transformSql` is read as a flag only (`ds.transformSql ? "SQL transform" : undefined`), never parsed. Real column lineage requires an AST.
3. **Everything runs on the main thread, synchronously, with O(n²)–O(n³) scans.** `computeLayout`, `highlightedNodes`, `impactAnalysis`, and column filtering all use `nodes.find()` inside loops, and pan/zoom re-renders the entire graph subtree per frame.

The fix is a consolidation play that aligns with the Tech Radar: **xyflow for rendering, elkjs (worker) for layout, node-sql-parser (worker) for real column lineage, DuckDB AST introspection in Electron for authoritative lineage, Dexie for snapshot persistence, and a Comlink worker to move all heavy compute off the main thread.**

---

## 1. Current implementation

### 1.1 File map

- `src/app/dashboard/lineage/page.tsx` — trivial wrapper rendering `<LineageScreen/>`.
- `src/features/lineage/core/types.ts` — `LNode`, `LEdge`, `ColumnLineage` interfaces.
- `src/features/lineage/core/build-lineage.ts` — `buildRealLineage()` (graph construction) and `computeLayout()` (positions). ~324 lines.
- `src/features/lineage/screens/LineageScreen.tsx` — ~1525 lines: the entire UI (graph canvas, table, impact, columns tabs, detail panel, pan/zoom).
- `src/features/lineage/screens/LineageScreen.stories.tsx` — Storybook entry.

### 1.2 Data model (build-lineage.ts)

`buildRealLineage()` ingests seven local sources and produces `{ nodes, edges, columnLineage }`:

- **Datasets** (`data-store`) → `source`/`transform` nodes; `ds.parentId` → an edge + column lineage. Status via `datasetStatus()` (active if table loaded, stale if >7 days old).
- **Transforms** (`DataTransform[]`) → edges between input/output dataset nodes.
- **Saved charts** → `output` nodes consuming a dataset.
- **Telecom sources / analytics / daily stats** (IndexedDB caches via `analytics-cache.ts`, `daily-stats-cache.ts`) → source/model/output nodes with `aggregates`/`contributes` edges.
- Final pass de-duplicates `upstreams`/recomputes `downstreams` and filters dangling edges.

This part is **legitimately good** — it builds a real graph from on-device records. The problem is everything downstream.

### 1.3 Layout (computeLayout, build-lineage.ts:278-323)

Hand-rolled Kahn-style topological column assignment, then naive y-stacking within each column. Uses `nodes.find((n) => n.id === id)` repeatedly inside the BFS loop — **O(n²) at minimum**, and `Object.entries(cols)` re-grouping. No edge crossing minimization, no handling of cycles (a real lineage graph with a feedback transform would loop forever — the `inDegree`/queue guards mostly protect this, but cycles get column 0 and overlap).

### 1.4 Rendering (LineageScreen.tsx)

- **Pan/zoom**: `pan`/`scale` in React state; `handleMouseMove` calls `setPan` per mousemove and `handleWheel` calls `setScale` per wheel tick → the entire `<div style={{transform}}>` subtree (all nodes + the SVG edge layer) re-renders every frame.
- **Nodes**: every node is an absolutely-positioned `motion.div` (`NodeCard`) — all mounted, none culled.
- **Edges**: an SVG with one `<path>` per edge, cubic Bézier hand-computed in `EdgeLine`.
- **Highlight**: `highlightedNodes` does recursive `walkUp`/`walkDown` with `nodes.find()` per hop (O(n) per lookup).
- **Tabs**: Table renders an unvirtualized `<table>` with `motion.tr` staggered by `idx * 0.02`; Columns renders `columnLineage.map` with `i * 0.04` delays — both unbounded.
- **Impact**: recursive `walkImpact` capped at depth 5, again `nodes.find()` per node.

### 1.5 What's missing entirely

- No worker. No persistence/snapshot. No real SQL AST. No virtualization. No use of the installed `@xyflow/react`/`dagre`. No minimap. No search-to-fit/focus in the graph. No keyboard navigation/a11y for the canvas.

---

## 2. Performance bottlenecks & exact fixes

### 2.1 Replace O(n²) lookups with an id→node Map

Everywhere `nodes.find((n) => n.id === id)` appears (computeLayout, walkUp/walkDown, impactAnalysis, upstream/downstream panels), build one map once.

```ts
// shared selector
const nodeById = useMemo(() => {
  const m = new Map<string, LNode>();
  for (const n of nodes) m.set(n.id, n);
  return m;
}, [nodes]);
```

Then `nodeById.get(id)` is O(1). This alone removes the dominant cost in highlight/impact/layout.

Pre-index column lineage too:

```ts
const colIndex = useMemo(() => {
  const incoming = new Map<string, ColumnLineage[]>();
  const outgoing = new Map<string, ColumnLineage[]>();
  for (const cl of columnLineage) {
    (incoming.get(cl.targetNode) ?? incoming.set(cl.targetNode, []).get(cl.targetNode)!).push(cl);
    (outgoing.get(cl.sourceNode) ?? outgoing.set(cl.sourceNode, []).get(cl.sourceNode)!).push(cl);
  }
  return { incoming, outgoing };
}, [columnLineage]);
```

### 2.2 Move build + layout + parse into a Comlink worker

`buildRealLineage` and `computeLayout` (and the new SQL parsing) should not run on the render thread. Wrap them in a worker.

```ts
// lineage.worker.ts
import * as Comlink from "comlink";
import ELK from "elkjs/lib/elk.bundled.js";
import { buildRealLineage } from "./core/build-lineage";
import { extractColumnLineage } from "./core/sql-lineage";

const elk = new ELK();

const api = {
  async build(input: BuildInput) {
    const model = buildRealLineage(input);
    // enrich with real column lineage from SQL where available
    const enriched = extractColumnLineage(model, input.transforms);
    const layout = await elk.layout(toElkGraph(enriched));
    return { ...enriched, positions: fromElkGraph(layout) };
  },
};
Comlink.expose(api);
```

```ts
// useLineageWorker.ts
const worker = useMemo(
  () => Comlink.wrap<LineageApi>(
    new Worker(new URL("./lineage.worker.ts", import.meta.url), { type: "module" }),
  ),
  [],
);
```

The screen now `await`s a fully laid-out model. First paint is no longer blocked by build/layout.

### 2.3 Replace the canvas with @xyflow/react (viewport culling + GPU pan/zoom)

xyflow only renders nodes in/near the viewport, uses CSS transforms for pan/zoom (no React re-render per frame), and gives a minimap for free.

```tsx
import {
  ReactFlow, Background, Controls, MiniMap,
  type Node, type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

const nodeTypes = { lineage: LineageNode }; // memoized custom node = your NodeCard

function LineageGraph({ model }: { model: LineageModel }) {
  const rfNodes: Node[] = useMemo(
    () => model.nodes.map((n) => ({
      id: n.id, type: "lineage", position: model.positions[n.id], data: { node: n },
    })),
    [model],
  );
  const rfEdges: Edge[] = useMemo(
    () => model.edges.map((e) => ({
      id: e.id, source: e.source, target: e.target,
      animated: e.type === "streaming",
      style: { stroke: e.type === "partial" ? "#f59e0b" : "#334155",
               strokeDasharray: e.type === "partial" ? "5 3" : undefined },
    })),
    [model],
  );
  return (
    <ReactFlow nodes={rfNodes} edges={rfEdges} nodeTypes={nodeTypes}
      onlyRenderVisibleElements fitView minZoom={0.2} maxZoom={2} proOptions={{ hideAttribution: true }}>
      <Background gap={24} />
      <Controls />
      <MiniMap pannable zoomable nodeColor={(n) => statusColor((n.data as any).node.status)} />
    </ReactFlow>
  );
}
```

`LineageNode` is your existing `NodeCard` markup wrapped with `memo` and xyflow `<Handle>`s. This deletes ~400 lines of pan/zoom/SVG/edge code and fixes the per-frame re-render.

### 2.4 Use elkjs for layout (worker, edge-crossing minimization)

```ts
function toElkGraph(model: LineageModel) {
  return {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.layered.spacing.nodeNodeBetweenLayers": "120",
      "elk.spacing.nodeNode": "40",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
    },
    children: model.nodes.map((n) => ({ id: n.id, width: 200, height: 96 })),
    edges: model.edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  };
}
function fromElkGraph(g: any) {
  const pos: Record<string, { x: number; y: number }> = {};
  for (const c of g.children ?? []) pos[c.id] = { x: c.x, y: c.y };
  return pos;
}
```

elkjs handles cycles, ports, and crossing reduction far better than the hand-rolled column assignment, and runs in `elk-worker.js`.

### 2.5 Virtualize the Table and Columns tabs

Drop the staggered Framer Motion entirely (it scales linearly with row count and thrashes layout) and virtualize:

```tsx
const rowV = useVirtualizer({
  count: filteredNodes.length,
  getScrollElement: () => scrollRef.current,
  estimateSize: () => 44,
  overscan: 12,
});
// render only rowV.getVirtualItems()
```

Same for `columnLineage` (can be thousands of rows once real SQL lineage lands).

### 2.6 Memoize NodeCard and stop unconditional opacity churn

`NodeCard` currently animates `opacity` per render from the highlight prop. Wrap in `memo` keyed on `{node, selected, highlighted}` and use CSS classes (not Framer animate) for the dimmed state so non-selected nodes don't re-run animation when selection changes.

---

## 3. Offline gaps & how to close them

### 3.1 Real column lineage from SQL (the headline gap)

Today (`build-lineage.ts:110-120`) lineage is name-equality and capped at 40 columns. Replace with an AST.

**In-browser / universal path — node-sql-parser:**

```ts
// core/sql-lineage.ts
import { Parser } from "node-sql-parser";
const parser = new Parser();

export function lineageFromSql(sql: string, dbName = "postgresql") {
  const { columnList, tableList, ast } = parser.parse(sql, { database: dbName });
  // columnList entries: "select::tableName::columnName"
  // ast.columns gives projection exprs incl. AS aliases + source refs
  return mapProjectionToLineage(ast); // → ColumnLineage[]
}
```

`ast.columns` exposes each `SELECT` projection: the source column ref(s), any expression (e.g. `SUM(x) AS total`), and the alias. From that you build real `ColumnLineage` with a true `transform` string (`"SUM(x)"`), following renames and expressions that name-matching cannot.

Bundle only the dialect you need (`node-sql-parser/build/postgresql` ~150KB) and load it lazily inside the worker, not the 750KB all-dialects build.

**Electron-authoritative path — DuckDB:** when running in Electron, the SQL that actually ran is DuckDB-dialect. Use DuckDB's own parser for ground truth:

```sql
SELECT json_serialize_sql('SELECT a, SUM(b) AS total FROM t GROUP BY a');
-- returns the parsed AST as JSON; walk projection bindings → column lineage
```

This avoids dialect mismatch and matches exactly what the engine executes. Strategy: prefer DuckDB introspection in main; fall back to node-sql-parser in the worker for the web build.

### 3.2 Persist lineage snapshots (Dexie)

Rebuilding from scratch on every mount (the `refreshLineage` effect) is wasteful and offers no history. Persist a content-hashed snapshot:

```ts
// db.ts
import Dexie from "dexie";
export const lineageDb = new Dexie("lineage");
lineageDb.version(1).stores({
  snapshots: "hash, createdAt", // {hash, createdAt, nodes, edges, columnLineage, positions}
});
```

On build, compute a stable hash of the input record ids/updatedAts; if a snapshot exists, hydrate instantly (offline) and skip recompute. Keep the last N snapshots for **diff/time-travel** ("what changed since yesterday's run"). All IndexedDB, zero network.

### 3.3 No-cloud guarantees

Nothing here touches the network today, which is correct — the gap is purely that the *derivation* is shallow. node-sql-parser and elkjs are pure-JS/WASM-free and fully offline; DuckDB introspection is local. Add a `size-limit` budget so the dialect bundle doesn't balloon, and lazy-load the parser only when a node with `transformSql` is selected/expanded.

---

## 4. Better architecture & implementation (step by step)

### 4.1 Target module layout

```
src/features/lineage/
  core/
    types.ts                 // + add: columnExpr, snapshotHash fields
    build-lineage.ts         // graph construction (keep, de-O(n^2))
    sql-lineage.ts           // NEW: AST → ColumnLineage (node-sql-parser)
    elk-layout.ts            // NEW: model → ELK → positions
    snapshot.ts              // NEW: Dexie persistence + hashing
  worker/
    lineage.worker.ts        // NEW: Comlink-exposed build+parse+layout
    useLineageWorker.ts      // NEW: hook wrapping the worker
  components/
    LineageNode.tsx          // NEW: memoized xyflow custom node (from NodeCard)
    LineageGraph.tsx         // NEW: ReactFlow wrapper
    LineageTable.tsx         // NEW: virtualized table tab
    ColumnLineageTable.tsx   // NEW: virtualized columns tab
    ImpactPanel.tsx          // NEW: impact tab (BFS on adjacency)
    DetailPanel.tsx          // NEW: extracted detail sidebar
  screens/
    LineageScreen.tsx        // orchestration only (~250 lines)
```

This splits the 1525-line monolith into testable units and isolates the worker boundary.

### 4.2 Adjacency-list traversal (replace recursive find-walks)

Build forward/back adjacency once; traversal becomes O(V+E) BFS:

```ts
function buildAdjacency(model: LineageModel) {
  const fwd = new Map<string, string[]>();
  const back = new Map<string, string[]>();
  for (const e of model.edges) {
    (fwd.get(e.source) ?? fwd.set(e.source, []).get(e.source)!).push(e.target);
    (back.get(e.target) ?? back.set(e.target, []).get(e.target)!).push(e.source);
  }
  return { fwd, back };
}

function bfs(start: string, adj: Map<string, string[]>) {
  const seen = new Set<string>([start]);
  const q = [start];
  while (q.length) {
    const id = q.shift()!;
    for (const nx of adj.get(id) ?? []) if (!seen.has(nx)) { seen.add(nx); q.push(nx); }
  }
  seen.delete(start);
  return seen;
}
```

`highlightedNodes = new Set([...bfs(sel, back), ...bfs(sel, fwd), sel])`. Impact = BFS forward with depth tracking. Both O(V+E).

### 4.3 Worker-first data flow

```
data-store + IndexedDB caches
        │  (serializable BuildInput)
        ▼
  lineage.worker (Comlink)
   ├─ buildRealLineage()        // graph
   ├─ sql-lineage (node-sql-parser, lazy)   // real column lineage
   ├─ elk.layout()             // positions
   └─ snapshot hash + Dexie     // persist
        │  (LineageModel + positions)
        ▼
  LineageScreen (render only)
   ├─ LineageGraph (xyflow, culled)
   ├─ LineageTable (virtualized)
   ├─ ColumnLineageTable (virtualized)
   └─ ImpactPanel / DetailPanel (Map-indexed)
```

### 4.4 Screen orchestration sketch

```tsx
export default function LineageScreen() {
  const input = useLineageInput();             // gathers + memoizes serializable input
  const { model, loading } = useLineageWorker(input); // worker build+layout+persist
  const [selected, setSelected] = useState<string | null>(null);
  const nodeById = useNodeMap(model);
  const adj = useAdjacency(model);
  const highlighted = useMemo(
    () => selected ? new Set([...bfs(selected, adj.back), ...bfs(selected, adj.fwd), selected]) : null,
    [selected, adj],
  );
  // tabs render the components above; no layout math here
}
```

### 4.5 Real column lineage rendering

With `transform` now carrying real expressions (`SUM(b)`, `COALESCE(a,0)`), the Columns tab and detail panel show genuine derivations. Add a per-column "trace upstream" action that walks `colIndex.incoming` recursively to show the full provenance chain of one output column — the single most valuable lineage UX, now possible because the AST exists.

---

## 5. Recommended dependencies

| Dep | Stars | Maint. | License | Offline | Why | URL |
|---|---|---|---|---|---|---|
| @xyflow/react | ~28k | Very active, v12 | MIT | yes | Viewport-culled graph render, GPU pan/zoom, minimap; already installed (agent-canvas). | https://github.com/xyflow/xyflow |
| elkjs | ~2.2k | Active, v0.11.1 | EPL-2.0 | yes | Worker-native layered DAG layout w/ crossing minimization; successor to deprecated dagre. | https://github.com/kieler/elkjs |
| node-sql-parser | ~1k | Active, v5.4.0 (Jan 2026) | Apache-2.0 | yes | Real SQL→AST table+column lineage; single-dialect ~150KB; runs in worker. | https://github.com/taozhi8833998/node-sql-parser |
| @duckdb/node-api | ~1.5k | Very active (official) | MIT | yes | json_serialize_sql for authoritative DuckDB-dialect column lineage in Electron main. | https://github.com/duckdb/duckdb-node-neo |
| @tanstack/react-virtual | ~5.5k | Very active | MIT | yes | Virtualize Table/Columns tabs; remove staggered-motion thrash. | https://github.com/TanStack/virtual |
| comlink | ~12.6k | Active | Apache-2.0 | yes | Worker RPC for build+parse+layout; already in stack. | https://github.com/GoogleChromeLabs/comlink |
| dexie | ~13k | Active | Apache-2.0 | yes | Persist hashed lineage snapshots for instant offline load + time-travel diff. | https://github.com/dexie/Dexie.js |

**Remove:** `dagre` + `@types/dagre` from `package.json` after migrating layout to elkjs (dagre is deprecated and currently unused by this feature).

**License note:** elkjs is EPL-2.0 (weak copyleft, file-level) — permissive enough for app use without obligating your source; confirm with legal if redistributing modified elk files, but standard consumption is fine.

---

## 6. CLIs & tools (offline)

- **vitest** — unit-test `sql-lineage.ts` against fixture SQL (renames, aggregates, joins) and `build-lineage.ts` against fixture stores. Fully offline.
- **tinybench** (via Vitest bench) — microbench `buildRealLineage` + adjacency + BFS on synthetic 1k/5k-node graphs; lock a perf budget.
- **DuckDB CLI** — `SELECT json_serialize_sql(...)` locally to design/validate the AST-walk for the Electron path, no network.
- **size-limit** — per-worker budget so the node-sql-parser dialect bundle and elk-worker stay bounded; add `lineage.worker` as a tracked entry.
- **@xyflow/react devtools** + React DevTools Profiler / react-scan — confirm only visible nodes render and pan/zoom does not re-render the React tree.
- **knip** — after migration, confirm dagre/custom-layout code is fully removed (no dead exports).

---

## 7. Phased task list

### P1 — Correctness & main-thread relief (highest ROI)
1. Add `nodeById` Map + adjacency lists; replace all `nodes.find()` loops in highlight/impact/upstream/downstream (build-lineage.ts + LineageScreen.tsx). O(n²)→O(V+E).
2. Pre-index `columnLineage` into incoming/outgoing maps.
3. Virtualize Table and Columns tabs with `@tanstack/react-virtual`; delete per-row Framer Motion stagger.
4. Memoize `NodeCard`; move dim state to CSS class.

### P2 — Renderer & layout consolidation
5. Replace hand-rolled canvas with `@xyflow/react` (`LineageGraph` + memoized `LineageNode`), add minimap + `onlyRenderVisibleElements` + `fitView`.
6. Move `buildRealLineage` + layout into a Comlink worker (`lineage.worker.ts` + `useLineageWorker`).
7. Swap `computeLayout` for elkjs layered layout in the worker; remove `dagre`/`@types/dagre` and custom `computeLayout`.
8. Split `LineageScreen.tsx` monolith into the component modules in §4.1.

### P3 — Real lineage & persistence
9. Implement `sql-lineage.ts` with node-sql-parser (lazy, single dialect) → real `ColumnLineage` with expression-aware `transform`.
10. Add Electron `json_serialize_sql` path for authoritative DuckDB lineage; prefer it in main, fall back to JS parser in web build.
11. Add Dexie snapshot persistence with content hashing → instant offline hydration + skip-recompute.
12. Add "trace column upstream" provenance walk in the detail panel; add snapshot diff/time-travel ("what changed since last run").
13. Wire size-limit budgets + vitest/tinybench coverage for the new worker and parser; verify offline (airplane mode) end-to-end.

---

## 8. Risk notes

- **xyflow custom node parity**: the existing `NodeCard` visuals (quality bar, status dot, type styling) port directly into a custom node; budget time for `<Handle>` placement to match edge direction.
- **node-sql-parser dialect drift**: DuckDB-specific syntax (e.g. `QUALIFY`, list/struct types) may not parse under the postgres dialect — this is exactly why the Electron `json_serialize_sql` path is the authoritative one; treat the JS parser as best-effort for the web build and degrade gracefully (fall back to today's name-matching when parse fails).
- **elkjs async**: layout is now a Promise; ensure the worker awaits it before returning positions, and guard against stale results when input changes rapidly (cancel/ignore older builds by hash).
- **EPL-2.0 (elkjs)**: weak copyleft at file level; fine for app consumption, flag if you fork elk internals.
