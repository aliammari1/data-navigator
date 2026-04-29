"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import dynamic from "next/dynamic";
import {
  BarChart3,
  Database,
  Download,
  Eye,
  Filter,
  FlaskConical,
  GripVertical,
  Hash,
  Layers,
  Loader2,
  MessageSquare,
  Palette,
  Play,
  Plus,
  RefreshCw,
  Sigma,
  Sparkles,
  Table2,
  Trash2,
  TrendingUp,
  Type,
  X,
  Wand2,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  PieChart,
  LineChart,
  ScatterChart,
  AreaChart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { runQuery, listTables, getTableInfo } from "@/lib/duckdb";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────

type ColType = "number" | "string" | "date" | "boolean" | "unknown";

interface ColumnInfo {
  name: string;
  type: ColType;
  dbType: string;
}

interface Encoding {
  id: string;
  channel: "x" | "y" | "color" | "size" | "label" | "detail";
  field: string;
  aggregate?: "none" | "count" | "sum" | "avg" | "min" | "max" | "distinct";
  sort?: "asc" | "desc" | "none";
}

interface ChartSpec {
  type: "bar" | "line" | "scatter" | "pie" | "area" | "heatmap" | "histogram";
  encodings: Encoding[];
  filters: FilterDef[];
  limit: number;
  title: string;
}

interface FilterDef {
  id: string;
  field: string;
  op:
    | "="
    | "!="
    | ">"
    | "<"
    | ">="
    | "<="
    | "LIKE"
    | "IN"
    | "NOT NULL"
    | "IS NULL";
  value: string;
}

interface QueryResult {
  sql: string;
  data: Record<string, unknown>[];
  duration: number;
  rowCount: number;
}

const CHART_TYPES = [
  { type: "bar" as const, icon: BarChart3, label: "Bar" },
  { type: "line" as const, icon: LineChart, label: "Line" },
  { type: "scatter" as const, icon: ScatterChart, label: "Scatter" },
  { type: "pie" as const, icon: PieChart, label: "Pie" },
  { type: "area" as const, icon: AreaChart, label: "Area" },
  { type: "histogram" as const, icon: Hash, label: "Histogram" },
];

const AGGREGATES = [
  { value: "none", label: "Raw" },
  { value: "count", label: "Count" },
  { value: "sum", label: "Sum" },
  { value: "avg", label: "Average" },
  { value: "min", label: "Min" },
  { value: "max", label: "Max" },
  { value: "distinct", label: "Distinct" },
];

const FILTER_OPS = [
  "=",
  "!=",
  ">",
  "<",
  ">=",
  "<=",
  "LIKE",
  "IN",
  "NOT NULL",
  "IS NULL",
];

const CHART_COLORS = [
  "#6366f1",
  "#818cf8",
  "#a78bfa",
  "#c084fc",
  "#f472b6",
  "#fb923c",
  "#facc15",
  "#34d399",
  "#22d3ee",
  "#60a5fa",
  "#f87171",
  "#a3e635",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function inferType(dbType: string): ColType {
  const t = dbType.toUpperCase();
  if (/INT|BIGINT|FLOAT|DOUBLE|DECIMAL|NUMERIC|REAL/.test(t)) return "number";
  if (/DATE|TIME|TIMESTAMP/.test(t)) return "date";
  if (/BOOL/.test(t)) return "boolean";
  return "string";
}

function genId() {
  return Math.random().toString(36).slice(2, 9);
}

// ─── NL → SQL engine (offline, rule-based) ────────────────────────────────────

function nlToSpec(
  query: string,
  columns: ColumnInfo[],
  tableName: string,
): Partial<ChartSpec> | null {
  const q = query.toLowerCase();
  const numCols = columns.filter((c) => c.type === "number");
  const strCols = columns.filter((c) => c.type === "string");
  const dateCols = columns.filter((c) => c.type === "date");

  // "top N by X"
  const topMatch = q.match(/top\s+(\d+)\s+(?:by\s+)?(\w+)/i);
  if (topMatch) {
    const limit = parseInt(topMatch[1]);
    const field = columns.find((c) =>
      c.name.toLowerCase().includes(topMatch[2].toLowerCase()),
    );
    if (field) {
      return {
        type: "bar",
        limit,
        encodings: [
          {
            id: genId(),
            channel: "x",
            field: strCols[0]?.name ?? field.name,
            aggregate: "none",
          },
          {
            id: genId(),
            channel: "y",
            field: field.name,
            aggregate: field.type === "number" ? "sum" : "count",
            sort: "desc",
          },
        ],
        title: `Top ${limit} by ${field.name}`,
      };
    }
  }

  // "distribution of X" or "histogram of X"
  if (/distribution|histogram/.test(q)) {
    const fieldName =
      numCols.find((c) => q.includes(c.name.toLowerCase()))?.name ??
      numCols[0]?.name;
    if (fieldName) {
      return {
        type: "histogram",
        encodings: [
          { id: genId(), channel: "x", field: fieldName, aggregate: "none" },
        ],
        title: `Distribution of ${fieldName}`,
      };
    }
  }

  // "trend" or "over time"
  if (/trend|over\s+time|timeline|evolution/.test(q)) {
    const dateField = dateCols[0]?.name;
    const valField = numCols[0]?.name;
    if (dateField && valField) {
      return {
        type: "line",
        encodings: [
          { id: genId(), channel: "x", field: dateField, aggregate: "none" },
          { id: genId(), channel: "y", field: valField, aggregate: "sum" },
        ],
        title: `Trend of ${valField} over time`,
      };
    }
  }

  // "by X" grouping
  const byMatch = q.match(/(?:by|per|group\s+by)\s+(\w+)/i);
  if (byMatch) {
    const groupCol = columns.find((c) =>
      c.name.toLowerCase().includes(byMatch[1].toLowerCase()),
    );
    const valCol = numCols[0];
    if (groupCol && valCol) {
      return {
        type: "bar",
        encodings: [
          {
            id: genId(),
            channel: "x",
            field: groupCol.name,
            aggregate: "none",
          },
          { id: genId(), channel: "y", field: valCol.name, aggregate: "sum" },
        ],
        title: `${valCol.name} by ${groupCol.name}`,
      };
    }
  }

  // "compare X and Y"
  if (/compar|vs|versus|scatter/.test(q)) {
    if (numCols.length >= 2) {
      return {
        type: "scatter",
        encodings: [
          {
            id: genId(),
            channel: "x",
            field: numCols[0].name,
            aggregate: "none",
          },
          {
            id: genId(),
            channel: "y",
            field: numCols[1].name,
            aggregate: "none",
          },
          ...(strCols[0]
            ? [
                {
                  id: genId(),
                  channel: "color" as const,
                  field: strCols[0].name,
                  aggregate: "none" as const,
                },
              ]
            : []),
        ],
        title: `${numCols[0].name} vs ${numCols[1].name}`,
      };
    }
  }

  // "pie" or "breakdown"
  if (/pie|breakdown|proportion|share/.test(q)) {
    const catField = strCols[0]?.name;
    const valField = numCols[0]?.name ?? catField;
    if (catField) {
      return {
        type: "pie",
        encodings: [
          { id: genId(), channel: "x", field: catField, aggregate: "none" },
          {
            id: genId(),
            channel: "y",
            field: valField,
            aggregate: valField !== catField ? "sum" : "count",
          },
        ],
        title: `Breakdown by ${catField}`,
      };
    }
  }

  return null;
}

// ─── Build SQL from spec ──────────────────────────────────────────────────────

function buildSQL(spec: ChartSpec, tableName: string): string {
  const xEnc = spec.encodings.find((e) => e.channel === "x");
  const yEnc = spec.encodings.find((e) => e.channel === "y");
  const colorEnc = spec.encodings.find((e) => e.channel === "color");

  if (spec.type === "histogram" && xEnc) {
    return `SELECT "${xEnc.field}" as value FROM "${tableName}" WHERE "${xEnc.field}" IS NOT NULL${buildWhereClause(spec.filters)} LIMIT ${spec.limit}`;
  }

  const hasAgg = spec.encodings.some(
    (e) => e.aggregate && e.aggregate !== "none",
  );

  const selectParts: string[] = [];
  const groupParts: string[] = [];

  if (xEnc) {
    selectParts.push(`"${xEnc.field}" as x_val`);
    if (hasAgg) groupParts.push(`"${xEnc.field}"`);
  }

  if (yEnc) {
    if (yEnc.aggregate && yEnc.aggregate !== "none") {
      const aggFn =
        yEnc.aggregate === "distinct"
          ? "COUNT(DISTINCT"
          : yEnc.aggregate.toUpperCase() + "(";
      const close = yEnc.aggregate === "distinct" ? ")" : "";
      selectParts.push(
        `${aggFn}TRY_CAST("${yEnc.field}" AS DOUBLE)${close}) as y_val`,
      );
    } else {
      selectParts.push(`TRY_CAST("${yEnc.field}" AS DOUBLE) as y_val`);
    }
  }

  if (colorEnc) {
    selectParts.push(`"${colorEnc.field}" as color_val`);
    if (hasAgg) groupParts.push(`"${colorEnc.field}"`);
  }

  if (selectParts.length === 0)
    return `SELECT * FROM "${tableName}" LIMIT ${spec.limit}`;

  let sql = `SELECT ${selectParts.join(", ")} FROM "${tableName}"`;

  const where = buildWhereClause(spec.filters);
  if (where) sql += ` WHERE ${where.slice(5)}`; // strip leading " AND "

  if (groupParts.length > 0) sql += ` GROUP BY ${groupParts.join(", ")}`;

  const sortEnc = spec.encodings.find((e) => e.sort && e.sort !== "none");
  if (sortEnc) {
    const dir = sortEnc.sort === "desc" ? "DESC" : "ASC";
    sql += ` ORDER BY y_val ${dir}`;
  } else if (hasAgg) {
    sql += ` ORDER BY y_val DESC`;
  }

  sql += ` LIMIT ${spec.limit}`;
  return sql;
}

function buildWhereClause(filters: FilterDef[]): string {
  return filters
    .map((f) => {
      if (f.op === "IS NULL") return ` AND "${f.field}" IS NULL`;
      if (f.op === "NOT NULL") return ` AND "${f.field}" IS NOT NULL`;
      if (f.op === "IN") {
        const vals = f.value
          .split(",")
          .map((v) => `'${v.trim()}'`)
          .join(",");
        return ` AND "${f.field}" IN (${vals})`;
      }
      if (f.op === "LIKE")
        return ` AND CAST("${f.field}" AS VARCHAR) LIKE '${f.value}'`;
      return ` AND TRY_CAST("${f.field}" AS VARCHAR) ${f.op} '${f.value}'`;
    })
    .join("");
}

// ─── Build ECharts option from result ─────────────────────────────────────────

function buildChartOption(
  spec: ChartSpec,
  data: Record<string, unknown>[],
): Record<string, unknown> {
  const base = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: spec.type === "scatter" ? "item" : "axis",
      backgroundColor: "#1e1e2e",
      borderColor: "#ffffff10",
      textStyle: { color: "#cdd6f4", fontSize: 11 },
    },
    grid: { top: 40, right: 20, bottom: 40, left: 60, containLabel: true },
  };

  if (spec.type === "histogram") {
    const values = data
      .map((d) => Number(d.value ?? 0))
      .filter((v) => !isNaN(v));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const binCount = Math.min(30, Math.ceil(Math.sqrt(values.length)));
    const binWidth = (max - min) / binCount || 1;
    const bins = Array.from({ length: binCount }, (_, i) => ({
      label: (min + i * binWidth).toFixed(1),
      count: 0,
    }));
    for (const v of values) {
      const idx = Math.min(Math.floor((v - min) / binWidth), binCount - 1);
      if (bins[idx]) bins[idx].count++;
    }
    return {
      ...base,
      xAxis: {
        type: "category",
        data: bins.map((b) => b.label),
        axisLabel: { fontSize: 9, color: "#6c7086", rotate: 45 },
        axisLine: { lineStyle: { color: "#ffffff10" } },
      },
      yAxis: {
        type: "value",
        axisLabel: { fontSize: 9, color: "#6c7086" },
        splitLine: { lineStyle: { color: "#ffffff08" } },
      },
      series: [
        {
          type: "bar",
          data: bins.map((b) => b.count),
          itemStyle: { color: "#6366f1", borderRadius: [4, 4, 0, 0] },
          barMaxWidth: 40,
        },
      ],
    };
  }

  if (spec.type === "pie") {
    return {
      ...base,
      grid: undefined,
      series: [
        {
          type: "pie",
          radius: ["35%", "65%"],
          data: data.map((d, i) => ({
            name: String(d.x_val ?? ""),
            value: Number(d.y_val ?? 0),
            itemStyle: { color: CHART_COLORS[i % CHART_COLORS.length] },
          })),
          label: { color: "#6c7086", fontSize: 10 },
          itemStyle: { borderColor: "#0f1117", borderWidth: 2 },
        },
      ],
    };
  }

  const xLabels = data.map((d) => String(d.x_val ?? ""));
  const yValues = data.map((d) => Number(d.y_val ?? 0));

  const xAxis = {
    type: "category" as const,
    data: xLabels,
    axisLabel: {
      fontSize: 9,
      color: "#6c7086",
      rotate: xLabels.length > 10 ? 45 : 0,
    },
    axisLine: { lineStyle: { color: "#ffffff10" } },
  };

  const yAxis = {
    type: "value" as const,
    axisLabel: { fontSize: 9, color: "#6c7086" },
    splitLine: { lineStyle: { color: "#ffffff08" } },
  };

  if (spec.type === "scatter") {
    return {
      ...base,
      xAxis: { ...yAxis },
      yAxis: { ...yAxis },
      series: [
        {
          type: "scatter",
          data: data.map((d) => [Number(d.x_val ?? 0), Number(d.y_val ?? 0)]),
          itemStyle: { color: "#6366f1" },
          symbolSize: 6,
        },
      ],
    };
  }

  if (spec.type === "area") {
    return {
      ...base,
      xAxis,
      yAxis,
      series: [
        {
          type: "line",
          data: yValues,
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(99,102,241,0.4)" },
                { offset: 1, color: "rgba(99,102,241,0)" },
              ],
            },
          },
          lineStyle: { color: "#6366f1", width: 2 },
          itemStyle: { color: "#6366f1" },
          smooth: true,
        },
      ],
    };
  }

  // bar / line
  return {
    ...base,
    xAxis,
    yAxis,
    series: [
      {
        type: spec.type,
        data: yValues,
        itemStyle: {
          color: "#6366f1",
          borderRadius: spec.type === "bar" ? [4, 4, 0, 0] : undefined,
        },
        lineStyle:
          spec.type === "line" ? { color: "#6366f1", width: 2 } : undefined,
        smooth: spec.type === "line",
        barMaxWidth: 40,
      },
    ],
  };
}

