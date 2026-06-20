"use client";

import { motion } from "motion/react";
import { cn } from "@/shared/utils";
import { clamp, fmtPct } from "@/features/telecom/lib/format";

export function ProgressBar({
  value,
  max,
  color = "bg-primary",
  showLabel = true,
  height = "h-1.5",
}: {
  value: number;
  max: number;
  color?: string;
  showLabel?: boolean;
  height?: string;
}) {
  const pct = max > 0 ? clamp((value / max) * 100, 0, 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className={cn("flex-1 bg-muted rounded-full overflow-hidden", height)}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className={cn("h-full rounded-full", color)}
        />
      </div>
      {showLabel && (
        <span className="text-[10px] text-muted-foreground w-10 text-right tabular-nums">
          {fmtPct(pct)}
        </span>
      )}
    </div>
  );
}
