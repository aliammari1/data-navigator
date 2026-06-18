import type { DocxOptions, ReportData } from './types'

export type { DocxOptions } from './types'

function fmtNum(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(n)
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`
}

function fmtAmount(n: number): string {
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(n)
}

function signedPct(delta: number): string {
  const v = (delta * 100)
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
}

/**
 * Copy a byte view into a fresh standalone ArrayBuffer — safe to Comlink-transfer
 * back to the renderer (avoids returning a SharedArrayBuffer-backed/offset view).
 */
function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(view.byteLength)
  new Uint8Array(out).set(view)
  return out
}

/**
 * Build the Word document and return raw .docx bytes (no download side effect).
 * Runs inside the export worker; the client owns the save step.
 *
 * `chartPng` is a real ECharts-rendered chart rasterized to PNG offline (resvg),
 * embedded via `ImageRun` — replacing the old `[Chart: …]` text placeholder.
 */
export async function buildDocx(
  data: ReportData,
  options: DocxOptions,
  chartPng?: Uint8Array | null,
): Promise<ArrayBuffer> {
  const {
    Document,
    Paragraph,
    Table,
    TableRow,
    TableCell,
    TextRun,
    HeadingLevel,
    AlignmentType,
    BorderStyle,
    WidthType,
    Packer,
    Header,
    Footer,
    PageNumber,
    ShadingType,
    ImageRun,
  } = await import('docx')

  const company = data.companyName || 'Telecom Analytics'
  const primary = (data.primaryColor || '#003087').replace('#', '').toUpperCase()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sections: any[] = []

  // ── Cover / Title ──────────────────────────────────────────────────────────
  sections.push(
    new Paragraph({
      children: [new TextRun({ text: company, bold: true, size: 48, color: primary, font: 'Calibri' })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 2000, after: 400 },
    }),
    new Paragraph({
      children: [new TextRun({ text: 'Daily Transaction Report', bold: true, size: 56, font: 'Calibri', color: '1E293B' })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }),
    new Paragraph({
      children: [new TextRun({ text: data.date, size: 32, color: '64748B', font: 'Calibri' })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `Generated on ${new Date().toLocaleString()}`, size: 20, color: '94A3B8', italics: true, font: 'Calibri' }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 800 },
    }),
    new Paragraph({
      children: [new TextRun({ text: 'CONFIDENTIAL', bold: true, size: 20, color: 'CC3300', font: 'Calibri' })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 2000 },
    }),
  )

  // ── Executive Summary ──────────────────────────────────────────────────────
  if (options.includeSections.executiveSummary) {
    sections.push(
      new Paragraph({ text: '1. Executive Summary', heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 } }),
    )

    // Prefer the AI-generated narrative (provider registry, grammar-valid JSON).
    if (data.aiNarrative?.executiveSummary) {
      sections.push(
        new Paragraph({
          children: [new TextRun({ text: data.aiNarrative.executiveSummary, font: 'Calibri', size: 22 })],
          spacing: { after: 200 },
        }),
      )
      for (const finding of data.aiNarrative.keyFindings) {
        sections.push(
          new Paragraph({
            bullet: { level: 0 },
            children: [new TextRun({ text: finding, font: 'Calibri', size: 22 })],
            spacing: { after: 80 },
          }),
        )
      }
      sections.push(new Paragraph({ text: '', spacing: { after: 200 } }))
    } else {
      sections.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `This report covers ${fmtNum(data.totalTransactions)} transactions for ${company} on ${data.date}, with an overall success rate of `,
              font: 'Calibri',
              size: 22,
            }),
            new TextRun({
              text: fmtPct(data.successRate),
              bold: true,
              color: data.successRate >= 95 ? '00AA44' : data.successRate >= 80 ? 'FF9900' : 'CC3300',
              font: 'Calibri',
              size: 22,
            }),
            new TextRun({
              text: ` and total revenue of ${fmtAmount(data.totalRevenue)}. It identifies ${data.topChannels.filter((c) => c.successRate >= 95).length} high-performing channels and flags ${data.topChannels.filter((c) => c.successRate < 80).length} channels requiring attention.`,
              font: 'Calibri',
              size: 22,
            }),
          ],
          spacing: { after: 400 },
        }),
      )
    }
  }

  // ── Key Metrics Table (real previous period when available) ────────────────
  if (options.includeSections.keyMetrics) {
    sections.push(
      new Paragraph({ text: '2. Key Performance Metrics', heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 } }),
    )

    const cmp = data.comparison
    const pct = (cur: number, prev: number) => (prev ? (cur - prev) / prev : 0)
    // Only show a comparison column when we have a real previous period.
    const metricsRows: string[][] = cmp
      ? [
          ['Metric', 'Today', `Prev (${cmp.prev.date})`, 'Change'],
          ['Total Transactions', fmtNum(data.totalTransactions), fmtNum(Math.round(cmp.prev.totalTransactions)), signedPct(pct(data.totalTransactions, cmp.prev.totalTransactions))],
          ['Success Rate', fmtPct(data.successRate), fmtPct(cmp.prev.successRate), `${(data.successRate - cmp.prev.successRate).toFixed(1)}pp`],
          ['Failed Transactions', fmtNum(data.failedTransactions), fmtNum(Math.round(cmp.prev.failedTransactions)), signedPct(pct(data.failedTransactions, cmp.prev.failedTransactions))],
          ['Total Revenue', fmtAmount(data.totalRevenue), fmtAmount(cmp.prev.totalRevenue), signedPct(pct(data.totalRevenue, cmp.prev.totalRevenue))],
        ]
      : [
          ['Metric', 'Value'],
          ['Total Transactions', fmtNum(data.totalTransactions)],
          ['Success Rate', fmtPct(data.successRate)],
          ['Failed Transactions', fmtNum(data.failedTransactions)],
          ['Total Revenue', fmtAmount(data.totalRevenue)],
        ]

    const lastCol = metricsRows[0].length - 1
    const metricsTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: metricsRows.map((row, rowIdx) =>
        new TableRow({
          tableHeader: rowIdx === 0,
          children: row.map((cell, colIdx) =>
            new TableCell({
              shading:
                rowIdx === 0
                  ? { fill: primary, type: ShadingType.SOLID }
                  : rowIdx % 2 === 0
                  ? { fill: 'F1F5F9', type: ShadingType.SOLID }
                  : undefined,
              borders: {
                top: { style: BorderStyle.SINGLE, size: 1, color: primary },
                bottom: { style: BorderStyle.SINGLE, size: 1, color: primary },
                left: { style: BorderStyle.SINGLE, size: 1, color: primary },
                right: { style: BorderStyle.SINGLE, size: 1, color: primary },
              },
              children: [
                new Paragraph({
                  alignment: colIdx === 0 ? AlignmentType.LEFT : AlignmentType.CENTER,
                  children: [
                    new TextRun({
                      text: cell,
                      bold: rowIdx === 0,
                      color:
                        rowIdx === 0
                          ? 'FFFFFF'
                          : cmp && colIdx === lastCol
                          ? cell.startsWith('-') || cell.startsWith('−')
                            ? 'CC3300'
                            : '00AA44'
                          : '1E293B',
                      font: 'Calibri',
                      size: 20,
                    }),
                  ],
                }),
              ],
            }),
          ),
        }),
      ),
    })

    sections.push(metricsTable, new Paragraph({ text: '', spacing: { after: 400 } }))

    if (cmp?.volumeTrend) {
      sections.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `Volume trend vs previous period — Welch t-test p=${cmp.volumeTrend.pValue.toFixed(4)} (${cmp.volumeTrend.significant ? 'statistically significant' : 'not significant'}).`,
              italics: true,
              color: '64748B',
              font: 'Calibri',
              size: 18,
            }),
          ],
          spacing: { after: 300 },
        }),
      )
    }
  }

  // ── Channel Performance ────────────────────────────────────────────────────
  if (options.includeSections.channelPerformance) {
    sections.push(
      new Paragraph({ text: '3. Channel Performance', heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 } }),
    )

    const channelHeaderRow = ['Channel', 'Volume', 'Success Rate', 'Revenue', 'Status']
    const channelRows = [
      channelHeaderRow,
      ...data.topChannels.slice(0, 50).map((ch) => [
        ch.name,
        fmtNum(ch.volume),
        fmtPct(ch.successRate),
        fmtAmount(ch.revenue),
        ch.successRate >= 95 ? 'Excellent' : ch.successRate >= 85 ? 'Good' : ch.successRate >= 70 ? 'Warning' : 'Critical',
      ]),
    ]

    const channelTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: channelRows.map((row, rowIdx) =>
        new TableRow({
          tableHeader: rowIdx === 0,
          children: row.map((cell, colIdx) => {
            const isStatus = colIdx === 4 && rowIdx > 0
            const statusColor = cell === 'Excellent' ? '00AA44' : cell === 'Good' ? '0066CC' : cell === 'Warning' ? 'FF9900' : 'CC3300'
            return new TableCell({
              shading:
                rowIdx === 0
                  ? { fill: primary, type: ShadingType.SOLID }
                  : rowIdx % 2 === 0
                  ? { fill: 'F8FAFC', type: ShadingType.SOLID }
                  : undefined,
              borders: {
                top: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
                bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
                left: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
                right: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
              },
              children: [
                new Paragraph({
                  alignment: colIdx === 0 ? AlignmentType.LEFT : AlignmentType.CENTER,
                  children: [
                    new TextRun({
                      text: cell,
                      bold: rowIdx === 0 || isStatus,
                      color: rowIdx === 0 ? 'FFFFFF' : isStatus ? statusColor : '1E293B',
                      font: 'Calibri',
                      size: 20,
                    }),
                  ],
                }),
              ],
            })
          }),
        }),
      ),
    })

    sections.push(channelTable, new Paragraph({ text: '', spacing: { after: 400 } }))
  }

  // ── Visual Analysis (REAL embedded chart, not a text placeholder) ──────────
  sections.push(
    new Paragraph({ text: '4. Visual Analysis', heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 } }),
  )
  if (chartPng && chartPng.byteLength > 0) {
    sections.push(
      new Paragraph({
        children: [
          // docx v9: ImageRun requires `type`. Embed the real resvg PNG directly.
          new ImageRun({ type: 'png', data: chartPng, transformation: { width: 600, height: 240 } }),
        ],
        spacing: { after: 200 },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: 'Hourly transaction volume and success rate, rendered offline from the report dataset.',
            italics: true,
            color: '64748B',
            font: 'Calibri',
            size: 18,
          }),
        ],
        spacing: { after: 400 },
      }),
    )
  } else {
    sections.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'No hourly time-series is available for this dataset, so the distribution chart is omitted.',
            italics: true,
            color: '64748B',
            font: 'Calibri',
            size: 22,
          }),
        ],
        spacing: { after: 400 },
      }),
    )
  }

  // ── Issues (real, seeded anomaly hours when available) ─────────────────────
  if (options.includeSections.issues) {
    sections.push(
      new Paragraph({ text: '5. Issues & Anomalies', heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 } }),
    )

    const issues: { severity: string; text: string }[] = []
    if (data.successRate < 90) {
      issues.push({ severity: '[CRITICAL]', text: `Overall success rate ${fmtPct(data.successRate)} is below the 90% minimum threshold. Immediate escalation required.` })
    }
    for (const c of data.topChannels.filter((c) => c.successRate < 80)) {
      issues.push({ severity: '[WARNING]', text: `Channel "${c.name}" success rate ${fmtPct(c.successRate)} is critically low. Investigation required.` })
    }
    for (const a of data.anomalies ?? []) {
      issues.push({
        severity: '[ANOMALY]',
        text: `Hour ${a.hour}:00 flagged as an anomaly by GESD detection (volume ${fmtNum(a.count)}, score ${a.score.toFixed(2)}).`,
      })
    }
    if (issues.length === 0) {
      issues.push({ severity: '[INFO]', text: 'No critical issues or statistical anomalies detected this period. All channels are within acceptable parameters.' })
    }

    for (const issue of issues) {
      sections.push(
        new Paragraph({
          bullet: { level: 0 },
          children: [
            new TextRun({
              text: `${issue.severity} `,
              bold: true,
              color: issue.severity.includes('CRITICAL') ? 'CC3300' : issue.severity.includes('WARNING') ? 'FF9900' : issue.severity.includes('ANOMALY') ? '9333EA' : '0066CC',
              font: 'Calibri',
              size: 22,
            }),
            new TextRun({ text: issue.text, font: 'Calibri', size: 22 }),
          ],
          spacing: { after: 100 },
        }),
      )
    }

    sections.push(new Paragraph({ text: '', spacing: { after: 400 } }))
  }

  // ── Recommendations (AI when present, else deterministic defaults) ─────────
  if (options.includeSections.recommendations) {
    sections.push(
      new Paragraph({ text: '6. Recommendations', heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 } }),
    )

    const recs = data.aiNarrative?.recommendations?.length
      ? data.aiNarrative.recommendations
      : [
          'Schedule performance reviews for channels with success rates below 90%.',
          'Implement automated alerting for real-time success-rate degradation.',
          'Review and optimize transaction routing to reduce failure rates.',
          'Conduct root-cause analysis on the top recurring error codes.',
          'Document and share best practices from top-performing channels.',
        ]

    recs.forEach((rec, i) => {
      sections.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${i + 1}. `, bold: true, color: primary, font: 'Calibri', size: 22 }),
            new TextRun({ text: rec, font: 'Calibri', size: 22 }),
          ],
          spacing: { after: 120 },
        }),
      )
    })
  }

  // ── Footer line ────────────────────────────────────────────────────────────
  sections.push(
    new Paragraph({ text: '', spacing: { before: 800 } }),
    new Paragraph({
      children: [
        new TextRun({
          text: `${company} | Daily Transaction Report | ${data.date} | ${data.footerText || 'CONFIDENTIAL'}`,
          font: 'Calibri',
          size: 16,
          color: '94A3B8',
          italics: true,
        }),
      ],
      alignment: AlignmentType.CENTER,
      border: { top: { style: BorderStyle.SINGLE, size: 1, color: primary } },
    }),
  )

  const doc = new Document({
    title: `Daily Transaction Report - ${data.date}`,
    description: `Transaction report generated by ${company}`,
    styles: {
      default: {
        heading1: {
          run: { font: 'Calibri', size: 36, bold: true, color: primary },
          paragraph: { spacing: { before: 400, after: 200 }, border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: primary } } },
        },
        heading2: { run: { font: 'Calibri', size: 28, bold: true, color: '1E293B' } },
        document: { run: { font: 'Calibri', size: 22, color: '1E293B' } },
      },
    },
    sections: [
      {
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: company, bold: true, font: 'Calibri', size: 18, color: primary }),
                  new TextRun({ text: ' | Daily Transaction Report | ', font: 'Calibri', size: 18, color: '64748B' }),
                  new TextRun({ text: data.date, font: 'Calibri', size: 18, color: '64748B' }),
                ],
                alignment: AlignmentType.RIGHT,
                border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: primary } },
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: 'Page ', font: 'Calibri', size: 16, color: '94A3B8' }),
                  new TextRun({ children: [PageNumber.CURRENT], font: 'Calibri', size: 16, color: '94A3B8' }),
                  new TextRun({ text: ' of ', font: 'Calibri', size: 16, color: '94A3B8' }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], font: 'Calibri', size: 16, color: '94A3B8' }),
                  new TextRun({ text: '  |  CONFIDENTIAL', font: 'Calibri', size: 16, color: '94A3B8', italics: true }),
                ],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        },
        children: sections,
      },
    ],
  })

  const buf = await Packer.toBuffer(doc)
  return toArrayBuffer(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength))
}
