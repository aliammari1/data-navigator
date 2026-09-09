import { beforeEach, describe, expect, it, vi } from "vitest";

const authClientMocks = vi.hoisted(() => ({
  signInEmail: vi.fn(),
  signUpEmail: vi.fn(),
  signOut: vi.fn(),
  changePassword: vi.fn(),
}));

vi.mock("@/platform/auth/auth-client", () => ({
  authClient: {
    signIn: { email: authClientMocks.signInEmail },
    signUp: { email: authClientMocks.signUpEmail },
    signOut: authClientMocks.signOut,
    changePassword: authClientMocks.changePassword,
  },
}));

import {
  changePassword,
  getOwnerInfo,
  hasOwner,
  lockApp,
  login,
  logout,
  onLockChanged,
  onSessionExpired,
  onSessionExpiringSoon,
  signUp,
} from "@/platform/auth/auth-ipc-client";

function stubElectronAuth(overrides: Record<string, unknown> = {}) {
  (window as unknown as Record<string, unknown>).electronAuth = {
    hasOwner: vi.fn().mockResolvedValue(true),
    getOwnerInfo: vi.fn().mockResolvedValue({ exists: true }),
    onSessionExpired: vi.fn().mockReturnValue(() => {}),
    onLockChanged: vi.fn().mockReturnValue(() => {}),
    lock: vi.fn().mockResolvedValue(undefined),
    login: vi.fn().mockResolvedValue({ user: { id: "u" }, session: { id: "s" } }),
    signUp: vi.fn().mockResolvedValue({ user: { id: "u" }, session: { id: "s" } }),
    logout: vi.fn().mockResolvedValue(undefined),
    changePassword: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete (window as unknown as Record<string, unknown>).electronAuth;
  authClientMocks.signInEmail.mockResolvedValue({
    error: null,
    data: {
      token: "tok",
      user: { id: "u1", name: "N", email: "e@x.y", emailVerified: true, image: null },
    },
  });
  authClientMocks.signUpEmail.mockResolvedValue({
    error: null,
    data: {
      token: "tok",
      user: { id: "u1", name: "N", email: "e@x.y" },
    },
  });
  authClientMocks.signOut.mockResolvedValue(undefined);
  authClientMocks.changePassword.mockResolvedValue({ error: null });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ exists: true }) }),
  );
});

describe("auth-ipc-client electron paths", () => {
  it("delegates owner checks, login, and logout to the bridge", async () => {
    stubElectronAuth();
    await expect(hasOwner()).resolves.toBe(true);
    await expect(getOwnerInfo()).resolves.toEqual({ exists: true });
    await expect(login({ email: "e@x.y", password: "p" })).resolves.toMatchObject({
      user: { id: "u" },
    });
    await expect(signUp({ name: "N", email: "e@x.y", password: "p" })).resolves.toMatchObject({
      user: { id: "u" },
    });
    await logout();
    await lockApp();
    await changePassword({ currentPassword: "a", newPassword: "b" });
    const bridge = (window as unknown as { electronAuth: { logout: ReturnType<typeof vi.fn> } })
      .electronAuth;
    expect(bridge.logout).toHaveBeenCalled();
  });

  it("registers bridge listeners and no-ops without a bridge", () => {
    stubElectronAuth();
    const off = onSessionExpired(() => {});
    const offLock = onLockChanged(() => {});
    const offSoon = onSessionExpiringSoon(() => {});
    expect(typeof off).toBe("function");
    expect(typeof offLock).toBe("function");
    expect(typeof offSoon).toBe("function");

    delete (window as unknown as Record<string, unknown>).electronAuth;
    expect(onSessionExpired(() => {})()).toBeUndefined();
  });

  it("reaches the expiring-soon bridge listener when provided", () => {
    const bridgeExpiringSoon = vi.fn().mockReturnValue(() => {});
    stubElectronAuth({ onSessionExpiringSoon: bridgeExpiringSoon });
    const off = onSessionExpiringSoon(() => {});
    expect(bridgeExpiringSoon).toHaveBeenCalledOnce();
    expect(typeof off).toBe("function");
  });

  it("falls back to a no-op listener when the bridge hides onLockChanged", () => {
    stubElectronAuth({ onLockChanged: undefined });
    expect(typeof onLockChanged(() => {})).toBe("function");
  });
});

describe("auth-ipc-client web fallbacks", () => {
  it("checks owner info over fetch", async () => {
    await expect(hasOwner()).resolves.toBe(true);
    await expect(getOwnerInfo()).resolves.toEqual({ exists: true });
  });

  it("returns false when the owner endpoint fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(hasOwner()).resolves.toBe(false);
    await expect(getOwnerInfo()).resolves.toEqual({ exists: false });
  });

  it("logs in and signs up via better-auth with midnight expiry", async () => {
    const res = await login({ email: "e@x.y", password: "p" });
    expect(res.user.email).toBe("e@x.y");
    expect(new Date(res.session.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const up = await signUp({ name: "N", email: "e@x.y", password: "p" });
    expect(up.user.name).toBe("N");
  });

  it("surfaces auth errors as thrown Errors", async () => {
    authClientMocks.signInEmail.mockResolvedValue({ error: { message: "bad" }, data: null });
    await expect(login({ email: "e@x.y", password: "p" })).rejects.toThrow("bad");
    authClientMocks.signUpEmail.mockResolvedValue({ error: { message: "taken" }, data: null });
    await expect(signUp({ name: "N", email: "e@x.y", password: "p" })).rejects.toThrow("taken");
    authClientMocks.changePassword.mockResolvedValue({ error: { message: "weak" } });
    await expect(changePassword({ currentPassword: "a", newPassword: "b" })).rejects.toThrow(
      "weak",
    );
  });

  it("logs out via better-auth and tolerates sign-out failure", async () => {
    await logout();
    expect(authClientMocks.signOut).toHaveBeenCalledOnce();
    authClientMocks.signOut.mockRejectedValueOnce(new Error("offline"));
    await logout();
  });
});
