/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";

// The helpers in electron-options.ts are evaluated at call time.
// To test the different branches of getBetterAuthBaseUrl() we must:
//   1. Stub the env var(s)
//   2. Dynamically import the fresh module
//   3. Assert
//   4. Restore env vars after each test.

const ORIGINAL_ENV = {
  NEXT_PUBLIC_BETTER_AUTH_URL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
};

describe("electron-options constants", () => {
  afterEach(() => {
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL = ORIGINAL_ENV.NEXT_PUBLIC_BETTER_AUTH_URL;
    process.env.BETTER_AUTH_URL = ORIGINAL_ENV.BETTER_AUTH_URL;
  });

  // ── Static constant exports ──────────────────────────────────────────────

  it("exports ELECTRON_AUTH_PROTOCOL as the app custom scheme", async () => {
    // Arrange: clear both env vars so getBetterAuthBaseUrl falls through
    delete process.env.NEXT_PUBLIC_BETTER_AUTH_URL;
    delete process.env.BETTER_AUTH_URL;

    // Act
    const mod = await import("@/platform/auth/electron-options");

    // Assert
    expect(mod.ELECTRON_AUTH_PROTOCOL).toBe("com.data-navigator.app");
  });

  it("exports ELECTRON_AUTH_CALLBACK_PATH as /auth/callback", async () => {
    // Act
    const mod = await import("@/platform/auth/electron-options");

    // Assert
    expect(mod.ELECTRON_AUTH_CALLBACK_PATH).toBe("/auth/callback");
  });

  it("exports ELECTRON_AUTH_CLIENT_ID as 'electron'", async () => {
    // Act
    const mod = await import("@/platform/auth/electron-options");

    // Assert
    expect(mod.ELECTRON_AUTH_CLIENT_ID).toBe("electron");
  });

  // ── getBetterAuthBaseUrl branch: NEXT_PUBLIC_BETTER_AUTH_URL present ────

  it("uses NEXT_PUBLIC_BETTER_AUTH_URL when it is set", async () => {
    // Arrange
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL = "https://public.example.com";
    process.env.BETTER_AUTH_URL = "https://private.example.com";

    // Act
    const mod = await import("@/platform/auth/electron-options");

    // Assert: NEXT_PUBLIC takes precedence via ??
    expect(mod.getBetterAuthBaseUrl()).toBe("https://public.example.com");
  });

  // ── getBetterAuthBaseUrl branch: BETTER_AUTH_URL present (fallback) ─────

  it("falls back to BETTER_AUTH_URL when NEXT_PUBLIC_BETTER_AUTH_URL is not set", async () => {
    // Arrange: delete NEXT_PUBLIC so process.env[key] is undefined
    delete process.env.NEXT_PUBLIC_BETTER_AUTH_URL;
    process.env.BETTER_AUTH_URL = "https://private.example.com";

    // Act
    const mod = await import("@/platform/auth/electron-options");

    // Assert
    expect(mod.getBetterAuthBaseUrl()).toBe("https://private.example.com");
  });

  // ── getBetterAuthBaseUrl branch: neither env var set – default ───────────

  it("defaults to http://localhost:3000 when neither env var is set", async () => {
    // Arrange
    delete process.env.NEXT_PUBLIC_BETTER_AUTH_URL;
    delete process.env.BETTER_AUTH_URL;

    // Act
    const mod = await import("@/platform/auth/electron-options");

    // Assert
    expect(mod.getBetterAuthBaseUrl()).toBe("http://localhost:3000");
  });

  // ── getElectronAuthSignInUrl derives from getBetterAuthBaseUrl() ─────────

  it("builds ELECTRON_AUTH_SIGN_IN_URL from NEXT_PUBLIC_BETTER_AUTH_URL", async () => {
    // Arrange
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL = "https://auth.example.com";
    delete process.env.BETTER_AUTH_URL;

    // Act
    const mod = await import("@/platform/auth/electron-options");

    // Assert
    expect(mod.getElectronAuthSignInUrl()).toBe("https://auth.example.com/login");
  });

  it("builds ELECTRON_AUTH_SIGN_IN_URL from BETTER_AUTH_URL when NEXT_PUBLIC is absent", async () => {
    // Arrange
    delete process.env.NEXT_PUBLIC_BETTER_AUTH_URL;
    process.env.BETTER_AUTH_URL = "https://private.auth.com";

    // Act
    const mod = await import("@/platform/auth/electron-options");

    // Assert
    expect(mod.getElectronAuthSignInUrl()).toBe("https://private.auth.com/login");
  });

  it("builds ELECTRON_AUTH_SIGN_IN_URL from default base URL when no env vars are set", async () => {
    // Arrange
    delete process.env.NEXT_PUBLIC_BETTER_AUTH_URL;
    delete process.env.BETTER_AUTH_URL;

    // Act
    const mod = await import("@/platform/auth/electron-options");

    // Assert
    expect(mod.getElectronAuthSignInUrl()).toBe("http://localhost:3000/login");
  });
});
