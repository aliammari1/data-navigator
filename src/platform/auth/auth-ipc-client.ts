"use client";

import { authClient } from "@/platform/auth/auth-client";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type AuthSession = {
  id: string;
  userId: string;
  expiresAt: string;
  createdAt?: string;
  updatedAt?: string;
};

export type AuthResult = {
  user: AuthUser;
  session: AuthSession;
};

export type SessionResult = {
  user: AuthUser | null;
  session: AuthSession | null;
  isLocked: boolean;
};

function isElectron(): boolean {
  return typeof window !== "undefined" && typeof window.electronAuth !== "undefined";
}

/**
 * @deprecated Bearer tokens are no longer stored in renderer localStorage for security hardening.
 */
export function getStoredSessionToken(): string | null {
  return null;
}

/**
 * Calculate the next midnight (00:00:00.000) in the user's local timezone.
 */
export function getNextLocalMidnight(fromDate: Date = new Date()): Date {
  const next = new Date(fromDate);
  next.setHours(24, 0, 0, 0);
  return next;
}

export type OwnerInfo = {
  exists: boolean;
  email?: string;
  name?: string;
};

/**
 * Check whether an owner account is registered.
 */
export async function hasOwner(): Promise<boolean> {
  if (isElectron()) {
    return window.electronAuth.hasOwner();
  }
  // Web fallback: check via API or session
  try {
    const res = await fetch("/api/auth/owner-info", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      return Boolean(data?.exists);
    }
  } catch {
    // ignore
  }
  return false;
}

/**
 * Get the registered Admin / Owner profile info.
 */
export async function getOwnerInfo(): Promise<OwnerInfo> {
  if (isElectron()) {
    return window.electronAuth.getOwnerInfo();
  }
  // Web fallback: check via API route
  try {
    const res = await fetch("/api/auth/owner-info", { cache: "no-store" });
    if (res.ok) return await res.json();
  } catch {
    // ignore
  }
  return { exists: false };
}

/**
 * Register listener for midnight session expiration.
 */
export function onSessionExpired(callback: () => void): () => void {
  if (isElectron() && window.electronAuth?.onSessionExpired) {
    return window.electronAuth.onSessionExpired(callback);
  }
  return () => {};
}

/**
 * Register listener for lock status changes.
 */
export function onLockChanged(callback: (isLocked: boolean) => void): () => void {
  if (isElectron() && window.electronAuth?.onLockChanged) {
    return window.electronAuth.onLockChanged(callback);
  }
  return () => {};
}

/**
 * Register listener for pre-midnight session expiration warning.
 */
export function onSessionExpiringSoon(
  callback: (info: { minutesRemaining: number }) => void,
): () => void {
  if (isElectron() && (window.electronAuth as any)?.onSessionExpiringSoon) {
    return (window.electronAuth as any).onSessionExpiringSoon(callback);
  }
  return () => {};
}

/**
 * Check whether the app is currently locked.
 */
export async function isAppLocked(): Promise<boolean> {
  if (isElectron()) {
    return window.electronAuth.isLocked();
  }
  return false;
}

/**
 * Explicitly lock the application.
 */
export async function lockApp(): Promise<void> {
  if (isElectron()) {
    await window.electronAuth.lock();
  }
}

/**
 * Log in with email and password.
 * The Electron main process manages the session handle and HttpOnly cookie directly.
 * Raw bearer tokens are never exposed to or stored in the renderer.
 */
export async function login(input: { email: string; password: string }): Promise<AuthResult> {
  if (isElectron()) {
    return (await window.electronAuth.login(input)) as AuthResult;
  }

  // Web fallback
  const res = await authClient.signIn.email({
    email: input.email,
    password: input.password,
  });

  if (res.error) {
    throw new Error(res.error.message ?? "Invalid email or password.");
  }

  const token = res.data?.token ?? "web-session";

  return {
    user: {
      id: res.data?.user?.id ?? "user",
      name: res.data?.user?.name ?? input.email,
      email: res.data?.user?.email ?? input.email,
      emailVerified: Boolean(res.data?.user?.emailVerified),
      image: res.data?.user?.image ?? null,
    },
    session: {
      id: token,
      userId: res.data?.user?.id ?? "user",
      expiresAt: getNextLocalMidnight().toISOString(),
    },
  };
}

/**
 * Register the owner account (setup mode).
 */
export async function signUp(input: {
  name: string;
  email: string;
  password: string;
}): Promise<AuthResult> {
  if (isElectron()) {
    return (await window.electronAuth.signUp(input)) as AuthResult;
  }

  // Web fallback
  const res = await authClient.signUp.email({
    name: input.name,
    email: input.email,
    password: input.password,
  });

  if (res.error) {
    throw new Error(res.error.message ?? "Failed to create account.");
  }

  const token = res.data?.token ?? "web-session";

  return {
    user: {
      id: res.data?.user?.id ?? "user",
      name: res.data?.user?.name ?? input.name,
      email: res.data?.user?.email ?? input.email,
      emailVerified: true,
      image: null,
    },
    session: {
      id: token,
      userId: res.data?.user?.id ?? "user",
      expiresAt: getNextLocalMidnight().toISOString(),
    },
  };
}

/**
 * Get current session.
 */
export async function getSession(): Promise<SessionResult> {
  if (isElectron()) {
    return (await window.electronAuth.getSession()) as SessionResult;
  }

  // Web fallback
  try {
    const res = await fetch("/api/auth/get-session", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      if (data?.session && data?.user) {
        return { session: data.session, user: data.user, isLocked: false };
      }
    }
  } catch {
    // ignore
  }

  return { session: null, user: null, isLocked: false };
}

/**
 * Log out and clear session.
 */
export async function logout(): Promise<void> {
  if (isElectron()) {
    await window.electronAuth.logout();
  } else {
    try {
      await authClient.signOut();
    } catch {
      // ignore
    }
  }
}

/**
 * Change current password.
 */
export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  if (isElectron()) {
    await window.electronAuth.changePassword({
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
    });
    return;
  }

  const res = await authClient.changePassword({
    currentPassword: input.currentPassword,
    newPassword: input.newPassword,
  });

  if (res?.error) {
    throw new Error(res.error.message ?? "Failed to change password.");
  }
}
