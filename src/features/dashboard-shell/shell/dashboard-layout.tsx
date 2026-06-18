"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CommandPalette } from "@/features/dashboard-shell/command/command-palette";
import { AppSidebar } from "@/features/dashboard-shell/nav/app-sidebar";
import type { DashboardUser } from "@/features/dashboard-shell/nav/nav-config";
import { useShellActions, useShellStore } from "@/features/dashboard-shell/shell/shell-store";
import { ShortcutsButton } from "@/features/dashboard-shell/shell/shortcuts-overlay";
import { useShellShortcuts } from "@/features/dashboard-shell/shell/use-shell-shortcuts";
import { Topbar } from "@/features/dashboard-shell/topbar/topbar";
import { Desktop } from "@/features/desktop/components/desktop";

/**
 * Dashboard composition root.
 *
 * Three surfaces share this root:
 *   1. **Framed** (loaded inside a desktop window iframe) → render bare children,
 *      no chrome, so multi-route apps (e.g. the telecom report) appear window-native.
 *   2. **Desktop mode** on the `/dashboard` home → the Puter-style windowed
 *      workspace replaces the sidebar shell. Other route children stay mounted
 *      (hidden) so global effects like SettingsEffects/DashboardBoot keep running.
 *   3. **Classic mode** → the original sidebar + topbar + main layout.
 */
export function DashboardLayout({
  children,
  onAiToggle,
  user,
}: {
  children: React.ReactNode;
  onAiToggle?: () => void;
  user?: DashboardUser;
}) {
  const collapsed = useShellStore((s) => s.sidebarCollapsed);
  const desktopMode = useShellStore((s) => s.desktopMode);
  const { toggleSidebar, setDesktopMode } = useShellActions();
  const [cmdOpen, setCmdOpen] = useState(false);
  const [framed, setFramed] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    try {
      setFramed(window.self !== window.top);
    } catch {
      // Cross-origin access throws → we are framed.
      setFramed(true);
    }
  }, []);

  const togglePalette = useCallback(() => setCmdOpen((v) => !v), []);
  const closePalette = useCallback(() => setCmdOpen(false), []);
  const handleAiToggle = useCallback(() => onAiToggle?.(), [onAiToggle]);

  const shortcutActions = useMemo(
    () => ({
      togglePalette,
      toggleAi: handleAiToggle,
      toggleSidebar,
    }),
    [togglePalette, handleAiToggle, toggleSidebar],
  );

  useShellShortcuts(shortcutActions);

  // 1. Framed: bare content only.
  if (framed) {
    return <div className="min-h-screen w-full bg-background text-foreground">{children}</div>;
  }

  const desktopActive = desktopMode && pathname === "/dashboard";

  // 2. Desktop mode on home.
  if (desktopActive) {
    return (
      <>
        <Desktop user={user} onExitDesktop={() => setDesktopMode(false)} />
        {/* Keep route children mounted but hidden so global boot/effects run. */}
        <div className="hidden" aria-hidden>
          {children}
        </div>
        <ShortcutsButton />
      </>
    );
  }

  // 3. Classic shell.
  return (
    <div className="flex h-screen w-full overflow-hidden text-foreground">
      <a
        href="#main-content"
        className="sr-only z-[var(--z-toast)] focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-[var(--shadow-2)] focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Aller au contenu principal
      </a>
      <AppSidebar collapsed={collapsed} onToggle={toggleSidebar} onAiToggle={onAiToggle} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar onCmdPalette={() => setCmdOpen(true)} onAiToggle={onAiToggle} user={user} />
        <main id="main-content" className="min-w-0 flex-1 overflow-auto">
          {children}
        </main>
      </div>
      <CommandPalette open={cmdOpen} onClose={closePalette} onToggleAi={onAiToggle} />
      <ShortcutsButton />
    </div>
  );
}
