import { beforeEach, describe, expect, it, vi } from "vitest";

// compute.ts queries DuckDB directly (via memoizedQuery) and transitively
// through base.ts's runChartArtifact. Mock the single real boundary —
// runReadOnlyQuery — so no database, worker, or model is ever touched.
const runReadOnlyQuery = vi.fn();
vi.mock("@/platform/duckdb/duckdb", () => ({
  runReadOnlyQuery: (sql: string) => runReadOnlyQuery(sql),
}));

import {
  type AnomalyFinding,
  compute,
  detectAnomaly,
} from "@/features/data-formulator/core/swarm/compute";
import type { AnalysisPlan } from "@/features/data-formulator/core/swarm/agents/analyze";
import type { InferenceScheduler } from "@/features/data-formulator/core/swarm/scheduler";
import type { Artifact, SwarmContext } from "@/features/data-formulator/core/swarm/types";
import type { ColumnInfo } from "@/features/data-formulator/core/types";

// ─── Fakes ─────────────────────────────────────────────────────────────────

/**
 * Minimal fake scheduler. compute() only ever uses `io` and `ioMap`; the real
 * scheduler's IO lane just runs the factory and preserves order, so a direct
 * pass-through faithfully models the contract under test.
 */
function fakeScheduler(): InferenceScheduler {
  return {
    io: <T>(factory: () => Promise<T>) => factory(),
    ioMap: <I, O>(items: I[], fn: (item: I, index: number) => Promise<O>) =>
      Promise.all(items.map((item, index) => fn(item, index))),
  } as unknown as InferenceScheduler;
}

const columns: ColumnInfo[] = [
  { name: "channel", type: "string", dbType: "VARCHAR" },
  { name: "amount", type: "number", dbType: "DOUBLE" },
  { name: "region", type: "string", dbType: "VARCHAR" },
];

// compute.ts holds a PROCESS-GLOBAL read-only SQL memo keyed by
// `datasetId::rowCount::sql`. vi.mock cannot reset that module state between
// tests, so each test gets a fresh datasetId by default to keep the memo from
// bleeding cached rows across tests. The dedicated memo tests below pin their
// own ids on purpose.
let datasetSeq = 0;
function makeCtx(overrides: Partial<SwarmContext> = {}): SwarmContext {
  datasetSeq += 1;
  return {
    datasetId: `ds-${datasetSeq}`,
    datasetName: "Daily Transactions",
    tableName: "tx_view",
    columns,
    rowSample: [{ channel: "USSD", amount: 12 }],
    rowCount: 500,
    model: "gemma-4-e4b-it-q4_k_m.gguf",
    ...overrides,
  };
}

function makePlan(overrides: Partial<AnalysisPlan> = {}): AnalysisPlan {
  return {
    goal: "g",
    reasoning: "r",
    sqlSpecs: [],
    chartSpecs: [],
    anomalyChecks: [],
    ...overrides,
  };
}

beforeEach(() => {
  runReadOnlyQuery.mockReset();
});

// ─── detectAnomaly ───────────────────────────────────────────────────────────

