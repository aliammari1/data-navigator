"use client";

import ReactEChartsCore from "echarts-for-react/lib/core";
import Fuse from "fuse.js";
import {
  AlertCircle,
  BarChart3,
  Columns3,
  Database,
  Hash,
  Percent,
  RefreshCw,
  Rows3,
  Search,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Dataset } from "@/core/stores/data-store";
import { Button } from "@/components/ui/button";
import { GenericInsightPanel } from "@/features/dashboard-home/components/generic-insight-panel";
import { useGenericOverview } from "@/features/dashboard-home/hooks/use-generic-overview";
import type {
  CategoryCount,
  GenericColumnSummary,
  GenericOverview,
  NumericBucket,
} from "@/features/dashboard-home/lib/generic-overview";
import { fmtCompact, fmtN, fmtPct } from "@/features/telecom/lib/format";
import {
  type EChartsOption,
  OffscreenChart,
  supportsOffscreenChart,
} from "@/platform/viz";
import { echarts } from "@/platform/viz/echarts-core";

function ChartSkeleton() {
  return <div className="h-56 w-full animate-pulse rounded-xl bg-muted/40" />;
}

/**
 * Heavy bar/histogram charts rendered OFF the main thread via the shared
 * OffscreenChart worker (transferred OffscreenCanvas). When OffscreenCanvas /
 * Worker is unavailable, falls back to `echarts-for-react` bound to the SAME
 * tree-shaken `echarts/core` instance — never the full build — so the route
 * chunk stays small and the overview still renders everywhere.
 */
function WorkerChart({
  option,
  height,
}: {
  option: EChartsOption;
  height: number;
}) {
  const fallback = (
    <ReactEChartsCore
      echarts={echarts}
      option={option}
      style={{ height, width: "100%" }}
      lazyUpdate
    />
  );

  if (!supportsOffscreenChart()) return fallback;

  return <OffscreenChart option={option} height={height} fallback={fallback} />;
}

const ROLE_LABEL: Record<GenericColumnSummary["role"], string> = {
  numeric: "Numérique",
  temporal: "Temporel",
  categorical: "Catégoriel",
  other: "Autre",
};

const ROLE_TONE: Record<GenericColumnSummary["role"], string> = {
  numeric: "text-sky-600 dark:text-sky-400",
  temporal: "text-violet-600 dark:text-violet-400",
  categorical: "text-emerald-600 dark:text-emerald-400",
  other: "text-muted-foreground",
};

export function GenericDatasetOverview({ dataset }: { dataset: Dataset }) {
  const { data, isPending, isError, error, isFetching, refetch } =
    useGenericOverview(dataset);

  return (
    <div className=" flex-1 overflow-y-auto">
      <div className=" px-4 py-3 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-linear-to-br from-indigo-600 to-sky-600">
              <Database className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold text-foreground">
                Vue d'ensemble du dataset
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="truncate font-mono">{dataset.name}</span>
                <span>·</span>
                <span className="font-semibold text-indigo-600 dark:text-indigo-300">
                  {fmtN(dataset.rowCount)} lignes
                </span>
                <span>·</span>
                <span>{dataset.colCount} colonnes</span>
              </div>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-9 rounded-xl text-xs"
          >
            <RefreshCw
              className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
            />
            Actualiser
          </Button>
        </div>
      </div>

      <main className=" space-y-5">
        {isError && (
          <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-none text-destructive" />
            <div>
              <p className="font-semibold text-foreground">
                Impossible d'analyser le dataset
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {error instanceof Error ? error.message : "Erreur inconnue."}
              </p>
            </div>
          </div>
        )}

        {isPending && !data && <OverviewSkeleton />}

        {data && <OverviewContent overview={data} datasetName={dataset.name} />}
      </main>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-2xl border border-border bg-muted/30"
          />
        ))}
      </div>
      <ChartSkeleton />
    </div>
  );
}

