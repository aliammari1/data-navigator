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
 *   - never imports `electron` (dir injected via configureChatStore) so the
 *     module stays unit-testable in plain Node;
 *   - single lazily-opened WAL connection reused for the app's lifetime;
 *   - one domain = one file (chat.db) under <userData>/databases.
 *
 * Message `parts` is an opaque JSON column (tool calls, artifacts, chart
 * specs). The store does not interpret it — the renderer owns that shape —
 * which keeps schema migrations off this table when message anatomy evolves.
 */

import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

const conversation = sqliteTable(
  "moudir_conversation",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
    /** Dataset the conversation was anchored to (context restore hint). */
    datasetId: text("dataset_id"),
    /** GGUF model file the conversation ran on (display + continuity hint). */
    model: text("model"),
  },
  (table) => [index("moudir_conversation_updated_idx").on(table.pinned, table.updatedAt)],
);

const message = sqliteTable(
  "moudir_message",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    conversationId: text("conversation_id").notNull(),
    role: text("role").notNull(),
    content: text("content").notNull(),
    /** Opaque JSON: tool calls, artifacts, chart specs — renderer-owned shape. */
    parts: text("parts", { mode: "json" }).$type<unknown>(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
  },
  (table) => [index("moudir_message_conversation_idx").on(table.conversationId, table.id)],
);

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS moudir_conversation (
  id text PRIMARY KEY,
  title text NOT NULL,
  created_at integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  updated_at integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  pinned integer DEFAULT 0 NOT NULL,
  dataset_id text,
  model text
);
CREATE INDEX IF NOT EXISTS moudir_conversation_updated_idx
  ON moudir_conversation (pinned, updated_at);

CREATE TABLE IF NOT EXISTS moudir_message (
  id integer PRIMARY KEY AUTOINCREMENT,
  conversation_id text NOT NULL,
  role text NOT NULL,
  content text NOT NULL,
  parts text,
  created_at integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
CREATE INDEX IF NOT EXISTS moudir_message_conversation_idx
  ON moudir_message (conversation_id, id);
`;

/** Unpinned conversations beyond this cap are pruned oldest-first on create. */
const MAX_UNPINNED_CONVERSATIONS = 200;
const DB_FILE = "chat.db";

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

type Handle = {
  db: ReturnType<typeof drizzle<{ conversation: typeof conversation; message: typeof message }>>;
  sqlite: Database.Database;
};

let baseDir: string | null = null;
let handle: Handle | null = null;

/** Point the store at the databases directory. Call once from main.ts before any IPC. */
export function configureChatStore(databasesDir: string): void {
  baseDir = databasesDir;
}

function open(): Handle {
  if (handle) return handle;
  if (!baseDir) throw new Error("chat-store: configureChatStore() was not called");
  mkdirSync(baseDir, { recursive: true });
  const sqlite = new Database(path.join(baseDir, DB_FILE));
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(SCHEMA_SQL);
  handle = { db: drizzle({ client: sqlite, schema: { conversation, message } }), sqlite };
  return handle;
}

function toMeta(row: typeof conversation.$inferSelect, messageCount: number): ConversationMeta {
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
    .insert(conversation)
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
      conversationId: message.conversationId,
      n: sql<number>`count(*)`.as("n"),
    })
    .from(message)
    .groupBy(message.conversationId)
    .all();
  const countById = new Map(counts.map((c) => [c.conversationId, Number(c.n)]));

  let rows: (typeof conversation.$inferSelect)[];
  if (term) {
    const pattern = `%${term.replaceAll(/[%_]/g, (m) => `\\${m}`)}%`;
    const matchingIds = db
      .selectDistinct({ conversationId: message.conversationId })
      .from(message)
      .where(like(message.content, pattern))
      .all()
      .map((r) => r.conversationId);
    rows = db
      .select()
      .from(conversation)
      .where(
        or(
          like(conversation.title, pattern),
          matchingIds.length
            ? sql`${conversation.id} IN (${sql.join(
                matchingIds.map((id) => sql`${id}`),
                sql`, `,
              )})`
            : sql`0`,
        ),
      )
      .orderBy(desc(conversation.pinned), desc(conversation.updatedAt))
      .limit(cappedLimit)
      .all();
  } else {
    rows = db
      .select()
      .from(conversation)
      .orderBy(desc(conversation.pinned), desc(conversation.updatedAt))
      .limit(cappedLimit)
      .all();
  }
  return rows.map((row) => toMeta(row, countById.get(row.id) ?? 0));
}

export function renameConversation(id: string, title: string): void {
  const { db } = open();
  db.update(conversation)
    .set({ title, updatedAt: new Date() })
    .where(eq(conversation.id, id))
    .run();
}

export function setConversationPinned(id: string, pinned: boolean): void {
  const { db } = open();
  db.update(conversation).set({ pinned }).where(eq(conversation.id, id)).run();
}

export function deleteConversation(id: string): void {
  const { db } = open();
  db.delete(message).where(eq(message.conversationId, id)).run();
  db.delete(conversation).where(eq(conversation.id, id)).run();
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
    .insert(message)
    .values({
      conversationId: input.conversationId,
      role: input.role,
      content: input.content,
      parts: input.parts ?? null,
      createdAt: now,
    })
    .returning()
    .all();
  db.update(conversation)
    .set({ updatedAt: now })
    .where(eq(conversation.id, input.conversationId))
    .run();
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role as ChatRole,
    content: row.content,
    parts: row.parts,
    createdAt: row.createdAt.getTime(),
  };
}

export function getMessages(conversationId: string, limit = 500): ChatMessageRow[] {
  const { db } = open();
  const cappedLimit = Math.max(1, Math.min(2000, Math.floor(limit)));
  return db
    .select()
    .from(message)
    .where(and(eq(message.conversationId, conversationId)))
    .orderBy(message.id)
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
