"use client";

// FACTS (GateGuard): the single renderer state surface for Moudir's chat.
//   Orchestrates the two Electron clients:
//     - chat-history-client (A1, SQLite chat.db): durable conversations +
//       messages, list/pin/search/rename/delete.
//     - chat-session-client (A2, live LlamaChatSession): streaming turns, the
//       grammar-enforced tool loop, titles, follow-ups, preload.
//   Consumers — moudir-chat-screen.tsx (status/canvas/shortcuts), message-list
//   (messages/parts/pendingScrollToMessageId), conversation-sidebar
//   (conversations/pin/rename/remove), chat-composer (send/cancel/followUps),
//   chat-search-palette (conversations projection), moudir-canvas
//   (canvasArtifact). The sidebar's open/closed boolean is intentionally NOT
//   here — it is view-local and lives in the screen's usePersistentState.
//
//   Message anatomy (the contract Phase-B UI renders):
//     - `content` is streaming markdown, rendered by streamdown.
//     - `parts` are structured, first-class message pieces:
//         tool          — run_sql / get_schema / profile_column, streamed live
//                         as a collapsible chip (code + result summary).
//         chart         — a make_chart tool event promoted to an inline chart.
//                         Spec only: chat-chart-artifact.tsx renders it with
//                         ECharts (echarts-for-react/lib/core + @/platform/viz,
//                         OffscreenChart when supported) via buildOption().
//                         The main process never touches a charting library.
//         citation      — parsed out of the model's trailing "Sources" block by
//                         parseCitations(); rendered as provenance chips.
//         clarification — a request_clarification tool event, rendered as a
//                         shadcn <Questionnaire/> instead of a wall of prose.
//     Both `content` and `parts` persist to chat.db as the message's `parts`
//     column so a reopened conversation restores the full rich thread.
//
//   Canvas: any part can be promoted to a MoudirArtifact and opened in the
//   side-pane via openCanvas(). Small artifacts stay inline by default — the
//   canvas is opt-in, for the ones the user iterates against across turns.
//
//   Persistence discipline: the UI thread (this store) and the model's KV
//   history are TWO records of the same conversation — chat.db rows rehydrate
//   both (openChatSession replays role+content into the session; getMessages
//   replays the rich parts into this store). Forking a thread (editAndResend /
//   regenerateLast) MUST dispose the session first so the KV cache cannot keep
//   replying from the truncated tail.

/**
 * Moudir chat store.
 *
 * One turn = runTurn(): stage the pair of messages, ensure the model session,
 * stream tokens + tool events, parse provenance, measure local-inference
 * throughput, persist both rows. Every failure path settles the assistant
 * bubble — an unsettled bubble is a permanent shimmer, so nothing that can
 * reject is allowed outside the try.
 */

import { create } from "zustand";
import type { AttachmentData } from "@/components/ai-elements/attachments";
import { basenameModel } from "@/components/moudir-chat/utils";
import { useModelRequiredDialogStore } from "@/platform/ai/models/model-required-dialog-store";
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
  setConversationModelRemote,
} from "@/platform/chat/chat-history-client";
import {
  ChatModelUnavailableError,
  type ChatSessionRole,
  type ChatToolEvent,
  disposeChatSession,
  generateChatTitle,
  openChatSession,
  sendChatPrompt,
  suggestChatFollowUps,
} from "@/platform/chat/chat-session-client";
import { getAppSettingRemote } from "@/platform/settings/settings-client";

/* ── Message model ────────────────────────────────────────────────────────── */

type ChatRole = "user" | "assistant";

/** A tool invocation shown as a collapsible chip in the assistant message. */
export interface ToolPart {
  kind: "tool";
  name: string;
  params: unknown;
  resultSummary: string;
  durationMs: number;
  /** Set when the tool itself failed — the chip renders a Réessayer action. */
  failed?: boolean;
}

/**
 * A make_chart tool event promoted to an inline chart artifact. Renderer-
 * agnostic spec: chat-chart-artifact.tsx turns this into an EChartsOption via
 * buildOption(). `datasetId` lets the canvas re-query without another model turn.
 */
export interface ChartPart {
  kind: "chart";
  chartType: string;
  x: string;
  y: string;
  aggregate: string;
  title: string;
  datasetId: string | null;
  /**
   * Inline rows for synthetic charts (no dataset): each row maps the x field
   * to a label and the y field to a number. Present only when the model
   * supplied its own data.
   */
  rows?: Record<string, unknown>[];
}

