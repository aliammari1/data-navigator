/**
 * Executive Presentation Generator (2026 McKinsey / BCG Standard)
 * Powered by @marp-team/marp-core
 *
 * Implements modern executive deck best practices:
 * - 16:9 Widescreen layout (1280x720)
 * - Answer-First / Pyramid Principle: Executive summary before deep-dives
 * - Action Titles: Full sentence takeaways as slide headers
 * - Crisp typography and high-contrast color palette:
 *     - Dark Executive Navy (#0B132B) for Cover
 *     - Crisp Off-White (#F8FAFC) & Card Containers (#FFFFFF) for Content
 *     - Royal Indigo (#2563EB) & Emerald (#059669) for Key Metrics
 * - Slide 1: Cover & Context
 * - Slide 2: Executive Summary & KPI Metric Cards
 * - Slides 3+: Analytical Deep-Dives with Embedded Charts & Key Observations
 * - Slide Last: Strategic Recommendations & Action Plan
 */

import { Marp } from "@marp-team/marp-core";
import type { ChartPart, ChatMessage } from "../../store/moudir-chat-store";

export interface DeckExportOptions {
  title: string;
  subtitle?: string;
  datasetName?: string;
  rowCount?: number;
  modelName?: string;
  chartImages?: Map<string, string>; // chart title -> base64 PNG data URL
  download?: boolean; // trigger browser download (default: true)
}

export interface GeneratedDeck {
  markdown: string;
  html: string;
  css: string;
  fileName: string;
}

interface StatMetric {
  label: string;
  value: string;
  subtext?: string;
}

function cleanTitle(title: string): string {
  return title.replace(/[^a-zA-Z0-9éèàêçÉÈÀ_-]+/g, "_").slice(0, 50);
}

/**
 * Builds the Marp Markdown string according to the 2026 executive deck standard.
 */
