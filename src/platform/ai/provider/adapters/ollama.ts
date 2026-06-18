import type { ZodType } from "zod";
import { parseStructured } from "../structured";
import {
  type AICapabilities,
  type AIGenerateRequest,
  type AIModelInfo,
  type AIProvider,
  type AIResult,
  AIUnavailableError,
} from "../types";
import { zodToInlineJsonSchema } from "../zod-json-schema";
import { generateStructuredByPrompt, toMessages } from "./base";

/**
 * Local Ollama adapter (power users). Talks to a locally running Ollama daemon
 * over HTTP — still offline in the sense that nothing leaves the machine.
 * Supports streaming and native JSON-schema constrained decoding via the
 * `format` field.
 */

const DEFAULT_HOST = "http://127.0.0.1:11434";

function host(): string {
  if (typeof localStorage !== "undefined") {
    return localStorage.getItem("ai.ollama.host")?.trim() || DEFAULT_HOST;
  }
  return DEFAULT_HOST;
}

export const ollamaProvider: AIProvider = {
  id: "ollama",
  label: "Ollama (local server)",
  capabilities: {
    streaming: true,
    structuredNative: true,
    offline: true,
    requiresWebGPU: false,
  } satisfies AICapabilities,

  async isAvailable() {
    try {
      const res = await fetch(`${host()}/api/tags`, {
        signal: AbortSignal.timeout(1500),
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  async listModels(): Promise<AIModelInfo[]> {
    try {
      const res = await fetch(`${host()}/api/tags`, { signal: AbortSignal.timeout(2500) });
      if (!res.ok) return [];
      const data = (await res.json()) as {
        models?: { name: string; details?: { family?: string; parameter_size?: string } }[];
      };
      return (data.models ?? []).map((m) => ({
        id: m.name,
        label: m.name,
        family: m.details?.family,
        sizeLabel: m.details?.parameter_size,
      }));
    } catch {
      return [];
    }
  },

  async ensureReady(model, onProgress) {
    onProgress?.({ status: "loading", progress: 10, message: `Warming ${model}…` });
    // A zero-token generate forces Ollama to load the model into memory.
    await fetch(`${host()}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, prompt: "", stream: false }),
    }).catch(() => undefined);
    onProgress?.({ status: "ready", progress: 100 });
  },

  async generate(req: AIGenerateRequest): Promise<AIResult> {
    const started = Date.now();
    const body = {
      model: req.model,
      messages: toMessages(req),
      stream: Boolean(req.onToken),
      options: {
        temperature: req.temperature ?? 0,
        ...(req.topP !== undefined ? { top_p: req.topP } : {}),
        ...(req.maxTokens !== undefined ? { num_predict: req.maxTokens } : {}),
      },
    };

    const res = await fetch(`${host()}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: req.signal,
    }).catch((err) => {
      throw new AIUnavailableError("ollama", err instanceof Error ? err.message : String(err));
    });

    if (!res.ok) throw new AIUnavailableError("ollama", `HTTP ${res.status}`);

    let text = "";
    if (req.onToken && res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const chunk = JSON.parse(line) as { message?: { content?: string } };
          const token = chunk.message?.content ?? "";
          if (token) {
            text += token;
            req.onToken(token);
          }
        }
      }
    } else {
      const data = (await res.json()) as { message?: { content?: string } };
      text = data.message?.content ?? "";
    }

    return {
      text,
      model: req.model,
      provider: "ollama",
      finishReason: req.signal?.aborted ? "abort" : "stop",
      elapsedMs: Date.now() - started,
    };
  },

  async generateStructured<T>(req: AIGenerateRequest, schema: ZodType<T>): Promise<T> {
    const jsonSchema = zodToInlineJsonSchema(schema);
    if (!jsonSchema) return generateStructuredByPrompt(this, req, schema);

    const res = await fetch(`${host()}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: req.model,
        messages: toMessages(req),
        stream: false,
        format: jsonSchema,
        options: { temperature: req.temperature ?? 0 },
      }),
      signal: req.signal,
    }).catch((err) => {
      throw new AIUnavailableError("ollama", err instanceof Error ? err.message : String(err));
    });

    if (!res.ok) throw new AIUnavailableError("ollama", `HTTP ${res.status}`);
    const data = (await res.json()) as { message?: { content?: string } };
    return parseStructured(data.message?.content ?? "", schema, { label: "ollama-structured" });
  },
};
