"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import Papa from "papaparse";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Clipboard,
  Code2,
  Database,
  Download,
  Eye,
  FileText,
  Filter,
  Hash,
  Loader2,
  Play,
  RefreshCw,
  Settings2,
  Table2,
  Trash2,
  Type,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { useDropzone } from "react-dropzone";
import { cn } from "@/shared/utils";
import {
  getTableInfo,
  loadDelimitedCSVFromFile,
  loadJSONToDuckDB,
} from "@/platform/duckdb/duckdb";
import { useDataStore } from "@/core/stores/data-store";
import type { ColMeta, Dataset } from "@/core/stores/data-store";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

type ColType = "string" | "number" | "date" | "boolean";

const LARGE_FILE_DIRECT_LOAD_BYTES = 16 * 1024 * 1024;

interface ColConfig {
  original: string;
  alias: string;
  type: ColType;
  include: boolean;
}

interface ParsedResult {
  rows: Record<string, unknown>[];
  headers: string[];
  errors: string[];
  parseMs: number;
}

// ─── Delimiter options ────────────────────────────────────────────────────────

const DELIMITERS = [
  { label: "Auto-detect", value: "" },
  { label: "Pipe  |", value: "|" },
  { label: "Comma  ,", value: "," },
  { label: "Semicolon  ;", value: ";" },
  { label: "Tab  \\t", value: "\t" },
  { label: "Space", value: " " },
];

// ─── Type badge ───────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: ColType }) {
  return (
    <span
      className={cn(
        "text-[9px] px-1.5 py-0.5 rounded font-mono",
        type === "number" && "bg-emerald-500/15 text-emerald-400",
        type === "string" && "bg-blue-500/15 text-blue-400",
        type === "date" && "bg-purple-500/15 text-purple-400",
        type === "boolean" && "bg-amber-500/15 text-amber-400",
      )}
    >
      {type}
    </span>
  );
}

// ─── Auto-detect column type from sample values ───────────────────────────────

function detectType(values: unknown[]): ColType {
  const nonNull = values.filter(
    (v) => v !== null && v !== undefined && v !== "",
  );
  if (nonNull.length === 0) return "string";
  let nums = 0,
    dates = 0,
    bools = 0;
  for (const v of nonNull) {
    const s = String(v).trim();
    if (s === "true" || s === "false" || s === "1" || s === "0") bools++;
    else if (!Number.isNaN(Number(s)) && s !== "") nums++;
    else if (/^\d{4}-\d{2}-\d{2}/.test(s) || /^\d{2}\/\d{2}\/\d{4}/.test(s))
      dates++;
  }
  const n = nonNull.length;
  if (nums / n > 0.85) return "number";
  if (dates / n > 0.85) return "date";
  if (bools / n > 0.85) return "boolean";
  return "string";
}

// ─── Cast a value to a target type ───────────────────────────────────────────

function castValue(v: unknown, type: ColType): unknown {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim();
  if (type === "number") {
    const n = Number(s.replace(/,/g, ""));
    return Number.isNaN(n) ? null : n;
  }
  if (type === "boolean")
    return s === "true" || s === "1" || s === "yes" || s === "oui";
  if (type === "date") {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? s : d.toISOString().slice(0, 10);
  }
  return s;
}

// ─── Apply filter expression to a row ────────────────────────────────────────

