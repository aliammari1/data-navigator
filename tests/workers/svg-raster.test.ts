import { describe, it, expect, vi, beforeEach } from "vitest";

// jsdom (this repo's vitest environment) implements neither OffscreenCanvas
// nor createImageBitmap, so both are stubbed as globals per test — mirroring
// how the previous resvg-raster test stubbed `fetch`. `unstubGlobals: true` /
// `restoreMocks: true` in vitest.config.ts clean these up automatically.

// ─── Fake OffscreenCanvas capturing draw-order + constructor args ────────────
class FakeCanvasContext {
  calls: Array<{ op: string; args: unknown[] }> = [];
  fillStyle = "";

  fillRect(...args: unknown[]) {
    this.calls.push({ op: "fillRect", args: [this.fillStyle, ...args] });
  }
  drawImage(...args: unknown[]) {
    this.calls.push({ op: "drawImage", args });
  }
}

let lastCanvas: FakeOffscreenCanvas | null = null;
let lastContext: FakeCanvasContext | null = null;
let convertToBlobResult = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });

class FakeOffscreenCanvas {
  width: number;
  height: number;
  ctx = new FakeCanvasContext();

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    lastCanvas = this;
    lastContext = this.ctx;
  }

  getContext(_kind: string) {
    return this.ctx;
  }

  async convertToBlob(_opts?: unknown) {
    return convertToBlobResult;
  }
}

// ─── Import target AFTER globals are wired in beforeEach ────────────────────
import { svgToPng, pngToDataUri, getNaturalSize } from "@/workers/svg-raster";

