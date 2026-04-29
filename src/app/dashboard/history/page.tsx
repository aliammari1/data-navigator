"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "motion/react";
import {
  History,
  Search,
  RefreshCw,
  Download,
  Filter,
  Eye,
  GitCommit,
  GitBranch,
  GitMerge,
  RotateCcw,
  Clock,
  User,
  Calendar,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Copy,
  Star,
  Tag,
  Plus,
  Minus,
  Diff,
  Database,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Activity,
  TrendingUp,
  ArrowLeft,
  ArrowRight,
  FileText,
  Layers,
  Hash,
  BarChart3,
  Zap,
  X,
  Info,
  Maximize2,
} from "lucide-react";
import { runQuery, loadJSONToDuckDB } from "@/lib/duckdb";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

// ─── Types ─────────────────────────────────────────────────────────────────

interface VersionEntry {
  id: string;
  version: string;
  timestamp: Date;
  author: string;
  email: string;
  message: string;
  type:
    | "create"
    | "update"
    | "delete"
    | "restore"
    | "merge"
    | "transform"
    | "schema";
  changes: {
    added: number;
    modified: number;
    deleted: number;
    schema?: number;
  };
  rowCount: number;
  colCount: number;
  fileSize: number; // bytes
  tags: string[];
  isCurrent: boolean;
  parentId?: string;
  branch: string;
  hash: string;
  stats?: {
    avgRevenue: number;
    totalRevenue: number;
    rowsWithNulls: number;
  };
}

interface DiffLine {
  type: "added" | "removed" | "context" | "header" | "hunk";
  oldLine?: number;
  newLine?: number;
  content: string;
}

interface ColumnDiff {
  name: string;
  changeType: "added" | "removed" | "modified" | "unchanged";
  oldValue?: string;
  newValue?: string;
}

// ─── Utilities ─────────────────────────────────────────────────────────────

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

function formatAge(d: Date): string {
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 86400 * 7) return `${Math.floor(sec / 86400)}d ago`;
  return d.toLocaleDateString();
}

function typeColor(type: VersionEntry["type"]): string {
  switch (type) {
    case "create":
      return "bg-green-500/20 text-green-300 border-green-500/30";
    case "update":
      return "bg-blue-500/20 text-blue-300 border-blue-500/30";
    case "delete":
      return "bg-red-500/20 text-red-300 border-red-500/30";
    case "restore":
      return "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";
    case "merge":
      return "bg-purple-500/20 text-purple-300 border-purple-500/30";
    case "transform":
      return "bg-indigo-500/20 text-indigo-300 border-indigo-500/30";
    case "schema":
      return "bg-orange-500/20 text-orange-300 border-orange-500/30";
    default:
      return "bg-muted text-foreground border-border";
  }
}

function typeIcon(type: VersionEntry["type"]) {
  switch (type) {
    case "create":
      return Plus;
    case "update":
      return Diff;
    case "delete":
      return Minus;
    case "restore":
      return RotateCcw;
    case "merge":
      return GitMerge;
    case "transform":
      return Zap;
    case "schema":
      return Layers;
    default:
      return GitCommit;
  }
}

// ─── Myers diff algorithm ──────────────────────────────────────────────────

function computeDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  const M = oldLines.length;
  const N = newLines.length;
  const MAX = M + N;
  const V: number[] = new Array(2 * MAX + 1).fill(0);
  const trace: number[][] = [];

  // Forward pass
  for (let d = 0; d <= MAX; d++) {
    trace.push([...V]);
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && V[k - 1 + MAX] < V[k + 1 + MAX])) {
        x = V[k + 1 + MAX];
      } else {
        x = V[k - 1 + MAX] + 1;
      }
      let y = x - k;
      while (x < M && y < N && oldLines[x] === newLines[y]) {
        x++;
        y++;
      }
      V[k + MAX] = x;
      if (x >= M && y >= N) {
        // Backtrack
        return backtrack(trace, oldLines, newLines, MAX);
      }
    }
  }
  return backtrack(trace, oldLines, newLines, MAX);
}

function backtrack(
  trace: number[][],
  oldLines: string[],
  newLines: string[],
  MAX: number,
): DiffLine[] {
  const edits: Array<{
    type: "=" | "+" | "-";
    old?: number;
    new?: number;
    content: string;
  }> = [];
  let x = oldLines.length;
  let y = newLines.length;

  for (let d = trace.length - 1; d >= 0; d--) {
    const V = trace[d];
    const k = x - y;
    let prevK: number;
    if (k === -d || (k !== d && V[k - 1 + MAX] < V[k + 1 + MAX])) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }
    const prevX = V[prevK + MAX];
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      x--;
      y--;
      edits.unshift({ type: "=", old: x, new: y, content: oldLines[x] });
    }
    if (d > 0) {
      if (x === prevX) {
        edits.unshift({ type: "+", new: prevY, content: newLines[prevY] });
      } else {
        edits.unshift({ type: "-", old: prevX, content: oldLines[prevX] });
      }
    }
    x = prevX;
    y = prevY;
  }

  // Convert to DiffLine with context (3 lines around changes)
  const result: DiffLine[] = [];
  let oldLine = 1;
  let newLine = 1;
  for (const e of edits) {
    if (e.type === "=") {
      result.push({ type: "context", oldLine, newLine, content: e.content });
      oldLine++;
      newLine++;
    } else if (e.type === "-") {
      result.push({ type: "removed", oldLine, content: e.content });
      oldLine++;
    } else {
      result.push({ type: "added", newLine, content: e.content });
      newLine++;
    }
  }
  return result;
}

