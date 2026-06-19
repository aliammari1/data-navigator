import { afterEach, beforeEach, vi } from "vitest";
import {
  type BuildLineageInput,
  buildRealLineage,
  columnLineageKey,
} from "@/features/lineage/core/build-lineage";
import type { ColMeta, Dataset, DataTransform, SavedChart } from "@/core/stores/data-store";
import type { ColumnLineage } from "@/features/lineage/core/types";

// A fixed "now" so timeAgo / datasetStatus are deterministic.
const NOW = new Date("2026-06-16T12:00:00.000Z").getTime();
const ONE_DAY = 24 * 60 * 60 * 1000;

function col(name: string): ColMeta {
  return { name, type: "number", nullCount: 0, distinctCount: 1, sample: [] };
}

function dataset(overrides: Partial<Dataset> = {}): Dataset {
  return {
    id: "ds1",
    name: "Sales",
    tableName: "sales_view",
    viewName: "sales_view",
    source: "upload",
    format: "csv",
    rowCount: 100,
    colCount: 2,
    sizeBytes: 1024,
    columns: [col("channel"), col("amount")],
    tags: [],
    description: "",
    createdAt: new Date(NOW).toISOString(),
    updatedAt: new Date(NOW).toISOString(),
    qualityScore: 90,
    ...overrides,
  };
}

function emptyInput(overrides: Partial<BuildLineageInput> = {}): BuildLineageInput {
  return {
    datasets: [],
    transforms: [],
    savedCharts: [],
    telecomSources: [],
    telecomAnalytics: [],
    dailyStats: [],
    loadedTableNames: [],
    ...overrides,
  };
}

describe("columnLineageKey", () => {
  it("builds a stable composite key including the transform", () => {
    const cl: ColumnLineage = {
      sourceNode: "A",
      sourceCol: "amount",
      targetNode: "B",
      targetCol: "rev",
      transform: "SUM(amount)",
    };
    expect(columnLineageKey(cl)).toBe("A:amount->B:rev:SUM(amount)");
  });

  it("uses 'pass' as the transform sentinel when none is given", () => {
    const cl: ColumnLineage = {
      sourceNode: "A",
      sourceCol: "x",
      targetNode: "B",
      targetCol: "x",
    };
    expect(columnLineageKey(cl)).toBe("A:x->B:x:pass");
  });
});

