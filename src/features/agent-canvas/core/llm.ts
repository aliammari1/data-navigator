"use client";

/**
 * LLM Engine — DEBUG BUILD
 *
 * Search console for: [LLM]
 *
 * This file is intentionally noisy so you can see where the first agent stops.
 */

import {
  type DataType,
  type DeviceType,
  env,
  type Message,
  type ProgressCallback,
  pipeline,
  type TextGenerationPipeline,
  TextStreamer,
} from "@huggingface/transformers";
import type { z } from "zod";

type PipelineOptions = NonNullable<Parameters<typeof pipeline>[2]>;

type PipelineDevice = NonNullable<DeviceType>;
type DevicePreference = PipelineDevice | "auto";

type PipelineDType = NonNullable<DataType>;

type TextGenerationCallOptions = NonNullable<
  Parameters<TextGenerationPipeline>[1]
>;

type TextGenerationResult = Awaited<ReturnType<TextGenerationPipeline>>;
type GeneratedText = string | Message[];

type ProgressInfo = Parameters<ProgressCallback>[0];

const DEFAULT_DTYPE = "q4" satisfies PipelineDType;

export type LoadProgressCB = (progress: number, text: string) => void;

export interface LoadLLMOptions {
  modelId: string;
  dtype?: PipelineDType;
  preferredDevice?: DevicePreference;
  allowRemoteModels?: boolean;
  useBrowserCache?: boolean;
  onProgress?: LoadProgressCB;
  signal?: AbortSignal;

  /**
   * Debug controls.
   */
  debug?: boolean;
  traceId?: string;
}

export interface ChatOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  repetitionPenalty?: number;
  onToken?: (token: string) => void;
  signal?: AbortSignal;

  /**
   * Add this from your agent pipeline:
   * chat(..., { agentName: "schema-agent" })
   */
  agentName?: string;

  /**
   * Useful when multiple agents run in sequence.
   */
  traceId?: string;

  /**
   * Logs complete system/user/message text.
   * By default only previews are logged.
   */
  logFullPrompt?: boolean;

  /**
   * Logs every streamed token.
   * Very noisy.
   */
  logTokens?: boolean;

  /**
   * Force logs for this call.
   */
  debug?: boolean;

  /**
   * Debug safety net.
   * If generation never resolves, throw instead of silently freezing the pipeline.
   */
  inferenceTimeoutMs?: number;

  /**
   * Logs every N ms while the model is still generating.
   */
  heartbeatMs?: number;
}

export interface LLMStatus {
  loaded: boolean;
  loading: boolean;
  modelId: string | null;
  device: PipelineDevice | null;
}

let _pipe: TextGenerationPipeline | null = null;
let _modelId: string | null = null;
let _device: PipelineDevice | null = null;
let _loadPromise: Promise<void> | null = null;
let _debug = true;
let _sequence = 0;

// ─────────────────────────────────────────────────────────────────────────────
// Debug logger
// ─────────────────────────────────────────────────────────────────────────────

function nextId(prefix: string) {
  _sequence += 1;
  return `${prefix}-${Date.now()}-${_sequence}`;
}

function isDebugEnabled(localDebug?: boolean) {
  if (typeof localDebug === "boolean") return localDebug;
  return _debug;
}

export function setLLMDebug(enabled: boolean) {
  _debug = enabled;
  console.log(`[LLM] debug ${enabled ? "enabled" : "disabled"}`);
}

export function enableLLMDebug() {
  setLLMDebug(true);
}

export function disableLLMDebug() {
  setLLMDebug(false);
}

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function safeStringify(value: unknown, maxLength = 3000): string {
  try {
    const seen = new WeakSet<object>();

    const text = JSON.stringify(
      value,
      (_key, currentValue) => {
        if (typeof currentValue === "bigint") return String(currentValue);

        if (
          typeof currentValue === "function" ||
          typeof currentValue === "symbol"
        ) {
          return String(currentValue);
        }

        if (
          currentValue &&
          typeof currentValue === "object" &&
          currentValue instanceof Error
        ) {
          return {
            name: currentValue.name,
            message: currentValue.message,
            stack: currentValue.stack,
          };
        }

        if (currentValue && typeof currentValue === "object") {
          if (seen.has(currentValue)) return "[Circular]";
          seen.add(currentValue);
        }

        return currentValue;
      },
      2,
    );

    if (!text) return String(value);

    return text.length > maxLength
      ? `${text.slice(0, maxLength)}\n... [truncated ${
          text.length - maxLength
        } chars]`
      : text;
  } catch {
    return String(value);
  }
}

