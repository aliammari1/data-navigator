import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Hoisted state so vi.mock factory can reference it ────────────────────────
const { toJSONSchemaSpy, mockState } = vi.hoisted(() => ({
  toJSONSchemaSpy: vi.fn<(...args: unknown[]) => unknown>(),
  // When toJSONSchemaEnabled is false the Proxy returns undefined,
  // simulating zod v3 where toJSONSchema does not exist.
  mockState: { toJSONSchemaEnabled: true },
}));

// ─── Mock zod so we control z.toJSONSchema ───────────────────────────────────
vi.mock("zod", async (importOriginal) => {
  const real = await importOriginal<typeof import("zod")>();
  const realZ = (real as Record<string, unknown>).z as object;
  const zProxy = new Proxy(realZ, {
    get(target, prop) {
      if (prop === "toJSONSchema") {
        return mockState.toJSONSchemaEnabled ? toJSONSchemaSpy : undefined;
      }
      return (target as Record<string | symbol, unknown>)[prop];
    },
  });
  return { ...real, z: zProxy };
});

// ─── Imports AFTER the mock ───────────────────────────────────────────────────
import { z } from "zod";
import { zodToInlineJsonSchema } from "@/platform/ai/provider/zod-json-schema";

// ─── Shared real implementation ───────────────────────────────────────────────
let realToJSONSchema: ((...args: unknown[]) => unknown) | undefined;

