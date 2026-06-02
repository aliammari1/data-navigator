"use client";

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
  FolderOpen,
  Hash,
  Loader2,
  MousePointerClick,
  Play,
  RefreshCw,
  Settings2,
  Table2,
  Trash2,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Papa from "papaparse";
import { useCallback, useMemo, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import type { ColMeta, Dataset } from "@/core/stores/data-store";
import { useDataStore } from "@/core/stores/data-store";
import {
  type LoadedUploadTable,
  loadUploadPathToDuckDB,
  sanitizeUploadTableName,
  type UploadFileFormat,
} from "@/platform/duckdb/upload-to-duckdb";
import {
  isElectron,
  localDataPath,
  openFileDialog,
  writeLocalFile,
} from "@/platform/electron/electron-fs";
import { cn } from "@/shared/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type ColType = "string" | "number" | "date" | "boolean";

const LARGE_FILE_EDITOR_BYTES = 16 * 1024 * 1024;

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
  { label: "Auto", value: "" },
  { label: "Comma  ,", value: "," },
  { label: "Pipe  |", value: "|" },
  { label: "Tab", value: "\t" },
  { label: "Semicolon  ;", value: ";" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: ColType }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 font-mono text-[9px]",
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

function detectType(values: unknown[]): ColType {
  const nonNull = values.filter(
    (value) => value !== null && value !== undefined && value !== "",
  );

  if (nonNull.length === 0) return "string";

  let nums = 0;
  let dates = 0;
  let bools = 0;

  for (const value of nonNull) {
    const text = String(value).trim().toLowerCase();

    if (
      text === "true" ||
      text === "false" ||
      text === "1" ||
      text === "0" ||
      text === "yes" ||
      text === "no" ||
      text === "oui" ||
      text === "non"
    ) {
      bools += 1;
    } else if (!Number.isNaN(Number(text.replace(/,/g, ""))) && text !== "") {
      nums += 1;
    } else if (
      /^\d{4}-\d{2}-\d{2}/.test(text) ||
      /^\d{2}\/\d{2}\/\d{4}/.test(text)
    ) {
      dates += 1;
    }
  }

  const total = nonNull.length;

  if (nums / total > 0.85) return "number";
  if (dates / total > 0.85) return "date";
  if (bools / total > 0.85) return "boolean";

  return "string";
}

function castValue(value: unknown, type: ColType): unknown {
  if (value === null || value === undefined || value === "") return null;

  const text = String(value).trim();

  if (type === "number") {
    const numberValue = Number(text.replace(/,/g, ""));
    return Number.isNaN(numberValue) ? null : numberValue;
  }

  if (type === "boolean") {
    const normalized = text.toLowerCase();
    return (
      normalized === "true" ||
      normalized === "1" ||
      normalized === "yes" ||
      normalized === "oui"
    );
  }

  if (type === "date") {
    const date = new Date(text);
    return Number.isNaN(date.getTime())
      ? text
      : date.toISOString().slice(0, 10);
  }

  return text;
}

function applyFilter(row: Record<string, unknown>, filter: string): boolean {
  if (!filter.trim()) return true;

  try {
    const eqMatch = filter.match(/^(\w+)\s*(>=|<=|!=|=|>|<)\s*(.+)$/i);

    if (eqMatch) {
      const [, col, op, raw] = eqMatch;
      const value = row[col];
      const target = raw.trim().replace(/^['"]|['"]$/g, "");

      const a = String(value ?? "").toLowerCase();
      const b = target.toLowerCase();

      const numberA = Number(value);
      const numberB = Number(target);

      if (op === "=") return a === b;
      if (op === "!=") return a !== b;
      if (op === ">" && !Number.isNaN(numberA) && !Number.isNaN(numberB)) {
        return numberA > numberB;
      }
      if (op === "<" && !Number.isNaN(numberA) && !Number.isNaN(numberB)) {
        return numberA < numberB;
      }
      if (op === ">=" && !Number.isNaN(numberA) && !Number.isNaN(numberB)) {
        return numberA >= numberB;
      }
      if (op === "<=" && !Number.isNaN(numberA) && !Number.isNaN(numberB)) {
        return numberA <= numberB;
      }
    }

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

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";

  const text = String(value);

  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

function rowsToCSV(rows: Record<string, unknown>[], headers: string[]): string {
  const lines = [headers.map(csvEscape).join(",")];

  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(","));
  }

  return lines.join("\n");
}

function safeFileBase(value: string): string {
  return (
    value
      .replace(/\.[^.]+$/, "")
      .replace(/\W/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .toLowerCase()
      .slice(0, 80) || "parsed_data"
  );
}

function fileNameFromPath(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || "dataset";
}

function extensionFromPath(filePath: string): UploadFileFormat {
  return (fileNameFromPath(filePath).split(".").pop()?.toLowerCase() ||
    "csv") as UploadFileFormat;
}

function isSupportedDatasetPath(filePath: string): boolean {
  const lower = filePath.toLowerCase();

  return (
    lower.endsWith(".csv") ||
    lower.endsWith(".tsv") ||
    lower.endsWith(".txt") ||
    lower.endsWith(".parquet") ||
    lower.endsWith(".pq")
  );
}

function toColumnType(type: string): ColMeta["type"] {
  const normalized = type.toUpperCase();

  if (
    /INT|BIGINT|HUGEINT|TINYINT|SMALLINT|FLOAT|DOUBLE|DECIMAL|NUMERIC|REAL/.test(
      normalized,
    )
  ) {
    return "number";
  }

  if (/DATE|TIME|TIMESTAMP|INTERVAL/.test(normalized)) return "date";
  if (/BOOL/.test(normalized)) return "boolean";
  if (/VARCHAR|TEXT|CHAR|STRING|BLOB|UUID|ENUM/.test(normalized)) {
    return "string";
  }

  return "unknown";
}

function loadedToColMeta(loaded: LoadedUploadTable): ColMeta[] {
  return loaded.columns.map((column) => ({
    name: column.name,
    type: toColumnType(column.type),
    nullCount: column.nullCount,
    distinctCount: column.distinctCount,
    min: column.min,
    max: column.max,
    mean: column.mean,
    sample: column.sample,
  }));
}

function parsedColumnsToColMeta(
  columns: ColConfig[],
  rows: Record<string, unknown>[],
): ColMeta[] {
  return columns
    .filter((column) => column.include)
    .map((column) => ({
      name: column.alias,
      type: column.type,
      nullCount: rows.filter((row) => row[column.alias] === null).length,
      distinctCount: new Set(rows.map((row) => String(row[column.alias]))).size,
      sample: rows.slice(0, 5).map((row) => row[column.alias]),
    }));
}

function buildDatasetFromLoaded(
  loaded: LoadedUploadTable,
  options: {
    name: string;
    description: string;
    sizeBytes: number;
    tags?: string[];
  },
): Dataset {
  const columns = loadedToColMeta(loaded);

  return {
    id: loaded.datasetId,
    name: options.name,
    tableName: loaded.tableName,
    viewName: loaded.tableName,
    source: "upload",
    format: loaded.format,
    rowCount: loaded.rowCount,
    colCount: loaded.colCount,
    sizeBytes: options.sizeBytes,
    columns,
    tags: options.tags ?? [],
    description: options.description,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    qualityScore: 85,
  };
}

function arrayBufferFromText(text: string): ArrayBuffer {
  const bytes = new TextEncoder().encode(text);
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CsvParserScreen() {
  const { addDataset, setActiveDataset } = useDataStore();

  const [rawText, setRawText] = useState("");
  const [delimiter, setDelimiter] = useState("|");
  const [hasHeader, setHasHeader] = useState(true);
  const [skipEmpty, setSkipEmpty] = useState(true);
  const [trimWS, setTrimWS] = useState(true);

  const [parsed, setParsed] = useState<ParsedResult | null>(null);
  const [colConfigs, setColConfigs] = useState<ColConfig[]>([]);
  const [filterExpr, setFilterExpr] = useState("");
  const [previewLimit, setPreviewLimit] = useState(50);
  const [parsing, setParsing] = useState(false);

  const [datasetName, setDatasetName] = useState("parsed_data");
  const [loadingDB, setLoadingDB] = useState(false);
  const [loadedDataset, setLoadedDataset] = useState<{
    id: string;
    viewName: string;
    rows: number;
  } | null>(null);

  const [showColPanel, setShowColPanel] = useState(true);
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const registerLoadedDataset = useCallback(
    (loaded: LoadedUploadTable, sourceName: string, description: string) => {
      const dataset = buildDatasetFromLoaded(loaded, {
        name: sourceName,
        description,
        sizeBytes: rawText.length,
      });

      addDataset(dataset);
      setActiveDataset(dataset.id);
      setDatasetName(safeFileBase(sourceName));
      setLoadedDataset({
        id: dataset.id,
        viewName: dataset.tableName,
        rows: dataset.rowCount,
      });

      return dataset;
    },
    [addDataset, rawText.length, setActiveDataset],
  );

  const handleOpenLocalDataset = useCallback(async () => {
    if (!isElectron()) {
      toast.error("Local file import requires Electron.");
      return;
    }

    const selected = await openFileDialog({
      title: "Open dataset file",
      properties: ["openFile"],
      filters: [
        {
          name: "Data files",
          extensions: ["csv", "tsv", "txt", "parquet", "pq"],
        },
        {
          name: "Delimited files",
          extensions: ["csv", "tsv", "txt"],
        },
        {
          name: "Parquet files",
          extensions: ["parquet", "pq"],
        },
      ],
    });

    const filePath = selected[0];

    if (!filePath) return;

    if (!isSupportedDatasetPath(filePath)) {
      toast.error("Unsupported file. Use CSV, TSV, TXT, or Parquet.");
      return;
    }

    setLoadingDB(true);

    try {
      const fileName = fileNameFromPath(filePath);
      const extension = extensionFromPath(filePath);

      const loaded = await loadUploadPathToDuckDB(filePath, {
        tableName: sanitizeUploadTableName(fileName),
        displayName: safeFileBase(fileName),
        fileExtension: extension,
        hasHeader,
        delimiter: delimiter || undefined,
        previewLimit: 100,
      });

      registerLoadedDataset(
        loaded,
        loaded.displayName,
        "Imported from local file through the CSV parser workspace.",
      );

      setRawText("");
      setParsed(null);
      setColConfigs([]);
      toast.success(
        `Dataset loaded — ${loaded.rowCount.toLocaleString()} rows`,
      );
    } catch (error) {
      toast.error(`DuckDB error: ${String(error).slice(0, 120)}`);
    } finally {
      setLoadingDB(false);
    }
  }, [delimiter, hasHeader, registerLoadedDataset]);

  const onDrop = useCallback((files: File[]) => {
    const file = files[0];

    if (!file) return;

    if (file.size >= LARGE_FILE_EDITOR_BYTES) {
      toast.info(
        "Large files should be opened with the native file picker so DuckDB can read them directly from disk.",
      );
      return;
    }

    if (file.name.endsWith(".csv")) setDelimiter(",");

    const reader = new FileReader();

    reader.onload = (event) => {
      setRawText(String(event.target?.result ?? ""));
      setDatasetName(safeFileBase(file.name));
      setLoadedDataset(null);
      toast.success("File loaded into parser.");
    };

    reader.onerror = () => {
      toast.error("Could not read file.");
    };

    reader.readAsText(file, "UTF-8");
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "text/csv": [".csv", ".tsv", ".txt"] },
    noClick: rawText.length > 0,
    multiple: false,
  });

  const handleParse = useCallback(() => {
    if (!rawText.trim()) return;

    setParsing(true);
    setLoadedDataset(null);

    const start = performance.now();

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
                Object.entries(row).map(([key, value]) => [
                  key,
                  typeof value === "string" ? value.trim() : value,
                ]),
              ),
            )
          : raw;

        const headers = trimmed.length > 0 ? Object.keys(trimmed[0]) : [];
        const errors = result.errors.slice(0, 3).map((error) => error.message);

        const configs: ColConfig[] = headers.map((header) => ({
          original: header,
          alias: header,
          type: detectType(trimmed.slice(0, 200).map((row) => row[header])),
          include: true,
        }));

        setParsed({
          rows: trimmed,
          headers,
          errors,
          parseMs: Math.round(performance.now() - start),
        });

        setColConfigs(configs);
        setParsing(false);
      },
      error: (error: Error) => {
        toast.error(error.message);
        setParsing(false);
      },
    });
  }, [rawText, delimiter, hasHeader, skipEmpty, trimWS]);

  const transformed = useMemo(() => {
    if (!parsed) return { rows: [], headers: [] };

    const activeCols = colConfigs.filter((column) => column.include);
    const headers = activeCols.map((column) => column.alias);

    const rows = parsed.rows
      .filter((row) => applyFilter(row, filterExpr))
      .slice(0, previewLimit)
      .map((row) =>
        Object.fromEntries(
          activeCols.map((column) => [
            column.alias,
            castValue(row[column.original], column.type),
          ]),
        ),
      );

    return { rows, headers };
  }, [parsed, colConfigs, filterExpr, previewLimit]);

  const allTransformed = useMemo(() => {
    if (!parsed) return { rows: [], headers: [] };

    const activeCols = colConfigs.filter((column) => column.include);
    const headers = activeCols.map((column) => column.alias);

    const rows = parsed.rows
      .filter((row) => applyFilter(row, filterExpr))
      .map((row) =>
        Object.fromEntries(
          activeCols.map((column) => [
            column.alias,
            castValue(row[column.original], column.type),
          ]),
        ),
      );

    return { rows, headers };
  }, [parsed, colConfigs, filterExpr]);

  const handleExport = useCallback(() => {
    const { rows, headers } = allTransformed;

    if (rows.length === 0) return;

    const csv = rowsToCSV(rows, headers);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = `${safeFileBase(datasetName)}.csv`;
    anchor.click();

    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length.toLocaleString()} rows`);
  }, [allTransformed, datasetName]);

  const handleLoadDB = useCallback(async () => {
    const { rows, headers } = allTransformed;

    if (rows.length === 0 || !datasetName.trim()) return;

    if (!isElectron()) {
      toast.error("DuckDB dataset registration requires Electron.");
      return;
    }

    setLoadingDB(true);

    try {
      const safeName = safeFileBase(datasetName);
      const csv = rowsToCSV(rows, headers);
      const filePath = await localDataPath(
        `imports/${safeName}_${Date.now()}.csv`,
      );

      await writeLocalFile(filePath, arrayBufferFromText(csv));

      const loaded = await loadUploadPathToDuckDB(filePath, {
        tableName: safeName,
        displayName: safeName,
        fileExtension: "csv",
        hasHeader: true,
        delimiter: ",",
        previewLimit: 100,
      });

      const dsCols = parsedColumnsToColMeta(colConfigs, rows);

      const dataset: Dataset = {
        id: loaded.datasetId,
        name: safeName,
        tableName: loaded.tableName,
        viewName: loaded.tableName,
        source: "upload",
        format: "csv",
        rowCount: rows.length,
        colCount: headers.length,
        sizeBytes: csv.length,
        columns: dsCols,
        tags: ["parsed"],
        description: "Loaded from Advanced CSV Parser",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        qualityScore: 85,
      };

      addDataset(dataset);
      setActiveDataset(dataset.id);
      setLoadedDataset({
        id: dataset.id,
        viewName: dataset.tableName,
        rows: dataset.rowCount,
      });

      toast.success(
        `Dataset loaded — ${rows.length.toLocaleString()} rows in DuckDB`,
      );
    } catch (error) {
      toast.error(`DuckDB error: ${String(error).slice(0, 120)}`);
    } finally {
      setLoadingDB(false);
    }
  }, [allTransformed, datasetName, colConfigs, addDataset, setActiveDataset]);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      setRawText(text);
      setLoadedDataset(null);
      toast.success("Pasted from clipboard");
    } catch {
      textareaRef.current?.focus();
      toast.info("Press Ctrl+V to paste");
    }
  }, []);

  const includedCount = colConfigs.filter((column) => column.include).length;

  const filteredTotal = useMemo(() => {
    if (!parsed) return 0;
    return parsed.rows.filter((row) => applyFilter(row, filterExpr)).length;
  }, [parsed, filterExpr]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background text-foreground">
      <div className="flex-none border-b border-border px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10">
            <FileText className="h-4 w-4 text-emerald-400" />
          </div>

          <div>
            <h1 className="text-sm font-semibold text-foreground">
              Advanced CSV Parser
            </h1>
            <p className="text-[10px] text-muted-foreground">
              Paste, clean, retype, filter, export, or register as a DuckDB
              dataset.
            </p>
          </div>

          <div className="flex-1" />

          <button
            type="button"
            onClick={handleOpenLocalDataset}
            disabled={loadingDB}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            {loadingDB ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FolderOpen className="h-3.5 w-3.5" />
            )}
            Open local dataset
          </button>

          {parsed && (
            <div className="hidden items-center gap-2 text-[11px] text-muted-foreground md:flex">
              <span className="flex items-center gap-1">
                <Hash className="h-3 w-3" />
                {filteredTotal.toLocaleString()} rows
              </span>
              <span>·</span>
              <span>{includedCount} cols</span>
              <span>·</span>
              <span className="text-emerald-400">{parsed.parseMs}ms</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-84 flex-none flex-col border-r border-border">
          <div
            {...getRootProps()}
            className={cn(
              "relative mx-3 mt-3 rounded-xl border-2 border-dashed transition-colors",
              isDragActive
                ? "border-emerald-500 bg-emerald-500/5"
                : "border-border",
            )}
          >
            <input {...getInputProps()} />

            <textarea
              ref={textareaRef}
              value={rawText}
              onChange={(event) => {
                setRawText(event.target.value);
                setLoadedDataset(null);
              }}
              placeholder={`Paste delimited text here…

Or drop a small .csv / .tsv / .txt file.

For large files, use "Open local dataset" so DuckDB reads directly from disk.

Example:
ID|NAME|AMOUNT
1|Alice|5000.00
2|Bob|3200.50`}
              className="h-56 w-full resize-none rounded-xl bg-transparent p-3 font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground/50"
              spellCheck={false}
            />

            {isDragActive && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-emerald-500/10">
                <p className="text-sm font-medium text-emerald-400">
                  Drop small text file here
                </p>
              </div>
            )}
          </div>

          <div className="mt-2 flex gap-2 px-3">
            <button
              type="button"
              onClick={handlePaste}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-muted px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Clipboard className="h-3 w-3" />
              Paste
            </button>

            <button
              type="button"
              onClick={() => {
                setRawText("");
                setParsed(null);
                setColConfigs([]);
                setLoadedDataset(null);
              }}
              disabled={!rawText && !parsed}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-muted px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
            >
              <Trash2 className="h-3 w-3" />
              Clear
            </button>
          </div>

          <div className="mt-3 space-y-2.5 border-b border-border px-3 pb-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Parse Settings
            </p>

            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">
                Delimiter
              </label>

              <div className="grid grid-cols-2 gap-1">
                {DELIMITERS.map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => setDelimiter(option.value)}
                    className={cn(
                      "rounded-lg border px-2 py-1 text-[10px] transition-colors",
                      delimiter === option.value
                        ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              {[
                {
                  key: "header",
                  label: "First row is header",
                  value: hasHeader,
                  setValue: setHasHeader,
                },
                {
                  key: "empty",
                  label: "Skip empty lines",
                  value: skipEmpty,
                  setValue: setSkipEmpty,
                },
                {
                  key: "trim",
                  label: "Trim whitespace",
                  value: trimWS,
                  setValue: setTrimWS,
                },
              ].map(({ key, label, value, setValue }) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-2"
                >
                  <button
                    type="button"
                    onClick={() => setValue((current) => !current)}
                    className={cn(
                      "relative h-4 w-8 rounded-full transition-colors",
                      value
                        ? "bg-emerald-500"
                        : "border border-border bg-muted",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform",
                        value ? "translate-x-1" : "-translate-x-3",
                      )}
                    />
                  </button>

                  <span className="text-[11px] text-muted-foreground">
                    {label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="mt-3 px-3">
            <button
              type="button"
              onClick={handleParse}
              disabled={!rawText.trim() || parsing}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {parsing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {parsing ? "Parsing…" : "Parse"}
            </button>
          </div>

          {parsed && (
            <div className="mt-3 space-y-2 px-3 pb-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Register as DuckDB dataset
              </p>

              <div className="flex gap-2">
                <input
                  value={datasetName}
                  onChange={(event) => setDatasetName(event.target.value)}
                  placeholder="dataset_name"
                  className="h-8 flex-1 rounded-lg border border-border bg-muted px-2.5 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-emerald-500/50"
                />

                <button
                  type="button"
                  onClick={handleLoadDB}
                  disabled={loadingDB || allTransformed.rows.length === 0}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
                >
                  {loadingDB ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Database className="h-3 w-3" />
                  )}
                  Load
                </button>
              </div>

              {loadedDataset && (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-2">
                  <div className="flex items-center gap-2">
                    <Check className="h-3 w-3 text-emerald-400" />
                    <span className="text-[11px] text-emerald-300">
                      Dataset ready
                    </span>
                  </div>
                  <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                    {loadedDataset.viewName} ·{" "}
                    {loadedDataset.rows.toLocaleString()} rows
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={handleExport}
                disabled={allTransformed.rows.length === 0}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
              >
                <Download className="h-3 w-3" />
                Export CSV ({allTransformed.rows.length.toLocaleString()} rows)
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col overflow-hidden">
          {!parsed ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-muted">
                <Table2 className="h-7 w-7 text-muted-foreground" />
              </div>

              <div>
                <p className="text-base font-semibold text-foreground">
                  No parsed data yet
                </p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Paste delimited text, drop a small CSV/TSV/TXT file, or open a
                  local dataset directly through DuckDB.
                </p>
              </div>

              <div className="flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
                {[
                  "Rename columns",
                  "Change types",
                  "Filter rows",
                  "Export CSV",
                  "Register dataset",
                ].map((feature) => (
                  <span
                    key={feature}
                    className="flex items-center gap-1 rounded-lg border border-border bg-muted px-2.5 py-1"
                  >
                    <Check className="h-3 w-3 text-emerald-400" />
                    {feature}
                  </span>
                ))}
              </div>

              <button
                type="button"
                onClick={handleOpenLocalDataset}
                className="mt-2 flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-500"
              >
                <Upload className="h-3.5 w-3.5" />
                Open local dataset
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-none items-center gap-3 border-b border-border px-4 py-2">
                <button
                  type="button"
                  onClick={() => setShowColPanel((value) => !value)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors",
                    showColPanel
                      ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-300"
                      : "border-border text-muted-foreground hover:bg-accent",
                  )}
                >
                  <Settings2 className="h-3 w-3" />
                  Columns ({includedCount}/{colConfigs.length})
                  {showColPanel ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setShowFilterPanel((value) => !value)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors",
                    showFilterPanel || filterExpr
                      ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                      : "border-border text-muted-foreground hover:bg-accent",
                  )}
                >
                  <Filter className="h-3 w-3" />
                  Filter
                  {filterExpr && (
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  )}
                  {showFilterPanel ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </button>

                <div className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Eye className="h-3 w-3" />
                  <span>Preview:</span>
                  {[50, 200, 500].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setPreviewLimit(value)}
                      className={cn(
                        "rounded px-2 py-0.5 text-[10px] transition-colors",
                        previewLimit === value
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {value}
                    </button>
                  ))}
                  <span className="ml-1">
                    of {filteredTotal.toLocaleString()}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleParse}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent"
                >
                  <RefreshCw className="h-3 w-3" />
                  Re-parse
                </button>
              </div>

              <AnimatePresence>
                {showColPanel && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="overflow-hidden border-b border-border"
                  >
                    <div className="overflow-x-auto p-3">
                      <div className="flex min-w-max gap-1.5">
                        <div className="mr-2 flex gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              setColConfigs((columns) =>
                                columns.map((column) => ({
                                  ...column,
                                  include: true,
                                })),
                              )
                            }
                            className="rounded-lg border border-border px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-accent"
                          >
                            All
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setColConfigs((columns) =>
                                columns.map((column) => ({
                                  ...column,
                                  include: false,
                                })),
                              )
                            }
                            className="rounded-lg border border-border px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-accent"
                          >
                            None
                          </button>
                        </div>

                        {colConfigs.map((column, index) => (
                          <div
                            key={column.original}
                            className={cn(
                              "flex min-w-32 flex-col gap-1 rounded-xl border p-2 transition-colors",
                              column.include
                                ? "border-border bg-muted/40"
                                : "border-border/40 bg-muted/10 opacity-50",
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <input
                                value={column.alias}
                                onChange={(event) =>
                                  setColConfigs((previous) =>
                                    previous.map((item, itemIndex) =>
                                      itemIndex === index
                                        ? {
                                            ...item,
                                            alias: event.target.value,
                                          }
                                        : item,
                                    ),
                                  )
                                }
                                className="min-w-0 flex-1 truncate bg-transparent text-[11px] font-medium text-foreground outline-none"
                              />

                              <button
                                type="button"
                                onClick={() =>
                                  setColConfigs((previous) =>
                                    previous.map((item, itemIndex) =>
                                      itemIndex === index
                                        ? {
                                            ...item,
                                            include: !item.include,
                                          }
                                        : item,
                                    ),
                                  )
                                }
                                className={cn(
                                  "h-3.5 w-3.5 flex-none rounded-full border transition-colors",
                                  column.include
                                    ? "border-emerald-500 bg-emerald-500"
                                    : "border-muted-foreground bg-transparent",
                                )}
                              />
                            </div>

                            {column.alias !== column.original && (
                              <span className="truncate font-mono text-[9px] text-muted-foreground">
                                ← {column.original}
                              </span>
                            )}

                            <div className="flex flex-wrap gap-1">
                              {(
                                [
                                  "string",
                                  "number",
                                  "date",
                                  "boolean",
                                ] as ColType[]
                              ).map((type) => (
                                <button
                                  key={type}
                                  type="button"
                                  onClick={() =>
                                    setColConfigs((previous) =>
                                      previous.map((item, itemIndex) =>
                                        itemIndex === index
                                          ? { ...item, type }
                                          : item,
                                      ),
                                    )
                                  }
                                  className={cn(
                                    "rounded px-1.5 py-0.5 font-mono text-[9px] transition-opacity",
                                    column.type === type
                                      ? "opacity-100"
                                      : "opacity-30 hover:opacity-60",
                                    type === "number" &&
                                      "bg-emerald-500/15 text-emerald-400",
                                    type === "string" &&
                                      "bg-blue-500/15 text-blue-400",
                                    type === "date" &&
                                      "bg-purple-500/15 text-purple-400",
                                    type === "boolean" &&
                                      "bg-amber-500/15 text-amber-400",
                                  )}
                                >
                                  {type}
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

              <AnimatePresence>
                {showFilterPanel && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="overflow-hidden border-b border-border"
                  >
                    <div className="space-y-2 p-3">
                      <div className="flex items-center gap-2">
                        <Code2 className="h-3.5 w-3.5 flex-none text-amber-400" />

                        <input
                          value={filterExpr}
                          onChange={(event) =>
                            setFilterExpr(event.target.value)
                          }
                          placeholder="e.g. STATUS = SUCCESS or AMOUNT > 1000 or NAME LIKE %Ali%"
                          className="h-8 flex-1 rounded-lg border border-border bg-muted px-3 font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-amber-500/50"
                        />

                        {filterExpr && (
                          <button
                            type="button"
                            onClick={() => setFilterExpr("")}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      <p className="pl-5 text-[10px] text-muted-foreground">
                        Syntax: <code className="font-mono">COL = value</code> ·{" "}
                        <code className="font-mono">COL &gt; 100</code> ·{" "}
                        <code className="font-mono">COL LIKE %text%</code> ·{" "}
                        <code className="font-mono">COL != value</code>
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {parsed.errors.length > 0 && (
                <div className="mx-4 mt-2 flex flex-none items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 p-2.5">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none text-amber-400" />
                  <div className="space-y-0.5 text-[11px] text-amber-300">
                    {parsed.errors.map((error) => (
                      <p key={error}>{error}</p>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex-1 overflow-auto">
                {transformed.rows.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                    <XCircle className="mb-2 h-8 w-8 opacity-30" />
                    <p className="text-sm">No rows match the current filter</p>
                  </div>
                ) : (
                  <table className="w-full border-collapse text-xs">
                    <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                      <tr>
                        <th className="w-10 border-b border-r border-border px-3 py-2 text-left text-[10px] font-medium text-muted-foreground">
                          #
                        </th>

                        {transformed.headers.map((header) => {
                          const config = colConfigs.find(
                            (column) => column.alias === header,
                          );

                          return (
                            <th
                              key={header}
                              className="whitespace-nowrap border-b border-r border-border px-3 py-2 text-left"
                            >
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] font-medium text-foreground">
                                  {header}
                                </span>
                                {config && <TypeBadge type={config.type} />}
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>

                    <tbody>
                      {transformed.rows.map((row, rowIndex) => (
                        <tr
                          key={rowIndex}
                          className={cn(
                            "border-b border-border/30 transition-colors hover:bg-muted/40",
                            rowIndex % 2 === 1 && "bg-muted/10",
                          )}
                        >
                          <td className="border-r border-border/30 px-3 py-1.5 text-center font-mono text-[10px] text-muted-foreground">
                            {rowIndex + 1}
                          </td>

                          {transformed.headers.map((header) => {
                            const value = row[header];
                            const config = colConfigs.find(
                              (column) => column.alias === header,
                            );

                            return (
                              <td
                                key={header}
                                className={cn(
                                  "max-w-55 overflow-hidden text-ellipsis whitespace-nowrap border-r border-border/20 px-3 py-1.5 font-mono text-[11px]",
                                  value === null
                                    ? "text-muted-foreground/40 italic"
                                    : config?.type === "number"
                                      ? "text-right text-emerald-300"
                                      : config?.type === "date"
                                        ? "text-purple-300"
                                        : config?.type === "boolean"
                                          ? "text-amber-300"
                                          : "text-foreground",
                                )}
                                title={value === null ? "NULL" : String(value)}
                              >
                                {value === null
                                  ? "NULL"
                                  : typeof value === "boolean"
                                    ? String(value)
                                    : String(value)}
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
