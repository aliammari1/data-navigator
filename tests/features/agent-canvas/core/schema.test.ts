import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RegisteredDataset } from "@/platform/duckdb/duckdb";

// ─── Boundary mocks ───────────────────────────────────────────────────────────
// `analyzeSchema` reaches three external boundaries: the DuckDB read-only/catalog
// surface and the AI bridge. Mock all of them so no real database, worker, model,
// or network is ever touched. Each mock is a controllable `vi.fn()` so individual
// tests can stage success / edge / error behaviour per call.

const listRegisteredDatasets = vi.fn();
const profileDataset = vi.fn();
const runReadOnlyQuery = vi.fn();

vi.mock("@/platform/duckdb/duckdb", () => ({
  listRegisteredDatasets: () => listRegisteredDatasets(),
  profileDataset: (input: unknown) => profileDataset(input),
  runReadOnlyQuery: (sql: string) => runReadOnlyQuery(sql),
}));

const aiReadySync = vi.fn();
const aiStructured = vi.fn();

vi.mock("@/features/agent-canvas/core/ai-bridge", () => ({
  aiReadySync: () => aiReadySync(),
  aiStructured: (system: string, user: string, schema: unknown, opts: unknown) =>
    aiStructured(system, user, schema, opts),
}));

import { analyzeSchema } from "@/features/agent-canvas/core/schema";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a registered-dataset catalog entry with sane defaults. */
function makeDataset(overrides: Partial<RegisteredDataset> = {}): RegisteredDataset {
  return {
    id: "ds-1",
    displayName: "Daily Transactions",
    viewName: "tx_view",
    sourcePath: "/data/tx.csv",
    cachePath: "/cache/tx.parquet",
    sourceFormat: "csv",
    rowCount: 1000,
    columns: [
      { name: "channel", type: "VARCHAR", nullable: true },
      { name: "amount", type: "DOUBLE", nullable: true },
    ],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

/** Collect every string the pipeline emits so progress text can be asserted. */
function makeEmitter() {
  const messages: string[] = [];
  const emit = (text: string) => {
    messages.push(text);
  };
  return { emit, messages };
}

/** A SUMMARIZE-style row as DuckDB returns it. */
function summarizeRow(
  name: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { column_name: name, ...extra };
}

beforeEach(() => {
  // Sensible defaults: no catalog, AI off. Individual tests override as needed.
  listRegisteredDatasets.mockResolvedValue([]);
  profileDataset.mockResolvedValue([]);
  runReadOnlyQuery.mockResolvedValue([]);
  aiReadySync.mockReturnValue(false);
  aiStructured.mockReset();
});

describe("analyzeSchema — dataset resolution from the catalog", () => {
  it("resolves a registered dataset by id and queries its view, not the raw input", async () => {
    // Arrange
    const dataset = makeDataset({ id: "ds-42", viewName: "v_secret", rowCount: 7 });
    listRegisteredDatasets.mockResolvedValue([dataset]);
    profileDataset.mockResolvedValue([
      summarizeRow("channel", { approx_unique: 3, null_percentage: 0 }),
      summarizeRow("amount", { approx_unique: 7, null_percentage: 0, avg: 5 }),
    ]);
    const { emit } = makeEmitter();

    // Act
    const schema = await analyzeSchema("ds-42", emit);

    // Assert — the resolved view name (not the dataset id) is used downstream.
    expect(schema.tableName).toBe("v_secret");
    expect(schema.rowCount).toBe(7);
    // A registered dataset profiles through profileDataset, never an inline SUMMARIZE.
    expect(profileDataset).toHaveBeenCalledWith({ datasetId: "ds-42" });
    expect(runReadOnlyQuery).not.toHaveBeenCalledWith(
      expect.stringContaining("SUMMARIZE"),
    );
  });

  it("matches a dataset by its viewName", async () => {
    // Arrange
    listRegisteredDatasets.mockResolvedValue([makeDataset({ viewName: "tx_view" })]);
    const { emit } = makeEmitter();

    // Act
    const schema = await analyzeSchema("tx_view", emit);

    // Assert
    expect(schema.tableName).toBe("tx_view");
    expect(profileDataset).toHaveBeenCalledWith({ datasetId: "ds-1" });
  });

  it("matches a dataset by its displayName", async () => {
    // Arrange
    listRegisteredDatasets.mockResolvedValue([
      makeDataset({ displayName: "My Big Report", viewName: "report_v" }),
    ]);
    const { emit } = makeEmitter();

    // Act
    const schema = await analyzeSchema("My Big Report", emit);

    // Assert
    expect(schema.tableName).toBe("report_v");
  });

  it("uses the dataset's own column list (carrying duckType through)", async () => {
    // Arrange
    listRegisteredDatasets.mockResolvedValue([
      makeDataset({
        columns: [
          { name: "ts", type: "TIMESTAMP", nullable: true },
          { name: "qty", type: "BIGINT", nullable: false },
        ],
      }),
    ]);
    const { emit } = makeEmitter();

    // Act
    const schema = await analyzeSchema("ds-1", emit);

    // Assert
    expect(schema.columns.map((c) => c.name)).toEqual(["ts", "qty"]);
    expect(schema.columns.map((c) => c.duckType)).toEqual(["TIMESTAMP", "BIGINT"]);
  });
});

describe("analyzeSchema — legacy raw-view fallback (DESCRIBE + COUNT)", () => {
  it("falls back to DESCRIBE/COUNT when the name is not in the catalog", async () => {
    // Arrange
    runReadOnlyQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith("DESCRIBE")) {
        return [
          { column_name: "region", column_type: "VARCHAR" },
          { column_name: "sales", column_type: "DOUBLE" },
        ];
      }
      if (sql.includes("COUNT(*)")) return [{ row_count: 250 }];
      return []; // SAMPLE / SUMMARIZE
    });
    const { emit } = makeEmitter();

    // Act
    const schema = await analyzeSchema("legacy_raw_view", emit);

    // Assert
    expect(schema.tableName).toBe("legacy_raw_view");
    expect(schema.rowCount).toBe(250);
    expect(schema.columns.map((c) => c.name)).toEqual(["region", "sales"]);
    // Identifier quoting is applied to the raw view name.
    expect(runReadOnlyQuery).toHaveBeenCalledWith('DESCRIBE "legacy_raw_view"');
    // No catalog entry → profiling goes through inline SUMMARIZE, not profileDataset.
    expect(profileDataset).not.toHaveBeenCalled();
    expect(runReadOnlyQuery).toHaveBeenCalledWith(
      'SUMMARIZE SELECT * FROM "legacy_raw_view"',
    );
  });

  it("escapes embedded double-quotes in the table identifier", async () => {
    // Arrange
    runReadOnlyQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith("DESCRIBE")) return [];
      if (sql.includes("COUNT(*)")) return [{ row_count: 0 }];
      return [];
    });
    const { emit } = makeEmitter();

    // Act
    await analyzeSchema('weird"name', emit);

    // Assert — the `"` is doubled to `""` so the SQL identifier stays valid.
    expect(runReadOnlyQuery).toHaveBeenCalledWith('DESCRIBE "weird""name"');
  });

  it("falls back to the `name`/`type` DESCRIBE field aliases and drops empty-named columns", async () => {
    // Arrange — some DuckDB versions return `name`/`type` instead of column_name/column_type.
    runReadOnlyQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith("DESCRIBE")) {
        return [
          { name: "valid", type: "INTEGER" },
          { name: "", type: "VARCHAR" }, // empty name → filtered out
          { other: "garbage" }, // no name field → becomes "" → filtered out
        ];
      }
      if (sql.includes("COUNT(*)")) return [{ row_count: 3 }];
      return [];
    });
    const { emit } = makeEmitter();

    // Act
    const schema = await analyzeSchema("vw", emit);

    // Assert
    expect(schema.columns.map((c) => c.name)).toEqual(["valid"]);
    // The default DuckDB type for a missing type field is VARCHAR.
    expect(schema.columns[0]?.duckType).toBe("INTEGER");
  });

  it("treats a non-finite / missing COUNT result as 0 rows", async () => {
    // Arrange
    runReadOnlyQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith("DESCRIBE")) return [{ column_name: "a", column_type: "VARCHAR" }];
      if (sql.includes("COUNT(*)")) return [{ row_count: "not-a-number" }];
      return [];
    });
    const { emit } = makeEmitter();

    // Act
    const schema = await analyzeSchema("vw", emit);

    // Assert
    expect(schema.rowCount).toBe(0);
  });

  it("returns an empty catalog (and falls back) when listRegisteredDatasets rejects", async () => {
    // Arrange — the `.catch(() => [])` guard must swallow the rejection.
    listRegisteredDatasets.mockRejectedValue(new Error("catalog down"));
    runReadOnlyQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith("DESCRIBE")) return [{ column_name: "x", column_type: "INTEGER" }];
      if (sql.includes("COUNT(*)")) return [{ row_count: 5 }];
      return [];
    });
    const { emit } = makeEmitter();

    // Act
    const schema = await analyzeSchema("vw", emit);

    // Assert — no throw; it resolved via the raw fallback.
    expect(schema.rowCount).toBe(5);
    expect(schema.columns.map((c) => c.name)).toEqual(["x"]);
  });
});

