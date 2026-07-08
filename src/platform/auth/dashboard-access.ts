"use client";

import { useMemo, useSyncExternalStore } from "react";
import { type DashboardRole, useSettingsStore } from "@/core/stores/settings-store";
import { getLANSessionRole, subscribeLAN } from "@/platform/lan/lan-collab";

export type { DashboardRole };

export interface DashboardPermissionSet {
  canUpload: boolean;
  canAppend: boolean;
  canRename: boolean;
  canExport: boolean;
  canManageUsers: boolean;
  canEditComments: boolean;
  canShareView: boolean;
}

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

/**
 * Cap the device role by the live LAN session role. While connected to
 * someone else's session with a read-only grant, even an "owner" device acts
 * as a viewer — the hub is already dropping its writes server-side, so the UI
 * should say so instead of pretending. Disconnected → device role as-is.
 */
export function capRoleBySession(
  device: DashboardRole,
  session: ReturnType<typeof getLANSessionRole>,
): DashboardRole {
  if (!session || session === "host") return device;
  if (session === "editor") return device === "owner" ? "editor" : device;
  return "viewer"; // reviewer / viewer sessions are read-only
}

/** Server-value snapshot must be referentially stable for useSyncExternalStore. */
function getServerSessionRole(): null {
  return null;
}

/**
 * Role + cache mode, centralized in the Settings store (Account / Performance
 * tabs) — see src/core/stores/settings-store.ts. The exposed `role` is the
 * EFFECTIVE role: the device role capped by the live LAN session grant, so
 * permissions everywhere (telecom, data-import, collaboration, the topbar
 * pill) automatically tighten while in a guest session.
 */
export function useDashboardAccess() {
  const deviceRole = useSettingsStore((s) => s.role);
  const cacheMode = useSettingsStore((s) => s.performance.cacheMode);
  const setRole = useSettingsStore((s) => s.setRole);
  const setPerformance = useSettingsStore((s) => s.setPerformance);

  const sessionRole = useSyncExternalStore(subscribeLAN, getLANSessionRole, getServerSessionRole);
  const role = capRoleBySession(deviceRole, sessionRole);

  const permissions = useMemo(() => permissionsForRole(role), [role]);

  return {
    role,
    /** The persisted device role, before any session capping. */
    deviceRole,
    /** LAN session role while connected (host/editor/reviewer/viewer), else null. */
    sessionRole,
    /** True while connected to a session that caps this device below its own role. */
    isGuestSession: role !== deviceRole,
    cacheMode,
    permissions,
    roleLabel: getRoleLabel(role),
    setRole,
    setCacheMode: (mode: "balanced" | "low-memory") => setPerformance({ cacheMode: mode }),
  };
}
