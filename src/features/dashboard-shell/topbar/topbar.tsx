"use client";

import {
  ChevronRight,
  Command,
  LayoutGrid,
  Lock,
  LogOut,
  Monitor,
  Moon,
  Search,
  Settings,
  Sun,
  UserCircle,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSettingsStore } from "@/core/stores/settings-store";
import type { DashboardUser } from "@/features/dashboard-shell/nav/nav-config";
import { useShellActions } from "@/features/dashboard-shell/shell/shell-store";
import { DatasetPicker } from "@/features/dashboard-shell/topbar/dataset-picker";
import { ModelStatusPill } from "@/features/dashboard-shell/topbar/model-status-pill";
import { NotificationsBell } from "@/features/dashboard-shell/topbar/notifications-bell";
import { useAppTheme } from "@/hooks/use-app-theme";
import { lockApp, logout } from "@/platform/auth/auth-ipc-client";
import { cn } from "@/shared/utils";

function userInitialsFrom(displayName: string): string {
  return displayName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Dashboard topbar.
 *
 * Decomposed from the 1566-line monolith. Breadcrumbs are memoized on
 * `pathname` (not rebuilt every render), the static mock `NOTIFS` array is gone
 * (the bell now reads the durable activity-store), `showBreadcrumbs` uses a
 * narrow selector, and the avatar is initials-only — no `<AvatarImage src>` that
 * would trigger a network fetch of a remote URL in a no-internet Electron build.
 * Keyboard shortcuts (Cmd+K) are owned centrally by `useShellShortcuts`.
 */
export function Topbar({ onCmdPalette, user }: { onCmdPalette: () => void; user?: DashboardUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const showBreadcrumbs = useSettingsStore((s) => s.showBreadcrumbs);
  const { theme, setTheme } = useAppTheme();
  const { setDesktopMode } = useShellActions();
  const [mounted, setMounted] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const enterDesktop = () => {
    setDesktopMode(true);
    if (pathname !== "/dashboard") router.push("/dashboard");
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  const crumbs = useMemo(() => {
    const segments = pathname.split("/").filter(Boolean);
    return segments.map((seg, i) => ({
      label: seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      href: `/${segments.slice(0, i + 1).join("/")}`,
    }));
  }, [pathname]);

  const cycleTheme = () => {
    setTheme(theme === "dark" ? "light" : theme === "light" ? "system" : "dark");
  };

  const ThemeIcon = !mounted
    ? Monitor
    : theme === "dark"
      ? Moon
      : theme === "light"
        ? Sun
        : Monitor;
  const displayName = user?.name || user?.email || "Local user";
  const userInitials = userInitialsFrom(displayName);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await logout();
      router.replace("/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <header className="relative z-[var(--z-topbar)] flex h-14 flex-none items-center gap-2 border-b border-border bg-background/80 px-2 backdrop-blur sm:gap-3 sm:px-4">
      {showBreadcrumbs && (
        <nav className="hidden min-w-0 flex-1 items-center gap-1 overflow-x-hidden text-xs text-muted-foreground sm:flex">
          {crumbs.map((crumb, i) => (
            <span key={crumb.href} className="flex items-center gap-1 min-w-0">
              {i > 0 && <ChevronRight className="w-3 h-3 flex-none text-muted-foreground" />}
              <Link
                href={crumb.href}
                className={cn(
                  "truncate hover:text-foreground transition-colors",
                  i === crumbs.length - 1 ? "text-foreground font-medium" : "text-muted-foreground",
                )}
              >
                {crumb.label}
              </Link>
            </span>
          ))}
        </nav>
      )}

      <div className="flex-1" />

      <DatasetPicker />

      {/* Search trigger → universal cmdk palette (folds in old GlobalDataSearch) */}
      <button
        type="button"
        onClick={onCmdPalette}
        className="flex items-center gap-2 rounded-xl border border-border bg-accent px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent/80 hover:text-foreground sm:px-3"
      >
        <Search className="w-3.5 h-3.5" />
        <span className="hidden md:inline">Search…</span>
        <kbd className="hidden md:flex items-center gap-0.5 px-1.5 py-0.5 bg-accent rounded text-[10px] border border-border">
          <Command className="w-2.5 h-2.5" />K
        </kbd>
      </button>

      {/* Local model status affordance */}
      <ModelStatusPill />

      {user?.isGuest && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="hidden sm:inline">Session LAN:</span> {user.name} ({user.role})
        </span>
      )}

      {/* Enter the windowed desktop workspace (host only) */}
      {!user?.isGuest && (
        <button
          type="button"
          onClick={enterDesktop}
          aria-label="Mode bureau"
          title="Mode bureau"
          className="hidden h-8 items-center gap-1.5 rounded-xl bg-accent px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/80 hover:text-foreground sm:flex"
        >
          <LayoutGrid className="w-4 h-4" />
          Bureau
        </button>
      )}

      {/* Theme toggle */}
      <button
        type="button"
        onClick={cycleTheme}
        aria-label="Cycle theme"
        className="hidden h-8 w-8 items-center justify-center rounded-xl bg-accent text-muted-foreground transition-colors hover:bg-accent/80 hover:text-foreground sm:flex"
      >
        <ThemeIcon className="w-4 h-4" />
      </button>

      <NotificationsBell />

      <Link
        href="/dashboard/settings"
        aria-label="Settings"
        className="hidden h-8 w-8 items-center justify-center rounded-xl bg-accent text-muted-foreground transition-colors hover:bg-accent/80 hover:text-foreground sm:flex"
      >
        <Settings className="w-4 h-4" />
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Avatar className="size-8 rounded-xl">
            <AvatarFallback className="rounded-xl bg-primary text-primary-foreground text-xs font-semibold">
              {userInitials || "DN"}
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8} className="w-64">
          <DropdownMenuLabel>
            <div className="flex items-center gap-3">
              <Avatar className="size-9 rounded-xl">
                <AvatarFallback className="rounded-xl text-xs font-semibold">
                  {userInitials || "DN"}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-foreground">{displayName}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary border border-primary/20">
                    {user?.isGuest ? user.role || "Guest" : "Administrator"}
                  </span>
                  {user?.email && (
                    <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                  )}
                </div>
              </div>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {user ? (
            <>
              <DropdownMenuItem
                onClick={async () => {
                  await lockApp();
                  router.replace("/login?reason=locked");
                  router.refresh();
                }}
              >
                <Lock className="size-4" />
                <span>Lock Workspace</span>
                <kbd className="ml-auto text-[10px] text-muted-foreground border border-border px-1.5 py-0.5 rounded font-mono">
                  ⌘L
                </kbd>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleSignOut} disabled={signingOut}>
                <LogOut className="size-4" />
                {signingOut ? "Signing out..." : "Sign out"}
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem onClick={() => router.push("/login")}>
              <LogOut className="size-4 rotate-180" />
              Sign in
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