function OverviewContent({
  overview,
  datasetName,
}: {
  overview: GenericOverview;
  datasetName: string;
}) {
  return (
    <>
      <KpiRow overview={overview} />

      <GenericInsightPanel overview={overview} datasetName={datasetName} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {overview.topCategorical && (
          <ChartCard
            title="Distribution catégorielle"
            subtitle={`Top valeurs — ${overview.topCategorical.column}`}
            icon={<BarChart3 className="h-4 w-4" />}
          >
            <CategoricalBar values={overview.topCategorical.values} />
          </ChartCard>
        )}

        {overview.numericHistogram && (
          <ChartCard
            title="Histogramme numérique"
            subtitle={`Répartition — ${overview.numericHistogram.column}`}
            icon={<BarChart3 className="h-4 w-4" />}
          >
            <NumericHistogram buckets={overview.numericHistogram.buckets} />
          </ChartCard>
        )}
      </div>

      <ColumnTable columns={overview.columns} rowCount={overview.rowCount} />

      <p className="pb-6 text-center text-[11px] text-muted-foreground">
        Analyse calculée localement via DuckDB · {datasetName}
      </p>
    </>
  );
}

function KpiRow({ overview }: { overview: GenericOverview }) {
  const completeness = 100 - overview.avgNullPercentage;
  const cards = [
    {
      label: "Lignes",
      value: fmtN(overview.rowCount),
      hint: fmtCompact(overview.rowCount),
      icon: <Rows3 className="h-3.5 w-3.5" />,
      tone: "text-indigo-600 dark:text-indigo-400",
    },
    {
      label: "Colonnes",
      value: fmtN(overview.columnCount),
      hint: `${overview.numericColumnCount} num · ${overview.categoricalColumnCount} cat`,
      icon: <Columns3 className="h-3.5 w-3.5" />,
      tone: "text-sky-600 dark:text-sky-400",
    },
    {
      label: "Complétude",
      value: fmtPct(completeness),
      hint: `${fmtN(overview.totalNullCells)} cellules nulles`,
      icon: <Percent className="h-3.5 w-3.5" />,
      tone:
        completeness >= 95
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-amber-600 dark:text-amber-400",
    },
    {
      label: "Colonnes numériques",
      value: fmtN(overview.numericColumnCount),
      hint: `${overview.temporalColumnCount} temporelles`,
      icon: <Hash className="h-3.5 w-3.5" />,
      tone: "text-violet-600 dark:text-violet-400",
    },
    {
      label: "Cellules totales",
      value: fmtCompact(overview.rowCount * overview.columnCount),
      hint: `${fmtN(overview.rowCount)} × ${overview.columnCount}`,
      icon: <Database className="h-3.5 w-3.5" />,
      tone: "text-foreground",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-2xl border border-border bg-card p-3.5 transition-colors hover:bg-accent/40"
        >
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              {card.label}
            </span>
            <span className={card.tone}>{card.icon}</span>
          </div>
          <div
            className={`text-xl font-bold leading-none tabular-nums ${card.tone}`}
          >
            {card.value}
          </div>
          <div className="mt-1.5 truncate text-[11px] text-muted-foreground">
            {card.hint}
          </div>
        </div>
      ))}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-start gap-2.5">
        <div className="mt-0.5 text-indigo-600 dark:text-indigo-400">
          {icon}
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">
            {title}
          </h3>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function CategoricalBar({ values }: { values: CategoryCount[] }) {
  const option = useMemo<EChartsOption>(() => {
    const labels = values.map((v) => v.label);
    const counts = values.map((v) => v.count);
    return {
      grid: { left: 8, right: 24, top: 8, bottom: 8, containLabel: true },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      xAxis: { type: "value", splitLine: { lineStyle: { opacity: 0.15 } } },
      yAxis: {
        type: "category",
        inverse: true,
        data: labels,
        axisLabel: { fontSize: 11 },
      },
      series: [
        {
          type: "bar",
          data: counts,
          itemStyle: { color: "#6366f1", borderRadius: [0, 4, 4, 0] },
          barMaxWidth: 18,
        },
      ],
    };
  }, [values]);

  return (
    <WorkerChart option={option} height={Math.max(224, values.length * 26)} />
  );
}

