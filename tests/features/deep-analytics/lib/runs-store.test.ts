import { describe, it, expect, vi, beforeEach } from "vitest";
import { saveRun, loadRun, clearRun } from "@/features/deep-analytics/lib/runs-store";

// ─── Mock @/platform/storage ─────────────────────────────────────────────────
// We intercept the three functions the module depends on so no Dexie/IndexedDB
// is required at test time.

vi.mock("@/platform/storage", () => ({
  putReportDefinition: vi.fn(),
  listReportDefinitions: vi.fn(),
  deleteReportDefinition: vi.fn(),
}));

import {
  putReportDefinition,
  listReportDefinitions,
  deleteReportDefinition,
} from "@/platform/storage";

// Typed helpers so TypeScript stays happy.
const mockPut = putReportDefinition as ReturnType<typeof vi.fn>;
const mockList = listReportDefinitions as ReturnType<typeof vi.fn>;
const mockDelete = deleteReportDefinition as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockPut.mockResolvedValue("ok");
  mockList.mockResolvedValue([]);
  mockDelete.mockResolvedValue(undefined);
});

// ─── saveRun ─────────────────────────────────────────────────────────────────

describe("saveRun", () => {
  it("calls putReportDefinition with the correct shape for a cluster run", async () => {
    // Arrange
    const payload = { k: 3, labels: ["A", "B", "C"] };

    // Act
    await saveRun("cluster", "ds-001", payload);

    // Assert
    expect(mockPut).toHaveBeenCalledOnce();
    expect(mockPut).toHaveBeenCalledWith({
      id: "deep-analytics:cluster:ds-001",
      name: "cluster run for ds-001",
      format: "deep-analytics:cluster",
      config: payload,
    });
  });

  it("calls putReportDefinition for an attribution run", async () => {
    // Arrange
    const payload = { fit: 0.92 };

    // Act
    await saveRun("attribution", "ds-002", payload);

    // Assert
    expect(mockPut).toHaveBeenCalledWith({
      id: "deep-analytics:attribution:ds-002",
      name: "attribution run for ds-002",
      format: "deep-analytics:attribution",
      config: payload,
    });
  });

  it("calls putReportDefinition for a reconciliation run", async () => {
    // Arrange
    const payload = { codes: ["E01", "E02"] };

    // Act
    await saveRun("reconciliation", "ds-003", payload);

    // Assert
    expect(mockPut).toHaveBeenCalledWith({
      id: "deep-analytics:reconciliation:ds-003",
      name: "reconciliation run for ds-003",
      format: "deep-analytics:reconciliation",
      config: payload,
    });
  });

  it("returns early without calling putReportDefinition when datasetId is empty string", async () => {
    // Act
    await saveRun("cluster", "", { k: 1 });

    // Assert — early-return branch: no IO should happen
    expect(mockPut).not.toHaveBeenCalled();
  });

  it("accepts an undefined-like falsy datasetId and skips IO", async () => {
    // The function signature accepts a string; passing an explicitly falsy string
    // exercises the `if (!datasetId) return` branch.
    await saveRun("attribution", "", null);
    expect(mockPut).not.toHaveBeenCalled();
  });

  it("resolves to undefined (void) on success", async () => {
    const result = await saveRun("cluster", "ds-001", {});
    expect(result).toBeUndefined();
  });
});

// ─── loadRun ─────────────────────────────────────────────────────────────────

