/**
 * Moudir chat-session runtime — Electron MAIN process (Phase A2).
 *
 * Holds one live `LlamaChatSession` per conversation so the KV cache survives
 * across turns (repeated `session.prompt()` reuses it; `contextShift` is
 * automatic). Sessions are capped at MAX_LIVE_SESSIONS (medium PCs) with LRU
 * eviction; an evicted conversation is rebuilt losslessly later from chat.db
 * rows via `setChatHistory` (only the divergent suffix re-evaluates).
 *
 * Split from llama-service.ts on purpose: that module owns the model/llama
 * lifecycle + the one-shot generate/generateStructured lanes; this one owns
 * conversation state and the tool loop. It reuses llama-service's seams
 * (`getLoadedModel`, `enqueueLlamaTask`, `generateStructured`) instead of
 * duplicating them.
 *
 * Tool rules (small-model reliability, node-llama-cpp 3.19):
 * - chat turns use `functions` + free prose — NEVER `grammar` (mutually
 *   exclusive per prompt() call). Title/follow-ups are separate
 *   grammar-constrained side-calls through llama-service's shared context.
 * - all tool params are generation-level enforced (GBNF object schemas make
 *   every property required by construction) and each carries a description.
 * - handlers return human-readable strings on error — never throw — so the
 *   model can read the failure and self-correct.
 */

import type {
  ChatHistoryItem,
  ChatModelFunctionCall,
  LlamaChatSession,
  LlamaContext,
  LlamaContextSequence,
} from "node-llama-cpp";
import * as duckdbService from "./duckdb-service";
import * as llamaService from "./llama-service";

// ─── Types ──────────────────────────────────────────────────────────────────

export type ChatToolEvent = {
  name: string;
  params: unknown;
  resultSummary: string;
  durationMs: number;
};

export type ChatHistoryRowInput = {
  role: "user" | "assistant" | "tool";
  content: string;
  /** Optional tool metadata ({name, params, result}) when a caller has it. */
  parts?: unknown;
};

export type OpenSessionInput = {
  conversationId: string;
  modelFile?: string;
  systemPrompt?: string;
  /** chat.db rows to rehydrate the model's history from (oldest first). */
  history?: ChatHistoryRowInput[];
};

export type PromptSessionInput = {
  conversationId: string;
  text: string;
  requestId?: string;
  onToken?: (chunk: string) => void;
  onTool?: (event: ChatToolEvent) => void;
  signal?: AbortSignal;
};

export type PromptSessionResult = {
  text: string;
  toolEvents: ChatToolEvent[];
};

type SessionEntry = {
  session: LlamaChatSession;
  context: LlamaContext;
  sequence: LlamaContextSequence;
  /** Resolved GGUF path the session's context was created on. */
  modelPath: string;
  systemPrompt: string;
  lastUsed: number;
};

// ─── Constants ──────────────────────────────────────────────────────────────

/** Live sessions cap — 2 KV-cache contexts is the medium-PC memory budget. */
const MAX_LIVE_SESSIONS = 2;
const CHAT_CONTEXT_SIZE = 4096;
/** Prose answers; tool round-trips consume part of this budget too. */
const CHAT_MAX_TOKENS = 1024;
/** run_sql output caps — the model reads this, keep it small and honest. */
const TOOL_MAX_ROWS = 50;
const TOOL_MAX_CHARS = 8_000;
/** Cap the tool-event summary streamed to the renderer. */
const TOOL_SUMMARY_MAX_CHARS = 300;
/** Transcript budget for the title/follow-up side-calls. */
const SIDECALL_TRANSCRIPT_MAX_CHARS = 4_000;

const DEFAULT_SYSTEM_PROMPT = [
  "Tu es Moudir, analyste de données hors-ligne. Tu travailles sur des données locales via DuckDB.",
  "Outils disponibles:",
  "- run_sql(sql): exécute une requête SQL DuckDB en lecture seule et retourne les lignes.",
  "- get_schema(): liste les jeux de données enregistrés avec leurs colonnes et types.",
  "- profile_column(table, column): statistiques d'une colonne (min, max, distincts, nulls).",
  "- make_chart(chart_type, x, y, aggregate, title): prépare un graphique affiché par l'application.",
  "Commence par get_schema si tu ne connais pas les tables.",
  "Réponds dans la langue de l'utilisateur (français par défaut), de façon concise.",
  "Ne cite que des chiffres provenant des résultats d'outils.",
].join("\n");

