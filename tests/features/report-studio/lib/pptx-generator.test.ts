import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildPptx } from "@/features/report-studio/lib/pptx-generator";
import type { PptxTemplate, ReportData } from "@/features/report-studio/lib/types";

/**
 * Behavioral tests for the PPTX deck builder (pptx-generator.ts).
 *
 * `buildPptx` dynamically `import("pptxgenjs")`s and drives the library's
 * imperative slide API (addSlide -> addText/addShape/addImage/addTable/
 * addChart, plus `slide.background`) before returning `pptx.write(...)` bytes.
 * The real library is the only true boundary, so we replace it with a
 * recording fake that captures every call. Every assertion then inspects the
 * REAL computed arguments the generator passed (colors, geometry, formatted
 * numbers, slicing, sorting, branch-selected text) rather than rendering a
 * real .pptx.
 *
 * jsdom supplies `btoa`, so the base64 logo/chart helpers run for real.
 */

// ─── Recording pptxgenjs fake ────────────────────────────────────────────────

/** One captured call: the method name plus the raw argument list. */
type Call = { method: string; args: unknown[] };

/** A recorded slide: its assigned background + every imperative call made on it. */
interface RecordedSlide {
  calls: Call[];
  get background(): unknown;
}

interface Recording {
  slides: RecordedSlide[];
  /** Argument captured on the final `pptx.write(...)` call. */
  writeArg: unknown;
  /** Whatever `pptx.write` was configured to resolve to. */
  writeResult: ArrayBuffer;
}

/**
 * Module-level handle the `vi.mock` factory writes into. Each test resets it
 * via `resetRecording()` in `beforeEach` so captures never leak between tests.
 */
let recording: Recording;

function resetRecording(): void {
  recording = {
    slides: [],
    writeArg: undefined,
    writeResult: new ArrayBuffer(8),
  };
}

resetRecording();

/** Convenience: all calls of a given method across one slide. */
function callsOf(slide: RecordedSlide, method: string): Call[] {
  return slide.calls.filter((c) => c.method === method);
}

/** First text argument of every addText on a slide, in insertion order. */
function texts(slide: RecordedSlide): string[] {
  return callsOf(slide, "addText").map((c) => String(c.args[0]));
}

/** addText calls whose first arg equals `text`, with their options object. */
function textCall(slide: RecordedSlide, text: string): Call | undefined {
  return callsOf(slide, "addText").find((c) => c.args[0] === text);
}

vi.mock("pptxgenjs", () => {
  class FakeSlide implements RecordedSlide {
    calls: Call[] = [];
    private _background: unknown;
    set background(value: unknown) {
      this._background = value;
    }
    get background(): unknown {
      return this._background;
    }
    addText(...args: unknown[]) {
      this.calls.push({ method: "addText", args });
    }
    addShape(...args: unknown[]) {
      this.calls.push({ method: "addShape", args });
    }
    addImage(...args: unknown[]) {
      this.calls.push({ method: "addImage", args });
    }
    addTable(...args: unknown[]) {
      this.calls.push({ method: "addTable", args });
    }
    addChart(...args: unknown[]) {
      this.calls.push({ method: "addChart", args });
    }
  }
  class FakePptxGen {
    addSlide() {
      const slide = new FakeSlide();
      recording.slides.push(slide);
      return slide;
    }
    write(arg: unknown): Promise<ArrayBuffer> {
      recording.writeArg = arg;
      return Promise.resolve(recording.writeResult);
    }
  }
  return { default: FakePptxGen };
});

// ─── Fixtures ────────────────────────────────────────────────────────────────

/**
 * Baseline "healthy" report: 4 channels, hourly series present, no comparison,
 * no AI narrative, no logo. Tests spread-override only the fields they probe.
 */
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
      { name: "IVR", volume: 1000, successRate: 88.0, revenue: 33.199 },
    ],
    hourlyData: [
      { hour: 9, count: 100, successRate: 97.12 },
      { hour: 10, count: 250, successRate: 95.0 },
    ],
    ...partial,
  };
}

const ALL_TEMPLATES: PptxTemplate[] = ["corporate-blue", "modern-dark", "clean-white"];

