import type { PptxTemplate, ReportData } from "./types";

export type { PptxTemplate, ReportData } from "./types";

interface TemplateColors {
  bg: string;
  accent: string;
  text: string;
  subtext: string;
  tableHeader: string;
  tableRow1: string;
  tableRow2: string;
}

const TEMPLATES: Record<PptxTemplate, TemplateColors> = {
  "corporate-blue": {
    bg: "003087",
    accent: "0066CC",
    text: "FFFFFF",
    subtext: "CCE0FF",
    tableHeader: "003087",
    tableRow1: "E8F0FE",
    tableRow2: "FFFFFF",
  },
  "modern-dark": {
    bg: "0F0F1A",
    accent: "7C3AED",
    text: "FFFFFF",
    subtext: "A0AEC0",
    tableHeader: "1A1A2E",
    tableRow1: "1E1E2E",
    tableRow2: "2D2D3E",
  },
  "clean-white": {
    bg: "FFFFFF",
    accent: "2563EB",
    text: "1E293B",
    subtext: "64748B",
    tableHeader: "2563EB",
    tableRow1: "F1F5F9",
    tableRow2: "FFFFFF",
  },
};

function fmtNum(n: number): string {
  return new Intl.NumberFormat("fr-FR").format(n);
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function fmtAmount(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(n);
}

/** Base64 of arbitrary bytes (worker-safe; no DOM, no Node Buffer dependency). */
function bytesToBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < view.length; i += chunk) {
    binary += String.fromCharCode(...view.subarray(i, i + chunk));
  }
  // btoa exists in both the worker and the renderer global scope.
  return btoa(binary);
}

function logoDataUri(data: ReportData): string | null {
  if (!data.logoBytes) return null;
  const mime = data.logoMime || "image/png";
  return `data:${mime};base64,${bytesToBase64(data.logoBytes)}`;
}

/** PNG bytes → data URI (pptxgenjs addImage requires a data-URI string). */
function pngDataUri(png: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < png.length; i += chunk) {
    binary += String.fromCharCode(...png.subarray(i, i + chunk));
  }
  return `data:image/png;base64,${btoa(binary)}`;
}

/**
 * Build the 10-slide deck and return raw .pptx bytes (no download side effect).
 * Generation runs inside the export worker; the client owns the save step.
 */
