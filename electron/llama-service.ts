/**
 * node-llama-cpp Service — Electron MAIN process edition (PRIMARY generative lane).
 *
 * Mental model (mirrors duckdb-service.ts / voice-service.ts):
 * - node-llama-cpp runs ONLY in the Electron main process. Importing it in the
 *   renderer crashes the app, so it lives here behind IPC (`llama:*`) and the
 *   renderer talks to it through the thin `window.electronLlama` adapter.
 * - GGUF weights are NOT bundled in the asar. They are downloaded once while
 *   online into `<userData>/models/llm/<model>.gguf`.
 * - One `Llama` instance (singleton). CPU-only by default for stability on
 *   medium-end / weak-iGPU machines; GPU is opt-in via `DN_LLAMA_GPU`.
 * - One `LlamaModel` kept loaded; a FRESH context is created per request and
 *   disposed afterwards (contexts hold KV-cache memory).
 * - Requests are serialized through a queue: one context sequence generates one
 *   sequence at a time, so unbounded concurrency would corrupt state.
 *
 * Public API:
 * - ensureModel()
 * - generate()          — free-form text, optional streaming via onToken
 * - generateStructured() — JSON constrained at the sampler by a JSON-schema grammar
 * - isAvailable()
 * - listModels()
 * - dispose()
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { app } from "electron";
import type { Llama, LlamaContext, LlamaModel } from "node-llama-cpp";

// ─── Types ──────────────────────────────────────────────────────────────────

export type LlamaGenerateInput = {
  system?: string;
  prompt: string;
  /** Run-stable leading grounding the renderer already stripped from `prompt`. */
  systemPrefix?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  /**
   * Streaming sink. In the IPC layer (main.ts) this is wired to
   * `event.sender.send("llama:token", { id, chunk })`; the service itself just
   * invokes it per decoded chunk.
   */
  onToken?: (chunk: string) => void;
  /** AbortSignal raised from the renderer via `llama:abort`. */
  signal?: AbortSignal;
};

export type LlamaGenerateResult = {
  text: string;
  model: string;
  /** Why generation stopped, best-effort. */
  finishReason: "stop" | "length" | "abort";
  promptTokens: number;
  completionTokens: number;
  elapsedMs: number;
};

export type LlamaGenerateStructuredInput = {
  system?: string;
  prompt: string;
  /** Run-stable leading grounding the renderer already stripped from `prompt`. */
  systemPrefix?: string;
  /**
   * Inline JSON schema (the renderer adapter produces this via
   * `zodToJsonSchema(schema, { $refStrategy: "none" })`). The GBNF-supported
   * subset only: type/properties/items/enum/oneOf/required — no $ref/allOf/
   * pattern/format.
   */
  jsonSchema: object;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
};

export type LlamaModelInfo = {
  id: string;
  label: string;
  family: string;
  sizeLabel: string;
  present: boolean;
  path: string;
};

// ─── Constants ──────────────────────────────────────────────────────────────

export const DEFAULT_LLM_MODEL = "qwen2.5-1.5b-instruct-q4_k_m.gguf";

const KNOWN_MODELS: Array<Omit<LlamaModelInfo, "present" | "path">> = [
  {
    id: "qwen2.5-1.5b-instruct-q4_k_m.gguf",
    label: "Qwen2.5 1.5B Instruct (GGUF q4)",
    family: "Qwen2.5",
    sizeLabel: "1.5B",
  },
  {
    id: "qwen2.5-0.5b-instruct-q4_k_m.gguf",
    label: "Qwen2.5 0.5B Instruct (GGUF q4)",
    family: "Qwen2.5",
    sizeLabel: "0.5B",
  },
];

const DEFAULT_CONTEXT_SIZE = 4096;
const DEFAULT_MAX_TOKENS = 512;
// Structured JSON (SQL + titles + summaries) routinely needs more than 700
// tokens on the 1.5B model; too small a budget truncates the JSON mid-string and
// `grammar.parse` then throws "Unterminated string". Give it generous headroom.
const DEFAULT_STRUCTURED_MAX_TOKENS = 1536;

