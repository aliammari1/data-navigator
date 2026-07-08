import { describe, expect, it } from "vitest";
import { useFormulatorV2Store } from "@/features/data-formulator/store/formulator-store";

/**
 * Rehydration merge — persisted "formulator-v2" snapshots written before a
 * field was added to ShelfState must deep-fill from defaults instead of
 * clobbering the shelf wholesale (zustand's default merge is shallow, so a
 * pre-`filters` snapshot left `shelf.filters` undefined and crashed FilterBar
 * on `filters.length`).
 */
describe("formulator-v2 rehydration merge", () => {
  // Test the merge option directly (settings-store.test.ts pattern) — no
  // storage round-trip needed.
  const getMerge = () => {
    const merge = useFormulatorV2Store.persist.getOptions().merge;
    if (!merge) throw new Error("persist config has no merge — rehydration is shallow");
    return merge as (persisted: unknown, current: unknown) => Record<string, unknown>;
  };

  const currentState = () => useFormulatorV2Store.getInitialState();

  it("fills shelf.filters with [] for a snapshot written before filters existed", () => {
    // Arrange — a persisted shelf from the pre-filters schema.
    const persisted = {
      tables: [],
      concepts: [],
      focusedTableId: null,
      shelf: { chartType: "bar", encodings: [], instruction: "ventes par région" },
    };

    // Act
    const merged = getMerge()(persisted, currentState());

    // Assert
    const shelf = merged.shelf as Record<string, unknown>;
    expect(shelf.filters).toEqual([]);
  });

  it("preserves persisted shelf values while filling missing fields", () => {
    const persisted = {
      shelf: { chartType: "line", encodings: [{ channel: "x", field: "mois" }], instruction: "" },
    };

    const merged = getMerge()(persisted, currentState());

    const shelf = merged.shelf as Record<string, unknown>;
    expect(shelf.chartType).toBe("line");
    expect(shelf.encodings).toEqual([{ channel: "x", field: "mois" }]);
    expect(shelf.filters).toEqual([]);
  });

  it("keeps persisted filters when the snapshot already has them", () => {
    const filters = [{ id: "flt-1", field: "region", op: "=", value: "Nord" }];
    const persisted = {
      shelf: { chartType: "auto", encodings: [], filters, instruction: "" },
    };

    const merged = getMerge()(persisted, currentState());

    expect((merged.shelf as Record<string, unknown>).filters).toEqual(filters);
  });

  it("falls back to the full default state when nothing was persisted", () => {
    const merged = getMerge()(undefined, currentState());

    const shelf = merged.shelf as Record<string, unknown>;
    expect(shelf.filters).toEqual([]);
    expect(shelf.chartType).toBe("auto");
    // Actions must survive the merge — they only live on currentState.
    expect(typeof merged.addFilter).toBe("function");
  });
});
