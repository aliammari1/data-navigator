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
 * OpenAI-compatible cloud adapter (optional). Works with any server speaking the
 * /v1/chat/completions API — OpenAI, OpenRouter, LM Studio, llama.cpp server,
 * vLLM, etc. Disabled unless the user configures a base URL, so the app stays
 * offline-first by default. Config is read from localStorage:
 *   ai.openai.baseUrl, ai.openai.apiKey, ai.openai.models (comma-separated)
 */

function cfg(key: string): string {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem(`ai.openai.${key}`)?.trim() ?? "";
}

async function call(req: AIGenerateRequest, extra: Record<string, unknown> = {}) {
  const baseUrl = cfg("baseUrl");
  if (!baseUrl) throw new AIUnavailableError("openai", "no base URL configured");
  const apiKey = cfg("apiKey");
  return fetch(`${baseUrl.replace(/\/$/, "")}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: req.model,
      messages: toMessages(req),
      temperature: req.temperature ?? 0,
      ...(req.topP !== undefined ? { top_p: req.topP } : {}),
      ...(req.maxTokens !== undefined ? { max_tokens: req.maxTokens } : {}),
      ...extra,
    }),
    signal: req.signal,
  });
}

export const openaiProvider: AIProvider = {
  id: "openai",
  label: "OpenAI-compatible (cloud)",
  capabilities: {
    streaming: false,
    structuredNative: true,
    offline: false,
    requiresWebGPU: false,
  } satisfies AICapabilities,

  async isAvailable() {
    return Boolean(cfg("baseUrl"));
  },

  async listModels(): Promise<AIModelInfo[]> {
    const models = cfg("models");
    if (models) return models.split(",").map((m) => ({ id: m.trim(), label: m.trim() }));
    return [{ id: "gpt-4o-mini", label: "gpt-4o-mini" }];
  },

  async ensureReady() {
    // Cloud models need no warm-up.
  },

  async generate(req: AIGenerateRequest): Promise<AIResult> {
    const started = Date.now();
    const res = await call(req);
    if (!res.ok) throw new AIUnavailableError("openai", `HTTP ${res.status}`);
    const data = (await res.json()) as {
      choices?: { message?: { content?: string }; finish_reason?: string }[];
    };
    return {
      text: data.choices?.[0]?.message?.content ?? "",
      model: req.model,
      provider: "openai",
      finishReason: (data.choices?.[0]?.finish_reason as AIResult["finishReason"]) ?? "stop",
      elapsedMs: Date.now() - started,
    };
  },

  async generateStructured<T>(req: AIGenerateRequest, schema: ZodType<T>): Promise<T> {
    const jsonSchema = zodToInlineJsonSchema(schema);
    if (!jsonSchema) return generateStructuredByPrompt(this, req, schema);
    const res = await call(req, {
      response_format: {
        type: "json_schema",
        json_schema: { name: "structured_output", schema: jsonSchema, strict: true },
      },
    });
    if (!res.ok) throw new AIUnavailableError("openai", `HTTP ${res.status}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return parseStructured(data.choices?.[0]?.message?.content ?? "", schema, {
      label: "openai-structured",
    });
  },
};
