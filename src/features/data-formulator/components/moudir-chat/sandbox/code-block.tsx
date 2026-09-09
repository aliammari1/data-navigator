"use client";

/**
 * Chat-rendered code execution card.
 *
 * Compact card: code preview + [▶ Run] (or [↻ Re-run] after a run) + the
 * captured stdout / stderr / last-expression value beneath. The Python lane
 * is a placeholder today — Pyodide is opt-in (offline-downloadable from the
 * Moudir settings panel) and the runtime isn't wired here yet, so the
 * Python card shows "sandbox Python requires Pyodide" with the route to
 * enable it.
 */

import {
  Code2,
  Download,
  Eye,
  EyeOff,
  Loader2,
  Play,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  CodeBlock as AICodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockTitle,
} from "@/components/ai-elements/code-block";
import { Button } from "@/components/ui/button";
import {
  cancelPyodideDownload,
  downloadPyodide,
  getPyodideStatus,
  onPyodideDownloadProgress,
  usePyodideSandbox,
} from "@/platform/pyodide/pyodide-client";
import { cn } from "@/shared/utils";
import { type ChartPart, chartDataToRows } from "../../../store/moudir-chat-store";
import { ChatChartArtifact } from "../chat-chart-artifact";
import { useJsSandbox } from "./js-sandbox";
import type { CodeBlock, PyodideRunResult, RunResult } from "./types";

/**
 * A make_chart({...}) call pasted as Python. The model sometimes emits the
 * chat tool as code instead of invoking it — parse its JSON args so the card
 * can preview the real chart UI instead of running Python into a NameError.
 */
function parseMakeChartCall(source: string): Omit<ChartPart, "kind" | "datasetId"> | null {
  const match = /^\s*make_chart\s*\(([\s\S]*)\)\s*$/.exec(source.trim());
  if (!match?.[1]) return null;
  try {
    const params = JSON.parse(match[1]) as Record<string, unknown>;
    const str = (v: unknown, fallback: string) => (typeof v === "string" && v ? v : fallback);
    const x = str(params.x, "");
    const y = str(params.y, "");
    return {
      chartType: str(params.chart_type, "bar"),
      x,
      y,
      aggregate: str(params.aggregate, "none"),
      title: str(params.title, "Graphique"),
      rows: chartDataToRows(x, y, params.data),
    };
  } catch {
    return null;
  }
}

interface CodeBlockCardProps {
  block: CodeBlock;
  /** Master switch (Settings → Moudir → Sandbox). When false, cards still
   * render but the run button is disabled with a tooltip. */
  enabled: boolean;
}

export function CodeBlockCard({ block, enabled }: CodeBlockCardProps) {
  const { run, isRunning } = useJsSandbox({ enabled: enabled && block.kind === "js-run" });
  const [result, setResult] = useState<RunResult | null>(null);

  if (block.kind === "python-run") {
    return <PythonCodeCard block={block} enabled={enabled} />;
  }

  const onRun = async () => {
    setResult(null);
    const next = await run(block.source);
    setResult(next);
  };

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-border bg-card/60">
      <AICodeBlock
        code={block.source}
        language="javascript"
        showLineNumbers
        className="rounded-none border-0 bg-transparent"
      >
        <CodeBlockHeader className="border-b border-border bg-muted/40 px-3 py-1.5">
          <CodeBlockTitle>
            <Code2 className="size-3.5" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              JavaScript
            </span>
          </CodeBlockTitle>
          <CodeBlockActions>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRun}
              disabled={isRunning || !enabled}
              className={cn(
                "h-6 gap-1.5 px-2 text-xs font-medium transition",
                "border-ai/40 text-ai hover:bg-ai/10",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
              title={
                enabled
                  ? "Exécuter dans le sandbox"
                  : "Sandbox désactivé dans les paramètres Moudir"
              }
            >
              {isRunning ? (
                <Loader2 className="size-3 animate-spin" />
              ) : result ? (
                <RefreshCw className="size-3" />
              ) : (
                <Play className="size-3" />
              )}
              <span>{isRunning ? "Exécution…" : result ? "Re-run" : "Run"}</span>
            </Button>
            <CodeBlockCopyButton />
          </CodeBlockActions>
        </CodeBlockHeader>
      </AICodeBlock>
      {result ? <RunResultView result={result} /> : null}
    </div>
  );
}

function RunResultView({ result }: { result: RunResult }) {
  const hasError = Boolean(result.error) || result.stderr.length > 0;
  return (
    <div
      className={cn(
        "border-t border-border px-3 py-2 text-xs",
        hasError ? "bg-destructive/5" : "bg-emerald-500/5",
      )}
    >
      <div className="mb-1 flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span>{result.timedOut ? "Délai dépassé" : hasError ? "Erreur" : "Sortie"}</span>
        <span>{result.durationMs.toLocaleString("fr-FR")} ms</span>
      </div>
      {result.value !== null ? (
        <pre
          className="mb-2 overflow-x-auto rounded-md bg-background/60 px-2 py-1 font-mono text-[11px] text-foreground"
          aria-label="Dernière expression"
        >
          {result.value}
        </pre>
      ) : null}
      {result.stdout ? (
        <pre
          className="overflow-x-auto whitespace-pre-wrap font-mono text-[11px] leading-snug text-foreground"
          aria-label="stdout"
        >
          {result.stdout}
        </pre>
      ) : null}
      {result.stderr ? (
        <pre
          className="mt-1 overflow-x-auto whitespace-pre-wrap rounded-md bg-destructive/10 px-2 py-1 font-mono text-[11px] leading-snug text-destructive"
          aria-label="stderr"
        >
          {result.stderr}
        </pre>
      ) : null}
      {result.error ? (
        <p className="mt-1 flex items-start gap-1.5 text-destructive">
          <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> {result.error}
        </p>
      ) : null}
    </div>
  );
}

