import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  buildJsonInstruction,
  extractJsonBlock,
  parseStructured,
  repairJson,
  schemaToGrammarJson,
} from "@/platform/ai/provider/structured";

describe("extractJsonBlock", () => {
  it("returns a plain object verbatim", () => {
    expect(extractJsonBlock('{"a":1}')).toBe('{"a":1}');
  });
  it("recovers JSON wrapped in prose and a markdown fence", () => {
    const raw = 'Here is the result:\n```json\n{"a":1,"b":[2,3]}\n```\nDone.';
    expect(extractJsonBlock(raw)).toBe('{"a":1,"b":[2,3]}');
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
  it("returns null when there is no JSON", () => {
    expect(extractJsonBlock("no json here")).toBeNull();
  });
  it("keeps escaped quotes inside string values from breaking balance", () => {
    // The backslash-escape path must skip the next char so an escaped quote does
    // not toggle string mode and mis-balance the braces.
    expect(extractJsonBlock('{"s":"a\\"b"}')).toBe('{"s":"a\\"b"}');
  });
  it("returns null when an opening delimiter never balances (truncated output)", () => {
    expect(extractJsonBlock('{"a":1')).toBeNull();
    expect(extractJsonBlock('[1,2,{"x":3}')).toBeNull();
  });
});

describe("schemaToGrammarJson", () => {
  it("converts a representable zod object into an inline JSON schema", () => {
    const out = schemaToGrammarJson(z.object({ name: z.string(), age: z.number() }));
    expect(out).toMatchObject({ type: "object" });
    expect(out).toHaveProperty("properties");
  });
});

describe("repairJson", () => {
  it("removes trailing commas", () => {
    expect(JSON.parse(repairJson('{"a":1,}'))).toEqual({ a: 1 });
    expect(JSON.parse(repairJson("[1,2,3,]"))).toEqual([1, 2, 3]);
  });
  it("normalizes smart quotes inside fences", () => {
    expect(JSON.parse(repairJson("```\n{“a”: 1}\n```"))).toEqual({ a: 1 });
  });
});

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
  it("recovers JSON from messy model output", () => {
    const raw = 'Sure!\n```json\n{"title":"x","score":3,"tags":["a","b"],}\n```';
    expect(parseStructured(raw, Schema).tags).toEqual(["a", "b"]);
  });
  it("throws a descriptive error on schema violations", () => {
    expect(() => parseStructured('{"title":"x"}', Schema)).toThrow(/structured-output/);
  });
  it("throws when there is no parseable JSON", () => {
    expect(() => parseStructured("the model refused", Schema)).toThrow();
  });
});

describe("buildJsonInstruction", () => {
  it("always forbids prose/markdown", () => {
    expect(buildJsonInstruction()).toMatch(/ONLY a single valid JSON/);
  });
  it("includes a schema hint when provided", () => {
    expect(buildJsonInstruction("{a:number}")).toContain("{a:number}");
  });
});
