import { describe, expect, it } from "vitest";
import {
  channelFlowSql,
  channelRegionMatrixSql,
  regionRollupSql,
  tableExistsSql,
} from "@/features/geo-analysis/lib/geo-sql";
import type { ColumnMapping, StatusMapping } from "@/features/telecom/types";

/**
 * Unit tests for the geo aggregation SQL builders.
 *
 * These functions are pure string builders that push all aggregation into
 * DuckDB. We do NOT run SQL here; we assert the structural contract: correct
 * grouping/quoting, the success filter wiring, LIMIT clamping/flooring and that
 * untrusted identifiers flow through the audited `qc` quoter (injection guard).
 */

function makeMapping(over: Partial<ColumnMapping> = {}): ColumnMapping {
  return {
    transactionId: "TXN_ID",
    transactionDate: "TXN_DATE",
    transactionTime: "TXN_TIME",
    canal: "CANAL",
    serviceCode: "SERVICE_CODE",
    serviceName: "SERVICE_NAME",
    transactionType: "TXN_TYPE",
    subscriberType: "SUB_TYPE",
    msisdn: "MSISDN",
    amount: "AMOUNT",
    status: "STATUS",
    errorCode: "ERR_CODE",
    errorMessage: "ERR_MSG",
    operator: "OPERATOR",
    region: "REGION",
    processingTimeMs: "PROC_MS",
    previousBalance: "PREV_BAL",
    newBalance: "NEW_BAL",
    totalAmount: "TOTAL_AMOUNT",
    retryCount: "RETRY",
    ...over,
  };
}

const STATUS_MAPPINGS: StatusMapping[] = [
  {
    rawCode: "00",
    label: "Success",
    semantic: "success",
    color: "#0f0",
    badgeClass: "ok",
  },
];

describe("regionRollupSql", () => {
  it("groups by region and projects transactions, revenue and success", () => {
    const sql = regionRollupSql("daily_txn", makeMapping(), STATUS_MAPPINGS);

    expect(sql).toContain('FROM "daily_txn"');
    expect(sql).toContain('"REGION"');
    expect(sql).toContain("COUNT(*)");
    expect(sql).toContain('ROUND(SUM(TRY_CAST("AMOUNT" AS DOUBLE)), 3)');
    expect(sql).toContain("FILTER (WHERE");
    expect(sql).toContain("= 'SUCCESS'");
    expect(sql).toContain("GROUP BY 1");
    expect(sql).toContain("ORDER BY transactions DESC");
  });

  it("excludes null/empty/'NULL' regions and labels missing as 'Inconnu'", () => {
    const sql = regionRollupSql("t", makeMapping(), STATUS_MAPPINGS);

    expect(sql).toContain("'Inconnu'");
    expect(sql).toContain("IS NOT NULL");
    expect(sql).toContain("NOT IN ('', 'NULL')");
  });

  it("clamps and floors the limit", () => {
    expect(regionRollupSql("t", makeMapping(), STATUS_MAPPINGS, 50)).toContain("LIMIT 50");
    // floored
    expect(regionRollupSql("t", makeMapping(), STATUS_MAPPINGS, 12.9)).toContain("LIMIT 12");
    // clamped to a minimum of 1
    expect(regionRollupSql("t", makeMapping(), STATUS_MAPPINGS, 0)).toContain("LIMIT 1");
    expect(regionRollupSql("t", makeMapping(), STATUS_MAPPINGS, -10)).toContain("LIMIT 1");
  });

  it("defaults the limit to 200 when omitted", () => {
    expect(regionRollupSql("t", makeMapping(), STATUS_MAPPINGS)).toContain("LIMIT 200");
  });

  it("routes the region column through the audited quoter (rejects injection)", () => {
    const evil = makeMapping({ region: "REGION; DROP TABLE x;--" });
    expect(() => regionRollupSql("t", evil, STATUS_MAPPINGS)).toThrow();
  });
});

describe("channelRegionMatrixSql", () => {
  it("builds a top-regions CTE then a long channel-by-region matrix", () => {
    const sql = channelRegionMatrixSql("t", makeMapping(), 5);

    expect(sql).toContain("WITH top_regions AS");
    expect(sql).toContain("IN (SELECT region FROM top_regions)");
    expect(sql).toContain("GROUP BY 1, 2");
    // canal classification expression present
    expect(sql).toContain("CASE");
    expect(sql).toContain("LIMIT 5");
  });

  it("clamps the region limit to at least 1", () => {
    expect(channelRegionMatrixSql("t", makeMapping(), 0)).toContain("LIMIT 1");
  });

  it("defaults the region limit to 12", () => {
    expect(channelRegionMatrixSql("t", makeMapping())).toContain("LIMIT 12");
  });
});

describe("channelFlowSql", () => {
  it("emits channel->region edges with a transaction and success count", () => {
    const sql = channelFlowSql("t", makeMapping(), STATUS_MAPPINGS, 100);

    expect(sql).toContain("GROUP BY 1, 2");
    expect(sql).toContain("HAVING COUNT(*) > 0");
    expect(sql).toContain("FILTER (WHERE");
    expect(sql).toContain("ORDER BY transactions DESC");
    expect(sql).toContain("LIMIT 100");
  });

  it("defaults the limit to 400 and clamps a fractional/zero limit", () => {
    expect(channelFlowSql("t", makeMapping(), STATUS_MAPPINGS)).toContain("LIMIT 400");
    expect(channelFlowSql("t", makeMapping(), STATUS_MAPPINGS, 0)).toContain("LIMIT 1");
  });
});

describe("tableExistsSql", () => {
  it("probes information_schema with the table name as a quoted literal", () => {
    const sql = tableExistsSql("my_table");
    expect(sql).toContain("information_schema.tables");
    expect(sql).toContain("table_name = 'my_table'");
    expect(sql).toContain("LIMIT 1");
  });

  it("escapes single quotes in the table name", () => {
    const sql = tableExistsSql("o'brien");
    expect(sql).toContain("'o''brien'");
  });
});
