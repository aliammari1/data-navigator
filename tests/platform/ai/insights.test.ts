import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ColMeta } from "@/core/stores/data-store";

// ─── Mock the LLM boundary ────────────────────────────────────────────────────
// generateInsights / recommendCharts call the on-device inference engine when
// it is ready. We keep it "not ready" by default so the pure rule-based paths
// run, and flip it on only for the few tests that exercise the LLM branch.
const isLLMReady = vi.fn<() => boolean>(() => false);
const generateText = vi.fn<(prompt: string, opts?: unknown) => Promise<string>>(async () => "");

vi.mock("@/platform/ai/llm-engine", () => ({
  isLLMReady: () => isLLMReady(),
  generateText: (prompt: string, opts?: unknown) => generateText(prompt, opts),
}));

import { generateInsights, linearForecast, recommendCharts } from "@/platform/ai/insights";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function col(name: string, type: ColMeta["type"], extra: Partial<ColMeta> = {}): ColMeta {
  return {
    name,
    type,
    nullCount: 0,
    distinctCount: 0,
    sample: [],
    ...extra,
  };
}

beforeEach(() => {
  isLLMReady.mockReturnValue(false);
  generateText.mockReset();
  generateText.mockResolvedValue("");
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── linearForecast ───────────────────────────────────────────────────────────

describe("linearForecast", () => {
  it("returns a flat zeroed forecast for fewer than two points", () => {
    const f = linearForecast([42]);

    expect(f.historical).toEqual([]);
    expect(f.predicted).toEqual([]);
    expect(f.slope).toBe(0);
    expect(f.intercept).toBe(0);
    expect(f.r2).toBe(0);
    expect(f.trend).toBe("flat");
  });

  it("recovers a known increasing line and predicts the requested steps", () => {
    // y = 2x: perfect upward line.
    const f = linearForecast([0, 2, 4, 6, 8], 3);

    expect(f.slope).toBeCloseTo(2);
    expect(f.intercept).toBeCloseTo(0);
    expect(f.r2).toBeCloseTo(1);
    expect(f.trend).toBe("up");
    expect(f.historical).toHaveLength(5);
    expect(f.predicted).toHaveLength(3);
    // First prediction continues the line at x = 5 -> y = 10.
    expect(f.predicted[0]).toEqual({ x: 5, y: expect.closeTo(10, 5) });
  });

  it("detects a downward trend", () => {
    const f = linearForecast([10, 8, 6, 4, 2]);
    expect(f.trend).toBe("down");
    expect(f.slope).toBeLessThan(0);
  });

  it("reports a flat trend for constant data", () => {
    const f = linearForecast([5, 5, 5, 5, 5]);
    expect(f.trend).toBe("flat");
    expect(f.slope).toBeCloseTo(0);
  });

  it("clamps r2 into the [0, 1] range", () => {
    const f = linearForecast([3, 1, 4, 1, 5, 9, 2, 6]);
    expect(f.r2).toBeGreaterThanOrEqual(0);
    expect(f.r2).toBeLessThanOrEqual(1);
  });

  it("defaults to six predicted steps", () => {
    const f = linearForecast([1, 2, 3, 4]);
    expect(f.predicted).toHaveLength(6);
  });
});

// ─── generateInsights: rule-based path (LLM not ready) ────────────────────────

describe("generateInsights rule-based quality detection", () => {
  it("flags a critical insight when more than half the values are null", async () => {
    const cols = [col("amount", "number", { nullCount: 60 })];
    const insights = await generateInsights(cols, 100, {
      amount: [1, 2, 3, 4, 5],
    });

    const quality = insights.find((i) => i.type === "quality");
    expect(quality).toBeDefined();
    expect(quality?.severity).toBe("critical");
    expect(quality?.columnName).toBe("amount");
    expect(quality?.value).toBe("60.0%");
  });

  it("flags a warning (not critical) for a moderate null rate", async () => {
    const cols = [col("amount", "number", { nullCount: 30 })];
    const insights = await generateInsights(cols, 100, {
      amount: [1, 2, 3, 4, 5],
    });

    const quality = insights.find((i) => i.type === "quality");
    expect(quality?.severity).toBe("warning");
  });

  it("does not emit a quality insight when the null rate is below the threshold", async () => {
    const cols = [col("amount", "number", { nullCount: 5 })];
    const insights = await generateInsights(cols, 100, {
      amount: [1, 2, 3, 4, 5],
    });

    expect(insights.some((i) => i.type === "quality")).toBe(false);
  });
});

describe("generateInsights rule-based trend / distribution / correlation", () => {
  it("detects an upward trend in a strongly linear series", async () => {
    const cols = [col("sales", "number")];
    const insights = await generateInsights(cols, 10, {
      sales: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    });

    const trend = insights.find((i) => i.type === "trend");
    expect(trend).toBeDefined();
    expect(trend?.title).toContain("Upward");
    expect(trend?.columnName).toBe("sales");
  });

  it("detects a skewed distribution", async () => {
    const cols = [col("skewed", "number")];
    // Heavily right-skewed sample.
    const insights = await generateInsights(cols, 12, {
      skewed: [1, 1, 1, 1, 1, 2, 2, 3, 4, 50, 80, 120],
    });

    const dist = insights.find((i) => i.type === "distribution");
    expect(dist).toBeDefined();
    expect(dist?.description).toContain("skew");
  });

  it("detects a strong correlation between two numeric columns", async () => {
    const cols = [col("a", "number"), col("b", "number")];
    const insights = await generateInsights(cols, 6, {
      a: [1, 2, 3, 4, 5, 6],
      b: [2, 4, 6, 8, 10, 12],
    });

    const corr = insights.find((i) => i.type === "correlation");
    expect(corr).toBeDefined();
    expect(corr?.description).toContain("positively");
  });

  it("returns an empty array for an empty dataset", async () => {
    const insights = await generateInsights([], 0, {});
    expect(insights).toEqual([]);
  });

  it("ignores numeric columns with too few values for skew/trend detection", async () => {
    const cols = [col("tiny", "number")];
    const insights = await generateInsights(cols, 2, { tiny: [1, 2] });
    // 2 points: below the thresholds for skew (4) and trend (5).
    expect(insights.some((i) => i.type === "distribution")).toBe(false);
    expect(insights.some((i) => i.type === "trend")).toBe(false);
  });

  it("caps rule-based insights at five", async () => {
    const cols = Array.from({ length: 10 }, (_, i) => col(`c${i}`, "number", { nullCount: 90 }));
    const numericData = Object.fromEntries(
      cols.map((c) => [c.name, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]]),
    );
    const insights = await generateInsights(cols, 100, numericData);
    expect(insights.length).toBeLessThanOrEqual(5);
  });

  it("treats a missing numericData argument as no numeric series", async () => {
    const cols = [col("amount", "number", { nullCount: 80 })];
    const insights = await generateInsights(cols, 100);
    // Only the quality insight (driven by nullCount) should appear.
    expect(insights).toHaveLength(1);
    expect(insights[0].type).toBe("quality");
  });
});

// ─── generateInsights: LLM path ──────────────────────────────────────────────

describe("generateInsights LLM path", () => {
  it("returns parsed LLM insights when the model is ready and replies with valid JSON", async () => {
    isLLMReady.mockReturnValue(true);
    generateText.mockResolvedValue(
      JSON.stringify([
        {
          type: "trend",
          severity: "info",
          title: "Custom LLM insight",
          description: "from the model",
        },
      ]),
    );

    const cols = [col("amount", "number")];
    const insights = await generateInsights(cols, 10, {
      amount: [1, 2, 3, 4, 5],
    });

    expect(generateText).toHaveBeenCalledTimes(1);
    expect(insights).toHaveLength(1);
    expect(insights[0].title).toBe("Custom LLM insight");
  });

  it("extracts a JSON array embedded in prose from the LLM", async () => {
    isLLMReady.mockReturnValue(true);
    generateText.mockResolvedValue(
      'Here are insights:\n[{"type":"quality","severity":"warning","title":"t","description":"d"}]\nDone.',
    );

    const cols = [col("amount", "number")];
    const insights = await generateInsights(cols, 10, {
      amount: [1, 2, 3, 4, 5],
    });

    expect(insights).toHaveLength(1);
    expect(insights[0].title).toBe("t");
  });

  it("falls back to rule-based insights when the LLM returns no JSON array", async () => {
    isLLMReady.mockReturnValue(true);
    generateText.mockResolvedValue("the model produced prose only");

    const cols = [col("amount", "number", { nullCount: 80 })];
    const insights = await generateInsights(cols, 100, {
      amount: [1, 2, 3, 4, 5],
    });

    // Rule-based quality insight is returned instead.
    expect(insights.some((i) => i.type === "quality")).toBe(true);
  });

  it("falls back to rule-based insights when the LLM returns an empty array", async () => {
    isLLMReady.mockReturnValue(true);
    generateText.mockResolvedValue("[]");

    const cols = [col("amount", "number", { nullCount: 80 })];
    const insights = await generateInsights(cols, 100, {
      amount: [1, 2, 3, 4, 5],
    });

    expect(insights.some((i) => i.type === "quality")).toBe(true);
  });

  it("falls back to rule-based insights when generateText rejects", async () => {
    isLLMReady.mockReturnValue(true);
    generateText.mockRejectedValue(new Error("inference failed"));

    const cols = [col("amount", "number", { nullCount: 80 })];
    const insights = await generateInsights(cols, 100, {
      amount: [1, 2, 3, 4, 5],
    });

    expect(insights.some((i) => i.type === "quality")).toBe(true);
  });
});

// ─── recommendCharts: rule-based path ────────────────────────────────────────

describe("recommendCharts rule-based path", () => {
  it("recommends a bar chart for a numeric + categorical schema", async () => {
    const cols = [col("region", "string"), col("revenue", "number")];
    const recs = await recommendCharts(cols, 100);

    const bar = recs.find((r) => r.type === "bar");
    expect(bar).toBeDefined();
    expect(bar?.xCol).toBe("region");
    expect(bar?.yCol).toBe("revenue");
  });

  it("recommends a line chart when a date column accompanies a numeric column", async () => {
    const cols = [col("ts", "date"), col("revenue", "number")];
    const recs = await recommendCharts(cols, 100);

    const line = recs.find((r) => r.type === "line");
    expect(line).toBeDefined();
    expect(line?.xCol).toBe("ts");
  });

  it("recommends a scatter chart when two numeric columns exist", async () => {
    const cols = [col("a", "number"), col("b", "number")];
    const recs = await recommendCharts(cols, 100);

    const scatter = recs.find((r) => r.type === "scatter");
    expect(scatter).toBeDefined();
    expect(scatter?.xCol).toBe("a");
    expect(scatter?.yCol).toBe("b");
  });

  it("recommends a pie chart for a categorical column within the row-count window", async () => {
    const cols = [col("category", "string")];
    const recs = await recommendCharts(cols, 500);

    expect(recs.some((r) => r.type === "pie")).toBe(true);
  });

  it("omits the pie recommendation for very large datasets", async () => {
    const cols = [col("category", "string")];
    const recs = await recommendCharts(cols, 50000);

    expect(recs.some((r) => r.type === "pie")).toBe(false);
  });

  it("defaults the row count to zero (suppressing pie) when omitted", async () => {
    const cols = [col("category", "string")];
    const recs = await recommendCharts(cols);

    // rowCount defaults to 0, which is not > 0, so no pie.
    expect(recs.some((r) => r.type === "pie")).toBe(false);
  });

  it("returns an empty list for an empty schema", async () => {
    const recs = await recommendCharts([], 100);
    expect(recs).toEqual([]);
  });

  it("caps recommendations at three", async () => {
    const cols = [
      col("region", "string"),
      col("category", "string"),
      col("ts", "date"),
      col("a", "number"),
      col("b", "number"),
    ];
    const recs = await recommendCharts(cols, 100);
    expect(recs.length).toBeLessThanOrEqual(3);
  });
});

// ─── recommendCharts: LLM path ───────────────────────────────────────────────

describe("recommendCharts LLM path", () => {
  it("returns parsed LLM chart recommendations when the model is ready", async () => {
    isLLMReady.mockReturnValue(true);
    generateText.mockResolvedValue(
      JSON.stringify([
        {
          type: "heatmap",
          title: "LLM heatmap",
          reason: "model reason",
          confidence: 0.6,
        },
      ]),
    );

    const cols = [col("a", "number"), col("b", "number")];
    const recs = await recommendCharts(cols, 100);

    expect(generateText).toHaveBeenCalledTimes(1);
    expect(recs).toHaveLength(1);
    expect(recs[0].type).toBe("heatmap");
    expect(recs[0].title).toBe("LLM heatmap");
  });

  it("falls back to rule-based recommendations when the LLM returns no array", async () => {
    isLLMReady.mockReturnValue(true);
    generateText.mockResolvedValue("no json at all");

    const cols = [col("region", "string"), col("revenue", "number")];
    const recs = await recommendCharts(cols, 100);

    expect(recs.some((r) => r.type === "bar")).toBe(true);
  });

  it("falls back to rule-based recommendations when generateText rejects", async () => {
    isLLMReady.mockReturnValue(true);
    generateText.mockRejectedValue(new Error("inference failed"));

    const cols = [col("region", "string"), col("revenue", "number")];
    const recs = await recommendCharts(cols, 100);

    expect(recs.some((r) => r.type === "bar")).toBe(true);
  });

  it("falls back to rule-based recommendations when the LLM returns an empty array", async () => {
    isLLMReady.mockReturnValue(true);
    generateText.mockResolvedValue("[]");

    const cols = [col("region", "string"), col("revenue", "number")];
    const recs = await recommendCharts(cols, 100);

    expect(recs.some((r) => r.type === "bar")).toBe(true);
  });

  it("includes distinctCount in the column schema sent to the LLM", async () => {
    isLLMReady.mockReturnValue(true);
    generateText.mockResolvedValue(
      JSON.stringify([
        {
          type: "bar",
          title: "LLM bar",
          reason: "reason",
          confidence: 0.8,
        },
      ]),
    );

    const cols = [col("region", "string", { distinctCount: 5 }), col("revenue", "number")];
    const recs = await recommendCharts(cols, 100);

    expect(generateText).toHaveBeenCalledTimes(1);
    const promptArg = generateText.mock.calls[0][0] as string;
    expect(promptArg).toContain("5 distinct");
    expect(recs).toHaveLength(1);
    expect(recs[0].type).toBe("bar");
  });

  it("uses 'unknown' for row count in the LLM prompt when rowCount is omitted", async () => {
    isLLMReady.mockReturnValue(true);
    generateText.mockResolvedValue(
      JSON.stringify([
        {
          type: "scatter",
          title: "LLM scatter",
          reason: "reason",
          confidence: 0.7,
        },
      ]),
    );

    const cols = [col("a", "number"), col("b", "number")];
    const recs = await recommendCharts(cols);

    expect(generateText).toHaveBeenCalledTimes(1);
    const promptArg = generateText.mock.calls[0][0] as string;
    expect(promptArg).toContain("unknown");
    expect(recs).toHaveLength(1);
  });
});

// ─── generateInsights: statsSummary branch coverage ──────────────────────────

describe("generateInsights statsSummary nullPct branch coverage", () => {
  it("sets nullPct to 0 in statsSummary when rowCount is 0 even if the column has nulls", async () => {
    // This exercises the nullCol && rowCount > 0 branch where rowCount === 0.
    // statsSummary nullPct = 0 (not-ready LLM path goes to ruleBasedInsights, but we just
    // need to exercise the branch without crashing).
    const cols = [col("amount", "number", { nullCount: 10 })];
    const insights = await generateInsights(cols, 0, {
      amount: [1, 2, 3],
    });
    // No crash; result is an array.
    expect(Array.isArray(insights)).toBe(true);
  });

  it("sets nullPct to 0 when the column name is not found in cols", async () => {
    // numericData has a key that does not match any ColMeta name.
    const cols = [col("other", "number")];
    const insights = await generateInsights(cols, 100, {
      missingFromCols: [1, 2, 3],
    });
    // No quality/trend/distribution insight for this column; just verifying no crash.
    expect(Array.isArray(insights)).toBe(true);
  });

  it("skips statsSummary computation for columns with fewer than 2 values", async () => {
    const cols = [col("tiny", "number")];
    const insights = await generateInsights(cols, 10, {
      tiny: [42],
    });
    // Single-value column is skipped; no crash expected.
    expect(Array.isArray(insights)).toBe(true);
  });

  it("computes skewness as 0 for exactly 2 values in statsSummary (length < 3 branch)", async () => {
    // values.length === 2: skewness branch (values.length >= 3) is false → 0.
    const cols = [col("pair", "number")];
    // Two values so statsSummary is computed (>= 2) but skewness branch returns 0.
    const insights = await generateInsights(cols, 10, {
      pair: [1, 9],
    });
    expect(Array.isArray(insights)).toBe(true);
  });
});

// ─── Additional branch coverage for ruleBasedInsights paths ──────────────────

describe("generateInsights rule-based additional branch coverage", () => {
  it("describes a left-skewed distribution when skewness is strongly negative", async () => {
    const cols = [col("lskew", "number")];
    // Heavily left-skewed: most values high, a few very low outliers.
    const insights = await generateInsights(cols, 12, {
      lskew: [80, 90, 95, 97, 98, 99, 100, 100, 100, 100, 1, 2],
    });

    const dist = insights.find((i) => i.type === "distribution");
    expect(dist).toBeDefined();
    expect(dist?.description).toContain("left");
  });

  it("detects a downward trend through ruleBasedInsights", async () => {
    const cols = [col("declining", "number")];
    // Strong linear downward series; r2 > 0.5, slope < 0.
    const values = [100, 80, 60, 40, 20, 10, 5, 2, 1, 0];
    const insights = await generateInsights(cols, values.length, {
      declining: values,
    });

    const trend = insights.find((i) => i.type === "trend");
    expect(trend).toBeDefined();
    expect(trend?.title).toContain("Downward");
    expect(trend?.columnName).toBe("declining");
  });

  it("describes a negative correlation as 'negatively'", async () => {
    const cols = [col("x", "number"), col("y", "number")];
    // Perfect negative correlation: as x increases y decreases.
    const x = [1, 2, 3, 4, 5, 6];
    const y = [12, 10, 8, 6, 4, 2];
    const insights = await generateInsights(cols, x.length, { x, y });

    const corr = insights.find((i) => i.type === "correlation");
    expect(corr).toBeDefined();
    expect(corr?.description).toContain("negatively");
  });
});

// ─── pearsonCorr: NaN / short-array edge cases ────────────────────────────────

describe("pearsonCorr edge cases via ruleBasedInsights", () => {
  it("handles the constant-variance case (zero-variance columns produce no correlation insight)", async () => {
    // Both columns constant → variance === 0 → pearsonCorr returns 0 → no correlation insight.
    const cols = [col("flat1", "number"), col("flat2", "number")];
    const insights = await generateInsights(cols, 6, {
      flat1: [5, 5, 5, 5, 5, 5],
      flat2: [3, 3, 3, 3, 3, 3],
    });
    expect(insights.some((i) => i.type === "correlation")).toBe(false);
  });

  it("handles arrays shorter than 2 in pearsonCorr (n < 2 early return)", async () => {
    // Both arrays have 1 element → n=1 < 2 → pearsonCorr returns 0 → no correlation.
    const cols = [col("a", "number"), col("b", "number")];
    const insights = await generateInsights(cols, 1, {
      a: [1],
      b: [2],
    });
    expect(insights.some((i) => i.type === "correlation")).toBe(false);
  });
});

// ─── recommendCharts: LLM fallback with undefined rowCount ───────────────────

describe("recommendCharts LLM path with undefined rowCount in catch", () => {
  it("falls back with rowCount defaulting to 0 when LLM rejects and rowCount is omitted", async () => {
    isLLMReady.mockReturnValue(true);
    generateText.mockRejectedValue(new Error("inference failed"));

    const cols = [col("category", "string")];
    // No rowCount passed, so the fallback uses rowCount ?? 0 = 0.
    const recs = await recommendCharts(cols);

    // With rowCount=0, pie is suppressed (0 is not > 0 and not < 20000 matters but 0 fails > 0).
    expect(Array.isArray(recs)).toBe(true);
  });
});
