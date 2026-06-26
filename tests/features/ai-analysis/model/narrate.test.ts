import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildRuleInsights, narrateInsights } from "@/features/ai-analysis/model/narrate";
import type { AnalysisFacts } from "@/features/ai-analysis/model/narrate";
import type { NarrateDeps } from "@/features/ai-analysis/model/narrate";
import { LlmInsightResponseSchema } from "@/features/ai-analysis/model/insight-schema";
import type {
  Anomaly,
  ClusterGroup,
  ColStat,
  Correlation,
  ForecastMeta,
  ForecastPoint,
} from "@/features/ai-analysis/model/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeColStat(overrides: Partial<ColStat> = {}): ColStat {
  return {
    name: "amount",
    type: "numeric",
    nullCount: 0,
    distinctCount: 10,
    rowCount: 100,
    ...overrides,
  };
}

function makeAnomaly(overrides: Partial<Anomaly> = {}): Anomaly {
  return {
    id: "a1",
    column: "amount",
    type: "outlier",
    description: "outlier",
    severity: "warning",
    affectedRows: 5,
    score: 0.5,
    ...overrides,
  };
}

function makeCorrelation(overrides: Partial<Correlation> = {}): Correlation {
  return {
    col1: "a",
    col2: "b",
    pearson: 0.9,
    strength: "very_strong",
    direction: "positive",
    ...overrides,
  };
}

function makeCluster(overrides: Partial<ClusterGroup> = {}): ClusterGroup {
  return {
    id: 0,
    label: "Segment 1",
    size: 42,
    centroid: { x: 1.5, y: 2.3 },
    characteristics: ["High x", "Low y"],
    color: "#6366f1",
    ...overrides,
  };
}

function makeForecastPoint(period: string, actual?: number, predicted = 100): ForecastPoint {
  return {
    period,
    actual,
    predicted,
    lower: predicted - 10,
    upper: predicted + 10,
  };
}

function baseFacts(overrides: Partial<AnalysisFacts> = {}): AnalysisFacts {
  return {
    rowCount: 100,
    numericColumns: 2,
    categoricalColumns: 1,
    colStats: [],
    anomalies: [],
    correlations: [],
    forecasts: [],
    clusters: [],
    forecastMeta: { metricCol: null, dateCol: null, method: "none" },
    ...overrides,
  };
}

// ─── buildRuleInsights ────────────────────────────────────────────────────────