function preview(text: string, maxLength = 700) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > maxLength
    ? `${clean.slice(0, maxLength)}... [truncated ${
        clean.length - maxLength
      } chars]`
    : clean;
}

function log(
  event: string,
  data?: unknown,
  opts: {
    traceId?: string;
    debug?: boolean;
    level?: "log" | "warn" | "error";
  } = {},
) {
  if (!isDebugEnabled(opts.debug)) return;

  const level = opts.level ?? "log";
  const trace = opts.traceId ? ` trace=${opts.traceId}` : "";
  const prefix = `[LLM]${trace} ${event}`;

  if (typeof data === "undefined") {
    console[level](prefix);
    return;
  }

  console[level](prefix, data);
}

function logGroup(
  title: string,
  data?: unknown,
  opts: {
    traceId?: string;
    debug?: boolean;
    collapsed?: boolean;
  } = {},
) {
  if (!isDebugEnabled(opts.debug)) return;

  const trace = opts.traceId ? ` trace=${opts.traceId}` : "";
  const heading = `[LLM]${trace} ${title}`;

  if (opts.collapsed === false) {
    console.group(heading);
  } else {
    console.groupCollapsed(heading);
  }

  if (typeof data !== "undefined") {
    console.log(data);
  }

  console.groupEnd();
}

