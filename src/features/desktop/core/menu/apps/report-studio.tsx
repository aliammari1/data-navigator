"use client";

import {
  Download,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  FileType,
  Presentation,
  Sparkles,
  X,
} from "lucide-react";
import type { AppMenuBuilder } from "@/features/desktop/core/menu/types";

/**
 * App-specific menus for the "report-studio" app (Studio de Rapports).
 *
 * The screen exports offline PowerPoint / Word / PDF / Excel reports, an AI
 * executive narrative, and a full-screen presentation mode. Menu items reach
 * those existing handlers through the app-command bus (ctx.command); the screen
 * subscribes with useAppCommands("report-studio", …). Page navigation is handled
 * by the universal Affichage menu via useRegisterPages.
 */
export const buildMenu: AppMenuBuilder = (ctx) => [
  {
    id: "file",
    label: "Fichier",
    items: [
      {
        id: "new-window",
        label: "Nouvelle fenêtre",
        icon: FilePlus2,
        shortcut: "⌘N",
        run: () => ctx.openApp("report-studio", { forceNew: true }),
      },
      { kind: "separator", id: "sep-export" },
      {
        kind: "submenu",
        id: "export",
        label: "Exporter",
        icon: Download,
        items: [
          {
            id: "export-pptx",
            label: "PowerPoint (.pptx)",
            icon: Presentation,
            run: () => ctx.command("export-pptx"),
          },
          {
            id: "export-docx",
            label: "Word (.docx)",
            icon: FileText,
            run: () => ctx.command("export-docx"),
          },
          {
            id: "export-pdf",
            label: "PDF",
            icon: FileType,
            run: () => ctx.command("export-pdf"),
          },
          {
            id: "export-xlsx",
            label: "Excel (.xlsx)",
            icon: FileSpreadsheet,
            run: () => ctx.command("export-xlsx"),
          },
        ],
      },
      { kind: "separator", id: "sep-close" },
      {
        id: "close",
        label: "Fermer",
        icon: X,
        shortcut: "⌘W",
        danger: true,
        run: () => ctx.closeWindow(),
      },
    ],
  },
  {
    id: "report",
    label: "Rapport",
    items: [
      {
        id: "generate-narrative",
        label: "Générer le récit IA",
        icon: Sparkles,
        run: () => ctx.command("generate-narrative"),
      },
      {
        id: "present",
        label: "Mode présentation",
        icon: Presentation,
        run: () => ctx.command("present"),
      },
      { kind: "separator", id: "sep-moudir" },
      {
        id: "ask-moudir",
        label: "Analyser ce rapport avec Moudir",
        run: () =>
          ctx.askMoudir("Analyse le rapport quotidien des transactions et résume les points clés."),
      },
    ],
  },
];
