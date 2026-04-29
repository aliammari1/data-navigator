import type {
  CanalHourCell,
  CanalSummary,
  DailyTrendRow,
  ErrorRow,
  HourlyRow,
  StatusRow,
} from "@/features/telecom/types";
import type { ForecastPoint } from "@/lib/forecast-onnx";
import { fmtAmount, fmtCompact, fmtN, fmtPct, movingAverage } from "@/features/telecom/lib/format";
import { CANAL_CONFIG, STATUS_COLORS } from "@/features/telecom/lib/canal-config";
import { computeCanalRiskScore } from "@/features/telecom/lib/insights";

// ─── Shared tooltip/theme constants ──────────────────────────────────────────

const TOOLTIP_BG = "#1e1e2e";
const TOOLTIP_BORDER = "#ffffff10";
const TOOLTIP_BORDER_12 = "#ffffff12";
const TOOLTIP_TEXT = { color: "#cdd6f4", fontSize: 11 };
const AXIS_LABEL_DIM = { color: "#6c7086", fontSize: 9 };
const AXIS_LABEL_FG = { color: "#cdd6f4", fontSize: 10 };
const SPLIT_LINE = { lineStyle: { color: "#ffffff08" } };
const AXIS_LINE_FAINT = { lineStyle: { color: "#ffffff10" } };

// ─── Hourly stacked-bar with optional AI forecast ────────────────────────────

export function buildHourlyChartOption(
  data: HourlyRow[],
  forecast: ForecastPoint[],
): object {
  const byHour: Record<number, HourlyRow> = {};
  for (const r of data) byHour[r.hour] = r;
  const byForecastHour: Record<number, ForecastPoint> = {};
  for (const f of forecast) byForecastHour[f.hour] = f;

  const forecastOnlyHours = forecast.map((f) => f.hour).filter((h) => byHour[h] === undefined);
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const allHours = [...hours, ...forecastOnlyHours];
  const allLabels = allHours.map((h) => `${h}`.padStart(2, "0"));

  const legendData = ["Réussie", "Échec", "Autre"];
  if (forecast.length > 0) legendData.push("Prévision IA");

  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      backgroundColor: TOOLTIP_BG,
      borderColor: TOOLTIP_BORDER,
      textStyle: TOOLTIP_TEXT,
      formatter: (ps: { name: string; value: number; seriesName: string }[]) => {
        const h = Number(ps[0]?.name);
        const row = byHour[h];
        const fRow = byForecastHour[h];
        if (!row && !fRow) return `${h}:00`;
        if (fRow && !row) {
          return [
            `<b>${h.toString().padStart(2, "0")}:00 [Prévision IA]</b>`,
            `Total prévu: <b>${fmtN(fRow.predictedTotal)}</b>`,
            `Taux réussite prévu: ${fmtPct(fRow.predictedSuccessRate * 100)}`,
          ].join("<br/>");
        }
        if (!row) return `${h}:00`;
        const rate = row.total > 0 ? fmtPct((row.success / row.total) * 100) : "—";
        const forecastLine = fRow
          ? `<br/>Prévision: <span style="color:#a78bfa">${fmtN(fRow.predictedTotal)}</span>`
          : "";
        return [
          `<b>${h.toString().padStart(2, "0")}:00 – ${h.toString().padStart(2, "0")}:59</b>`,
          `Total: <b>${fmtN(row.total)}</b>${forecastLine}`,
          `Réussie: <span style="color:#10b981">${fmtN(row.success)}</span>`,
          `Échec: <span style="color:#ef4444">${fmtN(row.declined)}</span>`,
          `Taux: ${rate}`,
          `Montant: ${fmtAmount(row.amount)}`,
        ].join("<br/>");
      },
    },
    legend: {
      data: legendData,
      textStyle: { color: "#6c7086", fontSize: 10 },
      top: 0,
      right: 0,
    },
    grid: { top: 28, right: 10, bottom: 24, left: 10, containLabel: true },
    xAxis: {
      type: "category",
      data: allLabels,
      axisLabel: AXIS_LABEL_DIM,
      axisLine: AXIS_LINE_FAINT,
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      axisLabel: AXIS_LABEL_DIM,
      splitLine: SPLIT_LINE,
    },
    series: [
      {
        name: "Réussie",
        type: "bar",
        stack: "total",
        data: allHours.map((h) => byHour[h]?.success ?? 0),
        itemStyle: { color: "#10b981" },
        barMaxWidth: 20,
      },
      {
        name: "Échec",
        type: "bar",
        stack: "total",
        data: allHours.map((h) => byHour[h]?.declined ?? 0),
        itemStyle: { color: "#ef4444" },
        barMaxWidth: 20,
      },
      {
        name: "Autre",
        type: "bar",
        stack: "total",
        data: allHours.map((h) =>
          Math.max(
            0,
            (byHour[h]?.total ?? 0) - (byHour[h]?.success ?? 0) - (byHour[h]?.declined ?? 0),
          ),
        ),
        itemStyle: { color: "#f59e0b", borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 20,
      },
      ...(forecast.length > 0
        ? [
            {
              name: "Prévision IA",
              type: "bar",
              stack: "total",
              data: allHours.map((h) =>
                byForecastHour[h] && !byHour[h] ? byForecastHour[h].predictedTotal : null,
              ),
              itemStyle: { color: "#a78bfa", opacity: 0.55, borderRadius: [3, 3, 0, 0] },
              barMaxWidth: 20,
            },
            {
              name: "Prévision IA (overlay)",
              type: "line",
              showSymbol: true,
              symbol: "diamond",
              symbolSize: 7,
              lineStyle: { type: "dashed", color: "#a78bfa", width: 2 },
              itemStyle: { color: "#a78bfa" },
              data: allHours.map((h) => (byForecastHour[h] ? byForecastHour[h].predictedTotal : null)),
              tooltip: { show: false },
              legend: { show: false },
            },
          ]
        : []),
    ],
  };
}

