/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock all external dependencies before importing the target module.
// vi.mock() factories are hoisted automatically by Vitest.
// ---------------------------------------------------------------------------

vi.mock("@better-auth/drizzle-adapter", () => ({
  drizzleAdapter: vi.fn().mockReturnValue({ type: "mock-drizzle-adapter" }),
}));

vi.mock("better-auth/next-js", () => ({
  nextCookies: vi.fn().mockReturnValue({ name: "next-cookies-plugin" }),
}));

vi.mock("better-auth/minimal", () => ({
  betterAuth: vi.fn().mockImplementation((cfg: unknown) => ({
    $Infer: { Session: null },
    _cfg: cfg,
  })),
}));

vi.mock("@/db/schema", () => ({
  user: { tableName: "user" },
  session: { tableName: "session" },
  account: { tableName: "account" },
  verification: { tableName: "verification" },
}));

vi.mock("@/platform/auth/auth-database", () => ({
  authDb: { __isMock: true },
  authSqlite: { __isMock: true },
  authDatabasePath: "/mock/auth.db",
}));

// ---------------------------------------------------------------------------
// Import the real module under test (after mocks are in place)
// ---------------------------------------------------------------------------
import { authConfig, auth } from "@/platform/auth/auth";

// ---------------------------------------------------------------------------
describe("auth.ts — authConfig shape", () => {
  it("sets appName to DataNavigator", () => {
    expect(authConfig.appName).toBe("DataNavigator");
  });

  it("includes a database field produced by drizzleAdapter", () => {
    // The mock returns { type: "mock-drizzle-adapter" } for any input
    expect(authConfig.database).toEqual({ type: "mock-drizzle-adapter" });
  });

  it("enables email and password auth with minPasswordLength 8 and autoSignIn true", () => {
    expect(authConfig.emailAndPassword).toEqual({
      enabled: true,
      minPasswordLength: 8,
      autoSignIn: true,
    });
  });

  it("registers exactly one plugin (nextCookies)", () => {
    expect(authConfig.plugins).toHaveLength(1);
    expect(authConfig.plugins[0]).toEqual({ name: "next-cookies-plugin" });
  });

  it("uses the default secret when BETTER_AUTH_SECRET env var is not set at load time", () => {
    // At import time no env var was set, so the ?? right-hand side is used.
    expect(authConfig.secret).toBe("data-navigator-local-dev-secret-change-me");
  });

  it("uses the default baseURL when BETTER_AUTH_URL env var is not set at load time", () => {
    expect(authConfig.baseURL).toBe("http://localhost:3000");
  });
});

describe("auth.ts — auth export", () => {
  it("exports a truthy auth object created by betterAuth(authConfig)", () => {
    expect(auth).toBeTruthy();
  });

  it("auth object reflects the authConfig passed to betterAuth", () => {
    // The mock betterAuth stores the config under _cfg so we can verify it
    expect((auth as { _cfg: unknown })._cfg).toBe(authConfig);
  });
});

// ---------------------------------------------------------------------------
// Test the ?? branches for secret and baseURL by resetting modules and
// re-importing with different env var values.
// ---------------------------------------------------------------------------
describe("auth.ts — secret branch: BETTER_AUTH_SECRET is set", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("uses BETTER_AUTH_SECRET from env when defined", async () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "my-custom-secret");

    vi.doMock("@better-auth/drizzle-adapter", () => ({
      drizzleAdapter: vi.fn().mockReturnValue({}),
    }));
    vi.doMock("better-auth/next-js", () => ({
      nextCookies: vi.fn().mockReturnValue({}),
    }));
    vi.doMock("better-auth/minimal", () => ({
      betterAuth: vi.fn().mockReturnValue({ $Infer: { Session: null } }),
    }));
    vi.doMock("@/db/schema", () => ({ user: {} }));
    vi.doMock("@/platform/auth/auth-database", () => ({ authDb: {} }));

    const mod = await import("@/platform/auth/auth");
    expect(mod.authConfig.secret).toBe("my-custom-secret");
  });

  it("falls back to default secret when BETTER_AUTH_SECRET is not set", async () => {
    vi.stubEnv("BETTER_AUTH_SECRET", undefined as unknown as string);

    vi.doMock("@better-auth/drizzle-adapter", () => ({
      drizzleAdapter: vi.fn().mockReturnValue({}),
    }));
    vi.doMock("better-auth/next-js", () => ({
      nextCookies: vi.fn().mockReturnValue({}),
    }));
    vi.doMock("better-auth/minimal", () => ({
      betterAuth: vi.fn().mockReturnValue({ $Infer: { Session: null } }),
    }));
    vi.doMock("@/db/schema", () => ({ user: {} }));
    vi.doMock("@/platform/auth/auth-database", () => ({ authDb: {} }));

    const mod = await import("@/platform/auth/auth");
    expect(mod.authConfig.secret).toBe("data-navigator-local-dev-secret-change-me");
  });
});

describe("auth.ts — baseURL branch: BETTER_AUTH_URL is set", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("uses BETTER_AUTH_URL from env when defined", async () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://auth.example.com");

    vi.doMock("@better-auth/drizzle-adapter", () => ({
      drizzleAdapter: vi.fn().mockReturnValue({}),
    }));
    vi.doMock("better-auth/next-js", () => ({
      nextCookies: vi.fn().mockReturnValue({}),
    }));
    vi.doMock("better-auth/minimal", () => ({
      betterAuth: vi.fn().mockReturnValue({ $Infer: { Session: null } }),
    }));
    vi.doMock("@/db/schema", () => ({ user: {} }));
    vi.doMock("@/platform/auth/auth-database", () => ({ authDb: {} }));

    const mod = await import("@/platform/auth/auth");
    expect(mod.authConfig.baseURL).toBe("https://auth.example.com");
  });

  it("falls back to http://localhost:3000 when BETTER_AUTH_URL is not set", async () => {
    vi.stubEnv("BETTER_AUTH_URL", undefined as unknown as string);

    vi.doMock("@better-auth/drizzle-adapter", () => ({
      drizzleAdapter: vi.fn().mockReturnValue({}),
    }));
    vi.doMock("better-auth/next-js", () => ({
      nextCookies: vi.fn().mockReturnValue({}),
    }));
    vi.doMock("better-auth/minimal", () => ({
      betterAuth: vi.fn().mockReturnValue({ $Infer: { Session: null } }),
    }));
    vi.doMock("@/db/schema", () => ({ user: {} }));
    vi.doMock("@/platform/auth/auth-database", () => ({ authDb: {} }));

    const mod = await import("@/platform/auth/auth");
    expect(mod.authConfig.baseURL).toBe("http://localhost:3000");
  });
});
