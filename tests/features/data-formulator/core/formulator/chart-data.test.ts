import { describe, expect, it } from "vitest";
import {
  aggregateRowsInMemory,
  CHART_ROW_LIMIT,
  resolveAutoChartType,
  type ShelfStateLike,
  shelfToChartSpec,
} from "@/features/data-formulator/core/formulator/chart-data";
import type { Row } from "@/features/data-formulator/core/formulator/model";
import { buildSQL } from "@/features/data-formulator/core/sql";
import type { ChartSpec, ColumnInfo, Encoding, FilterDef } from "@/features/data-formulator/core/types";

// ─── Builders ─────────────────────────────────────────────────────────────────

function enc(overrides: Partial<Encoding> & Pick<Encoding, "channel" | "field">): Encoding {
  return {
    id: `${overrides.channel}-${overrides.field}`,
    aggregate: "none",
    sort: "none",
    ...overrides,
  };
}

function makeSpec(encodings: Encoding[], overrides: Partial<ChartSpec> = {}): ChartSpec {
  return {
    id: "c1",
    type: "bar",
    encodings,
    filters: [],
    limit: 500,
    title: "t",
    ...overrides,
  };
}

function shelf(encodings: Encoding[]): ShelfStateLike {
  return { chartType: "auto", encodings };
}

function col(name: string, type: ColumnInfo["type"]): ColumnInfo {
  return { name, type, dbType: type.toUpperCase() };
}

const COLUMNS = [
  col("jour", "date"),
  col("canal", "string"),
  col("montant", "number"),
  col("duree", "number"),
];

// ─── resolveAutoChartType ─────────────────────────────────────────────────────

describe("resolveAutoChartType", () => {
  it("resolves a temporal x to line", () => {
    const s = shelf([
      enc({ channel: "x", field: "jour" }),
      enc({ channel: "y", field: "montant", aggregate: "sum" }),
    ]);
    expect(resolveAutoChartType(s, COLUMNS)).toBe("line");
  });

  it("resolves raw numeric x and y (aggregate none) to scatter", () => {
    const s = shelf([
      enc({ channel: "x", field: "duree" }),
      enc({ channel: "y", field: "montant", aggregate: "none" }),
    ]);
    expect(resolveAutoChartType(s, COLUMNS)).toBe("scatter");
  });

  it("resolves aggregated numeric x/y to bar (not scatter)", () => {
    const s = shelf([
      enc({ channel: "x", field: "duree" }),
      enc({ channel: "y", field: "montant", aggregate: "sum" }),
    ]);
    expect(resolveAutoChartType(s, COLUMNS)).toBe("bar");
  });

  it("resolves a categorical x to bar", () => {
    const s = shelf([
      enc({ channel: "x", field: "canal" }),
      enc({ channel: "y", field: "montant", aggregate: "sum" }),
    ]);
    expect(resolveAutoChartType(s, COLUMNS)).toBe("bar");
  });

  it("falls back to bar for unknown fields or an empty shelf", () => {
    expect(resolveAutoChartType(shelf([enc({ channel: "x", field: "mystere" })]), COLUMNS)).toBe(
      "bar",
    );
    expect(resolveAutoChartType(shelf([]), COLUMNS)).toBe("bar");
  });

  it("prefers line over scatter when x is temporal", () => {
    const columns = [col("jour", "date"), col("montant", "number")];
    const s = shelf([
      enc({ channel: "x", field: "jour" }),
      enc({ channel: "y", field: "montant", aggregate: "none" }),
    ]);
    expect(resolveAutoChartType(s, columns)).toBe("line");
  });
});

// ─── shelfToChartSpec ─────────────────────────────────────────────────────────

