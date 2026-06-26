"use client";

import { Eye, Flame, Power, ScanEye, Target, X } from "lucide-react";
import type { AppMenuBuilder } from "@/features/desktop/core/menu/types";

/**
 * App-specific menus for the "eye-tracking" app ("Suivi du regard").
 *
 * The screen (EyeTrackingScreen) owns the tracker lifecycle and overlay toggles.
 * Menu items reach those existing handlers through the app-command bus
 * (`ctx.command(...)`), wired in the screen via `useAppCommands("eye-tracking", …)`.
 */
export const buildMenu: AppMenuBuilder = (ctx) => [
  {
    id: "file",
    label: "Fichier",
    items: [
      {
        id: "new-window",
        label: "Nouvelle fenêtre",
        icon: ScanEye,
        run: () => ctx.openApp("eye-tracking", { forceNew: true }),
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
    id: "tracking",
    label: "Suivi",
    items: [
      {
        id: "toggle-tracking",
        label: "Démarrer / Arrêter le suivi",
        icon: Power,
        run: () => ctx.command("toggle-tracking"),
      },
      {
        id: "calibrate",
        label: "Calibrer",
        icon: Target,
        run: () => ctx.command("calibrate"),
      },
      { kind: "separator", id: "sep-overlays" },
      {
        id: "toggle-gaze-dot",
        label: "Point de regard",
        icon: Eye,
        run: () => ctx.command("toggle-gaze-dot"),
      },
      {
        id: "toggle-heatmap",
        label: "Carte de chaleur",
        icon: Flame,
        run: () => ctx.command("toggle-heatmap"),
      },
    ],
  },
];