// fr-FR number formatting uses NBSP (U+202F narrow no-break space in modern
// ICU) as the group separator and "," as the decimal separator. Build the
// expected strings from Intl directly so the assertions track the runtime ICU.
const frNum = (n: number) => new Intl.NumberFormat("fr-FR").format(n);
const frAmount = (n: number) =>
  new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(n);

beforeEach(() => {
  resetRecording();
});

// ─── Top-level contract ──────────────────────────────────────────────────────

describe("buildPptx — deck-level contract", () => {
  it("builds exactly 10 slides", async () => {
    await buildPptx(makeData());
    expect(recording.slides).toHaveLength(10);
  });

  it("returns the bytes produced by pptx.write with an arraybuffer outputType", async () => {
    const result = await buildPptx(makeData());

    expect(recording.writeArg).toEqual({ outputType: "arraybuffer" });
    expect(result).toBe(recording.writeResult);
    expect(result).toBeInstanceOf(ArrayBuffer);
  });

  it("defaults to the corporate-blue template when none is supplied", async () => {
    await buildPptx(makeData());

    // Slide 1 background is the template bg color.
    expect(recording.slides[0].background).toEqual({ color: "003087" });
  });

  it.each(ALL_TEMPLATES)("applies the %s background color to every slide", async (template) => {
    const bgByTemplate: Record<PptxTemplate, string> = {
      "corporate-blue": "003087",
      "modern-dark": "0F0F1A",
      "clean-white": "FFFFFF",
    };
    await buildPptx(makeData(), template);

    for (const slide of recording.slides) {
      expect(slide.background).toEqual({ color: bgByTemplate[template] });
    }
  });
});

// ─── Slide 1: Title ──────────────────────────────────────────────────────────

describe("buildPptx — slide 1 (title)", () => {
  it("renders the fixed title, the report date, and a CONFIDENTIAL footer", async () => {
    await buildPptx(makeData({ date: "2099-01-02" }));
    const slide = recording.slides[0];

    expect(texts(slide)).toContain("Daily Transaction Report");
    expect(texts(slide)).toContain("2099-01-02");
    expect(texts(slide)).toContain("CONFIDENTIAL");
  });

  it("falls back to 'Telecom Analytics' when companyName is absent", async () => {
    await buildPptx(makeData({ companyName: undefined }));
    expect(texts(recording.slides[0])).toContain("Telecom Analytics");
  });

  it("falls back to 'Telecom Analytics' when companyName is an empty string", async () => {
    await buildPptx(makeData({ companyName: "" }));
    expect(texts(recording.slides[0])).toContain("Telecom Analytics");
  });

  it("uses the provided companyName when present", async () => {
    await buildPptx(makeData({ companyName: "Acme Telco" }));
    expect(texts(recording.slides[0])).toContain("Acme Telco");
  });

  it("draws a placeholder badge (ellipse + 'TX') and no image when no logo bytes", async () => {
    await buildPptx(makeData({ logoBytes: undefined }));
    const slide = recording.slides[0];

    expect(callsOf(slide, "addImage")).toHaveLength(0);
    const shapeTypes = callsOf(slide, "addShape").map((c) => c.args[0]);
    expect(shapeTypes).toContain("ellipse");
    expect(texts(slide)).toContain("TX");
  });

  it("embeds a base64 data-URI logo image (and no placeholder) when logo bytes exist", async () => {
    // 3 bytes -> deterministic base64 we can assert against.
    const logoBytes = new Uint8Array([0x10, 0x20, 0x30]).buffer;
    await buildPptx(makeData({ logoBytes, logoMime: "image/jpeg" }));
    const slide = recording.slides[0];

    const images = callsOf(slide, "addImage");
    expect(images).toHaveLength(1);
    const opts = images[0].args[0] as { data: string };
    const expectedB64 = btoa(String.fromCharCode(0x10, 0x20, 0x30));
    expect(opts.data).toBe(`data:image/jpeg;base64,${expectedB64}`);

    // No placeholder badge text when a real logo is embedded.
    expect(texts(slide)).not.toContain("TX");
  });

  it("defaults the logo mime to image/png when logoMime is omitted", async () => {
    const logoBytes = new Uint8Array([0xff]).buffer;
    await buildPptx(makeData({ logoBytes, logoMime: undefined }));
    const opts = callsOf(recording.slides[0], "addImage")[0].args[0] as { data: string };

    expect(opts.data).toBe(`data:image/png;base64,${btoa(String.fromCharCode(0xff))}`);
  });
});

