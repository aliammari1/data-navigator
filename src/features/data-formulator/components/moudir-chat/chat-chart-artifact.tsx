"use client";

/**
 * ChatChartArtifact — an inline chart Moudir asked for via `make_chart`.
 *
 * A `ChartPart` carries only the *intent* of a chart ({chartType, x, y,
 * aggregate, title}); it has NO data, because the Electron main process never
 * runs ECharts. So this component resolves the data itself against the active
 * dataset, reusing the exact Formulator pipeline the manual canvas uses:
 *
 *   part → ChartSpec → buildSQL(spec, view) → runReadOnlyQuery → buildOption →
 *   OffscreenChart (main-thread `echarts-for-react` fallback, same routing as
 *   formulator2/chart-canvas.tsx).
 *
 * Grounding is first-class (the DF discipline): the resolved chart sits above a
 * muted provenance line ("canal · somme(montant)") so the reader always sees
 * which fields and aggregate produced the picture, and an « Épingler » action
 * snapshots the spec + rows to the dashboard widget registry.
 *
 * Async safety: a `requestId` ref guards against a stale DuckDB response
 * committing over a newer part/dataset — the active dataset can change while a
 * query is in flight.
 */

import ReactEChartsCore from "echarts-for-react/lib/core";
import { BarChart3, Pin, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useDataStore } from "@/core/stores/data-store";
import { runReadOnlyQuery } from "@/platform/duckdb/duckdb";
import { type EChartsOption, OffscreenChart, supportsOffscreenChart } from "@/platform/viz";
import { echarts } from "@/platform/viz/echarts-core";
import { cn } from "@/shared/utils";
import { buildOption } from "../../core/chart-options";
import type { Row } from "../../core/formulator/model";
import { buildSQL } from "../../core/sql";
import type { AggregateFn, ChartSpec, ChartType } from "../../core/types";
import { useWidgetRegistry } from "../../core/widget-registry";
import type { ChartPart } from "../../store/moudir-chat-store";

const CHART_HEIGHT = 300;

// ─── Coercion (the model's enums are strings; the pipeline wants unions) ───────

const CHART_TYPES: ReadonlySet<string> = new Set<ChartType>([
  "bar",
  "horizontal-bar",
  "stacked-bar",
  "stacked-horizontal-bar",
  "line",
  "area",
  "multi-line",
  "pie",
  "donut",
  "scatter",
  "bubble",
  "heatmap",
  "treemap",
  "radar",
  "gauge",
  "funnel",
  "kpi-grid",
  "data-table",
]);

const AGG_LABEL: Record<AggregateFn, string> = {
  none: "",
  count: "nombre",
  sum: "somme",
  avg: "moyenne",
  min: "min",
  max: "max",
  median: "médiane",
  distinct: "distinct",
};

function coerceChartType(value: string): ChartType {
  return CHART_TYPES.has(value) ? (value as ChartType) : "bar";
}

function coerceAggregate(value: string): AggregateFn {
  return value in AGG_LABEL ? (value as AggregateFn) : "sum";
}

/** DF-style grounding line: "canal · somme(montant)" (or just "canal · montant"). */
function provenanceLine(x: string, y: string, aggregate: AggregateFn): string {
  const label = AGG_LABEL[aggregate];
  return label ? `${x} · ${label}(${y})` : `${x} · ${y}`;
}

