import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock the IO boundaries so nothing touches the real fs / workers ──────────
const hasElectronFS = vi.fn();
const saveFileDialog = vi.fn();
const writeLocalFile = vi.fn();

vi.mock("@/platform/electron/electron-fs", () => ({
  hasElectronFS: () => hasElectronFS(),
  saveFileDialog: (...args: unknown[]) => saveFileDialog(...args),
  writeLocalFile: (...args: unknown[]) => writeLocalFile(...args),
}));

const getExportProxy = vi.fn();
const saveBytes = vi.fn();

vi.mock("@/platform/viz", () => ({
  getExportProxy: () => getExportProxy(),
  saveBytes: (...args: unknown[]) => saveBytes(...args),
}));

import {
  exportResultCsv,
  exportResultXlsx,
  type ExportTable,
  toCSV,
} from "@/features/data-transform/engine/export";

beforeEach(() => {
  hasElectronFS.mockReset();
  saveFileDialog.mockReset();
  writeLocalFile.mockReset();
  getExportProxy.mockReset();
  saveBytes.mockReset();
});

describe("toCSV", () => {
  it("returns just the header row when there are no data rows", () => {
    expect(toCSV({ cols: ["a", "b"], rows: [] })).toBe("a,b");
  });

  it("serializes rows in column order with a CRLF separator", () => {
    const table: ExportTable = {
      cols: ["a", "b"],
      rows: [
        { a: 1, b: 2 },
        { a: 3, b: 4 },
      ],
    };
    expect(toCSV(table)).toBe("a,b\r\n1,2\r\n3,4");
  });

  it("quotes and doubles embedded quotes, commas and newlines", () => {
    const table: ExportTable = {
      cols: ["x"],
      rows: [{ x: 'he said "hi", ok\nnext' }],
    };
    expect(toCSV(table)).toBe('x\r\n"he said ""hi"", ok\nnext"');
  });

  it("renders null and undefined cells as empty strings", () => {
    const table: ExportTable = {
      cols: ["a", "b"],
      rows: [{ a: null, b: undefined }],
    };
    expect(toCSV(table)).toBe("a,b\r\n,");
  });

  it("stringifies object cells as JSON and dates as ISO", () => {
    const date = new Date("2020-01-02T03:04:05.000Z");
    const table: ExportTable = {
      cols: ["d", "o"],
      rows: [{ d: date, o: { k: 1 } }],
    };
    // The object contains no special chars except quotes -> it gets CSV-quoted.
    expect(toCSV(table)).toBe('d,o\r\n2020-01-02T03:04:05.000Z,"{""k"":1}"');
  });

  it("emits empty cells for columns absent on a row", () => {
    const table: ExportTable = { cols: ["a", "b"], rows: [{ a: 1 }] };
    expect(toCSV(table)).toBe("a,b\r\n1,");
  });
});

describe("exportResultCsv", () => {
  const table: ExportTable = { cols: ["a"], rows: [{ a: 1 }] };

  it("writes through the Electron fs bridge when a path is chosen", async () => {
    hasElectronFS.mockReturnValue(true);
    saveFileDialog.mockResolvedValue("C:/out/data.csv");
    writeLocalFile.mockResolvedValue(undefined);

    const res = await exportResultCsv(table, "data");

    expect(res).toEqual({ saved: true, path: "C:/out/data.csv" });
    expect(saveFileDialog).toHaveBeenCalledWith({
      defaultPath: "data.csv",
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    expect(writeLocalFile).toHaveBeenCalledTimes(1);
    // The first arg is the chosen path; the second is the encoded CSV bytes
    // (an ArrayBuffer-like buffer). Assert the path and that bytes were passed.
    const [pathArg, bytesArg] = writeLocalFile.mock.calls[0];
    expect(pathArg).toBe("C:/out/data.csv");
    const buffer = bytesArg as ArrayBuffer;
    expect(buffer).toBeDefined();
    expect(typeof buffer.byteLength).toBe("number");
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  it("returns saved:false and does not write when the dialog is cancelled", async () => {
    hasElectronFS.mockReturnValue(true);
    saveFileDialog.mockResolvedValue(undefined);

    const res = await exportResultCsv(table, "data");

    expect(res).toEqual({ saved: false });
    expect(writeLocalFile).not.toHaveBeenCalled();
  });

  it("falls back to a browser blob download when Electron fs is unavailable", async () => {
    hasElectronFS.mockReturnValue(false);

    const createObjectURL = vi.fn().mockReturnValue("blob:fake");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    const click = vi.fn();
    const createElement = vi
      .spyOn(document, "createElement")
      // document.createElement is overloaded (Electron augments it with a
      // `webview` → WebviewTag overload), so the spy's inferred return type is
      // not a plain HTMLElement; cast the anchor stub through `never` to satisfy
      // whichever overload signature the spy resolves to.
      .mockReturnValue({ click } as never);

    const res = await exportResultCsv(table, "data");

    expect(res).toEqual({ saved: true });
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake");

    createElement.mockRestore();
  });
});

describe("exportResultXlsx", () => {
  const table: ExportTable = { cols: ["a"], rows: [{ a: 1 }] };

  it("returns saved:false when the export worker proxy is unavailable", async () => {
    getExportProxy.mockReturnValue(null);

    const res = await exportResultXlsx(table, "data", { title: "T" });

    expect(res).toEqual({ saved: false });
    expect(saveBytes).not.toHaveBeenCalled();
  });

  it("builds a single-section ReportDocument and saves the workbook bytes", async () => {
    const xlsx = vi.fn().mockResolvedValue(new ArrayBuffer(8));
    getExportProxy.mockReturnValue({ xlsx });
    saveBytes.mockResolvedValue({ saved: true, path: "C:/out/data.xlsx" });

    const res = await exportResultXlsx({ cols: ["a", "b"], rows: [{ a: 1, b: 2 }] }, "data", {
      title: "My title",
      subtitle: "Sub",
    });

    expect(res).toEqual({ saved: true, path: "C:/out/data.xlsx" });
    expect(xlsx).toHaveBeenCalledTimes(1);
    const doc = xlsx.mock.calls[0][0];
    expect(doc.title).toBe("My title");
    expect(doc.subtitle).toBe("Sub");
    expect(doc.includeCharts).toBe(false);
    expect(doc.sections).toHaveLength(1);
    expect(doc.sections[0].headers).toEqual(["a", "b"]);
    expect(doc.sections[0].rows).toEqual([["1", "2"]]);
    expect(saveBytes).toHaveBeenCalledWith(expect.any(ArrayBuffer), "data.xlsx", "xlsx");
  });
});
