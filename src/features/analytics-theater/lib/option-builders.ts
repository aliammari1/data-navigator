/**
 * Pure ECharts option builders, shared by the live scenes AND the headless
 * export path. No React, no DOM — given aggregated DuckDB rows they return a
 * plain ECharts option object. Keeping these pure means export can rasterize the
 * exact same chart the user sees without mounting a component.
 *
 * Word cloud is intentionally NOT here: it is rendered with the standalone
 * wordcloud2 library on its own 2D canvas (see scenes/WordCloudScene.tsx), not
 * as an ECharts series.
 */

import { fmtCompact, fmtN } from "@/features/telecom/lib/format";
import { asNum, asStr } from "./queries";
import {
  AXIS_LINE,
  seriesColor,
  SPLIT_LINE_STYLE,
  TEXT_COLOR,
  TOOLTIP_BG,
  TOOLTIP_BORDER,
} from "./theme";

type Rows = Record<string, unknown>[];
type Option = Record<string, unknown>;

const HEATMAP_COLORS = ["#0d1117", "#0e4429", "#006d32", "#26a641", "#39d353"];

const baseTooltip = {
  backgroundColor: TOOLTIP_BG,
  borderColor: TOOLTIP_BORDER,
  textStyle: { color: TEXT_COLOR, fontSize: 12 },
};

// ─── Calendar ────────────────────────────────────────────────────────────────

export function buildCalendarOption(
  rows: Rows,
  year: number,
): { option: Option; min: number; max: number } {
  const points = rows
    .map((r) => ({ date: asStr(r.d), value: asNum(r.v) }))
    .filter((p) => p.date && p.date.slice(0, 4) === String(year));
  let min = Infinity;
  let max = -Infinity;
  for (const p of points) {
    if (p.value < min) min = p.value;
    if (p.value > max) max = p.value;
  }
  if (!Number.isFinite(min)) min = 0;
  if (!Number.isFinite(max)) max = 0;
  return {
    min,
    max,
    option: {
      backgroundColor: "transparent",
      tooltip: {
        ...baseTooltip,
        formatter: (p: { data: [string, number] }) => `<b>${p.data[0]}</b><br/>${fmtN(p.data[1])}`,
      },
      visualMap: {
        min,
        max,
        calculable: true,
        orient: "horizontal",
        left: "center",
        bottom: 0,
        inRange: { color: HEATMAP_COLORS },
        textStyle: { color: TEXT_COLOR, fontSize: 11 },
      },
      calendar: {
        top: 30,
        left: 40,
        right: 20,
        bottom: 50,
        cellSize: ["auto", 16],
        range: year,
        itemStyle: { borderColor: "#ffffff08", borderWidth: 1 },
        dayLabel: {
          color: TEXT_COLOR,
          fontSize: 10,
          firstDay: 1,
          nameMap: ["", "Mon", "", "Wed", "", "Fri", ""],
        },
        monthLabel: { color: TEXT_COLOR, fontSize: 11 },
        yearLabel: { show: false },
        splitLine: { lineStyle: { color: "#ffffff18" } },
      },
      series: [
        {
          type: "heatmap",
          coordinateSystem: "calendar",
          data: points.map((p) => [p.date, p.value]),
        },
      ],
    },
  };
}

// ─── Sankey ──────────────────────────────────────────────────────────────────

export function buildSankeyOption(rows: Rows): { option: Option; total: number } {
  const sources = new Set<string>();
  const targets = new Set<string>();
  const links: { source: string; target: string; value: number }[] = [];
  let total = 0;
  for (const row of rows) {
    const src = asStr(row.src);
    const tgt = asStr(row.tgt);
    const v = asNum(row.v);
    if (!src || !tgt || v <= 0) continue;
    const srcKey = `▸ ${src}`;
    const tgtKey = `${tgt} ◂`;
    sources.add(srcKey);
    targets.add(tgtKey);
    links.push({ source: srcKey, target: tgtKey, value: v });
    total += v;
  }
  const nodes: { name: string; itemStyle: { color: string } }[] = [];
  let ci = 0;
  for (const name of sources) nodes.push({ name, itemStyle: { color: seriesColor(ci++) } });
  for (const name of targets) nodes.push({ name, itemStyle: { color: seriesColor(ci++) } });
  return {
    total,
    option: {
      backgroundColor: "transparent",
      tooltip: { ...baseTooltip, trigger: "item" },
      series: [
        {
          type: "sankey",
          layout: "none",
          emphasis: { focus: "adjacency" },
          nodes,
          links,
          lineStyle: { color: "source", opacity: 0.4, curveness: 0.5 },
          label: { color: TEXT_COLOR, fontSize: 11 },
          nodeWidth: 16,
          nodeGap: 10,
          left: "5%",
          right: "8%",
          top: 12,
          bottom: 12,
        },
      ],
    },
  };
}

