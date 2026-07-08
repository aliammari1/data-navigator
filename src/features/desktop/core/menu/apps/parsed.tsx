"use client";

import {
  Brain,
  Compass,
  Download,
  Eraser,
  FilePlus2,
  FileText,
  Layers,
  Microscope,
  RefreshCw,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import type { AppMenuBuilder } from "@/features/desktop/core/menu/types";

/**
 * App-specific menus for the "parsed" app (Profil des données).
 *
 * The screen exposes its export / refresh / filter-reset handlers through the
 * app-command bus (`useAppCommands("parsed", …)`) and registers its four detail
 * tabs as pages, so the universal Affichage menu already lists them. Here we
 * tailor Fichier and add a "Profil" menu for profiling + downstream navigation.
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
        run: () => ctx.openApp("parsed", { forceNew: true }),
      },
      {
        id: "import",
        label: "Importer un fichier…",
        icon: Upload,
        run: () => ctx.openApp("upload"),
      },
      { kind: "separator", id: "sep-file-1" },
      {
        id: "export-csv",
        label: "Exporter le profil (CSV)",
        icon: Download,
        shortcut: "⌘E",
        run: () => ctx.command("export"),
      },
      {
        id: "open-browser",
        label: "Ouvrir dans l'Explorateur",
        icon: Compass,
        run: () => ctx.openApp("data-browser"),
      },
      { kind: "separator", id: "sep-file-2" },
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
    id: "profil",
    label: "Profil",
    items: [
      {
        id: "refresh",
        label: "Actualiser le profil",
        icon: RefreshCw,
        shortcut: "⌘R",
        run: () => ctx.command("refresh"),
      },
      {
        id: "export",
        label: "Exporter les colonnes (CSV)",
        icon: Download,
        run: () => ctx.command("export"),
      },
      {
        id: "clear-filters",
        label: "Effacer les filtres",
        icon: Eraser,
        run: () => ctx.command("clear-filters"),
      },
      { kind: "separator", id: "sep-profil-1" },
      {
        id: "ai-analysis",
        label: "Analyser avec l'IA",
        icon: Brain,
        run: () => ctx.openApp("ai-analysis"),
      },
      {
        id: "deep-analytics",
        label: "Analyses approfondies",
        icon: Microscope,
        run: () => ctx.openApp("deep-analytics"),
      },
      {
        id: "transform",
        label: "Transformer",
        icon: Layers,
        run: () => ctx.openApp("transform"),
      },
      {
        id: "report",
        label: "Créer un rapport",
        icon: FileText,
        run: () => ctx.openApp("report-studio"),
      },
      { kind: "separator", id: "sep-profil-2" },
      {
        id: "ask-moudir",
        label: "Demander à Moudir",
        icon: Sparkles,
        run: () =>
          ctx.askMoudir(
            "Analyse le profil des données : qualité des colonnes, valeurs nulles et anomalies à corriger.",
          ),
      },
    ],
  },
];
