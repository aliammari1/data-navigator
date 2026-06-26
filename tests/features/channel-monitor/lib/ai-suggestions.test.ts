import { describe, it, expect } from "vitest";
import {
  ThresholdSuggestionSchema,
  buildSuggestionPrompt,
} from "@/features/channel-monitor/lib/ai-suggestions";
import type { ChannelStatus } from "@/features/channel-monitor/store/monitor-store";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeChannelStatus(overrides: Partial<ChannelStatus> = {}): ChannelStatus {
  return {
    channel: "mobile",
    displayName: "Mobile Money",
    health: "healthy",
    successRate: 97.5,
    txnPerMin: 100,
    amountToday: 50000,
    failureCount: 12,
    trend: "stable",
    lastIncident: null,
    lastIncidentAt: null,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─── ThresholdSuggestionSchema ────────────────────────────────────────────────

describe("ThresholdSuggestionSchema", () => {
  it("accepts a valid suggestion object", () => {
    const result = ThresholdSuggestionSchema.safeParse({
      successRateBelow: 90,
      volumeAbove: 15000,
      failuresAbove: 500,
      rationale: "Based on historical averages",
    });
    expect(result.success).toBe(true);
  });

  it("accepts boundary values: successRateBelow=0 and successRateBelow=100", () => {
    expect(
      ThresholdSuggestionSchema.safeParse({
        successRateBelow: 0,
        volumeAbove: 0,
        failuresAbove: 0,
        rationale: "Floor values",
      }).success,
    ).toBe(true);

    expect(
      ThresholdSuggestionSchema.safeParse({
        successRateBelow: 100,
        volumeAbove: 99999,
        failuresAbove: 9999,
        rationale: "Ceiling values test",
      }).success,
    ).toBe(true);
  });

  it("rejects successRateBelow below 0", () => {
    const result = ThresholdSuggestionSchema.safeParse({
      successRateBelow: -1,
      volumeAbove: 100,
      failuresAbove: 10,
      rationale: "Invalid negative",
    });
    expect(result.success).toBe(false);
  });

  it("rejects successRateBelow above 100", () => {
    const result = ThresholdSuggestionSchema.safeParse({
      successRateBelow: 101,
      volumeAbove: 100,
      failuresAbove: 10,
      rationale: "Above max value",
    });
    expect(result.success).toBe(false);
  });

  it("rejects volumeAbove below 0", () => {
    const result = ThresholdSuggestionSchema.safeParse({
      successRateBelow: 90,
      volumeAbove: -1,
      failuresAbove: 10,
      rationale: "Negative volume",
    });
    expect(result.success).toBe(false);
  });

  it("rejects failuresAbove below 0", () => {
    const result = ThresholdSuggestionSchema.safeParse({
      successRateBelow: 90,
      volumeAbove: 100,
      failuresAbove: -1,
      rationale: "Negative failures",
    });
    expect(result.success).toBe(false);
  });

  it("rejects rationale shorter than 4 characters", () => {
    const result = ThresholdSuggestionSchema.safeParse({
      successRateBelow: 90,
      volumeAbove: 100,
      failuresAbove: 10,
      rationale: "hi",
    });
    expect(result.success).toBe(false);
  });

  it("rejects rationale longer than 600 characters", () => {
    const result = ThresholdSuggestionSchema.safeParse({
      successRateBelow: 90,
      volumeAbove: 100,
      failuresAbove: 10,
      rationale: "x".repeat(601),
    });
    expect(result.success).toBe(false);
  });

  it("rejects object missing required fields", () => {
    const result = ThresholdSuggestionSchema.safeParse({
      successRateBelow: 90,
    });
    expect(result.success).toBe(false);
  });
});

// ─── buildSuggestionPrompt — empty statuses branch ───────────────────────────

describe("buildSuggestionPrompt — empty statuses", () => {
  it("returns the no-metrics placeholder when statuses is empty", () => {
    // Arrange
    const statuses: ChannelStatus[] = [];

    // Act
    const { system, prompt } = buildSuggestionPrompt(statuses);

    // Assert
    expect(prompt).toContain("(no live channel metrics available)");
  });

  it("includes the telecom-analyst system message regardless of input", () => {
    const { system } = buildSuggestionPrompt([]);
    expect(system).toContain("telecom channel-monitoring analyst");
  });

  it("still includes the global threshold instruction in the prompt", () => {
    const { prompt } = buildSuggestionPrompt([]);
    expect(prompt).toContain("global alert thresholds");
  });
});

// ─── buildSuggestionPrompt — non-empty statuses branch ───────────────────────

describe("buildSuggestionPrompt — with channel statuses", () => {
  it("includes the displayName in the prompt", () => {
    // Arrange
    const statuses = [makeChannelStatus({ displayName: "Mobile Money" })];

    // Act
    const { prompt } = buildSuggestionPrompt(statuses);

    // Assert
    expect(prompt).toContain("Mobile Money");
  });

  it("formats successRate with one decimal place", () => {
    const statuses = [makeChannelStatus({ successRate: 97.5, txnPerMin: 10, failureCount: 5 })];
    const { prompt } = buildSuggestionPrompt(statuses);
    expect(prompt).toContain("97.5%");
  });

  it("converts txnPerMin to hourly volume (×60) and rounds it", () => {
    // 100 tx/min × 60 = 6000/h
    const statuses = [makeChannelStatus({ txnPerMin: 100, successRate: 99, failureCount: 0 })];
    const { prompt } = buildSuggestionPrompt(statuses);
    expect(prompt).toContain("6000/h");
  });

  it("includes the failureCount per hour", () => {
    const statuses = [makeChannelStatus({ failureCount: 42 })];
    const { prompt } = buildSuggestionPrompt(statuses);
    expect(prompt).toContain("42 failures/h");
  });

  it("handles multiple channels, each on its own line", () => {
    const statuses = [
      makeChannelStatus({ displayName: "Channel A", successRate: 90, txnPerMin: 50, failureCount: 10 }),
      makeChannelStatus({ displayName: "Channel B", successRate: 95, txnPerMin: 200, failureCount: 5 }),
    ];
    const { prompt } = buildSuggestionPrompt(statuses);
    expect(prompt).toContain("Channel A");
    expect(prompt).toContain("Channel B");
    // Two channel lines means a newline between them
    const lines = prompt.split("\n").filter((l) => l.includes("failures/h"));
    expect(lines).toHaveLength(2);
  });

  it("slices to a maximum of 12 channels even when more are supplied", () => {
    const statuses = Array.from({ length: 15 }, (_, i) =>
      makeChannelStatus({ displayName: `Channel ${i + 1}` }),
    );
    const { prompt } = buildSuggestionPrompt(statuses);
    // Channel 13 and beyond must NOT appear
    expect(prompt).not.toContain("Channel 13");
    expect(prompt).not.toContain("Channel 14");
    expect(prompt).not.toContain("Channel 15");
    // But Channel 12 should be present
    expect(prompt).toContain("Channel 12");
  });

  it("does not use the no-metrics placeholder when statuses are provided", () => {
    const statuses = [makeChannelStatus()];
    const { prompt } = buildSuggestionPrompt(statuses);
    expect(prompt).not.toContain("(no live channel metrics available)");
  });

  it("includes the ONLY-JSON instruction in the system message", () => {
    const { system } = buildSuggestionPrompt([makeChannelStatus()]);
    expect(system).toContain("Respond ONLY with the requested JSON object");
  });

  it("handles txnPerMin values that produce a fractional hourly volume by rounding", () => {
    // 3.7 × 60 = 222 (rounds to 222)
    const statuses = [makeChannelStatus({ txnPerMin: 3.7, successRate: 98, failureCount: 1 })];
    const { prompt } = buildSuggestionPrompt(statuses);
    expect(prompt).toContain("222/h");
  });

  it("handles exactly 12 channels without truncation", () => {
    const statuses = Array.from({ length: 12 }, (_, i) =>
      makeChannelStatus({ displayName: `Ch ${i + 1}` }),
    );
    const { prompt } = buildSuggestionPrompt(statuses);
    expect(prompt).toContain("Ch 12");
    const lines = prompt.split("\n").filter((l) => l.includes("failures/h"));
    expect(lines).toHaveLength(12);
  });
});
