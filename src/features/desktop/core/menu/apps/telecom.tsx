"use client";

import {
  Database,
  FileDown,
  FileInput,
  MessageCircleQuestion,
  PlusSquare,
  RefreshCw,
  X,
} from "lucide-react";
import type { AppMenuBuilder } from "@/features/desktop/core/menu/types";

/**
 * App-specific menus for the "telecom" app (Rapport Télécom).
 *
 * The screen's tabs (Vue d'ensemble, Canaux, Analyse, Données brutes, Studio
 * période, Analyse du jour, Historique, Configuration) are registered by the
 * screen via `useRegisterPages`, so they appear automatically in the universal
 * Affichage menu — no need to duplicate them here. We add a tailored Fichier and
 * a "Rapport" menu for data/AI actions that map to the screen's real handlers.
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
        run: () => ctx.openApp("telecom", { forceNew: true }),
      },
      {
        id: "import",
        label: "Importer un rapport…",
        icon: FileInput,
        run: () => ctx.openApp("upload"),
      },
      {
        id: "export-db",
        label: "Exporter la base de données",
        icon: FileDown,
        run: () => ctx.command("export"),
      },
      { kind: "separator", id: "file-sep" },
      {
        id: "close",
        label: "Fermer la fenêtre",
        icon: X,
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
        id: "refresh-history",
        label: "Actualiser l'historique",
        icon: RefreshCw,
        run: () => ctx.command("refresh-history"),
      },
      {
        id: "export-db-2",
        label: "Exporter la base de données",
        icon: Database,
        run: () => ctx.command("export"),
      },
      { kind: "separator", id: "report-sep-1" },
      {
        id: "ask-moudir",
        label: "Demander à Moudir",
        icon: MessageCircleQuestion,
        run: () => ctx.askMoudir("Résume les indicateurs clés du rapport télécom actuel."),
      },
    ],
  },
];
