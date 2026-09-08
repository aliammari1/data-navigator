/**
 * Moudir conversation persistence — main-process SQLite (chat.db).
 *
 * The durable backend for the assistant's real chat: conversations survive
 * app restarts, get titles, pinning and search, and every message (including
 * tool-call parts) is replayable so a reopened conversation can restore both
 * the UI thread AND the model's chat history (node-llama-cpp
 * setChatHistory-style rehydration happens in llama-service, not here).
 *
 * Mirrors settings-store.ts discipline exactly:
 *   - never imports `electron` (dirs injected via configureChatStore /
 *     setChatMigrationsFolder) so the module stays unit-testable in plain
 *     Node;
 *   - single lazily-opened WAL connection reused for the app's lifetime;
 *   - one domain = one file (chat.db) under <userData>/databases.
 *
 * Message `parts` is an opaque JSON column (tool calls, artifacts, chart
 * specs). The store does not interpret it — the renderer owns that shape —
 * which keeps schema migrations off this table when message anatomy evolves.
 */

import { mkdirSync } from "node:fs";
import path from "node:path";
import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { openSqliteHandle, type SqliteHandle } from "../src/platform/storage/db-bootstrap";
import * as chatSchema from "../src/db/schema-chat";
import { ensureChatSearchFts } from "./chat-search";

/** Unpinned conversations beyond this cap are pruned oldest-first on create. */
const MAX_UNPINNED_CONVERSATIONS = 200;
const DB_FILE = "chat.db";
/**
 * Default migrations folder, used when the caller does not override via
 * `setChatMigrationsFolder`. `<cwd>/drizzle/chat` works for `pnpm dev` and the
 * smoke tests, where the working directory is the package root. The packaged
 * Electron app should call `setChatMigrationsFolder(path.join(app.getAppPath(),
 * "drizzle", "chat"))` from main.ts so the migrations folder resolves inside
 * the asar — this is the only way to make the path injectable without
 * importing `electron` from this module.
 */
const DEFAULT_MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle", "chat");

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

type Handle = SqliteHandle<typeof chatSchema>;

let baseDir: string | null = null;
let migrationsFolder: string = DEFAULT_MIGRATIONS_FOLDER;
let handle: Handle | null = null;

/** Point the store at the databases directory. Call once from main.ts before any IPC. */
export function configureChatStore(databasesDir: string): void {
  baseDir = databasesDir;
}

/**
 * Override the Drizzle migrations folder. Optional — defaults to
 * `<cwd>/drizzle/chat`, which is correct for `pnpm dev` and the smoke tests.
 * The packaged Electron app should call this from main.ts with
 * `path.join(app.getAppPath(), "drizzle", "chat")` so the migrations folder
 * resolves inside the asar.
 */
export function setChatMigrationsFolder(folder: string): void {
  migrationsFolder = folder;
}

function open(): Handle {
  if (handle) return handle;
  if (!baseDir) throw new Error("chat-store: configureChatStore() was not called");
  mkdirSync(baseDir, { recursive: true });
  handle = openSqliteHandle({
    path: path.join(baseDir, DB_FILE),
    schema: chatSchema,
    migrationsFolder,
  });
  ensureChatSearchFts(handle);
  return handle;
}

type MessageAppendedHook = (row: ChatMessageRow) => void;
const messageAppendedHooks: MessageAppendedHook[] = [];

/** Hook pattern keeps chat-store decoupled from the embedding lane — main.ts
 * registers the semantic-search indexer here and the store just fires it. */
export function onMessageAppended(hook: MessageAppendedHook): () => void {
  messageAppendedHooks.push(hook);
  return () => {
    const idx = messageAppendedHooks.indexOf(hook);
    if (idx >= 0) messageAppendedHooks.splice(idx, 1);
  };
}

function fireMessageAppended(row: ChatMessageRow): void {
  for (const hook of messageAppendedHooks) {
    try {
      hook(row);
    } catch (error) {
      if (typeof console !== "undefined") {
        console.warn("[chat-store] onMessageAppended hook threw:", error);
      }
    }
  }
}

function toMeta(row: typeof chatSchema.conversation.$inferSelect, messageCount: number): ConversationMeta {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
    pinned: row.pinned,
    datasetId: row.datasetId,
    model: row.model,
    messageCount,
  };
}

// ─── Conversations ───────────────────────────────────────────────────────────

export function createConversation(input: {
  id: string;
  title: string;
  datasetId?: string | null;
  model?: string | null;
}): ConversationMeta {
  const { db } = open();
  const now = new Date();
  const [row] = db
    .insert(chatSchema.conversation)
    .values({
      id: input.id,
      title: input.title,
      createdAt: now,
      updatedAt: now,
      pinned: false,
      datasetId: input.datasetId ?? null,
      model: input.model ?? null,
    })
    .returning()
    .all();
  pruneUnpinned();
  return toMeta(row, 0);
}

