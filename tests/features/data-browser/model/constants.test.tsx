import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import React from "react";
import { render } from "@testing-library/react";
import {
  PAGE_SIZES,
  OPERATOR_LABELS,
  TYPE_ICON,
  TYPE_COLORS,
} from "@/features/data-browser/model/constants";
import { buildWhereClause } from "@/features/data-browser/model/helpers";
import type { ColType, FilterGroup, FilterRule } from "@/features/data-browser/model/types";

// ─── PAGE_SIZES ──────────────────────────────────────────────────────────────
//
// The exact page-size options are a one-time UI decision with no independent
// source of truth — asserting them against a copy-pasted `[25, 50, 100, 250,
// 500]` literal (as this file used to) could never catch a wrong value, only
// an accidental future edit (and only if the edit forgot to "helpfully"
// update this test to match). Instead this checks structural properties a
// bad edit could actually violate, plus a real cross-file invariant: the
// table screen's own default page size must be one of the options it offers.

describe("PAGE_SIZES", () => {
  it("is an array of five positive integers in strictly ascending order", () => {
    expect(Array.isArray(PAGE_SIZES)).toBe(true);
    expect(PAGE_SIZES).toHaveLength(5);
    for (const size of PAGE_SIZES) {
      expect(Number.isInteger(size)).toBe(true);
      expect(size).toBeGreaterThan(0);
    }
    for (let i = 1; i < PAGE_SIZES.length; i++) {
      expect(PAGE_SIZES[i]).toBeGreaterThan(PAGE_SIZES[i - 1]);
    }
  });

  it("every page size is a whole multiple of the smallest one (a consistent step, not an arbitrary jump)", () => {
    const [smallest, ...rest] = PAGE_SIZES;
    for (const size of rest) {
      expect(size % smallest).toBe(0);
    }
  });

  it("includes the table screen's own default page size as a selectable option", () => {
    // Independent cross-check: DataBrowserScreen seeds its pagination state
    // with a hardcoded default (`useState(50)`, read directly from that
    // file's source rather than duplicated here). If that default were ever
    // changed to a value absent from PAGE_SIZES, the page-size dropdown would
    // render with a selected value that isn't one of its own options.
    const screenSource = fs.readFileSync(
      path.resolve(process.cwd(), "src/features/data-browser/screens/DataBrowserScreen.tsx"),
      "utf-8",
    );
    const match = screenSource.match(/const \[pageSize, setPageSize] = useState\((\d+)\)/);
    expect(match).not.toBeNull();
    const defaultPageSize = Number(match?.[1]);
    expect(PAGE_SIZES).toContain(defaultPageSize);
  });
});

// ─── OPERATOR_LABELS ─────────────────────────────────────────────────────────
//
// The old "maps X to 'Y'" assertions here just copied each label straight out
// of constants.ts — they could never catch a wrong label, only an accidental
// future edit. helpers.ts's buildWhereClause is an independent authority: it
// implements what each operator ACTUALLY does when compiled to SQL. The
// tests below cross-check each label's claimed meaning (negation, comparison
// direction, wildcard placement, single- vs multi-value) against that real
// behavior, so a mislabeled or swapped operator would fail here even though
// it's invisible to a test that just mirrors the string back.

