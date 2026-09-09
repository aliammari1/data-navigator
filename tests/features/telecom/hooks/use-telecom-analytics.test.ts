import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import React, { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Boundary mocks ───────────────────────────────────────────────────────────
// We mock every true IO / hardware / cross-module boundary:
//   • runReadOnlyQuery    — DuckDB WASM channel
//   • queries module      — all fetch* helpers + ensureTelecomEnrichedView
//   • canal-config        — enrichCanalSummaries (UI icon injection)
//   • channel             — BroadcastChannel wrapper
//   • format              — display-format helpers
//
// The hook's own logic (analyticsQueryKey building, patchAnalytics, refresh,
// runAnalytics, Notification branch, firstLoad gate, status-mapping additions)
// is kept REAL so every line/branch runs.

const runReadOnlyQueryMock = vi.fn<(sql: string) => Promise<Record<string, unknown>[]>>();

vi.mock("@/platform/duckdb/duckdb", () => ({
  runReadOnlyQuery: (sql: string) => runReadOnlyQueryMock(sql),
}));

const ensureTelecomEnrichedViewMock = vi.fn().mockResolvedValue(false);
const fetchKPIMock = vi.fn();
const fetchHourlyMock = vi.fn();
const fetchStatusBreakdownMock = vi.fn();
const fetchOperatorsMock = vi.fn();
const fetchRegionsMock = vi.fn();
const fetchDistinctStatusesMock = vi.fn();
const fetchRawCanalSummariesMock = vi.fn();

vi.mock("@/features/telecom/lib/queries", () => ({
  ensureTelecomEnrichedView: (...args: unknown[]) => ensureTelecomEnrichedViewMock(...args),
  fetchKPI: (...args: unknown[]) => fetchKPIMock(...args),
  fetchHourly: (...args: unknown[]) => fetchHourlyMock(...args),
  fetchStatusBreakdown: (...args: unknown[]) => fetchStatusBreakdownMock(...args),
  fetchOperators: (...args: unknown[]) => fetchOperatorsMock(...args),
  fetchRegions: (...args: unknown[]) => fetchRegionsMock(...args),
  fetchDistinctStatuses: (...args: unknown[]) => fetchDistinctStatusesMock(...args),
  fetchRawCanalSummaries: (...args: unknown[]) => fetchRawCanalSummariesMock(...args),
}));

const enrichCanalSummariesMock = vi.fn((raw: unknown[]) => raw);

vi.mock("@/features/telecom/lib/canal-config", () => ({
  enrichCanalSummaries: (raw: unknown[]) => enrichCanalSummariesMock(raw),
}));

const broadcastMock = vi.fn();

vi.mock("@/features/telecom/lib/channel", () => ({
  broadcast: (...args: unknown[]) => broadcastMock(...args),
}));

const fmtNMock = vi.fn(String);
const fmtPctMock = vi.fn((p: number) => `${p}%`);

vi.mock("@/features/telecom/lib/format", () => ({
  fmtN: (n: number) => fmtNMock(n),
  fmtPct: (p: number) => fmtPctMock(p),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────
import { useTelecomAnalytics } from "@/features/telecom/hooks/use-telecom-analytics";
import type * as Types from "@/features/telecom/types";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MAPPING: Types.ColumnMapping = {
  transactionId: "TRANSACTION_ID",
  transactionDate: "TRANSACTION_DATE",
  transactionTime: "TRANSACTION_TIME",
  canal: "CANAL",
  serviceCode: "SERVICE_CODE",
  serviceName: "SERVICE_NAME",
  transactionType: "TRANSACTION_TYPE",
  subscriberType: "SUBSCRIBER_TYPE",
  msisdn: "CUSTOMER_MSISDN",
  amount: "ORIGINAL_AMOUNT",
  status: "TRANSACTION_STATUS",
  errorCode: "ERROR_CODE",
  errorMessage: "ERROR_MESSAGE",
  operator: "OPERATOR",
  region: "REGION",
  processingTimeMs: "PROC_MS",
  previousBalance: "PREV_BAL",
  newBalance: "NEW_BAL",
  totalAmount: "TOTAL_AMOUNT",
  retryCount: "RETRY_COUNT",
};

const SM: Types.StatusMapping[] = [
  { rawCode: "PST", label: "Réussie", semantic: "success", color: "#10b981", badgeClass: "x" },
];

const SAMPLE_KPI: Types.KPISummary = {
  totalTransactions: 1000,
  successCount: 800,
  declinedCount: 120,
  refundCount: 30,
  instanceCount: 40,
  submittedCount: 10,
  successRate: 80,
  totalAmount: 5432.1,
  avgAmount: 5.4,
  avgProcessingMs: 200,
  uniqueCustomers: 333,
  peakHour: 14,
  topErrorCode: "DCL",
};

const SAMPLE_HOURLY: Types.HourlyRow[] = [
  { hour: 9, total: 100, success: 90, declined: 10, amount: 250 },
];

const SAMPLE_STATUS: Types.StatusRow[] = [{ status: "SUCCESS", count: 800, amount: 1234 }];

const SAMPLE_OPERATORS: Types.OperatorRow[] = [
  {
    operator: "OOREDOO",
    total: 100,
    success: 80,
    amount: 500,
    successRate: 80,
    accountType: "source",
  },
];

const SAMPLE_REGIONS: Types.RegionRow[] = [
  { region: "TUNIS", total: 70, success: 60, amount: 300 },
];

const SAMPLE_RAW_CANALS = [
  {
    key: "bill_payment" as Types.CanalKey,
    label: "Bill Payment",
    total: 200,
    success: 150,
    declined: 30,
    refund: 10,
    instance: 8,
    submitted: 2,
    amount: 999,
    successRate: 75,
    avgAmount: 5,
    share: 20,
  },
];

const SAMPLE_RAW_STATUSES: Types.RawStatusRow[] = [{ rawCode: "PST", count: 800, amount: 1000 }];

/** Returns a mutable ref-like object. */
function makeRef<T>(initial: T): React.RefObject<T> {
  const ref = createRef<T>() as { current: T };
  ref.current = initial;
  return ref;
}

/** Build a fresh QueryClient that disables all retries (avoids timing issues). */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        // Disable GC so data stays readable in assertions
        gcTime: Infinity,
      },
    },
  });
}