// ─── Slide 2: Executive Summary KPIs ─────────────────────────────────────────

describe("buildPptx — slide 2 (executive summary KPIs)", () => {
  it("formats the four KPI values via fr-FR number/percent/amount formatting", async () => {
    await buildPptx(makeData());
    const slide = recording.slides[1];
    const all = texts(slide);

    expect(all).toContain(frNum(12_345)); // Total Transactions
    expect(all).toContain("96.5%"); // Success Rate (1 decimal)
    expect(all).toContain(frAmount(1234.567)); // Total Revenue (3 decimals)
    expect(all).toContain(frNum(432)); // Failed Transactions
  });

  it("labels all four KPI cards", async () => {
    await buildPptx(makeData());
    const all = texts(recording.slides[1]);

    for (const label of [
      "Total Transactions",
      "Success Rate",
      "Total Revenue",
      "Failed Transactions",
    ]) {
      expect(all).toContain(label);
    }
  });

  it("uses the light card fill for clean-white and the dark fill otherwise", async () => {
    await buildPptx(makeData(), "clean-white");
    const whiteFill = (callsOf(recording.slides[1], "addShape").find((c) => c.args[0] === "roundRect")
      ?.args[1] as { fill: { color: string } }).fill.color;
    expect(whiteFill).toBe("F8FAFC");

    resetRecording();
    await buildPptx(makeData(), "modern-dark");
    const darkFill = (callsOf(recording.slides[1], "addShape").find((c) => c.args[0] === "roundRect")
      ?.args[1] as { fill: { color: string } }).fill.color;
    expect(darkFill).toBe("1A1A2E");
  });
});

// ─── Slide 3: Channel Performance table ──────────────────────────────────────

describe("buildPptx — slide 3 (channel table)", () => {
  it("emits a header row plus one row per channel (capped at 8)", async () => {
    const channels = Array.from({ length: 12 }, (_, i) => ({
      name: `CH${i}`,
      volume: 100 + i,
      successRate: 90,
      revenue: i,
    }));
    await buildPptx(makeData({ topChannels: channels }));

    const table = callsOf(recording.slides[2], "addTable")[0];
    const rows = table.args[0] as unknown[][];
    // 1 header + 8 data rows (slice(0, 8)).
    expect(rows).toHaveLength(9);
  });

  it("renders header labels Channel/Volume/Success Rate/Revenue", async () => {
    await buildPptx(makeData());
    const rows = (callsOf(recording.slides[2], "addTable")[0].args[0] as Array<
      Array<{ text: string }>
    >);
    const header = rows[0].map((cell) => cell.text);

    expect(header).toEqual(["Channel", "Volume", "Success Rate", "Revenue"]);
  });

  it("color-codes each channel's success-rate cell by threshold (>=95 green, >=80 amber, else red)", async () => {
    await buildPptx(
      makeData({
        topChannels: [
          { name: "GOOD", volume: 1, successRate: 95, revenue: 1 }, // exactly 95 -> green
          { name: "MID", volume: 1, successRate: 80, revenue: 1 }, // exactly 80 -> amber
          { name: "BAD", volume: 1, successRate: 79.9, revenue: 1 }, // <80 -> red
        ],
      }),
    );
    const rows = callsOf(recording.slides[2], "addTable")[0].args[0] as Array<
      Array<{ text: string; options: { color: string } }>
    >;
    // rows[0] is header; success-rate cell is index 2.
    expect(rows[1][2].options.color).toBe("00AA44"); // GOOD
    expect(rows[2][2].options.color).toBe("FF9900"); // MID
    expect(rows[3][2].options.color).toBe("CC3300"); // BAD
  });

  it("alternates row fill colors and formats volume/revenue via fr-FR", async () => {
    await buildPptx(
      makeData({
        topChannels: [
          { name: "A", volume: 1000, successRate: 90, revenue: 12.5 },
          { name: "B", volume: 2000, successRate: 90, revenue: 7.25 },
        ],
      }),
      "corporate-blue",
    );
    const rows = callsOf(recording.slides[2], "addTable")[0].args[0] as Array<
      Array<{ text: string; options: { fill: { color: string } } }>
    >;

    // tableRow1 = E8F0FE, tableRow2 = FFFFFF for corporate-blue.
    expect(rows[1][0].options.fill.color).toBe("E8F0FE"); // i=0 -> row1
    expect(rows[2][0].options.fill.color).toBe("FFFFFF"); // i=1 -> row2
    // Volume + revenue formatting.
    expect(rows[1][1].text).toBe(frNum(1000));
    expect(rows[1][3].text).toBe(frAmount(12.5));
  });
});

