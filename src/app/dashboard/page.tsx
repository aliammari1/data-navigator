"use client";

import { motion } from "motion/react";
import {
  Activity,
  BarChart2,
  Brain,
  CheckCircle2,
  Clock,
  Database,
  FileText,
  Hash,
  Layers,
  RefreshCw,
  Table2,
  TrendingUp,
  Upload,
  Zap,
  AlertTriangle,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { runQuery } from "@/lib/duckdb";
import { useDataStore, type Dataset } from "@/lib/stores/data-store";
import { cn } from "@/lib/utils";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

function fmtBytes(b: number): string {
  if (b === 0) return "0 B";
  const k = 1024;
  const s = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return `${(b / k ** i).toFixed(1)} ${s[i]}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

// ─── Animated counter ─────────────────────────────────────────────────────────

function AnimatedNumber({
  value,
  suffix = "",
}: {
  value: number;
  suffix?: string;
}) {
  const [displayed, setDisplayed] = useState(0);
  const displayedRef = useRef(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const from = displayedRef.current;
    const t0 = performance.now();
    const dur = 900;
    const tick = (t: number) => {
      const p = Math.min((t - t0) / dur, 1);
      const e = 1 - (1 - p) ** 3;
      const next = from + (value - from) * e;
      displayedRef.current = next;
      setDisplayed(next);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value]);

  return (
    <span>
      {fmtNum(Math.round(displayed))}
      {suffix}
    </span>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon,
  color,
  delay = 0,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  icon: React.ReactNode;
  color: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className={cn("rounded-2xl p-5 border flex flex-col gap-3", color)}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground font-medium">
          {label}
        </span>
        <div className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center">
          {icon}
        </div>
      </div>
      <div className="text-2xl font-bold text-foreground tabular-nums">
        {value}
      </div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </motion.div>
  );
}

// ─── Quality ring ─────────────────────────────────────────────────────────────

function QualityRing({ score }: { score: number }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 80 ? "#10b981" : score >= 60 ? "#f59e0b" : "#ef4444";
  return (
    <svg
      width="72"
      height="72"
      viewBox="0 0 72 72"
      className="flex-none"
      role="img"
      aria-label={`Quality score: ${score}/100`}
    >
      <circle
        cx="36"
        cy="36"
        r={r}
        fill="none"
        stroke="#ffffff0f"
        strokeWidth="6"
      />
      <circle
        cx="36"
        cy="36"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 36 36)"
        style={{ transition: "stroke-dasharray 0.8s ease" }}
      />
      <text
        x="36"
        y="40"
        textAnchor="middle"
        fill={color}
        fontSize="13"
        fontWeight="700"
      >
        {score}
      </text>
    </svg>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col items-center justify-center py-28 px-6 text-center"
    >
      <div className="w-20 h-20 rounded-3xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-6">
        <Database className="w-9 h-9 text-indigo-400" />
      </div>
      <h2 className="text-2xl font-bold text-foreground mb-2">
        No data loaded yet
      </h2>
      <p className="text-muted-foreground max-w-sm mb-8 text-sm leading-relaxed">
        Upload a CSV, JSON, or Excel file to start exploring your data with SQL
        queries, AI insights, and interactive charts.
      </p>
      <div className="flex flex-wrap gap-3 justify-center">
        <Link href="/dashboard/upload">
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-semibold transition-colors"
          >
            <Upload className="w-4 h-4" /> Upload File
          </motion.button>
        </Link>
        <Link href="/dashboard/telecom-report">
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-2 px-5 py-2.5 bg-muted hover:bg-accent border border-border text-muted-foreground rounded-xl text-sm font-medium transition-colors"
          >
            <FileText className="w-4 h-4" /> Telecom Report
          </motion.button>
        </Link>
      </div>
    </motion.div>
  );
}

// ─── Column type breakdown chart ──────────────────────────────────────────────

function ColTypeChart({ cols }: { cols: { type: string }[] }) {
  const counts: Record<string, number> = {};
  for (const c of cols) counts[c.type] = (counts[c.type] ?? 0) + 1;
  const data = Object.entries(counts).map(([name, value]) => ({ name, value }));
  const COLORS = {
    number: "#89b4fa",
    string: "#a6e3a1",
    date: "#f38ba8",
    boolean: "#fab387",
    unknown: "#6c7086",
  };

  const option = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "item",
      backgroundColor: "#1e1e2e",
      borderColor: "#ffffff10",
      textStyle: { color: "#cdd6f4", fontSize: 11 },
    },
    series: [
      {
        type: "pie",
        radius: ["50%", "75%"],
        data: data.map((d) => ({
          ...d,
          itemStyle: {
            color: COLORS[d.name as keyof typeof COLORS] ?? "#6c7086",
          },
        })),
        label: { color: "#6c7086", fontSize: 10 },
        itemStyle: { borderColor: "#0f1117", borderWidth: 2 },
      },
    ],
  };
  return (
    <ReactECharts
      option={option}
      style={{ height: 160 }}
      opts={{ renderer: "canvas" }}
    />
  );
}

// ─── Dataset card ─────────────────────────────────────────────────────────────

function DatasetCard({
  ds,
  active,
  onActivate,
}: {
  ds: Dataset;
  active: boolean;
  onActivate: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className={cn(
        "rounded-xl border p-4 cursor-pointer transition-colors",
        active
          ? "border-indigo-500/40 bg-indigo-500/10"
          : "border-border bg-muted/40 hover:border-border",
      )}
      onClick={onActivate}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center flex-none",
            active ? "bg-indigo-500/20" : "bg-muted",
          )}
        >
          <Table2
            className={cn(
              "w-4 h-4",
              active ? "text-indigo-400" : "text-muted-foreground",
            )}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground truncate">
              {ds.name}
            </span>
            {active && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300">
                Active
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5 font-mono">
            {ds.tableName}
          </div>
          <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Hash className="w-3 h-3" />
              {fmtNum(ds.rowCount)} rows
            </span>
            <span>{ds.colCount} cols</span>
            <span>{fmtBytes(ds.sizeBytes)}</span>
          </div>
        </div>
        <QualityRing score={Math.round(ds.qualityScore)} />
      </div>
    </motion.div>
  );
}

// ─── Live query preview ────────────────────────────────────────────────────────

function LivePreview({ tableName }: { tableName: string }) {
  const { loadedTableNames } = useDataStore();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const isLive = loadedTableNames.includes(tableName);

  useEffect(() => {
    if (!isLive) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    runQuery(`SELECT * FROM "${tableName}" LIMIT 5`)
      .then(setRows)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [tableName, isLive]);

  if (!isLive)
    return (
      <div className="flex flex-col items-center gap-2 p-6 text-center text-muted-foreground">
        <AlertTriangle className="w-5 h-5 text-amber-400" />
        <p className="text-xs font-medium text-foreground">
          Table not in current session
        </p>
        <p className="text-[11px] text-muted-foreground">
          DuckDB is in-memory — re-upload the file to query it.
        </p>
        <Link
          href="/dashboard/upload"
          className="mt-1 flex items-center gap-1.5 text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Upload className="w-3 h-3" /> Re-upload
        </Link>
      </div>
    );

  if (loading)
    return (
      <div className="flex items-center gap-2 p-4 text-muted-foreground text-sm">
        <RefreshCw className="w-4 h-4 animate-spin" /> Loading preview…
      </div>
    );
  if (error) return <div className="p-4 text-red-400 text-xs">{error}</div>;
  if (rows.length === 0)
    return <div className="p-4 text-muted-foreground text-sm">No rows.</div>;

  const cols = Object.keys(rows[0]);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            {cols.map((c) => (
              <th
                key={c}
                className="px-3 py-2 text-left text-[10px] text-muted-foreground uppercase tracking-wide whitespace-nowrap"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={`${i}`}
              className="border-b border-border hover:bg-muted/40 transition-colors"
            >
              {cols.map((c) => (
                <td
                  key={c}
                  className="px-3 py-1.5 text-muted-foreground font-mono text-[11px] whitespace-nowrap max-w-40 truncate"
                >
                  {String(row[c] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { datasets, activeDatasetId, setActiveDataset, queryHistory } =
    useDataStore();

  const activeDs =
    datasets.find((d) => d.id === activeDatasetId) ?? datasets[0] ?? null;

  const totalRows = useMemo(
    () => datasets.reduce((a, d) => a + d.rowCount, 0),
    [datasets],
  );
  const totalBytes = useMemo(
    () => datasets.reduce((a, d) => a + d.sizeBytes, 0),
    [datasets],
  );
  const avgQuality = useMemo(
    () =>
      datasets.length > 0
        ? Math.round(
            datasets.reduce((a, d) => a + d.qualityScore, 0) / datasets.length,
          )
        : 0,
    [datasets],
  );

  const recentQueries = queryHistory.slice(0, 6);

  if (datasets.length === 0)
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <EmptyState />
      </div>
    );

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {datasets.length} dataset{datasets.length > 1 ? "s" : ""} loaded
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/upload">
            <button
              type="button"
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium transition-colors"
            >
              <Upload className="w-4 h-4" /> Upload
            </button>
          </Link>
          <Link href="/dashboard/telecom-report">
            <button
              type="button"
              className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-accent border border-border text-foreground rounded-xl text-sm font-medium transition-colors"
            >
              <FileText className="w-4 h-4" /> Telecom Report
            </button>
          </Link>
        </div>
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Rows"
          delay={0}
          value={<AnimatedNumber value={totalRows} />}
          sub="across all datasets"
          icon={<Hash className="w-4 h-4 text-indigo-400" />}
          color="border-indigo-500/20 bg-indigo-500/5"
        />
        <StatCard
          label="Datasets"
          delay={0.05}
          value={<AnimatedNumber value={datasets.length} />}
          sub={`${datasets.filter((d) => d.source === "upload").length} uploads`}
          icon={<Database className="w-4 h-4 text-blue-400" />}
          color="border-blue-500/20 bg-blue-500/5"
        />
        <StatCard
          label="Avg Quality"
          delay={0.1}
          value={
            <span>
              {avgQuality}
              <span className="text-base text-muted-foreground">/100</span>
            </span>
          }
          sub="data quality score"
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />}
          color="border-emerald-500/20 bg-emerald-500/5"
        />
        <StatCard
          label="Storage"
          delay={0.15}
          value={fmtBytes(totalBytes)}
          sub="in-memory DuckDB"
          icon={<Layers className="w-4 h-4 text-amber-400" />}
          color="border-amber-500/20 bg-amber-500/5"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Datasets list */}
        <div className="lg:col-span-1 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Table2 className="w-4 h-4 text-indigo-400" /> Datasets
            </h2>
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {datasets.map((ds) => (
              <DatasetCard
                key={ds.id}
                ds={ds}
                active={ds.id === (activeDs?.id ?? null)}
                onActivate={() => setActiveDataset(ds.id)}
              />
            ))}
          </div>
        </div>

        {/* Active dataset detail */}
        <div className="lg:col-span-2 space-y-4">
          {activeDs && (
            <>
              <div className="rounded-2xl border border-border bg-muted overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                  <div className="w-8 h-8 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                    <Table2 className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-foreground">
                      {activeDs.name}
                    </div>
                    <div className="text-[11px] text-muted-foreground font-mono">
                      {activeDs.tableName}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    {timeAgo(activeDs.createdAt)}
                  </div>
                </div>

                {/* Col type breakdown */}
                <div className="grid grid-cols-2 gap-0 divide-x divide-border">
                  <div className="p-4">
                    <div className="text-[11px] text-muted-foreground mb-2 font-semibold uppercase tracking-wide">
                      Column types
                    </div>
                    <ColTypeChart cols={activeDs.columns} />
                  </div>
                  <div className="p-4">
                    <div className="text-[11px] text-muted-foreground mb-3 font-semibold uppercase tracking-wide">
                      Top columns
                    </div>
                    <div className="space-y-2">
                      {activeDs.columns.slice(0, 6).map((c) => (
                        <div key={c.name} className="flex items-center gap-2">
                          <span
                            className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded font-mono",
                              c.type === "number"
                                ? "bg-blue-500/10 text-blue-400"
                                : c.type === "date"
                                  ? "bg-pink-500/10 text-pink-400"
                                  : c.type === "boolean"
                                    ? "bg-amber-500/10 text-amber-400"
                                    : "bg-muted text-muted-foreground",
                            )}
                          >
                            {c.type}
                          </span>
                          <span className="text-xs text-foreground truncate font-mono">
                            {c.name}
                          </span>
                          {c.nullCount > 0 && (
                            <span className="text-[10px] text-amber-500/70 ml-auto whitespace-nowrap">
                              {c.nullCount} null
                            </span>
                          )}
                        </div>
                      ))}
                      {activeDs.columns.length > 6 && (
                        <div className="text-[10px] text-muted-foreground pt-1">
                          +{activeDs.columns.length - 6} more columns
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Preview */}
              <div className="rounded-2xl border border-border bg-muted overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                    <Activity className="w-3.5 h-3.5 text-emerald-400" /> Live
                    Preview
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    LIMIT 5
                  </span>
                </div>
                <LivePreview tableName={activeDs.tableName} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Recent queries */}
      {recentQueries.length > 0 && (
        <div className="rounded-2xl border border-border bg-muted overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Clock className="w-4 h-4 text-violet-400" /> Recent Queries
            </div>
          </div>
          <div className="divide-y divide-border">
            {recentQueries.map((q) => (
              <div
                key={q.id}
                className="flex items-start gap-3 px-4 py-3 hover:bg-muted transition-colors"
              >
                <Zap className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-none" />
                <div className="flex-1 min-w-0">
                  {q.naturalLanguage && (
                    <div className="text-xs text-foreground mb-0.5">
                      {q.naturalLanguage}
                    </div>
                  )}
                  <div className="text-[11px] text-muted-foreground font-mono truncate">
                    {q.sql}
                  </div>
                </div>
                <div className="text-[10px] text-muted-foreground whitespace-nowrap flex items-center gap-2 flex-none">
                  <span>{q.rowsReturned.toLocaleString()} rows</span>
                  <span>{q.durationMs}ms</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            label: "AI Analysis",
            icon: Brain,
            href: "/dashboard/ai-analysis",
            color: "text-violet-400 bg-violet-500/10 border-violet-500/20",
          },
          {
            label: "CSV Parser",
            icon: FileText,
            href: "/dashboard/csv-parser",
            color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
          },
          {
            label: "Charts",
            icon: BarChart2,
            href: "/dashboard/charts",
            color: "text-blue-400 bg-blue-500/10 border-blue-500/20",
          },
          {
            label: "Telecom Report",
            icon: TrendingUp,
            href: "/dashboard/telecom-report",
            color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
          },
        ].map((a) => (
          <Link key={a.label} href={a.href}>
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={cn(
                "rounded-xl border p-4 flex items-center gap-3 cursor-pointer transition-colors",
                a.color,
              )}
            >
              <a.icon className="w-5 h-5" />
              <span className="text-sm font-medium text-foreground">
                {a.label}
              </span>
            </motion.div>
          </Link>
        ))}
      </div>
    </div>
  );
}
