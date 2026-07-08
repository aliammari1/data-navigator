"use client";

import { FolderOpen, PlusSquare, RotateCcw, Trash2, X } from "lucide-react";
import type { AppMenuBuilder } from "@/features/desktop/core/menu/types";

/**
 * App-specific menus for the "recycle-bin" app (Corbeille).
 *
 * The screen lists soft-deleted folders/datasets with Restore + Empty actions.
 * Menu commands are delivered to the screen via ctx.command and handled by its
 * useAppCommands("recycle-bin", ...) wiring (restore-all / empty).
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
        run: () => ctx.openApp("recycle-bin", { forceNew: true }),
      },
      { kind: "separator", id: "sep-file" },
      {
        id: "empty",
        label: "Vider la corbeille",
        icon: Trash2,
        danger: true,
        run: () => ctx.command("empty"),
      },
      { kind: "separator", id: "sep-close" },
      {
        id: "close",
        label: "Fermer",
        icon: X,
        shortcut: "⌘W",
        run: () => ctx.closeWindow(),
      },
    ],
  },
  {
    id: "bin",
    label: "Corbeille",
    items: [
      {
        id: "restore-all",
        label: "Tout restaurer",
        icon: RotateCcw,
        run: () => ctx.command("restore-all"),
      },
      {
        id: "empty-bin",
        label: "Vider la corbeille",
        icon: Trash2,
        danger: true,
        run: () => ctx.command("empty"),
      },
      { kind: "separator", id: "sep-bin" },
      {
        id: "open-folders",
        label: "Ouvrir les dossiers",
        icon: FolderOpen,
        run: () => ctx.openApp("folders"),
      },
    ],
  },
];
