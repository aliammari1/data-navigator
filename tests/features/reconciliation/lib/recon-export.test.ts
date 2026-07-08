import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Unit tests for recon-export.ts.
 *
 * Covers:
 *   - exportReconciliation: happy paths (pdf + xlsx), null guard when no
 *     export proxy, annotation enrichment, multi-measure headers, fmt helper
 *     (indirectly), buildSummarySection (indirectly), and the streaming
 *     pagination boundary (streamDiffRows returning < PAGE_SIZE terminates).
 *
 * External dependencies are fully mocked; the real module logic runs so it
 * contributes to coverage.
 */

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const mockRunReadOnlyQuery = vi.hoisted(() => vi.fn());
const mockPdf = vi.hoisted(() => vi.fn());
const mockXlsx = vi.hoisted(() => vi.fn());
const mockSaveBytes = vi.hoisted(() => vi.fn());
const mockGetExportProxy = vi.hoisted(() => vi.fn());

vi.mock("@/platform/duckdb/duckdb", () => ({
  runReadOnlyQuery: mockRunReadOnlyQuery,
}));

vi.mock("@/platform/viz", () => ({
  getExportProxy: () => mockGetExportProxy(),
  saveBytes: (...args: unknown[]) => mockSaveBytes(...args),
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import {
  exportReconciliation,
  type ReconExportInput,
} from "@/features/reconciliation/lib/recon-export";
import type { DiffConfig } from "@/features/reconciliation/lib/recon-sql";
import type { RowAnnotation } from "@/features/reconciliation/stores/annotations-store";

// ── Helpers ───────────────────────────────────────────────────────────────────

function baseConfig(overrides: Partial<DiffConfig> = {}): DiffConfig {
  return {
    expectedView: "exp_view",
    actualView: "act_view",
    keyCols: [{ expected: "channel", actual: "channel" }],
    measures: [{ label: "revenue", expected: "rev", actual: "rev" }],
    ...overrides,
  };
}

/** Build a single raw DuckDB row for one diff result. */
function rawDiffRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    key_0: "VOICE",
    diff_status: "CHANGED",
    exp_revenue: 1000,
    act_revenue: 1200,
    var_revenue: 200,
    varpct_revenue: 20,
    ...overrides,
  };
}

function baseAnnotations(): Record<string, RowAnnotation> {
  return {};
}

function makeInput(overrides: Partial<ReconExportInput> = {}): ReconExportInput {
  return {
    cfg: baseConfig(),
    summary: {
      rowsTotal: 10,
      rowsChanged: 3,
      rowsAdded: 1,
      rowsRemoved: 1,
      rowsUnchanged: 5,
      rowsMaterial: 2,
      totals: {
        revenue: { sumExpected: 5000, sumActual: 5200, sumVariance: 200 },
      },
    },
    annotations: baseAnnotations(),
    expectedLabel: "Budget",
    actualLabel: "Actual",
    kind: "xlsx",
    ...overrides,
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Default: export proxy is available
  mockGetExportProxy.mockReturnValue({ pdf: mockPdf, xlsx: mockXlsx });

  // Default: DuckDB returns one changed row, then empty (terminates the stream)
  mockRunReadOnlyQuery
    .mockResolvedValueOnce([rawDiffRow()])
    .mockResolvedValue([]); // subsequent pages → empty → stop

  // Default: pdf/xlsx return byte buffers
  mockPdf.mockResolvedValue(new Uint8Array([1, 2, 3]));
  mockXlsx.mockResolvedValue(new Uint8Array([4, 5, 6]));

  // Default: save dialog saves the file
  mockSaveBytes.mockResolvedValue({ saved: true, path: "/out/reconciliation-2026-06-25.xlsx" });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("exportReconciliation — null guard", () => {
  it("returns null immediately when no export proxy is available", async () => {
    // Arrange
    mockGetExportProxy.mockReturnValue(null);

    // Act
    const result = await exportReconciliation(makeInput());

    // Assert
    expect(result).toBeNull();
    expect(mockRunReadOnlyQuery).not.toHaveBeenCalled();
    expect(mockSaveBytes).not.toHaveBeenCalled();
  });
});

describe("exportReconciliation — XLSX happy path", () => {
  it("calls exp.xlsx() and saves the file", async () => {
    // Arrange
    const input = makeInput({ kind: "xlsx" });

    // Act
    const result = await exportReconciliation(input);

    // Assert
    expect(mockXlsx).toHaveBeenCalledTimes(1);
    expect(mockPdf).not.toHaveBeenCalled();
    expect(mockSaveBytes).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ saved: true, path: "/out/reconciliation-2026-06-25.xlsx" });
  });

  it("generates a filename with today's date and the .xlsx extension", async () => {
    // Arrange
    const input = makeInput({ kind: "xlsx" });

    // Act
    await exportReconciliation(input);

    // Assert — second argument to saveBytes is the filename
    const [, filename, kind] = mockSaveBytes.mock.calls[0];
    expect(filename).toMatch(/^reconciliation-\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(kind).toBe("xlsx");
  });

  it("passes document title 'Data Reconciliation Report' to the worker", async () => {
    // Arrange
    const input = makeInput({ kind: "xlsx" });

    // Act
    await exportReconciliation(input);

    // Assert
    const doc = mockXlsx.mock.calls[0][0];
    expect(doc.title).toBe("Data Reconciliation Report");
  });

  it("embeds expectedLabel and actualLabel in the subtitle", async () => {
    // Arrange
    const input = makeInput({ kind: "xlsx", expectedLabel: "Budget", actualLabel: "Actuals" });

    // Act
    await exportReconciliation(input);

    // Assert
    const doc = mockXlsx.mock.calls[0][0];
    expect(doc.subtitle).toContain("Budget");
    expect(doc.subtitle).toContain("Actuals");
  });

  it("subtitle contains the count of differences streamed from DuckDB", async () => {
    // Arrange: one diff row in the stream
    const input = makeInput({ kind: "xlsx" });

    // Act
    await exportReconciliation(input);

    // Assert: 1 difference in subtitle
    const doc = mockXlsx.mock.calls[0][0];
    expect(doc.subtitle).toContain("1 differences");
  });

  it("always sets paperSize to 'a4' and includeCharts to false", async () => {
    // Arrange
    const input = makeInput({ kind: "xlsx" });

    // Act
    await exportReconciliation(input);

    // Assert
    const doc = mockXlsx.mock.calls[0][0];
    expect(doc.paperSize).toBe("a4");
    expect(doc.includeCharts).toBe(false);
  });

  it("document has exactly two sections: summary and differences", async () => {
    // Arrange
    const input = makeInput({ kind: "xlsx" });

    // Act
    await exportReconciliation(input);

    // Assert
    const doc = mockXlsx.mock.calls[0][0];
    expect(doc.sections).toHaveLength(2);
    expect(doc.sections[0].title).toBe("Reconciliation Summary");
    expect(doc.sections[1].title).toBe("Differences");
  });
});

describe("exportReconciliation — PDF happy path", () => {
  it("calls exp.pdf() and saves the file", async () => {
    // Arrange
    const input = makeInput({ kind: "pdf" });

    // Act
    const result = await exportReconciliation(input);

    // Assert
    expect(mockPdf).toHaveBeenCalledTimes(1);
    expect(mockXlsx).not.toHaveBeenCalled();
    expect(result).toEqual({ saved: true, path: "/out/reconciliation-2026-06-25.xlsx" });
  });

  it("generates a filename ending in .pdf for PDF exports", async () => {
    // Arrange
    const input = makeInput({ kind: "pdf" });

    // Act
    await exportReconciliation(input);

    // Assert
    const [, filename, kind] = mockSaveBytes.mock.calls[0];
    expect(filename).toMatch(/^reconciliation-\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(kind).toBe("pdf");
  });
});

describe("exportReconciliation — summary section content", () => {
  it("summary rows include all six standard metrics", async () => {
    // Arrange
    const input = makeInput({
      kind: "xlsx",
      summary: {
        rowsTotal: 100,
        rowsChanged: 20,
        rowsAdded: 5,
        rowsRemoved: 3,
        rowsUnchanged: 72,
        rowsMaterial: 10,
        totals: {
          revenue: { sumExpected: 9000, sumActual: 9500, sumVariance: 500 },
        },
      },
    });

    // Act
    await exportReconciliation(input);

    // Assert
    const doc = mockXlsx.mock.calls[0][0];
    const summarySection = doc.sections[0];
    const labels = summarySection.rows.map((r: unknown[]) => r[0]);

    expect(labels).toContain("Rows total");
    expect(labels).toContain("Changed");
    expect(labels).toContain("Added (actual only)");
    expect(labels).toContain("Removed (expected only)");
    expect(labels).toContain("Unchanged");
    expect(labels).toContain("Material (threshold)");
  });

  it("summary section headers are ['Metric', 'Value']", async () => {
    // Arrange
    const input = makeInput({ kind: "xlsx" });

    // Act
    await exportReconciliation(input);

    // Assert
    const doc = mockXlsx.mock.calls[0][0];
    expect(doc.sections[0].headers).toEqual(["Metric", "Value"]);
  });

  it("summary section includes per-measure totals rows when totals exist", async () => {
    // Arrange
    const input = makeInput({
      kind: "xlsx",
      summary: {
        rowsTotal: 10,
        rowsChanged: 2,
        rowsAdded: 0,
        rowsRemoved: 0,
        rowsUnchanged: 8,
        rowsMaterial: 1,
        totals: {
          revenue: { sumExpected: 1000, sumActual: 1100, sumVariance: 100 },
        },
      },
    });

    // Act
    await exportReconciliation(input);

    // Assert
    const doc = mockXlsx.mock.calls[0][0];
    const summarySection = doc.sections[0];
    const labels = summarySection.rows.map((r: unknown[]) => r[0]);

    expect(labels.some((l: string) => l.includes("Σ expected"))).toBe(true);
    expect(labels.some((l: string) => l.includes("Σ actual"))).toBe(true);
    expect(labels.some((l: string) => l.includes("Σ variance"))).toBe(true);
  });

  it("summary section skips totals for a measure label not in cfg.measures", async () => {
    // Arrange: summary has a 'qty' total but cfg only has 'revenue'
    const input = makeInput({
      kind: "xlsx",
      summary: {
        rowsTotal: 5,
        rowsChanged: 1,
        rowsAdded: 0,
        rowsRemoved: 0,
        rowsUnchanged: 4,
        rowsMaterial: 0,
        totals: {
          // 'qty' is present in totals but not in cfg.measures → skipped
          qty: { sumExpected: 50, sumActual: 60, sumVariance: 10 },
        },
      },
    });

    // Act
    await exportReconciliation(input);

    // Assert: no Σ rows for 'qty' because measureLabels only has 'revenue'
    const doc = mockXlsx.mock.calls[0][0];
    const labels = doc.sections[0].rows.map((r: unknown[]) => String(r[0]));
    expect(labels.some((l: string) => l.includes("qty"))).toBe(false);
  });
});

describe("exportReconciliation — differences section content", () => {
  it("differences section has correct column headers for one measure", async () => {
    // Arrange
    const input = makeInput({ kind: "xlsx" });

    // Act
    await exportReconciliation(input);

    // Assert
    const doc = mockXlsx.mock.calls[0][0];
    const diffSection = doc.sections[1];
    expect(diffSection.headers).toEqual([
      "Key",
      "Status",
      "Exp revenue",
      "Act revenue",
      "Δ revenue",
      "Δ% revenue",
      "Reason",
      "Notes",
      "Escalated",
    ]);
  });

  it("maps a CHANGED diff row into the differences table", async () => {
    // Arrange
    const input = makeInput({ kind: "xlsx" });
    // mockRunReadOnlyQuery returns one CHANGED row then empty

    // Act
    await exportReconciliation(input);

    // Assert
    const doc = mockXlsx.mock.calls[0][0];
    const diffSection = doc.sections[1];
    expect(diffSection.rows).toHaveLength(1);

    const row = diffSection.rows[0];
    expect(row[0]).toBe("VOICE"); // key
    expect(row[1]).toBe("CHANGED"); // status
    // Exp revenue = 1000 → formatted
    expect(row[2]).toBe("1,000"); // fmt(1000)
    // Act revenue = 1200 → formatted
    expect(row[3]).toBe("1,200"); // fmt(1200)
    // Δ revenue = 200 → formatted
    expect(row[4]).toBe("200"); // fmt(200)
    // Δ% = 20 → "20.0%"
    expect(row[5]).toBe("20.0%");
  });

  it("fills annotation columns (Reason, Notes, Escalated) from the annotations map", async () => {
    // Arrange
    const annotations: Record<string, RowAnnotation> = {
      VOICE: {
        reasonCode: "Rounding",
        notes: "Checked with finance",
        escalated: true,
        hypothesis: "",
        confidence: null,
      },
    };
    const input = makeInput({ kind: "xlsx", annotations });

    // Act
    await exportReconciliation(input);

    // Assert
    const doc = mockXlsx.mock.calls[0][0];
    const row = doc.sections[1].rows[0];
    expect(row[6]).toBe("Rounding"); // reasonCode
    expect(row[7]).toBe("Checked with finance"); // notes
    expect(row[8]).toBe("yes"); // escalated
  });

  it("leaves annotation columns empty when row has no annotation", async () => {
    // Arrange: empty annotations
    const input = makeInput({ kind: "xlsx", annotations: {} });

    // Act
    await exportReconciliation(input);

    // Assert
    const doc = mockXlsx.mock.calls[0][0];
    const row = doc.sections[1].rows[0];
    expect(row[6]).toBe(""); // reasonCode missing → ""
    expect(row[7]).toBe(""); // notes missing → ""
    expect(row[8]).toBe(""); // escalated missing → ""
  });

  it("formats a null variance%% cell as the em-dash sentinel '—'", async () => {
    // Arrange: varpct_revenue is null (e.g. expected = 0)
    mockRunReadOnlyQuery
      .mockReset()
      .mockResolvedValueOnce([rawDiffRow({ varpct_revenue: null })])
      .mockResolvedValue([]);
    const input = makeInput({ kind: "xlsx" });

    // Act
    await exportReconciliation(input);

    // Assert
    const doc = mockXlsx.mock.calls[0][0];
    const row = doc.sections[1].rows[0];
    expect(row[5]).toBe("—"); // null variancePct → "—"
  });

  it("formats null numeric measure cells as the em-dash sentinel '—'", async () => {
    // Arrange: expected and actual are null (ADDED row with no expected value)
    mockRunReadOnlyQuery
      .mockReset()
      .mockResolvedValueOnce([
        rawDiffRow({
          diff_status: "ADDED",
          exp_revenue: null,
          act_revenue: null,
          var_revenue: null,
          varpct_revenue: null,
        }),
      ])
      .mockResolvedValue([]);
    const input = makeInput({ kind: "xlsx" });

    // Act
    await exportReconciliation(input);

    // Assert: null → fmt(null) → "—"
    const doc = mockXlsx.mock.calls[0][0];
    const row = doc.sections[1].rows[0];
    expect(row[2]).toBe("—"); // Exp revenue
    expect(row[3]).toBe("—"); // Act revenue
  });
});

describe("exportReconciliation — multi-measure headers", () => {
  it("expands headers for each measure in cfg.measures", async () => {
    // Arrange
    const cfg = baseConfig({
      measures: [
        { label: "revenue", expected: "rev", actual: "rev" },
        { label: "quantity", expected: "qty", actual: "qty" },
      ],
    });
    mockRunReadOnlyQuery
      .mockReset()
      .mockResolvedValueOnce([
        {
          key_0: "VOICE",
          diff_status: "CHANGED",
          exp_revenue: 100,
          act_revenue: 120,
          var_revenue: 20,
          varpct_revenue: 20,
          exp_quantity: 5,
          act_quantity: 6,
          var_quantity: 1,
          varpct_quantity: 20,
        },
      ])
      .mockResolvedValue([]);

    const input = makeInput({ kind: "xlsx", cfg });

    // Act
    await exportReconciliation(input);

    // Assert
    const doc = mockXlsx.mock.calls[0][0];
    const { headers } = doc.sections[1];
    // Each measure contributes 4 columns: Exp, Act, Δ, Δ%
    expect(headers).toContain("Exp revenue");
    expect(headers).toContain("Act revenue");
    expect(headers).toContain("Δ revenue");
    expect(headers).toContain("Δ% revenue");
    expect(headers).toContain("Exp quantity");
    expect(headers).toContain("Act quantity");
    expect(headers).toContain("Δ quantity");
    expect(headers).toContain("Δ% quantity");
  });
});

describe("exportReconciliation — streaming pagination", () => {
  it("fetches a second page when the first page is full (PAGE_SIZE = 5000)", async () => {
    // Arrange: first page has exactly PAGE_SIZE rows → triggers a second page fetch
    const PAGE_SIZE = 5000;
    const firstPage = Array.from({ length: PAGE_SIZE }, (_, i) =>
      rawDiffRow({ key_0: `KEY_${i}` }),
    );
    mockRunReadOnlyQuery
      .mockReset()
      .mockResolvedValueOnce(firstPage) // page 0 → full
      .mockResolvedValueOnce([rawDiffRow({ key_0: "KEY_LAST" })]) // page 1 → partial
      .mockResolvedValue([]); // page 2 → empty (safety)

    const input = makeInput({ kind: "xlsx" });

    // Act
    await exportReconciliation(input);

    // Assert: DuckDB was called at least twice
    expect(mockRunReadOnlyQuery).toHaveBeenCalledTimes(2);

    const doc = mockXlsx.mock.calls[0][0];
    // 5000 from first page + 1 from second page
    expect(doc.sections[1].rows).toHaveLength(PAGE_SIZE + 1);
  });

  it("stops fetching when DuckDB returns an empty page", async () => {
    // Arrange: first page is empty → stream terminates immediately
    mockRunReadOnlyQuery.mockReset().mockResolvedValue([]);

    const input = makeInput({ kind: "xlsx" });

    // Act
    await exportReconciliation(input);

    // Assert: only one DuckDB call, no diff rows
    expect(mockRunReadOnlyQuery).toHaveBeenCalledTimes(1);
    const doc = mockXlsx.mock.calls[0][0];
    expect(doc.sections[1].rows).toHaveLength(0);
  });

  it("stops fetching when a partial page is returned (rows.length < PAGE_SIZE)", async () => {
    // Arrange: first page has 3 rows (< PAGE_SIZE) → stream terminates
    mockRunReadOnlyQuery
      .mockReset()
      .mockResolvedValueOnce([
        rawDiffRow({ key_0: "A" }),
        rawDiffRow({ key_0: "B" }),
        rawDiffRow({ key_0: "C" }),
      ])
      .mockResolvedValue([]);

    const input = makeInput({ kind: "xlsx" });

    // Act
    await exportReconciliation(input);

    // Assert: only one DuckDB call, 3 diff rows
    expect(mockRunReadOnlyQuery).toHaveBeenCalledTimes(1);
    const doc = mockXlsx.mock.calls[0][0];
    expect(doc.sections[1].rows).toHaveLength(3);
  });
});

describe("exportReconciliation — saveBytes passthrough", () => {
  it("returns the full saveBytes result including saved and path", async () => {
    // Arrange
    mockSaveBytes.mockResolvedValue({ saved: true, path: "/downloads/recon.xlsx" });
    const input = makeInput({ kind: "xlsx" });

    // Act
    const result = await exportReconciliation(input);

    // Assert
    expect(result).toEqual({ saved: true, path: "/downloads/recon.xlsx" });
  });

  it("returns { saved: false } when the user cancels the save dialog", async () => {
    // Arrange
    mockSaveBytes.mockResolvedValue({ saved: false });
    const input = makeInput({ kind: "xlsx" });

    // Act
    const result = await exportReconciliation(input);

    // Assert
    expect(result).toEqual({ saved: false });
  });

  it("passes the ArrayBuffer from the worker directly to saveBytes", async () => {
    // Arrange
    const buf = new Uint8Array([9, 8, 7]);
    mockXlsx.mockResolvedValue(buf);
    const input = makeInput({ kind: "xlsx" });

    // Act
    await exportReconciliation(input);

    // Assert: first arg to saveBytes is the buffer from the worker
    const [passedBuf] = mockSaveBytes.mock.calls[0];
    expect(passedBuf).toBe(buf);
  });
});

describe("exportReconciliation — fmt helper edge cases (via differences rows)", () => {
  it("formats a large number with comma separators", async () => {
    // Arrange: 1_234_567 expected
    mockRunReadOnlyQuery
      .mockReset()
      .mockResolvedValueOnce([rawDiffRow({ exp_revenue: 1_234_567 })])
      .mockResolvedValue([]);
    const input = makeInput({ kind: "xlsx" });

    // Act
    await exportReconciliation(input);

    // Assert
    const doc = mockXlsx.mock.calls[0][0];
    expect(doc.sections[1].rows[0][2]).toBe("1,234,567");
  });

  it("formats a negative variance correctly (with sign preserved)", async () => {
    // Arrange: variance is negative
    mockRunReadOnlyQuery
      .mockReset()
      .mockResolvedValueOnce([rawDiffRow({ var_revenue: -500, act_revenue: 500, exp_revenue: 1000 })])
      .mockResolvedValue([]);
    const input = makeInput({ kind: "xlsx" });

    // Act
    await exportReconciliation(input);

    // Assert: -500 is finite → formatted with sign
    const doc = mockXlsx.mock.calls[0][0];
    expect(doc.sections[1].rows[0][4]).toBe("-500");
  });

  it("formats zero correctly (not em-dash)", async () => {
    // Arrange
    mockRunReadOnlyQuery
      .mockReset()
      .mockResolvedValueOnce([rawDiffRow({ exp_revenue: 0, act_revenue: 0, var_revenue: 0 })])
      .mockResolvedValue([]);
    const input = makeInput({ kind: "xlsx" });

    // Act
    await exportReconciliation(input);

    // Assert: 0 is finite → formatted as "0"
    const doc = mockXlsx.mock.calls[0][0];
    expect(doc.sections[1].rows[0][2]).toBe("0");
  });
});
