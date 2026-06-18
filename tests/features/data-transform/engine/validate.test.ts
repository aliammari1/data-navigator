import { describe, expect, it } from "vitest";
import {
  validateFragment,
  validateSql,
} from "@/features/data-transform/engine/validate";

describe("validateSql", () => {
  it("treats empty / whitespace input as valid", () => {
    expect(validateSql("")).toEqual({ ok: true });
    expect(validateSql("   \n  ")).toEqual({ ok: true });
  });

  it("accepts a syntactically valid SELECT", () => {
    const res = validateSql("SELECT a, b FROM t WHERE a > 1");
    expect(res.ok).toBe(true);
    expect(res.error).toBeUndefined();
  });

  it("accepts a WITH/CTE statement", () => {
    const res = validateSql("WITH s AS (SELECT * FROM t) SELECT * FROM s");
    expect(res.ok).toBe(true);
  });

  it("flags DuckDB-only PIVOT as best-effort but still ok", () => {
    const res = validateSql("SELECT * FROM (PIVOT t ON month USING SUM(amt))");
    expect(res).toEqual({ ok: true, bestEffort: true });
  });

  it("flags QUALIFY as best-effort", () => {
    const res = validateSql("SELECT * FROM t QUALIFY row_number() OVER () = 1");
    expect(res.bestEffort).toBe(true);
    expect(res.ok).toBe(true);
  });

  it("flags SUMMARIZE as best-effort", () => {
    expect(validateSql("SUMMARIZE t").bestEffort).toBe(true);
  });

  it("reports a single-line error for genuinely invalid SQL", () => {
    const res = validateSql("SELECT FROM WHERE");
    expect(res.ok).toBe(false);
    expect(typeof res.error).toBe("string");
    expect(res.error).not.toContain("\n");
  });

  it("does not treat best-effort fragments as errors even if otherwise unparseable", () => {
    // UNPIVOT is DuckDB-only and would not parse in PG; must short-circuit to ok.
    const res = validateSql("SELECT * FROM (UNPIVOT t ON a, b)");
    expect(res.ok).toBe(true);
    expect(res.bestEffort).toBe(true);
  });
});

describe("validateFragment", () => {
  it("treats an empty fragment as valid", () => {
    expect(validateFragment("", "where")).toEqual({ ok: true });
    expect(validateFragment("  ", "projection")).toEqual({ ok: true });
  });

  it("validates a WHERE fragment by wrapping it in a SELECT", () => {
    expect(validateFragment("amount > 100", "where").ok).toBe(true);
  });

  it("validates a projection fragment", () => {
    expect(validateFragment("a, b, c", "projection").ok).toBe(true);
  });

  it("validates a groupby fragment", () => {
    expect(validateFragment("region", "groupby").ok).toBe(true);
  });

  it("returns an error for an invalid WHERE fragment", () => {
    const res = validateFragment("amount >", "where");
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
  });

  it("flags a DuckDB-only fragment as best-effort", () => {
    const res = validateFragment("col QUALIFY x", "where");
    expect(res).toEqual({ ok: true, bestEffort: true });
  });

  it("keeps error messages on a single line and bounded", () => {
    const res = validateFragment("SELECT SELECT SELECT", "where");
    expect(res.ok).toBe(false);
    expect(res.error).not.toMatch(/\s{2,}/);
    expect((res.error ?? "").length).toBeLessThanOrEqual(200);
  });
});
