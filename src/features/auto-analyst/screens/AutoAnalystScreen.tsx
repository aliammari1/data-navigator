"use client";

import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  Brain,
  CheckSquare,
  Database,
  GitBranch,
  Layers,
  Lightbulb,
  LineChart,
  Loader2,
  Play,
  RotateCcw,
  Sparkles,
  Square,
  Target,
  Terminal,
  Users,
} from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AtlasStepper, type Step } from "@/design/blocks/step-stepper";
import { AtlasButton } from "@/design/primitives/button";
import { AtlasChip } from "@/design/primitives/chip";
import { AnalystControlPanel } from "@/features/auto-analyst/components/analyst-control-panel";
import { LLMConsentModal } from "@/features/auto-analyst/components/llm-consent";
import { QABar } from "@/features/auto-analyst/components/qa-bar";
import { StepContent } from "@/features/auto-analyst/components/step-content";
import { TELECOM_TABLE_BASE } from "@/features/telecom/lib/names";
import { useTelecomStore } from "@/features/telecom/store";
import { useLLMOrchestrator } from "@/features/auto-analyst/core/llm-orchestrator";
import { runAll, runAnalystStep } from "@/features/auto-analyst/core/run-all";
import { useAnalystStore } from "@/features/auto-analyst/core/store";
import type {
  AnalystState,
  AnalystStepId,
  StepState,
} from "@/features/auto-analyst/core/types";
import { nlToSpec } from "@/features/data-formulator/core/ai";
import { listTables, runQuery } from "@/platform/duckdb/duckdb";

const STEP_ORDER: AnalystStepId[] = [
  "brief",
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
  "sandbox",
  "lineage",
];