describe("svg-raster", () => {
  beforeEach(() => {
    lastCanvas = null;
    lastContext = null;
    convertToBlobResult = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });

    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async (_source: unknown, opts: { resizeWidth: number; resizeHeight: number }) => ({
        width: opts.resizeWidth,
        height: opts.resizeHeight,
        close: vi.fn(),
      })),
    );
    vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);
  });

  // ─── getNaturalSize (dimension-parsing branches) ──────────────────────────

  describe("getNaturalSize", () => {
    it("prefers explicit numeric width/height attributes", () => {
      const svg = '<svg width="400" height="200" viewBox="0 0 800 400"></svg>';
      expect(getNaturalSize(svg)).toEqual({ width: 400, height: 200 });
    });

    it("falls back to viewBox when width/height are absent", () => {
      const svg = '<svg viewBox="0 0 640 480"><rect/></svg>';
      expect(getNaturalSize(svg)).toEqual({ width: 640, height: 480 });
    });

    it("treats percentage width/height as absent and falls back to viewBox", () => {
      const svg = '<svg width="100%" height="100%" viewBox="0 0 300 150"></svg>';
      expect(getNaturalSize(svg)).toEqual({ width: 300, height: 150 });
    });

    it("falls back to the documented 100x100 default when neither is present", () => {
      const svg = "<svg><circle r='5'/></svg>";
      expect(getNaturalSize(svg)).toEqual({ width: 100, height: 100 });
    });

    it("falls back to the default when viewBox is malformed", () => {
      const svg = '<svg viewBox="not numbers"></svg>';
      expect(getNaturalSize(svg)).toEqual({ width: 100, height: 100 });
    });

    it("falls back to the default when there is no <svg> tag at all", () => {
      expect(getNaturalSize("not an svg string")).toEqual({ width: 100, height: 100 });
    });

    it("ignores a non-positive width/height attribute and falls back", () => {
      const svg = '<svg width="0" height="200"></svg>';
      expect(getNaturalSize(svg)).toEqual({ width: 100, height: 100 });
    });

    it("falls back when only one of width/height is present (no viewBox)", () => {
      const svg = '<svg width="300"></svg>';
      expect(getNaturalSize(svg)).toEqual({ width: 100, height: 100 });
    });

    it("ignores a non-positive viewBox width/height and falls back", () => {
      const svg = '<svg viewBox="0 0 0 0"></svg>';
      expect(getNaturalSize(svg)).toEqual({ width: 100, height: 100 });
    });
  });

  // ─── svgToPng ──────────────────────────────────────────────────────────────

  describe("svgToPng", () => {
    it("computes resizeWidth/resizeHeight from explicit width/height attrs and default widthPx=1200", async () => {
      const svg = '<svg width="400" height="200"></svg>';

      await svgToPng(svg);

      expect(globalThis.createImageBitmap).toHaveBeenCalledWith(
        expect.any(Blob),
        expect.objectContaining({ resizeWidth: 1200, resizeHeight: 600, resizeQuality: "high" }),
      );
    });

    it("computes resizeWidth/resizeHeight from a viewBox-only SVG", async () => {
      const svg = '<svg viewBox="0 0 640 480"></svg>';

      await svgToPng(svg);

      expect(globalThis.createImageBitmap).toHaveBeenCalledWith(
        expect.any(Blob),
        expect.objectContaining({ resizeWidth: 1200, resizeHeight: 900, resizeQuality: "high" }),
      );
    });

    it("accepts a custom widthPx and scales height accordingly", async () => {
      const svg = '<svg width="400" height="200"></svg>';

      await svgToPng(svg, 800);

      expect(globalThis.createImageBitmap).toHaveBeenCalledWith(
        expect.any(Blob),
        expect.objectContaining({ resizeWidth: 800, resizeHeight: 400, resizeQuality: "high" }),
      );
    });

    it("constructs an OffscreenCanvas sized to widthPx x targetHeight", async () => {
      const svg = '<svg width="400" height="200"></svg>';

      await svgToPng(svg, 600);

      expect(lastCanvas).not.toBeNull();
      expect(lastCanvas?.width).toBe(600);
      expect(lastCanvas?.height).toBe(300);
    });

    it("fills white before drawImage (flattens transparency like resvg's background:white)", async () => {
      const svg = '<svg width="100" height="100"></svg>';

      await svgToPng(svg);

      const ops = lastContext?.calls.map((c) => c.op);
      expect(ops).toEqual(["fillRect", "drawImage"]);
      expect(lastContext?.calls[0].args[0]).toBe("white");
    });

    it("closes the bitmap after drawing", async () => {
      const closeSpy = vi.fn();
      vi.stubGlobal(
        "createImageBitmap",
        vi.fn(async () => ({ width: 1, height: 1, close: closeSpy })),
      );
      const svg = '<svg width="100" height="100"></svg>';

      await svgToPng(svg);

      expect(closeSpy).toHaveBeenCalledTimes(1);
    });

    it("returns a Uint8Array derived from the canvas's PNG blob", async () => {
      const expectedBytes = new Uint8Array([1, 2, 3, 4, 5]);
      convertToBlobResult = new Blob([expectedBytes], { type: "image/png" });
      const svg = '<svg width="100" height="100"></svg>';

      const result = await svgToPng(svg);

      expect(result).toBeInstanceOf(Uint8Array);
      expect(Array.from(result)).toEqual(Array.from(expectedBytes));
    });

    it("uses the documented 100x100 fallback for a dimension-less/malformed SVG", async () => {
      const svg = "<svg><path d='M0 0'/></svg>";

      await svgToPng(svg, 500);

      // natural 100x100 -> targetHeight scales 1:1 with widthPx
      expect(globalThis.createImageBitmap).toHaveBeenCalledWith(
        expect.any(Blob),
        expect.objectContaining({ resizeWidth: 500, resizeHeight: 500, resizeQuality: "high" }),
      );
    });

    it("propagates a rejection from createImageBitmap (e.g. a real InvalidStateError)", async () => {
      vi.stubGlobal(
        "createImageBitmap",
        vi.fn(async () => {
          throw new DOMException("no natural dimensions", "InvalidStateError");
        }),
      );
      const svg = '<svg width="100" height="100"></svg>';

      await expect(svgToPng(svg)).rejects.toThrow(/svgToPng failed/);
    });

    it("propagates a rejection where the thrown value is not an Error instance", async () => {
      vi.stubGlobal(
        "createImageBitmap",
        vi.fn(async () => {
          // eslint-disable-next-line @typescript-eslint/no-throw-literal
          throw "decode failed";
        }),
      );
      const svg = '<svg width="100" height="100"></svg>';

      await expect(svgToPng(svg)).rejects.toThrow(/svgToPng failed.*decode failed/);
    });
  });

  // ─── pngToDataUri ──────────────────────────────────────────────────────────

  describe("pngToDataUri", () => {
    it("returns a string starting with 'data:image/png;base64,'", () => {
      const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

      const result = pngToDataUri(png);

      expect(result.startsWith("data:image/png;base64,")).toBe(true);
    });

    it("produces a valid base64 data URI for a known PNG header", () => {
      const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

      const result = pngToDataUri(png);

      const expected = `data:image/png;base64,${btoa(String.fromCodePoint(137, 80, 78, 71, 13, 10, 26, 10))}`;
      expect(result).toBe(expected);
    });

    it("handles an empty Uint8Array (produces 'data:image/png;base64,')", () => {
      const png = new Uint8Array(0);

      const result = pngToDataUri(png);

      expect(result).toBe("data:image/png;base64,");
    });

    it("handles small inputs (fewer than one chunk = 0x8000 bytes)", () => {
      const png = new Uint8Array(16).fill(0xab);

      const result = pngToDataUri(png);

      expect(result.startsWith("data:image/png;base64,")).toBe(true);
      const b64 = result.slice("data:image/png;base64,".length);
      const decoded = atob(b64);
      expect(decoded.length).toBe(16);
      for (let i = 0; i < decoded.length; i++) {
        expect(decoded.codePointAt(i)).toBe(0xab);
      }
    });

    it("handles inputs exactly equal to one chunk size (0x8000 = 32768 bytes)", () => {
      const CHUNK = 0x8000; // 32768
      const png = new Uint8Array(CHUNK).fill(0x42);

      const result = pngToDataUri(png);

      expect(result.startsWith("data:image/png;base64,")).toBe(true);
      const b64 = result.slice("data:image/png;base64,".length);
      const decoded = atob(b64);
      expect(decoded.length).toBe(CHUNK);
    });

    it("handles inputs larger than one chunk (multi-chunk path exercises the loop)", () => {
      const CHUNK = 0x8000;
      const size = Math.floor(CHUNK * 2.5);
      const png = new Uint8Array(size);
      for (let i = 0; i < size; i++) png[i] = i % 256;

      const result = pngToDataUri(png);

      expect(result.startsWith("data:image/png;base64,")).toBe(true);
      const b64 = result.slice("data:image/png;base64,".length);
      const decoded = atob(b64);
      expect(decoded.length).toBe(size);
      expect(decoded.codePointAt(0)).toBe(0);
      expect(decoded.codePointAt(CHUNK)).toBe(0);
    });

    it("produces the correct base64 string for a single-byte input", () => {
      const png = new Uint8Array([65]); // ASCII 'A'

      const result = pngToDataUri(png);

      expect(result).toBe(`data:image/png;base64,${btoa("A")}`);
    });

    it("round-trips correctly: decoded base64 matches original bytes", () => {
      const png = new Uint8Array(100);
      for (let i = 0; i < 100; i++) png[i] = (i * 7 + 13) % 256;

      const result = pngToDataUri(png);

      const b64 = result.slice("data:image/png;base64,".length);
      const decoded = atob(b64);
      expect(decoded.length).toBe(100);
      for (let i = 0; i < 100; i++) {
        expect(decoded.codePointAt(i)).toBe(png[i]);
      }
    });
  });
});
