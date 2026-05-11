"use client";

import { forwardRef } from "react";
import { tv, type VariantProps } from "tailwind-variants";
import type { AtlasSeverity } from "../tokens";

const chip = tv({
  base: "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[var(--atlas-radius-pill)] text-[var(--atlas-text-tiny)] font-semibold uppercase tracking-wide border",
  variants: {
    severity: {
      info: "bg-[var(--atlas-info-soft)] border-[var(--atlas-info-border)] text-[var(--atlas-info-fg)]",
      success:
        "bg-[var(--atlas-success-soft)] border-[var(--atlas-success-border)] text-[var(--atlas-success-fg)]",
      warning:
        "bg-[var(--atlas-warning-soft)] border-[var(--atlas-warning-border)] text-[var(--atlas-warning-fg)]",
      danger:
        "bg-[var(--atlas-danger-soft)] border-[var(--atlas-danger-border)] text-[var(--atlas-danger-fg)]",
      accent:
        "bg-[var(--atlas-accent-soft)] border-[var(--atlas-accent-border)] text-[var(--atlas-accent-fg)]",
      neutral:
        "bg-[var(--atlas-surface)] border-[var(--atlas-border)] text-[var(--atlas-text-muted)]",
    },
    size: {
      sm: "text-[10px] px-1.5 py-0",
      md: "text-[11px] px-2 py-0.5",
      lg: "text-xs px-2.5 py-1",
    },
  },
  defaultVariants: { severity: "neutral", size: "md" },
});

export interface ChipProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children">,
    VariantProps<typeof chip> {
  children: React.ReactNode;
}

export const AtlasChip = forwardRef<HTMLSpanElement, ChipProps>(
  ({ className, severity, size, children, ...props }, ref) => (
    <span ref={ref} className={chip({ severity, size, className })} {...props}>
      {children}
    </span>
  ),
);
AtlasChip.displayName = "AtlasChip";

export type { AtlasSeverity };
