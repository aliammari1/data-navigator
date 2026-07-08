"use client";

import { ChevronRight, Database } from "lucide-react";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { usePinnedItems } from "@/core/stores/settings-store";
import { NavButton } from "@/features/dashboard-shell/nav/nav-button";
import {
  ALL_ITEMS,
  FOOTER_ITEMS,
  filterNavItemsForRole,
  filterNavSectionsForRole,
  isNavGroupActive,
  isNavItemActive,
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
 */
export function AppSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pinnedItems = usePinnedItems();
  const pathname = usePathname();
  const engine = useEngineInfo();
  // Effective role: the device role capped by the live LAN session grant, so
  // a guest joining a shared session sees only the viewer-safe entries.
  const { role } = useDashboardAccess();

  const pinnedNavItems = useMemo(
    () =>
      ALL_ITEMS.filter(
        (item) => pinnedItems.includes(item.href) && navItemVisibleForRole(item, role),
      ),
    [pinnedItems, role],
  );

  const sections = useMemo(() => filterNavSectionsForRole(NAV_SECTIONS, role), [role]);
  const footerItems = useMemo(() => filterNavItemsForRole(FOOTER_ITEMS, role), [role]);

  return (
    <aside
      data-collapsed={collapsed || undefined}
      style={{ width: collapsed ? 56 : 232 }}
      className="relative hidden h-full flex-none flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out motion-reduce:transition-none md:flex"
    >
      {/* Brand */}
      <div
        className={cn(
          "flex h-12 flex-none items-center gap-2.5 border-b border-sidebar-border px-3",
          collapsed && "justify-center",
        )}
      >
        <div className="flex size-7 flex-none shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/15">
          <Database className="size-3.5 text-primary" />
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold leading-none text-sidebar-foreground">
              Data Navigator
            </div>
            <div className="mt-0.5 font-mono text-[10px] text-muted-foreground/60">
              {engine.label}
            </div>
          </div>
        )}
        {!collapsed && (
          <button
            type="button"
            onClick={onToggle}
            aria-label="Réduire le menu"
            className="flex size-6 flex-none items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronRight className="size-3 rotate-180" />
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
        className="scrollbar-none flex-1 overflow-y-auto overflow-x-hidden py-2"
      >
        {/* Pinned */}
        {!collapsed && pinnedNavItems.length > 0 && (
          <div className="mb-1 px-2">
            <SectionLabel>Épinglés</SectionLabel>
            {pinnedNavItems.map((item) => (
              <NavButton
                key={`pinned-${item.href}`}
                item={item}
                collapsed={false}
                active={isNavItemActive(pathname, item.href)}
              />
            ))}
            <div className="mx-2 my-2 border-t border-sidebar-border/60" />
          </div>
        )}

        {sections.map((section) => (
          <div key={section.label} className="mb-1 space-y-px px-2">
            {!collapsed ? (
              <SectionLabel>{section.label}</SectionLabel>
            ) : (
              <div className="mx-1 my-1 border-t border-sidebar-border/40" />
            )}
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
        ))}
      </nav>

      {/* Footer */}
      <div className="flex-none space-y-px border-t border-sidebar-border px-2 py-2">
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
    <div className="px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground/50">
      {children}
    </div>
  );
}
