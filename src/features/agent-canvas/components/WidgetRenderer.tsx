"use client";

/**
 * WidgetRenderer — full chart suite:
 * ECharts (standard + 3D GL)
 * visx sparklines + box plots, react-countup KPI cards.
 */

import { useMemo } from "react";
import CountUp from "react-countup";
import type { KPICard, WidgetState } from "@/features/agent-canvas/core/types";
import type { EChartsOption } from "@/platform/viz";
import { cn } from "@/shared/utils";
import { AgentChart } from "./AgentChart";
import { VirtualDataTable } from "./VirtualDataTable";

// ─── KPI Grid with react-countup ─────────────────────────────────────────────

const KPI_ACCENT: Record<string, string> = {
  "text-blue-400": "#60a5fa",
  "text-emerald-400": "#34d399",
  "text-amber-400": "#fbbf24",
  "text-violet-400": "#a78bfa",
  "text-cyan-400": "#22d3ee",
  "text-rose-400": "#fb7185",
};

// ─── ECharts specialized chart builders ──────────────────────────────────────

type EChartsOptionObject = Record<string, unknown>;

const SPECIAL_ECHART_TYPES = new Set([
  "heatmap",
  "network",
  "sankey",
  "calendar",
  "bump",
]);

function getRowKeys(data: Record<string, unknown>[]): string[] {
  return Object.keys(data[0] ?? {});
}

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asLabel(value: unknown, fallback: string): string {
  if (value == null || value === "") return fallback;
  return String(value);
}

function getExtent(values: number[]): { min: number; max: number } {
  const finite = values.filter(Number.isFinite);

  if (finite.length === 0) {
    return { min: 0, max: 1 };
  }

  const min = Math.min(...finite);
  const max = Math.max(...finite);

  return min === max ? { min: 0, max: max || 1 } : { min, max };
}

function buildHeatmapOption(
  rawData: Record<string, unknown>[],
): EChartsOptionObject {
  const keys = getRowKeys(rawData);
  const labelKey = keys[0];
  const valueKeys = keys.filter((key) => key !== labelKey).slice(0, 24);
  const rows = rawData.slice(0, 24);

  const values = rows.flatMap((row) =>
    valueKeys.map((key) => asNumber(row[key])),
  );

  const { min, max } = getExtent(values);

  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "item",
      formatter: (params: { value: [number, number, number] }) => {
        const [x, y, value] = params.value;
        return `${rows[y]?.[labelKey] ?? `Row ${y + 1}`}<br/>${valueKeys[x]}: ${value}`;
      },
    },
    grid: {
      top: 20,
      right: 20,
      bottom: 70,
      left: 90,
    },
    xAxis: {
      type: "category",
      data: valueKeys,
      axisLabel: {
        color: "#94a3b8",
        rotate: 35,
        fontSize: 10,
      },
      axisLine: { lineStyle: { color: "#334155" } },
      splitArea: { show: true },
    },
    yAxis: {
      type: "category",
      data: rows.map((row, index) => asLabel(row[labelKey], `row${index + 1}`)),
      axisLabel: {
        color: "#94a3b8",
        fontSize: 10,
      },
      axisLine: { lineStyle: { color: "#334155" } },
      splitArea: { show: true },
    },
    visualMap: {
      min,
      max,
      show: false,
      calculable: true,
      inRange: {
        color: ["#1e3a8a", "#2563eb", "#facc15", "#ef4444"],
      },
    },
    series: [
      {
        type: "heatmap",
        data: rows.flatMap((row, y) =>
          valueKeys.map((key, x) => [x, y, asNumber(row[key])]),
        ),
        emphasis: {
          itemStyle: {
            borderColor: "#e2e8f0",
            borderWidth: 1,
          },
        },
      },
    ],
  };
}

