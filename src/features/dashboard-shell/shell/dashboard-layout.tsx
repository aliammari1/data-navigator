"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CommandPalette } from "@/features/dashboard-shell/command/command-palette";
import { AppSidebar } from "@/features/dashboard-shell/nav/app-sidebar";
import type { DashboardUser } from "@/features/dashboard-shell/nav/nav-config";
import { useShellActions, useShellStore } from "@/features/dashboard-shell/shell/shell-store";
import { ShortcutsButton } from "@/features/dashboard-shell/shell/shortcuts-overlay";
import { useShellShortcuts } from "@/features/dashboard-shell/shell/use-shell-shortcuts";
import { Topbar } from "@/features/dashboard-shell/topbar/topbar";
import { Desktop } from "@/features/desktop/components/desktop";
import {
  lockApp,
  onLockChanged,
  onSessionExpired,
  onSessionExpiringSoon,
} from "@/platform/auth/auth-ipc-client";

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
  user,
}: {
  children: React.ReactNode;
  user?: DashboardUser;
}) {
  const collapsed = useShellStore((s) => s.sidebarCollapsed);
  const desktopMode = useShellStore((s) => s.desktopMode);
  const { toggleSidebar, setDesktopMode } = useShellActions();
  const [cmdOpen, setCmdOpen] = useState(false);
  const [framed, setFramed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    try {
      setFramed(window.self !== window.top);
    } catch {
      // Cross-origin access throws → we are framed.
      setFramed(true);
    }
  }, []);

  const handleLock = useCallback(async () => {
    await lockApp();
    router.replace("/login?reason=locked");
    router.refresh();
  }, [router]);

  useEffect(() => {
    const unsubExpired = onSessionExpired(() => {
      router.replace("/login?reason=expired");
      router.refresh();
    });

    const unsubLocked = onLockChanged((isLocked) => {
      if (isLocked) {
        router.replace("/login?reason=locked");
        router.refresh();
      }
    });

    const unsubWarning = onSessionExpiringSoon(({ minutesRemaining }) => {
      toast.warning("Session expires at midnight (00:00)", {
        description: `Your daily session will lock in ${minutesRemaining} minutes. Please save your active work.`,
        duration: 12000,
      });
    });

    return () => {
      unsubExpired();
      unsubLocked();
      unsubWarning();
    };
  }, [router]);

  const togglePalette = useCallback(() => setCmdOpen((v) => !v), []);
  const closePalette = useCallback(() => setCmdOpen(false), []);

  const shortcutActions = useMemo(
    () => ({
      togglePalette,
      toggleSidebar,
      lockApp: handleLock,
    }),
    [togglePalette, toggleSidebar, handleLock],
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
      <AppSidebar collapsed={collapsed} onToggle={toggleSidebar} user={user} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar onCmdPalette={() => setCmdOpen(true)} user={user} />
        <main id="main-content" className="min-w-0 flex-1 overflow-auto">
          {children}
        </main>
      </div>
      <CommandPalette open={cmdOpen} onClose={closePalette} />
      <ShortcutsButton />
    </div>
  );
}
