"use client";

/**
 * Renderer-side Python sandbox via Pyodide.
 *
 * Pyodide runs INSIDE a sandboxed iframe (`sandbox="allow-scripts"`, NO
 * `allow-same-origin`) — the CVE-2026-59214 / Cyera-research pattern. The iframe
 * has an opaque origin so any `pyfetch` / `fetch` / `XMLHttpRequest` to the
 * app becomes cross-origin and is CORS-blocked. The renderer's main thread
 * never sees `loadPyodide()` or any Pyodide runtime symbol — it only posts
 * code to the iframe and reads the captured response.
 *
 * The iframe is destroyed between runs (memory hygiene + no persistence across
 * trusted boundaries). Timeout via `iframe.remove()` after N seconds.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface PyodideStatus {
  ready: boolean;
  version: string;
  installPath: string;
  installedBytes: number;
  totalBytes: number;
  missingFiles: readonly string[];
  downloading: boolean;
}

export interface PyodideRunResult {
  stdout: string;
  stderr: string;
  value: string | null;
  durationMs: number;
  timedOut: boolean;
  error: string | null;
}

interface PyodideBridge {
  status: () => Promise<PyodideStatus>;
  download: () => Promise<PyodideStatus>;
  cancel: () => Promise<void>;
  version: () => Promise<string>;
  onProgress: (
    callback: (progress: { file: string; received: number; total: number }) => void,
  ) => () => void;
}

const IFRAME_TIMEOUT_MS = 60_000;
const RUN_TIMEOUT_MS = 10_000;

const RESPONSE_KIND = "moudir:pyodide:result" as const;

const IFRAME_SRCDOC = String.raw`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' pyodide:; connect-src pyodide:; style-src 'unsafe-inline'">
<title>moudir-pyodide</title>
<script type="importmap">
{ "imports": { "pyodide": "pyodide://host/pyodide.mjs" } }
</script>
</head>
<body>
<script type="module">
  // Opaque-origin sandbox has no Web Storage: merely reading it throws.
  // Pyodide probes sessionStorage at startup, so stub both with memory maps
  // BEFORE the import below evaluates (static imports run first).
  const memStore = () => {
    const m = new Map();
    return {
      get length() { return m.size; },
      key: (i) => [...m.keys()][i] ?? null,
      getItem: (k) => (m.has(String(k)) ? m.get(String(k)) : null),
      setItem: (k, v) => { m.set(String(k), String(v)); },
      removeItem: (k) => { m.delete(String(k)); },
      clear: () => { m.clear(); },
    };
  };
  for (const name of ["localStorage", "sessionStorage"]) {
    try { Object.defineProperty(self, name, { value: memStore(), configurable: true }); }
    catch (_) {}
  }
  const { loadPyodide } = await import("pyodide");

  let pyodide = null;
  let pyodideReady = null;

  async function init() {
    if (pyodideReady) return pyodideReady;
    pyodideReady = (async () => {
      // No indexURL: the documented default derives it from the module URL
      // (pyodide://host/), and the docs recommend leaving it unchanged.
      pyodide = await loadPyodide();
      return pyodide;
    })();
    return pyodideReady;
  }

  function send(payload) {
    try { parent.postMessage(payload, "*"); } catch (_) {}
  }

  self.addEventListener("message", async (event) => {
    const data = event.data;
    if (!data || data.kind !== "moudir:pyodide:run") return;
    const started = Date.now();
    let output = "";
    let timedOut = false;
    let errorMessage = null;
    let value = null;
    try {
      await init();
      pyodide.setStdout({ batched: (text) => { output += text + "\n"; } });
      pyodide.setStderr({ batched: (text) => { output += text + "\n"; } });
      const result = await Promise.race([
        pyodide.runPythonAsync(data.source),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Timeout exécution Python (${RUN_TIMEOUT_MS} ms).")),
            ${RUN_TIMEOUT_MS},
          ),
        ),
      ]);
      if (result !== undefined && result !== null) {
        value = typeof result === "string" ? result : String(result);
      }
    } catch (err) {
      errorMessage = err && err.message ? err.message : String(err);
    } finally {
      try {
        pyodide.setStdout({ batched: () => {} });
        pyodide.setStderr({ batched: () => {} });
      } catch (_) {}
    }
    send({
      kind: "${RESPONSE_KIND}",
      id: data.id,
      stdout: output,
      stderr: errorMessage ?? "",
      value,
      durationMs: Date.now() - started,
      timedOut,
      error: errorMessage,
    });
  });

  send({ kind: "moudir:pyodide:ready" });
</script>
</body>
</html>`;

function bridge(): PyodideBridge | null {
  if (typeof window === "undefined") return null;
  return window.electronPyodide ?? null;
}

export async function getPyodideStatus(): Promise<PyodideStatus | null> {
  return bridge()?.status() ?? null;
}

export async function downloadPyodide(): Promise<PyodideStatus | null> {
  return bridge()?.download() ?? null;
}

export async function cancelPyodideDownload(): Promise<void> {
  return bridge()?.cancel();
}

export function onPyodideDownloadProgress(
  callback: (progress: { file: string; received: number; total: number }) => void,
): () => void {
  const api = bridge();
  if (!api) return () => {};
  return api.onProgress(callback);
}

export function usePyodideSandbox() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const pendingRef = useRef<{
    resolve: (result: PyodideRunResult) => void;
    timer: ReturnType<typeof setTimeout>;
    id: number;
  } | null>(null);
  // Set when the iframe's module posts moudir:pyodide:ready, i.e. its run
  // listener is registered. Posting the run before that drops it silently
  // (no listener yet) and the call hangs until the 60s timeout.
  const readyRef = useRef(false);
  const idCounter = useRef(0);
  const [isRunning, setIsRunning] = useState(false);

  const cleanup = useCallback(() => {
    if (pendingRef.current) {
      clearTimeout(pendingRef.current.timer);
      pendingRef.current = null;
    }
    if (iframeRef.current) {
      iframeRef.current.remove();
      iframeRef.current = null;
    }
    readyRef.current = false;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data as {
        kind?: string;
        id?: number;
        stdout?: unknown;
        stderr?: unknown;
        value?: unknown;
        durationMs?: unknown;
        timedOut?: unknown;
        error?: unknown;
      } | null;
      if (!data) return;
      if (data.kind === "moudir:pyodide:ready") {
        if (event.source === iframeRef.current?.contentWindow) readyRef.current = true;
        return;
      }
      if (data.kind !== RESPONSE_KIND) return;
      const pending = pendingRef.current;
      if (!pending || data.id !== pending.id) return;
      clearTimeout(pending.timer);
      pendingRef.current = null;
      iframeRef.current?.remove();
      iframeRef.current = null;
      setIsRunning(false);
      pending.resolve({
        stdout: String(data.stdout),
        stderr: String(data.stderr),
        value: data.value === null ? null : String(data.value),
        durationMs: Number(data.durationMs ?? 0),
        timedOut: Boolean(data.timedOut),
        error: data.error ? String(data.error) : null,
      });
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const run = useCallback(
    (source: string): Promise<PyodideRunResult> => {
      cleanup();
      const id = ++idCounter.current;
      const iframe = document.createElement("iframe");
      iframe.setAttribute("sandbox", "allow-scripts");
      iframe.setAttribute("aria-hidden", "true");
      iframe.title = "moudir pyodide sandbox";
      iframe.srcdoc = IFRAME_SRCDOC;
      iframe.style.cssText = "position:absolute;width:0;height:0;border:0;visibility:hidden;";
      document.body.appendChild(iframe);
      iframeRef.current = iframe;
      setIsRunning(true);
      return new Promise<PyodideRunResult>((resolve) => {
        const timer = setTimeout(() => {
          if (pendingRef.current?.id !== id) return;
          pendingRef.current = null;
          iframeRef.current?.remove();
          iframeRef.current = null;
          setIsRunning(false);
          resolve({
            stdout: "",
            stderr: "",
            value: null,
            durationMs: IFRAME_TIMEOUT_MS,
            timedOut: true,
            error: `Délai d'exécution Pyodide dépassé (${IFRAME_TIMEOUT_MS} ms).`,
          });
        }, IFRAME_TIMEOUT_MS);
        pendingRef.current = { resolve, timer, id };
        readyRef.current = false;
        function postWhenReady() {
          // The iframe may be gone (timeout/cleanup) — stop polling then.
          if (pendingRef.current?.id !== id) return;
          const win = iframe.contentWindow;
          if (!win || !readyRef.current) {
            requestAnimationFrame(postWhenReady);
            return;
          }
          win.postMessage({ kind: "moudir:pyodide:run", id, source }, "*");
        }
        requestAnimationFrame(postWhenReady);
      });
    },
    [cleanup],
  );

  return { run, isRunning };
}
