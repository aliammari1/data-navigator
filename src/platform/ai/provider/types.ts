import type { ZodType } from "zod";

/**
 * Unified AI provider contract.
 *
 * node-llama-cpp (`adapters/llamacpp.ts`) is the sole text-generation provider —
 * a local GGUF model running in the Electron main process, offline by
 * construction. This module still exists as a single stable interface (rather
 * than feature code calling `adapters/llamacpp.ts` directly) so a future
 * provider can be added without touching every call site, and so callers can
 * ask about capabilities (streaming / structured output) generically.
 *
 * Design goals:
 *  - Offline-first: the provider runs fully local (no server, no network).
 *  - Capability-aware: callers can ask whether streaming / structured output /
 *    offline operation is supported before relying on it.
 *  - Structured output everywhere: `generateStructured` validates against a Zod
 *    schema, with a provider-native path when available and a robust
 *    prompt+repair fallback otherwise.
 */

export type ProviderId = "llamacpp";

export type AIRole = "system" | "user" | "assistant" | "tool";

export interface AIMessage {
  role: AIRole;
  content: string;
}

export interface AIModelInfo {
  /** Provider-specific model identifier passed back into requests. */
  id: string;
  /** Human label for menus. */
  label: string;
  family?: string;
  /** e.g. "0.5B", "1.1B". */
  sizeLabel?: string;
  /** Approximate download size in MB, when known (for offline UX). */
  downloadMb?: number;
}

export interface AICapabilities {
  /** Token-by-token streaming via `onToken`. */
  streaming: boolean;
  /** Native structured/JSON-schema constrained decoding. */
  structuredNative: boolean;
  /** Runs without any network/server once model weights are cached. */
  offline: boolean;
  /** Needs WebGPU for acceptable performance. */
  requiresWebGPU: boolean;
}

export type AIStatus = "idle" | "loading" | "ready" | "inferring" | "error";

export interface AIProgress {
  status: AIStatus;
  /** 0–100. */
  progress: number;
  message?: string;
}

export interface AIGenerateRequest {
  /** Provider-specific model id (see `listModels`). */
  model: string;
  /** Convenience system prompt; merged ahead of `messages`. */
  system?: string;
  /** Either provide a single `prompt` or a full `messages` array. */
  prompt?: string;
  messages?: AIMessage[];
  maxTokens?: number;
  /** 0 = greedy/deterministic. */
  temperature?: number;
  topP?: number;
  signal?: AbortSignal;
  /** Streaming sink; ignored by providers without streaming. */
  onToken?: (token: string) => void;
  /**
   * The leading, run-stable portion of `prompt` (e.g. the dataset grounding) that
   * the llamacpp lane can preload ONCE and reuse across a run's calls (prefix-KV
   * cache). Must be a prefix of `prompt`. Other lanes ignore it.
   */
  systemPrefix?: string;
}

export interface AIResult {
  text: string;
  model: string;
  provider: ProviderId;
  finishReason?: "stop" | "length" | "abort" | "error";
  /** Wall-clock generation time in ms (best effort). */
  elapsedMs?: number;
}

export interface AIProvider {
  readonly id: ProviderId;
  readonly label: string;
  readonly capabilities: AICapabilities;

  /** Cheap, side-effect-free probe: is this runtime usable right now? */
  isAvailable(): Promise<boolean>;

  /** Models this provider can serve (may be a static curated list). */
  listModels(): Promise<AIModelInfo[]>;

  /** Load/warm the given model, reporting progress. Idempotent. */
  ensureReady(
    model: string,
    onProgress?: (p: AIProgress) => void,
    signal?: AbortSignal,
  ): Promise<void>;

  /** Free-form text generation (optionally streaming). */
  generate(req: AIGenerateRequest): Promise<AIResult>;

  /** Schema-validated structured generation. Throws on irrecoverable output. */
  generateStructured<T>(req: AIGenerateRequest, schema: ZodType<T>): Promise<T>;

  /** Release weights / free memory. Best effort. */
  unload?(): Promise<void>;
}

export class AIProviderError extends Error {
  constructor(
    message: string,
    readonly provider: ProviderId,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}

export class AIUnavailableError extends AIProviderError {
  constructor(provider: ProviderId, detail?: string) {
    super(`AI provider "${provider}" is not available${detail ? `: ${detail}` : ""}.`, provider);
    this.name = "AIUnavailableError";
  }
}
