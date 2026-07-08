# Implementation Brief — Lineage graph + SQL intelligence

> Cluster: **Lineage graph + SQL intelligence**. Downstream agents implement directly from this without re-researching.
> Hard constraints: **fully offline** (no runtime network/CDN), **medium-end PC** (4-core, no WebGPU, 8 GB), **current stable API** of each package.
>
> All versions below are the **installed** versions in this repo (verified against `node_modules`), and every snippet's key calls were functionally smoke-tested on-disk.

## 0. TL;DR offline gotchas (read first)

1. **`@monaco-editor/react` loads `monaco-editor` from the jsdelivr CDN by default.** `monaco-editor` is **NOT installed** as a standalone dep (only `@monaco-editor/react` + `@monaco-editor/loader`). Under the default config the editor silently tries to fetch `vs/` from `https://cdn.jsdelivr.net/...`. This **breaks offline**. You MUST install `monaco-editor` locally and call `loader.config({ monaco })` with the bundled instance BEFORE any editor mounts. This is the single biggest offline trap in this cluster. (§5)
2. **monaco-sql-languages spawns a language Web Worker** keyed on the monaco language label (`pgsql`, etc.) via monaco's standard `MonacoEnvironment.getWorker(_, label)`. You must register that worker yourself with a bundler `new Worker(new URL(...))` so it is self-hosted, not fetched. (§5)
3. **elkjs**: use `elkjs/lib/elk.bundled.js` — it is fully self-contained and runs synchronously inside **our own** Comlink worker. Do NOT use the `workerUrl`/`elk-worker.js` constructor option (that spawns a *nested* worker from a path and is the source of the `_Worker is not a constructor` / pnpm-hoist path bugs). Pure JS, zero assets, zero network. (§2)
4. **node-sql-parser**: import the **single-dialect** build `node-sql-parser/build/postgresql` (~150 KB) not the root (~750 KB all-dialects). Pure JS, runs in the worker. (§3)
5. **DuckDB `json_serialize_sql`** needs the `json` extension; it is **bundled and autoloaded** in `@duckdb/node-api` — no install/network. (§4)
6. **COOP/COEP already set** for this app in `electron/security.ts` (`Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`). No new header work needed; module workers + SharedArrayBuffer already work. None of the packages in this cluster *require* SAB, but the existing isolation does not break them.

Repo facts used below: workers use the established `new Worker(new URL("./x.worker.ts", import.meta.url), { type: "module" })` + `Comlink.wrap/expose` pattern (see `src/features/ai-analysis/worker/client.ts`, `src/features/csv-parser/workers/useCsvWorker.ts`). `@xyflow/react` is already used in `src/features/agent-canvas/components/AgentFlowGraph.tsx` — copy its import block for parity. DuckDB renderer entrypoint is `runReadOnlyQuery(sql)` from `src/platform/duckdb/duckdb.ts` (forwards over IPC to main).

---

## 1. @xyflow/react — graph renderer (controlled nodes/edges + viewport culling + minimap)

- **Install name / version:** `@xyflow/react` — **12.11.0** (installed). MIT. Package was renamed from `reactflow`; **not** a default import.
- **CSS (required, local — bundled by the package, no CDN):**
  ```ts
  import "@xyflow/react/dist/style.css";
  ```

### Minimal correct init (controlled, culled, minimap)

```tsx
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import { memo, useMemo } from "react";
import "@xyflow/react/dist/style.css";

// Custom node = the existing NodeCard markup, memoized, with Handles for edge anchoring.
const LineageNode = memo(function LineageNode({ data }: NodeProps) {
  const node = (data as { node: LNode }).node;
  return (
    <div className={`lineage-node status-${node.status}`}>
      <Handle type="target" position={Position.Left} />
      {/* ...existing NodeCard visuals (status dot, quality bar, type)... */}
      <Handle type="source" position={Position.Right} />
    </div>
  );
});

const nodeTypes = { lineage: LineageNode };

export function LineageGraph({ model }: { model: LineageModel }) {
  const nodes: Node[] = useMemo(
    () =>
      model.nodes.map((n) => ({
        id: n.id,
        type: "lineage",
        position: model.positions[n.id] ?? { x: 0, y: 0 }, // positions come from the worker (ELK)
        data: { node: n },
      })),
    [model],
  );

  const edges: Edge[] = useMemo(
    () =>
      model.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        animated: e.type === "streaming",
        style: {
          stroke: e.type === "partial" ? "#f59e0b" : "#334155",
          strokeDasharray: e.type === "partial" ? "5 3" : undefined,
        },
      })),
    [model],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onlyRenderVisibleElements   // viewport culling: render only on/near-screen nodes
      fitView
      minZoom={0.2}
      maxZoom={2}
      nodesDraggable={false}      // layout is authoritative (ELK); keep it stable
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={24} />
      <Controls />
      <MiniMap pannable zoomable nodeColor={(n) => statusColor((n.data as { node: LNode }).node.status)} />
    </ReactFlow>
  );
}
```

