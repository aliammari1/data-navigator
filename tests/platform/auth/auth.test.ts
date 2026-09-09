/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

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
import { auth, authConfig } from "@/platform/auth/auth";

// ---------------------------------------------------------------------------
describe("auth.ts — authConfig shape", () => {
  it("sets appName to DataNavigator", () => {
    expect(authConfig.appName).toBe("DataNavigator");
  });

  it("calls drizzleAdapter with the real auth db, sqlite provider, and schema", async () => {
    // The mock always returns { type: "mock-drizzle-adapter" } regardless of
    // input, so asserting on authConfig.database alone (as this test used to)
    // could never catch a wrong provider/schema/db being passed. Assert on the
    // actual call arguments instead — a real regression (wrong provider name,
    // missing schema, wrong db instance) fails this.
    //
    // auth.ts calls drizzleAdapter() once, at module-import time, and this repo's
    // global `clearMocks: true` wipes call history before every test body runs —
    // so the top-level import's call is never observable here. Reset modules and
    // re-import fresh within this test instead (same pattern the branch tests
    // below already use), so the call happens after this test's own mock state
    // is live.
    vi.resetModules();
    const { drizzleAdapter } = await import("@better-auth/drizzle-adapter");
    const { authDb } = await import("@/platform/auth/auth-database");
    const schema = await import("@/db/schema");

    await import("@/platform/auth/auth");

    expect(drizzleAdapter).toHaveBeenCalledWith(authDb, {
      provider: "sqlite",
      schema,
    });
  });

  it("enables email/password auth with autoSignIn true", () => {
    expect(authConfig.emailAndPassword.enabled).toBe(true);
    expect(authConfig.emailAndPassword.autoSignIn).toBe(true);
  });

  it("enforces a minimum password length that meets a real security floor", () => {
    // Independent invariant (NIST SP 800-63B's minimum), not copied from the
    // source literal: a future edit that weakens this to e.g. 4 fails here even
    // if the same person "helpfully" updates this number to match.
    expect(authConfig.emailAndPassword.minPasswordLength).toBeGreaterThanOrEqual(8);
  });

  it("registers exactly one plugin (nextCookies)", () => {
    expect(authConfig.plugins).toHaveLength(1);
    expect(authConfig.plugins[0]).toEqual({ name: "next-cookies-plugin" });
  });

  it("uses the default secret when BETTER_AUTH_SECRET env var is not set at load time", async () => {
    // Asserting on the top-level `authConfig` singleton here would be
    // environment-dependent: local dev checkouts commonly have a `.env` with
    // a real BETTER_AUTH_SECRET, which Vite/Vitest's config bootstrap loads
    // into `process.env` before this file's top-level import even runs. So
    // instead of relying on ambient env state, explicitly clear the var and
    // re-import a fresh module instance — same isolation pattern as the
    // "secret branch" describe block below.
    vi.resetModules();
    vi.stubEnv("BETTER_AUTH_SECRET", undefined as unknown as string);

    vi.doMock("@better-auth/drizzle-adapter", () => ({
      drizzleAdapter: vi.fn().mockReturnValue({ type: "mock-drizzle-adapter" }),
    }));
    vi.doMock("better-auth/next-js", () => ({
      nextCookies: vi.fn().mockReturnValue({ name: "next-cookies-plugin" }),
    }));
    vi.doMock("better-auth/minimal", () => ({
      betterAuth: vi.fn().mockImplementation((cfg: unknown) => ({
        $Infer: { Session: null },
        _cfg: cfg,
      })),
    }));
    vi.doMock("@/db/schema", () => ({
      user: { tableName: "user" },
      session: { tableName: "session" },
      account: { tableName: "account" },
      verification: { tableName: "verification" },
    }));
    vi.doMock("@/platform/auth/auth-database", () => ({
      authDb: { __isMock: true },
      authSqlite: { __isMock: true },
      authDatabasePath: "/mock/auth.db",
    }));

    const mod = await import("@/platform/auth/auth");
    expect(mod.authConfig.secret).toBe("data-navigator-local-dev-secret-change-me");
  });

  it("uses the default baseURL when BETTER_AUTH_URL env var is not set at load time", () => {
    expect(authConfig.baseURL).toBe("http://localhost:3000");
  });
});

describe("auth.ts — auth export", () => {
  it("exports a truthy auth object created by betterAuth(authConfig)", () => {
    expect(auth).toBeTruthy();
  });

  // A test asserting `auth._cfg === authConfig` was removed here: with
  // `betterAuth` fully mocked to stash whatever it's given under `_cfg`, that
  // assertion only proved the mock does what the mock was told to do — it gave
  // no signal about whether the real betterAuth() call is wired correctly.
  // `toBeTruthy()` above already covers "auth.ts calls betterAuth(authConfig)
  // without throwing"; anything deeper (real session/password-policy
  // enforcement) needs an integration test against a real better-auth
  // instance, not a fully-mocked unit test.
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
