"use client";

import {
  Code2,
  FileText,
  GitBranch,
  PlusSquare,
  RotateCcw,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import type { AppMenuBuilder } from "@/features/desktop/core/menu/types";

/**
 * App-specific menus for the "agent-canvas" app.
 *
 * Agent Canvas is a 4-panel IDE (Canvas / SQL IDE / Agent Graph / Narrative)
 * that builds a dashboard from a data table. The screen exposes a session reset
 * and three panel toggles; both are wired through ctx.command -> useAppCommands.
 */
export const buildMenu: AppMenuBuilder = (ctx) => [
  {
    id: "file",
    label: "Fichier",
    items: [
      {
        id: "new-window",
        label: "Nouveau canvas",
        icon: PlusSquare,
        run: () => ctx.openApp("agent-canvas", { forceNew: true }),
      },
      {
        id: "reset",
        label: "Réinitialiser la session",
        icon: RotateCcw,
        run: () => ctx.command("reset"),
      },
      { kind: "separator", id: "sep-file" },
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
    id: "view",
    label: "Affichage",
    items: [
      {
        id: "toggle-sql",
        label: "Panneau SQL",
        icon: Code2,
        run: () => ctx.command("togglePanel", { panel: "sql" }),
      },
      {
        id: "toggle-graph",
        label: "Graphe d'agent",
        icon: GitBranch,
        run: () => ctx.command("togglePanel", { panel: "graph" }),
      },
      {
        id: "toggle-narrative",
        label: "Narration",
        icon: FileText,
        run: () => ctx.command("togglePanel", { panel: "narrative" }),
      },
    ],
  },
  {
    id: "agent",
    label: "Agent",
    items: [
      {
        id: "ask-moudir",
        label: "Demander à Moudir",
        icon: Sparkles,
        run: () =>
          ctx.askMoudir(
            "Analyse le tableau de bord généré par l'agent canvas et résume les tendances clés.",
          ),
      },
      {
        id: "open-analysis",
        label: "Analyse IA",
        icon: Wand2,
        run: () => ctx.openApp("ai-analysis"),
      },
    ],
  },
];
