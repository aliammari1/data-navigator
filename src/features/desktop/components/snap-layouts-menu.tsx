"use client";

/**
 * Windows-11-style "Snap layouts" flyout.
 *
 * A small popup grid of layout templates (full, halves, thirds, quarters).
 * Each template is drawn as a miniature of the viewport split into tiles; the
 * user clicks a single tile to place the active window into that slot. The menu
 * computes the real target rect for the clicked tile and hands it back via
 * `onPick`. Purely presentational + geometry — the window frame owns where it
 * anchors and what it does with the rect.
 */

import { motion } from "motion/react";

import { type SnapViewport } from "../core/snap";
import type { WindowRect } from "../core/types";

/** Fractional tile inside a unit (0..1) layout cell. */
interface UnitTile {
  fx: number;
  fy: number;
  fw: number;
  fh: number;
}

interface LayoutTemplate {
  id: string;
  /** Accessible French label. */
  label: string;
  /** Mini-preview grid columns (for CSS rendering). */
  cols: number;
  tiles: UnitTile[];
}

/** Windows-11 layout catalogue, expressed as unit fractions of the work area. */
const LAYOUTS: LayoutTemplate[] = [
  {
    id: "full",
    label: "Plein écran",
    cols: 1,
    tiles: [{ fx: 0, fy: 0, fw: 1, fh: 1 }],
  },
  {
    id: "halves",
    label: "Moitiés gauche / droite",
    cols: 2,
    tiles: [
      { fx: 0, fy: 0, fw: 0.5, fh: 1 },
      { fx: 0.5, fy: 0, fw: 0.5, fh: 1 },
    ],
  },
  {
    id: "thirds",
    label: "Trois colonnes",
    cols: 3,
    tiles: [
      { fx: 0, fy: 0, fw: 1 / 3, fh: 1 },
      { fx: 1 / 3, fy: 0, fw: 1 / 3, fh: 1 },
      { fx: 2 / 3, fy: 0, fw: 1 / 3, fh: 1 },
    ],
  },
  {
    id: "third-two-thirds",
    label: "Tiers / deux tiers",
    cols: 3,
    tiles: [
      { fx: 0, fy: 0, fw: 1 / 3, fh: 1 },
      { fx: 1 / 3, fy: 0, fw: 2 / 3, fh: 1 },
    ],
  },
  {
    id: "quarters",
    label: "Quatre quadrants",
    cols: 2,
    tiles: [
      { fx: 0, fy: 0, fw: 0.5, fh: 0.5 },
      { fx: 0.5, fy: 0, fw: 0.5, fh: 0.5 },
      { fx: 0, fy: 0.5, fw: 0.5, fh: 0.5 },
      { fx: 0.5, fy: 0.5, fw: 0.5, fh: 0.5 },
    ],
  },
];

/** Resolve a unit tile into a viewport-pixel rect, honouring viewport insets. */
function tileToRect(tile: UnitTile, viewport: SnapViewport): WindowRect {
  const top = viewport.top ?? 0;
  const bottom = viewport.bottom ?? 0;
  const left = viewport.left ?? 0;
  const right = viewport.right ?? 0;
  const boxW = Math.max(0, viewport.width - left - right);
  const boxH = Math.max(0, viewport.height - top - bottom);
  return {
    x: Math.round(left + tile.fx * boxW),
    y: Math.round(top + tile.fy * boxH),
    w: Math.round(tile.fw * boxW),
    h: Math.round(tile.fh * boxH),
  };
}

export interface SnapLayoutsMenuProps {
  /** Viewport used to resolve a picked tile into a real rect. */
  viewport: SnapViewport;
  /** Called with the target rect when the user picks a layout tile. */
  onPick: (rect: WindowRect) => void;
  /** Optional className for the anchoring wrapper. */
  className?: string;
}

/**
 * The flyout itself. Render it positioned by the caller (e.g. anchored under a
 * maximize button). Each template shows a clickable mini-grid; clicking a tile
 * resolves and emits its rect.
 */
export function SnapLayoutsMenu({ viewport, onPick, className }: SnapLayoutsMenuProps) {
  return (
    <motion.div
      role="menu"
      aria-label="Dispositions d'ancrage"
      initial={{ opacity: 0, y: -6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.97 }}
      transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      className={`fixed z-[var(--z-modal)] grid grid-cols-2 gap-2.5 rounded-2xl border p-3 shadow-2xl ${className ?? ""}`}
      style={{
        background: "var(--glass-bg-strong)",
        borderColor: "var(--glass-border)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        boxShadow: "var(--glass-shadow), inset 0 1px 0 var(--glass-hairline)",
      }}
    >
      {LAYOUTS.map((layout) => (
        <div key={layout.id} className="flex flex-col gap-1.5" style={{ width: 112 }}>
          <div
            role="group"
            aria-label={layout.label}
            className="relative h-16 w-full overflow-hidden rounded-xl border"
            style={{
              borderColor: "var(--glass-hairline)",
              background: "var(--glass-bg)",
            }}
          >
            {layout.tiles.map((tile, i) => {
              const rect = tileToRect(tile, viewport);
              return (
                <button
                  key={`${layout.id}-${tile.fx}-${tile.fy}-${tile.fw}-${tile.fh}`}
                  type="button"
                  role="menuitem"
                  aria-label={`${layout.label} — emplacement ${i + 1}`}
                  onClick={() => onPick(rect)}
                  className="group absolute rounded-md border transition-colors"
                  style={{
                    left: `calc(${tile.fx * 100}% + 2px)`,
                    top: `calc(${tile.fy * 100}% + 2px)`,
                    width: `calc(${tile.fw * 100}% - 4px)`,
                    height: `calc(${tile.fh * 100}% - 4px)`,
                    borderColor: "var(--glass-border)",
                    background: "var(--glass-bg-strong)",
                  }}
                >
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-md opacity-0 transition-opacity group-hover:opacity-100"
                    style={{ background: "hsl(var(--glass-accent) / 0.35)" }}
                  />
                </button>
              );
            })}
          </div>
          <span
            className="truncate text-center text-[10px]"
            style={{ color: "var(--glass-text-dim)" }}
            title={layout.label}
          >
            {layout.label}
          </span>
        </div>
      ))}
    </motion.div>
  );
}
