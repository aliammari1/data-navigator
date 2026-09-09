import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canUseSettingsApi,
  deleteAppSettingRemote,
  exportAppSettingsRemote,
  getAppSettingRemote,
  putAppSettingRemote,
} from "@/platform/settings/settings-client";

type Bridge = {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  export: ReturnType<typeof vi.fn>;
};

function installBridge(): Bridge {
  const bridge: Bridge = { get: vi.fn(), set: vi.fn(), delete: vi.fn(), export: vi.fn() };
  (window as unknown as { electronSettings?: Bridge }).electronSettings = bridge;
  return bridge;
}

describe("settings-client", () => {
  afterEach(() => {
    // Restore any stubbed window first, then clear the bridge (a test may have
    // stubbed `window` to undefined, which would make the cleanup throw).
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (typeof window !== "undefined") {
      (window as unknown as { electronSettings?: Bridge }).electronSettings = undefined;
    }
  });

  it("reports the API is usable when the IPC bridge is present", () => {
    installBridge();
    expect(canUseSettingsApi()).toBe(true);
  });

  it("getAppSettingRemote returns the value + updatedAt from the bridge", async () => {
    const bridge = installBridge();
    bridge.get.mockResolvedValueOnce({ value: { a: 1 }, updatedAt: "2026-01-01" });

    const result = await getAppSettingRemote("voice", "settings/v3");

    expect(result).toEqual({ value: { a: 1 }, updatedAt: "2026-01-01" });
    expect(bridge.get).toHaveBeenCalledWith("voice", "settings/v3");
  });

  it("getAppSettingRemote coerces a missing value to null", async () => {
    const bridge = installBridge();
    bridge.get.mockResolvedValueOnce({ value: null, updatedAt: "2025-01-01" });
    await expect(getAppSettingRemote("ns", "key")).resolves.toEqual({
      value: null,
      updatedAt: "2025-01-01",
    });
  });

  it("getAppSettingRemote coerces a missing updatedAt to null", async () => {
    const bridge = installBridge();
    bridge.get.mockResolvedValueOnce({ value: "v", updatedAt: null });
    await expect(getAppSettingRemote("ns", "key")).resolves.toEqual({
      value: "v",
      updatedAt: null,
    });
  });

  it("putAppSettingRemote sets the value and returns the persisted updatedAt", async () => {
    const bridge = installBridge();
    bridge.set.mockResolvedValueOnce("2026-02-02");

    const updatedAt = await putAppSettingRemote("store", "answer", 42);

    expect(updatedAt).toBe("2026-02-02");
    expect(bridge.set).toHaveBeenCalledWith("store", "answer", 42);
  });

  it("deleteAppSettingRemote forwards to the bridge", async () => {
    const bridge = installBridge();
    bridge.delete.mockResolvedValueOnce(undefined);
    await expect(deleteAppSettingRemote("store", "gone")).resolves.toBeUndefined();
    expect(bridge.delete).toHaveBeenCalledWith("store", "gone");
  });

  it("exportAppSettingsRemote returns the settings map for a namespace", async () => {
    const bridge = installBridge();
    bridge.export.mockResolvedValueOnce({ store: { a: 1 } });
    await expect(exportAppSettingsRemote("store")).resolves.toEqual({ store: { a: 1 } });
    expect(bridge.export).toHaveBeenCalledWith("store");
  });

  it("exportAppSettingsRemote passes undefined when the namespace is omitted", async () => {
    const bridge = installBridge();
    bridge.export.mockResolvedValueOnce({ a: { b: 2 } });
    await expect(exportAppSettingsRemote()).resolves.toEqual({ a: { b: 2 } });
    expect(bridge.export).toHaveBeenCalledWith(undefined);
  });

  // --- bridge unavailable (SSR / next build / non-Electron) ---

  it("canUseSettingsApi returns false when the bridge is absent", () => {
    expect(canUseSettingsApi()).toBe(false);
  });

  it("canUseSettingsApi returns false when window is undefined", () => {
    vi.stubGlobal("window", undefined);
    expect(canUseSettingsApi()).toBe(false);
  });

  it("getAppSettingRemote returns null immediately when the bridge is unavailable", async () => {
    await expect(getAppSettingRemote("ns", "key")).resolves.toEqual({
      value: null,
      updatedAt: null,
    });
  });

  it("putAppSettingRemote returns null when the bridge is unavailable", async () => {
    await expect(putAppSettingRemote("ns", "key", 99)).resolves.toBeNull();
  });

  it("deleteAppSettingRemote is a no-op when the bridge is unavailable", async () => {
    await expect(deleteAppSettingRemote("ns", "key")).resolves.toBeUndefined();
  });

  it("exportAppSettingsRemote returns {} when the bridge is unavailable", async () => {
    await expect(exportAppSettingsRemote()).resolves.toEqual({});
  });
});
