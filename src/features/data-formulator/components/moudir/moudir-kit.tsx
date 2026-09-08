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

export const MOUDIR = {
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

export const rise: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
};

export function useMotionOn(): boolean {
  return !useReducedMotion();
}

// ─── Backdrop ──────────────────────────────────────────────────────────────────

/**
 * Sits on the APP surface — never a dark slab. A faint var(--background) base
 * plus a soft coral radial glow and a hairline dot-grid that read on both light
 * and dark themes. The grid uses currentColor-ish foreground at very low alpha so
 * it follows the theme instead of a hardcoded cream tint.
 */
export function MoudirBackdrop({ lit = false }: { lit?: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden text-foreground">
      {/* Theme surface base (transparent-ish so the app shows through). */}
      <div className="absolute inset-0" style={{ background: "hsl(var(--background) / 0.4)" }} />
      {/* Soft coral overhead glow — Moudir's signal, equally subtle in both modes. */}
      <div
        className={cn(
          "absolute inset-0 transition-opacity duration-1000",
          lit ? "opacity-100" : "opacity-70",
        )}
        style={{
          background:
            "radial-gradient(110% 70% at 50% -15%, rgba(23, 162, 201,0.12), transparent 55%)",
        }}
      />
      {/* Hairline dot-grid keyed to the theme foreground (very low alpha). */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage: "radial-gradient(currentColor 1px, transparent 1px)",
          backgroundSize: "22px 22px",
          maskImage: "radial-gradient(120% 90% at 50% 0%, black, transparent 75%)",
          WebkitMaskImage: "radial-gradient(120% 90% at 50% 0%, black, transparent 75%)",
        }}
      />
    </div>
  );
}

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

export function Rule({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-border", className)} />;
}

/** A small warm "now working" indicator — three breathing dots, not a skeleton. */
export function ThinkingDots({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-bounce rounded-full"
          style={{
            background: MOUDIR.coral,
            animationDelay: `${i * 140}ms`,
            animationDuration: "900ms",
          }}
        />
      ))}
    </span>
  );
}

/** A warm pill (status / chips). Theme-aware neutral; fixed brand/status hues. */
export function Pill({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "coral" | "green" | "rose" | "gold";
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "border-border text-muted-foreground",
    coral: "border-[#17a2c9]/35 text-[#17a2c9]",
    green: "border-[#6bbf83]/45 text-[#5aa873] dark:text-[#6bbf83]",
    rose: "border-[#e06a55]/45 text-[#cf5743] dark:text-[#e06a55]",
    gold: "border-[#e8b64a]/45 text-[#b98a1f] dark:text-[#e8b64a]",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
