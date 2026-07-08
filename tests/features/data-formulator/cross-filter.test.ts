import { describe, expect, it } from "vitest";
import {
  CROSS_FILTERABLE_CHART_TYPES,
  resolveCrossFilter,
} from "@/features/data-formulator/components/formulator2/cross-filter";

describe("resolveCrossFilter", () => {
  it("returns a target for a categorical bar click", () => {
    // Arrange / Act
    const target = resolveCrossFilter({ name: "Nord" }, "region", "bar");

    // Assert
    expect(target).toEqual({ field: "region", value: "Nord" });
  });

  it("trims surrounding whitespace on the clicked value", () => {
    expect(resolveCrossFilter({ name: "  Sud  " }, "region", "line")).toEqual({
      field: "region",
      value: "Sud",
    });
  });

  it("returns null when no x field is bound", () => {
    expect(resolveCrossFilter({ name: "Nord" }, null, "bar")).toBeNull();
    expect(resolveCrossFilter({ name: "Nord" }, "", "bar")).toBeNull();
  });

  it("returns null for chart types whose click is not an x category", () => {
    expect(resolveCrossFilter({ name: "Points" }, "region", "scatter")).toBeNull();
    expect(resolveCrossFilter({ name: "cell" }, "region", "heatmap")).toBeNull();
    expect(resolveCrossFilter({ name: "x" }, "region", "radar")).toBeNull();
  });

  it("returns null for an empty or non-string category", () => {
    expect(resolveCrossFilter({ name: "" }, "region", "bar")).toBeNull();
    expect(resolveCrossFilter({ name: "   " }, "region", "bar")).toBeNull();
    expect(resolveCrossFilter({ name: 42 }, "region", "bar")).toBeNull();
    expect(resolveCrossFilter({}, "region", "bar")).toBeNull();
    expect(resolveCrossFilter(null, "region", "bar")).toBeNull();
  });

  it("returns null when the chart type is unknown", () => {
    expect(resolveCrossFilter({ name: "Nord" }, "region", null)).toBeNull();
    expect(resolveCrossFilter({ name: "Nord" }, "region", "data-table")).toBeNull();
  });

  it("treats pie, donut, treemap and funnel slices as categorical x", () => {
    for (const type of ["pie", "donut", "treemap", "funnel"]) {
      expect(CROSS_FILTERABLE_CHART_TYPES.has(type)).toBe(true);
      expect(resolveCrossFilter({ name: "A" }, "cat", type)).toEqual({
        field: "cat",
        value: "A",
      });
    }
  });
});
