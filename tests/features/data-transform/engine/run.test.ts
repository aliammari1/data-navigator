import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock the read-only DuckDB IPC boundary ───────────────────────────────────
const runReadOnlyQuery = vi.fn();

vi.mock("@/platform/duckdb/duckdb", () => ({
  runReadOnlyQuery: (...args: unknown[]) => runReadOnlyQuery(...args),
}));

import { PREVIEW_LIMIT, profileTable, runPipeline } from "@/features/data-transform/engine/run";
import type { TransformStep } from "@/features/data-transform/engine/sql";

function step(overrides: Partial<TransformStep> = {}): TransformStep {
  return {
    id: "s1",
    type: "filter",
    label: "Filter",
    enabled: true,
    config: { condition: "x > 0" },
    ...overrides,
  };
}

beforeEach(() => {
  runReadOnlyQuery.mockReset();
});

describe("runPipeline", () => {
  it("runs exactly two IPC round-trips (counts then preview)", async () => {
    runReadOnlyQuery
      .mockResolvedValueOnce([{ step_id: "__source__", n: 10 }])
      .mockResolvedValueOnce([{ a: 1 }]);

    await runPipeline({ steps: [], sourceTable: "t", sourceRowCount: 10 });

    expect(runReadOnlyQuery).toHaveBeenCalledTimes(2);
  });

  it("derives per-step input/output counts by walking enabled steps in order", async () => {
    const steps = [
      step({ id: "one", type: "filter" }),
      step({ id: "two", type: "limit", config: { count: 3 } }),
    ];
    runReadOnlyQuery
      .mockResolvedValueOnce([
        { step_id: "__source__", n: 100 },
        { step_id: "one", n: 40 },
        { step_id: "two", n: 3 },
      ])
      .mockResolvedValueOnce([{ a: 1 }]);

    const res = await runPipeline({
      steps,
      sourceTable: "t",
      sourceRowCount: 100,
    });

    expect(res.perStep).toEqual({
      one: { input: 100, output: 40 },
      two: { input: 40, output: 3 },
    });
    expect(res.finalRows).toBe(3);
  });

  it("uses sourceRowCount as the final count when there are no enabled steps", async () => {
    runReadOnlyQuery
      .mockResolvedValueOnce([{ step_id: "__source__", n: 7 }])
      .mockResolvedValueOnce([{ a: 1 }]);

    const res = await runPipeline({
      steps: [step({ enabled: false })],
      sourceTable: "t",
      sourceRowCount: 7,
    });

    expect(res.perStep).toEqual({});
    expect(res.finalRows).toBe(7);
  });

  it("falls back to the previous count when a step's count is missing", async () => {
    const steps = [step({ id: "one" })];
    runReadOnlyQuery
      // count query omits the "one" step row entirely.
      .mockResolvedValueOnce([{ step_id: "__source__", n: 50 }])
      .mockResolvedValueOnce([{ a: 1 }]);

    const res = await runPipeline({
      steps,
      sourceTable: "t",
      sourceRowCount: 50,
    });

    expect(res.perStep.one).toEqual({ input: 50, output: 50 });
    expect(res.finalRows).toBe(50);
  });

  it("derives preview columns from the first preview row", async () => {
    runReadOnlyQuery
      .mockResolvedValueOnce([{ step_id: "__source__", n: 2 }])
      .mockResolvedValueOnce([
        { region: "N", amount: 1 },
        { region: "S", amount: 2 },
      ]);

    const res = await runPipeline({
      steps: [],
      sourceTable: "t",
      sourceRowCount: 2,
    });

    expect(res.preview.cols).toEqual(["region", "amount"]);
    expect(res.preview.rows).toHaveLength(2);
  });

  it("returns empty preview columns when no rows come back", async () => {
    runReadOnlyQuery
      .mockResolvedValueOnce([{ step_id: "__source__", n: 0 }])
      .mockResolvedValueOnce([]);

    const res = await runPipeline({
      steps: [],
      sourceTable: "t",
      sourceRowCount: 0,
    });

    expect(res.preview.cols).toEqual([]);
    expect(res.preview.rows).toEqual([]);
  });

  it("previews directly off the quoted source with PREVIEW_LIMIT when no steps", async () => {
    runReadOnlyQuery
      .mockResolvedValueOnce([{ step_id: "__source__", n: 1 }])
      .mockResolvedValueOnce([{ a: 1 }]);

    await runPipeline({ steps: [], sourceTable: "tbl", sourceRowCount: 1 });

    const previewSql = runReadOnlyQuery.mock.calls[1][0] as string;
    expect(previewSql).toBe(`SELECT * FROM "tbl" LIMIT ${PREVIEW_LIMIT}`);
  });

  it("appends the preview LIMIT to the compiled CTE when steps exist", async () => {
    runReadOnlyQuery
      .mockResolvedValueOnce([
        { step_id: "__source__", n: 5 },
        { step_id: "one", n: 5 },
      ])
      .mockResolvedValueOnce([{ a: 1 }]);

    const res = await runPipeline({
      steps: [step({ id: "one" })],
      sourceTable: "t",
      sourceRowCount: 5,
    });

    const previewSql = runReadOnlyQuery.mock.calls[1][0] as string;
    expect(previewSql).toContain("WITH s_one AS");
    expect(previewSql.trimEnd().endsWith(`LIMIT ${PREVIEW_LIMIT}`)).toBe(true);
    // The returned sql is the compiled CTE without the preview limit.
    expect(res.sql).not.toContain(`LIMIT ${PREVIEW_LIMIT}`);
  });

  it("reports a non-negative numeric duration", async () => {
    runReadOnlyQuery
      .mockResolvedValueOnce([{ step_id: "__source__", n: 1 }])
      .mockResolvedValueOnce([{ a: 1 }]);

    const res = await runPipeline({
      steps: [],
      sourceTable: "t",
      sourceRowCount: 1,
    });

    expect(typeof res.durationMs).toBe("number");
    expect(res.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("propagates a DuckDB error from the count query", async () => {
    runReadOnlyQuery.mockRejectedValueOnce(new Error("Binder Error: bad column"));

    await expect(
      runPipeline({ steps: [step()], sourceTable: "t", sourceRowCount: 1 }),
    ).rejects.toThrow(/Binder Error/);
  });
});

describe("profileTable", () => {
  it("runs SUMMARIZE on the quoted relation", async () => {
    runReadOnlyQuery.mockResolvedValueOnce([]);
    await profileTable("my table");
    expect(runReadOnlyQuery).toHaveBeenCalledWith('SUMMARIZE "my table"');
  });

  it("maps SUMMARIZE rows into typed column profiles", async () => {
    runReadOnlyQuery.mockResolvedValueOnce([
      {
        column_name: "amount",
        column_type: "DOUBLE",
        count: 100,
        null_percentage: 12.5,
        approx_unique: 42,
        min: "0",
        max: "999",
      },
    ]);

    const [profile] = await profileTable("t");

    expect(profile).toEqual({
      column: "amount",
      type: "DOUBLE",
      nullPct: 12.5,
      approxUnique: 42,
      min: "0",
      max: "999",
    });
  });

  it("derives null percentage from null_count/count when null_percentage is absent", async () => {
    runReadOnlyQuery.mockResolvedValueOnce([
      {
        column_name: "c",
        column_type: "VARCHAR",
        count: 200,
        null_count: 50,
        approx_unique: 3,
      },
    ]);

    const [profile] = await profileTable("t");

    expect(profile.nullPct).toBe(25); // 50 / 200 * 100
  });

  it("falls back to 0 null percentage when count is zero", async () => {
    runReadOnlyQuery.mockResolvedValueOnce([
      { column_name: "c", column_type: "VARCHAR", count: 0, null_count: 0 },
    ]);

    const [profile] = await profileTable("t");

    expect(profile.nullPct).toBe(0);
  });

  it("normalizes a non-finite null percentage to 0 and null min/max stay null", async () => {
    runReadOnlyQuery.mockResolvedValueOnce([
      {
        column_name: "c",
        column_type: "VARCHAR",
        count: 10,
        null_percentage: "not-a-number",
        min: null,
        max: null,
      },
    ]);

    const [profile] = await profileTable("t");

    expect(profile.nullPct).toBe(0);
    expect(profile.min).toBeNull();
    expect(profile.max).toBeNull();
    expect(profile.approxUnique).toBe(0);
  });

  it("coerces missing column name/type to empty strings", async () => {
    runReadOnlyQuery.mockResolvedValueOnce([{ count: 1 }]);

    const [profile] = await profileTable("t");

    expect(profile.column).toBe("");
    expect(profile.type).toBe("");
  });
});