// ─── Status donut ─────────────────────────────────────────────────────────────

export function buildStatusDonutOption(data: StatusRow[]): object {
  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "item",
      backgroundColor: TOOLTIP_BG,
      borderColor: TOOLTIP_BORDER,
      textStyle: TOOLTIP_TEXT,
      formatter: (p: { name: string; value: number; percent: number }) =>
        `${p.name}<br/>Nombre: <b>${fmtN(p.value)}</b><br/>Part: ${p.percent.toFixed(1)}%`,
    },
    legend: {
      orient: "vertical",
      right: 4,
      top: "center",
      textStyle: { color: "#6c7086", fontSize: 10 },
    },
    series: [
      {
        type: "pie",
        radius: ["42%", "68%"],
        center: ["38%", "50%"],
        data: data.map((r) => ({
          name: r.status,
          value: r.count,
          itemStyle: { color: STATUS_COLORS[r.status] ?? "#6b7280" },
        })),
        label: { show: false },
        itemStyle: { borderColor: "#0f1117", borderWidth: 3 },
        emphasis: { itemStyle: { shadowBlur: 8, shadowColor: "rgba(0,0,0,0.4)" } },
      },
    ],
  };
}

// ─── Canal share stacked bar ──────────────────────────────────────────────────

export function buildCanalShareOption(canals: CanalSummary[]): object {
  const sorted = [...canals].sort((a, b) => b.total - a.total);
  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      backgroundColor: TOOLTIP_BG,
      borderColor: TOOLTIP_BORDER,
      textStyle: TOOLTIP_TEXT,
    },
    legend: {
      data: ["Réussie", "Échec", "Instance", "Remboursement"],
      textStyle: { color: "#6c7086", fontSize: 10 },
      top: 0,
      right: 0,
    },
    grid: { top: 28, right: 10, bottom: 10, left: 10, containLabel: true },
    xAxis: { type: "value", axisLabel: AXIS_LABEL_DIM, splitLine: SPLIT_LINE },
    yAxis: {
      type: "category",
      data: sorted.map((c) => CANAL_CONFIG[c.key].shortLabel),
      axisLabel: AXIS_LABEL_FG,
    },
    series: [
      { name: "Réussie", type: "bar", stack: "s", data: sorted.map((c) => c.success), itemStyle: { color: "#10b981" }, barMaxWidth: 22 },
      { name: "Échec", type: "bar", stack: "s", data: sorted.map((c) => c.declined), itemStyle: { color: "#ef4444" }, barMaxWidth: 22 },
      { name: "Instance", type: "bar", stack: "s", data: sorted.map((c) => c.instance), itemStyle: { color: "#f59e0b" }, barMaxWidth: 22 },
      { name: "Remboursement", type: "bar", stack: "s", data: sorted.map((c) => c.refund), itemStyle: { color: "#8b5cf6", borderRadius: [0, 3, 3, 0] }, barMaxWidth: 22 },
    ],
  };
}

