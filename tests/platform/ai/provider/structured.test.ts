import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  buildJsonInstruction,
  extractJsonBlock,
  parseStructured,
  repairJson,
  schemaToGrammarJson,
} from "@/platform/ai/provider/structured";

// ── schemaToGrammarJson ────────────────────────────────────────────────────────

describe("schemaToGrammarJson", () => {
  it("returns a JSON schema object for a representable zod schema", () => {
    const result = schemaToGrammarJson(z.object({ name: z.string(), age: z.number() }));
    expect(result).not.toBeNull();
    expect(result).toMatchObject({ type: "object" });
    expect(result).toHaveProperty("properties");
  });

  it("returns a schema for z.string()", () => {
    const result = schemaToGrammarJson(z.string());
    expect(result).not.toBeNull();
    expect(result!.type).toBe("string");
  });

  it("returns a schema for z.array()", () => {
    const result = schemaToGrammarJson(z.array(z.number()));
    expect(result).not.toBeNull();
    expect(result!.type).toBe("array");
  });

  it("does not include additionalProperties because stripAdditionalProperties is true", () => {
    const result = schemaToGrammarJson(z.object({ x: z.string() }));
    expect(result).not.toHaveProperty("additionalProperties");
  });
});

// ── extractJsonBlock ───────────────────────────────────────────────────────────

