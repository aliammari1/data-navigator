"use client";

import ReactECharts from "echarts-for-react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Database,
  EyeOff,
  MoreHorizontal,
  Pin,
} from "lucide-react";
import type React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { TYPE_COLORS, TYPE_ICON } from "@/features/data-browser/model/constants";
import type {
  ColType,
  ColumnDef,
  ColumnStats,
  SortConfig,
} from "@/features/data-browser/model/types";
import { cn } from "@/shared/utils";
// ─── Sub-components ───────────────────────────────────────────────────────────

export function LoadingOverlay({ message = "Running query..." }: { message?: string }) {
  return (
    <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm flex flex-col items-center justify-center z-50 rounded-lg">
      <div className="flex flex-col items-center gap-3">
        <div className="relative">
          <div className="h-12 w-12 rounded-full border-2 border-emerald-500/30 border-t-emerald-500 animate-spin" />
          <Database className="absolute inset-0 m-auto h-5 w-5 text-emerald-400" />
        </div>
        <p className="text-sm text-zinc-300 font-medium">{message}</p>
        <p className="text-xs text-zinc-500">Powered by DuckDB WASM</p>
      </div>
    </div>
  );
}

export function DBStatusBadge({ initialized }: { initialized: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
        initialized
          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
          : "bg-amber-500/10 text-amber-400 border border-amber-500/20",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          initialized ? "bg-emerald-400 animate-pulse" : "bg-amber-400 animate-bounce",
        )}
      />
      {initialized ? "DuckDB Ready" : "Initializing…"}
    </div>
  );
}

export function ColumnTypeChip({ type }: { type: ColType }) {
  return (
    <span
      className={cn("inline-flex items-center gap-0.5 text-[10px] font-mono", TYPE_COLORS[type])}
    >
      {TYPE_ICON[type]}
      <span>{type}</span>
    </span>
  );
}

