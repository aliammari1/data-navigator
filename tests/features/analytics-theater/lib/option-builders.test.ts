import { describe, expect, it } from "vitest";
import {
  buildCalendarOption,
  buildGanttOption,
  buildRaceFinalOption,
  buildSankeyOption,
  buildSunburstOption,
} from "@/features/analytics-theater/lib/option-builders";
import { SERIES_COLORS, seriesColor } from "@/features/analytics-theater/lib/theme";

/**
 * Behavioral test suite for the pure ECharts option builders.
 *
 * These builders take aggregated DuckDB rows (loosely-typed Record objects) and
 * return plain option objects. They are fully pure — no DOM, no IO — so every
 * branch is exercised directly with hand-built rows.
 *
 * Conventions:
 * - asNum() is safeNum(): unwraps typed arrays + BigInt, coerces non-finite → 0.
 * - asStr() trims and maps null/undefined → "".
 */

// ─── Typed accessors into the (intentionally loose) option shape ─────────────

type AnyRec = Record<string, unknown>;

function series(option: AnyRec): AnyRec {
  return (option.series as AnyRec[])[0];
}

const HEATMAP_COLORS = ["#0d1117", "#0e4429", "#006d32", "#26a641", "#39d353"];

// ─── buildCalendarOption ─────────────────────────────────────────────────────

describe("buildCalendarOption", () => {
  it("keeps only points whose date year matches the requested year", () => {
    // Arrange
    const rows = [
      { d: "2024-01-01", v: 10 },
      { d: "2023-12-31", v: 99 }, // wrong year, dropped
      { d: "2024-06-15", v: 20 },
    ];

    // Act
    const { option, min, max } = buildCalendarOption(rows, 2024);

    // Assert
    const data = series(option).data as [string, number][];
    expect(data).toEqual([
      ["2024-01-01", 10],
      ["2024-06-15", 20],
    ]);
    expect(min).toBe(10);
    expect(max).toBe(20);
  });

  it("returns min=0 and max=0 when no rows match the year (Infinity guard)", () => {
    // Arrange
    const rows = [{ d: "2020-01-01", v: 5 }];

    // Act
    const { option, min, max } = buildCalendarOption(rows, 2024);

    // Assert
    expect(min).toBe(0);
    expect(max).toBe(0);
    expect((series(option).data as unknown[]).length).toBe(0);
    // visualMap mirrors the computed min/max.
    const visualMap = option.visualMap as AnyRec;
    expect(visualMap.min).toBe(0);
    expect(visualMap.max).toBe(0);
  });

  it("returns min=0 and max=0 for a completely empty input", () => {
    // Act
    const { min, max, option } = buildCalendarOption([], 2024);

    // Assert
    expect(min).toBe(0);
    expect(max).toBe(0);
    expect((series(option).data as unknown[]).length).toBe(0);
  });

  it("drops rows with an empty / null date (asStr → '' is falsy)", () => {
    // Arrange — null and undefined coerce to "" which fails the truthy filter.
    const rows = [
      { d: null, v: 50 },
      { d: undefined, v: 60 },
      { d: "2024-03-03", v: 7 },
    ];

    // Act
    const { option, min, max } = buildCalendarOption(rows, 2024);

    // Assert
    expect(series(option).data).toEqual([["2024-03-03", 7]]);
    expect(min).toBe(7);
    expect(max).toBe(7);
  });

  it("handles negative and zero values for the visual range", () => {
    // Arrange
    const rows = [
      { d: "2024-01-01", v: -5 },
      { d: "2024-01-02", v: 0 },
      { d: "2024-01-03", v: 3 },
    ];

    // Act
    const { min, max } = buildCalendarOption(rows, 2024);

    // Assert
    expect(min).toBe(-5);
    expect(max).toBe(3);
  });

  it("coerces non-finite measure values to 0 via asNum", () => {
    // Arrange — "abc" → NaN → safeNum → 0.
    const rows = [{ d: "2024-05-05", v: "abc" }];

    // Act
    const { option, min, max } = buildCalendarOption(rows, 2024);

    // Assert
    expect(series(option).data).toEqual([["2024-05-05", 0]]);
    expect(min).toBe(0);
    expect(max).toBe(0);
  });

  it("matches the year against the first 4 chars of the string (not numeric parsing)", () => {
    // Arrange — String(2024).slice(0,4) === "2024"; a number date stringifies first.
    const rows = [
      { d: "2024", v: 1 }, // slice(0,4) === "2024" → kept
      { d: "20240101", v: 2 }, // slice(0,4) === "2024" → kept
    ];

    // Act
    const { option } = buildCalendarOption(rows, 2024);

    // Assert
    expect((series(option).data as unknown[]).length).toBe(2);
  });

  it("uses the configured heatmap palette and dark theme scaffolding", () => {
    // Act
    const { option } = buildCalendarOption([{ d: "2024-01-01", v: 1 }], 2024);

    // Assert
    expect(option.backgroundColor).toBe("transparent");
    const visualMap = option.visualMap as AnyRec;
    expect((visualMap.inRange as AnyRec).color).toEqual(HEATMAP_COLORS);
    const calendar = option.calendar as AnyRec;
    expect(calendar.range).toBe(2024);
    expect(series(option).type).toBe("heatmap");
    expect(series(option).coordinateSystem).toBe("calendar");
  });

  it("tooltip formatter renders the date and a formatted value", () => {
    // Act
    const { option } = buildCalendarOption([{ d: "2024-01-01", v: 1234 }], 2024);
    const tooltip = option.tooltip as { formatter: (p: { data: [string, number] }) => string };
    const html = tooltip.formatter({ data: ["2024-01-01", 1234] });

    // Assert — value is run through fmtN(fr-FR); the date appears verbatim in bold.
    expect(html).toContain("2024-01-01");
    expect(html).toContain("<b>");
    // 1234 → "1<sep>234" in fr-FR; assert the digit groups survive.
    expect(html).toMatch(/1.?234/);
  });
});

