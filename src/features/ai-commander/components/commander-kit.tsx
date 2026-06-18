"use client";

/**
 * AI Commander — design kit (theme-aware).
 *
 * The Commander is the desktop's pilot: an OS-native assistant, distinct from
 * Moudir (the data-analyst studio). It carries its own signal — a warm green that
 * matches its window-frame icon tint and its `hue: 152` in the app registry — and
 * resolves all surfaces/text through the shared design tokens so it reads well in
 * both the warm-cream light theme and the navy dark theme. No dark-SaaS slab.
 */

import { Bot } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/** The Commander's one signal: a warm green (matches the window-frame icon tint). */
export const CMD_ACCENT = "#2f9d6a";
export const CMD_ACCENT_LIGHT = "#5ec98a";
const CMD_RGB = "47,157,106";

/** Build an `rgba()` string from the accent at the given alpha (0–1). */
export const cmdAlpha = (a: number): string => `rgba(${CMD_RGB},${a})`;

/**
 * Ambient surface — sits on the app background, never a dark slab. A faint green
 * overhead glow plus a hairline dot-grid keyed to the theme foreground (very low
 * alpha) so it follows light/dark instead of a hardcoded tint. `lit` brightens
 * the glow while the Commander is listening or thinking.
 */
export function CommanderBackdrop({ lit = false }: { lit?: boolean }) {
  const motionOn = !useReducedMotion();
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden text-foreground">
      <div className="absolute inset-0" style={{ background: "hsl(var(--background) / 0.4)" }} />
      <div
        className={cn(
          "absolute inset-0",
          motionOn && "transition-opacity duration-1000",
          lit ? "opacity-100" : "opacity-70",
        )}
        style={{
          background: `radial-gradient(110% 70% at 50% -15%, ${cmdAlpha(0.13)}, transparent 55%)`,
        }}
      />
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

/** The Commander's mark — a Bot glyph in a green squircle. Pulses while thinking. */
export function CommanderGlyph({
  size = 40,
  thinking = false,
  className,
}: {
  size?: number;
  thinking?: boolean;
  className?: string;
}) {
  const motionOn = !useReducedMotion();
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-2xl text-white shadow-sm",
        className,
      )}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${CMD_ACCENT_LIGHT}, ${CMD_ACCENT})`,
      }}
    >
      {thinking && motionOn && (
        <span
          className="absolute inset-0 animate-ping rounded-2xl"
          style={{ boxShadow: `inset 0 0 0 1px ${cmdAlpha(0.5)}` }}
        />
      )}
      <Bot className="relative" size={Math.round(size * 0.5)} strokeWidth={2} aria-hidden />
    </span>
  );
}

/** Three breathing green dots — the "thinking" indicator. Falls back to static
 *  dots when the user prefers reduced motion. */
export function ThinkingDots({ className }: { className?: string }) {
  const motionOn = !useReducedMotion();
  return (
    <span className={cn("inline-flex items-center gap-1", className)} aria-hidden>
      {["a", "b", "c"].map((k, i) => (
        <span
          key={k}
          className={cn("h-1.5 w-1.5 rounded-full", motionOn && "animate-bounce")}
          style={{
            background: CMD_ACCENT,
            animationDelay: motionOn ? `${i * 140}ms` : undefined,
            animationDuration: motionOn ? "900ms" : undefined,
          }}
        />
      ))}
    </span>
  );
}
