import { describe, it, expect, vi } from "vitest";
import { parseCSV } from "@/platform/parsers/file-parsers/csv-parser";

// ---------------------------------------------------------------------------
// papaparse mock
//
// `parseCSV` calls `Papa.parse<Record<string, string>>(content)` and uses
// `result.data`. We control what parse() returns via the mock.
// ---------------------------------------------------------------------------

vi.mock("papaparse", () => {
  return {
    default: {
      parse: vi.fn(),
    },
  };
});

import Papa from "papaparse";
const mockParse = vi.mocked(Papa.parse);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("parseCSV", () => {
  // -------------------------------------------------------------------------
  // Branch: rows.length > 0 === false → columns = []
  // -------------------------------------------------------------------------

  it("returns empty columns when parsed data has no rows", () => {
    mockParse.mockReturnValue({ data: [] } as ReturnType<typeof Papa.parse>);

    const result = parseCSV("");

    expect(result.columns).toEqual([]);
    expect(result.rows).toEqual([]);
    expect(result.fileId).toBe("");
    expect(typeof result.id).toBe("string");
  });

  it("returns empty columns when all rows are empty (all values are empty strings)", () => {
    // The filter removes rows where Object.values(row).every(v => v === "")
    // — i.e., rows with no non-empty values are filtered out.
    mockParse.mockReturnValue({
      data: [{ col1: "", col2: "" }],
    } as ReturnType<typeof Papa.parse>);

    const result = parseCSV("col1,col2\n,");

    // The one row gets filtered because all values are "".
    expect(result.columns).toEqual([]);
    expect(result.rows).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Branch: rows.length > 0 === true → columns = Object.keys(rows[0])
  // -------------------------------------------------------------------------

  it("returns correct columns and rows for a single non-empty data row", () => {
    mockParse.mockReturnValue({
      data: [{ Name: "Alice", Age: "30" }],
    } as ReturnType<typeof Papa.parse>);

    const result = parseCSV("Name,Age\nAlice,30");

    expect(result.columns).toEqual(["Name", "Age"]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual({ Name: "Alice", Age: "30" });
    expect(result.fileId).toBe("");
  });

  it("returns correct columns and rows for multiple non-empty data rows", () => {
    mockParse.mockReturnValue({
      data: [
        { A: "1", B: "2" },
        { A: "3", B: "4" },
      ],
    } as ReturnType<typeof Papa.parse>);

    const result = parseCSV("A,B\n1,2\n3,4");

    expect(result.columns).toEqual(["A", "B"]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({ A: "1", B: "2" });
    expect(result.rows[1]).toEqual({ A: "3", B: "4" });
  });

  // -------------------------------------------------------------------------
  // Filter behaviour: keeps rows with at least one non-empty value,
  // drops rows where every value is "".
  // -------------------------------------------------------------------------

  it("filters out rows where every value is an empty string but keeps partial rows", () => {
    mockParse.mockReturnValue({
      data: [
        { col: "value" },   // kept: has a non-empty value
        { col: "" },        // filtered: all values are ""
        { col: "other" },   // kept
      ],
    } as ReturnType<typeof Papa.parse>);

    const result = parseCSV("col\nvalue\n\nother");

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({ col: "value" });
    expect(result.rows[1]).toEqual({ col: "other" });
    expect(result.columns).toEqual(["col"]);
  });

  it("keeps rows where at least one value is non-empty even if others are empty", () => {
    mockParse.mockReturnValue({
      data: [{ A: "x", B: "" }],
    } as ReturnType<typeof Papa.parse>);

    const result = parseCSV("A,B\nx,");

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual({ A: "x", B: "" });
  });

  // -------------------------------------------------------------------------
  // Returned ParsedData shape
  // -------------------------------------------------------------------------

  it("always returns a UUID-format id", () => {
    mockParse.mockReturnValue({ data: [] } as ReturnType<typeof Papa.parse>);

    const result = parseCSV("");

    expect(result.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("always returns an empty string for fileId", () => {
    mockParse.mockReturnValue({ data: [] } as ReturnType<typeof Papa.parse>);

    const result = parseCSV("anything");

    expect(result.fileId).toBe("");
  });

  it("passes the content string directly to Papa.parse", () => {
    mockParse.mockReturnValue({ data: [] } as ReturnType<typeof Papa.parse>);

    const content = "col1,col2\nv1,v2";
    parseCSV(content);

    expect(mockParse).toHaveBeenCalledWith(content);
  });

  // -------------------------------------------------------------------------
  // Each call produces a unique id (crypto.randomUUID)
  // -------------------------------------------------------------------------

  it("generates a different id on each call", () => {
    mockParse.mockReturnValue({ data: [] } as ReturnType<typeof Papa.parse>);

    const result1 = parseCSV("");
    const result2 = parseCSV("");

    expect(result1.id).not.toBe(result2.id);
  });
});
