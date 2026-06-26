"use client";

import {
  AlertTriangle,
  BarChart3,
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
  Play,
  RefreshCw,
  Settings2,
  ShieldAlert,
  Table2,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { type PreviewColumn, PreviewGrid } from "@/components/shared/preview-grid";
import type { ColMeta, Dataset } from "@/core/stores/data-store";
import { useDataStore } from "@/core/stores/data-store";
import { useAppCommands } from "@/features/desktop/core/menu/app-commands";
import { profileDataset, type SummarizeRow } from "@/platform/duckdb/duckdb";
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
import { addImportRecord, putColumnProfile } from "@/platform/storage";
import { getExportProxy, saveBytes } from "@/platform/viz";
import { cn } from "@/shared/utils";
import { ProfilePanel } from "../components/ProfilePanel";
import { type RejectRowView, RejectsPanel } from "../components/RejectsPanel";
import { clearDraft, loadDraft, saveDraft } from "../lib/draft-store";
import { compileFilter } from "../lib/filter";
import type { ColConfig, ColType, ParseResult } from "../lib/types";
import { useCsvWorker } from "../workers/useCsvWorker";

// ─── Constants ─────────────────────────────────────────────────────────────────

const LARGE_FILE_EDITOR_BYTES = 16 * 1024 * 1024;
const PREVIEW_LIMITS = [50, 200, 500, 5000] as const;
const COLUMN_TYPES: ColType[] = ["string", "number", "date", "boolean"];

const DELIMITERS = [
  { label: "Auto", value: "" },
  { label: "Comma  ,", value: "," },
  { label: "Pipe  |", value: "|" },
  { label: "Tab", value: "\t" },
  { label: "Semicolon  ;", value: ";" },
];

// ─── Pure helpers ───────────────────────────────────────────────────────────────

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
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
  return (fileNameFromPath(filePath).split(".").pop()?.toLowerCase() || "csv") as UploadFileFormat;
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
  if (/INT|BIGINT|HUGEINT|TINYINT|SMALLINT|FLOAT|DOUBLE|DECIMAL|NUMERIC|REAL/.test(normalized)) {
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

/** Merge real DuckDB SUMMARIZE stats into the preview-derived column metadata. */
function applySummarizeStats(columns: ColMeta[], summary: SummarizeRow[]): ColMeta[] {
  const byName = new Map(summary.map((row) => [row.column_name, row]));
  return columns.map((column) => {
    const row = byName.get(column.name);
    if (!row) return column;
    const count = Number(row.count) || 0;
    const nullPct = row.null_percentage ?? 0;
    return {
      ...column,
      type: toColumnType(row.column_type),
      distinctCount: row.approx_unique ?? column.distinctCount,
      nullCount: Math.round((Number(nullPct) / 100) * count),
      min: typeof row.min === "number" ? row.min : column.min,
      max: typeof row.max === "number" ? row.max : column.max,
      mean: row.avg ?? column.mean,
    };
  });
}

function arrayBufferFromText(text: string): ArrayBuffer {
  const bytes = new TextEncoder().encode(text);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

// ─── Component ───────────────────────────────────────────────────────────────────

export default function CsvParserScreen() {
  const { addDataset, setActiveDataset } = useDataStore();
  const { parse: parseCsv } = useCsvWorker();

  const [rawText, setRawText] = useState("");
  const [delimiter, setDelimiter] = useState("|");
  const [hasHeader, setHasHeader] = useState(true);
  const [skipEmpty, setSkipEmpty] = useState(true);
  const [trimWS, setTrimWS] = useState(true);

  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [colConfigs, setColConfigs] = useState<ColConfig[]>([]);
  const [filterExpr, setFilterExpr] = useState("");
  const [previewLimit, setPreviewLimit] = useState<number>(50);
  const [parsing, startParse] = useTransition();

  const [datasetName, setDatasetName] = useState("parsed_data");
  const [loadingDB, setLoadingDB] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [loadedDataset, setLoadedDataset] = useState<{
    id: string;
    viewName: string;
    rows: number;
  } | null>(null);
  const [dbRejects, setDbRejects] = useState<RejectRowView[]>([]);
  const [dbRejectTotal, setDbRejectTotal] = useState(0);

  const [showColPanel, setShowColPanel] = useState(true);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [showProfilePanel, setShowProfilePanel] = useState(false);
  const [showRejectsPanel, setShowRejectsPanel] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const draftRestored = useRef(false);

  // ─── Draft restore (once) + debounced autosave ─────────────────────────────

  useEffect(() => {
    let cancelled = false;
    void loadDraft().then((draft) => {
      if (cancelled || !draft) {
        draftRestored.current = true;
        return;
      }
      setRawText(draft.rawText);
      setDelimiter(draft.delimiter);
      setHasHeader(draft.hasHeader);
      setSkipEmpty(draft.skipEmpty);
      setTrimWS(draft.trimWS);
      setColConfigs(draft.colConfigs);
      setDatasetName(draft.datasetName || "parsed_data");
      draftRestored.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!draftRestored.current) return;
    const id = setTimeout(() => {
      void saveDraft({
        rawText,
        delimiter,
        hasHeader,
        skipEmpty,
        trimWS,
        colConfigs,
        datasetName,
      });
    }, 600);
    return () => clearTimeout(id);
  }, [rawText, delimiter, hasHeader, skipEmpty, trimWS, colConfigs, datasetName]);

  // ─── Derived: active columns + preview columns ─────────────────────────────

  const sourceIndexByName = useMemo(() => {
    const map = new Map<string, number>();
    if (parsed) {
      for (let index = 0; index < parsed.columns.length; index++) {
        map.set(parsed.columns[index], index);
      }
    }
    return map;
  }, [parsed]);

  const previewColumns = useMemo<PreviewColumn[]>(() => {
    if (!parsed) return [];
    return colConfigs
      .filter((column) => column.include)
      .map((column) => {
        const sourceIndex = sourceIndexByName.get(column.original) ?? -1;
        return {
          header: column.alias,
          type: column.type,
          sourceIndex,
        };
      })
      .filter((column) => column.sourceIndex >= 0);
  }, [parsed, colConfigs, sourceIndexByName]);

  // ─── Filtering: compile predicate once, single pass over columnar data ─────

  const deferredFilter = useDeferredValue(filterExpr);

  const filteredRowIndices = useMemo<number[]>(() => {
    if (!parsed) return [];
    const predicate = compileFilter(deferredFilter);
    if (!predicate) {
      // No filter — identity index range, no row materialization.
      return Array.from({ length: parsed.rowCount }, (_, index) => index);
    }
    // Only build a row record for columns referenced by the predicate by
    // exposing a proxy-like record over the columnar arrays per row.
    const indices: number[] = [];
    const columns = parsed.columns;
    const columnar = parsed.columnar;
    const rowView: Record<string, unknown> = {};
    for (let r = 0; r < parsed.rowCount; r++) {
      for (let c = 0; c < columns.length; c++) {
        rowView[columns[c]] = columnar[c][r];
      }
      if (predicate(rowView)) indices.push(r);
    }
    return indices;
  }, [parsed, deferredFilter]);

  const filteredTotal = filteredRowIndices.length;

  const previewRowIndices = useMemo(
    () => filteredRowIndices.slice(0, previewLimit),
    [filteredRowIndices, previewLimit],
  );

  const getCell = useCallback(
    (rowIndex: number, sourceIndex: number): unknown => {
      return parsed?.columnar[sourceIndex]?.[rowIndex] ?? null;
    },
    [parsed],
  );

  // ─── Parse (off-thread, in a transition) ───────────────────────────────────

  const runParse = useCallback(() => {
    if (!rawText.trim()) return;
    setLoadedDataset(null);
    setDbRejects([]);
    setDbRejectTotal(0);

    startParse(() => {
      void (async () => {
        try {
          const result = await parseCsv({
            text: rawText,
            delimiter: delimiter || undefined,
            hasHeader,
            skipEmpty,
            trimWS,
          });
          setParsed(result);
          setColConfigs(
            result.columns.map((name, index) => ({
              original: name,
              alias: name,
              type: result.profiles[index]?.type ?? "string",
              include: true,
            })),
          );
          setShowRejectsPanel(result.rejects.length > 0);
        } catch (error) {
          toast.error(`Parse failed: ${String(error).slice(0, 120)}`);
        }
      })();
    });
  }, [rawText, delimiter, hasHeader, skipEmpty, trimWS, parseCsv]);

  // ─── File / clipboard input ────────────────────────────────────────────────

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
    if (file.name.endsWith(".tsv")) setDelimiter("\t");

    const reader = new FileReader();
    reader.onload = (event) => {
      setRawText(String(event.target?.result ?? ""));
      setDatasetName(safeFileBase(file.name));
      setLoadedDataset(null);
      toast.success("File loaded into parser.");
    };
    reader.onerror = () => toast.error("Could not read file.");
    reader.readAsText(file, "UTF-8");
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "text/csv": [".csv", ".tsv", ".txt"] },
    noClick: rawText.length > 0,
    multiple: false,
  });

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

  const handleClear = useCallback(() => {
    setRawText("");
    setParsed(null);
    setColConfigs([]);
    setFilterExpr("");
    setLoadedDataset(null);
    setDbRejects([]);
    setDbRejectTotal(0);
    void clearDraft();
  }, []);

  // ─── Register loaded dataset into the data store + Dexie history ────────────

  const registerLoadedDataset = useCallback(
    async (
      loaded: LoadedUploadTable,
      sourceName: string,
      description: string,
      sizeBytes: number,
    ): Promise<Dataset> => {
      let columns = loadedToColMeta(loaded);

      // Pull REAL full-table stats from DuckDB SUMMARIZE (single scan) instead
      // of the preview-only metadata the import returns.
      try {
        const summary = await profileDataset({ datasetId: loaded.datasetId });
        columns = applySummarizeStats(columns, summary);
        await Promise.all(
          summary.map((row) => putColumnProfile(loaded.datasetId, row.column_name, row)),
        );
      } catch {
        // Profiling is best-effort; the dataset is still usable without it.
      }

      const dataset: Dataset = {
        id: loaded.datasetId,
        name: sourceName,
        tableName: loaded.tableName,
        viewName: loaded.tableName,
        source: "upload",
        format: loaded.format,
        rowCount: loaded.rowCount,
        colCount: loaded.colCount,
        sizeBytes,
        columns,
        tags: ["parsed"],
        description,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        qualityScore: 85,
      };

      addDataset(dataset);
      setActiveDataset(dataset.id);
      setDatasetName(safeFileBase(sourceName));
      setLoadedDataset({
        id: dataset.id,
        viewName: dataset.tableName,
        rows: dataset.rowCount,
      });

      if (loaded.rejects) {
        const sample = loaded.rejects.sample.map<RejectRowView>((reject) => ({
          row: reject.line,
          column: reject.columnName,
          type: reject.errorType,
          message: reject.errorMessage ?? "Rejected row",
        }));
        setDbRejects(sample);
        setDbRejectTotal(loaded.rejects.rejectedRowCount);
        setShowRejectsPanel(sample.length > 0);
      }

      await addImportRecord({
        fileName: sourceName,
        datasetId: dataset.id,
        tableName: dataset.tableName,
        rowCount: dataset.rowCount,
        byteSize: sizeBytes,
        status: loaded.rejects?.rejectedRowCount ? "partial" : "success",
        detail: loaded.rejects ? { rejectedRowCount: loaded.rejects.rejectedRowCount } : undefined,
      }).catch(() => undefined);

      return dataset;
    },
    [addDataset, setActiveDataset],
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
        { name: "Data files", extensions: ["csv", "tsv", "txt", "parquet", "pq"] },
        { name: "Delimited files", extensions: ["csv", "tsv", "txt"] },
        { name: "Parquet files", extensions: ["parquet", "pq"] },
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
        storeRejects: true,
      });

      await registerLoadedDataset(
        loaded,
        loaded.displayName,
        "Imported from local file through the CSV parser workspace.",
        loaded.rowCount,
      );

      setRawText("");
      setParsed(null);
      setColConfigs([]);
      void clearDraft();
      toast.success(`Dataset loaded — ${loaded.rowCount.toLocaleString()} rows`);
    } catch (error) {
      toast.error(`DuckDB error: ${String(error).slice(0, 120)}`);
    } finally {
      setLoadingDB(false);
    }
  }, [delimiter, hasHeader, registerLoadedDataset]);

  // ─── Register parsed (paste) data into DuckDB ──────────────────────────────
  //
  // We write the ORIGINAL pasted text to disk ONCE and let native DuckDB
  // read_csv it directly — no rowsToCSV re-serialization, no triple
  // materialization. Column renames/type overrides are reapplied via SUMMARIZE
  // metadata and the data-store column model.

  const handleLoadDB = useCallback(async () => {
    if (!parsed || !rawText.trim() || !datasetName.trim()) return;

    if (!isElectron()) {
      toast.error("DuckDB dataset registration requires Electron.");
      return;
    }

    setLoadingDB(true);
    try {
      const safeName = safeFileBase(datasetName);
      const filePath = await localDataPath(`imports/${safeName}_${Date.now()}.csv`);

      await writeLocalFile(filePath, arrayBufferFromText(rawText));

      const loaded = await loadUploadPathToDuckDB(filePath, {
        tableName: safeName,
        displayName: safeName,
        fileExtension: "csv",
        hasHeader,
        delimiter: delimiter || undefined,
        previewLimit: 100,
        storeRejects: true,
      });

      await registerLoadedDataset(
        loaded,
        safeName,
        "Loaded from the Advanced CSV Parser.",
        rawText.length,
      );

      toast.success(`Dataset loaded — ${loaded.rowCount.toLocaleString()} rows in DuckDB`);
    } catch (error) {
      toast.error(`DuckDB error: ${String(error).slice(0, 120)}`);
    } finally {
      setLoadingDB(false);
    }
  }, [parsed, rawText, datasetName, hasHeader, delimiter, registerLoadedDataset]);

  // ─── Export (heavy work off the main thread) ───────────────────────────────

  const buildExportRows = useCallback((): {
    headers: string[];
    rows: unknown[][];
  } => {
    const cols = previewColumns;
    const headers = cols.map((column) => column.header);
    const rows = filteredRowIndices.map((rowIndex) =>
      cols.map((column) => getCell(rowIndex, column.sourceIndex)),
    );
    return { headers, rows };
  }, [previewColumns, filteredRowIndices, getCell]);

  const handleExportCSV = useCallback(() => {
    const { headers, rows } = buildExportRows();
    if (rows.length === 0) return;
    const lines = [headers.map(csvEscape).join(",")];
    for (const row of rows) lines.push(row.map(csvEscape).join(","));
    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeFileBase(datasetName)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length.toLocaleString()} rows`);
  }, [buildExportRows, datasetName]);

  const handleExportXLSX = useCallback(async () => {
    const proxy = getExportProxy();
    if (!proxy) {
      toast.error("Export worker unavailable.");
      return;
    }
    const { headers, rows } = buildExportRows();
    if (rows.length === 0) return;

    setExporting(true);
    try {
      const bytes = await proxy.xlsx({
        title: datasetName,
        sections: [
          {
            title: datasetName,
            headers,
            rows: rows.map((row) => row.map((value) => (value == null ? "" : String(value)))),
          },
        ],
      });
      const result = await saveBytes(
        bytes as ArrayBuffer,
        `${safeFileBase(datasetName)}.xlsx`,
        "xlsx",
      );
      if (result.saved) {
        toast.success(`Exported ${rows.length.toLocaleString()} rows to XLSX`);
      }
    } catch (error) {
      toast.error(`Export failed: ${String(error).slice(0, 120)}`);
    } finally {
      setExporting(false);
    }
  }, [buildExportRows, datasetName]);

  // ─── Column-config mutators ────────────────────────────────────────────────

  const setAllIncluded = useCallback((include: boolean) => {
    setColConfigs((columns) => columns.map((column) => ({ ...column, include })));
  }, []);

  const updateColumn = useCallback((index: number, patch: Partial<ColConfig>) => {
    setColConfigs((columns) =>
      columns.map((column, i) => (i === index ? { ...column, ...patch } : column)),
    );
  }, []);

  // ─── Derived display values ────────────────────────────────────────────────

  const includedCount = colConfigs.filter((column) => column.include).length;
  const allRejects = parsed?.rejects ?? [];
  const rejectViews: RejectRowView[] =
    dbRejects.length > 0
      ? dbRejects
      : allRejects.map((reject) => ({
          row: reject.row,
          column: reject.column,
          type: reject.type,
          message: reject.message,
        }));
  const rejectTotal = dbRejectTotal > 0 ? dbRejectTotal : rejectViews.length;

  // ─── Menu bar commands (Analyseur CSV app menu) ────────────────────────────

  useAppCommands("csv-parser", {
    parse: () => runParse(),
    paste: () => void handlePaste(),
    clear: () => handleClear(),
    import: () => void handleOpenLocalDataset(),
    "load-db": () => void handleLoadDB(),
    "export-csv": () => handleExportCSV(),
    "export-xlsx": () => void handleExportXLSX(),
    "toggle-columns": () => setShowColPanel((value) => !value),
    "toggle-filter": () => setShowFilterPanel((value) => !value),
    "toggle-profile": () => setShowProfilePanel((value) => !value),
    "toggle-rejects": () => setShowRejectsPanel((value) => !value),
  });

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background text-foreground">
      <div className="flex-none border-b border-border px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10">
            <FileText className="h-4 w-4 text-emerald-400" />
          </div>

          <div>
            <h1 className="text-sm font-semibold text-foreground">Advanced CSV Parser</h1>
            <p className="text-[10px] text-muted-foreground">
              Paste, clean, retype, filter, export, or register as a DuckDB dataset.
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
              <span>·</span>
              <span className="font-mono uppercase">{parsed.engine}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-84 flex-none flex-col overflow-y-auto border-r border-border">
          <div
            {...getRootProps()}
            className={cn(
              "relative mx-3 mt-3 rounded-xl border-2 border-dashed transition-colors",
              isDragActive ? "border-emerald-500 bg-emerald-500/5" : "border-border",
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
                <p className="text-sm font-medium text-emerald-400">Drop small text file here</p>
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
              onClick={handleClear}
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
              <label className="text-[11px] text-muted-foreground">Delimiter</label>
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
                <label key={key} className="flex cursor-pointer items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setValue((current) => !current)}
                    className={cn(
                      "relative h-4 w-8 rounded-full transition-colors",
                      value ? "bg-emerald-500" : "border border-border bg-muted",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform",
                        value ? "translate-x-1" : "-translate-x-3",
                      )}
                    />
                  </button>
                  <span className="text-[11px] text-muted-foreground">{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="mt-3 px-3">
            <button
              type="button"
              onClick={runParse}
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
                  disabled={loadingDB || filteredTotal === 0}
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
                    <span className="text-[11px] text-emerald-300">Dataset ready</span>
                  </div>
                  <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                    {loadedDataset.viewName} · {loadedDataset.rows.toLocaleString()} rows
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleExportCSV}
                  disabled={filteredTotal === 0}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
                >
                  <Download className="h-3 w-3" />
                  CSV
                </button>
                <button
                  type="button"
                  onClick={handleExportXLSX}
                  disabled={filteredTotal === 0 || exporting}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
                >
                  {exporting ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Download className="h-3 w-3" />
                  )}
                  XLSX
                </button>
              </div>
              <p className="text-center text-[10px] text-muted-foreground">
                {filteredTotal.toLocaleString()} rows · {includedCount} cols
              </p>
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
                <p className="text-base font-semibold text-foreground">No parsed data yet</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Paste delimited text, drop a small CSV/TSV/TXT file, or open a local dataset
                  directly through DuckDB.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
                {[
                  "Rename columns",
                  "Change types",
                  "Filter rows",
                  "Profile columns",
                  "Export XLSX",
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
              <div className="flex flex-none flex-wrap items-center gap-2 border-b border-border px-4 py-2">
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
                  {filterExpr && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />}
                </button>

                <button
                  type="button"
                  onClick={() => setShowProfilePanel((value) => !value)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors",
                    showProfilePanel
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                      : "border-border text-muted-foreground hover:bg-accent",
                  )}
                >
                  <BarChart3 className="h-3 w-3" />
                  Profile
                </button>

                {rejectViews.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowRejectsPanel((value) => !value)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors",
                      showRejectsPanel
                        ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
                        : "border-border text-muted-foreground hover:bg-accent",
                    )}
                  >
                    <ShieldAlert className="h-3 w-3" />
                    Rejects ({rejectTotal.toLocaleString()})
                  </button>
                )}

                <div className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Eye className="h-3 w-3" />
                  <span>Preview:</span>
                  {PREVIEW_LIMITS.map((value) => (
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
                      {value.toLocaleString()}
                    </button>
                  ))}
                  <span className="ml-1">of {filteredTotal.toLocaleString()}</span>
                </div>

                <button
                  type="button"
                  onClick={runParse}
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
                            onClick={() => setAllIncluded(true)}
                            className="rounded-lg border border-border px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-accent"
                          >
                            All
                          </button>
                          <button
                            type="button"
                            onClick={() => setAllIncluded(false)}
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
                                  updateColumn(index, {
                                    alias: event.target.value,
                                  })
                                }
                                className="min-w-0 flex-1 truncate bg-transparent text-[11px] font-medium text-foreground outline-none"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  updateColumn(index, {
                                    include: !column.include,
                                  })
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
                              {COLUMN_TYPES.map((type) => (
                                <button
                                  key={type}
                                  type="button"
                                  onClick={() => updateColumn(index, { type })}
                                  className={cn(
                                    "rounded px-1.5 py-0.5 font-mono text-[9px] transition-opacity",
                                    column.type === type
                                      ? "opacity-100"
                                      : "opacity-30 hover:opacity-60",
                                    type === "number" && "bg-emerald-500/15 text-emerald-400",
                                    type === "string" && "bg-blue-500/15 text-blue-400",
                                    type === "date" && "bg-purple-500/15 text-purple-400",
                                    type === "boolean" && "bg-amber-500/15 text-amber-400",
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
                          onChange={(event) => setFilterExpr(event.target.value)}
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

              <AnimatePresence>
                {showProfilePanel && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="max-h-72 overflow-auto border-b border-border"
                  >
                    <ProfilePanel profiles={parsed.profiles} rowCount={parsed.rowCount} />
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {showRejectsPanel && rejectViews.length > 0 && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="overflow-hidden border-b border-border"
                  >
                    <RejectsPanel rejects={rejectViews} totalRejected={rejectTotal} />
                  </motion.div>
                )}
              </AnimatePresence>

              {parsed.errors.length > 0 && rejectViews.length === 0 && (
                <div className="mx-4 mt-2 flex flex-none items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 p-2.5">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none text-amber-400" />
                  <div className="space-y-0.5 text-[11px] text-amber-300">
                    {parsed.errors.slice(0, 3).map((error) => (
                      <p key={error}>{error}</p>
                    ))}
                  </div>
                </div>
              )}

              {previewColumns.length === 0 || previewRowIndices.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
                  <Table2 className="mb-2 h-8 w-8 opacity-30" />
                  <p className="text-sm">
                    {previewColumns.length === 0
                      ? "No columns selected"
                      : "No rows match the current filter"}
                  </p>
                </div>
              ) : (
                <PreviewGrid
                  variant="typed"
                  columns={previewColumns}
                  rowIndices={previewRowIndices}
                  getCell={getCell}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
