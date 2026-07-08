import { describe, expect, it } from "vitest";
import {
  applyValidityDetail,
  buildQualityDimensions,
  computeValidityDetail,
  defaultProfileQuery,
  filterSortProfiles,
  isNumericType,
  nullRateFromSummary,
  numberOrUndefined,
  parseColumnDetail,
  profileScore,
  profilesFromSummary,
  summaryRowToProfile,
  toProfileType,
} from "@/features/parsed-data/model/summary-map";
import type { ColProfile } from "@/features/parsed-data/model/types";

/**
 * Unit tests for the pure DuckDB SUMMARIZE -> ColProfile mapping, the coercers,
 * the off-main-thread filter/sort, quality aggregation and the measured validity
 * scorer. All functions are side-effect free, so no mocking is needed.
 */

function makeProfile(over: Partial<ColProfile> = {}): ColProfile {
  return {
    name: "col",
    index: 0,
    type: "string",
    sqlType: "VARCHAR",
    rowCount: 100,
    nullCount: 0,
    nullRate: 0,
    distinctCount: 50,
    uniquenessRate: 0.5,
    topValues: [],
    completeness: 1,
    uniqueness: 1,
    validity: 0.9,
    ...over,
  };
}

describe("numberOrUndefined", () => {
  it("returns finite numbers unchanged", () => {
    expect(numberOrUndefined(42)).toBe(42);
    expect(numberOrUndefined(0)).toBe(0);
  });
  it("coerces numeric strings and bigints", () => {
    expect(numberOrUndefined("3.14")).toBeCloseTo(3.14);
    expect(numberOrUndefined(9007199254740991n)).toBe(9007199254740991);
  });
  it("returns undefined for nullish and non-finite values", () => {
    expect(numberOrUndefined(null)).toBeUndefined();
    expect(numberOrUndefined(undefined)).toBeUndefined();
    expect(numberOrUndefined("nope")).toBeUndefined();
    expect(numberOrUndefined(Number.POSITIVE_INFINITY)).toBeUndefined();
  });
});

describe("nullRateFromSummary", () => {
  it("parses a plain number percentage into a 0..1 rate", () => {
    expect(nullRateFromSummary(12.5)).toBeCloseTo(0.125);
  });
  it("parses a %-suffixed string with surrounding whitespace", () => {
    expect(nullRateFromSummary(" 25% ")).toBeCloseTo(0.25);
  });
  it("clamps out-of-range values to 0..1", () => {
    expect(nullRateFromSummary(150)).toBe(1);
    expect(nullRateFromSummary(-10)).toBe(0);
  });
  it("returns 0 for nullish or unparseable input", () => {
    expect(nullRateFromSummary(null)).toBe(0);
    expect(nullRateFromSummary(undefined)).toBe(0);
    expect(nullRateFromSummary("abc")).toBe(0);
  });
});

describe("toProfileType", () => {
  it("maps integer SQL types", () => {
    expect(toProfileType("BIGINT")).toBe("integer");
    expect(toProfileType("integer")).toBe("integer");
    expect(toProfileType("UTINYINT")).toBe("integer");
  });
  it("maps float, boolean, date and string types", () => {
    expect(toProfileType("DOUBLE")).toBe("float");
    expect(toProfileType("DECIMAL(10,2)")).toBe("float");
    expect(toProfileType("BOOLEAN")).toBe("boolean");
    expect(toProfileType("TIMESTAMP")).toBe("date");
    expect(toProfileType("VARCHAR")).toBe("string");
    expect(toProfileType("UUID")).toBe("string");
  });
  it("returns unknown for unrecognised types", () => {
    expect(toProfileType("STRUCT")).toBe("unknown");
    expect(toProfileType("")).toBe("unknown");
  });
});

describe("isNumericType", () => {
  it("is true only for integer and float", () => {
    expect(isNumericType("integer")).toBe(true);
    expect(isNumericType("float")).toBe(true);
    expect(isNumericType("string")).toBe(false);
    expect(isNumericType("date")).toBe(false);
    expect(isNumericType("unknown")).toBe(false);
  });
});

