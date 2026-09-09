import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the persistence boundary so store writes never touch fetch / SQLite.
// `canUseSettingsApi() === false` makes createDrizzleStorage's durable writes inert.
vi.mock("@/platform/settings/settings-client", () => ({
  canUseSettingsApi: () => false,
  getAppSettingRemote: vi.fn(async () => ({ value: null, updatedAt: null })),
  putAppSettingRemote: vi.fn(async () => null),
  deleteAppSettingRemote: vi.fn(async () => undefined),
  exportAppSettingsRemote: vi.fn(async () => ({})),
}));

import {
  type AppDomain,
  useAppContextActions,
  useAppContextSlice,
  useAppContextStore,
} from "@/core/stores/app-context-store";

/** Reset to the documented defaults between tests for full isolation. */
function resetStore() {
  act(() => {
    useAppContextStore.setState({
      activeDomain: "telecom",
      activeDatasetId: null,
      activeTableName: null,
    });
  });
}

describe("useAppContextStore", () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("defaults", () => {
    it("starts with the telecom domain and null dataset/table ids", () => {
      // Arrange / Act
      const state = useAppContextStore.getState();

      // Assert
      expect(state.activeDomain).toBe("telecom");
      expect(state.activeDatasetId).toBeNull();
      expect(state.activeTableName).toBeNull();
    });
  });

  describe("setActiveDomain", () => {
    it("switches between the two known domains", () => {
      const domains: AppDomain[] = ["general", "telecom"];

      for (const domain of domains) {
        act(() => {
          useAppContextStore.getState().setActiveDomain(domain);
        });
        expect(useAppContextStore.getState().activeDomain).toBe(domain);
      }
    });

    it("leaves dataset and table ids untouched", () => {
      // Arrange
      act(() => {
        useAppContextStore.getState().setActiveDatasetId("ds-1");
        useAppContextStore.getState().setActiveTableName("t-1");
      });

      // Act
      act(() => {
        useAppContextStore.getState().setActiveDomain("general");
      });

      // Assert
      const state = useAppContextStore.getState();
      expect(state.activeDatasetId).toBe("ds-1");
      expect(state.activeTableName).toBe("t-1");
    });
  });

  describe("setActiveDatasetId", () => {
    it("stores a dataset id", () => {
      act(() => {
        useAppContextStore.getState().setActiveDatasetId("dataset-42");
      });
      expect(useAppContextStore.getState().activeDatasetId).toBe("dataset-42");
    });

    it("accepts null to clear the active dataset", () => {
      act(() => {
        useAppContextStore.getState().setActiveDatasetId("dataset-42");
      });
      act(() => {
        useAppContextStore.getState().setActiveDatasetId(null);
      });
      expect(useAppContextStore.getState().activeDatasetId).toBeNull();
    });
  });

  describe("setActiveTableName", () => {
    it("stores a table name and clears it with null", () => {
      act(() => {
        useAppContextStore.getState().setActiveTableName("orders");
      });
      expect(useAppContextStore.getState().activeTableName).toBe("orders");

      act(() => {
        useAppContextStore.getState().setActiveTableName(null);
      });
      expect(useAppContextStore.getState().activeTableName).toBeNull();
    });
  });

  describe("setContext", () => {
    it("merges a partial patch over current state", () => {
      // Arrange
      act(() => {
        useAppContextStore.getState().setActiveDatasetId("ds-existing");
      });

      // Act: patch only the domain and table; dataset must be preserved.
      act(() => {
        useAppContextStore
          .getState()
          .setContext({ activeDomain: "general", activeTableName: "t-new" });
      });

      // Assert
      const state = useAppContextStore.getState();
      expect(state.activeDomain).toBe("general");
      expect(state.activeTableName).toBe("t-new");
      expect(state.activeDatasetId).toBe("ds-existing");
    });

    it("is a no-op for state fields when given an empty patch", () => {
      // Arrange
      act(() => {
        useAppContextStore.getState().setContext({
          activeDomain: "general",
          activeDatasetId: "ds-7",
          activeTableName: "t-7",
        });
      });

      // Act
      act(() => {
        useAppContextStore.getState().setContext({});
      });

      // Assert
      const state = useAppContextStore.getState();
      expect(state.activeDomain).toBe("general");
      expect(state.activeDatasetId).toBe("ds-7");
      expect(state.activeTableName).toBe("t-7");
    });

    it("can explicitly null out ids through the patch", () => {
      // Arrange
      act(() => {
        useAppContextStore.getState().setContext({
          activeDatasetId: "ds-7",
          activeTableName: "t-7",
        });
      });

      // Act
      act(() => {
        useAppContextStore.getState().setContext({ activeDatasetId: null, activeTableName: null });
      });

      // Assert
      const state = useAppContextStore.getState();
      expect(state.activeDatasetId).toBeNull();
      expect(state.activeTableName).toBeNull();
    });
  });

  describe("selector hooks", () => {
    it("useAppContextSlice exposes the current context values", () => {
      // Arrange
      act(() => {
        useAppContextStore.getState().setContext({
          activeDomain: "general",
          activeDatasetId: "ds-slice",
          activeTableName: "t-slice",
        });
      });

      // Act
      const { result } = renderHook(() => useAppContextSlice());

      // Assert
      expect(result.current).toEqual({
        activeDomain: "general",
        activeDatasetId: "ds-slice",
        activeTableName: "t-slice",
      });
    });

    it("useAppContextActions exposes the mutating actions and they work", () => {
      // Arrange
      const { result } = renderHook(() => useAppContextActions());

      // Act
      act(() => {
        result.current.setActiveDomain("general");
      });

      // Assert
      expect(useAppContextStore.getState().activeDomain).toBe("general");
      expect(typeof result.current.setContext).toBe("function");
    });
  });
});