// ─── Slide 4: Success Rate bar chart ─────────────────────────────────────────

describe("buildPptx — slide 4 (success-rate bar chart)", () => {
  it("plots at most the first 6 channels with one-decimal success-rate values", async () => {
    const channels = Array.from({ length: 9 }, (_, i) => ({
      name: `C${i}`,
      volume: 1,
      successRate: 90 + i / 3,
      revenue: 1,
    }));
    await buildPptx(makeData({ topChannels: channels }));

    const chart = callsOf(recording.slides[3], "addChart")[0];
    expect(chart.args[0]).toBe("bar");
    const series = (chart.args[1] as Array<{ labels: string[]; values: number[] }>)[0];

    expect(series.labels).toHaveLength(6);
    expect(series.labels).toEqual(["C0", "C1", "C2", "C3", "C4", "C5"]);
    // parseFloat(x.toFixed(1)) rounds to one decimal.
    expect(series.values[0]).toBe(90.0);
    expect(series.values[1]).toBeCloseTo(90.3, 5);
  });

  it("colors each bar by the same success-rate threshold and caps the value axis at 100", async () => {
    await buildPptx(
      makeData({
        topChannels: [
          { name: "G", volume: 1, successRate: 99, revenue: 1 },
          { name: "A", volume: 1, successRate: 85, revenue: 1 },
          { name: "R", volume: 1, successRate: 50, revenue: 1 },
        ],
      }),
    );
    const chart = callsOf(recording.slides[3], "addChart")[0];
    const opts = chart.args[2] as { chartColors: string[]; valAxisMaxVal: number };

    expect(opts.chartColors).toEqual(["00AA44", "FF9900", "CC3300"]);
    expect(opts.valAxisMaxVal).toBe(100);
  });
});

// ─── Slide 5: Revenue pie chart ──────────────────────────────────────────────

describe("buildPptx — slide 5 (revenue pie chart)", () => {
  it("plots first-6 channel revenues rounded to 3 decimals", async () => {
    await buildPptx(
      makeData({
        topChannels: [{ name: "X", volume: 1, successRate: 90, revenue: 12.34567 }],
      }),
    );
    const chart = callsOf(recording.slides[4], "addChart")[0];
    expect(chart.args[0]).toBe("pie");
    const series = (chart.args[1] as Array<{ labels: string[]; values: number[] }>)[0];

    expect(series.labels).toEqual(["X"]);
    expect(series.values[0]).toBe(12.346); // toFixed(3) -> 12.346
  });
});

// ─── Slide 6: Hourly distribution (3-way branch) ─────────────────────────────

