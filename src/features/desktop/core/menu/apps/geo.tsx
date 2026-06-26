"use client";

import {
  ArrowRightLeft,
  FileSpreadsheet,
  FileText,
  Grid3x3,
  Map as MapIcon,
  MessageCircle,
  Plus,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import type { AppMenuBuilder } from "@/features/desktop/core/menu/types";

/**
 * App-specific menus for the "geo" app (Géographie).
 *
 * Returns a tailored Fichier plus an "Analyse" menu. Navigation items use
 * `ctx.setActivePage`, which the screen mirrors via `useRegisterPages` +
 * a "navigate" command. Export and AI insights are delivered over the app
 * command bus to handlers the screen already owns.
 */
export const buildMenu: AppMenuBuilder = (ctx) => [
  {
    id: "file",
    label: "Fichier",
    items: [
      {
        id: "new-window",
        label: "Nouvelle fenêtre Géographie",
        icon: Plus,
        run: () => ctx.openApp("geo", { forceNew: true }),
      },
      {
        id: "import",
        label: "Importer un jeu de données…",
        icon: Upload,
        run: () => ctx.openApp("upload"),
      },
      { kind: "separator", id: "sep-export" },
      {
        id: "export-pdf",
        label: "Exporter en PDF",
        icon: FileText,
        run: () => ctx.command("export", { format: "pdf" }),
      },
      {
        id: "export-xlsx",
        label: "Exporter en Excel",
        icon: FileSpreadsheet,
        run: () => ctx.command("export", { format: "xlsx" }),
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
    id: "analyse",
    label: "Analyse",
    items: [
      {
        id: "view-map",
        label: "Carte des régions",
        icon: MapIcon,
        run: () => ctx.setActivePage("map"),
      },
      {
        id: "view-flows",
        label: "Flux par canal",
        icon: ArrowRightLeft,
        run: () => ctx.setActivePage("flows"),
      },
      {
        id: "view-distribution",
        label: "Distribution des canaux",
        icon: Grid3x3,
        run: () => ctx.setActivePage("distribution"),
      },
      { kind: "separator", id: "sep-ai" },
      {
        id: "generate-insights",
        label: "Générer les insights IA",
        icon: Sparkles,
        run: () => ctx.command("insights"),
      },
      {
        id: "ask-moudir",
        label: "Demander à Moudir",
        icon: MessageCircle,
        run: () =>
          ctx.askMoudir(
            "Analyse la répartition géographique des transactions : régions, flux par canal et taux de succès.",
          ),
      },
    ],
  },
];
