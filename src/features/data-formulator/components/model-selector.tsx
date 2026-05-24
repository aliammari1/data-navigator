"use client";

import { Bot, Check, ChevronDown, Cpu, RefreshCw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/shared/utils";
import {
  discoverOllamaModels,
  EDGE_AI_HOST,
  type LLMModel,
  type LLMProvider,
} from "../core/ollama-provider";
import { useFormulatorStore } from "../store";

export function ModelSelector() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [edgeModels, setEdgeModels] = useState<LLMModel[]>([]);
  const [executionMode, setExecutionMode] = useState<"webgpu" | "wasm-cpu">(
    "wasm-cpu",
  );

  const { selectedModel, selectModel, setProviders } = useFormulatorStore();

  const refreshModels = useCallback(async () => {
    setLoading(true);
    try {
      const models = await discoverOllamaModels();
      setEdgeModels(models);
      setExecutionMode(
        typeof navigator !== "undefined" && "gpu" in navigator
          ? "webgpu"
          : "wasm-cpu",
      );

      const edgeProvider: LLMProvider = {
        id: "edge",
        name: "Edge AI",
        type: "edge",
        baseURL: EDGE_AI_HOST,
        models,
        isAvailable: typeof Worker !== "undefined",
      };
      setProviders([edgeProvider]);

      const selectedModelSupported = models.some(
        (model) => model.name === selectedModel,
      );
      if (models.length > 0 && (!selectedModel || !selectedModelSupported)) {
        selectModel(models[0].name);
      }
    } finally {
      setLoading(false);
    }
  }, [selectModel, selectedModel, setProviders]);

  useEffect(() => {
    refreshModels();
  }, [refreshModels]);

  const selectedModelInfo = edgeModels.find(
    (model) => model.name === selectedModel,
  );

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-all",
          "border border-border bg-card hover:border-primary/50",
          open && "border-primary ring-1 ring-primary/20",
        )}
      >
        <div className="h-2 w-2 rounded-full bg-emerald-400" />
        <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="max-w-[140px] truncate">
          {selectedModelInfo?.name ?? selectedModel ?? "Edge model"}
        </span>
        <ChevronDown
          className={cn("h-3 w-3 transition-transform", open && "rotate-180")}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold">Edge AI Models</span>
              </div>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  refreshModels();
                }}
                disabled={loading}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-foreground/5 disabled:opacity-50"
              >
                <RefreshCw
                  className={cn("h-3.5 w-3.5", loading && "animate-spin")}
                />
              </button>
            </div>

            <div className="border-b border-border bg-muted/30 px-4 py-2">
              <div className="flex items-center gap-2 text-[11px]">
                <Check className="h-3 w-3 text-emerald-400" />
                <span className="text-emerald-400">
                  {executionMode === "webgpu"
                    ? "WebGPU available"
                    : "CPU/WASM mode"}
                </span>
                <span className="ml-auto text-muted-foreground">
                  {edgeModels.length} models
                </span>
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto py-1">
              {edgeModels.map((model) => (
                <button
                  key={model.name}
                  type="button"
                  onClick={() => {
                    selectModel(model.name);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-foreground/5",
                    selectedModel === model.name && "bg-primary/10",
                  )}
                >
                  <Bot
                    className={cn(
                      "h-4 w-4 flex-none",
                      selectedModel === model.name
                        ? "text-primary"
                        : "text-muted-foreground",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div
                      className={cn(
                        "truncate text-xs font-medium",
                        selectedModel === model.name
                          ? "text-primary"
                          : "text-foreground",
                      )}
                    >
                      {model.name}
                    </div>
                    <div className="truncate text-[10px] text-muted-foreground">
                      {model.details?.parameter_size ?? "Small edge model"} ·{" "}
                      {model.details?.quantization_level ?? "quantized"}
                    </div>
                  </div>
                  {selectedModel === model.name && (
                    <div className="h-1.5 w-1.5 flex-none rounded-full bg-primary" />
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