function PythonCodeCard({ block, enabled }: { block: CodeBlock; enabled: boolean }) {
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "downloading" | "error">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    file: string;
    received: number;
    total: number;
  } | null>(null);
  const [result, setResult] = useState<PyodideRunResult | null>(null);
  const [showChart, setShowChart] = useState(false);
  const { run, isRunning } = usePyodideSandbox();
  const chartSpec = parseMakeChartCall(block.source);

  useEffect(() => {
    if (!enabled) {
      setStatus("missing");
      return;
    }
    let alive = true;
    void getPyodideStatus().then((s) => {
      if (!alive || !s) return;
      setStatus(s.ready ? "ready" : s.downloading ? "downloading" : "missing");
    });
    const unsubscribe = onPyodideDownloadProgress((progress) => {
      setProgress(progress);
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [enabled]);

  const onDownload = async () => {
    setStatus("downloading");
    setError(null);
    setProgress(null);
    try {
      const next = await downloadPyodide();
      if (next?.ready) {
        setStatus("ready");
      } else {
        setStatus("error");
        setError("Téléchargement incomplet, fichiers manquants.");
      }
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onRun = async () => {
    if (status !== "ready") return;
    setResult(null);
    const next = await run(block.source);
    setResult(next);
  };

  const onCancel = () => {
    void cancelPyodideDownload();
    setStatus("missing");
    setProgress(null);
  };

  const downloadPct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.received / progress.total) * 100))
      : null;

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-amber-500/30 bg-amber-500/5">
      <AICodeBlock
        code={block.source}
        language="python"
        showLineNumbers
        className="rounded-none border-0 bg-transparent"
      >
        <CodeBlockHeader className="border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5">
          <CodeBlockTitle>
            <Code2 className="size-3.5 text-amber-700 dark:text-amber-300" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
              Python
            </span>
          </CodeBlockTitle>
          <CodeBlockActions>
            <span className="mr-1 text-[10px] text-amber-700 dark:text-amber-300">
              {status === "ready"
                ? "Pyodide prêt"
                : status === "downloading"
                  ? downloadPct !== null
                    ? `Téléchargement ${downloadPct}%`
                    : "Téléchargement…"
                  : status === "error"
                    ? "Erreur"
                    : status === "loading"
                      ? "Vérification…"
                      : "Pyodide requis"}
            </span>
            <CodeBlockCopyButton />
          </CodeBlockActions>
        </CodeBlockHeader>
      </AICodeBlock>
      <div className="flex items-center justify-between gap-2 border-t border-amber-500/30 bg-amber-500/5 px-3 py-2">
        {status === "loading" ? (
          <span className="text-[11px] text-amber-700 dark:text-amber-300">
            <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
            Vérification du runtime Pyodide…
          </span>
        ) : status === "missing" ? (
          <button
            type="button"
            onClick={onDownload}
            disabled={!enabled}
            className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-500/20 disabled:opacity-50 dark:text-amber-300"
          >
            <Download className="h-3 w-3" />
            Télécharger Pyodide (~10 Mo)
          </button>
        ) : status === "downloading" ? (
          <div className="flex flex-1 items-center gap-2">
            <ProgressBar value={downloadPct ?? 0} />
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 px-1.5 py-0.5 text-[10px] text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
            >
              Annuler
            </button>
          </div>
        ) : status === "error" ? (
          <div className="flex flex-1 items-center gap-2">
            <span className="text-[11px] text-amber-700 dark:text-amber-300">{error}</span>
            <button
              type="button"
              onClick={onDownload}
              className="ml-auto inline-flex items-center gap-1 rounded-md border border-amber-500/40 px-2 py-0.5 text-[10px] text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
            >
              Réessayer
            </button>
          </div>
        ) : chartSpec ? (
          <button
            type="button"
            onClick={() => setShowChart((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-500/20 disabled:opacity-50 dark:text-amber-300"
          >
            {showChart ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            {showChart ? "Masquer le graphique" : "Afficher le graphique"}
          </button>
        ) : (
          <button
            type="button"
            onClick={onRun}
            disabled={isRunning || !enabled}
            className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-500/20 disabled:opacity-50 dark:text-amber-300"
          >
            {isRunning ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : result ? (
              <RefreshCw className="h-3 w-3" />
            ) : (
              <Play className="h-3 w-3" />
            )}
            {isRunning ? "Exécution…" : result ? "Re-run" : "Run"}
          </button>
        )}
      </div>
      {chartSpec && showChart ? (
        <div className="border-t border-amber-500/30 px-3 py-2">
          <ChatChartArtifact part={{ kind: "chart", datasetId: null, ...chartSpec }} />
        </div>
      ) : null}
      {result ? <RunResultView result={result} /> : null}
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div
      className="h-1.5 flex-1 overflow-hidden rounded-full bg-amber-500/20"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-full bg-amber-500 transition-all" style={{ width: `${value}%` }} />
    </div>
  );
}
