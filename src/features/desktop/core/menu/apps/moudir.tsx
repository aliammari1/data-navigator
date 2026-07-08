"use client";

import { HelpCircle, Lightbulb, RotateCcw, Sparkles, Square, Upload, X } from "lucide-react";
import type { AppMenuBuilder } from "@/features/desktop/core/menu/types";

/**
 * App-specific menus for the "moudir" app (Formulateur — Studio IA).
 *
 * The formulator derives visualisations from natural-language instructions, so
 * we ship a tailored Fichier plus a "Formulation" menu. Actions ride the
 * screen's app-command bus (`reset`, `cancel`, `ask`); the conversational
 * canned questions moved to the Moudir assistant (see `./moudir-chat`).
 */
export const buildMenu: AppMenuBuilder = (ctx) => [
  {
    id: "file",
    label: "Fichier",
    items: [
      {
        id: "new-formulation",
        label: "Nouvelle formulation",
        icon: RotateCcw,
        shortcut: "⌘N",
        run: () => ctx.command("reset"),
      },
      { kind: "separator", id: "file-sep-1" },
      {
        id: "import-data",
        label: "Importer des données…",
        icon: Upload,
        run: () => ctx.openApp("upload"),
      },
      { kind: "separator", id: "file-sep-2" },
      {
        id: "close",
        label: "Fermer la fenêtre",
        icon: X,
        shortcut: "⌘W",
        run: () => ctx.closeWindow(),
        danger: true,
      },
    ],
  },
  {
    id: "formulate",
    label: "Formulation",
    items: [
      {
        id: "cancel-derivation",
        label: "Annuler la dérivation",
        icon: Square,
        run: () => ctx.command("cancel"),
      },
      { kind: "separator", id: "formulate-sep-1" },
      {
        kind: "submenu",
        id: "quick-instructions",
        label: "Instructions rapides",
        icon: Lightbulb,
        items: [
          {
            id: "i-channels-time",
            label: "Transactions par canal au fil du temps",
            icon: Sparkles,
            run: () =>
              ctx.command("ask", {
                prompt: "Montre les transactions par canal au fil du temps",
              }),
          },
          {
            id: "i-success-daily",
            label: "Taux de réussite par jour",
            icon: Sparkles,
            run: () => ctx.command("ask", { prompt: "Calcule le taux de réussite par jour" }),
          },
          {
            id: "i-top-errors",
            label: "Top 10 des codes d'erreur",
            icon: Sparkles,
            run: () =>
              ctx.command("ask", {
                prompt: "Montre le top 10 des codes d'erreur par volume",
              }),
          },
        ],
      },
    ],
  },
  {
    id: "help",
    label: "Aide",
    items: [
      {
        id: "moudir-help",
        label: "Aide de Data Navigator",
        icon: HelpCircle,
        run: () => ctx.openApp("help"),
      },
    ],
  },
];
