"use client";

import { AtlasChip } from "@/design/primitives/chip";
import type { ClusterResult } from "@/features/auto-analyst/core/types";

const PALETTE = [
  "#a78bfa",
  "#60a5fa",
  "#34d399",
  "#fbbf24",
  "#f472b6",
  "#22d3ee",
];

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return Number.isInteger(n) ? n.toString() : n.toFixed(2);
}

export function StepSegmentation({ result }: { result: ClusterResult }) {
  const total = result.sizePerCluster.reduce((a, b) => a + b, 0);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-(--atlas-text)">
        <span className="font-semibold">{result.k} clusters</span>
        <AtlasChip severity="accent" size="sm">
          features: {result.features.join(", ")}
        </AtlasChip>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {result.centroids.map((c, i) => {
          const key = `cluster-${c.map((v) => v.toFixed(3)).join("|")}`;
          return (
            <div
              key={key}
              className="rounded-(--atlas-radius-3) border border-(--atlas-border) bg-(--atlas-surface) p-3"
              style={{
                borderLeftColor: PALETTE[i % PALETTE.length],
                borderLeftWidth: 4,
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-(--atlas-text)">
                  Cluster {i + 1}
                </span>
                <span className="text-xs text-(--atlas-text-subtle) tabular-nums">
                  {result.sizePerCluster[i]} ·{" "}
                  {((result.sizePerCluster[i] / total) * 100).toFixed(0)}%
                </span>
              </div>
              <div className="space-y-0.5">
                {c.map((v, f) => (
                  <div
                    key={result.features[f]}
                    className="flex justify-between text-[11px]"
                  >
                    <span className="text-(--atlas-text-subtle)">
                      {result.features[f]}
                    </span>
                    <span className="text-(--atlas-text) font-mono tabular-nums">
                      {fmt(v)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
