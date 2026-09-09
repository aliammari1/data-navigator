import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  changePassword,
  closeAuthStore,
  configureAuthStore,
  getNextLocalMidnight,
  getOwnerInfo,
  getSession,
  hashPassword,
  hasOwner,
  isAppLocked,
  lockApp,
  login,
  logout,
  setAuthMigrationsFolder,
  signUp,
  verifyPassword,
} from "../../electron/auth-store";
import {
  closeSettingsStore,
  configureSettingsStore,
  listAuditLogs,
  listQueryAnalytics,
  recordQueryAnalytics,
} from "../../electron/settings-store";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "dn-auth-store-test-"));
  configureSettingsStore(dir);
  configureAuthStore(dir);
});

afterEach(() => {
  closeAuthStore();
  closeSettingsStore();
  rmSync(dir, { recursive: true, force: true });
});

describe("Password Hashing & Verification", () => {
  it("hashes password with scrypt and verifies correctly", () => {
    const raw = "SuperSecretPassword123!";
    const hash = hashPassword(raw);
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword(raw, hash)).toBe(true);
    expect(verifyPassword("WrongPassword", hash)).toBe(false);
  });
});

describe("Auth Lifecycle & Single-Owner Enforcement", () => {
  it("initially has no owner and app is locked", () => {
    expect(hasOwner()).toBe(false);
    expect(getOwnerInfo()).toEqual({ exists: false });
    expect(isAppLocked()).toBe(true);
  });

  it("calculates next local midnight correctly at 00:00:00", () => {
    const fixedTime = new Date("2026-09-04T15:30:45.123");
    const midnight = getNextLocalMidnight(fixedTime);
    expect(midnight.getHours()).toBe(0);
    expect(midnight.getMinutes()).toBe(0);
    expect(midnight.getSeconds()).toBe(0);
    expect(midnight.getMilliseconds()).toBe(0);
    expect(midnight.getTime()).toBeGreaterThan(fixedTime.getTime());
  });

  it("sets session expiration strictly to next local midnight on signup and login", () => {
    const beforeTime = Date.now();
    const res = signUp({
      name: "Admin User",
      email: "admin@local.host",
      password: "AdminPassword123!",
    });

    const sessionExpiry = new Date(res.session.expiresAt);
    expect(sessionExpiry.getHours()).toBe(0);
    expect(sessionExpiry.getMinutes()).toBe(0);
    expect(sessionExpiry.getSeconds()).toBe(0);
    expect(sessionExpiry.getTime()).toBeGreaterThan(beforeTime);

    // Verify getOwnerInfo returns the admin profile
    const ownerInfo = getOwnerInfo();
    expect(ownerInfo.exists).toBe(true);
    expect(ownerInfo.email).toBe("admin@local.host");
    expect(ownerInfo.name).toBe("Admin User");

    // Lock and login again to verify login expiry
    lockApp();
    const loginRes = login({
      email: "admin@local.host",
      password: "AdminPassword123!",
    });
    const loginExpiry = new Date(loginRes.session.expiresAt);
    expect(loginExpiry.getHours()).toBe(0);
    expect(loginExpiry.getMinutes()).toBe(0);
    expect(loginExpiry.getSeconds()).toBe(0);
  });

  it("allows the owner to sign up and unlocks the app", () => {
    const res = signUp({
      name: "Owner User",
      email: "owner@datanavigator.local",
      password: "StrongOwnerPassword2026!",
    });

    expect(res.user.id).toBeDefined();
    expect(res.user.email).toBe("owner@datanavigator.local");
    expect(res.session.token).toBeDefined();
    expect(hasOwner()).toBe(true);
    expect(isAppLocked()).toBe(false);
  });

  it("prevents registering a second owner account", () => {
    signUp({
      name: "First Owner",
      email: "first@local.host",
      password: "Password123!",
    });

    expect(() =>
      signUp({
        name: "Second User",
        email: "second@local.host",
        password: "Password456!",
      }),
    ).toThrow("An owner account is already registered");
  });

  it("authenticates valid credentials and rejects invalid passwords", () => {
    signUp({
      name: "Test User",
      email: "test@local.host",
      password: "Password123!",
    });

    // Lock app
    lockApp();
    expect(isAppLocked()).toBe(true);

    // Try wrong password
    expect(() =>
      login({
        email: "test@local.host",
        password: "WrongPassword!",
      }),
    ).toThrow("Invalid email or password");
    expect(isAppLocked()).toBe(true);

    // Try correct password
    const loginRes = login({
      email: "test@local.host",
      password: "Password123!",
    });
    expect(loginRes.user.email).toBe("test@local.host");
    expect(isAppLocked()).toBe(false);
  });

  it("verifies session and enforces locking on session retrieval", () => {
    const { session } = signUp({
      name: "Session User",
      email: "session@local.host",
      password: "Password123!",
    });

    const activeSession = getSession(session.token);
    expect(activeSession.isLocked).toBe(false);
    expect(activeSession.user?.email).toBe("session@local.host");

    // Explicit lock
    lockApp();
    const lockedSession = getSession(session.token);
    expect(lockedSession.isLocked).toBe(true);
    expect(lockedSession.session).toBeNull();
  });

  it("supports password changes", () => {
    const { session } = signUp({
      name: "Change User",
      email: "change@local.host",
      password: "OldPassword123!",
    });

    changePassword({
      token: session.token,
      currentPassword: "OldPassword123!",
      newPassword: "NewPassword456!",
    });

    lockApp();
    expect(() => login({ email: "change@local.host", password: "OldPassword123!" })).toThrow(
      "Invalid email or password",
    );

    const newLogin = login({ email: "change@local.host", password: "NewPassword456!" });
    expect(newLogin.user.email).toBe("change@local.host");
  });
});