describe("summaryRowToProfile", () => {
  it("maps a numeric SUMMARIZE row into a fully populated profile", () => {
    const profile = summaryRowToProfile(
      {
        column_name: "amount",
        column_type: "DOUBLE",
        count: 200,
        approx_unique: 150,
        null_percentage: 10,
        min: 1,
        max: 1000,
        avg: 500,
        std: 100,
        q25: 250,
        q50: 480,
        q75: 750,
      },
      3,
    );

    expect(profile.name).toBe("amount");
    expect(profile.index).toBe(3);
    expect(profile.type).toBe("float");
    expect(profile.rowCount).toBe(200);
    expect(profile.nullRate).toBeCloseTo(0.1);
    expect(profile.nullCount).toBe(20); // round(200 * 0.1)
    expect(profile.distinctCount).toBe(150);
    expect(profile.uniquenessRate).toBeCloseTo(0.75);
    expect(profile.min).toBe(1);
    expect(profile.max).toBe(1000);
    expect(profile.median).toBe(480);
    expect(profile.p25).toBe(250);
    expect(profile.p75).toBe(750);
    expect(profile.completeness).toBeCloseTo(0.9);
    expect(profile.validity).toBe(0.9); // type-based prior for a known type
  });

  it("leaves numeric stats undefined for non-numeric columns", () => {
    const profile = summaryRowToProfile(
      { column_name: "name", column_type: "VARCHAR", count: 10, min: 5, max: 9 },
      0,
    );

    expect(profile.type).toBe("string");
    expect(profile.min).toBeUndefined();
    expect(profile.max).toBeUndefined();
    expect(profile.avg).toBeUndefined();
  });

  it("synthesises a column name and uses a 0.5 validity prior for unknown types", () => {
    const profile = summaryRowToProfile({ column_type: "STRUCT" }, 2);

    expect(profile.name).toBe("column_3");
    expect(profile.type).toBe("unknown");
    expect(profile.validity).toBe(0.5);
  });

  it("guards uniquenessRate against a zero row count", () => {
    const profile = summaryRowToProfile(
      { column_name: "c", column_type: "INTEGER", count: 0, approx_unique: 5 },
      0,
    );

    expect(profile.rowCount).toBe(0);
    expect(profile.uniquenessRate).toBe(0);
  });

  it("defaults sqlType to empty string when column_type is absent", () => {
    // Exercises the `row.column_type ?? ""` nullish-coalescing false branch on line 79.
    const profile = summaryRowToProfile({ column_name: "x" }, 0);
    expect(profile.sqlType).toBe("");
    expect(profile.type).toBe("unknown");
  });
});

describe("profilesFromSummary", () => {
  it("maps every row and assigns sequential indices", () => {
    const profiles = profilesFromSummary([
      { column_name: "a", column_type: "INTEGER", count: 1 },
      { column_name: "b", column_type: "VARCHAR", count: 1 },
    ]);

    expect(profiles).toHaveLength(2);
    expect(profiles.map((p) => p.index)).toEqual([0, 1]);
    expect(profiles.map((p) => p.name)).toEqual(["a", "b"]);
  });

  it("returns an empty array for no rows", () => {
    expect(profilesFromSummary([])).toEqual([]);
  });
});

describe("profileScore", () => {
  it("is a weighted blend of completeness, uniqueness and validity", () => {
    const score = profileScore(makeProfile({ completeness: 1, uniqueness: 1, validity: 1 }));
    expect(score).toBeCloseTo(1);

    const half = profileScore(makeProfile({ completeness: 0.5, uniqueness: 0.5, validity: 0.5 }));
    expect(half).toBeCloseTo(0.5);
  });
});

