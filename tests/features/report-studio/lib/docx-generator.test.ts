import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildDocx } from "@/features/report-studio/lib/docx-generator";
import type { DocxOptions, ReportData } from "@/features/report-studio/lib/types";

/**
 * Behavioral tests for the DOCX report builder (docx-generator.ts).
 *
 * `buildDocx` dynamically `import("docx")`s and drives the real library to
 * produce raw .docx bytes via `Packer.toBuffer`. The library works under the
 * jsdom test environment, so rather than mocking it we let it run for real and
 * inspect the genuine OOXML it emits: a .docx is a ZIP whose `word/document.xml`
 * holds the body. We unzip it with Node's built-in `zlib` (no extra deps) and
 * assert on the REAL computed text content — formatted numbers, branch-selected
 * narratives, status labels, colors, table shape — never a render snapshot.
 *
 * The only "boundary" here is the OOXML format itself, which we decode
 * deterministically; there is no network, native module, timer, or randomness.
 */

// ─── OOXML / ZIP helpers ─────────────────────────────────────────────────────

/**
 * Extract a single member from a .docx (ZIP) by scanning local file headers.
 * docx@9 stores entries back-to-back with no streaming data descriptors, so a
 * forward scan of `PK\x03\x04` headers is sufficient and avoids a zip dep.
 */
function readZipEntry(buf: ArrayBuffer, target: string): string {
  const data = Buffer.from(buf);
  let off = 0;
  while (off + 30 <= data.length) {
    if (data.readUInt32LE(off) !== 0x04034b50) break; // PK\x03\x04
    const method = data.readUInt16LE(off + 8);
    const compSize = data.readUInt32LE(off + 18);
    const nameLen = data.readUInt16LE(off + 26);
    const extraLen = data.readUInt16LE(off + 28);
    const nameStart = off + 30;
    const name = data.toString("utf8", nameStart, nameStart + nameLen);
    const dataStart = nameStart + nameLen + extraLen;
    if (name === target) {
      const slice = data.subarray(dataStart, dataStart + compSize);
      const out = method === 0 ? slice : inflateRawSync(slice);
      return out.toString("utf8");
    }
    off = dataStart + compSize;
  }
  throw new Error(`zip entry not found: ${target}`);
}

/** List every member filename in the .docx ZIP (local-header forward scan). */
function listZipEntries(buf: ArrayBuffer): string[] {
  const data = Buffer.from(buf);
  const names: string[] = [];
  let off = 0;
  while (off + 30 <= data.length) {
    if (data.readUInt32LE(off) !== 0x04034b50) break;
    const compSize = data.readUInt32LE(off + 18);
    const nameLen = data.readUInt16LE(off + 26);
    const extraLen = data.readUInt16LE(off + 28);
    const nameStart = off + 30;
    names.push(data.toString("utf8", nameStart, nameStart + nameLen));
    off = nameStart + nameLen + extraLen + compSize;
  }
  return names;
}

const decodeEntities = (s: string): string =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

/**
 * Every `<w:t>` text run in `word/document.xml`, in document order, with XML
 * entities decoded. Each docx `TextRun` becomes exactly one `<w:t>`, so this is
 * the human-readable text the generator actually wrote. The `<w:t` match is
 * anchored to `>` or whitespace so structural tags like `<w:tblPr>`/`<w:tc>`
 * never leak in.
 */
function textRuns(buf: ArrayBuffer): string[] {
  const xml = readZipEntry(buf, "word/document.xml");
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) =>
    decodeEntities(m[1]),
  );
}

/** Whole-document text joined by newlines — convenient for substring checks. */
function fullText(buf: ArrayBuffer): string {
  return textRuns(buf).join("\n");
}

/** Count `<w:tbl>` elements (one per generated Table). */
function tableCount(buf: ArrayBuffer): number {
  const xml = readZipEntry(buf, "word/document.xml");
  return (xml.match(/<w:tbl>/g) ?? []).length;
}

/** Raw document.xml (for color / structural assertions). */
function documentXml(buf: ArrayBuffer): string {
  return readZipEntry(buf, "word/document.xml");
}

// ─── fr-FR formatting mirrors (track runtime ICU, not hardcoded NBSP) ────────

