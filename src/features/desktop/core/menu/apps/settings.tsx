"use client";

import {
  Bell,
  Brain,
  Building2,
  Database,
  HardDrive,
  HelpCircle,
  Info,
  Keyboard,
  Palette,
  RotateCcw,
  SquarePlus,
  User,
  X,
  Zap,
} from "lucide-react";
import type { AppMenuBuilder } from "@/features/desktop/core/menu/types";

/**
 * App-specific menus for the "settings" app ("Paramètres").
 *
 * The screen is a tabbed preferences shell (Apparence, Données, Performances,
 * Compte, Notifications, Stockage, Raccourcis, À propos). The menu offers a
 * tailored Fichier, a "Sections" menu that jumps straight to each tab via the
 * page bus (`setActivePage` → the screen's "navigate" handler), and an Aide
 * entry. The tab list also shows up in the universal Affichage menu because the
 * screen registers its pages.
 */
export const buildMenu: AppMenuBuilder = (ctx) => [
  {
    id: "file",
    label: "Fichier",
    items: [
      {
        id: "new-window",
        label: "Nouvelle fenêtre",
        icon: SquarePlus,
        run: () => ctx.openApp("settings", { forceNew: true }),
      },
      { kind: "separator", id: "sep-reset" },
      {
        id: "reset",
        label: "Réinitialiser les réglages",
        icon: RotateCcw,
        danger: true,
        run: () => ctx.command("reset"),
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
    id: "settings",
    label: "Sections",
    items: [
      {
        id: "go-appearance",
        label: "Apparence",
        icon: Palette,
        run: () => ctx.setActivePage("appearance"),
      },
      {
        id: "go-data",
        label: "Données",
        icon: Database,
        run: () => ctx.setActivePage("data"),
      },
      {
        id: "go-performance",
        label: "Performances",
        icon: Zap,
        run: () => ctx.setActivePage("performance"),
      },
      {
        id: "go-ai",
        label: "IA",
        icon: Brain,
        run: () => ctx.setActivePage("ai"),
      },
      {
        id: "go-account",
        label: "Compte",
        icon: User,
        run: () => ctx.setActivePage("account"),
      },
      {
        id: "go-notifications",
        label: "Notifications",
        icon: Bell,
        run: () => ctx.setActivePage("notifications"),
      },
      {
        id: "go-storage",
        label: "Stockage",
        icon: HardDrive,
        run: () => ctx.setActivePage("storage"),
      },
      {
        id: "go-branding",
        label: "Image de marque",
        icon: Building2,
        run: () => ctx.setActivePage("branding"),
      },
      {
        id: "go-shortcuts",
        label: "Raccourcis",
        icon: Keyboard,
        run: () => ctx.setActivePage("shortcuts"),
      },
      {
        id: "go-about",
        label: "À propos",
        icon: Info,
        run: () => ctx.setActivePage("about"),
      },
    ],
  },
  {
    id: "help",
    label: "Aide",
    items: [
      {
        id: "open-help",
        label: "Centre d'aide",
        icon: HelpCircle,
        run: () => ctx.openApp("help"),
      },
    ],
  },
];
