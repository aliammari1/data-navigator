/**
 * Semantic search over `moudir_message` via the node-llama-cpp embedding lane.
 *
 * Backed by the existing `electron/embedding-service.ts` (all-MiniLM-L6-v2,
 * 384-dim, L2-normalized — the same contract every other embedding consumer
 * already assumes). Embeddings are stored in `moudir_message_embedding` with
 * the vector as a 32-bit float BLOB; cosine similarity between the query
 * vector and every indexed row is scored in-memory after a single
 * `SELECT message_id, conversation_id, role, substr(content, …), vector` from
 * SQLite.
 *
 * Pipeline:
 *   1. `appendMessageEmbedding(messageId, conversationId, content)` is called
 *      from `chat-store.ts::appendMessage` after a row lands. The embed call
 *      runs on the embedding lane's own queue (see embedding-service.ts), so
 *      it never blocks chat persistence or chat token streaming.
 *   2. `semanticSearchMessages(query, { limit, conversationId })` embeds the
 *      query, then scores every stored embedding in-memory. Cosine between
 *      L2-normalized vectors is a plain dot product — fast and allocation-
 *      light for the 384-dim case (~1.5 KB per row).
 *   3. Misses (no embedding table yet, model not downloaded, every row's
 *      embedding has a different `dim` / `model`) degrade to the existing
 *      BM25 FTS5 path in `chat-search.ts` — the renderer client already
 *      unions the two via `searchMessagesRemote`.
 *
 * The 384-dim FLOAT32 vector is 384 * 4 = 1536 bytes per row. SQLite reads
 * up to 50k rows in a single index seek without breaking a sweat; past
 * ~100k rows we'd want either a vector index (e.g. hnswlib) or an ANN
 * extension, but the chat-history prune cap is 200 conversations × ~50
 * messages = 10k rows. Pure JS is fine.
 */

import { eq } from "drizzle-orm";
import * as chatSchema from "../src/db/schema-chat";
import { type SqliteHandle } from "../src/platform/storage/db-bootstrap";
import { embedOne, ensureEmbedModel } from "./embedding-service";

let handle: SqliteHandle<typeof chatSchema> | null = null;

function open(): SqliteHandle<typeof chatSchema> {
  if (handle === null) {
    throw new Error(
      "chat-semantic-search: open() called before setChatSemanticSearchHandle()",
    );
  }
  return handle;
}

export function setChatSemanticSearchHandle(
  target: SqliteHandle<typeof chatSchema>,
): void {
  handle = target;
}

export interface ChatSemanticSearchHit {
  messageId: number;
  conversationId: string;
  role: string;
  snippet: string;
  score: number;
}

const FLOAT32_BYTES = 4;
const EXPECTED_DIMS = 384;

/** Tight guard: refuse anything that isn't a 384-dim all-MiniLM embedding. */

function assertFits(vector: readonly number[]): void {
  if (vector.length !== EXPECTED_DIMS) {
    throw new Error(
      `chat-semantic-search: embedding has ${vector.length} dims, expected ≤ 384. ` +
        "Refresh the model manifest to match the embedding service's expected dimensionality.",
    );
  }
}

function encodeVector(vector: readonly number[]): Buffer {
  assertFits(vector);
  return Buffer.from(new Float32Array(vector).buffer);
}

/**
 * Host-endian, matching `encodeVector`. The BLOB never leaves this machine
 * (local SQLite file), so host endianness is safe and lets us view the Buffer
 * without copying. Do NOT mix this with readFloatLE/writeFloatLE.
 */
function decodeVector(buf: Buffer): Float32Array {
  if (buf.byteLength % FLOAT32_BYTES !== 0) {
    throw new Error(
      `chat-semantic-search: vector BLOB is ${buf.byteLength} bytes, not a multiple of 4.`,
    );
  }
  // Float32Array views require a 4-byte-aligned offset; better-sqlite3 Buffers
  // usually are, but pooled allocations aren't guaranteed to be.
  if (buf.byteOffset % FLOAT32_BYTES === 0) {
    return new Float32Array(
      buf.buffer,
      buf.byteOffset,
      buf.byteLength / FLOAT32_BYTES,
    );
  }
  const aligned = new Uint8Array(buf.byteLength);
  aligned.set(buf);
  return new Float32Array(aligned.buffer);
}
type Vec = readonly number[] | Float32Array;

/**
 * Dot product. Callers MUST pass equal-length vectors — the length check lives
 * at the call site because TypeScript can't carry it into the loop
 * (noUncheckedIndexedAccess), hence the assertions.
 */
function dot(a: Vec, b: Vec): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] as number) * (b[i] as number);
  return s;
}

function snippet(content: string): string {
  const trimmed = content.trim();
  return trimmed.length > 140 ? `${trimmed.slice(0, 140)}…` : trimmed;
}

/**
 * Embed a single message and persist the vector. Idempotent — re-embedding
 * the same messageId overwrites the previous row (handy when the model is
 * upgraded, since the `model` column changes).
 *
 * Returns `null` when the embedding model isn't staged on disk — the caller
 * treats that as a soft skip and the row simply won't be in the index until
 * the user downloads a model. Search will fall through to FTS5.
 */
