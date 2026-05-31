"use client";

import {
  AlertTriangle,
  BarChart3,
  Calendar,
  CheckCircle2,
  Copy,
  Database,
  Download,
  Eye,
  FileSearch,
  Fingerprint,
  Grid3x3,
  Hash,
  Layers,
  Percent,
  RefreshCw,
  Search,
  Shield,
  Sigma,
  SlidersHorizontal,
  Star,
  Table2,
  TrendingUp,
  Type,
  X,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDataStore } from "@/core/stores/data-store";
import {
  listRegisteredDatasets,
  runReadOnlyQuery,
  type RegisteredDataset,
} from "@/platform/duckdb/duckdb";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

import {
  QualityRing,
  StatGrid,
} from "@/features/parsed-data/components/profile-cards";
import {
  qualityColor,
  qualityLabel,
  typeColor,
  typeIcon,
} from "@/features/parsed-data/model/profile-format";
import type {
  ColProfile,
  QualityDimension,
} from "@/features/parsed-data/model/types";
import { cn } from "@/shared/utils";

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";

  const text = String(value);

  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

function numberOrUndefined(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;

  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function toProfileType(sqlType: string): ColProfile["type"] {
  const type = sqlType.toUpperCase();

  if (
    /TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT/.test(
      type,
    )
  ) {
    return "integer";
  }

  if (/DECIMAL|DOUBLE|FLOAT|REAL|NUMERIC/.test(type)) return "float";
  if (/BOOL/.test(type)) return "boolean";
  if (/DATE|TIME|TIMESTAMP|INTERVAL/.test(type)) return "date";
  if (/VARCHAR|TEXT|CHAR|STRING|UUID|BLOB/.test(type)) return "string";

  return "unknown";
}

function appTypeToDuckType(type: string): string {
  if (type === "number") return "DOUBLE";
  if (type === "boolean") return "BOOLEAN";
  if (type === "date") return "TIMESTAMP";

  return "VARCHAR";
}

function profileScore(profile: ColProfile): number {
  return (
    profile.completeness * 0.5 +
    profile.uniqueness * 0.25 +
    profile.validity * 0.25
  );
}

function datasetColumnDefs(
  dataset: RegisteredDataset | null,
  fallbackDataset:
    | {
        columns: Array<{ name: string; type: string }>;
      }
    | null,
): Array<{
  index: number;
  name: string;
  type: ColProfile["type"];
  sqlType: string;
}> {
  if (dataset) {
    return dataset.columns.map((column, index) => ({
      index,
      name: column.name,
      type: toProfileType(column.type),
      sqlType: column.type,
    }));
  }

  if (fallbackDataset) {
    return fallbackDataset.columns.map((column, index) => {
      const sqlType = appTypeToDuckType(column.type);

      return {
        index,
        name: column.name,
        type: toProfileType(sqlType),
        sqlType,
      };
    });
  }

  return [];
}

function formatNumber(value: number | undefined, digits = 2): string {
  if (value === undefined || Number.isNaN(value)) return "—";

  return value.toLocaleString(undefined, {
    maximumFractionDigits: digits,
  });
}

function getDatasetViewName(
  dataset: RegisteredDataset | null,
  fallbackDataset:
    | {
        tableName?: string;
        viewName?: string;
      }
    | null,
): string | null {
  return dataset?.viewName ?? fallbackDataset?.viewName ?? fallbackDataset?.tableName ?? null;
}

function getDatasetDisplayName(
  dataset: RegisteredDataset | null,
  fallbackDataset:
    | {
        name?: string;
      }
    | null,
  viewName: string | null,
): string {
  return dataset?.displayName ?? fallbackDataset?.name ?? viewName ?? "Dataset";
}

function getDatasetRowCount(
  dataset: RegisteredDataset | null,
  fallbackDataset:
    | {
        rowCount?: number;
      }
    | null,
): number {
  return dataset?.rowCount ?? fallbackDataset?.rowCount ?? 0;
}

function buildQualityDimensions(profiles: ColProfile[]): QualityDimension[] {
  const profileCount = Math.max(profiles.length, 1);
  const avgCompleteness =
    profiles.reduce((sum, profile) => sum + profile.completeness, 0) /
    profileCount;
  const avgUniqueness =
    profiles.reduce((sum, profile) => sum + profile.uniquenessRate, 0) /
    profileCount;
  const avgValidity =
    profiles.reduce((sum, profile) => sum + profile.validity, 0) /
    profileCount;
  const consistency =
    profiles.filter((profile) => profile.nullRate < 0.01).length / profileCount;

  return [
    {
      name: "Completeness",
      score: avgCompleteness,
      description: "Proportion of non-null values across all columns",
      affected: profiles
        .filter((profile) => profile.completeness < 0.95)
        .map((profile) => profile.name),
    },
    {
      name: "Uniqueness",
      score: Math.min(1, avgUniqueness * 2),
      description: "How unique values are relative to total rows",
      affected: profiles
        .filter((profile) => profile.uniquenessRate < 0.1)
        .map((profile) => profile.name),
    },
    {
      name: "Validity",
      score: avgValidity,
      description: "Values conform to expected type and format",
      affected: profiles
        .filter((profile) => profile.validity < 0.8)
        .map((profile) => profile.name),
    },
    {
      name: "Consistency",
      score: consistency,
      description: "Columns with less than 1% null values",
      affected: profiles
        .filter((profile) => profile.nullRate >= 0.01)
        .map((profile) => profile.name),
    },
  ];
}

function DatasetEmptyState() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-background via-background to-violet-950/30 p-6">
      <div className="max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-2xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-violet-500/10 text-violet-500">
          <Database className="h-8 w-8" />
        </div>

        <h1 className="mt-5 text-xl font-bold text-foreground">
          No dataset loaded
        </h1>

        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Import a CSV, TXT, TSV, or Parquet dataset first. Once a dataset is in
          the DuckDB catalog, this page will generate a full column profile.
        </p>
      </div>
    </div>
  );
}

