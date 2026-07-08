import type { ZodType } from "zod";
import { zodToInlineJsonSchema } from "./zod-json-schema";

/**
 * Robust JSON extraction + schema validation for LLM output.
 *
 * Two structured-output strategies live behind the provider registry:
 *
 *  1. **Grammar-constrained (preferred).** node-llama-cpp / Ollama / OpenAI take
 *     a JSON Schema and constrain decoding so output is valid *by construction*.
 *     The Zod → JSON-Schema bridge for that lane is {@link schemaToGrammarJson}.
 *  2. **Prompt + repair (browser fallback).** Transformers.js / web-LLM have no
 *     grammar support, so we coax JSON out of the model and repair it here.
 *     `extractJsonBlock` recovers the first balanced JSON value; `parseStructured`
 *     then validates it against a Zod schema.
 *
 * These helpers are intentionally pure (no logging, no globals) so they are fast
 * and unit testable, unlike the debug-heavy `parseJSON` in
 * platform/ai/transformers-engine.ts.
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

/** Best-effort repair of common model JSON mistakes (trailing commas, fences). */
export function repairJson(input: string): string {
  const block = extractJsonBlock(input) ?? stripFence(input).trim();
  return block
    .replace(/,\s*([}\]])/g, "$1") // trailing commas
    .replace(/[“”]/g, '"') // smart double quotes
    .replace(/[‘’]/g, "'"); // smart single quotes
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
