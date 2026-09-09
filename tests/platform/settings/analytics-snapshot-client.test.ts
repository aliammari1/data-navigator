import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canUseAnalyticsSnapshotsApi,
  deleteAnalyticsSnapshotRemote,
  getAnalyticsSnapshotRemote,
  listAnalyticsSnapshotsRemote,
  saveAnalyticsSnapshotRemote,
} from "@/platform/settings/analytics-snapshot-client";

type Bridge = {
  save: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

function installBridge(): Bridge {
  const bridge: Bridge = { save: vi.fn(), list: vi.fn(), get: vi.fn(), delete: vi.fn() };
  (window as unknown as { electronAnalyticsSnapshots?: Bridge }).electronAnalyticsSnapshots =
    bridge;
  return bridge;
}

describe("analytics-snapshot-client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (typeof window !== "undefined") {
      (window as unknown as { electronAnalyticsSnapshots?: Bridge }).electronAnalyticsSnapshots =
        undefined;
    }
  });

  it("reports the API is usable when the IPC bridge is present", () => {
    installBridge();
    expect(canUseAnalyticsSnapshotsApi()).toBe(true);
  });

  it("canUseAnalyticsSnapshotsApi returns false when the bridge is absent", () => {
    expect(canUseAnalyticsSnapshotsApi()).toBe(false);
  });

  it("saveAnalyticsSnapshotRemote forwards to the bridge and returns the saved meta", async () => {
    const bridge = installBridge();
    const meta = { id: 1, tableName: "t", label: "l", fileName: null, savedAt: 123, sizeBytes: 10 };
    bridge.save.mockResolvedValueOnce(meta);

    const result = await saveAnalyticsSnapshotRemote({ tableName: "t", label: "l", payload: {} });

    expect(result).toEqual(meta);
    expect(bridge.save).toHaveBeenCalledWith({ tableName: "t", label: "l", payload: {} });
  });

  it("saveAnalyticsSnapshotRemote returns null when the bridge is unavailable", async () => {
    await expect(
      saveAnalyticsSnapshotRemote({ tableName: "t", label: "l", payload: {} }),
    ).resolves.toBeNull();
  });

  it("listAnalyticsSnapshotsRemote forwards args and returns the list", async () => {
    const bridge = installBridge();
    bridge.list.mockResolvedValueOnce([{ id: 1 }]);

    const result = await listAnalyticsSnapshotsRemote("t", 5, 10);

    expect(result).toEqual([{ id: 1 }]);
    expect(bridge.list).toHaveBeenCalledWith("t", 5, 10);
  });

  it("listAnalyticsSnapshotsRemote returns [] when the bridge is unavailable", async () => {
    await expect(listAnalyticsSnapshotsRemote()).resolves.toEqual([]);
  });

  it("getAnalyticsSnapshotRemote forwards the id and returns the row", async () => {
    const bridge = installBridge();
    bridge.get.mockResolvedValueOnce({ id: 1, payload: { a: 1 } });

    const result = await getAnalyticsSnapshotRemote(1);

    expect(result).toEqual({ id: 1, payload: { a: 1 } });
    expect(bridge.get).toHaveBeenCalledWith(1);
  });

  it("getAnalyticsSnapshotRemote returns undefined when the bridge is unavailable", async () => {
    await expect(getAnalyticsSnapshotRemote(1)).resolves.toBeUndefined();
  });

  it("deleteAnalyticsSnapshotRemote forwards to the bridge", async () => {
    const bridge = installBridge();
    bridge.delete.mockResolvedValueOnce(undefined);
    await expect(deleteAnalyticsSnapshotRemote(1)).resolves.toBeUndefined();
    expect(bridge.delete).toHaveBeenCalledWith(1);
  });

  it("deleteAnalyticsSnapshotRemote is a no-op when the bridge is unavailable", async () => {
    await expect(deleteAnalyticsSnapshotRemote(1)).resolves.toBeUndefined();
  });
});
