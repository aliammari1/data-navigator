// ─── useLineageWorker — worker-first lineage build hook ───────────────────────
//
// Builds the lineage model OFF the main thread (Comlink worker), persists a
// content-hashed snapshot to Dexie for instant offline hydration, and guards
// against stale results when the input changes rapidly (older builds are
// ignored by hash). Falls back to inline build+layout if the worker can't be
// constructed (identical results; only the off-main-thread benefit is lost).

import * as Comlink from "comlink";
import { useEffect, useRef, useState } from "react";
import { type BuildLineageInput, buildRealLineage } from "../core/build-lineage";
import { layoutGraph } from "../core/elk-layout";
import { hashInput, type LineageModel, loadSnapshot, saveSnapshot } from "../core/snapshot";
import type { LineageWorkerApi } from "./lineage.worker";

const EMPTY_MODEL: LineageModel = {
  nodes: [],
  edges: [],
  columnLineage: [],
  positions: {},
};

let workerProxy: Comlink.Remote<LineageWorkerApi> | null = null;
let workerUnavailable = false;

function getWorkerProxy(): Comlink.Remote<LineageWorkerApi> | null {
  if (workerUnavailable) return null;
  if (workerProxy) return workerProxy;
  if (typeof Worker === "undefined") {
    workerUnavailable = true;
    return null;
  }
  try {
    const worker = new Worker(new URL("./lineage.worker.ts", import.meta.url), {
      type: "module",
      name: "lineage",
    });
    workerProxy = Comlink.wrap<LineageWorkerApi>(worker);
    return workerProxy;
  } catch {
    workerUnavailable = true;
    return null;
  }
}

/** Inline fallback — same pure pipeline as the worker, on the main thread. */
async function buildInline(input: BuildLineageInput): Promise<LineageModel> {
  const { nodes, edges, columnLineage } = buildRealLineage(input);
  const positions = await layoutGraph(nodes, edges);
  return { nodes, edges, columnLineage, positions };
}

/**
 * Derive a stable content hash from the build input — record ids + updatedAts +
 * collection sizes. If nothing changed, we hydrate the persisted snapshot
 * instead of recomputing.
 */
function inputHash(input: BuildLineageInput): string {
  const parts: string[] = [];
  for (const d of input.datasets)
    parts.push(`d:${d.id}:${d.updatedAt}:${d.parentId ?? ""}:${d.qualityScore}`);
  for (const t of input.transforms) parts.push(`t:${t.id}:${t.appliedAt}:${t.type}`);
  for (const c of input.savedCharts) parts.push(`c:${c.id}:${c.createdAt}`);
  for (const s of input.telecomSources) parts.push(`s:${s.key}:${s.savedAt}`);
  for (const a of input.telecomAnalytics) parts.push(`a:${a.key}:${a.savedAt}`);
  for (const ds of input.dailyStats) parts.push(`y:${ds.day}:${ds.computedAt}`);
  parts.push(`loaded:${[...input.loadedTableNames].sort().join(",")}`);
  return hashInput(parts);
}

export interface UseLineageWorkerResult {
  model: LineageModel;
  loading: boolean;
  /** content hash of the currently rendered model (for diff/time-travel UIs) */
  hash: string | null;
}

export function useLineageWorker(
  input: BuildLineageInput,
  /** when false (e.g. still fetching IndexedDB caches), skip building */
  ready: boolean,
): UseLineageWorkerResult {
  const [model, setModel] = useState<LineageModel>(EMPTY_MODEL);
  const [loading, setLoading] = useState(true);
  const [hash, setHash] = useState<string | null>(null);
  // Track the latest requested hash so out-of-order async results are dropped.
  const latestHash = useRef<string>("");
  // Hold the freshest input without making it an effect dependency — the hash
  // is the canonical change signal; raw array identity must not trigger rebuilds.
  const inputRef = useRef(input);
  inputRef.current = input;

  // Stable hash drives the effect — recompute only when real records change.
  const currentHash = inputHash(input);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    latestHash.current = currentHash;
    setLoading(true);

    (async () => {
      // 1. Instant offline hydration from the persisted snapshot.
      const cached = await loadSnapshot(currentHash);
      if (cancelled || latestHash.current !== currentHash) return;
      if (cached) {
        setModel({
          nodes: cached.nodes,
          edges: cached.edges,
          columnLineage: cached.columnLineage,
          positions: cached.positions,
        });
        setHash(currentHash);
        setLoading(false);
        return;
      }

      // 2. Build via the worker (fall back to inline on worker failure).
      const buildInputNow = inputRef.current;
      let built: LineageModel;
      const proxy = getWorkerProxy();
      if (proxy) {
        try {
          built = await proxy.build(buildInputNow);
        } catch {
          workerUnavailable = true;
          workerProxy = null;
          built = await buildInline(buildInputNow);
        }
      } else {
        built = await buildInline(buildInputNow);
      }

      if (cancelled || latestHash.current !== currentHash) return;
      setModel(built);
      setHash(currentHash);
      setLoading(false);

      // 3. Persist the snapshot for next mount (best-effort, fire-and-forget).
      void saveSnapshot({ ...built, hash: currentHash, createdAt: Date.now() });
    })();

    return () => {
      cancelled = true;
    };
    // `currentHash` is the canonical change signal; the live input is read via
    // `inputRef` so referentially-unstable array identity never triggers a
    // rebuild. Only hash/ready belong in the dependency array.
  }, [currentHash, ready]);

  return { model, loading, hash };
}
