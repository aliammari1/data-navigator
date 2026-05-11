"use client";

import {
  Bot,
  Brain,
  ChevronRight,
  Gauge,
  GitBranch,
  Play,
  Radar,
  RotateCcw,
  SlidersHorizontal,
  Square,
  Wand2,
} from "lucide-react";
import { AtlasCard } from "@/design/primitives/card";
import { AtlasChip } from "@/design/primitives/chip";
import { AtlasProgress } from "@/design/primitives/progress";
import type {
  AnalystState,
  AnalystStepId,
  StepStatus,
} from "@/features/auto-analyst/core/types";

interface CommandEvent {
  id: string;
  question: string;
  outcome: string;
  step?: AnalystStepId;
}

interface ControlStep {
  id: AnalystStepId;
  label: string;
  status: StepStatus;
}

interface Props {
  state: AnalystState;
  activeStep: AnalystStepId;
  steps: ControlStep[];
  running: boolean;
  llmReady: boolean;
  commandEvents: CommandEvent[];
  onRunAll: () => void;
  onRunStep: (step?: AnalystStepId) => void;
  onCancel: () => void;
  onSelectStep: (step: AnalystStepId) => void;
  onEnableAi: () => void;
}

const runnable = new Set<AnalystStepId>([
  "profile",
  "quality",
  "hypotheses",
  "statistics",
  "anomalies",
  "correlations",
  "segmentation",
  "forecast",
  "narrative",
  "recommendations",
]);

function statusTone(status: StepStatus) {
  if (status === "done") return "success";
  if (status === "running") return "accent";
  if (status === "error") return "danger";
  return "neutral";
}

function phaseStatus(steps: ControlStep[], ids: AnalystStepId[]): StepStatus {
  const scoped = steps.filter((s) => ids.includes(s.id));
  if (scoped.some((s) => s.status === "running")) return "running";
  if (scoped.some((s) => s.status === "error")) return "error";
  if (scoped.every((s) => s.status === "done")) return "done";
  return "idle";
}

