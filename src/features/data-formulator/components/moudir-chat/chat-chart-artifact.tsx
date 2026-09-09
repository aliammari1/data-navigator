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
import {
  BarChart3,
  Filter,
  Maximize2,
  MessageSquare,
  Pin,
  Search,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Artifact,
  ArtifactActions,
  ArtifactContent,
  ArtifactDescription,
  ArtifactHeader,
  ArtifactTitle,
} from "@/components/ai-elements/artifact";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDataStore } from "@/core/stores/data-store";
import { runReadOnlyQuery } from "@/platform/duckdb/duckdb";
import { type EChartsOption } from "@/platform/viz";
import { echarts } from "@/platform/viz/echarts-core";
import { cn } from "@/shared/utils";
import { buildOption } from "../../core/chart-options";
import { buildSQL } from "../../core/sql";
import type { AggregateFn, ChartSpec, ChartType, FilterDef } from "../../core/types";

type Row = Record<string, unknown>;

import { useWidgetRegistry } from "../../core/widget-registry";
import { type ChartPart, useMoudirChatStore } from "../../store/moudir-chat-store";

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

function formatMetricValue(val: unknown): string {
  if (val === null || val === undefined) return "";
  const num = Number(val);
  if (!Number.isNaN(num)) {
    return num.toLocaleString("fr-FR");
  }
  return String(val);
}

/** Minimal deterministic spec — the shelf-less equivalent of shelfToChartSpec. */
function buildSpec(
  chartType: string,
  x: string,
  y: string,
  aggregate: AggregateFn,
  title: string,
  filters: FilterDef[] = [],
): ChartSpec {
  return {
    id: `moudir-chart-${x}-${y}`,
    type: coerceChartType(chartType),
    encodings: [
      { id: "enc-x", channel: "x", field: x, aggregate: "none" },
      { id: "enc-y", channel: "y", field: y, aggregate },
    ],
    filters,
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
    <Artifact
      aria-busy="true"
      aria-label="Résolution du graphique"
      className="mb-4 border-ai/30"
      role="status"
      style={{ height: CHART_HEIGHT }}
    >
      <ArtifactContent className="flex flex-col gap-3">
        <div className="h-3.5 w-40 animate-pulse rounded bg-muted" />
        <div className="flex-1 animate-pulse rounded-lg bg-muted" />
      </ArtifactContent>
    </Artifact>
  );
}

function ArtifactError({ message }: { message: string }) {
  return (
    <Artifact className="mb-4 border-destructive/30 bg-destructive/10">
      <ArtifactContent className="flex items-start gap-2 p-3">
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-destructive" />
        <div className="min-w-0">
          <ArtifactTitle className="text-destructive">Graphique indisponible</ArtifactTitle>
          <ArtifactDescription
            className="truncate font-mono text-xs text-destructive/80"
            title={message}
          >
            {message}
          </ArtifactDescription>
        </div>
      </ArtifactContent>
    </Artifact>
  );
}

// ─── Artifact ──────────────────────────────────────────────────────────────────

