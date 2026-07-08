"use client";

import {
  HelpCircle,
  Radio,
  RefreshCw,
  Settings,
  Sparkles,
  SquarePlus,
  Upload,
  X,
} from "lucide-react";
import type { AppMenuBuilder } from "@/features/desktop/core/menu/types";

/**
 * App-specific menus for the "diagnostics" app ("Système").
 *
 * The screen is a live offline-first runtime status surface (DuckDB engine,
 * local AI model, LAN, durable storage). The menu offers a tailored Fichier,
 * a "Système" menu that jumps to the related runtime apps, and an Aide entry.
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
        run: () => ctx.openApp("diagnostics", { forceNew: true }),
      },
      { kind: "separator", id: "sep-refresh" },
      {
        id: "refresh",
        label: "Actualiser l'état",
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
    id: "diagnostics",
    label: "Système",
    items: [
      {
        id: "open-settings",
        label: "Ouvrir les paramètres",
        icon: Settings,
        run: () => ctx.openApp("settings"),
      },
      {
        id: "open-collaboration",
        label: "Collaboration LAN",
        icon: Radio,
        run: () => ctx.openApp("collaboration"),
      },
      {
        id: "open-upload",
        label: "Téléverser des données",
        icon: Upload,
        run: () => ctx.openApp("upload"),
      },
      { kind: "separator", id: "sep-moudir" },
      {
        id: "ask-moudir",
        label: "Diagnostiquer avec Moudir",
        icon: Sparkles,
        run: () =>
          ctx.askMoudir(
            "Analyse l'état du runtime hors-ligne (moteur DuckDB, modèle IA local, collaboration LAN, stockage durable) et signale les anomalies.",
          ),
      },
    ],
  },
  {
    id: "help",
    label: "Aide",
    items: [
      {
        id: "open-help",
        label: "Centre d'aide",
        icon: HelpCircle,
        run: () => ctx.openApp("help"),
      },
    ],
  },
];
