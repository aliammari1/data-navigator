import { describe, expect, it, vi } from "vitest";
import {
  createRendererTextChunkNormalizer,
  normalizeCompleteStreamText,
} from "@/platform/chat/stream-text";

describe("stream-text", () => {
  describe("normalizeCompleteStreamText", () => {
    it("handles regular strings as-is", () => {
      expect(normalizeCompleteStreamText("Hello world")).toBe("Hello world");
    });

    it("decodes serialized comma-delimited UTF-8 byte strings", () => {
      const bytes = new TextEncoder().encode("Hello from bytes");
      const serialized = Array.from(bytes).join(",");
      expect(normalizeCompleteStreamText(serialized)).toBe("Hello from bytes");
    });

    it("returns original string if numbers exceed 255", () => {
      const invalid = "100,200,300,100,200,100";
      expect(normalizeCompleteStreamText(invalid)).toBe(invalid);
    });

    it("returns original string if decoded content is non-printable binary garbage", () => {
      const binary = "0,1,2,3,4,5,6,7";
      expect(normalizeCompleteStreamText(binary)).toBe(binary);
    });

    it("decodes Uint8Array instances directly", () => {
      const encoded = new TextEncoder().encode("Uint8Array text");
      expect(normalizeCompleteStreamText(encoded)).toBe("Uint8Array text");
    });

    it("decodes ArrayBuffer instances", () => {
      const encoded = new TextEncoder().encode("ArrayBuffer text");
      expect(normalizeCompleteStreamText(encoded.buffer)).toBe("ArrayBuffer text");
    });

    it("decodes ArrayBuffer views (e.g. DataView)", () => {
      const encoded = new TextEncoder().encode("DataView text");
      const view = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength);
      expect(normalizeCompleteStreamText(view)).toBe("DataView text");
    });

    it("decodes numeric byte arrays", () => {
      const arr = Array.from(new TextEncoder().encode("Byte array"));
      expect(normalizeCompleteStreamText(arr)).toBe("Byte array");
    });

    it("rejects invalid numeric byte arrays", () => {
      expect(normalizeCompleteStreamText([])).toBe("");
      expect(normalizeCompleteStreamText([1, 2, 300])).toBe("");
      expect(normalizeCompleteStreamText([1, 2, -5])).toBe("");
      expect(normalizeCompleteStreamText([1, 2, 3.5])).toBe("");
    });

    it("decodes Buffer-shaped objects with data array", () => {
      const arr = Array.from(new TextEncoder().encode("Buffer data"));
      expect(normalizeCompleteStreamText({ data: arr })).toBe("Buffer data");
    });

    it("rejects invalid Buffer-shaped objects", () => {
      expect(normalizeCompleteStreamText({ data: [] })).toBe("");
      expect(normalizeCompleteStreamText({ data: [300, 400] })).toBe("");
      expect(normalizeCompleteStreamText({ data: null })).toBe("");
      expect(normalizeCompleteStreamText({ data: "invalid" })).toBe("");
      expect(normalizeCompleteStreamText({})).toBe("");
    });

    it("returns empty string for null, undefined, or numbers", () => {
      expect(normalizeCompleteStreamText(null)).toBe("");
      expect(normalizeCompleteStreamText(undefined)).toBe("");
      expect(normalizeCompleteStreamText(12345)).toBe("");
      expect(normalizeCompleteStreamText(true)).toBe("");
    });
  });

  describe("createRendererTextChunkNormalizer", () => {
    it("pushes string chunks and calls onText", () => {
      const onText = vi.fn();
      const normalizer = createRendererTextChunkNormalizer(onText);

      normalizer.push("chunk1 ");
      normalizer.push("chunk2");
      normalizer.flush();

      expect(onText).toHaveBeenCalledWith("chunk1 ");
      expect(onText).toHaveBeenCalledWith("chunk2");
    });

    it("handles serialized comma-separated strings inside string chunks", () => {
      const onText = vi.fn();
      const normalizer = createRendererTextChunkNormalizer(onText);

      const serialized = Array.from(new TextEncoder().encode("Bonjour")).join(",");
      normalizer.push(serialized);
      normalizer.flush();

      expect(onText).toHaveBeenCalledWith("Bonjour");
    });

    it("handles byte chunks and decodes stream with multibyte characters across chunk boundaries", () => {
      const onText = vi.fn();
      const normalizer = createRendererTextChunkNormalizer(onText);

      const multiByte = new TextEncoder().encode("héros");
      // Split in the middle of 'é' (UTF-8 0xC3 0xA9)
      normalizer.push(multiByte.subarray(0, 2)); // 'h' + first half of 'é'
      normalizer.push(multiByte.subarray(2)); // second half of 'é' + 'ros'
      normalizer.flush();

      expect(onText.mock.calls.flat().join("")).toBe("héros");
    });

    it("flushes tail when transitioning from byte chunks to string chunks", () => {
      const onText = vi.fn();
      const normalizer = createRendererTextChunkNormalizer(onText);

      const bytes = new TextEncoder().encode("Prefix ");
      normalizer.push(bytes);
      normalizer.push("Suffix");
      normalizer.flush();

      expect(onText.mock.calls.flat().join("")).toBe("Prefix Suffix");
    });

    it("ignores unknown or empty chunks", () => {
      const onText = vi.fn();
      const normalizer = createRendererTextChunkNormalizer(onText);

      normalizer.push(null);
      normalizer.push(123);
      normalizer.push("");
      normalizer.flush();

      expect(onText).not.toHaveBeenCalled();
    });

    it("does nothing on flush when no bytes were being decoded", () => {
      const onText = vi.fn();
      const normalizer = createRendererTextChunkNormalizer(onText);

      normalizer.flush();
      expect(onText).not.toHaveBeenCalled();
    });
  });
});
