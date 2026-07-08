import { describe, expect, it, vi } from "vitest";

// queries.ts imports the DuckDB boundary at module load. We never exercise IO
// here — only the pure SQL-expression builders — so the boundary is mocked to
// keep the unit test hermetic (no real DuckDB / WASM worker).
vi.mock("@/platform/duckdb/duckdb", () => ({
  runReadOnlyQuery: vi.fn(async () => []),
}));

import {
  buildSpecDateFilter,
  CANAL_KEY_TO_LABEL,
  transactionDateExpr,
  transactionDayExpr,
  transactionHourExpr,
} from "@/features/telecom/lib/queries";
import type { CanalKey } from "@/features/telecom/types";

describe("CANAL_KEY_TO_LABEL", () => {
  it("maps every canal key to a human label", () => {
    const keys: CanalKey[] = [
      "bill_payment",
      "voice_fixed_ttcash",
      "voice_fixed_voucher",
      "voice_mobile_ttcash",
      "voice_mobile_voucher",
      "data_sabba",
      "data_evoucher",
      "voucher_for_payment",
      "credit_transfer",
      "voucher_convergent",
    ];
    for (const k of keys) {
      expect(CANAL_KEY_TO_LABEL[k]).toBeTruthy();
      expect(typeof CANAL_KEY_TO_LABEL[k]).toBe("string");
    }
  });

  it("uses the expected business label for bill payment", () => {
    expect(CANAL_KEY_TO_LABEL.bill_payment).toBe("Bill Payment");
  });

  it("produces unique labels (no two canals share a label)", () => {
    const labels = Object.values(CANAL_KEY_TO_LABEL);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("transactionDateExpr", () => {
  it("defaults to the TRANSACTION_DATE column quoted", () => {
    expect(transactionDateExpr()).toContain('"TRANSACTION_DATE"');
  });

  it("quotes a custom date column", () => {
    expect(transactionDateExpr("TXN_TS")).toContain('"TXN_TS"');
  });

  it("tries multiple parse formats via COALESCE for robustness", () => {
    const expr = transactionDateExpr();
    expect(expr).toContain("COALESCE");
    expect(expr).toContain("TRY_CAST");
    expect(expr).toContain("TRY_STRPTIME");
    // Both ISO and dd/mm/yyyy formats must be attempted.
    expect(expr).toContain("%Y-%m-%d");
    expect(expr).toContain("%d/%m/%Y");
  });
});

describe("transactionDayExpr", () => {
  it("truncates the parsed timestamp to the day", () => {
    const expr = transactionDayExpr();
    expect(expr).toContain("DATE_TRUNC('day'");
    expect(expr).toContain('"TRANSACTION_DATE"');
  });

  it("threads a custom column through to the inner date expression", () => {
    expect(transactionDayExpr("CREATED_AT")).toContain('"CREATED_AT"');
  });
});

describe("transactionHourExpr", () => {
  it("extracts an integer hour by splitting on space then colon", () => {
    const expr = transactionHourExpr();
    expect(expr).toContain("SPLIT_PART");
    expect(expr).toContain("AS INTEGER");
    expect(expr).toContain('"TRANSACTION_DATE"');
  });
});

describe("buildSpecDateFilter", () => {
  it("returns an empty string when neither bound is supplied", () => {
    expect(buildSpecDateFilter("", "")).toBe("");
  });

  it("produces a BETWEEN clause when both bounds are present", () => {
    const sql = buildSpecDateFilter("2026-01-01", "2026-01-31");
    expect(sql).toContain("BETWEEN");
    expect(sql).toMatch(/^ AND /);
  });

  it("produces a >= clause when only the start is present", () => {
    const sql = buildSpecDateFilter("2026-01-01", "");
    expect(sql).toContain(">=");
    expect(sql).not.toContain("BETWEEN");
  });

  it("produces a <= clause when only the end is present", () => {
    const sql = buildSpecDateFilter("", "2026-01-31");
    expect(sql).toContain("<=");
    expect(sql).not.toContain("BETWEEN");
  });

  it("casts both sides to DATE so time components do not skew the range", () => {
    const sql = buildSpecDateFilter("2026-01-01", "2026-01-31");
    expect(sql).toContain("AS DATE");
  });

  it("honours a custom date column", () => {
    const sql = buildSpecDateFilter("2026-01-01", "2026-01-31", "CREATED_AT");
    expect(sql).toContain('"CREATED_AT"');
  });
});
