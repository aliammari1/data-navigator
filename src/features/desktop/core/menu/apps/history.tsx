"use client";

import {
  Activity,
  Database,
  Eraser,
  FileDown,
  FileJson,
  FileSpreadsheet,
  FileText,
  ListFilter,
  PlusSquare,
  Table2,
  X,
  Zap,
} from "lucide-react";
import type { AppMenuBuilder } from "@/features/desktop/core/menu/types";

/**
 * App-specific menus for the "history" app (Journal d'activité).
 *
 * The screen exposes three real behaviours through the app-command bus:
 * `export` (csv/json/xlsx), `filter` (source selector) and `search` (query box).
 * The menu drives those plus desktop-level window actions.
 */
export const buildMenu: AppMenuBuilder = (ctx) => [
  {
    id: "file",
    label: "Fichier",
    items: [
      {
        id: "new-window",
        label: "Nouvelle fenêtre",
        icon: PlusSquare,
        run: () => ctx.openApp("history", { forceNew: true }),
      },
      { kind: "separator", id: "sep-export" },
      {
        kind: "submenu",
        id: "export",
        label: "Exporter le journal",
        icon: FileDown,
        items: [
          {
            id: "export-csv",
            label: "Exporter en CSV",
            icon: FileText,
            run: () => ctx.command("export", { format: "csv" }),
          },
          {
            id: "export-json",
            label: "Exporter en JSON",
            icon: FileJson,
            run: () => ctx.command("export", { format: "json" }),
          },
          {
            id: "export-xlsx",
            label: "Exporter en XLSX",
            icon: FileSpreadsheet,
            run: () => ctx.command("export", { format: "xlsx" }),
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
    id: "journal",
    label: "Journal",
    items: [
      { kind: "label", id: "filter-label", label: "Filtrer par source" },
      {
        id: "filter-all",
        label: "Toutes les sources",
        icon: ListFilter,
        run: () => ctx.command("filter", { source: "all" }),
      },
      {
        id: "filter-activity",
        label: "Activité",
        icon: Activity,
        run: () => ctx.command("filter", { source: "activity" }),
      },
      {
        id: "filter-dataset",
        label: "Datasets",
        icon: Database,
        run: () => ctx.command("filter", { source: "dataset" }),
      },
      {
        id: "filter-transform",
        label: "Transformations",
        icon: Zap,
        run: () => ctx.command("filter", { source: "transform" }),
      },
      {
        id: "filter-query",
        label: "Requêtes",
        icon: Table2,
        run: () => ctx.command("filter", { source: "query" }),
      },
      { kind: "separator", id: "sep-search" },
      {
        id: "clear-search",
        label: "Effacer la recherche",
        icon: Eraser,
        run: () => ctx.command("search", { query: "" }),
      },
    ],
  },
];