describe("shelfToChartSpec", () => {
  it("maps shelf state onto a ChartSpec with sensible defaults", () => {
    const s = shelf([
      enc({ channel: "x", field: "canal" }),
      enc({ channel: "y", field: "montant", aggregate: "sum" }),
    ]);
    const spec = shelfToChartSpec(s, "bar");
    expect(spec.type).toBe("bar");
    expect(spec.encodings).toEqual(s.encodings);
    expect(spec.filters).toEqual([]);
    expect(spec.limit).toBe(CHART_ROW_LIMIT);
    expect(spec.id).toBeTruthy();
    expect(spec.title).toBe("montant par canal");
  });

  it("copies encodings immutably (no shared references with the shelf)", () => {
    const s = shelf([enc({ channel: "x", field: "canal" })]);
    const spec = shelfToChartSpec(s, "bar");
    expect(spec.encodings).not.toBe(s.encodings);
    expect(spec.encodings[0]).not.toBe(s.encodings[0]);
  });

  it("titles from the single bound field when only one axis is set", () => {
    expect(shelfToChartSpec(shelf([enc({ channel: "x", field: "canal" })]), "bar").title).toBe(
      "canal",
    );
    expect(shelfToChartSpec(shelf([]), "bar").title).toBe("Graphique");
  });
});

// ─── aggregateRowsInMemory ────────────────────────────────────────────────────

const SALES: Row[] = [
  { canal: "web", montant: 10, region: "nord" },
  { canal: "web", montant: 30, region: "sud" },
  { canal: "sms", montant: 5, region: "nord" },
  { canal: "sms", montant: null, region: "sud" },
  { canal: "ussd", montant: "20", region: "nord" },
];

function xySpec(aggregate: Encoding["aggregate"], overrides: Partial<ChartSpec> = {}): ChartSpec {
  return makeSpec(
    [enc({ channel: "x", field: "canal" }), enc({ channel: "y", field: "montant", aggregate })],
    overrides,
  );
}

describe("aggregateRowsInMemory — aggregate functions", () => {
  it("sum groups by x, coerces numeric strings and skips nulls", () => {
    expect(aggregateRowsInMemory(SALES, xySpec("sum"))).toEqual([
      { x_val: "web", y_val: 40 },
      { x_val: "ussd", y_val: 20 },
      { x_val: "sms", y_val: 5 },
    ]);
  });

  it("count counts non-null values only", () => {
    const out = aggregateRowsInMemory(SALES, xySpec("count"));
    expect(out).toContainEqual({ x_val: "web", y_val: 2 });
    expect(out).toContainEqual({ x_val: "sms", y_val: 1 });
    expect(out).toContainEqual({ x_val: "ussd", y_val: 1 });
  });

  it("avg / min / max aggregate coerced numbers", () => {
    expect(aggregateRowsInMemory(SALES, xySpec("avg"))).toContainEqual({
      x_val: "web",
      y_val: 20,
    });
    expect(aggregateRowsInMemory(SALES, xySpec("min"))).toContainEqual({
      x_val: "web",
      y_val: 10,
    });
    expect(aggregateRowsInMemory(SALES, xySpec("max"))).toContainEqual({
      x_val: "web",
      y_val: 30,
    });
  });

  it("median is exact for odd and even counts", () => {
    const odd: Row[] = [
      { g: "a", v: 9 },
      { g: "a", v: 1 },
      { g: "a", v: 5 },
    ];
    const even: Row[] = [...odd, { g: "a", v: 3 }];
    const spec = makeSpec([
      enc({ channel: "x", field: "g" }),
      enc({ channel: "y", field: "v", aggregate: "median" }),
    ]);
    expect(aggregateRowsInMemory(odd, spec)).toEqual([{ x_val: "a", y_val: 5 }]);
    expect(aggregateRowsInMemory(even, spec)).toEqual([{ x_val: "a", y_val: 4 }]);
  });

  it("distinct counts distinct non-null values", () => {
    const rows: Row[] = [
      { g: "a", v: 1 },
      { g: "a", v: 1 },
      { g: "a", v: 2 },
      { g: "a", v: null },
    ];
    const spec = makeSpec([
      enc({ channel: "x", field: "g" }),
      enc({ channel: "y", field: "v", aggregate: "distinct" }),
    ]);
    expect(aggregateRowsInMemory(rows, spec)).toEqual([{ x_val: "a", y_val: 2 }]);
  });

  it("aggregates over an all-null group yield null (sum) and 0 (count)", () => {
    const rows: Row[] = [
      { g: "a", v: null },
      { g: "a", v: undefined },
    ];
    const x = enc({ channel: "x", field: "g" });
    expect(
      aggregateRowsInMemory(
        rows,
        makeSpec([x, enc({ channel: "y", field: "v", aggregate: "sum" })]),
      ),
    ).toEqual([{ x_val: "a", y_val: null }]);
    expect(
      aggregateRowsInMemory(
        rows,
        makeSpec([x, enc({ channel: "y", field: "v", aggregate: "count" })]),
      ),
    ).toEqual([{ x_val: "a", y_val: 0 }]);
  });

  it("aggregate none maps rows one-to-one with TRY_CAST-style coercion", () => {
    const rows: Row[] = [
      { canal: "web", montant: "20" },
      { canal: "sms", montant: "abc" },
    ];
    expect(aggregateRowsInMemory(rows, xySpec("none"))).toEqual([
      { x_val: "web", y_val: 20 },
      { x_val: "sms", y_val: null },
    ]);
  });
});

