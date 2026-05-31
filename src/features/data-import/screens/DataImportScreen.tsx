"use client";

import { produce } from "immer";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Database,
  FileCheck,
  FolderOpen,
  HardDrive,
  Hash,
  Info,
  Layers,
  Loader2,
  MousePointerClick,
  Upload,
  XCircle,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useActivityStore } from "@/core/stores/activity-store";
import { useAppContextStore } from "@/core/stores/app-context-store";
import type { Dataset } from "@/core/stores/data-store";
import { useDataStore } from "@/core/stores/data-store";
import {
  columnInfoToColMeta,
  computeQualityScores,
  detectFileType,
  formatBytes,
  getFileIcon,
  StatusStep,
} from "@/features/data-import/model/helpers";
import type {
  ColumnInfo,
  ParsedFileInfo,
  UploadSettings,
  UploadStatus,
  ValidationIssue,
} from "@/features/data-import/model/types";
import {
  getTelecomDatasetProfile,
  TELECOM_REQUIRED_COLUMNS,
} from "@/features/telecom/lib/dataset-detection";
import { useDashboardAccess } from "@/platform/auth/dashboard-access";
import {
  loadUploadPathToDuckDB,
  sanitizeUploadTableName,
} from "@/platform/duckdb/upload-to-duckdb";
import {
  isElectron,
  listLocalFilesRecursive,
  openFileDialog,
} from "@/platform/electron/electron-fs";
import { cn } from "@/shared/utils";

type DropzoneRootGetter = ReturnType<typeof useDropzone>["getRootProps"];
type DropzoneInputGetter = ReturnType<typeof useDropzone>["getInputProps"];

function makeUploadTableName(fileName: string, id: string) {
  return `${sanitizeUploadTableName(fileName)}_${id.slice(-6)}`;
}

function fileNameFromPath(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] ?? filePath;
}

function isSupportedImportPath(filePath: string): boolean {
  const lower = filePath.toLowerCase();

  return (
    lower.endsWith(".csv") ||
    lower.endsWith(".tsv") ||
    lower.endsWith(".txt") ||
    lower.endsWith(".parquet") ||
    lower.endsWith(".pq")
  );
}

function getExtensionFromPath(filePath: string) {
  const fileName = fileNameFromPath(filePath);
  return fileName.split(".").pop()?.toLowerCase() || "csv";
}

function getDisplaySize(size: number) {
  return size > 0 ? formatBytes(size) : "Fichier local";
}

function getStatusLabel(status: ParsedFileInfo["status"]) {
  switch (status) {
    case "reading":
      return "Préparation";
    case "parsing":
      return "Analyse";
    case "validating":
      return "Validation";
    case "loading_db":
      return "DuckDB";
    case "done":
      return "Prêt";
    case "error":
      return "Erreur";
    default:
      return "En attente";
  }
}

function getIssueIcon(severity: ValidationIssue["severity"]) {
  if (severity === "error") return <XCircle className="h-3.5 w-3.5" />;
  if (severity === "warning") {
    return <AlertTriangle className="h-3.5 w-3.5" />;
  }

  return <Info className="h-3.5 w-3.5" />;
}

