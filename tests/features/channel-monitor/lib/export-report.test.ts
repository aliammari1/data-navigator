import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — declared before importing the module under test.
// ---------------------------------------------------------------------------

// Mock return values for the platform/viz proxies and saveBytes.
const mockGetChartProxy = vi.fn();
const mockGetExportProxy = vi.fn();
const mockSaveBytes = vi.fn();

vi.mock("@/platform/viz", () => ({
  getChartProxy: () => mockGetChartProxy(),
  getExportProxy: () => mockGetExportProxy(),
  saveBytes: (...args: unknown[]) => mockSaveBytes(...args),
}));

// ---------------------------------------------------------------------------
// Target module — imported AFTER mocks.
// ---------------------------------------------------------------------------

import { exportAlertHistory } from "@/features/channel-monitor/lib/export-report";
import type { AlertEvent } from "@/features/channel-monitor/store/monitor-store";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<AlertEvent> = {}): AlertEvent {
  return {
    id: "evt-1",
    ruleId: "rule-1",
    channel: "bill_payment",
    metric: "success_rate",
    severity: "critical",
    triggeredAt: "2026-01-15T10:30:00.000Z",
    actualValue: 88.5,
    threshold: 90,
    acknowledged: false,
    label: "SR low",
    ...overrides,
  };
}

/** Minimal EChartsOption fixture. */
const SCATTER_OPTION = { series: [{ type: "scatter", data: [] }] };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeChartProxy(svgResult: string | Error = "<svg/>") {
  return {
    renderToSVGString: vi.fn(async (_opt: unknown, _w: number, _h: number) => {
      if (svgResult instanceof Error) throw svgResult;
      return svgResult;
    }),
  };
}

