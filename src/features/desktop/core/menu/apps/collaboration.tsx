"use client";

import {
  Activity,
  CheckCircle2,
  ClipboardList,
  FileText,
  GitBranch,
  MessageSquare,
  Plus,
  Share2,
  Sparkles,
  StickyNote,
  Users,
  X,
  Zap,
} from "lucide-react";
import type { AppMenuBuilder } from "@/features/desktop/core/menu/types";

/**
 * App-specific menus for the "collaboration" app.
 *
 * The screen owns seven sections (Overview / Comments / Changes / Live /
 * Annotations / Approval / Audit) via internal tab state. The "Atelier" menu
 * sends a `navigate` command per section (a no-op fall-through until the screen
 * subscribes); the rest wire straight to real desktop contracts (openApp,
 * askMoudir, window controls).
 */
export const buildMenu: AppMenuBuilder = (ctx) => [
  {
    id: "file",
    label: "Fichier",
    items: [
      {
        id: "new-window",
        label: "Nouvel espace de collaboration",
        icon: Plus,
        run: () => ctx.openApp("collaboration", { forceNew: true }),
      },
      { kind: "separator", id: "sep-open" },
      {
        id: "open-report",
        label: "Ouvrir le rapport",
        icon: FileText,
        run: () => ctx.openApp("report-studio"),
      },
      {
        id: "invite",
        label: "Inviter un collaborateur…",
        icon: Share2,
        run: () => ctx.command("invite"),
      },
      { kind: "separator", id: "sep-close" },
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
    id: "workshop",
    label: "Atelier",
    items: [
      {
        id: "go-overview",
        label: "Vue d'ensemble",
        icon: Activity,
        run: () => ctx.command("navigate", { pageId: "overview" }),
      },
      {
        id: "go-comments",
        label: "Commentaires",
        icon: MessageSquare,
        run: () => ctx.command("navigate", { pageId: "comments" }),
      },
      {
        id: "go-changes",
        label: "Modifications",
        icon: GitBranch,
        run: () => ctx.command("navigate", { pageId: "changes" }),
      },
      {
        id: "go-live",
        label: "Discussion en direct",
        icon: Zap,
        run: () => ctx.command("navigate", { pageId: "live" }),
      },
      { kind: "separator", id: "sep-review" },
      {
        id: "go-annotations",
        label: "Annotations du rapport",
        icon: StickyNote,
        run: () => ctx.command("navigate", { pageId: "annotations" }),
      },
      {
        id: "go-approval",
        label: "Validation",
        icon: CheckCircle2,
        run: () => ctx.command("navigate", { pageId: "approval" }),
      },
      {
        id: "go-audit",
        label: "Journal d'audit",
        icon: ClipboardList,
        run: () => ctx.command("navigate", { pageId: "audit" }),
      },
    ],
  },
  {
    id: "help",
    label: "Aide",
    items: [
      {
        id: "help-team",
        label: "Voir les membres connectés",
        icon: Users,
        run: () => ctx.command("navigate", { pageId: "overview" }),
      },
      {
        id: "ask-moudir",
        label: "Demander à Moudir un résumé de la revue",
        icon: Sparkles,
        run: () =>
          ctx.askMoudir(
            "Résume l'état de la collaboration sur le rapport : commentaires ouverts, modifications en attente et statut de validation.",
          ),
      },
    ],
  },
];
