"use client";

import { Loader2, Play, RefreshCw, Terminal } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AtlasButton } from "@/design/primitives/button";
import { AtlasInput } from "@/design/primitives/input";
import {
  ensureSandboxReady,
  installPackages,
  loadDataFrame,
  resetSession,
  runPython,
} from "@/platform/python-sandbox/core";

interface Props {
  rows: Record<string, unknown>[];
  tableName: string;
}

export function StepSandbox({ rows, tableName }: Props) {
  const sessionRef = useRef(`analyst-${Date.now()}`);
  const [code, setCode] = useState<string>(
    `# 'df' is the active dataset as a pandas DataFrame.
# numpy + pandas are pre-loaded; install more with the box below.
print(df.shape)
print(df.head())
print(df.describe(include='all').T)
`,
  );
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [pkgInput, setPkgInput] = useState("");

  const ensureLoaded = useCallback(async () => {
    if (ready) return;
    try {
      setProgress("Loading…");
      await ensureSandboxReady((p) => setProgress(p));
      if (rows.length) {
        await loadDataFrame(sessionRef.current, "df", rows);
      }
      setReady(true);
      setProgress("Ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [rows, ready]);

  useEffect(() => {
    if (ready && rows.length) {
      loadDataFrame(sessionRef.current, "df", rows).catch(() => {});
    }
  }, [rows, ready]);

  const run = useCallback(async () => {
    await ensureLoaded();
    setRunning(true);
    setOutput("");
    setError("");
    try {
      const r = await runPython(code, {
        sessionId: sessionRef.current,
        onStdout: (s) => setOutput((o) => o + s),
        onStderr: (s) => setOutput((o) => `${o}[stderr] ${s}`),
      });
      setOutput(
        (o) => `${o}\n\n[ok] ${r.durationMs}ms · returned ${typeof r.value}\n`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, [code, ensureLoaded]);

  const install = useCallback(async () => {
    if (!pkgInput.trim()) return;
    await ensureLoaded();
    try {
      await installPackages(
        sessionRef.current,
        pkgInput
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean),
      );
      setOutput((o) => `${o}\n[ok] installed: ${pkgInput}\n`);
      setPkgInput("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [pkgInput, ensureLoaded]);

  const reset = useCallback(async () => {
    await resetSession(sessionRef.current);
    sessionRef.current = `analyst-${Date.now()}`;
    setReady(false);
    setOutput("");
    setError("");
  }, []);

  return (
    <div className="rounded-(--atlas-radius-3) border border-(--atlas-border) bg-(--atlas-surface) overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-(--atlas-border)">
        <Terminal className="w-4 h-4 text-(--atlas-success-fg)" />
        <span className="text-sm font-semibold text-(--atlas-text)">
          Python Sandbox · Pyodide
        </span>
        {ready ? (
          <span className="text-[10px] text-(--atlas-success-fg)">
            ● ready
          </span>
        ) : progress ? (
          <span className="text-[10px] text-(--atlas-warning-fg)">
            {progress}
          </span>
        ) : null}
        <span className="ml-auto text-[10px] text-(--atlas-text-subtle)">
          {tableName} · {rows.length} rows
        </span>
        <AtlasButton variant="ghost" size="xs" onClick={reset}>
          <RefreshCw className="w-3 h-3" /> Reset
        </AtlasButton>
      </div>
      <div className="grid lg:grid-cols-2 gap-px bg-(--atlas-border)">
        <div className="bg-(--atlas-surface) flex flex-col min-h-[300px]">
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
            className="atlas-focus-ring flex-1 bg-transparent p-3 text-xs font-mono text-(--atlas-text) outline-none resize-none"
          />
          <div className="px-3 py-2 border-t border-(--atlas-border) flex items-center gap-2">
            <AtlasButton
              variant="solid"
              size="sm"
              onClick={run}
              disabled={running}
            >
              {running ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Play className="w-3 h-3" />
              )}
              Run
            </AtlasButton>
            <AtlasInput
              size="sm"
              placeholder="micropip: scipy, scikit-learn…"
              value={pkgInput}
              onChange={(e) => setPkgInput(e.target.value)}
            />
            <AtlasButton variant="outline" size="sm" onClick={install}>
              Install
            </AtlasButton>
          </div>
        </div>
        <div className="bg-(--atlas-bg-subtle) min-h-[300px] flex flex-col">
          <div className="px-3 py-1.5 border-b border-(--atlas-border) text-[10px] uppercase tracking-wide text-(--atlas-text-subtle) font-bold">
            Output
          </div>
          <pre className="flex-1 overflow-auto p-3 text-xs font-mono text-(--atlas-text) whitespace-pre-wrap">
            {output ||
              "Press Run. The current dataset is bound to `df` (pandas DataFrame)."}
            {error && (
              <span className="text-(--atlas-danger-fg)">
                {"\n"}
                {error}
              </span>
            )}
          </pre>
        </div>
      </div>
    </div>
  );
}
