"use client";

import {
  Database,
  FolderOpen,
  HelpCircle,
  MousePointerClick,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import type { AppMenuBuilder } from "@/features/desktop/core/menu/types";

/**
 * App-specific menus for the "upload" (Importer) app.
 *
 * Fichier exposes the screen's real import flows (native file picker, folder
 * picker, session reset, catalogue refresh) over the command bus; the screen
 * wires these with `useAppCommands("upload", …)`. A "Données" menu routes to the
 * downstream desktop apps that consume an import. Universal Édition / Affichage /
 * Fenêtre / Aide menus are merged in by the registry.
 */
export const buildMenu: AppMenuBuilder = (ctx) => [
  {
    id: "file",
    label: "Fichier",
    items: [
      {
        id: "import-file",
        label: "Importer un fichier…",
        icon: MousePointerClick,
        run: () => ctx.command("import"),
      },
      {
        id: "import-folder",
        label: "Importer un dossier…",
        icon: FolderOpen,
        run: () => ctx.command("import-folder"),
      },
      { kind: "separator", id: "sep-1" },
      {
        id: "refresh-history",
        label: "Actualiser le catalogue",
        icon: RefreshCw,
        run: () => ctx.command("refresh-history"),
      },
      {
        id: "clear-session",
        label: "Effacer la session",
        icon: Trash2,
        danger: true,
        run: () => ctx.command("clear-session"),
      },
      { kind: "separator", id: "sep-2" },
      {
        id: "close",
        label: "Fermer",
        icon: X,
        run: () => ctx.closeWindow(),
      },
    ],
  },
  {
    id: "data",
    label: "Données",
    items: [
      {
        id: "open-telecom",
        label: "Ouvrir le rapport télécom",
        icon: Database,
        run: () => ctx.openApp("telecom"),
      },
    ],
  },
  {
    id: "help",
    label: "Aide",
    items: [
      {
        id: "import-help",
        label: "Aide à l'import de données",
        icon: HelpCircle,
        run: () =>
          ctx.askMoudir(
            "Comment importer un fichier de données (CSV, TSV, TXT, Parquet) dans Data Navigator ?",
          ),
      },
    ],
  },
];
