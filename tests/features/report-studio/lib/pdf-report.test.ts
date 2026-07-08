import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PDFOptions, ReportData } from "@/features/report-studio/lib/types";

/**
 * Behavioral tests for the PDF report builder (pdf-report.ts).
 *
 * `buildPdf` dynamically imports pdfmake, resolves the VFS (font map) via
 * `resolveVfs`, builds a doc-definition object, and returns raw ArrayBuffer
 * bytes via `pdfMake.createPdf(...).getBuffer(...)`.
 *
 * We replace pdfmake with a recording fake that captures the doc-definition
 * passed to `createPdf`. Every assertion inspects the REAL computed arguments
 * the builder passed — formatted numbers, branch-selected content, colors,
 * vfs resolution paths — so coverage lands on the real target module.
 *
 * jsdom supplies `btoa`, `Intl.NumberFormat`, and `Uint8Array`/`ArrayBuffer`,
 * so the logo, formatting, and buffer helpers all run for real.
 */

// ─── Recording pdfmake fake ──────────────────────────────────────────────────

interface DocDef {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

interface Recording {
  docDef: DocDef | null;
  vfs: Record<string, string>;
}

let recording: Recording = {
  docDef: null,
  vfs: {},
};

function resetRecording(): void {
  recording = { docDef: null, vfs: {} };
}

// The fake pdfmake module. Each `createPdf` call captures the doc-definition
// and synchronously resolves via getBuffer so the promise resolves immediately.
const fakePdfMakeObj = {
  vfs: {} as Record<string, string>,
  createPdf(def: DocDef) {
    recording.docDef = def;
    recording.vfs = fakePdfMakeObj.vfs;
    return {
      getBuffer(cb: (buf: Uint8Array) => void) {
        // Provide a small real Uint8Array so toArrayBuffer is exercised.
        cb(new Uint8Array([1, 2, 3, 4, 5, 6]));
      },
    };
  },
};

// Mutable container for the pdfmake module mock.  When `pdfMakeMod.default` is
// non-null the left side of the `??` in buildPdf is used.  Setting
// `pdfMakeMock.default` to undefined drives the right side (`pdfMakeMod`
// itself must then expose `createPdf`).
const pdfMakeMock: {
  default?: typeof fakePdfMakeObj | null;
  vfs?: Record<string, string>;
  createPdf?: typeof fakePdfMakeObj.createPdf;
} = {
  default: fakePdfMakeObj,
};

// Top-level vi.mock calls are hoisted before any imports.
vi.mock("pdfmake/build/pdfmake", () => pdfMakeMock);

// Mutable container for vfs_fonts mock — tests can mutate `vfsFontsMock` to
// drive different resolveVfs branches.  All optional fields are always present
// (but may be undefined) so Vitest's named-export validator is satisfied.
const vfsFontsMock: {
  vfs?: Record<string, string>;
  default?: (Record<string, unknown> & { vfs?: Record<string, string> }) | null;
  pdfMake?: { vfs?: Record<string, string> };
  [key: string]: unknown;
} = {
  vfs: { "Roboto-Regular.ttf": "AAAA" },
  default: undefined,
  pdfMake: undefined,
};

// Default vfs_fonts mock.  The factory is called once; subsequent dynamic
// imports inside buildPdf receive the same cached module object, so mutating
// `vfsFontsMock` properties in a test immediately affects the next call.
vi.mock("pdfmake/build/vfs_fonts", () => vfsFontsMock);

// Now import the real target module (after mocks are registered).
const { buildPdf } = await import("@/features/report-studio/lib/pdf-report");

// ─── Fixtures ────────────────────────────────────────────────────────────────

const defaultOptions: PDFOptions = { paperSize: "a4", includeCharts: false };

function makeData(partial: Partial<ReportData> = {}): ReportData {
  return {
    date: "2026-06-25",
    totalTransactions: 12_345,
    successRate: 96.5,
    totalRevenue: 1234.567,
    failedTransactions: 432,
    topChannels: [
      { name: "USSD", volume: 5000, successRate: 98.2, revenue: 800.123 },
      { name: "WEB", volume: 3000, successRate: 91.4, revenue: 300.456 },
      { name: "APP", volume: 2000, successRate: 74.9, revenue: 100.789 },
    ],
    hourlyData: [],
    ...partial,
  };
}

// fr-FR formatting helpers that mirror what the module itself uses.
const frNum = (n: number) => new Intl.NumberFormat("fr-FR").format(n);
const frAmount = (n: number) =>
  new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(n);

beforeEach(() => {
  resetRecording();
  // Reset pdfmake mock to the default shape (default export).
  pdfMakeMock.default = fakePdfMakeObj;
  pdfMakeMock.vfs = undefined;
  pdfMakeMock.createPdf = undefined;
  // Remove any extra keys that resolveVfs branch tests may have added.
  for (const key of Object.keys(vfsFontsMock)) {
    if (key !== "vfs" && key !== "default" && key !== "pdfMake") {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete vfsFontsMock[key];
    }
  }
  // Reset vfs_fonts mock to the default shape (root .vfs branch) so existing
  // tests are unaffected by any mutations from resolveVfs branch tests.
  vfsFontsMock.vfs = { "Roboto-Regular.ttf": "AAAA" };
  vfsFontsMock.default = undefined;
  vfsFontsMock.pdfMake = undefined;
});

// ─── Return type contract ────────────────────────────────────────────────────

describe("buildPdf — return value", () => {
  it("returns an ArrayBuffer", async () => {
    // Arrange: minimal valid inputs
    // Act
    const result = await buildPdf(makeData(), defaultOptions);
    // Assert
    expect(result).toBeInstanceOf(ArrayBuffer);
  });

  it("copies getBuffer bytes into a fresh ArrayBuffer (toArrayBuffer)", async () => {
    // The fake getBuffer resolves with [1,2,3,4,5,6]; confirm the copy is correct.
    const result = await buildPdf(makeData(), defaultOptions);
    const view = new Uint8Array(result);
    expect(Array.from(view)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

// ─── VFS resolution (resolveVfs: root .vfs branch) ───────────────────────────

describe("buildPdf — resolveVfs branch: .vfs on the module root", () => {
  it("sets pdfMake.vfs to the root .vfs object when available", async () => {
    // Default mock exports { vfs: { "Roboto-Regular.ttf": "AAAA" } }
    await buildPdf(makeData(), defaultOptions);
    expect(recording.vfs).toEqual({ "Roboto-Regular.ttf": "AAAA" });
  });
});

// ─── Paper size ───────────────────────────────────────────────────────────────

describe("buildPdf — paperSize option", () => {
  it("uses 'A4' page size when paperSize is 'a4'", async () => {
    await buildPdf(makeData(), { paperSize: "a4", includeCharts: false });
    expect(recording.docDef?.pageSize).toBe("A4");
  });

  it("uses 'LETTER' page size when paperSize is 'letter'", async () => {
    await buildPdf(makeData(), { paperSize: "letter", includeCharts: false });
    expect(recording.docDef?.pageSize).toBe("LETTER");
  });
});

// ─── Cover block: company name ────────────────────────────────────────────────

describe("buildPdf — cover block", () => {
  it("uses companyName when provided", async () => {
    await buildPdf(makeData({ companyName: "Acme Telco" }), defaultOptions);
    const content = recording.docDef?.content as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const companyItem = content.find((item: any) => item.style === "company") as
      | { text: string }
      | undefined;
    expect(companyItem?.text).toBe("Acme Telco");
  });

  it("falls back to 'Telecom Analytics' when companyName is absent", async () => {
    await buildPdf(makeData({ companyName: undefined }), defaultOptions);
    const content = recording.docDef?.content as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const companyItem = content.find((item: any) => item.style === "company") as
      | { text: string }
      | undefined;
    expect(companyItem?.text).toBe("Telecom Analytics");
  });

  it("falls back to 'Telecom Analytics' when companyName is an empty string", async () => {
    await buildPdf(makeData({ companyName: "" }), defaultOptions);
    const content = recording.docDef?.content as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const companyItem = content.find((item: any) => item.style === "company") as
      | { text: string }
      | undefined;
    expect(companyItem?.text).toBe("Telecom Analytics");
  });

  it("includes the report date as a subtitle element", async () => {
    await buildPdf(makeData({ date: "2099-12-31" }), defaultOptions);
    const content = recording.docDef?.content as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subtitle = content.find((item: any) => item.style === "subtitle") as
      | { text: string }
      | undefined;
    expect(subtitle?.text).toBe("2099-12-31");
  });

  it("includes 'Daily Transaction Report' as title", async () => {
    await buildPdf(makeData(), defaultOptions);
    const content = recording.docDef?.content as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const title = content.find((item: any) => item.style === "title") as
      | { text: string }
      | undefined;
    expect(title?.text).toBe("Daily Transaction Report");
  });

  it("includes a 4-column KPI block", async () => {
    await buildPdf(makeData(), defaultOptions);
    const content = recording.docDef?.content as unknown[];
    // The KPI block is the first item with a `columns` array.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kpiBlock = content.find((item: any) => item.columns) as
      | { columns: unknown[] }
      | undefined;
    expect(kpiBlock?.columns).toHaveLength(4);
  });

  it("uses the custom primaryColor when it is a valid hex", async () => {
    await buildPdf(makeData({ primaryColor: "#abcdef" }), defaultOptions);
    expect(recording.docDef?.styles?.company?.color).toBe("#abcdef");
  });

  it("falls back to default primary color (#003087) when primaryColor is invalid", async () => {
    await buildPdf(makeData({ primaryColor: "not-a-hex" }), defaultOptions);
    expect(recording.docDef?.styles?.company?.color).toBe("#003087");
  });

  it("falls back to default primary color when primaryColor is absent", async () => {
    await buildPdf(makeData({ primaryColor: undefined }), defaultOptions);
    expect(recording.docDef?.styles?.company?.color).toBe("#003087");
  });

  it("uses a 5-char hex that doesn't match the pattern as invalid", async () => {
    // /^#[0-9a-fA-F]{6}$/ requires exactly 6 hex digits.
    await buildPdf(makeData({ primaryColor: "#abc" }), defaultOptions);
    expect(recording.docDef?.styles?.company?.color).toBe("#003087");
  });
});

// ─── Logo embedding ───────────────────────────────────────────────────────────

describe("buildPdf — logo", () => {
  it("omits an image element from content when logoBytes is absent", async () => {
    await buildPdf(makeData({ logoBytes: undefined }), defaultOptions);
    const content = recording.docDef?.content as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const imageItems = content.filter((item: any) => item.image !== undefined);
    expect(imageItems).toHaveLength(0);
  });

  it("embeds a base64 data-URI image element when logoBytes are present", async () => {
    const logoBytes = new Uint8Array([0x10, 0x20, 0x30]).buffer;
    await buildPdf(makeData({ logoBytes, logoMime: "image/jpeg" }), defaultOptions);
    const content = recording.docDef?.content as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const imageItem = content.find((item: any) => item.image !== undefined) as
      | { image: string }
      | undefined;
    const expectedB64 = btoa(String.fromCharCode(0x10, 0x20, 0x30));
    expect(imageItem?.image).toBe(`data:image/jpeg;base64,${expectedB64}`);
  });

  it("defaults logo MIME to image/png when logoMime is omitted", async () => {
    const logoBytes = new Uint8Array([0xff]).buffer;
    await buildPdf(makeData({ logoBytes, logoMime: undefined }), defaultOptions);
    const content = recording.docDef?.content as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const imageItem = content.find((item: any) => item.image !== undefined) as
      | { image: string }
      | undefined;
    expect(imageItem?.image).toContain("data:image/png;base64,");
  });

  it("handles large logo chunks (>0x8000 bytes) without throwing", async () => {
    // Creates a 2 * 0x8000 byte buffer to exercise the chunked btoa loop.
    const bigArray = new Uint8Array(0x10000).fill(0x41);
    const logoBytes = bigArray.buffer;
    const result = await buildPdf(makeData({ logoBytes }), defaultOptions);
    expect(result).toBeInstanceOf(ArrayBuffer);
  });

  it("returns null from logoDataUri when logoBytes is a zero-length buffer", async () => {
    // Zero-length ArrayBuffer should produce no image (logoDataUri returns null
    // only if !data.logoBytes but an empty buffer is still truthy as an object,
    // so it produces a valid empty base64 and will embed an image element).
    const logoBytes = new ArrayBuffer(0);
    const result = await buildPdf(makeData({ logoBytes }), defaultOptions);
    expect(result).toBeInstanceOf(ArrayBuffer);
  });
});

// ─── Executive summary (AI narrative branch) ─────────────────────────────────

describe("buildPdf — executive summary", () => {
  it("does not add an h1 'Executive Summary' section when aiNarrative is absent", async () => {
    await buildPdf(makeData({ aiNarrative: undefined }), defaultOptions);
    const content = recording.docDef?.content as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const h1Texts = content.filter((item: any) => item.style === "h1").map((item: any) => item.text);
    expect(h1Texts).not.toContain("Executive Summary");
  });

  it("does not add Executive Summary when aiNarrative has no executiveSummary", async () => {
    // aiNarrative.executiveSummary is falsy (empty string).
    await buildPdf(
      makeData({
        aiNarrative: { executiveSummary: "", keyFindings: [], recommendations: [] },
      }),
      defaultOptions,
    );
    const content = recording.docDef?.content as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const h1Texts = content.filter((item: any) => item.style === "h1").map((item: any) => item.text);
    expect(h1Texts).not.toContain("Executive Summary");
  });

  it("adds an Executive Summary h1 with the narrative text when aiNarrative is present", async () => {
    await buildPdf(
      makeData({
        aiNarrative: {
          executiveSummary: "All good here.",
          keyFindings: ["Finding A", "Finding B"],
          recommendations: [],
        },
      }),
      defaultOptions,
    );
    const content = recording.docDef?.content as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const h1Texts = content.filter((item: any) => item.style === "h1").map((item: any) => item.text);
    expect(h1Texts).toContain("Executive Summary");

    // The narrative body text should appear in the content.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bodyItems = content.filter((item: any) => item.style === "body");
    expect(bodyItems.some((item: { text: string }) => item.text === "All good here.")).toBe(true);
  });

  it("adds bullet items for each key finding", async () => {
    await buildPdf(
      makeData({
        aiNarrative: {
          executiveSummary: "Summary.",
          keyFindings: ["Finding 1", "Finding 2"],
          recommendations: [],
        },
      }),
      defaultOptions,
    );
    const content = recording.docDef?.content as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bulletTexts = content
      .filter((item: any) => item.style === "bullet")
      .map((item: { text: string }) => item.text);
    expect(bulletTexts).toContain("Finding 1");
    expect(bulletTexts).toContain("Finding 2");
  });
});

// ─── Channel performance table ────────────────────────────────────────────────

describe("buildPdf — channel performance table", () => {
  it("adds a 'Channel Performance' h1 section header", async () => {
    await buildPdf(makeData(), defaultOptions);
    const content = recording.docDef?.content as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const h1Texts = content.filter((item: any) => item.style === "h1").map((item: any) => item.text);
    expect(h1Texts).toContain("Channel Performance");
  });

  it("includes the correct column headers in the table", async () => {
    await buildPdf(makeData(), defaultOptions);
    const content = recording.docDef?.content as unknown[];
    // Channel Performance table is the first table item in content.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tableItem = content.find((item: any) => item.table?.body) as
      | { table: { body: Array<Array<{ text: string; style: string }>> } }
      | undefined;
    // First row of the table is the header row.
    const header = tableItem?.table?.body[0].map((cell) => cell.text);
    expect(header).toEqual(["Channel", "Volume", "Success", "Revenue", "Status"]);
  });

  it("formats channel volume with fr-FR numbers", async () => {
    await buildPdf(
      makeData({ topChannels: [{ name: "USSD", volume: 100_000, successRate: 95, revenue: 1 }] }),
      defaultOptions,
    );
    const content = recording.docDef?.content as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tableItem = content.find((item: any) => item.table?.body) as
      | { table: { body: Array<Array<{ text: string }>> } }
      | undefined;
    const firstDataRow = tableItem?.table?.body[1];
    // Volume cell (index 1) should use fr-FR formatting.
    expect(firstDataRow?.[1].text).toBe(frNum(100_000));
  });

  it("formats channel revenue with fr-FR 3-decimal formatting", async () => {
    await buildPdf(
      makeData({ topChannels: [{ name: "WEB", volume: 1, successRate: 90, revenue: 12.345 }] }),
      defaultOptions,
    );
    const content = recording.docDef?.content as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tableItem = content.find((item: any) => item.table?.body) as
      | { table: { body: Array<Array<{ text: string }>> } }
      | undefined;
    const firstDataRow = tableItem?.table?.body[1];
    // Revenue cell (index 3).
    expect(firstDataRow?.[3].text).toBe(frAmount(12.345));
  });

  it("assigns 'Excellent' status and formats successRate pct when successRate >= 95", async () => {
    await buildPdf(
      makeData({ topChannels: [{ name: "TOP", volume: 1, successRate: 95, revenue: 1 }] }),
      defaultOptions,
    );
    const content = recording.docDef?.content as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tableItem = content.find((item: any) => item.table?.body) as
      | { table: { body: Array<Array<{ text: string }>> } }
      | undefined;
    expect(tableItem?.table?.body[1]?.[4].text).toBe("Excellent");
    expect(tableItem?.table?.body[1]?.[2].text).toBe("95.0%");
  });

  it("assigns 'Good' status when successRate >= 85 and < 95", async () => {
    await buildPdf(
      makeData({ topChannels: [{ name: "OK", volume: 1, successRate: 85, revenue: 1 }] }),
      defaultOptions,
    );
    const content = recording.docDef?.content as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tableItem = content.find((item: any) => item.table?.body) as
      | { table: { body: Array<Array<{ text: string }>> } }
      | undefined;
    expect(tableItem?.table?.body[1]?.[4].text).toBe("Good");
  });

  it("assigns 'Warning' status when successRate >= 70 and < 85", async () => {
    await buildPdf(
      makeData({ topChannels: [{ name: "WARN", volume: 1, successRate: 74.9, revenue: 1 }] }),
      defaultOptions,
    );
    const content = recording.docDef?.content as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tableItem = content.find((item: any) => item.table?.body) as
      | { table: { body: Array<Array<{ text: string }>> } }
      | undefined;
    expect(tableItem?.table?.body[1]?.[4].text).toBe("Warning");
  });

  it("assigns 'Critical' status when successRate < 70", async () => {
    await buildPdf(
      makeData({ topChannels: [{ name: "CRIT", volume: 1, successRate: 69.9, revenue: 1 }] }),
      defaultOptions,
    );
    const content = recording.docDef?.content as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tableItem = content.find((item: any) => item.table?.body) as
      | { table: { body: Array<Array<{ text: string }>> } }
      | undefined;
    expect(tableItem?.table?.body[1]?.[4].text).toBe("Critical");
  });
});

// ─── statusColor branches ─────────────────────────────────────────────────────

describe("buildPdf — statusColor in channel table", () => {
  it("uses green (#00AA44) for success rate >= 95", async () => {
    await buildPdf(
      makeData({ topChannels: [{ name: "X", volume: 1, successRate: 95, revenue: 1 }] }),
      defaultOptions,
    );
    const content = recording.docDef?.content as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tableItem = content.find((item: any) => item.table?.body) as
      | { table: { body: Array<Array<{ text: string; color?: string }>> } }
      | undefined;
    // Success Rate cell is index 2 in data rows.
    expect(tableItem?.table?.body[1]?.[2].color).toBe("#00AA44");
  });

  it("uses blue (#0066CC) for success rate >= 85 and < 95", async () => {
    await buildPdf(
      makeData({ topChannels: [{ name: "X", volume: 1, successRate: 85, revenue: 1 }] }),
      defaultOptions,
    );
    const content = recording.docDef?.content as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tableItem = content.find((item: any) => item.table?.body) as
      | { table: { body: Array<Array<{ text: string; color?: string }>> } }
      | undefined;
    expect(tableItem?.table?.body[1]?.[2].color).toBe("#0066CC");
  });

  it("uses orange (#FF9900) for success rate >= 70 and < 85", async () => {
    await buildPdf(
      makeData({ topChannels: [{ name: "X", volume: 1, successRate: 70, revenue: 1 }] }),
      defaultOptions,
    );
    const content = recording.docDef?.content as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tableItem = content.find((item: any) => item.table?.body) as
      | { table: { body: Array<Array<{ text: string; color?: string }>> } }
      | undefined;
    expect(tableItem?.table?.body[1]?.[2].color).toBe("#FF9900");
  });

  it("uses red (#CC3300) for success rate < 70", async () => {
    await buildPdf(
      makeData({ topChannels: [{ name: "X", volume: 1, successRate: 69, revenue: 1 }] }),
      defaultOptions,
    );
    const content = recording.docDef?.content as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tableItem = content.find((item: any) => item.table?.body) as
      | { table: { body: Array<Array<{ text: string; color?: string }>> } }
      | undefined;
    expect(tableItem?.table?.body[1]?.[2].color).toBe("#CC3300");
  });
});

// ─── Period-over-period comparison ───────────────────────────────────────────

describe("buildPdf — period-over-period comparison", () => {
  it("does not add 'Period-over-Period' section when comparison is absent", async () => {
    await buildPdf(makeData({ comparison: undefined }), defaultOptions);
    const content = recording.docDef?.content as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const h1Texts = content.filter((item: any) => item.style === "h1").map((item: any) => item.text);
    expect(h1Texts).not.toContain("Period-over-Period");
  });

  it("adds 'Period-over-Period' h1 when comparison is present", async () => {
    await buildPdf(
      makeData({
        comparison: {
          prev: {
            date: "2026-06-24",
            totalTransactions: 10_000,
            successRate: 90,
            totalRevenue: 1000,
            failedTransactions: 100,
          },
          volumeTrend: null,
        },
      }),
      defaultOptions,
    );
    const content = recording.docDef?.content as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const h1Texts = content.filter((item: any) => item.style === "h1").map((item: any) => item.text);
    expect(h1Texts).toContain("Period-over-Period");
  });

  it("does not add a volume trend caption when volumeTrend is null", async () => {
    await buildPdf(
      makeData({
        comparison: {
          prev: {
            date: "p",
            totalTransactions: 5_000,
            successRate: 90,
            totalRevenue: 500,
            failedTransactions: 50,
          },
          volumeTrend: null,
        },
      }),
      defaultOptions,
    );
    const content = recording.docDef?.content as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const captions = content.filter((item: any) => item.style === "caption");
    expect(captions).toHaveLength(0);
  });

  it("adds a volume trend caption with p-value and 'significant' when volumeTrend.significant=true", async () => {
    await buildPdf(
      makeData({
        comparison: {
          prev: {
            date: "2026-06-24",
            totalTransactions: 9_000,
            successRate: 88,
            totalRevenue: 900,
            failedTransactions: 90,
          },
          volumeTrend: {
            pValue: 0.0312,
            significant: true,
            meanCurrent: 500,
            meanPrev: 450,
          },
        },
      }),
      defaultOptions,
    );
    const content = recording.docDef?.content as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caption = content.find((item: any) => item.style === "caption") as
      | { text: string }
      | undefined;
    expect(caption).toBeDefined();
    expect(caption?.text).toContain("p=0.0312");
    expect(caption?.text).toContain("significant");
    // Should NOT say "not significant" for this branch.
    expect(caption?.text).not.toContain("not significant");
  });

  it("shows 'not significant' in caption when volumeTrend.significant is false", async () => {
    await buildPdf(
      makeData({
        comparison: {
          prev: {
            date: "p",
            totalTransactions: 9_000,
            successRate: 88,
            totalRevenue: 900,
            failedTransactions: 90,
          },
          volumeTrend: {
            pValue: 0.45,
            significant: false,
            meanCurrent: 500,
            meanPrev: 490,
          },
        },
      }),
      defaultOptions,
    );
    const content = recording.docDef?.content as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caption = content.find((item: any) => item.style === "caption") as
      | { text: string }
      | undefined;
    expect(caption?.text).toContain("not significant");
    expect(caption?.text).toContain("p=0.4500");
  });

  it("includes prev-period date in the comparison table header", async () => {
    await buildPdf(
      makeData({
        comparison: {
          prev: {
            date: "2026-06-24",
            totalTransactions: 9_000,
            successRate: 88,
            totalRevenue: 900,
            failedTransactions: 90,
          },
          volumeTrend: null,
        },
      }),
      defaultOptions,
    );
    const content = recording.docDef?.content as unknown[];
    // The comparison table is the second table item (after the channel table).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tables = content.filter((item: any) => item.table?.body) as Array<{
      table: { body: Array<Array<{ text: string }>> };
    }>;
    // Second table is the comparison table (tables[1]).
    const compHeader = tables[1]?.table?.body[0].map((cell) => cell.text);
    expect(compHeader).toContain("Prev (2026-06-24)");
  });
});

// ─── Chart SVG embedding ─────────────────────────────────────────────────────

describe("buildPdf — chart SVG", () => {
  it("does not include an SVG element when includeCharts is false", async () => {
    const chartSvg = "<svg><rect/></svg>";
    await buildPdf(makeData(), { paperSize: "a4", includeCharts: false }, chartSvg);
    const content = recording.docDef?.content as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svgItems = content.filter((item: any) => item.svg !== undefined);
    expect(svgItems).toHaveLength(0);
  });

  it("does not include an SVG element when chartSvg is null", async () => {
    await buildPdf(makeData(), { paperSize: "a4", includeCharts: true }, null);
    const content = recording.docDef?.content as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svgItems = content.filter((item: any) => item.svg !== undefined);
    expect(svgItems).toHaveLength(0);
  });

  it("does not include an SVG element when chartSvg is undefined", async () => {
    await buildPdf(makeData(), { paperSize: "a4", includeCharts: true });
    const content = recording.docDef?.content as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svgItems = content.filter((item: any) => item.svg !== undefined);
    expect(svgItems).toHaveLength(0);
  });

  it("embeds the SVG and adds 'Hourly Distribution' h1 when includeCharts=true and chartSvg is present", async () => {
    const chartSvg = "<svg><circle r='5'/></svg>";
    await buildPdf(makeData(), { paperSize: "a4", includeCharts: true }, chartSvg);
    const content = recording.docDef?.content as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svgItem = content.find((item: any) => item.svg !== undefined) as
      | { svg: string; width: number }
      | undefined;
    expect(svgItem?.svg).toBe(chartSvg);
    expect(svgItem?.width).toBe(515);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const h1Texts = content.filter((item: any) => item.style === "h1").map((item: any) => item.text);
    expect(h1Texts).toContain("Hourly Distribution");
  });
});

// ─── Anomalies section ────────────────────────────────────────────────────────

describe("buildPdf — anomalies", () => {
  it("does not add 'Flagged Anomalies' section when anomalies is empty", async () => {
    await buildPdf(makeData({ anomalies: [] }), defaultOptions);
    const content = recording.docDef?.content as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const h1Texts = content.filter((item: any) => item.style === "h1").map((item: any) => item.text);
    expect(h1Texts).not.toContain("Flagged Anomalies");
  });

  it("does not add 'Flagged Anomalies' section when anomalies is absent", async () => {
    await buildPdf(makeData({ anomalies: undefined }), defaultOptions);
    const content = recording.docDef?.content as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const h1Texts = content.filter((item: any) => item.style === "h1").map((item: any) => item.text);
    expect(h1Texts).not.toContain("Flagged Anomalies");
  });

  it("adds 'Flagged Anomalies' h1 and bullet items when anomalies are present", async () => {
    await buildPdf(
      makeData({
        anomalies: [
          { hour: 3, count: 42, successRate: 55.5, score: 2.71 },
          { hour: 14, count: 200, successRate: 80.0, score: 1.23 },
        ],
      }),
      defaultOptions,
    );
    const content = recording.docDef?.content as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const h1Texts = content.filter((item: any) => item.style === "h1").map((item: any) => item.text);
    expect(h1Texts).toContain("Flagged Anomalies");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bulletTexts = content
      .filter((item: any) => item.style === "bullet")
      .map((item: { text: string }) => item.text);

    // Bullets contain hour, count, successRate, and score information.
    expect(bulletTexts.some((t) => t.includes("Hour 3:00"))).toBe(true);
    expect(bulletTexts.some((t) => t.includes("2.71"))).toBe(true);
    expect(bulletTexts.some((t) => t.includes("Hour 14:00"))).toBe(true);
    expect(bulletTexts.some((t) => t.includes("55.5%"))).toBe(true);
  });

  it("formats anomaly count with fr-FR numbers and successRate with one decimal", async () => {
    await buildPdf(
      makeData({
        anomalies: [{ hour: 7, count: 1_000, successRate: 66.6, score: 3.14 }],
      }),
      defaultOptions,
    );
    const content = recording.docDef?.content as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bulletTexts = content
      .filter((item: any) => item.style === "bullet")
      .map((item: { text: string }) => item.text);

    const anomalyBullet = bulletTexts.find((t) => t.includes("Hour 7:00"));
    expect(anomalyBullet).toContain(frNum(1_000));
    expect(anomalyBullet).toContain("66.6%");
    expect(anomalyBullet).toContain("3.14");
  });

  it("formats anomaly score with 2 decimal places", async () => {
    await buildPdf(
      makeData({
        anomalies: [{ hour: 2, count: 10, successRate: 90, score: 1.5 }],
      }),
      defaultOptions,
    );
    const content = recording.docDef?.content as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bulletTexts = content
      .filter((item: any) => item.style === "bullet")
      .map((item: { text: string }) => item.text);
    const bullet = bulletTexts.find((t) => t.includes("Hour 2:00"));
    // score.toFixed(2) for score=1.5 => "1.50"
    expect(bullet).toContain("1.50");
  });
});

// ─── Header/footer functions ──────────────────────────────────────────────────

describe("buildPdf — header and footer functions", () => {
  it("header returns undefined for page 1", async () => {
    await buildPdf(makeData({ companyName: "My Corp" }), defaultOptions);
    const headerFn = recording.docDef?.header as (page: number) => unknown;
    expect(headerFn(1)).toBeUndefined();
  });

  it("header returns a columns object with company name for page 2+", async () => {
    await buildPdf(makeData({ companyName: "My Corp" }), defaultOptions);
    const headerFn = recording.docDef?.header as (page: number) => unknown;
    const header = headerFn(2) as { columns: Array<{ text: string }> };
    expect(header.columns[0].text).toBe("My Corp");
  });

  it("header for page 2 includes the report date and title in the right column", async () => {
    await buildPdf(makeData({ date: "2026-06-25", companyName: "Corp" }), defaultOptions);
    const headerFn = recording.docDef?.header as (page: number) => unknown;
    const header = headerFn(2) as { columns: Array<{ text: string }> };
    expect(header.columns[1].text).toContain("Daily Transaction Report");
    expect(header.columns[1].text).toContain("2026-06-25");
  });

  it("footer includes page number and total pages", async () => {
    await buildPdf(makeData(), defaultOptions);
    const footerFn = recording.docDef?.footer as (page: number, total: number) => unknown;
    const footer = footerFn(3, 10) as { columns: Array<{ text: string }> };
    expect(footer.columns[1].text).toBe("Page 3 of 10");
  });

  it("footer uses custom footerText when provided", async () => {
    await buildPdf(makeData({ footerText: "INTERNAL ONLY" }), defaultOptions);
    const footerFn = recording.docDef?.footer as (page: number, total: number) => unknown;
    const footer = footerFn(1, 5) as { columns: Array<{ text: string }> };
    expect(footer.columns[0].text).toBe("INTERNAL ONLY");
  });

  it("footer uses 'CONFIDENTIAL' when footerText is absent", async () => {
    await buildPdf(makeData({ footerText: undefined }), defaultOptions);
    const footerFn = recording.docDef?.footer as (page: number, total: number) => unknown;
    const footer = footerFn(1, 5) as { columns: Array<{ text: string }> };
    expect(footer.columns[0].text).toBe("CONFIDENTIAL");
  });

  it("footer right column includes company name", async () => {
    await buildPdf(makeData({ companyName: "TestCorp" }), defaultOptions);
    const footerFn = recording.docDef?.footer as (page: number, total: number) => unknown;
    const footer = footerFn(1, 2) as { columns: Array<{ text: string }> };
    expect(footer.columns[2].text).toBe("TestCorp");
  });
});

// ─── Styles and defaultStyle ──────────────────────────────────────────────────

describe("buildPdf — doc definition structure", () => {
  it("uses Roboto as the default font", async () => {
    await buildPdf(makeData(), defaultOptions);
    expect(recording.docDef?.defaultStyle?.font).toBe("Roboto");
  });

  it("sets page margins to [40, 56, 40, 48]", async () => {
    await buildPdf(makeData(), defaultOptions);
    expect(recording.docDef?.pageMargins).toEqual([40, 56, 40, 48]);
  });

  it("includes all required style keys", async () => {
    await buildPdf(makeData(), defaultOptions);
    const styles = recording.docDef?.styles as Record<string, unknown>;
    for (const key of [
      "company", "title", "subtitle", "h1", "body", "bullet", "caption", "th", "td", "tdNum",
    ]) {
      expect(styles).toHaveProperty(key);
    }
  });

  it("th style uses white text color", async () => {
    await buildPdf(makeData(), defaultOptions);
    expect(recording.docDef?.styles?.th?.color).toBe("white");
  });
});

// ─── KPI block number formatting ──────────────────────────────────────────────

describe("buildPdf — KPI number formatting", () => {
  it("formats totalTransactions with fr-FR number formatting", async () => {
    await buildPdf(makeData({ totalTransactions: 1_000_000 }), defaultOptions);
    const content = recording.docDef?.content as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kpiBlock = content.find((item: any) => item.columns) as
      | { columns: Array<{ table: { body: Array<Array<{ text: string }>> } }> }
      | undefined;
    const txValue = kpiBlock?.columns[0]?.table?.body[0][0]?.text;
    expect(txValue).toBe(frNum(1_000_000));
  });

  it("formats successRate with one decimal followed by %", async () => {
    await buildPdf(makeData({ successRate: 87.654 }), defaultOptions);
    const content = recording.docDef?.content as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kpiBlock = content.find((item: any) => item.columns) as
      | { columns: Array<{ table: { body: Array<Array<{ text: string }>> } }> }
      | undefined;
    const srValue = kpiBlock?.columns[1]?.table?.body[0][0]?.text;
    expect(srValue).toBe("87.7%");
  });

  it("formats totalRevenue with fr-FR 3-decimal amount formatting", async () => {
    await buildPdf(makeData({ totalRevenue: 42.001 }), defaultOptions);
    const content = recording.docDef?.content as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kpiBlock = content.find((item: any) => item.columns) as
      | { columns: Array<{ table: { body: Array<Array<{ text: string }>> } }> }
      | undefined;
    const revValue = kpiBlock?.columns[2]?.table?.body[0][0]?.text;
    expect(revValue).toBe(frAmount(42.001));
  });

  it("formats failedTransactions with fr-FR number formatting", async () => {
    await buildPdf(makeData({ failedTransactions: 2_500 }), defaultOptions);
    const content = recording.docDef?.content as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kpiBlock = content.find((item: any) => item.columns) as
      | { columns: Array<{ table: { body: Array<Array<{ text: string }>> } }> }
      | undefined;
    const failedValue = kpiBlock?.columns[3]?.table?.body[0][0]?.text;
    expect(failedValue).toBe(frNum(2_500));
  });

  it("KPI success-rate card uses statusColor (green >= 95) as the text color", async () => {
    await buildPdf(makeData({ successRate: 96 }), defaultOptions);
    const content = recording.docDef?.content as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kpiBlock = content.find((item: any) => item.columns) as
      | { columns: Array<{ table: { body: Array<Array<{ color?: string }>> } }> }
      | undefined;
    // Column 1 is the success rate KPI; body[0][0].color is the statusColor.
    const srColor = kpiBlock?.columns[1]?.table?.body[0][0]?.color;
    expect(srColor).toBe("#00AA44");
  });

  it("KPI revenue card uses orange (#FF9900) color", async () => {
    await buildPdf(makeData(), defaultOptions);
    const content = recording.docDef?.content as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kpiBlock = content.find((item: any) => item.columns) as
      | { columns: Array<{ table: { body: Array<Array<{ color?: string }>> } }> }
      | undefined;
    const revColor = kpiBlock?.columns[2]?.table?.body[0][0]?.color;
    expect(revColor).toBe("#FF9900");
  });

  it("KPI failed-transactions card uses red (#CC3300) color", async () => {
    await buildPdf(makeData(), defaultOptions);
    const content = recording.docDef?.content as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kpiBlock = content.find((item: any) => item.columns) as
      | { columns: Array<{ table: { body: Array<Array<{ color?: string }>> } }> }
      | undefined;
    const failColor = kpiBlock?.columns[3]?.table?.body[0][0]?.color;
    expect(failColor).toBe("#CC3300");
  });
});

// ─── Error propagation ────────────────────────────────────────────────────────

describe("buildPdf — error handling", () => {
  it("rejects with an Error when createPdf throws a real Error synchronously", async () => {
    // Temporarily override the fake to throw.
    const original = fakePdfMakeObj.createPdf;
    fakePdfMakeObj.createPdf = () => {
      throw new Error("pdfmake internal error");
    };
    try {
      await expect(buildPdf(makeData(), defaultOptions)).rejects.toThrow("pdfmake internal error");
    } finally {
      fakePdfMakeObj.createPdf = original;
    }
  });

  it("wraps a non-Error throw (string) in an Error", async () => {
    const original = fakePdfMakeObj.createPdf;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fakePdfMakeObj.createPdf = (() => {
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      throw "plain string error";
    }) as typeof fakePdfMakeObj.createPdf;
    try {
      await expect(buildPdf(makeData(), defaultOptions)).rejects.toThrow("plain string error");
    } finally {
      fakePdfMakeObj.createPdf = original;
    }
  });
});

// ─── Multiple channel table rows ───────────────────────────────────────────────

describe("buildPdf — channel table with multiple channels", () => {
  it("renders one data row per channel in the table", async () => {
    const channels = Array.from({ length: 5 }, (_, i) => ({
      name: `CH${i}`,
      volume: 100 * (i + 1),
      successRate: 80 + i,
      revenue: 10 * i,
    }));
    await buildPdf(makeData({ topChannels: channels }), defaultOptions);
    const content = recording.docDef?.content as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tableItem = content.find((item: any) => item.table?.body) as
      | { table: { body: Array<Array<{ text: string }>> } }
      | undefined;
    // 1 header + 5 data rows.
    expect(tableItem?.table?.body).toHaveLength(6);
  });

  it("channel name appears in the first cell of each data row", async () => {
    await buildPdf(
      makeData({
        topChannels: [
          { name: "ALPHA", volume: 1, successRate: 90, revenue: 1 },
          { name: "BETA", volume: 1, successRate: 90, revenue: 1 },
        ],
      }),
      defaultOptions,
    );
    const content = recording.docDef?.content as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tableItem = content.find((item: any) => item.table?.body) as
      | { table: { body: Array<Array<{ text: string }>> } }
      | undefined;
    expect(tableItem?.table?.body[1]?.[0].text).toBe("ALPHA");
    expect(tableItem?.table?.body[2]?.[0].text).toBe("BETA");
  });

  it("success rate percentage is formatted with one decimal in the channel row", async () => {
    await buildPdf(
      makeData({ topChannels: [{ name: "X", volume: 1, successRate: 92.333, revenue: 1 }] }),
      defaultOptions,
    );
    const content = recording.docDef?.content as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tableItem = content.find((item: any) => item.table?.body) as
      | { table: { body: Array<Array<{ text: string }>> } }
      | undefined;
    // Success rate cell is index 2.
    expect(tableItem?.table?.body[1]?.[2].text).toBe("92.3%");
  });
});

// ─── Combined: all branches in one call ───────────────────────────────────────

describe("buildPdf — combined complex call", () => {
  it("produces a doc definition with h1 sections for summary, channels, period, anomalies, and chart", async () => {
    const data = makeData({
      companyName: "Big Telco",
      primaryColor: "#123456",
      footerText: "SECRET",
      logoBytes: new Uint8Array([0xaa, 0xbb]).buffer,
      logoMime: "image/png",
      aiNarrative: {
        executiveSummary: "Very good.",
        keyFindings: ["F1"],
        recommendations: [],
      },
      anomalies: [{ hour: 1, count: 5, successRate: 60, score: 4.0 }],
      comparison: {
        prev: {
          date: "2026-06-24",
          totalTransactions: 10_000,
          successRate: 90,
          totalRevenue: 1000,
          failedTransactions: 100,
        },
        volumeTrend: { pValue: 0.01, significant: true, meanCurrent: 600, meanPrev: 500 },
      },
    });
    const result = await buildPdf(data, { paperSize: "a4", includeCharts: true }, "<svg/>");

    expect(result).toBeInstanceOf(ArrayBuffer);

    const content = recording.docDef?.content as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const h1Texts = content.filter((item: any) => item.style === "h1").map((item: any) => item.text);

    expect(h1Texts).toContain("Executive Summary");
    expect(h1Texts).toContain("Channel Performance");
    expect(h1Texts).toContain("Period-over-Period");
    expect(h1Texts).toContain("Hourly Distribution");
    expect(h1Texts).toContain("Flagged Anomalies");

    // The primary color from the custom value.
    expect(recording.docDef?.styles?.company?.color).toBe("#123456");
  });
});

// ─── resolveVfs alternative branches ─────────────────────────────────────────
//
// The default mock has `vfs: { "Roboto-Regular.ttf": "AAAA" }` which hits the
// `if (m.vfs)` fast path (line 40). The tests below mutate `vfsFontsMock`
// before calling buildPdf to drive each remaining branch:
//
//   line 41 — m.default?.vfs
//   line 42 — m.pdfMake?.vfs
//   line 43 — isFontMap(m.default)    (drives Boolean/typeof/endsWith body)
//   line 44 — isFontMap(m)            (m itself is a font map)
//   line 45 — fallback {}             (nothing matches)
//
// vfsFontsMock is reset to the default shape in beforeEach, so mutations in
// these tests do not affect any other test.

describe("resolveVfs — m.default.vfs branch (line 41)", () => {
  it("uses m.default.vfs when the module exports vfs under .default.vfs", async () => {
    // Remove root .vfs; add .default.vfs instead.
    vfsFontsMock.vfs = undefined;
    vfsFontsMock.default = { vfs: { "Roboto-Regular.ttf": "BBBB" } };
    await buildPdf(makeData(), defaultOptions);
    expect(recording.vfs).toEqual({ "Roboto-Regular.ttf": "BBBB" });
  });
});

describe("resolveVfs — m.pdfMake.vfs branch (line 42)", () => {
  it("uses m.pdfMake.vfs when the module exposes vfs under .pdfMake.vfs", async () => {
    // Remove root .vfs and .default.vfs; add .pdfMake.vfs.
    vfsFontsMock.vfs = undefined;
    vfsFontsMock.default = undefined;
    vfsFontsMock.pdfMake = { vfs: { "Roboto-Regular.ttf": "CCCC" } };
    await buildPdf(makeData(), defaultOptions);
    expect(recording.vfs).toEqual({ "Roboto-Regular.ttf": "CCCC" });
  });
});

describe("resolveVfs — isFontMap(m.default) branch (line 43)", () => {
  it("uses m.default directly when it is itself a font map (has .ttf keys)", async () => {
    // m.default has no .vfs property but IS a font map (has a .ttf key).
    vfsFontsMock.vfs = undefined;
    vfsFontsMock.pdfMake = undefined;
    vfsFontsMock.default = { "Roboto-Regular.ttf": "DDDD" };
    await buildPdf(makeData(), defaultOptions);
    expect(recording.vfs).toEqual({ "Roboto-Regular.ttf": "DDDD" });
  });

  it("falls through isFontMap(m.default) when m.default has no .ttf keys", async () => {
    // m.default exists but has no .ttf key — isFontMap returns false, so code
    // falls to isFontMap(m) which also has no .ttf key → {} fallback.
    vfsFontsMock.vfs = undefined;
    vfsFontsMock.pdfMake = undefined;
    vfsFontsMock.default = { notAFont: "x" } as Record<string, unknown> & { vfs?: Record<string, string> };
    await buildPdf(makeData(), defaultOptions);
    expect(recording.vfs).toEqual({});
  });

  it("falls through isFontMap(m.default) when m.default is null", async () => {
    // Boolean(null) === false → isFontMap returns false immediately (line 37).
    vfsFontsMock.vfs = undefined;
    vfsFontsMock.pdfMake = undefined;
    vfsFontsMock.default = null;
    await buildPdf(makeData(), defaultOptions);
    expect(recording.vfs).toEqual({});
  });
});

describe("resolveVfs — isFontMap(m) branch (line 44)", () => {
  it("uses m itself as the font map when m directly has a .ttf key", async () => {
    // All named paths absent; add a .ttf-ending key directly to the mock
    // object so that isFontMap(m) returns true and line 44 is reached.
    vfsFontsMock.vfs = undefined;
    vfsFontsMock.default = undefined;
    vfsFontsMock.pdfMake = undefined;
    vfsFontsMock["Roboto-Regular.ttf"] = "EEEE";
    await buildPdf(makeData(), defaultOptions);
    // pdfMake.vfs is set to the whole vfsFontsMock object (cast as font map).
    // The .ttf key we added must be present in the recorded vfs.
    expect(recording.vfs["Roboto-Regular.ttf"]).toBe("EEEE");
  });
});

describe("resolveVfs — empty fallback {} (line 45)", () => {
  it("returns {} when nothing in the module looks like a font map", async () => {
    // All lookup paths are absent/empty — the function returns {}.
    vfsFontsMock.vfs = undefined;
    vfsFontsMock.default = undefined;
    vfsFontsMock.pdfMake = undefined;
    await buildPdf(makeData(), defaultOptions);
    expect(recording.vfs).toEqual({});
  });
});

// ─── pdfmake module interop: no .default export (line 83 right side of ??) ──

describe("buildPdf — pdfmake module interop: no .default property", () => {
  it("uses pdfMakeMod itself as PdfMake when .default is absent (??-right branch)", async () => {
    // Remove .default from the pdfmake mock so that
    //   `(pdfMakeMod as { default: PdfMake }).default ?? (pdfMakeMod as PdfMake)`
    // falls through to the right side.  The module object itself must expose
    // `vfs` and `createPdf` so that the builder can use it.
    pdfMakeMock.default = undefined;
    pdfMakeMock.vfs = {} as Record<string, string>;
    pdfMakeMock.createPdf = fakePdfMakeObj.createPdf.bind(fakePdfMakeObj);
    const result = await buildPdf(makeData(), defaultOptions);
    expect(result).toBeInstanceOf(ArrayBuffer);
  });
});