/** Minimal deterministic spec — the shelf-less equivalent of shelfToChartSpec. */
function buildSpec(
  chartType: string,
  x: string,
  y: string,
  aggregate: AggregateFn,
  title: string,
): ChartSpec {
  return {
    id: `moudir-chart-${x}-${y}`,
    type: coerceChartType(chartType),
    encodings: [
      { id: "enc-x", channel: "x", field: x, aggregate: "none" },
      { id: "enc-y", channel: "y", field: y, aggregate },
    ],
    filters: [],
    limit: 500,
    title,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ─── Resolution state ──────────────────────────────────────────────────────────

type ResolveState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; option: EChartsOption; rows: Row[]; spec: ChartSpec; sql: string };

// ─── Pin action (snapshot spec + rows to the dashboard registry) ──────────────

function PinChartButton({
  spec,
  rows,
  sql,
  title,
  tableName,
}: Readonly<{ spec: ChartSpec; rows: Row[]; sql: string; title: string; tableName: string }>) {
  const addWidget = useWidgetRegistry((s) => s.addWidget);
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      className="text-muted-foreground"
      onClick={() => {
        addWidget({
          chartSpec: spec,
          result: { sql, data: rows, duration: 0, rowCount: rows.length },
          title,
          size: "md",
          attachedTo: [],
          tableName,
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

// ─── Sub-states ────────────────────────────────────────────────────────────────

/** Honest placeholder — pulsing surfaces, deliberately no spinner. */
function ArtifactSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Résolution du graphique"
      className="flex flex-col gap-3 rounded-xl border border-ai/30 bg-card p-4"
      style={{ height: CHART_HEIGHT }}
    >
      <div className="h-3.5 w-40 animate-pulse rounded bg-muted" />
      <div className="flex-1 animate-pulse rounded-lg bg-muted" />
    </div>
  );
}

function ArtifactError({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3">
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-destructive">Graphique indisponible</p>
        <p className="truncate font-mono text-xs text-destructive/80" title={message}>
          {message}
        </p>
      </div>
    </div>
  );
}

// ─── Artifact ──────────────────────────────────────────────────────────────────

export function ChatChartArtifact({ part }: Readonly<{ part: ChartPart }>) {
  // Stable dataset object reference; the effect re-resolves when it changes.
  const dataset = useDataStore((s) => s.datasets.find((d) => d.id === s.activeDatasetId));
  const tableName = dataset?.viewName || dataset?.tableName || "";

  const { chartType, x, y, aggregate: rawAggregate, title } = part;
  const aggregate = coerceAggregate(rawAggregate);

  const [state, setState] = useState<ResolveState>({ status: "loading" });
  const requestIdRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    const commit = (next: ResolveState) => {
      if (requestIdRef.current === requestId) setState(next);
    };

    if (!tableName) {
      commit({ status: "error", message: "Aucun jeu de données actif." });
      return;
    }
    if (!x || !y) {
      commit({ status: "error", message: "Champs manquants pour le graphique." });
      return;
    }

    const spec = buildSpec(chartType, x, y, aggregate, title);
    let sql: string;
    try {
      sql = buildSQL(spec, tableName);
    } catch (error) {
      commit({ status: "error", message: errorMessage(error) });
      return;
    }

    commit({ status: "loading" });
    void runReadOnlyQuery(sql)
      .then((rows) => {
        const option = buildOption(spec, rows) as unknown as EChartsOption | null;
        if (!option) {
          commit({ status: "error", message: "Aucune donnée à afficher." });
          return;
        }
        commit({ status: "ok", option, rows, spec, sql });
      })
      .catch((error) => {
        commit({ status: "error", message: errorMessage(error) });
      });
  }, [tableName, chartType, x, y, aggregate, title]);

  if (state.status === "loading") return <ArtifactSkeleton />;
  if (state.status === "error") return <ArtifactError message={state.message} />;

  const { option, rows, spec, sql } = state;
  const fallback = (
    <ReactEChartsCore
      echarts={echarts}
      option={option}
      style={{ height: CHART_HEIGHT, width: "100%" }}
      lazyUpdate
    />
  );

  return (
    <div className="rounded-xl border border-ai/30 bg-card p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <BarChart3 className="mt-0.5 size-3.5 shrink-0 text-ai" aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{title}</p>
            <p className={cn("truncate font-mono text-[11px] text-muted-foreground")}>
              {provenanceLine(x, y, aggregate)}
            </p>
          </div>
        </div>
        <PinChartButton spec={spec} rows={rows} sql={sql} title={title} tableName={tableName} />
      </div>
      {supportsOffscreenChart() ? (
        <OffscreenChart
          option={option}
          height={CHART_HEIGHT}
          className="w-full"
          fallback={fallback}
        />
      ) : (
        fallback
      )}
    </div>
  );
}
