/**
 * Comprehensive unit tests for src/features/data-import/model/helpers.tsx
 *
 * Goal: 100% line + branch + function coverage for helpers.tsx.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import {
  formatBytes,
  detectFileType,
  getFileIcon,
  computeQualityScores,
  columnInfoToColMeta,
  StatusStep,
} from "@/features/data-import/model/helpers";
import type { ColumnInfo } from "@/features/data-import/model/types";

// ─── formatBytes ─────────────────────────────────────────────────────────────

describe("formatBytes", () => {
  it("returns '0 B' for zero bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("formats raw bytes under 1 KB", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1)).toBe("1 B");
  });

  it("formats kilobytes", () => {
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  it("formats megabytes", () => {
    expect(formatBytes(1024 * 1024)).toBe("1 MB");
    expect(formatBytes(2.5 * 1024 * 1024)).toBe("2.5 MB");
  });

  it("formats gigabytes", () => {
    expect(formatBytes(5 * 1024 * 1024 * 1024)).toBe("5 GB");
  });
});

// ─── detectFileType ───────────────────────────────────────────────────────────

describe("detectFileType", () => {
  it("detects .csv", () => {
    expect(detectFileType("data.csv")).toBe("csv");
  });

  it("detects .csv case-insensitively", () => {
    expect(detectFileType("DATA.CSV")).toBe("csv");
  });

  it("detects .tsv", () => {
    expect(detectFileType("export.tsv")).toBe("tsv");
  });

  it("detects .parquet", () => {
    expect(detectFileType("bigdata.parquet")).toBe("parquet");
  });

  it("detects .pq as parquet", () => {
    expect(detectFileType("file.pq")).toBe("parquet");
  });

  it("returns unknown for .txt (ambiguous)", () => {
    expect(detectFileType("notes.txt")).toBe("unknown");
  });

  it("returns unknown for files with no extension", () => {
    expect(detectFileType("README")).toBe("unknown");
  });

  it("returns unknown for unsupported extensions", () => {
    expect(detectFileType("archive.zip")).toBe("unknown");
    expect(detectFileType("spreadsheet.xlsx")).toBe("unknown");
  });
});

// ─── getFileIcon ──────────────────────────────────────────────────────────────

describe("getFileIcon", () => {
  it("returns a React element for every FileType value", () => {
    const types = ["csv", "tsv", "parquet", "txt", "unknown"] as const;
    for (const type of types) {
      const element = getFileIcon(type);
      // Must be a valid React element
      expect(element).toBeTruthy();
      expect(typeof element).toBe("object");
      // Render it to confirm it produces DOM output without throwing
      const { container } = render(element);
      expect(container.firstChild).not.toBeNull();
    }
  });
});

// ─── computeQualityScores ─────────────────────────────────────────────────────

describe("computeQualityScores", () => {
  it("returns perfect 100 scores when rowCount is 0", () => {
    expect(computeQualityScores([], 0)).toEqual({
      completeness: 100,
      accuracy: 100,
      consistency: 100,
      uniqueness: 100,
    });
  });

  it("returns perfect 100 scores when columns array is empty (non-zero rowCount)", () => {
    // Early-return branch: columns.length === 0 even with rows
    expect(computeQualityScores([], 100)).toEqual({
      completeness: 100,
      accuracy: 100,
      consistency: 100,
      uniqueness: 100,
    });
  });

  it("uses nullRate (0..1) directly when present on a column", () => {
    // columnNullRate branch: typeof column.nullRate === "number"
    const cols: ColumnInfo[] = [
      {
        name: "a",
        type: "number",
        nullCount: 999, // should be ignored because nullRate is present
        uniqueCount: 10,
        sampleValues: [],
        nullRate: 0.5, // explicit full-table rate
      },
    ];
    const scores = computeQualityScores(cols, 10);
    // completeness = round((1 - 0.5) * 100) = 50
    expect(scores.completeness).toBe(50);
  });

  it("falls back to nullCount / rowCount when nullRate is absent", () => {
    // columnNullRate branch: nullRate is undefined → uses nullCount / rowCount
    const cols: ColumnInfo[] = [
      {
        name: "b",
        type: "string",
        nullCount: 2,
        uniqueCount: 8,
        sampleValues: [],
        // nullRate intentionally omitted
      },
    ];
    const scores = computeQualityScores(cols, 4);
    // nullRate = 2/4 = 0.5 → completeness = round((1 - 0.5) * 100) = 50
    expect(scores.completeness).toBe(50);
  });

  it("clamps nullRate above 1 to 1", () => {
    const cols: ColumnInfo[] = [
      {
        name: "c",
        type: "string",
        nullCount: 0,
        uniqueCount: 0,
        sampleValues: [],
        nullRate: 1.5, // out-of-range: should be clamped to 1
      },
    ];
    const scores = computeQualityScores(cols, 10);
    // clamped to 1 → completeness = round((1 - 1) * 100) = 0
    expect(scores.completeness).toBe(0);
  });

  it("clamps nullRate below 0 to 0", () => {
    const cols: ColumnInfo[] = [
      {
        name: "d",
        type: "string",
        nullCount: 0,
        uniqueCount: 0,
        sampleValues: [],
        nullRate: -0.5, // out-of-range: should be clamped to 0
      },
    ];
    const scores = computeQualityScores(cols, 10);
    // clamped to 0 → completeness = round((1 - 0) * 100) = 100
    expect(scores.completeness).toBe(100);
  });

  it("reflects null cells in completeness using nullCount fallback", () => {
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
    // avg nullRate = (0.5 + 0) / 2 = 0.25 → completeness = round(0.75 * 100) = 75
    expect(scores.completeness).toBe(75);
  });

  it("marks consistency lower when mixed-type columns exist", () => {
    const cols: ColumnInfo[] = [
      { name: "a", type: "mixed", nullCount: 0, uniqueCount: 3, sampleValues: [] },
      { name: "b", type: "string", nullCount: 0, uniqueCount: 3, sampleValues: [] },
    ];
    const scores = computeQualityScores(cols, 3);
    // mixedCols = 1, consistency = round((1 - 1/2) * 100) = 50
    expect(scores.consistency).toBe(50);
  });

  it("marks accuracy 0 when all columns are fully null", () => {
    const cols: ColumnInfo[] = [
      { name: "a", type: "string", nullCount: 5, uniqueCount: 0, sampleValues: [], nullRate: 1 },
    ];
    const scores = computeQualityScores(cols, 5);
    // accuracy = round((0 usable columns / 1 total) * 100) = 0
    expect(scores.accuracy).toBe(0);
  });

  it("computes uniqueness from uniqueCount / rowCount ratio", () => {
    const cols: ColumnInfo[] = [
      { name: "a", type: "string", nullCount: 0, uniqueCount: 5, sampleValues: [] },
    ];
    const scores = computeQualityScores(cols, 10);
    // avgUnique = min(1, 5/10) = 0.5 → uniqueness = 50
    expect(scores.uniqueness).toBe(50);
  });

  it("caps uniqueness at 100 when uniqueCount exceeds rowCount", () => {
    const cols: ColumnInfo[] = [
      { name: "a", type: "string", nullCount: 0, uniqueCount: 20, sampleValues: [] },
    ];
    const scores = computeQualityScores(cols, 10);
    // min(1, 20/10) = 1 → uniqueness = 100
    expect(scores.uniqueness).toBe(100);
  });
});

// ─── columnInfoToColMeta ─────────────────────────────────────────────────────

describe("columnInfoToColMeta", () => {
  it("maps mixed type to string", () => {
    const meta = columnInfoToColMeta([
      {
        name: "col_mixed",
        type: "mixed",
        nullCount: 1,
        uniqueCount: 3,
        sampleValues: [1, 2, 3, 4, 5, 6],
      },
    ]);
    expect(meta[0].type).toBe("string");
    expect(meta[0].name).toBe("col_mixed");
    expect(meta[0].nullCount).toBe(1);
    expect(meta[0].distinctCount).toBe(3);
    expect(meta[0].sample).toHaveLength(5);
  });

  it("maps boolean type to boolean", () => {
    const meta = columnInfoToColMeta([
      {
        name: "col_bool",
        type: "boolean",
        nullCount: 0,
        uniqueCount: 2,
        sampleValues: [true, false],
      },
    ]);
    expect(meta[0].type).toBe("boolean");
  });

  it("maps number type to number", () => {
    const meta = columnInfoToColMeta([
      {
        name: "col_num",
        type: "number",
        nullCount: 0,
        uniqueCount: 10,
        sampleValues: [1, 2, 3],
        min: 1,
        max: 100,
        avg: 42,
      },
    ]);
    expect(meta[0].type).toBe("number");
    expect(meta[0].min).toBe(1);
    expect(meta[0].max).toBe(100);
    expect(meta[0].mean).toBe(42);
  });

  it("maps string type to string", () => {
    const meta = columnInfoToColMeta([
      {
        name: "col_str",
        type: "string",
        nullCount: 0,
        uniqueCount: 5,
        sampleValues: ["a", "b"],
      },
    ]);
    expect(meta[0].type).toBe("string");
  });

  it("maps date type to date", () => {
    const meta = columnInfoToColMeta([
      {
        name: "col_date",
        type: "date",
        nullCount: 0,
        uniqueCount: 3,
        sampleValues: ["2024-01-01"],
      },
    ]);
    expect(meta[0].type).toBe("date");
  });

  it("slices sampleValues to at most 5 entries", () => {
    const meta = columnInfoToColMeta([
      {
        name: "x",
        type: "string",
        nullCount: 0,
        uniqueCount: 10,
        sampleValues: ["a", "b", "c", "d", "e", "f", "g"],
      },
    ]);
    expect(meta[0].sample).toHaveLength(5);
    expect(meta[0].sample).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("returns an empty array for empty input", () => {
    expect(columnInfoToColMeta([])).toEqual([]);
  });

  it("preserves min, max, and avg fields", () => {
    const meta = columnInfoToColMeta([
      {
        name: "price",
        type: "number",
        nullCount: 0,
        uniqueCount: 5,
        sampleValues: [],
        min: 0,
        max: 999,
        avg: 123.45,
      },
    ]);
    expect(meta[0].min).toBe(0);
    expect(meta[0].max).toBe(999);
    expect(meta[0].mean).toBe(123.45);
  });
});

// ─── StatusStep ───────────────────────────────────────────────────────────────

describe("StatusStep component", () => {
  it("renders the label text for every status", () => {
    for (const status of ["pending", "active", "done", "error"] as const) {
      const { getByText, unmount } = render(
        <StatusStep label={`step-${status}`} status={status} />,
      );
      expect(getByText(`step-${status}`)).toBeInTheDocument();
      unmount();
    }
  });

  it("shows duration in ms when status is done and duration is provided", () => {
    const { getByText } = render(<StatusStep label="Upload" status="done" duration={42} />);
    expect(getByText("42ms")).toBeInTheDocument();
  });

  it("does NOT show a duration when status is done and duration is undefined", () => {
    const { queryByText } = render(<StatusStep label="Upload" status="done" />);
    expect(queryByText(/ms$/)).toBeNull();
  });

  it("does NOT show duration when status is active even if duration is provided", () => {
    // Branch: duration !== undefined && status === "done" → false when status !== "done"
    const { queryByText } = render(
      <StatusStep label="Working" status="active" duration={100} />,
    );
    expect(queryByText("100ms")).toBeNull();
  });

  it("does NOT show duration when status is pending even if duration is provided", () => {
    const { queryByText } = render(
      <StatusStep label="Waiting" status="pending" duration={50} />,
    );
    expect(queryByText("50ms")).toBeNull();
  });

  it("does NOT show duration when status is error even if duration is provided", () => {
    const { queryByText } = render(
      <StatusStep label="Failed" status="error" duration={200} />,
    );
    expect(queryByText("200ms")).toBeNull();
  });

  it("renders a Loader2 spinner icon when status is active", () => {
    const { container } = render(<StatusStep label="Loading" status="active" />);
    // The Loader2 icon uses animate-spin class
    expect(container.querySelector(".animate-spin")).not.toBeNull();
  });

  it("renders a Check icon when status is done", () => {
    const { container } = render(<StatusStep label="Done" status="done" />);
    // Lucide Check renders an SVG; confirm something in the status icon div
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThan(0);
  });

  it("renders an X icon when status is error", () => {
    const { container } = render(<StatusStep label="Error" status="error" />);
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThan(0);
  });

  it("renders a small dot span when status is pending (no svg icon)", () => {
    const { container } = render(<StatusStep label="Pending" status="pending" />);
    // pending renders a span dot, not an SVG icon
    const dot = container.querySelector("span.rounded-full");
    expect(dot).not.toBeNull();
  });
});