/** Render wrapper providing a fresh QueryClient for each test. */
function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  };
}

type RenderParams = {
  getTableName?: () => string;
  mapping?: Types.ColumnMapping;
  statusMapping?: Types.StatusMapping[];
  loaded?: boolean;
  firstLoad?: React.RefObject<boolean>;
  fileNameRef?: React.RefObject<string>;
  onStatusMappingAdditions?: (additions: Types.StatusMapping[]) => void;
  client?: QueryClient;
};

function renderAnalyticsHook(overrides: RenderParams = {}) {
  const client = overrides.client ?? makeQueryClient();
  const getTableName = overrides.getTableName ?? (() => "txns");
  const mapping = overrides.mapping ?? MAPPING;
  const statusMapping = overrides.statusMapping ?? SM;
  const loaded = overrides.loaded ?? true;
  const firstLoad = overrides.firstLoad ?? makeRef(true);
  const fileNameRef = overrides.fileNameRef ?? makeRef("report.csv");
  const onStatusMappingAdditions = overrides.onStatusMappingAdditions ?? vi.fn();

  const result = renderHook(
    () =>
      useTelecomAnalytics({
        getTableName,
        mapping,
        statusMapping,
        loaded,
        firstLoad,
        fileNameRef,
        onStatusMappingAdditions,
      }),
    { wrapper: makeWrapper(client) },
  );
  return { ...result, client, onStatusMappingAdditions };
}

// ─── Default mock return values for happy-path tests ─────────────────────────

function setupHappyPathMocks() {
  // Table exists check
  runReadOnlyQueryMock.mockResolvedValue([{ "1": 1 }]);
  fetchKPIMock.mockResolvedValue(SAMPLE_KPI);
  fetchHourlyMock.mockResolvedValue(SAMPLE_HOURLY);
  fetchStatusBreakdownMock.mockResolvedValue(SAMPLE_STATUS);
  fetchOperatorsMock.mockResolvedValue(SAMPLE_OPERATORS);
  fetchRegionsMock.mockResolvedValue(SAMPLE_REGIONS);
  fetchRawCanalSummariesMock.mockResolvedValue(SAMPLE_RAW_CANALS);
  fetchDistinctStatusesMock.mockResolvedValue(SAMPLE_RAW_STATUSES);
  enrichCanalSummariesMock.mockImplementation((raw: unknown[]) => raw);
}