function buildNetworkOption(
  rawData: Record<string, unknown>[],
): EChartsOptionObject {
  const keys = getRowKeys(rawData);
  const sourceKey = keys[0];
  const targetKey = keys[1];

  const nodeIds = new Set<string>();
  const links = rawData
    .slice(0, 80)
    .map((row, index) => {
      const source = asLabel(row[sourceKey], `source-${index}`);
      const target = asLabel(row[targetKey], `target-${index}`);

      nodeIds.add(source);
      nodeIds.add(target);

      return {
        source,
        target,
        value: 1,
      };
    })
    .filter((link) => link.source !== link.target);

  return {
    backgroundColor: "transparent",
    tooltip: {},
    series: [
      {
        type: "graph",
        layout: "force",
        roam: true,
        draggable: true,
        data: Array.from(nodeIds).map((id) => ({
          id,
          name: id,
          symbolSize: 18,
          itemStyle: {
            color: "#7c3aed",
          },
          label: {
            show: true,
            color: "#cbd5e1",
            fontSize: 10,
          },
        })),
        links,
        force: {
          repulsion: 140,
          edgeLength: 80,
        },
        lineStyle: {
          color: "#64748b",
          opacity: 0.45,
        },
        emphasis: {
          focus: "adjacency",
        },
      },
    ],
  };
}

function buildSankeyOption(
  rawData: Record<string, unknown>[],
): EChartsOptionObject {
  const keys = getRowKeys(rawData);
  const sourceKey = keys[0];
  const targetKey = keys[1];
  const valueKey = keys[2];

  const nodeIds = new Set<string>();

  const links = rawData
    .slice(0, 80)
    .map((row, index) => {
      const source = asLabel(row[sourceKey], `source-${index}`);
      const target = asLabel(row[targetKey], `target-${index}`);

      nodeIds.add(source);
      nodeIds.add(target);

      return {
        source,
        target,
        value: Math.max(1, Math.abs(asNumber(row[valueKey], 1))),
      };
    })
    .filter((link) => link.source !== link.target);

  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "item",
      triggerOn: "mousemove",
    },
    series: [
      {
        type: "sankey",
        top: 10,
        right: 20,
        bottom: 10,
        left: 20,
        nodeWidth: 14,
        nodeGap: 10,
        data: Array.from(nodeIds).map((name) => ({ name })),
        links,
        label: {
          color: "#cbd5e1",
          fontSize: 10,
        },
        lineStyle: {
          color: "gradient",
          opacity: 0.35,
          curveness: 0.5,
        },
        itemStyle: {
          borderColor: "#0f172a",
          borderWidth: 1,
        },
      },
    ],
  };
}

function buildCalendarOption(
  rawData: Record<string, unknown>[],
): EChartsOptionObject | null {
  const keys = getRowKeys(rawData);

  const dateKey =
    keys.find((key) => {
      const lower = key.toLowerCase();
      return lower.includes("date") || lower.includes("day");
    }) ?? keys[0];

  const valueKey = keys.find((key) => key !== dateKey) ?? keys[1];

  const data = rawData
    .filter((row) => {
      const value = row[dateKey];
      return value && !Number.isNaN(new Date(String(value)).getTime());
    })
    .slice(0, 365)
    .map((row) => [
      String(row[dateKey]).slice(0, 10),
      asNumber(row[valueKey], 1),
    ]);

  if (data.length < 2) {
    return null;
  }

  const values = data.map(([, value]) => Number(value));
  const { min, max } = getExtent(values);

  return {
    backgroundColor: "transparent",
    tooltip: {
      position: "top",
    },
    visualMap: {
      min,
      max,
      show: false,
      inRange: {
        color: ["#1e293b", "#1d4ed8", "#3b82f6", "#60a5fa"],
      },
    },
    calendar: {
      top: 25,
      left: 35,
      right: 20,
      bottom: 25,
      range: [String(data[0][0]), String(data[data.length - 1][0])],
      cellSize: ["auto", 14],
      splitLine: {
        lineStyle: {
          color: "#0f172a",
        },
      },
      itemStyle: {
        color: "#1e293b",
        borderColor: "#0f172a",
        borderWidth: 1,
      },
      dayLabel: {
        color: "#64748b",
        fontSize: 10,
      },
      monthLabel: {
        color: "#94a3b8",
        fontSize: 10,
      },
      yearLabel: {
        color: "#94a3b8",
        fontSize: 10,
      },
    },
    series: [
      {
        type: "heatmap",
        coordinateSystem: "calendar",
        data,
      },
    ],
  };
}

