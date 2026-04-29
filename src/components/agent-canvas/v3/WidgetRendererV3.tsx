"use client";
/**
 * WidgetRendererV3 — full chart suite:
 * ECharts (standard + 3D GL), Nivo (heatmap/network/sankey/calendar/bump),
 * visx sparklines + box plots, react-countup KPI cards.
 */

import { useMemo, Suspense, lazy } from "react";
import { cn } from "@/lib/utils";
import type { WidgetState, KPICard } from "@/lib/agent-canvas/types";
import CountUp from "react-countup";
import numeral from "numeral";

// ─── Lazy heavy charts ────────────────────────────────────────────────────────

const ReactECharts = lazy(() => import("echarts-for-react"));

// ─── KPI Grid with react-countup ─────────────────────────────────────────────

const KPI_ACCENT: Record<string, string> = {
  "text-blue-400": "#60a5fa",
  "text-emerald-400": "#34d399",
  "text-amber-400": "#fbbf24",
  "text-violet-400": "#a78bfa",
  "text-cyan-400": "#22d3ee",
  "text-rose-400": "#fb7185",
};

function parseNumber(value: string): number | null {
  const n = parseFloat(value.replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? null : n;
}

function KPIGrid({ cards }: { cards: KPICard[] }) {
  return (
    <div
      className={cn(
        "grid gap-3 h-full content-start",
        cards.length <= 2
          ? "grid-cols-2"
          : cards.length <= 4
            ? "grid-cols-2"
            : "grid-cols-2",
      )}
    >
      {cards.map((card, i) => {
        const numVal = parseNumber(card.value);
        const accent = KPI_ACCENT[card.colorClass] ?? "#a78bfa";
        const isLarge = numVal !== null && Math.abs(numVal) > 1000;

        return (
          <div
            key={i}
            className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/50 flex flex-col gap-0.5"
            style={{ borderTopColor: accent, borderTopWidth: 2 }}
          >
            <p className="text-[11px] text-slate-400 truncate">{card.label}</p>
            <p
              className={cn("text-xl font-bold tabular-nums", card.colorClass)}
            >
              {numVal !== null ? (
                <CountUp
                  end={numVal}
                  duration={1.2}
                  separator=","
                  decimals={numVal % 1 !== 0 ? 2 : 0}
                  formattingFn={
                    isLarge
                      ? (v) => numeral(v).format("0.[0]a").toUpperCase()
                      : undefined
                  }
                />
              ) : (
                card.value
              )}
            </p>
            {card.sub && (
              <p className="text-[10px] text-slate-500">{card.sub}</p>
            )}
          </div>
        );
      })}
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
          {rows.slice(0, 200).map((row, i) => (
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

// ─── Nivo Heatmap ─────────────────────────────────────────────────────────────

function NivoHeatmap({ data: rawData }: { data: Record<string, unknown>[] }) {
  const { ResponsiveHeatMap } = require("@nivo/heatmap"); // eslint-disable-line
  const keys = Object.keys(rawData[0] ?? {}).filter((k) => k !== "id");
  const data = rawData.slice(0, 15).map((row, i) => ({
    id: String(row[Object.keys(row)[0]] ?? `row${i}`),
    data: keys.map((k) => ({ x: k, y: Number(row[k]) || 0 })),
  }));

  return (
    <ResponsiveHeatMap
      data={data}
      keys={keys}
      indexBy="id"
      margin={{ top: 20, right: 20, bottom: 60, left: 80 }}
      colors={{ type: "diverging", scheme: "red_yellow_blue", divergeAt: 0.5 }}
      theme={{
        text: { fill: "#94a3b8", fontSize: 10 },
        axis: { ticks: { text: { fill: "#64748b" } } },
      }}
      axisTop={null}
      axisLeft={{ tickSize: 0, tickPadding: 5 }}
      axisBottom={{ tickSize: 0, tickPadding: 5, tickRotation: -30 }}
      borderWidth={1}
      borderColor={{ from: "color", modifiers: [["darker", 0.4]] }}
      animate={true}
      motionConfig="gentle"
    />
  );
}

// ─── Nivo Network ─────────────────────────────────────────────────────────────

function NivoNetwork({ data: rawData }: { data: Record<string, unknown>[] }) {
  const { ResponsiveNetwork } = require("@nivo/network"); // eslint-disable-line
  const keys = Object.keys(rawData[0] ?? {});
  const nodes = keys
    .slice(0, 10)
    .map((k) => ({ id: k, height: 1, size: 20, color: "#6d28d9" }));
  const links = rawData
    .slice(0, 20)
    .map((row, i) => ({
      source: String(row[keys[0]] ?? `src${i}`),
      target: String(row[keys[1]] ?? `tgt${i}`),
      distance: 60,
    }))
    .filter((l) => l.source !== l.target);

  return (
    <ResponsiveNetwork
      data={{ nodes, links }}
      margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
      linkDistance={(e: { distance: number }) => e.distance}
      centeringStrength={0.3}
      repulsivity={6}
      nodeSize={(n: { size: number }) => n.size}
      activeNodeSize={(n: { size: number }) => n.size * 1.5}
      nodeColor={(e: { color: string }) => e.color}
      nodeBorderWidth={1}
      nodeBorderColor={{ from: "color", modifiers: [["darker", 0.4]] }}
      theme={{ text: { fill: "#94a3b8" } }}
    />
  );
}

// ─── Nivo Sankey ─────────────────────────────────────────────────────────────

function NivoSankey({ data: rawData }: { data: Record<string, unknown>[] }) {
  const { ResponsiveSankey } = require("@nivo/sankey"); // eslint-disable-line
  const keys = Object.keys(rawData[0] ?? {});
  const srcKey = keys[0];
  const tgtKey = keys[1];
  const valKey = keys[2];

  const nodeSet = new Set<string>();
  rawData.forEach((r) => {
    nodeSet.add(String(r[srcKey]));
    nodeSet.add(String(r[tgtKey]));
  });

  const nodes = Array.from(nodeSet).map((id) => ({ id }));
  const linksRaw = rawData
    .slice(0, 15)
    .map((r) => ({
      source: String(r[srcKey]),
      target: String(r[tgtKey]),
      value: Math.abs(Number(r[valKey]) || 1),
    }))
    .filter((l) => l.source !== l.target);

  return (
    <ResponsiveSankey
      data={{ nodes, links: linksRaw }}
      margin={{ top: 10, right: 30, bottom: 10, left: 30 }}
      align="justify"
      colors={{ scheme: "paired" }}
      nodeOpacity={1}
      nodeThickness={12}
      nodeBorderColor={{ from: "color", modifiers: [["darker", 0.8]] }}
      linkOpacity={0.4}
      enableLinkGradient
      theme={{ text: { fill: "#94a3b8", fontSize: 10 } }}
    />
  );
}

// ─── Nivo Calendar ────────────────────────────────────────────────────────────

function NivoCalendar({ data: rawData }: { data: Record<string, unknown>[] }) {
  const { ResponsiveCalendar } = require("@nivo/calendar"); // eslint-disable-line
  const keys = Object.keys(rawData[0] ?? {});
  const dateKey =
    keys.find(
      (k) =>
        k.toLowerCase().includes("date") || k.toLowerCase().includes("day"),
    ) ?? keys[0];
  const valKey = keys.find((k) => k !== dateKey) ?? keys[1];

  const calData = rawData
    .filter((r) => r[dateKey] && !isNaN(new Date(String(r[dateKey])).getTime()))
    .slice(0, 365)
    .map((r) => ({
      day: String(r[dateKey]).slice(0, 10),
      value: Number(r[valKey]) || 1,
    }));

  if (calData.length < 2)
    return (
      <div className="text-xs text-slate-600 p-4 text-center">
        Need date column for calendar
      </div>
    );

  const from = calData[0].day;
  const to = calData[calData.length - 1].day;

  return (
    <ResponsiveCalendar
      data={calData}
      from={from}
      to={to}
      emptyColor="#1e293b"
      colors={["#1e3a5f", "#1d4ed8", "#3b82f6", "#60a5fa"]}
      margin={{ top: 20, right: 20, bottom: 20, left: 40 }}
      yearSpacing={40}
      monthBorderColor="#0f172a"
      dayBorderWidth={1}
      dayBorderColor="#0f172a"
      theme={{ text: { fill: "#64748b", fontSize: 10 } }}
    />
  );
}

// ─── Nivo Bump ────────────────────────────────────────────────────────────────

function NivoBump({ data: rawData }: { data: Record<string, unknown>[] }) {
  const { ResponsiveBump } = require("@nivo/bump"); // eslint-disable-line
  const keys = Object.keys(rawData[0] ?? {});
  const seriesKey = keys[0];
  const periodKey = keys[1];
  const rankKey = keys[2];

  const seriesSet = Array.from(
    new Set(rawData.map((r) => String(r[seriesKey]))),
  ).slice(0, 8);
  const periods = Array.from(
    new Set(rawData.map((r) => String(r[periodKey]))),
  ).slice(0, 12);

  const bumpData = seriesSet.map((id) => ({
    id,
    data: periods.map((x) => {
      const row = rawData.find(
        (r) => String(r[seriesKey]) === id && String(r[periodKey]) === x,
      );
      return { x, y: row ? Number(row[rankKey]) || 1 : null };
    }),
  }));

  return (
    <ResponsiveBump
      data={bumpData}
      colors={{ scheme: "nivo" }}
      lineWidth={2}
      activeLineWidth={4}
      inactiveLineWidth={1}
      inactiveOpacity={0.15}
      pointSize={8}
      activePointSize={12}
      inactivePointSize={0}
      pointColor={{ theme: "background" }}
      pointBorderWidth={2}
      activePointBorderWidth={3}
      pointBorderColor={{ from: "serie.color" }}
      margin={{ top: 20, right: 120, bottom: 40, left: 40 }}
      axisTop={null}
      axisBottom={{ tickSize: 0, tickPadding: 5 }}
      axisLeft={{ tickSize: 0, tickPadding: 5 }}
      theme={{ text: { fill: "#94a3b8", fontSize: 10 } }}
    />
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
        <span className="text-red-400 text-xl">✗</span>
        <p className="text-xs text-red-400/80">
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

// ─── Nivo chart type router ───────────────────────────────────────────────────

function NivoChart({
  chartType,
  data,
}: {
  chartType: string;
  data: Record<string, unknown>[];
}) {
  if (!data?.length)
    return (
      <div className="text-xs text-slate-600 p-4 text-center">No data</div>
    );

  switch (chartType) {
    case "heatmap":
      return <NivoHeatmap data={data} />;
    case "network":
      return <NivoNetwork data={data} />;
    case "sankey":
      return <NivoSankey data={data} />;
    case "calendar":
      return <NivoCalendar data={data} />;
    case "bump":
      return <NivoBump data={data} />;
    default:
      return null;
  }
}

const NIVO_TYPES = new Set([
  "heatmap",
  "network",
  "sankey",
  "calendar",
  "bump",
]);
const ECHARTS_OPTS = { renderer: "canvas" as const };
const ECHARTS_STYLE = { height: "100%", width: "100%" };

// ─── Main renderer ────────────────────────────────────────────────────────────

interface Props {
  widget: WidgetState;
  height?: number | string;
  className?: string;
}

export function WidgetRendererV3({
  widget,
  height = "100%",
  className,
}: Props) {
  const {
    status,
    echartsOption,
    kpis,
    tableHeaders,
    tableRows,
    error,
    spec,
    rawData,
  } = widget;

  // Memoize
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const chartOpts = useMemo(
    () => echartsOption,
    [JSON.stringify(echartsOption)],
  );

  if (status !== "done" && !echartsOption && !kpis && !tableHeaders) {
    return <Skeleton status={status} error={error} />;
  }
  if (error && !echartsOption && !kpis) {
    return <Skeleton status="error" error={error} />;
  }

  // KPI grid
  if (kpis) return <KPIGrid cards={kpis} />;

  // Data table
  if (tableHeaders && tableRows) {
    return (
      <div className={cn("h-full", className)} style={{ height }}>
        <DataTable headers={tableHeaders} rows={tableRows} />
      </div>
    );
  }

  // Nivo charts
  if (NIVO_TYPES.has(spec.chartType) && rawData?.length) {
    return (
      <div className={cn("h-full w-full", className)} style={{ height }}>
        <Suspense fallback={<Skeleton status="building" />}>
          <NivoChart chartType={spec.chartType} data={rawData} />
        </Suspense>
      </div>
    );
  }

  // ECharts
  if (chartOpts) {
    return (
      <div className={cn("h-full w-full", className)} style={{ height }}>
        <Suspense fallback={<Skeleton status="building" />}>
          <ReactECharts
            option={chartOpts as Record<string, unknown>}
            style={ECHARTS_STYLE}
            opts={ECHARTS_OPTS}
            notMerge
            lazyUpdate
            theme="dark"
          />
        </Suspense>
      </div>
    );
  }

  return <Skeleton status={status} />;
}
