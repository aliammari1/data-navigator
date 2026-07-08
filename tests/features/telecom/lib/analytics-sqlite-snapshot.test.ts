import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSave, mockList, mockGet, mockPutSetting, mockGetSetting } = vi.hoisted(() => ({
  mockSave: vi.fn(),
  mockList: vi.fn(),
  mockGet: vi.fn(),
  mockPutSetting: vi.fn(),
  mockGetSetting: vi.fn(),
}));

vi.mock("@/platform/settings/analytics-snapshot-client", () => ({
  saveAnalyticsSnapshotRemote: (...args: unknown[]) => mockSave(...args),
  listAnalyticsSnapshotsRemote: (...args: unknown[]) => mockList(...args),
  getAnalyticsSnapshotRemote: (...args: unknown[]) => mockGet(...args),
}));

vi.mock("@/platform/settings/settings-client", () => ({
  putAppSettingRemote: (...args: unknown[]) => mockPutSetting(...args),
  getAppSettingRemote: (...args: unknown[]) => mockGetSetting(...args),
}));

import {
  getAnalyticsSnapshot,
  listAnalyticsSnapshotMeta,
  loadAnalyticsSnapshotFromSQLite,
  restoreLegacyDexieSnapshot,
  saveAnalyticsSnapshot,
  saveAnalyticsSnapshotToSQLite,
  type SQLiteAnalyticsSnapshot,
} from "@/features/telecom/lib/analytics-sqlite-snapshot";

function basePersistedSnapshot() {
  return {
    label: "daily.csv",
    fileName: "daily.csv",
    tableName: "telecom_2026_07_03",
    kpi: { totalTransactions: 100, successRate: 90 },
    canals: [{ canal: "GAB", amount: 1 }],
    hourly: [{ hour: 0, count: 1 }],
    statusData: [{ status: "OK", count: 1 }],
    operators: [{ operator: "Orange", count: 1 }],
    regions: [{ region: "Tunis", count: 1 }],
    rawStatuses: [{ code: "00", label: "OK" }],
    totalTransactions: 100,
    successRate: 90,
  } as const;
}

function baseSQLiteSnapshot(): SQLiteAnalyticsSnapshot {
  return {
    tableName: "telecom_2026_07_03",
    fileName: "daily.csv",
    kpi: { totalTransactions: 100, successRate: 90 },
    canals: [{ canal: "GAB", amount: 1 }],
    hourly: [{ hour: 0, count: 1 }],
    statusData: [{ status: "OK", count: 1 }],
    operators: [{ operator: "Orange", count: 1 }],
    regions: [{ region: "Tunis", count: 1 }],
    rawStatuses: [{ code: "00", label: "OK" }],
    forecast: [],
    computedAt: 12345,
    // biome-ignore lint: test fixture — the real column types are broader unions.
  } as unknown as SQLiteAnalyticsSnapshot;
}

describe("saveAnalyticsSnapshotToSQLite", () => {
  beforeEach(() => vi.clearAllMocks());

  it("puts the full snapshot under the analytics_snapshot namespace, keyed by table name", async () => {
    mockPutSetting.mockResolvedValueOnce(undefined);
    const snapshot = baseSQLiteSnapshot();

    await saveAnalyticsSnapshotToSQLite(snapshot);

    expect(mockPutSetting).toHaveBeenCalledWith(
      "analytics_snapshot",
      "telecom_2026_07_03",
      snapshot,
    );
  });
});

describe("loadAnalyticsSnapshotFromSQLite", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads a previously saved snapshot back by table name", async () => {
    const snapshot = baseSQLiteSnapshot();
    mockGetSetting.mockResolvedValueOnce({ value: snapshot });

    const result = await loadAnalyticsSnapshotFromSQLite("telecom_2026_07_03");

    expect(result).toEqual(snapshot);
    expect(mockGetSetting).toHaveBeenCalledWith("analytics_snapshot", "telecom_2026_07_03");
  });

  it("returns null instead of the raw undefined when no snapshot is stored for the table", async () => {
    mockGetSetting.mockResolvedValueOnce({ value: undefined });

    const result = await loadAnalyticsSnapshotFromSQLite("missing_table");

    expect(result).toBeNull();
  });
});