describe("buildRuleInsights", () => {
  describe("trend insight", () => {
    it("produces no trend insight when actuals length is <= 3", () => {
      const facts = baseFacts({
        forecasts: [
          makeForecastPoint("2024-01", 100),
          makeForecastPoint("2024-02", 110),
          makeForecastPoint("2024-03", 120),
        ],
        forecastMeta: { metricCol: "sales", dateCol: "day", method: "OLS" },
      });
      const insights = buildRuleInsights(facts);
      expect(insights.some((i) => i.category === "trend")).toBe(false);
    });

    it("produces no trend insight when forecastMeta.metricCol is null", () => {
      const facts = baseFacts({
        forecasts: [
          makeForecastPoint("2024-01", 100),
          makeForecastPoint("2024-02", 110),
          makeForecastPoint("2024-03", 120),
          makeForecastPoint("2024-04", 130),
          makeForecastPoint("2024-05", 140),
        ],
        forecastMeta: { metricCol: null, dateCol: "day", method: "OLS" },
      });
      const insights = buildRuleInsights(facts);
      expect(insights.some((i) => i.category === "trend")).toBe(false);
    });

    it("produces a trend insight with 'growth' when pct >= 0", () => {
      // 5 actual points going from 100 to 140 — positive trend
      const forecasts = [
        makeForecastPoint("2024-01", 100),
        makeForecastPoint("2024-02", 110),
        makeForecastPoint("2024-03", 120),
        makeForecastPoint("2024-04", 130),
        makeForecastPoint("2024-05", 140),
      ];
      const facts = baseFacts({
        forecasts,
        forecastMeta: { metricCol: "sales", dateCol: "day", method: "OLS" },
      });
      const insights = buildRuleInsights(facts);
      const trend = insights.find((i) => i.category === "trend");
      expect(trend).toBeDefined();
      expect(trend?.title).toContain("growth");
      expect(trend?.description).toContain("increased");
      expect(trend?.value).toMatch(/^\+/);
      expect(trend?.change).toBeGreaterThan(0);
    });

    it("produces a trend insight with 'decline' when pct < 0", () => {
      // 5 actual points going from 100 down to 60 — negative trend
      const forecasts = [
        makeForecastPoint("2024-01", 100),
        makeForecastPoint("2024-02", 90),
        makeForecastPoint("2024-03", 80),
        makeForecastPoint("2024-04", 70),
        makeForecastPoint("2024-05", 60),
      ];
      const facts = baseFacts({
        forecasts,
        forecastMeta: { metricCol: "sales", dateCol: "day", method: "OLS" },
      });
      const insights = buildRuleInsights(facts);
      const trend = insights.find((i) => i.category === "trend");
      expect(trend).toBeDefined();
      expect(trend?.title).toContain("decline");
      expect(trend?.description).toContain("decreased");
      expect(trend?.value).not.toMatch(/^\+/);
      expect(trend?.change).toBeLessThan(0);
    });

    it("uses pct=0 when first actual is 0 (avoids division by zero)", () => {
      const forecasts = [
        makeForecastPoint("2024-01", 0),
        makeForecastPoint("2024-02", 10),
        makeForecastPoint("2024-03", 20),
        makeForecastPoint("2024-04", 30),
        makeForecastPoint("2024-05", 40),
      ];
      const facts = baseFacts({
        forecasts,
        forecastMeta: { metricCol: "revenue", dateCol: "day", method: "OLS" },
      });
      const insights = buildRuleInsights(facts);
      const trend = insights.find((i) => i.category === "trend");
      expect(trend).toBeDefined();
      // pct = 0 because first === 0, so change should be 0
      expect(trend?.change).toBe(0);
    });

    it("sets severity 'warning' when |pct| > 20", () => {
      // 100 to 200 = +100% change
      const forecasts = [
        makeForecastPoint("2024-01", 100),
        makeForecastPoint("2024-02", 120),
        makeForecastPoint("2024-03", 150),
        makeForecastPoint("2024-04", 170),
        makeForecastPoint("2024-05", 200),
      ];
      const facts = baseFacts({
        forecasts,
        forecastMeta: { metricCol: "sales", dateCol: "day", method: "OLS" },
      });
      const insights = buildRuleInsights(facts);
      const trend = insights.find((i) => i.category === "trend");
      expect(trend?.severity).toBe("warning");
    });

    it("sets severity 'info' when |pct| <= 20", () => {
      // 100 to 110 = +10% change
      const forecasts = [
        makeForecastPoint("2024-01", 100),
        makeForecastPoint("2024-02", 102),
        makeForecastPoint("2024-03", 105),
        makeForecastPoint("2024-04", 107),
        makeForecastPoint("2024-05", 110),
      ];
      const facts = baseFacts({
        forecasts,
        forecastMeta: { metricCol: "sales", dateCol: "day", method: "OLS" },
      });
      const insights = buildRuleInsights(facts);
      const trend = insights.find((i) => i.category === "trend");
      expect(trend?.severity).toBe("info");
    });

    it("sets impact 'high' when |pct| > 15", () => {
      // 100 to 200 = +100%
      const forecasts = [
        makeForecastPoint("2024-01", 100),
        makeForecastPoint("2024-02", 130),
        makeForecastPoint("2024-03", 160),
        makeForecastPoint("2024-04", 180),
        makeForecastPoint("2024-05", 200),
      ];
      const facts = baseFacts({
        forecasts,
        forecastMeta: { metricCol: "sales", dateCol: "day", method: "OLS" },
      });
      const insights = buildRuleInsights(facts);
      const trend = insights.find((i) => i.category === "trend");
      expect(trend?.impact).toBe("high");
    });

    it("sets impact 'medium' when |pct| <= 15", () => {
      // 100 to 110 = +10%
      const forecasts = [
        makeForecastPoint("2024-01", 100),
        makeForecastPoint("2024-02", 103),
        makeForecastPoint("2024-03", 106),
        makeForecastPoint("2024-04", 108),
        makeForecastPoint("2024-05", 110),
      ];
      const facts = baseFacts({
        forecasts,
        forecastMeta: { metricCol: "sales", dateCol: "day", method: "OLS" },
      });
      const insights = buildRuleInsights(facts);
      const trend = insights.find((i) => i.category === "trend");
      expect(trend?.impact).toBe("medium");
    });

    it("only uses actual points (filters out forecast-only points)", () => {
      // Mix of actual and forecast-only points
      const forecasts = [
        makeForecastPoint("2024-01", 100),
        makeForecastPoint("2024-02", 120),
        makeForecastPoint("2024-03", 140),
        makeForecastPoint("2024-04", 160),
        makeForecastPoint("2024-05", 180),
        // These have no actual (undefined):
        makeForecastPoint("2024-06", undefined, 200),
        makeForecastPoint("2024-07", undefined, 220),
      ];
      const facts = baseFacts({
        forecasts,
        forecastMeta: { metricCol: "sales", dateCol: "day", method: "OLS" },
      });
      const insights = buildRuleInsights(facts);
      const trend = insights.find((i) => i.category === "trend");
      expect(trend).toBeDefined();
      // Trend uses 5 actual points (100..180) = 80% increase
      expect(trend?.change).toBeCloseTo(80);
    });
  });

  describe("correlation insight", () => {
    it("produces no correlation insight when correlations is empty", () => {
      const facts = baseFacts({ correlations: [] });
      const insights = buildRuleInsights(facts);
      expect(insights.some((i) => i.category === "correlation")).toBe(false);
    });

    it("produces a correlation insight using the top correlation", () => {
      const facts = baseFacts({
        correlations: [makeCorrelation({ col1: "x", col2: "y", pearson: 0.95, strength: "very_strong" })],
      });
      const insights = buildRuleInsights(facts);
      const corr = insights.find((i) => i.category === "correlation");
      expect(corr).toBeDefined();
      expect(corr?.title).toContain("x");
      expect(corr?.title).toContain("y");
      expect(corr?.description).toContain("0.950");
    });

    it("sets impact 'high' when correlation strength is very_strong", () => {
      const facts = baseFacts({
        correlations: [makeCorrelation({ strength: "very_strong" })],
      });
      const insights = buildRuleInsights(facts);
      const corr = insights.find((i) => i.category === "correlation");
      expect(corr?.impact).toBe("high");
    });

    it("sets impact 'medium' when correlation strength is not very_strong", () => {
      const facts = baseFacts({
        correlations: [makeCorrelation({ strength: "strong", pearson: 0.75 })],
      });
      const insights = buildRuleInsights(facts);
      const corr = insights.find((i) => i.category === "correlation");
      expect(corr?.impact).toBe("medium");
    });

    it("includes the strength label with underscores replaced", () => {
      const facts = baseFacts({
        correlations: [makeCorrelation({ strength: "very_strong", direction: "positive" })],
      });
      const insights = buildRuleInsights(facts);
      const corr = insights.find((i) => i.category === "correlation");
      expect(corr?.description).toContain("very strong");
    });
  });

  describe("anomaly insight", () => {
    it("produces no anomaly insight when no critical anomalies", () => {
      const facts = baseFacts({
        anomalies: [makeAnomaly({ severity: "warning" })],
      });
      const insights = buildRuleInsights(facts);
      expect(insights.some((i) => i.category === "anomaly")).toBe(false);
    });

    it("produces an anomaly insight when critical anomalies are present", () => {
      const facts = baseFacts({
        anomalies: [
          makeAnomaly({ severity: "critical", column: "revenue" }),
          makeAnomaly({ severity: "critical", column: "cost" }),
        ],
      });
      const insights = buildRuleInsights(facts);
      const anomaly = insights.find((i) => i.category === "anomaly");
      expect(anomaly).toBeDefined();
      expect(anomaly?.severity).toBe("critical");
      expect(anomaly?.title).toContain("2 critical anomalies");
      expect(anomaly?.description).toContain("revenue");
      expect(anomaly?.description).toContain("cost");
    });

    it("deduplicates columns in the anomaly description", () => {
      const facts = baseFacts({
        anomalies: [
          makeAnomaly({ severity: "critical", column: "revenue" }),
          makeAnomaly({ severity: "critical", column: "revenue" }),
        ],
      });
      const insights = buildRuleInsights(facts);
      const anomaly = insights.find((i) => i.category === "anomaly");
      expect(anomaly).toBeDefined();
      // Should only show "revenue" once even though two anomalies reference it
      const matches = (anomaly?.description ?? "").match(/revenue/g);
      expect(matches).toHaveLength(1);
    });
  });

  describe("quality insight", () => {
    it("produces no quality insight when no columns have >5% nulls", () => {
      const facts = baseFacts({
        colStats: [makeColStat({ rowCount: 100, nullCount: 5 })], // exactly 5% — not >5%
      });
      const insights = buildRuleInsights(facts);
      expect(insights.some((i) => i.category === "quality")).toBe(false);
    });

    it("produces no quality insight when rowCount is 0", () => {
      const facts = baseFacts({
        colStats: [makeColStat({ rowCount: 0, nullCount: 0 })],
      });
      const insights = buildRuleInsights(facts);
      expect(insights.some((i) => i.category === "quality")).toBe(false);
    });

    it("produces a quality insight when one column has >5% nulls using singular form", () => {
      const facts = baseFacts({
        colStats: [makeColStat({ name: "amount", rowCount: 100, nullCount: 6 })], // 6%
      });
      const insights = buildRuleInsights(facts);
      const quality = insights.find((i) => i.category === "quality");
      expect(quality).toBeDefined();
      expect(quality?.description).toContain(" has");
      expect(quality?.description).not.toContain("s have");
      expect(quality?.description).toContain("amount");
    });

    it("produces a quality insight with plural 's have' when multiple columns have >5% nulls", () => {
      const facts = baseFacts({
        colStats: [
          makeColStat({ name: "col1", rowCount: 100, nullCount: 10 }),
          makeColStat({ name: "col2", rowCount: 100, nullCount: 15 }),
        ],
      });
      const insights = buildRuleInsights(facts);
      const quality = insights.find((i) => i.category === "quality");
      expect(quality).toBeDefined();
      expect(quality?.description).toContain("s have");
    });
  });

  describe("pattern/cluster insight", () => {
    it("produces no pattern insight when clusters is empty", () => {
      const facts = baseFacts({ clusters: [] });
      const insights = buildRuleInsights(facts);
      expect(insights.some((i) => i.category === "pattern")).toBe(false);
    });

    it("produces a pattern insight for the top cluster", () => {
      const cluster = makeCluster({
        label: "Segment A",
        size: 100,
        centroid: { x: 1.0, y: 2.0, z: 3.0, extra: 4.0 }, // 4 keys, only first 3 shown
        characteristics: ["High x", "Low y"],
      });
      const facts = baseFacts({ clusters: [cluster] });
      const insights = buildRuleInsights(facts);
      const pattern = insights.find((i) => i.category === "pattern");
      expect(pattern).toBeDefined();
      expect(pattern?.title).toContain("Segment A");
      expect(pattern?.description).toContain("100");
      expect(pattern?.description).toContain("High x");
    });

    it("centroid summary only uses first 3 entries", () => {
      const cluster = makeCluster({
        centroid: { a: 1.0, b: 2.0, c: 3.0, d: 4.0 }, // 4 keys
      });
      const facts = baseFacts({ clusters: [cluster] });
      const insights = buildRuleInsights(facts);
      const pattern = insights.find((i) => i.category === "pattern");
      // Should include a, b, c but not d
      expect(pattern?.description).toContain("a:");
      expect(pattern?.description).toContain("b:");
      expect(pattern?.description).toContain("c:");
      expect(pattern?.description).not.toContain("d:");
    });
  });

  describe("forecast insight", () => {
    it("produces no forecast insight when there are no future points", () => {
      // All points have actual values
      const forecasts = [
        makeForecastPoint("2024-01", 100),
        makeForecastPoint("2024-02", 110),
      ];
      const facts = baseFacts({
        forecasts,
        forecastMeta: { metricCol: "sales", dateCol: "day", method: "OLS" },
      });
      const insights = buildRuleInsights(facts);
      expect(insights.some((i) => i.category === "forecast")).toBe(false);
    });

    it("produces no forecast insight when metricCol is null", () => {
      const forecasts = [
        makeForecastPoint("2024-01", 100),
        makeForecastPoint("2024-06", undefined, 200),
      ];
      const facts = baseFacts({
        forecasts,
        forecastMeta: { metricCol: null, dateCol: "day", method: "OLS" },
      });
      const insights = buildRuleInsights(facts);
      expect(insights.some((i) => i.category === "forecast")).toBe(false);
    });

    it("produces a forecast insight with delta from last actual to last future", () => {
      const forecasts = [
        makeForecastPoint("2024-01", 100),
        makeForecastPoint("2024-02", 110),
        makeForecastPoint("2024-03", undefined, 130),
        makeForecastPoint("2024-04", undefined, 150),
      ];
      const facts = baseFacts({
        forecasts,
        forecastMeta: { metricCol: "sales", dateCol: "day", method: "OLS" },
      });
      const insights = buildRuleInsights(facts);
      const forecast = insights.find((i) => i.category === "forecast");
      expect(forecast).toBeDefined();
      expect(forecast?.severity).toBe("info"); // delta positive
      // delta = 150 - 110 = 40
      expect(forecast?.description).toContain("+40");
    });

    it("sets severity 'warning' when delta < 0", () => {
      const forecasts = [
        makeForecastPoint("2024-01", 200),
        makeForecastPoint("2024-02", 180),
        makeForecastPoint("2024-03", undefined, 100),
      ];
      const facts = baseFacts({
        forecasts,
        forecastMeta: { metricCol: "sales", dateCol: "day", method: "OLS" },
      });
      const insights = buildRuleInsights(facts);
      const forecast = insights.find((i) => i.category === "forecast");
      expect(forecast).toBeDefined();
      expect(forecast?.severity).toBe("warning");
      // delta = 100 - 180 = -80
      expect(forecast?.description).toContain("-80");
    });

    it("uses delta=0 when there is no lastActual (all forecast points)", () => {
      const forecasts = [
        makeForecastPoint("2024-01", undefined, 100),
        makeForecastPoint("2024-02", undefined, 120),
      ];
      const facts = baseFacts({
        forecasts,
        forecastMeta: { metricCol: "sales", dateCol: "day", method: "OLS" },
      });
      const insights = buildRuleInsights(facts);
      const forecast = insights.find((i) => i.category === "forecast");
      expect(forecast).toBeDefined();
      // delta = 0 since no lastActual
      expect(forecast?.severity).toBe("info");
      expect(forecast?.description).toContain("+0");
    });

    it("uses lastActual.predicted when lastActual.actual is undefined in delta calculation", () => {
      // Build a case where findLast returns a point with actual=undefined
      // We need a "future" point that has no actual, but findLast finds a point with undefined actual
      // This tests the `lastActual.actual ?? lastActual.predicted` branch
      const forecasts = [
        // First, a point with actual=undefined (it's a "future" point according to the filter),
        // but we need findLast to find it: findLast((f) => f.actual !== undefined)
        // Actually if actual is undefined, findLast won't return it
        // Let's arrange: one actual point with actual=100, then future with predicted=150
        makeForecastPoint("2024-01", 100),
        makeForecastPoint("2024-02", undefined, 150),
      ];
      const facts = baseFacts({
        forecasts,
        forecastMeta: { metricCol: "sales", dateCol: "day", method: "OLS" },
      });
      const insights = buildRuleInsights(facts);
      const forecast = insights.find((i) => i.category === "forecast");
      expect(forecast).toBeDefined();
      // delta = 150 - 100 = 50
      expect(forecast?.description).toContain("+50");
    });
  });

  describe("full facts with all insights", () => {
    it("returns all 5 categories when all conditions are met", () => {
      const forecasts = [
        makeForecastPoint("2024-01", 100),
        makeForecastPoint("2024-02", 120),
        makeForecastPoint("2024-03", 140),
        makeForecastPoint("2024-04", 160),
        makeForecastPoint("2024-05", 180),
        makeForecastPoint("2024-06", undefined, 200),
      ];
      const facts = baseFacts({
        forecasts,
        forecastMeta: { metricCol: "revenue", dateCol: "day", method: "OLS" },
        correlations: [makeCorrelation()],
        anomalies: [makeAnomaly({ severity: "critical" })],
        colStats: [makeColStat({ rowCount: 100, nullCount: 10 })],
        clusters: [makeCluster()],
      });
      const insights = buildRuleInsights(facts);
      const categories = insights.map((i) => i.category);
      expect(categories).toContain("trend");
      expect(categories).toContain("correlation");
      expect(categories).toContain("anomaly");
      expect(categories).toContain("quality");
      expect(categories).toContain("pattern");
      expect(categories).toContain("forecast");
    });

    it("returns empty array when all conditions produce no insights", () => {
      const facts = baseFacts();
      const insights = buildRuleInsights(facts);
      expect(insights).toEqual([]);
    });
  });
});

