import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Boundary mocks ───────────────────────────────────────────────────────────
// period-queries.ts talks to two IO-ish boundaries:
//   1. runReadOnlyQuery — the renderer DuckDB channel (real WASM worker)
//   2. ensureTelecomEnrichedView — probes/builds an enriched view (IO)
// Both are mocked so the tests stay hermetic and deterministic. Every OTHER
// import from "@/features/telecom/lib/queries" (the pure SQL-expression
// builders + date-filter builder) is kept real via importActual so the SQL the
// module actually emits is exercised, and only the IO surface is faked.

const runReadOnlyQuery = vi.fn<(sql: string) => Promise<Record<string, unknown>[]>>();
const ensureTelecomEnrichedView = vi.fn<() => Promise<boolean>>();

vi.mock("@/platform/duckdb/duckdb", () => ({
  runReadOnlyQuery: (sql: string) => runReadOnlyQuery(sql),
}));

vi.mock("@/features/telecom/lib/queries", async (importActual) => {
  const actual = await importActual<typeof import("@/features/telecom/lib/queries")>();
  return {
    ...actual,
    ensureTelecomEnrichedView: () => ensureTelecomEnrichedView(),
  };
});

import {
  fetchAnomalies,
  fetchAvailableDays,
  fetchBrandBreakdown,
  fetchCanalHourPeriod,
  fetchDayBuckets,
  fetchPeriodKPI,
  fetchRowCount,
  fetchRowCountForDay,
  fetchSubStatusBreakdown,
  fetchTopAccounts,
  SUB_STATUS_DEFS,
} from "@/features/telecom/lib/period-queries";
import { SPEC_STATUS_CODES } from "@/features/telecom/lib/status-definitions";
import type { ColumnMapping } from "@/features/telecom/types";

// ─── Test fixtures ────────────────────────────────────────────────────────────

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
const FROM = "2024-01-01";
const TO = "2024-01-31";

/** Last SQL string passed to runReadOnlyQuery (for behavioural SQL assertions). */
function lastSql(): string {
  const calls = runReadOnlyQuery.mock.calls;
  return String(calls[calls.length - 1]?.[0] ?? "");
}

beforeEach(() => {
  // vitest config has clearMocks+restoreMocks: re-establish safe defaults.
  ensureTelecomEnrichedView.mockResolvedValue(false);
  runReadOnlyQuery.mockResolvedValue([]);
});

// ──────────────────────────────────────────────────────────────────────────────
// SUB_STATUS_DEFS (pure constant)
// ──────────────────────────────────────────────────────────────────────────────

