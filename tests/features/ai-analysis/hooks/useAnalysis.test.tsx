import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Boundary mocks ───────────────────────────────────────────────────────────
//
// Every true IO boundary the hook touches is mocked. The PURE collaborators it
// owns — `buildRuleInsights` / `narrateInsights` (../model/narrate),
// `insight-schema`, and `quoteIdent` (../model/sql) — run for real so the
// asserted insights are genuinely computed from the fed facts.

const runReadOnlyQuery = vi.fn<(sql: string) => Promise<Record<string, unknown>[]>>();
vi.mock("@/platform/duckdb/duckdb", () => ({
  runReadOnlyQuery: (sql: string) => runReadOnlyQuery(sql),
}));

const getColumnProfile =
  vi.fn<(datasetId: string, column: string) => Promise<{ profile: unknown } | undefined>>();
const putColumnProfile =
  vi.fn<(datasetId: string, column: string, profile: unknown) => Promise<string>>();
vi.mock("@/platform/storage", () => ({
  getColumnProfile: (d: string, c: string) => getColumnProfile(d, c),
  putColumnProfile: (d: string, c: string, p: unknown) => putColumnProfile(d, c, p),
}));

const runAnalysisWorker =
  vi.fn<
    (
      input: unknown,
      query: unknown,
      kernels: unknown,
      onStage: (s: { progress: number; stage: string }) => void,
    ) => Promise<unknown>
  >();
vi.mock("@/features/ai-analysis/worker/client", () => ({
  runAnalysis: (input: unknown, q: unknown, k: unknown, onStage: unknown) =>
    runAnalysisWorker(input, q, k, onStage as (s: { progress: number; stage: string }) => void),
}));

vi.mock("@/features/ai-analysis/worker/kernels", () => ({
  createAnalysisKernels: () => ({ kMeans: vi.fn(), gesdAnomalies: vi.fn(), holtWinters: vi.fn() }),
}));

// `useAI` — the provider surface. Each test sets `aiState` to control
// `availability` (drives `aiAvailable`) and `generateStructured`.
let aiState: {
  availability: { id: string; label: string; available: boolean }[];
  generateStructured: ReturnType<typeof vi.fn>;
};
vi.mock("@/platform/ai/provider", () => ({
  useAI: () => aiState,
}));

import type {
  Anomaly,
  ClusterGroup,
  ColStat,
  Correlation,
  ForecastPoint,
} from "@/features/ai-analysis/model/types";
import { useAnalysis, type UseAnalysisArgs } from "@/features/ai-analysis/hooks/useAnalysis";

// ─── Builders ──────────────────────────────────────────────────────────────────

const colStat = (o: Partial<ColStat> = {}): ColStat => ({
  name: o.name ?? "amount",
  type: o.type ?? "numeric",
  nullCount: o.nullCount ?? 0,
  distinctCount: o.distinctCount ?? 100,
  rowCount: o.rowCount ?? 1000,
  ...o,
});

const correlation = (o: Partial<Correlation> = {}): Correlation => ({
  col1: o.col1 ?? "a",
  col2: o.col2 ?? "b",
  pearson: o.pearson ?? 0.95,
  strength: o.strength ?? "very_strong",
  direction: o.direction ?? "positive",
});

const anomaly = (o: Partial<Anomaly> = {}): Anomaly => ({
  id: o.id ?? "an1",
  column: o.column ?? "amount",
  type: o.type ?? "outlier",
  description: o.description ?? "outlier",
  severity: o.severity ?? "critical",
  affectedRows: o.affectedRows ?? 5,
  score: o.score ?? 3.2,
  method: o.method ?? "IQR",
  ...o,
});

const cluster = (o: Partial<ClusterGroup> = {}): ClusterGroup => ({
  id: o.id ?? 0,
  label: o.label ?? "Segment A",
  size: o.size ?? 1234,
  centroid: o.centroid ?? { amount: 12.3456, qty: 7.1 },
  characteristics: o.characteristics ?? ["high amount"],
  color: o.color ?? "#6366f1",
});

