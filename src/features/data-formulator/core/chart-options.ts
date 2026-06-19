import { flagOutliers, linearTrendline } from "@/features/data-formulator/core/ai";
import type { ChartSpec } from "./types";
import { PALETTE } from "./constants";
import { fmtVal } from "./helpers";

/**
 * Maximum of a numeric array via `reduce`. Avoids `Math.max(...arr)`, whose
 * argument spread can overflow the call stack on large result sets (tens of
 * thousands of elements). Returns `floor` when the array is empty.
 */
function safeMax(values: number[], floor = 0): number {
  let max = floor;
  for (const v of values) {
    if (v > max) max = v;
  }
  return max;
}

// ─── Smart chart option builder ───────────────────────────────────────────────

export function buildOption(
  spec: ChartSpec,
  data: Record<string, unknown>[],
): Record<string, unknown> | null {
  if (!data.length) return null;

  const base = {
    backgroundColor: "transparent",
    textStyle: { color: "#a1a1aa", fontFamily: "inherit" },
    tooltip: {
      backgroundColor: "#1e1e2e",
      borderColor: "#ffffff12",
      textStyle: { color: "#cdd6f4", fontSize: 11 },
    },
  };

  const xLabels = data.map((d) => String(d.x_val ?? ""));
  const yValues = data.map((d) => Number(d.y_val ?? 0));
  const colorVals = data.map((d) => String(d.color_val ?? ""));

  const catAxis = {
    type: "category" as const,
    data: xLabels,
    axisLabel: {
      color: "#6c7086",
      fontSize: 10,
      rotate: xLabels.length > 10 ? 35 : 0,
    },
    axisLine: { lineStyle: { color: "#ffffff10" } },
    axisTick: { show: false },
  };
  const valAxis = {
    type: "value" as const,
    axisLabel: { color: "#6c7086", fontSize: 10, formatter: fmtVal },
    splitLine: { lineStyle: { color: "#ffffff08" } },
  };

  // ── Pie / Donut ──────────────────────────────────────────────────────────
  if (spec.type === "pie" || spec.type === "donut") {
    return {
      ...base,
      tooltip: {
        ...base.tooltip,
        trigger: "item",
        formatter: (p: { name: string; value: number; percent: number }) =>
          `${p.name}<br/>${fmtVal(p.value)} (${p.percent?.toFixed(1)}%)`,
      },
      legend: {
        orient: "vertical",
        right: 8,
        top: "center",
        textStyle: { color: "#6c7086", fontSize: 10 },
        type: "scroll",
      },
      series: [
        {
          type: "pie",
          radius: spec.type === "donut" ? ["42%", "70%"] : "70%",
          center: ["38%", "50%"],
          data: data.slice(0, 14).map((d, i) => ({
            name: String(d.x_val ?? `Item ${i + 1}`),
            value: Number(d.y_val ?? 0),
            itemStyle: { color: PALETTE[i % PALETTE.length] },
          })),
          label: { show: false },
          emphasis: { scale: true, scaleSize: 6 },
          itemStyle: {
            borderColor: "#0f1117",
            borderWidth: 2,
            borderRadius: 4,
          },
        },
      ],
    };
  }

  // ── Scatter ──────────────────────────────────────────────────────────────
  if (spec.type === "scatter" || spec.type === "bubble") {
    const grouped = new Map<string, Array<[number, number, string]>>();
    for (const d of data) {
      const key = String(d.color_val ?? "");
      const arr = grouped.get(key) ?? [];
      arr.push([Number(d.x_val ?? 0), Number(d.y_val ?? 0), String(d.x_val ?? "")]);
      grouped.set(key, arr);
    }
    const series = [...grouped.entries()].map(([name, arr], i) => ({
      type: "scatter",
      name: name || "Points",
      data: arr,
      symbolSize: spec.type === "bubble" ? 14 : 7,
      itemStyle: { color: PALETTE[i % PALETTE.length], opacity: 0.75 },
      emphasis: { focus: "series" },
    }));
    return {
      ...base,
      tooltip: { ...base.tooltip, trigger: "item" },
      legend:
        grouped.size > 1 ? { textStyle: { color: "#6c7086", fontSize: 10 }, top: 0 } : undefined,
      grid: { top: 32, right: 16, bottom: 36, left: 12, containLabel: true },
      xAxis: { ...valAxis, scale: true },
      yAxis: { ...valAxis, scale: true },
      series,
    };
  }

  // ── Heatmap ──────────────────────────────────────────────────────────────
  if (spec.type === "heatmap") {
    const xs = [...new Set(data.map((d) => String(d.x_val ?? "")))];
    const ys = [...new Set(data.map((d) => String(d.color_val ?? "")))];
    const vals = data.map((d) => [
      String(d.x_val ?? ""),
      String(d.color_val ?? ""),
      Number(d.size_val ?? d.y_val ?? 0),
    ]);
    const max = safeMax(
      vals.map((v) => v[2] as number),
      1,
    );
    return {
      ...base,
      grid: { top: 16, right: 60, bottom: 36, left: 12, containLabel: true },
      xAxis: { ...catAxis, data: xs },
      yAxis: {
        type: "category",
        data: ys,
        axisLabel: { color: "#6c7086", fontSize: 10 },
      },
      visualMap: {
        min: 0,
        max,
        calculable: true,
        orient: "vertical",
        right: 0,
        top: "center",
        textStyle: { color: "#6c7086", fontSize: 9 },
        inRange: { color: ["#1e1e2e", "#a78bfa"] },
      },
      series: [
        {
          type: "heatmap",
          data: vals,
          emphasis: { itemStyle: { shadowBlur: 8 } },
        },
      ],
    };
  }

  // ── Treemap ──────────────────────────────────────────────────────────────
  if (spec.type === "treemap") {
    return {
      ...base,
      tooltip: {
        ...base.tooltip,
        formatter: (p: { name: string; value: number }) => `${p.name}: ${fmtVal(p.value)}`,
      },
      series: [
        {
          type: "treemap",
          data: data.slice(0, 40).map((d, i) => ({
            name: String(d.x_val ?? `Item ${i + 1}`),
            value: Number(d.y_val ?? 0),
            itemStyle: { color: PALETTE[i % PALETTE.length] },
          })),
          label: {
            show: true,
            formatter: "{b}",
            color: "#0f1117",
            fontSize: 11,
          },
          levels: [
            {
              itemStyle: {
                borderWidth: 2,
                borderColor: "#0f1117",
                gapWidth: 2,
              },
            },
          ],
        },
      ],
    };
  }

  // ── Funnel ──────────────────────────────────────────────────────────────
  if (spec.type === "funnel") {
    const sorted = [...data].sort((a, b) => Number(b.y_val ?? 0) - Number(a.y_val ?? 0));
    return {
      ...base,
      tooltip: {
        ...base.tooltip,
        trigger: "item",
        formatter: (p: { name: string; value: number }) => `${p.name}: ${fmtVal(p.value)}`,
      },
      series: [
        {
          type: "funnel",
          left: "10%",
          width: "80%",
          top: 16,
          bottom: 8,
          data: sorted.slice(0, 10).map((d, i) => ({
            name: String(d.x_val ?? `Stage ${i + 1}`),
            value: Number(d.y_val ?? 0),
            itemStyle: { color: PALETTE[i % PALETTE.length] },
          })),
          label: {
            position: "inside",
            color: "#0f1117",
            fontSize: 11,
            fontWeight: 600,
          },
        },
      ],
    };
  }

  // ── Radar ───────────────────────────────────────────────────────────────
  if (spec.type === "radar") {
    const max = safeMax(yValues, 1);
    return {
      ...base,
      radar: {
        indicator: xLabels.map((name) => ({ name, max })),
        axisName: { color: "#6c7086", fontSize: 10 },
        splitLine: { lineStyle: { color: "#ffffff08" } },
        axisLine: { lineStyle: { color: "#ffffff10" } },
      },
      series: [
        {
          type: "radar",
          data: [
            {
              value: yValues,
              name: spec.title || "Profile",
              areaStyle: { color: `${PALETTE[0]}33` },
              lineStyle: { color: PALETTE[0] },
              itemStyle: { color: PALETTE[0] },
            },
          ],
        },
      ],
    };
  }

  // ── Stacked / Multi-line: pivot color ────────────────────────────────────
  const isStacked = spec.type === "stacked-bar" || spec.type === "stacked-horizontal-bar";
  const isMultiLine = spec.type === "multi-line";
  const horizontal = spec.type === "horizontal-bar" || spec.type === "stacked-horizontal-bar";

  const hasColor = colorVals.some((v) => v !== "");
  if ((isStacked || isMultiLine) && hasColor) {
    const xs = [...new Set(xLabels)];
    const groups = [...new Set(colorVals)];
    // Build an (x, color) → y lookup ONCE (O(data)) instead of scanning the full
    // `data` array for every (x, group) cell (O(xs·groups·data) via `data.find`).
    const byKey = new Map<string, number>();
    for (const d of data) {
      byKey.set(`${String(d.x_val ?? "")} ${String(d.color_val ?? "")}`, Number(d.y_val ?? 0));
    }
    const series = groups.map((g, i) => ({
      name: g,
      type: isMultiLine ? "line" : "bar",
      stack: isStacked ? "total" : undefined,
      smooth: isMultiLine,
      symbol: isMultiLine ? "circle" : undefined,
      symbolSize: 4,
      data: xs.map((x) => byKey.get(`${x} ${g}`) ?? 0),
      itemStyle: { color: PALETTE[i % PALETTE.length] },
      lineStyle: isMultiLine ? { color: PALETTE[i % PALETTE.length], width: 2.5 } : undefined,
      barMaxWidth: 36,
      emphasis: { focus: "series" },
    }));
    return {
      ...base,
      tooltip: {
        ...base.tooltip,
        trigger: "axis",
        axisPointer: { type: "shadow" },
      },
      legend: {
        textStyle: { color: "#6c7086", fontSize: 10 },
        top: 0,
        type: "scroll",
      },
      grid: { top: 36, right: 16, bottom: 30, left: 12, containLabel: true },
      xAxis: horizontal ? valAxis : { ...catAxis, data: xs },
      yAxis: horizontal ? { ...catAxis, data: xs } : valAxis,
      series,
    };
  }

  // ── Bar / Line / Area (single series) ────────────────────────────────────
  const series: Record<string, unknown>[] = [];
  const baseColor = PALETTE[0];

  if (spec.type === "line" || spec.type === "area") {
    series.push({
      type: "line",
      data: yValues,
      smooth: true,
      symbol: "circle",
      symbolSize: 4,
      lineStyle: { color: baseColor, width: 2.5 },
      itemStyle: { color: baseColor },
      ...(spec.type === "area"
        ? {
            areaStyle: {
              color: {
                type: "linear",
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: `${baseColor}55` },
                  { offset: 1, color: `${baseColor}08` },
                ],
              },
            },
          }
        : {}),
    });

    if (spec.showTrendline && yValues.length > 2) {
      series.push({
        type: "line",
        data: linearTrendline(yValues),
        symbol: "none",
        smooth: false,
        lineStyle: { color: "#f472b6", width: 1.5, type: "dashed" },
        name: "Trend",
        z: 1,
      });
    }
  } else {
    // bar / horizontal-bar
    const outliers = spec.showOutliers ? flagOutliers(yValues) : yValues.map(() => false);
    series.push({
      type: "bar",
      data: yValues.map((v, i) => ({
        value: v,
        itemStyle: {
          color: outliers[i] ? "#f87171" : baseColor,
          borderRadius: horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0],
        },
      })),
      barMaxWidth: 36,
      emphasis: { focus: "series" },
    });
  }

  return {
    ...base,
    tooltip: { ...base.tooltip, trigger: "axis" },
    legend:
      series.length > 1 ? { textStyle: { color: "#6c7086", fontSize: 10 }, top: 0 } : undefined,
    grid: {
      top: series.length > 1 ? 32 : 16,
      right: 16,
      bottom: 30,
      left: 12,
      containLabel: true,
    },
    xAxis: horizontal ? valAxis : catAxis,
    yAxis: horizontal ? catAxis : valAxis,
    series,
  };
}