// ─── Components ───────────────────────────────────────────────────────────────

function ColumnPill({
  col,
  onDragStart,
}: {
  col: ColumnInfo;
  onDragStart: (col: ColumnInfo) => void;
}) {
  const icon =
    col.type === "number" ? (
      <Hash className="w-3 h-3" />
    ) : col.type === "date" ? (
      <TrendingUp className="w-3 h-3" />
    ) : col.type === "boolean" ? (
      <Filter className="w-3 h-3" />
    ) : (
      <Type className="w-3 h-3" />
    );

  const color =
    col.type === "number"
      ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
      : col.type === "date"
        ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
        : col.type === "boolean"
          ? "text-blue-400 bg-blue-500/10 border-blue-500/20"
          : "text-violet-400 bg-violet-500/10 border-violet-500/20";

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", col.name);
        onDragStart(col);
      }}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium cursor-grab active:cursor-grabbing hover:brightness-110 transition-all",
        color,
      )}
    >
      {icon}
      <span className="truncate max-w-[120px]">{col.name}</span>
    </div>
  );
}

function EncodingSlot({
  channel,
  encoding,
  columns,
  onChange,
  onRemove,
  onDrop,
}: {
  channel: Encoding["channel"];
  encoding?: Encoding;
  columns: ColumnInfo[];
  onChange: (e: Encoding) => void;
  onRemove: () => void;
  onDrop: (field: string) => void;
}) {
  const labels: Record<string, string> = {
    x: "X Axis",
    y: "Y Axis",
    color: "Color",
    size: "Size",
    label: "Label",
    detail: "Detail",
  };
  const [over, setOver] = useState(false);

  return (
    <div
      className={cn(
        "rounded-xl border p-3 transition-all",
        over
          ? "border-primary bg-primary/10"
          : encoding
            ? "border-border bg-muted"
            : "border-dashed border-border bg-muted",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onDrop(e.dataTransfer.getData("text/plain"));
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          {labels[channel]}
        </span>
        {encoding && (
          <button
            type="button"
            onClick={onRemove}
            className="text-muted-foreground hover:text-red-400"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      {encoding ? (
        <div className="space-y-2">
          <select
            value={encoding.field}
            onChange={(e) => onChange({ ...encoding, field: e.target.value })}
            className="w-full bg-card border border-border rounded-lg px-2 py-1.5 text-xs text-foreground focus:border-primary outline-none"
          >
            {columns.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
          {(channel === "y" || channel === "size") && (
            <select
              value={encoding.aggregate ?? "none"}
              onChange={(e) =>
                onChange({
                  ...encoding,
                  aggregate: e.target.value as Encoding["aggregate"],
                })
              }
              className="w-full bg-card border border-border rounded-lg px-2 py-1.5 text-xs text-foreground focus:border-primary outline-none"
            >
              {AGGREGATES.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-2">
          Drop a column here
        </p>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DataFormulatorPage() {
  // State
  const [tables, setTables] = useState<string[]>([]);
  const [activeTable, setActiveTable] = useState("");
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [nlQuery, setNlQuery] = useState("");
  const [generatedSQL, setGeneratedSQL] = useState("");
  const [showSQL, setShowSQL] = useState(false);
  const [dragCol, setDragCol] = useState<ColumnInfo | null>(null);
  const [error, setError] = useState("");
  const [colSearch, setColSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const [spec, setSpec] = useState<ChartSpec>({
    type: "bar",
    encodings: [],
    filters: [],
    limit: 100,
    title: "",
  });

  // Load available tables
  useEffect(() => {
    async function init() {
      try {
        const tbls = await listTables();
        setTables(tbls);
        if (tbls.length > 0) {
          setActiveTable(tbls[0]);
        }
      } catch {
        // No tables yet
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  // Load columns when table changes
  useEffect(() => {
    if (!activeTable) return;
    async function loadCols() {
      try {
        const info = await getTableInfo(activeTable);
        setColumns(
          info.columns.map((c) => ({
            name: c.name,
            type: inferType(c.type),
            dbType: c.type,
          })),
        );
      } catch {
        setColumns([]);
      }
    }
    loadCols();
  }, [activeTable]);

  // Filtered columns
  const filteredCols = useMemo(() => {
    if (!colSearch) return columns;
    const q = colSearch.toLowerCase();
    return columns.filter((c) => c.name.toLowerCase().includes(q));
  }, [columns, colSearch]);

  // Update encoding
  const updateEncoding = useCallback(
    (channel: Encoding["channel"], enc: Encoding) => {
      setSpec((prev) => ({
        ...prev,
        encodings: prev.encodings.map((e) => (e.channel === channel ? enc : e)),
      }));
    },
    [],
  );

  const removeEncoding = useCallback((channel: Encoding["channel"]) => {
    setSpec((prev) => ({
      ...prev,
      encodings: prev.encodings.filter((e) => e.channel !== channel),
    }));
  }, []);

  const dropOnChannel = useCallback(
    (channel: Encoding["channel"], fieldName: string) => {
      const col = columns.find((c) => c.name === fieldName);
      if (!col) return;
      setSpec((prev) => {
        const existing = prev.encodings.filter((e) => e.channel !== channel);
        const newEnc: Encoding = {
          id: genId(),
          channel,
          field: fieldName,
          aggregate: channel === "y" && col.type === "number" ? "sum" : "none",
        };
        return { ...prev, encodings: [...existing, newEnc] };
      });
    },
    [columns],
  );

  // Add filter
  const addFilter = useCallback(() => {
    if (columns.length === 0) return;
    setSpec((prev) => ({
      ...prev,
      filters: [
        ...prev.filters,
        { id: genId(), field: columns[0].name, op: "=", value: "" },
      ],
    }));
    setShowFilters(true);
  }, [columns]);

  const updateFilter = useCallback((id: string, patch: Partial<FilterDef>) => {
    setSpec((prev) => ({
      ...prev,
      filters: prev.filters.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    }));
  }, []);

  const removeFilter = useCallback((id: string) => {
    setSpec((prev) => ({
      ...prev,
      filters: prev.filters.filter((f) => f.id !== id),
    }));
  }, []);

  // Execute query
  const executeQuery = useCallback(async () => {
    if (!activeTable || spec.encodings.length === 0) return;
    setRunning(true);
    setError("");
    const start = performance.now();
    try {
      const sql = buildSQL(spec, activeTable);
      setGeneratedSQL(sql);
      const data = await runQuery(sql);
      setResult({
        sql,
        data,
        duration: Math.round(performance.now() - start),
        rowCount: data.length,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  }, [activeTable, spec]);

  // NL query handler
  const handleNLQuery = useCallback(() => {
    if (!nlQuery.trim() || columns.length === 0) return;
    const parsed = nlToSpec(nlQuery, columns, activeTable);
    if (parsed) {
      setSpec((prev) => ({
        ...prev,
        type: parsed.type ?? prev.type,
        encodings: parsed.encodings ?? prev.encodings,
        title: parsed.title ?? prev.title,
        limit: parsed.limit ?? prev.limit,
      }));
    }
  }, [nlQuery, columns, activeTable]);

  // Auto-run when spec changes
  const prevSpecRef = useRef("");
  useEffect(() => {
    const key =
      JSON.stringify(spec.encodings) +
      spec.type +
      JSON.stringify(spec.filters) +
      spec.limit;
    if (
      key !== prevSpecRef.current &&
      spec.encodings.length > 0 &&
      activeTable
    ) {
      prevSpecRef.current = key;
      const timer = setTimeout(() => executeQuery(), 300);
      return () => clearTimeout(timer);
    }
  }, [spec, activeTable, executeQuery]);

  // Chart option
  const chartOption = useMemo(() => {
    if (!result || result.data.length === 0) return null;
    return buildChartOption(spec, result.data);
  }, [result, spec]);

  // ─── Empty state ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground gap-3">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading tables...</span>
      </div>
    );
  }

  if (tables.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20 text-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="w-20 h-20 rounded-3xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mb-6 mx-auto">
            <FlaskConical className="w-9 h-9 text-violet-400" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">
            Data Formulator
          </h2>
          <p className="text-muted-foreground max-w-lg text-sm leading-relaxed mb-6">
            Visual query builder with drag-and-drop encodings. Upload a dataset
            first from the Upload page, then come back to create charts and
            insights.
          </p>
          <a
            href="/dashboard/upload"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium transition-colors"
          >
            <Database className="w-4 h-4" /> Go to Upload
          </a>
        </motion.div>
      </div>
    );
  }

  // ─── Main UI ──────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col overflow-hidden h-full">
      {/* Header */}
      <div className="flex-none px-5 py-3 border-b border-border flex items-center gap-4">
        <FlaskConical className="w-5 h-5 text-violet-400" />
        <h1 className="text-base font-bold text-foreground">Data Formulator</h1>

        {/* Table selector */}
        <select
          value={activeTable}
          onChange={(e) => setActiveTable(e.target.value)}
          className="ml-4 bg-card border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:border-primary outline-none"
        >
          {tables.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <span className="text-xs text-muted-foreground">
          {columns.length} columns
        </span>

        <div className="flex-1" />

        {result && (
          <span className="text-xs text-muted-foreground">
            {result.rowCount} rows · {result.duration}ms
          </span>
        )}

        <button
          type="button"
          onClick={() => setShowSQL(!showSQL)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
            showSQL
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground",
          )}
        >
          <Eye className="w-3.5 h-3.5" /> SQL
        </button>
      </div>

      {/* NL query bar */}
      <div className="flex-none px-5 py-2.5 border-b border-border flex items-center gap-3">
        <Sparkles className="w-4 h-4 text-violet-400 flex-none" />
        <input
          value={nlQuery}
          onChange={(e) => setNlQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleNLQuery();
          }}
          placeholder="Ask in natural language: &quot;top 10 by revenue&quot;, &quot;distribution of amount&quot;, &quot;trend over time&quot;..."
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
        />
        <button
          type="button"
          onClick={handleNLQuery}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 rounded-lg text-xs text-primary-foreground font-medium transition-colors"
        >
          <Wand2 className="w-3.5 h-3.5" /> Generate
        </button>
      </div>

      {/* Error banner */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex-none px-5 py-2 bg-red-500/10 border-b border-red-500/20 text-red-400 text-xs flex items-center gap-2"
          >
            <X className="w-3 h-3 flex-none" /> {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* SQL preview */}
      <AnimatePresence>
        {showSQL && generatedSQL && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex-none px-5 py-3 border-b border-border bg-card"
          >
            <pre className="text-xs text-violet-300 font-mono whitespace-pre-wrap">
              {generatedSQL}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content: sidebar + chart */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel — columns + encodings */}
        <div className="w-72 flex-none border-r border-border flex flex-col overflow-hidden bg-card">
          {/* Column list */}
          <div className="flex-none px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2 mb-2">
              <Layers className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                Fields
              </span>
            </div>
            <input
              value={colSearch}
              onChange={(e) => setColSearch(e.target.value)}
              placeholder="Search columns..."
              className="w-full bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
            />
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1.5">
            {filteredCols.map((col) => (
              <ColumnPill key={col.name} col={col} onDragStart={setDragCol} />
            ))}
          </div>

          {/* Encoding shelves */}
          <div className="flex-none border-t border-border px-4 py-3 space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <Palette className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                Encodings
              </span>
            </div>
            {(["x", "y", "color"] as const).map((ch) => (
              <EncodingSlot
                key={ch}
                channel={ch}
                encoding={spec.encodings.find((e) => e.channel === ch)}
                columns={columns}
                onChange={(enc) => updateEncoding(ch, enc)}
                onRemove={() => removeEncoding(ch)}
                onDrop={(field) => dropOnChannel(ch, field)}
              />
            ))}
          </div>

          {/* Filters */}
          <div className="flex-none border-t border-border px-4 py-3">
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center justify-between w-full text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2"
            >
              <span className="flex items-center gap-2">
                <Filter className="w-3.5 h-3.5" /> Filters{" "}
                {spec.filters.length > 0 && (
                  <span className="text-violet-400">
                    ({spec.filters.length})
                  </span>
                )}
              </span>
              {showFilters ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>
            <AnimatePresence>
              {showFilters && (
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: "auto" }}
                  exit={{ height: 0 }}
                  className="overflow-hidden space-y-2"
                >
                  {spec.filters.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center gap-1.5 text-xs"
                    >
                      <select
                        value={f.field}
                        onChange={(e) =>
                          updateFilter(f.id, { field: e.target.value })
                        }
                        className="flex-1 bg-card border border-border rounded px-1.5 py-1 text-foreground outline-none"
                      >
                        {columns.map((c) => (
                          <option key={c.name} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={f.op}
                        onChange={(e) =>
                          updateFilter(f.id, {
                            op: e.target.value as FilterDef["op"],
                          })
                        }
                        className="bg-card border border-border rounded px-1 py-1 text-foreground outline-none w-14"
                      >
                        {FILTER_OPS.map((op) => (
                          <option key={op} value={op}>
                            {op}
                          </option>
                        ))}
                      </select>
                      {f.op !== "IS NULL" && f.op !== "NOT NULL" && (
                        <input
                          value={f.value}
                          onChange={(e) =>
                            updateFilter(f.id, { value: e.target.value })
                          }
                          className="flex-1 bg-card border border-border rounded px-1.5 py-1 text-foreground outline-none"
                          placeholder="value"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => removeFilter(f.id)}
                        className="text-muted-foreground hover:text-red-400"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addFilter}
                    className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300"
                  >
                    <Plus className="w-3 h-3" /> Add filter
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Right panel — chart type + visualization */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Chart type selector */}
          <div className="flex-none px-5 py-3 border-b border-border flex items-center gap-2">
            {CHART_TYPES.map((ct) => {
              const Icon = ct.icon;
              return (
                <button
                  key={ct.type}
                  type="button"
                  onClick={() =>
                    setSpec((prev) => ({ ...prev, type: ct.type }))
                  }
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                    spec.type === ct.type
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground hover:bg-accent",
                  )}
                >
                  <Icon className="w-3.5 h-3.5" /> {ct.label}
                </button>
              );
            })}
            <div className="flex-1" />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Limit:</span>
              <input
                type="number"
                value={spec.limit}
                onChange={(e) =>
                  setSpec((prev) => ({
                    ...prev,
                    limit: Math.max(1, parseInt(e.target.value) || 100),
                  }))
                }
                className="w-16 bg-card border border-border rounded px-2 py-1 text-foreground outline-none text-center"
              />
            </div>
            <button
              type="button"
              onClick={executeQuery}
              disabled={running || spec.encodings.length === 0}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-xs text-primary-foreground font-medium transition-colors"
            >
              {running ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              Run
            </button>
          </div>

          {/* Chart area */}
          <div className="flex-1 overflow-auto p-5">
            {spec.encodings.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <GripVertical className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-muted-foreground mb-2">
                    Drag fields to encodings
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Drag columns from the left panel onto X, Y, and Color slots
                    to create visualizations. Or type a natural language query
                    above.
                  </p>
                </motion.div>
              </div>
            ) : chartOption ? (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                key={JSON.stringify(chartOption)}
              >
                {spec.title && (
                  <h3 className="text-sm font-semibold text-foreground mb-3">
                    {spec.title}
                  </h3>
                )}
                <div className="rounded-2xl border border-border bg-muted p-4">
                  <ReactECharts
                    option={chartOption}
                    style={{ height: 400 }}
                    opts={{ renderer: "canvas" }}
                  />
                </div>

                {/* Data table preview */}
                {result && result.data.length > 0 && (
                  <div className="mt-4 rounded-2xl border border-border bg-muted overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                      <Table2 className="w-4 h-4 text-muted-foreground" />
                      <span className="text-xs font-semibold text-muted-foreground">
                        Result Data
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {result.rowCount} rows
                      </span>
                    </div>
                    <div className="overflow-x-auto max-h-64">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border">
                            {Object.keys(result.data[0]).map((k) => (
                              <th
                                key={k}
                                className="text-left px-3 py-2 text-[10px] text-muted-foreground uppercase tracking-wide font-semibold whitespace-nowrap"
                              >
                                {k}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {result.data.slice(0, 50).map((row, i) => (
                            <tr
                              key={i}
                              className="border-b border-border hover:bg-muted"
                            >
                              {Object.values(row).map((v, j) => (
                                <td
                                  key={j}
                                  className="px-3 py-1.5 text-foreground whitespace-nowrap font-mono tabular-nums"
                                >
                                  {v == null ? (
                                    <span className="text-muted-foreground">
                                      null
                                    </span>
                                  ) : (
                                    String(v)
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </motion.div>
            ) : running ? (
              <div className="flex items-center justify-center h-full gap-3 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Running query...</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
