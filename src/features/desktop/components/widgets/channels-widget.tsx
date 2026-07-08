"use client";

import { useMemo } from "react";
import type { WidgetTelecomData } from "@/features/desktop/components/widgets/use-widget-telecom-data";
import { fmtPct } from "@/features/telecom/lib/format";

/**
 * Channels widget — a compact share breakdown of the top transaction channels
 * (canaux) for the active telecom report, with a thin bar per channel coloured
 * by the canal's own palette colour.
 */
interface ChannelsWidgetProps {
  data: WidgetTelecomData;
  config: Record<string, unknown>;
}

export function ChannelsWidget({ data, config }: ChannelsWidgetProps) {
  const top = useMemo(() => {
    const limit = typeof config.limit === "number" ? config.limit : 4;
    return [...data.canals]
      .filter((c) => c.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, limit);
  }, [data.canals, config.limit]);

  const max = useMemo(() => Math.max(1, ...top.map((c) => c.total)), [top]);

  return (
    <div className="flex h-full flex-col gap-1.5 p-1">
      <span
        className="text-[10px] font-medium uppercase tracking-wide"
        style={{ color: "var(--glass-text-dim)" }}
      >
        Canaux
      </span>
      {top.length === 0 ? (
        <span className="text-[11px]" style={{ color: "var(--glass-text-dim)" }}>
          Aucune donnée
        </span>
      ) : (
        <div className="flex flex-1 flex-col justify-center gap-1.5">
          {top.map((c) => (
            <div key={c.key} className="flex flex-col gap-0.5">
              <div className="flex items-center justify-between gap-2">
                <span
                  className="truncate text-[10px] font-medium"
                  style={{ color: "var(--glass-text)" }}
                  title={c.label}
                >
                  {c.label}
                </span>
                <span
                  className="shrink-0 text-[10px] tabular-nums"
                  style={{ color: "var(--glass-text-dim)" }}
                >
                  {fmtPct(c.share)}
                </span>
              </div>
              <div
                className="h-1.5 overflow-hidden rounded-full"
                style={{ background: "var(--glass-hairline)" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(4, (c.total / max) * 100)}%`,
                    background: c.color || "hsl(var(--glass-accent))",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
