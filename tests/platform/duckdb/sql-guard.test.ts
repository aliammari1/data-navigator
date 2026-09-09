import { describe, expect, it } from "vitest";
import { assertReadOnlySql, sanitizeSql } from "@/platform/duckdb/sql-guard";

describe("sanitizeSql", () => {
  it("strips markdown sql fences", () => {
    expect(sanitizeSql("```sql\nSELECT 1\n```")).toBe("SELECT 1");
  });

  it("strips bare fences", () => {
    expect(sanitizeSql("```\nSELECT a FROM t\n```")).toBe("SELECT a FROM t");
  });

  it("strips leading line comments", () => {
    expect(sanitizeSql("-- generated\nSELECT 1")).toBe("SELECT 1");
  });

  it("strips leading block comments", () => {
    expect(sanitizeSql("/* note */ SELECT 1")).toBe("SELECT 1");
  });

  it("strips trailing semicolons and invisible chars", () => {
    expect(sanitizeSql("SELECT 1;;;")).toBe("SELECT 1");
    expect(sanitizeSql("SEL\u200BECT 1")).toBe("SELECT 1");
  });
});

describe("assertReadOnlySql", () => {
  it("accepts plain SELECT and WITH", () => {
    expect(assertReadOnlySql("SELECT a FROM t")).toBe("SELECT a FROM t");
    expect(assertReadOnlySql("with x as (select 1) select * from x")).toBe(
      "with x as (select 1) select * from x",
    );
  });

  it("accepts fenced LLM output", () => {
    expect(assertReadOnlySql("```sql\nSELECT 1\n```")).toBe("SELECT 1");
  });

  it("rejects non-SELECT statements", () => {
    expect(() => assertReadOnlySql("DELETE FROM t")).toThrow(/only SELECT\/WITH/);
    expect(() => assertReadOnlySql("")).toThrow(/only SELECT\/WITH/);
  });

  it("rejects forbidden keywords even inside SELECT", () => {
    expect(() => assertReadOnlySql("SELECT * FROM t; DROP TABLE t")).toThrow();
    expect(() => assertReadOnlySql("SELECT load('x')")).toThrow(/non-read-only/);
  });

  it("currently allows file-IO table functions (no file-IO rule in this guard)", () => {
    // Unlike electron/sql-guard.ts, this guard has no FILE_IO_FUNCTION rule —
    // callers needing that must layer it on top. Pinned so any change is deliberate.
    expect(assertReadOnlySql("SELECT * FROM read_csv('/etc/passwd')")).toContain("read_csv");
  });

  it("rejects stacked statements", () => {
    expect(() => assertReadOnlySql("SELECT 1; SELECT 2")).toThrow(/multiple statements/);
  });

  it("rejects semicolons hidden in string literals conservatively", () => {
    // The guard is intentionally strict: any ";" after sanitize fails.
    expect(() => assertReadOnlySql("SELECT 'a;b'")).toThrow(/multiple statements/);
  });
});
