import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Mock the DuckDB boundary so importing the hook module never pulls in the real
// worker/wasm graph. mapDiffRow itself is pure and never touches DuckDB; we only
// exercise the pure data-shaping function here.
const { runReadOnlyQuery } = vi.hoisted(() => ({ runReadOnlyQuery: vi.fn() }));
vi.mock("@/platform/duckdb/duckdb", () => ({
  runReadOnlyQuery,
}));

import {
  type DiffConfig,
  mapDiffRow,
  useDiffSummary,
  useDiffPage,
  fetchMaterialRows,
} from "@/features/reconciliation/lib/use-reconciliation";

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

  it("falls back to 0/null for primaryVariance/primaryVariancePct when measures array is empty", () => {
    const cfg = baseConfig({ measures: [] });
    const row = mapDiffRow(cfg, { key_0: "X", diff_status: "UNCHANGED" });
    expect(row.measures).toHaveLength(0);
    expect(row.primaryVariance).toBe(0);
    expect(row.primaryVariancePct).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Helpers for React Query hook tests
// ──────────────────────────────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// fetchMaterialRows
// ──────────────────────────────────────────────────────────────────────────────

describe("fetchMaterialRows", () => {
  beforeEach(() => {
    runReadOnlyQuery.mockReset();
  });

  it("calls runReadOnlyQuery and maps every raw row through mapDiffRow", async () => {
    runReadOnlyQuery.mockResolvedValue([
      { key_0: "VOICE", exp_revenue: 100, act_revenue: 150, var_revenue: 50, varpct_revenue: 50, diff_status: "CHANGED" },
      { key_0: "DATA",  exp_revenue: 200, act_revenue: 180, var_revenue: -20, varpct_revenue: -10, diff_status: "CHANGED" },
    ]);

    const rows = await fetchMaterialRows(baseConfig(), 10);

    expect(runReadOnlyQuery).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(2);
    expect(rows[0].key).toBe("VOICE");
    expect(rows[0].primaryVariance).toBe(50);
    expect(rows[1].key).toBe("DATA");
    expect(rows[1].primaryVariance).toBe(-20);
  });

  it("returns an empty array when DuckDB returns no rows", async () => {
    runReadOnlyQuery.mockResolvedValue([]);

    const rows = await fetchMaterialRows(baseConfig(), 5);

    expect(rows).toEqual([]);
    expect(runReadOnlyQuery).toHaveBeenCalledTimes(1);
  });

  it("propagates DuckDB errors to the caller", async () => {
    runReadOnlyQuery.mockRejectedValue(new Error("DuckDB OOM"));

    await expect(fetchMaterialRows(baseConfig(), 5)).rejects.toThrow("DuckDB OOM");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// useDiffSummary
// ──────────────────────────────────────────────────────────────────────────────

describe("useDiffSummary", () => {
  beforeEach(() => {
    runReadOnlyQuery.mockReset();
  });

  it("is disabled and stays in pending state when cfg is null", () => {
    const client = makeQueryClient();
    const { result } = renderHook(() => useDiffSummary(null, 5), {
      wrapper: makeWrapper(client),
    });

    // Query is disabled → status stays "pending" and no fetch is triggered.
    expect(result.current.fetchStatus).toBe("idle");
    expect(runReadOnlyQuery).not.toHaveBeenCalled();
  });

  it("is disabled when expectedView is empty", () => {
    const client = makeQueryClient();
    const cfg = baseConfig({ expectedView: "" });
    const { result } = renderHook(() => useDiffSummary(cfg, 5), {
      wrapper: makeWrapper(client),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(runReadOnlyQuery).not.toHaveBeenCalled();
  });

  it("is disabled when actualView is empty", () => {
    const client = makeQueryClient();
    const cfg = baseConfig({ actualView: "" });
    const { result } = renderHook(() => useDiffSummary(cfg, 5), {
      wrapper: makeWrapper(client),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(runReadOnlyQuery).not.toHaveBeenCalled();
  });

  it("is disabled when keyCols is empty", () => {
    const client = makeQueryClient();
    const cfg = baseConfig({ keyCols: [] });
    const { result } = renderHook(() => useDiffSummary(cfg, 5), {
      wrapper: makeWrapper(client),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(runReadOnlyQuery).not.toHaveBeenCalled();
  });

  it("is disabled when measures is empty", () => {
    const client = makeQueryClient();
    const cfg = baseConfig({ measures: [] });
    const { result } = renderHook(() => useDiffSummary(cfg, 5), {
      wrapper: makeWrapper(client),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(runReadOnlyQuery).not.toHaveBeenCalled();
  });

  it("is disabled when the enabled flag is false", () => {
    const client = makeQueryClient();
    const { result } = renderHook(() => useDiffSummary(baseConfig(), 5, false), {
      wrapper: makeWrapper(client),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(runReadOnlyQuery).not.toHaveBeenCalled();
  });

  it("fetches and maps summary data when cfg is valid and enabled", async () => {
    const client = makeQueryClient();
    runReadOnlyQuery.mockResolvedValue([
      {
        rows_total: 100,
        rows_changed: 20,
        rows_added: 5,
        rows_removed: 3,
        rows_unchanged: 72,
        rows_material: 10,
        sum_exp_revenue: 1000,
        sum_act_revenue: 1100,
        sum_var_revenue: 100,
      },
    ]);

    const { result } = renderHook(() => useDiffSummary(baseConfig(), 5), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const summary = result.current.data!;
    expect(summary.rowsTotal).toBe(100);
    expect(summary.rowsChanged).toBe(20);
    expect(summary.rowsAdded).toBe(5);
    expect(summary.rowsRemoved).toBe(3);
    expect(summary.rowsUnchanged).toBe(72);
    expect(summary.rowsMaterial).toBe(10);
    expect(summary.totals["revenue"]).toEqual({
      sumExpected: 1000,
      sumActual: 1100,
      sumVariance: 100,
    });
    expect(runReadOnlyQuery).toHaveBeenCalledTimes(1);
  });

  it("handles an empty DuckDB result row gracefully (all zeros)", async () => {
    const client = makeQueryClient();
    runReadOnlyQuery.mockResolvedValue([]);

    const { result } = renderHook(() => useDiffSummary(baseConfig(), 5), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const summary = result.current.data!;
    expect(summary.rowsTotal).toBe(0);
    expect(summary.rowsMaterial).toBe(0);
    expect(summary.totals["revenue"]).toEqual({
      sumExpected: 0,
      sumActual: 0,
      sumVariance: 0,
    });
  });

  it("aggregates totals for multiple measures", async () => {
    const cfg = baseConfig({
      measures: [
        { label: "rev", expected: "re", actual: "ra" },
        { label: "qty", expected: "qe", actual: "qa" },
      ],
    });
    const client = makeQueryClient();
    runReadOnlyQuery.mockResolvedValue([
      {
        rows_total: 10,
        rows_changed: 2,
        rows_added: 0,
        rows_removed: 0,
        rows_unchanged: 8,
        rows_material: 1,
        sum_exp_rev: 500,
        sum_act_rev: 600,
        sum_var_rev: 100,
        sum_exp_qty: 50,
        sum_act_qty: 55,
        sum_var_qty: 5,
      },
    ]);

    const { result } = renderHook(() => useDiffSummary(cfg, 5), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data!.totals["rev"]).toEqual({
      sumExpected: 500,
      sumActual: 600,
      sumVariance: 100,
    });
    expect(result.current.data!.totals["qty"]).toEqual({
      sumExpected: 50,
      sumActual: 55,
      sumVariance: 5,
    });
  });

  it("transitions to error state when runReadOnlyQuery rejects", async () => {
    const client = makeQueryClient();
    runReadOnlyQuery.mockRejectedValue(new Error("Connection lost"));

    const { result } = renderHook(() => useDiffSummary(baseConfig(), 5), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toBe("Connection lost");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// useDiffPage
// ──────────────────────────────────────────────────────────────────────────────

describe("useDiffPage", () => {
  beforeEach(() => {
    runReadOnlyQuery.mockReset();
  });

  it("is disabled when cfg is null", () => {
    const client = makeQueryClient();
    const { result } = renderHook(
      () => useDiffPage(null, { limit: 50, offset: 0 }),
      { wrapper: makeWrapper(client) },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(runReadOnlyQuery).not.toHaveBeenCalled();
  });

  it("is disabled when the enabled flag is false", () => {
    const client = makeQueryClient();
    const { result } = renderHook(
      () => useDiffPage(baseConfig(), { limit: 50, offset: 0 }, false),
      { wrapper: makeWrapper(client) },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(runReadOnlyQuery).not.toHaveBeenCalled();
  });

  it("fetches and maps a page of diff rows when cfg is valid", async () => {
    const client = makeQueryClient();
    runReadOnlyQuery.mockResolvedValue([
      { key_0: "VOICE", exp_revenue: 100, act_revenue: 150, var_revenue: 50, varpct_revenue: 50, diff_status: "CHANGED" },
      { key_0: "DATA",  exp_revenue: 200, act_revenue: 200, var_revenue: 0,  varpct_revenue: 0,  diff_status: "UNCHANGED" },
    ]);

    const { result } = renderHook(
      () => useDiffPage(baseConfig(), { limit: 50, offset: 0 }),
      { wrapper: makeWrapper(client) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const rows = result.current.data!;
    expect(rows).toHaveLength(2);
    expect(rows[0].key).toBe("VOICE");
    expect(rows[0].status).toBe("CHANGED");
    expect(rows[0].primaryVariance).toBe(50);
    expect(rows[1].key).toBe("DATA");
    expect(rows[1].status).toBe("UNCHANGED");
  });

  it("returns an empty array when DuckDB returns no rows", async () => {
    const client = makeQueryClient();
    runReadOnlyQuery.mockResolvedValue([]);

    const { result } = renderHook(
      () => useDiffPage(baseConfig(), { limit: 50, offset: 0 }),
      { wrapper: makeWrapper(client) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("passes onlyChanged=true through to the query key (distinct query)", async () => {
    const client = makeQueryClient();
    runReadOnlyQuery.mockResolvedValue([]);

    const { result } = renderHook(
      () => useDiffPage(baseConfig(), { limit: 10, offset: 0, onlyChanged: true }),
      { wrapper: makeWrapper(client) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(runReadOnlyQuery).toHaveBeenCalledTimes(1);
    // The generated SQL should contain the WHERE clause for onlyChanged
    const sql: string = runReadOnlyQuery.mock.calls[0][0];
    expect(sql).toContain("UNCHANGED");
  });

  it("defaults onlyChanged to false when not provided (query key uses false)", async () => {
    const client = makeQueryClient();
    runReadOnlyQuery.mockResolvedValue([]);

    const { result } = renderHook(
      () => useDiffPage(baseConfig(), { limit: 10, offset: 5 }),
      { wrapper: makeWrapper(client) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(runReadOnlyQuery).toHaveBeenCalledTimes(1);
  });

  it("transitions to error state when runReadOnlyQuery rejects", async () => {
    const client = makeQueryClient();
    runReadOnlyQuery.mockRejectedValue(new Error("Query timeout"));

    const { result } = renderHook(
      () => useDiffPage(baseConfig(), { limit: 50, offset: 0 }),
      { wrapper: makeWrapper(client) },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toBe("Query timeout");
  });
});
