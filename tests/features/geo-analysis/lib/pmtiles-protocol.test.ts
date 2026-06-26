import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock maplibre-gl before any import of the target module ---
const mockAddProtocol = vi.fn();
vi.mock("maplibre-gl", () => ({
  addProtocol: mockAddProtocol,
}));

// --- Mock pmtiles: Protocol is a class with a `tile` method ---
// We use a vi.fn() wrapping a class-like constructor so we can spy on calls.
const mockTile = vi.fn();
const MockProtocolConstructor = vi.fn(function (this: { tile: typeof mockTile }) {
  this.tile = mockTile;
});
vi.mock("pmtiles", () => ({
  Protocol: MockProtocolConstructor,
}));

/**
 * Tests for src/features/geo-analysis/lib/pmtiles-protocol.ts
 *
 * Covers:
 *  - ensurePmtilesProtocol: first call installs the protocol; second call is a no-op
 *  - BASEMAP_PMTILES_URL: constant value
 *  - hasBundledBasemap: typeof fetch === "undefined" branch, ok response, 206 response, catch branch
 */

describe("BASEMAP_PMTILES_URL", () => {
  it("equals '/maps/basemap.pmtiles'", async () => {
    const { BASEMAP_PMTILES_URL } = await import(
      "@/features/geo-analysis/lib/pmtiles-protocol"
    );
    expect(BASEMAP_PMTILES_URL).toBe("/maps/basemap.pmtiles");
  });
});

describe("ensurePmtilesProtocol", () => {
  // Because the module has a top-level `installed` flag, we must reset the
  // module registry between tests that care about the idempotency contract.
  // `vi.resetModules()` clears the module cache so each import gets a fresh copy.

  beforeEach(() => {
    vi.resetModules();
    mockAddProtocol.mockClear();
    MockProtocolConstructor.mockClear();
  });

  it("registers the pmtiles protocol on the first call", async () => {
    const { ensurePmtilesProtocol } = await import(
      "@/features/geo-analysis/lib/pmtiles-protocol"
    );
    ensurePmtilesProtocol();
    expect(MockProtocolConstructor).toHaveBeenCalledTimes(1);
    expect(mockAddProtocol).toHaveBeenCalledWith("pmtiles", mockTile);
  });

  it("is idempotent: does not re-register on subsequent calls", async () => {
    const { ensurePmtilesProtocol } = await import(
      "@/features/geo-analysis/lib/pmtiles-protocol"
    );
    ensurePmtilesProtocol();
    ensurePmtilesProtocol();
    ensurePmtilesProtocol();
    // Protocol constructor and addProtocol should only be called once
    expect(MockProtocolConstructor).toHaveBeenCalledTimes(1);
    expect(mockAddProtocol).toHaveBeenCalledTimes(1);
  });
});

describe("hasBundledBasemap", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns false when fetch is undefined", async () => {
    // Temporarily remove fetch from the global scope
    const originalFetch = globalThis.fetch;
    // @ts-expect-error — intentionally deleting to simulate missing fetch
    delete globalThis.fetch;

    const { hasBundledBasemap } = await import(
      "@/features/geo-analysis/lib/pmtiles-protocol"
    );
    const result = await hasBundledBasemap();
    expect(result).toBe(false);

    // Restore
    globalThis.fetch = originalFetch;
  });

  it("returns true when the fetch response has ok=true", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", mockFetch);

    const { hasBundledBasemap } = await import(
      "@/features/geo-analysis/lib/pmtiles-protocol"
    );
    const result = await hasBundledBasemap();
    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith("/maps/basemap.pmtiles", {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      cache: "no-store",
    });

    vi.unstubAllGlobals();
  });

  it("returns true when the fetch response has status 206 (partial content)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 206 });
    vi.stubGlobal("fetch", mockFetch);

    const { hasBundledBasemap } = await import(
      "@/features/geo-analysis/lib/pmtiles-protocol"
    );
    const result = await hasBundledBasemap();
    expect(result).toBe(true);

    vi.unstubAllGlobals();
  });

  it("returns false when the fetch response is not ok and not 206", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal("fetch", mockFetch);

    const { hasBundledBasemap } = await import(
      "@/features/geo-analysis/lib/pmtiles-protocol"
    );
    const result = await hasBundledBasemap();
    expect(result).toBe(false);

    vi.unstubAllGlobals();
  });

  it("returns false when fetch throws a network error (catch branch)", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("network failure"));
    vi.stubGlobal("fetch", mockFetch);

    const { hasBundledBasemap } = await import(
      "@/features/geo-analysis/lib/pmtiles-protocol"
    );
    const result = await hasBundledBasemap();
    expect(result).toBe(false);

    vi.unstubAllGlobals();
  });
});
