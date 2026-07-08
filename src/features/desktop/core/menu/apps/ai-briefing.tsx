"use client";

import {
  AlertTriangle,
  BookOpen,
  Flag,
  Flame,
  Mic,
  RefreshCw,
  Sparkles,
  SquarePlus,
  X,
} from "lucide-react";
import type { AppMenuBuilder } from "@/features/desktop/core/menu/types";

const PAGES = [
  { id: "briefing", label: "Briefing quotidien", icon: Mic },
  { id: "anomaly", label: "Rapport d'anomalies", icon: AlertTriangle },
  { id: "action", label: "Plan d'action", icon: Flag },
  { id: "story", label: "Récit des données", icon: BookOpen },
] as const;

export const buildMenu: AppMenuBuilder = (ctx) => [
  {
    id: "file",
    label: "Fichier",
    items: [
      {
        id: "new-window",
        label: "Nouvelle fenêtre",
        icon: SquarePlus,
        run: () => ctx.openApp("ai-briefing", { forceNew: true }),
      },
      {
        id: "refresh",
        label: "Actualiser les données",
        icon: RefreshCw,
        shortcut: "Cmd+R",
        run: () => ctx.command("refresh"),
      },
      { kind: "separator", id: "sep-file" },
      {
        id: "close",
        label: "Fermer",
        icon: X,
        shortcut: "Cmd+W",
        run: () => ctx.closeWindow(),
      },
    ],
  },
  {
    id: "briefing",
    label: "Briefing",
    items: [
      ...PAGES.map((page) => ({
        id: `goto-${page.id}`,
        label: page.label,
        icon: page.icon,
        run: () => ctx.setActivePage(page.id),
        disabled: ctx.activePageId === page.id,
      })),
      { kind: "separator", id: "sep-briefing" },
      {
        id: "warm-model",
        label: "Réchauffer le modèle",
        icon: Flame,
        run: () => ctx.command("warm"),
      },
      {
        id: "ask-moudir",
        label: "Demander à Moudir",
        icon: Sparkles,
        run: () =>
          ctx.askMoudir("Génère un briefing intelligent à partir des données télécom du jour."),
      },
    ],
  },
];