/**
 * Best-effort repair of JSON that was truncated by the token limit. The sampler
 * grammar guarantees the prefix is well-formed JSON; if generation stopped before
 * the closing braces, we close any open string and balance the bracket stack so a
 * near-complete object still parses (the renderer re-validates with Zod). This is
 * a graceful-degradation net, not the happy path.
 */
function repairTruncatedJson(raw: string): string {
  let s = raw.trim();
  // Strip code fences if the model added them despite the grammar.
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence?.[1]) s = fence[1].trim();

  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") stack.push("}");
    else if (c === "[") stack.push("]");
    else if (c === "}" || c === "]") stack.pop();
  }
  // Drop a dangling escape, then close an open string.
  if (escaped) s = s.slice(0, -1);
  if (inString) s += '"';
  // Remove a trailing comma / partial key before closing.
  s = s.replace(/,\s*$/, "");
  while (stack.length) s += stack.pop();
  return s;
}

// ─── Module state ───────────────────────────────────────────────────────────

let llamaPromise: Promise<Llama> | null = null;
let model: LlamaModel | null = null;
let loadedModelPath: string | null = null;
/**
 * One long-lived context, reused across every generation.
 *
 * Creating + disposing a fresh `LlamaContext` per call (the swarm fires a dozen+
 * serialized calls per question) churns native GPU/CPU state and reproducibly
 * crashes node-llama-cpp on Windows (STATUS_STACK_BUFFER_OVERRUN / 0xC0000409).
 * Instead we keep ONE context and take a fresh disposable *sequence* per call —
 * sequences are cheap and isolate each prompt's KV cache. The context is rebuilt
 * only when the model changes (see ensureModel).
 */
let sharedContext: LlamaContext | null = null;

async function getSharedContext(): Promise<LlamaContext> {
  if (sharedContext) return sharedContext;
  // biome-ignore lint/style/noNonNullAssertion: callers invoke ensureModel() first, which guarantees `model`.
  sharedContext = await model!.createContext({ contextSize: DEFAULT_CONTEXT_SIZE });
  return sharedContext;
}

async function disposeSharedContext(): Promise<void> {
  clearWarmSessions();
  if (sharedContext) {
    try {
      await sharedContext.dispose();
    } catch {
      // best-effort
    }
    sharedContext = null;
  }
}

// ─── A4: warm prefix-keyed chat sessions ─────────────────────────────────────
// One LlamaChatSession per distinct system prefix (the shared dataset grounding)
// keeps that prefix's KV prefilled and reuses it across a run's calls. This is the
// SUPPORTED node-llama-cpp 3.18.1 pattern (preloadPrompt + getChatHistory baseline
// + setChatHistory rewind on ONE long-lived sequence): for a standard transformer
// like Qwen2.5 the unchanged leading prefix is reused automatically (needsCheckpoints
// === false) and native GBNF grammar is preserved. It is structurally SAFER than the
// per-call context churn that historically crashed Windows (already removed), since it
// holds even less native state in flux. Single-flight via enqueue(); on ANY error it
// disposes the session and falls back to the per-call path — worst case "no speedup",
// never wrong output. Set to false only if a specific Windows box shows native instability.
const WARM_PREFIX_ENABLED = true;
const WARM_MAX = 2;

interface WarmEntry {
  // node-llama-cpp's session/sequence/history types are intentionally loose here.
  // biome-ignore lint/suspicious/noExplicitAny: third-party runtime objects.
  session: any;
  // biome-ignore lint/suspicious/noExplicitAny: third-party runtime objects.
  sequence: any;
  // biome-ignore lint/suspicious/noExplicitAny: third-party runtime objects.
  baseline: any;
}

const warmSessions = new Map<string, WarmEntry>();

function clearWarmSessions(): void {
  for (const entry of warmSessions.values()) {
    try {
      entry.sequence.dispose();
    } catch {
      // best-effort
    }
  }
  warmSessions.clear();
}

