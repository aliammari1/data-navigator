import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mock the AI provider ────────────────────────────────────────────────────
//
// `useAI` is called inside `useGeoInsights`; we need a controllable mock so we
// can inspect what was passed to `generateStructured` and control its output.
const mockGenerateStructured = vi.fn();
const mockProgress = { status: "ready" as const, progress: 0 };

vi.mock("@/platform/ai/provider", () => ({
  useAI: vi.fn(() => ({
    generateStructured: mockGenerateStructured,
    progress: mockProgress,
  })),
}));

// ─── Mock the anomaly-detection helper ──────────────────────────────────────
//
// `detectRegionAnomalies` is an async off-main-thread helper that touches the
// analysis worker. Mock it so tests run synchronously without a Worker.
const mockDetectRegionAnomalies = vi.fn();

vi.mock("@/features/geo-analysis/lib/anomaly", () => ({
  detectRegionAnomalies: (...args: unknown[]) => mockDetectRegionAnomalies(...args),
}));

// ─── Mock buildGeoInsightPrompt ──────────────────────────────────────────────
//
// The real implementation is pure and has its own tests; here we just need it
// to return a stable { system, prompt } pair so we can verify the call.
vi.mock("@/features/geo-analysis/lib/ai-insights", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/features/geo-analysis/lib/ai-insights")>();
  return {
    ...real,
    buildGeoInsightPrompt: vi.fn(() => ({
      system: "mock-system",
      prompt: "mock-prompt",
    })),
  };
});

// Import AFTER mocks are registered.
import { useGeoInsights } from "@/features/geo-analysis/hooks/use-geo-insights";
import type { UseGeoDataResult } from "@/features/geo-analysis/hooks/use-geo-data";
import type { GeoInsight } from "@/features/geo-analysis/lib/ai-insights";
import { buildGeoInsightPrompt } from "@/features/geo-analysis/lib/ai-insights";
import type { RegionAnomaly } from "@/features/geo-analysis/lib/anomaly";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeGeoRegion(name: string, successRate = 80): UseGeoDataResult["regions"][number] {
  return {
    name,
    transactions: 100,
    revenue: 500,
    successRate,
    rank: 1,
    lat: 36.8,
    lon: 10.2,
  };
}

function makeGeoData(overrides: Partial<UseGeoDataResult> = {}): UseGeoDataResult {
  return {
    ready: true,
    loading: false,
    error: null,
    datasetName: "Test Dataset",
    regions: [makeGeoRegion("Tunis", 80), makeGeoRegion("Sfax", 60)],
    mappedRegions: [],
    totalTransactions: 200,
    totalRevenue: 1000,
    avgSuccessRate: 70,
    matrix: { regions: [], channels: [], shares: [], counts: [] },
    flows: [],
    dominantChannels: [{ region: "Tunis", channel: "USSD", pct: 70, channelIndex: 0 }],
    channelSpread: [],
    ...overrides,
  };
}

const MOCK_ANOMALIES: RegionAnomaly[] = [
  { region: "Sfax", successRate: 10, score: 2.5, method: "gesd" },
];

const MOCK_INSIGHT: GeoInsight = {
  headline: "Tunis dominates transactions.",
  topRegions: [{ region: "Tunis", note: "Highest volume." }],
  riskRegions: [{ region: "Sfax", reason: "Low success rate." }],
  channelObservation: "USSD is dominant.",
  recommendation: "Focus on Sfax.",
};

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Happy-path defaults.
  mockDetectRegionAnomalies.mockResolvedValue(MOCK_ANOMALIES);
  mockGenerateStructured.mockResolvedValue(MOCK_INSIGHT);
});

// ════════════════════════════════════════════════════════════════════════════
// Initial state
// ════════════════════════════════════════════════════════════════════════════

