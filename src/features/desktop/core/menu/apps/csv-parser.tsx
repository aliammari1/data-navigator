"use client";

import {
  BarChart3,
  Clipboard,
  Database,
  FileDown,
  FilePlus2,
  Filter,
  FolderOpen,
  Play,
  Settings2,
  Sheet,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import type { AppMenuBuilder } from "@/features/desktop/core/menu/types";

/**
 * App-specific menus for the "csv-parser" app (Analyseur CSV).
 *
 * Behaviour lives in CsvParserScreen, reached over the app-command bus
 * (`useAppCommands("csv-parser", …)`). Menu items either send a command the
 * screen handles or call a real desktop contract (openApp / closeWindow).
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
        run: () => ctx.openApp("csv-parser", { forceNew: true }),
      },
      {
        id: "import",
        label: "Importer un fichier…",
        icon: FolderOpen,
        run: () => ctx.command("import"),
      },
      { kind: "separator", id: "sep-export" },
      {
        id: "export-csv",
        label: "Exporter en CSV",
        icon: FileDown,
        run: () => ctx.command("export-csv"),
      },
      {
        id: "export-xlsx",
        label: "Exporter en XLSX",
        icon: Sheet,
        run: () => ctx.command("export-xlsx"),
      },
      {
        id: "load-db",
        label: "Enregistrer comme dataset DuckDB",
        icon: Database,
        run: () => ctx.command("load-db"),
      },
      { kind: "separator", id: "sep-close" },
      {
        id: "close",
        label: "Fermer",
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
        id: "parse",
        label: "Analyser",
        icon: Play,
        run: () => ctx.command("parse"),
      },
      {
        id: "paste",
        label: "Coller depuis le presse-papiers",
        icon: Clipboard,
        run: () => ctx.command("paste"),
      },
      { kind: "separator", id: "sep-clear" },
      {
        id: "clear",
        label: "Tout effacer",
        icon: Trash2,
        danger: true,
        run: () => ctx.command("clear"),
      },
    ],
  },
  {
    id: "view",
    label: "Affichage",
    items: [
      {
        id: "toggle-columns",
        label: "Panneau Colonnes",
        icon: Settings2,
        run: () => ctx.command("toggle-columns"),
      },
      {
        id: "toggle-filter",
        label: "Panneau Filtre",
        icon: Filter,
        run: () => ctx.command("toggle-filter"),
      },
      {
        id: "toggle-profile",
        label: "Panneau Profil",
        icon: BarChart3,
        run: () => ctx.command("toggle-profile"),
      },
      {
        id: "toggle-rejects",
        label: "Panneau Rejets",
        icon: ShieldAlert,
        run: () => ctx.command("toggle-rejects"),
      },
    ],
  },
];
