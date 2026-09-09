import { fc, it, test } from "@fast-check/vitest";
import { describe, expect, vi } from "vitest";
import { nullRateFromSummary, numberOrUndefined } from "@/shared/duckdb-summary";

// summarize.ts imports the Electron FS boundary; mock it so importing the pure
// type mapper never reaches Electron/DuckDB.
vi.mock("@/platform/electron/electron-fs", () => ({
  summarizeDataset: vi.fn(),
}));

import { mapDuckTypeToColumnInfoType } from "@/features/data-import/model/summarize";

/**
 * Property-based fuzzing of the pure DuckDB-SUMMARIZE coercion helpers.
 *
 * These run on raw, version-dependent DuckDB output (numbers, bigints, `%`-
 * suffixed strings, nullish). Their contracts (over the REALISTIC DuckDB
 * SUMMARIZE domain — JSON-ish primitives):
 *   - numberOrUndefined: returns a finite number or `undefined`, never
 *     NaN/Infinity, and round-trips finite numbers exactly.
 *   - nullRateFromSummary: always returns a rate in [0,1].
 *   - mapDuckTypeToColumnInfoType: always returns a valid ColumnInfo type.
 *
 * REAL FINDING (source NOT modified — documented, not patched):
 *   The doc-comments call these helpers TOTAL ("Returns 0 for nullish or
 *   unparseable input"), but they are NOT total over the FULL JS value space.
 *   - `numberOrUndefined({ toString: null })` and any object whose
 *     toString/valueOf is non-callable throws `TypeError: Cannot convert
 *     object to primitive value` via `Number(value)`.
 *   - `numberOrUndefined(Symbol())` throws `TypeError: Cannot convert a Symbol
 *     value to a number`.
 *   - `nullRateFromSummary({ toString: null })` likewise throws via
 *     `String(value)`.
 *   These inputs never occur in real DuckDB SUMMARIZE output (which yields
 *   number | bigint | string | boolean | null), so the contract holds over the
 *   realistic domain. The throwing edge cases are PINNED below so the boundary
 *   is locked rather than silently assumed safe. A defensive fix would wrap the
 *   coercion in try/catch — left to the source owner.
 */

const COLUMN_INFO_TYPES = ["number", "date", "boolean", "mixed", "string"];

/** The realistic DuckDB SUMMARIZE value domain: JSON-ish primitives only. */
const summarizeValueArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.double(),
  fc.integer(),
  fc.bigInt(),
  fc.string(),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
);

describe("numberOrUndefined — coercion properties (fuzzed)", () => {
  test.prop([summarizeValueArb])(
    "is total over the realistic SUMMARIZE domain and never returns NaN or Infinity (only a finite number or undefined)",
    (input) => {
      const out = numberOrUndefined(input);
      if (out !== undefined) {
        expect(typeof out).toBe("number");
        expect(Number.isFinite(out)).toBe(true);
      }
    },
  );

  test.prop([fc.double({ noNaN: true, noDefaultInfinity: true })])(
    "round-trips any finite double unchanged",
    (n) => {
      expect(numberOrUndefined(n)).toBe(n);
    },
  );

  test.prop([fc.bigInt({ min: -(2n ** 53n) + 1n, max: 2n ** 53n - 1n })])(
    "round-trips safe-range bigint COUNT/approx_unique values to the equal number",
    (big) => {
      expect(numberOrUndefined(big)).toBe(Number(big));
    },
  );

  test.prop([fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY)])(
    "returns undefined for non-finite numeric inputs",
    (bad) => {
      expect(numberOrUndefined(bad)).toBeUndefined();
    },
  );

  // ── Documented totality bug (source NOT modified): the helper is not total
  //    over the full JS value space. These pins lock the actual behavior so a
  //    future defensive fix is a deliberate, visible change. ──
  it("THROWS on an object with a non-callable toString (real totality gap, not realistic SUMMARIZE input)", () => {
    expect(() => numberOrUndefined({ toString: null })).toThrow(TypeError);
  });

  it("THROWS on a Symbol (Number(symbol) is illegal) — documented totality gap", () => {
    expect(() => numberOrUndefined(Symbol("x"))).toThrow(TypeError);
  });
});

