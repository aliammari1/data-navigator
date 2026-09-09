"use client";

/**
 * In-chat JavaScript sandbox.
 *
 * Renders a sandboxed iframe (`sandbox="allow-scripts"`, NO `allow-same-origin`)
 * that executes user code via the `Function` constructor and reports the
 * captured stdout / stderr / last-expression value back to the parent via
 * `postMessage`. The iframe is destroyed the moment the code settles, on a
 * timeout, or when the parent unmounts — there is no persistent runtime.
 *
 * Hardening (matches the CVE-2026-59214 / Cyera-research guidance):
 *   - `sandbox="allow-scripts"` only — no `allow-same-origin` so the iframe
 *     gets an opaque origin. CORS / SOP block any same-origin credentialed
 *     fetch (session cookies, localStorage, IPC).
 *   - `srcdoc` (inline HTML) — the runtime never loads a network resource.
 *   - CSP `default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'` —
 *     no fetch, no network, no worker, no img. The only allowed operations
 *     are inline scripts and eval.
 *   - `worker.terminate()`-style teardown: `iframe.remove()` is the only
 *     authoritative timeout.
 *   - Output cap: stdout/stderr are concatenated to 16 KiB before truncation
 *     so a runaway `while(true) console.log('x')` cannot blow up the DOM.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { RunResult } from "./types";

const IFRAME_TIMEOUT_MS = 5_000;
const MAX_OUTPUT_BYTES = 16 * 1024;

const RESPONSE_KIND = "moudir:sandbox:result" as const;

const SRCDOC = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'">
<title>moudir-sandbox</title>
</head>
<body>
<script>
  (function () {
    var stdout = '';
    var stderr = '';
    var originalLog = console.log;
    var originalInfo = console.info;
    var originalWarn = console.warn;
    var originalError = console.error;
    var originalDir = console.dir;

    function chunk(kind, args) {
      var text = args.map(function (a) {
        if (typeof a === 'string') return a;
        try { return JSON.stringify(a); } catch (_) { return String(a); }
      }).join(' ');
      if (kind === 'err') stderr += text + '\\n';
      else stdout += text + '\\n';
    }

    console.log = function () { chunk('out', Array.prototype.slice.call(arguments)); };
    console.info = function () { chunk('out', Array.prototype.slice.call(arguments)); };
    console.warn = function () { chunk('err', Array.prototype.slice.call(arguments)); };
    console.error = function () { chunk('err', Array.prototype.slice.call(arguments)); };
    console.dir = function (v) { chunk('out', [v]); };

    function send(payload) {
      try { parent.postMessage(payload, '*'); } catch (_) {}
    }

    function truncate(s) {
      if (s.length <= ${MAX_OUTPUT_BYTES}) return s;
      return s.slice(0, ${MAX_OUTPUT_BYTES}) + '\\n…[truncated]';
    }

    self.addEventListener('message', function (event) {
      var data = event.data;
      if (!data || data.kind !== 'moudir:sandbox:run') return;
      var started = Date.now();
      var value = null;
      var timedOut = false;
      var errorMessage = null;
      try {
        var fn = new Function('"use strict";' + data.source);
        var result = fn();
        if (result && typeof result.then === 'function') {
          result.then(function (v) {
            send({
              kind: '${RESPONSE_KIND}',
              id: data.id,
              stdout: truncate(stdout),
              stderr: truncate(stderr),
              value: v === undefined ? null : (typeof v === 'string' ? v : safeStringify(v)),
              durationMs: Date.now() - started,
              timedOut: false,
              error: null,
            });
          }, function (err) {
            send({
              kind: '${RESPONSE_KIND}',
              id: data.id,
              stdout: truncate(stdout),
              stderr: truncate(stderr) + (err && err.stack ? err.stack : String(err)),
              value: null,
              durationMs: Date.now() - started,
              timedOut: false,
              error: err && err.message ? err.message : String(err),
            });
          });
          return;
        }
        value = result === undefined ? null : (typeof result === 'string' ? result : safeStringify(result));
      } catch (err) {
        errorMessage = err && err.message ? err.message : String(err);
        if (err && err.stack) stderr += err.stack + '\\n';
      }
      send({
        kind: '${RESPONSE_KIND}',
        id: data.id,
        stdout: truncate(stdout),
        stderr: truncate(stderr),
        value: value,
        durationMs: Date.now() - started,
        timedOut: timedOut,
        error: errorMessage,
      });
    });

    function safeStringify(v) {
      try { return JSON.stringify(v); } catch (_) { return String(v); }
    }

    send({ kind: 'moudir:sandbox:ready' });
  })();
</script>
</body>
</html>`;

interface UseJsSandboxOptions {
  /** Whether execution is allowed at all (e.g. user disabled it in Settings). */
  enabled: boolean;
}

export function useJsSandbox(options: UseJsSandboxOptions = { enabled: true }) {
  const { enabled } = options;
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const pendingRef = useRef<{
    resolve: (result: RunResult) => void;
    timer: ReturnType<typeof setTimeout>;
    id: number;
  } | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const idCounter = useRef(0);

  const cleanup = useCallback(() => {
    if (pendingRef.current) {
      clearTimeout(pendingRef.current.timer);
      pendingRef.current = null;
    }
    if (iframeRef.current) {
      iframeRef.current.remove();
      iframeRef.current = null;
    }
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
      if (data.kind === "moudir:sandbox:ready") return;
      if (data.kind !== RESPONSE_KIND) return;
      const pending = pendingRef.current;
      if (!pending || data.id !== pending.id) return;
      clearTimeout(pending.timer);
      pendingRef.current = null;
      iframeRef.current?.remove();
      iframeRef.current = null;
      setIsRunning(false);
      pending.resolve({
        stdout: String(data.stdout ?? ""),
        stderr: String(data.stderr ?? ""),
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
    (source: string): Promise<RunResult> => {
      if (!enabled) {
        return Promise.resolve({
          stdout: "",
          stderr: "",
          value: null,
          durationMs: 0,
          timedOut: false,
          error: "Sandbox désactivé dans les paramètres Moudir.",
        });
      }
      cleanup();
      const id = ++idCounter.current;
      const iframe = document.createElement("iframe");
      iframe.setAttribute("sandbox", "allow-scripts");
      iframe.setAttribute("aria-hidden", "true");
      iframe.title = "moudir sandbox";
      iframe.srcdoc = SRCDOC;
      iframe.style.cssText = "position:absolute;width:0;height:0;border:0;visibility:hidden;";
      document.body.appendChild(iframe);
      iframeRef.current = iframe;
      setIsRunning(true);
      return new Promise<RunResult>((resolve) => {
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
            error: `Délai d'exécution dépassé (${IFRAME_TIMEOUT_MS} ms).`,
          });
        }, IFRAME_TIMEOUT_MS);
        pendingRef.current = { resolve, timer, id };
        function postWhenReady() {
          const win = iframe.contentWindow;
          if (!win) {
            requestAnimationFrame(postWhenReady);
            return;
          }
          win.postMessage({ kind: "moudir:sandbox:run", id, source }, "*");
        }
        // Wait for the iframe to parse the srcdoc and signal ready.
        requestAnimationFrame(postWhenReady);
      });
    },
    [enabled, cleanup],
  );

  return { run, isRunning };
}