/** Synthetic {label, value} pairs → rows keyed on the chart's x/y fields. */
export function chartDataToRows(
  x: string,
  y: string,
  data: unknown,
): Record<string, unknown>[] | undefined {
  if (!Array.isArray(data)) return undefined;
  const rows: Record<string, unknown>[] = [];
  for (const item of data.slice(0, 50)) {
    if (typeof item !== "object" || item === null) continue;
    const rec = item as Record<string, unknown>;
    const label = rec.label;
    const value = rec.value;
    if ((typeof label !== "string" && typeof label !== "number") || typeof value !== "number") {
      continue;
    }
    rows.push({ [x || "label"]: label, [y || "value"]: value });
  }
  return rows.length > 0 ? rows : undefined;
}

/**
 * A data-source citation (table, dataset, column, SQL query) the model attached
 * to a turn. Rendered as a "Sources" footer with provenance chips.
 */
export interface CitationPart {
  kind: "citation";
  sourceKind: "table" | "dataset" | "query" | "column";
  label: string;
  detail?: string;
  query?: string;
}

/**
 * The model asked for a missing input instead of guessing. Rendered as a
 * shadcn <Questionnaire/>; answering it calls answerClarification().
 */
export interface ClarificationPart {
  kind: "clarification";
  question: string;
  options: string[];
  /** Set once answered so a reopened conversation doesn't re-prompt. */
  answer?: string;
  /** Whether multi-selection of options is enabled. */
  multiSelect?: boolean;
}

type MessagePart = ToolPart | ChartPart | CitationPart | ClarificationPart;

/** Local-inference telemetry for one turn. Approximate by design. */
export interface TurnMetrics {
  /** ms from send to the first streamed token. */
  firstTokenMs: number;
  /** ms for the whole turn. */
  durationMs: number;
  /** Rough tokens/second, estimated from characters (~4 chars ≈ 1 token). */
  tokensPerSecond: number;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  parts: MessagePart[];
  /** Optional attachments (images, files, documents) attached to this message. */
  attachments?: AttachmentData[];
  /** streaming → tokens arriving; done → settled; error → failed turn. */
  status: "streaming" | "done" | "error";
  error?: string;
  createdAt: number;
  /** Captured from a regenerate so the bubble can show a word-level diff. */
  previousContent?: string;
  /** Which dataset this turn was scoped to — shown in the bubble's footer. */
  datasetId?: string | null;
  /** Present on settled assistant turns. */
  metrics?: TurnMetrics;
  /** Model file or identifier that generated this response. */
  model?: string;
}

export const CHAT_CONTEXT_MAX_TOKENS = 4096;

/**
 * Approximate token usage for a thread of messages (~3.8 characters per token,
 * including structured tool params and summaries).
 */
export function estimateUsedTokens(messages: ChatMessage[], systemPromptLength = 800): number {
  let charCount = systemPromptLength;
  for (const m of messages) {
    charCount += m.content.length;
    if (m.parts && m.parts.length > 0) {
      charCount += JSON.stringify(m.parts).length;
    }
  }
  return Math.ceil(charCount / 3.8);
}

/* ── Canvas artifacts ─────────────────────────────────────────────────────── */

/**
 * A part promoted into the side-pane. Kept structurally separate from
 * MessagePart so the canvas can be rendered in a popout window later without
 * dragging the message model along.
 */
export type MoudirArtifact =
  | {
      kind: "chart";
      title: string;
      chartType: string;
      x: string;
      y: string;
      aggregate: string;
      datasetId: string | null;
      confidence?: number;
      rows?: Record<string, unknown>[];
    }
  | { kind: "sql"; title: string; query: string; dataset: string | null }
  | { kind: "table"; title: string; columns: string[]; rows: unknown[][]; truncatedAt?: number }
  | { kind: "metric"; title: string; value: string; delta?: string; basis: string }
  | {
      kind: "clarification";
      title: string;
      question: string;
      options: string[];
      answer?: string;
      multiSelect?: boolean;
    };

export interface ActiveFilter {
  field: string;
  value: string | number;
  label?: string;
  datasetId?: string | null;
}

/* ── Persisted shape ──────────────────────────────────────────────────────── */

interface PersistedParts {
  parts: MessagePart[];
  attachments?: AttachmentData[];
  metrics?: TurnMetrics;
  datasetId?: string | null;
  model?: string;
}

/* ── Store contract ───────────────────────────────────────────────────────── */

/**
 * "loading-model" covers openChatSession (weights staging + KV rehydrate) —
 * the screen shows "Chargement du modèle…" for it. "error" is a turn-level
 * failure the screen surfaces as "Réponse interrompue · Reprendre"; a user
 * cancel settles to "idle", never "error".
 */
export type ChatStatus = "idle" | "loading-model" | "streaming" | "error";