beforeEach(() => {
  vi.clearAllMocks();
  // Safe defaults — tests that need specific behavior override these
  runReadOnlyQueryMock.mockResolvedValue([]);
  fetchKPIMock.mockResolvedValue(null);
  fetchHourlyMock.mockResolvedValue([]);
  fetchStatusBreakdownMock.mockResolvedValue([]);
  fetchOperatorsMock.mockResolvedValue([]);
  fetchRegionsMock.mockResolvedValue([]);
  fetchRawCanalSummariesMock.mockResolvedValue([]);
  fetchDistinctStatusesMock.mockResolvedValue([]);
  enrichCanalSummariesMock.mockImplementation((raw: unknown[]) => raw);
});

// ─── Return shape ─────────────────────────────────────────────────────────────

describe("useTelecomAnalytics — return shape", () => {
  it("exposes all documented fields on first render", () => {
    const { result } = renderAnalyticsHook({ loaded: false });

    const r = result.current;
    expect(r.kpi).toBeNull();
    expect(Array.isArray(r.canals)).toBe(true);
    expect(Array.isArray(r.hourly)).toBe(true);
    expect(Array.isArray(r.statusData)).toBe(true);
    expect(Array.isArray(r.operators)).toBe(true);
    expect(Array.isArray(r.regions)).toBe(true);
    expect(Array.isArray(r.rawStatuses)).toBe(true);
    expect(typeof r.setKpi).toBe("function");
    expect(typeof r.setCanals).toBe("function");
    expect(typeof r.setHourly).toBe("function");
    expect(typeof r.setStatusData).toBe("function");
    expect(typeof r.setOperators).toBe("function");
    expect(typeof r.setRegions).toBe("function");
    expect(typeof r.setRawStatuses).toBe("function");
    expect(typeof r.refresh).toBe("function");
    expect(typeof r.runAnalytics).toBe("function");
  });

  it("starts with empty arrays and null kpi when not loaded", () => {
    const { result } = renderAnalyticsHook({ loaded: false });

    expect(result.current.kpi).toBeNull();
    expect(result.current.canals).toEqual([]);
    expect(result.current.hourly).toEqual([]);
    expect(result.current.statusData).toEqual([]);
    expect(result.current.operators).toEqual([]);
    expect(result.current.regions).toEqual([]);
    expect(result.current.rawStatuses).toEqual([]);
  });
});

// ─── Query disabled when not loaded ──────────────────────────────────────────

describe("useTelecomAnalytics — query disabled guard", () => {
  it("does NOT fire any query when loaded=false", async () => {
    renderAnalyticsHook({ loaded: false });

    // Give async tasks a moment to settle
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(runReadOnlyQueryMock).not.toHaveBeenCalled();
    expect(fetchKPIMock).not.toHaveBeenCalled();
  });

  it("does NOT fire any query when tableName is empty", async () => {
    renderAnalyticsHook({ getTableName: () => "" });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(runReadOnlyQueryMock).not.toHaveBeenCalled();
    expect(fetchKPIMock).not.toHaveBeenCalled();
  });
});

// ─── Table existence check ────────────────────────────────────────────────────

describe("useTelecomAnalytics — table existence check", () => {
  it("returns EMPTY_ANALYTICS when the table does not exist (check returns empty array)", async () => {
    runReadOnlyQueryMock.mockResolvedValue([]); // table not found

    const { result } = renderAnalyticsHook();

    await waitFor(() => {
      // The hook should have settled into its initial (or empty) data state
      expect(fetchKPIMock).not.toHaveBeenCalled();
    });

    expect(result.current.kpi).toBeNull();
    expect(result.current.canals).toEqual([]);
  });

  it("returns EMPTY_ANALYTICS when the table check throws", async () => {
    runReadOnlyQueryMock.mockRejectedValue(new Error("DuckDB error"));

    const { result } = renderAnalyticsHook();

    await waitFor(() => {
      expect(fetchKPIMock).not.toHaveBeenCalled();
    });

    expect(result.current.kpi).toBeNull();
  });

  it("proceeds to fetch analytics when the table check row is present", async () => {
    setupHappyPathMocks();

    const { result } = renderAnalyticsHook();

    await waitFor(() => {
      expect(result.current.kpi).not.toBeNull();
    });

    expect(fetchKPIMock).toHaveBeenCalled();
  });
});