const RUNNABLE_STEPS = new Set<AnalystStepId>([
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

const STEP_META: Record<
  AnalystStepId,
  { label: string; icon: React.ReactNode }
> = {
  brief: { label: "Brief", icon: <Target /> },
  profile: { label: "Profile", icon: <Database /> },
  quality: { label: "Quality", icon: <CheckSquare /> },
  hypotheses: { label: "Hypotheses", icon: <Lightbulb /> },
  statistics: { label: "Statistics", icon: <Activity /> },
  distributions: { label: "Distributions", icon: <BarChart3 /> },
  anomalies: { label: "Anomalies", icon: <AlertTriangle /> },
  correlations: { label: "Correlations", icon: <Layers /> },
  segmentation: { label: "Segmentation", icon: <Users /> },
  forecast: { label: "Forecast", icon: <LineChart /> },
  cohort: { label: "Cohort", icon: <Users /> },
  funnel: { label: "Funnel", icon: <Activity /> },
  rfm: { label: "RFM", icon: <Users /> },
  narrative: { label: "Narrative", icon: <Sparkles /> },
  recommendations: { label: "Actions", icon: <Brain /> },
  sandbox: { label: "Python", icon: <Terminal /> },
  sql: { label: "SQL", icon: <Database /> },
  report: { label: "Report", icon: <BarChart3 /> },
  lineage: { label: "Lineage", icon: <GitBranch /> },
};

function deriveStatus<T>(s: StepState<T> | undefined): Step["status"] {
  if (!s) return "idle";
  return s.status;
}

export default function AutoAnalystScreen() {
  const telecomFile = useTelecomStore((s) => s.fileName);
  const [tables, setTables] = useState<string[]>([]);
  const [active, setActive] = useState("");
  const [activeStep, setActiveStep] = useState<AnalystStepId>("brief");
  const [running, setRunning] = useState(false);
  const [topErr, setTopErr] = useState("");
  const [sandboxRows, setSandboxRows] = useState<Record<string, unknown>[]>([]);
  const [commandEvents, setCommandEvents] = useState<
    Array<{
      id: string;
      question: string;
      outcome: string;
      step?: AnalystStepId;
    }>
  >([]);
  const abortRef = useRef<AbortController | null>(null);

  const setLLMConsentPending = useLLMOrchestrator((s) => s.setConsentPending);
  const llmStatus = useLLMOrchestrator((s) => s.status);

  const states = useAnalystStore((s) => s.states);
  const ensure = useAnalystStore((s) => s.ensure);
  const setCurrent = useAnalystStore((s) => s.setCurrent);
  const patch = useAnalystStore((s) => s.patch);
  const log = useAnalystStore((s) => s.log);
  const state: AnalystState = active
    ? (states[active] ?? { table: active, lineage: [] })
    : { table: "", lineage: [] };

  const isTelecom = active.startsWith(TELECOM_TABLE_BASE);

  // Bootstrap
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const tbls = await listTables();
        if (!alive) return;
        setTables(tbls);
        const preferTelecom = tbls.find((t) =>
          t.startsWith(TELECOM_TABLE_BASE),
        );
        const first = preferTelecom ?? tbls[0] ?? "";
        if (first) {
          setActive(first);
          ensure(first);
          setCurrent(first);
        }
      } catch (e) {
        setTopErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [ensure, setCurrent]);

  // Maintain a sample for the sandbox bound to current dataset
  useEffect(() => {
    if (!active) return;
    runQuery(`SELECT * FROM "${active}" LIMIT 5000`)
      .then((rows) => setSandboxRows(rows))
      .catch(() => setSandboxRows([]));
  }, [active]);

  const onSelectTable = (t: string) => {
    setActive(t);
    ensure(t);
    setCurrent(t);
    setActiveStep("brief");
  };

  const onRunAll = useCallback(async () => {
    if (!active) return;
    setRunning(true);
    setTopErr("");
    abortRef.current = new AbortController();
    try {
      await runAll(active, {
        signal: abortRef.current.signal,
        onStep: (id) => setActiveStep(id),
      });
    } catch (e) {
      setTopErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, [active]);

  const onCancel = () => {
    abortRef.current?.abort();
    setRunning(false);
  };

  const onRunStep = useCallback(
    async (step = activeStep) => {
      if (!active || !RUNNABLE_STEPS.has(step)) return;
      setRunning(true);
      setTopErr("");
      abortRef.current = new AbortController();
      try {
        await runAnalystStep(active, step, {
          signal: abortRef.current.signal,
          onStep: (id) => setActiveStep(id),
        });
      } catch (e) {
        setTopErr(e instanceof Error ? e.message : String(e));
      } finally {
        setRunning(false);
      }
    },
    [active, activeStep],
  );

  const onSetBrief = useCallback(
    (question: string, targetMetric?: string) => {
      if (!active) return;
      patch(active, {
        question,
        brief: {
          dataset: active,
          question,
          targetMetric,
        },
      });
      log(active, {
        step: "brief",
        message: question ? "Brief updated" : "Brief cleared",
        detail: targetMetric ? `target: ${targetMetric}` : undefined,
      });
    },
    [active, patch, log],
  );

  const onAsk = useCallback(
    async (q: string) => {
      if (!active) return;
      try {
        // For now, route Q&A into a chart-spec via expanded ai.ts patterns.
        // Future: route through the multi-agent graph for SQL / Python / Vega.
        const cols = state.profile?.result ?? [];
        const colInfo = cols.map((c) => ({
          name: c.name,
          type:
            c.semantic === "numeric"
              ? ("number" as const)
              : c.semantic === "datetime"
                ? ("date" as const)
                : c.semantic === "boolean"
                  ? ("boolean" as const)
                  : ("string" as const),
          dbType: c.duckType,
        }));
        const spec = await nlToSpec(q, colInfo);
        const routedStep: AnalystStepId = /forecast|predict|next \d+/i.test(q)
          ? "forecast"
          : /anomal|outlier|spike/i.test(q)
            ? "anomalies"
            : /correl|relationship|compare|vs/i.test(q)
              ? "correlations"
              : /segment|cluster/i.test(q)
                ? "segmentation"
                : /quality|null|missing|duplicate/i.test(q)
                  ? "quality"
                  : "narrative";
        setActiveStep(routedStep);
        setCommandEvents((events) => [
          {
            id: Math.random().toString(36).slice(2, 10),
            question: q,
            outcome: spec
              ? `Built ${spec.type ?? "chart"} intent and routed to ${routedStep}.`
              : `Routed to ${routedStep} with best-effort fallback.`,
            step: routedStep,
          },
          ...events,
        ]);
        log(active, {
          step: routedStep,
          message: `Q: ${q}`,
          detail: spec ? `Built ${spec.type ?? "?"} chart` : "no match",
        });
      } catch (e) {
        setTopErr(e instanceof Error ? e.message : String(e));
      }
    },
    [active, state.profile, log],
  );

  const stepperSteps: Step[] = useMemo(
    () =>
      STEP_ORDER.map((id) => {
        const meta = STEP_META[id];
        const sState = state[id as keyof AnalystState] as StepState | undefined;
        return {
          id,
          label: meta.label,
          icon: meta.icon,
          status: deriveStatus(sState),
          durationMs: sState?.durationMs,
        };
      }),
    [state],
  );

  const controlSteps = useMemo(
    () =>
      stepperSteps.map((s) => ({
        id: s.id as AnalystStepId,
        label: s.label,
        status: s.status,
      })),
    [stepperSteps],
  );

  if (!tables.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20 px-6 text-center">
        <div className="w-16 h-16 rounded-(--atlas-radius-4) bg-(--atlas-accent-soft) border border-(--atlas-accent-border) flex items-center justify-center mb-5">
          <Bot className="w-7 h-7 text-(--atlas-accent-fg)" />
        </div>
        <h1 className="text-2xl font-bold text-(--atlas-text) mb-2">
          AI Auto-Analyst
        </h1>
        <p className="text-sm text-(--atlas-text-subtle) max-w-lg leading-relaxed mb-6">
          Replaces a junior data analyst — profile, quality, hypotheses,
          statistics, anomalies, segmentation, forecasting, narrative and
          recommendations, all running offline in your browser. Upload a dataset
          or load a telecom file first.
        </p>
        <div className="flex gap-2.5">
          <Link href="/dashboard/upload">
            <AtlasButton variant="solid">
              <Database className="w-4 h-4" /> Upload data
            </AtlasButton>
          </Link>
          <Link href="/dashboard/telecom-report">
            <AtlasButton variant="outline">
              <Activity className="w-4 h-4" /> Open Telecom
            </AtlasButton>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <header className="flex-none px-5 py-3 border-b border-(--atlas-border) flex items-center gap-3 flex-wrap bg-(--atlas-bg-subtle)">
        <Bot className="w-5 h-5 text-(--atlas-accent-fg)" />
        <h1 className="text-base font-bold text-(--atlas-text)">
          Auto-Analyst
        </h1>
        <select
          value={active}
          onChange={(e) => onSelectTable(e.target.value)}
          className="bg-(--atlas-surface) border border-(--atlas-border) rounded-lg px-3 py-1.5 text-xs text-(--atlas-text) outline-none focus:border-(--atlas-accent-border)"
        >
          {tables.map((t) => (
            <option key={t} value={t}>
              {t}
              {t === TELECOM_TABLE_BASE ? " (telecom)" : ""}
            </option>
          ))}
        </select>
        {isTelecom && telecomFile && (
          <AtlasChip severity="success" size="sm">
            telecom · {telecomFile}
          </AtlasChip>
        )}
        <div className="flex-1" />
        {/* AI status chip */}
        {llmStatus === "ready" ? (
          <AtlasChip severity="accent" size="md">
            <Brain className="w-3 h-3" /> AI ready
          </AtlasChip>
        ) : (
          <button
            type="button"
            onClick={() => setLLMConsentPending()}
            className="atlas-focus-ring"
          >
            <AtlasChip severity="neutral" size="md">
              <Brain className="w-3 h-3" /> Enable AI
            </AtlasChip>
          </button>
        )}
        {running ? (
          <AtlasButton variant="danger" size="md" onClick={onCancel}>
            <Square className="w-3.5 h-3.5" /> Cancel
          </AtlasButton>
        ) : (
          <div className="flex items-center gap-2">
            <AtlasButton
              variant="outline"
              size="md"
              onClick={() => onRunStep()}
              disabled={!active || !RUNNABLE_STEPS.has(activeStep)}
            >
              <RotateCcw className="w-3.5 h-3.5" /> Run step
            </AtlasButton>
            <AtlasButton
              variant="solid"
              size="md"
              onClick={onRunAll}
              disabled={!active}
            >
              <Play className="w-3.5 h-3.5" /> Run All
            </AtlasButton>
          </div>
        )}
      </header>

      {/* Top error */}
      {topErr && (
        <div className="px-5 py-2 bg-(--atlas-danger-soft) border-b border-(--atlas-danger-border) text-(--atlas-danger-fg) text-xs">
          {topErr}
        </div>
      )}

      <div className="flex-1 overflow-hidden flex">
        {/* Left rail */}
        <aside className="w-60 flex-none border-r border-(--atlas-border) bg-(--atlas-bg-subtle) overflow-y-auto px-2.5 py-3">
          <div className="px-1.5 mb-2 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wide font-bold text-(--atlas-text-subtle)">
              Pipeline
            </span>
            {running && (
              <Loader2 className="w-3 h-3 animate-spin text-(--atlas-accent-fg)" />
            )}
          </div>
          <AtlasStepper
            steps={stepperSteps}
            activeId={activeStep}
            onSelect={(id) => setActiveStep(id as AnalystStepId)}
          />
        </aside>

        {/* Main viewport */}
        <main className="flex-1 overflow-y-auto p-4 space-y-4">
          <motion.div
            key={activeStep}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
          >
            <StepContent
              step={activeStep}
              state={state}
              sandboxRows={sandboxRows}
              running={running}
              onRunAll={onRunAll}
              onRunStep={onRunStep}
              onSetBrief={onSetBrief}
              onAsk={onAsk}
            />
          </motion.div>
          <QABar onAsk={onAsk} loading={running} />
        </main>

        <AnalystControlPanel
          state={state}
          activeStep={activeStep}
          steps={controlSteps}
          running={running}
          llmReady={llmStatus === "ready"}
          commandEvents={commandEvents}
          onRunAll={onRunAll}
          onRunStep={onRunStep}
          onCancel={onCancel}
          onSelectStep={(id) => setActiveStep(id)}
          onEnableAi={() => setLLMConsentPending()}
        />
      </div>

      <LLMConsentModal />
    </div>
  );
}
