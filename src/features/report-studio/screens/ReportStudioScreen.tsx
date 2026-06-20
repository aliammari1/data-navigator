"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBranding } from "../hooks/use-branding";
import { useReportData } from "../hooks/use-report-data";
import { useExportWorker } from "../hooks/use-export-worker";
import { useReportNarrative } from "../hooks/use-report-narrative";
import { ChannelSelector } from "../components/ChannelSelector";
import { BrandingPanel } from "../components/BrandingPanel";
import { PresentationOverlay } from "../components/PresentationOverlay";
import { HourlyChartPreview } from "../components/HourlyChartPreview";
import type {
  BrandingProfile,
  DocxOptions,
  PDFOptions,
  PptxTemplate,
  ReportData,
} from "../lib/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

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

/** Merge the active branding profile into the report data for exports. */
function applyBranding(data: ReportData, branding: BrandingProfile): ReportData {
  if (!branding.applyToAll) return data;
  return {
    ...data,
    companyName: branding.companyName,
    primaryColor: branding.primaryColor,
    footerText: branding.footerText,
    logoBytes: branding.logoBytes,
    logoMime: branding.logoMime,
  };
}

const TEMPLATES_DEF = [
  {
    id: "daily-ops",
    name: "Daily Operations Report",
    icon: "⚙",
    description: "Success rates, failures, hourly breakdown for ops.",
    sections: ["Volume", "Success Rates", "Failures", "Hourly", "Channel Status"],
    tab: "pdf",
    color: "from-blue-600 to-blue-800",
    border: "border-blue-500/20",
  },
  {
    id: "management",
    name: "Management Summary",
    icon: "📊",
    description: "High-level KPIs and trends for executive review.",
    sections: ["Executive KPIs", "Revenue", "Trends", "Champions", "Decisions"],
    tab: "pptx",
    color: "from-violet-600 to-violet-800",
    border: "border-violet-500/20",
  },
  {
    id: "technical",
    name: "Technical Analysis",
    icon: "🔬",
    description: "Error patterns, anomaly detection for technical teams.",
    sections: ["Error Analysis", "Processing Times", "Anomalies", "Root Cause", "Health"],
    tab: "docx",
    color: "from-slate-600 to-slate-800",
    border: "border-slate-500/20",
  },
  {
    id: "revenue",
    name: "Revenue Report",
    icon: "💰",
    description: "Revenue breakdown by channel and trends.",
    sections: ["Revenue by Channel", "Top Generators", "Distribution", "Trends", "KPIs"],
    tab: "xlsx",
    color: "from-amber-600 to-amber-800",
    border: "border-amber-500/20",
  },
  {
    id: "compliance",
    name: "Compliance Report",
    icon: "📋",
    description: "SLA performance and audit-ready documentation.",
    sections: ["SLA", "Policy", "Audit Trail", "Breaches", "Corrective Actions"],
    tab: "docx",
    color: "from-green-600 to-green-800",
    border: "border-green-500/20",
  },
];