describe("SUB_STATUS_DEFS", () => {
  it("exposes the six configured sub-status groups in order", () => {
    expect(SUB_STATUS_DEFS.map((g) => g.label)).toEqual([
      "HOLD",
      "DOUBT",
      "SUCCESS",
      "REFUND",
      "DECLINED",
      "SUBMITTED",
    ]);
  });

  it("maps HOLD and DOUBT groups to the INSTANCE parent", () => {
    const hold = SUB_STATUS_DEFS.find((g) => g.label === "HOLD");
    const doubt = SUB_STATUS_DEFS.find((g) => g.label === "DOUBT");
    expect(hold?.parent).toBe("INSTANCE");
    expect(doubt?.parent).toBe("INSTANCE");
    expect(hold?.codes).toContain("HLD");
    expect(doubt?.codes).toContain("DBT");
  });

  it("wires the spec status codes into the matching parents", () => {
    const success = SUB_STATUS_DEFS.find((g) => g.label === "SUCCESS");
    const declined = SUB_STATUS_DEFS.find((g) => g.label === "DECLINED");
    expect(success?.codes).toBe(SPEC_STATUS_CODES.success);
    expect(declined?.codes).toBe(SPEC_STATUS_CODES.declined);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// fetchPeriodKPI
// ──────────────────────────────────────────────────────────────────────────────

describe("fetchPeriodKPI", () => {
  it("computes successRate as success/total*100 from the raw-table branch", async () => {
    ensureTelecomEnrichedView.mockResolvedValue(false);
    runReadOnlyQuery.mockResolvedValue([
      {
        total: 200,
        success: 150,
        declined: 30,
        refund: 10,
        instance: 8,
        submitted: 2,
        amount: 1234.5,
        avg_amount: 8.23,
        unique_customers: 90,
        unique_accounts: 80,
        unique_brands: 5,
      },
    ]);

    const kpi = await fetchPeriodKPI(TABLE, m, FROM, TO);

    expect(kpi).not.toBeNull();
    expect(kpi?.total).toBe(200);
    expect(kpi?.success).toBe(150);
    expect(kpi?.successRate).toBeCloseTo(75, 6);
    expect(kpi?.declined).toBe(30);
    expect(kpi?.amount).toBeCloseTo(1234.5, 6);
    expect(kpi?.avgAmount).toBeCloseTo(8.23, 6);
    expect(kpi?.uniqueCustomers).toBe(90);
    expect(kpi?.uniqueAccounts).toBe(80);
    expect(kpi?.uniqueBrands).toBe(5);
  });

  it("returns successRate 0 when total is 0 (division-by-zero guard)", async () => {
    runReadOnlyQuery.mockResolvedValue([{ total: 0, success: 0 }]);

    const kpi = await fetchPeriodKPI(TABLE, m, FROM, TO);

    expect(kpi?.total).toBe(0);
    expect(kpi?.successRate).toBe(0);
  });

  it("coerces missing/non-numeric aggregate fields to 0 via safeNum", async () => {
    runReadOnlyQuery.mockResolvedValue([{ total: 10, success: 4 }]);

    const kpi = await fetchPeriodKPI(TABLE, m, FROM, TO);

    expect(kpi?.amount).toBe(0);
    expect(kpi?.avgAmount).toBe(0);
    expect(kpi?.declined).toBe(0);
    expect(kpi?.uniqueCustomers).toBe(0);
    expect(kpi?.successRate).toBeCloseTo(40, 6);
  });

  it("queries the enriched view (not the raw table) when enrichment is available", async () => {
    ensureTelecomEnrichedView.mockResolvedValue(true);
    runReadOnlyQuery.mockResolvedValue([{ total: 5, success: 5 }]);

    const kpi = await fetchPeriodKPI(TABLE, m, FROM, TO);

    expect(kpi?.successRate).toBeCloseTo(100, 6);
    // enriched branch reads from `${table}_enriched` and uses _status_norm
    expect(lastSql()).toContain("txns_enriched");
    expect(lastSql()).toContain("_status_norm");
  });

  it("falls back to the raw table when the enriched query throws", async () => {
    ensureTelecomEnrichedView.mockResolvedValue(true);
    runReadOnlyQuery
      .mockRejectedValueOnce(new Error("enriched view missing"))
      .mockResolvedValueOnce([{ total: 8, success: 2 }]);

    const kpi = await fetchPeriodKPI(TABLE, m, FROM, TO);

    expect(runReadOnlyQuery).toHaveBeenCalledTimes(2);
    expect(kpi?.successRate).toBeCloseTo(25, 6);
    // second (fallback) query hits the raw table, not the enriched view
    expect(lastSql()).toContain('"txns"');
    expect(lastSql()).not.toContain("_status_norm");
  });

  it("returns null when the enriched branch yields no rows", async () => {
    ensureTelecomEnrichedView.mockResolvedValue(true);
    runReadOnlyQuery.mockResolvedValue([]);

    const kpi = await fetchPeriodKPI(TABLE, m, FROM, TO);

    expect(kpi).toBeNull();
  });

  it("returns null when the raw-table branch yields no rows", async () => {
    ensureTelecomEnrichedView.mockResolvedValue(false);
    runReadOnlyQuery.mockResolvedValue([]);

    const kpi = await fetchPeriodKPI(TABLE, m, FROM, TO);

    expect(kpi).toBeNull();
  });

  it("returns null when the raw-table query throws (catch path)", async () => {
    ensureTelecomEnrichedView.mockResolvedValue(false);
    runReadOnlyQuery.mockRejectedValue(new Error("boom"));

    const kpi = await fetchPeriodKPI(TABLE, m, FROM, TO);

    expect(kpi).toBeNull();
  });

  it("embeds the date-range filter built from the mapping column", async () => {
    runReadOnlyQuery.mockResolvedValue([{ total: 1, success: 1 }]);

    await fetchPeriodKPI(TABLE, m, FROM, TO);

    const sql = lastSql();
    expect(sql).toContain("BETWEEN");
    expect(sql).toContain("2024-01-01");
    expect(sql).toContain("2024-01-31");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// fetchSubStatusBreakdown
// ──────────────────────────────────────────────────────────────────────────────

describe("fetchSubStatusBreakdown", () => {
  it("computes share as count/total*100 and resolves the parent group", async () => {
    runReadOnlyQuery.mockResolvedValue([
      { code: "PST", n: 60, amount: 600 },
      { code: "DCL", n: 40, amount: 0 },
    ]);

    const rows = await fetchSubStatusBreakdown(TABLE, m, FROM, TO);

    expect(rows).toHaveLength(2);
    const pst = rows.find((r) => r.code === "PST");
    const dcl = rows.find((r) => r.code === "DCL");
    expect(pst?.parent).toBe("SUCCESS");
    expect(pst?.count).toBe(60);
    expect(pst?.amount).toBeCloseTo(600, 6);
    expect(pst?.share).toBeCloseTo(60, 6); // 60 / 100
    expect(dcl?.parent).toBe("DECLINED");
    expect(dcl?.share).toBeCloseTo(40, 6);
  });

  it("maps INSTANCE sub-codes (HOLD/DOUBT) back to the INSTANCE parent", async () => {
    runReadOnlyQuery.mockResolvedValue([
      { code: "HLD", n: 5, amount: 0 },
      { code: "DBT", n: 5, amount: 0 },
    ]);

    const rows = await fetchSubStatusBreakdown(TABLE, m, FROM, TO);

    expect(rows.every((r) => r.parent === "INSTANCE")).toBe(true);
  });

  it("labels an unknown code's parent as OTHER", async () => {
    runReadOnlyQuery.mockResolvedValue([{ code: "ZZZ", n: 10, amount: 0 }]);

    const rows = await fetchSubStatusBreakdown(TABLE, m, FROM, TO);

    expect(rows[0].parent).toBe("OTHER");
  });

  it("treats a null code as empty string with OTHER parent and zero share when total is 0", async () => {
    runReadOnlyQuery.mockResolvedValue([{ code: null, n: 0, amount: null }]);

    const rows = await fetchSubStatusBreakdown(TABLE, m, FROM, TO);

    expect(rows[0].code).toBe("");
    expect(rows[0].parent).toBe("OTHER");
    expect(rows[0].amount).toBe(0);
    expect(rows[0].share).toBe(0); // total === 0 ⇒ guarded
  });

  it("returns an empty array when the query yields no rows", async () => {
    runReadOnlyQuery.mockResolvedValue([]);

    const rows = await fetchSubStatusBreakdown(TABLE, m, FROM, TO);

    expect(rows).toEqual([]);
  });

  it("returns an empty array when the query throws (catch path)", async () => {
    runReadOnlyQuery.mockRejectedValue(new Error("nope"));

    const rows = await fetchSubStatusBreakdown(TABLE, m, FROM, TO);

    expect(rows).toEqual([]);
  });

  it("builds an IN-list of all configured sub-status codes", async () => {
    runReadOnlyQuery.mockResolvedValue([]);

    await fetchSubStatusBreakdown(TABLE, m, FROM, TO);

    const sql = lastSql();
    expect(sql).toContain("'PST'");
    expect(sql).toContain("'DCL'");
    expect(sql).toContain("'HLD'");
    expect(sql).toContain("'SBM'");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// fetchTopAccounts
// ──────────────────────────────────────────────────────────────────────────────

describe("fetchTopAccounts", () => {
  it("maps rows and computes per-account successRate", async () => {
    runReadOnlyQuery.mockResolvedValue([
      { msisdn: "216900", name: "Alice", total: 50, success: 40, amount: 999.5, fav_canal: "Bill Payment" },
    ]);

    const rows = await fetchTopAccounts(TABLE, m, FROM, TO);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      msisdn: "216900",
      name: "Alice",
      total: 50,
      success: 40,
      favCanal: "Bill Payment",
    });
    expect(rows[0].amount).toBeCloseTo(999.5, 6);
    expect(rows[0].successRate).toBeCloseTo(80, 6);
  });

  it("guards successRate against zero total and stringifies null fields", async () => {
    runReadOnlyQuery.mockResolvedValue([
      { msisdn: null, name: null, total: 0, success: 0, amount: null, fav_canal: null },
    ]);

    const rows = await fetchTopAccounts(TABLE, m, FROM, TO);

    expect(rows[0].msisdn).toBe("");
    expect(rows[0].name).toBe("");
    expect(rows[0].favCanal).toBe("");
    expect(rows[0].amount).toBe(0);
    expect(rows[0].successRate).toBe(0);
  });

  it("orders by amount and applies the default limit of 25", async () => {
    runReadOnlyQuery.mockResolvedValue([]);

    await fetchTopAccounts(TABLE, m, FROM, TO);

    const sql = lastSql();
    expect(sql).toContain("ORDER BY amount DESC");
    expect(sql).toContain("LIMIT 25");
  });

  it("orders by total and honours a custom limit when by='count'", async () => {
    runReadOnlyQuery.mockResolvedValue([]);

    await fetchTopAccounts(TABLE, m, FROM, TO, 7, "count");

    const sql = lastSql();
    expect(sql).toContain("ORDER BY total DESC");
    expect(sql).toContain("LIMIT 7");
  });

  it("returns an empty array when the query throws", async () => {
    runReadOnlyQuery.mockRejectedValue(new Error("fail"));

    const rows = await fetchTopAccounts(TABLE, m, FROM, TO);

    expect(rows).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// fetchDayBuckets
// ──────────────────────────────────────────────────────────────────────────────

describe("fetchDayBuckets", () => {
  it("maps day buckets and truncates the day string to 10 chars (YYYY-MM-DD)", async () => {
    runReadOnlyQuery.mockResolvedValue([
      { day: "2024-01-05 00:00:00", total: 12, success: 9, declined: 2, amount: 42.25 },
    ]);

    const rows = await fetchDayBuckets(TABLE, m, FROM, TO);

    expect(rows[0].day).toBe("2024-01-05");
    expect(rows[0].total).toBe(12);
    expect(rows[0].success).toBe(9);
    expect(rows[0].declined).toBe(2);
    expect(rows[0].amount).toBeCloseTo(42.25, 6);
  });

  it("coerces a null day to empty string and missing numbers to 0", async () => {
    runReadOnlyQuery.mockResolvedValue([{ day: null }]);

    const rows = await fetchDayBuckets(TABLE, m, FROM, TO);

    expect(rows[0].day).toBe("");
    expect(rows[0].total).toBe(0);
    expect(rows[0].amount).toBe(0);
  });

  it("returns an empty array when the query throws", async () => {
    runReadOnlyQuery.mockRejectedValue(new Error("x"));

    const rows = await fetchDayBuckets(TABLE, m, FROM, TO);

    expect(rows).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// fetchAvailableDays
// ──────────────────────────────────────────────────────────────────────────────

describe("fetchAvailableDays", () => {
  it("returns only well-formed 10-char day strings", async () => {
    runReadOnlyQuery.mockResolvedValue([
      { day: "2024-01-05 12:00:00" },
      { day: "2024-01-04" },
      { day: "bad" }, // too short after slice ⇒ dropped
      { day: null }, // "" ⇒ dropped
    ]);

    const days = await fetchAvailableDays(TABLE, m);

    expect(days).toEqual(["2024-01-05", "2024-01-04"]);
  });

  it("works without an explicit mapping (defaults to TRANSACTION_DATE)", async () => {
    runReadOnlyQuery.mockResolvedValue([{ day: "2024-02-01" }]);

    const days = await fetchAvailableDays(TABLE);

    expect(days).toEqual(["2024-02-01"]);
    expect(lastSql()).toContain("TRANSACTION_DATE");
  });

  it("returns an empty array when the query throws", async () => {
    runReadOnlyQuery.mockRejectedValue(new Error("x"));

    const days = await fetchAvailableDays(TABLE, m);

    expect(days).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// fetchCanalHourPeriod
// ──────────────────────────────────────────────────────────────────────────────

describe("fetchCanalHourPeriod", () => {
  it("maps canal-hour cells with numeric coercion", async () => {
    runReadOnlyQuery.mockResolvedValue([
      { canal: "Bill Payment", hour: 9, total: 100, success: 90, declined: 10 },
    ]);

    const rows = await fetchCanalHourPeriod(TABLE, m, FROM, TO);

    expect(rows[0]).toEqual({
      canal: "Bill Payment",
      hour: 9,
      total: 100,
      success: 90,
      declined: 10,
    });
  });

  it("coerces null canal to empty string and null numbers to 0", async () => {
    runReadOnlyQuery.mockResolvedValue([
      { canal: null, hour: null, total: null, success: null, declined: null },
    ]);

    const rows = await fetchCanalHourPeriod(TABLE, m, FROM, TO);

    expect(rows[0]).toEqual({ canal: "", hour: 0, total: 0, success: 0, declined: 0 });
  });

  it("excludes the 'Other' canal and constrains the hour to 0..23 in SQL", async () => {
    runReadOnlyQuery.mockResolvedValue([]);

    await fetchCanalHourPeriod(TABLE, m, FROM, TO);

    const sql = lastSql();
    expect(sql).toContain("BETWEEN 0 AND 23");
    expect(sql).toContain("!= 'Other'");
  });

  it("returns an empty array when the query throws", async () => {
    runReadOnlyQuery.mockRejectedValue(new Error("x"));

    const rows = await fetchCanalHourPeriod(TABLE, m, FROM, TO);

    expect(rows).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// fetchBrandBreakdown
// ──────────────────────────────────────────────────────────────────────────────

describe("fetchBrandBreakdown", () => {
  it("maps brand rows and computes successRate", async () => {
    runReadOnlyQuery.mockResolvedValue([
      { brand_id: 7, brand_name: "Ooredoo", total: 80, success: 60, amount: 555.25 },
    ]);

    const rows = await fetchBrandBreakdown(TABLE, m, FROM, TO);

    expect(rows[0]).toMatchObject({ brandId: 7, brandName: "Ooredoo", total: 80, success: 60 });
    expect(rows[0].amount).toBeCloseTo(555.25, 6);
    expect(rows[0].successRate).toBeCloseTo(75, 6);
  });

  it("guards successRate against zero total and coerces null brand fields", async () => {
    runReadOnlyQuery.mockResolvedValue([
      { brand_id: null, brand_name: null, total: 0, success: 0, amount: null },
    ]);

    const rows = await fetchBrandBreakdown(TABLE, m, FROM, TO);

    expect(rows[0].brandId).toBe(0);
    expect(rows[0].brandName).toBe("");
    expect(rows[0].successRate).toBe(0);
  });

  it("applies the default LIMIT 30 and a custom limit", async () => {
    runReadOnlyQuery.mockResolvedValue([]);
    await fetchBrandBreakdown(TABLE, m, FROM, TO);
    expect(lastSql()).toContain("LIMIT 30");

    await fetchBrandBreakdown(TABLE, m, FROM, TO, 3);
    expect(lastSql()).toContain("LIMIT 3");
  });

  it("returns an empty array when the query throws", async () => {
    runReadOnlyQuery.mockRejectedValue(new Error("x"));

    const rows = await fetchBrandBreakdown(TABLE, m, FROM, TO);

    expect(rows).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// fetchAnomalies (z-score detector built on fetchCanalHourPeriod)
// ──────────────────────────────────────────────────────────────────────────────

describe("fetchAnomalies", () => {
  it("skips canals with fewer than 3 cells (insufficient sample)", async () => {
    runReadOnlyQuery.mockResolvedValue([
      { canal: "Bill Payment", hour: 9, total: 100, success: 90, declined: 10 },
      { canal: "Bill Payment", hour: 10, total: 100, success: 90, declined: 10 },
    ]);

    const anomalies = await fetchAnomalies(TABLE, m, FROM, TO);

    expect(anomalies).toEqual([]);
  });

  it("flags a success-rate collapse with z <= -2 and a French reason", async () => {
    // Nine cells at 100% success + one cell at 0% success ⇒ the outlier's
    // success-rate z-score drops well below -2.
    const cells = [
      ...Array.from({ length: 9 }, (_, i) => ({
        canal: "Bill Payment",
        hour: i,
        total: 100,
        success: 100,
        declined: 0,
      })),
      { canal: "Bill Payment", hour: 9, total: 100, success: 0, declined: 100 },
    ];
    runReadOnlyQuery.mockResolvedValue(cells);

    const anomalies = await fetchAnomalies(TABLE, m, FROM, TO);

    expect(anomalies.length).toBeGreaterThan(0);
    const flagged = anomalies.find((a) => a.successRate === 0);
    expect(flagged).toBeDefined();
    expect(flagged?.reason).toContain("Taux réussite chute");
    expect(flagged?.z).toBeGreaterThanOrEqual(2);
  });

  it("flags a volume spike with z >= 2.5 ('Pic de volume')", async () => {
    // Nine quiet cells + one huge-volume cell, all at 100% success so the rate
    // z-score never trips and only the volume rule fires.
    const cells = [
      ...Array.from({ length: 9 }, (_, i) => ({
        canal: "Bill Payment",
        hour: i,
        total: 10,
        success: 10,
        declined: 0,
      })),
      { canal: "Bill Payment", hour: 9, total: 100000, success: 100000, declined: 0 },
    ];
    runReadOnlyQuery.mockResolvedValue(cells);

    const anomalies = await fetchAnomalies(TABLE, m, FROM, TO);

    const spike = anomalies.find((a) => a.total === 100000);
    expect(spike).toBeDefined();
    expect(spike?.reason).toContain("Pic de volume");
  });

  it("returns no anomalies when all cells are statistically identical (sd=0)", async () => {
    const cells = Array.from({ length: 5 }, (_, i) => ({
      canal: "Bill Payment",
      hour: i,
      total: 100,
      success: 80,
      declined: 20,
    }));
    runReadOnlyQuery.mockResolvedValue(cells);

    const anomalies = await fetchAnomalies(TABLE, m, FROM, TO);

    // identical rates & totals ⇒ stddev 0 ⇒ z-scores forced to 0 ⇒ nothing flagged
    expect(anomalies).toEqual([]);
  });

  it("sorts anomalies by descending z and caps the result at 50", async () => {
    // Build many canals, each a 9×100%+1×0% pattern, to overflow the 50 cap.
    const cells: Array<Record<string, unknown>> = [];
    for (let c = 0; c < 80; c++) {
      const canal = `Canal-${c}`;
      for (let i = 0; i < 9; i++) {
        cells.push({ canal, hour: i, total: 100, success: 100, declined: 0 });
      }
      cells.push({ canal, hour: 9, total: 100, success: 0, declined: 100 });
    }
    runReadOnlyQuery.mockResolvedValue(cells);

    const anomalies = await fetchAnomalies(TABLE, m, FROM, TO);

    expect(anomalies.length).toBeLessThanOrEqual(50);
    for (let i = 1; i < anomalies.length; i++) {
      expect(anomalies[i - 1].z).toBeGreaterThanOrEqual(anomalies[i].z);
    }
  });

  it("returns an empty array when the underlying query throws", async () => {
    runReadOnlyQuery.mockRejectedValue(new Error("x"));

    const anomalies = await fetchAnomalies(TABLE, m, FROM, TO);

    expect(anomalies).toEqual([]);
  });

  it("flags an abnormally low volume cell with 'Volume anormalement bas'", async () => {
    // Nine cells with high volume + one cell with near-zero volume.
    // The low-volume cell's z-score drops well below -2.5, triggering the
    // "Volume anormalement bas" branch (zVol <= -2.5).
    const cells = [
      ...Array.from({ length: 9 }, (_, i) => ({
        canal: "Mobile",
        hour: i,
        total: 10000,
        success: 9000,
        declined: 1000,
      })),
      { canal: "Mobile", hour: 9, total: 1, success: 1, declined: 0 },
    ];
    runReadOnlyQuery.mockResolvedValue(cells);

    const anomalies = await fetchAnomalies(TABLE, m, FROM, TO);

    const lowVol = anomalies.find((a) => a.total === 1);
    expect(lowVol).toBeDefined();
    expect(lowVol?.reason).toContain("Volume anormalement bas");
  });

  it("combines multiple anomaly reasons when both rate and volume thresholds are exceeded", async () => {
    // Nine cells with high volume and high success rate + one cell with
    // near-zero volume AND zero success, triggering both the rate collapse
    // and the low-volume branch simultaneously.
    const cells = [
      ...Array.from({ length: 9 }, (_, i) => ({
        canal: "ATM",
        hour: i,
        total: 10000,
        success: 10000,
        declined: 0,
      })),
      { canal: "ATM", hour: 9, total: 1, success: 0, declined: 1 },
    ];
    runReadOnlyQuery.mockResolvedValue(cells);

    const anomalies = await fetchAnomalies(TABLE, m, FROM, TO);

    const cell = anomalies.find((a) => a.total === 1);
    expect(cell).toBeDefined();
    // Both branches must fire and be joined with " · "
    expect(cell?.reason).toContain("Taux réussite chute");
    expect(cell?.reason).toContain("Volume anormalement bas");
    expect(cell?.reason).toContain(" · ");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// fetchRowCount / fetchRowCountForDay
// ──────────────────────────────────────────────────────────────────────────────

describe("fetchRowCount", () => {
  it("returns the COUNT(*) scalar from the first row", async () => {
    runReadOnlyQuery.mockResolvedValue([{ n: 4242 }]);

    expect(await fetchRowCount(TABLE)).toBe(4242);
  });

  it("returns 0 when there are no rows", async () => {
    runReadOnlyQuery.mockResolvedValue([]);

    expect(await fetchRowCount(TABLE)).toBe(0);
  });

  it("returns 0 when the query throws", async () => {
    runReadOnlyQuery.mockRejectedValue(new Error("x"));

    expect(await fetchRowCount(TABLE)).toBe(0);
  });
});

describe("fetchRowCountForDay", () => {
  it("returns the row count for the requested day", async () => {
    runReadOnlyQuery.mockResolvedValue([{ n: 17 }]);

    const n = await fetchRowCountForDay(TABLE, m, "2024-01-05");

    expect(n).toBe(17);
    // the day literal must be embedded via STRPTIME(...)
    expect(lastSql()).toContain("STRPTIME");
    expect(lastSql()).toContain("2024-01-05");
  });

  it("returns 0 when no rows match", async () => {
    runReadOnlyQuery.mockResolvedValue([]);

    expect(await fetchRowCountForDay(TABLE, m, "2024-01-05")).toBe(0);
  });

  it("returns 0 when the query throws", async () => {
    runReadOnlyQuery.mockRejectedValue(new Error("x"));

    expect(await fetchRowCountForDay(TABLE, m, "2024-01-05")).toBe(0);
  });
});
