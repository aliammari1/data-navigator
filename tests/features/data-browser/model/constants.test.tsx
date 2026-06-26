import { describe, expect, it } from "vitest";
import React from "react";
import { render } from "@testing-library/react";
import {
  PAGE_SIZES,
  OPERATOR_LABELS,
  TYPE_ICON,
  TYPE_COLORS,
} from "@/features/data-browser/model/constants";
import type { ColType, FilterRule } from "@/features/data-browser/model/types";

// ─── PAGE_SIZES ──────────────────────────────────────────────────────────────

describe("PAGE_SIZES", () => {
  it("is an array of five positive integers in ascending order", () => {
    expect(Array.isArray(PAGE_SIZES)).toBe(true);
    expect(PAGE_SIZES).toHaveLength(5);
    for (let i = 1; i < PAGE_SIZES.length; i++) {
      expect(PAGE_SIZES[i]).toBeGreaterThan(PAGE_SIZES[i - 1]);
    }
  });

  it("contains the expected values [25, 50, 100, 250, 500]", () => {
    expect(PAGE_SIZES).toEqual([25, 50, 100, 250, 500]);
  });
});

// ─── OPERATOR_LABELS ─────────────────────────────────────────────────────────

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

  it("has a label for every operator", () => {
    for (const op of operators) {
      expect(typeof OPERATOR_LABELS[op]).toBe("string");
      expect(OPERATOR_LABELS[op].length).toBeGreaterThan(0);
    }
  });

  it("maps eq to 'equals'", () => {
    expect(OPERATOR_LABELS.eq).toBe("equals");
  });

  it("maps neq to 'not equals'", () => {
    expect(OPERATOR_LABELS.neq).toBe("not equals");
  });

  it("maps gt to 'greater than'", () => {
    expect(OPERATOR_LABELS.gt).toBe("greater than");
  });

  it("maps gte to '≥'", () => {
    expect(OPERATOR_LABELS.gte).toBe("≥");
  });

  it("maps lt to 'less than'", () => {
    expect(OPERATOR_LABELS.lt).toBe("less than");
  });

  it("maps lte to '≤'", () => {
    expect(OPERATOR_LABELS.lte).toBe("≤");
  });

  it("maps contains to 'contains'", () => {
    expect(OPERATOR_LABELS.contains).toBe("contains");
  });

  it("maps not_contains to 'not contains'", () => {
    expect(OPERATOR_LABELS.not_contains).toBe("not contains");
  });

  it("maps starts_with to 'starts with'", () => {
    expect(OPERATOR_LABELS.starts_with).toBe("starts with");
  });

  it("maps ends_with to 'ends with'", () => {
    expect(OPERATOR_LABELS.ends_with).toBe("ends with");
  });

  it("maps is_null to 'is null'", () => {
    expect(OPERATOR_LABELS.is_null).toBe("is null");
  });

  it("maps is_not_null to 'is not null'", () => {
    expect(OPERATOR_LABELS.is_not_null).toBe("is not null");
  });

  it("maps in to 'in list'", () => {
    expect(OPERATOR_LABELS.in).toBe("in list");
  });

  it("maps between to 'between'", () => {
    expect(OPERATOR_LABELS.between).toBe("between");
  });

  it("has exactly 14 operator entries", () => {
    expect(Object.keys(OPERATOR_LABELS)).toHaveLength(14);
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

describe("TYPE_COLORS", () => {
  const colTypes: ColType[] = ["string", "number", "date", "boolean", "email", "url"];

  it("has a color string for every ColType", () => {
    for (const type of colTypes) {
      expect(typeof TYPE_COLORS[type]).toBe("string");
      expect(TYPE_COLORS[type].length).toBeGreaterThan(0);
    }
  });

  it("has exactly 6 ColType entries", () => {
    expect(Object.keys(TYPE_COLORS)).toHaveLength(6);
  });

  it("maps string to text-blue-400", () => {
    expect(TYPE_COLORS.string).toBe("text-blue-400");
  });

  it("maps number to text-emerald-400", () => {
    expect(TYPE_COLORS.number).toBe("text-emerald-400");
  });

  it("maps date to text-purple-400", () => {
    expect(TYPE_COLORS.date).toBe("text-purple-400");
  });

  it("maps boolean to text-amber-400", () => {
    expect(TYPE_COLORS.boolean).toBe("text-amber-400");
  });

  it("maps email to text-pink-400", () => {
    expect(TYPE_COLORS.email).toBe("text-pink-400");
  });

  it("maps url to text-cyan-400", () => {
    expect(TYPE_COLORS.url).toBe("text-cyan-400");
  });

  it("all color values are Tailwind text-* class strings", () => {
    for (const type of colTypes) {
      expect(TYPE_COLORS[type]).toMatch(/^text-\w+-\d+$/);
    }
  });
});
