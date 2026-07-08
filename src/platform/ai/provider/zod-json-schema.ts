import { type ZodType, z } from "zod";

/**
 * Zod → JSON Schema for the constrained-decoding lanes (node-llama-cpp GBNF,
 * Ollama `format`, OpenAI `json_schema`).
 *
 * WHY THIS EXISTS / WHY NOT `zod-to-json-schema`
 * ----------------------------------------------
 * The offline-llm-runtime brief suggested `zod-to-json-schema`, but this repo is
 * on **zod v4** (`z.toJSONSchema` is built in) and `zod-to-json-schema@3.x` only
 * understands zod v3 internals — fed a zod-v4 schema it returns an EMPTY object
 * (`{ "$schema": … }` only), which would silently disable grammar-constrained
 * decoding. We therefore use zod's own native converter and post-process it down
 * to the GBNF-supported subset.
 *
 * GBNF / `createGrammarForJsonSchema` supported subset (node-llama-cpp v3):
 *   type, properties, items, enum, const, oneOf/anyOf, required.
 * NOT supported: `$ref`, `$defs`/`definitions`, `allOf`, `pattern`, `format`,
 * `minLength`/`maxLength`, numeric bounds. We strip those so a schema authored
 * with extra zod refinements still yields a valid grammar (the Zod `.parse()`
 * after generation re-applies the dropped constraints).
 */

const STRIP_KEYS = new Set([
  "$schema",
  "$id",
  "$comment",
  "$anchor",
  "title",
  "default",
  // String/number constraints unsupported by the GBNF subset — Zod re-validates.
  "pattern",
  "format",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minItems",
  "maxItems",
  "uniqueItems",
  "minProperties",
  "maxProperties",
]);

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

function isObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Resolve a `#/$defs/Name` (or legacy `#/definitions/Name`) pointer. */
function resolveRef(ref: string, roots: JsonObject[]): JsonObject | null {
  const parts = ref.replace(/^#\//, "").split("/");
  for (const root of roots) {
    let cursor: JsonValue | undefined = root;
    for (const part of parts) {
      if (cursor && isObject(cursor)) cursor = cursor[part];
      else {
        cursor = undefined;
        break;
      }
    }
    if (cursor && isObject(cursor)) return cursor;
  }
  return null;
}

/**
 * Recursively inline `$ref`s, drop unsupported keywords, and collapse the
 * top-level `$defs`/`definitions` containers so `createGrammarForJsonSchema`
 * receives a fully self-contained inline schema.
 */
function normalize(node: JsonValue, defs: JsonObject[], seen = new Set<string>()): JsonValue {
  if (Array.isArray(node)) return node.map((n) => normalize(n, defs, seen));
  if (!isObject(node)) return node;

  // Inline $ref (guard against self-referential cycles, which GBNF can't model).
  const ref = node.$ref;
  if (typeof ref === "string") {
    if (seen.has(ref)) return {}; // cycle → permissive {}; Zod still validates.
    const target = resolveRef(ref, defs);
    if (target) {
      const next = new Set(seen);
      next.add(ref);
      return normalize(target, defs, next);
    }
    return {};
  }

  const out: JsonObject = {};
  for (const [key, value] of Object.entries(node)) {
    if (STRIP_KEYS.has(key)) continue;
    if (key === "$defs" || key === "definitions") continue; // collapsed away
    out[key] = normalize(value, defs, seen);
  }
  return out;
}

export interface ToJsonSchemaOptions {
  /** Drop `additionalProperties` (some grammar builders dislike `false`). */
  stripAdditionalProperties?: boolean;
}

/**
 * Convert a Zod schema to an inline, GBNF-safe JSON Schema object, or `null`
 * when conversion isn't possible (caller should then fall back to the
 * prompt+repair lane).
 */
export function zodToInlineJsonSchema(
  schema: ZodType<unknown>,
  options: ToJsonSchemaOptions = {},
): JsonObject | null {
  const toJSONSchema = (
    z as unknown as {
      toJSONSchema?: (s: unknown, opts?: Record<string, unknown>) => JsonObject;
    }
  ).toJSONSchema;
  if (typeof toJSONSchema !== "function") return null;

  let raw: JsonObject;
  try {
    // `io: "output"` reflects the post-parse shape; `unrepresentable: "any"`
    // degrades unsupported types to permissive nodes instead of throwing.
    raw = toJSONSchema(schema, {
      target: "draft-7",
      io: "output",
      unrepresentable: "any",
      $refStrategy: "none",
    });
  } catch {
    try {
      raw = toJSONSchema(schema);
    } catch {
      return null;
    }
  }

  const defsRoot = isObject(raw) ? raw : ({} as JsonObject);
  const normalized = normalize(raw, [defsRoot]);
  if (!isObject(normalized)) return null;

  // An empty schema means conversion failed (e.g. wrong zod major) — signal the
  // caller to use the prompt fallback rather than ship a no-op grammar.
  const meaningfulKeys = Object.keys(normalized).filter((k) => k !== "additionalProperties");
  if (meaningfulKeys.length === 0) return null;

  if (options.stripAdditionalProperties) {
    stripKeyDeep(normalized, "additionalProperties");
  }
  return normalized;
}

function stripKeyDeep(node: JsonValue, key: string): void {
  if (Array.isArray(node)) {
    for (const child of node) stripKeyDeep(child, key);
    return;
  }
  if (!isObject(node)) return;
  delete node[key];
  for (const value of Object.values(node)) stripKeyDeep(value, key);
}