describe("buildPptx — slide 6 (hourly distribution)", () => {
  it("embeds the rasterized chart PNG as a data-URI image when chartPng is provided", async () => {
    const png = new Uint8Array([1, 2, 3, 4]);
    await buildPptx(makeData(), "corporate-blue", undefined, png);
    const slide = recording.slides[5];

    const images = callsOf(slide, "addImage");
    expect(images).toHaveLength(1);
    const opts = images[0].args[0] as { data: string };
    expect(opts.data).toBe(`data:image/png;base64,${btoa(String.fromCharCode(1, 2, 3, 4))}`);

    // The image branch must NOT also draw the native line chart.
    expect(callsOf(slide, "addChart")).toHaveLength(0);
  });

  it("ignores a zero-length chartPng and falls through to the native chart", async () => {
    await buildPptx(makeData(), "corporate-blue", undefined, new Uint8Array(0));
    const slide = recording.slides[5];

    expect(callsOf(slide, "addImage")).toHaveLength(0);
    expect(callsOf(slide, "addChart")).toHaveLength(1);
  });

  it("treats a null chartPng as absent and renders the native chart", async () => {
    await buildPptx(makeData(), "corporate-blue", undefined, null);
    const slide = recording.slides[5];

    expect(callsOf(slide, "addImage")).toHaveLength(0);
    expect(callsOf(slide, "addChart")).toHaveLength(1);
  });

  it("shows an empty-state message (and no chart/image) when there is no hourly data and no PNG", async () => {
    await buildPptx(makeData({ hourlyData: [] }));
    const slide = recording.slides[5];

    expect(texts(slide)).toContain("No hourly transaction data available for this period.");
    expect(callsOf(slide, "addChart")).toHaveLength(0);
    expect(callsOf(slide, "addImage")).toHaveLength(0);
  });

  it("renders a two-series native line chart (counts + success rate) from the hourly series", async () => {
    await buildPptx(
      makeData({
        hourlyData: [
          { hour: 0, count: 10, successRate: 99.99 },
          { hour: 23, count: 20, successRate: 88.44 },
        ],
      }),
    );
    const chart = callsOf(recording.slides[5], "addChart")[0];
    expect(chart.args[0]).toBe("line");
    const series = chart.args[1] as Array<{ name: string; labels: string[]; values: number[] }>;

    expect(series).toHaveLength(2);
    expect(series[0].name).toBe("Transactions");
    expect(series[0].labels).toEqual(["0:00", "23:00"]);
    expect(series[0].values).toEqual([10, 20]);
    // Success-rate series rounds to one decimal.
    expect(series[1].name).toBe("Success Rate %");
    expect(series[1].values).toEqual([100.0, 88.4]);
  });
});

// ─── Slide 7: Top performing channels (sort + medals) ────────────────────────

describe("buildPptx — slide 7 (top performers)", () => {
  it("ranks the top 3 channels by descending success rate without mutating the input", async () => {
    const channels = [
      { name: "LOW", volume: 1, successRate: 70, revenue: 1 },
      { name: "HIGH", volume: 1, successRate: 99, revenue: 1 },
      { name: "MID", volume: 1, successRate: 85, revenue: 1 },
      { name: "EXTRA", volume: 1, successRate: 60, revenue: 1 },
    ];
    const data = makeData({ topChannels: channels });
    await buildPptx(data);
    const all = texts(recording.slides[6]);

    expect(all).toContain("1. HIGH");
    expect(all).toContain("2. MID");
    expect(all).toContain("3. LOW");
    expect(all).not.toContain("4. EXTRA");

    // Source array order is preserved (sort copies via spread).
    expect(data.topChannels.map((c) => c.name)).toEqual(["LOW", "HIGH", "MID", "EXTRA"]);
  });

  it("renders medal glyphs and volume/revenue detail lines for each ranked channel", async () => {
    await buildPptx(
      makeData({
        topChannels: [{ name: "ONLY", volume: 4242, successRate: 97.3, revenue: 55.5 }],
      }),
    );
    const all = texts(recording.slides[6]);

    expect(all).toContain("★★★"); // top medal glyph
    expect(all).toContain(`Volume: ${frNum(4242)}  |  Revenue: ${frAmount(55.5)}`);
    expect(all).toContain("97.3%");
  });
});

// ─── Slide 8: Issues & anomalies (issue-detection branches) ──────────────────

