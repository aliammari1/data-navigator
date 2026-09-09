import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock @/platform/viz before importing the target so coverage is exercised
// on the real catalogExport logic.
// ---------------------------------------------------------------------------

const mockXlsx = vi.fn();
const mockPdf = vi.fn();
const mockRenderToSVGString = vi.fn();
const mockSaveBytes = vi.fn();

let mockExportProxy: { xlsx: typeof mockXlsx; pdf: typeof mockPdf } | null = {
  xlsx: mockXlsx,
  pdf: mockPdf,
};

let mockChartProxy: { renderToSVGString: typeof mockRenderToSVGString } | null = {
  renderToSVGString: mockRenderToSVGString,
};

vi.mock("@/platform/viz", () => ({
  getExportProxy: () => mockExportProxy,
  getChartProxy: () => mockChartProxy,
  saveBytes: (...args: unknown[]) => mockSaveBytes(...args),
}));

// Also mock lucide-react (imported transitively via format.ts)
vi.mock("lucide-react", () => ({
  Database: "Database",
  File: "File",
  FileSpreadsheet: "FileSpreadsheet",
  Folder: "Folder",
  Hash: "Hash",
}));

// ---------------------------------------------------------------------------
// Now import the real target module
// ---------------------------------------------------------------------------
import {
  type CatalogExportInput,
  exportCatalogPdf,
  exportCatalogXlsx,
} from "@/features/folders/lib/catalogExport";
import type { FSNode } from "@/features/folders/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = new Date("2024-01-01T00:00:00Z");

function makeFileNode(over: Partial<FSNode> & Pick<FSNode, "id">): FSNode {
  return {
    name: over.id,
    type: "csv",
    parentId: null,
    size: 0,
    createdAt: NOW,
    updatedAt: NOW,
    tags: [],
    starred: false,
    ...over,
  };
}

function makeInput(overrides: Partial<CatalogExportInput> = {}): CatalogExportInput {
  const fileNodes: FSNode[] = overrides.fileNodes ?? [
    makeFileNode({ id: "f1", name: "Sales.csv", size: 2048, rowCount: 100, colCount: 5 }),
  ];
  const folderNameById: Map<string, string> =
    overrides.folderNameById ?? new Map([["folder1", "Reports"]]);
  const parentOf = overrides.parentOf ?? ((_id: string) => null);
  const totalSize = overrides.totalSize ?? 2048;
  const totalRows = overrides.totalRows ?? 100;
  return { fileNodes, folderNameById, parentOf, totalSize, totalRows };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Re-enable proxies by default
  mockExportProxy = { xlsx: mockXlsx, pdf: mockPdf };
  mockChartProxy = { renderToSVGString: mockRenderToSVGString };
  // Default behaviours
  mockXlsx.mockResolvedValue(new ArrayBuffer(8));
  mockPdf.mockResolvedValue(new ArrayBuffer(8));
  mockRenderToSVGString.mockResolvedValue("<svg/>");
  mockSaveBytes.mockResolvedValue({ saved: true, path: "/tmp/file.xlsx" });
});

// ---------------------------------------------------------------------------
// exportCatalogXlsx
// ---------------------------------------------------------------------------