// ─── Session registry (Map insertion order = LRU order) ─────────────────────

const sessions = new Map<string, SessionEntry>();

function requireSession(conversationId: string): SessionEntry {
  const entry = sessions.get(conversationId);
  if (!entry) {
    throw new Error(
      `No open chat session for conversation "${conversationId}" — call chat:open first.`,
    );
  }
  // LRU refresh: re-insert at the tail.
  sessions.delete(conversationId);
  sessions.set(conversationId, entry);
  entry.lastUsed = Date.now();
  return entry;
}

async function disposeNative(entry: SessionEntry): Promise<void> {
  try {
    entry.sequence.dispose();
  } catch {
    // best-effort
  }
  try {
    await entry.context.dispose();
  } catch {
    // best-effort
  }
}

async function evictOverCap(): Promise<void> {
  while (sessions.size > MAX_LIVE_SESSIONS) {
    const oldestId = sessions.keys().next().value;
    if (oldestId === undefined) break;
    const entry = sessions.get(oldestId);
    sessions.delete(oldestId);
    if (entry) await disposeNative(entry);
  }
}

// ─── History rehydration (chat.db rows → ChatHistoryItem[]) ─────────────────

function toFunctionCall(row: ChatHistoryRowInput): ChatModelFunctionCall {
  const parts = (row.parts ?? {}) as { name?: unknown; params?: unknown; result?: unknown };
  return {
    type: "functionCall",
    name: typeof parts.name === "string" && parts.name.length > 0 ? parts.name : "tool",
    params: parts.params ?? {},
    result: parts.result ?? row.content,
  };
}

/**
 * Map chat-store rows onto node-llama-cpp's ChatHistoryItem shape. "user" and
 * "assistant" map directly; "tool" rows fold into the assistant flow as
 * functionCall entries — buffered until the next assistant text lands (the
 * faithful in-turn order: calls happen BEFORE the final prose), or attached to
 * the previous model response when they trail the conversation.
 */
function toChatHistory(systemPrompt: string, rows: ChatHistoryRowInput[]): ChatHistoryItem[] {
  const items: ChatHistoryItem[] = [{ type: "system", text: systemPrompt }];
  let pendingCalls: ChatModelFunctionCall[] = [];

  for (const row of rows) {
    if (row.role === "tool") {
      pendingCalls = [...pendingCalls, toFunctionCall(row)];
      continue;
    }
    if (row.role === "assistant") {
      items.push({ type: "model", response: [...pendingCalls, row.content] });
      pendingCalls = [];
      continue;
    }
    // user — flush dangling tool calls as a text-less model turn first.
    if (pendingCalls.length > 0) {
      items.push({ type: "model", response: [...pendingCalls] });
      pendingCalls = [];
    }
    items.push({ type: "user", text: row.content });
  }

  if (pendingCalls.length > 0) {
    const last = items.at(-1);
    if (last?.type === "model") {
      items[items.length - 1] = { type: "model", response: [...last.response, ...pendingCalls] };
    } else {
      items.push({ type: "model", response: [...pendingCalls] });
    }
  }
  return items;
}

// ─── Tool implementations ────────────────────────────────────────────────────

function truncateText(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (value instanceof Date) return value.toISOString();
  return truncateText(String(value), 120);
}

/**
 * Append `LIMIT` when the statement is limit-able and has none — the model
 * routinely asks for whole tables. +1 over the display cap so truncation is
 * detectable without a second COUNT query.
 */
function injectLimit(sql: string): string {
  const trimmed = sql.trim().replace(/;+\s*$/, "");
  if (/\blimit\s+\d+/i.test(trimmed)) return trimmed;
  const upper = trimmed.toUpperCase();
  const limitable = ["SELECT", "WITH", "FROM", "TABLE", "VALUES", "PIVOT", "UNPIVOT"].some((k) =>
    upper.startsWith(k),
  );
  if (!limitable) return trimmed;
  return `${trimmed} LIMIT ${TOOL_MAX_ROWS + 1}`;
}