describe("analyzeSchema — semantic inference", () => {
  /** Resolve a single legacy column with the given type + summarize stats. */
  async function profileSingle(
    colType: string,
    summary: Record<string, unknown>,
    rowCount = 1000,
    colName = "col",
  ) {
    runReadOnlyQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith("DESCRIBE")) {
        return [{ column_name: colName, column_type: colType }];
      }
      if (sql.includes("COUNT(*)")) return [{ row_count: rowCount }];
      if (sql.includes("SUMMARIZE")) {
        return [summarizeRow(colName, summary)];
      }
      return []; // SAMPLE
    });
    const { emit } = makeEmitter();
    const schema = await analyzeSchema("vw", emit);
    return schema.columns[0];
  }

  it("classifies BOOLEAN types as boolean", async () => {
    const col = await profileSingle("BOOLEAN", { approx_unique: 2 });
    expect(col?.semantic).toBe("boolean");
  });

  it("classifies DATE/TIMESTAMP/TIME types as datetime", async () => {
    expect((await profileSingle("DATE", {}))?.semantic).toBe("datetime");
    expect((await profileSingle("TIMESTAMP", {}))?.semantic).toBe("datetime");
    expect((await profileSingle("TIME", {}))?.semantic).toBe("datetime");
  });

  it("classifies a high-cardinality numeric id column as id", async () => {
    // name contains 'id' + cardinalityRatio > 0.8 → id
    const col = await profileSingle(
      "BIGINT",
      { approx_unique: 900 },
      1000,
      "customer_id",
    );
    expect(col?.semantic).toBe("id");
  });

  it("classifies a 2-distinct numeric column as boolean (flag-like)", async () => {
    const col = await profileSingle("INTEGER", { approx_unique: 2 }, 1000, "flag");
    expect(col?.semantic).toBe("boolean");
  });

  it("classifies a regular numeric column as numeric", async () => {
    const col = await profileSingle("DOUBLE", { approx_unique: 400 }, 1000, "amount");
    expect(col?.semantic).toBe("numeric");
  });

  it("classifies a high-cardinality text-id (word-boundary id) as id", async () => {
    // VARCHAR id with cardinalityRatio > 0.9 → id via the /\bid\b|_id$|^id_/ regex
    const col = await profileSingle(
      "VARCHAR",
      { approx_unique: 950 },
      1000,
      "order_id",
    );
    expect(col?.semantic).toBe("id");
  });

  it("classifies a near-unique non-numeric column as text", async () => {
    const col = await profileSingle("VARCHAR", { approx_unique: 990 }, 1000, "note");
    expect(col?.semantic).toBe("text");
  });

  it("classifies a huge-cardinality column as text via the absolute 50k threshold", async () => {
    // cardinalityRatio is low (60000/1e6 = 0.06) but cardinality > 50_000 → text
    const col = await profileSingle(
      "VARCHAR",
      { approx_unique: 60_000 },
      1_000_000,
      "freeform",
    );
    expect(col?.semantic).toBe("text");
  });

  it("classifies a low-cardinality string column as categorical", async () => {
    const col = await profileSingle("VARCHAR", { approx_unique: 5 }, 1000, "channel");
    expect(col?.semantic).toBe("categorical");
  });

  it("guards against division-by-zero when rowCount is 0 (safeRowCount=1)", async () => {
    // With rowCount 0, the ratio uses max(rowCount,1)=1; cardinality 5 → ratio 5
    // (>0.95) so a non-numeric column becomes text, never NaN/crash.
    const col = await profileSingle("VARCHAR", { approx_unique: 5 }, 0, "anything");
    expect(col?.semantic).toBe("text");
  });
});

