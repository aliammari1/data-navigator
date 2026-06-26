"use client";

import { FileUp, HelpCircle, Lightbulb, Plus, RotateCcw, Sparkles, X } from "lucide-react";
import type { AppMenuBuilder } from "@/features/desktop/core/menu/types";

/**
 * Menu for the "Succès" app (gamification / achievements + onboarding tour).
 *
 * Real wiring:
 *  - "tour" / "reset" reach the screen via the app-command bus
 *    (UxInnovationsScreen subscribes with useAppCommands).
 *  - the rest use documented desktop contracts (openApp / askMoudir / window).
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
        run: () => ctx.openApp("ux-innovations", { forceNew: true }),
      },
      {
        id: "import-data",
        label: "Importer des données",
        icon: FileUp,
        run: () => ctx.openApp("upload"),
      },
      { kind: "separator", id: "sep-file" },
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
    id: "succes",
    label: "Succès",
    items: [
      {
        id: "tour",
        label: "Démarrer la visite guidée",
        icon: Sparkles,
        run: () => ctx.command("tour"),
      },
      {
        id: "tips",
        label: "Conseils pour gagner du XP",
        icon: Lightbulb,
        run: () =>
          ctx.askMoudir(
            "Comment gagner plus de XP et débloquer davantage de succès dans Data Navigator ?",
          ),
      },
      { kind: "separator", id: "sep-succes" },
      {
        id: "reset",
        label: "Réinitialiser la progression",
        icon: RotateCcw,
        danger: true,
        run: () => ctx.command("reset"),
      },
    ],
  },
  {
    id: "help",
    label: "Aide",
    items: [
      {
        id: "help-tour",
        label: "Démarrer la visite guidée",
        icon: HelpCircle,
        run: () => ctx.command("tour"),
      },
    ],
  },
];
