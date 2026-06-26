import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────
// vi.hoisted() runs before vi.mock() hoisting so variables are initialised in
// time for the factory function below.
const { mockInitWasm, mockAsPng, mockRender, getResvgInstances } = vi.hoisted(() => {
  const mockAsPng = vi.fn(() => new Uint8Array([137, 80, 78, 71]));
  const mockRender = vi.fn(function () {
    return { asPng: mockAsPng };
  });

  // Collect constructed instances so tests can inspect constructor args.
  const resvgInstances: Array<{ svg: string; opts: unknown }> = [];
  const getResvgInstances = () => resvgInstances;

  const mockInitWasm = vi.fn(() => Promise.resolve());

  return { mockInitWasm, mockAsPng, mockRender, getResvgInstances };
});

// ─── Resvg constructor mock (must live at module scope — not inside vi.mock) ──
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ResvgMock(this: any, svg: string, opts: unknown) {
  this.svg = svg;
  this.opts = opts;
  getResvgInstances().push({ svg, opts });
  this.render = mockRender;
}

// ─── Mock @resvg/resvg-wasm ──────────────────────────────────────────────────
// Resvg is used with `new`, so its mock must be a proper constructor function
// (not an arrow function).
vi.mock("@resvg/resvg-wasm", () => ({
  initWasm: mockInitWasm,
  Resvg: ResvgMock,
}));

// ─── Import target AFTER mocks are registered ────────────────────────────────
import { svgToPng, pngToDataUri } from "@/workers/resvg-raster";

describe("resvg-raster", () => {
  beforeEach(() => {
    // Fresh fetch stub before every test.
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response())));
    mockInitWasm.mockResolvedValue(undefined);
    mockAsPng.mockReturnValue(new Uint8Array([137, 80, 78, 71]));
    mockRender.mockReturnValue({ asPng: mockAsPng });
    // Clear the instances log.
    getResvgInstances().length = 0;
  });

  // ─── svgToPng ──────────────────────────────────────────────────────────────

  describe("svgToPng", () => {
    it("calls fetch with the self-hosted wasm URL", async () => {
      // Arrange
      const svg = "<svg><circle r='5'/></svg>";

      // Act
      await svgToPng(svg);

      // Assert
      expect(globalThis.fetch).toHaveBeenCalledWith("/wasm/resvg/index_bg.wasm");
    });

    it("passes the SVG string and default width 1200 to the Resvg constructor", async () => {
      // Arrange
      const svg = "<svg><rect width='100'/></svg>";

      // Act
      await svgToPng(svg);

      // Assert – inspect the last constructed instance
      const instances = getResvgInstances();
      const last = instances.at(-1);
      expect(last.svg).toBe(svg);
      expect(last.opts).toEqual({
        fitTo: { mode: "width", value: 1200 },
        background: "white",
        font: { loadSystemFonts: false },
      });
    });

    it("accepts a custom widthPx and passes it to Resvg", async () => {
      // Arrange
      const svg = "<svg/>";
      const customWidth = 800;

      // Act
      await svgToPng(svg, customWidth);

      // Assert
      const instances = getResvgInstances();
      const last = instances.at(-1);
      expect((last.opts as { fitTo: { value: number } }).fitTo.value).toBe(customWidth);
    });

    it("uses the default widthPx=1200 when no second argument is provided", async () => {
      // Arrange
      const svg = "<svg/>";

      // Act
      await svgToPng(svg);

      // Assert
      const instances = getResvgInstances();
      const last = instances.at(-1);
      expect((last.opts as { fitTo: { value: number } }).fitTo.value).toBe(1200);
    });

    it("calls render() then asPng() and returns the PNG bytes", async () => {
      // Arrange
      const expectedBytes = new Uint8Array([1, 2, 3, 4]);
      mockAsPng.mockReturnValue(expectedBytes);
      const svg = "<svg/>";

      // Act
      const result = await svgToPng(svg);

      // Assert
      expect(mockRender).toHaveBeenCalled();
      expect(mockAsPng).toHaveBeenCalled();
      expect(result).toBe(expectedBytes);
    });

    it("returns a Uint8Array", async () => {
      // Arrange
      const svg = "<svg><text>hello</text></svg>";

      // Act
      const result = await svgToPng(svg);

      // Assert
      expect(result).toBeInstanceOf(Uint8Array);
    });

    it("sets background:'white' and loadSystemFonts:false on every call", async () => {
      // Arrange
      const svg = "<svg/>";

      // Act
      await svgToPng(svg);

      // Assert
      const instances = getResvgInstances();
      const last = instances.at(-1);
      const opts = last.opts as { background: string; font: { loadSystemFonts: boolean } };
      expect(opts.background).toBe("white");
      expect(opts.font.loadSystemFonts).toBe(false);
    });

    it("initWasm is called at most once even across repeated svgToPng calls", async () => {
      // Arrange
      const svg = "<svg/>";
      const initCallsBefore = mockInitWasm.mock.calls.length;

      // Act
      await svgToPng(svg);
      await svgToPng(svg);
      await svgToPng(svg);

      // Assert – the ??= guard ensures initWasm runs at most once per module lifetime.
      const initCallsAdded = mockInitWasm.mock.calls.length - initCallsBefore;
      expect(initCallsAdded).toBeLessThanOrEqual(1);
    });
  });

  // ─── pngToDataUri ──────────────────────────────────────────────────────────

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
        "data:image/png;base64," +
        btoa(String.fromCodePoint(137, 80, 78, 71, 13, 10, 26, 10));
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
});
