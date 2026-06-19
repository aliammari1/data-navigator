import { beforeEach, vi } from "vitest";

// Mock the DuckDB boundary so importing the hook module never pulls in the real
// worker/wasm graph. mapDiffRow itself is pure and never touches DuckDB; we only
// exercise the pure data-shaping function here.
const { runReadOnlyQuery } = vi.hoisted(() => ({ runReadOnlyQuery: vi.fn() }));
vi.mock("@/platform/duckdb/duckdb", () => ({
  runReadOnlyQuery,
}));

import { type DiffConfig, mapDiffRow } from "@/features/reconciliation/lib/use-reconciliation";

function baseConfig(overrides: Partial<DiffConfig> = {}): DiffConfig {
  return {
    expectedView: "exp",
    actualView: "act",
    keyCols: [{ expected: "channel", actual: "channel" }],
    measures: [{ label: "revenue", expected: "rev", actual: "rev" }],
    ...overrides,
  };
}

describe("mapDiffRow", () => {
  beforeEach(() => {
    runReadOnlyQuery.mockReset();
  });

  it("maps a fully-populated CHANGED row into typed cells", () => {
    const row = mapDiffRow(baseConfig(), {
      key_0: "USSD",
      exp_revenue: 100,
      act_revenue: 120,
      var_revenue: 20,
      varpct_revenue: 20,
      diff_status: "CHANGED",
    });

    expect(row.key).toBe("USSD");
    expect(row.keyParts).toEqual(["USSD"]);
    expect(row.status).toBe("CHANGED");
    expect(row.measures).toEqual([
      {
        label: "revenue",
        expected: 100,
        actual: 120,
        variance: 20,
        variancePct: 20,
      },
    ]);
    expect(row.primaryVariance).toBe(20);
    expect(row.primaryVariancePct).toBe(20);
  });

  it("joins composite key parts with a middot separator", () => {
    const cfg = baseConfig({
      keyCols: [
        { expected: "channel", actual: "channel" },
        { expected: "day", actual: "day" },
      ],
    });
    const row = mapDiffRow(cfg, {
      key_0: "USSD",
      key_1: "2026-01-01",
      diff_status: "UNCHANGED",
    });
    expect(row.keyParts).toEqual(["USSD", "2026-01-01"]);
    expect(row.key).toBe("USSD · 2026-01-01");
  });

  it("substitutes the empty-set glyph for a missing key part", () => {
    const row = mapDiffRow(baseConfig(), { diff_status: "ADDED" });
    expect(row.keyParts).toEqual(["∅"]);
    expect(row.key).toBe("∅");
  });

  it("preserves null expected/actual/variance%% while coercing variance to a number", () => {
    const row = mapDiffRow(baseConfig(), {
      key_0: "EXTERNAL",
      exp_revenue: null,
      act_revenue: 50,
      var_revenue: null,
      varpct_revenue: null,
      diff_status: "ADDED",
    });
    const cell = row.measures[0];
    expect(cell.expected).toBeNull();
    expect(cell.actual).toBe(50);
    // variance uses toNum → null collapses to 0
    expect(cell.variance).toBe(0);
    expect(cell.variancePct).toBeNull();
    expect(row.primaryVariancePct).toBeNull();
  });

  it("defaults the status to UNCHANGED when diff_status is absent", () => {
    const row = mapDiffRow(baseConfig(), { key_0: "X" });
    expect(row.status).toBe("UNCHANGED");
  });

  it("maps multiple measures and uses the first as the primary", () => {
    const cfg = baseConfig({
      measures: [
        { label: "rev", expected: "re", actual: "ra" },
        { label: "qty", expected: "qe", actual: "qa" },
      ],
    });
    const row = mapDiffRow(cfg, {
      key_0: "VOICE",
      exp_rev: 10,
      act_rev: 30,
      var_rev: 20,
      varpct_rev: 200,
      exp_qty: 5,
      act_qty: 6,
      var_qty: 1,
      varpct_qty: 20,
      diff_status: "CHANGED",
    });
    expect(row.measures).toHaveLength(2);
    expect(row.measures[1].label).toBe("qty");
    expect(row.primaryVariance).toBe(20);
    expect(row.primaryVariancePct).toBe(200);
  });

  it("unwraps DuckDB BigInt / typed-array scalars in measure cells", () => {
    const row = mapDiffRow(baseConfig(), {
      key_0: "DATA",
      exp_revenue: 100n,
      act_revenue: new Float64Array([250.5]),
      var_revenue: 150n,
      varpct_revenue: new Float64Array([150.5]),
      diff_status: "CHANGED",
    });
    const cell = row.measures[0];
    expect(cell.expected).toBe(100);
    expect(cell.actual).toBe(250.5);
    expect(cell.variance).toBe(150);
    expect(cell.variancePct).toBe(150.5);
  });
});
