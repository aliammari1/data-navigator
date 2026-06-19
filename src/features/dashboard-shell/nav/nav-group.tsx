"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NavButton } from "@/features/dashboard-shell/nav/nav-button";
import { isNavItemActive, type NavItem } from "@/features/dashboard-shell/nav/nav-config";
import { cn } from "@/lib/utils";

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
              "group flex items-center justify-center rounded-lg border-l-2 px-3 py-1.5 transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-sidebar",
              groupActive
                ? "border-primary bg-primary/10 text-foreground"
                : "border-transparent text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
            )}
          >
            <Icon
              className={cn(
                "size-4 flex-none",
                groupActive ? "text-primary" : "text-muted-foreground/70",
              )}
            />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">{item.title}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-lg border-l-2 transition-colors",
          groupActive
            ? "border-primary text-foreground"
            : "border-transparent text-muted-foreground",
        )}
      >
        <Link
          href={item.href}
          aria-current={hubActive ? "page" : undefined}
          className={cn(
            "flex flex-1 items-center gap-2.5 py-1.5 pl-3 text-sm transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded-lg",
            "hover:text-foreground",
          )}
        >
          <Icon
            className={cn(
              "size-4 flex-none shrink-0",
              groupActive ? "text-primary" : "text-muted-foreground/70 group-hover:text-foreground",
            )}
          />
          <span className="flex-1 truncate text-left">{item.title}</span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? `Réduire ${item.title}` : `Développer ${item.title}`}
          className="mr-1 flex size-6 flex-none items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronDown
            className={cn("size-3.5 transition-transform duration-150", open && "rotate-180")}
          />
        </button>
      </div>
      {open && (
        <div className="mt-px space-y-px">
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
