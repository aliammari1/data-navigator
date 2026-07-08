/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The constants in electron-options.ts are evaluated at module load time.
// To test the different branches of BETTER_AUTH_BASE_URL we must:
//   1. Stub the env var(s)
//   2. Reset the module registry so the module re-evaluates
//   3. Dynamically import the fresh module
//   4. Assert
//   5. Restore env stubs (vitest's unstubEnvs:true handles this between tests)

describe("electron-options constants", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // ── Static constant exports ──────────────────────────────────────────────

  it("exports ELECTRON_AUTH_PROTOCOL as the app custom scheme", async () => {
    // Arrange: clear both env vars so BETTER_AUTH_BASE_URL falls through
    vi.stubEnv("NEXT_PUBLIC_BETTER_AUTH_URL", "");
    vi.stubEnv("BETTER_AUTH_URL", "");

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

  // ── BETTER_AUTH_BASE_URL branch: NEXT_PUBLIC_BETTER_AUTH_URL present ────

  it("uses NEXT_PUBLIC_BETTER_AUTH_URL when it is set", async () => {
    // Arrange
    vi.stubEnv("NEXT_PUBLIC_BETTER_AUTH_URL", "https://public.example.com");
    vi.stubEnv("BETTER_AUTH_URL", "https://private.example.com");
    vi.resetModules();

    // Act
    const mod = await import("@/platform/auth/electron-options");

    // Assert: NEXT_PUBLIC takes precedence via ??
    expect(mod.BETTER_AUTH_BASE_URL).toBe("https://public.example.com");
  });

  // ── BETTER_AUTH_BASE_URL branch: BETTER_AUTH_URL present (fallback) ─────

  it("falls back to BETTER_AUTH_URL when NEXT_PUBLIC_BETTER_AUTH_URL is not set", async () => {
    // Arrange: delete NEXT_PUBLIC so process.env[key] is undefined
    vi.stubEnv("NEXT_PUBLIC_BETTER_AUTH_URL", undefined as unknown as string);
    vi.stubEnv("BETTER_AUTH_URL", "https://private.example.com");
    vi.resetModules();

    // Act
    const mod = await import("@/platform/auth/electron-options");

    // Assert
    expect(mod.BETTER_AUTH_BASE_URL).toBe("https://private.example.com");
  });

  // ── BETTER_AUTH_BASE_URL branch: neither env var set – default ───────────

  it("defaults to http://localhost:3000 when neither env var is set", async () => {
    // Arrange
    vi.stubEnv("NEXT_PUBLIC_BETTER_AUTH_URL", undefined as unknown as string);
    vi.stubEnv("BETTER_AUTH_URL", undefined as unknown as string);
    vi.resetModules();

    // Act
    const mod = await import("@/platform/auth/electron-options");

    // Assert
    expect(mod.BETTER_AUTH_BASE_URL).toBe("http://localhost:3000");
  });

  // ── ELECTRON_AUTH_SIGN_IN_URL derives from BETTER_AUTH_BASE_URL ──────────

  it("builds ELECTRON_AUTH_SIGN_IN_URL from NEXT_PUBLIC_BETTER_AUTH_URL", async () => {
    // Arrange
    vi.stubEnv("NEXT_PUBLIC_BETTER_AUTH_URL", "https://auth.example.com");
    vi.stubEnv("BETTER_AUTH_URL", undefined as unknown as string);
    vi.resetModules();

    // Act
    const mod = await import("@/platform/auth/electron-options");

    // Assert
    expect(mod.ELECTRON_AUTH_SIGN_IN_URL).toBe("https://auth.example.com/login");
  });

  it("builds ELECTRON_AUTH_SIGN_IN_URL from BETTER_AUTH_URL when NEXT_PUBLIC is absent", async () => {
    // Arrange
    vi.stubEnv("NEXT_PUBLIC_BETTER_AUTH_URL", undefined as unknown as string);
    vi.stubEnv("BETTER_AUTH_URL", "https://private.auth.com");
    vi.resetModules();

    // Act
    const mod = await import("@/platform/auth/electron-options");

    // Assert
    expect(mod.ELECTRON_AUTH_SIGN_IN_URL).toBe("https://private.auth.com/login");
  });

  it("builds ELECTRON_AUTH_SIGN_IN_URL from default base URL when no env vars are set", async () => {
    // Arrange
    vi.stubEnv("NEXT_PUBLIC_BETTER_AUTH_URL", undefined as unknown as string);
    vi.stubEnv("BETTER_AUTH_URL", undefined as unknown as string);
    vi.resetModules();

    // Act
    const mod = await import("@/platform/auth/electron-options");

    // Assert
    expect(mod.ELECTRON_AUTH_SIGN_IN_URL).toBe("http://localhost:3000/login");
  });
});
