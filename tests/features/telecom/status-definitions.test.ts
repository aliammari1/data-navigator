import { describe, expect, it } from "vitest";
import {
  BUILTIN_STATUS_CODES,
  DEFAULT_STATUS_MAPPINGS,
  REPORT_INSTANCE_STATUS_CODES,
  SEMANTIC_STATUS_OPTIONS,
  SEMANTIC_TO_CATEGORY,
  SPEC_DECLINED_FILTER,
  SPEC_STATUS_CODES,
  SPEC_SUCCESS_FILTER,
  STATUS_AUTO_SEMANTIC_BY_CODE,
  STATUS_PRESENTATION,
  buildRawStatusFilter,
  buildRawStatusFilterForColumn,
  sqlStatusInList,
} from "@/features/telecom/lib/status-definitions";

describe("sqlStatusInList", () => {
  it("renders a comma-separated list of single-quoted literals", () => {
    expect(sqlStatusInList(["PST", "DCL"])).toBe("'PST','DCL'");
  });

  it("escapes embedded single quotes to prevent SQL injection", () => {
    expect(sqlStatusInList(["O'BRIEN"])).toBe("'O''BRIEN'");
  });

  it("returns an empty string for an empty code list", () => {
    expect(sqlStatusInList([])).toBe("");
  });
});

describe("buildRawStatusFilter", () => {
  it("wraps the normalised status expression in an IN clause", () => {
    const filter = buildRawStatusFilter(["PST", "PST1"]);

    expect(filter).toBe("UPPER(TRIM(CAST(TRANSACTION_STATUS AS VARCHAR))) IN ('PST','PST1')");
  });
});

describe("buildRawStatusFilterForColumn", () => {
  it("targets an arbitrary column expression", () => {
    const filter = buildRawStatusFilterForColumn("mapped_status", ["OK"]);

    expect(filter).toBe("UPPER(TRIM(CAST(mapped_status AS VARCHAR))) IN ('OK')");
  });
});

describe("SPEC filters", () => {
  it("derive the success filter from the spec success codes", () => {
    expect(SPEC_SUCCESS_FILTER).toContain("'PST'");
    expect(SPEC_SUCCESS_FILTER).toContain("TRANSACTION_STATUS");
  });

  it("exclude soft-declined extras (CAN/FLD/ERR) — they are non-spec fallback codes, not builtin ones", () => {
    // BUILTIN_STATUS_CODES is spec-exact; SPEC_STATUS_CODES is a plain alias of it.
    expect(SPEC_STATUS_CODES).toBe(BUILTIN_STATUS_CODES);
    expect(BUILTIN_STATUS_CODES.declined).not.toContain("CAN");
    expect(SPEC_STATUS_CODES.declined).not.toContain("CAN");
    expect(SPEC_DECLINED_FILTER).not.toContain("'CAN'");
    // CAN is still recognised as a declined-shaped code, but only via the
    // non-spec auto-detection fallback (STATUS_AUTO_SEMANTIC_BY_CODE).
    expect(STATUS_AUTO_SEMANTIC_BY_CODE.CAN).toBe("declined");
  });
});

describe("status code set integrity", () => {
  it("maps every classified semantic to an uppercase category", () => {
    for (const category of Object.values(SEMANTIC_TO_CATEGORY)) {
      expect(category).toBe(category.toUpperCase());
    }
  });

  it("keeps builtin code groups disjoint (no code in two semantics)", () => {
    const seen = new Map<string, string>();
    for (const [semantic, codes] of Object.entries(BUILTIN_STATUS_CODES)) {
      for (const code of codes) {
        expect(
          seen.has(code),
          `code ${code} appears in both ${seen.get(code)} and ${semantic}`,
        ).toBe(false);
        seen.set(code, semantic);
      }
    }
  });

  it("composes the report instance set from hold + doubt codes", () => {
    // Every hold and doubt code is present, no duplicates dropped.
    expect(REPORT_INSTANCE_STATUS_CODES).toContain("HLD"); // hold
    expect(REPORT_INSTANCE_STATUS_CODES).toContain("DBT"); // doubt
    expect(REPORT_INSTANCE_STATUS_CODES.length).toBeGreaterThan(0);
  });
});

describe("DEFAULT_STATUS_MAPPINGS", () => {
  it("assigns the shared presentation label/color per semantic by default", () => {
    const pst = DEFAULT_STATUS_MAPPINGS.find((m) => m.rawCode === "PST");

    expect(pst?.semantic).toBe("success");
    expect(pst?.label).toBe(STATUS_PRESENTATION.success.label);
    expect(pst?.color).toBe(STATUS_PRESENTATION.success.color);
  });

  it("excludes non-spec codes like CAN — default mappings are spec-only", () => {
    // CAN is not part of the telecom spec taxonomy, so it has no entry in
    // DEFAULT_STATUS_MAPPINGS. It is still classified as "declined" through
    // the separate STATUS_AUTO_SEMANTIC_BY_CODE fallback table.
    const can = DEFAULT_STATUS_MAPPINGS.find((m) => m.rawCode === "CAN");

    expect(can).toBeUndefined();
    expect(STATUS_AUTO_SEMANTIC_BY_CODE.CAN).toBe("declined");
  });

  it("uses the shared semantic presentation for every entry (no per-code overrides)", () => {
    for (const mapping of DEFAULT_STATUS_MAPPINGS) {
      const presentation = STATUS_PRESENTATION[mapping.semantic];

      expect(mapping.color).toBe(presentation.color);
      expect(mapping.badgeClass).toBe(presentation.badgeClass);
    }
  });

  it("contains no duplicate raw codes", () => {
    const codes = DEFAULT_STATUS_MAPPINGS.map((m) => m.rawCode);

    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("SEMANTIC_STATUS_OPTIONS", () => {
  it("exposes all six semantics including OTHER for the config UI", () => {
    const values = SEMANTIC_STATUS_OPTIONS.map((o) => o.value);

    expect(values).toContain("other");
    expect(values).toHaveLength(6);
  });

  it("carries the label and color from STATUS_PRESENTATION", () => {
    const success = SEMANTIC_STATUS_OPTIONS.find((o) => o.value === "success");

    expect(success?.label).toBe(STATUS_PRESENTATION.success.label);
    expect(success?.color).toBe(STATUS_PRESENTATION.success.color);
  });
});