describe("OPERATOR_LABELS", () => {
  const operators: Array<FilterRule["operator"]> = [
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "contains",
    "not_contains",
    "starts_with",
    "ends_with",
    "is_null",
    "is_not_null",
    "in",
    "between",
  ];

  function clauseFor(operator: FilterRule["operator"], value = "5", value2?: string): string {
    const rule: FilterRule = {
      id: "r1",
      column: "col",
      operator,
      value,
      value2,
      active: true,
    };
    const group: FilterGroup = { id: "g1", logic: "AND", rules: [rule], name: "", saved: false };
    return buildWhereClause(group);
  }

  it("has a non-empty label for every operator", () => {
    for (const op of operators) {
      expect(typeof OPERATOR_LABELS[op]).toBe("string");
      expect(OPERATOR_LABELS[op].length).toBeGreaterThan(0);
    }
  });

  it("has exactly one label per FilterRule operator (no missing or extra keys)", () => {
    expect(Object.keys(OPERATOR_LABELS).sort()).toEqual([...operators].sort());
  });

  it("has no duplicate labels across different operators", () => {
    const labels = operators.map((op) => OPERATOR_LABELS[op]);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("labels that read as a negation ('not equals', 'not contains', 'is not null') correspond to operators whose real generated SQL is actually negated", () => {
    for (const op of operators) {
      const label = OPERATOR_LABELS[op];
      const labelIsNegated = /\bnot\b/i.test(label);
      const clauseIsNegated = /!=|NOT LIKE|IS NOT NULL/.test(clauseFor(op));
      expect(clauseIsNegated).toBe(labelIsNegated);
    }
  });

  it("'greater than' / '≥' / 'less than' / '≤' labels match the actual comparison direction the query builder emits", () => {
    expect(OPERATOR_LABELS.gt).not.toBe(OPERATOR_LABELS.lt);
    expect(clauseFor("gt", "5")).toBe('"col" > 5');
    expect(clauseFor("gte", "5")).toBe('"col" >= 5');
    expect(clauseFor("lt", "5")).toBe('"col" < 5');
    expect(clauseFor("lte", "5")).toBe('"col" <= 5');
  });

  it("'contains' / 'not contains' wrap the value on both sides, distinct from 'starts with' / 'ends with'", () => {
    expect(clauseFor("contains", "abc")).toBe(`"col" LIKE '%abc%'`);
    expect(clauseFor("not_contains", "abc")).toBe(`"col" NOT LIKE '%abc%'`);
    expect(clauseFor("starts_with", "abc")).toBe(`"col" LIKE 'abc%'`);
    expect(clauseFor("ends_with", "abc")).toBe(`"col" LIKE '%abc'`);
  });

  it("'in list' and 'between' map to genuinely multi-value SQL (IN list / BETWEEN range), not a single-value comparison", () => {
    expect(clauseFor("in", "1,2,3")).toBe(`"col" IN ('1', '2', '3')`);
    expect(clauseFor("between", "1", "10")).toBe(`"col" BETWEEN 1 AND 10`);
  });

  it("'is null' / 'is not null' map to IS NULL / IS NOT NULL with no value comparison", () => {
    expect(clauseFor("is_null")).toBe(`"col" IS NULL`);
    expect(clauseFor("is_not_null")).toBe(`"col" IS NOT NULL`);
  });
});

// ─── TYPE_ICON ───────────────────────────────────────────────────────────────

describe("TYPE_ICON", () => {
  const colTypes: ColType[] = ["string", "number", "date", "boolean", "email", "url"];

  it("has a React node for every ColType", () => {
    for (const type of colTypes) {
      expect(TYPE_ICON[type]).toBeDefined();
      expect(React.isValidElement(TYPE_ICON[type])).toBe(true);
    }
  });

  it("has exactly 6 ColType entries", () => {
    expect(Object.keys(TYPE_ICON)).toHaveLength(6);
  });

  it("renders the string icon without throwing", () => {
    const { container } = render(<>{TYPE_ICON.string}</>);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders the number icon without throwing", () => {
    const { container } = render(<>{TYPE_ICON.number}</>);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders the date icon without throwing", () => {
    const { container } = render(<>{TYPE_ICON.date}</>);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders the boolean icon without throwing", () => {
    const { container } = render(<>{TYPE_ICON.boolean}</>);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders the email icon without throwing", () => {
    const { container } = render(<>{TYPE_ICON.email}</>);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders the url icon without throwing", () => {
    const { container } = render(<>{TYPE_ICON.url}</>);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("each icon has h-3 w-3 class applied", () => {
    for (const type of colTypes) {
      const { container } = render(<>{TYPE_ICON[type]}</>);
      const svg = container.querySelector("svg");
      expect(svg).toBeTruthy();
      expect(svg?.classList.contains("h-3") || svg?.getAttribute("class")?.includes("h-3")).toBe(
        true,
      );
    }
  });
});

// ─── TYPE_COLORS ─────────────────────────────────────────────────────────────
//
// Each ColType's swatch is a one-time design decision (which Tailwind color
// reads as "string" vs "number" vs "date" etc.) with no independent source of
// truth for the exact shade — asserting each mapping against a copy-pasted
// literal (as this file used to) could never catch the color being wrong,
// only an accidental future edit. Instead this checks structural properties
// a bad edit could actually violate: every value is a real Tailwind palette
// family + standard shade step (not a typo'd or invented class), every type
// gets a visually distinct color from every other type, and TYPE_COLORS
// covers exactly the same set of types as TYPE_ICON.

describe("TYPE_COLORS", () => {
  const colTypes: ColType[] = ["string", "number", "date", "boolean", "email", "url"];

  // Tailwind CSS's documented default color palette (core families shared
  // across v3/v4) and its standard shade scale — an independent reference,
  // not derived from constants.ts.
  const TAILWIND_COLOR_FAMILIES = new Set([
    "slate",
    "gray",
    "zinc",
    "neutral",
    "stone",
    "red",
    "orange",
    "amber",
    "yellow",
    "lime",
    "green",
    "emerald",
    "teal",
    "cyan",
    "sky",
    "blue",
    "indigo",
    "violet",
    "purple",
    "fuchsia",
    "pink",
    "rose",
  ]);
  const TAILWIND_SHADE_STEPS = new Set([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]);

  it("has a color string for every ColType", () => {
    for (const type of colTypes) {
      expect(typeof TYPE_COLORS[type]).toBe("string");
      expect(TYPE_COLORS[type].length).toBeGreaterThan(0);
    }
  });

  it("covers exactly the same set of ColTypes as TYPE_ICON (no type has an icon but no color, or vice versa)", () => {
    expect(Object.keys(TYPE_COLORS).sort()).toEqual(Object.keys(TYPE_ICON).sort());
  });

  it("uses a real Tailwind palette family and a standard shade step, not an invented class", () => {
    for (const type of colTypes) {
      const match = TYPE_COLORS[type].match(/^text-([a-z]+)-(\d+)$/);
      expect(match).not.toBeNull();
      const [, family, shade] = match as RegExpMatchArray;
      expect(TAILWIND_COLOR_FAMILIES.has(family)).toBe(true);
      expect(TAILWIND_SHADE_STEPS.has(Number(shade))).toBe(true);
    }
  });

  it("assigns a visually distinct color to every ColType (no two types share the same swatch)", () => {
    const colors = colTypes.map((type) => TYPE_COLORS[type]);
    expect(new Set(colors).size).toBe(colors.length);
  });
});
