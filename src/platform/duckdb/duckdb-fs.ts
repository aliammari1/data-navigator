"use client";

/**
 * Local-filesystem dataset facade — Electron edition.
 *
 * This file no longer does OPFS/table restore logic.
 *
 * New model:
 * - User picks local CSV / TSV / TXT / Parquet files through Electron dialogs.
 * - DuckDB main process registers the file as a dataset.
 * - CSV-like files are converted to managed Parquet cache.
 * - Parquet files are copied into managed cache.
 * - Dataset export copies the managed Parquet cache to a user-selected path.
 */

import {
  getDataDir,
  isElectron,
  localFileExists,
  openFileDialog,
  saveFileDialog,
} from "@/platform/electron/electron-fs";
import {
  deleteRegisteredDataset,
  exportRegisteredDataset,
  listRegisteredDatasets,
  type RegisteredDataset,
  type RegisteredDatasetWithPreview,
  registerCSVPathDataset,
  registerParquetPathDataset,
} from "./duckdb";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DatasetFileExtension = "csv" | "tsv" | "txt" | "parquet" | "pq";

export interface LocalFileDialogOptions {
  title?: string;
  filters?: Array<{
    name: string;
    extensions: string[];
  }>;
  multiSelections?: boolean;
}

export interface RegisterLocalDatasetOptions {
  filePath: string;
  displayName?: string;
  hasHeader?: boolean;
  delimiter?: string;
  sampleSize?: number;
  previewLimit?: number;
}

export interface ExportDatasetSnapshotOptions {
  datasetId: string;
  defaultPath?: string;
}

// ─── File helpers ─────────────────────────────────────────────────────────────