function makeExportProxy(
  options: {
    pdfResult?: ArrayBuffer;
    xlsxResult?: ArrayBuffer;
    pdfError?: Error;
    xlsxError?: Error;
  } = {},
) {
  const pdfBuf = options.pdfResult ?? new ArrayBuffer(4);
  const xlsxBuf = options.xlsxResult ?? new ArrayBuffer(8);
  return {
    pdf: vi.fn(async () => {
      if (options.pdfError) throw options.pdfError;
      return pdfBuf;
    }),
    xlsx: vi.fn(async () => {
      if (options.xlsxError) throw options.xlsxError;
      return xlsxBuf;
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests — exportAlertHistory: no export proxy
// ---------------------------------------------------------------------------

describe("exportAlertHistory — no export proxy available", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when getExportProxy() returns null", async () => {
    // Arrange
    mockGetExportProxy.mockReturnValue(null);
    mockGetChartProxy.mockReturnValue(null);

    // Act
    const result = await exportAlertHistory([makeEvent()], { kind: "xlsx" });

    // Assert
    expect(result).toBeNull();
  });

  it("does not call saveBytes when export proxy is null", async () => {
    // Arrange
    mockGetExportProxy.mockReturnValue(null);
    mockGetChartProxy.mockReturnValue(null);

    // Act
    await exportAlertHistory([], { kind: "pdf" });

    // Assert
    expect(mockSaveBytes).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests — exportAlertHistory: xlsx export, no scatter option
// ---------------------------------------------------------------------------

describe("exportAlertHistory — xlsx export without scatterOption", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls exp.xlsx (not exp.pdf) and saveBytes with xlsx kind", async () => {
    // Arrange
    const xlsxBuf = new ArrayBuffer(16);
    const expProxy = makeExportProxy({ xlsxResult: xlsxBuf });
    mockGetExportProxy.mockReturnValue(expProxy);
    mockGetChartProxy.mockReturnValue(null);
    mockSaveBytes.mockResolvedValue({ saved: true, path: "/tmp/alert-history.xlsx" });

    const events = [makeEvent()];

    // Act
    const result = await exportAlertHistory(events, { kind: "xlsx" });

    // Assert
    expect(expProxy.xlsx).toHaveBeenCalledTimes(1);
    expect(expProxy.pdf).not.toHaveBeenCalled();
    expect(mockSaveBytes).toHaveBeenCalledWith(
      xlsxBuf,
      expect.stringMatching(/^alert-history-\d{4}-\d{2}-\d{2}\.xlsx$/),
      "xlsx",
    );
    expect(result).toEqual({ saved: true, path: "/tmp/alert-history.xlsx" });
  });

  it("passes a ReportDocument without charts when scatterOption is absent", async () => {
    // Arrange
    const expProxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(expProxy);
    mockGetChartProxy.mockReturnValue(null);
    mockSaveBytes.mockResolvedValue({ saved: true });

    // Act
    await exportAlertHistory([makeEvent()], { kind: "xlsx" });

    // Assert: doc.charts should be undefined, includeCharts false
    const doc = expProxy.xlsx.mock.calls[0][0] as {
      charts: unknown;
      includeCharts: boolean;
      title: string;
    };
    expect(doc.charts).toBeUndefined();
    expect(doc.includeCharts).toBe(false);
    expect(doc.title).toBe("Channel Alert History");
  });

  it("includes correct subtitle with event count", async () => {
    // Arrange
    const expProxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(expProxy);
    mockGetChartProxy.mockReturnValue(null);
    mockSaveBytes.mockResolvedValue({ saved: true });
    const events = [makeEvent(), makeEvent({ id: "evt-2" })];

    // Act
    await exportAlertHistory(events, { kind: "xlsx" });

    // Assert
    const doc = expProxy.xlsx.mock.calls[0][0] as { subtitle: string };
    expect(doc.subtitle).toMatch(/^2 events/);
  });

  it("includes sections with the alert events table", async () => {
    // Arrange
    const expProxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(expProxy);
    mockGetChartProxy.mockReturnValue(null);
    mockSaveBytes.mockResolvedValue({ saved: true });

    // Act
    await exportAlertHistory([makeEvent()], { kind: "xlsx" });

    // Assert
    const doc = expProxy.xlsx.mock.calls[0][0] as {
      sections: Array<{ title: string; headers: string[]; rows: unknown[][] }>;
    };
    expect(doc.sections).toHaveLength(1);
    expect(doc.sections[0].title).toBe("Alert Events");
    expect(doc.sections[0].headers).toContain("Triggered");
    expect(doc.sections[0].headers).toContain("Channel");
  });
});

// ---------------------------------------------------------------------------
// Tests — exportAlertHistory: pdf export, no scatter option
// ---------------------------------------------------------------------------

describe("exportAlertHistory — pdf export without scatterOption", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls exp.pdf (not exp.xlsx) and saveBytes with pdf kind", async () => {
    // Arrange
    const pdfBuf = new ArrayBuffer(32);
    const expProxy = makeExportProxy({ pdfResult: pdfBuf });
    mockGetExportProxy.mockReturnValue(expProxy);
    mockGetChartProxy.mockReturnValue(null);
    mockSaveBytes.mockResolvedValue({ saved: true, path: "/tmp/alert.pdf" });

    // Act
    const result = await exportAlertHistory([makeEvent()], { kind: "pdf" });

    // Assert
    expect(expProxy.pdf).toHaveBeenCalledTimes(1);
    expect(expProxy.xlsx).not.toHaveBeenCalled();
    expect(mockSaveBytes).toHaveBeenCalledWith(
      pdfBuf,
      expect.stringMatching(/^alert-history-\d{4}-\d{2}-\d{2}\.pdf$/),
      "pdf",
    );
    expect(result).toEqual({ saved: true, path: "/tmp/alert.pdf" });
  });

  it("sets paperSize to a4 on the ReportDocument", async () => {
    // Arrange
    const expProxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(expProxy);
    mockGetChartProxy.mockReturnValue(null);
    mockSaveBytes.mockResolvedValue({ saved: true });

    // Act
    await exportAlertHistory([makeEvent()], { kind: "pdf" });

    // Assert
    const doc = expProxy.pdf.mock.calls[0][0] as { paperSize: string };
    expect(doc.paperSize).toBe("a4");
  });
});

// ---------------------------------------------------------------------------
// Tests — exportAlertHistory: with scatterOption, chart proxy returns SVG
// ---------------------------------------------------------------------------