describe("buildPptx — slide 8 (issues & anomalies)", () => {
  it("shows the all-clear INFO message when there are no issues", async () => {
    await buildPptx(
      makeData({
        successRate: 99, // >= 90
        failedTransactions: 10,
        totalTransactions: 10_000, // 0.1% failure -> not > 10
        topChannels: [{ name: "OK", volume: 1, successRate: 99, revenue: 1 }], // none < 80
      }),
    );
    const all = texts(recording.slides[7]);

    expect(all).toContain("INFO");
    expect(all).toContain(
      "No critical issues detected. All channels operating within normal parameters.",
    );
    expect(all).not.toContain("CRITICAL");
  });

  it("flags a CRITICAL issue when overall success rate is below 90%", async () => {
    await buildPptx(makeData({ successRate: 85.5 }));
    const all = texts(recording.slides[7]);

    expect(all).toContain("CRITICAL");
    expect(all).toContain("Overall success rate 85.5% is below 90% threshold");
  });

  it("flags a high-failure-rate WARNING when failed/total exceeds 10%", async () => {
    await buildPptx(
      makeData({
        successRate: 95, // keep success-rate critical out of the picture
        failedTransactions: 200,
        totalTransactions: 1000, // 20% failure
        topChannels: [{ name: "OK", volume: 1, successRate: 99, revenue: 1 }],
      }),
    );
    const all = texts(recording.slides[7]);

    expect(all).toContain("High failure rate detected: 20.0% of transactions failed");
  });

  it("adds a per-channel WARNING for every channel below 80% success", async () => {
    await buildPptx(
      makeData({
        successRate: 99,
        failedTransactions: 1,
        totalTransactions: 10_000,
        topChannels: [
          { name: "BADA", volume: 1, successRate: 79.9, revenue: 1 },
          { name: "BADB", volume: 1, successRate: 50, revenue: 1 },
          { name: "FINE", volume: 1, successRate: 80, revenue: 1 }, // exactly 80 -> not flagged
        ],
      }),
    );
    const all = texts(recording.slides[7]);

    expect(all).toContain("BADA: Low success rate 79.9%");
    expect(all).toContain("BADB: Low success rate 50.0%");
    expect(all).not.toContain("FINE: Low success rate");
  });

  it("caps the rendered issue list at 5 entries", async () => {
    // 6 sub-80 channels -> 6 issues, but only 5 issue rows are drawn.
    const channels = Array.from({ length: 6 }, (_, i) => ({
      name: `LOW${i}`,
      volume: 1,
      successRate: 10,
      revenue: 1,
    }));
    await buildPptx(
      makeData({
        successRate: 99,
        failedTransactions: 1,
        totalTransactions: 10_000,
        topChannels: channels,
      }),
    );
    const slide = recording.slides[7];
    const severityTexts = texts(slide).filter((t) => t === "WARNING");

    // One severity label per drawn issue, capped at 5.
    expect(severityTexts).toHaveLength(5);
  });
});

// ─── Slide 9: Trends vs previous period (comparison branch + deltas) ─────────

describe("buildPptx — slide 9 (trends vs previous period)", () => {
  it("shows the no-comparison message when comparison is absent", async () => {
    await buildPptx(makeData({ comparison: undefined }));
    const all = texts(recording.slides[8]);

    expect(all).toContain("No comparable previous-period data is available for this dataset.");
  });

  it("renders four comparison cards with up-arrow deltas for genuine increases", async () => {
    await buildPptx(
      makeData({
        totalTransactions: 1200,
        successRate: 96,
        totalRevenue: 1100,
        failedTransactions: 50,
        comparison: {
          prev: {
            date: "2026-06-24",
            totalTransactions: 1000, // +20%
            successRate: 80, // +20%
            totalRevenue: 1000, // +10%
            failedTransactions: 100, // -50% (improvement for Failed Tx)
          },
          volumeTrend: null,
        },
      }),
    );
    const all = texts(recording.slides[8]);

    // Card labels.
    for (const label of ["Transactions", "Success Rate", "Revenue", "Failed Tx"]) {
      expect(all).toContain(label);
    }
    // +20% transactions -> up arrow.
    expect(all).toContain("▲ 20.0% vs prev");
    // Failed Tx dropped 50% -> down arrow.
    expect(all).toContain("▼ 50.0% vs prev");
  });

  it("colors a Failed-Tx decrease as good (green) and a transactions decrease as bad (red)", async () => {
    await buildPptx(
      makeData({
        totalTransactions: 800, // -20% vs 1000 -> bad/red (down)
        failedTransactions: 50, // -50% vs 100 -> good/green for Failed Tx
        successRate: 90,
        totalRevenue: 1000,
        comparison: {
          prev: {
            date: "p",
            totalTransactions: 1000,
            successRate: 90,
            totalRevenue: 1000,
            failedTransactions: 100,
          },
          volumeTrend: null,
        },
      }),
    );
    const slide = recording.slides[8];

    const txDelta = textCall(slide, "▼ 20.0% vs prev");
    const failDelta = textCall(slide, "▼ 50.0% vs prev");
    expect((txDelta?.args[1] as { color: string }).color).toBe("CC3300"); // transactions down = bad
    expect((failDelta?.args[1] as { color: string }).color).toBe("00AA44"); // failures down = good
  });

  it("formats percent metrics with fmtPct and count metrics with rounded fmtNum", async () => {
    await buildPptx(
      makeData({
        totalTransactions: 1234.7 as unknown as number, // exercises Math.round in the count branch
        successRate: 91.25,
        totalRevenue: 5000,
        failedTransactions: 12,
        comparison: {
          prev: {
            date: "p",
            totalTransactions: 1000,
            successRate: 90,
            totalRevenue: 4000,
            failedTransactions: 10,
          },
          volumeTrend: null,
        },
      }),
    );
    const all = texts(recording.slides[8]);

    // Success Rate uses fmtPct (1 decimal).
    expect(all).toContain("91.3%");
    // Transactions uses fmtNum(Math.round(1234.7)) = 1235.
    expect(all).toContain(frNum(1235));
  });
});

