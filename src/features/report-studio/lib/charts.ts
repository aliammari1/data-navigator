/**
 * Offline chart rasterization for exports.
 *
 * Uses ECharts' zero-dependency SSR renderer (`echarts.init(null, …, { ssr,
 * renderer: 'svg' })` + `renderToSVGString()`) to produce a REAL vector chart
 * string with no DOM and no network. Runs inside the export worker.
 *
 * This replaces the DOCX `[Chart: …]` text placeholder with an embedded SVG
 * image. We deliberately avoid DOM-screenshotting (html2canvas) per the project
 * tech-radar rule. A PNG → resvg rasterization path is intentionally NOT used
 * here because `@resvg/resvg-wasm` is not an installed dependency; Word renders
 * embedded SVG natively, so the SVG path is sufficient and fully offline.
 */

import * as echarts from "echarts";
import type { ReportData, ReportHourly } from "./types";

const CHART_W = 900;
const CHART_H = 360;

/** Encode a UTF-8 string to bytes without relying on Node Buffer. */
function utf8Bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function hourlyOption(hourly: ReportHourly[], primary: string): echarts.EChartsCoreOption {
  return {
    backgroundColor: "#ffffff",
    grid: { left: 56, right: 56, top: 48, bottom: 40 },
    title: {
      text: "Hourly Transaction Distribution",
      left: "center",
      textStyle: { fontSize: 18, color: "#1e293b", fontWeight: "bold" },
    },
    legend: { top: 28, data: ["Transactions", "Success Rate %"], textStyle: { color: "#475569" } },
    xAxis: {
      type: "category",
      data: hourly.map((h) => `${h.hour}:00`),
      axisLabel: { color: "#64748b" },
      axisLine: { lineStyle: { color: "#cbd5e1" } },
    },
    yAxis: [
      {
        type: "value",
        name: "Volume",
        nameTextStyle: { color: "#64748b" },
        axisLabel: { color: "#64748b" },
        splitLine: { lineStyle: { color: "#e2e8f0" } },
      },
      {
        type: "value",
        name: "%",
        min: 0,
        max: 100,
        position: "right",
        axisLabel: { color: "#64748b" },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: "Transactions",
        type: "line",
        smooth: true,
        showSymbol: false,
        areaStyle: { opacity: 0.15, color: primary },
        lineStyle: { color: primary, width: 2 },
        itemStyle: { color: primary },
        data: hourly.map((h) => Math.round(h.count)),
      },
      {
        name: "Success Rate %",
        type: "line",
        yAxisIndex: 1,
        smooth: true,
        showSymbol: false,
        lineStyle: { color: "#00aa44", width: 2 },
        itemStyle: { color: "#00aa44" },
        data: hourly.map((h) => Number(h.successRate.toFixed(1))),
      },
    ],
  };
}

/**
 * Render the hourly distribution chart to an SVG string (offline, no DOM).
 * Returns `null` when there is no real hourly data to plot.
 */
export function renderHourlyChartSvg(data: ReportData, primaryColor = "#0066cc"): string | null {
  if (!data.hourlyData.length) return null;
  const chart = echarts.init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: CHART_W,
    height: CHART_H,
  });
  try {
    chart.setOption(hourlyOption(data.hourlyData, primaryColor));
    return chart.renderToSVGString();
  } finally {
    chart.dispose();
  }
}

/** Render the hourly chart SVG as raw bytes for embedding (docx ImageRun). */
export function renderHourlyChartSvgBytes(
  data: ReportData,
  primaryColor?: string,
): Uint8Array | null {
  const svg = renderHourlyChartSvg(data, primaryColor);
  return svg ? utf8Bytes(svg) : null;
}
