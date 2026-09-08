"use client";

/**
 * Renderer-safe client for the Moudir chat-session bridge — the live
 * per-conversation LlamaChatSession runtime in the Electron main process.
 * Talks to `window.electronChatSession` (electron/preload.ts, backed by
 * electron/chat-session-service.ts).
 *
 * Contract (deliberately asymmetric, unlike chat-history-client.ts):
 * - `sendChatPrompt` THROWS a clear error when the bridge is absent — the UI
 *   must know chat is desktop-only and say so, not silently do nothing.
 * - When the IPC rejects because no offline model is loaded / downloadable
 *   (matches: `Missing GGUF model…`, `no offline model is ready…`,
 *   `AI provider "…" is not available…`), both `openChatSession` and
 *   `sendChatPrompt` throw a `ChatModelUnavailableError` so the UI can
 *   surface the existing global `ModelRequiredDialog` instead of a raw
 *   stack-trace bubble. The `chat:open` channel can reject before
 *   `chat:prompt` is even reached, so both need the same translation.
 *   AbortError is preserved as-is.
 * - lifecycle helpers (dispose/preload) are null-safe no-ops, and read helpers
 *   return safe empty defaults, so cleanup paths never need guards.
 */

export type ChatSessionRole = "user" | "assistant" | "tool";

/**
 * Thrown by `openChatSession` and `sendChatPrompt` when the underlying runtime
 * rejects because no usable local model is ready (no GGUF staged, or the
 * configured provider is offline-only and nothing is loaded). Distinct from a
 * transport-level rejection so the UI can route to the model-download dialog
 * rather than the generic error surface.
 */
export class ChatModelUnavailableError extends Error {
  readonly code = "E_MODEL_UNAVAILABLE" as const;
  constructor(message: string) {
    super(message);
    this.name = "ChatModelUnavailableError";
  }
}

/** Patterns the IPC layer uses to say "no local model is ready". */
const MODEL_UNAVAILABLE_PATTERNS: readonly RegExp[] = [
  /Missing GGUF model/i,
  /no offline model is ready/i,
  /AI provider "[^"]+" is not available/i,
];

function isModelUnavailableMessage(message: string): boolean {
  for (const pattern of MODEL_UNAVAILABLE_PATTERNS) {
    if (pattern.test(message)) return true;
  }
  return false;
}

async function callIpc<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof Error && isModelUnavailableMessage(error.message)) {
      throw new ChatModelUnavailableError(error.message);
    }
    throw error;
  }
}

export interface ChatToolEvent {
  name: string;
  params: unknown;
  resultSummary: string;
  durationMs: number;
  failed?: boolean;
  /** Mirrors electron/chat-session-service.ts: start events carry no result yet. */
  started?: boolean;
}

export interface ChatPromptResult {
  text: string;
  toolEvents: ChatToolEvent[];
}

export interface OpenChatSessionInput {
  conversationId: string;
  modelFile?: string;
  systemPrompt?: string;
  history?: Array<{ role: ChatSessionRole; content: string; parts?: unknown }>;
}

interface ElectronChatSessionBridge {
  open(input: OpenChatSessionInput): Promise<{ model: string; reused: boolean }>;
  prompt(input: {
    conversationId: string;
    text: string;
    requestId?: string;
  }): Promise<ChatPromptResult>;
  abort(requestId: string): Promise<boolean>;
  preload(input: { conversationId: string; text: string }): Promise<void>;
  history(conversationId: string): Promise<unknown[]>;
  title(conversationId: string): Promise<string>;
  followUps(conversationId: string): Promise<string[]>;
  dispose(conversationId: string): Promise<boolean>;
  onToken(requestId: string, callback: (chunk: string) => void): () => void;
  onTool(requestId: string, callback: (event: ChatToolEvent) => void): () => void;
}


function bridge(): ElectronChatSessionBridge | null {
  if (typeof window === "undefined") return null;
  return window.electronChatSession ?? null;
}

/** True when the live chat runtime is reachable (renderer inside Electron). */
export function canUseChatSession(): boolean {
  return bridge() !== null;
}

function newRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function abortError(): Error {
  const error = new Error("Chat prompt aborted");
  error.name = "AbortError";
  return error;
}

/** Open (or rehydrate) a conversation's live session. Null when bridge absent. */
export async function openChatSession(
  input: OpenChatSessionInput,
): Promise<{ model: string; reused: boolean } | null> {
  const api = bridge();
  if (!api) return null;
  return callIpc(() => api.open(input));
}

/**
 * One chat turn with live token + tool streaming and abort support. Generates
 * the requestId, wires the subscriptions, and tears everything down when the
 * prompt settles. Throws when the Electron bridge is absent — Moudir chat only
 * exists in the desktop app.
 */
export async function sendChatPrompt(input: {
  conversationId: string;
  text: string;
  onToken?: (chunk: string) => void;
  onTool?: (event: ChatToolEvent) => void;
  signal?: AbortSignal;
}): Promise<ChatPromptResult> {
  const api = bridge();
  if (!api) {
    throw new Error(
      "Le chat Moudir nécessite l'application de bureau — le pont Electron (electronChatSession) est absent.",
    );
  }
  if (input.signal?.aborted) throw abortError();

  const requestId = newRequestId();
  const unsubscribers: Array<() => void> = [];
  if (input.onToken) unsubscribers.push(api.onToken(requestId, input.onToken));
  if (input.onTool) unsubscribers.push(api.onTool(requestId, input.onTool));

  const onAbort = (): void => {
    void api.abort(requestId);
  };
  input.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    return await callIpc(() =>
      api.prompt({ conversationId: input.conversationId, text: input.text, requestId }),
    );
  } finally {
    input.signal?.removeEventListener("abort", onAbort);
    for (const unsubscribe of unsubscribers) unsubscribe();
  }
}

/** Pre-evaluate a drafted prompt into the session's KV cache. No-op sans bridge. */
export async function preloadChatPrompt(conversationId: string, text: string): Promise<void> {
  await bridge()?.preload({ conversationId, text });
}

/** Model-side history snapshot (ChatHistoryItem[]). Empty when bridge absent. */
export async function getChatSessionHistory(conversationId: string): Promise<unknown[]> {
  const api = bridge();
  if (!api) return [];
  return api.history(conversationId);
}

/** Auto-title side-call. Null when bridge absent. */
export async function generateChatTitle(conversationId: string): Promise<string | null> {
  const api = bridge();
  if (!api) return null;
  return api.title(conversationId);
}

/** Suggested follow-up questions side-call. Empty when bridge absent. */
export async function suggestChatFollowUps(conversationId: string): Promise<string[]> {
  const api = bridge();
  if (!api) return [];
  return api.followUps(conversationId);
}

/** Dispose the conversation's live session. No-op sans bridge. */
export async function disposeChatSession(conversationId: string): Promise<void> {
  await bridge()?.dispose(conversationId);
}