// ─── Slide 10: Recommendations (AI vs heuristic branches) ────────────────────

describe("buildPptx — slide 10 (recommendations)", () => {
  it("uses AI narrative recommendations verbatim when present (capped at 6)", async () => {
    const recs = ["Rec A", "Rec B", "Rec C", "Rec D", "Rec E", "Rec F", "Rec G (dropped)"];
    await buildPptx(
      makeData({
        aiNarrative: { executiveSummary: "s", keyFindings: [], recommendations: recs },
      }),
    );
    const all = texts(recording.slides[9]);

    expect(all).toContain("Rec A");
    expect(all).toContain("Rec F");
    expect(all).not.toContain("Rec G (dropped)"); // slice(0, 6)
    // Heuristic recommendation text must not appear.
    expect(all).not.toContain("Conduct weekly channel performance review meetings with operations team");
  });

  it("falls back to heuristic recommendations when aiNarrative has an empty recommendations list", async () => {
    await buildPptx(
      makeData({
        successRate: 96.5, // > 95 -> "maintain excellence" branch
        topChannels: [{ name: "OK", volume: 1, successRate: 99, revenue: 1 }], // none < 90
        aiNarrative: { executiveSummary: "s", keyFindings: ["k"], recommendations: [] },
      }),
    );
    const all = texts(recording.slides[9]);

    expect(all).toContain(
      "Maintain current operational excellence standards and document best practices",
    );
    // No low-channel remediation line when no channel is below 90%.
    expect(all.some((t) => t.startsWith("Investigate and remediate low success rates on:"))).toBe(
      false,
    );
  });

  it("adds the low-channel remediation line listing every sub-90% channel", async () => {
    await buildPptx(
      makeData({
        successRate: 80, // <= 95 -> "30-day improvement target" branch
        topChannels: [
          { name: "LOWX", volume: 1, successRate: 70, revenue: 1 },
          { name: "LOWY", volume: 1, successRate: 89.9, revenue: 1 },
          { name: "GOODZ", volume: 1, successRate: 95, revenue: 1 },
        ],
      }),
    );
    const all = texts(recording.slides[9]);

    expect(all).toContain(
      "Investigate and remediate low success rates on: LOWX, LOWY",
    );
    expect(all).toContain(
      "Set 30-day improvement target: bring all channels above 90% success rate",
    );
  });

  it("renders a generated/company footer on the final slide", async () => {
    await buildPptx(makeData({ companyName: "Footer Co" }));
    const footer = texts(recording.slides[9]).find((t) => t.startsWith("Generated:"));

    expect(footer).toBeDefined();
    expect(footer).toContain("| Footer Co");
  });
});

// ─── selectedChannels filtering (cross-slide effect) ─────────────────────────

