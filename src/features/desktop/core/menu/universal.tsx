"use client";

/**
 * Universal menu groups shared by every app.
 *
 * An app's own builder only describes what is special about it (its Fichier
 * verbs, a Données menu, …). Edit, the appearance half of View, Window and Help
 * are identical everywhere, so they are built here from the {@link MenuContext}
 * and merged in by the registry. The empty desktop (no focused window) gets a
 * compact "Bureau" set so the bar is never dead.
 */

import {
  Brush,
  Camera,
  Copy,
  HelpCircle,
  Image as ImageIcon,
  Layers,
  Maximize2,
  Minus,
  Monitor,
  MonitorOff,
  Moon,
  Palette,
  Pin,
  Scissors,
  Settings,
  Sparkles,
  Sun,
  Upload,
  X,
} from "lucide-react";
import type { MenuContext, MenuGroup, MenuItem } from "@/features/desktop/core/menu/types";
import {
  GLASS_PALETTES,
  type GlassPaletteId,
  WALLPAPERS,
  type WallpaperId,
} from "@/features/desktop/store/desktop-store";

/** Run a clipboard/selection verb on the focused element (best-effort). */
function exec(command: string): void {
  if (typeof document === "undefined") return;
  try {
    document.execCommand(command);
  } catch {
    // Some contexts forbid execCommand (e.g. paste without focus) — ignore.
  }
}

const sep = (id: string): MenuItem => ({ kind: "separator", id });

// ─── Leading "app" menu (bold, macOS-style) ──────────────────────────────────

export function appLeadingGroup(ctx: MenuContext): MenuGroup {
  const hasWindow = ctx.windowId != null;
  return {
    id: "app",
    label: ctx.title,
    emphasized: true,
    items: [
      {
        id: "preferences",
        label: "Préférences…",
        icon: Settings,
        shortcut: "⌘,",
        run: () => ctx.openApp("settings"),
      },
      {
        id: "about-help",
        label: `Aide de ${ctx.title}`,
        icon: HelpCircle,
        run: () => ctx.openApp("help"),
      },
      sep("app-sep-1"),
      {
        id: "hide",
        label: "Masquer",
        icon: Minus,
        shortcut: "⌘H",
        run: ctx.minimizeWindow,
        disabled: !hasWindow,
      },
      sep("app-sep-2"),
      {
        id: "quit-classic",
        label: "Quitter le mode bureau",
        icon: MonitorOff,
        run: ctx.exitDesktop,
      },
      {
        id: "close",
        label: "Fermer la fenêtre",
        icon: X,
        shortcut: "⌘W",
        run: ctx.closeWindow,
        disabled: !hasWindow,
        danger: true,
      },
    ],
  };
}

// ─── Fichier (universal fallback) ────────────────────────────────────────────

export function universalFileGroup(ctx: MenuContext): MenuGroup {
  const items: MenuItem[] = [];
  if (ctx.appId) {
    items.push({
      id: "new-window",
      label: "Nouvelle fenêtre",
      shortcut: "⌘N",
      run: () => ctx.openApp(ctx.appId as string, { forceNew: true }),
    });
  }
  items.push(
    {
      id: "import",
      label: "Importer des données…",
      icon: Upload,
      run: () => ctx.openApp("upload"),
    },
    {
      id: "export-report",
      label: "Exporter le rapport…",
      run: () => ctx.openApp("report-studio", { props: { intent: "export" } }),
    },
    sep("file-sep"),
    {
      id: "close",
      label: "Fermer",
      shortcut: "⌘W",
      run: ctx.closeWindow,
      disabled: ctx.windowId == null,
      danger: true,
    },
  );
  return { id: "file", label: "Fichier", items };
}

// ─── Édition (universal) ─────────────────────────────────────────────────────

export function editGroup(_ctx: MenuContext): MenuGroup {
  return {
    id: "edit",
    label: "Édition",
    items: [
      { id: "undo", label: "Annuler", shortcut: "⌘Z", run: () => exec("undo") },
      { id: "redo", label: "Rétablir", shortcut: "⇧⌘Z", run: () => exec("redo") },
      sep("edit-sep-1"),
      { id: "cut", label: "Couper", icon: Scissors, shortcut: "⌘X", run: () => exec("cut") },
      { id: "copy", label: "Copier", icon: Copy, shortcut: "⌘C", run: () => exec("copy") },
      { id: "paste", label: "Coller", shortcut: "⌘V", run: () => exec("paste") },
      sep("edit-sep-2"),
      {
        id: "select-all",
        label: "Tout sélectionner",
        shortcut: "⌘A",
        run: () => exec("selectAll"),
      },
    ],
  };
}

// ─── Affichage (universal appearance + page list) ────────────────────────────

const THEME_OPTIONS = [
  { value: "light", label: "Clair", icon: Sun },
  { value: "dark", label: "Sombre", icon: Moon },
  { value: "system", label: "Système", icon: Monitor },
];

