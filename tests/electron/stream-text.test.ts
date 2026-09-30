import { describe, expect, it, vi } from "vitest";
import { createTextChunkNormalizer } from "../../electron/stream-text";

describe("createTextChunkNormalizer", () => {
  it("forwards text chunks unchanged", () => {
    const onText = vi.fn();
    const stream = createTextChunkNormalizer(onText);

    stream.push("Bonjour ");
    stream.push("Ali");
    stream.flush();

    expect(onText.mock.calls.flat()).toEqual(["Bonjour ", "Ali"]);
  });

  it("decodes byte chunks instead of stringifying decimal byte values", () => {
    const onText = vi.fn();
    const stream = createTextChunkNormalizer(onText);
    const bytes = new TextEncoder().encode("salut");

    stream.push(bytes);
    stream.flush();

    expect(onText.mock.calls.flat().join("")).toBe("salut");
    expect(onText.mock.calls.flat().join("")).not.toContain("115,");
  });

  it("preserves split UTF-8 characters across chunks", () => {
    const onText = vi.fn();
    const stream = createTextChunkNormalizer(onText);
    const bytes = new TextEncoder().encode("é");

    stream.push(bytes.subarray(0, 1));
    stream.push(bytes.subarray(1));
    stream.flush();

    expect(onText.mock.calls.flat().join("")).toBe("é");
  });

  it("accepts Buffer-shaped payloads and ignores scalar token ids", () => {
    const onText = vi.fn();
    const stream = createTextChunkNormalizer(onText);

    stream.push({ type: "Buffer", data: [111, 107] });
    stream.push(115);
    stream.flush();

    expect(onText.mock.calls.flat().join("")).toBe("ok");
  });
});
