"use client";

import { forwardRef } from "react";
import { tv, type VariantProps } from "tailwind-variants";

const card = tv({
  base: "relative overflow-hidden",
  variants: {
    variant: {
      surface:
        "bg-[var(--atlas-surface)] border border-[var(--atlas-border)] rounded-[var(--atlas-radius-3)]",
      elevated:
        "bg-[var(--atlas-surface-raised)] border border-[var(--atlas-border)] rounded-[var(--atlas-radius-3)] shadow-[var(--atlas-shadow-3)]",
      outlined:
        "bg-transparent border border-[var(--atlas-border)] rounded-[var(--atlas-radius-3)]",
      interactive:
        "bg-[var(--atlas-surface)] border border-[var(--atlas-border)] rounded-[var(--atlas-radius-3)] hover:border-[var(--atlas-accent-border)] hover:shadow-[var(--atlas-shadow-2)] transition-[border-color,box-shadow,transform] cursor-pointer",
      glow: "bg-[var(--atlas-surface)] border border-[var(--atlas-accent-border)] rounded-[var(--atlas-radius-3)] shadow-[var(--atlas-glow-accent)]",
    },
    pad: {
      none: "",
      sm: "p-3",
      md: "p-4",
      lg: "p-5",
    },
  },
  defaultVariants: { variant: "surface", pad: "md" },
});

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof card> {}

export const AtlasCard = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, pad, ...props }, ref) => (
    <div ref={ref} className={card({ variant, pad, className })} {...props} />
  ),
);
AtlasCard.displayName = "AtlasCard";
