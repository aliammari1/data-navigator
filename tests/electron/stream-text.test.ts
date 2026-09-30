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

  it("accepts ArrayBuffer and DataView chunks", () => {
    const onText = vi.fn();
    const stream = createTextChunkNormalizer(onText);

    const encoded = new TextEncoder().encode("ab");
    stream.push(encoded.buffer);
    const view = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength);
    stream.push(view);
    stream.flush();

    expect(onText.mock.calls.flat().join("")).toBe("abab");
  });

  it("accepts plain number byte arrays", () => {
    const onText = vi.fn();
    const stream = createTextChunkNormalizer(onText);

    stream.push([104, 105]); // "hi"
    stream.flush();

    expect(onText.mock.calls.flat().join("")).toBe("hi");
  });

  it("flushes tail when switching from byte decoding to string chunks", () => {
    const onText = vi.fn();
    const stream = createTextChunkNormalizer(onText);

    stream.push(new TextEncoder().encode("hello "));
    stream.push("world");
    stream.flush();

    expect(onText.mock.calls.flat().join("")).toBe("hello world");
  });

  it("ignores invalid shapes and handles noop flush", () => {
    const onText = vi.fn();
    const stream = createTextChunkNormalizer(onText);

    stream.push(null);
    stream.push({});
    stream.push({ data: [300] });
    stream.push([-1]);
    stream.push("");
    stream.flush();

    expect(onText).not.toHaveBeenCalled();
  });
});
