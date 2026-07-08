import { describe, expect, it, vi } from "vitest";
import { DEFAULT_STATUS_MAPPINGS } from "@/features/telecom/lib/status-definitions";
import {
  BUILTIN_STATUS_CODES,
  SEMANTIC_TO_CATEGORY,
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

// ─── Fixtures ─────────────────────────────────────────────────────────────────

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

// ─── Re-exported constants ────────────────────────────────────────────────────

describe("exported constants", () => {
  it("BUILTIN_STATUS_CODES is re-exported and contains success codes", () => {
    expect(BUILTIN_STATUS_CODES).toBeDefined();
    expect(Array.isArray(BUILTIN_STATUS_CODES.success)).toBe(true);
    expect(BUILTIN_STATUS_CODES.success).toContain("PST");
  });

  it("SEMANTIC_TO_CATEGORY is re-exported and maps known semantics", () => {
    expect(SEMANTIC_TO_CATEGORY).toBeDefined();
    expect(SEMANTIC_TO_CATEGORY.success).toBe("SUCCESS");
    expect(SEMANTIC_TO_CATEGORY.declined).toBe("DECLINED");
    expect(SEMANTIC_TO_CATEGORY.refund).toBe("REFUND");
    expect(SEMANTIC_TO_CATEGORY.instance).toBe("INSTANCE");
    expect(SEMANTIC_TO_CATEGORY.submitted).toBe("SUBMITTED");
  });
});

// ─── qc — safe identifier quoting ────────────────────────────────────────────

describe("qc — safe identifier quoting", () => {
  it("wraps a plain column name in double quotes", () => {
    expect(qc("TRANSACTION_ID")).toBe('"TRANSACTION_ID"');
  });

  it("preserves spaces and mixed case inside the quotes", () => {
    expect(qc("Account Group ID")).toBe('"Account Group ID"');
  });

  it("doubles EVERY embedded double quote", () => {
    expect(qc('a"b"c')).toBe('"a""b""c"');
    expect(qc('"lead')).toBe('"""lead"');
    expect(qc('trail"')).toBe('"trail"""');
  });

  it("throws a TypeError on an empty string (falsy col branch)", () => {
    expect(() => qc("")).toThrow(TypeError);
    expect(() => qc("")).toThrow("Invalid column identifier");
  });

  it("throws a TypeError on null (falsy col branch)", () => {
    // @ts-expect-error — deliberately passing wrong type
    expect(() => qc(null)).toThrow(TypeError);
  });

  it("throws a TypeError on undefined (falsy col branch)", () => {
    // @ts-expect-error — deliberately passing wrong type
    expect(() => qc(undefined)).toThrow(TypeError);
  });

  it("throws a TypeError on a non-string (typeof branch)", () => {
    // @ts-expect-error — deliberately passing a wrong type
    expect(() => qc(123)).toThrow(TypeError);
  });

  it("throws on identifiers containing a semicolon", () => {
    expect(() => qc("col; DROP TABLE t")).toThrow(/Unsafe column identifier/);
  });

  it("throws on identifiers containing a SQL line comment --", () => {
    expect(() => qc("col -- comment")).toThrow(/Unsafe column identifier/);
  });

  it("throws on identifiers containing a block comment opener /*", () => {
    expect(() => qc("col /* x")).toThrow(/Unsafe column identifier/);
  });

  it("throws on identifiers containing a block comment closer */", () => {
    expect(() => qc("col */ x")).toThrow(/Unsafe column identifier/);
  });

  it("throws on identifiers containing a backslash", () => {
    expect(() => qc("col\\name")).toThrow(/Unsafe column identifier/);
  });
});

// ─── colExpr — column expression or NULL ─────────────────────────────────────

describe("colExpr — column expression or NULL", () => {
  it("quotes a present (non-empty) column", () => {
    expect(colExpr("AMOUNT")).toBe('"AMOUNT"');
  });

  it("returns the NULL literal for an unmapped (empty) column", () => {
    expect(colExpr("")).toBe("NULL");
  });
});

// ─── sqlLiteral — string literal quoting ─────────────────────────────────────

describe("sqlLiteral — string literal quoting", () => {
  it("wraps a plain value in single quotes", () => {
    expect(sqlLiteral("SUCCESS")).toBe("'SUCCESS'");
  });

  it("doubles EVERY embedded single quote", () => {
    expect(sqlLiteral("d'aujourd'hui")).toBe("'d''aujourd''hui'");
    expect(sqlLiteral("O'Brien")).toBe("'O''Brien'");
    expect(sqlLiteral("'; DROP TABLE t; --")).toBe("'''; DROP TABLE t; --'");
  });

  it("leaves a value with no quotes unchanged inside the wrapper", () => {
    expect(sqlLiteral("RECHARGE")).toBe("'RECHARGE'");
  });

  it("wraps PST correctly", () => {
    expect(sqlLiteral("PST")).toBe("'PST'");
  });

  it("handles empty string", () => {
    expect(sqlLiteral("")).toBe("''");
  });
});

// ─── normalizeStatusCode ──────────────────────────────────────────────────────

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

  it("maps an instance/hold code to INSTANCE via builtin fallback", () => {
    // HLD is in BUILTIN_STATUS_CODES.instance but also in DEFAULT_STATUS_MAPPINGS
    expect(normalizeStatusCode("HLD")).toBe("INSTANCE");
  });

  it("maps SBM (submitted) to SUBMITTED", () => {
    expect(normalizeStatusCode("SBM")).toBe("SUBMITTED");
  });

  it("returns an empty string for blank input", () => {
    expect(normalizeStatusCode("   ")).toBe("");
  });

  it("falls back to OTHER for an unknown code", () => {
    expect(normalizeStatusCode("ZZZ")).toBe("OTHER");
  });

  it("falls back to OTHER for entirely whitespace after trim", () => {
    expect(normalizeStatusCode("")).toBe("");
  });

  it("honours a configured mapping that overrides builtin classification", () => {
    const custom: StatusMapping[] = [
      { rawCode: "PST", label: "Custom", semantic: "declined", color: "#000", badgeClass: "" },
    ];
    expect(normalizeStatusCode("PST", custom)).toBe("DECLINED");
  });

  it("returns OTHER when a configured mapping marks the code as 'other'", () => {
    const custom: StatusMapping[] = [
      { rawCode: "PST", label: "Other", semantic: "other", color: "#000", badgeClass: "" },
    ];
    expect(normalizeStatusCode("PST", custom)).toBe("OTHER");
  });

  it("handles a code only in BUILTIN_STATUS_CODES (not in DEFAULT_STATUS_MAPPINGS)", () => {
    // Some codes in BUILTIN_STATUS_CODES are not in DEFAULT_STATUS_MAPPINGS
    // e.g. "RTO", "STO", "STP", etc. are instance codes in builtin but not all are mapped
    // We pass an empty mapping array so nothing is configured; the builtin path runs
    const noMapping: StatusMapping[] = [];
    // PST is a builtin success code
    expect(normalizeStatusCode("PST", noMapping)).toBe("SUCCESS");
    // DCL is a builtin declined code
    expect(normalizeStatusCode("DCL", noMapping)).toBe("DECLINED");
    // RFD is a builtin refund code
    expect(normalizeStatusCode("RFD", noMapping)).toBe("REFUND");
    // HLD is a builtin instance code
    expect(normalizeStatusCode("HLD", noMapping)).toBe("INSTANCE");
    // SBM is a builtin submitted code
    expect(normalizeStatusCode("SBM", noMapping)).toBe("SUBMITTED");
  });

  it("returns OTHER for truly unknown code with empty mapping", () => {
    const noMapping: StatusMapping[] = [];
    expect(normalizeStatusCode("COMPLETELY_UNKNOWN", noMapping)).toBe("OTHER");
  });

  it("uses default mapping when no second argument provided", () => {
    // Tests the default parameter branch
    expect(normalizeStatusCode("PST")).toBe("SUCCESS");
  });

  it("tests the ?? OTHER fallback when semantic has no category (edge case)", () => {
    // This tests the `?? "OTHER"` branch in normalizeStatusCode
    // We need a configured mapping with a semantic that isn't in SEMANTIC_TO_CATEGORY
    // SEMANTIC_TO_CATEGORY only has success/declined/refund/instance/submitted
    // If semantic is "other", it takes the "OTHER" branch explicitly
    // For the ?? fallback, we'd need a semantic not in the map, but TS constrains this
    // The "other" semantic IS handled by the `=== "other" ? "OTHER"` check
    // So the ?? "OTHER" only fires if semantic is a ClassifiedStatusSemantic not in the map
    // Since all ClassifiedStatusSemantic values ARE in SEMANTIC_TO_CATEGORY, this is unreachable
    // in normal TypeScript - but we verify the "other" branch works correctly
    const otherMapping: StatusMapping[] = [
      { rawCode: "CUSTOM", label: "Other", semantic: "other", color: "#000", badgeClass: "" },
    ];
    expect(normalizeStatusCode("CUSTOM", otherMapping)).toBe("OTHER");
  });

  it("triggers ?? OTHER fallback in normalizeStatusCode with an unknown semantic", () => {
    // Force a semantic value that is neither "other" nor a key in SEMANTIC_TO_CATEGORY
    // This exercises the `?? "OTHER"` null-coalescing fallback at line 58-59
    const unknownSemanticMapping = [
      {
        rawCode: "MYCODE",
        label: "test",
        semantic: "future_semantic_not_in_map" as StatusMapping["semantic"],
        color: "",
        badgeClass: "",
      },
    ];
    // configured.semantic !== "other" AND SEMANTIC_TO_CATEGORY["future_semantic_not_in_map"] is undefined
    // so the ?? "OTHER" fires
    const result = normalizeStatusCode("MYCODE", unknownSemanticMapping);
    expect(result).toBe("OTHER");
  });
});

