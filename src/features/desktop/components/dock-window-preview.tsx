"use client";

import { X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { type RefObject, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DesktopApp } from "@/features/desktop/core/app-registry";
import type { DesktopWindow } from "@/features/desktop/core/types";

/**
 * Uniform thumbnail box. Every cell shares this exact size; each window's live
 * clone is letterbox-contained inside it, so the row reads as one even strip —
 * exactly like the Windows 11 taskbar thumbnail flyout (cells never resize to
 * their own content; the contained image letterboxes instead).
 */
const BOX_W = 200;
const BOX_H = 118;

/*
 * Windows 11 renders this flyout as a dark *acrylic* surface that stays dark
 * regardless of the OS (and this app's) light/dark theme. These values are
 * therefore intentionally hardcoded rather than pulled from the app's semantic
 * tokens — they are an OS-skin replica, not an app surface.
 */
const PANEL_BG = "rgba(43, 44, 45, 0.82)";
const PANEL_BORDER = "rgba(255, 255, 255, 0.09)";
const PANEL_SHADOW = "0 8px 24px rgba(0,0,0,0.36), 0 2px 8px rgba(0,0,0,0.28)";
/** Neutral subtle-fill behind a hovered cell (NOT the titlebar close-red). */
const CELL_HOVER = "rgba(255,255,255,0.07)";
const TITLE_COLOR = "rgba(255,255,255,0.88)";
/** Recessed letterbox pane the clone sits inside; gutters show this shade. */
const THUMB_GUTTER = "rgba(0,0,0,0.22)";

type ThumbMode = "clone" | "placeholder" | "minimized";

/** App icon + title on a hue-tinted plate — used when no live clone is possible. */
function PlaceholderTile({ app, label }: { app: Pick<DesktopApp, "icon" | "hue">; label: string }) {
  const Icon = app.icon;
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-2"
      style={{
        background: `linear-gradient(150deg, hsl(${app.hue} 26% 11%) 0%, hsl(${app.hue} 18% 17%) 100%)`,
      }}
    >
      <div
        className="grid place-items-center rounded-xl"
        style={{
          width: 40,
          height: 40,
          background: `hsl(${app.hue} 48% 20%)`,
          boxShadow: `0 2px 12px hsl(${app.hue} 60% 30% / 0.4)`,
        }}
      >
        <Icon className="size-5" style={{ color: `hsl(${app.hue} 75% 66%)` }} />
      </div>
      <span
        className="max-w-[170px] truncate"
        style={{ fontSize: 10.5, color: "rgba(255,255,255,0.45)" }}
      >
        {label}
      </span>
    </div>
  );
}

/**
 * One Windows-11 thumbnail cell: a vertical stack of a HEADER ROW (app icon ·
 * window title · close ×) directly above the live thumbnail. The whole cell is
 * the click target (focuses the window); the × — shown only while the cell is
 * hovered, with a neutral hover state — closes it. A translucent rounded
 * highlight paints behind the entire cell on hover.
 */
