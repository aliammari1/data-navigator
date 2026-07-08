import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReportData, ReportNarrative } from "@/features/report-studio/lib/types";

/**
 * Behavioral tests for use-report-narrative.ts
 *
 * The hook:
 * 1. Calls useAI() to get the AI provider.
 * 2. Returns { generate, status } where status = ai.progress.status.
 * 3. generate(data) calls ai.generateStructured({ system, prompt }, NarrativeSchema).
 * 4. The prompt is assembled by buildPrompt(data) which has several optional branches.
 *
 * Strategy:
 * - Mock @/platform/ai/provider so useAI() returns a controllable fake.
 * - Keep the real target module loaded so coverage lands on the production code.
 * - Capture the arguments passed to generateStructured and assert on them.
 */

// ─── Fake AI object factory ──────────────────────────────────────────────────

interface FakeAI {
  generateStructured: ReturnType<typeof vi.fn>;
  progress: { status: string };
}

function makeFakeAI(overrides: Partial<FakeAI> = {}): FakeAI {
  return {
    generateStructured: vi.fn().mockResolvedValue({
      executiveSummary: "Good day.",
      keyFindings: ["Finding A", "Finding B"],
      recommendations: ["Rec 1", "Rec 2"],
    } satisfies ReportNarrative),
    progress: { status: "ready" },
    ...overrides,
  };
}

// ─── Mock @/platform/ai/provider ─────────────────────────────────────────────
// vi.mock is hoisted before imports, so the factory runs before the hook import.

let currentFakeAI = makeFakeAI();

vi.mock("@/platform/ai/provider", () => ({
  useAI: () => currentFakeAI,
}));

// ─── Import real target AFTER mocks are registered ───────────────────────────

import { useReportNarrative } from "@/features/report-studio/hooks/use-report-narrative";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeData(partial: Partial<ReportData> = {}): ReportData {
  return {
    date: "2026-06-25",
    totalTransactions: 10_000,
    successRate: 95.5,
    totalRevenue: 1234.567,
    failedTransactions: 450,
    topChannels: [
      { name: "USSD", volume: 5000, successRate: 98.2, revenue: 800.123 },
      { name: "WEB", volume: 3000, successRate: 91.4, revenue: 300.456 },
    ],
    hourlyData: [],
    ...partial,
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  currentFakeAI = makeFakeAI();
});

// ─── Hook shape ───────────────────────────────────────────────────────────────

describe("useReportNarrative — hook shape", () => {
  it("returns an object with a generate function", () => {
    const { result } = renderHook(() => useReportNarrative());
    expect(typeof result.current.generate).toBe("function");
  });

  it("returns status from ai.progress.status", () => {
    currentFakeAI = makeFakeAI({ progress: { status: "idle" } });
    const { result } = renderHook(() => useReportNarrative());
    expect(result.current.status).toBe("idle");
  });

  it("reflects a loading status from the AI provider", () => {
    currentFakeAI = makeFakeAI({ progress: { status: "loading" } });
    const { result } = renderHook(() => useReportNarrative());
    expect(result.current.status).toBe("loading");
  });

  it("reflects an inferring status from the AI provider", () => {
    currentFakeAI = makeFakeAI({ progress: { status: "inferring" } });
    const { result } = renderHook(() => useReportNarrative());
    expect(result.current.status).toBe("inferring");
  });

  it("reflects an error status from the AI provider", () => {
    currentFakeAI = makeFakeAI({ progress: { status: "error" } });
    const { result } = renderHook(() => useReportNarrative());
    expect(result.current.status).toBe("error");
  });

  it("generate is a stable reference across re-renders", () => {
    const { result, rerender } = renderHook(() => useReportNarrative());
    const first = result.current.generate;
    rerender();
    expect(result.current.generate).toBe(first);
  });
});

// ─── generate — return value ──────────────────────────────────────────────────