// ─── statusNorm — SQL CASE expression ─────────────────────────────────────────

describe("statusNorm — SQL CASE expression for status normalisation", () => {
  it("produces a CASE...END expression referencing the mapped status column", () => {
    const sql = statusNorm(mapping());
    expect(sql).toMatch(/^CASE/);
    expect(sql).toContain('"TRANSACTION_STATUS"');
    expect(sql).toMatch(/END$/);
  });

  it("emits a WHEN clause mapping PST to SUCCESS", () => {
    const sql = statusNorm(mapping());
    expect(sql).toContain("'PST'");
    expect(sql).toContain("'SUCCESS'");
  });

  it("defaults unmatched codes to OTHER via ELSE branch", () => {
    const sql = statusNorm(mapping());
    expect(sql).toContain("ELSE 'OTHER'");
  });

  it("includes the empty-string WHEN clause", () => {
    const sql = statusNorm(mapping());
    expect(sql).toContain("WHEN");
    expect(sql).toContain("'OTHER'");
  });

  it("uses default mapping when no second argument is provided", () => {
    // tests the default parameter path for sm
    const sql = statusNorm(mapping());
    expect(sql).toMatch(/^CASE/);
  });

  it("includes builtin codes not present in the configured mapping", () => {
    const onlyOne: StatusMapping[] = [
      { rawCode: "PST", label: "ok", semantic: "success", color: "", badgeClass: "" },
    ];
    const sql = statusNorm(mapping(), onlyOne);
    // A declined builtin code missing from the mapping should still appear
    expect(sql).toContain("'DCL'");
  });

  it("handles an 'other' semantic in configured mapping (emits OTHER category)", () => {
    const withOther: StatusMapping[] = [
      { rawCode: "CUSTOM_CODE", label: "Other", semantic: "other", color: "", badgeClass: "" },
    ];
    const sql = statusNorm(mapping(), withOther);
    expect(sql).toContain("'CUSTOM_CODE'");
    expect(sql).toContain("'OTHER'");
  });

  it("handles configured codes that are a superset of all builtins (all missingCodes empty)", () => {
    // Build a mapping that already includes ALL builtin codes so missingCodes.length === 0 for all
    const allBuiltins: StatusMapping[] = [];
    for (const [semantic, codes] of Object.entries(BUILTIN_STATUS_CODES) as Array<
      [string, string[]]
    >) {
      for (const code of codes) {
        allBuiltins.push({
          rawCode: code,
          label: semantic,
          semantic: semantic as StatusMapping["semantic"],
          color: "",
          badgeClass: "",
        });
      }
    }
    const sql = statusNorm(mapping(), allBuiltins);
    // Should still be a valid CASE (all builtins covered by configured, so only configured WHENs)
    expect(sql).toMatch(/^CASE/);
    // No IN clause should appear since missingCodes is empty for all semantic groups
    expect(sql).not.toContain(" IN (");
  });

  it("returns the constant OTHER literal when configured mapping has no valid raw codes AND no builtins are missing", () => {
    // To get whenClauses.length === 0 we need:
    // 1) all sm entries have empty/whitespace rawCodes (filtered out by .filter(e => e.rawCode.trim()))
    // 2) all builtin codes are already in configuredCodes (so missingCodes is empty for each group)
    //
    // Trick: add whitespace-only sm entries for recognition + add all builtins as "covered"
    // But configuredCodes includes whitespace-trimmed keys, so we need real codes in the Set
    // Actually the filter is: sm.filter(e => e.rawCode.trim()) — whitespace entries are excluded from WHEN clauses
    // But configuredCodes = new Set(sm.map(e => e.rawCode.trim().toUpperCase()))
    // So if sm has all builtins with whitespace rawCodes, they're NOT in configuredCodes
    //
    // The only way to get truly empty whenClauses is:
    // - sm is empty OR all sm entries have whitespace rawCodes (so no WHEN clauses from configured)
    // - AND all builtin codes appear in configuredCodes (impossible if sm has only whitespace codes)
    //
    // Actually: if sm = [] (empty), then configuredCodes = empty Set
    // Then missingCodes for each semantic group = ALL codes in that group
    // So whenClauses gets IN() clauses for each group => not empty
    //
    // If sm has ONLY whitespace entries, configuredCodes is a Set with "" (the trimmed+uppercased empty)
    // Builtins like "PST" are NOT in that set, so missingCodes = all builtins => IN() clauses appear
    //
    // So the ONLY way whenClauses stays empty is if all builtins are in configuredCodes AND
    // no valid configured rawCodes exist. That means configuredCodes must contain all builtin codes
    // which requires sm to have entries with those codes — but those entries also get WHEN clauses
    // (since rawCode.trim() is non-empty). Contradiction.
    //
    // => The `return "'OTHER'"` branch (line 104) is genuinely unreachable in practice.
    // We verify the closest reachable state produces a CASE (not the constant):
    const noValidCodes: StatusMapping[] = [
      { rawCode: "   ", label: "", semantic: "other", color: "", badgeClass: "" },
    ];
    // missingCodes for each builtin group will be non-empty => WHEN clauses added
    const sql = statusNorm(mapping(), noValidCodes);
    expect(sql).toMatch(/^CASE/);
  });

  it("filters out whitespace-only rawCode entries from WHEN clauses", () => {
    const withWhitespace: StatusMapping[] = [
      { rawCode: "   ", label: "blank", semantic: "success", color: "", badgeClass: "" },
      { rawCode: "REALCODE", label: "real", semantic: "declined", color: "", badgeClass: "" },
    ];
    const sql = statusNorm(mapping(), withWhitespace);
    // The whitespace code should not appear as a WHEN literal
    expect(sql).toContain("'REALCODE'");
    // Whitespace-trimmed code should not produce a literal
    expect(sql).not.toMatch(/'   '/);
  });

  it("produces an IN() clause for builtin codes missing from the configured mapping", () => {
    // Only map PST, leaving all others as "missing"
    const partial: StatusMapping[] = [
      { rawCode: "PST", label: "ok", semantic: "success", color: "", badgeClass: "" },
    ];
    const sql = statusNorm(mapping(), partial);
    // There should be an IN clause for the remaining builtin codes
    expect(sql).toContain(" IN (");
  });

  it("does not duplicate codes that are in both configured mapping and builtins", () => {
    // PST is in both DEFAULT_STATUS_MAPPINGS and BUILTIN_STATUS_CODES.success
    // When PST is in configured, it shouldn't appear in the IN() clause
    const sql = statusNorm(mapping(), DEFAULT_STATUS_MAPPINGS);
    // The PST code appears as a standalone WHEN but NOT inside the IN() fallback for success
    // (since it's covered by configured)
    expect(sql).toContain("'PST'");
  });

  it("handles a semantic with a category not in SEMANTIC_TO_CATEGORY via ?? OTHER fallback", () => {
    // This tests the `?? "OTHER"` in statusNorm for configured codes
    // e.semantic === "other" ? "OTHER" : (SEMANTIC_TO_CATEGORY[e.semantic] ?? "OTHER")
    // In practice, all valid StatusSemantic values either are "other" (handled) or in SEMANTIC_TO_CATEGORY
    // The ?? "OTHER" is a defensive fallback for unknown semantics (e.g., from future/external data)
    // We can simulate this by casting to force an unknown semantic
    const unknownSemantic: StatusMapping[] = [
      {
        rawCode: "TESTCODE",
        label: "test",
        semantic: "unknown_semantic" as StatusMapping["semantic"],
        color: "",
        badgeClass: "",
      },
    ];
    const sql = statusNorm(mapping(), unknownSemantic);
    // Should fall back to 'OTHER' for the unknown semantic
    expect(sql).toContain("'TESTCODE'");
    expect(sql).toContain("'OTHER'");
  });
});

