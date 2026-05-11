"use client";

/**
 * Typed wrapper for Electron IPC filesystem operations.
 * Injected by electron/preload.ts as window.electronFS.
 */

export interface ElectronOpenDialogOptions {
  title?: string;
  filters?: { name: string; extensions: string[] }[];
  properties?: Array<"openFile" | "openDirectory" | "multiSelections">;
}

export interface ElectronSaveDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: { name: string; extensions: string[] }[];
}

interface ElectronFSBridge {
  getDataDir(): Promise<string>;
  readFile(filePath: string): Promise<ArrayBuffer>;
  writeFile(filePath: string, data: ArrayBuffer): Promise<void>;
  deleteFile(filePath: string): Promise<boolean>;
  listFiles(dir?: string): Promise<string[]>;
  listFilesRecursive(dir: string): Promise<string[]>;
  fileExists(filePath: string): Promise<boolean>;
  openDialog(
    options: ElectronOpenDialogOptions,
  ): Promise<{ canceled: boolean; filePaths: string[] }>;
  saveDialog(
    options: ElectronSaveDialogOptions,
  ): Promise<{ canceled: boolean; filePath?: string }>;
}

function bridge(): ElectronFSBridge {
  if (typeof window === "undefined" || !("electronFS" in window)) {
    throw new Error(
      "electronFS not available — ensure the app is running inside Electron",
    );
  }
  return (window as Window & { electronFS: ElectronFSBridge }).electronFS;
}

export function isElectron(): boolean {
  return typeof window !== "undefined" && "electronFS" in window;
}

export function getDataDir(): Promise<string> {
  return bridge().getDataDir();
}

export function readLocalFile(filePath: string): Promise<ArrayBuffer> {
  return bridge().readFile(filePath);
}

export function writeLocalFile(
  filePath: string,
  data: ArrayBuffer,
): Promise<void> {
  return bridge().writeFile(filePath, data);
}

export function deleteLocalFile(filePath: string): Promise<boolean> {
  return bridge().deleteFile(filePath);
}

export function listLocalFiles(dir?: string): Promise<string[]> {
  return bridge().listFiles(dir);
}

export function listLocalFilesRecursive(dir: string): Promise<string[]> {
  return bridge().listFilesRecursive(dir);
}

export function localFileExists(filePath: string): Promise<boolean> {
  return bridge().fileExists(filePath);
}

export async function openFileDialog(
  options: ElectronOpenDialogOptions,
): Promise<string[]> {
  const result = await bridge().openDialog(options);
  return result.canceled ? [] : result.filePaths;
}

export async function saveFileDialog(
  options: ElectronSaveDialogOptions,
): Promise<string | null> {
  const result = await bridge().saveDialog(options);
  return result.canceled || !result.filePath ? null : result.filePath;
}

/** Build a local file path under the app data directory. */
export async function localDataPath(filename: string): Promise<string> {
  const dir = await getDataDir();
  // Path sep is / on Unix and \ on Windows; the main process normalises this.
  return `${dir}/${filename}`;
}