describe("useReportNarrative — generate return value", () => {
  it("returns the structured narrative from generateStructured", async () => {
    const expected: ReportNarrative = {
      executiveSummary: "All systems nominal.",
      keyFindings: ["High volume on USSD", "Low failure rate"],
      recommendations: ["Monitor channel 3", "Scale up WEB"],
    };
    currentFakeAI.generateStructured.mockResolvedValue(expected);

    const { result } = renderHook(() => useReportNarrative());

    let narrative: ReportNarrative | undefined;
    await act(async () => {
      narrative = await result.current.generate(makeData());
    });

    expect(narrative).toEqual(expected);
  });

  it("propagates rejection from generateStructured", async () => {
    currentFakeAI.generateStructured.mockRejectedValue(new Error("AI unavailable"));

    const { result } = renderHook(() => useReportNarrative());

    await expect(
      act(async () => {
        await result.current.generate(makeData());
      }),
    ).rejects.toThrow("AI unavailable");
  });
});

// ─── generate — generateStructured call contract ──────────────────────────────

describe("useReportNarrative — generateStructured invocation", () => {
  it("calls generateStructured exactly once per generate() call", async () => {
    const { result } = renderHook(() => useReportNarrative());

    await act(async () => {
      await result.current.generate(makeData());
    });

    expect(currentFakeAI.generateStructured).toHaveBeenCalledTimes(1);
  });

  it("passes a system prompt mentioning 'transaction-operations analyst'", async () => {
    const { result } = renderHook(() => useReportNarrative());

    await act(async () => {
      await result.current.generate(makeData());
    });

    const [request] = currentFakeAI.generateStructured.mock.calls[0] as [{ system: string }, unknown];
    expect(request.system).toContain("transaction-operations analyst");
  });

  it("passes a system prompt instructing not to invent numbers", async () => {
    const { result } = renderHook(() => useReportNarrative());

    await act(async () => {
      await result.current.generate(makeData());
    });

    const [request] = currentFakeAI.generateStructured.mock.calls[0] as [{ system: string }, unknown];
    expect(request.system).toContain("Do not invent numbers");
  });

  it("passes a second argument (the Zod schema object) to generateStructured", async () => {
    const { result } = renderHook(() => useReportNarrative());

    await act(async () => {
      await result.current.generate(makeData());
    });

    const [, schema] = currentFakeAI.generateStructured.mock.calls[0] as [unknown, unknown];
    // The schema is a Zod object — it should have a parse/safeParse method.
    expect(typeof (schema as { parse?: unknown }).parse).toBe("function");
  });
});

// ─── buildPrompt — basic fields ───────────────────────────────────────────────

describe("useReportNarrative — buildPrompt: basic fields", () => {
  async function capturePrompt(data: ReportData): Promise<string> {
    const { result } = renderHook(() => useReportNarrative());
    await act(async () => {
      await result.current.generate(data);
    });
    const [request] = currentFakeAI.generateStructured.mock.calls[0] as [{ prompt: string }, unknown];
    return request.prompt;
  }

  it("includes the report date in the prompt", async () => {
    const prompt = await capturePrompt(makeData({ date: "2099-12-31" }));
    expect(prompt).toContain("Date: 2099-12-31");
  });

  it("includes rounded total transactions in the prompt", async () => {
    // Math.round(10_000.7) = 10001
    const prompt = await capturePrompt(makeData({ totalTransactions: 10_000.7 }));
    expect(prompt).toContain("Total transactions: 10001");
  });

  it("includes overall success rate formatted to one decimal percent", async () => {
    const prompt = await capturePrompt(makeData({ successRate: 87.654 }));
    // fmtPct uses toFixed(1) → "87.7%"
    expect(prompt).toContain("Overall success rate: 87.7%");
  });

  it("includes rounded failed transactions", async () => {
    const prompt = await capturePrompt(makeData({ failedTransactions: 123.6 }));
    expect(prompt).toContain("Failed transactions: 124");
  });

  it("includes total revenue formatted to 2 decimal places", async () => {
    const prompt = await capturePrompt(makeData({ totalRevenue: 1234.567 }));
    expect(prompt).toContain("Total revenue: 1234.57");
  });

  it("includes the top channels section header", async () => {
    const prompt = await capturePrompt(makeData());
    expect(prompt).toContain("Top channels (name | volume | success% | revenue):");
  });
});

// ─── buildPrompt — channel rows ───────────────────────────────────────────────