// ─── Gantt / hourly heatmap ──────────────────────────────────────────────────

const HOURS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`);

export function buildGanttOption(rows: Rows): { option: Option; rowCount: number } {
  const categories: string[] = [];
  const catIndex = new Map<string, number>();
  const data: [number, number, number][] = [];
  let max = 0;
  for (const row of rows) {
    const cat = asStr(row.cat);
    const hour = Math.trunc(asNum(row.hour));
    const v = asNum(row.v);
    if (!cat || hour < 0 || hour > 23) continue;
    let ci = catIndex.get(cat);
    if (ci === undefined) {
      ci = categories.length;
      catIndex.set(cat, ci);
      categories.push(cat);
    }
    data.push([hour, ci, v]);
    if (v > max) max = v;
  }
  return {
    rowCount: categories.length,
    option: {
      backgroundColor: "transparent",
      tooltip: { ...baseTooltip, position: "top" },
      grid: { top: 10, left: 120, right: 24, bottom: 60, containLabel: false },
      xAxis: {
        type: "category",
        data: HOURS,
        splitArea: { show: true },
        axisLabel: { color: TEXT_COLOR, fontSize: 9, interval: 1 },
        axisLine: AXIS_LINE,
      },
      yAxis: {
        type: "category",
        data: categories,
        splitArea: { show: true },
        axisLabel: { color: TEXT_COLOR, fontSize: 10 },
        axisLine: AXIS_LINE,
      },
      visualMap: {
        min: 0,
        max: max || 1,
        calculable: true,
        orient: "horizontal",
        left: "center",
        bottom: 6,
        inRange: { color: HEATMAP_COLORS },
        textStyle: { color: TEXT_COLOR, fontSize: 11 },
      },
      series: [{ type: "heatmap", data }],
    },
  };
}

// ─── Race (final frame as a static bar for export) ───────────────────────────

export function buildRaceFinalOption(rows: Rows): Option {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const cat = asStr(row.cat);
    const v = asNum(row.v);
    if (!cat) continue;
    totals.set(cat, (totals.get(cat) ?? 0) + v);
  }
  const sorted = Array.from(totals.entries()).sort((a, b) => a[1] - b[1]);
  return {
    backgroundColor: "transparent",
    grid: { top: 10, bottom: 10, left: 16, right: 100, containLabel: true },
    xAxis: {
      type: "value",
      axisLabel: {
        color: TEXT_COLOR,
        fontSize: 10,
        formatter: (v: number) => fmtCompact(v),
      },
      axisLine: AXIS_LINE,
      splitLine: SPLIT_LINE_STYLE,
    },
    yAxis: {
      type: "category",
      data: sorted.map((d) => d[0]),
      axisLabel: { color: TEXT_COLOR, fontSize: 10 },
      axisLine: AXIS_LINE,
    },
    series: [
      {
        type: "bar",
        data: sorted.map(([_name, value], i) => ({
          value,
          itemStyle: {
            color: seriesColor(i),
            borderRadius: [0, 6, 6, 0],
          },
        })),
        label: {
          show: true,
          position: "right",
          color: TEXT_COLOR,
          fontSize: 11,
          formatter: (p: { value: number }) => fmtCompact(p.value),
        },
      },
    ],
  };
}

// ─── Sunburst ────────────────────────────────────────────────────────────────

export function buildSunburstOption(rows: Rows): Option {
  const l1Map = new Map<string, Map<string, number>>();
  const l1Totals = new Map<string, number>();
  for (const row of rows) {
    const l1 = asStr(row.l1);
    const l2 = asStr(row.l2);
    const v = asNum(row.v);
    if (!l1 || v <= 0) continue;
    let inner = l1Map.get(l1);
    if (!inner) {
      inner = new Map();
      l1Map.set(l1, inner);
    }
    if (l2 && l2 !== "null") inner.set(l2, (inner.get(l2) ?? 0) + v);
    l1Totals.set(l1, (l1Totals.get(l1) ?? 0) + v);
  }
  const tree = Array.from(l1Totals.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([l1, l1Total], i) => {
      const color = seriesColor(i);
      const inner = l1Map.get(l1);
      const children =
        inner && inner.size > 0
          ? Array.from(inner.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([l2, v]) => ({ name: l2, value: v, itemStyle: { color } }))
          : undefined;
      return {
        name: l1,
        itemStyle: { color },
        ...(children ? { children } : { value: l1Total }),
      };
    });
  return {
    backgroundColor: "transparent",
    tooltip: { ...baseTooltip, trigger: "item" },
    series: [
      {
        type: "sunburst",
        data: tree,
        radius: ["15%", "90%"],
        center: ["50%", "50%"],
        label: { color: "#fff" },
      },
    ],
  };
}
