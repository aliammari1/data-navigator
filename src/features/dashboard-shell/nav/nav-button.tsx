"use client";

import Link from "next/link";
import { memo } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { NavBadgeTone, NavItem } from "@/features/dashboard-shell/nav/nav-config";
import { cn } from "@/shared/utils";

const BADGE_TONE: Record<NavBadgeTone, string> = {
  live: "bg-[color-mix(in_oklab,var(--negative)_18%,transparent)] text-negative",
  ai: "bg-[color-mix(in_oklab,var(--ai)_18%,transparent)] text-ai",
  info: "bg-muted text-muted-foreground",
};

/**
 * Memoized navigation leaf button.
 *
 * Active state is computed ONCE in the parent (`AppSidebar`) and passed as a
 * boolean, so buttons no longer each call `usePathname()`. v2: fully tokenized
 * (no teal hardcodes), `focus-visible` ring on every link, and the collapsed
 * tooltip uses the Radix primitive so it appears on KEYBOARD focus too (the old
 * hover-only div was invisible to keyboard users).
 */
export const NavButton = memo(function NavButton({
  item,
  collapsed,
  depth = 0,
  active,
}: {
  item: NavItem;
  collapsed: boolean;
  /** 1 when rendered as a group child (adds indent). */
  depth?: number;
  active: boolean;
}) {
  const Icon = item.icon;

  const link = (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-2.5 rounded-lg border-l-2 py-1.5 text-sm transition-colors duration-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-sidebar",
        collapsed ? "justify-center px-3" : "pr-2 pl-3",
        depth > 0 && !collapsed && "ml-3 pl-2.5",
        active
          ? "border-primary bg-primary/10 text-foreground"
          : "border-transparent text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
      )}
    >
      <Icon
        className={cn(
          "size-4 flex-none shrink-0 transition-colors",
          active ? "text-primary" : "text-muted-foreground/70 group-hover:text-foreground",
        )}
      />
      {!collapsed && (
        <>
          <span className="flex-1 truncate text-left">{item.title}</span>
          {item.badge && (
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none",
                BADGE_TONE[item.badgeTone ?? "info"],
              )}
            >
              {item.badge}
            </span>
          )}
        </>
      )}
    </Link>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" className="flex items-center gap-2">
        <span>{item.title}</span>
        {item.badge && <span className="text-[10px] opacity-70">{item.badge}</span>}
      </TooltipContent>
    </Tooltip>
  );
});
