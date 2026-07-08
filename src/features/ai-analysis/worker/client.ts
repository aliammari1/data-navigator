// ─── Analysis worker client ───────────────────────────────────────────────────
//
// Lazily constructs the Comlink-wrapped analysis worker. The worker runs the
// pipeline off the main thread; SQL still executes on the renderer (DuckDB lives
// there) via a Comlink-proxied `query` callback supplied per run.
//
// If the worker cannot be constructed (e.g. an environment without module-worker
// support), callers fall back to running the same pure pipeline inline — the
// pipeline module is transport-agnostic by design, so correctness is identical;
// only the off-main-thread benefit is lost.

import * as Comlink from "comlink";
import type {
  AnalysisInput,
  AnalysisKernels,
  AnalysisResult,
  AnalysisStage,
} from "../model/pipeline";
import { runAnalysisPipeline } from "../model/pipeline";
import type { AnalysisWorkerApi } from "./analysis.worker";

type QueryFn = (sql: string) => Promise<Record<string, unknown>[]>;
type ProgressFn = (stage: AnalysisStage) => void;

let workerProxy: Comlink.Remote<AnalysisWorkerApi> | null = null;
let workerUnavailable = false;

function getWorkerProxy(): Comlink.Remote<AnalysisWorkerApi> | null {
  if (workerUnavailable) return null;
  if (workerProxy) return workerProxy;
  if (typeof Worker === "undefined") {
    workerUnavailable = true;
    return null;
  }
  try {
    const worker = new Worker(new URL("./analysis.worker.ts", import.meta.url), {
      type: "module",
      name: "ai-analysis",
    });
    workerProxy = Comlink.wrap<AnalysisWorkerApi>(worker);
    return workerProxy;
  } catch {
    workerUnavailable = true;
    return null;
  }
}

/**
 * Run the analysis pipeline, preferring the worker. Falls back to inline
 * execution (identical results) if the worker is unavailable or throws on setup.
 */
export async function runAnalysis(
  input: AnalysisInput,
  query: QueryFn,
  kernels: AnalysisKernels,
  onStage: ProgressFn,
): Promise<AnalysisResult> {
  const proxy = getWorkerProxy();
  if (proxy) {
    try {
      return await proxy.run(
        input,
        Comlink.proxy(query),
        // The kernels object holds functions, so it must cross the boundary as a
        // Comlink proxy (each call is forwarded back to the main thread, which in
        // turn forwards to the shared platform analysis worker).
        Comlink.proxy(kernels),
        Comlink.proxy(onStage),
      );
    } catch (err) {
      // A worker runtime/transfer failure should not break analysis — degrade to
      // inline so the feature stays functional offline on every target.
      console.warn("[ai-analysis] worker run failed, falling back inline:", err);
      workerUnavailable = true;
      workerProxy = null;
    }
  }
  return runAnalysisPipeline(input, query, kernels, onStage);
}
