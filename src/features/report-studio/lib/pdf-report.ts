import type { PDFOptions, ReportData } from './types'

export type { PDFOptions } from './types'

function fmtNum(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(n)
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`
}

function fmtAmount(n: number): string {
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(n)
}

interface PdfMake {
  vfs: Record<string, string>
  createPdf(def: unknown): { getBuffer(cb: (buf: Uint8Array) => void): void }
}

/**
 * Resolve pdfmake's bundled vfs across module-interop shapes (v0.3 ships the
 * font map under `.vfs`, but bundlers may nest it under `.default`/`.pdfMake`,
 * or expose the font map directly). Mirrors the platform export worker.
 */
function resolveVfs(mod: unknown): Record<string, string> {
  const m = mod as Record<string, unknown> & {
    default?: Record<string, unknown> & { vfs?: Record<string, string> }
    vfs?: Record<string, string>
    pdfMake?: { vfs?: Record<string, string> }
  }
  const isFontMap = (o: unknown): o is Record<string, string> =>
    Boolean(o) && typeof o === 'object' && Object.keys(o as object).some((k) => k.toLowerCase().endsWith('.ttf'))
  if (m.vfs) return m.vfs
  if (m.default?.vfs) return m.default.vfs
  if (m.pdfMake?.vfs) return m.pdfMake.vfs
  if (isFontMap(m.default)) return m.default
  if (isFontMap(m)) return m as Record<string, string>
  return {}
}

function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(view.byteLength)
  new Uint8Array(out).set(view)
  return out
}

function statusOf(rate: number): string {
  return rate >= 95 ? 'Excellent' : rate >= 85 ? 'Good' : rate >= 70 ? 'Warning' : 'Critical'
}

function statusColor(rate: number): string {
  return rate >= 95 ? '#00AA44' : rate >= 85 ? '#0066CC' : rate >= 70 ? '#FF9900' : '#CC3300'
}

/**
 * Build a data-driven, auto-paginating PDF with pdfmake and return raw bytes
 * (no download side effect). Runs inside the export worker.
 *
 * pdfmake replaces the old jsPDF + jspdf-autotable path (autotable OOMs past a
 * few thousand rows). `table.headerRows: 1` auto-repeats the header across page
 * breaks, so there is no manual page-header bookkeeping. The bundled Roboto vfs
 * makes the output OS-independent and fully offline.
 *
 * `chartSvg` is a REAL ECharts-rendered SVG string (vector — crisp & small for
 * PDF), embedded via pdfmake's `{ svg }`. No hand-drawn lineTo chart, no
 * `Math.random()` fallback series.
 */
export async function buildPdf(
  data: ReportData,
  options: PDFOptions,
  chartSvg?: string | null,
): Promise<ArrayBuffer> {
  const pdfMakeMod = await import('pdfmake/build/pdfmake')
  const pdfFontsMod = await import('pdfmake/build/vfs_fonts')
  const pdfMake = (pdfMakeMod as unknown as { default: PdfMake }).default ?? (pdfMakeMod as unknown as PdfMake)
  pdfMake.vfs = resolveVfs(pdfFontsMod)

  const company = data.companyName || 'Telecom Analytics'
  const primary = (data.primaryColor && /^#[0-9a-fA-F]{6}$/.test(data.primaryColor) ? data.primaryColor : '#003087')

  const logoUri = data.logoBytes ? logoDataUri(data) : null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = []

  // ── Cover block ────────────────────────────────────────────────────────────
  if (logoUri) content.push({ image: logoUri, width: 56, margin: [0, 0, 0, 8] })
  content.push(
    { text: company, style: 'company' },
    { text: 'Daily Transaction Report', style: 'title' },
    { text: data.date, style: 'subtitle' },
    {
      columns: [
        kpiBlock('Transactions', fmtNum(data.totalTransactions), primary),
        kpiBlock('Success Rate', fmtPct(data.successRate), statusColor(data.successRate)),
        kpiBlock('Revenue', fmtAmount(data.totalRevenue), '#FF9900'),
        kpiBlock('Failed', fmtNum(data.failedTransactions), '#CC3300'),
      ],
      columnGap: 8,
      margin: [0, 12, 0, 8],
    },
  )

  // ── Executive summary (AI when present) ────────────────────────────────────
  if (data.aiNarrative?.executiveSummary) {
    content.push(
      { text: 'Executive Summary', style: 'h1', margin: [0, 12, 0, 6] },
      { text: data.aiNarrative.executiveSummary, style: 'body', margin: [0, 0, 0, 6] },
      ...data.aiNarrative.keyFindings.map((f) => ({ text: f, style: 'bullet' })),
    )
  }

  // ── Channel performance (auto-paginating table) ────────────────────────────
  content.push(
    { text: 'Channel Performance', style: 'h1', pageBreak: 'before', margin: [0, 0, 0, 6] },
    {
      table: {
        headerRows: 1,
        widths: ['*', 'auto', 'auto', 'auto', 'auto'],
        body: [
          ['Channel', 'Volume', 'Success', 'Revenue', 'Status'].map((h) => ({ text: h, style: 'th' })),
          ...data.topChannels.map((ch) => [
            { text: ch.name, style: 'td' },
            { text: fmtNum(ch.volume), style: 'tdNum' },
            { text: fmtPct(ch.successRate), style: 'tdNum', color: statusColor(ch.successRate), bold: true },
            { text: fmtAmount(ch.revenue), style: 'tdNum' },
            { text: statusOf(ch.successRate), color: statusColor(ch.successRate), fontSize: 9 },
          ]),
        ],
      },
      layout: 'lightHorizontalLines',
    },
  )

  // ── Previous-period comparison (real Welch t-test) ─────────────────────────
  if (data.comparison) {
    const c = data.comparison
    content.push(
      { text: 'Period-over-Period', style: 'h1', margin: [0, 14, 0, 6] },
      {
        table: {
          headerRows: 1,
          widths: ['*', 'auto', 'auto'],
          body: [
            ['Metric', 'Today', `Prev (${c.prev.date})`].map((h) => ({ text: h, style: 'th' })),
            ['Transactions', fmtNum(data.totalTransactions), fmtNum(Math.round(c.prev.totalTransactions))],
            ['Success Rate', fmtPct(data.successRate), fmtPct(c.prev.successRate)],
            ['Revenue', fmtAmount(data.totalRevenue), fmtAmount(c.prev.totalRevenue)],
          ],
        },
        layout: 'lightHorizontalLines',
      },
    )
    if (c.volumeTrend) {
      content.push({
        text: `Volume trend Welch t-test: p=${c.volumeTrend.pValue.toFixed(4)} (${c.volumeTrend.significant ? 'significant' : 'not significant'}).`,
        style: 'caption',
        margin: [0, 4, 0, 0],
      })
    }
  }

  // ── Real chart (vector SVG) ────────────────────────────────────────────────
  if (options.includeCharts && chartSvg) {
    content.push(
      { text: 'Hourly Distribution', style: 'h1', pageBreak: 'before', margin: [0, 0, 0, 6] },
      { svg: chartSvg, width: 515, margin: [0, 4, 0, 8] },
    )
  }

  // ── Anomalies (seeded GESD) ────────────────────────────────────────────────
  if (data.anomalies?.length) {
    content.push(
      { text: 'Flagged Anomalies', style: 'h1', margin: [0, 12, 0, 6] },
      ...data.anomalies.map((a) => ({
        text: `Hour ${a.hour}:00 — volume ${fmtNum(a.count)}, success ${fmtPct(a.successRate)} (GESD score ${a.score.toFixed(2)}).`,
        style: 'bullet',
      })),
    )
  }

  const docDefinition = {
    pageSize: options.paperSize === 'letter' ? 'LETTER' : 'A4',
    pageMargins: [40, 56, 40, 48],
    header: (currentPage: number) =>
      currentPage === 1
        ? undefined
        : {
            columns: [
              { text: company, fontSize: 8, color: '#94a3b8', margin: [40, 20, 0, 0] },
              { text: `Daily Transaction Report — ${data.date}`, fontSize: 8, color: '#94a3b8', alignment: 'right', margin: [0, 20, 40, 0] },
            ],
          },
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: data.footerText || 'CONFIDENTIAL', fontSize: 8, color: '#94a3b8', margin: [40, 0, 0, 0] },
        { text: `Page ${currentPage} of ${pageCount}`, alignment: 'center', fontSize: 8, color: '#94a3b8' },
        { text: company, alignment: 'right', fontSize: 8, color: '#94a3b8', margin: [0, 0, 40, 0] },
      ],
    }),
    content,
    styles: {
      company: { fontSize: 12, bold: true, color: primary, margin: [0, 0, 0, 2] },
      title: { fontSize: 24, bold: true, color: '#0f172a', margin: [0, 0, 0, 2] },
      subtitle: { fontSize: 12, color: '#64748b', margin: [0, 0, 0, 4] },
      h1: { fontSize: 15, bold: true, color: primary },
      body: { fontSize: 10, color: '#1e293b' },
      bullet: { fontSize: 10, color: '#1e293b', margin: [8, 1, 0, 1] },
      caption: { fontSize: 8, italics: true, color: '#64748b' },
      th: { bold: true, color: 'white', fillColor: primary, fontSize: 10 },
      td: { fontSize: 10, color: '#1e293b' },
      tdNum: { fontSize: 10, color: '#1e293b', alignment: 'right' },
    },
    defaultStyle: { font: 'Roboto', fontSize: 10 },
  }

  return await new Promise<ArrayBuffer>((resolve, reject) => {
    try {
      pdfMake.createPdf(docDefinition).getBuffer((buf: Uint8Array) => resolve(toArrayBuffer(buf)))
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)))
    }
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function kpiBlock(label: string, value: string, color: string): any {
  return {
    table: {
      widths: ['*'],
      body: [[{ text: value, color, bold: true, fontSize: 13, alignment: 'center' }], [{ text: label, color: '#64748b', fontSize: 8, alignment: 'center' }]],
    },
    layout: 'noBorders',
  }
}

/** Base64 data URI of the local logo bytes (offline; no remote fetch). */
function logoDataUri(data: ReportData): string | null {
  if (!data.logoBytes) return null
  const view = new Uint8Array(data.logoBytes)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < view.length; i += chunk) {
    binary += String.fromCharCode(...view.subarray(i, i + chunk))
  }
  const mime = data.logoMime || 'image/png'
  return `data:${mime};base64,${btoa(binary)}`
}
