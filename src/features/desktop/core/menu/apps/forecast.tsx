"use client";

import type { LucideIcon } from "lucide-react";
import {
  AreaChart,
  BarChart3,
  Brain,
  GitBranch,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  SquarePlus,
  TrendingUp,
  Waves,
  X,
} from "lucide-react";
import type { AppMenuBuilder } from "@/features/desktop/core/menu/types";

/**
 * App-specific menus for the "forecast" app (Prévisions).
 *
 * The screen is a six-tab shell (TomorrowForecast / Intelligence / Simulator /
 * Pattern / Risk / Scenarios). It registers those tabs as pages, so the
 * universal Affichage menu already lists them; here we add a tailored Fichier,
 * a domain "Analyse" menu (tab navigation + cross-app jumps + Moudir), all wired
 * to real ctx contracts.
 */

const TAB_ITEMS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "forecast", label: "Prévision de demain", icon: TrendingUp },
  { id: "intelligence", label: "Intelligence prévisionnelle", icon: Brain },
  { id: "simulator", label: "Simulateur de revenus", icon: AreaChart },
  { id: "patterns", label: "Détecteur de tendances", icon: Waves },
  { id: "risk", label: "Évaluation des risques", icon: ShieldAlert },
  { id: "scenarios", label: "Scénarios", icon: GitBranch },
];

export const buildMenu: AppMenuBuilder = (ctx) => [
  {
    id: "file",
    label: "Fichier",
    items: [
      {
        id: "new-window",
        label: "Nouvelle fenêtre",
        icon: SquarePlus,
        run: () => ctx.openApp("forecast", { forceNew: true }),
      },
      {
        id: "refresh",
        label: "Actualiser les prévisions",
        icon: RefreshCw,
        run: () => ctx.command("refresh"),
      },
      { kind: "separator", id: "sep-1" },
      {
        id: "close",
        label: "Fermer",
        icon: X,
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
        kind: "submenu",
        id: "go-to",
        label: "Aller à",
        icon: BarChart3,
        items: TAB_ITEMS.map((tab) => ({
          id: `go-${tab.id}`,
          label: tab.label,
          icon: tab.icon,
          run: () => ctx.setActivePage(tab.id),
        })),
      },
      { kind: "separator", id: "sep-jump" },
      {
        id: "open-deep-analytics",
        label: "Analyse approfondie",
        icon: BarChart3,
        run: () => ctx.openApp("deep-analytics"),
      },
      {
        id: "open-monitor",
        label: "Supervision en direct",
        icon: TrendingUp,
        run: () => ctx.openApp("monitor"),
      },
      { kind: "separator", id: "sep-moudir" },
      {
        id: "ask-moudir",
        label: "Interroger Moudir sur les prévisions",
        icon: Sparkles,
        run: () =>
          ctx.askMoudir(
            "Analyse les prévisions de transactions et de revenus pour demain et signale les risques principaux.",
          ),
      },
    ],
  },
];