function getExtension(filePath: string): string {
  const cleanPath = filePath.split(/[?#]/)[0] ?? filePath;
  const ext = cleanPath.split(".").pop();

  return ext ? ext.toLowerCase() : "";
}

function basename(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || "dataset";
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}

function defaultDatasetDisplayName(filePath: string): string {
  return stripExtension(basename(filePath)) || "dataset";
}

function defaultSnapshotName(dataset: RegisteredDataset): string {
  const base =
    dataset.displayName
      .replace(/\.[^.]+$/, "")
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .toLowerCase() || dataset.id;

  return `${base}.parquet`;
}

function inferDelimiter(
  filePath: string,
  explicitDelimiter?: string,
): string | undefined {
  if (explicitDelimiter) return explicitDelimiter;

  const ext = getExtension(filePath);

  if (ext === "tsv") return "\t";

  return undefined;
}

function isCsvLikeExtension(ext: string): ext is "csv" | "tsv" | "txt" {
  return ext === "csv" || ext === "tsv" || ext === "txt";
}

function isParquetExtension(ext: string): ext is "parquet" | "pq" {
  return ext === "parquet" || ext === "pq";
}

function ensureElectron(featureName: string): void {
  if (!isElectron()) {
    throw new Error(`${featureName} requires Electron.`);
  }
}

// ─── Runtime helpers ──────────────────────────────────────────────────────────

export async function getLocalDataDir(): Promise<string> {
  ensureElectron("getLocalDataDir");
  return getDataDir();
}

export async function localDatasetCacheExists(
  dataset: Pick<RegisteredDataset, "cachePath">,
): Promise<boolean> {
  if (!isElectron()) return false;
  return localFileExists(dataset.cachePath);
}

export async function listLocalDatasets(): Promise<RegisteredDataset[]> {
  ensureElectron("listLocalDatasets");
  return listRegisteredDatasets();
}

// ─── Dialog helpers ───────────────────────────────────────────────────────────

export async function openLocalFileDialog(
  options?: LocalFileDialogOptions,
): Promise<string[]> {
  ensureElectron("openLocalFileDialog");

  return openFileDialog({
    title: options?.title ?? "Open dataset file",
    filters: options?.filters ?? [
      {
        name: "Data files",
        extensions: ["csv", "tsv", "txt", "parquet", "pq"],
      },
      {
        name: "CSV files",
        extensions: ["csv", "tsv", "txt"],
      },
      {
        name: "Parquet files",
        extensions: ["parquet", "pq"],
      },
      {
        name: "All files",
        extensions: ["*"],
      },
    ],
    properties: [
      "openFile",
      ...(options?.multiSelections === false ? [] : ["multiSelections"]),
    ],
  });
}

export async function openSingleLocalFileDialog(
  options?: Omit<LocalFileDialogOptions, "multiSelections">,
): Promise<string | null> {
  const paths = await openLocalFileDialog({
    ...options,
    multiSelections: false,
  });

  return paths[0] ?? null;
}

// ─── Dataset registration ─────────────────────────────────────────────────────

export async function registerLocalDatasetFile(
  options: RegisterLocalDatasetOptions,
): Promise<RegisteredDatasetWithPreview> {
  ensureElectron("registerLocalDatasetFile");

  const ext = getExtension(options.filePath);
  const displayName =
    options.displayName?.trim() || defaultDatasetDisplayName(options.filePath);

  if (isCsvLikeExtension(ext)) {
    return registerCSVPathDataset({
      filePath: options.filePath,
      displayName,
      hasHeader: options.hasHeader ?? true,
      delimiter: inferDelimiter(options.filePath, options.delimiter),
      sampleSize: options.sampleSize,
      previewLimit: options.previewLimit,
    });
  }

  if (isParquetExtension(ext)) {
    return registerParquetPathDataset({
      filePath: options.filePath,
      displayName,
      previewLimit: options.previewLimit,
    });
  }

  throw new Error(
    `Unsupported dataset file type ".${ext || "unknown"}". Supported files: .csv, .tsv, .txt, .parquet, .pq.`,
  );
}

export async function registerLocalDatasetFiles(
  filePaths: string[],
  options?: Omit<RegisterLocalDatasetOptions, "filePath" | "displayName">,
): Promise<RegisteredDatasetWithPreview[]> {
  const datasets: RegisteredDatasetWithPreview[] = [];

  for (const filePath of filePaths) {
    datasets.push(
      await registerLocalDatasetFile({
        filePath,
        displayName: defaultDatasetDisplayName(filePath),
        hasHeader: options?.hasHeader,
        delimiter: options?.delimiter,
        sampleSize: options?.sampleSize,
        previewLimit: options?.previewLimit,
      }),
    );
  }

  return datasets;
}

export async function openAndRegisterLocalDatasetFiles(
  options?: LocalFileDialogOptions &
    Omit<RegisterLocalDatasetOptions, "filePath" | "displayName">,
): Promise<RegisteredDatasetWithPreview[]> {
  const filePaths = await openLocalFileDialog({
    title: options?.title ?? "Import dataset files",
    filters: options?.filters,
    multiSelections: options?.multiSelections,
  });

  if (filePaths.length === 0) {
    return [];
  }

  return registerLocalDatasetFiles(filePaths, {
    hasHeader: options?.hasHeader,
    delimiter: options?.delimiter,
    sampleSize: options?.sampleSize,
    previewLimit: options?.previewLimit,
  });
}

export async function openAndRegisterSingleLocalDatasetFile(
  options?: Omit<LocalFileDialogOptions, "multiSelections"> &
    Omit<RegisterLocalDatasetOptions, "filePath" | "displayName">,
): Promise<RegisteredDatasetWithPreview | null> {
  const filePath = await openSingleLocalFileDialog({
    title: options?.title ?? "Import dataset file",
    filters: options?.filters,
  });

  if (!filePath) {
    return null;
  }

  return registerLocalDatasetFile({
    filePath,
    displayName: defaultDatasetDisplayName(filePath),
    hasHeader: options?.hasHeader,
    delimiter: options?.delimiter,
    sampleSize: options?.sampleSize,
    previewLimit: options?.previewLimit,
  });
}

// ─── Dataset export / delete ──────────────────────────────────────────────────

export async function exportDatasetSnapshotFile(
  options: ExportDatasetSnapshotOptions,
): Promise<void> {
  ensureElectron("exportDatasetSnapshotFile");

  const datasets = await listRegisteredDatasets();
  const dataset = datasets.find((item) => item.id === options.datasetId);

  if (!dataset) {
    throw new Error(`Dataset not found: ${options.datasetId}`);
  }

  const savePath = await saveFileDialog({
    title: "Save dataset snapshot",
    defaultPath: options.defaultPath ?? defaultSnapshotName(dataset),
    filters: [{ name: "Parquet", extensions: ["parquet"] }],
  });

  if (!savePath) return;

  await exportRegisteredDataset({
    datasetId: dataset.id,
    targetPath: savePath,
  });
}

export async function deleteLocalDataset(datasetId: string): Promise<void> {
  ensureElectron("deleteLocalDataset");

  await deleteRegisteredDataset({
    datasetId,
  });
}