describe("buildPptx — selectedChannels filtering", () => {
  it("restricts every channel-driven slide to the named subset (in source order)", async () => {
    const channels = [
      { name: "USSD", volume: 5000, successRate: 98, revenue: 800 },
      { name: "WEB", volume: 3000, successRate: 91, revenue: 300 },
      { name: "APP", volume: 2000, successRate: 75, revenue: 100 },
    ];
    await buildPptx(makeData({ topChannels: channels }), "corporate-blue", ["WEB", "APP"]);

    // Slide 3 table: header + only the 2 selected channels.
    const rows = callsOf(recording.slides[2], "addTable")[0].args[0] as Array<
      Array<{ text: string }>
    >;
    expect(rows).toHaveLength(3);
    expect(rows[1][0].text).toBe("WEB");
    expect(rows[2][0].text).toBe("APP");

    // Slide 4 bar chart labels reflect the same subset.
    const barSeries = (callsOf(recording.slides[3], "addChart")[0].args[1] as Array<{
      labels: string[];
    }>)[0];
    expect(barSeries.labels).toEqual(["WEB", "APP"]);
  });

  it("uses the full channel list when selectedChannels is an empty array", async () => {
    // `selectedChannels?.length` is 0 -> falsy -> use all topChannels.
    await buildPptx(makeData(), "corporate-blue", []);
    const rows = callsOf(recording.slides[2], "addTable")[0].args[0] as unknown[][];

    // header + all 4 default channels.
    expect(rows).toHaveLength(5);
  });

  it("yields an empty channel set when no names match (zero data rows, empty chart series)", async () => {
    await buildPptx(makeData(), "corporate-blue", ["DOES_NOT_EXIST"]);

    const rows = callsOf(recording.slides[2], "addTable")[0].args[0] as unknown[][];
    expect(rows).toHaveLength(1); // header only

    const barSeries = (callsOf(recording.slides[3], "addChart")[0].args[1] as Array<{
      labels: string[];
      values: number[];
    }>)[0];
    expect(barSeries.labels).toEqual([]);
    expect(barSeries.values).toEqual([]);
  });
});

// ─── Edge cases on numeric inputs ────────────────────────────────────────────

describe("buildPptx — numeric edge cases", () => {
  it("does not throw and shows a 0.0% failure rate when totalTransactions is 0", async () => {
    // failedPct = (n/0)*100 => NaN, but `|| 0` collapses it to 0; success 99 keeps it INFO-clean.
    await buildPptx(
      makeData({
        totalTransactions: 0,
        failedTransactions: 0,
        successRate: 99,
        topChannels: [{ name: "OK", volume: 1, successRate: 99, revenue: 1 }],
      }),
    );
    const all = texts(recording.slides[7]);

    // failedPct collapses to 0 -> no high-failure WARNING is added.
    expect(all.some((t) => t.includes("High failure rate detected"))).toBe(false);
    // All-clear INFO is shown instead.
    expect(all).toContain("INFO");
  });

  it("handles negative revenue and zero values without throwing", async () => {
    const result = await buildPptx(
      makeData({
        totalRevenue: -1234.5,
        totalTransactions: 0,
        failedTransactions: 0,
        successRate: 0,
        topChannels: [{ name: "Z", volume: 0, successRate: 0, revenue: -10.5 }],
        hourlyData: [],
      }),
    );

    expect(result).toBeInstanceOf(ArrayBuffer);
    // Negative amount is still fr-FR formatted on the revenue KPI.
    expect(texts(recording.slides[1])).toContain(frAmount(-1234.5));
  });

  it("renders Infinity deltas without throwing when a previous-period metric is zero", async () => {
    // change = ((current - 0) / 0) * 100 => Infinity; Math.abs(Infinity).toFixed(1) === "Infinity".
    const result = await buildPptx(
      makeData({
        totalTransactions: 100,
        comparison: {
          prev: {
            date: "p",
            totalTransactions: 0, // divide-by-zero in the delta math
            successRate: 90,
            totalRevenue: 1000,
            failedTransactions: 10,
          },
          volumeTrend: null,
        },
      }),
    );
    const all = texts(recording.slides[8]);

    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(all.some((t) => t.includes("Infinity% vs prev"))).toBe(true);
  });
});
