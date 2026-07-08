"use client";

import { ExternalLink, type LucideIcon, MessageCircle, Table2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { useDataStore } from "@/core/stores/data-store";
import { useDesktopActions } from "@/features/desktop/store/desktop-store";

/**
 * Dock extras — three self-contained pieces the dock integration layer mounts:
 *
 *  - `useDockMagnify(ref)` — macOS "fisheye" magnification. Track the cursor over
 *    the dock container and return a per-index scale getter so each dock item can
 *    grow as the pointer approaches it and shrink as it moves away.
 *  - `<DockJumpList />` — a Windows-style right-click jump list anchored to a dock
 *    icon: the app's recent datasets (from `useDataStore`) plus a couple of quick
 *    actions (open the app, ask Moudir about it).
 *  - `<DockProgressRing />` — a circular progress ring + badge drawn around a dock
 *    icon, fed by the ephemeral `dockProgress` slice (`useDockProgress`).
 *
 * Everything is offline, French-first and uses the live glass palette tokens.
 */

// ─── 1) Magnify hook ────────────────────────────────────────────────────────────

/** Distance (px) past which a dock item is back to its resting size. */
const MAGNIFY_RANGE = 130;
/** Peak scale applied to the item directly under the cursor. */
const MAGNIFY_MAX = 1.55;

export interface DockMagnify {
  /** Per-item scale (1 at rest, up to `MAGNIFY_MAX` under the cursor). */
  scaleFor: (index: number) => number;
  /** Wire onto the dock container: tracks the cursor X. */
  onMouseMove: (e: React.MouseEvent) => void;
  /** Wire onto the dock container: resets all items to rest. */
  onMouseLeave: () => void;
  /** True while the pointer is over the dock (drives spring stiffness, etc.). */
  active: boolean;
}

/**
 * macOS fisheye magnify. Pass a ref to the dock's item row; the hook measures the
 * centre X of each child on every move and returns a scale getter keyed by the
 * child index. Scale falls off smoothly (cosine) with cursor distance.
 *
 * Usage:
 *   const rowRef = useRef<HTMLDivElement>(null);
 *   const { scaleFor, onMouseMove, onMouseLeave } = useDockMagnify(rowRef);
 *   <div ref={rowRef} onMouseMove={onMouseMove} onMouseLeave={onMouseLeave}>
 *     {items.map((it, i) => <motion.div animate={{ scale: scaleFor(i) }} … />)}
 *   </div>
 */
export function useDockMagnify(ref: RefObject<HTMLElement | null>): DockMagnify {
  const [cursorX, setCursorX] = useState<number | null>(null);
  // Cached child centre X positions, recomputed lazily on each move.
  const centersRef = useRef<number[]>([]);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) {
      centersRef.current = [];
      return;
    }
    const centers: number[] = [];
    for (const child of Array.from(el.children) as HTMLElement[]) {
      const r = child.getBoundingClientRect();
      centers.push(r.left + r.width / 2);
    }
    centersRef.current = centers;
  }, [ref]);

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      measure();
      setCursorX(e.clientX);
    },
    [measure],
  );

  const onMouseLeave = useCallback(() => setCursorX(null), []);

  const scaleFor = useCallback(
    (index: number) => {
      if (cursorX === null) return 1;
      const center = centersRef.current[index];
      if (center === undefined) return 1;
      const dist = Math.abs(cursorX - center);
      if (dist >= MAGNIFY_RANGE) return 1;
      // Cosine falloff: 1 at the edge of the range, MAGNIFY_MAX at the centre.
      const t = 1 - dist / MAGNIFY_RANGE;
      const eased = (1 - Math.cos(t * Math.PI)) / 2;
      return 1 + (MAGNIFY_MAX - 1) * eased;
    },
    [cursorX],
  );

  return { scaleFor, onMouseMove, onMouseLeave, active: cursorX !== null };
}

// ─── 2) Jump list ───────────────────────────────────────────────────────────────

interface JumpAction {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
}

/** How many recent datasets to surface in the jump list. */
const JUMP_RECENT_LIMIT = 6;

/**
 * Right-click "jump list" for a dock icon: the app's recent datasets plus quick
 * actions. Anchored above the dock at the given x; dismisses on outside click,
 * scroll, blur, resize or Escape (same affordances as the icon context menu).
 */
