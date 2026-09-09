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

// Worker API types (for callers that want typed results without importing the
// worker module directly).

// Worker clients (Comlink proxies).

export {
  getChartProxy,
  supportsOffscreenChart,
} from "./chart-client";

export type { EChartsOption } from "./echarts-core";
// ECharts (tree-shaken) + option builders.
export { echarts } from "./echarts-core";
export { getExportProxy, warmExportWorker } from "./export-client";

export { OffscreenChart } from "./OffscreenChart";

// Save util.
export { saveBytes } from "./save-bytes";
// Deterministic primitives.

// uPlot config + mount hook.