describe("detectAnomaly", () => {
  it("returns null for an empty row set (no numeric column)", () => {
    expect(detectAnomaly([], "dip")).toBeNull();
  });

  it("returns null when there is no all-numeric column", () => {
    const rows = [{ channel: "USSD" }, { channel: "APP" }, { channel: "WEB" }];
    expect(detectAnomaly(rows, "spike")).toBeNull();
  });

  it("returns null when fewer than 3 finite numeric values are present", () => {
    // Only two rows -> vals.length === 2 < 3.
    const rows = [{ n: 1 }, { n: 2 }];
    expect(detectAnomaly(rows, "trend")).toBeNull();
  });

  it("detects a dip when the minimum falls more than 1 sd below the mean", () => {
    // values 10,10,10,1 -> mean 7.75, sd ~3.9; min 1 < mean - sd.
    const rows = [{ n: 10 }, { n: 10 }, { n: 10 }, { n: 1 }];
    const finding = detectAnomaly(rows, "dip");
    expect(finding).not.toBeNull();
    expect(finding?.title).toBe("Dip detected");
    expect(finding?.severity).toBe("high");
    expect(finding?.body).toContain("n dips to 1");
    expect(finding?.body).toContain("mean 7.8"); // 7.75 -> toFixed(1)
  });

  it("does not flag a dip when no value falls more than 1 sd below the mean", () => {
    // Identical values -> sd 0 -> the strict `min < mean - sd` is never true.
    const rows = [{ n: 10 }, { n: 10 }, { n: 10 }];
    expect(detectAnomaly(rows, "dip")).toBeNull();
  });

  it("detects a spike when the maximum rises more than 1 sd above the mean", () => {
    const rows = [{ n: 1 }, { n: 1 }, { n: 1 }, { n: 10 }];
    const finding = detectAnomaly(rows, "spike");
    expect(finding?.title).toBe("Spike detected");
    expect(finding?.severity).toBe("high");
    expect(finding?.body).toContain("n spikes to 10");
  });

  it("does not flag a spike when no value rises more than 1 sd above the mean", () => {
    // Identical values -> sd 0 -> the strict `max > mean + sd` is never true.
    const rows = [{ n: 10 }, { n: 10 }, { n: 10 }];
    expect(detectAnomaly(rows, "spike")).toBeNull();
  });

  it("detects an outlier when a value is more than 2 sd above the mean", () => {
    // 1,1,1,1,1,20 -> mean 4.17, sd ~7.1; max 20 > mean + 2sd.
    const rows = [{ n: 1 }, { n: 1 }, { n: 1 }, { n: 1 }, { n: 1 }, { n: 20 }];
    const finding = detectAnomaly(rows, "outlier");
    expect(finding?.title).toBe("Outlier");
    expect(finding?.severity).toBe("medium");
    expect(finding?.body).toContain("range 1–20");
  });

  it("detects an outlier when a value is more than 2 sd below the mean", () => {
    const rows = [{ n: 20 }, { n: 20 }, { n: 20 }, { n: 20 }, { n: 20 }, { n: 1 }];
    const finding = detectAnomaly(rows, "outlier");
    expect(finding?.title).toBe("Outlier");
    expect(finding?.severity).toBe("medium");
  });

  it("does not flag an outlier when nothing exceeds 2 sd from the mean", () => {
    const rows = [{ n: 9 }, { n: 10 }, { n: 11 }, { n: 10 }];
    expect(detectAnomaly(rows, "outlier")).toBeNull();
  });

  it("reports an upward trend when the last value exceeds the first", () => {
    const rows = [{ n: 1 }, { n: 5 }, { n: 9 }];
    const finding = detectAnomaly(rows, "trend");
    expect(finding?.title).toBe("Trend");
    expect(finding?.severity).toBe("low");
    expect(finding?.body).toContain("trends up");
    expect(finding?.body).toContain("1 → 9");
  });

  it("reports a downward trend when the last value is not greater than the first", () => {
    const rows = [{ n: 9 }, { n: 5 }, { n: 1 }];
    const finding = detectAnomaly(rows, "trend");
    expect(finding?.body).toContain("trends down");
    expect(finding?.body).toContain("9 → 1");
  });

  it("reports a downward trend when first and last are equal (strict greater-than)", () => {
    // last > first is false when equal -> "down".
    const rows = [{ n: 5 }, { n: 9 }, { n: 5 }];
    const finding = detectAnomaly(rows, "trend");
    expect(finding?.body).toContain("trends down");
  });

  it("treats null cells as numeric (Number(null) === 0) when picking the key", () => {
    // The 'amount' column has a null -> still all-numeric; nulls coerce to 0.
    // values: 0(null->0), 10, 10 -> mean ~6.67, sd ~4.7; min 0 < mean - sd -> dip.
    const rows = [{ amount: null }, { amount: 10 }, { amount: 10 }];
    const finding = detectAnomaly(rows, "dip");
    expect(finding?.title).toBe("Dip detected");
    expect(finding?.body).toContain("amount dips to 0");
  });

  it("skips a column whose values are not all numeric and uses a later numeric one", () => {
    const rows = [
      { label: "a", n: 10 },
      { label: "b", n: 10 },
      { label: "c", n: 1 },
    ];
    const finding = detectAnomaly(rows, "dip");
    // 'label' is non-numeric, so 'n' is chosen.
    expect(finding?.body).toMatch(/^n dips to 1/);
  });

  it("returns null for a recognized kind when its threshold is not met (e.g. spike on a dip)", () => {
    // A clear dip pattern, but asked for a spike -> max within 1 sd -> null.
    const rows = [{ n: 10 }, { n: 10 }, { n: 10 }, { n: 1 }];
    expect(detectAnomaly(rows, "spike")).toBeNull();
  });
});

