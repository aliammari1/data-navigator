"use client";

/**
 * ForecastChart — the hot-path forecast visual, drawn with uPlot.
 *
 * This replaces the ECharts line/band/anomaly chart that previously dominated
 * the forecast panel. uPlot is the right tool for the most-rendered surface
 * (it re-renders on every horizon toggle and when the advanced/Pyodide upgrade
 * lands): it draws dense time-series at ~10% CPU / ~12MB where ECharts costs
 * ~70% / ~85MB, and stays at 60fps on real datasets with thousands of points.
 * ECharts is kept for the heatmap/scatter/gauge/pie tabs (its strengths).
 *
 * What it draws from a single `ForecastResult`:
 *  - history line (solid),
 *  - forecast line (dashed), connected to the last historical point,
 *  - a shaded ±CI band over the forecast horizon (uPlot `bands`), and
 *  - anomaly markers on the historical series (custom draw hook).
 *
 * All colors come from the offline shadcn design tokens (`--primary`,
 * `--border`, …) read once from the document, so theming/contrast stay
 * consistent and there is no hardcoded hex on the hot path. uPlot runs on the
 * main thread (Canvas 2D) — no worker,
 * no CDN, fully offline (CSS is bundled by the platform `use-uplot` hook).
 */

import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { useEffect, useMemo, useRef } from "react";
import { fmtCompact } from "@/features/telecom/lib/format";
import type { ForecastResult } from "../core/forecast-engine";

// ─── Token resolution (offline design tokens, no hardcoded hex) ───────────────

interface ChartTheme {
  axis: string;
  grid: string;
  history: string;
  forecast: string;
  band: string;
  anomaly: string;
  anomalyRing: string;
}

const FALLBACK_THEME: ChartTheme = {
  axis: "#64748b",
  grid: "#1e293b",
  history: "#3b82f6",
  forecast: "#f97316",
  band: "rgba(99,102,241,0.16)",
  anomaly: "#ef4444",
  anomalyRing: "#e2e8f0",
};

/**
 * Resolve a CSS custom property to a concrete color string. uPlot draws to a raw
 * canvas and cannot consume `var(--x)` directly, so we read the computed value
 * once. Falls back to a sensible default when the token is absent (e.g. SSR /
 * tests where `getComputedStyle` is unavailable).
 */
function readToken(name: string, fallback: string): string {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return fallback;
  }
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function resolveTheme(): ChartTheme {
  return {
    axis: readToken("--muted-foreground", FALLBACK_THEME.axis),
    grid: readToken("--border", FALLBACK_THEME.grid),
    history: readToken("--primary", FALLBACK_THEME.history),
    forecast: readToken("--warning", FALLBACK_THEME.forecast),
    band: FALLBACK_THEME.band,
    anomaly: readToken("--destructive", FALLBACK_THEME.anomaly),
    anomalyRing: readToken("--foreground", FALLBACK_THEME.anomalyRing),
  };
}

// ─── Aligned data assembly (pure) ─────────────────────────────────────────────

/**
 * Map a date label to a unix-seconds x value for uPlot's time scale. Real daily
 * KPI dates parse cleanly; synthetic `t+n` labels (non-date series) fall back to
 * the row index so the chart still renders monotonically.
 */
function toX(date: string, index: number): number {
  const ts = Date.parse(date);
  return Number.isFinite(ts) ? ts / 1000 : index;
}

interface AssembledData {
  data: uPlot.AlignedData;
  /** Whether the x axis carries real timestamps (vs index fallback). */
  isTime: boolean;
  /** uPlot data-space [x, y] points for the anomalies (drawn as an overlay). */
  anomalyPoints: Array<[number, number]>;
}

