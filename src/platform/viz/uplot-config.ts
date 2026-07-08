/**
 * uPlot config builders. uPlot runs on the MAIN thread (Canvas 2D, no
 * OffscreenCanvas/worker needed — it is already ~10% CPU at 166k points), but we
 * centralize the option construction here so feature hooks stay thin.
 *
 * NOTE: uPlot's time scale expects unix SECONDS, not milliseconds. Convert
 * DuckDB epoch-ms columns with `/ 1000` (see `msToSeconds`).
 *
 * Type-only import of uPlot — the runtime `import uPlot` + the required CSS
 * (`uplot/dist/uPlot.min.css`) belong in the React mount hook (`use-uplot.ts`),
 * NOT here, so this module is safe to import in any context.
 */

import type uPlot from "uplot";

/** Convert a millisecond timestamp column to uPlot's expected seconds. */
export function msToSeconds(ms: ArrayLike<number>): Float64Array {
  const out = new Float64Array(ms.length);
  for (let i = 0; i < ms.length; i++) out[i] = ms[i]! / 1000;
  return out;
}

export interface UPlotSeriesSpec {
  label: string;
  stroke: string;
  /** rgba fill for area charts; omit for plain lines. */
  fill?: string;
  width?: number;
}

/**
 * Dense time-series options (telecom daily/hourly trends, forecast actual+CI,
 * sparklines). x is unix-seconds when `time` is true.
 */
export function buildTimeSeriesOptions(
  width: number,
  height: number,
  series: UPlotSeriesSpec[],
  opts: { time?: boolean; axisColor?: string; dragX?: boolean } = {},
): uPlot.Options {
  const axisColor = opts.axisColor ?? "#9ca3af";
  return {
    width,
    height,
    scales: { x: { time: opts.time ?? true }, y: { auto: true } },
    series: [
      {}, // index 0 = x series (always {})
      ...series.map((s) => ({
        label: s.label,
        stroke: s.stroke,
        width: s.width ?? 1,
        fill: s.fill,
        points: { show: false },
      })),
    ],
    axes: [{ stroke: axisColor }, { stroke: axisColor }],
    cursor: { drag: { x: opts.dragX ?? true, y: false } },
    legend: { show: series.length > 1 },
  };
}

/**
 * Compact sparkline options (no axes/legend/cursor) for tiny inline trends
 * (data-browser column previews).
 */
export function buildSparklineOptions(
  width: number,
  height: number,
  stroke = "#6366f1",
  fill = "rgba(99,102,241,0.12)",
): uPlot.Options {
  return {
    width,
    height,
    scales: { x: { time: false }, y: { auto: true } },
    series: [{}, { stroke, fill, width: 1, points: { show: false } }],
    axes: [{ show: false }, { show: false }],
    cursor: { show: false },
    legend: { show: false },
  };
}

/**
 * Assemble uPlot AlignedData from typed-array columns. First array MUST be x.
 * All series must be the same length as x (pad gaps with NaN/null).
 */
export function toAlignedData(x: ArrayLike<number>, ys: ArrayLike<number>[]): uPlot.AlignedData {
  return [x, ...ys] as unknown as uPlot.AlignedData;
}
