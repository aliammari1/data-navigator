"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadLLM } from "@/platform/ai/transformers-engine";
import { type LLMModelDef, MODEL_CATALOG } from "@/features/agent-canvas/core/types";
import { cn } from "@/shared/utils";

interface Props {
  onLoaded: (modelId: string) => void;
  onSkip: () => void;
}

const DEBUG_PREFIX = "[ModelPicker]";

function debugLog(event: string, data?: unknown) {
  console.log(`${DEBUG_PREFIX} ${event}`, data ?? "");
}

function debugWarn(event: string, data?: unknown) {
  console.warn(`${DEBUG_PREFIX} ${event}`, data ?? "");
}

function debugError(event: string, data?: unknown) {
  console.error(`${DEBUG_PREFIX} ${event}`, data ?? "");
}

function makeTraceId(modelId: string) {
  return `model-picker-${modelId}-${Date.now()}`;
}

export function ModelPicker({ onLoaded, onSkip }: Props) {
  const [selected, setSelected] = useState<string>(MODEL_CATALOG[0].id);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const loadStartedAtRef = useRef<number | null>(null);
  const activeTraceIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const def = useMemo(() => {
    const found = MODEL_CATALOG.find((m) => m.id === selected);

    if (!found) {
      debugError("selected model not found in MODEL_CATALOG", {
        selected,
        catalog: MODEL_CATALOG.map((m) => m.id),
      });

      return MODEL_CATALOG[0];
    }

    return found;
  }, [selected]);

  // Intentional: only log initial mount/unmount.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount/unmount-only logging effect; reads current selected/loading at lifecycle boundaries by design
  useEffect(() => {
    debugLog("mounted", {
      initialSelected: selected,
      modelCount: MODEL_CATALOG.length,
      models: MODEL_CATALOG.map((m) => ({
        id: m.id,
        label: m.label,
        sizeLabel: m.sizeLabel,
        downloadMB: m.downloadMB,
      })),
    });

    return () => {
      debugWarn("unmounting", {
        loading,
        activeTraceId: activeTraceIdRef.current,
      });

      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    debugLog("selected changed", {
      selected,
      def,
    });
  }, [selected, def]);

  useEffect(() => {
    debugLog("state changed", {
      selected,
      loading,
      progress,
      progressPercent: Math.round(progress * 100),
      status,
      error,
      activeTraceId: activeTraceIdRef.current,
    });
  }, [selected, loading, progress, status, error]);

  async function handleLoad() {
    const traceId = makeTraceId(selected);
    activeTraceIdRef.current = traceId;
    loadStartedAtRef.current = performance.now();

    console.groupCollapsed(`${DEBUG_PREFIX} trace=${traceId} handleLoad`);

    debugLog("handleLoad clicked", {
      traceId,
      selected,
      def,
      loading,
    });

    if (loading) {
      debugWarn("handleLoad ignored because loading=true", {
        traceId,
        selected,
      });
      console.groupEnd();
      return;
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setLoading(true);
    setError("");
    setProgress(0);
    setStatus("Starting model load…");

    try {
      debugLog("calling loadLLM", {
        traceId,
        selected,
        modelId: selected,
        dtype: "q4",
        preferredDevice: "auto",
      });

      /**
       * IMPORTANT:
       * This matches the debug llm.ts version:
       *
       * loadLLM({
       *   modelId,
       *   dtype,
       *   preferredDevice,
       *   onProgress,
       *   traceId,
       *   debug,
       * })
       */
      await loadLLM({
        modelId: selected,
        dtype: "q4",
        preferredDevice: "auto",
        traceId,
        debug: true,
        signal: abortController.signal,
        onProgress: (p, txt) => {
          debugLog("loadLLM progress callback", {
            traceId,
            rawProgress: p,
            percent: Math.round(p * 100),
            text: txt,
          });

          setProgress(p);
          setStatus(txt);
        },
      });

      const durationMs =
        loadStartedAtRef.current === null
          ? null
          : Math.round(performance.now() - loadStartedAtRef.current);

      debugLog("loadLLM resolved successfully", {
        traceId,
        selected,
        durationMs,
      });

      setProgress(1);
      setStatus("Model loaded successfully.");

      debugLog("calling onLoaded", {
        traceId,
        selected,
      });

      onLoaded(selected);

      debugLog("onLoaded returned", {
        traceId,
        selected,
      });
    } catch (err) {
      const durationMs =
        loadStartedAtRef.current === null
          ? null
          : Math.round(performance.now() - loadStartedAtRef.current);

      debugError("handleLoad caught error", {
        traceId,
        selected,
        durationMs,
        error: err,
        errorString: String(err),
        errorName: err instanceof Error ? err.name : null,
        errorMessage: err instanceof Error ? err.message : null,
        errorStack: err instanceof Error ? err.stack : null,
      });

      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
      setStatus("Model load failed.");
    } finally {
      debugLog("handleLoad finally", {
        traceId,
        selected,
        activeTraceId: activeTraceIdRef.current,
      });

      console.groupEnd();
    }
  }

  function handleSelect(modelId: string) {
    debugLog("model button clicked", {
      previousSelected: selected,
      nextSelected: modelId,
      loading,
    });

    if (loading) {
      debugWarn("selection ignored because model is loading", {
        attemptedModelId: modelId,
        currentSelected: selected,
      });
      return;
    }

    setSelected(modelId);
    setError("");
    setProgress(0);
    setStatus("");
  }

  function handleSkip() {
    debugWarn("skip clicked", {
      selected,
      loading,
      activeTraceId: activeTraceIdRef.current,
    });

    if (loading) {
      debugWarn("skip ignored because loading=true");
      return;
    }

    onSkip();

    debugLog("onSkip returned");
  }

  return (
    <div className="flex flex-col gap-6 max-w-xl mx-auto mt-16">
      <div>
        <h2 className="text-xl font-semibold text-white mb-1">Select AI Model</h2>
        <p className="text-sm text-slate-400">
          The model runs fully offline in your browser — nothing leaves your machine. Downloaded
          once, cached forever.
        </p>
      </div>

      <div className="grid gap-3">
        {MODEL_CATALOG.map((m: LLMModelDef) => (
          <button
            type="button"
            key={m.id}
            onClick={() => handleSelect(m.id)}
            disabled={loading}
            className={cn(
              "text-left rounded-xl border p-4 transition-all",
              loading && "opacity-60 cursor-not-allowed",
              selected === m.id
                ? "border-violet-500 bg-violet-500/10"
                : "border-slate-700 bg-slate-800/50 hover:border-slate-500",
            )}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium text-white text-sm">{m.label}</span>
              <span className="flex gap-2 items-center">
                {m.badge && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-600 text-white font-semibold">
                    {m.badge}
                  </span>
                )}
                <span className="text-xs text-slate-400">{m.sizeLabel}</span>
              </span>
            </div>
            <p className="text-xs text-slate-400">{m.description}</p>
          </button>
        ))}
      </div>

      {loading && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-slate-400">
            <span>{status || "Loading…"}</span>
            <span>{Math.round(progress * 100)}%</span>
          </div>
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-500 rounded-full transition-all duration-300"
              style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }}
            />
          </div>
          <p className="text-xs text-slate-500">
            {def.downloadMB > 500
              ? `Downloading ~${def.sizeLabel} — this only happens once.`
              : "Loading model into WebGPU / WASM…"}
          </p>
        </div>
      )}

      {error && <p className="text-sm text-red-400 bg-red-900/20 rounded-lg p-3">{error}</p>}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleLoad}
          disabled={loading}
          className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors"
        >
          {loading ? "Loading model…" : `Load ${def.label}`}
        </button>

        <button
          type="button"
          onClick={handleSkip}
          disabled={loading}
          className="px-5 py-2.5 rounded-xl border border-slate-600 hover:border-slate-400 text-slate-300 text-sm transition-colors disabled:opacity-40"
        >
          Skip (rule-based)
        </button>
      </div>
    </div>
  );
}
