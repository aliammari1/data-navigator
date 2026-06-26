"use client";

import {
  Database,
  FileText,
  HelpCircle,
  Lightbulb,
  ListTree,
  RotateCcw,
  Sparkles,
  Square,
  Upload,
  X,
} from "lucide-react";
import type { AppMenuBuilder } from "@/features/desktop/core/menu/types";

/**
 * App-specific menus for the "moudir" app (Studio IA — Moudir).
 *
 * Moudir is a single-surface agentic data workspace (no internal pages), so we
 * ship a tailored Fichier plus an "Analyse" menu. Actions are wired to the
 * screen's real handlers over the app-command bus (`reset`, `cancel`) and to the
 * `moudir:ask` channel via `ctx.askMoudir` for the canned questions.
 */
export const buildMenu: AppMenuBuilder = (ctx) => [
  {
    id: "file",
    label: "Fichier",
    items: [
      {
        id: "new-conversation",
        label: "Nouvelle conversation",
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
      {
        id: "browse-data",
        label: "Explorer les jeux de données",
        icon: Database,
        run: () => ctx.openApp("data-browser"),
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
    id: "analyze",
    label: "Analyse",
    items: [
      {
        id: "stop-analysis",
        label: "Arrêter l'analyse",
        icon: Square,
        run: () => ctx.command("cancel"),
      },
      { kind: "separator", id: "analyze-sep-1" },
      {
        kind: "submenu",
        id: "quick-questions",
        label: "Questions rapides",
        icon: Lightbulb,
        items: [
          {
            id: "q-success-rate",
            label: "Pourquoi le taux de réussite a-t-il changé ?",
            icon: Sparkles,
            run: () => ctx.askMoudir("Pourquoi le taux de réussite a-t-il changé ?"),
          },
          {
            id: "q-risks",
            label: "Quels sont les plus gros risques ?",
            icon: Sparkles,
            run: () => ctx.askMoudir("Quels sont les plus gros risques dans ces données ?"),
          },
          {
            id: "q-channels-time",
            label: "Transactions par canal au fil du temps",
            icon: Sparkles,
            run: () => ctx.askMoudir("Montre les transactions par canal au fil du temps"),
          },
        ],
      },
      {
        id: "exec-summary",
        label: "Synthèse exécutive",
        icon: FileText,
        run: () => ctx.askMoudir("Donne-moi une synthèse exécutive en un paragraphe"),
      },
      { kind: "separator", id: "analyze-sep-2" },
      {
        id: "open-deep-analytics",
        label: "Ouvrir l'analyse approfondie",
        icon: ListTree,
        run: () => ctx.openApp("deep-analytics"),
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
