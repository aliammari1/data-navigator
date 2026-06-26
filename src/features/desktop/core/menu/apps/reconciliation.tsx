"use client";

import {
  Database,
  FolderInput,
  GitCompareArrows,
  History,
  Sparkles,
  Workflow,
  X,
} from "lucide-react";
import type { AppMenuBuilder } from "@/features/desktop/core/menu/types";

/**
 * App-specific menus for the "reconciliation" app (Réconciliation).
 *
 * The reconciliation wizard owns its own step state internally, so the menu
 * stays at the desktop level: it opens related data apps, surfaces the run
 * history, and routes an investigation prompt to Moudir. Every item performs a
 * real ctx action — no decorative entries.
 */
export const buildMenu: AppMenuBuilder = (ctx) => [
  {
    id: "file",
    label: "Fichier",
    items: [
      {
        id: "new-window",
        label: "Nouveau rapprochement",
        icon: GitCompareArrows,
        run: () => ctx.openApp("reconciliation", { forceNew: true }),
      },
      { kind: "separator", id: "sep-sources" },
      {
        id: "import",
        label: "Importer des données…",
        icon: FolderInput,
        run: () => ctx.openApp("upload"),
      },
      {
        id: "browse",
        label: "Parcourir les jeux de données",
        icon: Database,
        run: () => ctx.openApp("data-browser"),
      },
      { kind: "separator", id: "sep-close" },
      {
        id: "close",
        label: "Fermer",
        icon: X,
        shortcut: "⌘W",
        run: () => ctx.closeWindow(),
      },
    ],
  },
  {
    id: "reconciliation",
    label: "Rapprochement",
    items: [
      {
        id: "history",
        label: "Historique des rapprochements",
        icon: History,
        run: () => ctx.openApp("history"),
      },
      {
        id: "lineage",
        label: "Lignage des données",
        icon: Workflow,
        run: () => ctx.openApp("lineage"),
      },
      { kind: "separator", id: "sep-ai" },
      {
        id: "ask-moudir",
        label: "Analyser les écarts avec Moudir",
        icon: Sparkles,
        run: () =>
          ctx.askMoudir(
            "Aide-moi à interpréter les écarts matériels d'un rapprochement entre deux jeux de données et propose des hypothèses sur leurs causes.",
          ),
      },
    ],
  },
];
