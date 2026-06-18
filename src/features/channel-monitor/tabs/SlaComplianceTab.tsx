"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { type EChartsOption, OffscreenChart } from "@/platform/viz";
import { cn } from "@/shared/utils";
import { fmtPct } from "@/features/telecom/lib/format";
import { CHANNELS } from "../lib/channels";
import { formatDate } from "../lib/format-helpers";
import { simulateDailyCompliance } from "../lib/simulate";
import { useMonitorStore } from "../store/monitor-store";

const LINE_PALETTE = ["#06b6d4", "#a855f7", "#f59e0b", "#10b981", "#ef4444"];

export function SlaComplianceTab() {
  const slaTargets = useMonitorStore.use.slaTargets();
  const channelStatuses = useMonitorStore.use.channelStatuses();
  const setSlaTarget = useMonitorStore.use.setSlaTarget();

  const [showConfig, setShowConfig] = useState(false);
  const [globalTarget, setGlobalTarget] = useState(slaTargets.global ?? 95);
  const [perChannelEdits, setPerChannelEdits] = useState<Record<string, string>>({});

  // Compute every per-channel daily series ONCE; reuse for both the scorecard
  // (days-in-compliance) and the chart (avoid the old double-generate).
  const slaRows = useMemo(() => {
    return CHANNELS.map((ch) => {
      const target = slaTargets[ch.key] ?? slaTargets.global ?? 95;
      const st = channelStatuses[ch.key];
      const daily = simulateDailyCompliance(ch.key, target);
      const actual = st?.successRate ?? daily[daily.length - 1] ?? target;
      const met = actual >= target;
      const delta = actual - target;
      const daysInCompliance = daily.filter((d) => d >= target).length;
      const compliancePct = Math.round((daysInCompliance / daily.length) * 100);
      return { ch, target, actual, met, delta, daysInCompliance, compliancePct, daily };
    });
  }, [slaTargets, channelStatuses]);

  const meetingCount = slaRows.filter((r) => r.met).length;

  const dayLabels = useMemo(
    () =>
      Array.from({ length: 30 }, (_, i) =>
        formatDate(Date.now() - (29 - i) * 86_400_000),
      ),
    [],
  );

  const lineOption = useMemo<EChartsOption>(() => {
    const globalSla = slaTargets.global ?? 95;
    return {
      backgroundColor: "transparent",
      animation: false,
      tooltip: {
        trigger: "axis",
        backgroundColor: "#1e293b",
        borderColor: "#334155",
        textStyle: { color: "#e2e8f0" },
      },
      legend: {
        data: ["SLA Target", ...slaRows.slice(0, 5).map((r) => r.ch.label)],
        textStyle: { color: "#64748b", fontSize: 10 },
        bottom: 0,
        type: "scroll",
      },
      grid: { left: 45, right: 20, top: 20, bottom: 60 },
      xAxis: {
        type: "category",
        data: dayLabels,
        axisLabel: { color: "#64748b", fontSize: 10, interval: 4 },
        axisLine: { lineStyle: { color: "#334155" } },
      },
      yAxis: {
        type: "value",
        min: 70,
        max: 100,
        axisLabel: { color: "#64748b", fontSize: 10, formatter: "{value}%" },
        splitLine: { lineStyle: { color: "#1e293b" } },
      },
      series: [
        {
          name: "SLA Target",
          type: "line",
          data: Array(30).fill(globalSla),
          lineStyle: { color: "#6366f1", type: "dashed", width: 1.5 },
          itemStyle: { opacity: 0 },
          symbol: "none",
        },
        ...slaRows.slice(0, 5).map((r, i) => ({
          name: r.ch.label,
          type: "line" as const,
          data: r.daily,
          smooth: true,
          symbol: "none" as const,
          lineStyle: { width: 1.5, color: LINE_PALETTE[i % LINE_PALETTE.length] },
        })),
      ],
    };
  }, [slaRows, dayLabels, slaTargets.global]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-100">SLA Compliance</h2>
          <p className="text-sm text-slate-400">
            <span className="text-emerald-400 font-semibold">{meetingCount}</span> of{" "}
            {CHANNELS.length} channels meeting SLA targets
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowConfig(true)}>
          Configure SLA Targets
        </Button>
      </div>

      <Card className="bg-slate-900/80 border-slate-800">
        <CardHeader>
          <CardTitle className="text-slate-100 text-base">Monthly Compliance Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <OffscreenChart
            option={lineOption}
            height={280}
            fallback={
              <div className="flex h-[280px] items-center justify-center text-xs text-slate-500">
                Chart rendering unavailable in this environment.
              </div>
            }
          />
        </CardContent>
      </Card>

      <Card className="bg-slate-900/80 border-slate-800">
        <CardHeader>
          <CardTitle className="text-slate-100 text-base">Compliance Scorecard</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-slate-500 text-xs">
                  <th className="px-4 py-2 text-left font-medium">Channel</th>
                  <th className="px-4 py-2 text-right font-medium">SLA Target</th>
                  <th className="px-4 py-2 text-right font-medium">Actual</th>
                  <th className="px-4 py-2 text-center font-medium">SLA Met</th>
                  <th className="px-4 py-2 text-right font-medium">Delta</th>
                  <th className="px-4 py-2 text-right font-medium">Days OK / 30</th>
                  <th className="px-4 py-2 text-right font-medium">Compliance%</th>
                </tr>
              </thead>
              <tbody>
                {slaRows.map(
                  ({ ch, target, actual, met, delta, daysInCompliance, compliancePct }) => (
                    <tr
                      key={ch.key}
                      className="border-b border-slate-800/60 hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="px-4 py-2.5 text-slate-200 font-medium">{ch.label}</td>
                      <td className="px-4 py-2.5 text-right text-slate-400">{target}%</td>
                      <td
                        className={cn(
                          "px-4 py-2.5 text-right font-semibold",
                          actual >= 95
                            ? "text-emerald-400"
                            : actual >= 85
                              ? "text-amber-400"
                              : "text-red-400",
                        )}
                      >
                        {fmtPct(actual)}
                      </td>
                      <td className="px-4 py-2.5 text-center text-lg">
                        {met ? (
                          <span className="text-emerald-400">✓</span>
                        ) : (
                          <span className="text-red-400">✗</span>
                        )}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-2.5 text-right text-xs font-semibold",
                          delta >= 0 ? "text-emerald-400" : "text-red-400",
                        )}
                      >
                        {delta >= 0 ? "+" : ""}
                        {delta.toFixed(1)}pp
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-400 text-xs">
                        {daysInCompliance} / 30
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Progress
                            value={compliancePct}
                            className={cn(
                              "w-16 h-1.5",
                              compliancePct >= 90
                                ? "[&>[data-slot=progress-indicator]]:bg-emerald-500"
                                : compliancePct >= 70
                                  ? "[&>[data-slot=progress-indicator]]:bg-amber-500"
                                  : "[&>[data-slot=progress-indicator]]:bg-red-500",
                            )}
                          />
                          <span
                            className={cn(
                              "text-xs font-bold w-10 text-right",
                              compliancePct >= 90
                                ? "text-emerald-400"
                                : compliancePct >= 70
                                  ? "text-amber-400"
                                  : "text-red-400",
                            )}
                          >
                            {compliancePct}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {showConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <Card className="w-full max-w-lg bg-slate-900 border-slate-700 shadow-2xl max-h-[85vh] overflow-y-auto">
            <CardHeader>
              <CardTitle className="text-slate-100">Configure SLA Targets</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Global Default Target (%)
                </label>
                <input
                  type="number"
                  min={50}
                  max={100}
                  className="w-full rounded-md bg-slate-800 border border-slate-700 text-slate-200 text-sm px-3 py-2 focus:outline-none"
                  value={globalTarget}
                  onChange={(e) => setGlobalTarget(Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <div className="text-xs text-slate-400 font-medium">Per-Channel Overrides</div>
                {CHANNELS.map((ch) => (
                  <div key={ch.key} className="flex items-center gap-3">
                    <span className="text-slate-300 text-sm flex-1">{ch.label}</span>
                    <input
                      type="number"
                      min={50}
                      max={100}
                      className="w-20 rounded-md bg-slate-800 border border-slate-700 text-slate-200 text-sm px-2 py-1.5 focus:outline-none text-right"
                      placeholder={String(globalTarget)}
                      value={
                        perChannelEdits[ch.key] ??
                        (slaTargets[ch.key] !== undefined ? String(slaTargets[ch.key]) : "")
                      }
                      onChange={(e) =>
                        setPerChannelEdits((prev) => ({ ...prev, [ch.key]: e.target.value }))
                      }
                    />
                    <span className="text-slate-500 text-sm">%</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="ghost" size="sm" onClick={() => setShowConfig(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setSlaTarget("global", globalTarget);
                    for (const ch of CHANNELS) {
                      const val = perChannelEdits[ch.key];
                      if (val !== undefined && val !== "") setSlaTarget(ch.key, Number(val));
                    }
                    setShowConfig(false);
                  }}
                >
                  Save
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
