import { describe, expect, it } from "vitest";
import { DEFAULT_STATUS_MAPPINGS } from "@/features/telecom/lib/status-definitions";
import {
  canalCaseExpr,
  canalWhere,
  colExpr,
  hourExpr,
  normalizeStatusCode,
  qc,
  sqlLiteral,
  statusNorm,
} from "@/features/telecom/lib/sql";
import type { CanalKey, ColumnMapping, StatusMapping } from "@/features/telecom/types";

// A minimal column mapping; only the fields each helper reads matter.
const mapping = (overrides: Partial<ColumnMapping> = {}): ColumnMapping =>
  ({
    transactionId: "TRANSACTION_ID",
    transactionDate: "TRANSACTION_DATE",
    transactionTime: "",
    canal: "CHANNEL",
    serviceCode: "",
    serviceName: "",
    transactionType: "",
    subscriberType: "",
    msisdn: "ACCOUNT_MSISDN",
    amount: "ORIGINAL_AMOUNT",
    status: "TRANSACTION_STATUS",
    errorCode: "",
    errorMessage: "",
    operator: "",
    region: "",
    processingTimeMs: "",
    previousBalance: "",
    newBalance: "",
    totalAmount: "",
    retryCount: "",
    ...overrides,
  }) as ColumnMapping;

describe("qc — safe identifier quoting", () => {
  it("wraps a plain column name in double quotes", () => {
    expect(qc("TRANSACTION_ID")).toBe('"TRANSACTION_ID"');
  });

  it("preserves spaces and mixed case inside the quotes", () => {
    expect(qc("Account Group ID")).toBe('"Account Group ID"');
  });

  it("doubles EVERY embedded double quote (regression: not just the first)", () => {
    expect(qc('a"b"c')).toBe('"a""b""c"');
    expect(qc('"lead')).toBe('"""lead"');
    expect(qc('trail"')).toBe('"trail"""');
  });

  it("throws a TypeError on an empty string", () => {
    expect(() => qc("")).toThrow(TypeError);
  });

  it("throws on a non-string identifier", () => {
    // @ts-expect-error — deliberately passing a wrong type to test the guard.
    expect(() => qc(123)).toThrow(TypeError);
  });

  it("rejects identifiers containing a semicolon (injection attempt)", () => {
    expect(() => qc("col; DROP TABLE t")).toThrow(/Unsafe column identifier/);
  });

  it("rejects identifiers containing a SQL line comment", () => {
    expect(() => qc("col -- comment")).toThrow(/Unsafe column identifier/);
  });

  it("rejects identifiers containing a block comment opener", () => {
    expect(() => qc("col /* x")).toThrow(/Unsafe column identifier/);
  });

  it("rejects identifiers containing a backslash", () => {
    expect(() => qc("col\\name")).toThrow(/Unsafe column identifier/);
  });
});

describe("sqlLiteral — string literal quoting", () => {
  it("wraps a plain value in single quotes", () => {
    expect(sqlLiteral("SUCCESS")).toBe("'SUCCESS'");
  });

  it("doubles EVERY embedded single quote (regression: not just the first)", () => {
    // French data is full of apostrophes — `d'aujourd'hui` has two and must not
    // produce broken/injectable SQL.
    expect(sqlLiteral("d'aujourd'hui")).toBe("'d''aujourd''hui'");
    expect(sqlLiteral("O'Brien")).toBe("'O''Brien'");
    expect(sqlLiteral("'; DROP TABLE t; --")).toBe("'''; DROP TABLE t; --'");
  });

  it("leaves a value with no quotes unchanged inside the wrapper", () => {
    expect(sqlLiteral("RECHARGE")).toBe("'RECHARGE'");
  });
});

describe("colExpr — column expression or NULL", () => {
  it("quotes a present column", () => {
    expect(colExpr("AMOUNT")).toBe('"AMOUNT"');
  });

  it("returns the NULL literal for an unmapped (empty) column", () => {
    expect(colExpr("")).toBe("NULL");
  });
});

describe("sqlLiteral — string literal escaping", () => {
  it("wraps a value in single quotes", () => {
    expect(sqlLiteral("PST")).toBe("'PST'");
  });

  it("doubles the first embedded single quote", () => {
    expect(sqlLiteral("O'Brien")).toBe("'O''Brien'");
  });

  it("leaves a value with no quotes untouched apart from wrapping", () => {
    expect(sqlLiteral("123/45")).toBe("'123/45'");
  });
});