describe("exportCatalogXlsx", () => {
  it("returns false when getExportProxy() returns null (worker unavailable)", async () => {
    // Arrange
    mockExportProxy = null;

    // Act
    const result = await exportCatalogXlsx(makeInput());

    // Assert
    expect(result).toBe(false);
    expect(mockXlsx).not.toHaveBeenCalled();
  });

  it("calls exp.xlsx() with a ReportDocument for a single file node", async () => {
    // Arrange
    const input = makeInput();

    // Act
    await exportCatalogXlsx(input);

    // Assert – xlsx was called once with the doc
    expect(mockXlsx).toHaveBeenCalledOnce();
    const [doc] = mockXlsx.mock.calls[0];
    expect(doc.title).toBe("Data Catalog");
    expect(doc.includeCharts).toBe(false);
    expect(doc.subtitle).toBe("1 datasets");
  });

  it("passes the correct sections: summary first, then datasets", async () => {
    // Arrange
    const input = makeInput();

    // Act
    await exportCatalogXlsx(input);
    const [doc] = mockXlsx.mock.calls[0];

    // Assert
    expect(doc.sections).toHaveLength(2);
    expect(doc.sections[0].title).toBe("Catalog Summary");
    expect(doc.sections[1].title).toBe("Datasets");
  });

  it("summary section contains correct headers and row count", async () => {
    // Arrange
    const input = makeInput({
      totalSize: 1024,
      totalRows: 50,
      folderNameById: new Map([
        ["x", "Foo"],
        ["y", "Bar"],
      ]),
    });

    // Act
    await exportCatalogXlsx(input);
    const [doc] = mockXlsx.mock.calls[0];
    const summary = doc.sections[0];

    // Assert
    expect(summary.headers).toEqual(["Metric", "Value"]);
    // Should have 5 rows: Total datasets, Total folders, Total size, Total rows, Exported
    expect(summary.rows).toHaveLength(5);
    expect(summary.rows[0]).toEqual(["Total datasets", 1]);
    expect(summary.rows[1]).toEqual(["Total folders", 2]);
    expect(summary.rows[2][0]).toBe("Total size");
    // 1024 bytes → "1.0 KB"
    expect(summary.rows[2][1]).toBe("1.0 KB");
    expect(summary.rows[3]).toEqual(["Total rows", "50"]);
    // "Exported" row has the current datetime string (dynamic, just check label)
    expect(summary.rows[4][0]).toBe("Exported");
    expect(typeof summary.rows[4][1]).toBe("string");
  });

  it("datasets section rows encode file node properties correctly", async () => {
    // Arrange
    const node = makeFileNode({
      id: "f1",
      name: "Sales.csv",
      type: "csv",
      size: 1024,
      rowCount: 42,
      colCount: 7,
      quality: 0.876,
      tags: ["finance", "q1"],
    });
    const input = makeInput({
      fileNodes: [node],
      parentOf: (_id) => null,
    });

    // Act
    await exportCatalogXlsx(input);
    const [doc] = mockXlsx.mock.calls[0];
    const row = doc.sections[1].rows[0];

    // Assert
    expect(row[0]).toBe("Sales.csv"); // name
    expect(row[1]).toBe("csv"); // type
    expect(row[2]).toBe("(root)"); // folder (null parentId → root)
    expect(row[3]).toBe(42); // rowCount
    expect(row[4]).toBe(7); // colCount
    expect(row[5]).toBe("1.0 KB"); // size formatted
    expect(row[6]).toBe("88%"); // quality rounded to percent
    expect(row[7]).toBe("finance, q1"); // tags joined
  });

  it("uses folder name from folderNameById when parentId is a real folder", async () => {
    // Arrange
    const node = makeFileNode({ id: "f1", name: "Report.csv" });
    const folderNameById = new Map([["folder-abc", "My Reports"]]);
    const parentOf = (_id: string) => "folder-abc";
    const input = makeInput({ fileNodes: [node], folderNameById, parentOf });

    // Act
    await exportCatalogXlsx(input);
    const [doc] = mockXlsx.mock.calls[0];
    const row = doc.sections[1].rows[0];

    // Assert
    expect(row[2]).toBe("My Reports");
  });

  it("falls back to '—' when parent folder name is missing from folderNameById", async () => {
    // Arrange
    const node = makeFileNode({ id: "f1", name: "Report.csv" });
    const folderNameById = new Map<string, string>(); // no entry for "unknown-folder"
    const parentOf = (_id: string) => "unknown-folder";
    const input = makeInput({ fileNodes: [node], folderNameById, parentOf });

    // Act
    await exportCatalogXlsx(input);
    const [doc] = mockXlsx.mock.calls[0];
    const row = doc.sections[1].rows[0];

    // Assert — "—" is the fallback for missing folder name
    expect(row[2]).toBe("—");
  });

  it("shows '(root)' when parentId is the literal string 'root'", async () => {
    // Arrange
    const node = makeFileNode({ id: "f1", name: "Report.csv" });
    const parentOf = (_id: string) => "root";
    const input = makeInput({ fileNodes: [node], parentOf });

    // Act
    await exportCatalogXlsx(input);
    const [doc] = mockXlsx.mock.calls[0];
    const row = doc.sections[1].rows[0];

    // Assert
    expect(row[2]).toBe("(root)");
  });

  it("shows quality as '—' when quality is undefined", async () => {
    // Arrange
    const node = makeFileNode({ id: "f1", name: "Data.csv" });
    // quality is not set
    const input = makeInput({ fileNodes: [node], parentOf: () => null });

    // Act
    await exportCatalogXlsx(input);
    const [doc] = mockXlsx.mock.calls[0];
    const row = doc.sections[1].rows[0];

    // Assert
    expect(row[6]).toBe("—");
  });

  it("defaults rowCount and colCount to 0 when undefined", async () => {
    // Arrange
    const node = makeFileNode({ id: "f1", name: "Data.csv" });
    // rowCount and colCount are not set (undefined)
    const input = makeInput({ fileNodes: [node], parentOf: () => null });

    // Act
    await exportCatalogXlsx(input);
    const [doc] = mockXlsx.mock.calls[0];
    const row = doc.sections[1].rows[0];

    // Assert
    expect(row[3]).toBe(0);
    expect(row[4]).toBe(0);
  });

  it("calls saveBytes with the xlsx bytes and correct filename/kind", async () => {
    // Arrange
    const fakeBytes = new ArrayBuffer(16);
    mockXlsx.mockResolvedValue(fakeBytes);

    // Act
    await exportCatalogXlsx(makeInput());

    // Assert
    expect(mockSaveBytes).toHaveBeenCalledWith(fakeBytes, "data-catalog.xlsx", "xlsx");
  });

  it("returns true when saveBytes reports saved=true", async () => {
    // Arrange
    mockSaveBytes.mockResolvedValue({ saved: true });

    // Act
    const result = await exportCatalogXlsx(makeInput());

    // Assert
    expect(result).toBe(true);
  });

  it("returns false when saveBytes reports saved=false (user cancelled)", async () => {
    // Arrange
    mockSaveBytes.mockResolvedValue({ saved: false });

    // Act
    const result = await exportCatalogXlsx(makeInput());

    // Assert
    expect(result).toBe(false);
  });

  it("handles an empty fileNodes array gracefully", async () => {
    // Arrange
    const input = makeInput({ fileNodes: [] });

    // Act
    const result = await exportCatalogXlsx(input);

    // Assert
    expect(result).toBe(true);
    const [doc] = mockXlsx.mock.calls[0];
    expect(doc.subtitle).toBe("0 datasets");
    expect(doc.sections[1].rows).toHaveLength(0);
  });

  it("handles multiple file nodes, each with different folder assignments", async () => {
    // Arrange
    const nodes = [
      makeFileNode({ id: "f1", name: "A.csv" }),
      makeFileNode({ id: "f2", name: "B.csv" }),
    ];
    const folderNameById = new Map([["folder1", "Alpha"]]);
    const parentOf = (id: string) => (id === "f1" ? "folder1" : null);
    const input = makeInput({ fileNodes: nodes, folderNameById, parentOf });

    // Act
    await exportCatalogXlsx(input);
    const [doc] = mockXlsx.mock.calls[0];
    const rows = doc.sections[1].rows;

    // Assert
    expect(rows[0][2]).toBe("Alpha");
    expect(rows[1][2]).toBe("(root)");
  });
});

