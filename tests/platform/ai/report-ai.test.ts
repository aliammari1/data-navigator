import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mock the LLM boundary ────────────────────────────────────────────────────
// generateReportSummary / askReportQuestion delegate to the on-device LLM when
// ready. Keep it "not ready" by default so the rule-based fallback paths execute,
// and flip it on only for tests that exercise the LLM branch.
const isLLMReady = vi.fn<() => boolean>(() => false);
const generateText = vi.fn<(prompt: string, opts?: unknown) => Promise<string>>(async () => "");

vi.mock("@/platform/ai/llm-engine", () => ({
  isLLMReady: () => isLLMReady(),
  generateText: (prompt: string, opts?: unknown) => generateText(prompt, opts),
}));

import {
  askReportQuestion,
  generateReportSummary,
} from "@/platform/ai/report-ai";
import type { ChannelStat, StatusSummary } from "@/platform/ai/report-ai";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeStatus(overrides: Partial<StatusSummary> = {}): StatusSummary {
  return {
    reussie: 800,
    annulation: 50,
    instance: 30,
    echec: 120,
    total: 1000,
    ...overrides,
  };
}

function makeChannels(n = 3): ChannelStat[] {
  return Array.from({ length: n }, (_, i) => ({
    canal: `Channel${i + 1}`,
    nombre: (n - i) * 100,
    montant: (n - i) * 50000,
  }));
}