describe("aggregateRowsInMemory — color grouping, sort, limit", () => {
  it("groups by (x, color) and emits color_val", () => {
    const spec = makeSpec([
      enc({ channel: "x", field: "canal" }),
      enc({ channel: "y", field: "montant", aggregate: "sum" }),
      enc({ channel: "color", field: "region" }),
    ]);
    const out = aggregateRowsInMemory(SALES, spec);
    expect(out).toContainEqual({ x_val: "web", y_val: 10, color_val: "nord" });
    expect(out).toContainEqual({ x_val: "web", y_val: 30, color_val: "sud" });
    expect(out).toContainEqual({ x_val: "ussd", y_val: 20, color_val: "nord" });
    expect(out).toHaveLength(5);
    for (const row of out) {
      expect(Object.keys(row).sort()).toEqual(["color_val", "x_val", "y_val"]);
    }
  });

  it("sorts ascending when an encoding requests it, nulls last", () => {
    const spec = makeSpec([
      enc({ channel: "x", field: "canal", sort: "asc" }),
      enc({ channel: "y", field: "montant", aggregate: "sum" }),
    ]);
    const rows = [...SALES, { canal: "vide", montant: null }];
    const out = aggregateRowsInMemory(rows, spec);
    expect(out.map((r) => r.y_val)).toEqual([5, 20, 40, null]);
  });

  it("defaults to y_val descending when aggregated without explicit sort", () => {
    const out = aggregateRowsInMemory(SALES, xySpec("sum"));
    expect(out.map((r) => r.y_val)).toEqual([40, 20, 5]);
  });

  it("applies spec.limit and prefers topN over limit", () => {
    expect(aggregateRowsInMemory(SALES, xySpec("sum", { limit: 2 }))).toHaveLength(2);
    const out = aggregateRowsInMemory(SALES, xySpec("sum", { limit: 500, topN: 1 }));
    expect(out).toEqual([{ x_val: "web", y_val: 40 }]);
  });

  it("passes rows through (capped) when nothing plottable is bound", () => {
    const out = aggregateRowsInMemory(SALES, makeSpec([], { limit: 3 }));
    expect(out).toEqual(SALES.slice(0, 3));
  });
});

// ─── Output-shape parity with buildSQL ───────────────────────────────────────