function ColumnListCard({
  profile,
  selected,
  onClick,
}: {
  profile: ColProfile;
  selected: boolean;
  onClick: () => void;
}) {
  const Icon = typeIcon(profile.type);
  const score = profileScore(profile);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group w-full rounded-2xl border p-3 text-left transition-all",
        selected
          ? "border-violet-500/50 bg-violet-500/10 shadow-sm"
          : "border-border bg-card hover:border-violet-500/30 hover:bg-muted/40",
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn("rounded-xl p-2", typeColor(profile.type))}>
          <Icon className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-sm font-semibold text-foreground">
            {profile.name}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              {profile.sqlType}
            </span>

            {profile.nullRate > 0.05 && (
              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-600 dark:text-amber-300">
                {(profile.nullRate * 100).toFixed(1)}% null
              </span>
            )}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${score * 100}%`,
                  backgroundColor: qualityColor(score),
                }}
              />
            </div>
            <span
              className="text-[10px] font-bold"
              style={{ color: qualityColor(score) }}
            >
              {(score * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  tone,
  sub,
}: {
  label: string;
  value: string | number;
  icon: typeof Database;
  tone: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-medium text-muted-foreground">
            {label}
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-foreground">
            {value}
          </div>
          {sub && <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>}
        </div>
        <div className={cn("rounded-2xl p-3", tone)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

export default function ParsedDataScreen() {
  const {
    datasets,
    activeDatasetId,
    setActiveDataset,
    replaceDatasetsFromCatalog,
  } = useDataStore();

  const activeStoreDataset =
    datasets.find((dataset) => dataset.id === activeDatasetId) ?? null;

  const [catalog, setCatalog] = useState<RegisteredDataset[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const activeCatalogDataset =
    catalog.find((dataset) => dataset.id === activeDatasetId) ??
    catalog[0] ??
    null;

  const activeViewName = getDatasetViewName(
    activeCatalogDataset,
    activeStoreDataset,
  );
  const activeDisplayName = getDatasetDisplayName(
    activeCatalogDataset,
    activeStoreDataset,
    activeViewName,
  );
  const activeRowCount = getDatasetRowCount(
    activeCatalogDataset,
    activeStoreDataset,
  );

  const columnDefs = useMemo(
    () => datasetColumnDefs(activeCatalogDataset, activeStoreDataset),
    [activeCatalogDataset, activeStoreDataset],
  );

  const [profiles, setProfiles] = useState<ColProfile[]>([]);
  const [selectedCol, setSelectedCol] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState("");
  const [profileProgress, setProfileProgress] = useState({
    done: 0,
    total: 0,
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [qualityFilter, setQualityFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<
    "name" | "nullRate" | "distinctCount" | "quality"
  >("quality");
  const [sortAsc, setSortAsc] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState<
    "overview" | "distribution" | "quality" | "samples"
  >("overview");
  const [qualityDimensions, setQualityDimensions] = useState<
    QualityDimension[]
  >([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const refreshCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError(null);

    try {
      const nextCatalog = await listRegisteredDatasets();

      setCatalog(nextCatalog);
      replaceDatasetsFromCatalog(nextCatalog);

      if (!activeDatasetId && nextCatalog[0]) {
        setActiveDataset(nextCatalog[0].id);
      }
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : String(error));
    } finally {
      setCatalogLoading(false);
    }
  }, [activeDatasetId, replaceDatasetsFromCatalog, setActiveDataset]);

  useEffect(() => {
    refreshCatalog();
  }, [refreshCatalog, refreshKey]);

  const computeProfiles = useCallback(
    async (
      tableName: string,
      defs: Array<{
        index: number;
        name: string;
        type: ColProfile["type"];
        sqlType: string;
      }>,
      isCancelled: () => boolean,
    ) => {
      setLoading(true);
      setProfiles([]);
      setSelectedCol(null);
      setQualityDimensions([]);
      setProfileProgress({ done: 0, total: defs.length });

      const profileResults: ColProfile[] = [];
      const quotedTable = quoteIdentifier(tableName);

      for (let columnIndex = 0; columnIndex < defs.length; columnIndex += 1) {
        if (isCancelled()) break;

        const column = defs[columnIndex];
        const quotedColumn = quoteIdentifier(column.name);

        setLoadingStage(
          `Profiling ${columnIndex + 1}/${defs.length}: ${column.name}`,
        );

        try {
          const baseRows = await runReadOnlyQuery(`
            SELECT
              COUNT(*) AS total,
              COUNT(${quotedColumn}) AS non_null,
              COUNT(DISTINCT ${quotedColumn}) AS distinct_count
            FROM ${quotedTable}
          `);

          const base = baseRows[0] ?? {};
          const total = Number(base.total ?? 0);
          const nonNull = Number(base.non_null ?? 0);
          const nullCount = Math.max(0, total - nonNull);
          const nullRate = total > 0 ? nullCount / total : 0;
          const distinctCount = Number(base.distinct_count ?? 0);

          const topRows = await runReadOnlyQuery(`
            SELECT
              CAST(${quotedColumn} AS VARCHAR) AS val,
              COUNT(*) AS cnt
            FROM ${quotedTable}
            WHERE ${quotedColumn} IS NOT NULL
            GROUP BY val
            ORDER BY cnt DESC
            LIMIT 10
          `);

          const topValues = topRows.map((row) => ({
            value: String(row.val ?? ""),
            count: Number(row.cnt ?? 0),
            pct: total > 0 ? Number(row.cnt ?? 0) / total : 0,
          }));

          const profile: ColProfile = {
            name: column.name,
            index: column.index,
            type: column.type,
            sqlType: column.sqlType,
            rowCount: total,
            nullCount,
            nullRate,
            distinctCount,
            uniquenessRate: total > 0 ? distinctCount / total : 0,
            topValues,
            completeness: 1 - nullRate,
            uniqueness: Math.min(1, distinctCount / Math.max(total * 0.5, 1)),
            validity: column.type !== "unknown" ? 0.95 : 0.5,
          };

          if (column.type === "integer" || column.type === "float") {
            const numericRows = await runReadOnlyQuery(`
              SELECT
                MIN(${quotedColumn}) AS min_val,
                MAX(${quotedColumn}) AS max_val,
                AVG(${quotedColumn}) AS avg_val,
                STDDEV_SAMP(${quotedColumn}) AS std_val,
                MEDIAN(${quotedColumn}) AS median_val,
                PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY ${quotedColumn}) AS p25,
                PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY ${quotedColumn}) AS p75,
                SUM(${quotedColumn}) AS sum_val
              FROM ${quotedTable}
              WHERE ${quotedColumn} IS NOT NULL
            `);

            const numeric = numericRows[0] ?? {};

            profile.min = numberOrUndefined(numeric.min_val);
            profile.max = numberOrUndefined(numeric.max_val);
            profile.avg = numberOrUndefined(numeric.avg_val);
            profile.stddev = numberOrUndefined(numeric.std_val);
            profile.median = numberOrUndefined(numeric.median_val);
            profile.p25 = numberOrUndefined(numeric.p25);
            profile.p75 = numberOrUndefined(numeric.p75);
            profile.sum = numberOrUndefined(numeric.sum_val);

            if (
              profile.min !== undefined &&
              profile.max !== undefined &&
              profile.max > profile.min
            ) {
              const binCount = 20;
              const range = profile.max - profile.min;
              const binWidth = range / binCount;

              const histogramRows = await runReadOnlyQuery(`
                SELECT
                  FLOOR((${quotedColumn} - ${profile.min}) / ${binWidth}) AS bin,
                  COUNT(*) AS cnt
                FROM ${quotedTable}
                WHERE ${quotedColumn} IS NOT NULL
                GROUP BY bin
                ORDER BY bin
              `);

              const bins: { lo: number; hi: number; count: number }[] =
                Array.from({ length: binCount }, (_, index) => ({
                  lo: profile.min! + index * binWidth,
                  hi: profile.min! + (index + 1) * binWidth,
                  count: 0,
                }));

              for (const row of histogramRows) {
                const bin = Number(row.bin ?? 0);
                const idx = Math.min(Math.max(0, bin), binCount - 1);
                bins[idx].count = Number(row.cnt ?? 0);
              }

              profile.histogram = bins;
            }
          }

          if (column.type === "string") {
            const stringRows = await runReadOnlyQuery(`
              SELECT
                MIN(LENGTH(${quotedColumn})) AS min_len,
                MAX(LENGTH(${quotedColumn})) AS max_len,
                AVG(LENGTH(${quotedColumn})) AS avg_len
              FROM ${quotedTable}
              WHERE ${quotedColumn} IS NOT NULL
            `);

            const stringStats = stringRows[0] ?? {};

            profile.minLen = numberOrUndefined(stringStats.min_len);
            profile.maxLen = numberOrUndefined(stringStats.max_len);
            profile.avgLen = numberOrUndefined(stringStats.avg_len);
          }

          profileResults.push(profile);
        } catch (error) {
          console.error(`Error profiling ${column.name}:`, error);

          profileResults.push({
            name: column.name,
            index: column.index,
            type: column.type,
            sqlType: column.sqlType,
            rowCount: 0,
            nullCount: 0,
            nullRate: 0,
            distinctCount: 0,
            uniquenessRate: 0,
            topValues: [],
            completeness: 0,
            uniqueness: 0,
            validity: 0,
          });
        }

        if (!isCancelled()) {
          setProfileProgress({
            done: columnIndex + 1,
            total: defs.length,
          });
          setProfiles([...profileResults]);
        }
      }

      if (!isCancelled()) {
        setProfiles(profileResults);
        setQualityDimensions(buildQualityDimensions(profileResults));
        setSelectedCol((current) => current ?? profileResults[0]?.name ?? null);
        setLoading(false);
        setLoadingStage("");
      }
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    async function initProfile() {
      if (!activeViewName || columnDefs.length === 0) {
        setProfiles([]);
        setSelectedCol(null);
        setQualityDimensions([]);
        setLoading(false);
        return;
      }

      await computeProfiles(activeViewName, columnDefs, () => cancelled);
    }

    initProfile();

    return () => {
      cancelled = true;
    };
  }, [activeViewName, columnDefs, refreshKey, computeProfiles]);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.name === selectedCol) ?? null,
    [profiles, selectedCol],
  );

  const filteredProfiles = useMemo(() => {
    let list = [...profiles];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();

      list = list.filter(
        (profile) =>
          profile.name.toLowerCase().includes(query) ||
          profile.type.includes(query) ||
          profile.sqlType.toLowerCase().includes(query),
      );
    }

    if (typeFilter !== "all") {
      list = list.filter((profile) => profile.type === typeFilter);
    }

    if (qualityFilter !== "all") {
      list = list.filter((profile) => {
        const score = profileScore(profile);

        if (qualityFilter === "excellent") return score >= 0.9;
        if (qualityFilter === "good") return score >= 0.7 && score < 0.9;
        if (qualityFilter === "fair") return score >= 0.5 && score < 0.7;

        return score < 0.5;
      });
    }

    list.sort((a, b) => {
      let first: number | string = 0;
      let second: number | string = 0;

      if (sortBy === "name") {
        first = a.name;
        second = b.name;
      } else if (sortBy === "nullRate") {
        first = a.nullRate;
        second = b.nullRate;
      } else if (sortBy === "distinctCount") {
        first = a.distinctCount;
        second = b.distinctCount;
      } else {
        first = profileScore(a);
        second = profileScore(b);
      }

      if (typeof first === "string") {
        return sortAsc
          ? first.localeCompare(String(second))
          : String(second).localeCompare(first);
      }

      return sortAsc
        ? first - Number(second)
        : Number(second) - first;
    });

    return list;
  }, [
    profiles,
    searchQuery,
    typeFilter,
    qualityFilter,
    sortBy,
    sortAsc,
  ]);

  const overallScore = useMemo(() => {
    if (!profiles.length) return 0;

    return (
      profiles.reduce((sum, profile) => sum + profileScore(profile), 0) /
      profiles.length
    );
  }, [profiles]);

  const nullColumnsCount = useMemo(
    () => profiles.filter((profile) => profile.nullCount > 0).length,
    [profiles],
  );

  const numericColumnsCount = useMemo(
    () =>
      profiles.filter(
        (profile) => profile.type === "integer" || profile.type === "float",
      ).length,
    [profiles],
  );

  const overviewQualityChart = useMemo(() => {
    if (!profiles.length) return null;

    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: "#0f172a",
        borderColor: "rgba(255,255,255,0.12)",
        textStyle: { color: "#e2e8f0" },
      },
      legend: {
        data: ["Completeness", "Validity"],
        textStyle: { color: "#94a3b8" },
        top: 5,
      },
      grid: { top: 50, bottom: 70, left: 55, right: 20 },
      xAxis: {
        type: "category",
        data: profiles.map((profile) => profile.name),
        axisLabel: { color: "#94a3b8", rotate: 35, fontSize: 10 },
        axisLine: { lineStyle: { color: "#334155" } },
      },
      yAxis: {
        type: "value",
        min: 0,
        max: 1,
        axisLabel: {
          color: "#94a3b8",
          formatter: (value: number) => `${(value * 100).toFixed(0)}%`,
        },
        splitLine: { lineStyle: { color: "rgba(148,163,184,0.14)" } },
      },
      series: [
        {
          name: "Completeness",
          type: "bar",
          data: profiles.map((profile) =>
            Number(profile.completeness.toFixed(4)),
          ),
          itemStyle: { color: "#22c55e", borderRadius: [4, 4, 0, 0] },
          barMaxWidth: 18,
        },
        {
          name: "Validity",
          type: "line",
          data: profiles.map((profile) => Number(profile.validity.toFixed(4))),
          lineStyle: { color: "#6366f1", width: 2 },
          itemStyle: { color: "#6366f1" },
          symbol: "circle",
          symbolSize: 5,
        },
      ],
    };
  }, [profiles]);

  const typeDistChart = useMemo(() => {
    const counts: Record<string, number> = {};

    for (const profile of profiles) {
      counts[profile.type] = (counts[profile.type] ?? 0) + 1;
    }

    const typeColors: Record<string, string> = {
      integer: "#3b82f6",
      float: "#6366f1",
      string: "#a855f7",
      boolean: "#22c55e",
      date: "#f97316",
      unknown: "#64748b",
    };

    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item",
        backgroundColor: "#0f172a",
        borderColor: "rgba(255,255,255,0.12)",
        textStyle: { color: "#e2e8f0" },
      },
      series: [
        {
          type: "pie",
          radius: ["48%", "74%"],
          data: Object.entries(counts).map(([name, value]) => ({
            name,
            value,
            itemStyle: { color: typeColors[name] ?? "#64748b" },
          })),
          label: { color: "#94a3b8", fontSize: 11 },
        },
      ],
    };
  }, [profiles]);

  const nullHeatmapData = useMemo(() => {
    if (!profiles.length) return null;

    return {
      backgroundColor: "transparent",
      tooltip: {
        formatter: (params: { data: [number, number, number] }) =>
          `${profiles[params.data[0]]?.name ?? ""}<br/>Null rate: ${(params.data[2] * 100).toFixed(2)}%`,
      },
      grid: { top: 20, bottom: 40, left: 80, right: 20 },
      xAxis: {
        type: "category",
        data: profiles.map((profile) => profile.name),
        axisLabel: { color: "#94a3b8", rotate: 35, fontSize: 10 },
      },
      yAxis: {
        type: "category",
        data: ["Null Rate"],
        axisLabel: { color: "#94a3b8" },
      },
      visualMap: {
        min: 0,
        max: 0.2,
        calculable: false,
        orient: "horizontal",
        show: false,
        inRange: { color: ["#1e293b", "#f97316", "#ef4444"] },
      },
      series: [
        {
          type: "heatmap",
          data: profiles.map((profile, index) => [
            index,
            0,
            Number(profile.nullRate.toFixed(4)),
          ]),
          label: {
            show: true,
            formatter: (params: { data: [number, number, number] }) =>
              params.data[2] === 0
                ? "✓"
                : `${(params.data[2] * 100).toFixed(0)}%`,
            color: "#fff",
            fontSize: 10,
          },
        },
      ],
    };
  }, [profiles]);

  const histogramChart = useMemo(() => {
    if (!selectedProfile?.histogram) return null;

    const bins = selectedProfile.histogram;

    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: "#0f172a",
        borderColor: "rgba(255,255,255,0.12)",
        textStyle: { color: "#e2e8f0" },
        formatter: (params: Array<{ data: number; name: string }>) =>
          `${params[0].name}<br/>Count: ${params[0].data.toLocaleString()}`,
      },
      grid: { top: 20, bottom: 50, left: 50, right: 20 },
      xAxis: {
        type: "category",
        data: bins.map((bin) => bin.lo.toFixed(1)),
        axisLabel: { color: "#94a3b8", rotate: 30, fontSize: 9 },
        axisLine: { lineStyle: { color: "#334155" } },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: "#94a3b8" },
        splitLine: { lineStyle: { color: "rgba(148,163,184,0.14)" } },
      },
      series: [
        {
          type: "bar",
          data: bins.map((bin) => bin.count),
          barWidth: "95%",
          itemStyle: {
            color: "#6366f1",
            borderRadius: [4, 4, 0, 0],
          },
        },
      ],
    };
  }, [selectedProfile]);

  const topValuesChart = useMemo(() => {
    if (!selectedProfile?.topValues.length) return null;

    const topValues = selectedProfile.topValues.slice(0, 10);

    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: "#0f172a",
        borderColor: "rgba(255,255,255,0.12)",
        textStyle: { color: "#e2e8f0" },
      },
      grid: { top: 10, bottom: 40, left: 20, right: 80 },
      xAxis: {
        type: "value",
        axisLabel: { color: "#94a3b8" },
        splitLine: { lineStyle: { color: "rgba(148,163,184,0.14)" } },
      },
      yAxis: {
        type: "category",
        data: topValues.map((value) => value.value.substring(0, 20)).reverse(),
        axisLabel: { color: "#94a3b8", fontSize: 11 },
        axisLine: { lineStyle: { color: "#334155" } },
      },
      series: [
        {
          type: "bar",
          data: topValues.map((value) => value.count).reverse(),
          barMaxWidth: 20,
          itemStyle: { color: "#8b5cf6", borderRadius: [0, 4, 4, 0] },
          label: {
            show: true,
            position: "right",
            color: "#94a3b8",
            fontSize: 10,
            formatter: (params: { value: number }) =>
              params.value.toLocaleString(),
          },
        },
      ],
    };
  }, [selectedProfile]);

  const exportProfiles = useCallback(() => {
    const header = [
      "name",
      "type",
      "rowCount",
      "nullCount",
      "nullRate",
      "distinctCount",
      "uniquenessRate",
      "min",
      "max",
      "avg",
      "stddev",
      "completeness",
      "validity",
    ];

    const rows = profiles.map((profile) => [
      profile.name,
      profile.type,
      profile.rowCount,
      profile.nullCount,
      profile.nullRate.toFixed(4),
      profile.distinctCount,
      profile.uniquenessRate.toFixed(4),
      profile.min ?? "",
      profile.max ?? "",
      profile.avg ?? "",
      profile.stddev ?? "",
      profile.completeness.toFixed(4),
      profile.validity.toFixed(4),
    ]);

    const csv = [header, ...rows]
      .map((row) => row.map(csvEscape).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = `${activeDisplayName.replace(/\W/g, "_").toLowerCase()}_column_profiles.csv`;
    anchor.click();

    URL.revokeObjectURL(url);
  }, [profiles, activeDisplayName]);

  if (!activeViewName && !loading && !catalogLoading) {
    return <DatasetEmptyState />;
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-background via-background to-violet-950/20 text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-xl">
        <div className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-12 w-12 flex-none items-center justify-center rounded-3xl bg-linear-to-br from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-500/20">
              <FileSearch className="h-6 w-6" />
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-bold text-foreground">
                  Data Profile
                </h1>
                <span
                  className="rounded-full px-2 py-0.5 text-xs font-semibold"
                  style={{
                    color: qualityColor(overallScore),
                    backgroundColor: `${qualityColor(overallScore)}20`,
                  }}
                >
                  {qualityLabel(overallScore)}
                </span>
              </div>

              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {activeDisplayName} · {activeViewName}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {catalog.length > 0 && (
              <select
                value={activeCatalogDataset?.id ?? activeDatasetId ?? ""}
                onChange={(event) => setActiveDataset(event.target.value)}
                className="h-10 min-w-52 rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none"
              >
                {catalog.map((dataset) => (
                  <option key={dataset.id} value={dataset.id}>
                    {dataset.displayName}
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              onClick={exportProfiles}
              disabled={loading || !profiles.length}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Export
            </button>

            <button
              type="button"
              onClick={() => {
                setProfiles([]);
                setRefreshKey((key) => key + 1);
              }}
              disabled={loading || catalogLoading}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              <RefreshCw
                className={cn("h-4 w-4", (loading || catalogLoading) && "animate-spin")}
              />
              Refresh
            </button>
          </div>
        </div>

        {(loading || catalogLoading || catalogError) && (
          <div className="border-t border-border px-5 py-3">
            {catalogError ? (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                {catalogError}
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card px-4 py-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Database className="h-4 w-4 animate-pulse text-violet-500" />
                    {catalogLoading
                      ? "Refreshing dataset catalog..."
                      : loadingStage || "Profiling dataset..."}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {profileProgress.total > 0
                      ? `${profileProgress.done}/${profileProgress.total}`
                      : ""}
                  </div>
                </div>

                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <motion.div
                    className="h-full rounded-full bg-linear-to-r from-violet-500 to-fuchsia-500"
                    animate={{
                      width:
                        profileProgress.total > 0
                          ? `${Math.max(
                              6,
                              (profileProgress.done /
                                profileProgress.total) *
                                100,
                            )}%`
                          : "8%",
                    }}
                    transition={{ duration: 0.35 }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </header>

      <main className="grid gap-5 p-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <MetricCard
              label="Rows"
              value={activeRowCount.toLocaleString()}
              icon={Hash}
              tone="bg-blue-500/10 text-blue-500"
            />
            <MetricCard
              label="Columns"
              value={columnDefs.length.toLocaleString()}
              icon={Layers}
              tone="bg-violet-500/10 text-violet-500"
            />
            <MetricCard
              label="Numeric"
              value={numericColumnsCount.toLocaleString()}
              icon={Sigma}
              tone="bg-emerald-500/10 text-emerald-500"
            />
            <MetricCard
              label="With nulls"
              value={nullColumnsCount.toLocaleString()}
              icon={AlertTriangle}
              tone="bg-amber-500/10 text-amber-500"
            />
          </div>

          <div className="rounded-3xl border border-border bg-card p-4">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-foreground">
                  Column Explorer
                </h2>
                <p className="text-xs text-muted-foreground">
                  Search, filter and inspect columns.
                </p>
              </div>
              <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
            </div>

            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search columns..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none transition-colors focus:border-violet-500/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <select
                  value={typeFilter}
                  onChange={(event) => setTypeFilter(event.target.value)}
                  className="h-9 rounded-xl border border-border bg-background px-2 text-xs text-foreground outline-none"
                >
                  <option value="all">All types</option>
                  <option value="integer">Integer</option>
                  <option value="float">Float</option>
                  <option value="string">String</option>
                  <option value="boolean">Boolean</option>
                  <option value="date">Date</option>
                  <option value="unknown">Unknown</option>
                </select>

                <select
                  value={qualityFilter}
                  onChange={(event) => setQualityFilter(event.target.value)}
                  className="h-9 rounded-xl border border-border bg-background px-2 text-xs text-foreground outline-none"
                >
                  <option value="all">All quality</option>
                  <option value="excellent">Excellent</option>
                  <option value="good">Good</option>
                  <option value="fair">Fair</option>
                  <option value="poor">Poor</option>
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-1 text-xs">
                <span className="mr-1 text-muted-foreground">Sort</span>
                {(["quality", "name", "nullRate", "distinctCount"] as const).map(
                  (sort) => (
                    <button
                      key={sort}
                      type="button"
                      onClick={() => {
                        if (sortBy === sort) {
                          setSortAsc((value) => !value);
                        } else {
                          setSortBy(sort);
                          setSortAsc(sort === "name");
                        }
                      }}
                      className={cn(
                        "rounded-lg px-2 py-1 transition-colors",
                        sortBy === sort
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {sort === "nullRate"
                        ? "nulls"
                        : sort === "distinctCount"
                          ? "distinct"
                          : sort}
                      {sortBy === sort ? (sortAsc ? " ↑" : " ↓") : ""}
                    </button>
                  ),
                )}
              </div>
            </div>
          </div>

          <div className="max-h-[calc(100vh-25rem)] space-y-2 overflow-y-auto pr-1">
            {filteredProfiles.length === 0 && !loading ? (
              <div className="rounded-3xl border border-dashed border-border bg-card p-8 text-center">
                <Grid3x3 className="mx-auto h-8 w-8 text-muted-foreground/60" />
                <p className="mt-3 text-sm text-muted-foreground">
                  {profiles.length === 0
                    ? "No profiles available yet."
                    : "No columns match your filters."}
                </p>
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                {filteredProfiles.map((profile) => (
                  <motion.div
                    key={profile.name}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                  >
                    <ColumnListCard
                      profile={profile}
                      selected={selectedCol === profile.name}
                      onClick={() => setSelectedCol(profile.name)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </aside>

        <section className="min-w-0 space-y-5">
          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="rounded-3xl border border-border bg-card p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-sm font-bold text-foreground">
                    Dataset Quality Overview
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Summary of completeness, uniqueness, validity and
                    consistency.
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div
                      className="text-3xl font-bold"
                      style={{ color: qualityColor(overallScore) }}
                    >
                      {(overallScore * 100).toFixed(1)}%
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {qualityLabel(overallScore)}
                    </div>
                  </div>

                  <QualityRing score={overallScore} size={72} />
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {qualityDimensions.map((dimension) => (
                  <div
                    key={dimension.name}
                    className="rounded-2xl border border-border bg-background p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-foreground">
                        {dimension.name}
                      </span>
                      <span
                        className="text-sm font-bold"
                        style={{ color: qualityColor(dimension.score) }}
                      >
                        {(dimension.score * 100).toFixed(0)}%
                      </span>
                    </div>

                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                      <motion.div
                        className="h-full rounded-full"
                        style={{
                          backgroundColor: qualityColor(dimension.score),
                        }}
                        initial={{ width: 0 }}
                        animate={{ width: `${dimension.score * 100}%` }}
                        transition={{ duration: 0.8 }}
                      />
                    </div>

                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                      {dimension.description}
                    </p>

                    {dimension.affected.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {dimension.affected.slice(0, 3).map((column) => (
                          <span
                            key={column}
                            className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-600 dark:text-amber-300"
                          >
                            {column}
                          </span>
                        ))}
                        {dimension.affected.length > 3 && (
                          <span className="text-[10px] text-muted-foreground">
                            +{dimension.affected.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-card p-5">
              <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
                <Layers className="h-4 w-4 text-violet-500" />
                Type Mix
              </h3>

              <div className="mt-4">
                {profiles.length > 0 ? (
                  <ReactECharts option={typeDistChart} style={{ height: 180 }} />
                ) : (
                  <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                    No profile data.
                  </div>
                )}
              </div>
            </div>
          </div>

          {!selectedProfile && !loading ? (
            <div className="flex min-h-[420px] flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card p-8 text-center">
              <Eye className="h-12 w-12 text-muted-foreground/40" />
              <h2 className="mt-4 text-lg font-bold text-foreground">
                Select a column
              </h2>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Choose a column from the explorer to inspect its statistics,
                distribution, quality, and sample frequencies.
              </p>
            </div>
          ) : null}

          {selectedProfile && (
            <div className="rounded-3xl border border-border bg-card">
              <div className="border-b border-border p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 items-center gap-4">
                    {(() => {
                      const Icon = typeIcon(selectedProfile.type);

                      return (
                        <div
                          className={cn(
                            "flex h-12 w-12 flex-none items-center justify-center rounded-2xl",
                            typeColor(selectedProfile.type),
                          )}
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                      );
                    })()}

                    <div className="min-w-0">
                      <h2 className="truncate font-mono text-xl font-bold text-foreground">
                        {selectedProfile.name}
                      </h2>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs",
                            typeColor(selectedProfile.type),
                          )}
                        >
                          {selectedProfile.sqlType}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          column #{selectedProfile.index + 1}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {selectedProfile.distinctCount.toLocaleString()}{" "}
                          distinct values
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div
                        className="text-3xl font-bold"
                        style={{
                          color: qualityColor(profileScore(selectedProfile)),
                        }}
                      >
                        {(profileScore(selectedProfile) * 100).toFixed(0)}%
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {qualityLabel(profileScore(selectedProfile))}
                      </div>
                    </div>

                    <QualityRing score={profileScore(selectedProfile)} size={72} />
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl bg-muted p-1 md:grid-cols-4">
                  {(
                    [
                      ["overview", "Overview", Eye],
                      ["distribution", "Distribution", BarChart3],
                      ["quality", "Quality", Shield],
                      ["samples", "Samples", Table2],
                    ] as const
                  ).map(([tab, label, Icon]) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveDetailTab(tab)}
                      className={cn(
                        "inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
                        activeDetailTab === tab
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-5">
                <AnimatePresence mode="wait">
                  {activeDetailTab === "overview" && (
                    <motion.div
                      key="overview"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="space-y-5"
                    >
                      {selectedProfile.type === "integer" ||
                      selectedProfile.type === "float" ? (
                        <StatGrid
                          items={[
                            {
                              label: "Min",
                              value: formatNumber(selectedProfile.min),
                            },
                            {
                              label: "Max",
                              value: formatNumber(selectedProfile.max),
                            },
                            {
                              label: "Mean",
                              value: formatNumber(selectedProfile.avg),
                            },
                            {
                              label: "Median",
                              value: formatNumber(selectedProfile.median),
                            },
                            {
                              label: "Std Dev",
                              value: formatNumber(selectedProfile.stddev),
                            },
                            {
                              label: "Sum",
                              value: formatNumber(selectedProfile.sum, 0),
                            },
                            {
                              label: "P25",
                              value: formatNumber(selectedProfile.p25),
                            },
                            {
                              label: "P75",
                              value: formatNumber(selectedProfile.p75),
                            },
                            {
                              label: "IQR",
                              value:
                                selectedProfile.p25 !== undefined &&
                                selectedProfile.p75 !== undefined
                                  ? formatNumber(
                                      selectedProfile.p75 - selectedProfile.p25,
                                    )
                                  : "—",
                            },
                            {
                              label: "Null Count",
                              value: selectedProfile.nullCount.toLocaleString(),
                              highlight: selectedProfile.nullCount > 0,
                            },
                            {
                              label: "Distinct",
                              value:
                                selectedProfile.distinctCount.toLocaleString(),
                            },
                            {
                              label: "Row Count",
                              value: selectedProfile.rowCount.toLocaleString(),
                            },
                          ]}
                        />
                      ) : selectedProfile.type === "string" ? (
                        <StatGrid
                          items={[
                            {
                              label: "Min Length",
                              value: String(selectedProfile.minLen ?? "—"),
                            },
                            {
                              label: "Max Length",
                              value: String(selectedProfile.maxLen ?? "—"),
                            },
                            {
                              label: "Avg Length",
                              value: formatNumber(selectedProfile.avgLen, 1),
                            },
                            {
                              label: "Distinct",
                              value:
                                selectedProfile.distinctCount.toLocaleString(),
                            },
                            {
                              label: "Null Count",
                              value: selectedProfile.nullCount.toLocaleString(),
                              highlight: selectedProfile.nullCount > 0,
                            },
                            {
                              label: "Uniqueness",
                              value: `${(
                                selectedProfile.uniquenessRate * 100
                              ).toFixed(1)}%`,
                            },
                          ]}
                        />
                      ) : (
                        <StatGrid
                          items={[
                            {
                              label: "Distinct",
                              value:
                                selectedProfile.distinctCount.toLocaleString(),
                            },
                            {
                              label: "Null Count",
                              value: selectedProfile.nullCount.toLocaleString(),
                              highlight: selectedProfile.nullCount > 0,
                            },
                            {
                              label: "Row Count",
                              value: selectedProfile.rowCount.toLocaleString(),
                            },
                            {
                              label: "Null Rate",
                              value: `${(
                                selectedProfile.nullRate * 100
                              ).toFixed(2)}%`,
                              highlight: selectedProfile.nullRate > 0.05,
                            },
                            {
                              label: "Completeness",
                              value: `${(
                                selectedProfile.completeness * 100
                              ).toFixed(1)}%`,
                            },
                            {
                              label: "Uniqueness",
                              value: `${(
                                selectedProfile.uniquenessRate * 100
                              ).toFixed(1)}%`,
                            },
                          ]}
                        />
                      )}

                      {selectedProfile.topValues.length > 0 && (
                        <div className="rounded-3xl border border-border bg-background p-5">
                          <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-foreground">
                            <Star className="h-4 w-4 text-yellow-500" />
                            Top Values
                          </h3>

                          <div className="space-y-3">
                            {selectedProfile.topValues.slice(0, 6).map((value) => (
                              <div key={value.value} className="flex items-center gap-3">
                                <span className="w-36 truncate font-mono text-xs text-foreground">
                                  {value.value || (
                                    <span className="italic text-muted-foreground">
                                      empty
                                    </span>
                                  )}
                                </span>

                                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                                  <motion.div
                                    className="h-full rounded-full bg-violet-500"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${value.pct * 100}%` }}
                                    transition={{ duration: 0.6 }}
                                  />
                                </div>

                                <span className="w-24 text-right text-xs text-muted-foreground">
                                  {value.count.toLocaleString()} ·{" "}
                                  {(value.pct * 100).toFixed(1)}%
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {activeDetailTab === "distribution" && (
                    <motion.div
                      key="distribution"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="grid gap-5 lg:grid-cols-2"
                    >
                      {histogramChart && (
                        <div className="rounded-3xl border border-border bg-background p-5 lg:col-span-2">
                          <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-foreground">
                            <BarChart3 className="h-4 w-4 text-indigo-500" />
                            Frequency Distribution
                          </h3>

                          <ReactECharts
                            option={histogramChart}
                            style={{ height: 260 }}
                          />
                        </div>
                      )}

                      {topValuesChart && (
                        <div className="rounded-3xl border border-border bg-background p-5 lg:col-span-2">
                          <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-foreground">
                            <TrendingUp className="h-4 w-4 text-purple-500" />
                            Top 10 Values
                          </h3>

                          <ReactECharts
                            option={topValuesChart}
                            style={{ height: 300 }}
                          />
                        </div>
                      )}

                      {!histogramChart && !topValuesChart && (
                        <div className="rounded-3xl border border-dashed border-border bg-background p-10 text-center text-sm text-muted-foreground lg:col-span-2">
                          No distribution chart is available for this column.
                        </div>
                      )}
                    </motion.div>
                  )}

                  {activeDetailTab === "quality" && (
                    <motion.div
                      key="quality"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="grid gap-4 md:grid-cols-3"
                    >
                      {[
                        {
                          name: "Completeness",
                          score: selectedProfile.completeness,
                          description: `${(
                            selectedProfile.completeness * 100
                          ).toFixed(2)}% of values are non-null`,
                          icon: CheckCircle2,
                          detail: `${selectedProfile.nullCount.toLocaleString()} null values`,
                        },
                        {
                          name: "Uniqueness",
                          score: selectedProfile.uniqueness,
                          description: `${selectedProfile.distinctCount.toLocaleString()} distinct values`,
                          icon: Fingerprint,
                          detail: `${(
                            selectedProfile.uniquenessRate * 100
                          ).toFixed(1)}% uniqueness rate`,
                        },
                        {
                          name: "Validity",
                          score: selectedProfile.validity,
                          description: `Values conform to ${selectedProfile.sqlType}`,
                          icon: Shield,
                          detail: "Type-based validation",
                        },
                      ].map((dimension) => {
                        const Icon = dimension.icon;

                        return (
                          <div
                            key={dimension.name}
                            className="rounded-3xl border border-border bg-background p-5"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2">
                                <Icon
                                  className="h-5 w-5"
                                  style={{ color: qualityColor(dimension.score) }}
                                />
                                <span className="text-sm font-bold text-foreground">
                                  {dimension.name}
                                </span>
                              </div>

                              <span
                                className="text-xl font-bold"
                                style={{ color: qualityColor(dimension.score) }}
                              >
                                {(dimension.score * 100).toFixed(1)}%
                              </span>
                            </div>

                            <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                              <motion.div
                                className="h-full rounded-full"
                                style={{
                                  backgroundColor: qualityColor(dimension.score),
                                }}
                                initial={{ width: 0 }}
                                animate={{ width: `${dimension.score * 100}%` }}
                                transition={{ duration: 0.8 }}
                              />
                            </div>

                            <p className="mt-4 text-sm text-foreground">
                              {dimension.description}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {dimension.detail}
                            </p>
                          </div>
                        );
                      })}
                    </motion.div>
                  )}

                  {activeDetailTab === "samples" && (
                    <motion.div
                      key="samples"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="rounded-3xl border border-border bg-background p-5"
                    >
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
                          <Table2 className="h-4 w-4 text-muted-foreground" />
                          Value Frequency Table
                        </h3>

                        <button
                          type="button"
                          onClick={() => {
                            const text = selectedProfile.topValues
                              .map(
                                (value) =>
                                  `${value.value}\t${value.count}\t${(
                                    value.pct * 100
                                  ).toFixed(2)}%`,
                              )
                              .join("\n");

                            navigator.clipboard.writeText(text);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs text-foreground transition-colors hover:bg-muted"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Copy
                        </button>
                      </div>

                      <div className="overflow-hidden rounded-2xl border border-border">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border bg-muted">
                              <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
                                Value
                              </th>
                              <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">
                                Count
                              </th>
                              <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">
                                %
                              </th>
                              <th className="px-3 py-2 text-xs font-semibold text-muted-foreground">
                                Distribution
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedProfile.topValues.map((value, index) => (
                              <tr
                                key={`${value.value}-${index}`}
                                className={cn(
                                  "border-b border-border last:border-0",
                                  index % 2 === 1 && "bg-muted/40",
                                )}
                              >
                                <td className="max-w-72 truncate px-3 py-2 font-mono text-foreground">
                                  {value.value || (
                                    <span className="italic text-muted-foreground">
                                      empty
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-right font-mono text-foreground">
                                  {value.count.toLocaleString()}
                                </td>
                                <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                                  {(value.pct * 100).toFixed(2)}%
                                </td>
                                <td className="w-40 px-3 py-2">
                                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                                    <div
                                      className="h-full rounded-full bg-violet-500"
                                      style={{ width: `${value.pct * 100}%` }}
                                    />
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}

          {profiles.length > 0 && (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
              <div className="rounded-3xl border border-border bg-card p-5">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
                  <BarChart3 className="h-4 w-4 text-indigo-500" />
                  Completeness by Column
                </h3>
                {overviewQualityChart && (
                  <ReactECharts
                    option={overviewQualityChart}
                    style={{ height: 240 }}
                  />
                )}
              </div>

              <div className="rounded-3xl border border-border bg-card p-5">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
                  <Percent className="h-4 w-4 text-orange-500" />
                  Null Rate Heatmap
                </h3>
                {nullHeatmapData && (
                  <ReactECharts option={nullHeatmapData} style={{ height: 240 }} />
                )}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
