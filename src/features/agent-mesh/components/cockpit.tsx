"use client";

import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bot,
  Calendar,
  Check,
  ChevronDown,
  Clock,
  Code2,
  Copy,
  Database,
  Download,
  FileText,
  GitBranch,
  History,
  Layers,
  Loader2,
  Pin,
  PinOff,
  Play,
  Radio,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Square,
  Table2,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { runQuery } from "@/platform/duckdb/duckdb";
import { useTelecomStore } from "@/features/telecom/store";
import { createEmptyBlackboard } from "@/features/agent-mesh/core/blackboard";
import {
  clearAgentMeshRuns,
  createRunRecord,
  deleteAgentMeshRun,
  listAgentMeshRuns,
  saveAgentMeshRun,
  type AgentMeshRunRecord,
} from "@/features/agent-mesh/core/history";
import { createInvestigationPlan } from "@/features/agent-mesh/core/planner";
import { runAgentMesh } from "@/features/agent-mesh/core/runner";
import type {
  AgentMeshInput,
  BlackboardState,
  Evidence,
  InvestigationPlan,
  InvestigationTask,
  PlanExpansion,
} from "@/features/agent-mesh/core/types";
import {
  agentMeshLLM,
  DEFAULT_MODEL,
  type LlmStatus,
} from "@/features/agent-mesh/core/llm-client";
import { synthesizeWithLLM } from "@/features/agent-mesh/core/synthesis";
import { cn } from "@/shared/utils";
import {
  PHASE_CONFIG,
  SEVERITY_CONFIG,
  STATUS_CONFIG,
  TYPE_CONFIG,
} from "./cockpit/constants";
import { avgGrade, formatAge, formatMs, pct } from "./cockpit/helpers";
import type {
  EvidenceFilter,
  EvidenceSeverity,
  EvidenceType,
  MainTab,
  PlanMode,
  RightTab,
  TaskStatus,
} from "./cockpit/types";
import {
  BarSparkline,
  ChartPreview,
  DonutMini,
  LineSparkline,
  PeriodCompareTable,
  PlanModeSelector,
} from "./cockpit/visuals";

