/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  getRoleLabel,
  permissionsForRole,
  readDashboardAccess,
  writeDashboardAccess,
  useDashboardAccess,
} from "@/platform/auth/dashboard-access";
import type { DashboardAccessState, DashboardRole } from "@/platform/auth/dashboard-access";

// ---------------------------------------------------------------------------
// Mock settings-client so network IO is avoided
// ---------------------------------------------------------------------------
const mockGetAppSettingRemote = vi.fn();
const mockPutAppSettingRemote = vi.fn();

vi.mock("@/platform/settings/settings-client", () => ({
  getAppSettingRemote: (...args: unknown[]) => mockGetAppSettingRemote(...args),
  putAppSettingRemote: (...args: unknown[]) => mockPutAppSettingRemote(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const ACCESS_KEY = "data-navigator-dashboard-access-v1";
const ACCESS_EVENT = "data-navigator-dashboard-access-change";

function storeAccess(state: Partial<DashboardAccessState>) {
  localStorage.setItem(ACCESS_KEY, JSON.stringify(state));
}

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
    // Arrange
    const role: DashboardRole = "owner";
    // Act
    const perms = permissionsForRole(role);
    // Assert
    expect(perms).toEqual({
      canUpload: true,
      canAppend: true,
      canRename: true,
      canExport: true,
      canManageUsers: true,
      canEditComments: true,
      canShareView: true,
    });
  });

  it("grants upload/append/rename/export/editComments but NOT manageUsers to editor", () => {
    const perms = permissionsForRole("editor");
    expect(perms.canUpload).toBe(true);
    expect(perms.canAppend).toBe(true);
    expect(perms.canRename).toBe(true);
    expect(perms.canExport).toBe(true);
    expect(perms.canManageUsers).toBe(false);
    expect(perms.canEditComments).toBe(true);
    expect(perms.canShareView).toBe(true);
  });

  it("restricts viewer to shareView only", () => {
    const perms = permissionsForRole("viewer");
    expect(perms.canUpload).toBe(false);
    expect(perms.canAppend).toBe(false);
    expect(perms.canRename).toBe(false);
    expect(perms.canExport).toBe(false);
    expect(perms.canManageUsers).toBe(false);
    expect(perms.canEditComments).toBe(false);
    expect(perms.canShareView).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe("readDashboardAccess", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns default when localStorage is empty", () => {
    // Act
    const result = readDashboardAccess();
    // Assert
    expect(result).toEqual({ role: "owner", cacheMode: "balanced" });
  });

  it("returns stored access when a valid state is in localStorage", () => {
    // Arrange
    const stored: DashboardAccessState = { role: "editor", cacheMode: "low-memory" };
    storeAccess(stored);
    // Act
    const result = readDashboardAccess();
    // Assert
    expect(result).toEqual(stored);
  });

  it("coerces an invalid role to 'owner'", () => {
    storeAccess({ role: "superadmin" as DashboardRole, cacheMode: "balanced" });
    const result = readDashboardAccess();
    expect(result.role).toBe("owner");
  });

  it("coerces an invalid cacheMode to 'balanced'", () => {
    storeAccess({ role: "viewer", cacheMode: "turbo" as DashboardAccessState["cacheMode"] });
    const result = readDashboardAccess();
    expect(result.cacheMode).toBe("balanced");
  });

  it("coerces low-memory cacheMode correctly", () => {
    storeAccess({ role: "viewer", cacheMode: "low-memory" });
    const result = readDashboardAccess();
    expect(result.cacheMode).toBe("low-memory");
  });

  it("returns default when localStorage contains invalid JSON", () => {
    localStorage.setItem(ACCESS_KEY, "NOT_JSON{{");
    const result = readDashboardAccess();
    expect(result).toEqual({ role: "owner", cacheMode: "balanced" });
  });

  it("returns default when localStorage contains null JSON", () => {
    localStorage.setItem(ACCESS_KEY, "null");
    const result = readDashboardAccess();
    expect(result).toEqual({ role: "owner", cacheMode: "balanced" });
  });

  it("returns default for partial object (only role, missing cacheMode)", () => {
    localStorage.setItem(ACCESS_KEY, JSON.stringify({ role: "editor" }));
    const result = readDashboardAccess();
    expect(result.role).toBe("editor");
    expect(result.cacheMode).toBe("balanced");
  });
});

// ---------------------------------------------------------------------------
describe("writeDashboardAccess", () => {
  beforeEach(() => {
    localStorage.clear();
    mockPutAppSettingRemote.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("persists state to localStorage", () => {
    // Arrange
    const next: DashboardAccessState = { role: "editor", cacheMode: "low-memory" };
    // Act
    writeDashboardAccess(next);
    // Assert
    const raw = localStorage.getItem(ACCESS_KEY);
    expect(JSON.parse(raw!)).toEqual(next);
  });

  it("dispatches a custom event with the new state as detail", () => {
    // Arrange
    const next: DashboardAccessState = { role: "viewer", cacheMode: "balanced" };
    const listener = vi.fn();
    window.addEventListener(ACCESS_EVENT, listener);
    // Act
    writeDashboardAccess(next);
    // Assert
    expect(listener).toHaveBeenCalledOnce();
    const event = listener.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toEqual(next);
    window.removeEventListener(ACCESS_EVENT, listener);
  });

  it("calls putAppSettingRemote as a best-effort durable mirror", async () => {
    // Arrange
    const next: DashboardAccessState = { role: "owner", cacheMode: "balanced" };
    mockPutAppSettingRemote.mockResolvedValueOnce("2026-01-01");
    // Act
    writeDashboardAccess(next);
    // Allow the microtask to run
    await Promise.resolve();
    // Assert
    expect(mockPutAppSettingRemote).toHaveBeenCalledWith("settings", ACCESS_KEY, next);
  });

  it("does not throw when putAppSettingRemote rejects (best-effort)", async () => {
    mockPutAppSettingRemote.mockRejectedValueOnce(new Error("network error"));
    expect(() => writeDashboardAccess({ role: "editor", cacheMode: "balanced" })).not.toThrow();
    // Let the rejection be handled
    await Promise.resolve();
    await Promise.resolve();
  });
});

// ---------------------------------------------------------------------------
describe("useDashboardAccess hook", () => {
  beforeEach(() => {
    localStorage.clear();
    mockPutAppSettingRemote.mockResolvedValue("2026-01-01");
    mockGetAppSettingRemote.mockResolvedValue({ value: null, updatedAt: null });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns the default state when localStorage is empty", async () => {
    // Arrange & Act
    const { result } = renderHook(() => useDashboardAccess());
    await waitFor(() => {
      expect(result.current.role).toBe("owner");
    });
    // Assert
    expect(result.current.cacheMode).toBe("balanced");
    expect(result.current.roleLabel).toBe("Owner");
  });

  it("initialises from localStorage when a valid state is stored", async () => {
    // Arrange
    storeAccess({ role: "viewer", cacheMode: "low-memory" });
    // Act
    const { result } = renderHook(() => useDashboardAccess());
    await waitFor(() => {
      expect(result.current.role).toBe("viewer");
    });
    // Assert
    expect(result.current.cacheMode).toBe("low-memory");
    expect(result.current.roleLabel).toBe("Viewer");
  });

  it("exposes correct permissions for the current role", async () => {
    storeAccess({ role: "editor", cacheMode: "balanced" });
    const { result } = renderHook(() => useDashboardAccess());
    await waitFor(() => {
      expect(result.current.role).toBe("editor");
    });
    expect(result.current.permissions.canManageUsers).toBe(false);
    expect(result.current.permissions.canUpload).toBe(true);
  });

  it("setRole updates the role and persists it", async () => {
    // Arrange: start as owner
    storeAccess({ role: "owner", cacheMode: "balanced" });
    const { result } = renderHook(() => useDashboardAccess());
    await waitFor(() => expect(result.current.role).toBe("owner"));

    // Act
    act(() => {
      result.current.setRole("viewer");
    });

    // Assert
    await waitFor(() => expect(result.current.role).toBe("viewer"));
    const persisted = JSON.parse(localStorage.getItem(ACCESS_KEY)!);
    expect(persisted.role).toBe("viewer");
  });

  it("setCacheMode updates the cacheMode and persists it", async () => {
    // Arrange
    storeAccess({ role: "owner", cacheMode: "balanced" });
    const { result } = renderHook(() => useDashboardAccess());
    await waitFor(() => expect(result.current.cacheMode).toBe("balanced"));

    // Act
    act(() => {
      result.current.setCacheMode("low-memory");
    });

    // Assert
    await waitFor(() => expect(result.current.cacheMode).toBe("low-memory"));
    const persisted = JSON.parse(localStorage.getItem(ACCESS_KEY)!);
    expect(persisted.cacheMode).toBe("low-memory");
  });

  it("reacts to ACCESS_EVENT custom events dispatched externally", async () => {
    // Arrange: no local storage
    const { result } = renderHook(() => useDashboardAccess());
    await waitFor(() => expect(result.current.role).toBe("owner"));

    // Act: write from outside the hook
    act(() => {
      storeAccess({ role: "editor", cacheMode: "balanced" });
      window.dispatchEvent(new CustomEvent(ACCESS_EVENT, { detail: { role: "editor" } }));
    });

    // Assert: hook state updates
    await waitFor(() => expect(result.current.role).toBe("editor"));
  });

  it("reacts to storage events (e.g. from another tab)", async () => {
    // Arrange
    const { result } = renderHook(() => useDashboardAccess());
    await waitFor(() => expect(result.current.role).toBe("owner"));

    // Act: simulate another tab writing to localStorage
    act(() => {
      storeAccess({ role: "viewer", cacheMode: "low-memory" });
      window.dispatchEvent(new StorageEvent("storage", { key: ACCESS_KEY }));
    });

    // Assert
    await waitFor(() => expect(result.current.role).toBe("viewer"));
  });

  it("cleans up event listeners on unmount", async () => {
    // Arrange
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useDashboardAccess());
    await waitFor(() => true);

    // Act
    unmount();

    // Assert: both listeners removed
    const removedEvents = removeEventListenerSpy.mock.calls.map(([evt]) => evt);
    expect(removedEvents).toContain(ACCESS_EVENT);
    expect(removedEvents).toContain("storage");
    removeEventListenerSpy.mockRestore();
  });

  it("cold-restores from remote when localStorage is empty and remote has data", async () => {
    // Arrange: no local data, remote has saved state
    localStorage.clear();
    mockGetAppSettingRemote.mockResolvedValueOnce({
      value: { role: "editor", cacheMode: "low-memory" },
      updatedAt: "2026-01-01",
    });
    mockPutAppSettingRemote.mockResolvedValue("2026-01-01");

    // Act
    const { result } = renderHook(() => useDashboardAccess());

    // Assert: eventually adopts the remote state
    await waitFor(() => {
      expect(result.current.role).toBe("editor");
    });
    expect(result.current.cacheMode).toBe("low-memory");
  });

  it("skips cold-restore when remote returns null value", async () => {
    // Arrange: no local data, remote returns null
    localStorage.clear();
    mockGetAppSettingRemote.mockResolvedValueOnce({ value: null, updatedAt: null });

    const { result } = renderHook(() => useDashboardAccess());

    // State stays at default
    await waitFor(() => expect(result.current.role).toBe("owner"));
    // putAppSettingRemote should not be called from cold-restore path
    // (only called during writeDashboardAccess if value != null)
    const writeCalls = mockPutAppSettingRemote.mock.calls.length;
    expect(writeCalls).toBe(0);
  });

  it("skips cold-restore when localStorage already has data", async () => {
    // Arrange
    storeAccess({ role: "owner", cacheMode: "balanced" });
    mockGetAppSettingRemote.mockResolvedValueOnce({ value: { role: "viewer" }, updatedAt: "x" });

    const { result } = renderHook(() => useDashboardAccess());
    await waitFor(() => expect(result.current.role).toBe("owner"));

    // getAppSettingRemote should NOT have been called
    expect(mockGetAppSettingRemote).not.toHaveBeenCalled();
  });

  it("cancels cold-restore promise when component unmounts before it resolves", async () => {
    // Arrange: no local data; delay the remote resolution
    localStorage.clear();
    let resolveRemote!: (v: { value: unknown; updatedAt: string }) => void;
    mockGetAppSettingRemote.mockReturnValueOnce(
      new Promise<{ value: unknown; updatedAt: string }>((res) => {
        resolveRemote = res;
      }),
    );

    const { result, unmount } = renderHook(() => useDashboardAccess());

    // Act: unmount before remote resolves
    unmount();

    // Resolve after unmount – should not update state (no setState on unmounted)
    act(() => {
      resolveRemote({ value: { role: "editor", cacheMode: "balanced" }, updatedAt: "2026-01-01" });
    });

    // No error thrown, state remained at default (hook just cancelled internally)
    expect(result.current.role).toBe("owner");
  });

  it("does not throw when cold-restore remote call rejects", async () => {
    // Arrange
    localStorage.clear();
    mockGetAppSettingRemote.mockRejectedValueOnce(new Error("server down"));

    const { result } = renderHook(() => useDashboardAccess());
    // Should not throw; state stays at default
    await waitFor(() => expect(result.current.role).toBe("owner"));
  });

  it("treats localStorage.getItem throwing as hasLocal=true (skips cold-restore)", async () => {
    // Arrange: localStorage is empty so readDashboardAccess (initial render) gets null.
    // Then mock the NEXT getItem call (inside the cold-restore useEffect) to throw,
    // exercising the catch branch at line 105 which sets hasLocal=true and skips remote fetch.
    localStorage.clear();

    let callCount = 0;
    const getItemSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation((key) => {
      callCount++;
      // The first call is from readDashboardAccess (useState initialiser) — let it return null.
      // The second call is the hasLocal check inside the cold-restore useEffect — throw here.
      if (callCount >= 2) {
        throw new Error("SecurityError: localStorage unavailable");
      }
      return null;
    });

    // Act
    const { result } = renderHook(() => useDashboardAccess());

    // Assert: state stays at default because hasLocal catch sets it to true (early return)
    await waitFor(() => expect(result.current.role).toBe("owner"));
    // getAppSettingRemote should NOT be called because hasLocal was set to true in catch
    expect(mockGetAppSettingRemote).not.toHaveBeenCalled();

    getItemSpy.mockRestore();
  });
});