function buildBumpOption(
  rawData: Record<string, unknown>[],
): EChartsOptionObject {
  const keys = getRowKeys(rawData);
  const seriesKey = keys[0];
  const periodKey = keys[1];
  const rankKey = keys[2];

  const seriesIds = Array.from(
    new Set(rawData.map((row) => asLabel(row[seriesKey], "Unknown"))),
  ).slice(0, 8);

  const periods = Array.from(
    new Set(rawData.map((row) => asLabel(row[periodKey], "Period"))),
  ).slice(0, 16);

  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
    },
    grid: {
      top: 20,
      right: 90,
      bottom: 40,
      left: 40,
    },
    xAxis: {
      type: "category",
      data: periods,
      axisLabel: {
        color: "#94a3b8",
        fontSize: 10,
      },
      axisLine: {
        lineStyle: {
          color: "#334155",
        },
      },
    },
    yAxis: {
      type: "value",
      inverse: true,
      min: 1,
      axisLabel: {
        color: "#94a3b8",
        fontSize: 10,
      },
      splitLine: {
        lineStyle: {
          color: "rgba(148, 163, 184, 0.12)",
        },
      },
    },
    legend: {
      right: 0,
      top: 10,
      orient: "vertical",
      textStyle: {
        color: "#94a3b8",
        fontSize: 10,
      },
    },
    series: seriesIds.map((id) => ({
      name: id,
      type: "line",
      smooth: true,
      symbol: "circle",
      symbolSize: 7,
      connectNulls: true,
      emphasis: {
        focus: "series",
      },
      lineStyle: {
        width: 2,
      },
      data: periods.map((period) => {
        const row = rawData.find(
          (candidate) =>
            asLabel(candidate[seriesKey], "") === id &&
            asLabel(candidate[periodKey], "") === period,
        );

        return row ? asNumber(row[rankKey], 1) : null;
      }),
    })),
  };
}

function buildSpecialEChartsOption(
  chartType: string,
  rawData: Record<string, unknown>[],
): EChartsOptionObject | null {
  if (!rawData.length) return null;

  switch (chartType) {
    case "heatmap":
      return buildHeatmapOption(rawData);
    case "network":
      return buildNetworkOption(rawData);
    case "sankey":
      return buildSankeyOption(rawData);
    case "calendar":
      return buildCalendarOption(rawData);
    case "bump":
      return buildBumpOption(rawData);
    default:
      return null;
  }
}

function parseNumber(value: string): number | null {
  const n = parseFloat(value.replace(/[^0-9.-]/g, ""));
  return Number.isNaN(n) ? null : n;
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
                      ? (v) =>
                          Intl.NumberFormat(undefined, {
                            notation: "compact",
                            compactDisplay: "short",
                          })
                            .format(v)
                            .toUpperCase()
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
  // Row + column virtualized — no raw <tr>/<td> DOM explosion on wide/large
  // result sets (the agent emits SELECT * data-tables for many columns).
  return <VirtualDataTable headers={headers} rows={rows} />;
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

// ─── Main renderer ────────────────────────────────────────────────────────────

interface Props {
  widget: WidgetState;
  height?: number | string;
  className?: string;
}

export function WidgetRenderer({ widget, height = "100%", className }: Props) {
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
  const specialChartOption = useMemo(() => {
    if (!rawData?.length || !SPECIAL_ECHART_TYPES.has(spec.chartType)) {
      return null;
    }

    return buildSpecialEChartsOption(spec.chartType, rawData);
  }, [rawData, spec.chartType]);

  const chartOpts = echartsOption ?? specialChartOption;

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

  // ECharts — rendered off the main thread via the OffscreenCanvas worker.
  if (chartOpts) {
    return (
      <div className={cn("h-full w-full", className)} style={{ height }}>
        <AgentChart option={chartOpts as unknown as EChartsOption} />
      </div>
    );
  }

  return <Skeleton status={status} />;
}