function applyFilter(row: Record<string, unknown>, filter: string): boolean {
  if (!filter.trim()) return true;
  try {
    // Simple equality filter: COLUMN = value or COLUMN != value or COLUMN > value
    const eqMatch = filter.match(/^(\w+)\s*(=|!=|>|<|>=|<=)\s*(.+)$/i);
    if (eqMatch) {
      const [, col, op, raw] = eqMatch;
      const val = row[col];
      const target = raw.trim().replace(/^['"]|['"]$/g, "");
      const a = String(val ?? "").toLowerCase();
      const b = target.toLowerCase();
      const na = Number(val),
        nb = Number(target);
      if (op === "=") return a === b;
      if (op === "!=") return a !== b;
      if (op === ">" && !Number.isNaN(na) && !Number.isNaN(nb)) return na > nb;
      if (op === "<" && !Number.isNaN(na) && !Number.isNaN(nb)) return na < nb;
      if (op === ">=" && !Number.isNaN(na) && !Number.isNaN(nb))
        return na >= nb;
      if (op === "<=" && !Number.isNaN(na) && !Number.isNaN(nb))
        return na <= nb;
    }
    // CONTAINS: COLUMN LIKE %value%
    const likeMatch = filter.match(/^(\w+)\s+LIKE\s+%(.+)%$/i);
    if (likeMatch) {
      const [, col, sub] = likeMatch;
      return String(row[col] ?? "")
        .toLowerCase()
        .includes(sub.toLowerCase());
    }
    return true;
  } catch {
    return true;
  }
}

// ─── Export rows as CSV string ────────────────────────────────────────────────

function rowsToCSV(rows: Record<string, unknown>[], headers: string[]): string {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(
      headers
        .map((h) => {
          const v = String(row[h] ?? "");
          return v.includes(",") || v.includes('"')
            ? `"${v.replace(/"/g, '""')}"`
            : v;
        })
        .join(","),
    );
  }
  return lines.join("\n");
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CsvParserScreen() {
  const { addDataset, setActiveDataset, markTableLoaded } = useDataStore();

  // ── Raw input state ──────────────────────────────────────────────────────
  const [rawText, setRawText] = useState("");
  const [delimiter, setDelimiter] = useState("|");
  const [hasHeader, setHasHeader] = useState(true);
  const [skipEmpty, setSkipEmpty] = useState(true);
  const [trimWS, setTrimWS] = useState(true);

  // ── Parsed state ─────────────────────────────────────────────────────────
  const [parsed, setParsed] = useState<ParsedResult | null>(null);
  const [colConfigs, setColConfigs] = useState<ColConfig[]>([]);
  const [filterExpr, setFilterExpr] = useState("");
  const [previewLimit, setPreviewLimit] = useState(50);
  const [parsing, setParsing] = useState(false);

  // ── DuckDB load state ────────────────────────────────────────────────────
  const [tableName, setTableName] = useState("parsed_data");
  const [loadingDB, setLoadingDB] = useState(false);
  const [loadedTable, setLoadedTable] = useState<string | null>(null);

  // ── Panel visibility ─────────────────────────────────────────────────────
  const [showColPanel, setShowColPanel] = useState(true);
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Drop zone ────────────────────────────────────────────────────────────
  const onDrop = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      const directDelimiter = file.name.endsWith(".tsv") ? "\t" : ",";
      if (file.name.endsWith(".tsv")) setDelimiter("\t");
      else if (file.name.endsWith(".csv")) setDelimiter(",");

      if (file.size >= LARGE_FILE_DIRECT_LOAD_BYTES) {
        const safeName =
          file.name
            .replace(/\.[^.]+$/, "")
            .replace(/[^a-zA-Z0-9_]/g, "_")
            .replace(/_+/g, "_")
            .replace(/^_|_$/g, "")
            .toLowerCase() || "parsed_data";

        setLoadingDB(true);
        try {
          await loadDelimitedCSVFromFile(safeName, file, directDelimiter);
          const info = await getTableInfo(safeName);
          markTableLoaded(safeName);
          const dsId = `ds_csv_${Date.now()}`;
          const dsCols: ColMeta[] = info.columns.map((column) => ({
            name: column.name,
            type: "string",
            nullCount: 0,
            distinctCount: 0,
            sample: [],
          }));
          const ds: Dataset = {
            id: dsId,
            name: safeName,
            tableName: safeName,
            source: "upload",
            format: "csv",
            rowCount: info.rowCount,
            colCount: info.columns.length,
            sizeBytes: file.size,
            columns: dsCols,
            tags: [],
            description: "Direct-loaded large CSV file",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            qualityScore: 85,
          };
          addDataset(ds);
          setActiveDataset(dsId);
          setTableName(safeName);
          setLoadedTable(safeName);
          setRawText("");
          setParsed(null);
          toast.success(
            `Large file loaded directly to DuckDB — ${info.rowCount.toLocaleString()} rows`,
          );
        } catch (error) {
          toast.error(`DuckDB error: ${String(error).slice(0, 80)}`);
        } finally {
          setLoadingDB(false);
        }
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => setRawText(String(e.target?.result ?? ""));
      reader.readAsText(file, "UTF-8");
    },
    [addDataset, markTableLoaded, setActiveDataset],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "text/csv": [".csv", ".tsv", ".txt"] },
    noClick: rawText.length > 0,
    multiple: false,
  });

  // ── Parse ────────────────────────────────────────────────────────────────
  const handleParse = useCallback(() => {
    if (!rawText.trim()) return;
    setParsing(true);
    const t0 = performance.now();

    Papa.parse(rawText, {
      header: hasHeader,
      delimiter: delimiter || undefined,
      skipEmptyLines: skipEmpty,
      dynamicTyping: false,
      complete: (result) => {
        const raw = result.data as Record<string, unknown>[];
        const trimmed = trimWS
          ? raw.map((row) =>
              Object.fromEntries(
                Object.entries(row).map(([k, v]) => [
                  k,
                  typeof v === "string" ? v.trim() : v,
                ]),
              ),
            )
          : raw;

        const headers = trimmed.length > 0 ? Object.keys(trimmed[0]) : [];
        const errors = result.errors.slice(0, 3).map((e) => e.message);

        const configs: ColConfig[] = headers.map((h) => ({
          original: h,
          alias: h,
          type: detectType(trimmed.slice(0, 200).map((r) => r[h])),
          include: true,
        }));

        setParsed({
          rows: trimmed,
          headers,
          errors,
          parseMs: Math.round(performance.now() - t0),
        });
        setColConfigs(configs);
        setLoadedTable(null);
        setParsing(false);
      },
      error: () => setParsing(false),
    });
  }, [rawText, delimiter, hasHeader, skipEmpty, trimWS]);

  // ── Transformed output (memoized) ────────────────────────────────────────
  const transformed = useMemo(() => {
    if (!parsed) return { rows: [], headers: [] };

    const activeCols = colConfigs.filter((c) => c.include);
    const headers = activeCols.map((c) => c.alias);

    let rows = parsed.rows
      .filter((row) => applyFilter(row, filterExpr))
      .slice(0, previewLimit)
      .map((row) =>
        Object.fromEntries(
          activeCols.map((c) => [c.alias, castValue(row[c.original], c.type)]),
        ),
      );

    return { rows, headers };
  }, [parsed, colConfigs, filterExpr, previewLimit]);

  // Full transformed (no preview limit, for export/DB)
  const allTransformed = useMemo(() => {
    if (!parsed) return { rows: [], headers: [] };
    const activeCols = colConfigs.filter((c) => c.include);
    const headers = activeCols.map((c) => c.alias);
    const rows = parsed.rows
      .filter((row) => applyFilter(row, filterExpr))
      .map((row) =>
        Object.fromEntries(
          activeCols.map((c) => [c.alias, castValue(row[c.original], c.type)]),
        ),
      );
    return { rows, headers };
  }, [parsed, colConfigs, filterExpr]);

  // ── Export CSV ───────────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    const { rows, headers } = allTransformed;
    if (rows.length === 0) return;
    const csv = rowsToCSV(rows, headers);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tableName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length.toLocaleString()} rows`);
  }, [allTransformed, tableName]);

  // ── Load to DuckDB ────────────────────────────────────────────────────────
  const handleLoadDB = useCallback(async () => {
    const { rows, headers } = allTransformed;
    if (rows.length === 0 || !tableName.trim()) return;
    setLoadingDB(true);
    try {
      const safeName = tableName.replace(/[^a-zA-Z0-9_]/g, "_");
      await loadJSONToDuckDB(safeName, rows);
      markTableLoaded(safeName);

      const dsId = `ds_csv_${Date.now()}`;
      const dsCols: ColMeta[] = colConfigs
        .filter((c) => c.include)
        .map((c) => ({
          name: c.alias,
          type: c.type === "boolean" ? "boolean" : c.type,
          nullCount: rows.filter((r) => r[c.alias] === null).length,
          distinctCount: new Set(rows.map((r) => String(r[c.alias]))).size,
          sample: rows.slice(0, 5).map((r) => r[c.alias]),
        }));
      const ds: Dataset = {
        id: dsId,
        name: safeName,
        tableName: safeName,
        source: "upload",
        format: "csv",
        rowCount: rows.length,
        colCount: headers.length,
        sizeBytes: rawText.length,
        columns: dsCols,
        tags: [],
        description: "Loaded from CSV Parser",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        qualityScore: 85,
      };
      addDataset(ds);
      setActiveDataset(dsId);
      setLoadedTable(safeName);
      toast.success(
        `Table "${safeName}" loaded — ${rows.length.toLocaleString()} rows`,
      );
    } catch (e) {
      toast.error(`DuckDB error: ${String(e).slice(0, 80)}`);
    } finally {
      setLoadingDB(false);
    }
  }, [
    allTransformed,
    tableName,
    colConfigs,
    rawText,
    addDataset,
    setActiveDataset,
    markTableLoaded,
  ]);

  // ── Paste from clipboard ─────────────────────────────────────────────────
  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      setRawText(text);
      toast.success("Pasted from clipboard");
    } catch {
      textareaRef.current?.focus();
      toast.info("Press Ctrl+V to paste");
    }
  }, []);

  const includedCount = colConfigs.filter((c) => c.include).length;
  const filteredTotal = useMemo(() => {
    if (!parsed) return 0;
    return parsed.rows.filter((row) => applyFilter(row, filterExpr)).length;
  }, [parsed, filterExpr]);

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-hidden">
      {/* ── Header ── */}
      <div className="flex-none border-b border-border px-5 py-3 flex items-center gap-3">
        <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
          <FileText className="w-3.5 h-3.5 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-sm font-semibold text-foreground">
            Advanced CSV Parser
          </h1>
          <p className="text-[10px] text-muted-foreground">
            Paste or drop · retype columns · filter · load to DuckDB
          </p>
        </div>
        <div className="flex-1" />
        {parsed && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Hash className="w-3 h-3" />
              {filteredTotal.toLocaleString()} rows
            </span>
            <span>·</span>
            <span>{includedCount} cols</span>
            <span>·</span>
            <span className="text-emerald-400">{parsed.parseMs}ms</span>
          </div>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* ── Left: input + settings ── */}
        <div className="w-80 flex-none border-r border-border flex flex-col">
          {/* Drop / paste area */}
          <div
            {...getRootProps()}
            className={cn(
              "mx-3 mt-3 rounded-xl border-2 border-dashed transition-colors relative",
              isDragActive
                ? "border-emerald-500 bg-emerald-500/5"
                : "border-border",
            )}
          >
            <input {...getInputProps()} />
            <textarea
              ref={textareaRef}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={`Paste delimited text here…\n\nOr drop a .csv / .tsv file\n\nExample (pipe-delimited):\nID|NAME|AMOUNT\n1|Alice|5000.00\n2|Bob|3200.50`}
              className="w-full h-48 bg-transparent text-xs font-mono text-foreground placeholder:text-muted-foreground/50 resize-none outline-none p-3 rounded-xl"
              spellCheck={false}
            />
            {isDragActive && (
              <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-emerald-500/10 pointer-events-none">
                <p className="text-emerald-400 text-sm font-medium">
                  Drop file here
                </p>
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="flex gap-2 px-3 mt-2">
            <button
              type="button"
              onClick={handlePaste}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-muted hover:bg-accent border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors"
            >
              <Clipboard className="w-3 h-3" /> Paste
            </button>
            <button
              type="button"
              onClick={() => {
                setRawText("");
                setParsed(null);
                setColConfigs([]);
                setLoadedTable(null);
              }}
              disabled={!rawText}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-muted hover:bg-accent border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
            >
              <Trash2 className="w-3 h-3" /> Clear
            </button>
          </div>

          {/* Parse settings */}
          <div className="px-3 mt-3 space-y-2.5 pb-3 border-b border-border">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              Parse Settings
            </p>

            {/* Delimiter */}
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">
                Delimiter
              </label>
              <div className="grid grid-cols-3 gap-1">
                {DELIMITERS.map((d) => (
                  <button
                    key={d.label}
                    type="button"
                    onClick={() => setDelimiter(d.value)}
                    className={cn(
                      "px-2 py-1 text-[10px] rounded-lg border transition-colors",
                      delimiter === d.value
                        ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                        : "border-border text-muted-foreground hover:border-border hover:text-foreground",
                    )}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Toggles */}
            <div className="space-y-1.5">
              {[
                {
                  key: "header",
                  label: "First row is header",
                  val: hasHeader,
                  set: setHasHeader,
                },
                {
                  key: "empty",
                  label: "Skip empty lines",
                  val: skipEmpty,
                  set: setSkipEmpty,
                },
                {
                  key: "trim",
                  label: "Trim whitespace",
                  val: trimWS,
                  set: setTrimWS,
                },
              ].map(({ key, label, val, set }) => (
                <label
                  key={key}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <div
                    onClick={() => set((v) => !v)}
                    className={cn(
                      "w-8 h-4 rounded-full relative transition-colors cursor-pointer",
                      val ? "bg-emerald-500" : "bg-muted border border-border",
                    )}
                  >
                    <div
                      className={cn(
                        "absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform",
                        val ? "translate-x-4" : "translate-x-0.5",
                      )}
                    />
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Parse button */}
          <div className="px-3 mt-3">
            <button
              type="button"
              onClick={handleParse}
              disabled={!rawText.trim() || parsing}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl text-sm font-semibold transition-colors"
            >
              {parsing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {parsing ? "Parsing…" : "Parse"}
            </button>
          </div>

          {/* DuckDB loader */}
          {parsed && (
            <div className="px-3 mt-3 pb-3 space-y-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                Load to DuckDB
              </p>
              <div className="flex gap-2">
                <input
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  placeholder="table_name"
                  className="flex-1 h-8 px-2.5 text-xs bg-muted border border-border rounded-lg text-foreground placeholder:text-muted-foreground outline-none focus:border-emerald-500/50"
                />
                <button
                  type="button"
                  onClick={handleLoadDB}
                  disabled={loadingDB || allTransformed.rows.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors"
                >
                  {loadingDB ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Database className="w-3 h-3" />
                  )}
                  Load
                </button>
              </div>
              {loadedTable && (
                <div className="flex items-center gap-2 px-2.5 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span className="text-[11px] text-emerald-300">
                    Table <code className="font-mono">{loadedTable}</code> ready
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={handleExport}
                disabled={allTransformed.rows.length === 0}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 border border-border text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg text-xs transition-colors disabled:opacity-40"
              >
                <Download className="w-3 h-3" /> Export CSV (
                {allTransformed.rows.length.toLocaleString()} rows)
              </button>
            </div>
          )}
        </div>

        {/* ── Right: columns + preview ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!parsed ? (
            /* Empty state */
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
              <div className="w-16 h-16 rounded-2xl bg-muted border border-border flex items-center justify-center">
                <Table2 className="w-7 h-7 text-muted-foreground" />
              </div>
              <div>
                <p className="text-base font-semibold text-foreground">
                  No data yet
                </p>
                <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                  Paste delimited text on the left, configure the delimiter,
                  then click <strong>Parse</strong>.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
                {[
                  "Rename columns",
                  "Change types",
                  "Filter rows",
                  "Load to DuckDB",
                ].map((f) => (
                  <span
                    key={f}
                    className="flex items-center gap-1 px-2.5 py-1 bg-muted border border-border rounded-lg"
                  >
                    <Check className="w-3 h-3 text-emerald-400" /> {f}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* ── Toolbar ── */}
              <div className="flex-none border-b border-border px-4 py-2 flex items-center gap-3">
                {/* Column config toggle */}
                <button
                  type="button"
                  onClick={() => setShowColPanel((v) => !v)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border transition-colors",
                    showColPanel
                      ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-300"
                      : "border-border text-muted-foreground hover:bg-accent",
                  )}
                >
                  <Settings2 className="w-3 h-3" />
                  Columns ({includedCount}/{colConfigs.length})
                  {showColPanel ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                </button>

                {/* Filter toggle */}
                <button
                  type="button"
                  onClick={() => setShowFilterPanel((v) => !v)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border transition-colors",
                    showFilterPanel || filterExpr
                      ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                      : "border-border text-muted-foreground hover:bg-accent",
                  )}
                >
                  <Filter className="w-3 h-3" />
                  Filter
                  {filterExpr && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  )}
                  {showFilterPanel ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                </button>

                {/* Preview limit */}
                <div className="flex items-center gap-1.5 ml-auto text-[11px] text-muted-foreground">
                  <Eye className="w-3 h-3" />
                  <span>Preview:</span>
                  {[50, 200, 500].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setPreviewLimit(n)}
                      className={cn(
                        "px-2 py-0.5 rounded text-[10px] transition-colors",
                        previewLimit === n
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {n}
                    </button>
                  ))}
                  <span className="ml-1">
                    of {filteredTotal.toLocaleString()}
                  </span>
                </div>

                {/* Re-parse */}
                <button
                  type="button"
                  onClick={handleParse}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 border border-border rounded-lg text-xs text-muted-foreground hover:bg-accent transition-colors"
                >
                  <RefreshCw className="w-3 h-3" /> Re-parse
                </button>
              </div>

              {/* ── Column config panel ── */}
              <AnimatePresence>
                {showColPanel && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="border-b border-border overflow-hidden"
                  >
                    <div className="p-3 overflow-x-auto">
                      <div className="flex gap-1.5 min-w-max">
                        {/* Select all / none */}
                        <div className="flex gap-1 mr-2">
                          <button
                            type="button"
                            onClick={() =>
                              setColConfigs((c) =>
                                c.map((x) => ({ ...x, include: true })),
                              )
                            }
                            className="px-2 py-1 text-[10px] border border-border rounded-lg text-muted-foreground hover:bg-accent transition-colors"
                          >
                            All
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setColConfigs((c) =>
                                c.map((x) => ({ ...x, include: false })),
                              )
                            }
                            className="px-2 py-1 text-[10px] border border-border rounded-lg text-muted-foreground hover:bg-accent transition-colors"
                          >
                            None
                          </button>
                        </div>

                        {colConfigs.map((col, i) => (
                          <div
                            key={col.original}
                            className={cn(
                              "flex flex-col gap-1 p-2 rounded-xl border min-w-32 transition-colors",
                              col.include
                                ? "border-border bg-muted/40"
                                : "border-border/40 bg-muted/10 opacity-50",
                            )}
                          >
                            {/* Include toggle */}
                            <div className="flex items-center justify-between gap-2">
                              <input
                                value={col.alias}
                                onChange={(e) =>
                                  setColConfigs((prev) =>
                                    prev.map((c, j) =>
                                      j === i
                                        ? { ...c, alias: e.target.value }
                                        : c,
                                    ),
                                  )
                                }
                                className="flex-1 bg-transparent text-[11px] font-medium text-foreground outline-none min-w-0 truncate"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setColConfigs((prev) =>
                                    prev.map((c, j) =>
                                      j === i
                                        ? { ...c, include: !c.include }
                                        : c,
                                    ),
                                  )
                                }
                                className={cn(
                                  "w-3.5 h-3.5 rounded-full flex-none border transition-colors",
                                  col.include
                                    ? "bg-emerald-500 border-emerald-500"
                                    : "bg-transparent border-muted-foreground",
                                )}
                              />
                            </div>

                            {/* Original name if renamed */}
                            {col.alias !== col.original && (
                              <span className="text-[9px] text-muted-foreground truncate font-mono">
                                ← {col.original}
                              </span>
                            )}

                            {/* Type selector */}
                            <div className="flex gap-1 flex-wrap">
                              {(
                                [
                                  "string",
                                  "number",
                                  "date",
                                  "boolean",
                                ] as ColType[]
                              ).map((t) => (
                                <button
                                  key={t}
                                  type="button"
                                  onClick={() =>
                                    setColConfigs((prev) =>
                                      prev.map((c, j) =>
                                        j === i ? { ...c, type: t } : c,
                                      ),
                                    )
                                  }
                                  className={cn(
                                    "text-[9px] px-1.5 py-0.5 rounded font-mono transition-opacity",
                                    col.type === t
                                      ? "opacity-100"
                                      : "opacity-30 hover:opacity-60",
                                    t === "number" &&
                                      "bg-emerald-500/15 text-emerald-400",
                                    t === "string" &&
                                      "bg-blue-500/15 text-blue-400",
                                    t === "date" &&
                                      "bg-purple-500/15 text-purple-400",
                                    t === "boolean" &&
                                      "bg-amber-500/15 text-amber-400",
                                  )}
                                >
                                  {t}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── Filter panel ── */}
              <AnimatePresence>
                {showFilterPanel && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="border-b border-border overflow-hidden"
                  >
                    <div className="p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Code2 className="w-3.5 h-3.5 text-amber-400 flex-none" />
                        <input
                          value={filterExpr}
                          onChange={(e) => setFilterExpr(e.target.value)}
                          placeholder="e.g.  STATUS = SUCCESS  or  AMOUNT > 1000  or  NAME LIKE %Ali%"
                          className="flex-1 h-8 px-3 text-xs bg-muted border border-border rounded-lg text-foreground placeholder:text-muted-foreground font-mono outline-none focus:border-amber-500/50"
                        />
                        {filterExpr && (
                          <button
                            type="button"
                            onClick={() => setFilterExpr("")}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground pl-5">
                        Syntax: <code className="font-mono">COL = value</code> ·{" "}
                        <code className="font-mono">COL &gt; 100</code> ·{" "}
                        <code className="font-mono">COL LIKE %text%</code> ·{" "}
                        <code className="font-mono">COL != value</code>
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── Parse errors ── */}
              {parsed.errors.length > 0 && (
                <div className="flex-none mx-4 mt-2 p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-none mt-0.5" />
                  <div className="text-[11px] text-amber-300 space-y-0.5">
                    {parsed.errors.map((e, i) => (
                      <p key={i}>{e}</p>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Data table ── */}
              <div className="flex-1 overflow-auto">
                {transformed.rows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                    <XCircle className="w-8 h-8 mb-2 opacity-30" />
                    <p className="text-sm">No rows match the current filter</p>
                  </div>
                ) : (
                  <table className="w-full border-collapse text-xs">
                    <thead className="sticky top-0 bg-muted/95 z-10 backdrop-blur">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground border-b border-r border-border w-10 text-[10px]">
                          #
                        </th>
                        {transformed.headers.map((h, i) => {
                          const cfg = colConfigs.find((c) => c.alias === h);
                          return (
                            <th
                              key={h}
                              className="px-3 py-2 text-left border-b border-r border-border whitespace-nowrap"
                            >
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-foreground text-[11px]">
                                  {h}
                                </span>
                                {cfg && <TypeBadge type={cfg.type} />}
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {transformed.rows.map((row, ri) => (
                        <tr
                          key={ri}
                          className={cn(
                            "border-b border-border/30 hover:bg-muted/40 transition-colors",
                            ri % 2 === 1 && "bg-muted/10",
                          )}
                        >
                          <td className="px-3 py-1.5 text-muted-foreground font-mono text-center border-r border-border/30 text-[10px]">
                            {ri + 1}
                          </td>
                          {transformed.headers.map((h) => {
                            const val = row[h];
                            const cfg = colConfigs.find((c) => c.alias === h);
                            return (
                              <td
                                key={h}
                                className={cn(
                                  "px-3 py-1.5 border-r border-border/20 font-mono whitespace-nowrap max-w-55 overflow-hidden text-ellipsis text-[11px]",
                                  val === null
                                    ? "text-muted-foreground/40 italic"
                                    : cfg?.type === "number"
                                      ? "text-emerald-300 text-right"
                                      : cfg?.type === "date"
                                        ? "text-purple-300"
                                        : cfg?.type === "boolean"
                                          ? "text-amber-300"
                                          : "text-foreground",
                                )}
                                title={val === null ? "NULL" : String(val)}
                              >
                                {val === null
                                  ? "NULL"
                                  : typeof val === "boolean"
                                    ? String(val)
                                    : String(val)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
