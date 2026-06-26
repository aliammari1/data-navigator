"use client";

import {
  ArrowDownUp,
  BarChart3,
  Filter,
  FolderPlus,
  LayoutGrid,
  List,
  Sparkles,
  Table2,
  Upload,
  X,
} from "lucide-react";
import type { AppMenuBuilder } from "@/features/desktop/core/menu/types";

/**
 * App-specific menus for the "folders" app (titled "Catalogue").
 *
 * The screen is a File-Explorer-style data catalog. Menu items either reach the
 * screen's existing handlers through the command bus (new folder, import,
 * auto-organize, layout / sort / filter) or open sibling desktop apps directly.
 */
export const buildMenu: AppMenuBuilder = (ctx) => [
  {
    id: "file",
    label: "Fichier",
    items: [
      {
        id: "new-folder",
        label: "Nouveau dossier",
        icon: FolderPlus,
        shortcut: "⌘N",
        run: () => ctx.command("new-folder"),
      },
      {
        id: "import",
        label: "Importer un jeu de données…",
        icon: Upload,
        run: () => ctx.command("import"),
      },
      {
        id: "auto-organize",
        label: "Auto-classer avec l'IA",
        icon: Sparkles,
        run: () => ctx.command("auto-organize"),
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
    id: "catalogue",
    label: "Catalogue",
    items: [
      {
        id: "open-browser",
        label: "Explorateur de données",
        icon: Table2,
        run: () => ctx.openApp("data-browser"),
      },
      {
        id: "open-report",
        label: "Rapport télécom",
        icon: BarChart3,
        run: () => ctx.openApp("telecom"),
      },
      { kind: "separator", id: "sep-moudir" },
      {
        id: "ask-moudir",
        label: "Demander à Moudir",
        icon: Sparkles,
        run: () =>
          ctx.askMoudir("Aide-moi à organiser et explorer mon catalogue de jeux de données."),
      },
    ],
  },
  {
    id: "view",
    label: "Affichage",
    items: [
      {
        kind: "submenu",
        id: "layout",
        label: "Disposition",
        icon: LayoutGrid,
        items: [
          {
            id: "layout-grid",
            label: "Grille",
            icon: LayoutGrid,
            run: () => ctx.command("layout", { mode: "grid" }),
          },
          {
            id: "layout-list",
            label: "Liste",
            icon: List,
            run: () => ctx.command("layout", { mode: "list" }),
          },
        ],
      },
      {
        kind: "submenu",
        id: "sort",
        label: "Trier par",
        icon: ArrowDownUp,
        items: [
          { id: "sort-name", label: "Nom", run: () => ctx.command("sort", { key: "name" }) },
          { id: "sort-size", label: "Taille", run: () => ctx.command("sort", { key: "size" }) },
          {
            id: "sort-updated",
            label: "Modifié",
            run: () => ctx.command("sort", { key: "updated" }),
          },
          {
            id: "sort-quality",
            label: "Qualité",
            run: () => ctx.command("sort", { key: "quality" }),
          },
        ],
      },
      {
        kind: "submenu",
        id: "filter",
        label: "Filtrer",
        icon: Filter,
        items: [
          { id: "filter-all", label: "Tous", run: () => ctx.command("filter", { filter: "all" }) },
          { id: "filter-csv", label: "CSV", run: () => ctx.command("filter", { filter: "csv" }) },
          {
            id: "filter-parquet",
            label: "Parquet",
            run: () => ctx.command("filter", { filter: "parquet" }),
          },
          {
            id: "filter-unclassified",
            label: "Non classés",
            run: () => ctx.command("filter", { filter: "unclassified" }),
          },
          {
            id: "filter-low-quality",
            label: "Qualité faible",
            run: () => ctx.command("filter", { filter: "low-quality" }),
          },
          {
            id: "filter-recent",
            label: "Récents",
            run: () => ctx.command("filter", { filter: "recent" }),
          },
        ],
      },
    ],
  },
];
