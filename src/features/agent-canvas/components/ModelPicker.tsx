"use client";
import { useState } from "react";
import { loadLLM } from "@/features/agent-canvas/core/llm";
import {
  MODEL_CATALOG,
  type LLMModelDef,
} from "@/features/agent-canvas/core/types";
import { cn } from "@/shared/utils";

interface Props {
  onLoaded: (modelId: string) => void;
  onSkip: () => void;
}

export function ModelPicker({ onLoaded, onSkip }: Props) {
  const [selected, setSelected] = useState<string>(MODEL_CATALOG[0].id);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function handleLoad() {
    setLoading(true);
    setError("");
    try {
      await loadLLM(selected, (p, txt) => {
        setProgress(p);
        setStatus(txt);
      });
      onLoaded(selected);
    } catch (err) {
      setError(String(err));
      setLoading(false);
    }
  }

  const def = MODEL_CATALOG.find((m) => m.id === selected)!;

  return (
    <div className="flex flex-col gap-6 max-w-xl mx-auto mt-16">
      <div>
        <h2 className="text-xl font-semibold text-white mb-1">
          Select AI Model
        </h2>
        <p className="text-sm text-slate-400">
          The model runs fully offline in your browser — nothing leaves your
          machine. Downloaded once, cached forever.
        </p>
      </div>

      <div className="grid gap-3">
        {MODEL_CATALOG.map((m: LLMModelDef) => (
          <button
            key={m.id}
            onClick={() => setSelected(m.id)}
            className={cn(
              "text-left rounded-xl border p-4 transition-all",
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
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <p className="text-xs text-slate-500">
            {def.downloadMB > 500
              ? `Downloading ~${def.sizeLabel} — this only happens once.`
              : "Loading model into WebGPU / WASM…"}
          </p>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-400 bg-red-900/20 rounded-lg p-3">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          onClick={handleLoad}
          disabled={loading}
          className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors"
        >
          {loading ? "Loading model…" : `Load ${def.label}`}
        </button>
        <button
          onClick={onSkip}
          disabled={loading}
          className="px-5 py-2.5 rounded-xl border border-slate-600 hover:border-slate-400 text-slate-300 text-sm transition-colors disabled:opacity-40"
        >
          Skip (rule-based)
        </button>
      </div>
    </div>
  );
}