interface MoudirChatState {
  conversations: ConversationMeta[];
  activeId: string | null;
  messages: ChatMessage[];
  /** Follow-up chips for the latest assistant turn. */
  followUps: string[];
  status: ChatStatus;
  searchTerm: string;
  loadingConversation: boolean;

  /** Open in the canvas side-pane; null = no canvas, no panel group mounted. */
  canvasArtifact: MoudirArtifact | null;
  /** Set by the search palette so message-list can scroll to the hit. */
  pendingScrollToMessageId: string | null;
  /** Transient user-facing notice (blocked action, tool failure). */
  lastNotice: string | null;

  refreshConversations(search?: string): Promise<void>;
  setSearchTerm(term: string): void;
  newConversation(datasetId?: string | null, model?: string | null): Promise<string | null>;
  openConversation(id: string): Promise<void>;
  send(
    text: string,
    ctx?: {
      datasetId?: string | null;
      model?: string | null;
      attachments?: AttachmentData[];
    },
  ): Promise<void>;
  cancel(): void;
  retryLast(): Promise<void>;
  regenerateLast(): Promise<void>;
  editAndResend(messageId: string, text: string): Promise<void>;
  answerClarification(messageId: string, question: string, answer: string): Promise<void>;
  pin(id: string, pinned: boolean): Promise<void>;
  rename(id: string, title: string): Promise<void>;
  remove(id: string): Promise<void>;
  setModel(id: string, model: string | null): Promise<void>;

  openCanvas(artifact: MoudirArtifact): void;
  closeCanvas(): void;
  consumePendingScroll(): string | null;
  notify(message: string | null): void;
  compactConversation(): Promise<void>;

  activeFilters: ActiveFilter[];
  addFilter(filter: ActiveFilter): void;
  removeFilter(field: string): void;
  clearFilters(): void;
}

/* ── Constants ────────────────────────────────────────────────────────────── */

const UNTITLED = "Nouvelle conversation";
const SYSTEM_PROMPT_NS = "moudir";
const SYSTEM_PROMPT_KEY = "systemPrompt";
/** Keystroke-to-IPC debounce for conversation search. */
const SEARCH_DEBOUNCE_MS = 180;

/**
 * Default persona; the renderer overrides this once the settings IPC has
 * delivered the user-customized prompt.
 */
const DEFAULT_SYSTEM_PROMPT =
  "Tu es Moudir, un analyste de données francophone. Tu aides l'utilisateur à explorer, profiler et visualiser ses données tabulaires. Sois concis, factuel, et propose des visualisations pertinentes quand c'est utile.\n\n" +
  "Pour toute visualisation de données (même synthétiques), tu DOIS appeler la fonction make_chart(chart_type, x, y, aggregate, title, data). N'écris JAMAIS 'le graphique est prêt à être affiché' ni un tableau seul en prétendant que c'est un graphique sans appeler make_chart.\n\n" +
  "Quand un calcul ou une manipulation de données est utile, émets un bloc de code exécutable :\n" +
  "  ```js-run\n<code>\n```  pour JavaScript (toujours disponible, sandboxed iframe)\n" +
  "  ```python-run\n<code>\n```  pour Python (Pyodide, opt-in côté utilisateur)\n" +
  "Le bloc sera rendu comme une carte avec un bouton Run. N'invente jamais de code sans ce préfixe.\n\n" +
  "Si une demande est ambiguë (colonne, période, ou jeu de données manquant), n'invente pas : appelle l'outil request_clarification avec une question courte et 2 à 4 options.\n\n" +
  "Chaque fois qu'une réponse s'appuie sur des données, ajoute une section 'Sources' en fin de message listant chaque source (table, dataset, colonne, ou requête SQL) consultée. Le format est :\n" +
  "  [table] nom_de_la_table\n" +
  "  [dataset] nom_du_dataset\n" +
  "  [column] nom_colonne (table)\n" +
  "  [query] SELECT ...\n" +
  "Une ligne par source, pas de markdown décoratif. Ces sources sont la provenance — l'utilisateur s'en sert pour vérifier tes affirmations.";

let cachedSystemPrompt: string | null = null;

/**
 * Read the user-customized prompt and cache it — the chat path is hit on every
 * turn, so we don't pay the IPC round-trip on each send.
 */
export async function loadMoudirSystemPrompt(): Promise<string> {
  const setting = await getAppSettingRemote<string>(SYSTEM_PROMPT_NS, SYSTEM_PROMPT_KEY);
  cachedSystemPrompt =
    typeof setting.value === "string" && setting.value.trim().length > 0
      ? setting.value
      : DEFAULT_SYSTEM_PROMPT;
  return cachedSystemPrompt;
}

