"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/shared/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { fmtCompact, fmtN, fmtPct } from "@/features/telecom/lib/format";
import { detectChannelAnomalies, type ChannelAnomaly } from "../lib/anomaly";
import { formatTime } from "../lib/format-helpers";
import { healthColor, healthTextColor, successRateColor, trendSymbol } from "../lib/ui-helpers";
import { SparklineCell } from "../components/SparklineCell";
import { useMonitorStore } from "../store/monitor-store";
import type { ChannelStatus } from "../store/monitor-store";

type HealthFilter = "all" | "healthy" | "issues";

/** Keep a bounded rolling window of success-rate samples per channel (sparklines + anomaly). */
const HISTORY_LEN = 30;

export function ChannelHealthTab({ lastRefresh }: { lastRefresh: string | null }) {
  // Atomic selectors — subscribe ONLY to the slices this tab reads, so a
  // notification push or rule edit elsewhere does not re-render this tree.
  const channelStatuses = useMonitorStore.use.channelStatuses();
  const addNotification = useMonitorStore.use.addNotification();

  const [filter, setFilter] = useState<HealthFilter>("all");
  const [incidentChannel, setIncidentChannel] = useState<string | null>(null);
  const [incidentNote, setIncidentNote] = useState("");
  const [anomalies, setAnomalies] = useState<ChannelAnomaly[]>([]);

  const statuses = useMemo(() => Object.values(channelStatuses), [channelStatuses]);

  // Rolling success-rate history keyed by channel (mutated, capped).
  const historyRef = useRef<Map<string, number[]>>(new Map());
  useEffect(() => {
    const hist = historyRef.current;
    for (const st of statuses) {
      const series = hist.get(st.channel) ?? [];
      series.push(st.successRate);
      if (series.length > HISTORY_LEN) series.shift();
      hist.set(st.channel, series);
    }
  }, [statuses]);

  // Recompute anomalies off the main thread whenever a fresh snapshot lands.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const hist = historyRef.current;
      const results: ChannelAnomaly[] = [];
      for (const st of statuses) {
        const series = hist.get(st.channel);
        if (!series || series.length < 6) continue;
        const found = await detectChannelAnomalies(st.channel, st.displayName, series);
        // Only surface the most recent anomaly per channel.
        const latest = found.filter((a) => a.index === series.length - 1);
        results.push(...latest);
      }
      if (!cancelled) setAnomalies(results);
    })();
    return () => {
      cancelled = true;
    };
  }, [statuses]);

  const healthy = statuses.filter((s) => s.health === "healthy").length;
  const degraded = statuses.filter((s) => s.health === "degraded").length;
  const critical = statuses.filter((s) => s.health === "critical").length;
  const overallHealth =
    statuses.length > 0
      ? Math.round(statuses.reduce((acc, s) => acc + s.successRate, 0) / statuses.length)
      : 0;

  const filtered = useMemo(() => {
    if (filter === "healthy") return statuses.filter((s) => s.health === "healthy");
    if (filter === "issues")
      return statuses.filter((s) => s.health !== "healthy" && s.health !== "unknown");
    return statuses;
  }, [statuses, filter]);

  const lastUpdated = lastRefresh ? formatTime(lastRefresh) : "—";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-100">Channel Operations Center</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Last updated: {lastUpdated} &mdash; auto-refreshes every 30s
          </p>
        </div>
        <div className="flex gap-2">
          {(["all", "healthy", "issues"] as HealthFilter[]).map((f) => (
            <button
              type="button"
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                filter === f
                  ? "bg-slate-700 text-slate-100"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800",
              )}
            >
              {f === "all" ? "All" : f === "healthy" ? "Healthy Only" : "Issues Only"}
            </button>
          ))}
        </div>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Healthy", value: healthy, dot: "bg-emerald-500", text: "text-emerald-400" },
          { label: "Degraded", value: degraded, dot: "bg-amber-500", text: "text-amber-400" },
          { label: "Critical", value: critical, dot: "bg-red-500", text: "text-red-400" },
        ].map((s) => (
          <Card key={s.label} size="sm" className="bg-slate-900/80 border-slate-800">
            <CardContent className="pt-3 pb-3">
              <div className="flex items-center gap-2">
                <span className={cn("size-3 rounded-full shrink-0", s.dot)} />
                <span className="text-slate-400 text-xs">{s.label}</span>
                <span className={cn("ml-auto text-2xl font-bold", s.text)}>{s.value}</span>
              </div>
            </CardContent>
          </Card>
        ))}
        <Card size="sm" className="bg-slate-900/80 border-slate-800">
          <CardContent className="pt-3 pb-3">
            <div className="text-xs text-slate-400 mb-1.5">Overall Health</div>
            <div className="flex items-center gap-2">
              <Progress
                value={overallHealth}
                className={cn(
                  "flex-1 h-2",
                  overallHealth >= 95
                    ? "[&>[data-slot=progress-indicator]]:bg-emerald-500"
                    : overallHealth >= 85
                      ? "[&>[data-slot=progress-indicator]]:bg-amber-500"
                      : "[&>[data-slot=progress-indicator]]:bg-red-500",
                )}
              />
              <span
                className={cn(
                  "text-sm font-bold shrink-0",
                  overallHealth >= 95
                    ? "text-emerald-400"
                    : overallHealth >= 85
                      ? "text-amber-400"
                      : "text-red-400",
                )}
              >
                {overallHealth}%
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Anomaly panel (seeded worker: GESD / MAD baselines) */}
      {anomalies.length > 0 && (
        <Card className="bg-amber-950/20 border-amber-500/30">
          <CardHeader>
            <CardTitle className="text-amber-300 text-base flex items-center gap-2">
              <span className="size-2 rounded-full bg-amber-400 animate-pulse" />
              Baseline Anomalies Detected ({anomalies.length})
            </CardTitle>
            <CardDescription>
              Statistical outliers vs. each channel&apos;s recent baseline (GESD / MAD, seeded).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {anomalies.map((a) => (
              <div
                key={`${a.channel}-${a.index}`}
                className="flex items-center justify-between text-xs"
              >
                <span className="text-slate-200 font-medium">{a.displayName}</span>
                <span className="text-slate-400">
                  {fmtPct(a.value)} vs baseline {fmtPct(a.baseline)} &middot; z={fmtN(a.score, 1)}{" "}
                  <span className="uppercase text-amber-400/80">{a.method}</span>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Channel grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((st) => (
          <ChannelCard
            key={st.channel}
            st={st}
            history={historyRef.current.get(st.channel) ?? []}
            onLogIncident={() => setIncidentChannel(st.channel)}
          />
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full text-center text-slate-500 py-12">
            No channels to display yet — waiting for the first refresh.
          </div>
        )}
      </div>

      {/* Incident dialog */}
      {incidentChannel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <Card className="w-full max-w-md bg-slate-900 border-slate-700 shadow-2xl">
            <CardHeader>
              <CardTitle className="text-slate-100">Log Incident</CardTitle>
              <CardDescription>
                Channel: <span className="font-mono text-slate-300">{incidentChannel}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <textarea
                className="w-full rounded-md bg-slate-800 border border-slate-700 text-slate-200 text-sm p-3 resize-none focus:outline-none focus:ring-2 focus:ring-slate-600"
                rows={4}
                placeholder="Describe the incident..."
                value={incidentNote}
                onChange={(e) => setIncidentNote(e.target.value)}
              />
              <div className="flex gap-2 justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIncidentChannel(null);
                    setIncidentNote("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    addNotification({
                      id: `incident-${Date.now()}`,
                      message: `Incident logged for ${incidentChannel}: ${incidentNote || "(no note)"}`,
                      severity: "warning",
                      timestamp: new Date().toISOString(),
                      read: false,
                    });
                    setIncidentChannel(null);
                    setIncidentNote("");
                  }}
                >
                  Submit
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function ChannelCard({
  st,
  history,
  onLogIncident,
}: {
  st: ChannelStatus;
  history: number[];
  onLogIncident: () => void;
}) {
  const trend = trendSymbol(st.trend);
  return (
    <Card
      size="sm"
      className={cn(
        "bg-slate-900/60 border transition-all",
        st.health === "critical"
          ? "border-red-500/40 shadow-red-900/20 shadow-md"
          : st.health === "degraded"
            ? "border-amber-500/30"
            : "border-slate-800",
      )}
    >
      <CardContent className="pt-4 pb-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-bold text-slate-100 text-base leading-tight">{st.displayName}</div>
            <div className="text-xs text-slate-500 font-mono mt-0.5">{st.channel}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={cn(
                "size-3 rounded-full shrink-0 ring-2",
                healthColor(st.health),
                st.health === "critical" && "animate-pulse ring-red-500/30",
                st.health === "degraded" && "ring-amber-500/30",
                st.health === "healthy" && "ring-emerald-500/30",
                st.health === "unknown" && "ring-slate-500/30",
              )}
            />
            <span
              className={cn(
                "text-xs font-semibold uppercase tracking-wide",
                healthTextColor(st.health),
              )}
            >
              {st.health}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1 text-center">
          <div className="bg-slate-800/60 rounded-md px-2 py-1.5">
            <div className="text-xs text-slate-500">txn/min</div>
            <div className="text-sm font-bold text-slate-200">{fmtN(st.txnPerMin)}</div>
          </div>
          <div className="bg-slate-800/60 rounded-md px-2 py-1.5">
            <div className="text-xs text-slate-500">success%</div>
            <div className={cn("text-sm font-bold", successRateColor(st.successRate))}>
              {fmtPct(st.successRate)}
            </div>
          </div>
          <div className="bg-slate-800/60 rounded-md px-2 py-1.5">
            <div className="text-xs text-slate-500">today</div>
            <div className="text-sm font-bold text-slate-200">{fmtCompact(st.amountToday)}</div>
          </div>
        </div>

        {/* Live success-rate sparkline (uPlot) */}
        <div className="flex items-center justify-between">
          <SparklineCell
            values={history}
            stroke={
              st.health === "critical"
                ? "#ef4444"
                : st.health === "degraded"
                  ? "#f59e0b"
                  : "#10b981"
            }
            width={140}
            height={28}
          />
          <div className="flex items-center gap-1 text-xs text-slate-400">
            <span className={trend.className}>{trend.glyph}</span>
            <span>vs last</span>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500 truncate max-w-[200px]">
            {st.lastIncident ?? "No incidents"}
          </span>
        </div>

        {(st.health === "degraded" || st.health === "critical") && (
          <Button size="xs" variant="destructive" className="w-full" onClick={onLogIncident}>
            Log Incident
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
