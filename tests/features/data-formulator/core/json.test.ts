import { describe, it, expect, vi } from "vitest";
import {
  bigIntJsonReplacer,
  sanitizeJsonValue,
  safeJsonStringify,
} from "@/features/data-formulator/core/json";

describe("bigIntJsonReplacer", () => {
  it("returns non-bigint values unchanged", () => {
    expect(bigIntJsonReplacer("key", 42)).toBe(42);
    expect(bigIntJsonReplacer("key", "hello")).toBe("hello");
    expect(bigIntJsonReplacer("key", null)).toBeNull();
    expect(bigIntJsonReplacer("key", true)).toBe(true);
    expect(bigIntJsonReplacer("key", undefined)).toBeUndefined();
    expect(bigIntJsonReplacer("key", { a: 1 })).toEqual({ a: 1 });
  });

  it("converts a small bigint to a number", () => {
    const result = bigIntJsonReplacer("key", BigInt(42));
    expect(result).toBe(42);
    expect(typeof result).toBe("number");
  });

  it("converts negative small bigint to a number", () => {
    const result = bigIntJsonReplacer("key", BigInt(-100));
    expect(result).toBe(-100);
    expect(typeof result).toBe("number");
  });

  it("converts bigint within MAX_SAFE_INTEGER to number", () => {
    const safe = BigInt(Number.MAX_SAFE_INTEGER);
    const result = bigIntJsonReplacer("key", safe);
    expect(result).toBe(Number.MAX_SAFE_INTEGER);
    expect(typeof result).toBe("number");
  });

  it("converts bigint larger than MAX_SAFE_INTEGER to string", () => {
    const large = BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1);
    const result = bigIntJsonReplacer("key", large);
    expect(result).toBe(large.toString());
    expect(typeof result).toBe("string");
  });

  it("converts very large bigint to string", () => {
    const veryLarge = BigInt("99999999999999999999");
    const result = bigIntJsonReplacer("key", veryLarge);
    expect(result).toBe(veryLarge.toString());
    expect(typeof result).toBe("string");
  });

  it("converts large negative bigint to string", () => {
    const large = -(BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1));
    const result = bigIntJsonReplacer("key", large);
    expect(result).toBe(large.toString());
    expect(typeof result).toBe("string");
  });
});

describe("sanitizeJsonValue", () => {
  it("returns primitives unchanged", () => {
    expect(sanitizeJsonValue(42)).toBe(42);
    expect(sanitizeJsonValue("hello")).toBe("hello");
    expect(sanitizeJsonValue(true)).toBe(true);
    expect(sanitizeJsonValue(null)).toBeNull();
    expect(sanitizeJsonValue(undefined)).toBeUndefined();
  });

  it("converts a small bigint to a number", () => {
    const result = sanitizeJsonValue(BigInt(123));
    expect(result).toBe(123);
  });

  it("converts a large bigint to a string", () => {
    const large = BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1);
    const result = sanitizeJsonValue(large);
    expect(result).toBe(large.toString());
  });

  it("recursively sanitizes arrays", () => {
    const input = [BigInt(1), BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1), "text", 42];
    const result = sanitizeJsonValue(input);
    expect(result).toEqual([1, (BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1)).toString(), "text", 42]);
  });

  it("recursively sanitizes nested arrays", () => {
    const input = [[BigInt(5), BigInt(6)], [1, 2]];
    const result = sanitizeJsonValue(input);
    expect(result).toEqual([[5, 6], [1, 2]]);
  });

  it("recursively sanitizes plain objects", () => {
    const input = { a: BigInt(10), b: "str", c: 99 };
    const result = sanitizeJsonValue(input);
    expect(result).toEqual({ a: 10, b: "str", c: 99 });
  });

  it("recursively sanitizes nested objects", () => {
    const input = { outer: { inner: BigInt(42) } };
    const result = sanitizeJsonValue(input);
    expect(result).toEqual({ outer: { inner: 42 } });
  });

  it("leaves Date objects unchanged (does not iterate Date as object)", () => {
    const date = new Date("2024-01-01");
    const result = sanitizeJsonValue(date);
    expect(result).toBe(date);
  });

  it("leaves Blob objects unchanged", () => {
    const blob = new Blob(["hello"], { type: "text/plain" });
    const result = sanitizeJsonValue(blob);
    expect(result).toBe(blob);
  });

  it("leaves File objects unchanged", () => {
    const file = new File(["hello"], "hello.txt", { type: "text/plain" });
    const result = sanitizeJsonValue(file);
    expect(result).toBe(file);
  });

  it("handles an empty object", () => {
    const result = sanitizeJsonValue({});
    expect(result).toEqual({});
  });

  it("handles an empty array", () => {
    const result = sanitizeJsonValue([]);
    expect(result).toEqual([]);
  });

  it("handles objects with mixed value types", () => {
    const input = {
      num: 1,
      str: "hello",
      big: BigInt(5),
      arr: [BigInt(7), "world"],
      nested: { deep: BigInt(99) },
      date: new Date("2024-01-01"),
    };
    const result = sanitizeJsonValue(input) as Record<string, unknown>;
    expect(result.num).toBe(1);
    expect(result.str).toBe("hello");
    expect(result.big).toBe(5);
    expect(result.arr).toEqual([7, "world"]);
    expect((result.nested as Record<string, unknown>).deep).toBe(99);
    expect(result.date).toBeInstanceOf(Date);
  });
});

describe("safeJsonStringify", () => {
  it("serializes a plain value", () => {
    expect(safeJsonStringify({ a: 1 })).toBe('{"a":1}');
  });

  it("serializes with indentation space", () => {
    const result = safeJsonStringify({ a: 1 }, 2);
    expect(result).toBe(JSON.stringify({ a: 1 }, null, 2));
  });

  it("converts small bigint to number in JSON output", () => {
    const result = safeJsonStringify({ n: BigInt(42) });
    expect(result).toBe('{"n":42}');
  });

  it("converts large bigint to string in JSON output", () => {
    const large = BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1);
    const result = safeJsonStringify({ n: large });
    expect(result).toBe(`{"n":"${large.toString()}"}`);
  });

  it("returns error JSON when serialization throws with an Error", () => {
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;
    const result = safeJsonStringify(circular);
    const parsed = JSON.parse(result) as { error: string; message: string };
    expect(parsed.error).toBe("Unable to serialize value");
    expect(typeof parsed.message).toBe("string");
    expect(parsed.message.length).toBeGreaterThan(0);
  });

  it("returns error JSON when serialization throws with a non-Error (string throw)", () => {
    // We use a custom replacer trick: pass an object with a toJSON that throws a string
    const badObj = {
      toJSON() {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw "string error";
      },
    };
    const result = safeJsonStringify(badObj);
    const parsed = JSON.parse(result) as { error: string; message: string };
    expect(parsed.error).toBe("Unable to serialize value");
    expect(parsed.message).toBe("string error");
  });

  it("serializes null", () => {
    expect(safeJsonStringify(null)).toBe("null");
  });

  it("serializes a string", () => {
    expect(safeJsonStringify("hello")).toBe('"hello"');
  });

  it("serializes an array with bigints", () => {
    const result = safeJsonStringify([BigInt(1), BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1)]);
    const large = BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1);
    expect(result).toBe(`[1,"${large.toString()}"]`);
  });

  it("uses space parameter for formatting", () => {
    const result = safeJsonStringify([1, 2], 4);
    expect(result).toBe(JSON.stringify([1, 2], null, 4));
  });
});