function getIssueClassName(severity: ValidationIssue["severity"]) {
  if (severity === "error") {
    return "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300";
  }

  if (severity === "warning") {
    return "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }

  return "border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-300";
}

function getStepStatus(
  file: ParsedFileInfo,
  step: UploadStatus,
): "pending" | "active" | "done" | "error" {
  const order: UploadStatus[] = [
    "reading",
    "parsing",
    "validating",
    "loading_db",
    "done",
  ];

  if (file.status === "error") {
    return step === file.status ? "error" : "pending";
  }

  const currentIndex = order.indexOf(file.status);
  const stepIndex = order.indexOf(step);

  if (file.status === "done") return "done";
  if (stepIndex < currentIndex) return "done";
  if (stepIndex === currentIndex) return "active";

  return "pending";
}

function toColumnInfoType(type: string): ColumnInfo["type"] {
  const normalized = type.toLowerCase();

  if (
    normalized.includes("int") ||
    normalized.includes("double") ||
    normalized.includes("float") ||
    normalized.includes("decimal") ||
    normalized.includes("numeric") ||
    normalized.includes("real")
  ) {
    return "number";
  }

  if (
    normalized.includes("date") ||
    normalized.includes("time") ||
    normalized.includes("timestamp")
  ) {
    return "date";
  }

  if (normalized.includes("bool")) {
    return "boolean";
  }

  if (normalized === "mixed") {
    return "mixed";
  }

  return "string";
}

function buildValidationIssues(
  loaded: Awaited<ReturnType<typeof loadUploadPathToDuckDB>>,
  columns: ColumnInfo[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (loaded.rowCount === 0) {
    issues.push({
      severity: "error",
      message: "File is empty or has no parseable data.",
    });
  }

  const highNullCols = columns.filter(
    (column) => column.nullCount / Math.max(1, loaded.previewRows.length) > 0.3,
  );

  if (highNullCols.length > 0) {
    issues.push({
      severity: "warning",
      message: `${highNullCols.length} column(s) have >30% null values in the preview sample.`,
      column: highNullCols.map((column) => column.name).join(", "),
    });
  }

  return issues;
}

export default function DataImportScreen() {
  const access = useDashboardAccess();
  const { addDataset, setActiveDataset } = useDataStore();

  const router = useRouter();
  const searchParams = useSearchParams();
  const isTelecomMode = searchParams.get("context") === "telecom";
  const setAppContext = useAppContextStore((state) => state.setContext);
  const addActivity = useActivityStore((state) => state.addEvent);

  const [files, setFiles] = useState<ParsedFileInfo[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [electronAvailable, setElectronAvailable] = useState(false);
  const [dropNotice, setDropNotice] = useState<string | null>(null);

  const [settings] = useState<UploadSettings>({
    hasHeader: true,
    encoding: "UTF-8",
    skipEmptyLines: true,
    trimWhitespace: true,
    maxRows: null,
    autoDetectTypes: true,
    loadToDuckDB: true,
  });

  const selectedFile =
    files.find((file) => file.id === selectedFileId) ?? files[0] ?? null;

  const completedFiles = files.filter((file) => file.status === "done");

  useEffect(() => {
    setElectronAvailable(isElectron());
  }, []);

  const getUploadSuccessPath = useCallback(
    () => (isTelecomMode ? "/dashboard/telecom-report" : "/dashboard/parsed"),
    [isTelecomMode],
  );

  const totalStorageUsed = useMemo(
    () => completedFiles.reduce((total, file) => total + file.size, 0),
    [completedFiles],
  );

  const latestCompletedFile = completedFiles[0] ?? null;

  const processFilePath = useCallback(
    async (filePath: string) => {
      if (!access.permissions.canUpload) return;

      const fileName = fileNameFromPath(filePath);
      const id = `file_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const fileType = detectFileType(fileName);

      const initial: ParsedFileInfo = {
        id,
        name: fileName,
        size: 0,
        fileType,
        status: "reading",
        progress: 0,
        rowCount: 0,
        columnCount: 0,
        columns: [],
        previewRows: [],
        issues: [],
        parseTime: 0,
        dbTableName: null,
        uploadedAt: new Date(),
        hasHeader: settings.hasHeader,
        encoding: settings.encoding,
        skipEmptyLines: settings.skipEmptyLines,
        completeness: 0,
        accuracy: 0,
        consistency: 0,
        uniqueness: 0,
      };

      setFiles((prev) => [initial, ...prev]);
      setSelectedFileId(id);
      setDropNotice(null);

      const update = (patch: Partial<ParsedFileInfo>) =>
        setFiles((prev) =>
          produce(prev, (draft) => {
            const target = draft.find((item) => item.id === id);
            if (target) Object.assign(target, patch);
          }),
        );

      try {
        const t0 = performance.now();

        update({ status: "reading", progress: 10 });
        await new Promise((resolve) => setTimeout(resolve, 80));

        update({ status: "loading_db", progress: 35 });

        const tableName = makeUploadTableName(fileName, id);
        const extension = getExtensionFromPath(filePath);

        const loaded = await loadUploadPathToDuckDB(filePath, {
          tableName,
          fileExtension: extension,
          hasHeader: settings.hasHeader,
          previewLimit: 100,
        });

        update({ status: "validating", progress: 75 });

        const columns: ColumnInfo[] = loaded.columns.map((column) => ({
          name: column.name,
          type: toColumnInfoType(column.type),
          nullCount: column.nullCount,
          uniqueCount: column.distinctCount,
          sampleValues: column.sample,
          min: column.min,
          max: column.max,
          avg: column.mean,
        }));

        const issues = buildValidationIssues(loaded, columns);
        const quality = computeQualityScores(
          columns,
          Math.max(loaded.previewRows.length, 1),
        );

        const dsCols = columnInfoToColMeta(columns);
        const telecomProfile = getTelecomDatasetProfile({
          columns: dsCols,
          fileName,
          telecomMode: isTelecomMode,
        });

        if (isTelecomMode && !telecomProfile.compatible) {
          issues.push({
            severity: "warning",
            message:
              "This file was uploaded in Telecom mode, but it is missing one or more required telecom columns.",
            column: TELECOM_REQUIRED_COLUMNS.join(", "),
          });
        }

        const ds: Dataset = {
          id: loaded.datasetId,
          name: loaded.displayName,
          tableName: loaded.tableName,
          viewName: loaded.tableName,
          sourcePath: filePath,
          source: "upload",
          format: loaded.format,
          rowCount: loaded.rowCount,
          colCount: loaded.colCount,
          sizeBytes: 0,
          columns: dsCols,
          tags: telecomProfile.tags,
          description: telecomProfile.description,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          qualityScore: quality.completeness,
        };

        addDataset(ds);
        setActiveDataset(ds.id);

        setAppContext({
          activeDomain: isTelecomMode ? "telecom" : "general",
          activeDatasetId: ds.id,
          activeTableName: loaded.tableName,
        });

        addActivity({
          type: "dataset_uploaded",
          message: `Imported dataset ${ds.name}`,
          datasetId: ds.id,
          tableName: loaded.tableName,
          metadata: {
            rows: loaded.rowCount,
            cols: loaded.colCount,
            format: loaded.format,
            telecomMode: isTelecomMode,
            sourcePath: filePath,
          },
        });

        update({
          status: "done",
          progress: 100,
          rowCount: loaded.rowCount,
          columnCount: loaded.colCount,
          columns,
          previewRows: loaded.previewRows.slice(0, 50),
          issues,
          parseTime: Math.round(performance.now() - t0),
          dbTableName: loaded.tableName,
          ...quality,
        });

        router.push(getUploadSuccessPath());
      } catch (error) {
        update({
          status: "error",
          error: error instanceof Error ? error.message : String(error),
          progress: 0,
        });
      }
    },
    [
      access.permissions.canUpload,
      settings.hasHeader,
      settings.encoding,
      settings.skipEmptyLines,
      addDataset,
      setActiveDataset,
      setAppContext,
      addActivity,
      isTelecomMode,
      getUploadSuccessPath,
      router,
    ],
  );

  const importFromFiles = useCallback(async () => {
    if (!access.permissions.canUpload || !isElectron()) return;

    const selected = await openFileDialog({
      title: "Select dataset files",
      properties: ["openFile", "multiSelections"],
      filters: [
        {
          name: "Data files",
          extensions: ["csv", "tsv", "txt", "parquet", "pq"],
        },
        {
          name: "CSV / delimited files",
          extensions: ["csv", "tsv", "txt"],
        },
        {
          name: "Parquet files",
          extensions: ["parquet", "pq"],
        },
      ],
    });

    const supported = selected.filter(isSupportedImportPath);

    if (supported.length === 0 && selected.length > 0) {
      setDropNotice(
        "No supported dataset files were selected. Supported formats: CSV, TSV, TXT, Parquet.",
      );
      return;
    }

    for (const filePath of supported) {
      await processFilePath(filePath);
    }
  }, [access.permissions.canUpload, processFilePath]);

  const importFromFolder = useCallback(async () => {
    if (!access.permissions.canUpload || !isElectron()) return;

    const selected = await openFileDialog({
      title: "Select dataset folder",
      properties: ["openDirectory"],
    });

    const root = selected[0];
    if (!root) return;

    const allPaths = await listLocalFilesRecursive(root);
    const supported = allPaths.filter(isSupportedImportPath);

    if (supported.length === 0) {
      setDropNotice(
        "This folder does not contain supported dataset files. Supported formats: CSV, TSV, TXT, Parquet.",
      );
      return;
    }

    for (const filePath of supported) {
      try {
        await processFilePath(filePath);
      } catch {
        // Skip unreadable files and continue the batch.
      }
    }
  }, [access.permissions.canUpload, processFilePath]);

  const onDrop = useCallback(() => {
    setDropNotice(
      "For reliable local access, use the native file picker. Drag-and-drop File objects do not expose trusted filesystem paths to DuckDB.",
    );
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    disabled: !access.permissions.canUpload,
    noClick: true,
    noKeyboard: true,
    accept: {
      "text/csv": [".csv", ".tsv", ".txt"],
      "application/vnd.apache.parquet": [".parquet", ".pq"],
    },
    multiple: true,
  });

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <div className="sticky top-0 z-30 border-b border-border bg-background/95 px-6 py-3 backdrop-blur-md">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 flex-none items-center justify-center rounded-2xl bg-linear-to-br from-teal-700 to-emerald-600 shadow-sm">
              <Upload className="h-5 w-5 text-white" />
            </div>

            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold text-foreground">
                {isTelecomMode
                  ? "Charger un rapport télécom"
                  : "Importer des données"}
              </h1>
              <p className="truncate text-xs text-muted-foreground">
                Fichiers locaux · DuckDB natif · Cache Parquet managé
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {completedFiles.length > 0 && (
              <Badge
                variant="outline"
                className="hidden border-emerald-500/25 bg-emerald-500/10 text-xs text-emerald-700 dark:text-emerald-300 sm:inline-flex"
              >
                <CheckCircle2 className="mr-1 h-3 w-3" />
                {completedFiles.length} prêt
              </Badge>
            )}

            {isTelecomMode && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => router.push("/dashboard/telecom-report")}
                className="h-9 rounded-xl text-xs"
              >
                Ouvrir Telecom
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            )}

            {electronAvailable && (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={importFromFolder}
                  disabled={!access.permissions.canUpload}
                  className="h-9 rounded-xl text-xs"
                >
                  <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
                  Dossier local
                </Button>

                <Button
                  type="button"
                  size="sm"
                  onClick={importFromFiles}
                  disabled={!access.permissions.canUpload}
                  className="h-9 rounded-xl bg-teal-700 text-xs font-bold text-white hover:bg-teal-800"
                >
                  <MousePointerClick className="mr-1.5 h-3.5 w-3.5" />
                  Fichier local
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="space-y-6">
            {isTelecomMode && <TelecomUploadNotice />}

            <UploadDropzone
              getRootProps={getRootProps}
              getInputProps={getInputProps}
              isDragActive={isDragActive}
              canUpload={access.permissions.canUpload}
              electronAvailable={electronAvailable}
              dropNotice={dropNotice}
              onBrowse={importFromFiles}
            />

            <UploadedFilesPanel
              files={files}
              selectedFileId={selectedFile?.id ?? null}
              onSelect={(file) => setSelectedFileId(file.id)}
              onOpenTelecom={() => router.push("/dashboard/telecom-report")}
              isTelecomMode={isTelecomMode}
            />
          </section>

          <aside className="space-y-4">
            <UploadPipelineCard selectedFile={selectedFile} />

            <UploadSummaryCard
              files={files}
              totalStorageUsed={totalStorageUsed}
            />

            {selectedFile?.issues.length ? (
              <ValidationIssuesCard issues={selectedFile.issues} />
            ) : null}

            {latestCompletedFile?.status === "done" && isTelecomMode && (
              <div className="rounded-2xl border border-teal-500/25 bg-teal-500/10 p-4">
                <div className="text-sm font-bold text-teal-700 dark:text-teal-300">
                  Rapport prêt
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Le fichier est enregistré dans le catalogue local DuckDB et
                  disponible via une vue optimisée sur cache Parquet.
                </p>
                <Button
                  type="button"
                  onClick={() => router.push("/dashboard/telecom-report")}
                  className="mt-4 h-9 w-full rounded-xl bg-teal-700 text-xs font-bold text-white hover:bg-teal-800"
                >
                  Ouvrir le rapport
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}

function TelecomUploadNotice() {
  return (
    <div className="rounded-2xl border border-teal-500/25 bg-teal-500/10 p-4">
      <div className="flex items-center gap-2 text-sm font-bold text-teal-700 dark:text-teal-300">
        <Database className="h-4 w-4" />
        Mode rapport télécom
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        Importez le fichier journalier des transactions. Les fichiers
        pipe-delimited CSV/TXT sont chargés localement, convertis en Parquet et
        exposés comme dataset DuckDB.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-1.5 md:grid-cols-4">
        {TELECOM_REQUIRED_COLUMNS.map((column) => (
          <div
            key={column}
            className="rounded-lg border border-border bg-background px-2 py-1 text-[10px] font-mono text-muted-foreground"
          >
            {column}
          </div>
        ))}
      </div>
    </div>
  );
}

function UploadDropzone({
  getRootProps,
  getInputProps,
  isDragActive,
  canUpload,
  electronAvailable,
  dropNotice,
  onBrowse,
}: {
  getRootProps: DropzoneRootGetter;
  getInputProps: DropzoneInputGetter;
  isDragActive: boolean;
  canUpload: boolean;
  electronAvailable: boolean;
  dropNotice: string | null;
  onBrowse: () => void;
}) {
  return (
    <div
      {...getRootProps()}
      className={cn(
        "group relative overflow-hidden rounded-3xl border p-10 transition-all",
        isDragActive
          ? "border-teal-500 bg-teal-500/10"
          : canUpload
            ? "border-border bg-card hover:border-teal-500/50 hover:bg-muted/20"
            : "border-border bg-muted/20 opacity-70",
      )}
    >
      <input {...getInputProps()} />

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(20,184,166,0.12),transparent_35%)]" />

      <div className="relative flex min-h-80 flex-col items-center justify-center text-center">
        <motion.div
          animate={isDragActive ? { scale: 1.06, y: -4 } : { scale: 1, y: 0 }}
          className={cn(
            "flex h-20 w-20 items-center justify-center rounded-3xl border shadow-sm transition-colors",
            isDragActive
              ? "border-teal-500/40 bg-teal-500/20 text-teal-700 dark:text-teal-300"
              : "border-border bg-background text-muted-foreground group-hover:text-teal-700 dark:group-hover:text-teal-300",
          )}
        >
          <Upload className="h-8 w-8" />
        </motion.div>

        <h2 className="mt-6 text-lg font-bold text-foreground">
          {canUpload
            ? "Importez un dataset local"
            : "Votre rôle ne permet pas l'import"}
        </h2>

        <p className="mt-2 max-w-lg text-sm text-muted-foreground">
          {canUpload
            ? "Utilisez le sélecteur natif pour donner à DuckDB un chemin local fiable. Les fichiers restent sur votre machine."
            : "Passez en rôle Editor ou Owner depuis l'en-tête du dashboard."}
        </p>

        {canUpload && (
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onBrowse();
              }}
              disabled={!electronAvailable}
              className="rounded-xl bg-teal-700 px-5 text-xs font-bold text-white hover:bg-teal-800"
            >
              <MousePointerClick className="mr-1.5 h-3.5 w-3.5" />
              Sélectionner un fichier local
            </Button>
          </div>
        )}

        {!electronAvailable && (
          <div className="mt-4 max-w-md rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-300">
            L'import optimisé nécessite Electron, car DuckDB doit lire le
            fichier directement depuis le disque.
          </div>
        )}

        {dropNotice && (
          <div className="mt-4 max-w-md rounded-xl border border-blue-500/25 bg-blue-500/10 px-4 py-3 text-xs text-blue-700 dark:text-blue-300">
            {dropNotice}
          </div>
        )}

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {["CSV", "TSV", "TXT", "PARQUET"].map((format) => (
            <Badge
              key={format}
              variant="outline"
              className="border-border bg-background text-[10px] text-muted-foreground"
            >
              .{format}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}

function UploadedFilesPanel({
  files,
  selectedFileId,
  onSelect,
  onOpenTelecom,
  isTelecomMode,
}: {
  files: ParsedFileInfo[];
  selectedFileId: string | null;
  onSelect: (file: ParsedFileInfo) => void;
  onOpenTelecom: () => void;
  isTelecomMode: boolean;
}) {
  if (files.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <HardDrive className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-bold text-foreground">
              Aucun fichier importé
            </div>
            <div className="text-xs text-muted-foreground">
              Les imports apparaîtront ici pendant la session.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <div className="text-sm font-bold text-foreground">
            Imports de la session
          </div>
          <div className="text-xs text-muted-foreground">
            {files.length} fichier{files.length > 1 ? "s" : ""}
          </div>
        </div>

        {isTelecomMode && files.some((file) => file.status === "done") && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onOpenTelecom}
            className="h-8 rounded-xl text-xs"
          >
            Ouvrir Telecom
          </Button>
        )}
      </div>

      <div className="divide-y divide-border">
        <AnimatePresence initial={false}>
          {files.map((file) => (
            <motion.button
              key={file.id}
              type="button"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              onClick={() => onSelect(file)}
              className={cn(
                "flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/40",
                selectedFileId === file.id && "bg-teal-500/5",
              )}
            >
              <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl border border-border bg-background">
                {getFileIcon(file.fileType)}
              </div>

              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-foreground">
                  {file.name}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span>{getDisplaySize(file.size)}</span>
                  <span>·</span>
                  <span>{file.fileType.toUpperCase()}</span>
                  {file.status === "done" && (
                    <>
                      <span>·</span>
                      <span>{file.rowCount.toLocaleString()} lignes</span>
                      <span>·</span>
                      <span>{file.columnCount} colonnes</span>
                    </>
                  )}
                </div>

                {["reading", "parsing", "validating", "loading_db"].includes(
                  file.status,
                ) && <Progress value={file.progress} className="mt-2 h-1" />}
              </div>

              <FileStatusBadge file={file} />
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function FileStatusBadge({ file }: { file: ParsedFileInfo }) {
  if (file.status === "done") {
    return (
      <Badge className="border-emerald-500/25 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300">
        <CheckCircle2 className="mr-1 h-3 w-3" />
        Prêt
      </Badge>
    );
  }

  if (file.status === "error") {
    return (
      <Badge className="border-red-500/25 bg-red-500/10 text-red-700 hover:bg-red-500/10 dark:text-red-300">
        <XCircle className="mr-1 h-3 w-3" />
        Erreur
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className="border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-300"
    >
      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
      {getStatusLabel(file.status)}
    </Badge>
  );
}

function UploadPipelineCard({
  selectedFile,
}: {
  selectedFile: ParsedFileInfo | null;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-500/10 text-teal-700 dark:text-teal-300">
          <Activity className="h-4 w-4" />
        </div>
        <div>
          <div className="text-sm font-bold text-foreground">
            Pipeline d'import
          </div>
          <div className="text-xs text-muted-foreground">
            Sélection, cache Parquet et vue DuckDB
          </div>
        </div>
      </div>

      {!selectedFile ? (
        <div className="mt-6 rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          Sélectionnez un fichier local pour suivre le pipeline.
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          <div className="rounded-xl border border-border bg-background p-3">
            <div className="truncate text-sm font-semibold text-foreground">
              {selectedFile.name}
            </div>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
              <span>{getDisplaySize(selectedFile.size)}</span>
              <span>·</span>
              <span>{selectedFile.fileType.toUpperCase()}</span>
            </div>

            {selectedFile.status !== "done" &&
              selectedFile.status !== "error" && (
                <Progress
                  value={selectedFile.progress}
                  className="mt-3 h-1.5"
                />
              )}
          </div>

          {[
            {
              step: "reading" as UploadStatus,
              label: "Sélection du fichier",
            },
            {
              step: "parsing" as UploadStatus,
              label: "Détection du format",
            },
            {
              step: "validating" as UploadStatus,
              label: "Validation et profilage",
            },
            {
              step: "loading_db" as UploadStatus,
              label: "Création du cache DuckDB",
            },
            {
              step: "done" as UploadStatus,
              label: "Dataset prêt",
            },
          ].map(({ step, label }) => (
            <StatusStep
              key={step}
              label={label}
              status={getStepStatus(selectedFile, step)}
              duration={
                step === "done" && selectedFile.status === "done"
                  ? selectedFile.parseTime
                  : undefined
              }
            />
          ))}

          {selectedFile.status === "error" && (
            <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-300">
              {selectedFile.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function UploadSummaryCard({
  files,
  totalStorageUsed,
}: {
  files: ParsedFileInfo[];
  totalStorageUsed: number;
}) {
  const readyFiles = files.filter((file) => file.status === "done");

  const totalRows = readyFiles.reduce(
    (total, file) => total + file.rowCount,
    0,
  );

  const totalColumns = readyFiles.reduce(
    (total, file) => total + file.columnCount,
    0,
  );

  const duckDbFiles = readyFiles.filter((file) => file.dbTableName).length;

  const stats = [
    {
      label: "Fichiers prêts",
      value: readyFiles.length.toLocaleString(),
      icon: FileCheck,
    },
    {
      label: "Lignes",
      value: totalRows.toLocaleString(),
      icon: Hash,
    },
    {
      label: "Colonnes",
      value: totalColumns.toLocaleString(),
      icon: Layers,
    },
    {
      label: "DuckDB",
      value: duckDbFiles.toLocaleString(),
      icon: Database,
    },
    {
      label: "Source",
      value: totalStorageUsed > 0 ? formatBytes(totalStorageUsed) : "Locale",
      icon: HardDrive,
    },
    {
      label: "Temps moyen",
      value:
        readyFiles.length > 0
          ? `${Math.round(
              readyFiles.reduce((sum, file) => sum + file.parseTime, 0) /
                readyFiles.length,
            )}ms`
          : "—",
      icon: Zap,
    },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="text-sm font-bold text-foreground">Résumé</div>
      <div className="mt-1 text-xs text-muted-foreground">
        Etat de l'import courant
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {stats.map((stat) => {
          const Icon = stat.icon;

          return (
            <div
              key={stat.label}
              className="rounded-xl border border-border bg-background p-3"
            >
              <div className="flex items-center gap-2 text-muted-foreground">
                <Icon className="h-3.5 w-3.5" />
                <span className="text-[10px] font-medium">{stat.label}</span>
              </div>
              <div className="mt-1 text-lg font-bold tabular-nums text-foreground">
                {stat.value}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ValidationIssuesCard({ issues }: { issues: ValidationIssue[] }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="text-sm font-bold text-foreground">Validation</div>
      <div className="mt-1 text-xs text-muted-foreground">
        Alertes détectées pendant l'import
      </div>

      <div className="mt-4 space-y-2">
        {issues.map((issue) => (
          <div
            key={`${issue.severity}-${issue.column ?? "file"}-${issue.message}`}
            className={cn(
              "flex items-start gap-2 rounded-xl border p-3 text-xs",
              getIssueClassName(issue.severity),
            )}
          >
            <div className="mt-0.5 flex-none">
              {getIssueIcon(issue.severity)}
            </div>
            <div className="min-w-0">
              <div>{issue.message}</div>
              {issue.column && (
                <div className="mt-1 wrap-break-word font-mono text-[10px] opacity-80">
                  {issue.column}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