describe("analyzeSchema — category detection", () => {
  /** Profile a legacy view whose only signal is its column names. */
  async function categoryFor(columnNames: string[]) {
    runReadOnlyQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith("DESCRIBE")) {
        return columnNames.map((n) => ({ column_name: n, column_type: "VARCHAR" }));
      }
      if (sql.includes("COUNT(*)")) return [{ row_count: 100 }];
      return [];
    });
    const { emit } = makeEmitter();
    const schema = await analyzeSchema("vw", emit);
    return schema.category;
  }

  it("detects telecom", async () => {
    expect(await categoryFor(["msisdn", "service_class"])).toBe("telecom");
  });

  it("detects finance", async () => {
    expect(await categoryFor(["revenue", "balance"])).toBe("finance");
  });

  it("detects ecommerce", async () => {
    expect(await categoryFor(["product", "sku"])).toBe("ecommerce");
  });

  it("detects iot", async () => {
    expect(await categoryFor(["sensor", "voltage"])).toBe("iot");
  });

  it("detects hr", async () => {
    expect(await categoryFor(["employee", "salary"])).toBe("hr");
  });

  it("detects healthcare", async () => {
    expect(await categoryFor(["patient", "diagnosis"])).toBe("healthcare");
  });

  it("detects web-analytics", async () => {
    expect(await categoryFor(["pageview", "conversion"])).toBe("web-analytics");
  });

  it("falls back to generic when nothing matches", async () => {
    expect(await categoryFor(["foo", "bar"])).toBe("generic");
  });

  it("prioritises telecom over finance when both keyword groups appear", async () => {
    // detectCategory checks telecom first; 'revenue' (finance) is also present.
    expect(await categoryFor(["transaction", "revenue"])).toBe("telecom");
  });
});

