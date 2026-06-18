import type { ZodType } from "zod";
import {
  chat,
  getLLMStatus,
  isLoaded,
  loadLLM,
  unloadLLM,
} from "@/platform/ai/transformers-engine";
import { generateStructuredByPrompt, toSystemUser } from "./base";
import type {
  AICapabilities,
  AIGenerateRequest,
  AIModelInfo,
  AIProvider,
  AIResult,
} from "../types";

/**
 * Transformers.js adapter. Wraps platform/ai/transformers-engine.ts, which runs ONNX
 * models in a Web Worker via @huggingface/transformers with a WASM fallback —
 * so it works even without WebGPU. Slower than web-LLM but the most compatible
 * offline option, and it supports token streaming.
 */

const MODELS: AIModelInfo[] = [
  { id: "onnx-community/Qwen2.5-0.5B-Instruct", label: "Qwen2.5 0.5B (ONNX)", family: "Qwen2.5", sizeLabel: "0.5B" },
  { id: "HuggingFaceTB/SmolLM2-360M-Instruct", label: "SmolLM2 360M", family: "SmolLM2", sizeLabel: "360M" },
  { id: "HuggingFaceTB/SmolLM2-1.7B-Instruct", label: "SmolLM2 1.7B", family: "SmolLM2", sizeLabel: "1.7B" },
];

export const transformersProvider: AIProvider = {
  id: "transformers",
  label: "Transformers.js (offline, WASM/WebGPU)",
  capabilities: {
    streaming: true,
    structuredNative: false,
    offline: true,
    requiresWebGPU: false,
  } satisfies AICapabilities,

  async isAvailable() {
    // Runs anywhere with Web Workers + WASM; the worker auto-detects WebGPU.
    return typeof window !== "undefined" && typeof Worker !== "undefined";
  },

  async listModels() {
    return MODELS;
  },

  async ensureReady(model, onProgress, signal) {
    await loadLLM({
      modelId: model,
      preferredDevice: "auto",
      onProgress: (progress, text) =>
        onProgress?.({
          status: progress >= 1 ? "ready" : "loading",
          progress: Math.round(progress * 100),
          message: text,
        }),
      signal,
    });
  },

  async generate(req: AIGenerateRequest): Promise<AIResult> {
    if (getLLMStatus().modelId !== req.model || !isLoaded()) {
      await this.ensureReady(req.model, undefined, req.signal);
    }
    const { system, user } = toSystemUser(req);
    const started = Date.now();
    const text = await chat(system, user, {
      maxTokens: req.maxTokens ?? 256,
      temperature: req.temperature ?? 0,
      topP: req.topP,
      onToken: req.onToken,
      signal: req.signal,
      agentName: "ai-provider",
    });
    return {
      text,
      model: getLLMStatus().modelId ?? req.model,
      provider: "transformers",
      finishReason: req.signal?.aborted ? "abort" : "stop",
      elapsedMs: Date.now() - started,
    };
  },

  generateStructured<T>(req: AIGenerateRequest, schema: ZodType<T>) {
    return generateStructuredByPrompt(this, req, schema);
  },

  async unload() {
    await unloadLLM();
  },
};