// ─── Revenue pie ──────────────────────────────────────────────────────────────

interface RevenueGroup { name: string; value: number; color: string; }

export function buildRevenuePieOption(grouped: RevenueGroup[]): object {
  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "item",
      backgroundColor: TOOLTIP_BG,
      borderColor: TOOLTIP_BORDER,
      textStyle: TOOLTIP_TEXT,
      formatter: (p: { name: string; value: number; percent: number }) =>
        `${p.name}<br/>${fmtAmount(p.value)} TND<br/>${p.percent.toFixed(1)}%`,
    },
    series: [
      {
        type: "pie",
        radius: ["32%", "62%"],
        data: grouped.map((g) => ({ name: g.name, value: g.value, itemStyle: { color: g.color } })),
        label: { color: "#6c7086", fontSize: 9 },
        itemStyle: { borderColor: "#0f1117", borderWidth: 2 },
      },
    ],
  };
}

// ─── Error frequency horizontal bar ──────────────────────────────────────────

export function buildErrorFreqOption(errors: ErrorRow[]): object {
  const top = errors.slice(0, 10);
  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      backgroundColor: TOOLTIP_BG,
      borderColor: TOOLTIP_BORDER,
      textStyle: TOOLTIP_TEXT,
      formatter: (ps: { name: string; value: number }[]) => {
        const e = top.find((r) => r.error_code === ps[0]?.name);
        return `<b>${ps[0]?.name}</b><br/>${e?.error_message ?? ""}<br/>Nombre: <b>${fmtN(ps[0]?.value ?? 0)}</b>`;
      },
    },
    grid: { top: 8, right: 20, bottom: 8, left: 8, containLabel: true },
    xAxis: { type: "value", axisLabel: AXIS_LABEL_DIM, splitLine: SPLIT_LINE },
    yAxis: { type: "category", data: top.map((e) => e.error_code), axisLabel: AXIS_LABEL_FG },
    series: [
      {
        type: "bar",
        data: top.map((e) => e.count),
        itemStyle: {
          color: { type: "linear", x: 1, y: 0, x2: 0, y2: 0, colorStops: [{ offset: 0, color: "#ef4444" }, { offset: 1, color: "#dc2626aa" }] },
          borderRadius: [0, 4, 4, 0],
        },
        barMaxWidth: 18,
      },
    ],
  };
}

// ─── Success rate per-canal bar ───────────────────────────────────────────────

export function buildSuccessRateTrendOption(canals: CanalSummary[]): object {
  const sorted = [...canals].sort((a, b) => b.successRate - a.successRate);
  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      backgroundColor: TOOLTIP_BG,
      borderColor: TOOLTIP_BORDER,
      textStyle: TOOLTIP_TEXT,
      formatter: (ps: { name: string; value: number }[]) =>
        `${ps[0]?.name}<br/>Taux de Réussite: <b>${ps[0]?.value.toFixed(1)}%</b>`,
    },
    grid: { top: 8, right: 60, bottom: 8, left: 8, containLabel: true },
    xAxis: {
      type: "value",
      min: 0,
      max: 100,
      axisLabel: { color: "#6c7086", fontSize: 9, formatter: (v: number) => `${v}%` },
      splitLine: SPLIT_LINE,
    },
    yAxis: { type: "category", data: sorted.map((c) => CANAL_CONFIG[c.key].shortLabel), axisLabel: AXIS_LABEL_FG },
    series: [
      {
        type: "bar",
        data: sorted.map((c) => ({
          value: c.successRate,
          itemStyle: {
            color: c.successRate >= 95 ? "#10b981" : c.successRate >= 80 ? "#f59e0b" : "#ef4444",
            borderRadius: [0, 4, 4, 0],
          },
        })),
        barMaxWidth: 20,
        label: {
          show: true,
          position: "right",
          color: "#6c7086",
          fontSize: 10,
          formatter: (p: { value: number }) => `${p.value.toFixed(1)}%`,
        },
      },
    ],
  };
}