### Key API (current, v12)
- **Controlled flow:** pass `nodes` + `edges` arrays. For interactivity (drag/select) add `onNodesChange`/`onEdgesChange` and the `applyNodeChanges`/`applyEdgeChanges` helpers, or the `useNodesState`/`useEdgesState` hooks (already used in `AgentFlowGraph.tsx`). For a layout-authoritative lineage view, **read-only controlled** (no change handlers, `nodesDraggable={false}`) is correct and simplest.
- **Viewport culling:** `onlyRenderVisibleElements` (default `false`). **Known v12 caveat:** `useNodesInitialized` stays `false` when this is on — do NOT gate logic on `useNodesInitialized` while culling; rely on `fitView` instead.
- **Pan/zoom:** GPU CSS transforms internally — no React re-render per frame (this is the whole point of the migration; deletes the bespoke pan/zoom).
- **MiniMap:** non-interactive by default; set `pannable` / `zoomable` to enable. `nodeColor` for status coloring.
- `minZoom` default `0.5`, `maxZoom` default `2`.

### Offline / self-host
- **None.** Pure JS + one local CSS file (bundled). No assets, no fonts, no network.

### Wire into
- `src/features/lineage/components/LineageGraph.tsx` (new) — the wrapper above.
- `src/features/lineage/components/LineageNode.tsx` (new) — memoized custom node (port the existing `NodeCard`).
- Consumed by `src/features/lineage/screens/LineageScreen.tsx` (orchestration only).

### Pitfalls
- Custom node must be wrapped in `memo` or selection re-renders the whole graph.
- `<Handle>` placement must match edge direction (`source` Right, `target` Left for a `RIGHT` ELK layout) or edges render to wrong anchors.
- Don't put layout math in the component — positions arrive pre-computed from the worker.

---

## 2. elkjs — layered DAG layout in a Web Worker