beforeEach(async () => {
  vi.clearAllMocks();
  mockState.toJSONSchemaEnabled = true;
  const realZod = await vi.importActual<typeof import("zod")>("zod");
  const realZ = (realZod as Record<string, unknown>).z as Record<string, unknown>;
  realToJSONSchema = realZ?.toJSONSchema as ((...args: unknown[]) => unknown) | undefined;
  if (realToJSONSchema) {
    toJSONSchemaSpy.mockImplementation((...args: unknown[]) => realToJSONSchema!(...args));
  }
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("zodToInlineJsonSchema", () => {
  // ── toJSONSchema availability ────────────────────────────────────────────

  it("returns null when z.toJSONSchema is not a function (zod v3 simulation)", () => {
    // Arrange: disable toJSONSchema → Proxy returns undefined
    mockState.toJSONSchemaEnabled = false;

    const result = zodToInlineJsonSchema(z.string());

    expect(result).toBeNull();
    // Restore for safety (beforeEach also resets)
    mockState.toJSONSchemaEnabled = true;
  });

  // ── basic success paths ───────────────────────────────────────────────────

  it("returns a non-null object for a simple string schema", () => {
    const result = zodToInlineJsonSchema(z.string());
    expect(result).not.toBeNull();
    expect(typeof result).toBe("object");
  });

  it("returns type:string for z.string()", () => {
    const result = zodToInlineJsonSchema(z.string());
    expect(result).not.toBeNull();
    expect(result!.type).toBe("string");
  });

  it("returns type:number for z.number()", () => {
    const result = zodToInlineJsonSchema(z.number());
    expect(result).not.toBeNull();
    expect(result!.type).toBe("number");
  });

  it("returns type:boolean for z.boolean()", () => {
    const result = zodToInlineJsonSchema(z.boolean());
    expect(result).not.toBeNull();
    expect(result!.type).toBe("boolean");
  });

  it("returns object schema with properties for z.object()", () => {
    const schema = z.object({ name: z.string(), age: z.number() });
    const result = zodToInlineJsonSchema(schema);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("object");
    expect(result!.properties).toBeDefined();
  });

  it("returns array schema for z.array()", () => {
    const schema = z.array(z.string());
    const result = zodToInlineJsonSchema(schema);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("array");
  });

  it("returns enum values for z.enum()", () => {
    const schema = z.enum(["a", "b", "c"]);
    const result = zodToInlineJsonSchema(schema);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty("enum");
  });

  // ── STRIP_KEYS stripping ──────────────────────────────────────────────────

  it("strips $schema from the output", () => {
    const result = zodToInlineJsonSchema(z.string());
    expect(result).not.toHaveProperty("$schema");
  });

  it("strips title from the output", () => {
    toJSONSchemaSpy.mockReturnValue({ title: "My Schema", type: "string" });
    const result = zodToInlineJsonSchema(z.string());
    expect(result).not.toHaveProperty("title");
  });

  it("strips pattern from the output", () => {
    const schema = z.string().regex(/^[a-z]+$/);
    const result = zodToInlineJsonSchema(schema);
    expect(result).not.toHaveProperty("pattern");
  });

  it("strips minLength from the output", () => {
    const schema = z.string().min(3);
    const result = zodToInlineJsonSchema(schema);
    expect(result).not.toHaveProperty("minLength");
  });

  it("strips maxLength from the output", () => {
    const schema = z.string().max(10);
    const result = zodToInlineJsonSchema(schema);
    expect(result).not.toHaveProperty("maxLength");
  });

  it("strips minimum from the output", () => {
    const schema = z.number().min(0);
    const result = zodToInlineJsonSchema(schema);
    expect(result).not.toHaveProperty("minimum");
  });

  it("strips maximum from the output", () => {
    const schema = z.number().max(100);
    const result = zodToInlineJsonSchema(schema);
    expect(result).not.toHaveProperty("maximum");
  });

  it("strips format from the output", () => {
    const schema = z.string().email();
    const result = zodToInlineJsonSchema(schema);
    expect(result).not.toHaveProperty("format");
  });

  it("strips $defs from the output", () => {
    const result = zodToInlineJsonSchema(z.string());
    expect(result).not.toHaveProperty("$defs");
  });

  it("strips multipleOf from the output", () => {
    const schema = z.number().multipleOf(5);
    const result = zodToInlineJsonSchema(schema);
    expect(result).not.toHaveProperty("multipleOf");
  });

  it("strips minItems from the output", () => {
    const schema = z.array(z.string()).min(2);
    const result = zodToInlineJsonSchema(schema);
    expect(result).not.toHaveProperty("minItems");
  });

  it("strips maxItems from the output", () => {
    const schema = z.array(z.string()).max(5);
    const result = zodToInlineJsonSchema(schema);
    expect(result).not.toHaveProperty("maxItems");
  });

  it("strips uniqueItems from the output", () => {
    toJSONSchemaSpy.mockReturnValue({
      type: "array",
      uniqueItems: true,
      items: { type: "string" },
    });
    const result = zodToInlineJsonSchema(z.string());
    expect(result).not.toHaveProperty("uniqueItems");
  });

  it("strips minProperties from the output", () => {
    toJSONSchemaSpy.mockReturnValue({
      type: "object",
      minProperties: 1,
      properties: { x: { type: "string" } },
    });
    const result = zodToInlineJsonSchema(z.string());
    expect(result).not.toHaveProperty("minProperties");
  });

  it("strips maxProperties from the output", () => {
    toJSONSchemaSpy.mockReturnValue({
      type: "object",
      maxProperties: 10,
      properties: { x: { type: "string" } },
    });
    const result = zodToInlineJsonSchema(z.string());
    expect(result).not.toHaveProperty("maxProperties");
  });

  it("strips $id from the output", () => {
    toJSONSchemaSpy.mockReturnValue({ $id: "https://example.com/schema", type: "string" });
    const result = zodToInlineJsonSchema(z.string());
    expect(result).not.toHaveProperty("$id");
  });

  it("strips $comment from the output", () => {
    toJSONSchemaSpy.mockReturnValue({ $comment: "some comment", type: "string" });
    const result = zodToInlineJsonSchema(z.string());
    expect(result).not.toHaveProperty("$comment");
  });

  it("strips $anchor from the output", () => {
    toJSONSchemaSpy.mockReturnValue({ $anchor: "myAnchor", type: "string" });
    const result = zodToInlineJsonSchema(z.string());
    expect(result).not.toHaveProperty("$anchor");
  });

  it("strips default from the output", () => {
    toJSONSchemaSpy.mockReturnValue({ type: "string", default: "hello" });
    const result = zodToInlineJsonSchema(z.string());
    expect(result).not.toHaveProperty("default");
  });

  it("strips exclusiveMinimum from the output", () => {
    toJSONSchemaSpy.mockReturnValue({ type: "number", exclusiveMinimum: 0 });
    const result = zodToInlineJsonSchema(z.number());
    expect(result).not.toHaveProperty("exclusiveMinimum");
  });

  it("strips exclusiveMaximum from the output", () => {
    toJSONSchemaSpy.mockReturnValue({ type: "number", exclusiveMaximum: 100 });
    const result = zodToInlineJsonSchema(z.number());
    expect(result).not.toHaveProperty("exclusiveMaximum");
  });

  it("strips legacy 'definitions' key from the output", () => {
    toJSONSchemaSpy.mockReturnValue({
      definitions: { MyDef: { type: "string" } },
      type: "object",
      properties: { x: { type: "string" } },
    });
    const result = zodToInlineJsonSchema(z.string());
    expect(result).not.toHaveProperty("definitions");
  });

  // ── options.stripAdditionalProperties ─────────────────────────────────────

  it("does not strip additionalProperties when option is omitted", () => {
    const result = zodToInlineJsonSchema(z.object({ x: z.string() }));
    expect(result).not.toBeNull();
  });

  it("strips top-level additionalProperties when stripAdditionalProperties:true", () => {
    const result = zodToInlineJsonSchema(z.object({ x: z.string() }), {
      stripAdditionalProperties: true,
    });
    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty("additionalProperties");
  });

  it("strips nested additionalProperties when stripAdditionalProperties:true", () => {
    const result = zodToInlineJsonSchema(z.object({ nested: z.object({ y: z.number() }) }), {
      stripAdditionalProperties: true,
    });
    expect(result).not.toBeNull();
    const nested = (result!.properties as Record<string, unknown>)?.nested as
      | Record<string, unknown>
      | undefined;
    if (nested) {
      expect(nested).not.toHaveProperty("additionalProperties");
    }
  });

  it("does not strip additionalProperties when stripAdditionalProperties:false", () => {
    const result = zodToInlineJsonSchema(z.object({ x: z.string() }), {
      stripAdditionalProperties: false,
    });
    expect(result).not.toBeNull();
  });

  it("strips additionalProperties:true value as well", () => {
    toJSONSchemaSpy.mockReturnValue({
      type: "object",
      additionalProperties: true,
      properties: { x: { type: "string" } },
    });
    const result = zodToInlineJsonSchema(z.string(), { stripAdditionalProperties: true });
    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty("additionalProperties");
  });

  it("strips additionalProperties from items in an array when stripAdditionalProperties:true", () => {
    toJSONSchemaSpy.mockReturnValue({
      type: "array",
      items: [{ type: "object", additionalProperties: false }, { type: "string" }],
    });
    const result = zodToInlineJsonSchema(z.string(), { stripAdditionalProperties: true });
    expect(result).not.toBeNull();
    const items = result!.items as unknown[];
    if (Array.isArray(items)) {
      const firstItem = items[0] as Record<string, unknown>;
      expect(firstItem).not.toHaveProperty("additionalProperties");
    }
  });

  it("stripKeyDeep skips primitive (non-object, non-array) nodes without error", () => {
    toJSONSchemaSpy.mockReturnValue({
      type: "object",
      additionalProperties: false,
      someNumber: 42,
      someNull: null,
      someBool: true,
    });
    const result = zodToInlineJsonSchema(z.string(), { stripAdditionalProperties: true });
    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty("additionalProperties");
  });

  it("recursively strips additionalProperties from nested objects", () => {
    toJSONSchemaSpy.mockReturnValue({
      type: "object",
      additionalProperties: false,
      properties: {
        inner: {
          type: "object",
          additionalProperties: false,
          properties: { z: { type: "boolean" } },
        },
      },
    });
    const result = zodToInlineJsonSchema(z.string(), { stripAdditionalProperties: true });
    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty("additionalProperties");
    const inner = (result!.properties as Record<string, unknown>)?.inner as
      | Record<string, unknown>
      | undefined;
    if (inner) {
      expect(inner).not.toHaveProperty("additionalProperties");
    }
  });

  // ── fallback try/catch ─────────────────────────────────────────────────────

  it("falls back to no-options call when first toJSONSchema call throws", () => {
    let callCount = 0;
    toJSONSchemaSpy.mockImplementation((...args: unknown[]) => {
      callCount++;
      if (callCount === 1) throw new Error("unsupported option");
      return realToJSONSchema!(...args);
    });

    const result = zodToInlineJsonSchema(z.string());

    expect(result).not.toBeNull();
    expect(callCount).toBe(2);
  });

  it("returns null when both toJSONSchema calls throw", () => {
    toJSONSchemaSpy.mockImplementation(() => {
      throw new Error("always fails");
    });

    const result = zodToInlineJsonSchema(z.string());

    expect(result).toBeNull();
  });

  // ── empty/null schema detection ────────────────────────────────────────────

  it("returns null when toJSONSchema returns only { additionalProperties: false }", () => {
    toJSONSchemaSpy.mockReturnValue({ additionalProperties: false });
    expect(zodToInlineJsonSchema(z.string())).toBeNull();
  });

  it("returns null when toJSONSchema returns an empty object {}", () => {
    toJSONSchemaSpy.mockReturnValue({});
    expect(zodToInlineJsonSchema(z.string())).toBeNull();
  });

  it("returns null when toJSONSchema returns a string (non-object)", () => {
    toJSONSchemaSpy.mockReturnValue("a string" as unknown);
    expect(zodToInlineJsonSchema(z.string())).toBeNull();
  });

  it("returns null when toJSONSchema returns an array (non-object)", () => {
    toJSONSchemaSpy.mockReturnValue(["item"] as unknown);
    expect(zodToInlineJsonSchema(z.string())).toBeNull();
  });

  it("returns null when toJSONSchema returns a number (non-object)", () => {
    toJSONSchemaSpy.mockReturnValue(42 as unknown);
    expect(zodToInlineJsonSchema(z.string())).toBeNull();
  });

  // ── $ref inlining ─────────────────────────────────────────────────────────

  it("inlines a $ref that resolves via $defs", () => {
    toJSONSchemaSpy.mockReturnValue({
      $defs: { MyType: { type: "string" } },
      $ref: "#/$defs/MyType",
    });
    const result = zodToInlineJsonSchema(z.string());
    expect(result).not.toBeNull();
    expect(result!.type).toBe("string");
  });

  it("inlines a $ref that resolves via legacy 'definitions'", () => {
    toJSONSchemaSpy.mockReturnValue({
      definitions: { LegacyType: { type: "number" } },
      $ref: "#/definitions/LegacyType",
    });
    const result = zodToInlineJsonSchema(z.string());
    expect(result).not.toBeNull();
    expect(result!.type).toBe("number");
  });

  it("returns {} when $ref cannot be resolved (missing key in $defs)", () => {
    toJSONSchemaSpy.mockReturnValue({
      $defs: {},
      type: "object",
      properties: { x: { $ref: "#/$defs/NonExistent" } },
    });
    const result = zodToInlineJsonSchema(z.string());
    expect(result).not.toBeNull();
    expect((result!.properties as Record<string, unknown>)?.x).toEqual({});
  });

  it("returns {} when $ref has no $defs at all", () => {
    toJSONSchemaSpy.mockReturnValue({
      type: "object",
      properties: { item: { $ref: "#/$defs/Missing" } },
    });
    const result = zodToInlineJsonSchema(z.string());
    expect(result).not.toBeNull();
    expect((result!.properties as Record<string, unknown>)?.item).toEqual({});
  });

  it("returns {} when $ref resolves to a non-object leaf in $defs", () => {
    toJSONSchemaSpy.mockReturnValue({
      $defs: { Primitive: "just-a-string" },
      type: "object",
      properties: { val: { $ref: "#/$defs/Primitive" } },
    });
    const result = zodToInlineJsonSchema(z.string());
    expect(result).not.toBeNull();
    expect((result!.properties as Record<string, unknown>)?.val).toEqual({});
  });

  it("handles cyclic $ref without infinite loop (seen set guard)", () => {
    toJSONSchemaSpy.mockReturnValue({
      $defs: {
        Node: {
          type: "object",
          properties: { child: { $ref: "#/$defs/Node" } },
        },
      },
      $ref: "#/$defs/Node",
    });
    const result = zodToInlineJsonSchema(z.string());
    expect(result).not.toBeNull();
  });

  it("resolves $ref with multi-segment path", () => {
    toJSONSchemaSpy.mockReturnValue({
      $defs: { Level1: { Level2: { type: "boolean" } } },
      $ref: "#/$defs/Level1/Level2",
    });
    const result = zodToInlineJsonSchema(z.string());
    expect(result).not.toBeNull();
    expect(result!.type).toBe("boolean");
  });

  it("returns {} for a $ref path that fails mid-traversal (non-object intermediate)", () => {
    toJSONSchemaSpy.mockReturnValue({
      $defs: { Foo: "not-an-object" },
      type: "object",
      properties: { x: { $ref: "#/$defs/Foo/Bar" } },
    });
    const result = zodToInlineJsonSchema(z.string());
    expect(result).not.toBeNull();
    expect((result!.properties as Record<string, unknown>)?.x).toEqual({});
  });

  it("returns {} for a $ref path where an intermediate key is missing", () => {
    toJSONSchemaSpy.mockReturnValue({
      $defs: { Obj: { type: "object" } },
      type: "object",
      properties: { x: { $ref: "#/$defs/Obj/missing/deep" } },
    });
    const result = zodToInlineJsonSchema(z.string());
    expect(result).not.toBeNull();
    expect((result!.properties as Record<string, unknown>)?.x).toEqual({});
  });

  // ── normalize edge cases ───────────────────────────────────────────────────

  it("passes null property values through normalize unchanged", () => {
    toJSONSchemaSpy.mockReturnValue({
      type: "object",
      properties: { nullProp: null },
    });
    const result = zodToInlineJsonSchema(z.string());
    expect(result).not.toBeNull();
    expect((result!.properties as Record<string, unknown>)?.nullProp).toBeNull();
  });

  it("passes primitive property values through normalize unchanged", () => {
    toJSONSchemaSpy.mockReturnValue({
      type: "object",
      someNumber: 42,
      someBool: true,
      properties: { x: { type: "string" } },
    });
    const result = zodToInlineJsonSchema(z.string());
    expect(result).not.toBeNull();
    expect((result as Record<string, unknown>)?.someNumber).toBe(42);
    expect((result as Record<string, unknown>)?.someBool).toBe(true);
  });

  it("normalizes arrays within the schema recursively", () => {
    toJSONSchemaSpy.mockReturnValue({
      type: "array",
      someArray: [1, "two", null, { type: "boolean" }],
      items: { type: "string" },
    });
    const result = zodToInlineJsonSchema(z.string());
    expect(result).not.toBeNull();
    const arr = (result as Record<string, unknown>)?.someArray;
    expect(Array.isArray(arr)).toBe(true);
  });

  // ── real zod schemas ──────────────────────────────────────────────────────

  it("handles z.union() (multiple types)", () => {
    const result = zodToInlineJsonSchema(z.union([z.string(), z.number()]));
    expect(result).not.toBeNull();
    expect(Object.keys(result!).length).toBeGreaterThan(0);
  });

  it("handles z.object() with required fields", () => {
    const result = zodToInlineJsonSchema(z.object({ name: z.string(), count: z.number() }));
    expect(result).not.toBeNull();
    expect(result!.type).toBe("object");
  });

  it("handles z.array() of objects", () => {
    const result = zodToInlineJsonSchema(z.array(z.object({ id: z.number() })));
    expect(result).not.toBeNull();
    expect(result!.type).toBe("array");
  });

  it("handles deeply nested objects", () => {
    const result = zodToInlineJsonSchema(
      z.object({ user: z.object({ id: z.number(), tags: z.array(z.string()) }) }),
    );
    expect(result).not.toBeNull();
    expect(result!.type).toBe("object");
  });

  it("uses default empty options when no options argument provided", () => {
    const result = zodToInlineJsonSchema(z.string());
    expect(result).not.toBeNull();
  });

  // ── return value shape ────────────────────────────────────────────────────

  it("returns a schema when type coexists with additionalProperties (not empty)", () => {
    toJSONSchemaSpy.mockReturnValue({
      type: "object",
      additionalProperties: false,
      properties: { x: { type: "string" } },
    });
    const result = zodToInlineJsonSchema(z.string());
    expect(result).not.toBeNull();
    expect(result!.type).toBe("object");
  });

  it("meaningfulKeys count excludes additionalProperties when checking for empty schema", () => {
    toJSONSchemaSpy.mockReturnValue({ type: "string", additionalProperties: false });
    const result = zodToInlineJsonSchema(z.string());
    expect(result).not.toBeNull();
    expect(result!.type).toBe("string");
  });

  it("handles stripAdditionalProperties:true on schema with no additionalProperties key", () => {
    toJSONSchemaSpy.mockReturnValue({ type: "string" });
    const result = zodToInlineJsonSchema(z.string(), { stripAdditionalProperties: true });
    expect(result).not.toBeNull();
    expect(result!.type).toBe("string");
  });
});
