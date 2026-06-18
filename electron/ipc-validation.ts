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

// ─── Offline model download channels ──────────────────────────────────────────
export const RequestIdSchema = z.string().min(1).max(512);
export const ModelKeySchema = z.string().min(1).max(256);
export const ModelDownloadSchema = z.object({ key: ModelKeySchema, requestId });

// ─── LAN collaboration hub ────────────────────────────────────────────────────
export const CollabStartSchema = z
  .object({
    port: z.number().int().min(0).max(65535).optional(),
    pairingCode: z.string().max(256).optional(),
    room: z.string().max(256).optional(),
    advertise: z.boolean().optional(),
    discover: z.boolean().optional(),
  })
  .optional();
