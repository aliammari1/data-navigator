import type { ZodType } from "zod";
import {
  generateText,
  getLLMEngineState,
  initLLMEngine,
  isLLMReady,
  type LLMModelId,
  unloadLLMEngine,
} from "@/platform/ai/llm-engine";
import type {
  AICapabilities,
  AIGenerateRequest,
  AIModelInfo,
  AIProgress,
  AIProvider,
  AIResult,
} from "../types";
import { generateStructuredByPrompt, toSystemUser } from "./base";

/**
 * MLC web-LLM adapter (WebGPU). Wraps platform/ai/llm-engine.ts — a true
 * offline runtime that downloads quantized weights once and runs entirely in
 * the browser.
 *
 * DEMOTED to an OPPORTUNISTIC accelerator. web-LLM is WebGPU-ONLY with no CPU
 * fallback, so on the medium-end / integrated-GPU / Linux target it frequently
 * cannot run at all. Per the offline architecture invariant ("WebGPU is
 * opportunistic, never required"), it must NEVER be the auto-selected default —
 * `isAvailable()` returns true only when BOTH a real WebGPU adapter is detected
 * AND the user has explicitly opted in (`ai.webgpu.enabled`). The registry's
 * `pickDefaultProvider` additionally skips it during auto-selection, so it is
 * reachable solely through an explicit user preference.
 */

/** localStorage flag the user toggles to opt in to the WebGPU accelerator. */
const WEBLLM_OPTIN_FLAG = "ai.webgpu.enabled";

/** Whether the user has opted in to the opportunistic WebGPU (web-LLM) lane. */
export function isWebLLMOptIn(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(WEBLLM_OPTIN_FLAG) === "true";
}

/** Persist the user's WebGPU opt-in choice. */
export function setWebLLMOptIn(enabled: boolean): void {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(WEBLLM_OPTIN_FLAG, enabled ? "true" : "false");
  }
}

const MODELS: AIModelInfo[] = [
  {
    id: "Qwen2-0.5B-Instruct-q4f16_1-MLC",
    label: "Qwen2 0.5B",
    family: "Qwen2",
    sizeLabel: "0.5B",
    downloadMb: 500,
  },
  {
    id: "TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC",
    label: "TinyLlama 1.1B",
    family: "TinyLlama",
    sizeLabel: "1.1B",
    downloadMb: 700,
  },
  {
    id: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    label: "Llama 3.2 1B",
    family: "Llama",
    sizeLabel: "1B",
    downloadMb: 900,
  },
];

async function hasWebGPU(): Promise<boolean> {
  if (typeof navigator === "undefined" || !("gpu" in navigator)) return false;
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    return Boolean(await gpu?.requestAdapter());
  } catch {
    return false;
  }
}

export const webllmProvider: AIProvider = {
  id: "webllm",
  label: "Web-LLM (offline, WebGPU)",
  capabilities: {
    streaming: false,
    structuredNative: false,
    offline: true,
    requiresWebGPU: true,
  } satisfies AICapabilities,

  async isAvailable() {
    // Opportunistic only: requires an explicit opt-in AND a real WebGPU adapter.
    if (!isWebLLMOptIn()) return false;
    return hasWebGPU();
  },

  async listModels() {
    return MODELS;
  },

  async ensureReady(model, onProgress) {
    await initLLMEngine(model as LLMModelId, (s) => {
      const map: Record<string, AIProgress["status"]> = {
        idle: "idle",
        loading: "loading",
        ready: "ready",
        inferring: "inferring",
        error: "error",
      };
      onProgress?.({
        status: map[s.status] ?? "loading",
        progress: s.progress,
        message: s.error ?? undefined,
      });
    });
  },

  async generate(req: AIGenerateRequest): Promise<AIResult> {
    if (!isLLMReady()) await this.ensureReady(req.model);
    const { system, user } = toSystemUser(req);
    const started = Date.now();
    const text = await generateText(user, {
      systemPrompt: system || undefined,
      maxTokens: req.maxTokens ?? 512,
      temperature: req.temperature ?? 0.7,
    });
    return {
      text,
      model: getLLMEngineState().model ?? req.model,
      provider: "webllm",
      finishReason: req.signal?.aborted ? "abort" : "stop",
      elapsedMs: Date.now() - started,
    };
  },

  generateStructured<T>(req: AIGenerateRequest, schema: ZodType<T>) {
    return generateStructuredByPrompt(this, req, schema);
  },

  async unload() {
    await unloadLLMEngine();
  },
};
