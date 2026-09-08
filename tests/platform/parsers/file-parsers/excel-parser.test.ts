import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseExcel } from "@/platform/parsers/file-parsers/excel-parser";

// ---------------------------------------------------------------------------
// ExcelJS mock
//
// `parseExcel` does `new ExcelJS.Workbook()` and calls `workbook.xlsx.load()`,
// then iterates worksheets with `eachRow` / `eachCell` / `getRow` / `getCell`.
// We keep mutable handles so individual tests can reconfigure the sheet data.
// ---------------------------------------------------------------------------

// Mutable state shared across tests — reset in beforeEach.
let mockEachRowImpl: ((cb: (row: MockRow, rowNumber: number) => void) => void) | null = null;
let mockGetRowImpl: ((rowNumber: number) => MockExcelRow) | null = null;

interface MockCell {
  value: unknown;
}

interface MockExcelRow {
  getCell: (colNumber: number) => MockCell;
  eachCell: (cb: (cell: MockCell, colNumber: number) => void) => void;
}

interface MockRow {
  eachCell: (cb: (cell: MockCell, colNumber: number) => void) => void;
}

vi.mock("exceljs", () => {
  class MockWorkbook {
    worksheets: unknown[];
    xlsx: { load: (buf: unknown) => Promise<void> };

    constructor() {
      this.xlsx = {
        load: vi.fn().mockResolvedValue(undefined),
      };
      // worksheets[0] is the firstSheet the real code reads
      this.worksheets = [
        {
          eachRow: (cb: (row: MockRow, rowNumber: number) => void) => {
            if (mockEachRowImpl) {
              mockEachRowImpl(cb);
            }
          },
          getRow: (rowNumber: number): MockExcelRow => {
            if (mockGetRowImpl) {
              return mockGetRowImpl(rowNumber);
            }
            return { getCell: () => ({ value: "" }), eachCell: () => {} };
          },
        },
      ];
    }
  }

  return { default: { Workbook: MockWorkbook }, Workbook: MockWorkbook };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a fake ArrayBuffer (the real code just passes it through to the mock). */
function makeBuffer(): ArrayBuffer {
  return new ArrayBuffer(8);
}

/**
 * Configure the mock sheet to replay the provided rows.
 *
 * @param headerValues  Array of header cell values (row 1).
 * @param dataRows      Array of data rows, each an array of cell values (row 2+).
 */
function setupSheet(headerValues: string[], dataRows: unknown[][]): void {
  // Build the header row object for getRow(1)
  const headerRow: MockExcelRow = {
    getCell: (colNumber: number) => ({ value: headerValues[colNumber - 1] ?? "" }),
    eachCell: () => {},
  };

  mockGetRowImpl = (rowNumber: number) => {
    if (rowNumber === 1) return headerRow;
    return { getCell: () => ({ value: "" }), eachCell: () => {} };
  };

  // eachRow calls the callback with rowNumber 1 (header) then 2..N (data)
  mockEachRowImpl = (cb: (row: MockRow, rowNumber: number) => void) => {
    // Row 1: header
    cb(
      {
        eachCell: (cellCb: (cell: MockCell, colNumber: number) => void) => {
          headerValues.forEach((v, i) => {
            cellCb({ value: v }, i + 1);
          });
        },
      },
      1,
    );

    // Rows 2+: data
    dataRows.forEach((cells, idx) => {
      cb(
        {
          eachCell: (cellCb: (cell: MockCell, colNumber: number) => void) => {
            cells.forEach((v, i) => {
              cellCb({ value: v }, i + 1);
            });
          },
        },
        idx + 2,
      );
    });
  };
}

/**
 * Configure the mock sheet to call eachRow with only a header row (rowNumber 1)
 * and no data rows — simulating an empty sheet past the header.
 */
function setupEmptySheet(): void {
  mockGetRowImpl = () => ({ getCell: () => ({ value: "" }), eachCell: () => {} });
  // No rows at all: eachRow never invokes its callback
  mockEachRowImpl = (_cb) => {};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("parseExcel", () => {
  beforeEach(() => {
    mockEachRowImpl = null;
    mockGetRowImpl = null;
  });

  // -------------------------------------------------------------------------
  // Branch: rows.length > 0 === false → columns = []
  // -------------------------------------------------------------------------

  it("returns empty columns and rows when the sheet has no data rows (only header is present)", async () => {
    // eachRow fires rowNumber=1 (header, skipped) only.
    mockGetRowImpl = () => ({ getCell: () => ({ value: "" }), eachCell: () => {} });
    mockEachRowImpl = (cb) => {
      cb(
        { eachCell: () => {} },
        1, // header row — code returns early
      );
    };

    const result = await parseExcel(makeBuffer());

    expect(result.rows).toEqual([]);
    expect(result.columns).toEqual([]);
    expect(result.fileId).toBe("");
    expect(typeof result.id).toBe("string");
  });

  it("returns empty columns and rows when the sheet has no rows at all", async () => {
    setupEmptySheet();

    const result = await parseExcel(makeBuffer());

    expect(result.rows).toEqual([]);
    expect(result.columns).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Branch: rows.length > 0 === true → columns = Object.keys(rows[0])
  // -------------------------------------------------------------------------

  it("returns correct columns and rows for a single data row", async () => {
    setupSheet(["Name", "Age"], [["Alice", 30]]);

    const result = await parseExcel(makeBuffer());

    expect(result.columns).toEqual(["Name", "Age"]);
    expect(result.rows).toEqual([{ Name: "Alice", Age: 30 }]);
  });

  it("returns correct columns and rows for multiple data rows", async () => {
    setupSheet(["Col1", "Col2"], [["A", "B"], ["C", "D"]]);

    const result = await parseExcel(makeBuffer());

    expect(result.columns).toEqual(["Col1", "Col2"]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({ Col1: "A", Col2: "B" });
    expect(result.rows[1]).toEqual({ Col1: "C", Col2: "D" });
  });

  // -------------------------------------------------------------------------
  // Row 1 early-return branch: ensure rowNumber === 1 is skipped
  // -------------------------------------------------------------------------

  it("skips the header row (rowNumber === 1) and does not include it in rows", async () => {
    // eachRow fires rowNumber=1 (header) and rowNumber=2 (data).
    setupSheet(["X"], [["value"]]);

    const result = await parseExcel(makeBuffer());

    // Only one data row should appear; header must not be in rows.
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual({ X: "value" });
  });

  // -------------------------------------------------------------------------
  // The returned ParsedData shape
  // -------------------------------------------------------------------------

  it("always returns a non-empty uuid id", async () => {
    setupEmptySheet();
    const result = await parseExcel(makeBuffer());
    // crypto.randomUUID() returns a standard UUID string
    expect(result.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("always returns fileId as an empty string", async () => {
    setupEmptySheet();
    const result = await parseExcel(makeBuffer());
    expect(result.fileId).toBe("");
  });

  // -------------------------------------------------------------------------
  // Cell value types — the code stores cell.value directly in rowData[header]
  // -------------------------------------------------------------------------

  it("preserves null cell values", async () => {
    setupSheet(["A"], [[null]]);
    const result = await parseExcel(makeBuffer());
    expect(result.rows[0].A).toBeNull();
  });

  it("preserves undefined cell values", async () => {
    setupSheet(["A"], [[undefined]]);
    const result = await parseExcel(makeBuffer());
    expect(result.rows[0].A).toBeUndefined();
  });

  it("preserves numeric cell values", async () => {
    setupSheet(["Num"], [[42.5]]);
    const result = await parseExcel(makeBuffer());
    expect(result.rows[0].Num).toBe(42.5);
  });

  it("preserves boolean cell values", async () => {
    setupSheet(["Flag"], [[true]]);
    const result = await parseExcel(makeBuffer());
    expect(result.rows[0].Flag).toBe(true);
  });

  it("preserves Date cell values", async () => {
    const date = new Date("2024-01-15T10:00:00Z");
    setupSheet(["When"], [[date]]);
    const result = await parseExcel(makeBuffer());
    expect(result.rows[0].When).toBe(date);
  });

  it("preserves object cell values (e.g., formula objects)", async () => {
    const formula = { formula: "=A1+B1", result: 99 };
    setupSheet(["Formula"], [[formula]]);
    const result = await parseExcel(makeBuffer());
    expect(result.rows[0].Formula).toBe(formula);
  });

  // -------------------------------------------------------------------------
  // Multiple columns with mixed values
  // -------------------------------------------------------------------------

  it("maps each cell to the correct header column", async () => {
    setupSheet(["First", "Second", "Third"], [["one", 2, true]]);
    const result = await parseExcel(makeBuffer());
    expect(result.rows[0]).toEqual({ First: "one", Second: 2, Third: true });
  });

  // -------------------------------------------------------------------------
  // Async: load is awaited
  // -------------------------------------------------------------------------

  it("awaits workbook.xlsx.load before reading sheet data", async () => {
    // If load were not awaited, reading worksheets would happen before load —
    // but since we mock load as a resolved promise, this is a smoke test.
    setupSheet(["Col"], [["val"]]);
    const result = await parseExcel(makeBuffer());
    expect(result.rows[0]).toEqual({ Col: "val" });
  });
});
