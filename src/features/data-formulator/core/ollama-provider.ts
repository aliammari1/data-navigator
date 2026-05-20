"use client";

/**
 * Ollama Provider — Dynamic model discovery + multi-provider abstraction.
 * Supports Ollama local, with extensible architecture for OpenAI, etc.
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
  type: "ollama" | "openai" | "custom";
  baseURL: string;
  apiKey?: string;
  models: LLMModel[];
  isAvailable: boolean;
}

const OLLAMA_HOST = process.env.NEXT_PUBLIC_OLLAMA_HOST ?? "http://localhost:11434";

export async function discoverOllamaModels(host = OLLAMA_HOST): Promise<LLMModel[]> {
  try {
    const res = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.models ?? []) as LLMModel[];
  } catch {
    return [];
  }
}

export async function checkOllamaAvailable(host = OLLAMA_HOST): Promise<boolean> {
  try {
    const res = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function streamOllamaChat(
  model: string,
  messages: Array<{ role: "system" | "user" | "assistant" | "tool"; content: string }>,
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
  const host = options?.host ?? OLLAMA_HOST;
  const abortController = new AbortController();

  try {
    const res = await fetch(`${host}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: safeJsonStringify({
        model,
        messages,
        stream: true,
        options: {
          temperature: options?.temperature ?? 0.7,
          top_p: options?.top_p ?? 0.9,
          num_ctx: options?.num_ctx ?? 8192,
        },
      }),
      signal: abortController.signal,
    });

    if (!res.ok) {
      throw new Error(`Ollama HTTP ${res.status}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body");

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
        try {
          const chunk = JSON.parse(line);
          if (chunk.message?.content) {
            onToken(chunk.message.content);
          }
          if (chunk.done) {
            onDone();
            return;
          }
        } catch {
          // ignore parse errors for malformed lines
        }
      }
    }

    onDone();
  } catch (err) {
    if ((err as Error).name !== "AbortError") {
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

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
  },
): Promise<string> {
  const host = options?.host ?? OLLAMA_HOST;
  const res = await fetch(`${host}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: safeJsonStringify({
      model,
      system: systemPrompt,
      prompt: userPrompt,
      stream: false,
      options: {
        temperature: options?.temperature ?? 0.3,
      },
      format: options?.format,
    }),
  });

  if (!res.ok) throw new Error(`Ollama generate HTTP ${res.status}`);
  const data = await res.json();
  return data.response ?? "";
}

export async function generateWithOllamaStructured<T = Record<string, unknown>>(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  schema: { type: string; properties: Record<string, unknown>; required?: readonly string[] },
  options?: {
    temperature?: number;
    host?: string;
  },
): Promise<T> {
  const host = options?.host ?? OLLAMA_HOST;
  const groundedPrompt = [
    userPrompt,
    "",
    "Return only JSON that matches this JSON Schema:",
    safeJsonStringify(schema),
  ].join("\n");

  const res = await fetch(`${host}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: safeJsonStringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: groundedPrompt },
      ],
      stream: false,
      options: {
        temperature: options?.temperature ?? 0,
      },
      format: schema,
    }),
  });

  if (!res.ok) throw new Error(`Ollama chat HTTP ${res.status}`);
  const data = await res.json();
  const response = data.message?.content ?? data.response ?? "";

  try {
    return JSON.parse(response) as T;
  } catch {
    // Try extracting JSON from markdown code blocks
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]) as T;
    }
    throw new Error("Ollama returned invalid JSON for structured output");
  }
}
