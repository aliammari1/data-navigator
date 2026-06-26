/**
 * Unit tests for @/features/settings/lib/build-info
 *
 * Covers:
 *   - BUILD_INFO constant — all fields present with expected values
 *   - runtimeLabel() — Electron branch (navigator.userAgent contains "Electron")
 *   - runtimeLabel() — Web branch (navigator.userAgent does NOT contain "Electron")
 *   - runtimeLabel() — navigator is undefined (SSR / non-browser context)
 *   - runtimeLabel() — navigator.userAgent is undefined / nullish
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { BUILD_INFO, runtimeLabel } from "@/features/settings/lib/build-info";

// ---------------------------------------------------------------------------
// BUILD_INFO constant
// ---------------------------------------------------------------------------

describe("BUILD_INFO", () => {
  it("has the expected version", () => {
    expect(BUILD_INFO.version).toBe("0.1.0");
  });

  it("has a non-empty commit hash", () => {
    expect(BUILD_INFO.commit).toBe("250657a");
  });

  it("has the duckdb field", () => {
    expect(BUILD_INFO.duckdb).toBe("@duckdb/node-api 1.5.3");
  });

  it("has the echarts field", () => {
    expect(BUILD_INFO.echarts).toBe("6.1.0");
  });

  it("has the motion field", () => {
    expect(BUILD_INFO.motion).toBe("12.40.0");
  });

  it("has the next field", () => {
    expect(BUILD_INFO.next).toBe("16.2.7");
  });

  it("has the react field", () => {
    expect(BUILD_INFO.react).toBe("19.2.6");
  });

  it("has the transformers field", () => {
    expect(BUILD_INFO.transformers).toBe("@huggingface/transformers 4.2.0");
  });

  it("has the maplibre field", () => {
    expect(BUILD_INFO.maplibre).toBe("maplibre-gl 5.24.0");
  });

  it("has the betterAuth field", () => {
    expect(BUILD_INFO.betterAuth).toBe("1.6.14");
  });

  it("has the MIT license", () => {
    expect(BUILD_INFO.license).toBe("MIT");
  });
});

// ---------------------------------------------------------------------------
// runtimeLabel() — Electron branch
// ---------------------------------------------------------------------------

describe("runtimeLabel() – Electron branch", () => {
  const originalUserAgent = navigator.userAgent;

  afterEach(() => {
    // Restore original userAgent after each test
    Object.defineProperty(navigator, "userAgent", {
      value: originalUserAgent,
      configurable: true,
      writable: true,
    });
  });

  it("returns 'Electron desktop (native DuckDB)' when userAgent contains 'Electron'", () => {
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 Electron/28.0.0 Chrome/118.0.0.0 Safari/537.36",
      configurable: true,
      writable: true,
    });

    expect(runtimeLabel()).toBe("Electron desktop (native DuckDB)");
  });

  it("returns 'Electron desktop (native DuckDB)' for lowercase 'electron' in userAgent (case-insensitive match)", () => {
    Object.defineProperty(navigator, "userAgent", {
      value: "electron/custom",
      configurable: true,
      writable: true,
    });

    expect(runtimeLabel()).toBe("Electron desktop (native DuckDB)");
  });

  it("returns 'Electron desktop (native DuckDB)' for uppercase 'ELECTRON' in userAgent", () => {
    Object.defineProperty(navigator, "userAgent", {
      value: "ELECTRON desktop app",
      configurable: true,
      writable: true,
    });

    expect(runtimeLabel()).toBe("Electron desktop (native DuckDB)");
  });
});

// ---------------------------------------------------------------------------
// runtimeLabel() — Web branch
// ---------------------------------------------------------------------------

describe("runtimeLabel() – Web branch", () => {
  const originalUserAgent = navigator.userAgent;

  afterEach(() => {
    Object.defineProperty(navigator, "userAgent", {
      value: originalUserAgent,
      configurable: true,
      writable: true,
    });
  });

  it("returns 'Web (DuckDB WASM)' when userAgent does not contain 'electron'", () => {
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/118.0.0.0 Safari/537.36",
      configurable: true,
      writable: true,
    });

    expect(runtimeLabel()).toBe("Web (DuckDB WASM)");
  });

  it("returns 'Web (DuckDB WASM)' for an empty userAgent string", () => {
    Object.defineProperty(navigator, "userAgent", {
      value: "",
      configurable: true,
      writable: true,
    });

    expect(runtimeLabel()).toBe("Web (DuckDB WASM)");
  });

  it("returns 'Web (DuckDB WASM)' when userAgent is undefined (nullish coalescing falls back to empty string)", () => {
    Object.defineProperty(navigator, "userAgent", {
      value: undefined,
      configurable: true,
      writable: true,
    });

    expect(runtimeLabel()).toBe("Web (DuckDB WASM)");
  });
});
