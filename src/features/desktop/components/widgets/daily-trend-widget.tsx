"use client";

import { useMemo } from "react";
import type { WidgetTelecomData } from "@/features/desktop/components/widgets/use-widget-telecom-data";
import { fmtCompact } from "@/features/telecom/lib/format";

/**
 * Daily-trend widget — the desktop-tile counterpart of the Overview "Daily
 * Trend" chart: an inline SVG area-spark of per-day transaction volume across
 * the whole dataset. Pure SVG, no chart library, offline-safe. The desktop date
 * filter does not apply here (a single day has no trend).
 */
interface DailyTrendWidgetProps {
  data: WidgetTelecomData;
  config: Record<string, unknown>;
}

export function DailyTrendWidget({ data }: DailyTrendWidgetProps) {
  const series = useMemo(() => data.daily.map((d) => d.total), [data.daily]);
  const total = useMemo(() => series.reduce((a, b) => a + b, 0), [series]);
  const peak = useMemo(() => Math.max(1, ...series), [series]);

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
          Tendance · {data.daily.length} j
        </span>
        <span
          className="text-[11px] font-semibold tabular-nums"
          style={{ color: "var(--glass-text)" }}
        >
          {fmtCompact(total)}
        </span>
      </div>
      {line === "" ? (
        <span className="text-[11px]" style={{ color: "var(--glass-text-dim)" }}>
          Pas assez de jours
        </span>
      ) : (
        <svg
          viewBox="0 0 100 32"
          preserveAspectRatio="none"
          className="h-12 w-full"
          role="img"
          aria-label="Tendance journalière des transactions"
        >
          <title>Tendance journalière des transactions</title>
          <path d={area} fill="hsl(var(--glass-accent) / 0.18)" stroke="none" />
          <path
            d={line}
            fill="none"
            stroke="hsl(var(--glass-accent))"
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
    </div>
  );
}