- **Install name / version:** `elkjs` — **0.11.1** (installed). EPL-2.0 (weak, file-level copyleft — fine for app consumption; only matters if you fork elk's own files).
- **Entry to use:** `elkjs/lib/elk.bundled.js` (self-contained; verified it lays out synchronously inside a Node/worker context). **Default export is the `ELK` constructor.**

### Minimal correct init (inside our Comlink worker — see §6)

```ts
import ELK from "elkjs/lib/elk.bundled.js"; // default import = constructor

const elk = new ELK(); // NO { workerUrl } / workerFactory — we are ALREADY in a worker

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

function fromElkGraph(g: { children?: Array<{ id: string; x: number; y: number }> }) {
  const pos: Record<string, { x: number; y: number }> = {};
  for (const c of g.children ?? []) pos[c.id] = { x: c.x, y: c.y };
  return pos;
}

// usage: const laid = await elk.layout(toElkGraph(model)); const positions = fromElkGraph(laid);
```

### Key API (current)
- `new ELK(opts?)` → `elk.layout(graph)` returns a **Promise** of the same graph with `x`/`y`/`width`/`height` filled on every child (and bend points on edges if you need them).
- Algorithms: `layered` (use this), `stress`, `mrtree`, `radial`, `force`, `disco`. `layered` handles cycles, ports, and crossing reduction.
- All `layoutOptions` values are **strings** (even numbers).

### Offline / self-host
- **None.** Pure JS (GWT-compiled), bundled in one file. No `.wasm`, no model, no network.
- **Do NOT** pass `workerUrl`/`workerFactory` (that spawns ELK's own nested worker from a path → the `_Worker is not a constructor` / hoist-path failures). Running `elk.bundled.js` synchronously inside *our* Comlink worker is the offline-safe path.

### Wire into
- `src/features/lineage/core/elk-layout.ts` (new) — `toElkGraph` / `fromElkGraph` + an `async layout(model)` helper.
- Called from `src/features/lineage/worker/lineage.worker.ts` (§6).

### Pitfalls
- `elk.layout` is async — `await` it in the worker before returning positions; guard stale results (ignore older builds by content hash).
- Provide real node `width`/`height` (200×96 to match the card) or edges/spacing look wrong.
- **Remove `dagre` + `@types/dagre`** from `package.json` after migrating — dagre is deprecated and unused by this feature.

---

## 3. node-sql-parser — SQL → AST for column lineage (single dialect, in worker)

- **Install name / version:** `node-sql-parser` — **5.4.0** (installed, Jan 2026). Apache-2.0.
- **Single-dialect import (mandatory for bundle size, ~150 KB vs ~750 KB):**
  ```ts
  import { Parser } from "node-sql-parser/build/postgresql"; // exports: { Parser, util }
  ```
  (PostgreSQL dialect is the closest match to DuckDB syntax. Available builds include `postgresql`, `mysql`, `mariadb`, `bigquery`, `snowflake`, `sqlite`, `transactsql`, etc. There is **no DuckDB dialect** — that is exactly why the DuckDB `json_serialize_sql` path in §4 is the authoritative one and node-sql-parser is the best-effort web fallback.)

### Minimal correct init + column lineage extraction

```ts
import { Parser } from "node-sql-parser/build/postgresql";

const parser = new Parser();

export function lineageFromSql(sql: string) {
  // parse() returns { tableList, columnList, ast }
  const { tableList, columnList, ast } = parser.parse(sql, { database: "postgresql" });
  // tableList entries:  "select::null::t"        (type::db::table)
  // columnList entries: "select::null::a"        (type::table::column)
  return mapProjectionToLineage(ast); // walk ast.columns -> ColumnLineage[]
}
```

**Verified AST shape** (from `SELECT a, SUM(b) AS total FROM t GROUP BY a`, smoke-tested on-disk):
- `tableList` → `["select::null::t"]`
- `columnList` → `["select::null::a","select::null::b"]`
- `ast.columns[1]` (the `SUM(b) AS total` projection) →
  ```json
  {
    "type": "expr",
    "expr": {
      "type": "aggr_func", "name": "SUM",
      "args": { "expr": { "type": "column_ref", "table": null,
        "column": { "expr": { "type": "default", "value": "b" } } } },
      "over": null
    },
    "as": "total"
  }
  ```
  → emit `ColumnLineage { sourceColumn: "b", targetColumn: "total", transform: "SUM(b)" }`.
  A plain `column_ref` projection (`a`) → `{ sourceColumn: "a", targetColumn: "a", transform: undefined }`.

### Key API (current, v5)
- `parser.parse(sql, opt)` → `{ tableList, columnList, ast }`.
- `parser.astify(sql, opt)` → AST only (use for **offline validation**: wrap in try/catch).
- `parser.sqlify(ast, opt)` → SQL string (for safe re-stringify).
- `opt` fields: `database` (dialect), `type` (`"table"|"column"` authority mode), `parseOptions` (e.g. `{ includeLocations: true }`).
- **Safe quoting** for the data-transform SQL builder: do NOT hand-roll. Either re-stringify through `sqlify(ast)`, or use a strict identifier quoter and escape **all** quotes: `const quoteIdent = (s: string) => '"' + s.replaceAll('"', '""') + '"';` (the existing code's `.replace('"','""')` only escapes the FIRST quote — a real bug).

### Offline / self-host
- **None.** Pure JS, no wasm/assets/network. Lazy-load only when a node with `transformSql` is selected to keep it off the initial bundle.

### Wire into
- `src/features/lineage/core/sql-lineage.ts` (new) — `lineageFromSql` + `mapProjectionToLineage` → `ColumnLineage[]`.
- `src/features/data-transform/engine/validate.ts` (new) — `astify` validation wrappers.
- Both run inside their feature worker (lineage.worker / transform.worker), never main thread.

### Pitfalls
- DuckDB-specific syntax (`QUALIFY`, list/struct types, `PIVOT`) may **not** parse under postgres dialect → treat as **best-effort**: catch parse errors and fall back to today's name-matching (lineage) or surface a soft validation warning (transform). Prefer the DuckDB path (§4) when running in Electron.
- Always pass `{ database: "postgresql" }` explicitly (root default is MySQL).

---

## 4. DuckDB `json_serialize_sql` — authoritative DuckDB-dialect AST (Electron main)

- **Engine:** `@duckdb/node-api` — **1.5.3-r.3** (installed). MIT. Runs in Electron **main**; renderer reaches it via `runReadOnlyQuery(sql)` (`src/platform/duckdb/duckdb.ts` → IPC). This is the **ground-truth** lineage path: it parses exactly the dialect DuckDB executes.

### Minimal correct call

```ts
import { runReadOnlyQuery } from "@/platform/duckdb/duckdb";

export async function duckdbAst(sql: string): Promise<DuckSqlAst> {
  // escape single quotes for the literal; json extension is bundled + autoloaded
  const literal = sql.replaceAll("'", "''");
  const rows = await runReadOnlyQuery(
    `SELECT json_serialize_sql('${literal}', skip_empty := true, skip_null := true) AS ast`,
  );
  const parsed = JSON.parse(rows[0].ast as string);
  if (parsed.error) throw new Error(parsed.error_message ?? "DuckDB parse error");
  return parsed; // { error:false, statements:[{ node:{...}, named_param_map:[] }] }
}
```

### Output shape (verified from docs)
`SELECT json_serialize_sql('SELECT 2')` →
```json
{
  "error": false,
  "statements": [{
    "node": {
      "type": "SELECT_NODE",
      "select_list": [ { "class": "CONSTANT", "type": "VALUE_CONSTANT", "alias": "", ... } ],
      "from_table": { "type": "EMPTY", "alias": "", ... },
      "where_clause": null, "group_expressions": [], "having": null, "qualify": null
    },
    "named_param_map": []
  }]
}
```
- Walk `statements[0].node.select_list` for projections: each has `class`/`type` (e.g. `COLUMN_REF`, `FUNCTION`), `alias`, and nested `children`/`column_names` for the source columns → build `ColumnLineage`.
- `from_table` (type `BASE_TABLE` with `table_name`, or `JOIN`/`SUBQUERY`) gives table provenance.
- Optional named params: `skip_default`, `skip_empty`, `skip_null`, `format` (all `:= boolean`). Use `skip_empty`/`skip_null` to shrink the JSON.
- Round-trip helper: `json_deserialize_sql(json_serialize_sql(...))` (semantically equal, not byte-identical — fine for validation).

### Offline / self-host
- **None.** `json` extension is **bundled and autoloaded** in `@duckdb/node-api`. No `INSTALL`/`LOAD`, no network. Entirely local in main.

### Wire into
- `src/platform/duckdb/sql-ast.ts` (new) — `duckdbAst(sql)` + an AST→`ColumnLineage[]` walker for the DuckDB node shape.
- Strategy: in the lineage worker, **prefer** the DuckDB path when `window.electron`/main IPC is available; **fall back** to node-sql-parser (§3) for the web build or when DuckDB returns `error:true`.

### Pitfalls
- `json_serialize_sql` only handles **SELECT** statements (semicolon-separated). DDL/`CREATE TABLE AS` won't serialize — strip to the inner `SELECT` first.
- The literal must have single quotes doubled (`''`) — use the helper above; do not interpolate raw user SQL.
- Result column comes back as a JSON **string** — `JSON.parse` it.

---

## 5. monaco-sql-languages + @monaco-editor/react — schema-aware SQL completion (offline)

- **Install names / versions:** `monaco-sql-languages` — **1.1.0** (installed, MIT, peer `monaco-editor >= 0.37.1`, bundles `dt-sql-parser`); `@monaco-editor/react` — **4.7.0** (installed); `@monaco-editor/loader` — 1.5.x (transitive).
- **MUST add:** `monaco-editor` as a **direct, local** dependency (it is currently NOT installed standalone — the loader otherwise pulls it from the jsdelivr CDN = offline failure). Pin it to a version `>= 0.37.1` that you also build the language workers against (e.g. the `monaco-editor` your toolchain already resolves; verify a single version, no duplicates).

### Step 1 — point the React loader at the LOCAL monaco (offline-critical)

```ts
// src/platform/monaco/setup-monaco.ts  (run once, before any editor mounts)
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";

loader.config({ monaco }); // <- use bundled monaco, NOT the CDN default
```

### Step 2 — self-host the monaco + SQL language workers (offline-critical)

monaco-sql-languages spawns a language worker keyed on the monaco language **label** (the `LanguageIdEnum` value, e.g. `pgsql`) through monaco's standard `MonacoEnvironment.getWorker(_, label)`. Register all workers with the bundler `new Worker(new URL(...))` pattern used across this repo:

```ts
// src/platform/monaco/monaco-environment.ts  (import once, before editor mounts)
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker"; // bundler worker import
// SQL language worker shipped by monaco-sql-languages:
import SqlWorker from "monaco-sql-languages/esm/sql.worker?worker";

self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    // language labels: 'pgsql' | 'mysql' | 'flinksql' | 'hivesql' | 'sparksql' |
    //                  'trinosql' | 'impalasql' | 'genericsql'
    switch (label) {
      case "pgsql":
      case "mysql":
      case "flinksql":
      case "hivesql":
      case "sparksql":
      case "trinosql":
      case "impalasql":
      case "genericsql":
        return new SqlWorker();
      default:
        return new EditorWorker();
    }
  },
};
```
> If your bundler does not support the `?worker` suffix, fall back to the repo's canonical form:
> `new Worker(new URL("monaco-sql-languages/esm/sql.worker.js", import.meta.url), { type: "module" })`.
> Verify the exact worker file name under `node_modules/monaco-sql-languages/esm/` for 1.1.0 at wire-up time and adjust the path; the **registration mechanism (label-based `getWorker`)** is the stable contract.

### Step 3 — register the language contribution + schema-aware completion

```ts
import "monaco-sql-languages/esm/languages/pgsql/pgsql.contribution"; // registers the 'pgsql' language
import {
  setupLanguageFeatures,
  LanguageIdEnum,
  EntityContextType,
  type CompletionService,
  type ICompletionItem,
} from "monaco-sql-languages";

// schema = the dataset catalog: { tables: [{ name, columns: string[] }] }
function makeCompletionService(getCatalog: () => Catalog): CompletionService {
  return async (_model, _position, _ctx, suggestions, _entities, _snippets) => {
    if (!suggestions) return [];
    const { keywords, syntax } = suggestions;
    const catalog = getCatalog();
    const items: ICompletionItem[] = [];

    for (const item of syntax) {
      if (item.syntaxContextType === EntityContextType.TABLE) {
        for (const t of catalog.tables)
          items.push({ label: t.name, kind: 9 /* Struct */, insertText: `"${t.name}"`, detail: "table" });
      }
      if (item.syntaxContextType === EntityContextType.COLUMN) {
        for (const t of catalog.tables)
          for (const c of t.columns)
            items.push({ label: c, kind: 4 /* Field */, insertText: `"${c}"`, detail: `column · ${t.name}` });
      }
    }
    // keep monaco-sql-languages' own keyword suggestions too
    const keywordItems: ICompletionItem[] = keywords.map((kw) => ({ label: kw, kind: 17 /* Keyword */ }));
    return [...items, ...keywordItems];
  };
}

export function initSqlEditor(getCatalog: () => Catalog) {
  setupLanguageFeatures(LanguageIdEnum.PG, {       // PG === 'pgsql' (closest to DuckDB)
    completionItems: {
      enable: true,
      triggerCharacters: [" ", "."],
      completionService: makeCompletionService(getCatalog),
    },
  });
}
```
Set the editor's language to `LanguageIdEnum.PG` (`"pgsql"`):
```tsx
import Editor from "@monaco-editor/react";
<Editor language="pgsql" /* ...; setup-monaco + monaco-environment + initSqlEditor already imported */ />
```

### Key API (current, v1.1.0)
- `setupLanguageFeatures(languageId, { completionItems: { enable, triggerCharacters, completionService } })` — wires the schema-aware provider.
- `LanguageIdEnum` values: `FLINK='flinksql'`, `HIVE='hivesql'`, `MYSQL='mysql'`, **`PG='pgsql'`**, `SPARK='sparksql'`, `TRINO='trinosql'`, `IMPALA='impalasql'`, `GENERIC='genericsql'`.
- `CompletionService(model, position, completionContext, suggestions, entities, snippets)` → returns/resolves `ICompletionItem[]`. Branch on `item.syntaxContextType` against `EntityContextType.{TABLE,COLUMN,DATABASE,...}`.
- Public exports include `setupLanguageFeatures`, `LanguageIdEnum`, `EntityContextType`, `StmtContextType`.

### Offline / self-host (the whole point of this section)
- **monaco-editor** itself: install locally + `loader.config({ monaco })`. Without this, the editor fetches `vs/` from jsdelivr → offline failure.
- **Language + editor workers:** self-host via `MonacoEnvironment.getWorker` (Step 2). The worker JS is shipped inside `monaco-editor` and `monaco-sql-languages` — bundle it, never fetch it.
- No CSS import is required by monaco-sql-languages (theme is via monaco's own theming). monaco-editor's CSS is injected by its own modules when bundled.
- Pin **one** `monaco-editor` version (peer needs `>= 0.37.1`; the README's hard-tested floor is `0.37.1`). Avoid duplicate monaco copies (breaks worker/language registration).

### Wire into
- `src/platform/monaco/setup-monaco.ts` (new) — `loader.config({ monaco })`.
- `src/platform/monaco/monaco-environment.ts` (new) — `MonacoEnvironment.getWorker`.
- `src/features/data-transform/components/SqlEditor.tsx` (new) — lazy `@monaco-editor/react` editor + `initSqlEditor(getCatalog)`; mount only when the SQL tab is first opened (it already uses `dynamic(() => import("@monaco-editor/react"))` in `DataTransformScreen.tsx`).
- Catalog source: the dataset store (`src/core/stores/data-store.ts`) — `tableName` + `columns`.

### Pitfalls
- Forgetting `loader.config({ monaco })` is a **silent** offline break (only fails when the network is gone). Add it to app bootstrap and assert no jsdelivr request in an offline smoke test.
- The language **must** be registered (`...pgsql.contribution`) before `setupLanguageFeatures` and before setting the editor `language="pgsql"`.
- Worker label switch must include every language label you register, else completion falls back to the plain editor worker (no SQL intelligence).
- Heavy: lazy-load the editor + setup only when the SQL surface is opened.

---

## 6. Shared worker boundary (Comlink) — wiring it together

Use the established repo pattern (see `src/features/ai-analysis/worker/client.ts`). One lineage worker owns build + SQL lineage + ELK layout; the transform worker owns SQL validation.

```ts
// src/features/lineage/worker/lineage.worker.ts
import * as Comlink from "comlink";
import ELK from "elkjs/lib/elk.bundled.js";
import { buildRealLineage } from "../core/build-lineage";
import { lineageFromSql } from "../core/sql-lineage";
import { toElkGraph, fromElkGraph } from "../core/elk-layout";

const elk = new ELK();

const api = {
  async build(input: BuildInput) {
    const model = buildRealLineage(input);                 // graph
    const enriched = enrichColumnLineage(model, input.transforms, lineageFromSql); // real columns (node-sql-parser fallback)
    const laid = await elk.layout(toElkGraph(enriched));   // positions (ELK, async)
    return { ...enriched, positions: fromElkGraph(laid) };
  },
};
Comlink.expose(api);
```

```ts
// src/features/lineage/worker/useLineageWorker.ts
import * as Comlink from "comlink";
const worker = new Worker(new URL("./lineage.worker.ts", import.meta.url), { type: "module" });
const proxy = Comlink.wrap<typeof api>(worker);
// const model = await proxy.build(input);
```

DuckDB AST (§4) runs in **main**, not this worker (it needs IPC). The worker `build` should accept already-fetched DuckDB ASTs in `input`, or the screen resolves DuckDB lineage via `runReadOnlyQuery` and passes it in. Keep the worker network-free and DuckDB-free.

### Target module layout (consolidated)
```
src/features/lineage/
  core/   types.ts · build-lineage.ts · sql-lineage.ts (§3) · elk-layout.ts (§2) · snapshot.ts (Dexie)
  worker/ lineage.worker.ts (§6) · useLineageWorker.ts
  components/ LineageGraph.tsx (§1) · LineageNode.tsx (§1) · LineageTable.tsx · ColumnLineageTable.tsx
  screens/ LineageScreen.tsx (orchestration only)
src/platform/duckdb/  sql-ast.ts (§4)
src/platform/monaco/  setup-monaco.ts (§5) · monaco-environment.ts (§5)
src/features/data-transform/
  engine/ validate.ts (§3) · step-to-sql.ts (quoteIdent fix)
  components/ SqlEditor.tsx (§5)
  workers/ transform.worker.ts (node-sql-parser validation)
```

---

## 7. Verification checklist (offline)
- `monaco-editor` resolves to **one** local version; `loader.config({ monaco })` present; offline run shows **no** jsdelivr/unpkg network request and the SQL editor still loads with completion.
- node-sql-parser imported from `build/postgresql` (not root); confirm worker bundle stays ~150 KB-class via `size-limit` per-worker budget.
- elkjs imported from `elk.bundled.js`; **no** `workerUrl` option; `elk.layout` awaited in worker.
- DuckDB `json_serialize_sql` runs in main with the `json` extension autoloaded (no INSTALL/LOAD); SELECT-only.
- `@xyflow/react` renders with `onlyRenderVisibleElements` and a minimap; pan/zoom does not re-render the React tree (verify with react-scan).
- `dagre` + `@types/dagre` removed after ELK migration.
- COOP/COEP unchanged (already set in `electron/security.ts`).