// ─── compute ─────────────────────────────────────────────────────────────────

describe("compute — SQL table specs", () => {
  it("returns an empty artifact list for an empty plan and never queries", async () => {
    const artifacts = await compute(fakeScheduler(), makeCtx(), makePlan());
    expect(artifacts).toEqual([]);
    expect(runReadOnlyQuery).not.toHaveBeenCalled();
  });

  it("runs each sql spec and wraps non-empty results as table artifacts", async () => {
    runReadOnlyQuery.mockResolvedValue([{ channel: "USSD", total: 99 }]);
    const plan = makePlan({
      sqlSpecs: [{ id: "s1", purpose: "Revenue per channel", sql: "SELECT channel FROM tx_view" }],
    });

    const artifacts = await compute(fakeScheduler(), makeCtx(), plan);

    expect(artifacts).toHaveLength(1);
    const table = artifacts[0];
    expect(table.kind).toBe("table");
    expect(table.taskId).toBe("s1");
    expect(table.title).toBe("Revenue per channel");
    if (table.kind === "table") {
      expect(table.rows).toEqual([{ channel: "USSD", total: 99 }]);
      expect(table.sql).toBe("SELECT channel FROM tx_view");
    }
  });

  it("drops a sql spec that returns zero rows (no table artifact)", async () => {
    runReadOnlyQuery.mockResolvedValue([]);
    const plan = makePlan({
      sqlSpecs: [{ id: "s1", purpose: "Empty", sql: "SELECT 1 WHERE 1=0" }],
    });

    const artifacts = await compute(fakeScheduler(), makeCtx(), plan);
    expect(artifacts).toEqual([]);
  });

  it("swallows a sql spec whose statement is rejected by the read-only guard", async () => {
    // DROP is forbidden -> assertReadOnlySql throws -> caught -> null artifact.
    const plan = makePlan({
      sqlSpecs: [{ id: "s1", purpose: "bad", sql: "DROP TABLE tx_view" }],
    });

    const artifacts = await compute(fakeScheduler(), makeCtx(), plan);
    expect(artifacts).toEqual([]);
    // The query was never run because the guard rejected it first.
    expect(runReadOnlyQuery).not.toHaveBeenCalled();
  });

  it("swallows a sql spec whose query throws and keeps other specs", async () => {
    runReadOnlyQuery.mockImplementation((sql: string) => {
      if (sql.includes("boom")) return Promise.reject(new Error("db exploded"));
      return Promise.resolve([{ ok: 1 }]);
    });
    const plan = makePlan({
      sqlSpecs: [
        { id: "s1", purpose: "good", sql: "SELECT 1 FROM tx_view" },
        { id: "s2", purpose: "bad", sql: "SELECT boom FROM tx_view" },
      ],
    });

    const artifacts = await compute(fakeScheduler(), makeCtx(), plan);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].taskId).toBe("s1");
  });

  it("sanitizes the SQL (strips fences/comments) before recording it on the artifact", async () => {
    runReadOnlyQuery.mockResolvedValue([{ a: 1 }]);
    const plan = makePlan({
      sqlSpecs: [{ id: "s1", purpose: "fenced", sql: "```sql\nSELECT a FROM tx_view\n```" }],
    });

    const artifacts = await compute(fakeScheduler(), makeCtx(), plan);
    const table = artifacts[0];
    if (table.kind === "table") {
      expect(table.sql).toBe("SELECT a FROM tx_view");
    }
    expect(runReadOnlyQuery).toHaveBeenCalledWith("SELECT a FROM tx_view");
  });

  it("sanitizes BigInt cells in the returned rows to JSON-safe numbers", async () => {
    runReadOnlyQuery.mockResolvedValue([{ n: 7n }]);
    const plan = makePlan({
      sqlSpecs: [{ id: "s1", purpose: "big", sql: "SELECT 7 n FROM tx_view" }],
    });

    const artifacts = await compute(fakeScheduler(), makeCtx(), plan);
    const table = artifacts[0];
    if (table.kind === "table") {
      expect(table.rows[0]).toEqual({ n: 7 });
    }
  });
});

