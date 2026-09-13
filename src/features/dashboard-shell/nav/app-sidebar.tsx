"use client";

import { ChevronRight } from "lucide-react";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { usePinnedItems } from "@/core/stores/settings-store";
import { NavButton } from "@/features/dashboard-shell/nav/nav-button";
import {
  ALL_ITEMS,
  type DashboardUser,
  FOOTER_ITEMS,
  filterNavItemsForRole,
  filterNavSectionsForRole,
  isNavGroupActive,
  isNavItemActive,
  lockNavItemsByPermission,
  NAV_SECTIONS,
  navItemVisibleForRole,
} from "@/features/dashboard-shell/nav/nav-config";
import { NavGroup } from "@/features/dashboard-shell/nav/nav-group";
import { useEngineInfo } from "@/features/dashboard-shell/shell/use-engine-info";
import { useDashboardAccess } from "@/platform/auth/dashboard-access";
import { cn } from "@/shared/utils";

/**
 * Application sidebar (IA v2).
 *
 * `<nav>` landmark, grouped/collapsible sections, fully tokenized (the teal
 * hardcodes are gone), 12px section labels (the 9px floor is lifted), and a
 * 56px icon rail when collapsed with keyboard-accessible Radix tooltips.
 * Active state is computed once here and passed down to memoized buttons.
 *
 * Guest sessions: items whose `requiredPermission` the host didn't grant render
 * as locked (lock icon + tooltip) instead of hiding, so guests understand why
 * access is blocked (Mews "Availability States" pattern).
 */
export function AppSidebar({
  collapsed,
  onToggle,
  user,
}: {
  collapsed: boolean;
  onToggle: () => void;
  user?: DashboardUser;
}) {
  const pinnedItems = usePinnedItems();
  const pathname = usePathname();
  const engine = useEngineInfo();
  // Effective role: the device role capped by the live LAN session grant, so
  // a guest joining a shared session sees only the viewer-safe entries.
  const { role } = useDashboardAccess();
  const guestPermissions = user?.permissions;

  const lockedAllItems = useMemo(
    () => lockNavItemsByPermission(ALL_ITEMS, guestPermissions),
    [guestPermissions],
  );

  const pinnedNavItems = useMemo(
    () =>
      lockedAllItems.filter(
        (item) => pinnedItems.includes(item.href) && navItemVisibleForRole(item, role),
      ),
    [lockedAllItems, pinnedItems, role],
  );

  const roleFilteredSections = useMemo(() => filterNavSectionsForRole(NAV_SECTIONS, role), [role]);
  const sections = useMemo(
    () =>
      roleFilteredSections.map((section) => ({
        ...section,
        items: lockNavItemsByPermission(section.items, guestPermissions),
      })),
    [roleFilteredSections, guestPermissions],
  );
  const footerItems = useMemo(
    () => lockNavItemsByPermission(filterNavItemsForRole(FOOTER_ITEMS, role), guestPermissions),
    [role, guestPermissions],
  );

  return (
    <aside
      id="app-sidebar"
      data-collapsed={collapsed || undefined}
      style={{ width: collapsed ? 60 : 252 }}
      className="relative hidden h-full flex-none flex-col overflow-hidden border-r border-sidebar-border/70 bg-sidebar/95 text-sidebar-foreground shadow-xs transition-[width] duration-200 ease-out motion-reduce:transition-none md:flex"
    >
      {/* Brand Header — h-14 perfectly aligns with Topbar */}
      <div
        className={cn(
          "flex h-14 flex-none items-center gap-3 border-b border-sidebar-border/70 px-3.5",
          collapsed && "justify-center px-2",
        )}
      >
        <div className="flex size-8 flex-none shrink-0 items-center justify-center overflow-hidden rounded-xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.png" alt="Data Navigator" className="size-8 object-cover" />
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-sm font-semibold tracking-tight text-sidebar-foreground">
              Data Navigator
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10.5px] text-muted-foreground/75">
              <span className="size-1.5 rounded-full bg-emerald-500 shadow-xs" />
              <span className="truncate">{engine.label}</span>
            </div>
          </div>
        )}
        {!collapsed && (
          <button
            type="button"
            onClick={onToggle}
            aria-label="Réduire le menu"
            className="flex size-7 flex-none items-center justify-center rounded-lg text-muted-foreground/60 transition-all hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronRight className="size-3.5 rotate-180" />
          </button>
        )}
        {collapsed && (
          <button
            type="button"
            onClick={onToggle}
            className="absolute inset-0 size-full"
            aria-label="Développer le menu"
          />
        )}
      </div>

      {/* Scrollable nav */}
      <nav
        aria-label="Navigation principale"
        className="scrollbar-none flex-1 overflow-y-auto overflow-x-hidden py-3"
      >
        {/* Pinned */}
        {!collapsed && pinnedNavItems.length > 0 && (
          <div className="mb-2 px-2.5">
            <SectionLabel>Épinglés</SectionLabel>
            <div className="space-y-0.5">
              {pinnedNavItems.map((item) => (
                <NavButton
                  key={`pinned-${item.href}`}
                  item={item}
                  collapsed={false}
                  active={isNavItemActive(pathname, item.href)}
                />
              ))}
            </div>
            <div className="mx-2 my-2.5 border-t border-sidebar-border/60" />
          </div>
        )}

        <div className="space-y-3">
          {sections.map((section) => (
            <div key={section.label} className="px-2.5">
              {!collapsed ? (
                <SectionLabel>{section.label}</SectionLabel>
              ) : (
                <div className="mx-2 my-1.5 border-t border-sidebar-border/40" />
              )}
              <div className="space-y-0.5">
                {section.items.map((item) =>
                  item.children ? (
                    <NavGroup
                      key={item.href}
                      item={item}
                      collapsed={collapsed}
                      pathname={pathname}
                      groupActive={isNavGroupActive(pathname, item)}
                    />
                  ) : (
                    <NavButton
                      key={item.href}
                      item={item}
                      collapsed={collapsed}
                      active={isNavItemActive(pathname, item.href)}
                    />
                  ),
                )}
              </div>
            </div>
          ))}
        </div>
      </nav>

      {/* Footer */}
      <div className="flex-none space-y-0.5 border-t border-sidebar-border/70 p-2.5">
        {footerItems.map((item) => (
          <NavButton
            key={item.href}
            item={item}
            collapsed={collapsed}
            active={isNavItemActive(pathname, item.href)}
          />
        ))}
      </div>
    </aside>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pt-2.5 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/55 select-none">
      {children}
    </div>
  );
}