// ─── buildSankeyOption ───────────────────────────────────────────────────────

describe("buildSankeyOption", () => {
  it("builds decorated source/target nodes and links and sums the total", () => {
    // Arrange
    const rows = [
      { src: "A", tgt: "X", v: 10 },
      { src: "B", tgt: "Y", v: 5 },
    ];

    // Act
    const { option, total } = buildSankeyOption(rows);
    const s = series(option);

    // Assert
    expect(total).toBe(15);
    expect(s.links).toEqual([
      { source: "▸ A", target: "X ◂", value: 10 },
      { source: "▸ B", target: "Y ◂", value: 5 },
    ]);
    const nodeNames = (s.nodes as AnyRec[]).map((n) => n.name);
    // sources first (insertion order), then targets.
    expect(nodeNames).toEqual(["▸ A", "▸ B", "X ◂", "Y ◂"]);
  });

  it("assigns palette colors sequentially across sources then targets", () => {
    // Arrange
    const rows = [{ src: "A", tgt: "X", v: 1 }];

    // Act
    const { option } = buildSankeyOption(rows);
    const nodes = series(option).nodes as { name: string; itemStyle: { color: string } }[];

    // Assert — first node uses seriesColor(0), second uses seriesColor(1).
    expect(nodes[0].itemStyle.color).toBe(seriesColor(0));
    expect(nodes[1].itemStyle.color).toBe(seriesColor(1));
  });

  it("skips rows with missing source, missing target, or non-positive value", () => {
    // Arrange
    const rows = [
      { src: "", tgt: "X", v: 5 }, // empty source
      { src: "A", tgt: null, v: 5 }, // null target → ""
      { src: "A", tgt: "X", v: 0 }, // v <= 0
      { src: "A", tgt: "X", v: -3 }, // v <= 0
      { src: "A", tgt: "X", v: 8 }, // kept
    ];

    // Act
    const { option, total } = buildSankeyOption(rows);

    // Assert
    expect(total).toBe(8);
    expect(series(option).links).toEqual([{ source: "▸ A", target: "X ◂", value: 8 }]);
  });

  it("deduplicates repeated source/target names into a single node each", () => {
    // Arrange — A and X appear twice; nodes must be unique (Set semantics).
    const rows = [
      { src: "A", tgt: "X", v: 1 },
      { src: "A", tgt: "X", v: 2 },
    ];

    // Act
    const { option } = buildSankeyOption(rows);
    const s = series(option);

    // Assert — 2 links retained, but only 1 source node + 1 target node.
    expect((s.links as unknown[]).length).toBe(2);
    expect((s.nodes as unknown[]).length).toBe(2);
  });

  it("returns an empty graph and total=0 for empty input", () => {
    // Act
    const { option, total } = buildSankeyOption([]);
    const s = series(option);

    // Assert
    expect(total).toBe(0);
    expect(s.nodes).toEqual([]);
    expect(s.links).toEqual([]);
    expect(s.type).toBe("sankey");
  });

  it("coerces a typed-array measure cell to its first element (DuckDB WASM shape)", () => {
    // Arrange — DuckDB WASM can hand back a typed array for an aggregate.
    const rows = [{ src: "A", tgt: "X", v: new Float64Array([42]) }];

    // Act
    const { total, option } = buildSankeyOption(rows);

    // Assert
    expect(total).toBe(42);
    expect((series(option).links as AnyRec[])[0].value).toBe(42);
  });
});

