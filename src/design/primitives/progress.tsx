"use client";

interface ProgressProps {
  value: number; // 0-100
  className?: string;
  tone?: "accent" | "success" | "warning" | "danger";
}

const toneFill: Record<NonNullable<ProgressProps["tone"]>, string> = {
  accent: "bg-(--atlas-accent)",
  success: "bg-(--atlas-success)",
  warning: "bg-(--atlas-warning)",
  danger: "bg-(--atlas-danger)",
};

export function AtlasProgress({
  value,
  className,
  tone = "accent",
}: ProgressProps) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      className={`relative h-1.5 w-full overflow-hidden rounded-(--atlas-radius-pill) bg-(--atlas-surface) border border-(--atlas-border) ${className ?? ""}`}
      role="progressbar"
      aria-valuenow={v}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full ${toneFill[tone]} transition-[width] duration-(--atlas-dur-3) ease-(--atlas-ease-soft)`}
        style={{ width: `${v}%` }}
      />
    </div>
  );
}