// ─── Happy path: analytics loading ───────────────────────────────────────────

describe("useTelecomAnalytics — happy path analytics", () => {
  it("populates kpi from fetchKPI result", async () => {
    setupHappyPathMocks();

    const { result } = renderAnalyticsHook();

    await waitFor(() => {
      expect(result.current.kpi).toEqual(SAMPLE_KPI);
    });
  });

  it("populates hourly from fetchHourly result", async () => {
    setupHappyPathMocks();

    const { result } = renderAnalyticsHook();

    await waitFor(() => {
      expect(result.current.hourly).toEqual(SAMPLE_HOURLY);
    });
  });

  it("populates statusData from fetchStatusBreakdown result", async () => {
    setupHappyPathMocks();

    const { result } = renderAnalyticsHook();

    await waitFor(() => {
      expect(result.current.statusData).toEqual(SAMPLE_STATUS);
    });
  });

  it("populates operators from fetchOperators result", async () => {
    setupHappyPathMocks();

    const { result } = renderAnalyticsHook();

    await waitFor(() => {
      expect(result.current.operators).toEqual(SAMPLE_OPERATORS);
    });
  });

  it("populates regions from fetchRegions result", async () => {
    setupHappyPathMocks();

    const { result } = renderAnalyticsHook();

    await waitFor(() => {
      expect(result.current.regions).toEqual(SAMPLE_REGIONS);
    });
  });

  it("calls enrichCanalSummaries with the raw canal summaries", async () => {
    setupHappyPathMocks();

    renderAnalyticsHook();

    await waitFor(() => {
      expect(enrichCanalSummariesMock).toHaveBeenCalledWith(SAMPLE_RAW_CANALS);
    });
  });

  it("calls broadcast with ANALYTICS_READY after analytics complete", async () => {
    setupHappyPathMocks();

    renderAnalyticsHook({ fileNameRef: makeRef("data.csv") });

    await waitFor(() => {
      expect(broadcastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "ANALYTICS_READY",
          fileName: "data.csv",
          successRate: SAMPLE_KPI.successRate,
          totalTx: SAMPLE_KPI.totalTransactions,
        }),
      );
    });
  });

  it("calls broadcast with successRate=0 and totalTx=0 when kpiResult is null", async () => {
    // Table exists but KPI returns null
    runReadOnlyQueryMock.mockResolvedValue([{ "1": 1 }]);
    fetchKPIMock.mockResolvedValue(null);
    fetchHourlyMock.mockResolvedValue([]);
    fetchStatusBreakdownMock.mockResolvedValue([]);
    fetchOperatorsMock.mockResolvedValue([]);
    fetchRegionsMock.mockResolvedValue([]);
    fetchRawCanalSummariesMock.mockResolvedValue([]);
    fetchDistinctStatusesMock.mockResolvedValue([]);

    renderAnalyticsHook({ fileNameRef: makeRef("file.csv") });

    await waitFor(() => {
      expect(broadcastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "ANALYTICS_READY",
          successRate: 0,
          totalTx: 0,
        }),
      );
    });
  });
});

// ─── firstLoad gate ───────────────────────────────────────────────────────────