describe("analyzeSchema — null-rate parsing from SUMMARIZE", () => {
  async function nullRateFor(nullPercentage: unknown) {
    runReadOnlyQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith("DESCRIBE")) return [{ column_name: "c", column_type: "VARCHAR" }];
      if (sql.includes("COUNT(*)")) return [{ row_count: 100 }];
      if (sql.includes("SUMMARIZE")) {
        return [summarizeRow("c", { null_percentage: nullPercentage, approx_unique: 5 })];
      }
      return [];
    });
    const { emit } = makeEmitter();
    const schema = await analyzeSchema("vw", emit);
    return schema.columns[0]?.nullRate;
  }

  it("parses a numeric percentage into a 0..1 rate", async () => {
    expect(await nullRateFor(12.5)).toBeCloseTo(0.125, 6);
  });

  it("parses a string percentage with a trailing %", async () => {
    expect(await nullRateFor("25%")).toBeCloseTo(0.25, 6);
  });

  it("clamps values above 100% to 1", async () => {
    expect(await nullRateFor(250)).toBe(1);
  });

  it("clamps negative values to 0", async () => {
    expect(await nullRateFor(-10)).toBe(0);
  });

  it("returns 0 for null/undefined/non-numeric", async () => {
    expect(await nullRateFor(null)).toBe(0);
    expect(await nullRateFor(undefined)).toBe(0);
    expect(await nullRateFor("N/A")).toBe(0);
  });
});

