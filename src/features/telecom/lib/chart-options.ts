import { CANAL_CONFIG, STATUS_COLORS } from "@/features/telecom/lib/canal-config";
import { fmtAmount, fmtCompact, fmtN, fmtPct } from "@/features/telecom/lib/format";
import { computeCanalRiskScore } from "@/features/telecom/lib/insights";
import type {
  CanalHourCell,
  CanalSummary,
  DailyTrendRow,
  HourlyRow,
  StatusRow,
} from "@/features/telecom/types";

// ─── Theme resolver ───────────────────────────────────────────────────────────
//
// Chart options are BUILT on the main thread, then serialized to a Web Worker
// (OffscreenCanvas) for rendering. A worker has no DOM, so theme colors MUST be
// resolved to canvas-safe rgb/rgba strings HERE, before serialization — never in
// the worker. We resolve each CSS custom property through a hidden probe element
// (`getComputedStyle().color` reliably yields an `rgb()`/`rgba()` string even for
// `oklch()` source values, which some canvas backends reject).

/** Dark Catppuccin fallbacks — only used when no DOM is available (SSR). */
const FALLBACK = {
  tooltipBg: "#1e1e2e",
  tooltipBorder: "rgba(255,255,255,0.10)",
  tooltipText: "#cdd6f4",
  axisDim: "#6c7086",
  axisFg: "#cdd6f4",
  splitLine: "rgba(255,255,255,0.08)",
  pieBorder: "#0f1117",
  legendText: "#a6adc8",
  success: "#10b981",
  danger: "#ef4444",
  warning: "#f59e0b",
  primary: "#89b4fa",
  ai: "#a78bfa",
  neutralBar: "#313244",
} as const;

export interface ChartTheme {
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  axisDim: string;
  axisFg: string;
  splitLine: string;
  pieBorder: string;
  legendText: string;
  success: string;
  danger: string;
  warning: string;
  primary: string;
  ai: string;
  neutralBar: string;
}

