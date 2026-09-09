import type { ZodType } from "zod";
import { isElectron } from "@/platform/electron/electron-fs";
import type {
  AICapabilities,
  AIGenerateRequest,
  AIModelInfo,
  AIProvider,
  AIResult,
} from "../types";
import { zodToInlineJsonSchema } from "../zod-json-schema";
import { generateStructuredByPrompt, toSystemUser } from "./base";

/**
 * node-llama-cpp adapter — the sole generative + structured lane.
 *
 * node-llama-cpp can ONLY run in the Electron MAIN process (it crashes the
 * renderer), so this adapter is a *thin IPC client*: it calls
 * `window.electronLlama.*`, which a sibling agent exposes from
 * `electron/preload.ts` over the `llama:*` IPC channels (mirroring the existing
 * `electronDuckDB` bridge). The decisive feature is
 * grammar-constrained decoding: a JSON schema (derived from the caller's Zod
 * schema) constrains the sampler so structured output is valid *by
 * construction* — no regex-repair brute force needed.
 *
 * Availability is gated on `window.electronLlama` existing AND the main-process
 * service reporting a loadable model — so on the web build, or before a GGUF is
 * downloaded, `isAvailable()` is simply false and callers see the "no offline
 * model is ready" error rather than a silent fallback to a different provider.
 */

/**
 * The authoritative `window.electronLlama` shape is declared ONCE, by the
 * contextBridge that actually exposes it (`electron/preload.ts`). This adapter
 * consumes that global type rather than re-declaring a divergent one, so the
 * IPC contract can never drift between the bridge and its only consumer.
 *
 * `electronLlama` is always present on the bridge build but is absent on the
 * web build, so we treat it as possibly-undefined at the access site (`bridge()`
 * null-checks `window.electronLlama`).
 */
type ElectronLlama = Window["electronLlama"];

/**
 * Curated GGUF models stored under `<userData>/models/llm/`. The `id` is the
 * filename passed straight to `electronLlama.ensureModel({ file })`. Mirrors
 * electron/model-download-service.ts's MODEL_DOWNLOADS — the canonical
 * catalog — and src/platform/ai/models/model-manifest.ts; keep all three in
 * lockstep when the catalog changes.
 */
const MODELS: AIModelInfo[] = [
  {
    id: "gemma-4-e2b-qat-mobile-text-only.gguf",
    label: "Gemma 4 E2B Instruct (QAT Mobile Text-only)",
    family: "Gemma 4",
    sizeLabel: "E2B",
    downloadMb: 840,
  },
  {
    id: "lfm2-5-2.6b-q4_k_m.gguf",
    label: "LFM2.5-2.6B Instruct (Q4_K_M, Liquid AI 2026)",
    family: "LFM",
    sizeLabel: "2.6B",
    downloadMb: 1674.45504,
  },
  {
    id: "granite-4.0-1b-q4_k_m.gguf",
    label: "Granite 4.0 1B Instruct (GGUF q4, Apache 2.0)",
    family: "Granite 4.0",
    sizeLabel: "1B",
    downloadMb: 1023.64544,
  },
  {
    id: "qwen3-1.7b-q4_k_m.gguf",
    label: "Qwen3-1.7B Instruct (GGUF q4, Apache 2.0)",
    family: "Qwen3",
    sizeLabel: "1.7B",
    downloadMb: 1100,
  },
  {
    id: "gemma-4-e4b-it-q4_k_m.gguf",
    label: "Gemma 4 E4B Instruct (GGUF q4, power-user)",
    family: "Gemma 4",
    sizeLabel: "E4B",
    downloadMb: 5340,
  },
  {
    id: "granite-4.1-3b-instruct-q4_k_m.gguf",
    label: "Granite 4.1 3B Instruct (GGUF q4, Apache 2.0)",
    family: "Granite 4.1",
    sizeLabel: "3B",
    downloadMb: 2099.501664,
  },
];

function bridge(): ElectronLlama | null {
  if (typeof window === "undefined") return null;
  // `electronLlama` is typed as always-present (the bridge declares it), but it
  // is genuinely absent on the web build — guard the runtime value.
  return window.electronLlama ?? null;
}

