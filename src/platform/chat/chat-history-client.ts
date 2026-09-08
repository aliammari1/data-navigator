"use client";

/**
 * Renderer-safe client for the Moudir chat-history bridge — the SQLite
 * (main-process, chat.db) backend for the assistant's persistent
 * conversations. Talks to `window.electronChatHistory` (electron/preload.ts,
 * backed by electron/chat-store.ts).
 *
 * Same null-safe contract as analytics-snapshot-client.ts: every function
 * no-ops / returns a safe empty default when the bridge is unavailable (SSR,
 * `next build`, unit tests, plain browser tab) so callers never guard.
 */

export type ChatRole = "user" | "assistant" | "tool";

export interface ConversationMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  datasetId: string | null;
  model: string | null;
  messageCount: number;
}

export interface ChatMessageRow {
  id: number;
  conversationId: string;
  role: ChatRole;
  content: string;
  parts: unknown;
  createdAt: number;
}

export interface ChatSearchHit {
  messageId: number;
  conversationId: string;
  role: string;
  snippet: string;
  source: "fts" | "semantic";
}

export interface ChatEmbeddingBackfillResult {
  indexed: number;
  skipped: number;
  failed: number;
}

interface ElectronChatHistoryBridge {
  create(input: {
    id: string;
    title: string;
    datasetId?: string | null;
    model?: string | null;
  }): Promise<ConversationMeta>;
  list(input?: { limit?: number; search?: string }): Promise<ConversationMeta[]>;
  rename(id: string, title: string): Promise<void>;
  pin(id: string, pinned: boolean): Promise<void>;
  setModel(id: string, model: string | null): Promise<void>;
  delete(id: string): Promise<void>;
  appendMessage(input: {
    conversationId: string;
    role: ChatRole;
    content: string;
    parts?: unknown;
  }): Promise<ChatMessageRow>;
  messages(conversationId: string, limit?: number): Promise<ChatMessageRow[]>;
  searchMessages(input: {
    query: string;
    limit?: number;
    conversationId?: string;
  }): Promise<ChatSearchHit[]>;
  backfillEmbeddings(): Promise<ChatEmbeddingBackfillResult>;
}

function bridge(): ElectronChatHistoryBridge | null {
  if (typeof window === "undefined") return null;
  return window.electronChatHistory ?? null;
}

/** True when conversations can persist (renderer running inside Electron). */
export function canPersistConversations(): boolean {
  return bridge() !== null;
}

export async function createConversationRemote(input: {
  id: string;
  title: string;
  datasetId?: string | null;
  model?: string | null;
}): Promise<ConversationMeta | null> {
  const api = bridge();
  if (!api) return null;
  return api.create(input);
}

export async function listConversationsRemote(input?: {
  limit?: number;
  search?: string;
}): Promise<ConversationMeta[]> {
  const api = bridge();
  if (!api) return [];
  return api.list(input);
}

export async function renameConversationRemote(id: string, title: string): Promise<void> {
  await bridge()?.rename(id, title);
}

export async function pinConversationRemote(id: string, pinned: boolean): Promise<void> {
  await bridge()?.pin(id, pinned);
}

export async function setConversationModelRemote(id: string, model: string | null): Promise<void> {
  await bridge()?.setModel(id, model);
}

export async function deleteConversationRemote(id: string): Promise<void> {
  await bridge()?.delete(id);
}

export async function appendMessageRemote(input: {
  conversationId: string;
  role: ChatRole;
  content: string;
  parts?: unknown;
}): Promise<ChatMessageRow | null> {
  const api = bridge();
  if (!api) return null;
  return api.appendMessage(input);
}

export async function getMessagesRemote(
  conversationId: string,
  limit?: number,
): Promise<ChatMessageRow[]> {
  const api = bridge();
  if (!api) return [];
  return api.messages(conversationId, limit);
}

export async function searchMessagesRemote(input: {
  query: string;
  limit?: number;
  conversationId?: string;
}): Promise<ChatSearchHit[]> {
  const api = bridge();
  if (!api) return [];
  return api.searchMessages(input);
}

export async function backfillEmbeddingsRemote(): Promise<ChatEmbeddingBackfillResult | null> {
  const api = bridge();
  if (!api) return null;
  return api.backfillEmbeddings();
}