describe("analyzeSchema — min/max/avg and cardinality from SUMMARIZE", () => {
  it("carries finite numeric min/max/avg through and parses cardinality", async () => {
    // Arrange
    runReadOnlyQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith("DESCRIBE")) return [{ column_name: "amount", column_type: "DOUBLE" }];
      if (sql.includes("COUNT(*)")) return [{ row_count: 1000 }];
      if (sql.includes("SUMMARIZE")) {
        return [
          summarizeRow("amount", {
            min: 1.5,
            max: 99.5,
            avg: 50,
            approx_unique: 300,
          }),
        ];
      }
      return [];
    });
    const { emit } = makeEmitter();

    // Act
    const col = (await analyzeSchema("vw", emit)).columns[0];

    // Assert
    expect(col?.min).toBeCloseTo(1.5, 6);
    expect(col?.max).toBeCloseTo(99.5, 6);
    expect(col?.avg).toBeCloseTo(50, 6);
    expect(col?.cardinality).toBe(300);
  });

  it("leaves min/max/avg undefined when SUMMARIZE omits them, and cardinality 0", async () => {
    // Arrange — no summary row for the column at all.
    runReadOnlyQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith("DESCRIBE")) return [{ column_name: "x", column_type: "VARCHAR" }];
      if (sql.includes("COUNT(*)")) return [{ row_count: 1000 }];
      return []; // SUMMARIZE & SAMPLE empty
    });
    const { emit } = makeEmitter();

    // Act
    const col = (await analyzeSchema("vw", emit)).columns[0];

    // Assert
    expect(col?.min).toBeUndefined();
    expect(col?.max).toBeUndefined();
    expect(col?.avg).toBeUndefined();
    expect(col?.cardinality).toBe(0);
    expect(col?.nullRate).toBe(0);
  });

  it("treats a non-numeric min/max as undefined (optionalNumber rejects non-finite)", async () => {
    // Arrange
    runReadOnlyQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith("DESCRIBE")) return [{ column_name: "d", column_type: "VARCHAR" }];
      if (sql.includes("COUNT(*)")) return [{ row_count: 10 }];
      if (sql.includes("SUMMARIZE")) {
        return [summarizeRow("d", { min: "2020-01-01", max: "abc", approx_unique: 3 })];
      }
      return [];
    });
    const { emit } = makeEmitter();

    // Act
    const col = (await analyzeSchema("vw", emit)).columns[0];

    // Assert — non-finite numerics become undefined, not NaN.
    expect(col?.min).toBeUndefined();
    expect(col?.max).toBeUndefined();
  });
});

describe("analyzeSchema — representative sample collection", () => {
  it("collects up to 6 distinct non-empty stringified values per column", async () => {
    // Arrange — sample has duplicates, nulls, undefined, empty strings, and >6 distinct.
    listRegisteredDatasets.mockResolvedValue([
      makeDataset({
        viewName: "tx_view",
        columns: [{ name: "channel", type: "VARCHAR", nullable: true }],
      }),
    ]);
    profileDataset.mockResolvedValue([summarizeRow("channel", { approx_unique: 9 })]);
    runReadOnlyQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("USING SAMPLE")) {
        return [
          { channel: "A" },
          { channel: "A" }, // duplicate → deduped
          { channel: null }, // skipped
          { channel: undefined }, // skipped
          { channel: "" }, // empty string → skipped
          { channel: "B" },
          { channel: 3 }, // numeric → "3"
          { channel: "C" },
          { channel: "D" },
          { channel: "E" },
          { channel: "F" }, // 7th distinct → stops at 6
        ];
      }
      return [];
    });
    const { emit } = makeEmitter();

    // Act
    const col = (await analyzeSchema("ds-1", emit)).columns[0];

    // Assert
    expect(col?.sample).toEqual(["A", "B", "3", "C", "D", "E"]);
    expect(col?.sample.length).toBe(6);
  });

  it("leaves the sample empty when the SAMPLE scan throws", async () => {
    // Arrange
    listRegisteredDatasets.mockResolvedValue([makeDataset({ viewName: "tx_view" })]);
    profileDataset.mockResolvedValue([summarizeRow("channel", { approx_unique: 3 })]);
    runReadOnlyQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("USING SAMPLE")) throw new Error("tiny table, no sampling");
      return [];
    });
    const { emit } = makeEmitter();

    // Act
    const schema = await analyzeSchema("ds-1", emit);

    // Assert — the catch leaves samples empty but does not fail the pipeline.
    expect(schema.columns.every((c) => c.sample.length === 0)).toBe(true);
  });

  it("survives profileDataset throwing — stats fall back to empty, semantics still inferred", async () => {
    // Arrange
    listRegisteredDatasets.mockResolvedValue([
      makeDataset({
        viewName: "tx_view",
        columns: [{ name: "ts", type: "TIMESTAMP", nullable: true }],
      }),
    ]);
    profileDataset.mockRejectedValue(new Error("SUMMARIZE unavailable"));
    runReadOnlyQuery.mockResolvedValue([]); // SAMPLE empty
    const { emit } = makeEmitter();

    // Act
    const col = (await analyzeSchema("ds-1", emit)).columns[0];

    // Assert — type-based inference still works even with zero stats.
    expect(col?.semantic).toBe("datetime");
    expect(col?.cardinality).toBe(0);
  });
});