function assemble(result: ForecastResult): AssembledData {
  const histLen = result.history.length;
  const xs: number[] = [];
  const hist: (number | null)[] = [];
  const fc: (number | null)[] = [];
  const lo: (number | null)[] = [];
  const hi: (number | null)[] = [];

  let realTimestamps = histLen > 0;

  result.history.forEach((p, i) => {
    const x = toX(p.date, i);
    if (!Number.isFinite(Date.parse(p.date))) realTimestamps = false;
    xs.push(x);
    hist.push(p.value);
    // Connect the forecast line to the last historical point for continuity.
    fc.push(i === histLen - 1 ? p.value : null);
    lo.push(null);
    hi.push(null);
  });

  result.forecast.forEach((p, i) => {
    const x = toX(p.date, histLen + i);
    if (!Number.isFinite(Date.parse(p.date))) realTimestamps = false;
    xs.push(x);
    hist.push(null);
    fc.push(p.value);
    lo.push(p.lower);
    hi.push(p.upper);
  });

  // Anomaly markers sit on the historical series at their own x.
  const xByIndex = xs.slice(0, histLen);
  const anomalyPoints: Array<[number, number]> = result.anomalies.map((a) => [
    xByIndex[a.index] ?? toX(a.date, a.index),
    a.value,
  ]);

  // Series order (index): 0 = x, 1 = history, 2 = forecast, 3 = CI upper,
  // 4 = CI lower. The band shades between upper(3) and lower(4).
  const data: uPlot.AlignedData = [xs, hist, fc, hi, lo] as unknown as uPlot.AlignedData;

  return { data, isTime: realTimestamps, anomalyPoints };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ForecastChart({
  result,
  height = 320,
  ariaLabel = "Forecast with confidence band",
}: {
  result: ForecastResult;
  height?: number;
  ariaLabel?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);
  // Anomaly points are read inside the draw hook (which is created once); keep
  // them in a ref so updates don't require recreating the plot.
  const anomalyRef = useRef<Array<[number, number]>>([]);
  const themeRef = useRef<ChartTheme>(FALLBACK_THEME);

  const assembled = useMemo(() => assemble(result), [result]);
  anomalyRef.current = assembled.anomalyPoints;

  // Create the plot exactly once; stream new data via `setData` (cheap).
  // biome-ignore lint/correctness/useExhaustiveDependencies: opts are built once on mount by design (uPlot reads them only at construction); data updates flow through the second effect.
  useEffect(() => {
    if (!el.current) return;
    const theme = resolveTheme();
    themeRef.current = theme;

    const opts: uPlot.Options = {
      width: el.current.clientWidth || 600,
      height,
      // Reduce uPlot's default legend/padding chrome; we render our own labels.
      legend: { show: false },
      cursor: { drag: { x: true, y: false }, points: { show: false } },
      scales: { x: { time: assembled.isTime }, y: { auto: true } },
      axes: [
        {
          stroke: theme.axis,
          grid: { show: false },
          ticks: { stroke: theme.grid },
          size: 40,
        },
        {
          stroke: theme.axis,
          grid: { stroke: theme.grid, width: 1 },
          ticks: { stroke: theme.grid },
          size: 56,
          values: (_u, splits) => splits.map((v) => fmtCompact(v)),
        },
      ],
      series: [
        {},
        {
          label: "History",
          stroke: theme.history,
          width: 2,
          points: { show: false },
          spanGaps: false,
        },
        {
          label: "Forecast",
          stroke: theme.forecast,
          width: 2,
          dash: [6, 4],
          points: { show: false },
          spanGaps: true,
        },
        // CI upper / lower are invisible lines; the band fills between them.
        {
          label: "CI upper",
          stroke: "transparent",
          width: 0,
          points: { show: false },
          spanGaps: true,
        },
        {
          label: "CI lower",
          stroke: "transparent",
          width: 0,
          fill: theme.band,
          points: { show: false },
          spanGaps: true,
        },
      ],
      // Shade the region between the CI upper (series 3) and lower (series 4).
      bands: [{ series: [3, 4], fill: theme.band }],
      hooks: {
        // Draw anomaly markers as diamonds on top of the history line.
        draw: [
          (u) => {
            const pts = anomalyRef.current;
            if (pts.length === 0) return;
            const ctx = u.ctx;
            const t = themeRef.current;
            ctx.save();
            for (const [x, y] of pts) {
              const cx = u.valToPos(x, "x", true);
              const cy = u.valToPos(y, "y", true);
              if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
              const r = 5 * devicePixelRatio;
              ctx.beginPath();
              ctx.moveTo(cx, cy - r);
              ctx.lineTo(cx + r, cy);
              ctx.lineTo(cx, cy + r);
              ctx.lineTo(cx - r, cy);
              ctx.closePath();
              ctx.fillStyle = t.anomaly;
              ctx.fill();
              ctx.lineWidth = 1 * devicePixelRatio;
              ctx.strokeStyle = t.anomalyRing;
              ctx.stroke();
            }
            ctx.restore();
          },
        ],
      },
    };

    plot.current = new uPlot(opts, assembled.data, el.current);

    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      plot.current?.setSize({
        width: entry.contentRect.width,
        height,
      });
    });
    ro.observe(el.current);

    return () => {
      ro.disconnect();
      plot.current?.destroy();
      plot.current = null;
    };
  }, []);

  // Cheap incremental refresh — never recreate the chart.
  useEffect(() => {
    plot.current?.setData(assembled.data);
  }, [assembled.data]);

  return <div ref={el} role="img" aria-label={ariaLabel} style={{ width: "100%", height }} />;
}
