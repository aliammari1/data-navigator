"use client";

import {
  CalendarRange,
  DollarSign,
  FileUp,
  Layers,
  Network,
  Plus,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import type { AppMenuBuilder } from "@/features/desktop/core/menu/types";

/**
 * App-specific menus for the "deep-analytics" app ("Analyses approfondies").
 *
 * The screen exposes four analysis tabs (cohortes, attribution, clustering,
 * comparaison de périodes) registered as pages, so tab switching is driven via
 * `ctx.setActivePage` (which the screen handles through the "navigate" command).
 * Universal Édition / Affichage / Fenêtre / Aide menus are merged by the registry.
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
        run: () => ctx.openApp("deep-analytics", { forceNew: true }),
      },
      { kind: "separator", id: "sep-import" },
      {
        id: "import-data",
        label: "Importer des données…",
        icon: FileUp,
        run: () => ctx.openApp("upload"),
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
    id: "analyse",
    label: "Analyse",
    items: [
      {
        id: "go-cohort",
        label: "Cohortes",
        icon: Layers,
        disabled: ctx.activePageId === "cohort",
        run: () => ctx.setActivePage("cohort"),
      },
      {
        id: "go-attribution",
        label: "Attribution des revenus",
        icon: DollarSign,
        disabled: ctx.activePageId === "attribution",
        run: () => ctx.setActivePage("attribution"),
      },
      {
        id: "go-clusters",
        label: "Clustering (k-means)",
        icon: Network,
        disabled: ctx.activePageId === "clusters",
        run: () => ctx.setActivePage("clusters"),
      },
      {
        id: "go-periods",
        label: "Comparaison de périodes",
        icon: CalendarRange,
        disabled: ctx.activePageId === "periods",
        run: () => ctx.setActivePage("periods"),
      },
      { kind: "separator", id: "sep-related" },
      {
        id: "open-forecast",
        label: "Ouvrir les prévisions",
        icon: TrendingUp,
        run: () => ctx.openApp("forecast"),
      },
      {
        id: "open-ai-analysis",
        label: "Ouvrir l'analyse IA",
        icon: Sparkles,
        run: () => ctx.openApp("ai-analysis"),
      },
      { kind: "separator", id: "sep-moudir" },
      {
        id: "ask-moudir",
        label: "Demander à Moudir d'interpréter",
        icon: Sparkles,
        run: () =>
          ctx.askMoudir(
            "Interprète les résultats des analyses approfondies (cohortes, attribution des revenus, clustering k-means et comparaison de périodes) du jeu de données courant.",
          ),
      },
    ],
  },
  {
    id: "help",
    label: "Aide",
    items: [
      {
        id: "explain-deep-analytics",
        label: "Comprendre ces analyses",
        icon: Sparkles,
        run: () =>
          ctx.askMoudir(
            "Explique en termes simples les analyses approfondies disponibles : analyse de cohortes, modèle d'attribution des revenus, clustering k-means et comparaison multi-périodes.",
          ),
      },
    ],
  },
];