describe("filterSortProfiles", () => {
  const profiles = [
    // alpha lands in the "good" bucket: score = 0.8*0.5 + 0.8*0.25 + 0.8*0.25 = 0.8
    makeProfile({
      name: "alpha",
      type: "integer",
      sqlType: "BIGINT",
      nullRate: 0.1,
      distinctCount: 10,
      completeness: 0.8,
      uniqueness: 0.8,
      validity: 0.8,
    }),
    // beta lands in the "poor" bucket: score = 0.5*0.5 + 0.2*0.25 + 0.4*0.25 = 0.4
    makeProfile({
      name: "beta",
      type: "string",
      sqlType: "VARCHAR",
      nullRate: 0.5,
      distinctCount: 3,
      completeness: 0.5,
      uniqueness: 0.2,
      validity: 0.4,
    }),
    // gamma lands in the "excellent" bucket: score = 1
    makeProfile({
      name: "gamma",
      type: "float",
      sqlType: "DOUBLE",
      nullRate: 0,
      distinctCount: 99,
      completeness: 1,
      uniqueness: 1,
      validity: 1,
    }),
  ];

  it("filters by a case-insensitive name/type/sqlType search", () => {
    expect(
      filterSortProfiles(profiles, { ...defaultProfileQuery, search: "BETA" }).map((p) => p.name),
    ).toEqual(["beta"]);
    // type substring
    expect(
      filterSortProfiles(profiles, { ...defaultProfileQuery, search: "float" }).map((p) => p.name),
    ).toEqual(["gamma"]);
    // sqlType substring
    expect(
      filterSortProfiles(profiles, { ...defaultProfileQuery, search: "varchar" }).map(
        (p) => p.name,
      ),
    ).toEqual(["beta"]);
  });

  it("filters by type", () => {
    const result = filterSortProfiles(profiles, { ...defaultProfileQuery, typeFilter: "integer" });
    expect(result.map((p) => p.name)).toEqual(["alpha"]);
  });

  it("filters by quality bucket", () => {
    const poor = filterSortProfiles(profiles, { ...defaultProfileQuery, qualityFilter: "poor" });
    expect(poor.map((p) => p.name)).toEqual(["beta"]);
    const excellent = filterSortProfiles(profiles, {
      ...defaultProfileQuery,
      qualityFilter: "excellent",
    });
    expect(excellent.map((p) => p.name)).toEqual(["gamma"]);
  });

  it("sorts by name ascending and descending", () => {
    const asc = filterSortProfiles(profiles, {
      ...defaultProfileQuery,
      sortBy: "name",
      sortAsc: true,
    });
    expect(asc.map((p) => p.name)).toEqual(["alpha", "beta", "gamma"]);
    const desc = filterSortProfiles(profiles, {
      ...defaultProfileQuery,
      sortBy: "name",
      sortAsc: false,
    });
    expect(desc.map((p) => p.name)).toEqual(["gamma", "beta", "alpha"]);
  });

  it("sorts by nullRate and distinctCount", () => {
    const byNull = filterSortProfiles(profiles, {
      ...defaultProfileQuery,
      sortBy: "nullRate",
      sortAsc: true,
    });
    expect(byNull.map((p) => p.nullRate)).toEqual([0, 0.1, 0.5]);
    const byDistinct = filterSortProfiles(profiles, {
      ...defaultProfileQuery,
      sortBy: "distinctCount",
      sortAsc: false,
    });
    expect(byDistinct.map((p) => p.distinctCount)).toEqual([99, 10, 3]);
  });

  it("does not mutate the input array", () => {
    const input = [...profiles];
    filterSortProfiles(profiles, { ...defaultProfileQuery, sortBy: "name", sortAsc: true });
    expect(profiles).toEqual(input);
  });
});

describe("buildQualityDimensions", () => {
  it("returns the four dimensions with averaged scores and affected columns", () => {
    const dims = buildQualityDimensions([
      makeProfile({ name: "good", completeness: 1, uniquenessRate: 0.6, validity: 1, nullRate: 0 }),
      makeProfile({
        name: "bad",
        completeness: 0.5,
        uniquenessRate: 0.05,
        validity: 0.5,
        nullRate: 0.5,
      }),
    ]);

    const names = dims.map((d) => d.name);
    expect(names).toEqual(["Completeness", "Uniqueness", "Validity", "Consistency"]);

    const completeness = dims.find((d) => d.name === "Completeness")!;
    expect(completeness.score).toBeCloseTo(0.75); // (1 + 0.5)/2
    expect(completeness.affected).toContain("bad");
    expect(completeness.affected).not.toContain("good");

    const validity = dims.find((d) => d.name === "Validity")!;
    expect(validity.affected).toEqual(["bad"]); // validity < 0.8
  });

  it("avoids divide-by-zero with an empty profile list", () => {
    const dims = buildQualityDimensions([]);
    expect(dims).toHaveLength(4);
    for (const dim of dims) {
      expect(Number.isFinite(dim.score)).toBe(true);
    }
  });
});