// ─── buildGanttOption ────────────────────────────────────────────────────────

describe("buildGanttOption", () => {
  it("maps each row to [hour, categoryIndex, value] and reports the row count", () => {
    // Arrange
    const rows = [
      { cat: "Alpha", hour: 9, v: 4 },
      { cat: "Beta", hour: 10, v: 7 },
      { cat: "Alpha", hour: 11, v: 2 }, // reuse category index 0
    ];

    // Act
    const { option, rowCount } = buildGanttOption(rows);

    // Assert
    expect(rowCount).toBe(2);
    expect(series(option).data).toEqual([
      [9, 0, 4],
      [10, 1, 7],
      [11, 0, 2],
    ]);
    expect((option.yAxis as AnyRec).data).toEqual(["Alpha", "Beta"]);
  });

  it("truncates fractional hours toward zero", () => {
    // Arrange
    const rows = [{ cat: "A", hour: 9.99, v: 1 }];

    // Act
    const { option } = buildGanttOption(rows);

    // Assert — Math.trunc(9.99) === 9.
    expect((series(option).data as number[][])[0][0]).toBe(9);
  });

  it("rejects hours outside the 0..23 range (boundaries inclusive)", () => {
    // Arrange
    const rows = [
      { cat: "A", hour: -1, v: 1 }, // below range
      { cat: "A", hour: 24, v: 1 }, // above range
      { cat: "A", hour: 0, v: 1 }, // boundary kept
      { cat: "A", hour: 23, v: 1 }, // boundary kept
    ];

    // Act
    const { option } = buildGanttOption(rows);

    // Assert
    const data = series(option).data as number[][];
    expect(data.map((d) => d[0])).toEqual([0, 23]);
  });

  it("drops rows with an empty category", () => {
    // Arrange
    const rows = [
      { cat: "", hour: 5, v: 9 },
      { cat: null, hour: 6, v: 9 },
      { cat: "Real", hour: 7, v: 3 },
    ];

    // Act
    const { option, rowCount } = buildGanttOption(rows);

    // Assert
    expect(rowCount).toBe(1);
    expect(series(option).data).toEqual([[7, 0, 3]]);
  });

  it("sets visualMap.max to the largest value seen", () => {
    // Arrange
    const rows = [
      { cat: "A", hour: 1, v: 3 },
      { cat: "A", hour: 2, v: 17 },
      { cat: "A", hour: 3, v: 8 },
    ];

    // Act
    const { option } = buildGanttOption(rows);

    // Assert
    expect((option.visualMap as AnyRec).max).toBe(17);
  });

  it("falls back to visualMap.max=1 when max is 0 (avoids a zero-range scale)", () => {
    // Arrange — all values 0 → running max stays 0 → `max || 1`.
    const rows = [{ cat: "A", hour: 1, v: 0 }];

    // Act
    const { option } = buildGanttOption(rows);

    // Assert
    expect((option.visualMap as AnyRec).max).toBe(1);
  });

  it("uses max=1 for empty input and produces a 24-hour x-axis", () => {
    // Act
    const { option, rowCount } = buildGanttOption([]);

    // Assert
    expect(rowCount).toBe(0);
    expect((option.visualMap as AnyRec).max).toBe(1);
    const xData = (option.xAxis as AnyRec).data as string[];
    expect(xData.length).toBe(24);
    expect(xData[0]).toBe("00:00");
    expect(xData[23]).toBe("23:00");
  });

  it("preserves first-seen category ordering even when rows arrive interleaved", () => {
    // Arrange
    const rows = [
      { cat: "Zulu", hour: 1, v: 1 },
      { cat: "Alpha", hour: 2, v: 1 },
      { cat: "Zulu", hour: 3, v: 1 },
    ];

    // Act
    const { option } = buildGanttOption(rows);

    // Assert — Zulu seen first → index 0, Alpha → index 1.
    expect((option.yAxis as AnyRec).data).toEqual(["Zulu", "Alpha"]);
    expect(series(option).data).toEqual([
      [1, 0, 1],
      [2, 1, 1],
      [3, 0, 1],
    ]);
  });
});

// ─── buildRaceFinalOption ────────────────────────────────────────────────────

