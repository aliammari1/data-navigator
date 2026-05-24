"use client";

import { Database, Hash, Type } from "lucide-react";
import { AtlasChip } from "@/design/primitives/chip";
import type { ColumnProfile } from "@/features/auto-analyst/core/types";

interface Props {
  profiles: ColumnProfile[];
}

const semanticIcon = {
  numeric: <Hash className="w-3 h-3" />,
  datetime: <Database className="w-3 h-3" />,
  categorical: <Type className="w-3 h-3" />,
  boolean: <Type className="w-3 h-3" />,
  text: <Type className="w-3 h-3" />,
  id: <Hash className="w-3 h-3" />,
} as const;

const semanticTone = {
  numeric: "success",
  datetime: "info",
  categorical: "accent",
  boolean: "info",
  text: "neutral",
  id: "warning",
} as const;

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return Number.isInteger(n) ? n.toString() : n.toFixed(2);
}

function MiniHist({ histogram }: { histogram: ColumnProfile["histogram"] }) {
  if (!histogram?.length) return null;
  const max = Math.max(...histogram.map((b) => b.count));
  return (
    <div className="flex items-end gap-px h-4 mt-1.5">
      {histogram.slice(0, 30).map((b) => (
        <div
          key={b.bucket}
          className="w-1 bg-(--atlas-accent) opacity-70 rounded-sm"
          style={{ height: `${Math.max(2, (b.count / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

export function StepProfile({ profiles }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
      {profiles.map((p) => {
        const tone =
          (semanticTone[p.semantic] as
            | "success"
            | "info"
            | "accent"
            | "warning"
            | "neutral") ?? "neutral";
        return (
          <div
            key={p.name}
            className="rounded-(--atlas-radius-3) border border-(--atlas-border) bg-(--atlas-surface) p-3 hover:border-(--atlas-accent-border) transition-colors"
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[13px] font-semibold text-(--atlas-text) truncate">
                {p.name}
              </span>
              <AtlasChip severity={tone} size="sm">
                <span className="inline-flex items-center gap-1">
                  {semanticIcon[p.semantic]}
                  {p.semantic}
                </span>
              </AtlasChip>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
              <div className="text-(--atlas-text-subtle)">distinct</div>
              <div className="text-right text-(--atlas-text) tabular-nums">
                {fmt(p.cardinality)}
              </div>
              <div className="text-(--atlas-text-subtle)">null %</div>
              <div
                className={`text-right tabular-nums ${
                  p.nullRate > 0.2
                    ? "text-(--atlas-warning-fg)"
                    : "text-(--atlas-text)"
                }`}
              >
                {(p.nullRate * 100).toFixed(1)}%
              </div>
              {p.semantic === "numeric" && (
                <>
                  <div className="text-(--atlas-text-subtle)">range</div>
                  <div className="text-right text-(--atlas-text) tabular-nums">
                    {fmt(Number(p.min))} → {fmt(Number(p.max))}
                  </div>
                  {p.avg !== undefined && (
                    <>
                      <div className="text-(--atlas-text-subtle)">
                        mean
                      </div>
                      <div className="text-right text-(--atlas-text) tabular-nums">
                        {fmt(p.avg)}
                      </div>
                    </>
                  )}
                </>
              )}
              {p.semantic === "datetime" && (
                <>
                  <div className="text-(--atlas-text-subtle)">first</div>
                  <div className="text-right text-(--atlas-text) truncate">
                    {String(p.min ?? "—").slice(0, 10)}
                  </div>
                  <div className="text-(--atlas-text-subtle)">last</div>
                  <div className="text-right text-(--atlas-text) truncate">
                    {String(p.max ?? "—").slice(0, 10)}
                  </div>
                </>
              )}
              {p.semantic === "categorical" && p.topValues?.[0] && (
                <>
                  <div className="text-(--atlas-text-subtle)">top</div>
                  <div className="text-right text-(--atlas-text) truncate">
                    {String(p.topValues[0].value).slice(0, 20)} (
                    {fmt(p.topValues[0].count)})
                  </div>
                </>
              )}
            </div>
            {p.semantic === "numeric" && <MiniHist histogram={p.histogram} />}
          </div>
        );
      })}
    </div>
  );
}
