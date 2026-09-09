"use client";

/**
 * Lightweight, dependency-free context menu.
 *
 * Rendered as a fixed-position panel anchored at a screen point. Closes on
 * outside-click, Escape, scroll, or window resize. Supports nested submenus
 * (one level — used for "Move to folder…"). Pure tokens, no portal needed
 * because it lives at the top of the screen's DOM via fixed positioning.
 */

import { ChevronRight } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";

export interface MenuItem {
  id: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  onSelect?: () => void;
  /** Render as a destructive (red) item. */
  danger?: boolean;
  /** A separator line above this item. */
  separator?: boolean;
  /** Submenu items; when present, hovering opens a nested panel. */
  submenu?: MenuItem[];
  disabled?: boolean;
  /** Trailing accessory (e.g. a swatch). */
  accessory?: ReactNode;
}

export interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

const MENU_WIDTH = 232;

function clampToViewport(x: number, y: number, height: number) {
  if (typeof window === "undefined") return { left: x, top: y };
  const left = Math.min(x, window.innerWidth - MENU_WIDTH - 8);
  const top = Math.min(y, window.innerHeight - height - 8);
  return { left: Math.max(8, left), top: Math.max(8, top) };
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const [openSub, setOpenSub] = useState<string | null>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  const pos = clampToViewport(x, y, items.length * 34 + 16);

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-[100] min-w-[232px] rounded-xl border border-border bg-card p-1 shadow-2xl"
      style={{ left: pos.left, top: pos.top, width: MENU_WIDTH }}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const hasSub = !!item.submenu?.length;
        return (
          <div key={item.id}>
            {item.separator && <div className="my-1 h-px bg-border" />}
            <button
              type="button"
              role="menuitem"
              disabled={item.disabled}
              aria-haspopup={hasSub || undefined}
              aria-expanded={hasSub ? openSub === item.id : undefined}
              onMouseEnter={() => setOpenSub(hasSub ? item.id : null)}
              onClick={() => {
                if (hasSub) {
                  setOpenSub((cur) => (cur === item.id ? null : item.id));
                  return;
                }
                item.onSelect?.();
                onClose();
              }}
              className={`relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
                item.disabled
                  ? "cursor-not-allowed text-muted-foreground/50"
                  : item.danger
                    ? "text-red-500 hover:bg-red-500/10"
                    : "text-foreground hover:bg-accent"
              }`}
            >
              {Icon && (
                <Icon
                  className={`h-4 w-4 shrink-0 ${item.danger ? "" : "text-muted-foreground"}`}
                />
              )}
              <span className="flex-1 truncate">{item.label}</span>
              {item.accessory}
              {hasSub && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}

              {hasSub && openSub === item.id && (
                <div
                  role="menu"
                  aria-label={item.label}
                  className="absolute left-full top-0 ml-1 max-h-72 min-w-[200px] overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-2xl"
                >
                  {item.submenu?.map((sub) => {
                    const SubIcon = sub.icon;
                    return (
                      <button
                        key={`${baseId}-${sub.id}`}
                        type="button"
                        role="menuitem"
                        disabled={sub.disabled}
                        onClick={(e) => {
                          e.stopPropagation();
                          sub.onSelect?.();
                          onClose();
                        }}
                        className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
                          sub.disabled
                            ? "cursor-not-allowed text-muted-foreground/50"
                            : "text-foreground hover:bg-accent"
                        }`}
                      >
                        {SubIcon && <SubIcon className="h-4 w-4 shrink-0 text-muted-foreground" />}
                        <span className="flex-1 truncate">{sub.label}</span>
                        {sub.accessory}
                      </button>
                    );
                  })}
                </div>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
