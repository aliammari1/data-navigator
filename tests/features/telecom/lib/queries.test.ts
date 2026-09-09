import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Boundary mock ────────────────────────────────────────────────────────────
// queries.ts has exactly ONE IO boundary: `runReadOnlyQuery`, the renderer
// DuckDB channel (real WASM worker in production). We mock only that. Every SQL
// builder it composes from (`statusNorm`, `canalCaseExpr`, `qc`, `sqlLiteral`,
// `hourExpr`, the date-expr helpers, status-definition filters) is kept REAL so
// the actual SQL the module emits is exercised behaviourally.
//
// `ensureTelecomEnrichedView` is intentionally NOT mocked: it is hard-wired to
// `return false` (the renderer DuckDB channel rejects every CREATE/DROP, so the
// materialised-view path is permanently disabled) and never touches IO — see
// queries.ts. Leaving it real keeps the `fetchKPI` enriched-vs-raw branch test
// honest about the production reality (always the raw fallback).

const runReadOnlyQuery = vi.fn<(sql: string) => Promise<Record<string, unknown>[]>>();

vi.mock("@/platform/duckdb/duckdb", () => ({
  runReadOnlyQuery: (sql: string) => runReadOnlyQuery(sql),
}));

import { ALL_CANAL_RULES } from "@/features/telecom/lib/canal-rule-defaults";
import * as QueriesModule from "@/features/telecom/lib/queries";
import {
  buildSpecDateFilter,
  CANAL_KEY_TO_LABEL,
  createTelecomDailyAgg,
  createTelecomEnrichedView,
  dailyAggTableName,
  detectAvailableColumns,
  enrichedViewName,
  ensureTelecomEnrichedView,
  fetchCanalHourly,
  fetchCanalHourlyMatrix,
  fetchCanalRows,
  fetchCustomerProfile,
  fetchDailyTrend,
  fetchDestinationsForGroup,
  fetchDistinctStatuses,
  fetchFiltered,
  fetchFilteredCount,
  fetchFilteredPage,
  fetchHourly,
  fetchKPI,
  fetchOperators,
  fetchOperatorsForGroup,
  fetchRawCanalSummaries,
  fetchRegions,
  fetchRegionsForGroup,
  fetchServiceCodeRows,
  fetchSpecCanalStatusMatrix,
  fetchSpecChannelStats,
  fetchSpecStatusStats,
  fetchSpecUnitAmountStats,
  fetchStatusBreakdown,
  runCustomKPIExpr,
} from "@/features/telecom/lib/queries";
import type { ChannelDef } from "@/features/telecom/lib/report-engine";
import type { CanalKey, ColumnMapping, FilterState } from "@/features/telecom/types";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const m: ColumnMapping = {
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

const TABLE = "txns";

const emptyFilter: FilterState = {
  status: "",
  canal: "",
  region: "",
  operator: "",
  search: "",
  minAmount: "",
  maxAmount: "",
  hourFrom: "",
  hourTo: "",
};

/** Every SQL string passed to the mocked boundary, in call order. */
function allSql(): string[] {
  return runReadOnlyQuery.mock.calls.map((c) => String(c[0] ?? ""));
}

/** The most recent SQL string. */
function lastSql(): string {
  const calls = runReadOnlyQuery.mock.calls;
  return String(calls[calls.length - 1]?.[0] ?? "");
}

beforeEach(() => {
  // vitest config sets clearMocks+restoreMocks: re-establish a safe default.
  runReadOnlyQuery.mockResolvedValue([]);
});

// ──────────────────────────────────────────────────────────────────────────────
// Pure name helpers
// ──────────────────────────────────────────────────────────────────────────────

describe("enrichedViewName / dailyAggTableName", () => {
  it("derives the enriched view name by suffixing _enriched", () => {
    expect(enrichedViewName("txns")).toBe("txns_enriched");
  });

  it("derives the daily aggregate name by suffixing _daily", () => {
    expect(dailyAggTableName("txns")).toBe("txns_daily");
  });

  it("suffixes an empty base name without throwing", () => {
    expect(enrichedViewName("")).toBe("_enriched");
    expect(dailyAggTableName("")).toBe("_daily");
  });
});

describe("CANAL_KEY_TO_LABEL", () => {
  it("maps every canal key to a non-empty, unique label", () => {
    const labels = Object.values(CANAL_KEY_TO_LABEL);
    expect(labels.every((l) => typeof l === "string" && l.length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// ensureTelecomEnrichedView — permanently disabled, never touches IO
// ──────────────────────────────────────────────────────────────────────────────

describe("ensureTelecomEnrichedView", () => {
  it("always resolves false (renderer DuckDB is read-only) without issuing a query", async () => {
    const result = await ensureTelecomEnrichedView(TABLE, m);

    expect(result).toBe(false);
    expect(runReadOnlyQuery).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// fetchKPI — enriched branch is dead (ensure→false), so the raw branch runs
// ──────────────────────────────────────────────────────────────────────────────

describe("fetchKPI", () => {
  it("maps the raw-table aggregate row into a KPISummary", async () => {
    runReadOnlyQuery.mockResolvedValue([
      {
        total: 1000,
        success_count: 800,
        declined_count: 120,
        refund_count: 30,
        instance_count: 40,
        submitted_count: 10,
        success_rate: 80,
        total_amount: 5432.1,
        avg_amount: 6.79,
        avg_proc_ms: 250,
        unique_customers: 333,
        peak_hour: 14,
        top_error: "DCL",
      },
    ]);

    const kpi = await fetchKPI(TABLE, m);

    expect(kpi).not.toBeNull();
    expect(kpi?.totalTransactions).toBe(1000);
    expect(kpi?.successCount).toBe(800);
    expect(kpi?.declinedCount).toBe(120);
    expect(kpi?.refundCount).toBe(30);
    expect(kpi?.instanceCount).toBe(40);
    expect(kpi?.submittedCount).toBe(10);
    expect(kpi?.successRate).toBeCloseTo(80, 6);
    expect(kpi?.totalAmount).toBeCloseTo(5432.1, 6);
    expect(kpi?.avgAmount).toBeCloseTo(6.79, 6);
    expect(kpi?.avgProcessingMs).toBe(250);
    expect(kpi?.uniqueCustomers).toBe(333);
    expect(kpi?.peakHour).toBe(14);
    expect(kpi?.topErrorCode).toBe("DCL");
  });

  it("defaults topErrorCode to 'N/A' when top_error is missing", async () => {
    runReadOnlyQuery.mockResolvedValue([{ total: 1 }]);

    const kpi = await fetchKPI(TABLE, m);

    expect(kpi?.topErrorCode).toBe("N/A");
    // every other numeric field falls back to 0 via safeNum
    expect(kpi?.successCount).toBe(0);
    expect(kpi?.totalAmount).toBe(0);
  });

  it("runs the raw-table fallback (enriched view is disabled) over the base table", async () => {
    runReadOnlyQuery.mockResolvedValue([{ total: 1 }]);

    await fetchKPI(TABLE, m);

    const sql = lastSql();
    expect(sql).toContain('"txns"');
    // raw branch builds a base CTE and never references the enriched _status_norm col
    expect(sql).toContain("WITH base");
    expect(sql).not.toContain("_status_norm");
  });

  it("returns null when the raw query yields no rows", async () => {
    runReadOnlyQuery.mockResolvedValue([]);

    expect(await fetchKPI(TABLE, m)).toBeNull();
  });

  it("returns null when the raw query throws (catch path)", async () => {
    runReadOnlyQuery.mockRejectedValue(new Error("boom"));

    expect(await fetchKPI(TABLE, m)).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// fetchRawCanalSummaries — keyMap filter + share/successRate math
// ──────────────────────────────────────────────────────────────────────────────

describe("fetchRawCanalSummaries", () => {
  it("maps a known canal label to its key and derives successRate + share", async () => {
    runReadOnlyQuery.mockResolvedValue([
      {
        canal_group: "Bill Payment",
        total: 200,
        success: 150,
        declined: 30,
        refund: 10,
        instance: 8,
        submitted: 2,
        amount: 999.5,
        avg_amount: 5,
      },
    ]);

    const rows = await fetchRawCanalSummaries(TABLE, m, 1000);

    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.key).toBe("bill_payment");
    expect(r.label).toBe(CANAL_KEY_TO_LABEL.bill_payment);
    expect(r.total).toBe(200);
    expect(r.success).toBe(150);
    expect(r.successRate).toBeCloseTo(75, 6); // 150/200*100
    expect(r.share).toBeCloseTo(20, 6); // 200/1000*100 (totalTx wins)
    expect(r.amount).toBeCloseTo(999.5, 6);
  });

  it("drops rows whose canal_group is not a recognised label (e.g. 'Other')", async () => {
    runReadOnlyQuery.mockResolvedValue([
      { canal_group: "Other", total: 50, success: 10 },
      { canal_group: "Bill Payment", total: 200, success: 150 },
    ]);

    const rows = await fetchRawCanalSummaries(TABLE, m, 1000);

    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe("bill_payment");
  });

  it("falls back to summing row totals for share when totalTx is 0", async () => {
    runReadOnlyQuery.mockResolvedValue([
      { canal_group: "Bill Payment", total: 100, success: 50 },
      { canal_group: "Credit Transfer", total: 300, success: 100 },
    ]);

    const rows = await fetchRawCanalSummaries(TABLE, m, 0);

    const bill = rows.find((r) => r.key === "bill_payment");
    // computed total = 100 + 300 = 400 ⇒ bill share = 100/400*100 = 25
    expect(bill?.share).toBeCloseTo(25, 6);
  });

  it("guards successRate (0) when a canal has zero total", async () => {
    runReadOnlyQuery.mockResolvedValue([{ canal_group: "Bill Payment", total: 0, success: 0 }]);

    const rows = await fetchRawCanalSummaries(TABLE, m, 0);

    expect(rows[0].successRate).toBe(0);
    expect(rows[0].share).toBe(0); // total (sum) is 0 too
  });

  it("returns an empty array when the query throws", async () => {
    runReadOnlyQuery.mockRejectedValue(new Error("x"));

    expect(await fetchRawCanalSummaries(TABLE, m, 1000)).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// fetchHourly
// ──────────────────────────────────────────────────────────────────────────────

describe("fetchHourly", () => {
  it("maps hourly rows with numeric coercion", async () => {
    runReadOnlyQuery.mockResolvedValue([
      { hour: 9, total: 100, success: 90, declined: 10, amount: 250.75 },
    ]);

    const rows = await fetchHourly(TABLE, m);

    expect(rows[0]).toEqual({
      hour: 9,
      total: 100,
      success: 90,
      declined: 10,
      amount: 250.75,
    });
  });

  it("coerces null fields to 0", async () => {
    runReadOnlyQuery.mockResolvedValue([
      { hour: null, total: null, success: null, declined: null, amount: null },
    ]);

    const rows = await fetchHourly(TABLE, m);

    expect(rows[0]).toEqual({ hour: 0, total: 0, success: 0, declined: 0, amount: 0 });
  });

  it("constrains the hour to 0..23 in SQL", async () => {
    await fetchHourly(TABLE, m);
    expect(lastSql()).toContain("BETWEEN 0 AND 23");
  });

  it("returns an empty array when the query throws", async () => {
    runReadOnlyQuery.mockRejectedValue(new Error("x"));
    expect(await fetchHourly(TABLE, m)).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// fetchStatusBreakdown
// ──────────────────────────────────────────────────────────────────────────────

describe("fetchStatusBreakdown", () => {
  it("maps status rows and coerces count/amount", async () => {
    runReadOnlyQuery.mockResolvedValue([
      { status: "SUCCESS", count: 800, amount: 1234.5 },
      { status: "DECLINED", count: 120, amount: 0 },
    ]);

    const rows = await fetchStatusBreakdown(TABLE, m);

    expect(rows[0]).toEqual({ status: "SUCCESS", count: 800, amount: 1234.5 });
    expect(rows[1]).toEqual({ status: "DECLINED", count: 120, amount: 0 });
  });

  it("labels a null status as UNKNOWN", async () => {
    runReadOnlyQuery.mockResolvedValue([{ status: null, count: 5, amount: 0 }]);

    const rows = await fetchStatusBreakdown(TABLE, m);

    expect(rows[0].status).toBe("UNKNOWN");
  });

  it("returns an empty array when the query throws", async () => {
    runReadOnlyQuery.mockRejectedValue(new Error("x"));
    expect(await fetchStatusBreakdown(TABLE, m)).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// fetchOperators — issues TWO queries (source + destination)
// ──────────────────────────────────────────────────────────────────────────────

describe("fetchOperators", () => {
  it("concatenates source and destination rows with the right accountType", async () => {
    runReadOnlyQuery
      .mockResolvedValueOnce([{ operator: "OOREDOO", total: 100, success: 80, amount: 500 }])
      .mockResolvedValueOnce([{ operator: "ORANGE", total: 60, success: 30, amount: 200 }]);

    const rows = await fetchOperators(TABLE, m);

    expect(rows).toHaveLength(2);
    const src = rows.find((r) => r.operator === "OOREDOO");
    const dst = rows.find((r) => r.operator === "ORANGE");
    expect(src?.accountType).toBe("source");
    expect(src?.successRate).toBeCloseTo(80, 6);
    expect(dst?.accountType).toBe("destination");
    expect(dst?.successRate).toBeCloseTo(50, 6);
  });

  it("still returns source rows when the destination query throws (missing column)", async () => {
    runReadOnlyQuery
      .mockResolvedValueOnce([{ operator: "OOREDOO", total: 10, success: 5, amount: 1 }])
      .mockRejectedValueOnce(new Error("GENERATION_ACCOUNT_NAME does not exist"));

    const rows = await fetchOperators(TABLE, m);

    expect(rows).toHaveLength(1);
    expect(rows[0].accountType).toBe("source");
  });

  it("guards successRate when total is 0 and stringifies a null operator", async () => {
    runReadOnlyQuery
      .mockResolvedValueOnce([{ operator: null, total: 0, success: 0, amount: null }])
      .mockResolvedValueOnce([]);

    const rows = await fetchOperators(TABLE, m);

    expect(rows[0].operator).toBe("");
    expect(rows[0].successRate).toBe(0);
  });

  it("returns an empty array when the source query throws", async () => {
    runReadOnlyQuery.mockRejectedValue(new Error("x"));
    expect(await fetchOperators(TABLE, m)).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// fetchOperatorsForGroup / fetchDestinationsForGroup / fetchRegionsForGroup
// ──────────────────────────────────────────────────────────────────────────────

describe("fetchOperatorsForGroup", () => {
  it("maps rows with source accountType and computes successRate", async () => {
    runReadOnlyQuery.mockResolvedValue([
      { operator: "OOREDOO", total: 40, success: 20, amount: 100 },
    ]);

    const rows = await fetchOperatorsForGroup(TABLE, m, ["bill_payment"]);

    expect(rows[0].accountType).toBe("source");
    expect(rows[0].successRate).toBeCloseTo(50, 6);
  });

  it("embeds the group labels as SQL string literals in an IN-list", async () => {
    const keys: CanalKey[] = ["bill_payment", "credit_transfer"];

    await fetchOperatorsForGroup(TABLE, m, keys);

    const sql = lastSql();
    expect(sql).toContain(`'${CANAL_KEY_TO_LABEL.bill_payment}'`);
    expect(sql).toContain(`'${CANAL_KEY_TO_LABEL.credit_transfer}'`);
  });

  it("returns an empty array when the query throws", async () => {
    runReadOnlyQuery.mockRejectedValue(new Error("x"));
    expect(await fetchOperatorsForGroup(TABLE, m, ["bill_payment"])).toEqual([]);
  });
});

describe("fetchDestinationsForGroup", () => {
  it("maps rows with destination accountType", async () => {
    runReadOnlyQuery.mockResolvedValue([{ operator: "DEST", total: 10, success: 10, amount: 5 }]);

    const rows = await fetchDestinationsForGroup(TABLE, m, ["bill_payment"]);

    expect(rows[0].accountType).toBe("destination");
    expect(rows[0].successRate).toBeCloseTo(100, 6);
  });

  it("returns an empty array when the query throws", async () => {
    runReadOnlyQuery.mockRejectedValue(new Error("x"));
    expect(await fetchDestinationsForGroup(TABLE, m, ["bill_payment"])).toEqual([]);
  });
});

describe("fetchRegionsForGroup", () => {
  it("maps region rows with numeric coercion", async () => {
    runReadOnlyQuery.mockResolvedValue([{ region: "TUNIS", total: 70, success: 60, amount: 300 }]);

    const rows = await fetchRegionsForGroup(TABLE, m, ["bill_payment"]);

    expect(rows[0]).toEqual({ region: "TUNIS", total: 70, success: 60, amount: 300 });
  });

  it("stringifies a null region to empty string", async () => {
    runReadOnlyQuery.mockResolvedValue([{ region: null, total: 0, success: 0, amount: 0 }]);

    const rows = await fetchRegionsForGroup(TABLE, m, ["bill_payment"]);

    expect(rows[0].region).toBe("");
  });

  it("returns an empty array when the query throws", async () => {
    runReadOnlyQuery.mockRejectedValue(new Error("x"));
    expect(await fetchRegionsForGroup(TABLE, m, ["bill_payment"])).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// fetchRegions
// ──────────────────────────────────────────────────────────────────────────────

describe("fetchRegions", () => {
  it("maps region rows and excludes empty/NULL region strings in SQL", async () => {
    runReadOnlyQuery.mockResolvedValue([{ region: "SFAX", total: 12, success: 9, amount: 33 }]);

    const rows = await fetchRegions(TABLE, m);

    expect(rows[0]).toEqual({ region: "SFAX", total: 12, success: 9, amount: 33 });
    expect(lastSql()).toContain("NOT IN ('','NULL')");
  });

  it("returns an empty array when the query throws", async () => {
    runReadOnlyQuery.mockRejectedValue(new Error("x"));
    expect(await fetchRegions(TABLE, m)).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// fetchCanalHourly — uses canalWhere[key] predicate
// ──────────────────────────────────────────────────────────────────────────────

describe("fetchCanalHourly", () => {
  it("maps hourly rows for a canal key", async () => {
    runReadOnlyQuery.mockResolvedValue([
      { hour: 8, total: 5, success: 4, declined: 1, amount: 12.5 },
    ]);

    const rows = await fetchCanalHourly(TABLE, m, "bill_payment");

    expect(rows[0]).toEqual({ hour: 8, total: 5, success: 4, declined: 1, amount: 12.5 });
    expect(lastSql()).toContain("BETWEEN 0 AND 23");
  });

  it("returns an empty array when the query throws", async () => {
    runReadOnlyQuery.mockRejectedValue(new Error("x"));
    expect(await fetchCanalHourly(TABLE, m, "bill_payment")).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// fetchCanalHourlyMatrix
// ──────────────────────────────────────────────────────────────────────────────

describe("fetchCanalHourlyMatrix", () => {
  it("maps canal-hour cells and excludes 'Other' in SQL", async () => {
    runReadOnlyQuery.mockResolvedValue([
      { canal: "Bill Payment", hour: 9, total: 100, success: 90 },
    ]);

    const rows = await fetchCanalHourlyMatrix(TABLE, m);

    expect(rows[0]).toEqual({ canal: "Bill Payment", hour: 9, total: 100, success: 90 });
    const sql = lastSql();
    expect(sql).toContain("!= 'Other'");
    expect(sql).toContain("BETWEEN 0 AND 23");
  });

  it("coerces a null canal to empty string", async () => {
    runReadOnlyQuery.mockResolvedValue([{ canal: null, hour: 0, total: 0, success: 0 }]);

    const rows = await fetchCanalHourlyMatrix(TABLE, m);

    expect(rows[0].canal).toBe("");
  });

  it("returns an empty array when the query throws", async () => {
    runReadOnlyQuery.mockRejectedValue(new Error("x"));
    expect(await fetchCanalHourlyMatrix(TABLE, m)).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// fetchDailyTrend — needs >= 2 rows to return anything
// ──────────────────────────────────────────────────────────────────────────────

describe("fetchDailyTrend", () => {
  it("maps daily rows and truncates the day to YYYY-MM-DD (10 chars)", async () => {
    runReadOnlyQuery.mockResolvedValue([
      { day: "2024-01-01 00:00:00", total: 10, success: 8, declined: 2, amount: 5 },
      { day: "2024-01-02 00:00:00", total: 20, success: 15, declined: 5, amount: 9 },
    ]);

    const rows = await fetchDailyTrend(TABLE, m);

    expect(rows).toHaveLength(2);
    expect(rows[0].day).toBe("2024-01-01");
    expect(rows[1].day).toBe("2024-01-02");
    expect(rows[0].total).toBe(10);
  });

  it("returns an empty array when fewer than 2 distinct days are present (single-day guard)", async () => {
    runReadOnlyQuery.mockResolvedValue([
      { day: "2024-01-01", total: 10, success: 8, declined: 2, amount: 5 },
    ]);

    expect(await fetchDailyTrend(TABLE, m)).toEqual([]);
  });

  it("returns an empty array when there are zero rows", async () => {
    runReadOnlyQuery.mockResolvedValue([]);
    expect(await fetchDailyTrend(TABLE, m)).toEqual([]);
  });

  it("returns an empty array when the query throws", async () => {
    runReadOnlyQuery.mockRejectedValue(new Error("x"));
    expect(await fetchDailyTrend(TABLE, m)).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// fetchCustomerProfile — fires 3 parallel queries (agg, hourly, recent)
// ──────────────────────────────────────────────────────────────────────────────

describe("fetchCustomerProfile", () => {
  it("aggregates a customer profile, hourly histogram, and recent rows", async () => {
    runReadOnlyQuery
      .mockResolvedValueOnce([
        {
          msisdn: "21620",
          name: "Bob",
          total: 30,
          success: 25,
          declined: 5,
          total_amount: 500.25,
          avg_amount: 16.67,
          fav_canal: "Bill Payment",
          peak_hour: 11,
          top_error: "DCL",
        },
      ])
      .mockResolvedValueOnce([
        { hour: 10, total: 12 },
        { hour: 11, total: 18 },
      ])
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);

    const p = await fetchCustomerProfile(TABLE, m, "21620");

    expect(p).not.toBeNull();
    expect(p?.msisdn).toBe("21620");
    expect(p?.name).toBe("Bob");
    expect(p?.group).toBe("");
    expect(p?.total).toBe(30);
    expect(p?.success).toBe(25);
    expect(p?.totalAmount).toBeCloseTo(500.25, 6);
    expect(p?.favoriteCanal).toBe("Bill Payment");
    expect(p?.peakHour).toBe(11);
    expect(p?.topError).toBe("DCL");
    expect(p?.hourly).toEqual([
      { hour: 10, total: 12 },
      { hour: 11, total: 18 },
    ]);
    expect(p?.recentTx).toHaveLength(2);
  });

  it("embeds the msisdn as an escaped SQL literal (single quote doubled)", async () => {
    runReadOnlyQuery.mockResolvedValue([]);

    await fetchCustomerProfile(TABLE, m, "O'Brien");

    // sqlLiteral doubles the apostrophe → 'O''Brien'
    expect(allSql().some((s) => s.includes("'O''Brien'"))).toBe(true);
  });

  it("returns null when the aggregate query yields no rows", async () => {
    runReadOnlyQuery
      .mockResolvedValueOnce([]) // agg empty
      .mockResolvedValueOnce([]) // hourly
      .mockResolvedValueOnce([]); // recent

    expect(await fetchCustomerProfile(TABLE, m, "21620")).toBeNull();
  });

  it("returns null when any of the parallel queries throws", async () => {
    runReadOnlyQuery.mockRejectedValue(new Error("x"));

    expect(await fetchCustomerProfile(TABLE, m, "21620")).toBeNull();
  });

  it("falls back to the supplied msisdn when the aggregate omits identity fields", async () => {
    runReadOnlyQuery
      .mockResolvedValueOnce([{ total: 1, success: 1 }]) // no msisdn/name/fav_canal
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const p = await fetchCustomerProfile(TABLE, m, "999");

    expect(p?.msisdn).toBe("999");
    expect(p?.name).toBe("999");
    expect(p?.favoriteCanal).toBe("—");
    expect(p?.topError).toBe("");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// fetchCanalRows — raw row passthrough + LIMIT
// ──────────────────────────────────────────────────────────────────────────────

describe("fetchCanalRows", () => {
  it("returns raw rows verbatim and applies the default limit of 100", async () => {
    const raw = [{ a: 1 }, { a: 2 }];
    runReadOnlyQuery.mockResolvedValue(raw);

    const rows = await fetchCanalRows(TABLE, m, "bill_payment");

    expect(rows).toBe(raw);
    expect(lastSql()).toContain("LIMIT 100");
  });

  it("honours a custom limit", async () => {
    await fetchCanalRows(TABLE, m, "bill_payment", 7);
    expect(lastSql()).toContain("LIMIT 7");
  });

  it("returns an empty array when the query throws", async () => {
    runReadOnlyQuery.mockRejectedValue(new Error("x"));
    expect(await fetchCanalRows(TABLE, m, "bill_payment")).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// fetchFilteredCount / fetchFilteredPage / fetchFiltered (buildFilteredWhere)
// ──────────────────────────────────────────────────────────────────────────────

describe("fetchFilteredCount", () => {
  it("returns the COUNT scalar from the first row", async () => {
    runReadOnlyQuery.mockResolvedValue([{ cnt: 4242 }]);

    expect(await fetchFilteredCount(TABLE, m, emptyFilter)).toBe(4242);
  });

  it("emits no WHERE clause when no filter is active", async () => {
    await fetchFilteredCount(TABLE, m, emptyFilter);
    expect(lastSql()).not.toContain("WHERE");
  });

  it("builds a WHERE clause from each active filter field", async () => {
    const f: FilterState = {
      ...emptyFilter,
      status: "SUCCESS",
      region: "tunis",
      operator: "ooredoo",
      minAmount: "10",
      maxAmount: "500",
      search: "alice",
    };

    await fetchFilteredCount(TABLE, m, f);

    const sql = lastSql();
    expect(sql).toContain("WHERE");
    // status compared against normalised CASE expression literal
    expect(sql).toContain("'SUCCESS'");
    // region/operator are upper-cased in BOTH the column expr and the literal
    expect(sql).toContain("'TUNIS'");
    expect(sql).toContain("'OOREDOO'");
    // numeric bounds are interpolated raw (not quoted)
    expect(sql).toContain(">= 10");
    expect(sql).toContain("<= 500");
    // search wraps the term in % wildcards for a LIKE on msisdn OR service name
    expect(sql).toContain("'%alice%'");
    expect(sql).toContain("LIKE");
  });

  it("returns 0 when the query throws", async () => {
    runReadOnlyQuery.mockRejectedValue(new Error("x"));
    expect(await fetchFilteredCount(TABLE, m, emptyFilter)).toBe(0);
  });
});

describe("fetchFilteredPage", () => {
  it("returns the page rows and applies LIMIT/OFFSET defaults", async () => {
    const raw = [{ x: 1 }];
    runReadOnlyQuery.mockResolvedValue(raw);

    const rows = await fetchFilteredPage(TABLE, m, emptyFilter);

    expect(rows).toBe(raw);
    expect(lastSql()).toContain("LIMIT 50 OFFSET 0");
  });

  it("emits an ORDER BY only when a sort column is supplied", async () => {
    await fetchFilteredPage(TABLE, m, emptyFilter);
    expect(lastSql()).not.toContain("ORDER BY");

    await fetchFilteredPage(TABLE, m, emptyFilter, undefined, 25, 50, "ORIGINAL_AMOUNT", "asc");
    const sql = lastSql();
    expect(sql).toContain('ORDER BY "ORIGINAL_AMOUNT" ASC');
    expect(sql).toContain("LIMIT 25 OFFSET 50");
  });

  it("defaults the sort direction to DESC for any non-'asc' value", async () => {
    await fetchFilteredPage(TABLE, m, emptyFilter, undefined, 10, 0, "ORIGINAL_AMOUNT", "desc");
    expect(lastSql()).toContain('ORDER BY "ORIGINAL_AMOUNT" DESC');
  });

  it("returns an empty array when the query throws", async () => {
    runReadOnlyQuery.mockRejectedValue(new Error("x"));
    expect(await fetchFilteredPage(TABLE, m, emptyFilter)).toEqual([]);
  });
});

describe("fetchFiltered", () => {
  it("returns rows and total from the parallel count+page queries", async () => {
    runReadOnlyQuery
      .mockResolvedValueOnce([{ cnt: 17 }]) // COUNT
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }]); // page

    const res = await fetchFiltered(TABLE, m, emptyFilter);

    expect(res.total).toBe(17);
    expect(res.rows).toHaveLength(2);
  });

  it("returns empty rows and total 0 when a query throws", async () => {
    runReadOnlyQuery.mockRejectedValue(new Error("x"));

    const res = await fetchFiltered(TABLE, m, emptyFilter);

    expect(res).toEqual({ rows: [], total: 0 });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// detectAvailableColumns
// ──────────────────────────────────────────────────────────────────────────────

describe("detectAvailableColumns", () => {
  it("returns the column_name list from a DESCRIBE", async () => {
    runReadOnlyQuery.mockResolvedValue([
      { column_name: "TRANSACTION_ID" },
      { column_name: "ORIGINAL_AMOUNT" },
    ]);

    const cols = await detectAvailableColumns(TABLE);

    expect(cols).toEqual(["TRANSACTION_ID", "ORIGINAL_AMOUNT"]);
    expect(lastSql()).toContain("DESCRIBE");
  });

  it("coerces a missing column_name to empty string", async () => {
    runReadOnlyQuery.mockResolvedValue([{ column_name: null }]);

    expect(await detectAvailableColumns(TABLE)).toEqual([""]);
  });

  it("returns an empty array when the query throws", async () => {
    runReadOnlyQuery.mockRejectedValue(new Error("x"));
    expect(await detectAvailableColumns(TABLE)).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// fetchDistinctStatuses
// ──────────────────────────────────────────────────────────────────────────────

describe("fetchDistinctStatuses", () => {
  it("maps raw status codes with count/amount", async () => {
    runReadOnlyQuery.mockResolvedValue([
      { raw_code: "PST", count: 800, amount: 1000 },
      { raw_code: "DCL", count: 120, amount: 0 },
    ]);

    const rows = await fetchDistinctStatuses(TABLE, m);

    expect(rows[0]).toEqual({ rawCode: "PST", count: 800, amount: 1000 });
    expect(rows[1]).toEqual({ rawCode: "DCL", count: 120, amount: 0 });
  });

  it("coerces a null raw_code to empty string", async () => {
    runReadOnlyQuery.mockResolvedValue([{ raw_code: null, count: 1, amount: 0 }]);

    expect((await fetchDistinctStatuses(TABLE, m))[0].rawCode).toBe("");
  });

  it("returns an empty array when the query throws", async () => {
    runReadOnlyQuery.mockRejectedValue(new Error("x"));
    expect(await fetchDistinctStatuses(TABLE, m)).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// fetchSpecChannelStats — single-pass conditional aggregation
// ──────────────────────────────────────────────────────────────────────────────

const channels: ChannelDef[] = [
  { name: "Alpha", condition: "TRY_CAST(BRAND_D AS INT) = 1" },
  { name: "Beta", condition: "TRY_CAST(BRAND_D AS INT) = 2" },
];

describe("fetchSpecChannelStats", () => {
  it("returns an empty result + zero total when no channels are supplied", async () => {
    const res = await fetchSpecChannelStats(TABLE, [], "", "");

    expect(res.rows).toEqual([]);
    expect(res.total).toEqual({ canal: "TOTAL (tous canaux)", nombre: 0, montant: 0 });
    // short-circuits before any query
    expect(runReadOnlyQuery).not.toHaveBeenCalled();
  });

  it("maps per-channel n_i/m_i columns and sums the grand total", async () => {
    runReadOnlyQuery.mockResolvedValue([{ n_0: 10, m_0: 100, n_1: 5, m_1: 50 }]);

    const res = await fetchSpecChannelStats(TABLE, channels, "2024-01-01", "2024-01-31");

    expect(res.rows).toEqual([
      { canal: "Alpha", nombre: 10, montant: 100 },
      { canal: "Beta", nombre: 5, montant: 50 },
    ]);
    expect(res.total).toEqual({ canal: "TOTAL (tous canaux)", nombre: 15, montant: 150 });
  });

  it("emits a per-channel COUNT/SUM FILTER for each channel condition", async () => {
    await fetchSpecChannelStats(TABLE, channels, "", "");

    const sql = lastSql();
    expect(sql).toContain("AS n_0");
    expect(sql).toContain("AS m_0");
    expect(sql).toContain("AS n_1");
    expect(sql).toContain("AS m_1");
    expect(sql).toContain("TRY_CAST(BRAND_D AS INT) = 1");
  });

  it("threads the date filter into the WHERE clause when both bounds are present", async () => {
    await fetchSpecChannelStats(TABLE, channels, "2024-01-01", "2024-01-31", m);

    const sql = lastSql();
    expect(sql).toContain("BETWEEN");
    expect(sql).toContain("2024-01-01");
  });

  it("returns zeroed per-channel rows + zero total when the query throws", async () => {
    runReadOnlyQuery.mockRejectedValue(new Error("x"));

    const res = await fetchSpecChannelStats(TABLE, channels, "", "");

    expect(res.rows).toEqual([
      { canal: "Alpha", nombre: 0, montant: 0 },
      { canal: "Beta", nombre: 0, montant: 0 },
    ]);
    expect(res.total).toEqual({ canal: "TOTAL (tous canaux)", nombre: 0, montant: 0 });
  });

  it("coerces missing aggregate columns to 0 (empty result row)", async () => {
    runReadOnlyQuery.mockResolvedValue([{}]);

    const res = await fetchSpecChannelStats(TABLE, channels, "", "");

    expect(res.rows.every((r) => r.nombre === 0 && r.montant === 0)).toBe(true);
    expect(res.total.nombre).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// fetchSpecStatusStats — 4 status COUNT FILTERs + grand total
// ──────────────────────────────────────────────────────────────────────────────

describe("fetchSpecStatusStats", () => {
  it("maps the four spec status rows and the in-scope grand total", async () => {
    runReadOnlyQuery.mockResolvedValue([{ n_0: 100, n_1: 5, n_2: 8, n_3: 12, total_all: 130 }]);

    const res = await fetchSpecStatusStats(TABLE, channels, "2024-01-01", "2024-01-31", m);

    expect(res.rows).toEqual([
      { status: "Réussie", nombre: 100 },
      { status: "Annulation", nombre: 5 },
      { status: "Instance (Hold + Doubt)", nombre: 8 },
      { status: "Échec", nombre: 12 },
    ]);
    expect(res.total).toEqual({ status: "TOTAL (tous Status)", nombre: 130 });
  });

  it("uses COUNT(*) (no channel scope) for the total when channels is empty", async () => {
    runReadOnlyQuery.mockResolvedValue([{ total_all: 999 }]);

    await fetchSpecStatusStats(TABLE, [], "", "");

    const sql = lastSql();
    expect(sql).toContain("COUNT(*) AS total_all");
  });

  it("scopes the total by the channel OR-list when channels are supplied", async () => {
    runReadOnlyQuery.mockResolvedValue([{ total_all: 50 }]);

    await fetchSpecStatusStats(TABLE, channels, "", "");

    const sql = lastSql();
    expect(sql).toContain("COUNT(*) FILTER (WHERE");
    expect(sql).toContain("TRY_CAST(BRAND_D AS INT) = 1");
  });

  it("returns empty rows + zero total when the query throws (logged catch path)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    runReadOnlyQuery.mockRejectedValue(new Error("x"));

    const res = await fetchSpecStatusStats(TABLE, channels, "", "");

    expect(res.rows).toEqual([]);
    expect(res.total).toEqual({ status: "TOTAL (tous Status)", nombre: 0 });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("coerces a missing total_all column to 0", async () => {
    runReadOnlyQuery.mockResolvedValue([{}]);

    const res = await fetchSpecStatusStats(TABLE, channels, "", "");

    expect(res.total.nombre).toBe(0);
    expect(res.rows.every((r) => r.nombre === 0)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// fetchSpecUnitAmountStats — GROUP BY unit amount + totals reduce
// ──────────────────────────────────────────────────────────────────────────────

describe("fetchSpecUnitAmountStats", () => {
  it("maps unit-amount buckets and reduces to a TOTAL row", async () => {
    runReadOnlyQuery.mockResolvedValue([
      { unit_amount: "5.0", n: 10, m: 50 },
      { unit_amount: "10.0", n: 4, m: 40 },
    ]);

    const res = await fetchSpecUnitAmountStats(TABLE, channels, "", "");

    expect(res.rows).toEqual([
      { unitAmount: "5.0", nombre: 10, montant: 50 },
      { unitAmount: "10.0", nombre: 4, montant: 40 },
    ]);
    expect(res.total).toEqual({ unitAmount: "TOTAL", nombre: 14, montant: 90 });
  });

  it("coerces a null unit_amount to '0'", async () => {
    runReadOnlyQuery.mockResolvedValue([{ unit_amount: null, n: 1, m: 2 }]);

    const res = await fetchSpecUnitAmountStats(TABLE, channels, "", "");

    expect(res.rows[0].unitAmount).toBe("0");
  });

  it("returns empty rows + zero total when the query throws (logged catch path)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    runReadOnlyQuery.mockRejectedValue(new Error("x"));

    const res = await fetchSpecUnitAmountStats(TABLE, channels, "", "");

    expect(res.rows).toEqual([]);
    expect(res.total).toEqual({ unitAmount: "TOTAL", nombre: 0, montant: 0 });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("scopes the query by the channel OR-list when channels are supplied", async () => {
    await fetchSpecUnitAmountStats(TABLE, channels, "", "");

    expect(lastSql()).toContain("TRY_CAST(BRAND_D AS INT) = 1");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// fetchServiceCodeRows
// ──────────────────────────────────────────────────────────────────────────────

describe("fetchServiceCodeRows", () => {
  it("maps service-code rows with matched canal", async () => {
    runReadOnlyQuery.mockResolvedValue([
      { service_code: "SVC1", category: "RECHARGE", count: 42, matched_canal: "Bill Payment" },
    ]);

    const rows = await fetchServiceCodeRows(TABLE, m);

    expect(rows[0]).toEqual({
      serviceCode: "SVC1",
      category: "RECHARGE",
      count: 42,
      matchedCanal: "Bill Payment",
    });
  });

  it("defaults matchedCanal to 'Other' and stringifies null code/category", async () => {
    runReadOnlyQuery.mockResolvedValue([
      { service_code: null, category: null, count: 0, matched_canal: null },
    ]);

    const rows = await fetchServiceCodeRows(TABLE, m);

    expect(rows[0].serviceCode).toBe("");
    expect(rows[0].category).toBe("");
    expect(rows[0].matchedCanal).toBe("Other");
  });

  it("returns an empty array when the query throws", async () => {
    runReadOnlyQuery.mockRejectedValue(new Error("x"));
    expect(await fetchServiceCodeRows(TABLE, m)).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// runCustomKPIExpr — only fetch fn that RE-THROWS instead of swallowing
// ──────────────────────────────────────────────────────────────────────────────

describe("runCustomKPIExpr", () => {
  it("wraps the caller expression in a SELECT ... AS val and returns the scalar", async () => {
    runReadOnlyQuery.mockResolvedValue([{ val: 123.5 }]);

    const v = await runCustomKPIExpr(TABLE, "AVG(ORIGINAL_AMOUNT)");

    expect(v).toBeCloseTo(123.5, 6);
    const sql = lastSql();
    expect(sql).toContain("AVG(ORIGINAL_AMOUNT)");
    expect(sql).toContain("AS val");
  });

  it("returns 0 (via safeNum) when the result row has no value", async () => {
    runReadOnlyQuery.mockResolvedValue([]);

    expect(await runCustomKPIExpr(TABLE, "COUNT(*)")).toBe(0);
  });

  it("RE-THROWS when the query fails (unlike the other fetchers which swallow)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    runReadOnlyQuery.mockRejectedValue(new Error("bad sql"));

    await expect(runCustomKPIExpr(TABLE, "1/0")).rejects.toThrow("bad sql");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// createTelecomEnrichedView / createTelecomDailyAgg — DDL builders (write path)
// ──────────────────────────────────────────────────────────────────────────────

describe("createTelecomEnrichedView", () => {
  it("issues a CREATE OR REPLACE TABLE for the enriched view with derived columns", async () => {
    await createTelecomEnrichedView(TABLE, m);

    const sql = lastSql();
    expect(sql).toContain("CREATE OR REPLACE TABLE");
    expect(sql).toContain('"txns_enriched"');
    // the derived columns the downstream enriched aggregates rely on
    expect(sql).toContain("AS _status_norm");
    expect(sql).toContain("AS _canal");
    expect(sql).toContain("AS _txn_date");
    expect(sql).toContain("AS _txn_hour");
    expect(sql).toContain("AS _amount");
  });

  it("propagates the (rejected) write error from the read-only channel", async () => {
    runReadOnlyQuery.mockRejectedValue(new Error("read-only: CREATE rejected"));

    await expect(createTelecomEnrichedView(TABLE, m)).rejects.toThrow("read-only");
  });
});

describe("createTelecomDailyAgg", () => {
  it("issues a CREATE OR REPLACE TABLE grouping the enriched view by day/canal/status", async () => {
    await createTelecomDailyAgg(TABLE);

    const sql = lastSql();
    expect(sql).toContain("CREATE OR REPLACE TABLE");
    expect(sql).toContain('"txns_daily"');
    expect(sql).toContain('FROM "txns_enriched"');
    expect(sql).toContain("GROUP BY _txn_day, _canal, _status_norm");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// CHARACTERIZATION: French-decimal money bug (TRY_CAST(... AS DOUBLE))
// ──────────────────────────────────────────────────────────────────────────────
// The money SQL uses `TRY_CAST(<amount> AS DOUBLE)`. DuckDB's DOUBLE cast does
// NOT understand a French decimal comma ("12,500" → NULL), so amounts stored
// with a comma silently drop to NULL → SUM ignores them → under-reported money.
// We do NOT fix it here (a separate task owns that). These tests LOCK the
// current SQL shape so the latent bug is visible and the builders are covered;
// when the fix lands (e.g. REPLACE(',', '.') or a locale-aware parse) these
// expectations will flip and flag the behavioural change.

describe("French-decimal money bug (characterization)", () => {
  it("KPI money still uses the locale-naive TRY_CAST(... AS DOUBLE), not a comma-aware parse", async () => {
    runReadOnlyQuery.mockResolvedValue([{ total: 1 }]);

    await fetchKPI(TABLE, m);

    const sql = lastSql();
    expect(sql).toContain("TRY_CAST");
    expect(sql).toContain("AS DOUBLE");
    // BUG WITNESS: no comma normalisation is applied before the DOUBLE cast.
    expect(sql).not.toContain("REPLACE");
  });

  it.each([
    ["fetchHourly", () => fetchHourly(TABLE, m)],
    ["fetchStatusBreakdown", () => fetchStatusBreakdown(TABLE, m)],
    ["fetchRegions", () => fetchRegions(TABLE, m)],
    ["fetchDistinctStatuses", () => fetchDistinctStatuses(TABLE, m)],
  ] as const)("%s sums money via the unguarded DOUBLE cast (no comma normalisation)", async (_name, run) => {
    runReadOnlyQuery.mockResolvedValue([]);

    await run();

    const sql = lastSql();
    expect(sql).toContain("TRY_CAST");
    expect(sql).toContain("AS DOUBLE");
    expect(sql).not.toContain("REPLACE");
  });

  it("passes whatever the DOUBLE cast yields straight through safeNum (NULL → 0)", async () => {
    // Simulate DuckDB returning NULL for a comma-decimal amount that failed the cast.
    runReadOnlyQuery.mockResolvedValue([
      { hour: 9, total: 3, success: 3, declined: 0, amount: null },
    ]);

    const rows = await fetchHourly(TABLE, m);

    // The dropped amount surfaces as 0, NOT the real comma-decimal value: the bug.
    expect(rows[0].amount).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// buildSpecDateFilter — direct coverage of the dateFrom-only and dateTo-only branches
// ──────────────────────────────────────────────────────────────────────────────

describe("buildSpecDateFilter (direct)", () => {
  it("returns empty string when both dateFrom and dateTo are empty", () => {
    expect(buildSpecDateFilter("", "")).toBe("");
  });

  it("returns a BETWEEN clause when both dateFrom and dateTo are provided", () => {
    const result = buildSpecDateFilter("2024-01-01", "2024-01-31");
    expect(result).toContain("BETWEEN");
    expect(result).toContain("2024-01-01");
    expect(result).toContain("2024-01-31");
  });

  it("returns a >= clause when only dateFrom is provided (line 132-133)", () => {
    const result = buildSpecDateFilter("2024-01-01", "");
    expect(result).toContain(">=");
    expect(result).toContain("2024-01-01");
    expect(result).not.toContain("<=");
    expect(result).not.toContain("BETWEEN");
  });

  it("returns a <= clause when only dateTo is provided (line 136)", () => {
    const result = buildSpecDateFilter("", "2024-01-31");
    expect(result).toContain("<=");
    expect(result).toContain("2024-01-31");
    expect(result).not.toContain(">=");
    expect(result).not.toContain("BETWEEN");
  });

  it("applies a custom dateColumn in the generated SQL", () => {
    const result = buildSpecDateFilter("2024-01-01", "", "MY_DATE_COL");
    expect(result).toContain('"MY_DATE_COL"');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// fetchSpecCanalStatusMatrix — per-channel ok/annulation/instance/échec/total
// ──────────────────────────────────────────────────────────────────────────────

describe("fetchSpecCanalStatusMatrix", () => {
  it("short-circuits to [] without querying when no channels are supplied", async () => {
    await expect(fetchSpecCanalStatusMatrix(TABLE, [], "", "")).resolves.toEqual([]);
    expect(runReadOnlyQuery).not.toHaveBeenCalled();
  });

  it("maps per-channel ok/an/in/dc/al columns into status rows", async () => {
    runReadOnlyQuery.mockResolvedValue([{ ok_0: 7, an_0: 1, in_0: 2, dc_0: 3, al_0: 13 }]);

    const rows = await fetchSpecCanalStatusMatrix(
      TABLE,
      [channels[0]],
      "2024-01-01",
      "2024-01-31",
      m,
    );

    expect(rows).toEqual([
      { canal: "Alpha", réussie: 7, annulation: 1, instance: 2, échec: 3, total: 13 },
    ]);
  });

  it("returns zeroed rows when the query throws", async () => {
    runReadOnlyQuery.mockRejectedValue(new Error("x"));

    const rows = await fetchSpecCanalStatusMatrix(TABLE, channels, "", "");

    expect(rows).toEqual([
      { canal: "Alpha", réussie: 0, annulation: 0, instance: 0, échec: 0, total: 0 },
      { canal: "Beta", réussie: 0, annulation: 0, instance: 0, échec: 0, total: 0 },
    ]);
  });
});

describe("canal rule defaults", () => {
  it("exposes the default rule list", () => {
    expect(Array.isArray(ALL_CANAL_RULES)).toBe(true);
  });
});

// QueriesModule is imported above for documentation / future use; referenced
// here to suppress an unused-import lint warning.
void (QueriesModule satisfies object);