export const llamacppProvider: AIProvider = {
  id: "llamacpp",
  label: "node-llama-cpp (offline, CPU/GPU, grammar JSON)",
  capabilities: {
    streaming: true,
    // The differentiator vs transformers / web-llm: GBNF/JSON-schema grammar
    // makes structured output valid by construction.
    structuredNative: true,
    offline: true,
    requiresWebGPU: false,
  } satisfies AICapabilities,

  async isAvailable() {
    const api = bridge();
    if (!api || !isElectron()) return false;
    try {
      return await api.isAvailable();
    } catch {
      return false;
    }
  },

  async listModels() {
    return MODELS;
  },

  async ensureReady(model, onProgress) {
    const api = bridge();
    if (!api) return;
    // Callers may pass a model id from another lane's namespace (e.g. a
    // transformers HF id). Only `*.gguf` ids in this lane's catalog are valid
    // files; anything else falls back to the default GGUF so the warm-up never
    // throws a spurious "missing GGUF" for a non-llamacpp id.
    const known = MODELS.some((m) => m.id === model);
    const file = known ? model : MODELS[0].id;
    onProgress?.({ status: "loading", progress: 10, message: `Loading ${file}…` });
    await api.ensureModel({ file });
    onProgress?.({ status: "ready", progress: 100 });
  },

  async generate(req: AIGenerateRequest): Promise<AIResult> {
    const api = bridge();
    if (!api) throw new Error('AI provider "llamacpp" is not available.');
    const { system, user } = toSystemUser(req);
    const started = Date.now();

    // A4: hand the run-stable prefix to the main process so it can preload its KV
    // once and reuse it across the run; strip it from the user prompt to avoid
    // sending the grounding twice. Only when it really is a leading prefix.
    const prefix =
      req.systemPrefix && user.startsWith(req.systemPrefix) ? req.systemPrefix : undefined;
    const promptTail = prefix ? user.slice(prefix.length).replace(/^\s+/, "") : user;

    // Streaming is request-correlated, not a separate IPC method: subscribe to
    // `llama:token` for this requestId, pass the SAME id into `generate`, and
    // unsubscribe once it resolves. Main fans out per-chunk tokens tagged with
    // the id. Always mint an id so `abort(requestId)` can target this request.
    const requestId =
      globalThis.crypto?.randomUUID?.() ??
      `llama-${started}-${Math.random().toString(36).slice(2)}`;

    let unsubscribe: (() => void) | undefined;
    if (req.onToken) {
      const onToken = req.onToken;
      unsubscribe = api.onToken(requestId, (chunk) => onToken(chunk));
    }

    try {
      const result = await api.generate({
        requestId,
        system: system || undefined,
        prompt: promptTail,
        ...(prefix ? { systemPrefix: prefix } : {}),
        maxTokens: req.maxTokens ?? 512,
        temperature: req.temperature ?? 0,
        ...(req.topP !== undefined ? { topP: req.topP } : {}),
      });

      return {
        text: result.text,
        model: req.model,
        provider: "llamacpp",
        finishReason: req.signal?.aborted ? "abort" : result.finishReason,
        elapsedMs: Date.now() - started,
      };
    } finally {
      unsubscribe?.();
    }
  },

  async generateStructured<T>(req: AIGenerateRequest, schema: ZodType<T>): Promise<T> {
    const api = bridge();
    if (!api) throw new Error('AI provider "llamacpp" is not available.');

    // Build a GBNF-safe inline JSON schema. If conversion fails (e.g. an exotic
    // schema the grammar subset can't express), fall back to prompt+repair —
    // still correct, just without the constrained-decoding guarantee.
    const jsonSchema = zodToInlineJsonSchema(schema as ZodType, {
      stripAdditionalProperties: true,
    });
    if (!jsonSchema) {
      return generateStructuredByPrompt(this, req, schema);
    }

    const { system, user } = toSystemUser(req);
    const prefix =
      req.systemPrefix && user.startsWith(req.systemPrefix) ? req.systemPrefix : undefined;
    const promptTail = prefix ? user.slice(prefix.length).replace(/^\s+/, "") : user;
    const out = await api.generateStructured({
      system: system || undefined,
      prompt: promptTail,
      ...(prefix ? { systemPrefix: prefix } : {}),
      jsonSchema,
      maxTokens: req.maxTokens ?? 700,
      temperature: req.temperature ?? 0,
    });

    // Grammar guarantees the shape; Zod re-applies refinements/coercions and
    // gives the caller a typed value.
    return schema.parse(out);
  },
};
