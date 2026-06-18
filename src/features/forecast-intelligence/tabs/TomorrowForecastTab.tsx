"use client";

/**
 * Tab 1 — Tomorrow's Forecast.
 *
 * Wired to REAL daily data from DuckDB (`useForecastData`). The headline KPI
 * cards use `linearForecast` (fast linear regression with R²/slope) over the
 * actual per-day series; the 7-day volume chart is drawn with the seasonal Holt
 * engine (`forecastSeries`) and rendered by the uPlot `ForecastChart` hot-path
 * renderer (history + forecast + CI band + anomalies). The per-channel table
 * comes from real canal summaries — no synthetic generators, no Math.random.
 */

import { useMemo } from "react";
import { sampleStandardDeviation } from "simple-statistics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtCompact, fmtN, fmtPct } from "@/features/telecom/lib/format";
import { linearForecast } from "@/platform/ai/insights";
import { ForecastChart } from "../components/ForecastChart";
import { forecastSeries } from "../core/forecast-engine";
import { useForecastData } from "../data/use-forecast-data";
import {
  AnimatedNumber,
  avgTicketFromDaily,
  baselineFromDaily,
  channelAvgAmount,
  cn,
  LoadingState,
  NoDatasetState,
  NotEnoughDataState,
} from "./shared";

