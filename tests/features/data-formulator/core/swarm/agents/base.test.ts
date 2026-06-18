import { beforeEach, describe, expect, it, vi } from "vitest";

// The chart/table artifact runners call runReadOnlyQuery; mock the DuckDB
// boundary so no real database (or worker) is ever touched.
const runReadOnlyQuery = vi.fn();
vi.mock("@/platform/duckdb/duckdb", () => ({
  runReadOnlyQuery: (sql: string) => runReadOnlyQuery(sql),
}));

import {
  ALLOWED_CHART_TYPES,
  artifactEvidence,
  assertReadOnlySql,
  chartArtifactToQueryResult,
  coerceChartType,
  contextBlock,
  runChartArtifact,
  runTableArtifact,
  sanitizeSql,
  schemaSummary,
} from "@/features/data-formulator/core/swarm/agents/base";
import type {
  Artifact,
  SwarmContext,
} from "@/features/data-formulator/core/swarm/types";
import type { ChartSpec, ColumnInfo } from "@/features/data-formulator/core/types";

/** Minimal fake scheduler: only `io` is used by the artifact runners. */
function fakeScheduler() {
  return {
    io: <T>(factory: () => Promise<T>) => factory(),
  } as unknown as import("@/features/data-formulator/core/swarm/scheduler").InferenceScheduler;
}

const columns: ColumnInfo[] = [
  { name: "channel", type: "string", dbType: "VARCHAR" },
  { name: "amount", type: "number", dbType: "DOUBLE" },
  { name: "txn_date", type: "date", dbType: "DATE", derived: true },
];

function makeCtx(overrides: Partial<SwarmContext> = {}): SwarmContext {
  return {
    datasetId: "d1",
    datasetName: "Daily Transactions",
    tableName: "tx_view",
    columns,
    rowSample: [
      { channel: "USSD", amount: 12 },
      { channel: "APP", amount: 34 },
    ],
    rowCount: 12345,
    model: "qwen2.5-1.5b-instruct-q4_k_m.gguf",
    ...overrides,
  };
}

function chartSpec(field: string): ChartSpec {
  return {
    id: "s1",
    type: "bar",
    title: "By channel",
    limit: 50,
    filters: [],
    encodings: [
      { id: "ex", channel: "x", field },
      { id: "ey", channel: "y", field: "amount", aggregate: "sum" },
    ],
  };
}

beforeEach(() => {
  runReadOnlyQuery.mockReset();
});

describe("coerceChartType", () => {
  it("returns the value unchanged when it is an allowed chart type", () => {
    for (const t of ALLOWED_CHART_TYPES) {
      expect(coerceChartType(t)).toBe(t);
    }
  });

  it("falls back to 'bar' for an unknown chart type", () => {
    expect(coerceChartType("sankey")).toBe("bar");
    expect(coerceChartType("")).toBe("bar");
  });
});

describe("schemaSummary", () => {
  it("renders one bullet per column with its type", () => {
    const out = schemaSummary(columns);
    expect(out).toContain("- channel (string)");
    expect(out).toContain("- amount (number)");
  });

  it("annotates derived columns", () => {
    const out = schemaSummary(columns);
    expect(out).toContain("- txn_date (date, derived)");
  });

  it("returns an empty string for no columns", () => {
    expect(schemaSummary([])).toBe("");
  });
});

describe("contextBlock", () => {
  it("includes dataset name, exact table name, row count, and schema", () => {
    const block = contextBlock(makeCtx());
    expect(block).toContain("Dataset: Daily Transactions");
    expect(block).toContain('DuckDB view (query this exact name): "tx_view"');
    // Row count is locale-formatted with a grouping separator.
    expect(block).toMatch(/Row count: 12[,.\s]?345/);
    expect(block).toContain("- channel (string)");
  });

  it("includes a JSON sample-rows block when rows are present", () => {
    const block = contextBlock(makeCtx());
    expect(block).toContain("Sample rows (JSON):");
    expect(block).toContain('"channel":"USSD"');
  });

  it("omits the sample-rows block entirely when there are no sample rows", () => {
    const block = contextBlock(makeCtx({ rowSample: [] }));
    expect(block).not.toContain("Sample rows (JSON):");
  });

  it("caps the sample at the first 5 rows", () => {
    const rowSample = Array.from({ length: 9 }, (_, i) => ({ idx: i }));
    const block = contextBlock(makeCtx({ rowSample }));
    expect(block).toContain('"idx":4');
    expect(block).not.toContain('"idx":5');
  });
});

