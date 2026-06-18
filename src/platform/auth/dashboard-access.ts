"use client";

import { useEffect, useMemo, useState } from "react";
import { getAppSettingRemote, putAppSettingRemote } from "@/platform/settings/settings-client";

export type DashboardRole = "owner" | "editor" | "viewer";

export interface DashboardAccessState {
  role: DashboardRole;
  cacheMode: "balanced" | "low-memory";
}

export interface DashboardPermissionSet {
  canUpload: boolean;
  canAppend: boolean;
  canRename: boolean;
  canExport: boolean;
  canManageUsers: boolean;
  canEditComments: boolean;
  canShareView: boolean;
}

const ACCESS_KEY = "data-navigator-dashboard-access-v1";
const ACCESS_EVENT = "data-navigator-dashboard-access-change";

const DEFAULT_ACCESS: DashboardAccessState = {
  role: "owner",
  cacheMode: "balanced",
};

const ROLE_LABELS: Record<DashboardRole, string> = {
  owner: "Owner",
  editor: "Editor",
  viewer: "Viewer",
};

export function getRoleLabel(role: DashboardRole): string {
  return ROLE_LABELS[role];
}

export function permissionsForRole(role: DashboardRole): DashboardPermissionSet {
  return {
    canUpload: role !== "viewer",
    canAppend: role !== "viewer",
    canRename: role !== "viewer",
    canExport: role !== "viewer",
    canManageUsers: role === "owner",
    canEditComments: role !== "viewer",
    canShareView: true,
  };
}

export function readDashboardAccess(): DashboardAccessState {
  if (typeof localStorage === "undefined") return DEFAULT_ACCESS;
  try {
    const parsed = JSON.parse(
      localStorage.getItem(ACCESS_KEY) ?? "null",
    ) as Partial<DashboardAccessState> | null;
    return coerceAccess(parsed);
  } catch {
    return DEFAULT_ACCESS;
  }
}

export function writeDashboardAccess(next: DashboardAccessState): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(ACCESS_KEY, JSON.stringify(next));
  globalThis.window.dispatchEvent(new CustomEvent(ACCESS_EVENT, { detail: next }));
  // Best-effort durable mirror into drizzle settings. localStorage stays the
  // synchronous source of truth; this adds durability + settings-backup inclusion.
  void putAppSettingRemote("settings", ACCESS_KEY, next).catch(() => {});
}

/** Coerce an untrusted payload into a valid access state (defaults on bad input). */
function coerceAccess(value: Partial<DashboardAccessState> | null): DashboardAccessState {
  return {
    role:
      value?.role === "viewer" || value?.role === "editor" || value?.role === "owner"
        ? value.role
        : DEFAULT_ACCESS.role,
    cacheMode: value?.cacheMode === "low-memory" ? "low-memory" : DEFAULT_ACCESS.cacheMode,
  };
}

export function useDashboardAccess() {
  const [state, setState] = useState<DashboardAccessState>(readDashboardAccess);

  useEffect(() => {
    const sync = () => setState(readDashboardAccess());
    globalThis.window.addEventListener(ACCESS_EVENT, sync);
    globalThis.window.addEventListener("storage", sync);
    return () => {
      globalThis.window.removeEventListener(ACCESS_EVENT, sync);
      globalThis.window.removeEventListener("storage", sync);
    };
  }, []);

  // One-time cold restore: with no local working copy (fresh profile / cleared
  // cache), pull the durable access prefs from drizzle settings and adopt them.
  useEffect(() => {
    let hasLocal = true;
    try {
      hasLocal = localStorage.getItem(ACCESS_KEY) !== null;
    } catch {
      hasLocal = true;
    }
    if (hasLocal) return;

    let cancelled = false;
    void getAppSettingRemote<Partial<DashboardAccessState>>("settings", ACCESS_KEY)
      .then(({ value }) => {
        if (cancelled || value == null) return;
        writeDashboardAccess(coerceAccess(value));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const permissions = useMemo(() => permissionsForRole(state.role), [state.role]);

  const updateAccess = (patch: Partial<DashboardAccessState>) => {
    const next = { ...readDashboardAccess(), ...patch };
    setState(next);
    writeDashboardAccess(next);
  };

  return {
    ...state,
    permissions,
    roleLabel: getRoleLabel(state.role),
    setRole: (role: DashboardRole) => updateAccess({ role }),
    setCacheMode: (cacheMode: DashboardAccessState["cacheMode"]) => updateAccess({ cacheMode }),
  };
}
