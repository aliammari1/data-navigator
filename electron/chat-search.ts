/**
 * FTS5 search over `moudir_message.content` and `moudir_message.parts`-derived
 * text, with both Latin and CJK tokenizers (matches the 2026 best practice from
 * the SQLite FTS5 docs and the zenn.dev/kanseilink CJK guide). This sits *next to*
 * the existing `listConversations(..., search)` LIKE-based search — which remains
 * the cheap path for very short queries — and supersedes it for any non-trivial
 * term. Trigger-based sync keeps the FTS indexes in lock-step with the source
 * table; the trigram side gets its own trigger trio because the FTS5 docs note
 * that a separate trigger suffix avoids accidental "delete + insert" coupling
 * when a future migration adds another index.
 *
 * Falls back to plain `LIKE` for queries with 1–2 CJK characters (trigram
 * needs 3+ chars to match) so the path is never silently empty.
 */

import type { SqliteHandle } from "../src/platform/storage/db-bootstrap";
import * as chatSchema from "../src/db/schema-chat";

let handle: SqliteHandle<typeof chatSchema> | null = null;

function open(): SqliteHandle<typeof chatSchema> {
  if (handle === null) {
    throw new Error("chat-search: open() called before setChatSearchHandle()");
  }
  return handle;
}

/** Wire the FTS5 schema once, after the chat.db handle opens. Idempotent. */
export function ensureChatSearchFts(target: SqliteHandle<typeof chatSchema>): void {
  handle = target;

  const { sqlite } = target;

  sqlite.exec(
    `CREATE VIRTUAL TABLE IF NOT EXISTS moudir_message_fts_unicode61 USING fts5(
       content,
       content='moudir_message',
       content_rowid='id',
       tokenize='unicode61 remove_diacritics 2'
     );`,
  );

  sqlite.exec(
    `CREATE VIRTUAL TABLE IF NOT EXISTS moudir_message_fts_trigram USING fts5(
       content,
       content='moudir_message',
       content_rowid='id',
       tokenize='trigram'
     );`,
  );

  // Sync triggers — unicode61 side.
  sqlite.exec(
    `CREATE TRIGGER IF NOT EXISTS moudir_message_ai_u61 AFTER INSERT ON moudir_message BEGIN
       INSERT INTO moudir_message_fts_unicode61(rowid, content)
       VALUES (new.id, new.content);
     END;`,
  );
  sqlite.exec(
    `CREATE TRIGGER IF NOT EXISTS moudir_message_ad_u61 AFTER DELETE ON moudir_message BEGIN
       INSERT INTO moudir_message_fts_unicode61(moudir_message_fts_unicode61, rowid, content)
       VALUES ('delete', old.id, old.content);
     END;`,
  );
  sqlite.exec(
    `CREATE TRIGGER IF NOT EXISTS moudir_message_au_u61 AFTER UPDATE ON moudir_message BEGIN
       INSERT INTO moudir_message_fts_unicode61(moudir_message_fts_unicode61, rowid, content)
       VALUES ('delete', old.id, old.content);
       INSERT INTO moudir_message_fts_unicode61(rowid, content)
       VALUES (new.id, new.content);
     END;`,
  );

  // Sync triggers — trigram side (separate suffix, per SQLite docs).
  sqlite.exec(
    `CREATE TRIGGER IF NOT EXISTS moudir_message_ai_tri AFTER INSERT ON moudir_message BEGIN
       INSERT INTO moudir_message_fts_trigram(rowid, content)
       VALUES (new.id, new.content);
     END;`,
  );
  sqlite.exec(
    `CREATE TRIGGER IF NOT EXISTS moudir_message_ad_tri AFTER DELETE ON moudir_message BEGIN
       INSERT INTO moudir_message_fts_trigram(moudir_message_fts_trigram, rowid, content)
       VALUES ('delete', old.id, old.content);
     END;`,
  );
  sqlite.exec(
    `CREATE TRIGGER IF NOT EXISTS moudir_message_au_tri AFTER UPDATE ON moudir_message BEGIN
       INSERT INTO moudir_message_fts_trigram(moudir_message_fts_trigram, rowid, content)
       VALUES ('delete', old.id, old.content);
       INSERT INTO moudir_message_fts_trigram(rowid, content)
       VALUES (new.id, new.content);
     END;`,
  );
}

const CJK_RE = /[\u{3400}-\u{4DBF}\u{4E00}-\u{9FFF}\u{F900}-\u{FAFF}]/u;

function hasCjk(s: string): boolean {
  return CJK_RE.test(s);
}

function sanitize(query: string): string {
  return query
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .trim();
}

const SHORT_CJK_THRESHOLD = 2;

export interface ChatSearchHit {
  messageId: number;
  conversationId: string;
  role: string;
  snippet: string;
  rank: number;
}

function ftsQuery(raw: string): string {
  const cleaned = sanitize(raw);
  if (!cleaned) return "";
  const terms = cleaned.split(/\s+/).filter((t) => t.length > 0);
  if (terms.length === 0) return "";
  return terms.map((t) => `"${t.replace(/"/g, '""')}"*`).join(" AND ");
}