describe("buildRaceFinalOption", () => {
  it("aggregates values per category and sorts ascending by total", () => {
    // Arrange
    const rows = [
      { cat: "A", v: 5 },
      { cat: "B", v: 10 },
      { cat: "A", v: 5 }, // A totals 10
      { cat: "C", v: 1 },
    ];

    // Act
    const option = buildRaceFinalOption(rows);

    // Assert — ascending: C(1), then A(10)/B(10) tie keeping insertion order.
    const yData = (option.yAxis as AnyRec).data as string[];
    expect(yData[0]).toBe("C");
    const values = (series(option).data as { value: number }[]).map((d) => d.value);
    expect(values).toEqual([1, 10, 10]);
  });

  it("keeps the y-axis category order in lockstep with the sorted bar data", () => {
    // Arrange
    const rows = [
      { cat: "High", v: 100 },
      { cat: "Low", v: 1 },
      { cat: "Mid", v: 50 },
    ];

    // Act
    const option = buildRaceFinalOption(rows);

    // Assert
    expect((option.yAxis as AnyRec).data).toEqual(["Low", "Mid", "High"]);
    expect((series(option).data as { value: number }[]).map((d) => d.value)).toEqual([1, 50, 100]);
  });

  it("assigns sequential palette colors by sorted position", () => {
    // Arrange
    const rows = [
      { cat: "Big", v: 100 },
      { cat: "Small", v: 1 },
    ];

    // Act
    const option = buildRaceFinalOption(rows);
    const bars = series(option).data as { itemStyle: { color: string; borderRadius: number[] } }[];

    // Assert — index 0 is the smallest (Small), index 1 the largest (Big).
    expect(bars[0].itemStyle.color).toBe(seriesColor(0));
    expect(bars[1].itemStyle.color).toBe(seriesColor(1));
    expect(bars[0].itemStyle.borderRadius).toEqual([0, 6, 6, 0]);
  });

  it("skips rows with an empty category", () => {
    // Arrange
    const rows = [
      { cat: "", v: 999 },
      { cat: null, v: 999 },
      { cat: "Kept", v: 4 },
    ];

    // Act
    const option = buildRaceFinalOption(rows);

    // Assert
    expect((option.yAxis as AnyRec).data).toEqual(["Kept"]);
    expect((series(option).data as { value: number }[])[0].value).toBe(4);
  });

  it("returns empty axis/series for empty input", () => {
    // Act
    const option = buildRaceFinalOption([]);

    // Assert
    expect((option.yAxis as AnyRec).data).toEqual([]);
    expect(series(option).data).toEqual([]);
  });

  it("treats a missing v as 0 (asNum(undefined) → 0) and still records the category", () => {
    // Arrange
    const rows = [{ cat: "Solo" }];

    // Act
    const option = buildRaceFinalOption(rows);

    // Assert
    expect((option.yAxis as AnyRec).data).toEqual(["Solo"]);
    expect((series(option).data as { value: number }[])[0].value).toBe(0);
  });

  it("sums negative contributions correctly", () => {
    // Arrange
    const rows = [
      { cat: "Net", v: 10 },
      { cat: "Net", v: -4 },
    ];

    // Act
    const option = buildRaceFinalOption(rows);

    // Assert
    expect((series(option).data as { value: number }[])[0].value).toBe(6);
  });

  it("formats axis + label values through fmtCompact (fr-FR compact)", () => {
    // Act
    const option = buildRaceFinalOption([{ cat: "A", v: 1500000 }]);
    const xAxis = option.xAxis as { axisLabel: { formatter: (v: number) => string } };
    const label = series(option).label as { formatter: (p: { value: number }) => string };

    // Assert — 1.5M in fr-FR compact renders with an "M" suffix.
    expect(xAxis.axisLabel.formatter(1500000)).toContain("M");
    expect(label.formatter({ value: 1500000 })).toContain("M");
  });
});

// ─── buildSunburstOption ─────────────────────────────────────────────────────