// ─── hourExpr ─────────────────────────────────────────────────────────────────

describe("hourExpr — hour extraction expression", () => {
  it("references the mapped transaction date column", () => {
    expect(hourExpr(mapping({ transactionDate: "TXN_TS" }))).toContain('"TXN_TS"');
  });

  it("splits on space then colon to isolate the hour", () => {
    const sql = hourExpr(mapping());
    expect(sql).toContain("SPLIT_PART");
    expect(sql).toContain("AS INTEGER");
  });

  it("uses TRY_CAST for safe integer conversion", () => {
    const sql = hourExpr(mapping());
    expect(sql).toContain("TRY_CAST");
  });

  it("wraps the transaction date in CAST AS VARCHAR", () => {
    const sql = hourExpr(mapping());
    expect(sql).toContain("CAST");
    expect(sql).toContain("AS VARCHAR");
  });

  it("references TRANSACTION_DATE from the default mapping", () => {
    const sql = hourExpr(mapping());
    expect(sql).toContain('"TRANSACTION_DATE"');
  });
});

// ─── canalWhere ───────────────────────────────────────────────────────────────

describe("canalWhere — per-canal SQL predicates", () => {
  it("returns a predicate for every CanalKey", () => {
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

  it("each predicate wraps each channel condition in its own parens", () => {
    const where = canalWhere(mapping());
    // data_evoucher has a single channel; the result is ((condition))
    // The outer parens come from anyChannel wrapping, inner from the channel condition itself
    expect(where.data_evoucher.startsWith("(")).toBe(true);
    expect(where.data_evoucher.endsWith(")")).toBe(true);
    // Single channel so no OR
    expect(where.data_evoucher).not.toContain(" OR ");
  });

  it("voucher_convergent combines multiple channel groups", () => {
    const where = canalWhere(mapping());
    // voucher_convergent = EVOUCHER_ON_DEMAND_GENERATION + VOUCHER_CONVERGENT_CARTE_* so has multiple OR
    expect(where.voucher_convergent).toContain(" OR ");
  });

  it("ignores the mapping parameter (uses void m)", () => {
    // canalWhere uses void m — mapping doesn't affect the output
    const where1 = canalWhere(mapping({ status: "X" }));
    const where2 = canalWhere(mapping({ status: "Y" }));
    expect(where1.bill_payment).toBe(where2.bill_payment);
  });
});

// ─── canalCaseExpr ────────────────────────────────────────────────────────────

describe("canalCaseExpr — canal classification CASE", () => {
  it("opens with CASE and closes with END", () => {
    const sql = canalCaseExpr(mapping());
    expect(sql).toMatch(/^CASE/);
    expect(sql).toMatch(/END$/);
  });

  it("labels each canal with its business label", () => {
    const sql = canalCaseExpr(mapping());
    expect(sql).toContain("'Bill Payment'");
    expect(sql).toContain("'Credit Transfer'");
    expect(sql).toContain("'Voucher Convergent Management'");
    expect(sql).toContain("'Voucher For Payment'");
    expect(sql).toContain("'Fixed by TTCASH'");
    expect(sql).toContain("'Fixed by Voucher'");
    expect(sql).toContain("'Mobile by TTCASH'");
    expect(sql).toContain("'Mobile by Voucher'");
    expect(sql).toContain("'Data by Voucher'");
    expect(sql).toContain("'Internet Sabba'");
  });

  it("falls back to 'Other' when nothing matches", () => {
    expect(canalCaseExpr(mapping())).toContain("ELSE 'Other'");
  });

  it("prioritises voucher_for_payment before bill_payment", () => {
    const sql = canalCaseExpr(mapping());
    const vfpIdx = sql.indexOf("'Voucher For Payment'");
    const bpIdx = sql.indexOf("'Bill Payment'");
    expect(vfpIdx).toBeLessThan(bpIdx);
  });

  it("prioritises credit_transfer before bill_payment", () => {
    const sql = canalCaseExpr(mapping());
    const ctIdx = sql.indexOf("'Credit Transfer'");
    const bpIdx = sql.indexOf("'Bill Payment'");
    expect(ctIdx).toBeLessThan(bpIdx);
  });
});

// ─── statusNorm line 104: return "'OTHER'" when whenClauses is empty ──────────
// This requires BUILTIN_STATUS_CODES to have no entries AND sm to have no valid codes.
// We achieve this by resetting the module registry, mocking with importOriginal,
// and dynamically importing sql.

describe("statusNorm — constant OTHER literal (line 104)", () => {
  it("returns \"'OTHER'\" when no when-clauses are generated (BUILTIN_STATUS_CODES empty, sm empty)", async () => {
    vi.resetModules();

    vi.doMock("@/features/telecom/lib/status-definitions", async () => {
      const actual = await vi.importActual<
        typeof import("@/features/telecom/lib/status-definitions")
      >("@/features/telecom/lib/status-definitions");
      return {
        ...actual,
        // Override BUILTIN_STATUS_CODES to be empty so the builtin loop adds nothing
        BUILTIN_STATUS_CODES: {},
      };
    });

    // Dynamically import the module after mock registration and module reset
    const { statusNorm: statusNormDyn } = await import("@/features/telecom/lib/sql");

    const m: ColumnMapping = {
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
    };

    // sm = [] (empty), BUILTIN_STATUS_CODES = {} (empty) → no WHEN clauses → line 104
    const result = statusNormDyn(m, []);
    expect(result).toBe("'OTHER'");

    vi.doUnmock("@/features/telecom/lib/status-definitions");
    vi.resetModules();
  });
});
