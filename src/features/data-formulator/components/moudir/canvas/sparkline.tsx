"use client";

/**
 * Moudir — tiny SVG sparkline for the KPI panel cards.
 *
 * FACTS (GateGuard): new file under the canvas Moudir experience (remove three.js
 * direction). Importers: kpi-panel.tsx (same folder). No store/data deps — pure
 * presentational SVG. Offline-safe: zero external assets, all colors from the
 * fixed MOUDIR signal hues / theme tokens. Reduced-motion aware (no animation —
 * SVG is static by nature). User instruction: "canvas Moudir experience, remove
 * three.js".
 *
 * Per the design spec (§3.1): pure trend, no axes/grid. 1.75px stroke in coral
 * for the focus metric, dim for secondary; area fill = coral at low alpha; last
 * point a small coral dot; baseline at min. An optional forecast tail renders
 * dashed (the offline ONNX continuation). Crisp at any DPR — it's SVG, so no
 * canvas/devicePixelRatio handling is needed.
 */

import { MOUDIR } from "../moudir-kit";

export interface SparklineProps {
  /** The trend series. Empty/short series degrade to a flat baseline. */
  values: number[];
  /**
   * Optional forecast continuation (rendered dashed, after the main path). The
   * first forecast point connects to the last real point for a seamless tail.
   */
  forecast?: number[];
  /** Stroke color. Defaults to the coral signal for the focus metric. */
  color?: string;
  width?: number;
  height?: number;
  /** Stroke width in px. */
  strokeWidth?: number;
  /** When true, fill the area under the line (coral at low alpha). */
  area?: boolean;
  className?: string;
}

/** Maps a value series to an SVG polyline `points` path inside the viewbox. */
function toPath(
  values: number[],
  min: number,
  max: number,
  w: number,
  h: number,
  pad: number,
  xStart: number,
  xEnd: number,
): { d: string; lastX: number; lastY: number } | null {
  if (values.length === 0) return null;
  const span = max - min || 1;
  const innerH = h - pad * 2;
  const range = xEnd - xStart;
  const step = values.length > 1 ? range / (values.length - 1) : 0;

  let d = "";
  let lastX = xStart;
  let lastY = h - pad;
  values.forEach((v, i) => {
    const x = xStart + step * i;
    // Invert Y: higher value → smaller y (closer to top).
    const y = pad + innerH - ((v - min) / span) * innerH;
    d += i === 0 ? `M ${x.toFixed(2)} ${y.toFixed(2)}` : ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
    lastX = x;
    lastY = y;
  });
  return { d, lastX, lastY };
}

export function Sparkline({
  values,
  forecast,
  color = MOUDIR.coral,
  width = 88,
  height = 28,
  strokeWidth = 1.75,
  area = true,
  className,
}: SparklineProps) {
  const pad = strokeWidth + 1;
  const clean = values.filter((v) => Number.isFinite(v));
  const fcClean = (forecast ?? []).filter((v) => Number.isFinite(v));

  // Flat / empty data → a quiet baseline so the card never looks broken.
  if (clean.length < 2) {
    return (
      <svg
        className={className}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="presentation"
        aria-hidden
      >
        <line
          x1={pad}
          y1={height - pad}
          x2={width - pad}
          y2={height - pad}
          stroke="var(--glass-border)"
          strokeWidth={1}
        />
      </svg>
    );
  }

  // Shared min/max across real + forecast so the tail aligns to the same scale.
  const all = [...clean, ...fcClean];
  const min = Math.min(...all);
  const max = Math.max(...all);

  // Split the horizontal space: real series gets the lead, forecast the tail.
  const hasForecast = fcClean.length > 0;
  const realEnd = hasForecast ? width - pad - (width - pad * 2) * 0.28 : width - pad;
  const main = toPath(clean, min, max, width, height, pad, pad, realEnd);
  if (!main) return null;

  // Forecast path starts at the last real point for a seamless dashed tail.
  let fcD: string | null = null;
  if (hasForecast) {
    const fcSeries = [clean[clean.length - 1], ...fcClean];
    const fc = toPath(fcSeries, min, max, width, height, pad, main.lastX, width - pad);
    fcD = fc?.d ?? null;
  }

  const span = max - min || 1;
  const innerH = height - pad * 2;
  const baselineY = pad + innerH - ((min - min) / span) * innerH; // = height - pad
  const areaD = area
    ? `${main.d} L ${main.lastX.toFixed(2)} ${baselineY.toFixed(2)} L ${pad.toFixed(2)} ${baselineY.toFixed(2)} Z`
    : null;

  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="presentation"
      aria-hidden
    >
      {areaD && <path d={areaD} fill={color} fillOpacity={0.08} stroke="none" />}
      <path
        d={main.d}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {fcD && (
        <path
          d={fcD}
          fill="none"
          stroke={color}
          strokeOpacity={0.55}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray="3 3"
        />
      )}
      {/* Last real point — a small coral dot. */}
      <circle cx={main.lastX} cy={main.lastY} r={2.4} fill={color} />
    </svg>
  );
}
