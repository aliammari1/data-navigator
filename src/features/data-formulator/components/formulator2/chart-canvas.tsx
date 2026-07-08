"use client";

/**
 * FormChartCanvas — the formulator2 chart surface.
 *
 * Renders whatever `useChartData()` resolved from the focused table + encoding
 * shelf. Four states: empty shelf (dashed invitation), loading (skeleton, no
 * spinner), resolution error (destructive card) and a live ECharts chart.
 *
 * A <FilterBar/> sits above the chart (shelf filters as pills) and, on
 * cross-filterable chart types, clicking a category toggles an `=` filter on the
 * x field ("cliquez une barre pour filtrer"). Under the chart, the compiled SQL
 * is exposed behind a « SQL » disclosure — DF's verification affordance.
 *
 * Render path: the main-thread `echarts-for-react` instance is used DIRECTLY
 * here (not the worker-backed `OffscreenChart`) because both new affordances —
 * click cross-filtering (`onEvents`) and PNG/clipboard export (`getDataURL`) —
 * need the live main-thread instance. In practice the formulator's compiled
 * options always carry function formatters, so `OffscreenChart` already routed
 * to this same fallback; rendering it directly just makes the instance reliably
 * reachable for every chart type. The instance getter + resolved rows are
 * published upward through the chart-export bridge so the header toolbar can
 * export without owning the chart.
 */

import ReactEChartsCore from "echarts-for-react/lib/core";
import {
  Check,
  ChevronDown,
  Copy,
  MousePointerClick,
  Pin,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { echarts } from "@/platform/viz/echarts-core";
import { cn } from "@/shared/utils";
import { type ChartInsight, generateChartInsight } from "../../core/formulator/insight-agent";
import type { Row } from "../../core/formulator/model";
import type { ChartSpec } from "../../core/types";
import { useWidgetRegistry } from "../../core/widget-registry";
import { useFormFocusedTable, useFormulatorV2Store } from "../../store/formulator-store";
import {
  type ChartClickParams,
  CROSS_FILTERABLE_CHART_TYPES,
  resolveCrossFilter,
} from "./cross-filter";
import { FilterBar } from "./filter-bar";
import { useChartExport } from "./formulator-chart-export";
import { useChartData } from "./use-chart-data";

const CHART_HEIGHT = 380;
const COPY_FEEDBACK_MS = 2000;

function CopySqlButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      aria-label="Copier le SQL"
      className="text-muted-foreground"
      onClick={() => {
        navigator.clipboard
          .writeText(text)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
          })
          .catch(() => {});
      }}
    >
      {copied ? <Check className="text-primary" /> : <Copy />}
      {copied ? "Copié" : "Copier"}
    </Button>
  );
}

/** Collapsible SQL disclosure shown under the chart when a query exists. */
function SqlDisclosure({ sql }: { sql: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-2">
      <div className="flex items-center justify-between gap-2">
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="gap-1 font-mono text-muted-foreground"
            aria-label={open ? "Masquer le SQL" : "Afficher le SQL"}
          >
            <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
            SQL
          </Button>
        </CollapsibleTrigger>
        {open ? <CopySqlButton text={sql} /> : null}
      </div>
      <CollapsibleContent>
        <pre className="mt-1 max-h-48 overflow-auto rounded-lg border border-border bg-muted/50 p-3 font-mono text-xs text-foreground">
          {sql}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * Pin the current chart to the dashboard widget registry. Snapshot semantics
 * on purpose: derived tables are lineage-bound (their data may not exist
 * outside this screen), so the widget carries the compiled spec AND the
 * resolved rows as they were at pin time — the thread stays the place to
 * re-derive fresher data.
 */
function PinChartButton({
  spec,
  rows,
  sql,
}: Readonly<{ spec: ChartSpec; rows: Row[]; sql: string | null }>) {
  const focused = useFormFocusedTable();
  const addWidget = useWidgetRegistry((s) => s.addWidget);

  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      className="text-muted-foreground"
      onClick={() => {
        const title = focused?.name ?? "Graphique";
        addWidget({
          chartSpec: spec,
          result: { sql: sql ?? "", data: rows, duration: 0, rowCount: rows.length },
          title,
          size: "md",
          attachedTo: [],
          tableName: focused?.duckdbView ?? focused?.name ?? "",
          pinnedAt: Date.now(),
        });
        toast("Épinglé au tableau de bord", { description: title });
      }}
    >
      <Pin />
      Épingler
    </Button>
  );
}

type InsightState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; insight: ChartInsight }
  | { status: "error"; message: string };

/**
 * Opt-in chart analysis (« Analyser ») — one grounded LLM call over the
 * chart's own aggregated rows. Resets whenever the chart underneath changes
 * so an old reading never sits under a new picture.
 */
