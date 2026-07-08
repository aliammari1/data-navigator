import { describe, expect, it } from "vitest";
import { pngToDataUri } from "@/workers/png-data-uri";

describe("pngToDataUri", () => {
  it("returns a string starting with 'data:image/png;base64,'", () => {
    // Arrange
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

    // Act
    const result = pngToDataUri(png);

    // Assert
    expect(result.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("produces a valid base64 data URI for a known PNG header", () => {
    // Arrange – PNG magic bytes: 137 80 78 71 13 10 26 10
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

    // Act
    const result = pngToDataUri(png);

    // Assert – manually compute the expected base64
    const expected =
      "data:image/png;base64," + btoa(String.fromCodePoint(137, 80, 78, 71, 13, 10, 26, 10));
    expect(result).toBe(expected);
  });

  it("handles an empty Uint8Array (produces 'data:image/png;base64,')", () => {
    // Arrange
    const png = new Uint8Array(0);

    // Act
    const result = pngToDataUri(png);

    // Assert
    expect(result).toBe("data:image/png;base64,");
  });

  it("handles small inputs (fewer than one chunk = 0x8000 bytes)", () => {
    // Arrange
    const png = new Uint8Array(16).fill(0xab);

    // Act
    const result = pngToDataUri(png);

    // Assert – must still be a valid data URI
    expect(result.startsWith("data:image/png;base64,")).toBe(true);
    // Verify round-trip: decode the base64 back and compare
    const b64 = result.slice("data:image/png;base64,".length);
    const decoded = atob(b64);
    expect(decoded.length).toBe(16);
    for (let i = 0; i < decoded.length; i++) {
      expect(decoded.codePointAt(i)).toBe(0xab);
    }
  });

  it("handles inputs exactly equal to one chunk size (0x8000 = 32768 bytes)", () => {
    // Arrange
    const CHUNK = 0x8000; // 32768
    const png = new Uint8Array(CHUNK).fill(0x42);

    // Act
    const result = pngToDataUri(png);

    // Assert
    expect(result.startsWith("data:image/png;base64,")).toBe(true);
    const b64 = result.slice("data:image/png;base64,".length);
    const decoded = atob(b64);
    expect(decoded.length).toBe(CHUNK);
  });

  it("handles inputs larger than one chunk (multi-chunk path exercises the loop)", () => {
    // Arrange – 2.5 chunks to execute the loop body more than once
    const CHUNK = 0x8000;
    const size = Math.floor(CHUNK * 2.5);
    const png = new Uint8Array(size);
    for (let i = 0; i < size; i++) png[i] = i % 256;

    // Act
    const result = pngToDataUri(png);

    // Assert
    expect(result.startsWith("data:image/png;base64,")).toBe(true);
    const b64 = result.slice("data:image/png;base64,".length);
    const decoded = atob(b64);
    expect(decoded.length).toBe(size);
    // Spot-check: first byte of second chunk (index CHUNK). CHUNK % 256 === 0
    expect(decoded.codePointAt(0)).toBe(0);
    expect(decoded.codePointAt(CHUNK)).toBe(0);
  });

  it("produces the correct base64 string for a single-byte input", () => {
    // Arrange
    const png = new Uint8Array([65]); // ASCII 'A'

    // Act
    const result = pngToDataUri(png);

    // Assert
    expect(result).toBe(`data:image/png;base64,${btoa("A")}`);
  });

  it("round-trips correctly: decoded base64 matches original bytes", () => {
    // Arrange – arbitrary 100-byte payload
    const png = new Uint8Array(100);
    for (let i = 0; i < 100; i++) png[i] = (i * 7 + 13) % 256;

    // Act
    const result = pngToDataUri(png);

    // Assert – decode and compare
    const b64 = result.slice("data:image/png;base64,".length);
    const decoded = atob(b64);
    expect(decoded.length).toBe(100);
    for (let i = 0; i < 100; i++) {
      expect(decoded.codePointAt(i)).toBe(png[i]);
    }
  });
});
