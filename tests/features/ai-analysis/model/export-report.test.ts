import { beforeEach, describe, expect, it, vi } from "vitest";
import { exportAnalysisReport, type ReportInput } from "@/features/ai-analysis/model/export-report";

// ─── Mock external platform dependencies ─────────────────────────────────────
//
// The module imports getChartProxy, getExportProxy, and saveBytes from
// @/platform/viz.  We swap them out for vi.fn() stubs so the real logic in
// export-report.ts (buildSections, renderChartSvgs, fmt, …) runs against our
// fakes without touching real workers, OffscreenCanvas, or the file system.

const mockSaveBytes = vi.fn();
const mockChartProxy = {
  renderToSVGString: vi.fn(),
};
const mockExportProxy = {
  pdf: vi.fn(),
  docx: vi.fn(),
  pptx: vi.fn(),
  xlsx: vi.fn(),
};

vi.mock("@/platform/viz", () => ({
  getChartProxy: vi.fn(),
  getExportProxy: vi.fn(),
  saveBytes: (...args: unknown[]) => mockSaveBytes(...args),
}));

import { getChartProxy, getExportProxy } from "@/platform/viz";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function baseInput(overrides: Partial<ReportInput> = {}): ReportInput {
  return {
    datasetName: "telecom",
    rowCount: 1000,
    insights: [],
    anomalies: [],
    correlations: [],
    colStats: [],
    forecastMeta: { metricCol: null, dateCol: null, method: "none" },
    charts: [],
    ...overrides,
  };
}