function WindowCell({
  win,
  app,
  onClose,
  onFocus,
}: {
  win: DesktopWindow;
  app: Pick<DesktopApp, "title" | "icon" | "hue">;
  onClose: () => void;
  onFocus: () => void;
}) {
  // The clone host is ALWAYS mounted (hidden behind the placeholder when not in
  // "clone" mode) so this ref is stable across mode flips — otherwise the effect
  // both gates the host's existence (via setMode) and reads it, racing to a blank.
  const containerRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<ThumbMode>("clone");

  // Build a scaled, letterbox-contained live clone of the source window's DOM.
  // Falls back to a branded placeholder for minimized windows and for content
  // that can't be cloned (route/cross-origin iframes serialize blank).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = "";

    if (win.minimized) {
      setMode("minimized");
      return;
    }

    const el = document.querySelector(`[data-window-id="${win.id}"]`) as HTMLElement | null;
    const rect = el?.getBoundingClientRect();

    if (!el || !rect?.width || !rect.height || el.querySelector("iframe")) {
      setMode("placeholder");
      return;
    }

    // contain-fit: scale to fit inside the box, then centre (letterbox the rest).
    const scale = Math.min(BOX_W / rect.width, BOX_H / rect.height);
    const offsetX = (BOX_W - rect.width * scale) / 2;
    const offsetY = (BOX_H - rect.height * scale) / 2;

    const clone = el.cloneNode(true) as HTMLElement;
    Object.assign(clone.style, {
      position: "absolute",
      top: `${offsetY}px`,
      left: `${offsetX}px`,
      margin: "0",
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      transform: `scale(${scale})`,
      transformOrigin: "top left",
      pointerEvents: "none",
      userSelect: "none",
    });
    clone.setAttribute("aria-hidden", "true");

    // cloneNode copies <canvas> elements blank, so chart-heavy windows (ECharts
    // renders to canvas) would preview empty. Blit each live canvas's pixels onto
    // its clone — but only at the *displayed* thumbnail resolution (× scale), so a
    // multi-megapixel HiDPI chart canvas doesn't allocate full-res on every hover.
    const liveCanvases = el.querySelectorAll("canvas");
    const cloneCanvases = clone.querySelectorAll("canvas");
    liveCanvases.forEach((live, i) => {
      const dst = cloneCanvases[i] as HTMLCanvasElement | undefined;
      if (!dst || !live.width || !live.height) return;
      try {
        const bw = Math.max(1, Math.min(live.width, Math.round(live.width * scale)));
        const bh = Math.max(1, Math.min(live.height, Math.round(live.height * scale)));
        dst.width = bw;
        dst.height = bh;
        dst.getContext("2d")?.drawImage(live, 0, 0, bw, bh);
      } catch {
        // Unsupported/tainted source — leave this one canvas blank.
      }
    });

    container.appendChild(clone);
    setMode("clone");

    return () => {
      container.innerHTML = "";
    };
  }, [win.id, win.minimized]);

  const Icon = app.icon;

  return (
    <motion.div
      className="group/cell relative flex shrink-0 cursor-pointer flex-col"
      style={{ padding: 4, gap: 5 }}
      onClick={onFocus}
    >
      {/* Per-cell hover highlight — spans the header + thumbnail together. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-md opacity-0 transition-opacity duration-100 group-hover/cell:opacity-100"
        style={{ background: CELL_HOVER }}
      />

      {/* Header row: app icon · window title · close × (× fades in on cell hover). */}
      <div className="relative flex items-center gap-1.5 px-0.5" style={{ height: 22 }}>
        <Icon className="size-4 shrink-0" style={{ color: `hsl(${app.hue} 70% 62%)` }} />
        <span
          className="min-w-0 flex-1 truncate"
          style={{ fontSize: 12, lineHeight: 1, color: TITLE_COLOR }}
        >
          {win.title}
        </span>
        <button
          type="button"
          aria-label="Fermer la fenêtre"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="grid size-[18px] shrink-0 place-items-center rounded opacity-0 transition-[opacity,background-color] duration-100 group-hover/cell:opacity-100"
          style={{ color: "rgba(255,255,255,0.72)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.14)";
            e.currentTarget.style.color = "#fff";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "rgba(255,255,255,0.72)";
          }}
        >
          <X style={{ width: 11, height: 11 }} strokeWidth={2.4} />
        </button>
      </div>

      {/* Thumbnail pane: uniform box; clone host always mounted, placeholder overlaid. */}
      <div
        className="relative overflow-hidden"
        style={{ width: BOX_W, height: BOX_H, borderRadius: 4, background: THUMB_GUTTER }}
      >
        <div
          ref={containerRef}
          className="absolute inset-0"
          style={{ display: mode === "clone" ? "block" : "none" }}
        />
        {mode !== "clone" && (
          <PlaceholderTile app={app} label={mode === "minimized" ? "Réduite" : win.title} />
        )}
      </div>
    </motion.div>
  );
}

export interface DockWindowPreviewProps {
  app: Pick<DesktopApp, "title" | "icon" | "hue">;
  windows: DesktopWindow[];
  /** Ref to the span wrapper around the dock button — used to anchor the card. */
  anchorRef: RefObject<HTMLElement | null>;
  /**
   * Freeze the card in place. Set true once the cursor leaves the dock icon, so
   * the card stops chasing the icon as the magnify springs back — the close ×
   * stays exactly where the user is reaching for it.
   */
  frozen?: boolean;
  onPreviewEnter: () => void;
  onPreviewLeave: () => void;
  onCloseWindow: (id: string) => void;
  onFocusWindow: (id: string) => void;
}