describe("exportAlertHistory — with scatterOption and chart proxy available", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("embeds a ChartImage in the document when the chart proxy succeeds", async () => {
    // Arrange
    const chartProxy = makeChartProxy("<svg>test</svg>");
    mockGetChartProxy.mockReturnValue(chartProxy);
    const expProxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(expProxy);
    mockSaveBytes.mockResolvedValue({ saved: true });

    // Act
    await exportAlertHistory([makeEvent()], {
      kind: "xlsx",
      scatterOption: SCATTER_OPTION,
    });

    // Assert
    const doc = expProxy.xlsx.mock.calls[0][0] as {
      charts: Array<{ svg: string; width: number; height: number }>;
      includeCharts: boolean;
    };
    expect(doc.charts).toHaveLength(1);
    expect(doc.charts[0].svg).toBe("<svg>test</svg>");
    expect(doc.charts[0].width).toBe(800);
    expect(doc.charts[0].height).toBe(320);
    expect(doc.includeCharts).toBe(true);
  });

  it("calls renderToSVGString with 800×320", async () => {
    // Arrange
    const chartProxy = makeChartProxy("<svg/>");
    mockGetChartProxy.mockReturnValue(chartProxy);
    const expProxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(expProxy);
    mockSaveBytes.mockResolvedValue({ saved: true });

    // Act
    await exportAlertHistory([makeEvent()], {
      kind: "xlsx",
      scatterOption: SCATTER_OPTION,
    });

    // Assert
    expect(chartProxy.renderToSVGString).toHaveBeenCalledWith(SCATTER_OPTION, 800, 320);
  });
});

// ---------------------------------------------------------------------------
// Tests — buildChartImage: chart proxy is null
// ---------------------------------------------------------------------------