async function span<T>(
  event: string,
  fn: () => Promise<T>,
  opts: {
    traceId?: string;
    debug?: boolean;
    data?: unknown;
  } = {},
): Promise<T> {
  const start = now();

  log(`▶ ${event}:start`, opts.data, {
    traceId: opts.traceId,
    debug: opts.debug,
  });

  try {
    const result = await fn();

    log(
      `✓ ${event}:success`,
      {
        durationMs: Math.round(now() - start),
      },
      {
        traceId: opts.traceId,
        debug: opts.debug,
      },
    );

    return result;
  } catch (error) {
    log(
      `✕ ${event}:error`,
      {
        durationMs: Math.round(now() - start),
        error,
      },
      {
        traceId: opts.traceId,
        debug: opts.debug,
        level: "error",
      },
    );

    console.error(`[LLM] trace=${opts.traceId ?? "unknown"} stack`, error);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Guards
// ─────────────────────────────────────────────────────────────────────────────

function assertBrowser(traceId?: string, debug?: boolean) {
  log(
    "assertBrowser",
    {
      hasWindow: typeof window !== "undefined",
      hasNavigator: typeof navigator !== "undefined",
      userAgent:
        typeof navigator !== "undefined" ? navigator.userAgent : "no navigator",
    },
    { traceId, debug },
  );

  if (typeof window === "undefined") {
    throw new Error("LLM engine can only run in the browser.");
  }
}

function throwIfAborted(
  signal?: AbortSignal,
  traceId?: string,
  debug?: boolean,
) {
  if (signal?.aborted) {
    log("abort detected", undefined, { traceId, debug, level: "warn" });
    throw new DOMException("Operation aborted", "AbortError");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Device detection
// ─────────────────────────────────────────────────────────────────────────────

async function detectDevice(
  preferredDevice: DevicePreference,
  traceId?: string,
  debug?: boolean,
): Promise<PipelineDevice> {
  return span(
    "detectDevice",
    async () => {
      log("detectDevice input", { preferredDevice }, { traceId, debug });

      if (preferredDevice === "wasm") {
        log("detectDevice forced WASM", undefined, { traceId, debug });
        return "wasm";
      }

      const hasNavigator = typeof navigator !== "undefined";
      const hasGPU = hasNavigator && "gpu" in navigator;

      log("WebGPU feature check", { hasNavigator, hasGPU }, { traceId, debug });

      if (hasGPU) {
        try {
          const gpu = (
            navigator as Navigator & {
              gpu?: { requestAdapter: () => Promise<unknown> };
            }
          ).gpu;

          log("requesting WebGPU adapter", undefined, { traceId, debug });

          const adapter = await gpu?.requestAdapter();

          log(
            "WebGPU adapter result",
            {
              adapterFound: Boolean(adapter),
              adapterType: adapter ? typeof adapter : null,
            },
            { traceId, debug },
          );

          if (adapter) return "webgpu";
        } catch (error) {
          log(
            "WebGPU adapter request failed",
            { error },
            {
              traceId,
              debug,
              level: "warn",
            },
          );
        }
      }

      if (preferredDevice === "webgpu") {
        throw new Error(
          "WebGPU was requested, but no WebGPU adapter is available.",
        );
      }

      log("falling back to WASM", undefined, { traceId, debug });
      return "wasm";
    },
    { traceId, debug, data: { preferredDevice } },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Progress / output helpers
// ─────────────────────────────────────────────────────────────────────────────

function normalizeProgress(info: ProgressInfo): {
  progress: number;
  text: string;
} {
  const rawProgress =
    "progress" in info && typeof info.progress === "number" ? info.progress : 0;

  const progress = Math.max(0.02, Math.min(0.99, rawProgress / 100));

  const file =
    "file" in info && typeof info.file === "string" ? info.file : null;

  const status =
    "status" in info && typeof info.status === "string" ? info.status : null;

  return {
    progress,
    text: file
      ? `Downloading ${file} (${Math.round(progress * 100)}%)`
      : status || "Loading model…",
  };
}
function hasGeneratedText(
  value: unknown,
): value is { generated_text: string | Message[] } {
  return (
    typeof value === "object" && value !== null && "generated_text" in value
  );
}

function isMessage(value: unknown): value is Message {
  return (
    typeof value === "object" &&
    value !== null &&
    "role" in value &&
    "content" in value
  );
}

function isMessageArray(value: unknown): value is Message[] {
  return Array.isArray(value) && value.every(isMessage);
}

function extractGeneratedText(
  result: TextGenerationResult,
  traceId?: string,
  debug?: boolean,
): GeneratedText | undefined {
  log(
    "extractGeneratedText input",
    {
      resultType: typeof result,
      isArray: Array.isArray(result),
      resultPreview: safeStringify(result, 2500),
    },
    { traceId, debug },
  );

  if (hasGeneratedText(result)) {
    return result.generated_text;
  }

  if (typeof result === "string") {
    return result;
  }

  if (isMessageArray(result)) {
    return result;
  }

  if (Array.isArray(result)) {
    for (const item of result) {
      if (hasGeneratedText(item)) {
        return item.generated_text;
      }

      if (typeof item === "string") {
        return item;
      }

      if (isMessageArray(item)) {
        return item;
      }
    }
  }

  log(
    "extractGeneratedText could not find generated_text",
    { result },
    { traceId, debug, level: "warn" },
  );

  return undefined;
}

function getAssistantText(
  generatedText: GeneratedText | undefined,
  traceId?: string,
  debug?: boolean,
): string {
  log(
    "getAssistantText input shape",
    {
      exists: Boolean(generatedText),
      type: typeof generatedText,
      isArray: Array.isArray(generatedText),
    },
    { traceId, debug },
  );

  if (!generatedText) {
    log("getAssistantText empty output", undefined, {
      traceId,
      debug,
      level: "warn",
    });
    return "";
  }

  if (typeof generatedText === "string") {
    log(
      "getAssistantText string output preview",
      {
        length: generatedText.length,
        preview: preview(generatedText),
      },
      { traceId, debug },
    );

    return generatedText.trim();
  }

  log(
    "getAssistantText message output",
    {
      turns: generatedText.map((msg, index) => ({
        index,
        role: msg.role,
        contentLength: typeof msg.content === "string" ? msg.content.length : 0,
        preview:
          typeof msg.content === "string" ? preview(msg.content, 250) : "",
      })),
    },
    { traceId, debug },
  );

  for (let i = generatedText.length - 1; i >= 0; i--) {
    const message = generatedText[i];

    if (message.role === "assistant" && typeof message.content === "string") {
      return message.content.trim();
    }
  }

  const last = generatedText.at(-1);

  return typeof last?.content === "string" ? last.content.trim() : "";
}

async function createStreamer(
  pipe: TextGenerationPipeline,
  onToken: ((token: string) => void) | undefined,
  opts: {
    traceId?: string;
    debug?: boolean;
    logTokens?: boolean;
  } = {},
): Promise<InstanceType<typeof TextStreamer> | undefined> {
  return span(
    "createStreamer",
    async () => {
      log(
        "streamer requested",
        {
          hasOnToken: Boolean(onToken),
          hasTokenizer: Boolean(pipe.tokenizer),
        },
        opts,
      );

      if (!onToken || !pipe.tokenizer) return undefined;

      return new TextStreamer(pipe.tokenizer, {
        skip_prompt: true,
        callback_function: (text: string) => {
          if (opts.logTokens) {
            log("stream token", { token: text }, opts);
          }

          if (text) onToken(text);
        },
      });
    },
    opts,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Load
// ─────────────────────────────────────────────────────────────────────────────

export async function loadLLM(options: LoadLLMOptions): Promise<void> {
  const traceId = options.traceId ?? nextId("load");
  const debug = options.debug;

  return span(
    "loadLLM",
    async () => {
      assertBrowser(traceId, debug);

      const {
        modelId,
        dtype = DEFAULT_DTYPE,
        preferredDevice = "auto",
        allowRemoteModels = true,
        useBrowserCache = true,
        onProgress,
        signal,
      } = options;

      log(
        "loadLLM received options",
        {
          modelId,
          dtype,
          preferredDevice,
          allowRemoteModels,
          useBrowserCache,
          alreadyLoadedModelId: _modelId,
          hasPipe: Boolean(_pipe),
          hasExistingLoadPromise: Boolean(_loadPromise),
        },
        { traceId, debug },
      );

      throwIfAborted(signal, traceId, debug);

      if (_pipe && _modelId === modelId) {
        log(
          "loadLLM skipped: model already loaded",
          {
            modelId,
            device: _device,
          },
          { traceId, debug },
        );

        return;
      }

      if (_loadPromise) {
        log("loadLLM waiting for existing load promise", undefined, {
          traceId,
          debug,
          level: "warn",
        });

        return _loadPromise;
      }

      _loadPromise = span(
        "loadLLM.inner",
        async () => {
          log("setting transformers env", undefined, {
            traceId,
            debug,
          });

          throwIfAborted(signal, traceId, debug);

          log(
            "setting transformers env values",
            {
              allowRemoteModels,
              useBrowserCache,
              previousAllowRemoteModels: env.allowRemoteModels,
              previousUseBrowserCache: env.useBrowserCache,
            },
            { traceId, debug },
          );

          env.allowRemoteModels = allowRemoteModels;
          env.useBrowserCache = useBrowserCache;

          const selectedDevice = await detectDevice(
            preferredDevice,
            traceId,
            debug,
          );

          throwIfAborted(signal, traceId, debug);

          onProgress?.(
            0.02,
            `Initializing ${selectedDevice.toUpperCase()} backend…`,
          );

          log(
            "selected backend",
            {
              selectedDevice,
              dtype,
              modelId,
            },
            { traceId, debug },
          );

          if (_pipe?.dispose && _modelId !== modelId) {
            await span(
              "dispose previous model before load",
              async () => {
                await _pipe?.dispose?.();
                _pipe = null;
                _modelId = null;
                _device = null;
              },
              {
                traceId,
                debug,
                data: { previousModelId: _modelId, previousDevice: _device },
              },
            );
          }

          const pipelineOptions = {
            device: selectedDevice,
            dtype,
            progress_callback: (info: ProgressInfo) => {
              const normalized = normalizeProgress(info);

              log(
                "pipeline progress_callback",
                {
                  raw: info,
                  normalized,
                },
                { traceId, debug },
              );

              onProgress?.(normalized.progress, normalized.text);
            },
          } satisfies PipelineOptions;

          logGroup("pipeline options", pipelineOptions, {
            traceId,
            debug,
          });

          const loaded = await span(
            "pipeline(text-generation)",
            async () => {
              return pipeline("text-generation", modelId, pipelineOptions);
            },
            {
              traceId,
              debug,
              data: {
                task: "text-generation",
                modelId,
                device: selectedDevice,
                dtype,
              },
            },
          );

          throwIfAborted(signal, traceId, debug);

          _pipe = loaded as TextGenerationPipeline;
          _modelId = modelId;
          _device = selectedDevice;

          log(
            "pipeline loaded and assigned",
            {
              modelId: _modelId,
              device: _device,
              hasTokenizer: Boolean(_pipe.tokenizer),
              hasDispose: Boolean(_pipe.dispose),
              pipeType: typeof _pipe,
            },
            { traceId, debug },
          );

          onProgress?.(
            1,
            `${modelId} ready on ${selectedDevice.toUpperCase()}`,
          );
        },
        { traceId, debug },
      ).finally(() => {
        log("load promise cleanup", undefined, { traceId, debug });
        _loadPromise = null;
      });

      return _loadPromise;
    },
    { traceId, debug, data: options },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat
// ─────────────────────────────────────────────────────────────────────────────

export async function chat(
  system: string,
  user: string,
  opts: ChatOptions = {},
): Promise<string> {
  const traceId = opts.traceId ?? nextId("chat");
  const debug = opts.debug;
  const agentName = opts.agentName ?? "unknown-agent";

  log(
    "chat(system,user) called",
    {
      agentName,
      systemLength: system.length,
      userLength: user.length,
      systemPreview: preview(system),
      userPreview: preview(user),
    },
    { traceId, debug },
  );

  if (opts.logFullPrompt) {
    logGroup("FULL system prompt", system, { traceId, debug });
    logGroup("FULL user prompt", user, { traceId, debug });
  }

  const messages = [
    { role: "system", content: system },
    { role: "user", content: user },
  ] satisfies Message[];

  return chatMessages(messages, {
    ...opts,
    traceId,
    agentName,
  });
}

export async function chatMessages(
  messages: Message[],
  opts: ChatOptions = {},
): Promise<string> {
  const traceId = opts.traceId ?? nextId("chat-messages");
  const debug = opts.debug;
  const agentName = opts.agentName ?? "unknown-agent";

  return span(
    `chatMessages agent=${agentName}`,
    async () => {
      log(
        "chatMessages initial status",
        {
          agentName,
          status: getLLMStatus(),
          messageCount: messages.length,
          options: {
            maxTokens: opts.maxTokens,
            temperature: opts.temperature,
            topP: opts.topP,
            repetitionPenalty: opts.repetitionPenalty,
            hasOnToken: Boolean(opts.onToken),
            hasSignal: Boolean(opts.signal),
            logFullPrompt: opts.logFullPrompt,
            logTokens: opts.logTokens,
            inferenceTimeoutMs: opts.inferenceTimeoutMs,
            heartbeatMs: opts.heartbeatMs,
          },
        },
        { traceId, debug },
      );

      if (!_pipe) {
        log(
          "chatMessages failed: no loaded pipe",
          {
            status: getLLMStatus(),
          },
          {
            traceId,
            debug,
            level: "error",
          },
        );

        throw new Error("LLM not loaded — call loadLLM() first.");
      }

      throwIfAborted(opts.signal, traceId, debug);

      const messageSummary = messages.map((message, index) => ({
        index,
        role: message.role,
        contentLength:
          typeof message.content === "string" ? message.content.length : 0,
        preview:
          typeof message.content === "string" ? preview(message.content) : "",
      }));

      logGroup("message summary", messageSummary, { traceId, debug });

      if (opts.logFullPrompt) {
        logGroup("FULL messages", messages, {
          traceId,
          debug,
          collapsed: false,
        });
      }

      const temperature = opts.temperature ?? 0;

      const generationOptions = {
        max_new_tokens: opts.maxTokens ?? 160,
        do_sample: temperature > 0,
        return_full_text: false,
        repetition_penalty: opts.repetitionPenalty ?? 1.05,
        ...(temperature > 0
          ? {
              temperature,
              top_p: opts.topP ?? 0.9,
            }
          : {}),
      } satisfies TextGenerationCallOptions;

      log("generation options before streamer", generationOptions, {
        traceId,
        debug,
      });

      const streamer = await createStreamer(_pipe, opts.onToken, {
        traceId,
        debug,
        logTokens: opts.logTokens,
      });

      const finalGenerationOptions = {
        ...generationOptions,
        ...(streamer ? { streamer } : {}),
      } satisfies TextGenerationCallOptions;

      log(
        "generation options final",
        {
          ...finalGenerationOptions,
          streamer: streamer ? "[TextStreamer]" : undefined,
        },
        { traceId, debug },
      );

      throwIfAborted(opts.signal, traceId, debug);

      const result = await span(
        `pipe inference agent=${agentName}`,
        async () => {
          const timeoutMs = opts.inferenceTimeoutMs ?? 60_000;
          const heartbeatMs = opts.heartbeatMs ?? 5_000;
          const startedAt = now();

          let heartbeatCount = 0;

          const heartbeat = window.setInterval(() => {
            heartbeatCount += 1;

            log(
              `pipe inference heartbeat agent=${agentName}`,
              {
                agentName,
                modelId: _modelId,
                device: _device,
                elapsedMs: Math.round(now() - startedAt),
                heartbeatCount,
                messageCount: messages.length,
                maxNewTokens: finalGenerationOptions.max_new_tokens,
                temperature:
                  "temperature" in finalGenerationOptions
                    ? finalGenerationOptions.temperature
                    : undefined,
                doSample: finalGenerationOptions.do_sample,
                note:
                  heartbeatCount === 1
                    ? "Still waiting for first/next token. First WebGPU run can compile shaders."
                    : "Still inside Transformers.js pipeline call.",
              },
              { traceId, debug, level: "warn" },
            );
          }, heartbeatMs);

          try {
            const inferencePromise = _pipe!(messages, finalGenerationOptions);

            const timeoutPromise = new Promise<never>((_, reject) => {
              window.setTimeout(() => {
                reject(
                  new Error(
                    `LLM inference timed out after ${timeoutMs}ms. ` +
                      `agent=${agentName}, model=${_modelId}, device=${_device}, ` +
                      `max_new_tokens=${String(
                        finalGenerationOptions.max_new_tokens,
                      )}. ` +
                      `Try maxTokens=80, temperature=0, or preferredDevice="wasm".`,
                  ),
                );
              }, timeoutMs);
            });

            return await Promise.race([inferencePromise, timeoutPromise]);
          } finally {
            window.clearInterval(heartbeat);
          }
        },
        {
          traceId,
          debug,
          data: {
            agentName,
            modelId: _modelId,
            device: _device,
            messageCount: messages.length,
            generationOptions: {
              ...finalGenerationOptions,
              streamer: streamer ? "[TextStreamer]" : undefined,
            },
          },
        },
      );

      throwIfAborted(opts.signal, traceId, debug);

      logGroup("raw pipeline result", safeStringify(result, 5000), {
        traceId,
        debug,
      });

      const generatedText = extractGeneratedText(result, traceId, debug);

      const output = getAssistantText(generatedText, traceId, debug);

      log(
        "final assistant output",
        {
          agentName,
          outputLength: output.length,
          outputPreview: preview(output, 1200),
        },
        { traceId, debug },
      );

      if (!output) {
        log(
          "empty assistant output",
          {
            agentName,
            rawResult: result,
          },
          {
            traceId,
            debug,
            level: "warn",
          },
        );
      }

      return output;
    },
    {
      traceId,
      debug,
      data: {
        agentName,
        messageCount: messages.length,
      },
    },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent helper for your pipeline
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Use this around every agent step.
 *
 * Example:
 *
 * const schema = await debugAgentStep("schema-agent", async () => {
 *   return chat(system, user, { agentName: "schema-agent", traceId });
 * }, { traceId, input: { columns } });
 */
export async function debugAgentStep<T>(
  agentName: string,
  fn: () => Promise<T>,
  opts: {
    traceId?: string;
    input?: unknown;
    debug?: boolean;
  } = {},
): Promise<T> {
  const traceId = opts.traceId ?? nextId("agent");

  return span(
    `AGENT ${agentName}`,
    async () => {
      logGroup(`AGENT ${agentName} input`, opts.input, {
        traceId,
        debug: opts.debug,
        collapsed: false,
      });

      const result = await fn();

      logGroup(`AGENT ${agentName} output`, result, {
        traceId,
        debug: opts.debug,
        collapsed: false,
      });

      return result;
    },
    {
      traceId,
      debug: opts.debug,
      data: {
        agentName,
      },
    },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Unload / status
// ─────────────────────────────────────────────────────────────────────────────

export async function unloadLLM(traceId = nextId("unload")): Promise<void> {
  return span(
    "unloadLLM",
    async () => {
      log("unloadLLM current status", getLLMStatus(), { traceId });

      if (_pipe?.dispose) {
        await _pipe.dispose();
      }

      _pipe = null;
      _modelId = null;
      _device = null;
      _loadPromise = null;

      log("unloadLLM complete", getLLMStatus(), { traceId });
    },
    { traceId },
  );
}

export function getLLMStatus(): LLMStatus {
  return {
    loaded: _pipe !== null,
    loading: _loadPromise !== null,
    modelId: _modelId,
    device: _device,
  };
}

export const isLoaded = () => _pipe !== null;
export const modelId = () => _modelId;
export const currentDevice = () => _device;

// ─────────────────────────────────────────────────────────────────────────────
// JSON parsing with heavy logs
// ─────────────────────────────────────────────────────────────────────────────

export function parseJSON<T>(
  raw: string,
  opts: {
    traceId?: string;
    label?: string;
    debug?: boolean;
  } = {},
): T {
  const traceId = opts.traceId ?? nextId("json");
  const label = opts.label ?? "unknown-json";

  log(
    "parseJSON:start",
    {
      label,
      rawLength: raw.length,
      rawPreview: preview(raw, 1500),
    },
    {
      traceId,
      debug: opts.debug,
    },
  );

  const s = raw.trim();

  const candidates = [
    {
      name: "direct",
      value: s,
    },
    {
      name: "markdown-fence",
      value: stripMarkdownFence(s),
    },
    {
      name: "balanced-object",
      value: extractBalancedBlock(s, "{", "}"),
    },
    {
      name: "balanced-array",
      value: extractBalancedBlock(s, "[", "]"),
    },
  ].filter((candidate): candidate is { name: string; value: string } =>
    Boolean(candidate.value),
  );

  log(
    "parseJSON candidates",
    {
      label,
      candidateNames: candidates.map((candidate) => candidate.name),
      count: candidates.length,
    },
    {
      traceId,
      debug: opts.debug,
    },
  );

  for (const candidate of candidates) {
    try {
      log(
        "parseJSON trying candidate",
        {
          label,
          candidate: candidate.name,
          length: candidate.value.length,
          preview: preview(candidate.value, 1000),
        },
        {
          traceId,
          debug: opts.debug,
        },
      );

      const parsed = JSON.parse(candidate.value) as T;

      log(
        "parseJSON success",
        {
          label,
          candidate: candidate.name,
        },
        {
          traceId,
          debug: opts.debug,
        },
      );

      return parsed;
    } catch (error) {
      log(
        "parseJSON candidate failed",
        {
          label,
          candidate: candidate.name,
          error,
        },
        {
          traceId,
          debug: opts.debug,
          level: "warn",
        },
      );
    }
  }

  log(
    "parseJSON failed completely",
    {
      label,
      rawPreview: s.slice(0, 2000),
    },
    {
      traceId,
      debug: opts.debug,
      level: "error",
    },
  );

  throw new Error(`Cannot parse JSON from LLM output:\n${s.slice(0, 600)}`);
}

export function parseJSONWithSchema<TSchema extends z.ZodType>(
  raw: string,
  schema: TSchema,
  opts: {
    traceId?: string;
    label?: string;
    debug?: boolean;
  } = {},
): z.infer<TSchema> {
  const traceId = opts.traceId ?? nextId("schema-json");
  const label = opts.label ?? "schema-json";

  return span(
    `parseJSONWithSchema ${label}`,
    async () => {
      const parsed = parseJSON<unknown>(raw, {
        traceId,
        label,
        debug: opts.debug,
      });

      log("zod schema parse input", parsed, {
        traceId,
        debug: opts.debug,
      });

      const validated = schema.parse(parsed);

      log("zod schema parse success", validated, {
        traceId,
        debug: opts.debug,
      });

      return validated;
    },
    {
      traceId,
      debug: opts.debug,
    },
  ) as unknown as z.infer<TSchema>;
}

function stripMarkdownFence(input: string): string | null {
  const match = input.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return match?.[1]?.trim() ?? null;
}

function extractBalancedBlock(
  input: string,
  open: "{" | "[",
  close: "}" | "]",
): string | null {
  const start = input.indexOf(open);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < input.length; i++) {
    const char = input[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === open) depth++;
    if (char === close) depth--;

    if (depth === 0) {
      return input.slice(start, i + 1);
    }
  }

  return null;
}
