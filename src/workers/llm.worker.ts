/// <reference lib="webworker" />
/**
 * Phase 5 — LLM Worker: runs Claude API inference off the main thread.
 * Accepts typed request envelopes and streams token chunks back to the caller.
 *
 * Message protocol (postMessage):
 *   Request  → { id, type: "INFER", payload: { prompt, systemPrompt?, apiKey, model? } }
 *   Response → { id, type: "INFER_CHUNK",  chunk: string }      (zero or more)
 *            → { id, type: "INFER_DONE" }                        (terminal)
 *            → { id, type: "INFER_ERROR", error: string }        (terminal on failure)
 */

export interface LLMInferRequest {
  id: string;
  type: "INFER";
  payload: {
    prompt: string;
    systemPrompt?: string;
    apiKey: string;
    model?: string;
    maxTokens?: number;
  };
}

export type LLMWorkerMessage =
  | { id: string; type: "INFER_CHUNK"; chunk: string }
  | { id: string; type: "INFER_DONE" }
  | { id: string; type: "INFER_ERROR"; error: string };

const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_MAX_TOKENS = 1024;

self.onmessage = async (e: MessageEvent<LLMInferRequest>) => {
  const { id, type, payload } = e.data;
  if (type !== "INFER") return;

  const { prompt, systemPrompt, apiKey, model = DEFAULT_MODEL, maxTokens = DEFAULT_MAX_TOKENS } = payload;

  try {
    const body = JSON.stringify({
      model,
      max_tokens: maxTokens,
      stream: true,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: [{ role: "user", content: prompt }],
    });

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body,
    });

    if (!res.ok) {
      const errText = await res.text();
      self.postMessage({ id, type: "INFER_ERROR", error: `HTTP ${res.status}: ${errText}` } satisfies LLMWorkerMessage);
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      self.postMessage({ id, type: "INFER_ERROR", error: "No response body" } satisfies LLMWorkerMessage);
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") break;
        try {
          const parsed = JSON.parse(data) as { type: string; delta?: { type: string; text?: string } };
          if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta" && parsed.delta.text) {
            self.postMessage({ id, type: "INFER_CHUNK", chunk: parsed.delta.text } satisfies LLMWorkerMessage);
          }
        } catch {
          // Malformed SSE line — skip
        }
      }
    }

    self.postMessage({ id, type: "INFER_DONE" } satisfies LLMWorkerMessage);
  } catch (err) {
    self.postMessage({ id, type: "INFER_ERROR", error: String(err) } satisfies LLMWorkerMessage);
  }
};
