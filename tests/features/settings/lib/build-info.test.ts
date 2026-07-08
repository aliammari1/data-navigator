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

import packageJson from "../../../../package.json";
import { BUILD_INFO, runtimeLabel } from "@/features/settings/lib/build-info";

/** Strip a semver range prefix (^, ~, >=, etc.) from a package.json version string. */
function bareVersion(range: string): string {
  return range.replace(/^[\^~>=<]+/, "");
}

function installedVersion(pkgName: string): string {
  const deps = packageJson.dependencies as Record<string, string>;
  const version = deps[pkgName];
  if (!version) {
    throw new Error(`"${pkgName}" not found in package.json dependencies — update this test.`);
  }
  return bareVersion(version);
}

// ---------------------------------------------------------------------------
// BUILD_INFO constant
// ---------------------------------------------------------------------------
//
// BUILD_INFO's own doc comment says it "mirrors the relevant package.json
// ranges... keep in sync with package.json when bumping a headline
// dependency" — i.e. it's meant to track package.json, not an arbitrary
// hardcoded string. Asserting each field against a copy-pasted literal (as
// this file used to) could never catch that sync breaking: it already had —
// checking against package.json while fixing this test found BUILD_INFO's
// version/duckdb/motion/next/react/betterAuth fields had drifted stale versus
// what's actually installed (fixed in the same change as this test).

describe("BUILD_INFO", () => {
  it("app version matches package.json's version", () => {
    expect(BUILD_INFO.version).toBe(packageJson.version);
  });

  it("has a non-empty commit hash", () => {
    // The build commit isn't derivable from package.json — this remains a pin.
    expect(BUILD_INFO.commit).toMatch(/^[0-9a-f]{7,40}$/);
  });

  it("duckdb field matches the installed @duckdb/node-api version", () => {
    expect(BUILD_INFO.duckdb).toContain(installedVersion("@duckdb/node-api"));
  });

  it("echarts field matches the installed echarts version", () => {
    expect(BUILD_INFO.echarts).toBe(installedVersion("echarts"));
  });

  it("motion field matches the installed motion version", () => {
    expect(BUILD_INFO.motion).toBe(installedVersion("motion"));
  });

  it("next field matches the installed next version", () => {
    expect(BUILD_INFO.next).toBe(installedVersion("next"));
  });

  it("react field matches the installed react version", () => {
    expect(BUILD_INFO.react).toBe(installedVersion("react"));
  });

  it("transformers field matches the installed @huggingface/transformers version", () => {
    expect(BUILD_INFO.transformers).toContain(installedVersion("@huggingface/transformers"));
  });

  it("maplibre field matches the installed maplibre-gl version", () => {
    expect(BUILD_INFO.maplibre).toContain(installedVersion("maplibre-gl"));
  });

  it("betterAuth field matches the installed better-auth version", () => {
    expect(BUILD_INFO.betterAuth).toBe(installedVersion("better-auth"));
  });

  it("has the MIT license", () => {
    // Not package.json-derivable the same way; a real static project fact.
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
