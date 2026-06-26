"use client";

import {
  BarChart2,
  Code2,
  Columns3,
  Download,
  FileJson,
  FileSpreadsheet,
  FileText,
  Filter,
  Gauge,
  Grid3X3,
  Hash,
  Maximize2,
  RefreshCw,
  Rows3,
  Sparkles,
  SplitSquareHorizontal,
  SquarePlus,
  Table2,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import type { AppMenuBuilder } from "@/features/desktop/core/menu/types";

/**
 * App-specific menus for the "data-browser" app ("Explorateur").
 *
 * The screen (DataBrowserScreen) subscribes over the app-command bus + page
 * registry (see the screen wiring):
 *   - command "import"          → opens the inline upload panel
 *   - command "export" { kind } → CSV / XLSX / JSON export of the filtered set
 *   - command "refresh"         → re-runs the count + page query
 *   - command "toggle-filters"  → opens/closes the filter panel
 *   - command "toggle-columns"  → opens/closes the column manager
 *   - command "run-sql"         → switches to SQL view + runs the editor query
 *   - command "toggle-*"        → row numbers / compact / zebra / heatmap / fullscreen
 *   - command "navigate" / setActivePage → switch the table/cards/charts/sql view
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
        run: () => ctx.openApp("data-browser", { forceNew: true }),
      },
      { kind: "separator", id: "sep-import" },
      {
        id: "import-inline",
        label: "Importer un fichier…",
        icon: Upload,
        run: () => ctx.command("import"),
      },
      {
        id: "open-upload",
        label: "Écran d'import…",
        icon: Upload,
        run: () => ctx.openApp("upload"),
      },
      {
        kind: "submenu",
        id: "export",
        label: "Exporter",
        icon: Download,
        items: [
          {
            id: "export-csv",
            label: "CSV (.csv)",
            icon: FileText,
            run: () => ctx.command("export", { kind: "csv" }),
          },
          {
            id: "export-xlsx",
            label: "Excel (.xlsx)",
            icon: FileSpreadsheet,
            run: () => ctx.command("export", { kind: "xlsx" }),
          },
          {
            id: "export-json",
            label: "JSON (.json)",
            icon: FileJson,
            run: () => ctx.command("export", { kind: "json" }),
          },
        ],
      },
      { kind: "separator", id: "sep-refresh" },
      {
        id: "refresh",
        label: "Actualiser les données",
        icon: RefreshCw,
        shortcut: "⌘R",
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
    id: "data",
    label: "Données",
    items: [
      {
        id: "view-table",
        label: "Vue Tableau",
        icon: Table2,
        run: () => ctx.setActivePage("table"),
      },
      {
        id: "view-cards",
        label: "Vue Cartes",
        icon: Grid3X3,
        run: () => ctx.setActivePage("cards"),
      },
      {
        id: "view-analytics",
        label: "Vue Graphiques",
        icon: BarChart2,
        run: () => ctx.setActivePage("analytics"),
      },
      {
        id: "view-sql",
        label: "Éditeur SQL",
        icon: Code2,
        run: () => ctx.setActivePage("sql"),
      },
      { kind: "separator", id: "sep-tools" },
      {
        id: "toggle-filters",
        label: "Filtres…",
        icon: Filter,
        run: () => ctx.command("toggle-filters"),
      },
      {
        id: "toggle-columns",
        label: "Gérer les colonnes…",
        icon: Columns3,
        run: () => ctx.command("toggle-columns"),
      },
      {
        id: "run-sql",
        label: "Exécuter la requête SQL",
        icon: Code2,
        run: () => ctx.command("run-sql"),
      },
      { kind: "separator", id: "sep-related" },
      {
        id: "open-transform",
        label: "Transformer les données",
        icon: Wand2,
        run: () => ctx.openApp("transform"),
      },
      {
        id: "open-lineage",
        label: "Lignage des données",
        icon: SplitSquareHorizontal,
        run: () => ctx.openApp("lineage"),
      },
      {
        id: "ask-moudir",
        label: "Demander à Moudir",
        icon: Sparkles,
        run: () =>
          ctx.askMoudir(
            "Analyse le jeu de données actuellement ouvert dans l'Explorateur et décris ses colonnes et ses tendances notables.",
          ),
      },
    ],
  },
  {
    id: "view",
    label: "Affichage",
    items: [
      {
        id: "toggle-row-numbers",
        label: "Numéros de ligne",
        icon: Hash,
        run: () => ctx.command("toggle-row-numbers"),
      },
      {
        id: "toggle-compact",
        label: "Mode compact",
        icon: Rows3,
        run: () => ctx.command("toggle-compact"),
      },
      {
        id: "toggle-zebra",
        label: "Rayures zébrées",
        icon: Rows3,
        run: () => ctx.command("toggle-zebra"),
      },
      {
        id: "toggle-heatmap",
        label: "Carte de chaleur",
        icon: Gauge,
        run: () => ctx.command("toggle-heatmap"),
      },
      {
        id: "toggle-fullscreen",
        label: "Plein écran",
        icon: Maximize2,
        run: () => ctx.command("toggle-fullscreen"),
      },
      { kind: "separator", id: "sep-view" },
    ],
  },
];
