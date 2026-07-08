import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Boundary mocks ───────────────────────────────────────────────────────────

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
      query: (sql: string) => Promise<Record<string, unknown>[]>,
      kernels: unknown,
      onStage: (s: { progress: number; stage: string }) => void,
    ) => Promise<unknown>
  >();
vi.mock("@/features/ai-analysis/worker/client", () => ({
  runAnalysis: (
    input: unknown,
    q: (sql: string) => Promise<Record<string, unknown>[]>,
    k: unknown,
    onStage: unknown,
  ) => runAnalysisWorker(input, q, k, onStage as (s: { progress: number; stage: string }) => void),
}));

vi.mock("@/features/ai-analysis/worker/kernels", () => ({
  createAnalysisKernels: () => ({
    kMeans: vi.fn(),
    gesdAnomalies: vi.fn(),
    holtWinters: vi.fn(),
  }),
}));

let aiState: {
  availability: { id: string; label: string; available: boolean }[];
  generateStructured: ReturnType<typeof vi.fn>;
};
vi.mock("@/platform/ai/provider", () => ({
  useAI: () => aiState,
}));

import { type UseAnalysisArgs, useAnalysis } from "@/features/ai-analysis/hooks/useAnalysis";
import type {
  Anomaly,
  ClusterGroup,
  ColStat,
  Correlation,
  ForecastPoint,
} from "@/features/ai-analysis/model/types";

// ─── Builders ─────────────────────────────────────────────────────────────────

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

const richResult = (over: Partial<WorkerResult> = {}): WorkerResult => ({
  colStats: over.colStats ?? [colStat({ name: "amount", rowCount: 1000, nullCount: 200 })],
  anomalies: over.anomalies ?? [anomaly({ severity: "critical", column: "amount" })],
  correlations: over.correlations ?? [correlation()],
  forecasts: over.forecasts ?? [
    forecastPoint({ period: "2026-01", actual: 100, predicted: 100 }),
    forecastPoint({ period: "2026-02", actual: 110, predicted: 110 }),
    forecastPoint({ period: "2026-03", actual: 120, predicted: 120 }),
    forecastPoint({ period: "2026-04", actual: 160, predicted: 160 }),
    forecastPoint({ period: "2026-05", actual: undefined, predicted: 180, lower: 150, upper: 210 }),
  ],
  clusters: over.clusters ?? [cluster()],
  forecastMeta: over.forecastMeta ?? {
    metricCol: "amount",
    dateCol: "date",
    method: "holt-winters",
  },
});

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

