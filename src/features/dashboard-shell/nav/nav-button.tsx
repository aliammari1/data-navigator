"use client";

import { Lock } from "lucide-react";
import Link from "next/link";
import { memo } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NAV_BADGE_TONE_CLASSES, type NavItem } from "@/features/dashboard-shell/nav/nav-config";
import { cn } from "@/shared/utils";

/**
 * Memoized navigation leaf button.
 *
 * Active state is computed ONCE in the parent (`AppSidebar`) and passed as a
 * boolean, so buttons no longer each call `usePathname()`. v2: fully tokenized
 * (no teal hardcodes), `focus-visible` ring on every link, and the collapsed
 * tooltip uses the Radix primitive so it appears on KEYBOARD focus too (the old
 * hover-only div was invisible to keyboard users).
 *
 * Locked state (`item.locked === true`): renders with a lock icon, `aria-disabled="true"`
 * (focusable, not activatable — Mews "Availability States"), and a tooltip explaining
 * the missing permission. The link is replaced by a non-navigating span so screen
 * readers announce the disabled state correctly.
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
  const locked = item.locked === true;

  const inner = (
    <>
      <Icon
        className={cn(
          "size-4 flex-none shrink-0 transition-transform duration-150 group-hover:scale-105",
          active
            ? "text-primary"
            : locked
              ? "text-muted-foreground/40"
              : "text-muted-foreground/75 group-hover:text-foreground",
          depth > 0 && "size-3.5",
        )}
      />
      {!collapsed && (
        <>
          <span className="flex-1 truncate text-left">{item.title}</span>
          {locked ? (
            <Lock className="size-3 flex-none text-muted-foreground/50" aria-hidden="true" />
          ) : item.badge ? (
            <span
              className={cn(
                "rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase leading-none shadow-xs",
                NAV_BADGE_TONE_CLASSES[item.badgeTone ?? "info"],
              )}
            >
              {item.badge}
            </span>
          ) : null}
        </>
      )}
    </>
  );

  const className = cn(
    "group relative flex items-center gap-2.5 rounded-xl text-sm font-medium transition-all duration-150",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-sidebar",
    collapsed
      ? "size-9 mx-auto justify-center px-0"
      : depth > 0
        ? "px-2.5 py-1.5 text-[13px]"
        : "px-3 py-2",
    locked
      ? "cursor-not-allowed text-muted-foreground/40"
      : active
        ? "bg-primary/12 text-primary font-semibold shadow-xs ring-1 ring-primary/20"
        : "text-muted-foreground/80 hover:bg-accent/60 hover:text-foreground active:scale-[0.99]",
  );

  const content = locked ? (
    <span
      aria-disabled="true"
      role="link"
      className={className}
      data-locked-reason={item.requiredPermission ?? "permission"}
    >
      {inner}
    </span>
  ) : (
    <Link href={item.href} aria-current={active ? "page" : undefined} className={className}>
      {inner}
    </Link>
  );

  if (!collapsed) {
    return locked ? (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="right">
          {`Ask the host to grant "${item.requiredPermission ?? "this"}" access`}
        </TooltipContent>
      </Tooltip>
    ) : (
      content
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent side="right" className="flex items-center gap-2">
        <span>{item.title}</span>
        {locked ? (
          <Lock className="size-3" aria-hidden="true" />
        ) : item.badge ? (
          <span className="text-[10px] opacity-70">{item.badge}</span>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
});