describe("loadRun", () => {
  it("returns null immediately when datasetId is empty", async () => {
    // Act
    const result = await loadRun("cluster", "");

    // Assert — early-return branch
    expect(result).toBeNull();
    expect(mockList).not.toHaveBeenCalled();
  });

  it("returns null when no matching record exists in the store", async () => {
    // Arrange — list returns records that do not match the target id
    mockList.mockResolvedValue([
      {
        id: "deep-analytics:cluster:other-ds",
        name: "cluster run for other-ds",
        format: "deep-analytics:cluster",
        config: {},
        updatedAt: 1000,
      },
    ]);

    // Act
    const result = await loadRun("cluster", "ds-999");

    // Assert
    expect(result).toBeNull();
  });

  it("returns a PersistedRun when a matching record is found", async () => {
    // Arrange
    const storedRecord = {
      id: "deep-analytics:cluster:ds-001",
      name: "cluster run for ds-001",
      format: "deep-analytics:cluster",
      config: { k: 5 },
      updatedAt: 1700000000000,
    };
    mockList.mockResolvedValue([storedRecord]);

    // Act
    const result = await loadRun<{ k: number }>("cluster", "ds-001");

    // Assert — hit branch
    expect(result).not.toBeNull();
    expect(result?.id).toBe("deep-analytics:cluster:ds-001");
    expect(result?.kind).toBe("cluster");
    expect(result?.datasetId).toBe("ds-001");
    expect(result?.updatedAt).toBe(1700000000000);
    expect(result?.payload).toEqual({ k: 5 });
  });

  it("picks the correct record when the list contains several entries", async () => {
    // Arrange
    const records = [
      {
        id: "deep-analytics:attribution:ds-001",
        name: "attribution run for ds-001",
        format: "deep-analytics:attribution",
        config: { fit: 0.8 },
        updatedAt: 1000,
      },
      {
        id: "deep-analytics:cluster:ds-001",
        name: "cluster run for ds-001",
        format: "deep-analytics:cluster",
        config: { k: 3 },
        updatedAt: 2000,
      },
    ];
    mockList.mockResolvedValue(records);

    // Act
    const result = await loadRun("cluster", "ds-001");

    // Assert — correct hit selected from mixed list
    expect(result?.id).toBe("deep-analytics:cluster:ds-001");
    expect(result?.kind).toBe("cluster");
    expect(result?.payload).toEqual({ k: 3 });
  });

  it("passes the config value as the typed payload without transformation", async () => {
    // Arrange
    const complexPayload = { codes: ["E01"], escalations: [{ id: 1 }] };
    mockList.mockResolvedValue([
      {
        id: "deep-analytics:reconciliation:ds-007",
        config: complexPayload,
        updatedAt: 9999,
      },
    ]);

    // Act
    const result = await loadRun("reconciliation", "ds-007");

    // Assert
    expect(result?.payload).toEqual(complexPayload);
  });

  it("calls listReportDefinitions exactly once per invocation", async () => {
    // Arrange
    mockList.mockResolvedValue([]);

    // Act
    await loadRun("attribution", "ds-001");

    // Assert
    expect(mockList).toHaveBeenCalledOnce();
  });
});

// ─── clearRun ────────────────────────────────────────────────────────────────

describe("clearRun", () => {
  it("calls deleteReportDefinition with the composed id for a cluster run", async () => {
    // Act
    await clearRun("cluster", "ds-001");

    // Assert
    expect(mockDelete).toHaveBeenCalledOnce();
    expect(mockDelete).toHaveBeenCalledWith("deep-analytics:cluster:ds-001");
  });

  it("calls deleteReportDefinition for an attribution run", async () => {
    await clearRun("attribution", "ds-002");
    expect(mockDelete).toHaveBeenCalledWith("deep-analytics:attribution:ds-002");
  });

  it("calls deleteReportDefinition for a reconciliation run", async () => {
    await clearRun("reconciliation", "ds-003");
    expect(mockDelete).toHaveBeenCalledWith("deep-analytics:reconciliation:ds-003");
  });

  it("returns early without calling deleteReportDefinition when datasetId is empty string", async () => {
    // Act
    await clearRun("cluster", "");

    // Assert — early-return branch: no IO should happen
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("resolves to undefined (void) on success", async () => {
    const result = await clearRun("cluster", "ds-001");
    expect(result).toBeUndefined();
  });
});