describe("useReportNarrative — buildPrompt: channel rows", () => {
  async function capturePrompt(data: ReportData): Promise<string> {
    const { result } = renderHook(() => useReportNarrative());
    await act(async () => {
      await result.current.generate(data);
    });
    const [request] = currentFakeAI.generateStructured.mock.calls[0] as [{ prompt: string }, unknown];
    return request.prompt;
  }

  it("includes channel name, rounded volume, successRate%, and revenue in each row", async () => {
    const data = makeData({
      topChannels: [{ name: "USSD", volume: 5000.4, successRate: 98.2, revenue: 800.123 }],
    });
    const prompt = await capturePrompt(data);
    // Math.round(5000.4) = 5000; fmtPct(98.2) = "98.2%"; revenue.toFixed(2) = "800.12"
    expect(prompt).toContain("- USSD | 5000 | 98.2% | 800.12");
  });

  it("limits channel rows to at most 8 channels", async () => {
    const channels = Array.from({ length: 12 }, (_, i) => ({
      name: `CH${i}`,
      volume: 100 * (i + 1),
      successRate: 90,
      revenue: 10,
    }));
    const data = makeData({ topChannels: channels });
    const prompt = await capturePrompt(data);

    // Should contain CH0 through CH7 but NOT CH8 and beyond
    expect(prompt).toContain("- CH0 |");
    expect(prompt).toContain("- CH7 |");
    expect(prompt).not.toContain("- CH8 |");
    expect(prompt).not.toContain("- CH11 |");
  });

  it("includes all channels when there are fewer than 8", async () => {
    const channels = [
      { name: "A", volume: 100, successRate: 90, revenue: 10 },
      { name: "B", volume: 200, successRate: 80, revenue: 20 },
    ];
    const data = makeData({ topChannels: channels });
    const prompt = await capturePrompt(data);

    expect(prompt).toContain("- A |");
    expect(prompt).toContain("- B |");
  });

  it("handles empty topChannels without throwing", async () => {
    const data = makeData({ topChannels: [] });
    const prompt = await capturePrompt(data);
    expect(prompt).toContain("Top channels (name | volume | success% | revenue):");
    // No channel rows — just the header line
    expect(prompt).not.toContain("- ");
  });
});

// ─── buildPrompt — comparison branch (present) ───────────────────────────────

describe("useReportNarrative — buildPrompt: comparison branch", () => {
  async function capturePrompt(data: ReportData): Promise<string> {
    const { result } = renderHook(() => useReportNarrative());
    await act(async () => {
      await result.current.generate(data);
    });
    const [request] = currentFakeAI.generateStructured.mock.calls[0] as [{ prompt: string }, unknown];
    return request.prompt;
  }

  it("omits period comparison when data.comparison is absent", async () => {
    const data = makeData({ comparison: undefined });
    const prompt = await capturePrompt(data);
    expect(prompt).not.toContain("Previous period");
  });

  it("includes previous period date and stats when comparison is present", async () => {
    const data = makeData({
      comparison: {
        prev: {
          date: "2026-06-24",
          totalTransactions: 9_000,
          successRate: 88.5,
          totalRevenue: 1000,
          failedTransactions: 90,
        },
        volumeTrend: null,
      },
    });
    const prompt = await capturePrompt(data);
    expect(prompt).toContain("Previous period (2026-06-24)");
    // Math.round(9000) = 9000; fmtPct(88.5) = "88.5%"
    expect(prompt).toContain("9000 transactions");
    expect(prompt).toContain("88.5% success rate");
  });

  it("omits volume trend line when volumeTrend is null", async () => {
    const data = makeData({
      comparison: {
        prev: {
          date: "2026-06-24",
          totalTransactions: 9_000,
          successRate: 88,
          totalRevenue: 1000,
          failedTransactions: 90,
        },
        volumeTrend: null,
      },
    });
    const prompt = await capturePrompt(data);
    expect(prompt).not.toContain("Welch t-test");
  });

  it("includes volume trend p-value and 'statistically significant' when significant=true", async () => {
    const data = makeData({
      comparison: {
        prev: {
          date: "2026-06-24",
          totalTransactions: 9_000,
          successRate: 88,
          totalRevenue: 1000,
          failedTransactions: 90,
        },
        volumeTrend: {
          pValue: 0.0312,
          significant: true,
          meanCurrent: 500,
          meanPrev: 450,
        },
      },
    });
    const prompt = await capturePrompt(data);
    // pValue.toFixed(4) = "0.0312"
    expect(prompt).toContain("p-value=0.0312");
    expect(prompt).toContain("statistically significant");
    expect(prompt).not.toContain("not significant");
  });

  it("includes 'not significant' in trend line when significant=false", async () => {
    const data = makeData({
      comparison: {
        prev: {
          date: "2026-06-24",
          totalTransactions: 9_000,
          successRate: 88,
          totalRevenue: 1000,
          failedTransactions: 90,
        },
        volumeTrend: {
          pValue: 0.45,
          significant: false,
          meanCurrent: 500,
          meanPrev: 490,
        },
      },
    });
    const prompt = await capturePrompt(data);
    expect(prompt).toContain("p-value=0.4500");
    expect(prompt).toContain("not significant");
  });

  it("formats pValue to 4 decimal places in the trend line", async () => {
    const data = makeData({
      comparison: {
        prev: {
          date: "prev",
          totalTransactions: 9_000,
          successRate: 88,
          totalRevenue: 1000,
          failedTransactions: 90,
        },
        volumeTrend: {
          pValue: 0.1,
          significant: false,
          meanCurrent: 500,
          meanPrev: 490,
        },
      },
    });
    const prompt = await capturePrompt(data);
    // 0.1.toFixed(4) = "0.1000"
    expect(prompt).toContain("p-value=0.1000");
  });
});

