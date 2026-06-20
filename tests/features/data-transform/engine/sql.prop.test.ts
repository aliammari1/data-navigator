import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import {
  buildCountQuery,
  buildCTE,
  quoteIdent,
  quoteString,
  type TransformStep,
} from "@/features/data-transform/engine/sql";

/**
 * Property-based fuzzing of the transform-pipeline SQL compiler.
 *
 * The compiler must produce ONLY read-only SQL (the renderer's DuckDB is opened
 * read-only and rejects anything that is not a leading SELECT/WITH). Structural
 * invariants verified here without touching a database:
 *   - quoteIdent / quoteString are injection-safe: every embedded quote is
 *     doubled, and the result round-trips (unquote → original).
 *   - buildCTE emits a leading WITH/SELECT, never a mutating verb.
 *   - the compiled pipeline has exactly one CTE per ENABLED step (disabled steps
 *     are dropped) — and toggling a step's `enabled` flag is the only thing that
 *     changes the CTE count (an idempotence/monotonicity invariant).
 *   - buildCountQuery emits one UNION-ALL branch per enabled step plus source.
 */

const STEP_TYPES = [
  "filter",
  "select",
  "rename",
  "derive",
  "aggregate",
  "sort",
  "deduplicate",
  "limit",
  "join",
  "pivot",
] as const;

const identArb = fc
  .stringMatching(/^[A-Za-z_][A-Za-z0-9_]*$/)
  .filter((s) => s.length > 0 && s.length <= 16);

/** An arbitrary, mostly-default transform step (config left empty → defaults). */
const stepArb: fc.Arbitrary<TransformStep> = fc.record({
  id: identArb,
  type: fc.constantFrom(...STEP_TYPES),
  label: fc.string(),
  enabled: fc.boolean(),
  config: fc.constant({}),
});

const MUTATING =
  /\b(?:insert|update|delete|drop|alter|create|attach|copy|pragma|truncate|grant|revoke|vacuum|export|install|load)\b/i;

/** A compiled fragment is read-only when it leads SELECT/WITH and never mutates. */
function isReadOnly(sql: string): boolean {
  const body = sql.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");
  return /^\s*(?:select|with)\b/i.test(body.trim()) && !MUTATING.test(body);
}

describe("quoteIdent / quoteString — injection-safe quoting (fuzzed)", () => {
  test.prop([fc.string()])(
    "quoteIdent doubles EVERY embedded double-quote and round-trips back to the original",
    (name) => {
      const quoted = quoteIdent(name);
      expect(quoted.startsWith('"')).toBe(true);
      expect(quoted.endsWith('"')).toBe(true);
      // Unquote: strip the outer quotes, collapse doubled quotes back to one.
      const inner = quoted.slice(1, -1);
      expect(inner.replaceAll('""', '"')).toBe(name);
    },
  );

  test.prop([fc.string()])(
    "quoteString doubles EVERY embedded single-quote and round-trips back to the original",
    (value) => {
      const quoted = quoteString(value);
      expect(quoted.startsWith("'")).toBe(true);
      expect(quoted.endsWith("'")).toBe(true);
      const inner = quoted.slice(1, -1);
      expect(inner.replaceAll("''", "'")).toBe(value);
    },
  );

  test.prop([identArb])("a bare identifier is wrapped without any internal doubling", (name) => {
    expect(quoteIdent(name)).toBe(`"${name}"`);
  });
});

describe("buildCTE — read-only & CTE-count invariants (fuzzed)", () => {
  test.prop([fc.array(stepArb, { maxLength: 12 }), identArb])(
    "the compiled SQL is ALWAYS read-only (leads SELECT/WITH, no mutating verb)",
    (steps, source) => {
      const { sql } = buildCTE(steps, source);
      expect(isReadOnly(sql)).toBe(true);
    },
  );

  test.prop([fc.array(stepArb, { maxLength: 12 }), identArb])(
    "emits exactly one CTE per ENABLED step (disabled steps are dropped)",
    (steps, source) => {
      const enabledCount = steps.filter((s) => s.enabled).length;
      const { stepCtes, hasSteps } = buildCTE(steps, source);
      expect(stepCtes).toHaveLength(enabledCount);
      expect(hasSteps).toBe(enabledCount > 0);
    },
  );

  test.prop([fc.array(stepArb, { maxLength: 12 }), identArb])(
    "is idempotent under re-filtering: compiling the already-enabled-only subset yields the SAME SQL",
    (steps, source) => {
      const first = buildCTE(steps, source);
      const enabledOnly = steps.filter((s) => s.enabled);
      const second = buildCTE(enabledOnly, source);
      // Dropping the disabled steps before compiling must not change the output.
      expect(second.sql).toBe(first.sql);
      expect(second.stepCtes).toEqual(first.stepCtes);
    },
  );

  test.prop([identArb])(
    "with no steps it degrades to a plain SELECT over the (quoted) source",
    (source) => {
      const { sql, hasSteps, stepCtes } = buildCTE([], source);
      expect(hasSteps).toBe(false);
      expect(stepCtes).toEqual([]);
      expect(sql).toBe(`SELECT * FROM ${quoteIdent(source)}`);
      expect(isReadOnly(sql)).toBe(true);
    },
  );

  test.prop([fc.array(stepArb, { maxLength: 8 }), identArb])(
    "adding a DISABLED step never changes the compiled SQL (monotone in enabled steps)",
    (steps, source) => {
      const base = buildCTE(steps, source);
      const withDisabled = buildCTE(
        [...steps, { id: "zzz", type: "filter", label: "", enabled: false, config: {} }],
        source,
      );
      expect(withDisabled.sql).toBe(base.sql);
    },
  );
});

describe("buildCountQuery — one branch per enabled step + source (fuzzed)", () => {
  test.prop([fc.array(stepArb, { maxLength: 10 }), identArb])(
    "is read-only and emits a count branch for every enabled step plus the source",
    (steps, source) => {
      const compiled = buildCTE(steps, source);
      const countSql = buildCountQuery(steps, source, compiled);
      expect(isReadOnly(countSql)).toBe(true);
      // Each UNION branch is `SELECT '<id>' AS step_id, COUNT(*) AS n ...`, so
      // the `AS step_id` alias appears exactly once per branch. (Counting bare
      // COUNT(*) is unreliable — an aggregate step's own SQL also emits one.)
      const branches = (countSql.match(/\bAS step_id\b/gi) ?? []).length;
      const enabledCount = steps.filter((s) => s.enabled).length;
      // One branch for __source__ + one per enabled step.
      expect(branches).toBe(enabledCount + 1);
    },
  );

  test.prop([fc.array(stepArb, { maxLength: 10 }), identArb])(
    "always references the __source__ sentinel exactly once",
    (steps, source) => {
      const compiled = buildCTE(steps, source);
      const countSql = buildCountQuery(steps, source, compiled);
      const matches = countSql.match(/__source__/g) ?? [];
      expect(matches).toHaveLength(1);
    },
  );
});
