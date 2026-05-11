"use client";

import { Loader2 } from "lucide-react";
import { tv, type VariantProps } from "tailwind-variants";

const spinner = tv({
  base: "animate-spin text-[var(--atlas-text-muted)]",
  variants: {
    size: {
      sm: "w-3 h-3",
      md: "w-4 h-4",
      lg: "w-6 h-6",
    },
    tone: {
      neutral: "text-[var(--atlas-text-muted)]",
      accent: "text-[var(--atlas-accent-fg)]",
    },
  },
  defaultVariants: { size: "md", tone: "neutral" },
});

export interface SpinnerProps extends VariantProps<typeof spinner> {
  className?: string;
}

export function AtlasSpinner({ size, tone, className }: SpinnerProps) {
  return <Loader2 className={spinner({ size, tone, className })} />;
}