// ─── Anomaly timeline ─────────────────────────────────────────────────────────

type AnomalyPoint = { hour: number; zScore: number; type: "spike" | "drop" };

export function buildAnomalyTimelineOption(
  hourly: HourlyRow[],
  anomalies: AnomalyPoint[],
): object {
  const anomalySet = new Map(anomalies.map((a) => [a.hour, a]));
  const byHour: Record<number, HourlyRow> = {};
  for (const r of hourly) byHour[r.hour] = r;
  const hours = Array.from({ length: 24 }, (_, i) => i);

  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      backgroundColor: TOOLTIP_BG,
      borderColor: TOOLTIP_BORDER,
      textStyle: TOOLTIP_TEXT,
      formatter: (ps: Array<{ name: string; value: number }>) => {
        const h = Number(ps[0]?.name);
        const row = byHour[h];
        const anom = anomalySet.get(h);
        const parts = [`<b>${h.toString().padStart(2, "0")}:00</b>`, `Total: <b>${fmtN(row?.total ?? 0)}</b>`];
        if (anom)
          parts.push(
            `<span style="color:${anom.type === "spike" ? "#f59e0b" : "#8b5cf6"}">⚠ Anomalie (z=${anom.zScore.toFixed(2)})</span>`,
          );
        return parts.join("<br/>");
      },
    },
    grid: { top: 28, right: 10, bottom: 24, left: 10, containLabel: true },
    xAxis: {
      type: "category",
      data: hours.map((h) => `${h}`.padStart(2, "0")),
      axisLabel: AXIS_LABEL_DIM,
      axisLine: AXIS_LINE_FAINT,
      axisTick: { show: false },
    },
    yAxis: { type: "value", axisLabel: AXIS_LABEL_DIM, splitLine: SPLIT_LINE },
    series: [
      {
        name: "Volume",
        type: "bar",
        data: hours.map((h) => {
          const v = byHour[h]?.total ?? 0;
          const a = anomalySet.get(h);
          return { value: v, itemStyle: { color: a ? (a.type === "spike" ? "#f59e0b" : "#8b5cf6") : "#89b4fa", borderRadius: [3, 3, 0, 0] } };
        }),
        barMaxWidth: 20,
      },
      {
        name: "Échecs",
        type: "line",
        data: hours.map((h) => byHour[h]?.declined ?? 0),
        lineStyle: { color: "#ef4444", width: 1.5 },
        itemStyle: { color: "#ef4444" },
        symbol: "none",
        smooth: true,
        areaStyle: {
          color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "#ef444430" }, { offset: 1, color: "#ef444400" }] },
        },
      },
    ],
  };
}

// ─── Risk score per-canal horizontal bar ─────────────────────────────────────

export function buildRiskScoreOption(canals: CanalSummary[]): object {
  const scored = canals.map((c) => ({ ...c, risk: computeCanalRiskScore(c) })).sort((a, b) => b.risk - a.risk);
  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      backgroundColor: TOOLTIP_BG,
      borderColor: TOOLTIP_BORDER,
      textStyle: TOOLTIP_TEXT,
      formatter: (ps: Array<{ name: string; value: number }>) =>
        `${ps[0]?.name}<br/>Score de Risque: <b>${ps[0]?.value}/100</b>`,
    },
    grid: { top: 8, right: 60, bottom: 8, left: 8, containLabel: true },
    xAxis: { type: "value", min: 0, max: 100, axisLabel: AXIS_LABEL_DIM, splitLine: SPLIT_LINE },
    yAxis: { type: "category", data: scored.map((c) => CANAL_CONFIG[c.key].shortLabel), axisLabel: AXIS_LABEL_FG },
    series: [
      {
        type: "bar",
        barMaxWidth: 18,
        data: scored.map((c) => ({
          value: c.risk,
          itemStyle: { color: c.risk >= 40 ? "#ef4444" : c.risk >= 20 ? "#f59e0b" : "#10b981", borderRadius: [0, 4, 4, 0] },
        })),
        label: { show: true, position: "right", color: "#6c7086", fontSize: 10, formatter: (p: { value: number }) => `${p.value}` },
      },
    ],
  };
}

