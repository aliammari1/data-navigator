"use client";

import { useEffect, useMemo, useState } from "react";

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

export function permissionsForRole(
  role: DashboardRole,
): DashboardPermissionSet {
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
    return {
      role:
        parsed?.role === "viewer" ||
        parsed?.role === "editor" ||
        parsed?.role === "owner"
          ? parsed.role
          : DEFAULT_ACCESS.role,
      cacheMode:
        parsed?.cacheMode === "low-memory"
          ? "low-memory"
          : DEFAULT_ACCESS.cacheMode,
    };
  } catch {
    return DEFAULT_ACCESS;
  }
}

export function writeDashboardAccess(next: DashboardAccessState): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(ACCESS_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(ACCESS_EVENT, { detail: next }));
}

export function useDashboardAccess() {
  const [state, setState] = useState<DashboardAccessState>(readDashboardAccess);

  useEffect(() => {
    const sync = () => setState(readDashboardAccess());
    window.addEventListener(ACCESS_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(ACCESS_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const permissions = useMemo(
    () => permissionsForRole(state.role),
    [state.role],
  );

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
    setCacheMode: (cacheMode: DashboardAccessState["cacheMode"]) =>
      updateAccess({ cacheMode }),
  };
}