describe("computeValidityDetail", () => {
  it("returns a high conformance prior for an empty sample of a known type", () => {
    const detail = computeValidityDetail("string", []);
    expect(detail.sampleSize).toBe(0);
    expect(detail.conformanceRate).toBe(0.9);
    expect(detail.semanticType).toBeUndefined();
  });

  it("returns a 0.5 conformance prior for an empty sample of an unknown type", () => {
    const detail = computeValidityDetail("unknown", []);
    expect(detail.conformanceRate).toBe(0.5);
  });

  it("ignores empty strings when sizing the sample", () => {
    const detail = computeValidityDetail("string", ["", "", ""]);
    expect(detail.sampleSize).toBe(0);
  });

  it("scores numeric conformance as the fraction parseable as finite numbers", () => {
    const detail = computeValidityDetail("integer", ["1", "2", "3", "oops"]);
    expect(detail.semanticType).toBe("numeric");
    expect(detail.conformanceRate).toBeCloseTo(0.75);
  });

  it("flags MAD-based numeric outliers", () => {
    // A spread cluster (non-zero MAD) plus one extreme value -> the extreme is a
    // > 3.5 modified-z outlier. (A constant cluster would yield MAD 0 and no
    // outliers, by design.)
    const sample = ["10", "11", "9", "12", "8", "13", "10", "11", "9", "10", "12", "1000"];
    const detail = computeValidityDetail("float", sample);
    expect(detail.outlierRate).toBeGreaterThan(0);
  });

  it("infers and scores email semantic type", () => {
    const detail = computeValidityDetail("string", ["a@b.com", "c@d.org", "e@f.net"]);
    expect(detail.semanticType).toBe("email");
    expect(detail.conformanceRate).toBe(1);
  });

  it("scores boolean conformance against the recognised vocabulary", () => {
    const detail = computeValidityDetail("boolean", ["true", "false", "yes", "no"]);
    expect(detail.semanticType).toBe("boolean");
    expect(detail.conformanceRate).toBe(1);
  });

  it("scores date conformance via the ISO pattern or Date.parse", () => {
    const detail = computeValidityDetail("date", [
      "2026-01-01",
      "2026-06-16 12:30:00",
      "not-a-date",
    ]);
    expect(detail.semanticType).toBe("date");
    expect(detail.conformanceRate).toBeCloseTo(2 / 3, 5);
  });

  it("uses length-stability for generic categorical strings (uniform length -> high)", () => {
    const detail = computeValidityDetail("string", ["abcd", "wxyz", "qrst", "mnop"]);
    expect(detail.semanticType).toBe("categorical");
    expect(detail.conformanceRate).toBeCloseTo(1, 5);
  });
});

describe("computeValidityDetail – additional branch coverage", () => {
  it("returns boolean semanticType for a string column whose values all appear in the bool vocabulary", () => {
    // inferSemanticType: lowered.every(v => BOOL_VALUES.has(v)) -> true -> "boolean"
    // computeValidityDetail: falls through all specific branches into lengthStability
    const detail = computeValidityDetail("string", ["true", "false", "yes", "no"]);
    // semanticType inferred as "boolean" but handled by the generic else (lengthStability)
    expect(detail.semanticType).toBe("boolean");
    // All values have length 4 or 5 — some variation; conformanceRate still clamped to [0,1]
    expect(detail.conformanceRate).toBeGreaterThanOrEqual(0);
    expect(detail.conformanceRate).toBeLessThanOrEqual(1);
  });

  it("handles numeric columns with identical constant values (MAD = 0, no outliers)", () => {
    // madOutlierRate: nums.length >= 8 but mad === 0 -> return 0
    const sample = Array.from({ length: 10 }, () => "42");
    const detail = computeValidityDetail("integer", sample);
    expect(detail.outlierRate).toBe(0);
    expect(detail.conformanceRate).toBe(1);
  });

  it("handles numeric columns with fewer than 8 parseable values (short-circuit in madOutlierRate)", () => {
    // madOutlierRate: nums.length < 8 -> return 0
    const detail = computeValidityDetail("float", ["1", "2", "3"]);
    expect(detail.outlierRate).toBe(0);
  });

  it("infers numeric semanticType for string column with numeric-looking values", () => {
    // inferSemanticType: fractionMatching(sample, NUMERIC_RE) >= 0.9 -> "numeric"
    const detail = computeValidityDetail("string", [
      "1.5", "2.0", "3.14", "100", "0", "999", "42", "7", "88", "11",
    ]);
    expect(detail.semanticType).toBe("numeric");
  });

  it("infers date semanticType for string column with ISO date values", () => {
    // inferSemanticType: fractionMatching(sample, DATE_RE) >= 0.9 -> "date"
    const detail = computeValidityDetail("string", [
      "2024-01-01", "2024-02-15", "2025-06-20", "2023-12-31", "2022-03-10",
      "2021-07-04", "2020-11-11", "2026-01-01", "2019-09-09", "2018-08-08",
    ]);
    expect(detail.semanticType).toBe("date");
  });

  it("clamps a non-finite validity score to 0 via applyValidityDetail", () => {
    // applyValidityDetail computes conformanceRate * (1 - outlierRate)
    // Pass conformanceRate=Infinity/NaN via a custom ColValidityDetail -> clamp01 returns 0
    const profile = makeProfile();
    const updated = applyValidityDetail(profile, {
      conformanceRate: Number.NaN,
      outlierRate: 0,
      sampleSize: 1,
    });
    expect(updated.validity).toBe(0);
  });
});

