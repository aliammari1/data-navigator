"use client";

import { useMemo } from "react";
import type { WidgetTelecomData } from "@/features/desktop/components/widgets/use-widget-telecom-data";
import { fmtCompact } from "@/features/telecom/lib/format";

interface HourlyBarWidgetProps {
  data: WidgetTelecomData;
  config: Record<string, unknown>;
}

export function HourlyBarWidget({ data }: HourlyBarWidgetProps) {
  const bars = useMemo(() => {
    const byHour = new Array<number>(24).fill(0);
    for (const row of data.hourly) {
      if (row.hour >= 0 && row.hour < 24) byHour[row.hour] = row.total;
    }
    return byHour;
  }, [data.hourly]);

  const peak = useMemo(() => Math.max(1, ...bars), [bars]);
  const peakHour = useMemo(() => bars.indexOf(peak), [bars, peak]);

  const rects = useMemo(() => {
    const w = 100;
    const h = 28;
    const barW = w / 24;
    const gap = 0.5;
    return bars.map((v, i) => {
      const bh = (v / peak) * (h - 2) + 2;
      return {
        x: i * barW + gap,
        y: h - bh,
        w: barW - gap * 2,
        h: bh,
        isPeak: i === peakHour,
      };
    });
  }, [bars, peak, peakHour]);

  return (
    <div className="flex h-full flex-col justify-between gap-1.5 p-1">
      <div className="flex items-baseline justify-between gap-2">
        <span
          className="text-[10px] font-medium uppercase tracking-wide"
          style={{ color: "var(--glass-text-dim)" }}
        >
          Par heure
        </span>
        <span className="text-[10px] tabular-nums" style={{ color: "var(--glass-text-dim)" }}>
          Pic {String(peakHour).padStart(2, "0")}h — {fmtCompact(peak)}
        </span>
      </div>
      <svg
        viewBox="0 0 100 30"
        preserveAspectRatio="none"
        className="h-12 w-full"
        role="img"
        aria-label="Transactions par heure"
      >
        <title>Transactions par heure</title>
        {rects.map((r, i) => (
          <rect
            key={i}
            x={r.x}
            y={r.y}
            width={r.w}
            height={r.h}
            rx={0.5}
            fill={r.isPeak ? "hsl(var(--glass-accent))" : "hsl(var(--glass-accent) / 0.35)"}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
    </div>
  );
}