describe("nullRateFromSummary — rate ∈ [0,1] (fuzzed)", () => {
  test.prop([summarizeValueArb])(
    "returns a number in [0,1] over the realistic SUMMARIZE domain",
    (input) => {
      const rate = nullRateFromSummary(input);
      expect(typeof rate).toBe("number");
      expect(Number.isFinite(rate)).toBe(true);
      expect(rate).toBeGreaterThanOrEqual(0);
      expect(rate).toBeLessThanOrEqual(1);
    },
  );

  test.prop([fc.double({ min: 0, max: 100, noNaN: true })])(
    "maps a 0..100 percentage to the matching 0..1 rate",
    (pct) => {
      expect(nullRateFromSummary(pct)).toBeCloseTo(pct / 100, 10);
    },
  );

  test.prop([fc.double({ min: 0, max: 100, noNaN: true })])(
    "accepts the `%`-suffixed string form DuckDB sometimes emits",
    (pct) => {
      expect(nullRateFromSummary(`${pct}%`)).toBeCloseTo(pct / 100, 10);
    },
  );

  test.prop([fc.double({ min: 100.0001, max: 1e6, noNaN: true, noDefaultInfinity: true })])(
    "clamps out-of-range percentages to 1",
    (pct) => {
      expect(nullRateFromSummary(pct)).toBe(1);
    },
  );

  test.prop([fc.double({ min: -1e6, max: -0.0001, noNaN: true, noDefaultInfinity: true })])(
    "clamps negative percentages to 0",
    (pct) => {
      expect(nullRateFromSummary(pct)).toBe(0);
    },
  );

  // Documented totality gap (source NOT modified): String(value) throws when
  // value.toString is non-callable. Not a realistic SUMMARIZE input; pinned.
  it("THROWS on an object with a non-callable toString (real totality gap)", () => {
    expect(() => nullRateFromSummary({ toString: null })).toThrow(TypeError);
  });
});

describe("mapDuckTypeToColumnInfoType — total over arbitrary type names (fuzzed)", () => {
  test.prop([fc.string()])(
    "is TOTAL: always returns a valid ColumnInfo type for ANY string",
    (raw) => {
      const out = mapDuckTypeToColumnInfoType(raw);
      expect(COLUMN_INFO_TYPES).toContain(out);
    },
  );

  test.prop([
    fc.constantFrom(
      "INTEGER",
      "BIGINT",
      "DOUBLE",
      "FLOAT",
      "DECIMAL(10,2)",
      "NUMERIC",
      "REAL",
      "HUGEINT",
      "TINYINT",
    ),
  ])("classifies every numeric DuckDB type as 'number'", (t) => {
    expect(mapDuckTypeToColumnInfoType(t)).toBe("number");
  });

  test.prop([fc.constantFrom("DATE", "TIMESTAMP", "TIMESTAMP WITH TIME ZONE", "TIME")])(
    "classifies every temporal DuckDB type as 'date'",
    (t) => {
      expect(mapDuckTypeToColumnInfoType(t)).toBe("date");
    },
  );

  test.prop([fc.constantFrom("BOOLEAN", "BOOL")])(
    "classifies boolean DuckDB types as 'boolean'",
    (t) => {
      expect(mapDuckTypeToColumnInfoType(t)).toBe("boolean");
    },
  );

  test.prop([fc.string()])(
    "is case-insensitive: upper- and lower-cased type names map identically",
    (raw) => {
      expect(mapDuckTypeToColumnInfoType(raw.toUpperCase())).toBe(
        mapDuckTypeToColumnInfoType(raw.toLowerCase()),
      );
    },
  );
});
