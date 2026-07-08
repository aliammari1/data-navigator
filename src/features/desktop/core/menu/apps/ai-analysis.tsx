"use client";

import {
  Download,
  FileSpreadsheet,
  FileText,
  Play,
  Sparkles,
  SquarePlus,
  TrendingUp,
  Upload,
  X,
} from "lucide-react";
import type { AppMenuBuilder } from "@/features/desktop/core/menu/types";

/**
 * App-specific menus for the "ai-analysis" app ("Analyse statistique").
 *
 * The screen (AiAnalysisScreen) exposes its run/export behaviour and its six
 * tabs over the app-command bus + page registry (see the screen wiring):
 *   - command "run"     → runAnalysis()
 *   - command "export"  → handleExport({ kind: "xlsx" | "pdf" })
 *   - command "navigate"/setActivePage → switch the active tab
 */
export const buildMenu: AppMenuBuilder = (ctx) => [
  {
    id: "file",
    label: "Fichier",
    items: [
      {
        id: "new-window",
        label: "Nouvelle fenêtre",
        icon: SquarePlus,
        run: () => ctx.openApp("ai-analysis", { forceNew: true }),
      },
      { kind: "separator", id: "sep-import" },
      {
        id: "import-data",
        label: "Importer des données…",
        icon: Upload,
        run: () => ctx.openApp("upload"),
      },
      {
        kind: "submenu",
        id: "export",
        label: "Exporter le rapport",
        icon: Download,
        items: [
          {
            id: "export-xlsx",
            label: "Rapport Excel (XLSX)",
            icon: FileSpreadsheet,
            run: () => ctx.command("export", { kind: "xlsx" }),
          },
          {
            id: "export-pdf",
            label: "Rapport narratif (PDF)",
            icon: FileText,
            run: () => ctx.command("export", { kind: "pdf" }),
          },
        ],
      },
      { kind: "separator", id: "sep-close" },
      {
        id: "close",
        label: "Fermer",
        icon: X,
        danger: true,
        run: () => ctx.closeWindow(),
      },
    ],
  },
  {
    id: "analyze",
    label: "Analyse",
    items: [
      {
        id: "run-analysis",
        label: "Lancer l'analyse",
        icon: Play,
        run: () => ctx.command("run"),
      },
      { kind: "separator", id: "sep-export" },
      {
        id: "export-xlsx-quick",
        label: "Exporter en Excel (XLSX)",
        icon: FileSpreadsheet,
        run: () => ctx.command("export", { kind: "xlsx" }),
      },
      {
        id: "export-pdf-quick",
        label: "Exporter en PDF",
        icon: FileText,
        run: () => ctx.command("export", { kind: "pdf" }),
      },
      { kind: "separator", id: "sep-related" },
      {
        id: "open-forecast",
        label: "Prévisions détaillées",
        icon: TrendingUp,
        run: () => ctx.openApp("forecast"),
      },
      {
        id: "ask-moudir",
        label: "Demander à Moudir",
        icon: Sparkles,
        run: () =>
          ctx.askMoudir(
            "Résume les insights statistiques, anomalies et corrélations du jeu de données actif.",
          ),
      },
    ],
  },
];