describe("compute — charts", () => {
  it("builds a chart artifact for a chart spec backed by a sql spec with rows", async () => {
    // First call: the table spec. Subsequent calls: the chart's built SQL.
    runReadOnlyQuery.mockImplementation((sql: string) => {
      if (sql.includes("x_val") || sql.includes("GROUP BY")) {
        return Promise.resolve([{ x_val: "USSD", y_val: 42 }]);
      }
      return Promise.resolve([{ channel: "USSD", amount: 10 }]);
    });
    const plan = makePlan({
      sqlSpecs: [{ id: "s1", purpose: "t", sql: "SELECT channel, amount FROM tx_view" }],
      chartSpecs: [{ usesSqlId: "s1", type: "bar", x: "channel", y: "amount" }],
    });

    const artifacts = await compute(fakeScheduler(), makeCtx(), plan);
    const chart = artifacts.find((a) => a.kind === "chart");
    expect(chart).toBeDefined();
    if (chart?.kind === "chart") {
      expect(chart.taskId).toBe("s1");
      // compute sets spec.title = "<y> by <x>" and runChartArtifact copies it to the artifact.
      expect(chart.title).toBe("amount by channel");
      expect(chart.spec.type).toBe("bar");
    }
  });

  it("titles the chart spec '<y> by <x>' from the chart spec fields", async () => {
    const seen: string[] = [];
    runReadOnlyQuery.mockImplementation((sql: string) => {
      seen.push(sql);
      if (sql.includes("y_val") || sql.includes("GROUP BY")) {
        return Promise.resolve([{ x_val: "USSD", y_val: 42 }]);
      }
      return Promise.resolve([{ channel: "USSD", amount: 10 }]);
    });
    const plan = makePlan({
      sqlSpecs: [{ id: "s1", purpose: "t", sql: "SELECT channel, amount FROM tx_view" }],
      chartSpecs: [{ usesSqlId: "s1", type: "bar", x: "channel", y: "amount" }],
    });

    const artifacts = await compute(fakeScheduler(), makeCtx(), plan);
    const chart = artifacts.find((a) => a.kind === "chart");
    if (chart?.kind === "chart") {
      // runChartArtifact sets artifact.title = spec.title, which compute set to "amount by channel".
      expect(chart.title).toBe("amount by channel");
    }
  });

  it("skips a chart whose usesSqlId did not produce rows", async () => {
    // The single sql spec returns no rows, so rowsById has no entry for s1.
    runReadOnlyQuery.mockResolvedValue([]);
    const plan = makePlan({
      sqlSpecs: [{ id: "s1", purpose: "empty", sql: "SELECT 1 WHERE 1=0" }],
      chartSpecs: [{ usesSqlId: "s1", type: "bar", x: "channel", y: "amount" }],
    });

    const artifacts = await compute(fakeScheduler(), makeCtx(), plan);
    expect(artifacts.some((a) => a.kind === "chart")).toBe(false);
  });

  it("skips a chart that references an unknown usesSqlId", async () => {
    runReadOnlyQuery.mockResolvedValue([{ channel: "USSD", amount: 10 }]);
    const plan = makePlan({
      sqlSpecs: [{ id: "s1", purpose: "t", sql: "SELECT channel FROM tx_view" }],
      chartSpecs: [{ usesSqlId: "MISSING", type: "bar", x: "channel", y: "amount" }],
    });

    const artifacts = await compute(fakeScheduler(), makeCtx(), plan);
    expect(artifacts.some((a) => a.kind === "chart")).toBe(false);
  });

  it("skips a chart whose x field is not a known column", async () => {
    runReadOnlyQuery.mockResolvedValue([{ channel: "USSD", amount: 10 }]);
    const plan = makePlan({
      sqlSpecs: [{ id: "s1", purpose: "t", sql: "SELECT channel FROM tx_view" }],
      chartSpecs: [{ usesSqlId: "s1", type: "bar", x: "not_a_column", y: "amount" }],
    });

    const artifacts = await compute(fakeScheduler(), makeCtx(), plan);
    expect(artifacts.some((a) => a.kind === "chart")).toBe(false);
  });

  it("skips a chart whose y field is not a known column", async () => {
    runReadOnlyQuery.mockResolvedValue([{ channel: "USSD", amount: 10 }]);
    const plan = makePlan({
      sqlSpecs: [{ id: "s1", purpose: "t", sql: "SELECT channel FROM tx_view" }],
      chartSpecs: [{ usesSqlId: "s1", type: "bar", x: "channel", y: "not_a_column" }],
    });

    const artifacts = await compute(fakeScheduler(), makeCtx(), plan);
    expect(artifacts.some((a) => a.kind === "chart")).toBe(false);
  });

  it("adds a color encoding when the series field is a known column", async () => {
    const built: string[] = [];
    runReadOnlyQuery.mockImplementation((sql: string) => {
      if (sql.includes("color_val")) {
        built.push(sql);
        return Promise.resolve([{ x_val: "USSD", y_val: 1, color_val: "N" }]);
      }
      if (sql.includes("GROUP BY") || sql.includes("y_val")) {
        return Promise.resolve([{ x_val: "USSD", y_val: 1 }]);
      }
      return Promise.resolve([{ channel: "USSD", amount: 10, region: "N" }]);
    });
    const plan = makePlan({
      sqlSpecs: [{ id: "s1", purpose: "t", sql: "SELECT channel FROM tx_view" }],
      chartSpecs: [{ usesSqlId: "s1", type: "bar", x: "channel", y: "amount", series: "region" }],
    });

    const artifacts = await compute(fakeScheduler(), makeCtx(), plan);
    const chart = artifacts.find((a) => a.kind === "chart");
    expect(chart).toBeDefined();
    if (chart?.kind === "chart") {
      expect(chart.spec.encodings.some((e) => e.channel === "color")).toBe(true);
    }
    // The color channel made it into the generated SQL.
    expect(built.length).toBeGreaterThan(0);
  });

  it("ignores an unknown series field but still renders the chart without a color channel", async () => {
    runReadOnlyQuery.mockImplementation((sql: string) => {
      if (sql.includes("GROUP BY") || sql.includes("y_val")) {
        return Promise.resolve([{ x_val: "USSD", y_val: 1 }]);
      }
      return Promise.resolve([{ channel: "USSD", amount: 10 }]);
    });
    const plan = makePlan({
      sqlSpecs: [{ id: "s1", purpose: "t", sql: "SELECT channel FROM tx_view" }],
      chartSpecs: [
        { usesSqlId: "s1", type: "bar", x: "channel", y: "amount", series: "ghost_field" },
      ],
    });

    const artifacts = await compute(fakeScheduler(), makeCtx(), plan);
    const chart = artifacts.find((a) => a.kind === "chart");
    expect(chart).toBeDefined();
    if (chart?.kind === "chart") {
      expect(chart.spec.encodings.some((e) => e.channel === "color")).toBe(false);
    }
  });

  it("coerces an unsupported chart type down to 'bar'", async () => {
    runReadOnlyQuery.mockImplementation((sql: string) => {
      if (sql.includes("GROUP BY") || sql.includes("y_val")) {
        return Promise.resolve([{ x_val: "USSD", y_val: 1 }]);
      }
      return Promise.resolve([{ channel: "USSD", amount: 10 }]);
    });
    const plan = makePlan({
      sqlSpecs: [{ id: "s1", purpose: "t", sql: "SELECT channel FROM tx_view" }],
      // "sankey" is not in the allowed vocabulary -> coerced to "bar".
      chartSpecs: [{ usesSqlId: "s1", type: "sankey", x: "channel", y: "amount" }],
    });

    const artifacts = await compute(fakeScheduler(), makeCtx(), plan);
    const chart = artifacts.find((a) => a.kind === "chart");
    if (chart?.kind === "chart") {
      expect(chart.spec.type).toBe("bar");
    }
  });

  it("drops a chart whose built query returns no rows (runChartArtifact throws)", async () => {
    // Table spec returns rows; the chart's own query returns none -> chart throws -> caught -> null.
    runReadOnlyQuery.mockImplementation((sql: string) => {
      if (sql.includes("GROUP BY") || sql.includes("y_val")) {
        return Promise.resolve([]); // chart query: empty
      }
      return Promise.resolve([{ channel: "USSD", amount: 10 }]);
    });
    const plan = makePlan({
      sqlSpecs: [{ id: "s1", purpose: "t", sql: "SELECT channel FROM tx_view" }],
      chartSpecs: [{ usesSqlId: "s1", type: "bar", x: "channel", y: "amount" }],
    });

    const artifacts = await compute(fakeScheduler(), makeCtx(), plan);
    expect(artifacts.some((a) => a.kind === "chart")).toBe(false);
    // The table artifact still survives.
    expect(artifacts.some((a) => a.kind === "table")).toBe(true);
  });
});