function InsightSection({ rows, chartType }: Readonly<{ rows: Row[]; chartType: string | null }>) {
  const focused = useFormFocusedTable();
  const [state, setState] = useState<InsightState>({ status: "idle" });

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps are deliberately unread — rows identity + node + type ARE the chart identity; the effect resets stale analysis on any change.
  useEffect(() => {
    setState({ status: "idle" });
  }, [rows, focused?.id, chartType]);

  if (!focused || rows.length === 0) return null;

  const run = async () => {
    setState({ status: "loading" });
    try {
      const insight = await generateChartInsight({
        node: focused,
        chartType: chartType ?? "bar",
        rows,
        instruction: focused.instruction,
      });
      setState({ status: "done", insight });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  if (state.status === "idle" || state.status === "error") {
    return (
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="text-ai"
          onClick={() => void run()}
        >
          <Sparkles />
          Analyser
        </Button>
        {state.status === "error" && (
          <span className="truncate text-xs text-destructive" title={state.message}>
            {state.message}
          </span>
        )}
      </div>
    );
  }

  if (state.status === "loading") {
    return (
      <span className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
        <span className="size-1.5 animate-pulse rounded-full bg-ai" aria-hidden="true" />
        Analyse en cours…
      </span>
    );
  }

  return (
    <div className="w-full rounded-lg border border-ai/30 bg-ai/5 p-3">
      <p className="text-sm font-medium text-foreground">{state.insight.headline}</p>
      <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
        {state.insight.bullets.map((bullet) => (
          <li key={bullet}>{bullet}</li>
        ))}
      </ul>
      {state.insight.caveat && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground italic">
          <TriangleAlert className="mt-0.5 size-3 shrink-0 text-warning" aria-hidden="true" />
          {state.insight.caveat}
        </p>
      )}
    </div>
  );
}

/** Subtle loading placeholder — pulsing surfaces, deliberately no spinner. */
function CanvasSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Chargement du graphique"
      className="flex w-full flex-col gap-3 rounded-xl border border-border bg-card p-4"
      style={{ height: CHART_HEIGHT }}
    >
      <div className="h-4 w-40 animate-pulse rounded bg-muted" />
      <div className="flex-1 animate-pulse rounded-lg bg-muted" />
      <div className="flex gap-2">
        <div className="h-3 w-16 animate-pulse rounded bg-muted" />
        <div className="h-3 w-24 animate-pulse rounded bg-muted" />
        <div className="h-3 w-12 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}

export function FormChartCanvas() {
  const { option, sql, loading, error, rows, spec, resolvedChartType } = useChartData();
  const { registerGetInstance, setExportState } = useChartExport();
  const chartRef = useRef<ReactEChartsCore>(null);

  const xField = spec?.encodings.find((e) => e.channel === "x")?.field ?? null;
  const canExport = spec != null && rows.length > 0;
  const canCrossFilter =
    xField != null && CROSS_FILTERABLE_CHART_TYPES.has(resolvedChartType ?? "");

  // Register the live main-thread instance getter once — ref-backed, so the
  // toolbar can reach `getDataURL()` for PNG/clipboard export.
  useEffect(() => {
    registerGetInstance(() => chartRef.current?.getEchartsInstance() ?? null);
  }, [registerGetInstance]);

  // Publish resolved rows + export-readiness so the header toolbar's « Exporter »
  // menu enables only when there's something to export.
  useEffect(() => {
    setExportState({ rows, canExport });
  }, [rows, canExport, setExportState]);

  const handleChartClick = useCallback(
    (params: ChartClickParams) => {
      const target = resolveCrossFilter(params, xField, resolvedChartType);
      if (!target) return;
      useFormulatorV2Store.getState().toggleValueFilter(target.field, target.value);
    },
    [xField, resolvedChartType],
  );

  const hasChart = !loading && !error && option != null;

  let body: React.ReactNode;
  if (loading) {
    body = <CanvasSkeleton />;
  } else if (error) {
    body = (
      <div className="flex w-full flex-col gap-1.5 rounded-xl border border-destructive/30 bg-destructive/10 p-4">
        <p className="text-sm font-medium text-destructive">Impossible d'afficher le graphique</p>
        <p className="font-mono text-xs text-destructive/80">{error}</p>
      </div>
    );
  } else if (option == null) {
    body = (
      <div
        className="grid w-full place-items-center rounded-xl border border-dashed border-border bg-card/50 p-8 text-center"
        style={{ height: CHART_HEIGHT }}
      >
        <p className="max-w-sm text-sm text-muted-foreground">
          Glissez des champs sur X et Y, ou décrivez ce que vous voulez voir.
        </p>
      </div>
    );
  } else {
    body = (
      <>
        <ReactEChartsCore
          ref={chartRef}
          echarts={echarts}
          option={option}
          style={{ height: CHART_HEIGHT, width: "100%" }}
          lazyUpdate
          onEvents={{ click: handleChartClick }}
        />
        {spec != null && rows.length > 0 ? (
          <div className="mt-1 flex flex-wrap items-start justify-between gap-2">
            <InsightSection rows={rows} chartType={resolvedChartType} />
            <PinChartButton spec={spec} rows={rows} sql={sql} />
          </div>
        ) : null}
        {sql != null ? <SqlDisclosure sql={sql} /> : null}
      </>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FilterBar />
        {hasChart && canCrossFilter ? (
          <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
            <MousePointerClick className="size-3" aria-hidden="true" />
            Cliquez une barre pour filtrer
          </span>
        ) : null}
      </div>
      {body}
    </div>
  );
}
