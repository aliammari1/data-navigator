import { describe, expect, it } from "vitest";
import { buildGeoInsightPrompt, GeoInsightSchema } from "@/features/geo-analysis/lib/ai-insights";
import type { GeoRegion, UseGeoDataResult } from "@/features/geo-analysis/hooks/use-geo-data";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRegion(
  name: string,
  transactions: number,
  revenue: number,
  successRate: number,
  rank: number,
): GeoRegion {
  return { name, transactions, revenue, successRate, rank, lat: null, lon: null };
}

function makeDominantChannel(
  region: string,
  channel: string,
  pct: number,
  channelIndex = 0,
): UseGeoDataResult["dominantChannels"][0] {
  return { region, channel, pct, channelIndex };
}

// ─── GeoInsightSchema ─────────────────────────────────────────────────────────

describe("GeoInsightSchema", () => {
  it("accepts a valid complete insight object", () => {
    const valid = {
      headline: "Regional performance looks good overall",
      topRegions: [
        { region: "North", note: "Highest volume and revenue in Q1" },
        { region: "South", note: "Best success rate across all regions" },
      ],
      riskRegions: [{ region: "East", reason: "Below-average success rate detected" }],
      channelObservation: "Mobile channel dominates in urban areas while SMS leads rural zones",
      recommendation: "Investigate low success rates in the East region immediately",
    };

    const result = GeoInsightSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("accepts an object with empty arrays for topRegions and riskRegions", () => {
    const minimal = {
      headline: "No significant findings",
      topRegions: [],
      riskRegions: [],
      channelObservation: "Channel distribution is uniform",
      recommendation: "Maintain current operational strategy",
    };

    const result = GeoInsightSchema.safeParse(minimal);
    expect(result.success).toBe(true);
  });

  it("rejects headline shorter than 4 characters", () => {
    const invalid = {
      headline: "Hi",
      topRegions: [],
      riskRegions: [],
      channelObservation: "Some observation here about channels",
      recommendation: "Some concrete recommendation here",
    };

    const result = GeoInsightSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects headline longer than 160 characters", () => {
    const invalid = {
      headline: "A".repeat(161),
      topRegions: [],
      riskRegions: [],
      channelObservation: "Some observation here about channels",
      recommendation: "Some concrete recommendation here",
    };

    const result = GeoInsightSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects topRegions with more than 4 items", () => {
    const invalid = {
      headline: "Too many top regions listed",
      topRegions: [
        { region: "R1", note: "Note one here" },
        { region: "R2", note: "Note two here" },
        { region: "R3", note: "Note three here" },
        { region: "R4", note: "Note four here" },
        { region: "R5", note: "Note five here" },
      ],
      riskRegions: [],
      channelObservation: "Some channel observation text",
      recommendation: "Some recommendation text here",
    };

    const result = GeoInsightSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects riskRegions with more than 4 items", () => {
    const invalid = {
      headline: "Too many risk regions",
      topRegions: [],
      riskRegions: [
        { region: "R1", reason: "Risk reason one" },
        { region: "R2", reason: "Risk reason two" },
        { region: "R3", reason: "Risk reason three" },
        { region: "R4", reason: "Risk reason four" },
        { region: "R5", reason: "Risk reason five" },
      ],
      channelObservation: "Some channel observation text",
      recommendation: "Some recommendation text here",
    };

    const result = GeoInsightSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects a topRegion note shorter than 4 characters", () => {
    const invalid = {
      headline: "Some valid headline text",
      topRegions: [{ region: "North", note: "Hi" }],
      riskRegions: [],
      channelObservation: "Some observation text here",
      recommendation: "Some recommendation here",
    };

    const result = GeoInsightSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects a riskRegion reason shorter than 4 characters", () => {
    const invalid = {
      headline: "Some valid headline text",
      topRegions: [],
      riskRegions: [{ region: "East", reason: "Bad" }],
      channelObservation: "Some observation text here",
      recommendation: "Some recommendation here",
    };

    const result = GeoInsightSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects channelObservation shorter than 4 characters", () => {
    const invalid = {
      headline: "Some valid headline text",
      topRegions: [],
      riskRegions: [],
      channelObservation: "No",
      recommendation: "Some recommendation here",
    };

    const result = GeoInsightSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects recommendation shorter than 4 characters", () => {
    const invalid = {
      headline: "Some valid headline text",
      topRegions: [],
      riskRegions: [],
      channelObservation: "Some observation here",
      recommendation: "No",
    };

    const result = GeoInsightSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects channelObservation longer than 400 characters", () => {
    const invalid = {
      headline: "Some valid headline text",
      topRegions: [],
      riskRegions: [],
      channelObservation: "A".repeat(401),
      recommendation: "Some recommendation here",
    };

    const result = GeoInsightSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects recommendation longer than 400 characters", () => {
    const invalid = {
      headline: "Some valid headline text",
      topRegions: [],
      riskRegions: [],
      channelObservation: "Some observation text here",
      recommendation: "A".repeat(401),
    };

    const result = GeoInsightSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("accepts exactly 4 topRegions (boundary)", () => {
    const valid = {
      headline: "Four top regions test case",
      topRegions: [
        { region: "R1", note: "Note for region one" },
        { region: "R2", note: "Note for region two" },
        { region: "R3", note: "Note for region three" },
        { region: "R4", note: "Note for region four" },
      ],
      riskRegions: [],
      channelObservation: "Some channel observation text",
      recommendation: "Some recommendation text here",
    };

    const result = GeoInsightSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("accepts exactly 4 riskRegions (boundary)", () => {
    const valid = {
      headline: "Four risk regions test case",
      topRegions: [],
      riskRegions: [
        { region: "R1", reason: "Risk one reason" },
        { region: "R2", reason: "Risk two reason" },
        { region: "R3", reason: "Risk three reason" },
        { region: "R4", reason: "Risk four reason" },
      ],
      channelObservation: "Some channel observation text",
      recommendation: "Some recommendation text here",
    };

    const result = GeoInsightSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });
});

// ─── buildGeoInsightPrompt ────────────────────────────────────────────────────

describe("buildGeoInsightPrompt — system message", () => {
  it("always includes the telecom analyst role description", () => {
    const { system } = buildGeoInsightPrompt({
      datasetName: "test",
      regions: [],
      totalTransactions: 0,
      avgSuccessRate: 0,
      dominantChannels: [],
      anomalousRegions: [],
    });

    expect(system).toContain("telecom regional-performance analyst");
    expect(system).toContain("JSON");
  });
});

describe("buildGeoInsightPrompt — regions branch", () => {
  it("includes per-region metrics when regions array is non-empty", () => {
    const regions = [
      makeRegion("North", 1000, 500000, 95, 1),
      makeRegion("South", 800, 400000, 88, 2),
    ];

    const { prompt } = buildGeoInsightPrompt({
      datasetName: "my-dataset",
      regions,
      totalTransactions: 1800,
      avgSuccessRate: 91.5,
      dominantChannels: [],
      anomalousRegions: [],
    });

    expect(prompt).toContain("North");
    expect(prompt).toContain("South");
    expect(prompt).toContain("rank #1");
    expect(prompt).toContain("rank #2");
    expect(prompt).not.toContain("(no region metrics available)");
  });

  it("falls back to '(no region metrics available)' when regions is empty", () => {
    const { prompt } = buildGeoInsightPrompt({
      datasetName: "my-dataset",
      regions: [],
      totalTransactions: 0,
      avgSuccessRate: 0,
      dominantChannels: [],
      anomalousRegions: [],
    });

    expect(prompt).toContain("(no region metrics available)");
  });

  it("slices regions to at most 12 when more are provided", () => {
    const regions = Array.from({ length: 15 }, (_, i) =>
      makeRegion(`Region${i + 1}`, (15 - i) * 100, (15 - i) * 50000, 90, i + 1),
    );

    const { prompt } = buildGeoInsightPrompt({
      datasetName: "large-dataset",
      regions,
      totalTransactions: 15000,
      avgSuccessRate: 90,
      dominantChannels: [],
      anomalousRegions: [],
    });

    // Region1 through Region12 should appear; Region13-15 should not
    expect(prompt).toContain("Region1");
    expect(prompt).toContain("Region12");
    expect(prompt).not.toContain("Region13");
    expect(prompt).not.toContain("Region14");
    expect(prompt).not.toContain("Region15");
  });

  it("includes exactly 12 regions when 12 are provided (boundary)", () => {
    const regions = Array.from({ length: 12 }, (_, i) =>
      makeRegion(`R${i + 1}`, 100, 50000, 90, i + 1),
    );

    const { prompt } = buildGeoInsightPrompt({
      datasetName: "dataset",
      regions,
      totalTransactions: 1200,
      avgSuccessRate: 90,
      dominantChannels: [],
      anomalousRegions: [],
    });

    expect(prompt).toContain("R1");
    expect(prompt).toContain("R12");
  });
});

describe("buildGeoInsightPrompt — dominantChannels branch", () => {
  it("includes channel mix information when dominantChannels is non-empty", () => {
    const dominantChannels = [
      makeDominantChannel("North", "Mobile", 65),
      makeDominantChannel("South", "SMS", 72),
    ];

    const { prompt } = buildGeoInsightPrompt({
      datasetName: "dataset",
      regions: [],
      totalTransactions: 0,
      avgSuccessRate: 0,
      dominantChannels,
      anomalousRegions: [],
    });

    expect(prompt).toContain("North");
    expect(prompt).toContain("Mobile");
    expect(prompt).toContain("65%");
    expect(prompt).toContain("South");
    expect(prompt).toContain("SMS");
    expect(prompt).toContain("72%");
    expect(prompt).not.toContain("(no channel mix available)");
  });

  it("falls back to '(no channel mix available)' when dominantChannels is empty", () => {
    const { prompt } = buildGeoInsightPrompt({
      datasetName: "dataset",
      regions: [],
      totalTransactions: 0,
      avgSuccessRate: 0,
      dominantChannels: [],
      anomalousRegions: [],
    });

    expect(prompt).toContain("(no channel mix available)");
  });

  it("slices dominantChannels to at most 8 when more are provided", () => {
    const dominantChannels = Array.from({ length: 10 }, (_, i) =>
      makeDominantChannel(`Region${i + 1}`, "Mobile", 60 + i, i),
    );

    const { prompt } = buildGeoInsightPrompt({
      datasetName: "big-dataset",
      regions: [],
      totalTransactions: 0,
      avgSuccessRate: 0,
      dominantChannels,
      anomalousRegions: [],
    });

    expect(prompt).toContain("Region1");
    expect(prompt).toContain("Region8");
    expect(prompt).not.toContain("Region9");
    expect(prompt).not.toContain("Region10");
  });
});

describe("buildGeoInsightPrompt — anomalousRegions branch", () => {
  it("lists anomalous regions when anomalousRegions is non-empty", () => {
    const { prompt } = buildGeoInsightPrompt({
      datasetName: "dataset",
      regions: [],
      totalTransactions: 0,
      avgSuccessRate: 0,
      dominantChannels: [],
      anomalousRegions: ["East", "West"],
    });

    expect(prompt).toContain("Statistically anomalous success rates detected in: East, West.");
    expect(prompt).not.toContain("No statistically anomalous success rates detected.");
  });

  it("reports no anomalies when anomalousRegions is empty", () => {
    const { prompt } = buildGeoInsightPrompt({
      datasetName: "dataset",
      regions: [],
      totalTransactions: 0,
      avgSuccessRate: 0,
      dominantChannels: [],
      anomalousRegions: [],
    });

    expect(prompt).toContain("No statistically anomalous success rates detected.");
    expect(prompt).not.toContain("Statistically anomalous success rates detected in:");
  });

  it("lists multiple anomalous regions comma-separated", () => {
    const { prompt } = buildGeoInsightPrompt({
      datasetName: "dataset",
      regions: [],
      totalTransactions: 0,
      avgSuccessRate: 0,
      dominantChannels: [],
      anomalousRegions: ["Alpha", "Beta", "Gamma"],
    });

    expect(prompt).toContain("Alpha, Beta, Gamma");
  });
});

describe("buildGeoInsightPrompt — datasetName branch", () => {
  it("uses the provided dataset name in the prompt", () => {
    const { prompt } = buildGeoInsightPrompt({
      datasetName: "DailyTransactions_2026",
      regions: [],
      totalTransactions: 0,
      avgSuccessRate: 0,
      dominantChannels: [],
      anomalousRegions: [],
    });

    expect(prompt).toContain("Dataset: DailyTransactions_2026");
  });

  it("falls back to 'active dataset' when datasetName is null", () => {
    const { prompt } = buildGeoInsightPrompt({
      datasetName: null,
      regions: [],
      totalTransactions: 0,
      avgSuccessRate: 0,
      dominantChannels: [],
      anomalousRegions: [],
    });

    expect(prompt).toContain("Dataset: active dataset");
  });
});

describe("buildGeoInsightPrompt — totals formatting", () => {
  it("includes total transactions and weighted success rate in the prompt", () => {
    const { prompt } = buildGeoInsightPrompt({
      datasetName: "data",
      regions: [],
      totalTransactions: 5000,
      avgSuccessRate: 87.3,
      dominantChannels: [],
      anomalousRegions: [],
    });

    expect(prompt).toContain("Totals:");
    expect(prompt).toContain("transactions");
    expect(prompt).toContain("weighted success");
  });

  it("includes the summary instruction at the end of the prompt", () => {
    const { prompt } = buildGeoInsightPrompt({
      datasetName: null,
      regions: [],
      totalTransactions: 0,
      avgSuccessRate: 0,
      dominantChannels: [],
      anomalousRegions: [],
    });

    expect(prompt).toContain("Summarise the regional landscape");
    expect(prompt).toContain("headline");
    expect(prompt).toContain("standout regions");
    expect(prompt).toContain("regions that need attention");
    expect(prompt).toContain("channel-distribution observation");
    expect(prompt).toContain("concrete recommendation");
  });
});

describe("buildGeoInsightPrompt — region line formatting", () => {
  it("formats each region line with name, transactions, revenue, success rate and rank", () => {
    const regions = [makeRegion("Central", 2500, 1250000, 92.5, 1)];

    const { prompt } = buildGeoInsightPrompt({
      datasetName: "ds",
      regions,
      totalTransactions: 2500,
      avgSuccessRate: 92.5,
      dominantChannels: [],
      anomalousRegions: [],
    });

    expect(prompt).toContain("Central");
    expect(prompt).toContain("tx");
    expect(prompt).toContain("revenue");
    expect(prompt).toContain("success");
    expect(prompt).toContain("rank #1");
  });
});

describe("buildGeoInsightPrompt — channel percentage formatting", () => {
  it("formats channel percentage with toFixed(0) (no decimals)", () => {
    const dominantChannels = [makeDominantChannel("RegionA", "Web", 43.7)];

    const { prompt } = buildGeoInsightPrompt({
      datasetName: "ds",
      regions: [],
      totalTransactions: 0,
      avgSuccessRate: 0,
      dominantChannels,
      anomalousRegions: [],
    });

    // toFixed(0) on 43.7 gives "44"
    expect(prompt).toContain("44%");
    expect(prompt).toContain("RegionA");
    expect(prompt).toContain("Web");
  });
});

describe("buildGeoInsightPrompt — return shape", () => {
  it("returns an object with exactly 'system' and 'prompt' string keys", () => {
    const result = buildGeoInsightPrompt({
      datasetName: "test",
      regions: [],
      totalTransactions: 0,
      avgSuccessRate: 0,
      dominantChannels: [],
      anomalousRegions: [],
    });

    expect(typeof result.system).toBe("string");
    expect(typeof result.prompt).toBe("string");
    expect(Object.keys(result)).toEqual(["system", "prompt"]);
  });

  it("produces non-empty system and prompt strings", () => {
    const result = buildGeoInsightPrompt({
      datasetName: null,
      regions: [makeRegion("TestRegion", 100, 50000, 90, 1)],
      totalTransactions: 100,
      avgSuccessRate: 90,
      dominantChannels: [makeDominantChannel("TestRegion", "Mobile", 80)],
      anomalousRegions: ["TestRegion"],
    });

    expect(result.system.length).toBeGreaterThan(0);
    expect(result.prompt.length).toBeGreaterThan(0);
  });
});