describe("applyValidityDetail", () => {
  it("folds conformance and outlier rate into the validity score and attaches the detail", () => {
    const profile = makeProfile({ validity: 0.9 });
    const updated = applyValidityDetail(profile, {
      conformanceRate: 0.8,
      outlierRate: 0.5,
      sampleSize: 100,
      semanticType: "numeric",
    });

    // 0.8 * (1 - 0.5) = 0.4
    expect(updated.validity).toBeCloseTo(0.4);
    expect(updated.validityDetail?.semanticType).toBe("numeric");
    // immutability: original untouched
    expect(profile.validity).toBe(0.9);
    expect(profile.validityDetail).toBeUndefined();
  });

  it("clamps the resulting validity into 0..1", () => {
    const updated = applyValidityDetail(makeProfile(), {
      conformanceRate: 2,
      outlierRate: 0,
      sampleSize: 1,
    });
    expect(updated.validity).toBe(1);
  });
});

describe("computeValidityDetail – uuid and url semantic types", () => {
  it("infers uuid semantic type and scores conformance against UUID_RE", () => {
    const uuids = [
      "550e8400-e29b-41d4-a716-446655440000",
      "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      "6ba7b811-9dad-11d1-80b4-00c04fd430c8",
      "6ba7b812-9dad-11d1-80b4-00c04fd430c8",
      "6ba7b813-9dad-11d1-80b4-00c04fd430c8",
      "6ba7b814-9dad-11d1-80b4-00c04fd430c8",
      "6ba7b815-9dad-11d1-80b4-00c04fd430c8",
      "6ba7b816-9dad-11d1-80b4-00c04fd430c8",
      "6ba7b817-9dad-11d1-80b4-00c04fd430c8",
      "6ba7b818-9dad-11d1-80b4-00c04fd430c8",
    ];
    const detail = computeValidityDetail("string", uuids);
    expect(detail.semanticType).toBe("uuid");
    expect(detail.conformanceRate).toBe(1);
  });

  it("infers url semantic type and scores conformance against URL_RE", () => {
    const urls = [
      "https://example.com",
      "http://foo.bar/path?q=1",
      "https://baz.io/a/b/c",
      "ftp://files.example.org/data",
      "https://one.com",
      "https://two.com",
      "https://three.com",
      "https://four.com",
      "https://five.com",
      "https://six.com",
    ];
    const detail = computeValidityDetail("string", urls);
    expect(detail.semanticType).toBe("url");
    expect(detail.conformanceRate).toBe(1);
  });
});

describe("filterSortProfiles – sort by quality score", () => {
  it("sorts by quality score ascending and descending", () => {
    const profiles = [
      makeProfile({ name: "low", completeness: 0.5, uniqueness: 0.5, validity: 0.5 }),
      makeProfile({ name: "high", completeness: 1, uniqueness: 1, validity: 1 }),
      makeProfile({ name: "mid", completeness: 0.75, uniqueness: 0.75, validity: 0.75 }),
    ];
    const asc = filterSortProfiles(profiles, {
      ...defaultProfileQuery,
      sortBy: "quality",
      sortAsc: true,
    });
    expect(asc.map((p) => p.name)).toEqual(["low", "mid", "high"]);

    const desc = filterSortProfiles(profiles, {
      ...defaultProfileQuery,
      sortBy: "quality",
      sortAsc: false,
    });
    expect(desc.map((p) => p.name)).toEqual(["high", "mid", "low"]);
  });
});

