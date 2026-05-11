"use client";

interface ProgressProps {
  value: number; // 0-100
  className?: string;
  tone?: "accent" | "success" | "warning" | "danger";
}

const toneFill: Record<NonNullable<ProgressProps["tone"]>, string> = {
  accent: "bg-[var(--atlas-accent)]",
  success: "bg-[var(--atlas-success)]",
  warning: "bg-[var(--atlas-warning)]",
  danger: "bg-[var(--atlas-danger)]",
};

export function AtlasProgress({
  value,
  className,
  tone = "accent",
}: ProgressProps) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      className={`relative h-1.5 w-full overflow-hidden rounded-[var(--atlas-radius-pill)] bg-[var(--atlas-surface)] border border-[var(--atlas-border)] ${className ?? ""}`}
      role="progressbar"
      aria-valuenow={v}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full ${toneFill[tone]} transition-[width] duration-[var(--atlas-dur-3)] ease-[var(--atlas-ease-soft)]`}
        style={{ width: `${v}%` }}
      />
    </div>
  );
}
