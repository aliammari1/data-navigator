/**
 * Shared viz + worker-boundary platform surface.
 *
 * Feature code calls workers as `await proxy.method(...)` via these clients:
 *   - getAnalysisProxy()  → analysis.worker  (stats/clustering/attribution/forecast)
 *   - getChartProxy()     → chart.worker     (ECharts OffscreenCanvas render/export)
 *   - getParseProxy()     → parse.worker     (uDSV/Papa CSV + Arrow IPC decode)
 *   - getLayoutProxy()    → layout.worker    (h3 hexbin aggregation)
 *   - getExportProxy()    → export.worker    (pdf/xlsx/docx/pptx, web build)
 *
 * Plus main-thread viz helpers (uPlot config/hook, ECharts core registry, option
 * builders, seeded RNG) and the shared save-bytes util.
 */

// Worker clients (Comlink proxies).
export {
  disposeAnalysisWorker,
  getAnalysisProxy,
} from "./analysis-client";
export {
  getChartProxy,
  nextChartId,
  supportsOffscreenChart,
} from "./chart-client";
export { disposeExportWorker, getExportProxy, warmExportWorker } from "./export-client";
export { disposeLayoutWorker, getLayoutProxy } from "./layout-client";
export { disposeParseWorker, getParseProxy } from "./parse-client";

// Save util.
export { type SaveResult, saveBytes } from "./save-bytes";

// ECharts (tree-shaken) + option builders.
export { echarts } from "./echarts-core";
export type { ECharts, EChartsOption } from "./echarts-core";
export {
  buildBarOption,
  buildHeatmapOption,
  buildLineOption,
  buildPieOption,
  buildScatterOption,
  DENSE_SERIES_FLAGS,
  type SeriesSpec,
} from "./chart-options";
export { OffscreenChart, type OffscreenChartProps } from "./OffscreenChart";

// uPlot config + mount hook.
export {
  buildSparklineOptions,
  buildTimeSeriesOptions,
  msToSeconds,
  toAlignedData,
  type UPlotSeriesSpec,
} from "./uplot-config";
export { useUPlot } from "./use-uplot";

// Deterministic primitives.
export {
  DEFAULT_SEED,
  mulberry32,
  randInt,
  reservoirSampleIndices,
} from "./seeded-rng";

// Worker API types (for callers that want typed results without importing the
// worker module directly).
export type { AnalysisWorkerApi } from "@/workers/analysis.worker";
export type { ChartWorkerApi } from "@/workers/chart.worker";
export type { ExportWorkerApi } from "@/workers/export.worker";
export type { LayoutWorkerApi } from "@/workers/layout.worker";
export type { ParseWorkerApi } from "@/workers/parse.worker";
