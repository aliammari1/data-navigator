/**
 * Model-presence detection + lazy engine loading for live evals.
 *
 * The GGUF weights are NOT bundled and NOT always present (see project memory:
 * they live under `<userData>/models/llm`, downloaded once while online). So
 * "live" evals — the ones that actually run the local LLM — must SKIP cleanly
 * whenever the model is absent or live mode is not explicitly requested.
 *
 * Two gates must BOTH be true for live evals to run:
 *   1. `DN_EVAL_LIVE` is set (opt-in; the deterministic CI run never sets it).
 *   2. A `*.gguf` file actually exists under the resolved model directory.
 *
 * IMPORTANT: importing THIS module must never load native modules. Detection
 * uses only `node:fs`/`node:os`/`node:path`. The real llama engine is pulled in
 * lazily, and ONLY when {@link loadLocalEngine} is called.
 */

import { existsSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** Type alias for vitest's `it` so we can re-export a gated variant. */
type ItApi = typeof import("vitest").it;
/** Type alias for vitest's `describe` so we can re-export a gated variant. */
type DescribeApi = typeof import("vitest").describe;

/**
 * Candidate directories that may hold the GGUF weights, in priority order:
 *   1. `DN_MODEL_DIR` (explicit override — wins if set).
 *   2. The Electron-default userData dir on this OS, suffixed with the app name.
 *      In dev the Electron app name is "Electron", so on Windows the weights
 *      land in `%APPDATA%/Electron/models/llm` (per project memory). The
 *      packaged app uses "Data Navigator", so we probe that too.
 */
function candidateModelDirs(): string[] {
  const dirs: string[] = [];

  const override = process.env.DN_MODEL_DIR?.trim();
  if (override) dirs.push(override);

  for (const base of userDataBases()) {
    // Both the dev ("Electron") and packaged ("Data Navigator") app names.
    dirs.push(
      path.join(base, "Electron", "models", "llm"),
      path.join(base, "Data Navigator", "models", "llm"),
    );
  }

  return dirs;
}

/**
 * Per-OS base directory that Electron's `app.getPath("userData")` is derived
 * from (it appends the app name). We mirror that resolution here without
 * importing `electron` (which is unavailable in a plain node/vitest process).
 */
function userDataBases(): string[] {
  const home = os.homedir();
  const bases: string[] = [];

  if (process.platform === "win32") {
    // Electron uses %APPDATA% (Roaming) for userData on Windows.
    const appData = process.env.APPDATA ?? path.join(home, "AppData", "Roaming");
    bases.push(appData);
  } else if (process.platform === "darwin") {
    bases.push(path.join(home, "Library", "Application Support"));
  } else {
    // Linux / other: XDG config home.
    const xdg = process.env.XDG_CONFIG_HOME ?? path.join(home, ".config");
    bases.push(xdg);
  }

  return bases;
}

/** True when `dir` exists and contains at least one `*.gguf` file. */
function dirHasGguf(dir: string): boolean {
  try {
    if (!existsSync(dir)) return false;
    return readdirSync(dir).some((f) => f.toLowerCase().endsWith(".gguf"));
  } catch {
    // Permission error / race / not a directory — treat as "no model".
    return false;
  }
}

/**
 * Resolve the first candidate model directory that actually contains a GGUF
 * file, or `null` when none do. Never throws.
 */
export function resolveModelDir(): string | null {
  for (const dir of candidateModelDirs()) {
    if (dirHasGguf(dir)) return dir;
  }
  return null;
}

/**
 * True only when live evals should run: `DN_EVAL_LIVE` is set AND a GGUF model
 * is present under one of the candidate directories. Never throws.
 */
export function hasLocalModel(): boolean {
  if (!process.env.DN_EVAL_LIVE) return false;
  return resolveModelDir() !== null;
}

/**
 * `it` for live evals: runs when a local model is present, otherwise skips.
 * Usage: `liveIt("generates SQL", async () => { ... })`.
 */
export const liveIt: ItApi["skip"] | ItApi = hasLocalModel()
  ? (globalThis as unknown as { it: ItApi }).it
  : (globalThis as unknown as { it: ItApi }).it?.skip;

/**
 * `describe` for live eval blocks: runs when a local model is present,
 * otherwise skips the whole block.
 */
export const liveDescribe: DescribeApi["skip"] | DescribeApi = hasLocalModel()
  ? (globalThis as unknown as { describe: DescribeApi }).describe
  : (globalThis as unknown as { describe: DescribeApi }).describe?.skip;

/**
 * The default GGUF the app ships with (mirrors `DEFAULT_LLM_MODEL` in
 * `electron/llama-service.ts`). Used when a live eval does not name a file.
 */
export const DEFAULT_EVAL_MODEL = "qwen2.5-1.5b-instruct-q4_k_m.gguf";

/**
 * A minimal local llama engine that live evals drive directly.
 *
 * NOTE: this deliberately does NOT route through `electron/llama-service.ts`.
 * That service resolves its model directory from Electron's `app.getPath(...)`,
 * which is `undefined` outside the Electron main process, so it cannot run in a
 * plain vitest/node process. Instead we load the resolved GGUF straight through
 * `node-llama-cpp`, mirroring the service's CPU-by-default settings. This keeps
 * live evals runnable from a normal node process while staying faithful to how
 * the app loads the same weights.
 */
/**
 * The exact token counts + timing marks captured for one generation, in the
 * standard shape used to report inference throughput.
 *
 * All times are milliseconds from a monotonic clock (`performance.now()`), so
 * they are immune to wall-clock changes. Token counts come from the model's own
 * tokenizer (`model.tokenize`), so they are exact rather than estimated.
 */
export interface GenerationMetrics {
  /** Generated text (same value the plain `generate()` returns). */
  text: string;
  /**
   * PROMPT/PREFILL tokens: exact length of `model.tokenize(promptForCount)`.
   * This is the input the model must read before it can emit a token. It does
   * NOT include the chat template / system framing the session adds around it
   * (see {@link promptForCount}); it is the user-content token count, which is
   * what a like-for-like prefill comparison across prompts should hold fixed.
   */
  promptTokens: number;
  /** DECODE/GENERATION tokens: exact length of `model.tokenize(text)`. */
  generatedTokens: number;
  /** TIME-TO-FIRST-TOKEN: ms from prompt submit to the first streamed chunk. */
  ttftMs: number;
  /** Total end-to-end latency: ms from prompt submit to generation complete. */
  totalMs: number;
  /**
   * PREFILL throughput (tokens/sec): `promptTokens / (ttftMs / 1000)`. TTFT is
   * the closest proxy we have to prefill time — it is the interval during which
   * the model reads the whole prompt and produces the first output token, so it
   * is dominated by prefill on a cold sequence. `null` when TTFT is 0/undefined.
   */
  prefillTokensPerSec: number | null;
  /**
   * DECODE throughput (tokens/sec): `generatedTokens / (decodeMs / 1000)` where
   * `decodeMs = totalMs - ttftMs` is the time spent emitting tokens AFTER the
   * first. `null` when no decode interval / no generated tokens were observed.
   */
  decodeTokensPerSec: number | null;
}

export interface LocalEngine {
  /** Resolved model directory containing the GGUF that will be loaded. */
  modelDir: string;
  /** Absolute path to the GGUF that will be / was loaded. */
  modelPath: string;
  /** Load (or switch to) a GGUF model under the model dir. Idempotent. */
  ensureModel: (file?: string) => Promise<{ model: string }>;
  /** Free-form text generation. */
  generate: (input: {
    system?: string;
    prompt: string;
    maxTokens?: number;
    temperature?: number;
  }) => Promise<{ text: string }>;
  /**
   * Like {@link generate}, but instruments the run with exact token counts and
   * timing marks ({@link GenerationMetrics}). Uses `model.tokenize` for counts,
   * the streaming `onTextChunk` callback to mark first-token time, and
   * `performance.now()` for timing. A fresh context is created per call so each
   * measurement starts from a cold sequence (representative prefill).
   */
  generateWithMetrics: (input: {
    system?: string;
    prompt: string;
    maxTokens?: number;
    temperature?: number;
  }) => Promise<GenerationMetrics>;
  /**
   * Exact token count of `text` per the loaded model's own tokenizer. Loads the
   * model if needed. Useful for sizing a prompt before a run.
   */
  countTokens: (text: string) => Promise<number>;
  /** Whether the (default or named) GGUF file exists and is loadable. */
  isAvailable: (file?: string) => Promise<boolean>;
  /** Free the loaded model + context. */
  dispose: () => Promise<void>;
}

/**
 * Resolve the GGUF filename a live eval asked for. Falls back to the default,
 * then to whatever single `*.gguf` happens to be in the model dir, so an eval
 * works even if the installed model has a different filename.
 */
function resolveModelFile(dir: string, file?: string): string {
  if (file) return file;
  if (existsSync(path.join(dir, DEFAULT_EVAL_MODEL))) return DEFAULT_EVAL_MODEL;
  try {
    const ggufs = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".gguf"));
    if (ggufs.length > 0) return ggufs[0];
  } catch {
    // fall through to the default name; ensureModel will surface a clear error
  }
  return DEFAULT_EVAL_MODEL;
}

