"use client";

import { useMemo } from "react";
import type { WidgetTelecomData } from "@/features/desktop/components/widgets/use-widget-telecom-data";
import { fmtPct } from "@/features/telecom/lib/format";

interface StatusDonutWidgetProps {
  data: WidgetTelecomData;
  config: Record<string, unknown>;
}

const SEGMENTS = [
  { key: "success", label: "Réussite", color: "#22c55e" },
  { key: "declined", label: "Échec", color: "#ef4444" },
  { key: "refund", label: "Remb.", color: "#f59e0b" },
  { key: "pending", label: "Attente", color: "#94a3b8" },
] as const;

export function StatusDonutWidget({ data }: StatusDonutWidgetProps) {
  const kpi = data.kpi;

  const slices = useMemo(() => {
    if (!kpi) return [];
    const total = kpi.totalTransactions || 1;
    return [
      { ...SEGMENTS[0], count: kpi.successCount, pct: kpi.successCount / total },
      { ...SEGMENTS[1], count: kpi.declinedCount, pct: kpi.declinedCount / total },
      { ...SEGMENTS[2], count: kpi.refundCount, pct: kpi.refundCount / total },
      { ...SEGMENTS[3], count: kpi.instanceCount, pct: kpi.instanceCount / total },
    ].filter((s) => s.count > 0);
  }, [kpi]);

  const paths = useMemo(() => {
    const cx = 28;
    const cy = 28;
    const r = 22;
    const inner = 14;
    let angle = -Math.PI / 2;
    return slices.map((s) => {
      const sweep = s.pct * 2 * Math.PI;
      const x1 = cx + r * Math.cos(angle);
      const y1 = cy + r * Math.sin(angle);
      angle += sweep;
      const x2 = cx + r * Math.cos(angle);
      const y2 = cy + r * Math.sin(angle);
      const ix1 = cx + inner * Math.cos(angle);
      const iy1 = cy + inner * Math.sin(angle);
      const ix2 = cx + inner * Math.cos(angle - sweep);
      const iy2 = cy + inner * Math.sin(angle - sweep);
      const large = sweep > Math.PI ? 1 : 0;
      return {
        ...s,
        d: `M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large},1 ${x2.toFixed(2)},${y2.toFixed(2)} L${ix1.toFixed(2)},${iy1.toFixed(2)} A${inner},${inner} 0 ${large},0 ${ix2.toFixed(2)},${iy2.toFixed(2)} Z`,
      };
    });
  }, [slices]);

  return (
    <div className="flex h-full items-center gap-3 p-1">
      <svg width="56" height="56" viewBox="0 0 56 56" aria-label="Répartition des statuts">
        <title>Répartition des statuts</title>
        {paths.length === 0 ? (
          <circle
            cx="28"
            cy="28"
            r="22"
            fill="none"
            stroke="var(--glass-hairline)"
            strokeWidth="8"
          />
        ) : (
          paths.map((p) => <path key={p.key} d={p.d} fill={p.color} />)
        )}
        <circle cx="28" cy="28" r="10" fill="var(--glass-bg)" />
      </svg>
      <div className="flex flex-1 flex-col gap-1 overflow-hidden">
        <span
          className="text-[10px] font-medium uppercase tracking-wide"
          style={{ color: "var(--glass-text-dim)" }}
        >
          Statuts
        </span>
        {slices.slice(0, 3).map((s) => (
          <div key={s.key} className="flex items-center gap-1">
            <span className="size-1.5 shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="truncate text-[9px]" style={{ color: "var(--glass-text-dim)" }}>
              {s.label}
            </span>
            <span
              className="ml-auto text-[9px] tabular-nums font-medium"
              style={{ color: "var(--glass-text)" }}
            >
              {kpi ? fmtPct(s.pct * 100) : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
