"use client";

import {
  Activity,
  AlertTriangle,
  BarChart3,
  Brain,
  CheckSquare,
  Database,
  GitBranch,
  Layers,
  Lightbulb,
  LineChart,
  Sparkles,
  TableProperties,
  Target,
  Terminal,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AtlasSection } from "@/design/blocks/section";
import {
  AtlasEmptyState,
  AtlasErrorState,
  AtlasLoadingState,
} from "@/design/blocks/states";
import { AtlasButton } from "@/design/primitives/button";
import { AtlasChip } from "@/design/primitives/chip";
import { AtlasInput, AtlasTextarea } from "@/design/primitives/input";
import type {
  AnalystState,
  AnalystStepId,
  Hypothesis,
  StepState,
} from "@/features/auto-analyst/core/types";
import { StepAnomalies } from "./steps/step-anomalies";
import { StepCorrelations } from "./steps/step-correlations";
import { StepForecast } from "./steps/step-forecast";
import { StepHypotheses } from "./steps/step-hypotheses";
import { StepLineage } from "./steps/step-lineage";
import { StepNarrative } from "./steps/step-narrative";
import { StepProfile } from "./steps/step-profile";
import { StepQuality } from "./steps/step-quality";
import { StepRecommendations } from "./steps/step-recommendations";
import { StepSandbox } from "./steps/step-sandbox";
import { StepSegmentation } from "./steps/step-segmentation";
import { StepStatistics } from "./steps/step-statistics";

interface Props {
  step: AnalystStepId;
  state: AnalystState;
  sandboxRows: Record<string, unknown>[];
  running?: boolean;
  onRunAll?: () => void;
  onRunStep?: (step: AnalystStepId) => void;
  onSetBrief?: (question: string, targetMetric?: string) => void;
  onAsk?: (question: string) => void;
}

const titles: Record<
  AnalystStepId,
  { title: string; description: string; icon: React.ReactNode }
> = {
  brief: {
    title: "Brief",
    description: "What dataset and what question are we tackling?",
    icon: <Target className="w-4 h-4" />,
  },
  profile: {
    title: "Schema profile",
    description: "Type, cardinality, null rate and distribution per column.",
    icon: <Database className="w-4 h-4" />,
  },
  quality: {
    title: "Data quality",
    description: "Completeness, uniqueness, validity, consistency, freshness.",
    icon: <CheckSquare className="w-4 h-4" />,
  },
  hypotheses: {
    title: "Hypotheses",
    description: "Investigable questions surfaced from the schema.",
    icon: <Lightbulb className="w-4 h-4" />,
  },
  statistics: {
    title: "Statistical tests",
    description: "Auto t-test / χ² / Pearson on every plausible pair.",
    icon: <Activity className="w-4 h-4" />,
  },
  distributions: {
    title: "Distributions",
    description: "Shape, skew, kurtosis per numeric column.",
    icon: <BarChart3 className="w-4 h-4" />,
  },
  anomalies: {
    title: "Anomalies",
    description: "Univariate z-score + Hampel detection.",
    icon: <AlertTriangle className="w-4 h-4" />,
  },
  correlations: {
    title: "Correlations",
    description: "Numeric × numeric Pearson matrix.",
    icon: <Layers className="w-4 h-4" />,
  },
  segmentation: {
    title: "Segmentation",
    description: "K-means clustering with auto-k.",
    icon: <Users className="w-4 h-4" />,
  },
  forecast: {
    title: "Forecast",
    description: "Linear projection with 80/95% confidence band.",
    icon: <LineChart className="w-4 h-4" />,
  },
  cohort: {
    title: "Cohort retention",
    description: "Coming next iteration.",
    icon: <Users className="w-4 h-4" />,
  },
  funnel: {
    title: "Funnel",
    description: "Coming next iteration.",
    icon: <Activity className="w-4 h-4" />,
  },
  rfm: {
    title: "RFM segments",
    description: "Coming next iteration.",
    icon: <Users className="w-4 h-4" />,
  },
  narrative: {
    title: "Narrative report",
    description: "Plain-English summary of every finding.",
    icon: <Sparkles className="w-4 h-4" />,
  },
  recommendations: {
    title: "Recommendations",
    description: "Actionable next steps with evidence pointers.",
    icon: <Brain className="w-4 h-4" />,
  },
  sandbox: {
    title: "Python sandbox",
    description: "Run pandas / numpy / scikit-learn locally on this data.",
    icon: <Terminal className="w-4 h-4" />,
  },
  sql: {
    title: "SQL workbench",
    description: "Coming next iteration.",
    icon: <TableProperties className="w-4 h-4" />,
  },
  report: {
    title: "Export report",
    description: "PDF + PPTX bundle of charts and narrative.",
    icon: <BarChart3 className="w-4 h-4" />,
  },
  lineage: {
    title: "Lineage",
    description: "Audit trail of every analysis step.",
    icon: <GitBranch className="w-4 h-4" />,
  },
};