// ─── buildPrompt — anomalies branch ──────────────────────────────────────────

describe("useReportNarrative — buildPrompt: anomalies branch", () => {
  async function capturePrompt(data: ReportData): Promise<string> {
    const { result } = renderHook(() => useReportNarrative());
    await act(async () => {
      await result.current.generate(data);
    });
    const [request] = currentFakeAI.generateStructured.mock.calls[0] as [{ prompt: string }, unknown];
    return request.prompt;
  }

  it("omits anomalies section when anomalies is undefined", async () => {
    const data = makeData({ anomalies: undefined });
    const prompt = await capturePrompt(data);
    expect(prompt).not.toContain("Anomalous hours");
  });

  it("omits anomalies section when anomalies is an empty array", async () => {
    const data = makeData({ anomalies: [] });
    const prompt = await capturePrompt(data);
    expect(prompt).not.toContain("Anomalous hours");
  });

  it("includes anomalous hours label when anomalies are present", async () => {
    const data = makeData({
      anomalies: [
        { hour: 3, count: 42, successRate: 55.5, score: 2.71 },
        { hour: 14, count: 200, successRate: 80.0, score: 1.23 },
      ],
    });
    const prompt = await capturePrompt(data);
    expect(prompt).toContain("Anomalous hours (GESD):");
  });

  it("formats each anomaly as '<hour>:00' joined by ', '", async () => {
    const data = makeData({
      anomalies: [
        { hour: 3, count: 42, successRate: 55.5, score: 2.71 },
        { hour: 14, count: 200, successRate: 80.0, score: 1.23 },
      ],
    });
    const prompt = await capturePrompt(data);
    expect(prompt).toContain("3:00, 14:00");
  });

  it("handles a single anomaly correctly", async () => {
    const data = makeData({
      anomalies: [{ hour: 7, count: 10, successRate: 65, score: 3.0 }],
    });
    const prompt = await capturePrompt(data);
    expect(prompt).toContain("7:00");
    // No comma when there's only one anomaly
    expect(prompt).not.toContain("7:00,");
  });

  it("includes all anomaly hours in the formatted list", async () => {
    const data = makeData({
      anomalies: [
        { hour: 0, count: 5, successRate: 50, score: 1 },
        { hour: 12, count: 10, successRate: 60, score: 2 },
        { hour: 23, count: 15, successRate: 70, score: 3 },
      ],
    });
    const prompt = await capturePrompt(data);
    expect(prompt).toContain("0:00, 12:00, 23:00");
  });
});

// ─── buildPrompt — fmtPct edge cases ─────────────────────────────────────────

