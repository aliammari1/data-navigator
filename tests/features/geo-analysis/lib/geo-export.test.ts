import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GeoExportInput, GeoExportFormat } from "@/features/geo-analysis/lib/geo-export";

/**
 * Unit tests for geo-export.ts.
 *
 * The file's exported surface is `exportGeoReport`. All internal helpers
 * (regionSection, matrixSection, insightSection, heatmapOption, buildDocument,
 * timestampedName, renderHeatmapSvg) are exercised indirectly through that
 * function. The workers and platform proxies are mocked.
 */

// ── Mock @/platform/viz (workers + saveBytes) ────────────────────────────────

const mockPdf = vi.fn();
const mockXlsx = vi.fn();
const mockRenderToSVGString = vi.fn();
const mockSaveBytes = vi.fn();
const mockGetChartProxy = vi.fn();
const mockGetExportProxy = vi.fn();

vi.mock("@/platform/viz", () => ({
  getExportProxy: () => mockGetExportProxy(),
  getChartProxy: () => mockGetChartProxy(),
  saveBytes: (...args: unknown[]) => mockSaveBytes(...args),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMatrix(
  regions: string[] = ["North", "South"],
  channels: string[] = ["Mobile", "USSD"],
  shares: number[][] = [
    [60, 40],
    [30, 70],
  ],
) {
  return { regions, channels, shares };
}

function makeInput(overrides: Partial<GeoExportInput> = {}): GeoExportInput {
  return {
    datasetName: "Test Dataset",
    regions: [
      { rank: 1, name: "North", transactions: 1000, revenue: 50000, successRate: 95 },
      { rank: 2, name: "South", transactions: 500, revenue: 25000, successRate: 80 },
    ],
    totalTransactions: 1500,
    totalRevenue: 75000,
    avgSuccessRate: 90,
    matrix: makeMatrix(),
    dominantChannels: [
      { region: "North", channel: "Mobile", pct: 60 },
      { region: "South", channel: "USSD", pct: 70 },
    ],
    insight: null,
    ...overrides,
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Default: export worker available
  mockGetExportProxy.mockReturnValue({ pdf: mockPdf, xlsx: mockXlsx });
  // Default: chart proxy available and renders OK
  mockGetChartProxy.mockReturnValue({ renderToSVGString: mockRenderToSVGString });
  mockRenderToSVGString.mockResolvedValue("<svg>chart</svg>");
  // Default: pdf/xlsx return byte buffers
  mockPdf.mockResolvedValue(new Uint8Array([1, 2, 3]));
  mockXlsx.mockResolvedValue(new Uint8Array([4, 5, 6]));
  // Default: save dialog saves the file
  mockSaveBytes.mockResolvedValue({ saved: true, path: "/some/path/geo-analysis.pdf" });
});

// ── Import function under test after mocks are set up ─────────────────────────
// (dynamic import avoids top-level mock timing issues)
async function getExportFn() {
  const mod = await import("@/features/geo-analysis/lib/geo-export");
  return mod.exportGeoReport;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("exportGeoReport — worker unavailable guard", () => {
  it("throws when the export proxy is not available", async () => {
    const exportGeoReport = await getExportFn();
    mockGetExportProxy.mockReturnValue(null);

    await expect(exportGeoReport(makeInput(), "pdf")).rejects.toThrow(
      "Export worker is unavailable in this environment.",
    );
  });
});

describe("exportGeoReport — PDF format", () => {
  it("calls chart worker to render heatmap SVG for PDF", async () => {
    const exportGeoReport = await getExportFn();

    await exportGeoReport(makeInput(), "pdf");

    expect(mockGetChartProxy).toHaveBeenCalled();
    expect(mockRenderToSVGString).toHaveBeenCalledTimes(1);
  });

  it("calls exp.pdf() with a document containing charts when SVG renders OK", async () => {
    const exportGeoReport = await getExportFn();

    await exportGeoReport(makeInput(), "pdf");

    expect(mockPdf).toHaveBeenCalledTimes(1);
    const doc = mockPdf.mock.calls[0][0];
    expect(doc.title).toBe("Geographic & Network Analysis");
    expect(doc.includeCharts).toBe(true);
    expect(doc.charts).toHaveLength(1);
    expect(doc.charts[0].svg).toBe("<svg>chart</svg>");
    expect(doc.charts[0].width).toBe(900);
  });

  it("passes document subtitle containing totalTransactions, revenue, success rate, and datasetName", async () => {
    const exportGeoReport = await getExportFn();

    await exportGeoReport(makeInput(), "pdf");

    const doc = mockPdf.mock.calls[0][0];
    // subtitle must contain formatted numbers and dataset name
    expect(doc.subtitle).toContain("Test Dataset");
    expect(doc.subtitle).toContain("transactions");
    expect(doc.subtitle).toContain("revenue");
    expect(doc.subtitle).toContain("weighted success");
  });

  it("does NOT append datasetName to subtitle when datasetName is null", async () => {
    const exportGeoReport = await getExportFn();
    const input = makeInput({ datasetName: null });

    await exportGeoReport(input, "pdf");

    const doc = mockPdf.mock.calls[0][0];
    // datasetName part should be absent
    expect(doc.subtitle).not.toContain("·  ·");
    expect(doc.subtitle).not.toContain("null");
  });

  it("calls saveBytes with pdf mime and timestamped filename ending in .pdf", async () => {
    const exportGeoReport = await getExportFn();

    await exportGeoReport(makeInput(), "pdf");

    expect(mockSaveBytes).toHaveBeenCalledTimes(1);
    const [, filename, fmt] = mockSaveBytes.mock.calls[0];
    expect(filename).toMatch(/^geo-analysis-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.pdf$/);
    expect(fmt).toBe("pdf");
  });

  it("returns the saved path when the dialog confirms save", async () => {
    const exportGeoReport = await getExportFn();
    mockSaveBytes.mockResolvedValue({ saved: true, path: "/downloads/report.pdf" });

    const result = await exportGeoReport(makeInput(), "pdf");

    expect(result).toBe("/downloads/report.pdf");
  });

  it("returns null when the user cancels the save dialog", async () => {
    const exportGeoReport = await getExportFn();
    mockSaveBytes.mockResolvedValue({ saved: false });

    const result = await exportGeoReport(makeInput(), "pdf");

    expect(result).toBeNull();
  });

  it("returns null when saved=true but path is undefined", async () => {
    const exportGeoReport = await getExportFn();
    mockSaveBytes.mockResolvedValue({ saved: true, path: undefined });

    const result = await exportGeoReport(makeInput(), "pdf");

    expect(result).toBeNull();
  });
});

describe("exportGeoReport — XLSX format", () => {
  it("does NOT call the chart worker for xlsx (no chart embedding)", async () => {
    const exportGeoReport = await getExportFn();

    await exportGeoReport(makeInput(), "xlsx");

    expect(mockRenderToSVGString).not.toHaveBeenCalled();
  });

  it("calls exp.xlsx() and produces a document without charts", async () => {
    const exportGeoReport = await getExportFn();

    await exportGeoReport(makeInput(), "xlsx");

    expect(mockXlsx).toHaveBeenCalledTimes(1);
    const doc = mockXlsx.mock.calls[0][0];
    expect(doc.includeCharts).toBe(false);
    expect(doc.charts).toBeUndefined();
  });

  it("calls saveBytes with xlsx mime and filename ending in .xlsx", async () => {
    const exportGeoReport = await getExportFn();

    await exportGeoReport(makeInput(), "xlsx");

    const [, filename, fmt] = mockSaveBytes.mock.calls[0];
    expect(filename).toMatch(/^geo-analysis-.*\.xlsx$/);
    expect(fmt).toBe("xlsx");
  });

  it("returns null when user cancels for xlsx too", async () => {
    const exportGeoReport = await getExportFn();
    mockSaveBytes.mockResolvedValue({ saved: false });

    const result = await exportGeoReport(makeInput(), "xlsx");

    expect(result).toBeNull();
  });
});

describe("exportGeoReport — region table section", () => {
  it("includes a 'Regions by volume' section with 5 columns", async () => {
    const exportGeoReport = await getExportFn();

    await exportGeoReport(makeInput(), "xlsx");

    const doc = mockXlsx.mock.calls[0][0];
    const regionSection = doc.sections[0];
    expect(regionSection.title).toBe("Regions by volume");
    expect(regionSection.headers).toEqual([
      "Rank",
      "Region",
      "Transactions",
      "Revenue",
      "Success rate",
    ]);
    // Two regions in our input
    expect(regionSection.rows).toHaveLength(2);
    // First row rank is 1 and name is "North"
    expect(regionSection.rows[0][0]).toBe(1);
    expect(regionSection.rows[0][1]).toBe("North");
  });
});

describe("exportGeoReport — matrix section", () => {
  it("includes 'Channel distribution by region' section when matrix has regions", async () => {
    const exportGeoReport = await getExportFn();

    await exportGeoReport(makeInput(), "pdf");

    const doc = mockPdf.mock.calls[0][0];
    const matrixSection = doc.sections.find(
      (s: { title?: string }) => s.title === "Channel distribution by region (%)",
    );
    expect(matrixSection).toBeDefined();
    expect(matrixSection.headers).toEqual(["Region", "Mobile", "USSD"]);
    // Two regions
    expect(matrixSection.rows).toHaveLength(2);
    // First row: "North", 60.0%, 40.0%
    expect(matrixSection.rows[0][0]).toBe("North");
    expect(matrixSection.rows[0][1]).toBe("60.0%");
    expect(matrixSection.rows[0][2]).toBe("40.0%");
  });

  it("omits channel matrix section when matrix.regions is empty", async () => {
    const exportGeoReport = await getExportFn();
    const input = makeInput({
      matrix: makeMatrix([], [], []),
    });

    await exportGeoReport(input, "xlsx");

    const doc = mockXlsx.mock.calls[0][0];
    const matrixSection = doc.sections.find(
      (s: { title?: string }) => s.title === "Channel distribution by region (%)",
    );
    expect(matrixSection).toBeUndefined();
  });

  it("handles missing share values (undefined cell) with 0 fallback", async () => {
    const exportGeoReport = await getExportFn();
    // shares row shorter than channels
    const input = makeInput({
      matrix: {
        regions: ["North"],
        channels: ["Mobile", "USSD"],
        shares: [
          [50], // only one value, second is missing
        ],
      },
    });

    await exportGeoReport(input, "xlsx");

    const doc = mockXlsx.mock.calls[0][0];
    const matrixSection = doc.sections.find(
      (s: { title?: string }) => s.title === "Channel distribution by region (%)",
    );
    expect(matrixSection.rows[0][2]).toBe("0.0%");
  });
});

describe("exportGeoReport — insight section", () => {
  const insight = {
    headline: "North dominates volume",
    topRegions: [
      { region: "North", note: "Highest transaction volume" },
      { region: "East", note: "Growing revenue" },
    ],
    riskRegions: [{ region: "South", reason: "Low success rate" }],
    channelObservation: "Mobile is dominant everywhere",
    recommendation: "Focus on improving South success rate",
  };

  it("includes 'AI regional insights' section when insight is provided", async () => {
    const exportGeoReport = await getExportFn();
    const input = makeInput({ insight });

    await exportGeoReport(input, "xlsx");

    const doc = mockXlsx.mock.calls[0][0];
    const insightSection = doc.sections.find(
      (s: { title?: string }) => s.title === "AI regional insights",
    );
    expect(insightSection).toBeDefined();
    expect(insightSection.headers).toEqual(["Topic", "Detail"]);
  });

  it("includes headline, topRegions, riskRegions, channelObservation, recommendation rows", async () => {
    const exportGeoReport = await getExportFn();
    const input = makeInput({ insight });

    await exportGeoReport(input, "xlsx");

    const doc = mockXlsx.mock.calls[0][0];
    const insightSection = doc.sections.find(
      (s: { title?: string }) => s.title === "AI regional insights",
    );
    const rows = insightSection.rows as (string | number)[][];

    // Headline row
    expect(rows[0]).toEqual(["Headline", "North dominates volume"]);
    // Top region rows
    expect(rows[1]).toEqual(["Standout · North", "Highest transaction volume"]);
    expect(rows[2]).toEqual(["Standout · East", "Growing revenue"]);
    // Risk region row
    expect(rows[3]).toEqual(["At risk · South", "Low success rate"]);
    // Channel observation
    expect(rows[4]).toEqual(["Channel observation", "Mobile is dominant everywhere"]);
    // Recommendation
    expect(rows[5]).toEqual(["Recommendation", "Focus on improving South success rate"]);
  });

  it("omits insight section when insight is null", async () => {
    const exportGeoReport = await getExportFn();
    const input = makeInput({ insight: null });

    await exportGeoReport(input, "xlsx");

    const doc = mockXlsx.mock.calls[0][0];
    const insightSection = doc.sections.find(
      (s: { title?: string }) => s.title === "AI regional insights",
    );
    expect(insightSection).toBeUndefined();
  });
});

describe("exportGeoReport — chart rendering edge cases", () => {
  it("proceeds without chart when chart proxy returns null", async () => {
    const exportGeoReport = await getExportFn();
    mockGetChartProxy.mockReturnValue(null);

    await exportGeoReport(makeInput(), "pdf");

    const doc = mockPdf.mock.calls[0][0];
    expect(doc.includeCharts).toBe(false);
    expect(doc.charts).toBeUndefined();
  });

  it("proceeds without chart when chart proxy render throws", async () => {
    const exportGeoReport = await getExportFn();
    mockRenderToSVGString.mockRejectedValue(new Error("render failed"));

    await exportGeoReport(makeInput(), "pdf");

    const doc = mockPdf.mock.calls[0][0];
    expect(doc.includeCharts).toBe(false);
    expect(doc.charts).toBeUndefined();
  });

  it("skips chart rendering when matrix has no regions (even for PDF)", async () => {
    const exportGeoReport = await getExportFn();
    const input = makeInput({ matrix: makeMatrix([], [], []) });

    await exportGeoReport(input, "pdf");

    expect(mockRenderToSVGString).not.toHaveBeenCalled();
    const doc = mockPdf.mock.calls[0][0];
    expect(doc.includeCharts).toBe(false);
  });

  it("computes chart height as at least 360 px for a single-region matrix", async () => {
    const exportGeoReport = await getExportFn();
    // 1 region * 26 + 140 = 166 → clamped to 360
    const input = makeInput({
      matrix: makeMatrix(["OnlyRegion"], ["Mobile"], [[100]]),
    });

    await exportGeoReport(input, "pdf");

    expect(mockRenderToSVGString).toHaveBeenCalledWith(
      expect.objectContaining({ series: expect.any(Array) }),
      900,
      360,
    );
  });

  it("computes chart height proportional to region count for large matrices", async () => {
    const exportGeoReport = await getExportFn();
    // 20 regions * 26 + 140 = 660 > 360
    const regions = Array.from({ length: 20 }, (_, i) => `R${i}`);
    const shares = regions.map(() => [50, 50]);
    const input = makeInput({
      matrix: makeMatrix(regions, ["Mobile", "USSD"], shares),
    });

    await exportGeoReport(input, "pdf");

    expect(mockRenderToSVGString).toHaveBeenCalledWith(
      expect.any(Object),
      900,
      660, // 20 * 26 + 140
    );
  });
});

describe("exportGeoReport — document structure", () => {
  it("always sets paperSize to 'a4'", async () => {
    const exportGeoReport = await getExportFn();

    await exportGeoReport(makeInput(), "pdf");

    const doc = mockPdf.mock.calls[0][0];
    expect(doc.paperSize).toBe("a4");
  });

  it("always sets title to 'Geographic & Network Analysis'", async () => {
    const exportGeoReport = await getExportFn();

    await exportGeoReport(makeInput(), "xlsx");

    const doc = mockXlsx.mock.calls[0][0];
    expect(doc.title).toBe("Geographic & Network Analysis");
  });

  it("region section widths are correctly set", async () => {
    const exportGeoReport = await getExportFn();

    await exportGeoReport(makeInput(), "xlsx");

    const doc = mockXlsx.mock.calls[0][0];
    expect(doc.sections[0].widths).toEqual(["auto", "*", "auto", "auto", "auto"]);
  });
});
