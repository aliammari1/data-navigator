import { describe, it, expect } from "vitest";
import { assertSafeFilterFragment } from "../../electron/sql-guard";

describe("assertSafeFilterFragment", () => {
  // ── Happy-path: safe fragments return unchanged ──────────────────────────

  it("returns the original string when the fragment is safe", () => {
    const safe = "status = 'ACTIVE'";
    expect(assertSafeFilterFragment(safe)).toBe(safe);
  });

  it("returns an empty string fragment without throwing", () => {
    expect(assertSafeFilterFragment("")).toBe("");
  });

  it("returns a simple numeric comparison without throwing", () => {
    const fragment = "amount > 100 AND amount < 9999";
    expect(assertSafeFilterFragment(fragment)).toBe(fragment);
  });

  it("returns a multi-condition LIKE fragment without throwing", () => {
    const fragment = "name LIKE '%foo%' AND category = 'BAR'";
    expect(assertSafeFilterFragment(fragment)).toBe(fragment);
  });

  it("returns a fragment with IN list without throwing", () => {
    const fragment = "status IN ('ACTIVE', 'PENDING')";
    expect(assertSafeFilterFragment(fragment)).toBe(fragment);
  });

  it("returns a fragment with IS NULL / IS NOT NULL without throwing", () => {
    expect(assertSafeFilterFragment("deleted_at IS NULL")).toBe(
      "deleted_at IS NULL"
    );
    expect(assertSafeFilterFragment("deleted_at IS NOT NULL")).toBe(
      "deleted_at IS NOT NULL"
    );
  });

  // ── Statement separator (;) ──────────────────────────────────────────────

  it("throws on a bare semicolon injection", () => {
    expect(() => assertSafeFilterFragment("1=1; DROP TABLE users")).toThrow(
      "Unsafe filter: statement separator (;) is not allowed."
    );
  });

  it("throws on a semicolon used to chain ATTACH", () => {
    expect(() =>
      assertSafeFilterFragment("1=1; ATTACH '/tmp/evil.db' AS evil")
    ).toThrow("statement separator");
  });

  it("does NOT throw when a semicolon appears only inside a string literal", () => {
    // The value 'a; drop' is a legitimate filter value, not injection.
    const fragment = "label = 'a; drop'";
    expect(assertSafeFilterFragment(fragment)).toBe(fragment);
  });

  it("throws when a semicolon appears after a string literal (outside it)", () => {
    expect(() =>
      assertSafeFilterFragment("label = 'safe'; DROP TABLE users")
    ).toThrow("statement separator");
  });

  // ── SQL comments ──────────────────────────────────────────────────────────

  it("throws on double-dash comment", () => {
    expect(() =>
      assertSafeFilterFragment("1=1 -- bypass everything")
    ).toThrow("Unsafe filter: SQL comments are not allowed.");
  });

  it("throws on block comment open (/*)", () => {
    expect(() => assertSafeFilterFragment("1=1 /* comment")).toThrow(
      "SQL comments are not allowed"
    );
  });

  it("throws on block comment close (*/) used to end an injected open", () => {
    expect(() => assertSafeFilterFragment("*/ OR 1=1")).toThrow(
      "SQL comments are not allowed"
    );
  });

  it("does NOT throw when -- appears only inside a string literal", () => {
    const fragment = "note = 'a -- not a comment'";
    expect(assertSafeFilterFragment(fragment)).toBe(fragment);
  });

  it("does NOT throw when /* appears only inside a string literal", () => {
    const fragment = "note = 'value /* still ok */'";
    expect(assertSafeFilterFragment(fragment)).toBe(fragment);
  });

  // ── Statement keywords ────────────────────────────────────────────────────

  const KEYWORDS = [
    "CREATE",
    "DROP",
    "ALTER",
    "INSERT",
    "UPDATE",
    "DELETE",
    "COPY",
    "EXPORT",
    "IMPORT",
    "ATTACH",
    "DETACH",
    "INSTALL",
    "LOAD",
    "CALL",
    "PRAGMA",
    "SET",
  ] as const;

  for (const kw of KEYWORDS) {
    it(`throws on keyword ${kw} (uppercase)`, () => {
      expect(() =>
        assertSafeFilterFragment(`1=1 AND ${kw} TABLE foo`)
      ).toThrow("Unsafe filter: statement keywords are not allowed.");
    });

    it(`throws on keyword ${kw} (lowercase)`, () => {
      expect(() =>
        assertSafeFilterFragment(`1=1 AND ${kw.toLowerCase()} TABLE foo`)
      ).toThrow("statement keywords are not allowed");
    });
  }

  it("does NOT throw when a keyword appears only inside a string literal", () => {
    // 'UPDATE_PENDING' is a legitimate status value.
    const fragment = "status = 'UPDATE_PENDING'";
    expect(assertSafeFilterFragment(fragment)).toBe(fragment);
  });

  it("does NOT throw when DROP appears only inside a string literal", () => {
    const fragment = "note = 'a DROP b'";
    expect(assertSafeFilterFragment(fragment)).toBe(fragment);
  });

  it("does NOT throw when SET appears only inside a string literal", () => {
    const fragment = "label = 'SET_VALUE'";
    expect(assertSafeFilterFragment(fragment)).toBe(fragment);
  });

  it("throws on keyword with mixed case (case-insensitive check)", () => {
    expect(() => assertSafeFilterFragment("dRoP TABLE foo")).toThrow(
      "statement keywords are not allowed"
    );
  });

  // ── File / IO functions ───────────────────────────────────────────────────

  const FILE_IO_CASES: Array<[string, string]> = [
    ["read_csv", "read_csv('/etc/passwd')"],
    ["read_csv_auto", "read_csv_auto('/etc/passwd')"],
    ["read_parquet", "read_parquet('/tmp/data.parquet')"],
    ["parquet_metadata", "parquet_metadata('/tmp/data.parquet')"],
    ["parquet_schema", "parquet_schema('/tmp/data.parquet')"],
    ["read_json", "read_json('/tmp/data.json')"],
    ["read_json_auto", "read_json_auto('/tmp/data.json')"],
    ["read_json_objects", "read_json_objects('/tmp/data.json')"],
    ["read_ndjson", "read_ndjson('/tmp/data.ndjson')"],
    ["read_ndjson_auto", "read_ndjson_auto('/tmp/data.ndjson')"],
    ["read_text", "read_text('/etc/hostname')"],
    ["read_blob", "read_blob('/etc/hostname')"],
    ["sniff_csv", "sniff_csv('/tmp/data.csv')"],
    ["glob", "glob('/tmp/*.csv')"],
    ["getenv", "getenv('HOME')"],
  ];

  for (const [name, expr] of FILE_IO_CASES) {
    it(`throws on file/IO function: ${name}`, () => {
      expect(() =>
        assertSafeFilterFragment(`x IN (SELECT * FROM ${expr})`)
      ).toThrow("Unsafe filter: file/IO functions are not allowed.");
    });
  }

  it("does NOT throw when read_csv appears only inside a string literal", () => {
    const fragment = "note = 'see read_csv() docs'";
    expect(assertSafeFilterFragment(fragment)).toBe(fragment);
  });

  // ── Double-quoted / escaped single-quote inside literals ──────────────────

  it("handles '' (escaped single quote inside string literal) correctly", () => {
    // 'it''s fine' is a SQL single-quoted string with an escaped apostrophe.
    const fragment = "label = 'it''s fine'";
    expect(assertSafeFilterFragment(fragment)).toBe(fragment);
  });

  it("throws when injection follows a string with escaped quote", () => {
    expect(() =>
      assertSafeFilterFragment("label = 'it''s ok'; DROP TABLE foo")
    ).toThrow("statement separator");
  });

  it("strips multiple adjacent string literals before inspection", () => {
    // Both 'a' and 'b' should be stripped; only the AND between them is code.
    const fragment = "col1 = 'a' AND col2 = 'b'";
    expect(assertSafeFilterFragment(fragment)).toBe(fragment);
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  it("throws on read_csv with uppercase R (case-insensitive match)", () => {
    expect(() =>
      assertSafeFilterFragment("x IN (SELECT * FROM READ_CSV('/etc/passwd'))")
    ).toThrow("file/IO functions are not allowed");
  });

  it("throws on parquet_ with a custom suffix (wildcard \\w+)", () => {
    expect(() =>
      assertSafeFilterFragment("x IN (SELECT * FROM parquet_scan('/data.parquet'))")
    ).toThrow("file/IO functions are not allowed");
  });

  it("throws on a file/IO function with whitespace before the opening paren", () => {
    // The guard's regex allows whitespace between the function name and `(`
    // (`\s*\(`) specifically so a space can't be used to dodge detection.
    expect(() =>
      assertSafeFilterFragment("x IN (SELECT * FROM read_csv ('/etc/passwd'))")
    ).toThrow("file/IO functions are not allowed");
  });
});
