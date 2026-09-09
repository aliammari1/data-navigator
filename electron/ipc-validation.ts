import { z } from "zod";

/**
 * Per-channel IPC input validation — defense-in-depth over the trusted-sender
 * origin guard (a compromised/XSS'd renderer is still an allowed origin).
 *
 * Pure + unit-tested (no `electron` import). Each schema validates the
 * security-relevant field TYPES and caps free-text length (local-DoS bound).
 * Unknown keys are stripped (Zod's default), which blunts prototype-pollution /
 * extra-field injection. Schemas are intentionally tolerant of optional fields
 * and keep NUMERIC ranges loose — the goal is to reject MALFORMED/oversized
 * input and wrong-typed payloads, not to be a strict wire contract that could
 * reject a legitimate call.
 */

/** Validate `input` against `schema`, throwing a channel-tagged error on failure. */
export function parseIpc<T>(schema: z.ZodType<T>, input: unknown, channel: string): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid IPC payload for "${channel}": ${detail}`);
  }
  return result.data;
}

// ─── DoS caps (one IPC call must not be able to pin memory/CPU) ───────────────
const MAX_SQL_CHARS = 200_000;
const MAX_PROMPT_CHARS = 1_000_000;

// ─── Reusable field validators ────────────────────────────────────────────────
const datasetId = z.string().min(1).max(512);
const cancelToken = z.string().max(512).optional();
const requestId = z.string().max(512).optional();

// ─── DuckDB channels ──────────────────────────────────────────────────────────
export const SqlSchema = z.string().min(1).max(MAX_SQL_CHARS);

export const RegisterCsvSchema = z.object({
  filePath: z.string().min(1),
  displayName: z.string().optional(),
  hasHeader: z.boolean().optional(),
  delimiter: z.string().max(8).optional(),
  sampleSize: z.number().optional(),
  previewLimit: z.number().optional(),
  encoding: z.enum(["utf-8", "utf-16", "latin-1"]).optional(),
  storeRejects: z.boolean().optional(),
});

export const RegisterParquetSchema = z.object({
  filePath: z.string().min(1),
  displayName: z.string().optional(),
  previewLimit: z.number().optional(),
});

export const DatasetOnlySchema = z.object({ datasetId });

export const PreviewDatasetSchema = z.object({
  datasetId,
  limit: z.number().optional(),
  offset: z.number().optional(),
});

export const ExportDatasetSchema = z.object({ datasetId, targetPath: z.string().min(1) });

export const ProfileDatasetSchema = z.object({ datasetId, cancelToken });

export const ProfileColumnDetailSchema = z.object({
  datasetId,
  column: z.string().min(1),
  topK: z.number().optional(),
  binCount: z.number().optional(),
  cancelToken,
});

export const CountRowsSchema = z.object({
  datasetId,
  where: z.string().max(MAX_SQL_CHARS).optional(),
  force: z.boolean().optional(),
  cancelToken,
});

export const KeysetPageSchema = z.object({
  datasetId,
  sortKeys: z
    .array(z.object({ column: z.string().min(1), direction: z.enum(["ASC", "DESC"]).optional() }))
    .max(64),
  limit: z.number(),
  where: z.string().max(MAX_SQL_CHARS).optional(),
  cursor: z.object({ sortValues: z.array(z.unknown()), rowid: z.number() }).optional(),
  columns: z.array(z.string()).max(4096).optional(),
  cancelToken,
});

// ─── node-llama-cpp channels ──────────────────────────────────────────────────
export const LlamaGenerateSchema = z.object({
  requestId,
  system: z.string().max(MAX_PROMPT_CHARS).optional(),
  prompt: z.string().min(1).max(MAX_PROMPT_CHARS),
  systemPrefix: z.string().max(MAX_PROMPT_CHARS).optional(),
  maxTokens: z.number().optional(),
  temperature: z.number().optional(),
  topP: z.number().optional(),
});

export const LlamaGenerateStructuredSchema = z.object({
  requestId,
  system: z.string().max(MAX_PROMPT_CHARS).optional(),
  prompt: z.string().min(1).max(MAX_PROMPT_CHARS),
  systemPrefix: z.string().max(MAX_PROMPT_CHARS).optional(),
  jsonSchema: z.record(z.string(), z.unknown()),
  maxTokens: z.number().optional(),
  temperature: z.number().optional(),
});

export const LlamaEnsureModelSchema = z.object({ file: z.string().max(512).optional() }).optional();

export const LlamaPreloadWarmPrefixSchema = z.object({
  systemPrefix: z.string().min(1).max(MAX_PROMPT_CHARS),
});

// Cap batch size defensively (mirrors MAX_SQL_CHARS/MAX_PROMPT_CHARS above): one

// ─── Offline model download channels ──────────────────────────────────────────
export const RequestIdSchema = z.string().min(1).max(512);
// Allowlist, not a free-form string: mirrors MODEL_DOWNLOADS' keys in
// electron/model-download-service.ts (that module imports `electron`, so it
// can't be imported here — this file is deliberately electron-free, see the
// module doc comment above). Keep these three keys in sync with that array.
export const ModelKeySchema = z.enum([
  "gemma-4-e2b-qat-mobile-text-only",
  "lfm2-5-2.6b-q4_k_m",
  "granite-4.0-1b-q4_k_m",
  "qwen3-1.7b-q4_k_m",
  "gemma-4-e4b-it-q4_k_m",
  "granite-4.1-3b-instruct-q4_k_m",
  "all-minilm-l6-v2-embed-q8_0",
]);
export const ModelDownloadSchema = z.object({ key: ModelKeySchema, requestId });

// ─── Moudir chat history channels ─────────────────────────────────────────────
const conversationId = z.string().min(1).max(128);
/** Message parts are renderer-owned JSON; bound serialized size (local-DoS cap). */
const messageParts = z
  .unknown()
  .optional()
  .refine((v) => v === undefined || JSON.stringify(v).length <= 2_000_000, {
    message: "parts too large",
  });

export const ChatCreateConversationSchema = z.object({
  id: conversationId,
  title: z.string().min(1).max(300),
  datasetId: z.string().max(512).nullish(),
  model: z.string().max(300).nullish(),
});

export const ChatListConversationsSchema = z
  .object({
    limit: z.number().optional(),
    search: z.string().max(500).optional(),
  })
  .optional();

export const ChatRenameSchema = z.object({
  id: conversationId,
  title: z.string().min(1).max(300),
});

export const ChatPinSchema = z.object({ id: conversationId, pinned: z.boolean() });

export const ChatModelSchema = z.object({
  id: conversationId,
  model: z.string().max(300).nullable(),
});

export const ChatConversationIdSchema = z.object({ id: conversationId });

export const ChatAppendMessageSchema = z.object({
  conversationId,
  role: z.enum(["user", "assistant", "tool"]),
  content: z.string().max(MAX_PROMPT_CHARS),
  parts: messageParts,
});

export const ChatGetMessagesSchema = z.object({
  conversationId,
  limit: z.number().optional(),
});

export const ChatSearchMessagesSchema = z.object({
  query: z.string().min(1).max(MAX_PROMPT_CHARS),
  limit: z.number().optional(),
  conversationId: z.string().optional(),
});

// ─── Moudir chat session runtime channels (live LlamaChatSession) ─────────────
// History rows only need role + content for model-side rehydration (`parts`
// stays a renderer/chat.db concern); the array cap mirrors chat-store's
// getMessages ceiling.

export const ChatOpenSchema = z.object({
  conversationId,
  modelFile: z.string().max(512).optional(),
  systemPrompt: z.string().max(32_000).optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "tool"]),
        content: z.string().max(MAX_PROMPT_CHARS),
      }),
    )
    .max(2000)
    .optional(),
});

export const ChatPromptSchema = z.object({
  conversationId,
  text: z.string().min(1).max(MAX_PROMPT_CHARS),
  requestId,
});

export const ChatPreloadSchema = z.object({
  conversationId,
  text: z.string().min(1).max(MAX_PROMPT_CHARS),
});

export const ChatSessionIdSchema = z.object({ conversationId });

// ─── Clipboard image channel ──────────────────────────────────────────────────
// PNG data URL from a chart export, written to the OS clipboard as a native
// image. Cap the base64 payload (a 30 MB data URL is already a very large
// export) and require the `data:image/` prefix so only image URLs reach
// `nativeImage.createFromDataURL`.
const MAX_CLIPBOARD_IMAGE_CHARS = 30_000_000;
export const ClipboardImageSchema = z.object({
  dataUrl: z
    .string()
    .min(1)
    .max(MAX_CLIPBOARD_IMAGE_CHARS)
    .refine((value) => value.startsWith("data:image/"), {
      message: "must be a data:image/ URL",
    }),
});

// ─── LAN collaboration hub ────────────────────────────────────────────────────
export const CollabStartSchema = z
  .object({
    port: z.number().int().min(0).max(65535).optional(),
    pairingCode: z.string().max(256).optional(),
    guestCode: z.string().max(256).optional(),
    room: z.string().max(256).optional(),
    advertise: z.boolean().optional(),
    discover: z.boolean().optional(),
  })
  .optional();

// ─── Embeddings channels ──────────────────────────────────────────────────────
export const EmbedEnsureModelSchema = z.object({ file: z.string().max(512).optional() }).optional();

const MAX_EMBED_CHARS = 20_000;
const MAX_EMBED_BATCH_ITEMS = 512;

export const EmbedOneSchema = z.object({
  text: z.string().min(1).max(MAX_EMBED_CHARS),
  requestId,
});

export const EmbedBatchSchema = z.object({
  texts: z.array(z.string().min(1).max(MAX_EMBED_CHARS)).min(1).max(MAX_EMBED_BATCH_ITEMS),
  requestId,
});
