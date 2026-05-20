"use client";

import { checkOllamaAvailable, discoverOllamaModels } from "./ollama-provider";

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
}

export async function checkAiGate(args: {
  host: string;
  selectedModel: string;
}): Promise<AiGateResult> {
  const host = args.host.trim() || "http://localhost:11434";
  const selectedModel = args.selectedModel.trim();

  const available = await checkOllamaAvailable(host);
  if (!available) {
    return {
      status: "offline",
      host,
      selectedModel,
      modelNames: [],
      message: `Ollama is not reachable at ${host}. Start Ollama, then refresh AI status.`,
    };
  }

  const models = await discoverOllamaModels(host);
  const modelNames = models.map((model) => model.name);

  if (!selectedModel) {
    return {
      status: "no-model",
      host,
      selectedModel,
      modelNames,
      message: "Select a local Ollama model before running AI actions.",
    };
  }

  if (!modelNames.includes(selectedModel)) {
    return {
      status: "model-missing",
      host,
      selectedModel,
      modelNames,
      message: `Model "${selectedModel}" was not found in Ollama. Pull it or choose another installed model.`,
    };
  }

  return {
    status: "ready",
    host,
    selectedModel,
    modelNames,
    message: `AI ready with ${selectedModel}.`,
  };
}

export function isAiReady(
  gate: AiGateResult | null,
): gate is AiGateResult & { status: "ready" } {
  return gate?.status === "ready";
}
