"use client";

import { Bell, CalendarDays, Monitor, Moon, Search, Sun, Wifi } from "lucide-react";
import { getApp, PINNED_APPS } from "@/features/desktop/core/app-registry";
import {
  useDesktopActions,
  useDesktopStore,
  useDesktopWindows,
} from "@/features/desktop/store/desktop-store";
import { useAppTheme } from "@/hooks/use-app-theme";

/**
 * Windows 11-style taskbar: centered Start + search + pinned/running apps, with
 * a right-aligned system tray (network, theme, notifications, clock). Running
 * apps show the Windows underline indicator; the active window's pill is filled.
 */
export function Taskbar({ clock, date }: { clock: string; date: string }) {
  const windows = useDesktopWindows();
  const { openApp, focusWindow, minimizeWindow, restoreWindow, toggleLauncher, toggleSpotlight } =
    useDesktopActions();
  const { theme, setTheme } = useAppTheme();
  const widgetDate = useDesktopStore((s) => s.widgetDate);
  const setWidgetDate = useDesktopStore((s) => s.setWidgetDate);

  const running = new Map<string, { id: string; minimized: boolean; z: number }>();
  let topZ = -1;
  let topId: string | null = null;
  for (const w of windows) {
    const cur = running.get(w.appId);
    if (!cur || w.z > cur.z) running.set(w.appId, { id: w.id, minimized: w.minimized, z: w.z });
    if (!w.minimized && w.z > topZ) {
      topZ = w.z;
      topId = w.id;
    }
  }
  const pinnedIds = new Set(PINNED_APPS.map((a) => a.id));
  const extras = [...running.keys()]
    .filter((id) => !pinnedIds.has(id))
    .map(getApp)
    .filter(Boolean);
  const items = [...PINNED_APPS, ...extras.filter((a): a is NonNullable<typeof a> => Boolean(a))];

  const onClick = (appId: string) => {
    const r = running.get(appId);
    if (!r) return void openApp(appId);
    if (r.id === topId) minimizeWindow(r.id);
    else {
      restoreWindow(r.id);
      focusWindow(r.id);
    }
  };

  return (
    <div className="relative z-[var(--z-dock)] flex h-12 shrink-0 items-center gap-1 border-t border-[var(--win-border)] bg-[var(--win-taskbar)] px-2 backdrop-blur-2xl">
      {/* Left: spacer keeps the app group centered */}
      <div className="flex-1" />

      {/* Center: Start + search + apps */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={toggleLauncher}
          title="Démarrer"
          aria-label="Démarrer"
          className="grid size-10 place-items-center rounded-lg transition-colors hover:bg-foreground/10"
        >
          <WindowsLogo />
        </button>
        <button
          type="button"
          onClick={toggleSpotlight}
          title="Rechercher (⊞ ou ⌘K)"
          aria-label="Rechercher"
          className="grid size-10 place-items-center rounded-lg text-foreground/70 transition-colors hover:bg-foreground/10"
        >
          <Search className="size-4.5" />
        </button>

        {items.map((app) => {
          const r = running.get(app.id);
          const Icon = app.icon;
          const isTop = r?.id === topId && !r?.minimized;
          return (
            <button
              key={app.id}
              type="button"
              onClick={() => onClick(app.id)}
              title={app.title}
              className={`group relative grid size-10 place-items-center rounded-lg transition-colors ${
                isTop ? "bg-foreground/10" : "hover:bg-foreground/10"
              }`}
            >
              <Icon className="size-5" style={{ color: `hsl(${app.hue} 55% 45%)` }} />
              {r && (
                <span
                  className={`absolute -bottom-0.5 left-1/2 h-[3px] -translate-x-1/2 rounded-full bg-[hsl(var(--win-accent))] transition-all ${
                    isTop ? "w-4" : "w-1.5"
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Right: system tray */}
      <div className="flex flex-1 items-center justify-end gap-0.5">
        <div className="relative">
          <input
            type="date"
            value={widgetDate ?? ""}
            onChange={(e) => setWidgetDate(e.target.value || null)}
            title="Filtrer les widgets par date"
            aria-label="Date des widgets"
            className="absolute inset-0 cursor-pointer opacity-0"
            style={{ width: "100%", height: "100%" }}
          />
          <button
            type="button"
            title={widgetDate ? `Filtré : ${widgetDate}` : "Filtrer par date"}
            className={`grid size-8 place-items-center rounded-md transition-colors hover:bg-foreground/10 ${
              widgetDate ? "text-[hsl(var(--win-accent))]" : "text-foreground/60"
            }`}
          >
            <CalendarDays className="size-4" />
          </button>
        </div>
        <button
          type="button"
          aria-label="Réseau"
          className="grid size-8 place-items-center rounded-md text-foreground/60 transition-colors hover:bg-foreground/10"
        >
          <Wifi className="size-4" />
        </button>
        <button
          type="button"
          onClick={() =>
            setTheme(theme === "dark" ? "light" : theme === "light" ? "system" : "dark")
          }
          aria-label="Thème"
          className="grid size-8 place-items-center rounded-md text-foreground/60 transition-colors hover:bg-foreground/10"
        >
          {theme === "dark" ? (
            <Moon className="size-4" />
          ) : theme === "light" ? (
            <Sun className="size-4" />
          ) : (
            <Monitor className="size-4" />
          )}
        </button>
        <button
          type="button"
          aria-label="Notifications"
          className="grid size-8 place-items-center rounded-md text-foreground/60 transition-colors hover:bg-foreground/10"
        >
          <Bell className="size-4" />
        </button>
        <button
          type="button"
          className="flex flex-col items-end rounded-md px-2 py-1 text-right leading-tight text-foreground/70 transition-colors hover:bg-foreground/10"
        >
          <span className="text-xs tabular-nums">{clock}</span>
          <span className="text-[10px] text-muted-foreground">{date}</span>
        </button>
      </div>
    </div>
  );
}

function WindowsLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <rect x="0" y="0" width="8" height="8" rx="0.5" fill="hsl(var(--win-accent))" />
      <rect x="10" y="0" width="8" height="8" rx="0.5" fill="hsl(var(--win-accent))" />
      <rect x="0" y="10" width="8" height="8" rx="0.5" fill="hsl(var(--win-accent))" />
      <rect x="10" y="10" width="8" height="8" rx="0.5" fill="hsl(var(--win-accent))" />
    </svg>
  );
}