describe("filterSortProfiles – quality filter 'fair'", () => {
  it("filters by the 'fair' quality bucket", () => {
    const profiles = [
      // score = 0.6*0.5 + 0.6*0.25 + 0.6*0.25 = 0.6 -> fair
      makeProfile({ name: "fair_col", completeness: 0.6, uniqueness: 0.6, validity: 0.6 }),
      // score = 1 -> excellent
      makeProfile({ name: "excellent_col", completeness: 1, uniqueness: 1, validity: 1 }),
    ];
    const result = filterSortProfiles(profiles, {
      ...defaultProfileQuery,
      qualityFilter: "fair",
    });
    expect(result.map((p) => p.name)).toEqual(["fair_col"]);
  });
});

describe("filterSortProfiles – quality filter 'good' excludes scores outside [0.7, 0.9)", () => {
  it("excludes an excellent-scored profile (score >= 0.9) from the 'good' bucket", () => {
    const profiles = [
      // score = 0.8 -> good
      makeProfile({ name: "good_col", completeness: 0.8, uniqueness: 0.8, validity: 0.8 }),
      // score = 1.0 -> excellent; score >= 0.7 but score < 0.9 is false -> excluded from good
      makeProfile({ name: "excellent_col", completeness: 1, uniqueness: 1, validity: 1 }),
    ];
    const result = filterSortProfiles(profiles, {
      ...defaultProfileQuery,
      qualityFilter: "good",
    });
    expect(result.map((p) => p.name)).toEqual(["good_col"]);
    expect(result.some((p) => p.name === "excellent_col")).toBe(false);
  });

  it("passes all profiles through when qualityFilter is an unexpected runtime value (default branch)", () => {
    // matchesQualityFilter's default case is unreachable via the TypeScript type, but
    // is reached when a runtime value other than the known literals slips through.
    const profiles = [
      makeProfile({ name: "x", completeness: 0.5, uniqueness: 0.5, validity: 0.5 }),
    ];
    // Bypass TypeScript to exercise the switch default -> return true path.
    const result = filterSortProfiles(profiles, {
      ...defaultProfileQuery,
      qualityFilter: "unknown_value" as never,
    });
    expect(result).toHaveLength(1);
  });
});

describe("parseColumnDetail", () => {
  it("maps top values with percentages and coerces null/undefined values to ''", () => {
    const detail = parseColumnDetail({
      column: "status",
      type: "string",
      rowCount: 100,
      topRows: [
        { val: "OK", cnt: 60 },
        { val: null, cnt: 40 },
      ],
      histogramRows: [],
      validitySample: ["OK", "OK"],
    });

    expect(detail.column).toBe("status");
    expect(detail.topValues[0]).toEqual({ value: "OK", count: 60, pct: 0.6 });
    expect(detail.topValues[1]).toEqual({ value: "", count: 40, pct: 0.4 });
  });

  it("builds a numeric histogram and defaults a missing hi to lo", () => {
    const detail = parseColumnDetail({
      column: "amount",
      type: "integer",
      rowCount: 10,
      topRows: [],
      histogramRows: [
        { lo: 0, hi: 10, cnt: 4 },
        { lo: 10, hi: null, cnt: 6 },
      ],
      validitySample: [],
    });

    expect(detail.histogram).toEqual([
      { lo: 0, hi: 10, count: 4 },
      { lo: 10, hi: 10, count: 6 },
    ]);
  });

  it("omits the histogram for non-numeric columns", () => {
    const detail = parseColumnDetail({
      column: "name",
      type: "string",
      rowCount: 10,
      topRows: [],
      histogramRows: [{ lo: 0, hi: 1, cnt: 5 }],
      validitySample: [],
    });

    expect(detail.histogram).toBeUndefined();
  });

  it("parses length stats and computes a validity detail from the sample", () => {
    const detail = parseColumnDetail({
      column: "email",
      type: "string",
      rowCount: 3,
      topRows: [],
      histogramRows: [],
      lengthStats: { min_len: 5, max_len: 20, avg_len: 12.5 },
      validitySample: ["a@b.com", "c@d.org", "e@f.net"],
    });

    expect(detail.minLen).toBe(5);
    expect(detail.maxLen).toBe(20);
    expect(detail.avgLen).toBeCloseTo(12.5);
    expect(detail.validityDetail?.semanticType).toBe("email");
  });

  it("guards top-value percentages against a zero row count", () => {
    const detail = parseColumnDetail({
      column: "c",
      type: "string",
      rowCount: 0,
      topRows: [{ val: "x", cnt: 5 }],
      histogramRows: [],
      validitySample: [],
    });

    expect(detail.topValues[0].pct).toBe(0);
  });
});