describe("saveAnalyticsSnapshot", () => {
  beforeEach(() => vi.clearAllMocks());

  it("forwards the snapshot fields as a payload and returns the new id", async () => {
    mockSave.mockResolvedValueOnce({
      id: 7,
      tableName: "telecom_2026_07_03",
      label: "daily.csv",
      fileName: "daily.csv",
      savedAt: 1,
      sizeBytes: 1,
      totalTransactions: 100,
      successRate: 90,
    });

    const id = await saveAnalyticsSnapshot(basePersistedSnapshot());

    expect(id).toBe(7);
    expect(mockSave).toHaveBeenCalledWith({
      tableName: "telecom_2026_07_03",
      label: "daily.csv",
      fileName: "daily.csv",
      totalTransactions: 100,
      successRate: 90,
      payload: {
        kpi: { totalTransactions: 100, successRate: 90 },
        canals: [{ canal: "GAB", amount: 1 }],
        hourly: [{ hour: 0, count: 1 }],
        statusData: [{ status: "OK", count: 1 }],
        operators: [{ operator: "Orange", count: 1 }],
        regions: [{ region: "Tunis", count: 1 }],
        rawStatuses: [{ code: "00", label: "OK" }],
      },
    });
  });

  it("throws when the bridge is unavailable instead of silently no-op-ing", async () => {
    mockSave.mockResolvedValueOnce(null);
    await expect(saveAnalyticsSnapshot(basePersistedSnapshot())).rejects.toThrow();
  });
});

describe("restoreLegacyDexieSnapshot", () => {
  beforeEach(() => vi.clearAllMocks());

  it("forwards the original savedAt so migrated entries keep their real save time", async () => {
    mockSave.mockResolvedValueOnce({ id: 9 });

    const id = await restoreLegacyDexieSnapshot({ ...basePersistedSnapshot(), savedAt: 12345 });

    expect(id).toBe(9);
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({ tableName: "telecom_2026_07_03", savedAt: 12345 }),
    );
  });

  it("throws when the bridge is unavailable", async () => {
    mockSave.mockResolvedValueOnce(null);
    await expect(
      restoreLegacyDexieSnapshot({ ...basePersistedSnapshot(), savedAt: 1 }),
    ).rejects.toThrow();
  });
});

describe("listAnalyticsSnapshotMeta", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists across all tables, newest first", async () => {
    mockList.mockResolvedValueOnce([{ id: 1, tableName: "a" }]);
    const result = await listAnalyticsSnapshotMeta();
    expect(result).toEqual([{ id: 1, tableName: "a" }]);
    expect(mockList).toHaveBeenCalledWith(undefined, 100);
  });
});

describe("getAnalyticsSnapshot", () => {
  beforeEach(() => vi.clearAllMocks());

  it("unpacks the stored payload back into the snapshot shape", async () => {
    mockGet.mockResolvedValueOnce({
      id: 7,
      tableName: "t",
      label: "daily.csv",
      fileName: "daily.csv",
      savedAt: 1,
      sizeBytes: 1,
      totalTransactions: 100,
      successRate: 90,
      payload: {
        kpi: { totalTransactions: 100 },
        canals: [{ canal: "GAB" }],
        hourly: [],
        statusData: [],
        operators: [],
        regions: [],
        rawStatuses: [],
      },
    });

    const result = await getAnalyticsSnapshot(7);

    expect(result).toEqual({
      tableName: "t",
      fileName: "daily.csv",
      kpi: { totalTransactions: 100 },
      canals: [{ canal: "GAB" }],
      hourly: [],
      statusData: [],
      operators: [],
      regions: [],
      rawStatuses: [],
    });
  });

  it("returns undefined when the snapshot does not exist", async () => {
    mockGet.mockResolvedValueOnce(undefined);
    await expect(getAnalyticsSnapshot(999)).resolves.toBeUndefined();
  });
});