describe("exportAlertHistory — scatterOption provided but chart proxy is null", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("leaves charts undefined when chart proxy is not available", async () => {
    // Arrange: no chart proxy
    mockGetChartProxy.mockReturnValue(null);
    const expProxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(expProxy);
    mockSaveBytes.mockResolvedValue({ saved: true });

    // Act
    await exportAlertHistory([makeEvent()], {
      kind: "xlsx",
      scatterOption: SCATTER_OPTION,
    });

    // Assert
    const doc = expProxy.xlsx.mock.calls[0][0] as {
      charts: unknown;
      includeCharts: boolean;
    };
    expect(doc.charts).toBeUndefined();
    expect(doc.includeCharts).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests — buildChartImage: chart proxy throws
// ---------------------------------------------------------------------------

describe("exportAlertHistory — chart proxy renderToSVGString throws", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns undefined for the chart and continues when renderToSVGString throws", async () => {
    // Arrange: chart proxy throws
    const chartProxy = makeChartProxy(new Error("OffscreenCanvas not supported"));
    mockGetChartProxy.mockReturnValue(chartProxy);
    const expProxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(expProxy);
    mockSaveBytes.mockResolvedValue({ saved: true });

    // Act — must not throw
    await expect(
      exportAlertHistory([makeEvent()], {
        kind: "xlsx",
        scatterOption: SCATTER_OPTION,
      }),
    ).resolves.not.toThrow();

    // Assert: charts is undefined because buildChartImage caught the error
    const doc = expProxy.xlsx.mock.calls[0][0] as {
      charts: unknown;
      includeCharts: boolean;
    };
    expect(doc.charts).toBeUndefined();
    expect(doc.includeCharts).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests — buildEventTable row building
// ---------------------------------------------------------------------------

describe("buildEventTable — row content via ReportDocument sections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps acknowledged=true to 'yes' in the row", async () => {
    // Arrange
    const expProxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(expProxy);
    mockGetChartProxy.mockReturnValue(null);
    mockSaveBytes.mockResolvedValue({ saved: true });
    const event = makeEvent({ acknowledged: true });

    // Act
    await exportAlertHistory([event], { kind: "xlsx" });

    // Assert: last cell of the row is "yes"
    const doc = expProxy.xlsx.mock.calls[0][0] as {
      sections: Array<{ rows: unknown[][] }>;
    };
    const row = doc.sections[0].rows[0];
    expect(row[row.length - 1]).toBe("yes");
  });

  it("maps acknowledged=false to 'no' in the row", async () => {
    // Arrange
    const expProxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(expProxy);
    mockGetChartProxy.mockReturnValue(null);
    mockSaveBytes.mockResolvedValue({ saved: true });
    const event = makeEvent({ acknowledged: false });

    // Act
    await exportAlertHistory([event], { kind: "xlsx" });

    // Assert
    const doc = expProxy.xlsx.mock.calls[0][0] as {
      sections: Array<{ rows: unknown[][] }>;
    };
    const row = doc.sections[0].rows[0];
    expect(row[row.length - 1]).toBe("no");
  });

  it("rounds actualValue to 2 decimal places in the row", async () => {
    // Arrange
    const expProxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(expProxy);
    mockGetChartProxy.mockReturnValue(null);
    mockSaveBytes.mockResolvedValue({ saved: true });
    const event = makeEvent({ actualValue: 88.12345 });

    // Act
    await exportAlertHistory([event], { kind: "xlsx" });

    // Assert: actualValue column (index 4) is rounded to 2dp
    const doc = expProxy.xlsx.mock.calls[0][0] as {
      sections: Array<{ rows: unknown[][] }>;
    };
    const row = doc.sections[0].rows[0];
    // Row is [Triggered, Channel, Severity, Metric, Actual, Threshold, Acknowledged]
    expect(row[4]).toBe(88.12);
  });

  it("uses the channelLabel to resolve a known channel key", async () => {
    // Arrange
    const expProxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(expProxy);
    mockGetChartProxy.mockReturnValue(null);
    mockSaveBytes.mockResolvedValue({ saved: true });
    const event = makeEvent({ channel: "bill_payment" });

    // Act
    await exportAlertHistory([event], { kind: "xlsx" });

    // Assert: channel column (index 1) is the friendly label
    const doc = expProxy.xlsx.mock.calls[0][0] as {
      sections: Array<{ rows: unknown[][] }>;
    };
    const row = doc.sections[0].rows[0];
    expect(row[1]).toBe("Bill Payment");
  });

  it("falls back to the raw channel key when it is unknown", async () => {
    // Arrange
    const expProxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(expProxy);
    mockGetChartProxy.mockReturnValue(null);
    mockSaveBytes.mockResolvedValue({ saved: true });
    const event = makeEvent({ channel: "unknown_channel_xyz" });

    // Act
    await exportAlertHistory([event], { kind: "xlsx" });

    // Assert
    const doc = expProxy.xlsx.mock.calls[0][0] as {
      sections: Array<{ rows: unknown[][] }>;
    };
    const row = doc.sections[0].rows[0];
    expect(row[1]).toBe("unknown_channel_xyz");
  });

  it("uses metricLabel for the metric column", async () => {
    // Arrange
    const expProxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(expProxy);
    mockGetChartProxy.mockReturnValue(null);
    mockSaveBytes.mockResolvedValue({ saved: true });
    const event = makeEvent({ metric: "volume" });

    // Act
    await exportAlertHistory([event], { kind: "xlsx" });

    // Assert: metric column (index 3)
    const doc = expProxy.xlsx.mock.calls[0][0] as {
      sections: Array<{ rows: unknown[][] }>;
    };
    const row = doc.sections[0].rows[0];
    expect(row[3]).toBe("Volume");
  });

  it("builds rows for every event in the array", async () => {
    // Arrange
    const expProxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(expProxy);
    mockGetChartProxy.mockReturnValue(null);
    mockSaveBytes.mockResolvedValue({ saved: true });
    const events = [makeEvent({ id: "e1" }), makeEvent({ id: "e2" }), makeEvent({ id: "e3" })];

    // Act
    await exportAlertHistory(events, { kind: "xlsx" });

    // Assert
    const doc = expProxy.xlsx.mock.calls[0][0] as {
      sections: Array<{ rows: unknown[][] }>;
    };
    expect(doc.sections[0].rows).toHaveLength(3);
  });

  it("handles an empty events array gracefully", async () => {
    // Arrange
    const expProxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(expProxy);
    mockGetChartProxy.mockReturnValue(null);
    mockSaveBytes.mockResolvedValue({ saved: true });

    // Act
    await exportAlertHistory([], { kind: "xlsx" });

    // Assert: no rows, still a valid table section
    const doc = expProxy.xlsx.mock.calls[0][0] as {
      sections: Array<{ rows: unknown[][] }>;
    };
    expect(doc.sections[0].rows).toHaveLength(0);
    expect(doc.sections[0].title).toBe("Alert Events");
  });
});

// ---------------------------------------------------------------------------
// Tests — file name stamp format
// ---------------------------------------------------------------------------

describe("exportAlertHistory — file name format", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates a file name in the format alert-history-YYYY-MM-DD.xlsx", async () => {
    // Arrange
    const expProxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(expProxy);
    mockGetChartProxy.mockReturnValue(null);
    mockSaveBytes.mockResolvedValue({ saved: true });

    // Act
    await exportAlertHistory([], { kind: "xlsx" });

    // Assert
    const [, fileName] = mockSaveBytes.mock.calls[0] as [unknown, string, unknown];
    expect(fileName).toMatch(/^alert-history-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });

  it("generates a file name in the format alert-history-YYYY-MM-DD.pdf", async () => {
    // Arrange
    const expProxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(expProxy);
    mockGetChartProxy.mockReturnValue(null);
    mockSaveBytes.mockResolvedValue({ saved: true });

    // Act
    await exportAlertHistory([], { kind: "pdf" });

    // Assert
    const [, fileName] = mockSaveBytes.mock.calls[0] as [unknown, string, unknown];
    expect(fileName).toMatch(/^alert-history-\d{4}-\d{2}-\d{2}\.pdf$/);
  });
});

