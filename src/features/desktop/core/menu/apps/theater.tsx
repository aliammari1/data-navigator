"use client";

import {
  Clapperboard,
  Compass,
  FileDown,
  FileText,
  FileUp,
  Plus,
  Presentation,
  Save,
  Sparkles,
  X,
} from "lucide-react";
import type { AppMenuBuilder, MenuItem } from "@/features/desktop/core/menu/types";

/**
 * App-specific menus for the "theater" app (Théâtre Analytique).
 *
 * The screen (AnalyticsTheaterScreen) owns the behaviour via `useAppCommands`:
 *   - narrate  → handleNarrate (génération IA locale)
 *   - save     → handleSave (sauvegarde hors ligne)
 *   - export   → handleExport({ kind: "pptx" | "pdf" })
 *   - mode     → setMode({ mode: "explore" | "present" })
 *   - navigate → setActiveScene (also reached via ctx.setActivePage)
 * Scenes are registered as pages (`useRegisterPages`) so ctx.pages reflects them.
 */
export const buildMenu: AppMenuBuilder = (ctx) => {
  const sceneItems: MenuItem[] = ctx.pages.map((page) => ({
    id: `scene-${page.id}`,
    label: page.label,
    icon: page.icon,
    run: () => ctx.setActivePage(page.id),
  }));

  return [
    {
      id: "file",
      label: "Fichier",
      items: [
        {
          id: "new-window",
          label: "Nouvelle fenêtre",
          icon: Plus,
          run: () => ctx.openApp("theater", { forceNew: true }),
        },
        {
          id: "import",
          label: "Importer un jeu de données…",
          icon: FileUp,
          run: () => ctx.openApp("upload"),
        },
        { kind: "separator", id: "sep-save" },
        {
          id: "save",
          label: "Enregistrer le théâtre",
          icon: Save,
          shortcut: "⌘S",
          run: () => ctx.command("save"),
        },
        { kind: "separator", id: "sep-export" },
        {
          kind: "submenu",
          id: "export",
          label: "Exporter…",
          icon: FileDown,
          items: [
            {
              id: "export-pptx",
              label: "Présentation PPTX",
              icon: Presentation,
              run: () => ctx.command("export", { kind: "pptx" }),
            },
            {
              id: "export-pdf",
              label: "Document PDF",
              icon: FileText,
              run: () => ctx.command("export", { kind: "pdf" }),
            },
          ],
        },
        { kind: "separator", id: "sep-close" },
        {
          id: "close",
          label: "Fermer",
          icon: X,
          shortcut: "⌘W",
          run: () => ctx.closeWindow(),
          danger: true,
        },
      ],
    },
    {
      id: "theater",
      label: "Théâtre",
      items: [
        {
          id: "narrate",
          label: "Narrer avec l'IA locale",
          icon: Sparkles,
          run: () => ctx.command("narrate"),
        },
        { kind: "separator", id: "sep-mode" },
        {
          id: "mode-explore",
          label: "Mode Exploration",
          icon: Compass,
          run: () => ctx.command("mode", { mode: "explore" }),
        },
        {
          id: "mode-present",
          label: "Mode Présentation",
          icon: Clapperboard,
          run: () => ctx.command("mode", { mode: "present" }),
        },
        ...(sceneItems.length > 0
          ? ([
              { kind: "separator", id: "sep-scenes" },
              {
                kind: "submenu",
                id: "scenes",
                label: "Aller à la scène",
                icon: Presentation,
                items: sceneItems,
              },
            ] satisfies MenuItem[])
          : []),
      ],
    },
  ];
};
