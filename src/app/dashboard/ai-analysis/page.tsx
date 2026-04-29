"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import {
  Brain,
  Sparkles,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Lightbulb,
  BarChart3,
  Activity,
  Database,
  RefreshCw,
  Download,
  Play,
  ChevronRight,
  ChevronDown,
  Info,
  Zap,
  Target,
  Eye,
  GitBranch,
  Cpu,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Search,
  Filter,
  Layers,
  Star,
  AlertCircle,
  Sigma,
  FlaskConical,
  LineChart,
  ScatterChart,
  Flame,
  Radar as RadarIcon,
  Network,
  TriangleAlert,
  ChevronUp,
  Hash,
  Upload,
} from "lucide-react";
import { runQuery } from "@/lib/duckdb";
import { useDataStore, type ColMeta } from "@/lib/stores/data-store";
import {
  pearsonCorr,
  buildCorrelationMatrix,
  computeSkewness,
  computeKurtosis,
} from "@/lib/ai/insights";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────

interface ColStat {
  name: string;
  type: "numeric" | "categorical" | "datetime" | "boolean";
  min?: number;
  max?: number;
  avg?: number;
  stddev?: number;
  median?: number;
  nullCount: number;
  distinctCount: number;
  rowCount: number;
  histogram?: number[];
  topValues?: { value: string; count: number }[];
  skewness?: number;
  kurtosis?: number;
}

interface Anomaly {
  id: string;
  column: string;
  type: "outlier" | "spike" | "missing" | "invalid" | "distribution_shift";
  description: string;
  severity: "critical" | "warning" | "info";
  affectedRows: number;
  score: number;
  values?: number[];
  threshold?: number;
}

interface Correlation {
  col1: string;
  col2: string;
  pearson: number;
  strength: "very_strong" | "strong" | "moderate" | "weak" | "none";
  direction: "positive" | "negative" | "none";
}

interface ForecastPoint {
  period: string;
  actual?: number;
  predicted: number;
  lower: number;
  upper: number;
}

interface Insight {
  id: string;
  category:
    | "anomaly"
    | "trend"
    | "correlation"
    | "quality"
    | "pattern"
    | "forecast";
  title: string;
  description: string;
  severity: "critical" | "warning" | "info" | "success";
  confidence: number;
  impact: "high" | "medium" | "low";
  metric?: string;
  value?: string;
  change?: number;
  acknowledged: boolean;
}

interface ClusterGroup {
  id: number;
  label: string;
  size: number;
  centroid: Record<string, number>;
  characteristics: string[];
  color: string;
}

interface AnalysisState {
  status: "idle" | "running" | "done" | "error";
  progress: number;
  stage: string;
}

// ─── Stats Utilities ──────────────────────────────────────────────────────────

import * as ss from "simple-statistics";

function mean(values: number[]): number {
  if (!values.length) return 0;
  return ss.mean(values);
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  return ss.sampleStandardDeviation(values);
}

function pearsonCorrelation(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length || xs.length < 3) return 0;
  return ss.sampleCorrelation(xs, ys);
}

function linearRegression(
  xs: number[],
  ys: number[],
): { slope: number; intercept: number; r2: number } {
  if (xs.length < 2) return { slope: 0, intercept: 0, r2: 0 };
  const pairs: [number, number][] = xs.map((x, i) => [x, ys[i]]);
  const reg = ss.linearRegression(pairs);
  const line = ss.linearRegressionLine(reg);
  const r2 = Math.max(0, Math.min(1, ss.rSquared(pairs, line)));
  return { slope: reg.m, intercept: reg.b, r2 };
}

function detectZScoreAnomalies(
  values: number[],
  threshold = 3.0,
): { idx: number; score: number }[] {
  const m = ss.mean(values);
  const s = ss.sampleStandardDeviation(values);
  if (s === 0) return [];
  return values
    .map((v, i) => ({ idx: i, score: Math.abs(ss.zScore(v, m, s)) }))
    .filter((x) => x.score > threshold);
}

function detectIQRAnomalies(
  values: number[],
): { idx: number; score: number }[] {
  const q1 = ss.quantile(values, 0.25);
  const q3 = ss.quantile(values, 0.75);
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  return values
    .map((v, i) => ({
      idx: i,
      score:
        v < lo ? (lo - v) / (iqr || 1) : v > hi ? (v - hi) / (iqr || 1) : 0,
    }))
    .filter((x) => x.score > 0);
}

