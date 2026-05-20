"use client";

import { useState, useEffect, useCallback } from "react";
import { Bot, ChevronDown, RefreshCw, Server, Wifi, WifiOff } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/shared/utils";
import { useFormulatorStore } from "../store";
import { discoverOllamaModels, checkOllamaAvailable } from "../core/ollama-provider";
import type { LLMModel, LLMProvider } from "../core/ollama-provider";

export function ModelSelector() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [localModels, setLocalModels] = useState<LLMModel[]>([]);
  const [isOllamaAvailable, setIsOllamaAvailable] = useState(false);

  const { providers, selectedProviderId, selectedModel, selectModel, setProviders } = useFormulatorStore();

  const refreshModels = useCallback(async () => {
    setLoading(true);
    try {
      const host = useFormulatorStore.getState().settings.ollamaHost;
      const available = await checkOllamaAvailable(host);
      setIsOllamaAvailable(available);

      if (available) {
        const models = await discoverOllamaModels(host);
        setLocalModels(models);

        const ollamaProvider: LLMProvider = {
          id: "ollama",
          name: "Ollama (Local)",
          type: "ollama",
          baseURL: host,
          models,
          isAvailable: true,
        };

        setProviders([ollamaProvider]);

        const selectedModelInstalled = models.some(
          (model) => model.name === selectedModel,
        );

        if (models.length > 0 && (!selectedModel || !selectedModelInstalled)) {
          selectModel(models[0].name);
        }
      } else {
        setProviders([]);
      }
    } catch {
      setIsOllamaAvailable(false);
    } finally {
      setLoading(false);
    }
  }, [selectModel, selectedModel, setProviders]);

  useEffect(() => {
    refreshModels();
  }, [refreshModels]);

  const selectedProvider = providers.find((p) => p.id === selectedProviderId);
  const selectedModelInfo = localModels.find((m) => m.name === selectedModel);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all",
          "bg-card border border-border hover:border-primary/50",
          open && "border-primary ring-1 ring-primary/20",
        )}
      >
        <div className={cn("w-2 h-2 rounded-full", isOllamaAvailable ? "bg-emerald-400" : "bg-red-400")} />
        <Bot className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="max-w-[120px] truncate">
          {selectedModelInfo?.name ?? selectedModel ?? "Select model"}
        </span>
        <ChevronDown className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-2xl shadow-2xl z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-semibold">AI Models</span>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); refreshModels(); }}
                disabled={loading}
                className="p-1.5 rounded-lg hover:bg-foreground/5 text-muted-foreground disabled:opacity-50"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
              </button>
            </div>

            {/* Provider Status */}
            <div className="px-4 py-2 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2 text-[11px]">
                {isOllamaAvailable ? (
                  <>
                    <Wifi className="w-3 h-3 text-emerald-400" />
                    <span className="text-emerald-400">Ollama connected</span>
                    <span className="text-muted-foreground ml-auto">{localModels.length} models</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-3 h-3 text-red-400" />
                    <span className="text-red-400">Ollama not available</span>
                    <span className="text-muted-foreground ml-auto">Run `ollama serve`</span>
                  </>
                )}
              </div>
            </div>

            {/* Model List */}
            <div className="max-h-64 overflow-y-auto py-1">
              {localModels.length === 0 && !loading && (
                <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                  No models found. Pull one with:<br />
                  <code className="text-primary mt-1 inline-block">ollama pull &lt;model-name&gt;</code>
                </div>
              )}

              {localModels.map((model) => (
                <button
                  key={model.name}
                  type="button"
                  onClick={() => {
                    selectModel(model.name);
                    setOpen(false);
                  }}
                  className={cn(
                    "w-full px-4 py-2.5 flex items-center gap-3 hover:bg-foreground/5 transition-colors text-left",
                    selectedModel === model.name && "bg-primary/10",
                  )}
                >
                  <Bot className={cn(
                    "w-4 h-4 flex-none",
                    selectedModel === model.name ? "text-primary" : "text-muted-foreground",
                  )} />
                  <div className="flex-1 min-w-0">
                    <div className={cn(
                      "text-xs font-medium truncate",
                      selectedModel === model.name ? "text-primary" : "text-foreground",
                    )}>
                      {model.name}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {model.details?.parameter_size ?? "Unknown size"}
                      {model.details?.quantization_level ? ` · ${model.details.quantization_level}` : ""}
                    </div>
                  </div>
                  {selectedModel === model.name && (
                    <div className="w-1.5 h-1.5 rounded-full bg-primary flex-none" />
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