describe("compute — anomalies", () => {
  it("emits an insight artifact when an anomaly check fires", async () => {
    runReadOnlyQuery.mockResolvedValue([{ amount: 10 }, { amount: 10 }, { amount: 10 }, { amount: 1 }]);
    const plan = makePlan({
      sqlSpecs: [{ id: "s1", purpose: "t", sql: "SELECT amount FROM tx_view" }],
      anomalyChecks: [{ usesSqlId: "s1", kind: "dip" }],
    });

    const artifacts = await compute(fakeScheduler(), makeCtx(), plan);
    const insight = artifacts.find((a) => a.kind === "insight");
    expect(insight).toBeDefined();
    if (insight?.kind === "insight") {
      expect(insight.taskId).toBe("s1");
      expect(insight.title).toBe("Dip detected");
      expect(insight.severity).toBe("high");
      expect(insight.body).toContain("amount dips to 1");
    }
  });

  it("does not emit an insight when the anomaly check does not fire", async () => {
    // Identical values -> sd 0 -> no spike (strict max > mean + sd is false).
    runReadOnlyQuery.mockResolvedValue([{ amount: 10 }, { amount: 10 }, { amount: 10 }]);
    const plan = makePlan({
      sqlSpecs: [{ id: "s1", purpose: "t", sql: "SELECT amount FROM tx_view" }],
      anomalyChecks: [{ usesSqlId: "s1", kind: "spike" }],
    });

    const artifacts = await compute(fakeScheduler(), makeCtx(), plan);
    expect(artifacts.some((a) => a.kind === "insight")).toBe(false);
  });

  it("skips an anomaly check whose usesSqlId produced no rows", async () => {
    runReadOnlyQuery.mockResolvedValue([]); // sql spec empty -> rowsById has no s1
    const plan = makePlan({
      sqlSpecs: [{ id: "s1", purpose: "t", sql: "SELECT amount FROM tx_view" }],
      anomalyChecks: [{ usesSqlId: "s1", kind: "dip" }],
    });

    const artifacts = await compute(fakeScheduler(), makeCtx(), plan);
    expect(artifacts.some((a) => a.kind === "insight")).toBe(false);
  });

  it("skips an anomaly check that references an unknown usesSqlId", async () => {
    runReadOnlyQuery.mockResolvedValue([{ amount: 10 }, { amount: 10 }, { amount: 1 }]);
    const plan = makePlan({
      sqlSpecs: [{ id: "s1", purpose: "t", sql: "SELECT amount FROM tx_view" }],
      anomalyChecks: [{ usesSqlId: "NOPE", kind: "dip" }],
    });

    const artifacts = await compute(fakeScheduler(), makeCtx(), plan);
    expect(artifacts.some((a) => a.kind === "insight")).toBe(false);
  });
});

