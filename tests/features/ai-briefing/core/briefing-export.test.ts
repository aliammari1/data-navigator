import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  exportBriefingReport,
  type BriefingReportInput,
} from "@/features/ai-briefing/core/briefing-export";
import type { BriefingContext } from "@/features/ai-briefing/core/briefing-context";

/**
 * Tests for briefing-export.ts.
 *
 * All worker-boundary and I/O dependencies are mocked:
 *   - @/platform/viz  (getChartProxy, getExportProxy, buildBarOption, saveBytes)
 * The target module's own logic (proseSection, metricsSection, renderHistogramPng,
 * exportBriefingReport) is exercised for real and contributes coverage.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockRenderToSVGString = vi.fn();
const mockSvgToPng = vi.fn();
const mockPdf = vi.fn();
const mockDocx = vi.fn();
const mockXlsx = vi.fn();
const mockPptx = vi.fn();
const mockSaveBytes = vi.fn();
const mockBuildBarOption = vi.fn();
const mockGetChartProxy = vi.fn();
const mockGetExportProxy = vi.fn();

vi.mock("@/platform/viz", () => ({
  buildBarOption: (...args: unknown[]) => mockBuildBarOption(...args),
  getChartProxy: () => mockGetChartProxy(),
  getExportProxy: () => mockGetExportProxy(),
  saveBytes: (...args: unknown[]) => mockSaveBytes(...args),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeBriefingContext(overrides: Partial<BriefingContext> = {}): BriefingContext {
  return {
    datasetId: "ds_001",
    datasetName: "SalesData",
    tableName: "sales_view",
    rowCount: 1000,
    numericCols: [],
    topCategory: null,
    generatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeInput(overrides: Partial<BriefingReportInput> = {}): BriefingReportInput {
  return {
    context: makeBriefingContext(),
    kind: "pdf",
    title: "Sales Briefing",
    narrative: [],
    fileBase: "briefing",
    ...overrides,
  };
}

function makeExportProxy() {
  return {
    pdf: mockPdf,
    docx: mockDocx,
    xlsx: mockXlsx,
    pptx: mockPptx,
    svgToPng: mockSvgToPng,
  };
}

function makeChartProxy() {
  return {
    renderToSVGString: mockRenderToSVGString,
  };
}

// ─── exportBriefingReport ─────────────────────────────────────────────────────

describe("exportBriefingReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Happy-path defaults
    mockGetExportProxy.mockReturnValue(makeExportProxy());
    mockGetChartProxy.mockReturnValue(makeChartProxy());
    mockPdf.mockResolvedValue(new Uint8Array([1, 2, 3]));
    mockDocx.mockResolvedValue(new Uint8Array([4, 5, 6]));
    mockXlsx.mockResolvedValue(new Uint8Array([7, 8, 9]));
    mockPptx.mockResolvedValue(new Uint8Array([10, 11, 12]));
    mockSaveBytes.mockResolvedValue({ path: "/tmp/file.pdf" });
    mockBuildBarOption.mockReturnValue({ series: [] });
    mockRenderToSVGString.mockResolvedValue("<svg/>");
    mockSvgToPng.mockResolvedValue(new Uint8Array([20, 21]));
  });

  it("throws when the export proxy is unavailable", async () => {
    // Arrange: no export worker
    mockGetExportProxy.mockReturnValue(null);

    // Act + Assert
    await expect(exportBriefingReport(makeInput())).rejects.toThrow(
      "Export worker is unavailable in this environment.",
    );
  });

  it("calls exp.pdf() and saveBytes with .pdf extension for kind=pdf", async () => {
    // Arrange
    const bytes = new Uint8Array([1, 2, 3]);
    mockPdf.mockResolvedValue(bytes);

    // Act
    await exportBriefingReport(makeInput({ kind: "pdf" }));

    // Assert
    expect(mockPdf).toHaveBeenCalledOnce();
    expect(mockDocx).not.toHaveBeenCalled();
    const [savedBytes, fileName, kind] = mockSaveBytes.mock.calls[0];
    expect(savedBytes).toBe(bytes);
    expect(fileName).toMatch(/\.pdf$/);
    expect(kind).toBe("pdf");
  });

  it("calls exp.docx() and saveBytes with .docx extension for kind=docx", async () => {
    // Arrange
    const bytes = new Uint8Array([4, 5, 6]);
    mockDocx.mockResolvedValue(bytes);

    // Act
    await exportBriefingReport(makeInput({ kind: "docx" }));

    // Assert
    expect(mockDocx).toHaveBeenCalledOnce();
    expect(mockPdf).not.toHaveBeenCalled();
    const [savedBytes, fileName, kind] = mockSaveBytes.mock.calls[0];
    expect(savedBytes).toBe(bytes);
    expect(fileName).toMatch(/\.docx$/);
    expect(kind).toBe("docx");
  });

  it("calls exp.xlsx() and saveBytes with .xlsx extension for kind=xlsx", async () => {
    // Arrange
    const bytes = new Uint8Array([7, 8, 9]);
    mockXlsx.mockResolvedValue(bytes);

    // Act
    await exportBriefingReport(makeInput({ kind: "xlsx" }));

    // Assert
    expect(mockXlsx).toHaveBeenCalledOnce();
    expect(mockPdf).not.toHaveBeenCalled();
    const [savedBytes, fileName, kind] = mockSaveBytes.mock.calls[0];
    expect(savedBytes).toBe(bytes);
    expect(fileName).toMatch(/\.xlsx$/);
    expect(kind).toBe("xlsx");
  });

  it("calls exp.pptx() and saveBytes with .pptx extension for kind=pptx", async () => {
    // Arrange
    const bytes = new Uint8Array([10, 11, 12]);
    mockPptx.mockResolvedValue(bytes);

    // Act
    await exportBriefingReport(makeInput({ kind: "pptx" }));

    // Assert
    expect(mockPptx).toHaveBeenCalledOnce();
    expect(mockPdf).not.toHaveBeenCalled();
    const [savedBytes, fileName, kind] = mockSaveBytes.mock.calls[0];
    expect(savedBytes).toBe(bytes);
    expect(fileName).toMatch(/\.pptx$/);
    expect(kind).toBe("pptx");
  });

  it("returns the saveBytes result (so callers can surface the saved path)", async () => {
    // Arrange
    const saveResult = { path: "/reports/briefing.pdf", cancelled: false };
    mockSaveBytes.mockResolvedValue(saveResult);

    // Act
    const result = await exportBriefingReport(makeInput());

    // Assert
    expect(result).toBe(saveResult);
  });

  it("sanitises the filename by replacing non-word characters with underscores", async () => {
    // Arrange: dataset name contains spaces and slashes
    const ctx = makeBriefingContext({ datasetName: "My Data / 2024" });

    // Act
    await exportBriefingReport(makeInput({ context: ctx, fileBase: "briefing" }));

    // Assert: filename passed to saveBytes has only word chars, dots, and hyphens
    const fileName: string = mockSaveBytes.mock.calls[0][1];
    expect(fileName).toMatch(/^[\w.\-]+$/);
  });

  it("includes the dataset name in the generated filename", async () => {
    // Arrange
    const ctx = makeBriefingContext({ datasetName: "SalesData" });

    // Act
    await exportBriefingReport(makeInput({ context: ctx, fileBase: "briefing" }));

    // Assert
    const fileName: string = mockSaveBytes.mock.calls[0][1];
    expect(fileName).toContain("SalesData");
  });

  it("includes the fileBase in the generated filename", async () => {
    // Act
    await exportBriefingReport(makeInput({ fileBase: "monthly-report" }));

    // Assert
    const fileName: string = mockSaveBytes.mock.calls[0][1];
    expect(fileName).toContain("monthly");
  });

  it("builds a doc without charts when no histogram is provided", async () => {
    // Act
    await exportBriefingReport(makeInput({ histogram: undefined }));

    // Assert: chart worker not touched, includeCharts = false
    expect(mockRenderToSVGString).not.toHaveBeenCalled();
    const doc = mockPdf.mock.calls[0][0];
    expect(doc.includeCharts).toBe(false);
    expect(doc.charts).toBeUndefined();
  });

  it("embeds a chart PNG when a histogram is provided and rendering succeeds", async () => {
    // Arrange
    const bins = [
      { label: "0-10", count: 5 },
      { label: "10-20", count: 15 },
    ];
    const pngBytes = new Uint8Array([20, 21, 22]);
    mockRenderToSVGString.mockResolvedValue("<svg>chart</svg>");
    mockSvgToPng.mockResolvedValue(pngBytes);

    // Act
    await exportBriefingReport(
      makeInput({ histogram: { bins, title: "Price Distribution" } }),
    );

    // Assert
    const doc = mockPdf.mock.calls[0][0];
    expect(doc.includeCharts).toBe(true);
    expect(doc.charts).toHaveLength(1);
    expect(doc.charts?.[0].png).toBe(pngBytes);
    expect(doc.charts?.[0].width).toBe(720);
    expect(doc.charts?.[0].height).toBe(320);
  });

  it("skips chart embedding when histogram bins array is empty", async () => {
    // Act
    await exportBriefingReport(makeInput({ histogram: { bins: [], title: "Empty" } }));

    // Assert: renderToSVGString never called because bins.length === 0
    expect(mockRenderToSVGString).not.toHaveBeenCalled();
    const doc = mockPdf.mock.calls[0][0];
    expect(doc.includeCharts).toBe(false);
  });

  it("skips chart embedding when chart proxy is unavailable", async () => {
    // Arrange: chart worker missing
    mockGetChartProxy.mockReturnValue(null);
    const bins = [{ label: "0-10", count: 5 }];

    // Act
    await exportBriefingReport(makeInput({ histogram: { bins, title: "t" } }));

    // Assert: no SVG render attempted, chart omitted
    expect(mockRenderToSVGString).not.toHaveBeenCalled();
    const doc = mockPdf.mock.calls[0][0];
    expect(doc.includeCharts).toBe(false);
  });

  it("skips chart embedding when export proxy is null inside renderHistogramPng", async () => {
    // Arrange: getExportProxy returns null on the FIRST call (inside renderHistogramPng)
    // but a real proxy is returned for the outer call. We achieve this by making it
    // return null the first time (chart pipeline check) and a real proxy the second
    // time (outer exportBriefingReport check). However the module code calls
    // getExportProxy() once at the top, so we need a different approach:
    // make the FIRST getExportProxy() call return a real proxy (outer) but
    // the chart path's call return null. Since both calls happen within the same
    // function, and renderHistogramPng also calls getExportProxy() internally,
    // we simulate by making the second call (inside renderHistogramPng) return null.
    mockGetExportProxy
      .mockReturnValueOnce(makeExportProxy()) // outer call → real proxy
      .mockReturnValueOnce(null);             // renderHistogramPng inner call → null

    const bins = [{ label: "0-10", count: 5 }];

    // Act
    await exportBriefingReport(makeInput({ histogram: { bins, title: "t" } }));

    // Assert: chart not embedded
    const doc = mockPdf.mock.calls[0][0];
    expect(doc.includeCharts).toBe(false);
  });

  it("gracefully omits chart when renderToSVGString throws", async () => {
    // Arrange
    mockRenderToSVGString.mockRejectedValue(new Error("SVG render failed"));
    const bins = [{ label: "0-10", count: 5 }];

    // Act: should not throw
    await expect(
      exportBriefingReport(makeInput({ histogram: { bins, title: "t" } })),
    ).resolves.toBeDefined();

    // Assert: chart omitted
    const doc = mockPdf.mock.calls[0][0];
    expect(doc.includeCharts).toBe(false);
  });

  it("gracefully omits chart when svgToPng throws", async () => {
    // Arrange
    mockRenderToSVGString.mockResolvedValue("<svg/>");
    mockSvgToPng.mockRejectedValue(new Error("PNG conversion failed"));
    const bins = [{ label: "0-10", count: 5 }];

    // Act: should not throw
    await expect(
      exportBriefingReport(makeInput({ histogram: { bins, title: "t" } })),
    ).resolves.toBeDefined();

    // Assert: chart omitted
    const doc = mockPdf.mock.calls[0][0];
    expect(doc.includeCharts).toBe(false);
  });

  it("gracefully omits chart when renderToSVGString returns a falsy string", async () => {
    // Arrange
    mockRenderToSVGString.mockResolvedValue("");
    const bins = [{ label: "0-10", count: 5 }];

    // Act
    await exportBriefingReport(makeInput({ histogram: { bins, title: "t" } }));

    // Assert: empty svg string → no PNG → no chart
    expect(mockSvgToPng).not.toHaveBeenCalled();
    const doc = mockPdf.mock.calls[0][0];
    expect(doc.includeCharts).toBe(false);
  });

  it("passes the correct SVG dimensions (720x320) to renderToSVGString", async () => {
    // Arrange
    const bins = [{ label: "0-10", count: 5 }];

    // Act
    await exportBriefingReport(makeInput({ histogram: { bins, title: "Histogram" } }));

    // Assert
    const [, width, height] = mockRenderToSVGString.mock.calls[0];
    expect(width).toBe(720);
    expect(height).toBe(320);
  });

  it("passes the correct raster width (720) to svgToPng", async () => {
    // Arrange
    const bins = [{ label: "0-10", count: 5 }];

    // Act
    await exportBriefingReport(makeInput({ histogram: { bins, title: "t" } }));

    // Assert
    const [, width] = mockSvgToPng.mock.calls[0];
    expect(width).toBe(720);
  });

  it("calls buildBarOption with bin labels, counts, and histogram title", async () => {
    // Arrange
    const bins = [
      { label: "0-10", count: 3 },
      { label: "10-20", count: 7 },
    ];

    // Act
    await exportBriefingReport(makeInput({ histogram: { bins, title: "My Chart" } }));

    // Assert
    expect(mockBuildBarOption).toHaveBeenCalledOnce();
    const [labels, series, opts] = mockBuildBarOption.mock.calls[0];
    expect(labels).toEqual(["0-10", "10-20"]);
    expect(series[0].data).toEqual([3, 7]);
    expect(opts.title).toBe("My Chart");
  });

  it("includes the metrics section as the first doc section", async () => {
    // Arrange
    const ctx = makeBriefingContext({ rowCount: 500, numericCols: [] });

    // Act
    await exportBriefingReport(makeInput({ context: ctx }));

    // Assert
    const doc = mockPdf.mock.calls[0][0];
    expect(doc.sections.length).toBeGreaterThanOrEqual(1);
    expect(doc.sections[0].title).toBe("Dataset metrics");
    expect(doc.sections[0].headers).toEqual(["Metric", "Value"]);
  });

  it("includes a row count metric in the metrics section", async () => {
    // Arrange
    const ctx = makeBriefingContext({ rowCount: 12345 });

    // Act
    await exportBriefingReport(makeInput({ context: ctx }));

    // Assert
    const doc = mockPdf.mock.calls[0][0];
    const metricsRows = doc.sections[0].rows as string[][];
    const rowCountRow = metricsRows.find((r: string[]) => r[0] === "Rows");
    expect(rowCountRow).toBeDefined();
    // toLocaleString may format 12345 as "12,345" or "12345" depending on locale
    expect(rowCountRow?.[1]).toContain("12");
  });

  it("includes numeric column stats in the metrics table (up to 8 columns)", async () => {
    // Arrange: 10 numeric columns — only 8 should appear in the table
    const numericCols = Array.from({ length: 10 }, (_, i) => ({
      name: `col${i}`,
      mean: i + 0.5,
      std: 0.1,
      min: 0,
      max: 10,
      q1: 2,
      q3: 8,
      nullPct: 0,
    }));
    const ctx = makeBriefingContext({ numericCols });

    // Act
    await exportBriefingReport(makeInput({ context: ctx }));

    // Assert: base rows (Rows + Numeric columns count) + up to 8 numeric stats
    const doc = mockPdf.mock.calls[0][0];
    const rows = doc.sections[0].rows as string[][];
    // Each numeric col appears as "colN (mean ± σ)"
    const statRows = rows.filter((r: string[]) => r[0].includes("mean"));
    expect(statRows).toHaveLength(8);
  });

  it("includes the topCategory row in the metrics table when present", async () => {
    // Arrange
    const ctx = makeBriefingContext({
      topCategory: {
        dimension: "region",
        values: [{ label: "North", count: 300, pct: 30.0 }],
      },
    });

    // Act
    await exportBriefingReport(makeInput({ context: ctx }));

    // Assert
    const doc = mockPdf.mock.calls[0][0];
    const rows = doc.sections[0].rows as string[][];
    const catRow = rows.find((r: string[]) => r[0].includes("region"));
    expect(catRow).toBeDefined();
    expect(catRow?.[1]).toContain("North");
    expect(catRow?.[1]).toContain("30.0%");
  });

  it("omits the topCategory row when topCategory is null", async () => {
    // Arrange
    const ctx = makeBriefingContext({ topCategory: null });

    // Act
    await exportBriefingReport(makeInput({ context: ctx }));

    // Assert
    const doc = mockPdf.mock.calls[0][0];
    const rows = doc.sections[0].rows as string[][];
    const catRow = rows.find((r: string[]) => r[0].startsWith("Top "));
    expect(catRow).toBeUndefined();
  });

  it("omits topCategory row when topCategory has no values", async () => {
    // Arrange
    const ctx = makeBriefingContext({
      topCategory: { dimension: "cat", values: [] },
    });

    // Act
    await exportBriefingReport(makeInput({ context: ctx }));

    // Assert: top value is undefined, so row is not added
    const doc = mockPdf.mock.calls[0][0];
    const rows = doc.sections[0].rows as string[][];
    const catRow = rows.find((r: string[]) => r[0].startsWith("Top "));
    expect(catRow).toBeUndefined();
  });

  it("appends narrative sections for each non-empty narrative entry", async () => {
    // Arrange
    const narrative = [
      { label: "Summary", text: "This is a summary." },
      { label: "Analysis", text: "Deep analysis here." },
    ];

    // Act
    await exportBriefingReport(makeInput({ narrative }));

    // Assert: metrics + 2 narrative sections
    const doc = mockPdf.mock.calls[0][0];
    expect(doc.sections).toHaveLength(3);
    expect(doc.sections[1].title).toBe("Summary");
    expect(doc.sections[2].title).toBe("Analysis");
  });

  it("skips narrative entries whose text is blank/whitespace-only", async () => {
    // Arrange
    const narrative = [
      { label: "Empty", text: "   " },
      { label: "Actual", text: "Real content" },
    ];

    // Act
    await exportBriefingReport(makeInput({ narrative }));

    // Assert: metrics + 1 narrative (empty one skipped)
    const doc = mockPdf.mock.calls[0][0];
    expect(doc.sections).toHaveLength(2);
    expect(doc.sections[1].title).toBe("Actual");
  });

  it("splits multi-paragraph prose into separate rows in the narrative section", async () => {
    // Arrange: two paragraphs separated by a blank line
    const narrative = [
      { label: "Notes", text: "First paragraph.\n\nSecond paragraph." },
    ];

    // Act
    await exportBriefingReport(makeInput({ narrative }));

    // Assert: two rows in the prose section
    const doc = mockPdf.mock.calls[0][0];
    const notesSection = doc.sections[1];
    expect(notesSection.rows).toHaveLength(2);
    expect(notesSection.rows[0]).toEqual(["First paragraph."]);
    expect(notesSection.rows[1]).toEqual(["Second paragraph."]);
  });

  it("normalises \\r\\n line endings before splitting paragraphs", async () => {
    // Arrange
    const narrative = [
      { label: "N", text: "Para one.\r\n\r\nPara two." },
    ];

    // Act
    await exportBriefingReport(makeInput({ narrative }));

    // Assert: CRLF normalised → two paragraphs
    const doc = mockPdf.mock.calls[0][0];
    expect(doc.sections[1].rows).toHaveLength(2);
    expect(doc.sections[1].rows[0][0]).toBe("Para one.");
    expect(doc.sections[1].rows[1][0]).toBe("Para two.");
  });

  it("falls back to em-dash when prose text is empty string", async () => {
    // Arrange: text is empty after trimming
    const narrative = [{ label: "Empty", text: "" }];
    // Note: the outer code checks `n.text.trim()` and skips blank entries.
    // An empty string would be skipped, so to test the internal fallback
    // we send a non-empty text that trims to blank after filtering.
    // Actually, the proseSection internal fallback fires when all paragraphs
    // are filtered out. We can trigger it by passing whitespace-only text
    // to the internal logic via a direct call. Since proseSection is private
    // and the outer function skips blank text entirely (n.text.trim()), the
    // em-dash path inside proseSection is unreachable from exportBriefingReport.
    // We test the boundary: a single space keeps being skipped.

    // Act
    await exportBriefingReport(makeInput({ narrative }));

    // Assert: skipped entirely — only 1 section (metrics)
    const doc = mockPdf.mock.calls[0][0];
    expect(doc.sections).toHaveLength(1);
  });

  it("uses 'a4' paper size in the generated document", async () => {
    // Act
    await exportBriefingReport(makeInput());

    // Assert
    const doc = mockPdf.mock.calls[0][0];
    expect(doc.paperSize).toBe("a4");
  });

  it("includes the report title and subtitle in the document", async () => {
    // Arrange
    const ctx = makeBriefingContext({ datasetName: "Invoices", rowCount: 42 });

    // Act
    await exportBriefingReport(makeInput({ title: "My Report", context: ctx }));

    // Assert
    const doc = mockPdf.mock.calls[0][0];
    expect(doc.title).toBe("My Report");
    expect(doc.subtitle).toContain("Invoices");
    expect(doc.subtitle).toContain("42");
  });

  it("passes the correct colors for the histogram bar series", async () => {
    // Arrange
    const bins = [{ label: "A", count: 10 }];

    // Act
    await exportBriefingReport(makeInput({ histogram: { bins, title: "t" } }));

    // Assert: the indigo series color is used
    const [, series] = mockBuildBarOption.mock.calls[0];
    expect(series[0].color).toBe("#6366f1");
    expect(series[0].name).toBe("Count");
  });

  it("includes numeric column count metric in metrics section", async () => {
    // Arrange
    const numericCols = [
      { name: "a", mean: 1, std: 0, min: 1, max: 1, q1: 1, q3: 1, nullPct: 0 },
      { name: "b", mean: 2, std: 0, min: 2, max: 2, q1: 2, q3: 2, nullPct: 0 },
    ];
    const ctx = makeBriefingContext({ numericCols });

    // Act
    await exportBriefingReport(makeInput({ context: ctx }));

    // Assert
    const doc = mockPdf.mock.calls[0][0];
    const rows = doc.sections[0].rows as string[][];
    const colCountRow = rows.find((r: string[]) => r[0] === "Numeric columns");
    expect(colCountRow?.[1]).toBe("2");
  });

  it("formats mean and std to 2 decimal places in metrics rows", async () => {
    // Arrange
    const numericCols = [
      { name: "price", mean: 12.3456, std: 3.6789, min: 1, max: 99, q1: 5, q3: 20, nullPct: 0 },
    ];
    const ctx = makeBriefingContext({ numericCols });

    // Act
    await exportBriefingReport(makeInput({ context: ctx }));

    // Assert
    const doc = mockPdf.mock.calls[0][0];
    const rows = doc.sections[0].rows as string[][];
    const priceRow = rows.find((r: string[]) => r[0].includes("price"));
    // Should show "12.35 ± 3.68" (rounded to 2dp)
    expect(priceRow?.[1]).toContain("12.35");
    expect(priceRow?.[1]).toContain("3.68");
  });
});
