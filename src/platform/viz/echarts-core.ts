/**
 * Tree-shaken ECharts core — the single source of truth for the `echarts`
 * instance across the app. Importing from here (instead of the full `"echarts"`
 * build) cuts ~1 MB to ~150-400 KB and guarantees ONE registry so charts never
 * render blank from a split registry.
 *
 * Register ONLY what features actually use. An unregistered series renders blank
 * with a console warning — add modules here as new chart types appear.
 *
 * Offline: pure JS, no runtime assets. Do NOT enable any URL-loaded map GeoJSON
 * or web-font symbol — bundle GeoJSON locally and `echarts.registerMap(...)`.
 */

import * as echarts from "echarts/core";
import {
  BarChart,
  CustomChart,
  HeatmapChart,
  LineChart,
  PieChart,
  ScatterChart,
  SankeyChart,
  SunburstChart,
} from "echarts/charts";
import {
  CalendarComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import { CanvasRenderer, SVGRenderer } from "echarts/renderers";

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  HeatmapChart,
  SankeyChart,
  SunburstChart,
  CustomChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  VisualMapComponent,
  DataZoomComponent,
  CalendarComponent,
  MarkLineComponent,
  CanvasRenderer,
  SVGRenderer,
]);

export { echarts };
export type { ECharts } from "echarts/core";
// Type-only import of the full package is erased at build time — safe.
export type { EChartsOption } from "echarts";