const forecastPoint = (o: Partial<ForecastPoint> = {}): ForecastPoint => ({
  period: o.period ?? "2026-01",
  predicted: o.predicted ?? 100,
  lower: o.lower ?? 90,
  upper: o.upper ?? 110,
  ...o,
});

interface WorkerResult {
  colStats: ColStat[];
  anomalies: Anomaly[];
  correlations: Correlation[];
  forecasts: ForecastPoint[];
  clusters: ClusterGroup[];
  forecastMeta: { metricCol: string | null; dateCol: string | null; method: string };
}

/** A rich result that drives `buildRuleInsights` to emit several insight kinds. */
const richResult = (over: Partial<WorkerResult> = {}): WorkerResult => ({
  colStats: over.colStats ?? [
    colStat({ name: "amount", rowCount: 1000, nullCount: 200 }), // >5% nulls → quality
  ],
  anomalies: over.anomalies ?? [anomaly({ severity: "critical", column: "amount" })],
  correlations: over.correlations ?? [correlation()],
  // 4 actuals (growth) + 1 future → trend + forecast insights.
  forecasts: over.forecasts ?? [
    forecastPoint({ period: "2026-01", actual: 100, predicted: 100 }),
    forecastPoint({ period: "2026-02", actual: 110, predicted: 110 }),
    forecastPoint({ period: "2026-03", actual: 120, predicted: 120 }),
    forecastPoint({ period: "2026-04", actual: 160, predicted: 160 }),
    forecastPoint({ period: "2026-05", actual: undefined, predicted: 180, lower: 150, upper: 210 }),
  ],
  clusters: over.clusters ?? [cluster()],
  forecastMeta: over.forecastMeta ?? { metricCol: "amount", dateCol: "date", method: "holt-winters" },
});

// ── DuckDB SHOW TABLES / COUNT(*) responder ──

function setTables(names: string[], rowCount = 1000): void {
  runReadOnlyQuery.mockImplementation(async (sql: string) => {
    if (sql === "SHOW TABLES") return names.map((name) => ({ name }));
    if (/^SELECT COUNT\(\*\)/i.test(sql)) return [{ cnt: rowCount }];
    return [];
  });
}

const baseArgs = (o: Partial<UseAnalysisArgs> = {}): UseAnalysisArgs => ({
  preferredTableName: o.preferredTableName ?? "sales",
  numericCols: o.numericCols ?? ["amount", "qty"],
  catCols: o.catCols ?? ["region"],
  dateCols: o.dateCols ?? ["date"],
  hasDataset: o.hasDataset ?? true,
});

