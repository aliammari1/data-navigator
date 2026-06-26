import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { compress, decompress } from "@/platform/storage/compression";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Encode a value to a plain UTF-8 ArrayBuffer (no gzip). */
function encodeJson(value: unknown): ArrayBuffer {
  return new TextEncoder().encode(JSON.stringify(value)).buffer as ArrayBuffer;
}

// ---------------------------------------------------------------------------
// compress()
// ---------------------------------------------------------------------------

describe("compress", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns an ArrayBuffer", async () => {
    // Arrange – CompressionStream and Response are present in jsdom (via the
    // setup/vitest globals). Ensure they are available.
    // Act
    const result = await compress({ hello: "world" });
    // Assert
    expect(result).toBeInstanceOf(ArrayBuffer);
  });

  it("uses the fallback (uncompressed) path when CompressionStream is undefined", async () => {
    // Arrange
    vi.stubGlobal("CompressionStream", undefined);
    const data = { key: "value", num: 42 };

    // Act
    const result = await compress(data);

    // Assert – result should be the raw UTF-8 JSON bytes, decodable directly
    const decoded = JSON.parse(new TextDecoder().decode(result));
    expect(decoded).toEqual(data);
  });

  it("uses the fallback path when Response is undefined", async () => {
    // Arrange
    vi.stubGlobal("Response", undefined);
    const data = [1, 2, 3];

    // Act
    const result = await compress(data);

    // Assert
    const decoded = JSON.parse(new TextDecoder().decode(result));
    expect(decoded).toEqual(data);
  });

  it("uses the fallback when both CompressionStream and Response are undefined", async () => {
    // Arrange
    vi.stubGlobal("CompressionStream", undefined);
    vi.stubGlobal("Response", undefined);
    const data = { nested: { a: 1 } };

    // Act
    const result = await compress(data);

    // Assert
    const decoded = JSON.parse(new TextDecoder().decode(result));
    expect(decoded).toEqual(data);
  });

  it("compresses data with the gzip path and produces an ArrayBuffer", async () => {
    // Arrange – use the real CompressionStream/Response (available in jsdom)
    const data = { message: "compress me", count: 100 };

    // Act
    const compressed = await compress(data);

    // Assert – compressed output exists and is an ArrayBuffer
    expect(compressed).toBeInstanceOf(ArrayBuffer);
    expect(compressed.byteLength).toBeGreaterThan(0);
  });

  it("handles null data on the gzip path", async () => {
    const result = await compress(null);
    expect(result).toBeInstanceOf(ArrayBuffer);
  });

  it("handles primitive string data on the fallback path", async () => {
    vi.stubGlobal("CompressionStream", undefined);
    const result = await compress("hello string");
    const decoded = JSON.parse(new TextDecoder().decode(result));
    expect(decoded).toBe("hello string");
  });
});

// ---------------------------------------------------------------------------
// decompress()
// ---------------------------------------------------------------------------

describe("decompress", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("decompresses a gzip-compressed buffer produced by compress()", async () => {
    // Arrange – compress with real API, then decompress
    const original = { foo: "bar", n: 99 };
    const compressed = await compress(original);

    // Act
    const result = await decompress(compressed);

    // Assert
    expect(result).toEqual(original);
  });

  it("uses the fallback (raw JSON) path when DecompressionStream is undefined", async () => {
    // Arrange
    vi.stubGlobal("DecompressionStream", undefined);
    const data = { x: 1 };
    const buf = encodeJson(data);

    // Act
    const result = await decompress(buf);

    // Assert
    expect(result).toEqual(data);
  });

  it("uses the fallback path when Response is undefined", async () => {
    // Arrange
    vi.stubGlobal("Response", undefined);
    const data = [10, 20, 30];
    const buf = encodeJson(data);

    // Act
    const result = await decompress(buf);

    // Assert
    expect(result).toEqual(data);
  });

  it("uses the fallback path when both DecompressionStream and Response are undefined", async () => {
    // Arrange
    vi.stubGlobal("DecompressionStream", undefined);
    vi.stubGlobal("Response", undefined);
    const data = { nested: true };
    const buf = encodeJson(data);

    // Act
    const result = await decompress(buf);

    // Assert
    expect(result).toEqual(data);
  });

  it("falls back to raw JSON decode when the buffer is not gzip-compressed (catch path)", async () => {
    // Arrange – passing a plain JSON buffer to the gzip decompressor will
    // throw (invalid gzip magic bytes). The catch block should handle it.
    const data = { legacy: "entry", value: 123 };
    const rawBuf = encodeJson(data);

    // Act – DecompressionStream is present so the gzip path runs and throws
    const result = await decompress(rawBuf);

    // Assert – catch path returns the raw JSON parse result
    expect(result).toEqual(data);
  });

  it("handles decompressing a null-value payload", async () => {
    // Arrange
    const compressed = await compress(null);
    // Act
    const result = await decompress(compressed);
    // Assert
    expect(result).toBeNull();
  });

  it("handles decompressing an array payload", async () => {
    const original = [1, "two", true, null];
    const compressed = await compress(original);
    const result = await decompress(compressed);
    expect(result).toEqual(original);
  });

  it("handles decompressing a primitive number payload", async () => {
    const original = 42;
    const compressed = await compress(original);
    const result = await decompress(compressed);
    expect(result).toBe(original);
  });

  it("catch path handles a zero-byte ArrayBuffer gracefully by throwing JSON parse error", async () => {
    // Arrange – empty buffer is invalid both as gzip and as JSON
    const emptyBuf = new ArrayBuffer(0);

    // Act / Assert – catch block runs raw JSON decode on empty string which throws
    await expect(decompress(emptyBuf)).rejects.toThrow();
  });
});