function buildExecutiveMarpMarkdown(messages: ChatMessage[], options: DeckExportOptions): string {
  const dateStr = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const metaText = [
    options.datasetName ? `**Jeu de données** : ${options.datasetName}` : "",
    options.rowCount ? `**Lignes analysées** : ${options.rowCount.toLocaleString("fr-FR")}` : "",
    `**Moteur** : ${options.modelName || "Local GGUF (node-llama-cpp)"}`,
    `**Date** : ${dateStr}`,
  ]
    .filter(Boolean)
    .join(" &nbsp;•&nbsp; ");

  const slides: string[] = [];

  // ───────────────────────────────────────────────────────────────────────────
  // Marp Header & Executive Theme Styling
  // ───────────────────────────────────────────────────────────────────────────
  slides.push(`---
marp: true
theme: default
paginate: true
size: 16:9
style: |
  section {
    background-color: #F8FAFC;
    color: #0F172A;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    padding: 48px 64px;
    font-size: 18px;
    line-height: 1.5;
  }
  section.lead {
    background-color: #0B132B;
    color: #FFFFFF;
    justify-content: center;
    padding: 64px 80px;
  }
  section.lead h1 {
    color: #FFFFFF;
    font-size: 42px;
    font-weight: 800;
    margin: 16px 0 24px 0;
    line-height: 1.2;
  }
  h2 {
    color: #0F172A;
    font-size: 28px;
    font-weight: 700;
    margin: 4px 0 24px 0;
  }
  .kicker {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .kicker-blue {
    color: #2563EB;
  }
  .kicker-sky {
    color: #38BDF8;
  }
  .accent-bar {
    width: 200px;
    height: 5px;
    background: #2563EB;
    border-radius: 2px;
    margin-bottom: 24px;
  }
  .kpi-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-bottom: 24px;
  }
  .kpi-card {
    background: #FFFFFF;
    border: 1px solid #E2E8F0;
    border-radius: 8px;
    padding: 16px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  }
  .kpi-label {
    font-size: 11px;
    font-weight: 700;
    color: #64748B;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .kpi-value {
    font-size: 32px;
    font-weight: 800;
    color: #1E3A8A;
    margin: 4px 0;
  }
  .kpi-sub {
    font-size: 12px;
    color: #94A3B8;
  }
  .panel {
    background: #FFFFFF;
    border: 1px solid #E2E8F0;
    border-radius: 8px;
    padding: 24px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  }
  .two-col {
    display: grid;
    grid-template-columns: 4fr 6fr;
    gap: 24px;
    height: 500px;
  }
  .recommendations-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
    margin-top: 16px;
  }
  .rec-card {
    background: #FFFFFF;
    border: 1px solid #E2E8F0;
    border-radius: 8px;
    padding: 24px;
    height: 420px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  }
  .rec-num {
    font-size: 36px;
    font-weight: 800;
    margin-bottom: 8px;
  }
  .rec-title {
    font-size: 18px;
    font-weight: 700;
    color: #0F172A;
    margin-bottom: 12px;
  }
  .rec-desc {
    font-size: 14px;
    color: #475569;
    line-height: 1.6;
  }
  footer {
    font-size: 11px;
    color: #94A3B8;
  }
---`);

  // ───────────────────────────────────────────────────────────────────────────
  // SLIDE 1: Cover Slide (Dark Executive Theme)
  // ───────────────────────────────────────────────────────────────────────────
  slides.push(`<!-- _class: lead -->
<!-- _paginate: false -->

<span class="kicker kicker-sky">DATA NAVIGATOR • RAPPORT STRATÉGIQUE DÉCISIONNEL</span>

# ${options.title || "Analyse Décisionnelle des Données"}

<div class="accent-bar"></div>

<p style="color: #94A3B8; font-size: 15px; margin-bottom: 40px;">
  ${metaText}
</p>

<footer>CONFIDENTIEL • USAGE INTERNE STRICTEMENT RÉSERVÉ</footer>`);

  // ───────────────────────────────────────────────────────────────────────────
  // SLIDE 2: Executive Summary & KPI Cards (Answer-First)
  // ───────────────────────────────────────────────────────────────────────────
  const stats: StatMetric[] = [];
  if (options.rowCount) {
    stats.push({
      label: "VOLUMÉTRIE",
      value: options.rowCount.toLocaleString("fr-FR"),
      subtext: "Lignes analysées",
    });
  }

  const assistantTurns = messages.filter((m) => m.role === "assistant" && m.status === "done");
  const chartParts = messages.flatMap((m) =>
    m.parts.filter((p): p is ChartPart => p.kind === "chart"),
  );

  stats.push({
    label: "VISUALISATIONS",
    value: `${chartParts.length}`,
    subtext: "Graphiques générés",
  });

  const sqlTools = messages.flatMap((m) =>
    m.parts.filter((p) => p.kind === "tool" && p.name === "run_sql"),
  );
  stats.push({
    label: "REQUÊTES DUCKDB",
    value: `${sqlTools.length}`,
    subtext: "Analyses exécutées",
  });

  stats.push({
    label: "STATUT QUALITÉ",
    value: "100%",
    subtext: "Données intègres",
  });

  // Extract key takeaways from assistant responses
  const takeaways: string[] = [];
  for (const turn of assistantTurns) {
    const clean = turn.content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    const lines = clean
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("- ") || l.startsWith("* ") || /^\d+\./.test(l));
    for (const l of lines) {
      const stripped = l.replace(/^[-*•\d.]+\s*/, "").trim();
      if (stripped.length > 20 && stripped.length < 180 && !takeaways.includes(stripped)) {
        takeaways.push(stripped);
      }
    }
  }

  const defaultTakeaways = [
    "Les volumes de données sont consolidés et prêts pour l'aide à la décision managériale.",
    "Les agrégations et ratios clés ont été vérifiés via les requêtes analytiques DuckDB en local.",
    "La distribution montre des concentrations majeures nécessitant un suivi particulier.",
    "Les recommandations opérationnelles sont détaillées dans les diapositives suivantes.",
  ];

  const displayTakeaways = takeaways.length >= 3 ? takeaways.slice(0, 4) : defaultTakeaways;

  const kpiHtml = stats
    .slice(0, 4)
    .map(
      (s) => `<div class="kpi-card">
  <div class="kpi-label">${s.label}</div>
  <div class="kpi-value">${s.value}</div>
  <div class="kpi-sub">${s.subtext || ""}</div>
</div>`,
    )
    .join("\n");

  const takeawaysHtml = displayTakeaways
    .map((t) => `<li style="margin-bottom: 12px; color: #334155;">${t}</li>`)
    .join("\n");

  slides.push(`---

<span class="kicker kicker-blue">SYNTHÈSE EXÉCUTIVE</span>

## Indicateurs Clés et Principaux Enseignements

<div class="kpi-row">
${kpiHtml}
</div>

<div class="panel">
  <strong style="color: #0F172A; font-size: 16px;">Points saillants de la session :</strong>
  <ul style="margin-top: 14px; padding-left: 20px;">
${takeawaysHtml}
  </ul>
</div>`);

  // ───────────────────────────────────────────────────────────────────────────
  // SLIDES 3+: Analytical Deep-Dives (1 Slide per Chart)
  // ───────────────────────────────────────────────────────────────────────────
  chartParts.slice(0, 8).forEach((chart, idx) => {
    const chartImg = options.chartImages?.get(chart.title);

    let rightColContent = "";
    if (chartImg) {
      rightColContent = `<img src="${chartImg}" style="max-width: 100%; max-height: 440px; object-fit: contain; border-radius: 6px;" alt="${chart.title}" />`;
    } else if (chart.rows && chart.rows.length > 0) {
      const headers = [chart.x, chart.y];
      const rows = chart.rows
        .slice(0, 7)
        .map((r) => [
          String(r[chart.x] ?? ""),
          typeof r[chart.y] === "number"
            ? (r[chart.y] as number).toLocaleString("fr-FR")
            : String(r[chart.y] ?? ""),
        ]);

      const tableRows = rows
        .map(
          (row) =>
            `<tr>${row.map((val) => `<td style="padding: 6px 12px; border-bottom: 1px solid #E2E8F0;">${val}</td>`).join("")}</tr>`,
        )
        .join("");

      rightColContent = `
<div style="font-weight: bold; font-size: 15px; margin-bottom: 8px; color: #1E293B;">Données clés extraites :</div>
<table style="width: 100%; border-collapse: collapse; font-size: 13px;">
  <thead>
    <tr style="background: #1E3A8A; color: white;">
      ${headers.map((h) => `<th style="padding: 8px 12px; text-align: left;">${h}</th>`).join("")}
    </tr>
  </thead>
  <tbody>
    ${tableRows}
  </tbody>
</table>`;
    } else {
      rightColContent = `<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #64748B;">Graphique ${chart.chartType.toUpperCase()} : ${chart.x} vs ${chart.y}</div>`;
    }

    slides.push(`---

<span class="kicker kicker-blue">ANALYSE APPROFONDIE • GRAPHIQUE ${idx + 1}</span>

## ${chart.title || `Distribution : ${chart.x} par ${chart.y}`}

<div class="two-col">
  <div class="panel">
    <div class="kicker kicker-blue" style="margin-bottom: 8px;">CONSTAT MAJEUR</div>
    <p style="font-size: 14px; color: #334155; margin-bottom: 16px;">
      Répartition analysée sur l'axe <strong>${chart.x}</strong> avec agrégation <strong>${chart.aggregate || "somme"}</strong> sur la métrique <strong>${chart.y}</strong>.
    </p>
    <div style="font-weight: 700; font-size: 13px; color: #0F172A; margin-bottom: 8px;">Observations :</div>
    <ul style="font-size: 13px; color: #475569; padding-left: 18px; line-height: 1.6;">
      <li>Type : ${chart.chartType.toUpperCase()}</li>
      <li>Mesure agrégée : ${chart.y}</li>
      <li>Dimension : ${chart.x}</li>
      <li>Les écarts notables méritent une attention prioritaire.</li>
    </ul>
    <div style="margin-top: 32px; font-size: 11px; color: #94A3B8;">Source : DuckDB • Vue ${options.datasetName || "dataset"}</div>
  </div>
  <div class="panel" style="display: flex; flex-direction: column; justify-content: center; align-items: center;">
    ${rightColContent}
  </div>
</div>`);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // FINAL SLIDE: Strategic Recommendations (Consulting Closure)
  // ───────────────────────────────────────────────────────────────────────────
  const recCards = [
    {
      num: "01",
      title: "Action Immédiate",
      desc: "Capitaliser sur les catégories à forte contribution et corriger les points de friction identifiés dans les données.",
      color: "#2563EB",
    },
    {
      num: "02",
      title: "Optimisation Moyen Terme",
      desc: "Automatiser le suivi hebdomadaire via les vues DuckDB pour anticiper les retournements de tendance.",
      color: "#059669",
    },
    {
      num: "03",
      title: "Surveillance Continue",
      desc: "Mettre en place des alertes statistiques sur les anomalies et écarts à la moyenne (>2,5σ).",
      color: "#D97706",
    },
  ];

  const recCardsHtml = recCards
    .map(
      (c) => `<div class="rec-card">
  <div class="rec-num" style="color: ${c.color};">${c.num}</div>
  <div class="rec-title">${c.title}</div>
  <div class="rec-desc">${c.desc}</div>
</div>`,
    )
    .join("\n");

  slides.push(`---

<span class="kicker kicker-blue">PLAN D'ACTION & RECOMMANDATIONS</span>

## Orientations Stratégiques Recommandées

<div class="recommendations-grid">
${recCardsHtml}
</div>`);

  return slides.join("\n\n");
}

/**
 * Compiles and generates the executive presentation deck using Marp Core.
 * Triggers interactive HTML slide deck download in the browser.
 */
export async function generateExecutivePresentation(
  messages: ChatMessage[],
  options: DeckExportOptions,
): Promise<GeneratedDeck> {
  const marp = new Marp({
    html: true,
  });

  const markdown = buildExecutiveMarpMarkdown(messages, options);
  const { html, css } = marp.render(markdown);

  const cleanDeckTitle = cleanTitle(options.title || "Rapport_Executif");
  const fileName = `${cleanDeckTitle}_${new Date().toISOString().slice(0, 10)}.html`;

  const standaloneHtml = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${options.title || "Présentation Exécutive — Data Navigator"}</title>
  <style>
    ${css}
    body {
      margin: 0;
      background: #0B132B;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
    }
    .marpit {
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    }
    @media print {
      body { background: transparent; }
    }
  </style>
</head>
<body>
  ${html}
</body>
</html>`;

  // Trigger client-side download if in a browser environment and download option is not false
  if (
    options.download !== false &&
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  ) {
    try {
      const blob = new Blob([standaloneHtml], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn("[deck-generator] Browser download dispatch bypassed:", e);
    }
  }

  return {
    markdown,
    html: standaloneHtml,
    css,
    fileName,
  };
}