describe("analyzeSchema — dimensions / metrics / timeDims derivation", () => {
  it("selects categorical dims (2..200 card), numeric metrics (no id), and datetime cols", async () => {
    // Arrange
    listRegisteredDatasets.mockResolvedValue([
      makeDataset({
        rowCount: 1000,
        columns: [
          { name: "channel", type: "VARCHAR", nullable: true }, // categorical dim
          { name: "amount", type: "DOUBLE", nullable: true }, // numeric metric
          { name: "user_id", type: "BIGINT", nullable: true }, // id metric → excluded
          { name: "event_ts", type: "TIMESTAMP", nullable: true }, // timeDim
          { name: "rare", type: "VARCHAR", nullable: true }, // card 1 → not a dim
        ],
      }),
    ]);
    profileDataset.mockResolvedValue([
      summarizeRow("channel", { approx_unique: 5 }),
      summarizeRow("amount", { approx_unique: 400 }),
      summarizeRow("user_id", { approx_unique: 990 }), // ratio>0.8 & name has id → id
      summarizeRow("event_ts", { approx_unique: 800 }),
      summarizeRow("rare", { approx_unique: 1 }), // below the >=2 dim floor
    ]);
    const { emit } = makeEmitter();

    // Act
    const schema = await analyzeSchema("ds-1", emit);

    // Assert
    expect(schema.dimensions).toEqual(["channel"]);
    expect(schema.metrics).toEqual(["amount"]);
    expect(schema.timeDims).toEqual(["event_ts"]);
  });

  it("excludes numeric columns whose name contains 'id' from metrics", async () => {
    // Arrange — low-cardinality numeric so it stays 'numeric' (not 'id'), but the
    // name filter still strips it from metrics.
    listRegisteredDatasets.mockResolvedValue([
      makeDataset({
        rowCount: 1000,
        columns: [
          { name: "widget_id", type: "INTEGER", nullable: true },
          { name: "score", type: "DOUBLE", nullable: true },
        ],
      }),
    ]);
    profileDataset.mockResolvedValue([
      summarizeRow("widget_id", { approx_unique: 50 }), // numeric (ratio 0.05, name 'id' but ratio<0.8)
      summarizeRow("score", { approx_unique: 400 }),
    ]);
    const { emit } = makeEmitter();

    // Act
    const schema = await analyzeSchema("ds-1", emit);

    // Assert
    expect(schema.metrics).toEqual(["score"]);
  });

  it("sorts dimensions by ascending cardinality and caps at 8", async () => {
    // Arrange — 10 categorical columns with descending cardinality.
    const columns = Array.from({ length: 10 }, (_, i) => ({
      name: `dim${i}`,
      type: "VARCHAR",
      nullable: true,
    }));
    listRegisteredDatasets.mockResolvedValue([
      makeDataset({ rowCount: 100_000, columns }),
    ]);
    profileDataset.mockResolvedValue(
      columns.map((c, i) => summarizeRow(c.name, { approx_unique: 100 - i * 5 })),
    );
    const { emit } = makeEmitter();

    // Act
    const schema = await analyzeSchema("ds-1", emit);

    // Assert — capped at 8 and the lowest-cardinality dims come first.
    expect(schema.dimensions).toHaveLength(8);
    // dim9 has the smallest cardinality (100-45=55) → first.
    expect(schema.dimensions[0]).toBe("dim9");
    expect(schema.dimensions[1]).toBe("dim8");
  });

  it("caps metrics at 8", async () => {
    // Arrange — 10 numeric metric columns.
    const columns = Array.from({ length: 10 }, (_, i) => ({
      name: `m${i}`,
      type: "DOUBLE",
      nullable: true,
    }));
    listRegisteredDatasets.mockResolvedValue([makeDataset({ rowCount: 1000, columns })]);
    profileDataset.mockResolvedValue(
      columns.map((c) => summarizeRow(c.name, { approx_unique: 500 })),
    );
    const { emit } = makeEmitter();

    // Act
    const schema = await analyzeSchema("ds-1", emit);

    // Assert
    expect(schema.metrics).toHaveLength(8);
  });
});

