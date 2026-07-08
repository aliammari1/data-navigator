import { fc, test } from "@fast-check/vitest";
import { Parser } from "node-sql-parser";
import { describe, expect, vi } from "vitest";
import type { ColMeta } from "@/core/stores/data-store";

// translateNLQ itself is synchronous + pure, but the module imports the on-device
// LLM boundary (only used by translateNLQWithLLM). Mock it so the import is inert.
vi.mock("@/platform/ai/llm-engine", () => ({
  isLLMReady: () => false,
  generateText: async () => "",
}));

import { translateNLQ } from "@/platform/ai/nlq";

/**
 * Property-based fuzzing of the offline NL→SQL translator.
 *
 * Contract under test (for NATURAL-LANGUAGE questions): every SQL the pattern
 * translator emits must
 *   1. PARSE under a DuckDB-adjacent dialect (postgresql/mysql) — node-sql-parser
 *      has no DuckDB dialect, so we accept either, mirroring evals/nlq.eval.ts.
 *   2. be READ-ONLY: begin SELECT/WITH and carry no mutating keyword.
 *   3. be a TOTAL function: never throw for any question string.
 *
 * REAL FINDING (documented, source NOT modified):
 *   translateNLQ has an explicit raw-SQL passthrough — when the question itself
 *   STARTS WITH `SELECT|WITH|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER`, it echoes
 *   the question back as SQL (only appending LIMIT). So `translateNLQ("DROP
 *   TABLE x")` returns a DROP. This is intentional ("Executed as raw SQL"): the
 *   real read-only enforcement lives DOWNSTREAM at the DuckDB boundary
 *   (assertReadOnlySql) and in use-nlq-translator's looksReadOnly guard, not in
 *   translateNLQ. The read-only property below therefore holds for natural-
 *   language questions; a separate property pins the actual passthrough contract
 *   so the behavior is locked rather than assumed safe.
 */

const COLUMNS: ColMeta[] = [
  { name: "channel", type: "string", nullCount: 0, distinctCount: 5, sample: [] },
  { name: "region", type: "string", nullCount: 0, distinctCount: 4, sample: [] },
  { name: "amount", type: "number", nullCount: 0, distinctCount: 99, sample: [] },
  { name: "revenue", type: "number", nullCount: 0, distinctCount: 88, sample: [] },
  { name: "txn_date", type: "date", nullCount: 0, distinctCount: 30, sample: [] },
];

const CTX = { tableName: "tx_view", columns: COLUMNS };

const PARSER = new Parser();

/** Parses under at least one DuckDB-adjacent dialect. Mirrors the eval. */
function parsesAsSql(sql: string): boolean {
  for (const database of ["postgresql", "mysql"] as const) {
    try {
      PARSER.astify(sql, { database });
      return true;
    } catch {
      // try next dialect
    }
  }
  return false;
}

const MUTATING =
  /\b(?:insert|update|delete|drop|alter|create|attach|copy|pragma|call|truncate|grant|revoke|merge|replace|set|begin|commit|rollback|vacuum|install|load)\b/i;

/** Read-only check that ignores keywords inside quoted identifiers/literals. */
function isReadOnlySql(sql: string): boolean {
  const body = sql.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");
  return /^\s*(?:select|with)\b/i.test(body) && !MUTATING.test(body);
}

// Vocabulary that exercises the pattern registry without colliding with the raw-
// SQL passthrough (no leading SELECT/WITH/INSERT/...). Mixed-case + free text.
const PHRASES = [
  "how many rows",
  "count records",
  "top 5 channels by revenue",
  "average amount",
  "sum of revenue by region",
  "distribution of channel",
  "breakdown by region",
  "trend over time",
  "trend of revenue by month",
  "correlation between amount and revenue",
  "show missing values",
  "find duplicate rows",
  "outliers and anomalies",
  "describe statistics",
  "show all rows",
  "list everything",
  "min of amount",
  "maximum revenue",
  "filter where channel = USSD",
  "conditional breakdown of region where amount > 100",
  "summary overview",
  "what is the gibberish here",
  "tell me something",
];

/** A free-form natural-language question that never begins with a raw-SQL verb. */
const questionArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...PHRASES), { minLength: 1, maxLength: 3 })
  .map((parts) => parts.join(" "))
  .filter((q) => !/^\s*(?:select|with|insert|update|delete|create|drop|alter)\b/i.test(q));

describe("translateNLQ — output is read-only & parseable (fuzzed NL questions)", () => {
  test.prop([questionArb])(
    "every output SQL is read-only (begins SELECT/WITH, no mutating keyword)",
    (question) => {
      const { sql } = translateNLQ(question, CTX);
      expect(isReadOnlySql(sql)).toBe(true);
    },
  );

  test.prop([questionArb])(
    "every output SQL parses under a DuckDB-adjacent dialect",
    (question) => {
      const { sql } = translateNLQ(question, CTX);
      expect(parsesAsSql(sql)).toBe(true);
    },
  );

  test.prop([fc.string()])(
    "is a TOTAL function: never throws for ANY question string and always returns a non-empty SQL string",
    (question) => {
      const result = translateNLQ(question, CTX);
      expect(typeof result.sql).toBe("string");
      expect(result.sql.length).toBeGreaterThan(0);
      expect(["high", "medium", "low"]).toContain(result.confidence);
    },
  );

  test.prop([fc.string()])(
    "every output SQL carries a LIMIT clause (bounded result set)",
    (question) => {
      const { sql } = translateNLQ(question, CTX);
      expect(/\blimit\s+\d+/i.test(sql)).toBe(true);
    },
  );
});

describe("translateNLQ — raw-SQL passthrough contract (documented real behavior)", () => {
  // This pins the INTENTIONAL passthrough: translateNLQ is NOT the read-only
  // gate for raw-SQL input. The downstream assertReadOnlySql / looksReadOnly
  // guards are. We assert the actual contract (echo + LIMIT), not a false
  // "always read-only" claim.
  test.prop([fc.constantFrom("DROP", "DELETE", "UPDATE", "INSERT", "CREATE", "ALTER")])(
    "echoes a leading-write-keyword question back as raw SQL (does NOT sanitize it to read-only)",
    (verb) => {
      const question = `${verb} TABLE tx_view`;
      const { sql, explanation } = translateNLQ(question, CTX);
      // The output still contains the write verb — translateNLQ did not make it
      // safe; that is the downstream guard's job.
      expect(new RegExp(`\\b${verb}\\b`, "i").test(sql)).toBe(true);
      expect(explanation).toMatch(/raw sql/i);
    },
  );
});