beforeEach(() => {
  isLLMReady.mockReturnValue(false);
  generateText.mockReset();
  generateText.mockResolvedValue("");
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── generateReportSummary: rule-based path ───────────────────────────────────

describe("generateReportSummary — rule-based fallback (LLM not ready)", () => {
  it("returns a narrative mentioning the total transaction count", async () => {
    // Arrange
    const status = makeStatus({ total: 500, reussie: 400, echec: 100, annulation: 0, instance: 0 });

    // Act
    const result = await generateReportSummary(status, makeChannels(2));

    // Assert
    expect(result.narrative).toContain("500");
    expect(result.narrative).toContain("400");
  });

  it("includes the date label in the narrative when date is provided", async () => {
    // Arrange
    const status = makeStatus();

    // Act
    const result = await generateReportSummary(status, makeChannels(), "2024-01-15");

    // Assert
    expect(result.narrative).toContain("2024-01-15");
  });

  it("omits the date label when date is not provided", async () => {
    // Arrange
    const status = makeStatus();

    // Act
    const result = await generateReportSummary(status, makeChannels());

    // Assert — no " on " substring when date is absent
    expect(result.narrative).not.toContain(" on ");
  });

  it("returns the top 3 channels from the supplied channel list", async () => {
    // Arrange
    const channels = makeChannels(5);

    // Act
    const result = await generateReportSummary(makeStatus(), channels);

    // Assert
    expect(result.topChannels).toHaveLength(3);
    expect(result.topChannels[0]).toBe("Channel1");
    expect(result.topChannels[1]).toBe("Channel2");
    expect(result.topChannels[2]).toBe("Channel3");
  });

  it("handles fewer than 3 channels gracefully", async () => {
    // Arrange
    const channels = makeChannels(1);

    // Act
    const result = await generateReportSummary(makeStatus(), channels);

    // Assert
    expect(result.topChannels).toHaveLength(1);
  });

  it("handles an empty channel list", async () => {
    // Act
    const result = await generateReportSummary(makeStatus(), []);

    // Assert
    expect(result.topChannels).toEqual([]);
  });

  it("flags a high failure rate when echec/total exceeds 10%", async () => {
    // Arrange: 15% failure rate triggers the high-failure flag
    const status = makeStatus({ total: 100, echec: 15, reussie: 85, annulation: 0, instance: 0 });

    // Act
    const result = await generateReportSummary(status, []);

    // Assert
    const failFlag = result.flags.find((f) => f.includes("failure rate"));
    expect(failFlag).toBeDefined();
    expect(failFlag).toContain("15.0%");
  });

  it("does not flag failure rate when echec/total is at or below 10%", async () => {
    // Arrange: exactly 10% failure — threshold is >0.1, so 10% should NOT flag
    const status = makeStatus({ total: 100, echec: 10, reussie: 90, annulation: 0, instance: 0 });

    // Act
    const result = await generateReportSummary(status, []);

    // Assert
    expect(result.flags.some((f) => f.includes("failure rate"))).toBe(false);
  });

  it("flags in-progress transactions when instance/total exceeds 5%", async () => {
    // Arrange: 10% in-progress
    const status = makeStatus({ total: 100, instance: 10, echec: 5, reussie: 85, annulation: 0 });

    // Act
    const result = await generateReportSummary(status, []);

    // Assert
    const instanceFlag = result.flags.find((f) => f.includes("in-progress"));
    expect(instanceFlag).toBeDefined();
    expect(instanceFlag).toContain("10.0%");
  });

  it("does not flag in-progress when instance/total is at or below 5%", async () => {
    // Arrange: exactly 5% — threshold is >0.05, so 5% should NOT flag
    const status = makeStatus({ total: 100, instance: 5, echec: 5, reussie: 90, annulation: 0 });

    // Act
    const result = await generateReportSummary(status, []);

    // Assert
    expect(result.flags.some((f) => f.includes("in-progress"))).toBe(false);
  });

  it("flags channel concentration when top channel exceeds 60% of transactions", async () => {
    // Arrange: Channel1 has 700 out of 1000 (70%)
    const channels: ChannelStat[] = [
      { canal: "MobileApp", nombre: 700, montant: 1000000 },
      { canal: "Web", nombre: 300, montant: 500000 },
    ];
    const status = makeStatus({ total: 1000 });

    // Act
    const result = await generateReportSummary(status, channels);

    // Assert
    const concentrationFlag = result.flags.find((f) => f.includes("MobileApp"));
    expect(concentrationFlag).toBeDefined();
    expect(concentrationFlag).toContain("70%");
  });

  it("does not flag channel concentration when top channel is at or below 60%", async () => {
    // Arrange: top channel has exactly 600/1000 = 60% — threshold is >60 so 60% should NOT flag
    const channels: ChannelStat[] = [
      { canal: "MobileApp", nombre: 600, montant: 500000 },
    ];
    const status = makeStatus({ total: 1000 });

    // Act
    const result = await generateReportSummary(status, channels);

    // Assert
    expect(result.flags.some((f) => f.includes("MobileApp"))).toBe(false);
  });

  it("sets the escalation recommendation when failure rate exceeds 15%", async () => {
    // Arrange: 20% failure rate
    const status = makeStatus({ total: 100, echec: 20, reussie: 80, annulation: 0, instance: 0 });

    // Act
    const result = await generateReportSummary(status, []);

    // Assert
    expect(result.recommendation).toContain("Escalate");
  });

  it("sets the reconciliation recommendation when in-progress rate exceeds 5% (but failure ≤15%)", async () => {
    // Arrange: 8% in-progress, 5% failure (under 15% escalation threshold)
    const status = makeStatus({ total: 100, instance: 8, echec: 5, reussie: 87, annulation: 0 });

    // Act
    const result = await generateReportSummary(status, []);

    // Assert
    expect(result.recommendation).toContain("reconciliation");
  });

  it("uses the default review recommendation when rates are within normal bounds", async () => {
    // Arrange: 5% failure, 2% in-progress — both below thresholds
    const status = makeStatus({ total: 100, echec: 5, instance: 2, reussie: 93, annulation: 0 });

    // Act
    const result = await generateReportSummary(status, []);

    // Assert
    expect(result.recommendation).toContain("Review declined transactions");
  });

  it("handles zero total without division-by-zero errors", async () => {
    // Arrange
    const status = makeStatus({ total: 0, reussie: 0, echec: 0, annulation: 0, instance: 0 });

    // Act + Assert: should not throw
    const result = await generateReportSummary(status, []);
    expect(result.narrative).toContain("0");
    expect(result.narrative).toContain("0.0%");
  });

  it("returns a ReportSummary shape with all required fields", async () => {
    // Act
    const result = await generateReportSummary(makeStatus(), makeChannels());

    // Assert shape
    expect(typeof result.narrative).toBe("string");
    expect(Array.isArray(result.topChannels)).toBe(true);
    expect(Array.isArray(result.flags)).toBe(true);
    expect(typeof result.recommendation).toBe("string");
  });
});

// ─── generateReportSummary: LLM path ─────────────────────────────────────────

describe("generateReportSummary — LLM path", () => {
  it("returns parsed LLM summary when the model is ready and replies with valid JSON", async () => {
    // Arrange
    isLLMReady.mockReturnValue(true);
    const llmResponse = JSON.stringify({
      narrative: "LLM narrative here.",
      topChannels: ["Alpha", "Beta", "Gamma"],
      flags: ["some flag"],
      recommendation: "LLM recommendation.",
    });
    generateText.mockResolvedValue(`${llmResponse}`);

    // Act
    const result = await generateReportSummary(makeStatus(), makeChannels(), "2024-01-15");

    // Assert
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(result.narrative).toBe("LLM narrative here.");
    expect(result.topChannels).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(result.flags).toEqual(["some flag"]);
    expect(result.recommendation).toBe("LLM recommendation.");
  });

  it("extracts JSON embedded in prose from the LLM response", async () => {
    // Arrange
    isLLMReady.mockReturnValue(true);
    generateText.mockResolvedValue(
      'Here is the analysis: {"narrative":"Embedded narrative.","topChannels":["X"],"flags":[],"recommendation":"Do X."} Done.',
    );

    // Act
    const result = await generateReportSummary(makeStatus(), makeChannels());

    // Assert
    expect(result.narrative).toBe("Embedded narrative.");
    expect(result.topChannels).toEqual(["X"]);
  });

  it("caps topChannels at 3 when LLM returns more than 3", async () => {
    // Arrange
    isLLMReady.mockReturnValue(true);
    generateText.mockResolvedValue(
      JSON.stringify({
        narrative: "narrative",
        topChannels: ["A", "B", "C", "D", "E"],
        flags: [],
        recommendation: "rec",
      }),
    );

    // Act
    const result = await generateReportSummary(makeStatus(), makeChannels());

    // Assert
    expect(result.topChannels).toHaveLength(3);
  });

  it("caps flags at 3 when LLM returns more than 3", async () => {
    // Arrange
    isLLMReady.mockReturnValue(true);
    generateText.mockResolvedValue(
      JSON.stringify({
        narrative: "narrative",
        topChannels: ["A"],
        flags: ["f1", "f2", "f3", "f4"],
        recommendation: "rec",
      }),
    );

    // Act
    const result = await generateReportSummary(makeStatus(), makeChannels());

    // Assert
    expect(result.flags).toHaveLength(3);
  });

  it("falls back to rule-based topChannels when LLM returns non-array topChannels", async () => {
    // Arrange
    isLLMReady.mockReturnValue(true);
    generateText.mockResolvedValue(
      JSON.stringify({
        narrative: "narrative",
        topChannels: "not an array",
        flags: [],
        recommendation: "rec",
      }),
    );
    const channels = makeChannels(3);

    // Act
    const result = await generateReportSummary(makeStatus(), channels);

    // Assert: falls back to rule-based channels
    expect(result.topChannels).toEqual(["Channel1", "Channel2", "Channel3"]);
  });

  it("falls back to rule-based flags when LLM returns non-array flags", async () => {
    // Arrange: 15% failure rate so rule-based would produce a flag
    isLLMReady.mockReturnValue(true);
    generateText.mockResolvedValue(
      JSON.stringify({
        narrative: "narrative",
        topChannels: ["A"],
        flags: "not an array",
        recommendation: "rec",
      }),
    );
    const status = makeStatus({ total: 100, echec: 15, reussie: 85, annulation: 0, instance: 0 });

    // Act
    const result = await generateReportSummary(status, []);

    // Assert: falls back to rule-based flags (has failure-rate flag)
    expect(result.flags.some((f) => f.includes("failure rate"))).toBe(true);
  });

  it("uses fallback recommendation when LLM omits recommendation field", async () => {
    // Arrange
    isLLMReady.mockReturnValue(true);
    generateText.mockResolvedValue(
      JSON.stringify({
        narrative: "narrative",
        topChannels: ["A"],
        flags: [],
        // recommendation intentionally absent
      }),
    );

    // Act
    const result = await generateReportSummary(makeStatus(), makeChannels());

    // Assert: falls back to rule-based recommendation
    expect(typeof result.recommendation).toBe("string");
    expect(result.recommendation.length).toBeGreaterThan(0);
  });

  it("falls back to rule-based summary when LLM response has no JSON object", async () => {
    // Arrange
    isLLMReady.mockReturnValue(true);
    generateText.mockResolvedValue("the model produced only prose, no JSON here");

    // Act
    const result = await generateReportSummary(makeStatus(), makeChannels());

    // Assert: rule-based narrative contains total count
    expect(result.narrative).toContain("1,000");
  });

  it("falls back to rule-based summary when JSON is missing narrative field", async () => {
    // Arrange
    isLLMReady.mockReturnValue(true);
    generateText.mockResolvedValue(
      JSON.stringify({
        topChannels: ["A"],
        flags: [],
        recommendation: "rec",
        // narrative intentionally absent
      }),
    );

    // Act
    const result = await generateReportSummary(makeStatus(), makeChannels());

    // Assert: rule-based fallback
    expect(result.narrative).toContain("1,000");
  });

  it("falls back to rule-based summary when JSON is malformed", async () => {
    // Arrange
    isLLMReady.mockReturnValue(true);
    generateText.mockResolvedValue("{broken json{{");

    // Act
    const result = await generateReportSummary(makeStatus(), makeChannels());

    // Assert: rule-based fallback
    expect(result.narrative).toContain("1,000");
  });

  it("falls back to rule-based summary when generateText rejects", async () => {
    // Arrange
    isLLMReady.mockReturnValue(true);
    generateText.mockRejectedValue(new Error("inference failed"));

    // Act
    const result = await generateReportSummary(makeStatus(), makeChannels());

    // Assert: rule-based fallback is returned without throwing
    expect(result.narrative).toContain("1,000");
  });

  it("includes date in user prompt when date is provided", async () => {
    // Arrange
    isLLMReady.mockReturnValue(true);
    generateText.mockResolvedValue(
      JSON.stringify({
        narrative: "n",
        topChannels: ["A"],
        flags: [],
        recommendation: "r",
      }),
    );

    // Act
    await generateReportSummary(makeStatus(), makeChannels(), "2024-06-01");

    // Assert: the user prompt passed to generateText contains the date
    const calledPrompt = generateText.mock.calls[0][0] as string;
    expect(calledPrompt).toContain("2024-06-01");
  });

  it("uses 'today' in user prompt when date is not provided", async () => {
    // Arrange
    isLLMReady.mockReturnValue(true);
    generateText.mockResolvedValue(
      JSON.stringify({
        narrative: "n",
        topChannels: ["A"],
        flags: [],
        recommendation: "r",
      }),
    );

    // Act
    await generateReportSummary(makeStatus(), makeChannels());

    // Assert
    const calledPrompt = generateText.mock.calls[0][0] as string;
    expect(calledPrompt).toContain("today");
  });

  it("passes maxTokens=500 and temperature=0.3 to generateText", async () => {
    // Arrange
    isLLMReady.mockReturnValue(true);
    generateText.mockResolvedValue(
      JSON.stringify({ narrative: "n", topChannels: [], flags: [], recommendation: "r" }),
    );

    // Act
    await generateReportSummary(makeStatus(), makeChannels());

    // Assert
    const opts = generateText.mock.calls[0][1] as Record<string, unknown>;
    expect(opts.maxTokens).toBe(500);
    expect(opts.temperature).toBe(0.3);
  });

  it("includes channel stats in the user prompt (up to 5 channels)", async () => {
    // Arrange
    isLLMReady.mockReturnValue(true);
    generateText.mockResolvedValue(
      JSON.stringify({ narrative: "n", topChannels: [], flags: [], recommendation: "r" }),
    );
    const channels = makeChannels(5);

    // Act
    await generateReportSummary(makeStatus(), channels);

    // Assert: prompt contains the channel names
    const calledPrompt = generateText.mock.calls[0][0] as string;
    expect(calledPrompt).toContain("Channel1");
    expect(calledPrompt).toContain("Channel5");
  });

  it("uses '0' success rate in prompt when total is 0", async () => {
    // Arrange
    isLLMReady.mockReturnValue(true);
    generateText.mockResolvedValue(
      JSON.stringify({ narrative: "n", topChannels: [], flags: [], recommendation: "r" }),
    );
    const status = makeStatus({ total: 0, reussie: 0, echec: 0, annulation: 0, instance: 0 });

    // Act
    await generateReportSummary(status, []);

    // Assert: prompt should contain "0%" for the success rate
    const calledPrompt = generateText.mock.calls[0][0] as string;
    expect(calledPrompt).toContain("(0%)");
  });
});

// ─── askReportQuestion: rule-based fallback ───────────────────────────────────

describe("askReportQuestion — rule-based fallback (LLM not ready)", () => {
  it("returns fallback SQL selecting from the table when LLM is not ready", async () => {
    // Act
    const result = await askReportQuestion("show me all rows", "transactions", ["id", "amount"]);

    // Assert
    expect(result.sql).toBe('SELECT * FROM "transactions" LIMIT 100');
  });

  it("returns a fallback explanation when LLM is not ready", async () => {
    // Act
    const result = await askReportQuestion("anything", "t", ["col"]);

    // Assert
    expect(result.explanation).toContain("Could not generate");
  });

  it("uses the supplied table name in the fallback SQL", async () => {
    // Act
    const result = await askReportQuestion("q", "my_table", []);

    // Assert
    expect(result.sql).toContain('"my_table"');
  });
});

// ─── askReportQuestion: LLM path ─────────────────────────────────────────────

describe("askReportQuestion — LLM path", () => {
  it("returns parsed SQL and explanation when LLM replies with valid JSON", async () => {
    // Arrange
    isLLMReady.mockReturnValue(true);
    generateText.mockResolvedValue(
      JSON.stringify({
        sql: 'SELECT "CHANNEL", COUNT(*) FROM "transactions" GROUP BY "CHANNEL" LIMIT 1000',
        explanation: "Groups rows by channel.",
      }),
    );

    // Act
    const result = await askReportQuestion(
      "how many transactions per channel?",
      "transactions",
      ["CHANNEL", "TRANSACTION_ID"],
    );

    // Assert
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(result.sql).toContain("GROUP BY");
    expect(result.explanation).toContain("Groups rows");
  });

  it("extracts JSON embedded in prose from the LLM response", async () => {
    // Arrange
    isLLMReady.mockReturnValue(true);
    generateText.mockResolvedValue(
      'Here is the SQL: {"sql":"SELECT 1 LIMIT 1000","explanation":"Simple."} End.',
    );

    // Act
    const result = await askReportQuestion("q", "t", ["c"]);

    // Assert
    expect(result.sql).toBe("SELECT 1 LIMIT 1000");
    expect(result.explanation).toBe("Simple.");
  });

  it("appends LIMIT 1000 when the LLM-generated SQL does not include LIMIT", async () => {
    // Arrange
    isLLMReady.mockReturnValue(true);
    generateText.mockResolvedValue(
      JSON.stringify({
        sql: 'SELECT * FROM "transactions"',
        explanation: "All rows.",
      }),
    );

    // Act
    const result = await askReportQuestion("show all", "transactions", ["id"]);

    // Assert: LIMIT appended
    expect(result.sql).toMatch(/LIMIT 1000$/i);
    expect(result.sql).not.toMatch(/;$/);
  });

  it("does not duplicate LIMIT when the LLM SQL already includes one", async () => {
    // Arrange
    isLLMReady.mockReturnValue(true);
    generateText.mockResolvedValue(
      JSON.stringify({
        sql: 'SELECT * FROM "transactions" LIMIT 500',
        explanation: "Limited.",
      }),
    );

    // Act
    const result = await askReportQuestion("show first 500", "transactions", ["id"]);

    // Assert: no double LIMIT
    const limitCount = (result.sql.match(/LIMIT/gi) ?? []).length;
    expect(limitCount).toBe(1);
  });

  it("strips a trailing semicolon from the SQL", async () => {
    // Arrange
    isLLMReady.mockReturnValue(true);
    generateText.mockResolvedValue(
      JSON.stringify({
        sql: 'SELECT 1 LIMIT 1000;',
        explanation: "Semicolon test.",
      }),
    );

    // Act
    const result = await askReportQuestion("q", "t", ["c"]);

    // Assert: no trailing semicolon
    expect(result.sql.trim().endsWith(";")).toBe(false);
  });

  it("falls back to the default SELECT when LLM response has no JSON", async () => {
    // Arrange
    isLLMReady.mockReturnValue(true);
    generateText.mockResolvedValue("no json here");

    // Act
    const result = await askReportQuestion("q", "sales", ["id"]);

    // Assert
    expect(result.sql).toBe('SELECT * FROM "sales" LIMIT 100');
  });

  it("falls back to the default SELECT when JSON is missing the sql field", async () => {
    // Arrange
    isLLMReady.mockReturnValue(true);
    generateText.mockResolvedValue(
      JSON.stringify({ explanation: "no sql field" }),
    );

    // Act
    const result = await askReportQuestion("q", "sales", ["id"]);

    // Assert
    expect(result.sql).toBe('SELECT * FROM "sales" LIMIT 100');
  });

  it("falls back to the default SELECT when JSON is malformed", async () => {
    // Arrange
    isLLMReady.mockReturnValue(true);
    generateText.mockResolvedValue("{bad json{{{");

    // Act
    const result = await askReportQuestion("q", "sales", ["id"]);

    // Assert
    expect(result.sql).toBe('SELECT * FROM "sales" LIMIT 100');
  });

  it("falls back to the default SELECT when generateText rejects", async () => {
    // Arrange
    isLLMReady.mockReturnValue(true);
    generateText.mockRejectedValue(new Error("inference failed"));

    // Act
    const result = await askReportQuestion("q", "sales", ["id"]);

    // Assert: no throw, fallback returned
    expect(result.sql).toBe('SELECT * FROM "sales" LIMIT 100');
  });

  it("includes the table name and question in the user prompt", async () => {
    // Arrange
    isLLMReady.mockReturnValue(true);
    generateText.mockResolvedValue(
      JSON.stringify({ sql: "SELECT 1 LIMIT 1000", explanation: "e" }),
    );

    // Act
    await askReportQuestion("what is the total?", "my_sales", ["AMOUNT", "DATE"]);

    // Assert
    const calledPrompt = generateText.mock.calls[0][0] as string;
    expect(calledPrompt).toContain("my_sales");
    expect(calledPrompt).toContain("what is the total?");
    expect(calledPrompt).toContain("AMOUNT");
    expect(calledPrompt).toContain("DATE");
  });

  it("passes maxTokens=400 and temperature=0.2 to generateText", async () => {
    // Arrange
    isLLMReady.mockReturnValue(true);
    generateText.mockResolvedValue(
      JSON.stringify({ sql: "SELECT 1 LIMIT 1000", explanation: "e" }),
    );

    // Act
    await askReportQuestion("q", "t", ["c"]);

    // Assert
    const opts = generateText.mock.calls[0][1] as Record<string, unknown>;
    expect(opts.maxTokens).toBe(400);
    expect(opts.temperature).toBe(0.2);
  });

  it("uses empty string for explanation when LLM omits the field", async () => {
    // Arrange
    isLLMReady.mockReturnValue(true);
    generateText.mockResolvedValue(
      JSON.stringify({ sql: "SELECT 1 LIMIT 1000" }),
    );

    // Act
    const result = await askReportQuestion("q", "t", ["c"]);

    // Assert: explanation defaults to ""
    expect(result.explanation).toBe("");
  });
});

// ─── Type exports ─────────────────────────────────────────────────────────────

describe("exported types", () => {
  it("ReportSummary conforms to the expected shape", () => {
    // This is a compile-time check; at runtime we verify the shape of a real value.
    const summary: import("@/platform/ai/report-ai").ReportSummary = {
      narrative: "n",
      topChannels: ["A"],
      flags: ["f"],
      recommendation: "r",
    };
    expect(summary.narrative).toBe("n");
    expect(summary.topChannels).toEqual(["A"]);
    expect(summary.flags).toEqual(["f"]);
    expect(summary.recommendation).toBe("r");
  });

  it("StatusSummary conforms to the expected shape", () => {
    const s: StatusSummary = {
      reussie: 1,
      annulation: 2,
      instance: 3,
      echec: 4,
      total: 10,
    };
    expect(s.total).toBe(10);
  });

  it("ChannelStat conforms to the expected shape", () => {
    const c: ChannelStat = { canal: "SMS", nombre: 500, montant: 25000 };
    expect(c.canal).toBe("SMS");
    expect(c.nombre).toBe(500);
    expect(c.montant).toBe(25000);
  });
});