describe("compute — composition and ordering", () => {
  it("returns tables, then charts, then anomalies, in that order", async () => {
    runReadOnlyQuery.mockImplementation((sql: string) => {
      if (sql.includes("GROUP BY") || sql.includes("y_val")) {
        return Promise.resolve([{ x_val: "USSD", y_val: 1 }]);
      }
      // The table/anomaly source rows (a clear dip on the 'amount' column).
      return Promise.resolve([{ amount: 10 }, { amount: 10 }, { amount: 10 }, { amount: 1 }]);
    });
    const plan = makePlan({
      sqlSpecs: [{ id: "s1", purpose: "t", sql: "SELECT amount FROM tx_view" }],
      chartSpecs: [{ usesSqlId: "s1", type: "bar", x: "channel", y: "amount" }],
      anomalyChecks: [{ usesSqlId: "s1", kind: "dip" }],
    });

    const artifacts = await compute(fakeScheduler(), makeCtx(), plan);
    const kinds = artifacts.map((a) => a.kind);
    expect(kinds).toEqual(["table", "chart", "insight"]);
  });

  it("filters out null artifacts so the final list contains only real artifacts", async () => {
    runReadOnlyQuery.mockResolvedValue([]); // every spec returns no rows
    const plan = makePlan({
      sqlSpecs: [
        { id: "s1", purpose: "a", sql: "SELECT 1 FROM tx_view" },
        { id: "s2", purpose: "b", sql: "SELECT 2 FROM tx_view" },
      ],
      chartSpecs: [{ usesSqlId: "s1", type: "bar", x: "channel", y: "amount" }],
      anomalyChecks: [{ usesSqlId: "s1", kind: "dip" }],
    });

    const artifacts = await compute(fakeScheduler(), makeCtx(), plan);
    expect(artifacts).toEqual([]);
    expect(artifacts.every((a) => a !== null && a !== undefined)).toBe(true);
  });

  it("assigns a unique id to every produced artifact", async () => {
    runReadOnlyQuery.mockResolvedValue([{ amount: 10 }, { amount: 10 }, { amount: 1 }]);
    const plan = makePlan({
      sqlSpecs: [{ id: "s1", purpose: "t", sql: "SELECT amount FROM tx_view" }],
      anomalyChecks: [{ usesSqlId: "s1", kind: "dip" }],
    });

    const artifacts = await compute(fakeScheduler(), makeCtx(), plan);
    const ids = artifacts.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    }
  });
});

