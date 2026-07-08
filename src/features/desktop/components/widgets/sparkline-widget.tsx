"use client";

import { useMemo } from "react";
import type { WidgetTelecomData } from "@/features/desktop/components/widgets/use-widget-telecom-data";
import { fmtCompact } from "@/features/telecom/lib/format";

/**
 * Sparkline widget — an inline SVG area-spark of the hourly transaction volume
 * for the active telecom report. Pure SVG, no chart library, offline-safe.
 */
interface SparklineWidgetProps {
  data: WidgetTelecomData;
  config: Record<string, unknown>;
}

export function SparklineWidget({ data, config }: SparklineWidgetProps) {
  const series = useMemo(() => {
    const byHour = new Array<number>(24).fill(0);
    for (const row of data.hourly) {
      if (row.hour >= 0 && row.hour < 24) byHour[row.hour] = row.total;
    }
    return byHour;
  }, [data.hourly]);

  const total = useMemo(() => series.reduce((a, b) => a + b, 0), [series]);
  const peak = useMemo(() => Math.max(1, ...series), [series]);

  // SVG viewBox 100x32 — points mapped across the width, y inverted.
  const { line, area } = useMemo(() => {
    const w = 100;
    const h = 32;
    const n = series.length;
    if (n <= 1) return { line: "", area: "" };
    const step = w / (n - 1);
    const pts = series.map((v, i) => {
      const x = i * step;
      const y = h - (v / peak) * (h - 2) - 1;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
    const line = `M${pts.join("L")}`;
    const area = `${line}L${w},${h}L0,${h}Z`;
    return { line, area };
  }, [series, peak]);

  return (
    <div className="flex h-full flex-col justify-between gap-1.5 p-1">
      <div className="flex items-baseline justify-between gap-2">
        <span
          className="text-[10px] font-medium uppercase tracking-wide"
          style={{ color: "var(--glass-text-dim)" }}
        >
          Volume horaire
        </span>
        <span
          className="text-[11px] font-semibold tabular-nums"
          style={{ color: "var(--glass-text)" }}
        >
          {(config.label as string) ?? fmtCompact(total)}
        </span>
      </div>
      <svg
        viewBox="0 0 100 32"
        preserveAspectRatio="none"
        className="h-12 w-full"
        role="img"
        aria-label="Volume horaire des transactions"
      >
        <title>Volume horaire des transactions</title>
        {area && <path d={area} fill="hsl(var(--glass-accent) / 0.18)" stroke="none" />}
        {line && (
          <path
            d={line}
            fill="none"
            stroke="hsl(var(--glass-accent))"
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
    </div>
  );
}