/**
 * Windows-11-style hover preview flyout shown above a running dock icon: a dark
 * acrylic panel of live window thumbnails. Always dark regardless of theme
 * (matching the OS). Renders as a portal so it escapes the dock pill's
 * stacking/transform context.
 *
 * Position tracking: a RAF loop reads the anchor button's getBoundingClientRect()
 * every frame and mutates the outer wrapper's left/top directly — no React
 * re-renders. It tracks while the cursor is on the icon (so the card rides the
 * magnify spring), then `frozen` locks it the instant the cursor heads for the
 * card, so the thumbnails (and the close ×) hold still.
 *
 * Transform isolation: the outer wrapper owns the centering CSS transform
 * (translateX(-50%) translateY(-100%)). The inner motion.div owns only the
 * opacity/scale/y entrance animation (from a bottom-center origin), so Motion's
 * transform management never conflicts with the centering offset.
 */
export function DockWindowPreview({
  app,
  windows,
  anchorRef,
  frozen = false,
  onPreviewEnter,
  onPreviewLeave,
  onCloseWindow,
  onFocusWindow,
}: DockWindowPreviewProps) {
  // Outer div is positioned via RAF — never triggers React re-renders.
  const outerRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  // Keep the latest `frozen` in a ref so the long-lived RAF loop reads it without
  // re-subscribing; `hasPositioned` guarantees at least one placement even if the
  // card mounts already frozen.
  const frozenRef = useRef(frozen);
  frozenRef.current = frozen;
  const hasPositioned = useRef(false);

  useEffect(() => {
    let rafId: number;

    const tick = () => {
      if (!frozenRef.current || !hasPositioned.current) {
        const anchorEl = anchorRef.current;
        const btn = (anchorEl?.querySelector("button") ?? anchorEl) as HTMLElement | null;
        const rect = btn?.getBoundingClientRect();
        const outer = outerRef.current;
        if (rect && outer) {
          outer.style.left = `${rect.left + rect.width / 2}px`;
          // Align to the top of the (visually transformed) button with an 8px gap.
          outer.style.top = `${rect.top - 8}px`;
          hasPositioned.current = true;
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [anchorRef]);

  if (typeof document === "undefined") return null;

  // Crisp, damped Fluent motion (no spring overshoot); reduced-motion → fade only.
  const initial = reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.94 };
  const shown = reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 };
  const leave = reduce ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.96 };

  return createPortal(
    /*
     * Outer div: fixed positioning + centering transform only. No motion here —
     * Motion must not touch this element's transform or it would clobber the
     * translateX(-50%) translateY(-100%) centering offset.
     */
    <div
      ref={outerRef}
      className="pointer-events-none fixed"
      style={{
        // left/top updated each frame by the RAF loop above
        transform: "translateX(-50%) translateY(-100%)",
        zIndex: 99999,
      }}
    >
      {/*
       * Inner motion.div: entrance/exit animation only, scaling from a
       * bottom-center origin so it grows upward out of the dock icon.
       */}
      <motion.div
        initial={initial}
        animate={shown}
        exit={leave}
        transition={{ duration: 0.15, ease: [0, 0, 0, 1] }}
        onMouseEnter={onPreviewEnter}
        onMouseLeave={onPreviewLeave}
        className="pointer-events-auto"
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "row",
          gap: 8,
          alignItems: "flex-start",
          padding: 8,
          borderRadius: 8,
          background: PANEL_BG,
          border: `1px solid ${PANEL_BORDER}`,
          boxShadow: PANEL_SHADOW,
          backdropFilter: "blur(30px) saturate(1.25)",
          WebkitBackdropFilter: "blur(30px) saturate(1.25)",
          transformOrigin: "bottom center",
        }}
      >
        {windows.map((win) => (
          <WindowCell
            key={win.id}
            win={win}
            app={app}
            onClose={() => onCloseWindow(win.id)}
            onFocus={() => onFocusWindow(win.id)}
          />
        ))}

        {/*
         * Invisible hover bridge spanning the 8px gap down to the dock button, so a
         * diagonal cursor path icon → card never crosses an unhovered void. Kept
         * narrow and centred over the anchor so it can't steal hover/clicks from
         * neighbouring dock buttons.
         */}
        <span
          aria-hidden
          className="-translate-x-1/2 absolute top-full left-1/2"
          style={{ width: 80, height: 8 }}
        />
      </motion.div>
    </div>,
    document.body,
  );
}