describe("aggregateRowsInMemory — buildSQL parity", () => {
  it("emits the exact column aliases buildSQL would for a grouped bar", () => {
    const spec = xySpec("sum");
    expect(buildSQL(spec, "t")).toBe(
      'SELECT "canal" as x_val, SUM(TRY_CAST("montant" AS DOUBLE)) as y_val ' +
        'FROM "t" GROUP BY "canal" ORDER BY y_val DESC LIMIT 500',
    );
    const out = aggregateRowsInMemory(SALES, spec);
    // Same aliases, same grouping, same default DESC order, same cap.
    expect(out).toEqual([
      { x_val: "web", y_val: 40 },
      { x_val: "ussd", y_val: 20 },
      { x_val: "sms", y_val: 5 },
    ]);
    for (const row of out) {
      expect(Object.keys(row).sort()).toEqual(["x_val", "y_val"]);
    }
  });
});

describe("aggregateRowsInMemory — filter parity (python lane)", () => {
  it("applies an equality filter before grouping (cross-filter shape)", () => {
    const spec = xySpec("sum", {
      filters: [{ id: "f1", field: "region", op: "=", value: "nord" }],
    });
    // Only nord rows: web=10, sms=5, ussd=20 (sud rows dropped).
    expect(aggregateRowsInMemory(SALES, spec)).toEqual([
      { x_val: "ussd", y_val: 20 },
      { x_val: "web", y_val: 10 },
      { x_val: "sms", y_val: 5 },
    ]);
  });

  it("compares numerically when the filter value is numeric", () => {
    const spec = xySpec("sum", {
      filters: [{ id: "f1", field: "montant", op: ">", value: "9" }],
    });
    // montant > 9: web 10 + 30 = 40, ussd "20" coerces to 20; sms 5 and null drop.
    expect(aggregateRowsInMemory(SALES, spec)).toEqual([
      { x_val: "web", y_val: 40 },
      { x_val: "ussd", y_val: 20 },
    ]);
  });

  it("supports IN, IS NULL and LIKE with SQL-equivalent semantics", () => {
    const inSpec = xySpec("count", {
      filters: [{ id: "f1", field: "canal", op: "IN", value: "web, sms" }],
    });
    expect(aggregateRowsInMemory(SALES, inSpec).map((r) => r.x_val).sort()).toEqual(["sms", "web"]);

    const nullSpec = makeSpec([enc({ channel: "x", field: "canal" })], {
      filters: [{ id: "f2", field: "montant", op: "IS NULL", value: "" }],
    });
    expect(aggregateRowsInMemory(SALES, nullSpec)).toEqual([{ x_val: "sms" }]);

    const likeSpec = makeSpec([enc({ channel: "x", field: "canal" })], {
      filters: [{ id: "f3", field: "canal", op: "LIKE", value: "s%" }],
    });
    expect(aggregateRowsInMemory(SALES, likeSpec).map((r) => r.x_val)).toEqual(["sms", "sms"]);
  });

  it("shelfToChartSpec threads shelf.filters into the compiled spec", () => {
    const spec = shelfToChartSpec(
      {
        chartType: "bar",
        encodings: [enc({ channel: "x", field: "canal" })],
        filters: [{ id: "f1", field: "region", op: "=", value: "nord" }],
      },
      "bar",
    );
    expect(spec.filters).toEqual([{ id: "f1", field: "region", op: "=", value: "nord" }]);
  });

  it("supports BETWEEN with inclusive numeric bounds", () => {
    // montant: web=10 (in), web=30 (out, >25), sms=5 (in, lower boundary),
    // sms=null (excluded — coerces to null), ussd="20" (in, numeric-string).
    const spec = xySpec("sum", {
      filters: [{ id: "f1", field: "montant", op: "BETWEEN", value: "5,25" }],
    });
    expect(aggregateRowsInMemory(SALES, spec)).toEqual([
      { x_val: "ussd", y_val: 20 },
      { x_val: "web", y_val: 10 },
      { x_val: "sms", y_val: 5 },
    ]);
  });
});

