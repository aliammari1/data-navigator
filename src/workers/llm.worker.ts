/// <reference lib="webworker" />
import { env, pipeline, TextStreamer } from "@huggingface/transformers";
import type { TextGenerationPipeline } from "@huggingface/transformers";

// Always offline — models are cached in the browser after first download
env.allowLocalModels = false;
env.useBrowserCache = true;

// ── Message types ─────────────────────────────────────────────────────────────

export interface LLMLoadRequest {
  type: "LOAD_MODEL";
  model: string;
}

export interface LLMInferRequest {
  id: string;
  type: "INFER";
  payload: {
    systemPrompt: string;
    prompt: string;
    maxTokens?: number;
  };
}

export interface LLMAbortRequest {
  id: string;
  type: "ABORT";
}

export type LLMWorkerIncoming =
  | LLMLoadRequest
  | LLMInferRequest
  | LLMAbortRequest;

export type LLMWorkerMessage =
  | { type: "LOAD_PROGRESS"; progress: number; status: string }
  | { type: "MODEL_READY"; model: string }
  | { type: "MODEL_ERROR"; error: string }
  | { id: string; type: "INFER_CHUNK"; chunk: string }
  | { id: string; type: "INFER_DONE" }
  | { id: string; type: "INFER_ERROR"; error: string };

// ── State ─────────────────────────────────────────────────────────────────────

let pipe: TextGenerationPipeline | null = null;
let loadedModel = "";
let isLoading = false;

// ── Loader ────────────────────────────────────────────────────────────────────

async function loadModel(model: string) {
  if (isLoading) return;
  if (pipe && loadedModel === model) {
    self.postMessage({ type: "MODEL_READY", model } satisfies LLMWorkerMessage);
    return;
  }

  isLoading = true;

  const progressCb = (info: { status: string; progress?: number }) => {
    const pct =
      info.progress !== undefined ? Math.round(info.progress * 100) : 0;
    self.postMessage({
      type: "LOAD_PROGRESS",
      progress: pct,
      status: info.status,
    } satisfies LLMWorkerMessage);
  };

  // Try WebGPU first (fast), fall back to WASM (always available)
  for (const device of ["webgpu", "wasm"] as const) {
    try {
      pipe = (await pipeline("text-generation", model, {
        dtype: "q4f16",
        device,
        progress_callback: progressCb,
      })) as TextGenerationPipeline;
      loadedModel = model;
      isLoading = false;
      self.postMessage({
        type: "MODEL_READY",
        model,
      } satisfies LLMWorkerMessage);
      return;
    } catch {
      if (device === "wasm") {
        isLoading = false;
        self.postMessage({
          type: "MODEL_ERROR",
          error: `Failed to load ${model} on both WebGPU and WASM.`,
        } satisfies LLMWorkerMessage);
      }
    }
  }
}

// ── Inference ─────────────────────────────────────────────────────────────────

async function infer(
  id: string,
  systemPrompt: string,
  prompt: string,
  maxTokens = 512,
) {
  if (!pipe) {
    self.postMessage({
      id,
      type: "INFER_ERROR",
      error: "Model not loaded",
    } satisfies LLMWorkerMessage);
    return;
  }

  try {
    const messages: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }> = [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ];

    const streamer = new TextStreamer((pipe as any).tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (text: string) => {
        self.postMessage({
          id,
          type: "INFER_CHUNK",
          chunk: text,
        } satisfies LLMWorkerMessage);
      },
    });

    await (pipe as any)(messages, {
      max_new_tokens: maxTokens,
      do_sample: false,
      streamer,
    });

    self.postMessage({ id, type: "INFER_DONE" } satisfies LLMWorkerMessage);
  } catch (err) {
    self.postMessage({
      id,
      type: "INFER_ERROR",
      error: String(err),
    } satisfies LLMWorkerMessage);
  }
}

// ── Message router ────────────────────────────────────────────────────────────

self.onmessage = (e: MessageEvent<LLMWorkerIncoming>) => {
  const msg = e.data;

  if (msg.type === "LOAD_MODEL") {
    loadModel(msg.model);
    return;
  }

  if (msg.type === "INFER") {
    infer(
      msg.id,
      msg.payload.systemPrompt,
      msg.payload.prompt,
      msg.payload.maxTokens,
    );
    return;
  }
};
