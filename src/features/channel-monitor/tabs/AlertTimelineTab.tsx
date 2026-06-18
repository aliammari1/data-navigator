"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  type EChartsOption,
  OffscreenChart,
  warmExportWorker,
} from "@/platform/viz";
import { cn } from "@/shared/utils";
import { CHANNELS, channelLabel } from "../lib/channels";
import { exportAlertHistory } from "../lib/export-report";
import { severityWeight } from "../lib/ui-helpers";
import { VirtualEventLog } from "../components/VirtualEventLog";
import { useMonitorStore } from "../store/monitor-store";
import type { AlertEvent, AlertSeverity } from "../store/monitor-store";

type SeverityFilter = "all" | AlertSeverity;

const SEVERITY_COLOR: Record<AlertSeverity, string> = {
  info: "#3b82f6",
  warning: "#f59e0b",
  critical: "#ef4444",
};

export function AlertTimelineTab() {
  // Atomic selectors.
  const alertEvents = useMonitorStore.use.alertEvents();
  const acknowledgeEvent = useMonitorStore.use.acknowledgeEvent();

  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const filtered = useMemo(
    () =>
      alertEvents.filter((e) => {
        if (severityFilter !== "all" && e.severity !== severityFilter) return false;
        if (channelFilter !== "all" && e.channel !== channelFilter) return false;
        return true;
      }),
    [alertEvents, severityFilter, channelFilter],
  );

  // Stats (single pass each).
  const stats = useMemo(() => {
    const month = new Date().getMonth();
    let thisMonth = 0;
    let criticalCount = 0;
    let warningCount = 0;
    const channelCounts = new Map<string, number>();
    for (const e of alertEvents) {
      if (new Date(e.triggeredAt).getMonth() === month) thisMonth++;
      if (e.severity === "critical") criticalCount++;
      else if (e.severity === "warning") warningCount++;
      channelCounts.set(e.channel, (channelCounts.get(e.channel) ?? 0) + 1);
    }
    let mostAffected: string | null = null;
    let max = 0;
    for (const [ch, n] of channelCounts) {
      if (n > max) {
        max = n;
        mostAffected = ch;
      }
    }
    return { thisMonth, criticalCount, warningCount, mostAffected };
  }, [alertEvents]);

  // Bucket events by severity ONCE (O(n)) — the old code ran find() inside
  // filter() three times (O(n²)) per render.
  const seriesData = useMemo(() => {
    const bySev: Record<AlertSeverity, [number, number][]> = {
      info: [],
      warning: [],
      critical: [],
    };
    for (const e of filtered) {
      const t = new Date(e.triggeredAt).getTime();
      bySev[e.severity].push([t, severityWeight(e.severity)]);
    }
    return bySev;
  }, [filtered]);

  // Memoized option → OffscreenChart only re-setOption when data actually changes.
  const scatterOption = useMemo<EChartsOption>(
    () => ({
      backgroundColor: "transparent",
      animation: false,
      tooltip: { trigger: "item" },
      grid: { left: 60, right: 20, top: 20, bottom: 40 },
      xAxis: {
        type: "time",
        axisLabel: { color: "#64748b", fontSize: 11 },
        axisLine: { lineStyle: { color: "#334155" } },
      },
      yAxis: {
        type: "value",
        min: 0,
        max: 4,
        axisLabel: {
          color: "#64748b",
          fontSize: 11,
          formatter: (v: number) =>
            v === 3 ? "CRITICAL" : v === 2 ? "WARNING" : v === 1 ? "INFO" : "",
        },
        splitLine: { lineStyle: { color: "#1e293b" } },
      },
      series: (["info", "warning", "critical"] as AlertSeverity[]).map((sev) => ({
        type: "scatter",
        name: sev,
        data: seriesData[sev],
        itemStyle: { color: SEVERITY_COLOR[sev], opacity: sev === "critical" ? 0.85 : 0.75 },
        symbolSize: sev === "critical" ? 13 : 10,
      })),
    }),
    [seriesData],
  );

  const handleExport = async (kind: "xlsx" | "pdf") => {
    setExporting(true);
    warmExportWorker();
    try {
      const result = await exportAlertHistory(alertEvents, { kind, scatterOption });
      if (!result) {
        // No export worker (rare) — degrade to a CSV blob in-place.
        downloadCsv(alertEvents);
      }
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Alerts this month", value: stats.thisMonth, color: "text-slate-200" },
          { label: "Critical", value: stats.criticalCount, color: "text-red-400" },
          { label: "Warning", value: stats.warningCount, color: "text-amber-400" },
          {
            label: "Most affected",
            value: stats.mostAffected ? channelLabel(stats.mostAffected) : "—",
            color: "text-blue-400",
          },
        ].map((stat) => (
          <Card key={stat.label} size="sm" className="bg-slate-900/80 border-slate-800">
            <CardContent className="pt-3 pb-3">
              <div className="text-xs text-slate-500 mb-1">{stat.label}</div>
              <div className={cn("text-xl font-bold", stat.color)}>{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Scatter chart (OffscreenCanvas worker render) */}
      <Card className="bg-slate-900/80 border-slate-800">
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-slate-100 text-base">Alert Timeline</CardTitle>
            <div className="flex gap-2">
              <Button
                size="xs"
                variant="outline"
                disabled={exporting || alertEvents.length === 0}
                onClick={() => handleExport("xlsx")}
              >
                {exporting ? "Exporting…" : "Export XLSX"}
              </Button>
              <Button
                size="xs"
                variant="outline"
                disabled={exporting || alertEvents.length === 0}
                onClick={() => handleExport("pdf")}
              >
                Export PDF
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <OffscreenChart
            option={scatterOption}
            height={220}
            fallback={
              <div className="flex h-[220px] items-center justify-center text-xs text-slate-500">
                Chart rendering unavailable in this environment.
              </div>
            }
          />
        </CardContent>
      </Card>

      {/* Filters + virtualized event log */}
      <Card className="bg-slate-900/80 border-slate-800">
        <CardHeader>
          <div className="flex items-center gap-3 flex-wrap">
            <CardTitle className="text-slate-100 text-base">Event Log</CardTitle>
            <span className="text-xs text-slate-500">{filtered.length} events</span>
            <div className="flex gap-2 ml-auto flex-wrap">
              <select
                className="rounded-md bg-slate-800 border border-slate-700 text-slate-200 text-xs px-2 py-1.5 focus:outline-none"
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value as SeverityFilter)}
              >
                <option value="all">All Severities</option>
                <option value="critical">Critical</option>
                <option value="warning">Warning</option>
                <option value="info">Info</option>
              </select>
              <select
                className="rounded-md bg-slate-800 border border-slate-700 text-slate-200 text-xs px-2 py-1.5 focus:outline-none"
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value)}
              >
                <option value="all">All Channels</option>
                {CHANNELS.map((ch) => (
                  <option key={ch.key} value={ch.key}>
                    {ch.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <VirtualEventLog
            events={filtered}
            selectedId={selectedId}
            onSelect={(ev) => setSelectedId((prev) => (prev === ev.id ? null : ev.id))}
            onAcknowledge={acknowledgeEvent}
          />
        </CardContent>
      </Card>
    </div>
  );
}

/** Last-resort CSV download when no export worker exists. */
function downloadCsv(events: AlertEvent[]): void {
  const header = "id,channel,severity,metric,actualValue,threshold,triggeredAt,acknowledged\n";
  const rows = events
    .map(
      (e) =>
        `${e.id},${e.channel},${e.severity},${e.metric},${e.actualValue},${e.threshold},${e.triggeredAt},${e.acknowledged}`,
    )
    .join("\n");
  const url = URL.createObjectURL(new Blob([header + rows], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `alert-log-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
