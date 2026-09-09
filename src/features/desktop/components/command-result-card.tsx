"use client";

/**
 * A single Spotlight command row.
 *
 * Renders one {@link CommandResult} as a KRunner-style result: a tinted icon
 * chip, a title + optional muted subtitle, and a trailing kind-tag. It is a
 * pure presentational component — clicking/activating is owned by the Spotlight
 * integration, which calls `result.run()`; this card only exposes `onClick` and
 * an `active` highlight (for keyboard arrow navigation).
 *
 * Visual language matches the existing Spotlight surface: acrylic hover fill +
 * the `--win-accent` focus tint, so it drops into the suggestions popover
 * verbatim without redefining any chrome.
 */

import type { CommandKind, CommandResult } from "@/features/desktop/core/commands";
import { cn } from "@/shared/utils";

/** Default icon hue per command family, used when `result.hue` is absent. */
const KIND_HUE: Record<CommandKind, number> = {
  app: 28,
  moudir: 268,
  wallpaper: 36,
  palette: 286,
  math: 142,
  export: 18,
};

/** Trailing French tag shown on the right of each row. */
const KIND_TAG: Record<CommandKind, string> = {
  app: "Ouvrir",
  moudir: "IA",
  wallpaper: "Apparence",
  palette: "Apparence",
  math: "Calcul",
  export: "Rapport",
};

export interface CommandResultCardProps {
  result: CommandResult;
  /** Highlighted state (keyboard selection). */
  active?: boolean;
  /**
   * Optional click handler. When omitted the card invokes `result.run()`
   * directly so it works standalone; integrations typically pass their own
   * handler to also close the Spotlight.
   */
  onClick?: () => void;
  /** Hover handler so the integration can sync the active index with the mouse. */
  onMouseEnter?: () => void;
}

export function CommandResultCard({
  result,
  active = false,
  onClick,
  onMouseEnter,
}: CommandResultCardProps) {
  const Icon = result.icon;
  const hue = result.hue ?? KIND_HUE[result.kind];
  const tag = KIND_TAG[result.kind];

  return (
    <button
      type="button"
      data-active={active}
      onMouseEnter={onMouseEnter}
      onClick={() => (onClick ? onClick() : result.run())}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
        active ? "bg-[hsl(var(--win-accent))]/12" : "hover:bg-foreground/8",
      )}
    >
      <span
        className="grid size-8 shrink-0 place-items-center rounded-lg"
        style={{
          backgroundColor: `hsl(${hue} 60% 50% / 0.14)`,
          color: `hsl(${hue} 55% 45%)`,
        }}
      >
        <Icon className="size-4" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-foreground/90">{result.title}</span>
        {result.subtitle && (
          <span className="block truncate text-[11px] text-muted-foreground">
            {result.subtitle}
          </span>
        )}
      </span>

      <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{tag}</span>
    </button>
  );
}
