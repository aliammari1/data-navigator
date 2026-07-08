"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Database,
  FileCheck,
  FolderOpen,
  HardDrive,
  Hash,
  History,
  Info,
  Languages,
  Layers,
  Loader2,
  MousePointerClick,
  Upload,
  XCircle,
  Zap,
} from "lucide-react";
import { motion } from "motion/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useActivityStore } from "@/core/stores/activity-store";
import { useAppContextStore } from "@/core/stores/app-context-store";
import { useDataStore } from "@/core/stores/data-store";
import {
  fileNameFromPath,
  type ImportPipelineContext,
  importBatch,
  isSupportedImportPath,
} from "@/features/data-import/lib/import-pipeline";
import {
  type ImportHistoryEntry,
  useImportHistory,
} from "@/features/data-import/lib/use-import-history";
import { formatBytes, getFileIcon, StatusStep } from "@/features/data-import/model/helpers";
import { useImportSession } from "@/features/data-import/model/import-session-store";
import {
  ENCODING_LABELS,
  ENCODING_OPTIONS,
  type ImportEncoding,
  type ParsedFileInfo,
  type UploadStatus,
  type ValidationIssue,
} from "@/features/data-import/model/types";
import { useAppCommands } from "@/features/desktop/core/menu/app-commands";
import {
  isTelecomDataset,
  TELECOM_REQUIRED_COLUMNS,
} from "@/features/telecom/lib/dataset-detection";
import { useDashboardAccess } from "@/platform/auth/dashboard-access";
import {
  getDroppedFilePaths,
  isElectron,
  listLocalFilesRecursive,
  openFileDialog,
} from "@/platform/electron/electron-fs";
import { cn } from "@/shared/utils";

type DropzoneRootGetter = ReturnType<typeof useDropzone>["getRootProps"];
type DropzoneInputGetter = ReturnType<typeof useDropzone>["getInputProps"];

const IN_PROGRESS_STATUSES: UploadStatus[] = ["reading", "parsing", "validating", "loading_db"];

function getDisplaySize(size: number) {
  return size > 0 ? formatBytes(size) : "Fichier local";
}

/**
 * A short, uppercase format label for a session row. `detectFileType` returns
 * `unknown` for ambiguous extensions (e.g. `.txt`); fall back to the real file
 * extension so the row reads `TXT` instead of `UNKNOWN`.
 */
function getFormatLabel(file: ParsedFileInfo) {
  if (file.fileType !== "unknown") return file.fileType.toUpperCase();
  const ext = file.name.split(".").pop();
  return ext ? ext.toUpperCase() : "FICHIER";
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
    return "border-destructive/25 bg-destructive/10 text-destructive";
  }
  if (severity === "warning") {
    return "border-warning/25 bg-warning/10 text-warning";
  }
  return "border-primary/25 bg-primary/10 text-primary";
}