describe("useReportNarrative — buildPrompt: fmtPct formatting", () => {
  async function capturePrompt(data: ReportData): Promise<string> {
    const { result } = renderHook(() => useReportNarrative());
    await act(async () => {
      await result.current.generate(data);
    });
    const [request] = currentFakeAI.generateStructured.mock.calls[0] as [{ prompt: string }, unknown];
    return request.prompt;
  }

  it("formats 0% correctly", async () => {
    const prompt = await capturePrompt(makeData({ successRate: 0 }));
    expect(prompt).toContain("Overall success rate: 0.0%");
  });

  it("formats 100% correctly", async () => {
    const prompt = await capturePrompt(makeData({ successRate: 100 }));
    expect(prompt).toContain("Overall success rate: 100.0%");
  });

  it("rounds successRate to one decimal (e.g. 95.45 → 95.5%)", async () => {
    const prompt = await capturePrompt(makeData({ successRate: 95.45 }));
    expect(prompt).toContain("Overall success rate: 95.5%");
  });

  it("channel successRate is also formatted with fmtPct (toFixed(1))", async () => {
    const data = makeData({
      topChannels: [{ name: "X", volume: 100, successRate: 72.333, revenue: 10 }],
    });
    const prompt = await capturePrompt(data);
    expect(prompt).toContain("72.3%");
  });
});

// ─── buildPrompt — combined full data ────────────────────────────────────────

describe("useReportNarrative — buildPrompt: full data assembly", () => {
  it("produces a prompt with all sections when all optional fields are present", async () => {
    const data = makeData({
      comparison: {
        prev: {
          date: "2026-06-24",
          totalTransactions: 8_000,
          successRate: 90,
          totalRevenue: 900,
          failedTransactions: 80,
        },
        volumeTrend: {
          pValue: 0.025,
          significant: true,
          meanCurrent: 500,
          meanPrev: 400,
        },
      },
      anomalies: [
        { hour: 2, count: 5, successRate: 40, score: 4.1 },
        { hour: 18, count: 20, successRate: 55, score: 2.9 },
      ],
    });

    const { result } = renderHook(() => useReportNarrative());
    await act(async () => {
      await result.current.generate(data);
    });

    const [request] = currentFakeAI.generateStructured.mock.calls[0] as [{ prompt: string }, unknown];
    const prompt = request.prompt;

    // All sections should appear
    expect(prompt).toContain("Date: 2026-06-25");
    expect(prompt).toContain("Top channels");
    expect(prompt).toContain("Previous period");
    expect(prompt).toContain("Volume trend Welch t-test");
    expect(prompt).toContain("Anomalous hours (GESD):");
    expect(prompt).toContain("2:00, 18:00");
  });

  it("lines are joined with newlines (not spaces)", async () => {
    const { result } = renderHook(() => useReportNarrative());
    await act(async () => {
      await result.current.generate(makeData());
    });

    const [request] = currentFakeAI.generateStructured.mock.calls[0] as [{ prompt: string }, unknown];
    const prompt = request.prompt;

    // The prompt should be a multi-line string
    expect(prompt.split("\n").length).toBeGreaterThan(4);
  });
});

// ─── NarrativeSchema validation ───────────────────────────────────────────────

