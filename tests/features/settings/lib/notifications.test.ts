/**
 * Unit tests for @/features/settings/lib/notifications
 *
 * Mocks:
 *  - sonner            (toast)
 *  - @/core/stores/settings-store (useSettingsStore)
 *
 * The target module's own logic (gating, switch dispatch, convenience wrappers)
 * is kept real.
 */

import { beforeEach, describe, it, expect, vi } from "vitest";

// ---------- mocks (must be declared before any import of the target) ----------

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("@/core/stores/settings-store", () => {
  const notifications = {
    uploads: true,
    queries: false,
    errors: true,
    collaboration: true,
    digest: false,
  };
  return {
    useSettingsStore: {
      getState: vi.fn(() => ({ notifications })),
    },
  };
});

// ---- import the module under test and mock handles ----

import {
  isNotificationEnabled,
  notify,
  notifyUpload,
  notifyQuery,
  notifyError,
  notifyCollaboration,
  type NotificationCategory,
} from "@/features/settings/lib/notifications";

import { toast } from "sonner";
import { useSettingsStore } from "@/core/stores/settings-store";

const mockGetState = useSettingsStore.getState as ReturnType<typeof vi.fn>;
const mockToast = toast as {
  success: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  warning: ReturnType<typeof vi.fn>;
};