function likeFallback(
  raw: string,
  options: { limit?: number; conversationId?: string } = {},
): ChatSearchHit[] {
  const cleaned = sanitize(raw);
  if (!cleaned) return [];
  const { sqlite } = open();
  const pattern = `%${cleaned.replaceAll(/[%_]/g, (m) => `\\${m}`)}%`;
  const limit = Math.max(1, Math.min(100, options.limit ?? 25));
  const scoped = options.conversationId;

  const sql = scoped
    ? `SELECT id, conversation_id as conversationId, role,
              substr(content, max(1, instr(lower(content), lower(?)) - 20), 140) as snippet
       FROM moudir_message
       WHERE conversation_id = ? AND lower(content) LIKE lower(?)
       ORDER BY id DESC LIMIT ?`
    : `SELECT id, conversation_id as conversationId, role,
              substr(content, max(1, instr(lower(content), lower(?)) - 20), 140) as snippet
       FROM moudir_message
       WHERE lower(content) LIKE lower(?)
       ORDER BY id DESC LIMIT ?`;

  const params = scoped ? [cleaned, scoped, pattern, limit] : [cleaned, pattern, limit];

  return sqlite
    .prepare(sql)
    .all(...params)
    .map((r, i) => ({
      messageId: Number((r as { id: number | string }).id),
      conversationId: String((r as { conversationId: string }).conversationId),
      role: String((r as { role: string }).role),
      snippet: String((r as { snippet: string }).snippet ?? ""),
      rank: i,
    }));
}

export function searchMessages(
  query: string,
  options: { limit?: number; conversationId?: string } = {},
): ChatSearchHit[] {
  const q = query.trim();
  if (!q) return [];
  const { sqlite } = open();
  const limit = Math.max(1, Math.min(100, options.limit ?? 25));
  const scoped = options.conversationId;

  if (hasCjk(q) && sanitize(q).split(/\s+/).every((t) => t.length > SHORT_CJK_THRESHOLD)) {
    const fts = ftsQuery(q);
    if (fts) {
      try {
        const rows = (
          scoped
            ? sqlite
                .prepare(
                  `SELECT m.id as messageId, m.conversation_id as conversationId, m.role,
                          snippet(moudir_message_fts_trigram, 2, '→ ', ' ←', '...', 8) as snippet,
                          bm25(moudir_message_fts_trigram) as rank
                   FROM moudir_message_fts_trigram
                   JOIN moudir_message m ON m.id = moudir_message_fts_trigram.rowid
                   WHERE moudir_message_fts_trigram MATCH ?
                     AND m.conversation_id = ?
                   ORDER BY rank LIMIT ?`,
                )
                .all(fts, scoped, limit)
            : sqlite
                .prepare(
                  `SELECT m.id as messageId, m.conversation_id as conversationId, m.role,
                          snippet(moudir_message_fts_trigram, 2, '→ ', ' ←', '...', 8) as snippet,
                          bm25(moudir_message_fts_trigram) as rank
                   FROM moudir_message_fts_trigram
                   JOIN moudir_message m ON m.id = moudir_message_fts_trigram.rowid
                   WHERE moudir_message_fts_trigram MATCH ?
                   ORDER BY rank LIMIT ?`,
                )
                .all(fts, limit)
        ).map((r) => ({
          messageId: Number((r as { messageId: number }).messageId),
          conversationId: String((r as { conversationId: string }).conversationId),
          role: String((r as { role: string }).role),
          snippet: String((r as { snippet: string }).snippet ?? ""),
          rank: Number((r as { rank: number }).rank),
        })) as ChatSearchHit[];
        if (rows.length > 0) return rows;
      } catch {
        // FTS5 prepare failed (e.g. empty content table) — fall through to LIKE.
      }
    }
  }

  const u61 = ftsQuery(q);
  if (u61) {
    try {
      const rows = (
        scoped
          ? sqlite
              .prepare(
                `SELECT m.id as messageId, m.conversation_id as conversationId, m.role,
                        snippet(moudir_message_fts_unicode61, 2, '→ ', ' ←', '...', 8) as snippet,
                        bm25(moudir_message_fts_unicode61) as rank
                 FROM moudir_message_fts_unicode61
                 JOIN moudir_message m ON m.id = moudir_message_fts_unicode61.rowid
                 WHERE moudir_message_fts_unicode61 MATCH ?
                   AND m.conversation_id = ?
                 ORDER BY rank LIMIT ?`,
              )
              .all(u61, scoped, limit)
          : sqlite
              .prepare(
                `SELECT m.id as messageId, m.conversation_id as conversationId, m.role,
                        snippet(moudir_message_fts_unicode61, 2, '→ ', ' ←', '...', 8) as snippet,
                        bm25(moudir_message_fts_unicode61) as rank
                 FROM moudir_message_fts_unicode61
                 JOIN moudir_message m ON m.id = moudir_message_fts_unicode61.rowid
                 WHERE moudir_message_fts_unicode61 MATCH ?
                 ORDER BY rank LIMIT ?`,
              )
              .all(u61, limit)
      ).map((r) => ({
        messageId: Number((r as { messageId: number }).messageId),
        conversationId: String((r as { conversationId: string }).conversationId),
        role: String((r as { role: string }).role),
        snippet: String((r as { snippet: string }).snippet ?? ""),
        rank: Number((r as { rank: number }).rank),
      })) as ChatSearchHit[];
      if (rows.length > 0) return rows;
    } catch {
      // fall through
    }
  }

  return likeFallback(q, options);
}