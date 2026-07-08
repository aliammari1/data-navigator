/**
 * Unit tests for useAutoOrganize hook.
 *
 * Strategy:
 * - Mock @/platform/ai/provider so no real LLM is loaded.
 * - Mock @/core/stores/data-store and @/core/stores/folders-store so no
 *   real Zustand persistence is needed.
 * - Keep the real useAutoOrganize module so coverage counts.
 * - Exercise every branch: empty candidates, happy path, error path,
 *   applyPlan with deduplication, AI response sanitisation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// ─── Hoist mock state containers ─────────────────────────────────────────────

const mockGenerateStructured = vi.hoisted(() => vi.fn());
const mockProgress = vi.hoisted(() => ({
  value: { status: "ready", progress: 100 } as { status: string; progress: number },
}));

// Mutable store state for data-store
const mockDatasetsRef = vi.hoisted(() => ({
  value: [] as Array<{
    id: string;
    name: string;
    format: string;
    tags: string[];
    rowCount: number;
    colCount: number;
  }>,
}));

// Mutable store state for folders-store
const mockDatasetFolderMapRef = vi.hoisted(() => ({
  value: {} as Record<string, string | null>,
}));
const mockAddFolder = vi.hoisted(() => vi.fn());
const mockMoveDataset = vi.hoisted(() => vi.fn());

// ─── Module mocks (must be before any imports from those paths) ───────────────

vi.mock("@/platform/ai/provider", () => ({
  useAI: () => ({
    generateStructured: mockGenerateStructured,
    progress: mockProgress.value,
  }),
}));

vi.mock("@/core/stores/data-store", () => ({
  useDataStore: vi.fn((selector: (s: { datasets: typeof mockDatasetsRef.value }) => unknown) =>
    selector({ datasets: mockDatasetsRef.value }),
  ),
}));

vi.mock("@/core/stores/folders-store", () => ({
  useFoldersStore: vi.fn(
    (
      selector: (s: {
        datasetFolderMap: typeof mockDatasetFolderMapRef.value;
        addFolder: typeof mockAddFolder;
        moveDataset: typeof mockMoveDataset;
      }) => unknown,
    ) =>
      selector({
        datasetFolderMap: mockDatasetFolderMapRef.value,
        addFolder: mockAddFolder,
        moveDataset: mockMoveDataset,
      }),
  ),
}));

// ─── Import the real hook AFTER mocks are registered ─────────────────────────

import { useAutoOrganize } from "@/features/folders/hooks/useAutoOrganize";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeDataset(
  over: Partial<{
    id: string;
    name: string;
    format: string;
    tags: string[];
    rowCount: number;
    colCount: number;
  }> = {},
) {
  return {
    id: "ds-1",
    name: "Sales Data",
    format: "csv",
    tags: ["sales", "finance"],
    rowCount: 1000,
    colCount: 12,
    ...over,
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockDatasetsRef.value = [];
  mockDatasetFolderMapRef.value = {};
  mockProgress.value = { status: "ready", progress: 100 };
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useAutoOrganize – initial state", () => {
  it("starts with running=false, no error, no plan, and appliedCount=0", () => {
    // Arrange: no datasets
    mockDatasetsRef.value = [];

    // Act
    const { result } = renderHook(() => useAutoOrganize());

    // Assert
    expect(result.current.running).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.lastPlan).toBeNull();
    expect(result.current.appliedCount).toBe(0);
  });

  it("exposes organize and applyPlan as functions", () => {
    // Act
    const { result } = renderHook(() => useAutoOrganize());

    // Assert
    expect(typeof result.current.organize).toBe("function");
    expect(typeof result.current.applyPlan).toBe("function");
  });

  it("exposes ai.progress on the returned object", () => {
    // Arrange
    mockProgress.value = { status: "loading", progress: 42 };

    // Act
    const { result } = renderHook(() => useAutoOrganize());

    // Assert
    expect(result.current.progress).toEqual({ status: "loading", progress: 42 });
  });
});

describe("useAutoOrganize – organize() with no ungrouped datasets", () => {
  it("returns null immediately when all datasets are already in folders", async () => {
    // Arrange: dataset ds-1 already in a folder
    mockDatasetsRef.value = [makeDataset({ id: "ds-1" })];
    mockDatasetFolderMapRef.value = { "ds-1": "folder-abc" };

    // Act
    const { result } = renderHook(() => useAutoOrganize());
    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.organize();
    });

    // Assert
    expect(returnValue).toBeNull();
    expect(mockGenerateStructured).not.toHaveBeenCalled();
  });

  it("sets an error message when no candidates remain", async () => {
    // Arrange: all datasets filed
    mockDatasetsRef.value = [makeDataset({ id: "ds-1" })];
    mockDatasetFolderMapRef.value = { "ds-1": "folder-abc" };

    // Act
    const { result } = renderHook(() => useAutoOrganize());
    await act(async () => {
      await result.current.organize();
    });

    // Assert
    expect(result.current.error).toBe("All datasets are already organized into folders.");
  });

  it("returns null and sets error when the dataset list is empty", async () => {
    // Arrange: no datasets at all
    mockDatasetsRef.value = [];
    mockDatasetFolderMapRef.value = {};

    // Act
    const { result } = renderHook(() => useAutoOrganize());
    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.organize();
    });

    // Assert
    expect(returnValue).toBeNull();
    expect(result.current.error).toBe("All datasets are already organized into folders.");
    expect(mockGenerateStructured).not.toHaveBeenCalled();
  });
});

describe("useAutoOrganize – organize() happy path", () => {
  it("calls generateStructured with a prompt containing the dataset summary", async () => {
    // Arrange
    mockDatasetsRef.value = [makeDataset({ id: "ds-1", name: "Revenue", format: "csv", rowCount: 500, colCount: 8, tags: ["finance"] })];
    mockDatasetFolderMapRef.value = {};

    const aiPlan = {
      groups: [{ folderName: "Finance", datasetIds: ["ds-1"] }],
    };
    mockGenerateStructured.mockResolvedValueOnce(aiPlan);

    // Act
    const { result } = renderHook(() => useAutoOrganize());
    await act(async () => {
      await result.current.organize();
    });

    // Assert
    expect(mockGenerateStructured).toHaveBeenCalledOnce();
    const [request] = mockGenerateStructured.mock.calls[0];
    expect(request.prompt).toContain("ds-1");
    expect(request.prompt).toContain("Revenue");
    expect(request.temperature).toBe(0);
  });

  it("returns a cleaned plan with the AI-proposed groups", async () => {
    // Arrange
    mockDatasetsRef.value = [makeDataset({ id: "ds-1" }), makeDataset({ id: "ds-2", name: "HR Data" })];
    mockDatasetFolderMapRef.value = {};

    const aiPlan = {
      groups: [
        { folderName: " Sales ", datasetIds: ["ds-1"] },
        { folderName: "HR", datasetIds: ["ds-2"] },
      ],
    };
    mockGenerateStructured.mockResolvedValueOnce(aiPlan);

    // Act
    const { result } = renderHook(() => useAutoOrganize());
    let plan: unknown;
    await act(async () => {
      plan = await result.current.organize();
    });

    // Assert: folder names are trimmed
    expect(plan).toEqual({
      groups: [
        { folderName: "Sales", datasetIds: ["ds-1"] },
        { folderName: "HR", datasetIds: ["ds-2"] },
      ],
    });
  });

  it("stores the cleaned plan in lastPlan and clears running=false", async () => {
    // Arrange
    mockDatasetsRef.value = [makeDataset({ id: "ds-1" })];
    mockDatasetFolderMapRef.value = {};

    const aiPlan = { groups: [{ folderName: "Finance", datasetIds: ["ds-1"] }] };
    mockGenerateStructured.mockResolvedValueOnce(aiPlan);

    // Act
    const { result } = renderHook(() => useAutoOrganize());
    await act(async () => {
      await result.current.organize();
    });

    // Assert
    expect(result.current.running).toBe(false);
    expect(result.current.lastPlan).toEqual({
      groups: [{ folderName: "Finance", datasetIds: ["ds-1"] }],
    });
  });

  it("includes tags in the summary string when the dataset has tags", async () => {
    // Arrange
    mockDatasetsRef.value = [makeDataset({ id: "ds-1", tags: ["alpha", "beta"] })];
    mockDatasetFolderMapRef.value = {};

    mockGenerateStructured.mockResolvedValueOnce({ groups: [{ folderName: "Tagged", datasetIds: ["ds-1"] }] });

    // Act
    const { result } = renderHook(() => useAutoOrganize());
    await act(async () => {
      await result.current.organize();
    });

    // Assert: tags appear in the prompt
    const [request] = mockGenerateStructured.mock.calls[0];
    expect(request.prompt).toContain("alpha, beta");
  });

  it("omits the tags segment when the dataset has no tags", async () => {
    // Arrange
    mockDatasetsRef.value = [makeDataset({ id: "ds-1", tags: [] })];
    mockDatasetFolderMapRef.value = {};

    mockGenerateStructured.mockResolvedValueOnce({ groups: [{ folderName: "Empty Tags", datasetIds: ["ds-1"] }] });

    // Act
    const { result } = renderHook(() => useAutoOrganize());
    await act(async () => {
      await result.current.organize();
    });

    // Assert: "tags:" segment is absent
    const [request] = mockGenerateStructured.mock.calls[0];
    expect(request.prompt).not.toContain("tags:");
  });
});

describe("useAutoOrganize – organize() AI response sanitisation", () => {
  it("filters out dataset IDs that were not offered to the AI", async () => {
    // Arrange: only ds-1 is a candidate; AI hallucinates ds-99
    mockDatasetsRef.value = [makeDataset({ id: "ds-1" })];
    mockDatasetFolderMapRef.value = {};

    const aiPlan = {
      groups: [{ folderName: "Sales", datasetIds: ["ds-1", "ds-99"] }],
    };
    mockGenerateStructured.mockResolvedValueOnce(aiPlan);

    // Act
    const { result } = renderHook(() => useAutoOrganize());
    let plan: unknown;
    await act(async () => {
      plan = await result.current.organize();
    });

    // Assert: hallucinated id removed
    expect(plan).toEqual({
      groups: [{ folderName: "Sales", datasetIds: ["ds-1"] }],
    });
  });

  it("removes duplicate dataset IDs within a single group", async () => {
    // Arrange
    mockDatasetsRef.value = [makeDataset({ id: "ds-1" })];
    mockDatasetFolderMapRef.value = {};

    const aiPlan = {
      groups: [{ folderName: "Dedup", datasetIds: ["ds-1", "ds-1", "ds-1"] }],
    };
    mockGenerateStructured.mockResolvedValueOnce(aiPlan);

    // Act
    const { result } = renderHook(() => useAutoOrganize());
    let plan: unknown;
    await act(async () => {
      plan = await result.current.organize();
    });

    // Assert: duplicates collapsed
    expect(plan).toEqual({ groups: [{ folderName: "Dedup", datasetIds: ["ds-1"] }] });
  });

  it("drops groups that have an empty folderName after trimming", async () => {
    // Arrange
    mockDatasetsRef.value = [makeDataset({ id: "ds-1" })];
    mockDatasetFolderMapRef.value = {};

    const aiPlan = {
      groups: [
        { folderName: "   ", datasetIds: ["ds-1"] },
        { folderName: "Valid", datasetIds: ["ds-1"] },
      ],
    };
    mockGenerateStructured.mockResolvedValueOnce(aiPlan);

    // Act
    const { result } = renderHook(() => useAutoOrganize());
    let plan: unknown;
    await act(async () => {
      plan = await result.current.organize();
    });

    // Assert: blank-name group dropped
    expect(plan).toEqual({ groups: [{ folderName: "Valid", datasetIds: ["ds-1"] }] });
  });

  it("drops groups that end up with no valid dataset IDs after filtering", async () => {
    // Arrange: AI returns only hallucinated IDs
    mockDatasetsRef.value = [makeDataset({ id: "ds-1" })];
    mockDatasetFolderMapRef.value = {};

    const aiPlan = {
      groups: [
        { folderName: "Ghost", datasetIds: ["ds-999"] }, // only hallucinated
        { folderName: "Real", datasetIds: ["ds-1"] },
      ],
    };
    mockGenerateStructured.mockResolvedValueOnce(aiPlan);

    // Act
    const { result } = renderHook(() => useAutoOrganize());
    let plan: unknown;
    await act(async () => {
      plan = await result.current.organize();
    });

    // Assert: empty group dropped
    expect(plan).toEqual({ groups: [{ folderName: "Real", datasetIds: ["ds-1"] }] });
  });

  it("only organizes datasets that are not already in a folder (ungrouped filter)", async () => {
    // Arrange: ds-1 filed, ds-2 not
    mockDatasetsRef.value = [
      makeDataset({ id: "ds-1", name: "Filed" }),
      makeDataset({ id: "ds-2", name: "Unfiled" }),
    ];
    mockDatasetFolderMapRef.value = { "ds-1": "folder-existing" };

    const aiPlan = {
      groups: [{ folderName: "New Group", datasetIds: ["ds-2"] }],
    };
    mockGenerateStructured.mockResolvedValueOnce(aiPlan);

    // Act
    const { result } = renderHook(() => useAutoOrganize());
    let plan: unknown;
    await act(async () => {
      plan = await result.current.organize();
    });

    // Assert: ds-1 is not offered; plan only contains ds-2
    const [request] = mockGenerateStructured.mock.calls[0];
    expect(request.prompt).not.toContain("ds-1");
    expect(request.prompt).toContain("ds-2");
    expect(plan).toEqual({ groups: [{ folderName: "New Group", datasetIds: ["ds-2"] }] });
  });
});

describe("useAutoOrganize – organize() error handling", () => {
  it("sets error and clears running when generateStructured throws an Error", async () => {
    // Arrange
    mockDatasetsRef.value = [makeDataset()];
    mockDatasetFolderMapRef.value = {};

    mockGenerateStructured.mockRejectedValueOnce(new Error("LLM timeout"));

    // Act
    const { result } = renderHook(() => useAutoOrganize());
    let plan: unknown;
    await act(async () => {
      plan = await result.current.organize();
    });

    // Assert
    expect(plan).toBeNull();
    expect(result.current.running).toBe(false);
    expect(result.current.error).toBe("LLM timeout");
  });

  it("sets a fallback error string when generateStructured throws a non-Error value", async () => {
    // Arrange
    mockDatasetsRef.value = [makeDataset()];
    mockDatasetFolderMapRef.value = {};

    mockGenerateStructured.mockRejectedValueOnce("string rejection");

    // Act
    const { result } = renderHook(() => useAutoOrganize());
    await act(async () => {
      await result.current.organize();
    });

    // Assert: fallback message used for non-Error throws
    expect(result.current.error).toBe("AI organization failed.");
  });

  it("returns null on error", async () => {
    // Arrange
    mockDatasetsRef.value = [makeDataset()];
    mockDatasetFolderMapRef.value = {};

    mockGenerateStructured.mockRejectedValueOnce(new Error("crash"));

    // Act
    const { result } = renderHook(() => useAutoOrganize());
    let ret: unknown;
    await act(async () => {
      ret = await result.current.organize();
    });

    // Assert
    expect(ret).toBeNull();
  });

  it("clears a previous error when a successful organize() follows a failed one", async () => {
    // Arrange: first call fails, second succeeds
    mockDatasetsRef.value = [makeDataset({ id: "ds-1" })];
    mockDatasetFolderMapRef.value = {};

    mockGenerateStructured
      .mockRejectedValueOnce(new Error("first fail"))
      .mockResolvedValueOnce({ groups: [{ folderName: "OK", datasetIds: ["ds-1"] }] });

    // Act
    const { result } = renderHook(() => useAutoOrganize());
    await act(async () => {
      await result.current.organize();
    });
    expect(result.current.error).toBe("first fail");

    await act(async () => {
      await result.current.organize();
    });

    // Assert: error cleared after success
    expect(result.current.error).toBeNull();
  });
});

describe("useAutoOrganize – running state transitions", () => {
  it("sets running=true while the AI call is in flight", async () => {
    // Arrange: hold the promise so we can observe the intermediate state
    let resolve!: (v: { groups: { folderName: string; datasetIds: string[] }[] }) => void;
    const pending = new Promise<{ groups: { folderName: string; datasetIds: string[] }[] }>((res) => {
      resolve = res;
    });

    mockDatasetsRef.value = [makeDataset()];
    mockDatasetFolderMapRef.value = {};
    mockGenerateStructured.mockReturnValueOnce(pending);

    // Act
    const { result } = renderHook(() => useAutoOrganize());

    // Start organize without awaiting
    act(() => {
      void result.current.organize();
    });

    // Assert: running is true while the promise is pending
    await waitFor(() => expect(result.current.running).toBe(true));

    // Resolve
    await act(async () => {
      resolve({ groups: [{ folderName: "Done", datasetIds: ["ds-1"] }] });
      await Promise.resolve();
    });

    expect(result.current.running).toBe(false);
  });
});

describe("useAutoOrganize – applyPlan()", () => {
  it("calls addFolder and moveDataset for each group and dataset", () => {
    // Arrange
    mockDatasetsRef.value = [makeDataset({ id: "ds-1" }), makeDataset({ id: "ds-2" })];
    mockDatasetFolderMapRef.value = {};

    const plan = {
      groups: [
        { folderName: "Finance", datasetIds: ["ds-1"] },
        { folderName: "HR", datasetIds: ["ds-2"] },
      ],
    };

    // Act
    const { result } = renderHook(() => useAutoOrganize());
    act(() => {
      result.current.applyPlan(plan);
    });

    // Assert: two folders created, two datasets moved
    expect(mockAddFolder).toHaveBeenCalledTimes(2);
    expect(mockMoveDataset).toHaveBeenCalledTimes(2);

    const addedNames = mockAddFolder.mock.calls.map((c: [{ name: string }]) => c[0].name);
    expect(addedNames).toContain("Finance");
    expect(addedNames).toContain("HR");
  });

  it("creates folders with the expected fields (parentId=null, starred=false, color)", () => {
    // Arrange
    mockDatasetsRef.value = [makeDataset({ id: "ds-1" })];
    mockDatasetFolderMapRef.value = {};

    const plan = { groups: [{ folderName: "Analytics", datasetIds: ["ds-1"] }] };

    // Act
    const { result } = renderHook(() => useAutoOrganize());
    act(() => {
      result.current.applyPlan(plan);
    });

    // Assert
    const folderArg = mockAddFolder.mock.calls[0][0] as {
      id: string;
      name: string;
      parentId: null;
      starred: boolean;
      color: string;
    };
    expect(folderArg.name).toBe("Analytics");
    expect(folderArg.parentId).toBeNull();
    expect(folderArg.starred).toBe(false);
    expect(folderArg.color).toBe("#6366f1");
    expect(typeof folderArg.id).toBe("string");
    expect(folderArg.id.startsWith("folder-ai-")).toBe(true);
  });

  it("returns the number of datasets that were moved", () => {
    // Arrange
    mockDatasetsRef.value = [
      makeDataset({ id: "ds-1" }),
      makeDataset({ id: "ds-2" }),
      makeDataset({ id: "ds-3" }),
    ];
    mockDatasetFolderMapRef.value = {};

    const plan = {
      groups: [
        { folderName: "A", datasetIds: ["ds-1", "ds-2"] },
        { folderName: "B", datasetIds: ["ds-3"] },
      ],
    };

    // Act
    const { result } = renderHook(() => useAutoOrganize());
    let count!: number;
    act(() => {
      count = result.current.applyPlan(plan);
    });

    // Assert
    expect(count).toBe(3);
  });

  it("updates appliedCount state after applyPlan", () => {
    // Arrange
    mockDatasetsRef.value = [makeDataset({ id: "ds-1" }), makeDataset({ id: "ds-2" })];
    mockDatasetFolderMapRef.value = {};

    const plan = {
      groups: [{ folderName: "Both", datasetIds: ["ds-1", "ds-2"] }],
    };

    // Act
    const { result } = renderHook(() => useAutoOrganize());
    act(() => {
      result.current.applyPlan(plan);
    });

    // Assert
    expect(result.current.appliedCount).toBe(2);
  });

  it("clears lastPlan after applyPlan is called", async () => {
    // Arrange: first populate lastPlan via organize
    mockDatasetsRef.value = [makeDataset({ id: "ds-1" })];
    mockDatasetFolderMapRef.value = {};

    const aiPlan = { groups: [{ folderName: "Finance", datasetIds: ["ds-1"] }] };
    mockGenerateStructured.mockResolvedValueOnce(aiPlan);

    const { result } = renderHook(() => useAutoOrganize());
    await act(async () => {
      await result.current.organize();
    });
    expect(result.current.lastPlan).not.toBeNull();

    // Act: apply the plan
    act(() => {
      result.current.applyPlan(aiPlan);
    });

    // Assert: lastPlan is cleared
    expect(result.current.lastPlan).toBeNull();
  });

  it("skips duplicate dataset IDs across groups (cross-group deduplication)", () => {
    // Arrange: ds-1 appears in both groups
    mockDatasetsRef.value = [makeDataset({ id: "ds-1" })];
    mockDatasetFolderMapRef.value = {};

    const plan = {
      groups: [
        { folderName: "GroupA", datasetIds: ["ds-1"] },
        { folderName: "GroupB", datasetIds: ["ds-1"] }, // duplicate
      ],
    };

    // Act
    const { result } = renderHook(() => useAutoOrganize());
    let count!: number;
    act(() => {
      count = result.current.applyPlan(plan);
    });

    // Assert: ds-1 only moved once (assigned set prevents double-move)
    expect(count).toBe(1);
    expect(mockMoveDataset).toHaveBeenCalledTimes(1);
    // Two folders still created
    expect(mockAddFolder).toHaveBeenCalledTimes(2);
  });

  it("handles an empty groups array without calling addFolder or moveDataset", () => {
    // Arrange
    mockDatasetsRef.value = [];
    mockDatasetFolderMapRef.value = {};

    const plan = { groups: [] };

    // Act
    const { result } = renderHook(() => useAutoOrganize());
    let count!: number;
    act(() => {
      count = result.current.applyPlan(plan);
    });

    // Assert
    expect(count).toBe(0);
    expect(mockAddFolder).not.toHaveBeenCalled();
    expect(mockMoveDataset).not.toHaveBeenCalled();
    expect(result.current.appliedCount).toBe(0);
  });

  it("generates a unique id for each folder", () => {
    // Arrange
    mockDatasetsRef.value = [makeDataset({ id: "ds-1" }), makeDataset({ id: "ds-2" })];
    mockDatasetFolderMapRef.value = {};

    const plan = {
      groups: [
        { folderName: "X", datasetIds: ["ds-1"] },
        { folderName: "Y", datasetIds: ["ds-2"] },
      ],
    };

    // Act
    const { result } = renderHook(() => useAutoOrganize());
    act(() => {
      result.current.applyPlan(plan);
    });

    // Assert: folder IDs are distinct strings
    const ids = mockAddFolder.mock.calls.map((c: [{ id: string }]) => c[0].id) as string[];
    expect(ids[0]).not.toBe(ids[1]);
  });
});