function NumericHistogram({ buckets }: { buckets: NumericBucket[] }) {
  const option = useMemo<EChartsOption>(() => {
    const labels = buckets.map((b) => fmtCompact(b.start));
    const counts = buckets.map((b) => b.count);
    return {
      grid: { left: 8, right: 12, top: 8, bottom: 8, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params: unknown) => {
          const arr = params as Array<{ dataIndex: number }>;
          const p = arr[0];
          if (!p) return "";
          const b = buckets[p.dataIndex];
          if (!b) return "";
          return `${fmtCompact(b.start)} – ${fmtCompact(b.end)}<br/><b>${fmtN(b.count)}</b>`;
        },
      },
      xAxis: {
        type: "category",
        data: labels,
        axisLabel: { fontSize: 10, hideOverlap: true },
      },
      yAxis: { type: "value", splitLine: { lineStyle: { opacity: 0.15 } } },
      series: [
        {
          type: "bar",
          data: counts,
          itemStyle: { color: "#0ea5e9", borderRadius: [4, 4, 0, 0] },
        },
      ],
    };
  }, [buckets]);

  return <WorkerChart option={option} height={224} />;
}

function ColumnTable({
  columns,
  rowCount,
}: {
  columns: GenericColumnSummary[];
  rowCount: number;
}) {
  const [search, setSearch] = useState("");
  const parentRef = useRef<HTMLDivElement>(null);

  // Fuse over column names/types so large schemas stay navigable offline.
  const fuse = useMemo(
    () =>
      new Fuse(columns, {
        keys: ["name", "type"],
        threshold: 0.35,
        ignoreLocation: true,
      }),
    [columns],
  );

  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return columns;
    return fuse.search(q).map((r) => r.item);
  }, [search, columns, fuse]);

  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 10,
  });

  return (
    <div className="rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">
          Schéma · {columns.length} colonnes
        </h3>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-2 size-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrer les colonnes…"
            className="w-full rounded-lg border border-input bg-background py-1.5 pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring/50"
          />
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_72px_72px_minmax(0,1.4fr)] gap-2 border-b border-border bg-muted/30 px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        <span>Colonne</span>
        <span>Type</span>
        <span className="text-right">Uniques</span>
        <span className="text-right">Nuls %</span>
        <span>Min · Max</span>
      </div>

      {filtered.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
          Aucune colonne ne correspond.
        </div>
      ) : (
        <div ref={parentRef} className="max-h-[420px] overflow-y-auto">
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const col = filtered[virtualRow.index];
              return (
                <div
                  key={`${col.name}-${virtualRow.index}`}
                  className="absolute left-0 top-0 grid w-full grid-cols-[minmax(0,2fr)_minmax(0,1fr)_72px_72px_minmax(0,1.4fr)] items-center gap-2 border-b border-border/60 px-4 text-xs"
                  style={{
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <span className="truncate font-mono font-medium text-foreground">
                    {col.name}
                  </span>
                  <span className={`truncate font-medium ${ROLE_TONE[col.role]}`}>
                    {ROLE_LABEL[col.role]}
                  </span>
                  <span className="text-right tabular-nums text-muted-foreground">
                    {fmtCompact(col.approxUnique)}
                  </span>
                  <span
                    className={`text-right tabular-nums ${
                      col.nullPercentage > 5
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-muted-foreground"
                    }`}
                  >
                    {col.nullPercentage.toFixed(1)}
                  </span>
                  <span className="truncate text-muted-foreground">
                    {formatRange(col)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
        {fmtN(rowCount)} lignes analysées
      </div>
    </div>
  );
}

function formatRange(col: GenericColumnSummary): string {
  if (col.min === null && col.max === null) return "—";
  const min = col.min ?? "—";
  const max = col.max ?? "—";
  if (min === max) return min;
  return `${min} · ${max}`;
}