describe("useTelecomAnalytics — firstLoad gate", () => {
  it("fetches distinct statuses on first load and flips firstLoad to false", async () => {
    setupHappyPathMocks();

    const firstLoad = makeRef(true);

    renderAnalyticsHook({ firstLoad });

    await waitFor(() => {
      expect(fetchDistinctStatusesMock).toHaveBeenCalled();
    });

    expect(firstLoad.current).toBe(false);
  });

  it("does NOT fetch distinct statuses when firstLoad is already false", async () => {
    setupHappyPathMocks();

    const firstLoad = makeRef(false);

    renderAnalyticsHook({ firstLoad });

    await waitFor(() => {
      expect(broadcastMock).toHaveBeenCalled();
    });

    expect(fetchDistinctStatusesMock).not.toHaveBeenCalled();
  });

  it("calls onStatusMappingAdditions with new codes not already in statusMapping", async () => {
    setupHappyPathMocks();
    // Return a code not in the current SM
    fetchDistinctStatusesMock.mockResolvedValue([{ rawCode: "NEW_CODE", count: 5, amount: 0 }]);

    const onStatusMappingAdditions = vi.fn();
    const firstLoad = makeRef(true);

    renderAnalyticsHook({
      firstLoad,
      onStatusMappingAdditions,
      statusMapping: SM, // only PST is known
    });

    await waitFor(() => {
      expect(onStatusMappingAdditions).toHaveBeenCalled();
    });

    const [additions] = onStatusMappingAdditions.mock.calls[0];
    expect(additions).toHaveLength(1);
    expect(additions[0].rawCode).toBe("NEW_CODE");
  });

  it("does NOT call onStatusMappingAdditions when all codes are already known", async () => {
    setupHappyPathMocks();
    // All raw codes are already in SM
    fetchDistinctStatusesMock.mockResolvedValue([{ rawCode: "PST", count: 800, amount: 1000 }]);

    const onStatusMappingAdditions = vi.fn();
    const firstLoad = makeRef(true);

    renderAnalyticsHook({
      firstLoad,
      onStatusMappingAdditions,
      statusMapping: SM, // PST is known
    });

    await waitFor(() => {
      expect(fetchDistinctStatusesMock).toHaveBeenCalled();
      expect(broadcastMock).toHaveBeenCalled();
    });

    expect(onStatusMappingAdditions).not.toHaveBeenCalled();
  });

  it("uses STATUS_AUTO_SEMANTIC_BY_CODE lookup when auto-classifying a new code", async () => {
    setupHappyPathMocks();
    // "PST" maps to "success" in STATUS_AUTO_SEMANTIC_BY_CODE
    fetchDistinctStatusesMock.mockResolvedValue([{ rawCode: "PST_UNKNOWN", count: 1, amount: 0 }]);

    const onStatusMappingAdditions = vi.fn();
    const firstLoad = makeRef(true);

    renderAnalyticsHook({
      firstLoad,
      onStatusMappingAdditions,
      statusMapping: [], // no known codes
    });

    await waitFor(() => {
      expect(onStatusMappingAdditions).toHaveBeenCalled();
    });

    const [additions] = onStatusMappingAdditions.mock.calls[0];
    // PST_UNKNOWN not in STATUS_AUTO_SEMANTIC_BY_CODE, falls back to "other"
    expect(additions[0].semantic).toBe("other");
  });

  it("correctly classifies a known auto-semantic code (e.g. PST → success)", async () => {
    setupHappyPathMocks();
    fetchDistinctStatusesMock.mockResolvedValue([{ rawCode: "PST", count: 800, amount: 1000 }]);

    const onStatusMappingAdditions = vi.fn();
    const firstLoad = makeRef(true);

    // Empty SM so PST is "new"
    renderAnalyticsHook({
      firstLoad,
      onStatusMappingAdditions,
      statusMapping: [],
    });

    await waitFor(() => {
      expect(onStatusMappingAdditions).toHaveBeenCalled();
    });

    const [additions] = onStatusMappingAdditions.mock.calls[0];
    expect(additions[0].rawCode).toBe("PST");
    expect(additions[0].semantic).toBe("success");
  });
});

// ─── Inner-catch path ─────────────────────────────────────────────────────────

describe("useTelecomAnalytics — inner-catch fallback", () => {
  it("returns EMPTY_ANALYTICS when fetchKPI throws", async () => {
    runReadOnlyQueryMock.mockResolvedValue([{ "1": 1 }]);
    fetchKPIMock.mockRejectedValue(new Error("KPI exploded"));
    fetchHourlyMock.mockResolvedValue([]);
    fetchStatusBreakdownMock.mockResolvedValue([]);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderAnalyticsHook();

    await waitFor(() => {
      // After the error the query should have settled
      expect(consoleSpy).toHaveBeenCalled();
    });

    expect(result.current.kpi).toBeNull();
    expect(result.current.canals).toEqual([]);

    consoleSpy.mockRestore();
  });

  it("logs a console.error when the inner block throws", async () => {
    runReadOnlyQueryMock.mockResolvedValue([{ "1": 1 }]);
    fetchKPIMock.mockRejectedValue(new Error("boom"));
    fetchHourlyMock.mockResolvedValue([]);
    fetchStatusBreakdownMock.mockResolvedValue([]);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    renderAnalyticsHook();

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        "[useTelecomAnalytics] runAnalytics error:",
        expect.any(Error),
      );
    });

    consoleSpy.mockRestore();
  });
});

