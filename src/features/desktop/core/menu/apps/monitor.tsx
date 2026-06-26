"use client";

import {
  BellOff,
  CheckCheck,
  FileBarChart,
  PlusSquare,
  Sparkles,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import type { AppMenuBuilder } from "@/features/desktop/core/menu/types";

/**
 * App-specific menus for the "monitor" app (Surveillance Canaux).
 *
 * Fichier is tailored; an "Alertes" app menu drives the screen's alert/notification
 * actions through the command bus (handled by useAppCommands in
 * ChannelMonitorScreen); the page list (Channel Health / Alert Rules / …) is fed
 * to the universal Affichage menu via useRegisterPages.
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
        run: () => ctx.openApp("monitor", { forceNew: true }),
      },
      {
        id: "open-report",
        label: "Ouvrir le rapport télécom",
        icon: FileBarChart,
        run: () => ctx.openApp("telecom"),
      },
      { kind: "separator", id: "sep-file" },
      {
        id: "close",
        label: "Fermer",
        icon: X,
        shortcut: "⌘W",
        danger: true,
        run: () => ctx.closeWindow(),
      },
    ],
  },
  {
    id: "alerts",
    label: "Alertes",
    items: [
      {
        id: "mark-read",
        label: "Marquer les notifications comme lues",
        icon: CheckCheck,
        run: () => ctx.command("mark-read"),
      },
      {
        id: "clear-notifications",
        label: "Effacer les notifications",
        icon: BellOff,
        run: () => ctx.command("clear-notifications"),
      },
      { kind: "separator", id: "sep-alerts-1" },
      {
        id: "toggle-sound",
        label: "Activer / couper le son",
        icon: Volume2,
        run: () => ctx.command("toggle-sound"),
      },
      { kind: "separator", id: "sep-alerts-2" },
      {
        id: "clear-events",
        label: "Effacer l'historique des alertes",
        icon: Trash2,
        danger: true,
        run: () => ctx.command("clear-events"),
      },
    ],
  },
  {
    id: "help",
    label: "Aide",
    items: [
      {
        id: "explain-monitor",
        label: "Expliquer la surveillance des canaux",
        icon: Sparkles,
        run: () =>
          ctx.askMoudir(
            "Explique le fonctionnement de la surveillance des canaux : santé des canaux, règles d'alerte, conformité SLA et notifications.",
          ),
      },
    ],
  },
];