const frNum = (n: number) => new Intl.NumberFormat("fr-FR").format(n);
const frAmount = (n: number) =>
  new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(n);

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ALL_ON: DocxOptions = {
  includeSections: {
    executiveSummary: true,
    keyMetrics: true,
    channelPerformance: true,
    issues: true,
    recommendations: true,
  },
};

const ALL_OFF: DocxOptions = {
  includeSections: {
    executiveSummary: false,
    keyMetrics: false,
    channelPerformance: false,
    issues: false,
    recommendations: false,
  },
};

function options(partial: Partial<DocxOptions["includeSections"]> = {}): DocxOptions {
  return { includeSections: { ...ALL_OFF.includeSections, ...partial } };
}

/**
 * A "healthy" baseline report (high success rate, no comparison, no AI
 * narrative, no anomalies). Tests override only the fields they probe.
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
    ],
    hourlyData: [{ hour: 9, count: 100, successRate: 97.12 }],
    ...partial,
  };
}

// ─── Top-level contract ──────────────────────────────────────────────────────

describe("buildDocx — output contract", () => {
  it("returns a fresh standalone ArrayBuffer", async () => {
    const buf = await buildDocx(makeData(), ALL_OFF);

    expect(buf).toBeInstanceOf(ArrayBuffer);
    expect(buf.byteLength).toBeGreaterThan(0);
  });

  it("produces a valid OOXML package (PK zip header + word/document.xml member)", async () => {
    const buf = await buildDocx(makeData(), ALL_OFF);

    // Bytes start with the ZIP local-file magic "PK\x03\x04".
    const head = new Uint8Array(buf.slice(0, 4));
    expect([...head]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(listZipEntries(buf)).toContain("word/document.xml");
  });

  it("always renders the cover block (title, date, CONFIDENTIAL) regardless of section toggles", async () => {
    const text = fullText(await buildDocx(makeData({ date: "2099-12-31" }), ALL_OFF));

    expect(text).toContain("Daily Transaction Report");
    expect(text).toContain("2099-12-31");
    expect(text).toContain("CONFIDENTIAL");
    expect(text).toContain("Generated on"); // toLocaleString prefix
  });

  it("always renders the Visual Analysis section even with every toggle off", async () => {
    const text = fullText(await buildDocx(makeData(), ALL_OFF));

    expect(text).toContain("4. Visual Analysis");
  });

  it("omits toggled-off section headings", async () => {
    const text = fullText(await buildDocx(makeData(), ALL_OFF));

    expect(text).not.toContain("1. Executive Summary");
    expect(text).not.toContain("2. Key Performance Metrics");
    expect(text).not.toContain("3. Channel Performance");
    expect(text).not.toContain("5. Issues & Anomalies");
    expect(text).not.toContain("6. Recommendations");
  });

  it("renders every section heading when all toggles are on", async () => {
    const text = fullText(await buildDocx(makeData(), ALL_ON));

    for (const heading of [
      "1. Executive Summary",
      "2. Key Performance Metrics",
      "3. Channel Performance",
      "4. Visual Analysis",
      "5. Issues & Anomalies",
      "6. Recommendations",
    ]) {
      expect(text).toContain(heading);
    }
  });
});

// ─── Company name + primary color resolution ─────────────────────────────────

describe("buildDocx — company name + branding color", () => {
  it("uses the provided companyName in cover, footer, and document metadata", async () => {
    const buf = await buildDocx(makeData({ companyName: "Acme Telco" }), ALL_OFF);
    const text = fullText(buf);

    expect(text).toContain("Acme Telco");
    // Header lives in word/header*.xml; the footer line is in the body.
    expect(text).toContain("Acme Telco | Daily Transaction Report | 2026-06-25");
  });

  it("falls back to 'Telecom Analytics' when companyName is undefined", async () => {
    const text = fullText(await buildDocx(makeData({ companyName: undefined }), ALL_OFF));

    expect(text).toContain("Telecom Analytics");
  });

  it("falls back to 'Telecom Analytics' when companyName is an empty string (falsy)", async () => {
    const text = fullText(await buildDocx(makeData({ companyName: "" }), ALL_OFF));

    expect(text).toContain("Telecom Analytics");
  });

  it("strips '#' and upper-cases the primary color into the heading-1 style border", async () => {
    const xml = documentXml(
      await buildDocx(makeData({ primaryColor: "#7a3ff0" }), options({ keyMetrics: true })),
    );

    // Color appears upper-cased without the leading '#'.
    expect(xml).toContain("7A3FF0");
    expect(xml).not.toContain("7a3ff0");
  });

  it("defaults the primary color to 003087 when primaryColor is absent", async () => {
    const xml = documentXml(await buildDocx(makeData({ primaryColor: undefined }), ALL_OFF));

    expect(xml).toContain("003087");
  });
});

// ─── Executive Summary: AI narrative vs deterministic fallback ───────────────

describe("buildDocx — executive summary", () => {
  it("renders the AI narrative summary and every key finding when aiNarrative is present", async () => {
    const buf = await buildDocx(
      makeData({
        aiNarrative: {
          executiveSummary: "AI-written overview of the day.",
          keyFindings: ["Finding one.", "Finding two.", "Finding three."],
          recommendations: [],
        },
      }),
      options({ executiveSummary: true }),
    );
    const text = fullText(buf);

    expect(text).toContain("AI-written overview of the day.");
    expect(text).toContain("Finding one.");
    expect(text).toContain("Finding two.");
    expect(text).toContain("Finding three.");
    // The deterministic boilerplate must NOT appear when AI narrative wins.
    expect(text).not.toContain("This report covers");
  });

  it("renders the AI summary with an empty keyFindings list without throwing", async () => {
    const buf = await buildDocx(
      makeData({
        aiNarrative: {
          executiveSummary: "Just a summary, no findings.",
          keyFindings: [],
          recommendations: [],
        },
      }),
      options({ executiveSummary: true }),
    );

    expect(fullText(buf)).toContain("Just a summary, no findings.");
  });

  it("builds the deterministic summary sentence with fr-FR totals when no AI narrative is present", async () => {
    const text = fullText(
      await buildDocx(
        makeData({
          totalTransactions: 12_345,
          successRate: 96.5,
          totalRevenue: 1234.567,
          companyName: "Acme",
          date: "2026-06-25",
        }),
        options({ executiveSummary: true }),
      ),
    );

    expect(text).toContain(
      `This report covers ${frNum(12_345)} transactions for Acme on 2026-06-25, with an overall success rate of `,
    );
    expect(text).toContain("96.5%");
    expect(text).toContain(`and total revenue of ${frAmount(1234.567)}.`);
  });

  it("counts high-performing (>=95) and attention-needed (<80) channels in the fallback sentence", async () => {
    const text = fullText(
      await buildDocx(
        makeData({
          topChannels: [
            { name: "A", volume: 1, successRate: 95, revenue: 1 }, // high (>=95)
            { name: "B", volume: 1, successRate: 99, revenue: 1 }, // high
            { name: "C", volume: 1, successRate: 79.9, revenue: 1 }, // attention (<80)
            { name: "D", volume: 1, successRate: 85, revenue: 1 }, // neither
          ],
        }),
        options({ executiveSummary: true }),
      ),
    );

    expect(text).toContain(
      "It identifies 2 high-performing channels and flags 1 channels requiring attention.",
    );
  });

  it("colors the success-rate run green at exactly 95%", async () => {
    const xml = documentXml(
      await buildDocx(makeData({ successRate: 95 }), options({ executiveSummary: true })),
    );
    // The 95.0% run carries the green color attribute.
    expect(xml).toContain('w:color w:val="00AA44"');
  });

  it("colors the success-rate run amber between 80% and 95%", async () => {
    const xml = documentXml(
      await buildDocx(makeData({ successRate: 80 }), options({ executiveSummary: true })),
    );
    expect(xml).toContain('w:color w:val="FF9900"');
  });

  it("colors the success-rate run red below 80%", async () => {
    const xml = documentXml(
      await buildDocx(makeData({ successRate: 79.9 }), options({ executiveSummary: true })),
    );
    expect(xml).toContain('w:color w:val="CC3300"');
  });
});

// ─── Key Performance Metrics: comparison vs no-comparison ────────────────────

describe("buildDocx — key metrics (no comparison)", () => {
  it("renders a 2-column Metric/Value table with the four fr-FR-formatted metrics", async () => {
    const buf = await buildDocx(
      makeData({
        totalTransactions: 12_345,
        successRate: 96.5,
        totalRevenue: 1234.567,
        failedTransactions: 432,
        comparison: undefined,
      }),
      options({ keyMetrics: true }),
    );
    const text = fullText(buf);

    expect(text).toContain("Metric");
    expect(text).toContain("Value");
    expect(text).toContain(frNum(12_345));
    expect(text).toContain("96.5%");
    expect(text).toContain(frNum(432));
    expect(text).toContain(frAmount(1234.567));
    // No comparison column header.
    expect(text).not.toContain("Today");
    expect(text).not.toContain("Change");
    expect(tableCount(buf)).toBe(1);
  });
});

describe("buildDocx — key metrics (with comparison)", () => {
  const withCmp = (partial: Partial<ReportData> = {}) =>
    makeData({
      totalTransactions: 1200,
      successRate: 96,
      totalRevenue: 1100,
      failedTransactions: 50,
      comparison: {
        prev: {
          date: "2026-06-24",
          totalTransactions: 1000, // +20%
          successRate: 80, // +16pp
          totalRevenue: 1000, // +10%
          failedTransactions: 100, // -50%
        },
        volumeTrend: null,
      },
      ...partial,
    });

  it("renders a 4-column comparison table with Today / Prev(date) / Change headers", async () => {
    const text = fullText(await buildDocx(withCmp(), options({ keyMetrics: true })));

    expect(text).toContain("Today");
    expect(text).toContain("Prev (2026-06-24)");
    expect(text).toContain("Change");
  });

  it("computes signed percentage deltas for count + revenue metrics", async () => {
    const text = fullText(await buildDocx(withCmp(), options({ keyMetrics: true })));

    // Transactions 1000 -> 1200 = +20.0%
    expect(text).toContain("+20.0%");
    // Failed transactions 100 -> 50 = -50.0%
    expect(text).toContain("-50.0%");
    // Revenue 1000 -> 1100 = +10.0%
    expect(text).toContain("+10.0%");
  });

  it("renders the success-rate change as percentage points (pp), not a signed percent", async () => {
    const text = fullText(await buildDocx(withCmp(), options({ keyMetrics: true })));

    // 96 - 80 = 16.0pp
    expect(text).toContain("16.0pp");
  });

  it("shows the previous-period count rounded via Math.round", async () => {
    const text = fullText(
      await buildDocx(
        withCmp({
          comparison: {
            prev: {
              date: "p",
              totalTransactions: 999.6, // rounds to 1000
              successRate: 80,
              totalRevenue: 1000,
              failedTransactions: 100.4, // rounds to 100
            },
            volumeTrend: null,
          },
        }),
        options({ keyMetrics: true }),
      ),
    );

    expect(text).toContain(frNum(1000));
    expect(text).toContain(frNum(100));
  });

  it("treats a zero previous value as a 0% change (div-by-zero guard)", async () => {
    const text = fullText(
      await buildDocx(
        withCmp({
          totalTransactions: 500,
          comparison: {
            prev: {
              date: "p",
              totalTransactions: 0, // pct(cur, 0) -> 0
              successRate: 80,
              totalRevenue: 1000,
              failedTransactions: 100,
            },
            volumeTrend: null,
          },
        }),
        options({ keyMetrics: true }),
      ),
    );

    // 0 prev -> signedPct(0) === "+0.0%" (never Infinity/NaN).
    expect(text).toContain("+0.0%");
    expect(text).not.toContain("Infinity");
    expect(text).not.toContain("NaN");
  });

  it("colors a positive Change cell green and a negative Change cell red", async () => {
    const xml = documentXml(await buildDocx(withCmp(), options({ keyMetrics: true })));

    // Positive deltas (+20.0% etc.) use green; the -50.0% failed-tx delta uses red.
    expect(xml).toContain('w:color w:val="00AA44"');
    expect(xml).toContain('w:color w:val="CC3300"');
  });

  it("adds a significant Welch t-test caption when volumeTrend is significant", async () => {
    const text = fullText(
      await buildDocx(
        withCmp({
          comparison: {
            prev: {
              date: "p",
              totalTransactions: 1000,
              successRate: 80,
              totalRevenue: 1000,
              failedTransactions: 100,
            },
            volumeTrend: { pValue: 0.0123, significant: true, meanCurrent: 50, meanPrev: 42 },
          },
        }),
        options({ keyMetrics: true }),
      ),
    );

    expect(text).toContain("Welch t-test p=0.0123");
    expect(text).toContain("statistically significant");
  });

  it("labels a non-significant Welch t-test caption accordingly", async () => {
    const text = fullText(
      await buildDocx(
        withCmp({
          comparison: {
            prev: {
              date: "p",
              totalTransactions: 1000,
              successRate: 80,
              totalRevenue: 1000,
              failedTransactions: 100,
            },
            volumeTrend: { pValue: 0.5, significant: false, meanCurrent: 50, meanPrev: 49 },
          },
        }),
        options({ keyMetrics: true }),
      ),
    );

    expect(text).toContain("p=0.5000");
    expect(text).toContain("not significant");
  });

  it("omits the t-test caption entirely when volumeTrend is null", async () => {
    const text = fullText(await buildDocx(withCmp(), options({ keyMetrics: true })));

    expect(text).not.toContain("Welch t-test");
  });
});

// ─── Channel Performance table ───────────────────────────────────────────────

describe("buildDocx — channel performance", () => {
  it("renders a header row plus one row per channel with fr-FR volume/revenue + pct", async () => {
    const text = fullText(
      await buildDocx(
        makeData({
          topChannels: [{ name: "USSD", volume: 5000, successRate: 98.2, revenue: 800.123 }],
        }),
        options({ channelPerformance: true }),
      ),
    );

    for (const header of ["Channel", "Volume", "Success Rate", "Revenue", "Status"]) {
      expect(text).toContain(header);
    }
    expect(text).toContain("USSD");
    expect(text).toContain(frNum(5000));
    expect(text).toContain("98.2%");
    expect(text).toContain(frAmount(800.123));
  });

  it("maps the status label by threshold: Excellent>=95, Good>=85, Warning>=70, else Critical", async () => {
    const text = fullText(
      await buildDocx(
        makeData({
          topChannels: [
            { name: "E", volume: 1, successRate: 95, revenue: 1 }, // Excellent (boundary)
            { name: "G", volume: 1, successRate: 85, revenue: 1 }, // Good (boundary)
            { name: "W", volume: 1, successRate: 70, revenue: 1 }, // Warning (boundary)
            { name: "C", volume: 1, successRate: 69.9, revenue: 1 }, // Critical
          ],
        }),
        options({ channelPerformance: true }),
      ),
    );

    expect(text).toContain("Excellent");
    expect(text).toContain("Good");
    expect(text).toContain("Warning");
    expect(text).toContain("Critical");
  });

  it("caps the channel table at the first 50 channels (slice 0..50)", async () => {
    const channels = Array.from({ length: 60 }, (_, i) => ({
      name: `CH${i}`,
      volume: i,
      successRate: 90,
      revenue: i,
    }));
    const buf = await buildDocx(
      makeData({ topChannels: channels }),
      options({ channelPerformance: true }),
    );
    const text = fullText(buf);

    expect(text).toContain("CH0");
    expect(text).toContain("CH49"); // 50th data row present
    expect(text).not.toContain("CH50"); // 51st dropped
    expect(text).not.toContain("CH59");
  });

  it("renders only the header row when topChannels is empty", async () => {
    const buf = await buildDocx(
      makeData({ topChannels: [] }),
      options({ channelPerformance: true }),
    );
    const xml = documentXml(buf);

    expect(fullText(buf)).toContain("Channel");
    // Exactly one table row (the header) -> one <w:tr>.
    const tableSection = xml.slice(xml.indexOf("<w:tbl>"));
    expect((tableSection.match(/<w:tr>/g) ?? []).length).toBe(1);
  });

  it("colors the status cell by label (Excellent green / Good blue / Warning amber / Critical red)", async () => {
    const xml = documentXml(
      await buildDocx(
        makeData({
          topChannels: [
            { name: "E", volume: 1, successRate: 99, revenue: 1 },
            { name: "G", volume: 1, successRate: 88, revenue: 1 },
            { name: "W", volume: 1, successRate: 72, revenue: 1 },
            { name: "C", volume: 1, successRate: 10, revenue: 1 },
          ],
        }),
        options({ channelPerformance: true }),
      ),
    );

    expect(xml).toContain('w:color w:val="00AA44"'); // Excellent
    expect(xml).toContain('w:color w:val="0066CC"'); // Good
    expect(xml).toContain('w:color w:val="FF9900"'); // Warning
    expect(xml).toContain('w:color w:val="CC3300"'); // Critical
  });
});

// ─── Visual Analysis: chart PNG embed vs omission ────────────────────────────

describe("buildDocx — visual analysis (chart embed)", () => {
  // A 1x1 transparent PNG — a valid image docx's ImageRun will accept.
  const PNG_1X1 = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82,
  ]);

  it("embeds the chart PNG and the chart caption when chartPng has bytes", async () => {
    const buf = await buildDocx(makeData(), ALL_OFF, PNG_1X1);
    const text = fullText(buf);

    expect(text).toContain(
      "Hourly transaction volume and success rate, rendered offline from the report dataset.",
    );
    // The omission message must NOT appear when a real chart is embedded.
    expect(text).not.toContain("No hourly time-series is available");
    // A media image part is written into the package.
    expect(listZipEntries(buf).some((n) => n.startsWith("word/media/"))).toBe(true);
  });

  it("shows the omission message (and no media part) when chartPng is undefined", async () => {
    const buf = await buildDocx(makeData(), ALL_OFF, undefined);
    const text = fullText(buf);

    expect(text).toContain(
      "No hourly time-series is available for this dataset, so the distribution chart is omitted.",
    );
    expect(listZipEntries(buf).some((n) => n.startsWith("word/media/"))).toBe(false);
  });

  it("treats a null chartPng as absent and shows the omission message", async () => {
    const text = fullText(await buildDocx(makeData(), ALL_OFF, null));

    expect(text).toContain("No hourly time-series is available");
  });

  it("treats a zero-length chartPng as absent (byteLength > 0 guard) and shows the omission message", async () => {
    const buf = await buildDocx(makeData(), ALL_OFF, new Uint8Array(0));
    const text = fullText(buf);

    expect(text).toContain("No hourly time-series is available");
    expect(listZipEntries(buf).some((n) => n.startsWith("word/media/"))).toBe(false);
  });
});

// ─── Issues & Anomalies ──────────────────────────────────────────────────────

describe("buildDocx — issues & anomalies", () => {
  it("shows the all-clear INFO line when nothing is wrong", async () => {
    const text = fullText(
      await buildDocx(
        makeData({
          successRate: 99, // >= 90
          topChannels: [{ name: "OK", volume: 1, successRate: 99, revenue: 1 }], // none < 80
          anomalies: [],
        }),
        options({ issues: true }),
      ),
    );

    expect(text).toContain("[INFO]");
    expect(text).toContain("No critical issues or statistical anomalies detected this period.");
    expect(text).not.toContain("[CRITICAL]");
    expect(text).not.toContain("[WARNING]");
    expect(text).not.toContain("[ANOMALY]");
  });

  it("flags a CRITICAL issue when overall success rate is below 90%", async () => {
    const text = fullText(
      await buildDocx(
        makeData({ successRate: 85.5, topChannels: [] }),
        options({ issues: true }),
      ),
    );

    expect(text).toContain("[CRITICAL]");
    expect(text).toContain("Overall success rate 85.5% is below the 90% minimum threshold");
  });

  it("does NOT flag CRITICAL at exactly 90% (strict < boundary)", async () => {
    const text = fullText(
      await buildDocx(
        makeData({ successRate: 90, topChannels: [] }),
        options({ issues: true }),
      ),
    );

    expect(text).not.toContain("[CRITICAL]");
    // With no other issues, the all-clear INFO appears.
    expect(text).toContain("[INFO]");
  });

  it("adds a WARNING per channel below 80% success and excludes channels at exactly 80%", async () => {
    const text = fullText(
      await buildDocx(
        makeData({
          successRate: 99,
          topChannels: [
            { name: "BADA", volume: 1, successRate: 79.9, revenue: 1 },
            { name: "BADB", volume: 1, successRate: 50, revenue: 1 },
            { name: "FINE", volume: 1, successRate: 80, revenue: 1 }, // exactly 80 -> not flagged
          ],
        }),
        options({ issues: true }),
      ),
    );

    expect(text).toContain('Channel "BADA" success rate 79.9% is critically low.');
    expect(text).toContain('Channel "BADB" success rate 50.0% is critically low.');
    expect(text).not.toContain('Channel "FINE"');
  });

  it("emits an ANOMALY line for each seeded anomaly with hour, volume, and 2-decimal score", async () => {
    const text = fullText(
      await buildDocx(
        makeData({
          successRate: 99,
          topChannels: [{ name: "OK", volume: 1, successRate: 99, revenue: 1 }],
          anomalies: [
            { hour: 14, count: 5000, successRate: 70, score: 3.14159 },
            { hour: 3, count: 12, successRate: 95, score: 7.5 },
          ],
        }),
        options({ issues: true }),
      ),
    );

    expect(text).toContain(
      `Hour 14:00 flagged as an anomaly by GESD detection (volume ${frNum(5000)}, score 3.14).`,
    );
    expect(text).toContain(
      `Hour 3:00 flagged as an anomaly by GESD detection (volume ${frNum(12)}, score 7.50).`,
    );
    // Anomalies present -> the all-clear INFO line is suppressed.
    expect(text).not.toContain("No critical issues or statistical anomalies detected");
  });

  it("treats a missing anomalies field as an empty list (nullish-coalescing guard)", async () => {
    const text = fullText(
      await buildDocx(
        makeData({
          successRate: 99,
          topChannels: [{ name: "OK", volume: 1, successRate: 99, revenue: 1 }],
          anomalies: undefined,
        }),
        options({ issues: true }),
      ),
    );

    expect(text).not.toContain("[ANOMALY]");
    expect(text).toContain("[INFO]");
  });

  it("combines CRITICAL + per-channel WARNING + ANOMALY when all apply (no INFO line)", async () => {
    const text = fullText(
      await buildDocx(
        makeData({
          successRate: 70, // CRITICAL
          topChannels: [{ name: "LOW", volume: 1, successRate: 40, revenue: 1 }], // WARNING
          anomalies: [{ hour: 8, count: 99, successRate: 60, score: 2.2 }], // ANOMALY
        }),
        options({ issues: true }),
      ),
    );

    expect(text).toContain("[CRITICAL]");
    expect(text).toContain("[WARNING]");
    expect(text).toContain("[ANOMALY]");
    expect(text).not.toContain("[INFO]");
  });
});

// ─── Recommendations ─────────────────────────────────────────────────────────

describe("buildDocx — recommendations", () => {
  it("uses AI recommendations verbatim and numbers them when present", async () => {
    const text = fullText(
      await buildDocx(
        makeData({
          aiNarrative: {
            executiveSummary: "s",
            keyFindings: [],
            recommendations: ["Do the first thing.", "Then the second thing."],
          },
        }),
        options({ recommendations: true }),
      ),
    );

    expect(text).toContain("1. ");
    expect(text).toContain("Do the first thing.");
    expect(text).toContain("2. ");
    expect(text).toContain("Then the second thing.");
    // The deterministic default list must not appear.
    expect(text).not.toContain("Schedule performance reviews for channels");
  });

  it("falls back to the five deterministic recommendations when aiNarrative has none", async () => {
    const text = fullText(
      await buildDocx(
        makeData({
          aiNarrative: { executiveSummary: "s", keyFindings: ["k"], recommendations: [] },
        }),
        options({ recommendations: true }),
      ),
    );

    expect(text).toContain("Schedule performance reviews for channels with success rates below 90%.");
    expect(text).toContain("Implement automated alerting for real-time success-rate degradation.");
    expect(text).toContain("Document and share best practices from top-performing channels.");
    // Numbered 1..5.
    expect(text).toContain("5. ");
  });

  it("falls back to defaults when aiNarrative is entirely absent", async () => {
    const text = fullText(
      await buildDocx(makeData({ aiNarrative: undefined }), options({ recommendations: true })),
    );

    expect(text).toContain("Review and optimize transaction routing to reduce failure rates.");
  });
});

// ─── Footer line ─────────────────────────────────────────────────────────────

describe("buildDocx — footer line", () => {
  it("uses the provided footerText in the body footer line", async () => {
    const text = fullText(
      await buildDocx(makeData({ companyName: "FooterCo", footerText: "INTERNAL USE" }), ALL_OFF),
    );

    expect(text).toContain("FooterCo | Daily Transaction Report | 2026-06-25 | INTERNAL USE");
  });

  it("defaults the footer label to CONFIDENTIAL when footerText is absent", async () => {
    const text = fullText(
      await buildDocx(makeData({ companyName: "FooterCo", footerText: undefined }), ALL_OFF),
    );

    expect(text).toContain("FooterCo | Daily Transaction Report | 2026-06-25 | CONFIDENTIAL");
  });

  it("defaults the footer label to CONFIDENTIAL when footerText is an empty string (falsy)", async () => {
    const text = fullText(
      await buildDocx(makeData({ companyName: "FooterCo", footerText: "" }), ALL_OFF),
    );

    expect(text).toContain("| CONFIDENTIAL");
  });
});

// ─── Numeric & input edge cases ──────────────────────────────────────────────

describe("buildDocx — numeric & input edge cases", () => {
  it("does not throw on all-zero metrics and an empty channel list", async () => {
    const buf = await buildDocx(
      makeData({
        totalTransactions: 0,
        successRate: 0,
        totalRevenue: 0,
        failedTransactions: 0,
        topChannels: [],
        hourlyData: [],
      }),
      ALL_ON,
    );

    expect(buf).toBeInstanceOf(ArrayBuffer);
    const text = fullText(buf);
    // Zero success rate < 90 -> CRITICAL issue is raised.
    expect(text).toContain("[CRITICAL]");
    // fr-FR zero rendering for totals.
    expect(text).toContain(frAmount(0));
  });

  it("fr-FR-formats negative revenue without throwing", async () => {
    const buf = await buildDocx(
      makeData({ totalRevenue: -1234.5, topChannels: [] }),
      options({ keyMetrics: true }),
    );

    expect(fullText(buf)).toContain(frAmount(-1234.5));
  });

  it("handles NaN / Infinity metrics gracefully (Intl renders them; no throw)", async () => {
    const buf = await buildDocx(
      makeData({
        totalTransactions: Number.NaN,
        successRate: Number.POSITIVE_INFINITY,
        totalRevenue: Number.POSITIVE_INFINITY,
        failedTransactions: Number.NaN,
        topChannels: [],
      }),
      ALL_ON,
    );

    expect(buf).toBeInstanceOf(ArrayBuffer);
    const text = fullText(buf);
    // fmtPct uses Number.prototype.toFixed, so Infinity renders as the literal
    // string "Infinity%" (NOT the Intl "∞" glyph). fmtAmount goes through
    // Intl.NumberFormat, which DOES render "∞" for the revenue total, and
    // fmtNum renders NaN totals as the literal "NaN".
    expect(text).toContain("Infinity%");
    expect(text).toContain("∞"); // fr-FR Intl revenue amount
    expect(text).toContain("NaN"); // fr-FR Intl count totals
  });

  it("escapes XML-special characters in channel names (no raw '<' / '&' in document.xml)", async () => {
    const buf = await buildDocx(
      makeData({
        topChannels: [{ name: 'A & B <tag> "q"', volume: 1, successRate: 99, revenue: 1 }],
      }),
      options({ channelPerformance: true }),
    );
    const xml = documentXml(buf);

    // The raw special chars are entity-escaped in the OOXML.
    expect(xml).toContain("A &amp; B &lt;tag&gt; &quot;q&quot;");
    // …but the decoded text run round-trips to the original.
    expect(fullText(buf)).toContain('A & B <tag> "q"');
  });

  it("preserves a unicode/RTL company name through to the rendered text", async () => {
    const text = fullText(await buildDocx(makeData({ companyName: "اتصالات م" }), ALL_OFF));

    expect(text).toContain("اتصالات م");
  });
});
