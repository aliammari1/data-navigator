"use client";
/**
 * LLM Engine — offline, browser-native via @huggingface/transformers (WebGPU / WASM)
 * Singleton pattern so the model stays loaded across pipeline steps.
 */

type HFPipeline = (
  input: Array<{ role: string; content: string }>,
  options?: Record<string, unknown>,
) => Promise<
  Array<{ generated_text: string | Array<{ role: string; content: string }> }>
>;

let _pipe: HFPipeline | null = null;
let _modelId: string | null = null;

export type LoadProgressCB = (progress: number, text: string) => void;

// ─── Model Loading ────────────────────────────────────────────────────────────

export async function loadLLM(
  modelId: string,
  onProgress?: LoadProgressCB,
): Promise<void> {
  if (_modelId === modelId && _pipe) return; // already loaded

  const { pipeline, env } = await import("@huggingface/transformers");
  env.allowRemoteModels = true;
  env.useBrowserCache = true;

  // Detect WebGPU support
  let device: "webgpu" | "wasm" = "wasm";
  if (typeof navigator !== "undefined" && "gpu" in navigator) {
    try {
      const adapter = await (
        navigator as unknown as { gpu: { requestAdapter(): Promise<unknown> } }
      ).gpu.requestAdapter();
      if (adapter) device = "webgpu";
    } catch {
      /* fall through to wasm */
    }
  }

  onProgress?.(0.02, `Initializing ${device.toUpperCase()} backend…`);

  const pipe = await pipeline("text-generation", modelId, {
    device,
    dtype: "q4",
    progress_callback: (info: Record<string, unknown>) => {
      const p = typeof info.progress === "number" ? info.progress / 100 : 0;
      const t =
        typeof info.file === "string"
          ? `Downloading ${info.file} (${Math.round(p * 100)}%)`
          : typeof info.status === "string"
            ? String(info.status)
            : "Loading…";
      onProgress?.(Math.max(0.02, p), t);
    },
  });

  _pipe = pipe as unknown as HFPipeline;
  _modelId = modelId;
  onProgress?.(1, `${modelId} ready on ${device.toUpperCase()}`);
}

// ─── Inference ────────────────────────────────────────────────────────────────

export interface ChatOptions {
  maxTokens?: number;
  temperature?: number;
  onToken?: (token: string) => void;
}

export async function chat(
  system: string,
  user: string,
  opts: ChatOptions = {},
): Promise<string> {
  if (!_pipe) throw new Error("LLM not loaded — call loadLLM() first");

  const messages = [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];

  const result = await _pipe(messages, {
    max_new_tokens: opts.maxTokens ?? 600,
    do_sample: (opts.temperature ?? 0) > 0,
    temperature: opts.temperature ?? 0.05,
    return_full_text: false,
  });

  const out = result[0]?.generated_text;
  if (!out) return "";

  if (typeof out === "string") return out;

  if (Array.isArray(out)) {
    // Chat-template models return full conversation; grab the last assistant turn
    for (let i = out.length - 1; i >= 0; i--) {
      const msg = out[i] as { role: string; content: string };
      if (msg.role === "assistant") return msg.content ?? "";
    }
    // Fallback: last item
    const last = out[out.length - 1] as { content?: string } | string;
    return typeof last === "string" ? last : (last.content ?? "");
  }

  return String(out);
}

// ─── JSON Helper ─────────────────────────────────────────────────────────────

export function parseJSON<T>(raw: string): T {
  const s = raw.trim();

  // Direct
  try {
    return JSON.parse(s) as T;
  } catch {
    /* */
  }

  // Strip markdown fences
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    try {
      return JSON.parse(fence[1].trim()) as T;
    } catch {
      /* */
    }
  }

  // First {...} block
  const brace = s.match(/\{[\s\S]*\}/);
  if (brace) {
    try {
      return JSON.parse(brace[0]) as T;
    } catch {
      /* */
    }
  }

  // First [...] block
  const bracket = s.match(/\[[\s\S]*\]/);
  if (bracket) {
    try {
      return JSON.parse(bracket[0]) as T;
    } catch {
      /* */
    }
  }

  throw new Error(`Cannot parse JSON from LLM output:\n${s.slice(0, 400)}`);
}

export const isLoaded = () => _pipe !== null;
export const modelId = () => _modelId;
