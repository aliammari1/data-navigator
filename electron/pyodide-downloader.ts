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

import { createHash, randomUUID } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { app } from "electron";

const PYODIDE_VERSION = "0.26.2";
const CDN_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

// jsDelivr's `cdn.jsdelivr.net/pyodide/v<ver>/full/` ships these five files
// for 0.26.2. A missing file or hash mismatch now fails the install.
const RUNTIME_FILES = [
  "pyodide.mjs",
  "pyodide.asm.js",
  "pyodide.asm.wasm",
  "pyodide-lock.json",
  "python_stdlib.zip",
] as const;

// SHA-256 of the exact Pyodide 0.26.2 files served by the versioned CDN path.
// Review these values against a trusted release when upgrading Pyodide.
const RUNTIME_SHA256: Record<(typeof RUNTIME_FILES)[number], string> = {
  "pyodide.mjs": "4bfef438ee0af4503ca048c6c1913e05c2cf2c5b5755dae7413b96bd13f87e7e",
  "pyodide.asm.js": "704e56d209d8b867c8dd42e754a246db0175e448d59a46530803bdddfdfc78e0",
  "pyodide.asm.wasm": "8f631d8453672664131b2d4c9c41f3adf5d32e9efda2cb421d3fdf38cab57a21",
  "pyodide-lock.json": "0cb7ca8faf9c35af92b4d261996ddd51dd9a6c1074ee59279f1570d67af29644",
  "python_stdlib.zip": "0dd443755a0244ae3052f2e0834413d68c43f362c651edd47b785ea9d26e4853",
};

export async function sha256FileMatches(filePath: string, expected: string): Promise<boolean> {
  const hash = createHash("sha256");
  try {
    for await (const chunk of createReadStream(filePath)) hash.update(chunk);
    return hash.digest("hex") === expected;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export interface PyodideStatus {
  ready: boolean;
  version: string;
  installPath: string;
  installedBytes: number;
  totalBytes: number;
  missingFiles: readonly string[];
  downloading: boolean;
}

interface DownloadProgress {
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

export async function getPyodideStatus(): Promise<PyodideStatus> {
  const installPath = getPyodideInstallPath();
  const missing: string[] = [];
  let installedBytes = 0;
  let totalBytes = 0;
  for (const file of RUNTIME_FILES) {
    const target = join(installPath, file);
    try {
      const stat = statSync(target);
      if (!(await sha256FileMatches(target, RUNTIME_SHA256[file]))) {
        missing.push(file);
        totalBytes += stat.size;
        continue;
      }
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
      if (controller.signal.aborted) throw new Error("Pyodide download aborted");
      const target = join(installPath, file);
      if (await sha256FileMatches(target, RUNTIME_SHA256[file])) continue;
      await downloadOne(file, installPath, controller.signal);
    }
    if (controller.signal.aborted) throw new Error("Pyodide download aborted");
    return await getPyodideStatus();
  } finally {
    if (currentDownload === controller) currentDownload = null;
  }
}

async function downloadOne(
  file: (typeof RUNTIME_FILES)[number],
  installPath: string,
  signal: AbortSignal,
): Promise<number> {
  const url = `${CDN_BASE}${file}`;
  const target = join(installPath, file);
  const partial = `${target}.part-${randomUUID()}`;
  mkdirSync(installPath, { recursive: true });

  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  const total = Number(response.headers.get("content-length") ?? 0);
  const body = response.body;
  if (!body) {
    throw new Error(`No response body for ${url}`);
  }

  let received = 0;
  const hash = createHash("sha256");
  const counter = new Transform({
    transform(chunk: Buffer, _enc, callback) {
      received += chunk.byteLength;
      hash.update(chunk);
      for (const listener of listeners) {
        listener({ file, received, total });
      }
      callback(null, chunk);
    },
  });

  try {
    const nodeStream = body as unknown as NodeJS.ReadableStream;
    await pipeline(nodeStream, counter, createWriteStream(partial));
    if (signal.aborted) throw new Error("aborted");
    if (hash.digest("hex") !== RUNTIME_SHA256[file]) {
      throw new Error(`Pyodide runtime integrity check failed for ${file}`);
    }
    renameSync(partial, target);
    return statSync(target).size;
  } finally {
    rmSync(partial, { force: true });
  }
}
