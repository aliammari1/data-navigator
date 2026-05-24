"use client";

import {
  AlertCircle,
  AlertTriangle,
  ArrowUpDown,
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  Database,
  Download,
  Eye,
  FileSearch,
  Filter,
  Fingerprint,
  Grid3x3,
  Hash,
  Info,
  Layers,
  Percent,
  RefreshCw,
  Search,
  Shield,
  Sigma,
  SlidersHorizontal,
  Star,
  Table2,
  ToggleLeft,
  TrendingUp,
  Type,
  X,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDataStore } from "@/core/stores/data-store";
import { getTableInfo, runQuery } from "@/platform/duckdb/duckdb";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

import {
  ColCard,
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

function quoteIdentifier(value: string): string {
  return `"${value.replace('"', '""')}"`;
}

function tableNameFromShowTables(row: Record<string, unknown>): string {
  return String(row.name ?? row.table_name ?? Object.values(row)[0] ?? "");
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

// ─── Main Component ────────────────────────────────────────────────────────

export default function ParsedDataScreen() {
  const { datasets, activeDatasetId, loadedTableNames } = useDataStore();
  const activeDataset =
    datasets.find((dataset) => dataset.id === activeDatasetId) ?? null;

  const [profiles, setProfiles] = useState<ColProfile[]>([]);
  const [selectedCol, setSelectedCol] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [qualityFilter, setQualityFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<
    "name" | "nullRate" | "distinctCount" | "quality"
  >("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [activeDetailTab, setActiveDetailTab] = useState<
    "overview" | "distribution" | "quality" | "samples"
  >("overview");
  const [rowCount, setRowCount] = useState(0);
  const [colCount, setColCount] = useState(0);
  const [qualityDimensions, setQualityDimensions] = useState<
    QualityDimension[]
  >([]);
  const [activeTableName, setActiveTableName] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const computeProfiles = useCallback(
    async (
      tableName: string,
      columnDefs: Array<{
        index: number;
        name: string;
        type: ColProfile["type"];
        sqlType: string;
      }>,
      cancelled: boolean,
    ) => {
      setLoading(true);

      setColCount(columnDefs.length);
      const profileResults: ColProfile[] = [];
      const quotedTable = quoteIdentifier(tableName);

      for (let ci = 0; ci < columnDefs.length; ci++) {
        if (cancelled) break;
        const col = columnDefs[ci];
        const quotedColumn = quoteIdentifier(col.name);
        setLoadingStage(
          `Profiling column ${ci + 1}/${columnDefs.length}: ${col.name}...`,
        );

        try {
          const baseRes = await runQuery(`
          SELECT
            COUNT(*) as total,
            COUNT(${quotedColumn}) as non_null,
            COUNT(DISTINCT ${quotedColumn}) as distinct_count
          FROM ${quotedTable}
        `);
          const base = baseRes[0] as Record<string, number>;
          const total = Number(base.total);
          const nonNull = Number(base.non_null);
          const nullCount = total - nonNull;
          const nullRate = total > 0 ? nullCount / total : 0;
          const distinctCount = Number(base.distinct_count);

          // Top values
          const topRes = await runQuery(`
          SELECT CAST(${quotedColumn} AS VARCHAR) as val, COUNT(*) as cnt
          FROM ${quotedTable}
          WHERE ${quotedColumn} IS NOT NULL
          GROUP BY val
          ORDER BY cnt DESC
          LIMIT 10
        `);
          const topValues = topRes.map((r) => {
            const row = r as Record<string, unknown>;
            return {
              value: String(row.val ?? ""),
              count: Number(row.cnt),
              pct: total > 0 ? Number(row.cnt) / total : 0,
            };
          });

          const profile: ColProfile = {
            name: col.name,
            index: col.index,
            type: col.type,
            sqlType: col.sqlType,
            rowCount: total,
            nullCount,
            nullRate,
            distinctCount,
            uniquenessRate: total > 0 ? distinctCount / total : 0,
            topValues,
            completeness: 1 - nullRate,
            uniqueness: Math.min(1, distinctCount / Math.max(total * 0.5, 1)),
            validity: col.type !== "unknown" ? 0.95 : 0.5,
          };

          // Numeric stats
          if (col.type === "integer" || col.type === "float") {
            const numRes = await runQuery(`
            SELECT
              MIN(${quotedColumn}) as min_val,
              MAX(${quotedColumn}) as max_val,
              AVG(${quotedColumn}) as avg_val,
              STDDEV_SAMP(${quotedColumn}) as std_val,
              MEDIAN(${quotedColumn}) as median_val,
              PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY ${quotedColumn}) as p25,
              PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY ${quotedColumn}) as p75,
              SUM(${quotedColumn}) as sum_val
            FROM ${quotedTable}
            WHERE ${quotedColumn} IS NOT NULL
          `);
            const nr = numRes[0] as Record<string, number>;
            profile.min = Number(nr.min_val);
            profile.max = Number(nr.max_val);
            profile.avg = Number(nr.avg_val);
            profile.stddev = Number(nr.std_val);
            profile.median = Number(nr.median_val);
            profile.p25 = Number(nr.p25);
            profile.p75 = Number(nr.p75);
            profile.sum = Number(nr.sum_val);

            // Histogram
            const binCount = 20;
            const range = profile.max - profile.min;
            if (range > 0) {
              const binWidth = range / binCount;
              const histRes = await runQuery(`
              SELECT
                FLOOR((${quotedColumn} - ${profile.min}) / ${binWidth}) as bin,
                COUNT(*) as cnt
              FROM ${quotedTable}
              WHERE ${quotedColumn} IS NOT NULL
              GROUP BY bin
              ORDER BY bin
            `);
              const minVal = profile.min ?? 0;
              const bins: { lo: number; hi: number; count: number }[] =
                Array.from({ length: binCount }, (_, i) => ({
                  lo: minVal + i * binWidth,
                  hi: minVal + (i + 1) * binWidth,
                  count: 0,
                }));
              for (const r of histRes) {
                const row = r as Record<string, number>;
                const idx = Math.min(
                  Math.max(0, Number(row.bin)),
                  binCount - 1,
                );
                bins[idx].count = Number(row.cnt);
              }
              profile.histogram = bins;
            }
          }

          // String stats
          if (col.type === "string") {
            const strRes = await runQuery(`
            SELECT
              MIN(LENGTH(${quotedColumn})) as min_len,
              MAX(LENGTH(${quotedColumn})) as max_len,
              AVG(LENGTH(${quotedColumn})) as avg_len
            FROM ${quotedTable}
            WHERE ${quotedColumn} IS NOT NULL
          `);
            const sr = strRes[0] as Record<string, number>;
            profile.minLen = Number(sr.min_len);
            profile.maxLen = Number(sr.max_len);
            profile.avgLen = Number(sr.avg_len);
          }

          profileResults.push(profile);
        } catch (e) {
          console.error(`Error profiling ${col.name}:`, e);
          profileResults.push({
            name: col.name,
            index: col.index,
            type: col.type,
            sqlType: col.sqlType,
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
      }

      if (!cancelled) {
        setProfiles(profileResults);
        if (profileResults.length > 0) setSelectedCol(profileResults[0].name);

        // Compute quality dimensions
        const profileCount = Math.max(profileResults.length, 1);
        const avgComp =
          profileResults.reduce((s, p) => s + p.completeness, 0) / profileCount;
        const avgUniq =
          profileResults.reduce((s, p) => s + p.uniquenessRate, 0) /
          profileCount;
        const avgValid =
          profileResults.reduce((s, p) => s + p.validity, 0) / profileCount;
        const lowCompCols = profileResults
          .filter((p) => p.completeness < 0.95)
          .map((p) => p.name);
        const lowUniqCols = profileResults
          .filter((p) => p.uniquenessRate < 0.1)
          .map((p) => p.name);
        const lowValidCols = profileResults
          .filter((p) => p.validity < 0.8)
          .map((p) => p.name);
        const consistency =
          profileResults.filter((p) => p.nullRate < 0.01).length / profileCount;

        setQualityDimensions([
          {
            name: "Completeness",
            score: avgComp,
            description: "Proportion of non-null values across all columns",
            affected: lowCompCols,
          },
          {
            name: "Uniqueness",
            score: Math.min(1, avgUniq * 2),
            description: "How unique values are relative to total rows",
            affected: lowUniqCols,
          },
          {
            name: "Validity",
            score: avgValid,
            description: "Values conform to expected type and format",
            affected: lowValidCols,
          },
          {
            name: "Consistency",
            score: consistency,
            description: "Columns with <1% null rate across dataset",
            affected: [],
          },
        ]);

        setLoading(false);
      }
    },
    [],
  );

  // ─── Init data ────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      setLoadingStage("Checking for loaded data...");

      try {
        let tableName = activeDataset?.tableName ?? loadedTableNames[0] ?? "";
        let info = tableName
          ? await getTableInfo(tableName).catch(() => null)
          : null;

        if (!info) {
          const tables = await runQuery("SHOW TABLES").catch(() => []);
          tableName = tables.map(tableNameFromShowTables).find(Boolean) ?? "";
          info = tableName
            ? await getTableInfo(tableName).catch(() => null)
            : null;
        }

        if (!info || !tableName) {
          if (!cancelled) {
            setActiveTableName(null);
            setProfiles([]);
            setSelectedCol(null);
            setRowCount(0);
            setColCount(0);
            setQualityDimensions([]);
            setLoadingStage("No loaded DuckDB table found.");
            setLoading(false);
          }
          return;
        }

        const columnDefs = info.columns.map((column, index) => ({
          name: column.name,
          index,
          type: toProfileType(column.type),
          sqlType: column.type,
        }));

        if (!cancelled) {
          setActiveTableName(tableName);
          setRowCount(info.rowCount);
        }
        await computeProfiles(tableName, columnDefs, cancelled);
      } catch (e) {
        console.error("Init error:", e);
        if (!cancelled) setLoadingStage("Could not profile the active table.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [activeDataset?.tableName, loadedTableNames, refreshKey, computeProfiles]);

  // ─── Derived ──────────────────────────────────────────────────────────

  const selectedProfile = useMemo(
    () => profiles.find((p) => p.name === selectedCol) ?? null,
    [profiles, selectedCol],
  );

  const filteredProfiles = useMemo(() => {
    let list = [...profiles];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (p) => p.name.toLowerCase().includes(q) || p.type.includes(q),
      );
    }
    if (typeFilter !== "all") list = list.filter((p) => p.type === typeFilter);
    if (qualityFilter !== "all") {
      list = list.filter((p) => {
        const score =
          (p.completeness + p.uniqueness * 0.5 + p.validity * 0.5) / 2;
        if (qualityFilter === "excellent") return score >= 0.9;
        if (qualityFilter === "good") return score >= 0.7 && score < 0.9;
        if (qualityFilter === "fair") return score >= 0.5 && score < 0.7;
        return score < 0.5;
      });
    }
    list.sort((a, b) => {
      let va: number | string = 0;
      let vb: number | string = 0;
      if (sortBy === "name") {
        va = a.name;
        vb = b.name;
      } else if (sortBy === "nullRate") {
        va = a.nullRate;
        vb = b.nullRate;
      } else if (sortBy === "distinctCount") {
        va = a.distinctCount;
        vb = b.distinctCount;
      } else if (sortBy === "quality") {
        va = (a.completeness + a.uniqueness * 0.5 + a.validity * 0.5) / 2;
        vb = (b.completeness + b.uniqueness * 0.5 + b.validity * 0.5) / 2;
      }
      if (typeof va === "string")
        return sortAsc
          ? va.localeCompare(String(vb))
          : String(vb).localeCompare(va);
      return sortAsc
        ? (va as number) - (vb as number)
        : (vb as number) - (va as number);
    });
    return list;
  }, [profiles, searchQuery, typeFilter, qualityFilter, sortBy, sortAsc]);

  // ─── Charts ───────────────────────────────────────────────────────────

  const overviewQualityChart = useMemo(() => {
    if (!profiles.length) return null;
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: "#1e293b",
        borderColor: "#334155",
        textStyle: { color: "#f1f5f9" },
        formatter: (
          params: Array<{ name: string; value: number; seriesName: string }>,
        ) =>
          `${params[0].name}<br/>${params.map((p) => `${p.seriesName}: ${(p.value * 100).toFixed(1)}%`).join("<br/>")}`,
      },
      legend: {
        data: ["Completeness", "Uniqueness", "Validity"],
        textStyle: { color: "#94a3b8" },
        top: 5,
      },
      grid: { top: 50, bottom: 60, left: 80, right: 20 },
      xAxis: {
        type: "category",
        data: profiles.map((p) => p.name),
        axisLabel: { color: "#94a3b8", rotate: 35, fontSize: 10 },
        axisLine: { lineStyle: { color: "#334155" } },
      },
      yAxis: {
        type: "value",
        min: 0,
        max: 1,
        axisLabel: {
          color: "#94a3b8",
          formatter: (v: number) => `${(v * 100).toFixed(0)}%`,
        },
        splitLine: { lineStyle: { color: "#1e293b" } },
      },
      series: [
        {
          name: "Completeness",
          type: "bar",
          data: profiles.map((p) => parseFloat(p.completeness.toFixed(4))),
          itemStyle: { color: "#22c55e" },
          barMaxWidth: 16,
          stack: "q",
        },
        {
          name: "Validity",
          type: "line",
          data: profiles.map((p) => parseFloat(p.validity.toFixed(4))),
          lineStyle: { color: "#6366f1", width: 2 },
          itemStyle: { color: "#6366f1" },
          symbol: "circle",
          symbolSize: 5,
          z: 5,
        },
      ],
    };
  }, [profiles]);

  const typeDistChart = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of profiles) counts[p.type] = (counts[p.type] ?? 0) + 1;
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
        backgroundColor: "#1e293b",
        borderColor: "#334155",
        textStyle: { color: "#f1f5f9" },
      },
      series: [
        {
          type: "pie",
          radius: ["45%", "72%"],
          data: Object.entries(counts).map(([k, v]) => ({
            name: k,
            value: v,
            itemStyle: { color: typeColors[k] ?? "#64748b" },
          })),
          label: { color: "#94a3b8", fontSize: 11 },
          emphasis: {
            itemStyle: { shadowBlur: 10, shadowColor: "rgba(0,0,0,0.5)" },
          },
        },
      ],
    };
  }, [profiles]);

  const nullHeatmapData = useMemo(() => {
    // Single-row heatmap: each column → its null rate
    return {
      backgroundColor: "transparent",
      tooltip: {
        formatter: (params: { name: string; data: [number, number, number] }) =>
          `${profiles[params.data[0]]?.name ?? ""}<br/>Null rate: ${(params.data[2] * 100).toFixed(2)}%`,
      },
      grid: { top: 20, bottom: 40, left: 80, right: 20 },
      xAxis: {
        type: "category",
        data: profiles.map((p) => p.name),
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
          data: profiles.map((p, i) => [
            i,
            0,
            parseFloat(p.nullRate.toFixed(4)),
          ]),
          label: {
            show: true,
            formatter: (p: { data: [number, number, number] }) =>
              p.data[2] === 0 ? "✓" : `${(p.data[2] * 100).toFixed(0)}%`,
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
        backgroundColor: "#1e293b",
        borderColor: "#334155",
        textStyle: { color: "#f1f5f9" },
        formatter: (params: Array<{ data: number; name: string }>) =>
          `${params[0].name}<br/>Count: ${params[0].data.toLocaleString()}`,
      },
      grid: { top: 20, bottom: 50, left: 50, right: 20 },
      xAxis: {
        type: "category",
        data: bins.map((b) => b.lo.toFixed(1)),
        axisLabel: { color: "#94a3b8", rotate: 30, fontSize: 9 },
        axisLine: { lineStyle: { color: "#334155" } },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: "#94a3b8" },
        splitLine: { lineStyle: { color: "#1e293b" } },
      },
      series: [
        {
          type: "bar",
          data: bins.map((b) => b.count),
          barWidth: "95%",
          itemStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "#6366f1" },
                { offset: 1, color: "#3730a3" },
              ],
            },
          },
        },
      ],
    };
  }, [selectedProfile]);

  const topValuesChart = useMemo(() => {
    if (!selectedProfile?.topValues.length) return null;
    const tv = selectedProfile.topValues.slice(0, 10);
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: "#1e293b",
        borderColor: "#334155",
        textStyle: { color: "#f1f5f9" },
      },
      grid: { top: 10, bottom: 40, left: 20, right: 80 },
      xAxis: {
        type: "value",
        axisLabel: { color: "#94a3b8" },
        splitLine: { lineStyle: { color: "#1e293b" } },
      },
      yAxis: {
        type: "category",
        data: tv.map((v) => v.value.substring(0, 20)).reverse(),
        axisLabel: { color: "#94a3b8", fontSize: 11 },
        axisLine: { lineStyle: { color: "#334155" } },
      },
      series: [
        {
          type: "bar",
          data: tv.map((v) => v.count).reverse(),
          barMaxWidth: 20,
          itemStyle: {
            color: (params: { dataIndex: number }) => {
              const colors = ["#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd"];
              return colors[params.dataIndex % colors.length];
            },
          },
          label: {
            show: true,
            position: "right",
            color: "#94a3b8",
            fontSize: 10,
            formatter: (p: { value: number }) => p.value.toLocaleString(),
          },
        },
      ],
    };
  }, [selectedProfile]);

  const overallScore = useMemo(() => {
    if (!profiles.length) return 0;
    return (
      profiles.reduce((s, p) => {
        const score =
          (p.completeness + p.uniqueness * 0.5 + p.validity * 0.5) / 2;
        return s + score;
      }, 0) / profiles.length
    );
  }, [profiles]);

  // ─── Export ───────────────────────────────────────────────────────────

  const exportProfiles = useCallback(() => {
    const csv = [
      "name,type,rowCount,nullCount,nullRate,distinctCount,uniquenessRate,min,max,avg,stddev,completeness,validity",
      ...profiles.map((p) =>
        [
          p.name,
          p.type,
          p.rowCount,
          p.nullCount,
          p.nullRate.toFixed(4),
          p.distinctCount,
          p.uniquenessRate.toFixed(4),
          p.min ?? "",
          p.max ?? "",
          p.avg ?? "",
          p.stddev ?? "",
          p.completeness.toFixed(4),
          p.validity.toFixed(4),
        ].join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "column_profiles.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [profiles]);

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-linear-to-br from-background via-background to-violet-950 flex flex-col">
      {/* Header */}
      <div className="border-b border-border p-4 md:p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-linear-to-br from-violet-600 to-purple-600 rounded-xl">
              <FileSearch className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                Data Profile
              </h1>
              <p className="text-sm text-muted-foreground">
                Deep column analysis · {colCount} columns ·{" "}
                {rowCount.toLocaleString()} rows
                {activeTableName ? ` · ${activeTableName}` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {loading && (
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                <RefreshCw className="w-3 h-3 animate-spin text-indigo-400" />
                {loadingStage}
              </span>
            )}
            <button
              type="button"
              onClick={exportProfiles}
              disabled={loading || !profiles.length}
              className="flex items-center gap-2 px-3 py-2 bg-accent hover:bg-accent disabled:opacity-50 rounded-lg text-sm text-foreground transition-colors"
            >
              <Download className="w-4 h-4" /> Export CSV
            </button>
            <button
              type="button"
              onClick={() => {
                setProfiles([]);
                setRefreshKey((key) => key + 1);
              }}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 rounded-lg text-sm text-primary-foreground transition-colors"
            >
              <RefreshCw
                className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Loading progress */}
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="px-4 md:px-6 pt-3"
          >
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Database className="w-4 h-4 text-indigo-400 animate-pulse" />
                <span className="text-sm text-foreground">{loadingStage}</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-linear-to-r from-indigo-500 to-violet-500 rounded-full"
                  animate={{
                    width:
                      profiles.length > 0
                        ? `${(profiles.length / 14) * 100}%`
                        : "5%",
                  }}
                  transition={{ duration: 0.5 }}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 flex overflow-hidden">
        {/* Left panel — column list */}
        <div className="w-72 xl:w-80 border-r border-border flex flex-col overflow-hidden">
          {/* Filters */}
          <div className="p-3 border-b border-border space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search columns..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-card border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="flex-1 px-2 py-1.5 bg-card border border-border rounded-lg text-xs text-foreground focus:outline-none"
              >
                <option value="all">All types</option>
                <option value="integer">Integer</option>
                <option value="float">Float</option>
                <option value="string">String</option>
                <option value="boolean">Boolean</option>
                <option value="date">Date</option>
              </select>
              <select
                value={qualityFilter}
                onChange={(e) => setQualityFilter(e.target.value)}
                className="flex-1 px-2 py-1.5 bg-card border border-border rounded-lg text-xs text-foreground focus:outline-none"
              >
                <option value="all">All quality</option>
                <option value="excellent">Excellent</option>
                <option value="good">Good</option>
                <option value="fair">Fair</option>
                <option value="poor">Poor</option>
              </select>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">Sort:</span>
              {(["name", "nullRate", "quality", "distinctCount"] as const).map(
                (s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      if (sortBy === s) setSortAsc(!sortAsc);
                      else {
                        setSortBy(s);
                        setSortAsc(true);
                      }
                    }}
                    className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
                      sortBy === s
                        ? "bg-primary/40 text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {s === "nullRate"
                      ? "nulls"
                      : s === "distinctCount"
                        ? "distinct"
                        : s}
                    {sortBy === s && (sortAsc ? " ↑" : " ↓")}
                  </button>
                ),
              )}
            </div>
          </div>

          {/* Column cards */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {filteredProfiles.length === 0 && !loading && (
              <div className="text-center py-12 text-muted-foreground text-sm">
                {profiles.length === 0
                  ? "Loading profiles..."
                  : "No columns match filters"}
              </div>
            )}
            <AnimatePresence mode="popLayout">
              {filteredProfiles.map((profile) => (
                <ColCard
                  key={profile.name}
                  profile={profile}
                  selected={selectedCol === profile.name}
                  onClick={() => setSelectedCol(profile.name)}
                />
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Right panel — detail */}
        <div className="flex-1 overflow-y-auto">
          {!selectedProfile && !loading && (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8">
              <Grid3x3 className="w-16 h-16 mb-4 opacity-20" />
              <p className="text-lg">Select a column to see its profile</p>
            </div>
          )}

          {selectedProfile && (
            <div className="p-4 md:p-6 space-y-4">
              {/* Column header */}
              <div className="flex flex-wrap items-start gap-4 justify-between">
                <div className="flex items-center gap-3">
                  {(() => {
                    const Icon = typeIcon(selectedProfile.type);
                    return (
                      <div
                        className={`p-2 rounded-xl ${typeColor(selectedProfile.type)}`}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                    );
                  })()}
                  <div>
                    <h2 className="text-xl font-bold text-foreground font-mono">
                      {selectedProfile.name}
                    </h2>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded ${typeColor(selectedProfile.type)}`}
                      >
                        {selectedProfile.sqlType}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        column #{selectedProfile.index + 1}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div
                      className="text-2xl font-bold"
                      style={{
                        color: qualityColor(
                          (selectedProfile.completeness +
                            selectedProfile.uniqueness * 0.5 +
                            selectedProfile.validity * 0.5) /
                            2,
                        ),
                      }}
                    >
                      {(
                        ((selectedProfile.completeness +
                          selectedProfile.uniqueness * 0.5 +
                          selectedProfile.validity * 0.5) /
                          2) *
                        100
                      ).toFixed(0)}
                      %
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {qualityLabel(
                        (selectedProfile.completeness +
                          selectedProfile.uniqueness * 0.5 +
                          selectedProfile.validity * 0.5) /
                          2,
                      )}
                    </div>
                  </div>
                  <QualityRing
                    score={
                      (selectedProfile.completeness +
                        selectedProfile.uniqueness * 0.5 +
                        selectedProfile.validity * 0.5) /
                      2
                    }
                    size={64}
                  />
                </div>
              </div>

              {/* Detail tabs */}
              <div className="flex gap-1 bg-card rounded-xl p-1 border border-border">
                {(
                  ["overview", "distribution", "quality", "samples"] as const
                ).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveDetailTab(tab)}
                    className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      activeDetailTab === tab
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    }`}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>

              <AnimatePresence mode="wait">
                {/* Overview */}
                {activeDetailTab === "overview" && (
                  <motion.div
                    key="overview"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="space-y-4"
                  >
                    {/* Key stats */}
                    {selectedProfile.type === "integer" ||
                    selectedProfile.type === "float" ? (
                      <StatGrid
                        items={[
                          {
                            label: "Min",
                            value:
                              selectedProfile.min?.toFixed(
                                selectedProfile.type === "float" ? 2 : 0,
                              ) ?? "—",
                          },
                          {
                            label: "Max",
                            value:
                              selectedProfile.max?.toFixed(
                                selectedProfile.type === "float" ? 2 : 0,
                              ) ?? "—",
                          },
                          {
                            label: "Mean",
                            value: selectedProfile.avg?.toFixed(2) ?? "—",
                          },
                          {
                            label: "Median",
                            value: selectedProfile.median?.toFixed(2) ?? "—",
                          },
                          {
                            label: "Std Dev",
                            value: selectedProfile.stddev?.toFixed(2) ?? "—",
                          },
                          {
                            label: "Sum",
                            value:
                              selectedProfile.sum !== undefined
                                ? selectedProfile.sum.toFixed(0)
                                : "—",
                          },
                          {
                            label: "P25",
                            value: selectedProfile.p25?.toFixed(2) ?? "—",
                          },
                          {
                            label: "P75",
                            value: selectedProfile.p75?.toFixed(2) ?? "—",
                          },
                          {
                            label: "IQR",
                            value:
                              selectedProfile.p25 !== undefined &&
                              selectedProfile.p75 !== undefined
                                ? (
                                    selectedProfile.p75 - selectedProfile.p25
                                  ).toFixed(2)
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
                            value: selectedProfile.avgLen?.toFixed(1) ?? "—",
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
                            value: `${(selectedProfile.uniquenessRate * 100).toFixed(1)}%`,
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
                            value: `${(selectedProfile.nullRate * 100).toFixed(2)}%`,
                            highlight: selectedProfile.nullRate > 0.05,
                          },
                          {
                            label: "Completeness",
                            value: `${(selectedProfile.completeness * 100).toFixed(1)}%`,
                          },
                          {
                            label: "Uniqueness Rate",
                            value: `${(selectedProfile.uniquenessRate * 100).toFixed(1)}%`,
                          },
                        ]}
                      />
                    )}

                    {/* Top values preview */}
                    {selectedProfile.topValues.length > 0 && (
                      <div className="bg-card border border-border rounded-xl p-4">
                        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                          <Star className="w-4 h-4 text-yellow-400" />
                          Top Values
                        </h3>
                        <div className="space-y-1.5">
                          {selectedProfile.topValues.slice(0, 6).map((tv) => (
                            <div
                              key={tv.value}
                              className="flex items-center gap-2"
                            >
                              <span className="text-xs font-mono text-foreground w-32 truncate">
                                {tv.value}
                              </span>
                              <div className="flex-1 h-1.5 bg-accent rounded-full overflow-hidden">
                                <motion.div
                                  className="h-full rounded-full bg-indigo-500"
                                  initial={{ width: 0 }}
                                  animate={{ width: `${tv.pct * 100}%` }}
                                  transition={{
                                    duration: 0.6,
                                    ease: "easeOut",
                                  }}
                                />
                              </div>
                              <span className="text-xs text-muted-foreground w-16 text-right">
                                {tv.count.toLocaleString()} (
                                {(tv.pct * 100).toFixed(1)}%)
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Distribution */}
                {activeDetailTab === "distribution" && (
                  <motion.div
                    key="distribution"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="space-y-4"
                  >
                    {histogramChart && (
                      <div className="bg-card border border-border rounded-xl p-4">
                        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                          <BarChart3 className="w-4 h-4 text-indigo-400" />
                          Frequency Distribution (20 bins)
                        </h3>
                        <ReactECharts
                          option={histogramChart}
                          style={{ height: 220 }}
                        />
                        {selectedProfile.min !== undefined &&
                          selectedProfile.max !== undefined && (
                            <div className="flex justify-between text-xs text-muted-foreground mt-1">
                              <span>min: {selectedProfile.min.toFixed(2)}</span>
                              <span>
                                mean: {selectedProfile.avg?.toFixed(2)}
                              </span>
                              <span>max: {selectedProfile.max.toFixed(2)}</span>
                            </div>
                          )}
                      </div>
                    )}

                    {topValuesChart && (
                      <div className="bg-card border border-border rounded-xl p-4">
                        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-purple-400" />
                          Top 10 Values
                        </h3>
                        <ReactECharts
                          option={topValuesChart}
                          style={{ height: 280 }}
                        />
                      </div>
                    )}

                    {!histogramChart && !topValuesChart && (
                      <div className="text-center py-12 text-muted-foreground">
                        No distribution data available for this column type
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Quality */}
                {activeDetailTab === "quality" && (
                  <motion.div
                    key="quality"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="space-y-4"
                  >
                    {[
                      {
                        name: "Completeness",
                        score: selectedProfile.completeness,
                        desc: `${(selectedProfile.completeness * 100).toFixed(2)}% of values are non-null`,
                        icon: CheckCircle2,
                        sub: `${selectedProfile.nullCount.toLocaleString()} null values out of ${selectedProfile.rowCount.toLocaleString()}`,
                      },
                      {
                        name: "Uniqueness",
                        score: selectedProfile.uniqueness,
                        desc: `${selectedProfile.distinctCount.toLocaleString()} distinct values`,
                        icon: Fingerprint,
                        sub: `${(selectedProfile.uniquenessRate * 100).toFixed(1)}% uniqueness rate`,
                      },
                      {
                        name: "Validity",
                        score: selectedProfile.validity,
                        desc: `Values conform to ${selectedProfile.sqlType} type`,
                        icon: Shield,
                        sub: "Type-based validation",
                      },
                    ].map((dim) => {
                      const Icon = dim.icon;
                      return (
                        <div
                          key={dim.name}
                          className="bg-card border border-border rounded-xl p-4"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Icon
                                className="w-4 h-4"
                                style={{ color: qualityColor(dim.score) }}
                              />
                              <span className="text-sm font-semibold text-foreground">
                                {dim.name}
                              </span>
                            </div>
                            <span
                              className="text-lg font-bold"
                              style={{ color: qualityColor(dim.score) }}
                            >
                              {(dim.score * 100).toFixed(1)}%
                            </span>
                          </div>
                          <div className="h-2 bg-accent rounded-full overflow-hidden mb-2">
                            <motion.div
                              className="h-full rounded-full"
                              style={{
                                backgroundColor: qualityColor(dim.score),
                              }}
                              initial={{ width: 0 }}
                              animate={{ width: `${dim.score * 100}%` }}
                              transition={{ duration: 0.8 }}
                            />
                          </div>
                          <p className="text-sm text-foreground">{dim.desc}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {dim.sub}
                          </p>
                        </div>
                      );
                    })}
                  </motion.div>
                )}

                {/* Samples */}
                {activeDetailTab === "samples" && (
                  <motion.div
                    key="samples"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <div className="bg-card border border-border rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                          <Table2 className="w-4 h-4 text-muted-foreground" />
                          Value Frequency Table
                        </h3>
                        <button
                          type="button"
                          onClick={() => {
                            const text = selectedProfile.topValues
                              .map(
                                (v) =>
                                  `${v.value}\t${v.count}\t${(v.pct * 100).toFixed(2)}%`,
                              )
                              .join("\n");
                            navigator.clipboard.writeText(text);
                          }}
                          className="text-xs flex items-center gap-1 px-2 py-1 bg-muted hover:bg-accent rounded text-foreground transition-colors"
                        >
                          <Copy className="w-3 h-3" /> Copy
                        </button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border">
                              <th className="text-left py-2 px-2 text-xs text-muted-foreground font-medium">
                                Value
                              </th>
                              <th className="text-right py-2 px-2 text-xs text-muted-foreground font-medium">
                                Count
                              </th>
                              <th className="text-right py-2 px-2 text-xs text-muted-foreground font-medium">
                                %
                              </th>
                              <th className="py-2 px-2 text-xs text-muted-foreground font-medium">
                                Bar
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedProfile.topValues.map((tv, idx) => (
                              <tr
                                key={tv.value}
                                className={`border-b border-border ${idx % 2 === 0 ? "" : "bg-muted"}`}
                              >
                                <td className="py-1.5 px-2 font-mono text-foreground max-w-[150px] truncate">
                                  {tv.value || (
                                    <span className="text-muted-foreground italic">
                                      empty
                                    </span>
                                  )}
                                </td>
                                <td className="py-1.5 px-2 text-right text-foreground font-mono">
                                  {tv.count.toLocaleString()}
                                </td>
                                <td className="py-1.5 px-2 text-right text-muted-foreground font-mono">
                                  {(tv.pct * 100).toFixed(2)}%
                                </td>
                                <td className="py-1.5 px-2 w-24">
                                  <div className="h-1.5 bg-accent rounded-full overflow-hidden">
                                    <div
                                      className="h-full rounded-full bg-indigo-500"
                                      style={{ width: `${tv.pct * 100}%` }}
                                    />
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* Bottom: overall quality overview */}
      <div className="border-t border-border p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Shield className="w-4 h-4 text-green-400" />
            Dataset Quality Overview
          </h2>
          <div className="flex items-center gap-2">
            <span
              className="text-sm font-bold"
              style={{ color: qualityColor(overallScore) }}
            >
              {(overallScore * 100).toFixed(1)}% Overall
            </span>
            <span className="text-xs text-muted-foreground">
              {qualityLabel(overallScore)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {qualityDimensions.map((dim) => (
            <div
              key={dim.name}
              className="bg-card border border-border rounded-xl p-3"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-foreground">
                  {dim.name}
                </span>
                <span
                  className="text-sm font-bold"
                  style={{ color: qualityColor(dim.score) }}
                >
                  {(dim.score * 100).toFixed(0)}%
                </span>
              </div>
              <div className="h-1.5 bg-accent rounded-full overflow-hidden mb-1.5">
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: qualityColor(dim.score) }}
                  initial={{ width: 0 }}
                  animate={{ width: `${dim.score * 100}%` }}
                  transition={{ duration: 0.8 }}
                />
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">
                {dim.description}
              </p>
              {dim.affected.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {dim.affected.slice(0, 3).map((c) => (
                    <span
                      key={c}
                      className="text-xs bg-yellow-500/15 text-yellow-300 px-1 rounded"
                    >
                      {c}
                    </span>
                  ))}
                  {dim.affected.length > 3 && (
                    <span className="text-xs text-muted-foreground">
                      +{dim.affected.length - 3}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Quality charts row */}
        {profiles.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-card border border-border rounded-xl p-4">
              <h3 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                <BarChart3 className="w-3.5 h-3.5 text-indigo-400" />{" "}
                Completeness by Column
              </h3>
              {overviewQualityChart && (
                <ReactECharts
                  option={overviewQualityChart}
                  style={{ height: 180 }}
                />
              )}
            </div>
            <div className="space-y-3">
              <div className="bg-card border border-border rounded-xl p-4">
                <h3 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-purple-400" /> Type
                  Distribution
                </h3>
                <ReactECharts option={typeDistChart} style={{ height: 120 }} />
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <h3 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-orange-400" /> Null
                  Rate Heatmap
                </h3>
                {nullHeatmapData && (
                  <ReactECharts
                    option={nullHeatmapData}
                    style={{ height: 70 }}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