describe("sanitizeSql", () => {
  it("strips a ```sql fenced block down to the statement", () => {
    expect(sanitizeSql("```sql\nSELECT * FROM t\n```")).toBe("SELECT * FROM t");
  });

  it("strips a bare ``` fence", () => {
    expect(sanitizeSql("```\nSELECT 1\n```")).toBe("SELECT 1");
  });

  it("removes a leading line comment", () => {
    expect(sanitizeSql("-- pick everything\nSELECT * FROM t")).toBe(
      "SELECT * FROM t",
    );
  });

  it("removes a leading block comment", () => {
    expect(sanitizeSql("/* note */ SELECT 1")).toBe("SELECT 1");
  });

  it("trims a trailing semicolon", () => {
    expect(sanitizeSql("SELECT 1;")).toBe("SELECT 1");
    expect(sanitizeSql("SELECT 1;;  ")).toBe("SELECT 1");
  });

  it("leaves a clean statement unchanged", () => {
    expect(sanitizeSql("  SELECT a FROM t  ")).toBe("SELECT a FROM t");
  });
});

describe("assertReadOnlySql", () => {
  it("accepts a plain SELECT and returns the sanitized statement", () => {
    expect(assertReadOnlySql("```sql\nSELECT a FROM t\n```")).toBe(
      "SELECT a FROM t",
    );
  });

  it("accepts a leading WITH (CTE)", () => {
    expect(assertReadOnlySql("WITH x AS (SELECT 1) SELECT * FROM x")).toBe(
      "WITH x AS (SELECT 1) SELECT * FROM x",
    );
  });

  it("rejects a statement that is not a SELECT/WITH", () => {
    expect(() => assertReadOnlySql("SHOW TABLES")).toThrow(
      /only SELECT\/WITH/,
    );
  });

  it("rejects a forbidden non-read-only keyword", () => {
    expect(() => assertReadOnlySql("SELECT 1; DROP TABLE t")).toThrow();
    expect(() => assertReadOnlySql("WITH x AS (DELETE FROM t) SELECT 1")).toThrow(
      /non-read-only keyword/,
    );
  });

  it("rejects multiple statements separated by a semicolon", () => {
    expect(() => assertReadOnlySql("SELECT 1 ; SELECT 2")).toThrow(
      /multiple statements/,
    );
  });
});

describe("runTableArtifact", () => {
  it("runs the SQL through IO and wraps the rows as a table artifact", async () => {
    const rows = [{ channel: "USSD", total: 10 }];
    runReadOnlyQuery.mockResolvedValue(rows);

    const artifact = await runTableArtifact(
      fakeScheduler(),
      "task-7",
      "Top channels",
      "SELECT channel, SUM(amount) total FROM tx_view GROUP BY channel",
    );

    expect(runReadOnlyQuery).toHaveBeenCalledOnce();
    expect(artifact.kind).toBe("table");
    expect(artifact.taskId).toBe("task-7");
    expect(artifact.title).toBe("Top channels");
    expect(artifact.rows).toEqual(rows);
    expect(artifact.sql).toContain("GROUP BY channel");
    expect(typeof artifact.id).toBe("string");
    expect(artifact.id.length).toBeGreaterThan(0);
  });

  it("returns an empty-rows table artifact without throwing", async () => {
    runReadOnlyQuery.mockResolvedValue([]);
    const artifact = await runTableArtifact(
      fakeScheduler(),
      "t",
      "Empty",
      "SELECT 1 WHERE 1=0",
    );
    expect(artifact.kind).toBe("table");
    expect(artifact.rows).toEqual([]);
  });

  it("sanitizes BigInt values in the returned rows to JSON-safe numbers", async () => {
    runReadOnlyQuery.mockResolvedValue([{ n: 5n }]);
    const artifact = await runTableArtifact(
      fakeScheduler(),
      "t",
      "Big",
      "SELECT 5 n",
    );
    expect(artifact.rows[0]).toEqual({ n: 5 });
  });
});