/** Compact pipe-separated table the model can actually read. */
function formatRows(rows: Record<string, unknown>[]): string {
  const overRowCap = rows.length > TOOL_MAX_ROWS;
  const visible = rows.slice(0, TOOL_MAX_ROWS);
  if (visible.length === 0) return "0 ligne.";

  const columns = Object.keys(visible[0]);
  const lines = [columns.join(" | ")];
  for (const row of visible) {
    lines.push(columns.map((c) => formatCell(row[c])).join(" | "));
  }

  let body = lines.join("\n");
  const overCharCap = body.length > TOOL_MAX_CHARS;
  if (overCharCap) body = body.slice(0, TOOL_MAX_CHARS);

  const header = overRowCap
    ? `${TOOL_MAX_ROWS}+ lignes (résultat tronqué aux ${TOOL_MAX_ROWS} premières)`
    : `${visible.length} ligne(s)`;
  const notice = overRowCap || overCharCap ? "\n[Résultat tronqué]" : "";
  return `${header}\n${body}${notice}`;
}

async function runSqlTool(params: { sql: string }): Promise<string> {
  // Same read-only guard as "duckdb:runReadOnlyQuery": runReadOnlyQuery()
  // applies assertReadOnlySql internally (allowlist + blocked functions).
  const rows = await duckdbService.runReadOnlyQuery(injectLimit(params.sql));
  return formatRows(rows);
}

async function getSchemaTool(): Promise<string> {
  const datasets = await duckdbService.listDatasets();
  if (datasets.length === 0) {
    return "Aucun jeu de données enregistré. L'utilisateur doit d'abord importer un fichier.";
  }
  const lines = datasets.map(
    (d) =>
      `${d.viewName} (« ${d.displayName} », ${d.rowCount} lignes): ${d.columns
        .map((c) => `${c.name} ${c.type}`)
        .join(", ")}`,
  );
  return truncateText(lines.join("\n"), TOOL_MAX_CHARS);
}

async function profileColumnTool(params: { table: string; column: string }): Promise<string> {
  const table = quoteIdentifier(params.table);
  const column = quoteIdentifier(params.column);
  const rows = await duckdbService.runReadOnlyQuery(
    `SELECT min(${column}) AS "min", max(${column}) AS "max", ` +
      `count(DISTINCT ${column}) AS "distincts", ` +
      `count(*) - count(${column}) AS "nulls", count(*) AS "total" FROM ${table}`,
  );
  const r = rows[0] ?? {};
  return (
    `${params.column} (${params.table}): min=${formatCell(r.min)}, max=${formatCell(r.max)}, ` +
    `distincts=${formatCell(r.distincts)}, nulls=${formatCell(r.nulls)}, total=${formatCell(r.total)}`
  );
}

export type MakeChartParams = {
  chart_type: "bar" | "line" | "area" | "pie" | "scatter" | "heatmap";
  x: string;
  y: string;
  aggregate: "none" | "count" | "sum" | "avg" | "min" | "max";
  title: string;
};

/**
 * make_chart deliberately does NOT execute anything: the params surface to the
 * renderer as a toolEvent and the RENDERER builds the ECharts artifact —
 * keeping chart libs out of the main process.
 */
async function makeChartTool(params: MakeChartParams): Promise<string> {
  return `Graphique préparé: ${params.title}`;
}

/**
 * Build the per-prompt tool set. Every handler invocation pushes a
 * ChatToolEvent (name/params/resultSummary/durationMs) AND streams it via
 * `onEvent` immediately; errors become readable strings fed back to the model.
 */