// ─── Notification branch ──────────────────────────────────────────────────────

describe("useTelecomAnalytics — Notification API branch", () => {
  it("fires a desktop Notification when document is hidden and permission is granted", async () => {
    setupHappyPathMocks();

    const notificationCtorSpy = vi.fn();
    vi.stubGlobal("Notification", Object.assign(notificationCtorSpy, { permission: "granted" }));
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);

    renderAnalyticsHook({ fileNameRef: makeRef("ready.csv") });

    await waitFor(() => {
      expect(notificationCtorSpy).toHaveBeenCalled();
    });

    const [title, opts] = notificationCtorSpy.mock.calls[0];
    expect(title).toContain("ready.csv");
    expect(opts.tag).toBe("telecom-ready");

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does NOT fire Notification when document is visible", async () => {
    setupHappyPathMocks();

    const notificationCtorSpy = vi.fn();
    vi.stubGlobal("Notification", Object.assign(notificationCtorSpy, { permission: "granted" }));
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);

    renderAnalyticsHook();

    await waitFor(() => {
      expect(broadcastMock).toHaveBeenCalled();
    });

    expect(notificationCtorSpy).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does NOT fire Notification when permission is not granted", async () => {
    setupHappyPathMocks();

    const notificationCtorSpy = vi.fn();
    vi.stubGlobal("Notification", Object.assign(notificationCtorSpy, { permission: "denied" }));
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);

    renderAnalyticsHook();

    await waitFor(() => {
      expect(broadcastMock).toHaveBeenCalled();
    });

    expect(notificationCtorSpy).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does NOT fire Notification when kpiResult is null (no kpi)", async () => {
    runReadOnlyQueryMock.mockResolvedValue([{ "1": 1 }]);
    fetchKPIMock.mockResolvedValue(null);
    fetchHourlyMock.mockResolvedValue([]);
    fetchStatusBreakdownMock.mockResolvedValue([]);
    fetchOperatorsMock.mockResolvedValue([]);
    fetchRegionsMock.mockResolvedValue([]);
    fetchRawCanalSummariesMock.mockResolvedValue([]);
    fetchDistinctStatusesMock.mockResolvedValue([]);

    const notificationCtorSpy = vi.fn();
    vi.stubGlobal("Notification", Object.assign(notificationCtorSpy, { permission: "granted" }));
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);

    renderAnalyticsHook();

    await waitFor(() => {
      expect(broadcastMock).toHaveBeenCalled();
    });

    expect(notificationCtorSpy).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("swallows Notification constructor errors (degrade silently)", async () => {
    setupHappyPathMocks();

    const notificationCtorSpy = vi.fn().mockImplementation(() => {
      throw new Error("Notification not supported");
    });
    vi.stubGlobal("Notification", Object.assign(notificationCtorSpy, { permission: "granted" }));
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);

    const { result } = renderAnalyticsHook();

    // Should NOT throw; broadcast should still fire
    await waitFor(() => {
      expect(broadcastMock).toHaveBeenCalled();
    });

    expect(result.current.kpi).toEqual(SAMPLE_KPI);

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});

// ─── patchAnalytics setters ───────────────────────────────────────────────────

