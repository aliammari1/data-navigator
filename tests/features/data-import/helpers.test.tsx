import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import "vitest-axe/extend-expect";
import type { AxeMatchers } from "vitest-axe/matchers";

// vitest-axe ships its matcher augmentation against the legacy `Vi.Assertion`
// namespace; vitest 4 surfaces the active `Assertion` interface from the
// `vitest` module, so register `toHaveNoViolations` there too.
declare module "vitest" {
  // Must mirror vitest's own `interface Assertion<T = any>` signature exactly,
  // otherwise TS2428 ("declarations must have identical type parameters").
  // biome-ignore lint/suspicious/noExplicitAny: matches vitest's Assertion<T = any>
  interface Assertion<T = any> extends AxeMatchers {}
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}

import {
  columnInfoToColMeta,
  computeQualityScores,
  detectFileType,
  formatBytes,
  StatusStep,
} from "@/features/data-import/model/helpers";
import type { ColumnInfo } from "@/features/data-import/model/types";
import { render } from "../../test-utils";

describe("formatBytes", () => {
  it("returns '0 B' for zero", () => {
    expect(formatBytes(0)).toBe("0 B");
  });
  it("formats bytes, KB, MB and GB", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1024 * 1024)).toBe("1 MB");
    expect(formatBytes(5 * 1024 * 1024 * 1024)).toBe("5 GB");
  });
  it("rounds to two decimals", () => {
    expect(formatBytes(1536)).toBe("1.5 KB");
  });
});

describe("detectFileType", () => {
  it("detects csv regardless of case", () => {
    expect(detectFileType("data.csv")).toBe("csv");
    expect(detectFileType("DATA.CSV")).toBe("csv");
  });
  it("falls back to unknown for other extensions / no extension", () => {
    expect(detectFileType("notes.txt")).toBe("unknown");
    expect(detectFileType("README")).toBe("unknown");
  });
});

describe("computeQualityScores", () => {
  it("returns perfect scores for an empty dataset", () => {
    expect(computeQualityScores([], 0)).toEqual({
      completeness: 100,
      accuracy: 100,
      consistency: 100,
      uniqueness: 100,
    });
  });
  it("reflects null cells in completeness", () => {
    const cols: ColumnInfo[] = [
      {
        name: "a",
        type: "number",
        nullCount: 2,
        uniqueCount: 2,
        sampleValues: [1, 2],
      },
      {
        name: "b",
        type: "string",
        nullCount: 0,
        uniqueCount: 4,
        sampleValues: ["x", "y", "z", "w"],
      },
    ];
    const scores = computeQualityScores(cols, 4);
    expect(scores.completeness).toBe(75); // 6 of 8 cells present
    expect(scores.completeness).toBeGreaterThanOrEqual(0);
    expect(scores.completeness).toBeLessThanOrEqual(100);
  });
});

describe("columnInfoToColMeta", () => {
  it("maps fields and downgrades mixed → string", () => {
    const meta = columnInfoToColMeta([
      {
        name: "c",
        type: "mixed",
        nullCount: 1,
        uniqueCount: 3,
        sampleValues: [1, 2, 3, 4, 5, 6],
      },
    ]);
    expect(meta[0].type).toBe("string");
    expect(meta[0].distinctCount).toBe(3);
    expect(meta[0].sample).toHaveLength(5);
  });
});

describe("StatusStep (render + a11y)", () => {
  it("renders the label and a duration when done", () => {
    const { getByText } = render(<StatusStep label="Parsing" status="done" duration={42} />);
    expect(getByText("Parsing")).toBeInTheDocument();
    expect(getByText("42ms")).toBeInTheDocument();
  });
  it("has no detectable accessibility violations across states", async () => {
    for (const status of ["pending", "active", "done", "error"] as const) {
      const { container, unmount } = render(
        <StatusStep label={`Step ${status}`} status={status} />,
      );
      expect(await axe(container)).toHaveNoViolations();
      unmount();
    }
  });
});
