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
 * - lifecycle helpers (dispose/preload) are null-safe no-ops, and read helpers
 *   return safe empty defaults, so cleanup paths never need guards.
 */

export type ChatSessionRole = "user" | "assistant" | "tool";

export interface ChatToolEvent {
  name: string;
  params: unknown;
  resultSummary: string;
  durationMs: number;
}

export interface ChatPromptResult {
  text: string;
  toolEvents: ChatToolEvent[];
}

export interface OpenChatSessionInput {
  conversationId: string;
  modelFile?: string;
  systemPrompt?: string;
  history?: Array<{ role: ChatSessionRole; content: string }>;
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

type ChatSessionWindow = Window & { electronChatSession?: ElectronChatSessionBridge };

function bridge(): ElectronChatSessionBridge | null {
  if (typeof window === "undefined") return null;
  return (window as ChatSessionWindow).electronChatSession ?? null;
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
  return api.open(input);
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
    return await api.prompt({ conversationId: input.conversationId, text: input.text, requestId });
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