// ─── Group summary donut ──────────────────────────────────────────────────────

interface GroupItem { label: string; nombre: number; montant: number; color: string; }

export function buildGroupSummaryDonutOption(data: GroupItem[]): object {
  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "item",
      backgroundColor: TOOLTIP_BG,
      borderColor: TOOLTIP_BORDER_12,
      textStyle: TOOLTIP_TEXT,
      formatter: (p: { name: string; value: number; percent: number }) =>
        `<b>${p.name}</b><br/>Transactions : <b>${fmtN(p.value)}</b> (${p.percent.toFixed(1)}%)<br/>Montant : <b>${fmtAmount(data.find((d) => d.label === p.name)?.montant ?? 0)} DT</b>`,
    },
    legend: {
      orient: "vertical",
      right: 8,
      top: "center",
      textStyle: { color: "#a6adc8", fontSize: 10 },
      icon: "circle",
      itemWidth: 8,
      itemHeight: 8,
      itemGap: 8,
    },
    series: [
      {
        type: "pie",
        radius: ["38%", "66%"],
        center: ["32%", "50%"],
        avoidLabelOverlap: true,
        label: { show: false },
        labelLine: { show: false },
        emphasis: { itemStyle: { shadowBlur: 8, shadowColor: "rgba(0,0,0,0.4)" }, scale: true, scaleSize: 6 },
        data: data.map((d) => ({ name: d.label, value: d.nombre, itemStyle: { color: d.color } })),
      },
    ],
  };
}

export function buildGroupSummaryHbarOption(data: GroupItem[]): object {
  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      backgroundColor: TOOLTIP_BG,
      borderColor: TOOLTIP_BORDER_12,
      textStyle: TOOLTIP_TEXT,
      axisPointer: { type: "shadow" },
    },
    grid: { left: 140, right: 60, top: 6, bottom: 6, containLabel: false },
    xAxis: { type: "value", axisLabel: AXIS_LABEL_DIM, splitLine: SPLIT_LINE, axisLine: { show: false }, axisTick: { show: false } },
    yAxis: {
      type: "category",
      data: data.map((d) => d.label),
      axisLabel: { color: "#cdd6f4", fontSize: 10, width: 130, overflow: "truncate" },
      axisTick: { show: false },
      axisLine: { show: false },
    },
    series: [
      {
        type: "bar",
        data: data.map((d) => ({ value: d.nombre, itemStyle: { color: d.color, borderRadius: [0, 4, 4, 0] } })),
        barMaxWidth: 18,
        label: { show: true, position: "right", color: "#a6adc8", fontSize: 9, formatter: (p: { value: number }) => p.value > 0 ? fmtN(p.value) : "" },
      },
    ],
  };
}

// ─── Canal comparison grouped bar ─────────────────────────────────────────────

interface CompareResult { label: string; nombre: number; montant: number; color: string; }

export function buildCanalCompareBarOption(results: CompareResult[]): object {
  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      backgroundColor: TOOLTIP_BG,
      borderColor: TOOLTIP_BORDER_12,
      textStyle: TOOLTIP_TEXT,
      axisPointer: { type: "shadow" },
      formatter: (params: { name: string; value: number }[]) => {
        const p = params[0];
        const r = results.find((x) => x.label === p.name);
        return `<b>${p.name}</b><br/>Transactions : <b>${fmtN(p.value)}</b><br/>Montant : <b>${fmtAmount(r?.montant ?? 0)} DT</b>`;
      },
    },
    grid: { left: 16, right: 16, top: 8, bottom: 6, containLabel: true },
    xAxis: {
      type: "category",
      data: results.map((r) => r.label),
      axisLabel: { color: "#6c7086", fontSize: 9, rotate: 20, overflow: "truncate", width: 90 },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "#ffffff20" } },
    },
    yAxis: { type: "value", axisLabel: AXIS_LABEL_DIM, splitLine: SPLIT_LINE },
    series: [
      {
        name: "Transactions réussies",
        type: "bar",
        data: results.map((r) => ({ value: r.nombre, itemStyle: { color: r.color, borderRadius: [4, 4, 0, 0] } })),
        barMaxWidth: 40,
        label: { show: true, position: "top", color: "#a6adc8", fontSize: 9, formatter: (p: { value: number }) => fmtCompact(p.value) },
      },
    ],
  };
}

