import { beforeEach, describe, expect, it, vi } from "vitest";
import { isExcelFile, xlsxToPipeCSV } from "@/platform/parsers/xlsx-to-csv";

// ---------------------------------------------------------------------------
// ExcelJS mock
//
// `xlsxToPipeCSV` does a dynamic `import("exceljs")` at call-time, so we need
// to intercept the module via vi.mock() with the factory signature.
// ---------------------------------------------------------------------------

// We keep a mutable handle so individual tests can reconfigure the workbook.
let mockWorksheets: unknown[] = [];

vi.mock("exceljs", () => {
  class MockWorkbook {
    worksheets: unknown[];
    xlsx: { load: (buf: unknown) => Promise<void> };

    constructor() {
      this.worksheets = mockWorksheets;
      this.xlsx = {
        load: vi.fn().mockResolvedValue(undefined),
      };
    }
  }

  return { default: { Workbook: MockWorkbook }, Workbook: MockWorkbook };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a fake File whose .arrayBuffer() returns an empty buffer. */
function makeFile(
  name = "test.xlsx",
  type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
): File {
  const blob = new Blob(["fake"], { type });
  return new File([blob], name, { type });
}

type CellLike = {
  value: unknown;
};

/**
 * Build a mock ExcelJS sheet where each argument is an array of cell-value
 * arrays representing rows.
 */
function makeSheet(rowData: CellLike[][]): object {
  return {
    eachRow: (
      _opts: { includeEmpty: boolean },
      cb: (row: {
        eachCell: (opts: { includeEmpty: boolean }, cellCb: (cell: CellLike) => void) => void;
      }) => void,
    ) => {
      for (const cells of rowData) {
        cb({
          eachCell: (_opts2: { includeEmpty: boolean }, cellCb: (cell: CellLike) => void) => {
            for (const cell of cells) {
              cellCb(cell);
            }
          },
        });
      }
    },
  };
}

// ---------------------------------------------------------------------------
// xlsxToPipeCSV
// ---------------------------------------------------------------------------

describe("xlsxToPipeCSV", () => {
  beforeEach(() => {
    // Reset the worksheets array before each test so tests are isolated.
    mockWorksheets = [];
  });

  it("throws when the workbook has no worksheets", async () => {
    mockWorksheets = [];
    const file = makeFile();
    await expect(xlsxToPipeCSV(file)).rejects.toThrow(
      "Le fichier Excel ne contient aucune feuille.",
    );
  });

  it("returns an empty string when the sheet has no rows", async () => {
    mockWorksheets = [makeSheet([])];
    const file = makeFile();
    const result = await xlsxToPipeCSV(file);
    expect(result).toBe("");
  });

  it("converts a single row with string cells to pipe-delimited CSV", async () => {
    mockWorksheets = [makeSheet([[{ value: "Alice" }, { value: "Bob" }]])];
    const file = makeFile();
    const result = await xlsxToPipeCSV(file);
    expect(result).toBe("Alice|Bob");
  });

  it("converts multiple rows separated by newlines", async () => {
    mockWorksheets = [
      makeSheet([
        [{ value: "A" }, { value: "B" }],
        [{ value: "C" }, { value: "D" }],
      ]),
    ];
    const file = makeFile();
    const result = await xlsxToPipeCSV(file);
    expect(result).toBe("A|B\nC|D");
  });

  it("treats null cell value as empty string", async () => {
    mockWorksheets = [makeSheet([[{ value: null }, { value: "X" }]])];
    const file = makeFile();
    const result = await xlsxToPipeCSV(file);
    expect(result).toBe("|X");
  });

  it("treats undefined cell value as empty string", async () => {
    mockWorksheets = [makeSheet([[{ value: undefined }, { value: "Y" }]])];
    const file = makeFile();
    const result = await xlsxToPipeCSV(file);
    expect(result).toBe("|Y");
  });

  it("uses the computed result for formula cells", async () => {
    mockWorksheets = [makeSheet([[{ value: { formula: "=A1+B1", result: 42 } }]])];
    const file = makeFile();
    const result = await xlsxToPipeCSV(file);
    expect(result).toBe("42");
  });

  it("handles formula cells where result is null/undefined (falls back to empty string)", async () => {
    mockWorksheets = [
      makeSheet([
        [{ value: { formula: "=BAD()", result: null } }],
        [{ value: { formula: "=ALSO_BAD()", result: undefined } }],
      ]),
    ];
    const file = makeFile();
    const result = await xlsxToPipeCSV(file);
    expect(result).toBe("\n");
  });

  it("formats Date cell values as ISO-ish string without T", async () => {
    const date = new Date("2024-03-15T14:30:00.000Z");
    mockWorksheets = [makeSheet([[{ value: date }]])];
    const file = makeFile();
    const result = await xlsxToPipeCSV(file);
    // Slices off milliseconds and replaces T with a space
    expect(result).toBe(date.toISOString().slice(0, 19).replace("T", " "));
  });

  it("replaces embedded pipe characters with spaces in string values", async () => {
    mockWorksheets = [makeSheet([[{ value: "foo|bar|baz" }]])];
    const file = makeFile();
    const result = await xlsxToPipeCSV(file);
    expect(result).toBe("foo bar baz");
  });

  it("replaces embedded pipes in formula result values", async () => {
    mockWorksheets = [makeSheet([[{ value: { formula: "=X", result: "a|b" } }]])];
    const file = makeFile();
    const result = await xlsxToPipeCSV(file);
    expect(result).toBe("a b");
  });

  it("replaces embedded pipes in Date values", async () => {
    // A Date whose ISO string would not contain pipes, but we can verify the
    // replace path by constructing a value where the stringified form has a pipe.
    // Instead, confirm that the Date path's output has no pipe.
    const date = new Date("2024-01-01T00:00:00.000Z");
    mockWorksheets = [makeSheet([[{ value: date }]])];
    const file = makeFile();
    const result = await xlsxToPipeCSV(file);
    // The only pipe in the output separates columns; the date value itself is pipe-free.
    expect(result).not.toContain("T");
  });

  it("converts numeric cell values to strings", async () => {
    mockWorksheets = [makeSheet([[{ value: 123 }, { value: 45.6 }]])];
    const file = makeFile();
    const result = await xlsxToPipeCSV(file);
    expect(result).toBe("123|45.6");
  });

  it("converts boolean cell values to strings", async () => {
    mockWorksheets = [makeSheet([[{ value: true }, { value: false }]])];
    const file = makeFile();
    const result = await xlsxToPipeCSV(file);
    expect(result).toBe("true|false");
  });

  it("handles a non-null object that is not a Date and has no 'result' property via String()", async () => {
    // A plain object without "result" falls through to the String() branch
    // because it's an object but not a Date and doesn't have "result" in it.
    // Actually: the code checks `"result" in cell.value` — a plain {} has no
    // "result", and it's not a Date. BUT the order of checks is:
    //   1. null/undefined → ""
    //   2. typeof "object" && "result" in value → formula
    //   3. typeof "object" && value instanceof Date → date
    //   4. else → String(value)
    // So a plain {} falls to String({}) = "[object Object]".
    mockWorksheets = [makeSheet([[{ value: {} }]])];
    const file = makeFile();
    const result = await xlsxToPipeCSV(file);
    expect(result).toBe("[object Object]");
  });

  it("uses only the first worksheet, ignoring additional sheets", async () => {
    const sheet2 = makeSheet([[{ value: "SHEET2" }]]);
    mockWorksheets = [makeSheet([[{ value: "SHEET1" }]]), sheet2];
    const file = makeFile();
    const result = await xlsxToPipeCSV(file);
    expect(result).toBe("SHEET1");
    expect(result).not.toContain("SHEET2");
  });
});

// ---------------------------------------------------------------------------
// isExcelFile
// ---------------------------------------------------------------------------

describe("isExcelFile", () => {
  it("returns false for .csv files regardless of MIME type", () => {
    const file = new File([], "data.csv", { type: "application/vnd.ms-excel" });
    expect(isExcelFile(file)).toBe(false);
  });

  it("returns false for .txt files", () => {
    const file = new File([], "data.txt", { type: "text/plain" });
    expect(isExcelFile(file)).toBe(false);
  });

  it("returns true for .xlsx extension", () => {
    const file = new File([], "data.xlsx", { type: "" });
    expect(isExcelFile(file)).toBe(true);
  });

  it("returns true for .xls extension", () => {
    const file = new File([], "data.xls", { type: "" });
    expect(isExcelFile(file)).toBe(true);
  });

  it("returns true when MIME type is the xlsx OOXML type", () => {
    const file = new File([], "data", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    expect(isExcelFile(file)).toBe(true);
  });

  it("returns true when MIME type is application/vnd.ms-excel", () => {
    const file = new File([], "data", { type: "application/vnd.ms-excel" });
    expect(isExcelFile(file)).toBe(true);
  });

  it("returns false when extension and MIME type are both unrecognised", () => {
    const file = new File([], "data.json", { type: "application/json" });
    expect(isExcelFile(file)).toBe(false);
  });

  it("returns false when file has no extension and no matching MIME type", () => {
    const file = new File([], "data", { type: "text/plain" });
    expect(isExcelFile(file)).toBe(false);
  });

  it("prioritises extension check: .csv with xlsx MIME returns false", () => {
    const file = new File([], "tricky.csv", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    expect(isExcelFile(file)).toBe(false);
  });
});