function applyContextWindow(lines: DiffLine[], window = 3): DiffLine[] {
  const changes = new Set<number>();
  lines.forEach((l, i) => {
    if (l.type !== "context") changes.add(i);
  });
  const keep = new Set<number>();
  for (const ci of changes) {
    for (
      let k = Math.max(0, ci - window);
      k <= Math.min(lines.length - 1, ci + window);
      k++
    ) {
      keep.add(k);
    }
  }

  const result: DiffLine[] = [];
  let prevIncluded = true;
  for (let i = 0; i < lines.length; i++) {
    if (keep.has(i)) {
      if (!prevIncluded && i > 0) {
        result.push({
          type: "hunk",
          content: `@@ -${lines[i].oldLine ?? 0} @@`,
        });
      }
      result.push(lines[i]);
      prevIncluded = true;
    } else {
      prevIncluded = false;
    }
  }
  return result;
}

// ─── Demo data generator ───────────────────────────────────────────────────

function generateVersionHistory(): VersionEntry[] {
  const authors = [
    { name: "Alice Chen", email: "alice@corp.com" },
    { name: "Bob Kim", email: "bob@corp.com" },
    { name: "Carol Singh", email: "carol@corp.com" },
    { name: "Dave Lopez", email: "dave@corp.com" },
  ];
  const messages = [
    ["Initial data import from ERP", "create"],
    ["Add null value imputation for revenue column", "update"],
    ["Schema change: add profit_margin column", "schema"],
    [
      "Filter out test accounts (is_premium=false, status='inactive')",
      "transform",
    ],
    ["Merge with Q3 customer segment data", "merge"],
    ["Fix encoding issues in email column", "update"],
    ["Remove duplicate rows (dedup on order_id)", "transform"],
    ["Add country normalization lookup", "update"],
    ["Restore to v1.4 — Q4 data was corrupted", "restore"],
    ["Schema change: rename 'amt' → 'revenue'", "schema"],
    ["Update: refresh from latest ERP export", "update"],
    ["Transform: derive revenue_tier column", "transform"],
    ["Merge upstream fix for department mapping", "merge"],
    ["Add satisfaction_score from survey API", "schema"],
    ["Current version — production snapshot", "update"],
  ] as const;

  const now = Date.now();
  let rowCount = 5000;
  let colCount = 8;

  return messages
    .map((msg, i): VersionEntry => {
      const [message, type] = msg;
      const a = authors[i % authors.length];
      const daysAgo =
        (messages.length - i - 1) * 3 + Math.floor(Math.random() * 2);
      const ts = new Date(
        now - daysAgo * 86400000 - Math.floor(Math.random() * 3600000),
      );

      const added =
        type === "create" ? rowCount : Math.floor(Math.random() * 500);
      const modified = type === "create" ? 0 : Math.floor(Math.random() * 200);
      const deleted = Math.floor(Math.random() * 50);
      const schemaDelta =
        type === "schema" ? Math.floor(Math.random() * 3) + 1 : 0;

      if (type === "create") rowCount = 5000;
      else if (type !== "restore")
        rowCount = Math.max(100, rowCount + added - deleted);
      if (type === "schema") colCount = Math.min(20, colCount + schemaDelta);
      if (type === "restore") {
        rowCount = 4800;
        colCount = 10;
      }

      const isCurrent = i === messages.length - 1;
      const major = Math.floor(i / 5) + 1;
      const minor = i % 5;

      return {
        id: `v${i + 1}`,
        version: `${major}.${minor}`,
        timestamp: ts,
        author: a.name,
        email: a.email,
        message,
        type: type as VersionEntry["type"],
        changes: { added, modified, deleted, schema: schemaDelta },
        rowCount,
        colCount,
        fileSize: rowCount * colCount * 12 + Math.floor(Math.random() * 50000),
        tags: isCurrent
          ? ["production", "latest"]
          : i === 8
            ? ["checkpoint"]
            : [],
        isCurrent,
        parentId: i > 0 ? `v${i}` : undefined,
        branch: i >= 8 && i < 11 ? "hotfix/q4-fix" : "main",
        hash: Math.random().toString(36).substring(2, 10),
        stats: {
          avgRevenue: 250 + Math.random() * 150,
          totalRevenue: rowCount * (250 + Math.random() * 150),
          rowsWithNulls: Math.floor(rowCount * Math.random() * 0.05),
        },
      };
    })
    .reverse();
}

// ─── SQL snapshots for diff ────────────────────────────────────────────────

const SNAPSHOT_A = `-- Version 1.3: After dedup transform
SELECT
  id,
  first_name,
  last_name,
  email,
  department,
  country,
  status,
  revenue,
  units_sold
FROM clean_sales
WHERE status != 'test'
ORDER BY id
LIMIT 5;

-- Result snapshot (5 of 4891 rows):
-- id | first_name | last_name | email               | department | country | status | revenue | units_sold
-- 1  | Alice      | Johnson   | alice@example.com   | Sales      | US      | active | 452.30  | 12
-- 2  | Bob        | Chen      | bob@example.com     | Marketing  | CA      | active | 891.00  | 24
-- 3  | Carol      | Singh     | carol@company.org   | Engineering| UK      | active | 303.75  | 8
-- 4  | Dave       | Lopez     | dave@startup.io     | HR         | DE      | active | 127.50  | 3
-- 5  | Eve        | Park      | eve@enterprise.com  | Finance    | JP      | active | 650.00  | 18`;