/** Pinned first, then most recently active; optional title/content search. */
export function listConversations(limit = 100, search?: string): ConversationMeta[] {
  const { db } = open();
  const cappedLimit = Math.max(1, Math.min(500, Math.floor(limit)));
  const term = search?.trim();

  const counts = db
    .select({
      conversationId: chatSchema.message.conversationId,
      n: sql<number>`count(*)`.as("n"),
    })
    .from(chatSchema.message)
    .groupBy(chatSchema.message.conversationId)
    .all();
  const countById = new Map(counts.map((c) => [c.conversationId, Number(c.n)]));

  let rows: (typeof chatSchema.conversation.$inferSelect)[];
  if (term) {
    const pattern = `%${term.replaceAll(/[%_]/g, (m) => `\\${m}`)}%`;
    const matchingIds = db
      .selectDistinct({ conversationId: chatSchema.message.conversationId })
      .from(chatSchema.message)
      .where(like(chatSchema.message.content, pattern))
      .all()
      .map((r) => r.conversationId);
    rows = db
      .select()
      .from(chatSchema.conversation)
      .where(
        or(
          like(chatSchema.conversation.title, pattern),
          matchingIds.length
            ? sql`${chatSchema.conversation.id} IN (${sql.join(
                matchingIds.map((id) => sql`${id}`),
                sql`, `,
              )})`
            : sql`0`,
        ),
      )
      .orderBy(desc(chatSchema.conversation.pinned), desc(chatSchema.conversation.updatedAt))
      .limit(cappedLimit)
      .all();
  } else {
    rows = db
      .select()
      .from(chatSchema.conversation)
      .orderBy(desc(chatSchema.conversation.pinned), desc(chatSchema.conversation.updatedAt))
      .limit(cappedLimit)
      .all();
  }
  return rows.map((row) => toMeta(row, countById.get(row.id) ?? 0));
}

export function renameConversation(id: string, title: string): void {
  const { db } = open();
  db.update(chatSchema.conversation)
    .set({ title, updatedAt: new Date() })
    .where(eq(chatSchema.conversation.id, id))
    .run();
}

export function setConversationModel(id: string, model: string | null): void {
  const { db } = open();
  db.update(chatSchema.conversation)
    .set({ model, updatedAt: new Date() })
    .where(eq(chatSchema.conversation.id, id))
    .run();
}

export function setConversationPinned(id: string, pinned: boolean): void {
  const { db } = open();
  db.update(chatSchema.conversation)
    .set({ pinned })
    .where(eq(chatSchema.conversation.id, id))
    .run();
}

export function deleteConversation(id: string): void {
  const { db } = open();
  db.delete(chatSchema.message).where(eq(chatSchema.message.conversationId, id)).run();
  db.delete(chatSchema.conversation).where(eq(chatSchema.conversation.id, id)).run();
}

/** Keep the newest MAX_UNPINNED_CONVERSATIONS unpinned conversations. */
function pruneUnpinned(): void {
  const { sqlite } = open();
  sqlite
    .prepare(
      `DELETE FROM moudir_conversation
       WHERE pinned = 0
         AND id NOT IN (
           SELECT id FROM moudir_conversation WHERE pinned = 0
           ORDER BY updated_at DESC LIMIT ?
         )`,
    )
    .run(MAX_UNPINNED_CONVERSATIONS);
  sqlite
    .prepare(
      `DELETE FROM moudir_message
       WHERE conversation_id NOT IN (SELECT id FROM moudir_conversation)`,
    )
    .run();
}

// ─── Messages ────────────────────────────────────────────────────────────────

export function appendMessage(input: {
  conversationId: string;
  role: ChatRole;
  content: string;
  parts?: unknown;
}): ChatMessageRow {
  const { db } = open();
  const now = new Date();
  const [row] = db
    .insert(chatSchema.message)
    .values({
      conversationId: input.conversationId,
      role: input.role,
      content: input.content,
      parts: input.parts ?? null,
      createdAt: now,
    })
    .returning()
    .all();
  db.update(chatSchema.conversation)
    .set({ updatedAt: now })
    .where(eq(chatSchema.conversation.id, input.conversationId))
    .run();
  const result: ChatMessageRow = {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role as ChatRole,
    content: row.content,
    parts: row.parts,
    createdAt: row.createdAt.getTime(),
  };
  fireMessageAppended(result);
  return result;
}

export function getMessages(conversationId: string, limit = 500): ChatMessageRow[] {
  const { db } = open();
  const cappedLimit = Math.max(1, Math.min(2000, Math.floor(limit)));
  return db
    .select()
    .from(chatSchema.message)
    .where(and(eq(chatSchema.message.conversationId, conversationId)))
    .orderBy(chatSchema.message.id)
    .limit(cappedLimit)
    .all()
    .map((row) => ({
      id: row.id,
      conversationId: row.conversationId,
      role: row.role as ChatRole,
      content: row.content,
      parts: row.parts,
      createdAt: row.createdAt.getTime(),
    }));
}

export function closeChatStore(): void {
  handle?.sqlite.close();
  handle = null;
}

/** Sibling modules (e.g. the semantic-search indexer) run on the same
 * SQLite connection so the chat row + embedding row stay in one WAL. */
export function getChatStoreHandle(): Handle {
  return open();
}