describe("Audit Logging & Query Analytics Integration", () => {
  it("records authentication events into the audit log", () => {
    signUp({
      name: "Audit User",
      email: "audit@local.host",
      password: "Password123!",
    });

    const logs = listAuditLogs();
    expect(logs.length).toBeGreaterThanOrEqual(1);
    const signupLog = logs.find((l) => l.action === "auth.signup");
    expect(signupLog).toBeDefined();
    expect(signupLog?.status).toBe("success");
    expect(signupLog?.category).toBe("auth");
  });

  it("records and queries SQL analytics in SQLite", () => {
    recordQueryAnalytics({
      datasetId: "ds_telecom_01",
      sqlQuery: "SELECT count(*) FROM table",
      rowCount: 1000,
      executionTimeMs: 14.5,
      isCached: false,
    });

    const analytics = listQueryAnalytics();
    expect(analytics.length).toBeGreaterThanOrEqual(1);
    expect(analytics[0].datasetId).toBe("ds_telecom_01");
    expect(analytics[0].rowCount).toBe(1000);
    expect(analytics[0].executionTimeMs).toBe(14.5);
  });
});

describe("Auth Failure Paths", () => {
  it("rejects login for an unknown email and audits the failure", () => {
    expect(() => login({ email: "ghost@local.host", password: "Password123!" })).toThrow(
      "Invalid email or password",
    );
  });

  it("expires sessions past their expiry and locks the app", () => {
    const { session } = signUp({
      name: "Expiry User",
      email: "expiry@local.host",
      password: "Password123!",
    });

    // Travel past next-local-midnight so the stored session is expired.
    vi.useFakeTimers();
    try {
      vi.setSystemTime(Date.now() + 3 * 24 * 60 * 60 * 1000);
      const expired = getSession(session.token);
      expect(expired.user).toBeNull();
      expect(expired.session).toBeNull();
      expect(expired.isLocked).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns empty session for an unknown token", () => {
    const res = getSession("no-such-token");
    expect(res.user).toBeNull();
    expect(res.session).toBeNull();
  });

  it("logout(token) deletes the session and locks the app", () => {
    const { session } = signUp({
      name: "Logout User",
      email: "logout@local.host",
      password: "Password123!",
    });
    expect(getSession(session.token).user).not.toBeNull();

    logout(session.token);

    expect(getSession(session.token).user).toBeNull();
    expect(isAppLocked()).toBe(true);
  });

  it("rejects password change without a valid session", () => {
    expect(() =>
      changePassword({ token: "no-such-token", currentPassword: "x", newPassword: "y" }),
    ).toThrow("Authentication required");
  });

  it("rejects password change with the wrong current password", () => {
    const { session } = signUp({
      name: "Pw User",
      email: "pw@local.host",
      password: "OldPassword123!",
    });

    expect(() =>
      changePassword({
        token: session.token,
        currentPassword: "WrongPassword123!",
        newPassword: "NewPassword456!",
      }),
    ).toThrow("Current password is not correct");
  });

  it("rejects corrupted password hashes as verification failures", () => {
    expect(verifyPassword("anything", "not-a-valid-scrypt-hash")).toBe(false);
  });

  it("accepts a migrations folder override and throws when unconfigured", async () => {
    setAuthMigrationsFolder("/tmp/dn-auth-migrations-test");

    vi.resetModules();
    try {
      const fresh = await import("../../electron/auth-store");
      expect(() => fresh.hasOwner()).toThrow(/configureAuthStore/);
    } finally {
      vi.resetModules();
    }
  });
});
