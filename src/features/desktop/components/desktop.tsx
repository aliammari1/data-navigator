"use client";

import { AlertTriangle, LineChart, PanelRight, Sparkles, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { DashboardUser } from "@/features/dashboard-shell/nav/nav-config";
import {
  type ContextMenuState,
  DesktopContextMenu,
} from "@/features/desktop/components/desktop-context-menu";
import { DesktopIcons } from "@/features/desktop/components/desktop-icons";
import { Dock } from "@/features/desktop/components/dock";
import { HudLayer } from "@/features/desktop/components/hud";
import { Inspector } from "@/features/desktop/components/inspector";
import { Launcher } from "@/features/desktop/components/launcher";
import { MenuBar } from "@/features/desktop/components/menubar";
import { QuickLook } from "@/features/desktop/components/quick-look";
import { SelectToAsk } from "@/features/desktop/components/select-to-ask";
import { SnapshotsLayer } from "@/features/desktop/components/snapshots-layer";
import { Spotlight } from "@/features/desktop/components/spotlight";
import { WidgetsLayer } from "@/features/desktop/components/widgets/widgets-layer";
import { WindowFrame } from "@/features/desktop/components/window-frame";
import { DESKTOP_DND_MIME, type DesktopDragPayload, readDrag } from "@/features/desktop/core/dnd";
import { useViewportReflow } from "@/features/desktop/core/use-viewport-reflow";
import {
  useDesktopActions,
  useDesktopWindows,
  useGlassPalette,
  useWallpaper,
} from "@/features/desktop/store/desktop-store";

/*
 * The desktop root holds transient UI state (the right-click context menu, the
 * 15s clock tick, the inspector toggle, smart-drop). Memoizing the heavy canvas
 * children keeps any of those from re-rendering every open window + widget —
 * which is what made the context menu feel laggy "between each click" on
 * mid-range hardware. As a bonus, dragging one window no longer re-renders the
 * others (each WindowFrame only re-renders when its own `win` object changes).
 */
const WindowFrameMemo = memo(WindowFrame);
const WidgetsLayerMemo = memo(WidgetsLayer);
const SnapshotsLayerMemo = memo(SnapshotsLayer);
const DesktopIconsMemo = memo(DesktopIcons);

/** Forward a question to the Moudir AI swarm (open + dispatch the listened event). */
function askMoudir(openApp: (id: string) => unknown, prompt: string) {
  openApp("moudir-chat");
  window.dispatchEvent(new CustomEvent("moudir:ask", { detail: { prompt } }));
}

/** A transient "smart drop" target: an item dropped on the empty canvas. */
interface SmartDrop {
  payload: DesktopDragPayload;
  x: number;
  y: number;
}

/**
 * The Windows-style desktop workspace — replaces the home screen when desktop
 * mode is on. A wallpaper canvas hosts desktop icons (Recycle Bin, folders) and
 * free-floating windows; a spotlight command bar is the empty-state hero, and a
 * Windows taskbar + Start menu anchor the bottom.
 */
export function Desktop({
  user,
  onExitDesktop,
}: {
  user?: DashboardUser;
  onExitDesktop: () => void;
}) {
  const windows = useDesktopWindows();
  const wallpaper = useWallpaper();
  const glassPalette = useGlassPalette();
  const { openApp, toggleLauncher, toggleSpotlight } = useDesktopActions();
  const [clock, setClock] = useState("");
  const [date, setDate] = useState("");
  const [greeting, setGreeting] = useState("Bonjour");
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [smartDrop, setSmartDrop] = useState<SmartDrop | null>(null);
  const dropDepth = useRef(0);

  // Keep open windows fitted to the live canvas (on mount + on every resize).
  useViewportReflow();

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const h = now.getHours();
      setGreeting(h < 12 ? "Bonjour" : h < 18 ? "Bon après-midi" : "Bonsoir");
      setClock(now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
      setDate(
        now.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }),
      );
    };
    tick();
    const t = setInterval(tick, 15_000);
    return () => clearInterval(t);
  }, []);

  // ⊞ (Meta) → Start; Ctrl/Cmd+K → Spotlight.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggleSpotlight();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSpotlight]);

  // Apps requested via window event (home screen, folders, etc.).
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ appId?: string; props?: Record<string, unknown> }>).detail;
      if (
        detail?.appId &&
        openApp(detail.appId, detail.props ? { props: detail.props } : undefined)
      ) {
        e.preventDefault();
      }
    };
    window.addEventListener("desktop:open-app", onOpen as EventListener);
    return () => window.removeEventListener("desktop:open-app", onOpen as EventListener);
  }, [openApp]);

  const visibleCount = windows.filter((w) => !w.minimized).length;

  // Desktop-level drag-and-drop: OS files → import; desktop drag payloads →
  // a "smart drop" chip row offering quick AI actions via Moudir.
  const canvasHasDrag = useCallback((e: React.DragEvent) => {
    const types = e.dataTransfer?.types;
    if (!types) return { osFile: false, payload: false };
    let osFile = false;
    let payload = false;
    for (let i = 0; i < types.length; i++) {
      if (types[i] === "Files") osFile = true;
      if (types[i] === DESKTOP_DND_MIME) payload = true;
    }
    return { osFile, payload };
  }, []);

  const onCanvasDragOver = useCallback(
    (e: React.DragEvent) => {
      const { osFile, payload } = canvasHasDrag(e);
      if (!osFile && !payload) return;
      e.preventDefault();
      try {
        e.dataTransfer.dropEffect = "copy";
      } catch {
        // dropEffect can be read-only in some phases.
      }
    },
    [canvasHasDrag],
  );

  const onCanvasDragEnter = useCallback(
    (e: React.DragEvent) => {
      const { osFile, payload } = canvasHasDrag(e);
      if (!osFile && !payload) return;
      e.preventDefault();
      dropDepth.current += 1;
    },
    [canvasHasDrag],
  );

  const onCanvasDragLeave = useCallback(
    (e: React.DragEvent) => {
      const { osFile, payload } = canvasHasDrag(e);
      if (!osFile && !payload) return;
      dropDepth.current = Math.max(0, dropDepth.current - 1);
    },
    [canvasHasDrag],
  );

  const onCanvasDrop = useCallback(
    (e: React.DragEvent) => {
      dropDepth.current = 0;
      const { osFile } = canvasHasDrag(e);
      // OS file(s) dropped → open the import app (its dropzone handles the rest).
      if (osFile && e.dataTransfer.files.length > 0) {
        e.preventDefault();
        openApp("upload");
        return;
      }
      // Desktop payload dropped on empty canvas → offer a smart-drop chip row.
      const payload = readDrag(e);
      if (payload && (payload.kind === "dataset" || payload.kind === "folder")) {
        e.preventDefault();
        setSmartDrop({ payload, x: e.clientX, y: e.clientY });
      }
    },
    [canvasHasDrag, openApp],
  );

  const runSmartDrop = useCallback(
    (action: "report" | "forecast" | "anomalies") => {
      const drop = smartDrop;
      if (!drop) return;
      const name = drop.payload.label ?? drop.payload.id;
      if (action === "report") {
        askMoudir(
          openApp,
          `Génère un rapport synthétique pour le jeu de données « ${name} » : KPIs clés, tendances et points d'attention.`,
        );
      } else if (action === "forecast") {
        askMoudir(
          openApp,
          `Établis une prévision à partir du jeu de données « ${name} » et explique les hypothèses retenues.`,
        );
      } else {
        askMoudir(
          openApp,
          `Détecte les anomalies dans le jeu de données « ${name} » et classe-les par gravité.`,
        );
      }
      setSmartDrop(null);
    },
    [smartDrop, openApp],
  );

  return (
    <div
      data-glass={glassPalette}
      className="relative flex h-screen w-full flex-col overflow-hidden"
      style={{
        background: `var(--wp-${wallpaper}, var(--wp-dawn))`,
        // Nerd/dev font for the whole desktop chrome; window CONTENT resets to
        // the app sans (see window-frame).
        fontFamily:
          "var(--font-nerd), var(--font-data-navigator-sans), 'Outfit', 'Poppins', ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <MenuBar clock={clock} date={date} />

      {/* Window + icon canvas (Rnd bounds) */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: desktop surface — right-click opens a context menu; keyboard users use Start/Spotlight. */}
      <div
        className="dn-desktop-canvas relative min-h-0 flex-1"
        onContextMenu={(e) => {
          // Open the desktop menu for right-clicks on empty space. That click
          // normally lands on the full-bleed click-away layer ([data-desktop-surface]
          // in DesktopIcons) rather than the bare canvas, so accept either. Icons
          // and widgets stopPropagation, and app windows are excluded by not
          // carrying the marker — so their right-clicks never open this menu.
          const target = e.target as HTMLElement;
          if (
            target === e.currentTarget ||
            target.classList.contains("dn-desktop-canvas") ||
            target.closest("[data-desktop-surface]")
          ) {
            e.preventDefault();
            setCtxMenu({ x: e.clientX, y: e.clientY });
          }
        }}
        onDragOver={onCanvasDragOver}
        onDragEnter={onCanvasDragEnter}
        onDragLeave={onCanvasDragLeave}
        onDrop={onCanvasDrop}
      >
        {/* Own stacking context, capped at --z-window (25) — below --z-topbar
            (30) and --z-dock (40). Window z-index climbs unboundedly inside
            here (focus order, pin-on-top) but can never escape past this
            context to cover the chrome, no matter how high it gets.
            `absolute inset-0` so it exactly fills .dn-desktop-canvas — Rnd's
            "bounds=parent" and every absolutely-positioned child inside
            (icons, widgets, windows) keep the same coordinate space they had
            as direct children of the canvas. */}
        <div className="absolute inset-0 z-[var(--z-window)]">
          {/* Free-floating widgets + pinned snapshots sit above the wallpaper,
              beneath the window layer. */}
          <WidgetsLayerMemo />
          <SnapshotsLayerMemo />

          <DesktopIconsMemo />

          {windows.map((win) => (
            <WindowFrameMemo key={win.id} win={win} />
          ))}

          {/* Spotlight hero on the empty desktop */}
          {visibleCount === 0 && <Spotlight inline greeting={greeting} />}
        </div>

        {/* Right-docked Inspector (toggleable) */}
        <Inspector open={inspectorOpen} onClose={() => setInspectorOpen(false)} />

        {/* Inspector toggle — small floating tab on the right edge. */}
        <button
          type="button"
          aria-label={inspectorOpen ? "Masquer l'inspecteur" : "Afficher l'inspecteur"}
          onClick={() => setInspectorOpen((v) => !v)}
          className="absolute right-3 top-3 z-[var(--z-drawer)] grid size-9 place-items-center rounded-xl transition-colors"
          style={{
            background: "var(--glass-bg)",
            border: "1px solid var(--glass-border)",
            color: "var(--glass-text)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            boxShadow: "var(--glass-shadow)",
            opacity: inspectorOpen ? 0 : 1,
            pointerEvents: inspectorOpen ? "none" : "auto",
          }}
        >
          <PanelRight className="size-4" />
        </button>

        {/* Smart-drop chip row — quick AI actions on a dropped dataset/folder. */}
        <AnimatePresence>
          {smartDrop && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 6 }}
              transition={{ type: "spring", stiffness: 420, damping: 30 }}
              className="absolute z-[var(--z-palette)] flex items-center gap-1.5 rounded-2xl p-1.5"
              style={{
                left: Math.max(8, Math.min(smartDrop.x - 110, window.innerWidth - 380)),
                top: Math.max(48, smartDrop.y - 24),
                background: "var(--glass-bg-strong)",
                border: "1px solid var(--glass-border)",
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
                boxShadow: "var(--glass-shadow)",
              }}
              onMouseLeave={() => setSmartDrop(null)}
            >
              <SmartDropChip
                icon={<Sparkles className="size-3.5" />}
                label="Rapport"
                onClick={() => runSmartDrop("report")}
              />
              <SmartDropChip
                icon={<LineChart className="size-3.5" />}
                label="Prévision"
                onClick={() => runSmartDrop("forecast")}
              />
              <SmartDropChip
                icon={<AlertTriangle className="size-3.5" />}
                label="Anomalies"
                onClick={() => runSmartDrop("anomalies")}
              />
              <button
                type="button"
                aria-label="Annuler"
                onClick={() => setSmartDrop(null)}
                className="ml-0.5 grid size-7 place-items-center rounded-lg transition-colors hover:bg-white/10"
                style={{ color: "var(--glass-text-dim)" }}
              >
                <X className="size-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Dock />
      <Launcher />
      <Spotlight />

      {/* Global desktop overlays (self-contained fixed portals). */}
      <QuickLook />
      <SelectToAsk />
      <HudLayer />
      {/* NotificationsCenter is owned/mounted by the MenuBar (bell trigger). */}

      {/* Exit-to-classic lives in the right-click desktop context menu. */}
      <DesktopContextMenu menu={ctxMenu} onClose={() => setCtxMenu(null)} onExit={onExitDesktop} />
    </div>
  );
}

/** A single rounded action chip used by the smart-drop row. */
function SmartDropChip({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-white/10"
      style={{ color: "var(--glass-text)" }}
    >
      <span style={{ color: "hsl(var(--glass-accent))" }}>{icon}</span>
      {label}
    </button>
  );
}
