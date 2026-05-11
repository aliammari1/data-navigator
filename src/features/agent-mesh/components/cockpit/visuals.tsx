import type { Evidence } from "@/features/agent-mesh/core/types";
import { BarChart3 } from "lucide-react";
import type React from "react";
import { cn } from "@/shared/utils";
import { PLAN_MODES } from "./constants";
import { avgGrade, isRec, pct } from "./helpers";
import type { PlanMode } from "./types";
// ─── SVG Sparklines ───────────────────────────────────────────────────────────

export function LineSparkline({
  values,
  color = "#8b5cf6",
  height = 36,
}: {
  values: number[];
  color?: string;
  height?: number;
}) {
  if (values.length < 2) return null;
  const w = 160,
    h = height,
    pad = 2;
  const min = Math.min(...values),
    max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map(
    (v, i) =>
      [
        pad + (i / (values.length - 1)) * (w - pad * 2),
        h - pad - ((v - min) / range) * (h - pad * 2),
      ] as [number, number],
  );
  const line = `M ${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L ")}`;
  const fill = `${line} L ${pts[pts.length - 1][0].toFixed(1)},${h} L ${pts[0][0].toFixed(1)},${h} Z`;
  const uid = `sg-${color.replace("#", "")}-${h}`;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full"
      style={{ height: h }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fill} fill={`url(#${uid})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function BarSparkline({
  rows,
  height = 36,
}: {
  rows: Array<{ label: string; value: number; rate?: number }>;
  height?: number;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  const barH = height >= 120 ? "h-2" : "h-1.5";
  return (
    <div className="space-y-1.5">
      {rows.slice(0, height >= 120 ? 8 : 5).map((r) => (
        <div key={r.label} className="flex items-center gap-2 text-[10px]">
          <span className="w-24 shrink-0 truncate text-zinc-500">
            {r.label}
          </span>
          <div
            className={cn(
              "flex-1 overflow-hidden rounded-full bg-white/5",
              barH,
            )}
          >
            <div
              className={cn(
                "h-full rounded-full bg-zinc-300/50 transition-all",
                barH,
              )}
              style={{ width: `${(r.value / max) * 100}%` }}
            />
          </div>
          {r.rate !== undefined && (
            <span className="w-12 shrink-0 text-right font-mono text-zinc-400">
              {r.rate.toFixed(1)}%
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export function DonutMini({
  slices,
  size = 32,
}: {
  slices: Array<{ label: string; count: number }>;
  size?: number;
}) {
  const total = slices.reduce((a, s) => a + s.count, 0) || 1;
  const COLORS = ["#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#f43f5e"];
  return (
    <div className="flex items-center gap-3">
      <svg
        viewBox="0 0 32 32"
        className="shrink-0 -rotate-90"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        {
          slices.slice(0, 5).reduce<{ offset: number; els: React.ReactNode[] }>(
            (acc, s, i) => {
              const p = s.count / total;
              const dash = p * 100;
              acc.els.push(
                <circle
                  key={s.label}
                  cx="16"
                  cy="16"
                  r="13"
                  fill="none"
                  stroke={COLORS[i % COLORS.length]}
                  strokeWidth="4"
                  strokeDasharray={`${dash} ${100 - dash}`}
                  strokeDashoffset={-acc.offset}
                />,
              );
              acc.offset += dash;
              return acc;
            },
            { offset: 0, els: [] },
          ).els
        }
      </svg>
      <div className="min-w-0 flex-1 space-y-0.5">
        {slices.slice(0, size >= 56 ? 5 : 3).map((s, i) => (
          <div
            key={s.label}
            className="flex items-center justify-between gap-2 text-[10px]"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: COLORS[i % COLORS.length] }}
              />
              <span className="truncate text-zinc-500">{s.label}</span>
            </div>
            <span className="shrink-0 font-mono text-zinc-400">
              {s.count.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PeriodCompareTable({
  rows,
}: {
  rows: Array<{ metric: string; current: number; baseline: number }>;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-white/5">
      <table className="w-full text-[10px]">
        <thead>
          <tr className="border-b border-white/5">
            <th className="px-2 py-1 text-left font-medium text-zinc-600">
              Metric
            </th>
            <th className="px-2 py-1 text-right font-medium text-zinc-600">
              Now
            </th>
            <th className="px-2 py-1 text-right font-medium text-zinc-600">
              Before
            </th>
            <th className="px-2 py-1 text-right font-medium text-zinc-600">
              Change
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 4).map((r) => {
            const delta =
              r.baseline !== 0
                ? ((r.current - r.baseline) / Math.abs(r.baseline)) * 100
                : 0;
            const up = delta >= 0;
            return (
              <tr
                key={r.metric}
                className="border-b border-white/5 last:border-0"
              >
                <td className="px-2 py-1 text-zinc-500">{r.metric}</td>
                <td className="px-2 py-1 text-right font-mono text-zinc-300">
                  {r.current.toFixed(1)}
                </td>
                <td className="px-2 py-1 text-right font-mono text-zinc-600">
                  {r.baseline.toFixed(1)}
                </td>
                <td
                  className={cn(
                    "px-2 py-1 text-right font-mono",
                    up ? "text-emerald-400" : "text-rose-400",
                  )}
                >
                  {up ? "+" : ""}
                  {delta.toFixed(1)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ChartPreview({
  spec,
  large = false,
}: {
  spec: unknown;
  large?: boolean;
}) {
  if (!isRec(spec)) return null;
  const kind = typeof spec.kind === "string" ? spec.kind : "";
  const lineH = large ? 120 : 36;
  const barH = large ? 120 : 36;

  if (kind === "line" && Array.isArray(spec.data)) {
    const values = (spec.data as Record<string, unknown>[])
      .map((r) => Number(r.successRate))
      .filter(Number.isFinite);
    if (values.length < 2) return null;
    return (
      <div
        className={cn(
          "rounded-md border border-white/5 bg-black/20 p-2",
          large && "mt-0",
        )}
      >
        <LineSparkline values={values} height={lineH} />
      </div>
    );
  }
  if (kind === "bar" && Array.isArray(spec.data)) {
    const rows = (spec.data as Record<string, unknown>[])
      .slice(0, large ? 8 : 6)
      .map((r) => ({
        label: String(r.label ?? r.canal ?? ""),
        value: Number(r.total) || 0,
        rate: Number(r.successRate) || undefined,
      }));
    return (
      <div className="rounded-md border border-white/5 bg-black/20 p-2">
        <BarSparkline rows={rows} height={barH} />
      </div>
    );
  }
  if ((kind === "donut" || kind === "table") && Array.isArray(spec.data)) {
    const slices = (spec.data as Record<string, unknown>[])
      .slice(0, 5)
      .map((r) => ({
        label: String(r.status ?? r.code ?? r.label ?? "item"),
        count: Number(r.count) || 0,
      }));
    return (
      <div className="rounded-md border border-white/5 bg-black/20 p-2">
        <DonutMini slices={slices} size={large ? 56 : 32} />
      </div>
    );
  }
  if (kind === "period-compare" && Array.isArray(spec.rows)) {
    const rows = (spec.rows as Record<string, unknown>[])
      .slice(0, 4)
      .map((r) => ({
        metric: String(r.metric ?? ""),
        current: Number(r.current) || 0,
        baseline: Number(r.baseline) || 0,
      }));
    return <PeriodCompareTable rows={rows} />;
  }
  return null;
}

// ─── Plan Mode Selector ───────────────────────────────────────────────────────

export function PlanModeSelector({
  active,
  onChange,
  disabled,
}: {
  active: PlanMode;
  onChange: (m: PlanMode) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-0.5">
      {PLAN_MODES.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(value)}
          title={PLAN_MODES.find((m) => m.value === value)?.description}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-all duration-100",
            active === value
              ? "bg-white/8 text-zinc-100 ring-1 ring-white/15"
              : "text-zinc-600 hover:bg-white/4 hover:text-zinc-400",
            disabled && "pointer-events-none opacity-40",
          )}
        >
          <Icon className="h-3 w-3" />
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── KPI Bar ──────────────────────────────────────────────────────────────────
