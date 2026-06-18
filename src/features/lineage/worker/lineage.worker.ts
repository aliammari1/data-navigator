/// <reference lib="webworker" />
// ─── Lineage worker (Comlink) ────────────────────────────────────────────────
//
// Moves graph construction + SQL→column lineage (node-sql-parser) + ELK layout
// OFF the main thread, per the v2 plan. The screen `await`s a fully laid-out
// model so first paint is never blocked by build/layout.
//
// This worker is network-free and DuckDB-free: DuckDB AST introspection (the
// authoritative Electron path) runs in the renderer/main and is passed in as
// already-resolved input; the worker only uses the pure node-sql-parser path.
//
// Established repo pattern: `new Worker(new URL(...), { type: "module" })` +
// `Comlink.expose` (see src/features/ai-analysis/worker/analysis.worker.ts).

import * as Comlink from "comlink";
import { type BuildLineageInput, buildRealLineage } from "../core/build-lineage";
import { layoutGraph } from "../core/elk-layout";
import type { LineageModel } from "../core/snapshot";

export interface LineageWorkerApi {
  build(input: BuildLineageInput): Promise<LineageModel>;
}

const api: LineageWorkerApi = {
  async build(input: BuildLineageInput): Promise<LineageModel> {
    // 1. Build the graph from local records. `buildRealLineage` already derives
    //    REAL column lineage from `transformSql` via node-sql-parser, falling
    //    back to name-equality only when the SQL cannot be parsed.
    const { nodes, edges, columnLineage } = buildRealLineage(input);
    // 2. Lay it out with ELK (async, layered DAG, crossing minimization).
    const positions = await layoutGraph(nodes, edges);
    return { nodes, edges, columnLineage, positions };
  },
};

Comlink.expose(api);