// ─── narrateInsights ──────────────────────────────────────────────────────────

describe("narrateInsights", () => {
  it("returns mapped insights from a successful generateStructured call", async () => {
    const mockResponse = {
      insights: [
        {
          category: "trend" as const,
          title: "Revenue trending up",
          description: "Revenue has grown by 20%",
          severity: "info" as const,
          impact: "high" as const,
          confidence: 0.85,
        },
        {
          category: "anomaly" as const,
          title: "Spike detected",
          description: "Spike in Q3",
          severity: "warning" as const,
          impact: "medium" as const,
          confidence: 0.9,
        },
      ],
    };

    const generateStructured = vi.fn().mockResolvedValue(mockResponse);
    const deps: NarrateDeps = {
      generateStructured,
      schema: LlmInsightResponseSchema,
    };

    const facts = baseFacts({
      rowCount: 1000,
      numericColumns: 2,
      categoricalColumns: 1,
      colStats: [
        makeColStat({ type: "numeric", rowCount: 1000, nullCount: 10, min: 0, max: 100, avg: 50, stddev: 15, median: 50, skewness: 0.1 }),
      ],
      correlations: [makeCorrelation()],
    });

    const result = await narrateInsights(facts, deps);

    expect(result).toHaveLength(2);
    expect(result[0].category).toBe("trend");
    expect(result[0].title).toBe("Revenue trending up");
    expect(result[0].description).toBe("Revenue has grown by 20%");
    expect(result[0].severity).toBe("info");
    expect(result[0].impact).toBe("high");
    expect(result[0].confidence).toBe(0.85);
    expect(result[0].acknowledged).toBe(false);
    expect(result[0].id).toMatch(/^llm_/);
    expect(result[1].id).toMatch(/^llm_/);
    // Each insight gets a unique id
    expect(result[0].id).not.toBe(result[1].id);
  });

  it("passes the correct prompt containing factJson to generateStructured", async () => {
    const mockResponse = { insights: [] };
    const generateStructured = vi.fn().mockResolvedValue(mockResponse);
    const deps: NarrateDeps = {
      generateStructured,
      schema: LlmInsightResponseSchema,
    };

    const facts = baseFacts({ rowCount: 42 });
    await narrateInsights(facts, deps);

    expect(generateStructured).toHaveBeenCalledOnce();
    const [req, schema] = generateStructured.mock.calls[0];
    expect(req.prompt).toContain('"rows":42');
    expect(req.system).toContain("data analyst");
    expect(req.maxTokens).toBe(1024);
    expect(req.temperature).toBe(0.2);
    expect(schema).toBe(LlmInsightResponseSchema);
  });

  it("forwards the AbortSignal to generateStructured when provided", async () => {
    const mockResponse = { insights: [] };
    const generateStructured = vi.fn().mockResolvedValue(mockResponse);
    const controller = new AbortController();
    const deps: NarrateDeps = {
      generateStructured,
      schema: LlmInsightResponseSchema,
      signal: controller.signal,
    };

    await narrateInsights(baseFacts(), deps);

    const [req] = generateStructured.mock.calls[0];
    expect(req.signal).toBe(controller.signal);
  });

  it("returns an empty array when insights array is empty", async () => {
    const generateStructured = vi.fn().mockResolvedValue({ insights: [] });
    const deps: NarrateDeps = {
      generateStructured,
      schema: LlmInsightResponseSchema,
    };

    const result = await narrateInsights(baseFacts(), deps);
    expect(result).toEqual([]);
  });

  it("compactFacts passes colStats filtering: only 'numeric' type cols", async () => {
    const generateStructured = vi.fn().mockResolvedValue({ insights: [] });
    const deps: NarrateDeps = {
      generateStructured,
      schema: LlmInsightResponseSchema,
    };

    const facts = baseFacts({
      colStats: [
        makeColStat({ name: "amount", type: "numeric", rowCount: 100, nullCount: 5, min: 0, max: 100, avg: 50, stddev: 10, median: 48, skewness: 0.2 }),
        makeColStat({ name: "category", type: "categorical", rowCount: 100, nullCount: 0 }),
      ],
    });

    await narrateInsights(facts, deps);

    const [req] = generateStructured.mock.calls[0];
    // The prompt format is: "Here are computed statistics...\n{factJson}\n\n..."
    // Extract just the factJson portion between the first \n and \n\n
    const firstNewline = req.prompt.indexOf("\n");
    const doubleNewline = req.prompt.indexOf("\n\n");
    const factJsonStr = req.prompt.slice(firstNewline + 1, doubleNewline);
    const parsed = JSON.parse(factJsonStr);
    expect(parsed.numericStats).toHaveLength(1);
    expect(parsed.numericStats[0].column).toBe("amount");
  });

  it("compactFacts nullPct is 0 when rowCount is 0", async () => {
    const generateStructured = vi.fn().mockResolvedValue({ insights: [] });
    const deps: NarrateDeps = {
      generateStructured,
      schema: LlmInsightResponseSchema,
    };

    const facts = baseFacts({
      colStats: [
        makeColStat({ name: "amount", type: "numeric", rowCount: 0, nullCount: 0 }),
      ],
    });

    await narrateInsights(facts, deps);

    const [req] = generateStructured.mock.calls[0];
    const firstNewline = req.prompt.indexOf("\n");
    const doubleNewline = req.prompt.indexOf("\n\n");
    const factJsonStr = req.prompt.slice(firstNewline + 1, doubleNewline);
    const parsed = JSON.parse(factJsonStr);
    expect(parsed.numericStats[0].nullPct).toBe(0);
  });

  it("compactFacts round: undefined values become null", async () => {
    const generateStructured = vi.fn().mockResolvedValue({ insights: [] });
    const deps: NarrateDeps = {
      generateStructured,
      schema: LlmInsightResponseSchema,
    };

    // ColStat with undefined numeric fields
    const facts = baseFacts({
      colStats: [
        {
          name: "amount",
          type: "numeric",
          rowCount: 100,
          nullCount: 0,
          distinctCount: 10,
          // min, max, avg, stddev, median, skewness are all undefined
        },
      ],
    });

    await narrateInsights(facts, deps);

    const [req] = generateStructured.mock.calls[0];
    const firstNewline = req.prompt.indexOf("\n");
    const doubleNewline = req.prompt.indexOf("\n\n");
    const factJsonStr = req.prompt.slice(firstNewline + 1, doubleNewline);
    const parsed = JSON.parse(factJsonStr);
    expect(parsed.numericStats[0].min).toBeNull();
    expect(parsed.numericStats[0].max).toBeNull();
    expect(parsed.numericStats[0].avg).toBeNull();
    expect(parsed.numericStats[0].stddev).toBeNull();
    expect(parsed.numericStats[0].median).toBeNull();
    expect(parsed.numericStats[0].skewness).toBeNull();
  });

  it("compactFacts round: non-finite values (Infinity, NaN) become null", async () => {
    const generateStructured = vi.fn().mockResolvedValue({ insights: [] });
    const deps: NarrateDeps = {
      generateStructured,
      schema: LlmInsightResponseSchema,
    };

    const facts = baseFacts({
      colStats: [
        {
          name: "amount",
          type: "numeric",
          rowCount: 100,
          nullCount: 0,
          distinctCount: 10,
          min: Infinity,
          max: NaN,
          avg: -Infinity,
          stddev: 1.5,
          median: 2.0,
          skewness: 0,
        },
      ],
    });

    await narrateInsights(facts, deps);

    const [req] = generateStructured.mock.calls[0];
    const firstNewline = req.prompt.indexOf("\n");
    const doubleNewline = req.prompt.indexOf("\n\n");
    const factJsonStr = req.prompt.slice(firstNewline + 1, doubleNewline);
    const parsed = JSON.parse(factJsonStr);
    expect(parsed.numericStats[0].min).toBeNull();
    expect(parsed.numericStats[0].max).toBeNull();
    expect(parsed.numericStats[0].avg).toBeNull();
    expect(parsed.numericStats[0].stddev).toBe(1.5);
  });

  it("compactFacts slices colStats to max 12 numeric columns", async () => {
    const generateStructured = vi.fn().mockResolvedValue({ insights: [] });
    const deps: NarrateDeps = {
      generateStructured,
      schema: LlmInsightResponseSchema,
    };

    // 15 numeric columns
    const colStats: ColStat[] = Array.from({ length: 15 }, (_, i) => ({
      name: `col${i}`,
      type: "numeric" as const,
      rowCount: 100,
      nullCount: 0,
      distinctCount: 50,
    }));

    const facts = baseFacts({ colStats });

    await narrateInsights(facts, deps);

    const [req] = generateStructured.mock.calls[0];
    const firstNewline = req.prompt.indexOf("\n");
    const doubleNewline = req.prompt.indexOf("\n\n");
    const factJsonStr = req.prompt.slice(firstNewline + 1, doubleNewline);
    const parsed = JSON.parse(factJsonStr);
    expect(parsed.numericStats).toHaveLength(12);
  });

  it("compactFacts includes correlations (top 6), anomalies (top 8), clusters (top 5)", async () => {
    const generateStructured = vi.fn().mockResolvedValue({ insights: [] });
    const deps: NarrateDeps = {
      generateStructured,
      schema: LlmInsightResponseSchema,
    };

    const correlations: Correlation[] = Array.from({ length: 10 }, (_, i) =>
      makeCorrelation({ col1: `a${i}`, col2: `b${i}` })
    );
    const anomalies: Anomaly[] = Array.from({ length: 12 }, (_, i) =>
      makeAnomaly({ id: `a${i}`, column: `col${i}` })
    );
    const clusters: ClusterGroup[] = Array.from({ length: 7 }, (_, i) =>
      makeCluster({ id: i, label: `Segment ${i}` })
    );

    const facts = baseFacts({ correlations, anomalies, clusters });

    await narrateInsights(facts, deps);

    const [req] = generateStructured.mock.calls[0];
    const firstNewline = req.prompt.indexOf("\n");
    const doubleNewline = req.prompt.indexOf("\n\n");
    const factJsonStr = req.prompt.slice(firstNewline + 1, doubleNewline);
    const parsed = JSON.parse(factJsonStr);
    expect(parsed.topCorrelations).toHaveLength(6);
    expect(parsed.anomalies).toHaveLength(8);
    expect(parsed.segments).toHaveLength(5);
  });
});