export function ChatChartArtifact({ part }: Readonly<{ part: ChartPart }>) {
  // Stable dataset object reference; prefer part.datasetId if specified
  const dataset = useDataStore((s) =>
    part.datasetId
      ? s.datasets.find((d) => d.id === part.datasetId)
      : s.datasets.find((d) => d.id === s.activeDatasetId),
  );
  const tableName = dataset?.viewName || dataset?.tableName || "";
  const openCanvas = useMoudirChatStore((s) => s.openCanvas);
  const activeFilters = useMoudirChatStore((s) => s.activeFilters);
  const addFilter = useMoudirChatStore((s) => s.addFilter);

  const { chartType, x, y, aggregate: rawAggregate, title } = part;
  const aggregate = coerceAggregate(rawAggregate);

  const [state, setState] = useState<ResolveState>({ status: "loading" });
  const [selectedPoint, setSelectedPoint] = useState<{
    name: string;
    value: string;
  } | null>(null);
  const requestIdRef = useRef(0);

  const filterDefs: FilterDef[] = useMemo(() => {
    return activeFilters.map((af) => ({
      id: `filter-${af.field}`,
      field: af.field,
      op: "=" as const,
      value: String(af.value),
    }));
  }, [activeFilters]);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    const commit = (next: ResolveState) => {
      if (requestIdRef.current === requestId) setState(next);
    };

    // Synthetic chart: the model supplied its own rows, no dataset needed.
    if (part.rows && part.rows.length > 0) {
      const normalizedRows = part.rows.map((row) => {
        const xVal = row.x_val ?? row[x] ?? row.label ?? row.Label ?? Object.values(row)[0];
        const yVal = row.y_val ?? row[y] ?? row.value ?? row.Value ?? Object.values(row)[1] ?? 0;
        return {
          ...row,
          x_val: xVal !== undefined && xVal !== null ? String(xVal) : "",
          y_val: Number(yVal) || 0,
        };
      });
      const spec = buildSpec(chartType, x || "label", y || "value", aggregate, title, filterDefs);
      const option = buildOption(spec, normalizedRows);
      if (!option) {
        commit({ status: "error", message: "Aucune donnée à afficher." });
        return;
      }
      commit({ status: "ok", option, rows: normalizedRows, spec, sql: "-- données synthétiques" });
      return;
    }

    if (!tableName) {
      commit({ status: "error", message: "Aucun jeu de données actif." });
      return;
    }
    if (!x || !y) {
      commit({ status: "error", message: "Champs manquants pour le graphique." });
      return;
    }

    // Resolve exact column names (case-insensitive) against dataset.columns
    let actualX = x;
    let actualY = y;
    if (dataset?.columns && dataset.columns.length > 0) {
      const matchX = dataset.columns.find((c) => c.name.toLowerCase() === x.toLowerCase());
      const matchY = dataset.columns.find((c) => c.name.toLowerCase() === y.toLowerCase());

      if (!matchX || !matchY) {
        const missing = !matchX ? x : y;
        const available = dataset.columns
          .map((c) => c.name)
          .slice(0, 8)
          .join(", ");
        commit({
          status: "error",
          message: `La colonne « ${missing} » n'existe pas dans la table "${dataset.name || tableName}". Colonnes disponibles : ${available}${dataset.columns.length > 8 ? "…" : ""}`,
        });
        return;
      }
      actualX = matchX.name;
      actualY = matchY.name;
    }

    const spec = buildSpec(chartType, actualX, actualY, aggregate, title, filterDefs);
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
        const option = buildOption(spec, rows);
        if (!option) {
          commit({ status: "error", message: "Aucune donnée à afficher." });
          return;
        }
        commit({ status: "ok", option, rows, spec, sql });
      })
      .catch((error) => {
        commit({ status: "error", message: errorMessage(error) });
      });
  }, [tableName, dataset, chartType, x, y, aggregate, title, filterDefs, part.rows]);

  const interactiveOption = useMemo(() => {
    if (state.status !== "ok" || !state.option) return null;
    const opt = state.option as Record<string, unknown>;
    const series = Array.isArray(opt.series)
      ? opt.series.map((s) =>
          typeof s === "object" && s !== null
            ? { ...(s as Record<string, unknown>), cursor: "pointer" }
            : s,
        )
      : opt.series;
    return {
      ...opt,
      series,
    };
  }, [state]);

  if (state.status === "loading") return <ArtifactSkeleton />;
  if (state.status === "error") return <ArtifactError message={state.message} />;

  const { option, rows, spec, sql } = state;

  const handleChartClick = (params: {
    name?: string;
    value?: unknown;
    seriesName?: string;
    data?: Record<string, unknown>;
  }) => {
    let name = "";
    let valStr = "";

    if (params.name) {
      name = String(params.name);
    } else if (Array.isArray(params.value)) {
      name = String(params.value[0]);
    } else if (params.data && typeof params.data === "object") {
      name = String(params.data.name ?? (x ? params.data[x] : "") ?? "");
    }

    if (Array.isArray(params.value)) {
      valStr = formatMetricValue(params.value[1] ?? params.value[0]);
    } else if (params.value !== undefined && params.value !== null) {
      valStr = formatMetricValue(params.value);
    } else if (params.data && typeof params.data === "object") {
      valStr = formatMetricValue(params.data.value ?? (y ? params.data[y] : "") ?? "");
    }

    if (!name && !valStr) return;
    setSelectedPoint({ name: name || String(valStr), value: valStr });
  };

  return (
    <Artifact className="mb-4 border-ai/30 shadow-xs">
      <ArtifactHeader className="items-start px-3 py-2">
        <div className="flex min-w-0 items-start gap-2">
          <BarChart3 aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-ai" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ArtifactTitle className="truncate">{title}</ArtifactTitle>
              <Badge
                variant="outline"
                className="h-4.5 gap-1 border-ai/40 bg-ai/10 px-1.5 py-0 text-[10px] font-medium text-ai shadow-xs"
              >
                <Sparkles className="size-2.5 text-ai animate-pulse" />
                Chat-with-Chart
              </Badge>
            </div>
            <ArtifactDescription className={cn("truncate font-mono text-[11px]")}>
              {provenanceLine(x, y, aggregate)}
              {filterDefs.length > 0 && ` · ${filterDefs.length} filtre(s) actif(s)`}
            </ArtifactDescription>
          </div>
        </div>
        <ArtifactActions>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={() =>
              openCanvas({
                kind: "chart",
                title,
                chartType,
                x,
                y,
                aggregate,
                datasetId: part.datasetId,
                rows: state.status === "ok" ? state.rows : part.rows,
              })
            }
            title="Agrandir dans le canevas latéral"
          >
            <Maximize2 className="size-3.5" />
            <span className="hidden sm:inline">Canevas</span>
          </Button>
          <PinChartButton rows={rows} spec={spec} sql={sql} tableName={tableName} title={title} />
        </ArtifactActions>
      </ArtifactHeader>
      <ArtifactContent className="p-3">
        <div className="relative w-full">
          <ReactEChartsCore
            echarts={echarts}
            option={interactiveOption ?? option}
            style={{ height: CHART_HEIGHT, width: "100%" }}
            onEvents={{
              click: handleChartClick,
            }}
            lazyUpdate
          />
        </div>

        {!selectedPoint && (
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-1.5 rounded-lg border border-ai/20 bg-ai/5 px-2.5 py-1.5 text-xs">
            <span className="flex items-center gap-1.5 text-foreground/80 text-[11px]">
              <Sparkles className="size-3 text-ai shrink-0" />
              <span>
                <strong>Chat-with-Chart :</strong> Cliquez sur une barre ou valeur pour forer ou
                filtrer
              </span>
            </span>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="h-5 text-[10px] px-1.5 text-ai hover:bg-ai/15"
                onClick={() => {
                  const prompt = `Analyse les grandes tendances et enseignements majeurs de ce graphique "${title}".`;
                  window.dispatchEvent(
                    new CustomEvent("moudir-chat:prefill-composer", {
                      detail: { text: prompt, autoSend: true },
                    }),
                  );
                }}
              >
                <MessageSquare className="size-2.5 mr-1" />
                Analyser tendances
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="h-5 text-[10px] px-1.5 text-ai hover:bg-ai/15"
                onClick={() => {
                  const prompt = `Y a-t-il des anomalies ou des valeurs atypiques remarquables dans "${title}" ?`;
                  window.dispatchEvent(
                    new CustomEvent("moudir-chat:prefill-composer", {
                      detail: { text: prompt, autoSend: true },
                    }),
                  );
                }}
              >
                <Search className="size-2.5 mr-1" />
                Détecter anomalies
              </Button>
            </div>
          </div>
        )}

        {selectedPoint && (
          <div className="mt-3 flex flex-col gap-2 rounded-lg border border-primary/20 bg-primary/5 p-2.5 text-xs transition-all">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <Sparkles className="size-3.5 text-primary shrink-0" />
                <span>Point sélectionné :</span>
                <span className="font-mono font-semibold text-primary">{selectedPoint.name}</span>
                {selectedPoint.value ? (
                  <span className="text-muted-foreground font-mono">({selectedPoint.value})</span>
                ) : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="size-5 p-0 text-muted-foreground hover:text-foreground"
                onClick={() => setSelectedPoint(null)}
                aria-label="Fermer"
              >
                <X className="size-3" />
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <Button
                type="button"
                variant="secondary"
                size="xs"
                className="h-6 gap-1 text-[11px] bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                onClick={() => {
                  if (x) {
                    addFilter({ field: x, value: selectedPoint.name, datasetId: part.datasetId });
                    toast("Filtre appliqué", {
                      description: `${x} = ${selectedPoint.name} appliqué en direct (DuckDB).`,
                    });
                  }
                }}
              >
                <Filter className="size-3 text-primary" />
                Filtrer sur cette valeur
              </Button>

              <Button
                type="button"
                variant="outline"
                size="xs"
                className="h-6 gap-1 text-[11px] bg-background/80 hover:bg-muted"
                onClick={() => {
                  const prompt = `Explique la valeur de "${selectedPoint.name}" (${selectedPoint.value ? `${y}: ${selectedPoint.value}` : ""}) pour ${y} par rapport aux autres données dans le graphique "${title}".`;
                  window.dispatchEvent(
                    new CustomEvent("moudir-chat:prefill-composer", {
                      detail: { text: prompt, autoSend: true },
                    }),
                  );
                }}
              >
                <MessageSquare className="size-3 text-primary" />
                Expliquer ce pic
              </Button>

              <Button
                type="button"
                variant="outline"
                size="xs"
                className="h-6 gap-1 text-[11px] bg-background/80 hover:bg-muted"
                onClick={() => {
                  const prompt = `Détaille la répartition et les sous-catégories pour "${selectedPoint.name}".`;
                  window.dispatchEvent(
                    new CustomEvent("moudir-chat:prefill-composer", {
                      detail: { text: prompt, autoSend: true },
                    }),
                  );
                }}
              >
                <BarChart3 className="size-3 text-primary" />
                Explorer les sous-catégories
              </Button>
            </div>
          </div>
        )}
      </ArtifactContent>
    </Artifact>
  );
}