describe("aggregateRowsInMemory — full comparison-operator coverage", () => {
  const NUM_ROWS: Row[] = [
    { id: "a", v: 5 },
    { id: "b", v: 10 },
    { id: "c", v: 15 },
  ];

  function xOnlySpec(filters: ChartSpec["filters"]): ChartSpec {
    return makeSpec([enc({ channel: "x", field: "id" })], { filters });
  }

  function survivors(rows: Row[], spec: ChartSpec): string[] {
    return aggregateRowsInMemory(rows, spec)
      .map((r) => r.x_val as string)
      .sort();
  }

  it("compares numerically for =, !=, <, >=, <= when the filter value parses as a number", () => {
    expect(survivors(NUM_ROWS, xOnlySpec([{ id: "f", field: "v", op: "=", value: "10" }]))).toEqual([
      "b",
    ]);
    expect(
      survivors(NUM_ROWS, xOnlySpec([{ id: "f", field: "v", op: "!=", value: "10" }])),
    ).toEqual(["a", "c"]);
    expect(survivors(NUM_ROWS, xOnlySpec([{ id: "f", field: "v", op: "<", value: "10" }]))).toEqual(
      ["a"],
    );
    expect(
      survivors(NUM_ROWS, xOnlySpec([{ id: "f", field: "v", op: ">=", value: "10" }])),
    ).toEqual(["b", "c"]);
    expect(
      survivors(NUM_ROWS, xOnlySpec([{ id: "f", field: "v", op: "<=", value: "10" }])),
    ).toEqual(["a", "b"]);
  });

  const STR_ROWS: Row[] = [
    { id: "a", label: "alpha" },
    { id: "b", label: "bravo" },
    { id: "c", label: "charlie" },
  ];

  it("compares lexicographically for =, !=, <, >=, <= when the filter value is not numeric", () => {
    expect(
      survivors(STR_ROWS, xOnlySpec([{ id: "f", field: "label", op: "=", value: "bravo" }])),
    ).toEqual(["b"]);
    expect(
      survivors(STR_ROWS, xOnlySpec([{ id: "f", field: "label", op: "!=", value: "bravo" }])),
    ).toEqual(["a", "c"]);
    expect(
      survivors(STR_ROWS, xOnlySpec([{ id: "f", field: "label", op: ">", value: "bravo" }])),
    ).toEqual(["c"]);
    expect(
      survivors(STR_ROWS, xOnlySpec([{ id: "f", field: "label", op: "<", value: "bravo" }])),
    ).toEqual(["a"]);
    expect(
      survivors(STR_ROWS, xOnlySpec([{ id: "f", field: "label", op: ">=", value: "bravo" }])),
    ).toEqual(["b", "c"]);
    expect(
      survivors(STR_ROWS, xOnlySpec([{ id: "f", field: "label", op: "<=", value: "bravo" }])),
    ).toEqual(["a", "b"]);
  });

  it("treats an unrecognized string comparison op as a pass-through (exhaustiveness fallback)", () => {
    // Every real FilterOp is handled by an earlier guard or a switch case; this
    // exercises the `default: return true;` fallback for a value outside the
    // FilterOp union (e.g. corrupted/legacy persisted filter-pill state).
    const spec = xOnlySpec([
      { id: "f", field: "label", op: "CONTAINS" as unknown as FilterDef["op"], value: "bravo" },
    ]);
    expect(survivors(STR_ROWS, spec)).toEqual(["a", "b", "c"]);
  });
});

