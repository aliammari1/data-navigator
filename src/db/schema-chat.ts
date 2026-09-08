/**
 * Drizzle schema for the chat history database (chat.db under
 * <userData>/databases). Moudir conversation + message rows.
 *
 * Extracted from `electron/chat-store.ts` so that `drizzle-kit generate`
 * can introspect the schema and produce versioned migrations. The runtime
 * `openSqliteHandle` runs those migrations at boot via the standard
 * `migrate()` from `drizzle-orm/better-sqlite3/migrator`.
 */

import { type InferInsertModel, type InferSelectModel, relations, sql } from "drizzle-orm";
import { blob, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const conversation = sqliteTable(
  "moudir_conversation",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
    datasetId: text("dataset_id"),
    model: text("model"),
  },
  (table) => [index("moudir_conversation_updated_idx").on(table.pinned, table.updatedAt)],
);

export const message = sqliteTable(
  "moudir_message",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    parts: text("parts", { mode: "json" }).$type<unknown>(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
  },
  (table) => [
    index("moudir_message_conversation_idx").on(table.conversationId, table.id),
    index("moudir_message_conversation_fk_idx").on(table.conversationId),
  ],
);

export const conversationRelations = relations(conversation, ({ many }) => ({
  messages: many(message),
  embeddings: many(messageEmbedding),
}));

export const messageRelations = relations(message, ({ one }) => ({
  conversation: one(conversation, {
    fields: [message.conversationId],
    references: [conversation.id],
  }),
  embedding: one(messageEmbedding, {
    fields: [message.id],
    references: [messageEmbedding.messageId],
  }),
}));

export const messageEmbedding = sqliteTable(
  "moudir_message_embedding",
  {
    messageId: integer("message_id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    dim: integer("dim").notNull(),
    vector: blob("vector", { mode: "buffer" }).notNull(),
    model: text("model").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
  },
  (table) => [index("moudir_message_embedding_conv_idx").on(table.conversationId)],
);

export const messageEmbeddingRelations = relations(messageEmbedding, ({ one }) => ({
  message: one(message, {
    fields: [messageEmbedding.messageId],
    references: [message.id],
  }),
  conversation: one(conversation, {
    fields: [messageEmbedding.conversationId],
    references: [conversation.id],
  }),
}));

export type Conversation = InferSelectModel<typeof conversation>;
export type NewConversation = InferInsertModel<typeof conversation>;
export type Message = InferSelectModel<typeof message>;
export type NewMessage = InferInsertModel<typeof message>;
export type MessageEmbedding = InferSelectModel<typeof messageEmbedding>;
export type NewMessageEmbedding = InferInsertModel<typeof messageEmbedding>;
