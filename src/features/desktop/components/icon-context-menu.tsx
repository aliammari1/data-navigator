"use client";

import { useEffect } from "react";

export interface ContextMenuState {
  x: number;
  y: number;
}

export interface MenuItem {
  label?: string;
  onClick?: () => void;
  separator?: boolean;
  danger?: boolean;
}

/**
 * A compact Windows-style context menu (acrylic surface, rounded, subtle border).
 * Dismisses on any outside click / scroll / escape. Used by desktop icons and
 * the canvas right-click menu.
 */
export function IconContextMenu({
  menu,
  onClose,
}: {
  menu: (ContextMenuState & { items: MenuItem[] }) | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!menu) return;
    const close = () => onClose();
    window.addEventListener("pointerdown", close);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onEsc);
    };
  }, [menu, onClose]);

  if (!menu) return null;
  const vw = typeof window !== "undefined" ? window.innerWidth : 9999;
  const vh = typeof window !== "undefined" ? window.innerHeight : 9999;
  const x = Math.min(menu.x, vw - 240);
  const y = Math.min(menu.y, vh - (menu.items.length * 34 + 16));

  return (
    <div
      style={{ left: x, top: y }}
      className="fixed z-[var(--z-modal)] min-w-52 rounded-lg border border-[var(--win-border)] bg-[var(--win-acrylic)] p-1 shadow-2xl backdrop-blur-xl"
      onContextMenu={(e) => e.preventDefault()}
      // stop the global pointerdown listener from closing before the click fires
      onPointerDown={(e) => e.stopPropagation()}
    >
      {menu.items.map((item, i) =>
        item.separator ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: static menu separators
          <div key={`sep-${i}`} className="my-1 h-px bg-[var(--win-border)]" />
        ) : (
          <button
            key={item.label}
            type="button"
            onClick={() => {
              item.onClick?.();
              onClose();
            }}
            className={`flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-foreground/10 ${
              item.danger ? "text-[#d13438]" : "text-foreground/85"
            }`}
          >
            {item.label}
          </button>
        ),
      )}
    </div>
  );
}