function StepShell<T>({
  step,
  state,
  children,
  onRunStep,
  running,
}: {
  step: AnalystStepId;
  state: StepState<T> | undefined;
  children: (result: T) => React.ReactNode;
  onRunStep?: (step: AnalystStepId) => void;
  running?: boolean;
}) {
  const meta = titles[step];
  const runAction = onRunStep ? (
    <AtlasButton
      variant={state?.status === "error" ? "outline" : "soft"}
      size="sm"
      onClick={() => onRunStep(step)}
      disabled={running || state?.status === "running"}
    >
      {state?.status === "error"
        ? "Retry"
        : state?.status === "done"
          ? "Rerun"
          : "Run"}
    </AtlasButton>
  ) : undefined;
  return (
    <AtlasSection
      title={meta.title}
      description={meta.description}
      icon={meta.icon}
      action={runAction}
    >
      {!state || state.status === "idle" ? (
        <AtlasEmptyState
          title="Not run yet"
          description="Run this step directly, or launch the full analyst loop."
          action={runAction}
        />
      ) : state.status === "running" ? (
        <AtlasLoadingState label={`Running ${meta.title.toLowerCase()}…`} />
      ) : state.status === "error" ? (
        <AtlasErrorState description={state.error} />
      ) : state.result === undefined ? (
        <AtlasEmptyState title="No result" />
      ) : (
        children(state.result)
      )}
    </AtlasSection>
  );
}