describe("useReportNarrative — NarrativeSchema (Zod) contract", () => {
  it("schema is passed as second arg to generateStructured and can validate a valid narrative", async () => {
    const { result } = renderHook(() => useReportNarrative());
    await act(async () => {
      await result.current.generate(makeData());
    });

    const [, schema] = currentFakeAI.generateStructured.mock.calls[0] as [
      unknown,
      { safeParse: (v: unknown) => { success: boolean } },
    ];

    // A valid narrative should pass the schema
    const valid = schema.safeParse({
      executiveSummary: "Summary text.",
      keyFindings: ["Finding 1", "Finding 2"],
      recommendations: ["Rec 1", "Rec 2"],
    });
    expect(valid.success).toBe(true);
  });

  it("schema rejects a narrative missing executiveSummary", async () => {
    const { result } = renderHook(() => useReportNarrative());
    await act(async () => {
      await result.current.generate(makeData());
    });

    const [, schema] = currentFakeAI.generateStructured.mock.calls[0] as [
      unknown,
      { safeParse: (v: unknown) => { success: boolean } },
    ];

    const invalid = schema.safeParse({
      keyFindings: ["F1", "F2"],
      recommendations: ["R1", "R2"],
    });
    expect(invalid.success).toBe(false);
  });

  it("schema rejects keyFindings with fewer than 2 items", async () => {
    const { result } = renderHook(() => useReportNarrative());
    await act(async () => {
      await result.current.generate(makeData());
    });

    const [, schema] = currentFakeAI.generateStructured.mock.calls[0] as [
      unknown,
      { safeParse: (v: unknown) => { success: boolean } },
    ];

    const invalid = schema.safeParse({
      executiveSummary: "Summary.",
      keyFindings: ["only one"],
      recommendations: ["R1", "R2"],
    });
    expect(invalid.success).toBe(false);
  });

  it("schema rejects keyFindings with more than 5 items", async () => {
    const { result } = renderHook(() => useReportNarrative());
    await act(async () => {
      await result.current.generate(makeData());
    });

    const [, schema] = currentFakeAI.generateStructured.mock.calls[0] as [
      unknown,
      { safeParse: (v: unknown) => { success: boolean } },
    ];

    const invalid = schema.safeParse({
      executiveSummary: "Summary.",
      keyFindings: ["F1", "F2", "F3", "F4", "F5", "F6"],
      recommendations: ["R1", "R2"],
    });
    expect(invalid.success).toBe(false);
  });

  it("schema rejects recommendations with fewer than 2 items", async () => {
    const { result } = renderHook(() => useReportNarrative());
    await act(async () => {
      await result.current.generate(makeData());
    });

    const [, schema] = currentFakeAI.generateStructured.mock.calls[0] as [
      unknown,
      { safeParse: (v: unknown) => { success: boolean } },
    ];

    const invalid = schema.safeParse({
      executiveSummary: "Summary.",
      keyFindings: ["F1", "F2"],
      recommendations: ["only one"],
    });
    expect(invalid.success).toBe(false);
  });

  it("schema rejects recommendations with more than 5 items", async () => {
    const { result } = renderHook(() => useReportNarrative());
    await act(async () => {
      await result.current.generate(makeData());
    });

    const [, schema] = currentFakeAI.generateStructured.mock.calls[0] as [
      unknown,
      { safeParse: (v: unknown) => { success: boolean } },
    ];

    const invalid = schema.safeParse({
      executiveSummary: "Summary.",
      keyFindings: ["F1", "F2"],
      recommendations: ["R1", "R2", "R3", "R4", "R5", "R6"],
    });
    expect(invalid.success).toBe(false);
  });

  it("schema accepts boundary values: exactly 2 findings and 2 recommendations", async () => {
    const { result } = renderHook(() => useReportNarrative());
    await act(async () => {
      await result.current.generate(makeData());
    });

    const [, schema] = currentFakeAI.generateStructured.mock.calls[0] as [
      unknown,
      { safeParse: (v: unknown) => { success: boolean } },
    ];

    const valid = schema.safeParse({
      executiveSummary: "Summary.",
      keyFindings: ["F1", "F2"],
      recommendations: ["R1", "R2"],
    });
    expect(valid.success).toBe(true);
  });

  it("schema accepts boundary values: exactly 5 findings and 5 recommendations", async () => {
    const { result } = renderHook(() => useReportNarrative());
    await act(async () => {
      await result.current.generate(makeData());
    });

    const [, schema] = currentFakeAI.generateStructured.mock.calls[0] as [
      unknown,
      { safeParse: (v: unknown) => { success: boolean } },
    ];

    const valid = schema.safeParse({
      executiveSummary: "Summary.",
      keyFindings: ["F1", "F2", "F3", "F4", "F5"],
      recommendations: ["R1", "R2", "R3", "R4", "R5"],
    });
    expect(valid.success).toBe(true);
  });
});

// ─── Multiple consecutive generate() calls ───────────────────────────────────

describe("useReportNarrative — multiple generate() calls", () => {
  it("each generate() call invokes generateStructured independently", async () => {
    const { result } = renderHook(() => useReportNarrative());

    await act(async () => {
      await result.current.generate(makeData({ date: "2026-01-01" }));
      await result.current.generate(makeData({ date: "2026-01-02" }));
    });

    expect(currentFakeAI.generateStructured).toHaveBeenCalledTimes(2);
  });

  it("second generate() call uses its own data, not cached from first call", async () => {
    const { result } = renderHook(() => useReportNarrative());

    await act(async () => {
      await result.current.generate(makeData({ date: "2026-01-01" }));
    });

    await act(async () => {
      await result.current.generate(makeData({ date: "2099-12-31" }));
    });

    const calls = currentFakeAI.generateStructured.mock.calls as Array<[{ prompt: string }, unknown]>;
    expect(calls[0][0].prompt).toContain("Date: 2026-01-01");
    expect(calls[1][0].prompt).toContain("Date: 2099-12-31");
  });
});
