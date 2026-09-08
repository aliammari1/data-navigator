"use client";

import { createContext, useContext, useMemo, useSyncExternalStore } from "react";
import { type DashboardRole, useSettingsStore } from "@/core/stores/settings-store";
import { getLANSessionRole, subscribeLAN } from "@/platform/lan/lan-collab";

export type { DashboardRole };

export interface DashboardPermissionSet {
  canUpload: boolean;
  canExport: boolean;
  canManageUsers: boolean;
  canEditComments: boolean;
  canShareView: boolean;
  canUseAI: boolean;
  canAccessSettings: boolean;
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
    canExport: role !== "viewer",
    canManageUsers: role === "owner",
    canEditComments: role !== "viewer",
    canShareView: true,
    canUseAI: role !== "viewer",
    canAccessSettings: role === "owner",
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

function getServerSessionRole(): null {
  return null;
}

interface DashboardUserContextValue {
  isGuest: boolean;
  permissions: readonly string[] | undefined;
}

const DashboardUserContext = createContext<DashboardUserContextValue>({
  isGuest: false,
  permissions: undefined,
});

export function DashboardUserProvider({
  isGuest,
  permissions,
  children,
}: DashboardUserContextValue & { children: React.ReactNode }) {
  const value = useMemo(() => ({ isGuest, permissions }), [isGuest, permissions]);
  return (
    <DashboardUserContext.Provider value={value}>{children}</DashboardUserContext.Provider>
  );
}

export function useDashboardUser(): DashboardUserContextValue {
  return useContext(DashboardUserContext);
}

function permissionsForGuestGrant(
  base: DashboardPermissionSet,
  granted: readonly string[] | undefined,
): DashboardPermissionSet {
  if (granted === undefined) return base;
  const has = (p: string) => granted.includes(p);
  return {
    canUpload: has("uploadData"),
    canExport: has("exportData"),
    canManageUsers: has("manageUsers"),
    canEditComments: has("editComments"),
    canShareView: base.canShareView,
    canUseAI: has("useAI"),
    canAccessSettings: has("accessSettings"),
  };
}

/**
 * Role + cache mode, centralized in the Settings store (Account / Performance
 * tabs) — see src/core/stores/settings-store.ts. The exposed `role` is the
 * EFFECTIVE role: the device role capped by the live LAN session grant, so
 * permissions everywhere (telecom, data-import, collaboration, the topbar
 * pill) automatically tighten while in a guest session.
 *
 * For guest sessions (isGuest=true), permissions are overridden by the explicit
 * grants the host attached to the session token — never derived from role
 * alone. A reviewer with `uploadData` can upload but not export; an editor
 * without `exportData` can edit but not export. The grant set is the single
 * source of truth for guest capabilities.
 */
export function useDashboardAccess() {
  const deviceRole = useSettingsStore((s) => s.role);
  const cacheMode = useSettingsStore((s) => s.performance.cacheMode);
  const setRole = useSettingsStore((s) => s.setRole);
  const setPerformance = useSettingsStore((s) => s.setPerformance);

  const { isGuest, permissions: guestGrants } = useDashboardUser();

  const sessionRole = useSyncExternalStore(subscribeLAN, getLANSessionRole, getServerSessionRole);
  const role = capRoleBySession(deviceRole, sessionRole);

  const basePermissions = useMemo(() => permissionsForRole(role), [role]);
  const permissions = useMemo(
    () => (isGuest ? permissionsForGuestGrant(basePermissions, guestGrants) : basePermissions),
    [isGuest, guestGrants, basePermissions],
  );

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