export async function buildPptx(
  data: ReportData,
  template: PptxTemplate = "corporate-blue",
  selectedChannels?: string[],
  /** Real ECharts-rendered hourly chart, rasterized to PNG bytes (offline). */
  chartPng?: Uint8Array | null,
): Promise<ArrayBuffer> {
  const pptxgen = (await import("pptxgenjs")).default;
  const pptx = new pptxgen();
  const colors = TEMPLATES[template];
  const logo = logoDataUri(data);
  const chartUri = chartPng && chartPng.byteLength > 0 ? pngDataUri(chartPng) : null;

  const company = data.companyName || "Telecom Analytics";
  const channels = selectedChannels?.length
    ? data.topChannels.filter((c) => selectedChannels.includes(c.name))
    : data.topChannels;

  // Common slide setup helper
  function addBackground(slide: ReturnType<typeof pptx.addSlide>, bgColor: string) {
    slide.background = { color: bgColor };
  }

  // ── Slide 1: Title ──────────────────────────────────────────────────────────
  {
    const slide = pptx.addSlide();
    addBackground(slide, colors.bg);

    // decorative stripe
    slide.addShape("rect", { x: 0, y: 0, w: "100%", h: 0.12, fill: { color: colors.accent } });
    slide.addShape("rect", { x: 0, y: 7.38, w: "100%", h: 0.12, fill: { color: colors.accent } });

    // Brand logo (embedded local image) or a placeholder badge when absent.
    if (logo) {
      slide.addImage({ data: logo, x: 0.4, y: 0.3, w: 0.8, h: 0.8 });
    } else {
      slide.addShape("ellipse", {
        x: 0.4,
        y: 0.3,
        w: 0.8,
        h: 0.8,
        fill: { color: colors.accent },
        line: { color: colors.text, width: 1 },
      });
      slide.addText("TX", {
        x: 0.4,
        y: 0.3,
        w: 0.8,
        h: 0.8,
        color: colors.text,
        fontSize: 14,
        bold: true,
        align: "center",
        valign: "middle",
      });
    }

    slide.addText("Daily Transaction Report", {
      x: 0.5,
      y: 2.0,
      w: 9.0,
      h: 1.2,
      color: colors.text,
      fontSize: 40,
      bold: true,
      align: "center",
    });
    slide.addText(data.date, {
      x: 0.5,
      y: 3.3,
      w: 9.0,
      h: 0.7,
      color: colors.subtext,
      fontSize: 22,
      align: "center",
    });
    slide.addText(company, {
      x: 0.5,
      y: 4.2,
      w: 9.0,
      h: 0.5,
      color: colors.subtext,
      fontSize: 16,
      align: "center",
    });
    slide.addText("CONFIDENTIAL", {
      x: 0.5,
      y: 6.8,
      w: 9.0,
      h: 0.3,
      color: colors.subtext,
      fontSize: 10,
      align: "center",
      italic: true,
    });
  }

  // ── Slide 2: Executive Summary ─────────────────────────────────────────────
  {
    const slide = pptx.addSlide();
    addBackground(slide, colors.bg);
    slide.addShape("rect", { x: 0, y: 0, w: "100%", h: 0.1, fill: { color: colors.accent } });

    slide.addText("Executive Summary", {
      x: 0.4,
      y: 0.2,
      w: 9.2,
      h: 0.6,
      color: colors.text,
      fontSize: 24,
      bold: true,
    });
    slide.addText(data.date, {
      x: 0.4,
      y: 0.8,
      w: 9.2,
      h: 0.3,
      color: colors.subtext,
      fontSize: 12,
    });

    const kpis = [
      {
        label: "Total Transactions",
        value: fmtNum(data.totalTransactions),
        color: "0066CC",
        icon: "#",
      },
      { label: "Success Rate", value: fmtPct(data.successRate), color: "00AA44", icon: "%" },
      { label: "Total Revenue", value: fmtAmount(data.totalRevenue), color: "FF9900", icon: "$" },
      {
        label: "Failed Transactions",
        value: fmtNum(data.failedTransactions),
        color: "CC3300",
        icon: "!",
      },
    ];

    kpis.forEach((kpi, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 0.4 + col * 4.8;
      const y = 1.4 + row * 2.6;

      slide.addShape("roundRect", {
        x,
        y,
        w: 4.4,
        h: 2.2,
        fill: { color: template === "clean-white" ? "F8FAFC" : "1A1A2E" },
        line: { color: kpi.color, width: 2 },
        rectRadius: 0.1,
      });
      slide.addText(kpi.icon, {
        x: x + 0.15,
        y: y + 0.15,
        w: 0.5,
        h: 0.5,
        color: kpi.color,
        fontSize: 18,
        bold: true,
      });
      slide.addText(kpi.value, {
        x,
        y: y + 0.7,
        w: 4.4,
        h: 0.9,
        color: kpi.color,
        fontSize: 28,
        bold: true,
        align: "center",
      });
      slide.addText(kpi.label, {
        x,
        y: y + 1.65,
        w: 4.4,
        h: 0.4,
        color: colors.subtext,
        fontSize: 12,
        align: "center",
      });
    });
  }

  // ── Slide 3: Channel Performance Table ─────────────────────────────────────
  {
    const slide = pptx.addSlide();
    addBackground(slide, colors.bg);
    slide.addShape("rect", { x: 0, y: 0, w: "100%", h: 0.1, fill: { color: colors.accent } });

    slide.addText("Channel Performance", {
      x: 0.4,
      y: 0.2,
      w: 9.2,
      h: 0.6,
      color: colors.text,
      fontSize: 24,
      bold: true,
    });

    const tableData = [
      [
        {
          text: "Channel",
          options: { bold: true, color: "FFFFFF", fill: { color: colors.tableHeader } },
        },
        {
          text: "Volume",
          options: { bold: true, color: "FFFFFF", fill: { color: colors.tableHeader } },
        },
        {
          text: "Success Rate",
          options: { bold: true, color: "FFFFFF", fill: { color: colors.tableHeader } },
        },
        {
          text: "Revenue",
          options: { bold: true, color: "FFFFFF", fill: { color: colors.tableHeader } },
        },
      ],
      ...channels.slice(0, 8).map((ch, i) => [
        {
          text: ch.name,
          options: {
            fill: { color: i % 2 === 0 ? colors.tableRow1 : colors.tableRow2 },
            color: template === "clean-white" ? "1E293B" : "E2E8F0",
          },
        },
        {
          text: fmtNum(ch.volume),
          options: {
            fill: { color: i % 2 === 0 ? colors.tableRow1 : colors.tableRow2 },
            color: template === "clean-white" ? "1E293B" : "E2E8F0",
          },
        },
        {
          text: fmtPct(ch.successRate),
          options: {
            fill: { color: i % 2 === 0 ? colors.tableRow1 : colors.tableRow2 },
            color: ch.successRate >= 95 ? "00AA44" : ch.successRate >= 80 ? "FF9900" : "CC3300",
            bold: true,
          },
        },
        {
          text: fmtAmount(ch.revenue),
          options: {
            fill: { color: i % 2 === 0 ? colors.tableRow1 : colors.tableRow2 },
            color: template === "clean-white" ? "1E293B" : "E2E8F0",
          },
        },
      ]),
    ];

    slide.addTable(tableData, {
      x: 0.4,
      y: 1.0,
      w: 9.2,
      rowH: 0.45,
      border: { type: "solid", color: colors.accent, pt: 1 },
      fontSize: 11,
    });
  }

  // ── Slide 4: Success Rate Bar Chart ────────────────────────────────────────
  {
    const slide = pptx.addSlide();
    addBackground(slide, colors.bg);
    slide.addShape("rect", { x: 0, y: 0, w: "100%", h: 0.1, fill: { color: colors.accent } });

    slide.addText("Success Rate by Channel", {
      x: 0.4,
      y: 0.2,
      w: 9.2,
      h: 0.6,
      color: colors.text,
      fontSize: 24,
      bold: true,
    });

    const chartChannels = channels.slice(0, 6);
    slide.addChart(
      "bar",
      [
        {
          name: "Success Rate (%)",
          labels: chartChannels.map((c) => c.name),
          values: chartChannels.map((c) => parseFloat(c.successRate.toFixed(1))),
        },
      ],
      {
        x: 0.4,
        y: 1.0,
        w: 9.2,
        h: 5.5,
        barDir: "bar",
        chartColors: chartChannels.map((c) =>
          c.successRate >= 95 ? "00AA44" : c.successRate >= 80 ? "FF9900" : "CC3300",
        ),
        showValue: true,
        dataLabelFontSize: 10,
        dataLabelColor: colors.text,
        catAxisLabelColor: colors.subtext,
        valAxisLabelColor: colors.subtext,
        valAxisMaxVal: 100,
      },
    );
  }

  // ── Slide 5: Revenue Pie Chart ──────────────────────────────────────────────
  {
    const slide = pptx.addSlide();
    addBackground(slide, colors.bg);
    slide.addShape("rect", { x: 0, y: 0, w: "100%", h: 0.1, fill: { color: colors.accent } });

    slide.addText("Revenue Breakdown by Channel", {
      x: 0.4,
      y: 0.2,
      w: 9.2,
      h: 0.6,
      color: colors.text,
      fontSize: 24,
      bold: true,
    });

    const pieChannels = channels.slice(0, 6);
    const pieColors = ["0066CC", "00AA44", "FF9900", "CC3300", "9933CC", "00CCCC"];

    slide.addChart(
      "pie",
      [
        {
          name: "Revenue",
          labels: pieChannels.map((c) => c.name),
          values: pieChannels.map((c) => parseFloat(c.revenue.toFixed(3))),
        },
      ],
      {
        x: 1.5,
        y: 1.0,
        w: 7.0,
        h: 5.5,
        chartColors: pieColors,
        showLabel: true,
        showPercent: true,
        dataLabelFontSize: 10,
        legendPos: "b",
        legendFontSize: 11,
        legendColor: colors.subtext,
      },
    );
  }

  // ── Slide 6: Hourly Distribution ────────────────────────────────────────────
  {
    const slide = pptx.addSlide();
    addBackground(slide, colors.bg);
    slide.addShape("rect", { x: 0, y: 0, w: "100%", h: 0.1, fill: { color: colors.accent } });

    slide.addText("Hourly Transaction Distribution", {
      x: 0.4,
      y: 0.2,
      w: 9.2,
      h: 0.6,
      color: colors.text,
      fontSize: 24,
      bold: true,
    });

    const hourly = data.hourlyData;
    if (chartUri) {
      // Prefer the REAL ECharts-rendered chart (rasterized offline via resvg).
      slide.addImage({ data: chartUri, x: 0.4, y: 1.0, w: 9.2, h: 5.5 });
    } else if (hourly.length === 0) {
      slide.addText("No hourly transaction data available for this period.", {
        x: 0.4,
        y: 3.4,
        w: 9.2,
        h: 0.6,
        color: colors.subtext,
        fontSize: 14,
        align: "center",
        italic: true,
      });
    } else {
      slide.addChart(
        "line",
        [
          {
            name: "Transactions",
            labels: hourly.map((h) => `${h.hour}:00`),
            values: hourly.map((h) => h.count),
          },
          {
            name: "Success Rate %",
            labels: hourly.map((h) => `${h.hour}:00`),
            values: hourly.map((h) => parseFloat(h.successRate.toFixed(1))),
          },
        ],
        {
          x: 0.4,
          y: 1.0,
          w: 9.2,
          h: 5.5,
          chartColors: [colors.accent, "00AA44"],
          lineSmooth: true,
          showValue: false,
          catAxisLabelColor: colors.subtext,
          valAxisLabelColor: colors.subtext,
          legendPos: "t",
          legendColor: colors.subtext,
          legendFontSize: 10,
        },
      );
    }
  }

  // ── Slide 7: Top Performing Channels ───────────────────────────────────────
  {
    const slide = pptx.addSlide();
    addBackground(slide, colors.bg);
    slide.addShape("rect", { x: 0, y: 0, w: "100%", h: 0.1, fill: { color: colors.accent } });

    slide.addText("Top Performing Channels", {
      x: 0.4,
      y: 0.2,
      w: 9.2,
      h: 0.6,
      color: colors.text,
      fontSize: 24,
      bold: true,
    });

    const medals = ["★★★", "★★☆", "★☆☆"];
    const medalColors = ["FFD700", "C0C0C0", "CD7F32"];
    const top3 = [...channels].sort((a, b) => b.successRate - a.successRate).slice(0, 3);

    top3.forEach((ch, i) => {
      const y = 1.2 + i * 1.8;
      slide.addShape("roundRect", {
        x: 0.4,
        y,
        w: 9.2,
        h: 1.5,
        fill: { color: template === "clean-white" ? "F8FAFC" : "1A1A2E" },
        line: { color: medalColors[i], width: 2 },
        rectRadius: 0.08,
      });
      slide.addText(medals[i], {
        x: 0.6,
        y: y + 0.35,
        w: 1.0,
        h: 0.8,
        color: medalColors[i],
        fontSize: 24,
      });
      slide.addText(`${i + 1}. ${ch.name}`, {
        x: 1.7,
        y: y + 0.1,
        w: 5.0,
        h: 0.6,
        color: colors.text,
        fontSize: 18,
        bold: true,
      });
      slide.addText(`Volume: ${fmtNum(ch.volume)}  |  Revenue: ${fmtAmount(ch.revenue)}`, {
        x: 1.7,
        y: y + 0.75,
        w: 5.0,
        h: 0.4,
        color: colors.subtext,
        fontSize: 11,
      });
      slide.addText(fmtPct(ch.successRate), {
        x: 7.0,
        y: y + 0.3,
        w: 2.3,
        h: 0.9,
        color: "00AA44",
        fontSize: 28,
        bold: true,
        align: "right",
      });
    });
  }

  // ── Slide 8: Issues & Anomalies ─────────────────────────────────────────────
  {
    const slide = pptx.addSlide();
    addBackground(slide, colors.bg);
    slide.addShape("rect", { x: 0, y: 0, w: "100%", h: 0.1, fill: { color: "CC3300" } });

    slide.addText("Issues & Anomalies", {
      x: 0.4,
      y: 0.2,
      w: 9.2,
      h: 0.6,
      color: colors.text,
      fontSize: 24,
      bold: true,
    });

    const failedPct = (data.failedTransactions / data.totalTransactions) * 100 || 0;
    const issues: Array<{ severity: string; text: string; color: string }> = [];

    if (data.successRate < 90) {
      issues.push({
        severity: "CRITICAL",
        text: `Overall success rate ${fmtPct(data.successRate)} is below 90% threshold`,
        color: "CC3300",
      });
    }
    if (failedPct > 10) {
      issues.push({
        severity: "WARNING",
        text: `High failure rate detected: ${fmtPct(failedPct)} of transactions failed`,
        color: "FF9900",
      });
    }
    channels
      .filter((c) => c.successRate < 80)
      .forEach((c) => {
        issues.push({
          severity: "WARNING",
          text: `${c.name}: Low success rate ${fmtPct(c.successRate)}`,
          color: "FF9900",
        });
      });
    if (issues.length === 0) {
      issues.push({
        severity: "INFO",
        text: "No critical issues detected. All channels operating within normal parameters.",
        color: "00AA44",
      });
    }

    issues.slice(0, 5).forEach((issue, i) => {
      const y = 1.1 + i * 1.1;
      slide.addShape("roundRect", {
        x: 0.4,
        y,
        w: 9.2,
        h: 0.9,
        fill: { color: template === "clean-white" ? "FFF5F5" : "1A0A0A" },
        line: { color: issue.color, width: 2 },
        rectRadius: 0.06,
      });
      slide.addShape("rect", { x: 0.4, y, w: 0.1, h: 0.9, fill: { color: issue.color } });
      slide.addText(issue.severity, {
        x: 0.7,
        y: y + 0.1,
        w: 1.4,
        h: 0.35,
        color: issue.color,
        fontSize: 10,
        bold: true,
      });
      slide.addText(issue.text, {
        x: 0.7,
        y: y + 0.42,
        w: 8.7,
        h: 0.38,
        color: colors.text,
        fontSize: 11,
      });
    });
  }

  // ── Slide 9: Trends vs Previous Period ─────────────────────────────────────
  {
    const slide = pptx.addSlide();
    addBackground(slide, colors.bg);
    slide.addShape("rect", { x: 0, y: 0, w: "100%", h: 0.1, fill: { color: colors.accent } });

    slide.addText("Trends vs Previous Period", {
      x: 0.4,
      y: 0.2,
      w: 9.2,
      h: 0.6,
      color: colors.text,
      fontSize: 24,
      bold: true,
    });

    const cmp = data.comparison;
    if (!cmp) {
      // No real previous-period aggregate available — never fabricate one.
      slide.addText("No comparable previous-period data is available for this dataset.", {
        x: 0.4,
        y: 3.4,
        w: 9.2,
        h: 0.6,
        color: colors.subtext,
        fontSize: 14,
        align: "center",
        italic: true,
      });
    } else {
      const comparisons = [
        {
          label: "Transactions",
          current: data.totalTransactions,
          prev: cmp.prev.totalTransactions,
          unit: "",
        },
        { label: "Success Rate", current: data.successRate, prev: cmp.prev.successRate, unit: "%" },
        { label: "Revenue", current: data.totalRevenue, prev: cmp.prev.totalRevenue, unit: "" },
        {
          label: "Failed Tx",
          current: data.failedTransactions,
          prev: cmp.prev.failedTransactions,
          unit: "",
        },
      ];

      comparisons.forEach((comp, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = 0.4 + col * 4.8;
        const y = 1.2 + row * 2.8;
        const change = ((comp.current - comp.prev) / comp.prev) * 100;
        const isGood = comp.label === "Failed Tx" ? change < 0 : change > 0;
        const changeColor = isGood ? "00AA44" : "CC3300";
        const arrow = change > 0 ? "▲" : "▼";

        slide.addShape("roundRect", {
          x,
          y,
          w: 4.4,
          h: 2.4,
          fill: { color: template === "clean-white" ? "F8FAFC" : "1A1A2E" },
          line: { color: colors.accent, width: 1 },
          rectRadius: 0.08,
        });
        slide.addText(comp.label, {
          x,
          y: y + 0.15,
          w: 4.4,
          h: 0.4,
          color: colors.subtext,
          fontSize: 12,
          align: "center",
        });
        slide.addText(comp.unit === "%" ? fmtPct(comp.current) : fmtNum(Math.round(comp.current)), {
          x,
          y: y + 0.6,
          w: 4.4,
          h: 0.8,
          color: colors.text,
          fontSize: 26,
          bold: true,
          align: "center",
        });
        slide.addText(`${arrow} ${Math.abs(change).toFixed(1)}% vs prev`, {
          x,
          y: y + 1.5,
          w: 4.4,
          h: 0.5,
          color: changeColor,
          fontSize: 13,
          align: "center",
          bold: true,
        });
      });
    }
  }

  // ── Slide 10: Recommendations ──────────────────────────────────────────────
  {
    const slide = pptx.addSlide();
    addBackground(slide, colors.bg);
    slide.addShape("rect", { x: 0, y: 0, w: "100%", h: 0.1, fill: { color: colors.accent } });

    slide.addText("Recommendations", {
      x: 0.4,
      y: 0.2,
      w: 9.2,
      h: 0.6,
      color: colors.text,
      fontSize: 24,
      bold: true,
    });

    // Prefer the AI-generated recommendations (provider registry, grammar-valid).
    const recs: string[] = [];
    if (data.aiNarrative?.recommendations?.length) {
      recs.push(...data.aiNarrative.recommendations);
    } else {
      const lowChannels = channels.filter((c) => c.successRate < 90);
      if (lowChannels.length > 0) {
        recs.push(
          `Investigate and remediate low success rates on: ${lowChannels.map((c) => c.name).join(", ")}`,
        );
      }
      recs.push(
        "Schedule infrastructure review during low-traffic hours (02:00-05:00) to address performance bottlenecks",
      );
      recs.push(
        "Implement real-time alerting for success rate drops below 95% threshold on critical channels",
      );
      recs.push("Conduct weekly channel performance review meetings with operations team");
      if (data.successRate > 95) {
        recs.push("Maintain current operational excellence standards and document best practices");
      } else {
        recs.push("Set 30-day improvement target: bring all channels above 90% success rate");
      }
      recs.push(
        "Review error code patterns and implement targeted fixes for top 3 recurring errors",
      );
    }

    recs.slice(0, 6).forEach((rec, i) => {
      const y = 1.1 + i * 1.0;
      slide.addShape("ellipse", {
        x: 0.4,
        y: y + 0.1,
        w: 0.55,
        h: 0.55,
        fill: { color: colors.accent },
      });
      slide.addText(`${i + 1}`, {
        x: 0.4,
        y: y + 0.1,
        w: 0.55,
        h: 0.55,
        color: "FFFFFF",
        fontSize: 14,
        bold: true,
        align: "center",
        valign: "middle",
      });
      slide.addText(rec, {
        x: 1.1,
        y: y + 0.05,
        w: 8.4,
        h: 0.65,
        color: colors.text,
        fontSize: 12,
      });
    });

    // Footer
    slide.addText(`Generated: ${new Date().toLocaleString()} | ${company}`, {
      x: 0.4,
      y: 7.1,
      w: 9.2,
      h: 0.3,
      color: colors.subtext,
      fontSize: 9,
      align: "center",
    });
  }

  // ── Page numbers ────────────────────────────────────────────────────────────
  // pptxgenjs doesn't expose a .slides accessor; page numbers are added
  // per-slide in each slide block above, so this loop is intentionally omitted.

  // Return raw bytes; the client hook owns the Electron/browser save step.
  return (await pptx.write({ outputType: "arraybuffer" })) as ArrayBuffer;
}