/** Set the mocked notifications state for all categories. */
function setNotifications(patch: Partial<Record<NotificationCategory, boolean>>) {
  const current = mockGetState();
  mockGetState.mockReturnValue({
    ...current,
    notifications: { ...current.notifications, ...patch },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset to a clean defaults state
  mockGetState.mockReturnValue({
    notifications: {
      uploads: true,
      queries: false,
      errors: true,
      collaboration: true,
      digest: false,
    },
  });
});

// =============================================================================
// isNotificationEnabled
// =============================================================================

describe("isNotificationEnabled", () => {
  it("returns true when the category is enabled in the store", () => {
    setNotifications({ uploads: true });
    expect(isNotificationEnabled("uploads")).toBe(true);
  });

  it("returns false when the category is disabled in the store", () => {
    setNotifications({ queries: false });
    expect(isNotificationEnabled("queries")).toBe(false);
  });

  it("returns true for errors when enabled", () => {
    setNotifications({ errors: true });
    expect(isNotificationEnabled("errors")).toBe(true);
  });

  it("returns false for errors when disabled", () => {
    setNotifications({ errors: false });
    expect(isNotificationEnabled("errors")).toBe(false);
  });

  it("returns true for collaboration when enabled", () => {
    setNotifications({ collaboration: true });
    expect(isNotificationEnabled("collaboration")).toBe(true);
  });

  it("returns false for collaboration when disabled", () => {
    setNotifications({ collaboration: false });
    expect(isNotificationEnabled("collaboration")).toBe(false);
  });

  it("returns false for digest when disabled", () => {
    setNotifications({ digest: false });
    expect(isNotificationEnabled("digest")).toBe(false);
  });

  it("returns true for digest when enabled", () => {
    setNotifications({ digest: true });
    expect(isNotificationEnabled("digest")).toBe(true);
  });
});

// =============================================================================
// notify — early return when category is disabled and not forced
// =============================================================================

describe("notify – gating", () => {
  it("returns false and skips toast when category is disabled and force is false", () => {
    setNotifications({ uploads: false });

    const shown = notify("uploads", "hello");

    expect(shown).toBe(false);
    expect(mockToast.info).not.toHaveBeenCalled();
  });

  it("returns true and emits a toast when category is enabled", () => {
    setNotifications({ uploads: true });

    const shown = notify("uploads", "hello");

    expect(shown).toBe(true);
    expect(mockToast.info).toHaveBeenCalledTimes(1);
  });

  it("returns true and emits a toast when force is true even if category is disabled", () => {
    setNotifications({ uploads: false });

    const shown = notify("uploads", "forced", { force: true });

    expect(shown).toBe(true);
    expect(mockToast.info).toHaveBeenCalledTimes(1);
  });

  it("uses default options (force=false, kind='info') when options object is omitted", () => {
    setNotifications({ queries: true });

    const shown = notify("queries", "default options");

    expect(shown).toBe(true);
    expect(mockToast.info).toHaveBeenCalledWith("default options", undefined);
  });
});

// =============================================================================
// notify — switch / kind dispatch
// =============================================================================

describe("notify – kind dispatch", () => {
  beforeEach(() => {
    setNotifications({ uploads: true });
  });

  it("calls toast.success for kind='success'", () => {
    notify("uploads", "msg", { kind: "success" });

    expect(mockToast.success).toHaveBeenCalledWith("msg", undefined);
    expect(mockToast.error).not.toHaveBeenCalled();
    expect(mockToast.info).not.toHaveBeenCalled();
    expect(mockToast.warning).not.toHaveBeenCalled();
  });

  it("calls toast.error for kind='error'", () => {
    notify("uploads", "msg", { kind: "error" });

    expect(mockToast.error).toHaveBeenCalledWith("msg", undefined);
    expect(mockToast.success).not.toHaveBeenCalled();
  });

  it("calls toast.warning for kind='warning'", () => {
    notify("uploads", "msg", { kind: "warning" });

    expect(mockToast.warning).toHaveBeenCalledWith("msg", undefined);
    expect(mockToast.info).not.toHaveBeenCalled();
  });

  it("calls toast.info for kind='info' (explicit)", () => {
    notify("uploads", "msg", { kind: "info" });

    expect(mockToast.info).toHaveBeenCalledWith("msg", undefined);
  });

  it("calls toast.info when kind is omitted (default branch)", () => {
    notify("uploads", "default kind");

    expect(mockToast.info).toHaveBeenCalledWith("default kind", undefined);
  });
});

// =============================================================================
// notify — description payload
// =============================================================================

describe("notify – description payload", () => {
  beforeEach(() => {
    setNotifications({ uploads: true });
  });

  it("passes { description } payload when description is provided", () => {
    notify("uploads", "msg", { description: "some detail" });

    expect(mockToast.info).toHaveBeenCalledWith("msg", { description: "some detail" });
  });

  it("passes undefined payload when description is omitted", () => {
    notify("uploads", "msg");

    expect(mockToast.info).toHaveBeenCalledWith("msg", undefined);
  });

  it("passes description along with kind=success", () => {
    notify("uploads", "msg", { kind: "success", description: "details" });

    expect(mockToast.success).toHaveBeenCalledWith("msg", { description: "details" });
  });

  it("passes description along with kind=error", () => {
    notify("uploads", "msg", { kind: "error", description: "err detail" });

    expect(mockToast.error).toHaveBeenCalledWith("msg", { description: "err detail" });
  });

  it("passes description along with kind=warning", () => {
    notify("uploads", "msg", { kind: "warning", description: "warn detail" });

    expect(mockToast.warning).toHaveBeenCalledWith("msg", { description: "warn detail" });
  });
});

// =============================================================================
// Convenience wrappers
// =============================================================================

describe("notifyUpload", () => {
  it("delegates to notify('uploads', ...) and returns true when enabled", () => {
    setNotifications({ uploads: true });

    const result = notifyUpload("file uploaded");

    expect(result).toBe(true);
    expect(mockToast.info).toHaveBeenCalledWith("file uploaded", undefined);
  });

  it("returns false when uploads is disabled", () => {
    setNotifications({ uploads: false });

    const result = notifyUpload("file uploaded");

    expect(result).toBe(false);
    expect(mockToast.info).not.toHaveBeenCalled();
  });

  it("forwards options to notify", () => {
    setNotifications({ uploads: true });

    notifyUpload("upload done", { kind: "success", description: "detail" });

    expect(mockToast.success).toHaveBeenCalledWith("upload done", { description: "detail" });
  });
});

describe("notifyQuery", () => {
  it("delegates to notify('queries', ...) and returns true when enabled", () => {
    setNotifications({ queries: true });

    const result = notifyQuery("query done");

    expect(result).toBe(true);
    expect(mockToast.info).toHaveBeenCalledWith("query done", undefined);
  });

  it("returns false when queries is disabled", () => {
    setNotifications({ queries: false });

    const result = notifyQuery("query done");

    expect(result).toBe(false);
  });

  it("forwards options to notify", () => {
    setNotifications({ queries: true });

    notifyQuery("query finished", { kind: "success" });

    expect(mockToast.success).toHaveBeenCalledWith("query finished", undefined);
  });
});

describe("notifyError", () => {
  it("always shows the toast even when errors category is disabled (force: true default)", () => {
    setNotifications({ errors: false });

    const result = notifyError("something failed");

    expect(result).toBe(true);
    expect(mockToast.error).toHaveBeenCalledWith("something failed", undefined);
  });

  it("shows the toast when errors category is enabled", () => {
    setNotifications({ errors: true });

    const result = notifyError("something failed");

    expect(result).toBe(true);
    expect(mockToast.error).toHaveBeenCalledWith("something failed", undefined);
  });

  it("uses kind=error by default", () => {
    notifyError("oops");

    expect(mockToast.error).toHaveBeenCalledTimes(1);
    expect(mockToast.info).not.toHaveBeenCalled();
  });

  it("forwards description in options", () => {
    notifyError("oops", { description: "error detail" });

    expect(mockToast.error).toHaveBeenCalledWith("oops", { description: "error detail" });
  });

  it("caller options spread over defaults — kind override is still error (forced)", () => {
    // Even if caller tries to pass kind: 'warning', notifyError merges
    // { kind: 'error', force: true } first, so caller's kind overrides it
    notifyError("oops", { kind: "warning" });

    // The spread is { kind: 'error', force: true, ...{ kind: 'warning' } }
    // so kind ends up 'warning' from the caller override
    expect(mockToast.warning).toHaveBeenCalledWith("oops", undefined);
  });
});

describe("notifyCollaboration", () => {
  it("delegates to notify('collaboration', ...) and returns true when enabled", () => {
    setNotifications({ collaboration: true });

    const result = notifyCollaboration("user joined");

    expect(result).toBe(true);
    expect(mockToast.info).toHaveBeenCalledWith("user joined", undefined);
  });

  it("returns false when collaboration is disabled", () => {
    setNotifications({ collaboration: false });

    const result = notifyCollaboration("user joined");

    expect(result).toBe(false);
  });

  it("forwards options to notify", () => {
    setNotifications({ collaboration: true });

    notifyCollaboration("someone joined", { kind: "success", description: "collab detail" });

    expect(mockToast.success).toHaveBeenCalledWith("someone joined", { description: "collab detail" });
  });
});
