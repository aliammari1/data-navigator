"use client";

/**
 * Edge AI provider compatibility layer.
 *
 * The public function names are retained so the existing feature modules keep
 * working, but all inference now runs through the unified platform provider
 * registry (`@/platform/ai/provider`). That registry prefers the Electron
 * main-process `node-llama-cpp` lane (grammar-constrained JSON, off the renderer
 * thread) and falls back to the fully-offline transformers.js Web Worker — both
 * keep token generation off the renderer main thread. There are no Ollama/OpenAI
 * HTTP calls here.
 */

import {
  buildJsonInstruction,
  extractJsonBlock,
  pickDefaultProvider,
  repairJson,
} from "@/platform/ai/provider";
import { safeJsonStringify } from "./json";

export interface LLMModel {
  name: string;
  size?: number;
  modifiedAt?: string;
  digest?: string;
  details?: {
    format?: string;
    family?: string;
    families?: string[];
    parameter_size?: string;
    quantization_level?: string;
  };
}

export interface LLMProvider {
  id: string;
  name: string;
  type: "edge";
  baseURL: string;
  apiKey?: never;
  models: LLMModel[];
  isAvailable: boolean;
}

export const EDGE_AI_HOST = "edge://transformers-worker";

export const EDGE_LLM_MODELS: LLMModel[] = [
  {
    name: "HuggingFaceTB/SmolLM2-360M-Instruct",
    details: {
      family: "SmolLM2",
      parameter_size: "360M",
      quantization_level: "q4f16",
    },
  },
  {
    name: "onnx-community/Qwen2.5-0.5B-Instruct",
    details: {
      family: "Qwen2.5",
      parameter_size: "0.5B",
      quantization_level: "q4f16",
    },
  },
];

function hasEdgeRuntime(): boolean {
  return typeof window !== "undefined";
}

/**
 * Extract a JSON value from a model completion using the shared platform
 * helpers (balanced-brace block extraction + light repair) instead of a bespoke
 * regex loop. Grammar-constrained providers (llamacpp) emit clean JSON and this
 * is a no-op; prompt-only providers (transformers.js) benefit from the repair.
 */
function parseJsonObject(text: string): unknown {
  const block = extractJsonBlock(text) ?? text;
  try {
    return JSON.parse(block);
  } catch {
    return JSON.parse(repairJson(text));
  }
}

export async function discoverOllamaModels(): Promise<LLMModel[]> {
  return EDGE_LLM_MODELS;
}

export async function checkOllamaAvailable(): Promise<boolean> {
  if (!hasEdgeRuntime()) return false;
  // Availability now reflects the unified provider registry: an edge runtime is
  // "available" when at least one offline provider (llamacpp main lane or the
  // transformers.js worker) reports ready.
  try {
    const provider = await pickDefaultProvider();
    return await provider.isAvailable();
  } catch {
    return false;
  }
}

export async function streamOllamaChat(
  model: string,
  messages: Array<{
    role: "system" | "user" | "assistant" | "tool";
    content: string;
  }>,
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (err: Error) => void,
  options?: {
    temperature?: number;
    top_p?: number;
    num_ctx?: number;
    host?: string;
  },
) {
  const abortController = new AbortController();

  const systemPrompt = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const prompt = messages
    .filter((message) => message.role !== "system")
    .map((message) => `${message.role.toUpperCase()}:\n${message.content}`)
    .join("\n\n");

  void (async () => {
    try {
      const provider = await pickDefaultProvider();
      await provider.generate({
        model,
        system: systemPrompt || undefined,
        prompt,
        maxTokens: options?.num_ctx ? Math.min(options.num_ctx, 1024) : 512,
        temperature: options?.temperature ?? 0,
        signal: abortController.signal,
        onToken,
      });
      onDone();
    } catch (err) {
      if (abortController.signal.aborted) {
        onDone();
        return;
      }
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  })();

  return abortController;
}

export async function generateWithOllama(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  options?: {
    temperature?: number;
    host?: string;
    format?: "json";
    maxTokens?: number;
  },
): Promise<string> {
  const provider = await pickDefaultProvider();
  const result = await provider.generate({
    model,
    system: systemPrompt || undefined,
    prompt: userPrompt,
    maxTokens: options?.maxTokens ?? 768,
    temperature: options?.temperature ?? 0,
  });
  return result.text.trim();
}

export async function generateWithOllamaStructured<T = Record<string, unknown>>(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  schema: {
    type: string;
    properties: Record<string, unknown>;
    required?: readonly string[];
  },
  options?: {
    temperature?: number;
    host?: string;
  },
): Promise<T> {
  const provider = await pickDefaultProvider();

  // FAST PATH — grammar-constrained decoding. The llamacpp lane accepts a raw
  // JSON Schema and constrains the sampler so the output is valid by
  // construction; the agents already hand us a JSON Schema, so feed it straight
  // through. This deletes the prompt-grounding + regex-repair brute force on the
  // primary (Electron) path entirely.
  if (
    provider.id === "llamacpp" &&
    typeof window !== "undefined" &&
    window.electronLlama
  ) {
    const out = await window.electronLlama.generateStructured({
      system: systemPrompt || undefined,
      prompt: userPrompt,
      jsonSchema: schema,
      maxTokens: 1024,
      temperature: options?.temperature ?? 0,
    });
    return out as T;
  }

  // FALLBACK — prompt-only providers (transformers.js Web Worker). Ground the
  // request with the schema and parse defensively with the shared platform
  // helpers (no bespoke regex loop).
  const groundedPrompt = [
    userPrompt,
    "",
    buildJsonInstruction(safeJsonStringify(schema)),
  ].join("\n");

  const response = await provider.generate({
    model,
    system:
      [systemPrompt, "Return only valid JSON. Do not wrap it in Markdown."].join(
        "\n",
      ) || undefined,
    prompt: groundedPrompt,
    maxTokens: 1024,
    temperature: options?.temperature ?? 0,
  });

  return parseJsonObject(response.text) as T;
}