// ─── persist.migrate ─────────────────────────────────────────────────────────

describe("useAppContextStore — persist.migrate", () => {
  // Extract the migrate function directly from the persist options.
  type MigrateFn = (persisted: unknown, version: number) => unknown;
  const getMigrate = () =>
    (
      useAppContextStore as unknown as { persist: { getOptions: () => { migrate: MigrateFn } } }
    ).persist.getOptions().migrate;

  it("falls back to 'telecom' when persisted is null", () => {
    const result = getMigrate()(null, 0) as Record<string, unknown>;
    expect(result.activeDomain).toBe("telecom");
    expect(result.activeDatasetId).toBeNull();
    expect(result.activeTableName).toBeNull();
  });

  it("falls back to 'telecom' when persisted is undefined", () => {
    const result = getMigrate()(undefined, 0) as Record<string, unknown>;
    expect(result.activeDomain).toBe("telecom");
    expect(result.activeDatasetId).toBeNull();
    expect(result.activeTableName).toBeNull();
  });

  it("preserves a valid 'telecom' domain from persisted state", () => {
    const result = getMigrate()(
      { activeDomain: "telecom", activeDatasetId: "ds-1", activeTableName: "t-1" },
      0,
    ) as Record<string, unknown>;
    expect(result.activeDomain).toBe("telecom");
    expect(result.activeDatasetId).toBe("ds-1");
    expect(result.activeTableName).toBe("t-1");
  });

  it("preserves a valid 'general' domain from persisted state", () => {
    const result = getMigrate()(
      { activeDomain: "general", activeDatasetId: null, activeTableName: null },
      0,
    ) as Record<string, unknown>;
    expect(result.activeDomain).toBe("general");
    expect(result.activeDatasetId).toBeNull();
    expect(result.activeTableName).toBeNull();
  });

  it("falls back to 'telecom' for an unknown/invalid domain", () => {
    const result = getMigrate()({ activeDomain: "unknown-domain" }, 0) as Record<string, unknown>;
    expect(result.activeDomain).toBe("telecom");
  });

  it("falls back to 'telecom' when activeDomain is an empty string (falsy)", () => {
    const result = getMigrate()({ activeDomain: "" }, 0) as Record<string, unknown>;
    expect(result.activeDomain).toBe("telecom");
  });

  it("defaults activeDatasetId to null when missing from persisted state (nullish branch)", () => {
    const result = getMigrate()({ activeDomain: "general" }, 0) as Record<string, unknown>;
    expect(result.activeDatasetId).toBeNull();
  });

  it("defaults activeTableName to null when missing from persisted state (nullish branch)", () => {
    const result = getMigrate()({ activeDomain: "general" }, 0) as Record<string, unknown>;
    expect(result.activeTableName).toBeNull();
  });

  it("preserves non-null activeDatasetId from persisted state", () => {
    const result = getMigrate()(
      { activeDomain: "general", activeDatasetId: "ds-persisted" },
      0,
    ) as Record<string, unknown>;
    expect(result.activeDatasetId).toBe("ds-persisted");
  });

  it("preserves non-null activeTableName from persisted state", () => {
    const result = getMigrate()(
      { activeDomain: "general", activeTableName: "t-persisted" },
      0,
    ) as Record<string, unknown>;
    expect(result.activeTableName).toBe("t-persisted");
  });
});
