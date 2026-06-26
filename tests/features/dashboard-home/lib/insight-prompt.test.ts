/**
 * Unit tests for src/features/dashboard-home/lib/insight-prompt.ts
 *
 * Coverage targets: 100% lines, branches, and functions.
 *
 * The module has no IO boundaries — it is pure data → string transformation.
 * No mocks are required.
 */

import { describe, expect, it } from "vitest";
import {
  DatasetInsightSchema,
  buildDatasetInsightPrompt,
} from "@/features/dashboard-home/lib/insight-prompt";
import type { GenericOverview } from "@/features/dashboard-home/lib/generic-overview";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** Minimal valid GenericOverview with no columns and no optional charts. */
function emptyOverview(overrides: Partial<GenericOverview> = {}): GenericOverview {
  return {
    rowCount: 0,
    columnCount: 0,
    numericColumnCount: 0,
    temporalColumnCount: 0,
    categoricalColumnCount: 0,
    avgNullPercentage: 0,
    totalNullCells: 0,
    columns: [],
    topCategorical: null,
    numericHistogram: null,
    ...overrides,
  };
}

/** A minimal column with sensible defaults. */
function col(
  overrides: Partial<GenericOverview["columns"][number]> = {},
): GenericOverview["columns"][number] {
  return {
    name: "col",
    type: "VARCHAR",
    role: "categorical",
    approxUnique: 5,
    nullPercentage: 0,
    min: null,
    max: null,
    avg: null,
    std: null,
    ...overrides,
  };
}

// ─── DatasetInsightSchema ─────────────────────────────────────────────────────

