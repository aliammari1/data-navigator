/**
 * Tree-shaken ECharts build for geo-analysis.
 *
 * The previous screen pulled the full `echarts-for-react` bundle (~1MB) via a
 * `useEffect`/`setState` dance. This module registers only the chart types and
 * components the geo distribution tab actually uses (heatmap + pie), then the
 * screen renders it through `echarts-for-react/lib/core` with `next/dynamic`,
 * dropping the route's ECharts weight by roughly two-thirds.
 */

import { HeatmapChart, PieChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
  HeatmapChart,
  PieChart,
  TooltipComponent,
  VisualMapComponent,
  GridComponent,
  LegendComponent,
  CanvasRenderer,
]);

export default echarts;
