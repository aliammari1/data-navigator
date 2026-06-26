"use client";

import {
  AlertTriangle,
  FileUp,
  GitBranch,
  Network,
  Plus,
  RefreshCw,
  Sparkles,
  Table2,
  X,
} from "lucide-react";
import type { AppMenuBuilder } from "@/features/desktop/core/menu/types";

/**
 * App-specific menus for the "lineage" app ("Lignage").
 *
 * The screen exposes four views (Graphe, Tableau, Impact, Colonnes) registered
 * as pages, so view switching is driven via `ctx.setActivePage` (handled by the
 * screen's "navigate" command). "Actualiser" reruns the lineage build through the
 * "refresh" command. Universal Édition / Affichage / Fenêtre / Aide menus are
 * merged in by the registry.
 */
export const buildMenu: AppMenuBuilder = (ctx) => [
  {
    id: "file",
    label: "Fichier",
    items: [
      {
        id: "new-window",
        label: "Nouvelle fenêtre",
        icon: Plus,
        run: () => ctx.openApp("lineage", { forceNew: true }),
      },
      { kind: "separator", id: "sep-import" },
      {
        id: "import-data",
        label: "Importer des données…",
        icon: FileUp,
        run: () => ctx.openApp("upload"),
      },
      { kind: "separator", id: "sep-refresh" },
      {
        id: "refresh",
        label: "Actualiser le lignage",
        icon: RefreshCw,
        run: () => ctx.command("refresh"),
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
    id: "lineage",
    label: "Lignage",
    items: [
      {
        id: "go-graph",
        label: "Graphe",
        icon: Network,
        disabled: ctx.activePageId === "graph",
        run: () => ctx.setActivePage("graph"),
      },
      {
        id: "go-table",
        label: "Tableau",
        icon: Table2,
        disabled: ctx.activePageId === "table",
        run: () => ctx.setActivePage("table"),
      },
      {
        id: "go-impact",
        label: "Analyse d'impact",
        icon: AlertTriangle,
        disabled: ctx.activePageId === "impact",
        run: () => ctx.setActivePage("impact"),
      },
      {
        id: "go-columns",
        label: "Lignage des colonnes",
        icon: GitBranch,
        disabled: ctx.activePageId === "columns",
        run: () => ctx.setActivePage("columns"),
      },
      { kind: "separator", id: "sep-related" },
      {
        id: "open-transform",
        label: "Ouvrir les transformations",
        icon: GitBranch,
        run: () => ctx.openApp("transform"),
      },
      {
        id: "open-reconciliation",
        label: "Ouvrir la réconciliation",
        icon: Table2,
        run: () => ctx.openApp("reconciliation"),
      },
    ],
  },
  {
    id: "help",
    label: "Aide",
    items: [
      {
        id: "explain-lineage",
        label: "Comprendre le lignage",
        icon: Sparkles,
        run: () =>
          ctx.askMoudir(
            "Explique en termes simples le lignage de données : comment lire le graphe des sources, transformations et sorties, l'analyse d'impact et le lignage au niveau des colonnes.",
          ),
      },
    ],
  },
];