describe("analyzeSchema — summary text & AI path", () => {
  it("uses the deterministic heuristic summary when AI is not ready", async () => {
    // Arrange
    aiReadySync.mockReturnValue(false);
    listRegisteredDatasets.mockResolvedValue([
      makeDataset({
        rowCount: 1234,
        columns: [
          { name: "msisdn", type: "VARCHAR", nullable: true },
          { name: "amount", type: "DOUBLE", nullable: true },
        ],
      }),
    ]);
    profileDataset.mockResolvedValue([
      summarizeRow("msisdn", { approx_unique: 1000 }),
      summarizeRow("amount", { approx_unique: 400 }),
    ]);
    const { emit } = makeEmitter();

    // Act
    const schema = await analyzeSchema("ds-1", emit);

    // Assert
    expect(schema.summary).toBe(
      "A telecom dataset with 1,234 rows and 2 columns.",
    );
    expect(aiStructured).not.toHaveBeenCalled();
  });

  it("replaces the summary with the trimmed LLM result when AI is ready", async () => {
    // Arrange
    aiReadySync.mockReturnValue(true);
    aiStructured.mockResolvedValue({ summary: "  Mobile money transactions per channel.  " });
    listRegisteredDatasets.mockResolvedValue([makeDataset({ viewName: "tx_view" })]);
    profileDataset.mockResolvedValue([
      summarizeRow("channel", { approx_unique: 5 }),
      summarizeRow("amount", { approx_unique: 400 }),
    ]);
    const { emit } = makeEmitter();

    // Act
    const schema = await analyzeSchema("ds-1", emit);

    // Assert — trimmed, no surrounding whitespace.
    expect(schema.summary).toBe("Mobile money transactions per channel.");
    expect(aiStructured).toHaveBeenCalledTimes(1);
  });

  it("keeps the heuristic summary when the LLM call rejects", async () => {
    // Arrange
    aiReadySync.mockReturnValue(true);
    aiStructured.mockRejectedValue(new Error("model busy"));
    listRegisteredDatasets.mockResolvedValue([
      makeDataset({ rowCount: 10, columns: [{ name: "foo", type: "VARCHAR", nullable: true }] }),
    ]);
    profileDataset.mockResolvedValue([summarizeRow("foo", { approx_unique: 3 })]);
    const { emit } = makeEmitter();

    // Act
    const schema = await analyzeSchema("ds-1", emit);

    // Assert — falls back to the generic heuristic; pipeline does not throw.
    expect(schema.summary).toBe("A generic dataset with 10 rows and 1 columns.");
  });
});

describe("analyzeSchema — progress emissions & final shape", () => {
  it("emits the expected progress milestones in order", async () => {
    // Arrange
    aiReadySync.mockReturnValue(false);
    listRegisteredDatasets.mockResolvedValue([
      makeDataset({ displayName: "Sales", rowCount: 42, viewName: "sales_v" }),
    ]);
    profileDataset.mockResolvedValue([
      summarizeRow("channel", { approx_unique: 4 }),
      summarizeRow("amount", { approx_unique: 30 }),
    ]);
    const { emit, messages } = makeEmitter();

    // Act
    await analyzeSchema("Sales", emit);

    // Assert — key milestones are present and the resolve message echoes the input.
    expect(messages[0]).toBe('Resolving dataset "Sales"…');
    expect(messages.some((m) => m.includes("Profiling 2 columns × 42 rows"))).toBe(true);
    expect(messages.some((m) => m.startsWith("Summarizing 2 columns"))).toBe(true);
    expect(messages.some((m) => m.includes("Sampling representative values"))).toBe(true);
    expect(messages.some((m) => m.includes("Detected data category"))).toBe(true);
    expect(messages.some((m) => m.startsWith("Schema ready"))).toBe(true);
  });

  it("returns a fully-populated DataSchema for an empty dataset (no columns)", async () => {
    // Arrange — zero columns, zero rows. Everything must still be well-formed.
    listRegisteredDatasets.mockResolvedValue([
      makeDataset({ rowCount: 0, columns: [], viewName: "empty_v", displayName: "Empty" }),
    ]);
    profileDataset.mockResolvedValue([]);
    const { emit } = makeEmitter();

    // Act
    const schema = await analyzeSchema("Empty", emit);

    // Assert
    expect(schema).toMatchObject({
      tableName: "empty_v",
      rowCount: 0,
      columns: [],
      category: "generic",
      dimensions: [],
      metrics: [],
      timeDims: [],
    });
    expect(schema.summary).toBe("A generic dataset with 0 rows and 0 columns.");
  });
});
