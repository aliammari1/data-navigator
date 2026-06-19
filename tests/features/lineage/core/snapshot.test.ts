import { describe, expect, it } from "vitest";
import { hashInput } from "@/features/lineage/core/snapshot";

describe("hashInput", () => {
  it("returns an 8-character zero-padded hex string", () => {
    const hash = hashInput(["dataset:a:1"]);
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it("is deterministic for the same input", () => {
    const parts = ["a:1", "b:2", "c:3"];
    expect(hashInput(parts)).toBe(hashInput(parts));
  });

  it("is order-independent (sorts parts before hashing)", () => {
    expect(hashInput(["a", "b", "c"])).toBe(hashInput(["c", "a", "b"]));
  });

  it("produces different hashes for different content", () => {
    expect(hashInput(["dataset:a:1"])).not.toBe(hashInput(["dataset:a:2"]));
  });

  it("distinguishes inputs that differ only in length (length is mixed in)", () => {
    // Same characters, different grouping → the length mix-in must separate them.
    expect(hashInput(["ab", "c"])).not.toBe(hashInput(["a", "bc", ""]));
  });

  it("hashes an empty input set to a stable padded value", () => {
    const hash = hashInput([]);
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
    expect(hash).toBe(hashInput([]));
  });

  it("does not mutate the caller's array when sorting", () => {
    const parts = ["c", "a", "b"];
    hashInput(parts);
    expect(parts).toEqual(["c", "a", "b"]);
  });
});