// ─── Canal heatmap ────────────────────────────────────────────────────────────

export function buildCanalHeatmapOption(
  data: CanalHourCell[],
  viewMode: "volume" | "rate",
): object {
  const canalTotals = new Map<string, number>();
  for (const cell of data) canalTotals.set(cell.canal, (canalTotals.get(cell.canal) ?? 0) + cell.total);
  const canals = [...canalTotals.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const cellMap = new Map<string, CanalHourCell>();
  for (const cell of data) cellMap.set(`${cell.canal}:${cell.hour}`, cell);

  const heatData: [number, number, number][] = [];
  for (let yi = 0; yi < canals.length; yi++) {
    for (const h of hours) {
      const cell = cellMap.get(`${canals[yi]}:${h}`);
      if (viewMode === "volume") {
        heatData.push([h, yi, cell?.total ?? 0]);
      } else {
        const rate = cell && cell.total > 0 ? Math.round((cell.success / cell.total) * 100) : -1;
        heatData.push([h, yi, rate]);
      }
    }
  }
  const maxVal = Math.max(...heatData.map(([, , v]) => (v === -1 ? 0 : v)), 1);

  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "item",
      backgroundColor: TOOLTIP_BG,
      borderColor: TOOLTIP_BORDER_12,
      textStyle: TOOLTIP_TEXT,
      formatter: (p: { data: [number, number, number] }) => {
        const [h, yi] = p.data;
        const canal = canals[yi];
        const cell = cellMap.get(`${canal}:${h}`);
        if (!cell || cell.total === 0) return `${canal}<br/>${h}:00 — aucune transaction`;
        const rate = cell.total > 0 ? ((cell.success / cell.total) * 100).toFixed(1) : "—";
        return `<b>${canal}</b><br/>${h}:00–${h + 1}:00<br/>Transactions: <b>${fmtN(cell.total)}</b><br/>Succès: <b>${rate}%</b>`;
      },
    },
    grid: { left: 160, right: 80, top: 10, bottom: 30 },
    xAxis: {
      type: "category",
      data: hours.map((h) => `${h.toString().padStart(2, "0")}h`),
      splitArea: { show: true },
      axisLabel: AXIS_LABEL_DIM,
      axisTick: { show: false },
    },
    yAxis: {
      type: "category",
      data: canals,
      axisLabel: { color: "#cdd6f4", fontSize: 9, width: 155, overflow: "truncate" },
      axisTick: { show: false },
      axisLine: { show: false },
    },
    visualMap:
      viewMode === "volume"
        ? { min: 0, max: maxVal, calculable: true, orient: "horizontal", right: 0, top: "middle", textStyle: { color: "#6c7086", fontSize: 9 }, inRange: { color: ["#1e1e2e", "#313244", "#89b4fa", "#b4befe"] } }
        : { min: 0, max: 100, calculable: true, orient: "horizontal", right: 0, top: "middle", textStyle: { color: "#6c7086", fontSize: 9 }, inRange: { color: ["#f38ba8", "#f9e2af", "#a6e3a1"] }, text: ["100%", "0%"] },
    series: [
      {
        type: "heatmap",
        data: heatData.filter(([, , v]) => v !== -1),
        label: {
          show: canals.length <= 6,
          color: "#cdd6f4",
          fontSize: 8,
          formatter: (p: { data: [number, number, number] }) =>
            viewMode === "volume"
              ? p.data[2] > 0 ? fmtCompact(p.data[2]) : ""
              : p.data[2] >= 0 ? `${p.data[2]}%` : "",
        },
        emphasis: { itemStyle: { shadowBlur: 6, shadowColor: "rgba(0,0,0,0.5)" } },
      },
    ],
  };
}

