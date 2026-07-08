"use client";

/**
 * Moudir chat store — the single renderer state surface for the assistant's
 * real conversation experience. Orchestrates the two Electron clients:
 *   - chat-history-client (A1, SQLite chat.db): durable conversations +
 *     messages, list/pin/search/rename/delete.
 *   - chat-session-client (A2, live LlamaChatSession): streaming turns, the
 *     grammar-enforced tool loop, titles, follow-ups, preload.
 *
 * Message anatomy (the contract Phase-B UI renders):
 *   - `content` is streaming markdown (streamdown renders it).
 *   - `parts` are structured, first-class message pieces:
 *       tool   — a run_sql / get_schema / profile_column call (collapsed chip
 *                → code + result summary), streamed live as it happens.
 *       chart  — a make_chart tool event, promoted to an inline ECharts
 *                artifact the message list renders (spec only; the chart lane
 *                builds the option — main process never touches ECharts).
 *   Both `content` and `parts` persist to chat.db as the message's `parts`
 *   column so a reopened conversation restores the full rich thread.
 *
 * Persistence discipline: the UI thread (this store) and the model's KV
 * history are TWO records of the same conversation — chat.db rows rehydrate
 * both (openChatSession replays role+content into the session; getMessages
 * replays the rich parts into this store).
 */

import { create } from "zustand";
import {
  appendMessageRemote,
  type ChatMessageRow,
  type ConversationMeta,
  createConversationRemote,
  deleteConversationRemote,
  getMessagesRemote,
  listConversationsRemote,
  pinConversationRemote,
  renameConversationRemote,
} from "@/platform/chat/chat-history-client";
import {
  type ChatToolEvent,
  disposeChatSession,
  generateChatTitle,
  openChatSession,
  sendChatPrompt,
  suggestChatFollowUps,
} from "@/platform/chat/chat-session-client";

export type ChatRole = "user" | "assistant";

/** A tool invocation shown as a collapsible chip in the assistant message. */
export interface ToolPart {
  kind: "tool";
  name: string;
  params: unknown;
  resultSummary: string;
  durationMs: number;
}

/** A make_chart tool event promoted to an inline chart artifact. */
export interface ChartPart {
  kind: "chart";
  chartType: string;
  x: string;
  y: string;
  aggregate: string;
  title: string;
}

export type MessagePart = ToolPart | ChartPart;

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  parts: MessagePart[];
  /** streaming → tokens arriving; done → settled; error → failed turn. */
  status: "streaming" | "done" | "error";
  error?: string;
  createdAt: number;
}

interface PersistedParts {
  parts: MessagePart[];
}

interface MoudirChatState {
  conversations: ConversationMeta[];
  activeId: string | null;
  messages: ChatMessage[];
  /** Follow-up chips for the latest assistant turn. */
  followUps: string[];
  status: "idle" | "streaming";
  searchTerm: string;
  loadingConversation: boolean;

  refreshConversations(search?: string): Promise<void>;
  setSearchTerm(term: string): void;
  newConversation(datasetId?: string | null, model?: string | null): Promise<string | null>;
  openConversation(id: string): Promise<void>;
  send(text: string, ctx?: { datasetId?: string | null; model?: string | null }): Promise<void>;
  cancel(): void;
  regenerateLast(): Promise<void>;
  editAndResend(messageId: string, text: string): Promise<void>;
  pin(id: string, pinned: boolean): Promise<void>;
  rename(id: string, title: string): Promise<void>;
  remove(id: string): Promise<void>;
}

const UNTITLED = "Nouvelle conversation";

function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Rebuild the rich UI message from a persisted chat.db row (content + parts). */
function messageFromRow(row: ChatMessageRow): ChatMessage | null {
  if (row.role === "tool") return null; // tool rows fold into the assistant turn
  const persisted = (row.parts ?? null) as PersistedParts | null;
  return {
    id: `m-${row.id}`,
    role: row.role === "assistant" ? "assistant" : "user",
    content: row.content,
    parts: Array.isArray(persisted?.parts) ? persisted.parts : [],
    status: "done",
    createdAt: row.createdAt,
  };
}

/** A make_chart tool event carries its spec in params — promote it to a ChartPart. */
function chartPartFrom(event: ChatToolEvent): ChartPart | null {
  if (event.name !== "make_chart") return null;
  const p = (event.params ?? {}) as Record<string, unknown>;
  return {
    kind: "chart",
    chartType: String(p.chart_type ?? "bar"),
    x: String(p.x ?? ""),
    y: String(p.y ?? ""),
    aggregate: String(p.aggregate ?? "none"),
    title: String(p.title ?? "Graphique"),
  };
}

/** Only the abort-safe controller for the in-flight turn. Module scope (not serializable). */
let activeChatController: AbortController | null = null;