describe("aggregateRowsInMemory — 'none' aggregate mixed with an aggregated sibling", () => {
  it("passes through the first raw value for a 'none' y encoding when grouping is forced by another encoding", () => {
    // y has aggregate "none" but size has aggregate "sum" — hasAgg is still
    // true (some encoding aggregates), so y_val is resolved via applyAggregate
    // with fn "none" inside the grouped branch (the first value in the group).
    const rows: Row[] = [
      { canal: "web", montant: 10, poids: 1 },
      { canal: "web", montant: 99, poids: 2 },
    ];
    const spec = makeSpec([
      enc({ channel: "x", field: "canal" }),
      enc({ channel: "y", field: "montant", aggregate: "none" }),
      enc({ channel: "size", field: "poids", aggregate: "sum" }),
    ]);
    const out = aggregateRowsInMemory(rows, spec);
    expect(out).toEqual([{ x_val: "web", y_val: 10, size_val: 3 }]);
  });
});

describe("aggregateRowsInMemory — size encoding in the grouped branch", () => {
  it("collects and aggregates size values per group alongside x/y/color", () => {
    const spec = makeSpec([
      enc({ channel: "x", field: "canal" }),
      enc({ channel: "y", field: "montant", aggregate: "sum" }),
      enc({ channel: "size", field: "poids", aggregate: "avg" }),
    ]);
    const rows: Row[] = [
      { canal: "web", montant: 10, poids: 2 },
      { canal: "web", montant: 20, poids: 4 },
      { canal: "sms", montant: 5, poids: 6 },
    ];
    const out = aggregateRowsInMemory(rows, spec);
    expect(out).toContainEqual({ x_val: "web", y_val: 30, size_val: 3 });
    expect(out).toContainEqual({ x_val: "sms", y_val: 5, size_val: 6 });
  });
});

describe("aggregateRowsInMemory — ungrouped color/size passthrough (no aggregation bound)", () => {
  it("maps color_val and size_val one-to-one with coercion, alongside x/y", () => {
    const spec = makeSpec([
      enc({ channel: "x", field: "canal" }),
      enc({ channel: "y", field: "montant" }),
      enc({ channel: "color", field: "region" }),
      enc({ channel: "size", field: "poids" }),
    ]);
    const rows: Row[] = [{ canal: "web", montant: "10", region: "nord", poids: "3" }];
    expect(aggregateRowsInMemory(rows, spec)).toEqual([
      { x_val: "web", y_val: 10, color_val: "nord", size_val: 3 },
    ]);
  });
});

describe("aggregateRowsInMemory — null-aware sort ordering", () => {
  it("keeps a stable order (no throw) when every group's y_val is null", () => {
    // Exactly two groups, both null — the comparator is called with (null, null)
    // at least once, which must resolve to "equal" rather than throwing/NaN-ing.
    const rows: Row[] = [
      { g: "a", v: null },
      { g: "b", v: null },
    ];
    const spec = makeSpec([
      enc({ channel: "x", field: "g", sort: "asc" }),
      enc({ channel: "y", field: "v", aggregate: "sum" }),
    ]);
    const out = aggregateRowsInMemory(rows, spec);
    expect(out.map((r) => r.y_val)).toEqual([null, null]);
    expect(out.map((r) => r.x_val).sort()).toEqual(["a", "b"]);
  });

  it("sorts several nulls interleaved with numeric groups to the end, both ascending and descending", () => {
    const rows: Row[] = [
      { g: "hi", v: 30 },
      { g: "n1", v: null },
      { g: "lo", v: 10 },
      { g: "n2", v: null },
      { g: "mid", v: 20 },
    ];
    const ascSpec = makeSpec([
      enc({ channel: "x", field: "g", sort: "asc" }),
      enc({ channel: "y", field: "v", aggregate: "sum" }),
    ]);
    const asc = aggregateRowsInMemory(rows, ascSpec);
    expect(asc.map((r) => r.y_val)).toEqual([10, 20, 30, null, null]);

    const descSpec = makeSpec([
      enc({ channel: "x", field: "g", sort: "desc" }),
      enc({ channel: "y", field: "v", aggregate: "sum" }),
    ]);
    const desc = aggregateRowsInMemory(rows, descSpec);
    expect(desc.map((r) => r.y_val)).toEqual([30, 20, 10, null, null]);
  });
});
