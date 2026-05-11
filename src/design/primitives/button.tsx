"use client";

import { forwardRef } from "react";
import { tv, type VariantProps } from "tailwind-variants";

const button = tv({
  base: "atlas-focus-ring inline-flex items-center justify-center gap-1.5 font-medium select-none whitespace-nowrap transition-[background-color,border-color,box-shadow,transform] duration-150 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]",
  variants: {
    variant: {
      solid:
        "bg-[var(--atlas-accent)] text-white hover:bg-[var(--atlas-accent-hover)] shadow-[var(--atlas-shadow-2)]",
      soft: "bg-[var(--atlas-accent-soft)] text-[var(--atlas-accent-fg)] hover:bg-[color:color-mix(in_oklch,var(--atlas-accent-soft),white_8%)]",
      outline:
        "border border-[var(--atlas-border)] text-[var(--atlas-text)] hover:border-[var(--atlas-accent-border)] hover:text-[var(--atlas-accent-fg)] bg-transparent",
      ghost:
        "text-[var(--atlas-text-muted)] hover:text-[var(--atlas-text)] hover:bg-[var(--atlas-surface)]",
      link: "text-[var(--atlas-accent-fg)] hover:underline underline-offset-4 px-0 py-0",
      danger:
        "bg-[var(--atlas-danger)] text-white hover:brightness-110 shadow-[var(--atlas-shadow-2)]",
    },
    size: {
      xs: "h-6 px-2 text-[11px] rounded-md",
      sm: "h-8 px-2.5 text-xs rounded-md",
      md: "h-9 px-3.5 text-sm rounded-lg",
      lg: "h-11 px-5 text-sm rounded-xl",
      icon: "h-8 w-8 text-sm rounded-md",
    },
    fullWidth: { true: "w-full" },
  },
  defaultVariants: { variant: "soft", size: "md" },
});

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {}

export const AtlasButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, fullWidth, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={button({ variant, size, fullWidth, className })}
      {...props}
    />
  ),
);
AtlasButton.displayName = "AtlasButton";
