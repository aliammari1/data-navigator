"use client";
/**
 * Python sandbox client — wraps the Pyodide worker behind a promise API with
 * streaming stdout/stderr.
 *
 * One worker is shared across the app; sessions are isolated by sessionId.
 * Modeled after the langchain-sandbox JS client surface so swapping in a real
 * langchain-sandbox runtime later is a one-file change.
 */

import type { SandboxRequest, SandboxResponse } from "@/workers/python-sandbox.worker";

let _worker: Worker | null = null;
let _readyPromise: Promise<void> | null = null;

const WORKER_URL = "/workers/python-sandbox.worker.js";

function getWorker(): Worker {
  if (!_worker) {
    // Precompiled worker served as a static asset (see package.json worker:build).
    // Mirrors the DuckDB shared-worker pattern in src/platform/duckdb/duckdb-client.ts.
    _worker = new Worker(WORKER_URL);
  }
  return _worker;
}

function nextId(): string {
  return `sbx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface RunOptions {
  sessionId: string;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  onProgress?: (text: string) => void;
}

export interface RunResult {
  value: unknown;
  stdout: string;
  stderr: string;
  durationMs: number;
}

function send<T>(
  request: SandboxRequest,
  opts: {
    onProgress?: (s: string) => void;
    onStdout?: (s: string) => void;
    onStderr?: (s: string) => void;
  },
): Promise<T> {
  const worker = getWorker();
  return new Promise<T>((resolve, reject) => {
    const handler = (e: MessageEvent<SandboxResponse>) => {
      if (e.data.id !== request.id) return;
      switch (e.data.type) {
        case "LOAD_PROGRESS":
          opts.onProgress?.(e.data.text);
          break;
        case "STDOUT":
          opts.onStdout?.(e.data.text);
          break;
        case "STDERR":
          opts.onStderr?.(e.data.text);
          break;
        case "READY":
          worker.removeEventListener("message", handler);
          resolve(undefined as T);
          break;
        case "RESULT":
          worker.removeEventListener("message", handler);
          resolve(e.data.value as T);
          break;
        case "ERROR":
          worker.removeEventListener("message", handler);
          reject(new Error(e.data.error));
          break;
      }
    };
    worker.addEventListener("message", handler);
    worker.postMessage(request);
  });
}

export function ensureSandboxReady(onProgress?: (s: string) => void): Promise<void> {
  if (!_readyPromise) {
    _readyPromise = send<void>({ id: nextId(), type: "INIT" }, { onProgress });
  }
  return _readyPromise;
}

export async function loadDataFrame(
  sessionId: string,
  varName: string,
  rows: Record<string, unknown>[],
  onProgress?: (s: string) => void,
): Promise<void> {
  await ensureSandboxReady(onProgress);
  await send<unknown>(
    { id: nextId(), type: "LOAD_DATAFRAME", sessionId, varName, rows },
    { onProgress },
  );
}

export async function installPackages(
  sessionId: string,
  packages: string[],
  onProgress?: (s: string) => void,
): Promise<void> {
  await ensureSandboxReady(onProgress);
  await send<unknown>({ id: nextId(), type: "INSTALL", sessionId, packages }, { onProgress });
}

export async function runPython(code: string, opts: RunOptions): Promise<RunResult> {
  await ensureSandboxReady(opts.onProgress);
  const start = performance.now();
  let stdout = "";
  let stderr = "";
  const value = await send<unknown>(
    { id: nextId(), type: "RUN", code, sessionId: opts.sessionId },
    {
      onProgress: opts.onProgress,
      onStdout: (s) => {
        stdout += s;
        opts.onStdout?.(s);
      },
      onStderr: (s) => {
        stderr += s;
        opts.onStderr?.(s);
      },
    },
  );
  return {
    value,
    stdout,
    stderr,
    durationMs: Math.round(performance.now() - start),
  };
}

export async function resetSession(sessionId: string): Promise<void> {
  await send<unknown>({ id: nextId(), type: "RESET", sessionId }, {});
}
