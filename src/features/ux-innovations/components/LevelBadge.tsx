/**
 * Level pill — pure presentational, driven by the shared `LEVELS` table from
 * `../data/levels`. Extracted from the former monolith so it can be reused by
 * the header and any tab without re-declaring level metadata.
 */

"use client";

import { cn } from "@/shared/utils";
import { LEVELS, type LevelName } from "../data/levels";

interface LevelBadgeProps {
  level: LevelName;
  size?: "sm" | "md" | "lg";
}

const SIZE_CLASSES = {
  sm: "text-xs px-1.5 py-0.5 gap-1",
  md: "text-xs px-2 py-1 gap-1.5",
  lg: "text-sm px-3 py-1.5 gap-2",
} as const;

const TONE: Record<LevelName, string> = {
  Bronze: "border-amber-700/40 bg-amber-950/30",
  Silver: "border-slate-500/40 bg-slate-800/50",
  Gold: "border-yellow-600/40 bg-yellow-950/30",
  Platinum: "border-cyan-600/40 bg-cyan-950/30",
  Diamond: "border-violet-500/40 bg-violet-950/30",
};

export function LevelBadge({ level, size = "md" }: LevelBadgeProps) {
  const meta = LEVELS.find((l) => l.name === level) ?? LEVELS[0];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-semibold",
        SIZE_CLASSES[size],
        meta.color,
        TONE[level],
      )}
    >
      <Icon className={size === "sm" ? "size-3" : size === "lg" ? "size-5" : "size-3.5"} />
      {level}
    </span>
  );
}

export default LevelBadge;
