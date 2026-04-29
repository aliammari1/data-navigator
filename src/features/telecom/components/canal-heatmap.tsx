"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import ReactECharts from "echarts-for-react";
import { cn } from "@/lib/utils";
import { buildCanalHeatmapOption } from "@/features/telecom/lib/chart-options";
import type * as Types from "@/features/telecom/types";

type FetchCanalHourlyMatrix = (
  m: Types.ColumnMapping,
) => Promise<Types.CanalHourCell[]>;

export function CanalHeatmap({
  m,
  fetchCanalHourlyMatrix,
}: {
  m: Types.ColumnMapping;
  fetchCanalHourlyMatrix: FetchCanalHourlyMatrix;
}) {
  const [data, setData] = useState<Types.CanalHourCell[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"volume" | "rate">("volume");

  // biome-ignore lint/correctness/useExhaustiveDependencies: m is stable after load
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchCanalHourlyMatrix(m)
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Calcul de la heatmap…
      </div>
    );
  }
  if (!data || data.length === 0) return null;

  const canalCount = new Set(data.map((c) => c.canal)).size;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex rounded-lg border border-border/60 overflow-hidden text-xs">
          {(["volume", "rate"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={cn(
                "px-3 py-1.5 transition-colors",
                viewMode === mode
                  ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300 font-semibold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {mode === "volume" ? "Volume" : "Taux de succès"}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-muted-foreground">
          {canalCount} canaux · 24 heures
        </span>
      </div>
      <div className="rounded-xl border border-border/50 bg-muted/10 overflow-x-auto">
        <ReactECharts
          option={buildCanalHeatmapOption(data, viewMode)}
          style={{
            height: `${Math.max(canalCount * 28 + 50, 200)}px`,
            minWidth: "600px",
          }}
          opts={{ renderer: "canvas" }}
        />
      </div>
    </div>
  );
}
