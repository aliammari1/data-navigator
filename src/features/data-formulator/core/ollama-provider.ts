"use client";

/**
 * Edge AI provider compatibility layer.
 *
 * The public function names are retained so the existing feature modules keep
 * working, but all inference now runs through the browser/Electron renderer
 * worker backed by Transformers.js. There are no Ollama/OpenAI HTTP calls here.
 */

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

type EdgeWorkerIncoming =
  | { type: "LOAD_MODEL"; model: string }
  | {
      id: string;
      type: "INFER";
      payload: {
        systemPrompt: string;
        prompt: string;
        maxTokens?: number;
      };
    }
  | { id: string; type: "ABORT" };

type EdgeWorkerMessage =
  | { type: "LOAD_PROGRESS"; progress: number; status: string }
  | { type: "MODEL_READY"; model: string }
  | { type: "MODEL_ERROR"; error: string }
  | { id: string; type: "INFER_CHUNK"; chunk: string }
  | { id: string; type: "INFER_DONE" }
  | { id: string; type: "INFER_ERROR"; error: string };

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

let worker: Worker | null = null;
let loadingModel: string | null = null;
let readyModel: string | null = null;
let loadPromise: Promise<void> | null = null;

function hasEdgeRuntime(): boolean {
  return typeof window !== "undefined" && typeof Worker !== "undefined";
}

function getWorker(): Worker {
  if (!hasEdgeRuntime()) {
    throw new Error(
      "Edge AI is unavailable because Web Workers are not supported.",
    );
  }
  if (!worker) {
    worker = new Worker(
      new URL("../../../workers/llm.worker.ts", import.meta.url),
      {
        type: "module",
      },
    );
  }
  return worker;
}

function onceModelReady(model: string): Promise<void> {
  if (readyModel === model) return Promise.resolve();
  if (loadingModel === model && loadPromise) return loadPromise;

  loadingModel = model;
  loadPromise = new Promise((resolve, reject) => {
    const w = getWorker();
    const onMessage = (event: MessageEvent<EdgeWorkerMessage>) => {
      const msg = event.data;
      if (msg.type === "MODEL_READY" && msg.model === model) {
        readyModel = model;
        loadingModel = null;
        w.removeEventListener("message", onMessage);
        resolve();
      }
      if (msg.type === "MODEL_ERROR") {
        loadingModel = null;
        w.removeEventListener("message", onMessage);
        reject(new Error(msg.error));
      }
    };
    w.addEventListener("message", onMessage);
    w.postMessage({ type: "LOAD_MODEL", model } satisfies EdgeWorkerIncoming);
  });

  return loadPromise;
}

function parseJsonObject(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fenced) return JSON.parse(fenced[1]);
    const object = text.match(/\{[\s\S]*\}/);
    if (object) return JSON.parse(object[0]);
    throw new Error("Edge AI returned invalid JSON for structured output.");
  }
}

export async function discoverOllamaModels(): Promise<LLMModel[]> {
  return EDGE_LLM_MODELS;
}

export async function checkOllamaAvailable(): Promise<boolean> {
  return hasEdgeRuntime();
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

  onceModelReady(model)
    .then(() => {
      const w = getWorker();
      const id = `edge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const systemPrompt = messages
        .filter((message) => message.role === "system")
        .map((message) => message.content)
        .join("\n\n");
      const prompt = messages
        .filter((message) => message.role !== "system")
        .map((message) => `${message.role.toUpperCase()}:\n${message.content}`)
        .join("\n\n");

      const onMessage = (event: MessageEvent<EdgeWorkerMessage>) => {
        const msg = event.data;
        if (!("id" in msg) || msg.id !== id) return;
        if (msg.type === "INFER_CHUNK") onToken(msg.chunk);
        if (msg.type === "INFER_DONE") {
          w.removeEventListener("message", onMessage);
          onDone();
        }
        if (msg.type === "INFER_ERROR") {
          w.removeEventListener("message", onMessage);
          onError(new Error(msg.error));
        }
      };

      abortController.signal.addEventListener(
        "abort",
        () => {
          w.postMessage({ id, type: "ABORT" } satisfies EdgeWorkerIncoming);
          w.removeEventListener("message", onMessage);
        },
        { once: true },
      );

      w.addEventListener("message", onMessage);
      w.postMessage({
        id,
        type: "INFER",
        payload: {
          systemPrompt,
          prompt,
          maxTokens: options?.num_ctx ? Math.min(options.num_ctx, 1024) : 512,
        },
      } satisfies EdgeWorkerIncoming);
    })
    .catch((err) =>
      onError(err instanceof Error ? err : new Error(String(err))),
    );

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
  await onceModelReady(model);

  return new Promise((resolve, reject) => {
    const w = getWorker();
    const id = `edge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    let output = "";

    const onMessage = (event: MessageEvent<EdgeWorkerMessage>) => {
      const msg = event.data;
      if (!("id" in msg) || msg.id !== id) return;
      if (msg.type === "INFER_CHUNK") output += msg.chunk;
      if (msg.type === "INFER_DONE") {
        w.removeEventListener("message", onMessage);
        resolve(output.trim());
      }
      if (msg.type === "INFER_ERROR") {
        w.removeEventListener("message", onMessage);
        reject(new Error(msg.error));
      }
    };

    w.addEventListener("message", onMessage);
    w.postMessage({
      id,
      type: "INFER",
      payload: {
        systemPrompt,
        prompt: userPrompt,
        maxTokens: options?.maxTokens ?? 768,
      },
    } satisfies EdgeWorkerIncoming);
  });
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
  _options?: {
    temperature?: number;
    host?: string;
  },
): Promise<T> {
  const groundedPrompt = [
    userPrompt,
    "",
    "Return only JSON that matches this JSON Schema:",
    safeJsonStringify(schema),
  ].join("\n");

  const response = await generateWithOllama(
    model,
    [systemPrompt, "Return only valid JSON. Do not wrap it in Markdown."].join(
      "\n",
    ),
    groundedPrompt,
    { maxTokens: 1024 },
  );

  return parseJsonObject(response) as T;
}