function correlationStrength(r: number): Correlation["strength"] {
  const abs = Math.abs(r);
  if (abs >= 0.8) return "very_strong";
  if (abs >= 0.6) return "strong";
  if (abs >= 0.4) return "moderate";
  if (abs >= 0.2) return "weak";
  return "none";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SeverityBadge({
  severity,
}: {
  severity: Anomaly["severity"] | Insight["severity"];
}) {
  const map = {
    critical: "bg-red-500/20 text-red-300 border border-red-500/30",
    warning: "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30",
    info: "bg-blue-500/20 text-blue-300 border border-blue-500/30",
    success: "bg-green-500/20 text-green-300 border border-green-500/30",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${map[severity]}`}
    >
      {severity}
    </span>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? "#22c55e" : pct >= 60 ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-accent rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>
      <span className="text-xs text-muted-foreground w-8 text-right">
        {pct}%
      </span>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
  trend,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  color: string;
  trend?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className={`p-1.5 rounded-lg ${color}`}>
          <Icon className="w-3.5 h-3.5 text-white" />
        </div>
      </div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      {trend !== undefined && (
        <div
          className={`flex items-center gap-1 text-xs ${trend >= 0 ? "text-green-400" : "text-red-400"}`}
        >
          {trend >= 0 ? (
            <ArrowUpRight className="w-3 h-3" />
          ) : (
            <ArrowDownRight className="w-3 h-3" />
          )}
          {Math.abs(trend).toFixed(1)}% from baseline
        </div>
      )}
    </motion.div>
  );
}

function InsightCard({
  insight,
  onAcknowledge,
}: {
  insight: Insight;
  onAcknowledge: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const icons = {
    anomaly: AlertTriangle,
    trend: TrendingUp,
    correlation: GitBranch,
    quality: CheckCircle2,
    pattern: Layers,
    forecast: LineChart,
  };
  const Icon = icons[insight.category];
  const catColor = {
    anomaly: "text-red-400 bg-red-400/10",
    trend: "text-blue-400 bg-blue-400/10",
    correlation: "text-purple-400 bg-purple-400/10",
    quality: "text-green-400 bg-green-400/10",
    pattern: "text-yellow-400 bg-yellow-400/10",
    forecast: "text-cyan-400 bg-cyan-400/10",
  }[insight.category];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: insight.acknowledged ? 0.5 : 1, x: 0 }}
      className={`bg-card border rounded-xl overflow-hidden ${
        insight.severity === "critical"
          ? "border-red-500/30"
          : insight.severity === "warning"
            ? "border-yellow-500/30"
            : insight.severity === "success"
              ? "border-green-500/30"
              : "border-border"
      }`}
    >
      <button
        type="button"
        className="w-full text-left p-4"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 p-1.5 rounded-lg ${catColor}`}>
            <Icon className="w-3.5 h-3.5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-foreground">
                {insight.title}
              </span>
              <SeverityBadge severity={insight.severity} />
              <span
                className={`text-xs px-1.5 py-0.5 rounded ${
                  insight.impact === "high"
                    ? "bg-red-500/20 text-red-300"
                    : insight.impact === "medium"
                      ? "bg-yellow-500/20 text-yellow-300"
                      : "bg-muted text-foreground"
                }`}
              >
                {insight.impact} impact
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {insight.description}
            </p>
          </div>
          <div className="flex-shrink-0">
            {expanded ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-border pt-3 space-y-3">
              <div>
                <div className="text-xs text-muted-foreground mb-1">
                  Confidence
                </div>
                <ConfidenceBar value={insight.confidence} />
              </div>
              {insight.metric && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Metric:</span>
                  <span className="text-foreground font-mono bg-muted px-2 py-0.5 rounded">
                    {insight.metric}
                  </span>
                  {insight.value && (
                    <span className="text-foreground">{insight.value}</span>
                  )}
                </div>
              )}
              {!insight.acknowledged && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAcknowledge(insight.id);
                  }}
                  className="text-xs px-3 py-1.5 bg-accent hover:bg-accent/80 rounded-lg text-foreground transition-colors"
                >
                  Mark as reviewed
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AIAnalysisPage() {
  const [activeTab, setActiveTab] = useState<
    | "insights"
    | "anomalies"
    | "correlations"
    | "forecast"
    | "patterns"
    | "explain"
  >("insights");
  const [analysisState, setAnalysisState] = useState<AnalysisState>({
    status: "idle",
    progress: 0,
    stage: "",
  });
  const [colStats, setColStats] = useState<ColStat[]>([]);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [correlations, setCorrelations] = useState<Correlation[]>([]);
  const [forecasts, setForecasts] = useState<ForecastPoint[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [clusters, setClusters] = useState<ClusterGroup[]>([]);
  const [selectedCol, setSelectedCol] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [rowCount, setRowCount] = useState(0);
  const [tableLoaded, setTableLoaded] = useState(false);
  const runRef = useRef(false);

  // ─── Data store integration ─────────────────────────────────────────────────

  const { datasets, activeDatasetId, loadedTableNames } = useDataStore();
  const activeDataset = datasets.find((d) => d.id === activeDatasetId);
  const tableName = activeDataset?.tableName ?? "";
  const isTableReady = !!tableName && loadedTableNames.includes(tableName);

  const numericCols = useMemo(
    () =>
      activeDataset?.columns
        .filter((c) => c.type === "number")
        .map((c) => c.name) ?? [],
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
    () =>
      activeDataset?.columns
        .filter((c) => c.type === "date")
        .map((c) => c.name) ?? [],
    [activeDataset],
  );

  // Auto-set selectedCol to first numeric col
  useEffect(() => {
    if (
      numericCols.length > 0 &&
      (!selectedCol || !numericCols.includes(selectedCol))
    ) {
      setSelectedCol(numericCols[0]);
    }
  }, [numericCols, selectedCol]);

  // ─── Load data ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isTableReady) {
      setTableLoaded(false);
      return;
    }
    let cancelled = false;
    async function init() {
      if (runRef.current) return;
      runRef.current = true;
      try {
        const countRes = await runQuery(
          `SELECT COUNT(*) as cnt FROM "${tableName}"`,
        );
        if (!cancelled) {
          setTableLoaded(true);
          setRowCount(Number(countRes[0]?.cnt ?? 0));
        }
      } catch (e) {
        console.error("DuckDB init error:", e);
        if (!cancelled) setTableLoaded(false);
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [isTableReady, tableName]);

  // ─── Run full analysis ────────────────────────────────────────────────────

  const runAnalysis = useCallback(async () => {
    if (!tableLoaded || !tableName || numericCols.length === 0) return;
    setAnalysisState({
      status: "running",
      progress: 0,
      stage: "Loading data...",
    });

    try {
      // Stage 1: Column stats
      setAnalysisState({
        status: "running",
        progress: 10,
        stage: "Computing column statistics...",
      });

      const statsResults: ColStat[] = [];

      for (const col of numericCols) {
        const res = await runQuery(`
          SELECT
            COUNT(*) as total,
            COUNT("${col}") as non_null,
            MIN("${col}") as min_val,
            MAX("${col}") as max_val,
            AVG("${col}") as avg_val,
            STDDEV_SAMP("${col}") as std_val,
            MEDIAN("${col}") as median_val,
            COUNT(DISTINCT "${col}") as distinct_count
          FROM "${tableName}"
        `);
        const r = res[0] as Record<string, number>;
        const sample = await runQuery(
          `SELECT "${col}" FROM "${tableName}" WHERE "${col}" IS NOT NULL LIMIT 2000`,
        );
        const vals = sample.map((row) =>
          Number((row as Record<string, unknown>)[col]),
        );
        const hist = buildHistogram(vals, 20);
        const skew = vals.length >= 3 ? ss.sampleSkewness(vals) : 0;
        const kurt = computeKurtosis(vals);
        statsResults.push({
          name: col,
          type: "numeric",
          min: r.min_val,
          max: r.max_val,
          avg: r.avg_val,
          stddev: r.std_val,
          median: r.median_val,
          nullCount: Number(r.total) - Number(r.non_null),
          distinctCount: Number(r.distinct_count),
          rowCount: Number(r.total),
          histogram: hist,
          skewness: skew,
          kurtosis: kurt,
        });
      }

      for (const col of catCols) {
        const res = await runQuery(`
          SELECT
            COUNT(*) as total,
            COUNT("${col}") as non_null,
            COUNT(DISTINCT "${col}") as distinct_count
          FROM "${tableName}"
        `);
        const r = res[0] as Record<string, number>;
        const topRes = await runQuery(`
          SELECT "${col}" as val, COUNT(*) as cnt
          FROM "${tableName}"
          GROUP BY "${col}"
          ORDER BY cnt DESC
          LIMIT 10
        `);
        statsResults.push({
          name: col,
          type: "categorical",
          nullCount: Number(r.total) - Number(r.non_null),
          distinctCount: Number(r.distinct_count),
          rowCount: Number(r.total),
          topValues: topRes.map((row) => {
            const rv = row as Record<string, unknown>;
            return { value: String(rv.val ?? ""), count: Number(rv.cnt) };
          }),
        });
      }

      setColStats(statsResults);

      // Stage 2: Anomaly detection
      setAnalysisState({
        status: "running",
        progress: 30,
        stage: "Detecting anomalies...",
      });

      const newAnomalies: Anomaly[] = [];
      const numStats = statsResults.filter((s) => s.type === "numeric");

      for (const stat of numStats) {
        const sample = await runQuery(
          `SELECT "${stat.name}" FROM "${tableName}" WHERE "${stat.name}" IS NOT NULL LIMIT 3000`,
        );
        const vals = sample.map((row) =>
          Number((row as Record<string, unknown>)[stat.name]),
        );

        const zscore = detectZScoreAnomalies(vals, 3.0);
        if (zscore.length > 0) {
          const score = Math.min(zscore.length / vals.length, 1);
          newAnomalies.push({
            id: `zscore_${stat.name}`,
            column: stat.name,
            type: "outlier",
            description: `${zscore.length} statistical outliers detected (Z-score > 3σ). Values deviate significantly from the mean of ${stat.avg?.toFixed(2)}.`,
            severity:
              zscore.length > 50
                ? "critical"
                : zscore.length > 20
                  ? "warning"
                  : "info",
            affectedRows: zscore.length,
            score,
            values: zscore.slice(0, 5).map((z) => vals[z.idx]),
            threshold: (stat.avg ?? 0) + 3 * (stat.stddev ?? 0),
          });
        }

        const iqr = detectIQRAnomalies(vals);
        if (iqr.length > 0 && iqr.length !== zscore.length) {
          newAnomalies.push({
            id: `iqr_${stat.name}`,
            column: stat.name,
            type: "outlier",
            description: `${iqr.length} IQR outliers detected. Values fall outside 1.5× interquartile range.`,
            severity: iqr.length > 100 ? "warning" : "info",
            affectedRows: iqr.length,
            score: Math.min(iqr.length / vals.length, 1),
          });
        }

        if (stat.skewness !== undefined && Math.abs(stat.skewness) > 2) {
          newAnomalies.push({
            id: `skew_${stat.name}`,
            column: stat.name,
            type: "distribution_shift",
            description: `Column "${stat.name}" is highly skewed (skewness=${stat.skewness.toFixed(2)}). Distribution is not normal.`,
            severity: Math.abs(stat.skewness) > 5 ? "warning" : "info",
            affectedRows: 0,
            score: Math.min(Math.abs(stat.skewness) / 10, 1),
          });
        }

        if (stat.nullCount > 0) {
          const nullRate = stat.nullCount / stat.rowCount;
          newAnomalies.push({
            id: `null_${stat.name}`,
            column: stat.name,
            type: "missing",
            description: `${stat.nullCount} null values (${(nullRate * 100).toFixed(1)}% missing) in column "${stat.name}".`,
            severity:
              nullRate > 0.1
                ? "critical"
                : nullRate > 0.05
                  ? "warning"
                  : "info",
            affectedRows: stat.nullCount,
            score: nullRate,
          });
        }
      }

      setAnomalies(newAnomalies);

      // Stage 3: Correlations
      setAnalysisState({
        status: "running",
        progress: 55,
        stage: "Computing correlations...",
      });

      const corrData: Record<string, number[]> = {};
      for (const col of numericCols) {
        const rows = await runQuery(
          `SELECT "${col}" FROM "${tableName}" WHERE "${col}" IS NOT NULL LIMIT 3000`,
        );
        corrData[col] = rows.map((r) =>
          Number((r as Record<string, unknown>)[col]),
        );
      }

      const newCorr: Correlation[] = [];
      for (let i = 0; i < numericCols.length; i++) {
        for (let j = i + 1; j < numericCols.length; j++) {
          const a = numericCols[i];
          const b = numericCols[j];
          const r = pearsonCorrelation(corrData[a], corrData[b]);
          const strength = correlationStrength(r);
          if (strength !== "none") {
            newCorr.push({
              col1: a,
              col2: b,
              pearson: r,
              strength,
              direction: r > 0 ? "positive" : r < 0 ? "negative" : "none",
            });
          }
        }
      }
      newCorr.sort((a, b) => Math.abs(b.pearson) - Math.abs(a.pearson));
      setCorrelations(newCorr);

      // Stage 4: Forecast
      setAnalysisState({
        status: "running",
        progress: 70,
        stage: "Generating forecasts...",
      });

      const forecastPoints: ForecastPoint[] = [];
      const forecastDateCol = dateCols[0];
      const forecastMetricCol = numericCols[0];

      if (forecastDateCol && forecastMetricCol) {
        const revenueByMonth = await runQuery(`
          SELECT
            strftime("${forecastDateCol}", '%Y-%m') as period,
            AVG("${forecastMetricCol}") as avg_metric,
            COUNT(*) as cnt
          FROM "${tableName}"
          WHERE "${forecastDateCol}" IS NOT NULL
          GROUP BY period
          ORDER BY period
          LIMIT 24
        `);

        const metricRows = revenueByMonth as Array<Record<string, unknown>>;

        if (metricRows.length >= 4) {
          const xs = metricRows.map((_, i) => i);
          const ys = metricRows.map((r) => Number(r.avg_metric));
          const reg = linearRegression(xs, ys);
          const s = stdDev(ys);

          metricRows.forEach((r, i) => {
            forecastPoints.push({
              period: String(r.period),
              actual: Number(r.avg_metric),
              predicted: reg.slope * i + reg.intercept,
              lower: reg.slope * i + reg.intercept - 1.96 * s,
              upper: reg.slope * i + reg.intercept + 1.96 * s,
            });
          });

          const lastPeriod = metricRows[metricRows.length - 1].period as string;
          const [lastYear, lastMonthStr] = String(lastPeriod).split("-");
          let yr = Number(lastYear);
          let mo = Number(lastMonthStr);
          for (let k = 1; k <= 6; k++) {
            mo++;
            if (mo > 12) {
              mo = 1;
              yr++;
            }
            const fi = xs.length + k - 1;
            const pred = reg.slope * fi + reg.intercept;
            forecastPoints.push({
              period: `${yr}-${String(mo).padStart(2, "0")} (forecast)`,
              predicted: pred,
              lower: pred - 1.96 * s,
              upper: pred + 1.96 * s,
            });
          }
        }
      } else if (numericCols.length >= 1) {
        // No date column — fallback: use row index as time proxy
        const sample = await runQuery(
          `SELECT "${forecastMetricCol}" FROM "${tableName}" WHERE "${forecastMetricCol}" IS NOT NULL LIMIT 100`,
        );
        const vals = sample.map((r) =>
          Number((r as Record<string, unknown>)[forecastMetricCol]),
        );
        if (vals.length >= 4) {
          const xs = vals.map((_, i) => i);
          const reg = linearRegression(xs, vals);
          const s = stdDev(vals);
          vals.forEach((v, i) => {
            forecastPoints.push({
              period: `Row ${i + 1}`,
              actual: v,
              predicted: reg.slope * i + reg.intercept,
              lower: reg.slope * i + reg.intercept - 1.96 * s,
              upper: reg.slope * i + reg.intercept + 1.96 * s,
            });
          });
          for (let k = 1; k <= 6; k++) {
            const fi = vals.length + k - 1;
            const pred = reg.slope * fi + reg.intercept;
            forecastPoints.push({
              period: `Row ${fi + 1} (forecast)`,
              predicted: pred,
              lower: pred - 1.96 * s,
              upper: pred + 1.96 * s,
            });
          }
        }
      }

      setForecasts(forecastPoints);

      // Stage 5: Patterns / Clustering
      setAnalysisState({
        status: "running",
        progress: 82,
        stage: "Discovering patterns...",
      });

      const groupCol = catCols[0];
      const metricCols = numericCols.slice(0, 3);
      const newClusters: ClusterGroup[] = [];

      if (groupCol && metricCols.length > 0) {
        const avgSelects = metricCols
          .map((c) => `AVG("${c}") as "avg_${c}"`)
          .join(", ");
        const clusterRes = await runQuery(`
          SELECT
            "${groupCol}",
            ${avgSelects},
            COUNT(*) as cnt
          FROM "${tableName}"
          GROUP BY "${groupCol}"
          ORDER BY cnt DESC
          LIMIT 20
        `);

        const clusterColors = [
          "#6366f1",
          "#22c55e",
          "#f59e0b",
          "#ef4444",
          "#8b5cf6",
          "#06b6d4",
          "#ec4899",
          "#84cc16",
        ];
        clusterRes.forEach((row, i) => {
          const r = row as Record<string, unknown>;
          const centroid: Record<string, number> = {};
          const chars: string[] = [];
          for (const mc of metricCols) {
            const val = Number(r[`avg_${mc}`]);
            centroid[mc] = val;
            const stat = statsResults.find((s) => s.name === mc);
            if (stat?.avg !== undefined) {
              const diff = val - stat.avg;
              if (diff > stat.avg * 0.2) chars.push(`High ${mc}`);
              else if (diff < -stat.avg * 0.2) chars.push(`Low ${mc}`);
            }
          }
          newClusters.push({
            id: i,
            label: String(r[groupCol]),
            size: Number(r.cnt),
            centroid,
            characteristics: chars.length > 0 ? chars : ["Average"],
            color: clusterColors[i % clusterColors.length],
          });
        });
      }
      setClusters(newClusters);

      // Stage 6: Generate insights
      setAnalysisState({
        status: "running",
        progress: 92,
        stage: "Generating insights...",
      });

      const newInsights: Insight[] = [];

      // Metric trend insight
      if (forecastPoints.length > 4 && forecastMetricCol) {
        const actuals = forecastPoints.filter((f) => f.actual !== undefined);
        const firstVal = actuals[0].actual ?? 0;
        const lastVal = actuals[actuals.length - 1].actual ?? 0;
        const pct = firstVal > 0 ? ((lastVal - firstVal) / firstVal) * 100 : 0;
        newInsights.push({
          id: `trend_${forecastMetricCol}`,
          category: "trend",
          title: `${forecastMetricCol} ${pct >= 0 ? "Growth" : "Decline"} Detected`,
          description: `Average ${forecastMetricCol} has ${pct >= 0 ? "increased" : "decreased"} by ${Math.abs(pct).toFixed(1)}% over the observed period. Linear trend R² = ${linearRegression(
            actuals.map((_, i) => i),
            actuals.map((f) => f.actual ?? 0),
          ).r2.toFixed(3)}.`,
          severity: Math.abs(pct) > 20 ? "warning" : "info",
          confidence: 0.87,
          impact: Math.abs(pct) > 15 ? "high" : "medium",
          metric: forecastMetricCol,
          value: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`,
          change: pct,
          acknowledged: false,
        });
      }

      // Top correlation insight
      if (newCorr.length > 0) {
        const top = newCorr[0];
        newInsights.push({
          id: "corr_top",
          category: "correlation",
          title: `Strong Correlation: ${top.col1} ↔ ${top.col2}`,
          description: `Pearson r=${top.pearson.toFixed(3)} indicates a ${top.strength} ${top.direction} relationship. Changes in ${top.col1} explain ${(top.pearson ** 2 * 100).toFixed(1)}% of variance in ${top.col2}.`,
          severity: "info",
          confidence: 0.93,
          impact: top.strength === "very_strong" ? "high" : "medium",
          metric: `${top.col1} vs ${top.col2}`,
          value: `r = ${top.pearson.toFixed(3)}`,
          acknowledged: false,
        });
      }

      // Critical anomalies
      const critAnoms = newAnomalies.filter((a) => a.severity === "critical");
      if (critAnoms.length > 0) {
        newInsights.push({
          id: "anomaly_critical",
          category: "anomaly",
          title: `${critAnoms.length} Critical Anomalies Detected`,
          description: `Critical issues found in columns: ${critAnoms.map((a) => a.column).join(", ")}. Immediate review recommended.`,
          severity: "critical",
          confidence: 0.91,
          impact: "high",
          acknowledged: false,
        });
      }

      // Data quality
      const nullCols = statsResults.filter(
        (s) => s.nullCount > s.rowCount * 0.05,
      );
      if (nullCols.length > 0) {
        newInsights.push({
          id: "quality_nulls",
          category: "quality",
          title: "Data Completeness Issue",
          description: `${nullCols.length} columns have >5% missing values: ${nullCols.map((c) => c.name).join(", ")}. Consider imputation or data collection improvements.`,
          severity: "warning",
          confidence: 1.0,
          impact: "medium",
          metric: "completeness",
          value: `${nullCols.length} affected columns`,
          acknowledged: false,
        });
      }

      // Top performing cluster
      if (newClusters.length > 0 && metricCols.length > 0) {
        const top = newClusters[0];
        const metricSummary = metricCols
          .map((mc) => `${mc}: ${top.centroid[mc]?.toFixed(2) ?? "N/A"}`)
          .join(", ");
        newInsights.push({
          id: "pattern_top",
          category: "pattern",
          title: `Top Segment: ${top.label}`,
          description: `${top.label} leads with ${metricSummary}. Contains ${top.size.toLocaleString()} rows.`,
          severity: "success",
          confidence: 0.85,
          impact: "high",
          metric: groupCol,
          value: top.label,
          acknowledged: false,
        });
      }

      // Forecast insight
      const futurePts = forecastPoints.filter((f) => f.actual === undefined);
      if (futurePts.length > 0) {
        const lastFuture = futurePts[futurePts.length - 1];
        const lastActual = forecastPoints.findLast(
          (f) => f.actual !== undefined,
        );
        const delta = lastActual
          ? lastFuture.predicted - (lastActual.actual ?? lastActual.predicted)
          : 0;
        newInsights.push({
          id: `forecast_${forecastMetricCol}`,
          category: "forecast",
          title: `6-Period ${forecastMetricCol ?? "Metric"} Forecast`,
          description: `Model predicts ${delta >= 0 ? "+" : ""}${delta.toFixed(0)} change in avg ${forecastMetricCol ?? "metric"} over next 6 periods. 95% confidence interval: [${lastFuture.lower.toFixed(0)}, ${lastFuture.upper.toFixed(0)}].`,
          severity: delta < 0 ? "warning" : "info",
          confidence: 0.78,
          impact: "high",
          metric: `${forecastMetricCol ?? "metric"} forecast`,
          value: `${lastFuture.predicted.toFixed(0)}`,
          acknowledged: false,
        });
      }

      setInsights(newInsights);
      setAnalysisState({
        status: "done",
        progress: 100,
        stage: "Analysis complete",
      });
    } catch (err) {
      console.error("Analysis error:", err);
      setAnalysisState({ status: "error", progress: 0, stage: String(err) });
    }
  }, [tableLoaded, tableName, numericCols, catCols, dateCols]);

  // Auto-run when data is ready
  useEffect(() => {
    if (tableLoaded) runAnalysis();
  }, [tableLoaded, runAnalysis]);

  // ─── Chart configs ──────────────────────────────────────────────────────────

  const correlationHeatmap = useMemo(() => {
    const cols = numericCols;
    if (cols.length === 0) return null;
    const matrix: number[][] = [];
    for (let i = 0; i < cols.length; i++) {
      matrix[i] = [];
      for (let j = 0; j < cols.length; j++) {
        if (i === j) {
          matrix[i][j] = 1;
        } else {
          const found = correlations.find(
            (c) =>
              (c.col1 === cols[i] && c.col2 === cols[j]) ||
              (c.col1 === cols[j] && c.col2 === cols[i]),
          );
          matrix[i][j] = found ? found.pearson : 0;
        }
      }
    }

    const data: [number, number, number][] = [];
    for (let i = 0; i < cols.length; i++) {
      for (let j = 0; j < cols.length; j++) {
        data.push([i, j, parseFloat(matrix[i][j].toFixed(3))]);
      }
    }

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
            show: true,
            color: "#fff",
            fontSize: 10,
            formatter: (p: { data: [number, number, number] }) =>
              p.data[2].toFixed(2),
          },
          emphasis: { itemStyle: { shadowBlur: 10 } },
        },
      ],
    };
  }, [correlations, numericCols]);

  const forecastChart = useMemo(() => {
    const future = forecasts.filter((f) => f.actual === undefined);
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "cross" },
        backgroundColor: "#1e293b",
        borderColor: "#334155",
        textStyle: { color: "#f1f5f9" },
      },
      legend: {
        data: ["Actual", "Predicted", "Confidence Band"],
        textStyle: { color: "#94a3b8" },
        top: 5,
      },
      grid: { top: 50, bottom: 40, left: 60, right: 30 },
      xAxis: {
        type: "category",
        data: forecasts.map((f) => f.period.replace(" (forecast)", "")),
        axisLabel: { color: "#94a3b8", rotate: 30, fontSize: 10 },
        axisLine: { lineStyle: { color: "#334155" } },
      },
      yAxis: {
        type: "value",
        axisLabel: {
          color: "#94a3b8",
          formatter: (v: number) => `$${v.toFixed(0)}`,
        },
        splitLine: { lineStyle: { color: "#1e293b" } },
      },
      series: [
        {
          name: "Confidence Band",
          type: "line",
          data: forecasts.map((f) => [f.upper, f.lower]),
          lineStyle: { opacity: 0 },
          areaStyle: { color: "rgba(99,102,241,0.1)", origin: "start" },
          stack: "confidence",
          symbol: "none",
          z: 1,
        },
        {
          name: "Actual",
          type: "line",
          data: forecasts.map((f) => f.actual ?? null),
          lineStyle: { color: "#22c55e", width: 2 },
          itemStyle: { color: "#22c55e" },
          symbol: "circle",
          symbolSize: 5,
          z: 3,
        },
        {
          name: "Predicted",
          type: "line",
          data: forecasts.map((f) => parseFloat(f.predicted.toFixed(2))),
          lineStyle: {
            color: "#6366f1",
            width: 2,
            type:
              future.length > 0
                ? forecasts.findIndex((f) => f.actual === undefined) > -1
                  ? "solid"
                  : "dashed"
                : "solid",
          },
          itemStyle: { color: "#6366f1" },
          symbol: "none",
          z: 2,
        },
      ],
    };
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
    const labels = bins.map(
      (_, i) => `${((selectedColStat.min ?? 0) + i * binWidth).toFixed(1)}`,
    );
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
                { offset: 0, color: "#6366f1" },
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
      const matchSev =
        severityFilter === "all" || ins.severity === severityFilter;
      const matchCat =
        categoryFilter === "all" || ins.category === categoryFilter;
      return matchSearch && matchSev && matchCat;
    });
  }, [insights, searchQuery, severityFilter, categoryFilter]);

  const acknowledgeInsight = useCallback((id: string) => {
    setInsights((prev) =>
      prev.map((ins) => (ins.id === id ? { ...ins, acknowledged: true } : ins)),
    );
  }, []);

  const isRunning = analysisState.status === "running";

  const summaryStats = useMemo(
    () => ({
      totalAnomalies: anomalies.length,
      criticalAnomalies: anomalies.filter((a) => a.severity === "critical")
        .length,
      strongCorrelations: correlations.filter(
        (c) => c.strength === "strong" || c.strength === "very_strong",
      ).length,
      avgConfidence:
        insights.length > 0
          ? insights.reduce((s, i) => s + i.confidence, 0) / insights.length
          : 0,
    }),
    [anomalies, correlations, insights],
  );

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      {/* No dataset or stale table guard */}
      {!activeDataset ? (
        <div className="flex flex-col items-center justify-center py-32 text-muted-foreground">
          <Upload className="w-14 h-14 mb-4 opacity-30" />
          <p className="text-xl font-semibold text-foreground mb-1">
            No Dataset Selected
          </p>
          <p className="text-sm mb-4">
            Upload or select a dataset to begin AI analysis.
          </p>
          <Link
            href="/dashboard/upload"
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Go to Upload
          </Link>
        </div>
      ) : !isTableReady ? (
        <div className="flex flex-col items-center justify-center py-32 text-muted-foreground">
          <AlertCircle className="w-14 h-14 mb-4 text-yellow-500 opacity-60" />
          <p className="text-xl font-semibold text-foreground mb-1">
            Session Expired
          </p>
          <p className="text-sm mb-4">
            The table{" "}
            <span className="font-mono text-foreground">{tableName}</span> is no
            longer in memory. Re-upload to continue analysis.
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
                <div className="p-2 bg-gradient-to-br from-violet-600 to-indigo-600 rounded-xl">
                  <Brain className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-foreground">
                    AI Analysis
                  </h1>
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
                onClick={() => {
                  const data = { insights, anomalies, correlations, colStats };
                  const blob = new Blob([JSON.stringify(data, null, 2)], {
                    type: "application/json",
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "analysis_report.json";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent/80 rounded-lg text-sm text-foreground transition-colors"
              >
                <Download className="w-4 h-4" /> Export
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
                    className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full"
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
                anomalies: anomalies.filter((a) => a.severity === "critical")
                  .length,
                correlations: correlations.length,
                forecast: forecasts.filter((f) => f.actual === undefined)
                  .length,
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
                        activeTab === tab
                          ? "bg-white/20 text-white"
                          : "bg-red-500/80 text-white"
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

                {filteredInsights.length === 0 &&
                  analysisState.status !== "running" && (
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

                <div className="space-y-2">
                  {filteredInsights.map((insight) => (
                    <InsightCard
                      key={insight.id}
                      insight={insight}
                      onAcknowledge={acknowledgeInsight}
                    />
                  ))}
                </div>
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
                  {anomalies.map((anom, idx) => (
                    <motion.div
                      key={anom.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className={`bg-card border rounded-xl p-4 ${
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
                      <p className="text-sm text-foreground">
                        {anom.description}
                      </p>
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
                              className="h-full rounded-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500"
                              style={{
                                width: `${Math.min(anom.score * 100, 100)}%`,
                              }}
                            />
                          </div>
                          <span className="font-mono">
                            {(anom.score * 100).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>

                <div className="space-y-4">
                  <div className="bg-card border border-border rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-indigo-400" />
                      Severity Distribution
                    </h3>
                    {anomalies.length > 0 ? (
                      <ReactECharts
                        option={anomalyDistChart}
                        style={{ height: 200 }}
                      />
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
                        const colAnoms = anomalies.filter(
                          (a) => a.column === col,
                        );
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
                              <span className="text-foreground font-mono">
                                {col}
                              </span>
                              {colAnoms.length > 0 && (
                                <span className="bg-red-500/20 text-red-300 px-1 rounded">
                                  {colAnoms.length}
                                </span>
                              )}
                            </div>
                            {bar && (
                              <div className="text-muted-foreground">
                                avg: {bar.avg?.toFixed(1)} · σ:{" "}
                                {bar.stddev?.toFixed(2)}
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
                      <ReactECharts
                        option={histogramChart}
                        style={{ height: 160 }}
                      />
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
                    {correlations.length > 0 ? (
                      <ReactECharts
                        option={correlationHeatmap}
                        style={{ height: 300 }}
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
                    <div className="space-y-2 max-h-72 overflow-y-auto">
                      {correlations.slice(0, 15).map((corr, idx) => (
                        <motion.div
                          key={`${corr.col1}_${corr.col2}`}
                          initial={{ opacity: 0, x: -5 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.04 }}
                          className="flex items-center gap-3 p-2 rounded-lg bg-muted hover:bg-accent"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1 text-xs">
                              <span className="font-mono text-foreground">
                                {corr.col1}
                              </span>
                              <span className="text-muted-foreground">↔</span>
                              <span className="font-mono text-foreground">
                                {corr.col2}
                              </span>
                            </div>
                            <div className="mt-1 h-1 bg-accent rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${Math.abs(corr.pearson) * 100}%`,
                                  backgroundColor:
                                    corr.pearson > 0 ? "#22c55e" : "#ef4444",
                                }}
                              />
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div
                              className={`text-sm font-mono font-bold ${corr.pearson > 0 ? "text-green-400" : "text-red-400"}`}
                            >
                              {corr.pearson > 0 ? "+" : ""}
                              {corr.pearson.toFixed(3)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {corr.strength}
                            </div>
                          </div>
                        </motion.div>
                      ))}
                      {correlations.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                          No significant correlations found
                        </div>
                      )}
                    </div>
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
                        <div
                          className={`font-mono text-sm font-bold ${item.color}`}
                        >
                          {item.range}
                        </div>
                        <div className="text-xs text-foreground mt-0.5">
                          {item.label}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {item.sub}
                        </div>
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
                      {numericCols[0] ?? "Metric"} Forecast (Linear Regression)
                    </h2>
                    {forecasts.length > 0 && (
                      <div className="flex gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <span className="w-3 h-0.5 bg-green-400 inline-block" />{" "}
                          Actual
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-3 h-0.5 bg-indigo-400 inline-block" />{" "}
                          Predicted
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-3 h-0.5 bg-indigo-400/30 inline-block bg-opacity-30" />{" "}
                          95% CI
                        </span>
                      </div>
                    )}
                  </div>
                  {forecasts.length > 0 ? (
                    <ReactECharts
                      option={forecastChart}
                      style={{ height: 320 }}
                    />
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
                    {forecasts.length > 0 &&
                      (() => {
                        const actual = forecasts.filter(
                          (f) => f.actual !== undefined,
                        );
                        const xs = actual.map((_, i) => i);
                        const ys = actual.map((f) => f.actual ?? 0);
                        const reg = linearRegression(xs, ys);
                        const residuals = ys.map(
                          (y, i) => y - (reg.slope * i + reg.intercept),
                        );
                        const mse = mean(residuals.map((r) => r ** 2));
                        const rmse = Math.sqrt(mse);
                        const mae = mean(residuals.map((r) => Math.abs(r)));
                        return (
                          <div className="space-y-2">
                            {[
                              {
                                label: "R² (Coefficient of Determination)",
                                value: reg.r2.toFixed(4),
                                good: reg.r2 > 0.7,
                              },
                              {
                                label: "Slope (trend per period)",
                                value: reg.slope.toFixed(3),
                                good: true,
                              },
                              {
                                label: "Intercept (baseline)",
                                value: reg.intercept.toFixed(2),
                                good: true,
                              },
                              {
                                label: "RMSE",
                                value: rmse.toFixed(2),
                                good: rmse < 50,
                              },
                              {
                                label: "MAE",
                                value: mae.toFixed(2),
                                good: mae < 40,
                              },
                              {
                                label: "Data points",
                                value: actual.length.toString(),
                                good: actual.length >= 6,
                              },
                            ].map((item) => (
                              <div
                                key={item.label}
                                className="flex items-center justify-between text-sm"
                              >
                                <span className="text-muted-foreground">
                                  {item.label}
                                </span>
                                <span
                                  className={`font-mono font-semibold ${item.good ? "text-green-400" : "text-yellow-400"}`}
                                >
                                  {item.value}
                                </span>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                  </div>

                  <div className="bg-card border border-border rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-yellow-400" />
                      Forecast Assumptions
                    </h3>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      {[
                        "Linear trend continuation (OLS regression)",
                        "Homoscedastic residuals assumed",
                        "No seasonality adjustments applied",
                        "95% confidence interval based on residual std dev",
                        "6-period horizon (higher uncertainty)",
                        "Model retrained on full historical dataset",
                      ].map((item) => (
                        <li key={item} className="flex items-start gap-2">
                          <ChevronRight className="w-3 h-3 mt-0.5 text-indigo-400 flex-shrink-0" />
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
                      <ReactECharts
                        option={clusterScatterChart}
                        style={{ height: 300 }}
                      />
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
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {clusters.map((cluster, idx) => (
                        <motion.div
                          key={cluster.id}
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.06 }}
                          className="p-3 rounded-xl bg-muted border border-border hover:bg-accent transition-colors"
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <span
                              className="w-3 h-3 rounded-full flex-shrink-0"
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
                        </motion.div>
                      ))}
                    </div>
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
                          {Object.entries(cluster.centroid).map(
                            ([key, val]) => (
                              <div key={key} className="flex justify-between">
                                <span className="text-muted-foreground">
                                  {key}
                                </span>
                                <span className="text-foreground font-mono">
                                  {val.toFixed(2)}
                                </span>
                              </div>
                            ),
                          )}
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
                          name: "Z-Score Outlier Detection",
                          desc: "Identifies values deviating >3 standard deviations from the mean. Best for normally distributed data.",
                          formula: "z = (x - μ) / σ",
                          tag: "anomaly",
                        },
                        {
                          name: "IQR Fence Method",
                          desc: "Flags values outside Q1 - 1.5×IQR and Q3 + 1.5×IQR. Robust to non-normal distributions.",
                          formula: "fence = Q1 ± 1.5 × (Q3 - Q1)",
                          tag: "anomaly",
                        },
                        {
                          name: "Pearson Correlation",
                          desc: "Measures linear correlation between two continuous variables. Range: [-1, 1].",
                          formula: "r = Σ(xi-x̄)(yi-ȳ) / √[Σ(xi-x̄)²·Σ(yi-ȳ)²]",
                          tag: "correlation",
                        },
                        {
                          name: "Ordinary Least Squares",
                          desc: "Fits a line that minimizes sum of squared residuals for time series forecasting.",
                          formula: "ŷ = β₀ + β₁x, minimize Σ(yi - ŷi)²",
                          tag: "forecast",
                        },
                        {
                          name: "Skewness",
                          desc: "Measures asymmetry of a distribution. >2 indicates significant right skew.",
                          formula: "g₁ = [n/((n-1)(n-2))] × Σ[(xi-x̄)/s]³",
                          tag: "distribution",
                        },
                        {
                          name: "Excess Kurtosis",
                          desc: "Measures tail heaviness. Positive kurtosis = heavier tails than normal (leptokurtic).",
                          formula:
                            "g₂ = [(n(n+1))/((n-1)(n-2)(n-3))] × Σ[(xi-x̄)/s]⁴ - 3(n-1)²/((n-2)(n-3))",
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
                              className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${
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
                          <p className="text-xs text-muted-foreground mb-1.5">
                            {method.desc}
                          </p>
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
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {colStats
                          .filter((s) => s.type === "numeric")
                          .map((stat) => (
                            <div
                              key={stat.name}
                              className="bg-muted rounded-lg p-3"
                            >
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
                          ))}
                        {colStats
                          .filter((s) => s.type === "categorical")
                          .map((stat) => (
                            <div
                              key={stat.name}
                              className="bg-muted rounded-lg p-3"
                            >
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
                          ))}
                      </div>
                    </div>

                    <div className="bg-card border border-border rounded-xl p-4">
                      <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                        <Zap className="w-4 h-4 text-yellow-400" />
                        Performance Notes
                      </h2>
                      <ul className="space-y-2 text-xs text-muted-foreground">
                        {[
                          "All statistics computed in-browser via DuckDB WASM (no server round-trips)",
                          `${rowCount.toLocaleString()} row dataset processed using columnar SQL aggregations`,
                          "Pearson correlations sampled to 3,000 rows for O(n) performance",
                          "Distribution histograms binned in 20 equal-width buckets",
                          "Statistical functions powered by simple-statistics library",
                          `Anomaly detection runs Z-score + IQR across ${numericCols.length} numeric columns`,
                        ].map((note) => (
                          <li key={note} className="flex items-start gap-2">
                            <ChevronRight className="w-3 h-3 mt-0.5 text-green-400 flex-shrink-0" />
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
  );
}

// ─── Helper: build histogram ──────────────────────────────────────────────────

function buildHistogram(values: number[], bins: number): number[] {
  if (!values.length) return Array(bins).fill(0) as number[];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return Array(bins).fill(0) as number[];
  const counts = Array(bins).fill(0) as number[];
  const range = max - min;
  for (const v of values) {
    const idx = Math.min(Math.floor(((v - min) / range) * bins), bins - 1);
    counts[idx]++;
  }
  return counts;
}