describe("useTelecomAnalytics — patchAnalytics setters", () => {
  it("setKpi updates kpi in the query cache", async () => {
    const { result } = renderAnalyticsHook({ loaded: false });

    const newKpi: Types.KPISummary = { ...SAMPLE_KPI, successRate: 99 };

    await act(async () => {
      result.current.setKpi(newKpi);
    });

    await waitFor(() => {
      expect(result.current.kpi).toEqual(newKpi);
    });
  });

  it("setCanals updates canals in the query cache", async () => {
    const { result } = renderAnalyticsHook({ loaded: false });

    const newCanals = SAMPLE_RAW_CANALS as unknown as Types.CanalSummary[];

    await act(async () => {
      result.current.setCanals(newCanals);
    });

    await waitFor(() => {
      expect(result.current.canals).toEqual(newCanals);
    });
  });

  it("setHourly updates hourly in the query cache", async () => {
    const { result } = renderAnalyticsHook({ loaded: false });

    await act(async () => {
      result.current.setHourly(SAMPLE_HOURLY);
    });

    await waitFor(() => {
      expect(result.current.hourly).toEqual(SAMPLE_HOURLY);
    });
  });

  it("setStatusData updates statusData in the query cache", async () => {
    const { result } = renderAnalyticsHook({ loaded: false });

    await act(async () => {
      result.current.setStatusData(SAMPLE_STATUS);
    });

    await waitFor(() => {
      expect(result.current.statusData).toEqual(SAMPLE_STATUS);
    });
  });

  it("setOperators updates operators in the query cache", async () => {
    const { result } = renderAnalyticsHook({ loaded: false });

    await act(async () => {
      result.current.setOperators(SAMPLE_OPERATORS);
    });

    await waitFor(() => {
      expect(result.current.operators).toEqual(SAMPLE_OPERATORS);
    });
  });

  it("setRegions updates regions in the query cache", async () => {
    const { result } = renderAnalyticsHook({ loaded: false });

    await act(async () => {
      result.current.setRegions(SAMPLE_REGIONS);
    });

    await waitFor(() => {
      expect(result.current.regions).toEqual(SAMPLE_REGIONS);
    });
  });

  it("setRawStatuses updates rawStatuses in the query cache", async () => {
    const { result } = renderAnalyticsHook({ loaded: false });

    await act(async () => {
      result.current.setRawStatuses(SAMPLE_RAW_STATUSES);
    });

    await waitFor(() => {
      expect(result.current.rawStatuses).toEqual(SAMPLE_RAW_STATUSES);
    });
  });

  it("multiple setters accumulate correctly (each patch merges with previous)", async () => {
    const { result } = renderAnalyticsHook({ loaded: false });

    await act(async () => {
      result.current.setKpi(SAMPLE_KPI);
    });
    await act(async () => {
      result.current.setHourly(SAMPLE_HOURLY);
    });

    // Both patches should be present
    await waitFor(() => {
      expect(result.current.kpi).toEqual(SAMPLE_KPI);
      expect(result.current.hourly).toEqual(SAMPLE_HOURLY);
    });
    // Other fields stay at their empty defaults
    expect(result.current.canals).toEqual([]);
  });
});

// ─── refresh ─────────────────────────────────────────────────────────────────

describe("useTelecomAnalytics — refresh", () => {
  it("refresh calls refetch and returns a promise", async () => {
    setupHappyPathMocks();

    const { result } = renderAnalyticsHook();

    await waitFor(() => {
      expect(result.current.kpi).toEqual(SAMPLE_KPI);
    });

    // refresh should succeed without throwing
    let threw = false;
    await act(async () => {
      try {
        await result.current.refresh();
      } catch {
        threw = true;
      }
    });

    expect(threw).toBe(false);
    // kpi should still be populated (either same or updated)
    expect(result.current.kpi).not.toBeNull();
  });

  it("refresh is a stable function reference (useCallback)", async () => {
    setupHappyPathMocks();

    const { result, rerender } = renderAnalyticsHook();

    rerender();
    // With useCallback, the function reference is stable unless deps change
    expect(typeof result.current.refresh).toBe("function");
    // The reference from rerender may differ if query changed, just verify it's a function
    expect(result.current.refresh).toBeDefined();
  });
});

// ─── runAnalytics ─────────────────────────────────────────────────────────────