export const useMoudirChatStore = create<MoudirChatState>((set, get) => {
  /** Drive one assistant turn: stream tokens/tools, persist both messages. */
  async function runTurn(
    conversationId: string,
    userText: string,
    ctx?: { datasetId?: string | null; model?: string | null },
  ): Promise<void> {
    const userMsg: ChatMessage = {
      id: newId("u"),
      role: "user",
      content: userText,
      parts: [],
      status: "done",
      createdAt: Date.now(),
    };
    const assistantMsg: ChatMessage = {
      id: newId("a"),
      role: "assistant",
      content: "",
      parts: [],
      status: "streaming",
      createdAt: Date.now(),
    };
    set((s) => ({
      messages: [...s.messages, userMsg, assistantMsg],
      status: "streaming",
      followUps: [],
    }));

    // Ensure the model session exists (rehydrates KV on a reopened conversation).
    await openChatSession({
      conversationId,
      modelFile: ctx?.model ?? undefined,
      history: get()
        .messages.filter((m) => m.id !== assistantMsg.id && m.id !== userMsg.id)
        .map((m) => ({ role: m.role, content: m.content })),
    });
    void appendMessageRemote({ conversationId, role: "user", content: userText });

    const controller = new AbortController();
    activeChatController = controller;

    const patchAssistant = (patch: Partial<ChatMessage>) =>
      set((s) => ({
        messages: s.messages.map((m) => (m.id === assistantMsg.id ? { ...m, ...patch } : m)),
      }));

    let streamed = "";
    const collectedParts: MessagePart[] = [];

    try {
      const result = await sendChatPrompt({
        conversationId,
        text: userText,
        signal: controller.signal,
        onToken: (chunk) => {
          streamed += chunk;
          patchAssistant({ content: streamed });
        },
        onTool: (event) => {
          const chart = chartPartFrom(event);
          const part: MessagePart = chart ?? {
            kind: "tool",
            name: event.name,
            params: event.params,
            resultSummary: event.resultSummary,
            durationMs: event.durationMs,
          };
          collectedParts.push(part);
          patchAssistant({ parts: [...collectedParts] });
        },
      });

      const finalContent = result.text || streamed;
      patchAssistant({ content: finalContent, parts: [...collectedParts], status: "done" });
      void appendMessageRemote({
        conversationId,
        role: "assistant",
        content: finalContent,
        parts: { parts: collectedParts } satisfies PersistedParts,
      });

      // Title an untitled conversation from its first exchange; suggest next steps.
      const conv = get().conversations.find((c) => c.id === conversationId);
      if (conv && conv.title === UNTITLED) {
        void generateChatTitle(conversationId).then((title) => {
          if (title) void get().rename(conversationId, title);
        });
      }
      void suggestChatFollowUps(conversationId).then((followUps) => {
        if (get().activeId === conversationId) set({ followUps });
      });
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      patchAssistant({
        status: aborted && streamed ? "done" : "error",
        content: streamed,
        error: aborted ? undefined : error instanceof Error ? error.message : String(error),
      });
      if (streamed) {
        void appendMessageRemote({
          conversationId,
          role: "assistant",
          content: streamed,
          parts: { parts: collectedParts } satisfies PersistedParts,
        });
      }
    } finally {
      if (activeChatController === controller) activeChatController = null;
      set({ status: "idle" });
      void get().refreshConversations(get().searchTerm);
    }
  }

  return {
    conversations: [],
    activeId: null,
    messages: [],
    followUps: [],
    status: "idle",
    searchTerm: "",
    loadingConversation: false,

    async refreshConversations(search) {
      const conversations = await listConversationsRemote({
        search: (search ?? get().searchTerm) || undefined,
      });
      set({ conversations });
    },

    setSearchTerm(term) {
      set({ searchTerm: term });
      void get().refreshConversations(term);
    },

    async newConversation(datasetId, model) {
      const id = newId("conv");
      const meta = await createConversationRemote({ id, title: UNTITLED, datasetId, model });
      if (!meta) return null;
      set((s) => ({
        conversations: [meta, ...s.conversations],
        activeId: id,
        messages: [],
        followUps: [],
      }));
      return id;
    },

    async openConversation(id) {
      if (activeChatController) return; // don't switch mid-stream
      set({ activeId: id, loadingConversation: true, messages: [], followUps: [] });
      const rows = await getMessagesRemote(id);
      const messages = rows.map(messageFromRow).filter((m): m is ChatMessage => m !== null);
      set({ messages, loadingConversation: false });
      // Rehydrate the model's KV history so the next turn continues the thread.
      void openChatSession({
        conversationId: id,
        history: messages.map((m) => ({ role: m.role, content: m.content })),
      });
    },

    async send(text, ctx) {
      const trimmed = text.trim();
      if (!trimmed || get().status === "streaming") return;
      let id = get().activeId;
      if (!id) id = await get().newConversation(ctx?.datasetId, ctx?.model);
      if (!id)
        throw new Error("Impossible de créer la conversation (application de bureau requise).");
      await runTurn(id, trimmed, ctx);
    },

    cancel() {
      activeChatController?.abort();
      activeChatController = null;
    },

    async regenerateLast() {
      const { messages, activeId } = get();
      if (!activeId || get().status === "streaming") return;
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      if (!lastUser) return;
      // Drop the trailing assistant turn(s) after the last user message, then re-run.
      const lastUserIdx = messages.lastIndexOf(lastUser);
      set({ messages: messages.slice(0, lastUserIdx) });
      await runTurn(activeId, lastUser.content);
    },

    async editAndResend(messageId, text) {
      const { messages, activeId } = get();
      if (!activeId || get().status === "streaming") return;
      const idx = messages.findIndex((m) => m.id === messageId);
      if (idx === -1) return;
      // Truncate at the edited message and re-run from the new text (implicit fork).
      set({ messages: messages.slice(0, idx) });
      await runTurn(activeId, text.trim());
    },

    async pin(id, pinned) {
      await pinConversationRemote(id, pinned);
      await get().refreshConversations();
    },

    async rename(id, title) {
      await renameConversationRemote(id, title);
      set((s) => ({
        conversations: s.conversations.map((c) => (c.id === id ? { ...c, title } : c)),
      }));
    },

    async remove(id) {
      await deleteConversationRemote(id);
      void disposeChatSession(id);
      set((s) => {
        const active = s.activeId === id ? null : s.activeId;
        return {
          conversations: s.conversations.filter((c) => c.id !== id),
          activeId: active,
          messages: active ? s.messages : [],
          followUps: active ? s.followUps : [],
        };
      });
    },
  };
});
