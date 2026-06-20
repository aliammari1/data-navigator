"use client";

/**
 * Memoized pipeline step card.
 *
 * Config (label/type/enabled) and runtime (status/rows) are passed as separate
 * props so React.memo can skip re-rendering cards whose slice did not change.
 * Previously the whole `steps[]` array (config + status fused) flipped on every
 * per-step status write during a run, re-rendering all cards mid-execution.
 */

import {
  ArrowRight,
  BarChart2,
  ArrowUpDown,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Filter,
  Hash,
  Loader2,
  Merge,
  Sparkles,
  Split,
  Table2,
  Trash2,
  Type,
  XCircle,
} from "lucide-react";
import { memo } from "react";
import { cn } from "@/shared/utils";
import type { StepType } from "../engine/sql";
import type { StepRuntime } from "../engine/run";

export const STEP_COLORS: Record<StepType, string> = {
  filter: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  select: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  rename: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  derive: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  aggregate: "text-pink-400 bg-pink-500/10 border-pink-500/20",
  sort: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  deduplicate: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  limit: "text-zinc-400 bg-zinc-500/10 border-zinc-500/20",
  join: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
  pivot: "text-rose-400 bg-rose-500/10 border-rose-500/20",
};

export const STEP_ICONS: Record<StepType, React.ReactNode> = {
  filter: <Filter className="h-3.5 w-3.5" />,
  select: <Table2 className="h-3.5 w-3.5" />,
  rename: <Type className="h-3.5 w-3.5" />,
  derive: <Sparkles className="h-3.5 w-3.5" />,
  aggregate: <BarChart2 className="h-3.5 w-3.5" />,
  sort: <ArrowUpDown className="h-3.5 w-3.5" />,
  deduplicate: <Copy className="h-3.5 w-3.5" />,
  limit: <Hash className="h-3.5 w-3.5" />,
  join: <Merge className="h-3.5 w-3.5" />,
  pivot: <Split className="h-3.5 w-3.5" />,
};

interface StepCardProps {
  id: string;
  type: StepType;
  label: string;
  enabled: boolean;
  runtime: StepRuntime;
  isActive: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
}

function StepCardImpl({
  id,
  type,
  label,
  enabled,
  runtime,
  isActive,
  canMoveUp,
  canMoveDown,
  onSelect,
  onToggle,
  onDelete,
  onMove,
}: StepCardProps) {
  const { status, inputRows, outputRows, error } = runtime;
  return (
    <div
      className={cn(
        "group cursor-pointer rounded-xl border p-3 transition-colors",
        isActive
          ? "border-blue-500/40 bg-blue-500/5"
          : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700",
        !enabled && "opacity-50",
      )}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(id);
        }
      }}
    >
      <div className="flex items-center gap-2">
        <div className="flex flex-col gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMove(id, -1);
            }}
            disabled={!canMoveUp}
            className="text-zinc-600 hover:text-zinc-300 disabled:opacity-20"
          >
            <ChevronUp className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMove(id, 1);
            }}
            disabled={!canMoveDown}
            className="text-zinc-600 hover:text-zinc-300 disabled:opacity-20"
          >
            <ChevronDown className="h-3 w-3" />
          </button>
        </div>

        <div
          className={cn(
            "flex flex-none items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium",
            STEP_COLORS[type],
          )}
        >
          {STEP_ICONS[type]}
          <span className="uppercase">{type}</span>
        </div>

        <span className="flex-1 truncate text-xs text-zinc-300">{label}</span>

        <div className="flex flex-none items-center gap-1">
          {status === "done" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
          {status === "error" && <XCircle className="h-3.5 w-3.5 text-red-400" />}
          {status === "running" && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(id);
            }}
            className={cn(
              "h-5 w-8 flex-none rounded-full border transition-colors",
              enabled ? "border-emerald-500/30 bg-emerald-500/20" : "border-zinc-700 bg-zinc-800",
            )}
          >
            <span
              className={cn(
                "mx-auto block h-3.5 w-3.5 rounded-full transition-transform",
                enabled ? "translate-x-0 bg-emerald-400" : "bg-zinc-600",
              )}
            />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(id);
            }}
            className="text-zinc-600 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {status === "done" && (inputRows !== undefined || outputRows !== undefined) && (
        <div className="mt-2 flex items-center gap-2 text-[10px] text-zinc-500">
          <span>{(inputRows ?? 0).toLocaleString()} in</span>
          <ArrowRight className="h-2.5 w-2.5" />
          <span
            className={cn(
              outputRows !== undefined && inputRows !== undefined && outputRows < inputRows
                ? "text-amber-400"
                : "text-emerald-400",
            )}
          >
            {(outputRows ?? 0).toLocaleString()} out
          </span>
        </div>
      )}

      {status === "error" && error && (
        <p className="mt-1.5 truncate font-mono text-[10px] text-red-400">{error}</p>
      )}
    </div>
  );
}

export const StepCard = memo(StepCardImpl);
