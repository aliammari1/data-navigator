"use client";

/**
 * Moudir — design kit (theme-aware).
 *
 * A deliberate break from generic dark-SaaS AI slop. The reference is a sharp,
 * crafted analyst workspace — opinionated, honest about what it does. This is NOT
 * a dashboard of neon cards and shimmer loaders — it's a workspace you talk to.
 *
 * IMPORTANT: Moudir follows the APP theme and shares ONE accent with the rest of
 * the app — Signal Cyan, the same primary the telecom pages use — so the product
 * reads as a single app, not page-by-page color drift. It must read well in BOTH
 * light and dark mode (the user toggles theme), so surfaces and text resolve to
 * the shared design tokens (--background / --foreground / --card /
 * --muted-foreground / --border) and the glass tokens (--glass-*). The only fixed
 * signal is the Signal-Cyan brand accent + the M mark; status hues (gold/green/
 * rose) stay fixed so meaning is stable across themes.
 *
 * Visual grammar:
 *   - Sits on the app surface (transparent / var(--background)); a soft cyan
 *     radial glow + faint dot-grid that read on light AND dark — never a dark slab.
 *   - ONE Signal-Cyan accent (shared with telecom). Status uses emerald/amber/rose.
 *   - Bold editorial type; whitespace and hairlines carry structure, not boxes.
 *   - Moudir has an identity: the letter M (m, for "moudir" = "director").
 *   - Motion is restrained and reduced-motion aware.
 *
 * NOTE: the brand token is still keyed `MOUDIR.coral` for call-site stability
 * across the kit; its value is now Signal Cyan. Treat the key as "the accent".
 */

import {
  Activity,
  AlertTriangle,
  BarChart3,
  Database,
  type LucideIcon,
  PenLine,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useReducedMotion, type Variants } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/shared/utils";

// ─── Palette ─────────────────────────────────────────────────────────────────
// Surfaces/text are THEME-AWARE: they resolve to the app design tokens so Moudir
// looks right in light and dark mode. Brand + status hues stay FIXED 6-digit hex
// (downstream code concatenates hex-alpha, e.g. `${MOUDIR.coral}1f`).

const MOUDIR = {
  // Theme-aware surfaces / text (CSS values — usable in style={{ ... }}).
  /** App surface; transparent so the shared background shows through. */
  canvas: "transparent",
  /** Frosted panel surface (warm glass, theme-aware). */
  panel: "var(--glass-bg-strong)",
  /** Primary text. */
  ink: "hsl(var(--foreground))",
  /** Secondary / body text. */
  body: "hsl(var(--muted-foreground))",
  /** Tertiary / muted text. */
  muted: "hsl(var(--muted-foreground))",

  // Fixed brand + status hues (stable across themes).
  /** Moudir's ONE brand signal. */
  coral: "#17a2c9",
  /** Running / warming. */
  gold: "#e8b64a",
  /** Done / accepted. */
  green: "#6bbf83",
  /** Failed / rejected. */
  rose: "#e06a55",
} as const;

// ─── Motion ────────────────────────────────────────────────────────────────────

export const EASE = [0.16, 1, 0.3, 1] as const;

export function useMotionOn(): boolean {
  return !useReducedMotion();
}

// ─── Backdrop ──────────────────────────────────────────────────────────────────

// ─── Identity ──────────────────────────────────────────────────────────────────

/** Moudir's mark: the letter M in a warm coral chip. */
export function MoudirMark({
  size = 36,
  thinking = false,
  className,
}: {
  size?: number;
  thinking?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-2xl",
        className,
      )}
      style={{
        width: size,
        height: size,
        background: "rgba(23, 162, 201,0.12)",
        boxShadow: "inset 0 0 0 1px rgba(23, 162, 201,0.35)",
      }}
    >
      {thinking && (
        <span
          className="absolute inset-0 animate-ping rounded-2xl"
          style={{ boxShadow: "inset 0 0 0 1px rgba(23, 162, 201,0.4)" }}
        />
      )}
      <span
        className="relative font-semibold leading-none"
        style={{
          color: MOUDIR.coral,
          fontSize: size * 0.5,
          // Latin glyph — Moudir = "director" (M is the brand mark).
          fontFamily: "'Geist', system-ui, 'Segoe UI', sans-serif",
          letterSpacing: size * 0.01,
        }}
      >
        M
      </span>
    </span>
  );
}

// ─── Primitives ────────────────────────────────────────────────────────────────

export function Kicker({
  children,
  className,
  tone = "muted",
}: {
  children: ReactNode;
  className?: string;
  tone?: "muted" | "coral";
}) {
  return (
    <span
      className={cn(
        "font-mono text-[11px] uppercase tracking-[0.2em]",
        tone === "coral" ? "text-[#17a2c9]" : "text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}