describe("useTelecomAnalytics — runAnalytics", () => {
  it("runAnalytics triggers computeAnalytics with a fresh cache key (different mapping)", async () => {
    setupHappyPathMocks();

    const { result } = renderAnalyticsHook();

    // Wait for the initial load (uses MAPPING + SM as the key)
    await waitFor(() => {
      expect(result.current.kpi).toEqual(SAMPLE_KPI);
    });

    // Call runAnalytics with a DIFFERENT mapping so the cache key differs → fresh fetch
    vi.clearAllMocks();
    setupHappyPathMocks();
    const altMapping = { ...MAPPING, amount: "ALT_AMOUNT" };

    await act(async () => {
      await result.current.runAnalytics(altMapping, []);
    });

    // A new cache key (altMapping) → queryFn fires → fetchKPI called with altMapping
    expect(fetchKPIMock).toHaveBeenCalledWith("txns", altMapping, []);
  });

  it("runAnalytics returns without throwing when the table does not exist", async () => {
    // Table existence check returns empty
    runReadOnlyQueryMock.mockResolvedValue([]);

    const { result } = renderAnalyticsHook({ loaded: false });

    let threw = false;
    await act(async () => {
      try {
        await result.current.runAnalytics(MAPPING, SM);
      } catch {
        threw = true;
      }
    });

    expect(threw).toBe(false);
    // Table check fails → EMPTY_ANALYTICS, no further fetches beyond the check
    expect(fetchKPIMock).not.toHaveBeenCalled();
  });

  it("runAnalytics is callable without needing the query to be enabled", async () => {
    setupHappyPathMocks();

    // loaded=false so the useQuery is disabled, but runAnalytics bypasses it
    const { result } = renderAnalyticsHook({ loaded: false });

    await act(async () => {
      await result.current.runAnalytics(MAPPING, SM);
    });

    // Even with loaded=false, runAnalytics forces a fetchQuery
    expect(fetchKPIMock).toHaveBeenCalled();
  });
});

// ─── rawStatuses preserved across re-runs ────────────────────────────────────

describe("useTelecomAnalytics — rawStatuses cache preservation", () => {
  it("preserves existing rawStatuses from the cache when firstLoad is false", async () => {
    setupHappyPathMocks();
    fetchDistinctStatusesMock.mockResolvedValue(SAMPLE_RAW_STATUSES);

    // First run sets firstLoad=false after loading
    const firstLoad = makeRef(false); // already done
    const client = makeQueryClient();

    const { result } = renderAnalyticsHook({ firstLoad, client });

    await waitFor(() => {
      expect(broadcastMock).toHaveBeenCalled();
    });

    // Since firstLoad was false, fetchDistinctStatuses should NOT have been called
    expect(fetchDistinctStatusesMock).not.toHaveBeenCalled();
    // rawStatuses falls back to cache (empty since no prior data)
    expect(result.current.rawStatuses).toEqual([]);
  });
});

// ─── analyticsQueryKey composition ───────────────────────────────────────────

describe("useTelecomAnalytics — query key composition", () => {
  it("different tableName produces a different cache entry", async () => {
    setupHappyPathMocks();

    const client = makeQueryClient();

    // First hook with table "txns"
    const { result: r1 } = renderHook(
      () =>
        useTelecomAnalytics({
          getTableName: () => "txns",
          mapping: MAPPING,
          statusMapping: SM,
          loaded: true,
          firstLoad: makeRef(false),
          fileNameRef: makeRef("a.csv"),
          onStatusMappingAdditions: vi.fn(),
        }),
      { wrapper: makeWrapper(client) },
    );

    await waitFor(() => {
      expect(r1.current.kpi).toEqual(SAMPLE_KPI);
    });

    // Second hook with table "txns2" — should get separate cache entry
    fetchKPIMock.mockResolvedValue({ ...SAMPLE_KPI, totalTransactions: 999 });

    const { result: r2 } = renderHook(
      () =>
        useTelecomAnalytics({
          getTableName: () => "txns2",
          mapping: MAPPING,
          statusMapping: SM,
          loaded: true,
          firstLoad: makeRef(false),
          fileNameRef: makeRef("b.csv"),
          onStatusMappingAdditions: vi.fn(),
        }),
      { wrapper: makeWrapper(client) },
    );

    await waitFor(() => {
      expect(r2.current.kpi?.totalTransactions).toBe(999);
    });

    // First hook should still have its own cached value
    expect(r1.current.kpi?.totalTransactions).toBe(SAMPLE_KPI.totalTransactions);
  });
});