describe("buildRealLineage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns empty graph for empty input", () => {
    const result = buildRealLineage(emptyInput());
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(result.columnLineage).toEqual([]);
  });

  it("creates a source node for a root dataset", () => {
    const result = buildRealLineage(emptyInput({ datasets: [dataset()] }));
    expect(result.nodes).toHaveLength(1);
    const node = result.nodes[0];
    expect(node.id).toBe("dataset_ds1");
    expect(node.type).toBe("source");
    expect(node.name).toBe("Sales");
  });

  it("marks a dataset active when its table is loaded, else pending when recent", () => {
    const active = buildRealLineage(
      emptyInput({
        datasets: [dataset({ tableName: "sales_view" })],
        loadedTableNames: ["sales_view"],
      }),
    );
    expect(active.nodes[0].status).toBe("active");

    const pending = buildRealLineage(emptyInput({ datasets: [dataset()] }));
    expect(pending.nodes[0].status).toBe("pending");
  });

  it("marks an old, unloaded dataset as stale", () => {
    const old = new Date(NOW - 10 * ONE_DAY).toISOString();
    const result = buildRealLineage(emptyInput({ datasets: [dataset({ updatedAt: old })] }));
    expect(result.nodes[0].status).toBe("stale");
  });

  it("classifies a dataset with a parent as a transform node and wires the edge", () => {
    const parent = dataset({ id: "p", name: "Raw", tableName: "raw_view" });
    const child = dataset({
      id: "c",
      name: "Derived",
      tableName: "derived_view",
      parentId: "p",
      source: "transform",
    });
    const result = buildRealLineage(emptyInput({ datasets: [parent, child] }));

    const childNode = result.nodes.find((n) => n.id === "dataset_c");
    expect(childNode?.type).toBe("transform");
    expect(childNode?.upstreams).toEqual(["dataset_p"]);

    const edge = result.edges.find((e) => e.target === "dataset_c");
    expect(edge?.source).toBe("dataset_p");
    expect(edge?.label).toBe("transform");
  });

  it("resolves downstreams from edges on the parent node", () => {
    const parent = dataset({ id: "p", tableName: "raw_view" });
    const child = dataset({ id: "c", tableName: "derived_view", parentId: "p" });
    const result = buildRealLineage(emptyInput({ datasets: [parent, child] }));
    const parentNode = result.nodes.find((n) => n.id === "dataset_p");
    expect(parentNode?.downstreams).toEqual(["dataset_c"]);
  });

  it("drops a dangling parent upstream that has no matching node", () => {
    const child = dataset({ id: "c", parentId: "ghost" });
    const result = buildRealLineage(emptyInput({ datasets: [child] }));
    const childNode = result.nodes.find((n) => n.id === "dataset_c");
    // upstream pointed at a non-existent ghost dataset → filtered out
    expect(childNode?.upstreams).toEqual([]);
    // and the dangling edge is dropped from the final edge list
    expect(result.edges).toEqual([]);
  });

  it("derives real column lineage from a parseable transform SQL", () => {
    const parent = dataset({
      id: "p",
      tableName: "raw_view",
      columns: [col("amount")],
    });
    const child = dataset({
      id: "c",
      tableName: "agg_view",
      parentId: "p",
      transformSql: "SELECT SUM(amount) AS total FROM raw",
      columns: [col("total")],
    });
    const result = buildRealLineage(emptyInput({ datasets: [parent, child] }));
    const lineage = result.columnLineage;
    expect(lineage).toHaveLength(1);
    expect(lineage[0]).toMatchObject({
      sourceNode: "dataset_p",
      sourceCol: "amount",
      targetNode: "dataset_c",
      targetCol: "total",
    });
    expect(lineage[0].transform).toBeTruthy();
  });

  it("falls back to name-equality column lineage when SQL is absent", () => {
    const parent = dataset({
      id: "p",
      tableName: "raw_view",
      columns: [col("channel"), col("amount")],
    });
    const child = dataset({
      id: "c",
      tableName: "child_view",
      parentId: "p",
      columns: [col("channel"), col("new_col")],
    });
    const result = buildRealLineage(emptyInput({ datasets: [parent, child] }));
    const byTarget = new Map(result.columnLineage.map((cl) => [cl.targetCol, cl]));
    // a column present in the parent maps by name
    expect(byTarget.get("channel")?.sourceCol).toBe("channel");
    // a column NOT present in the parent falls back to the '*' wildcard
    expect(byTarget.get("new_col")?.sourceCol).toBe("*");
  });

  it("creates an output node and edge for a saved chart", () => {
    const ds = dataset({ id: "p", tableName: "raw_view" });
    const chart: SavedChart = {
      id: "ch1",
      datasetId: "p",
      title: "Revenue by channel",
      type: "bar",
      config: {},
      createdAt: new Date(NOW).toISOString(),
    };
    const result = buildRealLineage(emptyInput({ datasets: [ds], savedCharts: [chart] }));
    const chartNode = result.nodes.find((n) => n.id === "chart_ch1");
    expect(chartNode?.type).toBe("output");
    expect(chartNode?.upstreams).toEqual(["dataset_p"]);
    const edge = result.edges.find((e) => e.target === "chart_ch1");
    expect(edge?.source).toBe("dataset_p");
    expect(edge?.label).toBe("visualizes");
  });

  it("wires a transform record into a partial edge for a sample operation", () => {
    const a = dataset({ id: "a", tableName: "a_view" });
    const b = dataset({ id: "b", tableName: "b_view" });
    const transform: DataTransform = {
      id: "t1",
      inputDatasetId: "a",
      outputDatasetId: "b",
      type: "sample",
      sql: "SELECT * FROM a USING SAMPLE 10%",
      description: "",
      appliedAt: new Date(NOW).toISOString(),
    };
    const result = buildRealLineage(emptyInput({ datasets: [a, b], transforms: [transform] }));
    const edge = result.edges.find((e) => e.source === "dataset_a" && e.target === "dataset_b");
    expect(edge?.type).toBe("partial");
    expect(edge?.label).toBe("sample");
  });

  it("builds telecom source, analytics, and daily snapshot nodes with edges", () => {
    const result = buildRealLineage(
      emptyInput({
        telecomSources: [
          {
            key: "file1",
            savedAt: NOW,
            fileName: "DailyTransactions.csv",
            size: 2 * 1024 * 1024,
            lastModified: NOW,
            type: "text/csv",
          },
        ],
        telecomAnalytics: [
          {
            key: "file1",
            savedAt: NOW,
            fileName: "DailyTransactions.csv",
            totalTransactions: 5000,
            successRate: 98,
          },
        ],
        dailyStats: [
          {
            day: "2026-06-15",
            total: 5000,
            success: 4900,
            declined: 50,
            refund: 20,
            instance: 10,
            submitted: 20,
            amount: 99999,
            successRate: 98,
            uniqueCustomers: 1200,
            computedAt: NOW,
            lineage: [
              {
                fileName: "DailyTransactions.csv",
                fileKey: "file1",
                size: 2 * 1024 * 1024,
                rows: 5000,
                ingestedAt: NOW,
                tableName: "telecom",
              },
            ],
          },
        ],
      }),
    );

    const ids = result.nodes.map((n) => n.id);
    expect(ids).toContain("telecom_source_file1");
    expect(ids).toContain("telecom_analytics_file1");
    expect(ids).toContain("telecom_day_2026_06_15");

    // analytics aggregates the matching source
    const analytics = result.nodes.find((n) => n.id === "telecom_analytics_file1");
    expect(analytics?.upstreams).toEqual(["telecom_source_file1"]);

    // daily snapshot lists the contributing source as an upstream
    const day = result.nodes.find((n) => n.id === "telecom_day_2026_06_15");
    expect(day?.upstreams).toContain("telecom_source_file1");

    // and there are aggregate / contributes edges from the source
    const aggregatesEdge = result.edges.find((e) => e.target === "telecom_analytics_file1");
    expect(aggregatesEdge?.label).toBe("aggregates");
  });

  it("omits the analytics upstream edge when no matching source exists", () => {
    const result = buildRealLineage(
      emptyInput({
        telecomAnalytics: [
          {
            key: "orphan",
            savedAt: NOW,
            fileName: "orphan.csv",
            totalTransactions: 1,
            successRate: 50,
          },
        ],
      }),
    );
    const analytics = result.nodes.find((n) => n.id === "telecom_analytics_orphan");
    expect(analytics?.upstreams).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  it("only returns edges whose endpoints both resolve to real nodes", () => {
    const ds = dataset({ id: "a", tableName: "a_view" });
    // a transform referencing a missing output dataset → its edge must be dropped
    const transform: DataTransform = {
      id: "t",
      inputDatasetId: "a",
      outputDatasetId: "missing",
      type: "filter",
      sql: "",
      description: "",
      appliedAt: new Date(NOW).toISOString(),
    };
    const result = buildRealLineage(emptyInput({ datasets: [ds], transforms: [transform] }));
    for (const edge of result.edges) {
      const ids = new Set(result.nodes.map((n) => n.id));
      expect(ids.has(edge.source)).toBe(true);
      expect(ids.has(edge.target)).toBe(true);
    }
  });
});