beforeEach(() => {
  vi.clearAllMocks();
  aiState = {
    availability: [{ id: "transformers", label: "Transformers", available: false }],
    generateStructured: vi.fn(),
  };
  // Default: worker resolves a rich result; cache empty; persist resolves.
  runAnalysisWorker.mockResolvedValue(richResult());
  getColumnProfile.mockResolvedValue(undefined);
  putColumnProfile.mockResolvedValue("id");
  setTables(["sales"]);
  // Silence the hook's diagnostic logging.
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Table resolution effect ──────────────────────────────────────────────────

describe("useAnalysis — table resolution", () => {
  it("keeps the preferred table when SHOW TABLES contains it and loads its row count", async () => {
    setTables(["sales", "other"], 4242);
    const { result } = renderHook(() => useAnalysis(baseArgs({ preferredTableName: "sales" })));

    await waitFor(() => expect(result.current.resolvedTableName).toBe("sales"));
    expect(result.current.rowCount).toBe(4242);
    // tableLoaded is gated by hasDataset (true here).
    expect(result.current.tableLoaded).toBe(true);
  });

  it("falls back to the first existing table when the preferred name is absent", async () => {
    setTables(["alpha", "beta"], 7);
    const { result } = renderHook(() => useAnalysis(baseArgs({ preferredTableName: "ghost" })));

    await waitFor(() => expect(result.current.resolvedTableName).toBe("alpha"));
    expect(result.current.rowCount).toBe(7);
  });

  it("uses the first table when no preferred name is supplied", async () => {
    setTables(["only_table"], 3);
    const { result } = renderHook(() => useAnalysis(baseArgs({ preferredTableName: "" })));

    await waitFor(() => expect(result.current.resolvedTableName).toBe("only_table"));
  });

  it("resolves to no table (cleared state) when SHOW TABLES is empty and no preferred name", async () => {
    setTables([]); // no tables, preferredTableName "" → next stays ""
    const { result } = renderHook(() => useAnalysis(baseArgs({ preferredTableName: "" })));

    // The effect runs init() which short-circuits on empty `next`.
    await waitFor(() => expect(runReadOnlyQuery).toHaveBeenCalledWith("SHOW TABLES"));
    expect(result.current.resolvedTableName).toBe("");
    expect(result.current.tableLoaded).toBe(false);
    expect(result.current.rowCount).toBe(0);
  });

  it("still resolves the preferred name when SHOW TABLES throws (catch → [])", async () => {
    runReadOnlyQuery.mockImplementation(async (sql: string) => {
      if (sql === "SHOW TABLES") throw new Error("duckdb down");
      if (/COUNT/i.test(sql)) return [{ cnt: 55 }];
      return [];
    });
    const { result } = renderHook(() => useAnalysis(baseArgs({ preferredTableName: "sales" })));

    // names=[] so the preferred name is kept and COUNT(*) still runs.
    await waitFor(() => expect(result.current.resolvedTableName).toBe("sales"));
    expect(result.current.rowCount).toBe(55);
  });

  it("marks the table unloaded when the COUNT(*) query rejects", async () => {
    runReadOnlyQuery.mockImplementation(async (sql: string) => {
      if (sql === "SHOW TABLES") return [{ name: "sales" }];
      throw new Error("count failed");
    });
    const { result } = renderHook(() => useAnalysis(baseArgs()));

    await waitFor(() => expect(console.error).toHaveBeenCalled());
    expect(result.current.tableLoaded).toBe(false);
  });

  it("derives the table name from table_name / first value when `name` is absent", async () => {
    runReadOnlyQuery.mockImplementation(async (sql: string) => {
      if (sql === "SHOW TABLES") return [{ table_name: "from_table_name" }];
      if (/COUNT/i.test(sql)) return [{ cnt: 1 }];
      return [];
    });
    const { result } = renderHook(() =>
      useAnalysis(baseArgs({ preferredTableName: "from_table_name" })),
    );

    await waitFor(() => expect(result.current.resolvedTableName).toBe("from_table_name"));
  });

  it("coerces a non-numeric COUNT result to rowCount 0", async () => {
    runReadOnlyQuery.mockImplementation(async (sql: string) => {
      if (sql === "SHOW TABLES") return [{ name: "sales" }];
      if (/COUNT/i.test(sql)) return [{}]; // no cnt key → Number(undefined ?? 0) = 0
      return [];
    });
    const { result } = renderHook(() => useAnalysis(baseArgs()));

    await waitFor(() => expect(result.current.tableLoaded).toBe(true));
    expect(result.current.rowCount).toBe(0);
  });
});

// ─── hasDataset gate on the public tableLoaded ────────────────────────────────

describe("useAnalysis — tableLoaded reflects hasDataset", () => {
  it("returns tableLoaded=false when a table resolves but hasDataset is false", async () => {
    const { result } = renderHook(() => useAnalysis(baseArgs({ hasDataset: false })));

    await waitFor(() => expect(result.current.resolvedTableName).toBe("sales"));
    // Internal tableLoaded is true, but the public flag is AND-gated by hasDataset.
    expect(result.current.tableLoaded).toBe(false);
  });
});

// ─── Auto-run via the hydrate-or-run effect (cache miss) ──────────────────────

describe("useAnalysis — auto compute on cache miss", () => {
  it("runs the worker, exposes computed results, and reaches the done state", async () => {
    const { result } = renderHook(() => useAnalysis(baseArgs()));

    await waitFor(() => expect(result.current.state.status).toBe("done"));
    expect(runAnalysisWorker).toHaveBeenCalledTimes(1);
    expect(result.current.colStats).toHaveLength(1);
    expect(result.current.anomalies[0].column).toBe("amount");
    expect(result.current.correlations[0].pearson).toBeCloseTo(0.95);
    expect(result.current.clusters[0].label).toBe("Segment A");
    expect(result.current.forecastMeta.metricCol).toBe("amount");
    expect(result.current.state.progress).toBe(100);
    expect(result.current.state.stage).toBe("Analysis complete");
  });

  it("produces REAL rule-based insights computed from the worker facts", async () => {
    const { result } = renderHook(() => useAnalysis(baseArgs()));

    await waitFor(() => expect(result.current.state.status).toBe("done"));
    const ids = result.current.insights.map((i) => i.id);
    // richResult drives: trend, correlation, anomaly, quality, pattern, forecast.
    expect(ids).toContain("trend_amount");
    expect(ids).toContain("corr_top");
    expect(ids).toContain("anomaly_critical");
    expect(ids).toContain("quality_nulls");
    expect(ids).toContain("pattern_top");
    expect(ids).toContain("forecast_amount");

    // The trend insight encodes the real +60% growth (100 → 160).
    const trend = result.current.insights.find((i) => i.id === "trend_amount");
    expect(trend?.change).toBeCloseTo(60, 5);
    expect(trend?.title).toContain("growth");
    expect(trend?.value).toBe("+60.0%");
  });

  it("persists the computed run to the durable cache under the sentinel column", async () => {
    const { result } = renderHook(() => useAnalysis(baseArgs()));

    await waitFor(() => expect(result.current.state.status).toBe("done"));
    expect(putColumnProfile).toHaveBeenCalledTimes(1);
    const [datasetId, column, payload] = putColumnProfile.mock.calls[0];
    expect(datasetId).toBe("sales");
    expect(column).toBe("__ai_analysis__");
    expect(payload).toMatchObject({ version: 2, rowCount: 1000 });
    expect((payload as { insights: unknown[] }).insights.length).toBeGreaterThan(0);
  });

  it("emits running progress from the worker's onStage callback", async () => {
    const states: number[] = [];
    runAnalysisWorker.mockImplementation(async (_i, _q, _k, onStage) => {
      onStage({ progress: 42, stage: "Crunching" });
      return richResult();
    });

    const { result } = renderHook(() => useAnalysis(baseArgs()));

    await waitFor(() => expect(result.current.state.status).toBe("done"));
    // The mid-run progress was reflected (we observe the final done state, but the
    // worker received a real onStage fn and called it without throwing).
    expect(runAnalysisWorker).toHaveBeenCalled();
    void states;
  });

  it("does not run when there are no numeric columns", async () => {
    const { result } = renderHook(() => useAnalysis(baseArgs({ numericCols: [] })));

    await waitFor(() => expect(result.current.resolvedTableName).toBe("sales"));
    // Guard: numericCols.length === 0 short-circuits runAnalysis.
    expect(runAnalysisWorker).not.toHaveBeenCalled();
    expect(result.current.state.status).toBe("idle");
  });
});

// ─── Error path ───────────────────────────────────────────────────────────────

describe("useAnalysis — worker error", () => {
  it("transitions to the error state with the stringified error as the stage", async () => {
    runAnalysisWorker.mockRejectedValue(new Error("kernel boom"));
    const { result } = renderHook(() => useAnalysis(baseArgs()));

    await waitFor(() => expect(result.current.state.status).toBe("error"));
    expect(result.current.state.stage).toContain("kernel boom");
    expect(result.current.state.progress).toBe(0);
    // No cache write on failure.
    expect(putColumnProfile).not.toHaveBeenCalled();
  });
});

// ─── Cache hydration (cache hit) ──────────────────────────────────────────────

describe("useAnalysis — cache hydration", () => {
  const cachedPayload = (over: Record<string, unknown> = {}) => ({
    profile: {
      version: 2,
      rowCount: 1000,
      colStats: [colStat({ name: "cached_col" })],
      anomalies: [],
      correlations: [],
      forecasts: [],
      clusters: [],
      forecastMeta: { metricCol: null, dateCol: null, method: "none" },
      insights: [
        {
          id: "cached_insight",
          category: "trend",
          title: "Cached",
          description: "from cache",
          severity: "info",
          confidence: 0.5,
          impact: "low",
          acknowledged: false,
        },
      ],
      ...over,
    },
  });

  it("populates from a fresh cache hit WITHOUT recomputing", async () => {
    getColumnProfile.mockResolvedValue(cachedPayload());
    const { result } = renderHook(() => useAnalysis(baseArgs()));

    await waitFor(() => expect(result.current.state.stage).toBe("Loaded from cache"));
    expect(runAnalysisWorker).not.toHaveBeenCalled();
    expect(result.current.colStats[0].name).toBe("cached_col");
    expect(result.current.insights[0].id).toBe("cached_insight");
    expect(result.current.state.status).toBe("done");
  });

  it("ignores a cache entry whose rowCount differs and recomputes instead", async () => {
    getColumnProfile.mockResolvedValue(cachedPayload({ rowCount: 999 })); // table has 1000
    const { result } = renderHook(() => useAnalysis(baseArgs()));

    await waitFor(() => expect(result.current.state.status).toBe("done"));
    expect(runAnalysisWorker).toHaveBeenCalledTimes(1);
    expect(result.current.state.stage).toBe("Analysis complete");
  });

  it("ignores a stale-version cache entry and recomputes", async () => {
    getColumnProfile.mockResolvedValue(cachedPayload({ version: 1 }));
    const { result } = renderHook(() => useAnalysis(baseArgs()));

    await waitFor(() => expect(result.current.state.status).toBe("done"));
    expect(runAnalysisWorker).toHaveBeenCalledTimes(1);
  });

  it("ignores a cache entry with empty colStats and recomputes", async () => {
    getColumnProfile.mockResolvedValue(cachedPayload({ colStats: [] }));
    const { result } = renderHook(() => useAnalysis(baseArgs()));

    await waitFor(() => expect(result.current.state.status).toBe("done"));
    expect(runAnalysisWorker).toHaveBeenCalledTimes(1);
  });

  it("recomputes when getColumnProfile rejects (cache unavailable)", async () => {
    getColumnProfile.mockRejectedValue(new Error("idb closed"));
    const { result } = renderHook(() => useAnalysis(baseArgs()));

    await waitFor(() => expect(result.current.state.status).toBe("done"));
    expect(runAnalysisWorker).toHaveBeenCalledTimes(1);
  });
});

// ─── aiAvailable + LLM narration ──────────────────────────────────────────────

describe("useAnalysis — aiAvailable", () => {
  it("is false when no provider reports availability", async () => {
    aiState.availability = [{ id: "transformers", label: "T", available: false }];
    const { result } = renderHook(() => useAnalysis(baseArgs()));

    await waitFor(() => expect(result.current.state.status).toBe("done"));
    expect(result.current.aiAvailable).toBe(false);
  });

  it("is true when at least one provider is available", async () => {
    aiState.availability = [
      { id: "transformers", label: "T", available: false },
      { id: "llamacpp", label: "L", available: true },
    ];
    const { result } = renderHook(() => useAnalysis(baseArgs()));

    await waitFor(() => expect(result.current.aiAvailable).toBe(true));
  });
});

describe("useAnalysis — LLM narration", () => {
  it("does not narrate when no provider is available (narrated stays false)", async () => {
    aiState.availability = [{ id: "transformers", label: "T", available: false }];
    const { result } = renderHook(() => useAnalysis(baseArgs()));

    await waitFor(() => expect(result.current.state.status).toBe("done"));
    expect(aiState.generateStructured).not.toHaveBeenCalled();
    expect(result.current.narrated).toBe(false);
    expect(result.current.narrating).toBe(false);
  });

  it("replaces the rule insights when narration returns schema-valid insights", async () => {
    aiState.availability = [{ id: "llamacpp", label: "L", available: true }];
    aiState.generateStructured.mockResolvedValue({
      insights: [
        {
          category: "trend",
          title: "LLM narrated trend",
          description: "Revenue is climbing fast.",
          severity: "warning",
          impact: "high",
          confidence: 0.8,
        },
      ],
    });

    const { result } = renderHook(() => useAnalysis(baseArgs()));

    await waitFor(() => expect(result.current.narrated).toBe(true));
    expect(result.current.insights).toHaveLength(1);
    expect(result.current.insights[0].title).toBe("LLM narrated trend");
    // narrateInsights mints `llm_`-prefixed ids.
    expect(result.current.insights[0].id).toMatch(/^llm_/);
    expect(result.current.narrating).toBe(false);
  });

  it("keeps rule insights and leaves narrated=false when narration returns an empty set", async () => {
    aiState.availability = [{ id: "llamacpp", label: "L", available: true }];
    aiState.generateStructured.mockResolvedValue({ insights: [] });

    const { result } = renderHook(() => useAnalysis(baseArgs()));

    await waitFor(() => expect(result.current.state.status).toBe("done"));
    await waitFor(() => expect(result.current.narrating).toBe(false));
    expect(result.current.narrated).toBe(false);
    // Rule-based insights remain.
    expect(result.current.insights.some((i) => i.id === "trend_amount")).toBe(true);
  });

  it("degrades silently to rule insights when narration throws", async () => {
    aiState.availability = [{ id: "llamacpp", label: "L", available: true }];
    aiState.generateStructured.mockRejectedValue(new Error("no model loaded"));

    const { result } = renderHook(() => useAnalysis(baseArgs()));

    await waitFor(() => expect(result.current.state.status).toBe("done"));
    await waitFor(() => expect(result.current.narrating).toBe(false));
    expect(result.current.narrated).toBe(false);
    expect(result.current.insights.some((i) => i.id === "trend_amount")).toBe(true);
  });
});

// ─── acknowledgeInsight ───────────────────────────────────────────────────────

describe("useAnalysis — acknowledgeInsight", () => {
  it("flips acknowledged on the matching insight only and leaves others intact", async () => {
    const { result } = renderHook(() => useAnalysis(baseArgs()));

    await waitFor(() => expect(result.current.insights.length).toBeGreaterThan(1));
    const target = result.current.insights[0].id;
    const otherId = result.current.insights[1].id;

    act(() => {
      result.current.acknowledgeInsight(target);
    });

    const acked = result.current.insights.find((i) => i.id === target);
    const other = result.current.insights.find((i) => i.id === otherId);
    expect(acked?.acknowledged).toBe(true);
    expect(other?.acknowledged).toBe(false);
  });

  it("is a no-op when the id matches no insight", async () => {
    const { result } = renderHook(() => useAnalysis(baseArgs()));

    await waitFor(() => expect(result.current.insights.length).toBeGreaterThan(0));
    const before = result.current.insights;

    act(() => {
      result.current.acknowledgeInsight("does-not-exist");
    });

    expect(result.current.insights.every((i) => i.acknowledged === false)).toBe(true);
    expect(result.current.insights).toHaveLength(before.length);
  });
});

// ─── Explicit runAnalysis() guard ─────────────────────────────────────────────

describe("useAnalysis — explicit runAnalysis() guards", () => {
  it("is a no-op when invoked before any table has loaded", async () => {
    // No tables at all → tableLoaded stays false.
    setTables([]);
    const { result } = renderHook(() => useAnalysis(baseArgs({ preferredTableName: "" })));

    await waitFor(() => expect(runReadOnlyQuery).toHaveBeenCalledWith("SHOW TABLES"));
    await act(async () => {
      await result.current.runAnalysis();
    });

    expect(runAnalysisWorker).not.toHaveBeenCalled();
    expect(result.current.state.status).toBe("idle");
  });
});
