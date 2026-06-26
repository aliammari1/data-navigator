import { describe, expect, it, vi } from "vitest";

/**
 * Coverage test for src/features/geo-analysis/lib/echarts-core.ts
 *
 * The module is a side-effect registration file: it calls echarts.use() with a
 * fixed set of chart types and components at import time, then re-exports the
 * configured echarts instance as the default export.
 *
 * There are no branches, no conditionals, and no exported functions — every
 * line executes once at module evaluation. A single import covers 100% of
 * lines and functions.
 */

// Use vi.hoisted so these variables are available inside vi.mock() factories,
// which are hoisted to the top of the file by Vitest's transform.
const { mockUse, capturedRegistrations } = vi.hoisted(() => {
  const captured: { items: unknown[] } = { items: [] };
  const use = vi.fn((items: unknown[]) => {
    captured.items = items;
  });
  return { mockUse: use, capturedRegistrations: captured };
});

vi.mock("echarts/core", () => ({
  default: { use: mockUse },
  use: mockUse,
}));

vi.mock("echarts/charts", () => ({
  HeatmapChart: { type: "HeatmapChart" },
  PieChart: { type: "PieChart" },
}));

vi.mock("echarts/components", () => ({
  GridComponent: { type: "GridComponent" },
  LegendComponent: { type: "LegendComponent" },
  TooltipComponent: { type: "TooltipComponent" },
  VisualMapComponent: { type: "VisualMapComponent" },
}));

vi.mock("echarts/renderers", () => ({
  CanvasRenderer: { type: "CanvasRenderer" },
}));

// Top-level static import: Vitest hoists vi.mock() calls above this import,
// so the mocks are in place before the module evaluates. The module runs
// echarts.use([...]) immediately, which populates capturedRegistrations.items.
import echartsInstance from "@/features/geo-analysis/lib/echarts-core";

describe("geo-analysis echarts-core registration module", () => {
  it("re-exports the echarts core object as the default export", () => {
    expect(echartsInstance).toBeDefined();
    expect(echartsInstance).toHaveProperty("use");
  });

  it("populates the registration array during module initialisation", () => {
    // capturedRegistrations.items is set synchronously during module evaluation
    // and persists regardless of clearMocks.
    expect(Array.isArray(capturedRegistrations.items)).toBe(true);
    expect(capturedRegistrations.items.length).toBeGreaterThan(0);
  });

  it("registers all seven required chart / component / renderer entries", () => {
    expect(capturedRegistrations.items).toHaveLength(7);
  });

  it("includes HeatmapChart in the registration list", () => {
    expect(capturedRegistrations.items).toContainEqual({ type: "HeatmapChart" });
  });

  it("includes PieChart in the registration list", () => {
    expect(capturedRegistrations.items).toContainEqual({ type: "PieChart" });
  });

  it("includes TooltipComponent in the registration list", () => {
    expect(capturedRegistrations.items).toContainEqual({ type: "TooltipComponent" });
  });

  it("includes VisualMapComponent in the registration list", () => {
    expect(capturedRegistrations.items).toContainEqual({ type: "VisualMapComponent" });
  });

  it("includes GridComponent in the registration list", () => {
    expect(capturedRegistrations.items).toContainEqual({ type: "GridComponent" });
  });

  it("includes LegendComponent in the registration list", () => {
    expect(capturedRegistrations.items).toContainEqual({ type: "LegendComponent" });
  });

  it("includes CanvasRenderer in the registration list", () => {
    expect(capturedRegistrations.items).toContainEqual({ type: "CanvasRenderer" });
  });
});
