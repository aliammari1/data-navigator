"use client";

/**
 * Tab 6 — Scenario Planning.
 *
 * Preset and custom scenarios are applied on top of the REAL latest-day
 * baseline (volume, success rate, avg ticket) from DuckDB. Fully deterministic.
 */

import ReactECharts from "echarts-for-react";
import { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { fmtCompact, fmtN } from "@/features/telecom/lib/format";
import { useForecastData } from "../data/use-forecast-data";
import {
  AnimatedNumber,
  baselineFromDaily,
  cn,
  LoadingState,
  NoDatasetState,
  NotEnoughDataState,
} from "./shared";

const PRESET_SCENARIOS = [
  {
    id: "optimistic",
    name: "Optimistic",
    icon: "🚀",
    desc: "All metrics +10%",
    volumeAdj: 10,
    successAdj: 10,
    amountAdj: 10,
    color: "border-emerald-500/40 bg-emerald-500/6",
    textColor: "text-emerald-400",
  },
  {
    id: "base",
    name: "Base Case",
    icon: "📊",
    desc: "Current trends continue",
    volumeAdj: 2,
    successAdj: 0,
    amountAdj: 1,
    color: "border-blue-500/40 bg-blue-500/6",
    textColor: "text-blue-400",
  },
  {
    id: "pessimistic",
    name: "Pessimistic",
    icon: "📉",
    desc: "Success -5%, Volume -15%",
    volumeAdj: -15,
    successAdj: -5,
    amountAdj: -2,
    color: "border-red-500/40 bg-red-500/6",
    textColor: "text-red-400",
  },
] as const;

const MONTHLY_DAYS = 30;

export default function ScenariosTab() {
  const data = useForecastData();
  const [customName, setCustomName] = useState("My Scenario");
  const [customVolume, setCustomVolume] = useState(0);
  const [customSuccess, setCustomSuccess] = useState(0);
  const [customAmount, setCustomAmount] = useState(0);

  const baseline = useMemo(
    () => baselineFromDaily(data.daily),
    [data.daily],
  );
  const baseDailyRevenue = baseline.revenue;

  const computeRevenue = useMemo(() => {
    return (volumeAdj: number, successAdj: number, amountAdj: number) => {
      const adjVolume = baseline.volume * (1 + volumeAdj / 100);
      const adjSuccess = Math.min(
        1,
        Math.max(0, baseline.successRate + successAdj / 100),
      );
      const adjAmount = baseline.avgAmount * (1 + amountAdj / 100);
      return adjVolume * adjSuccess * adjAmount;
    };
  }, [baseline]);

  const presetResults = useMemo(
    () =>
      PRESET_SCENARIOS.map((s) => {
        const revenue = computeRevenue(s.volumeAdj, s.successAdj, s.amountAdj);
        return { ...s, revenue, delta: revenue - baseDailyRevenue };
      }),
    [computeRevenue, baseDailyRevenue],
  );

  const customRevenue = useMemo(
    () => computeRevenue(customVolume, customSuccess, customAmount),
    [computeRevenue, customVolume, customSuccess, customAmount],
  );
  const customDelta = customRevenue - baseDailyRevenue;

  const allScenarios = useMemo(
    () => [
      ...presetResults,
      {
        id: "custom",
        name: customName || "Custom",
        icon: "🔧",
        desc: "Your custom scenario",
        volumeAdj: customVolume,
        successAdj: customSuccess,
        amountAdj: customAmount,
        color: "border-violet-500/40 bg-violet-500/6",
        textColor: "text-violet-400",
        revenue: customRevenue,
        delta: customDelta,
      },
    ],
    [
      presetResults,
      customName,
      customVolume,
      customSuccess,
      customAmount,
      customRevenue,
      customDelta,
    ],
  );

  const barOption = useMemo(() => {
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: "#1e293b",
        borderColor: "#334155",
        textStyle: { color: "#e2e8f0" },
        formatter: (p: Array<{ name: string; value: number }>) =>
          `${p[0]?.name}: ${fmtN(p[0]?.value ?? 0)} TND`,
      },
      grid: { top: 16, bottom: 32, left: 72, right: 16, containLabel: false },
      xAxis: {
        type: "category",
        data: allScenarios.map((s) => s.name),
        axisLabel: { color: "#64748b" },
        axisLine: { lineStyle: { color: "#334155" } },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: "#64748b", formatter: (v: number) => fmtCompact(v) },
        splitLine: { lineStyle: { color: "#1e293b" } },
      },
      markLine: {
        silent: true,
        symbol: "none",
        data: [
          {
            yAxis: baseDailyRevenue,
            lineStyle: { color: "#94a3b844", type: "dashed" },
            label: { color: "#64748b", formatter: "Latest" },
          },
        ],
      },
      series: [
        {
          type: "bar",
          data: allScenarios.map((s) => ({
            value: Math.round(s.revenue),
            itemStyle: {
              color:
                s.id === "optimistic"
                  ? "#10b981"
                  : s.id === "base"
                    ? "#3b82f6"
                    : s.id === "pessimistic"
                      ? "#ef4444"
                      : "#8b5cf6",
              borderRadius: [4, 4, 0, 0],
            },
          })),
          barMaxWidth: 60,
        },
      ],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allScenarios, baseDailyRevenue]);

  if (data.noDataset) return <NoDatasetState what="scenario planning" />;
  if (data.isLoading) return <LoadingState />;
  if (data.daily.length < 1)
    return <NotEnoughDataState what="Scenario planning" />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {presetResults.map((s) => (
          <Card key={s.id} className={cn("ring-1", s.color)}>
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">{s.icon}</span>
                <div>
                  <p className={cn("text-sm font-semibold", s.textColor)}>
                    {s.name}
                  </p>
                  <p className="text-xs text-slate-500">{s.desc}</p>
                </div>
              </div>
              <AnimatedNumber
                value={s.revenue}
                format={(v) => `${fmtN(v, 0)} TND`}
                className="block text-xl font-bold text-slate-100"
              />
              <p
                className={cn(
                  "text-xs font-medium mt-1",
                  s.delta >= 0 ? "text-emerald-400" : "text-red-400",
                )}
              >
                {s.delta >= 0 ? "+" : ""}
                {fmtN(s.delta, 0)} TND/day
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Monthly: {fmtN(s.revenue * MONTHLY_DAYS, 0)} TND
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="bg-slate-900/60 ring-slate-700/40">
          <CardHeader>
            <CardTitle className="text-slate-200">
              Custom Scenario Builder
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Scenario name"
              className="w-full rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm px-3 py-2 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />

            {(
              [
                {
                  label: "Volume Adjustment",
                  value: customVolume,
                  setter: setCustomVolume,
                  min: -50,
                  max: 100,
                  unit: "%",
                },
                {
                  label: "Success Rate Adj.",
                  value: customSuccess,
                  setter: setCustomSuccess,
                  min: -20,
                  max: 20,
                  unit: "pp",
                },
                {
                  label: "Avg Amount Adj.",
                  value: customAmount,
                  setter: setCustomAmount,
                  min: -30,
                  max: 30,
                  unit: "%",
                },
              ] as const
            ).map((sl) => (
              <div key={sl.label}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-300">{sl.label}</span>
                  <span
                    className={cn(
                      "text-sm font-semibold tabular-nums",
                      sl.value > 0
                        ? "text-emerald-400"
                        : sl.value < 0
                          ? "text-red-400"
                          : "text-slate-400",
                    )}
                  >
                    {sl.value > 0 ? "+" : ""}
                    {sl.value}
                    {sl.unit}
                  </span>
                </div>
                <Slider
                  min={sl.min}
                  max={sl.max}
                  step={1}
                  value={[sl.value]}
                  onValueChange={([v]) => sl.setter(v ?? 0)}
                />
              </div>
            ))}

            <div className="rounded-lg bg-slate-800/60 border border-violet-500/20 p-4">
              <p className="text-xs text-slate-400 mb-1">Projected Revenue</p>
              <AnimatedNumber
                value={customRevenue}
                format={(v) => `${fmtN(v, 0)} TND`}
                className="text-xl font-bold text-violet-300"
              />
              <p
                className={cn(
                  "text-xs font-medium mt-1",
                  customDelta >= 0 ? "text-emerald-400" : "text-red-400",
                )}
              >
                {customDelta >= 0 ? "+" : ""}
                {fmtN(customDelta, 0)} TND vs latest
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/60 ring-slate-700/40">
          <CardHeader>
            <CardTitle className="text-slate-200">Scenario Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <ReactECharts option={barOption} style={{ height: 280 }} />
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-900/60 ring-slate-700/40">
        <CardHeader>
          <CardTitle className="text-slate-200">
            All Scenarios Side-by-Side
          </CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left py-2 text-slate-400 font-medium">
                  Scenario
                </th>
                <th className="text-right py-2 text-slate-400 font-medium">
                  Vol Adj
                </th>
                <th className="text-right py-2 text-slate-400 font-medium">
                  SR Adj
                </th>
                <th className="text-right py-2 text-slate-400 font-medium">
                  Daily Revenue
                </th>
                <th className="text-right py-2 text-slate-400 font-medium">
                  Delta/Day
                </th>
                <th className="text-right py-2 text-slate-400 font-medium">
                  Monthly
                </th>
              </tr>
            </thead>
            <tbody>
              {allScenarios.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-slate-800/60 hover:bg-slate-800/30 transition-colors"
                >
                  <td className="py-2.5">
                    <span className="mr-1.5">{s.icon}</span>
                    <span className={cn("font-medium", s.textColor)}>
                      {s.name}
                    </span>
                  </td>
                  <td className="py-2.5 text-right text-slate-400 tabular-nums">
                    {s.volumeAdj > 0 ? "+" : ""}
                    {s.volumeAdj}%
                  </td>
                  <td className="py-2.5 text-right text-slate-400 tabular-nums">
                    {s.successAdj > 0 ? "+" : ""}
                    {s.successAdj}pp
                  </td>
                  <td className="py-2.5 text-right text-slate-300 tabular-nums font-medium">
                    {fmtN(s.revenue, 0)} TND
                  </td>
                  <td
                    className={cn(
                      "py-2.5 text-right tabular-nums font-medium",
                      s.delta >= 0 ? "text-emerald-400" : "text-red-400",
                    )}
                  >
                    {s.delta >= 0 ? "+" : ""}
                    {fmtN(s.delta, 0)}
                  </td>
                  <td className="py-2.5 text-right text-slate-400 tabular-nums">
                    {fmtN(s.revenue * MONTHLY_DAYS, 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
