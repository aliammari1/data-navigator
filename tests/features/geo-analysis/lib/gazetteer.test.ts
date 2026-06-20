import { describe, expect, it } from "vitest";
import {
  TUNISIA_CENTER,
  TUNISIA_GAZETTEER,
  geocodeRegion,
} from "@/features/geo-analysis/lib/gazetteer";

/**
 * Unit tests for the offline Tunisia gazetteer.
 *
 * `geocodeRegion` resolves a raw region label to a governorate centroid via an
 * exact fast path, a contained-token match and a fuzzy fallback. Tests cover
 * accent/case insensitivity, alias matching, contained-token matching and the
 * "no confident match -> null" contract.
 */

describe("gazetteer reference data", () => {
  it("exposes 24 governorate centroids with valid coordinates", () => {
    expect(TUNISIA_GAZETTEER).toHaveLength(24);
    for (const entry of TUNISIA_GAZETTEER) {
      expect(entry.lat).toBeGreaterThan(30);
      expect(entry.lat).toBeLessThan(38);
      expect(entry.lon).toBeGreaterThan(7);
      expect(entry.lon).toBeLessThan(12);
    }
  });

  it("provides a stable Tunisia map centre", () => {
    expect(TUNISIA_CENTER.lat).toBeCloseTo(33.8869, 3);
    expect(TUNISIA_CENTER.lon).toBeCloseTo(9.5375, 3);
    expect(TUNISIA_CENTER.zoom).toBe(7);
  });
});

describe("geocodeRegion — exact and canonical matches", () => {
  it("resolves a canonical governorate name to its centroid", () => {
    const hit = geocodeRegion("Tunis");
    expect(hit).not.toBeNull();
    expect(hit?.matched).toBe("Tunis");
    expect(hit?.lat).toBeCloseTo(36.8065, 3);
    expect(hit?.lon).toBeCloseTo(10.1815, 3);
  });

  it("is case-insensitive", () => {
    expect(geocodeRegion("TUNIS")?.matched).toBe("Tunis");
    expect(geocodeRegion("tunis")?.matched).toBe("Tunis");
  });

  it("is accent-insensitive (Beja resolves to Béja)", () => {
    expect(geocodeRegion("Beja")?.matched).toBe("Béja");
    expect(geocodeRegion("Béja")?.matched).toBe("Béja");
  });
});

describe("geocodeRegion — alias matching", () => {
  it("resolves an alias spelling to its canonical governorate", () => {
    expect(geocodeRegion("grand tunis")?.matched).toBe("Tunis");
    expect(geocodeRegion("el kef")?.matched).toBe("Le Kef");
    expect(geocodeRegion("cap bon")?.matched).toBe("Nabeul");
  });

  it("resolves an Arabic transliteration alias", () => {
    expect(geocodeRegion("تونس")?.matched).toBe("Tunis");
  });
});

describe("geocodeRegion — contained-token matching", () => {
  it("matches a region embedded in a longer agency label", () => {
    const hit = geocodeRegion("Agence Sousse Centre");
    expect(hit?.matched).toBe("Sousse");
  });
});

describe("geocodeRegion — no-match contract", () => {
  it("returns null for an empty or whitespace-only input", () => {
    expect(geocodeRegion("")).toBeNull();
    expect(geocodeRegion("   ")).toBeNull();
  });

  it("returns null for a region that is nowhere near any governorate", () => {
    expect(geocodeRegion("zzzzzqqqqq")).toBeNull();
  });
});