// ---------------------------------------------------------------------------
// Tests — saveBytes result is passed through
// ---------------------------------------------------------------------------

describe("exportAlertHistory — passes saveBytes result through", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the exact SaveResult from saveBytes", async () => {
    // Arrange
    const expProxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(expProxy);
    mockGetChartProxy.mockReturnValue(null);
    const saveResult = { saved: true, path: "/downloads/alert-history-2026-01-15.xlsx" };
    mockSaveBytes.mockResolvedValue(saveResult);

    // Act
    const result = await exportAlertHistory([makeEvent()], { kind: "xlsx" });

    // Assert
    expect(result).toEqual(saveResult);
  });

  it("returns saved=false when saveBytes reports the dialog was cancelled", async () => {
    // Arrange
    const expProxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(expProxy);
    mockGetChartProxy.mockReturnValue(null);
    mockSaveBytes.mockResolvedValue({ saved: false });

    // Act
    const result = await exportAlertHistory([makeEvent()], { kind: "pdf" });

    // Assert
    expect(result).toEqual({ saved: false });
  });
});

// ---------------------------------------------------------------------------
// Tests — pdf with chart embedded
// ---------------------------------------------------------------------------

describe("exportAlertHistory — pdf with chart proxy and scatter option", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("embeds chart in pdf ReportDocument when chart proxy succeeds", async () => {
    // Arrange
    const chartProxy = makeChartProxy("<svg>chart-content</svg>");
    mockGetChartProxy.mockReturnValue(chartProxy);
    const expProxy = makeExportProxy();
    mockGetExportProxy.mockReturnValue(expProxy);
    mockSaveBytes.mockResolvedValue({ saved: true });

    // Act
    await exportAlertHistory([makeEvent()], {
      kind: "pdf",
      scatterOption: SCATTER_OPTION,
    });

    // Assert
    const doc = expProxy.pdf.mock.calls[0][0] as {
      charts: Array<{ svg: string }>;
      includeCharts: boolean;
    };
    expect(doc.charts).toHaveLength(1);
    expect(doc.charts[0].svg).toBe("<svg>chart-content</svg>");
    expect(doc.includeCharts).toBe(true);
  });
});
