"use client";

import { motion } from "motion/react";
import { useMemo } from "react";
import { useMotionPrefs } from "@/design-system/use-motion-prefs";
import { EChart } from "@/features/telecom/components/echart";
import { chartTheme } from "@/features/telecom/lib/chart-options";
import type * as Types from "@/features/telecom/types";
import type { EChartsOption } from "@/platform/viz";

/**
 * HomeHero — the day's result, stated plainly and big, next to a real
 * success-rate-by-hour trend so the headline number has context instead of
 * standing alone. No serif, no dateline theatrics — Poppins/mono throughout,
 * contrast and scale do the work.
 */
export function HomeHero({
  eyebrow,
  primaryStat,
  secondaryStat,
  hourly,
  tertiary,
  actions,
}: {
  eyebrow: React.ReactNode;
  primaryStat: { value: React.ReactNode; label: string };
  secondaryStat?: { value: React.ReactNode; label: string };
  hourly?: Types.HourlyRow[];
  tertiary?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const { reduced } = useMotionPrefs();

  return (
    <motion.header
      initial={reduced ? false : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{eyebrow}</p>
        {actions ? (
          <div className="flex flex-none flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>

      <div className="grid gap-6 rounded-2xl border border-border bg-card p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
            <Stat value={primaryStat.value} label={primaryStat.label} size="lg" />
            {secondaryStat ? (
              <Stat value={secondaryStat.value} label={secondaryStat.label} />
            ) : null}
          </div>
          {tertiary ? (
            <p className="mt-auto border-t border-border pt-3 text-sm text-muted-foreground">
              {tertiary}
            </p>
          ) : null}
        </div>

        {hourly && hourly.length > 0 ? <HourlyTrend hourly={hourly} /> : null}
      </div>
    </motion.header>
  );
}

function Stat({
  value,
  label,
  size = "md",
}: {
  value: React.ReactNode;
  label: string;
  size?: "md" | "lg";
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className={
          size === "lg"
            ? "font-mono text-6xl font-black leading-none tracking-tight text-foreground sm:text-7xl"
            : "font-mono text-4xl font-bold leading-none tracking-tight text-foreground sm:text-5xl"
        }
      >
        {value}
      </span>
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
    </div>
  );
}

function HourlyTrend({ hourly }: { hourly: Types.HourlyRow[] }) {
  const option = useMemo<EChartsOption>(() => {
    const theme = chartTheme();
    const sorted = [...hourly].sort((a, b) => a.hour - b.hour);
    const rates = sorted.map((h) => (h.total > 0 ? (h.success / h.total) * 100 : 0));
    let peak = 0;
    rates.forEach((rate, i) => {
      if (rate > rates[peak]) peak = i;
    });
    const peakHour = sorted[peak] ? String(sorted[peak].hour).padStart(2, "0") : "";

    return {
      grid: { left: 0, right: 8, top: 30, bottom: 20, containLabel: true },
      tooltip: {
        trigger: "axis",
        backgroundColor: theme.tooltipBg,
        borderColor: theme.tooltipBorder,
        textStyle: { color: theme.tooltipText },
        formatter: (params: unknown) => {
          const arr = params as Array<{ axisValue: string; value: number }>;
          const p = arr[0];
          if (!p) return "";
          return `${p.axisValue} · ${Number(p.value).toFixed(1)}% de réussite`;
        },
      },
      xAxis: {
        type: "category",
        data: sorted.map((h) => `${String(h.hour).padStart(2, "0")}h`),
        boundaryGap: false,
        axisLine: { lineStyle: { color: theme.splitLine } },
        axisTick: { show: false },
        axisLabel: { color: theme.axisDim, fontSize: 10, interval: 3 },
      },
      yAxis: { type: "value", show: false },
      series: [
        {
          type: "line",
          data: rates,
          smooth: true,
          symbol: "none",
          lineStyle: { color: theme.primary, width: 2 },
          areaStyle: { color: theme.primary, opacity: 0.12 },
          markPoint: {
            symbol: "circle",
            symbolSize: 6,
            itemStyle: { color: theme.primary },
            label: {
              formatter: () => `Pic ${peakHour}h · ${rates[peak].toFixed(1)}%`,
              position: "top",
              color: theme.axisFg,
              fontSize: 11,
              fontWeight: 600,
            },
            data: [{ name: "peak", coord: [peak, rates[peak]] }],
          },
        },
      ],
    };
  }, [hourly]);

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Taux de réussite par heure
      </span>
      <EChart option={option} height={180} />
    </div>
  );
}