function getStepStatus(
  file: ParsedFileInfo,
  step: UploadStatus,
): "pending" | "active" | "done" | "error" {
  const order: UploadStatus[] = ["reading", "parsing", "validating", "loading_db", "done"];

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

// ─── Narrow store selectors (kill O(N) re-renders) ────────────────────────────

/** Subscribe only to the ordered list of file ids. */
function useFileOrder(): string[] {
  return useImportSession((state) => state.order);
}

/** Subscribe to a single file by id — only this row re-renders on its update. */
function useFile(id: string): ParsedFileInfo | undefined {
  return useImportSession((state) => state.files[id]);
}

export default function DataImportScreen() {
  const access = useDashboardAccess();
  const { addDataset, setActiveDataset } = useDataStore();

  const router = useRouter();
  const searchParams = useSearchParams();
  const isTelecomMode = searchParams.get("context") === "telecom";
  const setAppContext = useAppContextStore((state) => state.setContext);
  const addActivity = useActivityStore((state) => state.addEvent);

  const order = useFileOrder();
  const files = useImportSession((state) => state.files);
  const reset = useImportSession((state) => state.reset);

  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [electronAvailable, setElectronAvailable] = useState(false);
  const [dropNotice, setDropNotice] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  // `auto` defers to the main-process encoding detector (chardet + BOM sniff);
  // an explicit choice forces DuckDB `read_csv(encoding=…)` for Latin-1/UTF-16
  // exports that would otherwise mojibake.
  const [encoding, setEncoding] = useState<ImportEncoding>("auto");

  const { history, loading: historyLoading, refresh: refreshHistory } = useImportHistory();

  // Clear the in-memory session list when the screen mounts so a reload starts
  // fresh; persisted history is shown separately from the catalog.
  useEffect(() => {
    reset();
    setElectronAvailable(isElectron());
  }, [reset]);

  const orderedFiles = useMemo(
    () => order.map((id) => files[id]).filter(Boolean) as ParsedFileInfo[],
    [order, files],
  );

  const selectedFile =
    (selectedFileId ? files[selectedFileId] : undefined) ?? orderedFiles[0] ?? null;

  const completedFiles = useMemo(
    () => orderedFiles.filter((file) => file.status === "done"),
    [orderedFiles],
  );

  const totalStorageUsed = useMemo(
    () => completedFiles.reduce((total, file) => total + file.size, 0),
    [completedFiles],
  );

  const latestCompletedFile = completedFiles[0] ?? null;

  // Route by DETECTION, not the legacy ?context fork: if the file we just
  // imported is a telecom dataset (tags set by getTelecomDatasetProfile during
  // the pipeline), open the report; otherwise go to the data profile (§3).
  const getUploadSuccessPath = useCallback(() => {
    const state = useDataStore.getState();
    const active = state.datasets.find((d) => d.id === state.activeDatasetId);
    if (active && isTelecomDataset(active)) return "/dashboard/telecom-report";
    return "/dashboard/parsed";
  }, []);

  const pipelineContext = useMemo<ImportPipelineContext>(
    () => ({
      isTelecomMode,
      canUpload: access.permissions.canUpload,
      encoding,
      addDataset,
      setActiveDataset,
      setAppContext,
      addActivity,
    }),
    [
      isTelecomMode,
      access.permissions.canUpload,
      encoding,
      addDataset,
      setActiveDataset,
      setAppContext,
      addActivity,
    ],
  );

  const runImport = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return;

      setDropNotice(null);
      setImporting(true);

      // Select the first queued file so the pipeline card tracks progress.
      const firstId = useImportSession.getState().order[0];

      try {
        const { doneIds } = await importBatch(paths, pipelineContext);
        const focusId = doneIds[0] ?? firstId ?? null;
        if (focusId) setSelectedFileId(focusId);

        await refreshHistory();

        // Navigate exactly once, after the whole batch settles — never per file.
        if (doneIds.length > 0) {
          router.push(getUploadSuccessPath());
        }
      } finally {
        setImporting(false);
      }
    },
    [pipelineContext, refreshHistory, router, getUploadSuccessPath],
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

    await runImport(supported);
  }, [access.permissions.canUpload, runImport]);

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

    await runImport(supported);
  }, [access.permissions.canUpload, runImport]);

  // Real drag-and-drop: resolve dropped files to trusted on-disk paths via
  // Electron webUtils, then run the same pipeline as the native picker (§3).
  const onDrop = useCallback(
    (accepted: File[]) => {
      if (!access.permissions.canUpload || accepted.length === 0) return;

      if (!isElectron()) {
        setDropNotice(
          "Le glisser-déposer nécessite l'application de bureau pour donner à DuckDB un accès fiable au fichier. Utilisez le sélecteur natif.",
        );
        return;
      }

      const paths = getDroppedFilePaths(accepted);
      const supported = paths.filter(isSupportedImportPath);

      if (supported.length === 0) {
        setDropNotice("Aucun fichier pris en charge. Formats acceptés : CSV, TSV, TXT, Parquet.");
        return;
      }

      void runImport(supported);
    },
    [access.permissions.canUpload, runImport],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    disabled: !access.permissions.canUpload || importing,
    noClick: true,
    noKeyboard: true,
    accept: {
      "text/csv": [".csv", ".tsv", ".txt"],
      "application/vnd.apache.parquet": [".parquet", ".pq"],
    },
    multiple: true,
  });

  // Bridge the desktop window menu (Importer) to the screen's existing handlers.
  useAppCommands("upload", {
    import: () => void importFromFiles(),
    "import-folder": () => void importFromFolder(),
    "refresh-history": () => void refreshHistory(),
    "clear-session": () => {
      reset();
      setSelectedFileId(null);
      setDropNotice(null);
    },
  });

  return (
    <div className=" flex flex-col">
      <div className=" px-4 py-3 md:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 flex-none items-center justify-center rounded-2xl border border-primary/25 bg-primary/15 text-primary shadow-[var(--shadow-1)]">
              <Upload className="h-5 w-5" />
            </div>

            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold text-foreground">
                {isTelecomMode ? "Charger un rapport télécom" : "Importer des données"}
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
                className="hidden border-[color-mix(in_oklab,var(--positive)_25%,transparent)] bg-[color-mix(in_oklab,var(--positive)_10%,transparent)] text-xs text-positive sm:inline-flex"
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
                  disabled={!access.permissions.canUpload || importing}
                  className="h-9 rounded-xl text-xs"
                >
                  <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
                  Dossier local
                </Button>

                <Button
                  type="button"
                  size="sm"
                  onClick={importFromFiles}
                  disabled={!access.permissions.canUpload || importing}
                  className="h-9 rounded-xl text-xs font-bold"
                >
                  {importing ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <MousePointerClick className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Fichier local
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <main className="flex-1 overflow-y-auto">
        <div className=" grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
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
              order={order}
              count={order.length}
              selectedFileId={selectedFile?.id ?? null}
              onSelect={setSelectedFileId}
              onOpenTelecom={() => router.push("/dashboard/telecom-report")}
              isTelecomMode={isTelecomMode}
              hasDone={completedFiles.length > 0}
            />

            <ImportHistoryPanel history={history} loading={historyLoading} />
          </section>

          <aside className="space-y-4">
            <ImportSettingsCard
              encoding={encoding}
              onEncodingChange={setEncoding}
              disabled={importing || !access.permissions.canUpload}
            />

            <UploadPipelineCard selectedFile={selectedFile} />

            <UploadSummaryCard files={orderedFiles} totalStorageUsed={totalStorageUsed} />

            {selectedFile?.issues.length ? (
              <ValidationIssuesCard issues={selectedFile.issues} />
            ) : null}

            {latestCompletedFile?.status === "done" && isTelecomMode && (
              <div className="rounded-2xl border border-primary/25 bg-primary/10 p-4">
                <div className="text-sm font-bold text-primary">Rapport prêt</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Le fichier est enregistré dans le catalogue local DuckDB et disponible via une vue
                  optimisée sur cache Parquet.
                </p>
                <Button
                  type="button"
                  onClick={() => router.push("/dashboard/telecom-report")}
                  className="mt-4 h-9 w-full rounded-xl text-xs font-bold"
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
    <div className="rounded-2xl border border-primary/25 bg-primary/10 p-4">
      <div className="flex items-center gap-2 text-sm font-bold text-primary">
        <Database className="h-4 w-4" />
        Mode rapport télécom
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        Importez le fichier journalier des transactions. Les fichiers pipe-delimited CSV/TXT sont
        chargés localement, convertis en Parquet et exposés comme dataset DuckDB.
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
          ? "border-primary bg-primary/10"
          : canUpload
            ? "border-border bg-card hover:border-primary/50 hover:bg-muted/20"
            : "border-border bg-muted/20 opacity-70",
      )}
    >
      <input {...getInputProps()} />

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,color-mix(in_oklab,var(--primary)_12%,transparent),transparent_35%)]" />

      <div className="relative flex min-h-80 flex-col items-center justify-center text-center">
        <motion.div
          animate={isDragActive ? { scale: 1.06, y: -4 } : { scale: 1, y: 0 }}
          className={cn(
            "flex h-20 w-20 items-center justify-center rounded-3xl border shadow-[var(--shadow-1)] transition-colors",
            isDragActive
              ? "border-primary/40 bg-primary/20 text-primary"
              : "border-border bg-background text-muted-foreground group-hover:text-primary",
          )}
        >
          <Upload className="h-8 w-8" />
        </motion.div>

        <h2 className="mt-6 text-lg font-bold text-foreground">
          {canUpload ? "Importez un dataset local" : "Votre rôle ne permet pas l'import"}
        </h2>

        <p className="mt-2 max-w-lg text-sm text-muted-foreground">
          {canUpload
            ? "Glissez-déposez vos fichiers ici, ou utilisez le sélecteur natif. Les fichiers restent sur votre machine et sont lus directement par DuckDB."
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
              className="rounded-xl px-5 text-xs font-bold"
            >
              <MousePointerClick className="mr-1.5 h-3.5 w-3.5" />
              Sélectionner un fichier local
            </Button>
          </div>
        )}

        {!electronAvailable && (
          <div className="mt-4 max-w-md rounded-xl border border-warning/25 bg-warning/10 px-4 py-3 text-xs text-warning">
            L'import optimisé nécessite Electron, car DuckDB doit lire le fichier directement depuis
            le disque.
          </div>
        )}

        {dropNotice && (
          <div className="mt-4 max-w-md rounded-xl border border-primary/25 bg-primary/10 px-4 py-3 text-xs text-primary">
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

const FILE_ROW_HEIGHT = 76;
const VIRTUALIZE_THRESHOLD = 12;

function UploadedFilesPanel({
  order,
  count,
  selectedFileId,
  onSelect,
  onOpenTelecom,
  isTelecomMode,
  hasDone,
}: {
  order: string[];
  count: number;
  selectedFileId: string | null;
  onSelect: (id: string) => void;
  onOpenTelecom: () => void;
  isTelecomMode: boolean;
  hasDone: boolean;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const shouldVirtualize = order.length > VIRTUALIZE_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: order.length,
    getScrollElement: () => parentRef.current,
    estimateSize: useCallback(() => FILE_ROW_HEIGHT, []),
    overscan: 6,
    enabled: shouldVirtualize,
  });

  if (count === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <HardDrive className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-bold text-foreground">Aucun fichier importé</div>
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
          <div className="text-sm font-bold text-foreground">Imports de la session</div>
          <div className="text-xs text-muted-foreground">
            {count} fichier{count > 1 ? "s" : ""}
          </div>
        </div>

        {isTelecomMode && hasDone && (
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

      {shouldVirtualize ? (
        <div
          ref={parentRef}
          className="max-h-[28rem] overflow-y-auto"
          style={{ contain: "strict" }}
        >
          <div
            style={{
              height: virtualizer.getTotalSize(),
              position: "relative",
              width: "100%",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const id = order[virtualRow.index];
              return (
                <div
                  key={id}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className="border-b border-border"
                >
                  <FileRow id={id} selected={selectedFileId === id} onSelect={onSelect} />
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {order.map((id) => (
            <FileRow key={id} id={id} selected={selectedFileId === id} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A single import row. Subscribes ONLY to its own file slice, so a progress
 * update for one file re-renders just this row — not the whole list.
 */
function FileRow({
  id,
  selected,
  onSelect,
}: {
  id: string;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const file = useFile(id);
  if (!file) return null;

  const inProgress = IN_PROGRESS_STATUSES.includes(file.status);

  return (
    <button
      type="button"
      onClick={() => onSelect(file.id)}
      className={cn(
        "flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/40",
        selected && "bg-primary/5",
      )}
    >
      <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl border border-border bg-background">
        {getFileIcon(file.fileType)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-foreground">{file.name}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>{getDisplaySize(file.size)}</span>
          <span>·</span>
          <span>{getFormatLabel(file)}</span>
          {file.status === "done" && (
            <>
              <span>·</span>
              <span>{file.rowCount.toLocaleString()} lignes</span>
              <span>·</span>
              <span>{file.columnCount} colonnes</span>
            </>
          )}
        </div>

        {inProgress && <Progress value={file.progress} className="mt-2 h-1" />}
      </div>

      <FileStatusBadge file={file} />
    </button>
  );
}

function FileStatusBadge({ file }: { file: ParsedFileInfo }) {
  if (file.status === "done") {
    return (
      <Badge className="border-[color-mix(in_oklab,var(--positive)_25%,transparent)] bg-[color-mix(in_oklab,var(--positive)_10%,transparent)] text-positive hover:bg-[color-mix(in_oklab,var(--positive)_10%,transparent)]">
        <CheckCircle2 className="mr-1 h-3 w-3" />
        Prêt
      </Badge>
    );
  }

  if (file.status === "error") {
    return (
      <Badge className="border-destructive/25 bg-destructive/10 text-destructive hover:bg-destructive/10">
        <XCircle className="mr-1 h-3 w-3" />
        Erreur
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="border-primary/25 bg-primary/10 text-primary">
      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
      {getStatusLabel(file.status)}
    </Badge>
  );
}

function ImportHistoryPanel({
  history,
  loading,
}: {
  history: ImportHistoryEntry[];
  loading: boolean;
}) {
  if (!loading && history.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <History className="h-4 w-4 text-muted-foreground" />
        <div>
          <div className="text-sm font-bold text-foreground">Datasets enregistrés</div>
          <div className="text-xs text-muted-foreground">
            Catalogue DuckDB local · persiste après rechargement
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 px-5 py-6 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Chargement du catalogue…
        </div>
      ) : (
        <div className="divide-y divide-border">
          {history.slice(0, 12).map((entry) => (
            <div key={entry.id} className="flex items-center gap-3 px-5 py-3">
              <div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-border bg-background text-muted-foreground">
                <Database className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-foreground">{entry.name}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span>{entry.rows.toLocaleString()} lignes</span>
                  <span>·</span>
                  <span>{entry.cols} colonnes</span>
                  <span>·</span>
                  <span>{entry.format.toUpperCase()}</span>
                </div>
              </div>
              <Badge
                variant="outline"
                className="border-border bg-background text-[10px] text-muted-foreground"
              >
                <Clock className="mr-1 h-3 w-3" />
                {new Date(entry.createdAt).toLocaleDateString()}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ImportSettingsCard({
  encoding,
  onEncodingChange,
  disabled,
}: {
  encoding: ImportEncoding;
  onEncodingChange: (encoding: ImportEncoding) => void;
  disabled: boolean;
}) {
  const selectId = "data-import-encoding";

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Languages className="h-4 w-4" />
        </div>
        <div>
          <div className="text-sm font-bold text-foreground">Encodage CSV</div>
          <div className="text-xs text-muted-foreground">Pour les exports Latin-1 / UTF-16</div>
        </div>
      </div>

      <div className="mt-4">
        <label htmlFor={selectId} className="text-[11px] font-medium text-muted-foreground">
          Encodage du fichier
        </label>
        <select
          id={selectId}
          value={encoding}
          disabled={disabled}
          onChange={(event) => onEncodingChange(event.target.value as ImportEncoding)}
          className={cn(
            "mt-1.5 h-9 w-full rounded-xl border border-border bg-background px-3 text-xs text-foreground",
            "focus:outline-none focus:ring-2 focus:ring-ring",
            disabled && "cursor-not-allowed opacity-60",
          )}
        >
          {ENCODING_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {ENCODING_LABELS[option]}
            </option>
          ))}
        </select>

        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          {encoding === "auto"
            ? "DuckDB détecte l'encodage à la lecture (BOM + analyse du début de fichier)."
            : `Force read_csv(encoding) pour éviter le mojibake des valeurs accentuées.`}
        </p>
      </div>
    </div>
  );
}

function UploadPipelineCard({ selectedFile }: { selectedFile: ParsedFileInfo | null }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Activity className="h-4 w-4" />
        </div>
        <div>
          <div className="text-sm font-bold text-foreground">Pipeline d'import</div>
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
              <span>{getFormatLabel(selectedFile)}</span>
              {selectedFile.status === "done" && (
                <>
                  <span>·</span>
                  <span>
                    {selectedFile.metadataSource === "full" ? "Stats complètes" : "Stats aperçu"}
                  </span>
                  {selectedFile.encoding !== "auto" && (
                    <>
                      <span>·</span>
                      <span className="uppercase">{selectedFile.encoding}</span>
                    </>
                  )}
                  {selectedFile.rejectCount !== undefined && selectedFile.rejectCount > 0 && (
                    <>
                      <span>·</span>
                      <span className="text-warning">
                        {selectedFile.rejectCount} rejet
                        {selectedFile.rejectCount > 1 ? "s" : ""}
                      </span>
                    </>
                  )}
                </>
              )}
            </div>

            {selectedFile.status !== "done" && selectedFile.status !== "error" && (
              <Progress value={selectedFile.progress} className="mt-3 h-1.5" />
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
              label: "Profilage complet (DuckDB)",
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
            <div className="rounded-xl border border-destructive/25 bg-destructive/10 p-3 text-xs text-destructive">
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

  const totalRows = readyFiles.reduce((total, file) => total + file.rowCount, 0);

  const totalColumns = readyFiles.reduce((total, file) => total + file.columnCount, 0);

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
              readyFiles.reduce((sum, file) => sum + file.parseTime, 0) / readyFiles.length,
            )}ms`
          : "—",
      icon: Zap,
    },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="text-sm font-bold text-foreground">Résumé</div>
      <div className="mt-1 text-xs text-muted-foreground">Etat de l'import courant</div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {stats.map((stat) => {
          const Icon = stat.icon;

          return (
            <div key={stat.label} className="rounded-xl border border-border bg-background p-3">
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
      <div className="mt-1 text-xs text-muted-foreground">Alertes détectées pendant l'import</div>

      <div className="mt-4 space-y-2">
        {issues.map((issue) => (
          <div
            key={`${issue.severity}-${issue.column ?? "file"}-${issue.message}`}
            className={cn(
              "flex items-start gap-2 rounded-xl border p-3 text-xs",
              getIssueClassName(issue.severity),
            )}
          >
            <div className="mt-0.5 flex-none">{getIssueIcon(issue.severity)}</div>
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

// Re-export so the helper remains importable where the screen used to own it.
export { fileNameFromPath };
