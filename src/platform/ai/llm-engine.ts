"use client";

export type LLMModelId =
  | "Qwen2-0.5B-Instruct-q4f16_1-MLC"
  | "TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC"
  | "Llama-3.2-1B-Instruct-q4f16_1-MLC";

export interface LLMEngineState {
  status: "idle" | "loading" | "ready" | "inferring" | "error";
  progress: number;
  model: LLMModelId | null;
  error: string | null;
}

const DEFAULT_MODEL: LLMModelId = "Qwen2-0.5B-Instruct-q4f16_1-MLC";

// ─── Singleton state ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let engine: any | null = null;
let state: LLMEngineState = {
  status: "idle",
  progress: 0,
  model: null,
  error: null,
};
let initPromise: Promise<void> | null = null;
const subscribers = new Set<(s: LLMEngineState) => void>();

function setState(patch: Partial<LLMEngineState>) {
  state = { ...state, ...patch };
  for (const fn of subscribers) {
    try {
      fn(state);
    } catch {
      // subscriber threw — don't let it break the engine
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getLLMEngineState(): LLMEngineState {
  return state;
}

export function subscribeLLMEngine(fn: (s: LLMEngineState) => void): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function isLLMReady(): boolean {
  return state.status === "ready";
}

export async function initLLMEngine(
  model: LLMModelId = DEFAULT_MODEL,
  onProgress?: (s: LLMEngineState) => void,
): Promise<void> {
  if (typeof window === "undefined") return;

  if (state.status === "ready" && state.model === model) return;
  if (state.status === "loading" && state.model === model && initPromise) {
    if (onProgress) {
      const unsub = subscribeLLMEngine(onProgress);
      await initPromise.finally(unsub);
    } else {
      await initPromise;
    }
    return;
  }

  if (onProgress) subscribers.add(onProgress);

  initPromise = (async () => {
    setState({ status: "loading", progress: 0, model, error: null });
    try {
      const { CreateMLCEngine } = await import("@mlc-ai/web-llm");
      engine = await CreateMLCEngine(model, {
        initProgressCallback: (report: { progress: number; text: string }) => {
          setState({
            status: "loading",
            progress: Math.round(report.progress * 100),
          });
        },
      });
      setState({ status: "ready", progress: 100 });
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const friendly = raw.toLowerCase().includes("webgpu")
        ? "WebGPU not supported — try Chrome 113+ or Edge"
        : raw;
      engine = null;
      setState({ status: "error", error: friendly });
      throw new Error(friendly);
    } finally {
      if (onProgress) subscribers.delete(onProgress);
      initPromise = null;
    }
  })();

  await initPromise;
}

export async function generateText(
  userPrompt: string,
  options?: {
    systemPrompt?: string;
    maxTokens?: number;
    temperature?: number;
  },
): Promise<string> {
  if (typeof window === "undefined") return "";

  if (!isLLMReady() || engine === null) {
    await initLLMEngine(DEFAULT_MODEL);
  }

  if (engine === null) return "";

  setState({ status: "inferring" });

  try {
    const messages: { role: string; content: string }[] = [];

    if (options?.systemPrompt) {
      messages.push({ role: "system", content: options.systemPrompt });
    }
    messages.push({ role: "user", content: userPrompt });

    const reply = await engine.chat.completions.create({
      messages,
      max_tokens: options?.maxTokens ?? 512,
      temperature: options?.temperature ?? 0.7,
      stream: false,
    });

    return (reply.choices[0]?.message?.content as string | undefined) ?? "";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setState({ status: "error", error: msg });
    throw new Error(`LLM generation failed: ${msg}`);
  } finally {
    if (state.status === "inferring") {
      setState({ status: "ready" });
    }
  }
}

export async function unloadLLMEngine(): Promise<void> {
  if (engine !== null) {
    try {
      await engine.unload?.();
    } catch {
      // best-effort
    }
    engine = null;
  }
  setState({ status: "idle", progress: 0, model: null, error: null });
}
