"use client";

import {
  Activity,
  AlertCircle,
  AlertTriangle,
  BarChart3,
  Brain,
  ChevronRight,
  Cpu,
  Database,
  Download,
  Flame,
  FlaskConical,
  GitBranch,
  Hash,
  Info,
  Layers,
  Lightbulb,
  Network,
  Play,
  RefreshCw,
  ScatterChart,
  Search,
  Sigma,
  Sparkles,
  Target,
  TrendingUp,
  Upload,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDataStore } from "@/core/stores/data-store";
import type { EChartsOption } from "@/platform/viz";

import {
  InsightCard,
  SeverityBadge,
  StatCard,
} from "@/features/ai-analysis/components/analysis-cards";
import { AnalysisChart } from "@/features/ai-analysis/components/AnalysisChart";
import { ForecastChart } from "@/features/ai-analysis/components/ForecastChart";
import { VirtualList } from "@/features/ai-analysis/components/VirtualList";
import { useAnalysis } from "@/features/ai-analysis/hooks/useAnalysis";
import { exportAnalysisReport } from "@/features/ai-analysis/model/export-report";
import { linearRegression, mean } from "@/features/ai-analysis/model/stats";

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AiAnalysisScreen() {
  const [activeTab, setActiveTab] = useState<
    "insights" | "anomalies" | "correlations" | "forecast" | "patterns" | "explain"
  >("insights");
  const [selectedCol, setSelectedCol] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // ─── Data store integration ─────────────────────────────────────────────────

  const { datasets, activeDatasetId, loadedTableNames } = useDataStore();
  const activeDataset = datasets.find((d) => d.id === activeDatasetId);
  const preferredTableName = activeDataset?.tableName ?? loadedTableNames[0] ?? "";

  const numericCols = useMemo(
    () => activeDataset?.columns.filter((c) => c.type === "number").map((c) => c.name) ?? [],
    [activeDataset],
  );
  const catCols = useMemo(
    () =>
      activeDataset?.columns
        .filter((c) => c.type === "string" || c.type === "boolean")
        .map((c) => c.name) ?? [],
    [activeDataset],
  );
  const dateCols = useMemo(
    () => activeDataset?.columns.filter((c) => c.type === "date").map((c) => c.name) ?? [],
    [activeDataset],
  );

  // ─── Analysis lifecycle (off-main-thread worker + SQL pushdown + LLM) ────────

  const {
    state: analysisState,
    tableLoaded,
    resolvedTableName,
    rowCount,
    colStats,
    anomalies,
    correlations,
    forecasts,
    clusters,
    forecastMeta,
    insights,
    narrating,
    narrated,
    aiAvailable,
    runAnalysis,
    acknowledgeInsight,
  } = useAnalysis({
    preferredTableName,
    numericCols,
    catCols,
    dateCols,
    hasDataset: Boolean(activeDataset),
  });

  const tableName = resolvedTableName || preferredTableName;

  // Auto-set selectedCol to first numeric col
  useEffect(() => {
    if (numericCols.length > 0 && (!selectedCol || !numericCols.includes(selectedCol))) {
      setSelectedCol(numericCols[0]);
    }
  }, [numericCols, selectedCol]);

  // ─── Chart configs ──────────────────────────────────────────────────────────

  const correlationHeatmap = useMemo(() => {
    const cols = numericCols;
    if (cols.length === 0) return null;

    // O(pairs) lookup instead of an O(cols^2) `.find()` per cell.
    const lookup = new Map<string, number>();
    for (const c of correlations) {
      lookup.set(`${c.col1} ${c.col2}`, c.pearson);
      lookup.set(`${c.col2} ${c.col1}`, c.pearson);
    }

    const data: [number, number, number][] = [];
    for (let i = 0; i < cols.length; i++) {
      for (let j = 0; j < cols.length; j++) {
        const r = i === j ? 1 : (lookup.get(`${cols[i]} ${cols[j]}`) ?? 0);
        data.push([i, j, parseFloat(r.toFixed(3))]);
      }
    }

    // For wide matrices, per-cell labels become unreadable AND expensive to lay
    // out on the main thread — rely on the tooltip instead (plan §2.4).
    const showCellLabels = cols.length <= 12;

    return {
      backgroundColor: "transparent",
      tooltip: {
        formatter: (params: { data: [number, number, number] }) =>
          `${cols[params.data[0]]} × ${cols[params.data[1]]}<br/>r = ${params.data[2]}`,
      },
      grid: { top: 60, bottom: 60, left: 80, right: 30 },
      xAxis: {
        type: "category",
        data: cols,
        axisLabel: { color: "#94a3b8", rotate: 30 },
      },
      yAxis: { type: "category", data: cols, axisLabel: { color: "#94a3b8" } },
      visualMap: {
        min: -1,
        max: 1,
        calculable: true,
        orient: "horizontal",
        left: "center",
        bottom: 5,
        inRange: { color: ["#ef4444", "#1e293b", "#22c55e"] },
        textStyle: { color: "#94a3b8" },
      },
      series: [
        {
          type: "heatmap",
          data,
          label: {
            show: showCellLabels,
            color: "#fff",
            fontSize: 10,
            formatter: (p: { data: [number, number, number] }) => p.data[2].toFixed(2),
          },
          emphasis: { itemStyle: { shadowBlur: 10 } },
        },
      ],
    };
  }, [correlations, numericCols]);

  // Forecast model metrics — memoised so they are not recomputed on every
  // re-render (tab switch, hover); only when the forecast series changes.
  const forecastMetrics = useMemo(() => {
    const actual = forecasts.filter((f) => f.actual !== undefined);
    if (actual.length === 0) return null;
    const xs = actual.map((_, i) => i);
    const ys = actual.map((f) => f.actual ?? 0);
    const reg = linearRegression(xs, ys);
    const residuals = ys.map((y, i) => y - (reg.slope * i + reg.intercept));
    const rmse = Math.sqrt(mean(residuals.map((r) => r ** 2)));
    const mae = mean(residuals.map((r) => Math.abs(r)));
    return [
      {
        label: "R² (Coefficient of Determination)",
        value: reg.r2.toFixed(4),
        good: reg.r2 > 0.7,
      },
      { label: "Slope (trend per period)", value: reg.slope.toFixed(3), good: true },
      { label: "Intercept (baseline)", value: reg.intercept.toFixed(2), good: true },
      { label: "RMSE", value: rmse.toFixed(2), good: rmse < 50 },
      { label: "MAE", value: mae.toFixed(2), good: mae < 40 },
      {
        label: "Data points",
        value: actual.length.toString(),
        good: actual.length >= 6,
      },
    ];
  }, [forecasts]);

  const clusterScatterChart = useMemo(() => {
    if (!clusters.length) return null;
    const xMetric = numericCols[0] ?? "metric_1";
    const yMetric = numericCols[1] ?? numericCols[0] ?? "metric_2";
    return {
      backgroundColor: "transparent",
      tooltip: {
        formatter: (params: { data: number[]; seriesName: string }) =>
          `${params.seriesName}<br/>${xMetric}: ${params.data[0].toFixed(2)}<br/>${yMetric}: ${params.data[1].toFixed(2)}`,
      },
      legend: {
        data: clusters.map((c) => c.label),
        textStyle: { color: "#94a3b8" },
        top: 5,
        type: "scroll",
      },
      grid: { top: 60, bottom: 40, left: 60, right: 30 },
      xAxis: {
        type: "value",
        name: xMetric,
        nameTextStyle: { color: "#94a3b8" },
        axisLabel: { color: "#94a3b8" },
        splitLine: { lineStyle: { color: "#1e293b" } },
      },
      yAxis: {
        type: "value",
        name: yMetric,
        nameTextStyle: { color: "#94a3b8" },
        axisLabel: { color: "#94a3b8" },
        splitLine: { lineStyle: { color: "#1e293b" } },
      },
      series: clusters.map((c) => ({
        name: c.label,
        type: "scatter",
        data: [[c.centroid[xMetric] ?? 0, c.centroid[yMetric] ?? 0]],
        symbolSize: Math.max(15, Math.min(60, c.size / 30)),
        itemStyle: { color: c.color, opacity: 0.85 },
        label: {
          show: true,
          formatter: c.label,
          color: "#fff",
          fontSize: 10,
          position: "top",
        },
      })),
    };
  }, [clusters, numericCols]);

  const anomalyDistChart = useMemo(() => {
    const counts = { critical: 0, warning: 0, info: 0 };
    anomalies.forEach((a) => {
      counts[a.severity]++;
    });
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
          radius: ["40%", "70%"],
          data: [
            {
              value: counts.critical,
              name: "Critical",
              itemStyle: { color: "#ef4444" },
            },
            {
              value: counts.warning,
              name: "Warning",
              itemStyle: { color: "#f59e0b" },
            },
            {
              value: counts.info,
              name: "Info",
              itemStyle: { color: "#3b82f6" },
            },
          ],
          label: { color: "#94a3b8" },
          emphasis: {
            itemStyle: { shadowBlur: 10, shadowColor: "rgba(0,0,0,0.5)" },
          },
        },
      ],
    };
  }, [anomalies]);

  const selectedColStat = colStats.find((c) => c.name === selectedCol);

  const histogramChart = useMemo(() => {
    if (!selectedColStat?.histogram) return null;
    const bins = selectedColStat.histogram;
    const range = (selectedColStat.max ?? 0) - (selectedColStat.min ?? 0);
    const binWidth = range / bins.length;
    const labels = bins.map((_, i) => `${((selectedColStat.min ?? 0) + i * binWidth).toFixed(1)}`);
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: "#1e293b",
        borderColor: "#334155",
        textStyle: { color: "#f1f5f9" },
      },
      grid: { top: 20, bottom: 40, left: 50, right: 20 },
      xAxis: {
        type: "category",
        data: labels,
        axisLabel: { color: "#94a3b8", fontSize: 9, rotate: 30 },
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
          data: bins,
          itemStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "#1E40AF" },
                { offset: 1, color: "#3730a3" },
              ],
            },
          },
          barWidth: "90%",
        },
      ],
    };
  }, [selectedColStat]);

  // ─── Filtered insights ────────────────────────────────────────────────────

  const filteredInsights = useMemo(() => {
    return insights.filter((ins) => {
      const matchSearch =
        !searchQuery ||
        ins.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ins.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchSev = severityFilter === "all" || ins.severity === severityFilter;
      const matchCat = categoryFilter === "all" || ins.category === categoryFilter;
      return matchSearch && matchSev && matchCat;
    });
  }, [insights, searchQuery, severityFilter, categoryFilter]);

  const isRunning = analysisState.status === "running";

  const summaryStats = useMemo(
    () => ({
      totalAnomalies: anomalies.length,
      criticalAnomalies: anomalies.filter((a) => a.severity === "critical").length,
      strongCorrelations: correlations.filter(
        (c) => c.strength === "strong" || c.strength === "very_strong",
      ).length,
      avgConfidence:
        insights.length > 0 ? insights.reduce((s, i) => s + i.confidence, 0) / insights.length : 0,
    }),
    [anomalies, correlations, insights],
  );

  // Numeric columns first, then categorical — one stable array for the virtualized
  // column-statistics list in the Explain tab.
  const orderedColStats = useMemo(
    () => [
      ...colStats.filter((s) => s.type === "numeric"),
      ...colStats.filter((s) => s.type === "categorical"),
    ],
    [colStats],
  );

  const [exporting, setExporting] = useState(false);

  // Export a real, off-main-thread report (XLSX by default; charts embedded as
  // crisp vector SVG → resvg PNG for narrative formats), saved via the Electron
  // fs dialog or a browser download.
  const handleExport = useCallback(
    async (kind: "xlsx" | "pdf" = "xlsx") => {
      if (exporting) return;
      setExporting(true);
      try {
        await exportAnalysisReport(
          {
            datasetName: activeDataset?.name ?? tableName ?? "dataset",
            rowCount,
            insights,
            anomalies,
            correlations,
            colStats,
            forecastMeta,
            charts: [
              ...(correlationHeatmap
                ? [
                    {
                      title: "Correlation heatmap",
                      option: correlationHeatmap as unknown as EChartsOption,
                      width: 720,
                      height: 360,
                    },
                  ]
                : []),
              ...(clusterScatterChart
                ? [
                    {
                      title: "Segments",
                      option: clusterScatterChart as EChartsOption,
                      width: 720,
                      height: 360,
                    },
                  ]
                : []),
              {
                title: "Anomaly severity",
                option: anomalyDistChart as EChartsOption,
                width: 480,
                height: 300,
              },
            ],
          },
          kind,
        );
      } catch (err) {
        console.error("[ai-analysis] export failed:", err);
      } finally {
        setExporting(false);
      }
    },
    [
      exporting,
      activeDataset?.name,
      tableName,
      rowCount,
      insights,
      anomalies,
      correlations,
      colStats,
      forecastMeta,
      correlationHeatmap,
      clusterScatterChart,
      anomalyDistChart,
    ],
  );

  return (
    <div className="">
      <div className="">
        {/* No dataset or stale table guard */}
        {!activeDataset ? (
          <div className="flex flex-col items-center justify-center py-32 text-muted-foreground">
            <Upload className="w-14 h-14 mb-4 opacity-30" />
            <p className="text-xl font-semibold text-foreground mb-1">No Dataset Selected</p>
            <p className="text-sm mb-4">Upload or select a dataset to begin AI analysis.</p>
            <Link
              href="/dashboard/upload"
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Go to Upload
            </Link>
          </div>
        ) : !tableLoaded ? (
          <div className="flex flex-col items-center justify-center py-32 text-muted-foreground">
            <AlertCircle className="w-14 h-14 mb-4 text-yellow-500 opacity-60" />
            <p className="text-xl font-semibold text-foreground mb-1">Session Expired</p>
            <p className="text-sm mb-4">
              The table <span className="font-mono text-foreground">{tableName}</span> is no longer
              in memory. Re-upload to continue analysis.
            </p>
            <Link
              href="/dashboard/upload"
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Re-upload Dataset
            </Link>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
              <div>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-linear-to-br from-violet-600 to-indigo-600 rounded-xl">
                    <Brain className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-foreground">AI Analysis</h1>
                    <p className="text-sm text-muted-foreground">
                      Statistical insights, anomaly detection & forecasting
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {tableLoaded && activeDataset && (
                  <span className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 bg-green-500/15 border border-green-500/25 rounded-lg text-green-400">
                    <Database className="w-3 h-3" />
                    {activeDataset.name} · {rowCount.toLocaleString()} rows
                  </span>
                )}
                {narrating ? (
                  <span className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 bg-violet-500/15 border border-violet-500/25 rounded-lg text-violet-300">
                    <Sparkles className="w-3 h-3 animate-pulse" />
                    Narrating insights…
                  </span>
                ) : narrated ? (
                  <span className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 bg-violet-500/15 border border-violet-500/25 rounded-lg text-violet-300">
                    <Sparkles className="w-3 h-3" />
                    LLM-narrated
                  </span>
                ) : (
                  aiAvailable && (
                    <span className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 bg-card border border-border rounded-lg text-muted-foreground">
                      <Brain className="w-3 h-3" />
                      AI ready
                    </span>
                  )
                )}
                <button
                  type="button"
                  disabled={isRunning || !tableLoaded}
                  onClick={runAnalysis}
                  className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm text-primary-foreground font-medium transition-colors"
                >
                  {isRunning ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" /> Analyzing...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" /> Run Analysis
                    </>
                  )}
                </button>
                <button
                  type="button"
                  disabled={exporting || analysisState.status !== "done"}
                  onClick={() => void handleExport("xlsx")}
                  title="Export analysis report (XLSX)"
                  className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm text-foreground transition-colors"
                >
                  <Download className="w-4 h-4" /> {exporting ? "Exporting…" : "Export XLSX"}
                </button>
                <button
                  type="button"
                  disabled={exporting || analysisState.status !== "done"}
                  onClick={() => void handleExport("pdf")}
                  title="Export narrative report with charts (PDF)"
                  className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm text-foreground transition-colors"
                >
                  <Download className="w-4 h-4" /> PDF
                </button>
              </div>
            </div>

            {/* Progress bar */}
            <AnimatePresence>
              {isRunning && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="mb-4 bg-card border border-border rounded-xl p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-foreground flex items-center gap-2">
                      <Cpu className="w-4 h-4 animate-pulse text-indigo-400" />
                      {analysisState.stage}
                    </span>
                    <span className="text-sm font-mono text-indigo-400">
                      {analysisState.progress}%
                    </span>
                  </div>
                  <div className="h-2 bg-accent rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-linear-to-r from-indigo-500 to-violet-500 rounded-full"
                      animate={{ width: `${analysisState.progress}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Summary cards */}
            {analysisState.status === "done" && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <StatCard
                  label="Insights Generated"
                  value={insights.length}
                  sub={`${insights.filter((i) => !i.acknowledged).length} unreviewed`}
                  icon={Lightbulb}
                  color="bg-indigo-600"
                />
                <StatCard
                  label="Anomalies"
                  value={summaryStats.totalAnomalies}
                  sub={`${summaryStats.criticalAnomalies} critical`}
                  icon={AlertTriangle}
                  color="bg-red-600"
                  trend={-12}
                />
                <StatCard
                  label="Strong Correlations"
                  value={summaryStats.strongCorrelations}
                  sub="across numeric columns"
                  icon={GitBranch}
                  color="bg-purple-600"
                />
                <StatCard
                  label="Avg Confidence"
                  value={`${(summaryStats.avgConfidence * 100).toFixed(0)}%`}
                  sub="across all insights"
                  icon={Target}
                  color="bg-green-600"
                  trend={5.2}
                />
              </div>
            )}

            {/* Tabs */}
            <div className="flex gap-1 flex-wrap mb-4 bg-card rounded-xl p-1 border border-border">
              {(
                [
                  "insights",
                  "anomalies",
                  "correlations",
                  "forecast",
                  "patterns",
                  "explain",
                ] as const
              ).map((tab) => {
                const icons = {
                  insights: Sparkles,
                  anomalies: AlertTriangle,
                  correlations: GitBranch,
                  forecast: TrendingUp,
                  patterns: Layers,
                  explain: FlaskConical,
                };
                const Icon = icons[tab];
                const counts: Record<string, number> = {
                  insights: insights.filter((i) => !i.acknowledged).length,
                  anomalies: anomalies.filter((a) => a.severity === "critical").length,
                  correlations: correlations.length,
                  forecast: forecasts.filter((f) => f.actual === undefined).length,
                  patterns: clusters.length,
                  explain: 0,
                };
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      activeTab === tab
                        ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    {counts[tab] > 0 && (
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded-full ${
                          activeTab === tab ? "bg-white/20 text-white" : "bg-red-500/80 text-white"
                        }`}
                      >
                        {counts[tab]}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Tab content */}
            <AnimatePresence mode="wait">
              {/* ── Insights Tab ─────────────────────────────────────────────────── */}
              {activeTab === "insights" && (
                <motion.div
                  key="insights"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="flex flex-col sm:flex-row gap-3 mb-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Search insights..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-card border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <select
                      value={severityFilter}
                      onChange={(e) => setSeverityFilter(e.target.value)}
                      className="px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none"
                    >
                      <option value="all">All Severity</option>
                      <option value="critical">Critical</option>
                      <option value="warning">Warning</option>
                      <option value="info">Info</option>
                      <option value="success">Success</option>
                    </select>
                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      className="px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none"
                    >
                      <option value="all">All Categories</option>
                      <option value="anomaly">Anomaly</option>
                      <option value="trend">Trend</option>
                      <option value="correlation">Correlation</option>
                      <option value="quality">Quality</option>
                      <option value="pattern">Pattern</option>
                      <option value="forecast">Forecast</option>
                    </select>
                  </div>

                  {filteredInsights.length === 0 && analysisState.status !== "running" && (
                    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                      <Brain className="w-12 h-12 mb-3 opacity-30" />
                      <p className="text-lg font-medium">No insights yet</p>
                      <p className="text-sm mt-1">
                        {tableLoaded
                          ? 'Click "Run Analysis" to generate insights'
                          : "Loading data..."}
                      </p>
                    </div>
                  )}

                  {filteredInsights.length > 0 && (
                    <VirtualList
                      items={filteredInsights}
                      getKey={(insight) => insight.id}
                      estimateSize={120}
                      renderItem={(insight) => (
                        <div className="pb-2">
                          <InsightCard insight={insight} onAcknowledge={acknowledgeInsight} />
                        </div>
                      )}
                    />
                  )}
                </motion.div>
              )}

              {/* ── Anomalies Tab ────────────────────────────────────────────────── */}
              {activeTab === "anomalies" && (
                <motion.div
                  key="anomalies"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="grid grid-cols-1 lg:grid-cols-3 gap-4"
                >
                  <div className="lg:col-span-2 space-y-3">
                    <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-yellow-400" />
                      Detected Anomalies ({anomalies.length})
                    </h2>
                    {anomalies.length === 0 && (
                      <div className="text-center py-12 text-muted-foreground">
                        No anomalies detected yet
                      </div>
                    )}
                    {anomalies.length > 0 && (
                      <VirtualList
                        items={anomalies}
                        getKey={(anom) => anom.id}
                        estimateSize={150}
                        maxHeight={560}
                        renderItem={(anom) => (
                          <div
                            className={`mb-3 bg-card border rounded-xl p-4 ${
                              anom.severity === "critical"
                                ? "border-red-500/30 bg-red-500/5"
                                : anom.severity === "warning"
                                  ? "border-yellow-500/30 bg-yellow-500/5"
                                  : "border-border"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3 mb-2">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`text-xs px-2 py-0.5 rounded font-mono ${
                                    anom.type === "outlier"
                                      ? "bg-red-500/20 text-red-300"
                                      : anom.type === "missing"
                                        ? "bg-yellow-500/20 text-yellow-300"
                                        : anom.type === "distribution_shift"
                                          ? "bg-purple-500/20 text-purple-300"
                                          : "bg-blue-500/20 text-blue-300"
                                  }`}
                                >
                                  {anom.type}
                                </span>
                                <span className="text-foreground font-mono text-sm">
                                  {anom.column}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <SeverityBadge severity={anom.severity} />
                                {anom.affectedRows > 0 && (
                                  <span className="text-xs text-muted-foreground">
                                    {anom.affectedRows.toLocaleString()} rows
                                  </span>
                                )}
                              </div>
                            </div>
                            <p className="text-sm text-foreground">{anom.description}</p>
                            {anom.values && anom.values.length > 0 && (
                              <div className="mt-2 flex gap-1 flex-wrap">
                                <span className="text-xs text-muted-foreground">
                                  Sample values:
                                </span>
                                {anom.values.map((v) => (
                                  <span
                                    key={v.toFixed(6)}
                                    className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-foreground"
                                  >
                                    {v.toFixed(2)}
                                  </span>
                                ))}
                              </div>
                            )}
                            <div className="mt-2">
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>Anomaly score:</span>
                                <div className="flex-1 h-1 bg-accent rounded-full overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-linear-to-r from-green-500 via-yellow-500 to-red-500"
                                    style={{ width: `${Math.min(anom.score * 100, 100)}%` }}
                                  />
                                </div>
                                <span className="font-mono">{(anom.score * 100).toFixed(1)}%</span>
                              </div>
                            </div>
                          </div>
                        )}
                      />
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="bg-card border border-border rounded-xl p-4">
                      <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-indigo-400" />
                        Severity Distribution
                      </h3>
                      {anomalies.length > 0 ? (
                        <AnalysisChart option={anomalyDistChart as EChartsOption} height={200} />
                      ) : (
                        <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
                          No data
                        </div>
                      )}
                    </div>

                    <div className="bg-card border border-border rounded-xl p-4">
                      <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                        <Hash className="w-4 h-4 text-purple-400" />
                        Column Distribution
                      </h3>
                      <div className="flex flex-col gap-2">
                        {numericCols.map((col) => {
                          const colAnoms = anomalies.filter((a) => a.column === col);
                          const bar = colStats.find((s) => s.name === col);
                          return (
                            <button
                              key={col}
                              type="button"
                              onClick={() => setSelectedCol(col)}
                              className={`text-left p-2 rounded-lg text-xs transition-all ${
                                selectedCol === col
                                  ? "bg-indigo-600/20 border border-indigo-500/30"
                                  : "hover:bg-accent"
                              }`}
                            >
                              <div className="flex justify-between mb-1">
                                <span className="text-foreground font-mono">{col}</span>
                                {colAnoms.length > 0 && (
                                  <span className="bg-red-500/20 text-red-300 px-1 rounded">
                                    {colAnoms.length}
                                  </span>
                                )}
                              </div>
                              {bar && (
                                <div className="text-muted-foreground">
                                  avg: {bar.avg?.toFixed(1)} · σ: {bar.stddev?.toFixed(2)}
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {selectedColStat?.histogram && histogramChart && (
                      <div className="bg-card border border-border rounded-xl p-4">
                        <h3 className="text-sm font-semibold text-foreground mb-2 font-mono">
                          {selectedCol} distribution
                        </h3>
                        <AnalysisChart option={histogramChart as EChartsOption} height={160} />
                        {selectedColStat.skewness !== undefined && (
                          <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                            <span>
                              Skew:{" "}
                              <span
                                className={`font-mono ${Math.abs(selectedColStat.skewness) > 1 ? "text-yellow-400" : "text-foreground"}`}
                              >
                                {selectedColStat.skewness.toFixed(3)}
                              </span>
                            </span>
                            {selectedColStat.kurtosis !== undefined && (
                              <span>
                                Kurt:{" "}
                                <span className="font-mono text-foreground">
                                  {selectedColStat.kurtosis.toFixed(3)}
                                </span>
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {/* ── Correlations Tab ─────────────────────────────────────────────── */}
              {activeTab === "correlations" && (
                <motion.div
                  key="correlations"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="bg-card border border-border rounded-xl p-4">
                      <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                        <Flame className="w-4 h-4 text-orange-400" />
                        Correlation Heatmap
                      </h2>
                      {correlations.length > 0 && correlationHeatmap ? (
                        <AnalysisChart
                          option={correlationHeatmap as unknown as EChartsOption}
                          height={300}
                        />
                      ) : (
                        <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                          Run analysis to compute correlations
                        </div>
                      )}
                    </div>

                    <div className="bg-card border border-border rounded-xl p-4">
                      <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                        <ScatterChart className="w-4 h-4 text-purple-400" />
                        Top Correlations
                      </h2>
                      {correlations.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                          No significant correlations found
                        </div>
                      ) : (
                        <VirtualList
                          items={correlations}
                          getKey={(corr) => `${corr.col1}_${corr.col2}`}
                          estimateSize={56}
                          maxHeight={288}
                          renderItem={(corr) => (
                            <div className="mb-2 flex items-center gap-3 p-2 rounded-lg bg-muted hover:bg-accent">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1 text-xs">
                                  <span className="font-mono text-foreground">{corr.col1}</span>
                                  <span className="text-muted-foreground">↔</span>
                                  <span className="font-mono text-foreground">{corr.col2}</span>
                                </div>
                                <div className="mt-1 h-1 bg-accent rounded-full overflow-hidden">
                                  <div
                                    className="h-full rounded-full"
                                    style={{
                                      width: `${Math.abs(corr.pearson) * 100}%`,
                                      backgroundColor: corr.pearson > 0 ? "#22c55e" : "#ef4444",
                                    }}
                                  />
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <div
                                  className={`text-sm font-mono font-bold ${corr.pearson > 0 ? "text-green-400" : "text-red-400"}`}
                                >
                                  {corr.pearson > 0 ? "+" : ""}
                                  {corr.pearson.toFixed(3)}
                                </div>
                                <div className="text-xs text-muted-foreground">{corr.strength}</div>
                              </div>
                            </div>
                          )}
                        />
                      )}
                    </div>
                  </div>

                  <div className="bg-card border border-border rounded-xl p-4">
                    <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                      <Info className="w-4 h-4 text-blue-400" />
                      Interpretation Guide
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        {
                          range: "|r| ≥ 0.8",
                          label: "Very Strong",
                          color: "text-green-400",
                          sub: "Strong predictive power",
                        },
                        {
                          range: "|r| 0.6–0.8",
                          label: "Strong",
                          color: "text-blue-400",
                          sub: "Clear relationship",
                        },
                        {
                          range: "|r| 0.4–0.6",
                          label: "Moderate",
                          color: "text-yellow-400",
                          sub: "Some relationship",
                        },
                        {
                          range: "|r| < 0.2",
                          label: "Weak / None",
                          color: "text-muted-foreground",
                          sub: "Little relationship",
                        },
                      ].map((item) => (
                        <div key={item.label} className="bg-muted rounded-lg p-3">
                          <div className={`font-mono text-sm font-bold ${item.color}`}>
                            {item.range}
                          </div>
                          <div className="text-xs text-foreground mt-0.5">{item.label}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{item.sub}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ── Forecast Tab ─────────────────────────────────────────────────── */}
              {activeTab === "forecast" && (
                <motion.div
                  key="forecast"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  <div className="bg-card border border-border rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-green-400" />
                        {forecastMeta.metricCol ?? numericCols[0] ?? "Metric"} Forecast
                        {forecastMeta.dateCol
                          ? ` · by ${forecastMeta.dateCol}`
                          : forecastMeta.method !== "none"
                            ? " · index proxy"
                            : ""}
                      </h2>
                      {forecasts.length > 0 && (
                        <div className="flex gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <span className="w-3 h-0.5 bg-green-400 inline-block" /> Actual
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="w-3 h-0.5 bg-indigo-400 inline-block" /> Predicted
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="w-3 h-0.5 bg-indigo-400/30 inline-block bg-opacity-30" />{" "}
                            95% CI
                          </span>
                        </div>
                      )}
                    </div>
                    {forecasts.length > 0 ? (
                      <ForecastChart points={forecasts} height={320} />
                    ) : (
                      <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                        Run analysis to generate forecast
                      </div>
                    )}
                  </div>

                  {forecasts.filter((f) => f.actual === undefined).length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                      {forecasts
                        .filter((f) => f.actual === undefined)
                        .map((pt, i) => (
                          <motion.div
                            key={pt.period}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.08 }}
                            className="bg-card border border-indigo-500/20 rounded-xl p-3"
                          >
                            <div className="text-xs text-muted-foreground mb-1">
                              {pt.period.replace(" (forecast)", "")}
                            </div>
                            <div className="text-lg font-bold text-foreground">
                              ${pt.predicted.toFixed(0)}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              [{pt.lower.toFixed(0)}, {pt.upper.toFixed(0)}]
                            </div>
                          </motion.div>
                        ))}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-card border border-border rounded-xl p-4">
                      <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                        <Sigma className="w-4 h-4 text-indigo-400" />
                        Model Metrics
                      </h3>
                      {forecastMetrics && (
                        <div className="space-y-2">
                          {forecastMetrics.map((item) => (
                            <div
                              key={item.label}
                              className="flex items-center justify-between text-sm"
                            >
                              <span className="text-muted-foreground">{item.label}</span>
                              <span
                                className={`font-mono font-semibold ${item.good ? "text-green-400" : "text-yellow-400"}`}
                              >
                                {item.value}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="bg-card border border-border rounded-xl p-4">
                      <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-yellow-400" />
                        Forecast Assumptions
                      </h3>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        {[
                          `Model: ${forecastMeta.method}`,
                          "Level, trend (and seasonality when ≥2 full seasons) smoothed",
                          "95% confidence interval based on in-sample residual std dev",
                          "Homoscedastic residuals assumed for the CI band",
                          "6-period horizon (uncertainty widens with distance)",
                          "Fitted off the full aggregated/sampled series in a worker",
                        ].map((item) => (
                          <li key={item} className="flex items-start gap-2">
                            <ChevronRight className="w-3 h-3 mt-0.5 text-indigo-400 shrink-0" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ── Patterns Tab ─────────────────────────────────────────────────── */}
              {activeTab === "patterns" && (
                <motion.div
                  key="patterns"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="lg:col-span-2 bg-card border border-border rounded-xl p-4">
                      <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                        <ScatterChart className="w-4 h-4 text-purple-400" />
                        Segment Overview ({numericCols[0] ?? "metric"} vs{" "}
                        {numericCols[1] ?? numericCols[0] ?? "metric"})
                      </h2>
                      {clusterScatterChart ? (
                        <AnalysisChart option={clusterScatterChart as EChartsOption} height={300} />
                      ) : (
                        <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                          Run analysis to discover patterns
                        </div>
                      )}
                    </div>

                    <div className="bg-card border border-border rounded-xl p-4">
                      <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                        <Layers className="w-4 h-4 text-yellow-400" />
                        Segments ({clusters.length})
                      </h2>
                      <VirtualList
                        items={clusters}
                        getKey={(cluster) => String(cluster.id)}
                        estimateSize={110}
                        maxHeight={320}
                        renderItem={(cluster) => (
                          <div className="mb-2 p-3 rounded-xl bg-muted border border-border hover:bg-accent transition-colors">
                            <div className="flex items-center gap-2 mb-2">
                              <span
                                className="w-3 h-3 rounded-full shrink-0"
                                style={{ backgroundColor: cluster.color }}
                              />
                              <span className="text-sm font-semibold text-foreground">
                                {cluster.label}
                              </span>
                              <span className="ml-auto text-xs text-muted-foreground">
                                {cluster.size.toLocaleString()} rows
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {cluster.characteristics.map((c) => (
                                <span
                                  key={c}
                                  className="text-xs bg-accent text-foreground px-1.5 py-0.5 rounded"
                                >
                                  {c}
                                </span>
                              ))}
                            </div>
                            <div className="mt-2 grid grid-cols-3 gap-1 text-xs text-muted-foreground">
                              {Object.entries(cluster.centroid)
                                .slice(0, 3)
                                .map(([key, val]) => (
                                  <span key={key}>
                                    {key}: {val.toFixed(2)}
                                  </span>
                                ))}
                            </div>
                          </div>
                        )}
                      />
                    </div>
                  </div>

                  <div className="bg-card border border-border rounded-xl p-4">
                    <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                      <Network className="w-4 h-4 text-cyan-400" />
                      Pattern Analysis Summary
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {clusters.slice(0, 3).map((cluster) => (
                        <div
                          key={cluster.id}
                          className="rounded-xl p-4 border border-border"
                          style={{
                            background: `${cluster.color}15`,
                            borderColor: `${cluster.color}30`,
                          }}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: cluster.color }}
                            />
                            <span className="text-sm font-bold text-foreground">
                              {cluster.label}
                            </span>
                          </div>
                          <div className="space-y-1 text-xs">
                            {Object.entries(cluster.centroid).map(([key, val]) => (
                              <div key={key} className="flex justify-between">
                                <span className="text-muted-foreground">{key}</span>
                                <span className="text-foreground font-mono">{val.toFixed(2)}</span>
                              </div>
                            ))}
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Size</span>
                              <span className="text-foreground font-mono">
                                {cluster.size.toLocaleString()} rows
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {cluster.characteristics.map((c) => (
                              <span
                                key={c}
                                className="text-xs rounded px-1.5 py-0.5 text-white"
                                style={{ backgroundColor: `${cluster.color}30` }}
                              >
                                {c}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ── Explain Tab ──────────────────────────────────────────────────── */}
              {activeTab === "explain" && (
                <motion.div
                  key="explain"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-card border border-border rounded-xl p-4">
                      <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                        <FlaskConical className="w-4 h-4 text-cyan-400" />
                        Statistical Methods Used
                      </h2>
                      <div className="space-y-3">
                        {[
                          {
                            name: "Generalized ESD (S-H-ESD)",
                            desc: "Rosner's iterative test on a reservoir sample: removes the most extreme residual each step and compares to the Student-t critical value λ. Detects multiple outliers without prior count.",
                            formula:
                              "Rᵢ = max|xᵢ-x̄|/s ;  λᵢ = (n-i)·t_{p,n-i-1} / √[(n-i-1+t²)(n-i+1)]",
                            tag: "anomaly",
                          },
                          {
                            name: "IQR Fence Method",
                            desc: "Flags values outside Q1 - 1.5×IQR and Q3 + 1.5×IQR (quartiles from DuckDB quantile_cont). Robust to non-normal distributions.",
                            formula: "fence = Q1 ± 1.5 × (Q3 - Q1)",
                            tag: "anomaly",
                          },
                          {
                            name: "Pearson Correlation",
                            desc: "Native DuckDB corr() over the full table — pairwise-complete, no sampling bias, no misaligned pairs. Range: [-1, 1].",
                            formula: "r = Σ(xi-x̄)(yi-ȳ) / √[Σ(xi-x̄)²·Σ(yi-ȳ)²]",
                            tag: "correlation",
                          },
                          {
                            name: "Holt-Winters (additive)",
                            desc: "Triple exponential smoothing of level, trend and seasonality (falls back to Holt linear / OLS with too few periods). Seeded worker kernel.",
                            formula: "ŷ_{t+h} = ℓ_t + h·b_t + s_{t+h-m(k+1)}",
                            tag: "forecast",
                          },
                          {
                            name: "Seeded k-means (k-means++)",
                            desc: "Standardised per-row feature vectors from a reservoir sample, clustered with a deterministic (seed 42) k-means++ kernel — reproducible segments, not a relabelled GROUP BY.",
                            formula: "argmin Σ_k Σ_{x∈Cₖ} ‖x - μₖ‖²",
                            tag: "pattern",
                          },
                          {
                            name: "Skewness & Excess Kurtosis",
                            desc: "Distribution shape moments computed natively in DuckDB (skewness()/kurtosis()) in the single-pass aggregate — |g₁|>2 flags strong asymmetry.",
                            formula: "g₁ = m₃/m₂^{3/2} ;  g₂ = m₄/m₂² − 3",
                            tag: "distribution",
                          },
                        ].map((method) => (
                          <div
                            key={method.name}
                            className="rounded-lg bg-muted border border-border p-3"
                          >
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <span className="text-sm font-semibold text-foreground">
                                {method.name}
                              </span>
                              <span
                                className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${
                                  method.tag === "anomaly"
                                    ? "bg-red-500/20 text-red-300"
                                    : method.tag === "correlation"
                                      ? "bg-purple-500/20 text-purple-300"
                                      : method.tag === "forecast"
                                        ? "bg-blue-500/20 text-blue-300"
                                        : "bg-muted text-foreground"
                                }`}
                              >
                                {method.tag}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mb-1.5">{method.desc}</p>
                            <code className="text-xs font-mono bg-card text-green-400 px-2 py-1 rounded block overflow-x-auto">
                              {method.formula}
                            </code>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="bg-card border border-border rounded-xl p-4">
                        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                          <Activity className="w-4 h-4 text-green-400" />
                          Column Statistics
                        </h2>
                        <VirtualList
                          items={orderedColStats}
                          getKey={(stat) => stat.name}
                          estimateSize={84}
                          maxHeight={256}
                          renderItem={(stat) =>
                            stat.type === "numeric" ? (
                              <div className="mb-2 bg-muted rounded-lg p-3">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-sm font-mono text-foreground">
                                    {stat.name}
                                  </span>
                                  <span className="text-xs bg-blue-500/20 text-blue-300 px-1.5 rounded">
                                    numeric
                                  </span>
                                </div>
                                <div className="grid grid-cols-3 gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                                  <span>
                                    min:{" "}
                                    <span className="text-foreground font-mono">
                                      {stat.min?.toFixed(1)}
                                    </span>
                                  </span>
                                  <span>
                                    max:{" "}
                                    <span className="text-foreground font-mono">
                                      {stat.max?.toFixed(1)}
                                    </span>
                                  </span>
                                  <span>
                                    avg:{" "}
                                    <span className="text-foreground font-mono">
                                      {stat.avg?.toFixed(2)}
                                    </span>
                                  </span>
                                  <span>
                                    σ:{" "}
                                    <span className="text-foreground font-mono">
                                      {stat.stddev?.toFixed(2)}
                                    </span>
                                  </span>
                                  <span>
                                    median:{" "}
                                    <span className="text-foreground font-mono">
                                      {stat.median?.toFixed(1)}
                                    </span>
                                  </span>
                                  <span>
                                    nulls:{" "}
                                    <span
                                      className={`font-mono ${stat.nullCount > 0 ? "text-yellow-400" : "text-foreground"}`}
                                    >
                                      {stat.nullCount}
                                    </span>
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div className="mb-2 bg-muted rounded-lg p-3">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-sm font-mono text-foreground">
                                    {stat.name}
                                  </span>
                                  <span className="text-xs bg-purple-500/20 text-purple-300 px-1.5 rounded">
                                    categorical
                                  </span>
                                </div>
                                <div className="flex gap-3 text-xs text-muted-foreground">
                                  <span>
                                    distinct:{" "}
                                    <span className="text-foreground font-mono">
                                      {stat.distinctCount}
                                    </span>
                                  </span>
                                  <span>
                                    nulls:{" "}
                                    <span
                                      className={`font-mono ${stat.nullCount > 0 ? "text-yellow-400" : "text-foreground"}`}
                                    >
                                      {stat.nullCount}
                                    </span>
                                  </span>
                                </div>
                              </div>
                            )
                          }
                        />
                      </div>

                      <div className="bg-card border border-border rounded-xl p-4">
                        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                          <Zap className="w-4 h-4 text-yellow-400" />
                          Performance Notes
                        </h2>
                        <ul className="space-y-2 text-xs text-muted-foreground">
                          {[
                            "Statistics pushed down to DuckDB (min/max/avg/stddev, quantiles, skewness, kurtosis) — computed in one columnar pass per group, no per-row JS pull",
                            `${rowCount.toLocaleString()} rows processed across ${numericCols.length} numeric and ${catCols.length} categorical columns`,
                            "Pearson correlations computed natively via DuckDB corr() over the full table — no sampling bias, no misaligned pairs",
                            `Distribution histograms binned in SQL with width_bucket (${20} buckets)`,
                            "Outlier detection uses Tukey/IQR fences on SQL-computed quartiles; k-means clusters a reservoir sample",
                            "Pipeline runs off the main thread in a Comlink worker; insights narrated by the offline AI provider when available",
                          ].map((note) => (
                            <li key={note} className="flex items-start gap-2">
                              <ChevronRight className="w-3 h-3 mt-0.5 text-green-400 shrink-0" />
                              {note}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </div>
  );
}