export function MiniSparkline({ data }: { data: number[] }) {
  if (data.length === 0) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const h = 28;
  const w = 80;
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`)
    .join(" ");
  return (
    <svg width={w} height={h} className="opacity-60">
      <polyline
        points={pts}
        fill="none"
        stroke="#10b981"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ColumnStatPanel({ stats, colDef }: { stats: ColumnStats; colDef: ColumnDef }) {
  if (stats.loading) {
    return (
      <div className="p-3 space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-4 bg-zinc-800 animate-pulse rounded" />
        ))}
      </div>
    );
  }

  const chartOption = {
    backgroundColor: "transparent",
    tooltip: { trigger: "axis", textStyle: { fontSize: 11 } },
    grid: { top: 4, right: 4, bottom: 4, left: 4, containLabel: true },
    xAxis: {
      type: "category",
      data: stats.histogram.map((h) => h.bucket),
      axisLabel: { fontSize: 9, color: "#71717a", rotate: 30 },
      axisLine: { lineStyle: { color: "#3f3f46" } },
    },
    yAxis: {
      type: "value",
      axisLabel: { fontSize: 9, color: "#71717a" },
      splitLine: { lineStyle: { color: "#27272a" } },
    },
    series: [
      {
        type: "bar",
        data: stats.histogram.map((h) => h.count),
        itemStyle: { color: "#10b981", borderRadius: [2, 2, 0, 0] },
      },
    ],
  };

  return (
    <div className="p-3 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-zinc-900 rounded-lg p-2">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wide">Min</div>
          <div className="text-xs font-mono text-zinc-200 truncate">{String(stats.min ?? "—")}</div>
        </div>
        <div className="bg-zinc-900 rounded-lg p-2">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wide">Max</div>
          <div className="text-xs font-mono text-zinc-200 truncate">{String(stats.max ?? "—")}</div>
        </div>
        {colDef.type === "number" && (
          <div className="bg-zinc-900 rounded-lg p-2">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wide">Avg</div>
            <div className="text-xs font-mono text-zinc-200">
              {typeof stats.avg === "number"
                ? new Intl.NumberFormat("en-US", {
                    maximumFractionDigits: 2,
                  }).format(stats.avg)
                : "—"}
            </div>
          </div>
        )}
        <div className="bg-zinc-900 rounded-lg p-2">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wide">Distinct</div>
          <div className="text-xs font-mono text-zinc-200">
            {stats.distinctCount.toLocaleString()}
          </div>
        </div>
        <div className="col-span-2 bg-zinc-900 rounded-lg p-2">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Null Rate</div>
          <Progress
            value={
              stats.nullCount > 0
                ? (stats.nullCount / (stats.nullCount + stats.distinctCount)) * 100
                : 0
            }
            className="h-1.5"
          />
          <div className="text-[10px] text-zinc-500 mt-1">{stats.nullCount} nulls</div>
        </div>
      </div>

      {stats.histogram.length > 0 && (
        <div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Distribution</div>
          <ReactECharts
            option={chartOption}
            style={{ height: 100 }}
            opts={{ renderer: "canvas" }}
          />
        </div>
      )}
    </div>
  );
}
// ─── Column Header Component ──────────────────────────────────────────────────

export interface ColumnHeaderProps {
  col: ColumnDef;
  sorts: SortConfig[];
  activeColStats: string | null;
  onSort: (name: string, e: React.MouseEvent) => void;
  onStats: () => void;
  onResize: (e: React.MouseEvent) => void;
  onPin: (dir: "left" | "right") => void;
  onHide: () => void;
  pinned: boolean;
}

export function ColumnHeader({
  col,
  sorts,
  activeColStats,
  onSort,
  onStats,
  onResize,
  onPin,
  onHide,
  pinned,
}: ColumnHeaderProps) {
  const sort = sorts.find((s) => s.column === col.name);
  const sortPriority = sorts.length > 1 ? sorts.findIndex((s) => s.column === col.name) + 1 : null;

  return (
    <div
      className={cn(
        "relative flex items-center gap-1 px-3 border-r border-zinc-800 group select-none",
        pinned && "bg-zinc-900/80 sticky left-0 z-10",
        activeColStats === col.id && "bg-emerald-500/5 border-b-emerald-500/30",
      )}
      style={{ width: col.width, minWidth: col.width, height: 36 }}
    >
      {/* Sort indicator */}
      <Button
        className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
        onClick={(e) => col.sortable && onSort(col.name, e)}
      >
        <span
          className={cn(
            "text-[11px] font-medium truncate",
            sort ? "text-zinc-200" : "text-zinc-400",
          )}
        >
          {col.name}
        </span>
        {sort ? (
          <span className="flex-none flex items-center gap-0.5 text-blue-400">
            {sort.direction === "asc" ? (
              <ArrowUp className="h-3 w-3" />
            ) : (
              <ArrowDown className="h-3 w-3" />
            )}
            {sortPriority && (
              <span className="text-[9px] bg-blue-500/20 rounded px-0.5">{sortPriority}</span>
            )}
          </span>
        ) : (
          <ArrowUpDown className="h-3 w-3 text-zinc-700 opacity-0 group-hover:opacity-100 flex-none" />
        )}
      </Button>

      {/* Type chip */}
      <span
        className={cn(
          "flex-none opacity-0 group-hover:opacity-100 transition-opacity",
          TYPE_COLORS[col.type],
        )}
      >
        {TYPE_ICON[col.type]}
      </span>

      {/* Column menu */}
      <DropdownMenu>
        <DropdownMenuTrigger className="flex-none opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center justify-center">
          <MoreHorizontal className="h-3.5 w-3.5 text-zinc-500 hover:text-zinc-300" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800 w-44">
          <DropdownMenuItem
            onClick={onStats}
            className="text-xs gap-2 text-zinc-300 focus:bg-zinc-800"
          >
            <Activity className="h-3.5 w-3.5 text-zinc-500" />
            {activeColStats === col.id ? "Hide" : "Show"} Stats
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-zinc-800" />
          <DropdownMenuItem
            onClick={() => onPin("left")}
            className="text-xs gap-2 text-zinc-300 focus:bg-zinc-800"
          >
            <Pin className="h-3.5 w-3.5 text-zinc-500" />
            {col.pinned === "left" ? "Unpin" : "Pin Left"}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => onPin("right")}
            className="text-xs gap-2 text-zinc-300 focus:bg-zinc-800"
          >
            <Pin className="h-3.5 w-3.5 rotate-90 text-zinc-500" />
            {col.pinned === "right" ? "Unpin" : "Pin Right"}
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-zinc-800" />
          <DropdownMenuItem
            onClick={onHide}
            className="text-xs gap-2 text-zinc-300 focus:bg-zinc-800"
          >
            <EyeOff className="h-3.5 w-3.5 text-zinc-500" />
            Hide Column
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Resize handle */}
      <button
        type="button"
        aria-label="Resize column"
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize opacity-0 group-hover:opacity-100 hover:bg-emerald-500/50 transition-opacity p-0 border-0 bg-transparent"
        onMouseDown={onResize}
      />
    </div>
  );
}