function KpiBar({ state }: { state: BlackboardState }) {
  const kpi = state.telecom.kpi;
  if (!kpi) return null;

  const successOk = kpi.successRate >= 95;
  const cells = [
    {
      label: "Transactions",
      value: kpi.totalTransactions.toLocaleString(),
      icon: BarChart3,
      trend: null,
    },
    {
      label: "Success Rate",
      value: `${kpi.successRate.toFixed(2)}%`,
      icon: successOk ? TrendingUp : TrendingDown,
      trend: successOk ? "up" : "down",
    },
    {
      label: "Declined",
      value: kpi.declinedCount.toLocaleString(),
      icon: AlertTriangle,
      trend: "warn",
    },
    {
      label: "Customers",
      value: kpi.uniqueCustomers.toLocaleString(),
      icon: Users,
      trend: null,
    },
    ...(typeof kpi.totalAmount === "number" && kpi.totalAmount > 0
      ? [
          {
            label: "Total Amount",
            value:
              kpi.totalAmount > 1e6
                ? `$${(kpi.totalAmount / 1e6).toFixed(1)}M`
                : `$${kpi.totalAmount.toLocaleString()}`,
            icon: Zap,
            trend: null as null,
          },
        ]
      : []),
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="shrink-0 border-b border-white/5 bg-[#0a0a0a]"
    >
      <div className="flex divide-x divide-white/5">
        {cells.map(({ label, value, icon: Icon, trend }) => (
          <div
            key={label}
            className="flex min-w-0 flex-1 items-center gap-2.5 px-4 py-2.5"
          >
            <div className="hidden shrink-0 items-center justify-center rounded-lg border border-white/8 bg-white/3 p-1.5 sm:flex">
              <Icon
                className={cn(
                  "h-3 w-3",
                  trend === "up"
                    ? "text-emerald-400"
                    : trend === "down"
                      ? "text-rose-400"
                      : trend === "warn"
                        ? "text-amber-400"
                        : "text-zinc-600",
                )}
              />
            </div>
            <div className="min-w-0">
              <div className="text-[9px] font-medium uppercase tracking-widest text-zinc-700">
                {label}
              </div>
              <div
                className={cn(
                  "mt-0.5 font-mono text-[14px] font-bold tabular-nums",
                  trend === "up"
                    ? "text-emerald-300"
                    : trend === "down"
                      ? "text-rose-300"
                      : "text-zinc-200",
                )}
              >
                {value}
              </div>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ─── Task Pipeline (Left Panel) ───────────────────────────────────────────────

function TaskRow({
  task,
  isLast,
}: {
  task: InvestigationTask;
  isLast: boolean;
}) {
  const cfg = STATUS_CONFIG[task.status];
  const duration =
    task.startedAt && task.finishedAt ? task.finishedAt - task.startedAt : null;

  return (
    <div className="flex items-start gap-2">
      <div
        className="flex shrink-0 flex-col items-center pt-0.5"
        style={{ width: 12 }}
      >
        <div
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full ring-1 ring-[#0a0a0a]",
            cfg.dot,
          )}
        />
        {!isLast && (
          <div className="mt-1 w-px flex-1 min-h-[10px] bg-white/5" />
        )}
      </div>
      <div className={cn("min-w-0 flex-1", isLast ? "pb-0" : "pb-2")}>
        <div className="flex items-center gap-1">
          {task.status === "running" && (
            <Loader2 className="h-2.5 w-2.5 shrink-0 animate-spin text-zinc-500" />
          )}
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[11px]",
              task.status === "done"
                ? "text-zinc-600 line-through decoration-zinc-700/50"
                : task.status === "running"
                  ? "font-medium text-zinc-200"
                  : task.status === "error"
                    ? "text-rose-400"
                    : "text-zinc-600",
            )}
          >
            {task.title}
          </span>
          {duration && (
            <span className="shrink-0 font-mono text-[9px] text-zinc-700">
              {formatMs(duration)}
            </span>
          )}
        </div>
        {task.injectionReason && (
          <div className="mt-0.5 text-[9px] leading-snug text-zinc-700">
            {task.injectionReason}
          </div>
        )}
        {task.error && (
          <p className="mt-0.5 text-[10px] text-rose-400 leading-tight">
            {task.error}
          </p>
        )}
      </div>
    </div>
  );
}

function PhaseGroup({
  phase,
  tasks,
  injected,
}: {
  phase: keyof typeof PHASE_CONFIG;
  tasks: InvestigationTask[];
  injected?: boolean;
}) {
  if (tasks.length === 0) return null;
  const cfg = PHASE_CONFIG[phase];
  const done = tasks.filter((t) => t.status === "done").length;
  const running = tasks.some((t) => t.status === "running");
  const fraction = tasks.length > 0 ? done / tasks.length : 0;

  return (
    <div className="mb-4">
      <div className="mb-1.5 flex items-center gap-1.5">
        {injected && (
          <span className="rounded border border-white/8 bg-white/3 px-1 py-px text-[8px] font-semibold uppercase tracking-widest text-zinc-600">
            ↻ adaptive
          </span>
        )}
        <span
          className={cn(
            "text-[10px] font-semibold uppercase tracking-widest",
            cfg.color,
          )}
        >
          {cfg.label}
        </span>
        <span className="ml-auto font-mono text-[9px] text-zinc-700">
          {done}/{tasks.length}
        </span>
      </div>
      <div className="mb-2 h-px overflow-hidden rounded-full bg-white/5">
        <motion.div
          className={cn(
            "h-full rounded-full",
            running
              ? "bg-zinc-400"
              : fraction === 1
                ? "bg-zinc-500"
                : "bg-white/15",
          )}
          animate={{ width: `${fraction * 100}%` }}
          transition={{ duration: 0.4 }}
        />
      </div>
      {tasks.map((t, i) => (
        <TaskRow key={t.id} task={t} isLast={i === tasks.length - 1} />
      ))}
    </div>
  );
}

function ExpansionBadge({ expansion }: { expansion: PlanExpansion }) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      className="mb-3 overflow-hidden"
    >
      <div className="flex items-start gap-2 rounded-lg border border-white/5 bg-white/2 px-2.5 py-2">
        <RefreshCw className="mt-0.5 h-2.5 w-2.5 shrink-0 text-zinc-600" />
        <div className="min-w-0">
          <div className="text-[9px] font-semibold uppercase tracking-widest text-zinc-600">
            Plan adapted
          </div>
          <div className="mt-0.5 text-[10px] leading-snug text-zinc-500">
            {expansion.reason}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function TaskPipeline({
  tasks,
  expansions,
  running,
  durationMs,
}: {
  tasks: InvestigationTask[];
  expansions: PlanExpansion[];
  running: boolean;
  durationMs: number;
}) {
  const byPhase = {
    foundation: tasks.filter((t) => t.phase === "foundation"),
    analysis: tasks.filter((t) => !t.phase || t.phase === "analysis"),
    "deep-dive": tasks.filter((t) => t.phase === "deep-dive"),
    synthesis: tasks.filter((t) => t.phase === "synthesis"),
  };

  const done = tasks.filter((t) => t.status === "done").length;
  const total = tasks.length;
  const pctDone = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="flex h-full flex-col">
      {/* progress header */}
      <div className="shrink-0 border-b border-white/5 px-4 py-3">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-[9px] font-medium uppercase tracking-widest text-zinc-700">
              Investigation
            </div>
            <div className="mt-0.5 text-[24px] font-bold tabular-nums leading-none text-zinc-200">
              {pctDone}
              <span className="text-[12px] text-zinc-600">%</span>
            </div>
          </div>
          {durationMs > 0 && (
            <div className="text-right">
              <div className="text-[9px] text-zinc-700">elapsed</div>
              <div className="font-mono text-[11px] text-zinc-500">
                {formatMs(durationMs)}
              </div>
            </div>
          )}
        </div>
        <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-white/5">
          <motion.div
            className="h-full rounded-full bg-zinc-300"
            animate={{ width: `${pctDone}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      </div>

      {/* phases */}
      <div className="flex-1 overflow-y-auto px-4 py-3 scrollbar-thin">
        <PhaseGroup phase="foundation" tasks={byPhase.foundation} />
        <PhaseGroup phase="analysis" tasks={byPhase.analysis} />

        {/* expansion badges appear between analysis and deep-dive */}
        <AnimatePresence>
          {expansions.map((exp) => (
            <ExpansionBadge key={exp.at} expansion={exp} />
          ))}
        </AnimatePresence>

        <PhaseGroup
          phase="deep-dive"
          tasks={byPhase["deep-dive"]}
          injected={byPhase["deep-dive"].length > 0}
        />
        <PhaseGroup phase="synthesis" tasks={byPhase.synthesis} />

        {!running && total === 0 && (
          <p className="py-6 text-center text-[11px] leading-relaxed text-zinc-700">
            Steps will appear here when you run the analysis.
          </p>
        )}
      </div>

      <AnimatePresence>
        {running && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="shrink-0 flex items-center gap-2 border-t border-white/5 bg-[#0a0a0a] px-4 py-2.5"
          >
            <RefreshCw className="h-3 w-3 animate-spin text-zinc-600" />
            <span className="text-[11px] text-zinc-600">Analyzing…</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Banners ──────────────────────────────────────────────────────────────────

function ScanningBanner({ tasks }: { tasks: InvestigationTask[] }) {
  const done = tasks.filter((t) => t.status === "done").length;
  const total = tasks.length;
  const current = tasks.find((t) => t.status === "running");
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative mx-4 mt-4 shrink-0 overflow-hidden rounded-2xl border border-white/8 bg-[#161616] px-5 py-4"
    >
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden="true"
      >
        <div className="absolute h-px w-full bg-linear-to-r from-transparent via-zinc-300/15 to-transparent animate-[scan-line_2.5s_linear_infinite]" />
      </div>
      <div className="relative flex items-center gap-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5">
          <Loader2 className="h-4 w-4 animate-spin text-zinc-300" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-zinc-200">
            Analyzing your data…
          </div>
          <div className="mt-0.5 truncate text-[11px] text-zinc-600">
            {current ? current.title : "Preparing…"}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[18px] font-bold tabular-nums leading-none text-zinc-300">
            {total > 0 ? Math.round((done / total) * 100) : 0}
            <span className="text-[11px] text-zinc-600">%</span>
          </div>
          <div className="mt-0.5 text-[9px] text-zinc-700">
            {done}/{total} steps
          </div>
        </div>
      </div>
      <div className="relative mt-3 h-0.5 overflow-hidden rounded-full bg-white/5">
        <motion.div
          className="h-full bg-zinc-200"
          animate={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
          transition={{ duration: 0.4 }}
        />
      </div>
    </motion.div>
  );
}

function SynthesisBanner() {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className="mx-4 mt-4 shrink-0 flex items-center gap-3 rounded-xl border border-white/8 bg-[#161616] px-4 py-3"
    >
      <Sparkles className="h-3.5 w-3.5 shrink-0 animate-pulse text-zinc-400" />
      <span className="text-[12px] text-zinc-400">
        AI is writing the insight…
      </span>
    </motion.div>
  );
}

function HeroInsight({ state }: { state: BlackboardState }) {
  const headline = state.decisions.headline;
  const kpi = state.telecom.kpi;
  const avgConf = state.evidence.items.length
    ? state.evidence.items.reduce((s, e) => s + avgGrade(e), 0) /
      state.evidence.items.length
    : 0;
  if (!headline && !kpi) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-4 mt-4 shrink-0 overflow-hidden rounded-2xl border border-white/8 bg-[#161616]"
    >
      {headline && (
        <div className="border-b border-white/5 px-5 py-4">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-zinc-500" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
              Top Insight
            </span>
            {avgConf > 0 && (
              <span className="ml-auto rounded-full border border-white/8 bg-white/4 px-2 py-0.5 text-[9px] font-mono text-zinc-500">
                {pct(avgConf)} reliable
              </span>
            )}
          </div>
          <p className="text-[14px] font-semibold leading-snug text-zinc-100">
            {headline}
          </p>
        </div>
      )}
      {kpi && (
        <div className="grid grid-cols-3 divide-x divide-white/5">
          {(
            [
              ["Transactions", kpi.totalTransactions.toLocaleString()],
              ["Success Rate", `${kpi.successRate.toFixed(2)}%`],
              ["Customers", kpi.uniqueCustomers.toLocaleString()],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="px-4 py-3">
              <div className="text-[9px] text-zinc-600">{label}</div>
              <div className="mt-0.5 font-mono text-[13px] font-bold text-zinc-200">
                {value}
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ─── Findings Tab ─────────────────────────────────────────────────────────────

function EvidenceCard({
  evidence,
  selected,
  pinned,
  index,
  onSelect,
  onTogglePin,
}: {
  evidence: Evidence;
  selected?: boolean;
  pinned?: boolean;
  index: number;
  onSelect: () => void;
  onTogglePin: () => void;
}) {
  const sev = SEVERITY_CONFIG[evidence.severity];
  const typ = TYPE_CONFIG[evidence.type];
  const Icon = typ.icon;
  const avg = avgGrade(evidence);
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.28 }}
      onClick={onSelect}
      className={cn(
        "group relative cursor-pointer overflow-hidden rounded-2xl border border-l-[3px] bg-[#161616] transition-all duration-150",
        sev.border,
        selected
          ? "border-white/15 shadow-sm shadow-white/5"
          : "border-white/6 hover:border-white/12 hover:bg-[#191919]",
      )}
    >
      <div className="p-4">
        <div className="mb-2.5 flex items-center gap-2">
          <div
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg",
              typ.color,
            )}
          >
            <Icon className="h-3 w-3" />
          </div>
          <span className="text-[10px] font-medium text-zinc-600">
            {typ.label}
          </span>
          <span
            className={cn(
              "ml-auto shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-medium",
              sev.badge,
            )}
          >
            {sev.label}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin();
            }}
            className={cn(
              "shrink-0 rounded p-0.5 transition-all",
              pinned
                ? "text-zinc-200"
                : "text-zinc-700 opacity-0 group-hover:opacity-100 hover:text-zinc-400",
            )}
          >
            {pinned ? (
              <Pin className="h-3 w-3" />
            ) : (
              <PinOff className="h-3 w-3" />
            )}
          </button>
        </div>
        <h3 className="text-[13px] font-semibold leading-snug text-zinc-100">
          {evidence.title}
        </h3>
        <p className="mt-1.5 line-clamp-3 text-[11px] leading-relaxed text-zinc-500">
          {evidence.claim}
        </p>
        <ChartPreview spec={evidence.chartSpec} />
        <div className="mt-3.5 flex items-center gap-2.5 border-t border-white/5 pt-3">
          <div className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-white/28 transition-all"
              style={{ width: `${avg * 100}%` }}
            />
          </div>
          <span className="shrink-0 text-[9px] font-mono text-zinc-600">
            {pct(avg)} reliable
          </span>
        </div>
      </div>
      {selected && (
        <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/8" />
      )}
    </motion.div>
  );
}

const EVIDENCE_FILTER_LABELS: Array<{ value: EvidenceFilter; label: string }> =
  [
    { value: "all", label: "All" },
    { value: "fact", label: "Metrics" },
    { value: "finding", label: "Findings" },
    { value: "chart", label: "Charts" },
    { value: "anomaly", label: "Alerts" },
    { value: "recommendation", label: "Actions" },
  ];

function FindingsTab({
  items,
  pinnedIds,
  selectedId,
  running,
  onSelect,
  onTogglePin,
  onRun,
}: {
  items: Evidence[];
  pinnedIds: string[];
  selectedId?: string;
  running: boolean;
  onSelect: (id: string) => void;
  onTogglePin: (id: string) => void;
  onRun: () => void;
}) {
  const [filter, setFilter] = useState<EvidenceFilter>("all");
  const filtered = useMemo(
    () => (filter === "all" ? items : items.filter((e) => e.type === filter)),
    [items, filter],
  );

  return (
    <div className="flex h-full flex-col">
      {items.length > 0 && (
        <div className="shrink-0 border-b border-white/5 px-4 py-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-0.5">
              {EVIDENCE_FILTER_LABELS.map(({ value, label }) => {
                const count =
                  value === "all"
                    ? items.length
                    : items.filter((e) => e.type === value).length;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFilter(value)}
                    className={cn(
                      "flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-all duration-100",
                      filter === value
                        ? "bg-white/6 text-zinc-200"
                        : "text-zinc-600 hover:text-zinc-400",
                    )}
                  >
                    {label}
                    {count > 0 && (
                      <span
                        className={cn(
                          "rounded-full px-1 py-px text-[9px] font-mono",
                          filter === value
                            ? "bg-white/10 text-zinc-400"
                            : "text-zinc-700",
                        )}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <span className="shrink-0 text-[10px] text-zinc-700">
              {filtered.length} result{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
        <AnimatePresence mode="wait">
          {items.length === 0 && !running ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-24 text-center"
            >
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/6 bg-[#161616]">
                <Radio className="h-7 w-7 text-zinc-700" />
              </div>
              <h3 className="text-[14px] font-semibold text-zinc-300">
                Ready to analyze
              </h3>
              <p className="mt-2 max-w-xs text-[12px] leading-relaxed text-zinc-600">
                Load a telecom CSV and press Analyze. The system will
                automatically find insights, trends, and anomalies.
              </p>
              <button
                type="button"
                onClick={onRun}
                className="mt-6 flex items-center gap-2 rounded-xl bg-zinc-100 px-5 py-2.5 text-[12px] font-semibold text-zinc-900 shadow-sm transition-all hover:bg-white active:scale-95"
              >
                <Play className="h-3.5 w-3.5" />
                Analyze Now
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="cards"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="grid gap-3 2xl:grid-cols-2"
            >
              {filtered.map((e, i) => (
                <EvidenceCard
                  key={e.id}
                  evidence={e}
                  index={i}
                  selected={e.id === selectedId}
                  pinned={pinnedIds.includes(e.id)}
                  onSelect={() => onSelect(e.id)}
                  onTogglePin={() => onTogglePin(e.id)}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Analysis Tab ─────────────────────────────────────────────────────────────

function AnalysisCard({ evidence }: { evidence: Evidence }) {
  const sev = SEVERITY_CONFIG[evidence.severity];
  const typ = TYPE_CONFIG[evidence.type];
  const Icon = typ.icon;
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-white/8 bg-[#161616]">
      <div className="flex items-start gap-3 border-b border-white/5 px-4 py-3">
        <div
          className={cn(
            "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg",
            typ.color,
          )}
        >
          <Icon className="h-3 w-3" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "rounded border px-1.5 py-0.5 text-[9px] font-medium",
                sev.badge,
              )}
            >
              {sev.label}
            </span>
            <span className="text-[9px] text-zinc-600">{typ.label}</span>
          </div>
          <h3 className="mt-1 text-[12px] font-semibold leading-snug text-zinc-100">
            {evidence.title}
          </h3>
          <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">
            {evidence.claim}
          </p>
        </div>
      </div>
      <div className="flex-1 px-4 py-4">
        <ChartPreview spec={evidence.chartSpec} large />
      </div>
    </div>
  );
}

function AnalysisTab({ evidence }: { evidence: Evidence[] }) {
  const chartItems = evidence.filter(
    (e) => e.chartSpec != null && e.type !== "lineage" && e.type !== "table",
  );
  if (chartItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <BarChart3 className="mb-3 h-8 w-8 text-zinc-800" />
        <p className="text-[12px] text-zinc-600">
          Charts will appear here once analysis completes.
        </p>
      </div>
    );
  }
  return (
    <div className="grid gap-4 p-4 xl:grid-cols-2">
      {chartItems.map((e) => (
        <AnalysisCard key={e.id} evidence={e} />
      ))}
    </div>
  );
}

// ─── Data Tab ─────────────────────────────────────────────────────────────────

function DataTab({
  activeTable,
  rowCount,
}: {
  activeTable?: string;
  rowCount?: number;
}) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [cols, setCols] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(100);

  useEffect(() => {
    if (!activeTable) return;
    setLoading(true);
    setError(null);
    runQuery(`SELECT * FROM "${activeTable}" LIMIT ${limit}`)
      .then((data) => {
        setRows(data);
        if (data.length > 0) setCols(Object.keys(data[0]));
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [activeTable, limit]);

  if (!activeTable) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Database className="mb-3 h-8 w-8 text-zinc-800" />
        <p className="text-[12px] text-zinc-600">
          Run the analysis to preview raw data.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 flex items-center gap-3 border-b border-white/5 px-4 py-2">
        <span className="font-mono text-[11px] text-zinc-500">
          {activeTable}
        </span>
        {rowCount != null && (
          <span className="text-[10px] text-zinc-700">
            · {rowCount.toLocaleString()} rows total
          </span>
        )}
        <span className="text-[10px] text-zinc-700">
          · showing {rows.length}
        </span>
        {loading && <Loader2 className="h-3 w-3 animate-spin text-zinc-600" />}
        <div className="ml-auto flex items-center gap-1">
          {[50, 100, 500].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setLimit(n)}
              className={cn(
                "rounded px-2 py-0.5 text-[10px] transition-all",
                limit === n
                  ? "bg-white/8 text-zinc-300"
                  : "text-zinc-600 hover:text-zinc-400",
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      {error ? (
        <div className="p-4 text-[11px] text-rose-400">{error}</div>
      ) : rows.length === 0 && !loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-zinc-700">
          <p className="text-[12px]">No rows returned.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse text-[11px]">
            <thead className="sticky top-0 z-10 bg-[#0a0a0a]">
              <tr className="border-b border-white/5">
                {cols.map((c) => (
                  <th
                    key={c}
                    className="whitespace-nowrap px-3 py-2 text-left font-medium text-zinc-600"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-white/3 transition-colors hover:bg-white/2"
                >
                  {cols.map((c) => (
                    <td
                      key={c}
                      className="whitespace-nowrap px-3 py-1.5 font-mono text-zinc-500 max-w-[200px] truncate"
                    >
                      {String(row[c] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Report Tab ───────────────────────────────────────────────────────────────

function ReportTab({ state }: { state: BlackboardState }) {
  const draft = state.decisions.reportDraft;
  const [copied, setCopied] = useState(false);

  function buildMarkdown() {
    if (!draft) return "";
    return [
      `# ${draft.title}`,
      `> Generated: ${new Date(draft.generatedAt).toLocaleString()}`,
      state.dataset.activeTable ? `> Table: ${state.dataset.activeTable}` : "",
      "",
      "## Executive Summary",
      draft.executiveSummary,
      "",
      "## Key Findings",
      ...draft.keyFindings.map((f, i) => `${i + 1}. ${f}`),
      "",
      "## Recommended Actions",
      ...draft.recommendedActions.map((a, i) => `${i + 1}. ${a}`),
      "",
      "## Caveats",
      ...(draft.caveats.length
        ? draft.caveats.map((c) => `- ${c}`)
        : ["None."]),
    ]
      .filter(Boolean)
      .join("\n");
  }

  async function copyMarkdown() {
    const t = buildMarkdown();
    if (!t || typeof navigator === "undefined") return;
    await navigator.clipboard.writeText(t);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  function downloadJson() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            decisions: state.decisions,
            kpi: state.telecom.kpi,
            evidence: state.evidence.items.length,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!draft) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <FileText className="mb-3 h-8 w-8 text-zinc-800" />
        <p className="text-[12px] text-zinc-600">
          The full report will appear here after the analysis completes.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {/* title + export actions */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-semibold text-zinc-100">
            {draft.title}
          </h2>
          <p className="mt-0.5 text-[10px] text-zinc-600">
            {new Date(draft.generatedAt).toLocaleString()} ·{" "}
            {draft.evidenceIds.length} findings ·{" "}
            {draft.recommendedActions.length} actions
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={copyMarkdown}
            className="flex items-center gap-1.5 rounded-lg border border-white/8 bg-white/3 px-2.5 py-1.5 text-[11px] text-zinc-400 hover:border-white/15 hover:text-zinc-200 transition-all"
          >
            {copied ? (
              <Check className="h-3 w-3 text-emerald-400" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
            {copied ? "Copied!" : "Markdown"}
          </button>
          <button
            type="button"
            onClick={downloadJson}
            className="flex items-center gap-1.5 rounded-lg border border-white/8 bg-white/3 px-2.5 py-1.5 text-[11px] text-zinc-400 hover:border-white/15 hover:text-zinc-200 transition-all"
          >
            <Download className="h-3 w-3" />
            JSON
          </button>
        </div>
      </div>

      {/* executive summary */}
      <div className="rounded-xl border border-white/8 bg-white/2 p-4">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
          Executive Summary
        </div>
        <p className="text-[12px] leading-relaxed text-zinc-400">
          {draft.executiveSummary}
        </p>
      </div>

      {/* key findings */}
      {draft.keyFindings.length > 0 && (
        <div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-700">
            Key Findings
          </div>
          <div className="space-y-2">
            {draft.keyFindings.map((f, i) => (
              <div
                key={f}
                className="flex items-start gap-3 rounded-lg border border-white/5 bg-[#161616] px-3 py-2.5"
              >
                <span className="mt-0.5 shrink-0 font-mono text-[9px] text-zinc-700">
                  {i + 1}
                </span>
                <span className="text-[11px] text-zinc-400">{f}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* actions */}
      {draft.recommendedActions.length > 0 && (
        <div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-700">
            Recommended Actions
          </div>
          <div className="space-y-1.5">
            {draft.recommendedActions.map((a) => (
              <div
                key={a}
                className="flex items-start gap-3 rounded-lg border border-white/5 bg-[#161616] px-3 py-2.5"
              >
                <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-zinc-600" />
                <span className="text-[11px] text-zinc-500">{a}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* caveats */}
      {draft.caveats.length > 0 && (
        <div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-700">
            Caveats
          </div>
          {draft.caveats.map((c) => (
            <div
              key={c}
              className="rounded-lg border border-amber-500/15 bg-amber-500/5 px-2.5 py-2 text-[11px] text-amber-400 mb-1.5"
            >
              {c}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Investigation Canvas (center with 4 tabs) ────────────────────────────────

function InvestigationCanvas({
  state,
  running,
  synthesizing,
  tasks,
  pinnedIds,
  selectedId,
  onSelect,
  onTogglePin,
  onRun,
}: {
  state: BlackboardState;
  running: boolean;
  synthesizing: boolean;
  tasks: InvestigationTask[];
  pinnedIds: string[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onTogglePin: (id: string) => void;
  onRun: () => void;
}) {
  const [tab, setTab] = useState<MainTab>("findings");
  const items = state.evidence.items;
  const chartCount = items.filter((e) => e.chartSpec != null).length;

  const TABS: Array<{
    key: MainTab;
    label: string;
    icon: React.ElementType;
    count?: number;
  }> = [
    { key: "findings", label: "Findings", icon: Zap, count: items.length },
    {
      key: "analysis",
      label: "Analysis",
      icon: BarChart3,
      count: chartCount > 0 ? chartCount : undefined,
    },
    { key: "data", label: "Data", icon: Table2, count: state.dataset.rowCount },
    { key: "report", label: "Report", icon: FileText },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* banners */}
      <AnimatePresence>
        {running && <ScanningBanner tasks={tasks} />}
      </AnimatePresence>
      <AnimatePresence>
        {synthesizing && !running && <SynthesisBanner />}
      </AnimatePresence>
      {!running && !synthesizing && <HeroInsight state={state} />}

      {/* tab bar */}
      <div className="shrink-0 border-b border-white/5 px-4">
        <div className="flex gap-0">
          {TABS.map(({ key, label, icon: Icon, count }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                "flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[11px] font-medium transition-all duration-100",
                tab === key
                  ? "border-zinc-200 text-zinc-200"
                  : "border-transparent text-zinc-600 hover:text-zinc-400",
              )}
            >
              <Icon className="h-3 w-3" />
              {label}
              {count != null && count > 0 && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-px text-[9px] font-mono",
                    tab === key
                      ? "bg-white/10 text-zinc-400"
                      : "bg-white/4 text-zinc-700",
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* content */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "findings" && (
          <FindingsTab
            items={items}
            pinnedIds={pinnedIds}
            selectedId={selectedId}
            running={running}
            onSelect={onSelect}
            onTogglePin={onTogglePin}
            onRun={onRun}
          />
        )}
        {tab === "analysis" && <AnalysisTab evidence={items} />}
        {tab === "data" && (
          <DataTab
            activeTable={state.dataset.activeTable}
            rowCount={state.dataset.rowCount}
          />
        )}
        {tab === "report" && <ReportTab state={state} />}
      </div>
    </div>
  );
}

// ─── Right Panel ──────────────────────────────────────────────────────────────

function SummaryPanel({ state }: { state: BlackboardState }) {
  const kpi = state.telecom.kpi;
  const confidence = state.evidence.items.length
    ? state.evidence.items.reduce((s, e) => s + avgGrade(e), 0) /
      state.evidence.items.length
    : 0;
  const confColor =
    confidence >= 0.75
      ? "text-emerald-400"
      : confidence >= 0.5
        ? "text-amber-400"
        : "text-rose-400";

  return (
    <div className="space-y-5 px-4 py-4">
      <div className="rounded-xl border border-white/8 bg-white/3 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Bot className="h-3.5 w-3.5 text-zinc-500" />
          <span className="text-[11px] font-semibold text-zinc-300">
            AI Summary
          </span>
          {confidence > 0 && (
            <span
              className={cn(
                "ml-auto font-mono text-[11px] font-semibold",
                confColor,
              )}
            >
              {pct(confidence)} reliable
            </span>
          )}
        </div>
        <p className="text-[12px] leading-relaxed text-zinc-400">
          {state.decisions.headline ??
            "Run the analysis to get an AI-generated summary of your telecom data."}
        </p>
        {confidence > 0 && (
          <div className="mt-3 h-0.5 overflow-hidden rounded-full bg-white/5">
            <motion.div
              className={cn(
                "h-full rounded-full",
                confidence >= 0.75
                  ? "bg-emerald-500"
                  : confidence >= 0.5
                    ? "bg-amber-500"
                    : "bg-rose-500",
              )}
              animate={{ width: `${confidence * 100}%` }}
              transition={{ duration: 0.6 }}
            />
          </div>
        )}
      </div>

      {kpi && (
        <div>
          <div className="mb-2.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-700">
            Key Numbers
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["Transactions", kpi.totalTransactions.toLocaleString()],
                ["Success Rate", `${kpi.successRate.toFixed(2)}%`],
                ["Declined", kpi.declinedCount.toLocaleString()],
                ["Customers", kpi.uniqueCustomers.toLocaleString()],
              ] as const
            ).map(([label, value]) => (
              <div
                key={label}
                className="rounded-lg border border-white/5 bg-[#161616] px-3 py-2.5"
              >
                <div className="text-[9px] text-zinc-600">{label}</div>
                <div className="mt-0.5 font-mono text-[13px] font-bold text-zinc-200">
                  {value}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {state.decisions.findings.length > 0 && (
        <div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-700">
            Findings
          </div>
          <div className="space-y-1.5">
            {state.decisions.findings.slice(0, 4).map((f) => (
              <div
                key={f}
                className="rounded-lg border border-white/5 bg-[#161616] px-3 py-2 text-[11px] text-zinc-500"
              >
                {f}
              </div>
            ))}
          </div>
        </div>
      )}

      {state.decisions.actions.length > 0 && (
        <div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-700">
            Recommended Actions
          </div>
          <div className="space-y-1.5">
            {state.decisions.actions.map((a, i) => (
              <div
                key={a}
                className="flex items-start gap-3 rounded-lg border border-white/5 bg-[#161616] px-3 py-2.5 text-[11px] text-zinc-500"
              >
                <span className="mt-0.5 shrink-0 font-mono text-[10px] text-zinc-700">
                  {i + 1}
                </span>
                {a}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DetailsPanel({
  evidence,
  pinned,
  onTogglePin,
}: {
  evidence?: Evidence;
  pinned?: boolean;
  onTogglePin: () => void;
}) {
  const [showSql, setShowSql] = useState(false);

  if (!evidence) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
        <ShieldCheck className="mb-3 h-9 w-9 text-zinc-800" />
        <p className="text-[12px] text-zinc-600">
          Select a finding card to see the full technical breakdown.
        </p>
      </div>
    );
  }

  const typ = TYPE_CONFIG[evidence.type];
  const sev = SEVERITY_CONFIG[evidence.severity];
  const Icon = typ.icon;
  const avg = avgGrade(evidence);

  return (
    <motion.div
      key={evidence.id}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-5 px-4 py-4"
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
            typ.color,
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span
              className={cn(
                "rounded border px-1.5 py-0.5 text-[9px] font-medium",
                sev.badge,
              )}
            >
              {sev.label}
            </span>
            <span className="text-[9px] text-zinc-600">{typ.label}</span>
          </div>
          <h3 className="text-[12px] font-semibold leading-snug text-zinc-200">
            {evidence.title}
          </h3>
          <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
            {evidence.claim}
          </p>
        </div>
        <button
          type="button"
          onClick={onTogglePin}
          className={cn(
            "mt-0.5 shrink-0 rounded p-1 transition-colors",
            pinned ? "text-zinc-200" : "text-zinc-700 hover:text-zinc-400",
          )}
        >
          {pinned ? (
            <Pin className="h-3.5 w-3.5" />
          ) : (
            <PinOff className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      <div className="rounded-lg border border-white/5 bg-[#161616] px-3 py-2.5">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[10px] text-zinc-600">Overall Reliability</span>
          <span className="font-mono text-[11px] font-semibold text-zinc-300">
            {pct(avg)}
          </span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full bg-white/35"
            style={{ width: `${avg * 100}%` }}
          />
        </div>
        <div className="mt-2 grid grid-cols-4 gap-1 text-center">
          {(["data", "method", "claim", "business"] as const).map((k) => (
            <div key={k} className="rounded bg-white/3 px-1 py-1">
              <div className="text-[8px] capitalize text-zinc-700">{k}</div>
              <div className="font-mono text-[10px] text-zinc-400">
                {pct(evidence.grade[k])}
              </div>
            </div>
          ))}
        </div>
      </div>

      {evidence.validators.length > 0 && (
        <div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-700">
            Checks
          </div>
          <div className="space-y-1.5">
            {evidence.validators.map((v) => (
              <div
                key={v.id}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-[11px]",
                  v.status === "passed"
                    ? "border-emerald-500/15 bg-emerald-500/5 text-emerald-400"
                    : v.status === "failed"
                      ? "border-rose-500/15 bg-rose-500/5 text-rose-400"
                      : "border-amber-500/15 bg-amber-500/5 text-amber-400",
                )}
              >
                <ShieldCheck className="h-3 w-3 shrink-0" />
                {v.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {(evidence.dataRef?.table || evidence.sql) && (
        <div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-700">
            Data Source
          </div>
          <div className="rounded-lg border border-white/5 bg-[#0f0f0f] px-2.5 py-2 font-mono text-[10px] text-zinc-600 space-y-0.5">
            {evidence.dataRef?.table && (
              <div>table: {evidence.dataRef.table}</div>
            )}
            {evidence.dataRef?.view && <div>view: {evidence.dataRef.view}</div>}
            {evidence.dataRef?.filter && (
              <div>filter: {evidence.dataRef.filter}</div>
            )}
          </div>
        </div>
      )}

      {evidence.sql && (
        <div>
          <button
            type="button"
            onClick={() => setShowSql((v) => !v)}
            className="flex items-center gap-1.5 text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            <Code2 className="h-3 w-3" />
            {showSql ? "Hide query" : "View query"}
            <ChevronDown
              className={cn(
                "h-3 w-3 transition-transform",
                showSql && "rotate-180",
              )}
            />
          </button>
          <AnimatePresence>
            {showSql && (
              <motion.pre
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="mt-2 overflow-x-auto overflow-hidden rounded-lg border border-white/5 bg-[#0f0f0f] p-2.5 font-mono text-[10px] leading-relaxed text-zinc-500"
              >
                {evidence.sql}
              </motion.pre>
            )}
          </AnimatePresence>
        </div>
      )}

      {evidence.caveats.length > 0 && (
        <div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-700">
            Caveats
          </div>
          {evidence.caveats.map((c) => (
            <div
              key={c}
              className="rounded-lg border border-amber-500/15 bg-amber-500/5 px-2.5 py-2 text-[11px] text-amber-400"
            >
              {c}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Link
          href="/dashboard/telecom-report"
          className="flex items-center gap-1.5 rounded-lg border border-white/6 bg-[#161616] px-3 py-1.5 text-[11px] text-zinc-400 hover:border-white/10 hover:text-zinc-200 transition-all"
        >
          Open Report <ArrowRight className="h-3 w-3" />
        </Link>
        <Link
          href="/dashboard/lineage"
          className="flex items-center gap-1.5 rounded-lg border border-white/6 bg-[#161616] px-3 py-1.5 text-[11px] text-zinc-600 hover:border-white/10 hover:text-zinc-400 transition-all"
        >
          Lineage <GitBranch className="h-3 w-3" />
        </Link>
      </div>
    </motion.div>
  );
}

function HistoryPanel({
  runs,
  onRestore,
  onDelete,
  onClear,
}: {
  runs: AgentMeshRunRecord[];
  onRestore: (r: AgentMeshRunRecord) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="space-y-3 px-4 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-3.5 w-3.5 text-zinc-600" />
          <span className="text-[11px] font-semibold text-zinc-400">
            Past Analyses
          </span>
        </div>
        {runs.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="text-[10px] text-zinc-700 hover:text-rose-400 transition-colors"
          >
            Clear all
          </button>
        )}
      </div>
      {runs.length === 0 ? (
        <p className="text-[12px] leading-relaxed text-zinc-600">
          Previous analyses will appear here so you can revisit them.
        </p>
      ) : (
        <div className="space-y-2">
          {runs.slice(0, 6).map((run) => (
            <div
              key={run.id}
              className="overflow-hidden rounded-xl border border-white/5 bg-[#161616]"
            >
              <button
                type="button"
                onClick={() => onRestore(run)}
                className="block w-full px-3 py-3 text-left hover:bg-white/3 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-zinc-300">
                    {run.headline ?? run.objective}
                  </span>
                  <span className="shrink-0 rounded-full bg-white/6 px-1.5 py-0.5 text-[9px] font-mono text-zinc-600">
                    {run.evidenceCount}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-[9px] text-zinc-700">
                  <Clock className="h-2.5 w-2.5" />
                  {formatAge(run.savedAt)}
                  {run.table && (
                    <span className="truncate opacity-60">{run.table}</span>
                  )}
                  <span className="ml-auto">
                    {run.completedTaskCount}/{run.taskCount} steps
                  </span>
                </div>
              </button>
              <div className="border-t border-white/5 px-3 py-1.5 flex justify-end">
                <button
                  type="button"
                  onClick={() => onDelete(run.id)}
                  className="text-[9px] text-zinc-700 hover:text-rose-400 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RightPanel({
  activeTab,
  onTabChange,
  state,
  selectedEvidence,
  selectedPinned,
  onTogglePin,
  runs,
  onRestore,
  onDelete,
  onClear,
}: {
  activeTab: RightTab;
  onTabChange: (t: RightTab) => void;
  state: BlackboardState;
  selectedEvidence?: Evidence;
  selectedPinned?: boolean;
  onTogglePin: () => void;
  runs: AgentMeshRunRecord[];
  onRestore: (r: AgentMeshRunRecord) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}) {
  const TABS: Array<{ key: RightTab; label: string; icon: React.ElementType }> =
    [
      { key: "summary", label: "Summary", icon: Bot },
      { key: "details", label: "Details", icon: ShieldCheck },
      { key: "history", label: "History", icon: History },
    ];

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-white/5">
        <div className="flex">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => onTabChange(key)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 px-2 py-2.5 text-[11px] font-medium transition-all duration-100",
                activeTab === key
                  ? "border-b-2 border-zinc-200 text-zinc-200"
                  : "border-b-2 border-transparent text-zinc-600 hover:text-zinc-400",
              )}
            >
              <Icon className="h-3 w-3" />
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <AnimatePresence mode="wait">
          {activeTab === "summary" && (
            <motion.div
              key="summary"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <SummaryPanel state={state} />
            </motion.div>
          )}
          {activeTab === "details" && (
            <motion.div
              key="details"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <DetailsPanel
                evidence={selectedEvidence}
                pinned={selectedPinned}
                onTogglePin={onTogglePin}
              />
            </motion.div>
          )}
          {activeTab === "history" && (
            <motion.div
              key="history"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <HistoryPanel
                runs={runs}
                onRestore={onRestore}
                onDelete={onDelete}
                onClear={onClear}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Status Bar ───────────────────────────────────────────────────────────────

function StatusBar({
  tasks,
  evidence,
  durationMs,
  expansions,
}: {
  tasks: InvestigationTask[];
  evidence: Evidence[];
  durationMs: number;
  expansions: PlanExpansion[];
}) {
  const done = tasks.filter((t) => t.status === "done").length;
  const running = tasks.filter((t) => t.status === "running").length;
  const errors = tasks.filter((t) => t.status === "error").length;
  const confidence = evidence.length
    ? evidence.reduce((s, e) => s + avgGrade(e), 0) / evidence.length
    : 0;

  return (
    <div className="flex h-7 shrink-0 items-center gap-4 border-t border-white/5 bg-[#0a0a0a] px-4 text-[10px] text-zinc-700">
      <span className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
        {done} done
      </span>
      {running > 0 && (
        <span className="flex items-center gap-1.5 text-zinc-400">
          <Loader2 className="h-2.5 w-2.5 animate-spin" />
          {running} running
        </span>
      )}
      {errors > 0 && (
        <span className="flex items-center gap-1.5 text-rose-500">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
          {errors} error{errors > 1 ? "s" : ""}
        </span>
      )}
      {expansions.length > 0 && (
        <span className="flex items-center gap-1 text-zinc-600">
          <RefreshCw className="h-2.5 w-2.5" />
          {expansions.length} adaptation{expansions.length > 1 ? "s" : ""}
        </span>
      )}
      <span>{tasks.length} steps</span>
      <span>·</span>
      <span>{evidence.length} findings</span>
      {confidence > 0 && (
        <>
          <span>·</span>
          <span>{pct(confidence)} avg reliability</span>
        </>
      )}
      {durationMs > 0 && (
        <>
          <span>·</span>
          <span className="font-mono">{formatMs(durationMs)}</span>
        </>
      )}
      <div className="flex-1" />
      <span className="text-zinc-800">Offline · DuckDB WASM</span>
    </div>
  );
}

// ─── Main Cockpit ─────────────────────────────────────────────────────────────

export function AgentMeshCockpit() {
  const mapping = useTelecomStore((s) => s.columnMapping);
  const statusMapping = useTelecomStore((s) => s.statusMapping);
  const fileName = useTelecomStore((s) => s.fileName);

  const [objective, setObjective] = useState(
    "Give me the full story on this telecom dataset.",
  );
  const [mode, setMode] = useState<PlanMode>("full_story");
  const [state, setState] = useState<BlackboardState>(() =>
    createEmptyBlackboard(),
  );
  const [running, setRunning] = useState(false);
  const [synthesizing, setSynthesizing] = useState(false);
  const [llmStatus, setLlmStatus] = useState<LlmStatus>(
    () => agentMeshLLM.status,
  );
  const [llmProgress, setLlmProgress] = useState(() => agentMeshLLM.progress);
  const [runs, setRuns] = useState<AgentMeshRunRecord[]>([]);
  const [rightTab, setRightTab] = useState<RightTab>("summary");
  const abortRef = useRef<AbortController | null>(null);

  const previewPlan = useMemo(
    () =>
      createInvestigationPlan({
        objective,
        mode,
        mapping,
        statusMapping,
        fileName,
      }),
    [objective, mode, mapping, statusMapping, fileName],
  );
  const activePlan = state.plan.activePlan ?? previewPlan;
  const expansions = state.plan.expansions ?? [];

  const selectedEvidence =
    state.evidence.items.find((e) => e.id === state.ui.selectedEvidenceId) ??
    state.evidence.items[0];
  const selectedPinned = selectedEvidence
    ? state.ui.pinnedEvidenceIds.includes(selectedEvidence.id)
    : false;

  const durationMs =
    state.plan.startedAt && state.plan.finishedAt
      ? state.plan.finishedAt - state.plan.startedAt
      : state.plan.startedAt
        ? Date.now() - state.plan.startedAt
        : 0;

  useEffect(() => {
    listAgentMeshRuns()
      .then(setRuns)
      .catch(() => setRuns([]));
  }, []);
  useEffect(
    () =>
      agentMeshLLM.subscribe(() => {
        setLlmStatus(agentMeshLLM.status);
        setLlmProgress(agentMeshLLM.progress);
      }),
    [],
  );

  function selectEvidence(id: string) {
    setState((c) => ({ ...c, ui: { ...c.ui, selectedEvidenceId: id } }));
    setRightTab("details");
  }

  function togglePin(id: string) {
    setState((c) => {
      const pinned = c.ui.pinnedEvidenceIds.includes(id);
      return {
        ...c,
        ui: {
          ...c.ui,
          pinnedEvidenceIds: pinned
            ? c.ui.pinnedEvidenceIds.filter((x) => x !== id)
            : [id, ...c.ui.pinnedEvidenceIds],
        },
      };
    });
  }

  async function run() {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setRunning(true);
    const input: AgentMeshInput = {
      objective,
      mode,
      mapping,
      statusMapping,
      fileName,
    };
    try {
      const final = await runAgentMesh(input, {
        maxParallelTasks: 3,
        signal: ctrl.signal,
        onEvent: (ev) => setState(ev.state),
      });
      let synthesized = final;
      setState(final);
      if (agentMeshLLM.isReady()) {
        setSynthesizing(true);
        try {
          const patch = await synthesizeWithLLM(
            final,
            objective,
            agentMeshLLM,
            (partial) =>
              setState((c) => ({
                ...c,
                decisions: { ...c.decisions, headline: partial },
              })),
          );
          synthesized = {
            ...final,
            decisions: { ...final.decisions, ...patch },
          };
          setState(synthesized);
        } finally {
          setSynthesizing(false);
        }
      }
      const record = createRunRecord(synthesized, objective, fileName);
      await saveAgentMeshRun(record);
      setRuns(await listAgentMeshRuns());
      setRightTab("summary");
    } finally {
      setRunning(false);
    }
  }

  function cancel() {
    abortRef.current?.abort();
    setRunning(false);
  }
  function restoreRun(r: AgentMeshRunRecord) {
    setState(r.state);
    setObjective(r.objective);
  }
  async function deleteRun(id: string) {
    await deleteAgentMeshRun(id);
    setRuns(await listAgentMeshRuns());
  }
  async function clearRuns() {
    await clearAgentMeshRuns();
    setRuns([]);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#0f0f0f] text-zinc-300">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="shrink-0 border-b border-white/5">
        {/* top row */}
        <div className="flex items-center gap-3 px-4 py-2.5">
          {/* brand */}
          <div className="flex shrink-0 items-center gap-2.5">
            <div className="relative flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5">
              <Radio className="h-3.5 w-3.5 text-zinc-400" />
              {running && (
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border border-[#0f0f0f] bg-zinc-300 animate-pulse" />
              )}
            </div>
            <div>
              <div className="text-[12px] font-semibold text-zinc-200">
                AI Analyst
              </div>
              <div className="font-mono text-[9px] text-zinc-700">
                {fileName ?? "no file loaded"}
              </div>
            </div>
          </div>

          <div className="h-4 w-px shrink-0 bg-white/8" />

          {/* objective input */}
          <div
            className={cn(
              "flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-3 py-1.5 transition-all duration-200",
              running
                ? "border-white/12 bg-white/3"
                : "border-white/6 bg-white/2 focus-within:border-white/10",
            )}
          >
            <Sparkles
              className={cn(
                "h-3 w-3 shrink-0",
                running ? "text-zinc-400 animate-pulse" : "text-zinc-700",
              )}
            />
            <input
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !running && run()}
              placeholder="What do you want to know about your data?"
              className="min-w-0 flex-1 bg-transparent text-[12px] text-zinc-300 placeholder:text-zinc-700 outline-none"
            />
            {running && (
              <Loader2 className="h-3 w-3 shrink-0 animate-spin text-zinc-500" />
            )}
          </div>

          <div className="h-4 w-px shrink-0 bg-white/8" />

          {/* offline chip */}
          <span className="flex shrink-0 items-center gap-1 rounded-md border border-white/8 bg-white/3 px-2 py-0.5 text-[10px] text-zinc-500">
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
            offline
          </span>

          {/* AI model status */}
          {synthesizing ? (
            <div className="flex shrink-0 items-center gap-1.5 rounded-md border border-white/8 bg-white/3 px-2.5 py-1 text-[10px] text-zinc-400">
              <Sparkles className="h-3 w-3 animate-pulse" />
              Writing…
            </div>
          ) : llmStatus === "unloaded" ? (
            <button
              type="button"
              onClick={() => agentMeshLLM.load(DEFAULT_MODEL)}
              className="flex shrink-0 items-center gap-1.5 rounded-md border border-white/8 bg-white/3 px-2.5 py-1 text-[10px] text-zinc-500 hover:border-white/15 hover:text-zinc-300 transition-all"
            >
              <Bot className="h-3 w-3" />
              Load AI
            </button>
          ) : llmStatus === "loading" ? (
            <div className="flex shrink-0 items-center gap-1.5 rounded-md border border-white/8 bg-white/3 px-2.5 py-1 text-[10px] text-zinc-500">
              <Loader2 className="h-3 w-3 animate-spin" />
              {llmProgress}%
            </div>
          ) : llmStatus === "ready" ? (
            <div className="flex shrink-0 items-center gap-1.5 rounded-md border border-white/8 bg-white/3 px-2.5 py-1 text-[10px] text-zinc-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              AI Ready
            </div>
          ) : (
            <button
              type="button"
              onClick={() => agentMeshLLM.load(DEFAULT_MODEL)}
              title={agentMeshLLM.error}
              className="flex shrink-0 items-center gap-1.5 rounded-md border border-rose-500/20 bg-rose-500/5 px-2.5 py-1 text-[10px] text-rose-400 hover:bg-rose-500/10 transition-all"
            >
              <AlertTriangle className="h-3 w-3" />
              Retry AI
            </button>
          )}

          {/* run / stop */}
          {running ? (
            <button
              type="button"
              onClick={cancel}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-zinc-400 transition-all hover:bg-white/8 hover:text-zinc-200"
            >
              <Square className="h-3 w-3" />
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={run}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-1.5 text-[11px] font-semibold text-zinc-900 shadow-sm transition-all hover:bg-white active:scale-95"
            >
              <Play className="h-3 w-3" />
              Analyze
              <kbd className="ml-0.5 rounded bg-zinc-900/20 px-1 text-[9px] font-mono text-zinc-600">
                ↵
              </kbd>
            </button>
          )}
        </div>

        {/* mode strip */}
        <div className="border-t border-white/5 px-4 py-2">
          <PlanModeSelector
            active={mode}
            onChange={setMode}
            disabled={running}
          />
        </div>
      </header>

      {/* ── KPI Bar ────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {state.telecom.kpi && <KpiBar state={state} />}
      </AnimatePresence>

      {/* ── 3-panel body ───────────────────────────────────────────────────── */}
      <div className="grid min-h-0 flex-1 overflow-hidden grid-cols-1 xl:grid-cols-[240px_minmax(0,1fr)_300px]">
        {/* Left — Task Pipeline */}
        <aside className="hidden xl:flex min-h-0 flex-col border-r border-white/5 bg-[#0a0a0a]">
          <TaskPipeline
            tasks={activePlan.tasks}
            expansions={expansions}
            running={running}
            durationMs={durationMs}
          />
        </aside>

        {/* Center — Investigation Canvas */}
        <section className="min-h-0 flex flex-col overflow-hidden">
          <InvestigationCanvas
            state={state}
            running={running}
            synthesizing={synthesizing}
            tasks={activePlan.tasks}
            pinnedIds={state.ui.pinnedEvidenceIds}
            selectedId={selectedEvidence?.id}
            onSelect={selectEvidence}
            onTogglePin={togglePin}
            onRun={run}
          />
        </section>

        {/* Right — Context Panel */}
        <aside className="hidden xl:flex min-h-0 flex-col border-l border-white/5 bg-[#0a0a0a]">
          <RightPanel
            activeTab={rightTab}
            onTabChange={setRightTab}
            state={state}
            selectedEvidence={selectedEvidence}
            selectedPinned={selectedPinned}
            onTogglePin={() =>
              selectedEvidence && togglePin(selectedEvidence.id)
            }
            runs={runs}
            onRestore={restoreRun}
            onDelete={deleteRun}
            onClear={clearRuns}
          />
        </aside>
      </div>

      {/* ── Status bar ─────────────────────────────────────────────────────── */}
      <StatusBar
        tasks={activePlan.tasks}
        evidence={state.evidence.items}
        durationMs={durationMs}
        expansions={expansions}
      />
    </div>
  );
}