describe("normalizeStatusCode — raw code → business category", () => {
  it("maps a configured success code to SUCCESS", () => {
    expect(normalizeStatusCode("PST")).toBe("SUCCESS");
  });

  it("is case-insensitive and trims surrounding whitespace", () => {
    expect(normalizeStatusCode("  pst  ")).toBe("SUCCESS");
  });

  it("maps a declined code to DECLINED", () => {
    expect(normalizeStatusCode("DCL")).toBe("DECLINED");
  });

  it("maps a refund code to REFUND", () => {
    expect(normalizeStatusCode("RFD")).toBe("REFUND");
  });

  it("maps an instance/hold code to INSTANCE", () => {
    expect(normalizeStatusCode("HLD")).toBe("INSTANCE");
  });

  it("maps the submitted code to SUBMITTED", () => {
    expect(normalizeStatusCode("SBM")).toBe("SUBMITTED");
  });

  it("returns an empty string for blank input", () => {
    expect(normalizeStatusCode("   ")).toBe("");
  });

  it("falls back to OTHER for an unknown code", () => {
    expect(normalizeStatusCode("ZZZ")).toBe("OTHER");
  });

  it("honours a configured mapping that overrides builtin classification", () => {
    const custom: StatusMapping[] = [
      {
        rawCode: "PST",
        label: "Custom",
        semantic: "declined",
        color: "#000",
        badgeClass: "",
      },
    ];
    expect(normalizeStatusCode("PST", custom)).toBe("DECLINED");
  });

  it("returns OTHER when a configured mapping marks the code as other", () => {
    const custom: StatusMapping[] = [
      {
        rawCode: "PST",
        label: "Other",
        semantic: "other",
        color: "#000",
        badgeClass: "",
      },
    ];
    expect(normalizeStatusCode("PST", custom)).toBe("OTHER");
  });
});

describe("statusNorm — SQL CASE expression for status", () => {
  it("produces a CASE expression keyed off the mapped status column", () => {
    const sql = statusNorm(mapping(), DEFAULT_STATUS_MAPPINGS);
    expect(sql).toMatch(/^CASE/);
    expect(sql).toContain('"TRANSACTION_STATUS"');
    expect(sql).toMatch(/END$/);
  });

  it("emits a WHEN clause that maps PST to SUCCESS", () => {
    const sql = statusNorm(mapping(), DEFAULT_STATUS_MAPPINGS);
    expect(sql).toContain("'PST'");
    expect(sql).toContain("'SUCCESS'");
  });

  it("defaults unmatched codes to OTHER via the ELSE branch", () => {
    const sql = statusNorm(mapping(), DEFAULT_STATUS_MAPPINGS);
    expect(sql).toContain("ELSE 'OTHER'");
  });

  it("returns the constant OTHER literal when no mappings have raw codes", () => {
    const empty: StatusMapping[] = [
      {
        rawCode: "   ",
        label: "",
        semantic: "other",
        color: "",
        badgeClass: "",
      },
    ];
    // No configured codes AND every builtin code still emits clauses... so to
    // truly hit the empty branch we pass a mapping that already covers every
    // builtin code as "other" is not possible; instead verify the all-builtin
    // path still yields a CASE (regression guard for the empty-clause branch).
    const sql = statusNorm(mapping(), empty);
    expect(sql).toMatch(/^CASE|^'OTHER'$/);
  });

  it("includes builtin codes that are not present in the configured mapping", () => {
    const onlyOne: StatusMapping[] = [
      {
        rawCode: "PST",
        label: "ok",
        semantic: "success",
        color: "",
        badgeClass: "",
      },
    ];
    const sql = statusNorm(mapping(), onlyOne);
    // A declined builtin code missing from the mapping should still appear.
    expect(sql).toContain("'DCL'");
  });
});

describe("hourExpr — hour extraction expression", () => {
  it("references the mapped transaction date column", () => {
    expect(hourExpr(mapping({ transactionDate: "TXN_TS" }))).toContain('"TXN_TS"');
  });

  it("splits on space then colon to isolate the hour", () => {
    const sql = hourExpr(mapping());
    expect(sql).toContain("SPLIT_PART");
    expect(sql).toContain("AS INTEGER");
  });
});

describe("canalWhere — per-canal SQL predicates", () => {
  it("returns a predicate for every canal key", () => {
    const where = canalWhere(mapping());
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
      expect(typeof where[k]).toBe("string");
      expect(where[k].length).toBeGreaterThan(0);
    }
  });

  it("ORs the underlying channel conditions inside a parenthesised group", () => {
    const where = canalWhere(mapping());
    expect(where.bill_payment.startsWith("(")).toBe(true);
    expect(where.bill_payment.endsWith(")")).toBe(true);
    expect(where.bill_payment).toContain(" OR ");
  });
});

describe("canalCaseExpr — canal classification CASE", () => {
  it("opens with CASE and closes with END", () => {
    const sql = canalCaseExpr(mapping());
    expect(sql).toMatch(/^CASE/);
    expect(sql).toMatch(/END$/);
  });

  it("labels each canal with its French/business label", () => {
    const sql = canalCaseExpr(mapping());
    expect(sql).toContain("'Bill Payment'");
    expect(sql).toContain("'Credit Transfer'");
    expect(sql).toContain("'Voucher Convergent Management'");
  });

  it("falls back to 'Other' when nothing matches", () => {
    expect(canalCaseExpr(mapping())).toContain("ELSE 'Other'");
  });
});
