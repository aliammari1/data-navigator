"use client";

import type { LLMWorkerIncoming, LLMWorkerMessage } from "@/workers/llm.worker";

// ── Default model ─────────────────────────────────────────────────────────────

export const DEFAULT_MODEL = "onnx-community/Qwen2.5-0.5B-Instruct";

export type LlmStatus = "unloaded" | "loading" | "ready" | "error";

// ── Singleton worker client ───────────────────────────────────────────────────

export class AgentMeshLLMClient {
  private worker: Worker | null = null;
  private pending = new Map<
    string,
    {
      resolve: () => void;
      reject: (e: Error) => void;
      onChunk: (c: string) => void;
    }
  >();

  status: LlmStatus = "unloaded";
  progress = 0;
  loadedModel = "";
  error = "";

  private listeners = new Set<() => void>();

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    for (const fn of this.listeners) fn();
  }

  private ensureWorker() {
    if (this.worker) return;
    this.worker = new Worker(
      new URL("@/workers/llm.worker.ts", import.meta.url),
      { type: "module" },
    );
    this.worker.onmessage = (e: MessageEvent<LLMWorkerMessage>) => {
      const msg = e.data;

      if (msg.type === "LOAD_PROGRESS") {
        this.progress = msg.progress;
        this.notify();
        return;
      }
      if (msg.type === "MODEL_READY") {
        this.status = "ready";
        this.loadedModel = msg.model;
        this.progress = 100;
        this.notify();
        return;
      }
      if (msg.type === "MODEL_ERROR") {
        this.status = "error";
        this.error = msg.error;
        this.notify();
        return;
      }
      if (msg.type === "INFER_CHUNK") {
        this.pending.get(msg.id)?.onChunk(msg.chunk);
        return;
      }
      if (msg.type === "INFER_DONE") {
        const p = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        p?.resolve();
        return;
      }
      if (msg.type === "INFER_ERROR") {
        const p = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        p?.reject(
          new Error(
            (msg as { type: "INFER_ERROR"; id: string; error: string }).error,
          ),
        );
      }
    };
  }

  async load(model = DEFAULT_MODEL) {
    this.ensureWorker();
    this.status = "loading";
    this.progress = 0;
    this.error = "";
    this.notify();
    this.worker!.postMessage({
      type: "LOAD_MODEL",
      model,
    } satisfies LLMWorkerIncoming);
  }

  async infer(
    systemPrompt: string,
    prompt: string,
    onChunk: (chunk: string) => void,
    maxTokens = 512,
  ): Promise<void> {
    if (this.status !== "ready" || !this.worker) {
      throw new Error("Model not ready");
    }
    const id = `infer-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise<void>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onChunk });
      this.worker!.postMessage({
        id,
        type: "INFER",
        payload: { systemPrompt, prompt, maxTokens },
      } satisfies LLMWorkerIncoming);
    });
  }

  isReady() {
    return this.status === "ready";
  }
}

// Singleton — one model shared across the whole app
export const agentMeshLLM = new AgentMeshLLMClient();