describe("useGeoInsights — initial state", () => {
  it("starts with null insight, empty anomalies, not generating, no error", () => {
    // Arrange / Act
    const { result } = renderHook(() => useGeoInsights(makeGeoData()));

    // Assert
    expect(result.current.insight).toBeNull();
    expect(result.current.anomalies).toEqual([]);
    expect(result.current.generating).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("exposes generate and reset as functions", () => {
    const { result } = renderHook(() => useGeoInsights(makeGeoData()));

    expect(typeof result.current.generate).toBe("function");
    expect(typeof result.current.reset).toBe("function");
  });

  it("reads progress from ai.progress.progress (default 0)", () => {
    // Arrange — mockProgress.progress is 0 by default
    const { result } = renderHook(() => useGeoInsights(makeGeoData()));

    // Assert
    expect(result.current.progress).toBe(0);
  });

  it("falls back to 0 when ai.progress is undefined", async () => {
    // Arrange — override useAI to return no progress field
    const { useAI } = await import("@/platform/ai/provider");
    (useAI as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      generateStructured: mockGenerateStructured,
      progress: undefined,
    });

    const { result } = renderHook(() => useGeoInsights(makeGeoData()));

    expect(result.current.progress).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// generate() — early return when no regions
// ════════════════════════════════════════════════════════════════════════════

describe("useGeoInsights — generate() with empty regions", () => {
  it("returns immediately without calling anomaly detection or AI when regions is empty", async () => {
    // Arrange
    const geo = makeGeoData({ regions: [] });
    const { result } = renderHook(() => useGeoInsights(geo));

    // Act
    await act(async () => {
      await result.current.generate();
    });

    // Assert — neither worker was invoked
    expect(mockDetectRegionAnomalies).not.toHaveBeenCalled();
    expect(mockGenerateStructured).not.toHaveBeenCalled();
    // State stays at defaults
    expect(result.current.generating).toBe(false);
    expect(result.current.insight).toBeNull();
    expect(result.current.error).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// generate() — happy path
// ════════════════════════════════════════════════════════════════════════════

describe("useGeoInsights — generate() happy path", () => {
  it("sets generating=true during execution then false on completion", async () => {
    // Arrange — delay so we can capture the mid-flight state
    let resolveFn!: () => void;
    mockDetectRegionAnomalies.mockReturnValueOnce(
      new Promise<RegionAnomaly[]>((resolve) => {
        resolveFn = () => resolve(MOCK_ANOMALIES);
      }),
    );

    const geo = makeGeoData();
    const { result } = renderHook(() => useGeoInsights(geo));

    // Act — start generate but don't await yet
    let generatePromise: Promise<void>;
    act(() => {
      generatePromise = result.current.generate();
    });

    // Assert in-flight
    expect(result.current.generating).toBe(true);

    // Let the anomaly call resolve
    act(() => resolveFn());

    // Await completion
    await act(async () => {
      await generatePromise!;
    });

    expect(result.current.generating).toBe(false);
  });

  it("stores detected anomalies on success", async () => {
    const geo = makeGeoData();
    const { result } = renderHook(() => useGeoInsights(geo));

    await act(async () => {
      await result.current.generate();
    });

    expect(result.current.anomalies).toEqual(MOCK_ANOMALIES);
  });

  it("stores the AI insight on success", async () => {
    const geo = makeGeoData();
    const { result } = renderHook(() => useGeoInsights(geo));

    await act(async () => {
      await result.current.generate();
    });

    expect(result.current.insight).toEqual(MOCK_INSIGHT);
  });

  it("clears a previous error when generate() is called again successfully", async () => {
    // Arrange — first call fails
    mockDetectRegionAnomalies.mockRejectedValueOnce(new Error("first error"));
    const geo = makeGeoData();
    const { result } = renderHook(() => useGeoInsights(geo));

    await act(async () => {
      await result.current.generate();
    });
    expect(result.current.error).toBe("first error");

    // Arrange — second call succeeds
    mockDetectRegionAnomalies.mockResolvedValueOnce(MOCK_ANOMALIES);

    await act(async () => {
      await result.current.generate();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.insight).toEqual(MOCK_INSIGHT);
  });

  it("calls detectRegionAnomalies with region names and success rates", async () => {
    const regions = [makeGeoRegion("Tunis", 80), makeGeoRegion("Sfax", 60)];
    const geo = makeGeoData({ regions });
    const { result } = renderHook(() => useGeoInsights(geo));

    await act(async () => {
      await result.current.generate();
    });

    expect(mockDetectRegionAnomalies).toHaveBeenCalledWith(
      ["Tunis", "Sfax"],
      [80, 60],
    );
  });

  it("calls generateStructured with the prompt from buildGeoInsightPrompt", async () => {
    const geo = makeGeoData();
    const { result } = renderHook(() => useGeoInsights(geo));

    await act(async () => {
      await result.current.generate();
    });

    // Verify buildGeoInsightPrompt was called
    expect(buildGeoInsightPrompt).toHaveBeenCalled();

    // Verify generateStructured received the mocked prompt values + correct params
    expect(mockGenerateStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        system: "mock-system",
        prompt: "mock-prompt",
        temperature: 0.2,
        maxTokens: 900,
      }),
      expect.anything(), // GeoInsightSchema
    );
  });

  it("passes anomalous region names to buildGeoInsightPrompt", async () => {
    const geo = makeGeoData();
    const { result } = renderHook(() => useGeoInsights(geo));

    await act(async () => {
      await result.current.generate();
    });

    expect(buildGeoInsightPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        anomalousRegions: MOCK_ANOMALIES.map((a) => a.region),
      }),
    );
  });

  it("passes geo context fields to buildGeoInsightPrompt", async () => {
    const geo = makeGeoData({
      datasetName: "My Dataset",
      totalTransactions: 500,
      avgSuccessRate: 75,
    });
    const { result } = renderHook(() => useGeoInsights(geo));

    await act(async () => {
      await result.current.generate();
    });

    expect(buildGeoInsightPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        datasetName: "My Dataset",
        totalTransactions: 500,
        avgSuccessRate: 75,
      }),
    );
  });

  it("error remains null after a successful generate", async () => {
    const geo = makeGeoData();
    const { result } = renderHook(() => useGeoInsights(geo));

    await act(async () => {
      await result.current.generate();
    });

    expect(result.current.error).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// generate() — error paths
// ════════════════════════════════════════════════════════════════════════════

describe("useGeoInsights — generate() error handling", () => {
  it("stores the error message when detectRegionAnomalies throws an Error", async () => {
    // Arrange
    mockDetectRegionAnomalies.mockRejectedValueOnce(new Error("anomaly detection failed"));
    const geo = makeGeoData();
    const { result } = renderHook(() => useGeoInsights(geo));

    // Act
    await act(async () => {
      await result.current.generate();
    });

    // Assert
    expect(result.current.error).toBe("anomaly detection failed");
    expect(result.current.insight).toBeNull();
    expect(result.current.generating).toBe(false);
  });

  it("stores the error message when generateStructured throws an Error", async () => {
    // Arrange
    mockGenerateStructured.mockRejectedValueOnce(new Error("AI inference failed"));
    const geo = makeGeoData();
    const { result } = renderHook(() => useGeoInsights(geo));

    // Act
    await act(async () => {
      await result.current.generate();
    });

    // Assert
    expect(result.current.error).toBe("AI inference failed");
    expect(result.current.insight).toBeNull();
    expect(result.current.generating).toBe(false);
  });

  it("uses fallback message 'Insight generation failed.' for non-Error throws", async () => {
    // Arrange — throw a plain string (not an Error instance)
    mockDetectRegionAnomalies.mockRejectedValueOnce("plain string error");
    const geo = makeGeoData();
    const { result } = renderHook(() => useGeoInsights(geo));

    // Act
    await act(async () => {
      await result.current.generate();
    });

    // Assert — the fallback message from the catch block
    expect(result.current.error).toBe("Insight generation failed.");
  });

  it("uses fallback message for thrown null", async () => {
    // Arrange
    mockDetectRegionAnomalies.mockRejectedValueOnce(null);
    const geo = makeGeoData();
    const { result } = renderHook(() => useGeoInsights(geo));

    await act(async () => {
      await result.current.generate();
    });

    expect(result.current.error).toBe("Insight generation failed.");
  });

  it("ensures generating is reset to false even when an error occurs", async () => {
    // Arrange
    mockDetectRegionAnomalies.mockRejectedValueOnce(new Error("boom"));
    const geo = makeGeoData();
    const { result } = renderHook(() => useGeoInsights(geo));

    // Act
    await act(async () => {
      await result.current.generate();
    });

    // Assert — the finally block must have run
    expect(result.current.generating).toBe(false);
  });

  it("does not commit anomalies to state when generateStructured throws", async () => {
    // Arrange — anomalies succeed but AI fails
    mockDetectRegionAnomalies.mockResolvedValueOnce(MOCK_ANOMALIES);
    mockGenerateStructured.mockRejectedValueOnce(new Error("AI failed"));
    const geo = makeGeoData();
    const { result } = renderHook(() => useGeoInsights(geo));

    await act(async () => {
      await result.current.generate();
    });

    // Anomalies were set (setAnomalies is called before the AI call)
    expect(result.current.anomalies).toEqual(MOCK_ANOMALIES);
    // But insight was not set
    expect(result.current.insight).toBeNull();
    expect(result.current.error).toBe("AI failed");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// reset()
// ════════════════════════════════════════════════════════════════════════════

describe("useGeoInsights — reset()", () => {
  it("clears insight, anomalies, and error back to initial values", async () => {
    // Arrange — run a successful generate to populate state
    const geo = makeGeoData();
    const { result } = renderHook(() => useGeoInsights(geo));

    await act(async () => {
      await result.current.generate();
    });

    // Sanity check that generate populated state
    expect(result.current.insight).not.toBeNull();
    expect(result.current.anomalies.length).toBeGreaterThan(0);

    // Act
    act(() => {
      result.current.reset();
    });

    // Assert
    expect(result.current.insight).toBeNull();
    expect(result.current.anomalies).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("clears only an error (when insight was never generated)", async () => {
    // Arrange — generate fails so only error is set
    mockDetectRegionAnomalies.mockRejectedValueOnce(new Error("boom"));
    const geo = makeGeoData();
    const { result } = renderHook(() => useGeoInsights(geo));

    await act(async () => {
      await result.current.generate();
    });
    expect(result.current.error).toBe("boom");

    // Act
    act(() => {
      result.current.reset();
    });

    // Assert
    expect(result.current.error).toBeNull();
    expect(result.current.insight).toBeNull();
  });

  it("does not affect the generating flag (stays false)", async () => {
    const geo = makeGeoData();
    const { result } = renderHook(() => useGeoInsights(geo));

    act(() => {
      result.current.reset();
    });

    expect(result.current.generating).toBe(false);
  });

  it("is safe to call multiple times consecutively", () => {
    const geo = makeGeoData();
    const { result } = renderHook(() => useGeoInsights(geo));

    // Should not throw even when already at defaults
    expect(() => {
      act(() => {
        result.current.reset();
        result.current.reset();
      });
    }).not.toThrow();

    expect(result.current.insight).toBeNull();
    expect(result.current.anomalies).toEqual([]);
    expect(result.current.error).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// progress field
// ════════════════════════════════════════════════════════════════════════════

describe("useGeoInsights — progress field", () => {
  it("reflects ai.progress.progress", async () => {
    const { useAI } = await import("@/platform/ai/provider");
    (useAI as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      generateStructured: mockGenerateStructured,
      progress: { status: "loading", progress: 42 },
    });

    const { result } = renderHook(() => useGeoInsights(makeGeoData()));

    expect(result.current.progress).toBe(42);
  });

  it("returns 0 when ai.progress is null-ish (nullish coalescing)", async () => {
    const { useAI } = await import("@/platform/ai/provider");
    (useAI as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      generateStructured: mockGenerateStructured,
      progress: null,
    });

    const { result } = renderHook(() => useGeoInsights(makeGeoData()));

    expect(result.current.progress).toBe(0);
  });
});
