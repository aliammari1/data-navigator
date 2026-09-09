import { jsonrepair } from "jsonrepair";
import { Allow, parse as parsePartial } from "partial-json";

import type { ZodType } from "zod";
import { zodToInlineJsonSchema } from "./zod-json-schema";

/**
 * Robust JSON extraction + schema validation for LLM output.
 *
 * The provider registry's sole lane (node-llama-cpp, see ./registry.ts) is
 * **grammar-constrained**: a JSON Schema constrains decoding so output is
 * valid *by construction* — the Zod → JSON-Schema bridge for that lane is
 * {@link schemaToGrammarJson}. `extractJsonBlock` / `parseStructured` are the
 * prompt+repair fallback path (recovering the first balanced JSON value and
 * validating it against a Zod schema), kept as pure, fast, unit-testable
 * utilities for any future non-grammar-constrained provider.
 */

/**
 * Convert a Zod schema into an inline JSON Schema suitable for a constrained-
 * decoding grammar (node-llama-cpp `createGrammarForJsonSchema`, Ollama
 * `format`, OpenAI `json_schema`). Returns `null` when the schema can't be
 * represented in the grammar subset — callers then use the prompt+repair lane.
 *
 * NOTE: this delegates to {@link zodToInlineJsonSchema}, which uses zod v4's
 * native `z.toJSONSchema` (the `zod-to-json-schema` package does NOT understand
 * zod v4 and silently returns an empty schema).
 */
export function schemaToGrammarJson<T>(schema: ZodType<T>): Record<string, unknown> | null {
  return zodToInlineJsonSchema(schema as ZodType, { stripAdditionalProperties: true });
}

/** Strip a ```json … ``` (or ``` … ```) fence if present. */
function stripFence(input: string): string {
  const match = input.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  return match?.[1]?.trim() ?? input;
}

/**
 * Return the first balanced `{…}` or `[…]` block in `input`, honouring string
 * literals and escapes so braces inside strings don't break the balance count.
 */
export function extractJsonBlock(input: string): string | null {
  const text = stripFence(input).trim();

  // Start from whichever JSON delimiter appears FIRST so that an array of
  // objects (`[{…}]`) isn't mistaken for its inner object, and vice-versa.
  const firstObj = text.indexOf("{");
  const firstArr = text.indexOf("[");
  if (firstObj === -1 && firstArr === -1) return null;

  const useArray = firstObj === -1 || (firstArr !== -1 && firstArr < firstObj);
  const open = useArray ? "[" : "{";
  const close = useArray ? "]" : "}";
  const start = useArray ? firstArr : firstObj;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Repair candidate for {@link parseStructured}: delegates to the jsonrepair
 * library, the same engine behind Vercel AI SDK's stable repairText hook and
 * its official cookbook recipe. Output stays a CANDIDATE — the Zod schema in
 * parseStructured still gates acceptance, so repaired-but-wrong data cannot
 * slip through.
 */
export function repairJson(input: string): string {
  const block = extractJsonBlock(input) ?? stripFence(input).trim();
  try {
    return jsonrepair(block);
  } catch {
    // Unrepairable input (pure prose, hopeless truncation): hand the untouched
    // block back so parseStructured reports its own descriptive failure.
    return block;
  }
}

export interface ParseStructuredOptions {
  /** Label used in thrown error messages for debuggability. */
  label?: string;
}

/**
 * Parse + validate model output against a Zod schema.
 * Tries direct JSON, then a repaired/extracted block. Throws a descriptive
 * error (including a truncated snippet) if neither yields schema-valid data.
 */
export function parseStructured<T>(
  raw: string,
  schema: ZodType<T>,
  options: ParseStructuredOptions = {},
): T {
  const label = options.label ?? "structured-output";
  const candidates = [raw.trim(), repairJson(raw)];

  let lastError: unknown;
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate);
      return schema.parse(parsed);
    } catch (err) {
      lastError = err;
    }
  }

  const snippet = raw.trim().slice(0, 600);
  throw new Error(
    `Failed to parse ${label} as schema-valid JSON.\n` +
      `Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}\n` +
      `Output snippet:\n${snippet}`,
  );
}

/**
 * Build a strict instruction suffix that nudges a non-structured model to emit
 * ONLY JSON. Used by the prompt-based structured fallback.
 */
export function buildJsonInstruction(schemaHint?: string): string {
  return (
    "Respond with ONLY a single valid JSON value and nothing else — " +
    "no markdown, no code fences, no commentary." +
    (schemaHint ? `\nIt must conform to this shape:\n${schemaHint}` : "")
  );
}

export type DeepPartial<T> = T extends Function
  ? T
  : T extends Array<infer U>
    ? Array<DeepPartial<U>>
    : T extends object
      ? { [P in keyof T]?: DeepPartial<T[P]> }
      : T;

/**
 * Parse a stream of tokens into an incomplete but syntactically valid JavaScript
 * structure in real time, allowing UI components to progressively render
 * structured charts, plans, and tables while the local model is generating tokens.
 */
export function parsePartialJson<T = unknown>(input: string): DeepPartial<T> | null {
  const trimmed = stripFence(input).trim();
  if (!trimmed) return null;
  try {
    return parsePartial(trimmed, Allow.ALL) as DeepPartial<T>;
  } catch {
    return null;
  }
}