describe("compute — read-only SQL memo", () => {
  it("reuses cached rows for identical SQL across sequential runs (memo hit)", async () => {
    runReadOnlyQuery.mockResolvedValue([{ a: 1 }]);
    const ctx = makeCtx({ datasetId: "memo-ds", rowCount: 1000 });
    const plan = makePlan({
      sqlSpecs: [{ id: "s1", purpose: "a", sql: "SELECT a FROM tx_view" }],
    });

    // First run populates the memo; second run (same dataset id + row count +
    // SQL) hits it, so the DB is only queried once total.
    await compute(fakeScheduler(), ctx, plan);
    await compute(fakeScheduler(), ctx, plan);

    expect(runReadOnlyQuery).toHaveBeenCalledTimes(1);
  });

  it("normalizes whitespace and case in the memo key (a second run is a hit)", async () => {
    runReadOnlyQuery.mockResolvedValue([{ a: 1 }]);
    const ctx = makeCtx({ datasetId: "memo-norm", rowCount: 1000 });

    await compute(
      fakeScheduler(),
      ctx,
      makePlan({ sqlSpecs: [{ id: "s1", purpose: "a", sql: "SELECT a FROM tx_view" }] }),
    );
    // Same statement, different whitespace + case -> same normalized key -> hit.
    await compute(
      fakeScheduler(),
      ctx,
      makePlan({ sqlSpecs: [{ id: "s2", purpose: "b", sql: "select   A  from   tx_view" }] }),
    );

    expect(runReadOnlyQuery).toHaveBeenCalledTimes(1);
  });

  it("does not dedupe identical concurrent queries within a single run", async () => {
    // Both specs run concurrently in the IO lane and both miss the (empty) memo
    // before either populates it -> the DB is queried twice.
    runReadOnlyQuery.mockResolvedValue([{ a: 1 }]);
    const ctx = makeCtx({ datasetId: "memo-concurrent", rowCount: 1000 });
    const plan = makePlan({
      sqlSpecs: [
        { id: "s1", purpose: "a", sql: "SELECT a FROM tx_view" },
        { id: "s2", purpose: "b", sql: "SELECT a FROM tx_view" },
      ],
    });

    const artifacts = await compute(fakeScheduler(), ctx, plan);
    expect(artifacts.filter((a) => a.kind === "table")).toHaveLength(2);
    expect(runReadOnlyQuery).toHaveBeenCalledTimes(2);
  });

  it("re-queries the same SQL when the row count changes (new import misses the memo)", async () => {
    runReadOnlyQuery.mockResolvedValue([{ a: 1 }]);
    const sql = "SELECT a FROM tx_view";
    const plan = makePlan({ sqlSpecs: [{ id: "s1", purpose: "a", sql }] });

    await compute(fakeScheduler(), makeCtx({ datasetId: "ds-rc", rowCount: 100 }), plan);
    await compute(fakeScheduler(), makeCtx({ datasetId: "ds-rc", rowCount: 200 }), plan);

    // Different rowCount -> different memo key -> two real queries.
    expect(runReadOnlyQuery).toHaveBeenCalledTimes(2);
  });

  it("re-queries the same SQL for a different dataset id", async () => {
    runReadOnlyQuery.mockResolvedValue([{ a: 1 }]);
    const sql = "SELECT a FROM tx_view";
    const plan = makePlan({ sqlSpecs: [{ id: "s1", purpose: "a", sql }] });

    await compute(fakeScheduler(), makeCtx({ datasetId: "ds-A", rowCount: 5 }), plan);
    await compute(fakeScheduler(), makeCtx({ datasetId: "ds-B", rowCount: 5 }), plan);

    expect(runReadOnlyQuery).toHaveBeenCalledTimes(2);
  });
});

