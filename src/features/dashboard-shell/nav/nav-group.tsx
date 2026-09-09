"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NavButton } from "@/features/dashboard-shell/nav/nav-button";
import { isNavItemActive, type NavItem } from "@/features/dashboard-shell/nav/nav-config";
import { cn } from "@/shared/utils";

/**
 * Collapsible nav group. The header row links to the hub page; a separate
 * chevron toggles the inline children (blueprint §2). When the sidebar rail is
 * collapsed the group degrades to a single tooltip'd hub icon — children stay
 * reachable via the hub page and the command palette.
 */
export function NavGroup({
  item,
  collapsed,
  pathname,
  groupActive,
}: {
  item: NavItem;
  collapsed: boolean;
  pathname: string;
  groupActive: boolean;
}) {
  const [open, setOpen] = useState(groupActive);
  const Icon = item.icon;
  const children = item.children ?? [];
  const hubActive = pathname === item.href;

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href={item.href}
            aria-current={hubActive ? "page" : undefined}
            className={cn(
              "group flex size-9 mx-auto items-center justify-center rounded-xl transition-all duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-sidebar",
              groupActive
                ? "bg-primary/12 text-primary shadow-xs ring-1 ring-primary/20"
                : "text-muted-foreground/75 hover:bg-accent/60 hover:text-foreground",
            )}
          >
            <Icon
              className={cn(
                "size-4 flex-none transition-transform duration-150 group-hover:scale-105",
                groupActive
                  ? "text-primary"
                  : "text-muted-foreground/70 group-hover:text-foreground",
              )}
            />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">{item.title}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="space-y-0.5">
      <div
        className={cn(
          "group flex items-center gap-1 rounded-xl text-sm font-medium transition-all duration-150",
          groupActive
            ? "bg-accent/50 text-foreground font-medium"
            : "text-muted-foreground/80 hover:bg-accent/40 hover:text-foreground",
        )}
      >
        <Link
          href={item.href}
          aria-current={hubActive ? "page" : undefined}
          className={cn(
            "flex flex-1 items-center gap-2.5 px-3 py-2 text-sm transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded-lg",
          )}
        >
          <Icon
            className={cn(
              "size-4 flex-none shrink-0 transition-transform duration-150 group-hover:scale-105",
              groupActive ? "text-primary" : "text-muted-foreground/75 group-hover:text-foreground",
            )}
          />
          <span className="flex-1 truncate text-left">{item.title}</span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? `Réduire ${item.title}` : `Développer ${item.title}`}
          className="mr-1.5 flex size-7 flex-none items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronDown
            className={cn("size-3.5 transition-transform duration-200", open && "rotate-180")}
          />
        </button>
      </div>
      {open && (
        <div className="relative ml-4 pl-2.5 my-1 space-y-0.5 border-l border-sidebar-border/70">
          {children.map((child) => (
            <NavButton
              key={child.href}
              item={child}
              collapsed={false}
              depth={1}
              active={isNavItemActive(pathname, child.href)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