export default function TomorrowForecastTab() {
  const data = useForecastData();

  const view = useMemo(() => {
    if (data.daily.length < 2) return null;

    const volumes = data.daily.map((d) => d.total);
    const successRates = data.daily.map((d) => (d.total > 0 ? d.success / d.total : 0));
    const revenues = data.daily.map((d) => d.amount);

    const volumeForecast = linearForecast(volumes, 7);
    const successForecast = linearForecast(successRates, 7);
    const revenueForecast = linearForecast(revenues, 7);

    const stdVolume = sampleStandardDeviation(volumes);
    const avgTicket = avgTicketFromDaily(data.daily);
    const baseline = baselineFromDaily(data.daily);

    // Seasonal Holt engine over the real volume series for the chart (history +
    // forecast + CI band + anomalies), upgrading the crude ±1.5σ linear band.
    const volumeSeries = data.daily.map((d) => ({ date: d.day, value: d.total }));
    const forecastResult = forecastSeries(volumeSeries, {
      horizon: 7,
      seasonLength: 7,
    });

    return {
      volumeForecast,
      successForecast,
      revenueForecast,
      stdVolume,
      avgTicket,
      baseline,
      forecastResult,
    };
  }, [data.daily]);

  if (data.noDataset) return <NoDatasetState what="tomorrow's forecast" />;
  if (data.isLoading) return <LoadingState />;
  if (!view) return <NotEnoughDataState what="The forecast" />;

  const { volumeForecast, successForecast, revenueForecast, stdVolume, avgTicket, baseline } = view;
  const tomorrowVolume = volumeForecast.predicted[0]?.y ?? 0;
  const tomorrowSuccess = successForecast.predicted[0]?.y ?? 0;
  const tomorrowRevenue = revenueForecast.predicted[0]?.y ?? 0;
  const confidenceLower = tomorrowVolume - 1.5 * stdVolume;
  const confidenceUpper = tomorrowVolume + 1.5 * stdVolume;

  const riskScore =
    volumeForecast.trend === "down" || tomorrowSuccess < 0.88
      ? "High"
      : tomorrowSuccess < 0.91
        ? "Medium"
        : "Low";
  const riskColorClass =
    riskScore === "High"
      ? "text-red-400"
      : riskScore === "Medium"
        ? "text-amber-400"
        : "text-emerald-400";

  // Per-channel next-day projection from REAL canal summaries. We grow each
  // channel by the dataset-wide volume trend (deterministic, data-driven)
  // rather than a random factor.
  const trendRatio = baseline.volume > 0 ? tomorrowVolume / baseline.volume : 1;
  const channelForecasts = data.channels.map((ch) => ({
    name: ch.label,
    volume: Math.round(ch.total * trendRatio),
    successRate: ch.successRate / 100,
    avgAmount: channelAvgAmount(ch),
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="bg-slate-900/60 ring-slate-700/40">
          <CardContent className="pt-5 pb-5">
            <p className="text-xs text-slate-400 mb-1">Predicted Volume</p>
            <AnimatedNumber
              value={tomorrowVolume}
              format={(v) => fmtN(v)}
              className="block text-2xl font-bold text-slate-50"
            />
            <p className="text-xs text-slate-500 mt-1">±{fmtN(1.5 * stdVolume, 0)} uncertainty</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Range: {fmtN(confidenceLower, 0)} – {fmtN(confidenceUpper, 0)}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/60 ring-slate-700/40">
          <CardContent className="pt-5 pb-5">
            <p className="text-xs text-slate-400 mb-1">Predicted Success Rate</p>
            <AnimatedNumber
              value={tomorrowSuccess * 100}
              format={(v) => `${v.toFixed(1)}%`}
              className="block text-2xl font-bold text-slate-50"
            />
            <p className="text-xs text-slate-500 mt-1">
              Trend:{" "}
              <span
                className={
                  successForecast.trend === "up"
                    ? "text-emerald-400"
                    : successForecast.trend === "down"
                      ? "text-red-400"
                      : "text-slate-400"
                }
              >
                {successForecast.trend === "up"
                  ? "Improving"
                  : successForecast.trend === "down"
                    ? "Declining"
                    : "Stable"}
              </span>
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/60 ring-slate-700/40">
          <CardContent className="pt-5 pb-5">
            <p className="text-xs text-slate-400 mb-1">Expected Revenue</p>
            <AnimatedNumber
              value={tomorrowRevenue}
              format={(v) => `${fmtCompact(v)} TND`}
              className="block text-2xl font-bold text-slate-50"
            />
            <p className="text-xs text-slate-500 mt-1">
              vs latest:{" "}
              <span
                className={
                  tomorrowRevenue >= baseline.revenue ? "text-emerald-400" : "text-red-400"
                }
              >
                {tomorrowRevenue >= baseline.revenue ? "+" : ""}
                {fmtPct(
                  baseline.revenue > 0
                    ? ((tomorrowRevenue - baseline.revenue) / baseline.revenue) * 100
                    : 0,
                )}
              </span>
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/60 ring-slate-700/40">
          <CardContent className="pt-5 pb-5">
            <p className="text-xs text-slate-400 mb-1">Risk Level</p>
            <span className={cn("block text-2xl font-bold", riskColorClass)}>{riskScore}</span>
            <p className="text-xs text-slate-500 mt-1">
              R² confidence: {(volumeForecast.r2 * 100).toFixed(0)}%
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Slope: {volumeForecast.slope > 0 ? "+" : ""}
              {volumeForecast.slope.toFixed(1)}/day
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-900/60 ring-slate-700/40">
        <CardHeader>
          <CardTitle className="text-slate-200">7-Day Volume Forecast</CardTitle>
          <CardDescription className="text-slate-500">
            History (solid) · Forecast (dashed) · 95% confidence band · seasonal Holt engine
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ForecastChart
            result={view.forecastResult}
            height={320}
            ariaLabel="7-day transaction volume forecast with confidence band"
          />
        </CardContent>
      </Card>

      {channelForecasts.length > 0 && (
        <Card className="bg-slate-900/60 ring-slate-700/40">
          <CardHeader>
            <CardTitle className="text-slate-200">Per-Channel Forecast</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left py-2 text-slate-400 font-medium">Channel</th>
                  <th className="text-right py-2 text-slate-400 font-medium">Predicted Volume</th>
                  <th className="text-right py-2 text-slate-400 font-medium">Success Rate</th>
                  <th className="text-right py-2 text-slate-400 font-medium">Expected Revenue</th>
                </tr>
              </thead>
              <tbody>
                {channelForecasts.map((ch) => (
                  <tr
                    key={ch.name}
                    className="border-b border-slate-800/60 hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="py-2.5 text-slate-200 font-medium">{ch.name}</td>
                    <td className="py-2.5 text-right text-slate-300">{fmtN(ch.volume)}</td>
                    <td className="py-2.5 text-right">
                      <span
                        className={cn(
                          "font-medium",
                          ch.successRate >= 0.93
                            ? "text-emerald-400"
                            : ch.successRate >= 0.88
                              ? "text-amber-400"
                              : "text-red-400",
                        )}
                      >
                        {(ch.successRate * 100).toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-2.5 text-right text-slate-300">
                      {fmtN(ch.volume * ch.successRate * (ch.avgAmount || avgTicket), 0)} TND
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