export async function appendMessageEmbedding(input: {
  messageId: number;
  conversationId: string;
  content: string;
}): Promise<{ model: string; dims: number; elapsedMs: number } | null> {
  const text = input.content.trim();
  if (!text) return null;

  try {
    const result = await embedOne(text);
    const { db } = open();
    const now = new Date();
    db.insert(chatSchema.messageEmbedding)
      .values({
        messageId: input.messageId,
        conversationId: input.conversationId,
        dim: result.dims,
        vector: encodeVector(result.vector),
        model: result.model,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: chatSchema.messageEmbedding.messageId,
        set: {
          dim: result.dims,
          vector: encodeVector(result.vector),
          model: result.model,
          createdAt: now,
        },
      })
      .run();
    return {
      model: result.model,
      dims: result.dims,
      elapsedMs: result.elapsedMs,
    };
  } catch (error) {
    // Model not downloaded yet — that's fine, the row just won't be indexed.
    if (
      error instanceof Error &&
      /Missing GGUF embedding model/.test(error.message)
    ) {
      return null;
    }
    // Any other failure should not break chat persistence; log and move on.
    if (typeof console !== "undefined") {
      console.warn(
        "[chat-semantic-search] appendMessageEmbedding failed:",
        error,
      );
    }
    return null;
  }
}

/**
 * Backfill embeddings for every message that doesn't have one yet. Returns
 * the number of rows successfully embedded. Safe to call on app start or
 * after a model upgrade — it skips rows that already have a vector matching
 * the current model's `dim` (the cheap fast-path).
 */
export async function backfillMessageEmbeddings(
  options: {
    batchSize?: number | undefined;
    signal?: AbortSignal | undefined;
  } = {},
): Promise<{ indexed: number; skipped: number; failed: number }> {
  const { db } = open();
  const batchSize = Math.max(1, Math.min(64, options.batchSize ?? 8));

  let model: string;
  let dims: number;
  try {
    const ready = await ensureEmbedModel();
    model = ready.model;
    dims = ready.dims;
  } catch {
    return { indexed: 0, skipped: 0, failed: 0 };
  }

  const rows = db
    .select({
      id: chatSchema.message.id,
      conversationId: chatSchema.message.conversationId,
      content: chatSchema.message.content,
      existingModel: chatSchema.messageEmbedding.model,
      existingDim: chatSchema.messageEmbedding.dim,
    })
    .from(chatSchema.message)
    .leftJoin(
      chatSchema.messageEmbedding,
      eq(chatSchema.messageEmbedding.messageId, chatSchema.message.id),
    )
    .all();

  let indexed = 0;
  let skipped = 0;
  let failed = 0;
  const todo: Array<{ id: number; conversationId: string; content: string }> =
    [];
  for (const row of rows) {
    if (row.existingModel === model && row.existingDim === dims) {
      skipped++;
      continue;
    }
    const text = row.content.trim();
    if (!text) {
      skipped++;
      continue;
    }
    todo.push({
      id: row.id,
      conversationId: row.conversationId,
      content: row.content,
    });
  }

  for (let i = 0; i < todo.length; i += batchSize) {
    if (options.signal?.aborted) break;
    const batch = todo.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map((item) =>
        appendMessageEmbedding({
          messageId: item.id,
          conversationId: item.conversationId,
          content: item.content,
        }).catch(() => null),
      ),
    );
    for (const r of results) {
      if (r === null) failed++;
      else indexed++;
    }
  }

  return { indexed, skipped, failed };
}

/**
 * Cosine similarity over every stored embedding. The query vector is L2-
 * normalized (embedding-service already does this), and stored vectors are
 * L2-normalized at append time, so cosine == dot product and the inner loop
 * is a single float multiply-add per dimension.
 *
 * Returns an empty array when the embedding model can't be loaded — the
 * caller (searchMessagesRemote) will fall through to the FTS5 path.
 */
export async function semanticSearchMessages(
  query: string,
  options: {
    limit?: number | undefined;
    conversationId?: string | undefined;
  } = {},
): Promise<ChatSemanticSearchHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  let ready: { model: string; dims: number };
  try {
    ready = await ensureEmbedModel();
  } catch {
    return [];
  }

  const { dims } = ready;
  const queryVec = (await embedOne(trimmed)).vector;
  if (queryVec.length !== dims) return [];

  const { sqlite } = open();
  const limit = Math.max(1, Math.min(100, options.limit ?? 25));
  const conversationId = options.conversationId;

  const rows = (
    conversationId
      ? sqlite
          .prepare(
            `SELECT m.id as messageId,
                    m.conversation_id as conversationId,
                    m.role,
                    substr(m.content, 1, 160) as snippet,
                    e.dim as dim,
                    e.vector as vector
             FROM moudir_message_embedding e
             JOIN moudir_message m ON m.id = e.message_id
             WHERE e.dim = ?
               AND e.conversation_id = ?`,
          )
          .all(dims, conversationId)
      : sqlite
          .prepare(
            `SELECT m.id as messageId,
                    m.conversation_id as conversationId,
                    m.role,
                    substr(m.content, 1, 160) as snippet,
                    e.dim as dim,
                    e.vector as vector
             FROM moudir_message_embedding e
             JOIN moudir_message m ON m.id = e.message_id
             WHERE e.dim = ?`,
          )
          .all(dims)
  ) as Array<{
    messageId: number;
    conversationId: string;
    role: string;
    snippet: string;
    dim: number;
    vector: Buffer;
  }>;

  const scored: ChatSemanticSearchHit[] = [];
  for (const row of rows) {
    const v = decodeVector(row.vector);
    if (v.length !== queryVec.length) continue;
    scored.push({
      messageId: row.messageId,
      conversationId: row.conversationId,
      role: row.role,
      snippet: snippet(row.snippet),
      score: dot(queryVec, v),
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
