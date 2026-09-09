/**
 * @vitest-environment jsdom
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock the LAN transport: the hook caps the device role by the live session
// grant. Tests drive the session role through this controllable mock.
// NOTE: vi.mock factories are hoisted — state lives in vi.hoisted().
// ---------------------------------------------------------------------------
const lan = vi.hoisted(() => {
  const state = {
    sessionRole: null as "host" | "editor" | "reviewer" | "viewer" | null,
    watchers: new Set<() => void>(),
  };
  return {
    state,
    setSessionRole(role: typeof state.sessionRole) {
      state.sessionRole = role;
      for (const fn of state.watchers) fn();
    },
  };
});

vi.mock("@/platform/lan/lan-collab", () => ({
  getLANSessionRole: () => lan.state.sessionRole,
  subscribeLAN: (fn: () => void) => {
    lan.state.watchers.add(fn);
    return () => lan.state.watchers.delete(fn);
  },
}));

import { useSettingsStore } from "@/core/stores/settings-store";
import {
  capRoleBySession,
  type DashboardRole,
  getRoleLabel,
  permissionsForRole,
  useDashboardAccess,
} from "@/platform/auth/dashboard-access";

// ---------------------------------------------------------------------------
describe("getRoleLabel", () => {
  it("returns 'Owner' for owner role", () => {
    expect(getRoleLabel("owner")).toBe("Owner");
  });

  it("returns 'Editor' for editor role", () => {
    expect(getRoleLabel("editor")).toBe("Editor");
  });

  it("returns 'Viewer' for viewer role", () => {
    expect(getRoleLabel("viewer")).toBe("Viewer");
  });
});

// ---------------------------------------------------------------------------
describe("permissionsForRole", () => {
  it("grants all permissions to owner", () => {
    const role: DashboardRole = "owner";
    const perms = permissionsForRole(role);
    expect(perms).toEqual({
      canUpload: true,
      canExport: true,
      canManageUsers: true,
      canEditComments: true,
      canShareView: true,
      canUseAI: true,
      canAccessSettings: true,
    });
  });

  it("grants upload/export/editComments but NOT manageUsers to editor", () => {
    const perms = permissionsForRole("editor");
    expect(perms.canUpload).toBe(true);
    expect(perms.canExport).toBe(true);
    expect(perms.canManageUsers).toBe(false);
    expect(perms.canEditComments).toBe(true);
    expect(perms.canShareView).toBe(true);
    expect(perms.canUseAI).toBe(true);
    expect(perms.canAccessSettings).toBe(false);
  });

  it("restricts viewer to shareView only", () => {
    const perms = permissionsForRole("viewer");
    expect(perms.canUpload).toBe(false);
    expect(perms.canExport).toBe(false);
    expect(perms.canManageUsers).toBe(false);
    expect(perms.canEditComments).toBe(false);
    expect(perms.canShareView).toBe(true);
    expect(perms.canUseAI).toBe(false);
    expect(perms.canAccessSettings).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe("capRoleBySession", () => {
  it("keeps the device role while disconnected (null session)", () => {
    expect(capRoleBySession("owner", null)).toBe("owner");
    expect(capRoleBySession("editor", null)).toBe("editor");
    expect(capRoleBySession("viewer", null)).toBe("viewer");
  });

  it("keeps the device role for a host session (hosting your own hub)", () => {
    expect(capRoleBySession("owner", "host")).toBe("owner");
    expect(capRoleBySession("editor", "host")).toBe("editor");
  });

  it("caps an owner to editor in an editor session", () => {
    expect(capRoleBySession("owner", "editor")).toBe("editor");
    expect(capRoleBySession("editor", "editor")).toBe("editor");
    expect(capRoleBySession("viewer", "editor")).toBe("viewer");
  });

  it("caps EVERY device role to viewer in read-only sessions", () => {
    for (const device of ["owner", "editor", "viewer"] as const) {
      expect(capRoleBySession(device, "viewer")).toBe("viewer");
      expect(capRoleBySession(device, "reviewer")).toBe("viewer");
    }
  });
});

// ---------------------------------------------------------------------------
describe("useDashboardAccess hook", () => {
  beforeEach(() => {
    lan.setSessionRole(null);
    act(() => {
      useSettingsStore.getState().resetToDefaults();
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns the device role (default owner) when disconnected", async () => {
    const { result } = renderHook(() => useDashboardAccess());
    await waitFor(() => expect(result.current.role).toBe("owner"));
    expect(result.current.deviceRole).toBe("owner");
    expect(result.current.sessionRole).toBeNull();
    expect(result.current.isGuestSession).toBe(false);
    expect(result.current.roleLabel).toBe("Owner");
    expect(result.current.cacheMode).toBe("balanced");
  });

  it("reflects the persisted device role from the settings store", async () => {
    act(() => {
      useSettingsStore.getState().setRole("editor");
    });
    const { result } = renderHook(() => useDashboardAccess());
    await waitFor(() => expect(result.current.role).toBe("editor"));
    expect(result.current.permissions.canManageUsers).toBe(false);
    expect(result.current.permissions.canUpload).toBe(true);
  });

  it("caps the role to viewer while in a read-only guest session", async () => {
    const { result } = renderHook(() => useDashboardAccess());
    await waitFor(() => expect(result.current.role).toBe("owner"));

    act(() => {
      lan.setSessionRole("viewer");
    });

    await waitFor(() => expect(result.current.role).toBe("viewer"));
    expect(result.current.deviceRole).toBe("owner");
    expect(result.current.isGuestSession).toBe(true);
    expect(result.current.permissions.canUpload).toBe(false);
    expect(result.current.permissions.canExport).toBe(false);
  });

  it("restores the device role when the session ends", async () => {
    const { result } = renderHook(() => useDashboardAccess());
    act(() => {
      lan.setSessionRole("reviewer");
    });
    await waitFor(() => expect(result.current.role).toBe("viewer"));

    act(() => {
      lan.setSessionRole(null);
    });
    await waitFor(() => expect(result.current.role).toBe("owner"));
    expect(result.current.isGuestSession).toBe(false);
  });

  it("setRole updates the persisted device role", async () => {
    const { result } = renderHook(() => useDashboardAccess());
    act(() => {
      result.current.setRole("viewer");
    });
    await waitFor(() => expect(result.current.role).toBe("viewer"));
    expect(useSettingsStore.getState().role).toBe("viewer");
  });

  it("setCacheMode updates the performance slice", async () => {
    const { result } = renderHook(() => useDashboardAccess());
    act(() => {
      result.current.setCacheMode("low-memory");
    });
    await waitFor(() => expect(result.current.cacheMode).toBe("low-memory"));
    expect(useSettingsStore.getState().performance.cacheMode).toBe("low-memory");
  });

  it("hosting a session does not cap the owner role", async () => {
    const { result } = renderHook(() => useDashboardAccess());
    act(() => {
      lan.setSessionRole("host");
    });
    await waitFor(() => expect(result.current.sessionRole).toBe("host"));
    expect(result.current.role).toBe("owner");
    expect(result.current.isGuestSession).toBe(false);
  });
});