function TemplateCard({
  template,
  onUse,
}: {
  template: (typeof TEMPLATES_DEF)[0];
  onUse: (tab: string) => void;
}) {
  return (
    <div
      className={`relative rounded-xl border bg-card overflow-hidden ${template.border} group hover:ring-1 hover:ring-primary/30 transition-all`}
    >
      <div className={`bg-gradient-to-br ${template.color} p-5 relative overflow-hidden`}>
        <div className="absolute top-2 right-3 opacity-20 text-6xl pointer-events-none">
          {template.icon}
        </div>
        <div className="bg-white/10 rounded-lg p-3 space-y-2 relative z-10">
          <div className="h-2 bg-white/40 rounded w-3/4" />
          <div className="grid grid-cols-3 gap-1">
            {[0, 1, 2].map((k) => (
              <div key={k} className="h-6 bg-white/20 rounded" />
            ))}
          </div>
        </div>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-start gap-2">
          <span className="text-2xl">{template.icon}</span>
          <div>
            <div className="font-semibold text-sm text-foreground">{template.name}</div>
            <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              {template.description}
            </div>
          </div>
        </div>
        <div className="space-y-1">
          {template.sections.map((s) => (
            <div key={s} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-1 h-1 rounded-full bg-primary/60 shrink-0" />
              {s}
            </div>
          ))}
        </div>
        <Button size="sm" className="w-full mt-1" onClick={() => onUse(template.tab)}>
          Use Template
        </Button>
      </div>
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function ReportStudioScreen() {
  const [activeTab, setActiveTab] = useState("pptx");
  const [presentationOpen, setPresentationOpen] = useState(false);
  const [reportDate, setReportDate] = useState(() => new Date().toISOString().slice(0, 10));

  const { branding, update, setLogoFromFile, clearLogo } = useBranding();
  const { data: rawData, isLoading, isDemo, datasetName } = useReportData(reportDate);
  const { exportPptx, exportDocx, exportPdf, exportXlsx } = useExportWorker();
  const narrative = useReportNarrative();

  // The data fed to exports/preview: real aggregate + branding + (optional) AI.
  const [aiNarrative, setAiNarrative] = useState<ReportData["aiNarrative"]>(undefined);
  const reportData = useMemo<ReportData>(() => {
    const branded = applyBranding({ ...rawData, date: reportDate }, branding);
    return aiNarrative ? { ...branded, aiNarrative } : branded;
  }, [rawData, reportDate, branding, aiNarrative]);

  // Reset a stale AI narrative whenever the underlying data changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: rawData is an intentional trigger to re-run the reset; it is not read in the body.
  useEffect(() => {
    setAiNarrative(undefined);
  }, [rawData]);

  // PPTX state
  const [pptxTemplate, setPptxTemplate] = useState<PptxTemplate>("corporate-blue");
  const [pptxPeriod, setPptxPeriod] = useState("Daily");
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  // Keep selection in sync with the (possibly changing) channel set.
  useEffect(() => {
    setSelectedChannels(rawData.topChannels.map((c) => c.name));
  }, [rawData.topChannels]);

  // DOCX / PDF options
  const [docxSections, setDocxSections] = useState<DocxOptions["includeSections"]>({
    executiveSummary: true,
    keyMetrics: true,
    channelPerformance: true,
    issues: true,
    recommendations: true,
  });
  const [pdfOptions, setPdfOptions] = useState<PDFOptions>({
    paperSize: "a4",
    includeCharts: true,
  });

  // Per-format busy/done state.
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [done, setDone] = useState<Record<string, boolean>>({});
  const runExport = useCallback(async (kind: string, fn: () => Promise<{ saved: boolean }>) => {
    setBusy((b) => ({ ...b, [kind]: true }));
    setDone((d) => ({ ...d, [kind]: false }));
    try {
      const res = await fn();
      if (res.saved) setDone((d) => ({ ...d, [kind]: true }));
    } catch (e) {
      console.error(`${kind} export failed:`, e);
    } finally {
      setBusy((b) => ({ ...b, [kind]: false }));
    }
  }, []);

  const [aiBusy, setAiBusy] = useState(false);
  const generateNarrative = useCallback(async () => {
    setAiBusy(true);
    try {
      const result = await narrative.generate({ ...rawData, date: reportDate });
      setAiNarrative(result);
    } catch (e) {
      console.error("AI narrative failed:", e);
    } finally {
      setAiBusy(false);
    }
  }, [narrative, rawData, reportDate]);

  const toggleChannel = useCallback((name: string) => {
    setSelectedChannels((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name],
    );
  }, []);
  const toggleAllChannels = useCallback(() => {
    setSelectedChannels((prev) =>
      prev.length === rawData.topChannels.length ? [] : rawData.topChannels.map((c) => c.name),
    );
  }, [rawData.topChannels]);

  const docxPageEst = Object.values(docxSections).filter(Boolean).length * 1.5 + 1;

  return (
    <>
      {presentationOpen && (
        <PresentationOverlay data={reportData} onClose={() => setPresentationOpen(false)} />
      )}

      <div className="min-h-screen bg-background p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Executive Report Studio</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Generate offline PowerPoint, Word, PDF and Excel reports for {branding.companyName}
            </p>
            <p className="text-xs mt-1">
              {isDemo ? (
                <span className="text-amber-400">
                  Demo data — import a dataset to report on real transactions.
                </span>
              ) : (
                <span className="text-green-400">
                  Live aggregate from “{datasetName}” (DuckDB){isLoading ? " · refreshing…" : ""}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPresentationOpen(true)}>
              <span className="mr-1.5">▶</span> Present
            </Button>
            <div
              className="w-3 h-3 rounded-full border-2 border-white/20"
              style={{ backgroundColor: branding.primaryColor }}
              title="Brand color"
            />
          </div>
        </div>

        {/* AI narrative bar */}
        <Card size="sm">
          <CardContent className="pt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <span className="font-medium">AI Executive Narrative</span>
              <span className="text-muted-foreground ml-2">
                {aiNarrative
                  ? "Generated — embedded into PPTX / DOCX / PDF exports."
                  : "Summarize this report with the on-device model."}
              </span>
            </div>
            <Button size="sm" onClick={generateNarrative} disabled={aiBusy}>
              {aiBusy ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin">⟳</span> Analyzing…
                </span>
              ) : aiNarrative ? (
                "Regenerate"
              ) : (
                "Generate narrative"
              )}
            </Button>
          </CardContent>
        </Card>

        {aiNarrative && (
          <Card>
            <CardHeader>
              <CardTitle>Executive Summary (AI)</CardTitle>
              <CardDescription>
                Grammar-constrained output from the offline provider registry.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-foreground">{aiNarrative.executiveSummary}</p>
              {aiNarrative.keyFindings.length > 0 && (
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  {aiNarrative.keyFindings.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="pptx">PowerPoint</TabsTrigger>
            <TabsTrigger value="docx">Word Document</TabsTrigger>
            <TabsTrigger value="pdf">PDF Report</TabsTrigger>
            <TabsTrigger value="xlsx">Excel</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="presentation">Presentation</TabsTrigger>
            <TabsTrigger value="branding">Branding</TabsTrigger>
          </TabsList>

          {/* ── PowerPoint ──────────────────────────────────────────────────── */}
          <TabsContent value="pptx" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1 space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Report Configuration</CardTitle>
                    <CardDescription>
                      Configure your PowerPoint presentation settings
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Report Date
                      </label>
                      <Input
                        type="date"
                        value={reportDate}
                        onChange={(e) => setReportDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Report Period
                      </label>
                      <select
                        className="w-full h-9 rounded-md border border-input bg-transparent px-2.5 text-sm"
                        value={pptxPeriod}
                        onChange={(e) => setPptxPeriod(e.target.value)}
                      >
                        {["Daily", "Weekly", "Monthly", "Quarterly"].map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Visual Template</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {(
                      [
                        {
                          id: "corporate-blue",
                          label: "Corporate Blue",
                          desc: "Navy & blue professional theme",
                          color: "#003087",
                        },
                        {
                          id: "modern-dark",
                          label: "Modern Dark",
                          desc: "Dark background with purple accents",
                          color: "#7C3AED",
                        },
                        {
                          id: "clean-white",
                          label: "Clean White",
                          desc: "Light minimal corporate theme",
                          color: "#2563EB",
                        },
                      ] as const
                    ).map((t) => (
                      <button
                        type="button"
                        key={t.id}
                        onClick={() => setPptxTemplate(t.id)}
                        className={`w-full flex items-center gap-3 rounded-lg p-3 border text-left transition-all ${pptxTemplate === t.id ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border hover:border-muted-foreground/30 hover:bg-muted/50"}`}
                      >
                        <div
                          className="w-8 h-8 rounded-md shrink-0"
                          style={{ backgroundColor: t.color }}
                        />
                        <div>
                          <div className="text-sm font-medium">{t.label}</div>
                          <div className="text-xs text-muted-foreground">{t.desc}</div>
                        </div>
                        {pptxTemplate === t.id && (
                          <span className="ml-auto text-primary text-xs font-semibold">
                            Selected
                          </span>
                        )}
                      </button>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Channel Selection</CardTitle>
                    <CardDescription>
                      {selectedChannels.length} of {rawData.topChannels.length} selected
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ChannelSelector
                      channels={rawData.topChannels}
                      selected={selectedChannels}
                      onToggle={toggleChannel}
                      onToggleAll={toggleAllChannels}
                    />
                  </CardContent>
                </Card>
              </div>

              <div className="lg:col-span-2 space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Report Preview</CardTitle>
                        <CardDescription>
                          10-slide executive deck — real hourly chart shown below
                        </CardDescription>
                      </div>
                      <Button
                        size="lg"
                        onClick={() =>
                          runExport("pptx", () =>
                            exportPptx(reportData, pptxTemplate, selectedChannels),
                          )
                        }
                        disabled={busy.pptx || selectedChannels.length === 0}
                        className="min-w-[180px]"
                      >
                        {busy.pptx ? (
                          <span className="flex items-center gap-2">
                            <span className="animate-spin">⟳</span> Generating…
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <span>⬇</span> Generate PowerPoint
                          </span>
                        )}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <HourlyChartPreview
                      hourly={rawData.hourlyData}
                      primaryColor={branding.primaryColor}
                    />
                    <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {[
                        "Title",
                        "Summary",
                        "Channels",
                        "Success",
                        "Revenue",
                        "Hourly",
                        "Top",
                        "Issues",
                        "Trends",
                        "Recs",
                      ].map((label, i) => (
                        <div
                          key={label}
                          className="rounded-md bg-muted/40 border border-border px-2 py-1 text-[10px] text-muted-foreground text-center truncate"
                        >
                          {i + 1}. {label}
                        </div>
                      ))}
                    </div>
                    {done.pptx && (
                      <div className="mt-4 flex items-center gap-2 rounded-lg bg-green-500/10 border border-green-500/20 px-4 py-3">
                        <span className="text-green-400">✓</span>
                        <span className="text-sm text-green-400 font-medium">
                          PowerPoint saved.
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card size="sm">
                  <CardContent className="pt-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      {[
                        { label: "Transactions", value: fmtNum(rawData.totalTransactions) },
                        { label: "Success Rate", value: fmtPct(rawData.successRate) },
                        { label: "Revenue", value: fmtAmount(rawData.totalRevenue) },
                        { label: "Failed", value: fmtNum(rawData.failedTransactions) },
                      ].map((s) => (
                        <div key={s.label} className="text-center">
                          <div className="text-lg font-bold text-foreground">{s.value}</div>
                          <div className="text-xs text-muted-foreground">{s.label}</div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* ── Word ────────────────────────────────────────────────────────── */}
          <TabsContent value="docx" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Document Sections</CardTitle>
                    <CardDescription>Select which sections to include</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {(
                      [
                        {
                          key: "executiveSummary",
                          label: "Executive Summary",
                          desc: "AI narrative or computed summary",
                        },
                        {
                          key: "keyMetrics",
                          label: "Key Metrics Table",
                          desc: "Real previous-period comparison when available",
                        },
                        {
                          key: "channelPerformance",
                          label: "Channel Performance",
                          desc: "Styled data table",
                        },
                        {
                          key: "issues",
                          label: "Issues & Anomalies",
                          desc: "Seeded GESD anomaly flags",
                        },
                        { key: "recommendations", label: "Recommendations", desc: "Action items" },
                      ] as const
                    ).map(({ key, label, desc }) => (
                      <label key={key} className="flex items-start gap-3 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={docxSections[key]}
                          onChange={(e) =>
                            setDocxSections((p) => ({ ...p, [key]: e.target.checked }))
                          }
                          className="mt-0.5 accent-primary"
                        />
                        <div>
                          <div className="text-sm font-medium">{label}</div>
                          <div className="text-xs text-muted-foreground">{desc}</div>
                        </div>
                      </label>
                    ))}
                  </CardContent>
                </Card>

                <Card size="sm">
                  <CardContent className="pt-4 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Estimated pages</span>
                      <span className="font-semibold">~{Math.round(docxPageEst)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Sections</span>
                      <span className="font-semibold">
                        {Object.values(docxSections).filter(Boolean).length} / 5
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Chart</span>
                      <span className="font-semibold">Embedded PNG</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="lg:col-span-2 space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Word Document</CardTitle>
                        <CardDescription>
                          Tables, formatted sections and a real embedded chart
                        </CardDescription>
                      </div>
                      <Button
                        size="lg"
                        onClick={() =>
                          runExport("docx", () =>
                            exportDocx(reportData, { includeSections: docxSections }),
                          )
                        }
                        disabled={busy.docx || Object.values(docxSections).every((v) => !v)}
                      >
                        {busy.docx ? (
                          <span className="flex items-center gap-2">
                            <span className="animate-spin">⟳</span> Generating…
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <span>⬇</span> Generate Word Doc
                          </span>
                        )}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-white dark:bg-slate-900 rounded-lg border border-border shadow-inner p-6 space-y-4 min-h-[300px] font-serif">
                      <div className="text-center space-y-2 border-b border-slate-200 dark:border-slate-700 pb-4">
                        <div className="text-xs text-blue-700 dark:text-blue-400 font-sans font-bold uppercase tracking-widest">
                          {branding.companyName}
                        </div>
                        <div className="text-xl font-bold text-slate-900 dark:text-white">
                          Daily Transaction Report
                        </div>
                        <div className="text-sm text-slate-500">{reportDate}</div>
                      </div>
                      {docxSections.executiveSummary && (
                        <div className="space-y-1.5">
                          <div className="text-sm font-bold text-blue-700 dark:text-blue-400">
                            1. Executive Summary
                          </div>
                          <div className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                            {reportData.aiNarrative?.executiveSummary ??
                              `${fmtNum(rawData.totalTransactions)} transactions at ${fmtPct(rawData.successRate)} success rate.`}
                          </div>
                        </div>
                      )}
                      {docxSections.channelPerformance && (
                        <div className="text-xs text-slate-500 dark:text-slate-400 italic">
                          Table: {rawData.topChannels.length} channels with volume, success rate,
                          revenue…
                        </div>
                      )}
                      {done.docx && (
                        <div className="text-xs text-green-600">✓ Word document saved.</div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* ── PDF ─────────────────────────────────────────────────────────── */}
          <TabsContent value="pdf" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>PDF Options</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Paper Size
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {(["a4", "letter"] as const).map((size) => (
                          <button
                            type="button"
                            key={size}
                            onClick={() => setPdfOptions((p) => ({ ...p, paperSize: size }))}
                            className={`rounded-lg border py-2.5 text-sm font-medium transition-all ${pdfOptions.paperSize === size ? "border-primary bg-primary/5 text-primary ring-1 ring-primary/30" : "border-border hover:border-muted-foreground/30"}`}
                          >
                            {size === "a4" ? "A4" : "Letter"}
                          </button>
                        ))}
                      </div>
                    </div>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={pdfOptions.includeCharts}
                        onChange={(e) =>
                          setPdfOptions((p) => ({ ...p, includeCharts: e.target.checked }))
                        }
                        className="accent-primary"
                      />
                      <div>
                        <div className="text-sm font-medium">Include Chart Page</div>
                        <div className="text-xs text-muted-foreground">
                          Real vector chart (auto-paginated)
                        </div>
                      </div>
                    </label>
                  </CardContent>
                </Card>
                <Button
                  size="lg"
                  className="w-full"
                  onClick={() => runExport("pdf", () => exportPdf(reportData, pdfOptions))}
                  disabled={busy.pdf}
                >
                  {busy.pdf ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin">⟳</span> Generating…
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <span>⬇</span> Generate PDF
                    </span>
                  )}
                </Button>
                {done.pdf && <p className="text-xs text-green-600 text-center">✓ PDF saved.</p>}
              </div>

              <div className="lg:col-span-2">
                <Card>
                  <CardHeader>
                    <CardTitle>PDF Structure</CardTitle>
                    <CardDescription>
                      Auto-paginating (pdfmake) · {pdfOptions.paperSize.toUpperCase()} · bundled
                      Roboto font
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {[
                        { title: "Cover + KPIs", desc: "Company, date, KPI blocks, embedded logo" },
                        {
                          title: "Channel Performance",
                          desc: "Auto-paginated table; header repeats per page",
                        },
                        {
                          title: "Period-over-Period",
                          desc: "Real previous-period aggregate + Welch t-test",
                        },
                        ...(pdfOptions.includeCharts
                          ? [
                              {
                                title: "Hourly Distribution",
                                desc: "Vector ECharts chart (no rasterization)",
                              },
                            ]
                          : []),
                        { title: "Flagged Anomalies", desc: "Seeded GESD anomaly hours" },
                      ].map(({ title, desc }, i) => (
                        <div key={title} className="flex gap-4 items-start">
                          <div className="bg-slate-800 dark:bg-slate-900 rounded-lg w-12 h-16 shrink-0 flex items-center justify-center border border-white/10 text-white/50 text-xs font-mono">
                            {i + 1}
                          </div>
                          <div className="pt-1">
                            <div className="text-sm font-semibold">{title}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* ── Excel ───────────────────────────────────────────────────────── */}
          <TabsContent value="xlsx" className="mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Excel Workbook</CardTitle>
                    <CardDescription>
                      Streaming exceljs export — Summary, Channels, Hourly and Anomalies sheets
                    </CardDescription>
                  </div>
                  <Button
                    size="lg"
                    onClick={() => runExport("xlsx", () => exportXlsx(reportData))}
                    disabled={busy.xlsx}
                  >
                    {busy.xlsx ? (
                      <span className="flex items-center gap-2">
                        <span className="animate-spin">⟳</span> Generating…
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <span>⬇</span> Generate Excel
                      </span>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { name: "Summary", rows: "5 metrics" },
                    { name: "Channels", rows: `${rawData.topChannels.length} rows` },
                    { name: "Hourly", rows: `${rawData.hourlyData.length} rows` },
                    { name: "Anomalies", rows: `${rawData.anomalies?.length ?? 0} rows` },
                  ].map((s) => (
                    <div key={s.name} className="rounded-lg border border-border p-3 text-center">
                      <div className="text-sm font-semibold">{s.name}</div>
                      <div className="text-xs text-muted-foreground">{s.rows}</div>
                    </div>
                  ))}
                </div>
                {done.xlsx && (
                  <p className="text-xs text-green-600 mt-3">✓ Excel workbook saved.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Templates ───────────────────────────────────────────────────── */}
          <TabsContent value="templates" className="mt-4">
            <div className="mb-4">
              <h2 className="text-lg font-semibold">Report Template Library</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Pre-built templates for different use cases. Click “Use Template” to open the
                relevant export tab.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              {TEMPLATES_DEF.map((tmpl) => (
                <TemplateCard key={tmpl.id} template={tmpl} onUse={(tab) => setActiveTab(tab)} />
              ))}
            </div>
          </TabsContent>

          {/* ── Presentation ────────────────────────────────────────────────── */}
          <TabsContent value="presentation" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Presentation Mode</CardTitle>
                  <CardDescription>
                    Full-screen kiosk mode for meetings. Auto-advances every 8 seconds.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span className="text-lg">→</span>
                      <span>5 slides in the rotation</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span className="text-lg">⏱</span>
                      <span>8-second auto-advance with manual override</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span className="text-lg">⌨</span>
                      <span>Arrow keys to navigate, Escape to exit</span>
                    </div>
                  </div>
                  <Button size="lg" className="w-full" onClick={() => setPresentationOpen(true)}>
                    <span className="mr-2">▶</span> Launch Presentation
                  </Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Preview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-[#03071e] rounded-xl overflow-hidden aspect-video p-6 flex flex-col items-center justify-center space-y-4">
                    <div className="text-blue-400/60 text-xs uppercase tracking-widest">
                      {branding.companyName}
                    </div>
                    <div className="text-white text-2xl font-bold text-center">
                      Daily Transaction
                      <br />
                      Report
                    </div>
                    <div className="text-slate-400 text-sm">{reportDate}</div>
                    <div className="flex items-center gap-6">
                      <div className="text-center">
                        <div className="text-blue-400 font-bold">
                          {fmtNum(rawData.totalTransactions)}
                        </div>
                        <div className="text-slate-600 text-xs">Transactions</div>
                      </div>
                      <div className="w-px h-8 bg-slate-700" />
                      <div className="text-center">
                        <div className="text-green-400 font-bold">
                          {fmtPct(rawData.successRate)}
                        </div>
                        <div className="text-slate-600 text-xs">Success Rate</div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Branding ────────────────────────────────────────────────────── */}
          <TabsContent value="branding" className="mt-4">
            <BrandingPanel
              branding={branding}
              update={update}
              setLogoFromFile={setLogoFromFile}
              clearLogo={clearLogo}
            />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