function resolveCssColor(value: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const probe = document.createElement("span");
  probe.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;color:${value}`;
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return resolved || fallback;
}

/**
 * Re-express a resolved `rgb()`/`rgba()` color at a new alpha. Used for canvas
 * gradient stops (ECharts area fills) that need a translucent variant of a
 * theme-resolved hue. Falls back to the input string if it can't be parsed.
 */
function withAlpha(color: string, alpha: number): string {
  const m = color.match(/rg+a?\(([^)]+)\)/i);
  if (!m) return color;
  const [r, g, b] = m[1].split(",").map((n) => n.trim());
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Snapshot the active theme into canvas-safe rgb/rgba strings. Call ONCE at the
 * top of each builder (it touches the DOM, so avoid calling it per-series).
 */
export function chartTheme(): ChartTheme {
  const v = (name: string, fb: string) => resolveCssColor(`var(${name})`, fb);
  const border = v("--border", FALLBACK.tooltipBorder);
  return {
    tooltipBg: v("--popover", FALLBACK.tooltipBg),
    tooltipBorder: border,
    tooltipText: v("--popover-foreground", FALLBACK.tooltipText),
    axisDim: v("--muted-foreground", FALLBACK.axisDim),
    axisFg: v("--foreground", FALLBACK.axisFg),
    splitLine: border,
    pieBorder: v("--card", FALLBACK.pieBorder),
    legendText: v("--muted-foreground", FALLBACK.legendText),
    // Semantic data colors — keep their MEANING but pull from tokens so each
    // theme can tune the exact hue for contrast on its own background.
    success: v("--success", FALLBACK.success),
    danger: v("--destructive", FALLBACK.danger),
    warning: v("--warning", FALLBACK.warning),
    primary: v("--primary", FALLBACK.primary),
    ai: v("--ai", FALLBACK.ai),
    neutralBar: v("--muted-foreground", FALLBACK.neutralBar),
  };
}

/**
 * Re-tint an already-built option when the theme flips.
 *
 * The telecom chart builders run on the main thread and resolve theme colors at
 * build time. But the React components that call them `useMemo` the option with
 * data-only deps, so a theme change does NOT rebuild the option — the chart keeps
 * the previous theme's colors. `<EChart>` calls this on a theme flip to swap any
 * color string that came from the OLD `ChartTheme` for the matching color in the
 * NEW one (including `rgba()` alpha variants used by gradient stops), producing a
 * fresh option object the worker re-renders via `setOption`.
 *
 * Color-string identity is the matching key: builders only ever emit theme colors
 * via the `ChartTheme` values (or `withAlpha` of them), so a value-equality swap
 * is exact for chrome + semantic-data colors. Config-sourced hues (STATUS_COLORS,
 * CANAL_CONFIG, caller-provided `color`) don't match the palette and pass through
 * untouched — which is correct, they're theme-independent on purpose.
 */
export function retintOption(option: unknown, from: ChartTheme, to: ChartTheme): unknown {
  // Build a string→string substitution map: every `from` palette value (and its
  // rgba alpha variants seen in the option) maps to the matching `to` value.
  const swap = new Map<string, string>();
  for (const key of Object.keys(from) as (keyof ChartTheme)[]) {
    if (from[key] !== to[key]) swap.set(from[key], to[key]);
  }

  const remapColor = (value: string): string => {
    const direct = swap.get(value);
    if (direct !== undefined) return direct;
    // Alpha variant: match on the rgb channels, preserve the original alpha.
    const m = value.match(/^rgba?\(([^,]+),([^,]+),([^,)]+)(?:,\s*([\d.]+))?\)$/i);
    if (!m) return value;
    const baseRgb = `rgb(${m[1].trim()}, ${m[2].trim()}, ${m[3].trim()})`;
    const swapped = swap.get(baseRgb);
    if (swapped === undefined) return value;
    const alpha = m[4];
    return alpha === undefined ? swapped : withAlpha(swapped, Number(alpha));
  };

  const walk = (node: unknown): unknown => {
    if (typeof node === "string") return remapColor(node);
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object") {
      const next: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(node as Record<string, unknown>)) {
        // Functions (formatters/label callbacks) can't be cloned to the worker
        // and carry no theme color — keep the reference as-is.
        next[k] = typeof val === "function" ? val : walk(val);
      }
      return next;
    }
    return node;
  };

  return walk(option);
}

// ─── Hourly stacked-bar with ────────────────────────────

export function buildHourlyChartOption(data: HourlyRow[]): object {
  const byHour: Record<number, HourlyRow> = {};
  for (const r of data) byHour[r.hour] = r;

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const allHours = [...hours];
  const allLabels = allHours.map((h) => `${h}`.padStart(2, "0"));

  const legendData = ["Réussie", "Échec", "Autre"];

  const t = chartTheme();
  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      backgroundColor: t.tooltipBg,
      borderColor: t.tooltipBorder,
      textStyle: { color: t.tooltipText, fontSize: 11 },
      formatter: (ps: { name: string; value: number; seriesName: string }[]) => {
        const h = Number(ps[0]?.name);
        const row = byHour[h];
        if (!row) return `${h}:00`;
        const rate = row.total > 0 ? fmtPct((row.success / row.total) * 100) : "—";
        return [
          `<b>${h.toString().padStart(2, "0")}:00 – ${h.toString().padStart(2, "0")}:59</b>`,
          `Réussie: <span style="color:${t.success}">${fmtN(row.success)}</span>`,
          `Échec: <span style="color:${t.danger}">${fmtN(row.declined)}</span>`,
          `Taux: ${rate}`,
          `Montant: ${fmtAmount(row.amount)}`,
        ].join("<br/>");
      },
    },
    legend: {
      data: legendData,
      textStyle: { color: t.legendText, fontSize: 10 },
      top: 0,
      right: 0,
    },
    grid: { top: 28, right: 10, bottom: 24, left: 10, containLabel: true },
    xAxis: {
      type: "category",
      data: allLabels,
      axisLabel: { color: t.axisDim, fontSize: 9 },
      axisLine: { lineStyle: { color: t.splitLine } },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      axisLabel: { color: t.axisDim, fontSize: 9 },
      splitLine: { lineStyle: { color: t.splitLine } },
    },
    series: [
      {
        name: "Réussie",
        type: "bar",
        stack: "total",
        data: allHours.map((h) => byHour[h]?.success ?? 0),
        itemStyle: { color: t.success },
        barMaxWidth: 20,
      },
      {
        name: "Échec",
        type: "bar",
        stack: "total",
        data: allHours.map((h) => byHour[h]?.declined ?? 0),
        itemStyle: { color: t.danger },
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
        itemStyle: { color: t.warning, borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 20,
      },
    ],
  };
}

// ─── Status donut ─────────────────────────────────────────────────────────────

export function buildStatusDonutOption(data: StatusRow[]): object {
  const t = chartTheme();
  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "item",
      backgroundColor: t.tooltipBg,
      borderColor: t.tooltipBorder,
      textStyle: { color: t.tooltipText, fontSize: 11 },
      formatter: (p: { name: string; value: number; percent: number }) =>
        `${p.name}<br/>Nombre: <b>${fmtN(p.value)}</b><br/>Part: ${p.percent.toFixed(1)}%`,
    },
    legend: {
      orient: "vertical",
      right: 4,
      top: "center",
      textStyle: { color: t.legendText, fontSize: 10 },
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
        itemStyle: { borderColor: t.pieBorder, borderWidth: 3 },
        emphasis: {
          itemStyle: { shadowBlur: 8, shadowColor: "rgba(0,0,0,0.4)" },
        },
      },
    ],
  };
}

// ─── Canal share stacked bar ──────────────────────────────────────────────────

export function buildCanalShareOption(canals: CanalSummary[]): object {
  const sorted = [...canals].sort((a, b) => b.total - a.total);
  const t = chartTheme();
  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      backgroundColor: t.tooltipBg,
      borderColor: t.tooltipBorder,
      textStyle: { color: t.tooltipText, fontSize: 11 },
    },
    legend: {
      data: ["Réussie", "Échec", "Instance", "Remboursement"],
      textStyle: { color: t.legendText, fontSize: 10 },
      top: 0,
      right: 0,
    },
    grid: { top: 28, right: 10, bottom: 10, left: 10, containLabel: true },
    xAxis: {
      type: "value",
      axisLabel: { color: t.axisDim, fontSize: 9 },
      splitLine: { lineStyle: { color: t.splitLine } },
    },
    yAxis: {
      type: "category",
      data: sorted.map((c) => CANAL_CONFIG[c.key].shortLabel),
      axisLabel: { color: t.axisFg, fontSize: 10 },
    },
    series: [
      {
        name: "Réussie",
        type: "bar",
        stack: "s",
        data: sorted.map((c) => c.success),
        itemStyle: { color: t.success },
        barMaxWidth: 22,
      },
      {
        name: "Échec",
        type: "bar",
        stack: "s",
        data: sorted.map((c) => c.declined),
        itemStyle: { color: t.danger },
        barMaxWidth: 22,
      },
      {
        name: "Instance",
        type: "bar",
        stack: "s",
        data: sorted.map((c) => c.instance),
        itemStyle: { color: t.warning },
        barMaxWidth: 22,
      },
      {
        name: "Remboursement",
        type: "bar",
        stack: "s",
        data: sorted.map((c) => c.refund),
        itemStyle: { color: t.warning, borderRadius: [0, 3, 3, 0] },
        barMaxWidth: 22,
      },
    ],
  };
}

// ─── Revenue pie ──────────────────────────────────────────────────────────────

interface RevenueGroup {
  name: string;
  value: number;
  color: string;
}

export function buildRevenuePieOption(grouped: RevenueGroup[]): object {
  const t = chartTheme();
  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "item",
      backgroundColor: t.tooltipBg,
      borderColor: t.tooltipBorder,
      textStyle: { color: t.tooltipText, fontSize: 11 },
      formatter: (p: { name: string; value: number; percent: number }) =>
        `${p.name}<br/>${fmtAmount(p.value)} TND<br/>${p.percent.toFixed(1)}%`,
    },
    series: [
      {
        type: "pie",
        radius: ["32%", "62%"],
        data: grouped.map((g) => ({
          name: g.name,
          value: g.value,
          itemStyle: { color: g.color },
        })),
        label: { color: t.legendText, fontSize: 9 },
        itemStyle: { borderColor: t.pieBorder, borderWidth: 2 },
      },
    ],
  };
}

// ─── Success rate per-canal bar ───────────────────────────────────────────────

export function buildSuccessRateTrendOption(canals: CanalSummary[]): object {
  const sorted = [...canals].sort((a, b) => b.successRate - a.successRate);
  const t = chartTheme();
  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      backgroundColor: t.tooltipBg,
      borderColor: t.tooltipBorder,
      textStyle: { color: t.tooltipText, fontSize: 11 },
      formatter: (ps: { name: string; value: number }[]) =>
        `${ps[0]?.name}<br/>Taux de Réussite: <b>${ps[0]?.value.toFixed(1)}%</b>`,
    },
    grid: { top: 8, right: 60, bottom: 8, left: 8, containLabel: true },
    xAxis: {
      type: "value",
      min: 0,
      max: 100,
      axisLabel: {
        color: t.axisDim,
        fontSize: 9,
        formatter: (v: number) => `${v}%`,
      },
      splitLine: { lineStyle: { color: t.splitLine } },
    },
    yAxis: {
      type: "category",
      data: sorted.map((c) => CANAL_CONFIG[c.key].shortLabel),
      axisLabel: { color: t.axisFg, fontSize: 10 },
    },
    series: [
      {
        type: "bar",
        data: sorted.map((c) => ({
          value: c.successRate,
          itemStyle: {
            color: c.successRate >= 95 ? t.success : c.successRate >= 80 ? t.warning : t.danger,
            borderRadius: [0, 4, 4, 0],
          },
        })),
        barMaxWidth: 20,
        label: {
          show: true,
          position: "right",
          color: t.axisDim,
          fontSize: 10,
          formatter: (p: { value: number }) => `${p.value.toFixed(1)}%`,
        },
      },
    ],
  };
}

// ─── Anomaly timeline ─────────────────────────────────────────────────────────

type AnomalyPoint = { hour: number; zScore: number; type: "spike" | "drop" };

export function buildAnomalyTimelineOption(hourly: HourlyRow[], anomalies: AnomalyPoint[]): object {
  const anomalySet = new Map(anomalies.map((a) => [a.hour, a]));
  const byHour: Record<number, HourlyRow> = {};
  for (const r of hourly) byHour[r.hour] = r;
  const hours = Array.from({ length: 24 }, (_, i) => i);

  const t = chartTheme();
  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      backgroundColor: t.tooltipBg,
      borderColor: t.tooltipBorder,
      textStyle: { color: t.tooltipText, fontSize: 11 },
      formatter: (ps: Array<{ name: string; value: number }>) => {
        const h = Number(ps[0]?.name);
        const row = byHour[h];
        const anom = anomalySet.get(h);
        const parts = [
          `<b>${h.toString().padStart(2, "0")}:00</b>`,
          `Total: <b>${fmtN(row?.total ?? 0)}</b>`,
        ];
        if (anom)
          parts.push(
            `<span style="color:${t.warning}">⚠ Anomalie (z=${anom.zScore.toFixed(2)})</span>`,
          );
        return parts.join("<br/>");
      },
    },
    grid: { top: 28, right: 10, bottom: 24, left: 10, containLabel: true },
    xAxis: {
      type: "category",
      data: hours.map((h) => `${h}`.padStart(2, "0")),
      axisLabel: { color: t.axisDim, fontSize: 9 },
      axisLine: { lineStyle: { color: t.splitLine } },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      axisLabel: { color: t.axisDim, fontSize: 9 },
      splitLine: { lineStyle: { color: t.splitLine } },
    },
    series: [
      {
        name: "Volume",
        type: "bar",
        data: hours.map((h) => {
          const v = byHour[h]?.total ?? 0;
          const a = anomalySet.get(h);
          return {
            value: v,
            itemStyle: {
              color: a ? t.warning : t.primary,
              borderRadius: [3, 3, 0, 0],
            },
          };
        }),
        barMaxWidth: 20,
      },
      {
        name: "Échecs",
        type: "line",
        data: hours.map((h) => byHour[h]?.declined ?? 0),
        lineStyle: { color: t.danger, width: 1.5 },
        itemStyle: { color: t.danger },
        symbol: "none",
        smooth: true,
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: withAlpha(t.danger, 0.19) },
              { offset: 1, color: withAlpha(t.danger, 0) },
            ],
          },
        },
      },
    ],
  };
}

// ─── Risk score per-canal horizontal bar ─────────────────────────────────────

export function buildRiskScoreOption(canals: CanalSummary[]): object {
  const scored = canals
    .map((c) => ({ ...c, risk: computeCanalRiskScore(c) }))
    .sort((a, b) => b.risk - a.risk);
  const t = chartTheme();
  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      backgroundColor: t.tooltipBg,
      borderColor: t.tooltipBorder,
      textStyle: { color: t.tooltipText, fontSize: 11 },
      formatter: (ps: Array<{ name: string; value: number }>) =>
        `${ps[0]?.name}<br/>Score de Risque: <b>${ps[0]?.value}/100</b>`,
    },
    grid: { top: 8, right: 60, bottom: 8, left: 8, containLabel: true },
    xAxis: {
      type: "value",
      min: 0,
      max: 100,
      axisLabel: { color: t.axisDim, fontSize: 9 },
      splitLine: { lineStyle: { color: t.splitLine } },
    },
    yAxis: {
      type: "category",
      data: scored.map((c) => CANAL_CONFIG[c.key].shortLabel),
      axisLabel: { color: t.axisFg, fontSize: 10 },
    },
    series: [
      {
        type: "bar",
        barMaxWidth: 18,
        data: scored.map((c) => ({
          value: c.risk,
          itemStyle: {
            color: c.risk >= 40 ? t.danger : c.risk >= 20 ? t.warning : t.success,
            borderRadius: [0, 4, 4, 0],
          },
        })),
        label: {
          show: true,
          position: "right",
          color: t.axisDim,
          fontSize: 10,
          formatter: (p: { value: number }) => `${p.value}`,
        },
      },
    ],
  };
}

// ─── Group summary donut ──────────────────────────────────────────────────────

interface GroupItem {
  label: string;
  nombre: number;
  montant: number;
  color: string;
}

export function buildGroupSummaryDonutOption(data: GroupItem[]): object {
  const t = chartTheme();
  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "item",
      backgroundColor: t.tooltipBg,
      borderColor: t.tooltipBorder,
      textStyle: { color: t.tooltipText, fontSize: 11 },
      formatter: (p: { name: string; value: number; percent: number }) =>
        `<b>${p.name}</b><br/>Transactions : <b>${fmtN(p.value)}</b> (${p.percent.toFixed(1)}%)<br/>Montant : <b>${fmtAmount(data.find((d) => d.label === p.name)?.montant ?? 0)} DT</b>`,
    },
    legend: {
      orient: "vertical",
      right: 8,
      top: "center",
      textStyle: { color: t.legendText, fontSize: 10 },
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
        emphasis: {
          itemStyle: { shadowBlur: 8, shadowColor: "rgba(0,0,0,0.4)" },
          scale: true,
          scaleSize: 6,
        },
        data: data.map((d) => ({
          name: d.label,
          value: d.nombre,
          itemStyle: { color: d.color },
        })),
      },
    ],
  };
}

export function buildGroupSummaryHbarOption(data: GroupItem[]): object {
  const t = chartTheme();
  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      backgroundColor: t.tooltipBg,
      borderColor: t.tooltipBorder,
      textStyle: { color: t.tooltipText, fontSize: 11 },
      axisPointer: { type: "shadow" },
    },
    grid: { left: 140, right: 60, top: 6, bottom: 6, containLabel: false },
    xAxis: {
      type: "value",
      axisLabel: { color: t.axisDim, fontSize: 9 },
      splitLine: { lineStyle: { color: t.splitLine } },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: {
      type: "category",
      data: data.map((d) => d.label),
      axisLabel: {
        color: t.axisFg,
        fontSize: 10,
        width: 130,
        overflow: "truncate",
      },
      axisTick: { show: false },
      axisLine: { show: false },
    },
    series: [
      {
        type: "bar",
        data: data.map((d) => ({
          value: d.nombre,
          itemStyle: { color: d.color, borderRadius: [0, 4, 4, 0] },
        })),
        barMaxWidth: 18,
        label: {
          show: true,
          position: "right",
          color: t.legendText,
          fontSize: 9,
          formatter: (p: { value: number }) => (p.value > 0 ? fmtN(p.value) : ""),
        },
      },
    ],
  };
}

// ─── Canal comparison grouped bar ─────────────────────────────────────────────

interface CompareResult {
  label: string;
  nombre: number;
  montant: number;
  color: string;
}

export function buildCanalCompareBarOption(results: CompareResult[]): object {
  const t = chartTheme();
  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      backgroundColor: t.tooltipBg,
      borderColor: t.tooltipBorder,
      textStyle: { color: t.tooltipText, fontSize: 11 },
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
      axisLabel: {
        color: t.axisDim,
        fontSize: 9,
        rotate: 20,
        overflow: "truncate",
        width: 90,
      },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: t.splitLine } },
    },
    yAxis: {
      type: "value",
      axisLabel: { color: t.axisDim, fontSize: 9 },
      splitLine: { lineStyle: { color: t.splitLine } },
    },
    series: [
      {
        name: "Transactions réussies",
        type: "bar",
        data: results.map((r) => ({
          value: r.nombre,
          itemStyle: { color: r.color, borderRadius: [4, 4, 0, 0] },
        })),
        barMaxWidth: 40,
        label: {
          show: true,
          position: "top",
          color: t.legendText,
          fontSize: 9,
          formatter: (p: { value: number }) => fmtCompact(p.value),
        },
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
  for (const cell of data)
    canalTotals.set(cell.canal, (canalTotals.get(cell.canal) ?? 0) + cell.total);
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

  const t = chartTheme();
  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "item",
      backgroundColor: t.tooltipBg,
      borderColor: t.tooltipBorder,
      textStyle: { color: t.tooltipText, fontSize: 11 },
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
      axisLabel: { color: t.axisDim, fontSize: 9 },
      axisTick: { show: false },
    },
    yAxis: {
      type: "category",
      data: canals,
      axisLabel: {
        color: t.axisFg,
        fontSize: 9,
        width: 155,
        overflow: "truncate",
      },
      axisTick: { show: false },
      axisLine: { show: false },
    },
    visualMap:
      viewMode === "volume"
        ? {
            min: 0,
            max: maxVal,
            calculable: true,
            orient: "horizontal",
            right: 0,
            top: "middle",
            textStyle: { color: t.axisDim, fontSize: 9 },
            // low → high volume: theme surface → neutral → primary → foreground.
            inRange: {
              color: [t.tooltipBg, t.neutralBar, t.primary, t.axisFg],
            },
          }
        : {
            min: 0,
            max: 100,
            calculable: true,
            orient: "horizontal",
            right: 0,
            top: "middle",
            textStyle: { color: t.axisDim, fontSize: 9 },
            // low → high success rate: danger → warning → success.
            inRange: { color: [t.danger, t.warning, t.success] },
            text: ["100%", "0%"],
          },
    series: [
      {
        type: "heatmap",
        data: heatData.filter(([, , v]) => v !== -1),
        label: {
          show: canals.length <= 6,
          color: t.axisFg,
          fontSize: 8,
          formatter: (p: { data: [number, number, number] }) =>
            viewMode === "volume"
              ? p.data[2] > 0
                ? fmtCompact(p.data[2])
                : ""
              : p.data[2] >= 0
                ? `${p.data[2]}%`
                : "",
        },
        emphasis: {
          itemStyle: { shadowBlur: 6, shadowColor: "rgba(0,0,0,0.5)" },
        },
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
  const t = chartTheme();
  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      backgroundColor: t.tooltipBg,
      borderColor: t.tooltipBorder,
      textStyle: { color: t.tooltipText, fontSize: 11 },
      axisPointer: { type: "cross" },
    },
    legend: { top: 0, textStyle: { color: t.legendText, fontSize: 10 } },
    grid: { left: 16, right: 60, top: 28, bottom: 6, containLabel: true },
    xAxis: {
      type: "category",
      data: labels,
      axisLabel: { color: t.axisDim, fontSize: 9 },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: t.splitLine } },
    },
    yAxis: [
      {
        type: "value",
        name: "Transactions",
        nameTextStyle: { color: t.axisDim, fontSize: 9 },
        axisLabel: { color: t.axisDim, fontSize: 9 },
        splitLine: { lineStyle: { color: t.splitLine } },
      },
      {
        type: "value",
        name: "Taux %",
        min: 0,
        max: 100,
        nameTextStyle: { color: t.axisDim, fontSize: 9 },
        axisLabel: { color: t.axisDim, fontSize: 9, formatter: "{value}%" },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: "Total",
        type: "bar",
        large: true,
        largeThreshold: 2000,
        progressive: 4000,
        progressiveThreshold: 5000,
        data: data.map((r) => ({
          value: r.total,
          itemStyle: { color: t.neutralBar, borderRadius: [2, 2, 0, 0] },
        })),
        barMaxWidth: 32,
        stack: "tx",
      },
      {
        name: "Succès",
        type: "bar",
        large: true,
        largeThreshold: 2000,
        progressive: 4000,
        progressiveThreshold: 5000,
        data: data.map((r) => ({
          value: r.success,
          itemStyle: { color: t.success, borderRadius: [2, 2, 0, 0] },
        })),
        barMaxWidth: 32,
        stack: "tx",
      },
      {
        name: "Échecs",
        type: "bar",
        large: true,
        largeThreshold: 2000,
        progressive: 4000,
        progressiveThreshold: 5000,
        data: data.map((r) => ({
          value: r.declined,
          itemStyle: { color: t.danger, borderRadius: [2, 2, 0, 0] },
        })),
        barMaxWidth: 32,
        stack: "tx",
      },
      {
        name: "Taux succès",
        type: "line",
        yAxisIndex: 1,
        data: rates,
        smooth: true,
        sampling: "lttb",
        progressive: 4000,
        progressiveThreshold: 5000,
        lineStyle: { color: t.primary, width: 2 },
        itemStyle: { color: t.primary },
        symbol: "circle",
        symbolSize: 5,
        areaStyle: { color: withAlpha(t.primary, 0.06) },
      },
      ...(maValues.length > 0
        ? [
            {
              name: "Moy. mobile 3j",
              type: "line",
              data: maSeries,
              smooth: true,
              sampling: "lttb",
              progressive: 4000,
              progressiveThreshold: 5000,
              lineStyle: { color: t.warning, width: 1.5, type: "dashed" },
              itemStyle: { color: t.warning },
              symbol: "none",
              tooltip: {
                valueFormatter: (v: number | null) => (v != null ? fmtN(Math.round(v)) : "—"),
              },
            },
          ]
        : []),
    ],
  };
}

// ─── Customer profile hourly bar ──────────────────────────────────────────────

interface CustomerHourlyEntry {
  hour: number;
  total: number;
}

export function buildCustomerHourlyOption(hourly: CustomerHourlyEntry[], peakHour: number): object {
  const t = chartTheme();
  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      backgroundColor: t.tooltipBg,
      borderColor: t.tooltipBorder,
      textStyle: { color: t.tooltipText, fontSize: 10 },
    },
    grid: { left: 8, right: 8, top: 4, bottom: 16, containLabel: true },
    xAxis: {
      type: "category",
      data: Array.from({ length: 24 }, (_, i) => `${i}h`),
      axisLabel: { color: t.axisDim, fontSize: 8 },
      axisTick: { show: false },
      axisLine: { show: false },
    },
    yAxis: {
      type: "value",
      axisLabel: { show: false },
      splitLine: { lineStyle: { color: t.splitLine } },
    },
    series: [
      {
        type: "bar",
        data: Array.from({ length: 24 }, (_, h) => {
          const r = hourly.find((x) => x.hour === h);
          return {
            value: r?.total ?? 0,
            itemStyle: {
              color: h === peakHour ? t.ai : t.primary,
              borderRadius: [2, 2, 0, 0],
            },
          };
        }),
        barMaxWidth: 12,
      },
    ],
  };
}
