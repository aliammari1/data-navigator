"use client";

/**
 * Tab 5 — Channel Risk Assessment.
 *
 * Risk is computed entirely from REAL canal summaries and the real daily series:
 *  - failure rate  = declined / total   (per channel, from DuckDB)
 *  - refund rate   = refund / total     (per channel, from DuckDB)
 *  - volatility    = coefficient of variation of the dataset's daily volume
 *                    (shared proxy; the canal query is not per-day)
 * No Math.random — every score is reproducible for the same dataset.
 */

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";
import { mean as ssMean, sampleStandardDeviation } from "simple-statistics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtCompact, fmtN } from "@/features/telecom/lib/format";
import { useForecastData } from "../data/use-forecast-data";
import { cn, LoadingState, NoDatasetState, NotEnoughDataState, riskColor } from "./shared";

interface ChannelRisk {
  name: string;
  volume: number;
  failureRate: number;
  refundRate: number;
  volatility: number;
  riskScore: number;
}

export default function RiskAssessmentTab() {
  const data = useForecastData();

  const channelRisks = useMemo<ChannelRisk[]>(() => {
    if (data.channels.length === 0) return [];

    // Dataset-wide daily volume volatility (coefficient of variation), a real
    // proxy shared across channels since the canal aggregate is not per-day.
    const volumes = data.daily.map((d) => d.total);
    let cv = 0;
    if (volumes.length >= 2) {
      const m = ssMean(volumes);
      cv = m > 0 ? sampleStandardDeviation(volumes) / m : 0;
    }

    return data.channels.map((ch) => {
      const failureRate = ch.total > 0 ? ch.declined / ch.total : 0;
      const refundRate = ch.total > 0 ? ch.refund / ch.total : 0;
      // Weighted blend → 0–100. Failure dominates, refunds and volatility add.
      const raw = failureRate * 55 + cv * 25 + refundRate * 20 * 5;
      const riskScore = Math.min(100, Math.max(0, raw * 100));
      return {
        name: ch.label,
        volume: ch.total,
        failureRate,
        refundRate,
        volatility: cv,
        riskScore,
      };
    });
  }, [data.channels, data.daily]);

  const highRiskChannels = channelRisks.filter((c) => c.riskScore > 70);

  const scatterOption = useMemo(() => {
    if (channelRisks.length === 0) return null;
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item",
        backgroundColor: "#1e293b",
        borderColor: "#334155",
        textStyle: { color: "#e2e8f0" },
        formatter: (p: { data: { name: string; value: [number, number] } }) =>
          `${p.data.name}<br/>Volume: ${fmtN(p.data.value[0])}<br/>Risk: ${p.data.value[1].toFixed(0)}`,
      },
      grid: { top: 24, bottom: 48, left: 56, right: 40, containLabel: false },
      xAxis: {
        type: "value",
        name: "Volume",
        nameLocation: "middle",
        nameGap: 32,
        nameTextStyle: { color: "#64748b" },
        axisLabel: { color: "#64748b", formatter: (v: number) => fmtCompact(v) },
        splitLine: { lineStyle: { color: "#1e293b" } },
        axisLine: { lineStyle: { color: "#334155" } },
      },
      yAxis: {
        type: "value",
        name: "Risk Score",
        nameLocation: "middle",
        nameGap: 48,
        nameTextStyle: { color: "#64748b" },
        max: 100,
        axisLabel: { color: "#64748b" },
        splitLine: { lineStyle: { color: "#1e293b" } },
        axisLine: { lineStyle: { color: "#334155" } },
      },
      series: [
        {
          type: "scatter",
          symbolSize: 16,
          data: channelRisks.map((ch) => ({
            name: ch.name,
            value: [ch.volume, ch.riskScore],
            label: {
              show: true,
              formatter: ch.name,
              position: "top",
              color: "#94a3b8",
              fontSize: 11,
            },
            itemStyle: { color: riskColor(ch.riskScore).bar, opacity: 0.85 },
          })),
        },
      ],
    };
  }, [channelRisks]);

  if (data.noDataset) return <NoDatasetState what="risk assessment" />;
  if (data.isLoading) return <LoadingState />;
  if (channelRisks.length === 0) return <NotEnoughDataState what="Risk assessment" />;

  return (
    <div className="space-y-6">
      {highRiskChannels.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/40 bg-red-500/8 px-4 py-3">
          <span className="text-red-400 text-lg mt-0.5">⚠</span>
          <div>
            <p className="text-sm font-semibold text-red-300">High Risk Alert</p>
            <p className="text-xs text-red-400/80 mt-0.5">
              {highRiskChannels.map((c) => c.name).join(", ")}{" "}
              {highRiskChannels.length === 1 ? "scores" : "score"} above 70 — immediate attention
              recommended.
            </p>
          </div>
        </div>
      )}

      <Card className="bg-slate-900/60 ring-slate-700/40">
        <CardHeader>
          <CardTitle className="text-slate-200">Risk Matrix: Volume vs Risk Score</CardTitle>
          <CardDescription className="text-slate-500">
            Green (&lt;30) · Yellow (30–60) · Red (&gt;60)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {scatterOption && <ReactECharts option={scatterOption} style={{ height: 320 }} />}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {channelRisks.map((ch) => {
          const color = riskColor(ch.riskScore);
          const gaugeOption = {
            backgroundColor: "transparent",
            series: [
              {
                type: "gauge",
                startAngle: 200,
                endAngle: -20,
                min: 0,
                max: 100,
                radius: "100%",
                center: ["50%", "65%"],
                axisLine: {
                  lineStyle: {
                    width: 8,
                    color: [
                      [0.3, "#10b981"],
                      [0.6, "#f59e0b"],
                      [1, "#ef4444"],
                    ],
                  },
                },
                pointer: {
                  itemStyle: { color: color.bar },
                  length: "55%",
                  width: 4,
                },
                axisTick: { show: false },
                splitLine: { show: false },
                axisLabel: { show: false },
                detail: {
                  valueAnimation: true,
                  formatter: "{value}",
                  color: color.bar,
                  fontSize: 18,
                  fontWeight: "bold",
                  offsetCenter: [0, "20%"],
                },
                data: [{ value: Math.round(ch.riskScore) }],
              },
            ],
          };

          return (
            <Card key={ch.name} className={cn("ring-1", color.bg, color.border)}>
              <CardHeader>
                <CardTitle className={cn("text-sm", color.text)}>{ch.name}</CardTitle>
                <CardDescription className="text-slate-500 text-xs">
                  Volume: {fmtN(ch.volume)} txns
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ReactECharts option={gaugeOption} style={{ height: 120 }} />
                <div className="mt-2 space-y-1 text-xs text-slate-400">
                  <div className="flex justify-between">
                    <span>Failure Rate</span>
                    <span className="text-slate-300">{(ch.failureRate * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Volatility</span>
                    <span className="text-slate-300">{(ch.volatility * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Refund Rate</span>
                    <span className="text-slate-300">{(ch.refundRate * 100).toFixed(1)}%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
