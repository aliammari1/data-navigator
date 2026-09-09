import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the persistence boundary so store writes never touch fetch / SQLite.
vi.mock("@/platform/settings/settings-client", () => ({
  canUseSettingsApi: () => false,
  getAppSettingRemote: vi.fn(async () => ({ value: null, updatedAt: null })),
  putAppSettingRemote: vi.fn(async () => null),
  deleteAppSettingRemote: vi.fn(async () => undefined),
  exportAppSettingsRemote: vi.fn(async () => ({})),
}));

import {
  useTelecomSession,
  useTelecomSessionActions,
  useTelecomSessionStore,
} from "@/core/stores/app-session-store";
import { TELECOM_TABLE_BASE } from "@/features/telecom/lib/names";

/** Reset to the documented defaults between tests for full isolation. */
function resetStore() {
  act(() => {
    useTelecomSessionStore.setState({
      tableName: TELECOM_TABLE_BASE,
      fileName: "",
      reportDate: "",
    });
  });
}

describe("useTelecomSessionStore", () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("defaults", () => {
    it("starts with the canonical telecom table and empty file/date", () => {
      const state = useTelecomSessionStore.getState();

      expect(state.tableName).toBe(TELECOM_TABLE_BASE);
      expect(state.fileName).toBe("");
      expect(state.reportDate).toBe("");
    });
  });

  describe("setTableName", () => {
    it("updates the active table name", () => {
      act(() => {
        useTelecomSessionStore.getState().setTableName("telecom_transactions_2");
      });
      expect(useTelecomSessionStore.getState().tableName).toBe("telecom_transactions_2");
    });

    it("does not modify file or report date", () => {
      act(() => {
        useTelecomSessionStore.getState().setFileName("daily.csv");
        useTelecomSessionStore.getState().setReportDate("2026-06-16");
      });

      act(() => {
        useTelecomSessionStore.getState().setTableName("other_table");
      });

      const state = useTelecomSessionStore.getState();
      expect(state.fileName).toBe("daily.csv");
      expect(state.reportDate).toBe("2026-06-16");
    });
  });

  describe("setFileName", () => {
    it("stores the source file name", () => {
      act(() => {
        useTelecomSessionStore.getState().setFileName("DailyTransactions.csv");
      });
      expect(useTelecomSessionStore.getState().fileName).toBe("DailyTransactions.csv");
    });

    it("accepts an empty string to clear it", () => {
      act(() => {
        useTelecomSessionStore.getState().setFileName("DailyTransactions.csv");
      });
      act(() => {
        useTelecomSessionStore.getState().setFileName("");
      });
      expect(useTelecomSessionStore.getState().fileName).toBe("");
    });
  });

  describe("setReportDate", () => {
    it("stores the report date string verbatim", () => {
      act(() => {
        useTelecomSessionStore.getState().setReportDate("2026-06-16");
      });
      expect(useTelecomSessionStore.getState().reportDate).toBe("2026-06-16");
    });
  });

  describe("setSession", () => {
    it("merges all three provided fields at once", () => {
      // Act
      act(() => {
        useTelecomSessionStore.getState().setSession({
          tableName: "telecom_transactions_3",
          fileName: "march.csv",
          reportDate: "2026-03-01",
        });
      });

      // Assert
      const state = useTelecomSessionStore.getState();
      expect(state.tableName).toBe("telecom_transactions_3");
      expect(state.fileName).toBe("march.csv");
      expect(state.reportDate).toBe("2026-03-01");
    });

    it("preserves existing fields that are omitted from the patch", () => {
      // Arrange
      act(() => {
        useTelecomSessionStore.getState().setSession({
          tableName: "keep_table",
          fileName: "keep.csv",
          reportDate: "2026-01-01",
        });
      });

      // Act: only patch fileName.
      act(() => {
        useTelecomSessionStore.getState().setSession({ fileName: "changed.csv" });
      });

      // Assert
      const state = useTelecomSessionStore.getState();
      expect(state.tableName).toBe("keep_table");
      expect(state.fileName).toBe("changed.csv");
      expect(state.reportDate).toBe("2026-01-01");
    });

    it("treats undefined patch fields as 'keep current' via the ?? fallback", () => {
      // Arrange
      act(() => {
        useTelecomSessionStore.getState().setSession({
          tableName: "base_table",
          fileName: "base.csv",
          reportDate: "2026-02-02",
        });
      });

      // Act: explicitly pass undefined — should fall back to current values.
      act(() => {
        useTelecomSessionStore.getState().setSession({
          tableName: undefined,
          fileName: undefined,
          reportDate: undefined,
        });
      });

      // Assert
      const state = useTelecomSessionStore.getState();
      expect(state.tableName).toBe("base_table");
      expect(state.fileName).toBe("base.csv");
      expect(state.reportDate).toBe("2026-02-02");
    });

    it("does allow an empty string to overwrite (only undefined is treated as keep)", () => {
      // Arrange
      act(() => {
        useTelecomSessionStore.getState().setSession({
          fileName: "present.csv",
          reportDate: "2026-04-04",
        });
      });

      // Act: empty string is a defined value, so it overwrites.
      act(() => {
        useTelecomSessionStore.getState().setSession({ fileName: "" });
      });

      // Assert
      expect(useTelecomSessionStore.getState().fileName).toBe("");
      expect(useTelecomSessionStore.getState().reportDate).toBe("2026-04-04");
    });

    it("is a no-op when given an empty patch", () => {
      // Arrange
      act(() => {
        useTelecomSessionStore.getState().setSession({
          tableName: "stable",
          fileName: "stable.csv",
          reportDate: "2026-05-05",
        });
      });

      // Act
      act(() => {
        useTelecomSessionStore.getState().setSession({});
      });

      // Assert
      const state = useTelecomSessionStore.getState();
      expect(state.tableName).toBe("stable");
      expect(state.fileName).toBe("stable.csv");
      expect(state.reportDate).toBe("2026-05-05");
    });
  });

  describe("selector hooks", () => {
    it("useTelecomSession reflects the current session snapshot", () => {
      // Arrange
      act(() => {
        useTelecomSessionStore.getState().setSession({
          tableName: "snap_table",
          fileName: "snap.csv",
          reportDate: "2026-06-06",
        });
      });

      // Act
      const { result } = renderHook(() => useTelecomSession());

      // Assert
      expect(result.current).toEqual({
        tableName: "snap_table",
        fileName: "snap.csv",
        reportDate: "2026-06-06",
      });
    });

    it("useTelecomSessionActions exposes working mutators", () => {
      // Arrange
      const { result } = renderHook(() => useTelecomSessionActions());

      // Act
      act(() => {
        result.current.setReportDate("2026-12-31");
      });

      // Assert
      expect(useTelecomSessionStore.getState().reportDate).toBe("2026-12-31");
      expect(typeof result.current.setSession).toBe("function");
    });
  });

  describe("persist.migrate", () => {
    // Access the migrate function directly from the persist options so we can
    // exercise every branch without triggering real storage I/O.
    function getMigrate() {
      return useTelecomSessionStore.persist.getOptions().migrate!;
    }

    it("returns all three fields from a fully valid persisted object", () => {
      const result = getMigrate()(
        { tableName: "custom_table", fileName: "daily.csv", reportDate: "2026-01-01" },
        0,
      );
      expect(result).toEqual({
        tableName: "custom_table",
        fileName: "daily.csv",
        reportDate: "2026-01-01",
      });
    });

    it("falls back to TELECOM_TABLE_BASE when persisted tableName is an empty string", () => {
      const result = getMigrate()(
        { tableName: "", fileName: "f.csv", reportDate: "2026-01-01" },
        0,
      );
      expect((result as { tableName: string }).tableName).toBe(TELECOM_TABLE_BASE);
    });

    it("falls back to TELECOM_TABLE_BASE when persisted tableName is whitespace only", () => {
      const result = getMigrate()(
        { tableName: "   ", fileName: "f.csv", reportDate: "2026-01-01" },
        0,
      );
      expect((result as { tableName: string }).tableName).toBe(TELECOM_TABLE_BASE);
    });

    it("falls back to TELECOM_TABLE_BASE when persisted tableName is not a string", () => {
      const result = getMigrate()(
        { tableName: 42, fileName: "f.csv", reportDate: "2026-01-01" },
        0,
      );
      expect((result as { tableName: string }).tableName).toBe(TELECOM_TABLE_BASE);
    });

    it("falls back to empty string when persisted fileName is not a string", () => {
      const result = getMigrate()({ tableName: "t", fileName: 99, reportDate: "2026-01-01" }, 0);
      expect((result as { fileName: string }).fileName).toBe("");
    });

    it("falls back to empty string when persisted reportDate is not a string", () => {
      const result = getMigrate()({ tableName: "t", fileName: "f.csv", reportDate: null }, 0);
      expect((result as { reportDate: string }).reportDate).toBe("");
    });

    it("handles null persisted state by using defaults", () => {
      const result = getMigrate()(null, 0) as {
        tableName: string;
        fileName: string;
        reportDate: string;
      };
      expect(result.tableName).toBe(TELECOM_TABLE_BASE);
      expect(result.fileName).toBe("");
      expect(result.reportDate).toBe("");
    });

    it("handles undefined persisted state by using defaults", () => {
      const result = getMigrate()(undefined, 0) as {
        tableName: string;
        fileName: string;
        reportDate: string;
      };
      expect(result.tableName).toBe(TELECOM_TABLE_BASE);
      expect(result.fileName).toBe("");
      expect(result.reportDate).toBe("");
    });
  });

  describe("persist.partialize", () => {
    it("selects only tableName, fileName, and reportDate from the full state", () => {
      const partialize = useTelecomSessionStore.persist.getOptions().partialize!;
      const state = useTelecomSessionStore.getState();
      const partial = partialize(state);
      expect(Object.keys(partial)).toEqual(["tableName", "fileName", "reportDate"]);
      expect(partial).toEqual({
        tableName: state.tableName,
        fileName: state.fileName,
        reportDate: state.reportDate,
      });
    });
  });
});
