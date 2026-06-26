import { describe, it, expect } from "vitest";
import {
  buildContextSummary,
  buildDailyBriefingPrompt,
  buildExecutiveSummaryPrompt,
  buildActionPlanPrompt,
  buildAnomalyExplanationPrompt,
  buildAnomalyReportPrompt,
  buildDataStoryPrompt,
} from "@/features/ai-briefing/core/briefing-prompts";
import type { BriefingContext, NumericColumnStat } from "@/features/ai-briefing/core/briefing-context";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNumericStat(overrides: Partial<NumericColumnStat> = {}): NumericColumnStat {
  return {
    name: "amount",
    mean: 100,
    std: 10,
    min: 50,
    max: 200,
    q1: 80,
    q3: 120,
    nullPct: 0,
    ...overrides,
  };
}

function makeCtx(overrides: Partial<BriefingContext> = {}): BriefingContext {
  return {
    datasetId: "ds_001",
    datasetName: "Sales Data",
    tableName: "sales_view",
    rowCount: 5000,
    numericCols: [],
    topCategory: null,
    generatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// ─── fmt (internal, exercised via exported functions) ──────────────────────────

describe("fmt (via buildContextSummary)", () => {
  it("returns '0' for non-finite values like Infinity", () => {
    // Arrange: a numeric stat with Infinity mean — fmt(Infinity) should return "0"
    const ctx = makeCtx({
      numericCols: [makeNumericStat({ name: "x", mean: Infinity, std: 0, min: 0, max: 0 })],
    });

    // Act
    const summary = buildContextSummary(ctx);

    // Assert: the mean rendered as "0" for non-finite
    expect(summary).toContain("mean 0");
  });

  it("returns '0' for NaN values", () => {
    // Arrange
    const ctx = makeCtx({
      numericCols: [makeNumericStat({ name: "x", mean: Number.NaN, std: 0, min: 0, max: 0 })],
    });

    // Act
    const summary = buildContextSummary(ctx);

    // Assert: NaN is not finite, so fmt returns "0"
    expect(summary).toContain("mean 0");
  });

  it("formats numbers >= 1000 with toLocaleString (rounded integer)", () => {
    // Arrange: mean is 1500 (>= 1000), should be Math.round(1500).toLocaleString()
    const ctx = makeCtx({
      numericCols: [makeNumericStat({ name: "x", mean: 1500, std: 0, min: 0, max: 0 })],
    });

    // Act
    const summary = buildContextSummary(ctx);

    // Assert: 1500 formatted as locale string appears in the summary
    expect(summary).toContain("mean " + Math.round(1500).toLocaleString());
  });

  it("formats numbers < 1000 with toFixed(2) as a Number string", () => {
    // Arrange: mean is 99.55 (< 1000), should be Number(99.55.toFixed(2)).toString() = "99.55"
    const ctx = makeCtx({
      numericCols: [makeNumericStat({ name: "x", mean: 99.55, std: 0, min: 0, max: 0 })],
    });

    // Act
    const summary = buildContextSummary(ctx);

    // Assert
    expect(summary).toContain("mean 99.55");
  });

  it("formats negative numbers >= abs 1000 with toLocaleString", () => {
    // Arrange: min is -2000, abs(-2000)=2000 >= 1000
    const ctx = makeCtx({
      numericCols: [makeNumericStat({ name: "x", mean: 0, std: 0, min: -2000, max: 0 })],
    });

    // Act
    const summary = buildContextSummary(ctx);

    // Assert: -2000 formatted as Math.round(-2000).toLocaleString() = "-2,000" or "-2000"
    expect(summary).toContain(Math.round(-2000).toLocaleString());
  });

  it("formats negative numbers with abs < 1000 with toFixed(2)", () => {
    // Arrange: min is -5.5
    const ctx = makeCtx({
      numericCols: [makeNumericStat({ name: "x", mean: 0, std: 0, min: -5.5, max: 0 })],
    });

    // Act
    const summary = buildContextSummary(ctx);

    // Assert: -5.5 formatted as Number((-5.5).toFixed(2)).toString() = "-5.5"
    expect(summary).toContain("-5.5");
  });
});

// ─── describeNumeric (internal, exercised via buildContextSummary) ────────────

describe("describeNumeric (via buildContextSummary)", () => {
  it("returns 'No numeric columns are present.' when numericCols is empty", () => {
    // Arrange
    const ctx = makeCtx({ numericCols: [] });

    // Act
    const summary = buildContextSummary(ctx);

    // Assert
    expect(summary).toContain("No numeric columns are present.");
  });

  it("describes each numeric column with name, mean, std, min, max", () => {
    // Arrange
    const ctx = makeCtx({
      numericCols: [makeNumericStat({ name: "price", mean: 25.5, std: 5.2, min: 1, max: 99 })],
    });

    // Act
    const summary = buildContextSummary(ctx);

    // Assert
    expect(summary).toContain("price:");
    expect(summary).toContain("mean 25.5");
    expect(summary).toContain("σ 5.2");
    expect(summary).toContain("range 1");
    expect(summary).toContain("99");
  });

  it("includes null percentage when nullPct >= 1", () => {
    // Arrange: nullPct = 5
    const ctx = makeCtx({
      numericCols: [makeNumericStat({ name: "val", mean: 10, std: 1, min: 0, max: 20, nullPct: 5 })],
    });

    // Act
    const summary = buildContextSummary(ctx);

    // Assert: includes "5% null"
    expect(summary).toContain("5% null");
  });

  it("omits null percentage when nullPct < 1", () => {
    // Arrange: nullPct = 0.5 (< 1)
    const ctx = makeCtx({
      numericCols: [makeNumericStat({ name: "val", mean: 10, std: 1, min: 0, max: 20, nullPct: 0.5 })],
    });

    // Act
    const summary = buildContextSummary(ctx);

    // Assert: should NOT contain "% null"
    expect(summary).not.toContain("% null");
  });

  it("omits null percentage when nullPct is exactly 0", () => {
    // Arrange: nullPct = 0 (< 1)
    const ctx = makeCtx({
      numericCols: [makeNumericStat({ name: "val", mean: 10, std: 1, min: 0, max: 20, nullPct: 0 })],
    });

    // Act
    const summary = buildContextSummary(ctx);

    // Assert: should NOT contain "% null"
    expect(summary).not.toContain("% null");
  });

  it("joins multiple numeric columns with semicolons", () => {
    // Arrange
    const ctx = makeCtx({
      numericCols: [
        makeNumericStat({ name: "colA", mean: 1, std: 0, min: 0, max: 5 }),
        makeNumericStat({ name: "colB", mean: 2, std: 0, min: 0, max: 10 }),
      ],
    });

    // Act
    const summary = buildContextSummary(ctx);

    // Assert: columns are joined with "; "
    expect(summary).toContain("colA:");
    expect(summary).toContain("colB:");
    expect(summary).toMatch(/colA:.*; colB:/);
  });
});

// ─── describeCategory (internal, exercised via buildContextSummary) ───────────

describe("describeCategory (via buildContextSummary)", () => {
  it("returns empty string when topCategory is null", () => {
    // Arrange
    const ctx = makeCtx({ topCategory: null });

    // Act
    const summary = buildContextSummary(ctx);

    // Assert: summary ends after the numeric description (no extra category text)
    // It should not contain 'Top "' which is the marker for category info
    expect(summary).not.toContain('Top "');
  });

  it("includes topCategory dimension and formatted values when present", () => {
    // Arrange
    const ctx = makeCtx({
      topCategory: {
        dimension: "region",
        values: [
          { label: "North", count: 1500, pct: 30 },
          { label: "South", count: 2000, pct: 40 },
        ],
      },
    });

    // Act
    const summary = buildContextSummary(ctx);

    // Assert
    expect(summary).toContain('Top "region" values:');
    expect(summary).toContain("North (30%)");
    expect(summary).toContain("South (40%)");
  });

  it("formats pct values with toFixed(0) (rounds to integer)", () => {
    // Arrange
    const ctx = makeCtx({
      topCategory: {
        dimension: "category",
        values: [{ label: "A", count: 333, pct: 33.333 }],
      },
    });

    // Act
    const summary = buildContextSummary(ctx);

    // Assert: 33.333 should be rendered as "33"
    expect(summary).toContain("A (33%)");
  });
});

// ─── buildContextSummary ──────────────────────────────────────────────────────

describe("buildContextSummary", () => {
  it("includes the dataset name and row count", () => {
    // Arrange
    const ctx = makeCtx({ datasetName: "My Dataset", rowCount: 12345 });

    // Act
    const summary = buildContextSummary(ctx);

    // Assert
    expect(summary).toContain('Dataset "My Dataset"');
    expect(summary).toContain("12,345 rows");
  });

  it("formats rowCount with toLocaleString for large numbers", () => {
    // Arrange
    const ctx = makeCtx({ rowCount: 1_000_000 });

    // Act
    const summary = buildContextSummary(ctx);

    // Assert: locale-formatted large number
    expect(summary).toContain((1_000_000).toLocaleString() + " rows");
  });

  it("includes numeric and category descriptions together", () => {
    // Arrange
    const ctx = makeCtx({
      numericCols: [makeNumericStat({ name: "sales", mean: 50, std: 5, min: 10, max: 100, nullPct: 0 })],
      topCategory: {
        dimension: "region",
        values: [{ label: "East", count: 100, pct: 50 }],
      },
    });

    // Act
    const summary = buildContextSummary(ctx);

    // Assert: both parts present
    expect(summary).toContain("sales:");
    expect(summary).toContain('Top "region"');
  });
});

// ─── buildDailyBriefingPrompt ─────────────────────────────────────────────────

describe("buildDailyBriefingPrompt", () => {
  it("returns an object with system and prompt strings", () => {
    // Arrange
    const ctx = makeCtx({ datasetName: "Test" });

    // Act
    const result = buildDailyBriefingPrompt(ctx);

    // Assert
    expect(result).toHaveProperty("system");
    expect(result).toHaveProperty("prompt");
    expect(typeof result.system).toBe("string");
    expect(typeof result.prompt).toBe("string");
  });

  it("system prompt describes a news-anchor-style analyst", () => {
    // Arrange
    const ctx = makeCtx();

    // Act
    const result = buildDailyBriefingPrompt(ctx);

    // Assert
    expect(result.system).toContain("daily briefing");
    expect(result.system).toContain("3 short paragraphs");
    expect(result.system).toContain("no bullet lists");
  });

  it("prompt equals the context summary", () => {
    // Arrange
    const ctx = makeCtx({ datasetName: "SalesDB", rowCount: 1000 });

    // Act
    const result = buildDailyBriefingPrompt(ctx);
    const summary = buildContextSummary(ctx);

    // Assert: prompt is exactly the context summary
    expect(result.prompt).toBe(summary);
  });

  it("prompt includes dataset info from the context", () => {
    // Arrange
    const ctx = makeCtx({ datasetName: "Revenue Report", rowCount: 500 });

    // Act
    const result = buildDailyBriefingPrompt(ctx);

    // Assert
    expect(result.prompt).toContain('Dataset "Revenue Report"');
    expect(result.prompt).toContain("500 rows");
  });
});

// ─── buildExecutiveSummaryPrompt ──────────────────────────────────────────────

describe("buildExecutiveSummaryPrompt", () => {
  it("returns an object with system and prompt strings", () => {
    // Arrange
    const ctx = makeCtx();

    // Act
    const result = buildExecutiveSummaryPrompt(ctx);

    // Assert
    expect(result).toHaveProperty("system");
    expect(result).toHaveProperty("prompt");
  });

  it("system prompt references executive management and 3 paragraphs", () => {
    // Arrange
    const ctx = makeCtx();

    // Act
    const result = buildExecutiveSummaryPrompt(ctx);

    // Assert
    expect(result.system).toContain("executive management");
    expect(result.system).toContain("3 paragraphs");
    expect(result.system).toContain("No headings");
  });

  it("prompt equals the context summary", () => {
    // Arrange
    const ctx = makeCtx({ datasetName: "Finance", rowCount: 2000 });

    // Act
    const result = buildExecutiveSummaryPrompt(ctx);
    const summary = buildContextSummary(ctx);

    // Assert
    expect(result.prompt).toBe(summary);
  });
});

// ─── buildActionPlanPrompt ────────────────────────────────────────────────────

describe("buildActionPlanPrompt", () => {
  it("returns an object with system and prompt strings", () => {
    // Arrange
    const ctx = makeCtx();

    // Act
    const result = buildActionPlanPrompt(ctx);

    // Assert
    expect(result).toHaveProperty("system");
    expect(result).toHaveProperty("prompt");
  });

  it("system prompt requests a JSON object with 'items' and 5 prioritised actions", () => {
    // Arrange
    const ctx = makeCtx();

    // Act
    const result = buildActionPlanPrompt(ctx);

    // Assert
    expect(result.system).toContain("JSON object");
    expect(result.system).toContain('"items"');
    expect(result.system).toContain("5 items");
    expect(result.system).toContain("operations expert");
  });

  it("prompt equals the context summary", () => {
    // Arrange
    const ctx = makeCtx({ datasetName: "Ops", rowCount: 750 });

    // Act
    const result = buildActionPlanPrompt(ctx);
    const summary = buildContextSummary(ctx);

    // Assert
    expect(result.prompt).toBe(summary);
  });
});

// ─── buildAnomalyExplanationPrompt ───────────────────────────────────────────

describe("buildAnomalyExplanationPrompt", () => {
  it("returns an object with system and prompt strings", () => {
    // Arrange
    const args = {
      datasetName: "Sales",
      column: "revenue",
      count: 5,
      maxZ: 4.2,
      min: -100,
      max: 5000,
      examples: [4800, 4900, 5000],
    };

    // Act
    const result = buildAnomalyExplanationPrompt(args);

    // Assert
    expect(result).toHaveProperty("system");
    expect(result).toHaveProperty("prompt");
  });

  it("system prompt asks for JSON with explanation and hypotheses", () => {
    // Arrange
    const args = {
      datasetName: "DS",
      column: "col",
      count: 3,
      maxZ: 3.5,
      min: 0,
      max: 100,
      examples: [90, 95, 100],
    };

    // Act
    const result = buildAnomalyExplanationPrompt(args);

    // Assert
    expect(result.system).toContain('"explanation"');
    expect(result.system).toContain('"hypotheses"');
    expect(result.system).toContain("3 concrete");
  });

  it("prompt includes datasetName, column, count, maxZ, and range", () => {
    // Arrange
    const args = {
      datasetName: "MyDataset",
      column: "price",
      count: 7,
      maxZ: 6.1,
      min: 10,
      max: 999,
      examples: [950, 975],
    };

    // Act
    const result = buildAnomalyExplanationPrompt(args);

    // Assert
    expect(result.prompt).toContain('"MyDataset"');
    expect(result.prompt).toContain('"price"');
    expect(result.prompt).toContain("7 anomalous values");
    expect(result.prompt).toContain("z-score up to 6.1");
    expect(result.prompt).toContain("10");
    expect(result.prompt).toContain("999");
  });

  it("prompt includes formatted example outliers joined with ', '", () => {
    // Arrange
    const args = {
      datasetName: "D",
      column: "c",
      count: 2,
      maxZ: 3,
      min: 0,
      max: 1,
      examples: [100, 200, 2000],
    };

    // Act
    const result = buildAnomalyExplanationPrompt(args);

    // Assert: examples are formatted with fmt and joined with ", "
    expect(result.prompt).toContain("100");
    expect(result.prompt).toContain("200");
    // 2000 >= 1000, so formatted with toLocaleString
    expect(result.prompt).toContain(Math.round(2000).toLocaleString());
  });

  it("formats example outliers using the fmt function (large number)", () => {
    // Arrange
    const args = {
      datasetName: "D",
      column: "c",
      count: 1,
      maxZ: 5,
      min: 0,
      max: 50000,
      examples: [45000],
    };

    // Act
    const result = buildAnomalyExplanationPrompt(args);

    // Assert: 45000 >= 1000, should be formatted as toLocaleString
    expect(result.prompt).toContain(Math.round(45000).toLocaleString());
  });

  it("formats example outliers that are non-finite as '0'", () => {
    // Arrange
    const args = {
      datasetName: "D",
      column: "c",
      count: 1,
      maxZ: 5,
      min: 0,
      max: 100,
      examples: [Number.NaN],
    };

    // Act
    const result = buildAnomalyExplanationPrompt(args);

    // Assert: NaN formatted as "0"
    expect(result.prompt).toContain("example outliers: 0");
  });

  it("handles empty examples array gracefully", () => {
    // Arrange
    const args = {
      datasetName: "D",
      column: "c",
      count: 0,
      maxZ: 0,
      min: 0,
      max: 0,
      examples: [],
    };

    // Act
    const result = buildAnomalyExplanationPrompt(args);

    // Assert: example outliers section is present but empty
    expect(result.prompt).toContain("example outliers: ");
  });
});

// ─── buildAnomalyReportPrompt ──────────────────────────────────────────────────

describe("buildAnomalyReportPrompt", () => {
  it("returns an object with system and prompt strings", () => {
    // Arrange
    const args = { datasetName: "Sales", summary: "3 outliers in revenue column" };

    // Act
    const result = buildAnomalyReportPrompt(args);

    // Assert
    expect(result).toHaveProperty("system");
    expect(result).toHaveProperty("prompt");
  });

  it("system prompt mentions investigation report sections", () => {
    // Arrange
    const args = { datasetName: "D", summary: "summary text" };

    // Act
    const result = buildAnomalyReportPrompt(args);

    // Assert
    expect(result.system).toContain("Executive Summary");
    expect(result.system).toContain("Findings");
    expect(result.system).toContain("Risk Assessment");
    expect(result.system).toContain("Recommended Actions");
    expect(result.system).toContain("No markdown fences");
  });

  it("prompt includes datasetName and summary text", () => {
    // Arrange
    const args = {
      datasetName: "Revenue Report",
      summary: "Column 'price' had 12 anomalous values",
    };

    // Act
    const result = buildAnomalyReportPrompt(args);

    // Assert
    expect(result.prompt).toContain('"Revenue Report"');
    expect(result.prompt).toContain("Column 'price' had 12 anomalous values");
  });

  it("prompt uses a newline to separate dataset name from summary", () => {
    // Arrange
    const args = { datasetName: "D", summary: "some summary" };

    // Act
    const result = buildAnomalyReportPrompt(args);

    // Assert
    expect(result.prompt).toContain("\n");
    expect(result.prompt).toContain("Detected anomalies:\nsome summary");
  });
});

// ─── buildDataStoryPrompt ─────────────────────────────────────────────────────

describe("buildDataStoryPrompt", () => {
  it("returns an object with system and prompt strings", () => {
    // Arrange
    const ctx = makeCtx();

    // Act
    const result = buildDataStoryPrompt(ctx);

    // Assert
    expect(result).toHaveProperty("system");
    expect(result).toHaveProperty("prompt");
  });

  it("system prompt requests JSON with setup, conflict, resolution fields", () => {
    // Arrange
    const ctx = makeCtx();

    // Act
    const result = buildDataStoryPrompt(ctx);

    // Assert
    expect(result.system).toContain('"setup"');
    expect(result.system).toContain('"conflict"');
    expect(result.system).toContain('"resolution"');
    expect(result.system).toContain("data storyteller");
  });

  it("prompt equals the context summary", () => {
    // Arrange
    const ctx = makeCtx({ datasetName: "Story Data", rowCount: 3000 });

    // Act
    const result = buildDataStoryPrompt(ctx);
    const summary = buildContextSummary(ctx);

    // Assert
    expect(result.prompt).toBe(summary);
  });

  it("prompt includes dataset info from the context", () => {
    // Arrange
    const ctx = makeCtx({ datasetName: "Narrative DB", rowCount: 9999 });

    // Act
    const result = buildDataStoryPrompt(ctx);

    // Assert
    expect(result.prompt).toContain('"Narrative DB"');
    expect(result.prompt).toContain("9,999 rows");
  });
});

// ─── Edge cases: nullPct exactly at boundary ─────────────────────────────────

describe("nullPct boundary (exactly 1 vs 0.99)", () => {
  it("includes null percentage when nullPct is exactly 1", () => {
    // Arrange
    const ctx = makeCtx({
      numericCols: [makeNumericStat({ name: "v", mean: 0, std: 0, min: 0, max: 0, nullPct: 1 })],
    });

    // Act
    const summary = buildContextSummary(ctx);

    // Assert: 1 >= 1, so should include "1% null"
    expect(summary).toContain("1% null");
  });

  it("omits null percentage when nullPct is 0.99 (just below 1)", () => {
    // Arrange
    const ctx = makeCtx({
      numericCols: [makeNumericStat({ name: "v", mean: 0, std: 0, min: 0, max: 0, nullPct: 0.99 })],
    });

    // Act
    const summary = buildContextSummary(ctx);

    // Assert: 0.99 < 1, so should NOT include "% null"
    expect(summary).not.toContain("% null");
  });
});

// ─── fmt at boundary (abs(n) exactly 1000) ───────────────────────────────────

describe("fmt boundary (abs(n) = 1000)", () => {
  it("uses toLocaleString when value is exactly 1000", () => {
    // Arrange: mean exactly 1000
    const ctx = makeCtx({
      numericCols: [makeNumericStat({ name: "x", mean: 1000, std: 0, min: 0, max: 0 })],
    });

    // Act
    const summary = buildContextSummary(ctx);

    // Assert: 1000 >= 1000, so uses Math.round(1000).toLocaleString()
    expect(summary).toContain("mean " + Math.round(1000).toLocaleString());
  });

  it("uses toFixed(2) when value is 999.99 (just below 1000)", () => {
    // Arrange: mean just below 1000
    const ctx = makeCtx({
      numericCols: [makeNumericStat({ name: "x", mean: 999.99, std: 0, min: 0, max: 0 })],
    });

    // Act
    const summary = buildContextSummary(ctx);

    // Assert: 999.99 < 1000, uses toFixed(2)
    expect(summary).toContain("mean " + Number((999.99).toFixed(2)).toString());
  });
});
