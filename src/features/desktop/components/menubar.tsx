"use client";

import { Bell, Monitor, Moon, Palette, Sun, Wifi } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { AppMenubar } from "@/features/desktop/components/app-menubar";
import { Explainable } from "@/features/desktop/components/hover-explain";
import {
  NotificationsCenter,
  useUnreadCount,
} from "@/features/desktop/components/notifications-center";
import { useWidgetTelecomData } from "@/features/desktop/components/widgets/use-widget-telecom-data";
import { WorkspacesMenu } from "@/features/desktop/components/workspaces-menu";
import { useMenuContext } from "@/features/desktop/core/menu/use-menu-context";
import {
  GLASS_PALETTES,
  useDesktopActions,
  useGlassPalette,
} from "@/features/desktop/store/desktop-store";
import { fmtPct } from "@/features/telecom/lib/format";
import { useAppTheme } from "@/hooks/use-app-theme";

/**
 * macOS-style glass menu bar (top). Left: brand + focused app name. Right: the
 * theme/appearance controls the user asked for — a live glass-palette switcher
 * (sand / peach / amber) and the light/dark/system toggle — plus status + clock.
 * All colours are palette-driven (`--glass-*`).
 */
export function MenuBar({ clock, date }: { clock: string; date: string }) {
  const { theme, setTheme } = useAppTheme();
  const palette = useGlassPalette();
  const { setGlassPalette } = useDesktopActions();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  // Live success rate from the freshest telecom report (self-wired pipeline).
  const telecom = useWidgetTelecomData();
  const unreadCount = useUnreadCount();
  const successRate = telecom.ready && telecom.kpi ? fmtPct(telecom.kpi.successRate) : null;

  // App-aware menus: the bar's menus follow the focused window's app + page.
  const { groups } = useMenuContext();

  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  const cycleTheme = () =>
    setTheme(theme === "dark" ? "light" : theme === "light" ? "system" : "dark");

  return (
    <div
      className="relative z-[var(--z-topbar)] flex h-7 shrink-0 items-center gap-3 border-b px-3 text-[13px]"
      style={{
        background: "var(--glass-bg)",
        borderColor: "var(--glass-border)",
        color: "var(--glass-text)",
        backdropFilter: "blur(24px) saturate(1.4)",
        WebkitBackdropFilter: "blur(24px) saturate(1.4)",
      }}
    >
      <span
        className="grid size-4 place-items-center rounded-[5px] font-serif text-[11px] font-bold text-white"
        style={{ background: "linear-gradient(135deg,#f0c98a,#e0894f)" }}
      >
        م
      </span>
      <AppMenubar groups={groups} />

      {successRate && (
        <Explainable
          value={successRate}
          label="Taux de réussite"
          context={`Rapport télécom : ${telecom.fileName}.`}
          className="hidden lg:inline-flex"
        >
          <span className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[12px]">
            <span
              className="size-1.5 rounded-full"
              style={{ background: "hsl(var(--glass-accent))" }}
            />
            <span className="opacity-60">Réussite</span>
            <span className="font-semibold tabular-nums">{successRate}</span>
          </span>
        </Explainable>
      )}

      <div className="flex-1" />

      {/* Sessions (workspaces) menu */}
      <WorkspacesMenu />

      {/* Notifications bell + center */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setNotificationsOpen((v) => !v)}
          className="relative flex items-center rounded-md px-1.5 py-0.5 transition hover:bg-black/5"
          title="Notifications"
          aria-label="Notifications"
          style={{ color: "var(--glass-text)" }}
        >
          <Bell className="size-3.5" />
          {unreadCount > 0 && (
            <span
              className="absolute -right-0.5 -top-0.5 grid min-w-3.5 place-items-center rounded-full px-0.5 text-[9px] font-semibold leading-none text-white tabular-nums"
              style={{ background: "hsl(var(--glass-accent))", height: "14px" }}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
        <NotificationsCenter open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
      </div>

      {/* Palette switcher */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setPaletteOpen((v) => !v)}
          onBlur={() => setTimeout(() => setPaletteOpen(false), 160)}
          className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition hover:bg-black/5"
          title="Palette"
          aria-label="Changer la palette"
          style={{ color: "var(--glass-text)" }}
        >
          <Palette className="size-3.5" />
        </button>
        <AnimatePresence>
          {paletteOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.96 }}
              className="absolute right-0 top-8 z-[var(--z-modal)] flex gap-2 rounded-xl border p-2"
              style={{
                background: "var(--glass-bg-strong)",
                borderColor: "var(--glass-border)",
                boxShadow: "var(--glass-shadow)",
                backdropFilter: "blur(20px)",
              }}
            >
              {GLASS_PALETTES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  title={p.label}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setGlassPalette(p.id);
                  }}
                  className={`size-9 rounded-lg border-2 transition ${
                    palette === p.id
                      ? "scale-105 border-white shadow-md"
                      : "border-white/40 hover:scale-105"
                  }`}
                  style={{ background: p.swatch }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <button
        type="button"
        onClick={cycleTheme}
        className="rounded-md px-1.5 py-0.5 transition hover:bg-black/5"
        title="Apparence"
        aria-label="Changer l'apparence"
        style={{ color: "var(--glass-text)" }}
      >
        <ThemeIcon className="size-3.5" />
      </button>

      <Wifi className="size-3.5 opacity-70" />
      <span className="tabular-nums opacity-90">{date}</span>
      <span className="font-medium tabular-nums">{clock}</span>
    </div>
  );
}
