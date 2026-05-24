"use client";

import { forwardRef } from "react";
import { tv, type VariantProps } from "tailwind-variants";

const card = tv({
  base: "relative overflow-hidden",
  variants: {
    variant: {
      surface:
        "bg-(--atlas-surface) border border-(--atlas-border) rounded-(--atlas-radius-3)",
      elevated:
        "bg-(--atlas-surface-raised) border border-(--atlas-border) rounded-(--atlas-radius-3) shadow-(--atlas-shadow-3)",
      outlined:
        "bg-transparent border border-(--atlas-border) rounded-(--atlas-radius-3)",
      interactive:
        "bg-(--atlas-surface) border border-(--atlas-border) rounded-(--atlas-radius-3) hover:border-(--atlas-accent-border) hover:shadow-(--atlas-shadow-2) transition-[border-color,box-shadow,transform] cursor-pointer",
      glow: "bg-(--atlas-surface) border border-(--atlas-accent-border) rounded-(--atlas-radius-3) shadow-(--atlas-glow-accent)",
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
