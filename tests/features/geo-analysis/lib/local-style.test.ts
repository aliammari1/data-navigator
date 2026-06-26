import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @protomaps/basemaps before importing the target module
const mockLayers = vi.fn();
const mockNamedFlavor = vi.fn();

vi.mock("@protomaps/basemaps", () => ({
  layers: mockLayers,
  namedFlavor: mockNamedFlavor,
}));

// Mock maplibre-gl (pulled in transitively via pmtiles-protocol)
vi.mock("maplibre-gl", () => ({
  addProtocol: vi.fn(),
}));

// Mock pmtiles (pulled in transitively via pmtiles-protocol)
vi.mock("pmtiles", () => ({
  Protocol: vi.fn(function (this: { tile: ReturnType<typeof vi.fn> }) {
    this.tile = vi.fn();
  }),
}));

// Mock the pmtiles-protocol sibling so we don't exercise it (it has its own tests)
vi.mock("@/features/geo-analysis/lib/pmtiles-protocol", () => ({
  BASEMAP_PMTILES_URL: "/maps/basemap.pmtiles",
}));

/**
 * Tests for src/features/geo-analysis/lib/local-style.ts
 *
 * The only export is buildLocalStyle(theme?), which accepts "light" | "dark"
 * with "light" as the default. Every field in the returned StyleSpecification
 * is deterministic given the theme, so we can assert each one directly.
 */
describe("buildLocalStyle", () => {
  beforeEach(() => {
    mockLayers.mockReset();
    mockNamedFlavor.mockReset();

    // Give the mocks stable return values
    mockNamedFlavor.mockImplementation((theme: string) => `flavor-${theme}`);
    mockLayers.mockImplementation(
      (source: string, flavor: string, opts: object) => [
        { id: "stub-layer", source, type: "fill", _flavor: flavor, _opts: opts },
      ],
    );
  });

  it("returns version 8", async () => {
    const { buildLocalStyle } = await import(
      "@/features/geo-analysis/lib/local-style"
    );
    const style = buildLocalStyle("light");
    expect(style.version).toBe(8);
  });

  it("points glyphs at the self-hosted font stack path", async () => {
    const { buildLocalStyle } = await import(
      "@/features/geo-analysis/lib/local-style"
    );
    const style = buildLocalStyle("light");
    expect(style.glyphs).toBe("/maps/fonts/{fontstack}/{range}.pbf");
  });

  it("sets the sprite to /maps/sprites/<theme> for light theme", async () => {
    const { buildLocalStyle } = await import(
      "@/features/geo-analysis/lib/local-style"
    );
    const style = buildLocalStyle("light");
    expect(style.sprite).toBe("/maps/sprites/light");
  });

  it("sets the sprite to /maps/sprites/<theme> for dark theme", async () => {
    const { buildLocalStyle } = await import(
      "@/features/geo-analysis/lib/local-style"
    );
    const style = buildLocalStyle("dark");
    expect(style.sprite).toBe("/maps/sprites/dark");
  });

  it("uses 'light' as the default theme when no argument is supplied", async () => {
    const { buildLocalStyle } = await import(
      "@/features/geo-analysis/lib/local-style"
    );
    const style = buildLocalStyle();
    expect(style.sprite).toBe("/maps/sprites/light");
  });

  it("includes the protomaps vector source with a pmtiles:// URL", async () => {
    const { buildLocalStyle } = await import(
      "@/features/geo-analysis/lib/local-style"
    );
    const style = buildLocalStyle("light");
    const sources = style.sources as Record<
      string,
      { type: string; url: string }
    >;
    expect(sources["protomaps"]).toBeDefined();
    expect(sources["protomaps"].type).toBe("vector");
    expect(sources["protomaps"].url).toBe(
      "pmtiles:///maps/basemap.pmtiles",
    );
  });

  it("calls namedFlavor with 'light' when theme is light", async () => {
    const { buildLocalStyle } = await import(
      "@/features/geo-analysis/lib/local-style"
    );
    buildLocalStyle("light");
    expect(mockNamedFlavor).toHaveBeenCalledWith("light");
  });

  it("calls namedFlavor with 'dark' when theme is dark", async () => {
    const { buildLocalStyle } = await import(
      "@/features/geo-analysis/lib/local-style"
    );
    buildLocalStyle("dark");
    expect(mockNamedFlavor).toHaveBeenCalledWith("dark");
  });

  it("calls layers with the protomaps source id, the resolved flavor, and lang:en", async () => {
    const { buildLocalStyle } = await import(
      "@/features/geo-analysis/lib/local-style"
    );
    buildLocalStyle("light");
    expect(mockLayers).toHaveBeenCalledWith(
      "protomaps",
      "flavor-light",
      { lang: "en" },
    );
  });

  it("includes the layers array returned by the layers() call", async () => {
    const { buildLocalStyle } = await import(
      "@/features/geo-analysis/lib/local-style"
    );
    const style = buildLocalStyle("light");
    expect(Array.isArray(style.layers)).toBe(true);
    expect(style.layers.length).toBeGreaterThan(0);
  });

  it("produces different sprites for light vs dark", async () => {
    const { buildLocalStyle } = await import(
      "@/features/geo-analysis/lib/local-style"
    );
    const light = buildLocalStyle("light");
    const dark = buildLocalStyle("dark");
    expect(light.sprite).not.toBe(dark.sprite);
    expect(dark.sprite).toBe("/maps/sprites/dark");
  });

  it("passes 'dark' flavor to layers() when dark theme is requested", async () => {
    const { buildLocalStyle } = await import(
      "@/features/geo-analysis/lib/local-style"
    );
    buildLocalStyle("dark");
    expect(mockLayers).toHaveBeenCalledWith(
      "protomaps",
      "flavor-dark",
      { lang: "en" },
    );
  });
});
