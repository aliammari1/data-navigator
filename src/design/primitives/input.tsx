"use client";

import { forwardRef } from "react";
import { tv, type VariantProps } from "tailwind-variants";

const input = tv({
  base: "atlas-focus-ring w-full bg-(--atlas-surface) border border-(--atlas-border) text-(--atlas-text) placeholder:text-(--atlas-text-subtle) outline-none transition-colors hover:border-(--atlas-border-strong) focus:border-(--atlas-accent-border)",
  variants: {
    size: {
      sm: "h-7 px-2 text-xs rounded-md",
      md: "h-9 px-3 text-sm rounded-lg",
      lg: "h-11 px-4 text-sm rounded-xl",
    },
    invalid: {
      true: "border-(--atlas-danger-border) focus:border-(--atlas-danger)",
    },
  },
  defaultVariants: { size: "md" },
});

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">,
    VariantProps<typeof input> {}

export const AtlasInput = forwardRef<HTMLInputElement, InputProps>(
  ({ className, size, invalid, ...props }, ref) => (
    <input
      ref={ref}
      className={input({ size, invalid, className })}
      {...props}
    />
  ),
);
AtlasInput.displayName = "AtlasInput";

export const AtlasTextarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={`atlas-focus-ring w-full bg-(--atlas-surface) border border-(--atlas-border) text-(--atlas-text) placeholder:text-(--atlas-text-subtle) outline-none rounded-lg px-3 py-2 text-sm hover:border-(--atlas-border-strong) focus:border-(--atlas-accent-border) resize-y ${className ?? ""}`}
    {...props}
  />
));
AtlasTextarea.displayName = "AtlasTextarea";