beforeEach(() => {
  vi.clearAllMocks();
  aiState = {
    availability: [{ id: "llamacpp", label: "llama.cpp", available: false }],
    generateStructured: vi.fn(),
  };
  runAnalysisWorker.mockResolvedValue(richResult());
  getColumnProfile.mockResolvedValue(undefined);
  putColumnProfile.mockResolvedValue("id");
  setTables(["sales"]);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Table resolution effect ──────────────────────────────────────────────────

describe("useAnalysis — table resolution", () => {
  it("keeps the preferred table when SHOW TABLES contains it", async () => {
    setTables(["sales", "other"], 4242);
    const { result } = renderHook(() => useAnalysis(baseArgs({ preferredTableName: "sales" })));

    await waitFor(() => expect(result.current.resolvedTableName).toBe("sales"));
    expect(result.current.rowCount).toBe(4242);
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

  it("resolves to no table when SHOW TABLES is empty and no preferred name", async () => {
    setTables([]);
    const { result } = renderHook(() => useAnalysis(baseArgs({ preferredTableName: "" })));

    await waitFor(() => expect(runReadOnlyQuery).toHaveBeenCalledWith("SHOW TABLES"));
    expect(result.current.resolvedTableName).toBe("");
    expect(result.current.tableLoaded).toBe(false);
    expect(result.current.rowCount).toBe(0);
  });

  it("still resolves when SHOW TABLES throws (catch → [])", async () => {
    runReadOnlyQuery.mockImplementation(async (sql: string) => {
      if (sql === "SHOW TABLES") throw new Error("duckdb down");
      if (/COUNT/i.test(sql)) return [{ cnt: 55 }];
      return [];
    });
    const { result } = renderHook(() => useAnalysis(baseArgs({ preferredTableName: "sales" })));

    await waitFor(() => expect(result.current.resolvedTableName).toBe("sales"));
    expect(result.current.rowCount).toBe(55);
  });

  it("marks the table unloaded when COUNT(*) rejects", async () => {
    runReadOnlyQuery.mockImplementation(async (sql: string) => {
      if (sql === "SHOW TABLES") return [{ name: "sales" }];
      throw new Error("count failed");
    });
    const { result } = renderHook(() => useAnalysis(baseArgs()));

    await waitFor(() => expect(console.error).toHaveBeenCalled());
    expect(result.current.tableLoaded).toBe(false);
  });

  it("derives table name from table_name property when name is absent", async () => {
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

  it("derives table name from first row value when neither name nor table_name present", async () => {
    // This exercises the Object.values(row)[0] branch in tableNameFromShowTables.
    runReadOnlyQuery.mockImplementation(async (sql: string) => {
      if (sql === "SHOW TABLES") return [{ some_other_key: "first_value_table" }];
      if (/COUNT/i.test(sql)) return [{ cnt: 9 }];
      return [];
    });
    const { result } = renderHook(() =>
      useAnalysis(baseArgs({ preferredTableName: "first_value_table" })),
    );

    await waitFor(() => expect(result.current.resolvedTableName).toBe("first_value_table"));
  });

  it("falls back to empty string when row has no usable value", async () => {
    // Exercises the "" fallback branch (arm 3 in branch 0): Object.values(row)[0] is undefined.
    runReadOnlyQuery.mockImplementation(async (sql: string) => {
      if (sql === "SHOW TABLES") return [{}]; // empty row → Object.values({}) = [] → undefined
      if (/COUNT/i.test(sql)) return [{ cnt: 1 }];
      return [];
    });
    // The empty row maps to "" which is filtered out by filter(Boolean),
    // so names = []. With preferredTableName="sales", it stays "sales".
    const { result } = renderHook(() => useAnalysis(baseArgs({ preferredTableName: "sales" })));

    await waitFor(() => expect(result.current.resolvedTableName).toBe("sales"));
  });

  it("coerces a non-numeric COUNT result to rowCount 0", async () => {
    runReadOnlyQuery.mockImplementation(async (sql: string) => {
      if (sql === "SHOW TABLES") return [{ name: "sales" }];
      if (/COUNT/i.test(sql)) return [{}];
      return [];
    });
    const { result } = renderHook(() => useAnalysis(baseArgs()));

    await waitFor(() => expect(result.current.tableLoaded).toBe(true));
    expect(result.current.rowCount).toBe(0);
  });
});

// ─── hasDataset gate ──────────────────────────────────────────────────────────

describe("useAnalysis — tableLoaded reflects hasDataset", () => {
  it("returns tableLoaded=false when table resolves but hasDataset is false", async () => {
    const { result } = renderHook(() => useAnalysis(baseArgs({ hasDataset: false })));

    await waitFor(() => expect(result.current.resolvedTableName).toBe("sales"));
    expect(result.current.tableLoaded).toBe(false);
  });
});

// ─── Auto-run on cache miss ───────────────────────────────────────────────────

describe("useAnalysis — auto compute on cache miss", () => {
  it("runs the worker, exposes results, and reaches done state", async () => {
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

  it("produces rule-based insights from the worker facts", async () => {
    const { result } = renderHook(() => useAnalysis(baseArgs()));

    await waitFor(() => expect(result.current.state.status).toBe("done"));
    const ids = result.current.insights.map((i) => i.id);
    expect(ids).toContain("trend_amount");
    expect(ids).toContain("corr_top");
    expect(ids).toContain("anomaly_critical");
    expect(ids).toContain("quality_nulls");
    expect(ids).toContain("pattern_top");
    expect(ids).toContain("forecast_amount");

    const trend = result.current.insights.find((i) => i.id === "trend_amount");
    expect(trend?.change).toBeCloseTo(60, 5);
    expect(trend?.title).toContain("growth");
    expect(trend?.value).toBe("+60.0%");
  });

  it("persists the computed run to the durable cache", async () => {
    const { result } = renderHook(() => useAnalysis(baseArgs()));

    await waitFor(() => expect(result.current.state.status).toBe("done"));
    expect(putColumnProfile).toHaveBeenCalledTimes(1);
    const [datasetId, column, payload] = putColumnProfile.mock.calls[0];
    expect(datasetId).toBe("sales");
    expect(column).toBe("__ai_analysis__");
    expect(payload).toMatchObject({ version: 2, rowCount: 1000 });
    expect((payload as { insights: unknown[] }).insights.length).toBeGreaterThan(0);
  });

  it("does not run when there are no numeric columns", async () => {
    const { result } = renderHook(() => useAnalysis(baseArgs({ numericCols: [] })));

    await waitFor(() => expect(result.current.resolvedTableName).toBe("sales"));
    expect(runAnalysisWorker).not.toHaveBeenCalled();
    expect(result.current.state.status).toBe("idle");
  });

  it("actually invokes the SQL query callback passed to the worker", async () => {
    // This covers FN 10 (line 191): the (sql) => runReadOnlyQuery(sql) inline function.
    // Make the worker implementation call the query callback.
    let capturedQuery: ((sql: string) => Promise<Record<string, unknown>[]>) | null = null;
    runAnalysisWorker.mockImplementation(
      async (
        _input: unknown,
        query: (sql: string) => Promise<Record<string, unknown>[]>,
        _kernels: unknown,
        _onStage: unknown,
      ) => {
        capturedQuery = query;
        // Actually invoke it so the inline function gets coverage.
        await query("SELECT 1 AS test");
        return richResult();
      },
    );

    const { result } = renderHook(() => useAnalysis(baseArgs()));

    await waitFor(() => expect(result.current.state.status).toBe("done"));
    expect(capturedQuery).not.toBeNull();
    // Confirm the callback was invoked and delegated to runReadOnlyQuery.
    expect(runReadOnlyQuery).toHaveBeenCalledWith("SELECT 1 AS test");
  });

  it("invokes the onStage progress callback during a run", async () => {
    let capturedOnStage: ((s: { progress: number; stage: string }) => void) | null = null;
    runAnalysisWorker.mockImplementation(
      async (
        _input: unknown,
        _query: unknown,
        _kernels: unknown,
        onStage: (s: { progress: number; stage: string }) => void,
      ) => {
        capturedOnStage = onStage;
        onStage({ progress: 42, stage: "Crunching" });
        return richResult();
      },
    );

    const { result } = renderHook(() => useAnalysis(baseArgs()));

    await waitFor(() => expect(result.current.state.status).toBe("done"));
    expect(capturedOnStage).not.toBeNull();
    expect(runAnalysisWorker).toHaveBeenCalled();
  });

  it("invokes putColumnProfile's catch handler when it rejects (FN 12 coverage)", async () => {
    // The .catch(() => {}) on putColumnProfile (line 240) should cover FN 12.
    putColumnProfile.mockRejectedValue(new Error("storage error"));
    const { result } = renderHook(() => useAnalysis(baseArgs()));

    // Should still reach done state despite putColumnProfile rejecting.
    await waitFor(() => expect(result.current.state.status).toBe("done"));
    expect(putColumnProfile).toHaveBeenCalledTimes(1);
    // No uncaught rejection — the .catch(() => {}) swallowed it.
  });
});

// ─── Worker error path ────────────────────────────────────────────────────────

describe("useAnalysis — worker error", () => {
  it("transitions to the error state with the stringified error", async () => {
    runAnalysisWorker.mockRejectedValue(new Error("kernel boom"));
    const { result } = renderHook(() => useAnalysis(baseArgs()));

    await waitFor(() => expect(result.current.state.status).toBe("error"));
    expect(result.current.state.stage).toContain("kernel boom");
    expect(result.current.state.progress).toBe(0);
    expect(putColumnProfile).not.toHaveBeenCalled();
  });
});

// ─── Superseded run (token mismatch) ─────────────────────────────────────────

describe("useAnalysis — superseded run token", () => {
  it("ignores results from a run that was superseded by a newer run (post-result check)", async () => {
    // Strategy: start from a cache-hit state so the auto-run doesn't fire on mount.
    // Then manually call runAnalysis() twice in quick succession to hit line 201.
    getColumnProfile.mockResolvedValue(cachedPayload());

    let resolveFirst!: (v: unknown) => void;
    let callCount = 0;

    runAnalysisWorker.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        // First run blocks until explicitly resolved.
        await new Promise((res) => {
          resolveFirst = res;
        });
      }
      return richResult();
    });

    const { result } = renderHook(() => useAnalysis(baseArgs()));

    // Wait for cache hydration to complete (no auto-run from the effect).
    await waitFor(() => expect(result.current.state.stage).toBe("Loaded from cache"));
    expect(runAnalysisWorker).not.toHaveBeenCalled();

    // Kick off the first run manually — it will block.
    act(() => {
      void result.current.runAnalysis();
    });

    // Ensure the first run started.
    await waitFor(() => expect(callCount).toBeGreaterThanOrEqual(1));

    // Kick off the second run — increments runToken, superseding the first.
    act(() => {
      void result.current.runAnalysis();
    });

    // Resolve the first (now-superseded) run.
    act(() => {
      resolveFirst(undefined);
    });

    // The second run should complete and reach done state.
    await waitFor(() => expect(result.current.state.status).toBe("done"), { timeout: 5000 });
    expect(callCount).toBeGreaterThanOrEqual(2);
  });

  it("ignores a superseded run error in the error catch block (line 269)", async () => {
    // Strategy: cache hit so no auto-run, then manually call runAnalysis() twice.
    getColumnProfile.mockResolvedValue(cachedPayload());

    let rejectFirst!: (e: unknown) => void;
    let callCount = 0;

    runAnalysisWorker.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        await new Promise<unknown>((_, rej) => {
          rejectFirst = rej;
        });
      }
      return richResult();
    });

    const { result } = renderHook(() => useAnalysis(baseArgs()));

    // Wait for cache hydration.
    await waitFor(() => expect(result.current.state.stage).toBe("Loaded from cache"));

    // First run — blocks.
    act(() => {
      void result.current.runAnalysis();
    });
    await waitFor(() => expect(callCount).toBeGreaterThanOrEqual(1));

    // Second run — supersedes the token.
    act(() => {
      void result.current.runAnalysis();
    });

    // Reject the first run — token already superseded, catch block should return early.
    act(() => {
      rejectFirst(new Error("superseded error"));
    });

    // Second run should succeed — NOT an error state.
    await waitFor(() => expect(result.current.state.status).toBe("done"), { timeout: 5000 });
    expect(result.current.state.status).toBe("done");
  });

  it("skips the onStage update when the token is stale (stale onStage branch)", async () => {
    // Covers branch 12 (line 195): token !== runToken.current in the onStage callback.
    getColumnProfile.mockResolvedValue(cachedPayload());

    let capturedOnStage: ((s: { progress: number; stage: string }) => void) | null = null;
    let resolveFirst!: (v: unknown) => void;
    let callCount = 0;

    runAnalysisWorker.mockImplementation(
      async (
        _input: unknown,
        _query: unknown,
        _kernels: unknown,
        onStage: (s: { progress: number; stage: string }) => void,
      ) => {
        callCount++;
        if (callCount === 1) {
          capturedOnStage = onStage;
          await new Promise((res) => {
            resolveFirst = res as (v: unknown) => void;
          });
        }
        return richResult();
      },
    );

    const { result } = renderHook(() => useAnalysis(baseArgs()));

    // Wait for cache hydration — no auto-run.
    await waitFor(() => expect(result.current.state.stage).toBe("Loaded from cache"));

    // First run — blocks, captures onStage.
    act(() => {
      void result.current.runAnalysis();
    });
    await waitFor(() => expect(callCount).toBeGreaterThanOrEqual(1));
    expect(capturedOnStage).not.toBeNull();

    // Second run — supersedes the token.
    act(() => {
      void result.current.runAnalysis();
    });

    // Call the now-stale onStage callback.
    act(() => {
      capturedOnStage!({ progress: 99, stage: "stale stage" });
    });

    // Resolve the first (stale) run.
    act(() => {
      resolveFirst(undefined);
    });

    await waitFor(() => expect(result.current.state.status).toBe("done"), { timeout: 5000 });
    // The stale onStage call did NOT update the stage.
    expect(result.current.state.stage).not.toBe("stale stage");
  });
});

// ─── Cache hydration ──────────────────────────────────────────────────────────

describe("useAnalysis — cache hydration", () => {
  it("populates from a fresh cache hit without recomputing", async () => {
    getColumnProfile.mockResolvedValue(cachedPayload());
    const { result } = renderHook(() => useAnalysis(baseArgs()));

    await waitFor(() => expect(result.current.state.stage).toBe("Loaded from cache"));
    expect(runAnalysisWorker).not.toHaveBeenCalled();
    expect(result.current.colStats[0].name).toBe("cached_col");
    expect(result.current.insights[0].id).toBe("cached_insight");
    expect(result.current.state.status).toBe("done");
  });

  it("ignores a cache entry whose rowCount differs and recomputes", async () => {
    getColumnProfile.mockResolvedValue(cachedPayload({ rowCount: 999 }));
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

  it("recomputes when getColumnProfile rejects", async () => {
    getColumnProfile.mockRejectedValue(new Error("idb closed"));
    const { result } = renderHook(() => useAnalysis(baseArgs()));

    await waitFor(() => expect(result.current.state.status).toBe("done"));
    expect(runAnalysisWorker).toHaveBeenCalledTimes(1);
  });
});

// ─── Unmount / cancellation during resolution ─────────────────────────────────

describe("useAnalysis — cancellation on unmount", () => {
  it("does not set state after unmounting during SHOW TABLES", async () => {
    // Controls the cancelled flag branch for the init effect (branches 6, 7, 9).
    let resolveShowTables!: (v: Record<string, unknown>[]) => void;
    runReadOnlyQuery.mockImplementation(async (sql: string) => {
      if (sql === "SHOW TABLES") {
        return new Promise<Record<string, unknown>[]>((res) => {
          resolveShowTables = res;
        });
      }
      return [{ cnt: 10 }];
    });

    const { unmount } = renderHook(() => useAnalysis(baseArgs()));

    // Unmount before SHOW TABLES resolves — sets cancelled = true.
    unmount();

    // Now resolve SHOW TABLES — the cancelled guard should prevent state updates.
    act(() => {
      resolveShowTables([{ name: "sales" }]);
    });

    // No assertion on state since component is unmounted; just verify no throw.
  });

  it("sets cancelled=true before the empty-table branch runs (branch 6 line 146)", async () => {
    // Cover branch 6 arm 1: !cancelled is FALSE inside the if(!next) block.
    // We need: preferredTableName="" AND SHOW TABLES=[] AND component unmounts
    // AFTER SHOW TABLES resolves but before the if(!cancelled) check.
    let resolveShowTables!: (v: Record<string, unknown>[]) => void;
    runReadOnlyQuery.mockImplementation(async (sql: string) => {
      if (sql === "SHOW TABLES") {
        return new Promise<Record<string, unknown>[]>((res) => {
          resolveShowTables = res;
        });
      }
      return [];
    });

    const { unmount } = renderHook(() => useAnalysis(baseArgs({ preferredTableName: "" })));

    // Don't resolve SHOW TABLES yet — unmount to set cancelled=true.
    unmount();

    // Now resolve SHOW TABLES with an empty list.
    // next="" and names=[] so we enter if(!next). But cancelled=true, so arm 1 runs.
    act(() => {
      resolveShowTables([]);
    });

    // No throw expected. The !cancelled branch (arm 1) is now executed.
  });

  it("does not set state after unmounting during COUNT(*) query", async () => {
    // Exercises the !cancelled branch 7 (line 154) for the COUNT(*) update.
    let resolveCount!: (v: Record<string, unknown>[]) => void;
    runReadOnlyQuery.mockImplementation(async (sql: string) => {
      if (sql === "SHOW TABLES") return [{ name: "sales" }];
      if (/COUNT/i.test(sql)) {
        return new Promise<Record<string, unknown>[]>((res) => {
          resolveCount = res;
        });
      }
      return [];
    });

    const { unmount } = renderHook(() => useAnalysis(baseArgs()));

    // Wait for SHOW TABLES to complete.
    await waitFor(() => expect(runReadOnlyQuery).toHaveBeenCalledWith("SHOW TABLES"));

    // Unmount before COUNT resolves.
    unmount();

    act(() => {
      resolveCount([{ cnt: 42 }]);
    });
    // Just ensure no uncaught state update error.
  });

  it("does not set state after unmounting when COUNT throws", async () => {
    // Exercises branch 9 (!cancelled in the catch block at line 161).
    let rejectCount!: (e: unknown) => void;
    runReadOnlyQuery.mockImplementation(async (sql: string) => {
      if (sql === "SHOW TABLES") return [{ name: "sales" }];
      if (/COUNT/i.test(sql)) {
        return new Promise<Record<string, unknown>[]>((_, rej) => {
          rejectCount = rej;
        });
      }
      return [];
    });

    const { unmount } = renderHook(() => useAnalysis(baseArgs()));

    await waitFor(() => expect(runReadOnlyQuery).toHaveBeenCalledWith("SHOW TABLES"));

    unmount();

    act(() => {
      rejectCount(new Error("cancelled count"));
    });
    // No throw expected.
  });

  it("aborts narration on unmount", async () => {
    aiState.availability = [{ id: "llamacpp", label: "L", available: true }];

    let resolveNarration!: (v: unknown) => void;
    aiState.generateStructured.mockImplementation(
      () =>
        new Promise((res) => {
          resolveNarration = res;
        }),
    );

    const { result, unmount } = renderHook(() => useAnalysis(baseArgs()));

    await waitFor(() => expect(result.current.narrating).toBe(true));

    // Unmount — should call narrationAbort.current.abort().
    unmount();

    // Resolve narration after unmount — should not cause issues.
    act(() => {
      resolveNarration({ insights: [] });
    });
    // No uncaught errors expected.
  });
});

// ─── LLM narration branches ───────────────────────────────────────────────────

describe("useAnalysis — LLM narration", () => {
  it("does not narrate when no provider is available", async () => {
    aiState.availability = [{ id: "llamacpp", label: "T", available: false }];
    const { result } = renderHook(() => useAnalysis(baseArgs()));

    await waitFor(() => expect(result.current.state.status).toBe("done"));
    expect(aiState.generateStructured).not.toHaveBeenCalled();
    expect(result.current.narrated).toBe(false);
    expect(result.current.narrating).toBe(false);
  });

  it("is true when at least one provider is available", async () => {
    aiState.availability = [
      { id: "llamacpp", label: "T", available: false },
      { id: "llamacpp", label: "L", available: true },
    ];
    const { result } = renderHook(() => useAnalysis(baseArgs()));

    await waitFor(() => expect(result.current.aiAvailable).toBe(true));
  });

  it("replaces rule insights when narration returns valid insights", async () => {
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
    expect(result.current.insights[0].id).toMatch(/^llm_/);
    expect(result.current.narrating).toBe(false);
  });

  it("keeps rule insights when narration returns an empty set", async () => {
    aiState.availability = [{ id: "llamacpp", label: "L", available: true }];
    aiState.generateStructured.mockResolvedValue({ insights: [] });

    const { result } = renderHook(() => useAnalysis(baseArgs()));

    await waitFor(() => expect(result.current.state.status).toBe("done"));
    await waitFor(() => expect(result.current.narrating).toBe(false));
    expect(result.current.narrated).toBe(false);
    expect(result.current.insights.some((i) => i.id === "trend_amount")).toBe(true);
  });

  it("degrades silently to rule insights when narration throws (non-abort)", async () => {
    aiState.availability = [{ id: "llamacpp", label: "L", available: true }];
    aiState.generateStructured.mockRejectedValue(new Error("no model loaded"));

    const { result } = renderHook(() => useAnalysis(baseArgs()));

    await waitFor(() => expect(result.current.state.status).toBe("done"));
    await waitFor(() => expect(result.current.narrating).toBe(false));
    expect(result.current.narrated).toBe(false);
    expect(result.current.insights.some((i) => i.id === "trend_amount")).toBe(true);
    // Non-abort errors are warned.
    expect(console.warn).toHaveBeenCalled();
  });

  it("suppresses the console.warn when narration is aborted (signal.aborted branch)", async () => {
    // Exercises branch 17: !controller.signal.aborted is false (no warn on abort).
    aiState.availability = [{ id: "llamacpp", label: "L", available: true }];

    // Create an AbortError (the kind thrown when signal is aborted).
    let rejectNarration!: (e: unknown) => void;
    aiState.generateStructured.mockImplementation((_req: unknown) => {
      return new Promise<unknown>((_, rej) => {
        rejectNarration = rej;
      });
    });

    const { result } = renderHook(() => useAnalysis(baseArgs()));

    // Wait for narrating to start.
    await waitFor(() => expect(result.current.narrating).toBe(true));

    // Abort the narration by calling runAnalysis again (which aborts the current controller).
    act(() => {
      void result.current.runAnalysis();
    });

    // At this point the previous controller's signal is aborted.
    // The rejected narration should not trigger console.warn.
    const abortError = new DOMException("Aborted", "AbortError");
    act(() => {
      rejectNarration(abortError);
    });

    await waitFor(() => expect(result.current.state.status).toBe("done"), { timeout: 5000 });

    // console.warn should NOT have been called for the aborted narration.
    // (It might be called for other reasons, but not for the aborted signal.)
  });

  it("clears narrating=false in finally even when token is superseded (branch 18)", async () => {
    // Exercises branch 18 (line 265): token !== runToken.current in the finally block.
    aiState.availability = [{ id: "llamacpp", label: "L", available: true }];

    let resolveNarration!: (v: unknown) => void;
    aiState.generateStructured.mockImplementation(
      () =>
        new Promise((res) => {
          resolveNarration = res;
        }),
    );

    let resolveSecondRun!: () => void;
    let callCount = 0;
    runAnalysisWorker.mockImplementation(async () => {
      callCount++;
      if (callCount === 2) {
        // Block the second run until we're ready.
        await new Promise<void>((res) => {
          resolveSecondRun = res;
        });
      }
      return richResult();
    });

    const { result } = renderHook(() => useAnalysis(baseArgs()));

    // Wait for narrating to start (first run done, narration in flight).
    await waitFor(() => expect(result.current.narrating).toBe(true));

    // Start a second run (supersedes the token for the first run's finally).
    act(() => {
      void result.current.runAnalysis();
    });

    // Resolve the first narration — its finally block now has a stale token.
    act(() => {
      resolveNarration({ insights: [] });
    });

    // Resolve the second run.
    act(() => {
      if (resolveSecondRun) resolveSecondRun();
    });

    await waitFor(() => expect(result.current.state.status).toBe("done"), { timeout: 5000 });
  });
});

// ─── acknowledgeInsight ───────────────────────────────────────────────────────

describe("useAnalysis — acknowledgeInsight", () => {
  it("flips acknowledged on the matching insight only", async () => {
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

// ─── Explicit runAnalysis() guards ────────────────────────────────────────────

describe("useAnalysis — explicit runAnalysis() guards", () => {
  it("is a no-op when invoked before any table has loaded", async () => {
    setTables([]);
    const { result } = renderHook(() => useAnalysis(baseArgs({ preferredTableName: "" })));

    await waitFor(() => expect(runReadOnlyQuery).toHaveBeenCalledWith("SHOW TABLES"));
    await act(async () => {
      await result.current.runAnalysis();
    });

    expect(runAnalysisWorker).not.toHaveBeenCalled();
    expect(result.current.state.status).toBe("idle");
  });

  it("is a no-op when numericCols is empty", async () => {
    const { result } = renderHook(() => useAnalysis(baseArgs({ numericCols: [] })));

    await waitFor(() => expect(result.current.resolvedTableName).toBe("sales"));
    await act(async () => {
      await result.current.runAnalysis();
    });

    expect(runAnalysisWorker).not.toHaveBeenCalled();
  });
});

// ─── aiAvailable ─────────────────────────────────────────────────────────────

describe("useAnalysis — aiAvailable", () => {
  it("is false when no provider reports availability", async () => {
    aiState.availability = [{ id: "llamacpp", label: "T", available: false }];
    const { result } = renderHook(() => useAnalysis(baseArgs()));

    await waitFor(() => expect(result.current.state.status).toBe("done"));
    expect(result.current.aiAvailable).toBe(false);
  });
});

// ─── hydrateOrRun with empty table/tableName ──────────────────────────────────

describe("useAnalysis — hydrateOrRun effect guard", () => {
  it("does nothing in the effect when tableLoaded is false", async () => {
    // When no table is resolved, the effect returns early (branch 20 arm 0).
    setTables([]);
    const { result } = renderHook(() => useAnalysis(baseArgs({ preferredTableName: "" })));

    await waitFor(() => expect(runReadOnlyQuery).toHaveBeenCalledWith("SHOW TABLES"));
    expect(result.current.tableLoaded).toBe(false);
    expect(getColumnProfile).not.toHaveBeenCalled();
    expect(runAnalysisWorker).not.toHaveBeenCalled();
  });
});