export function DockJumpList({
  app,
  open,
  onClose,
  anchor,
}: {
  /** The dock app this list belongs to (drives the title + quick actions). */
  app: { id: string; title: string };
  open: boolean;
  onClose: () => void;
  /** Screen-space anchor: the centre-x / top of the dock icon. */
  anchor: { x: number; y: number };
}) {
  const datasets = useDataStore((s) => s.datasets);
  const setActiveDataset = useDataStore((s) => s.setActiveDataset);
  const { openApp } = useDesktopActions();

  useEffect(() => {
    if (!open) return;
    const close = () => onClose();
    window.addEventListener("pointerdown", close);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onEsc);
    };
  }, [open, onClose]);

  if (!open) return null;

  // Most-recent datasets first (updatedAt desc), capped.
  const recent = [...datasets]
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
    .slice(0, JUMP_RECENT_LIMIT);

  const openDataset = (id: string) => {
    setActiveDataset(id);
    openApp(app.id);
    onClose();
  };

  const askMoudir = () => {
    openApp("moudir-chat");
    // Defer so the Moudir window is mounted before it receives the prompt.
    requestAnimationFrame(() => {
      window.dispatchEvent(
        new CustomEvent("moudir:ask", {
          detail: { prompt: `Analyse ${app.title.toLowerCase()} pour moi.` },
        }),
      );
    });
    onClose();
  };

  const actions: JumpAction[] = [
    {
      label: `Ouvrir ${app.title}`,
      icon: ExternalLink,
      onClick: () => {
        openApp(app.id);
        onClose();
      },
    },
    {
      label: "Demander à Moudir",
      icon: MessageCircle,
      onClick: askMoudir,
    },
  ];

  // Clamp horizontally so the panel stays on-screen; it grows upward from the dock.
  const PANEL_W = 256;
  const vw = typeof window !== "undefined" ? window.innerWidth : 9999;
  const left = Math.max(8, Math.min(anchor.x - PANEL_W / 2, vw - PANEL_W - 8));

  return (
    <AnimatePresence>
      <motion.div
        key="jumplist"
        initial={{ opacity: 0, y: 10, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.96 }}
        transition={{ type: "spring", stiffness: 460, damping: 30 }}
        // Bottom-anchored so the panel hovers just above the dock icon.
        style={{
          left,
          bottom: typeof window !== "undefined" ? window.innerHeight - anchor.y + 12 : 0,
          width: PANEL_W,
        }}
        className="fixed z-[var(--z-modal)] rounded-xl border border-border bg-popover/95 p-1.5 text-popover-foreground shadow-md backdrop-blur-xl supports-[backdrop-filter]:bg-popover/90"
        onContextMenu={(e) => e.preventDefault()}
        // Keep the global pointerdown dismiss from firing on our own clicks.
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="px-2.5 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {app.title}
        </div>

        {recent.length > 0 ? (
          <>
            <div className="px-2.5 pb-1 text-[10px] font-medium text-muted-foreground">Récents</div>
            {recent.map((ds) => (
              <button
                key={ds.id}
                type="button"
                onClick={() => openDataset(ds.id)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <Table2 className="size-3.5 shrink-0 opacity-70" />
                <span className="truncate">{ds.name}</span>
              </button>
            ))}
            <div className="my-1 h-px bg-border" />
          </>
        ) : (
          <div className="px-2.5 py-1.5 text-[12px] text-muted-foreground">
            Aucun jeu de données récent
          </div>
        )}

        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <button
              key={a.label}
              type="button"
              onClick={a.onClick}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <Icon className="size-3.5 shrink-0 opacity-70" />
              <span className="truncate">{a.label}</span>
            </button>
          );
        })}
      </motion.div>
    </AnimatePresence>
  );
}

// ─── 3) Progress ring ───────────────────────────────────────────────────────────

/**
 * A circular progress ring drawn around a dock icon, driven by the ephemeral
 * `dockProgress` slice. `value` is 0..1 for determinate progress, `-1` for an
 * indeterminate spinner, or `null`/`undefined` to render nothing.
 *
 * Mount it absolutely-positioned inside a dock icon wrapper:
 *   <span className="relative">
 *     …icon…
 *     <DockProgressRing value={useDockProgress()[app.id]} />
 *   </span>
 */
export function DockProgressRing({
  value,
  size = 52,
  stroke = 3,
}: {
  value: number | null | undefined;
  /** Outer diameter in px (default wraps a 44px dock tile). */
  size?: number;
  /** Ring thickness in px. */
  stroke?: number;
}) {
  if (value === null || value === undefined) return null;

  const indeterminate = value < 0;
  const clamped = indeterminate ? 0 : Math.max(0, Math.min(1, value));
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const dash = indeterminate ? circumference * 0.25 : circumference * clamped;
  const pct = Math.round(clamped * 100);

  return (
    <span className="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="absolute"
        style={{ transform: "rotate(-90deg)" }}
      >
        <title>Progression</title>
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--border)"
          strokeWidth={stroke}
        />
        {/* Progress arc */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          initial={false}
          animate={
            indeterminate ? { rotate: 360 } : { strokeDasharray: `${dash} ${circumference}` }
          }
          transition={
            indeterminate
              ? { repeat: Number.POSITIVE_INFINITY, duration: 1, ease: "linear" }
              : { type: "spring", stiffness: 200, damping: 28 }
          }
          style={indeterminate ? { transformOrigin: "center" } : undefined}
        />
      </svg>

      {/* Determinate percentage badge in the corner. */}
      {!indeterminate && (
        <span className="absolute -right-1 -top-1 grid h-4 min-w-[18px] place-items-center rounded-full bg-primary px-1 text-[9px] font-bold leading-none text-primary-foreground shadow">
          {pct}
        </span>
      )}
    </span>
  );
}