function sampleBytes() {
  return new Uint8Array([1, 2, 3]);
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe("exportAnalysisReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: both proxies available, export returns bytes, save returns saved=true.
    (getExportProxy as ReturnType<typeof vi.fn>).mockReturnValue(mockExportProxy);
    (getChartProxy as ReturnType<typeof vi.fn>).mockReturnValue(null); // no chart rendering by default
    mockExportProxy.xlsx.mockResolvedValue(sampleBytes());
    mockExportProxy.pdf.mockResolvedValue(sampleBytes());
    mockExportProxy.docx.mockResolvedValue(sampleBytes());
    mockExportProxy.pptx.mockResolvedValue(sampleBytes());
    mockSaveBytes.mockResolvedValue({ saved: true });
  });

  // ── No export proxy ──────────────────────────────────────────────────────────

  it("returns { saved: false } immediately when no export proxy is available", async () => {
    // Arrange
    (getExportProxy as ReturnType<typeof vi.fn>).mockReturnValue(null);

    // Act
    const result = await exportAnalysisReport(baseInput());

    // Assert
    expect(result).toEqual({ saved: false });
    expect(mockSaveBytes).not.toHaveBeenCalled();
  });

  // ── Default kind (xlsx) ───────────────────────────────────────────────────────

  it("defaults to xlsx and calls exp.xlsx when no kind is provided", async () => {
    // Arrange
    const input = baseInput();

    // Act
    const result = await exportAnalysisReport(input);

    // Assert
    expect(mockExportProxy.xlsx).toHaveBeenCalledOnce();
    expect(mockExportProxy.pdf).not.toHaveBeenCalled();
    expect(result).toEqual({ saved: true });
  });

  it("passes xlsx to saveBytes with the correct filename and kind", async () => {
    // Arrange
    const input = baseInput({ datasetName: "my dataset" });

    // Act
    await exportAnalysisReport(input, "xlsx");

    // Assert — spaces and special chars replaced with _
    const [, fileName, kind] = mockSaveBytes.mock.calls[0];
    expect(fileName).toBe("ai-analysis-my_dataset.xlsx");
    expect(kind).toBe("xlsx");
  });

  // ── Kind routing ─────────────────────────────────────────────────────────────

  it("calls exp.pdf when kind is 'pdf'", async () => {
    // Arrange + Act
    await exportAnalysisReport(baseInput(), "pdf");

    // Assert
    expect(mockExportProxy.pdf).toHaveBeenCalledOnce();
    expect(mockExportProxy.xlsx).not.toHaveBeenCalled();
  });

  it("calls exp.docx when kind is 'docx'", async () => {
    await exportAnalysisReport(baseInput(), "docx");
    expect(mockExportProxy.docx).toHaveBeenCalledOnce();
  });

  it("calls exp.pptx when kind is 'pptx'", async () => {
    await exportAnalysisReport(baseInput(), "pptx");
    expect(mockExportProxy.pptx).toHaveBeenCalledOnce();
  });

  // ── saved flag propagates from saveBytes ─────────────────────────────────────

  it("returns { saved: false } when saveBytes reports saved=false", async () => {
    // Arrange
    mockSaveBytes.mockResolvedValue({ saved: false });

    // Act
    const result = await exportAnalysisReport(baseInput(), "xlsx");

    // Assert
    expect(result).toEqual({ saved: false });
  });

  // ── includeCharts flag ────────────────────────────────────────────────────────

  it("sets includeCharts=false for xlsx and does not attempt chart SVG rendering", async () => {
    // Arrange
    (getChartProxy as ReturnType<typeof vi.fn>).mockReturnValue(mockChartProxy);
    mockChartProxy.renderToSVGString.mockResolvedValue("<svg/>"); // would be called if charts requested

    // Act
    await exportAnalysisReport(baseInput({ charts: [{ title: "T", option: {}, width: 400, height: 300 }] }), "xlsx");

    // Assert — chart proxy never consulted for xlsx
    expect(mockChartProxy.renderToSVGString).not.toHaveBeenCalled();

    // The doc passed to xlsx should have includeCharts=false and charts=[]
    const doc = mockExportProxy.xlsx.mock.calls[0][0];
    expect(doc.includeCharts).toBe(false);
    expect(doc.charts).toEqual([]);
  });

  it("sets includeCharts=true for pdf and attempts chart SVG rendering", async () => {
    // Arrange
    (getChartProxy as ReturnType<typeof vi.fn>).mockReturnValue(mockChartProxy);
    mockChartProxy.renderToSVGString.mockResolvedValue("<svg>circle</svg>");

    const charts = [{ title: "Sales", option: {}, width: 600, height: 400 }];

    // Act
    await exportAnalysisReport(baseInput({ charts }), "pdf");

    // Assert
    expect(mockChartProxy.renderToSVGString).toHaveBeenCalledWith({}, 600, 400);

    const doc = mockExportProxy.pdf.mock.calls[0][0];
    expect(doc.includeCharts).toBe(true);
    expect(doc.charts).toHaveLength(1);
    expect(doc.charts[0].svg).toBe("<svg>circle</svg>");
  });

  // ── renderChartSvgs: no proxy ─────────────────────────────────────────────────

  it("skips chart rendering and produces empty charts array when chart proxy is null", async () => {
    // Arrange
    (getChartProxy as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const charts = [{ title: "X", option: {}, width: 200, height: 100 }];

    // Act
    await exportAnalysisReport(baseInput({ charts }), "pdf");

    // Assert
    const doc = mockExportProxy.pdf.mock.calls[0][0];
    expect(doc.charts).toEqual([]);
  });

  // ── renderChartSvgs: individual chart failure ─────────────────────────────────

  it("skips a chart that throws during SVG rendering without failing the whole report", async () => {
    // Arrange
    (getChartProxy as ReturnType<typeof vi.fn>).mockReturnValue(mockChartProxy);
    mockChartProxy.renderToSVGString
      .mockRejectedValueOnce(new Error("render error"))
      .mockResolvedValueOnce("<svg>good</svg>");

    const charts = [
      { title: "Bad", option: {}, width: 100, height: 100 },
      { title: "Good", option: {}, width: 200, height: 100 },
    ];

    // Act
    const result = await exportAnalysisReport(baseInput({ charts }), "pdf");

    // Assert — export still completes
    expect(result).toEqual({ saved: true });
    const doc = mockExportProxy.pdf.mock.calls[0][0];
    // Only the second (good) chart made it through
    expect(doc.charts).toHaveLength(1);
    expect(doc.charts[0].svg).toBe("<svg>good</svg>");
  });

  it("omits a chart whose renderToSVGString resolves to an empty/falsy string", async () => {
    // Arrange
    (getChartProxy as ReturnType<typeof vi.fn>).mockReturnValue(mockChartProxy);
    mockChartProxy.renderToSVGString.mockResolvedValue(""); // falsy → not pushed

    const charts = [{ title: "Empty", option: {}, width: 200, height: 150 }];

    // Act
    await exportAnalysisReport(baseInput({ charts }), "docx");

    // Assert
    const doc = mockExportProxy.docx.mock.calls[0][0];
    expect(doc.charts).toEqual([]);
  });

  // ── ReportDocument metadata ───────────────────────────────────────────────────

  it("constructs the doc title as 'AI Analysis — <datasetName>'", async () => {
    // Arrange
    const input = baseInput({ datasetName: "ACME" });

    // Act
    await exportAnalysisReport(input, "xlsx");

    // Assert
    const doc = mockExportProxy.xlsx.mock.calls[0][0];
    expect(doc.title).toBe("AI Analysis — ACME");
  });

  it("subtitle includes rowCount, colStats.length, and the 'offline' word", async () => {
    // Arrange
    const input = baseInput({
      rowCount: 5000,
      colStats: [
        { name: "a", type: "numeric", nullCount: 0, distinctCount: 10, rowCount: 5000 },
        { name: "b", type: "categorical", nullCount: 0, distinctCount: 3, rowCount: 5000 },
      ],
    });

    // Act
    await exportAnalysisReport(input, "xlsx");

    // Assert
    const doc = mockExportProxy.xlsx.mock.calls[0][0];
    expect(doc.subtitle).toContain("5,000 rows");
    expect(doc.subtitle).toContain("2 columns");
    expect(doc.subtitle).toContain("offline");
  });

  it("sets paperSize to 'a4'", async () => {
    // Act
    await exportAnalysisReport(baseInput(), "xlsx");
    // Assert
    const doc = mockExportProxy.xlsx.mock.calls[0][0];
    expect(doc.paperSize).toBe("a4");
  });

  // ── buildSections: insights ───────────────────────────────────────────────────

  it("omits the Key Insights section when insights array is empty", async () => {
    // Arrange
    const input = baseInput({ insights: [] });

    // Act
    await exportAnalysisReport(input, "xlsx");

    // Assert
    const doc = mockExportProxy.xlsx.mock.calls[0][0];
    expect(doc.sections.some((s: { title?: string }) => s.title === "Key Insights")).toBe(false);
  });

  it("adds a Key Insights section with correct headers when insights are provided", async () => {
    // Arrange
    const input = baseInput({
      insights: [
        {
          id: "i1",
          category: "anomaly",
          title: "Spike detected",
          severity: "critical",
          impact: "high",
          confidence: 0.92,
          description: "A spike was found",
          acknowledged: false,
        },
      ],
    });

    // Act
    await exportAnalysisReport(input, "xlsx");

    // Assert
    const doc = mockExportProxy.xlsx.mock.calls[0][0];
    const section = doc.sections.find((s: { title?: string }) => s.title === "Key Insights");
    expect(section).toBeDefined();
    expect(section.headers).toEqual([
      "Category",
      "Title",
      "Severity",
      "Impact",
      "Confidence",
      "Description",
    ]);
    // Confidence formatted as percentage
    expect(section.rows[0][4]).toBe("92%");
    expect(section.rows[0][0]).toBe("anomaly");
    expect(section.rows[0][1]).toBe("Spike detected");
    expect(section.rows[0][5]).toBe("A spike was found");
  });

  it("formats insight confidence correctly (e.g. 0.5 → '50%')", async () => {
    // Arrange
    const input = baseInput({
      insights: [
        {
          id: "i2",
          category: "trend",
          title: "T",
          severity: "info",
          impact: "low",
          confidence: 0.5,
          description: "D",
          acknowledged: false,
        },
      ],
    });

    // Act
    await exportAnalysisReport(input, "xlsx");

    // Assert
    const doc = mockExportProxy.xlsx.mock.calls[0][0];
    const section = doc.sections.find((s: { title?: string }) => s.title === "Key Insights");
    expect(section.rows[0][4]).toBe("50%");
  });

  // ── buildSections: anomalies ──────────────────────────────────────────────────

  it("omits the Anomalies section when anomalies array is empty", async () => {
    // Act
    await exportAnalysisReport(baseInput({ anomalies: [] }), "xlsx");
    const doc = mockExportProxy.xlsx.mock.calls[0][0];
    expect(doc.sections.some((s: { title?: string }) => s.title === "Anomalies")).toBe(false);
  });

  it("adds an Anomalies section with correct headers and row values", async () => {
    // Arrange
    const input = baseInput({
      anomalies: [
        {
          id: "iqr_amount",
          column: "amount",
          type: "outlier",
          method: "IQR (Tukey fence)",
          severity: "critical",
          affectedRows: 123,
          score: 0.75,
          description: "Outliers found",
        },
      ],
    });

    // Act
    await exportAnalysisReport(input, "xlsx");

    // Assert
    const doc = mockExportProxy.xlsx.mock.calls[0][0];
    const section = doc.sections.find((s: { title?: string }) => s.title === "Anomalies");
    expect(section).toBeDefined();
    expect(section.headers).toEqual(["Column", "Type", "Method", "Severity", "Affected rows", "Score"]);
    const row = section.rows[0];
    expect(row[0]).toBe("amount");        // column
    expect(row[1]).toBe("outlier");       // type
    expect(row[2]).toBe("IQR (Tukey fence)"); // method
    expect(row[3]).toBe("critical");      // severity
    expect(row[4]).toBe("123");           // affectedRows.toLocaleString()
    expect(row[5]).toBe("75.0%");         // score*100 .toFixed(1)
  });

  it("uses '—' for anomaly method when it is undefined", async () => {
    // Arrange
    const input = baseInput({
      anomalies: [
        {
          id: "skew_x",
          column: "x",
          type: "distribution_shift",
          severity: "warning",
          affectedRows: 0,
          score: 0.3,
          description: "Skewed",
          // method is intentionally omitted
        },
      ],
    });

    // Act
    await exportAnalysisReport(input, "xlsx");

    // Assert
    const doc = mockExportProxy.xlsx.mock.calls[0][0];
    const section = doc.sections.find((s: { title?: string }) => s.title === "Anomalies");
    expect(section.rows[0][2]).toBe("—");
  });

  // ── buildSections: correlations ───────────────────────────────────────────────

  it("omits the Correlations section when correlations array is empty", async () => {
    // Act
    await exportAnalysisReport(baseInput({ correlations: [] }), "xlsx");
    const doc = mockExportProxy.xlsx.mock.calls[0][0];
    expect(doc.sections.some((s: { title?: string }) => s.title === "Correlations")).toBe(false);
  });

  it("adds a Correlations section with Pearson r formatted to 3 decimal places", async () => {
    // Arrange
    const input = baseInput({
      correlations: [
        {
          col1: "amount",
          col2: "qty",
          pearson: 0.87654,
          strength: "very_strong",
          direction: "positive",
        },
      ],
    });

    // Act
    await exportAnalysisReport(input, "xlsx");

    // Assert
    const doc = mockExportProxy.xlsx.mock.calls[0][0];
    const section = doc.sections.find((s: { title?: string }) => s.title === "Correlations");
    expect(section).toBeDefined();
    expect(section.headers).toEqual(["Column A", "Column B", "Pearson r", "Strength", "Direction"]);
    const row = section.rows[0];
    expect(row[0]).toBe("amount");
    expect(row[1]).toBe("qty");
    expect(row[2]).toBe("0.877"); // fmt(0.87654, 3)
    // underscore in strength replaced with space
    expect(row[3]).toBe("very strong");
    expect(row[4]).toBe("positive");
  });

  it("replaces underscore in correlation strength with a space", async () => {
    // Arrange
    const input = baseInput({
      correlations: [
        { col1: "a", col2: "b", pearson: -0.6, strength: "very_strong", direction: "negative" },
      ],
    });

    // Act
    await exportAnalysisReport(input, "xlsx");

    // Assert
    const doc = mockExportProxy.xlsx.mock.calls[0][0];
    const section = doc.sections.find((s: { title?: string }) => s.title === "Correlations");
    expect(section.rows[0][3]).toBe("very strong");
  });

  // ── buildSections: column statistics ─────────────────────────────────────────

  it("omits Column Statistics when there are no numeric colStats", async () => {
    // Arrange – only a categorical stat
    const input = baseInput({
      colStats: [
        { name: "region", type: "categorical", nullCount: 0, distinctCount: 3, rowCount: 100 },
      ],
    });

    // Act
    await exportAnalysisReport(input, "xlsx");

    // Assert
    const doc = mockExportProxy.xlsx.mock.calls[0][0];
    expect(doc.sections.some((s: { title?: string }) => s.title === "Column Statistics")).toBe(false);
  });

  it("adds a Column Statistics section for numeric colStats with correct header and fmt values", async () => {
    // Arrange
    const input = baseInput({
      colStats: [
        {
          name: "amount",
          type: "numeric",
          min: 0,
          max: 100,
          avg: 50.1234,
          stddev: 10.5678,
          median: 49.99,
          skewness: 0.123456,
          nullCount: 5,
          distinctCount: 200,
          rowCount: 1000,
        },
      ],
    });

    // Act
    await exportAnalysisReport(input, "xlsx");

    // Assert
    const doc = mockExportProxy.xlsx.mock.calls[0][0];
    const section = doc.sections.find((s: { title?: string }) => s.title === "Column Statistics");
    expect(section).toBeDefined();
    expect(section.headers).toEqual([
      "Column",
      "Min",
      "Max",
      "Avg",
      "Std dev",
      "Median",
      "Skewness",
      "Nulls",
    ]);
    const row = section.rows[0];
    expect(row[0]).toBe("amount");
    expect(row[1]).toBe("0.00");       // fmt(0)
    expect(row[2]).toBe("100.00");     // fmt(100)
    expect(row[3]).toBe("50.12");      // fmt(50.1234, 2)
    expect(row[4]).toBe("10.57");      // fmt(10.5678, 2)
    expect(row[5]).toBe("49.99");      // fmt(49.99, 2)
    expect(row[6]).toBe("0.123");      // fmt(0.123456, 3)
    expect(row[7]).toBe("5");          // nullCount.toLocaleString()
  });

  it("formats undefined numeric stat fields as '—'", async () => {
    // Arrange – stat with no optional numeric fields set
    const input = baseInput({
      colStats: [
        {
          name: "sparse",
          type: "numeric",
          // min, max, avg, stddev, median, skewness all undefined
          nullCount: 0,
          distinctCount: 1,
          rowCount: 10,
        },
      ],
    });

    // Act
    await exportAnalysisReport(input, "xlsx");

    // Assert
    const doc = mockExportProxy.xlsx.mock.calls[0][0];
    const section = doc.sections.find((s: { title?: string }) => s.title === "Column Statistics");
    const row = section.rows[0];
    // All numeric fields undefined → fmt returns "—"
    expect(row[1]).toBe("—");  // min
    expect(row[2]).toBe("—");  // max
    expect(row[3]).toBe("—");  // avg
    expect(row[4]).toBe("—");  // stddev
    expect(row[5]).toBe("—");  // median
    expect(row[6]).toBe("—");  // skewness
  });

  it("formats Infinity and NaN stat fields as '—'", async () => {
    // Arrange
    const input = baseInput({
      colStats: [
        {
          name: "inf",
          type: "numeric",
          min: Infinity,
          max: -Infinity,
          avg: NaN,
          nullCount: 0,
          distinctCount: 0,
          rowCount: 0,
        },
      ],
    });

    // Act
    await exportAnalysisReport(input, "xlsx");

    // Assert
    const doc = mockExportProxy.xlsx.mock.calls[0][0];
    const section = doc.sections.find((s: { title?: string }) => s.title === "Column Statistics");
    const row = section.rows[0];
    expect(row[1]).toBe("—");  // Infinity
    expect(row[2]).toBe("—");  // -Infinity
    expect(row[3]).toBe("—");  // NaN
  });

  // ── filename sanitization ─────────────────────────────────────────────────────

  it("sanitizes special characters in datasetName for the filename", async () => {
    // Arrange
    const input = baseInput({ datasetName: "Sales/Q1 2024!Report" });

    // Act
    await exportAnalysisReport(input, "xlsx");

    // Assert
    const [, fileName] = mockSaveBytes.mock.calls[0];
    // Non-word chars (except . and -) replaced with _
    expect(fileName).toBe("ai-analysis-Sales_Q1_2024_Report.xlsx");
  });

  it("preserves dots and hyphens in the datasetName", async () => {
    // Arrange
    const input = baseInput({ datasetName: "data-v1.0" });

    // Act
    await exportAnalysisReport(input, "pdf");

    // Assert
    const [, fileName] = mockSaveBytes.mock.calls[0];
    expect(fileName).toBe("ai-analysis-data-v1.0.pdf");
  });

  // ── Full-pipeline smoke test: all sections populated ─────────────────────────

  it("produces all four sections when all input arrays are non-empty", async () => {
    // Arrange
    const input = baseInput({
      insights: [
        {
          id: "i1",
          category: "quality",
          title: "T",
          severity: "info",
          impact: "low",
          confidence: 0.8,
          description: "D",
          acknowledged: false,
        },
      ],
      anomalies: [
        {
          id: "a1",
          column: "x",
          type: "outlier",
          severity: "warning",
          affectedRows: 10,
          score: 0.5,
          description: "X",
        },
      ],
      correlations: [
        { col1: "a", col2: "b", pearson: 0.9, strength: "very_strong", direction: "positive" },
      ],
      colStats: [
        { name: "a", type: "numeric", min: 1, max: 2, avg: 1.5, nullCount: 0, distinctCount: 5, rowCount: 10 },
        { name: "cat", type: "categorical", nullCount: 0, distinctCount: 2, rowCount: 10 }, // not included in column stats table
      ],
    });

    // Act
    await exportAnalysisReport(input, "xlsx");

    // Assert
    const doc = mockExportProxy.xlsx.mock.calls[0][0];
    const titles = doc.sections.map((s: { title?: string }) => s.title);
    expect(titles).toContain("Key Insights");
    expect(titles).toContain("Anomalies");
    expect(titles).toContain("Correlations");
    expect(titles).toContain("Column Statistics");
  });

  // ── Chart rendering with multiple charts ──────────────────────────────────────

  it("renders multiple charts and passes all successful SVGs to the doc", async () => {
    // Arrange
    (getChartProxy as ReturnType<typeof vi.fn>).mockReturnValue(mockChartProxy);
    mockChartProxy.renderToSVGString
      .mockResolvedValueOnce("<svg>A</svg>")
      .mockResolvedValueOnce("<svg>B</svg>")
      .mockResolvedValueOnce("<svg>C</svg>");

    const charts = [
      { title: "A", option: { series: [] }, width: 400, height: 300 },
      { title: "B", option: { series: [] }, width: 500, height: 350 },
      { title: "C", option: { series: [] }, width: 600, height: 400 },
    ];

    // Act
    await exportAnalysisReport(baseInput({ charts }), "docx");

    // Assert
    const doc = mockExportProxy.docx.mock.calls[0][0];
    expect(doc.charts).toHaveLength(3);
    expect(doc.charts[0]).toMatchObject({ svg: "<svg>A</svg>", width: 400, height: 300 });
    expect(doc.charts[1]).toMatchObject({ svg: "<svg>B</svg>", width: 500, height: 350 });
    expect(doc.charts[2]).toMatchObject({ svg: "<svg>C</svg>", width: 600, height: 400 });
  });

  // ── pptx chart rendering ──────────────────────────────────────────────────────

  it("includes charts for pptx (not xlsx)", async () => {
    // Arrange
    (getChartProxy as ReturnType<typeof vi.fn>).mockReturnValue(mockChartProxy);
    mockChartProxy.renderToSVGString.mockResolvedValue("<svg>slide</svg>");

    const charts = [{ title: "Slide", option: {}, width: 960, height: 540 }];

    // Act
    await exportAnalysisReport(baseInput({ charts }), "pptx");

    // Assert
    expect(mockExportProxy.pptx).toHaveBeenCalledOnce();
    const doc = mockExportProxy.pptx.mock.calls[0][0];
    expect(doc.includeCharts).toBe(true);
    expect(doc.charts).toHaveLength(1);
  });
});