export function AnalystControlPanel({
  state,
  activeStep,
  steps,
  running,
  llmReady,
  commandEvents,
  onRunAll,
  onRunStep,
  onCancel,
  onSelectStep,
  onEnableAi,
}: Props) {
  const done = steps.filter((s) => s.status === "done").length;
  const progress = steps.length ? Math.round((done / steps.length) * 100) : 0;
  const nextStep =
    steps.find((s) => runnable.has(s.id) && s.status !== "done")?.id ??
    activeStep;

  const phases = [
    {
      title: "Read the room",
      icon: <Radar className="w-3.5 h-3.5" />,
      detail: "Profile schema, detect quality risks, infer analyst questions.",
      ids: ["profile", "quality", "hypotheses"] as AnalystStepId[],
    },
    {
      title: "Investigate",
      icon: <SlidersHorizontal className="w-3.5 h-3.5" />,
      detail: "Run tests, anomalies, correlations, segments and forecast.",
      ids: [
        "statistics",
        "anomalies",
        "correlations",
        "segmentation",
        "forecast",
      ] as AnalystStepId[],
    },
    {
      title: "Decide",
      icon: <GitBranch className="w-3.5 h-3.5" />,
      detail: "Write the narrative, rank actions, preserve the audit trail.",
      ids: ["narrative", "recommendations", "lineage"] as AnalystStepId[],
    },
  ];

  return (
    <aside className="hidden xl:flex w-80 flex-none flex-col gap-3 border-l border-[var(--atlas-border)] bg-[var(--atlas-bg-subtle)] p-3 overflow-y-auto">
      <AtlasCard variant="glow" pad="md">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--atlas-text)]">
              <Bot className="w-4 h-4 text-[var(--atlas-accent-fg)]" />
              Mission control
            </div>
            <p className="mt-1 text-[11px] leading-snug text-[var(--atlas-text-subtle)]">
              {state.question ||
                "Give the analyst a question, then let it run the investigation loop."}
            </p>
          </div>
          <AtlasChip severity={llmReady ? "accent" : "neutral"} size="sm">
            {llmReady ? "AI ready" : "rules"}
          </AtlasChip>
        </div>
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[var(--atlas-text-subtle)]">
              Automation coverage
            </span>
            <span className="font-mono text-[var(--atlas-text)]">
              {done}/{steps.length}
            </span>
          </div>
          <AtlasProgress value={progress} tone="accent" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {running ? (
            <button
              type="button"
              onClick={onCancel}
              className="atlas-focus-ring col-span-2 inline-flex items-center justify-center gap-1.5 rounded-[var(--atlas-radius-2)] bg-[var(--atlas-danger)] px-3 py-2 text-xs font-semibold text-white"
            >
              <Square className="w-3.5 h-3.5" />
              Stop run
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onRunAll}
                className="atlas-focus-ring inline-flex items-center justify-center gap-1.5 rounded-[var(--atlas-radius-2)] bg-[var(--atlas-accent)] px-3 py-2 text-xs font-semibold text-white"
              >
                <Play className="w-3.5 h-3.5" />
                Run all
              </button>
              <button
                type="button"
                onClick={() => onRunStep(nextStep)}
                className="atlas-focus-ring inline-flex items-center justify-center gap-1.5 rounded-[var(--atlas-radius-2)] border border-[var(--atlas-border)] bg-[var(--atlas-surface)] px-3 py-2 text-xs font-semibold text-[var(--atlas-text)] hover:border-[var(--atlas-accent-border)]"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Next step
              </button>
            </>
          )}
        </div>
      </AtlasCard>

      <AtlasCard variant="surface" pad="sm">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[var(--atlas-text)]">
          <Gauge className="w-3.5 h-3.5 text-[var(--atlas-accent-fg)]" />
          Automation loops
        </div>
        <div className="space-y-2">
          {phases.map((phase) => {
            const status = phaseStatus(steps, phase.ids);
            return (
              <button
                key={phase.title}
                type="button"
                onClick={() => onSelectStep(phase.ids[0])}
                className="atlas-focus-ring w-full rounded-[var(--atlas-radius-2)] border border-[var(--atlas-border)] bg-[var(--atlas-surface)] px-3 py-2 text-left transition-colors hover:border-[var(--atlas-accent-border)]"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[var(--atlas-accent-fg)]">
                    {phase.icon}
                  </span>
                  <span className="flex-1 text-xs font-semibold text-[var(--atlas-text)]">
                    {phase.title}
                  </span>
                  <AtlasChip severity={statusTone(status)} size="sm">
                    {status}
                  </AtlasChip>
                </div>
                <p className="mt-1 text-[10px] leading-snug text-[var(--atlas-text-subtle)]">
                  {phase.detail}
                </p>
              </button>
            );
          })}
        </div>
      </AtlasCard>

      <AtlasCard variant="surface" pad="sm">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--atlas-text)]">
            <Wand2 className="w-3.5 h-3.5 text-[var(--atlas-accent-fg)]" />
            Step controls
          </div>
          <button
            type="button"
            onClick={() => onRunStep(activeStep)}
            disabled={running || !runnable.has(activeStep)}
            className="atlas-focus-ring rounded-md px-2 py-1 text-[10px] font-semibold text-[var(--atlas-accent-fg)] disabled:opacity-40"
          >
            Run selected
          </button>
        </div>
        <div className="space-y-1">
          {steps.map((step) => (
            <button
              key={step.id}
              type="button"
              onClick={() => onSelectStep(step.id)}
              className={`atlas-focus-ring flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left ${
                step.id === activeStep
                  ? "bg-[var(--atlas-accent-soft)] text-[var(--atlas-accent-fg)]"
                  : "text-[var(--atlas-text-muted)] hover:bg-[var(--atlas-surface)] hover:text-[var(--atlas-text)]"
              }`}
            >
              <span className="flex-1 truncate text-[11px] font-medium">
                {step.label}
              </span>
              <AtlasChip severity={statusTone(step.status)} size="sm">
                {step.status}
              </AtlasChip>
            </button>
          ))}
        </div>
      </AtlasCard>

      <AtlasCard variant="surface" pad="sm">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--atlas-text)]">
            <Brain className="w-3.5 h-3.5 text-[var(--atlas-accent-fg)]" />
            Command memory
          </div>
          {!llmReady && (
            <button
              type="button"
              onClick={onEnableAi}
              className="atlas-focus-ring text-[10px] font-semibold text-[var(--atlas-accent-fg)]"
            >
              Enable AI
            </button>
          )}
        </div>
        <div className="space-y-1.5">
          {commandEvents.length === 0 ? (
            <p className="text-[11px] leading-snug text-[var(--atlas-text-subtle)]">
              Ask for a drill-down, chart, forecast or root-cause check. The
              analyst will log what it did here.
            </p>
          ) : (
            commandEvents.slice(0, 4).map((event) => (
              <button
                key={event.id}
                type="button"
                onClick={() => event.step && onSelectStep(event.step)}
                className="atlas-focus-ring w-full rounded-md border border-[var(--atlas-border)] bg-[var(--atlas-surface)] px-2 py-1.5 text-left hover:border-[var(--atlas-accent-border)]"
              >
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--atlas-text)]">
                  <span className="flex-1 truncate">{event.question}</span>
                  <ChevronRight className="w-3 h-3 text-[var(--atlas-text-subtle)]" />
                </div>
                <div className="mt-0.5 truncate text-[10px] text-[var(--atlas-text-subtle)]">
                  {event.outcome}
                </div>
              </button>
            ))
          )}
        </div>
      </AtlasCard>
    </aside>
  );
}