describe("runChartArtifact", () => {
  it("builds SQL from the spec, queries it, and wraps it as a chart artifact", async () => {
    runReadOnlyQuery.mockResolvedValue([{ x_val: "USSD", y_val: 99 }]);
    const spec = chartSpec("channel");

    const artifact = await runChartArtifact(
      fakeScheduler(),
      makeCtx(),
      "task-3",
      spec,
    );

    expect(artifact.kind).toBe("chart");
    expect(artifact.taskId).toBe("task-3");
    expect(artifact.title).toBe("By channel");
    expect(artifact.spec).toBe(spec);
    expect(artifact.rows).toEqual([{ x_val: "USSD", y_val: 99 }]);
    // SQL was generated against the context's exact table name.
    const calledSql = runReadOnlyQuery.mock.calls[0][0] as string;
    expect(calledSql).toContain('"tx_view"');
    expect(artifact.sql).toBe(calledSql);
  });

  it("throws a descriptive error when the chart query returns no rows", async () => {
    runReadOnlyQuery.mockResolvedValue([]);
    await expect(
      runChartArtifact(fakeScheduler(), makeCtx(), "t", chartSpec("channel")),
    ).rejects.toThrow(/By channel.*returned no rows|returned no rows/);
  });
});

describe("chartArtifactToQueryResult", () => {
  it("maps a chart artifact into the QueryResult shape with the correct row count", () => {
    const artifact: Extract<Artifact, { kind: "chart" }> = {
      kind: "chart",
      id: "a1",
      taskId: "t1",
      title: "c",
      spec: chartSpec("channel"),
      rows: [{ x_val: "A" }, { x_val: "B" }],
      sql: "SELECT 1",
    };
    const result = chartArtifactToQueryResult(artifact);
    expect(result).toEqual({
      sql: "SELECT 1",
      data: artifact.rows,
      duration: 0,
      rowCount: 2,
    });
  });

  it("defaults the sql to an empty string when the artifact has none", () => {
    const artifact: Extract<Artifact, { kind: "chart" }> = {
      kind: "chart",
      id: "a1",
      taskId: "t1",
      title: "c",
      spec: chartSpec("channel"),
      rows: [],
    };
    const result = chartArtifactToQueryResult(artifact);
    expect(result.sql).toBe("");
    expect(result.rowCount).toBe(0);
  });
});

describe("artifactEvidence", () => {
  it("returns a 'no data' guard string for an empty artifact list", () => {
    const out = artifactEvidence([]);
    expect(out).toMatch(/none/i);
    expect(out).toMatch(/do not invent numbers/i);
  });

  it("summarizes a table artifact with its row count and data sample", () => {
    const out = artifactEvidence([
      {
        kind: "table",
        id: "a",
        taskId: "t",
        title: "Revenue",
        rows: [{ channel: "USSD", total: 10 }],
      },
    ]);
    expect(out).toContain('TABLE "Revenue"');
    expect(out).toContain("1 rows");
    expect(out).toContain('"channel":"USSD"');
  });

  it("renders a KPI artifact with its label, value, and delta", () => {
    const out = artifactEvidence([
      {
        kind: "kpi",
        id: "a",
        taskId: "t",
        title: "Total",
        label: "Revenue",
        value: "10k",
        delta: 3,
      },
    ]);
    expect(out).toContain('KPI "Total"');
    expect(out).toContain("Revenue = 10k");
    expect(out).toContain("(delta 3)");
  });

  it("omits the delta clause for a KPI with no delta", () => {
    const out = artifactEvidence([
      {
        kind: "kpi",
        id: "a",
        taskId: "t",
        title: "Total",
        label: "Revenue",
        value: "10k",
      },
    ]);
    expect(out).toContain("Revenue = 10k");
    expect(out).not.toContain("delta");
  });

  it("caps the per-artifact row sample to the first 8 rows", () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ idx: i }));
    const out = artifactEvidence([
      { kind: "table", id: "a", taskId: "t", title: "Big", rows },
    ]);
    expect(out).toContain('"idx":7');
    expect(out).not.toContain('"idx":8');
  });
});