async function buildTools(onEvent: (event: ChatToolEvent) => void) {
  const { defineChatSessionFunction } = await import("node-llama-cpp");

  const wrap = <P>(name: string, handler: (params: P) => Promise<string>) => {
    return async (params: P): Promise<string> => {
      const start = Date.now();
      let result: string;
      try {
        result = await handler(params);
      } catch (error) {
        result = `Erreur ${name}: ${error instanceof Error ? error.message : String(error)}`;
      }
      onEvent({
        name,
        params,
        resultSummary: truncateText(result, TOOL_SUMMARY_MAX_CHARS),
        durationMs: Date.now() - start,
      });
      return result;
    };
  };

  return {
    run_sql: defineChatSessionFunction({
      description:
        "Exécute une requête SQL DuckDB en lecture seule (SELECT/WITH/SUMMARIZE/DESCRIBE) et retourne les lignes.",
      params: {
        type: "object",
        properties: {
          sql: {
            type: "string",
            description: "La requête SQL DuckDB en lecture seule à exécuter.",
          },
        },
      } as const,
      handler: wrap("run_sql", runSqlTool),
    }),
    get_schema: defineChatSessionFunction({
      description:
        "Liste les jeux de données enregistrés avec leurs colonnes et types. À appeler avant d'écrire du SQL.",
      params: { type: "object", properties: {} } as const,
      handler: wrap("get_schema", getSchemaTool),
    }),
    profile_column: defineChatSessionFunction({
      description:
        "Statistiques d'une colonne d'une table: min, max, valeurs distinctes, nulls, total.",
      params: {
        type: "object",
        properties: {
          table: { type: "string", description: "Nom de la table (vue DuckDB) à profiler." },
          column: { type: "string", description: "Nom de la colonne à profiler." },
        },
      } as const,
      handler: wrap("profile_column", profileColumnTool),
    }),
    make_chart: defineChatSessionFunction({
      description:
        "Prépare un graphique que l'application affichera à l'utilisateur. N'exécute rien: fournis les colonnes et le type de graphique.",
      params: {
        type: "object",
        properties: {
          chart_type: {
            enum: ["bar", "line", "area", "pie", "scatter", "heatmap"],
            description: "Type de graphique.",
          },
          x: { type: "string", description: "Colonne pour l'axe X (dimension)." },
          y: { type: "string", description: "Colonne pour l'axe Y (mesure)." },
          aggregate: {
            enum: ["none", "count", "sum", "avg", "min", "max"],
            description: "Agrégation appliquée à la mesure Y.",
          },
          title: { type: "string", description: "Titre court du graphique." },
        },
      } as const,
      handler: wrap("make_chart", async (params) => makeChartTool(params as MakeChartParams)),
    }),
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Open (or rehydrate) the live session for a conversation. Idempotent for an
 * already-open conversation on the same model; passing `history` re-syncs the
 * model-side history from chat.db rows (cheap snapshot — only the divergent
 * suffix re-evaluates on the next prompt).
 */
export async function openSession(
  input: OpenSessionInput,
): Promise<{ model: string; reused: boolean }> {
  const systemPrompt = input.systemPrompt?.trim()
    ? input.systemPrompt.trim()
    : DEFAULT_SYSTEM_PROMPT;
  const { model, modelPath } = await llamaService.getLoadedModel(input.modelFile);

  // getLoadedModel() may have SWITCHED the loaded model (llama-service disposes
  // the previous one) — sessions created on another model hold dead contexts.
  for (const [id, entry] of [...sessions]) {
    if (entry.modelPath !== modelPath) {
      sessions.delete(id);
      await disposeNative(entry);
    }
  }

  const existing = sessions.get(input.conversationId);
  if (existing) {
    if (input.history) existing.session.setChatHistory(toChatHistory(systemPrompt, input.history));
    requireSession(input.conversationId); // LRU refresh
    return { model: modelPath, reused: true };
  }

  const { LlamaChatSession } = await import("node-llama-cpp");
  const context = await model.createContext({ contextSize: CHAT_CONTEXT_SIZE });
  const sequence = context.getSequence();
  const session = new LlamaChatSession({
    contextSequence: sequence,
    systemPrompt,
    autoDisposeSequence: false,
  });
  if (input.history) session.setChatHistory(toChatHistory(systemPrompt, input.history));

  sessions.set(input.conversationId, {
    session,
    context,
    sequence,
    modelPath,
    systemPrompt,
    lastUsed: Date.now(),
  });
  await evictOverCap();
  return { model: modelPath, reused: false };
}

/**
 * One chat turn: prose + tools (functions and grammar are mutually exclusive —
 * this lane NEVER passes a grammar). Serialized on llama-service's single
 * generation queue so it can't overlap a swarm/structured call.
 */
export async function promptSession(input: PromptSessionInput): Promise<PromptSessionResult> {
  const entry = requireSession(input.conversationId);

  return llamaService.enqueueLlamaTask(async () => {
    if (input.signal?.aborted) {
      const error = new Error("Chat prompt aborted");
      error.name = "AbortError";
      throw error;
    }

    const toolEvents: ChatToolEvent[] = [];
    const functions = await buildTools((event) => {
      toolEvents.push(event);
      input.onTool?.(event);
    });

    const text = await entry.session.prompt(input.text, {
      functions,
      documentFunctionParams: true,
      maxTokens: CHAT_MAX_TOKENS,
      onTextChunk: (chunk: string) => input.onToken?.(chunk),
      signal: input.signal,
      // Return the partial text on abort instead of throwing away the turn.
      stopOnAbortSignal: true,
    });

    entry.lastUsed = Date.now();
    return { text, toolEvents };
  });
}

/** Pre-evaluate the drafted user prompt into KV (near-instant first token). */
export async function preloadSessionPrompt(conversationId: string, text: string): Promise<void> {
  const entry = requireSession(conversationId);
  await llamaService.enqueueLlamaTask(async () => {
    await entry.session.preloadPrompt(text);
  });
}

/** Cheap JSON snapshot of the live model-side history (chat.db save path). */
export function getSessionHistory(conversationId: string): ChatHistoryItem[] {
  return requireSession(conversationId).session.getChatHistory();
}

// ─── Structured side-calls (grammar-only — separate from the chat session) ───

/**
 * Flatten the live session's history into a compact transcript for the
 * grammar-constrained side-calls (they run on llama-service's shared context +
 * a fresh sequence, never on the chat session's sequence).
 */
function transcriptFor(conversationId: string): string {
  const entry = sessions.get(conversationId);
  if (!entry) {
    throw new Error(
      `No open chat session for conversation "${conversationId}" — call chat:open first.`,
    );
  }
  const history = entry.session.getChatHistory();
  const lines: string[] = [];
  for (const item of history) {
    if (item.type === "user") lines.push(`Utilisateur: ${item.text}`);
    else if (item.type === "model") {
      const text = item.response
        .filter((part): part is string => typeof part === "string")
        .join(" ")
        .trim();
      if (text) lines.push(`Moudir: ${text}`);
    }
  }
  const joined = lines.join("\n");
  return joined.length > SIDECALL_TRANSCRIPT_MAX_CHARS
    ? joined.slice(-SIDECALL_TRANSCRIPT_MAX_CHARS)
    : joined;
}

/** Tiny grammar-constrained call → short conversation title. */
export async function generateTitle(conversationId: string): Promise<string> {
  const transcript = transcriptFor(conversationId);
  const result = (await llamaService.generateStructured({
    prompt:
      `Conversation:\n${transcript}\n\n` +
      'Donne un titre très court (3 à 6 mots, même langue que la conversation). Réponds en JSON: {"title": "..."}',
    jsonSchema: {
      type: "object",
      properties: { title: { type: "string", maxLength: 80 } },
      required: ["title"],
    },
    maxTokens: 64,
  })) as { title?: unknown };
  const title = typeof result?.title === "string" ? result.title.trim() : "";
  return title.length > 0 ? truncateText(title, 120) : "Nouvelle conversation";
}

/** Tiny grammar-constrained call → 2-3 suggested follow-up questions. */
export async function suggestFollowUps(conversationId: string): Promise<string[]> {
  const transcript = transcriptFor(conversationId);
  const result = (await llamaService.generateStructured({
    prompt:
      `Conversation:\n${transcript}\n\n` +
      "Propose 2 à 3 questions de suivi courtes que l'utilisateur pourrait poser ensuite " +
      '(même langue que la conversation). Réponds en JSON: {"questions": ["...", "..."]}',
    jsonSchema: {
      type: "object",
      properties: {
        questions: {
          type: "array",
          items: { type: "string", maxLength: 160 },
          minItems: 2,
          maxItems: 3,
        },
      },
      required: ["questions"],
    },
    maxTokens: 192,
  })) as { questions?: unknown };
  if (!Array.isArray(result?.questions)) return [];
  return result.questions
    .filter((q): q is string => typeof q === "string" && q.trim().length > 0)
    .map((q) => truncateText(q.trim(), 200))
    .slice(0, 3);
}

// ─── Disposal ────────────────────────────────────────────────────────────────

/** Dispose one conversation's live session (context + sequence). */
export async function disposeSession(conversationId: string): Promise<boolean> {
  const entry = sessions.get(conversationId);
  if (!entry) return false;
  sessions.delete(conversationId);
  await disposeNative(entry);
  return true;
}

/** Dispose everything — called from main.ts app-quit next to closeChatStore(). */
export async function disposeAll(): Promise<void> {
  const entries = [...sessions.values()];
  sessions.clear();
  for (const entry of entries) {
    await disposeNative(entry);
  }
}