describe("buildSunburstOption", () => {
  it("builds a two-level hierarchy sorted by L1 total descending", () => {
    // Arrange
    const rows = [
      { l1: "Cat1", l2: "Sub1", v: 3 },
      { l1: "Cat1", l2: "Sub2", v: 4 }, // Cat1 total 7
      { l1: "Cat2", l2: "SubA", v: 20 }, // Cat2 total 20
    ];

    // Act
    const option = buildSunburstOption(rows);
    const tree = series(option).data as AnyRec[];

    // Assert — Cat2 (20) before Cat1 (7).
    expect(tree.map((n) => n.name)).toEqual(["Cat2", "Cat1"]);
    const cat1 = tree[1];
    const children = cat1.children as { name: string; value: number }[];
    // Children sorted descending: Sub2(4) before Sub1(3).
    expect(children.map((c) => c.name)).toEqual(["Sub2", "Sub1"]);
    expect(children.map((c) => c.value)).toEqual([4, 3]);
  });

  it("uses a leaf value (not children) when no L2 is present", () => {
    // Arrange — only L1, so each node carries `value` and no `children`.
    const rows = [
      { l1: "Solo", l2: null, v: 9 },
      { l1: "Solo", l2: "", v: 6 }, // empty l2 also excluded from children
    ];

    // Act
    const option = buildSunburstOption(rows);
    const node = (series(option).data as AnyRec[])[0];

    // Assert — l1Total = 9 + 6 = 15; no children branch.
    expect(node.name).toBe("Solo");
    expect(node.value).toBe(15);
    expect(node.children).toBeUndefined();
  });

  it("excludes the literal string 'null' as an L2 child", () => {
    // Arrange — DuckDB sometimes stringifies NULL to "null"; that must not nest.
    const rows = [
      { l1: "Cat", l2: "null", v: 5 },
      { l1: "Cat", l2: "Valid", v: 8 },
    ];

    // Act
    const option = buildSunburstOption(rows);
    const node = (series(option).data as AnyRec[])[0];
    const children = node.children as { name: string }[];

    // Assert — only "Valid" becomes a child.
    expect(children.map((c) => c.name)).toEqual(["Valid"]);
    expect(node.value).toBeUndefined(); // children present → value omitted
  });

  it("aggregates repeated L2 values within the same L1", () => {
    // Arrange
    const rows = [
      { l1: "C", l2: "S", v: 2 },
      { l1: "C", l2: "S", v: 3 }, // same sub → summed to 5
    ];

    // Act
    const option = buildSunburstOption(rows);
    const children = (series(option).data as AnyRec[])[0].children as { value: number }[];

    // Assert
    expect(children).toHaveLength(1);
    expect(children[0].value).toBe(5);
  });

  it("skips rows with empty L1 or non-positive value", () => {
    // Arrange
    const rows = [
      { l1: "", l2: "S", v: 5 }, // empty l1
      { l1: "C", l2: "S", v: 0 }, // v <= 0
      { l1: "C", l2: "S", v: -1 }, // v <= 0
      { l1: "Keep", l2: "S", v: 4 }, // kept
    ];

    // Act
    const option = buildSunburstOption(rows);
    const tree = series(option).data as AnyRec[];

    // Assert
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe("Keep");
  });

  it("returns an empty data array for empty input", () => {
    // Act
    const option = buildSunburstOption([]);

    // Assert
    expect(series(option).data).toEqual([]);
    expect(series(option).type).toBe("sunburst");
  });

  it("gives an L1 node and all its children the same palette color", () => {
    // Arrange
    const rows = [
      { l1: "A", l2: "x", v: 5 },
      { l1: "A", l2: "y", v: 3 },
      { l1: "B", l2: "z", v: 9 },
    ];

    // Act
    const option = buildSunburstOption(rows);
    const tree = series(option).data as {
      name: string;
      itemStyle: { color: string };
      children?: { itemStyle: { color: string } }[];
    }[];

    // Assert — B(9) sorts first → seriesColor(0); A(8) second → seriesColor(1).
    const bNode = tree[0];
    const aNode = tree[1];
    expect(bNode.itemStyle.color).toBe(seriesColor(0));
    expect(aNode.itemStyle.color).toBe(seriesColor(1));
    // Every child of A shares A's color (index 1).
    for (const child of aNode.children ?? []) {
      expect(child.itemStyle.color).toBe(seriesColor(1));
    }
  });

  it("treats an L1 with only excluded L2 cells as a leaf (children empty → value)", () => {
    // Arrange — both L2 cells are excluded ("null" + ""), so inner map size 0.
    const rows = [
      { l1: "Lone", l2: "null", v: 4 },
      { l1: "Lone", l2: "", v: 6 },
    ];

    // Act
    const option = buildSunburstOption(rows);
    const node = (series(option).data as AnyRec[])[0];

    // Assert — inner.size === 0 → falls into the leaf-value branch.
    expect(node.children).toBeUndefined();
    expect(node.value).toBe(10);
  });
});

// ─── Cross-cutting sanity on the shared palette helper ───────────────────────

describe("seriesColor palette wrap (used by every builder)", () => {
  it("wraps indices modulo the palette length", () => {
    // Arrange / Act / Assert
    expect(seriesColor(0)).toBe(SERIES_COLORS[0]);
    expect(seriesColor(SERIES_COLORS.length)).toBe(SERIES_COLORS[0]);
    expect(seriesColor(SERIES_COLORS.length + 2)).toBe(SERIES_COLORS[2]);
  });
});
