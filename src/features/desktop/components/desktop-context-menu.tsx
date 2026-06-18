"use client";

import {
  BarChart3,
  ChevronRight,
  Clock,
  Gauge,
  Grid2x2,
  Layers,
  LayoutGrid,
  MonitorOff,
  Plus,
  TrendingUp,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useShellActions } from "@/features/dashboard-shell/shell/shell-store";
import { widgetSize } from "@/features/desktop/components/widgets/widget-registry";
import {
  type DesktopWidget,
  useDesktopActions,
  useWallpaper,
  WALLPAPERS,
} from "@/features/desktop/store/desktop-store";

/** Widget types offered by the "Ajouter un widget" submenu, with French labels. */
const WIDGET_CHOICES: {
  type: DesktopWidget["type"];
  label: string;
  Icon: typeof Gauge;
}[] = [
  { type: "kpi", label: "KPI", Icon: Gauge },
  { type: "sparkline", label: "Tendance", Icon: TrendingUp },
  { type: "channels", label: "Canaux", Icon: BarChart3 },
  { type: "clock", label: "Horloge", Icon: Clock },
];

export interface ContextMenuState {
  x: number;
  y: number;
}

/**
 * Right-click menu for the desktop canvas — quick access to the launcher, window
 * tidy/close, wallpaper swatches, and the exit-to-classic affordance. Warm,
 * compact, dismiss-on-anything.
 */
export function DesktopContextMenu({
  menu,
  onClose,
  onExit,
}: {
  menu: ContextMenuState | null;
  onClose: () => void;
  onExit?: () => void;
}) {
  const { toggleLauncher, cascadeArrange, closeAll, setWallpaper, addWidget } =
    useDesktopActions();
  const { setDesktopMode } = useShellActions();
  const wallpaper = useWallpaper();
  const [widgetSubOpen, setWidgetSubOpen] = useState(false);

  useEffect(() => {
    if (!menu) return;
    const close = () => onClose();
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
    };
  }, [menu, onClose]);

  // Reset the submenu whenever the menu is dismissed/reopened.
  useEffect(() => {
    if (!menu) setWidgetSubOpen(false);
  }, [menu]);

  // Drop a new widget at the right-click point, clamped to stay on-canvas.
  const handleAddWidget = (type: DesktopWidget["type"]) => {
    if (!menu) return;
    const size = widgetSize(type);
    const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const wx = Math.max(8, Math.min(menu.x, vw - size.w - 8));
    const wy = Math.max(8, Math.min(menu.y, vh - size.h - 8));
    addWidget({ type, config: {}, x: wx, y: wy });
    onClose();
  };

  const item = "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs text-foreground/80 transition hover:bg-foreground/5";

  // Keep the menu on-screen.
  const x = menu ? Math.min(menu.x, (typeof window !== "undefined" ? window.innerWidth : 9999) - 240) : 0;
  const y = menu ? Math.min(menu.y, (typeof window !== "undefined" ? window.innerHeight : 9999) - 280) : 0;

  return (
    <AnimatePresence>
      {menu && (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.12 }}
          style={{ left: x, top: y }}
          className="fixed z-[var(--z-modal)] w-56 rounded-xl border border-white/60 bg-white/85 p-1.5 shadow-2xl backdrop-blur-xl"
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button type="button" className={item} onClick={() => { toggleLauncher(); onClose(); }}>
            <LayoutGrid className="size-3.5" /> Applications
          </button>
          <button
            type="button"
            className={item}
            onClick={() => { cascadeArrange({ w: window.innerWidth, h: window.innerHeight }); onClose(); }}
          >
            <Layers className="size-3.5" /> Ranger les fenêtres
          </button>
          <button type="button" className={item} onClick={() => { closeAll(); onClose(); }}>
            <X className="size-3.5" /> Tout fermer
          </button>

          <div className="my-1 h-px bg-black/5" />
          {/* Add-widget row with a hover-revealed submenu of the four widget types. */}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: hover wrapper toggles the submenu; focusable triggers live inside. */}
          <div
            className="relative"
            onMouseEnter={() => setWidgetSubOpen(true)}
            onMouseLeave={() => setWidgetSubOpen(false)}
          >
            <button type="button" className={item} aria-haspopup="menu" aria-expanded={widgetSubOpen}>
              <Plus className="size-3.5" /> Ajouter un widget
              <ChevronRight className="ml-auto size-3.5 text-foreground/40" />
            </button>
            <AnimatePresence>
              {widgetSubOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.12 }}
                  className="absolute left-full top-0 ml-1 w-44 rounded-xl border border-white/60 bg-white/85 p-1.5 shadow-2xl backdrop-blur-xl"
                >
                  {WIDGET_CHOICES.map(({ type, label, Icon }) => (
                    <button
                      key={type}
                      type="button"
                      className={item}
                      onClick={() => handleAddWidget(type)}
                    >
                      <Icon className="size-3.5" /> {label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="my-1 h-px bg-black/5" />
          <div className="px-2.5 pb-1 pt-0.5 text-[10px] font-medium uppercase tracking-wide text-foreground/40">
            Fond d'écran
          </div>
          <div className="flex gap-1.5 px-2 pb-1.5">
            {WALLPAPERS.map((wp) => (
              <button
                key={wp.id}
                type="button"
                title={wp.label}
                onClick={() => { setWallpaper(wp.id); onClose(); }}
                className={`size-8 rounded-lg border-2 transition ${wallpaper === wp.id ? "border-primary" : "border-white/60 hover:border-foreground/30"}`}
                style={{ background: wp.css }}
              />
            ))}
          </div>

          <div className="my-1 h-px bg-black/5" />
          <button
            type="button"
            className={item}
            onClick={() => {
              if (onExit) onExit();
              else setDesktopMode(false);
              onClose();
            }}
          >
            <MonitorOff className="size-3.5" /> Mode classique
          </button>
          <div className="flex items-center gap-2 px-2.5 py-1 text-[10px] text-foreground/35">
            <Grid2x2 className="size-3" /> ⌘K pour les applications
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