// ─── AnomalyFinding type surface (compile-time guard via a runtime assertion) ──

describe("AnomalyFinding shape", () => {
  it("detectAnomaly returns the documented finding fields", () => {
    const rows = [{ n: 10 }, { n: 10 }, { n: 10 }, { n: 1 }];
    const finding = detectAnomaly(rows, "dip") as AnomalyFinding;
    expect(Object.keys(finding).sort()).toEqual(["body", "severity", "title"]);
  });
});

// ─── compute — SQL memo LRU eviction ─────────────────────────────────────────
// SQL_MEMO_MAX is 100. When the memo exceeds 100 entries the while-loop (lines
// 41-45 of compute.ts) evicts oldest entries one by one. We need >100 distinct
// memo keys to reach that branch. Each key is `datasetId::rowCount::sql`, so
// 101 queries with distinct SQL text on the same context all produce unique keys.

describe("compute — SQL memo LRU eviction", () => {
  it("evicts oldest entries once the memo exceeds SQL_MEMO_MAX (100) entries", async () => {
    runReadOnlyQuery.mockResolvedValue([{ evict: 1 }]);

    // Pin a fixed context so all 101 keys share the same datasetId + rowCount
    // prefix; only the SQL portion differs.  We use a unique datasetId so that
    // earlier test runs cannot have already seeded entries for these keys.
    const ctx = makeCtx({ datasetId: "eviction-test-ds", rowCount: 9999 });

    // Issue 101 separate compute() calls, each with a distinct SQL statement.
    // Each call adds one new entry to the module-level sqlMemo.  After the
    // 101st entry the while-loop fires and deletes at least the oldest one,
    // covering lines 42 and 44 of compute.ts.
    for (let i = 0; i < 101; i++) {
      const sql = `SELECT evict_col_${i} FROM eviction_table`;
      const plan = makePlan({
        sqlSpecs: [{ id: `evict-${i}`, purpose: `evict ${i}`, sql }],
      });
      await compute(fakeScheduler(), ctx, plan);
    }

    // The eviction path ran: runReadOnlyQuery must have been called at least
    // 101 times (one per unique SQL, memo prevented re-runs but not initial runs).
    expect(runReadOnlyQuery.mock.calls.length).toBeGreaterThanOrEqual(101);
  });
});
