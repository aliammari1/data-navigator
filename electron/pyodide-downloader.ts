/**
 * Pyodide runtime downloader — main-process.
 *
 * Streams the Pyodide runtime from jsDelivr into `<userData>/pyodide/` once,
 * then the renderer loads it via a custom `pyodide://` protocol. Re-running
 * is a no-op (every file is skipped if it already exists on disk).
 *
 * Layout on disk (matches jsDelivr's `full/` directory so the `indexURL`
 * argument to `loadPyodide()` is just the vendored root):
 *
 *   <userData>/pyodide/
 *     pyodide.mjs / pyodide.asm.js / pyodide.asm.wasm / pyodide-lock.json
 *     python_stdlib.zip / pyodide.json / pyodide-py.tar / packages.json
 *
 * Total: ~10 MB.
 */

import { Transform } from "node:stream";
import { createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { app } from "electron";
import { join } from "node:path";

const PYODIDE_VERSION = "0.26.2";
const CDN_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

// jsDelivr's `cdn.jsdelivr.net/pyodide/v<ver>/full/` only ships these five
// files for the 0.26.x line — pyodide.json / pyodide-py.tar / packages.json
// belong to other layouts and 404 here, which previously aborted the whole
// download on the first missing file. downloadOne() also treats 404 as a
// soft skip so future version drift can't brick install either.
const RUNTIME_FILES = [
  "pyodide.mjs",
  "pyodide.asm.js",
  "pyodide.asm.wasm",
  "pyodide-lock.json",
  "python_stdlib.zip",
] as const;

export interface PyodideStatus {
  ready: boolean;
  version: string;
  installPath: string;
  installedBytes: number;
  totalBytes: number;
  missingFiles: readonly string[];
  downloading: boolean;
}

export interface DownloadProgress {
  file: string;
  received: number;
  total: number;
}

type ProgressListener = (progress: DownloadProgress) => void;

let currentDownload: AbortController | null = null;
const listeners = new Set<ProgressListener>();

export function onPyodideDownloadProgress(listener: ProgressListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPyodideInstallPath(): string {
  return join(app.getPath("userData"), "pyodide");
}

export function getPyodideVersion(): string {
  return PYODIDE_VERSION;
}

export function getPyodideCdnBase(): string {
  return CDN_BASE;
}

export async function getPyodideStatus(): Promise<PyodideStatus> {
  const installPath = getPyodideInstallPath();
  const missing: string[] = [];
  let installedBytes = 0;
  let totalBytes = 0;
  for (const file of RUNTIME_FILES) {
    const target = join(installPath, file);
    try {
      const stat = statSync(target);
      installedBytes += stat.size;
      totalBytes += stat.size;
    } catch {
      missing.push(file);
      totalBytes += 1024 * 1024;
    }
  }
  return {
    ready: missing.length === 0,
    version: PYODIDE_VERSION,
    installPath,
    installedBytes,
    totalBytes,
    missingFiles: missing,
    downloading: currentDownload !== null,
  };
}

export async function cancelPyodideDownload(): Promise<void> {
  if (currentDownload) {
    currentDownload.abort();
    currentDownload = null;
  }
}

export async function downloadPyodide(): Promise<PyodideStatus> {
  if (currentDownload) {
    throw new Error("Pyodide download already in progress");
  }
  const controller = new AbortController();
  currentDownload = controller;
  const installPath = getPyodideInstallPath();
  mkdirSync(installPath, { recursive: true });

  try {
    for (const file of RUNTIME_FILES) {
      if (controller.signal.aborted) break;
      const target = join(installPath, file);
      if (existsSync(target)) continue;
      await downloadOne(file, installPath, controller.signal);
    }
    return await getPyodideStatus();
  } finally {
    currentDownload = null;
  }
}

async function downloadOne(
  file: string,
  installPath: string,
  signal: AbortSignal,
): Promise<number | null> {
  const url = `${CDN_BASE}${file}`;
  const target = join(installPath, file);
  mkdirSync(installPath, { recursive: true });

  const response = await fetch(url, { signal });
  // 404 = file not in this CDN layout for this version. Skip with a warning
  // so a future Pyodide release that drops/adds files doesn't brick the whole
  // download. Other non-OK statuses (5xx, 403) still throw.
  if (response.status === 404) {
    console.warn(`[pyodide-downloader] ${file} not present at ${CDN_BASE} (404) — skipping`);
    return null;
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  const total = Number(response.headers.get("content-length") ?? 0);
  const body = response.body;
  if (!body) {
    throw new Error(`No response body for ${url}`);
  }

  let received = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _enc, callback) {
      received += chunk.byteLength;
      for (const listener of listeners) {
        listener({ file, received, total });
      }
      callback(null, chunk);
    },
  });

  const nodeStream = body as unknown as NodeJS.ReadableStream;
  await pipeline(nodeStream, counter, createWriteStream(target));

  if (signal.aborted) {
    throw new Error("aborted");
  }

  const stat = statSync(target);
  return stat.size;
}
