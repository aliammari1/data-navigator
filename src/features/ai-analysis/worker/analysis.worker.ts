/// <reference lib="webworker" />
//
// ─── Analysis worker (Comlink) ────────────────────────────────────────────────
//
// Hosts the pure analysis pipeline OFF the renderer main thread. DuckDB lives on
// the renderer/main process, so the worker cannot reach it directly — instead the
// screen passes a Comlink-proxied `query` callback. The worker awaits SQL over
// that channel and performs the CPU-heavy JS math (k-means, anomaly scoring,
// histogram densification) here, so long synchronous phases never block paint.
//
// Progress and the query channel are both Comlink callbacks; results are plain
// serialisable objects (no class instances), so they cross the worker boundary
// cleanly.

import * as Comlink from "comlink";
import {
  type AnalysisInput,
  type AnalysisKernels,
  type AnalysisResult,
  type AnalysisStage,
  runAnalysisPipeline,
} from "../model/pipeline";

export interface AnalysisWorkerApi {
  run(
    input: AnalysisInput,
    query: (sql: string) => Promise<Record<string, unknown>[]>,
    kernels: AnalysisKernels,
    onStage: (stage: AnalysisStage) => void,
  ): Promise<AnalysisResult>;
}

const api: AnalysisWorkerApi = {
  async run(input, query, kernels, onStage) {
    return runAnalysisPipeline(
      input,
      (sql) => query(sql),
      // `kernels` is a Comlink proxy of the platform analysis worker (forwarded
      // through the main thread); each method already returns a Promise.
      {
        kMeans: (data, options) => kernels.kMeans(data, options),
        gesdAnomalies: (values, options) => kernels.gesdAnomalies(values, options),
        holtWinters: (values, options) => kernels.holtWinters(values, options),
      },
      (stage) => {
        // onStage is a Comlink proxy; fire-and-forget progress.
        void onStage(stage);
      },
    );
  },
};

Comlink.expose(api);
