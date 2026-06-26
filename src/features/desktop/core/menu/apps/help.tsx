"use client";

import {
  BookOpen,
  Eraser,
  FilePlus2,
  HelpCircle,
  Keyboard,
  MessageCircleQuestion,
  Printer,
  Settings2,
  X,
} from "lucide-react";
import type { AppMenuBuilder } from "@/features/desktop/core/menu/types";

/**
 * App-specific menus for the "help" app (Aide).
 *
 * HelpScreen registers its three sections (Fonctionnalités / FAQ / Raccourcis)
 * as pages, so the universal Affichage menu already lists them. Here we tailor
 * Fichier, add a "Consultation" menu that drives those sections via
 * `ctx.setActivePage` (which dispatches "navigate" to the screen), and surface a
 * couple of real desktop contracts (impression, recherche, Moudir).
 */
export const buildMenu: AppMenuBuilder = (ctx) => [
  {
    id: "file",
    label: "Fichier",
    items: [
      {
        id: "new-window",
        label: "Nouvelle fenêtre",
        icon: FilePlus2,
        run: () => ctx.openApp("help", { forceNew: true }),
      },
      { kind: "separator", id: "sep-print" },
      {
        id: "print",
        label: "Imprimer…",
        icon: Printer,
        shortcut: "⌘P",
        run: () => {
          if (typeof window !== "undefined") window.print();
        },
      },
      { kind: "separator", id: "sep-close" },
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
    id: "consultation",
    label: "Consultation",
    items: [
      {
        id: "go-features",
        label: "Fonctionnalités",
        icon: BookOpen,
        run: () => ctx.setActivePage("features"),
      },
      {
        id: "go-faq",
        label: "FAQ",
        icon: HelpCircle,
        run: () => ctx.setActivePage("faq"),
      },
      {
        id: "go-shortcuts",
        label: "Raccourcis clavier",
        icon: Keyboard,
        run: () => ctx.setActivePage("shortcuts"),
      },
      { kind: "separator", id: "sep-search" },
      {
        id: "clear-search",
        label: "Effacer la recherche",
        icon: Eraser,
        run: () => ctx.command("clear-search"),
      },
    ],
  },
  {
    id: "help",
    label: "Aide",
    items: [
      {
        id: "ask-moudir",
        label: "Poser une question à Moudir",
        icon: MessageCircleQuestion,
        run: () => ctx.askMoudir("J'ai besoin d'aide pour utiliser Data Navigator."),
      },
      {
        id: "open-settings",
        label: "Ouvrir les paramètres",
        icon: Settings2,
        run: () => ctx.openApp("settings"),
      },
    ],
  },
];
