"use client";

import {
  checkOllamaAvailable,
  discoverOllamaModels,
  EDGE_AI_HOST,
  EDGE_LLM_MODELS,
} from "./ollama-provider";

export type AiGateStatus =
  | "checking"
  | "ready"
  | "offline"
  | "no-model"
  | "model-missing";

export interface AiGateResult {
  status: AiGateStatus;
  host: string;
  selectedModel: string;
  modelNames: string[];
  message: string;
  executionMode: "webgpu" | "wasm-cpu" | "unavailable";
}

function getExecutionMode(): AiGateResult["executionMode"] {
  if (typeof window === "undefined" || typeof Worker === "undefined") {
    return "unavailable";
  }
  return typeof navigator !== "undefined" && "gpu" in navigator
    ? "webgpu"
    : "wasm-cpu";
}

export async function checkAiGate(args: {
  host?: string;
  selectedModel: string;
}): Promise<AiGateResult> {
  const executionMode = getExecutionMode();
  const selectedModel =
    args.selectedModel.trim() || EDGE_LLM_MODELS[0]?.name || "";
  const available = await checkOllamaAvailable();
  const models = await discoverOllamaModels();
  const modelNames = models.map((model) => model.name);

  if (!available || executionMode === "unavailable") {
    return {
      status: "offline",
      host: EDGE_AI_HOST,
      selectedModel,
      modelNames,
      executionMode: "unavailable",
      message:
        "Edge AI is unavailable because this browser runtime does not support Web Workers.",
    };
  }

  if (!selectedModel) {
    return {
      status: "no-model",
      host: EDGE_AI_HOST,
      selectedModel,
      modelNames,
      executionMode,
      message: "Select an edge AI model before running AI actions.",
    };
  }

  if (!modelNames.includes(selectedModel)) {
    return {
      status: "model-missing",
      host: EDGE_AI_HOST,
      selectedModel,
      modelNames,
      executionMode,
      message: `Model "${selectedModel}" is not in the supported edge model list.`,
    };
  }

  return {
    status: "ready",
    host: EDGE_AI_HOST,
    selectedModel,
    modelNames,
    executionMode,
    message:
      executionMode === "webgpu"
        ? `Edge AI ready with ${selectedModel} using WebGPU, with WASM/CPU fallback.`
        : `Edge AI ready with ${selectedModel} using WASM/CPU mode.`,
  };
}

export function isAiReady(
  gate: AiGateResult | null,
): gate is AiGateResult & { status: "ready" } {
  return gate?.status === "ready";
}