export function viewGroup(ctx: MenuContext): MenuGroup {
  const items: MenuItem[] = [];

  // Page-aware section — the "menu changes per page" behaviour.
  if (ctx.pages.length > 0) {
    items.push(
      { kind: "label", id: "pages-label", label: "Pages" },
      {
        kind: "radio",
        id: "pages",
        value: ctx.activePageId ?? ctx.pages[0]?.id ?? "",
        options: ctx.pages.map((p) => ({ value: p.id, label: p.label, icon: p.icon })),
        onSelect: (value) => ctx.setActivePage(value),
      },
      sep("view-sep-pages"),
    );
  }

  items.push(
    {
      kind: "submenu",
      id: "theme",
      label: "Thème",
      icon: Brush,
      items: [
        {
          kind: "radio",
          id: "theme-radio",
          value: ctx.theme ?? "system",
          options: THEME_OPTIONS,
          onSelect: (value) => ctx.setTheme(value as "light" | "dark" | "system"),
        },
      ],
    },
    {
      kind: "submenu",
      id: "wallpaper",
      label: "Fond d'écran",
      icon: ImageIcon,
      items: [
        {
          kind: "radio",
          id: "wallpaper-radio",
          value: ctx.wallpaper,
          options: WALLPAPERS.map((w) => ({ value: w.id, label: w.label })),
          onSelect: (value) => ctx.setWallpaper(value as WallpaperId),
        },
      ],
    },
    {
      kind: "submenu",
      id: "palette",
      label: "Palette",
      icon: Palette,
      items: [
        {
          kind: "radio",
          id: "palette-radio",
          value: ctx.glassPalette,
          options: GLASS_PALETTES.map((p) => ({ value: p.id, label: p.label })),
          onSelect: (value) => ctx.setGlassPalette(value as GlassPaletteId),
        },
      ],
    },
  );

  return { id: "view", label: "Affichage", items };
}

// ─── Fenêtre (universal) ─────────────────────────────────────────────────────

export function windowGroup(ctx: MenuContext): MenuGroup {
  const hasWindow = ctx.windowId != null;
  return {
    id: "window",
    label: "Fenêtre",
    items: [
      {
        id: "minimize",
        label: "Réduire",
        icon: Minus,
        shortcut: "⌘M",
        run: ctx.minimizeWindow,
        disabled: !hasWindow,
      },
      {
        id: "zoom",
        label: ctx.isMaximized ? "Restaurer" : "Agrandir",
        icon: Maximize2,
        run: ctx.toggleMaximize,
        disabled: !hasWindow,
      },
      {
        kind: "checkbox",
        id: "pin-on-top",
        label: "Garder au premier plan",
        icon: Pin,
        checked: ctx.isPinnedOnTop,
        onToggle: () => ctx.togglePinOnTop(),
        disabled: !hasWindow,
      },
      {
        id: "snapshot",
        label: "Capturer la fenêtre",
        icon: Camera,
        run: ctx.snapshot,
        disabled: !hasWindow,
      },
      sep("window-sep-1"),
      { id: "arrange", label: "Ranger les fenêtres", icon: Layers, run: ctx.cascadeArrange },
      { id: "close-all", label: "Tout fermer", run: ctx.closeAll, danger: true },
    ],
  };
}

// ─── Aide (universal) ────────────────────────────────────────────────────────

export function helpGroup(ctx: MenuContext): MenuGroup {
  return {
    id: "help",
    label: "Aide",
    items: [
      { id: "open-help", label: "Centre d'aide", icon: HelpCircle, run: () => ctx.openApp("help") },
      {
        id: "ask-moudir",
        label: "Demander à Moudir sur cette vue",
        icon: Sparkles,
        run: () =>
          ctx.askMoudir(
            `J'utilise « ${ctx.title} ». Explique ce que cet écran permet de faire et donne-moi trois actions utiles.`,
          ),
      },
    ],
  };
}

// ─── Empty desktop ("Bureau") ────────────────────────────────────────────────

export function desktopMenuGroups(ctx: MenuContext): MenuGroup[] {
  return [
    {
      id: "app",
      label: "Bureau",
      emphasized: true,
      items: [
        {
          id: "apps",
          label: "Applications…",
          icon: Layers,
          run: () => ctx.openApp("home"),
        },
        {
          id: "preferences",
          label: "Préférences…",
          icon: Settings,
          run: () => ctx.openApp("settings"),
        },
        sep("desktop-sep"),
        {
          id: "quit-classic",
          label: "Quitter le mode bureau",
          icon: MonitorOff,
          run: ctx.exitDesktop,
        },
      ],
    },
    universalFileGroup(ctx),
    viewGroup(ctx),
    windowGroup(ctx),
    helpGroup(ctx),
  ];
}