function dropWarmSession(entry: WarmEntry): void {
  for (const [key, value] of warmSessions) {
    if (value === entry) {
      warmSessions.delete(key);
      break;
    }
  }
  try {
    entry.sequence.dispose();
  } catch {
    // best-effort
  }
}

async function getWarmSession(systemPrefix: string): Promise<WarmEntry | null> {
  const key = `${loadedModelPath ?? ""}::${systemPrefix}`;
  const existing = warmSessions.get(key);
  if (existing) {
    warmSessions.delete(key);
    warmSessions.set(key, existing); // LRU refresh
    return existing;
  }
  try {
    const { LlamaChatSession } = await import("node-llama-cpp");
    const context = await getSharedContext();
    const sequence = context.getSequence();
    // autoDisposeSequence:false — we own the sequence lifecycle (dispose on evict/clear).
    const session = new LlamaChatSession({
      contextSequence: sequence,
      systemPrompt: systemPrefix,
      autoDisposeSequence: false,
    });
    await session.preloadPrompt("");
    const entry: WarmEntry = { session, sequence, baseline: session.getChatHistory() };
    warmSessions.set(key, entry);
    while (warmSessions.size > WARM_MAX) {
      const oldest = warmSessions.keys().next().value;
      if (oldest === undefined) break;
      const old = warmSessions.get(oldest);
      warmSessions.delete(oldest);
      try {
        old?.sequence.dispose();
      } catch {
        // best-effort
      }
    }
    return entry;
  } catch {
    return null;
  }
}

/**
 * Serialize generation. A loaded model can only run one sequence per context at
 * a time; queueing keeps requests from clobbering each other's KV cache without
 * pulling in a heavyweight queue dependency.
 */
let queueTail: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queueTail.then(task, task);
  // Keep the chain alive even if a task rejects.
  queueTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function modelDir(): string {
  return path.join(app.getPath("userData"), "models", "llm");
}

function modelPath(file: string): string {
  return path.join(modelDir(), file);
}

/**
 * True when the operator explicitly opted back into GPU acceleration via the
 * `DN_LLAMA_GPU` env var. Default (unset) is CPU-only.
 */
function gpuExplicitlyEnabled(): boolean {
  const value = process.env.DN_LLAMA_GPU?.trim().toLowerCase();
  if (!value) return false;
  return ["1", "true", "yes", "on", "auto", "vulkan", "cuda", "metal"].includes(value);
}

/**
 * Idempotent singleton.
 *
 * CPU-only by DEFAULT: the GPU (Vulkan) path crashed on weak/old integrated
 * GPUs — notably Intel Iris Xe with a stale driver, which loses the device
 * during context creation (`vk::Queue::submit: ErrorDeviceLost`). The product
 * targets medium-end PCs and must work offline, so a 1.5B q4 model on CPU
 * (AVX/AVX2/AVX512) is the stable, fully portable default.
 *
 * GPU acceleration is opt-in via `DN_LLAMA_GPU` (e.g. `=1`, `=vulkan`, `=cuda`).
 * When opted in, `getLlama()` auto-detects the best backend and still falls back
 * to CPU once if device creation throws on a flaky GPU.
 */
async function getLlamaInstance(): Promise<Llama> {
  if (!llamaPromise) {
    llamaPromise = (async () => {
      const { getLlama } = await import("node-llama-cpp");
      if (!gpuExplicitlyEnabled()) {
        return getLlama({ gpu: false });
      }
      try {
        return await getLlama();
      } catch (error) {
        console.warn("[llama] GPU init failed, falling back to CPU:", error);
        return getLlama({ gpu: false });
      }
    })();
    // If init rejects, allow a later retry instead of caching the rejection.
    llamaPromise.catch(() => {
      llamaPromise = null;
    });
  }
  return llamaPromise;
}