function StepBrief({
  state,
  running,
  onRunAll,
  onRunStep,
  onSetBrief,
}: Pick<Props, "state" | "running" | "onRunAll" | "onRunStep" | "onSetBrief">) {
  const numericColumns = useMemo(
    () =>
      (state.profile?.result ?? [])
        .filter((p) => p.semantic === "numeric")
        .map((p) => p.name),
    [state.profile?.result],
  );
  const [question, setQuestion] = useState(state.question ?? "");
  const [targetMetric, setTargetMetric] = useState(
    state.brief?.targetMetric ?? numericColumns[0] ?? "",
  );

  useEffect(() => {
    setQuestion(state.question ?? "");
  }, [state.question]);

  useEffect(() => {
    if (!targetMetric && numericColumns[0]) setTargetMetric(numericColumns[0]);
  }, [numericColumns, targetMetric]);

  const saveBrief = () =>
    onSetBrief?.(question.trim(), targetMetric || undefined);

  return (
    <AtlasSection
      title={titles.brief.title}
      description="Set the mission, choose a target metric, then hand control to the analyst."
      icon={titles.brief.icon}
      action={
        <AtlasButton
          variant="solid"
          size="sm"
          onClick={onRunAll}
          disabled={running}
        >
          Run analyst loop
        </AtlasButton>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-3">
          <label className="block" htmlFor="auto-analyst-question">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-[var(--atlas-text-subtle)]">
              Analyst question
            </span>
            <AtlasTextarea
              id="auto-analyst-question"
              aria-label="Analyst question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={4}
              placeholder="Example: explain the biggest drivers of failed transactions and what should be fixed first"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <label className="block" htmlFor="auto-analyst-target-metric">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-[var(--atlas-text-subtle)]">
                Target metric
              </span>
              <AtlasInput
                id="auto-analyst-target-metric"
                aria-label="Target metric"
                list="auto-analyst-target-metrics"
                value={targetMetric}
                onChange={(e) => setTargetMetric(e.target.value)}
                placeholder="Amount, success rate, transactions..."
              />
              <datalist id="auto-analyst-target-metrics">
                {numericColumns.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
            <div className="flex items-end gap-2">
              <AtlasButton variant="outline" onClick={saveBrief}>
                Save brief
              </AtlasButton>
              <AtlasButton
                variant="soft"
                onClick={() => onRunStep?.("profile")}
                disabled={running}
              >
                Profile first
              </AtlasButton>
            </div>
          </div>
        </div>
        <div className="rounded-[var(--atlas-radius-3)] border border-[var(--atlas-border)] bg-[var(--atlas-surface)] p-3">
          <div className="mb-2 text-xs font-semibold text-[var(--atlas-text)]">
            Control handoff
          </div>
          <div className="space-y-2 text-[11px] leading-snug text-[var(--atlas-text-subtle)]">
            <p>
              The analyst will profile the table, choose viable tests, inspect
              anomalies, create a narrative and rank actions with evidence.
            </p>
            <p>
              Use the right-side mission control to rerun one loop without
              restarting the whole analysis.
            </p>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <AtlasChip severity="accent" size="sm">
              guided
            </AtlasChip>
            <AtlasChip severity="info" size="sm">
              cancellable
            </AtlasChip>
            <AtlasChip severity="success" size="sm">
              local
            </AtlasChip>
          </div>
        </div>
      </div>
    </AtlasSection>
  );
}

export function StepContent({
  step,
  state,
  sandboxRows,
  running,
  onRunAll,
  onRunStep,
  onSetBrief,
  onAsk,
}: Props) {
  switch (step) {
    case "brief":
      return (
        <StepBrief
          state={state}
          running={running}
          onRunAll={onRunAll}
          onRunStep={onRunStep}
          onSetBrief={onSetBrief}
        />
      );
    case "profile":
      return (
        <StepShell
          step="profile"
          state={state.profile}
          onRunStep={onRunStep}
          running={running}
        >
          {(r) => <StepProfile profiles={r} />}
        </StepShell>
      );
    case "quality":
      return (
        <StepShell
          step="quality"
          state={state.quality}
          onRunStep={onRunStep}
          running={running}
        >
          {(r) => <StepQuality report={r} />}
        </StepShell>
      );
    case "hypotheses":
      return (
        <StepShell
          step="hypotheses"
          state={state.hypotheses}
          onRunStep={onRunStep}
          running={running}
        >
          {(r) => (
            <StepHypotheses
              hypotheses={r}
              onAsk={(h: Hypothesis) => onAsk?.(h.question)}
            />
          )}
        </StepShell>
      );
    case "statistics":
      return (
        <StepShell
          step="statistics"
          state={state.statistics}
          onRunStep={onRunStep}
          running={running}
        >
          {(r) => <StepStatistics tests={r} />}
        </StepShell>
      );
    case "anomalies":
      return (
        <StepShell
          step="anomalies"
          state={state.anomalies}
          onRunStep={onRunStep}
          running={running}
        >
          {(r) => <StepAnomalies hits={r} />}
        </StepShell>
      );
    case "correlations":
      return (
        <StepShell
          step="correlations"
          state={state.correlations}
          onRunStep={onRunStep}
          running={running}
        >
          {(r) => <StepCorrelations cells={r} />}
        </StepShell>
      );
    case "segmentation":
      return (
        <StepShell
          step="segmentation"
          state={state.segmentation}
          onRunStep={onRunStep}
          running={running}
        >
          {(r) => <StepSegmentation result={r} />}
        </StepShell>
      );
    case "forecast":
      return (
        <StepShell
          step="forecast"
          state={state.forecast}
          onRunStep={onRunStep}
          running={running}
        >
          {(r) => <StepForecast series={r} />}
        </StepShell>
      );
    case "narrative":
      return (
        <StepShell
          step="narrative"
          state={state.narrative}
          onRunStep={onRunStep}
          running={running}
        >
          {(r) => <StepNarrative bullets={r} />}
        </StepShell>
      );
    case "recommendations":
      return (
        <StepShell
          step="recommendations"
          state={state.recommendations}
          onRunStep={onRunStep}
          running={running}
        >
          {(r) => <StepRecommendations recommendations={r} />}
        </StepShell>
      );
    case "sandbox":
      return (
        <AtlasSection
          title={titles.sandbox.title}
          description={titles.sandbox.description}
          icon={titles.sandbox.icon}
        >
          <StepSandbox tableName={state.table} rows={sandboxRows} />
        </AtlasSection>
      );
    case "lineage":
      return (
        <AtlasSection
          title={titles.lineage.title}
          description={titles.lineage.description}
          icon={titles.lineage.icon}
        >
          <StepLineage entries={state.lineage} table={state.table} />
        </AtlasSection>
      );
    default:
      return (
        <AtlasSection
          title={titles[step].title}
          description={titles[step].description}
          icon={titles[step].icon}
        >
          <AtlasEmptyState
            title="Coming next iteration"
            description="The engine layer is wired in; this panel will land in the next pass."
          />
        </AtlasSection>
      );
  }
}
