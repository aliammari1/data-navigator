"use client";
import { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import { cn } from "@/lib/utils";
import type { KPICard, WidgetState } from "@/lib/agent-canvas/types";

// ─── KPI Grid ─────────────────────────────────────────────────────────────────

const KPI_COLOR: Record<string, string> = {
  "text-blue-400": "#60a5fa",
  "text-emerald-400": "#34d399",
  "text-amber-400": "#fbbf24",
  "text-violet-400": "#a78bfa",
  "text-cyan-400": "#22d3ee",
  "text-rose-400": "#fb7185",
};

function KPIGrid({ cards }: { cards: KPICard[] }) {
  return (
    <div
      className={cn(
        "grid gap-3 h-full content-start",
        cards.length <= 2
          ? "grid-cols-2"
          : cards.length <= 4
            ? "grid-cols-2 sm:grid-cols-4"
            : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4",
      )}
    >
      {cards.map((card, i) => (
        <div
          key={i}
          className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/50 flex flex-col gap-0.5"
        >
          <p className="text-[11px] text-slate-400 truncate">{card.label}</p>
          <p className={cn("text-xl font-bold tabular-nums", card.colorClass)}>
            {card.value}
          </p>
          {card.sub && <p className="text-[10px] text-slate-500">{card.sub}</p>}
        </div>
      ))}
    </div>
  );
}

// ─── Data Table ───────────────────────────────────────────────────────────────

function DataTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-auto h-full rounded-lg border border-slate-700/40">
      <table className="min-w-full text-xs">
        <thead className="sticky top-0 bg-slate-800/90 backdrop-blur-sm">
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                className="text-left px-3 py-2 text-slate-400 font-medium whitespace-nowrap border-b border-slate-700/40"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className={cn(
                "hover:bg-slate-700/30 transition-colors",
                i % 2 === 0 ? "" : "bg-slate-800/20",
              )}
            >
              {row.map((cell, j) => (
                <td
                  key={j}
                  className="px-3 py-1.5 text-slate-300 whitespace-nowrap max-w-[180px] truncate"
                  title={cell}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({
  status,
  error,
}: {
  status: WidgetState["status"];
  error?: string;
}) {
  if (status === "error") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-4">
        <span className="text-red-400 text-2xl">✗</span>
        <p className="text-xs text-red-400">
          {error ?? "Failed to build widget"}
        </p>
      </div>
    );
  }

  const label =
    status === "querying"
      ? "Running SQL…"
      : status === "building"
        ? "Building chart…"
        : "Pending…";

  return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

// ─── Main Renderer ────────────────────────────────────────────────────────────

const ECHARTS_OPTS = { renderer: "canvas" as const };
const ECHARTS_STYLE = { height: "100%", width: "100%" };

interface Props {
  widget: WidgetState;
  height?: number | string;
  className?: string;
}

export function WidgetRenderer({ widget, height = "100%", className }: Props) {
  const { status, echartsOption, kpis, tableHeaders, tableRows, error } =
    widget;
  // Memoize echart options to prevent unnecessary re-renders
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const chartOpts = useMemo(
    () => echartsOption,
    [JSON.stringify(echartsOption)],
  );

  // Show skeleton when not yet done and no renderable data
  if (status !== "done" && !echartsOption && !kpis && !tableHeaders) {
    return <Skeleton status={status} error={error} />;
  }

  if (error && !echartsOption && !kpis) {
    return <Skeleton status="error" error={error} />;
  }

  // KPI grid
  if (kpis) {
    return <KPIGrid cards={kpis} />;
  }

  // Data table
  if (tableHeaders && tableRows) {
    return (
      <div className={cn("h-full", className)} style={{ height }}>
        <DataTable headers={tableHeaders} rows={tableRows} />
      </div>
    );
  }

  // ECharts
  if (chartOpts) {
    return (
      <div className={cn("h-full w-full", className)} style={{ height }}>
        <ReactECharts
          option={chartOpts as Record<string, unknown>}
          style={ECHARTS_STYLE}
          opts={ECHARTS_OPTS}
          notMerge
          lazyUpdate
          theme="dark"
        />
      </div>
    );
  }

  return <Skeleton status={status} />;
}