function getMoudirSystemPrompt(): string {
  return cachedSystemPrompt ?? DEFAULT_SYSTEM_PROMPT;
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

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
    attachments: Array.isArray(persisted?.attachments) ? persisted.attachments : undefined,
    status: "done",
    createdAt: row.createdAt,
    metrics: persisted?.metrics,
    datasetId: persisted?.datasetId ?? null,
    model: persisted?.model,
  };
}

/** A make_chart tool event carries its spec in params — promote it to a ChartPart. */
function chartPartFrom(event: ChatToolEvent, datasetId: string | null): ChartPart | null {
  if (event.name !== "make_chart") return null;
  const p = (event.params ?? {}) as Record<string, unknown>;
  const x = String(p.x ?? "");
  const y = String(p.y ?? "");
  return {
    kind: "chart",
    chartType: String(p.chart_type ?? "bar"),
    x,
    y,
    aggregate: String(p.aggregate ?? "none"),
    title: String(p.title ?? "Graphique"),
    datasetId,
    rows: chartDataToRows(x, y, p.data),
  };
}

/** request_clarification → a Questionnaire part instead of a guessed answer. */
function clarificationPartFrom(event: ChatToolEvent): ClarificationPart | null {
  if (event.name !== "request_clarification") return null;
  const p = (event.params ?? {}) as Record<string, unknown>;
  const options = Array.isArray(p.options) ? p.options.map((o) => String(o)) : [];
  const question = String(p.question ?? "Précise ta demande.");
  const multiSelect = Boolean(p.multiSelect || p.multiple);
  return {
    kind: "clarification",
    question,
    options: options.slice(0, 8),
    multiSelect,
  };
}

const CITATION_LINE = /^\s*\[(table|dataset|column|query)\]\s+(.+?)\s*$/i;

/**
 * The system prompt asks for a trailing "Sources" block in plain text. Parse it
 * into CitationParts and strip it from the rendered markdown, so provenance
 * becomes structured chips instead of a paragraph the user has to read.
 * Previously CitationPart was declared and never produced.
 */
function parseCitations(text: string): { content: string; citations: CitationPart[] } {
  const lines = text.split("\n");

  // Find the last "Sources" heading and require the tail to be citation lines.
  let start = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^\s*#{0,4}\s*\**\s*sources\s*\**\s*:?\s*$/i.test(lines[i])) {
      start = i;
      break;
    }
  }
  if (start === -1) return { content: text, citations: [] };

  const citations: CitationPart[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.trim()) continue;
    const match = CITATION_LINE.exec(line);
    if (!match) return { content: text, citations: [] }; // not a clean block — leave it alone
    const sourceKind = match[1].toLowerCase() as CitationPart["sourceKind"];
    const raw = match[2];
    if (sourceKind === "query") {
      citations.push({ kind: "citation", sourceKind, label: "Requête SQL", query: raw });
    } else if (sourceKind === "column") {
      const withTable = /^(.+?)\s*\((.+)\)$/.exec(raw);
      citations.push({
        kind: "citation",
        sourceKind,
        label: withTable ? withTable[1] : raw,
        detail: withTable ? withTable[2] : undefined,
      });
    } else {
      citations.push({ kind: "citation", sourceKind, label: raw });
    }
  }

  if (citations.length === 0) return { content: text, citations: [] };
  return { content: lines.slice(0, start).join("\n").trimEnd(), citations };
}

/** ~4 chars per token is close enough for a throughput chip; label it approximate in UI. */
function estimateMetrics(chars: number, firstTokenMs: number, durationMs: number): TurnMetrics {
  const seconds = Math.max(durationMs - firstTokenMs, 1) / 1000;
  return {
    firstTokenMs: Math.round(firstTokenMs),
    durationMs: Math.round(durationMs),
    tokensPerSecond: Math.round(chars / 4 / seconds),
  };
}

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/** The abort-safe controller for the in-flight turn. Module scope (not serializable). */
let activeChatController: AbortController | null = null;
/** Debounce timer for search — one IPC per pause, not one per keystroke. */
let searchTimer: ReturnType<typeof setTimeout> | null = null;

/* ── Store ────────────────────────────────────────────────────────────────── */