const SNAPSHOT_B = `-- Version 1.4: After schema change (add profit_margin, revenue_tier)
SELECT
  id,
  first_name,
  last_name,
  email,
  department,
  country,
  status,
  revenue,
  units_sold,
  profit_margin,
  revenue_tier
FROM clean_sales
WHERE status != 'test'
ORDER BY id
LIMIT 5;

-- Result snapshot (5 of 4891 rows):
-- id | first_name | last_name | email               | department | country | status | revenue | units_sold | profit_margin | revenue_tier
-- 1  | Alice      | Johnson   | alice@example.com   | Sales      | US      | active | 452.30  | 12         | 0.28          | medium
-- 2  | Bob        | Chen      | bob@example.com     | Marketing  | CA      | active | 891.00  | 24         | 0.41          | high
-- 3  | Carol      | Singh     | carol@company.org   | Engineering| UK      | active | 303.75  | 8          | 0.19          | low
-- 4  | Dave       | Lopez     | dave@startup.io     | HR         | DE      | active | 127.50  | 3          | 0.12          | low
-- 5  | Eve        | Park      | eve@enterprise.com  | Finance    | JP      | active | 650.00  | 18         | 0.35          | high`;

// ─── Sub-components ────────────────────────────────────────────────────────

function VersionBadge({ type }: { type: VersionEntry["type"] }) {
  const Icon = typeIcon(type);
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium border ${typeColor(type)}`}
    >
      <Icon className="w-2.5 h-2.5" />
      {type}
    </span>
  );
}

function AuthorAvatar({
  name,
  size = "sm",
}: {
  name: string;
  size?: "sm" | "md";
}) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const colors = [
    "bg-indigo-600",
    "bg-purple-600",
    "bg-blue-600",
    "bg-emerald-600",
    "bg-rose-600",
  ];
  const idx = name.charCodeAt(0) % colors.length;
  const sz = size === "sm" ? "w-6 h-6 text-xs" : "w-8 h-8 text-sm";
  return (
    <span
      className={`${sz} ${colors[idx]} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0`}
    >
      {initials}
    </span>
  );
}

function DiffViewer({ lines }: { lines: DiffLine[] }) {
  return (
    <div className="font-mono text-xs overflow-x-auto">
      {lines.map((line, i) => {
        const lineKey = `${line.type}-${line.oldLine ?? ""}-${line.newLine ?? ""}-${i}`;
        if (line.type === "hunk") {
          return (
            <div
              key={lineKey}
              className="bg-blue-900/30 text-blue-300 px-3 py-1 select-none"
            >
              {line.content}
            </div>
          );
        }
        const cls =
          line.type === "added"
            ? "bg-green-500/10 text-green-300"
            : line.type === "removed"
              ? "bg-red-500/10 text-red-300"
              : "text-muted-foreground";
        const prefix =
          line.type === "added" ? "+" : line.type === "removed" ? "−" : " ";
        const lineNumOld = line.type !== "added" ? (line.oldLine ?? "") : "";
        const lineNumNew = line.type !== "removed" ? (line.newLine ?? "") : "";
        return (
          <div key={lineKey} className={`flex ${cls} leading-5`}>
            <span className="w-8 text-right pr-2 text-muted-foreground select-none border-r border-border flex-shrink-0">
              {lineNumOld}
            </span>
            <span className="w-8 text-right pr-2 text-muted-foreground select-none border-r border-border flex-shrink-0">
              {lineNumNew}
            </span>
            <span className="px-1 select-none text-muted-foreground flex-shrink-0 w-4">
              {prefix}
            </span>
            <span className="flex-1 px-1 whitespace-pre">{line.content}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function HistoryPage() {
  const [versions] = useState<VersionEntry[]>(() => generateVersionHistory());
  const [selectedVersion, setSelectedVersion] = useState<VersionEntry | null>(
    null,
  );
  const [compareVersion, setCompareVersion] = useState<VersionEntry | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<
    "timeline" | "diff" | "stats" | "restore"
  >("timeline");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [authorFilter, setAuthorFilter] = useState<string>("all");
  const [showDiffFullscreen, setShowDiffFullscreen] = useState(false);
  const [diffLines, setDiffLines] = useState<DiffLine[]>([]);
  const [colDiffs, setColDiffs] = useState<ColumnDiff[]>([]);
  const [restored, setRestored] = useState<string | null>(null);
  const [duckdbLoaded, setDuckdbLoaded] = useState(false);
  const initRef = useRef(false);

  // ─── Load DuckDB ──────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (initRef.current) return;
      initRef.current = true;
      try {
        if (!cancelled) setDuckdbLoaded(true);
      } catch (e) {
        console.error("DuckDB init:", e);
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Compute diff ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!selectedVersion || !compareVersion) return;
    const aLines = SNAPSHOT_A.split("\n");
    const bLines = SNAPSHOT_B.split("\n");
    const raw = computeDiff(aLines, bLines);
    const windowed = applyContextWindow(raw, 3);
    setDiffLines(windowed);

    // Column diffs
    const baseColCount = compareVersion.colCount;
    const newColCount = selectedVersion.colCount;
    const colsDelta = newColCount - baseColCount;
    const diffs: ColumnDiff[] = [
      { name: "id", changeType: "unchanged" },
      { name: "first_name", changeType: "unchanged" },
      { name: "last_name", changeType: "unchanged" },
      { name: "email", changeType: "unchanged" },
      { name: "department", changeType: "unchanged" },
      { name: "country", changeType: "unchanged" },
      { name: "status", changeType: "unchanged" },
      { name: "revenue", changeType: "unchanged" },
      { name: "units_sold", changeType: "unchanged" },
    ];
    if (colsDelta > 0) {
      diffs.push({
        name: "profit_margin",
        changeType: "added",
        newValue: "DOUBLE",
      });
      if (colsDelta > 1)
        diffs.push({
          name: "revenue_tier",
          changeType: "added",
          newValue: "VARCHAR",
        });
    } else if (colsDelta < 0) {
      diffs.push({
        name: "revenue_tier",
        changeType: "removed",
        oldValue: "VARCHAR",
      });
    }
    setColDiffs(diffs);
  }, [selectedVersion, compareVersion]);

  // ─── DuckDB stats query ───────────────────────────────────────────────

  const [dbStats, setDbStats] = useState<{
    avgRevenue: number;
    totalRevenue: number;
    rowCount: number;
  } | null>(null);

  useEffect(() => {
    if (!duckdbLoaded || !selectedVersion) return;
    runQuery(`
      SELECT
        COUNT(*) as row_count,
        AVG(revenue) as avg_revenue,
        SUM(revenue) as total_revenue
      FROM history_data
    `)
      .then((rows) => {
        const r = rows[0] as Record<string, number>;
        setDbStats({
          avgRevenue: Number(r.avg_revenue),
          totalRevenue: Number(r.total_revenue),
          rowCount: Number(r.row_count),
        });
      })
      .catch(console.error);
  }, [duckdbLoaded, selectedVersion]);

  // ─── Charts ───────────────────────────────────────────────────────────

  const rowCountChart = useMemo(() => {
    const revVersions = [...versions].reverse();
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: "#1e293b",
        borderColor: "#334155",
        textStyle: { color: "#f1f5f9" },
      },
      grid: { top: 20, bottom: 40, left: 60, right: 20 },
      xAxis: {
        type: "category",
        data: revVersions.map((v) => `v${v.version}`),
        axisLabel: { color: "#94a3b8", rotate: 30, fontSize: 10 },
        axisLine: { lineStyle: { color: "#334155" } },
      },
      yAxis: {
        type: "value",
        axisLabel: {
          color: "#94a3b8",
          formatter: (v: number) => v.toLocaleString(),
        },
        splitLine: { lineStyle: { color: "#1e293b" } },
      },
      series: [
        {
          type: "line",
          data: revVersions.map((v) => v.rowCount),
          smooth: true,
          lineStyle: { color: "#6366f1", width: 2 },
          itemStyle: { color: "#6366f1" },
          areaStyle: { color: "rgba(99,102,241,0.1)" },
          symbol: "circle",
          symbolSize: (_v: number, params: { dataIndex: number }) => {
            const ver = revVersions[params.dataIndex];
            return ver.isCurrent ? 8 : 4;
          },
        },
      ],
    };
  }, [versions]);

  const changesChart = useMemo(() => {
    const revVersions = [...versions].reverse().slice(-10);
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: "#1e293b",
        borderColor: "#334155",
        textStyle: { color: "#f1f5f9" },
      },
      legend: {
        data: ["Added", "Modified", "Deleted"],
        textStyle: { color: "#94a3b8" },
        top: 0,
      },
      grid: { top: 30, bottom: 40, left: 50, right: 20 },
      xAxis: {
        type: "category",
        data: revVersions.map((v) => `v${v.version}`),
        axisLabel: { color: "#94a3b8", rotate: 30, fontSize: 10 },
        axisLine: { lineStyle: { color: "#334155" } },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: "#94a3b8" },
        splitLine: { lineStyle: { color: "#1e293b" } },
      },
      series: [
        {
          name: "Added",
          type: "bar",
          data: revVersions.map((v) => v.changes.added),
          itemStyle: { color: "#22c55e" },
          stack: "s",
          barMaxWidth: 20,
        },
        {
          name: "Modified",
          type: "bar",
          data: revVersions.map((v) => v.changes.modified),
          itemStyle: { color: "#6366f1" },
          stack: "s",
          barMaxWidth: 20,
        },
        {
          name: "Deleted",
          type: "bar",
          data: revVersions.map((v) => -v.changes.deleted),
          itemStyle: { color: "#ef4444" },
          barMaxWidth: 20,
        },
      ],
    };
  }, [versions]);

  const activityHeatmap = useMemo(() => {
    const data: [string, number][] = versions.map((v) => {
      const d = v.timestamp;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return [key, 1];
    });
    return {
      backgroundColor: "transparent",
      tooltip: {
        formatter: (p: { data: [string, number] }) =>
          `${p.data[0]}: ${p.data[1]} change(s)`,
      },
      visualMap: {
        min: 0,
        max: 3,
        calculable: false,
        show: false,
        inRange: { color: ["#1e293b", "#6366f1"] },
      },
      calendar: {
        range: (() => {
          const end = new Date();
          const start = new Date(end);
          start.setMonth(start.getMonth() - 2);
          return [
            start.toISOString().slice(0, 10),
            end.toISOString().slice(0, 10),
          ];
        })(),
        itemStyle: { borderColor: "#0f172a", borderWidth: 1 },
        dayLabel: { color: "#64748b" },
        monthLabel: { color: "#64748b" },
        yearLabel: { color: "#64748b" },
        splitLine: { show: false },
      },
      series: [
        {
          type: "heatmap",
          coordinateSystem: "calendar",
          data,
        },
      ],
    };
  }, [versions]);

  // ─── Filtered versions ────────────────────────────────────────────────

  const filteredVersions = useMemo(() => {
    return versions.filter((v) => {
      const matchSearch =
        !searchQuery ||
        v.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.author.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.version.includes(searchQuery) ||
        v.hash.includes(searchQuery);
      const matchType = typeFilter === "all" || v.type === typeFilter;
      const matchBranch = branchFilter === "all" || v.branch === branchFilter;
      const matchAuthor = authorFilter === "all" || v.author === authorFilter;
      return matchSearch && matchType && matchBranch && matchAuthor;
    });
  }, [versions, searchQuery, typeFilter, branchFilter, authorFilter]);

  const authors = useMemo(
    () => [...new Set(versions.map((v) => v.author))],
    [versions],
  );
  const branches = useMemo(
    () => [...new Set(versions.map((v) => v.branch))],
    [versions],
  );
  const currentVersion = versions.find((v) => v.isCurrent) ?? versions[0];

  // ─── Restore ─────────────────────────────────────────────────────────

  const handleRestore = useCallback((v: VersionEntry) => {
    setRestored(v.id);
    setTimeout(() => setRestored(null), 3000);
  }, []);

  // ─── Version select ───────────────────────────────────────────────────

  const handleSelectVersion = useCallback(
    (v: VersionEntry) => {
      setSelectedVersion(v);
      if (!compareVersion) {
        const idx = versions.indexOf(v);
        if (idx < versions.length - 1) setCompareVersion(versions[idx + 1]);
      }
    },
    [compareVersion, versions],
  );

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="border-b border-border p-4 md:p-5 flex-shrink-0">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-indigo-600 to-blue-600 rounded-xl">
              <History className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                Version History
              </h1>
              <p className="text-sm text-muted-foreground">
                {versions.length} versions · Current:{" "}
                <span className="text-foreground font-mono">
                  v{currentVersion?.version}
                </span>
                {duckdbLoaded && (
                  <span className="ml-2 text-green-400 text-xs">
                    ● DuckDB ready
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const csv = [
                  "version,date,author,type,message,rows,cols,hash",
                  ...versions.map((v) =>
                    [
                      v.version,
                      v.timestamp.toISOString(),
                      v.author,
                      v.type,
                      `"${v.message}"`,
                      v.rowCount,
                      v.colCount,
                      v.hash,
                    ].join(","),
                  ),
                ].join("\n");
                const blob = new Blob([csv], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "version_history.csv";
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="flex items-center gap-2 px-3 py-2 bg-accent hover:bg-accent/80 rounded-lg text-sm text-foreground transition-colors"
            >
              <Download className="w-4 h-4" /> Export
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-3 bg-card rounded-xl p-1 border border-border w-fit flex-wrap">
          {(["timeline", "diff", "stats", "restore"] as const).map((tab) => {
            const icons = {
              timeline: GitBranch,
              diff: Diff,
              stats: BarChart3,
              restore: RotateCcw,
            };
            const Icon = icons[tab];
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tab
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Restore toast */}
      <AnimatePresence>
        {restored && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 right-4 z-50 bg-green-600 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            Dataset restored to version{" "}
            {versions.find((v) => v.id === restored)?.version}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        <AnimatePresence mode="wait">
          {/* ── Timeline Tab ──────────────────────────────────────── */}
          {activeTab === "timeline" && (
            <motion.div
              key="timeline"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex overflow-hidden"
            >
              {/* Left: filters + list */}
              <div className="w-80 xl:w-96 border-r border-border flex flex-col overflow-hidden">
                <div className="p-3 border-b border-border space-y-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search versions..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-card border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={typeFilter}
                      onChange={(e) => setTypeFilter(e.target.value)}
                      className="flex-1 px-2 py-1.5 bg-card border border-border rounded-lg text-xs text-foreground focus:outline-none"
                    >
                      <option value="all">All types</option>
                      {[
                        "create",
                        "update",
                        "delete",
                        "restore",
                        "merge",
                        "transform",
                        "schema",
                      ].map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <select
                      value={authorFilter}
                      onChange={(e) => setAuthorFilter(e.target.value)}
                      className="flex-1 px-2 py-1.5 bg-card border border-border rounded-lg text-xs text-foreground focus:outline-none"
                    >
                      <option value="all">All authors</option>
                      {authors.map((a) => (
                        <option key={a} value={a}>
                          {a.split(" ")[0]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {filteredVersions.length} of {versions.length} versions
                    </span>
                    <div className="flex gap-1">
                      {branches.map((b) => (
                        <button
                          key={b}
                          type="button"
                          onClick={() =>
                            setBranchFilter(branchFilter === b ? "all" : b)
                          }
                          className={`px-2 py-0.5 rounded text-xs transition-colors ${
                            branchFilter === b
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {b === "main" ? "main" : "hotfix"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Version list */}
                <div className="flex-1 overflow-y-auto p-2">
                  <div className="relative">
                    {/* Timeline line */}
                    <div className="absolute left-5 top-3 bottom-3 w-px bg-border" />

                    <div className="space-y-1">
                      {filteredVersions.map((v, idx) => {
                        const Icon = typeIcon(v.type);
                        const isSelected = selectedVersion?.id === v.id;
                        const isCompare = compareVersion?.id === v.id;

                        return (
                          <motion.div
                            key={v.id}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.02 }}
                            className={`relative pl-10 pr-2 py-2 rounded-xl cursor-pointer transition-all ${
                              isSelected
                                ? "bg-indigo-600/15 border border-indigo-500/30"
                                : isCompare
                                  ? "bg-purple-600/10 border border-purple-500/20"
                                  : "hover:bg-accent border border-transparent"
                            }`}
                            onClick={() => handleSelectVersion(v)}
                          >
                            {/* Timeline dot */}
                            <div
                              className={`absolute left-3 top-3.5 w-4 h-4 rounded-full border-2 flex items-center justify-center z-10 ${
                                v.isCurrent
                                  ? "bg-indigo-500 border-indigo-300"
                                  : v.type === "delete"
                                    ? "bg-red-500 border-red-300"
                                    : "bg-muted border-border"
                              }`}
                            >
                              <Icon className="w-2 h-2 text-white" />
                            </div>

                            <div className="flex items-start justify-between gap-1">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-xs font-mono text-muted-foreground">
                                    v{v.version}
                                  </span>
                                  {v.isCurrent && (
                                    <span className="text-xs bg-indigo-500/20 text-indigo-300 px-1 rounded">
                                      current
                                    </span>
                                  )}
                                  {v.tags
                                    .filter((t) => t !== "latest")
                                    .map((tag) => (
                                      <span
                                        key={tag}
                                        className="text-xs bg-yellow-500/20 text-yellow-300 px-1 rounded flex items-center gap-0.5"
                                      >
                                        <Tag className="w-2.5 h-2.5" />
                                        {tag}
                                      </span>
                                    ))}
                                  {v.branch !== "main" && (
                                    <span className="text-xs bg-orange-500/20 text-orange-300 px-1 rounded">
                                      {v.branch}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-foreground mt-0.5 line-clamp-1">
                                  {v.message}
                                </p>
                                <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                                  <span>{v.author.split(" ")[0]}</span>
                                  <span>{formatAge(v.timestamp)}</span>
                                  <span className="font-mono">{v.hash}</span>
                                </div>
                              </div>
                              <VersionBadge type={v.type} />
                            </div>

                            {/* Change stats */}
                            <div className="flex gap-2 mt-1 text-xs">
                              {v.changes.added > 0 && (
                                <span className="text-green-400">
                                  +{v.changes.added}
                                </span>
                              )}
                              {v.changes.modified > 0 && (
                                <span className="text-blue-400">
                                  ~{v.changes.modified}
                                </span>
                              )}
                              {v.changes.deleted > 0 && (
                                <span className="text-red-400">
                                  -{v.changes.deleted}
                                </span>
                              )}
                              {(v.changes.schema ?? 0) > 0 && (
                                <span className="text-orange-400">
                                  Δ{v.changes.schema} col
                                </span>
                              )}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: detail panel */}
              <div className="flex-1 overflow-y-auto p-4 md:p-6">
                {!selectedVersion ? (
                  <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                    <GitCommit className="w-12 h-12 mb-3 opacity-20" />
                    <p className="text-lg">Select a version to inspect</p>
                  </div>
                ) : (
                  <motion.div
                    key={selectedVersion.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4 max-w-3xl"
                  >
                    {/* Version header */}
                    <div className="bg-card border border-border rounded-xl p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <AuthorAvatar
                            name={selectedVersion.author}
                            size="md"
                          />
                          <div>
                            <h2 className="text-lg font-bold text-foreground">
                              {selectedVersion.message}
                            </h2>
                            <div className="flex items-center gap-2 mt-1 flex-wrap text-sm text-muted-foreground">
                              <span className="font-bold text-foreground">
                                {selectedVersion.author}
                              </span>
                              <span>committed</span>
                              <span className="font-mono text-indigo-300">
                                v{selectedVersion.version}
                              </span>
                              <span>·</span>
                              <span>
                                {selectedVersion.timestamp.toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <VersionBadge type={selectedVersion.type} />
                          {selectedVersion.isCurrent && (
                            <span className="text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full">
                              CURRENT
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                        {[
                          { l: "Hash", v: selectedVersion.hash, mono: true },
                          {
                            l: "Branch",
                            v: selectedVersion.branch,
                            mono: true,
                          },
                          {
                            l: "Row count",
                            v: selectedVersion.rowCount.toLocaleString(),
                          },
                          { l: "Columns", v: String(selectedVersion.colCount) },
                          {
                            l: "File size",
                            v: formatBytes(selectedVersion.fileSize),
                          },
                          {
                            l: "Processing",
                            v:
                              selectedVersion.type === "transform"
                                ? "0.8s"
                                : "—",
                          },
                        ].map((item) => (
                          <div key={item.l} className="bg-muted rounded-lg p-2">
                            <div className="text-muted-foreground">
                              {item.l}
                            </div>
                            <div
                              className={`text-foreground font-semibold mt-0.5 ${item.mono ? "font-mono" : ""}`}
                            >
                              {item.v}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="mt-3 flex gap-2 flex-wrap">
                        <div className="flex gap-3 text-sm">
                          <span className="text-green-400 font-mono">
                            +{selectedVersion.changes.added}
                          </span>
                          <span className="text-blue-400 font-mono">
                            ~{selectedVersion.changes.modified}
                          </span>
                          <span className="text-red-400 font-mono">
                            -{selectedVersion.changes.deleted}
                          </span>
                          {(selectedVersion.changes.schema ?? 0) > 0 && (
                            <span className="text-orange-400 font-mono">
                              Δ{selectedVersion.changes.schema} schema
                            </span>
                          )}
                        </div>
                        {selectedVersion.tags.map((tag) => (
                          <span
                            key={tag}
                            className="text-xs bg-yellow-500/15 text-yellow-300 border border-yellow-500/20 px-2 py-0.5 rounded-full flex items-center gap-1"
                          >
                            <Tag className="w-2.5 h-2.5" /> {tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Compare picker */}
                    <div className="bg-card border border-border rounded-xl p-4">
                      <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                        <Diff className="w-4 h-4 text-purple-400" />
                        Compare with another version
                      </h3>
                      <div className="flex items-center gap-3">
                        <div className="bg-indigo-500/15 border border-indigo-500/30 rounded-lg px-3 py-2 text-sm text-foreground flex-1">
                          <span className="text-muted-foreground text-xs">
                            Base:{" "}
                          </span>
                          <span className="font-mono">
                            v{selectedVersion.version}
                          </span>{" "}
                          · {selectedVersion.message.slice(0, 40)}
                        </div>
                        <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <select
                          value={compareVersion?.id ?? ""}
                          onChange={(e) => {
                            const v = versions.find(
                              (x) => x.id === e.target.value,
                            );
                            if (v) setCompareVersion(v);
                          }}
                          className="flex-1 px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none"
                        >
                          <option value="">Select version...</option>
                          {versions
                            .filter((v) => v.id !== selectedVersion.id)
                            .map((v) => (
                              <option key={v.id} value={v.id}>
                                v{v.version} — {v.message.slice(0, 40)}
                              </option>
                            ))}
                        </select>
                        <button
                          type="button"
                          disabled={!compareVersion}
                          onClick={() => setActiveTab("diff")}
                          className="px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 rounded-lg text-sm text-primary-foreground transition-colors"
                        >
                          View Diff
                        </button>
                      </div>
                    </div>

                    {/* DuckDB live stats */}
                    {dbStats && (
                      <div className="bg-card border border-border rounded-xl p-4">
                        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                          <Database className="w-4 h-4 text-green-400" />
                          Live DuckDB Stats (current data)
                        </h3>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="bg-muted rounded-lg p-2.5">
                            <div className="text-xs text-muted-foreground">
                              Row Count
                            </div>
                            <div className="text-sm font-bold text-foreground mt-0.5">
                              {dbStats.rowCount.toLocaleString()}
                            </div>
                          </div>
                          <div className="bg-muted rounded-lg p-2.5">
                            <div className="text-xs text-muted-foreground">
                              Avg Revenue
                            </div>
                            <div className="text-sm font-bold text-foreground mt-0.5">
                              ${dbStats.avgRevenue.toFixed(2)}
                            </div>
                          </div>
                          <div className="bg-muted rounded-lg p-2.5">
                            <div className="text-xs text-muted-foreground">
                              Total Revenue
                            </div>
                            <div className="text-sm font-bold text-foreground mt-0.5">
                              ${(dbStats.totalRevenue / 1000).toFixed(0)}K
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {/* ── Diff Tab ──────────────────────────────────────────── */}
          {activeTab === "diff" && (
            <motion.div
              key="diff"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 overflow-hidden flex flex-col p-4 gap-4"
            >
              {/* Diff header */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <select
                    value={selectedVersion?.id ?? ""}
                    onChange={(e) => {
                      const v = versions.find((x) => x.id === e.target.value);
                      if (v) setSelectedVersion(v);
                    }}
                    className="px-3 py-1.5 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none"
                  >
                    <option value="">Select base...</option>
                    {versions.map((v) => (
                      <option key={v.id} value={v.id}>
                        v{v.version} ({v.type})
                      </option>
                    ))}
                  </select>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  <select
                    value={compareVersion?.id ?? ""}
                    onChange={(e) => {
                      const v = versions.find((x) => x.id === e.target.value);
                      if (v) setCompareVersion(v);
                    }}
                    className="px-3 py-1.5 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none"
                  >
                    <option value="">Select compare...</option>
                    {versions.map((v) => (
                      <option key={v.id} value={v.id}>
                        v{v.version} ({v.type})
                      </option>
                    ))}
                  </select>
                </div>
                {selectedVersion && compareVersion && (
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span className="text-green-400">
                      +{selectedVersion.changes.added} added
                    </span>
                    <span className="text-blue-400">
                      ~{selectedVersion.changes.modified} modified
                    </span>
                    <span className="text-red-400">
                      -{selectedVersion.changes.deleted} deleted
                    </span>
                  </div>
                )}
              </div>

              {/* Column diff */}
              {colDiffs.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-4 flex-shrink-0">
                  <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-orange-400" />
                    Schema Changes (
                    {
                      colDiffs.filter((c) => c.changeType !== "unchanged")
                        .length
                    }{" "}
                    column(s))
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {colDiffs.map((col) => (
                      <span
                        key={col.name}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono ${
                          col.changeType === "added"
                            ? "bg-green-500/15 text-green-300 border border-green-500/25"
                            : col.changeType === "removed"
                              ? "bg-red-500/15 text-red-300 border border-red-500/25 line-through"
                              : col.changeType === "modified"
                                ? "bg-yellow-500/15 text-yellow-300 border border-yellow-500/25"
                                : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {col.changeType === "added" && (
                          <Plus className="w-2.5 h-2.5" />
                        )}
                        {col.changeType === "removed" && (
                          <Minus className="w-2.5 h-2.5" />
                        )}
                        {col.name}
                        {col.newValue && (
                          <span className="text-muted-foreground ml-0.5">
                            {col.newValue}
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* SQL diff */}
              <div className="flex-1 bg-card border border-border rounded-xl overflow-hidden flex flex-col">
                <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card">
                  <span className="text-xs text-muted-foreground flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5" />
                    SQL snapshot diff — v{selectedVersion?.version} → v
                    {compareVersion?.version}
                  </span>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-green-400">
                      {diffLines.filter((l) => l.type === "added").length}{" "}
                      additions
                    </span>
                    <span className="text-red-400">
                      {diffLines.filter((l) => l.type === "removed").length}{" "}
                      deletions
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowDiffFullscreen(true)}
                      className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-auto p-2">
                  {diffLines.length > 0 ? (
                    <DiffViewer lines={diffLines} />
                  ) : (
                    <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                      Select two versions to compute diff
                    </div>
                  )}
                </div>
              </div>

              {/* Fullscreen diff modal */}
              <AnimatePresence>
                {showDiffFullscreen && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 bg-background/95 backdrop-blur flex flex-col"
                  >
                    <div className="flex items-center justify-between p-4 border-b border-border">
                      <span className="text-foreground font-semibold flex items-center gap-2">
                        <Diff className="w-5 h-5" />
                        Full Diff: v{selectedVersion?.version} → v
                        {compareVersion?.version}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowDiffFullscreen(false)}
                        className="p-2 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="flex-1 overflow-auto p-4">
                      <DiffViewer lines={diffLines} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ── Stats Tab ─────────────────────────────────────────── */}
          {activeTab === "stats" && (
            <motion.div
              key="stats"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 overflow-y-auto p-4 space-y-4"
            >
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  {
                    label: "Total Versions",
                    value: versions.length,
                    icon: GitCommit,
                    color: "bg-indigo-600",
                  },
                  {
                    label: "Contributors",
                    value: authors.length,
                    icon: User,
                    color: "bg-purple-600",
                  },
                  {
                    label: "Branches",
                    value: branches.length,
                    icon: GitBranch,
                    color: "bg-blue-600",
                  },
                  {
                    label: "Transforms",
                    value: versions.filter((v) => v.type === "transform")
                      .length,
                    icon: Zap,
                    color: "bg-yellow-600",
                  },
                ].map((s) => (
                  <motion.div
                    key={s.label}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-card border border-border rounded-xl p-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground">
                        {s.label}
                      </span>
                      <div className={`p-1.5 rounded-lg ${s.color}`}>
                        <s.icon className="w-3.5 h-3.5 text-white" />
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-foreground">
                      {s.value}
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-card border border-border rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-indigo-400" />
                    Row Count Over Time
                  </h3>
                  <ReactECharts
                    option={rowCountChart}
                    style={{ height: 200 }}
                  />
                </div>

                <div className="bg-card border border-border rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-green-400" />
                    Changes per Version
                  </h3>
                  <ReactECharts option={changesChart} style={{ height: 200 }} />
                </div>
              </div>

              <div className="bg-card border border-border rounded-xl p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-orange-400" />
                  Activity Calendar
                </h3>
                <ReactECharts
                  option={activityHeatmap}
                  style={{ height: 120 }}
                />
              </div>

              {/* Author breakdown */}
              <div className="bg-card border border-border rounded-xl p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <User className="w-4 h-4 text-purple-400" />
                  Contributions by Author
                </h3>
                <div className="space-y-2">
                  {authors.map((author) => {
                    const cnt = versions.filter(
                      (v) => v.author === author,
                    ).length;
                    const pct = cnt / versions.length;
                    return (
                      <div key={author} className="flex items-center gap-3">
                        <AuthorAvatar name={author} size="sm" />
                        <span className="text-sm text-foreground w-28 truncate">
                          {author}
                        </span>
                        <div className="flex-1 h-2 bg-accent rounded-full overflow-hidden">
                          <motion.div
                            className="h-full rounded-full bg-indigo-500"
                            initial={{ width: 0 }}
                            animate={{ width: `${pct * 100}%` }}
                            transition={{ duration: 0.7, ease: "easeOut" }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-16 text-right">
                          {cnt} commits ({(pct * 100).toFixed(0)}%)
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Restore Tab ───────────────────────────────────────── */}
          {activeTab === "restore" && (
            <motion.div
              key="restore"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 overflow-y-auto p-4"
            >
              <div className="max-w-3xl mx-auto space-y-4">
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-yellow-300">
                      Restore Point — Read Only Preview
                    </p>
                    <p className="text-xs text-yellow-400/70 mt-0.5">
                      Restoring replaces the current dataset with the selected
                      version snapshot. In a production system this would
                      trigger a re-run of all downstream transforms.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {versions
                    .filter(
                      (v) =>
                        v.tags.length > 0 || v.type === "create" || v.isCurrent,
                    )
                    .map((v, idx) => {
                      const isRestored = restored === v.id;
                      return (
                        <motion.div
                          key={v.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.06 }}
                          className={`bg-card border rounded-xl p-4 ${
                            v.isCurrent
                              ? "border-indigo-500/30"
                              : v.type === "create"
                                ? "border-green-500/20"
                                : "border-border"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-bold text-foreground font-mono">
                                  v{v.version}
                                </span>
                                <VersionBadge type={v.type} />
                                {v.isCurrent && (
                                  <span className="text-xs bg-indigo-500/20 text-indigo-300 px-1.5 rounded-full">
                                    CURRENT
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-foreground mt-1">
                                {v.message}
                              </p>
                              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                <span>{v.author}</span>
                                <span>{formatAge(v.timestamp)}</span>
                              </div>
                            </div>
                            <div className="text-right text-xs text-muted-foreground">
                              <div>{v.rowCount.toLocaleString()} rows</div>
                              <div>{v.colCount} cols</div>
                            </div>
                          </div>

                          {v.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {v.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="text-xs bg-yellow-500/15 text-yellow-300 px-1.5 py-0.5 rounded flex items-center gap-0.5"
                                >
                                  <Star className="w-2.5 h-2.5" /> {tag}
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="mt-3 flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedVersion(v);
                                setActiveTab("timeline");
                              }}
                              className="flex-1 py-1.5 text-xs bg-muted hover:bg-accent rounded-lg text-foreground transition-colors"
                            >
                              <Eye className="w-3 h-3 inline mr-1" /> Inspect
                            </button>
                            {!v.isCurrent && (
                              <button
                                type="button"
                                onClick={() => handleRestore(v)}
                                className={`flex-1 py-1.5 text-xs rounded-lg transition-all ${
                                  isRestored
                                    ? "bg-green-600 text-white"
                                    : "bg-indigo-600/30 hover:bg-indigo-600 text-indigo-300 hover:text-foreground"
                                }`}
                              >
                                {isRestored ? (
                                  <>
                                    <CheckCircle2 className="w-3 h-3 inline mr-1" />{" "}
                                    Restored!
                                  </>
                                ) : (
                                  <>
                                    <RotateCcw className="w-3 h-3 inline mr-1" />{" "}
                                    Restore
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