// ---------------------------------------------------------------------------
// exportCatalogPdf
// ---------------------------------------------------------------------------

describe("exportCatalogPdf", () => {
  const chartOption = { series: [] };

  it("returns false when getExportProxy() returns null", async () => {
    // Arrange
    mockExportProxy = null;

    // Act
    const result = await exportCatalogPdf(makeInput(), chartOption);

    // Assert
    expect(result).toBe(false);
    expect(mockPdf).not.toHaveBeenCalled();
  });

  it("calls renderToSVGString to embed the storage chart", async () => {
    // Act
    await exportCatalogPdf(makeInput(), chartOption);

    // Assert
    expect(mockRenderToSVGString).toHaveBeenCalledWith(chartOption, 520, 280);
  });

  it("embeds SVG in the doc when chart renders successfully", async () => {
    // Arrange
    mockRenderToSVGString.mockResolvedValue("<svg>chart</svg>");

    // Act
    await exportCatalogPdf(makeInput(), chartOption);

    // Assert
    expect(mockPdf).toHaveBeenCalledOnce();
    const [doc] = mockPdf.mock.calls[0];
    expect(doc.includeCharts).toBe(true);
    expect(doc.charts).toHaveLength(1);
    expect(doc.charts[0].svg).toBe("<svg>chart</svg>");
    expect(doc.charts[0].width).toBe(520);
    expect(doc.charts[0].height).toBe(280);
  });

  it("omits charts in the doc when chart proxy is null", async () => {
    // Arrange — no chart proxy available
    mockChartProxy = null;

    // Act
    await exportCatalogPdf(makeInput(), chartOption);

    // Assert
    expect(mockRenderToSVGString).not.toHaveBeenCalled();
    const [doc] = mockPdf.mock.calls[0];
    expect(doc.includeCharts).toBe(false);
    expect(doc.charts).toBeUndefined();
  });

  it("omits charts when renderToSVGString throws", async () => {
    // Arrange
    mockRenderToSVGString.mockRejectedValue(new Error("offscreen failure"));

    // Act
    await exportCatalogPdf(makeInput(), chartOption);

    // Assert
    const [doc] = mockPdf.mock.calls[0];
    expect(doc.includeCharts).toBe(false);
    expect(doc.charts).toBeUndefined();
  });

  it("omits charts when renderToSVGString returns undefined", async () => {
    // Arrange
    mockRenderToSVGString.mockResolvedValue(undefined);

    // Act
    await exportCatalogPdf(makeInput(), chartOption);

    // Assert
    const [doc] = mockPdf.mock.calls[0];
    expect(doc.includeCharts).toBe(false);
    expect(doc.charts).toBeUndefined();
  });

  it("sets paperSize to 'a4' in the ReportDocument", async () => {
    // Act
    await exportCatalogPdf(makeInput(), chartOption);
    const [doc] = mockPdf.mock.calls[0];

    // Assert
    expect(doc.paperSize).toBe("a4");
  });

  it("builds subtitle including dataset count and formatted total size", async () => {
    // Arrange
    const input = makeInput({
      fileNodes: [
        makeFileNode({ id: "f1", name: "A.csv", size: 512 }),
        makeFileNode({ id: "f2", name: "B.csv", size: 512 }),
      ],
      totalSize: 1024,
    });

    // Act
    await exportCatalogPdf(input, chartOption);
    const [doc] = mockPdf.mock.calls[0];

    // Assert
    expect(doc.subtitle).toBe("2 datasets · 1.0 KB");
  });

  it("calls saveBytes with pdf bytes and correct filename/kind", async () => {
    // Arrange
    const fakeBytes = new ArrayBuffer(32);
    mockPdf.mockResolvedValue(fakeBytes);

    // Act
    await exportCatalogPdf(makeInput(), chartOption);

    // Assert
    expect(mockSaveBytes).toHaveBeenCalledWith(fakeBytes, "data-catalog.pdf", "pdf");
  });

  it("returns true when saveBytes reports saved=true", async () => {
    // Arrange
    mockSaveBytes.mockResolvedValue({ saved: true });

    // Act
    const result = await exportCatalogPdf(makeInput(), chartOption);

    // Assert
    expect(result).toBe(true);
  });

  it("returns false when saveBytes reports saved=false (user cancelled)", async () => {
    // Arrange
    mockSaveBytes.mockResolvedValue({ saved: false });

    // Act
    const result = await exportCatalogPdf(makeInput(), chartOption);

    // Assert
    expect(result).toBe(false);
  });

  it("includes sections: summary + datasets, in that order", async () => {
    // Act
    await exportCatalogPdf(makeInput(), chartOption);
    const [doc] = mockPdf.mock.calls[0];

    // Assert
    expect(doc.sections).toHaveLength(2);
    expect(doc.sections[0].title).toBe("Catalog Summary");
    expect(doc.sections[1].title).toBe("Datasets");
  });

  it("handles an empty fileNodes array without throwing", async () => {
    // Arrange
    const input = makeInput({ fileNodes: [], totalSize: 0 });

    // Act
    const result = await exportCatalogPdf(input, chartOption);

    // Assert — should not throw, save completes
    expect(result).toBe(true);
    const [doc] = mockPdf.mock.calls[0];
    expect(doc.subtitle).toBe("0 datasets · —");
  });
});
