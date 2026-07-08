"use client";

import {
  Brain,
  FlaskConical,
  LayoutDashboard,
  LifeBuoy,
  Radio,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Upload,
  X,
} from "lucide-react";
import type { AppMenuBuilder } from "@/features/desktop/core/menu/types";

/**
 * App-specific menus for the "home" app (Accueil — l'Édition du Jour).
 *
 * Fichier surfaces the screen's real header actions (Importer, Ouvrir le
 * rapport, Actualiser). "Tableau de bord" mirrors the "Reprendre" quick-action
 * cards so every workspace is one click away. "Actualiser" reaches the live
 * `analytics.refresh()` handler through the app-command bus (see the screen's
 * `useAppCommands("home", …)`).
 */
export const buildMenu: AppMenuBuilder = (ctx) => [
  {
    id: "file",
    label: "Fichier",
    items: [
      {
        id: "new-window",
        label: "Nouvelle fenêtre Accueil",
        icon: LayoutDashboard,
        run: () => ctx.openApp("home", { forceNew: true }),
      },
      { kind: "separator", id: "sep-open" },
      {
        id: "import",
        label: "Importer un fichier…",
        icon: Upload,
        run: () => ctx.openApp("upload"),
      },
      {
        id: "open-report",
        label: "Ouvrir le rapport",
        icon: Radio,
        run: () => ctx.openApp("telecom"),
      },
      { kind: "separator", id: "sep-refresh" },
      {
        id: "refresh",
        label: "Actualiser les indicateurs",
        icon: RefreshCw,
        shortcut: "⌘R",
        run: () => ctx.command("refresh"),
      },
      { kind: "separator", id: "sep-close" },
      {
        id: "close",
        label: "Fermer la fenêtre",
        icon: X,
        shortcut: "⌘W",
        danger: true,
        run: () => ctx.closeWindow(),
      },
    ],
  },
  {
    id: "dashboard",
    label: "Tableau de bord",
    items: [
      {
        id: "ws-moudir",
        label: "Studio IA",
        icon: FlaskConical,
        run: () => ctx.openApp("moudir"),
      },
      {
        id: "ws-telecom",
        label: "Rapport Télécom",
        icon: Radio,
        run: () => ctx.openApp("telecom"),
      },
      {
        id: "ws-forecast",
        label: "Prévisions",
        icon: TrendingUp,
        run: () => ctx.openApp("forecast"),
      },
      {
        id: "ws-analysis",
        label: "Analyse",
        icon: Brain,
        run: () => ctx.openApp("ai-analysis"),
      },
      { kind: "separator", id: "sep-moudir" },
      {
        id: "ask-moudir",
        label: "Demander à Moudir",
        icon: Sparkles,
        run: () =>
          ctx.askMoudir(
            "Résume le rapport du jour : transactions, taux de réussite, montant et anomalies.",
          ),
      },
    ],
  },
  {
    id: "help",
    label: "Aide",
    items: [
      {
        id: "guided-tour",
        label: "Visite guidée",
        icon: LifeBuoy,
        run: () => ctx.openApp("help"),
      },
    ],
  },
];