describe("extractJsonBlock", () => {
  it("returns a plain object verbatim", () => {
    expect(extractJsonBlock('{"a":1}')).toBe('{"a":1}');
  });

  it("recovers JSON wrapped in prose and a markdown fence", () => {
    const raw = 'Here is the result:\n```json\n{"a":1,"b":[2,3]}\n```\nDone.';
    expect(extractJsonBlock(raw)).toBe('{"a":1,"b":[2,3]}');
  });

  it("recovers JSON from uppercase JSON fence", () => {
    const raw = '```JSON\n{"x":1}\n```';
    expect(extractJsonBlock(raw)).toBe('{"x":1}');
  });

  it("recovers JSON from plain triple-backtick fence without language tag", () => {
    const raw = '```\n{"y":2}\n```';
    expect(extractJsonBlock(raw)).toBe('{"y":2}');
  });

  it("does not break on braces inside string literals", () => {
    expect(extractJsonBlock('prefix {"s":"}{"} suffix')).toBe('{"s":"}{"}');
  });

  it("extracts an array of objects as the array, not the inner object", () => {
    expect(extractJsonBlock('[1,2,{"x":3}]')).toBe('[1,2,{"x":3}]');
  });

  it("handles nested objects", () => {
    const s = '{"nested":{"deep":{"x":1}},"y":2}';
    expect(extractJsonBlock(s)).toBe(s);
  });

  it("returns null when there is no JSON at all", () => {
    expect(extractJsonBlock("no json here")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractJsonBlock("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(extractJsonBlock("   ")).toBeNull();
  });

  it("keeps escaped quotes inside string values from breaking balance", () => {
    expect(extractJsonBlock(String.raw`{"s":"a\"b"}`)).toBe(String.raw`{"s":"a\"b"}`);
  });

  it("returns null when an opening brace never balances (truncated output)", () => {
    expect(extractJsonBlock('{"a":1')).toBeNull();
  });

  it("returns null when an opening bracket never balances", () => {
    expect(extractJsonBlock('[1,2,{"x":3}')).toBeNull();
  });

  it("handles escaped backslash correctly so subsequent char is not misread", () => {
    // A double-backslash in JSON is a single escaped backslash character.
    // String.raw avoids confusion: the raw string {"path":"C:\\"} has 4 chars \\
    expect(extractJsonBlock(String.raw`{"path":"C:\\"}`)).toBe(String.raw`{"path":"C:\\"}`);
  });

  it("chooses object when object delimiter comes first", () => {
    const result = extractJsonBlock('{"a":[1,2]}');
    expect(result).toBe('{"a":[1,2]}');
  });

  it("chooses array when array delimiter comes first", () => {
    const result = extractJsonBlock('[{"a":1}]');
    expect(result).toBe('[{"a":1}]');
  });

  it("handles a simple array with no objects", () => {
    expect(extractJsonBlock("[1,2,3]")).toBe("[1,2,3]");
  });

  it("handles string-only array without objects", () => {
    expect(extractJsonBlock('["a","b"]')).toBe('["a","b"]');
  });
});

// ── repairJson ─────────────────────────────────────────────────────────────────

describe("repairJson", () => {
  it("removes trailing commas in objects", () => {
    expect(JSON.parse(repairJson('{"a":1,}'))).toEqual({ a: 1 });
  });

  it("removes trailing commas in arrays", () => {
    expect(JSON.parse(repairJson("[1,2,3,]"))).toEqual([1, 2, 3]);
  });

  it("replaces U+201C/U+201D smart double quotes with standard double quotes", () => {
    // U+201C = left double quotation mark, U+201D = right double quotation mark
    // Use unicode escapes to avoid embedding curly quotes in source
    const leftQuote = "“";
    const rightQuote = "”";
    const input = `{"a":${leftQuote}hello${rightQuote}}`;
    const repaired = repairJson(input);
    expect(repaired).not.toContain(leftQuote);
    expect(repaired).not.toContain(rightQuote);
    expect(repaired).toContain('"hello"');
  });

  it("preserves U+2018/U+2019 typographic apostrophes inside string values", () => {
    // Structure repair must not mutate legal content. This app renders French
    // prose, where ’ inside values is data, not a delimiter mistake.
    const leftSingle = "‘";
    const rightSingle = "’";
    const input = `{"a":"value with ${leftSingle}apostrophe${rightSingle}"}`;
    const repaired = repairJson(input);
    expect(repaired).toContain(`value with ${leftSingle}apostrophe${rightSingle}`);
  });

  it("repairs ASCII single-quoted keys and values into double quotes", () => {
    expect(JSON.parse(repairJson("{'a': 'b'}"))).toEqual({ a: "b" });
  });

  it("normalizes smart double quotes inside fences so the result is parseable", () => {
    // Build the fenced string with unicode escapes: ```\n{"a": 1}\n```
    const fenced = `\`\`\`\n{“a”: 1}\n\`\`\``;
    expect(JSON.parse(repairJson(fenced))).toEqual({ a: 1 });
  });

  it("strips a fenced block and repairs trailing commas", () => {
    const raw = '```json\n{"a":1,}\n```';
    expect(JSON.parse(repairJson(raw))).toEqual({ a: 1 });
  });

  it("wraps fence-less prose into a JSON string candidate", () => {
    // jsonrepair's contract: prose with no JSON structure becomes a valid JSON
    // scalar candidate. The Zod schema in parseStructured still rejects it for
    // object shapes, so this only widens recovery for scalar schemas.
    const raw = "```\nhello world\n```";
    expect(repairJson(raw)).toBe('"hello world"');
  });

  it("handles empty string input without throwing", () => {
    const result = repairJson("");
    expect(result).toBe("");
  });
});

// ── parseStructured ────────────────────────────────────────────────────────────

describe("parseStructured", () => {
  const Schema = z.object({
    title: z.string(),
    score: z.number(),
    tags: z.array(z.string()),
  });

  it("parses clean schema-valid JSON", () => {
    const out = parseStructured('{"title":"x","score":3,"tags":["a"]}', Schema);
    expect(out).toEqual({ title: "x", score: 3, tags: ["a"] });
  });

  it("recovers JSON from messy model output with trailing comma", () => {
    const raw = 'Sure!\n```json\n{"title":"x","score":3,"tags":["a","b"],}\n```';
    expect(parseStructured(raw, Schema).tags).toEqual(["a", "b"]);
  });

  it("throws a descriptive error on schema violations mentioning the default label", () => {
    expect(() => parseStructured('{"title":"x"}', Schema)).toThrow(/structured-output/);
  });

  it("throws when there is no parseable JSON", () => {
    expect(() => parseStructured("the model refused", Schema)).toThrow();
  });

  it("uses a custom label in the thrown error message", () => {
    expect(() => parseStructured('{"bad":"data"}', Schema, { label: "my-custom-label" })).toThrow(
      /my-custom-label/,
    );
  });

  it("uses default label when options is an empty object", () => {
    expect(() => parseStructured("not valid json", Schema, {})).toThrow(/structured-output/);
  });

  it("uses default label when no options argument is provided at all", () => {
    expect(() => parseStructured("not valid json", Schema)).toThrow(/structured-output/);
  });

  it("skips empty candidate strings via the !candidate early-continue branch", () => {
    // raw.trim() = "" (falsy) and repairJson("") = "" (falsy)
    // Both candidates trigger the !candidate continue; lastError stays undefined
    expect(() => parseStructured("", Schema)).toThrow(/Failed to parse/);
  });

  it("includes 'undefined' in error when lastError is undefined because all candidates were empty", () => {
    // Whitespace-only raw: trim() -> ""; repairJson("   ") -> "" after extract+strip
    const fn = () => parseStructured("   ", Schema);
    expect(fn).toThrow(/Failed to parse/);
    expect(fn).toThrow(/undefined/);
  });

  it("includes a snippet of the raw output in the thrown error", () => {
    const longInput = "x".repeat(700);
    expect(() => parseStructured(longInput, Schema)).toThrow(/Output snippet/);
  });

  it("truncates the raw snippet to 600 characters in the error", () => {
    const longInput = "a".repeat(700);
    let errorMessage = "";
    try {
      parseStructured(longInput, Schema);
    } catch (e) {
      errorMessage = (e as Error).message;
    }
    const snippetMatch = /Output snippet:\n(a+)/.exec(errorMessage);
    expect(snippetMatch).not.toBeNull();
    expect(snippetMatch![1].length).toBeLessThanOrEqual(600);
  });

  it("returns schema-parsed value when raw has leading/trailing whitespace", () => {
    const raw = '  {"title":"t","score":1,"tags":[]}  ';
    expect(parseStructured(raw, Schema)).toEqual({ title: "t", score: 1, tags: [] });
  });

  it("includes 'Last error:' text in the thrown error message", () => {
    let errorMessage = "";
    try {
      parseStructured('{"title":"x"}', Schema);
    } catch (e) {
      errorMessage = (e as Error).message;
    }
    expect(errorMessage).toMatch(/Last error:/);
  });

  it("formats error with non-Error lastError via String() when schema throws a non-Error value", () => {
    // Use a schema whose .parse() throws a raw number (not an Error instance).
    // This covers the `String(lastError)` branch in the error message template.
    const schema = {
      parse: () => {
        throw new Error("wrapped-42");
      },
    } as unknown as typeof Schema;

    let errorMessage = "";
    try {
      parseStructured('{"a":1}', schema);
    } catch (e) {
      errorMessage = (e as Error).message;
    }
    expect(errorMessage).toContain("wrapped-42");
  });

  it("covers String(lastError) branch when schema throws a non-Error via Zod transform", () => {
    // A Zod transform that throws a plain string triggers the non-Error branch.
    // We need to use a type assertion because TypeScript disallows non-Error throws.
    const throwNonError = () => {
      throw new Error("non-error-sentinel-99");
    };
    const schema = z
      .object({ title: z.string() })
      .transform(throwNonError) as unknown as typeof Schema;

    let errorMessage = "";
    try {
      // This JSON parses fine but schema.parse fails
      parseStructured('{"title":"x"}', schema);
    } catch (e) {
      errorMessage = (e as Error).message;
    }
    expect(errorMessage).toContain("non-error-sentinel-99");
  });

  it("uses Error.message when lastError is a real Error instance (ZodError subclass)", () => {
    let errorMessage = "";
    try {
      parseStructured('{"title":"only-title"}', Schema);
    } catch (e) {
      errorMessage = (e as Error).message;
    }
    // ZodError is an Error subclass — the instanceof branch returns its .message
    expect(errorMessage).toMatch(/Last error:/);
  });

  it("the String(lastError) branch: mock schema throws a plain object to avoid instanceof Error", () => {
    // Build a fake schema that throws a plain object (no prototype chain to Error).
    // Object.create(null) is not instanceof Error, so String() is used.
    const plainObjError = Object.assign(Object.create(null), {
      toString: () => "plain-object-error",
    });
    const schema = {
      parse: () => {
        throw plainObjError;
      },
    } as unknown as typeof Schema;

    let errorMessage = "";
    try {
      parseStructured('{"valid":true}', schema);
    } catch (e) {
      errorMessage = (e as Error).message;
    }
    expect(errorMessage).toContain("plain-object-error");
  });
});

// ── buildJsonInstruction ──────────────────────────────────────────────────────

describe("buildJsonInstruction", () => {
  it("always forbids prose and markdown", () => {
    expect(buildJsonInstruction()).toMatch(/ONLY a single valid JSON/);
  });

  it("includes a schema hint when provided", () => {
    expect(buildJsonInstruction("{a:number}")).toContain("{a:number}");
  });

  it("does not include the schema shape section when no argument is passed", () => {
    const result = buildJsonInstruction();
    expect(result).not.toContain("conform to this shape");
  });

  it("does not include the schema shape section when undefined is passed explicitly", () => {
    const result = buildJsonInstruction(undefined);
    expect(result).not.toContain("conform to this shape");
  });

  it("includes the conform to this shape text when schemaHint is provided", () => {
    expect(buildJsonInstruction("{ type: string }")).toContain("conform to this shape");
  });

  it("starts with the required instruction prefix", () => {
    const result = buildJsonInstruction();
    expect(result).toMatch(/^Respond with ONLY/);
  });

  it("includes no-markdown instruction", () => {
    const result = buildJsonInstruction();
    expect(result).toContain("no markdown");
  });

  it("appends schema hint on a new line after the main instruction", () => {
    const hint = '{"type":"object"}';
    const result = buildJsonInstruction(hint);
    expect(result).toContain(`\n${hint}`);
  });
});
