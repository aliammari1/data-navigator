"use client";

import { AlertTriangle, Bot, CheckCircle2, Cpu, Database, Globe, Mic, Speaker, Wifi, WifiOff } from "lucide-react";
import { cn } from "@/shared/utils";
import type { AiGateResult } from "@/features/data-formulator/core/ai-gate";
import { useLanguageProfileStore } from "@/features/data-formulator/core/language/language-profile";

interface ModelReadinessCenterProps {
  aiGate: AiGateResult | null;
  checking: boolean;
}

export function ModelReadinessCenter({ aiGate, checking }: ModelReadinessCenterProps) {
  const sttModel = useLanguageProfileStore((s) => s.sttModel);
  const voiceEnabled = useLanguageProfileStore((s) => s.voiceEnabled);

  const checklist = [
    {
      label: "Ollama server",
      status: aiGate?.status === "ready" ? "ready" : aiGate?.status === "offline" ? "error" : "warning",
      detail: aiGate?.status === "ready" ? `Running at ${aiGate.host}` : aiGate?.status === "offline" ? "Offline — run ollama serve" : "Checking...",
      icon: aiGate?.status === "ready" ? Wifi : WifiOff,
    },
    {
      label: "Selected model",
      status: aiGate?.status === "ready" ? "ready" : aiGate?.status === "model-missing" ? "error" : aiGate?.status === "no-model" ? "warning" : "error",
      detail: aiGate?.selectedModel ? aiGate.selectedModel : "No model selected",
      icon: Bot,
    },
    {
      label: "Browser STT",
      status: voiceEnabled ? "ready" : "warning",
      detail: voiceEnabled ? `${sttModel} ready` : "Voice disabled in settings",
      icon: Mic,
    },
    {
      label: "IndexedDB storage",
      status: typeof window !== "undefined" && "indexedDB" in window ? "ready" : "error",
      detail: "Local persistence available",
      icon: Database,
    },
    {
      label: "WebGPU / WASM",
      status: typeof navigator !== "undefined" && "gpu" in navigator ? "ready" : "warning",
      detail: typeof navigator !== "undefined" && "gpu" in navigator ? "WebGPU available" : "WASM fallback",
      icon: Cpu,
    },
  ];

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-500/20 bg-cyan-500/10">
          <Globe className="h-4 w-4 text-cyan-300" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Model Readiness</h2>
          <p className="text-xs text-muted-foreground">AI and offline capability status</p>
        </div>
      </div>

      <div className="space-y-2">
        {checklist.map((item) => (
          <div
            key={item.label}
            className={cn(
              "flex items-center gap-3 rounded-lg border p-3",
              item.status === "ready"
                ? "border-emerald-500/15 bg-emerald-500/5"
                : item.status === "warning"
                  ? "border-amber-500/15 bg-amber-500/5"
                  : "border-rose-500/15 bg-rose-500/5",
            )}
          >
            <item.icon
              className={cn(
                "h-4 w-4 shrink-0",
                item.status === "ready"
                  ? "text-emerald-300"
                  : item.status === "warning"
                    ? "text-amber-300"
                    : "text-rose-300",
              )}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-foreground">{item.label}</span>
                {item.status === "ready" ? (
                  <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                ) : item.status === "warning" ? (
                  <AlertTriangle className="h-3 w-3 text-amber-400" />
                ) : (
                  <AlertTriangle className="h-3 w-3 text-rose-400" />
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">{item.detail}</p>
            </div>
          </div>
        ))}
      </div>

      {aiGate?.status === "model-missing" && aiGate.selectedModel && (
        <div className="rounded-lg border border-rose-500/15 bg-rose-500/5 p-3">
          <div className="text-xs font-medium text-rose-300">Missing model</div>
          <p className="mt-1 text-[11px] text-rose-200/80">
            Run <code className="rounded bg-rose-500/10 px-1 py-0.5">ollama pull {aiGate.selectedModel}</code> in your terminal.
          </p>
        </div>
      )}

      {aiGate?.status === "offline" && (
        <div className="rounded-lg border border-rose-500/15 bg-rose-500/5 p-3">
          <div className="text-xs font-medium text-rose-300">Ollama is offline</div>
          <p className="mt-1 text-[11px] text-rose-200/80">
            1. Install Ollama from ollama.com<br />
            2. Run <code className="rounded bg-rose-500/10 px-1 py-0.5">ollama serve</code><br />
            3. Pull a model: <code className="rounded bg-rose-500/10 px-1 py-0.5">ollama pull qwen3</code>
          </p>
        </div>
      )}
    </div>
  );
}
