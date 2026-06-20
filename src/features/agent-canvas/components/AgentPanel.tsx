"use client";
import { cn } from "@/shared/utils";
import { ThoughtStream } from "./ThoughtStream";
import type {
  AgentPhase,
  AgentThought,
  DashboardPlan,
  WidgetState,
} from "@/features/agent-canvas/core/types";

const PHASE_LABEL: Record<AgentPhase, string> = {
  idle: "Idle",
  "model-load": "Loading Model",
  schema: "Analyzing Schema",
  plan: "Planning Dashboard",
  build: "Building Widgets",
  done: "Complete",
  error: "Error",
};

const PHASE_COLOR: Record<AgentPhase, string> = {
  idle: "text-slate-400",
  "model-load": "text-violet-400",
  schema: "text-cyan-400",
  plan: "text-amber-400",
  build: "text-blue-400",
  done: "text-emerald-400",
  error: "text-red-400",
};

interface Props {
  phase: AgentPhase;
  thoughts: AgentThought[];
  plan?: DashboardPlan;
  widgets: WidgetState[];
  className?: string;
}

const STATUS_DOT: Record<WidgetState["status"], string> = {
  pending: "bg-slate-600",
  querying: "bg-amber-400 animate-pulse",
  building: "bg-blue-400 animate-pulse",
  done: "bg-emerald-400",
  error: "bg-red-400",
};

export function AgentPanel({ phase, thoughts, plan, widgets, className }: Props) {
  const done = widgets.filter((w) => w.status === "done").length;
  const errored = widgets.filter((w) => w.status === "error").length;
  const total = widgets.length;

  return (
    <aside
      className={cn(
        "flex flex-col gap-0 bg-slate-900/80 border border-slate-700/50 rounded-2xl overflow-hidden",
        className,
      )}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            {phase !== "idle" && phase !== "done" && phase !== "error" && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
            )}
            <span
              className={cn(
                "relative inline-flex rounded-full h-2 w-2",
                phase === "done"
                  ? "bg-emerald-400"
                  : phase === "error"
                    ? "bg-red-400"
                    : phase === "idle"
                      ? "bg-slate-600"
                      : "bg-violet-400",
              )}
            />
          </span>
          <span className="text-xs font-semibold text-slate-200">Agent Pipeline</span>
        </div>
        <span className={cn("text-[11px] font-medium", PHASE_COLOR[phase])}>
          {PHASE_LABEL[phase]}
        </span>
      </div>

      {/* Widget progress */}
      {total > 0 && (
        <div className="px-4 py-2.5 border-b border-slate-700/30">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] text-slate-400">Widgets</span>
            <span className="text-[11px] text-slate-400">
              {done}/{total}
              {errored > 0 && <span className="text-red-400 ml-1">({errored} err)</span>}
            </span>
          </div>
          <div className="flex gap-1 flex-wrap">
            {widgets.map((w) => (
              <span
                key={w.spec.id}
                title={`${w.spec.title} — ${w.status}`}
                className={cn("w-2 h-2 rounded-full", STATUS_DOT[w.status])}
              />
            ))}
          </div>
          {total > 0 && (
            <div className="mt-2 h-1 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-violet-500 rounded-full transition-all duration-500"
                style={{ width: `${(done / total) * 100}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Plan summary */}
      {plan && (
        <div className="px-4 py-2.5 border-b border-slate-700/30">
          <p className="text-[11px] text-slate-400 mb-0.5">Dashboard</p>
          <p className="text-xs font-semibold text-white truncate">{plan.title}</p>
          {plan.description && (
            <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{plan.description}</p>
          )}
        </div>
      )}

      {/* Thought stream */}
      <div className="flex-1 px-3 py-2 min-h-0">
        <p className="text-[10px] text-slate-600 mb-1.5 font-semibold uppercase tracking-wider">
          Agent Log
        </p>
        <ThoughtStream thoughts={thoughts} className="h-full max-h-[420px]" />
      </div>
    </aside>
  );
}