export const useMoudirChatStore = create<MoudirChatState>((set, get) => {
  /** Drive one assistant turn: stream tokens/tools, persist both messages. */
  async function runTurn(
    conversationId: string,
    userText: string,
    ctx?: {
      datasetId?: string | null;
      model?: string | null;
      attachments?: AttachmentData[];
    },
  ): Promise<void> {
    const datasetId = ctx?.datasetId ?? null;
    const attachments =
      ctx?.attachments && ctx.attachments.length > 0 ? ctx.attachments : undefined;

    const userMsg: ChatMessage = {
      id: newId("u"),
      role: "user",
      content: userText,
      parts: [],
      attachments,
      status: "done",
      createdAt: Date.now(),
      datasetId,
    };
    const assistantMsg: ChatMessage = {
      id: newId("a"),
      role: "assistant",
      content: "",
      parts: [],
      status: "streaming",
      createdAt: Date.now(),
      datasetId,
    };

    set((s) => ({
      messages: [...s.messages, userMsg, assistantMsg],
      // Model session first — the screen shows "Chargement du modèle…" for this.
      status: "loading-model",
      followUps: [],
      lastNotice: null,
    }));

    const controller = new AbortController();
    activeChatController = controller;

    const patchAssistant = (patch: Partial<ChatMessage>) =>
      set((s) => ({
        messages: s.messages.map((m) => (m.id === assistantMsg.id ? { ...m, ...patch } : m)),
      }));

    let streamed = "";
    const collectedParts: MessagePart[] = [];
    const startedAt = now();
    let firstTokenAt: number | null = null;
    let settledAsError = false;

    try {
      // Ensure the model session exists (rehydrates KV on a reopened
      // conversation). MUST stay inside this try: a rejection here (e.g. no
      // GGUF weights staged — see llama-service.ts's ensureModel) previously
      // propagated as an unhandled rejection out of runTurn(), skipping the
      // catch/finally below entirely and leaving assistantMsg permanently
      // stuck at status "streaming" (the "Moudir réfléchit…" shimmer never
      // resolves) instead of settling into a graceful error bubble.
      // Retry / edit / resume paths carry no model in ctx — fall back to the
      // conversation's pinned model so they never hit the default-model
      // fallback (and its download dialog) mid-thread.
      const storedModel = get().conversations.find((c) => c.id === conversationId)?.model;
      const modelFile = ctx?.model ?? (storedModel ? basenameModel(storedModel) : undefined);
      const openResult = await openChatSession({
        conversationId,
        modelFile,
        systemPrompt: getMoudirSystemPrompt(),
        history: get()
          .messages.filter((m) => m.id !== assistantMsg.id && m.id !== userMsg.id)
          .map((m) => ({ role: m.role, content: m.content })),
      });
      const activeModel = openResult?.model;

      set({ status: "streaming" });

      // Awaited, not fire-and-forget: two unawaited appends race and can land
      // the assistant row before the user row on a fast turn.
      await appendMessageRemote({
        conversationId,
        role: "user",
        content: userText,
        parts: attachments ? ({ parts: [], attachments } as PersistedParts) : undefined,
      });

      let promptText = userText;
      if (attachments && attachments.length > 0) {
        const attachmentSummary = attachments
          .map((a) => {
            const name = a.filename || "Fichier";
            const type = a.mediaType || "inconnu";
            return `- [Fichier: ${name} (${type})]`;
          })
          .join("\n");
        promptText = `${userText}\n\n[Pièces jointes fournies par l'utilisateur :\n${attachmentSummary}]`;
      }

      const result = await sendChatPrompt({
        conversationId,
        text: promptText,
        signal: controller.signal,
        onToken: (chunk) => {
          if (firstTokenAt === null) firstTokenAt = now();
          streamed += chunk;
          patchAssistant({ content: streamed, model: activeModel });
        },
        onTool: (event) => {
          // Start events (no result yet) paint the running state immediately;
          // the completion event reconciles the pending part in place.
          if (event.started) {
            collectedParts.push({
              kind: "tool",
              name: event.name,
              params: event.params,
              resultSummary: "",
              durationMs: 0,
              failed: false,
            });
            patchAssistant({ parts: [...collectedParts] });
            return;
          }
          const part: MessagePart = chartPartFrom(event, datasetId) ??
            clarificationPartFrom(event) ?? {
              kind: "tool",
              name: event.name,
              params: event.params,
              resultSummary: event.resultSummary,
              durationMs: event.durationMs,
              failed: event.failed ?? event.resultSummary.startsWith("Erreur"),
            };
          const pendingIdx = collectedParts.findIndex(
            (p) => p.kind === "tool" && p.name === event.name && p.resultSummary === "",
          );
          if (pendingIdx >= 0) collectedParts[pendingIdx] = part;
          else collectedParts.push(part);
          patchAssistant({ parts: [...collectedParts] });
        },
      });

      const { content: finalContent, citations } = parseCitations(result.text || streamed);
      const finalParts = [...collectedParts, ...citations];
      const metrics = estimateMetrics(
        finalContent.length,
        (firstTokenAt ?? startedAt) - startedAt,
        now() - startedAt,
      );

      patchAssistant({
        content: finalContent,
        parts: finalParts,
        status: "done",
        metrics,
        model: activeModel,
      });

      void appendMessageRemote({
        conversationId,
        role: "assistant",
        content: finalContent,
        parts: {
          parts: finalParts,
          metrics,
          datasetId,
          model: activeModel,
        } satisfies PersistedParts,
      });

      // A turn sent with a different model re-pins the conversation, so the
      // next open restores it and the thread shows a model separator.
      const turnedModel = activeModel ? basenameModel(activeModel) : null;
      const knownModel = get().conversations.find((c) => c.id === conversationId)?.model;
      const knownNorm = knownModel ? basenameModel(knownModel) : null;
      if (turnedModel && turnedModel !== knownNorm) {
        void get().setModel(conversationId, turnedModel);
      }

      // Title an untitled conversation from its first exchange; suggest next steps.
      const conv = get().conversations.find((c) => c.id === conversationId);
      if (conv && conv.title === UNTITLED) {
        void generateChatTitle(conversationId)
          .then((title) => {
            if (title) void get().rename(conversationId, title);
          })
          .catch((error: unknown) => {
            console.warn("[moudir] title generation failed:", error);
          });
      }
      void suggestChatFollowUps(conversationId)
        .then((followUps) => {
          if (get().activeId === conversationId) set({ followUps });
        })
        .catch((error: unknown) => {
          console.warn("[moudir] follow-up suggestion failed:", error);
        });
    } catch (error) {
      if (error instanceof ChatModelUnavailableError) {
        useModelRequiredDialogStore
          .getState()
          .show(
            "Moudir needs a downloaded AI model. Pick one in the dialog below and click Download.",
          );
        patchAssistant({
          status: "error",
          content: streamed,
          error:
            "Modèle requis — télécharge un modèle depuis la boîte de dialogue pour envoyer un message.",
        });
        settledAsError = true;
        return;
      }

      // A user cancel is not a failure: keep whatever streamed and settle idle.
      const aborted = error instanceof Error && error.name === "AbortError";
      settledAsError = !aborted;
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
          parts: { parts: collectedParts, datasetId } satisfies PersistedParts,
        });
      }
    } finally {
      if (activeChatController === controller) activeChatController = null;
      set({ status: settledAsError ? "error" : "idle" });
      void get().refreshConversations(get().searchTerm);
    }
  }

  /**
   * Fork the thread: truncate the UI messages AND drop the model session, so
   * the KV cache can't keep answering from the tail we just removed.
   */
  async function forkAndRun(
    conversationId: string,
    messages: ChatMessage[],
    prompt: string,
    ctx?: {
      datasetId?: string | null;
      model?: string | null;
      attachments?: AttachmentData[];
    },
  ): Promise<void> {
    set({ messages, followUps: [], canvasArtifact: null });
    await disposeChatSession(conversationId).catch(() => {
      /* no live session — nothing to drop */
    });
    await runTurn(conversationId, prompt, ctx);
  }

  return {
    conversations: [],
    activeId: null,
    messages: [],
    followUps: [],
    status: "idle",
    searchTerm: "",
    loadingConversation: false,
    canvasArtifact: null,
    pendingScrollToMessageId: null,
    lastNotice: null,
    activeFilters: [],

    async refreshConversations(search) {
      const conversations = await listConversationsRemote({
        search: (search ?? get().searchTerm) || undefined,
      });
      set({ conversations });
    },

    setSearchTerm(term) {
      set({ searchTerm: term });
      // Debounced: the previous version fired one SQLite IPC per keystroke.
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        searchTimer = null;
        if (get().searchTerm === term) void get().refreshConversations(term);
      }, SEARCH_DEBOUNCE_MS);
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
        canvasArtifact: null,
        pendingScrollToMessageId: null,
        activeFilters: [],
        status: s.status === "error" ? "idle" : s.status,
      }));
      return id;
    },

    async openConversation(id) {
      // Switching mid-stream would orphan the in-flight turn. Say so instead of
      // failing silently — the search palette's jump depends on this feedback.
      if (activeChatController) {
        set({ lastNotice: "Réponse en cours — arrête-la avant de changer de conversation." });
        return;
      }
      if (get().activeId === id && get().messages.length > 0) return;

      set({
        activeId: id,
        loadingConversation: true,
        messages: [],
        followUps: [],
        canvasArtifact: null,
        activeFilters: [],
        status: "idle",
        lastNotice: null,
      });

      const rows = await getMessagesRemote(id);
      const messages = rows.map(messageFromRow).filter((m): m is ChatMessage => m !== null);
      set({ messages, loadingConversation: false });

      const chatHistory = rows
        .filter(
          (r): r is typeof r & { role: ChatSessionRole } =>
            r.role === "user" || r.role === "assistant" || r.role === "tool",
        )
        .map((r) => ({
          role: r.role,
          content: r.content,
          parts: r.parts,
        }));

      // Restore the conversation's own model (legacy rows may hold an
      // absolute path — normalize to the bare file name main expects).
      const storedModel = get().conversations.find((c) => c.id === id)?.model;
      const pinnedModel = storedModel ? basenameModel(storedModel) : undefined;

      openChatSession({
        conversationId: id,
        modelFile: pinnedModel,
        systemPrompt: getMoudirSystemPrompt(),
        history: chatHistory,
      })
        .then((res) => {
          // Pin the resolved model so the next open restores it directly.
          const resolved = res?.model ? basenameModel(res.model) : undefined;
          if (resolved && resolved !== pinnedModel) void get().setModel(id, resolved);
        })
        .catch((error: unknown) => {
          if (error instanceof ChatModelUnavailableError) {
            useModelRequiredDialogStore
              .getState()
              .show(
                "Moudir needs a downloaded AI model. Pick one in the dialog below and click Download.",
              );
            return;
          }
          if (typeof console !== "undefined") {
            console.error("[moudir] openChatSession rehydration failed:", error);
          }
        });
    },

    async send(text, ctx) {
      const trimmed = text.trim();
      if (!trimmed || get().status === "streaming" || get().status === "loading-model") return;

      let id = get().activeId;
      if (!id) id = await get().newConversation(ctx?.datasetId, ctx?.model);
      if (!id) {
        throw new Error("Impossible de créer la conversation (application de bureau requise).");
      }
      await runTurn(id, trimmed, ctx);
    },

    cancel() {
      // Don't null the controller here — runTurn's finally does it, and clearing
      // it early made that ownership check fail.
      activeChatController?.abort();
    },

    /** "Réponse interrompue · Reprendre" — re-run the last user turn verbatim. */
    async retryLast() {
      const { messages, activeId, status } = get();
      if (!activeId || status === "streaming" || status === "loading-model") return;

      const lastUserIdx = messages.map((m) => m.role).lastIndexOf("user");
      if (lastUserIdx === -1) return;
      const lastUser = messages[lastUserIdx];

      await forkAndRun(activeId, messages.slice(0, lastUserIdx), lastUser.content, {
        datasetId: lastUser.datasetId ?? null,
        attachments: lastUser.attachments,
      });
    },

    async regenerateLast() {
      const { messages, activeId, status } = get();
      if (!activeId || status === "streaming" || status === "loading-model") return;

      const lastUserIdx = messages.map((m) => m.role).lastIndexOf("user");
      if (lastUserIdx === -1) return;
      const lastUser = messages[lastUserIdx];

      // The old version looked for the assistant AFTER the user turn but then
      // mapped over the slice BEFORE it, so previousContent was never set and
      // the word-level diff never had anything to compare. Capture the reply
      // being replaced, then carry it onto the retry.
      const replaced = messages.slice(lastUserIdx + 1).find((m) => m.role === "assistant");
      const previousContent =
        replaced && replaced.content.trim().length > 0 ? replaced.content : undefined;

      set({ messages: messages.slice(0, lastUserIdx) });
      await disposeChatSession(activeId).catch(() => {});
      await runTurn(activeId, lastUser.content, {
        datasetId: lastUser.datasetId ?? null,
        attachments: lastUser.attachments,
      });

      if (previousContent) {
        set((s) => {
          const lastAssistant = [...s.messages].reverse().find((m) => m.role === "assistant");
          if (!lastAssistant) return s;
          return {
            messages: s.messages.map((m) =>
              m.id === lastAssistant.id ? { ...m, previousContent } : m,
            ),
          };
        });
      }
    },

    async editAndResend(messageId, text) {
      const { messages, activeId, status } = get();
      if (!activeId || status === "streaming" || status === "loading-model") return;
      const idx = messages.findIndex((m) => m.id === messageId);
      if (idx === -1) return;

      // Truncate at the edited message and re-run from the new text (implicit fork).
      await forkAndRun(activeId, messages.slice(0, idx), text.trim(), {
        datasetId: messages[idx].datasetId ?? null,
        attachments: messages[idx].attachments,
      });
    },

    /**
     * The user answered a <Questionnaire/>. Record the choice on the part so a
     * reopened conversation doesn't re-prompt, then send it as the next turn.
     */
    async answerClarification(messageId, question, answer) {
      const { activeId } = get();
      if (!activeId) return;

      set((s) => ({
        messages: s.messages.map((m) =>
          m.id !== messageId
            ? m
            : {
                ...m,
                parts: m.parts.map((p) =>
                  p.kind === "clarification" && p.question === question ? { ...p, answer } : p,
                ),
              },
        ),
      }));

      const datasetId = get().messages.find((m) => m.id === messageId)?.datasetId ?? null;
      await runTurn(activeId, answer, { datasetId });
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

    async setModel(id, model) {
      await setConversationModelRemote(id, model);
      set((s) => ({
        conversations: s.conversations.map((c) => (c.id === id ? { ...c, model } : c)),
      }));
    },

    async remove(id) {
      // Deleting the conversation that's mid-stream must stop the stream first,
      // or tokens keep arriving for rows that no longer exist.
      if (get().activeId === id && activeChatController) activeChatController.abort();

      await deleteConversationRemote(id);
      void disposeChatSession(id);

      set((s) => {
        const stillActive = s.activeId === id ? null : s.activeId;
        return {
          conversations: s.conversations.filter((c) => c.id !== id),
          activeId: stillActive,
          messages: stillActive ? s.messages : [],
          followUps: stillActive ? s.followUps : [],
          canvasArtifact: stillActive ? s.canvasArtifact : null,
        };
      });
    },

    openCanvas(artifact) {
      set({ canvasArtifact: artifact });
    },

    closeCanvas() {
      set({ canvasArtifact: null });
    },

    consumePendingScroll() {
      const id = get().pendingScrollToMessageId;
      if (id) set({ pendingScrollToMessageId: null });
      return id;
    },

    notify(message) {
      set({ lastNotice: message });
    },

    async compactConversation() {
      const { activeId, messages, conversations } = get();
      if (!activeId || messages.length < 3) return;

      set({ status: "loading-model" });

      try {
        const olderMessages = messages.slice(0, -2);
        const recentMessages = messages.slice(-2);

        const queries = olderMessages
          .flatMap((m) =>
            m.parts.filter((p): p is ToolPart => p.kind === "tool" && p.name === "run_sql"),
          )
          .map((t) => {
            const q =
              typeof t.params === "object" && t.params && "sql" in t.params
                ? String((t.params as { sql: unknown }).sql)
                : "";
            return q ? `- \`${q.slice(0, 120)}\`` : null;
          })
          .filter(Boolean);

        const summaryPoints: string[] = [];
        summaryPoints.push("### 📌 Contexte archivé et résumé de la session");
        summaryPoints.push(
          "Pour préserver la mémoire du modèle local, les échanges précédents ont été consolidés :\n",
        );
        if (queries.length > 0) {
          summaryPoints.push(
            "**Requêtes exécutées dans l'historique :**\n" + queries.slice(-5).join("\n"),
          );
        }
        summaryPoints.push(
          `**Synthèse :** ${olderMessages.length} messages archivés. Dernières conclusions conservées pour la suite de l'analyse.`,
        );

        const summaryMessage: ChatMessage = {
          id: newId("msg"),
          role: "assistant",
          content: summaryPoints.join("\n\n"),
          parts: [],
          status: "done",
          createdAt: Date.now(),
        };

        const compactedMessages = [summaryMessage, ...recentMessages];
        set({ messages: compactedMessages, followUps: [] });

        await disposeChatSession(activeId).catch(() => {});

        const chatHistory = compactedMessages.map((m) => ({
          role: m.role as ChatSessionRole,
          content: m.content,
        }));

        const storedModel = conversations.find((c) => c.id === activeId)?.model;
        const pinnedModel = storedModel ? basenameModel(storedModel) : undefined;

        await openChatSession({
          conversationId: activeId,
          modelFile: pinnedModel,
          systemPrompt: getMoudirSystemPrompt(),
          history: chatHistory,
        });

        get().notify(
          "Mémoire du modèle compactée : historique condensé pour préserver le contexte.",
        );
      } catch {
        get().notify("Échec du compactage de la mémoire.");
      } finally {
        set({ status: "idle" });
      }
    },

    addFilter(filter) {
      set((s) => {
        const remaining = s.activeFilters.filter((f) => f.field !== filter.field);
        return { activeFilters: [...remaining, filter] };
      });
    },

    removeFilter(field) {
      set((s) => ({
        activeFilters: s.activeFilters.filter((f) => f.field !== field),
      }));
    },

    clearFilters() {
      set({ activeFilters: [] });
    },
  };
});
