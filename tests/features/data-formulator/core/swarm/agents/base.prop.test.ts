import { fc, test } from "@fast-check/vitest";
import { describe, expect, vi } from "vitest";

// base.ts pulls in the DuckDB boundary via runChartArtifact/runTableArtifact.
// Mock it so importing the (pure) SQL guardrails never touches a real database
// or worker — mirrors tests/features/.../agents/base.test.ts.
vi.mock("@/platform/duckdb/duckdb", () => ({
  runReadOnlyQuery: vi.fn(),
}));

import { assertReadOnlySql, sanitizeSql } from "@/features/data-formulator/core/swarm/agents/base";

/**
 * Property-based fuzzing of the read-only SQL guardrail.
 *
 * `assertReadOnlySql` is the single gate that lets a 1.5B model's generated SQL
 * touch the dataset. Its safety contract:
 *   1. it MUST block any statement carrying a write/side-effecting keyword,
 *   2. it MUST block multi-statement (`;`) smuggling,
 *   3. it MUST block anything that does not begin SELECT/WITH,
 *   4. it MUST accept a well-formed single read-only SELECT/WITH regardless of
 *      identifier names, whitespace, comment wrapping, fences, or case.
 *
 * The example-based suite (base.test.ts) locks a handful of concrete cases;
 * these properties fuzz the input space so a regression that, say, only escapes
 * the first occurrence of a keyword or mishandles casing is surfaced.
 */

// Keywords the guard treats as non-read-only (mirrors FORBIDDEN_SQL in source).
const FORBIDDEN_KEYWORDS = [
  "insert",
  "update",
  "delete",
  "drop",
  "alter",
  "create",
  "attach",
  "copy",
  "pragma",
  "truncate",
  "replace",
  "grant",
  "revoke",
  "vacuum",
  "export",
  "install",
  "load",
] as const;

/** Arbitrary mix of upper/lower casing of a fixed word (DROP, dRoP, ...). */
function casedWord(word: string): fc.Arbitrary<string> {
  return fc.array(fc.boolean(), { minLength: word.length, maxLength: word.length }).map((flags) =>
    word
      .split("")
      .map((ch, i) => (flags[i] ? ch.toUpperCase() : ch.toLowerCase()))
      .join(""),
  );
}

/** A bare, SQL-safe identifier (column/table/alias). */
const identArb = fc
  .stringMatching(/^[A-Za-z_][A-Za-z0-9_]*$/)
  .filter((s) => s.length > 0 && s.length <= 24);

/** Runs of whitespace the model might inject around tokens. */
const wsArb = fc
  .array(fc.constantFrom(" ", "\t", "\n", "\r"), { minLength: 1, maxLength: 4 })
  .map((parts) => parts.join(""));

describe("assertReadOnlySql — safety properties (fuzzed)", () => {
  test.prop([fc.constantFrom(...FORBIDDEN_KEYWORDS), identArb, identArb])(
    "NEVER accepts a statement that begins with a write keyword (any case)",
    (keyword, table, col) => {
      // Build a syntactically plausible mutating statement for each keyword so
      // the leading-verb gate AND the forbidden-keyword gate both have to hold.
      const stmt = `${keyword.toUpperCase()} ${table} ${col}`;
      expect(() => assertReadOnlySql(stmt)).toThrow();
    },
  );

  test.prop([casedWord("drop"), identArb])(
    "NEVER accepts a write keyword regardless of letter casing",
    (drop, table) => {
      expect(() => assertReadOnlySql(`${drop} TABLE ${table}`)).toThrow();
    },
  );

  test.prop([identArb, fc.constantFrom(...FORBIDDEN_KEYWORDS), identArb])(
    "NEVER accepts a forbidden keyword smuggled INSIDE a leading SELECT/WITH",
    (sel, keyword, table) => {
      // e.g. `WITH x AS (DELETE FROM t RETURNING 1) SELECT * FROM x`
      const stmt = `WITH ${sel} AS (${keyword.toUpperCase()} FROM ${table} RETURNING 1) SELECT * FROM ${sel}`;
      expect(() => assertReadOnlySql(stmt)).toThrow(/non-read-only keyword/i);
    },
  );

  test.prop([identArb, identArb])(
    "NEVER accepts multiple statements separated by a semicolon",
    (a, b) => {
      // A clean SELECT followed by a second SELECT must still be rejected —
      // a single trailing `;` is fine (sanitizeSql strips it) but an interior
      // `;` means multi-statement.
      const stmt = `SELECT ${a} FROM ${b} ; SELECT 2`;
      expect(() => assertReadOnlySql(stmt)).toThrow(/multiple statements/i);
    },
  );

  test.prop([fc.string()])(
    "is a TOTAL function over arbitrary text: it either returns a SELECT/WITH string or throws (never returns unsafe output)",
    (raw) => {
      let returned: string | undefined;
      try {
        returned = assertReadOnlySql(raw);
      } catch {
        // Throwing is an allowed outcome for arbitrary garbage.
        return;
      }
      // If it did NOT throw, the returned statement must itself be a single
      // read-only SELECT/WITH with no interior semicolon and no write keyword.
      expect(returned).toBeDefined();
      const s = returned as string;
      expect(/^\s*(?:select|with)\b/i.test(s)).toBe(true);
      expect(s.includes(";")).toBe(false);
      const writeRe =
        /\b(?:insert|update|delete|drop|alter|create|attach|copy|pragma|truncate|replace|grant|revoke|vacuum|export|install|load)\b/i;
      expect(writeRe.test(s)).toBe(false);
    },
  );
});

describe("assertReadOnlySql — well-formed SELECTs are accepted (fuzzed)", () => {
  test.prop([identArb, identArb, wsArb, wsArb])(
    "accepts a plain SELECT over arbitrary identifiers / whitespace / casing",
    (col, table, ws1, ws2) => {
      const stmt = `select${ws1}${col}${ws2}from ${table}`;
      const out = assertReadOnlySql(stmt);
      expect(/^\s*select/i.test(out)).toBe(true);
    },
  );

  test.prop([identArb, identArb])(
    "accepts a leading WITH / CTE over arbitrary identifiers",
    (cte, table) => {
      const stmt = `WITH ${cte} AS (SELECT * FROM ${table}) SELECT * FROM ${cte}`;
      expect(assertReadOnlySql(stmt)).toContain("SELECT");
    },
  );

  test.prop([identArb, identArb])(
    "accepts a SELECT wrapped in a markdown fence / leading comment / trailing semicolon (model wrapping is stripped, not rejected)",
    (col, table) => {
      const fenced = "```sql\n-- pick everything\nSELECT " + col + " FROM " + table + ";\n```";
      const out = assertReadOnlySql(fenced);
      // sanitizeSql must reduce it to the bare statement.
      expect(out).toBe(sanitizeSql(fenced));
      expect(/^select/i.test(out)).toBe(true);
      expect(out.includes("```")).toBe(false);
    },
  );
});