describe("DatasetInsightSchema", () => {
  it("accepts a fully valid insight object", () => {
    const result = DatasetInsightSchema.safeParse({
      headline: "A valid headline",
      observations: ["First observation"],
      dataQualityFlags: [],
      suggestedNextSteps: ["Run a forecast"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a headline that is too short (< 4 chars)", () => {
    const result = DatasetInsightSchema.safeParse({
      headline: "Hi",
      observations: ["Some observation text here"],
      dataQualityFlags: [],
      suggestedNextSteps: ["Next step action item"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a headline that is too long (> 120 chars)", () => {
    const result = DatasetInsightSchema.safeParse({
      headline: "A".repeat(121),
      observations: ["Some observation text here"],
      dataQualityFlags: [],
      suggestedNextSteps: ["Next step action item"],
    });
    expect(result.success).toBe(false);
  });

  it("requires at least 1 observation", () => {
    const result = DatasetInsightSchema.safeParse({
      headline: "Valid headline here",
      observations: [],
      dataQualityFlags: [],
      suggestedNextSteps: ["Next step action item"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 4 observations", () => {
    const result = DatasetInsightSchema.safeParse({
      headline: "Valid headline here",
      observations: ["obs1 here", "obs2 here", "obs3 here", "obs4 here", "obs5 here"],
      dataQualityFlags: [],
      suggestedNextSteps: ["Next step action item"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 4 dataQualityFlags", () => {
    const result = DatasetInsightSchema.safeParse({
      headline: "Valid headline here",
      observations: ["First observation here"],
      dataQualityFlags: [
        "flag1 detail",
        "flag2 detail",
        "flag3 detail",
        "flag4 detail",
        "flag5 detail",
      ],
      suggestedNextSteps: ["Next step action item"],
    });
    expect(result.success).toBe(false);
  });

  it("accepts zero dataQualityFlags", () => {
    const result = DatasetInsightSchema.safeParse({
      headline: "Valid headline here",
      observations: ["First observation here"],
      dataQualityFlags: [],
      suggestedNextSteps: ["Next step action item"],
    });
    expect(result.success).toBe(true);
  });

  it("requires at least 1 suggestedNextStep", () => {
    const result = DatasetInsightSchema.safeParse({
      headline: "Valid headline here",
      observations: ["First observation here"],
      dataQualityFlags: [],
      suggestedNextSteps: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 3 suggestedNextSteps", () => {
    const result = DatasetInsightSchema.safeParse({
      headline: "Valid headline here",
      observations: ["First observation here"],
      dataQualityFlags: [],
      suggestedNextSteps: [
        "Step one action item",
        "Step two action item",
        "Step three action item",
        "Step four action item",
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an observation shorter than 4 characters", () => {
    const result = DatasetInsightSchema.safeParse({
      headline: "Valid headline here",
      observations: ["Hi"],
      dataQualityFlags: [],
      suggestedNextSteps: ["Next step action item"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an observation longer than 220 characters", () => {
    const result = DatasetInsightSchema.safeParse({
      headline: "Valid headline here",
      observations: ["A".repeat(221)],
      dataQualityFlags: [],
      suggestedNextSteps: ["Next step action item"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a dataQualityFlag shorter than 4 characters", () => {
    const result = DatasetInsightSchema.safeParse({
      headline: "Valid headline here",
      observations: ["Valid observation here"],
      dataQualityFlags: ["Hi"],
      suggestedNextSteps: ["Next step action item"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a dataQualityFlag longer than 180 characters", () => {
    const result = DatasetInsightSchema.safeParse({
      headline: "Valid headline here",
      observations: ["Valid observation here"],
      dataQualityFlags: ["A".repeat(181)],
      suggestedNextSteps: ["Next step action item"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a suggestedNextStep shorter than 4 characters", () => {
    const result = DatasetInsightSchema.safeParse({
      headline: "Valid headline here",
      observations: ["Valid observation here"],
      dataQualityFlags: [],
      suggestedNextSteps: ["Hi"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a suggestedNextStep longer than 180 characters", () => {
    const result = DatasetInsightSchema.safeParse({
      headline: "Valid headline here",
      observations: ["Valid observation here"],
      dataQualityFlags: [],
      suggestedNextSteps: ["A".repeat(181)],
    });
    expect(result.success).toBe(false);
  });
});

// ─── buildDatasetInsightPrompt — system prompt ────────────────────────────────

describe("buildDatasetInsightPrompt — system prompt", () => {
  it("returns a system string that instructs the model to use only supplied stats", () => {
    const { system } = buildDatasetInsightPrompt(emptyOverview(), "MyDataset");
    expect(system).toContain("ONLY the profile statistics provided");
    expect(system).toContain("NOT invent");
    expect(system).toContain("JSON object");
  });
});

// ─── buildDatasetInsightPrompt — prompt header ───────────────────────────────

describe("buildDatasetInsightPrompt — dataset header", () => {
  it("includes the dataset name in the prompt", () => {
    const { prompt } = buildDatasetInsightPrompt(emptyOverview(), "SalesData");
    expect(prompt).toContain('"SalesData"');
  });

  it("embeds shape counts in the prompt", () => {
    const overview = emptyOverview({
      rowCount: 1000,
      columnCount: 4,
      numericColumnCount: 2,
      temporalColumnCount: 1,
      categoricalColumnCount: 1,
    });
    const { prompt } = buildDatasetInsightPrompt(overview, "Test");
    expect(prompt).toContain("1,000 rows");
    expect(prompt).toContain("4 columns");
    expect(prompt).toContain("2 numeric");
    expect(prompt).toContain("1 temporal");
    expect(prompt).toContain("1 categorical");
  });

  it("embeds completeness percentage derived from avgNullPercentage", () => {
    const overview = emptyOverview({ avgNullPercentage: 12.5 });
    const { prompt } = buildDatasetInsightPrompt(overview, "Test");
    // completeness = (100 - 12.5).toFixed(1) = "87.5"
    expect(prompt).toContain("87.5%");
  });

  it("embeds totalNullCells with locale formatting", () => {
    const overview = emptyOverview({ totalNullCells: 50000 });
    const { prompt } = buildDatasetInsightPrompt(overview, "Test");
    expect(prompt).toContain("50,000");
  });
});

// ─── NUM helper — exercised via buildDatasetInsightPrompt ────────────────────

describe("NUM helper (via prompt output)", () => {
  it("formats a finite integer with locale commas", () => {
    const overview = emptyOverview({ rowCount: 1234567 });
    const { prompt } = buildDatasetInsightPrompt(overview, "Test");
    expect(prompt).toContain("1,234,567");
  });

  it("renders 'n/a' for non-finite values (NaN)", () => {
    // Provide a column with a non-finite avg to trigger the n/a path.
    const overview = emptyOverview({
      columns: [
        col({
          name: "amount",
          type: "DOUBLE",
          role: "numeric",
          avg: Number.NaN,
          min: null,
          max: null,
        }),
      ],
    });
    const { prompt } = buildDatasetInsightPrompt(overview, "Test");
    expect(prompt).toContain("n/a");
  });

  it("renders 'n/a' for Infinity", () => {
    const overview = emptyOverview({
      columns: [
        col({
          name: "score",
          type: "DOUBLE",
          role: "numeric",
          avg: Infinity,
          min: null,
          max: null,
        }),
      ],
    });
    const { prompt } = buildDatasetInsightPrompt(overview, "Test");
    expect(prompt).toContain("n/a");
  });
});

// ─── buildDatasetInsightPrompt — column lines ────────────────────────────────

describe("buildDatasetInsightPrompt — column lines", () => {
  it("includes column name, type, and role in each line", () => {
    const overview = emptyOverview({
      columns: [col({ name: "region", type: "VARCHAR", role: "categorical" })],
    });
    const { prompt } = buildDatasetInsightPrompt(overview, "Test");
    expect(prompt).toContain("region (VARCHAR, categorical)");
  });

  it("includes approxUnique and null percentage in each line", () => {
    const overview = emptyOverview({
      columns: [col({ name: "region", approxUnique: 42, nullPercentage: 5.5 })],
    });
    const { prompt } = buildDatasetInsightPrompt(overview, "Test");
    expect(prompt).toContain("~42 distinct");
    expect(prompt).toContain("5.5% null");
  });

  it("adds avg and range for a numeric column with non-null avg, min, and max", () => {
    const overview = emptyOverview({
      columns: [
        col({
          name: "amount",
          type: "DOUBLE",
          role: "numeric",
          avg: 150.5,
          min: "10",
          max: "500",
        }),
      ],
    });
    const { prompt } = buildDatasetInsightPrompt(overview, "Test");
    // avg should appear
    expect(prompt).toContain("avg");
    // range should appear (min !== null && max !== null)
    expect(prompt).toContain("range 10…500");
  });

  it("adds avg but omits range when min or max is null for a numeric column", () => {
    const overview = emptyOverview({
      columns: [
        col({
          name: "amount",
          type: "DOUBLE",
          role: "numeric",
          avg: 100,
          min: null,
          max: null,
        }),
      ],
    });
    const { prompt } = buildDatasetInsightPrompt(overview, "Test");
    expect(prompt).toContain("avg");
    expect(prompt).not.toContain("range");
  });

  it("adds avg but omits range when min is present but max is null", () => {
    const overview = emptyOverview({
      columns: [
        col({
          name: "amount",
          type: "DOUBLE",
          role: "numeric",
          avg: 100,
          min: "5",
          max: null,
        }),
      ],
    });
    const { prompt } = buildDatasetInsightPrompt(overview, "Test");
    expect(prompt).toContain("avg");
    expect(prompt).not.toContain("range");
  });

  it("adds 'from…to' for a non-numeric column with distinct min and max", () => {
    // role !== "numeric", and min !== null && max !== null && min !== max
    const overview = emptyOverview({
      columns: [
        col({
          name: "date_col",
          type: "DATE",
          role: "temporal",
          avg: null,
          min: "2020-01-01",
          max: "2024-12-31",
        }),
      ],
    });
    const { prompt } = buildDatasetInsightPrompt(overview, "Test");
    expect(prompt).toContain("from 2020-01-01 to 2024-12-31");
  });

  it("omits 'from…to' when min equals max for a non-numeric column", () => {
    const overview = emptyOverview({
      columns: [
        col({
          name: "date_col",
          type: "DATE",
          role: "temporal",
          avg: null,
          min: "2020-01-01",
          max: "2020-01-01",
        }),
      ],
    });
    const { prompt } = buildDatasetInsightPrompt(overview, "Test");
    expect(prompt).not.toContain("from");
  });

  it("omits 'from…to' when min or max is null for a non-numeric column", () => {
    const overview = emptyOverview({
      columns: [
        col({
          name: "date_col",
          type: "DATE",
          role: "temporal",
          avg: null,
          min: null,
          max: null,
        }),
      ],
    });
    const { prompt } = buildDatasetInsightPrompt(overview, "Test");
    expect(prompt).not.toContain("from");
  });

  it("omits both avg and from/to for a non-numeric column with null avg and null min/max", () => {
    const overview = emptyOverview({
      columns: [col({ role: "categorical", avg: null, min: null, max: null })],
    });
    const { prompt } = buildDatasetInsightPrompt(overview, "Test");
    expect(prompt).not.toContain("avg");
    expect(prompt).not.toContain("from");
    expect(prompt).not.toContain("range");
  });

  it("omits avg/range block when role is numeric but avg is null", () => {
    // role === "numeric" but avg === null → the numeric branch is skipped
    // and we check the else-if for from/to
    const overview = emptyOverview({
      columns: [
        col({
          name: "amount",
          type: "DOUBLE",
          role: "numeric",
          avg: null,
          min: "1",
          max: "100",
        }),
      ],
    });
    const { prompt } = buildDatasetInsightPrompt(overview, "Test");
    // avg block is skipped; but the else-if (min != null && max != null && min !== max) fires
    expect(prompt).toContain("from 1 to 100");
    expect(prompt).not.toContain("avg");
  });

  it("sorts columns by descending null percentage, then by descending approxUnique", () => {
    const overview = emptyOverview({
      columns: [
        col({ name: "low_null_low_unique", nullPercentage: 0, approxUnique: 5 }),
        col({ name: "high_null", nullPercentage: 50, approxUnique: 3 }),
        col({ name: "low_null_high_unique", nullPercentage: 0, approxUnique: 20 }),
      ],
    });
    const { prompt } = buildDatasetInsightPrompt(overview, "Test");
    // high_null should appear before low_null_*
    const highNullIdx = prompt.indexOf("high_null");
    const lowNullHighUniqueIdx = prompt.indexOf("low_null_high_unique");
    const lowNullLowUniqueIdx = prompt.indexOf("low_null_low_unique");
    expect(highNullIdx).toBeLessThan(lowNullHighUniqueIdx);
    // Among same null %, higher approxUnique comes first
    expect(lowNullHighUniqueIdx).toBeLessThan(lowNullLowUniqueIdx);
  });

  it("slices columns to at most 16 when more are provided", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      col({ name: `col${i}`, nullPercentage: 20 - i }),
    );
    const overview = emptyOverview({ columns: many });
    const { prompt } = buildDatasetInsightPrompt(overview, "Test");
    // The 17th column (col16) by sorted order should NOT appear.
    // After sorting by null desc (col0 has 20, col16 has 4), only top 16 remain.
    // col16 has nullPercentage=4 which is 17th highest; col17,col18,col19 are lower.
    // The 17th in sorted order is the one with nullPercentage=4 = col16.
    expect(prompt).not.toContain("col16");
    expect(prompt).not.toContain("col17");
    expect(prompt).not.toContain("col18");
    expect(prompt).not.toContain("col19");
  });

  it("handles an empty columns array gracefully (no column lines)", () => {
    const overview = emptyOverview({ columns: [] });
    const { prompt } = buildDatasetInsightPrompt(overview, "Test");
    // Prompt still contains the Columns section header
    expect(prompt).toContain("Columns (most-notable first):");
  });
});

// ─── buildDatasetInsightPrompt — topCategorical ───────────────────────────────

describe("buildDatasetInsightPrompt — topCategorical", () => {
  it("includes top categorical values when topCategorical is present", () => {
    const overview = emptyOverview({
      topCategorical: {
        column: "region",
        values: [
          { label: "North", count: 500 },
          { label: "South", count: 300 },
        ],
      },
    });
    const { prompt } = buildDatasetInsightPrompt(overview, "Test");
    expect(prompt).toContain('Top values of "region"');
    expect(prompt).toContain("North (500)");
    expect(prompt).toContain("South (300)");
  });

  it("slices topCategorical values to at most 6", () => {
    const overview = emptyOverview({
      topCategorical: {
        column: "status",
        values: [
          { label: "A", count: 100 },
          { label: "B", count: 90 },
          { label: "C", count: 80 },
          { label: "D", count: 70 },
          { label: "E", count: 60 },
          { label: "F", count: 50 },
          { label: "G", count: 40 },
        ],
      },
    });
    const { prompt } = buildDatasetInsightPrompt(overview, "Test");
    expect(prompt).toContain("A (100)");
    expect(prompt).toContain("F (50)");
    // 7th value should not appear
    expect(prompt).not.toContain("G (40)");
  });

  it("produces an empty topCat string when topCategorical is null", () => {
    const overview = emptyOverview({ topCategorical: null });
    const { prompt } = buildDatasetInsightPrompt(overview, "Test");
    expect(prompt).not.toContain("Top values");
  });

  it("formats count values with locale commas in topCategorical", () => {
    const overview = emptyOverview({
      topCategorical: {
        column: "country",
        values: [{ label: "USA", count: 1234567 }],
      },
    });
    const { prompt } = buildDatasetInsightPrompt(overview, "Test");
    expect(prompt).toContain("USA (1,234,567)");
  });

  it("includes the closing sentence when topCategorical is present", () => {
    const overview = emptyOverview({
      topCategorical: {
        column: "region",
        values: [{ label: "East", count: 10 }],
      },
    });
    const { prompt } = buildDatasetInsightPrompt(overview, "Test");
    // The topCat string ends with a period.
    expect(prompt).toMatch(/East \(10\)\./);
  });
});

// ─── buildDatasetInsightPrompt — prompt footer ───────────────────────────────

describe("buildDatasetInsightPrompt — prompt footer", () => {
  it("includes writing instructions in the prompt", () => {
    const { prompt } = buildDatasetInsightPrompt(emptyOverview(), "Test");
    expect(prompt).toContain("one-line headline");
    expect(prompt).toContain("grounded observations");
    expect(prompt).toContain("data-quality");
    expect(prompt).toContain("suggested next");
  });
});

// ─── buildDatasetInsightPrompt — return shape ─────────────────────────────────

describe("buildDatasetInsightPrompt — return shape", () => {
  it("returns an object with exactly 'system' and 'prompt' string fields", () => {
    const result = buildDatasetInsightPrompt(emptyOverview(), "Test");
    expect(result).toHaveProperty("system");
    expect(result).toHaveProperty("prompt");
    expect(typeof result.system).toBe("string");
    expect(typeof result.prompt).toBe("string");
  });

  it("produces non-empty system and prompt strings", () => {
    const result = buildDatasetInsightPrompt(emptyOverview(), "Test");
    expect(result.system.length).toBeGreaterThan(0);
    expect(result.prompt.length).toBeGreaterThan(0);
  });
});

// ─── buildDatasetInsightPrompt — edge cases ──────────────────────────────────

describe("buildDatasetInsightPrompt — edge cases", () => {
  it("handles a dataset with a single numeric column that has all parts (avg, min, max)", () => {
    const overview = emptyOverview({
      rowCount: 500,
      columnCount: 1,
      numericColumnCount: 1,
      columns: [
        col({
          name: "price",
          type: "DOUBLE",
          role: "numeric",
          approxUnique: 200,
          nullPercentage: 2.5,
          avg: 49.99,
          min: "0.99",
          max: "999.99",
        }),
      ],
    });
    const { prompt } = buildDatasetInsightPrompt(overview, "Products");
    expect(prompt).toContain("price (DOUBLE, numeric)");
    expect(prompt).toContain("~200 distinct");
    expect(prompt).toContain("2.5% null");
    expect(prompt).toContain("avg");
    expect(prompt).toContain("range 0.99…999.99");
  });

  it("handles a dataset with zero avgNullPercentage (completeness = 100%)", () => {
    const overview = emptyOverview({ avgNullPercentage: 0 });
    const { prompt } = buildDatasetInsightPrompt(overview, "CleanData");
    expect(prompt).toContain("100.0%");
  });

  it("handles a dataset with full null percentage (completeness = 0%)", () => {
    const overview = emptyOverview({ avgNullPercentage: 100 });
    const { prompt } = buildDatasetInsightPrompt(overview, "NullData");
    expect(prompt).toContain("0.0%");
  });

  it("handles large rowCount with locale formatting", () => {
    const overview = emptyOverview({ rowCount: 9876543 });
    const { prompt } = buildDatasetInsightPrompt(overview, "BigData");
    expect(prompt).toContain("9,876,543");
  });

  it("formats approxUnique of 0 as '~0 distinct'", () => {
    const overview = emptyOverview({
      columns: [col({ approxUnique: 0 })],
    });
    const { prompt } = buildDatasetInsightPrompt(overview, "Test");
    expect(prompt).toContain("~0 distinct");
  });

  it("handles exactly 16 columns without slicing any out", () => {
    const columns = Array.from({ length: 16 }, (_, i) => col({ name: `c${i}` }));
    const overview = emptyOverview({ columns });
    const { prompt } = buildDatasetInsightPrompt(overview, "Test");
    for (let i = 0; i < 16; i++) {
      expect(prompt).toContain(`c${i}`);
    }
  });
});