// ─── Daily trend ─────────────────────────────────────────────────────────────

export function buildDailyTrendOption(
  data: DailyTrendRow[],
  labels: string[],
  rates: (number | null)[],
  maSeries: (number | null)[],
  maValues: number[],
): object {
  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      backgroundColor: TOOLTIP_BG,
      borderColor: TOOLTIP_BORDER_12,
      textStyle: TOOLTIP_TEXT,
      axisPointer: { type: "cross" },
    },
    legend: { top: 0, textStyle: { color: "#a6adc8", fontSize: 10 } },
    grid: { left: 16, right: 60, top: 28, bottom: 6, containLabel: true },
    xAxis: {
      type: "category",
      data: labels,
      axisLabel: AXIS_LABEL_DIM,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "#ffffff20" } },
    },
    yAxis: [
      { type: "value", name: "Transactions", nameTextStyle: { color: "#6c7086", fontSize: 9 }, axisLabel: AXIS_LABEL_DIM, splitLine: SPLIT_LINE },
      { type: "value", name: "Taux %", min: 0, max: 100, nameTextStyle: { color: "#6c7086", fontSize: 9 }, axisLabel: { color: "#6c7086", fontSize: 9, formatter: "{value}%" }, splitLine: { show: false } },
    ],
    series: [
      { name: "Total", type: "bar", data: data.map((r) => ({ value: r.total, itemStyle: { color: "#313244", borderRadius: [2, 2, 0, 0] } })), barMaxWidth: 32, stack: "tx" },
      { name: "Succès", type: "bar", data: data.map((r) => ({ value: r.success, itemStyle: { color: "#a6e3a1", borderRadius: [2, 2, 0, 0] } })), barMaxWidth: 32, stack: "tx" },
      { name: "Échecs", type: "bar", data: data.map((r) => ({ value: r.declined, itemStyle: { color: "#f38ba8", borderRadius: [2, 2, 0, 0] } })), barMaxWidth: 32, stack: "tx" },
      { name: "Taux succès", type: "line", yAxisIndex: 1, data: rates, smooth: true, lineStyle: { color: "#89b4fa", width: 2 }, itemStyle: { color: "#89b4fa" }, symbol: "circle", symbolSize: 5, areaStyle: { color: "rgba(137,180,250,0.06)" } },
      ...(maValues.length > 0
        ? [{ name: "Moy. mobile 3j", type: "line", data: maSeries, smooth: true, lineStyle: { color: "#f9e2af", width: 1.5, type: "dashed" }, itemStyle: { color: "#f9e2af" }, symbol: "none", tooltip: { valueFormatter: (v: number | null) => v != null ? fmtN(Math.round(v)) : "—" } }]
        : []),
    ],
  };
}

// ─── Customer profile hourly bar ──────────────────────────────────────────────

interface CustomerHourlyEntry { hour: number; total: number; }

export function buildCustomerHourlyOption(
  hourly: CustomerHourlyEntry[],
  peakHour: number,
): object {
  return {
    backgroundColor: "transparent",
    tooltip: { trigger: "axis", backgroundColor: TOOLTIP_BG, borderColor: TOOLTIP_BORDER_12, textStyle: { color: "#cdd6f4", fontSize: 10 } },
    grid: { left: 8, right: 8, top: 4, bottom: 16, containLabel: true },
    xAxis: {
      type: "category",
      data: Array.from({ length: 24 }, (_, i) => `${i}h`),
      axisLabel: { color: "#6c7086", fontSize: 8 },
      axisTick: { show: false },
      axisLine: { show: false },
    },
    yAxis: { type: "value", axisLabel: { show: false }, splitLine: SPLIT_LINE },
    series: [
      {
        type: "bar",
        data: Array.from({ length: 24 }, (_, h) => {
          const r = hourly.find((x) => x.hour === h);
          return { value: r?.total ?? 0, itemStyle: { color: h === peakHour ? "#cba6f7" : "#89b4fa", borderRadius: [2, 2, 0, 0] } };
        }),
        barMaxWidth: 12,
      },
    ],
  };
}
