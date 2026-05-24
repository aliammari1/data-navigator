"use client";

import { forwardRef } from "react";
import { tv, type VariantProps } from "tailwind-variants";
import type { AtlasSeverity } from "../tokens";

const chip = tv({
  base: "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-(--atlas-radius-pill) text-(--atlas-text-tiny) font-semibold uppercase tracking-wide border",
  variants: {
    severity: {
      info: "bg-(--atlas-info-soft) border-(--atlas-info-border) text-(--atlas-info-fg)",
      success:
        "bg-(--atlas-success-soft) border-(--atlas-success-border) text-(--atlas-success-fg)",
      warning:
        "bg-(--atlas-warning-soft) border-(--atlas-warning-border) text-(--atlas-warning-fg)",
      danger:
        "bg-(--atlas-danger-soft) border-(--atlas-danger-border) text-(--atlas-danger-fg)",
      accent:
        "bg-(--atlas-accent-soft) border-(--atlas-accent-border) text-(--atlas-accent-fg)",
      neutral:
        "bg-(--atlas-surface) border-(--atlas-border) text-(--atlas-text-muted)",
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
