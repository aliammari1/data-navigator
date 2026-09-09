import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockToArray, mockClear, mockRestore, mockGetSetting, mockPutSetting } = vi.hoisted(() => ({
  mockToArray: vi.fn(),
  mockClear: vi.fn(),
  mockRestore: vi.fn(),
  mockGetSetting: vi.fn(),
  mockPutSetting: vi.fn(),
}));

vi.mock("@/platform/storage/app-db", () => ({
  appDb: { analyticsSnapshots: { toArray: mockToArray, clear: mockClear } },
}));

vi.mock("@/features/telecom/lib/analytics-sqlite-snapshot", () => ({
  restoreLegacyDexieSnapshot: (...args: unknown[]) => mockRestore(...args),
}));

vi.mock("@/platform/settings/settings-client", () => ({
  getAppSettingRemote: (...args: unknown[]) => mockGetSetting(...args),
  putAppSettingRemote: (...args: unknown[]) => mockPutSetting(...args),
}));

import { migrateLegacyDexieAnalyticsSnapshots } from "@/features/telecom/lib/analytics-snapshot-legacy-migration";

function dexieRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    key: "snapshot:t:1",
    savedAt: 1000,
    label: "l",
    fileName: "f.csv",
    tableName: "t",
    kpi: {},
    canals: [],
    hourly: [],
    statusData: [],
    operators: [],
    regions: [],
    rawStatuses: [],
    totalTransactions: 5,
    successRate: 90,
    ...overrides,
  };
}

describe("migrateLegacyDexieAnalyticsSnapshots", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does nothing when already migrated (marker set)", async () => {
    mockGetSetting.mockResolvedValueOnce({ value: { done: true } });

    const result = await migrateLegacyDexieAnalyticsSnapshots();

    expect(result).toEqual({ migrated: 0 });
    expect(mockToArray).not.toHaveBeenCalled();
  });

  it("restores every Dexie row into SQLite, preserving savedAt, then clears the Dexie table", async () => {
    mockGetSetting.mockResolvedValueOnce({ value: null });
    mockToArray.mockResolvedValueOnce([dexieRow({ tableName: "a" }), dexieRow({ tableName: "b" })]);
    mockRestore.mockResolvedValue(1);

    const result = await migrateLegacyDexieAnalyticsSnapshots();

    expect(result).toEqual({ migrated: 2 });
    expect(mockRestore).toHaveBeenCalledTimes(2);
    expect(mockRestore).toHaveBeenCalledWith(
      expect.objectContaining({ tableName: "a", savedAt: 1000 }),
    );
    expect(mockClear).toHaveBeenCalledTimes(1);
    expect(mockPutSetting).toHaveBeenCalledWith(
      "settings",
      expect.any(String),
      expect.objectContaining({ done: true, migrated: 2 }),
    );
  });

  it("does not clear the Dexie table when there is nothing to migrate", async () => {
    mockGetSetting.mockResolvedValueOnce({ value: null });
    mockToArray.mockResolvedValueOnce([]);

    const result = await migrateLegacyDexieAnalyticsSnapshots();

    expect(result).toEqual({ migrated: 0 });
    expect(mockClear).not.toHaveBeenCalled();
    expect(mockPutSetting).toHaveBeenCalled();
  });

  it("marks the migration done even if a row fails, without throwing", async () => {
    mockGetSetting.mockResolvedValueOnce({ value: null });
    mockToArray.mockResolvedValueOnce([dexieRow()]);
    mockRestore.mockRejectedValueOnce(new Error("bridge unavailable"));

    await expect(migrateLegacyDexieAnalyticsSnapshots()).resolves.toEqual({ migrated: 0 });
    expect(mockClear).not.toHaveBeenCalled();
    expect(mockPutSetting).toHaveBeenCalled();
  });
});