function abortError(): Error {
  const error = new Error("Llama generation aborted");
  error.name = "AbortError";
  return error;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Load (or switch to) a GGUF model from `<userData>/models/llm`. Idempotent for
 * an already-loaded model; disposes the previous model when switching.
 */
export async function ensureModel(file: string = DEFAULT_LLM_MODEL): Promise<{ model: string }> {
  const llama = await getLlamaInstance();
  const target = modelPath(file);

  if (!existsSync(target)) {
    throw new Error(`Missing GGUF model: ${target}. Download it while online into ${modelDir()}.`);
  }

  if (model && loadedModelPath === target) {
    return { model: target };
  }

  if (model) {
    await disposeSharedContext();
    await model.dispose();
    model = null;
    loadedModelPath = null;
  }

  model = await llama.loadModel({ modelPath: target });
  loadedModelPath = target;
  return { model: target };
}

/** Free-form generation with optional streaming via `input.onToken`. */
export async function generate(input: LlamaGenerateInput): Promise<LlamaGenerateResult> {
  return enqueue(async () => {
    const start = Date.now();
    await ensureModel();

    if (input.signal?.aborted) throw abortError();

    // The renderer stripped the grounding into `systemPrefix`; the per-call path
    // reconstructs the full prompt so behaviour is identical whether or not the
    // warm path runs.
    const effectivePrompt = input.systemPrefix
      ? `${input.systemPrefix}\n\n${input.prompt}`
      : input.prompt;

    // A4 (gated): reuse a warm session whose prefix KV is already filled.
    if (WARM_PREFIX_ENABLED && input.systemPrefix) {
      const warm = await getWarmSession(input.systemPrefix);
      if (warm) {
        try {
          warm.session.setChatHistory(warm.baseline);
          const user = input.system ? `${input.system}\n\n${input.prompt}` : input.prompt;
          let warmFinish: LlamaGenerateResult["finishReason"] = "stop";
          let warmText = "";
          try {
            warmText = await warm.session.prompt(user, {
              maxTokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
              temperature: input.temperature ?? 0,
              topP: input.topP,
              signal: input.signal,
              onTextChunk: (chunk: string) => input.onToken?.(chunk),
            });
          } catch (error) {
            if (input.signal?.aborted) warmFinish = "abort";
            else throw error;
          }
          const warmCompletion = countTokens(warmText);
          return {
            text: warmText,
            model: loadedModelPath ?? "",
            finishReason:
              warmFinish === "abort"
                ? "abort"
                : warmCompletion >= (input.maxTokens ?? DEFAULT_MAX_TOKENS)
                  ? "length"
                  : "stop",
            promptTokens: countTokens(`${input.systemPrefix}\n${user}`),
            completionTokens: warmCompletion,
            elapsedMs: Date.now() - start,
          };
        } catch {
          if (input.signal?.aborted) throw abortError();
          dropWarmSession(warm);
          // fall through to the proven per-call path
        }
      }
    }

    const context = await getSharedContext();
    const sequence = context.getSequence();
    try {
      const { LlamaChatSession } = await import("node-llama-cpp");
      const session = new LlamaChatSession({
        contextSequence: sequence,
        systemPrompt: input.system,
      });

      let finishReason: LlamaGenerateResult["finishReason"] = "stop";
      let text = "";
      try {
        text = await session.prompt(effectivePrompt, {
          maxTokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
          temperature: input.temperature ?? 0,
          topP: input.topP,
          signal: input.signal,
          onTextChunk: (chunk: string) => input.onToken?.(chunk),
        });
      } catch (error) {
        if (input.signal?.aborted) {
          finishReason = "abort";
        } else {
          throw error;
        }
      }

      const promptTokens = countTokens(
        input.system ? `${input.system}\n${effectivePrompt}` : effectivePrompt,
      );
      const completionTokens = countTokens(text);

      return {
        text,
        model: loadedModelPath ?? "",
        finishReason:
          finishReason === "abort"
            ? "abort"
            : completionTokens >= (input.maxTokens ?? DEFAULT_MAX_TOKENS)
              ? "length"
              : "stop",
        promptTokens,
        completionTokens,
        elapsedMs: Date.now() - start,
      };
    } finally {
      sequence.dispose();
    }
  });
}

/**
 * Structured generation: the JSON schema constrains tokens AT THE SAMPLER, so
 * the output is parseable by construction (no regex repair). The schema is NOT
 * injected into the prompt — describe the desired JSON shape in `input.prompt`.
 */
export async function generateStructured(input: LlamaGenerateStructuredInput): Promise<unknown> {
  return enqueue(async () => {
    await ensureModel();
    const llama = await getLlamaInstance();

    if (input.signal?.aborted) throw abortError();

    // Factory method (correct v3 API) — returns a LlamaJsonSchemaGrammar over
    // the supported subset (type/properties/items/enum/oneOf/required).
    const grammar = await llama.createGrammarForJsonSchema(
      input.jsonSchema as Parameters<Llama["createGrammarForJsonSchema"]>[0],
    );

    const effectivePrompt = input.systemPrefix
      ? `${input.systemPrefix}\n\n${input.prompt}`
      : input.prompt;

    // A4 (gated): reuse a warm session whose prefix KV is already filled.
    if (WARM_PREFIX_ENABLED && input.systemPrefix) {
      const warm = await getWarmSession(input.systemPrefix);
      if (warm) {
        try {
          warm.session.setChatHistory(warm.baseline);
          const user = input.system ? `${input.system}\n\n${input.prompt}` : input.prompt;
          const raw = await warm.session.prompt(user, {
            grammar,
            maxTokens: input.maxTokens ?? DEFAULT_STRUCTURED_MAX_TOKENS,
            temperature: input.temperature ?? 0,
            signal: input.signal,
          });
          try {
            return grammar.parse(raw);
          } catch (parseErr) {
            try {
              return JSON.parse(repairTruncatedJson(raw));
            } catch {
              throw parseErr;
            }
          }
        } catch {
          if (input.signal?.aborted) throw abortError();
          dropWarmSession(warm);
          // fall through to the proven per-call path
        }
      }
    }

    const context = await getSharedContext();
    const sequence = context.getSequence();
    try {
      const { LlamaChatSession } = await import("node-llama-cpp");
      const session = new LlamaChatSession({
        contextSequence: sequence,
        systemPrompt: input.system,
      });

      const raw = await session.prompt(effectivePrompt, {
        grammar,
        maxTokens: input.maxTokens ?? DEFAULT_STRUCTURED_MAX_TOKENS,
        temperature: input.temperature ?? 0,
        signal: input.signal,
      });

      // Happy path: grammar guarantees the shape when generation completed.
      try {
        return grammar.parse(raw);
      } catch (parseErr) {
        // The token limit truncated the JSON mid-string. Repair + reparse so a
        // near-complete result still lands instead of sinking the whole run.
        try {
          return JSON.parse(repairTruncatedJson(raw));
        } catch {
          throw parseErr;
        }
      }
    } finally {
      sequence.dispose();
    }
  });
}

/** Enumerate known models and whether their GGUF file is present on disk. */
export function listModels(): LlamaModelInfo[] {
  return KNOWN_MODELS.map((m) => {
    const p = modelPath(m.id);
    return { ...m, path: p, present: existsSync(p) };
  });
}

/**
 * True when node-llama-cpp can be initialized AND the default model is present.
 * Never throws — callers gate the provider registry on this.
 */
export async function isAvailable(file: string = DEFAULT_LLM_MODEL): Promise<boolean> {
  try {
    if (!existsSync(modelPath(file))) return false;
    await ensureModel(file);
    return true;
  } catch {
    return false;
  }
}

/** Dispose the loaded model + llama instance (app shutdown / model switch reset). */
export async function dispose(): Promise<void> {
  clearWarmSessions();
  try {
    if (model) {
      await model.dispose();
    }
  } catch (error) {
    console.warn("[llama] model dispose error:", error);
  } finally {
    model = null;
    loadedModelPath = null;
  }

  try {
    if (llamaPromise) {
      const llama = await llamaPromise;
      await llama.dispose();
    }
  } catch {
    // ignore — best-effort teardown
  } finally {
    llamaPromise = null;
  }
}

// ─── token estimate ──────────────────────────────────────────────────────────
// Cheap heuristic (≈4 chars/token) for telemetry only — the real tokenizer
// lives on the model, but we avoid round-tripping it for a metrics field.
function countTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}