/**
 * Lazily build a local llama engine bound to the resolved model directory. The
 * dynamic `import("node-llama-cpp")` is what pulls in the native module, so it
 * MUST stay inside `ensureModel` — importing `_model.ts` (or even calling
 * `loadLocalEngine`) never touches native code until generation actually runs.
 *
 * GPU is opt-in via `DN_LLAMA_GPU` (matching the app); CPU-only otherwise.
 *
 * @throws Error when no local model is present (call {@link hasLocalModel}
 *         first, or use {@link liveIt}/{@link liveDescribe} which guard this).
 */
export async function loadLocalEngine(): Promise<LocalEngine> {
  const resolvedDir = resolveModelDir();
  if (!resolvedDir) {
    throw new Error(
      "loadLocalEngine(): no GGUF model found. Set DN_EVAL_LIVE=1 and install a " +
        "model under DN_MODEL_DIR (or <userData>/models/llm).",
    );
  }
  // Bind the non-null directory to a `string`-typed const so the narrowing
  // survives into the nested closures below (control-flow narrowing from the
  // guard above is not preserved across function boundaries).
  const dir: string = resolvedDir;

  // Loaded lazily inside ensureModel; `unknown` avoids a static type dep on the
  // native module at the top level. `tokenize` is the model's own tokenizer, so
  // token counts are exact (not estimated).
  let llama: unknown = null;
  let model:
    | {
        dispose: () => Promise<void>;
        createContext: (o?: unknown) => Promise<unknown>;
        tokenize: (text: string) => unknown[];
      }
    | null = null;
  let loadedPath: string | null = null;
  const targetPath = path.join(dir, resolveModelFile(dir));

  const gpuEnabled = (() => {
    const v = process.env.DN_LLAMA_GPU?.trim().toLowerCase();
    return !!v && ["1", "true", "yes", "on", "auto", "vulkan", "cuda", "metal"].includes(v);
  })();

  async function ensureModel(file?: string): Promise<{ model: string }> {
    const target = path.join(dir, resolveModelFile(dir, file));
    if (!existsSync(target)) {
      throw new Error(`Missing GGUF model: ${target}`);
    }
    if (model && loadedPath === target) return { model: target };

    // Dynamic import — native module loads here and ONLY here.
    const { getLlama } = (await import("node-llama-cpp")) as {
      getLlama: (o?: { gpu?: false }) => Promise<{
        loadModel: (o: { modelPath: string }) => Promise<NonNullable<typeof model>>;
      }>;
    };
    if (!llama) {
      llama = gpuEnabled ? await getLlama() : await getLlama({ gpu: false });
    }

    if (model) {
      await model.dispose().catch(() => undefined);
      model = null;
    }
    model = await (llama as Awaited<ReturnType<typeof getLlama>>).loadModel({ modelPath: target });
    loadedPath = target;
    return { model: target };
  }

  return {
    modelDir: dir,
    modelPath: targetPath,
    ensureModel,
    isAvailable: async (file?: string) => existsSync(path.join(dir, resolveModelFile(dir, file))),
    generate: async (input) => {
      await ensureModel();
      // Imported lazily so the type-only import does not load native code early.
      const { LlamaChatSession } = (await import("node-llama-cpp")) as unknown as {
        LlamaChatSession: new (o: { contextSequence: unknown; systemPrompt?: string }) => {
          prompt: (p: string, o?: { maxTokens?: number; temperature?: number }) => Promise<string>;
        };
      };
      // ensureModel() guarantees `model` is loaded; assert for the type checker.
      if (!model) throw new Error("loadLocalEngine(): model not loaded");
      const context = (await model.createContext()) as {
        getSequence: () => unknown;
        dispose: () => Promise<void>;
      };
      try {
        const session = new LlamaChatSession({
          contextSequence: context.getSequence(),
          systemPrompt: input.system,
        });
        const text = await session.prompt(input.prompt, {
          maxTokens: input.maxTokens ?? 256,
          temperature: input.temperature ?? 0,
        });
        return { text };
      } finally {
        await context.dispose().catch(() => undefined);
      }
    },
    countTokens: async (text: string) => {
      await ensureModel();
      if (!model) throw new Error("loadLocalEngine(): model not loaded");
      return model.tokenize(text).length;
    },
    generateWithMetrics: async (input) => {
      await ensureModel();
      // `performance.now()` is a monotonic clock — immune to wall-clock skew and
      // never derived from `Date.now()`, so timing stays deterministic-by-method.
      const { performance } = await import("node:perf_hooks");
      const { LlamaChatSession } = (await import("node-llama-cpp")) as unknown as {
        LlamaChatSession: new (o: { contextSequence: unknown; systemPrompt?: string }) => {
          prompt: (
            p: string,
            o?: {
              maxTokens?: number;
              temperature?: number;
              onTextChunk?: (text: string) => void;
            },
          ) => Promise<string>;
        };
      };
      if (!model) throw new Error("loadLocalEngine(): model not loaded");

      // Exact PROMPT/PREFILL token count from the model's own tokenizer, taken
      // BEFORE generation so it cannot be perturbed by it.
      const promptTokens = model.tokenize(input.prompt).length;

      const context = (await model.createContext()) as {
        getSequence: () => unknown;
        dispose: () => Promise<void>;
      };
      try {
        const session = new LlamaChatSession({
          contextSequence: context.getSequence(),
          systemPrompt: input.system,
        });

        let ttftMs: number | null = null;
        const submittedAt = performance.now();
        const text = await session.prompt(input.prompt, {
          maxTokens: input.maxTokens ?? 256,
          temperature: input.temperature ?? 0,
          // First fire of the stream marks TTFT. Guard against a 0-length first
          // chunk by only recording on the first invocation regardless of text.
          onTextChunk: () => {
            if (ttftMs === null) ttftMs = performance.now() - submittedAt;
          },
        });
        const totalMs = performance.now() - submittedAt;

        // Exact DECODE token count, again from the model's tokenizer.
        const generatedTokens = model.tokenize(text).length;

        // If nothing streamed (empty generation), TTFT is undefined; fall back to
        // totalMs so downstream throughput is `null` rather than misleadingly huge.
        const ttft = ttftMs ?? totalMs;
        const decodeMs = Math.max(0, totalMs - ttft);

        const prefillTokensPerSec =
          ttft > 0 && promptTokens > 0 ? promptTokens / (ttft / 1000) : null;
        const decodeTokensPerSec =
          decodeMs > 0 && generatedTokens > 0 ? generatedTokens / (decodeMs / 1000) : null;

        return {
          text,
          promptTokens,
          generatedTokens,
          ttftMs: ttft,
          totalMs,
          prefillTokensPerSec,
          decodeTokensPerSec,
        };
      } finally {
        await context.dispose().catch(() => undefined);
      }
    },
    dispose: async () => {
      if (model) {
        await model.dispose().catch(() => undefined);
        model = null;
        loadedPath = null;
      }
    },
  };
}
