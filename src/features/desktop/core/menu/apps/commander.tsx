"use client";

import {
  BarChart3,
  LayoutDashboard,
  LayoutGrid,
  LineChart,
  MapPin,
  Mic,
  PanelTopClose,
  Plus,
  Sparkles,
  Square,
  SquarePlus,
  Table2,
  VolumeX,
  X,
} from "lucide-react";
import type { AppMenuBuilder } from "@/features/desktop/core/menu/types";

/**
 * App-specific menus for the "commander" app (Commandant IA).
 *
 * The Commander is a single conversational surface that drives the desktop with
 * one structured action per turn. The menu mirrors that: a tailored Fichier
 * (new conversation / new window / close) and a "Piloter" menu that lifts the
 * screen's real controls (voice, mute, stop) plus the desktop actions the agent
 * itself performs (open an app, arrange, close all). Conversation controls go
 * through ctx.command and are handled by the screen's useAppCommands.
 */
export const buildMenu: AppMenuBuilder = (ctx) => [
  {
    id: "file",
    label: "Fichier",
    items: [
      {
        id: "new-chat",
        label: "Nouvelle conversation",
        icon: Plus,
        run: () => ctx.command("reset"),
      },
      {
        id: "new-window",
        label: "Nouvelle fenêtre",
        icon: SquarePlus,
        run: () => ctx.openApp("commander", { forceNew: true }),
      },
      { kind: "separator", id: "sep-file" },
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
    id: "piloter",
    label: "Piloter",
    items: [
      {
        id: "voice",
        label: "Dictée vocale",
        icon: Mic,
        run: () => ctx.command("toggleVoice"),
      },
      {
        id: "mute",
        label: "Couper la voix",
        icon: VolumeX,
        run: () => ctx.command("stopVoice"),
      },
      {
        id: "stop",
        label: "Arrêter la réflexion",
        icon: Square,
        run: () => ctx.command("cancel"),
      },
      { kind: "separator", id: "sep-piloter" },
      {
        kind: "submenu",
        id: "open-app",
        label: "Ouvrir une app",
        icon: LayoutDashboard,
        items: [
          {
            id: "open-telecom",
            label: "Rapport télécom",
            icon: BarChart3,
            run: () => ctx.openApp("telecom"),
          },
          {
            id: "open-forecast",
            label: "Prévisions",
            icon: LineChart,
            run: () => ctx.openApp("forecast"),
          },
          {
            id: "open-geo",
            label: "Carte géographique",
            icon: MapPin,
            run: () => ctx.openApp("geo"),
          },
          {
            id: "open-data-browser",
            label: "Données",
            icon: Table2,
            run: () => ctx.openApp("data-browser"),
          },
          {
            id: "open-moudir",
            label: "Moudir (analyse IA)",
            icon: Sparkles,
            run: () => ctx.openApp("moudir"),
          },
        ],
      },
      {
        id: "ask-moudir",
        label: "Confier l'analyse à Moudir",
        icon: Sparkles,
        run: () => ctx.askMoudir("Analyse les transactions et signale les anomalies du jour."),
      },
      { kind: "separator", id: "sep-windows" },
      {
        id: "arrange",
        label: "Ranger les fenêtres",
        icon: LayoutGrid,
        run: () => ctx.cascadeArrange(),
      },
      {
        id: "close-all",
        label: "Tout fermer",
        icon: PanelTopClose,
        danger: true,
        run: () => ctx.closeAll(),
      },
    ],
  },
];
